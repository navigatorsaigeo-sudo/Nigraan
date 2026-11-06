# v91.17.283.40 hills fit = scratchpad rain/score.py (the plains test) with the tehsil zone (HILLS_RULES_20261031.json). usage: python hills40_fit.py truth.parquet _hills40 <outdir>/
"""Scores per rules.json (frozen sha256 e57d67e0...). Writes results.csv, pass.json, model.json"""
import pandas as pd, numpy as np, json, warnings, sys
TRUTH = sys.argv[1] if len(sys.argv) > 1 else 'truth.parquet'; SUF = sys.argv[2] if len(sys.argv) > 2 else ''
from shapely.geometry import Point, Polygon
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
warnings.filterwarnings('ignore')
D = '/tmp/claude-0/-home-claude/884c0fe0-d7f4-5a90-a62f-50507e3d179e/scratchpad/rain/'
OUT = sys.argv[3] if len(sys.argv) > 3 else D
M = '/mnt/user-data/outputs/met_parquet/'
CL = [15.6, 64.5, 115.6, 204.5]
ZONES = ['plains', 'hills', 'mountain', 'coast']
B = 1000; RNG = np.random.default_rng(20261027)

# ---------------- zones (served rule at station elevation)
P = pd.read_csv('/mnt/user-data/uploads/LAMHA/data/nwp/points/points.csv', dtype={'sid': str})
sm = pd.read_parquet(M + 'stations/stations_master.parquet')
es = pd.read_parquet(M + 'pmd_ews/ews_stations.parquet')
el = {}
for _, r in sm.iterrows():
    if pd.notna(r.elev_m):
        el[('MACH' if r.network == 'MACH' else r.network, str(r.station_key).upper())] = r.elev_m
        if pd.notna(r.wmo): el[(r.network, str(r.wmo).split('.')[0])] = r.elev_m
for _, r in es.iterrows():
    if pd.notna(r.elevation_m) and pd.notna(r.station_id): el[('PMD_EWS', str(int(r.station_id)))] = r.elevation_m
def elev(r):
    net = {'mach': 'MACH', 'synop': 'PMD_SYNOP', 'pmd_aws': 'PMD_AWS', 'ews_gb': 'PMD_EWS'}.get(r.src)
    if net is None: return np.nan
    k = str(r.sid).upper() if net in ('MACH', 'PMD_AWS') else str(r.sid)
    return el.get((net, k), el.get((net, str(r.sid)), np.nan))
P['elev'] = P.apply(elev, axis=1)
Z = json.load(open('/tmp/claude-0/sci40/data/model-zone.json'))['zoneRule']
polys = [Polygon(p[0]) for p in Z['mountainOutline']]
def hav(a, b, c, d):
    R = 6371; t = np.pi / 180
    h = np.sin((c - a) * t / 2) ** 2 + np.cos(a * t) * np.cos(c * t) * np.sin((d - b) * t / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(h))
def coastkm(lat, lon):
    L = Z['coastline']; best = 1e9
    for i in range(len(L) - 1):
        x1, y1 = L[i]; x2, y2 = L[i + 1]
        for t in np.arange(0, 1.0001, 0.1): best = min(best, hav(lat, lon, y1 + (y2 - y1) * t, x1 + (x2 - x1) * t))
    return best
def zone(r):
    if any(pg.contains(Point(r.lon, r.lat)) for pg in polys): return 'mountain'
    if pd.notna(r.elev) and r.elev >= Z['mountainMinElevM']: return 'mountain'
    if coastkm(r.lat, r.lon) <= Z['coastKm']: return 'coast'
    if pd.notna(r.elev) and r.elev >= Z['hillsMinElevM']: return 'hills'
    return 'plains'
