"""v91.17.283.28 . INDEPENDENCE FROM LAMHA . offline tests of station-lake/scripts/ews_sync.py in mode own (the only live mode now).
No network: the same mock portal as scripts/tests_ews_own (token, elements, data-combo) behind the job's transport. Temporary trees only.
  python scripts/tests28328/indep_ews_own_test.py      exit 0 all pass, 1 a failure, 77 skipped (no pandas / no ews_sync.py)
  (NIGRAAN_STATION_LAKE=<station-lake folder> when the scripts are not at ../station-lake)
E1 mode own never opens anything under LAMHA (lamha_info never called; LAMHA's fresh sync, its paused password and its different
   certificate pin change nothing); the retired modes lamha / failover in the switch file are read as own (logged reason)
E2 take-over: seeded from NIGRAAN's older copies AND the one-time history copy (archive_hist/lamha, LAMHA's data layout); each element
   asked from its last held reading minus the 2-h overlap; no reading twice
E3 late readings recovered by the gap re-check of NIGRAAN's own data; the next run is incremental
E4 the per-run portal request count is recorded (sync_status.json portal_requests, the decision's lastRun.portalRequests)
E5 protections kept: token reuse, password pause after refusals, NIGRAAN's own pinned certificate
E6 the own store moves once from nig/copies/ews_own (certificate pin kept); the station catalogue is written for the readers; a history
   copy that arrives later is seeded once
E7 no secret in any file outside secrets"""
import os, sys, json, shutil, tempfile, base64, datetime as dt, subprocess, threading, socket, ssl, time, io, contextlib, hashlib
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
LAKE = os.environ.get('NIGRAAN_STATION_LAKE') or os.path.join(APP, '..', 'station-lake')
SCRIPT = os.path.join(LAKE, 'scripts', 'ews_sync.py')
try:
    import numpy as np, pandas as pd
except ImportError:
    print('SKIP numpy / pandas not installed'); sys.exit(77)
if not os.path.exists(SCRIPT): print('SKIP ews_sync.py not found at ' + SCRIPT); sys.exit(77)
for k in ('NIGRAAN_LAMHA_DIR', 'NIGRAAN_COPIES_DIR', 'NIGRAAN_EWS_OWN_DIR', 'NIGRAAN_SECRETS_DIR', 'NIGRAAN_FROM_LAMHA_DIR', 'NIGRAAN_APP', 'NIGRAAN_OWN_DIR', 'NIGRAAN_LAMHA_HISTORY_DIR'): os.environ.pop(k, None)
sys.path.insert(0, os.path.dirname(SCRIPT))
import ews_sync as M

n = 0; fails = 0
def ok(c, m, info=None):
    global n, fails
    n += 1; print(('PASS ' if c else 'FAIL ') + m + ('' if c or info is None else '  :: ' + str(info)[:300]))
    if not c: fails += 1

USER, PW = 'nig-user', 'Pw-Secret-777'
ACC, REF = 'ACC-TOKEN-XYZ', 'REF-TOKEN-XYZ'
SECRETS = (PW, ACC, REF, base64.b64encode(PW.encode()).decode())
FP = 'ab' * 32
CLOCK = [dt.datetime(2026, 10, 28, 6, 0)]
M.now_utc = lambda: CLOCK[0]
time.sleep = lambda s: None                                     # no waiting in tests (pauses between requests, retries)
M._dpapi = lambda data, protect: bytes(b ^ 0x5A for b in data)   # a reversible stand-in for Windows DPAPI
M._seal = lambda p: {'password_dpapi': base64.b64encode(M._dpapi(p.encode(), True)).decode()}
M._server_fp = lambda: P.fp_seen
M._tcp = lambda p: 'not probed (test)'

