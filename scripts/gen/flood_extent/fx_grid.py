#!/usr/bin/env python3
"""v283 WS9 · river flood extent, step A: the terrain grid the extent is drawn on.

On the 0.0025 deg (about 250 m) national feature grid (data/feat, grid g9):
  height above the river  cell ground height minus the river bed height at the nearest point of the major-river centre-line.
                          This is the 'height above nearest drainage' (HAND) idea with the drainage fixed to the mapped major rivers
                          (data/pk-rivers.json, OSM centre-lines ordered downstream) and the nearest drainage point found in plan
                          (a relative elevation model). Bed height per centre-line vertex = the lowest t_elev cell within one cell of
                          the vertex, then forced to fall downstream (isotonic regression on chainage), so a single low DSM cell or a
                          bridge cannot flatten or dam the profile.
                          WHEN data/feat/t_hand.json + its .p*.bin blocks are installed (the national 30 m HAND, p10 per cell, built by
                          station-lake/scripts/terrain30_hand2.py), FX_HAND=t_hand uses that band instead; the rest is unchanged.
  reach                   each cell takes the forecast reach whose point is nearest along the river of its nearest centre-line vertex
                          (only reaches with both a live river forecast and a 1991-onward model flow record at the gauge cell).
  distance                km from the centre-line (for the domain rule, which is decided from data in fx_calibrate.py).
  observed extents        2010, 2014, 2022, 2025 flood extent polygons (FloodExtent_WGS84/*.shp) rasterised on the same grid
                          (cell centre inside a polygon); each event's survey frame = the bounding box of its polygons.
Writes WORK/fx_grid.npz. Pure numpy / scipy / rasterio; about 2 min and under 2 GB.
"""
import os, sys, json, math, zlib
import numpy as np
from scipy.spatial import cKDTree
from sklearn.isotonic import IsotonicRegression

HERE = os.path.dirname(os.path.abspath(__file__))
APPD = os.environ.get('WS9_APP', os.path.join(HERE, '..', '..', '..', 'data'))
WORK = os.environ.get('WS9_WORK') or os.path.join(__import__('tempfile').gettempdir(), 'nigraan_flood_work')
EXT = os.environ.get('WS9_EXTENTS', '/mnt/user-data/uploads/FloodExtent_WGS84')
BAND = os.environ.get('FX_HAND', 't_elev')            # 't_hand' when the national 30 m HAND band is installed
CAP_KM = 60.0                                         # storage cap only; the served domain is chosen from data (fx_calibrate.py)

# forecast reach id -> column of the station file glofas_irsa_daily.csv.gz (legacy; v283.10 fx_calibrate reads the served series by reach id)
COL = {'kachura': 'Skardu', 'partab': 'Partab Bridge', 'besham': 'Besham', 'tarbela': 'Tarbela Dam', 'kalabagh': 'Kala Bagh',
       'chashma': 'Chashma', 'taunsa': 'Taunsa', 'guddu': 'Guddu', 'sukkur': 'Sukkur', 'kotri': 'Kotri', 'mangla': 'Mangla Dam',
       'rasul': 'New Rasul', 'marala': 'Marala', 'khanki': 'Khanki', 'qadirabad': 'Qadirabad', 'trimmu': 'Trimmu', 'balloki': 'Balloki',
       'sidhnai': 'Sidhnai', 'sulemanki': 'Sulemanki', 'islam': 'Islam', 'panjnad': 'Panjnad', 'nowshera': 'Nowshera'}


