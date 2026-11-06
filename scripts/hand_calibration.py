#!/usr/bin/env python3
"""v91.17.253 · W3 · W3-6 · HAND classes calibrated against observed flood extents.

What it answers: of the ground at a given height above the nearest river (HAND, the served grid data/feat/t_hand: the
10th percentile of the 30 m GLO-30 HAND in each 9 arc-second cell) and above the nearest drain or stream (t_hand_local),
what share was under water in each mapped flood.

  events    NDMA flood inundation layers 2010, 2014, 2022 and the 2025 extent (client shapefiles Flood_<year>.shp), each over
            every Pakistan-administered tehsil (data/pk-tehsils.json); UNOSAT FL20220808PAK Sentinel-1 / Landsat-8 / Sentinel-2
            2022 flood water inside its own analysis extents is kept out of the fit as an independent check
  labels    a cell is flooded when its centre lies in the event polygon; river channels and standing water bodies (the
            Rivers and Water Bodies Inventory polygons, as scripts/floodstudy/permanent_water_labels.py) are removed from
            the domain, so normal water is not counted as flooding; cells are weighted by area (cos latitude)
  curve     area and flooded area per 0.1 m of HAND (the grid's own step), per event
  classes   K classes of HAND chosen by an optimal partition (Fisher 1958, dynamic programming) minimising the binary
            entropy of flooded / dry within classes, summed over the four events with each event's domain given equal
            weight (breaks shared, each event its own flooded share: events differ in size, the order of the ground does
            not). K is the largest number of classes, up to the number of levels of data/hazard-scale.json, whose order
            holds out of sample: with each event left out of the fit in turn, the held-out event's flooded share falls
            strictly from each class to the next, and so does UNOSAT 2022's (never fitted)
  separation area under the ROC curve of -HAND for flooded vs dry per event (how well height alone separates them)

Output: data/hand-calibration.json. Usage: python3 scripts/hand_calibration.py [--app .] [--extents DIR] [--water DIR] [--unosat DIR]
"""
import sys, os, json, glob, datetime as dt, warnings
import numpy as np

warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from featgrid import GRID, read_band, grid_coords  # noqa: E402

A = sys.argv[1:]
opt = lambda n, d: A[A.index(n) + 1] if n in A else d
APP = os.path.abspath(opt('--app', os.path.join(HERE, '..')))
EXT = opt('--extents', '/mnt/user-data/uploads/Data_9_23/Flood_Extents')
WAT = opt('--water', '/mnt/user-data/uploads/AI_GEO_NIGRAAN_local_and_react_v91_17/deploy/DROP_DATA_HERE/Data_9_23/waterbodies')
UNO = opt('--unosat', os.path.join(APP, '..', 'geo', 'floodext', 'oct19', 'FL20220808PAK_SHP'))
FIT_EVENTS = ['2010', '2014', '2022', '2025']
STEP = 0.1                      # the grid's own HAND step (t_hand.json scale)
NB = 5001                       # 0 ... 500 m in 0.1 m steps, the last bin holding everything higher


def raster(geoms):
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    tr = from_origin(GRID['west'], GRID['north'], GRID['cell'], GRID['cell'])
    return rasterize(((g, 1) for g in geoms if g is not None and not g.is_empty), out_shape=(GRID['rows'], GRID['cols']), transform=tr, fill=0, dtype='uint8').astype(bool)


def raster_files(files, fix=True, chunk=5000):
    """union mask of the polygons of the files, read in chunks of features (the UNOSAT packs hold ~400 MB of polygons; read whole they
    went over this machine's memory); fix: repair rings (buffer 0), skipped for the UNOSAT packs, which rasterise as they are"""
    import pyogrio
    M = None
    for f in files:
        n = pyogrio.read_info(f)['features']
        for k in range(0, n, chunk):
            g = pyogrio.read_dataframe(f, skip_features=k, max_features=chunk, columns=[]); g = g[g.geometry.notna()]
            if g.crs and g.crs.to_epsg() != 4326: g = g.to_crs(4326)
            m = raster(g.geometry.buffer(0) if fix else g.geometry); M = m if M is None else (M | m); del g, m
    return M


def hist(H, M, D, W):
    """area and flooded area per 0.1 m HAND bin inside domain D"""
    idx = np.clip(np.rint(H[D] / STEP), 0, NB - 1).astype(np.int32); w = W[D]
    return np.bincount(idx, w, NB), np.bincount(idx, w * M[D], NB)


def auc(n, f):
    """AUC of -HAND for flooded vs dry from the binned areas (ties count half)"""
    d = n - f; F, Dt = f.sum(), d.sum()
    if F <= 0 or Dt <= 0: return None
    cd = np.concatenate([[0], np.cumsum(d)])   # dry area strictly below bin i: cd[i]
    # P(HAND_flooded < HAND_dry) + 0.5 P(equal)
    above = Dt - cd[1:]   # dry strictly above bin i
    return float(((f * above).sum() + 0.5 * (f * d).sum()) / (F * Dt))


