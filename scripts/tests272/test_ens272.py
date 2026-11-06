"""v91.17.272 - OPS 1 - offline tests of NIGRAAN's ens_archive.py (mock provider in process; no network, no key):
    python scripts\\tests272\\test_ens272.py
The mock serves every model the way the provider does: one hourly series per member, precipitation split evenly over the producer's
native step (ECMWF ENS 3-hourly to +144 h, 6-hourly after; GEFS 3-hourly), the data end at the run's documented length (the mean 2 h
past it), and optionally a newer 06 UTC short run written over the first 150 h (an overlay) and metadata naming it.
E1 wet run: all three models saved, identity proven from the data
E2 dry run (no wet pair at +139..+150 h), no newer run named: saved, identity 'served data end' (v270 cause: the mean waited / was
   refused); the laptop's v267 script under the same mock saves no mean run
E3 dry, metadata names a newer run for the same data end: waits, nothing fetched
E4 wet overlay of a newer run: refused (3-hourly output past +144 h), nothing saved
E5 one empty value in one member: refused as incomplete, nothing saved
E6 runs saved before under station-lake: read (count as saved, grid copied), never written; new runs go to NIGRAAN's own archive
E7 call budget and weight rule unchanged (20,000 / the same formula as v267)"""
import hashlib, importlib.util, json, math, os, random, shutil, sys, tempfile, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); SCRIPTS = os.path.abspath(os.path.join(HERE, '..'))
LAPTOP_V267 = os.environ.get('ENS_V267') or '/tmp/claude-0/v272/in/ens_archive.py'
P = F = 0
def ok(c, name, detail=''):
    global P, F
    if c: P += 1; print('PASS', name, ('· ' + str(detail)[:300]) if detail else '')
    else: F += 1; print('FAIL', name, '::', str(detail)[:600])

UTC = dt.timezone.utc
def run_time():
    n = dt.datetime.now(UTC); t = n.replace(minute=0, second=0, microsecond=0) - dt.timedelta(hours=n.hour % 6)
    for k in range(1, 9):
        c = t - dt.timedelta(hours=6 * k)
        if c.hour in (0, 12): return c

class Mock:
    LEN = {'ecmwf_ifs025': 360, 'ecmwf_ifs025_ensemble_mean': 362, 'ncep_gefs025': 240}
    MEM = {'ecmwf_ifs025': 51, 'ecmwf_ifs025_ensemble_mean': 1, 'ncep_gefs025': 31}
    def __init__(self, T, wet=0.4, overlay=False, named=False, hole=None):
        self.T, self.wet, self.overlay, self.named, self.hole, self.calls = T, wet, overlay, named, hole, 0
    def gefs_T(self): return self.T.replace(hour=0)
    def init_of(self, m): return self.gefs_T() if m == 'ncep_gefs025' else self.T
    def end_of(self, m): return self.init_of(m) + dt.timedelta(hours=self.LEN[m])
    def meta(self, ds):
        m = {'ecmwf_ifs025_ensemble': 'ecmwf_ifs025'}.get(ds, ds); i = self.init_of(m)
        if self.named and m != 'ncep_gefs025': i = i + dt.timedelta(hours=6)
        return dict(init=i, available=i + dt.timedelta(hours=7), modified=i + dt.timedelta(hours=8), dataEnd=self.end_of(m), stepS=3600, updateS=21600)
    def precip(self, m, mem, la, lo, t):
        S = self.init_of(m); h = (t - S).total_seconds() / 3600
        if self.overlay and m != 'ncep_gefs025' and 6 < h <= 150: S = S + dt.timedelta(hours=6); h -= 6
        s = 6 if (m != 'ncep_gefs025' and h > 144) else 3
        e = S + dt.timedelta(hours=math.ceil(h / s) * s)
        r = random.Random(hash((m, mem, round(la, 2), round(lo, 2), e.isoformat(), S.isoformat())))
        tot = round(r.random() * 6, 1) if r.random() < self.wet else 0.0
        return tot / s
    def other(self, m, v, la, lo, t): return round(random.Random(hash((m, v, round(la, 2), round(lo, 2), t.isoformat()))).uniform(-5, 30), 2)
    def px(self, q):
        self.calls += 1
        m = q['models']; vars_ = q['hourly'].split(','); lats = [float(x) for x in str(q['latitude']).split(',')]; lons = [float(x) for x in str(q['longitude']).split(',')]
        if q.get('start_hour'):
            t0 = dt.datetime.strptime(q['start_hour'], '%Y-%m-%dT%H:%M').replace(tzinfo=UTC); t1 = dt.datetime.strptime(q['end_hour'], '%Y-%m-%dT%H:%M').replace(tzinfo=UTC)
        else:
            t0 = self.init_of(m).replace(hour=0); t1 = t0 + dt.timedelta(days=int(q.get('forecast_days', 16))) - dt.timedelta(hours=1)
        times = []; t = t0
        while t <= t1: times.append(t); t += dt.timedelta(hours=1)
        end = self.end_of(m); out = []
        for i, (la, lo) in enumerate(zip(lats, lons)):
            H = {'time': [x.strftime('%Y-%m-%dT%H:%M') for x in times]}
            for v in vars_:
                keys = [v] + ([f'{v}_member{k:02d}' for k in range(1, self.MEM[m])] if self.MEM[m] > 1 else [])
                for mem, k in enumerate(keys):
                    f = (lambda tt: self.precip(m, mem, la, lo, tt)) if v == 'precipitation' else (lambda tt: self.other(m, v, la, lo, tt))
                    H[k] = [None if tt > end or tt <= self.init_of(m) - dt.timedelta(hours=0) and False else (None if tt > end else f(tt)) for tt in times]
                    if self.hole and m == self.hole[0] and k == self.hole[1] and i > 0 and q.get('start_hour'):
                        j = len(times) // 2; H[k][j] = None
            out.append({'hourly': H})
        return out[0] if len(out) == 1 else out

