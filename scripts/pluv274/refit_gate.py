"""v91.17.274 PLUVIAL · refit of the pluvial level on AGN gauge-observed intensity, held-out gate against the served level.

Input: data/pluv274/served_vs_gauge_main_even.csv.gz (gauge_verify.py: per tehsil-day the served score and level, the page's rain
drive on the same forecast input, and the wettest QC'd gauge hour). Candidates (fitted on the training part only):
  A  isotonic chance of a gauge hour >= rung r given the RAIN DRIVE (forecast intensity, no place term)
  B  isotonic chance given the SERVED SCORE (rain drive x place term: runoff, wetness, rarity)
Level from a calibrated chance by the page's own rule for rain levels (rainChance.levels: a level is claimed when its event is more
likely than not, chance >= 50 %): Low <- gauge >= 7 mm/h, Moderate <- >= 20, High <- >= 50; Severe is not claimed (no gauge rung above
50 mm/h). Score per level: Peirce skill (hit rate - false-alarm rate) of 'level >= k' for 'gauge >= rung k', and the difference
refit - served, 95 % CI from 2000 day-block bootstrap resamples (paired: same days for both).
Windows (gate of v270: window 1 lower bound > 0, window 2 >= 0, no month worse beyond doubt), each a held-out part never used in fitting:
  periods  W1 train 12 Jun-31 Jul -> test Aug-Sep;  W2 train Aug-Sep -> test 12 Jun-31 Jul
  regions  R1 train outside Islamabad-Rawalpindi -> test Islamabad-Rawalpindi tehsils;  R2 the reverse
Also: AUC of drive vs score, paired difference with CI (which part loses skill).  Output data/pluv274/refit-gate.json"""
import json, os, sys, gzip, numpy as np, pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import roc_auc_score
ROOT = sys.argv[1]; D = os.path.join(ROOT, 'data', 'pluv274')
RNG = np.random.default_rng(274); B = 2000
M = pd.read_csv(os.path.join(D, sys.argv[2] if len(sys.argv) > 2 else 'served_vs_gauge_main_even.csv.gz'))
Z = {}
for f in ('fc_2026-09.jsonl.gz',):
    for l in gzip.open(os.path.join(ROOT, 'data', 'archive', 'forecast', f), 'rt'):
        r = json.loads(l); Z[r['u']] = r.get('z')
M['zone'] = M.uid.map(Z); M['month'] = M.date.str[:7]
ISR = {'Federal Capital|Islamabad|Islamabad', 'Punjab|Rawalpindi|Rawalpindi', 'Punjab|Rawalpindi|Kahuta'}
M['isr'] = M.uid.isin(ISR)
RUNGS = {1: 7, 2: 20, 3: 50}
for k, r in RUNGS.items(): M[f'e{k}'] = (M.gmax >= r).astype(int)

def fit_levels(tr, col):
    """calibrated chance per rung on the training part -> the smallest predictor value at which the chance reaches 50 %"""
    cuts = {}
    for k in RUNGS:
        iso = IsotonicRegression(out_of_bounds='clip', y_min=0, y_max=1).fit(tr[col].values, tr[f'e{k}'].values)
        xs = np.unique(tr[col].values); p = iso.predict(xs); ok = xs[p >= 0.5]
        cuts[k] = float(ok.min()) if len(ok) else None
    return cuts

def apply_levels(df, col, cuts):
    L = np.zeros(len(df), int)
    for k in sorted(RUNGS):
        if cuts[k] is not None: L = np.where(df[col].values >= cuts[k], k, L)
    return L

def pss(L, y, k):
    w = L >= k; e = y == 1
    if e.sum() == 0 or (~e).sum() == 0: return np.nan
    return w[e].mean() - w[~e].mean()

def day_boot(te, stat):
    days = te.date.unique(); g = {d: np.where(te.date.values == d)[0] for d in days}
    est = stat(np.arange(len(te))); vals = []
    for _ in range(B):
        ii = np.concatenate([g[d] for d in RNG.choice(days, len(days))]); v = stat(ii)
        if np.isfinite(v): vals.append(v)
    lo, hi = (np.percentile(vals, [2.5, 97.5]) if vals else (np.nan, np.nan))
    return [round(float(est), 3) if np.isfinite(est) else None, round(float(lo), 3) if np.isfinite(lo) else None, round(float(hi), 3) if np.isfinite(hi) else None]

