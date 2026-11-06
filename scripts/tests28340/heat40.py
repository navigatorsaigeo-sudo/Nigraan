"""v91.17.283.40 · C9 heat-index bands on the PUBLISHED NWS onsets, with the SERVED heat-index function (rules: C_RULES_20261031.json,
amendment 31 Oct 09:26 PKT). Forecast: ecmwf_ifs025 previous runs, leads 1-3, 3-hourly T and Td; truth: MACH hourly clean + synop hourly
(Meteostat/GTS, temperature tag 'ok'), at the same 3-hourly steps; a PKT day needs all 8 steps on both sides.
usage: python -I heat40.py --obs <obs root (obs_all or met_parquet)> --prevA <prev dir> --points <points.csv> --out <json>"""
import os, sys, json, glob, argparse, datetime as dt, subprocess
import numpy as np, pandas as pd
ap = argparse.ArgumentParser()
for k, d in (('obs', r'D:\NIGRAAN\obs_all'), ('prevA', None), ('points', None), ('out', None), ('tree', os.path.join(os.path.dirname(__file__), '..', '..'))): ap.add_argument('--' + k, default=d)
A = ap.parse_args(); RNG = np.random.default_rng(40); B = 1000; PKT = pd.Timedelta(hours=5)
BANDS = {'extremeCaution': 32.2, 'danger': 40.6, 'extremeDanger': 54.4}   # NWS SR 90-23 (Rothfusz 1990): 90 / 105 / 130 F
rnd = lambda x, n=3: None if x is None or not np.isfinite(x) else round(float(x), n)


def OBS(name):
    hit = sorted(glob.glob(os.path.join(A.obs, '**', name), recursive=True)); hit = [h for h in hit if 'met_parquet' in h] or hit
    if not hit: raise FileNotFoundError(name)
    return hit[0]


def served_hi(t, td):
    """server/api/heatindex.mjs heatIndexDetail, vectorised (same constants); RH from T and Td (Magnus, as the served chain)"""
    rh = np.clip(100 * np.exp(17.625 * td / (243.04 + td)) / np.exp(17.625 * t / (243.04 + t)), 1, 100)
    T = t * 9 / 5 + 32; simple = 0.5 * (T + 61 + (T - 68) * 1.2 + rh * 0.094); avg = (simple + T) / 2
    H = -42.379 + 2.04901523 * T + 10.14333127 * rh - 0.22475541 * T * rh - 0.00683783 * T * T - 0.05481717 * rh * rh + 0.00122874 * T * T * rh + 0.00085282 * T * rh * rh - 0.00000199 * T * T * rh * rh
    H = np.where((rh < 13) & (T >= 80) & (T <= 112), H - ((13 - rh) / 4) * np.sqrt(np.clip(17 - np.abs(T - 95), 0, None) / 17), H)
    H = np.where((rh > 85) & (T >= 80) & (T <= 87), H + ((rh - 85) / 10) * ((87 - T) / 5), H)
    v = np.where(avg < 80, (avg - 32) * 5 / 9, (H - 32) * 5 / 9)
    refused = (t > 43.3) | (t < -30) | (v > 58.3) | ~np.isfinite(v)
    return np.where(refused, np.nan, v), refused


def categorical(D, f, o, thr):
    D = D.dropna(subset=[f, o]); F = (D[f] >= thr).values; O = (D[o] >= thr).values
    h, m, fa, cn = int((F & O).sum()), int((~F & O).sum()), int((F & ~O).sum()), int((~F & ~O).sum())
    pod = h / (h + m) if h + m else None; far = fa / (h + fa) if h + fa else None; pofd = fa / (fa + cn) if fa + cn else None
    S = {'events': h + m, 'hits': h, 'misses': m, 'falseAlarms': fa, 'pod': rnd(pod), 'far': rnd(far), 'pss': rnd(pod - pofd) if pod is not None and pofd is not None else None, 'stationDays': int(len(D)), 'stations': int(D.pid.nunique())}
    ud, inv = np.unique(D.day.values, return_inverse=True); W = [np.bincount(inv, w, len(ud)) for w in (F & O, ~F & O, F & ~O, ~F & ~O)]; ps = []
    for _ in range(B):
        k = RNG.integers(0, len(ud), len(ud)); a, b, c, d = (x[k].sum() for x in W)
        if a + b and c + d: ps.append(a / (a + b) - c / (c + d))
    S['pssCI95'] = [rnd(np.percentile(ps, 2.5)), rnd(np.percentile(ps, 97.5))] if ps else None
    S['verdict'] = 'INCONCLUSIVE' if S['events'] < 20 else ('PASS' if pod >= 0.5 and far is not None and far <= 0.5 and S['pssCI95'] and S['pssCI95'][0] > 0 else 'FAIL')
    return S


