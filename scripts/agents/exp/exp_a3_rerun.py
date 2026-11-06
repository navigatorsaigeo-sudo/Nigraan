#!/usr/bin/env python3
"""v91.17.283.10 . agent 6 . flood shadow candidate D25 (days >= 25 mm) and P_day: the R1 two-year test (sci2 RULES.md R1), RE-RUN
from the per-tehsil rows each year's test recorded (data/evidence/flood/a3_trigger_test_<year>.json: share of the tehsil's non-riverine
land flooded, cells, and the four season predictors P_hour, P_ladder, P_day, P_d25 measured from IMERG V07).
Method exactly as scripts/gen/sci/a3_trigger_test.py: event = tehsil flooded share > the frame-wide share; AUC (Mann-Whitney on ranks)
and Spearman; 95 % bootstrap over tehsils, 2000 draws, numpy default_rng(3), draws where every or no tehsil is an event skipped.
R1 decision: a replacement (P_day, P_d25) passes only if in BOTH years its AUC CI lies above 0.5 AND its paired AUC difference against
P_hour has a CI above 0. Pooled years are reported only.
usage: python exp_a3_rerun.py <out.json> <rows year A.json> <rows year B.json> [...]"""
import sys, json, warnings, numpy as np
warnings.filterwarnings("ignore")
from scipy.stats import spearmanr, rankdata

OUT, FILES = sys.argv[1], sys.argv[2:]
KEYS = ['P_hour', 'P_ladder', 'P_day', 'P_d25']


def auc(x, y):
    r = rankdata(x); n1 = y.sum(); n0 = len(y) - n1; return float((r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


ci = lambda v: [round(float(np.percentile(v, 2.5)), 3), round(float(np.percentile(v, 97.5)), 3)]
res = {'rule': 'sci2 RULES.md R1 (two years; replacement passes only if AUC CI > 0.5 and paired AUC difference vs P_hour CI > 0 in BOTH years)',
       'design': 'per-tehsil rows of each year re-scored; bootstrap over tehsils (2000, seed 3) as a3_trigger_test.py', 'years': {}}
for f in FILES:
    d = json.load(open(f)); rows = d['rows']; fs = float(d['frameShare']); yr = str(d.get('year'))
    # the recorded frame share is rounded to 4 decimals; the event rule uses the exact share. Recompute it from rows only when every
    # row's share sits away from the rounded value (it does: shares are ratios of cell counts); a tie would be reported.
    s = np.array([r['share'] for r in rows], float); y = s > fs
    ties = int(np.sum(np.abs(s - fs) < 5e-5))
    P = {k: np.array([r[k] for r in rows], float) for k in KEYS}
    rng = np.random.default_rng(3); B = 2000; boots = {k: [] for k in P}; rho = {k: [] for k in P}
    for _ in range(B):
        ix = rng.integers(0, len(rows), len(rows)); yy = y[ix]
        if yy.all() or not yy.any(): continue
        for k in P: boots[k].append(auc(P[k][ix], yy)); rho[k].append(spearmanr(P[k][ix], s[ix]).statistic)
    m = {k: dict(auc=round(auc(P[k], y), 3), auc_ci=ci(boots[k])) for k in P}
    pr = {k + '-P_hour': dict(auc_diff_ci=ci(np.array(boots[k]) - np.array(boots['P_hour']))) for k in ['P_ladder', 'P_day', 'P_d25']}
    rec = dict(tehsils=len(rows), events=int(y.sum()), frameShare=fs, tiesAtFrameShare=ties, metrics=m, paired=pr,
               recorded=dict(metrics={k: d['metrics'][k]['auc_ci'] for k in KEYS}, paired={k: d['paired'][k]['auc_diff_ci'] for k in d['paired']}))
    rec['reproduces_recorded'] = all(m[k]['auc_ci'] == d['metrics'][k]['auc_ci'] for k in KEYS) and all(pr[k]['auc_diff_ci'] == d['paired'][k]['auc_diff_ci'] for k in pr)
    rec['passes'] = [k for k in ['P_day', 'P_d25'] if m[k]['auc_ci'][0] > 0.5 and pr[k + '-P_hour']['auc_diff_ci'][0] > 0]
    res['years'][yr] = rec
    print(yr, 'tehsils', len(rows), 'events', int(y.sum()), 'passes', rec['passes'], 'reproduces', rec['reproduces_recorded'], flush=True)
ys = list(res['years'])
res['promote'] = [k for k in ['P_day', 'P_d25'] if len(ys) >= 2 and all(k in res['years'][y]['passes'] for y in ys)]
json.dump(res, open(OUT, 'w'), indent=1)
print('promote', res['promote'])
