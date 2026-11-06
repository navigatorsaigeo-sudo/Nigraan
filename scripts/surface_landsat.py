"""v91.17.72 · S · Landsat 8/9 Collection 2 Level-2 surface temperature, JJA 2022-2025 daytime median, city AOIs.

Source: Planetary Computer `landsat-c2-l2` (anonymous SAS), band lwir11 (ST_B10, 30 m delivered, 100 m TIRS native),
scale 0.00341802, offset 149.0 K; QA_PIXEL keeps pixels flagged clear (bit 6) or water (bit 7) and not dilated
cloud/cirrus/cloud/shadow/snow (bits 1-5). Scenes: June-August 2022-2025, eo:cloud_cover < 40 %, least cloudy MAXS.
Each scene's AOI window is warped (nearest) to a common 1 arc-second lat/lon grid aligned with the 9 arc-second
feature grid; per-pixel median over scenes; the g9 cell value is the mean of its 9x9 one-arc-second pixels
(>= 50 % valid). Overpass about 10:30-11:00 local time: a late-morning surface temperature, not the afternoon peak.
Points: every located point inside an AOI: the 1 arc-second pixel holding it and means within 100 m / 500 m.
Usage: python3 surface_landsat.py
"""
import os, sys, time, warnings
import numpy as np
import concurrent.futures as cf
import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import reproject, Resampling, transform_bounds
from affine import Affine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface_common as S

warnings.filterwarnings('ignore')
CITIES = {  # name: (lat, lon, half-size deg)
    'Karachi': (24.93, 67.08, 0.25), 'Lahore': (31.50, 74.33, 0.20), 'Faisalabad': (31.42, 73.09, 0.12),
    'Islamabad-Rawalpindi': (33.64, 73.05, 0.20), 'Gujranwala': (32.16, 74.19, 0.10), 'Multan': (30.20, 71.47, 0.12),
    'Hyderabad': (25.39, 68.37, 0.12), 'Peshawar': (34.01, 71.54, 0.15), 'Quetta': (30.19, 67.01, 0.12)}
YEARS = range(2022, 2026)
MAXS = 20
ARC = 1 / 3600
BAD = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5)


def aoi(lat, lon, h):
    """snap the box outward to the 9 arc-second grid"""
    c = 1 / 400
    w = 60.75 + np.floor((lon - h - 60.75) / c) * c; e = 60.75 + np.ceil((lon + h - 60.75) / c) * c
    n = 37.25 - np.floor((37.25 - (lat + h)) / c) * c; s = 37.25 - np.ceil((37.25 - (lat - h)) / c) * c
    return w, s, e, n


def read_scene(it, box, shape):
    import planetary_computer as pc
    for k in range(3):
        try:
            epsg = int(str(it.properties.get('proj:code') or f"EPSG:{it.properties['proj:epsg']}").split(':')[-1])
            b = transform_bounds('EPSG:4326', f'EPSG:{epsg}', *box, densify_pts=21)
            out = {}
            for a in ('lwir11', 'qa_pixel'):
                with rasterio.open(it.assets[a].href) as d:
                    win = from_bounds(*b, d.transform).round_offsets().round_lengths()
                    arr = d.read(1, window=win, boundless=True, fill_value=0); tr = d.window_transform(win)
                out[a] = (arr, tr, epsg)
            st, tr, epsg = out['lwir11']; qa = out['qa_pixel'][0]
            ok = (st > 0) & (((qa >> 6) & 1) | ((qa >> 7) & 1)).astype(bool) & ((qa & BAD) == 0)
            v = np.where(ok, st * 0.00341802 + 149.0 - 273.15, np.nan).astype(np.float32)
            dst = np.full(shape, np.nan, np.float32)
            reproject(v, dst, src_transform=tr, src_crs=f'EPSG:{epsg}', src_nodata=np.nan,
                      dst_transform=Affine(ARC, 0, box[0], 0, -ARC, box[3]), dst_crs='EPSG:4326', dst_nodata=np.nan, resampling=Resampling.nearest)
            return dst
        except Exception as e:
            if k == 2: print('   fail', it.id, str(e)[:100], flush=True); return None
            pc.sign_inplace(it); time.sleep(5)


