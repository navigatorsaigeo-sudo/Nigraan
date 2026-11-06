#!/usr/bin/env python3
"""DRYSPONGE · S1/S2: does the served curve-number runoff add skill beyond rain alone on dated non-riverine flood truth?
Rules: /tmp/claude-0/drysponge/RULES.md (written before this ran).
usage: python3 -I sponge_test.py <srv data dir> <sponge-tehsil.v2.json> <extents dir> <unosat 2024 shp> <imerg dir> <out.json>"""
import sys, os, json, glob, numpy as np
import geopandas as gpd, xarray as xr
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy.spatial import cKDTree
from scipy.stats import spearmanr, rankdata
DATA, SPONGE, EXT, U24, IMD, OUT = sys.argv[1:7]
rng = np.random.default_rng(31); B = 2000; DOM = 29.0; MINCELLS = 25
CELL = 0.01; W0, N0 = 60.5, 37.5; NC, NR = int((77.5 - W0) / CELL), int((N0 - 23.5) / CELL)
T = from_origin(W0, N0, CELL, CELL)
lat = N0 - (np.arange(NR) + 0.5) * CELL; lon = W0 + (np.arange(NC) + 0.5) * CELL

TH = json.load(open(os.path.join(DATA, 'pk-tehsils.json')))['features']
UIDS = [f['properties']['uid'] for f in TH]
tid = rasterize(((f['geometry'], i + 1) for i, f in enumerate(TH)), out_shape=(NR, NC), transform=T, fill=0, dtype='uint16')

# distance (km) to the major-river centre-lines (data/pk-rivers.json coords), as the fx-model domain rule (29 km)
pts = np.array([c for r in json.load(open(os.path.join(DATA, 'pk-rivers.json')))['rivers'] for c in r['coords']], float)
def to_km(lo, la): return np.c_[lo * 111.32 * np.cos(np.radians(30.0)), la * 110.57]
tree = cKDTree(to_km(pts[:, 0], pts[:, 1]))
LO, LA = np.meshgrid(lon, lat); land = tid > 0
dist = np.full((NR, NC), np.nan, np.float32)
dist[land] = tree.query(to_km(LO[land], LA[land]))[0]
nonriv = land & (dist > DOM)

def extent(path):
    g = gpd.read_file(path).to_crs(4326); g = g[g.geometry.notna() & ~g.geometry.is_empty]
    m = rasterize(((geom, 1) for geom in g.geometry), out_shape=(NR, NC), transform=T, fill=0, dtype='uint8')
    return m.astype(bool), list(g.total_bounds)

# ---- served CN runoff (sponge-tehsil.v2 bins, AMC II, lambda 0.20, slope factor on S; built cells run off the whole depth)
SP = json.load(open(SPONGE)); COV = SP['covers']; CN2 = SP['cn2']; FS = SP['fSlope']
SPU = {u['uid']: u for u in SP['units'].values()}
def q_scs(P, cn, F): s = (25400.0 / cn - 254.0) * F; ia = 0.2 * s; return 0.0 if P <= ia else (P - ia) ** 2 / (P + 0.8 * s)
def Q(uid, P):
    u = SPU.get(uid)
    if not u or P is None or not np.isfinite(P): return None
    return sum(w * (P if COV[ci] == 'built' else q_scs(P, CN2[COV[ci]][h], FS[fi])) for ci, h, fi, w in u['bins'])
def retention100(uid):
    q = Q(uid, 100.0); return None if q is None else 100.0 - q

# ---- rain
Z = np.load(os.path.join(DATA, 'chirps-tehsil.npz'), allow_pickle=True)
CU = {str(u): i for i, u in enumerate(Z['uids'])}; CK = [str(k) for k in Z['keys']]; CP = Z['P']
def chirps_max_pentad(uid, d0, d1):
    """pentads whose key year.month.p (p=1..6) falls inside [d0, d1] (yyyy-mm-dd); pentad p of a month starts on day 5(p-1)+1"""
    i = CU.get(uid)
    if i is None: return None
    js = [j for j, k in enumerate(CK) if d0 <= '%s-%s-%02d' % (k[:4], k[5:7], 5 * (int(k[8]) - 1) + 1) <= d1]
    return float(np.max(CP[i, js])) if js else None
def imerg_tehsil_daymax(months, d0, d1):
    days = []; glat = glon = None
    for m in months:
        ds = xr.open_dataset(os.path.join(IMD, 'IMERG_subhourly_PAK_%s.nc' % m))
        pr = ds['precipitation_mm'].assign_coords(time=ds['time'] + np.timedelta64(5, 'h'))
        d = pr.resample(time='1D').sum(skipna=True, min_count=1).sel(time=slice(d0, d1))
        days.append(d.values.astype(np.float32)); glat, glon = ds['lat'].values, ds['lon'].values
    D = np.concatenate(days, 0)                                     # (days, lat, lon)
    # tehsil of each 0.1 deg cell centre via the 0.01 tehsil raster
    ri = np.clip(((N0 - glat) / CELL).astype(int), 0, NR - 1); ci = np.clip(((glon - W0) / CELL).astype(int), 0, NC - 1)
    T10 = tid[ri][:, ci]
    out = {}
    for k, f in enumerate(TH):
        m = T10 == k + 1
        if not m.any():
            c = f['geometry']; import shapely.geometry as sg; p = sg.shape(c).representative_point()
            a = int(np.abs(glat - p.y).argmin()); b = int(np.abs(glon - p.x).argmin()); series = D[:, a, b]
        else: series = np.nanmean(D[:, m], axis=1)
        out[UIDS[k]] = float(np.nanmax(series)) if np.isfinite(series).any() else None
    return out

