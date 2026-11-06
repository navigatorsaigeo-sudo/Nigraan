"""v91.17.274 PLUVIAL · the served pluvial/flash-flood level against DATED references: AGN's own MACH gauges.

Truth: QC'd hourly rain at the MACH history stations (Mach1-36, Weather Underground 5-min record -> hourly sums, DATA LAKE copy
station-lake/archive/fleet/history/mach_history_hourly.parquet), 2025 monsoon (PKT days 12 Jun - 30 Sep, after the replay's spin-up).
Gauge events per tehsil-day: the wettest QC'd gauge hour in the tehsil reached the engine's GAUGE rain-intensity rungs (the ladder the
model rungs flood.rainBands were frequency-matched to: 2 / 7 / 20 / 50 mm/h; the 2 mm/h rung is ordinary rain and is not scored as an
event). Gauge QC (all rules from data or a cited source, none typed here):
  - registry exclusions (data/mach-fleet-stations.json `excluded`, matched by WU id) and stations that record no rain at all in the
    whole monsoon (a dead rain sensor);
  - an hour above the world 60-min record (305 mm, Holt, Missouri, 22 Jun 1947; WMO Archive of Weather and Climate Extremes) is
    impossible and dropped;
  - corroboration: an event hour (>= 7 mm) counts only if another live gauge within 40 km (the city-cluster radius of the v273
    accuracy monitor) recorded rain in the same or an adjacent hour; a station with no live neighbour that hour is 'unverifiable'
    and reported separately (sensitivity).
  The 'stuck screen' (server/api/stuckscreen.mjs) judges whole-record replays of the 2026 MACH database feed; the 2023-2026 WU 5-min
  history was already QC'd at build (README_MACH history_5min) - frozen rain shows as no rain, which the corroboration rule cannot
  turn into a false event.
Forecast:
  (1) the served level replayed by the page engine (scripts/flood273/replay2025.mjs, IFS as-issued rain, lead 0-6 h, two bounds of the
      hourly peak: 'even' and 'front'), per tehsil-day;
  (2) the rain input alone: IFS as-issued 3-h rain at the gauge (LAMHA nwp/points, bilinear), lead 0-6 h and lead 15-21 h; and the
      tehsil-point series the replay read;
  (3) the place term: the replay's score divided by the page's own rain drive on the same input (max of the intensity rung index and
      the 6-h accumulation index, read from the page's rule table), i.e. what runoff / retention / wetness / rarity do to the rain.
Scores: per level, hit rate (POD), false-alarm ratio (FAR), with 95 % CIs from 2000 bootstrap resamples of whole days (events on one
day are not independent), and ROC AUC with the same day-block CI.
Output: data/pluv274/gauge-verify.json.   python3 gauge_verify.py <root> <uploads>"""
import json, os, re, sys, numpy as np, pandas as pd, geopandas as gpd
from shapely.geometry import Point
from sklearn.metrics import roc_auc_score

ROOT, UP = sys.argv[1], sys.argv[2]
RNG = np.random.default_rng(274)
LAKE = os.path.join(UP, 'DATA LAKE', 'station-lake', 'archive', 'fleet', 'history')
NIGH = os.path.join(UP, 'NIGRAAN', 'nig', 'station-lake', 'archive', 'fleet', 'history')
W = '/tmp/claude-0/-home-claude/884c0fe0-d7f4-5a90-a62f-50507e3d179e/scratchpad/flood273/work'
OUT = os.path.join(ROOT, 'data', 'pluv274')
os.makedirs(OUT, exist_ok=True)

# ---- the page's own rule values (read, not typed) ----
PAGE = open(os.path.join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), encoding='utf8').read()
def frv(name):
    m = re.search(name + r':\s*\{\s*value:\s*(\[[^\]]*\]|[0-9.]+)', PAGE)
    return json.loads(m.group(1))
BANDS, ANCH, ABOVE, ACC = frv('rainBands'), frv('rainAnchors'), frv('rainAboveTop'), frv('accumFullScale')
CUTS = sorted(int(x) for x in re.findall(r"\{min:(\d+), key:'(?:severe|high|moderate|low)'", PAGE))  # 25,45,65,82
GAUGE_RUNGS = [2, 7, 20, 50]   # flood.rainBands basis text: 'the gauge ladder 2 / 7 / 20 / 50 mm/h'
assert re.search(r'gauge ladder 2 / 7 / 20 / 50 mm/h', PAGE)
WMO_1H_MAX = 305.0
CLUSTER_KM = 40.0

