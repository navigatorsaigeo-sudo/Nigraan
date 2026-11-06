"""v283 WS5 - LANDSLIDE RAIN BASIS MAPPING: put the served rain on the training basis, fit 2022-2024, verify 2025-2026 (held out).

Input  nigraan-local/data/landslide-basis/{archive,hist}/<uid>.json from scripts/landslide_basis/fetch_landslide_basis.py
       (archive = training basis, historical-forecast = serving basis, both daily rain_sum).
Method empirical quantile mapping (Panofsky & Brier 1968; Gudmundsson et al. 2012, HESS 16: 3383) of the SERVED-basis window totals onto
       the TRAINING-basis window totals, separately for the three features the odds model reads: P1 (larger of the day and the next
       day), P3 (3-day) and P7 (7-day). Knots at probabilities 0, 0.005, ..., 1. Dry values map to the training quantile at half the
       served dry share (frequency adaptation, Themessl et al. 2012). Above the top knot the top-knot ratio is applied (Boe et al. 2007).
       Per tehsil when its 2022-2024 served record holds at least 100 wet days (enough for a 99th percentile: 1 / (1 - 0.99));
       otherwise per rain-climate group = province x height class (>= 1000 m, the served rain-chance model's zone split).
Test   2025-01-01 onward, never used in the fit. Per tehsil: Kolmogorov-Smirnov distance to the training-basis distribution, raw vs
       mapped, for P1/P3/P7; quantile error at p90/p95/p99; and the odds model's output: mean |log OR(served basis) - log OR(training
       basis)| raw vs mapped, all days and days the training basis puts at Low or above (OR >= 2), plus class agreement.
       Intervals: bootstrap over tehsils (1000).
Rule   the mapping is SERVED only if, held out, the improvement (raw - mapped) has a 95 % interval above zero for the KS distance of all
       three features AND for the log-odds error on Low-or-above days. Otherwise the file is written with served:false.
usage  python3 landslide_basis_fit.py <landslide-basis dir> <units.json> <odds model json> <out map json> <out evidence json>"""
import sys, os, json, glob, numpy as np, pandas as pd
BD, UF, MF, OUT, EVO = sys.argv[1:6]
U = {u['unitId']: u for u in json.load(open(UF, encoding='utf-8'))}; M = json.load(open(MF, encoding='utf-8'))
P = np.round(np.arange(0, 1.0001, 0.005), 3); SPLIT = '2025-01-01'; FEAT = ['P1', 'P3', 'P7']
def series(f):
    d = json.load(open(f, encoding='utf-8'))['daily']; s = pd.Series(d['rain_sum'], index=pd.to_datetime(d['time']), dtype=float); return s.clip(lower=0)
def feats(s):
    s = s.asfreq('D'); P1 = np.maximum(s, s.shift(-1).fillna(0)); P3 = s.rolling(3, min_periods=3).sum(); P7 = s.rolling(7, min_periods=7).sum()
    return pd.DataFrame({'P1': P1, 'P3': P3, 'P7': P7}).where(s.notna())
def knots(served, train):
    a = np.asarray(served, float); b = np.asarray(train, float); a = a[~np.isnan(a)]; b = b[~np.isnan(b)]
    return {'p': P.tolist(), 'served': np.round(np.quantile(a, P), 3).tolist(), 'train': np.round(np.quantile(b, P), 3).tolist(), 'dryShare': round(float(np.mean(a <= 0.05)), 4)}
def apply(K, x):
    x = np.asarray(x, float); qs = np.array(K['served']); qt = np.array(K['train']); out = np.full_like(x, np.nan)
    dry = x <= 0.05; out[dry] = np.interp(K['dryShare'] / 2, P, qt)
    w = ~dry & ~np.isnan(x); i0 = int(np.searchsorted(P, K['dryShare'])); xs, ys = qs[i0:], qt[i0:]
    xs, idx = np.unique(xs, return_index=True); ys = ys[idx]
    top = xs[-1] if len(xs) else 0; r = (ys[-1] / xs[-1]) if len(xs) and xs[-1] > 0 else 1.0
    out[w] = np.where(x[w] > top, x[w] * r, np.interp(x[w], xs, ys) if len(xs) > 1 else x[w] * r); return out
def logor(F, months):
    s = np.zeros(len(F))
    for j, k in enumerate(M['features']):
        ref = np.array([((M.get('referenceByMonth') or {}).get(str(m)) or M['reference'])[k] for m in months])
        s += M['coef'][j] * (np.log1p(F[k].values) - np.log1p(ref))
    return s
cls = lambda lo: np.digitize(np.exp(lo), [2, 5, 10, 20])
data = {}
for f in glob.glob(os.path.join(BD, 'hist', '*.json')):
    fa = os.path.join(BD, 'archive', os.path.basename(f))
    if not os.path.exists(fa): continue
    uid = json.load(open(f, encoding='utf-8')).get('agn', {}).get('unitId')
    if uid not in U: continue
    S, A = feats(series(f)), feats(series(fa)); idx = S.index.intersection(A.index); data[uid] = (S.loc[idx], A.loc[idx])
grp = lambda uid: U[uid]['province'] + '|' + ('mountain' if (U[uid].get('elevM') or 0) >= 1000 else 'plains')
G = {}
for uid, (S, A) in data.items():
    tr = S.index < SPLIT
    G.setdefault(grp(uid), {k: ([], []) for k in FEAT})
    for k in FEAT: G[grp(uid)][k][0].append(S.loc[tr, k].values); G[grp(uid)][k][1].append(A.loc[tr, k].values)
