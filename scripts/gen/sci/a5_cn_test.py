"""SCI item 5 · audit A5 · does curve-number runoff explain 2025 non-riverine flooding better than the rain alone?
usage: python3 a5_cn_test.py <a3 evidence json> <sponge-tehsil.v2.json> <pk-tehsils.json> <out.json>"""
import sys, json, numpy as np
from scipy.stats import spearmanr, rankdata
A3, SP, TJ, OUT = sys.argv[1:5]
R = json.load(open(A3))['rows']; NEW = json.load(open(SP)); COV = NEW['covers']; F2 = NEW['fSlope']
CN2 = {'trees': [30, 55, 70, 77], 'shrub': [36, 60, 73, 79], 'grass': [49, 69, 79, 84], 'crops': [67, 78, 85, 89], 'bare': [77, 86, 91, 94], 'built': [98] * 4}
def runoff(P, cn, F): s = (25400 / cn - 254) * F; ia = .2 * s; return 0 if P <= ia else (P - ia) ** 2 / (P + .8 * s)
def q_new(key, P):
    u = NEW['units'].get(key)
    if not u: return None
    return sum(w * (P if COV[ci] == 'built' else runoff(P, CN2[COV[ci]][h], F2[fi])) for ci, h, fi, w in u['bins'])
u2k = {f['properties']['uid']: f['properties']['key'] for f in json.load(open(TJ))['features']}
rows = [dict(r, Q=q_new(u2k.get(r['uid']), r['P_day'])) for r in R]; rows = [r for r in rows if r['Q'] is not None]
fs = json.load(open(A3))['frameShare']; y = np.array([r['share'] > fs for r in rows]); s = np.array([r['share'] for r in rows])
P = np.array([r['P_day'] for r in rows]); Q = np.array([r['Q'] for r in rows])
def auc(x, y): r = rankdata(x); n1 = y.sum(); n0 = len(y) - n1; return (r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)
rng = np.random.default_rng(9); da, dr = [], []
for _ in range(2000):
    i = rng.integers(0, len(rows), len(rows))
    if y[i].all() or not y[i].any(): continue
    da.append(auc(Q[i], y[i]) - auc(P[i], y[i])); dr.append(spearmanr(Q[i], s[i]).statistic - spearmanr(P[i], s[i]).statistic)
ci = lambda v: [round(float(np.percentile(v, 2.5)), 3), round(float(np.percentile(v, 97.5)), 3)]
res = dict(n=len(rows), events=int(y.sum()), auc_Q=round(auc(Q, y), 3), auc_P=round(auc(P, y), 3), rho_Q=round(float(spearmanr(Q, s).statistic), 3), rho_P=round(float(spearmanr(P, s).statistic), 3),
           auc_diff_ci=ci(da), rho_diff_ci=ci(dr))
res['supported'] = bool(res['auc_diff_ci'][0] > 0 and res['rho_diff_ci'][0] > 0)
json.dump(res, open(OUT, 'w'), indent=1); print(json.dumps(res, indent=1))
