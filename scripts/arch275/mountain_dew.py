"""v91.17.275 ARCH task 3 - the mountain dew point check (GRID v274 finding: since 13 Oct the served dew point at gilgit / danyore / khaplu
is worse than the raw provider dew point, 3.64 -> 5.89 C). Extended to every fleet pair since 23 Sep and to the synoptic mountain stations.

Three dew points are compared against the measured one (all read only, nothing fetched):
  served   what NIGRAAN served: the national dew point model (data/moist-model.json dew.zones.mountain.applied = true)
  raw      the provider's own dew point (best_match; the model's input T0 dew point)
  off      what NIGRAAN WOULD serve with the mountain zone switched off in moist-model.json (the data switch): server/api/verification.mjs
           then runs the earlier steps - inside 34.7-36.9 N / 71.4-76.6 E / 1000-5000 m the valley humidity model (humwind-model.json,
           RH replaced, dew point from the served temperature and that RH), elsewhere the raw dew point at the served temperature.
           Evaluated with the server's own tree code (scripts/arch275/humwind_rh.mjs).
Sources
  fleet    station-lake fleet_pairs_2026-09/10 (the server's own served and raw point values at each MACH station, shortest lead), MACH
           readings stuck-screened (scripts/arch275/common.py = the v274 GRID readers), mountain zone by the data/model-zone.json rule.
  synop    WMO synoptic mountain stations (synop_ogimet_all.parquet + synop_2026-10.jsonl); raw = ds2 wx/served (the provider's day-0
           historical forecast at the station height = the moist model's own T0 basis); served temperature at the station = synop
           served_c where held; served DEW at a synop station is not archived by NIGRAAN, so the served side there is the served tehsil
           archive (nearest mountain tehsil centre <= 25 km, served height within 300 m, latest issue before the hour) - a different
           lead and place, reported as such.
Gate ("worse beyond doubt"): the 90 % interval of the MAE difference (served - comparator), resampling whole days, is above 0 in the
held-out recent window (since 13 Oct) AND over the whole period, and no network says the opposite beyond doubt.
Out: scripts/arch275/out/mountain_dew.json"""
import os, sys, json, glob, gzip, math, subprocess
import numpy as np, pandas as pd
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

OUT = os.path.join(C.HERE, 'out'); os.makedirs(OUT, exist_ok=True)
UP = C.UP; LAKE = UP + '/NIGRAAN/nig/station-lake/archive'; DS2 = UP + '/NIGRAAN/nig/ds2/out'
rng = np.random.default_rng(2753)
T13 = pd.Timestamp('2026-10-13', tz='UTC'); T23 = pd.Timestamp('2026-09-23', tz='UTC')


def dew(T, RH):
    RH = np.clip(np.asarray(RH, float), 1, 100); T = np.asarray(T, float); g = np.log(RH / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g)


def humwind(el, la, lo, ts, rh):
    rows = [[float(e), float(a), float(o), int(t.hour), int(t.month), None if not np.isfinite(r) else float(r)] for e, a, o, t, r in zip(el, la, lo, ts, rh)]
    r = subprocess.run(['node', os.path.join(C.HERE, 'humwind_rh.mjs')], input=json.dumps(rows), capture_output=True, text=True, check=True)
    return np.array([np.nan if v is None else v for v in json.loads(r.stdout)], float)


def comp(d, a, b, key='key', day='day', n=2000):
    """MAE of a and b (errors), difference b - a (positive = b worse), 90 % by whole days and by stations"""
    d = d.dropna(subset=[a, b])
    if len(d) < 10: return None
    ea, eb = d[a].abs().values, d[b].abs().values; diff = eb - ea
    days = d[day].values; ud = np.unique(days); ix = {x: np.where(days == x)[0] for x in ud}
    bs = [diff[np.concatenate([ix[x] for x in rng.choice(ud, len(ud))])].mean() for _ in range(n)]
    st = d.groupby(key).apply(lambda s: pd.Series({'a': s[a].abs().mean(), 'b': s[b].abs().mean(), 'n': len(s)}))
    sd = (st.b - st.a).values
    sb = [sd[rng.integers(0, len(sd), len(sd))].mean() for _ in range(n)] if len(sd) > 1 else [np.nan]
    return {'pairs': int(len(d)), 'days': int(len(ud)), 'stations': int(len(st)), 'maeA': round(float(ea.mean()), 2), 'maeB': round(float(eb.mean()), 2),
            'biasA': round(float(d[a].mean()), 2), 'biasB': round(float(d[b].mean()), 2), 'diff': round(float(diff.mean()), 2),
            'diff90days': [round(float(np.quantile(bs, .05)), 2), round(float(np.quantile(bs, .95)), 2)],
            'diff90stations': [round(float(np.nanquantile(sb, .05)), 2), round(float(np.nanquantile(sb, .95)), 2)] if len(sd) > 1 else None,
            'stationsWorse': int((sd > 0).sum()), 'perStation': {k: [round(v.a, 2), round(v.b, 2), int(v.n)] for k, v in st.iterrows()}}


