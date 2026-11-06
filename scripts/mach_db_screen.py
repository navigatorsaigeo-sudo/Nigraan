#!/usr/bin/env python3
"""v91.17.182 · the MACH siting screen on the full database record -> data/mach-siting.json (the history verdicts fleet.mjs starts from)

  why      the history verdicts came from 27 stations of the Weather Underground record (2023-01 .. 2026-04). AGN's own database now
           holds 25 Mar .. today for 106 stations; 20 stations had too few days of live neighbour pairs for the live screen
  method   the same screen, unchanged: temp_zone_rank.screen_mach (copied here) (each station against the median of its MACH neighbours within
           15 km and 150 m, day 11-16 h and night 00-05 h PKT; sun on the sensor, site offset, scatter; humidity trusted when the
           dew point sits within 3 C of the neighbours). No forecast model is involved
  readings v91.17.283.14: the reading nearest each hour (within 30 min) of every station, judged by NIGRAAN's one value-level quality
           control (server/api/obsqc.mjs through scripts/lib/obsqc_truth.py: range, series, internal consistency, the copy check and
           the buddy check); a failing temperature leaves that hour out, a failing humidity or dew point only those values. Left out:
           Apple rows (a forecast product, not a station). No station is excluded; the verdicts below are information for the status
           page, they gate nothing
  heights  station height from the running-correction state (the height of the served basis at the station, mach-running-bias.json),
           else the earlier history verdict's height; a station with neither is not screened
  merge    a verdict from this record replaces the earlier one; where this record cannot screen a station the earlier verdict stays
  v91.17.266 · THE SINGLE-STATION CHECK (the same two steps as the live screen, server/api/fleet.mjs screenNb / screenFc):
  reference the synoptic and airport stations of the server's synop feed (data/synop-stations.json; their reports in
           ../station-lake/archive/synop/synop_YYYY-MM.jsonl) count as neighbours under the same radius / height rule and the same
           per-hour median of at least two values; a verdict a reference reading entered is checkedBy 'reference', else 'neighbours'
  forecast a station the neighbour screen cannot judge and that holds no earlier verdict: its residual (reading minus the forecast
           basis of the hour, ../station-lake/archive/fleet/fleet_pairs_YYYY-MM.csv temp_c - fc_raw_c, shortest lead) minus the median
           residual of the stations checked by neighbours or reference in the same zone (mach-running-bias.json basis zone) at the
           same hour (at least two); judged by the same day / night / IQR / dew rules and min_days. checkedBy 'forecast'; a station
           judged this way is not a peer for another
  every threshold is the rule block of data/mach-siting.json; nothing is typed here
  usage    python scripts/mach_db_screen.py   (from nigraan-local; reads ../station-lake/archive/fleet/db)
"""
import os, sys, json, glob, math, datetime as dt
import numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); NL = os.path.dirname(HERE); sys.path.insert(0, HERE)
# the screen below is temp_zone_rank.screen_mach verbatim (that script is not part of the laptop install); its rule constants are
# read from data/mach-siting.json ("rule"), where temp_zone_rank wrote them
SCREEN = None


def hav(la1, lo1, la2, lo2):
    d = math.pi / 180; a = math.sin((la2 - la1) * d / 2) ** 2 + math.cos(la1 * d) * math.cos(la2 * d) * math.sin((lo2 - lo1) * d / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(a)))


def judge(an, da):
    """the screen's rules over hourly anomalies (index UTC hours) and dew anomalies: (why list, day, night, iqr, dew)"""
    lh = (an.index + pd.Timedelta(hours=5)).hour
    day = float(an[np.isin(lh, SCREEN['day_hours'])].median()); night = float(an[np.isin(lh, SCREEN['night_hours'])].median())
    iqr = float(an.quantile(.75) - an.quantile(.25))
    dew = float(da.median()) if da is not None and len(da) >= 240 else None
    why = []
    if day > SCREEN['sun_excess_c'] and day - night > SCREEN['day_night_c']: why.append('reads %.1f C warm by day and %.1f C at night: sun on the sensor' % (day, night))
    if abs(day) > SCREEN['abs_c'] or abs(night) > SCREEN['abs_c']: why.append('site offset %.1f C by day, %.1f C at night' % (day, night))
    if iqr > SCREEN['iqr_c']: why.append('scatter against neighbours IQR %.1f C' % iqr)
    return why, day, night, iqr, dew


