"""v91.17.270 - OPS - offline tests of the OPS scripts (no network, no key):  python scripts\\tests270\\test_ops270.py
F3  synop_f3_backfill.py: holdings are read first; a held half-month is never fetched; a refusal stops the run with nothing half-written;
    a fetched file is held on the next run; every held raw file is decoded into synop_ogimet_all.parquet; nothing written outside --out.
A4  copies_retention.py: report, plan and --apply on a temporary copies tree: only dated files outside (consumer window + keepDays) move,
    to the archive (nothing deleted), a file modified in the last 30 minutes never moves.
A8  the three provider scripts in nigraan-local/scripts import the call counter before any provider request."""
import ast, io, json, os, shutil, sys, tempfile, time, contextlib, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); SCRIPTS = os.path.abspath(os.path.join(HERE, '..')); APP = os.path.abspath(os.path.join(SCRIPTS, '..'))
sys.path.insert(0, SCRIPTS)
P = F = 0
def ok(c, name, detail=''):
    global P, F
    if c: P += 1; print('PASS', name)
    else: F += 1; print('FAIL', name, '::', str(detail)[:400])

def line(sid, y, m, d, h):
    # a real-shaped FM-12 line (Islamabad-like values): 1sTTT 2sTdTdTd
    return '%s,%04d,%02d,%02d,%02d,00,AAXX %02d%02d4 %s 32997 00000 10%03d 20%03d 38500 48500 333 60007==' % (sid, y, m, d, h, d, h, sid, 150 + h, 50 + h)

def write_month(path, sids, y, m, d0, d1, hours=(0, 3, 6, 9, 12, 15, 18, 21)):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='latin-1') as fh:
        for d in range(d0, d1 + 1):
            for h in hours:
                for s in sids: fh.write(line(s, y, m, d, h) + '\n')

