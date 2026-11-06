#!/usr/bin/env python3
"""
temp_zone_fetch.py  (v91.17.70, Sprint 1 temperature)  --  INTERNAL VERIFICATION DATA ONLY

Fetches the day-1 forecast (previous-runs endpoint, `*_previous_day1`) of every candidate
model at every verification station, through the local server's /px route, so the
temperature model can be chosen per zone by internal verification (temp_zone_rank.py).

Data-source rule (CEO decision 25 Sep 2026, option 2): the PMD mountain AWS lake, the PMD
EWS export and the PMD synop record (NOAA ISD-Lite) are used HERE ONLY TO RANK MODELS. No
number fitted to them is applied to any customer output; data/model-zone.json carries model
names and a score summary only. The MACH fleet is AGN's own data.

Station sets (each gets a zone: mountain | hills | plains | coast, see zone_of):
  pmd_lake    verify_stations.csv (47 PMD mountain AWS/ARG) + 3 PMD city AWS; four 28-day windows,
              one per season (SON, DJF, MAM, JJA 2025-26); provider DEM at the point (no elevation
              parameter), the same basis as station-lake/scripts/rank_models.py, whose cache is reused
  pmd_export  the PMD EWS export stations, 2026-08-21 .. 2026-09-24 (after the learned model's fit end)
  isd         the PMD synop sites via NOAA ISD-Lite, Jan / Apr / Jul 2025, elevation = station height
  mach        the MACH fleet history (WU record) and live sheets, five windows, elevation = station height

Responses are cached in station-lake/archive/model/cache_zone/ (keyless), so a re-run costs nothing.
Usage: python3 temp_zone_fetch.py [--workers 3] [--sets pmd_lake,pmd_export,isd,mach]
"""
import sys, os, json, time, hashlib, urllib.request, urllib.parse, urllib.error
try:
    import nigraan_calls  # noqa: F401  v91.17.270 OPS A8: every provider answer is reported to the server's call counter (scripts/nigraan_calls.py)
except Exception:
    pass
from concurrent.futures import ThreadPoolExecutor
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); NL = os.path.dirname(HERE)
LAKE = os.path.join(os.path.dirname(NL), 'station-lake'); ARCH = os.path.join(LAKE, 'archive')
CACHE = os.path.join(ARCH, 'model', 'cache_zone'); os.makedirs(CACHE, exist_ok=True)
RANK_CACHE = os.path.join(ARCH, 'model', 'cache_rank')
PX = os.environ.get('NIGRAAN_PX', 'http://127.0.0.1:8787/px/v1/forecast')
PREV = 'previous-runs-api.open-meteo.com'

# the candidate set: every global model the provider serves over Pakistan (metno / knmi resolve to a global fallback here)
MODELS = ['best_match', 'ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_seamless', 'ncep_aigfs025', 'icon_seamless',
          'gem_seamless', 'ukmo_seamless', 'meteofrance_seamless', 'jma_seamless', 'cma_grapes_global']
RANK_MODELS = ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'ncep_aigfs025', 'gfs_seamless', 'icon_seamless', 'gem_seamless',
               'ukmo_seamless', 'meteofrance_seamless', 'jma_seamless', 'metno_seamless', 'knmi_seamless']
NEW_FOR_LAKE = ['best_match', 'ecmwf_ifs', 'cma_grapes_global']
PMD_CITY = {'PMD_Lahore_AWS': (31.5497, 74.33, 217), 'PMD_Karachi_AWS': (24.9065, 67.1608, 22), 'PMD_Multan_AWS': (30.2032, 71.4191, 122)}
LAKE_WINDOWS = [('2025-09-29', '2025-10-26'), ('2025-12-22', '2026-01-18'), ('2026-03-16', '2026-04-12'), ('2026-06-08', '2026-07-05')]
EXPORT_WINDOW = ('2026-08-20', '2026-09-25')
ISD_WINDOWS = [('2025-01-01', '2025-01-28'), ('2025-04-01', '2025-04-28'), ('2025-07-01', '2025-07-28')]
MACH_WINDOWS = ISD_WINDOWS + [('2025-10-01', '2025-10-28'), ('2026-01-05', '2026-02-01')]
SHEET_WINDOW = ('2026-07-01', '2026-07-28')


