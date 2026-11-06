#!/usr/bin/env python3
"""
v91.17.275 HAZ2 · V-09 · level checks for heat, cold and wind (and snow) against station observations NIGRAAN holds.

Two replays of the SERVED level ladders (the page's own rungs, read from the page: heat = day-max UTCI in shade on AGN_UTCI_AGN_MAP,
cold = day-min UTCI in shade on AGN_UTCI_COLD_MAP, wind = day-max gust on FR('wind.ladder'), withheld above 1,500 m; level bands
from hazard-scale screeningCuts 25/45/65/82):
  A  the SERVED chain: the page engine on every archived served tehsil forecast (served_replay.mjs; 10 issue days 26 Sep - 12 Oct
     2026, leads 1-2 days), paired with every observing station inside the tehsil;
  B  the ladder on a long model input: GFS seamless short-range (ds2 pack, the station points, hourly, 2024-05 -> 2026-10-15),
     the same day-max / day-min UTCI computation as the page; no gust in that pack, so wind uses the page's fallback
     gust = 1.5 x sustained wind (FR wind.gustFromWindK) and is labelled so.
Truth: the observed level = the same rung applied to the observed day value (obs_daily.py: QC'd, stuck-screened MACH, synop,
airports). Per level k: hit rate = P(forecast >= k | observed >= k), false-alarm ratio = P(observed < k | forecast >= k),
frequency bias = n(forecast >= k) / n(observed >= k). 95 % intervals: bootstrap over DAYS (stations on one day are not independent),
1,000 resamples. Refit test (B only, where the sample allows): a data-derived forecast cut per level (the forecast UTCI or gust value
whose exceedance frequency equals the observed rung's frequency on the training years: quantile mapping of the cut) fitted on
2024-25 and judged on 2026 (and the reverse), Peirce skill score (hit rate - false-alarm rate) against the served cut, by bootstrap
over days; served only if the lower 95 % bound of the gain is > 0 in both directions (it is not served from this script either way).
Usage: python3 level_check.py <root>
"""
import sys, os, json, math, collections
import numpy as np, pandas as pd, pyarrow.parquet as pq
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

ROOT = sys.argv[1]; W = os.path.join(ROOT, '_work', 'v09')
rng = np.random.default_rng(275)
HEAT = [[9, 0], [26, 25], [32, 45], [38, 65], [46, 82], [54, 100]]
COLD = [[9, 0], [0, 25], [-13, 45], [-27, 65], [-40, 82], [-50, 100]]
WIND = [[40, 0], [62, 30], [89, 55], [118, 78], [160, 92], [220, 100]]
CUTS = [25, 45, 65, 82]; WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe']
def interp(P, x, rising=True):
    xs = np.array([p[0] for p in P], float); ys = np.array([p[1] for p in P], float)
    if not rising: xs, ys = -xs, ys; x = -np.asarray(x, float)
    return np.interp(x, xs, ys, left=0, right=100)
def level(score): s = np.asarray(score, float); return np.where(np.isnan(s), -1, (s >= 25).astype(int) + (s >= 45) + (s >= 65) + (s >= 82))
def lv_heat(u): return level(interp(HEAT, u))
def lv_cold(u): return level(interp(COLD, u, rising=False))
def lv_wind(g): return level(interp(WIND, g))
# the value at which each rung starts (for the refit: cut values in the physical unit)
def rung_values(P, rising=True):
    out = []
    for c in CUTS:
        for (x0, y0), (x1, y1) in zip(P[:-1], P[1:]):
            if y0 <= c <= y1: out.append(x0 + (c - y0) / (y1 - y0) * (x1 - x0)); break
    return out
RUNG = {'heat': rung_values(HEAT), 'cold': rung_values(COLD), 'wind': rung_values(WIND)}

obs = pd.read_csv(os.path.join(W, 'obs_daily.csv'))
obs['ov_heat'] = lv_heat(obs['utci_max']); obs['ov_cold'] = lv_cold(obs['utci_min'])
obs['ov_wind'] = np.where(obs['gust_max'].notna(), lv_wind(obs['gust_max'].fillna(0)), -1)

