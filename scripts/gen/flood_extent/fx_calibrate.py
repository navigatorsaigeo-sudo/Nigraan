#!/usr/bin/env python3
"""v283 WS9 · river flood extent, step B: calibrate 'how high above the river the water spreads' against the model flow, per reach,
on the observed flood extents of 2010, 2014 and 2022, and test on 2025 (never seen by any fit).

Domain (from data, not typed): the river-flood domain is the distance from the centre-line inside which 95 % of the EXCESS flooded share
  of the training events lies: excess(d) = flooded share of cells at distance d (1 km rings) minus the background share far from the
  rivers (median share of the outer rings, 40-60 km). Beyond it, flooding is no more frequent than far from any river (rain ponding,
  hill torrents): the riverine model does not draw there.
Target per zone and event: area matching. zone = cells of one forecast reach inside the domain and the event's survey frame;
  h_obs = the height above the river below which as many zone cells lie as the event flooded in that zone (empirical quantile).
Driver: x = ln(Qpeak / Q2): Qpeak = the model's highest daily flow at the reach's served cell, 1 Jul - 15 Oct of the event year;
  Q2 = median of the annual maxima to 2024 (the 2-year flow; 2025 excluded). v283.10: the flow is the SERVED series (provider API at
  the snapped reach cells, as the live forecast this is applied to; station-lake/archive/glofas/glofas_served_gmt_daily.csv.gz,
  GLOFAS_SERVED overrides; record from 1997), not the station file glofas_irsa_daily.csv.gz (1991 on; other cells at Tarbela,
  Balloki and Sidhnai; another product from 2023-08-05, i.e. the whole 2025 test season). FX_FLOW_SERIES=<station file> reproduces
  the v283.9 fit for evidence.
  The same x is computed from the live ensemble forecast (q10 / median / q90 per day).
Models (fitted on the training events only):
  B0 fixed   one national h (pooled area matching): the fixed-HAND baseline
  B1 reach   one h per reach (mean of its training h_obs): reach climatology, no flow
  B2 JRC     JRC / GloFAS river flood hazard map (undefended, v2.1.2): wet at the return period chosen on training by area matching
             (only when all tiles listed in data/flood-depth/index.json are installed; FX_JRC_DIR overrides the folder)
  M1 pooled  h = a + b x
  M2 reach   h = a_reach + b x (reach intercepts, one slope)
  The candidate (M1 or M2) is chosen by leave-one-event-out CSI inside the training events; b must be > 0 (more flow, wider water),
  otherwise the flow term is not supported and the candidate is not served.
Test: 2025 (held out). CSI, hit rate (POD), false-alarm ratio, false-alarm and missed area (km2), area bias; 95 % interval of the
  CSI gain over B0 by bootstrap over reach zones. SERVE only if the chosen model beats B0 on 2025 with the CSI-gain lower bound > 0
  AND beats B1 on CSI.
Writes data/flood-extent/fx-model.json (model + evidence) and WORK/fx_cal_report.json.
"""
import os, json, math, datetime
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
APPD = os.environ.get('WS9_APP', os.path.join(HERE, '..', '..', '..', 'data'))
WORK = os.environ.get('WS9_WORK') or os.path.join(__import__('tempfile').gettempdir(), 'nigraan_flood_work')
_NIG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..'))   # the nig folder (station-lake beside nigraan-local)
UP = os.environ.get('WS9_UP') or (_NIG if os.path.isdir(os.path.join(_NIG, 'station-lake')) else '/mnt/user-data/uploads/NIGRAAN/nig')
TRAIN, TEST = [2010, 2014, 2022], 2025
RNG = np.random.default_rng(2025)