def screen_mach(T, D, meta, refs=None):
    """each station against the median of its neighbours (<= radius_km, <= dz_m apart), hour by hour: MACH stations and, from v266,
       the reference stations in refs ({id: {'lat','lon','elev','T': Series, 'D': Series}}).
       A sensor in sun or on a hot roof reads warm by day and not at night; a bad site reads off at all hours;
       a failing sensor scatters. No forecast model is involved."""
    res = {}; refs = refs or {}
    keys = [k for k in T if k in meta]
    near = lambda a, b: hav(a['lat'], a['lon'], b['lat'], b['lon']) <= SCREEN['radius_km'] and abs(a['elev'] - b['elev']) <= SCREEN['dz_m']
    for k in keys:
        a = meta[k]; nb = [j for j in keys if j != k and near(a, meta[j])]; rf = [r for r, o in refs.items() if near(a, o)]
        if len(nb) + len(rf) < SCREEN['min_neighbours']:
            res[k] = dict(verdict='unscreened', why='fewer than %d stations within %d km and %d m' % (SCREEN['min_neighbours'], SCREEN['radius_km'], SCREEN['dz_m']), neighbours=len(nb), references=len(rf)); continue
        N = pd.concat([T[j].rename(j) for j in nb] + [refs[r]['T'].rename(r) for r in rf], axis=1)
        med = N.median(axis=1); cnt = N.notna().sum(axis=1)
        an = (T[k] - med[cnt >= 2]).dropna()
        if an.empty or an.index.normalize().nunique() < SCREEN['min_days']:
            res[k] = dict(verdict='unscreened', why='fewer than %d days with two neighbours reporting' % SCREEN['min_days'], neighbours=len(nb), references=len(rf)); continue
        ref_used = bool(rf) and bool(N.loc[an.index, rf].notna().any(axis=1).any())
        da = None
        if k in D and D[k] is not None:
            ND = pd.concat([D[j].rename(j) for j in nb if j in D] + [refs[r]['D'].rename(r) for r in rf if refs[r].get('D') is not None], axis=1)
            if ND.shape[1]:
                dm = ND.median(axis=1); dc = ND.notna().sum(axis=1); da = (D[k] - dm[dc >= 2]).dropna()
        why, day, night, iqr, dew = judge(an, da)
        rh_ok = dew is not None and abs(dew) <= SCREEN['dew_abs_c']
        res[k] = dict(verdict='trusted' if not why else 'bad siting', why='; '.join(why) or None, neighbours=len(nb), references=len(rf), checkedBy='reference' if ref_used else 'neighbours',
                      dayAnomC=round(day, 2), nightAnomC=round(night, 2), iqrC=round(iqr, 2), dewAnomC=None if dew is None else round(dew, 2), humidityTrusted=bool(rh_ok and not why), hours=int(len(an)))
    return res


def screen_forecast(k, R, RD, zone, trusted):
    """the forecast-residual check of station k: R / RD {station: Series of reading minus forecast basis (temperature / dew point), by
       UTC hour}, zone {station: zone}, trusted: the stations checked by neighbours or reference. None when it cannot be formed."""
    z = zone.get(k)
    if k not in R or not z: return dict(verdict='unscreened', why='no forecast pairs or no zone for this station')
    peers = [j for j in trusted if j != k and zone.get(j) == z and j in R]
    if len(peers) < SCREEN['min_neighbours']: return dict(verdict='unscreened', why='fewer than %d checked stations in the %s zone' % (SCREEN['min_neighbours'], z), peers=len(peers))
    N = pd.concat([R[j].rename(j) for j in peers], axis=1); med = N.median(axis=1); cnt = N.notna().sum(axis=1)
    an = (R[k] - med[cnt >= 2]).dropna()
    if an.empty or an.index.normalize().nunique() < SCREEN['min_days']:
        return dict(verdict='unscreened', why='fewer than %d days of forecast pairs beside checked stations in the %s zone' % (SCREEN['min_days'], z), peers=len(peers))
    da = None
    if k in RD:
        ND = pd.concat([RD[j].rename(j) for j in peers if j in RD], axis=1)
        if ND.shape[1]:
            dm = ND.median(axis=1); dc = ND.notna().sum(axis=1); da = (RD[k] - dm[dc >= 2]).dropna()
    why, day, night, iqr, dew = judge(an, da)
    rh_ok = dew is not None and abs(dew) <= SCREEN['dew_abs_c']
    return dict(verdict='trusted' if not why else 'bad siting', why='; '.join(w.replace('against neighbours', 'against the forecast, relative to checked stations in the %s zone' % z) for w in why) or None,
                checkedBy='forecast', peers=len(peers), dayAnomC=round(day, 2), nightAnomC=round(night, 2), iqrC=round(iqr, 2), dewAnomC=None if dew is None else round(dew, 2), humidityTrusted=bool(rh_ok and not why), hours=int(len(an)))


