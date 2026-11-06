"""v91.17.283.38 item 11 · the ensemble archive's run identification (scripts/ens_archive.py native_step_check)
   A  the provider's live answer of 30 Oct 2026 18:50 UTC (ECMWF members, one Gilgit point, 51 members, ens38_provider_sample.json; metadata:
      last run 30 Oct 06 UTC, data end +147 h) read as the 00 UTC long run: 3-hourly to +150 h, 6-hourly after = the 06 UTC short run over
      the first hours and the long run after it: still refused as one run ('fail')
   D  the archiver itself (main, --dry, provider calls replaced by the sample): that state no longer ends in "run not identified": the
      newest run (06 UTC, +144 h) is chosen and archived to its own end, as the day's catch-up run
   E  the same with a run of this model saved 10 h before: the 06 UTC run is not taken (one run a day)
   B  a real newer run inside the data (3-hourly past +144 h, the far tail split evenly) -> still 'fail'
   C  a normal run (3-hourly to +144 h, 6-hourly after) -> 'pass'
   usage: python scripts/tests28338/ens38_test.py"""
import os, sys, json, importlib.util, datetime as dt
import numpy as np
H = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(H, '..', '..'))
sys.argv = [sys.argv[0], '--app', ROOT]
spec = importlib.util.spec_from_file_location('ens', os.path.join(ROOT, 'scripts', 'ens_archive.py')); E = importlib.util.module_from_spec(spec); spec.loader.exec_module(E)
P = F = 0
def ok(c, n, i=''):
    global P, F
    if c: P += 1; print('PASS ' + n)
    else: F += 1; print('FAIL ' + n + ' :: ' + str(i)[:400])
M = {'id': 'ecmwf_ifs025', 'members': 51, 'kind': 'members', 'vars': ['precipitation']}
j = json.load(open(os.path.join(H, 'ens38_provider_sample.json')))['hourly']
t = [dt.datetime.strptime(x, '%Y-%m-%dT%H:%M').replace(tzinfo=dt.timezone.utc) for x in j['time']]
init = t[0]; keys = [k for k in j if k.startswith('precipitation')]
valid = [init + dt.timedelta(hours=h) for h in range(3, 238, 3)]
acc = np.array([[E.three_hour(j['time'], j[k], valid)] for k in keys])
v, d = E.native_step_check(M, acc, init, valid)
ok(v == 'fail' and 'newer run' in d, 'A the served series read as the 00 UTC run: not one run (fail)', v + ' ' + d)
# B: the same data with the far tail (+156 h on) split evenly, as a newer run's 6-hourly part would be
acc2 = acc.copy(); ix = {int((x - init).total_seconds() // 3600): n for n, x in enumerate(valid)}
for h in range(156, 238, 6):
    if h in ix and h - 3 in ix: s = acc2[..., ix[h - 3]] + acc2[..., ix[h]]; acc2[..., ix[h - 3]] = s / 2; acc2[..., ix[h]] = s / 2
v2, d2 = E.native_step_check(M, acc2, init, valid)
ok(v2 == 'fail', 'B 3-hourly past +144 h and even later: a newer run (fail)', v2 + ' ' + d2)
# C: a normal run: everything from +145 h split evenly
acc3 = acc.copy()
for h in range(150, 238, 6):
    if h in ix and h - 3 in ix: s = acc3[..., ix[h - 3]] + acc3[..., ix[h]]; acc3[..., ix[h - 3]] = s / 2; acc3[..., ix[h]] = s / 2
v3, d3 = E.native_step_check(M, acc3, init, valid)
ok(v3 == 'pass', 'C a normal run (3-hourly to +144 h, 6-hourly after): pass', v3 + ' ' + d3)
# D / E: main() with the provider replaced (meta, anchor_end) and no sleeps
import tempfile, shutil
def run_main(index_lines):
    T = tempfile.mkdtemp(prefix='ens38_'); app = os.path.join(T, 'app'); out = os.path.join(T, 'out'); os.makedirs(os.path.join(app, 'data')); os.makedirs(out)
    json.dump({'lat': [35.9, 34.0], 'lon': [74.3, 71.5]}, open(os.path.join(out, 'grid_pk025.json'), 'w'))
    if index_lines: open(os.path.join(out, 'index.jsonl'), 'w').write('\n'.join(json.dumps(x) for x in index_lines) + '\n')
    E.APP = app; E.OUT = out; E.OLD = os.path.join(T, 'none'); E.GRID = os.path.join(out, 'grid_pk025.json'); E.STATUS = os.path.join(app, 'data', 'ens-archive.json')
    E.MODELS = [m for m in E.MODELS if m['id'] == 'ecmwf_ifs025']
    U = lambda s_: dt.datetime.strptime(s_, '%Y-%m-%dT%H:%M').replace(tzinfo=dt.timezone.utc)
    E.now = lambda: U('2026-10-30T18:50')
    E.time.sleep = lambda x: None
    E.meta = lambda ds: dict(init=U('2026-10-30T06:00'), available=U('2026-10-30T15:50'), modified=U('2026-10-30T15:50'), dataEnd=U('2026-11-05T09:00'), stepS=10800, updateS=21600)
    H = dict(j); H['time'] = list(j['time'])
    E.anchor_end = lambda model, la, lo, full=False: ((U('2026-11-14T00:00'), H) if full else U('2026-11-14T00:00'))
    sys.argv = [sys.argv[0], '--app', app, '--out', out, '--dry']; E.a = sys.argv[1:]
    E.main(); S = json.load(open(E.STATUS)); shutil.rmtree(T, ignore_errors=True); return S['last']['results'][0]['result']
r = run_main([])
ok(r.startswith('dry run: would fetch 2026-10-30T06:00Z') and ' 144 h' in r, 'D the newest run (06 UTC) is identified and would be archived to +144 h (its own end), not "run not identified"', r)
r2 = run_main([dict(model='ecmwf_ifs025', init='2026-10-29T20:00Z', file='x', bytes=1, sha256='x', saved='2026-10-30T08:00Z')])
ok('not an archived run hour' in r2 or 'less than 20 h' in r2, 'E a run saved 10 h before: the 06 UTC run is not taken (one run a day)', r2)
print('\n%d passed, %d failed' % (P, F)); sys.exit(1 if F else 0)
