"""R2 (RULES.md, sci2) · river flood extent: C3 (JRC depth at the reach-event return period >= d AND 30 m HAND <= h) against B2 (JRC 1-in-10)
on dated truth: UNOSAT 3971 (2024 VIIRS, 8 windows) and 4197 (2025 HJ-2B / S2 / S1 Punjab / VIIRS), plus the 2022 composite held out (LOEO).
Reuses fx_calibrate.py (load, flows, jrc_depth) unchanged and the fx_rp_test.py fit/predict code verbatim.
env: WS9_WORK (fx_grid output), WS9_UP, WS9_APP, FX_JRC_DIR. usage: python3 fx_dated_test.py <unosat dir> <fx_rp_test.json> <out.json> [<tuwien FLOOD-HM-MASKED.zip>]
<unosat dir> holds <product>/source.zip (read in place, no unzip). With the TU Wien zip (and 3342 present) the dated 2022 windows
REPLACE the 2022 composite (RULES.md R2 addendum); 4163 (S2 31 Jul 2025) is added when present."""
import os, sys, json, math, importlib.util, glob
import numpy as np, pandas as pd, geopandas as gpd
from rasterio.features import rasterize
from rasterio.transform import from_origin
FXC = os.environ['FXC_PATH']
spec = importlib.util.spec_from_file_location('fxc', FXC); fxc = importlib.util.module_from_spec(spec); spec.loader.exec_module(fxc)
UN, PRIOR, OUT = sys.argv[1:4]; TUW = sys.argv[4] if len(sys.argv) > 4 else None
import zipfile, fnmatch
C, meta = fxc.load(); rem, reach, dist, A, O, F = C['rem'], C['reach'], C['dist'], C['area'], C['obs'], C['frame']; ids = meta['reaches']
TRAIN = fxc.TRAIN
ring = np.floor(dist).astype(np.int16); sh = []
for d in range(0, int(meta['capKm'])):
    tot = fl = 0.0
    for y in TRAIN: m = F[y] & (ring == d); tot += m.sum(); fl += (m & O[y]).sum()
    sh.append(fl / tot if tot else np.nan)
sh = np.array(sh); bg = float(np.nanmedian(sh[40:60])); ex = np.clip(sh - bg, 0, None); cum = np.nancumsum(ex) / np.nansum(ex); DMAX = int(np.argmax(cum >= 0.95)) + 1
dom = dist < DMAX; print('domain km', DMAX, flush=True)
RR = json.load(open(os.path.join(fxc.APPD, 'river-rarity.json')))['reaches']
rep = lambda r: not ((RR.get(r) or {}).get('fitRefused') or (RR.get(r) or {}).get('modelRepresentsRiver') is False or 'under-call' in str(((RR.get(r) or {}).get('gaugeCheck') or {}).get('verdict') or ''))
Q = {k: v for k, v in fxc.flows(meta).items() if rep(k)}
JDIR = os.environ['FX_JRC_DIR']; di = np.flatnonzero(dom); jd, RPS, miss = fxc.jrc_depth(C['lat'][di], C['lon'][di], JDIR); assert not miss
J = np.zeros((len(rem), len(RPS)), np.uint8); J[di] = jd; del jd
G = pd.read_csv(os.path.join(fxc.UP, 'station-lake/archive/glofas/glofas_irsa_daily.csv.gz'), index_col=0, parse_dates=True)
def gumbel_rp(rid, y, peak):
    s = G[Q[rid]['col']]; am = s.groupby(s.index.year).max(); n = s.groupby(s.index.year).count(); am = am[(n >= 350) & (am.index <= 2024) & (am.index >= 1991) & (am.index != y)]
    x = np.sort(am.values); n = len(x); b0 = x.mean(); b1 = np.sum((np.arange(n)) / (n - 1) * x) / n; l2 = 2 * b1 - b0; al = l2 / math.log(2); xi = b0 - 0.5772 * al
    Fq = math.exp(-math.exp(-(peak - xi) / al)); return 1 / max(1e-9, 1 - Fq)
def rp_index(rp): rp = max(10.0, rp); return int(np.argmin([abs(math.log(rp) - math.log(r)) for r in RPS]))
def peak_to(rid, y, d1):
    s = G[Q[rid]['col']]; w = s[(s.index >= '%d-07-01' % y) & (s.index <= d1)]
    return float(w.max()) if w.notna().any() else None