def load_refs(nl, t0, t1):
    """the synop feed's stations and their reports in the window, as hourly Series (UTC, tz-naive)"""
    try: ST = json.load(open(os.path.join(nl, 'data', 'synop-stations.json'))).get('stations', {})
    except Exception: return {}
    rows = []
    for f in sorted(glob.glob(os.path.join(nl, '..', 'station-lake', 'archive', 'synop', 'synop_*.jsonl'))):
        for line in open(f, encoding='utf-8'):
            try: o = json.loads(line)
            except Exception: continue
            if o.get('sid') in ST and o.get('t_c') is not None: rows.append((o['sid'], o['t'], o['t_c'], o.get('td_c')))
    if not rows: return {}
    S = pd.DataFrame(rows, columns=['sid', 't', 't_c', 'td_c']); S['t'] = pd.to_datetime(S.t, utc=True, errors='coerce').dt.tz_localize(None); S = S.dropna(subset=['t'])
    S = S[(S.t >= t0) & (S.t <= t1)].drop_duplicates(['sid', 't'])
    out = {}
    for sid, g in S.groupby('sid'):
        st = ST[sid]
        if st.get('lat') is None or st.get('elevM') is None: continue
        g = g.set_index('t').sort_index()
        out['ref:' + sid] = dict(lat=float(st['lat']), lon=float(st['lon']), elev=float(st['elevM']), T=g.t_c.astype(float), D=g.td_c.dropna().astype(float) if g.td_c.notna().any() else None)
    return out


def load_residuals(nl, t0, t1):
    """reading minus the forecast basis per station-hour from the fleet pairs (shortest lead per hour): temperature, and dew point where
       the pair holds the station dew point and the forecast relative humidity (the forecast dew point is the exact inverse of the
       Bolton (1980) saturation curve, the one psychrometric module of the server, server/api/psychro.mjs dewPointC)"""
    fs = sorted(glob.glob(os.path.join(nl, '..', 'station-lake', 'archive', 'fleet', 'fleet_pairs_*.csv')))
    if not fs: return {}, {}
    P = pd.concat([pd.read_csv(f, usecols=lambda c: c in ('key', 'hour_utc', 'lead_h', 'temp_c', 'dew_c', 'fc_raw_c', 'fc_rh_pct'), low_memory=False) for f in fs])
    for c in ('dew_c', 'fc_rh_pct'):
        if c not in P: P[c] = np.nan
    P['hour'] = pd.to_datetime(P.hour_utc, utc=True, errors='coerce').dt.tz_localize(None); P = P.dropna(subset=['hour', 'temp_c', 'fc_raw_c'])
    P = P[(P.hour >= t0) & (P.hour <= t1)].sort_values('lead_h').drop_duplicates(['key', 'hour'])
    P['r'] = P.temp_c - P.fc_raw_c
    fd = dew_bolton(P.fc_raw_c.astype(float), pd.to_numeric(P.fc_rh_pct, errors='coerce'))
    P['rd'] = pd.to_numeric(P.dew_c, errors='coerce') - fd
    R = {k: g.set_index('hour').r.sort_index() for k, g in P.groupby('key')}
    RD = {k: g.set_index('hour').rd.dropna().sort_index() for k, g in P.groupby('key')}
    return R, {k: v for k, v in RD.items() if len(v)}