P['zone_station'] = P.apply(zone, axis=1)
# v283.40 hills rules: the zone of the tehsil the station lies in (data/model-zone.json units; the served unit)
from shapely.geometry import shape as _shape
from shapely.strtree import STRtree as _Tree
_G = json.load(open('/tmp/claude-0/sci40/data/pk-tehsils.json')); _U = json.load(open('/tmp/claude-0/sci40/data/model-zone.json'))['units']
_g = [_shape(f['geometry']) for f in _G['features']]; _u = [f['properties']['uid'] for f in _G['features']]; _T = _Tree(_g)
def _tz(r):
    p = Point(r.lon, r.lat); h = [i for i in _T.query(p) if _g[i].covers(p)]
    if not h: return None
    z = _U.get(_u[h[0]]); return (z.get('zone') if isinstance(z, dict) else z) if z else None
P['tehsil'] = [(_u[[i for i in _T.query(Point(r.lon, r.lat)) if _g[i].covers(Point(r.lon, r.lat))][0]] if [i for i in _T.query(Point(r.lon, r.lat)) if _g[i].covers(Point(r.lon, r.lat))] else None) for r in P.itertuples()]
P['zone'] = [(_tz(r) or 'plains') for r in P.itertuples()]

# ---------------- pairs
T = pd.read_parquet(D + TRUTH); F = pd.read_parquet(D + 'fcst.parquet')
X = T.merge(F, on=['pid', 'date', 'win'], how='inner').merge(P[['pid', 'zone', 'elev', 'src']].rename(columns={'src': 'net'}), on='pid')
X['year'] = X.date.dt.year; X['month'] = X.date.dt.month
X['regime'] = np.where(X.month.isin([6, 7, 8, 9]), 'monsoon', 'rest')
X['season'] = np.where(X.month.isin([7, 8, 9]), 'Jul-Sep', 'rest')
X['test'] = X.year == 2026
X['dayi'] = (X.date - pd.Timestamp('2023-01-01')).dt.days
print('pairs', len(X), X.groupby(['lead', 'test']).size().to_dict())
print('points by zone with truth', X.drop_duplicates('pid').zone.value_counts().to_dict())
missing_elev = X.drop_duplicates('pid').elev.isna().sum(); print('points without elevation', missing_elev)

# ---------------- bootstrap weights (two-way cluster)
def boot_w(st, dy):
    us, si = np.unique(st, return_inverse=True); ud, di = np.unique(dy, return_inverse=True)
    W = np.empty((B, len(st)), np.float32)
    for b in range(B):
        cs = np.bincount(RNG.integers(0, len(us), len(us)), minlength=len(us))
        cd = np.bincount(RNG.integers(0, len(ud), len(ud)), minlength=len(ud))
        W[b] = cs[si] * cd[di]
    return W
def q(a): a = a[np.isfinite(a)]; return (np.nan, np.nan) if len(a) < B * 0.5 else (np.percentile(a, 5), np.percentile(a, 95))

def cont(fy, oy, w=None):
    if w is None: w = np.ones((1, len(fy)), np.float32)
    h = w @ (fy & oy); m = w @ (~fy & oy); f = w @ (fy & ~oy); n = w.sum(1)
    with np.errstate(all='ignore'):
        pod = h / (h + m); far = f / (h + f); csi = h / (h + m + f); bias = (h + f) / (h + m)
        hr = (h + m) * (h + f) / n; ets = (h - hr) / (h + m + f - hr)
    return dict(hits=h, misses=m, fa=f, pod=pod, far=far, csi=csi, bias=bias, ets=ets)

rows = []
def add(**k): rows.append(k)

# ---------------- Test A: deterministic exceedance
def testA(S, period, W=None):
    for ci, c in enumerate(CL):
        fy = (S.f_mm.values >= c); oy = (S.obs_mm.values >= c)
        r = cont(fy, oy)
        ci_ = {}
        if W is not None and oy.sum() > 0:
            rb = cont(fy, oy, W)
            ci_ = {'csi_lo': q(rb['csi'])[0], 'csi_hi': q(rb['csi'])[1], 'ets_lo': q(rb['ets'])[0], 'ets_hi': q(rb['ets'])[1],
                   'pod_lo': q(rb['pod'])[0], 'pod_hi': q(rb['pod'])[1], 'far_lo': q(rb['far'])[0], 'far_hi': q(rb['far'])[1], 'bias_lo': q(rb['bias'])[0], 'bias_hi': q(rb['bias'])[1]}
        yield c, dict(n=len(S), events=int(oy.sum()), fc_yes=int(fy.sum()), hits=int(r['hits'][0]), misses=int(r['misses'][0]), false_alarms=int(r['fa'][0]),
                      pod=r['pod'][0], far=r['far'][0], csi=r['csi'][0], bias=r['bias'][0], ets=r['ets'][0], **ci_)