# ---- truth rasters on the grid (cell centre rule, as fx_grid) ----
H, Wd = C['shape']; T = from_origin(meta['west'] + meta['c0'] * meta['cell'], meta['north'] - meta['r0'] * meta['cell'], meta['cell'], meta['cell'])
def ras(path):
    g = gpd.read_file(path, engine='pyogrio')
    return _ras(g)
def _ras(g):
    g = g[g.geometry.notna()]
    if g.crs is not None and g.crs.to_epsg() not in (4326, None): g = g.to_crs(4326)
    g = g.explode(index_parts=False)
    if not len(g): return np.zeros(len(rem), bool)
    m = rasterize(((geom, 1) for geom in g.geometry), out_shape=(H, Wd), transform=T, fill=0, dtype='uint8')
    return m.ravel()[C['flat']].astype(bool)
ZN = {}
def members(prod):
    z = os.path.join(UN, prod, 'source.zip')
    if z not in ZN: ZN[z] = zipfile.ZipFile(z).namelist()
    return z, ZN[z]
def one(pat):   # '<product>/*/<name pattern>' -> a zip:// path read in place
    prod, rest = pat.split('/', 1); z, names = members(prod)
    f = sorted(n for n in names if fnmatch.fnmatch(n, rest)); f = [x for x in f if not x.endswith('_1.shp')] or f; assert f, pat
    return 'zip://' + z + '!' + f[0]
def has(pat):
    prod, rest = pat.split('/', 1)
    if not os.path.exists(os.path.join(UN, prod, 'source.zip')): return False
    return any(fnmatch.fnmatch(n, rest) for n in members(prod)[1])
W = []   # (year, id, date d1, truth, observed, note)
A24 = ras(one('3971/*/VIIRS_20240721_20240803_AnalysisExtent_PAK.shp'))
for w in ['20240721_20240803', '20240808_20240812', '20240813_20240817', '20240817_20240820', '20240820_20240826', '20240826_20240902', '20240902_20240910']:
    pass
wins24 = sorted(set(os.path.basename(p).split('_')[1] + '_' + os.path.basename(p).split('_')[2] for p in members('3971')[1] if fnmatch.fnmatch(p, '*/VIIRS_*_MaximumFloodExtent*.shp')))
for w in wins24:
    d1 = pd.Timestamp(w.split('_')[1]).strftime('%Y-%m-%d')
    an = ras(one('3971/*/VIIRS_%s_AnalysisExtent*.shp' % w)) if has('3971/*/VIIRS_%s_AnalysisExtent*.shp' % w) else A24
    cl = ras(one('3971/*/VIIRS_%s_CloudObstruction*.shp' % w))
    W.append(dict(year=2024, id='VIIRS ' + w, d1=d1, truth=ras(one('3971/*/VIIRS_%s_MaximumFloodExtent*.shp' % w)), obs=an & ~cl,
                  truthMin=ras(one('3971/*/VIIRS_%s_MinimumFloodExtent*.shp' % w))))
    print('window', w, int(W[-1]['obs'].sum()), int(W[-1]['truth'].sum()), flush=True)
p = lambda s: one('4197/*/' + s)
W.append(dict(year=2025, id='HJ-2B 20250816', d1='2025-08-16', truth=ras(p('HJ2B_20250816_FloodExtent_PK.shp')), obs=ras(p('HJ2B_20250816_AnalysisExtent_PK.shp'))))
s2f = gpd.read_file(p('S2_20250820_FloodExtent_PK.shp'), engine='pyogrio'); s2w = gpd.read_file(p('S2_20250820_WaterExtent_PK.shp'), engine='pyogrio')
hull = pd.concat([s2f.geometry, s2w.geometry]).union_all().convex_hull
mh = rasterize([(hull, 1)], out_shape=(H, Wd), transform=T, fill=0, dtype='uint8').ravel()[C['flat']].astype(bool)
W.append(dict(year=2025, id='S2 20250820', d1='2025-08-20', truth=ras(p('S2_20250820_FloodExtent_PK.shp')), obs=mh, note='observed = convex hull of Flood+Water polygons (no analysis layer)'))
W.append(dict(year=2025, id='S1 20250827_20250828 Punjab', d1='2025-08-28', truth=ras(p('S1_20250827_20250828_FloodExtent_Punjab.shp')), obs=ras(p('S1_20250827_20250828_AnalysisExtent_Punjab.shp'))))
W.append(dict(year=2025, id='VIIRS 20250826_20250907', d1='2025-09-07', truth=ras(p('VIIRS_20250826_20250907_FloodWaterExtent_PAK.shp')),
              obs=ras(p('VIIRS_20250826_20250907_AnalysisExtent_PAK.shp')) & ~ras(p('VIIRS_20250826_20250907_CloudObstruction_PAK.shp')), note='flood + normal water layer'))
