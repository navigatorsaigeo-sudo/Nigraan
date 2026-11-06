#!/usr/bin/env python3
"""v91.17.103 · model gate resolver. v91.17.283 WS4: evidence-derived per-level product type / canAlert (heat, cold), client_rules (owner decision B).

Reads data/model-gate.json (authoritative, hand-maintained) and writes:
  data/model-gate.resolved.json  full entries + resolved status, canAlert and why (operator, server)
  build/gen/gate.slim.json       the slim gate (no sources: supplier names stay out of the page)
  data/model-gate.slim.json      the same slim gate, served to the page and the engine hosts as GET /api/registry/gate

Rules (agreed for v103):
  * each class has required fields; a missing one demotes the entry to experimental (and says which field)
  * reference -> status reference; experimental -> experimental; convention needs maps + label
  * status propagates upstream: an entry with an experimental severity dependency is experimental;
    with a provisional one it is at most provisional
  * diagnostic components (role 'diagnostic') carry weight zero: the page marks their registry entries superseded and the
    live-registry perturbation check must show the score does not move
  * canAlert = class allows alerts AND resolved status is operational
  * every map layer (page picker + server catalogue) must belong to exactly one entry, or the build fails
Exit code 1 on any structural failure.
"""
import csv, hashlib, json, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = lambda *a: os.path.join(ROOT, *a)
RANK = {"operational": 0, "provisional": 1, "reference": 2, "experimental": 3}


def present(v):
    return v is not None and v != "" and v != [] and v != {}


