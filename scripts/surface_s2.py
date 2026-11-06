"""v91.17.72 · S · Sentinel-2 L2A seasonal index medians -> s_ndvi_<season>, s_ndmi_<season>, s_ndbi_jja + point features.

Source: earth-search v1 `sentinel-2-l2a` COGs (AWS open data, sentinel-cogs), anonymous.
Window: the last 12 months before the build: SON 2025 (Sep-Nov 2025), DJF (Dec 2025-Feb 2026), MAM 2026, JJA 2026.
Per MGRS tile and season K scenes (default 6), stratified by month: the K/3 least-cloudy of each calendar month
(eo:cloud_cover <= MAX_CC, ranked by cloud + half the no-data share, duplicates of the same tile-day dropped).
Grid (national): red/nir from the 1/8 overview and swir16/scl from the 1/4 overview, i.e. 80 m; pixels kept where
SCL is 4 vegetation, 5 not-vegetated, 6 water, 7 unclassified or 11 snow (drops no-data, saturated, dark, cloud
shadow, cloud medium/high, thin cirrus); per-pixel median over the kept scenes; then area-averaged (GDAL 'average')
onto the 9 arc-second grid; MGRS-tile overlaps averaged.
  NDVI = (B08 - B04) / (B08 + B04); NDMI = (B08 - B11) / (B08 + B11); NDBI = (B11 - B08) / (B11 + B08) = -NDMI.
Points: the same scenes at native resolution (10 m red/nir, 20 m swir16/scl repeated to 10 m) in the MGRS tile in
which the point is most interior: value at the 10 m pixel and means within 100 m and 500 m of the per-pixel median.
Usage: python3 surface_s2.py [K]
"""
import os, sys, time, json, warnings
import numpy as np
import concurrent.futures as cf
import rasterio
from rasterio.windows import Window
from rasterio.warp import reproject, Resampling, transform_bounds
from affine import Affine
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface_common as S

warnings.filterwarnings('ignore')
SEASONS = [('son', '2025-09-01', '2025-11-30'), ('djf', '2025-12-01', '2026-02-28'),
           ('mam', '2026-03-01', '2026-05-31'), ('jja', '2026-06-01', '2026-08-31')]
MAX_CC = 60
KEEP_SCL = np.array([4, 5, 6, 7, 11])
OV = 8            # 10 m -> 80 m
AHEAD = 2
THREADS = 6
WORK = os.path.join(S.SCRATCH, 's2')
NOV = 10980 // OV + (1 if 10980 % OV else 0)   # 1373
BUFS = [(100, 'b100'), (500, 'b500')]
os.environ.setdefault('GDAL_HTTP_MAX_RETRY', '4'); os.environ.setdefault('GDAL_HTTP_RETRY_DELAY', '2')
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR'); os.environ.setdefault('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.tif')


def catalog():
    import pystac_client
    return pystac_client.Client.open('https://earth-search.aws.element84.com/v1')


def tile_id(it):
    p = it.properties
    return f"{p['mgrs:utm_zone']:02d}{p['mgrs:latitude_band']}{p['mgrs:grid_square']}"


def in_mask(geom, mask):
    from shapely.geometry import shape, Point
    g = shape(geom); x0, y0, x1, y1 = g.bounds
    for lon in np.arange(x0, x1, 0.05):
        for lat in np.arange(y0, y1, 0.05):
            if 23.5 < lat < 37.25 and 60.75 < lon < 78 and mask[S.cell_of(lat, lon)] and g.contains(Point(lon, lat)): return True
    return False


