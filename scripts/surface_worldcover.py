"""v91.17.72 · S · ESA WorldCover 2021 v200 (10 m) -> class shares on the g9 feature grid + point features.

Streams the 3x3 degree tiles from the AWS open bucket one at a time (download, reduce, delete), prefetching the next.
Grid: a WorldCover pixel is 1/12000 deg, a g9 cell 1/400 deg, both anchored on whole degrees / 60.75 E, 37.25 N, so a
cell is exactly 30 x 30 pixels. Cell value = share of the cell's valid pixels (value != 0) in the class.
Points: class of the pixel containing the point, and class shares inside circular buffers of 100 m, 500 m and 1 km
(pixel-centre distance, metres on the WGS84 sphere approximation, buffers straddling tiles are summed across tiles).
Usage: python3 surface_worldcover.py
"""
import os, sys, time, threading, subprocess, json
import numpy as np
import rasterio
from rasterio.windows import Window
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface_common as S

URL = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{t}_Map.tif'
CLASSES = [('tree', (10,)), ('shrub', (20,)), ('grass', (30,)), ('crop', (40,)), ('built', (50,)), ('bare', (60,)),
           ('snow', (70,)), ('water', (80,)), ('wetland', (90, 95))]
CODES = list(range(0, 256))
BUF = [(100, 'b100'), (500, 'b500'), (1000, 'b1k')]
PX = 1 / 12000
R_E = 6371008.8


def tiles(mask):
    out = []
    for la in range(21, 39, 3):
        for lo in range(60, 79, 3):
            r0, r1 = int(round((37.25 - (la + 3)) * 400)), int(round((37.25 - la) * 400))
            c0, c1 = int(round((lo - 60.75) * 400)), int(round((lo + 3 - 60.75) * 400))
            sub = mask[max(r0, 0):max(min(r1, 5500), 0), max(c0, 0):max(min(c1, 6900), 0)]
            if sub.size and sub.any(): out.append((la, lo))
    return out


def tname(la, lo): return f'N{la:02d}E{lo:03d}'


def fetch(t, dst):
    tmp = dst + '.part'
    r = subprocess.run(['curl', '-sS', '-f', '--retry', '4', '-o', tmp, URL.format(t=t)], capture_output=True)
    if r.returncode == 0: os.replace(tmp, dst); return True
    if os.path.exists(tmp): os.remove(tmp)
    return False


