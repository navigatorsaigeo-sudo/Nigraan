"""1.0.4 · harvester group C (boundary-layer height). Fake provider, fake clock; no network. Runs the real _run() order.
  B1 the probe: one request per model; a model with values = offered, all-null = not offered, HTTP 400 = not offered (refused)
  B2 group C is asked only for the offered model(s), after groups A and B, in prev/<model>/C/<YYYY-MM>.parquet
  B3 groups A and B: the same requests and the same files as the harvester without group C (the 283.40 order)
  B4 a restart the same day: zero requests (no probe again, current month already refreshed, closed months never again)
  B5 ensemble: boundary_layer_height is in the SAME request only for the offered ensemble model; its run file has the 5 summary columns;
     the other model's file and request are unchanged (no extra call)
  B6 a not-offered model is probed again after 30 days, an offered one never again
  B7 status.json: blh entries and blhModels; nothing in any file or log carries the key
usage: python -I harvest_blh40_test.py <tree>"""
import sys, os, json, tempfile, shutil, datetime as dt, types, calendar, glob
tree = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('http') else __import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))))
sys.path.insert(0, os.path.join(tree, 'station-lake', 'scripts'))
import pandas as pd
import fc_archive_harvest as H

CLOCK = [dt.datetime(2026, 10, 20, 9, 0)]
H.utcnow = lambda: CLOCK[0]
calls = []
OFFER = {'gfs_seamless', 'ecmwf_ifs025_ensemble'}
KEY = 'SECRETKEY123'


class FakeNet:
    def __init__(self, *a, **k): self.n = 0; self.key = KEY

    def get(self, host, path, q):
        self.n += 1; calls.append(dict(host=host, models=q['models'], hourly=q['hourly'], start=q.get('start_date'), end=q.get('end_date')))
        if q['models'] == 'kma_gdps' and 'boundary_layer_height' in q['hourly']:
            raise H.Rejected('Cannot initialize Variable from invalid String value boundary_layer_height')
        if 'ensemble' in host:
            t = pd.date_range('2026-10-20', periods=8 if q.get('forecast_days', 8) == 1 else 64, freq='3h').strftime('%Y-%m-%dT%H:%M').tolist()
        else:
            d0, d1 = dt.date.fromisoformat(q['start_date']), dt.date.fromisoformat(q['end_date'])
            t = pd.date_range(pd.Timestamp(d0), pd.Timestamp(d1) + pd.Timedelta(hours=21), freq='3h').strftime('%Y-%m-%dT%H:%M').tolist()
        out = []
        for _ in q['latitude'].split(','):
            h = {'time': t}
            for k in q['hourly'].split(','):
                nul = k.startswith('boundary_layer_height') and q['models'] not in OFFER
                if 'ensemble' in host:
                    for mm in ['', '_member01', '_member02']:
                        h[k + mm] = [None if nul else 500.0] * len(t)
                else:
                    h[k] = [None if nul else 700.0] * len(t)
            out.append({'hourly': h})
        return out if len(out) > 1 else out[0]


def stamp(root):
    ts = calendar.timegm(CLOCK[0].timetuple())
    for dp, _, fs in os.walk(root):
        for f in fs: os.utime(os.path.join(dp, f), (ts, ts))


ok = bad = 0
def check(c, m, info=None):
    global ok, bad
    print(('PASS ' if c else 'FAIL ') + m + ('' if c else '  :: ' + str(info)[:400])); ok += bool(c); bad += (not c)


