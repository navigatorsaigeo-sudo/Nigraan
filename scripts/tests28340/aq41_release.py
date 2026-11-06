#!/usr/bin/env python3
"""aq41 step 3 - the shipped PM2.5 downscaling files (rules: data/evidence/aq41/AQ41_RULES_20261031.json, release section).
Writes into <tree>/data:
  aqds/feat/pm25ds_smog.json + .p0.bin, aqds/feat/pm25ds_rest.json + .p0.bin   1 km ln(factor), int16 x 0.001, featgrid format
                                                                               (own 0.01 deg grid), nodata outside passing regions
  aqds/pm25-ds-units.json                                                      tehsil factor = population-weighted mean of its 1 km factors
  pm25-downscale.json                                                          version, regions, evidence summary, apply rule
usage: python -I aq41_release.py --tree <tree> --grid <grid.npz> --factor <factor.npz> --result <aq41_result.json>"""
import os, sys, json, zlib, argparse, datetime as dt, numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aq40_build import region_of

W0, N0, C1, NC, NR, B = 60.75, 37.25, 0.01, 1725, 1375, 100
VERSION = 'pm25ds-1 (aq41, 1.0.5)'


def write_band(out, name, arr, meta):
    os.makedirs(out, exist_ok=True); q = np.where(np.isfinite(arr), np.clip(np.round(arr / 0.001), -32767, 32767), -32768).astype('<i2')
    blocks = {}; pos = 0; fh = open(os.path.join(out, name + '.p0.bin'), 'wb')
    for r in range(0, NR, B):
        for c in range(0, NC, B):
            blk = q[r:r + B, c:c + B]
            if (blk == -32768).all(): continue
            full = np.full((B, B), -32768, '<i2'); full[:blk.shape[0], :blk.shape[1]] = blk; z = zlib.compress(full.tobytes(), 9)
            fh.write(z); blocks['%d,%d' % (r // B, c // B)] = [0, pos, len(z)]; pos += len(z)
    fh.close(); fin = arr[np.isfinite(arr)]
    J = dict(band=name, grid=dict(id='km1', crs='EPSG:4326', cell=C1, west=W0, north=N0, cols=NC, rows=NR, block=B), dtype='int16', nodata=-32768, scale=0.001, offset=0,
             units='ln(factor) on the served daily PM2.5', built=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), parts=1, blocks=blocks, nBlocks=len(blocks),
             stats=dict(n=int(fin.size), min=float(fin.min()), max=float(fin.max()), mean=float(fin.mean())), **meta)
    json.dump(J, open(os.path.join(out, name + '.json'), 'w')); return pos


def main():
    ap = argparse.ArgumentParser()
    for k in ('tree', 'grid', 'factor', 'result'): ap.add_argument('--' + k, required=True)
    a = ap.parse_args()
    from shapely.geometry import shape
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    R = json.load(open(a.result)); PASS = R['passRegions']
    J = json.load(open(os.path.join(a.tree, 'data', 'pk-tehsils.json'))); tr = from_origin(W0, N0, C1, C1)
    T = [(f['properties'], shape(f['geometry'])) for f in J['features']]
    reg = [region_of(p['province'], p['district'], p.get('division')) for p, _ in T]
    uidx = rasterize([(g, i + 1) for i, (_, g) in enumerate(T)], out_shape=(NR, NC), transform=tr, fill=0, dtype='int32', all_touched=False)
    G = np.load(a.grid); F = np.load(a.factor); pop = np.expm1(np.nan_to_num(G['lpop1'], nan=0.0)).clip(0)
    inpass = np.zeros((NR, NC), bool)
    for i, rg in enumerate(reg):
        if rg in PASS: inpass |= uidx == i + 1
    out = os.path.join(a.tree, 'data', 'aqds', 'feat'); meta = dict(method='aq41 LightGBM on station-season ln(truth/served) from 1 km predictors (GHSL built, population, WorldCover, NDVI, Copernicus height, water distance, brick-kiln and point-source PM2.5 inventories, OSM major roads, TROPOMI NO2 season means); clipped to the 2.5-97.5 % station range', version=VERSION, regions=PASS)
    sizes = {}; units = {}
    for s in ('smog', 'rest'):
        f = np.where(inpass & np.isfinite(F[s]), F[s], np.nan); sizes[s] = write_band(out, 'pm25ds_' + s, np.log(f), meta)
    for i, ((p, _), rg) in enumerate(zip(T, reg)):
        if rg not in PASS: continue
        m = (uidx == i + 1) & inpass
        if not m.any(): continue
        o = {}
        for s in ('smog', 'rest'):
            f = F[s][m]; w = pop[m]; ok = np.isfinite(f)
            if not ok.any(): continue
            o[s] = round(float(np.average(f[ok], weights=w[ok] if w[ok].sum() > 0 else None)), 4)
        rr, cc = np.where(m); o['region'] = rg; o['nCells'] = int(m.sum()); o['cells'] = [[int(x), int(y)] for x, y in zip(rr, cc)]; units[p['uid']] = o
    json.dump(dict(version=VERSION, grid=dict(cell=C1, west=W0, north=N0), rule='cells = [row, col] of the 1 km grid (lat = north - (row + 0.5) cell, lon = west + (col + 0.5) cell); tehsil factor = population-weighted (GHSL p_pop) mean of the 1 km factors inside the tehsil; the tehsil-day PM2.5 = served x factor of the season (Oct-Feb smog, Mar-Sep rest)', units=units),
              open(os.path.join(a.tree, 'data', 'aqds', 'pm25-ds-units.json'), 'w'), separators=(',', ':'))
    ev = {k: dict(LSO={x: R['regions'][k]['LSO'].get(x) for x in ('stations', 'unhealthyObs', 'maeServed', 'maeLayer', 'dMaeLo', 'dPssHi')},
                  LCO={x: R['regions'][k]['LCO'].get(x) for x in ('maeLayer', 'dMaeLo', 'dPssHi')}) for k in PASS}
    M = dict(version=VERSION, built=dt.datetime.now(dt.timezone(dt.timedelta(hours=5))).strftime('%Y-%m-%d %H:%M PKT'),
             method='static 1 km multiplicative factor on the served daily PM2.5 (served = per-city correction / national model / CAMS, unchanged day to day); per season (smog Oct-Feb, rest Mar-Sep)',
             regions=PASS, clip=R['final']['clip'], seasons={'smog': [10, 11, 12, 1, 2], 'rest': [3, 4, 5, 6, 7, 8, 9]},
             apply=dict(where='tehsils of the passing regions (aq40 region rule); elsewhere factor 1 (served value unchanged)', place='tehsil: population-weighted mean factor (aqds/pm25-ds-units.json); 1 km map: the tehsil base value x the cell factor',
                        files=['aqds/feat/pm25ds_smog.json', 'aqds/feat/pm25ds_rest.json', 'aqds/pm25-ds-units.json']),
             evidence=dict(rules='data/evidence/aq41/AQ41_RULES_20261031.json', result='data/evidence/aq41/aq41_result.json', heldOut=ev))
    json.dump(M, open(os.path.join(a.tree, 'data', 'pm25-downscale.json'), 'w'), indent=1)
    print('regions', PASS, 'tehsils', len(units), 'band bytes', sizes, 'cells in release', int(inpass.sum()))


if __name__ == '__main__':
    main()