def select(cat, mask, d0, d1, K, log):
    import datetime as dt
    items = []; a = dt.date.fromisoformat(d0); end = dt.date.fromisoformat(d1)
    while a <= end:   # 10-day slices: the API errors on very large result sets
        b = min(a + dt.timedelta(days=9), end)
        for k in range(4):
            try:
                items += list(cat.search(collections=['sentinel-2-l2a'], bbox=[60.8, 23.6, 77.9, 37.2], datetime=f'{a}/{b}T23:59:59Z',
                                         query={'eo:cloud_cover': {'lte': MAX_CC}}, limit=100).items()); break
            except Exception as e:
                if k == 3: raise
                time.sleep(5 + 10 * k)
        a = b + dt.timedelta(days=1)
    log(f'  {len(items)} items <= {MAX_CC}% cloud')
    best = {}
    for it in items:   # one item per tile-day: keep the newest processing
        k = (tile_id(it), it.properties['datetime'][:10])
        if k not in best or it.properties.get('updated', '') > best[k].properties.get('updated', ''): best[k] = it
    by = {}
    for (t, _), it in best.items(): by.setdefault(t, []).append(it)
    keep_tiles = {}
    for t, its in by.items():
        g = max(its, key=lambda i: -i.properties.get('s2:nodata_pixel_percentage', 0))
        if in_mask(g.geometry, mask): keep_tiles[t] = its
    sel = {}
    for t, its in keep_tiles.items():
        # stratified by calendar month: the K/3 best scenes of EACH month of the season, topped up with the best others.
        # (Least-cloudy-overall picked 58 % of JJA scenes in June — bare fields after the wheat harvest, before the
        #  monsoon crops — and pulled irrigated-Punjab JJA NDVI down to about 0.2 [measured, first run].)
        its.sort(key=lambda i: i.properties['eo:cloud_cover'] + 0.5 * i.properties.get('s2:nodata_pixel_percentage', 0))
        per = max(1, K // 3); by_m = {}
        for i in its: by_m.setdefault(i.properties['datetime'][:7], []).append(i)
        pick = [i for m in sorted(by_m) for i in by_m[m][:per]]
        ids = {i.id for i in pick}
        pick += [i for i in its if i.id not in ids][:max(0, K - len(pick))]
        sel[t] = pick[:K]
    return sel


def epsg_of(it):
    p = it.properties
    if p.get('proj:epsg'): return int(p['proj:epsg'])
    if p.get('proj:code'): return int(str(p['proj:code']).split(':')[-1])
    return 32600 + int(p['mgrs:utm_zone'])


def offset_of(it):
    p = it.properties
    if p.get('earthsearch:boa_offset_applied'): return 0
    return 1000 if float(p.get('s2:processing_baseline', '0')) >= 4.0 else 0


def rd(href, **kw):
    for i in range(4):
        try:
            with rasterio.open(href) as d: return d.read(1, **kw), d.transform
        except Exception:
            if i == 3: raise
            time.sleep(3 + 5 * i)


def scene(it, pts_here):
    """-> (ndvi80, ndmi80, transform80, {pid: (ndvi10, ndmi10)})"""
    off = offset_of(it)
    red, tr = rd(it.assets['red'].href, out_shape=(NOV, NOV))
    nir, _ = rd(it.assets['nir'].href, out_shape=(NOV, NOV))
    sw, _ = rd(it.assets['swir16'].href, out_shape=(NOV, NOV))
    scl, _ = rd(it.assets['scl'].href, out_shape=(NOV, NOV))
    tr80 = Affine(tr.a * 10980 / NOV, 0, tr.c, 0, tr.e * 10980 / NOV, tr.f)
    ok = np.isin(scl, KEEP_SCL) & (red > 0) & (nir > 0) & (sw > 0)
    r = red.astype(np.float32) - off; n = nir.astype(np.float32) - off; s = sw.astype(np.float32) - off
    with np.errstate(invalid='ignore', divide='ignore'):
        ndvi = np.where(ok, (n - r) / (n + r), np.nan).astype(np.float32)
        ndmi = np.where(ok, (n - s) / (n + s), np.nan).astype(np.float32)
    del red, nir, sw, scl, r, n, s
    pw = {}
    if pts_here:
        ds = {k: rasterio.open(it.assets[k].href) for k in ('red', 'nir', 'swir16', 'scl')}
        try:
            T = ds['red'].transform
            for pid, x, y in pts_here:
                col = int((x - T.c) / 10); row = int((T.f - y) / 10)
                h = 52; r0, c0 = (row - h) // 2 * 2, (col - h) // 2 * 2; W = 2 * h + 2
                win10 = Window(c0, r0, W, W); win20 = Window(c0 // 2, r0 // 2, W // 2, W // 2)
                a = {k: ds[k].read(1, window=win10, boundless=True, fill_value=0) for k in ('red', 'nir')}
                b = {k: np.repeat(np.repeat(ds[k].read(1, window=win20, boundless=True, fill_value=0), 2, 0), 2, 1) for k in ('swir16', 'scl')}
                okp = np.isin(b['scl'], KEEP_SCL) & (a['red'] > 0) & (a['nir'] > 0) & (b['swir16'] > 0)
                rr = a['red'].astype(np.float32) - off; nn = a['nir'].astype(np.float32) - off; ss = b['swir16'].astype(np.float32) - off
                with np.errstate(invalid='ignore', divide='ignore'):
                    pv = np.where(okp, (nn - rr) / (nn + rr), np.nan).astype(np.float32)
                    pm = np.where(okp, (nn - ss) / (nn + ss), np.nan).astype(np.float32)
                pw[pid] = (pv, pm, (r0, c0), (row, col))
        finally:
            for d in ds.values(): d.close()
    return ndvi, ndmi, tr80, pw


def mosaic_season(sea, mask):
    """average the per-tile g9 windows of a season -> ndvi, ndmi full grids (NaN outside data / mask)"""
    R, C = S.GRID['rows'], S.GRID['cols']
    d = os.path.join(WORK, sea)
    out = {}
    for idx in ('ndvi', 'ndmi'):
        acc = np.zeros((R, C), np.float32); cnt = np.zeros((R, C), np.uint8)
        for f in sorted(os.listdir(d)):
            if not f.endswith('.npz'): continue
            z = np.load(os.path.join(d, f)); ra, ca = int(z['ra']), int(z['ca']); a = z[idx]
            fin = np.isfinite(a); acc[ra:ra + a.shape[0], ca:ca + a.shape[1]][fin] += a[fin]; cnt[ra:ra + a.shape[0], ca:ca + a.shape[1]][fin] += 1
        ok = (cnt > 0) & mask
        acc[ok] /= cnt[ok]; acc[~ok] = np.nan; del cnt
        out[idx] = acc
    return out


def main():
    """resumable: per-tile g9 windows and point values are kept in WORK/<season>/ and skipped on a re-run"""
    import pickle, ctypes, pystac
    K = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 6
    t0 = time.time(); log = lambda m: print(f'[{time.time() - t0:6.0f}s] {m}', flush=True)
    mask = S.pak_mask(); R, C = S.GRID['rows'], S.GRID['cols']; G9 = S.g9_transform()
    cat = catalog(); pts = S.located_points()
    try: libc = ctypes.CDLL('libc.so.6')
    except OSError: libc = None
    stats = json.load(open(os.path.join(WORK, 'stats.json'))) if os.path.exists(os.path.join(WORK, 'stats.json')) else {}
    only = sys.argv[sys.argv.index('--season') + 1] if '--season' in sys.argv else None
    for sea, d0, d1 in SEASONS:
        if only and sea != only: continue   # one season per process keeps the heap from growing across seasons
        d = os.path.join(WORK, sea); os.makedirs(d, exist_ok=True)
        log(f'season {sea} {d0}..{d1}')
        sp = os.path.join(d, 'selection.pkl')
        if os.path.exists(sp):
            sel = {t: [pystac.Item.from_dict(x) for x in v] for t, v in pickle.load(open(sp, 'rb')).items()}
        else:
            sel = select(cat, mask, d0, d1, K, log)
            pickle.dump({t: [i.to_dict() for i in v] for t, v in sel.items()}, open(sp, 'wb'))
        log(f'  {len(sel)} MGRS tiles, {sum(len(v) for v in sel.values())} scenes')
        assign = {}
        for t, its in sel.items():
            it = its[0]; epsg = epsg_of(it); tr = it.properties.get('proj:transform') or it.assets['red'].extra_fields.get('proj:transform')
            x0, y0 = tr[2], tr[5]; T = Transformer.from_crs(4326, epsg, always_xy=True)
            for p in pts:
                x, y = T.transform(p['lon'], p['lat'])
                m = min(x - x0, x0 + 109800 - x, y0 - y, y - (y0 - 109800))
                if m > 600 and (p['id'] not in assign or m > assign[p['id']][1]): assign[p['id']] = (t, m, x, y)
        tp = {}
        for pid, (t, m, x, y) in assign.items(): tp.setdefault(t, []).append((pid, x, y))
        todo = [t for t in sel if not os.path.exists(os.path.join(d, t + '.npz'))]
        log(f'  {len(todo)} tiles to do')
        nfail = 0; ntile = 0
        def results_by_tile(ex):
            from collections import deque
            q = deque(); i = 0
            while i < len(todo) or q:
                while i < len(todo) and len(q) < AHEAD:
                    t = todo[i]; q.append((t, [(it, ex.submit(scene, it, tp.get(t))) for it in sel[t]])); i += 1
                t, fl = q.popleft(); out = []
                for it, f in fl:
                    try: out.append(f.result())
                    except Exception as e:
                        out.append(None); log(f'  fail {it.id}: {str(e)[:120]}')
                    f._result = None
                del fl
                yield t, out
        with cf.ThreadPoolExecutor(THREADS) as ex:
            for t, rs_all in results_by_tile(ex):
                nfail += sum(x is None for x in rs_all)
                rs = [x for x in rs_all if x is not None]; del rs_all
                ntile += 1
                if not rs:
                    continue
                tr80 = rs[0][2]; epsg = epsg_of(sel[t][0])
                with np.errstate(all='ignore'):
                    mv = np.nanmedian(np.stack([x[0] for x in rs]), 0); mm = np.nanmedian(np.stack([x[1] for x in rs]), 0)
                b = transform_bounds(f'EPSG:{epsg}', 'EPSG:4326', tr80.c, tr80.f + tr80.e * NOV, tr80.c + tr80.a * NOV, tr80.f)
                ra, rb = max(int((37.25 - b[3]) * 400) - 2, 0), min(int((37.25 - b[1]) * 400) + 3, R)
                ca, cb = max(int((b[0] - 60.75) * 400) - 2, 0), min(int((b[2] - 60.75) * 400) + 3, C)
                win = {}
                for nm, src in (('ndvi', mv), ('ndmi', mm)):
                    dst = np.full((max(rb - ra, 1), max(cb - ca, 1)), np.nan, np.float32)
                    if rb > ra and cb > ca:
                        reproject(src.astype(np.float32), dst, src_transform=tr80, src_crs=f'EPSG:{epsg}', src_nodata=np.nan,
                                  dst_transform=G9 * Affine.translation(ca, ra), dst_crs='EPSG:4326', dst_nodata=np.nan, resampling=Resampling.average)
                    win[nm] = dst
                del mv, mm
                # points
                pvals = {}
                for pid, x, y in tp.get(t, []):
                    stacks_v = [x_[3][pid] for x_ in rs if pid in x_[3]]
                    if not stacks_v: continue
                    with np.errstate(all='ignore'):
                        pv = np.nanmedian(np.stack([s_[0] for s_ in stacks_v]), 0); pm = np.nanmedian(np.stack([s_[1] for s_ in stacks_v]), 0)
                    (r0, c0), (row, col) = stacks_v[0][2], stacks_v[0][3]
                    # 10 m pixel centres in the tile frame (tile origin = tr80.c, tr80.f)
                    px_x = tr80.c + (np.arange(pv.shape[1]) + c0 + 0.5) * 10; px_y = tr80.f - (np.arange(pv.shape[0]) + r0 + 0.5) * 10
                    dd = np.hypot(px_y[:, None] - y, px_x[None, :] - x)
                    ip = (row - r0, col - c0)
                    vals = {f's_ndvi_{sea}_pt': pv[ip], f's_ndmi_{sea}_pt': pm[ip]}
                    for rad, bn in BUFS:
                        s_ = dd <= rad
                        vals[f's_ndvi_{sea}_{bn}'] = np.nanmean(pv[s_]) if np.isfinite(pv[s_]).any() else np.nan
                        vals[f's_ndmi_{sea}_{bn}'] = np.nanmean(pm[s_]) if np.isfinite(pm[s_]).any() else np.nan
                    vals[f's_s2n_{sea}'] = float(len(stacks_v))
                    if sea == 'jja':
                        for k in [k for k in vals if k.startswith('s_ndmi_jja')]: vals[k.replace('ndmi', 'ndbi')] = -vals[k]
                    pvals[pid] = {k: (float(v) if np.isfinite(v) else None) for k, v in vals.items()}
                del rs
                json.dump(pvals, open(os.path.join(d, t + '.points.json'), 'w'))
                np.savez(os.path.join(d, t + '.npz'), ra=ra, ca=ca, ndvi=win['ndvi'], ndmi=win['ndmi'])
                if libc: libc.malloc_trim(0)
                if ntile % 10 == 0: log(f'  {ntile}/{len(todo)} tiles, fails {nfail}')
        stats[sea] = {'tiles': len(sel), 'scenes': sum(len(v) for v in sel.values()), 'failedThisRun': nfail}
        json.dump(stats, open(os.path.join(WORK, 'stats.json'), 'w'))
        log(f'  season {sea} tiles done')
    log('all seasons read; run surface_s2_write.py (or: python3 surface_s2.py --write) to mosaic and write bands')
    if '--write' in sys.argv: write()


def nan_mean_disk(arr, radius_km):
    """NaN-aware mean within radius_km (metric circle), per 1-degree strip with FFT"""
    from scipy.signal import fftconvolve
    R, C = arr.shape; out = np.full_like(arr, np.nan)
    cell_km = S.GRID['cell'] * np.pi / 180 * 6371.0088; ry = int(np.ceil(radius_km / cell_km))
    for r in range(0, R, 400):
        a0, a1 = max(r - ry, 0), min(r + 400 + ry, R); sub = arr[a0:a1]
        if not np.isfinite(sub).any(): continue
        cl = np.cos(np.radians(37.25 - (r + 200) / 400)); rx = int(np.ceil(radius_km / (cell_km * cl)))
        yy, xx = np.mgrid[-ry:ry + 1, -rx:rx + 1]
        k = (((yy * cell_km) ** 2 + (xx * cell_km * cl) ** 2) <= radius_km ** 2).astype(np.float32)
        f = np.isfinite(sub)
        sm = fftconvolve(np.where(f, sub, 0), k, mode='same'); n = fftconvolve(f.astype(np.float32), k, mode='same')
        with np.errstate(all='ignore'): m = np.where(n > 0.5, sm / n, np.nan)
        h = min(400, R - r); out[r:r + h] = m[r - a0:r - a0 + h]
    return out


def write():
    """mosaic per season, fill gaps (NDVI: MODIS 500 m seasonal median; NDMI: 10-30 km neighbourhood mean), write bands + points"""
    t0 = time.time(); log = lambda m: print(f'[{time.time() - t0:6.0f}s] {m}', flush=True)
    mask = S.pak_mask(); nmask = int(mask.sum())
    stats = json.load(open(os.path.join(WORK, 'stats.json')))
    lic = S.LIC['s2']
    cellvals = {}
    pts = S.located_points()
    for sea, d0, d1 in SEASONS:
        g = mosaic_season(sea, mask)
        cov = {k: float(np.isfinite(v).sum() / nmask) for k, v in g.items()}
        fillnote = {}
        # NDVI gaps <- MODIS
        mf = os.path.join(WORK, f'modis_{sea}.npy')
        if os.path.exists(mf):
            mo = np.load(mf); gap = mask & ~np.isfinite(g['ndvi']) & np.isfinite(mo)
            both = np.isfinite(g['ndvi']) & np.isfinite(mo)
            diff = float(np.median(g['ndvi'][both] - mo[both])) if both.any() else 0.0
            g['ndvi'][gap] = mo[gap]
            fillnote['ndvi'] = {'filledCells': int(gap.sum()), 'fillShare': round(float(gap.sum() / nmask), 4), 'from': 'MODIS MOD13A1/MYD13A1 500 m seasonal median (Sep 2024 - Aug 2026), nearest neighbour',
                                'medianS2minusMODISonOverlap': round(diff, 3), 'licence': S.LIC['modis13']}
            del mo
        # any remaining gaps (both indices) <- neighbourhood mean, 10 then 30 km
        for idx in ('ndvi', 'ndmi'):
            left = mask & ~np.isfinite(g[idx]); nf = 0
            for rad in (10.0, 30.0):
                if not left.any(): break
                mm = nan_mean_disk(g[idx], rad); ok = left & np.isfinite(mm); g[idx][ok] = mm[ok]; nf += int(ok.sum()); left &= ~ok; del mm
            if nf: fillnote.setdefault(idx, {}).update({'neighbourhoodFilledCells': nf, 'neighbourhood': 'NaN-aware mean of the Sentinel-2 cells within 10 km (then 30 km)'})
        stats[sea]['coverageS2'] = cov; stats[sea]['fill'] = {k: {kk: vv for kk, vv in v.items() if kk != 'licence'} for k, v in fillnote.items()}
        base = (f'Sentinel-2 L2A {d0[:7]}..{d1[:7]} ({sea.upper()}): per MGRS tile {stats[sea]["scenes"] // max(stats[sea]["tiles"], 1)} scenes stratified by month (the least-cloudy of each month, '
                f'cloud <= {MAX_CC} %), SCL-masked (kept: vegetation, not-vegetated, water, unclassified, snow), per-pixel median at 80 m '
                '(COG overviews), area-averaged onto the 9 arc-second grid; overlapping MGRS tiles averaged.')
        for idx in ('ndvi', 'ndmi'):
            arr = g[idx]; arr[~mask] = np.nan
            fn = fillnote.get(idx, {})
            ftxt = ''
            if 'filledCells' in fn:
                ftxt += (f' Gaps ({fn["fillShare"] * 100:.2f} % of cells, mostly bright desert that the scene classification flags as cloud) filled from MODIS 500 m NDVI '
                         f'(seasonal median Sep 2024 - Aug 2026; median S2 - MODIS on overlapping cells {fn["medianS2minusMODISonOverlap"]:+.3f}, not adjusted).')
            if 'neighbourhoodFilledCells' in fn:
                ftxt += f' {fn["neighbourhoodFilledCells"]} remaining cells filled with the NaN-aware Sentinel-2 mean within 10 km (then 30 km).'
            names = [(f's_{idx}_{sea}', 1.0)]
            if idx == 'ndmi' and sea == 'jja': names.append(('s_ndbi_jja', -1.0))
            lics = lic if 'filledCells' not in fn else dict(lic, fill=S.LIC['modis13'])
            for name, sign in names:
                form = ('NDVI = (B08 - B04) / (B08 + B04)' if idx == 'ndvi' else 'NDMI = (B08 - B11) / (B08 + B11)' if sign > 0
                        else 'NDBI = (B11 - B08) / (B11 + B08), i.e. exactly -NDMI of the same pixels (same bands); kept as its own band for the urban heat layer')
                a = sign * arr
                S.write_band(S.DATA, name, a, scale=0.02, units='index -1..1', method=f'{form}. {base} Sentinel-2 coverage {cov[idx]:.4f} of mask cells.{ftxt}',
                             source='earth-search v1 sentinel-2-l2a (AWS open data sentinel-cogs), scripts/surface_s2.py', licence=lics,
                             extra={'n': int(np.isfinite(a).sum()), 'family': 's', 'season': sea, 'window': [d0, d1], 'coverageS2': round(cov[idx], 4),
                                    'fill': {k: v for k, v in fn.items() if k != 'licence'}})
                for p in pts:
                    r, c = S.cell_of(p['lat'], p['lon']); cellvals[(name, p['id'])] = float(a[r, c]) if np.isfinite(a[r, c]) else None
        log(f'{sea} written {cov} {stats[sea]["fill"]}')
        del g
    json.dump(stats, open(os.path.join(WORK, 'stats.json'), 'w'), indent=1)
    json.dump(stats, open(os.path.join(S.S72, 's2_stats.json'), 'w'), indent=1)
    pcols = {}
    for sea, _, _ in SEASONS:
        d = os.path.join(WORK, sea)
        for f in os.listdir(d):
            if f.endswith('.points.json'):
                for pid, vals in json.load(open(os.path.join(d, f))).items():
                    for k, v in vals.items(): pcols.setdefault(k, {})[pid] = v
    # a point whose 10 m window is all masked (bright desert, persistent cloud) takes the grid cell value; flagged
    for sea, _, _ in SEASONS:
        for p in pts:
            fl = 0
            for idx in ('ndvi', 'ndmi') + (('ndbi',) if sea == 'jja' else ()):
                for b in ('pt', 'b100', 'b500'):
                    k = f's_{idx}_{sea}_{b}'
                    if pcols.setdefault(k, {}).get(p['id']) is None:
                        cv = cellvals.get((f's_{idx}_{sea}', p['id'])); pcols[k][p['id']] = cv; fl = 1
            pcols.setdefault(f's_s2fill_{sea}', {})[p['id']] = fl
    units = {}
    for k in pcols:
        if k.startswith('s_s2n'): units[k] = 'count - Sentinel-2 scenes read for the point in the season'
        elif k.startswith('s_s2fill'): units[k] = 'flag 0/1 - 1 where a 10 m point value was missing (all scenes masked) and the 9 arc-second band value was used'
        else:
            idx, sea, b = k.split('_')[1:4]
            units[k] = f'{idx.upper()} (-1..1), Sentinel-2 L2A {sea.upper()} per-pixel median, ' + ({'pt': 'at the 10 m pixel (NDMI/NDBI: 20 m)', 'b100': 'mean within 100 m', 'b500': 'mean within 500 m'}[b])
    S.merge_pointfeat(pcols, units); S.note_sources(['s2', 'modis13'])
    log('done')


if __name__ == '__main__':
    if sys.argv[1:2] == ['--write-only']: write()
    else: main()
