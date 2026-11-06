"""v91.17.283.40 · C6-C9 re-run on the WIDENED observation set (owner request 31 Oct 2026). Rules: C_RULES_20261031.json unchanged
(thresholds, pass rules); the widening and the C9 duration / area procedure are its dated amendment of 31 Oct 09:02 PKT, written before
this run. Truth from the single observation folder D:\\NIGRAAN\\obs_all (built by _admin\\obs_all\\COPY_OBS_ALL.bat; its met_parquet copy).
usage: python -I ctests40w.py --tree <nigraan tree> --obs <obs_all\\met_parquet (or inputs\\met_parquet)> --prevA <prev dir with ecmwf_ifs025/A>
          --prevB <prev dir with <model>/B> --points <points.csv> --synop12 <synop_ogimet_all.parquet> --out <json>"""
import os, sys, json, glob, argparse, datetime as dt
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
for k, d in (('tree', None), ('obs', r'D:\NIGRAAN\obs_all'), ('prevA', None), ('prevB', None), ('points', None), ('synop12', None), ('out', None), ('gustModel', 'gfs_seamless')):
    ap.add_argument('--' + k, default=d, required=d is None and k not in ('synop12',))
A = ap.parse_args()
def OBS(*parts):
    """a table by its own name under the observation root: works on D:\\NIGRAAN\\obs_all (<source>\\met_parquet\\...) and on inputs\\met_parquet"""
    name = parts[-1]; hit = sorted(glob.glob(os.path.join(A.obs, '**', name), recursive=True))
    hit = [h for h in hit if 'met_parquet' in h] or hit
    if not hit: raise FileNotFoundError(name + ' not under ' + A.obs)
    return hit[0]
RULES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'C_RULES_20261031.json')))
RNG = np.random.default_rng(40); B = 1000; PKT = pd.Timedelta(hours=5); S1 = pd.Timedelta(seconds=1)
rnd = lambda x, n=3: None if x is None or not np.isfinite(x) else round(float(x), n)


def categorical(D, fcol, ocol, thr):
    D = D.dropna(subset=[fcol, ocol])
    if not len(D): return {'events': 0, 'verdict': 'INCONCLUSIVE', 'why': 'no paired station-days'}
    F = (D[fcol] >= thr).values; O = (D[ocol] >= thr).values
    h, m, fa, cn = int((F & O).sum()), int((~F & O).sum()), int((F & ~O).sum()), int((~F & ~O).sum())
    pod = h / (h + m) if h + m else None; far = fa / (h + fa) if h + fa else None; pofd = fa / (fa + cn) if fa + cn else None
    S = {'events': h + m, 'hits': h, 'misses': m, 'falseAlarms': fa, 'pod': rnd(pod), 'far': rnd(far), 'pss': rnd(pod - pofd) if pod is not None and pofd is not None else None,
         'stationDays': int(len(D)), 'stations': int(D.pid.nunique())}
    ud, inv = np.unique(D.day.values, return_inverse=True)
    Hh, Mm, FA, CN = (np.bincount(inv, w, len(ud)) for w in (F & O, ~F & O, F & ~O, ~F & ~O)); ps = []
    for _ in range(B):
        k = RNG.integers(0, len(ud), len(ud)); a, b_, c, d = Hh[k].sum(), Mm[k].sum(), FA[k].sum(), CN[k].sum()
        if a + b_ and c + d: ps.append(a / (a + b_) - c / (c + d))
    S['pssCI95'] = [rnd(np.percentile(ps, 2.5)), rnd(np.percentile(ps, 97.5))] if ps else None
    y = S['stationDays'] / 365.25; S['perStationYear'] = {'falseAlarms': rnd(fa / y, 2), 'misses': rnd(m / y, 2)}
    if S['events'] < 20: S['verdict'], S['why'] = 'INCONCLUSIVE', 'fewer than 20 observed events'
    else:
        ok = pod >= 0.5 and far is not None and far <= 0.5 and S['pssCI95'] and S['pssCI95'][0] > 0
        S['verdict'] = 'PASS' if ok else 'FAIL'
    return S