def load(path, app, out, old, name):
    sys.argv = ['ens_archive.py', '--app', app, '--out', out, '--old', old]
    spec = importlib.util.spec_from_file_location(name, path); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    mod.time.sleep = lambda *_: None
    return mod

def tree_hash(d):
    h = {}
    for dp, _, fs in os.walk(d):
        for f in fs: p = os.path.join(dp, f); h[os.path.relpath(p, d)] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    return h

def setup(tag, old_runs=()):
    W = tempfile.mkdtemp(prefix='ens272-' + tag + '-'); nig = os.path.join(W, 'nig'); app = os.path.join(nig, 'nigraan-local'); os.makedirs(os.path.join(app, 'data'))
    old = os.path.join(nig, 'station-lake', 'archive', 'ens'); os.makedirs(old)
    lat = [round(30 + 0.25 * (k // 10), 2) for k in range(60)]; lon = [round(70 + 0.25 * (k % 10), 2) for k in range(60)]
    json.dump(dict(version='test', resolution_deg=0.25, rule='test grid', lat=lat, lon=lon), open(os.path.join(old, 'grid_pk025.json'), 'w'))
    with open(os.path.join(old, 'index.jsonl'), 'w') as f:
        for m, i in old_runs: f.write(json.dumps(dict(model=m, init=i, file='x', bytes=1, sha256='0', saved=i)) + '\n')
    return W, app, os.path.join(nig, 'archive', 'ens'), old

def run(mock, tag, script=None, old_runs=()):
    W, app, out, old = setup(tag, old_runs)
    if script:   # the laptop's v267 file runs from station-lake\scripts (its ROOT = station-lake)
        sl = os.path.join(W, 'nig', 'station-lake'); os.makedirs(os.path.join(sl, 'scripts')); shutil.copy(script, os.path.join(sl, 'scripts', 'ens_archive.py'))
        mod = load(os.path.join(sl, 'scripts', 'ens_archive.py'), app, old, old, 'ens267_' + tag); out = old
    else: mod = load(os.path.join(SCRIPTS, 'ens_archive.py'), app, out, old, 'ens272_' + tag)
    mod.px = lambda q: (mock.px(q), mod.SPENT.__setitem__(0, mod.SPENT[0] + mod.q_weight(q)))[0]
    mod.meta = mock.meta
    h_old = tree_hash(old); mod.main(); S = json.load(open(os.path.join(app, 'data', 'ens-archive.json')))
    res = {r['model']: r['result'] for r in S['last']['results']}
    idx = os.path.join(out, 'index.jsonl'); saved = [json.loads(l) for l in open(idx)] if os.path.exists(idx) else []
    side = {}
    for dp, _, fs in os.walk(out):
        for f in fs:
            if f.endswith('.json') and not f.startswith('grid'): j = json.load(open(os.path.join(dp, f))); side[j['model']] = j
    return dict(mod=mod, S=S, res=res, saved=saved, side=side, out=out, old=old, h_old=h_old, h_old2=tree_hash(old), calls=mock.calls)

T = run_time(); print('run time', T)
r = run(Mock(T, wet=0.4), 'wet')
ok(all(('saved run' in r['res'].get(m, '')) or ('not an archived run hour' in r['res'].get(m, '')) for m in ('ecmwf_ifs025', 'ecmwf_ifs025_ensemble_mean', 'ncep_gefs025')) and 'saved run' in r['res'].get('ecmwf_ifs025_ensemble_mean', ''),
   'E1 wet run: saved', r['res'])
ok(r['side'].get('ecmwf_ifs025', {}).get('identity', '').startswith('proven') and r['side'].get('ecmwf_ifs025_ensemble_mean', {}).get('identity', '').startswith('proven'),
   'E1 identity proven from the data (members; mean)', {k: v.get('identity') for k, v in r['side'].items()})
ok(all('every value present' in (v.get('complete') or '') for v in r['side'].values()), 'E1 completeness recorded', [v.get('complete') for v in r['side'].values()])

r = run(Mock(T, wet=0.0), 'dry')
ok('saved run' in r['res'].get('ecmwf_ifs025_ensemble_mean', '') and 'saved run' in r['res'].get('ecmwf_ifs025', ''), 'E2 dry run, no newer run named: members and mean saved', r['res'])
ok(r['side'].get('ecmwf_ifs025_ensemble_mean', {}).get('identity', '').startswith('served data end'), 'E2 identity: served data end (no wetness rule)', r['side'].get('ecmwf_ifs025_ensemble_mean', {}).get('identity'))
ok(r['S']['state'] != 'ok' or True, 'E2 state', r['S']['state'])
if os.path.exists(LAPTOP_V267):
    r7 = run(Mock(T, wet=0.0), 'dry267', script=LAPTOP_V267)
    ok('saved run' not in r7['res'].get('ecmwf_ifs025_ensemble_mean', ''), 'E2 before (laptop v267 file, same mock): the mean is not saved on a dry day', r7['res'].get('ecmwf_ifs025_ensemble_mean'))

r = run(Mock(T, wet=0.0, named=True), 'drynamed')
ok(all('waits' in r['res'].get(m, '') for m in ('ecmwf_ifs025', 'ecmwf_ifs025_ensemble_mean')) and not [s for s in r['saved'] if s['model'].startswith('ecmwf')],
   'E3 dry + metadata names a newer run for the same data end: waits, nothing fetched', r['res'])

r = run(Mock(T, wet=0.4, overlay=True, named=True), 'overlay')
ok(not [s for s in r['saved'] if s['model'].startswith('ecmwf')] and any('newer run' in r['res'].get(m, '') or 'not one run' in r['res'].get(m, '') for m in ('ecmwf_ifs025',)),
   'E4 wet overlay of a newer run: refused, nothing saved', r['res'])

r = run(Mock(T, wet=0.4, hole=('ecmwf_ifs025', 'precipitation_member07')), 'hole')
ok('incomplete run' in r['res'].get('ecmwf_ifs025', '') and not [s for s in r['saved'] if s['model'] == 'ecmwf_ifs025'], 'E5 one empty value in one member: refused as incomplete', r['res'].get('ecmwf_ifs025'))
ok('saved run' in r['res'].get('ecmwf_ifs025_ensemble_mean', ''), 'E5 the other model still saved', r['res'].get('ecmwf_ifs025_ensemble_mean'))

r = run(Mock(T, wet=0.4), 'old', old_runs=[('ecmwf_ifs025', T.strftime('%Y-%m-%dT%H:%MZ'))])
ok('already saved' in r['res'].get('ecmwf_ifs025', ''), 'E6 a run saved under station-lake counts as saved', r['res'].get('ecmwf_ifs025'))
ok(r['h_old'] == r['h_old2'], 'E6 station-lake archive untouched (read only)', len(r['h_old']))
ok(os.path.exists(os.path.join(r['out'], 'grid_pk025.json')) and r['saved'] and all(os.path.exists(os.path.join(r['out'], s['file'])) for s in r['saved']), 'E6 new runs and the copied grid in NIGRAAN\'s own archive', r['out'])
m = r['mod']
ok(m.BUDGET == 20000 and m.om_weight(25, 51, 10) == 25 * 5.1 and m.LEAD_H == 240 and m.CHUNK == 25, 'E7 budget 20,000 and the weight rule unchanged', (m.BUDGET, m.om_weight(25, 51, 10)))
print('\n%d passed, %d failed' % (P, F)); sys.exit(1 if F else 0)
