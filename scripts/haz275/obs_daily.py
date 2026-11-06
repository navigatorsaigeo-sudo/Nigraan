#!/usr/bin/env python3
"""
v91.17.275 HAZ2 · V-09 · observed heat, cold and gust per station and PKT day, from the observations NIGRAAN holds.

Observations: ds2 master obs_hourly_YYYY.parquet (the copies: MACH 5-min/hourly history and database, synop, airport METAR;
QC flags already set by the ds2 build: range, dew point, spike, STUCK (the stuck screen), feed mix-up). A reading is used when
ok_t is true and qc_stuck, qc_spike, qc_mixup are false; duplicates of another station (station_meta duplicate_of) are dropped.
UTCI in shade (Tmrt = Ta) is the page's own function (agnUtci, Broede et al. 2012 polynomial), ported verbatim from the served
artefact (the expression is read from the page file, not retyped), with the page's clamp rule (hzUtciInRange) and calm wind
0.5 m/s when no wind is reported. A day counts when it has >= 18 valid hours, or (3-hourly synoptic and airport reports) >= 6 readings with at least one between
11 and 16 PKT and one between 02 and 08 PKT (the day's warm and cold ends sampled; a 3-hourly max can read slightly low).
Output: _work/v09/obs_daily.csv  station, day(PKT), zone, lat, lon, elev, n, utci_max, utci_min, tmax, tmin, gust_max, wind_max (km/h)
Usage: python3 obs_daily.py <root> <page.html> [years...]
"""
import sys, os, re, math
import numpy as np, pandas as pd, pyarrow.parquet as pq

ROOT, PAGE = sys.argv[1], sys.argv[2]
YEARS = sys.argv[3:] or ['2024', '2025', '2026']
M = '/mnt/user-data/uploads/NIGRAAN/nig/ds2/out/master'
html = open(PAGE, encoding='utf-8').read()
body = re.search(r'function agnUtci\(tdb, tr, v, rh\) \{.*?const u = (\(.*?\));\n', html, re.S).group(1)
es_g = [float(x) for x in re.search(r'function agnUtciEs\(ta\) \{ const g = \[([^\]]+)\]', html).group(1).split(',')]
def utci_es(ta):
    tk = ta + 273.15; es = 2.7150305 * np.log(tk)
    for i, g in enumerate(es_g): es = es + g * np.power(tk, i - 2)
    return np.exp(es) * 0.01
EXPR = compile(body, 'agnUtci', 'eval')
def utci(t, v, rh):
    t = np.asarray(t, float); v = np.maximum(0.5, np.asarray(v, float)); rh = np.asarray(rh, float)
    tc = np.clip(t, -49.9, 49.9); vc = np.clip(v, 0.5, 16.9)          # hzUtciInRange: clamp into the polynomial's range
    tdb, delta_t_tr = tc, 0.0 * tc; pa = utci_es(tc) * (rh / 100) / 10
    u = eval(EXPR, {'tdb': tdb, 'v': vc, 'pa': pa, 'delta_t_tr': delta_t_tr, 'Math': math})
    return np.round(u * 10) / 10

meta = pq.read_table(os.path.join(M, 'station_meta.parquet')).to_pandas()
dup = set(meta.loc[meta['duplicate_of'].notna(), 'station'])
frames = []
for y in YEARS:
    d = pq.read_table(os.path.join(M, 'obs_hourly_%s.parquet' % y), columns=['station', 'time', 't', 'rh', 'td', 'wind', 'gust', 'ok_t', 'qc_stuck', 'qc_spike', 'qc_mixup']).to_pandas()
    frames.append(d)
d = pd.concat(frames, ignore_index=True)
d = d[~d['station'].isin(dup)]
ok = d['ok_t'].fillna(False).astype(bool) & ~d['qc_stuck'].fillna(False).astype(bool) & ~d['qc_spike'].fillna(False).astype(bool) & ~d['qc_mixup'].fillna(False).astype(bool)
d = d[ok & d['t'].notna()].copy()
rh = d['rh'].copy()
# relative humidity from dew point where only Td is reported (Magnus, the same form the ds2 build uses)
m = rh.isna() & d['td'].notna()
a, b = 17.625, 243.04
rh[m] = 100 * np.exp(a * d.loc[m, 'td'] / (b + d.loc[m, 'td'])) / np.exp(a * d.loc[m, 't'] / (b + d.loc[m, 't']))
d['rh'] = rh.clip(0, 100)
d = d[d['rh'].notna()]
# the ds2 master stores wind and gust in m/s (ISD-lite convention; MACH converted by the build): UTCI takes m/s; gust is reported in km/h
wind_ms = d['wind'].where(d['wind'].notna(), 0.5)
d['gust'] = d['gust'] * 3.6; d['wind'] = d['wind'] * 3.6
d['utci'] = utci(d['t'].values, wind_ms.values, d['rh'].values)
tt = pd.to_datetime(d['time'], utc=True) + pd.Timedelta(hours=5)
d['day'] = tt.dt.strftime('%Y-%m-%d'); d['hh'] = tt.dt.hour
d['aft'] = d['hh'].between(11, 16); d['mor'] = d['hh'].between(2, 8)
g = d.groupby(['station', 'day'])
out = g.agg(n=('t', 'size'), utci_max=('utci', 'max'), utci_min=('utci', 'min'), tmax=('t', 'max'), tmin=('t', 'min'), gust_max=('gust', 'max'), wind_max=('wind', 'max'), aft=('aft', 'any'), mor=('mor', 'any')).reset_index()
out = out[(out['n'] >= 18) | ((out['n'] >= 6) & out['aft'] & out['mor'])]
mm = meta.set_index('station')[['zone', 'lat', 'lon', 'elev_use', 'kind']]
out = out.join(mm, on='station')
os.makedirs(os.path.join(ROOT, '_work', 'v09'), exist_ok=True)
fn = os.path.join(ROOT, '_work', 'v09', 'obs_daily.csv')
out.to_csv(fn, index=False)
print(len(d), 'hourly readings used;', len(out), 'station-days;', out['station'].nunique(), 'stations ->', fn)
print(out.groupby('zone').size().to_dict())
# self-check: the port gives the page's numbers (page reference values computed with agnUtci in node, see served_compare)
print('UTCI(35 C, 1 m/s, 40 %) =', utci([35.0], [1.0], [40.0])[0], ' UTCI(0 C, 3 m/s, 70 %) =', utci([0.0], [3.0], [70.0])[0])
