"""v91.17.283.40 · C6-C10 (launch final list, C-after-retrain). Re-runnable; the rules are C_RULES_20261031.json (written before any result).
usage: python -I ctests40.py --tree <nigraan tree> --prev <fc_archive/prev dir> --points <points.csv> --mach <mach_history_clean_hourly.csv.gz>
         --synop <synop_ogimet_all.parquet> --gb <dir with gb rain_cumulative parquet files> --out <results json>
The result file carries the run date (PKT); run it again after the 1 Nov retrain with the same arguments."""
import sys, os, json, glob, argparse, datetime as dt
import numpy as np, pandas as pd
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

ap = argparse.ArgumentParser()
for k in ('tree', 'prev', 'points', 'mach', 'synop', 'gb', 'out'): ap.add_argument('--' + k, required=True)
A = ap.parse_args()
RULES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'C_RULES_20261031.json')))
RNG = np.random.default_rng(40); B = 1000
PKT = pd.Timedelta(hours=5)


# ---------------------------------------------------------------- places: point -> tehsil -> zone
def zones_of(points):
    G = json.load(open(os.path.join(A.tree, 'data/pk-tehsils.json')))
    Z = json.load(open(os.path.join(A.tree, 'data/model-zone.json')))['units']
    geoms = [shape(f['geometry']) for f in G['features']]; uids = [f['properties']['uid'] for f in G['features']]
    T = STRtree(geoms); out = {}
    for r in points.itertuples():
        p = Point(r.lon, r.lat); hit = [i for i in T.query(p) if geoms[i].covers(p)]
        uid = uids[hit[0]] if hit else None; z = Z.get(uid) if uid else None
        out[r.pid] = {'uid': uid, 'zone': (z.get('zone') if isinstance(z, dict) else z) if z else None}
    return out


# ---------------------------------------------------------------- scores
def table(f, o):
    f, o = np.asarray(f, bool), np.asarray(o, bool)
    h = int((f & o).sum()); m = int((~f & o).sum()); fa = int((f & ~o).sum()); cn = int((~f & ~o).sum()); return h, m, fa, cn


def sc(h, m, fa, cn):
    pod = h / (h + m) if h + m else None; far = fa / (h + fa) if h + fa else None
    pofd = fa / (fa + cn) if fa + cn else None; csi = h / (h + m + fa) if h + m + fa else None
    return {'hits': h, 'misses': m, 'falseAlarms': fa, 'correctNegatives': cn, 'events': h + m, 'pod': rnd(pod), 'far': rnd(far), 'csi': rnd(csi),
            'pss': rnd(pod - pofd) if pod is not None and pofd is not None else None}


def rnd(x, n=3): return None if x is None or not np.isfinite(x) else round(float(x), n)


def categorical(D, fcol, ocol, thr):
    """D: rows with day, fcol, ocol. Day-block bootstrap of PSS."""
    D = D.dropna(subset=[fcol, ocol])
    if not len(D): return {'events': 0, 'verdict': 'INCONCLUSIVE', 'why': 'no paired station-days'}
    F = (D[fcol] >= thr).values; O = (D[ocol] >= thr).values; S = sc(*table(F, O))
    days = D['day'].values; ud, inv = np.unique(days, return_inverse=True)
    # per-day counts for a fast bootstrap
    H = np.bincount(inv, F & O, len(ud)); M_ = np.bincount(inv, ~F & O, len(ud)); FA = np.bincount(inv, F & ~O, len(ud)); CN = np.bincount(inv, ~F & ~O, len(ud))
    pss = []
    for _ in range(B):
        k = RNG.integers(0, len(ud), len(ud)); h, m, fa, cn = H[k].sum(), M_[k].sum(), FA[k].sum(), CN[k].sum()
        if h + m and fa + cn: pss.append(h / (h + m) - fa / (fa + cn))
    S['pssCI95'] = [rnd(np.percentile(pss, 2.5)), rnd(np.percentile(pss, 97.5))] if pss else None
    S['stationDays'] = int(len(D)); S['stations'] = int(D['pid'].nunique()); S['days'] = int(len(ud))
    if S['events'] < 20: S['verdict'] = 'INCONCLUSIVE'; S['why'] = 'fewer than 20 observed events'
    else:
        ok = S['pod'] >= 0.5 and S['far'] is not None and S['far'] <= 0.5 and S['pssCI95'] and S['pssCI95'][0] > 0
        S['verdict'] = 'PASS' if ok else 'FAIL'
        if not ok: S['why'] = '; '.join(x for x in [('POD %.2f < 0.5' % S['pod']) if S['pod'] < 0.5 else '', ('FAR %.2f > 0.5' % S['far']) if S['far'] is not None and S['far'] > 0.5 else '', ('PSS lower bound %.2f <= 0' % S['pssCI95'][0]) if S['pssCI95'] and S['pssCI95'][0] <= 0 else ''] if x)
    # client consequences: per station-year
    yrs = S['stationDays'] / 365.25
    S['perStationYear'] = {'falseAlarms': rnd(S['falseAlarms'] / yrs, 2), 'misses': rnd(S['misses'] / yrs, 2), 'hits': rnd(S['hits'] / yrs, 2)} if yrs > 0 else None
    return S


