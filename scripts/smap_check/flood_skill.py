#!/usr/bin/env python3
"""v91.17.169 - does the satellite near-surface soil water rank the observed flooded share of a tehsil beyond rain, floodplain
and the model's soil water? The flood half of the SMAP-in-wetness decision (landslide half: landslide_skill.py).

Observed  data/flood-extent-calibration.json floodedShare per tehsil: hi2022 (72), viirs2022, pk2022, pk2025 (458 each),
          via station-lake/archive/floods/cn_backtest.csv (which also carries s_p = HAND floodplain share x event-season rain)
Predictor the June mean (the month before the July-August flood rain, both years) of
          smap  SMAP L3 Enhanced 9 km AM+PM, 3x3 pixels at the tehsil point
          model ERA5-Land 0-7 cm soil water at the nearest 0.1 deg point (the same layer depth as SMAP)
          each as a percentile of the June means of 2015-2025 without the event year
Test      Spearman; partial Spearman over s_p; partial over s_p + model (what SMAP adds beyond what is already served);
          bootstrap 90 % interval of the last one over tehsils
Rule      (fixed before the run, same as the landslide half) SMAP enters the wetness level only if the partial over
          s_p + model is above zero with its 90 % interval, in the large sets (viirs2022, pk2022, pk2025)
Output    nigraan-local/data/smap-flood-skill.json
"""
import json, datetime as dt, numpy as np, pandas as pd, netCDF4 as nc
from pyproj import Transformer
from scipy.stats import spearmanr, rankdata

NIG = '/home/claude/nig'
U = {u['unitId']: u for u in json.load(open(f'{NIG}/nigraan-local/server/contract/units.json')) if u.get('lat') is not None}
C = pd.read_csv(f'{NIG}/station-lake/archive/floods/cn_backtest.csv'); C = C[C.set.isin(['hi2022', 'viirs2022', 'pk2022', 'pk2025'])]
ids = sorted(set(C.uid) & set(U))

z = np.load(f'{NIG}/smap/sm_all.npz'); SD = np.array([dt.date.fromisoformat(x) for x in z['days']]); CUBE = z['cube']
r0, r1, c0, c1 = np.load(f'{NIG}/smap/rc.npy')
TR = Transformer.from_crs(4326, 6933, always_xy=True); CELL = 9008.055210146; X0 = -17367530.44516138; Y0 = 7314540.83063815
YEARS = range(2015, 2026); SJ = {}
for y in YEARS:
    m = np.array([d.year == y and d.month == 6 for d in SD]); blk = CUBE[m].astype('float32')
    with np.errstate(all='ignore'): SJ[y] = np.nanmean(blk, 0)
del CUBE, z
def smap_june(u, y):
    x, yy = TR.transform(u['lon'], u['lat']); c = int((x - X0) // CELL) - c0; r = int((Y0 - yy) // CELL) - r0
    with np.errstate(all='ignore'): return float(np.nanmean(SJ[y][max(0, r - 1):r + 2, max(0, c - 1):c + 2]))
EJ = {}
for y in YEARS:
    D = nc.Dataset(f'{NIG}/smap/era5l/swvl1_h_{y}.nc'); t = nc.num2date(D['valid_time'][:], D['valid_time'].units)
    m = np.array([x.month == 6 for x in t]); EJ[y] = np.nanmean(np.ma.filled(D['swvl1'][m].astype('float32'), np.nan), 0)
    lat5 = D['latitude'][:]; lon5 = D['longitude'][:]; D.close()
def e5_june(u, y): return float(EJ[y][int(np.abs(lat5 - u['lat']).argmin()), int(np.abs(lon5 - u['lon']).argmin())])

def pct(f, u, y):
    x = f(u, y); ref = [f(u, yy) for yy in YEARS if yy != y]; ref = [v for v in ref if v == v]
    if x != x or len(ref) < 6: return np.nan
    return float((np.sum(np.array(ref) < x) + 0.5 * np.sum(np.array(ref) == x)) / len(ref))
def partial(a, b, Z):
    """Spearman partial correlation of a and b given the columns of Z (residuals of ranks on ranks)"""
    ra, rb = rankdata(a), rankdata(b); RZ = np.column_stack([np.ones(len(a))] + [rankdata(z) for z in Z])
    ea = ra - RZ @ np.linalg.lstsq(RZ, ra, rcond=None)[0]; eb = rb - RZ @ np.linalg.lstsq(RZ, rb, rcond=None)[0]
    return float(np.corrcoef(ea, eb)[0, 1])

out = {}; rng = np.random.default_rng(1)
for s, g in C.groupby('set'):
    yr = int(g.year.iloc[0]); g = g[g.uid.isin(ids)].copy()
    g['smap'] = [pct(smap_june, U[k], yr) for k in g.uid]; g['model'] = [pct(e5_june, U[k], yr) for k in g.uid]
    g = g.dropna(subset=['smap', 'model', 'flooded', 's_p'])
    f, sp, sm, mo = g.flooded.values, g.s_p.values, g.smap.values, g.model.values
    bt = []
    for _ in range(1000):
        i = rng.integers(0, len(g), len(g))
        try: bt.append(partial(sm[i], f[i], [sp[i], mo[i]]))
        except Exception: pass
    out[s] = {'n': int(len(g)), 'year': yr, 'smap': round(float(spearmanr(sm, f)[0]), 3), 'model': round(float(spearmanr(mo, f)[0]), 3),
              'smap|s_p': round(partial(sm, f, [sp]), 3), 'model|s_p': round(partial(mo, f, [sp]), 3),
              'smap|s_p+model': round(partial(sm, f, [sp, mo]), 3), 'smap|s_p+model_ci90': [round(float(np.nanquantile(bt, .05)), 3), round(float(np.nanquantile(bt, .95)), 3)],
              'smap_vs_model_r': round(float(spearmanr(sm, mo)[0]), 3)}
big = [out[k] for k in ('viirs2022', 'pk2022', 'pk2025') if k in out]
enter = bool(big) and all(b['smap|s_p+model_ci90'][0] > 0 for b in big)
J = {'version': 'smap-flood-skill-91.17.169', 'built': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'),
     'question': 'does the June satellite near-surface soil water rank the observed 2022 / 2025 flooded share beyond floodplain x rain and the model soil water',
     'rule': 'enters the wetness level only if the partial Spearman over s_p + model is above zero with its 90 % interval in viirs2022, pk2022 and pk2025',
     'sets': out, 'decision': ('SMAP enters the wetness level for flood' if enter else 'SMAP does not enter the wetness level for flood'),
     'limits': ['two flood years', 'June mean as the antecedent state; the onset differs by region', 'the flood maps differ in sensor and resolution (hi2022 is 72 tehsils)']}
json.dump(J, open(f'{NIG}/nigraan-local/data/smap-flood-skill.json', 'w'), indent=1); print(json.dumps(J['sets'], indent=1)); print(J['decision'])
