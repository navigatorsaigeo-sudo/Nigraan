#!/usr/bin/env python3
"""
downscale_dyn_fetch.py  (v91.17.73, AI downscaling, agent A)  --  INTERNAL FIT / VERIFICATION DATA

The weather-state predictors of the residual model R (T_local = T_served + R): the day-1 forecast (previous-runs archive,
`*_previous_day1`) of cloud cover, 10 m wind speed, shortwave radiation and precipitation of the SERVED basis at every
training point, over the same windows as the temperature pairs:
  aws    mountain AWS / ARG (cache_corr/stations.json set aws): the mountain zone members, 2024-05-15 .. 2026-09-25, station height
  synop  synop sites >= 1,000 m (cache_corr set synop): the zone members, 2025-01-01 .. 2025-08-31, station height
  isdlo  synop sites < 1,000 m (archive/isd/isd_stations.csv): best_match, 2025-01-01 .. 2025-08-31, station height,
         temperature_2m too (the served plains / coast basis; cache_zone holds only three 28-day windows)
  pmd    PMD AWS QC-checked export (station-lake/archive/obs_hourly/pmd_aws): best_match, 2024-01-01 .. 2026-09-25, station height
  mach   the MACH history pairs (archive/fleet/history/mach_pairs_hourly.parquet): best_match, 2024-01-01 .. 2026-09-24,
         NO elevation parameter (the pairs were fetched at the provider's own height, as the plains are served)
The member mean is stored per station (hourly) in station-lake/archive/model/cache_dyn/<set>__<id>.parquet; the raw
response is not kept. The paid key is read from nigraan-local/mach.key and never printed (the same customer host the
/px route relays to; the shared server is not used).
Usage: python3 downscale_dyn_fetch.py [--workers 2] [--sets aws,synop,isdlo,mach]
"""
import os, sys, json, time, urllib.request, urllib.parse, urllib.error
try:
    import nigraan_calls  # noqa: F401  v91.17.270 OPS A8: every provider answer is reported to the server's call counter (scripts/nigraan_calls.py)
except Exception:
    pass
from concurrent.futures import ThreadPoolExecutor
import pandas as pd, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); NL = os.path.dirname(HERE)
LAKE = os.path.join(os.path.dirname(NL), 'station-lake'); ARCH = os.path.join(LAKE, 'archive')
OUT = os.path.join(ARCH, 'model', 'cache_dyn'); os.makedirs(OUT, exist_ok=True)
HOST = 'https://customer-previous-runs-api.open-meteo.com/v1/forecast'
DYN = ['cloud_cover', 'wind_speed_10m', 'shortwave_radiation', 'precipitation']


def key():
    return open(os.path.join(NL, 'mach.key')).read().strip()


def members():
    return list(json.load(open(os.path.join(NL, 'data', 'model-zone.json')))['zones']['mountain']['temperatureModels'])


