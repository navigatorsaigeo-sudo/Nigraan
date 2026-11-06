#!/usr/bin/env python3
"""aq41 step 1 - the 1 km predictor stack for the PM2.5 spatial downscaling layer (rules: data/evidence/aq41/AQ41_RULES_20261031.json).
1 km cell = 0.01 deg on the g9 extent (west 60.75, north 37.25; 1725 x 1375); each cell = mean of its 4 x 4 g9 250 m cells.
usage: python -I aq41_grid.py --tree <nigraan tree> --kilns <kilns dir> --roads <roads.json> --no2 <TEMIS dir> --out <grid.npz>"""
import os, sys, gzip, glob, json, argparse, numpy as np
from scipy.signal import fftconvolve

W0, N0, C1, NC, NR = 60.75, 37.25, 0.01, 1725, 1375
LATC = N0 - (np.arange(NR) + 0.5) * C1
LONC = W0 + (np.arange(NC) + 0.5) * C1


def agg4(a):
    a = a[:NR * 4, :NC * 4].reshape(NR, 4, NC, 4)
    with np.errstate(invalid='ignore'):
        return np.nanmean(a, axis=(1, 3)).astype('float32')


def boxmean(a, half):
    """nan-aware box mean, (2 half + 1)^2 cells"""
    k = np.ones((2 * half + 1, 2 * half + 1), 'float32'); ok = np.isfinite(a)
    s = fftconvolve(np.where(ok, a, 0).astype('float64'), k, mode='same'); n = fftconvolve(ok.astype('float64'), k, mode='same')
    with np.errstate(invalid='ignore', divide='ignore'):
        return np.where(n > 0.5, s / np.maximum(n, 1e-9), np.nan).astype('float32')


def disk_sum(grid, rkm):
    """sum of a 1 km raster within rkm (ellipse in cells: 1.112 km N-S, 1.112 cos(30.5) km E-W)"""
    dy = 111.2 * C1; dx = 111.2 * C1 * np.cos(np.radians(30.5)); ny = int(np.ceil(rkm / dy)); nx = int(np.ceil(rkm / dx))
    yy, xx = np.mgrid[-ny:ny + 1, -nx:nx + 1]; k = ((yy * dy) ** 2 + (xx * dx) ** 2 <= rkm ** 2).astype('float64')
    s = fftconvolve(grid.astype('float64'), k, mode='same')
    return np.where(s < 1e-6, 0, np.round(s, 6)).astype('float32')   # amendment 1: FFT round-off (~1e-17) made empty areas read as > 0


def raster_points(lat, lon, w):
    g = np.zeros((NR, NC), 'float64'); r = ((N0 - lat) / C1).astype(int); c = ((lon - W0) / C1).astype(int)
    ok = (r >= 0) & (r < NR) & (c >= 0) & (c < NC); np.add.at(g, (r[ok], c[ok]), w[ok]); return g


def read_csv_pts(f, wcol):
    import pandas as pd
    D = pd.read_csv(f, encoding='latin-1'); D.columns = [str(c).strip().lstrip('﻿').lstrip('ï»¿') for c in D.columns]
    if 'country' in D.columns: D = D[D.country.astype(str).str.strip() == 'Pakistan']
    lat = pd.to_numeric(D.lat, errors='coerce').values; lon = pd.to_numeric(D.lon, errors='coerce').values
    w = pd.to_numeric(D[wcol].astype(str).str.replace(',', ''), errors='coerce').values if wcol and wcol in D.columns else np.ones(len(D))
    ok = np.isfinite(lat) & np.isfinite(lon) & np.isfinite(w); return lat[ok], lon[ok], w[ok]


def temis(f):
    """TEMIS TOMS-format monthly NO2: 0.125 deg, lon -179.9375.., lat -89.9375.. ; returns (1440, 2880) float, NaN undef"""
    out = np.full((1440, 2880), np.nan, 'float32'); row = -1; buf = []
    with gzip.open(f, 'rt') as fh:
        for line in fh:
            if line.startswith('lat='):
                if row >= 0 and buf: out[row, :len(buf)] = buf[:2880]
                row += 1; buf = []; continue
            if row < 0: continue
            s = line.rstrip('\n')
            buf.extend(float(s[i:i + 4]) for i in range(0, len(s), 4) if s[i:i + 4].strip())
        if row >= 0 and buf: out[row, :len(buf)] = buf[:2880]
    out[out <= -999] = np.nan; return out