def pulse(mm):
    mm = np.asarray(mm, float); b, a = BANDS, ANCH
    out = np.where(mm <= 0, 0.0,
          np.where(mm < b[0], mm / b[0] * a[0],
          np.where(mm < b[1], a[0] + (mm - b[0]) / (b[1] - b[0]) * (a[1] - a[0]),
          np.where(mm < b[2], a[1] + (mm - b[1]) / (b[2] - b[1]) * (a[2] - a[1]),
          np.where(mm < b[3], a[2] + (mm - b[2]) / (b[3] - b[2]) * (a[3] - a[2]),
                   np.minimum(100, a[3] + (mm - b[3]) * ABOVE))))))
    return np.clip(out, 0, 100)

# ---- gauges ----
C = pd.read_csv(os.path.join(NIGH, 'mach_history_coords_v192.csv'))
reg = json.load(open(os.path.join(ROOT, 'data', 'mach-fleet-stations.json')))
regs = reg.get('stations', reg) if isinstance(reg, dict) else reg
excl_names = set()
for s in (regs if isinstance(regs, list) else regs.values()):
    if isinstance(s, dict) and (s.get('excluded') or s.get('exclude')):
        for k in ('wu', 'wuId', 'stationId', 'id', 'key', 'name'):
            if s.get(k): excl_names.add(str(s[k]))
C['excluded'] = C.wu_id.isin(excl_names) | C.name.isin(excl_names)
H = pd.read_parquet(os.path.join(LAKE, 'mach_history_hourly.parquet'), columns=['mach_id', 'hour_utc', 'rain_mm', 'n'])
H = H[(H.hour_utc >= '2025-05-31 19:00') & (H.hour_utc < '2025-09-30 19:00')].copy()
H['pkt'] = H.hour_utc.dt.tz_convert(None) + pd.Timedelta(hours=5)
season_tot = H.groupby('mach_id').rain_mm.sum()
dead = sorted(season_tot[season_tot <= 0].index)
qc = {'stationsInFile': int(H.mach_id.nunique()), 'deadRainSensor': dead,
      'registryExcluded': sorted(C[C.excluded].mach_id)}
H = H[~H.mach_id.isin(dead + qc['registryExcluded'])]
qc['hoursAboveWorldRecord'] = int((H.rain_mm > WMO_1H_MAX).sum())
H.loc[H.rain_mm > WMO_1H_MAX, 'rain_mm'] = np.nan
C = C.set_index('mach_id')
ids = sorted(H.mach_id.unique())
def km(a, b):
    la1, lo1, la2, lo2 = map(np.radians, (C.lat[a], C.lon[a], C.lat[b], C.lon[b]))
    return 6371 * 2 * np.arcsin(np.sqrt(np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2))
NB = {a: [b for b in ids if b != a and km(a, b) <= CLUSTER_KM] for a in ids}
P = H.pivot_table(index='pkt', columns='mach_id', values='rain_mm', aggfunc='first')
P = P.reindex(pd.date_range(P.index.min(), P.index.max(), freq='h'))
wet = (P > 0).astype(float).where(P.notna())
wet3 = wet.rolling(3, center=True, min_periods=1).max()     # rain in the same or an adjacent hour
status = pd.DataFrame('ok', index=P.index, columns=P.columns)
for a in ids:
    ev = P[a] >= GAUGE_RUNGS[1]
    if not NB[a]:
        status.loc[ev, a] = 'unverifiable'; continue
    nb_live = wet3[NB[a]].notna().any(axis=1); nb_wet = (wet3[NB[a]] > 0).any(axis=1)
    status.loc[ev & nb_live & ~nb_wet, a] = 'uncorroborated'
    status.loc[ev & ~nb_live, a] = 'unverifiable'
qc['eventHours'] = {k: int(((P >= GAUGE_RUNGS[1]) & (status == k)).sum().sum()) for k in ('ok', 'uncorroborated', 'unverifiable')}

# ---- tehsil of each gauge ----
T = gpd.read_file(os.path.join(ROOT, 'data', 'pk-tehsils.json'))[['uid', 'geometry']]
G = gpd.GeoDataFrame({'mach_id': ids}, geometry=[Point(C.lon[i], C.lat[i]) for i in ids], crs=T.crs)
G = gpd.sjoin(G, T, how='left', predicate='within').set_index('mach_id')
UID = G.uid.to_dict()

def gauge_day(strict):
    """per (uid, PKT date): wettest QC'd gauge hour and wettest 6-h total."""
    Q = P.copy()
    bad = status.isin(['uncorroborated', 'unverifiable'] if strict else ['uncorroborated'])
    Q = Q.mask(bad)
    rows = []
    for a in ids:
        s = Q[a]; d = s.groupby(s.index.normalize())
        mx = d.max(); n = d.count(); s6 = s.rolling(6, min_periods=4).sum().groupby(s.index.normalize()).max()
        for day in mx.index:
            if n[day] < 18: continue    # at least 3/4 of the day's hours reported
            rows.append((UID.get(a), a, day.strftime('%Y-%m-%d'), mx[day], s6.get(day, np.nan)))
    D = pd.DataFrame(rows, columns=['uid', 'g', 'date', 'gmax', 'g6'])
    return D.groupby(['uid', 'date']).agg(gmax=('gmax', 'max'), g6=('g6', 'max'), ng=('g', 'nunique')).reset_index()