for lead in (1, 2, 3):
    for period, S0 in (('2023-2026 all', X[X.lead == lead]), ('2026 test', X[(X.lead == lead) & X.test])):
        for zn in ['all'] + ZONES:
            for se in ['all', 'Jul-Sep', 'rest']:
                S = S0 if zn == 'all' else S0[S0.zone == zn]
                S = S if se == 'all' else S[S.season == se]
                if len(S) == 0: continue
                W = boot_w(S.pid.values, S.dayi.values) if (se == 'all') else None
                for c, d in testA(S, period, W):
                    add(test='A_deterministic', cls=c, lead=lead, zone=zn, season=se, period=period, **d)
                del W
print('test A done', flush=True)

# ---------------- Test B: calibrated chance
def clim_table(Tr):
    t = {}
    for ci, c in enumerate(CL):
        o = (Tr.obs_mm >= c)
        st = Tr.assign(o=o).groupby(['pid', 'regime']).o.agg(['mean', 'size'])
        zr = Tr.assign(o=o).groupby(['zone', 'regime']).o.mean()
        t[c] = (st, zr)
    return t
def clim_of(S, ct, c):
    st, zr = ct[c]
    k = pd.MultiIndex.from_arrays([S.pid.values, S.regime.values])
    s = st.reindex(k); z = zr.reindex(pd.MultiIndex.from_arrays([S.zone.values, S.regime.values])).values
    v = np.where(s['size'].values >= 120, s['mean'].values, z)
    v = np.where(np.isfinite(v), v, np.nan)
    return np.clip(np.nan_to_num(v, nan=0.0), 0.001, 0.999)

def fit(Tr, lead):
    """returns dict per class: {'zone': (coef, lo, hi, kind)}"""
    out = {}
    Tl = Tr[Tr.lead == lead]
    for c in CL:
        y = (Tl.obs_mm >= c).values.astype(int)
        x1 = np.log1p(Tl.f_mm.values); x2 = (Tl.regime == 'monsoon').values.astype(float)
        cells = {}
        def one(mask, tag):
            if y[mask].sum() < 1 or y[mask].sum() == mask.sum(): return None
            Xm = np.c_[x1[mask], x2[mask]]
            if len(np.unique(x2[mask])) < 2: Xm = np.c_[x1[mask], np.zeros(mask.sum())]
            m = LogisticRegression(C=1e6, max_iter=2000).fit(Xm, y[mask])
            return dict(a=float(m.intercept_[0]), b1=float(m.coef_[0][0]), b2=float(m.coef_[0][1]), lo=float(x1[mask].min()), hi=float(x1[mask].max()),
                        events=int(y[mask].sum()), n=int(mask.sum()), fit=tag)
        pooled = one(np.ones(len(y), bool), 'pooled')
        for zn in ZONES:
            mk = (Tl.zone == zn).values
            cells[zn] = one(mk, zn) if y[mk].sum() >= 30 else pooled
            if cells[zn] is None: cells[zn] = pooled
        cells['*'] = pooled
        out[c] = cells
    return out
def predict(model, S):
    P_ = np.zeros((len(S), len(CL)))
    x1 = np.log1p(S.f_mm.values); x2 = (S.regime == 'monsoon').values.astype(float)
    for j, c in enumerate(CL):
        p = np.full(len(S), np.nan)
        for zn in ZONES:
            mk = (S.zone == zn).values; cf = model[c].get(zn) or model[c]['*']
            if cf is None: p[mk] = 0.001; continue
            xx = np.clip(x1[mk], cf['lo'], cf['hi'])
            p[mk] = 1 / (1 + np.exp(-(cf['a'] + cf['b1'] * xx + cf['b2'] * x2[mk])))
        P_[:, j] = np.clip(p, 0.001, 0.999)
    P_ = np.minimum.accumulate(P_, axis=1)
    return P_
