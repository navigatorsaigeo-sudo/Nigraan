#!/usr/bin/env python3
"""v91.17.283.14 (283.16: EWS network setting, curated EWS archive) . OBSERVATION TRUTH THROUGH THE ONE VALUE-LEVEL QUALITY CONTROL (server/api/obsqc.mjs), for Python readers.

Owner decision 24 Oct 2026: a wrong value is dropped, never the whole station. This reader does not re-implement a single check: it
writes the readings to two temporary CSV files and runs obsqc.mjs's own command line (node), so the server, the agents, the ECMWF
shadow score and the 1 Nov retrain judge every value with the same code and the same data/obs-qc-params.json.

  qc_frame(obs, stations, app, bg=None, nearest_min=None) -> DataFrame pid, time_utc (hour), var, value, pass (0/1), test, size
      obs       DataFrame: pid, time (UTC, any cadence), and any of T, Td, RH, P, W, G, S, PR (deg C, %, hPa, km/h, W/m2, mm/h)
      stations  DataFrame: pid, lat, lon, elev, zone (zone may be empty: all such stations then form one zone)
      bg        optional column name in obs holding the forecast temperature at the reading's hour (the background check and the
                residual buddy check use it)
  passing(obs, flags, var='T') -> boolean Series: obs rows whose hourly value of `var` passed (rows that are not an hourly pick: False)
  qc_table(table, app, var_col='obs', bg_col='temperature_2m') -> flags for the national training table (pid, t, lat, lon, elev, zone)
  load_truth(lamha, app, t_from, t_to, sources) -> the station truth of MACH, official AWS hourly, synop, METAR and the partner-network
      EWS from LAMHA's data folder (READ ONLY: files are opened for reading, nothing is written there), judged; one row per pid x hour
      x variable with pass / test.
  load_ews_archive(archive, app, t_from, t_to) -> the owner's curated EWS archive (D:\\NIGRAAN\\inputs\\met_parquet\\pmd_ews, read only)
      judged (v91.17.283.16, owner decision 24 Oct 2026 22:07 PKT; see EWS below).
EWS (the partner network, pid aws:<station>): the network settings of data/obs-qc-params.json "networks" (spatial false, background
      false, climate false, copy false, adjust false) are applied by obsqc.mjs itself, so every reader here uses the same setting: only the
      technical checks (gross range with the sentinels, internal consistency, stuck / flat, spike), no buddy or background check, and no
      value is ever adjusted. The curated archive carries its own qc column (sentinel / range / spike / flat); there: sentinel or range =
      dropped (removed before the series checks, so they cannot disturb them); spike or flat = dropped only when obsqc.mjs also fails
      that value (test 'archive-<qc>+<own test>'), else it passes; qc empty = pass, except that the deterministic technical checks
      (sentinel, gross range, internal consistency, owner mark) still drop it - obsqc's own series verdicts (stuck / flat, spike) on an
      unflagged value are kept in own_test for information only. The lists live in data/obs-qc-params.json networks.ews.archive.
Node: NIGRAAN_NODE, else <NIGRAAN root>\\runtime\\nodejs22\\node.exe (the server's own), else node on PATH."""
import os, sys, json, glob, gzip, shutil, tempfile, subprocess
import pandas as pd
import numpy as np

VARS = ['T', 'Td', 'RH', 'P', 'W', 'G', 'S', 'PR']


CODE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))   # the nigraan-local tree this reader belongs to


def app_dir(app=None):
    return os.path.abspath(app or CODE)


def node_exe(app=CODE):
    c = [os.environ.get('NIGRAAN_NODE'), os.path.join(app, '..', '..', 'runtime', 'nodejs22', 'node.exe'), os.path.join(CODE, '..', '..', 'runtime', 'nodejs22', 'node.exe'), shutil.which('node')]
    for x in c:
        if x and os.path.exists(x):
            return os.path.abspath(x)
    raise RuntimeError('node not found: set NIGRAAN_NODE to node.exe (D:\\NIGRAAN\\runtime\\nodejs22\\node.exe)')


