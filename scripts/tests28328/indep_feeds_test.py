"""v91.17.283.28 . INDEPENDENCE FROM LAMHA . offline tests of NIGRAAN's own fetchers (station-lake/scripts), each against a mock HTTP
server on 127.0.0.1 (no real network) in a temporary tree:
  M  mach_db_sync.py   --live: one window request for all stations from the last synced reading minus 2 h, LAMHA-format day files in
                       nig/own, the readings the record lacks appended to archive/fleet/db/mach_db_YYYY-MM.csv (none twice), register
                       latest_status.json hourly; record mode: station list, a new station's whole history, the 8-day late re-ask;
                       a second writer is refused (lock); a refused key exits 1, an unreachable host 75; nothing named LAMHA is read
  T  metar_sync.py     AWC reports stored (LAMHA's columns), IEM when AWC fails, 30 days from IEM on the first run, the airport list
                       built from IEM's network list when missing, no report twice, offline 75
  R  radar_pull.py     manifest + day listings + PNG frames into nig/own/data/radar (LAMHA's layout), resumed from the last day held,
                       converted to GeoTIFF / NetCDF with LAMHA's exact palette (a colour outside it is refused); viewer down = 75
  I  isd_lite_sync.py  active Pakistan stations, yearly files kept raw, a past year fetched once, the current year with If-Modified-Since
                       (304 = nothing downloaded), 404 remembered, the hourly table in isd_pull.py's units
  A  aws_import.py / drop_import.py  a PMD AWS portal export (sheet per station, Datetime / TA1 / TA2) recognised by the drop folder and
                       converted with LAMHA's aws_extend.py rules (two sensors within 1.0 C, n >= 3, Hampel, exclusions, archive wins)
  E  ingest_ecmwf010.py  total cloud cover is fetched again (VARS), stored as percent
  python scripts/tests28328/indep_feeds_test.py   exit 0 all pass, 1 a failure, 77 skipped (no pandas / scripts not found)
  (NIGRAAN_STATION_LAKE=<station-lake folder> when the scripts are not at ../station-lake)"""
import os, sys, json, io, csv, gzip, shutil, tempfile, threading, subprocess, datetime as dt, email.utils, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
LAKE = os.environ.get('NIGRAAN_STATION_LAKE') or os.path.join(APP, '..', 'station-lake')
SC = os.path.join(LAKE, 'scripts')
try:
    import numpy as np, pandas as pd
except ImportError:
    print('SKIP numpy / pandas not installed'); sys.exit(77)
if not os.path.exists(os.path.join(SC, 'mach_db_sync.py')): print('SKIP station-lake scripts not found at ' + SC); sys.exit(77)
os.environ['NO_PROXY'] = os.environ['no_proxy'] = '127.0.0.1,localhost'
for k in ('NIGRAAN_OWN_DIR', 'NIGRAAN_LAMHA_DIR', 'NIGRAAN_LAMHA_HISTORY_DIR'): os.environ.pop(k, None)
n = 0; fails = 0
def ok(c, m, info=None):
    global n, fails
    n += 1; print(('PASS ' if c else 'FAIL ') + m + ('' if c or info is None else '  :: ' + str(info)[:400]))
    if not c: fails += 1

# ---- the mock server: ROUTES[path] = fn(handler, query) -> (status, bytes, headers) ----
ROUTES = {}; LOG = []
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        from urllib.parse import urlsplit, parse_qs
        u = urlsplit(self.path); q = parse_qs(u.query); LOG.append((u.path, q, dict(self.headers)))
        fn = ROUTES.get(u.path)
        st, body, hd = fn(self, q) if fn else (404, b'', {})
        self.send_response(st)
        for k, v in (hd or {}).items(): self.send_header(k, v)
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
SRV = ThreadingHTTPServer(('127.0.0.1', 0), H); PORT = SRV.server_address[1]; BASE = f'http://127.0.0.1:{PORT}'
threading.Thread(target=SRV.serve_forever, daemon=True).start()
def j(o, st=200): return (st, json.dumps(o).encode(), {'Content-Type': 'application/json'})
CUR = {}
def py(script, *a, env=None, cwd=None):
    """runs the script from the temporary tree's own station-lake/scripts (its folders resolve from there, as on the laptop)"""
    e = dict(os.environ, **(env or {})); sl = CUR['sl']
    r = subprocess.run([sys.executable, '-I', os.path.join(sl, 'scripts', script), *a], capture_output=True, text=True, env=e, cwd=cwd or sl, timeout=600)
    return r.returncode, r.stdout + r.stderr