def main():
    ap = argparse.ArgumentParser()
    for k in ('tree', 'kilns', 'roads', 'no2', 'out'): ap.add_argument('--' + k, required=True)
    a = ap.parse_args(); sys.path.insert(0, os.path.join(a.tree, 'scripts')); import featgrid as fg
    D = os.path.join(a.tree, 'data'); G = {}
    for b in ('s_built10', 'p_pop', 's_wc_tree', 's_wc_crop', 's_wc_bare', 's_ndvi_djf', 's_ndvi_jja', 't_elev', 'w_dist', 'f_coast_km'):
        A = fg.read_band(D, b); G[b] = agg4(A); del A; print('band', b, flush=True)
    mask = np.isfinite(G['t_elev'])
    G['built1'] = G.pop('s_built10'); G['built_c'] = G['built1'] - boxmean(G['built1'], 20)
    G['lpop1'] = np.log1p(np.clip(G.pop('p_pop'), 0, None)); G['lpop_c'] = G['lpop1'] - boxmean(G['lpop1'], 20)
    G['tree1'] = G.pop('s_wc_tree'); G['crop1'] = G.pop('s_wc_crop'); G['bare1'] = G.pop('s_wc_bare')
    G['ndvi_smog'] = G.pop('s_ndvi_djf'); G['ndvi_rest'] = G.pop('s_ndvi_jja')
    G['elev1'] = G.pop('t_elev'); G['elev_c'] = G['elev1'] - boxmean(G['elev1'], 20); G['wdist'] = G.pop('w_dist'); G['coast'] = G.pop('f_coast_km')
    # emissions
    la, lo, w = read_csv_pts(os.path.join(a.kilns, 'Brick_Kilns_PK-Main_coal.csv'), 'pm25_t_yr'); K = raster_points(la, lo, w)
    G['kiln5'] = np.log1p(disk_sum(K, 5)); G['kiln15'] = np.log1p(disk_sum(K, 15)); info = dict(kilns=int(len(la)), kilnPm25TYr=float(w.sum()))
    I = np.zeros((NR, NC)); n_ind = {}
    for f, col in (('cement_plants_main.csv', 'pm25_t_yr'), ('coal_plants_main.csv', 'pm25_t_yr'), ('Furnace_plants_main.csv', 'pm25_t_yr'),
                   ('steel_plants_main.csv', 'pm25_t_yr'), ('paper_pulp_main.csv', 'pm25_t_yr')):
        la, lo, w = read_csv_pts(os.path.join(a.kilns, f), col); I += raster_points(la, lo, w); n_ind[f] = int(len(la))
    G['ind10'] = np.log1p(disk_sum(I, 10))
    la, lo, w = read_csv_pts(os.path.join(a.kilns, 'waste_main.csv'), None); n_ind['waste_main.csv'] = int(len(la))
    G['waste5'] = disk_sum(raster_points(la, lo, np.ones(len(la))), 5); info['pointSources'] = n_ind
    # roads: 250 m pieces -> km
    R = json.load(open(a.roads)); pts = np.array([[p[0], p[1]] for v in R.values() for p in v], float)
    RG = raster_points(pts[:, 0], pts[:, 1], np.full(len(pts), 0.25)); G['road1'] = disk_sum(RG, 1.0); G['road3'] = disk_sum(RG, 3.0); info['roadPieces'] = int(len(pts))
    # NO2 season means (TEMIS TROPOMI, 0.125 deg)
    files = sorted(glob.glob(os.path.join(a.no2, 'no2_*.asc.gz'))); acc = {'smog': [], 'rest': []}
    for f in files:
        ym = os.path.basename(f)[4:10]; m = int(ym[4:]); s = 'smog' if m in (10, 11, 12, 1, 2) else 'rest'
        acc[s].append(temis(f)[600:1060, 1840:2180])   # rows lat 15-72.5 N, cols lon 50-92.5 E (crop; indices offset below)
    info['no2Months'] = {k: len(v) for k, v in acc.items()}
    ri = ((LATC + 90) / 0.125).astype(int) - 600; ci = ((LONC + 180) / 0.125).astype(int) - 1840
    for s, L in acc.items():
        M = np.nanmean(np.stack(L), 0); L.clear()
        with np.errstate(invalid='ignore'): LM = np.log(np.clip(M, 1, None))
        sub = LM[ri.min() - 3:ri.max() + 4, ci.min() - 3:ci.max() + 4]; subc = boxmean(sub.astype('float32'), 2)
        r0, c0 = ri.min() - 3, ci.min() - 3
        G['no2_' + s] = sub[np.ix_(ri - r0, ci - c0)].astype('float32'); G['no2c_' + s] = (sub - subc)[np.ix_(ri - r0, ci - c0)].astype('float32')
    for k in G: G[k] = np.where(mask, G[k], np.nan).astype('float32')
    np.savez(a.out, mask=mask, **G); json.dump(info, open(a.out.replace('.npz', '.json'), 'w'), indent=1); print(json.dumps(info))


if __name__ == '__main__':
    main()