# ---- forecast: the replayed served level and its rain input ----
R = {k: json.load(open(f'{W}/replay2025{k}.json')) for k in ('', '_front')}
S = {k: json.load(open(f'{W}/ifs2025_hourly{k}.json')) for k in ('', '_front')}
dates = R[''].dates if hasattr(R[''], 'dates') else R['']['dates']
i0 = dates.index('2025-06-12')

def fc_rows(tag):
    rows = []
    for u in set(UID.values()):
        if u is None or u not in R[tag]['units']: continue
        v = R[tag]['units'][u]; hr = S[tag]['units'][u]
        for i in range(i0, len(dates)):
            h = np.array([x if x is not None else np.nan for x in hr[i]], float) / 10
            pk = np.nanmax(h); s6 = np.nanmax(pd.Series(h).rolling(6, min_periods=1).sum())
            drive = max(float(pulse(pk)), min(100.0, s6 / ACC * 100))
            rows.append((u, dates[i], v['s'][i], v['L'][i], pk, s6, drive))
    return pd.DataFrame(rows, columns=['uid', 'date', 'score', 'L', 'fpk', 'f6', 'drive'])

def boot_days(df, fn, B=int(os.environ.get('PLUV_BOOT', '2000'))):
    days = df.date.unique(); idx = {d: np.where(df.date.values == d)[0] for d in days}
    est = fn(df); vals = []
    for _ in range(B):
        pick = RNG.choice(days, len(days)); ii = np.concatenate([idx[d] for d in pick])
        try:
            v = fn(df.iloc[ii])
            if v is not None and np.isfinite(v): vals.append(v)
        except Exception: pass
    if est is None or not vals: return [None if est is None else round(float(est), 3), None, None]
    lo, hi = np.percentile(vals, [2.5, 97.5]); return [round(float(est), 3), round(float(lo), 3), round(float(hi), 3)]

def pod(df, L, ev): e = df[df[ev].astype(bool)]; return (e.L >= L).mean() if len(e) else None
def far(df, L, ev): w = df[df.L >= L]; return (~w[ev].astype(bool)).mean() if len(w) else None
def auc(df, col, ev):
    y = df[ev].values; return roc_auc_score(y, df[col].values) if 0 < y.sum() < len(y) else None

out = {'built': pd.Timestamp.now('UTC').isoformat(), 'qc': qc, 'gaugeRungs_mmh': GAUGE_RUNGS, 'modelRungs_mmh': BANDS,
       'levelCuts': CUTS, 'stations': {a: {'uid': UID.get(a), 'neighbours40km': len(NB[a])} for a in ids}, 'served': {}, 'rainInput': {}}
for strict in (False, True):
    GD = gauge_day(strict)
    for tag in ('', '_front'):
        F = fc_rows(tag); M = F.merge(GD, on=['uid', 'date'])
        M = M[M.L.notna() & (M.L >= 0)].copy()
        key = ('strict' if strict else 'main') + (tag or '_even')
        res = {'tehsilDays': int(len(M)), 'tehsils': sorted(M.uid.unique()), 'days': int(M.date.nunique())}
        for r in GAUGE_RUNGS[1:]:
            ev = f'e{r}'; M[ev] = M.gmax >= r
            blk = {'events': int(M[ev].sum()), 'eventDays': int(M[M[ev]].date.nunique()), 'byLevel': {}}
            for L in (1, 2, 3, 4):
                blk['byLevel'][L] = {'warned': int((M.L >= L).sum()),
                                     'hitRate': boot_days(M, lambda d: pod(d, L, ev)),
                                     'falseAlarmRatio': boot_days(M, lambda d: far(d, L, ev))}
            blk['baseRate'] = round(float(M[ev].mean()), 4)
            blk['aucServedScore'] = boot_days(M, lambda d: auc(d, 'score', ev))
            blk['aucRainDrive'] = boot_days(M, lambda d: auc(d, 'drive', ev))
            blk['aucForecastPeakHour'] = boot_days(M, lambda d: auc(d, 'fpk', ev))
            blk['aucForecast6h'] = boot_days(M, lambda d: auc(d, 'f6', ev))
            res[f'gauge>={r}mm/h'] = blk
        # the place term: score / rain drive where the rain drive is non-trivial
        Z = M[M.drive > 0].copy(); Z['place'] = Z.score / Z.drive
        res['placeMultiplier'] = {u: round(float(g.place.median()), 3) for u, g in Z.groupby('uid')}
        res['levelCounts'] = {int(k): int(v) for k, v in M.L.value_counts().sort_index().items()}
        out['served'][key] = res
        if key.startswith('main'): M.to_csv(os.path.join(OUT, f'served_vs_gauge_{key}.csv.gz'), index=False)