def qc_frame(obs, stations, app=None, bg=None, nearest_min=None):
    app = app_dir(app)
    tmp = tempfile.mkdtemp(prefix='obsqc_')
    try:
        st = stations[['pid', 'lat', 'lon', 'elev', 'zone'] + (['net'] if 'net' in stations.columns else [])].copy(); st['zone'] = st['zone'].fillna('')
        if 'net' in st.columns:
            st['net'] = st['net'].fillna('')
        st.drop_duplicates('pid').to_csv(os.path.join(tmp, 'st.csv'), index=False)
        cols = ['pid', 'time_utc'] + [v for v in VARS if v in obs.columns] + (['bg'] if bg else [])
        o = obs.copy(); o['time_utc'] = pd.to_datetime(o['time'], utc=True).dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        if bg:
            o['bg'] = o[bg]
        o[cols].to_csv(os.path.join(tmp, 'obs.csv'), index=False, na_rep='')
        cmd = [node_exe(app), os.path.join(CODE, 'server', 'api', 'obsqc.mjs'), '--data', os.path.join(app, 'data'),   # this tree's code, the app's data (parameters, marks)
               '--stations', os.path.join(tmp, 'st.csv'), '--obs', os.path.join(tmp, 'obs.csv'), '--out', os.path.join(tmp, 'out.csv')]
        if nearest_min is not None:
            cmd += ['--nearest-min', str(nearest_min)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError('obsqc.mjs failed: ' + (r.stderr or r.stdout)[-2000:])
        F = pd.read_csv(os.path.join(tmp, 'out.csv'), dtype={'test': str})
        F['test'] = F['test'].fillna('')
        F.attrs['counts'] = json.loads(r.stdout.strip().splitlines()[-1]) if r.stdout.strip() else {}
        return F
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def passing(obs, flags, var='T'):
    f = flags[flags['var'] == var][['pid', 'time_utc', 'pass']].copy()
    key = obs['pid'].astype(str) + '|' + pd.to_datetime(obs['time'], utc=True).dt.strftime('%Y-%m-%dT%H:%MZ')
    ok = set((f['pid'].astype(str) + '|' + f['time_utc'].astype(str))[f['pass'] == 1])
    return key.isin(ok)


def qc_table(table, app=None, var_col='obs', bg_col='temperature_2m', var='T'):
    """the national training table (one row per pid x hour): its observed temperature through obsqc.mjs. Returns flags pid, t, pass,
    test, size (one per row of the table that holds a value)."""
    T = pd.read_parquet(table) if isinstance(table, str) else table
    st = T.groupby('pid', as_index=False)[['lat', 'lon', 'elev', 'zone'] + (['net'] if 'net' in T.columns else [])].first()
    o = pd.DataFrame({'pid': T['pid'].values, 'time': pd.to_datetime(T['t'], utc=True).values, var: T[var_col].values})
    if bg_col and bg_col in T.columns:
        o['bg'] = T[bg_col].values
    F = qc_frame(o, st, app, bg='bg' if 'bg' in o.columns else None, nearest_min=0)
    F = F[F['var'] == var].rename(columns={'time_utc': 't'})
    F['t'] = pd.to_datetime(F['t'], utc=True)
    return F[['pid', 't', 'pass', 'test', 'size']]


# ---- station truth from LAMHA's data folder (read only) ------------------------------------------------------------------------
def _read_mach(lamha, t0, t1, reg):
    fs = sorted(glob.glob(os.path.join(lamha, 'mach', 'db', 'obs_*.csv')))
    parts = []
    for f in fs:
        d = os.path.basename(f)[4:12]
        if not (t0.strftime('%Y%m%d') <= d <= t1.strftime('%Y%m%d')):
            continue
        x = pd.read_csv(f, usecols=lambda c: c in ('time', 'station_key', 'source', 'provider', 'temperature_c', 'dew_point_c', 'humidity_pct', 'pressure_hpa', 'wind_speed_kmh', 'wind_gust_kmh', 'solar_wm2'))
        parts.append(x)
    if not parts:
        return None, None
    M = pd.concat(parts, ignore_index=True)
    M = M[(M.get('source', '') != 'qm') & ~M.get('provider', pd.Series('', index=M.index)).astype(str).str.lower().str.startswith('apple')]
    o = pd.DataFrame({'pid': 'mach:' + M.station_key.astype(str), 'time': pd.to_datetime(M.time, utc=True), 'T': M.temperature_c, 'Td': M.get('dew_point_c'), 'RH': M.get('humidity_pct'),
                      'P': M.get('pressure_hpa'), 'W': M.get('wind_speed_kmh'), 'G': M.get('wind_gust_kmh'), 'S': M.get('solar_wm2')})
    st = pd.DataFrame([{'pid': 'mach:' + s['key'], 'lat': s.get('lat'), 'lon': s.get('lon'), 'elev': None, 'zone': None} for s in reg if s.get('lat') is not None])
    return o, st


def _read_aws_hourly(lamha, t0, t1):
    f = sorted(glob.glob(os.path.join(lamha, 'retrain_*', 'pmd_aws_temp_hourly_*.parquet')), key=os.path.getmtime)
    f = f[-1] if f else os.path.join(lamha, 'pmd', 'pmd_aws_temp_hourly.parquet')
    sf = os.path.join(lamha, 'pmd', 'pmd_aws_stations.csv')
    if not os.path.exists(f) or not os.path.exists(sf):
        return None, None
    A = pd.read_parquet(f, columns=['st', 'hour_utc', 'temp_c']); A['time'] = pd.to_datetime(A.hour_utc, utc=True)
    A = A[(A.time >= t0) & (A.time <= t1)]
    S = pd.read_csv(sf); cid = next(c for c in S.columns if c.lower() in ('st', 'station', 'name', 'station_name'))
    la = next(c for c in S.columns if c.lower() in ('lat', 'latitude')); lo = next(c for c in S.columns if c.lower() in ('lon', 'longitude'))
    el = next((c for c in S.columns if c.lower() in ('elev', 'elev_m', 'altitude', 'alt')), None)
    st = pd.DataFrame({'pid': 'pmd:' + S[cid].astype(str), 'lat': S[la], 'lon': S[lo], 'elev': S[el] if el else None, 'zone': None})
    return pd.DataFrame({'pid': 'pmd:' + A.st.astype(str), 'time': A.time, 'T': A.temp_c}), st


def _read_metar(lamha, t0, t1):
    ap = os.path.join(lamha, 'obs_other', 'metar_live', 'airports.csv')
    if not os.path.exists(ap):
        return None, None
    S = pd.read_csv(ap); parts = []
    for f in sorted(glob.glob(os.path.join(lamha, 'obs_other', 'metar_live', 'metar_2*.csv'))):
        x = pd.read_csv(f, usecols=['station', 'time_utc', 't_c', 'td_c']); parts.append(x)
    if not parts:
        return None, None
    M = pd.concat(parts, ignore_index=True); M['time'] = pd.to_datetime(M.time_utc, utc=True); M = M[(M.time >= t0) & (M.time <= t1)]
    rh = 100 * np.exp(17.67 * M.td_c / (M.td_c + 243.5) - 17.67 * M.t_c / (M.t_c + 243.5))
    st = pd.DataFrame({'pid': 'metar:' + S['icao'].astype(str), 'lat': S['lat'], 'lon': S['lon'], 'elev': S.get('elev_m'), 'zone': None})
    return pd.DataFrame({'pid': 'metar:' + M.station.astype(str), 'time': M.time, 'T': M.t_c, 'Td': M.td_c, 'RH': rh.clip(0, 100)}), st


def _read_synop(lamha, t0, t1):
    sf = os.path.join(lamha, 'pmd', 'synop_stations.csv')
    if not os.path.exists(sf):
        return None, None
    S = pd.read_csv(sf); idc = next(c for c in S.columns if c.lower() in ('sid', 'wmo', 'id', 'station_id'))
    rows = []
    for f in sorted(glob.glob(os.path.join(lamha, 'pmd', 'pmd_synop_live_*.jsonl'))):
        with open(f, 'r', encoding='utf-8', errors='replace') as h:
            for l in h:
                try:
                    r = json.loads(l)
                except Exception:
                    continue
                rows.append((str(r.get('sid') or r.get('station') or ''), r.get('t') or r.get('time_utc'), r.get('t_c'), r.get('td_c')))
    if not rows:
        return None, None
    Y = pd.DataFrame(rows, columns=['sid', 't', 'T', 'Td']); Y['time'] = pd.to_datetime(Y.t, utc=True, errors='coerce'); Y = Y[(Y.time >= t0) & (Y.time <= t1)]
    la = next(c for c in S.columns if c.lower() in ('lat', 'latitude')); lo = next(c for c in S.columns if c.lower() in ('lon', 'longitude'))
    el = next((c for c in S.columns if c.lower() in ('elev', 'elev_m', 'altitude')), None)
    st = pd.DataFrame({'pid': 'synop:' + S[idc].astype(str), 'lat': S[la], 'lon': S[lo], 'elev': S[el] if el else None, 'zone': None})
    return pd.DataFrame({'pid': 'synop:' + Y.sid, 'time': Y.time, 'T': pd.to_numeric(Y['T'], errors='coerce'), 'Td': pd.to_numeric(Y['Td'], errors='coerce')}), st


def _read_ews(lamha, t0, t1):
    cat = os.path.join(lamha, 'pmd', 'aegis_gb_station_catalog.csv')
    if not os.path.exists(cat):
        return None, None
    C = pd.read_csv(cat); parts = []
    for f in sorted(glob.glob(os.path.join(lamha, 'pmd', 'ews_live', 'raw', 'ews_raw_*.csv.gz'))):
        d = os.path.basename(f)[8:16]
        if not (t0.strftime('%Y%m%d') <= d <= t1.strftime('%Y%m%d')):
            continue
        x = pd.read_csv(f, usecols=['value', 'time_utc', 'station_id', 'element']); parts.append(x)
    if not parts:
        return None, None
    E = pd.concat(parts, ignore_index=True); E = E[E.element.isin(['Air Temperature', 'Relative Humidity', 'Wind Speed'])]
    E = E.pivot_table(index=['station_id', 'time_utc'], columns='element', values='value', aggfunc='first').reset_index()
    name = dict(zip(C.stationId.astype(str), C.stationName.astype(str)))
    o = pd.DataFrame({'pid': 'aws:' + E.station_id.astype(str).map(name).fillna(E.station_id.astype(str)), 'time': pd.to_datetime(E.time_utc, utc=True),
                      'T': E.get('Air Temperature'), 'RH': E.get('Relative Humidity'), 'W': E.get('Wind Speed') * 3.6 if 'Wind Speed' in E else None})
    st = pd.DataFrame({'pid': 'aws:' + C.stationName.astype(str), 'lat': C.latitude, 'lon': C.longitude, 'elev': C.altitude, 'zone': None, 'net': 'aws'})
    return o, st


# ---- the owner's curated EWS archive (D:\\NIGRAAN\\inputs\\met_parquet\\pmd_ews; read only) ----------------------------------------------
# the elements the live reader (_read_ews) and verify.mjs take, in the same units: T C, RH %, W km/h (the archive's m/s x 3.6)
EWS_ARCHIVE_VARS = {'T': ('ews_10min_air_temperature.parquet', 'Air Temperature', 1.0), 'RH': ('ews_10min_relative_humidity.parquet', 'Relative Humidity', 1.0),
                    'W': ('ews_10min_wind_speed.parquet', 'Wind Speed', 3.6)}
ARCHIVE_DROP = ('sentinel', 'range')       # dropped on the archive's own flag
ARCHIVE_CONFIRM = ('spike', 'flat')        # dropped only when obsqc.mjs also fails the value
OWN_ALWAYS = ('owner-mark', 'sentinel', 'gross-range', 'internal')   # obsqc.mjs verdicts that drop a value whatever the archive flag
# the same three lists are read from data/obs-qc-params.json networks.ews.archive when present (archive_rule); these are the fallback


def archive_rule(app=None):
    try:
        P = json.load(open(os.path.join(app_dir(app), 'data', 'obs-qc-params.json'), encoding='utf-8'))
        A = P['networks']['ews']['archive']
        return tuple(A['drop_on_flag']), tuple(A['confirm_flags']), tuple(A['own_tests_always'])
    except Exception:
        return ARCHIVE_DROP, ARCHIVE_CONFIRM, OWN_ALWAYS


def _read_ews_archive(archive, t0, t1, drop=ARCHIVE_DROP):
    """long frame pid, time, var, value, qc of the archive (sentinel / range values already removed: value NaN) and the stations"""
    E = pd.read_parquet(os.path.join(archive, 'ews_elements.parquet'), columns=['element_id', 'station', 'element', 'latitude', 'longitude', 'altitude'])
    S = pd.read_parquet(os.path.join(archive, 'ews_stations.parquet'), columns=['station', 'latitude', 'longitude', 'elevation_m'])
    parts = []
    for v, (f, el, k) in EWS_ARCHIVE_VARS.items():
        fp = os.path.join(archive, f)
        if not os.path.exists(fp):
            continue
        x = pd.read_parquet(fp, columns=['element_id', 'time_utc', 'value', 'qc'])
        x['time'] = pd.to_datetime(x['time_utc'], utc=True); x = x[(x.time >= t0) & (x.time <= t1)]
        ids = E.loc[E.element == el, ['element_id', 'station']]
        x = x.merge(ids, on='element_id', how='inner')
        x['qc'] = x['qc'].astype(str).replace({'nan': '', 'None': ''})
        x['value'] = x['value'].astype('float64') * k
        x.loc[x.qc.isin(drop), 'value'] = np.nan
        parts.append(pd.DataFrame({'pid': 'aws:' + x.station.astype(str), 'time': x.time, 'var': v, 'value': x.value, 'qc': x.qc}))
    if not parts:
        return None, None
    L = pd.concat(parts, ignore_index=True)
    st = S.rename(columns={'latitude': 'lat', 'longitude': 'lon', 'elevation_m': 'elev'}); st['pid'] = 'aws:' + st.station.astype(str); st['zone'] = None; st['net'] = 'aws'
    return L, st[['pid', 'lat', 'lon', 'elev', 'zone', 'net']].drop_duplicates('pid')


def archive_verdict(F, L, app=None):
    """apply the archive rule to obsqc.mjs's flags F (needs time_obs) of the archive's values L (pid, time, var, value, qc).
    qc empty: obsqc's sentinel / gross-range / internal (and owner-mark) verdicts drop the value, its series verdicts (stuck / flat,
    spike) are kept for information (own_test) and the value passes; spike / flat: dropped when obsqc fails it on any test, else passes.
    Returns F with pass / test changed for aws: rows and own_pass / own_test / archive_qc added; plus the dropped-by-flag counts."""
    drop, confirm, always = archive_rule(app)
    F = F.copy(); F['own_pass'] = F['pass']; F['own_test'] = F['test']; F['archive_qc'] = ''
    q = L[L.qc != ''][['pid', 'time', 'var', 'qc']].copy(); q['time_obs'] = q.time.dt.strftime('%Y-%m-%dT%H:%MZ')
    if 'time_obs' in F.columns and len(q):
        F = F.merge(q[['pid', 'var', 'time_obs', 'qc']].drop_duplicates(['pid', 'var', 'time_obs']), on=['pid', 'var', 'time_obs'], how='left')
        F['archive_qc'] = F.pop('qc').fillna('')
    aws = F.pid.astype(str).str.startswith('aws:')
    conf = aws & F.archive_qc.isin(confirm)
    keep = aws & ~conf & ~F.own_test.isin(always)                         # qc empty: pass unless a deterministic technical check failed it
    F.loc[keep, 'pass'] = 1; F.loc[keep, 'test'] = ''
    F.loc[conf & (F.own_pass == 0), 'test'] = 'archive-' + F.loc[conf & (F.own_pass == 0), 'archive_qc'] + '+' + F.loc[conf & (F.own_pass == 0), 'own_test']
    dropped = L[L.qc.isin(drop)].groupby(['var', 'qc']).size()
    F.attrs['archiveDropped'] = {k[0] + ':' + k[1]: int(n) for k, n in dropped.items()}
    return F


def load_ews_archive(archive, app=None, t_from=None, t_to=None):
    """the curated EWS archive judged: obsqc.mjs (EWS network setting) then the archive rule (archive_verdict)"""
    app = app_dir(app); t0 = pd.Timestamp(t_from, tz='UTC'); t1 = pd.Timestamp(t_to, tz='UTC')
    L, st = _read_ews_archive(archive, t0, t1, archive_rule(app)[0])
    if L is None:
        return pd.DataFrame(columns=['pid', 'time_utc', 'var', 'value', 'pass', 'test', 'size'])
    o = L.pivot_table(index=['pid', 'time'], columns='var', values='value', aggfunc='first').reset_index()
    return archive_verdict(qc_frame(o, st, app), L, app)


def load_truth(lamha, app=None, t_from=None, t_to=None, sources=('mach', 'aws_hourly', 'synop', 'metar', 'ews'), ews_archive=None):
    """every source judged together (they are each other's buddies). LAMHA is read only. ews_archive: the curated EWS archive folder;
    when given it replaces LAMHA's raw EWS copy and the archive rule is applied (archive_verdict)."""
    app = app_dir(app); t0 = pd.Timestamp(t_from, tz='UTC'); t1 = pd.Timestamp(t_to, tz='UTC')
    if ews_archive:
        L, st_a = _read_ews_archive(ews_archive, t0, t1, archive_rule(app)[0])
        sources = tuple(k for k in sources if k != 'ews')
    reg = json.load(open(os.path.join(app, 'data', 'mach-fleet-stations.json'), encoding='utf-8'))['stations']
    readers = {'mach': lambda: _read_mach(lamha, t0, t1, reg), 'aws_hourly': lambda: _read_aws_hourly(lamha, t0, t1), 'synop': lambda: _read_synop(lamha, t0, t1),
               'metar': lambda: _read_metar(lamha, t0, t1), 'ews': lambda: _read_ews(lamha, t0, t1)}
    O, S = [], []
    for k in sources:
        o, s = readers[k]()
        if o is not None and len(o):
            O.append(o); S.append(s)
    if ews_archive and L is not None:
        O.append(L.pivot_table(index=['pid', 'time'], columns='var', values='value', aggfunc='first').reset_index()); S.append(st_a)
    if not O:
        return pd.DataFrame(columns=['pid', 'time_utc', 'var', 'value', 'pass', 'test', 'size'])
    F = qc_frame(pd.concat(O, ignore_index=True), pd.concat(S, ignore_index=True).drop_duplicates('pid'), app)
    return archive_verdict(F, L, app) if ews_archive and L is not None else F


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='judge observation truth with obsqc.mjs')
    ap.add_argument('--table', help='national training table parquet (pid, t, obs, lat, lon, elev, zone, temperature_2m)')
    ap.add_argument('--lamha', help='LAMHA data folder (read only)')
    ap.add_argument('--from', dest='t_from'); ap.add_argument('--to', dest='t_to')
    ap.add_argument('--ews-archive', dest='ews_archive', help='the curated EWS archive folder (D:\\NIGRAAN\\inputs\\met_parquet\\pmd_ews), read only')
    ap.add_argument('--app', default=None); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    if a.table:
        F = qc_table(a.table, a.app)
    elif a.lamha:
        F = load_truth(a.lamha, a.app, a.t_from, a.t_to, ews_archive=a.ews_archive)
    else:
        F = load_ews_archive(a.ews_archive, a.app, a.t_from, a.t_to)
    F.to_parquet(a.out, index=False) if a.out.endswith('.parquet') else F.to_csv(a.out, index=False)
    print(json.dumps({'rows': int(len(F)), 'failing': int((F['pass'] == 0).sum()), 'tests': F.loc[F['pass'] == 0, 'test'].value_counts().to_dict()}))
