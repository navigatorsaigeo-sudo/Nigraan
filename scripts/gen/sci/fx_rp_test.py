"""SCI item 8 · river flood extent: JRC depth conditioned on the event's GloFAS return period (+ HAND), against the JRC 1-in-10 map.
Rule: /tmp/claude-0/sci/RULES.md item 8. Reuses scripts/gen/flood_extent/fx_calibrate.py (load, flows, jrc_depth, scores) unchanged.
env: WS9_WORK (fx_grid output), WS9_UP (nig folder), WS9_APP (data folder), FX_JRC_DIR. usage: python3 fx_rp_test.py <out.json>"""
import os, sys, json, math, importlib.util
import numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('fxc', os.path.join(HERE, '..', 'flood_extent', 'fx_calibrate.py')); fxc = importlib.util.module_from_spec(spec); spec.loader.exec_module(fxc)
OUT = sys.argv[1]; TRAIN, TEST = fxc.TRAIN, fxc.TEST; RNG = np.random.default_rng(2025)
C, meta = fxc.load(); rem, reach, dist, A, O, F = C['rem'], C['reach'], C['dist'], C['area'], C['obs'], C['frame']; ids = meta['reaches']
# domain: the same rule as fx_calibrate
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
G = fxc.flow_series()[0]   # v283.10: the served series (Q[rid]['col'] is its column), as fx_calibrate
def gumbel_rp(rid, y):
    s = G[Q[rid]['col']]; am = s.groupby(s.index.year).max(); n = s.groupby(s.index.year).count(); am = am[(n >= 350) & (am.index <= 2024) & (am.index >= 1991) & (am.index != y)]
    x = np.sort(am.values); n = len(x); b0 = x.mean(); b1 = np.sum((np.arange(n)) / (n - 1) * x) / n; l2 = 2 * b1 - b0; al = l2 / math.log(2); xi = b0 - 0.5772 * al
    Fq = math.exp(-math.exp(-(Q[rid]['peak'][y] - xi) / al)); return 1 / max(1e-9, 1 - Fq)
def rp_index(rp): rp = max(10.0, rp); return int(np.argmin([abs(math.log(rp) - math.log(r)) for r in RPS]))
rows = []
for y in TRAIN + [TEST]:
    for k, rid in enumerate(ids):
        if rid not in Q or Q[rid]['peak'].get(y) is None: continue
        z = dom & (reach == k) & F[y]; n = int(z.sum())
        if n < 200 or n < 0.5 * int((dom & (reach == k)).sum()): continue
        rp = gumbel_rp(rid, y); rows.append(dict(year=y, reach=rid, k=k, n=n, rp=round(rp, 1), ri=rp_index(rp), rpMap=RPS[rp_index(rp)]))
T = pd.DataFrame(rows); print(T.to_string(), flush=True)
Z = {(r.year, r.reach): dom & (reach == r.k) & F[r.year] for r in T.itertuples()}
def pred(kind, P, r):
    z = Z[(r.year, r.reach)]
    if kind == 'B2': return z & (J[:, P['i']] > 0)
    if kind == 'C1': return z & (J[:, r.ri] > 0)
    if kind == 'C2': return z & (J[:, r.ri] >= P['d'])
    if kind == 'C2f': return z & (J[:, 0] >= P['d'])
    if kind == 'C3': return z & (J[:, r.ri] >= P['d']) & (rem <= P['h'])
