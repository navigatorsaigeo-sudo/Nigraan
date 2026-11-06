"""v91.17.274 PLUVIAL · the SERVED chain itself (data/archive/forecast: the hourly rain the engine read, 26 Sep - 12 Oct 2026) against
the stuck-screened MACH fleet (fleet_hourly_rain.mjs). Per tehsil-day (PKT): the served forecast's wettest hour (latest issue before the
day starts: lead 0-24 h) and the page's rain drive on it, vs the wettest gauge hour in the tehsil; and the served engine's levels are not
archived in the copies, so the level is not shown here. Descriptive (one wet spell): event counts and the served peak on gauge-event days.
python3 served_archive_check.py <root>  -> data/pluv274/served-archive-check.json"""
import json, gzip, os, sys, re, numpy as np, pandas as pd, geopandas as gpd
from shapely.geometry import Point
ROOT = sys.argv[1]; D = os.path.join(ROOT, 'data')
PAGE = open(os.path.join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), encoding='utf8').read()
BANDS = json.loads(re.search(r'rainBands:\s*\{ value:(\[[^\]]*\])', PAGE).group(1))
FC = {}
for f in ('fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz'):
    for l in gzip.open(os.path.join(D, 'archive', 'forecast', f), 'rt'):
        r = json.loads(l); t0 = pd.Timestamp(r['t0']).tz_convert(None) + pd.Timedelta(hours=5)
        P = json.loads(r['P']) if isinstance(r['P'], str) else r['P']
        s = pd.Series(np.array(P, float) / 10, index=pd.date_range(t0, periods=len(P), freq='h'))
        FC.setdefault(r['u'], []).append((pd.Timestamp(r['iss']).tz_convert(None) + pd.Timedelta(hours=5), s))
G = pd.read_csv(os.path.join(D, 'pluv274', 'fleet_rain_2026-09-26_10-12.csv'))
st = json.load(open(os.path.join(D, 'mach-fleet-stations.json')))['stations']
LL = {s['key']: (s['lat'], s['lon']) for s in st if s.get('lat') is not None}
T = gpd.read_file(os.path.join(D, 'pk-tehsils.json'))[['uid', 'geometry']]
ks = [k for k in G.station.unique() if k in LL]
S = gpd.sjoin(gpd.GeoDataFrame({'k': ks}, geometry=[Point(LL[k][1], LL[k][0]) for k in ks], crs=T.crs), T, predicate='within').drop_duplicates('k').set_index('k').uid
G = G[G.station.isin(S.index)].copy(); G['uid'] = G.station.map(S); G['date'] = G.hour_pkt.str[:10]
GD = G.groupby(['uid', 'date']).agg(gmax=('rain_mm', 'max'), stations=('station', 'nunique')).reset_index()
rows = []
for r in GD.itertuples():
    iss = [x for x in FC.get(r.uid, []) if x[0] < pd.Timestamp(r.date)]
    if not iss: continue
    s = max(iss, key=lambda x: x[0])[1]; day = s[(s.index >= pd.Timestamp(r.date)) & (s.index < pd.Timestamp(r.date) + pd.Timedelta(days=1))]
    if len(day) < 20: continue
    rows.append(dict(uid=r.uid, date=r.date, gmax=r.gmax, stations=r.stations, fpk=float(day.max()), f6=float(day.rolling(6, min_periods=1).sum().max()),
                     lead_h=round((pd.Timestamp(r.date) - max(iss, key=lambda x: x[0])[0]).total_seconds() / 3600, 1)))
M = pd.DataFrame(rows)
out = {'tehsilDays': int(len(M)), 'tehsils': int(M.uid.nunique()), 'days': sorted(M.date.unique().tolist()), 'modelRungs': BANDS}
for r in (7, 20):
    e = M[M.gmax >= r]
    out[f'gauge>={r}mm/h'] = {'events': int(len(e)), 'cases': e.sort_values('gmax', ascending=False)[['uid', 'date', 'gmax', 'stations', 'fpk', 'f6', 'lead_h']].round(2).to_dict('records'),
                              'servedPeakReachedModelRung': int((e.fpk >= BANDS[[2, 7, 20, 50].index(r)]).sum()),
                              'nonEventDaysAtThatRung': int(((M.gmax < 2) & (M.fpk >= BANDS[[2, 7, 20, 50].index(r)])).sum())}
json.dump(out, open(os.path.join(D, 'pluv274', 'served-archive-check.json'), 'w'), indent=1, default=str)
print(json.dumps(out, default=str)[:2500])
