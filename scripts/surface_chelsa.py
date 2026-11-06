"""v91.17.72 · S · CHELSA V2.1 1981-2010 monthly climatologies (30 arc-sec) -> c_* bands + point values + comparison.

Input: CHELSA_{tasmax,tasmin,pr}_{MM}_1981-2010_V.2.1.tif (global COG strips; windowed read of 60.65-78.1 E,
23.4-37.35 N). tas stored as K x 10 (scale 0.1, offset -273.15); pr as kg m-2 month-1 x 10 (scale 0.1).
Bands: c_tmax_MM, c_tmin_MM (deg C, 12 months) and c_pr_MM (mm per month, 12 months) + c_pr_ann; the 30 arc-second
values are carried onto the 9 arc-second grid by nearest neighbour (each 1 km CHELSA cell repeated over the ~11 g9
cells it covers: the values are 1 km normals, not 250 m detail, and repeating them keeps the files small).
Points: bilinear interpolation of the native 30 arc-second field at the exact point (c_tmax_MM, c_tmin_MM, c_pr_MM),
plus c_zcell = GLO-90 mean elevation of the CHELSA cell (for lapse adjustment by the downscaling model).
Comparison (--compare): station monthly mean temperature climatologies of the mountain networks (the same station
months normal_anchor.py uses) against (a) CHELSA tmean=(tmax+tmin)/2 at the point, raw, (b) CHELSA brought from the
cell's mean GLO-90 height to the station height at -6.5 C/km, (c) the served ERA5 normal (anomaly-climate.json)
brought to the station height (the pre-anchor product), (d) the served anchored normal (normal-anchor.json) where the
tehsil is anchored. Writes /home/claude/nig/s72/chelsa_vs_stations.json (internal: station-measured skill).
Usage: python3 surface_chelsa.py [--compare-only]
"""
import os, sys, time, json
import numpy as np
import rasterio
from rasterio.windows import from_bounds, Window
from rasterio.warp import reproject, Resampling
from affine import Affine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface_common as S

URL = 'https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/1981-2010/{v}/CHELSA_{v}_{m:02d}_1981-2010_V.2.1.tif'
BOX = (60.65, 23.4, 78.1, 37.35)
CACHE = os.path.join(S.SCRATCH, 'chelsa')
LAPSE = -6.5 / 1000


def fetch(v, m):
    fn = os.path.join(CACHE, f'{v}_{m:02d}.npy')
    if os.path.exists(fn):
        z = np.load(fn, allow_pickle=True).item(); return z['a'], Affine(*z['t'])
    for k in range(4):
        try:
            with rasterio.open(URL.format(v=v, m=m)) as d:
                w = from_bounds(*BOX, d.transform).round_offsets().round_lengths()
                a = d.read(1, window=w); tr = d.window_transform(w)
                sc, of = d.scales[0], d.offsets[0]
            break
        except Exception:
            if k == 3: raise
            time.sleep(10)
    a = (a.astype(np.float32) * sc + of).astype(np.float32)
    np.save(fn, {'a': a, 't': tuple(tr)[:6]}, allow_pickle=True)
    return a, tr


def bilinear(a, tr, lat, lon):
    x = (lon - tr.c) / tr.a - 0.5; y = (lat - tr.f) / tr.e - 0.5
    i, j = int(np.floor(y)), int(np.floor(x)); fy, fx = y - i, x - j
    q = a[i:i + 2, j:j + 2]
    return float(q[0, 0] * (1 - fy) * (1 - fx) + q[0, 1] * (1 - fy) * fx + q[1, 0] * fy * (1 - fx) + q[1, 1] * fy * fx)


def cell_dem(lat, lon, tr):
    """mean GLO-90 elevation over the CHELSA 30 arc-second cell holding (lat, lon)"""
    j = int((lon - tr.c) / tr.a); i = int((lat - tr.f) / tr.e)
    w, e = tr.c + j * tr.a, tr.c + (j + 1) * tr.a; n, s = tr.f + i * tr.e, tr.f + (i + 1) * tr.e
    la, lo = int(np.floor(lat)), int(np.floor(lon))
    fn = f'/home/claude/nig/geo/dem90/Copernicus_DSM_COG_30_N{la:02d}_00_E{lo:03d}_00_DEM.tif'
    if not os.path.exists(fn): return None
    with rasterio.open(fn) as d:
        win = from_bounds(w, s, e, n, d.transform).round_offsets().round_lengths()
        z = d.read(1, window=win, boundless=True, fill_value=-9999).astype(float)
    z = z[z > -1000]
    return float(z.mean()) if z.size else None