GK = {g: {k: knots(np.concatenate(v[k][0]), np.concatenate(v[k][1])) for k in FEAT} for g, v in G.items()}
MAP = {}; rows = []
for uid, (S, A) in data.items():
    tr = S.index < SPLIT; te = ~tr
    own = int((S.loc[tr, 'P1'] > 0.05).sum()) >= 100
    K = {k: knots(S.loc[tr, k], A.loc[tr, k]) for k in FEAT} if own else GK[grp(uid)]
    MAP[uid] = {'basis': 'tehsil' if own else 'group:' + grp(uid), **({k: K[k] for k in FEAT} if own else {})}
    if te.sum() < 60: continue
    St, At = S.loc[te].dropna(), A.loc[te].dropna(); ix = St.index.intersection(At.index); St, At = St.loc[ix], At.loc[ix]
    Mt = pd.DataFrame({k: apply(K[k], St[k].values) for k in FEAT}, index=ix)
    r = {'uid': uid, 'basis': MAP[uid]['basis'], 'days': len(ix)}
    from scipy.stats import ks_2samp
    for k in FEAT:
        r['ks_raw_' + k] = ks_2samp(St[k], At[k]).statistic; r['ks_map_' + k] = ks_2samp(Mt[k], At[k]).statistic
        for q in (0.9, 0.95, 0.99):
            r[f'qe_raw_{k}_{q}'] = abs(np.quantile(St[k], q) - np.quantile(At[k], q)); r[f'qe_map_{k}_{q}'] = abs(np.quantile(Mt[k], q) - np.quantile(At[k], q))
    mo = ix.month.values; la, ls, lm = logor(At, mo), logor(St, mo), logor(Mt, mo); ev = np.exp(la) >= 2
    r.update(lor_raw=float(np.mean(np.abs(ls - la))), lor_map=float(np.mean(np.abs(lm - la))), ev_days=int(ev.sum()),
             lor_raw_ev=float(np.mean(np.abs(ls[ev] - la[ev]))) if ev.any() else np.nan, lor_map_ev=float(np.mean(np.abs(lm[ev] - la[ev]))) if ev.any() else np.nan,
             cls_raw=float(np.mean(cls(ls) == cls(la))), cls_map=float(np.mean(cls(lm) == cls(la))))
    rows.append(r)
R = pd.DataFrame(rows)
def boot(d, nb=1000, seed=3):
    d = np.asarray(d, float); d = d[~np.isnan(d)]; rng = np.random.default_rng(seed)
    if len(d) < 5: return [None, None]
    m = [rng.choice(d, len(d)).mean() for _ in range(nb)]; return [round(float(np.percentile(m, 2.5)), 4), round(float(np.percentile(m, 97.5)), 4)]
ev = {'tehsils_tested': int(len(R)), 'tehsils_mapped': len(MAP), 'own_basis': int(sum(v['basis'] == 'tehsil' for v in MAP.values())), 'fit': '2022-01-01..2024-12-31', 'test': SPLIT + '..'}
if len(R):
    for k in FEAT: ev['ks_' + k] = {'raw': round(R['ks_raw_' + k].mean(), 4), 'mapped': round(R['ks_map_' + k].mean(), 4), 'improvement_ci95': boot(R['ks_raw_' + k] - R['ks_map_' + k])}
    for k in FEAT:
        for q in (0.9, 0.95, 0.99): ev[f'qerr_{k}_p{int(q*100)}'] = {'raw': round(R[f'qe_raw_{k}_{q}'].mean(), 2), 'mapped': round(R[f'qe_map_{k}_{q}'].mean(), 2)}
    ev['logodds_all'] = {'raw': round(R.lor_raw.mean(), 4), 'mapped': round(R.lor_map.mean(), 4), 'improvement_ci95': boot(R.lor_raw - R.lor_map)}
    ev['logodds_low_or_above'] = {'raw': round(R.lor_raw_ev.mean(), 4), 'mapped': round(R.lor_map_ev.mean(), 4), 'improvement_ci95': boot(R.lor_raw_ev - R.lor_map_ev), 'days': int(R.ev_days.sum())}
    ev['class_agreement'] = {'raw': round(R.cls_raw.mean(), 4), 'mapped': round(R.cls_map.mean(), 4), 'improvement_ci95': boot(R.cls_map - R.cls_raw)}
    passed = all((ev['ks_' + k]['improvement_ci95'][0] or 0) > 0 for k in FEAT) and (ev['logodds_low_or_above']['improvement_ci95'][0] or 0) > 0
else: passed = False
ev['rule'] = 'served only if the held-out improvement (raw - mapped) has a 95 % interval above zero for the KS distance of P1, P3 and P7 and for the log-odds error on Low-or-above days'
ev['passed'] = bool(passed); ev['oddsModel'] = M.get('version')
out = {'name': 'landslide-basis-map', 'version': 'landslide-basis-map-91.17.283', 'built': pd.Timestamp.now(tz='Asia/Karachi').isoformat()[:19], 'served': bool(passed),
       'what': 'quantile mapping of the served past rain (historical-forecast basis, Asia/Karachi days, tehsil point and settlement height) onto the odds model training basis (archive rain_sum, UTC days), per feature P1/P3/P7',
       'method': 'empirical quantile mapping, knots every 0.5 percentile, dry frequency adaptation, top-knot ratio above the top (scripts/gen/ws5/landslide_basis_fit.py)',
       'groups': GK, 'units': MAP, 'heldOut': ev}
json.dump(out, open(OUT, 'w')); json.dump(ev, open(EVO, 'w'), indent=1); print(json.dumps(ev, indent=1))
