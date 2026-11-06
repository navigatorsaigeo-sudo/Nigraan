#!/usr/bin/env python3
"""
temp_corr_fetch.py  (v91.17.71, forecast quality)  --  INTERNAL FIT / VERIFICATION DATA

Fetches the day-1 forecast (previous-runs archive, `*_previous_day1`) of the v91.17.70 ZONE BASIS models
(data/model-zone.json: the mountain zone's members, plus best_match for the hills) at every mountain AWS / ARG station
of the station lake and at the mountain / hill synop sites, over the whole observed record, so the station correction
ON TOP of the zone basis (train_zone_corr.py) can be fitted and tested leave-one-station-out and on a time split.

  aws    every station in station-lake/archive/stations.csv that has an air-temperature record in archive/obs
         (mountain AWS / ARG network, 2024-05 .. 2026-08) or in the Aug-Sep 2026 EWS export; 2024-05-15 .. 2026-09-25;
         temperature and relative humidity; elevation = the station height
  synop  the synop sites (archive/isd/isd_stations.csv) at or above 1,000 m; 2025-01-01 .. 2026-09-25; temperature,
         dew point and relative humidity of best_match and the mountain members; elevation = the station height

Responses are cached in station-lake/archive/model/cache_corr/ by the keyless query (a re-run costs nothing).
Usage: python3 temp_corr_fetch.py [--workers 3] [--px http://127.0.0.1:8797/px/v1/forecast]
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
CACHE = os.path.join(ARCH, 'model', 'cache_corr'); os.makedirs(CACHE, exist_ok=True)
PREV = 'previous-runs-api.open-meteo.com'
AWS_WINDOW = ('2024-05-15', '2026-09-25')
SYNOP_WINDOW = ('2025-01-01', '2026-09-25')
PX = os.environ.get('NIGRAAN_PX', 'http://127.0.0.1:8787/px/v1/forecast')


def zone_members():
    Z = json.load(open(os.path.join(NL, 'data', 'model-zone.json')))
    return list(Z['zones']['mountain']['temperatureModels'])


def px(params):
    q = dict(params); q['__omhost'] = PREV
    tag = hashlib.sha1(json.dumps(sorted(q.items())).encode()).hexdigest()[:20]
    path = os.path.join(CACHE, tag + '.json')
    if os.path.exists(path):
        return json.load(open(path))
    url = PX + '?' + urllib.parse.urlencode(q)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'temp-corr-fit'})
            with urllib.request.urlopen(req, timeout=300) as r:
                d = json.load(r)
            if not isinstance(d, dict) or 'hourly' not in d:
                raise RuntimeError('no hourly: ' + json.dumps(d)[:200])
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


def stations():
    S = pd.read_csv(os.path.join(ARCH, 'stations.csv'))
    o = set(pd.read_parquet(os.path.join(ARCH, 'obs', 'Air_Temperature.parquet'), columns=['station_name']).station_name.unique())
    ex = set(pd.read_parquet(os.path.join(ARCH, 'pmd', 'ews_export', 'air_temperature_batch1_long.parquet'), columns=['station_name']).station_name.unique())
    out = []
    for r in S.itertuples():
        if r.stationName not in o and r.stationName not in ex: continue
        if pd.isna(r.elevation_m) or pd.isna(r.lat): continue
        out.append(dict(key='aws:' + r.stationName, set='aws', name=r.stationName, lat=float(r.lat), lon=float(r.lon), elev=float(r.elevation_m),
                        inLake=r.stationName in o, inExport=r.stationName in ex))
    I = pd.read_csv(os.path.join(ARCH, 'isd', 'isd_stations.csv'))
    for r in I.itertuples():
        if float(r.elev_m) < 1000: continue
        out.append(dict(key='isd:%d' % r.USAF, set='synop', name=r.name, lat=float(r.LAT), lon=float(r.LON), elev=float(r.elev_m)))
    return out


def jobs_for(st, mem):
    v1 = lambda vs: ','.join(f'{v}_previous_day1' for v in vs)
    base = dict(latitude=f"{st['lat']:.5f}", longitude=f"{st['lon']:.5f}", elevation=f"{st['elev']:.0f}", timezone='UTC')
    if st['set'] == 'aws':
        a, b = AWS_WINDOW
        return [dict(base, hourly=v1(['temperature_2m', 'relative_humidity_2m']), start_date=a, end_date=b, models=','.join(mem))]
    a, b = SYNOP_WINDOW
    hv = v1(['temperature_2m', 'dew_point_2m', 'relative_humidity_2m'])
    # the IFS runs too: best_match served ICON over Pakistan before Oct 2025 and ECMWF IFS since, so a hills correction
    # must be fitted on the IFS basis it will be applied to (ecmwf_ifs where archived, ecmwf_ifs025 as its stand-in)
    return [dict(base, hourly=hv, start_date=a, end_date=b, models=','.join(['best_match'] + mem)),
            dict(base, hourly=hv, start_date=a, end_date=b, models='ecmwf_ifs,ecmwf_ifs025')]


def main():
    a = sys.argv[1:]
    opt = lambda n, d: a[a.index(n) + 1] if n in a else d
    global PX
    PX = opt('--px', PX); workers = int(opt('--workers', '3'))
    mem = zone_members(); S = stations()
    json.dump(dict(members=mem, stations=S), open(os.path.join(CACHE, 'stations.json'), 'w'), indent=0)
    J = [j for s in S for j in jobs_for(s, mem)]
    print(f'{len(S)} stations, {len(J)} calls, members {mem}', flush=True)
    done = [0]; fails = []
    def one(p):
        try: px(p)
        except Exception as e: fails.append(p['latitude']); print('  fail', p.get('latitude'), str(e)[:160], flush=True)
        done[0] += 1
        if done[0] % 20 == 0: print(f'  {done[0]}/{len(J)}', flush=True)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, J))
    print('done; failures', len(fails))


if __name__ == '__main__':
    main()
