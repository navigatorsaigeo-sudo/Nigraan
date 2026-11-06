"""v91.17.275 ARCH (from the v274 GRID readers, unchanged rules) - shared readers (read only on every source).
MACH observations: LAMHA copy mach/live/fleet_obs_2026-09.csv, station-lake fleet/fleet_obs_2026-10.csv, LAMHA mach/db obs_YYYYMMDD.csv
(6-16 Oct), merged per station, de-duplicated on (station, obs minute), then the stuck screen (scripts/tests272/stuck_screen.py = the
server's stuckscreen.mjs rule) on every station series; registry exclusions (data/mach-fleet-stations.json exclude) out.
Zone: data/model-zone.json zoneRule (mos.zoneOfPoint): mountain outline or >= 2000 m, coast <= 60 km, hills >= 1000 m, else plains."""
import os, sys, json, glob, math
import numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(APP, 'scripts', 'tests272')); sys.dont_write_bytecode = True
import stuck_screen as SS  # noqa: E402

# v91.17.274 integration: paths are config/arg-driven so the same scripts run in the cloud (copies under /mnt/user-data/uploads) and on
# the laptop (D:\ layout: D:\LAMHA, D:\NIGRAAN, D:\DATA LAKE). Order: command-line --root/--lamha/--nigraan/--datalake, then the
# environment (NIGRAAN_SCORE_ROOT, NIGRAAN_SCORE_LAMHA, NIGRAAN_SCORE_NIGRAAN, NIGRAAN_SCORE_DATALAKE), then the default
# (Windows: D:\ ; elsewhere: /mnt/user-data/uploads). Read only on every source.
import argparse as _ap
_pp = _ap.ArgumentParser(add_help=False)
for _n in ('root', 'lamha', 'nigraan', 'datalake'): _pp.add_argument('--' + _n, default=None)
_pa, _ = _pp.parse_known_args()
def _opt(name, env, dflt):
    v = getattr(_pa, name) or os.environ.get(env)
    return os.path.abspath(v) if v else dflt
UP = _opt('root', 'NIGRAAN_SCORE_ROOT', 'D:\\' if os.name == 'nt' else '/mnt/user-data/uploads')
LAMHA = _opt('lamha', 'NIGRAAN_SCORE_LAMHA', os.path.join(UP, 'LAMHA'))
NIG = _opt('nigraan', 'NIGRAAN_SCORE_NIGRAAN', os.path.join(UP, 'NIGRAAN'))
DATALAKE = _opt('datalake', 'NIGRAAN_SCORE_DATALAKE', os.path.join(UP, 'DATA LAKE'))
LAMHA_LIVE = os.path.join(LAMHA, 'data', 'mach', 'live'); LAMHA_DB = os.path.join(LAMHA, 'data', 'mach', 'db')
LAMHA_METAR = os.path.join(LAMHA, 'data', 'obs_other', 'metar_live')
LAKE_ARCHIVE = os.path.join(NIG, 'nig', 'station-lake', 'archive')
LAKE_FLEET = os.path.join(LAKE_ARCHIVE, 'fleet')
ARCH = os.path.join(NIG, 'nig', 'nigraan-local', 'data', 'archive')


def registry():
    r = json.load(open(os.path.join(APP, 'data', 'mach-fleet-stations.json')))
    return {s['key']: s for s in r['stations']}


def excluded():
    return {k for k, s in registry().items() if s.get('exclude')}


_Z = json.load(open(os.path.join(APP, 'data', 'model-zone.json')))['zoneRule']


def _inpoly(lat, lon, poly):
    # poly: list of [lat, lon] or [lon, lat]? detect by range
    pts = poly
    while pts and isinstance(pts[0][0], list): pts = pts[0]
    if pts and abs(pts[0][0]) > 50: pts = [[p[1], p[0]] for p in pts]
    ins = False; n = len(pts); j = n - 1
    for i in range(n):
        yi, xi = pts[i][0], pts[i][1]; yj, xj = pts[j][0], pts[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi): ins = not ins
        j = i
    return ins


def _coastkm(lat, lon):
    best = 1e9; cl = _Z['coastline']
    pts = cl if not (cl and abs(cl[0][0]) > 50) else [[p[1], p[0]] for p in cl]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        for f in np.linspace(0, 1, 21):
            la = a[0] + f * (b[0] - a[0]); lo = a[1] + f * (b[1] - a[1])
            d = 6371 * math.acos(min(1, math.sin(math.radians(lat)) * math.sin(math.radians(la)) + math.cos(math.radians(lat)) * math.cos(math.radians(la)) * math.cos(math.radians(lo - lon))))
            best = min(best, d)
    return best


def zone(lat, lon, elev):
    if any(_inpoly(lat, lon, p) for p in _Z.get('mountainOutline', [])): return 'mountain'
    if elev is not None and elev >= _Z['mountainMinElevM']: return 'mountain'
    if _coastkm(lat, lon) <= _Z['coastKm']: return 'coast'
    if elev is not None and elev >= _Z['hillsMinElevM']: return 'hills'
    return 'plains'