def read_band(name, r0, r1, c0, c1, fdir=None):
    fdir = fdir or os.path.join(APPD, 'feat')
    j = json.load(open(os.path.join(fdir, name + '.json')))
    g = j['grid'] if isinstance(j['grid'], dict) else json.loads(j['grid'].replace("'", '"'))
    B = int(g['block']); nod = int(j['nodata']); sc = float(j.get('scale', 1))
    out = np.full((r1 - r0, c1 - c0), np.nan, np.float32)
    fds = {}
    for k, (part, off, ln) in j['blocks'].items():
        br, bc = map(int, k.split(','))
        R0, C0 = br * B, bc * B
        if R0 >= r1 or R0 + B <= r0 or C0 >= c1 or C0 + B <= c0: continue
        f = fds.get(part) or open(os.path.join(fdir, '%s.p%d.bin' % (name, part)), 'rb'); fds[part] = f
        f.seek(off); a = np.frombuffer(zlib.decompress(f.read(ln)), np.int16).reshape(B, B).astype(np.float32)
        a[a == nod] = np.nan; a *= sc
        rr0, cc0 = max(R0, r0), max(C0, c0); rr1, cc1 = min(R0 + B, r1), min(C0 + B, c1)
        out[rr0 - r0:rr1 - r0, cc0 - c0:cc1 - c0] = a[rr0 - R0:rr1 - R0, cc0 - C0:cc1 - C0]
    for f in fds.values(): f.close()
    return out, g, j


def densify(coords, step_km=0.12):
    P = np.asarray(coords, float); out = [P[0]]
    for a, b in zip(P[:-1], P[1:]):
        dk = math.hypot((b[0] - a[0]) * 111.32 * math.cos(math.radians((a[1] + b[1]) / 2)), (b[1] - a[1]) * 110.57)
        n = max(1, int(math.ceil(dk / step_km)))
        for t in range(1, n + 1): out.append(a + (b - a) * t / n)
    P = np.array(out)
    seg = np.hypot(np.diff(P[:, 0]) * 111.32 * np.cos(np.radians(P[1:, 1])), np.diff(P[:, 1]) * 110.57)
    return P, np.concatenate([[0], np.cumsum(seg)])


