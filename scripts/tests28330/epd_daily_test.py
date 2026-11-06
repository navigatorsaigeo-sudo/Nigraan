"""v91.17.283.30 . the EPD daily district AQI import (station-lake/scripts/epd_daily_import.py), offline in a temporary tree:
an owner export is imported once (sha256), a partial "live" row is kept flagged and never a full day, a re-run changes nothing, a later
export replaces only the same district/date/source, a wide matrix file is skipped, and complete PKT days of the hourly district history
become source=computed rows (a day with too few hours, and today, do not).
  python scripts/tests28330/epd_daily_test.py   exit 0 all pass, 1 a failure, 77 skipped (script not found)"""
import os, sys, csv, json, shutil, tempfile, subprocess, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
LAKE = os.environ.get('NIGRAAN_STATION_LAKE') or os.path.join(APP, '..', 'station-lake')
S = os.path.join(LAKE, 'scripts', 'epd_daily_import.py')
if not os.path.exists(S): print('SKIP epd_daily_import.py not found at ' + S); sys.exit(77)
n = 0; fails = 0
def ok(c, m, info=None):
    global n, fails
    n += 1; print(('PASS ' if c else 'FAIL ') + m + ('' if c or info is None else '  :: ' + str(info)[:300]))
    if not c: fails += 1
T = tempfile.mkdtemp(prefix='epdd30_'); lake = os.path.join(T, 'station-lake'); inp = os.path.join(T, 'inputs', 'epd_daily')
os.makedirs(os.path.join(lake, 'archive', 'epd')); os.makedirs(inp)
store = os.path.join(lake, 'archive', 'epd', 'epd_district_daily.csv')
def run(): return subprocess.run([sys.executable, S, '--lake', lake, '--inputs', inp], capture_output=True, text=True)
def rows(): return list(csv.DictReader(open(store, encoding='utf-8')))
try:
    open(os.path.join(inp, 'punjab_aqi_daily_a.csv'), 'w').write('district,date,aqi,station_count,source\nKasur,2026-10-27,204,1,daily\nKasur,2026-10-28,278,1,daily\nKasur,2026-10-29,301,1,live 06:00 PKT\nLahore,2026-10-28,350,11,daily\nLahore,2026-10-29,,11,live 06:00 PKT\n')
    open(os.path.join(inp, 'punjab_aqi_daily_matrix.csv'), 'w').write('district,2026-10-27,2026-10-28\nKasur,999,999\n')
    r = run(); ok(r.returncode == 0, 'first import exits 0', r.stdout + r.stderr)
    R = rows(); K = {(x['district'], x['date'], x['source']): x for x in R}
    ok(len(R) == 4, 'four rows held (an empty AQI is skipped, the matrix file is not read)', [(x['district'], x['date'], x['aqi']) for x in R])
    ok(K[('Kasur', '2026-10-28', 'daily')]['aqi'] == '278' and K[('Kasur', '2026-10-28', 'daily')]['partial'] == '0', 'a daily row keeps its AQI index (no PM2.5 conversion)')
    p = K[('Kasur', '2026-10-29', 'live 06:00 PKT')]
    ok(p['partial'] == '1' and ('Kasur', '2026-10-29', 'daily') not in K, 'the live row is flagged partial and is never a daily row')
    ok(K[('Lahore', '2026-10-28', 'daily')]['origin'].startswith('owner export of the EPD dashboard'), 'labelled owner-supplied, EPD dashboard export')
    m1 = open(store, 'rb').read(); r = run()
    ok(open(store, 'rb').read() == m1 and '0 owner rows read' in r.stdout, 're-run: file not read again, store unchanged (idempotent)', r.stdout)
    open(os.path.join(inp, 'punjab_aqi_daily_b.csv'), 'w').write('district,date,aqi,station_count,source\nKasur,2026-10-29,262,1,daily\nKasur,2026-10-28,280,1,daily\n')
    run(); K = {(x['district'], x['date'], x['source']): x for x in rows()}
    ok(K[('Kasur', '2026-10-28', 'daily')]['aqi'] == '280', 'a later export replaces the same district/date/source')
    ok(K[('Kasur', '2026-10-29', 'daily')]['aqi'] == '262' and K[('Kasur', '2026-10-29', 'live 06:00 PKT')]['partial'] == '1', 'the full day is added beside the partial row, which stays flagged')
    # hourly district history -> computed daily means (PKT days)
    L = []
    day = dt.datetime(2026, 10, 25, 0, 0, tzinfo=dt.timezone(dt.timedelta(hours=5)))
    for h in range(24):
        t = (day + dt.timedelta(hours=h)).astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:00:00Z')
        L.append({'kind': 'district_mean', 'district': 'Multan', 't': t, 'aqi': 200 + (h % 2) * 10, 'station_count': 3})
    for h in range(5):
        t = (day + dt.timedelta(days=1, hours=h)).astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:00:00Z')
        L.append({'kind': 'district_mean', 'district': 'Multan', 't': t, 'aqi': 100, 'station_count': 3})
    open(os.path.join(lake, 'archive', 'epd', 'epd_district_2026-10.jsonl'), 'w').write('\n'.join(json.dumps(x) for x in L) + '\n')
    run(); K = {(x['district'], x['date'], x['source']): x for x in rows()}
    c = K.get(('Multan', '2026-10-25', 'computed'))
    ok(c is not None and c['aqi'] == '205' and c['hours'] == '24', 'a complete PKT day of hourly district rows becomes a computed daily mean', c)
    ok(('Multan', '2026-10-26', 'computed') not in K, 'a day with too few hours is not computed')
finally:
    shutil.rmtree(T, ignore_errors=True)
print(f'{n - fails}/{n} pass'); sys.exit(1 if fails else 0)
