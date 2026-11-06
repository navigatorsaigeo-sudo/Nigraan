"""v91.17.72 · S · JRC Global Surface Water occurrence (30 m) -> w_occ, w_dist on the g9 grid + point features.

Input: GSW v1.4 (1984-2021) occurrence tiles 60E_40N, 70E_40N, 60E_30N, 70E_30N (10x10 deg, 1/4000 deg pixels,
0-100 % of valid observations that saw water, 255 = no data). A g9 cell is exactly 10x10 GSW pixels.
  w_occ  = mean occurrence (%) of the cell's valid pixels (land = 0).
  w_dist = distance (km) from the cell centre to the centre of the nearest cell holding at least one pixel with
           occurrence >= 50 %, 0 for such cells, capped at 20 km. Euclidean distance transform on the 9 arc-second
           grid with metric spacing (N-S 1/400 deg, E-W scaled by cos(latitude) per 1-degree strip, 0.3 deg overlap).
Points (30 m, from the fine pixels): w_dist_km (point to nearest occ>=50 pixel centre, searched to 20 km, capped),
  w_occ_pt (occurrence of the pixel holding the point), w_share_b500 / w_share_b1k (share of valid pixels with
  occurrence >= 50 % within 500 m / 1 km), w_occ_b1k (mean occurrence within 1 km).
Usage: python3 surface_water.py
"""
import os, sys, time, subprocess
import numpy as np
import rasterio
from rasterio.windows import Window
from scipy.ndimage import distance_transform_edt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface_common as S

URL = 'https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/occurrence_{t}v1_4_2021.tif'
TILES = [('60E_40N', 60, 40), ('70E_40N', 70, 40), ('60E_30N', 60, 30), ('70E_30N', 70, 30)]
PX = 1 / 4000
R_E = 6371008.8
THR = 50
CAP = 20.0