def jobs():
    J = []
    mem = ','.join(members())
    S = json.load(open(os.path.join(ARCH, 'model', 'cache_corr', 'stations.json')))['stations']
    for s in S:
        if s['set'] == 'aws':
            J.append(('aws', s['name'], dict(latitude=f"{s['lat']:.5f}", longitude=f"{s['lon']:.5f}", elevation=f"{s['elev']:.0f}", start_date='2024-05-15', end_date='2026-09-25', models=mem), DYN))
        else:
            J.append(('synop', s['key'][4:], dict(latitude=f"{s['lat']:.5f}", longitude=f"{s['lon']:.5f}", elevation=f"{s['elev']:.0f}", start_date='2025-01-01', end_date='2025-08-31', models=mem), DYN))
    I = pd.read_csv(os.path.join(ARCH, 'isd', 'isd_stations.csv'))
    for r in I.itertuples():
        if float(r.elev_m) >= 1000: continue
        J.append(('isdlo', str(r.USAF), dict(latitude=f"{r.LAT:.5f}", longitude=f"{r.LON:.5f}", elevation=f"{r.elev_m:.0f}", start_date='2025-01-01', end_date='2025-08-31', models='best_match'), ['temperature_2m'] + DYN))
    C = pd.read_csv(os.path.join(ARCH, 'fleet', 'history', 'mach_history_coords.csv'))
    reg = {s['key']: s for s in json.load(open(os.path.join(NL, 'data', 'mach-fleet-stations.json')))['stations']}
    names = pd.read_parquet(os.path.join(ARCH, 'fleet', 'history', 'mach_pairs_hourly.parquet'), columns=['station']).station.unique()
    for nm in names:
        r = C[C.mach_id == nm]
        if len(r): la, lo = float(r.iloc[0].lat), float(r.iloc[0].lon)
        elif nm in reg: la, lo = float(reg[nm]['lat']), float(reg[nm]['lon'])
        else: continue
        J.append(('mach', nm, dict(latitude=f"{la:.5f}", longitude=f"{lo:.5f}", start_date='2024-01-01', end_date='2026-09-24', models='best_match'), DYN))
    # v91.17.81 · PMD AWS (QC-checked export, INTERNAL): plains best_match at the station height, 2024-01-01 .. 2026-09-25
    PF = os.path.join(ARCH, 'obs_hourly', 'pmd_aws', 'pmd_aws_stations.csv')
    if os.path.exists(PF):
        for r in pd.read_csv(PF).dropna(subset=['lat', 'lon']).itertuples():
            if not str(r.coord_status).startswith('ok'): continue
            sid = str(r.st).replace(' ', '_')
            J.append(('pmd', sid, dict(latitude=f"{r.lat:.5f}", longitude=f"{r.lon:.5f}", elevation=f"{r.elev_m:.0f}", start_date='2024-01-01', end_date='2026-09-25', models='best_match'), ['temperature_2m'] + DYN))
    return J


def one(job, k):
    st, sid, q, vars_ = job
    path = os.path.join(OUT, f'{st}__{sid}.parquet'.replace('/', '_'))
    if os.path.exists(path): return 'cached'
    p = dict(q, hourly=','.join(v + '_previous_day1' for v in vars_), timezone='UTC', apikey=k)
    url = HOST + '?' + urllib.parse.urlencode(p)
    for a in range(5):
        try:
            with urllib.request.urlopen(url, timeout=300) as r: d = json.load(r)
            h = d['hourly']; t = pd.to_datetime(h.pop('time'), utc=True)
            f = pd.DataFrame(index=t)
            for v in vars_:
                cols = [c for c in h if c.startswith(v + '_previous_day1')]
                arr = np.array([pd.to_numeric(pd.Series(h[c]), errors='coerce').values for c in cols], float)
                f[v] = np.nanmean(arr, axis=0) if len(cols) else np.nan
            f.attrs['elevation'] = d.get('elevation')
            f['srv_elev'] = d.get('elevation')
            f.index.name = 't'; f.reset_index().to_parquet(path)
            return 'ok'
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504): time.sleep(15 * (a + 1)); continue
            return f'HTTP {e.code}'
        except Exception as e:
            time.sleep(8 * (a + 1)); err = str(e)[:80]
    return 'failed'


def main():
    a = sys.argv[1:]; opt = lambda n, d: a[a.index(n) + 1] if n in a else d
    sets = opt('--sets', 'aws,synop,isdlo,mach,pmd').split(','); w = int(opt('--workers', '2'))
    k = key(); J = [j for j in jobs() if j[0] in sets]
    print(len(J), 'calls', flush=True)
    res = []
    with ThreadPoolExecutor(max_workers=w) as ex:
        for i, r in enumerate(ex.map(lambda j: (j[0], j[1], one(j, k)), J)):
            res.append(r)
            if r[2] not in ('ok', 'cached'): print('  ', r, flush=True)
            if i % 20 == 0: print(f'  {i}/{len(J)}', flush=True)
    print('done', pd.Series([r[2] for r in res]).value_counts().to_dict())


if __name__ == '__main__':
    main()
