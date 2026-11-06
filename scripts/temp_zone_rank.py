#!/usr/bin/env python3
"""
temp_zone_rank.py  (v91.17.70, Sprint 1 temperature)  --  INTERNAL VERIFICATION

Chooses ONE temperature model per zone (mountain GB/Chitral, hills, plains, coast) by verification
against station records, and measures the served temperature before and after the v91.17.70 change.

  inputs   station-lake/archive/model/cache_zone/*   (temp_zone_fetch.py: day-1 forecasts of 12 models)
           station-lake/archive/model/cache_rank/*   (rank_models.py: the same for 9 models at the PMD lake)
           PMD mountain AWS lake, PMD EWS export, PMD synop via NOAA ISD-Lite     -> INTERNAL ONLY
           MACH fleet history and live sheets (AGN's own)
  outputs  nigraan-local/data/model-zone.json  (customer-path config: model NAMES per zone, zone per tehsil,
                                                a score summary for the record; no number fitted to PMD data
                                                is applied to any output)
           station-lake/reports/temp_zone_rank.json  (internal: every score, per zone, per station)
           station-lake/reports/mach-siting-screen.json (MACH trust screen, model-independent)

Method
  metrics  day-1 lead; daily maximum and minimum on Pakistan days (00-24 PKT) from matched hours
           (dense records: >= 20 matched hours; synop: >= 7 matched hours incl. one 06-12 UTC and one
           21-03 UTC); hourly MAE; dew point for ISD and MACH
  QC       PMD AWS: a model-independent network-lapse test (daily Tmax regressed on height across the
           network per date; a sensor whose median residual is beyond 6 C is dropped). MACH: the
           neighbour siting screen (screen_mach) - no model involved.
  choice   paired against ecmwf_ifs025 (present in every window), because several models have no
           archive in early 2025: per station-window cell, dMAE = MAE(model) - MAE(ifs025) on the
           same hours; zone score = station-mean of the cell mean of (dMAE_tmax + dMAE_tmin) / 2.
           Two spatial folds (20 km clusters, alternating by latitude): the model picked on one fold
           is scored on the other (held-out); the served choice is the model picked on all stations.
  before   the v91.17.69 served path replayed with the production modules (temp_zone_before.mjs):
           best_match + station MOS / learned model / plains city offsets
  after    the chosen zone model at the point, raw (L0), and with the MACH running bias (L2) where a
           trusted MACH station lies within 5 km and 150 m (simulated with the exact serving rule,
           leave-one-station-out for the unstationed point)
"""
import os, sys, json, math, subprocess, datetime as dt
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from shapely.geometry import shape, Point

HERE = os.path.dirname(os.path.abspath(__file__)); NL = os.path.dirname(HERE)
LAKE = os.path.join(os.path.dirname(NL), 'station-lake'); ARCH = os.path.join(LAKE, 'archive')
sys.path.insert(0, HERE)
import temp_zone_fetch as F

CAND = ['best_match', 'ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_seamless', 'ncep_aigfs025', 'icon_seamless',
        'gem_seamless', 'ukmo_seamless', 'meteofrance_seamless', 'jma_seamless', 'cma_grapes_global']
REF = 'ecmwf_ifs025'
ZONES = ['mountain', 'hills', 'plains', 'coast']
COAST_KM = 60
COASTLINE = [[61.74, 25.05], [62.33, 25.12], [63.47, 25.26], [64.63, 25.21], [65.60, 25.38], [66.58, 25.42], [66.98, 24.80], [67.30, 24.75],
             [67.45, 24.14], [67.90, 23.95], [68.35, 23.90], [68.75, 23.90]]   # outlook.mjs COASTLINE, the build's own coast
HILLS_M = 1000   # the build's mountain/plains line (model-skill registry cellFor, pool.mjs MOUNTAIN_ELEV_M)
MOUNTAIN_M = 2000   # outside GB/Chitral, ground at or above this behaves like the GB valleys: the KP high-valley stations
                    # (Swat Kohistan, Kandia, 2,290-4,114 m) rank the models as GB does, the 1,000-2,000 m synop hill sites
                    # (Kakul, Dir, Parachinar, Cherat, Zhob, Quetta, Khuzdar) as the plains do [measured, first run of this script]
INCUMBENT = 'ecmwf_ifs'   # what best_match serves over Pakistan since Oct 2025 (99-100 % identical hours, measured in this run)
ADOPT_GAIN_C = 0.2        # a challenger replaces the incumbent only if it is at least this much better on BOTH spatial folds
                          # (the meteorologist seat's own adoption rule, seat_meteorologist.md 2.2 item 8)
MIN_PRIMARY_H = 168       # a zone model must cover at least seven days itself
FULL_H = 360              # a fallback must cover the full 15-day horizon


def hav(la1, lo1, la2, lo2):
    d = math.pi / 180; a = math.sin((la2 - la1) * d / 2) ** 2 + math.cos(la1 * d) * math.cos(la2 * d) * math.sin((lo2 - lo1) * d / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(a)))


def coast_km(lat, lon):
    best = 1e9
    for i in range(len(COASTLINE) - 1):
        x1, y1 = COASTLINE[i]; x2, y2 = COASTLINE[i + 1]
        for k in range(11):
            t = k / 10; best = min(best, hav(lat, lon, y1 + (y2 - y1) * t, x1 + (x2 - x1) * t))
    return best


class Zoner:
    """zone of a point: mountain = inside a Gilgit-Baltistan or Chitral tehsil; coast = within 60 km of the coast;
       hills = height >= 1,000 m; plains = the rest"""
    def __init__(self):
        g = json.load(open(os.path.join(NL, 'data', 'pk-tehsils.json')))
        self.polys = [(shape(f['geometry']), f['properties']) for f in g['features'] if f.get('geometry')]
    def admin(self, lat, lon):
        p = Point(lon, lat)
        for s, pr in self.polys:
            if s.contains(p): return pr
        best = None
        for s, pr in self.polys:
            d = s.distance(p)
            if best is None or d < best[0]: best = (d, pr)
        return best[1] if best and best[0] < 0.05 else None
    def zone(self, lat, lon, elev):
        pr = self.admin(lat, lon)
        if pr and (pr.get('province') == 'Gilgit Baltistan' or 'Chitral' in str(pr.get('district', ''))): return 'mountain'
        if elev is not None and elev >= MOUNTAIN_M: return 'mountain'
        if coast_km(lat, lon) <= COAST_KM: return 'coast'
        return 'hills' if elev is not None and elev >= HILLS_M else 'plains'


def unit_zone(u, elevM):
    if u['province'] == 'Gilgit Baltistan' or 'Chitral' in u['district']: return 'mountain'
    if elevM is not None and elevM >= MOUNTAIN_M: return 'mountain'
    if coast_km(u['lat'], u['lon']) <= COAST_KM: return 'coast'
    return 'hills' if elevM is not None and elevM >= HILLS_M else 'plains'