if has('4163/*/S2_20250731_FloodExtent_CentralPAK.shp'):
    q = lambda s: one('4163/*/' + s)
    W.append(dict(year=2025, id='S2 20250731 (4163)', d1='2025-07-31', truth=ras(q('S2_20250731_FloodExtent_CentralPAK.shp')),
                  obs=ras(q('S2_20250731_AnalysisExtent_CentralPAK.shp')) & ~ras(q('S2_20250731_CloudObstruction_CentralPAK.shp'))))
for w in W[-5:]: print('window', w['id'], int(w['obs'].sum()), int(w['truth'].sum()), flush=True)
COMP22 = dict(year=2022, id='composite 2022', d1=None, truth=O[2022], obs=F[2022])
DATED22 = TUW is not None and os.path.exists(os.path.join(UN, '3342', 'source.zip'))
if DATED22:   # RULES.md R2 addendum: the dated 2022 windows replace the composite (reported only from here on)
    u = lambda s: one('3342/*/' + s)
    for tag, d1, f, a in [('S1 20220806 Sindh', '2022-08-06', 'S1_20220806_FloodExtent_Sindh.shp', 'S1_20220806_AnalysisExtent_Sindh.shp'),
                          ('S1 20220815 Sindh', '2022-08-15', 'S1_20220815_FloodExtent_SindhProvince.shp', 'S1_20220815_AnalysisExtent_SindhProvince.shp'),
                          ('S1 20220827 Sindh+Balochistan', '2022-08-27', 'S1_20220827_FloodExtent_Sindh_Balochistan.shp', 'S1_20220827_AnalysisExtent_Sindh_Balochistan.shp')]:
        W.append(dict(year=2022, id=tag + ' (3342)', d1=d1, truth=ras(u(f)), obs=ras(u(a))))
    W.append(dict(year=2022, id='VIIRS 20220803_20220823 (3342)', d1='2022-08-23', truth=ras(u('VIIRS_20220803_20220823_FloodExtent_PAK.shp')),
                  obs=ras(u('VIIRS_20220803_20220823_AnalysisExtent_PAK.shp')) & ~ras(u('VIIRS_20220803_20220823_CloudObstruction_PAK.shp'))))
    # TU Wien 20 m S1 flood maps: one window per UTC acquisition day; the 20 m pixel holding each 250 m cell centre (domain cells only)
    import rasterio, re as _re
    from pyproj import Transformer
    zt = zipfile.ZipFile(TUW); tifs = sorted(n for n in zt.namelist() if n.endswith('.tif') and 'FLOOD-HM-MASKED_' in n)
    di = np.flatnonzero(dom); la, lo = C['lat'][di], C['lon'][di]; VAL, WET = {}, {}; TR = {}
    for n in tifs:
        day = pd.Timestamp(_re.search(r'_(\d{8})T', n).group(1)).strftime('%Y-%m-%d')
        with rasterio.open('zip://' + TUW + '!' + n) as src:
            key = src.crs.to_wkt()
            if key not in TR: TR[key] = Transformer.from_crs('EPSG:4326', src.crs, always_xy=True).transform(lo, la)
            x, y = TR[key]; b = src.bounds; ins = (x >= b.left) & (x < b.right) & (y > b.bottom) & (y <= b.top)
            if not ins.any(): continue
            r, c = rasterio.transform.rowcol(src.transform, x[ins], y[ins]); r = np.asarray(r); c = np.asarray(c)
            v = src.read(1)[r, c]
        ii = di[ins]
        VAL.setdefault(day, np.zeros(len(rem), bool))[ii[v != 255]] = True
        WET.setdefault(day, np.zeros(len(rem), bool))[ii[v == 1]] = True
        print('tuwien', n.rsplit('/', 1)[-1][:40], day, int(ins.sum()), int((v == 1).sum()), flush=True)
    for day in sorted(VAL):
        W.append(dict(year=2022, id='TU Wien S1 ' + day, d1=day, truth=WET[day] & VAL[day], obs=VAL[day]))
        print('window TU Wien', day, int(VAL[day].sum()), int(WET[day].sum()), flush=True)