def mach_obs():
    """every MACH reading (Sep 23 -> Oct 16) with the stuck-screen verdict; columns key, ms, T, Td, RH, W, G, P, lat, lon, ok"""
    fr = []
    for f in sorted(glob.glob(os.path.join(LAMHA_LIVE, 'fleet_obs_20*.csv'))) + sorted(glob.glob(os.path.join(LAKE_FLEET, 'fleet_obs_20*.csv'))):   # every month held (v274: was Sep/Oct 2026 by name)
        if not os.path.exists(f): continue
        d = pd.read_csv(f)
        fr.append(pd.DataFrame({'key': d.key, 't': d.obs_utc, 'T': d.temp_c, 'Td': d.dew_c, 'RH': d.rh_pct, 'W': d.wind_kmh, 'G': d.gust_kmh, 'P': d.pressure_hpa, 'lat': d.lat, 'lon': d.lon}))
    for f in sorted(glob.glob(os.path.join(LAMHA_DB, 'obs_2*.csv'))):
        d = pd.read_csv(f); d = d[d.source != 'asos']
        fr.append(pd.DataFrame({'key': d.stationKey, 't': d.time, 'T': d.temperatureC, 'Td': d.dewPointC, 'RH': d.humidityPct, 'W': d.windSpeedKmh, 'G': d.windGustKmh, 'P': d.pressureHpa, 'lat': np.nan, 'lon': np.nan}))
    d = pd.concat(fr, ignore_index=True)
    d['ts'] = pd.to_datetime(d.t, format='ISO8601', utc=True); d = d[d['T'].notna()]
    d['ms'] = (d.ts - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() * 1000
    d['mn'] = (d.ms // 60000).astype('int64')
    d = d.sort_values(['key', 'ms', 'lat']).drop_duplicates(['key', 'mn']).reset_index(drop=True)
    reg = registry(); ex = excluded()
    d = d[d.key.isin(reg) & ~d.key.isin(ex)]
    d['lat'] = d.key.map(lambda k: reg[k]['lat']); d['lon'] = d.key.map(lambda k: reg[k]['lon'])
    ok = []
    nan = lambda x: None if (x is None or (isinstance(x, float) and math.isnan(x))) else float(x)
    out = []
    for k, s in d.groupby('key', sort=False):
        rows = [(m, float(T), nan(td), nan(rh), nan(p)) for m, T, td, rh, p in zip(s.ms.values, s['T'].values, s.Td.values, s.RH.values, s.P.values)]
        v = SS.screen(rows); s = s.copy(); s['ok'] = [x == 'ok' for x in v]; out.append(s)
    return pd.concat(out, ignore_index=True)


def hourly(d, tol_min=20):
    """the screened reading nearest each whole UTC hour (within tol_min)"""
    d = d[d.ok].copy(); d['hr'] = (d.ms / 3600e3).round().astype('int64'); d['off'] = (d.ms - d.hr * 3600e3).abs() / 6e4
    d = d[d.off <= tol_min].sort_values('off').drop_duplicates(['key', 'hr'])
    return d


def fc_archive():
    """served tehsil forecast archive rows: one per tehsil x issue (T, RH, W, G hourly from base)"""
    rows = []
    for f in sorted(glob.glob(os.path.join(ARCH, 'forecast', 'fc_*.jsonl.gz'))):
        import gzip
        for l in gzip.open(f, 'rt'):
            rows.append(json.loads(l))
    return rows


def metar_wind():
    """airport wind (km/h) and gust from the METAR copy (raw groups dddffKT / dddffGggKT / VRB; MPS converted)"""
    import re
    d = pd.concat([pd.read_csv(f) for f in sorted(glob.glob(os.path.join(LAMHA_METAR, 'metar_20*.csv')))], ignore_index=True)   # every month held
    rx = re.compile(r'\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)\b')
    out = []
    for st, t, typ, raw in zip(d.station, d.time_utc, d['type'], d.raw):
        m = rx.search(str(raw))
        if not m: continue
        f = 1.852 if m.group(4) == 'KT' else 3.6
        out.append((st, t, int(m.group(2)) * f, (int(m.group(3)) * f) if m.group(3) else None, typ))
    w = pd.DataFrame(out, columns=['key', 't', 'W', 'G', 'type'])
    w['ts'] = pd.to_datetime(w.t, utc=True); w['ms'] = (w.ts - pd.Timestamp('1970-01-01', tz='UTC')).dt.total_seconds() * 1000
    w['hr'] = (w.ms / 3600e3).round().astype('int64')
    w = w.sort_values('type').drop_duplicates(['key', 'hr'])  # METAR before SPECI
    ap = pd.read_csv(os.path.join(LAMHA_METAR, 'airports.csv'))
    return w, ap


def boot_gain(df, a, b, key='key', n=2000, seed=7):
    """station-bootstrap of mean station MAE gain (a - b; positive = b better); returns gain, lo90, hi90, stations"""
    g = df.groupby(key).apply(lambda s: pd.Series({'a': s[a].mean(), 'b': s[b].mean(), 'n': len(s)}))
    if len(g) == 0: return (np.nan, np.nan, np.nan, 0)
    rng = np.random.default_rng(seed); x = (g.a - g.b).values
    bs = [x[rng.integers(0, len(x), len(x))].mean() for _ in range(n)]
    return (float(x.mean()), float(np.quantile(bs, .05)), float(np.quantile(bs, .95)), int(len(x)))