def main():
    RV = json.load(open(os.path.join(APPD, 'pk-rivers.json')))
    rivers = [r for r in RV['rivers'] if any(p in COL for p in r['points'])]
    allc = np.concatenate([np.asarray(r['coords']) for r in rivers])
    lon0, lon1 = allc[:, 0].min() - 0.6, allc[:, 0].max() + 0.6
    lat0, lat1 = allc[:, 1].min() - 0.6, allc[:, 1].max() + 0.6
    j = json.load(open(os.path.join(APPD, 'feat', 't_elev.json'))); g = j['grid'] if isinstance(j['grid'], dict) else json.loads(j['grid'].replace("'", '"'))
    cell, W, N = g['cell'], g['west'], g['north']
    c0 = max(0, int((lon0 - W) / cell)); c1 = min(g['cols'], int((lon1 - W) / cell) + 1)
    r0 = max(0, int((N - lat1) / cell)); r1 = min(g['rows'], int((N - lat0) / cell) + 1)
    print('window rows', r0, r1, 'cols', c0, c1, (r1 - r0) * (c1 - c0) / 1e6, 'M cells')
    elev, _, _ = read_band('t_elev', r0, r1, c0, c1)
    hand_band = None
    if BAND != 't_elev':
        hand_band, _, hj = read_band(BAND, r0, r1, c0, c1, os.environ.get('FX_HAND_DIR'))   # FX_HAND_DIR: folder holding t_hand.json + parts (default data/feat)
        print('using installed HAND band', BAND, hj.get('built'))

    # ---- centre-line vertices, bed profile, reach per vertex ----
    VX, VZ, VR, VRIV = [], [], [], []
    reach_ids = sorted(COL); rix = {k: i for i, k in enumerate(reach_ids)}
    profiles = {}
    for r in rivers:
        P, ch = densify(r['coords'])
        rr = ((N - P[:, 1]) / cell).astype(int) - r0; cc = ((P[:, 0] - W) / cell).astype(int) - c0
        z = np.full(len(P), np.nan)
        for k in range(len(P)):
            a, b = rr[k], cc[k]
            if 1 <= a < elev.shape[0] - 1 and 1 <= b < elev.shape[1] - 1:
                w = elev[a - 1:a + 2, b - 1:b + 2]
                if np.isfinite(w).any(): z[k] = np.nanmin(w)
        ok = np.isfinite(z)
        if ok.sum() < 10: continue
        iso = IsotonicRegression(increasing=False, out_of_bounds='clip').fit(ch[ok], z[ok])
        zb = iso.predict(ch)
        # forecast points of this river with a flow record: chainage of their nearest vertex
        pts = [p for p in r['pointsByElevation'] if p['id'] in COL]
        if not pts: continue
        kd = cKDTree(np.c_[P[:, 0] * math.cos(math.radians(30)), P[:, 1]])
        pch = {p['id']: ch[kd.query([p['lon'] * math.cos(math.radians(30)), p['lat']])[1]] for p in pts}
        ids = list(pch); pc = np.array([pch[i] for i in ids])
        near = np.abs(ch[:, None] - pc[None, :]).argmin(1)
        VX.append(P); VZ.append(zb); VR.append(np.array([rix[ids[i]] for i in near])); VRIV += [r['name']] * len(P)
        profiles[r['name']] = dict(points={i: round(float(pch[i]), 1) for i in ids}, lengthKm=round(float(ch[-1]), 1),
                                   bedFallM=round(float(zb[0] - zb[-1]), 1), bedRawValid=int(ok.sum()), vertices=len(P))
        print(r['name'], len(P), 'vertices, points', pch)
    VX = np.concatenate(VX); VZ = np.concatenate(VZ); VR = np.concatenate(VR)
    # ---- nearest vertex for every cell (metric coordinates) ----
    kx = 111.32 * math.cos(math.radians((lat0 + lat1) / 2))
    tree = cKDTree(np.c_[VX[:, 0] * kx, VX[:, 1] * 110.57])
    H, Wd = elev.shape
    rem = np.full((H, Wd), np.nan, np.float32); reach = np.full((H, Wd), 255, np.uint8); dist = np.full((H, Wd), np.nan, np.float32)
    lons = W + (np.arange(c0, c1) + 0.5) * cell
    for a in range(0, H, 200):
        lats = N - (np.arange(r0 + a, r0 + min(H, a + 200)) + 0.5) * cell
        LO, LA = np.meshgrid(lons, lats)
        d, i = tree.query(np.c_[LO.ravel() * kx, LA.ravel() * 110.57], distance_upper_bound=CAP_KM, workers=2)
        ok = np.isfinite(d); i[~ok] = 0
        blk = slice(a, a + LA.shape[0])
        dd = np.where(ok, d, np.nan).reshape(LA.shape).astype(np.float32)
        e = elev[blk]
        if hand_band is not None: h = hand_band[blk]
        else: h = (e - VZ[i].reshape(LA.shape)).astype(np.float32)
        h = np.where(np.isfinite(dd) & np.isfinite(e), h, np.nan)
        rem[blk] = h; dist[blk] = dd; reach[blk] = np.where(np.isfinite(dd), VR[i].reshape(LA.shape), 255)
    print('domain cells (<= %d km):' % CAP_KM, int(np.isfinite(rem).sum()))

    os.makedirs(WORK, exist_ok=True)
    meta = dict(r0=r0, r1=r1, c0=c0, c1=c1, cell=cell, west=W, north=N, band=BAND, reaches=reach_ids, profiles=profiles, capKm=CAP_KM, col=COL)
    np.savez(os.path.join(WORK, 'fx_terrain.npz'), rem=rem, reach=reach, dist=dist, meta=json.dumps(meta))
    del elev, dist, rem
    # ---- observed extents on the grid (one event at a time, polygon parts streamed: low memory) ----
    import gc, geopandas as gpd
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    T = from_origin(W + c0 * cell, N - r0 * cell, cell, cell)
    frames = {}
    for y in [2010, 2014, 2022, 2025]:
        gdf = gpd.read_file(os.path.join(EXT, 'Flood_%d.shp' % y), engine='pyogrio')
        gdf = gdf[gdf.geometry.notna()].explode(index_parts=False)
        frames[y] = [float(v) for v in gdf.total_bounds]
        m = rasterize(((geom, 1) for geom in gdf.geometry), out_shape=(H, Wd), transform=T, fill=0, dtype='uint8')
        np.save(os.path.join(WORK, 'fx_obs_%d.npy' % y), m.astype(bool))
        print(y, 'flooded cells in window', int(m.sum()), 'frame', frames[y], flush=True)
        del gdf, m; gc.collect()
    meta['frames'] = frames
    json.dump(meta, open(os.path.join(WORK, 'fx_meta.json'), 'w'))
    print('saved')


if __name__ == '__main__':
    main()
