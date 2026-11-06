"""v91.17.163 - O3: score the synoptic running correction on issues kept as they were made.

Reads station-lake/archive/synop/issued_YYYY-MM.jsonl (written by server/api/synop.mjs at each 00/12 UTC block:
raw = served value without the layer, corr = correction the layer adds at the station) and synop_YYYY-MM.jsonl
(the reports, t_c). Joins on (station, valid hour), keeps the first issue per (12 h block, station, valid),
and prints MAE by lead for raw and raw+corr, with n and a paired bootstrap 90 % interval of the gain.

  python scripts/synop_issued_score.py [lake_dir]       (default ../station-lake/archive/synop)
Writes data/synop-issued-score.json. Needs 30 days of issues before the result means much.
"""
import glob, json, os, random, sys
from collections import defaultdict

here = os.path.dirname(os.path.abspath(__file__))
lake = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', '..', 'station-lake', 'archive', 'synop')

obs = {}
for f in sorted(glob.glob(os.path.join(lake, 'synop_*.jsonl'))):
    for line in open(f, encoding='utf8'):
        try: r = json.loads(line)
        except Exception: continue
        if r.get('t_c') is None: continue
        obs[(r['sid'], r['t'][:13])] = r['t_c']

seen, rows = set(), defaultdict(list)
for f in sorted(glob.glob(os.path.join(lake, 'issued_*.jsonl'))):
    for line in open(f, encoding='utf8'):
        try: r = json.loads(line)
        except Exception: continue
        block = r['issued'][:10] + ('12' if int(r['issued'][11:13]) >= 12 else '00')
        k = (block, r['sid'], r['valid'][:13])
        if k in seen: continue
        seen.add(k)
        o = obs.get((r['sid'], r['valid'][:13]))
        if o is None or r.get('raw') is None: continue
        c = r.get('corr') or 0.0
        if abs(o - r['raw']) > 15: continue   # gross error in the report
        lead = min(48, 3 * round(r['lead'] / 3))
        rows[lead].append((abs(o - r['raw']), abs(o - (r['raw'] + c))))

random.seed(1)
out = {'built_from': lake, 'issues': len({k[0] for k in seen}), 'leads': {}}
for L in sorted(rows):
    v = rows[L]; n = len(v)
    a = sum(x for x, _ in v) / n; b = sum(y for _, y in v) / n
    gains = []
    for _ in range(500):
        s = [v[random.randrange(n)] for _ in range(n)]
        gains.append(sum(x - y for x, y in s) / n)
    gains.sort()
    out['leads'][L] = {'n': n, 'mae_raw': round(a, 3), 'mae_corr': round(b, 3), 'gain': round(a - b, 3),
                       'gain90': [round(gains[25], 3), round(gains[474], 3)]}
    print(f'lead {L:2d} h  n {n:5d}  MAE raw {a:.2f}  corrected {b:.2f}  gain {a-b:+.2f} [{gains[25]:+.2f}, {gains[474]:+.2f}]')
if not rows:
    print('no issue has a report yet: keep the server running; re-run after a few days (30 days for a result)')
json.dump(out, open(os.path.join(here, '..', 'data', 'synop-issued-score.json'), 'w'), indent=1)
