#!/usr/bin/env python3
"""v91.17.170 - score the issued air forecast (daily PM2.5) against the Punjab provincial stations. INTERNAL.

Reads  station-lake/archive/aq/issued_YYYY-MM.jsonl   (server/api/smog.mjs: cams = composition model, served = what was shown)
       station-lake/archive/epd/epd_YYYY-MM.jsonl     (server/api/epdaq.mjs: hourly station readings, UTC)
       data/pk-tehsils.json                           (station -> tehsil by polygon)
Truth  station daily mean PM2.5 over the PKT calendar day, >= 18 valid hours (pm25bad and flagged readings dropped; the same
       24 h completeness rule the US-monitor fit used). Several stations in one tehsil are scored separately.
Issue  the first issue of each 12 h block per (tehsil, day), so a re-run never scores twice.
Prints by lead (0-4 days): n, MAE and bias of cams and served, category agreement on the US EPA 24 h classes (2024),
detection of Unhealthy-or-worse days, and a bootstrap 90 % interval (resampled by station) of the MAE gain served vs cams.
Writes data/aq-issued-score.json. Meaningful after about 30 days of issues (first full month: November 2026).
  python scripts/aq_issued_score.py [--lake <station-lake dir>]
"""
import glob, json, os, sys, datetime as dt
from collections import defaultdict
import numpy as np
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.dirname(HERE)
a = sys.argv; LAKE = a[a.index('--lake') + 1] if '--lake' in a else os.path.join(APP, '..', 'station-lake')
CUTS = [9.0, 35.4, 55.4, 125.4, 225.4]          # US EPA 24 h PM2.5 breakpoints (2024), same as server/api/smog.mjs
cls = lambda v: int(np.searchsorted(CUTS, v, side='left'))

F = json.load(open(os.path.join(APP, 'data', 'pk-tehsils.json')))['features']
G = [shape(f['geometry']).buffer(0) for f in F]; T = STRtree(G); UID = [f['properties']['uid'] for f in F]
def tehsil(lat, lon):
    p = Point(lon, lat)
    for i in T.query(p):
        if G[i].contains(p): return UID[i]
    return None

# station daily means (PKT day)
hours = defaultdict(list); where = {}
for f in sorted(glob.glob(os.path.join(LAKE, 'archive', 'epd', 'epd_*.jsonl'))):
    for line in open(f, encoding='utf8'):
        try: r = json.loads(line)
        except Exception: continue
        v = r.get('pm25')
        if v is None or r.get('pm25bad') or r.get('flags'): continue
        t = dt.datetime.fromisoformat(r['t'].replace('Z', '+00:00')) + dt.timedelta(hours=5)
        hours[(r['id'], t.date().isoformat())].append(float(v)); where[r['id']] = (r['lat'], r['lon'])
st_uid = {s: tehsil(*ll) for s, ll in where.items()}
obs = {}
for (s, d), v in hours.items():
    if len(v) >= 18 and st_uid.get(s): obs[(s, d)] = float(np.mean(v))
by_uid_day = defaultdict(list)
for (s, d), v in obs.items(): by_uid_day[(st_uid[s], d)].append((s, v))

# issues
seen, rows = set(), []
for f in sorted(glob.glob(os.path.join(LAKE, 'archive', 'aq', 'issued_*.jsonl'))):
    for line in open(f, encoding='utf8'):
        try: r = json.loads(line)
        except Exception: continue
        blk = r['issued'][:10] + ('12' if int(r['issued'][11:13]) >= 12 else '00'); k = (blk, r['uid'], r['date'])
        if k in seen: continue
        seen.add(k)
        for s, o in by_uid_day.get((r['uid'], r['date']), []):
            rows.append((min(4, int(r['lead'])), s, o, float(r['cams']), float(r['served'] if r.get('served') is not None else r['cams']), r.get('gc')))

rng = np.random.default_rng(1); out = {'stations': len(where), 'stationsInTehsils': sum(1 for v in st_uid.values() if v), 'stationDays': len(obs),
                                       'issues': len({k[0] for k in seen}), 'leads': {}}
for L in range(5):
    R = [x for x in rows if x[0] == L]
    if not R: continue
    o = np.array([x[2] for x in R]); c = np.array([x[3] for x in R]); s = np.array([x[4] for x in R]); st = np.array([x[1] for x in R])
    co, cc, cs = [cls(v) for v in o], [cls(v) for v in c], [cls(v) for v in s]
    uo = np.array(co) >= 3
    def pod(p): p = np.array(p) >= 3; return None if uo.sum() == 0 else round(float((p & uo).sum() / uo.sum()), 3)
    us = np.unique(st); idx = {k: np.where(st == k)[0] for k in us}; g = []
    for _ in range(1000):
        i = np.concatenate([idx[k] for k in rng.choice(us, len(us))]); g.append(np.mean(np.abs(c[i] - o[i])) - np.mean(np.abs(s[i] - o[i])))
    out['leads'][L] = {'n': len(R), 'stations': int(len(us)),
                       'cams': {'mae': round(float(np.mean(np.abs(c - o))), 1), 'bias': round(float(np.mean(c - o)), 1), 'cat': round(float(np.mean(np.array(cc) == np.array(co))), 3), 'podUnhealthy': pod(cc)},
                       'served': {'mae': round(float(np.mean(np.abs(s - o))), 1), 'bias': round(float(np.mean(s - o)), 1), 'cat': round(float(np.mean(np.array(cs) == np.array(co))), 3), 'podUnhealthy': pod(cs)},
                       'maeGainServed': round(float(np.mean(np.abs(c - o)) - np.mean(np.abs(s - o))), 1), 'gain90': [round(float(np.quantile(g, .05)), 1), round(float(np.quantile(g, .95)), 1)],
                       'groundCheckedShare': round(float(np.mean([x[5] is not None for x in R])), 3)}
    v = out['leads'][L]; print(f"lead {L} d  n {v['n']:5d}  MAE cams {v['cams']['mae']:.1f}  served {v['served']['mae']:.1f}  gain {v['maeGainServed']:+.1f} {v['gain90']}  cat {v['cams']['cat']:.2f} -> {v['served']['cat']:.2f}")
if not rows: print('no issued day has a complete station day yet: keep the server running; re-run after a few days (30 days for a result)')
out['use'] = 'internal verification; provincial station readings are not shown to customers'
json.dump(out, open(os.path.join(APP, 'data', 'aq-issued-score.json'), 'w'), indent=1)
