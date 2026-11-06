#!/usr/bin/env python3
"""aq40 step 2 - candidates, choice, test and gate for the PM2.5 model (rules: data/evidence/aq40/AQ_RULES_20261031.json).
usage: python -I aq40_fit.py --work <dir with aq40_table.parquet> --tree <nigraan tree> --out <evidence dir>"""
import os, sys, json, subprocess, argparse, datetime as dt, numpy as np, pandas as pd, lightgbm as lgb

FE = ['lcams', 'ldust', 't_mean', 'dtr', 'rh_mean', 'wind_mean', 'lvent', 'lblh_min', 'rain', 'doy_s', 'doy_c', 's_built10', 'p_pop', 't_elev', 'kiln10', 'kiln30']
LIN = ['lcams', 'ldust', 't_mean', 'dtr', 'rh_mean', 'wind_mean', 'rain', 'doy_s', 'doy_c', 's_built10', 'p_pop', 't_elev', 'kiln10', 'kiln30']
NOBLH = [f for f in FE if f not in ('lvent', 'lblh_min')]
MONO = {'lcams': 1, 'lvent': -1, 'wind_mean': -1, 'rain': -1}
PRM = dict(objective='l2', learning_rate=0.05, num_leaves=15, min_data_in_leaf=50, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1,
           lambda_l2=1.0, verbose=-1, num_threads=2, seed=20261031, deterministic=True, force_row_wise=True)
UNH = 55.5
TRAIN = ('2022-08-01', '2025-06-30'); VAL = ('2024-10-01', '2025-02-28'); TEST = ('2025-10-01', '2026-02-28')


def feats(T):
    T = T.copy(); d = pd.to_datetime(T.date); doy = d.dt.dayofyear
    T['lcams'] = np.log(T.cams_pm2_5.clip(lower=0.1)); T['ldust'] = np.log1p(T.cams_dust.clip(lower=0))
    T['lvent'] = np.log(T.vent_aft.where(T.vent_aft > 0)); T['lblh_min'] = np.log(T.blh_min.where(T.blh_min > 0))
    T['doy_s'] = np.sin(2 * np.pi * doy / 365.25); T['doy_c'] = np.cos(2 * np.pi * doy / 365.25)
    return T


def trunc(v):
    return np.floor(np.asarray(v, float) * 10 + 1e-9) / 10


class Lin:
    def __init__(self, cols): self.cols = cols

    def fit(self, X, y):
        ok = X[self.cols].notna().all(1).values; A = np.column_stack([np.ones(ok.sum()), X.loc[ok, self.cols].values])
        self.b, *_ = np.linalg.lstsq(A, y[ok], rcond=None); return self

    def predict(self, X):
        A = np.column_stack([np.ones(len(X)), X[self.cols].values]); return A @ self.b


def gbm(cols, Xtr, ytr, Xva=None, yva=None, rounds=None):
    P = dict(PRM, monotone_constraints=[MONO.get(c, 0) for c in cols], monotone_constraints_method='advanced')
    dtr = lgb.Dataset(Xtr[cols].astype('float32'), ytr, free_raw_data=False)
    if rounds is None:
        dva = lgb.Dataset(Xva[cols].astype('float32'), yva, reference=dtr)
        m = lgb.train(P, dtr, 1500, valid_sets=[dva], callbacks=[lgb.early_stopping(50, verbose=False)])
        return m, m.best_iteration
    return lgb.train(P, dtr, rounds), rounds