def px(params):
    """one previous-runs call through the local /px route; cached by the keyless query"""
    q = dict(params); q['__omhost'] = PREV
    tag = hashlib.sha1(json.dumps(sorted(q.items())).encode()).hexdigest()[:20]
    path = os.path.join(CACHE, tag + '.json')
    if os.path.exists(path):
        return json.load(open(path))
    url = PX + '?' + urllib.parse.urlencode(q)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'temp-zone-rank'})
            with urllib.request.urlopen(req, timeout=240) as r:
                d = json.load(r)
            json.dump(d, open(path, 'w'))
            return d
        except urllib.error.HTTPError as e:
            body = e.read()[:300].decode('utf-8', 'ignore')
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(10 * (attempt + 1)); continue
            raise RuntimeError(f'HTTP {e.code}: {body}')
        except Exception:
            time.sleep(6 * (attempt + 1))
    raise RuntimeError('px failed ' + json.dumps(params)[:200])


def rank_cache(lat, lon, start, end):
    """the rank_models.py cache (same key rule), read only; None if absent"""
    VARS = ['temperature_2m', 'precipitation', 'wind_gusts_10m']; LEADS = [1, 2, 3]
    hourly = ','.join(f'{v}_previous_day{L}' for v in VARS for L in LEADS)
    tag = hashlib.sha1(f'rank|{lat:.5f}|{lon:.5f}|{start}|{end}|{hourly}|{",".join(RANK_MODELS)}'.encode()).hexdigest()[:16]
    p = os.path.join(RANK_CACHE, tag + '.json')
    return json.load(open(p)) if os.path.exists(p) else None


def stations():
    """the station catalogue: key, set, lat, lon, elev, name"""
    out = []
    v = pd.read_csv(os.path.join(ARCH, 'verify_stations.csv'))
    for r in v.itertuples():
        out.append(dict(key='pmd:' + r.station, set='pmd_lake', name=r.station, lat=float(r.lat), lon=float(r.lon), elev=float(r.elevation_m), pmd=True))
    for k, (la, lo, z) in PMD_CITY.items():
        out.append(dict(key='pmd:' + k, set='pmd_lake', name=k, lat=la, lon=lo, elev=float(z), pmd=True))
    S = pd.read_csv(os.path.join(ARCH, 'stations.csv'))
    ex = pd.read_parquet(os.path.join(ARCH, 'pmd', 'ews_export', 'air_temperature_batch1_long.parquet'), columns=['station_name'])
    names = sorted(ex.station_name.unique())
    for nm in names:
        r = S[S.stationName == nm]
        if r.empty or pd.isna(r.iloc[0].elevation_m): continue
        r = r.iloc[0]
        out.append(dict(key='pmdx:' + nm, set='pmd_export', name=nm, lat=float(r.lat), lon=float(r.lon), elev=float(r.elevation_m), pmd=True))
    I = pd.read_csv(os.path.join(ARCH, 'isd', 'isd_stations.csv'))
    for r in I.itertuples():
        out.append(dict(key='isd:%d' % r.USAF, set='isd', name=r.name, lat=float(r.LAT), lon=float(r.LON), elev=float(r.elev_m), pmd=True))
    C = pd.read_csv(os.path.join(ARCH, 'fleet', 'history', 'mach_history_coords.csv'))
    for r in C.itertuples():
        if pd.isna(r.lat) or pd.isna(r.elev_m): continue
        out.append(dict(key='mach:' + r.mach_id, set='mach', name=str(r.name), lat=float(r.lat), lon=float(r.lon), elev=float(r.elev_m), pmd=False, wu=r.wu_id))
    reg = json.load(open(os.path.join(NL, 'data', 'mach-fleet-stations.json')))
    P = pd.read_parquet(os.path.join(ARCH, 'fleet', 'history', 'mach_pairs_hourly.parquet'), columns=['station', 'model_elev_m'])
    for s in reg['stations']:
        if s['key'] in ('Banigala', 'FLT', 'Quaid', 'Rawal', 'Zaraj', 'mach8'):
            z = P[P.station == s['key']].model_elev_m.median()
            if pd.isna(z): continue
            out.append(dict(key='sheet:' + s['key'], set='sheet', name=s['name'], lat=float(s['lat']), lon=float(s['lon']), elev=float(z), pmd=False))
    return out