def bands():
    t0 = time.time(); os.makedirs(CACHE, exist_ok=True)
    mask = S.pak_mask(); R, C = S.GRID['rows'], S.GRID['cols']
    pts = S.located_points(); pcols = {}; units = {}
    lic = S.LIC['chelsa']
    ann = None
    for v, nm, un in (('tasmax', 'tmax', 'deg C'), ('tasmin', 'tmin', 'deg C'), ('pr', 'pr', 'mm per month')):
        for m in range(1, 13):
            a, tr = fetch(v, m)
            a = np.where(a > (6000 if v == 'pr' else 1000), np.nan, a)   # uint16 65535 fill (sea) after scaling
            dst = np.full((R, C), np.nan, np.float32)
            reproject(a, dst, src_transform=tr, src_crs='EPSG:4326', dst_transform=S.g9_transform(), dst_crs='EPSG:4326',
                      src_nodata=np.nan, dst_nodata=np.nan, resampling=Resampling.nearest)
            dst[~mask] = np.nan
            if v == 'pr': ann = dst.copy() if ann is None else ann + dst
            name = f'c_{nm}_{m:02d}'
            S.write_band(S.DATA, name, dst, scale=0.1 if v != 'pr' else 0.5, units=un,
                         method=f'CHELSA V2.1 1981-2010 mean {"daily maximum" if nm == "tmax" else "daily minimum" if nm == "tmin" else "precipitation total"} '
                                f'for month {m:02d}; native 30 arc-second (about 1 km) cells repeated onto the 9 arc-second grid (nearest neighbour, no interpolation); '
                                'values are 1 km terrain-aware normals, not 250 m detail. Cells within 10 km of a Pakistani tehsil.',
                         source=f'CHELSA V2.1 {URL.format(v=v, m=m)} (windowed read), scripts/surface_chelsa.py', licence=lic,
                         extra={'n': int(np.isfinite(dst).sum()), 'family': 'c', 'period': '1981-2010'})
            for p in pts:
                pcols.setdefault(name, {})[p['id']] = bilinear(a, tr, p['lat'], p['lon'])
            units[name] = f'{un} - CHELSA V2.1 1981-2010 {nm} month {m:02d}, bilinear at the point from the 30 arc-second grid'
            del dst
            print(f'[{time.time() - t0:5.0f}s] {name}', flush=True)
    S.write_band(S.DATA, 'c_pr_ann', ann, scale=1.0, units='mm per year',
                 method='sum of the twelve CHELSA V2.1 1981-2010 monthly precipitation normals (c_pr_01..12), 30 arc-second cells repeated onto the 9 arc-second grid.',
                 source='CHELSA V2.1 pr monthly climatologies, scripts/surface_chelsa.py', licence=lic, extra={'n': int(np.isfinite(ann).sum()), 'family': 'c', 'period': '1981-2010'})
    a, tr = fetch('tasmax', 1)
    pcols['c_zcell'] = {p['id']: cell_dem(p['lat'], p['lon'], tr) for p in pts}
    units['c_zcell'] = 'm - mean Copernicus GLO-90 elevation of the CHELSA 30 arc-second cell holding the point (height the CHELSA normal refers to, approx.)'
    S.merge_pointfeat(pcols, units); S.note_sources(['chelsa'])