tmp = tempfile.mkdtemp(prefix='hb40_')
H.Net = FakeNet
try:
    P = pd.DataFrame({'pid': [1, 2], 'lat': [33.6, 24.9], 'lon': [73.0, 67.0]})
    PM = ['ecmwf_ifs025', 'gfs_seamless', 'jma_gsm', 'kma_gdps']; EM = ['ecmwf_ifs025_ensemble', 'ecmwf_aifs025_ensemble']
    def run():
        calls.clear()
        a = types.SimpleNamespace(lake=tmp, d0='2026-09-01', d1=None, daily=False, models=','.join(PM + EM), only=None, pause=0, max_requests=None)
        rc = H._run(a, KEY, P, 'points.csv'); stamp(os.path.join(tmp, 'archive', 'fc_archive')); return rc, list(calls)
    out = os.path.join(tmp, 'archive', 'fc_archive')
    rc, c1 = run()
    S = json.load(open(os.path.join(out, 'status.json')))
    B = S.get('blh', {})
    probes = [x for x in c1 if 'boundary_layer_height' in x['hourly'] and (x['start'] is None or x['start'] != '2026-09-01') and (('previous_day1' in x['hourly'] and x['hourly'].count(',') == 1) or x['hourly'] == 'boundary_layer_height')]
    check(rc == 0 and len(probes) == len(PM) + len(EM), 'B1a one probe per model (%d)' % len(probes), [(p['models'], p['hourly']) for p in probes])
    check(B.get('previous-runs:gfs_seamless', {}).get('offered') is True and B.get('previous-runs:jma_gsm', {}).get('offered') is False
          and B.get('previous-runs:ecmwf_ifs025', {}).get('offered') is False and B.get('previous-runs:kma_gdps', {}).get('offered') is False
          and 'refused' in B.get('previous-runs:kma_gdps', {}).get('why', ''), 'B1b offered: gfs only; all-null jma/ecmwf and refused kma not offered', B)
    cC = [x for x in c1 if x['hourly'].startswith('boundary_layer_height,') and x['start'] in ('2026-09-01', '2026-10-01')]
    check(sorted({x['models'] for x in cC}) == ['gfs_seamless'] and len(cC) == 2, 'B2a group C asked only for gfs_seamless (Sep + Oct)', cC)
    fC = sorted(os.path.relpath(f, out) for f in glob.glob(os.path.join(out, 'prev', '*', 'C', '*.parquet')))
    check(fC == [os.path.join('prev', 'gfs_seamless', 'C', '2026-09.parquet'), os.path.join('prev', 'gfs_seamless', 'C', '2026-10.parquet')], 'B2b group C files only for gfs_seamless', fC)
    F = pd.read_parquet(os.path.join(out, 'prev', 'gfs_seamless', 'C', '2026-10.parquet'))
    check({'boundary_layer_height_d0', 'boundary_layer_height_d1', 'boundary_layer_height_d7'} <= set(F.columns) and F.duplicated(['pid', 'time']).sum() == 0, 'B2c group C columns per lead, one row per station+time', F.columns.tolist())
    last_ab = max(i for i, x in enumerate(c1) if not x['hourly'].startswith('boundary_layer_height') and 'ensemble' not in x['host'])
    first_c = min(i for i, x in enumerate(c1) if x in cC)
    check(first_c > last_ab, 'B2d group C after every group A/B request', (first_c, last_ab))
    ab = [(x['models'], x['hourly'].split(',')[0], x['start'], x['end']) for x in c1 if 'ensemble' not in x['host'] and not x['hourly'].startswith('boundary_layer_height')]
    want = [(m, g[1][0], s, e) for g in H.GROUPS for m in PM for s, e in (('2026-09-01', '2026-09-30'), ('2026-10-01', '2026-10-20'))]
    check(ab == want, 'B3a groups A/B: the same requests in the 283.40 order', (ab[:6], want[:6]))
    fab = sorted(os.path.relpath(f, out) for g in ('A', 'B') for f in glob.glob(os.path.join(out, 'prev', '*', g, '*.parquet')))
    check(len(fab) == len(PM) * 2 * 2, 'B3b groups A/B files: one per model, group and month (%d)' % len(fab), fab)
    ens = [x for x in c1 if 'ensemble' in x['host'] and x['hourly'] != 'boundary_layer_height' and x['hourly'] != 'temperature_2m']
    e1 = [x['hourly'] for x in ens if x['models'] == 'ecmwf_ifs025_ensemble']; e2 = [x['hourly'] for x in ens if x['models'] == 'ecmwf_aifs025_ensemble']
    check(e1 and all(h == ','.join(H.ENS_VARS + ['boundary_layer_height']) for h in e1) and e2 and all(h == ','.join(H.ENS_VARS) for h in e2) and len(e1) == len(e2),
          'B5a ensemble: BLH in the same request only for the offered model (same request count)', (e1, e2))
    run_f = glob.glob(os.path.join(out, 'ens', 'ecmwf_ifs025_ensemble', '*.parquet')); run_g = glob.glob(os.path.join(out, 'ens', 'ecmwf_aifs025_ensemble', '*.parquet'))
    E1 = pd.read_parquet(run_f[0]); E2 = pd.read_parquet(run_g[0])
    bc = ['boundary_layer_height_' + s for s in ('mean', 'p50', 'p10', 'p90', 'n')]
    check(all(c in E1.columns for c in bc) and not any(c.startswith('boundary_layer_height') for c in E2.columns) and float(E1.boundary_layer_height_mean.iloc[0]) == 500.0,
          'B5b offered ensemble run file has the 5 BLH columns; the other is unchanged', (E1.columns.tolist(), E2.columns.tolist()))
    rc, c2 = run(); check(rc == 0 and c2 == [], 'B4 restart the same day: zero requests', c2)
    CLOCK[0] = dt.datetime(2026, 11, 21, 2, 0)
    rc, c3 = run()
    pr3 = sorted({x['models'] for x in c3 if x['end'] in (None, (CLOCK[0].date() - dt.timedelta(days=2)).isoformat()) and 'boundary_layer_height' in x['hourly'] and x['hourly'].count(',') <= 1 and (x['start'] is None or x['start'] == (CLOCK[0].date() - dt.timedelta(days=4)).isoformat())})
    check(pr3 == sorted(['ecmwf_ifs025', 'jma_gsm', 'kma_gdps', 'ecmwf_aifs025_ensemble']), 'B6 32 days later: the not-offered models probed again, the offered ones not', pr3)
    S = json.load(open(os.path.join(out, 'status.json')))
    check(S.get('blhModels') == ['gfs_seamless'] and S.get('state') == 'finished', 'B7a status: blhModels and state', (S.get('blhModels'), S.get('state')))
    leak = [f for dp, _, fs in os.walk(tmp) for f in fs if KEY.encode() in open(os.path.join(dp, f), 'rb').read()]
    check(leak == [], 'B7b no file carries the key', leak)
    print('\nharvest_blh40: %d pass, %d fail' % (ok, bad)); sys.exit(1 if bad else 0)
finally:
    shutil.rmtree(tmp, ignore_errors=True)