def best_cut(p, o):
    best = (None, -9)
    for cu in np.arange(0.02, 0.905, 0.01):
        r = cont(p >= cu, o)
        e = r['ets'][0]
        if np.isfinite(e) and e > best[1]: best = (round(float(cu), 2), float(e))
    return best

def rel_unc(p, o):
    bins = np.minimum((p * 10).astype(int), 9); n = len(p); ob = o.mean()
    rel = sum(((p[bins == k].mean() - o[bins == k].mean()) ** 2) * (bins == k).sum() for k in range(10) if (bins == k).any()) / n
    res = sum(((o[bins == k].mean() - ob) ** 2) * (bins == k).sum() for k in range(10) if (bins == k).any()) / n
    return rel, res, ob * (1 - ob)

def scoreB(S, p, o, clim, W=None):
    bs = np.mean((p - o) ** 2); bc = np.mean((clim - o) ** 2); bss = 1 - bs / bc if bc > 0 else np.nan
    rel, res, unc = rel_unc(p, o)
    auc = roc_auc_score(o, p) if 0 < o.sum() < len(o) else np.nan
    d = dict(n=len(S), events=int(o.sum()), brier=bs, brier_clim=bc, bss=bss, rel=rel, res=res, unc=unc, rel_unc=rel / unc if unc > 0 else np.nan,
             freq_ratio=p.mean() / o.mean() if o.sum() > 0 else np.nan, auc=auc)
    if W is not None and o.sum() > 0:
        e1 = W @ ((p - o) ** 2); e2 = W @ ((clim - o) ** 2)
        with np.errstate(all='ignore'): bb = 1 - e1 / e2
        d['bss_lo'], d['bss_hi'] = q(bb)
    return d

Tr = X[~X.test]; Te = X[X.test]
model = {l: fit(Tr, l) for l in (1, 2, 3)}
ct = clim_table(Tr)
cuts = {}
for l in (1, 2, 3):
    S = Tr[Tr.lead == l]; Pp = predict(model[l], S)
    for j, c in enumerate(CL):
        cuts[(c, l)] = best_cut(Pp[:, j], (S.obs_mm.values >= c))
print('cuts', cuts, flush=True)

gate = {}
for l in (1, 2, 3):
    S = Te[Te.lead == l]; Pp = predict(model[l], S)
    Wall = boot_w(S.pid.values, S.dayi.values)
    for j, c in enumerate(CL):
        o = (S.obs_mm.values >= c).astype(float); clim = clim_of(S, ct, c); p = Pp[:, j]
        for zn in ['all'] + ZONES:
            for se in ['all', 'Jul-Sep', 'rest']:
                mk = np.ones(len(S), bool)
                if zn != 'all': mk &= (S.zone == zn).values
                if se != 'all': mk &= (S.season == se).values
                if mk.sum() == 0: continue
                W = Wall[:, mk] if se == 'all' else None
                d = scoreB(S[mk], p[mk], o[mk], clim[mk], W)
                cu = cuts[(c, l)][0]
                lv = {}
                if cu is not None:
                    fy = p[mk] >= cu; oy = o[mk] > 0; r = cont(fy, oy)
                    lv = dict(cut=cu, hits=int(r['hits'][0]), misses=int(r['misses'][0]), false_alarms=int(r['fa'][0]), pod=r['pod'][0], far=r['far'][0], csi=r['csi'][0], bias=r['bias'][0], ets=r['ets'][0])
                    if W is not None and oy.sum() > 0:
                        rb = cont(fy, oy, W); lv['ets_lo'], lv['ets_hi'] = q(rb['ets']); lv['csi_lo'], lv['csi_hi'] = q(rb['csi'])
                add(test='B_calibrated_2026', cls=c, lead=l, zone=zn, season=se, period='2026 test', **d, **lv)
    del Wall
