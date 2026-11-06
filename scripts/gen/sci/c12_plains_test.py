"""SCI item 4 · audit C12 · the urban heat layer's within-city ranking in held-out plains cities (rule: /tmp/claude-0/sci/RULES.md item 4).
usage: python3 c12_plains_test.py <mach_hourly_clean.csv.gz> <stations.json> <layer.json> <out.json>"""
import sys, json, math, numpy as np, pandas as pd
from scipy.stats import spearmanr
HF, SF, LF, OUT = sys.argv[1:5]
S = pd.DataFrame(json.load(open(SF))).set_index('station'); L = json.load(open(LF))
def km(a, b): return math.hypot((a.lon - b.lon) * 111.32 * math.cos(math.radians(a.lat)), (a.lat - b.lat) * 110.57)
CAL = lambda s: 33.4 <= s.lat <= 33.85 and 72.85 <= s.lon <= 73.35   # Islamabad / Rawalpindi: calibration stations
cand = S[(S.elev < 1000) & ~S.apply(CAL, axis=1)].sort_values('lat')
cities, used = {}, set()
for st, s in cand.iterrows():
    if st in used: continue
    mem = [t for t, u in cand.iterrows() if t not in used and km(s, u) <= 25]
    if len(mem) >= 3: cities[s['name'].split(',')[-1].strip() or st] = mem; used.update(mem)
def sunset_utc_h(lat, lon, doy):   # NOAA approximate
    g = 2 * math.pi / 365 * (doy - 1); decl = 0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g)
    eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    ha = math.degrees(math.acos(math.cos(math.radians(90.833)) / (math.cos(math.radians(lat)) * math.cos(decl)) - math.tan(math.radians(lat)) * math.tan(decl)))
    return (720 - 4 * (lon - ha) - eqt) / 60
allst = [t for m in cities.values() for t in m]
X = pd.read_csv(HF, usecols=['station', 'hour_utc', 'temp_c', 'wind_kmh']); X = X[X.station.isin(allst) & X.temp_c.notna()]
X['t'] = pd.to_datetime(X.hour_utc.str.replace('Z', ''))
res = dict(rule='RULES.md item 4', cities={}, stations=[])
for c, mem in cities.items():
    la, lo = S.loc[mem].lat.mean(), S.loc[mem].lon.mean(); Y = X[X.station.isin(mem)]
    days = pd.to_datetime(Y.t.dt.date.unique())
    tgt = {d: d + pd.Timedelta(hours=round(sunset_utc_h(la, lo, d.dayofyear) + 2)) for d in days}
    Y = Y[Y.t.isin(set(tgt.values()))]
    P = Y.pivot_table(index='t', columns='station', values='temp_c'); Wd = Y.pivot_table(index='t', columns='station', values='wind_kmh').mean(1)
    P = P.dropna(axis=1, thresh=15)
    if P.shape[1] < 3: continue
    # use the evenings with every kept station reporting; if too few, drop the sparsest station until >= 15 evenings
    while P.dropna().shape[0] < 15 and P.shape[1] > 3: P = P.drop(columns=P.notna().sum().idxmin())
    Q = P.dropna(); Q = Q[Wd.reindex(Q.index) < Wd.reindex(Q.index).median()]
    if len(Q) < 15 or Q.shape[1] < 3: res['cities'][c] = dict(skipped=f'{len(Q)} calm evenings, {Q.shape[1]} stations'); continue
    anom = Q.sub(Q.mean(1), axis=0)
    pred = {s: (L[s]['maxC'] if L.get(s, {}).get('urban') and L[s]['maxC'] is not None else 0.0) for s in Q.columns}
    pm = np.mean(list(pred.values()))
    res['cities'][c] = dict(stations=list(Q.columns), evenings=len(Q), period=[str(Q.index.min()), str(Q.index.max())])
    for s in Q.columns:
        res['stations'].append(dict(city=c, station=s, name=S.loc[s, 'name'], obs=round(float(anom[s].mean()), 3), pred=round(float(pred[s] - pm), 3), layerUrban=bool(L.get(s, {}).get('urban'))))
R = pd.DataFrame(res['stations']); o, p = R.obs.values, R.pred.values
rng = np.random.default_rng(5); rh, dm = [], []
for _ in range(2000):
    i = rng.integers(0, len(R), len(R))
    if np.std(p[i]) == 0 or np.std(o[i]) == 0: continue
    rh.append(spearmanr(p[i], o[i]).statistic); dm.append(np.mean(np.abs(p[i] - o[i])) - np.mean(np.abs(o[i])))
ci = lambda v: [round(float(np.percentile(v, 2.5)), 3), round(float(np.percentile(v, 97.5)), 3)]
res['summary'] = dict(n=len(R), rho=round(float(spearmanr(p, o).statistic), 3), rho_ci=ci(rh), mae_layer=round(float(np.mean(np.abs(p - o))), 3), mae_null=round(float(np.mean(np.abs(o))), 3), mae_diff_ci=ci(dm),
                      signAgree=round(float(np.mean(np.sign(p) == np.sign(o))), 3))
s = res['summary']; res['verdict'] = 'SUPPORTED' if s['rho_ci'][0] > 0 and s['mae_diff_ci'][1] < 0 else 'WRONG SIGN' if s['rho_ci'][1] < 0 else 'NO SKILL'
json.dump(res, open(OUT, 'w'), indent=1); print(json.dumps({k: v for k, v in res.items() if k != 'stations'}, indent=1)); print(R.to_string())