def score_table(df, fcol, ocol, k):
    d = df[(df[fcol] >= 0) & (df[ocol] >= 0)]
    f = d[fcol].values >= k; o = d[ocol].values >= k; days = d['day'].values
    def stats(idx):
        ff, oo = f[idx], o[idx]; H = (ff & oo).sum(); M = (~ff & oo).sum(); F = (ff & ~oo).sum(); C = (~ff & ~oo).sum()
        return H, M, F, C
    H, M, F, C = stats(np.arange(len(d)))
    res = {'n': int(len(d)), 'observed': int(H + M), 'forecast': int(H + F), 'hits': int(H), 'misses': int(M), 'falseAlarms': int(F)}
    res['hitRate'] = round(H / (H + M), 3) if H + M else None
    res['falseAlarmRatio'] = round(F / (H + F), 3) if H + F else None
    res['freqBias'] = round((H + F) / (H + M), 2) if H + M else None
    if H + M >= 1 or H + F >= 1:
        ud = np.unique(days); bydays = {u: np.where(days == u)[0] for u in ud}; hr, far = [], []
        for _ in range(1000):
            pick = rng.choice(ud, len(ud)); idx = np.concatenate([bydays[u] for u in pick])
            h, m, fa, c = stats(idx)
            if h + m: hr.append(h / (h + m))
            if h + fa: far.append(fa / (h + fa))
        if hr and H + M: res['hitRate95'] = [round(float(np.percentile(hr, 2.5)), 3), round(float(np.percentile(hr, 97.5)), 3)]
        if far and H + F: res['falseAlarmRatio95'] = [round(float(np.percentile(far, 2.5)), 3), round(float(np.percentile(far, 97.5)), 3)]
    res['days'] = int(len(np.unique(days)))
    return res

OUT = {'ladders': {'heat': HEAT, 'cold': COLD, 'wind': WIND, 'bands': dict(zip(WORDS[1:], CUTS)), 'rungValues': RUNG}}

# ── station -> tehsil ──
TEH = json.load(open(os.path.join(ROOT, 'data', 'pk-tehsils.json')))['features']
TG = [shape(f['geometry']) for f in TEH]; tree = STRtree(TG)
st = obs.groupby('station')[['lat', 'lon', 'elev_use', 'zone']].first()
def uid_of(lat, lon):
    pt = Point(lon, lat); c = [k for k in tree.query(pt) if TG[k].contains(pt)]
    return TEH[c[0]]['properties']['uid'] if c else None
st['uid'] = [uid_of(a, b) for a, b in zip(st['lat'], st['lon'])]

# ── A: the served chain ──
R = json.load(open(os.path.join(W, 'served_replay.json')))
rows = []
for D, v in R['issues'].items():
    d0 = pd.Timestamp(D)
    for u, o in v['lv'].items():
        for key, x in o.items():
            hz, lead = key.split('@'); lead = int(lead)
            if lead == 0: continue
            rows.append((u, (d0 + pd.Timedelta(days=lead)).strftime('%Y-%m-%d'), lead, hz, x[0]))
S = pd.DataFrame(rows, columns=['uid', 'day', 'lead', 'hz', 'lv'])
P = S.pivot_table(index=['uid', 'day', 'lead'], columns='hz', values='lv', aggfunc='first').reset_index()
ob = obs.join(st['uid'], on='station')
A = P.merge(ob, on=['uid', 'day'], how='inner')
OUT['A_served'] = {'pairs': int(len(A)), 'stations': int(A['station'].nunique()), 'tehsils': int(A['uid'].nunique()), 'days': sorted(A['day'].unique().tolist()),
                   'byZone': A.groupby('zone').size().to_dict(), 'note': 'leads 1-2 days; day 0 is not derived by the engine from the archived series (it reads the live current hour)'}
for hz in ['heat', 'cold', 'wind']:
    OUT['A_served'][hz] = {}
    for zone in ['all', 'plains', 'coast', 'hills', 'mountain']:
        d = A if zone == 'all' else A[A['zone'] == zone]
        if hz == 'wind': d = d[d['ov_wind'] >= 0]
        tab = {WORDS[k]: score_table(d, hz, 'ov_' + hz, k) for k in (1, 2, 3, 4)}
        dist = {'forecast': d[hz].value_counts().sort_index().to_dict(), 'observed': d['ov_' + hz].value_counts().sort_index().to_dict()}
        OUT['A_served'][hz][zone] = {'levels': tab, 'dist': {k: {str(a): int(b) for a, b in v.items()} for k, v in dist.items()}}