# ─────────────────────────── observations ───────────────────────────
PREF = {'Air Temperature': 0, 'Air Temperature THS': 1, 'Air Temperature Hukseflux': 2}


def obs_pmd_lake(names):
    d = pd.read_parquet(os.path.join(ARCH, 'obs', 'Air_Temperature.parquet'), columns=['timestamp_utc', 'station_name', 'element_name', 'value_qc'])
    d = d[d.station_name.isin(names)].dropna(subset=['value_qc'])
    d['p'] = d.element_name.map(PREF).fillna(3)
    d = d[d.p == d.station_name.map(d.groupby('station_name').p.min())]
    d['hour'] = d.timestamp_utc.dt.floor('h')
    g = d.groupby(['station_name', 'hour']).value_qc.agg(['mean', 'count']).reset_index()
    g = g[g['count'] >= 3]
    out = {n: x.set_index('hour')['mean'] for n, x in g.groupby('station_name')}
    for k in F.PMD_CITY:
        f = os.path.join(ARCH, 'obs', f'Air_Temperature_{k}.parquet')
        if not os.path.exists(f): continue
        c = pd.read_parquet(f, columns=['timestamp_utc', 'value_qc']).dropna()
        c['hour'] = c.timestamp_utc.dt.floor('h'); gg = c.groupby('hour').value_qc.agg(['mean', 'count']); out[k] = gg[gg['count'] >= 3]['mean']
    return out


def obs_pmd_export():
    d = pd.read_parquet(os.path.join(ARCH, 'pmd', 'ews_export', 'air_temperature_batch1_long.parquet'))
    d['p'] = d.element_name.map(PREF).fillna(3)
    d = d[d.p == d.station_name.map(d.groupby('station_name').p.min())]
    d['hour'] = (d.Time - pd.Timedelta(hours=5)).dt.floor('h').dt.tz_localize('UTC')   # the export is Pakistan time (diurnal minimum 05 h, maximum 13-14 h)
    g = d.groupby(['station_name', 'hour']).value.agg(['mean', 'count']).reset_index(); g = g[g['count'] >= 2]
    return {n: x.set_index('hour')['mean'] for n, x in g.groupby('station_name')}


def obs_isd():
    d = pd.read_parquet(os.path.join(ARCH, 'isd', 'isd_lite_hourly.parquet'), columns=['station', 'timestamp_utc', 't_c', 'td_c'])
    d = d.dropna(subset=['t_c']); d['hour'] = d.timestamp_utc.dt.floor('h')
    T, D = {}, {}
    for s, x in d.groupby('station'):
        x = x.drop_duplicates('hour').set_index('hour'); T[str(s)] = x.t_c; D[str(s)] = x.td_c.where(x.td_c <= x.t_c + 0.5)
    return T, D


def obs_mach():
    d = pd.read_parquet(os.path.join(ARCH, 'fleet', 'history', 'mach_history_hourly.parquet'), columns=['mach_id', 'hour_utc', 't_c', 'dew_c', 'n'])
    d = d[(d.n >= 6)].dropna(subset=['t_c'])
    T, D = {}, {}
    for s, x in d.groupby('mach_id'):
        x = x.drop_duplicates('hour_utc').set_index('hour_utc'); T[s] = x.t_c; D[s] = x.dew_c.where((x.dew_c <= x.t_c + 0.5) & (x.dew_c > -35))
    s = pd.read_parquet(os.path.join(ARCH, 'fleet', 'history', 'mach_sheets_hourly.parquet'), columns=['station', 'ts', 'temp_c', 'dew_c', 'n'])
    s = s[s.n >= 3].dropna(subset=['temp_c'])
    for k, x in s.groupby('station'):
        x = x.drop_duplicates('ts').set_index('ts'); T['sheet:' + k] = x.temp_c; D['sheet:' + k] = x.dew_c.where((x.dew_c <= x.temp_c + 0.5) & (x.dew_c > -35))
    return T, D


# ─────────────────────────── model series ───────────────────────────
def frame(d):
    h = d['hourly']; f = pd.DataFrame(h); f['time'] = pd.to_datetime(f['time'], utc=True); return f.set_index('time')


def model_series(st):
    """DataFrame indexed by UTC hour: T_<model>, Td_<model>, rh, wind (best_match)"""
    parts = []
    for p in F.jobs_for(st):
        f = frame(F.px(p)); ren = {}
        ms = p['models'].split(',')
        for c in f.columns:
            for v, pre in (('temperature_2m_previous_day1', 'T_'), ('dew_point_2m_previous_day1', 'Td_'), ('relative_humidity_2m_previous_day1', 'rh_'), ('wind_speed_10m_previous_day1', 'wind_')):
                if c.startswith(v):
                    m = c[len(v) + 1:] if len(c) > len(v) else ms[0]
                    ren[c] = pre + m
        parts.append(f.rename(columns=ren))
    if st['set'] == 'pmd_lake':
        for a, b in F.LAKE_WINDOWS:
            d = F.rank_cache(st['lat'], st['lon'], a, b)
            if d is None: continue
            f = frame(d); keep = {f'temperature_2m_previous_day1_{m}': 'T_' + m for m in F.RANK_MODELS if m not in ('metno_seamless', 'knmi_seamless')}
            parts.append(f[[c for c in keep if c in f.columns]].rename(columns=keep))
    M = pd.concat(parts, axis=0)
    M = M.groupby(level=0).first().sort_index()
    return M


# ─────────────────────────── scoring ───────────────────────────
def pkt_day(idx): return (idx + pd.Timedelta(hours=5)).floor('D')


def daily_pairs(o, f, synop):
    """daily max/min of obs and forecast over the matched hours"""
    j = pd.concat([o.rename('o'), f.rename('f')], axis=1, join='inner').dropna()
    if j.empty: return None
    j['day'] = pkt_day(j.index); j['uh'] = j.index.hour
    g = j.groupby('day')
    n = g.size()
    if synop:
        okd = g.uh.apply(lambda h: ((h >= 6) & (h <= 12)).any() and ((h >= 21) | (h <= 3)).any())
        keep = n[(n >= 7) & okd].index
    else:
        keep = n[n >= 20].index
    if len(keep) == 0: return None
    agg = g.agg(ox=('o', 'max'), on=('o', 'min'), fx=('f', 'max'), fn=('f', 'min')).loc[keep]
    return agg


def cell_metrics(o, f, synop):
    j = pd.concat([o.rename('o'), f.rename('f')], axis=1, join='inner').dropna()
    if len(j) < 100: return None
    e = j.f - j.o
    D = daily_pairs(o, f, synop)
    if D is None or len(D) < 7: return None
    ex, en = D.fx - D.ox, D.fn - D.on
    return dict(n=int(len(j)), days=int(len(D)), hr_bias=float(e.mean()), hr_mae=float(e.abs().mean()), tx_bias=float(ex.mean()), tx_mae=float(ex.abs().mean()),
                tn_bias=float(en.mean()), tn_mae=float(en.abs().mean()))


