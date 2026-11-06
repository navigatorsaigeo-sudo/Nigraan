#!/usr/bin/env python3
"""v91.17.283 WS4 · the measured-skill evidence every client surface quotes, generated from the SCI2821 evidence files kept in the tree
(data/evidence/sci2821/: the science summary and the heat / cold contingency tables, each with its sha256). No number in the output is typed:
every figure and every client sentence is computed here from those files, and the file hashes travel with them so a reader can prove which
evidence a sentence came from. Supplier and agency names never enter a client sentence (the truth-set descriptions stay in the source file).

usage: python3 scripts/gen/gen_evidence.py [<evidence dir>] [<out json>]
       defaults: data/evidence/sci2821  data/skill-evidence.json
Read by server/api/evidence.mjs (methods sheet, AI answers, report forecast-basis page) and by scripts/gen/gen_gate.py (heat / cold gate)."""
import csv, hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'evidence', 'sci2821')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'data', 'skill-evidence.json')
# v91.17.283.8 HEATSKILL · the heat sentences come from the reconciled evidence (issued level against standard-exposure stations) when it is
# in the tree; the SCI2821 heat table stays the gate's evidence and the cold / temperature source
HE = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, 'data', 'evidence', 'heat2838')
rel = lambda p: os.path.relpath(p, ROOT).replace(os.sep, '/')


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def rng(vals, fmt='%.1f'):
    lo, hi = fmt % min(vals), fmt % max(vals)
    return lo if lo == hi else lo + '–' + hi


def pct(v):
    return int(round(100 * v))


def prng(vals):
    lo, hi = min(pct(v) for v in vals), max(pct(v) for v in vals)
    return str(lo) if lo == hi else '%d–%d' % (lo, hi)


def window(text, alt):
    m = re.search(r'(\d{1,2} \w{3})-(\d{1,2} \w{3} \d{4})', text or '')
    return (m.group(1) + '–' + m.group(2)) if m else alt


def ci_pair(s):
    try:
        a, b = [float(x) for x in str(s).strip('"[] ').split(',')]
        return [a, b]
    except Exception:
        return None


def heat_rows(path, region):
    rows = [r for r in csv.DictReader(open(path, encoding='utf-8')) if r['region'] == region]
    out = {}
    for r in rows:
        if not r['fc_POD']:
            continue   # a lead with no observed event is not a test (lead 3: 0 events)
        lvl = r['level']
        ci = ci_pair(r['dPSS_fc_minus_pers_ci'])
        out.setdefault(lvl, []).append({'lead': int(r['lead']), 'n': int(r['n']), 'events': int(r['obs_events']),
                                        'hit': float(r['fc_POD']), 'falseAlarm': float(r['fc_FAR']), 'pss': float(r['fc_PSS']),
                                        'persistencePss': float(r['pers_PSS']) if r['pers_PSS'] else None, 'deltaPssCi95': ci,
                                        'beatsPersistence': bool(ci and ci[0] > 0)})
    return out