T = tempfile.mkdtemp(prefix='ops270-')
try:
    # ---------------- F3
    import synop_f3_backfill as F3
    root = os.path.join(T, 'NIGRAAN'); lake = os.path.join(T, 'DATA LAKE'); out = os.path.join(root, 'nig', 'archive', 'synop_ogimet')
    sl = os.path.join(root, 'nig', 'station-lake', 'archive', 'synop_ogimet', 'raw')
    S415, S416, S417 = ['41530', '41571'], ['41640', '41675'], ['41756', '41780']
    for b, sids in (('415', S415), ('416', S416), ('417', S417)):
        write_month(os.path.join(sl, '%s_202602a.txt' % b), sids, 2026, 2, 1, 15)
        write_month(os.path.join(sl, '%s_202602b.txt' % b), sids, 2026, 2, 16, 28)
        write_month(os.path.join(lake, 'synop', 'raw', '%s_202606.txt' % b), sids, 2026, 6, 1, 30)
    # a partly held half: 415 March first half has only 5 days in the lake (below the 90 % rule) -> still fetched
    write_month(os.path.join(lake, 'synop', 'raw', '415_202603x.txt'), S415, 2026, 3, 1, 5)
    before = {p: os.path.getmtime(os.path.join(dp, p)) for dp, _, fs in os.walk(os.path.join(root, 'nig', 'station-lake')) for p in fs}
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf): rc = F3.main(['--plan', '--root', root, '--lake', lake, '--from', '2026-02', '--to', '2026-03'])
    o = buf.getvalue()
    ok(rc == 0 and o.count('-> held') == 6 and '415 202603a   5 of 15 days held' in o and o.count('TO FETCH') == 6, 'F3 plan: Feb 2026 held (6 half-months), March not held (a 5-day piece does not count), 6 to fetch', o)
    ok(not os.path.exists(out), 'F3 --plan writes nothing', out)
    # fetch: the first request answers, the second is refused -> stop, nothing half-written
    calls = []
    class R:
        def __init__(self, t): self.t = t
        def read(self): return self.t.encode('latin-1')
    def fake(req, timeout=0):
        u = req.full_url if hasattr(req, 'full_url') else str(req); calls.append(u)
        if len(calls) == 1:
            return R('\n'.join(line(s, 2026, 3, d, h) for d in range(1, 16) for h in (0, 6, 12, 18) for s in S415) + '\n')
        return R('<html>Too many requests</html>')
    real = urllib.request.urlopen; urllib.request.urlopen = fake
    try:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf): rc = F3.main(['--root', root, '--lake', lake, '--from', '2026-03', '--to', '2026-03', '--gap', '0'])
    finally: urllib.request.urlopen = real
    o = buf.getvalue(); raw = os.path.join(out, 'raw')
    ok(rc == 3 and len(calls) == 2 and 'block=415&begin=202603010000&end=202603152359' in calls[0] and 'STOPPED' in o, 'F3 fetch: one request per half-month, stops at the first refusal (exit 3)', (rc, calls, o[-400:]))
    ok(os.path.exists(os.path.join(raw, '415_202603a.txt')) and not [f for f in os.listdir(raw) if f.endswith('.part')] and not os.path.exists(os.path.join(raw, '415_202603b.txt')), 'F3 the answered half is saved, the refused one leaves no file', os.listdir(raw))
    import pandas as pd
    D = pd.read_parquet(os.path.join(out, 'synop_ogimet_all.parquet'))
    ok(len(D) and set(D.sid.astype(str).str[:3]) == {'415', '416', '417'} and str(D.t.min())[:7] == '2026-02' and str(D.t.max())[:7] == '2026-06' and (pd.to_datetime(D.t).dt.month == 3).sum() == 160,
       'F3 decode: every holding (station-lake, lake, own) in synop_ogimet_all.parquet, March: the new half (15 days x 4 hours) and the lake piece (5 days x 8 hours), one row per station-hour (160)', (len(D), D.t.min(), D.t.max()))
    ok(abs(float(D[D.t == D.t.min()].t_c.iloc[0]) - 15.0) < 1e-9, 'F3 decode: values as coded (10150 -> 15.0 C)', D.head(2).to_dict())
    after = {p: os.path.getmtime(os.path.join(dp, p)) for dp, _, fs in os.walk(os.path.join(root, 'nig', 'station-lake')) for p in fs}
    ok(before == after and os.path.exists(os.path.join(out, 'README_INTERNAL.txt')), 'F3 station-lake untouched; the output folder carries its README_INTERNAL.txt')
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf): F3.main(['--plan', '--root', root, '--lake', lake, '--from', '2026-03', '--to', '2026-03'])
    o = buf.getvalue()
    ok('415 202603a  15 of 15 days held' in o and o.count('TO FETCH') == 5, 'F3 resume: the fetched half is held now, 5 left', o)

    # ---------------- A4
    import copies_retention as CR
    cp = os.path.join(T, 'copies'); ar = os.path.join(T, 'archive')
    def mk(rel, kb=10, old=True):
        p = os.path.join(cp, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'wb') as fh: fh.write(b'x' * kb * 1024)
        if old: t = time.time() - 7200; os.utime(p, (t, t))
    for d in range(1, 31): mk('lamha/data/mach/db/obs_202609%02d.csv' % d, 1200)
    for d in range(1, 16): mk('lamha/data/mach/db/obs_202610%02d.csv' % d, 1200)
    for d in range(1, 16): mk('lamha/data/pmd/ews_live/raw/ews_raw_202610%02d.csv.gz' % d, 150)
    mk('lake/data/imerg_hh/late/2026/imerg_late_20260801.nc', 250); mk('lake/data/imerg_hh/late/2026/imerg_late_20261010.nc', 250)
    mk('lamha/data/obs_other/metar_live/metar_202607.csv', 900); mk('lamha/data/obs_other/metar_live/metar_202610.csv', 500)
    mk('lamha/data/mach/db/latest_status.json', 20); mk('lamha/data/mach/db/obs_20260815.csv', 1200, old=False)   # being copied right now
    # v91.17.283.28: the LAMHA copy datasets are retired from data/copy-sources.json (NIGRAAN independent); the retention script's rule is
    # tested on the v283.27 dataset list kept beside this test
    cfg = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'copy-sources.v283_27.json')
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf): CR.main(['--copies', cp, '--config', cfg, '--today', '2026-10-16'])
    o = buf.getvalue()
    ok('lamha_mach' in o and 'growth: about' in o and '(fixed or other)' in o, 'A4 report: per dataset and month, growth per day held', o)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf): CR.main(['--copies', cp, '--archive', ar, '--config', cfg, '--keep-days', '45', '--today', '2026-10-16'])
    o = buf.getvalue()
    # cut-offs (keepDays 45): MACH (window 2 d) 30 Aug -> Sep kept (15 Aug is being copied: protected); IMERG (17 d) 15 Aug -> 1 Aug moves; METAR month (62 d) 1 Jul -> July kept
    ok('1 dated files outside' in o and 'imerg_late_20260801.nc' in o and not os.path.exists(ar), 'A4 plan (keepDays 45): 1 file outside (the IMERG day of 1 Aug); nothing moved without --apply', o)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf): CR.main(['--copies', cp, '--archive', ar, '--config', cfg, '--keep-days', '10', '--today', '2026-10-16', '--apply'])
    o = buf.getvalue()
    moved = sorted(os.path.relpath(os.path.join(d, f), ar).replace('\\', '/') for d, _, fs in os.walk(ar) for f in fs if f != 'MOVED.txt')
    # cut-offs (keepDays 10): MACH 4 Oct -> 30 Sep days + 1-3 Oct move; EWS (14 d) 22 Sep -> none; IMERG 19 Sep -> 1 Aug; METAR 5 Aug -> July
    ok(len(moved) == 35 and 'lamha/data/mach/db/obs_20260901.csv' in moved and 'lamha/data/mach/db/obs_20261003.csv' in moved and 'lamha/data/mach/db/obs_20261004.csv' not in moved and 'lamha/data/mach/db/obs_20260815.csv' not in moved
       and os.path.exists(os.path.join(cp, 'lamha/data/mach/db/obs_20260815.csv')) and os.path.exists(os.path.join(cp, 'lamha/data/mach/db/latest_status.json')) and os.path.exists(os.path.join(ar, 'MOVED.txt')),
       'A4 --apply (keepDays 10): MACH days before 4 Oct, IMERG 1 Aug, METAR July moved to the archive; a file copied in the last 30 min and fixed files stay; MOVED.txt logged', (len(moved), moved[:5], o[-300:]))
    n_total = sum(len(fs) for _, _, fs in os.walk(cp)) + len(moved)
    ok(n_total == 30 + 15 + 15 + 2 + 2 + 2, 'A4 nothing deleted (copies + archive = every file)', n_total)

    # ---------------- A8 call counter in the nigraan-local provider scripts
    for f in ('downscale_dyn_fetch.py', 'temp_corr_fetch.py', 'temp_zone_fetch.py'):
        src = open(os.path.join(SCRIPTS, f), encoding='utf-8').read(); tree = ast.parse(src)
        imp = [n.lineno for n in ast.walk(tree) if isinstance(n, ast.Import) and any(a.name == 'nigraan_calls' for a in n.names)]
        use = [n.lineno for n in ast.walk(tree) if isinstance(n, ast.Attribute) and n.attr == 'urlopen']
        ok(imp and use and min(imp) < min(use), 'A8 %s imports the call counter (line %s) before its first provider request (line %s)' % (f, imp and min(imp), use and min(use)))
finally:
    shutil.rmtree(T, ignore_errors=True)
print('\n%s ops270: %d passed, %d failed' % ('FAIL' if F else 'PASS', P, F)); sys.exit(1 if F else 0)