def partition(N, Fl, cand, K):
    """optimal K-class partition of the HAND bins at candidate edges (indices into bins), minimising summed within-class
    binary entropy over events; N, Fl: (events, bins) areas normalised to each event's domain"""
    cN = np.concatenate([np.zeros((N.shape[0], 1)), np.cumsum(N, 1)], 1); cF = np.concatenate([np.zeros((N.shape[0], 1)), np.cumsum(Fl, 1)], 1)
    E = np.concatenate([[0], cand, [N.shape[1]]]); m = len(E)

    def cost(i, j):
        n = cN[:, E[j]] - cN[:, E[i]]; f = cF[:, E[j]] - cF[:, E[i]]
        with np.errstate(divide='ignore', invalid='ignore'):
            p = np.where(n > 0, f / n, 0); h = -(np.where(p > 0, p * np.log(p), 0) + np.where(p < 1, (1 - p) * np.log(1 - p), 0))
        return float((n * h).sum())
    C = np.full((m, m), np.inf)
    for i in range(m):
        for j in range(i + 1, m): C[i, j] = cost(i, j)
    best = np.full((K + 1, m), np.inf); arg = np.zeros((K + 1, m), int); best[0, 0] = 0
    for k in range(1, K + 1):
        for j in range(1, m):
            v = best[k - 1, :j] + C[:j, j]; i = int(np.argmin(v)); best[k, j] = v[i]; arg[k, j] = i
    cuts, j = [], m - 1
    for k in range(K, 0, -1):
        i = arg[k, j]
        if k > 1: cuts.append(int(E[i]))
        j = i
    return sorted(cuts), float(best[K, m - 1])


def shares(n, f, cuts):
    e = [0] + list(cuts) + [len(n)]
    return [(float(n[a:b].sum()), float(f[a:b].sum() / n[a:b].sum()) if n[a:b].sum() > 0 else None) for a, b in zip(e[:-1], e[1:])]


def strictly_falling(s):
    v = [x for _, x in s]
    return all(a is not None and b is not None and a > b for a, b in zip(v[:-1], v[1:]))