def dew_bolton(T, rh):
    """dew point from temperature and relative humidity: the inverse of es = 6.112 exp(17.67 T / (T + 243.5)) (psychro.mjs dewPointC:
       RH clamped 1-100 %, never above the air temperature; RH <= 0 or missing gives NaN)"""
    a, b = 17.67, 243.5
    g = np.log(rh.clip(1, 100) / 100) + a * T / (b + T)
    return np.minimum(T, b * g / (a - g)).where(rh.notna() & (rh > 0))


DB = os.path.join(NL, '..', 'station-lake', 'archive', 'fleet', 'db')


def magnus(T, rh):
    a, b = 17.625, 243.04; g = np.log(np.clip(rh, 1e-6, None) / 100) + a * T / (b + T); return b * g / (a - g)


def main():
    global SCREEN
    old = json.load(open(os.path.join(NL, 'data', 'mach-siting.json'))); SCREEN = old['rule']
    files = sorted(glob.glob(os.path.join(DB, 'mach_db_*.csv')))
    if not files: print('no database record in', DB); return
    D = pd.concat([pd.read_csv(f, low_memory=False, usecols=['time', 'station_key', 'source', 'temperature_c', 'dew_point_c', 'humidity_pct', 'pressure_hpa']) for f in files])
    D = D.drop_duplicates(['station_key', 'time']); D['time'] = pd.to_datetime(D.time, utc=True, errors='coerce'); D = D.dropna(subset=['time'])
    ST = {s['station_key']: s for s in json.load(open(os.path.join(DB, 'stations.json')))['stations']}
    # v91.17.265 · positions from NIGRAAN's checked registry (data/mach-fleet-stations.json) where it holds one: the database copy can carry
    # a wrong position (MACH 108 was 8.8 km off, corrected 14 Oct 2026)
    RF = os.path.join(NL, 'data', 'mach-fleet-stations.json')
    REGALL = {s['key']: s for s in json.load(open(RF, encoding='utf-8'))['stations']} if os.path.exists(RF) else {}
    REG = {k: s for k, s in REGALL.items() if s.get('lat') is not None}
    for k, s in ST.items():
        if k in REG: s['lat'], s['lng'] = REG[k]['lat'], REG[k]['lon']
    def excluded(k):
        s = ST.get(k)
        if not s: return 'not in the database'
        if str(s.get('provider') or '').lower().startswith('apple'): return 'Apple reading: a forecast product, not a station'
        return None
    n0 = len(D); D = D[(D.source != 'qm') & D.station_key.map(lambda k: excluded(k) is None)]
    sys.path.insert(0, os.path.join(NL, 'scripts', 'lib')); import obsqc_truth as QT
    st = pd.DataFrame([{'pid': 'mach:' + k, 'lat': s.get('lat'), 'lon': s.get('lng'), 'elev': None, 'zone': None} for k, s in ST.items() if s.get('lat') is not None])
    F = QT.qc_frame(pd.DataFrame({'pid': 'mach:' + D.station_key.astype(str), 'time': D.time, 'T': D.temperature_c, 'Td': D.dew_point_c, 'RH': D.humidity_pct, 'P': D.pressure_hpa}), st, NL, nearest_min=30)
    W = F.pivot_table(index=['pid', 'time_utc'], columns='var', values='value', aggfunc='first'); OK = F.pivot_table(index=['pid', 'time_utc'], columns='var', values='pass', aggfunc='first')
    W = W.where(OK == 1).reset_index()
    D = pd.DataFrame({'station_key': W.pid.str.slice(5), 'hour': pd.to_datetime(W.time_utc, utc=True), 'temperature_c': W.get('T'), 'dew_point_c': W.get('Td'),
                      'humidity_pct': W.get('RH'), 'pressure_hpa': W.get('P')}).dropna(subset=['temperature_c'])
    copied = F[(F['var'] == 'T') & (F.test == 'copy')]
    D['hour'] = D.hour.dt.tz_localize(None)
    Tser = {k: g.set_index('hour').temperature_c.sort_index() for k, g in D.groupby('station_key')}
    Dser = {k: g.set_index('hour').dew_point_c.dropna().sort_index() for k, g in D.groupby('station_key')}
    rb = json.load(open(os.path.join(NL, 'data', 'mach-running-bias.json'))).get('stations', {})
    meta = {}
    for k in Tser:
        s = ST[k]; z = (rb.get(k) or {}).get('elevM')
        if z is None: z = (old['stations'].get(k) or {}).get('elevM')
        if z is not None and s.get('lat') is not None: meta[k] = dict(lat=float(s['lat']), lon=float(s['lng']), elev=float(z))
    t0, t1 = D.hour.min(), D.hour.max()
    refs = load_refs(NL, t0, t1)
    res = screen_mach(Tser, Dser, meta, refs)
    seed = dict(old['stations']); n_new = 0
    # v91.17.266 · the forecast-residual check for the stations neither the neighbours nor an earlier verdict can judge
    R, RD = load_residuals(NL, t0, t1)
    zone = {k: ((rb.get(k) or {}).get('basis') or {}).get('zone') for k in set(Tser) | set(R)}
    trusted = [k for k, v in res.items() if v['verdict'] == 'trusted'] + [k for k, v in seed.items() if k not in res and v.get('verdict') == 'trusted' and v.get('checkedBy') != 'forecast']
    for k in list(res):
        if res[k]['verdict'] != 'unscreened' or (k in seed and seed[k].get('verdict') not in (None, 'unscreened') and seed[k].get('checkedBy') != 'forecast'): continue
        f = screen_forecast(k, R, RD, zone, trusted)
        if f['verdict'] != 'unscreened': res[k] = dict(f, neighbours=res[k].get('neighbours'), references=res[k].get('references'))
        else: res[k]['why'] = res[k]['why'] + '; ' + f['why']
    for k, v in res.items():
        if v['verdict'] == 'unscreened' and k in seed and seed[k].get('verdict') != 'unscreened': continue
        seed[k] = dict(verdict=v['verdict'], why=v.get('why'), humidityTrusted=bool(v.get('humidityTrusted')), dayAnomC=v.get('dayAnomC'), nightAnomC=v.get('nightAnomC'),
                       iqrC=v.get('iqrC'), dewAnomC=v.get('dewAnomC'), neighbours=v.get('neighbours'), references=v.get('references'), checkedBy=v.get('checkedBy'), hours=v.get('hours'), historyId='machdb:' + k, elevM=meta[k]['elev'] if k in meta else (seed.get(k) or {}).get('elevM'),
                       record=[str(Tser[k].index.min())[:10], str(Tser[k].index.max())[:10]] if k in Tser else (seed.get(k) or {}).get('record')); n_new += 1
    for k in ST:
        w = excluded(k)
        if w: seed[k] = dict(verdict='excluded', why=w, humidityTrusted=False, historyId='machdb:' + k)   # Apple rows only: a forecast product
    out = dict(old, built=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
               source=old['source'].split('; from 6 Oct 2026')[0] + '; from 6 Oct 2026 the AGN MACH observation database record (' + str(D.hour.min())[:10] + '..' + str(D.hour.max())[:10] + ', nigraan-local/scripts/mach_db_screen.py)'
                      + ('; reference neighbours: ' + str(len(refs)) + ' synoptic and airport stations of the synop feed' if refs else ''),   # v91.17.266 · written once, not appended again on every run
               script='nigraan-local/scripts/temp_zone_rank.py screen_mach (rule unchanged), run on the database record by scripts/mach_db_screen.py', stations=seed)
    def clean(o):   # JSON has no NaN: a statistic that could not be formed is null
        if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
        if isinstance(o, list): return [clean(v) for v in o]
        if isinstance(o, float) and not np.isfinite(o): return None
        return o
    p = os.path.join(NL, 'data', 'mach-siting.json'); json.dump(clean(out), open(p + '.tmp', 'w'), indent=1, allow_nan=False); os.replace(p + '.tmp', p)
    c = pd.Series([v['verdict'] for v in seed.values()]).value_counts().to_dict()
    print(f'readings {n0:,} -> station-hours {len(D):,} ({len(copied):,} copied values failed; obsqc counts {F.attrs.get('counts')}); screened {n_new} from the database; verdicts {c}')
    print('bad siting:', {k: v['why'] for k, v in seed.items() if v['verdict'] == 'bad siting'})
    print('checked by:', pd.Series([v.get('checkedBy') or '-' for v in seed.values() if v['verdict'] in ('trusted', 'bad siting')]).value_counts().to_dict())


if __name__ == '__main__':
    main()