def served(T, tree, work):
    """the served chain of 283.38 at each row: per-city law within 30 km, else the national model in its domain, else CAMS"""
    C = json.load(open(os.path.join(tree, 'data', 'pm25-correction.json'))); N = json.load(open(os.path.join(tree, 'data', 'pm25-national.json')))
    reach = C['apply'].get('reachKm', 30); out = T.cams_pm2_5.values.astype(float).copy(); basis = np.array(['composition'] * len(T), dtype=object)
    lat, lon = T.lat_st.values, T.lon_st.values; best = np.full(len(T), None, dtype=object); bkm = np.full(len(T), np.inf)
    for name, S in C['sites'].items():
        k = np.hypot((lat - S['lat']) * 111.2, (lon - S['lon']) * 111.2 * np.cos(np.radians(lat)))
        m = (k <= reach) & (k < bkm); best[m] = name; bkm[m] = k[m]
    doy = pd.to_datetime(T.date).dt.dayofyear.values
    for i in np.where(best != None)[0]:
        S = C['sites'][best[i]]; b = S['coef']; sn, cs = np.sin(2 * np.pi * doy[i] / 365.25), np.cos(2 * np.pi * doy[i] / 365.25)
        out[i] = np.exp(b[0] + b[1] * np.log(T.cams_pm2_5.values[i]) + b[2] * sn + b[3] * cs) * S['smear']; basis[i] = 'monitor:' + best[i]
    dom = N['apply']['domain']
    nat = (best == None) & T.f_settle.isin(dom['f_settle']).values & (T.t_elev.values <= dom['t_elevMaxM']) & T[['cams_pm2_5', 'cams_pm10', 'cams_dust']].notna().all(1).values
    m = {'cams_' + c: 'cams_' + c for c in ['pm2_5', 'pm10', 'dust', 'aerosol_optical_depth', 'nitrogen_dioxide', 'carbon_monoxide', 'sulphur_dioxide', 'ozone']}
    m.update(wx_temperature_2m='t_mean', wx_relative_humidity_2m='rh_mean', wx_wind_speed_10m='wind_mean', wx_boundary_layer_height='blh_mean', wx_cloud_cover='cloud_mean',
             wx_blh_min='blh_min', wx_rain='rain', wx_sun='sun', doy_s='doy_s_srv', doy_c='doy_c_srv')
    T = T.copy(); T['doy_s_srv'] = np.sin(2 * np.pi * doy / 365.25); T['doy_c_srv'] = np.cos(2 * np.pi * doy / 365.25)
    fin, fout = os.path.join(work, 'srv_in.jsonl'), os.path.join(work, 'srv_out.jsonl'); idx = np.where(nat)[0]
    with open(fin, 'w') as f:
        for i in idx:
            x = [T[m.get(c, c)].values[i] for c in N['features']]
            f.write(json.dumps({'k': int(i), 'x': [None if (v is None or not np.isfinite(v)) else float(v) for v in x]}) + '\n')
    subprocess.run(['node', os.path.join(tree, 'scripts', 'tests28340', 'aq40_served.mjs'), tree, fin, fout], check=True)
    for line in open(fout):
        if line.strip():
            o = json.loads(line); out[o['k']] = o['v']; basis[o['k']] = 'national'
    return np.round(out, 1), basis


def scores(y, p):
    e = p - y; ou, fu = trunc(y) >= UNH, trunc(p) >= UNH
    h = int((ou & fu).sum()); mi = int((ou & ~fu).sum()); fa = int((~ou & fu).sum()); cn = int((~ou & ~fu).sum())
    pod = h / (h + mi) if h + mi else None; pofd = fa / (fa + cn) if fa + cn else None; far = fa / (h + fa) if h + fa else None
    return dict(n=int(len(y)), mae=float(np.mean(np.abs(e))), bias=float(np.mean(e)), unhealthyObs=int(ou.sum()), hits=h, misses=mi, falseAlarms=fa,
                pod=pod, far=far, pss=(pod - pofd) if pod is not None and pofd is not None else None)


def pss_fast(ou, fu):
    h = (ou & fu).sum(); mi = (ou & ~fu).sum(); fa = (~ou & fu).sum(); cn = (~ou & ~fu).sum()
    return (h / (h + mi) if h + mi else np.nan) - (fa / (fa + cn) if fa + cn else np.nan)