def load():
    """everything as 1-D arrays over the candidate cells (finite height, a reach, within the storage cap): light and fast"""
    meta = json.load(open(os.path.join(WORK, 'fx_meta.json')))
    Z = np.load(os.path.join(WORK, 'fx_terrain.npz'))
    rem2 = Z['rem']; shape = rem2.shape
    keep = np.isfinite(rem2) & (Z['reach'] != 255)
    flat = np.flatnonzero(keep)
    rr, cc = np.divmod(flat, shape[1])
    lat = meta['north'] - (meta['r0'] + rr + 0.5) * meta['cell']; lon = meta['west'] + (meta['c0'] + cc + 0.5) * meta['cell']
    C = dict(flat=flat, shape=shape, rem=rem2.ravel()[flat].astype(np.float32), reach=Z['reach'].ravel()[flat], dist=Z['dist'].ravel()[flat],
             lat=lat, lon=lon, area=(meta['cell'] * 111.32 * np.cos(np.radians(lat)) * meta['cell'] * 110.57))
    del rem2
    C['obs'] = {y: np.load(os.path.join(WORK, 'fx_obs_%d.npy' % y)).ravel()[flat] for y in TRAIN + [TEST]}
    C['frame'] = {y: (lon >= meta['frames'][str(y)][0]) & (lon <= meta['frames'][str(y)][2]) & (lat >= meta['frames'][str(y)][1]) & (lat <= meta['frames'][str(y)][3]) for y in TRAIN + [TEST]}
    return C, meta


