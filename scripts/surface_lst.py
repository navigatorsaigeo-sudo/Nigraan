"""v91.17.72 · S · MODIS land-surface temperature climatology 2019-2025 -> l_* bands on the g9 grid + point features.

Input: MOD11A2 (Terra, overpass about 10:30 / 22:30 local solar time) and MYD11A2 (Aqua, about 13:30 / 01:30) v061
8-day composites, 1 km sinusoidal, Planetary Computer COGs (anonymous SAS). Pixels kept when QC mandatory bits are
00/01 (produced) and the LST error flag (bits 6-7) is <= 2 K.
Streaming: one MODIS tile at a time; for each granule only running sums and counts per (sensor, day/night, season)
are kept (season of the composite's first day: DJF, MAM, JJA, SON).
  day  = mean of the Terra-day and Aqua-day seasonal means (the one available where only one exists);
  night= mean of the Terra-night and Aqua-night seasonal means.
The 1 km seasonal fields are area-averaged onto a 0.01 deg lattice (4x4 g9 cells) and repeated over the g9 cells;
point values are bilinear from the native 1 km grid.
Anomaly bands: value minus the mean within a 10 km radius (circle, metric; NaN-aware) on the 0.01 deg lattice.
Usage: python3 surface_lst.py [y0 y1]
"""
import os, sys, time, json
import numpy as np
import concurrent.futures as cf
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.crs import CRS
from affine import Affine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface_common as S

SEASONS = {'djf': (12, 1, 2), 'mam': (3, 4, 5), 'jja': (6, 7, 8), 'son': (9, 10, 11)}
SIN = CRS.from_proj4('+proj=sinu +lon_0=0 +x_0=0 +y_0=0 +R=6371007.181 +units=m +no_defs')
TW = 1111950.5196666666
PXS = TW / 1200
TILES = [(22, 5), (23, 5), (24, 5), (23, 6), (24, 6), (25, 6)]
MIN_N = 3   # minimum composites per sensor-season-pixel


def season_of(month):
    for k, ms in SEASONS.items():
        if month in ms: return k


def open_catalog():
    import pystac_client, planetary_computer as pc
    return pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=pc.sign_inplace)


def read(href, tries=4):
    for i in range(tries):
        try:
            with rasterio.open(href) as d: return d.read(1)
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(2 + 3 * i)


def granule(item):
    out = {}
    for dn, lst, qc in (('day', 'LST_Day_1km', 'QC_Day'), ('night', 'LST_Night_1km', 'QC_Night')):
        a = read(item.assets[lst].href).astype(np.float32); q = read(item.assets[qc].href)
        ok = (a > 0) & ((q & 3) <= 1) & (((q >> 6) & 3) <= 1)
        out[dn] = np.where(ok, a * 0.02 - 273.15, np.nan).astype(np.float32)
    return out


def tile_climatology(cat, h, v, y0, y1, log):
    import planetary_computer as pc
    acc = {}
    items = []
    for coll in ('modis-11A2-061',):
        s = cat.search(collections=[coll], datetime=f'{y0}-01-01/{y1}-12-31',
                       query={'modis:horizontal-tile': {'eq': h}, 'modis:vertical-tile': {'eq': v}})
        items += list(s.items())
    log(f'h{h}v{v}: {len(items)} granules')
    done = 0
    def work(it):
        for k in range(3):
            try: return it, granule(it)
            except Exception as e:
                if k == 2: return it, None
                pc.sign_inplace(it); time.sleep(5)
    with cf.ThreadPoolExecutor(6) as ex:
        for it, g in ex.map(work, items):
            done += 1
            if g is None: log(f'  failed {it.id}'); continue
            sens = 'T' if it.id.startswith('MOD') else 'A'
            sea = season_of(int(it.properties['start_datetime'][5:7]) if 'start_datetime' in it.properties else it.datetime.month)
            for dn, a in g.items():
                k = (sens, dn, sea)
                if k not in acc: acc[k] = [np.zeros(a.shape, np.float32), np.zeros(a.shape, np.uint16)]
                m = np.isfinite(a); acc[k][0][m] += a[m]; acc[k][1][m] += 1
            if done % 200 == 0: log(f'  {done}/{len(items)}')
    res = {}
    for sea in SEASONS:
        for dn in ('day', 'night'):
            means = []
            for sens in 'TA':
                s_, n_ = acc.get((sens, dn, sea), (None, None))
                if s_ is None: continue
                means.append(np.where(n_ >= MIN_N, s_ / np.maximum(n_, 1), np.nan))
            if means:
                st = np.stack(means)
                with np.errstate(invalid='ignore'), __import__('warnings').catch_warnings():
                    __import__('warnings').simplefilter('ignore')
                    res[(dn, sea)] = np.nanmean(st, 0).astype(np.float32)
            nmin = [acc[(s, dn, sea)][1] for s in 'TA' if (s, dn, sea) in acc]
            res[('n', dn, sea)] = sum(x.astype(np.int32) for x in nmin)
    return res


