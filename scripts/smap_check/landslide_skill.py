#!/usr/bin/env python3
"""v91.17.169 - does the satellite near-surface soil water add landslide skill beyond rain and the model's own soil water?

Decides whether SMAP enters the wetness level. Rule, fixed before the run: SMAP enters only if adding it to
rain + model soil water raises the leave-one-year-out AUC with the paired-bootstrap 90 % interval above zero.

Cases     NASA Global Landslide Catalog, rain-triggered, inside the tehsil polygons (station-lake/reports/landslide_events.csv),
          2015-04-15 .. 2017-12-31 (the SMAP overlap; the catalogue ends 2017)
Controls  every other day at the same 0.1 deg cell, same season (month +-1), same years, not within 3 days of an event there
          (the design of station-lake/scripts/landslide_prob_liquid.py, the served landslide odds model)
Features  rain:  log(1+P1), log(1+P3), log(1+P7), ERA5 liquid rain at the event point (the served model's inputs, same cache)
          model: ERA5-Land 0-7 cm soil water (swvl1), mean of days -3..-1, as a percentile of the same pentad +-1 in 2015-2025
          smap:  SMAP L3 Enhanced 9 km (SPL3SMP_E v006) AM+PM, 3x3 pixels, mean of days -3..-1 (revisit 2-3 days), same percentile
          Days -3..-1: the state before the trigger day, so a retrieval after the rain cannot leak into the predictor.
Models    A rain | B rain+model | C rain+smap | D rain+model+smap; logistic, leave-one-year-out (2015, 2016, 2017)
Test      AUC per model; paired bootstrap over cells (2000) of D-B and C-A
Output    nigraan-local/data/smap-landslide-skill.json
"""
import os, sys, json, datetime as dt, numpy as np, pandas as pd, netCDF4 as nc
from pyproj import Transformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

NIG = '/home/claude/nig'; SL = f'{NIG}/station-lake'; sys.path.insert(0, f'{SL}/scripts')
import landslide_backtest as LB
KEY = open(f'{NIG}/nigraan-local/mach.key').read().strip()
def _fetch_rain(lat, lon, start, end, hourly, key):
    import urllib.parse
    q = {'latitude': round(lat, 4), 'longitude': round(lon, 4), 'start_date': start, 'end_date': end, 'timezone': 'UTC', 'daily': 'rain_sum', 'apikey': KEY}
    j = LB.get(LB.HOST + '?' + urllib.parse.urlencode(q)); j['daily']['precipitation_sum'] = j['daily']['rain_sum']; return j

D0, D1 = dt.date(2015, 4, 15), dt.date(2017, 12, 31)
EV = pd.read_csv(f'{SL}/reports/landslide_events.csv')

# daily calendar shared by both sources
CAL0 = dt.date(2015, 1, 1); CAL = [CAL0 + dt.timedelta(k) for k in range((dt.date(2026, 10, 3) - CAL0).days + 1)]; NC = len(CAL)
DOY = np.array([d.timetuple().tm_yday for d in CAL]); YR = np.array([d.year for d in CAL])
PTS = EV.groupby('cell').first()[['lat', 'lon']]

