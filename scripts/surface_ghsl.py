"""v91.17.72 · S · GHS-BUILT-S R2023A E2018 10 m -> s_built10 on the g9 grid + point features.

Input: GHS_BUILT_S_E2018_GLOBE_R2023A_54009_10 V1-0 tiles (Mollweide ESRI:54009, 10 m, 1000 km tiles, value = built-up
surface in m2 per 100 m2 pixel), streamed one zip at a time (download, unzip, reduce, delete).
Reduction: 10x10 block mean -> 100 m Mollweide built share (%), then GDAL 'average' warp onto the 9 arc-second grid.
Points: built share within 100 m and 500 m of the point from the 10 m pixels (Mollweide metres).
Usage: python3 surface_ghsl.py
"""
import os, sys, time, subprocess, zipfile
import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.warp import reproject, Resampling, transform_bounds
from affine import Affine
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface_common as S

BASE = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_S_GLOBE_R2023A/GHS_BUILT_S_E2018_GLOBE_R2023A_54009_10/V1-0/tiles/'
NAME = 'GHS_BUILT_S_E2018_GLOBE_R2023A_54009_10_V1_0_{t}'
TILES = ['R6_C25', 'R5_C25', 'R6_C24', 'R7_C25', 'R5_C26', 'R6_C26']
MOLL = 'ESRI:54009'


def main():
    t0 = time.time(); log = lambda m: print(f'[{time.time() - t0:5.0f}s] {m}', flush=True)
    mask = S.pak_mask(); R, C = S.GRID['rows'], S.GRID['cols']; G9 = S.g9_transform()
    work = os.path.join(S.SCRATCH, 'ghsl'); os.makedirs(work, exist_ok=True)
    acc = np.zeros((R, C), np.float32); cnt = np.zeros((R, C), np.uint8)
    pts = S.located_points(); T = Transformer.from_crs(4326, MOLL, always_xy=True)
    pxy = {p['id']: T.transform(p['lon'], p['lat']) for p in pts}
    pc = {'s_built10_b100': {}, 's_built10_b500': {}}
    for t in TILES:
        z = os.path.join(work, t + '.zip')
        subprocess.run(['curl', '-sS', '-f', '--retry', '4', '-o', z, BASE + NAME.format(t=t) + '.zip'], check=True)
        with zipfile.ZipFile(z) as zf:
            tif = [n for n in zf.namelist() if n.endswith('.tif')][0]; zf.extract(tif, work)
        os.remove(z); f = os.path.join(work, tif)
        log(f'{t} downloaded, scratch {S.scratch_used_gb():.2f} GB')
        with rasterio.open(f) as ds:
            H, W = ds.height, ds.width; tr = ds.transform
            h100, w100 = H // 10, W // 10
            share = np.full((h100, w100), 255, np.uint8)
            for r in range(0, h100, 50):
                n = min(50, h100 - r)
                a = ds.read(1, window=Window(0, r * 10, w100 * 10, n * 10))
                nod = ds.nodata
                v = a.reshape(n, 10, w100, 10)
                ok = (v != nod) if nod is not None else np.ones(v.shape, bool)
                s = np.where(ok, v, 0).sum((1, 3), dtype=np.int32); k = ok.sum((1, 3))
                share[r:r + n] = np.where(k > 0, np.round(s / np.maximum(k, 1)), 255).astype(np.uint8)
            tr100 = Affine(tr.a * 10, 0, tr.c, 0, tr.e * 10, tr.f)
            b = transform_bounds(MOLL, 'EPSG:4326', tr.c, tr.f + tr.e * H, tr.c + tr.a * W, tr.f, densify_pts=51)
            ra, rb = max(int((37.25 - b[3]) * 400) - 2, 0), min(int((37.25 - b[1]) * 400) + 3, R)
            ca, cb = max(int((b[0] - 60.75) * 400) - 2, 0), min(int((b[2] - 60.75) * 400) + 3, C)
            if rb > ra and cb > ca:
                dst = np.full((rb - ra, cb - ca), np.nan, np.float32)
                reproject(share, dst, src_transform=tr100, src_crs=MOLL, src_nodata=255, dst_transform=G9 * Affine.translation(ca, ra),
                          dst_crs='EPSG:4326', dst_nodata=np.nan, resampling=Resampling.average)
                fin = np.isfinite(dst); acc[ra:rb, ca:cb][fin] += dst[fin]; cnt[ra:rb, ca:cb][fin] += 1
                del dst
            del share
            for pid, (x, y) in pxy.items():
                if not (tr.c + 600 < x < tr.c + tr.a * W - 600 and tr.f + tr.e * H + 600 < y < tr.f - 600): continue
                col, row = int((x - tr.c) / 10), int((tr.f - y) / 10)
                a = ds.read(1, window=Window(col - 51, row - 51, 103, 103)).astype(np.float32)
                if ds.nodata is not None: a[a == ds.nodata] = np.nan
                xx = tr.c + (np.arange(col - 51, col + 52) + 0.5) * 10; yy = tr.f - (np.arange(row - 51, row + 52) + 0.5) * 10
                d = np.hypot(yy[:, None] - y, xx[None, :] - x)
                for rad, k in ((100, 's_built10_b100'), (500, 's_built10_b500')):
                    sel = a[(d <= rad) & np.isfinite(a)]
                    pc[k][pid] = float(sel.mean() / 100) if sel.size else None
        os.remove(f)
        log(f'{t} done')
    ok = (cnt > 0) & mask
    out = np.where(ok, acc / np.maximum(cnt, 1) / 100.0, np.nan).astype(np.float32)
    S.write_band(S.DATA, 's_built10', out, scale=0.01, units='fraction 0-1 (built-up surface share)',
                 method='GHS-BUILT-S R2023A epoch 2018, 10 m (built-up surface m2 per 100 m2 pixel), 10x10 block mean to 100 m in Mollweide, '
                        'then GDAL area-average warp onto the 9 arc-second grid; divided by 100. Cells within 10 km of a Pakistani tehsil.',
                 source='JRC GHSL ' + BASE + ' tiles ' + ', '.join(TILES) + ', scripts/surface_ghsl.py', licence=S.LIC['ghsl'],
                 extra={'n': int(ok.sum()), 'family': 's', 'epoch': 2018})
    S.merge_pointfeat(pc, {'s_built10_b100': 'fraction 0-1 - GHS-BUILT-S 2018 10 m built-up surface share within 100 m of the point',
                           's_built10_b500': 'fraction 0-1 - GHS-BUILT-S 2018 10 m built-up surface share within 500 m of the point'})
    S.note_sources(['ghsl'])
    log(f'done cells {int(ok.sum())}')


if __name__ == '__main__':
    main()