# ── B: the ladder on GFS seamless short-range at the station points ──
PK = '/mnt/user-data/uploads/NIGRAAN/nig/ds2/out/pack'
pts = pd.read_csv(os.path.join(PK, 'points.csv'))
# point ids -> the obs station names (mach:X = mach:X; synop:NNNNN and isd:NNNNN0 = wmo:NNNNN; metar:XXXX = icao:XXXX); one location may serve several stations
def to_station(pid, setn, sid):
    sid = str(sid)
    return {'mach': 'mach:' + sid, 'synop': 'wmo:' + sid, 'isd': 'wmo:' + sid[:5], 'metar': 'icao:' + sid}.get(setn)
pts['station'] = [to_station(a, b, c) for a, b, c in zip(pts['pid'], pts['set'], pts['sid'])]
pts = pts[pts['station'].isin(set(obs['station']))].drop_duplicates(['loc', 'station'])
g = pq.read_table(os.path.join(PK, 'profiles_gfs_seamless.parquet'), columns=['loc', 'time', 'temperature_2m', 'dew_point_2m', 'wind_speed_10m']).to_pandas()
g = g[g['loc'].isin(set(pts['loc']))]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('od', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'obs_utci.py'))
od = importlib.util.module_from_spec(spec); spec.loader.exec_module(od)
a_, b_ = 17.625, 243.04
g['rh'] = (100 * np.exp(a_ * g['dew_point_2m'] / (b_ + g['dew_point_2m'])) / np.exp(a_ * g['temperature_2m'] / (b_ + g['temperature_2m']))).clip(0, 100)
g['utci'] = od.utci(g['temperature_2m'].values, (g['wind_speed_10m'] / 3.6).values, g['rh'].values)
tt = pd.to_datetime(g['time'], utc=True) + pd.Timedelta(hours=5); g['day'] = tt.dt.strftime('%Y-%m-%d')
gd = g.groupby(['loc', 'day']).agg(n=('utci', 'size'), f_umax=('utci', 'max'), f_umin=('utci', 'min'), f_wmax=('wind_speed_10m', 'max')).reset_index()
gd = gd[gd['n'] >= 20].merge(pts[['loc', 'station']], on='loc')
B = gd.merge(obs, on=['station', 'day'], how='inner')
B['heat'] = lv_heat(B['f_umax']); B['cold'] = lv_cold(B['f_umin']); B['wind'] = lv_wind(1.5 * B['f_wmax'])
elev = B['elev_use'].fillna(0); B.loc[elev >= 1500, 'wind'] = -1     # withheld above 1,500 m, as served
B['year'] = B['day'].str[:4]
OUT['B_gfs'] = {'pairs': int(len(B)), 'stations': int(B['station'].nunique()), 'first': B['day'].min(), 'last': B['day'].max(), 'byZone': B.groupby('zone').size().to_dict(),
                'note': 'raw GFS short-range at the station point (not the served blend and corrections); the ladder as served; wind from 1.5 x sustained wind (no gust in the pack)'}
for hz in ['heat', 'cold', 'wind']:
    OUT['B_gfs'][hz] = {}
    for zone in ['all', 'plains', 'coast', 'hills', 'mountain']:
        d = B if zone == 'all' else B[B['zone'] == zone]
        if hz == 'wind': d = d[d['ov_wind'] >= 0]
        OUT['B_gfs'][hz][zone] = {'levels': {WORDS[k]: score_table(d, hz, 'ov_' + hz, k) for k in (1, 2, 3, 4)},
            'dist': {'forecast': {str(a): int(b) for a, b in d[hz].value_counts().sort_index().items()}, 'observed': {str(a): int(b) for a, b in d['ov_' + hz].value_counts().sort_index().items()}}}

