"""v91.17.273.1 · copies retention: the archive folder (_admin/archive/copies) may not exist on a first run or when nothing is moved;
the live run failed with FileNotFoundError on MOVED.txt. usage: python scripts/tests273/test_retention273.py (temporary folders only)"""
import os, sys, subprocess, tempfile, time
APP = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); S = os.path.join(APP, 'scripts', 'copies_retention.py')
CFG = os.path.join(APP, 'scripts', 'tests270', 'copy-sources.v283_27.json')   # v283.28: the copy datasets are retired; the rule is tested on the v283.27 list
ok = fail = 0
def check(c, name, d=''):
    global ok, fail
    print(('PASS ' if c else 'FAIL ') + name + (' · ' + d if d else '')); ok += c; fail += (not c)
with tempfile.TemporaryDirectory() as T:
    cp = os.path.join(T, 'copies', 'lamha', 'data', 'mach', 'db'); os.makedirs(cp)
    f = os.path.join(cp, 'obs_20260801.csv'); open(f, 'w').write('x\n'); old = time.time() - 70 * 86400; os.utime(f, (old, old))
    for name, arch, moved in (('T1 nothing to move, archive folder missing', 'a1', None), ('T2 one old file, archive folder missing', 'a2', 1)):
        if moved is None: os.utime(f, None)   # a fresh file: nothing is old enough
        else: os.utime(f, (old, old))
        a = os.path.join(T, arch, 'copies'); r = subprocess.run([sys.executable, S, '--copies', os.path.join(T, 'copies'), '--archive', a, '--keep-days', '45', '--apply', '--today', '2026-10-17', '--config', CFG], capture_output=True, text=True)
        check(r.returncode == 0 and os.path.exists(os.path.join(a, 'MOVED.txt')), name + ': exit 0, MOVED.txt written', (r.stderr.strip().splitlines() or [''])[-1])
        if moved: check(os.path.exists(os.path.join(a, 'lamha', 'data', 'mach', 'db', 'obs_20260801.csv')) and not os.path.exists(f), 'T3 the old file is moved, not deleted')
print('%d PASS, %d FAIL' % (ok, fail)); sys.exit(1 if fail else 0)