else:
    W.insert(0, COMP22)
COMP25 = dict(year=2025, id='composite 2025 (reported only)', d1=None, truth=O[2025], obs=F[2025])
# ---- zones per window ----
def zones(w):
    out = []
    for k, rid in enumerate(ids):
        if rid not in Q: continue
        if w['d1'] is None:
            pk = Q[rid]['peak'].get(w['year'])
        else: pk = peak_to(rid, w['year'], w['d1'])
        if pk is None: continue
        dk = dom & (reach == k); z = dk & w['obs']; n = int(z.sum())
        if n < 200 or n < 0.5 * int(dk.sum()): continue
        rp = gumbel_rp(rid, w['year'], pk); out.append(dict(reach=rid, k=k, n=n, z=z, peak=round(pk, 1), rp=round(rp, 1), ri=rp_index(rp), rpMap=RPS[rp_index(rp)]))
    return out
# ---- parameters ----
PR = json.load(open(PRIOR)); P24 = dict(C3=PR['models']['C3'], B2=PR['models']['B2']); print('fixed params', P24, flush=True)
# LOEO fit for 2022 on 2010 + 2014 (fx_rp_test procedures, verbatim)
rows = []
for y in [2010, 2014]:
    for k, rid in enumerate(ids):
        if rid not in Q or Q[rid]['peak'].get(y) is None: continue
        z = dom & (reach == k) & F[y]; n = int(z.sum())
        if n < 200 or n < 0.5 * int((dom & (reach == k)).sum()): continue
        rp = gumbel_rp(rid, y, Q[rid]['peak'][y]); rows.append(dict(year=y, reach=rid, k=k, ri=rp_index(rp)))
TR = pd.DataFrame(rows); Z = {(r.year, r.reach): dom & (reach == r.k) & F[r.year] for r in TR.itertuples()}
def fitB2(df):
    areas = np.zeros(len(RPS)); obs = 0.0
    for r in df.itertuples():
        z = Z[(r.year, r.reach)]; obs += A[z & O[r.year]].sum()
        for i in range(len(RPS)): areas[i] += A[z & (J[:, i] > 0)].sum()
    return dict(i=int(np.argmin(np.abs(areas - obs))))
def fitC3(df):
    best = None; hs = np.arange(0, 20.01, 0.5)
    for d in range(1, 31):
        Hh = np.zeros(len(hs)); Mm = np.zeros(len(hs)); Ff = np.zeros(len(hs))
        for r in df.itertuples():
            z = Z[(r.year, r.reach)]; o = O[r.year][z]; a = A[z]; w = J[z, r.ri] >= d; h = rem[z]
            for i, hh in enumerate(hs): p = w & (h <= hh); Hh[i] += a[p & o].sum(); Mm[i] += a[~p & o].sum(); Ff[i] += a[p & ~o].sum()
        cs = Hh / np.maximum(1, Hh + Mm + Ff); i = int(np.argmax(cs))
        if best is None or cs[i] > best[0]: best = (cs[i], d, float(hs[i]))
    return dict(d=best[1], h=best[2], trainCsi=round(float(best[0]), 4))
P22 = dict(C3=fitC3(TR), B2=fitB2(TR)); print('LOEO params for 2022', P22, flush=True)
def score(w, P, truth=None):
    truth = w['truth'] if truth is None else truth; per = {}
    for zz in w['zones']:
        z = zz['z']
        pc = z & (J[:, zz['ri']] >= P['C3']['d']) & (rem <= P['C3']['h']); pb = z & (J[:, P['B2']['i']] > 0); o = truth & z
        per[zz['reach']] = {m: (float(A[p & o].sum()), float(A[~p & o].sum()), float(A[p & ~o].sum())) for m, p in (('C3', pc), ('B2', pb))}
    return per