# ── refit test (B): a data-derived forecast cut per rung vs the served cut, cross-validated by year ──
FCOL = {'heat': ('f_umax', 1), 'cold': ('f_umin', -1), 'wind': ('f_wmax', 1)}
OCOL = {'heat': 'utci_max', 'cold': 'utci_min', 'wind': 'gust_max'}
def pss(fx, ox, cut, ocut, sign):
    f = sign * fx >= sign * cut; o = sign * ox >= sign * ocut
    H = (f & o).sum(); M = (~f & o).sum(); F = (f & ~o).sum(); C = (~f & ~o).sum()
    return (H / (H + M) if H + M else np.nan) - (F / (F + C) if F + C else np.nan)
refit = {}
for hz in ['heat', 'cold', 'wind']:
  refit[hz] = {}
  for zone in ['all', 'plains', 'coast', 'hills', 'mountain']:
    col, sign = FCOL[hz]; d = B[B[OCOL[hz]].notna()].copy()
    if zone != 'all': d = d[d['zone'] == zone]
    if hz == 'wind': d = d[d['elev_use'].fillna(0) < 1500]; d[col] = 1.5 * d[col]
    refit[hz][zone] = {}
    for k in (1, 2, 3, 4):
        oc = RUNG[hz][k - 1]
        rec = {'rung': WORDS[k], 'observedCut': round(oc, 1)}
        for tr, te in [(['2024', '2025'], ['2026']), (['2026'], ['2024', '2025'])]:
            T = d[d['year'].isin(tr)]; V = d[d['year'].isin(te)]
            nobs = (sign * T[OCOL[hz]] >= sign * oc).sum()
            key = 'train ' + '+'.join(tr) + ' -> test ' + '+'.join(te)
            if nobs < 20 or (sign * V[OCOL[hz]] >= sign * oc).sum() < 10: rec[key] = {'skipped': 'too few observed days at this rung (train %d, test %d)' % (nobs, (sign * V[OCOL[hz]] >= sign * oc).sum())}; continue
            share = nobs / len(T)
            cut = float(np.quantile(sign * T[col].values, 1 - share)) * sign      # the forecast value with the same exceedance frequency
            ud = np.unique(V['day']); byd = {u: np.where(V['day'].values == u)[0] for u in ud}; fx = V[col].values; ox = V[OCOL[hz]].values
            base = pss(fx, ox, oc, oc, sign); new = pss(fx, ox, cut, oc, sign); gains = []
            for _ in range(1000):
                idx = np.concatenate([byd[u] for u in rng.choice(ud, len(ud))]); gains.append(pss(fx[idx], ox[idx], cut, oc, sign) - pss(fx[idx], ox[idx], oc, oc, sign))
            gains = np.array(gains); gains = gains[np.isfinite(gains)]
            rec[key] = {'fittedCut': round(cut, 1), 'servedPSS': round(float(base), 3), 'refitPSS': round(float(new), 3),
                        'gain95': [round(float(np.percentile(gains, 2.5)), 3), round(float(np.percentile(gains, 97.5)), 3)] if len(gains) else None,
                        'testObservedDays': int((sign * ox >= sign * oc).sum())}
        ks = [v for kk, v in rec.items() if kk.startswith('train') and 'gain95' in v and v['gain95']]
        rec['passes'] = bool(len(ks) == 2 and all(v['gain95'][0] > 0 for v in ks))
        refit[hz][zone][WORDS[k]] = rec
OUT['refit'] = refit
# ── snow: no served snow level; METAR snow reports held? ──
OUT['snow'] = {'servedLevel': None, 'note': 'NIGRAAN serves no snow level (no snow ladder in the page or the engine layers); snowfall enters only as liquid-equivalent in the rain series and as text.',
               'observations': 'no snow-day record is held: the synop copy has no present-weather group, the airport archive (metar_hourly) has no weather codes, and the live airport reports (October 2026) are plains airports only'}
json.dump(OUT, open(os.path.join(W, 'level_check.json'), 'w'), indent=1, default=lambda o: int(o) if isinstance(o, (np.integer,)) else float(o))
print(json.dumps({'A': {k: OUT['A_served'][k] for k in ('pairs', 'stations', 'tehsils')}, 'B': {k: OUT['B_gfs'][k] for k in ('pairs', 'stations', 'first', 'last')}}))
