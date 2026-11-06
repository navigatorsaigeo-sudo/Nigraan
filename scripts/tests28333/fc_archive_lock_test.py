"""v91.17.283.33 · fc_archive_harvest.py runs one at a time: the pid lock (exclusive create, heartbeat, take-over of a stale or dead
holder), the exit when an older copy without a lock wrote status.json less than 45 minutes ago, and atomic writes (a per-process temporary
file, then os.replace). No network. Run: python fc_archive_lock_test.py <station-lake scripts dir>"""
import os, sys, json, time, tempfile, shutil, subprocess, io, contextlib
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'station-lake', 'scripts'))
import fc_archive_harvest as H
ok_n = fail_n = 0
def ok(c, m, d=''):
    global ok_n, fail_n
    print(('PASS ' if c else 'FAIL ') + m + ('' if c else ' :: ' + str(d)[:300])); ok_n += bool(c); fail_n += (not c)
now = lambda: H.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
tmp = tempfile.mkdtemp()
try:
    out = os.path.join(tmp, 'lake', 'archive', 'fc_archive'); os.makedirs(out)
    lockf = os.path.join(out, 'harvest.lock'); stf = os.path.join(out, 'status.json')
    def wlock(**d): json.dump(d, open(lockf, 'w'))
    def clean():
        for f in (lockf, stf, lockf + '.stale'):
            if os.path.exists(f): os.remove(f)
    # 1. a free archive: the lock is taken, a second taker is refused, release frees it
    clean(); A = H.HarvestLock(out); ok(A.acquire() == (True, None) and os.path.exists(lockf), 'a free archive: the lock is taken')
    B = H.HarvestLock(out); r = B.acquire(); ok(r[0] is False and 'another harvester is active' in r[1], 'a second harvester is refused while the first holds the lock', r)
    A.release(); ok(not os.path.exists(lockf), 'release removes the lock')
    # 2. a live holder on this computer (a sleeping child process) with a fresh heartbeat: refused
    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
    try:
        clean(); wlock(pid=child.pid, host=H._host(), started=now(), heartbeat=now())
        r = H.HarvestLock(out).acquire(); ok(r[0] is False, 'a live holder on this computer keeps the lock', r)
    finally:
        child.kill(); child.wait()
    # 3. the holder process has ended: taken over
    r = H.HarvestLock(out); res = r.acquire(); ok(res == (True, None), 'a dead holder (process ended) is taken over', res); r.release()
    # 4. another computer's holder with a heartbeat older than 15 minutes: taken over; a fresh one: refused
    clean(); wlock(pid=1, host='other-pc', started='2026-10-29T00:00:00Z', heartbeat='2026-10-29T00:00:00Z')
    r = H.HarvestLock(out); res = r.acquire(); ok(res == (True, None), 'a stale heartbeat (over 15 min) is taken over', res); r.release()
    clean(); wlock(pid=1, host='other-pc', started=now(), heartbeat=now())
    ok(H.HarvestLock(out).acquire()[0] is False, 'another computer’s fresh heartbeat keeps the lock')
    # 5. an older copy without a lock wrote status.json 10 minutes ago and has not finished: exit
    clean(); json.dump({'updated': now(), 'calls': 48, 'stoppedOn429': None}, open(stf, 'w')); os.utime(stf, (time.time() - 600, time.time() - 600))
    r = H.HarvestLock(out); res = r.acquire()
    ok(res[0] is False and 'less than 45 minutes' in res[1] and not os.path.exists(lockf), 'an unlocked run that wrote status 10 min ago: exit, no lock left behind', res)
    # 6. the same status 50 minutes old: proceed; a finished run, or one stopped on 429, 10 minutes old: proceed
    os.utime(stf, (time.time() - 3000, time.time() - 3000)); r = H.HarvestLock(out); ok(r.acquire()[0] is True, 'status written 50 min ago: proceeds'); r.release()
    u = now(); json.dump({'updated': u, 'finished': u}, open(stf, 'w')); os.utime(stf, (time.time() - 600, time.time() - 600))
    r = H.HarvestLock(out); ok(r.acquire()[0] is True, 'a finished run 10 min ago: proceeds'); r.release()
    json.dump({'updated': now(), 'stoppedOn429': {'at': now()}}, open(stf, 'w')); os.utime(stf, (time.time() - 600, time.time() - 600))
    r = H.HarvestLock(out); ok(r.acquire()[0] is True, 'a run stopped on 429 10 min ago: proceeds'); r.release()
    # 7. main exits cleanly (code 0) and asks nothing when another harvester holds the lock
    clean(); wlock(pid=os.getpid(), host=H._host(), started=now(), heartbeat=now())
    pts = os.path.join(tmp, 'points.csv'); open(pts, 'w').write('pid,src,sid,name,lat,lon\n0,mach,a,A,33.6,73.0\n')
    os.environ['MACH_API_KEY'] = 'K'; buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = H.main(['--lake', os.path.join(tmp, 'lake'), '--points', pts, '--app', tmp])
    ok(rc == 0 and 'another harvester is active' in buf.getvalue() and not os.path.exists(os.path.join(out, 'harvest_log.txt')), 'main: exit 0, "another harvester is active", nothing fetched', buf.getvalue())
    # 8. atomic writes: a per-process temporary file then os.replace; nothing left behind; no direct write remains in the source
    import pandas as pd
    f = os.path.join(out, 'x.parquet'); H.atomic_parquet(pd.DataFrame({'a': [1, 2]}), f)
    ok(pd.read_parquet(f).a.tolist() == [1, 2] and not [x for x in os.listdir(out) if x.endswith('.tmp') or '.tmp.' in x], 'atomic parquet: written, no temporary left')
    import numpy as np
    g = os.path.join(out, 'y_rain_members.npz'); H.atomic_npz(g, a=np.arange(3)); ok(np.load(g)['a'].tolist() == [0, 1, 2] and not [x for x in os.listdir(out) if 'tmp' in x], 'atomic npz: written, no temporary left')
    src = open(H.__file__, encoding='utf-8').read()
    ok(src.count('.to_parquet(') == 1 and src.count('np.savez_compressed(') == 1 and "'.tmp'" not in src, 'every parquet / npz write goes through the atomic helpers (per-process temporary name)')
    ok('os.kill' not in src.split("if os.name == 'nt':", 1)[1].split('try:\n        os.kill', 1)[0], 'Windows: OpenProcess / GetExitCodeProcess, never os.kill')
finally:
    shutil.rmtree(tmp, ignore_errors=True)
print('SUMMARY %d pass %d fail' % (ok_n, fail_n)); sys.exit(1 if fail_n else 0)
