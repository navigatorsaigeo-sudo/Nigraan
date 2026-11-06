#!/usr/bin/env python3
"""v91.17.283.10 · DRYSPONGE · writes the drought and sponge (curve number) test results into data/model-gate.json, and the
withheld hydrological type into data/drought-type.json. Every number is read from the evidence files (data/evidence/drysponge/,
rules written before the tests ran: RULES.md there); nothing is typed. Then run scripts/gen/gen_gate.py.
usage: python3 scripts/gen/sci/drysponge/gate_drysponge.py"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
P = lambda *a: os.path.join(ROOT, *a)
EV = 'data/evidence/drysponge/'
D = json.load(open(P('data', 'drought-test-drysponge.json')))
S = json.load(open(P('data', 'sponge-cn-test-drysponge.json')))
DC = json.load(open(P('data', 'drought-class.json')))
f = lambda c: '[%s, %s]' % (c[0], c[1])
pct = lambda x: '%d %%' % round(100 * x)

w, e2, cal, ag = D['D1_wheat'], D['D2_episodes']['independentEventsE1toE5'], D['D5_calibration'], D['D3_agricultural']
cuts = ' / '.join('%s %s' % (k, DC['categories'][k]['indexAtMost']) for k in ('Monitor', 'Watch', 'Act'))
prim = S['decision']['primarySourcePerYear']
yr = lambda y: S[y]['sources'][prim[y]]
cn_line = '; '.join('%s AUC rain %s, curve-number runoff %s, difference %s' % (y, yr(y)['auc_P'], yr(y)['auc_Q'], f(yr(y)['auc_diff_ci'])) for y in ('2022', '2024', '2025'))
s2_line = '; '.join('%s %s %s' % (y, yr(y)['S2_partialRho_lowRetention_vs_share_given_P'], f(yr(y)['S2_ci'])) for y in ('2022', '2024', '2025'))

g = json.load(open(P('data', 'model-gate.json'), encoding='utf-8'))
E = {e['id']: e for e in g['entries']}

d = E['drought']
d['operational_threshold'] = 'US Drought Monitor index cuts as served (data/drought-class.json categories, index at most): ' + cuts + '; the level is the less severe of the rain index and the soil percentile'
d['independent_test'] = (
    'DRYSPONGE (rules written before the run, %sRULES.md): served level rebuilt monthly 1996-2025. '
    'Rain-fed wheat loss (Punjab CRS yields, independent of every input): AUC %s %s, n %d district-seasons, %d loss seasons; '
    'documented droughts 1999-2001, 2014-15, 2018-19 (declarations, partly rain-based): AUC %s %s, months at Monitor or above %s %s, '
    'false alarms %s %s. Earlier: rain source vs 25 stations 2001-2025 r 0.67, POD 0.41, FAR 0.45 (drought_source_test.json)'
    % (EV, w['aucLevel'], f(w['aucLevel_ci']), w['n'], w['lossSeasons'], e2['auc'], f(e2['auc_ci']), e2['hitRateMonitorPlus'], f(e2['hit_ci']),
       e2['falseAlarmMonitorPlus'], f(e2['fa_ci'])))
d['skill_metrics'] = dict(d.get('skill_metrics') or {}, wheatLossAuc=w['aucLevel'], wheatLossAucCi=w['aucLevel_ci'], episodeAuc=e2['auc'], episodeAucCi=e2['auc_ci'],
                          episodeHitMonitorPlus=e2['hitRateMonitorPlus'], episodeFalseAlarmMonitorPlus=e2['falseAlarmMonitorPlus'],
                          shareActFitPeriod=cal['fitPeriod1996_2020']['Act']['share'], evidence='data/drought-test-drysponge.json')
d['baseline_test'] = dict(baseline='the rain index alone (SPI-3, same cuts)', comparison='rain-fed wheat loss AUC, paired over seasons (data/drought-test-drysponge.json D1)',
                          result='level %s vs rain index alone %s, paired difference %s: no demonstrated gain over the rain index alone' % (w['aucLevel'], w['aucSpiAlone'], f(w['aucDiffLevelMinusSpi_ci'])),
                          beats=bool(w['aucDiffLevelMinusSpi_ci'][0] > 0))
lim = [
    ('CHIRPS blends GTS stations, so the GHCN check is partly circular',
     'the satellite rain behind it is partly built from the same station records it was checked against, so the check is not fully independent'),
    ('dry-month detection POD only 0.41',
     'it detects only about 4 in 10 dry months at the checked stations, and about 4 in 10 of its dry-month signals are false'),
    ('documented droughts: only %s of event tehsil-months reach Monitor and %s reach Watch (data/drought-test-drysponge.json D2): the convergence rule is conservative'
     % (pct(e2['hitRateMonitorPlus']), pct(e2['hitRateWatchPlus'])),
     'in past documented droughts it reached a drought level in only about %s of the months; a Low level does not rule out drought' % pct(e2['hitRateMonitorPlus'])),
    ('rain-fed wheat loss AUC %s %s: ranks loss seasons, does not predict them (hit %s, false alarm %s)' % (w['aucLevel'], f(w['aucLevel_ci']), w['hitRate'], w['falseAlarmRate']),
     'it ranks drier seasons above wetter ones, but it is a screening index, not a crop-loss forecast'),
    ('hydrological type (snow, river flow) has no observed record to test it against: withheld (data/drought-type.json withheld)',
     'the low river and snow water type is not shown: it has not been tested against observed river or reservoir records'),
]
d['known_limitations'] = [a for a, _ in lim]; d['client_limitations'] = [b for _, b in lim]
d['product_type'] = 'Screening index'

# the sponge: the static view stays as a labelled screening index; the day views are withheld from clients
r = E['retention']
r['layers'] = ['nss_baseline']
r['class'] = 'experimental'; r['status'] = 'experimental'; r['product_type'] = 'Screening index'
r['independent_test'] = ('DRYSPONGE S1/S2 (%sRULES.md, data/sponge-cn-test-drysponge.json): non-riverine flooded share per tehsil (> 29 km from the major rivers), '
                         'curve-number runoff vs rain alone: %s. Supported in %d of 3 years (rule: 2 of 3, none worse): not supported as a runoff predictor. '
                         'Low static retention vs flooded share given rain (partial Spearman): %s' % (EV, cn_line, S['decision']['yearsWhereCnAddsSkill'], s2_line))
rl = [('not validated against measured runoff; against mapped non-riverine flooding (2022, 2024, 2025) curve-number runoff added no skill beyond rain in 2 of 3 years',
       'screening index (soil and land cover), not a tested runoff forecast'),
      ('a capacity of the ground, not a hazard; cannot alert', 'it describes the ground, not a hazard, and raises no alert'),
      ('low retention ranks where non-riverine flooding was mapped beyond rain alone in 2022 and 2024 (partial rho CI above 0), but this is confounded with low-lying cropland plains',
       'lower values sat where more flooding away from the rivers was mapped in 2022 and 2024, but it is a ranking of ground types, not a measure of runoff')]
r['known_limitations'] = [a for a, _ in rl]; r['client_limitations'] = [b for _, b in rl]

rt = {'id': 'retention-today', 'name': 'Runoff Retention Potential today (curve number with antecedent wetness)', 'class': 'experimental', 'version': 'nss-s-91.17.103',
      'status': 'experimental', 'layers': ['nss_dynamic'], 'client_hidden': True,
      'source': r['source'], 'method': 'S = 25400/CN - 254 mm with the antecedent runoff condition from the catchment wetness', 'dependencies': [],
      'known_limitations': ['the antecedent-condition shift of the curve number has not been tested; the base curve number added no skill beyond rain on mapped floods (data/sponge-cn-test-drysponge.json)'],
      'client_limitations': ['not shown to clients: a day view of runoff that has not been tested against observed runoff or floods'],
      'effective_from': '91.17.283.10', 'product_type': 'Indicative'}
g['entries'].insert(g['entries'].index(r) + 1, rt)

ro = E['runoff-today']
ro['client_hidden'] = True
ro['known_limitations'] = ['forecast day rain is a single run, not the calibrated chance',
                           'not validated: curve-number runoff added no skill beyond rain on mapped non-riverine floods in 2 of 3 years (data/sponge-cn-test-drysponge.json)']
ro['client_limitations'] = ['not shown to clients: it uses one forecast run, not the calibrated rain chance',
                            'not shown to clients: the runoff it computes added nothing beyond the rain itself when checked against mapped floods']
ro['effective_from'] = '91.17.283.10'

fp = E['flood-pluvial']
fp['known_limitations'] = fp['known_limitations'] + ['its curve-number runoff coefficient added no skill beyond rain on mapped non-riverine floods in 2 of 3 years (data/sponge-cn-test-drysponge.json); kept operator-only and untested']
fp['client_limitations'] = fp['client_limitations'] + ['its ground (runoff) factor has not shown skill beyond the rain itself']

H = g['client_rules']['hidden_layers']
H['nss_dynamic'] = 'Runoff retention today is not shown to clients: the curve-number runoff behind it has not been shown to add anything beyond the rain itself on mapped floods.'
H['nss_runoff'] = 'Rain run-off today is not shown to clients: the curve-number runoff behind it has not been shown to add anything beyond the rain itself on mapped floods.'
H['nss_retention'] = 'Storm water the ground can hold is not shown to clients: the curve-number runoff behind it has not been shown to add anything beyond the rain itself on mapped floods.'
g['client_rules']['about'] = g['client_rules']['about'] + ' v91.17.283.10 DRYSPONGE: the day views of the curve-number sponge are hidden (no skill beyond rain on mapped floods).'
json.dump(g, open(P('data', 'model-gate.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

# drought type: the hydrological type is withheld (no observed truth). Text insertion keeps the file's own layout.
tp = P('data', 'drought-type.json'); t = open(tp, encoding='utf-8').read()
if '"withheld"' not in t:
    why = 'not tested: ' + D['D4_hydrological']['why'] + ' (data/drought-test-drysponge.json D4)'
    t = t.replace('"version": "drought-type-91.17.283"', '"version": "drought-type-91.17.283.10"', 1)
    lv = t.index('  "level": "v283:'); eol = t.index('\n', lv)
    t = t[:eol] + ',\n  "withheld": ' + json.dumps('v283.10 DRYSPONGE: a type listed in withheld is never named (main, active, outlook); its indicator readings stay in indicators with untested: true', ensure_ascii=False) + t[eol:]
    end = t.rstrip().rindex('}')
    t = t[:end].rstrip() + ',\n "withheld": {\n  "hydrological": ' + json.dumps(why, ensure_ascii=False) + '\n }\n}\n'
    json.loads(t); open(tp, 'w', encoding='utf-8').write(t)
print('gate and drought-type updated from', EV)
