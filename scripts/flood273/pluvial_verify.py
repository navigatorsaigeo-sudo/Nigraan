"""v91.17.273 FLOOD · pluvial level against the observed flood extents NIGRAAN holds (2010, 2014, 2022, 2025).
Inputs (all held): data/flood273/extent-share.json (extent_share.py), data/flood273/land_storm.json (the served pluvial chain on a
standard storm, land_storm.mjs), data/chirps-tehsil.npz (CHIRPS v3 tehsil pentads 1991-2026, observed rain), zones from the served
forecast archive (data/archive/forecast, field z). Flooded = mapped flooded share >= 1 % of the tehsil (also 5 %).
What it can and cannot test is written in the output (no hourly rain for 2022/2025 is held, so the served daily level itself is
not replayed). Output: data/flood273/pluvial-verify.json + printed tables."""
import json, gzip, sys, os, numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.isotonic import IsotonicRegression
ROOT = sys.argv[1]; D = os.path.join(ROOT, 'data')
SH = json.load(open(f'{D}/flood273/extent-share.json'))['shares']; LS = json.load(open(f'{D}/flood273/land_storm.json'))
Z = {}
for f in ('fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz'):
    for l in gzip.open(f'{D}/archive/forecast/{f}', 'rt'):
        try: r = json.loads(l); Z[r['u']] = r.get('z')
        except Exception: pass
C = np.load(f'{D}/chirps-tehsil.npz'); uids = list(C['uids']); keys = list(C['keys']); P = C['P']
YRS = ['2010', '2014', '2022', '2025']
def season(y):   # Jun-Sep pentads of year y
    return [i for i, k in enumerate(keys) if k.startswith(y + '.') and 6 <= int(k[5:7]) <= 9]
clim_idx = [i for i, k in enumerate(keys) if 1991 <= int(k[:4]) <= 2020 and 6 <= int(k[5:7]) <= 9]
rows = []
for y in YRS:
    si = season(y)
    if not si: continue
    for j, u in enumerate(uids):
        if u not in SH[y] or u not in LS: continue
        p = P[j, si]; pc = P[j, clim_idx]
        mx = float(np.nanmax(p)) if np.isfinite(p).any() else np.nan; tot = float(np.nansum(p))
        cl_mx = np.nanpercentile(pc, 95) if np.isfinite(pc).any() else np.nan
        rows.append(dict(u=u, y=y, z=Z.get(u) or 'unknown', share=SH[y][u], mx=mx, tot=tot,
                         rmx=(mx / cl_mx) if cl_mx and cl_mx > 0 else np.nan,
                         heavy=LS[u].get('heavy'), lvH=LS[u].get('lv_heavy')))
import pandas as pd
df = pd.DataFrame(rows); df['f1'] = (df.share >= 0.01).astype(int); df['f5'] = (df.share >= 0.05).astype(int)
out = {'n': len(df), 'flooded1ByYear': df.groupby('y').f1.sum().to_dict(), 'tables': {}}
def auc(y, s):
    m = np.isfinite(s); y = y[m]; s = s[m]
    return round(float(roc_auc_score(y, s)), 3) if len(set(y)) > 1 else None
print('tehsil-years', len(df), 'flooded(>=1%) by year', out['flooded1ByYear'])
# 1 · the served chain's place term (standard heavy storm): does it rank flooded tehsils higher?
T1 = {}
for y in YRS:
    g = df[df.y == y]; T1[y] = {'all': auc(g.f1.values, g.heavy.values.astype(float))}
    for z, gz in g.groupby('z'): T1[y][z] = auc(gz.f1.values, gz.heavy.values.astype(float))
out['tables']['aucServedPlaceTermHeavyStorm'] = T1; print('AUC served place term (heavy storm) by year/zone', T1)
# hit rate / false alarm per served level under the standard heavy storm (what the served ladder says about a place, same rain)
T2 = {}
for y in YRS:
    g = df[(df.y == y) & (df.lvH >= 0)]; T2[y] = {}
    for L in range(5):
        at = g[g.lvH >= L]
        if not len(at): continue
        T2[y][L] = {'warned': int(len(at)), 'hitRate': round(at.f1.sum() / max(g.f1.sum(), 1), 3), 'falseAlarmRatio': round(1 - at.f1.mean(), 3)}
out['tables']['hitFalseAlarmByServedLevelHeavyStorm'] = T2; print('hit/FAR by served level (heavy storm):', json.dumps(T2))
# 2 · observed rain (CHIRPS season peak pentad, its ratio to the tehsil's own 1991-2020 95th percentile, season total)
T3 = {}
for y in YRS:
    g = df[df.y == y]; T3[y] = {c: auc(g.f1.values, g[c].values) for c in ('mx', 'rmx', 'tot')}
    T3[y]['byZone_rmx'] = {z: auc(gz.f1.values, gz.rmx.values) for z, gz in g.groupby('z')}
out['tables']['aucObservedRain'] = T3; print('AUC observed rain', json.dumps(T3))
# 3 · could a data-derived level (isotonic flooded-share on observed-rain rarity x served place term) beat chance on held-out years?
df['x'] = np.log(df.rmx.clip(lower=1e-3)) + np.log(df.heavy.astype(float).clip(lower=1))
T4 = {}
for y in YRS:
    tr = df[(df.y != y) & np.isfinite(df.x)]; te = df[(df.y == y) & np.isfinite(df.x)]
    iso = IsotonicRegression(out_of_bounds='clip').fit(tr.x, tr.f1); p = iso.predict(te.x)
    base = tr.f1.mean(); bs = float(np.mean((p - te.f1) ** 2)); bc = float(np.mean((base - te.f1) ** 2))
    T4[y] = {'auc': auc(te.f1.values, p), 'brierSkillVsClimatology': round(1 - bs / bc, 3)}
out['tables']['heldOutIsotonicRainRarityTimesPlace'] = T4; print('held-out isotonic', T4)
out['zonesFlooded'] = df.groupby(['y', 'z']).f1.agg(['size', 'sum']).reset_index().to_dict('records')
json.dump(out, open(f'{D}/flood273/pluvial-verify.json', 'w'), indent=1, default=str)
# 4 · away from modelled rivers: tehsils the served river layer marks "no modelled river reach" (flood_riverine not applicable on
#     day 0 of the engine report) - there a mapped flood is more likely from local rain than from a river
EL = json.load(open(f'{D}/engine-latest.json')); NR = {u for u, v in EL['days'][0]['layers']['flood_riverine']['L'].items() if v == -2}
g = df[df.u.isin(NR)]; T5 = {'tehsils': len(NR)}
for y in YRS:
    gy = g[g.y == y]; T5[y] = {'flooded': int(gy.f1.sum()), 'aucServedPlaceTerm': auc(gy.f1.values, gy.heavy.values.astype(float)), 'aucObservedRainRarity': auc(gy.f1.values, gy.rmx.values)}
out['tables']['noRiverReachTehsils'] = T5; print('no modelled river reach:', T5)
json.dump(out, open(f'{D}/flood273/pluvial-verify.json', 'w'), indent=1, default=str)