# SMAP: series at the event cells only (3x3 mean), then the cube is released
z = np.load(f'{NIG}/smap/sm_all.npz'); SD = [dt.date.fromisoformat(x) for x in z['days']]; CUBE = z['cube']
r0, r1, c0, c1 = np.load(f'{NIG}/smap/rc.npy')
TR = Transformer.from_crs(4326, 6933, always_xy=True); CELL = 9008.055210146; X0 = -17367530.44516138; Y0 = 7314540.83063815
pos = np.array([(d - CAL0).days for d in SD]); SS = {}
for cell, (lat, lon) in PTS.iterrows():
    x, y = TR.transform(lon, lat); c = int((x - X0) // CELL) - c0; r = int((Y0 - y) // CELL) - r0
    a = np.full(NC, np.nan, 'float32')
    with np.errstate(all='ignore'): a[pos] = np.nanmean(CUBE[:, max(0, r - 1):r + 2, max(0, c - 1):c + 2].astype('float32').reshape(len(SD), -1), 1)
    SS[cell] = a
del CUBE, z

# ERA5-Land swvl1 0-7 cm, twice daily -> daily mean, nearest 0.1 deg point
ES = {cell: np.full(NC, np.nan, 'float32') for cell in PTS.index}
for yy in range(2015, 2027):
    D = nc.Dataset(f'{NIG}/smap/era5l/swvl1_h_{yy}.nc'); t = nc.num2date(D['valid_time'][:], D['valid_time'].units)
    lat5 = D['latitude'][:]; lon5 = D['longitude'][:]; di = np.array([(dt.date(x.year, x.month, x.day) - CAL0).days for x in t])
    for cell, (lat, lon) in PTS.iterrows():
        i = int(np.abs(lat5 - lat).argmin()); j = int(np.abs(lon5 - lon).argmin())
        v = np.ma.filled(D['swvl1'][:, i, j].astype('float32'), np.nan)
        for k in np.unique(di):
            if 0 <= k < NC: ES[cell][k] = np.nanmean(v[di == k])
    D.close()

def prep(a):
    """3-day antecedent mean (days -3..-1) and, per day of year, the sorted 2015-2025 reference within +-7 days"""
    with np.errstate(all='ignore'):
        m3 = np.nanmean(np.stack([np.r_[np.full(k, np.nan), a[:-k]] for k in (1, 2, 3)]), 0)
    ok = ~np.isnan(m3) & (YR <= 2025); ref = {}
    for d in range(1, 367):
        dd = np.abs(DOY - d); dd = np.minimum(dd, 366 - dd); ref[d] = np.sort(m3[ok & (dd <= 7)])
    return m3, ref
def pct(m3ref, d):
    m3, ref = m3ref; k = (d - CAL0).days; x = m3[k]; R = ref[d.timetuple().tm_yday]
    if x != x or len(R) < 20: return np.nan
    return float((np.searchsorted(R, x, 'left') + np.searchsorted(R, x, 'right')) / 2 / len(R))
SP = {c: prep(v) for c, v in SS.items()}; EP = {c: prep(v) for c, v in ES.items()}

rows = []
for cell, g in EV.groupby('cell'):
    r = g.iloc[0]
    try: dd = _fetch_rain(r.lat, r.lon, '2007-01-01', '2017-12-31', False, 'cached')
    except Exception as e: print('no rain cache', cell, str(e)[:60]); continue
    dts = dd['daily']['time']; dv = np.array([np.nan if x is None else x for x in dd['daily']['precipitation_sum']], float); ix = {d: i for i, d in enumerate(dts)}
    ev_days = set(pd.to_datetime(g.date).dt.date); months = set(pd.to_datetime(g.date).dt.month)
    if not any(D0 <= e <= D1 for e in ev_days): continue          # cells with no event in the SMAP overlap carry no case
    P = lambda n, i: float(np.nansum(dv[max(0, i - n + 1):i + 1]))
    def feat(i, d): return (max(P(1, i), P(1, i + 1) if i + 1 < len(dv) else 0), P(3, i), P(7, i), pct(EP[cell], d), pct(SP[cell], d))
    for e in g.itertuples():
        d = dt.date.fromisoformat(e.date)
        if not (D0 <= d <= D1) or e.date not in ix: continue
        rows.append((cell, d.year, e.date, 1) + feat(ix[e.date], d))
    for d in (D0 + dt.timedelta(k) for k in range((D1 - D0).days + 1)):
        if not any(abs(((d.month - m + 6) % 12) - 6) <= 1 for m in months): continue
        if any(abs((d - e).days) <= 3 for e in ev_days): continue
        if d.isoformat() not in ix: continue
        rows.append((cell, d.year, d.isoformat(), 0) + feat(ix[d.isoformat()], d))
T = pd.DataFrame(rows, columns=['cell', 'year', 'date', 'y', 'P1', 'P3', 'P7', 'model', 'smap'])
n0 = len(T); T = T.dropna(); print('rows', n0, 'complete', len(T), 'cases', int(T.y.sum()), 'cells', T.cell.nunique(), flush=True)

R = ['P1', 'P3', 'P7']
def X(cols):
    a = [np.log1p(T[c].clip(lower=0).values) for c in cols if c in R] + [T[c].values for c in cols if c not in R]; return np.column_stack(a)
SETS = {'A_rain': R, 'B_rain_model': R + ['model'], 'C_rain_smap': R + ['smap'], 'D_rain_model_smap': R + ['model', 'smap']}
y = T.y.values; yrs = T.year.values; OOF = {}; COEF = {}
for k, cols in SETS.items():
    Xk = X(cols); o = np.full(len(T), np.nan)
    for yr in np.unique(yrs):
        tr = yrs != yr
        m = LogisticRegression(C=1.0, max_iter=3000).fit(Xk[tr], y[tr]); o[~tr] = m.decision_function(Xk[~tr])
    OOF[k] = o; COEF[k] = dict(zip(cols, LogisticRegression(C=1.0, max_iter=3000).fit(Xk, y).coef_[0].round(3).tolist()))
AUC = {k: round(float(roc_auc_score(y, o)), 4) for k, o in OOF.items()}
cells = T.cell.values; uc = np.unique(cells); idx = {c: np.where(cells == c)[0] for c in uc}; rng = np.random.default_rng(1)
def boot(a, b, n=2000):
    out = []
    for _ in range(n):
        s = np.concatenate([idx[c] for c in rng.choice(uc, len(uc))])
        if y[s].sum() < 5 or y[s].sum() == len(s): continue
        out.append(roc_auc_score(y[s], OOF[a][s]) - roc_auc_score(y[s], OOF[b][s]))
    out = np.array(out); return {'gain': round(float(roc_auc_score(y, OOF[a]) - roc_auc_score(y, OOF[b])), 4), 'ci90': [round(float(np.quantile(out, .05)), 4), round(float(np.quantile(out, .95)), 4)], 'n': len(out)}
G = {'smap_over_model (D-B)': boot('D_rain_model_smap', 'B_rain_model'), 'smap_over_rain (C-A)': boot('C_rain_smap', 'A_rain'),
     'model_over_rain (B-A)': boot('B_rain_model', 'A_rain')}
# case-day percentiles (is the ground wetter before a landslide day than on ordinary days?)
pc = {k: {'cases_median': round(float(T[T.y == 1][k].median()), 3), 'controls_median': round(float(T[T.y == 0][k].median()), 3)} for k in ('model', 'smap')}
enter = G['smap_over_model (D-B)']['ci90'][0] > 0
J = {'version': 'smap-landslide-skill-91.17.169', 'built': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'),
     'question': 'does the satellite near-surface soil water add landslide skill beyond rain and the model soil water',
     'rule': 'SMAP enters the wetness level only if D (rain+model+smap) beats B (rain+model) with the paired-bootstrap 90 % interval of the AUC gain above zero',
     'design': 'case-control, NASA Global Landslide Catalog rain-triggered events 2015-04-15..2017-12-31 inside Pakistan, controls same cell and season, leave-one-year-out',
     'cases': int(y.sum()), 'controls': int((1 - y).sum()), 'cells': int(T.cell.nunique()), 'auc': AUC, 'gains': G, 'coefficients_full_fit': COEF,
     'antecedentPercentile': pc, 'decision': ('SMAP enters the wetness level' if enter else 'SMAP stays a separate reading; it does not enter the wetness level'),
     'limits': ['88-case window (the catalogue ends 2017): a small gain cannot be resolved', 'news-based catalogue: events near roads and towns are over-represented',
                'model soil water here is ERA5-Land 0-7 cm, the reanalysis twin of the served forecast-model state, not the served value itself']}
json.dump(J, open(f'{NIG}/nigraan-local/data/smap-landslide-skill.json', 'w'), indent=1); print(json.dumps({k: J[k] for k in ('cases', 'controls', 'cells', 'auc', 'gains', 'antecedentPercentile', 'decision')}, indent=1))