# ---- the mock portal ----
ELEM = [  # elementId, stationId, stationName, elementName, unit, lat, lon
    (101, 9001, 'Alpha_AWS_1', 'Air Temperature', 'C', 36.1, 74.1), (102, 9001, 'Alpha_AWS_1', 'Cumulated Rain', 'mm', 36.1, 74.1),
    (103, 9002, 'Beta_AWS_1', 'Air Temperature', 'C', 35.5, 72.9), (201, 9003, 'Gamma_GLOF_1', 'Water Level', 'm', 36.3, 74.6),
    (104, 9004, 'Silent_AWS_1', 'Air Temperature', 'C', 35.0, 73.0), (105, 9005, 'BPiClone_AWS_1', 'Air Temperature', 'C', 0, 0),
    (106, 9001, 'Alpha_AWS_1', 'Battery Voltage', 'V', 36.1, 74.1)]
class Portal:
    def __init__(self):
        self.reset()
    def reset(self):
        self.calls = []; self.pw_grants = 0; self.refresh_grants = 0; self.data_req = []; self.accept_pw = True; self.refresh_ok = True
        self.hidden = set(); self.fp_seen = FP; self.pin_error = False; self.on_data = None; self.nets = 0
    def last(self, eid):
        if eid == 104: return CLOCK[0] - dt.timedelta(days=5)
        return CLOCK[0].replace(minute=CLOCK[0].minute // 10 * 10)
    def value(self, eid, t):
        k = int((t - dt.datetime(2026, 10, 1)).total_seconds() // 600)
        if eid == 102: return round(0.2 * (k // 6), 1)          # a rain counter
        if eid == 201: return round(2.0 + 0.01 * (k % 50), 2)
        return round(5 + 3 * np.sin(k / 20) + 0.01 * eid, 2)
    def request(self, method, path, params=None, form=None, timeout=60, auth=None):
        self.calls.append((method, path))
        if self.pin_error: raise M.PinError('mismatch')
        if path == '/': return 200, b''
        if path == '/connect/token':
            g = form.get('grant_type')
            if g == 'password':
                self.pw_grants += 1
                if not (self.accept_pw and form.get('username') == USER and form.get('password') == PW): return 400, b'{"error":"invalid_grant"}'
                return 200, json.dumps({'access_token': ACC, 'refresh_token': REF, 'expires_in': 3600}).encode()
            if g == 'refresh_token':
                self.refresh_grants += 1
                if not self.refresh_ok or form.get('refresh_token') != REF: return 400, b'{"error":"invalid_grant"}'
                return 200, json.dumps({'access_token': ACC, 'expires_in': 3600}).encode()
            return 400, b''
        if auth != ACC: return 401, b''
        if path == '/v3/elements':
            return 200, json.dumps([dict(elementId=e, stationId=s, stationName=sn, elementName=en, measUnit=u, time=self.last(e).strftime('%Y-%m-%dT%H:%M:%SZ'), isQueryable=True)
                                    for e, s, sn, en, u, la, lo in ELEM]).encode()
        if path.startswith('/v3/data-combo/'):
            eid = int(path.rsplit('/', 1)[1]); q = dict((k, v) for k, v in params if k in ('from', 'to'))
            frm = dt.datetime.fromisoformat(q['from']).astimezone(dt.timezone.utc).replace(tzinfo=None); to = dt.datetime.fromisoformat(q['to']).astimezone(dt.timezone.utc).replace(tzinfo=None)
            self.data_req.append((eid, frm, to))
            if self.on_data: self.on_data(len(self.data_req))
            e = [x for x in ELEM if x[0] == eid][0]; out = []
            t = frm.replace(second=0, microsecond=0); t = t + dt.timedelta(minutes=(10 - t.minute % 10) % 10)
            while t <= min(to, self.last(eid)):
                if (eid, t) not in self.hidden: out.append([int((t - dt.datetime(1970, 1, 1)).total_seconds() * 1000), self.value(eid, t)])
                t += dt.timedelta(minutes=10)
            return 200, json.dumps({'plausibleData': out, 'elementDetail': {'latitude': e[5], 'longitude': e[6]}}).encode()
        return 404, b''
    def close(self): pass
P = Portal()
def _fake_http(scheme, host, fp=None, timeout=60, port=None):
    P.nets += 1; P.scheme = scheme; P.fp_used = fp; return P
_real_http = M.Http
M.Http = _fake_http

# ---- the temporary tree ----
def tree():
    root = tempfile.mkdtemp(prefix='ewsown_')
    app = os.path.join(root, 'NIGRAAN', 'nig', 'nigraan-local'); os.makedirs(os.path.join(app, 'data')); os.makedirs(os.path.join(app, 'logs'))
    src = os.path.join(APP, 'data')
    for f in ('ews-source.json', 'copy-sources.json'):
        if os.path.exists(os.path.join(src, f)): shutil.copy(os.path.join(src, f), os.path.join(app, 'data', f))
    os.makedirs(os.path.join(root, 'LAMHA', 'data', 'pmd', 'ews_live'))
    M.configure(app=app)
    return root, app
def setmode(app, mode, **kw):
    f = os.path.join(app, 'data', 'ews-source.json'); c = json.load(open(f)) if os.path.exists(f) else {}
    c['mode'] = mode; c.update(kw); json.dump(c, open(f, 'w'))
def lamha_status(root, minutes_ago):
    f = os.path.join(root, 'LAMHA', 'data', 'pmd', 'ews_live', 'sync_status.json')
    t = CLOCK[0] - dt.timedelta(minutes=minutes_ago) + dt.timedelta(hours=5)
    json.dump({'sync_pkt': t.strftime('%Y-%m-%d %H:%M'), 'requests': 500}, open(f, 'w'))
def lamha_auth(root, **kw): json.dump(kw, open(os.path.join(root, 'LAMHA', 'data', 'pmd', 'ews_live', 'auth_state.json'), 'w'))
def save_login(plain=False):
    os.makedirs(M.G['SEC'], exist_ok=True)
    json.dump({'username': USER, **({'password': PW} if plain else M._seal(PW))}, open(M.G['LOGIN'], 'w'))
def seed_copy(t_last, lamha_hole=None):
    """NIGRAAN's copies of LAMHA as they stand when LAMHA stopped at t_last: raw day files (server copy), hourly tables + catalogue (agents' copy)."""
    raw = M.G['COPY_RAW']; os.makedirs(raw, exist_ok=True); rows = []
    for e, s, sn, en, u, la, lo in ELEM[:3]:
        t = t_last - dt.timedelta(days=2)
        while t <= t_last:
            if not (lamha_hole and e == lamha_hole[0] and lamha_hole[1] <= t < lamha_hole[2]):
                rows.append(dict(value=P.value(e, t), time_utc=t, element_id=e, station_id=s, station=sn, element=en, unit=u))
            t += dt.timedelta(minutes=10)
    R = pd.DataFrame(rows)
    for day, g in R.groupby(R.time_utc.dt.strftime('%Y%m%d')): g.to_csv(os.path.join(raw, f'ews_raw_{day}.csv.gz'), index=False, compression='gzip', date_format='%Y-%m-%d %H:%M')
    fl = M.G['FROM_LAMHA']; os.makedirs(fl, exist_ok=True)
    hrs = pd.date_range(t_last.replace(minute=0) - dt.timedelta(days=20), t_last.replace(minute=0), freq='h')
    pd.DataFrame({'element_id': 201, 'hour_utc': hrs, 'value': np.float32(2.1), 'min': np.float32(2.0), 'max': np.float32(2.2), 'n': 6, 'station_id': 9003, 'station': 'Gamma_GLOF_1',
                  'element': 'Water Level', 'unit': 'm', 'latitude': 36.3, 'longitude': 74.6}).to_parquet(os.path.join(fl, 'ews_hydro_hourly.parquet'), index=False)
    old = pd.date_range(t_last.replace(minute=0) - dt.timedelta(days=20), t_last.replace(minute=0), freq='h')
    pd.DataFrame({'hour_utc': old, 'value': np.float32(1.5), 'max': np.float32(2), 'min': np.float32(1), 'n': 6, 'n_range_flagged': 0, 'station': 'Alpha_AWS_1', 'element': 'Air Temperature',
                  'sensor_id': 101, 'unit': 'C', 'flat': False, 'latitude': np.float32(36.1), 'longitude': np.float32(74.1), 'altitude': np.float32(2500)}).to_parquet(os.path.join(fl, 'ews_live_hourly.parquet'), index=False)
    pd.DataFrame([dict(element_id=e, station_id=s, station=sn, element=en, unit=u, latitude=la, longitude=lo) for e, s, sn, en, u, la, lo in ELEM[:4]]).to_csv(os.path.join(fl, 'aegis_elements.csv'), index=False)
def run(**kw):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf): code = M.run(**kw)
    OUT.append(buf.getvalue()); return code
def dec(): return json.load(open(M.G['DEC']))
OUT = []
ROOTS = []

LAMHA_CALLS = [0]
def _no_lamha():
    LAMHA_CALLS[0] += 1; raise AssertionError('mode own must not read LAMHA')
M.lamha_info = _no_lamha
def hist_copy(t_last):
    """the one-time history copy (archive_hist/lamha, LAMHA's data layout): raw day files of element 102 ending 3 days before t_last,
    raw hydrology of 201, and a catalogue with altitude"""
    h = os.path.join(M.G['HIST']); os.makedirs(os.path.join(h, 'raw'), exist_ok=True); os.makedirs(os.path.join(h, 'raw_hydro'), exist_ok=True)
    rows = []; t = t_last - dt.timedelta(days=6)
    while t <= t_last - dt.timedelta(days=3):
        rows.append(dict(value=P.value(102, t), time_utc=t, element_id=102, station_id=9001, station='Alpha_AWS_1', element='Cumulated Rain', unit='mm')); t += dt.timedelta(minutes=10)
    R = pd.DataFrame(rows)
    for day, g in R.groupby(R.time_utc.dt.strftime('%Y%m%d')): g.to_csv(os.path.join(h, 'raw', f'ews_raw_{day}.csv.gz'), index=False, compression='gzip', date_format='%Y-%m-%d %H:%M')
    rows = []; t = t_last - dt.timedelta(hours=6)
    while t <= t_last:
        rows.append(dict(value=P.value(201, t), time_utc=t, element_id=201, station_id=9003, station='Gamma_GLOF_1', element='Water Level', unit='m')); t += dt.timedelta(minutes=10)
    R = pd.DataFrame(rows)
    for day, g in R.groupby(R.time_utc.dt.strftime('%Y%m%d')): g.to_csv(os.path.join(h, 'raw_hydro', f'ews_hydro_{day}.csv.gz'), index=False, compression='gzip', date_format='%Y-%m-%d %H:%M')
    cat = os.path.join(os.path.dirname(h), 'aegis_gb_station_catalog.csv')
    pd.DataFrame([dict(stationId=9001, stationName='Alpha_AWS_1', n_elements=3, latitude=36.1, longitude=74.1, altitude=2500.0),
                  dict(stationId=9003, stationName='Gamma_GLOF_1', n_elements=1, latitude=36.3, longitude=74.6, altitude=3100.0)]).to_csv(cat, index=False)
    json.dump({'finished': '2026-10-28T05:00:00Z'}, open(M.G['HIST_DONE'], 'w'))

try:
    # ---------- E1 mode own reads nothing of LAMHA's; retired modes read as own ----------
    root, app = tree(); ROOTS.append(root); P.reset(); save_login()
    lamha_status(root, 5); lamha_auth(root, cert_sha256='cd' * 32, pw_fail=5, pw_block_until=time.time() + 99999)   # LAMHA fresh, paused, other pin
    ok(json.load(open(os.path.join(APP, 'data', 'ews-source.json')))['mode'] == 'own', 'E1 the shipped switch file says own')
    for mode in ('own', 'failover', 'lamha'):
        setmode(app, mode); cfg = M.load_cfg()
        ok(cfg['mode'] == 'own' and (mode == 'own' or 'retired' in cfg.get('why_mode', '')), 'E1 switch file mode ' + mode + ' -> own' + (' (retired, reason logged)' if mode != 'own' else ''), cfg)
    setmode(app, 'failover')
    T_LAST = CLOCK[0] - dt.timedelta(hours=4)
    seed_copy(T_LAST); hist_copy(T_LAST)
    P.hidden = {(103, CLOCK[0] - dt.timedelta(minutes=m)) for m in (60, 70, 80)}; clock0 = CLOCK[0]
    c = run(); D = dec()
    ok(c == 0 and D['active'] == 'own' and D['fetch'] and D['lastRun']['ok'], 'E1 first run fetches at once (no standby, no hold although LAMHA synced 5 min ago)', (c, D.get('why'), D.get('lastRun')))
    ok(LAMHA_CALLS[0] == 0, 'E1 nothing under LAMHA was read (lamha_info never called)', LAMHA_CALLS[0])
    ok(P.pw_grants <= 1 and P.calls and P.fp_used == FP, 'E1 LAMHA\'s paused password and its other certificate pin change nothing: NIGRAAN logs in once and pins the certificate itself', (P.pw_grants, P.fp_used))
    # ---------- E2 take-over seed ----------
    first = {e: f for e, f, t in P.data_req[:4]}
    ok(first.get(101) == T_LAST - dt.timedelta(hours=2) and first.get(103) == T_LAST - dt.timedelta(hours=2), 'E2 elements held in the copies asked from their last reading minus 2 h', first)
    raw = pd.concat(pd.read_csv(os.path.join(M.G['RAW'], x), parse_dates=['time_utc']) for x in sorted(os.listdir(M.G['RAW'])) if x.endswith('.csv.gz'))
    a102 = raw[raw.element_id == 102].sort_values('time_utc')
    ok(a102.time_utc.min() == T_LAST - dt.timedelta(days=6), 'E2 the history copy\'s raw days are in the own store (element 102 from 6 days back)', a102.time_utc.min())
    ok(not raw.duplicated(['element_id', 'time_utc']).any(), 'E2 no reading twice')
    rh = pd.concat(pd.read_csv(os.path.join(M.G['RAW_H'], x), parse_dates=['time_utc']) for x in sorted(os.listdir(M.G['RAW_H'])) if x.endswith('.csv.gz'))
    ok((rh.element_id == 201).any() and rh.time_utc.min() <= T_LAST - dt.timedelta(hours=6), 'E2 raw hydrology of the history copy seeded', rh.time_utc.min())
    # ---------- E4 request count ----------
    st = json.load(open(os.path.join(M.G['OUT'], 'sync_status.json')))
    n_data = len(P.data_req)
    ok(st.get('portal_requests') == n_data + 1 and D['lastRun'].get('portalRequests') == st.get('portal_requests'), 'E4 portal requests recorded: element list + every data request (' + str(st.get('portal_requests')) + ')', (st.get('portal_requests'), n_data))
    # ---------- E3 late readings and incremental ----------
    n_before = len(P.data_req); P.hidden = set(); CLOCK[0] = CLOCK[0] + dt.timedelta(minutes=30); lamha_status(root, 1)
    c = run(); r2 = P.data_req[n_before:]
    raw2 = pd.concat(pd.read_csv(os.path.join(M.G['RAW'], x), parse_dates=['time_utc']) for x in os.listdir(M.G['RAW']) if x.endswith('.csv.gz'))
    have = set(raw2[raw2.element_id == 103].time_utc)
    ok(c == 0 and all(t in have for t in (clock0 - dt.timedelta(minutes=m) for m in (60, 70, 80))), 'E3 readings that reached the portal late are recovered by the gap re-check')
    gq = [(f, t) for e, f, t in r2 if e == 103 and f <= clock0 - dt.timedelta(minutes=80) and t >= clock0 - dt.timedelta(minutes=60) and t - f <= dt.timedelta(minutes=40)]
    ok(len(gq) == 1 and gq[0][0] >= clock0 - dt.timedelta(minutes=95), 'E3 one gap re-check request covering only the hole (beside the incremental request, whose 2-h overlap also spans it, as in LAMHA)', gq)
    ok(all(f >= CLOCK[0] - dt.timedelta(minutes=30) - dt.timedelta(hours=2) for e, f, t in r2[:4]), 'E3 incremental: each element from its own last reading minus 2 h', r2[:4])
    ok(LAMHA_CALLS[0] == 0, 'E1 still nothing of LAMHA read after the second run')
    # ---------- E5 protections ----------
    P.calls = []; CLOCK[0] = CLOCK[0] + dt.timedelta(minutes=30); run()
    ok(('POST', '/connect/token') not in P.calls, 'E5 a valid session token is reused: no token request', P.calls[:3])
    os.remove(M.G['TOK']); P.accept_pw = False; P.pw_grants = 0
    for k in range(2): CLOCK[0] = CLOCK[0] + dt.timedelta(minutes=30); run()
    a = json.load(open(M.G['AUTH']))
    ok(a.get('pw_block_until', 0) > time.time() and P.pw_grants == 2, 'E5 two refused passwords pause password logins (NIGRAAN\'s own auth_state)', a)
    CLOCK[0] = CLOCK[0] + dt.timedelta(minutes=30); g0 = P.pw_grants; c = run()
    ok(c == 3 and P.pw_grants == g0, 'E5 while paused no password is sent (exit 3)', c)
    ok(a.get('cert_sha256') == FP, 'E5 the pinned certificate is NIGRAAN\'s own (the portal\'s, not LAMHA\'s other pin)', a.get('cert_sha256'))
    # ---------- E6 catalogue, migration, later history ----------
    cs = pd.read_csv(M.G['CAT_ST'])
    ok(set(cs.stationId.astype(int)) >= {9001, 9002, 9003} and float(cs[cs.stationId == 9001].altitude.iloc[0]) == 2500.0, 'E6 station catalogue for the readers: history rows (altitude kept) + own new station 9002', cs.to_dict('list'))
    root2, app2 = tree(); ROOTS.append(root2); P.reset(); save_login()
    old = os.path.join(root2, 'NIGRAAN', 'nig', 'copies', 'ews_own', 'data', 'pmd', 'ews_live'); os.makedirs(old)
    json.dump({'cert_sha256': FP, 'pw_fail': 0, 'pw_block_until': 0}, open(os.path.join(old, 'auth_state.json'), 'w')); open(os.path.join(old, 'sync_log.txt'), 'w').write('old line\n')
    ok(M.migrate_store() and json.load(open(M.G['AUTH']))['cert_sha256'] == FP and os.path.exists(os.path.join(old, 'auth_state.json')), 'E6 the old own store (nig/copies/ews_own) is copied to nig/own once, pin kept, old folder left')
    ok(not M.migrate_store(), 'E6 the move happens once')
    seed_copy(CLOCK[0] - dt.timedelta(hours=1)); c = run()
    ok(c == 0 and not M.history_pending(), 'E6 no history yet: nothing pending after the take-over')
    hist_copy(CLOCK[0] - dt.timedelta(hours=1)); ok(M.history_pending(), 'E6 a history copy finished later is pending')
    CLOCK[0] = CLOCK[0] + dt.timedelta(minutes=30); c = run()
    raw3 = pd.concat(pd.read_csv(os.path.join(M.G['RAW'], x), parse_dates=['time_utc']) for x in os.listdir(M.G['RAW']) if x.endswith('.csv.gz'))
    ok(c == 0 and not M.history_pending() and (raw3.element_id == 102).any() and raw3[raw3.element_id == 102].time_utc.min() <= CLOCK[0] - dt.timedelta(days=5), 'E6 ... and seeded once at the next run')
    # ---------- E7 secrets ----------
    leaked = []
    for r in ROOTS:
        for dp, dn, fn in os.walk(r):
            if os.path.sep + 'secrets' in dp: continue
            for f in fn:
                try: b = open(os.path.join(dp, f), 'rb').read()
                except OSError: continue
                if f.endswith(('.gz', '.parquet')): continue
                for s in SECRETS:
                    if s.encode() in b: leaked.append(os.path.join(dp, f))
    ok(not leaked and not any(s in ''.join(OUT) for s in SECRETS), 'E7 no password or token in any file outside secrets or in the output', leaked)
finally:
    for r in ROOTS: shutil.rmtree(r, ignore_errors=True)
print(f'\nindep_ews_own {n - fails} passed, {fails} failed')
sys.exit(1 if fails else 0)