def main():
    t0 = time.time(); log = lambda m: print(f'[{time.time() - t0:5.0f}s] {m}', flush=True)
    import pystac_client, planetary_computer as pc
    cat = pystac_client.Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=pc.sign_inplace)
    R, C = S.GRID['rows'], S.GRID['cols']
    band = np.full((R, C), np.nan, np.float32)
    pts = S.located_points(); pcols = {'l_ls_jja_pt': {}, 'l_ls_jja_b100': {}, 'l_ls_jja_b500': {}, 'l_ls_n': {}}
    info = {}
    for city, (lat, lon, h) in CITIES.items():
        box = aoi(lat, lon, h)
        items = []
        for y in YEARS:
            items += list(cat.search(collections=['landsat-c2-l2'], bbox=list(box), datetime=f'{y}-06-01/{y}-08-31',
                                     query={'eo:cloud_cover': {'lt': 40}, 'platform': {'in': ['landsat-8', 'landsat-9']}}).items())
        items.sort(key=lambda i: i.properties['eo:cloud_cover']); items = items[:MAXS]
        shape = (int(round((box[3] - box[1]) / ARC)), int(round((box[2] - box[0]) / ARC)))
        with cf.ThreadPoolExecutor(4) as ex:
            stack = [a for a in ex.map(lambda it: read_scene(it, box, shape), items) if a is not None]
        if not stack: log(f'{city}: no scenes'); continue
        st = np.stack(stack); del stack
        med = np.full(shape, np.nan, np.float32); nobs = np.zeros(shape, np.int16)
        with np.errstate(all='ignore'):
            for a in range(0, shape[0], 200):   # chunked to bound the temporaries
                med[a:a + 200] = np.nanmedian(st[:, a:a + 200], 0); nobs[a:a + 200] = np.isfinite(st[:, a:a + 200]).sum(0)
        del st
        # 9x9 block mean onto g9
        hh, ww = shape[0] // 9, shape[1] // 9
        blk = med[:hh * 9, :ww * 9].reshape(hh, 9, ww, 9)
        fin = np.isfinite(blk).sum((1, 3))
        with np.errstate(all='ignore'):
            cm = np.where(fin >= 41, np.nansum(blk, (1, 3)) / np.maximum(fin, 1), np.nan)
        r0, c0 = S.cell_of(box[3] - 1e-9, box[0] + 1e-9)
        band[r0:r0 + hh, c0:c0 + ww] = np.where(np.isfinite(cm), cm, band[r0:r0 + hh, c0:c0 + ww])
        info[city] = {'scenes': len(items), 'medianObsPerPixel': int(np.median(nobs)), 'box': [round(x, 4) for x in box]}
        # points inside the AOI
        for p in pts:
            if not (box[0] < p['lon'] < box[2] and box[1] < p['lat'] < box[3]): continue
            i = int((box[3] - p['lat']) / ARC); j = int((p['lon'] - box[0]) / ARC)
            pcols['l_ls_jja_pt'][p['id']] = float(med[i, j]) if np.isfinite(med[i, j]) else None
            pcols['l_ls_n'][p['id']] = float(nobs[i, j])
            k = 20; sub = med[max(i - k, 0):i + k + 1, max(j - k, 0):j + k + 1]
            yy = (np.arange(max(i - k, 0), max(i - k, 0) + sub.shape[0]) + 0.5) * ARC; xx = (np.arange(max(j - k, 0), max(j - k, 0) + sub.shape[1]) + 0.5) * ARC
            dy = ((box[3] - yy)[:, None] - p['lat']) * 111195; dx = ((box[0] + xx)[None, :] - p['lon']) * 111195 * np.cos(np.radians(p['lat']))
            d = np.hypot(dy, dx)
            for rad, kk in ((100, 'l_ls_jja_b100'), (500, 'l_ls_jja_b500')):
                s_ = sub[(d <= rad) & np.isfinite(sub)]
                pcols[kk][p['id']] = float(s_.mean()) if s_.size else None
        log(f'{city}: {len(items)} scenes, median obs/pixel {info[city]["medianObsPerPixel"]}')
        del med, nobs
    n = int(np.isfinite(band).sum())
    S.write_band(S.DATA, 'l_ls_jja', band, scale=0.01, units='deg C',
                 method=f'Landsat 8/9 C2 L2 surface temperature (ST_B10), June-August {YEARS[0]}-{YEARS[-1]}, per-pixel median of up to {MAXS} least-cloudy scenes '
                        '(QA_PIXEL clear or water, no cloud/cirrus/shadow/snow), 1 arc-second, cell = mean of 9x9 pixels (>= 50 % valid). '
                        'Late-morning overpass (about 10:30-11:00 local). Only the city boxes are filled: ' + ', '.join(CITIES) + '.',
                 source='Planetary Computer landsat-c2-l2 (lwir11, qa_pixel), scripts/surface_landsat.py', licence=S.LIC['landsat'],
                 extra={'n': n, 'family': 'l', 'cities': info})
    units = {'l_ls_jja_pt': 'deg C - Landsat JJA 2022-2025 median late-morning surface temperature at the point (1 arc-second pixel); city boxes only',
             'l_ls_jja_b100': 'deg C - the same, mean within 100 m', 'l_ls_jja_b500': 'deg C - the same, mean within 500 m',
             'l_ls_n': 'count - clear Landsat observations in the median at the point'}
    S.merge_pointfeat(pcols, units); S.note_sources(['landsat'])
    log(f'done cells {n}')


if __name__ == '__main__':
    main()
