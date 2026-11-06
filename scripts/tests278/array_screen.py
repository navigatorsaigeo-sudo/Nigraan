"""v91.17.278 · FIX278 5 · derivation of the outdoor-array screen (stuckscreen.mjs ARRAY_RULE) from the LAMHA copy of the MACH database.
usage: python3 -I array_screen.py [folder with obs_YYYYMMDD.csv] [data/mach-fleet-stations.json]
A reading is 'array-silent' when its outdoor sensor array reports nothing: solar exactly 0 AND wind and gust exactly 0 (or absent).
  ELEV_DEG  the sun elevation from which a working station's solar sensor is not exactly 0: the lowest 5-degree bin whose share of
            exactly-zero solar readings (all registered, not excluded stations with a solar sensor) is at most 1.5 x the median share of
            the bins above it (the shares fall from 15 % at 0-5 degrees to a 1-2 % plateau that the faulty sensors make).
  RUN_MIN   the longest daylight array-silent run (consecutive readings, gaps <= 90 min, sun >= ELEV_DEG) at any station whose daylight
            array-silent share is at or below the 95th percentile of the station shares (the 5 % of stations with the most such readings
            are the population under test, not the reference). The station under judgement (Khaplu) is never in the reference."""
import csv, glob, json, collections, math, sys, statistics
from datetime import datetime
DB = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/LAMHA/data/mach/db'
REG = sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/v278/srv_fix/data/mach-fleet-stations.json'
reg = {x['key']: x for x in json.load(open(REG))['stations'] if x.get('lat') is not None}
excl = {k for k, x in reg.items() if x.get('exclude')} | {'khaplu'}
def elev(lat, lon, ms):
    d = datetime.utcfromtimestamp(ms / 1000); n = d.timetuple().tm_yday; h = d.hour + d.minute / 60 + d.second / 3600
    g = 2 * math.pi / 365 * (n - 1 + (h - 12) / 24)
    dec = 0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g)
    eq = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    ha = math.radians((h * 60 + eq + 4 * lon) / 4 - 180); la = math.radians(lat)
    return math.degrees(math.asin(max(-1, min(1, math.sin(la) * math.sin(dec) + math.cos(la) * math.cos(dec) * math.cos(ha)))))
def f(v):
    try: return float(v)
    except Exception: return None
def pct(a, q):
    a = sorted(a); i = (len(a) - 1) * q; lo = math.floor(i); hi = math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo)
data = collections.defaultdict(dict)
files = sorted(glob.glob(DB + '/obs_202610*.csv'))
for fn in files:
    for r in csv.DictReader(open(fn)):
        k = r['stationKey']
        if k not in reg or r['source'] == 'qm': continue
        ms = datetime.fromisoformat(r['time'].replace('Z', '+00:00')).timestamp() * 1000
        data[k][ms] = (f(r['solarWm2']), f(r['windSpeedKmh']), f(r['windGustKmh']))
ref = [k for k in data if k not in excl and any(v[0] and v[0] > 0 for v in data[k].values())]
silent = lambda v: v[0] == 0 and not (v[1] or 0) > 0 and not (v[2] or 0) > 0
bins = collections.defaultdict(lambda: [0, 0])
for k in ref:
    for ms, v in data[k].items():
        if v[0] is None: continue
        b = int(elev(reg[k]['lat'], reg[k]['lon'], ms) // 5) * 5; bins[b][0] += 1; bins[b][1] += v[0] == 0
sh = {b: bins[b][1] / bins[b][0] for b in bins if b >= 0 and bins[b][0] >= 500}
E = next(b for b in sorted(sh) if sh[b] <= 1.5 * statistics.median([sh[x] for x in sh if x >= b]))
share, runs = {}, collections.defaultdict(list)
for k in ref:
    n = z = 0; cur = None
    for ms in sorted(data[k]):
        v = data[k][ms]
        if v[0] is None: continue
        day = elev(reg[k]['lat'], reg[k]['lon'], ms) >= E
        if not day:
            if cur: runs[k].append(cur[1] - cur[0]); cur = None
            continue
        n += 1
        if silent(v):
            z += 1
            if cur and (ms - cur[1]) / 6e4 <= 90: cur[1] = ms
            else:
                if cur: runs[k].append(cur[1] - cur[0])
                cur = [ms, ms]
        elif cur: runs[k].append(cur[1] - cur[0]); cur = None
    if cur: runs[k].append(cur[1] - cur[0])
    if n: share[k] = z / n
p95 = pct(list(share.values()), 0.95)
refk = [k for k in share if share[k] <= p95]
L = max([x / 6e4 for k in refk for x in runs[k]] or [0])
print(json.dumps({'files': [fn.split('/')[-1] for fn in (files[0], files[-1])], 'stations_with_solar': len(ref), 'zero_solar_share_by_elev_bin': {b: round(sh[b] * 100, 2) for b in sorted(sh)},
  'ELEV_DEG': E, 'station_share_p95': round(p95, 4), 'reference_stations': len(refk), 'under_test': sorted((k, round(share[k], 3)) for k in share if share[k] > p95),
  'RUN_MIN': round(L, 1), 'longest_reference_runs_min': sorted([round(x / 6e4) for k in refk for x in runs[k]])[-5:]}, indent=1))
