"""v91.17.283.40 · harvester current-month refetch (owner: "harvest downloading duplicates"). Fake provider, fake clock; no network.
  H1 first run on 20 Oct: the closed month (Sep) and the current month (Oct 1-20) are fetched once each
  H2 restart the same day: ZERO requests (closed month never again; current month refreshed at most once a day)
  H3 restart the next day (21 Oct): only the current month, asked from 20 Oct (the day it was saved on), not from 1 Oct
  H4 the saved rows are kept and appended without duplicates (one row per station + time), day 20 replaced by the newer answer
  H5 restart again on 21 Oct: zero requests
usage: python -I harvest40_test.py <tree>"""
import sys, os, json, tempfile, shutil, datetime as dt, types, calendar
tree = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('http') else __import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))))
sys.path.insert(0, os.path.join(tree, 'station-lake', 'scripts'))
import pandas as pd
import fc_archive_harvest as H

CLOCK = [dt.datetime(2026, 10, 20, 9, 0)]
H.utcnow = lambda: CLOCK[0]
calls = []


class FakeNet:
    n = 0
    def get(self, host, path, q):
        self.n += 1; calls.append((q['models'], q['hourly'].split(',')[0], q['start_date'], q['end_date']))
        d0, d1 = dt.date.fromisoformat(q['start_date']), dt.date.fromisoformat(q['end_date'])
        t = pd.date_range(pd.Timestamp(d0), pd.Timestamp(d1) + pd.Timedelta(hours=21), freq='3h').strftime('%Y-%m-%dT%H:%M').tolist()
        lats = q['latitude'].split(',')
        out = []
        for _ in lats:
            h = {'time': t}
            for k in q['hourly'].split(','): h[k] = [float(CLOCK[0].day)] * len(t)   # the value says which run day answered
            out.append({'hourly': h})
        return out if len(out) > 1 else out[0]


def stamp_files(root):   # files written "now" carry the fake clock's date as mtime
    ts = calendar.timegm(CLOCK[0].timetuple())
    for dp, _, fs in os.walk(root):
        for f in fs: os.utime(os.path.join(dp, f), (ts, ts))


tmp = tempfile.mkdtemp(prefix='h40_')
try:
    a = types.SimpleNamespace(lake=tmp)
    P = pd.DataFrame({'pid': [1, 2], 'lat': [33.6, 24.9], 'lon': [73.0, 67.0]})
    def run():
        calls.clear(); h = H.Harvest(a, net=FakeNet()); h.prev(P, dt.date(2026, 9, 1), CLOCK[0].date(), ['ecmwf_ifs025']); stamp_files(os.path.join(tmp, 'archive', 'fc_archive', 'prev')); return list(calls)
    ok = 0; bad = 0
    def check(c, m, info=None):
        global ok, bad
        print(('PASS ' if c else 'FAIL ') + m + ('' if c else '  :: ' + str(info)[:300])); ok += c; bad += (not c)
    c1 = run()
    check(len(c1) == 4 and sorted({(x[1][:5], x[2]) for x in c1}) == sorted({('tempe', '2026-09-01'), ('tempe', '2026-10-01'), ('wind_', '2026-09-01'), ('wind_', '2026-10-01')}), 'H1 first run: Sep + Oct for groups A and B (4 requests)', c1)
    c2 = run(); check(c2 == [], 'H2 restart the same day: zero requests', c2)
    CLOCK[0] = dt.datetime(2026, 10, 21, 2, 0)
    c3 = run(); check(len(c3) == 2 and all(x[2] == '2026-10-20' and x[3] == '2026-10-21' for x in c3), 'H3 next day: only Oct, asked from 20 Oct (2 requests)', c3)
    F = pd.read_parquet(os.path.join(tmp, 'archive', 'fc_archive', 'prev', 'ecmwf_ifs025', 'A', '2026-10.parquet'))
    F['time'] = pd.to_datetime(F.time)
    dup = int(F.duplicated(['pid', 'time']).sum()); days = sorted(F.time.dt.date.unique())
    v19 = F[F.time.dt.date == dt.date(2026, 10, 19)].temperature_2m_d0.unique().tolist(); v20 = F[F.time.dt.date == dt.date(2026, 10, 20)].temperature_2m_d0.unique().tolist()
    check(dup == 0 and days[0] == dt.date(2026, 10, 1) and days[-1] == dt.date(2026, 10, 21) and len(F) == 2 * 21 * 8, 'H4 saved rows kept, appended, no duplicate station+time (%d rows)' % len(F), (dup, days[0], days[-1], len(F)))
    check(v19 == [20.0] and v20 == [21.0], 'H4b 19 Oct kept from the first run, 20 Oct replaced by the newer answer', (v19, v20))
    c5 = run(); check(c5 == [], 'H5 restart again on 21 Oct: zero requests', c5)
    S = json.load(open(os.path.join(tmp, 'archive', 'fc_archive', 'status.json')))
    g = S['models']['ecmwf_ifs025']['groups']['A']; check(g['rows_by_month']['2026-10'] == len(F) and set(g) >= {'months', 'rows_by_month', 'rows', 'first', 'last'}, 'H6 status.json format unchanged, rows of the month updated', g)
    print('\nharvest40: %d pass, %d fail' % (ok, bad)); sys.exit(1 if bad else 0)
finally:
    shutil.rmtree(tmp, ignore_errors=True)