def disk_anom(arr, mask, radius_km=10.0, step=None):
    """arr minus the NaN-aware mean within radius_km (metric circle), computed per 1-degree strip with FFT;
       arr is on a lat/lon lattice anchored at 37.25 N with cell `step` degrees (default the g9 cell)"""
    from scipy.signal import fftconvolve
    step = step or S.GRID['cell']; per = int(round(1 / step))
    R, C = arr.shape; out = np.full_like(arr, np.nan)
    cell_km = step * np.pi / 180 * 6371.0088
    ry = int(np.ceil(radius_km / cell_km))
    for r in range(0, R, per):
        a0, a1 = max(r - ry, 0), min(r + per + ry, R)
        sub = arr[a0:a1]
        if not np.isfinite(sub).any(): continue
        latc = 37.25 - (r + per / 2) / per
        rx = int(np.ceil(radius_km / (cell_km * np.cos(np.radians(latc)))))
        yy, xx = np.mgrid[-ry:ry + 1, -rx:rx + 1]
        k = (((yy * cell_km) ** 2 + (xx * cell_km * np.cos(np.radians(latc))) ** 2) <= radius_km ** 2).astype(np.float32)
        f = np.isfinite(sub)
        s = fftconvolve(np.where(f, sub, 0), k, mode='same'); n = fftconvolve(f.astype(np.float32), k, mode='same')
        with np.errstate(invalid='ignore', divide='ignore'):
            mean = np.where(n > 0.5, s / n, np.nan)
        h = min(per, R - r)
        out[r:r + h] = (sub - mean)[r - a0:r - a0 + h]
    out[~mask] = np.nan
    return out


def sin_xy(lat, lon):
    Rr = 6371007.181
    return Rr * np.radians(lon) * np.cos(np.radians(lat)), Rr * np.radians(lat)


def point_bilinear(res_by_tile, key, lat, lon):
    x, y = sin_xy(lat, lon)
    h = int(np.floor(x / TW)) + 18; v = 9 - int(np.floor(y / TW)) - 1
    a = res_by_tile.get((h, v), {}).get(key)
    if a is None: return None
    fx = (x - (h - 18) * TW) / PXS - 0.5; fy = ((9 - v) * TW - y) / PXS - 0.5
    i, j = int(np.floor(fy)), int(np.floor(fx)); dy, dx = fy - i, fx - j
    w = []; s = 0.0; ws = 0.0
    for ii, jj, ww in ((i, j, (1 - dy) * (1 - dx)), (i, j + 1, (1 - dy) * dx), (i + 1, j, dy * (1 - dx)), (i + 1, j + 1, dy * dx)):
        if 0 <= ii < 1200 and 0 <= jj < 1200 and np.isfinite(a[ii, jj]): s += ww * a[ii, jj]; ws += ww
    return float(s / ws) if ws > 0.25 else None