def window_of(ts, st):
    W = {'pmd_lake': F.LAKE_WINDOWS, 'pmd_export': [('2026-08-21', '2026-09-24')], 'isd': F.ISD_WINDOWS, 'mach': F.MACH_WINDOWS, 'sheet': [F.SHEET_WINDOW]}[st['set']]
    out = []
    for a, b in W:
        m = (ts >= pd.Timestamp(a, tz='UTC')) & (ts < pd.Timestamp(b, tz='UTC') + pd.Timedelta(days=1)); out.append(((a, b), m))
    return out


# ─────────────────────────── the MACH siting screen (model-independent) ───────────────────────────
SCREEN = dict(radius_km=15, dz_m=150, min_neighbours=2, min_days=10, day_hours=list(range(11, 17)), night_hours=list(range(0, 6)),
              sun_excess_c=1.5, day_night_c=1.5, abs_c=2.5, iqr_c=3.0, dew_abs_c=3.0)


def screen_mach(T, D, meta):
    """each station against the median of its MACH neighbours (<= 15 km, <= 150 m apart), hour by hour.
       A sensor in sun or on a hot roof reads warm by day and not at night; a bad site reads off at all hours;
       a failing sensor scatters. No forecast model is involved."""
    res = {}
    keys = [k for k in T if k in meta]
    for k in keys:
        a = meta[k]; nb = [j for j in keys if j != k and hav(a['lat'], a['lon'], meta[j]['lat'], meta[j]['lon']) <= SCREEN['radius_km'] and abs(a['elev'] - meta[j]['elev']) <= SCREEN['dz_m']]
        if len(nb) < SCREEN['min_neighbours']:
            res[k] = dict(verdict='unscreened', why='fewer than %d MACH neighbours within %d km and %d m' % (SCREEN['min_neighbours'], SCREEN['radius_km'], SCREEN['dz_m']), neighbours=len(nb)); continue
        N = pd.concat([T[j].rename(j) for j in nb], axis=1)
        med = N.median(axis=1); cnt = N.notna().sum(axis=1)
        an = (T[k] - med[cnt >= 2]).dropna()
        if an.empty or an.index.normalize().nunique() < SCREEN['min_days']:
            res[k] = dict(verdict='unscreened', why='fewer than %d days with two neighbours reporting' % SCREEN['min_days'], neighbours=len(nb)); continue
        lh = (an.index + pd.Timedelta(hours=5)).hour
        day = float(an[np.isin(lh, SCREEN['day_hours'])].median()); night = float(an[np.isin(lh, SCREEN['night_hours'])].median())
        iqr = float(an.quantile(.75) - an.quantile(.25))
        dew = None
        if k in D and D[k] is not None:
            ND = pd.concat([D[j].rename(j) for j in nb if j in D], axis=1)
            if ND.shape[1]:
                dm = ND.median(axis=1); dc = ND.notna().sum(axis=1); da = (D[k] - dm[dc >= 2]).dropna()
                if len(da) >= 240: dew = float(da.median())
        why = []
        if day > SCREEN['sun_excess_c'] and day - night > SCREEN['day_night_c']: why.append('reads %.1f C warm by day and %.1f C at night: sun on the sensor' % (day, night))
        if abs(day) > SCREEN['abs_c'] or abs(night) > SCREEN['abs_c']: why.append('site offset %.1f C by day, %.1f C at night' % (day, night))
        if iqr > SCREEN['iqr_c']: why.append('scatter against neighbours IQR %.1f C' % iqr)
        rh_ok = dew is not None and abs(dew) <= SCREEN['dew_abs_c']
        res[k] = dict(verdict='trusted' if not why else 'bad siting', why='; '.join(why) or None, neighbours=len(nb), dayAnomC=round(day, 2), nightAnomC=round(night, 2), iqrC=round(iqr, 2),
                      dewAnomC=None if dew is None else round(dew, 2), humidityTrusted=bool(rh_ok and not why), hours=int(len(an)))
    return res


# ─────────────────────────── the MACH running bias (L2), the serving rule ───────────────────────────
L2 = dict(window_days=14, decay=0.85, min_days=5, reset_days=3, reset_jump_c=2.0, cap_c=3.0, cap_dew_c=5.0, stale_days=2, blocks=8, min_block_hours=2, radius_km=5, dz_m=150, keep_days=16,
          city_km=15, min_city=2, zones_t=['plains'], zones_td=['plains', 'coast'], t_reach_km=1.0)
# TEMPERATURE is served only at the station's own site (t_reach_km): at the station the running bias lowered the error
# (plains Tmax 2.11 -> 1.89, Tmin 2.21 -> 1.77, hourly 2.38 -> 2.03 C), but carried to another MACH station 2-8 km away,
# alone or as the city median, it did not (Tmax +0.07 to +0.28, city median Tmax 2.04 -> 2.11, hourly 2.28 -> 2.26 C,
# bias pushed +0.9 C warm) [measured, runs 3-4 of this script]. DEW POINT is served as the city median within the
# 5 km / 150 m reach: plains 2.62 -> 2.33 C, bias -1.16 -> -0.04; coast 2.98 -> 2.91, bias -1.37 -> -0.58 [measured].
# reach: a point needs a trusted station within radius_km / dz_m; value: the MEDIAN of the running biases of the trusted
# stations within city_km (>= min_city), because one station's bias carries its own micro-siting: carried 2-8 km to a
# held-out MACH station it did not help (Tmax +0.07 to +0.28 C MAE), the city median did (hourly -0.08 C; dew point
# 2.75 -> 2.28 C, bias -1.35 -> +0.19 in the plains) [measured, first runs of this script]. Temperature is served in
# the plains only (at the coast it made Tmax worse at every distance); dew point in the plains and at the coast.