def jrc_depth(lat, lon, jdir):
    """JRC / Copernicus GloFAS river flood hazard map v2.1.2 (data/flood-depth, packed by jrc_flood_depth.py): water depth (dm) per return
    period at the 3 arc-second cell holding each 250 m cell centre (the same centre rule as the observed-extent rasterisation).
    Returns (uint8 [n, nRP], return periods). A 1-degree cell not in the index is dry (the packer wrote only tiles with wet cells)."""
    import zlib as _z
    IX = json.load(open(os.path.join(jdir, 'index.json'))); G = IX['grid']; RPS = IX['returnPeriods']; N = G['cellsPerDegree']; B = G['block']
    out = np.zeros((len(lat), len(RPS)), np.uint8)
    row = np.floor((G['top'] - lat) * N).astype(np.int64); col = np.floor((lon - G['left']) * N).astype(np.int64)
    cr, cc = row // N, col // N
    key = cr * 1000 + cc
    order = np.argsort(key, kind='stable'); ks = key[order]
    bounds = np.flatnonzero(np.diff(ks)) + 1
    missing = []
    for grp in np.split(order, bounds):
        r0, c0 = int(cr[grp[0]]), int(cc[grp[0]])
        name = 'jrc_N%d_E%d.bin' % (G['top'] - r0, G['left'] + c0)
        if name not in IX['files']: continue
        fp = os.path.join(jdir, name)
        if not os.path.exists(fp): missing.append(name); continue
        b = open(fp, 'rb').read(); assert b[:4] == b'AGNJ'
        nrp = b[5]; nb = int.from_bytes(b[6:8], 'little')
        lr = row[grp] - r0 * N; lc = col[grp] - c0 * N; bi = lr // B; bj = lc // B; k = bi * nb + bj
        for kk in np.unique(k):
            o = int.from_bytes(b[8 + 8 * kk:12 + 8 * kk], 'little'); l = int.from_bytes(b[12 + 8 * kk:16 + 8 * kk], 'little')
            if not l: continue
            a = np.frombuffer(_z.decompress(b[o:o + l]), np.uint8).reshape(nrp, B, B)
            sel = grp[k == kk]; rr = row[sel] - r0 * N - (kk // nb) * B; ccl = col[sel] - c0 * N - (kk % nb) * B
            out[sel] = a[:, rr, ccl].T
    return out, RPS, missing


SERVED = os.environ.get('GLOFAS_SERVED') or os.path.join(UP, 'station-lake/archive/glofas/glofas_served_gmt_daily.csv.gz')   # v283.10 part 3: the GMT served frame


def flow_series():
    """(model flow m3/s, legacy): the served series (columns = reach ids) or, with FX_FLOW_SERIES, the station file (legacy)"""
    G = pd.read_csv(os.environ.get('FX_FLOW_SERIES') or SERVED, index_col=0, parse_dates=True)
    return G, 'Kala Bagh' in G.columns


def flows(meta):
    G, legacy = flow_series()
    out = {}
    for rid, col0 in meta['col'].items():
        col = col0 if legacy else rid
        if col not in G.columns: continue
        s = G[col]; am = s.groupby(s.index.year).max(); n = s.groupby(s.index.year).count()
        am = am[(n >= 350) & (am.index <= 2024)]
        q2 = float(am.median())
        pk = {}
        for y in TRAIN + [TEST]:
            w = s[(s.index >= '%d-07-01' % y) & (s.index <= '%d-10-15' % y)]
            pk[y] = float(w.max()) if w.notna().sum() >= 90 else None
        out[rid] = dict(col=col, q2=q2, q2Years=int(len(am)), peak=pk)
    return out


def scores(pred, obs, area):
    h = (pred & obs); m = (~pred & obs); f = (pred & ~obs)
    H, M, F = float(area[h].sum()), float(area[m].sum()), float(area[f].sum())
    return dict(hitKm2=round(H), missKm2=round(M), falseKm2=round(F), csi=H / (H + M + F) if H + M + F else None,
                pod=H / (H + M) if H + M else None, far=F / (H + F) if H + F else None, areaBias=(H + F) / (H + M) if H + M else None)


def main():
    C, meta = load()
    rem, reach, dist, A, O, F = C['rem'], C['reach'], C['dist'], C['area'], C['obs'], C['frame']
    ids = meta['reaches']
    # ---- domain from data ----
    ring = np.floor(dist).astype(np.int16)
    sh = []
    for d in range(0, int(meta['capKm'])):
        tot = fl = 0.0
        for y in TRAIN:
            m = F[y] & (ring == d)
            tot += m.sum(); fl += (m & O[y]).sum()
        sh.append(fl / tot if tot else np.nan)
    sh = np.array(sh); bg = float(np.nanmedian(sh[40:60]))
    ex = np.clip(sh - bg, 0, None); cum = np.nancumsum(ex) / np.nansum(ex)
    DMAX = int(np.argmax(cum >= 0.95)) + 1
    print('flooded share by ring (km):', ' '.join('%d:%.3f' % (d, v) for d, v in enumerate(sh[:60]) if d % 3 == 0), 'bg', round(bg, 4), 'DMAX', DMAX)
    dom = dist < DMAX
    Q = flows(meta)
    # the reaches the river model represents (the rule flood.mjs / riverprob.mjs / floodextent.mjs apply): only these are fitted and tested
    RR = json.load(open(os.path.join(APPD, 'river-rarity.json')))['reaches']
    def represented(rid):
        r = RR.get(rid) or {}
        return not (r.get('fitRefused') or r.get('modelRepresentsRiver') is False or 'under-call' in str((r.get('gaugeCheck') or {}).get('verdict') or ''))
    WITHHELD = sorted(r for r in Q if not represented(r))
    print('withheld by the representativeness rule:', WITHHELD)
    Q = {k: v for k, v in Q.items() if k not in WITHHELD}
    JDIR = os.environ.get('FX_JRC_DIR') or os.path.join(APPD, 'flood-depth')
    JRC = None
    try:
        IXJ = json.load(open(os.path.join(JDIR, 'index.json')))
        if all(os.path.exists(os.path.join(JDIR, f)) for f in IXJ['files']):
            di = np.flatnonzero(dom); jd, RPS, miss = jrc_depth(C['lat'][di], C['lon'][di], JDIR)
            JRC = np.zeros((len(rem), len(RPS)), np.uint8); JRC[di] = jd; del jd
            print('JRC return-period maps read for', len(di), 'domain cells; RPs', RPS)
        else: print('JRC baseline not assessed: tiles missing', sum(not os.path.exists(os.path.join(JDIR, f)) for f in IXJ['files']), 'of', len(IXJ['files']))
    except FileNotFoundError: print('JRC baseline not assessed: no index')
    # ---- targets ----
    rows = []
    for y in TRAIN + [TEST]:
        for k, rid in enumerate(ids):
            if rid not in Q or Q[rid]['peak'].get(y) is None: continue
            z = dom & (reach == k) & F[y]
            n = int(z.sum())
            if n < 200: continue    # fewer than about 15 km2 of the zone inside the survey frame
            # zone must be mostly inside the frame
            if n < 0.5 * int((dom & (reach == k)).sum()): continue
            v = np.sort(rem[z]); nf = int((z & O[y]).sum())
            h_obs = float(v[min(len(v) - 1, max(0, nf - 1))]) if nf > 0 else float(v[0])
            rows.append(dict(year=y, reach=rid, k=k, n=n, nflood=nf, share=nf / n, h_obs=h_obs,
                             x=math.log(Q[rid]['peak'][y] / Q[rid]['q2']), qpeak=Q[rid]['peak'][y], q2=Q[rid]['q2']))
    T = pd.DataFrame(rows)
    print(T.to_string())
    tr = T[T.year.isin(TRAIN)]

    def robust(X, y, w):
        # Huber regression (epsilon 1.35, the standard 95 %-efficiency choice): zones with no flooded cell give a censored, often extreme
        # height (the lowest cell of the zone) and a gorge reach can give tens of metres; they must not steer the fit
        from sklearn.linear_model import HuberRegressor
        m = HuberRegressor(epsilon=1.35, alpha=0.0, fit_intercept=False, max_iter=2000).fit(X, y, sample_weight=w / w.mean())
        return m.coef_

    def fit(df, kind):
        w = df.n.values.astype(float)
        if kind == 'B0':   # pooled area matching: one h for all training zone-cells
            allv = []; nf = 0
            for r in df.itertuples():
                z = dom & (reach == r.k) & F[r.year]; allv.append(rem[z]); nf += r.nflood
            v = np.sort(np.concatenate(allv)); return dict(h=float(v[min(len(v) - 1, max(0, nf - 1))]))
        if kind == 'B2':   # JRC return-period map: the return period whose wet area best matches the observed training area (as B0)
            areas = np.zeros(len(RPS)); obs = 0.0; inter = np.zeros(len(RPS)); uni = np.zeros(len(RPS))
            for r in df.itertuples():
                z = dom & (reach == r.k) & F[r.year]; o = O[r.year][z]; a = A[z]; obs += a[o].sum()
                for i in range(len(RPS)):
                    p = JRC[z, i] > 0; areas[i] += a[p].sum(); inter[i] += a[p & o].sum(); uni[i] += a[p | o].sum()
            i = int(np.argmin(np.abs(areas - obs)))
            return dict(i=i, returnPeriod=RPS[i], rule='area matching on the training zone-events (as B0)',
                        trainAreaKm2={str(t): round(float(v)) for t, v in zip(RPS, areas)}, trainObservedKm2=round(float(obs)),
                        trainCsiByRP={str(t): round(float(inter[j] / uni[j]), 4) if uni[j] else None for j, t in enumerate(RPS)})
        if kind == 'B1':
            return dict(h={rid: float(np.average(g.h_obs, weights=g.n)) for rid, g in df.groupby('reach')},
                        h0=float(np.average(df.h_obs, weights=w)))
        if kind == 'M1':
            X = np.c_[np.ones(len(df)), df.x.values]
            b = robust(X, df.h_obs.values, w)
            res = df.h_obs.values - X @ b
            return dict(a=float(b[0]), b=float(b[1]), residSd=float(np.sqrt(np.average(res ** 2, weights=w))))
        if kind == 'M2':
            rs = sorted(df.reach.unique()); ix = {r: i for i, r in enumerate(rs)}
            X = np.zeros((len(df), len(rs) + 1)); X[np.arange(len(df)), [ix[r] for r in df.reach]] = 1; X[:, -1] = df.x.values
            b = robust(X, df.h_obs.values, w)
            a = {r: float(b[ix[r]]) for r in rs}; res = df.h_obs.values - X @ b
            # a reach with no training row takes the pooled intercept of M1 refitted with the same slope
            a0 = float(np.median(df.h_obs.values - b[-1] * df.x.values))
            return dict(a=a, a0=a0, b=float(b[-1]), residSd=float(np.sqrt(np.average(res ** 2, weights=w))))

    def h_of(model, kind, rid, x):
        if kind == 'B0': return model['h']
        if kind == 'B1': return model['h'].get(rid, model['h0'])
        if kind == 'M1': return model['a'] + model['b'] * x
        if kind == 'M2': return model['a'].get(rid, model['a0']) + model['b'] * x

    def predict_eval(model, kind, df, y):
        pred = np.zeros(rem.shape, bool); ev = np.zeros(rem.shape, bool); per = {}
        for r in df[df.year == y].itertuples():
            z = dom & (reach == r.k) & F[y]
            if kind == 'B2': p = z & (JRC[:, model['i']] > 0)
            else: h = h_of(model, kind, r.reach, r.x); p = z & (rem < h)
            pred |= p; ev |= z
            per[r.reach] = (p, z)
        return scores(pred[ev], O[y][ev], A[ev]), per

    # ---- inner leave-one-event-out among training events ----
    inner = {}
    for kind in ['B0', 'B1', 'M1', 'M2']:
        cs = []
        for y in TRAIN:
            m = fit(tr[tr.year != y], kind); s, _ = predict_eval(m, kind, tr, y); cs.append(s['csi'])
        inner[kind] = dict(csiByHeldOutEvent={str(y): round(c, 3) for y, c in zip(TRAIN, cs)}, mean=round(float(np.mean(cs)), 3))
    print('inner LOEO', inner)
    cand = max(['M1', 'M2'], key=lambda k: inner[k]['mean'])
    # ---- final fits on all training events, test on 2025 ----
    KS = ['B0', 'B1', 'M1', 'M2'] + (['B2'] if JRC is not None else [])
    models = {k: fit(tr, k) for k in KS}
    test = {}; pers = {}
    for k in KS:
        s, per = predict_eval(models[k], k, T, TEST); test[k] = {kk: (round(v, 4) if isinstance(v, float) else v) for kk, v in s.items()}; pers[k] = per
    # bootstrap over reach zones: CSI gain of the candidate over B0 and B1
    zs = sorted(pers[cand])
    sums = {}
    BS = ['B0', 'B1'] + (['B2'] if JRC is not None else [])
    for k in BS + [cand]:
        for rid in zs:
            p, z = pers[k][rid]; o = O[TEST]
            sums[(k, rid)] = (A[p & o].sum(), A[z & ~p & o].sum(), A[p & ~o].sum())
    def comp(k, zz):
        H = sum(sums[(k, r)][0] for r in zz); M = sum(sums[(k, r)][1] for r in zz); Fa = sum(sums[(k, r)][2] for r in zz)
        return H / (H + M + Fa) if H + M + Fa else 0
    G0, G1, G2 = [], [], []
    for _ in range(2000):
        zz = list(RNG.choice(zs, len(zs)))
        c = comp(cand, zz); G0.append(c - comp('B0', zz)); G1.append(c - comp('B1', zz))
        if JRC is not None: G2.append(c - comp('B2', zz))
    gain = dict(vsB0=[round(float(np.mean(G0)), 4), round(float(np.quantile(G0, 0.025)), 4), round(float(np.quantile(G0, 0.975)), 4)],
                vsB1=[round(float(np.mean(G1)), 4), round(float(np.quantile(G1, 0.025)), 4), round(float(np.quantile(G1, 0.975)), 4)])
    if JRC is not None: gain['vsB2'] = [round(float(np.mean(G2)), 4), round(float(np.quantile(G2, 0.025)), 4), round(float(np.quantile(G2, 0.975)), 4)]
    else: gain['vsB2'] = 'not assessed: JRC return-period map tiles not all installed'
    perReach = {}
    for rid in zs:
        o = O[TEST]; row = {}
        for k in BS + [cand]:
            p, z = pers[k][rid]; row[k] = scores(p[z], o[z], A[z])
            row[k] = {kk: (round(v, 3) if isinstance(v, float) else v) for kk, v in row[k].items()}
        perReach[rid] = row
    why = []
    if models[cand]['b'] <= 0: why.append('flow slope b <= 0: more flow does not widen the water in the training events')
    if not gain['vsB0'][1] > 0: why.append('CSI gain over the fixed-height baseline on 2025: lower 95 % bound <= 0')
    if not (test[cand]['csi'] or 0) > (test['B1']['csi'] or 0): why.append('2025 CSI not above the per-reach fixed height (no flow)')
    if JRC is not None and not gain['vsB2'][1] > 0: why.append('CSI gain over the GloFAS return-period flood map on 2025: lower 95 % bound <= 0')
    served = not why
    print('TEST 2025', json.dumps(test, indent=0)); print('gain', gain, 'cand', cand, 'served', served, why)
    rp = {}
    for rid in ids:
        if rid not in Q: continue
        k = ids.index(rid); zc = dom & (reach == k)
        v = np.sort(rem[zc]); av = A[zc][np.argsort(rem[zc])]
        rp[rid] = dict(col=Q[rid]['col'], q2=round(Q[rid]['q2'], 1), q2Years=Q[rid]['q2Years'], domainCells=int(zc.sum()),
                       domainKm2=round(float(A[zc].sum())), trainRows=int((tr.reach == rid).sum()),
                       # area lookup: km2 flooded when the water stands h metres above the river (h at 0.5 m steps)
                       areaLookup=dict(hM=[x / 2 for x in range(-10, 61)], km2=[round(float(av[:np.searchsorted(v, x / 2)].sum()), 1) for x in range(-10, 61)]))
    M = dict(version='fx-283.1', built=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5))).strftime('%Y-%m-%d %H:%M PKT'),
             productType='Indicative', served=served, why=why, chosen=cand, heightBasis=meta['band'],
             heightBasisText=('height above the mapped major river from the 250 m terrain grid (relative elevation, nearest centre-line bed)'
                              if meta['band'] == 't_elev' else 'national 30 m HAND (p10 per 250 m cell)'),
             domainKm=DMAX, domainRule='95 %% of the excess flooded share of 2010/2014/2022 over the background share at 40-60 km (%.4f)' % float(bg),
             flooredShareByKm=[None if not np.isfinite(v) else round(float(v), 4) for v in sh],
             withheldReaches=WITHHELD, analysis='second pass: first pass (all reaches, weighted least squares) is recorded in EVIDENCE.md',
             models={k: models[k] for k in KS}, innerLOEO=inner, test2025=test, csiGain2025=gain,
             perReach2025=perReach, targets=T.drop(columns=['k']).round(4).to_dict('records'), reaches=rp,
             method=__doc__, train=TRAIN, heldOut=TEST,
             limits='river floods on the mapped major rivers only; no embankments, breaches, drains or rain ponding; about 250 m cells; '
                    'the observed extents mix river and rain flooding; the test uses the model flow of the flood season (observed weather), '
                    'so a forecast adds the weather-forecast error. Indicative: never an official flood warning.')
    os.makedirs(os.path.join(APPD, 'flood-extent'), exist_ok=True)
    json.dump(M, open(os.path.join(APPD, 'flood-extent', 'fx-model.json'), 'w'), indent=1, default=float)
    json.dump(dict(dom=DMAX, test=test, gain=gain, inner=inner), open(os.path.join(WORK, 'fx_cal_report.json'), 'w'), indent=1)
    full = np.zeros(int(np.prod(C['shape'])), bool); full[C['flat'][dom]] = True
    np.save(os.path.join(WORK, 'fx_domain.npy'), full.reshape(C['shape']))


if __name__ == '__main__':
    main()