def map_layers():
    # v91.17.279: the base page is not shipped in the server tree; the built page carries the same picker
    bp = P('build', 'base', 'AI_GEO_NIGRAAN_v91_17_BASE80.html')
    base = open(bp if os.path.exists(bp) else P('artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), encoding='utf-8').read()
    i = base.index('id="mapHazardPick"'); j = base.index('</select>', i)
    page = re.findall(r'<option[^>]*value="([^"]*)"', base[i:j])
    ml = open(P('server', 'api', 'maplayers.mjs'), encoding='utf-8').read()
    k = ml.index('const LAYERS'); kk = ml.index('];', k)
    srv = re.findall(r"\['([a-z]+:[A-Za-z0-9_]+)'", ml[k:kk])
    return page, srv


LEVELS = ['Moderate', 'High', 'Severe']   # the levels that can raise an alert (Normal and Low never do)


def sha_of(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def evidence_lines():
    """v91.17.283 WS4 · the client sentences with numbers (data/skill-evidence.json, scripts/gen/gen_evidence.py); its evidence hashes must be the files in the tree"""
    f = P('data', 'skill-evidence.json')
    if not os.path.exists(f):
        return None, 'data/skill-evidence.json missing (scripts/gen/gen_evidence.py)'
    E = json.load(open(f, encoding='utf-8'))
    for rp, h in (E.get('evidence') or {}).items():
        if not os.path.exists(P(*rp.split('/'))) or sha_of(P(*rp.split('/'))) != h:
            return None, 'data/skill-evidence.json was generated from a different ' + rp + ' (regenerate with scripts/gen/gen_evidence.py)'
    return E.get('lines') or {}, None


def evaluate_evidence(e):
    """v91.17.283 WS4 · SCI2821 gate schema v2 (C2, C4, C5, C6): per-level pass/fail from the evidence file itself, never from a typed value.
    Returns {'levels': {L: {'pass', 'why', 'leads'}}, 'stale': reason|None}."""
    ev = e['evidence']; path = P(*ev['artifact'].split('/'))
    if not os.path.exists(path):
        return {'stale': ev['artifact'] + ' missing', 'levels': {L: {'pass': False, 'why': 'evidence file missing'} for L in ev['levels']}}
    if sha_of(path) != ev.get('sha256'):
        return {'stale': ev['artifact'] + ' sha256 differs from the entry', 'levels': {L: {'pass': False, 'why': 'stale evidence: the file changed since the entry was written'} for L in ev['levels']}}
    out = {}
    if ev['kind'] == 'levels_vs_persistence':
        rows = [r for r in csv.DictReader(open(path, encoding='utf-8')) if r['region'] == ev['region']]
        for L, key in ev['levels'].items():
            if key is None:
                if L in (ev.get('owner_alert_levels') or []):   # an owner decision, recorded as such (never presented as tested)
                    out[L] = {'pass': True, 'owner': True, 'why': 'no evidence row of its own; alerts by owner decision (' + str(e.get('owner_decision') or 'recorded in the entry') + ')'}
                else:
                    out[L] = {'pass': False, 'why': 'no evidence of its own for this level (no inheritance)'}
                continue
            got = []
            for lead in ev['alert_leads']:
                r = next((x for x in rows if x['level'] == key and int(x['lead']) == lead), None)
                if r is None or not r['fc_POD']:
                    got.append((lead, False, 'no scored row')); continue
                a, b = [float(x) for x in r['dPSS_fc_minus_pers_ci'].strip('"[] ').split(',')]
                ev_n = int(r['obs_events'])
                ok = a > 0 and ev_n >= ev.get('min_events', 30)
                got.append((lead, ok, 'skill difference vs persistence 95 %% interval [%s, %s], %d events' % (a, b, ev_n)))
            ok = all(g[1] for g in got)
            out[L] = {'pass': ok, 'leads': {str(g[0]): g[1] for g in got},
                      'why': ('beats persistence at forecast days ' if ok else 'does not beat persistence at every alerting forecast day: ') + '; '.join('day %d %s (%s)' % (g[0], 'pass' if g[1] else 'fail', g[2]) for g in got)}
    elif ev['kind'] == 'events_observed':
        cr = list(csv.reader(open(path, encoding='utf-8'))); head, body = cr[0], cr[1:]
        obs = sum(int(r[i]) for r in body for i, h in enumerate(head) if i > 0 and h != 'Normal' and r[i].strip())
        n = sum(int(x) for r in body for x in r[1:] if x.strip())
        for L in ev['levels']:
            out[L] = {'pass': False, 'why': ('untestable: %d observed events in %d station-days (minimum %d)' % (obs, n, ev.get('min_events', 30))) if obs < ev.get('min_events', 30)
                      else 'no persistence comparison recorded for this level'}
    else:
        for L in ev['levels']:
            out[L] = {'pass': False, 'why': 'unknown evidence kind ' + ev['kind']}
    return {'stale': None, 'levels': out}


def main():
    # --in FILE: resolve another gate file; --dry: print the resolution as JSON and write nothing (used by tests103)
    a = sys.argv[1:]; src = a[a.index('--in') + 1] if '--in' in a else P('data', 'model-gate.json'); dry = '--dry' in a
    g = json.load(open(src, encoding='utf-8'))
    C = g['classes']; E = {e['id']: e for e in g['entries']}
    errs = []
    if len(E) != len(g['entries']):
        errs.append('duplicate entry id')
    for e in g['entries']:
        if e.get('class') not in C: errs.append(f"{e['id']}: unknown class {e.get('class')}")
        if e.get('status') not in g['statuses']: errs.append(f"{e['id']}: unknown status {e.get('status')}")
        for d in e.get('dependencies', []) + [c['ref'] for c in e.get('components', []) if c.get('ref')]:
            if d not in E: errs.append(f"{e['id']}: unknown dependency {d}")
        for c in e.get('components', []):
            if c.get('role') not in ('severity', 'diagnostic'): errs.append(f"{e['id']}: component role must be severity or diagnostic")
        # v91.17.279 CLAIMS279 P2: one product-type field per entry, from the gate's own list (map legend, reports and AI read it)
        if e.get('product_type') not in (g.get('product_types') or {}): errs.append(f"{e['id']}: product_type {e.get('product_type')!r} not in product_types")
        # S-03: plain client wording, one per known limitation (never fewer: a limitation is never dropped for a client)
        if 'client_limitations' in e and len(e['client_limitations']) != len(e.get('known_limitations') or []):
            errs.append(f"{e['id']}: client_limitations must match known_limitations one for one")
    if errs:
        print('\n'.join(errs)); sys.exit(1)

    # v91.17.283 WS4 · evidence-derived baseline tests and level rules (heat, cold): computed before the status resolution so the alert rule reads them
    EVAL, LINES = {}, None
    for e in g['entries']:
        if not e.get('evidence'):
            continue
        if LINES is None:
            LINES, why = evidence_lines()
            if LINES is None: errs.append(why)
        r = evaluate_evidence(e); EVAL[e['id']] = r
        passed = [L for L, v in r['levels'].items() if v['pass']]
        e['baseline_test'] = dict(e.get('baseline_test') or {}, beats=bool(passed), baseline=e['evidence']['baseline'], derived_from=e['evidence']['artifact'],
                                  result=('passes at ' + ', '.join(passed) if passed else 'no level passes') + (' (stale evidence: ' + r['stale'] + ')' if r['stale'] else ''))
    CR = g.get('client_rules') or {}
    for l in (CR.get('hidden_layers') or {}):
        own = [e for e in g['entries'] if l in (e.get('layers') or [])]
        if len(own) != 1 or not own[0].get('client_hidden'): errs.append(f"client_rules.hidden_layers {l!r} must belong to one entry marked client_hidden")
    for l, sub in (CR.get('substitute') or {}).items():
        if not any(sub.get('from') in (e.get('layers') or []) for e in g['entries']): errs.append(f"client_rules.substitute {l!r}: source layer {sub.get('from')!r} has no gate entry")
    if errs:
        print('\n'.join(errs)); sys.exit(1)

    res = {}

    def resolve(i, stack=()):
        if i in res: return res[i]
        if i in stack: print('dependency cycle at', i); sys.exit(1)
        e = E[i]; cls = e['class']; why = []
        st = e['status']
        missing = [f for f in C[cls]['required'] if not present(e.get(f))]
        if missing:
            st = 'experimental'; why.append(f"{cls} is missing {', '.join(missing)}")
        if cls == 'reference': st = 'reference'
        if cls == 'experimental': st = 'experimental'
        deps = list(e.get('dependencies', [])) + [c['ref'] for c in e.get('components', []) if c.get('ref') and c.get('role') == 'severity']
        for d in deps:
            ds = resolve(d, stack + (i,))['status']
            if ds == 'experimental' and RANK[st] < RANK['experimental']:
                st = 'experimental'; why.append(f"severity dependency {d} is experimental")
            elif ds == 'provisional' and RANK[st] < RANK['provisional']:
                st = 'provisional'; why.append(f"severity dependency {d} is provisional")
        # v91.17.205 · audit S08: a model whose own record says it has no alert threshold ("none: ...") cannot raise alerts,
        # however operational its display is (landslide-odds: relative bands, "not alert levels")
        noThr = str(e.get('operational_threshold') or '').strip().lower().startswith('none')
        can = bool(C[cls].get('canAlert')) and st == 'operational' and not noThr
        if noThr and st == 'operational': why.append('no alert threshold declared (operational_threshold: none): display only, no alerts')
        # v91.17.279 CLAIMS279 S-01/P4 (alert_rule): a forecast product alerts only with a recorded forward/held-out win over a simple baseline,
        # or as a published formula on a tested input that has one; observations and satellite estimates are measurements, not forecasts
        if can and cls in ('calibrated_model', 'published_standard'):
            bt = e.get('baseline_test') or {}
            win = bt.get('beats') is True
            if not win and bt.get('inherits') in E:
                ib = E[bt['inherits']].get('baseline_test') or {}
                win = ib.get('beats') is True and resolve(bt['inherits'], stack + (i,))['status'] == 'operational'
            if not win:
                can = False
                why.append('no recorded forward or held-out comparison beating a simple baseline' + (' (' + str(bt.get('result')) + ')' if bt.get('result') else '') + ': display only, no alerts')
        # v91.17.283.13 · audit C3 · alerting needs an EVENT test per level (the entry's evidence block, evaluated by evaluate_evidence),
        # not complete fields: a forecast product or a satellite estimate without one raises no alert; observations are exempt
        if can and cls in ('calibrated_model', 'published_standard', 'satellite_estimate') and not e.get('evidence'):
            can = False
            why.append('no per-level event test (hit / miss against recorded events) in the entry: display only, no alerts')
        r = {'status': st, 'canAlert': can,
             'why': why or (['declared ' + e['status'] + ', all ' + cls + ' fields present'] if cls != 'experimental' else ['experimental: display only'])}
        res[i] = r
        return r

    for i in E: resolve(i)
    # v91.17.283 WS4 · per-level product type and alert flag; an entry where no level passes is Indicative as a whole
    LV = {}
    for i, r in EVAL.items():
        e = E[i]; declared = e['product_type']; base_can = res[i]['canAlert']
        LV[i] = {L: {'productType': declared if v['pass'] else 'Indicative', 'canAlert': bool(base_can and v['pass']), 'why': v['why'], **({'ownerDecision': True} if v.get('owner') else {})} for L, v in r['levels'].items()}
        if not any(v['pass'] for v in r['levels'].values()):
            res[i]['productType'] = 'Indicative'
            res[i]['why'].append('no level beats its baseline on its own evidence: Indicative, display only, no alerts')
        res[i]['levels'] = LV[i]
        # the two lists the engine's alert policy reads (WS2 data/alert-policy.json shape): which levels may alert, which are Indicative
        res[i]['alertLevels'] = [L for L in ['Normal', 'Low', 'Moderate', 'High', 'Severe'] if L in LV[i] and LV[i][L]['canAlert']]
        res[i]['indicativeLevels'] = [L for L in ['Normal', 'Low', 'Moderate', 'High', 'Severe'] if (L in LV[i] and LV[i][L]['productType'] == 'Indicative') or (L not in LV[i] and res[i].get('productType') == 'Indicative')]

    page, srv = map_layers()
    owner = {}
    for e in g['entries']:
        for l in e.get('layers', []):
            if l in owner: errs.append(f"layer {l!r} in both {owner[l]} and {e['id']}")
            owner[l] = e['id']
    for l in page + srv:
        if l not in owner: errs.append(f"map layer {l!r} has no gate entry")
    if errs:
        if dry: print(json.dumps({'ok': False, 'errors': errs, 'resolved': res})); sys.exit(1)
        print('GATE FAIL\n' + '\n'.join(errs)); sys.exit(1)

    if dry:
        print(json.dumps({'ok': True, 'resolved': res})); return
    def resolved_entry(e):
        d = dict(e, resolved=res[e['id']])
        if res[e['id']].get('productType'):
            d['product_type_declared'] = e['product_type']; d['product_type'] = res[e['id']]['productType']
        ln = (LINES or {}).get((e.get('evidence') or {}).get('lines')) or []
        if ln:   # generated evidence sentences: the same sentence for the operator and the client (one for one)
            d['known_limitations'] = list(e.get('known_limitations') or []) + ln
            d['client_limitations'] = list(e.get('client_limitations') or e.get('known_limitations') or []) + ln
        return d
    full = dict(g); full['entries'] = [resolved_entry(e) for e in g['entries']]
    full['layerOwner'] = owner
    full['built'] = full.get('built') or None   # audit S-21: the resolved table carries the gate table's own build date
    json.dump(full, open(P('data', 'model-gate.resolved.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    slim = {'version': g['version'], 'built': g.get('built'), 'productTypes': g.get('product_types') or {}, 'entries': {}, 'layers': owner,
            'clientRules': {k: v for k, v in (g.get('client_rules') or {}).items() if k != 'about'},
            'alertMinClassRank': (g.get('alert_min_class_rank') or {}).get('value')}   # v91.17.283.24: the one alert minimum (page reads the same value)
    for e in g['entries']:
        if e.get('operator_only'):   # v91.17.283.25 · an operator-only entry (the EWS shadow anchor) stays in the resolved table only, never in the page's slim gate
            continue
        slim['entries'][e['id']] = {'name': e['name'], 'class': e['class'], 'version': e.get('version'), 'status': res[e['id']]['status'], 'productType': res[e['id']].get('productType') or e['product_type'],
                                    'canAlert': res[e['id']]['canAlert'], 'layers': e.get('layers', []),
                                    'components': e.get('components', [])}
        if res[e['id']].get('levels'):
            slim['entries'][e['id']]['levels'] = {L: {'productType': v['productType'], 'canAlert': v['canAlert']} for L, v in res[e['id']]['levels'].items()}
            slim['entries'][e['id']]['alertLevels'] = res[e['id']]['alertLevels']; slim['entries'][e['id']]['indicativeLevels'] = res[e['id']]['indicativeLevels']
        if e.get('client_hidden'): slim['entries'][e['id']]['clientHidden'] = True
    os.makedirs(P('build', 'gen'), exist_ok=True)
    json.dump(slim, open(P('build', 'gen', 'gate.slim.json'), 'w', encoding='utf-8'), ensure_ascii=True, separators=(',', ':'))
    # v91.17.283.24 · integration item 2: the slim gate the page and the engine hosts read (GET /api/registry/gate, server/engine/serverfiles.mjs)
    # is written here from the same object; it was a one-time copy (build/v28312/console_handoff.py) and so missed alertMinClassRank
    json.dump(slim, open(P('data', 'model-gate.slim.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    tally = {}
    for i in E: tally[res[i]['status']] = tally.get(res[i]['status'], 0) + 1
    print('gate', g['version'], 'entries', len(E), tally, 'layers', len(owner), 'covered', len(page) + len(srv))


if __name__ == '__main__':
    main()