P = pd.read_csv(A.points)
m = pd.read_parquet(OBS('mach_hourly_clean_2023-2026.parquet'), columns=['station', 'hour_utc', 'temp_c', 'dewpoint_c', 'qc'])
m = m[m.qc.isna() | ~m.qc.astype(str).str.contains('hampel|stuck|td_above', regex=True)]
m['time'] = pd.to_datetime(m.hour_utc).dt.tz_convert(None).astype('datetime64[ns]'); pm = P[P.src == 'mach']; m['pid'] = m.station.astype(str).map(dict(zip(pm.sid.astype(str), pm.pid)))
s = pd.read_parquet(OBS('pmd_synop_hourly_meteostat_gts'), columns=['station_id', 'time_utc', 'temp_c_screened', 'dewpoint_c', 'temp_qc_tag']); s = s[s.temp_qc_tag.astype(str) == 'ok']
s['time'] = pd.to_datetime(s.time_utc).astype('datetime64[ns]'); ps = P[P.src == 'synop']; s['pid'] = s.station_id.astype(str).map(dict(zip(ps.sid.astype(str), ps.pid)))
T = pd.concat([m.dropna(subset=['pid', 'temp_c', 'dewpoint_c'])[['pid', 'time', 'temp_c', 'dewpoint_c']].assign(net='MACH'),
               s.dropna(subset=['pid', 'temp_c_screened', 'dewpoint_c']).rename(columns={'temp_c_screened': 'temp_c'})[['pid', 'time', 'temp_c', 'dewpoint_c']].assign(net='synop')], ignore_index=True)
T = T[(T.time >= '2024-01-01') & (T.dewpoint_c <= T.temp_c + 0.5) & T.temp_c.between(-45, 55)]; T['pid'] = T.pid.astype(int); T = T.drop_duplicates(['pid', 'time'])
cols = ['temperature_2m_d%d' % k for k in (1, 2, 3)] + ['dew_point_2m_d%d' % k for k in (1, 2, 3)]
X = pd.concat([pd.read_parquet(f, columns=['pid', 'time'] + cols, filters=[('pid', 'in', [int(x) for x in T.pid.unique()])]) for f in sorted(glob.glob(os.path.join(A.prevA, 'ecmwf_ifs025', 'A', '*.parquet')))], ignore_index=True)
X['time'] = pd.to_datetime(X.time).astype('datetime64[ns]')
H = T.merge(X, on=['pid', 'time']); H['day'] = (H.time + PKT).dt.floor('D'); H = H[H.day.dt.month.between(4, 10)]
H['hiO'], H['rO'] = served_hi(H.temp_c.values, H.dewpoint_c.values)
for k in (1, 2, 3): H['hiF%d' % k], H['rF%d' % k] = served_hi(H['temperature_2m_d%d' % k].values, H['dew_point_2m_d%d' % k].values)
R = {'built': 'v91.17.283.40', 'run': (dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(hours=5)).strftime('%Y-%m-%d %H:%M PKT'), 'bands': BANDS,
     'bandsSource': 'NWS Technical Attachment SR 90-23 (Rothfusz 1990): Extreme Caution 90-105 F, Danger 105-130 F, Extreme Danger >= 130 F',
     'truth': {n: {'stations': int(g.pid.nunique()), 'steps': int(len(g))} for n, g in H.groupby('net')}, 'leads': {}}
for k in (1, 2, 3):
    agg = {'n': ('hiO', 'size'), 'oMax': ('hiO', 'max'), 'fMax': ('hiF%d' % k, 'max'), 'oRef': ('rO', 'sum'), 'fRef': ('rF%d' % k, 'sum')}
    for b, t in BANDS.items(): agg['o_' + b] = ('hiO', lambda x, t=t: int((x >= t).sum())); agg['f_' + b] = ('hiF%d' % k, lambda x, t=t: int((x >= t).sum()))
    D = H.groupby(['pid', 'day']).agg(**agg).reset_index(); D = D[D.n == 8]; nAll = len(D); D = D[(D.oRef == 0) & (D.fRef == 0)]
    L = {'stationDays': nAll, 'daysRefusedOutsideTable': int(nAll - len(D))}
    for b, t in BANDS.items():
        S = categorical(D, 'fMax', 'oMax', t); act = (D['o_' + b] > 0) | (D['f_' + b] > 0)
        S['hoursAtOrAboveMAE'] = rnd(3 * (D['f_' + b] - D['o_' + b]).abs()[act].mean(), 2); S['hoursAtOrAboveBias'] = rnd(3 * (D['f_' + b] - D['o_' + b])[act].mean(), 2); L[b] = S
    R['leads'][str(k)] = L
json.dump(R, open(A.out, 'w'), indent=1)
for k, L in R['leads'].items(): print('lead', k, 'days', L['stationDays'], 'refused', L['daysRefusedOutsideTable'], {b: (L[b]['verdict'], L[b]['events'], L[b]['pod'], L[b]['far'], L[b]['pssCI95'], L[b]['hoursAtOrAboveMAE']) for b in BANDS})