def jobs_for(st):
    """(params, label) per call for one station"""
    J = []
    v1 = lambda vs: ','.join(f'{v}_previous_day1' for v in vs)
    if st['set'] == 'pmd_lake':
        for a, b in LAKE_WINDOWS:
            J.append(dict(latitude=f"{st['lat']:.5f}", longitude=f"{st['lon']:.5f}", hourly=v1(['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m']),
                          start_date=a, end_date=b, timezone='UTC', models=','.join(NEW_FOR_LAKE)))
    elif st['set'] == 'pmd_export':
        a, b = EXPORT_WINDOW
        J.append(dict(latitude=f"{st['lat']:.5f}", longitude=f"{st['lon']:.5f}", elevation=f"{st['elev']:.0f}", hourly=v1(['temperature_2m']),
                      start_date=a, end_date=b, timezone='UTC', models=','.join(MODELS)))
        J.append(dict(latitude=f"{st['lat']:.5f}", longitude=f"{st['lon']:.5f}", elevation=f"{st['elev']:.0f}", hourly=v1(['relative_humidity_2m', 'wind_speed_10m']),
                      start_date=a, end_date=b, timezone='UTC', models='best_match'))
    else:
        W = ISD_WINDOWS if st['set'] == 'isd' else (MACH_WINDOWS if st['set'] == 'mach' else [SHEET_WINDOW])
        for a, b in W:
            J.append(dict(latitude=f"{st['lat']:.5f}", longitude=f"{st['lon']:.5f}", elevation=f"{st['elev']:.0f}", hourly=v1(['temperature_2m', 'dew_point_2m']),
                          start_date=a, end_date=b, timezone='UTC', models=','.join(MODELS)))
            J.append(dict(latitude=f"{st['lat']:.5f}", longitude=f"{st['lon']:.5f}", elevation=f"{st['elev']:.0f}", hourly=v1(['relative_humidity_2m', 'wind_speed_10m']),
                          start_date=a, end_date=b, timezone='UTC', models='best_match'))
    return J


def main():
    a = sys.argv[1:]
    opt = lambda n, d: a[a.index(n) + 1] if n in a else d
    workers = int(opt('--workers', '3')); sets = opt('--sets', 'pmd_lake,pmd_export,isd,mach,sheet').split(',')
    S = [s for s in stations() if s['set'] in sets]
    json.dump(stations(), open(os.path.join(CACHE, 'stations.json'), 'w'), indent=0)
    J = [j for s in S for j in jobs_for(s)]
    print(f'{len(S)} stations, {len(J)} calls (cached calls cost nothing)', flush=True)
    done = [0]
    def one(p):
        try: px(p)
        except Exception as e: print('  fail', p.get('latitude'), p.get('start_date'), str(e)[:160], flush=True)
        done[0] += 1
        if done[0] % 50 == 0: print(f'  {done[0]}/{len(J)}', flush=True)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, J))
    miss = sum(1 for s in S if s['set'] == 'pmd_lake' for w in LAKE_WINDOWS if rank_cache(s['lat'], s['lon'], *w) is None)
    print('done; pmd_lake windows without a rank_models.py cache entry:', miss)


if __name__ == '__main__':
    main()