def main():
    import rasterio  # noqa: F401  (fails early when the GIS stack is missing)
    from shapely.geometry import shape
    levels = json.load(open(os.path.join(APP, 'data', 'hazard-scale.json')))['levels']
    lon, lat = grid_coords(); W = np.repeat(np.cos(np.radians(lat))[:, None].astype('float32'), GRID['cols'], 1) * (GRID['cell'] * 111.32) ** 2   # km2
    fc = json.load(open(os.path.join(APP, 'data', 'pk-tehsils.json')))
    PK = raster(shape(f['geometry']).buffer(0) for f in fc['features'] if f.get('geometry')); print('tehsil cells', int(PK.sum()), flush=True)
    wf = [os.path.join(WAT, n) for n in ('03_drainage__Rivers.geojson', '08_inventory__Water_Bodies_Inventory.geojson')]
    PW = raster_files(wf); print('permanent-water cells', int((PW & PK).sum()), flush=True)
    masks = {}
    for y in FIT_EVENTS:
        f = os.path.join(EXT, 'Flood_%s.shp' % y)
        if os.path.exists(f): masks['ndma' + y] = (raster_files([f]), None); print('rasterised', f, flush=True)
    hi = sorted(sum((glob.glob(os.path.join(UNO, p + '.shp')) for p in ('S1_2022*_FloodExtent_*', 'LS8_2022*_FloodExtent_*', 'S2_2022*_FloodExtent_*')), []))
    he = sorted(sum((glob.glob(os.path.join(UNO, p + '.shp')) for p in ('S1_2022*_AnalysisExtent_*', 'LS8_2022*_AnalysisExtent_*', 'S2_2022*_AnalysisExtent_*')), []))
    if hi and he: masks['unosat2022'] = (raster_files(hi, False), raster_files(he, False)); print('rasterised UNOSAT 2022', len(hi), 'extents', flush=True)
    fit = ['ndma' + y for y in FIT_EVENTS if 'ndma' + y in masks]
    if len(fit) < 3: raise SystemExit('need at least three of the NDMA extents, found ' + ', '.join(fit))
    out = {'built': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'version': 'v91.17.253', 'script': 'scripts/hand_calibration.py', 'bands': {}}
    for band in ('t_hand', 't_hand_local'):
        H = read_band(os.path.join(APP, 'data'), band); valid = np.isfinite(H) & PK & ~PW
        Hs, cells = {}, {}
        for k, (M, E) in masks.items(): D = valid & (E if E is not None else True); Hs[k] = hist(H, M, D, W); cells[k] = int(D.sum())
        del H
        N = np.array([Hs[k][0] / Hs[k][0].sum() for k in fit]); Fl = np.array([Hs[k][1] / Hs[k][0].sum() for k in fit])
        # candidate edges: every 0.1 m to 20 m, every 1 m to 100 m, every 10 m to 500 m (ample resolution for the class breaks)
        cand = np.unique(np.concatenate([np.arange(1, 201), np.arange(210, 1001, 10), np.arange(1100, NB - 1, 100)]))
        trials = []; K = 1
        for k in range(2, len(levels) + 1):
            held = {}
            for e, name in enumerate(fit):
                keep = [i for i in range(len(fit)) if i != e]; c, _ = partition(N[keep], Fl[keep], cand, k)
                held[name] = strictly_falling(shares(*Hs[name], c))
            c_all, _ = partition(N, Fl, cand, k)
            if 'unosat2022' in Hs: held['unosat2022'] = strictly_falling(shares(*Hs['unosat2022'], c_all))
            ok = all(held.values()); trials.append({'classes': k, 'breaksM': [round(x * STEP, 1) for x in c_all], 'orderHoldsHeldOut': held, 'accepted': ok})
            print(band, k, trials[-1]['breaksM'], held, flush=True)
            if ok: K = k
            else: break
        cuts, _ = partition(N, Fl, cand, K) if K > 1 else ([], 0)
        edges = [0.0] + [round(c * STEP, 1) for c in cuts] + [None]
        cls = []
        for i in range(len(edges) - 1):
            row = {'fromM': edges[i], 'toM': edges[i + 1], 'floodedShare': {}, 'areaKm2': {}}
            for k in Hs:
                s = shares(*Hs[k], cuts)[i]; row['floodedShare'][k] = None if s[1] is None else round(s[1], 4); row['areaKm2'][k] = round(s[0])
            cls.append(row)
        ev = {k: {'cells': cells[k], 'domainKm2': round(float(Hs[k][0].sum())), 'floodedKm2': round(float(Hs[k][1].sum())), 'floodedShare': round(float(Hs[k][1].sum() / Hs[k][0].sum()), 4),
                  'aucMinusHand': None if auc(*Hs[k]) is None else round(auc(*Hs[k]), 3), 'fitted': k in fit} for k in Hs}
        # the curve at 1 m resolution to 30 m (for audit and plots)
        curve = []
        for a in range(0, 30):
            b = (a + 1) * 10; curve.append({'fromM': a, 'toM': a + 1, **{k: (round(float(Hs[k][1][a * 10:b].sum() / Hs[k][0][a * 10:b].sum()), 4) if Hs[k][0][a * 10:b].sum() > 0 else None) for k in Hs}})
        out['bands'][band] = {'classes': cls, 'events': ev, 'selection': trials, 'curve1m': curve}
    out['events'] = {'ndma2010': 'NDMA flood inundation 2010 (Flood_2010.shp, NDMA GIS Datasets)', 'ndma2014': 'NDMA flood extent 2014 (Flood_2014.shp)',
                     'ndma2022': 'NDMA flood layers 2022 (Flood_2022.shp)', 'ndma2025': 'flood extent 2025 (Flood_2025.shp, client vector)',
                     'unosat2022': 'UNOSAT FL20220808PAK (19 Oct 2022): Sentinel-1, Landsat-8, Sentinel-2 flood water inside their analysis extents; not fitted, the independent check'}
    out['method'] = ('Cells of the national 9 arc-second grid inside Pakistan-administered tehsils, river channels and water bodies removed (Rivers and Water Bodies '
                     'Inventory polygons), area-weighted. Flooded share = flooded area / area per HAND class per event. Breaks: optimal partition (Fisher 1958) '
                     'minimising within-class binary entropy summed over the four NDMA events, each event equal weight; the number of classes is the largest, up '
                     'to the %d levels of data/hazard-scale.json, whose order (flooded share strictly falling with height) holds in every event left out of the '
                     'fit and in UNOSAT 2022, never fitted.' % len(levels))
    out['levels'] = {'mapped': False, 'why': ('The shares are the part of such ground under water in a mapped major flood (2010, 2014, 2022, 2025), conditional on that flood '
                     'happening: not a chance per year or per season, and no tested rule places them on Normal / Low / Moderate / High / Severe. They are shown as a '
                     'standing fact.')}
    f = os.path.join(APP, 'data', 'hand-calibration.json'); json.dump(out, open(f + '.tmp', 'w'), indent=1); os.replace(f + '.tmp', f); print('wrote', f)


if __name__ == '__main__':
    main()