def auc(x, y):
    r = rankdata(x); n1 = y.sum(); n0 = len(y) - n1; return float((r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))
ci = lambda v: [round(float(np.percentile(v, 2.5)), 3), round(float(np.percentile(v, 97.5)), 3)]
def partial_rho(x, y, z):
    rx, ry, rz = rankdata(x), rankdata(y), rankdata(z)
    def res(a, b): A = np.c_[np.ones_like(b), b]; return a - A @ np.linalg.lstsq(A, a, rcond=None)[0]
    return float(np.corrcoef(res(rx, rz), res(ry, rz))[0, 1])

def run(year, ext_path, d0, d1, rain):
    fl, bb = extent(ext_path)
    inframe = ((lat >= bb[1]) & (lat <= bb[3]))[:, None] & ((lon >= bb[0]) & (lon <= bb[2]))[None, :]
    sel = nonriv & inframe
    n_all = np.bincount(tid[sel], minlength=len(TH) + 1); n_fl = np.bincount(tid[sel], weights=fl[sel], minlength=len(TH) + 1)
    frame_share = float(n_fl.sum() / n_all.sum())
    res = dict(year=year, extent=os.path.basename(ext_path), window=[d0, d1], frame=[round(x, 3) for x in bb], frameShare=round(frame_share, 5), sources={})
    for src, Pd in rain.items():
        rows = []
        for k, uid in enumerate(UIDS):
            if n_all[k + 1] < MINCELLS: continue
            P = Pd.get(uid); q = Q(uid, P) if P is not None else None
            if q is None: continue
            rows.append((uid, float(n_fl[k + 1] / n_all[k + 1]), P, q, retention100(uid)))
        s = np.array([r[1] for r in rows]); y = s > frame_share; Pv = np.array([r[2] for r in rows]); Qv = np.array([r[3] for r in rows]); Rv = np.array([r[4] for r in rows])
        da, dr, aq, ap = [], [], [], []; pr = []
        for _ in range(B):
            i = rng.integers(0, len(rows), len(rows))
            if y[i].all() or not y[i].any(): continue
            a1, a0 = auc(Qv[i], y[i]), auc(Pv[i], y[i]); aq.append(a1); ap.append(a0); da.append(a1 - a0)
            dr.append(spearmanr(Qv[i], s[i]).statistic - spearmanr(Pv[i], s[i]).statistic)
            pr.append(partial_rho(-Rv[i], s[i], Pv[i]))
        r = dict(tehsils=len(rows), events=int(y.sum()), auc_P=round(auc(Pv, y), 3), auc_P_ci=ci(ap), auc_Q=round(auc(Qv, y), 3), auc_Q_ci=ci(aq),
                 auc_diff_ci=ci(da), rho_P=round(float(spearmanr(Pv, s).statistic), 3), rho_Q=round(float(spearmanr(Qv, s).statistic), 3), rho_diff_ci=ci(dr),
                 S2_partialRho_lowRetention_vs_share_given_P=round(partial_rho(-Rv, s, Pv), 3), S2_ci=ci(pr))
        r['cnAddsSkill'] = bool(r['auc_diff_ci'][0] > 0); r['cnWorse'] = bool(r['auc_diff_ci'][1] < 0)
        res['sources'][src] = r
    return res

U2Ch = lambda d0, d1: {u: chirps_max_pentad(u, d0, d1) for u in UIDS}
R = {}
R['2022'] = run('2022', os.path.join(EXT, 'Flood_2022.shp'), '2022-06-15', '2022-09-15', {'CHIRPS_maxPentad': U2Ch('2022-06-15', '2022-09-15')})
R['2024'] = run('2024', U24, '2024-07-15', '2024-09-10', {'IMERG_maxDay': imerg_tehsil_daymax(['202407', '202408', '202409'], '2024-07-15', '2024-09-10'),
                                                           'CHIRPS_maxPentad': U2Ch('2024-07-15', '2024-09-10')})
R['2025'] = run('2025', os.path.join(EXT, 'Flood_2025.shp'), '2025-06-15', '2025-09-30', {'IMERG_maxDay': imerg_tehsil_daymax(['202506', '202507', '202508', '202509'], '2025-06-15', '2025-09-30'),
                                                           'CHIRPS_maxPentad': U2Ch('2025-06-15', '2025-09-30')})
prim = {'2022': 'CHIRPS_maxPentad', '2024': 'IMERG_maxDay', '2025': 'IMERG_maxDay'}
adds = sum(R[y]['sources'][prim[y]]['cnAddsSkill'] for y in R); worse = any(R[y]['sources'][prim[y]]['cnWorse'] for y in R)
R['decision'] = dict(primarySourcePerYear=prim, yearsWhereCnAddsSkill=int(adds), anyYearWorse=bool(worse), supported=bool(adds >= 2 and not worse),
                     rule='SUPPORTED iff the paired AUC(Q)-AUC(P) CI > 0 in >= 2 of 3 years and < 0 in none (RULES.md S1)')
R['grid'] = dict(cell_deg=CELL, domainKm=DOM, minNonRiverineCells=MINCELLS, rivers='data/pk-rivers.json coords (11 major rivers)')
json.dump(R, open(OUT, 'w'), indent=1); print(json.dumps(R, indent=1))