print('test B done', flush=True)

# LOYO
loyo = {}
for Y in (2023, 2024, 2025, 2026):
    TrY = X[X.year != Y]; TeY = X[X.year == Y]
    ctY = clim_table(TrY)
    for l in (1, 2, 3):
        mY = fit(TrY, l); S = TeY[TeY.lead == l]
        if len(S) == 0: continue
        Pp = predict(mY, S)
        for j, c in enumerate(CL):
            o = (S.obs_mm.values >= c).astype(float); d = scoreB(S, Pp[:, j], o, clim_of(S, ctY, c))
            loyo[(c, l, Y)] = d
            add(test='B_LOYO', cls=c, lead=l, zone='all', season='all', period='held-out %d' % Y, **d)
print('loyo done', flush=True)

R = pd.DataFrame(rows)
R.to_csv(OUT + 'results' + SUF + '.csv', index=False, float_format='%.4f')

# ---------------- gate
def g(test, c, l, zn='all', se='all'):
    r = R[(R.test == test) & (R.cls == c) & (R.lead == l) & (R.zone == zn) & (R.season == se)]
    return r.iloc[0] if len(r) else None
res = {}
for c in CL:
    for l in (1, 2, 3):
        b = g('B_calibrated_2026', c, l)
        chk = {}
        chk['G1_events'] = bool(b is not None and b.events >= 20)
        chk['G2_bss'] = bool(b is not None and b.bss > 0 and np.isfinite(b.get('bss_lo', np.nan)) and b.bss_lo > 0)
        chk['G3_reliability'] = bool(b is not None and b.rel_unc <= 0.10 and 0.67 <= b.freq_ratio <= 1.5)
        ly = [loyo[(c, l, Y)] for Y in (2023, 2024, 2025, 2026) if (c, l, Y) in loyo and loyo[(c, l, Y)]['events'] >= 10]
        tot_bs = sum(d['brier'] * d['n'] for d in loyo.values() if False)
        pooled = [loyo[(c, l, Y)] for Y in (2023, 2024, 2025, 2026) if (c, l, Y) in loyo]
        pb = 1 - sum(d['brier'] * d['n'] for d in pooled) / sum(d['brier_clim'] * d['n'] for d in pooled) if pooled else np.nan
        chk['G4_loyo'] = bool(len(ly) >= 3 and sum(d['bss'] > 0 for d in ly) >= 3 and pb > 0)
        chk['G5_level_ets'] = bool(b is not None and np.isfinite(b.get('ets_lo', np.nan)) and b.ets_lo > 0)
        tested = all(chk.values())
        zones = {}
        for zn in ZONES:
            z = g('B_calibrated_2026', c, l, zn)
            zones[zn] = bool(tested and z is not None and z.events >= 20 and np.isfinite(z.get('bss_lo', np.nan)) and z.bss_lo > 0 and np.isfinite(z.get('ets_lo', np.nan)) and z.ets_lo > 0)
        res['%s|%d' % (c, l)] = dict(tested=tested, zones=zones, checks=chk, loyo_pooled_bss=pb, loyo_years_with_10_events=len(ly), cut=cuts[(c, l)][0], train_ets_at_cut=cuts[(c, l)][1])
json.dump(res, open(OUT + 'pass' + SUF + '.json', 'w'), indent=1, default=float)
mout = {str(l): {str(c): model[l][c] for c in CL} for l in (1, 2, 3)}
json.dump({'model': mout, 'cuts': {'%s|%d' % k: v[0] for k, v in cuts.items()}, 'zones_by_point': P.set_index('pid').zone.to_dict(),
           'pairs': {'all': int(len(X)), 'test2026': int(X.test.sum())}}, open(OUT + 'model' + SUF + '.json', 'w'), indent=1, default=float)
for k, v in res.items(): print(k, v['tested'], v['checks'], {z: x for z, x in v['zones'].items() if x}, 'cut', v['cut'])