# ---------------------------------------------------------------- forecasts
def prev(group, var, pids=None):
    fs = sorted(glob.glob(os.path.join(A.prev, 'ecmwf_ifs025', group, '*.parquet')))
    cols = ['pid', 'time'] + ['%s_d%d' % (var, k) for k in (0, 1, 2, 3)]
    flt = [('pid', 'in', [int(x) for x in pids])] if pids is not None else None
    X = pd.concat([pd.read_parquet(f, columns=cols, filters=flt) for f in fs], ignore_index=True)
    X['time'] = pd.to_datetime(X['time']); return X.drop_duplicates(['pid', 'time'])


def fc_daily(X, var, how, window):
    """window 'pkt': PKT calendar day (times as hour-ending 3-h steps); 'utc': UTC day. Needs all 8 steps of the day."""
    t = X['time'] - (PKT if window == 'pkt' else pd.Timedelta(0)) * -1 if False else X['time']
    if window == 'pkt': t = X['time'] + PKT
    end = t - pd.Timedelta(seconds=1)                 # an amount stamped 00:00 belongs to the day before (hour-ending)
    X = X.assign(day=end.dt.floor('D') if how == 'sum' else t.dt.floor('D'))
    agg = {'%s_d%d' % (var, k): how for k in (0, 1, 2, 3)}; cnt = X.groupby(['pid', 'day']).size().rename('n')
    gb = X.groupby(['pid', 'day'])
    D = pd.concat([gb[c].sum(min_count=8) if how == 'sum' else gb[c].max() for c in agg], axis=1).join(cnt).reset_index(); D = D[D.n == 8].drop(columns='n')
    return D


# ---------------------------------------------------------------- truth
def mach_gust(points):
    M = pd.read_csv(A.mach, usecols=['key', 'hour_utc', 'gust_max_kmh'])
    M['t'] = pd.to_datetime(M.hour_utc.str.replace('Z', ''), utc=False) + PKT; M['day'] = M.t.dt.floor('D')
    g = M.groupby(['key', 'day']).agg(obs=('gust_max_kmh', 'max'), n=('gust_max_kmh', 'count')).reset_index(); g = g[g.n >= 20]
    sid = dict(zip(points[points.src == 'mach'].sid, points[points.src == 'mach'].pid)); g['pid'] = g.key.map(sid)
    return g.dropna(subset=['pid']).astype({'pid': int})[['pid', 'day', 'obs']]


def synop_rain(points):
    S = pd.read_parquet(A.synop); S['t'] = pd.to_datetime(S.t).dt.tz_convert(None)
    S12 = S[(S.rain_h == 12) & S.rain_mm.notna() & S.t.dt.hour.isin([0, 12])].copy()   # 12-h totals ending 12 and 00 UTC
    S12['day'] = (S12.t - pd.Timedelta(seconds=1)).dt.floor('D'); S12 = S12.drop_duplicates(['sid', 't'])
    g = S12.groupby(['sid', 'day']).agg(obs=('rain_mm', 'sum'), n=('rain_mm', 'count')).reset_index(); g = g[g.n == 2]
    sid = dict(zip(points[points.src == 'synop'].sid.astype(str), points[points.src == 'synop'].pid)); g['pid'] = g.sid.astype(str).map(sid)
    return g.dropna(subset=['pid']).astype({'pid': int})[['pid', 'day', 'obs']]