# ------------------------------------------------------------------ places
def zones(P):
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree
    G = json.load(open(os.path.join(A.tree, 'data/pk-tehsils.json'))); Z = json.load(open(os.path.join(A.tree, 'data/model-zone.json')))['units']
    g = [shape(f['geometry']) for f in G['features']]; u = [f['properties']['uid'] for f in G['features']]; T = STRtree(g); out = {}
    for r in P.itertuples():
        pt = Point(r.lon, r.lat); hit = [i for i in T.query(pt) if g[i].covers(pt)]; uid = u[hit[0]] if hit else None; z = Z.get(uid) if uid else None
        out[r.pid] = (uid, (z.get('zone') if isinstance(z, dict) else z) if z else None)
    return out


# ------------------------------------------------------------------ forecasts
def prev(dirn, model, group, cols, pids):
    fs = sorted(glob.glob(os.path.join(dirn, model, group, '*.parquet')))
    X = pd.concat([pd.read_parquet(f, columns=['pid', 'time'] + cols, filters=[('pid', 'in', [int(x) for x in pids])]) for f in fs], ignore_index=True)
    X['time'] = pd.to_datetime(X.time).astype('datetime64[ns]'); return X.drop_duplicates(['pid', 'time'])


def daily(X, cols, how, pkt):
    t = X.time + (PKT if pkt else pd.Timedelta(0)); day = (t - S1).dt.floor('D') if how == 'sum' else t.dt.floor('D')
    X = X.assign(day=day); g = X.groupby(['pid', 'day']); n = g.size().rename('n')
    D = pd.concat([g[c].sum(min_count=8) if how == 'sum' else g[c].max() for c in cols], axis=1).join(n).reset_index()
    return D[D.n == 8].drop(columns='n')


# ------------------------------------------------------------------ truth: rain (UTC day)
def rain_truth(P):
    out = []; inv = {}
    pa = P[P.src == 'pmd_aws']; pid = dict(zip(pa.sid.str.upper(), pa.pid))
    a = pd.read_parquet(OBS('pmd_aws', 'pmd_aws_10min_long'), filters=[('variable', '==', 'rain_day_total_mm')], columns=['station', 'time_utc', 'value', 'qc'])
    a['time_utc'] = pd.to_datetime(a.time_utc).astype('datetime64[ns]')
    a = a[a.time_utc >= '2024-01-01']; n0 = len(a)
    a = a[((a.qc.fillna(0).astype(int) & 1) == 0) & (a.value >= 0) & (a.value <= 500)]; inv['aws_values_dropped'] = int(n0 - len(a))
    a['day'] = a.time_utc.dt.floor('D'); g = a.groupby(['station', 'day']).agg(obs=('value', 'max'), last=('time_utc', 'max'), n=('value', 'size')).reset_index()
    g = g[(g['last'] - g['day'] >= pd.Timedelta(hours=23, minutes=30)) & (g.n >= 100)]; g['pid'] = g.station.astype(str).str.upper().map(pid)
    out.append(g.dropna(subset=['pid']).assign(net='official AWS')[['pid', 'day', 'obs', 'net']])
    e = pd.read_parquet(OBS('pmd_ews', 'ews_10min_rain_increment.parquet')); el = pd.read_parquet(OBS('pmd_ews', 'ews_elements.parquet'))
    e['time_utc'] = pd.to_datetime(e.time_utc).astype('datetime64[ns]'); e = e[e.time_utc >= '2024-01-01']; n0 = len(e)
    e = e[(e.qc.isna() | (e.qc.astype(str) == '')) & e.value.notna() & (e.value >= 0) & (e.value <= 50)]; inv['ews_values_dropped'] = int(n0 - len(e))
    e = e.merge(el[['element_id', 'station_id']], on='element_id'); e['day'] = (e.time_utc - S1).dt.floor('D')
    e = e.sort_values('source').drop_duplicates(['station_id', 'time_utc'])
    g = e.groupby(['station_id', 'day']).agg(obs=('value', 'sum'), n=('value', 'size')).reset_index(); g = g[g.n >= 132]
    pe = P[P.src == 'ews_gb']; pid2 = dict(zip(pe.sid.astype(str), pe.pid)); g['pid'] = g.station_id.astype('Int64').astype(str).map(pid2)
    out.append(g.dropna(subset=['pid']).assign(net='mountain network')[['pid', 'day', 'obs', 'net']])
    s = pd.read_parquet(OBS('pmd_synop', 'pmd_synop_hourly_meteostat_gts'), columns=['station_id', 'time_utc', 'rain_mm'])
    s['time_utc'] = pd.to_datetime(s.time_utc).astype('datetime64[ns]'); s = s[(s.time_utc >= '2024-01-01')]
    s = s[s.rain_mm.isna() | ((s.rain_mm >= 0) & (s.rain_mm <= 300))]; s['day'] = (s.time_utc - S1).dt.floor('D')
    g = s.groupby(['station_id', 'day']).agg(obs=('rain_mm', 'sum'), n=('rain_mm', 'count')).reset_index(); g = g[g.n >= 20]; g['src2'] = 'meteostat'
    if A.synop12:
        o = pd.read_parquet(A.synop12); o['t'] = pd.to_datetime(o.t).dt.tz_convert(None).astype('datetime64[ns]')
        o = o[(o.rain_h == 12) & o.rain_mm.notna() & o.t.dt.hour.isin([0, 12]) & (o.rain_mm <= 400)].drop_duplicates(['sid', 't']); o['day'] = (o.t - S1).dt.floor('D')
        o = o.groupby(['sid', 'day']).agg(obs=('rain_mm', 'sum'), n=('rain_mm', 'count')).reset_index(); o = o[o.n == 2].rename(columns={'sid': 'station_id'}); o['src2'] = 'ogimet'
        g = pd.concat([g, o]).sort_values('src2').drop_duplicates(['station_id', 'day'], keep='first')     # one synop source per station-day (meteostat first)
    ps = P[P.src == 'synop']; pid3 = dict(zip(ps.sid.astype(str), ps.pid)); g['pid'] = g.station_id.astype(str).map(pid3)
    out.append(g.dropna(subset=['pid']).assign(net='synop')[['pid', 'day', 'obs', 'net']])
    R = pd.concat(out, ignore_index=True); R['pid'] = R.pid.astype(int); R['day'] = R.day.astype('datetime64[ns]'); return R, inv