def main():
    t0 = time.time()
    mask = S.pak_mask(); R, C = S.GRID['rows'], S.GRID['cols']
    work = os.path.join(S.SCRATCH, 'gsw'); os.makedirs(work, exist_ok=True)
    paths = []
    for t, lo, la in TILES:
        d = os.path.join(work, t + '.tif')
        if not os.path.exists(d):
            subprocess.run(['curl', '-sS', '-f', '--retry', '4', '-o', d, URL.format(t=t)], check=True)
        paths.append(d)
    print('downloaded', f'{S.scratch_used_gb():.2f} GB', f'{time.time() - t0:.0f}s', flush=True)
    occ = np.full((R, C), np.nan, np.float32)
    wet = np.zeros((R, C), bool)
    for (t, lo, la), f in zip(TILES, paths):
        with rasterio.open(f) as ds:
            gr0 = int(round((37.25 - la) * 400)); gc0 = int(round((lo - 60.75) * 400))
            for cr in range(0, 4000, 100):
                g_r = gr0 + cr
                if g_r + 100 <= 0 or g_r >= R: continue
                rr0, rr1 = max(g_r, 0), min(g_r + 100, R); cc0, cc1 = max(gc0, 0), min(gc0 + 4000, C)
                if cc1 <= cc0 or not mask[rr0:rr1, cc0:cc1].any(): continue
                a = ds.read(1, window=Window(0, cr * 10, 40000, 1000)).reshape(100, 10, 4000, 10)
                v = a != 255
                n = v.sum((1, 3)); s = np.where(v, a, 0).sum((1, 3), dtype=np.int64)
                w = ((a >= THR) & v).any((1, 3))
                sl = (slice(rr0 - g_r, rr1 - g_r), slice(cc0 - gc0, cc1 - gc0))
                with np.errstate(invalid='ignore', divide='ignore'):
                    m = np.where(n > 0, s / np.maximum(n, 1), np.nan).astype(np.float32)
                occ[rr0:rr1, cc0:cc1] = m[sl]; wet[rr0:rr1, cc0:cc1] = w[sl]
        print(t, f'{time.time() - t0:.0f}s', flush=True)
    # distance transform in 1-degree strips with overlap
    dist = np.full((R, C), np.nan, np.float32)
    ov = 120  # 0.3 deg
    for r in range(0, R, 400):
        a0, a1 = max(r - ov, 0), min(r + 400 + ov, R)
        latc = 37.25 - (r + 200) / 400
        dy = S.GRID['cell'] * np.pi / 180 * R_E / 1000; dx = dy * np.cos(np.radians(latc))
        sub = ~wet[a0:a1]
        if sub.all(): d = np.full(sub.shape, np.inf, np.float32)
        else: d = distance_transform_edt(sub, sampling=(dy, dx)).astype(np.float32)
        dist[r:r + 400] = np.minimum(d[r - a0:r - a0 + min(400, R - r)], CAP)
    occ[~mask] = np.nan; dist[~mask] = np.nan
    dist[np.isnan(occ)] = np.nan
    n = int(np.isfinite(occ).sum())
    lic = S.LIC['gsw']
    S.write_band(S.DATA, 'w_occ', occ, scale=0.01, units='% (mean water occurrence 1984-2021)',
                 method='JRC GSW v1.4 occurrence (30 m); mean over the 10x10 valid pixels of each 9 arc-second cell (no resampling); land pixels count as 0 %; cells within 10 km of a Pakistani tehsil.',
                 source='JRC Global Surface Water v1.4 occurrence tiles 60E_40N, 70E_40N, 60E_30N, 70E_30N (storage.googleapis.com/global-surface-water/downloads2021), scripts/surface_water.py',
                 licence=lic, extra={'n': n, 'family': 'w'})
    S.write_band(S.DATA, 'w_dist', dist, scale=0.01, units='km (capped at 20)',
                 method=f'distance from the cell centre to the nearest 9 arc-second cell containing at least one 30 m GSW pixel with occurrence >= {THR} %, '
                        f'0 for such cells; Euclidean distance transform with metric spacing per 1-degree latitude strip; capped at {CAP:g} km.',
                 source='JRC Global Surface Water v1.4 occurrence, scripts/surface_water.py', licence=lic, extra={'n': n, 'family': 'w', 'threshold_pct': THR, 'cap_km': CAP})
    del occ, dist, wet
    # points from the fine pixels: windows assembled across the four tiles (all share the 1/4000 deg lattice)
    west, north = 60.0, 40.0
    dss = [(rasterio.open(f), lo, la) for (t, lo, la), f in zip(TILES, paths)]
    def mosaic(r0, c0, h, w):
        out = np.full((h, w), 255, np.uint8)
        for ds, lo, la in dss:
            tr0 = int(round((north - la) / PX)); tc0 = int(round((lo - west) / PX))
            a0, a1 = max(r0, tr0), min(r0 + h, tr0 + 40000); b0, b1 = max(c0, tc0), min(c0 + w, tc0 + 40000)
            if a1 <= a0 or b1 <= b0: continue
            out[a0 - r0:a1 - r0, b0 - c0:b1 - c0] = ds.read(1, window=Window(b0 - tc0, a0 - tr0, b1 - b0, a1 - a0))
        return out
    cols = {k: {} for k in ('w_dist_km', 'w_occ_pt', 'w_share_b500', 'w_share_b1k', 'w_occ_b1k')}
    if True:
        for p in S.located_points():
            lat, lon = p['lat'], p['lon']
            dlat = CAP * 1000 / R_E * 180 / np.pi; dlon = dlat / np.cos(np.radians(lat))
            row = (north - lat) / PX; col = (lon - west) / PX
            hr, hc = int(dlat / PX) + 2, int(dlon / PX) + 2
            r0, c0 = int(row) - hr, int(col) - hc
            a = mosaic(r0, c0, 2 * hr + 1, 2 * hc + 1)
            plat = north - (np.arange(r0, r0 + a.shape[0]) + 0.5) * PX; plon = west + (np.arange(c0, c0 + a.shape[1]) + 0.5) * PX
            dyy = (plat[:, None] - lat) * np.pi / 180 * R_E; dxx = (plon[None, :] - lon) * np.pi / 180 * R_E * np.cos(np.radians(lat))
            d = np.hypot(dyy, dxx) / 1000
            v = a != 255; wt = v & (a >= THR)
            cols['w_dist_km'][p['id']] = float(min(d[wt].min(), CAP)) if wt.any() else CAP
            pv = a[int(row) - r0, int(col) - c0]
            cols['w_occ_pt'][p['id']] = float(pv) if pv != 255 else None
            for rad, k in ((0.5, 'w_share_b500'), (1.0, 'w_share_b1k')):
                sel = v & (d <= rad)
                cols[k][p['id']] = float(wt[sel].mean()) if sel.any() else None
            sel = v & (d <= 1.0)
            cols['w_occ_b1k'][p['id']] = float(a[sel].mean()) if sel.any() else None
    units = {'w_dist_km': 'km - distance from the point to the nearest 30 m pixel with GSW occurrence >= 50 % (capped 20)',
             'w_occ_pt': '% - GSW occurrence of the 30 m pixel holding the point',
             'w_share_b500': 'fraction 0-1 of valid 30 m pixels within 500 m with occurrence >= 50 %',
             'w_share_b1k': 'fraction 0-1 of valid 30 m pixels within 1 km with occurrence >= 50 %',
             'w_occ_b1k': '% - mean GSW occurrence within 1 km'}
    for ds, _, _ in dss: ds.close()
    S.merge_pointfeat(cols, units); S.note_sources(['gsw'])
    for f in os.listdir(work): os.remove(os.path.join(work, f))
    print(f'done {time.time() - t0:.0f}s cells {n}', flush=True)


if __name__ == '__main__':
    main()