def heat2838(dirpath):
    """the client heat sentences for exactly the domain the evidence covers (summary.json client_domain); None when not in the tree"""
    sp, tp = os.path.join(dirpath, 'summary.json'), os.path.join(dirpath, 'heat_issued_vs_standard.csv')
    if not (os.path.exists(sp) and os.path.exists(tp)):
        return None
    S = json.load(open(sp, encoding='utf-8')); dom = S['client_domain']; leads = '-'.join(str(x) for x in dom['leads'])
    rows = list(csv.DictReader(open(tp, encoding='utf-8')))
    pick = lambda lvl: next(r for r in rows if r['region'] == dom['region'] and r['leads'] == leads and r['level'] == lvl)
    m, h = pick('Moderate+'), pick('High+')
    ci = lambda r, k: [float(x) for x in r[k].strip('[] ').split(',')]
    beats = lambda r: ci(r, 'dPSS_ci95')[0] > 0
    region = ' and '.join(dom['region'].split('+'))   # 'Sindh and Punjab'
    days = ' and '.join(str(x) for x in dom['leads'])
    a, b = ci(m, 'POD_ci95'), ci(m, 'FAR_ci95'); c = ci(h, 'FAR_ci95')
    lines = [
        'Heat stress at Moderate or higher, forecast days %s, %s (%s, checked at %s standard weather and airport stations over %s days): the level caught %d %% of the observed '
        'Moderate-or-higher days (95 %% interval %d–%d %%), and %d %% of its Moderate-or-higher forecasts were false alarms (%d–%d %%); it %s carrying the last observed level forward. '
        'Elsewhere in Pakistan, and on the day of issue and day 3, the heat level is not yet verified'
        % (days, region, S['window'], m['stations'], m['days'], pct(float(m['POD'])), pct(a[0]), pct(a[1]), pct(float(m['FAR'])), pct(b[0]), pct(b[1]),
           'did better than' if beats(m) else 'did not do better than'),
        'Heat stress at High or Severe (same check): %d %% of these forecasts were false alarms (95 %% interval %d–%d %%) and the level %s carrying the last observed level forward, so High and Severe are indicative and raise no alerts'
        % (pct(float(h['FAR'])), pct(c[0]), pct(c[1]), 'did better than' if beats(h) else 'did not beat'),
    ]
    info = {'region': region, 'leads': dom['leads'], 'window': S['window'], 'truth': 'standard weather and airport stations',
            'moderatePlus': {k: m[k] for k in ('days', 'stations', 'n', 'events', 'POD', 'POD_ci95', 'FAR', 'FAR_ci95', 'dPSS', 'dPSS_ci95')},
            'highPlus': {k: h[k] for k in ('days', 'stations', 'n', 'events', 'POD', 'POD_ci95', 'FAR', 'FAR_ci95', 'dPSS', 'dPSS_ci95')},
            'notVerified': 'outside ' + region + ', and on forecast days other than ' + days}
    return lines, info, [sp, tp]