# ------------------------------------------------------------------ truth: gust (PKT day, km/h)
def gust_truth(P):
    out = []
    m = pd.read_parquet(OBS('mach', 'mach_hourly_clean_2023-2026.parquet'), columns=['station', 'hour_utc', 'gust_max_kmh'])
    m['t'] = pd.to_datetime(m.hour_utc).dt.tz_convert(None).astype('datetime64[ns]') + PKT; m = m[(m.gust_max_kmh >= 0) & (m.gust_max_kmh <= 250)]; m['day'] = m.t.dt.floor('D')
    g = m.groupby(['station', 'day']).agg(obs=('gust_max_kmh', 'max'), n=('gust_max_kmh', 'size')).reset_index(); g = g[g.n >= 20]
    pm = P[P.src == 'mach']; g['pid'] = g.station.astype(str).map(dict(zip(pm.sid.astype(str), pm.pid)))
    out.append(g.dropna(subset=['pid']).assign(net='MACH')[['pid', 'day', 'obs', 'net']])
    e = pd.read_parquet(OBS('pmd_ews', 'ews_10min_wind_gust_speed.parquet')); el = pd.read_parquet(OBS('pmd_ews', 'ews_elements.parquet'))
    e = e[(e.qc.isna() | (e.qc.astype(str) == '')) & e.value.notna()]; e['kmh'] = e.value * 3.6; e = e[e.kmh <= 250]
    e = e.merge(el[['element_id', 'station_id']], on='element_id'); e['t'] = pd.to_datetime(e.time_utc).astype('datetime64[ns]') + PKT; e['day'] = e.t.dt.floor('D')
    g = e.groupby(['station_id', 'day']).agg(obs=('kmh', 'max'), n=('kmh', 'size')).reset_index(); g = g[g.n >= 132]
    pe = P[P.src == 'ews_gb']; g['pid'] = g.station_id.astype('Int64').astype(str).map(dict(zip(pe.sid.astype(str), pe.pid)))
    out.append(g.dropna(subset=['pid']).assign(net='mountain network')[['pid', 'day', 'obs', 'net']])
    R = pd.concat(out, ignore_index=True); R['pid'] = R.pid.astype(int); return R