def main():
    """pass 1 (network): per MODIS tile seasonal climatologies cached in scratch/lst/h..v...npz;
       pass 2 (local): one band at a time, nearest-neighbour onto the grid (the 1 km cells repeated: honest scale, small files)"""
    y0, y1 = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (2019, 2025)
    t0 = time.time(); log = lambda m: print(f'[{time.time() - t0:6.0f}s] {m}', flush=True)
    mask = S.pak_mask(); R, C = S.GRID['rows'], S.GRID['cols']
    cache = os.path.join(S.SCRATCH, 'lst'); os.makedirs(cache, exist_ok=True)
    cat = None
    for h, v in TILES:
        cf_ = os.path.join(cache, f'h{h}v{v}.npz')
        if not os.path.exists(cf_):
            cat = cat or open_catalog()
            res = tile_climatology(cat, h, v, y0, y1, log)
            np.savez_compressed(cf_, **{'|'.join(k): a for k, a in res.items()}); del res
    Z = {(h, v): np.load(os.path.join(cache, f'h{h}v{v}.npz')) for h, v in TILES}
    nmin = {}
    for (h, v), z in Z.items():
        for sea in SEASONS:
            for dn in ('day', 'night'):
                k = f'n|{dn}|{sea}'
                if k in z.files:
                    n = z[k]; nmin.setdefault((dn, sea), []).append(int(np.median(n[n > 0])) if (n > 0).any() else 0)
    lic = S.LIC['modis11']
    src = 'MOD11A2 + MYD11A2 v061 8-day 1 km (Planetary Computer modis-11A2-061), scripts/surface_lst.py'
    over = {'day': 'Terra 10:30 and Aqua 13:30 local solar time', 'night': 'Terra 22:30 and Aqua 01:30 local solar time'}
    pvals = {}
    pts = S.located_points()
    # 0.01 deg lattice (4 x 4 g9 cells, about 1.1 km): MODIS 1 km cells are area-averaged onto it, the anomaly is computed on
    # it and both are repeated over the 16 g9 cells (honest 1 km scale; repeated values keep the files ~1.5 MB per band)
    Rc, Cc = R // 4 + (R % 4 > 0), C // 4 + (C % 4 > 0)
    Tc = Affine(0.01, 0, S.GRID['west'], 0, -0.01, S.GRID['north'])
    mpad = np.zeros((Rc * 4, Cc * 4), bool); mpad[:R, :C] = mask
    maskc = mpad.reshape(Rc, 4, Cc, 4).any((1, 3)); del mpad
    up = lambda x: np.repeat(np.repeat(x, 4, 0), 4, 1)[:R, :C]
    for dn in ('day', 'night'):
        for sea in SEASONS:
            ac = np.full((Rc, Cc), np.nan, np.float32)
            key = f'{dn}|{sea}'
            per_tile = {}
            for (h, v), z in Z.items():
                if key not in z.files: continue
                srcarr = z[key]; per_tile[(h, v)] = {key: srcarr}
                tr = Affine(PXS, 0, (h - 18) * TW, 0, -PXS, (9 - v) * TW)
                ra, rb = (0, 730) if v == 5 else (720, Rc)
                tmp = np.full((rb - ra, Cc), np.nan, np.float32)
                reproject(srcarr, tmp, src_transform=tr, src_crs=SIN, src_nodata=np.nan, dst_transform=Tc * Affine.translation(0, ra),
                          dst_crs='EPSG:4326', dst_nodata=np.nan, resampling=Resampling.average)
                d = ac[ra:rb]; m = np.isnan(d) & np.isfinite(tmp); d[m] = tmp[m]; del tmp
            ac[~maskc] = np.nan
            anc = disk_anom(ac, maskc, step=0.01)
            a = up(ac); an = up(anc); del ac, anc
            an[~mask] = np.nan
            a[~mask] = np.nan
            name = f'l_{dn}_{sea}'
            meth = (f'MODIS LST {y0}-{y1} {sea.upper()} mean {dn}time surface temperature: mean of the Terra and Aqua seasonal means '
                    f'({over[dn]}); 8-day composites, QC produced and LST error <= 2 K, >= {MIN_N} composites per sensor-pixel; '
                    f'1 km sinusoidal cells area-averaged (GDAL average) onto a 0.01 degree lattice and repeated over its 4x4 9 arc-second cells (1 km values, not 250 m detail).')
            S.write_band(S.DATA, name, a, scale=0.1, units='deg C', method=meth, source=src, licence=lic,
                         extra={'n': int(np.isfinite(a).sum()), 'family': 'l', 'years': [y0, y1], 'medianCompositesPerPixel': nmin.get((dn, sea))})
            S.write_band(S.DATA, f'l_{dn}_anom_{sea}', an, scale=0.1, units='K',
                         method=f'{name} minus its NaN-aware mean within a 10 km radius (metric circle on the 0.01 degree lattice, repeated over its 4x4 g9 cells). '
                                'Positive = warmer surface than the surrounding 10 km (urban heat; sunlit valley floors by day); negative = cold-air pooling at night, irrigated/forested cooling by day.',
                         source=src, licence=lic, extra={'n': int(np.isfinite(an).sum()), 'family': 'l', 'years': [y0, y1]})
            for p in pts:
                r, c = S.cell_of(p['lat'], p['lon'])
                pvals.setdefault(name, {})[p['id']] = point_bilinear(per_tile, key, p['lat'], p['lon'])
                pvals.setdefault(f'l_{dn}_anom_{sea}', {})[p['id']] = float(an[r, c]) if np.isfinite(an[r, c]) else None
            del an, a, per_tile
            log(f'{name} written')
    units = {}
    for k in pvals:
        what = f'MODIS {y0}-{y1} ' + k.split('_')[-1].upper() + ' ' + ('day (10:30/13:30)' if '_day' in k else 'night (22:30/01:30)')
        units[k] = (f'K - {what} LST minus its 10 km radius mean (grid cell holding the point)' if 'anom' in k else f'deg C - {what} LST, bilinear at the point from the native 1 km grid')
    S.merge_pointfeat(pvals, units); S.note_sources(['modis11'])
    log('done')


if __name__ == '__main__':
    main()