def compare():
    sys.path.insert(0, '/home/claude/nig/station-lake/scripts')
    import normal_anchor as NA
    import pandas as pd
    A = NA.station_months()
    st = A.groupby('name')[['lat', 'lon', 'elev']].first()
    ac = json.load(open(os.path.join(S.DATA, 'anomaly-climate.json')))
    anc = json.load(open(os.path.join(S.DATA, 'normal-anchor.json')))
    import temp_zone_rank as TZ
    Zn = TZ.Zoner()
    doy_month = [(pd.Timestamp('2024-01-01') + pd.Timedelta(days=q)).month for q in range(366)]
    tx = {m: fetch('tasmax', m) for m in range(1, 13)}; tn = {m: fetch('tasmin', m) for m in range(1, 13)}
    rows = []
    zc = {}
    units_ok = json.load(open(os.path.join(S.ROOT, 'server', 'contract', 'units.json')))
    uinfo = {u['unitId']: u for u in units_ok}
    for nm, r in st.iterrows():
        if not np.isfinite(r.lat) or not np.isfinite(r.elev): continue
        pr = Zn.admin(r.lat, r.lon); uid = pr.get('uid') if pr else None
        zc[nm] = cell_dem(r.lat, r.lon, tx[1][1])
        for _, q in A[A.name == nm].iterrows():
            m = int(q.month)
            ch = (bilinear(*tx[m], r.lat, r.lon) + bilinear(*tn[m], r.lat, r.lon)) / 2
            chz = ch + LAPSE * (r.elev - zc[nm]) if zc[nm] is not None else None
            cu = ac['units'].get(uid); era = None
            if cu:
                v = [cu['tm'][d] for d in range(366) if doy_month[d] == m and cu['tm'][d] is not None]
                if v: era = float(np.mean(v)) + LAPSE * (r.elev - (cu.get('zM') if cu.get('zM') is not None else r.elev))
            an = None
            if uid in anc['units'] and era is not None:
                # served anchored normal at the settlement height, brought to the station height: ERA5 normal at station + offset
                an = era + anc['units'][uid]['tm'][m - 1]
            rows.append({'name': nm, 'uid': uid, 'province': uinfo.get(uid, {}).get('province'), 'month': m, 'obs': float(q.t), 'years': int(q.years),
                         'elev': float(r.elev), 'zcell': zc[nm], 'chelsa_raw': ch, 'chelsa_z': chz, 'era5_z': era, 'anchored': an})
    D = pd.DataFrame(rows)
    def summ(sub, col):
        e = (sub[col] - sub.obs).dropna()
        if not len(e): return None
        # station-equal: median over stations of the station's mean absolute error, and pooled station-month figures
        per = sub.assign(e=sub[col] - sub.obs).dropna(subset=['e']).groupby('name').e.agg(lambda x: np.mean(np.abs(x)))
        return {'nStationMonths': int(len(e)), 'nStations': int(sub.dropna(subset=[col]).name.nunique()),
                'medianAbsErrC': round(float(np.median(np.abs(e))), 2), 'meanBiasC': round(float(e.mean()), 2),
                'medianStationMAEC': round(float(per.median()), 2)}
    out = {'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'agent': 'S v91.17.72', 'internal': True,
           'why': 'station-measured skill: internal only (V71 brief honesty limit 3)',
           'method': 'station monthly mean temperature (daily mean >= 20 h, month >= 15 days; mountain synop sites from max/min) per calendar month, '
                     'from station-lake/scripts/normal_anchor.py station_months(); errors = product - station, per station-month. '
                     'chelsa_raw: (tasmax+tasmin)/2 1981-2010 bilinear at the station; chelsa_z: the same moved from the CHELSA cell mean GLO-90 height to the station height at -6.5 C/km; '
                     'era5_z: served ERA5 1993-2016 normal (anomaly-climate.json) moved from its build height zM to the station height at -6.5 C/km; '
                     'anchored: era5_z + normal-anchor.json offset (IN-SAMPLE: the offsets were fitted on these stations, so this row is optimistic; the leave-one-station-out figure is in normal-anchor.json/reports). '
                     'Period mismatch: stations 2024-2026, CHELSA 1981-2010, ERA5 1993-2016; recent warming makes normals read cold by roughly 0.5-1 C [inference].',
           'all': {}, 'byProvince': {}, 'bySeason': {}}
    for col in ('chelsa_raw', 'chelsa_z', 'era5_z', 'anchored'):
        out['all'][col] = summ(D, col)
        for pv, sub in D.groupby('province'): out['byProvince'].setdefault(str(pv), {})[col] = summ(sub, col)
        for sn, ms in (('DJF', (12, 1, 2)), ('MAM', (3, 4, 5)), ('JJA', (6, 7, 8)), ('SON', (9, 10, 11))):
            out['bySeason'].setdefault(sn, {})[col] = summ(D[D.month.isin(ms)], col)
    same = D.dropna(subset=['chelsa_z', 'era5_z'])
    out['sameRows'] = {c: summ(same, c) for c in ('chelsa_raw', 'chelsa_z', 'era5_z')}
    sa = D.dropna(subset=['chelsa_z', 'anchored'])
    out['anchoredRows'] = {c: summ(sa, c) for c in ('chelsa_z', 'era5_z', 'anchored')}
    json.dump(out, open(os.path.join(S.S72, 'chelsa_vs_stations.json'), 'w'), indent=1)
    D.to_csv(os.path.join(S.SCRATCH, 'chelsa_vs_stations_rows.csv'), index=False)
    print(json.dumps({'all': out['all'], 'sameRows': out['sameRows'], 'anchoredRows': out['anchoredRows']}, indent=1))


if __name__ == '__main__':
    if '--compare-only' not in sys.argv: bands()
    compare()