def l2_daily_state(res):
    """res: Series of (obs - model) at UTC hours. -> dict day -> (block means[8], day mean) on Pakistan days"""
    if res.empty: return {}
    lt = res.index + pd.Timedelta(hours=5)
    df = pd.DataFrame({'r': res.values, 'day': lt.floor('D'), 'b': lt.hour // 3})
    out = {}
    for d, x in df.groupby('day'):
        if len(x) < 12: continue
        bm = [None] * L2['blocks']
        for b, y in x.groupby('b'):
            if len(y) >= L2['min_block_hours']: bm[int(b)] = float(y.r.mean())
        out[d] = (bm, float(x.r.mean()))
    return out


def l2_bias_for(state, day, cap):
    """the per-block bias to apply on Pakistan day `day`, from days strictly before it (the serving rule)"""
    days = sorted(k for k in state if k < day and k >= day - pd.Timedelta(days=L2['window_days']))
    if not days or (day - days[-1]).days > L2['stale_days'] + 1: return None
    reset = False
    if len(days) >= L2['reset_days'] + 3:
        recent = [state[k][1] for k in days[-L2['reset_days']:]]; older = [state[k][1] for k in days[:-L2['reset_days']]]
        if abs(np.mean(recent) - np.mean(older)) > L2['reset_jump_c']: days = days[-L2['reset_days']:]; reset = True
    if len(days) < (L2['reset_days'] if reset else L2['min_days']): return None
    w = np.array([L2['decay'] ** ((day - k).days - 1) for k in days])
    allh = float(np.sum(w * np.array([state[k][1] for k in days])) / w.sum())
    out = []
    for b in range(L2['blocks']):
        v = [(wi, state[k][0][b]) for wi, k in zip(w, days) if state[k][0][b] is not None]
        out.append(sum(a * c for a, c in v) / sum(a for a, _ in v) if len(v) >= max(3, len(days) // 2) else allh)
    sm = [(out[(b - 1) % 8] + 2 * out[b] + out[(b + 1) % 8]) / 4 for b in range(8)]
    return [max(-cap, min(cap, x)) for x in sm]


def l2_apply(f, state, cap):
    """f: model Series (UTC hours) -> corrected Series with the per-hour interpolated block bias"""
    lt = f.index + pd.Timedelta(hours=5); days = lt.floor('D'); out = f.copy(); cache = {}
    for i, (t, d) in enumerate(zip(lt, days)):
        if d not in cache: cache[d] = l2_bias_for(state, d, cap)
        B = cache[d]
        if B is None or pd.isna(f.iloc[i]): continue
        x = (t.hour + t.minute / 60 - 1.5) / 3; b0 = math.floor(x) % 8; fr = x - math.floor(x)
        out.iloc[i] = f.iloc[i] + (1 - fr) * B[b0] + fr * B[(b0 + 1) % 8]
    return out


# ─────────────────────────── main ───────────────────────────
def main():
    t0 = dt.datetime.now(dt.timezone.utc)
    Z = Zoner()
    S = json.load(open(os.path.join(F.CACHE, 'stations.json')))
    for s in S: s['zone'] = Z.zone(s['lat'], s['lon'], s['elev'])
    print('stations', len(S), pd.Series([s['set'] + '/' + s['zone'] for s in S]).value_counts().to_dict(), flush=True)
    OL = obs_pmd_lake([s['name'] for s in S if s['set'] == 'pmd_lake'])
    OX = obs_pmd_export()
    IT, ID = obs_isd()
    MT, MD = obs_mach()
    obsT, obsD = {}, {}
    for s in S:
        if s['set'] == 'pmd_lake': obsT[s['key']] = OL.get(s['name'])
        elif s['set'] == 'pmd_export': obsT[s['key']] = OX.get(s['name'])
        elif s['set'] == 'isd': obsT[s['key']] = IT.get(s['key'][4:]); obsD[s['key']] = ID.get(s['key'][4:])
        elif s['set'] == 'mach': obsT[s['key']] = MT.get(s['key'][5:]); obsD[s['key']] = MD.get(s['key'][5:])
        elif s['set'] == 'sheet': obsT[s['key']] = MT.get(s['key']); obsD[s['key']] = MD.get(s['key'])
    S = [s for s in S if obsT.get(s['key']) is not None and len(obsT[s['key']]) > 200]
    # PMD network-lapse QC (model-independent)
    qc_drop = {}
    for setname in ('pmd_lake', 'pmd_export'):
        rows = []
        for s in S:
            if s['set'] != setname or s['zone'] != 'mountain': continue
            o = obsT[s['key']]; d = o.groupby(pkt_day(o.index)).agg(['max', 'count']); d = d[d['count'] >= 20]
            rows += [(s['key'], k, v, s['elev']) for k, v in d['max'].items()]
        R = pd.DataFrame(rows, columns=['st', 'day', 'tx', 'z']); res = []
        for day, x in R.groupby('day'):
            if len(x) < 6: continue
            A = np.c_[np.ones(len(x)), x.z / 1000]; c, *_ = np.linalg.lstsq(A, x.tx, rcond=None); res.append(x.assign(r=x.tx - A @ c))
        if res:
            R = pd.concat(res); med = R.groupby('st').r.median()
            for k, v in med.items():
                if abs(v) > 6: qc_drop[k] = round(float(v), 1)
    print('PMD sensors failing the network-lapse QC:', qc_drop, flush=True)
    S = [s for s in S if s['key'] not in qc_drop]
    # MACH siting screen
    meta = {}; mT, mD = {}, {}
    for s in S:
        if s['set'] in ('mach', 'sheet'): meta[s['key']] = s; mT[s['key']] = obsT[s['key']]; mD[s['key']] = obsD.get(s['key'])
    scr = screen_mach(mT, mD, meta)
    bad = [k for k, v in scr.items() if v['verdict'] == 'bad siting']
    print('MACH screen:', pd.Series([v['verdict'] for v in scr.values()]).value_counts().to_dict(), 'bad:', bad, flush=True)
    S = [s for s in S if s['key'] not in bad]
    # model series and cell metrics
    cells = []; series = {}
    for s in S:
        try: M = model_series(s)
        except Exception as e: print('  no model series', s['key'], e); continue
        series[s['key']] = M
        o = obsT[s['key']]; syn = s['set'] == 'isd'
        for (a, b), mask in window_of(M.index, s):
            Mi = M[mask]
            for m in CAND:
                c = 'T_' + m
                if c not in Mi or Mi[c].notna().sum() < 200: continue
                r = cell_metrics(o, Mi[c], syn)
                if r: cells.append(dict(key=s['key'], set=s['set'], zone=s['zone'], elev=s['elev'], lat=s['lat'], lon=s['lon'], window=a, model=m, **r))
                if obsD.get(s['key']) is not None and 'Td_' + m in Mi:
                    j = pd.concat([obsD[s['key']].rename('o'), Mi['Td_' + m].rename('f')], axis=1, join='inner').dropna()
                    if len(j) >= 100: cells.append(dict(key=s['key'], set=s['set'], zone=s['zone'], elev=s['elev'], lat=s['lat'], lon=s['lon'], window=a, model=m, var='dew', n=int(len(j)), hr_bias=float((j.f - j.o).mean()), hr_mae=float((j.f - j.o).abs().mean())))
    C = pd.DataFrame(cells); C['var'] = C['var'].fillna('t') if 'var' in C else 't'
    CT = C[C['var'] == 't'].copy()
    print('cells', len(CT), 'stations scored', CT.key.nunique(), flush=True)
    # paired against the reference model on the same station-window
    ref = CT[CT.model == REF].set_index(['key', 'window'])[['tx_mae', 'tn_mae', 'hr_mae']]
    CT = CT.join(ref, on=['key', 'window'], rsuffix='_ref').dropna(subset=['tx_mae_ref'])
    CT['d'] = ((CT.tx_mae - CT.tx_mae_ref) + (CT.tn_mae - CT.tn_mae_ref)) / 2
    CT['score'] = (CT.tx_mae + CT.tn_mae) / 2

    CD = C[C['var'] == 'dew']
    dew = {zn: CD[CD.zone == zn].groupby('model')[['hr_bias', 'hr_mae']].mean().round(2).sort_values('hr_mae').head(6).reset_index().to_dict('records') for zn in ZONES if (CD.zone == zn).any()}
    state = dict(series=series, obsT={k: obsT[k] for k in series}, obsD={k: obsD.get(k) for k in series}, S=S, CT=CT, scr=scr, dew=dew, qc_drop=qc_drop, built=t0.isoformat()[:19] + 'Z')
    pd.to_pickle(state, os.path.join(F.CACHE, 'rank_state.pkl'))
    print('state saved', (dt.datetime.now(dt.timezone.utc) - t0).seconds, 's', flush=True)
    return state


# ─────────────────────────── the choice per zone ───────────────────────────
def folds_of(sub):
    keys = sub.drop_duplicates('key')[['key', 'lat', 'lon']].sort_values('lat').values.tolist()
    cl = {}; nxt = 0
    for k, la, lo in keys:
        hit = next((cl[j] for j, la2, lo2 in keys if j in cl and hav(la, lo, la2, lo2) <= 20), None)
        if hit is None: hit = nxt; nxt += 1
        cl[k] = hit
    return {k: cl[k] % 2 for k in cl}


def station_d(sub):
    st = sub.groupby(['key', 'model']).d.mean().unstack()
    return st.loc[:, st.notna().sum() >= 0.6 * len(st)]


def blend_series(M, members):
    cols = ['T_' + m for m in members]
    if not all(c in M for c in cols): return None
    return M[cols].astype(float).mean(axis=1, skipna=False)


def cand_series(M, cand):
    """a candidate is a model name or a '+'-joined equal-weight blend"""
    return blend_series(M, cand.split('+')) if '+' in cand else (M['T_' + cand] if 'T_' + cand in M else None)


def cand_horizon(c, horizons):
    """a blend lives as long as its longest member; its shortest member fades out at its own horizon"""
    return max(horizons.get(m, 0) for m in c.split('+'))


def select_models(state, horizons):
    CT = state['CT']; S = {s['key']: s for s in state['S']}; out = {}; rep = {}
    for zn in ZONES:
        sub = CT[CT.zone == zn]
        if sub.empty: continue
        fold = folds_of(sub); st = station_d(sub)
        single = st.mean().sort_values()
        top = [m for m in single.index if horizons.get(m, 0) >= 96 and m not in ('best_match',)][:4]
        blends = []
        for i in range(len(top)):
            for j in range(i + 1, len(top)):
                blends.append(top[i] + '+' + top[j])
                for k2 in range(j + 1, len(top)): blends.append(top[i] + '+' + top[j] + '+' + top[k2])
        blends = [b for b in blends if cand_horizon(b, horizons) >= FULL_H]
        # blends scored exactly like the singles: paired with the reference model on the same station-window hours
        rows = []
        for k in sub.key.unique():
            M = state['series'][k]; o = state['obsT'][k]; s = S[k]
            for (a, b), mask in window_of(M.index, s):
                Mi = M[mask]
                if 'T_' + REF not in Mi or Mi['T_' + REF].notna().sum() < 200: continue
                for c in blends:
                    x = cand_series(Mi, c)
                    if x is None or x.notna().sum() < 200: continue
                    sc = day_scores(o, {'c': x, 'r': Mi['T_' + REF]}, synop=s['set'] == 'isd')
                    if sc: rows.append(dict(key=k, model=c, d=((sc['c']['tx_mae'] - sc['r']['tx_mae']) + (sc['c']['tn_mae'] - sc['r']['tn_mae'])) / 2,
                                            tx_mae=sc['c']['tx_mae'], tx_bias=sc['c']['tx_bias'], tn_mae=sc['c']['tn_mae'], tn_bias=sc['c']['tn_bias'], hr_mae=sc['c']['hr_mae'], hr_bias=sc['c']['hr_bias']))
        BL = pd.DataFrame(rows)
        if not BL.empty:
            bst = BL.groupby(['key', 'model']).d.mean().unstack(); bst = bst.loc[:, bst.notna().sum() >= 0.6 * len(st)]
            st = st.join(bst, how='left')
        rank = st.mean().sort_values()
        primaries = [m for m in rank.index if cand_horizon(m, horizons) >= MIN_PRIMARY_H]
        best = primaries[0] if primaries else INCUMBENT
        # the incumbent is ecmwf_ifs; where it has no archive for most of the zone's station-windows (2025 synop windows),
        # its own 0.25-degree run (the same IFS system) stands in for it, and the report says so
        inc = INCUMBENT if (INCUMBENT in st and st[INCUMBENT].notna().sum() >= 0.6 * len(st)) else REF
        gains = []
        for f in (0, 1):
            ks = [k for k in st.index if fold.get(k) == f]
            x = st.loc[ks, [best, inc]].dropna() if inc in st and best in st and best != inc else pd.DataFrame()
            gains.append(None if x.empty else round(float((x[best] - x[inc]).mean()), 3))
        adopt = best not in (INCUMBENT, 'best_match') and all(g is not None and g <= -ADOPT_GAIN_C for g in gains)
        members = best.split('+') if adopt else ['best_match']
        fb = None
        if adopt and cand_horizon(best, horizons) < FULL_H:
            full = [m for m in rank.index if '+' not in m and horizons.get(m, 0) >= FULL_H]
            fb = full[0] if full else 'best_match'
            if fb == INCUMBENT: fb = 'best_match'
        def agg(m):
            if '+' in m:
                x = BL[BL.model == m] if not BL.empty else pd.DataFrame()
            else:
                x = sub[sub.model == m]
            return x.groupby('key')[['tx_mae', 'tx_bias', 'tn_mae', 'tn_bias', 'hr_mae', 'hr_bias']].mean().mean().round(2).to_dict() if len(x) else None
        rep[zn] = dict(stations=int(sub.key.nunique()), sets=sub.drop_duplicates('key').set.value_counts().to_dict(),
                       ranking=[dict(model=m, dScoreVsIfs025=round(float(v), 3), horizonH=cand_horizon(m, horizons), stations=int(st[m].notna().sum())) for m, v in rank.items()],
                       bestPrimary=best, incumbentScoredAs=inc, foldGainVsIncumbentC=gains, adopted=adopt, served=members, fallback=fb,
                       rule='candidates: every single model and the equal-weight blends of 2-3 of the four best singles that contain a full-horizon member; a challenger replaces the incumbent (%s, served as best_match) only if it covers >= %d h and is >= %.1f C better (mean of daily max and min MAE, station-paired) on BOTH spatial folds; a short-horizon choice names the best full-horizon model as its fallback' % (INCUMBENT, MIN_PRIMARY_H, ADOPT_GAIN_C),
                       scores={m: agg(m) for m in dict.fromkeys([best, INCUMBENT])})
        out[zn] = dict(temperatureModels=members, horizonFallback=fb)
        print(zn, 'served', members, 'fallback', fb, 'fold gains', gains, 'top', [(r['model'], r['dScoreVsIfs025']) for r in rep[zn]['ranking'][:5]], flush=True)
    return out, rep


# ─────────────────────────── before / after (internal test) ───────────────────────────
def served_after(M, zm):
    mem = zm.get('temperatureModels') or ['best_match']
    return cand_series(M, '+'.join(mem)) if mem != ['best_match'] else (M['T_best_match'] if 'T_best_match' in M else None)


def day_scores(o, series, daily_override=None, synop=False):
    """o: obs; series: dict name -> forecast Series on the same hours. -> dict name -> metrics on common days"""
    J = pd.concat([o.rename('o')] + [v.rename(k) for k, v in series.items()], axis=1, join='inner').dropna()
    if len(J) < 100: return None
    J['day'] = pkt_day(J.index); J['uh'] = J.index.hour
    g = J.groupby('day'); n = g.size()
    keep = n[n >= (7 if synop else 20)].index
    if len(keep) < 7: return None
    out = {}
    ox, on = g.o.max().loc[keep], g.o.min().loc[keep]
    for k in series:
        fx, fn = g[k].max().loc[keep], g[k].min().loc[keep]
        if daily_override and k in daily_override:
            ov = daily_override[k]
            fx = fx.copy(); fn = fn.copy()
            for d in keep:
                if d in ov: fx[d], fn[d] = ov[d]
        e = J[k] - J.o
        out[k] = dict(tx_bias=float((fx - ox).mean()), tx_mae=float((fx - ox).abs().mean()), tn_bias=float((fn - on).mean()), tn_mae=float((fn - on).abs().mean()),
                      hr_bias=float(e.mean()), hr_mae=float(e.abs().mean()), days=int(len(keep)))
    return out


def evaluate(state, zmodels):
    S = {s['key']: s for s in state['S']}; series = state['series']; obsT = state['obsT']; obsD = state['obsD']; scr = state['scr']
    # 1. replay the v91.17.69 served path on the incumbent series, wherever the incumbent (ecmwf_ifs) exists
    rows = []
    for k, M in series.items():
        s = S[k]
        if 'T_best_match' not in M: continue
        x = M[M['T_best_match'].notna()]
        if len(x) < 200: continue
        days = sorted(set(pkt_day(x.index).strftime('%Y-%m-%d')))
        rows.append(dict(key=k, lat=s['lat'], lon=s['lon'], elev=s['elev'], time=[t.strftime('%Y-%m-%dT%H:%M:%SZ') for t in x.index], tm=[None if pd.isna(v) else float(v) for v in x['T_best_match']],
                         rh=[None if pd.isna(v) else float(v) for v in x.get('rh_best_match', pd.Series(index=x.index, dtype=float))], wind=[None if pd.isna(v) else float(v) for v in x.get('wind_best_match', pd.Series(index=x.index, dtype=float))], days=days))
    fin = os.path.join(F.CACHE, 'before_in.json'); fout = os.path.join(F.CACHE, 'before_out.json')
    json.dump(rows, open(fin, 'w'))
    subprocess.run(['node', os.path.join(HERE, 'temp_zone_before.mjs'), fin, fout], check=True)
    B = json.load(open(fout))
    # 2. the MACH running bias states (own station, and neighbours <= 5 km / 150 m), against the ZONE model at each station
    trusted = {k for k, v in scr.items() if v['verdict'] == 'trusted'}
    hum_ok = {k for k, v in scr.items() if v.get('humidityTrusted')}
    zone_series = {}
    for k, M in series.items():
        zm = zmodels.get(S[k]['zone']) or dict(temperatureModels=['best_match'])
        zone_series[k] = served_after(M, zm)
    l2 = {}; l2d = {}
    for k in trusted:
        if k in series and zone_series.get(k) is not None:
            l2[k] = l2_daily_state((obsT[k] - zone_series[k]).dropna())
            if k in hum_ok and obsD.get(k) is not None and 'Td_best_match' in series[k]:
                l2d[k] = l2_daily_state((obsD[k] - series[k]['Td_best_match']).dropna())
    res = []
    for k, M in series.items():
        s = S[k]; o = obsT[k]; zs = zone_series.get(k)
        if zs is None or k not in B: continue
        inc = M['T_best_match']   # what best_match served at the time (ICON before Oct 2025, ECMWF IFS 9 km since)
        adj = pd.Series(B[k]['adj'], index=M[M['T_best_match'].notna()].index, dtype=float)
        before = (inc + adj.reindex(inc.index).fillna(0)).where(inc.notna())
        ser = {'before': before, 'after_L0': zs}
        ov = {}
        if B[k]['daily']:
            raw = pd.concat([inc.rename('f')], axis=1).dropna(); g = raw.groupby(pkt_day(raw.index)).f
            mx, mn = g.max(), g.min(); ov['before'] = {}
            for d, v in B[k]['daily'].items():
                dd = pd.Timestamp(d, tz='UTC')
                if dd in mx.index: ov['before'][dd] = (mx[dd] + v['tmax'], mn[dd] + v['tmin'])
        near = [j for j in trusted if j != k and j in l2 and hav(s['lat'], s['lon'], S[j]['lat'], S[j]['lon']) <= L2['radius_km'] and abs(s['elev'] - S[j]['elev']) <= L2['dz_m']]
        city = [j for j in trusted if j != k and j in l2 and hav(s['lat'], s['lon'], S[j]['lat'], S[j]['lon']) <= L2['city_km'] and abs(s['elev'] - S[j]['elev']) <= L2['dz_m']]
        def city_corr(base, states, cap, members):
            P = pd.concat([l2_apply(base, states[j], cap) - base for j in members], axis=1)
            cnt = (P.abs() > 1e-9).sum(axis=1); c = P.where(P.abs() > 1e-9).median(axis=1)
            return base + c.where(cnt >= L2['min_city'], 0)
        if near and len(city) >= L2['min_city'] and s['zone'] in L2['zones_t']:
            ser['after_L2_city'] = city_corr(zs, l2, L2['cap_c'], city)   # tested; NOT served (see t_reach_km)
        if k in l2 and s['zone'] in L2['zones_t']:
            ser['after_L2_own'] = l2_apply(zs, l2[k], L2['cap_c'])
        base = {'before': ser['before'], 'raw_best_match': inc, 'after_L0': zs}
        sc = day_scores(o, base, ov, synop=s['set'] == 'isd')
        if not sc: continue
        for name, v in sc.items(): res.append(dict(key=k, set=s['set'], zone=s['zone'], series=name, cmp='base', **v))
        # the running correction, paired with L0 on the hours it actually served (after its warm-up)
        for nm in ('after_L2_own', 'after_L2_city'):
            if nm not in ser: continue
            act = (ser[nm] - zs).abs() > 1e-9
            if act.sum() < 100: continue
            sc2 = day_scores(o[o.index.isin(act[act].index)], {'after_L0': zs[act], nm: ser[nm][act]}, synop=s['set'] == 'isd')
            if sc2:
                for name, v in sc2.items(): res.append(dict(key=k, set=s['set'], zone=s['zone'], series=name, cmp=nm, **v))
        # dew point (plains humidity): raw vs L2 at the station and from a neighbour
        if obsD.get(k) is not None and 'Td_best_match' in M and k in hum_ok:
            td = M['Td_best_match']; dser = {'dew_raw': td}
            if k in l2d and s['zone'] in L2['zones_td']: dser['dew_L2_own'] = l2_apply(td, l2d[k], L2['cap_dew_c'])
            cityd = [j for j in city if j in l2d]
            if near and len(cityd) >= L2['min_city'] and s['zone'] in L2['zones_td']: dser['dew_L2_city'] = city_corr(td, l2d, L2['cap_dew_c'], cityd)
            J = pd.concat([obsD[k].rename('o')] + [v.rename(n) for n, v in dser.items()], axis=1, join='inner').dropna()
            if len(J) >= 100:
                for n in dser: res.append(dict(key=k, set=s['set'], zone=s['zone'], series=n, hr_bias=float((J[n] - J.o).mean()), hr_mae=float((J[n] - J.o).abs().mean()), days=int(J.index.normalize().nunique())))
    R = pd.DataFrame(res)
    summ = {}
    cols = ['tx_bias', 'tx_mae', 'tn_bias', 'tn_mae', 'hr_bias', 'hr_mae']
    groups = (('all', None), ('pmd_export: Aug-Sep 2026, outside every table fit', ['pmd_export']), ('pmd_lake: in the station-table fit period', ['pmd_lake']),
              ('isd: in the synop-table fit period', ['isd']), ('mach: independent of every PMD table', ['mach', 'sheet']))
    for zn in ZONES:
        for grp_name, sets in groups:
            x = R[(R.zone == zn) & (R.cmp == 'base')]
            if sets: x = x[x.set.isin(sets)]
            if x.empty: continue
            t = x.groupby('series')[cols].mean().round(2); n = x.groupby('series').key.nunique()
            summ.setdefault(zn, {})[grp_name] = {sname: dict(stations=int(n[sname]), **t.loc[sname].to_dict()) for sname in t.index}
        for nm in ('after_L2_own', 'after_L2_city'):
            x = R[(R.zone == zn) & (R.cmp == nm)]
            if x.empty: continue
            t = x.groupby('series')[cols].mean().round(2); n = x.groupby('series').key.nunique()
            summ.setdefault(zn, {})['running correction ' + nm[9:] + ' (paired, serving hours only)'] = {sname: dict(stations=int(n[sname]), **t.loc[sname].to_dict()) for sname in t.index}
    dsum = {}
    for zn in ZONES:
        x = R[(R.zone == zn) & R.series.str.startswith('dew')]
        if x.empty: continue
        for nm in ('dew_L2_own', 'dew_L2_city'):
            ks = set(x[x.series == nm].key)
            if not ks: continue
            y = x[x.key.isin(ks) & x.series.isin(['dew_raw', nm])]
            dsum.setdefault(zn, {})[nm] = {sn: dict(stations=int(len(ks)), **g[['hr_bias', 'hr_mae']].mean().round(2).to_dict()) for sn, g in y.groupby('series')}
    return summ, dsum, R


def write_outputs(state, zmodels, rep, summ, dsum, horizons):
    Z = Zoner()
    # the mountain outline: the GB + Chitral tehsils, dissolved and simplified (about 1 km)
    from shapely.ops import unary_union
    m = unary_union([s for s, pr in Z.polys if pr.get('province') == 'Gilgit Baltistan' or 'Chitral' in str(pr.get('district', ''))]).buffer(0.01).simplify(0.01)
    geoms = list(m.geoms) if m.geom_type == 'MultiPolygon' else [m]
    outline = [[[[round(x, 3), round(y, 3)] for x, y in g.exterior.coords]] + [[[round(x, 3), round(y, 3)] for x, y in h.coords] for h in g.interiors] for g in geoms if g.area > 0.001]
    units = json.load(open(os.path.join(NL, 'server', 'contract', 'units.json')))
    settle = json.load(open(os.path.join(NL, 'data', 'settlement-elevation.json')))['units']
    uz = {}
    for u in units:
        sv = settle.get(u['unitId']); z = sv['settlementElevM'] if sv and sv.get('settlementElevM') is not None and abs(sv['settlementElevM'] - (u.get('elevM') or 0)) > 150 else u.get('elevM')
        uz[u['unitId']] = unit_zone(u, z)
    # client pre-filter: boxes around the mountain-zone tehsils (a request inside one asks for the zone models; the
    # server then decides per point from the resolved height)
    from shapely.geometry import box
    mt = unary_union([s for s, pr in Z.polys if uz.get(pr.get('uid')) == 'mountain']).buffer(0.05)
    boxes = [[round(g.bounds[1], 2), round(g.bounds[0], 2), round(g.bounds[3], 2), round(g.bounds[2], 2)] for g in (mt.geoms if mt.geom_type == 'MultiPolygon' else [mt]) if g.area > 0.01]
    zones = {}
    rules = {'mountain': 'inside a Gilgit-Baltistan or Chitral tehsil, or ground at or above %d m anywhere' % MOUNTAIN_M, 'coast': 'within %d km of the coastline' % COAST_KM,
             'hills': 'ground at %d-%d m outside the mountain zone' % (HILLS_M, MOUNTAIN_M), 'plains': 'the rest'}
    for zn in ZONES:
        z = zmodels.get(zn, dict(temperatureModels=['best_match'], horizonFallback=None))
        mem = z['temperatureModels']
        zones[zn] = dict(rule=rules[zn], temperatureModels=mem, temperatureModel='+'.join(mem), horizonFallback=z['horizonFallback'],
                         blendHours=24 if (len(mem) > 1 or z['horizonFallback']) else None, combine='equal-weight mean of the members that cover the hour; a member leaving at its horizon is faded out over blendHours' if len(mem) > 1 else None,
                         horizonsH={m: horizons.get(m) for m in mem})
    extra = []
    for z in zones.values():
        for m in z['temperatureModels'] + ([z['horizonFallback']] if z['horizonFallback'] else []):
            if m != 'best_match' and m not in extra: extra.append(m)
    out = dict(
        built=dt.datetime.now(dt.timezone.utc).isoformat()[:19] + 'Z',
        version='tc-91.17.70',
        method='one temperature model per zone, chosen by day-1 verification (daily max and min, Pakistan days) of %d candidate models at %d stations, paired per station-window, two spatial folds; adoption rule in selection.rule. Served at the point height with the provider\'s DEM downscaling. This file stores model names and a score summary only: no number fitted to any station record is applied to a served value.' % (len(CAND), sum(r['stations'] for r in rep.values())),
        script='nigraan-local/scripts/temp_zone_fetch.py + temp_zone_rank.py',
        source=dict(forecasts='MAch weather feed (the provider\'s previous-runs archive, day-1 lead), via the local /px route',
                    verification='INTERNAL ONLY, used to rank models and never to adjust output: PMD mountain AWS lake (%s), PMD EWS export (2026-08-21 to 2026-09-24), PMD synop via NOAA ISD-Lite (Jan/Apr/Jul 2025); AGN MACH fleet history and live sheets (own data)' % ', '.join('%s..%s' % w for w in F.LAKE_WINDOWS),
                    geometry='pk-tehsils.json (the build\'s tehsil boundaries), settlement-elevation.json (GHS-POP / Copernicus GLO-90), the build\'s coastline (outlook.mjs)'),
        licence=dict(forecast='MAch commercial feed (credited on the Sources page)', geometry='as recorded in pk-tehsils.json and settlement-elevation.json', attribution='Weather data: MAch. Terrain: Copernicus GLO-90 DEM (c) ESA/DLR/Airbus, provided under COPERNICUS by the European Union and ESA. Population: GHS-POP (European Commission, JRC), CC BY 4.0.', url='https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model; https://human-settlement.emergency.copernicus.eu/'),
        n=dict(stations=int(sum(r['stations'] for r in rep.values())), candidateModels=len(CAND)),
        zones=zones,
        zoneRule=dict(mountainOutline=outline, mountainMinElevM=MOUNTAIN_M, hillsMinElevM=HILLS_M, coastKm=COAST_KM, coastline=COASTLINE),
        request=dict(models=','.join(['best_match'] + extra) if extra else None, why='one request carries best_match (every non-temperature variable) and the zone temperature models; verification.mjs mergeZone folds it into one plain response'),
        temperatureFamily=dict(hourly=['temperature_2m', 'apparent_temperature', 'dew_point_2m', 'relative_humidity_2m', 'wet_bulb_temperature_2m'],
                               daily=['temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean', 'apparent_temperature_max', 'apparent_temperature_min', 'apparent_temperature_mean',
                                      'dew_point_2m_max', 'dew_point_2m_min', 'dew_point_2m_mean', 'relative_humidity_2m_max', 'relative_humidity_2m_min', 'relative_humidity_2m_mean',
                                      'wet_bulb_temperature_2m_max', 'wet_bulb_temperature_2m_min', 'wet_bulb_temperature_2m_mean'],
                               why='temperature and the humidity that goes with it come from one model, so dew point, wet bulb and apparent temperature stay physically consistent'),
        l2Rule=dict(L2, screen={k: v for k, v in SCREEN.items() if not isinstance(v, list)}, why='the MACH running correction (fleet.mjs runningBias) and its model-independent siting screen; constants as tested in this script (evaluate: after_L2_city, dew_L2_city; after_L2_own is the station itself)'),
        clientBoxes=boxes,
        horizonsH=dict(horizons, measuredAt='2026-09-25, forecast_days=16 at Gilgit: the last hour each model fills'),
        selection=dict(incumbent=INCUMBENT + ' (what best_match serves over Pakistan since Oct 2025)', rule=next(iter(rep.values()))['rule'], perZone={zn: dict(served=r['served'], fallback=r['fallback'], bestPrimary=r['bestPrimary'], incumbentScoredAs=r['incumbentScoredAs'], foldGainVsIncumbentC=r['foldGainVsIncumbentC'], stations=r['stations'], top=r['ranking'][:5]) for zn, r in rep.items()}),
        scoreSummary=dict(note='internal verification, day-1 daily max / min / hourly MAE and bias in C, station means; the record of why each model was chosen. Not shown to customers and not applied to any value.',
                          perZone=summ),
        units=uz,
    )
    json.dump(out, open(os.path.join(NL, 'data', 'model-zone.json'), 'w'), indent=1)
    os.makedirs(os.path.join(LAKE, 'reports'), exist_ok=True)
    json.dump(dict(built=out['built'], internal='INTERNAL: PMD-derived verification numbers; never a customer output', selection=rep, beforeAfter=summ, dewPoint=dsum, dewModelRanking=state['dew'],
                   pmdNetworkLapseQcDropped=state['qc_drop'], machScreen=state['scr'], l2Rule=L2, screenRule=SCREEN), open(os.path.join(LAKE, 'reports', 'temp_zone_rank.json'), 'w'), indent=1, default=str)
    # the MACH siting screen, keyed by the live fleet keys (coordinates within 300 m), for fleet.mjs to start from
    reg = json.load(open(os.path.join(NL, 'data', 'mach-fleet-stations.json')))['stations']; S = {s['key']: s for s in state['S']}
    seed = {}
    for k, v in state['scr'].items():
        s = S.get(k)
        if not s: continue
        live = [r['key'] for r in reg if r.get('lat') is not None and r.get('lon') is not None and hav(s['lat'], s['lon'], r['lat'], r['lon']) <= 0.3]
        for lk in live: seed[lk] = dict(verdict=v['verdict'], why=v.get('why'), humidityTrusted=bool(v.get('humidityTrusted')), dayAnomC=v.get('dayAnomC'), nightAnomC=v.get('nightAnomC'), neighbours=v.get('neighbours'), historyId=k, elevM=s['elev'])
    json.dump(dict(built=out['built'], method='model-independent neighbour screen of the MACH fleet history: each station against the median of its MACH neighbours within %d km and %d m, by day (%s h PKT) and night (%s h PKT); sun on the sensor = warm by day and not by night; bad site = offset beyond %.1f C; failing sensor = scatter IQR above %.1f C. No forecast model is involved.' % (SCREEN['radius_km'], SCREEN['dz_m'], '11-16', '00-05', SCREEN['abs_c'], SCREEN['iqr_c']),
                   source='AGN MACH fleet history (Weather Underground record 2023-01..2026-04 and live sheets 2026-04..), station-lake/archive/fleet/history', licence='AGN own data', script='nigraan-local/scripts/temp_zone_rank.py screen_mach',
                   rule=SCREEN, stations=seed), open(os.path.join(NL, 'data', 'mach-siting.json'), 'w'), indent=1)
    print('wrote data/model-zone.json, data/mach-siting.json, station-lake/reports/temp_zone_rank.json')


def run():
    horizons = {'best_match': 384, 'ecmwf_ifs': 361, 'ecmwf_ifs025': 363, 'ecmwf_aifs025_single': 372, 'gfs_seamless': 384, 'ncep_aigfs025': 384, 'icon_seamless': 181,
                'gem_seamless': 241, 'ukmo_seamless': 169, 'meteofrance_seamless': 109, 'jma_seamless': 270, 'cma_grapes_global': 129}   # [measured] 2026-09-25, see horizonsH
    pk = os.path.join(F.CACHE, 'rank_state.pkl')
    state = pd.read_pickle(pk) if ('--reuse' in sys.argv and os.path.exists(pk)) else main()
    zm, rep = select_models(state, horizons)
    summ, dsum, R = evaluate(state, zm)
    R.to_csv(os.path.join(LAKE, 'reports', 'temp_zone_before_after.csv'), index=False)
    print(json.dumps(summ, indent=1)); print(json.dumps(dsum, indent=1))
    write_outputs(state, zm, rep, summ, dsum, horizons)


if __name__ == '__main__':
    run()