def gb_rain(points):
    fs = glob.glob(os.path.join(A.gb, '**', '*.parquet'), recursive=True)
    G = pd.concat([pd.read_parquet(f, columns=['station_name', 'timestamp_utc', 'value', 'qc_flag'], filters=[('qc_flag', '==', 0)]) for f in fs], ignore_index=True)
    G = G.dropna(subset=['value']); G['station_name'] = G.station_name.astype('category')
    ts = G.timestamp_utc
    G['t'] = (pd.to_datetime(ts, utc=True).dt.tz_convert(None) if not pd.api.types.is_datetime64_any_dtype(ts) else (ts.dt.tz_convert(None) if getattr(ts.dt, 'tz', None) is not None else ts)); G = G.drop(columns=['timestamp_utc', 'qc_flag'])
    G = G.sort_values(['station_name', 't']).drop_duplicates(['station_name', 't'])
    G['d'] = G.groupby('station_name', observed=True).value.diff(); G['gap'] = G.groupby('station_name', observed=True).t.diff()
    G = G[G.gap <= pd.Timedelta(hours=1)]          # an increment only across a gap of <= 1 h (a longer gap: the day is not complete)
    G['inc'] = G.d.where(G.d >= 0)                  # a negative step = a counter reset: no rain counted for that step
    G['day'] = (G.t - pd.Timedelta(seconds=1)).dt.floor('D'); G['hr'] = G.t.dt.floor('h')
    G['big'] = (G.inc > 60).astype('int8')
    g = G.groupby(['station_name', 'day'], observed=True).agg(obs=('inc', 'sum'), hours=('hr', 'nunique'), bad=('big', 'sum')).reset_index()
    g = g[(g.hours >= 23) & (g.bad == 0)]
    P = points[points.src == 'ews_gb'].copy(); key = {}
    nm = lambda s: ''.join(ch for ch in str(s).lower() if ch.isalnum())
    for r in P.itertuples(): key[nm(r.name)] = r.pid; key[nm(r.sid)] = r.pid
    g['pid'] = g.station_name.map(lambda s: key.get(nm(s)))
    return g.dropna(subset=['pid']).astype({'pid': int})[['pid', 'day', 'obs']]