# ------------------------------------------------------------------ truth: temperature + dew point at the forecast steps
def heat_index(t, td):
    """NWS heat index (Rothfusz 1990 with the NWS adjustments), deg C in/out"""
    T = t * 9 / 5 + 32; rh = 100 * np.exp(17.625 * td / (243.04 + td)) / np.exp(17.625 * t / (243.04 + t))
    s = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + rh * 0.094)
    r = -42.379 + 2.04901523 * T + 10.14333127 * rh - .22475541 * T * rh - .00683783 * T * T - .05481717 * rh * rh + .00122874 * T * T * rh + .00085282 * T * rh * rh - .00000199 * T * T * rh * rh
    r = np.where((rh < 13) & (T >= 80) & (T <= 112), r - ((13 - rh) / 4) * np.sqrt(np.clip(17 - np.abs(T - 95.), 0, None) / 17), r)
    r = np.where((rh > 85) & (T >= 80) & (T <= 87), r + ((rh - 85) / 10) * ((87 - T) / 5), r)
    hi = np.where((s + T) / 2 < 80, s, r); return (hi - 32) * 5 / 9


def temp_truth(P):
    out = []
    m = pd.read_parquet(OBS('mach', 'mach_hourly_clean_2023-2026.parquet'), columns=['station', 'hour_utc', 'temp_c', 'dewpoint_c', 'qc'])
    m = m[m.qc.isna() | ~m.qc.astype(str).str.contains('hampel|stuck|td_above', regex=True)]   # per-value QC tags of the source
    m['time'] = pd.to_datetime(m.hour_utc).dt.tz_convert(None).astype('datetime64[ns]'); pm = P[P.src == 'mach']; m['pid'] = m.station.astype(str).map(dict(zip(pm.sid.astype(str), pm.pid)))
    out.append(m.dropna(subset=['pid', 'temp_c', 'dewpoint_c'])[['pid', 'time', 'temp_c', 'dewpoint_c']].assign(net='MACH'))
    s = pd.read_parquet(OBS('pmd_synop', 'pmd_synop_hourly_meteostat_gts'), columns=['station_id', 'time_utc', 'temp_c_screened', 'dewpoint_c', 'temp_qc_tag'])
    s = s[(s.temp_qc_tag.astype(str) == 'ok')]; s['time'] = pd.to_datetime(s.time_utc).astype('datetime64[ns]'); ps = P[P.src == 'synop']
    s['pid'] = s.station_id.astype(str).map(dict(zip(ps.sid.astype(str), ps.pid)))
    out.append(s.dropna(subset=['pid', 'temp_c_screened', 'dewpoint_c']).rename(columns={'temp_c_screened': 'temp_c'})[['pid', 'time', 'temp_c', 'dewpoint_c']].assign(net='synop'))
    R = pd.concat(out, ignore_index=True); R = R[(R.time >= '2024-01-01') & (R.dewpoint_c <= R.temp_c + 0.5) & R.temp_c.between(-45, 55)]; R['pid'] = R.pid.astype(int); return R