ROOTS = []
def tree():
    root = tempfile.mkdtemp(prefix='indep_'); ROOTS.append(root)
    app = os.path.join(root, 'NIGRAAN', 'nig', 'nigraan-local'); os.makedirs(os.path.join(app, 'data'))
    sl = os.path.join(root, 'NIGRAAN', 'nig', 'station-lake'); os.makedirs(os.path.join(sl, 'archive'))
    os.makedirs(os.path.join(root, 'LAMHA', 'data', 'mach', 'db'))   # a LAMHA folder beside it, which must never be read
    shutil.copytree(SC, os.path.join(sl, 'scripts'), ignore=shutil.ignore_patterns('__pycache__')); CUR['sl'] = sl
    return root, app, sl
NOW = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None, microsecond=0)
iso = lambda t: t.strftime('%Y-%m-%dT%H:%M:%SZ')

try:
    # =============================== M · MACH database ===============================
    root, app, sl = tree(); own = os.path.join(root, 'NIGRAAN', 'nig', 'own'); rec = os.path.join(sl, 'archive', 'fleet', 'db')
    open(os.path.join(app, 'obs.key'), 'w').write(f'base={BASE}/obs\nkey=TEST-KEY-123\n')
    STN = ['mach1', 'khaplu', 'Talg']
    def obs_at(k, t): return {'stationKey': k, 'time': iso(t), 'source': 'wu_api', 'metrics': {'temperatureC': 20.0 + STN.index(k), 'dewPointC': 10.0, 'humidityPct': 50, 'windDirectionDeg': 90.0, 'windSpeedKmh': 3.0, 'windGustKmh': 5.0, 'pressureHpa': 1000.0, 'uvIndex': 1, 'solarWm2': 300.0, 'precipRateMmHr': 0, 'precipTotalMm': 0}}
    DB = {k: [NOW - dt.timedelta(minutes=10 * i) for i in range(0, 6 * 24 * 10)] for k in STN}   # 10 days, every 10 min
    LATE = set()                                  # readings the database holds but did not yet return
    def r_obs(h, q):
        if h.headers.get('X-API-Key') != 'TEST-KEY-123': return (401, b'', {})
        a = dt.datetime.strptime(q['from'][0], '%Y-%m-%dT%H:%M:%SZ'); b = dt.datetime.strptime(q['to'][0], '%Y-%m-%dT%H:%M:%SZ')
        return j({'observations': [obs_at(k, t) for k in STN for t in DB[k] if a <= t <= b and (k, t) not in LATE]})
    def r_latest(h, q): return j({'updatedAt': iso(NOW), 'stations': [{'key': k, 'title': k, 'lat': 33.6, 'lng': 73.0, 'provider': 'wu', 'source': 'wu_api', 'time': iso(NOW), 'ageMinutes': 2, 'online': True} for k in STN]})
    def r_stations(h, q): return j({'stations': [{'station_key': k, 'title': k, 'label': k, 'lat': 33.6, 'lng': 73.0, 'provider': 'wu', 'provider_station_id': 'X' + k, 'source': 'wu_api', 'active': True, 'updated_at': iso(NOW)} for k in STN + ['newstn']]})
    def r_station_obs(h, q):
        k = h.path.split('/v1/stations/')[1].split('/')[0]
        rows = ['time,station_key,source,temperature_c'] + ([f'{iso(NOW - dt.timedelta(days=30, minutes=10 * i))},{k},wu_api,15.0' for i in range(5)] if k == 'newstn' else [])
        return (200, ('\n'.join(rows) + '\n').encode(), {'Content-Type': 'text/csv'})
    ROUTES.update({'/obs/v1/observations': r_obs, '/obs/v1/latest': r_latest, '/obs/v1/stations': r_stations})
    for k in STN + ['newstn']: ROUTES[f'/obs/v1/stations/{k}/observations'] = r_station_obs
    LOG.clear(); c, out = py('mach_db_sync.py', '--app', app, '--live')
    dfiles = sorted(f for f in os.listdir(os.path.join(own, 'data', 'mach', 'db')) if f.startswith('obs_'))
    w = [x for x in LOG if x[0] == '/obs/v1/observations']
    ok(c == 0 and len(w) == 2 and all(x[2].get('X-Api-Key', x[2].get('X-API-Key')) == 'TEST-KEY-123' for x in w), 'M1 first live run: window requests for all stations at once (2 days + 2 h = 2 windows of at most 2 days), NIGRAAN\'s own key (obs.key)', (c, out[-300:], len(w)))
    a0 = dt.datetime.strptime(w[0][1]['from'][0], '%Y-%m-%dT%H:%M:%SZ')
    ok(abs((NOW - dt.timedelta(days=2, hours=2) - a0).total_seconds()) < 120, 'M1 no record yet: the window starts 2 days (+ the 2-h overlap) back', a0)
    d = pd.read_csv(os.path.join(own, 'data', 'mach', 'db', dfiles[-1]))
    ok(list(d.columns[:3]) == ['stationKey', 'time', 'source'] and not d.duplicated(['stationKey', 'time']).any(), 'M1 day files in LAMHA\'s columns (the readers\' format), one row per station and time', list(d.columns))
    ok(os.path.exists(os.path.join(own, 'data', 'mach', 'db', 'latest_status.json')) and json.load(open(os.path.join(own, 'data', 'mach', 'db', 'latest_status.json')))['stations'][0]['key'] == 'mach1', 'M1 the register (latest_status.json) is NIGRAAN\'s own /v1/latest')
    recs = sorted(f for f in os.listdir(rec) if f.startswith('mach_db_'))
    R = pd.concat(pd.read_csv(os.path.join(rec, f)) for f in recs)
    ok(len(R) > 0 and not R.duplicated(['station_key', 'time']).any() and 'provider' in R.columns and set(R.station_key) == set(STN), 'M1 readings appended to the station record (mach_db_YYYY-MM.csv), none twice', len(R))
    # second run: 10 min later, late readings appear, nothing duplicated
    NOW2 = NOW + dt.timedelta(minutes=10)
    for k in STN: DB[k].append(NOW2)
    LATE.update({('khaplu', NOW - dt.timedelta(minutes=30))})   # hidden now ...
    LOG.clear(); c, out = py('mach_db_sync.py', '--app', app, '--live')
    w = [x for x in LOG if x[0] == '/obs/v1/observations']; a1 = dt.datetime.strptime(w[0][1]['from'][0], '%Y-%m-%dT%H:%M:%SZ')
    ok(c == 0 and len(w) == 1 and abs((NOW - dt.timedelta(hours=2) - a1).total_seconds()) < 5 and not [x for x in LOG if x[0] == '/obs/v1/latest'], 'M2 next run: from the last synced reading minus 2 h, one request; the register not re-read within the hour', (a1, [x[0] for x in LOG]))
    R2 = pd.concat(pd.read_csv(os.path.join(rec, f)) for f in sorted(os.listdir(rec)) if f.startswith('mach_db_'))
    ok(not R2.duplicated(['station_key', 'time']).any() and len(R2) == len(R) + 0, 'M2 the overlap re-reads are not appended twice', (len(R), len(R2)))
    # record mode: new station's history and the 8-day re-ask
    LATE.clear(); DB['khaplu'].append(NOW - dt.timedelta(days=5, minutes=3))   # a reading that reached the database 5 days late
    LOG.clear(); c, out = py('mach_db_sync.py', '--app', app)
    R3 = pd.concat(pd.read_csv(os.path.join(rec, f)) for f in sorted(os.listdir(rec)) if f.startswith('mach_db_'))
    ok(c == 0 and (R3.station_key == 'newstn').sum() == 5, 'M3 record run: a station the record never saw gets its whole history (per station)', out[-300:])
    ok(((R3.station_key == 'khaplu') & (R3.time == iso(NOW - dt.timedelta(days=5, minutes=3)))).sum() == 1 and not R3.duplicated(['station_key', 'time']).any(), 'M3 the 8-day re-ask adds a late reading once, nothing twice')
    sj = json.load(open(os.path.join(rec, 'stations.json')))
    ok(len(sj['stations']) == 4 and sj['stations'][0]['provider_station_id'] == 'Xmach1', 'M3 the station register stations.json from /v1/stations (provider ids)')
    st = json.load(open(os.path.join(app, 'data', 'mach-db-sync.json')))
    ok(st.get('state') == 'ok' and st.get('live', {}).get('state') == 'ok' and 'NIGRAAN own key' in st.get('source', ''), 'M3 status for the operations page names NIGRAAN\'s own key', st)
    # lock, refused key, offline
    open(os.path.join(rec, 'sync.lock'), 'w').write('1 record')
    c, out = py('mach_db_sync.py', '--app', app, '--live'); ok(c == 0 and 'holds the record' in out, 'M4 a second writer is refused while the record run holds the lock', out[-200:])
    os.remove(os.path.join(rec, 'sync.lock'))
    open(os.path.join(app, 'obs.key'), 'w').write(f'base={BASE}/obs\nkey=WRONG\n')
    c, out = py('mach_db_sync.py', '--app', app, '--live'); ok(c == 1 and 'refused' in out and 'WRONG' not in open(os.path.join(own, 'data', 'mach', 'db', 'sync_log.txt')).read(), 'M4 a refused key: exit 1, the key is never logged', out[-200:])
    open(os.path.join(app, 'obs.key'), 'w').write('base=http://127.0.0.1:1/obs\nkey=TEST-KEY-123\n')
    c, out = py('mach_db_sync.py', '--app', app, '--live'); ok(c == 75, 'M4 the database host unreachable: exit 75 (offline, retried next cycle)', (c, out[-200:]))
    ok(not os.listdir(os.path.join(root, 'LAMHA', 'data', 'mach', 'db')), 'M5 nothing under LAMHA touched')
    src = open(os.path.join(SC, 'mach_db_sync.py'), encoding='utf-8').read()
    code = '\n'.join(l for l in src.split('\n') if not l.strip().startswith('#'))
    code = code.split('"""', 2)[2] if code.count('"""') >= 2 else code
    ok('LAMHA' not in code.replace("LAMHA's", '').replace('LAMHA\\', '') and 'AGN_LAKE' not in code and 'agn_lake_client' not in code, 'M5 the script has no LAMHA or data-lake path (only the API with obs.key)')

    # =============================== T · METAR ===============================
    root, app, sl = tree(); own = os.path.join(root, 'NIGRAAN', 'nig', 'own'); D = os.path.join(own, 'data', 'obs_other', 'metar_live')
    STATE = {'awc': 'ok', 'iem': 'ok'}
    def r_net(h, q): return j({'features': [{'properties': {'sid': 'OPIS', 'sname': 'Islamabad', 'elevation': 508, 'archive_end': None}, 'geometry': {'coordinates': [73.1, 33.6]}},
                                            {'properties': {'sid': 'OPLA', 'sname': 'Lahore', 'elevation': 217, 'archive_end': None}, 'geometry': {'coordinates': [74.4, 31.5]}},
                                            {'properties': {'sid': 'OPXX', 'sname': 'Closed', 'elevation': 1, 'archive_end': '2010-01-01'}, 'geometry': {'coordinates': [70, 30]}}]})
    def r_awc(h, q):
        if STATE['awc'] != 'ok': return (503, b'', {})
        t0 = int((NOW - dt.timedelta(minutes=NOW.minute % 30)).replace(second=0).timestamp() - 0) if False else None
        base = NOW.replace(second=0) - dt.timedelta(minutes=NOW.minute % 30)
        return j([{'icaoId': s, 'obsTime': int(base.replace(tzinfo=dt.timezone.utc).timestamp()) - 1800 * i, 'temp': 20 + i, 'dewp': 10, 'metarType': 'METAR', 'receiptTime': iso(base), 'rawOb': f'{s} RAW {i}'} for s in ('OPIS', 'OPLA') for i in range(3)])
    def r_iem(h, q):
        if STATE['iem'] != 'ok': return (503, b'', {})
        y1 = dt.datetime(int(q['year1'][0]), int(q['month1'][0]), int(q['day1'][0]), int(q['hour1'][0]))
        rows = ['station,valid,tmpc,dwpc,metar']; t = y1
        while t <= NOW:
            for s in q.get('station', []): rows.append(f'{s},{t:%Y-%m-%d %H:%M},18.0,9.0,{s} IEM')
            t += dt.timedelta(hours=1)
        return (200, ('\n'.join(rows) + '\n').encode(), {})
    ROUTES.update({'/net.geojson': r_net, '/awc': r_awc, '/iem': r_iem})
    ENV = {'NIGRAAN_AWC_URL': BASE + '/awc', 'NIGRAAN_IEM_ASOS_URL': BASE + '/iem', 'NIGRAAN_IEM_NET_URL': BASE + '/net.geojson'}
    LOG.clear(); c, out = py('metar_sync.py', '--app', app, env=ENV)
    ap = pd.read_csv(os.path.join(D, 'airports.csv'))
    ok(c == 0 and list(ap.icao) == ['OPIS', 'OPLA'] and list(ap.columns) == ['icao', 'title', 'lat', 'lon', 'elev_m'], 'T1 airport list built from IEM\'s network list, active stations only', (c, out[-200:], ap.to_dict('list')))
    iem = [x for x in LOG if x[0] == '/iem']
    ok(iem and dt.datetime(int(iem[0][1]['year1'][0]), int(iem[0][1]['month1'][0]), int(iem[0][1]['day1'][0])) <= (NOW - dt.timedelta(days=29)), 'T1 first run: 30 days of history from IEM', iem[0][1] if iem else None)
    m = pd.concat(pd.read_csv(os.path.join(D, f)) for f in os.listdir(D) if f.startswith('metar_2'))
    ok(list(m.columns) == ['station', 'time_utc', 't_c', 'td_c', 'type', 'received_utc', 'raw'] and len(m) > 1000, 'T1 reports in LAMHA\'s columns', (list(m.columns), len(m)))
    n0 = len(m); LOG.clear(); c, out = py('metar_sync.py', '--app', app, env=ENV)
    m2 = pd.concat(pd.read_csv(os.path.join(D, f)) for f in os.listdir(D) if f.startswith('metar_2'))
    ok(c == 0 and [x[0] for x in LOG] == ['/awc'] and not m2.duplicated(['station', 'time_utc']).any(), 'T2 next run: AWC only (1 request), a report already held from IEM is not added twice', ([x[0] for x in LOG], len(m2) - n0))
    STATE['awc'] = 'down'; LOG.clear(); c, out = py('metar_sync.py', '--app', app, env=ENV)
    ok(c == 0 and [x[0] for x in LOG] == ['/awc', '/awc', '/awc', '/iem'] or (c == 0 and [x[0] for x in LOG][-1] == '/iem'), 'T3 AWC failing: IEM instead', [x[0] for x in LOG])
    ok(json.load(open(os.path.join(D, 'sync_status.json')))['source'].startswith('IEM'), 'T3 the status names the source used')
    c, out = py('metar_sync.py', '--app', app, env={**ENV, 'NIGRAAN_AWC_URL': 'http://127.0.0.1:1/x', 'NIGRAAN_IEM_ASOS_URL': 'http://127.0.0.1:1/y'})
    ok(c == 75, 'T4 neither source reachable: exit 75', (c, out[-200:]))

    # =============================== R · radar ===============================
    from PIL import Image
    root, app, sl = tree(); own = os.path.join(root, 'NIGRAAN', 'nig', 'own'); RD = os.path.join(own, 'data', 'radar')
    sys.path.insert(0, SC); import radar_convert as RC
    def frame(colour):
        im = Image.new('RGBA', (360, 360), (0, 0, 0, 0)); px = im.load()
        for y in range(170, 190):
            for x in range(170, 190): px[x, y] = colour + (255,)
        b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()
    GOOD = frame(RC.PAL_RATE[3][0]); BAD = frame((1, 2, 3))
    today = NOW.date(); afrom = today - dt.timedelta(days=2)
    def r_man(h, q): return j({'archive_from': str(afrom), 'fetched_at': iso(NOW), 'sites': [{'id': 'islamabad', 'products': [{'code': 'sri'}]}]})
    def r_arch(h, q):
        d = q['date'][0]; tt = d.replace('-', '')
        return j({'ok': True, 'frames': [{'url': f'{BASE}/f/islamabad_N334057_E0730351_H0591_{tt}{hh:02d}01_sri_450km.png'} for hh in (0, 1)]})
    def r_png(h, q): return (200, BAD if '0101_' in h.path and str(afrom).replace('-', '') in h.path else GOOD, {'Content-Type': 'image/png'})
    ROUTES.update({'/radar/manifest': r_man, '/radar/archive': r_arch})
    class PNGRoute(dict):
        pass
    for dd in range(3):
        tt = (afrom + dt.timedelta(days=dd)).strftime('%Y%m%d')
        for hh in (0, 1): ROUTES[f'/f/islamabad_N334057_E0730351_H0591_{tt}{hh:02d}01_sri_450km.png'] = r_png
    LOG.clear(); c, out = py('radar_pull.py', '--app', app, env={'NIGRAAN_RADAR_BASE': BASE, 'NIGRAAN_RADAR_SLEEP': '0'})
    pngs = sorted(os.path.relpath(os.path.join(dp, f), RD) for dp, dn, fn in os.walk(os.path.join(RD, 'png')) for f in fn)
    ok(c == 0 and len(pngs) == 6 and pngs[0].startswith(os.path.join('png', 'islamabad', 'sri', str(afrom))), 'R1 every frame from archive_from to today in png/<site>/<product>/<day> (LAMHA\'s layout)', (c, out[-300:], pngs[:2]))
    ncs = sorted(os.listdir(os.path.join(RD, 'netcdf', 'islamabad', 'sri'))) if os.path.isdir(os.path.join(RD, 'netcdf', 'islamabad', 'sri')) else []
    ok(len(ncs) == 3 and ncs[0] == f'islamabad_sri_{afrom}.nc', 'R2 converted: one NetCDF per site / product / day', (ncs, out[-400:]))
    import xarray as xr
    ds = xr.open_dataset(os.path.join(RD, 'netcdf', 'islamabad', 'sri', ncs[-1])); bands = set(np.unique(ds.band.values).tolist()); ds.close()
    ok(4 in bands and len(ds.time) == 2, 'R2 the exact palette colour becomes its band (band 4 = 6 mm/h lower limit)', bands)
    ok('unknown colours' in open(os.path.join(RD, 'convert_log.txt')).read(), 'R2 a colour outside the palette is refused and logged (no nearest-colour guess)')
    ok(os.path.exists(os.path.join(RD, 'pull_log.txt')) and 'new frames listed' in open(os.path.join(RD, 'pull_log.txt')).read(), 'R3 pull_log.txt in LAMHA\'s line format (feed health parses it)')
    LOG.clear(); c, out = py('radar_pull.py', '--app', app, env={'NIGRAAN_RADAR_BASE': BASE, 'NIGRAAN_RADAR_SLEEP': '0'})
    days = sorted({x[1]['date'][0] for x in LOG if x[0] == '/radar/archive'})
    ok(c == 0 and days == [str(today - dt.timedelta(days=1)), str(today)] and not [x for x in LOG if x[0].startswith('/f/')], 'R4 next run: resumed from the last day held minus 1, no frame downloaded twice', days)
    c, out = py('radar_pull.py', '--app', app, env={'NIGRAAN_RADAR_BASE': 'http://127.0.0.1:1', 'NIGRAAN_RADAR_SLEEP': '0'})
    ok(c == 75, 'R5 the viewer unreachable: exit 75', c)

    # =============================== I · ISD-Lite ===============================
    root, app, sl = tree(); IO = os.path.join(sl, 'archive', 'isd')
    y = NOW.year
    hist = 'USAF,WBAN,STATION NAME,CTRY,ST,CALL,LAT,LON,ELEV(M),BEGIN,END\n415710,99999,ISLAMABAD,PK,,OPIS,33.6,73.1,508,19730101,' + NOW.strftime('%Y%m%d') + '\n416400,99999,LAHORE,PK,,OPLA,31.5,74.4,217,19730101,' + NOW.strftime('%Y%m%d') + '\n999999,99999,OLD,PK,,,30,70,1,19500101,19900101\n'
    LM = email.utils.formatdate(time.time() - 86400, usegmt=True)
    def lite(usaf, yy):
        lines = [f'{yy} 01 0{d} 00   150    50 10100   270    30     0     0 -9999' for d in range(1, 4)]
        return gzip.compress(('\n'.join(lines) + '\n').encode())
    def r_hist(h, q): return (200, hist.encode(), {})
    def r_lite(h, q):
        p = h.path.rsplit('/', 1)[1]; usaf, wban, yy = p[:-3].split('-')
        if usaf == '416400' and yy == str(y - 2): return (404, b'', {})
        if h.headers.get('If-Modified-Since'): return (304, b'', {})
        return (200, lite(usaf, yy), {'Last-Modified': LM})
    ROUTES['/isd-history.csv'] = r_hist
    for usaf in ('415710', '416400'):
        for yy in (y - 2, y - 1, y): ROUTES[f'/lite/{yy}/{usaf}-99999-{yy}.gz'] = r_lite
    IENV = {'NIGRAAN_ISD_HISTORY_URL': BASE + '/isd-history.csv', 'NIGRAAN_ISD_LITE_URL': BASE + '/lite/{y}/{usaf}-{wban}-{y}.gz', 'NIGRAAN_ISD_SLEEP': '0'}
    LOG.clear(); c, out = py('isd_lite_sync.py', env=IENV)
    T = pd.read_parquet(os.path.join(IO, 'isd_lite_hourly.parquet')) if os.path.exists(os.path.join(IO, 'isd_lite_hourly.parquet')) else None
    ok(c == 0 and T is not None and set(T.station.astype(str)) == {'415710', '416400'} and abs(T.t_c.iloc[0] - 15.0) < 1e-6 and abs(T.wspd_ms.iloc[0] - 3.0) < 1e-6, 'I1 active Pakistan stations, the hourly table in isd_pull.py\'s units (0.1 C, 0.1 m/s)', (c, out[-300:]))
    ok(os.path.exists(os.path.join(IO, 'raw', str(y - 1), '415710-99999-' + str(y - 1) + '.gz')) and '999999' not in str(os.listdir(os.path.join(IO, 'raw', str(y)))), 'I1 raw yearly files kept; the closed station left out')
    LOG.clear(); c, out = py('isd_lite_sync.py', env=IENV)
    got = [x for x in LOG if x[0].startswith('/lite/')]
    past = [x for x in got if f'/{y - 1}/' in x[0] or f'/{y - 2}/' in x[0]]
    ims = [x for x in got if f'/{y}/' in x[0]]
    ok(c == 0 and (not past or NOW.month == 1) and ims and all(x[2].get('If-Modified-Since') for x in ims), 'I2 next run: past years not asked again (404 remembered), the current year with If-Modified-Since', [x[0] for x in got])
    ok('table unchanged' in out, 'I2 304 everywhere: nothing downloaded, the table not rebuilt', out[-200:])

    # =============================== A · PMD official AWS export ===============================
    root, app, sl = tree(); hist = os.path.join(root, 'NIGRAAN', 'archive_hist', 'lamha'); os.makedirs(os.path.join(hist, 'pmd'))
    pd.DataFrame({'st': ['KARACHI', 'LAHORE', 'BADIN'], 'wmo': [41780.0, 41640.0, 41785.0], 'lat': [24.9, 31.5, 24.7], 'lon': [67.1, 74.4, 68.8], 'elev_m': [22.0, 217.0, 10.0]}).to_csv(os.path.join(hist, 'pmd', 'pmd_aws_stations.csv'), index=False)
    base = pd.DataFrame({'st': ['KARACHI'] * 3, 'hour_utc': pd.to_datetime(['2026-10-01 00:00', '2026-10-01 01:00', '2026-10-01 02:00']), 'temp_c': [30.0, 30.5, 31.0], 'n': 6, 'tmax': [30.2, 30.7, 31.2], 'tmin': [29.8, 30.3, 30.8], 'wmo': 41780.0, 'lat': 24.9, 'lon': 67.1, 'elev_m': 22.0})
    base.to_parquet(os.path.join(hist, 'pmd', 'pmd_aws_temp_hourly.parquet'), index=False)
    xl = os.path.join(root, 'AWS_Table_Export9.xlsx')
    with pd.ExcelWriter(xl) as wr:
        for site in ('KARACHI', 'LAHORE', 'BADIN', 'NEWTOWN'):
            rows = [[None, None, None], ['Datetime', 'Temperature  C degree', None], [None, 'TA1', 'TA2']]
            t = dt.datetime(2026, 10, 1, 0, 0)
            for k in range(6 * 30):
                ta1 = 30 + 0.01 * k; ta2 = ta1 + (2.5 if (site == 'LAHORE' and k % 6 >= 4) else 0.1)
                if site == 'KARACHI' and k == 100: ta1 = ta2 = 48.0            # a spike
                rows.append([(t + dt.timedelta(minutes=10 * k)).strftime('%Y-%m-%d %H:%M:%S'), f'+{ta1:.1f}', f'+{ta2:.1f}'])
            pd.DataFrame(rows[::1]).to_excel(wr, sheet_name=site, header=False, index=False)
    drop = os.path.join(root, 'NIGRAAN', 'nig', 'DROP_DATA_HERE'); os.makedirs(drop); shutil.copy(xl, drop)
    c, out = py('drop_import.py', '--app', app, '--drop', drop, cwd=sl, env={'NIGRAAN_LAMHA_HISTORY_DIR': hist})
    dl = json.load(open(os.path.join(app, 'data', 'drop-import.json')))['runs'][0]['files'][0]
    ok(c == 0 and dl.get('ok') and dl.get('kind', '').startswith('PMD AWS portal export'), 'A1 the drop folder recognises the AWS portal export and imports it', (c, out[-400:], dl))
    Hh = pd.read_parquet(os.path.join(sl, 'archive', 'pmd_aws', 'pmd_aws_temp_hourly.parquet'))
    k = Hh[Hh.st == 'KARACHI'].set_index('hour_utc')
    ok(k.loc[pd.Timestamp('2026-10-01 00:00'), 'temp_c'] == 30.0 and k.loc[pd.Timestamp('2026-10-01 03:00'), 'n'] == 6, 'A2 the archive wins where both hold an hour; new hours appended (n = 6 readings)', k.head(5).to_dict('index'))
    ok(pd.Timestamp('2026-10-01 16:00') not in k.index, 'A2 the 48 C spike hour removed (Hampel 25 h, 5 MAD)', sorted(k.index)[14:18])
    lh = Hh[Hh.st == 'LAHORE']
    ok(len(lh) > 0 and (lh.n == 4).all(), 'A3 readings whose two sensors differ by more than 1.0 C are not used (4 of 6 left an hour, still >= 3)', lh.n.unique())
    ok(not (Hh.st == 'BADIN').any() and not (Hh.st == 'NEWTOWN').any() and 'NEWTOWN' in dl.get('notInRegister', []) and 'BADIN' in dl.get('excluded', []), 'A4 BADIN excluded (register QC), a station not in the register reported, not added', dl)
    raw = pd.read_parquet(os.path.join(sl, 'archive', 'pmd_aws', 'pmd_aws_10min.parquet'))
    ok(set(raw.site) == {'KARACHI', 'LAHORE', 'BADIN', 'NEWTOWN'} and len(raw) == 4 * 180, 'A5 every export reading kept raw (10-min table)')
    ok(os.listdir(os.path.join(drop, '_imported')) and not [f for f in os.listdir(drop) if f.endswith('.xlsx')], 'A5 the file moved to _imported (nothing deleted)')

    # =============================== E · IFS total cloud cover ===============================
    sys.path.insert(0, os.path.join(APP, 'scripts', 'ecmwf'))
    srcE = open(os.path.join(APP, 'scripts', 'ecmwf', 'ingest_ecmwf010.py'), encoding='utf-8').read()
    import ast
    tree_ = ast.parse(srcE); V = None
    for node in tree_.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], 'id', '') == 'VARS': V = [(e.elts[0].value, [x.value for x in e.elts[1].elts], e.elts[2].value, e.elts[5].value) for e in node.value.elts]
    ok(V and ('tcc', ['tcc'], 'inst', '%') in V, 'E1 the 0.1 deg ingest fetches tcc again (instantaneous, stored as percent)', V)
    ok("name == 'tcc'" in srcE and '* 100.0' in srcE, 'E2 a 0-1 fraction in the GRIB units is turned into percent')
finally:
    SRV.shutdown()
    for r in ROOTS: shutil.rmtree(r, ignore_errors=True)
print(f'\nindep_feeds {n - fails} passed, {fails} failed')
sys.exit(1 if fails else 0)