def main():
    t0 = time.time()
    mask = S.pak_mask()
    pts = S.located_points()
    work = os.path.join(S.SCRATCH, 'wc'); os.makedirs(work, exist_ok=True)
    R, C = S.GRID['rows'], S.GRID['cols']
    # per-class count memmaps (uint16, max 900) + valid count
    mm = {k: np.lib.format.open_memmap(os.path.join(work, f'cnt_{k}.npy'), 'w+', np.uint16, (R, C)) for k, _ in CLASSES}
    valid = np.lib.format.open_memmap(os.path.join(work, 'cnt_valid.npy'), 'w+', np.uint16, (R, C))
    pcnt = {p['id']: {b: np.zeros(256, np.int64) for _, b in BUF} for p in pts}
    pclass = {}
    tl = tiles(mask)
    print('tiles', len(tl), flush=True)
    files = {}
    def pre(i):
        if i < len(tl):
            t = tname(*tl[i]); d = os.path.join(work, t + '.tif')
            th = threading.Thread(target=lambda: files.__setitem__(i, d if fetch(t, d) else None)); th.start(); return th
    th = pre(0)
    for i, (la, lo) in enumerate(tl):
        th.join(); th2 = pre(i + 1)
        f = files.pop(i, None)
        if not f:
            print('missing tile', tname(la, lo), flush=True); th = th2; continue
        with rasterio.open(f) as ds:
            assert abs(ds.transform.a - PX) < 1e-12 and abs(ds.transform.c - lo) < 1e-9 and abs(ds.transform.f - (la + 3)) < 1e-9
            gr0 = int(round((37.25 - (la + 3)) * 400)); gc0 = int(round((lo - 60.75) * 400))
            SR = 40  # cells per strip (1200 pixel rows)
            for cr in range(0, 1200, SR):
                g_r = gr0 + cr
                if g_r + SR <= 0 or g_r >= R: continue
                rr0, rr1 = max(g_r, 0), min(g_r + SR, R)
                cc0, cc1 = max(gc0, 0), min(gc0 + 1200, C)
                if cc1 <= cc0 or not mask[rr0:rr1, cc0:cc1].any(): continue
                a = ds.read(1, window=Window(0, cr * 30, 36000, SR * 30))
                a4 = a.reshape(SR, 30, 1200, 30)
                v = (a4 != 0).sum((1, 3), dtype=np.uint16)
                sl_t = (slice(rr0 - g_r, rr1 - g_r), slice(cc0 - gc0, cc1 - gc0))
                valid[rr0:rr1, cc0:cc1] = v[sl_t]
                for k, codes in CLASSES:
                    m = np.zeros(a4.shape, bool)
                    for c in codes: m |= (a4 == c)
                    mm[k][rr0:rr1, cc0:cc1] = m.sum((1, 3), dtype=np.uint16)[sl_t]
                del a, a4
            # points whose 1 km buffer touches this tile
            for p in pts:
                lat, lon = p['lat'], p['lon']
                dlat = 1000 / R_E * 180 / np.pi; dlon = dlat / np.cos(np.radians(lat))
                if not (la - dlat < lat < la + 3 + dlat and lo - dlon < lon < lo + 3 + dlon): continue
                row = (la + 3 - lat) / PX; col = (lon - lo) / PX
                hr = int(np.ceil(dlat / PX)) + 1; hc = int(np.ceil(dlon / PX)) + 1
                r0, r1 = max(int(row) - hr, 0), min(int(row) + hr + 1, 36000)
                c0, c1 = max(int(col) - hc, 0), min(int(col) + hc + 1, 36000)
                if r1 <= r0 or c1 <= c0: continue
                w = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0))
                plat = la + 3 - (np.arange(r0, r1) + 0.5) * PX; plon = lo + (np.arange(c0, c1) + 0.5) * PX
                dy = (plat[:, None] - lat) * np.pi / 180 * R_E; dx = (plon[None, :] - lon) * np.pi / 180 * R_E * np.cos(np.radians(lat))
                d = np.hypot(dy, dx)
                for rad, b in BUF:
                    sel = w[(d <= rad) & (w != 0)]
                    pcnt[p['id']][b] += np.bincount(sel, minlength=256)
                if la <= lat < la + 3 and lo <= lon < lo + 3:
                    pclass[p['id']] = int(w[int(row) - r0, int(col) - c0])
        os.remove(f)
        print(f'{tname(la, lo)} done {time.time() - t0:.0f}s scratch {S.scratch_used_gb():.2f} GB', flush=True)
        th = th2
    # write bands
    vf = valid.astype(np.float32)
    ok = mask & (vf > 0)
    ncell = int(ok.sum())
    for k, codes in CLASSES:
        sh = np.full((R, C), np.nan, np.float32)
        sh[ok] = mm[k][ok] / vf[ok]
        S.write_band(S.DATA, f's_wc_{k}', sh, scale=0.01, units='fraction 0-1',
                     method=f'ESA WorldCover 2021 v200 10 m; share of the cell\'s valid 10 m pixels in class {"/".join(map(str, codes))} ({k}); '
                            f'each 9 arc-second cell is exactly 30x30 WorldCover pixels (no resampling). Cells within 10 km of a Pakistani tehsil; '
                            f'pixels with value 0 (no data, open sea) excluded.',
                     source='ESA WorldCover 2021 v200, s3://esa-worldcover/v200/2021/map (AWS open data), scripts/surface_worldcover.py',
                     licence=S.LIC['worldcover'], extra={'n': ncell, 'family': 's'})
        del sh
    del vf
    # point features
    cols, units = {'s_wc_class': {}}, {'s_wc_class': 'WorldCover class code at the point (10 tree, 20 shrub, 30 grass, 40 crop, 50 built, 60 bare, 70 snow/ice, 80 water, 90 wetland, 95 mangrove, 100 moss)'}
    for pid, c in pclass.items(): cols['s_wc_class'][pid] = c
    for k, codes in CLASSES:
        for rad, b in BUF:
            f = f's_wc_{k}_{b}'; cols[f] = {}; units[f] = f'fraction 0-1 of valid 10 m pixels within {rad} m of the point in WorldCover class {k}'
            for pid, cnt in pcnt.items():
                tot = cnt[b][1:].sum()
                cols[f][pid] = float(sum(cnt[b][c] for c in codes) / tot) if tot else None
    S.merge_pointfeat(cols, units); S.note_sources(['worldcover'])
    for x in list(mm.values()) + [valid]: del x
    for fn in os.listdir(work): os.remove(os.path.join(work, fn))
    print(f'done {time.time() - t0:.0f}s cells {ncell}', flush=True)


if __name__ == '__main__':
    main()