def main():
    P = pd.read_csv(A.points); Z = zones(P); zone = lambda p: (Z.get(p) or (None, None))[1]; uid = lambda p: (Z.get(p) or (None, None))[0]
    R = {'built': 'v91.17.283.40', 'run': (dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(hours=5)).strftime('%Y-%m-%d %H:%M PKT'),
         'rules': 'C_RULES_20261031.json (amendment 31 Oct 09:02 PKT: observation set widened)', 'tests': {}}
    # ---- rain (C7, C8)
    Rt, inv = rain_truth(P); R['rainTruth'] = {n: {'stations': int(g.pid.nunique()), 'stationDays': int(len(g)), 'from': str(g.day.min())[:10], 'to': str(g.day.max())[:10],
                                                   'daysGE50': int((g.obs >= 50).sum()), 'daysGE100': int((g.obs >= 100).sum())} for n, g in Rt.groupby('net')}; R['rainTruth']['qc'] = inv
    Xr = prev(A.prevA, 'ecmwf_ifs025', 'A', ['precipitation_d%d' % k for k in (1, 2, 3)], Rt.pid.unique()); Fr = daily(Xr, ['precipitation_d%d' % k for k in (1, 2, 3)], 'sum', False); del Xr
    Dr = Rt.drop_duplicates(['pid', 'day']).merge(Fr, on=['pid', 'day']); Dr['zone'] = Dr.pid.map(zone)
    R['tests']['C8'] = {zn: {('lead%d' % k): categorical(Dr if zn == 'all' else Dr[Dr.zone == zn], 'precipitation_d%d' % k, 'obs', RULES['tests']['C8']['threshold_mm']) for k in (1, 2, 3)} for zn in ['coast', 'hills', 'mountain', 'plains', 'all']}
    c7 = {'dayAmounts': {n: {('lead%d' % k): categorical(Dr, 'precipitation_d%d' % k, 'obs', RULES['tests']['C7']['thresholds_mm'][n]) for k in (1, 2, 3)} for n in ['pr10', 'pr25', 'pr50', 'pr100']}}
    W = Dr.set_index(['pid', 'day'])[['obs', 'precipitation_d1', 'precipitation_d2', 'precipitation_d3']]
    d1 = W.reset_index(); d2 = d1.assign(day=d1.day - pd.Timedelta(days=1)); d3 = d1.assign(day=d1.day - pd.Timedelta(days=2))
    J = d1.merge(d2, on=['pid', 'day'], suffixes=('', '_2')).merge(d3, on=['pid', 'day'], suffixes=('', '_3'))
    J['f3'] = J.precipitation_d1 + J.precipitation_d2_2 + J.precipitation_d3_3; J['o3'] = J.obs + J.obs_2 + J.obs_3
    c7['rain3_75'] = categorical(J, 'f3', 'o3', RULES['tests']['C7']['thresholds_mm']['rain3_75'])
    R['tests']['C7'] = c7
    # ---- gust (C6)
    Gt = gust_truth(P); m = A.gustModel
    Xg = prev(A.prevB, m, 'B', ['wind_gusts_10m_d%d' % k for k in (1, 2, 3)], Gt.pid.unique()); Fg = daily(Xg, ['wind_gusts_10m_d%d' % k for k in (1, 2, 3)], 'max', True); del Xg
    Dg = Gt.merge(Fg, on=['pid', 'day']); Dg['zone'] = Dg.pid.map(zone)
    R['tests']['C6'] = {'model': m, 'gustTruth': {n: {'stations': int(g.pid.nunique()), 'stationDays': int(len(g)), 'from': str(g.day.min())[:10], 'to': str(g.day.max())[:10], 'daysGE62': int((g.obs >= 62).sum())} for n, g in Gt.groupby('net')},
                        'byZone': {zn: {nm: {('lead%d' % k): categorical(Dg if zn == 'all' else Dg[Dg.zone == zn], 'wind_gusts_10m_d%d' % k, 'obs', thr) for k in (1, 2, 3)} for nm, thr in RULES['tests']['C6']['thresholds_kmh'].items()} for zn in ['plains', 'hills', 'coast', 'mountain', 'all']},
                        'mountainTehsilsWithGustTruth': sorted({uid(p) for p in Dg.pid.unique() if zone(p) == 'mountain'} - {None})}
    # ---- heat (C9)
    Tt = temp_truth(P); Xt = prev(A.prevA, 'ecmwf_ifs025', 'A', ['temperature_2m_d%d' % k for k in (1, 2, 3)] + ['dew_point_2m_d%d' % k for k in (1, 2, 3)], Tt.pid.unique())
    H = Tt.drop_duplicates(['pid', 'time']).merge(Xt, on=['pid', 'time']); del Xt
    H['hiO'] = heat_index(H.temp_c.values, H.dewpoint_c.values)
    for k in (1, 2, 3): H['hiF%d' % k] = heat_index(H['temperature_2m_d%d' % k].values, H['dew_point_2m_d%d' % k].values)
    H['day'] = (H.time + PKT).dt.floor('D'); c9 = {'truth': {n: {'stations': int(g.pid.nunique()), 'steps': int(len(g))} for n, g in H.groupby('net')}}
    for band, thr in (('danger41', 41.0), ('extremeCaution32', 32.0)):
        agg = {'oN': ('hiO', lambda s: int((s >= thr).sum())), 'oMax': ('hiO', 'max'), 'n': ('hiO', 'size')}
        for k in (1, 2, 3): agg['f%dN' % k] = ('hiF%d' % k, lambda s, t=thr: int((s >= t).sum())); agg['f%dMax' % k] = ('hiF%d' % k, 'max')
        D = H.groupby(['pid', 'day']).agg(**agg).reset_index(); D = D[D.n == 8]
        c9[band] = {('lead%d' % k): {**categorical(D, 'f%dMax' % k, 'oMax', thr), 'durationHoursMAE': rnd(3 * (D['f%dN' % k] - D.oN).abs()[(D.oN > 0) | (D['f%dN' % k] > 0)].mean(), 2),
                                     'durationHoursBias': rnd(3 * (D['f%dN' % k] - D.oN)[(D.oN > 0) | (D['f%dN' % k] > 0)].mean(), 2)} for k in (1, 2, 3)}
    # area rule: tehsils with >= 3 stations
    D = H.groupby(['pid', 'day']).agg(oMax=('hiO', 'max'), f1=('hiF1', 'max'), n=('hiO', 'size')).reset_index(); D = D[D.n == 8]; D['uid'] = D.pid.map(uid)
    bands = [27, 32, 41, 54]; lvl = lambda v: np.searchsorted(bands, v, side='right')
    rows = []
    for (u, d), g in D.groupby(['uid', 'day']):
        if len(g) < 3: continue
        q = lambda v: int(np.sort(lvl(v.values))[::-1][max(0, int(np.ceil(0.25 * len(v))) - 1)])   # the band reached by >= 25 % of the stations
        rows.append({'uid': u, 'day': d, 'obs': q(g.oMax), 'fc': q(g.f1), 'stations': len(g)})
    AR = pd.DataFrame(rows); area = {'tehsilDaysWith3Stations': int(len(AR)), 'tehsils': int(AR.uid.nunique()) if len(AR) else 0}
    if len(AR):
        S = AR[(AR.obs >= 2) | (AR.fc >= 2)]; area['daysExtremeCautionOrMore'] = int(len(S))
        if len(S) >= 30:
            ag = (S.obs == S.fc).values; bs = [ag[RNG.integers(0, len(ag), len(ag))].mean() for _ in range(B)]
            area.update({'agreement': rnd(ag.mean()), 'agreementCI95': [rnd(np.percentile(bs, 2.5)), rnd(np.percentile(bs, 97.5))]})
            area['verdict'] = 'PASS' if ag.mean() >= 0.8 and np.percentile(bs, 2.5) >= 0.7 else 'FAIL'
        else: area['verdict'] = 'INCONCLUSIVE'; area['why'] = 'fewer than 30 tehsil-days at Extreme Caution or more'
    c9['areaRule25pct'] = area; R['tests']['C9'] = c9
    json.dump(R, open(A.out, 'w'), indent=1, default=str); return R


if __name__ == '__main__':
    R = main()
    def show(x, p=''):
        if isinstance(x, dict) and 'verdict' in x: print(p, x['verdict'], {k: x.get(k) for k in ('events', 'pod', 'far', 'pss', 'pssCI95', 'stations', 'durationHoursMAE', 'agreement', 'tehsilDaysWith3Stations', 'why')}); return
        if isinstance(x, dict):
            for k, v in x.items(): show(v, p + '/' + k)
        else: print(p, x)
    print(json.dumps(R['rainTruth'])); show(R['tests'])