def boot(df, cols, B=2000, seed=20261031):
    """day-block bootstrap of MAE(base) - MAE(model) and PSS(model) - PSS(base)"""
    rng = np.random.default_rng(seed); days = df.date.values; ud, inv = np.unique(days, return_inverse=True)
    y = df.truth.values; ou = trunc(y) >= UNH
    E = {c: np.abs(df[c].values - y) for c in cols}; F = {c: trunc(df[c].values) >= UNH for c in cols}
    sumE = {c: np.bincount(inv, E[c], len(ud)) for c in cols}; cnt = np.bincount(inv, None, len(ud))
    res = {c: dict(dmae=[], dpss=[]) for c in cols if c != 'model'}
    rows_by_day = [np.where(inv == k)[0] for k in range(len(ud))]
    for _ in range(B):
        s = rng.integers(0, len(ud), len(ud)); w = np.bincount(s, None, len(ud)); n = (w * cnt).sum()
        mm = (w * sumE['model']).sum() / n
        ix = np.concatenate([np.repeat(rows_by_day[k], w[k]) for k in np.where(w > 0)[0]])
        pm = pss_fast(ou[ix], F['model'][ix])
        for c in res:
            res[c]['dmae'].append((w * sumE[c]).sum() / n - mm); res[c]['dpss'].append(pm - pss_fast(ou[ix], F[c][ix]))
    out = {}
    for c, r in res.items():
        a, b = np.array(r['dmae']), np.array(r['dpss'])
        out[c] = dict(dMae=float(np.mean(a)), dMaeLo=float(np.percentile(a, 5)), dMaeHi=float(np.percentile(a, 95)),
                      dPss=float(np.nanmean(b)), dPssLo=float(np.nanpercentile(b, 5)), dPssHi=float(np.nanpercentile(b, 95)))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--work', required=True); ap.add_argument('--tree', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--model-out', default=None)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    T = feats(pd.read_parquet(os.path.join(a.work, 'aq40_table.parquet')))
    S = pd.read_parquet(os.path.join(a.work, 'aq40_stations.parquet')).set_index('station_id')
    T['lat_st'] = T.station_id.map(S.lat); T['lon_st'] = T.station_id.map(S.lon)
    T['y'] = np.log(T.truth)
    tr = T[(T.date >= TRAIN[0]) & (T.date <= TRAIN[1]) & ~T.heldOut]
    va_m = (tr.date >= VAL[0]) & (tr.date <= VAL[1]); itr, iva = tr[~va_m], tr[va_m]
    R = dict(run=dt.datetime.now(dt.timezone(dt.timedelta(hours=5))).strftime('%Y-%m-%d %H:%M PKT'), rules='data/evidence/aq40/AQ_RULES_20261031.json',
             rows=dict(train=int(len(tr)), trainStations=int(tr.station_id.nunique()), innerFit=int(len(itr)), innerVal=int(len(iva)),
                       trainBlhShare=float(tr.lvent.notna().mean()), trainByTier=tr.groupby('train_tier').size().to_dict()))
    # candidates on the inner validation
    cand = {}
    L = Lin(LIN).fit(itr, itr.y.values); sm = float(np.nanmean(np.exp(itr.y.values - L.predict(itr))))
    p = np.exp(L.predict(iva)) * sm; ok = np.isfinite(p); cand['LIN'] = dict(valMae=float(np.mean(np.abs(p[ok] - iva.truth.values[ok]))), valN=int(ok.sum()))
    for nm, cols in (('GBM', FE), ('GBM_NOBLH', NOBLH)):
        m, it = gbm(cols, itr, itr.y.values, iva, iva.y.values); sm = float(np.mean(np.exp(itr.y.values - m.predict(itr[cols].astype('float32')))))
        p = np.exp(m.predict(iva[cols].astype('float32'))) * sm; cand[nm] = dict(valMae=float(np.mean(np.abs(p - iva.truth.values))), valN=int(len(iva)), rounds=int(it))
    camsVal = float(np.mean(np.abs(iva.cams_pm2_5.values - iva.truth.values)))
    choice = min(cand, key=lambda k: cand[k]['valMae']); R['candidates'] = cand; R['innerValCamsMae'] = camsVal; R['choice'] = choice
    print('candidates', json.dumps(cand), 'cams', round(camsVal, 2), '->', choice, flush=True)

    def fit_final(D):
        if choice == 'LIN':
            M = Lin(LIN).fit(D, D.y.values); s = float(np.nanmean(np.exp(D.y.values - M.predict(D)))); return ('LIN', M, s, LIN)
        cols = FE if choice == 'GBM' else NOBLH
        M, _ = gbm(cols, D, D.y.values, rounds=cand[choice]['rounds']); s = float(np.mean(np.exp(D.y.values - M.predict(D[cols].astype('float32'))))); return ('GBM', M, s, cols)

    def pred(F, X):
        k, M, s, cols = F
        return np.exp(M.predict(X) if k == 'LIN' else M.predict(X[cols].astype('float32'))) * s

    FM = fit_final(tr)
    te = T[(T.date >= TEST[0]) & (T.date <= TEST[1]) & T.heldOut].copy()
    te['model'] = pred(FM, te); te['cams'] = te.cams_pm2_5.values; te['served'], te['servedBasis'] = served(te, a.tree, a.work)
    te = te[np.isfinite(te.model)]
    R['test'] = dict(rows=int(len(te)), stations=int(te.station_id.nunique()), servedBasis=pd.Series(te.servedBasis).value_counts().to_dict())
    reg = {}
    for rg, g in list(te.groupby('region')) + [('ALL', te)]:
        sc = {c: scores(g.truth.values, g[c].values) for c in ('cams', 'served', 'model')}
        r = dict(stations=int(g.station_id.nunique()), days=int(g.date.nunique()), scores=sc, eligible=sc['model']['unhealthyObs'] >= 20)
        if r['eligible']:
            bt = boot(g, ['model', 'cams', 'served']); r['bootstrap'] = bt
            r['pass'] = bool(bt['cams']['dMaeLo'] > 0 and bt['served']['dMaeLo'] > 0 and bt['cams']['dPssHi'] >= 0 and bt['served']['dPssHi'] >= 0)
        else:
            r['pass'] = None
        reg[rg] = r
        print(rg, r['stations'], 'st', sc['model']['n'], 'rows unh', sc['model']['unhealthyObs'], {c: (round(sc[c]['mae'], 1), round(sc[c]['bias'], 1)) for c in sc}, 'pass', r['pass'],
              {c: (round(v['dMaeLo'], 2), round(v['dPssHi'], 3)) for c, v in r.get('bootstrap', {}).items()}, flush=True)
    R['regions'] = reg
    # secondary: region out (whole region removed from training)
    ro = {}
    for rg in sorted(te.region.unique()):
        D = tr[tr.region != rg]; F2 = fit_final(D)
        g = T[(T.date >= TEST[0]) & (T.date <= TEST[1]) & (T.region == rg)].copy(); g['model'] = pred(F2, g); g = g[np.isfinite(g.model)]
        if not len(g): continue
        ro[rg] = dict(stations=int(g.station_id.nunique()), trainRowsWithoutRegion=int(len(D)), cams=scores(g.truth.values, g.cams_pm2_5.values), model=scores(g.truth.values, g.model.values))
        print('region-out', rg, round(ro[rg]['cams']['mae'], 1), '->', round(ro[rg]['model']['mae'], 1), flush=True)
    R['regionOut'] = ro
    if FM[0] == 'GBM':
        imp = dict(zip(FM[3], [float(x) for x in FM[1].feature_importance('gain')])); R['gainShare'] = {k: round(v / sum(imp.values()), 3) for k, v in sorted(imp.items(), key=lambda x: -x[1])}
    R['passRegions'] = [k for k, v in reg.items() if k != 'ALL' and v['pass']]
    json.dump(R, open(os.path.join(a.out, 'aq40_result.json'), 'w'), indent=1, default=str)
    te[['station_id', 'date', 'region', 'truth', 'cams', 'served', 'servedBasis', 'model']].to_parquet(os.path.join(a.work, 'aq40_test_rows.parquet'), index=False)
    if a.model_out and R['passRegions']:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        json.dump(dict(kind=FM[0], features=FM[3], smear=FM[2], model=(dump(FM[1], FM[3]) if FM[0] == 'GBM' else dict(b=[float(x) for x in FM[1].b]))), open(a.model_out, 'w'))
    print('pass regions', R['passRegions'])


def dump(bst, cols, dec=6):
    J = bst.dump_model(); trees = []
    for ti in J['tree_info']:
        f, t, l, r, d, m, v = [], [], [], [], [], [], []
        def walk(n):
            i = len(f); f.append(-1); t.append(0.0); l.append(-1); r.append(-1); d.append(0); m.append(0); v.append(0.0)
            if 'split_feature' not in n: v[i] = round(float(n['leaf_value']), dec); return i
            assert n['decision_type'] == '<=', n['decision_type']
            f[i] = int(n['split_feature']); t[i] = float(n['threshold']); d[i] = 1 if n['default_left'] else 0
            m[i] = {'None': 0, 'Zero': 1, 'NaN': 2}[n['missing_type']]
            li = walk(n['left_child']); ri = walk(n['right_child']); l[i] = li; r[i] = ri
            return i
        walk(ti['tree_structure']); trees.append(dict(f=f, t=t, l=l, r=r, d=d, m=m, v=v))
    return dict(kind='lgb', features=list(cols), trees=trees, init=0.0)


if __name__ == '__main__':
    main()
