"""v91.17.283 WS2 item 4 (F1) · derivation of the per-reading range screen of live MACH readings (server/api/fleet.mjs screen(),
data/fleet-range-screen.json). Inputs already in the tree (read only):
  scripts/dew275/out/fleet_pairs_dew.parquet   12,647 live MACH readings paired with the served forecast hour (23 Sep - 15 Oct 2026)
  data/obs/Pakistan_Historical_Weather.csv     NOAA GSOD daily maxima / minima, 55 Pakistan stations, 2024-01 .. 2025-08
  data/mach-fleet-stations.json                registry (excluded stations are left out of the pair history)
Rule:
  with a served forecast for the reading's hour: reject when reading - served lies outside [RES_MIN, RES_MAX], the full range of
    (reading - served) over the clean pair history (no clean reading ever departed further), so a front or a shower the history holds
    is never rejected;
  with no served forecast: reject when the reading lies outside the calendar month's national envelope, the lowest GSOD daily minimum
    + RES_MIN to the highest GSOD daily maximum + RES_MAX (a station may sit beyond the 55-station record by as much as a station
    has ever departed from the served forecast).
usage: python3 -I derive_range.py [srv root] [out.json]"""
import sys, json, csv, collections
import pyarrow.parquet as pq
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else None
reg = json.load(open(ROOT + '/data/mach-fleet-stations.json'))
excl = {x['key'] for x in reg['stations'] if x.get('exclude')}
d = pq.read_table(ROOT + '/scripts/dew275/out/fleet_pairs_dew.parquet', columns=['key', 'obs_utc', 'temp_c', 'fc_served_c']).to_pandas()
d = d[~d.key.isin(excl)].dropna(subset=['temp_c', 'fc_served_c'])
e = d.temp_c - d.fc_served_c
RES_MIN, RES_MAX = round(float(e.min()), 1), round(float(e.max()), 1)
def f(x):
    try:
        v = float(x); return v if v < 900 else None
    except Exception: return None
mx = collections.defaultdict(list); mn = collections.defaultdict(list); n = 0; st = set()
for r in csv.DictReader(open(ROOT + '/data/obs/Pakistan_Historical_Weather.csv', encoding='utf-8-sig')):
    m = int(r['date_utc'][5:7]); a, b = f(r['temperature_max_c']), f(r['temperature_min_c']); st.add(r['station_id']); n += 1
    if a is not None: mx[m].append(a)
    if b is not None: mn[m].append(b)
months = {str(m): {'lo': round(min(mn[m]) + RES_MIN, 1), 'hi': round(max(mx[m]) + RES_MAX, 1), 'gsodMin': min(mn[m]), 'gsodMax': max(mx[m])} for m in range(1, 13)}
res = {'version': 'range-91.17.283', 'residual': {'min': RES_MIN, 'max': RES_MAX, 'pairs': int(len(e)), 'stations': int(d.key.nunique()), 'window': [str(d.obs_utc.min())[:10], str(d.obs_utc.max())[:10]],
         'source': 'scripts/dew275/out/fleet_pairs_dew.parquet (live MACH readings paired with the served forecast hour), registry-excluded stations left out'},
       'absolute': {'byMonth': months, 'source': 'data/obs/Pakistan_Historical_Weather.csv (NOAA GSOD, %d station-days, %d stations) widened by the residual range' % (n, len(st))},
       'rule': 'reject a live temperature reading when reading - served forecast at its hour is outside [residual.min, residual.max]; with no served forecast, when the reading is outside absolute.byMonth[month] [lo, hi]. Wind, gust, rain rate and rain total below 0 are dropped (impossible by definition). A reading time later than the poll by more than the fresh window is rejected.'}
print(json.dumps(res, indent=1))
if OUT: json.dump(res, open(OUT, 'w'), indent=1)