def main():
    P = pd.read_csv(A.points); Z = zones_of(P)
    R = {'built': 'v91.17.283.40', 'run': (dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(hours=5)).strftime('%Y-%m-%d %H:%M PKT'), 'rules': 'C_RULES_20261031.json (written ' + RULES['written'] + ')',
         'forecast': 'ecmwf_ifs025 previous runs (deterministic), leads 1-3 days, 3-hourly', 'tests': {}}
    zone = lambda pid: (Z.get(pid) or {}).get('zone')
    # ---- C6 gusts
    print('C6 load', flush=True); Og = mach_gust(P); Xg = prev('B', 'wind_gusts_10m', Og.pid.unique()); Fg = fc_daily(Xg, 'wind_gusts_10m', 'max', 'pkt'); del Xg
    Dg = Og.merge(Fg, on=['pid', 'day']); Dg['zone'] = Dg.pid.map(zone)
    c6 = {'truth': 'MACH clean hourly gust maximum, %d stations, %s to %s' % (Og.pid.nunique(), str(Og.day.min())[:10], str(Og.day.max())[:10]), 'pairs': int(len(Dg)), 'byZone': {}}
    for zn in ['plains', 'hills', 'coast', 'mountain', 'all']:
        S = Dg if zn == 'all' else Dg[Dg.zone == zn]
        c6['byZone'][zn] = {name: {('lead%d' % k): categorical(S, 'wind_gusts_10m_d%d' % k, 'obs', thr) for k in (1, 2, 3)} for name, thr in RULES['tests']['C6']['thresholds_kmh'].items()}
        c6['byZone'][zn]['stations'] = int(S.pid.nunique())
        c6['byZone'][zn]['diagnosticLead0'] = {name: categorical(S, 'wind_gusts_10m_d0', 'obs', thr) for name, thr in RULES['tests']['C6']['thresholds_kmh'].items()}
    c6['leadsHeld'] = {('lead%d' % k): float(round(Fg['wind_gusts_10m_d%d' % k].notna().mean(), 3)) for k in (0, 1, 2, 3)}
    c6['archiveGap'] = 'the previous-runs service returns wind_gusts_10m only for the newest run (lead 0) for ecmwf_ifs025: leads 1-3 are empty in every month 2024-02..2026-10, so the release test at leads 1-3 cannot run; lead 0 (the newest run, 0-24 h ahead) is reported as a diagnostic only, never for release'
    mt = sorted({(Z.get(p) or {}).get('uid') for p in Dg.pid.unique() if zone(p) == 'mountain'} - {None})
    c6['mountainTehsilsWithGustTruth'] = mt
    c6['ensembleMountains'] = 'INCONCLUSIVE: the archived ensemble starts 29 Oct 2026 (2 runs held); no mountain gust sensor in the held truth with an archived ensemble day'
    R['tests']['C6'] = c6
    # ---- rain truth (synop: UTC day; mountain network: UTC day)
    print('rain load', flush=True); import gc; del Dg; gc.collect()
    Or = pd.concat([synop_rain(P).assign(net='synop'), gb_rain(P).assign(net='mountain network')], ignore_index=True); gc.collect()
    Xr = prev('A', 'precipitation', Or.pid.unique()); Fr = fc_daily(Xr, 'precipitation', 'sum', 'utc'); del Xr
    Dr = Or.merge(Fr, on=['pid', 'day']); Dr['zone'] = Dr.pid.map(zone)
    truth = {n: {'stations': int(g.pid.nunique()), 'days': int(len(g)), 'from': str(g.day.min())[:10], 'to': str(g.day.max())[:10]} for n, g in Or.groupby('net')}
    # ---- C8 heavy rain coast and hills
    thr = RULES['tests']['C8']['threshold_mm']
    R['tests']['C8'] = {'truth': truth, 'pairs': int(len(Dr)), 'byZone': {zn: {('lead%d' % k): categorical(Dr[Dr.zone == zn] if zn != 'all' else Dr, 'precipitation_d%d' % k, 'obs', thr) for k in (1, 2, 3)}
                        for zn in ['coast', 'hills', 'mountain', 'plains', 'all']}}
    for zn in R['tests']['C8']['byZone']: R['tests']['C8']['byZone'][zn]['stations'] = int((Dr[Dr.zone == zn] if zn != 'all' else Dr).pid.nunique())
    # ---- C7 day amounts and 3-day 75 mm
    c7 = {'truth': truth, 'dayAmounts': {}, 'rain3_75': {}}
    for name in ['pr10', 'pr25', 'pr50', 'pr100']:
        t = RULES['tests']['C7']['thresholds_mm'][name]
        c7['dayAmounts'][name] = {('lead%d' % k): categorical(Dr, 'precipitation_d%d' % k, 'obs', t) for k in (1, 2, 3)}
    # 3-day: issue day i -> days i+1 (lead 1), i+2 (lead 2), i+3 (lead 3)
    print('3-day', flush=True); W = Dr.set_index(['pid', 'day']).sort_index(); rows = []
    for pid, g in W.groupby(level=0):
        g = g.droplevel(0); idx = g.index
        for d in idx:
            d2, d3 = d + pd.Timedelta(days=1), d + pd.Timedelta(days=2)
            if d2 in idx and d3 in idx:
                rows.append({'pid': pid, 'day': d, 'f3': g.at[d, 'precipitation_d1'] + g.at[d2, 'precipitation_d2'] + g.at[d3, 'precipitation_d3'], 'o3': g.at[d, 'obs'] + g.at[d2, 'obs'] + g.at[d3, 'obs']})
    D3 = pd.DataFrame(rows)
    c7['rain3_75'] = categorical(D3, 'f3', 'o3', RULES['tests']['C7']['thresholds_mm']['rain3_75']) if len(D3) else {'verdict': 'INCONCLUSIVE', 'why': 'no 3-day windows'}
    c7['chanceLimits'] = 'INCONCLUSIVE: the served day events are ensemble chances; the archived ensemble starts 29 Oct 2026 (2 runs), far short of 20 observed events per threshold'
    c7['hourlyTrigger'] = 'INCONCLUSIVE: no hourly rain truth with an archived forecast at the same hours in the held data (synop reports 12-h totals; the mountain network has 10-min counters but the forecast archive is 3-hourly and its hourly rain is not held before 29 Oct 2026)'
    R['tests']['C7'] = c7
    # ---- C9, C10: data check
    R['tests']['C9'] = {'verdict': 'INCONCLUSIVE', 'why': 'the 25 % area rule summarises a gridded heat field per tehsil; the served area field is archived only from Sep 2026 (no heat season), and no outcome per tehsil-day (heat illness, hospital or mortality records, worker logs) is held. Heat exposure duration and activity rules have no outcome data at all', 'settledBy': 'one heat season (Apr-Jul 2027) of the archived served area field with >= 3 truth stations in a tehsil (Islamabad, Lahore, Karachi city tehsils hold MACH clusters), or district heat-illness records'}
    R['tests']['C10'] = {'verdict': 'INCONCLUSIVE', 'why': 'measured PM2.5 is held (station-lake/archive/aq, epd) but no mixing-height history at those stations: the forecast archive holds temperature, dew point, rain, wind, gusts, cloud and radiation only, and the served smog layer\'s ventilation values are not archived', 'settledBy': 'add boundary_layer_height to the harvester (previous runs) or archive the served ventilation index daily; >= 200 station-days in one smog season (Nov-Feb) then settle it'}
    json.dump(R, open(A.out, 'w'), indent=1, default=str)
    return R


if __name__ == '__main__':
    R = main()
    def show(x, p=''):
        if isinstance(x, dict) and 'verdict' in x: print(p, x['verdict'], {k: x.get(k) for k in ('events', 'pod', 'far', 'pss', 'pssCI95', 'stations', 'why', 'perStationYear')}); return
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ('truth',): print(p + '/' + k, v); continue
                show(v, p + '/' + k)
        elif isinstance(x, (str, int, list)): print(p, x if not isinstance(x, list) else len(x))
    show(R['tests'])