res = {'method': __doc__.split('Gate')[0].strip(), 'gate': 'worse beyond doubt = 90 % interval (whole days) of the MAE difference above 0 since 13 Oct AND over 23 Sep - 15 Oct, no network contradicting beyond doubt'}

# ── A · fleet pairs (every mountain pair since 23 Sep) ──
obs = C.mach_obs()
ok_ms = set(zip(obs[obs.ok].key, (obs[obs.ok].ms // 60000).astype('int64'))); bad_ms = set(zip(obs[~obs.ok].key, (obs[~obs.ok].ms // 60000).astype('int64')))
P = pd.concat([pd.read_csv(C.LAKE_FLEET + '/fleet_pairs_2026-09.csv'), pd.read_csv(C.LAKE_FLEET + '/fleet_pairs_2026-10.csv')], ignore_index=True)
P['ots'] = pd.to_datetime(P.obs_utc, format='ISO8601', utc=True); P['mn'] = ((P.ots - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() // 60).astype('int64')
P['hts'] = pd.to_datetime(P.hour_utc.str.replace('Z', ''), utc=True)
P = P[~P.key.isin(C.excluded())]
P['screen'] = [('bad' if (k, m) in bad_ms else ('ok' if (k, m) in ok_ms else 'unseen')) for k, m in zip(P.key, P.mn)]
P = P[P.screen != 'bad'].sort_values('lead_h').drop_duplicates(['key', 'hour_utc'])
zc = {k: C.zone(la, lo, el) for k, la, lo, el in P[['key', 'lat', 'lon', 'model_elev_m']].drop_duplicates('key').itertuples(index=False)}
P['zone'] = P.key.map(zc)
M = P[(P.zone == 'mountain') & P.fc_served_rh_pct.notna() & P.rh_pct.notna() & (P.hts >= T23)].copy()
M['td_obs'] = M.dew_c.where(M.dew_c.notna(), dew(M.temp_c, M.rh_pct))
M['td_srv'] = dew(M.fc_served_c, M.fc_served_rh_pct); M['td_raw'] = dew(M.fc_raw_c, M.fc_rh_pct)
hw = humwind(M.model_elev_m, M.lat, M.lon, M.hts, M.fc_rh_pct.astype(float))
M['td_off'] = np.where(np.isfinite(hw), dew(M.fc_served_c, hw), np.minimum(M.td_raw, M.fc_served_c))
M['day'] = (M.hts + pd.Timedelta(hours=5)).dt.strftime('%Y-%m-%d')
for c in ['srv', 'raw', 'off']: M['e_' + c] = M['td_' + c] - M.td_obs
M['applied'] = (M.td_srv - M.td_raw).abs() > 0.05
res['fleet'] = {'stations': sorted(M.key.unique().tolist()), 'pairs': int(len(M)), 'from': str(M.hts.min()), 'to': str(M.hts.max()),
                'servedDiffersFromRaw': round(float(M.applied.mean()), 3), 'byDayApplied': M.groupby('day').applied.mean().round(2).to_dict()}
for win, d in [('since13Oct', M[M.hts >= T13]), ('23Sep-15Oct', M)]:
    res['fleet'][win] = {'served_vs_raw': comp(d, 'e_raw', 'e_srv'), 'served_vs_off': comp(d, 'e_off', 'e_srv'), 'off_vs_raw': comp(d, 'e_raw', 'e_off')}
# by hour of day (where it goes wrong)
M['hpkt'] = (M.hts + pd.Timedelta(hours=5)).dt.hour
res['fleet']['byHourPKT'] = M.groupby(M.hpkt // 3 * 3).agg(n=('e_srv', 'size'), srv=('e_srv', lambda x: x.abs().mean()), raw=('e_raw', lambda x: x.abs().mean()), bias_srv=('e_srv', 'mean'), bias_raw=('e_raw', 'mean')).round(2).to_dict('index')
res['fleet']['obsCheck'] = M.groupby('key').agg(rh_obs=('rh_pct', 'mean'), rh_raw=('fc_rh_pct', 'mean'), rh_srv=('fc_served_rh_pct', 'mean'), td_obs=('td_obs', 'mean'), t_obs=('temp_c', 'mean'), t_srv=('fc_served_c', 'mean'), el=('model_elev_m', 'first')).round(1).to_dict('index')

# ── B · synoptic mountain stations ──
smeta = json.load(open(UP + '/DATA LAKE/synop/stations.json'))
mt = {s: v for s, v in smeta.items() if C.zone(v['lat'], v['lon'], v.get('elevM')) == 'mountain'}
sy = [pd.read_parquet(LAKE + '/synop_ogimet/synop_ogimet_all.parquet')]
j = pd.DataFrame([json.loads(l) for l in open(LAKE + '/synop/synop_2026-10.jsonl')]); j['t'] = pd.to_datetime(j.t, utc=True); sy.append(j)
sy = pd.concat(sy, ignore_index=True); sy['sid'] = sy.sid.astype(str)
sy = sy[sy.sid.isin(mt) & sy.td_c.notna() & sy.t_c.notna() & (sy.t >= T23)].sort_values('t').drop_duplicates(['sid', 't'], keep='last')
pts = pd.read_csv(DS2 + '/points.csv'); loc = {str(r.sid): r.loc for r in pts[pts.set == 'synop'].itertuples()}
W = []
for sid in mt:
    if sid not in loc: continue
    for f in sorted(glob.glob(DS2 + '/wx/served/%s_2026*.parquet' % loc[sid])):
        w = pd.read_parquet(f, columns=['time', 'temperature_2m', 'dew_point_2m', 'relative_humidity_2m', 'elev_returned']); w['sid'] = sid; W.append(w)
W = pd.concat(W, ignore_index=True); W['time'] = pd.to_datetime(W.time, utc=True)
S = sy.merge(W, left_on=['sid', 't'], right_on=['sid', 'time'], how='inner')
S['lat'] = S.sid.map(lambda s: mt[s]['lat']); S['lon'] = S.sid.map(lambda s: mt[s]['lon']); S['el'] = S.sid.map(lambda s: mt[s]['elevM'])
S['name'] = S.sid.map(lambda s: mt[s]['name'])
S['Tsrv'] = S.served_c.where(S.served_c.notna(), S.temperature_2m) if 'served_c' in S else S.temperature_2m
hw = humwind(S.el, S.lat, S.lon, S.t, S.relative_humidity_2m.astype(float))
S['td_raw'] = S.dew_point_2m; S['td_off'] = np.where(np.isfinite(hw), dew(S.Tsrv, hw), np.minimum(S.dew_point_2m, S.Tsrv))
S['day'] = (S.t + pd.Timedelta(hours=5)).dt.strftime('%Y-%m-%d')
S['e_raw'] = S.td_raw - S.td_c; S['e_off'] = S.td_off - S.td_c
# the served tehsil dew point from the archive (nearest mountain tehsil, served height within 300 m)
FC = []
for f in sorted(glob.glob(os.path.join(C.APP, 'data', 'archive', 'forecast', 'fc_*.jsonl.gz'))):
    for l in gzip.open(f, 'rt'): FC.append(json.loads(l))
cen = {}
for r in FC: cen.setdefault(r['u'], (r['lat'], r['lon'], r.get('z'), r.get('sel') or r.get('el')))
ser = {}
for r in FC:
    b = pd.Timestamp(r['base']).value // 3_600_000_000_000; iss = pd.Timestamp(r['iss']).value // 3_600_000_000_000
    for k in range(r['n']):
        h = b + k
        if h < iss or r['T'][k] is None or r['RH'][k] is None: continue
        p = ser.get((r['u'], h))
        if p is None or p[0] < iss: ser[(r['u'], h)] = (iss, r['T'][k] / 10, r['RH'][k], k)
tm = {}
for sid, v in mt.items():
    best = None
    for u, (la, lo, z, el) in cen.items():
        if z != 'mountain' or el is None: continue
        dk = math.hypot((la - v['lat']) * 111, (lo - v['lon']) * 111 * np.cos(np.radians(v['lat'])))
        if dk <= 25 and abs(el - v['elevM']) <= 300 and (best is None or dk < best[1]): best = (u, dk, el)
    if best: tm[sid] = best
th = ((S.t - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() // 3600).astype('int64')
x = [ser.get((tm[s][0], int(h))) if s in tm else None for s, h in zip(S.sid, th)]
S['td_teh'] = [dew(v[1], v[2]) if v else np.nan for v in x]; S['lead_teh'] = [v[3] if v else np.nan for v in x]
S['e_teh'] = S.td_teh - S.td_c
res['synop'] = {'stations': {s: mt[s]['name'] for s in sorted(S.sid.unique())}, 'pairs': int(len(S)), 'from': str(S.t.min()), 'to': str(S.t.max()),
                'tehsilMatch': {s: [mt[s]['name'], tm[s][0], round(tm[s][1], 1), tm[s][2], mt[s]['elevM']] for s in tm}}
for win, d in [('since13Oct', S[S.t >= T13]), ('23Sep-15Oct', S)]:
    res['synop'][win] = {'off_vs_raw': comp(d, 'e_raw', 'e_off', key='sid'), 'tehsilServed_vs_raw': comp(d, 'e_raw', 'e_teh', key='sid'), 'tehsilServed_vs_off': comp(d, 'e_off', 'e_teh', key='sid')}


def worse(c): return c is not None and c['diff90days'][0] > 0
def better(c): return c is not None and c['diff90days'][1] < 0


F13, FA = res['fleet']['since13Oct'], res['fleet']['23Sep-15Oct']
Y13, YA = res['synop']['since13Oct'], res['synop']['23Sep-15Oct']
fleet_worse_off = worse(F13['served_vs_off']) and worse(FA['served_vs_off'])
fleet_worse_raw = worse(F13['served_vs_raw']) and worse(FA['served_vs_raw'])
synop_contra = better(YA['tehsilServed_vs_off']) or better(YA['tehsilServed_vs_raw'])
res['decision'] = {'fleetServedWorseThanOffBeyondDoubt': fleet_worse_off, 'fleetServedWorseThanRawBeyondDoubt': fleet_worse_raw,
                   'synopContradicts': synop_contra, 'switch': bool(fleet_worse_off and not synop_contra)}
json.dump(res, open(os.path.join(OUT, 'mountain_dew.json'), 'w'), indent=1, default=str)


def line(c):
    return '-' if not c else '%d st %d h %d d: %.2f -> %.2f (diff %+.2f, 90%% days %s, stations %s, worse at %d/%d)' % (c['stations'], c['pairs'], c['days'], c['maeA'], c['maeB'], c['diff'], c['diff90days'], c['diff90stations'], c['stationsWorse'], c['stations'])


print('FLEET', res['fleet']['stations'], res['fleet']['pairs'], 'served differs from raw share', res['fleet']['servedDiffersFromRaw'])
for w in ['since13Oct', '23Sep-15Oct']:
    for k in ['served_vs_raw', 'served_vs_off', 'off_vs_raw']: print(' ', w, k, line(res['fleet'][w][k]))
    print('   per station served_vs_raw', res['fleet'][w]['served_vs_raw']['perStation'] if res['fleet'][w]['served_vs_raw'] else '')
print('SYNOP', res['synop']['stations'], res['synop']['pairs'], res['synop']['tehsilMatch'])
for w in ['since13Oct', '23Sep-15Oct']:
    for k in ['off_vs_raw', 'tehsilServed_vs_raw', 'tehsilServed_vs_off']: print(' ', w, k, line(res['synop'][w][k]))
    c = res['synop'][w]['off_vs_raw']; print('   per station off_vs_raw', c['perStation'] if c else '')
print('obsCheck', json.dumps(res['fleet']['obsCheck']))
print('byHour', json.dumps(res['fleet']['byHourPKT']))
print('DECISION', res['decision'])