def main():
    sp = os.path.join(EV, 'summary.json'); hp = os.path.join(EV, 't3_heat_levels_vs_persistence.csv'); cp = os.path.join(EV, 't3_cold_confusion_national.csv')
    S = json.load(open(sp, encoding='utf-8')); F = S['findings']
    T1, H, C = F['T1_strict_daily_L1_L2_L3'], F['T1_post_fit_hourly_L1'], F['T2_coverage']
    TS = S.get('truth_sets', {})
    wd, wh = window(TS.get('strict_daily'), 'the test period'), window(TS.get('post_fit_hourly'), 'after the fitting window')
    wheat = window(F['T3_heat'].get('window'), 'the heat test window')
    HEAT = heat_rows(hp, 'Sindh+Punjab')
    mod, high = HEAT.get('Moderate+', []), HEAT.get('High+', [])
    # cold: the confusion table counts observed cold-stress station-days (columns other than Normal)
    cr = list(csv.reader(open(cp, encoding='utf-8')))
    head, body = cr[0], cr[1:]
    total = sum(int(x) for r in body for x in r[1:] if x.strip())
    obs_cold = sum(int(r[i]) for r in body for i, h in enumerate(head) if i > 0 and h != 'Normal' and r[i].strip())
    fc_cold = sum(int(x) for r in body if r[0] != 'Normal' for x in r[1:] if x.strip())
    cold_testable = obs_cold > 0 and fc_cold > 0

    temp = {
        'daily': {'leadDays': [1, 2, 3], 'tmaxMaeC': T1['Tmax_mae'], 'tmaxBiasC': T1['Tmax_bias'], 'tmaxRawMaeC': T1['Tmax_raw_mae'],
                  'tminMaeC': T1['Tmin_mae'], 'tminBiasC': T1['Tmin_bias'], 'tminRawMaeC': T1['Tmin_raw_mae'],
                  'tminCorrectedWorseThanRaw': all(a > b for a, b in zip(T1['Tmin_mae'], T1['Tmin_raw_mae'])), 'window': wd},
        'hourly': {z: {k: H[z][k] for k in ('mae', 'bias', 'raw', 'ci', 'stations') if k in H[z]} for z in ('plains', 'mountain', 'hills') if z in H},
        'hourlyWindow': wh,
        'coverage90': {'hourly': C['hourly_L1_L2_L3'], 'hills': C['hills'], 'mountain': C['mountain'], 'mountainWidthC': C.get('mountain_width_C'),
                       'plainsDailyTmax': C['daily_Tmax'], 'plainsDailyTmin': C['daily_Tmin']},
    }
    t = temp['daily']
    # v91.17.283.49 · 1.0.10 data item 5 · THE SERVED CHOICE PER VARIABLE / ZONE / LEAD, from the same T1 pairs (corrected chain vs the raw
    # model at the same stations and days). The raw model is served for a cell only when the chain's MAE is higher than the raw MAE at that
    # lead AND the science summary states that the paired difference interval excludes 0 for that variable (T1 note: "chain worse than raw
    # for Tmin, CI excludes 0"); otherwise the corrected chain stays (the default needs no evidence to stay). Read by server/api/skillchoice.mjs.
    note = str(T1.get('note') or '')
    sig = {m.group(1).lower() for m in re.finditer(r'chain worse than raw for (T(?:min|max)), CI excludes 0', note)}
    def cell(var, key):
        cor, raw = T1[key + '_mae'], T1[key + '_raw_mae']
        diff = T1.get(key + '_chain_minus_raw') or [round(a - b, 2) for a, b in zip(cor, raw)]
        return {'variable': var, 'zone': 'plains', 'leads': [1, 2, 3], 'correctedMaeC': cor, 'rawMaeC': raw, 'chainMinusRawC': diff,
                'diffIntervalExcludesZero': var in sig,
                'served': ['raw' if (c > r and var in sig) else 'corrected' for c, r in zip(cor, raw)]}
    choice = {'rule': 'per variable, zone and lead: the raw model is served where the corrected chain verified worse on held-out stations '
                      '(higher MAE, paired difference interval excluding 0); everywhere else, and at leads or zones without evidence, the corrected chain',
              'window': wd, 'zoneBasis': 'the strict daily truth set (stations never used in any fit; T2 names its coverage plainsDaily)',
              'cells': [cell('tmax', 'Tmax'), cell('tmin', 'Tmin')],
              # v91.17.283.49 (1.0.10 merge): NOT SERVED. On the real forecast of 3 Nov 2026 (same model run, NIGRAAN_SKILL_CHOICE on vs off,
              # Islamabad I-8 and Lahore Cantt) the night-hour swap left the served daily minimum unchanged (its hour is not swapped after the
              # later chain stages), moved day hours by up to 0.9 C and evening hours by up to 1.7 C: effects the T1 test never measured. The
              # cells stay as evidence; server/api/skillchoice.mjs applies them only with NIGRAAN_SKILL_CHOICE=1, and no client sentence claims it.
              'serving': False}
    lines_t = [
        'Daily maximum temperature: off by %s °C on average on forecast day 1 (%s °C over days 1 to 3) and about %s °C too cool; '
        'daily minimum: off by %s °C on day 1 and about %s °C too warm%s (stations never used in training, %s)'
        % ('%.2f' % t['tmaxMaeC'][0], rng(t['tmaxMaeC']), rng([abs(x) for x in t['tmaxBiasC']]), '%.2f' % t['tminMaeC'][0], rng([abs(x) for x in t['tminBiasC']]),
           (('; for the minimum the corrected forecast is slightly worse than the uncorrected model (%s °C on day 1)' % ('%.2f' % t['tminRawMaeC'][0]))
            + ('' if not choice.get('serving') else '; so where that held (%s, days %s) the night minimum is served from the uncorrected model' % (choice['cells'][1]['zone'], '–'.join(str(x) for x in (min(L for L, v in zip(choice['cells'][1]['leads'], choice['cells'][1]['served']) if v == 'raw'), max(L for L, v in zip(choice['cells'][1]['leads'], choice['cells'][1]['served']) if v == 'raw')))) if 'raw' in choice['cells'][1]['served'] else '')) if t['tminCorrectedWorseThanRaw'] else '', wd),
        'Hourly temperature, measured after the model’s fitting window (%s): plains off by %s °C, mountains %s °C (about %s °C too cold), hills %s °C (about %s °C too cold)'
        % (wh, '%.2f' % H['plains']['mae'], '%.2f' % H['mountain']['mae'], '%.1f' % abs(H['mountain']['bias']), '%.2f' % H['hills']['mae'], '%.1f' % abs(H['hills']['bias'])),
        'The 90 %% range held %s %% of hours overall, %d %% in the hills and %s %% in the mountains (where it is about %s °C wide); plains daily maxima and minima fell inside it %s %% of the time'
        % (prng(C['hourly_L1_L2_L3']), pct(C['hills']), ('%.1f' % (100 * C['mountain'])).rstrip('0').rstrip('.'), '%.0f' % C.get('mountain_width_C', 0), prng(C['daily_Tmax'] + C['daily_Tmin'])),
    ]
    heat = {'region': 'Sindh and Punjab', 'window': wheat, 'baseline': 'persistence: the level observed on the day before issue',
            'moderatePlus': mod, 'highPlus': high,
            'moderateBeatsPersistenceAtLeads': [r['lead'] for r in mod if r['beatsPersistence']],
            'highBeatsPersistenceAtLeads': [r['lead'] for r in high if r['beatsPersistence']]}
    lead0 = [r for r in mod if r['lead'] == 0]
    lines_h = [
        'Heat stress at Moderate or higher (%s, %s): the level caught %s %% of the observed days, and %s %% of its forecasts were false alarms; '
        'on forecast days %s it did better than carrying the last observed level forward%s'
        % (heat['region'], wheat, prng([r['hit'] for r in mod]), prng([r['falseAlarm'] for r in mod]),
           ' and '.join(str(x) for x in heat['moderateBeatsPersistenceAtLeads']) or 'none',
           ', on the day of issue it did not' if lead0 and not lead0[0]['beatsPersistence'] else ''),
        'Heat stress at High or Severe: %s %% of these forecasts were false alarms and the level %s carrying the last observed level forward, so High and Severe are indicative and raise no alerts'
        % (prng([r['falseAlarm'] for r in high]), 'did not beat' if not heat['highBeatsPersistenceAtLeads'] else 'beat only at some leads'),
    ]
    H2 = heat2838(HE); extra = []
    if H2:
        lines_h, info, extra = H2
        heat = dict(heat, client=info, window=info['window'], sci2821Window=wheat)
    cold = {'testable': cold_testable, 'stationDays': total, 'observedColdStressDays': obs_cold, 'forecastColdStressDays': fc_cold, 'window': wheat}
    lines_c = ['Cold stress: no event test yet: %s cold-stress day was observed and %s forecast in the %s station-days of the test window (%s), so the level could not be tested; it is indicative and raises no alerts'
               % ('no' if obs_cold == 0 else str(obs_cold), 'none' if fc_cold == 0 else str(fc_cold), '{:,}'.format(total), wheat)] if not cold_testable else []
    out = {'schema': 'agn.skill-evidence.v1',
           'about': 'measured out-of-sample skill of the served chain; every figure and sentence generated from the evidence files below (scripts/gen/gen_evidence.py), none typed',
           'task': S.get('task'), 'built': S.get('built'),
           'evidence': {rel(p): sha(p) for p in (sp, hp, cp, *extra)},
           'temperature': temp, 'servedChoice': choice, 'heat': heat, 'cold': cold,
           'lines': {'temperature': lines_t, 'heat': lines_h, 'cold': lines_c}}
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n'.join(lines_t + lines_h + lines_c))


if __name__ == '__main__':
    main()