def evaluate(tr, te, col):
    cuts = fit_levels(tr, col); Lr = apply_levels(te, col, cuts); Ls = te.L.values.astype(int)
    out = {'cuts': cuts, 'test_tehsilDays': int(len(te)), 'test_days': int(te.date.nunique()), 'levels': {}}
    for k in RUNGS:
        y = te[f'e{k}'].values
        out['levels'][k] = {'events': int(y.sum()), 'warnedRefit': int((Lr >= k).sum()), 'warnedServed': int((Ls >= k).sum()),
                            'pssRefit': day_boot(te, lambda ii: pss(Lr[ii], y[ii], k)),
                            'pssServed': day_boot(te, lambda ii: pss(Ls[ii], y[ii], k)),
                            'diff': day_boot(te, lambda ii: pss(Lr[ii], y[ii], k) - pss(Ls[ii], y[ii], k))}
        mon = {}
        for m in sorted(te.month.unique()):
            sel = (te.month.values == m)
            sub = te[sel]; Lr_m, Ls_m, y_m = Lr[sel], Ls[sel], y[sel]
            mon[m] = day_boot(sub, lambda ii: pss(Lr_m[ii], y_m[ii], k) - pss(Ls_m[ii], y_m[ii], k)) if y_m.sum() else None
        out['levels'][k]['byMonthDiff'] = mon
    return out

def gate(w1, w2):
    res = {}
    for k in RUNGS:
        d1, d2 = w1['levels'][k]['diff'], w2['levels'][k]['diff']
        months = [v for w in (w1, w2) for v in w['levels'][k]['byMonthDiff'].values() if v]
        worse = any(v[2] is not None and v[2] < 0 for v in months)
        res[k] = {'w1_lower>0': bool(d1[1] is not None and d1[1] > 0), 'w2>=0': bool(d2[0] is not None and d2[0] >= 0),
                  'noMonthWorse': not worse}
        res[k]['pass'] = all(res[k].values())
    return res

out = {'basis': 'served level replayed on IFS as-issued rain (lead 0-6 h, 3-h windows spread over hours) vs AGN MACH gauges, 2025 monsoon',
       'n': int(len(M)), 'tehsils': int(M.uid.nunique()), 'zones': M.groupby('zone').uid.nunique().to_dict()}
# which part loses skill: AUC of the rain drive vs the served score, paired
for k, r in RUNGS.items():
    y = M[f'e{k}'].values; dr = M.drive.values; sc = M.score.values
    f = lambda ii: (roc_auc_score(y[ii], dr[ii]) - roc_auc_score(y[ii], sc[ii])) if 0 < y[ii].sum() < len(ii) else np.nan
    out.setdefault('aucDriveMinusScore', {})[f'gauge>={r}'] = day_boot(M, f)
    # the same inside Islamabad-Rawalpindi only (one place term per tehsil: tests whether the term ranks DAYS, not places)
    S = M[M.isr]; ys, ds, ss = S[f'e{k}'].values, S.drive.values, S.score.values
    g = lambda ii: (roc_auc_score(ys[ii], ds[ii]) - roc_auc_score(ys[ii], ss[ii])) if 0 < ys[ii].sum() < len(ii) else np.nan
    out.setdefault('aucDriveMinusScore_IslRwp', {})[f'gauge>={r}'] = day_boot(S, g)
splits = {'periods': (M.date < '2025-08-01', M.date >= '2025-08-01'), 'regions': (~M.isr, M.isr)}
for cand, col in (('A_rainDrive', 'drive'), ('B_servedScore', 'score')):
    o = {}
    for name, (a, b) in splits.items():
        w1 = evaluate(M[a], M[b], col); w2 = evaluate(M[b], M[a], col)
        o[name] = {'W1': w1, 'W2': w2, 'gate': gate(w1, w2)}
    o['fullFitCuts'] = fit_levels(M, col)
    out[cand] = o
json.dump(out, open(os.path.join(D, 'refit-gate' + (sys.argv[3] if len(sys.argv) > 3 else '') + '.json'), 'w'), indent=1, default=str)
print(json.dumps({'auc': out['aucDriveMinusScore'], 'aucIsr': out['aucDriveMinusScore_IslRwp']}))
for cand in ('A_rainDrive', 'B_servedScore'):
    for name in splits:
        o = out[cand][name]
        print(cand, name, 'gate', o['gate'])
        for w in ('W1', 'W2'):
            print('  ', w, o[w]['cuts'], {k: (v['events'], v['warnedRefit'], v['warnedServed'], v['pssRefit'], v['pssServed'], v['diff']) for k, v in o[w]['levels'].items()})
    print(cand, 'full-fit cuts', out[cand]['fullFitCuts'])