def fit(df, kind):
    if kind == 'C1': return {}
    if kind == 'B2':
        areas = np.zeros(len(RPS)); obs = 0.0
        for r in df.itertuples():
            z = Z[(r.year, r.reach)]; obs += A[z & O[r.year]].sum()
            for i in range(len(RPS)): areas[i] += A[z & (J[:, i] > 0)].sum()
        return dict(i=int(np.argmin(np.abs(areas - obs))))
    if kind in ('C2', 'C2f'):   # area matching on the depth threshold
        obs = 0.0; ar = np.zeros(256)
        for r in df.itertuples():
            z = Z[(r.year, r.reach)]; obs += A[z & O[r.year]].sum(); dv = J[z, r.ri if kind == 'C2' else 0]; ar += np.bincount(dv, weights=A[z], minlength=256)
        wet = np.cumsum(ar[::-1])[::-1]   # wet[d] = area with depth >= d
        ds = np.arange(1, 256); return dict(d=int(ds[np.argmin(np.abs(wet[1:] - obs))]))
    if kind == 'C3':
        best = None; hs = np.arange(0, 20.01, 0.5)
        for d in range(1, 31):
            Hh = np.zeros(len(hs)); Mm = np.zeros(len(hs)); Ff = np.zeros(len(hs))
            for r in df.itertuples():
                z = Z[(r.year, r.reach)]; o = O[r.year][z]; a = A[z]; w = J[z, r.ri] >= d; h = rem[z]
                for i, hh in enumerate(hs): p = w & (h <= hh); Hh[i] += a[p & o].sum(); Mm[i] += a[~p & o].sum(); Ff[i] += a[p & ~o].sum()
            cs = Hh / np.maximum(1, Hh + Mm + Ff); i = int(np.argmax(cs))
            if best is None or cs[i] > best[0]: best = (cs[i], d, float(hs[i]))
        return dict(d=best[1], h=best[2], trainCsi=round(float(best[0]), 4))
def evaluate(kind, P, df, y):
    per = {}; H = M = Fa = 0.0
    for r in df[df.year == y].itertuples():
        z = Z[(r.year, r.reach)]; p = pred(kind, P, r); o = O[y]
        h_, m_, f_ = A[p & o].sum(), A[z & ~p & o].sum(), A[p & ~o].sum(); per[r.reach] = (h_, m_, f_); H += h_; M += m_; Fa += f_
    s = dict(hitKm2=round(H), missKm2=round(M), falseKm2=round(Fa), csi=round(H / (H + M + Fa), 4), pod=round(H / (H + M), 4), far=round(Fa / (H + Fa), 4) if H + Fa else None, areaBias=round((H + Fa) / (H + M), 3))
    return s, per
tr = T[T.year.isin(TRAIN)]; KS = ['B2', 'C1', 'C2', 'C2f', 'C3']
inner = {}
for kind in KS:
    cs = {}
    for y in TRAIN: m = fit(tr[tr.year != y], kind); cs[str(y)] = evaluate(kind, m, tr, y)[0]['csi']
    inner[kind] = dict(csiByHeldOutEvent=cs, mean=round(float(np.mean(list(cs.values()))), 4)); print('inner', kind, inner[kind], flush=True)
cand = max(['C1', 'C2', 'C2f', 'C3'], key=lambda k: inner[k]['mean'])
models = {k: fit(tr, k) for k in KS}; test = {}; per = {}
for k in KS: test[k], per[k] = evaluate(k, models[k], T, TEST)
zs = sorted(per[cand]); gains = {}
for k in KS:
    if k == cand: continue
    g = []
    for _ in range(2000):
        zz = list(RNG.choice(zs, len(zs)))
        cc = lambda kk: (lambda s: s[0] / (s[0] + s[1] + s[2]) if sum(s) else 0)(np.sum([per[kk][r] for r in zz], axis=0))
        g.append(cc(cand) - cc(k))
    gains[k] = [round(float(np.mean(g)), 4), round(float(np.quantile(g, .025)), 4), round(float(np.quantile(g, .975)), 4)]
res = dict(domainKm=DMAX, rule='RULES.md item 8', returnPeriods=RPS, targets=T.drop(columns=['k']).to_dict('records'), innerLOEO=inner, chosen=cand,
           models=models, test2025=test, csiGain2025={'vs' + k: v for k, v in gains.items()}, promote=bool(gains['B2'][1] > 0),
           perReach2025={r: {k: dict(zip(['hitKm2', 'missKm2', 'falseKm2'], [round(float(x)) for x in per[k][r]])) for k in KS} for r in zs})
json.dump(res, open(OUT, 'w'), indent=1, default=float); print(json.dumps({k: res[k] for k in ['domainKm', 'innerLOEO', 'chosen', 'models', 'test2025', 'csiGain2025', 'promote']}, indent=1, default=float))
