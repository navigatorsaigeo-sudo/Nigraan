"""v91.17.72 · S · MODIS 500 m NDVI seasonal medians, used ONLY to fill Sentinel-2 NDVI gaps (surface_s2.py write()).

Source: Planetary Computer `modis-13A1-061` (MOD13A1 Terra + MYD13A1 Aqua, 16-day, 500 m), NDVI x 1e-4, kept where
pixel_reliability is 0 (good) or 1 (marginal). Season windows over the last 24 months (Sep 2024 - Aug 2026) because the
catalogue is sparse for single seasons; per-pixel median; carried onto the 9 arc-second grid by nearest neighbour.
Output: scratch s2/modis_<season>.npy (not a band on its own).
Usage: python3 surface_modis_ndvi.py
"""
import os, sys, time, warnings
import numpy as np
import concurrent.futures as cf
import rasterio
from rasterio.warp import reproject, Resampling
from affine import Affine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface_common as S
from surface_lst import SIN, TW

warnings.filterwarnings('ignore')
TILES = [(22, 5), (23, 5), (24, 5), (23, 6), (24, 6), (25, 6)]
SEAS = {'son': [('2024-09-01', '2024-11-30'), ('2025-09-01', '2025-11-30')], 'djf': [('2024-12-01', '2025-02-28'), ('2025-12-01', '2026-02-28')],
        'mam': [('2025-03-01', '2025-05-31'), ('2026-03-01', '2026-05-31')], 'jja': [('2025-06-01', '2025-08-31'), ('2026-06-01', '2026-08-31')]}
MAXN = 16
PX = TW / 2400


def rd(it):
    import planetary_computer as pc
    for k in range(3):
        try:
            with rasterio.open(it.assets['500m_16_days_NDVI'].href) as d: a = d.read(1)
            with rasterio.open(it.assets['500m_16_days_pixel_reliability'].href) as d: q = d.read(1)
            return np.where((q >= 0) & (q <= 1) & (a > -3000), a, -32768).astype(np.int16)
        except Exception:
            if k == 2: return None
            pc.sign_inplace(it); time.sleep(5)


def main():
    import pystac_client, planetary_computer as pc
    t0 = time.time(); log = lambda m: print(f'[{time.time() - t0:5.0f}s] {m}', flush=True)
    cat = pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=pc.sign_inplace)
    mask = S.pak_mask(); R, C = S.GRID['rows'], S.GRID['cols']
    out_dir = os.path.join(S.SCRATCH, 's2'); os.makedirs(out_dir, exist_ok=True)
    for sea, wins in SEAS.items():
        g = np.full((R, C), np.nan, np.float32); used = 0
        for h, v in TILES:
            items = []
            for a, b in wins:
                items += list(cat.search(collections=['modis-13A1-061'], datetime=f'{a}/{b}',
                                         query={'modis:horizontal-tile': {'eq': h}, 'modis:vertical-tile': {'eq': v}}).items())
            items = items[:MAXN]
            if not items: continue
            with cf.ThreadPoolExecutor(4) as ex:
                st = [x for x in ex.map(rd, items) if x is not None]
            if not st: continue
            used += len(st)
            st = np.stack(st); med = np.full(st.shape[1:], np.nan, np.float32)
            for r in range(0, st.shape[1], 300):
                c = st[:, r:r + 300].astype(np.float32); c[c == -32768] = np.nan
                with np.errstate(all='ignore'): med[r:r + 300] = np.nanmedian(c, 0) * 1e-4
            del st
            tr = Affine(PX, 0, (h - 18) * TW, 0, -PX, (9 - v) * TW)
            ra, rb = (0, 2920) if v == 5 else (2880, R)
            tmp = np.full((rb - ra, C), np.nan, np.float32)
            reproject(med, tmp, src_transform=tr, src_crs=SIN, src_nodata=np.nan, dst_transform=S.g9_transform() * Affine.translation(0, ra),
                      dst_crs='EPSG:4326', dst_nodata=np.nan, resampling=Resampling.nearest)
            d = g[ra:rb]; m = np.isnan(d) & np.isfinite(tmp); d[m] = tmp[m]; del tmp, med
        g[~mask] = np.nan
        np.save(os.path.join(out_dir, f'modis_{sea}.npy'), g)
        log(f'{sea}: {used} composites, coverage {np.isfinite(g).sum() / mask.sum():.4f}')
        del g


if __name__ == '__main__':
    main()