# ---- rain input at the gauge (IFS points, two leads) ----
PT = pd.read_csv(os.path.join(UP, 'LAMHA', 'data', 'nwp', 'points', 'points.csv'))
pid_of = {r.sid: r.pid for r in PT[PT.src == 'mach_wu'].itertuples()}
want = {pid_of[C.wu_id[a]]: a for a in ids if C.wu_id[a] in pid_of}
I = pd.concat([pd.read_parquet(os.path.join(UP, 'LAMHA', 'data', 'nwp', 'points', 'ifs', f'ifs_points_2025{m}.parquet'),
                               columns=['init_utc', 'step_h', 'pid', 'tp_win']) for m in ('06', '07', '08', '09')])
I = I[I.pid.isin(want)]
I['g'] = I.pid.map(want); I['win_end'] = I.init_utc + pd.to_timedelta(I.step_h.astype(int), 'h')
GQ = P.mask(status.isin(['uncorroborated']))   # main basis
gw = {}
for a in want.values():
    s = GQ[a].copy(); s.index = s.index - pd.Timedelta(hours=5)   # back to UTC hour starts
    w3 = s.rolling(3, min_periods=3).sum(); mx3 = s.rolling(3, min_periods=3).max()
    gw[a] = (w3, mx3)
rin = {}
for lead, steps in (('0-6h', (3, 6)), ('15-21h', (18, 21))):
    X = I[I.step_h.isin(steps)].sort_values('init_utc').drop_duplicates(['g', 'win_end'], keep='last')
    rows = []
    for x in X.itertuples():
        w3, mx3 = gw[x.g]; t = x.win_end - pd.Timedelta(hours=1)    # last hour start of the window
        if t not in w3.index or not np.isfinite(w3.get(t, np.nan)): continue
        rows.append((x.g, (x.win_end + pd.Timedelta(hours=5)).strftime('%Y-%m-%d'), float(x.tp_win), w3[t], mx3[t]))
    D = pd.DataFrame(rows, columns=['g', 'date', 'f3', 'o3', 'omx'])
    D = D[(D.date >= '2025-06-12') & (D.date <= '2025-09-30')]
    Dd = D.groupby(['g', 'date']).agg(f3=('f3', 'max'), o3=('o3', 'max'), omx=('omx', 'max'), n=('o3', 'count')).reset_index()
    Dd = Dd[Dd.n >= 6]
    blk = {'stationDays': int(len(Dd)), 'stations': int(Dd.g.nunique()),
           'spearman_day_max3h': round(float(Dd[['f3', 'o3']].corr('spearman').iloc[0, 1]), 3),
           'meanGauge3hMax': round(float(Dd.o3.mean()), 2), 'meanForecast3hMax': round(float(Dd.f3.mean()), 2)}
    for r in GAUGE_RUNGS[1:]:
        ev = Dd.omx >= r; Dd['ev'] = ev
        k = {'events': int(ev.sum()), 'auc': boot_days(Dd, lambda d: auc(d, 'f3', 'ev'))}
        # served model-space rungs as the forecast (two bounds of the hourly peak inside the 3-h window)
        for bound, div in (('even', 3.0), ('front', 1.0)):
            mb = BANDS[GAUGE_RUNGS.index(r)]
            Dd['L'] = (Dd.f3 / div >= mb).astype(int)
            k[f'modelRung{mb}_{bound}'] = {'warned': int(Dd.L.sum()), 'hitRate': boot_days(Dd, lambda d: pod(d, 1, 'ev')),
                                           'falseAlarmRatio': boot_days(Dd, lambda d: far(d, 1, 'ev'))}
        blk[f'gauge>={r}mm/h'] = k
    rin[lead] = blk
out['rainInput']['ifsAtGauge'] = rin
json.dump(out, open(os.path.join(OUT, os.environ.get('PLUV_OUT', 'gauge-verify.json')), 'w'), indent=1, default=str)
print(json.dumps({k: out[k] for k in ('qc',)}, default=str))
for k, v in out['served'].items():
    print(k, v['tehsilDays'], v['days'], {r: (v[r]['events'], v[r]['aucServedScore'], v[r]['aucRainDrive'], v[r]['byLevel'][1]) for r in v if r.startswith('gauge')})
print(json.dumps(rin, default=str)[:3000])
