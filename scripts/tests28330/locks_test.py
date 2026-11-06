"""v91.17.283.30 . a lock left by a killed run is taken over at once (29 Oct 2026: a MACH record run killed by a deploy kept the live
feed stopped for an hour). For each fetcher with a lock file: the helper says a lock whose pid no longer runs is dead, a lock held by a
running process is alive, a lock being written (no pid yet) is left to the time rule; and the real lock function takes over a dead
lock immediately but refuses a live one.
  python scripts/tests28330/locks_test.py   exit 0 all pass, 1 a failure, 77 skipped (station-lake scripts not found)
  (NIGRAAN_STATION_LAKE=<station-lake folder> when the scripts are not at ../station-lake)"""
import os, sys, re, subprocess, tempfile, time, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
LAKE = os.environ.get('NIGRAAN_STATION_LAKE') or os.path.join(APP, '..', 'station-lake')
FILES = {'mach_db_sync': os.path.join(LAKE, 'scripts', 'mach_db_sync.py'), 'ews_sync': os.path.join(LAKE, 'scripts', 'ews_sync.py'),
         'produce pcommon': os.path.join(LAKE, 'retrain', 'produce', 'pcommon.py'), 'ingest_ecmwf010': os.path.join(APP, 'scripts', 'ecmwf', 'ingest_ecmwf010.py')}
if not os.path.exists(FILES['mach_db_sync']): print('SKIP station-lake scripts not found at ' + LAKE); sys.exit(77)
n = 0; fails = 0
def ok(c, m, info=None):
    global n, fails
    n += 1; print(('PASS ' if c else 'FAIL ') + m + ('' if c or info is None else '  :: ' + str(info)[:300]))
    if not c: fails += 1

def helpers(path):
    s = open(path, encoding='utf-8').read()
    a = s.index('def _pid_alive('); b = s.index('def _lock_dead(')
    lines = s[b:].split('\n'); k = 1
    while k < len(lines) and (not lines[k].strip() or lines[k][:1] in ' \t'): k += 1
    ns = {'os': os}; exec(s[a:b] + '\n'.join(lines[:k]), ns); return ns

p = subprocess.Popen([sys.executable, '-c', 'pass']); p.wait(); dead_pid = p.pid
live = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
tmp = tempfile.mkdtemp(prefix='locks30_')
try:
    for name, path in FILES.items():
        ok(os.path.exists(path), f'{name}: file present', path)
        if not os.path.exists(path): continue
        src = open(path, encoding='utf-8').read()
        ok('_lock_dead(' in src and src.count('_lock_dead(') >= 2, f'{name}: the lock uses the pid rule')
        ok('os.kill(pid, 0)' not in src.split('if os.name == \'nt\':')[1].split('try:\n        os.kill')[0], f'{name}: no os.kill on Windows')
        h = helpers(path)
        f = os.path.join(tmp, name.replace(' ', '_') + '.lock')
        open(f, 'w').write(f'{dead_pid} record\n'); ok(h['_lock_dead'](f) is True, f'{name}: a lock of a finished process is dead')
        open(f, 'w').write(f'{live.pid} 2026-10-29T01:31:43Z\n'); ok(h['_lock_dead'](f) is False, f'{name}: a lock of a running process is alive')
        open(f, 'w').write(''); ok(h['_lock_dead'](f) is False, f'{name}: a lock being written is left to the time rule')
        ok(h['_lock_dead'](os.path.join(tmp, 'none.lock')) is False, f'{name}: no lock file is not a dead lock')
    # the real MACH lock(): takes over a fresh dead lock at once, refuses a fresh live one
    spec = importlib.util.spec_from_file_location('mds30', FILES['mach_db_sync']); m = importlib.util.module_from_spec(spec)
    sys.argv = ['x']; spec.loader.exec_module(m)
    P = {'rec': os.path.join(tmp, 'rec'), 'mode': 'live'}; os.makedirs(P['rec'], exist_ok=True); lf = os.path.join(P['rec'], 'sync.lock')
    open(lf, 'w').write(f'{dead_pid} record')
    got = m.lock(P); ok(bool(got) and open(lf).read().split()[0] == str(os.getpid()), 'mach_db_sync.lock(): a fresh lock of a killed run is taken over at once', got)
    os.remove(lf); open(lf, 'w').write(f'{live.pid} record')
    ok(m.lock(P) is None, 'mach_db_sync.lock(): a fresh lock of a running run is refused')
    old = time.time() - 71 * 60; os.utime(lf, (old, old))
    ok(bool(m.lock(P)), 'mach_db_sync.lock(): the 70-min time rule still takes over (backstop)')
finally:
    live.kill(); live.wait()
    import shutil; shutil.rmtree(tmp, ignore_errors=True)
print(f'{n - fails}/{n} pass'); sys.exit(1 if fails else 0)
