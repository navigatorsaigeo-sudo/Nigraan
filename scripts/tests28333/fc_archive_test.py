"""v91.17.283.33 · fc_archive_harvest.py with a mocked Open-Meteo: resume, de-duplication, a rejected model skipped, 429 back-off,
ensemble summaries and per-member rain, the key never in the log. Run: python fc_archive_test.py <station-lake scripts dir>"""
import os, sys, io, json, tempfile, shutil, urllib.error, urllib.parse
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', '..', 'station-lake', 'scripts'))
import fc_archive_harvest as H
ok_n = fail_n = 0
def ok(c, m, d=''):
    global ok_n, fail_n
    print(('PASS ' if c else 'FAIL ') + m + ('' if c else ' :: ' + str(d)[:300])); ok_n += bool(c); fail_n += (not c)
KEY = 'SECRETKEY123'
class Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False
calls = []
MODE = {'429': False}
def opener(url, t):
    q = dict(urllib.parse.parse_qsl(url.split('?', 1)[1])); calls.append(q)
    if MODE['429']: raise urllib.error.HTTPError(url, 429, 'Too many', {}, io.BytesIO(b'{"reason":"limit"}'))
    m = q['models']
    if m == 'bad_model': raise urllib.error.HTTPError(url, 400, 'bad', {}, io.BytesIO(b'{"error":true,"reason":"Cannot initialize models from given string"}'))
    lats = q['latitude'].split(','); hv = q['hourly'].split(',')
    if 'ensemble' in m:
        n = 3; times = ['2026-10-29T%02d:00' % h for h in range(0, 24, 3)]
        def o(i):
            h = {'time': times}
            for v in hv:
                h[v] = [1.0 + i] * len(times)
                for k in range(1, n + 1): h['%s_member%02d' % (v, k)] = [1.0 + i + k] * len(times)
            return {'hourly': h}
        js = [o(i) for i in range(len(lats))]
    else:
        times = [q['start_date'] + 'T00:00', q['start_date'] + 'T03:00', q['start_date'] + 'T03:00']   # a duplicated step
        js = [{'hourly': dict({'time': times}, **{v: [1.0, 2.0, 2.0] for v in hv})} for _ in lats]
    return Resp(json.dumps(js if len(js) > 1 else js[0]).encode())
tmp = tempfile.mkdtemp()
try:
    lake = os.path.join(tmp, 'lake'); os.makedirs(lake)
    pts = os.path.join(tmp, 'points.csv')
    open(pts, 'w').write('pid,src,sid,name,lat,lon\n0,mach,a,A,33.6,73.0\n1,mach_wu,a2,A,33.6,73.0\n2,ews_gb,b,B,35.9,74.3\n3,isd,c,C,24.9,67.1\n')
    os.environ['MACH_API_KEY'] = KEY
    class A: pass
    def run(extra):
        a = H.argparse.Namespace(app=tmp, lake=lake, points=pts, d0='2025-01-01', d1='2025-02-15', models=None, only=None, max_requests=None, pause=0, daily=False)
        for k, v in extra.items(): setattr(a, k, v)
        hv = H.Harvest(a); hv.net = H.Net(KEY, 0, hv.log, None, opener); P = H.load_points(pts)
        try:
            if a.only in (None, 'prev'): hv.prev(P, H.dt.date.fromisoformat(a.d0), H.dt.date.fromisoformat(a.d1), a.models.split(','))
            if a.only in (None, 'ens'): hv.ens(P, [m for m in a.models.split(',') if 'ensemble' in m])
        except H.Http429: hv.st['stoppedOn429'] = True; hv.save(); return hv, 2
        hv.save(); return hv, 0
    P = H.load_points(pts); ok(len(P) == 3, 'the WU twin of a MACH station is dropped (same place)', len(P))
    hv, rc = run({'models': 'ecmwf_ifs025,bad_model', 'only': 'prev'})
    f = os.path.join(lake, 'archive', 'fc_archive', 'prev', 'ecmwf_ifs025', 'A', '2025-01.parquet')
    ok(os.path.exists(f), 'a month file is written per model and group', f)
    import pandas as pd
    D = pd.read_parquet(f); ok(len(D) == 3 * 2 and not D.duplicated(['pid', 'time']).any(), 'rows de-duplicated per station and time', len(D))
    ok('temperature_2m_d1' in D.columns and 'precipitation_d7' in D.columns, 'leads stored as <var>_d<lead>', list(D.columns)[:6])
    ok('bad_model' in hv.st['rejected'], 'a model the API rejects is skipped and logged', hv.st['rejected'])
    n0 = len(calls); hv, rc = run({'models': 'ecmwf_ifs025', 'only': 'prev'})
    asked = [c for c in calls[n0:] if c['start_date'].startswith('2025-01')]
    ok(not asked, 'resume: a finished month is not asked again', len(asked))
    log = open(os.path.join(lake, 'archive', 'fc_archive', 'harvest_log.txt')).read() + json.dumps(json.load(open(os.path.join(lake, 'archive', 'fc_archive', 'status.json'))))
    ok(KEY not in log, 'the key is never in the log or the status')
    hv, rc = run({'models': 'google_weathernext2_ensemble', 'only': 'ens'})
    ed = os.path.join(lake, 'archive', 'fc_archive', 'ens', 'google_weathernext2_ensemble'); fs = os.listdir(ed) if os.path.isdir(ed) else []
    ok(any(x.endswith('.parquet') for x in fs) and any(x.endswith('_rain_members.npz') for x in fs), 'an ensemble run: summary parquet and per-member rain', fs)
    E = pd.read_parquet(os.path.join(ed, [x for x in fs if x.endswith('.parquet')][0]))
    r = E[E.pid == 0].iloc[0]
    ok(r['precipitation_n'] == 4 and abs(r['precipitation_p50'] - 2.5) < 1e-6 and r['precipitation_p10'] <= r['precipitation_p50'] <= r['precipitation_p90'], 'members summarised: count, median, 10/90 %', dict(r))
    st = json.load(open(os.path.join(lake, 'archive', 'fc_archive', 'status.json')))
    ok('own capture from' in st['models']['google_weathernext2_ensemble'].get('archiveNote', ''), 'the ensemble archive start is labelled honestly', st['models']['google_weathernext2_ensemble'])
    MODE['429'] = True; hv, rc = run({'models': 'gfs_seamless', 'only': 'prev'})
    ok(rc == 2 and hv.st.get('stoppedOn429'), '429: stops for the day (exit 2), resumable', rc)
finally:
    shutil.rmtree(tmp, ignore_errors=True)
print('SUMMARY %d pass %d fail' % (ok_n, fail_n)); sys.exit(1 if fail_n else 0)
