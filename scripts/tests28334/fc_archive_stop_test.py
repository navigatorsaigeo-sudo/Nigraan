"""v91.17.283.34 · fc_archive_harvest.py writes how a run ended (status.json state + stateAt, with its last update), so a manual restart after
Ctrl+C or a closed window does not wait 45 minutes; a copy still running still blocks. No network.
Run: python fc_archive_stop_test.py <station-lake scripts dir>"""
import os, sys, json, time, tempfile, shutil, subprocess, io, contextlib, signal
SD = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'station-lake', 'scripts')
sys.path.insert(0, SD)
import fc_archive_harvest as H
ok_n = fail_n = 0
def ok(c, m, d=''):
    global ok_n, fail_n
    print(('PASS ' if c else 'FAIL ') + m + ('' if c else ' :: ' + str(d)[:300])); ok_n += bool(c); fail_n += (not c)
now = lambda: H.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
tmp = tempfile.mkdtemp()
try:
    lake = os.path.join(tmp, 'lake'); out = os.path.join(lake, 'archive', 'fc_archive'); os.makedirs(out)
    lockf = os.path.join(out, 'harvest.lock'); stf = os.path.join(out, 'status.json')
    pts = os.path.join(tmp, 'points.csv'); open(pts, 'w').write('pid,src,sid,name,lat,lon\n0,mach,a,A,33.6,73.0\n')
    os.environ['MACH_API_KEY'] = 'K'
    args = ['--lake', lake, '--points', pts, '--app', tmp, '--pause', '0']
    st = lambda: json.load(open(stf, encoding='utf-8'))
    def quiet(fn, *a):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            try: return fn(*a), buf.getvalue()
            except BaseException as e: return e, buf.getvalue()
    RealNet = H.Net
    # 1. Ctrl+C during a run: exit 130, status "stopped" written with its last update, the lock removed, a new run starts at once
    class CtrlC(RealNet):
        def get(self, *a, **k): raise KeyboardInterrupt()
    H.Net = CtrlC
    rc, txt = quiet(H.main, args)
    s = st()
    ok(rc == 130 and s.get('state') == 'stopped' and s.get('stateAt') == s.get('updated') and 'Ctrl+C' in s['stopped']['why'], 'Ctrl+C: exit 130, status state "stopped" with its last update', (rc, s))
    ok(not os.path.exists(lockf), 'Ctrl+C: the lock is removed')
    L = H.HarvestLock(out); r = L.acquire(); ok(r == (True, None), 'right after Ctrl+C a new run takes the lock (no 45-minute wait)', r); L.release()
    # 2. a normal end: "finished"
    class Quiet(RealNet):
        def get(self, *a, **k): raise AssertionError('no request expected')
    H.Net = Quiet
    rc, txt = quiet(H.main, args + ['--models', 'none_model', '--only', 'prev', '--from', '2026-10-01', '--to', '2026-09-30'])
    s = st(); ok(rc == 0 and s.get('state') == 'finished' and s.get('stateAt') == s.get('updated') and s.get('finished'), 'a normal end: state "finished"', (rc, s.get('state'), txt[-300:]))
    L = H.HarvestLock(out); ok(L.acquire()[0] is True, 'after a finished run a new run starts at once'); L.release()
    # 3. an error: "failed", the error re-raised, a new run starts at once
    class Boom(RealNet):
        def get(self, *a, **k): raise ValueError('test failure')
    H.Net = Boom
    rc, txt = quiet(H.main, args)
    s = st(); ok(isinstance(rc, ValueError) and s.get('state') == 'failed' and 'test failure' in s['failed']['why'], 'an error: state "failed", the error raised', (rc, s.get('state')))
    L = H.HarvestLock(out); ok(L.acquire()[0] is True, 'after a failed run a new run starts at once'); L.release()
    H.Net = RealNet
    # 4. the guard still blocks a live copy: a run that is still writing (state running, 10 min ago), and an older copy without a lock that
    #    keeps writing after an earlier run's end (stateAt older than updated)
    for f in (lockf,):
        if os.path.exists(f): os.remove(f)
    json.dump({'updated': now(), 'state': 'running'}, open(stf, 'w')); os.utime(stf, (time.time() - 600,) * 2)
    L = H.HarvestLock(out); r = L.acquire(); ok(r[0] is False and 'less than 45 minutes' in r[1], 'a live run (state running, status 10 min old): blocked', r)
    json.dump({'updated': now(), 'state': 'stopped', 'stateAt': '2026-10-29T10:00:00Z'}, open(stf, 'w')); os.utime(stf, (time.time() - 600,) * 2)
    L = H.HarvestLock(out); r = L.acquire(); ok(r[0] is False, 'an older copy still writing after an earlier stop (stateAt older than updated): blocked', r)
    json.dump({'updated': now(), 'calls': 4}, open(stf, 'w')); os.utime(stf, (time.time() - 600,) * 2)
    L = H.HarvestLock(out); r = L.acquire(); ok(r[0] is False, 'an older copy that writes no state: blocked (as before)', r)
    # 4b. the status left by a pre-v283.34 copy after its Ctrl+C (no state, 10 min old): blocked with the hint; --after-stop starts at once when
    #     no other harvester process runs, and is still blocked while one runs
    json.dump({'updated': now(), 'calls': 4, 'rule': 'see fc_archive_harvest.py header'}, open(stf, 'w')); os.utime(stf, (time.time() - 600,) * 2)
    r = H.HarvestLock(out).acquire(); ok(r[0] is False and '--after-stop' in r[1], 'a pre-v283.34 status after Ctrl+C: blocked, the message names HARVEST.bat --after-stop', r)
    ok(H.other_harvesters() == [], 'the process list is read: no other harvester process', H.other_harvesters())
    L = H.HarvestLock(out, after_stop=True); r = L.acquire(); ok(r == (True, None), '--after-stop with no other harvester process: starts at once', r); L.release()
    json.dump({'updated': now(), 'calls': 4}, open(stf, 'w')); os.utime(stf, (time.time() - 600,) * 2)
    live = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)', 'fc_archive_harvest.py'])
    try:
        time.sleep(0.3); ok(live.pid in (H.other_harvesters() or []), 'a running harvester process is seen in the process list')
        r = H.HarvestLock(out, after_stop=True).acquire(); ok(r[0] is False, '--after-stop while another harvester process runs: blocked', r)
    finally:
        live.kill(); live.wait()
    if os.path.exists(lockf): os.remove(lockf)
    # 4c. a holder killed without its end written (the server's time cap): its lock (dead pid) and its recent "running" status: taken over at once
    json.dump({'updated': now(), 'state': 'running'}, open(stf, 'w')); os.utime(stf, (time.time() - 300,) * 2)
    dead = subprocess.Popen([sys.executable, '-c', 'pass']); dead.wait()
    json.dump({'pid': dead.pid, 'host': H._host(), 'started': now(), 'heartbeat': now()}, open(lockf, 'w'))
    L = H.HarvestLock(out); r = L.acquire(); ok(r == (True, None), 'a killed holder (dead pid) and its recent status: taken over at once', r); L.release()
    # 5. a live holder of the lock: blocked
    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
    try:
        os.remove(stf); json.dump({'pid': child.pid, 'host': H._host(), 'started': now(), 'heartbeat': now()}, open(lockf, 'w'))
        ok(H.HarvestLock(out).acquire()[0] is False, 'a live lock holder: blocked')
    finally:
        child.kill(); child.wait()
    if os.path.exists(lockf): os.remove(lockf)
    # 6. a real process ended by SIGTERM (the window closed / terminate): status "stopped", lock gone, new run starts at once
    drv = os.path.join(tmp, 'drv.py')
    open(drv, 'w').write('import sys, time\nsys.path.insert(0, %r)\nimport fc_archive_harvest as H\nclass Slow(H.Net):\n    def get(self, *a, **k):\n        time.sleep(60)\nH.Net = Slow\nsys.exit(H.main(%r))\n' % (os.path.abspath(SD), args))
    p = subprocess.Popen([sys.executable, drv], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=dict(os.environ))
    t0 = time.time()
    while time.time() - t0 < 20 and not os.path.exists(lockf): time.sleep(0.2)
    time.sleep(1.0)
    if hasattr(signal, 'SIGTERM') and os.name != 'nt':
        p.send_signal(signal.SIGTERM); rc = p.wait(30); s = st()
        ok(rc == 130 and s.get('state') == 'stopped' and not os.path.exists(lockf), 'SIGTERM (window closed): exit 130, status "stopped", no lock left', (rc, s.get('state')))
        L = H.HarvestLock(out); ok(L.acquire()[0] is True, 'after SIGTERM a new run starts at once'); L.release()
    else:
        p.kill(); p.wait(); print('SKIP SIGTERM check on Windows (Ctrl+C is checked above)')
finally:
    shutil.rmtree(tmp, ignore_errors=True)
print('\n%d passed, %d failed' % (ok_n, fail_n)); sys.exit(1 if fail_n else 0)
