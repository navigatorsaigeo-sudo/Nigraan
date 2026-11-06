"""v91.17.283.30 . ECMWF 0.1 deg fetcher catches up on missed runs: the window is 7 days (the mirror keeps about 8; it was 30 h, so a
laptop off for a day lost its runs), missed runs are taken newest first, a run whose point archive exists counts as held (a back-filled
run pruned as a grid is not fetched again), the per-start budget is only spent on runs complete on the server, and a lock of a killed
fetcher is taken over at once.
  python scripts/tests28330/ecmwf_backfill_test.py   exit 0 all pass, 1 a failure, 77 skipped (numpy missing)"""
import os, sys, tempfile, shutil, importlib.util, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
F = os.path.join(APP, 'scripts', 'ecmwf', 'ingest_ecmwf010.py')
try:
    import numpy  # noqa: F401
except ImportError:
    print('SKIP numpy missing'); sys.exit(77)
spec = importlib.util.spec_from_file_location('ing30', F); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
n = 0; fails = 0
def ok(c, msg, info=None):
    global n, fails
    n += 1; print(('PASS ' if c else 'FAIL ') + msg + ('' if c or info is None else '  :: ' + str(info)[:300]))
    if not c: fails += 1
src = open(F, encoding='utf-8').read()
ok("NIGRAAN_ECMWF010_BACK_HOURS', '168'" in src, 'default back window is 168 h (7 days)')
m.utcnow = lambda: dt.datetime(2026, 10, 29, 7, 0)
c = m.candidate_runs([0, 12], 168)
ok(c[0] == '2026102212' and c[-1] == '2026102900' and len(c) == 14, 'candidates: 00/12 runs of the last 7 days', c)
tmp = tempfile.mkdtemp(prefix='ecb30_')
try:
    for r in ['2026102700', '2026102612', '2026102600']:
        os.makedirs(os.path.join(tmp, r)); open(os.path.join(tmp, r, 'meta.json'), 'w').write('{}')
    os.makedirs(os.path.join(tmp, '2026102400'))    # a folder without meta.json is not held
    os.makedirs(os.path.join(tmp, 'archive', '2026-10')); open(os.path.join(tmp, 'archive', '2026-10', '2026102312_points.csv.gz'), 'wb').write(b'x')
    held = m.held_runs(tmp)
    ok(held == {'2026102700', '2026102612', '2026102600', '2026102312'}, 'held = grid folders with meta.json + runs in the point archive', sorted(held))
    runs, budget = m.choose_runs(c, held, 2)
    ok(runs[:4] == ['2026102900', '2026102812', '2026102800', '2026102712'], 'missed runs newest first', runs)
    ok('2026102312' not in runs and '2026102700' not in runs, 'held runs are not fetched again')
    ok(runs[-1] == '2026102212' and budget == 2, 'the oldest still in the window is last; budget = --max-runs', (runs[-1], budget))
    ok(m.choose_runs(c, held, 2, ['2026102500']) == (['2026102500'], 1), 'an explicit --run is taken as given')
finally:
    shutil.rmtree(tmp, ignore_errors=True)
ok("budget -= 1" in src and "if budget <= 0:" in src and src.index("if not exists(url_of(run, last, 'index'))") < src.index("budget -= 1"), 'the budget is spent only after the run is found complete on the server')
ok("timedelta(days=8)" in src, 'unfinished work is kept for the back-fill window (8 days)')
print(f'{n - fails}/{n} pass'); sys.exit(1 if fails else 0)