def csi(t): return t[0] / (t[0] + t[1] + t[2]) if sum(t) > 0 else np.nan
def summ(per, m):
    t = np.sum([per[r][m] for r in per], axis=0) if per else np.zeros(3); H_, M_, F_ = t
    return dict(hitKm2=round(H_), missKm2=round(M_), falseKm2=round(F_), csi=round(csi(t), 4) if sum(t) else None, pod=round(H_ / (H_ + M_), 4) if H_ + M_ else None,
                far=round(F_ / (H_ + F_), 4) if H_ + F_ else None, areaBias=round((H_ + F_) / (H_ + M_), 3) if H_ + M_ else None)
res = dict(rule='sci2 RULES.md R2' + (' + addendum (dated 2022 windows replace the composite; 4163 added)' if TUW else ''), domainKm=DMAX, returnPeriods=RPS, params={'2024_2025': P24, '2022_LOEO': P22}, windows=[])
PER = {}
REPORT_ONLY = [COMP25] + ([COMP22] if DATED22 else [])
for w in W + REPORT_ONLY:
    w['zones'] = zones(w); P = P22 if w['year'] == 2022 else P24; per = score(w, P)
    rec = dict(year=w['year'], id=w['id'], date=w['d1'], note=w.get('note'), zones=[{k: v for k, v in z.items() if k not in ('z', 'k')} for z in w['zones']],
               C3=summ(per, 'C3'), B2=summ(per, 'B2'))
    if rec['C3']['csi'] is not None and rec['B2']['csi'] is not None: rec['gain'] = round(rec['C3']['csi'] - rec['B2']['csi'], 4)
    if 'truthMin' in w: pm = score(w, P, w['truthMin']); rec['minExtent'] = dict(C3=summ(pm, 'C3'), B2=summ(pm, 'B2'))
    res['windows'].append(rec); print(rec['id'], len(w['zones']), 'zones', rec['C3']['csi'], rec['B2']['csi'], flush=True)
    if not any(w is x for x in REPORT_ONLY) and per: PER[w['id']] = (w['year'], per)
    rec['reportOnly'] = any(w is x for x in REPORT_ONLY)
# ---- pooled statistic and bootstrap (reach zones resampled within each year) ----
YRS = [2022, 2024, 2025]
def stat(sample):
    yg = {}
    for y in YRS:
        g = []
        for wid, (yy, per) in PER.items():
            if yy != y: continue
            tc = np.zeros(3); tb = np.zeros(3)
            for r in sample[y]:
                if r in per: tc += per[r]['C3']; tb += per[r]['B2']
            if tc.sum() > 0 and tb.sum() > 0: g.append(csi(tc) - csi(tb))
        yg[y] = float(np.mean(g)) if g else np.nan
    return float(np.nanmean([yg[y] for y in YRS])), yg
reaches = {y: sorted(set(r for wid, (yy, per) in PER.items() if yy == y for r in per)) for y in YRS}
G0, Y0 = stat(reaches); rng = np.random.default_rng(2026); Bg = []; By = {y: [] for y in YRS}
for _ in range(2000):
    s = {y: list(rng.choice(reaches[y], len(reaches[y]))) for y in YRS}; g, yg = stat(s); Bg.append(g); [By[y].append(yg[y]) for y in YRS]
q = lambda v: [round(float(np.nanpercentile(v, 2.5)), 4), round(float(np.nanpercentile(v, 97.5)), 4)]
res['pooled'] = dict(G=round(G0, 4), ci95=q(Bg), yearGain={str(y): round(Y0[y], 4) for y in YRS}, yearCi95={str(y): q(By[y]) for y in YRS},
                     reachesPerYear={str(y): len(reaches[y]) for y in YRS}, windowsPerYear={str(y): sum(1 for v in PER.values() if v[0] == y) for y in YRS})
res['promote'] = bool(res['pooled']['ci95'][0] > 0 and all(Y0[y] >= 0 for y in YRS))
json.dump(res, open(OUT, 'w'), indent=1, default=float); print(json.dumps(dict(params=res['params'], pooled=res['pooled'], promote=res['promote']), indent=1, default=float))
