#!/usr/bin/env python3
"""aq41 step 2 - fit, grouped spatial CV (leave-station-out by 2 km clusters, leave-whole-city-out), gate and 1 km grid of the
PM2.5 spatial downscaling factor (rules: data/evidence/aq41/AQ41_RULES_20261031.json).
usage: python -I aq41_fit.py --work <dir with aq40_table.parquet> --grid <grid.npz> --tree <nigraan tree> --out <evidence dir> [--grid-out <npz>]"""
import os, sys, json, hashlib, argparse, datetime as dt, numpy as np, pandas as pd, lightgbm as lgb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aq40_fit as A40  # served chain reproduction, scores, day-block bootstrap (unchanged)

W0, N0, C1, NC, NR = 60.75, 37.25, 0.01, 1725, 1375
SEAS = {10: 'smog', 11: 'smog', 12: 'smog', 1: 'smog', 2: 'smog'}
FEAT = ['built1', 'built_c', 'lpop1', 'lpop_c', 'tree1', 'crop1', 'bare1', 'ndvi', 'elev_c', 'elev1', 'wdist', 'coast', 'kiln5', 'kiln15', 'ind10',
        'waste5', 'road1', 'road3', 'no2', 'no2_c', 'is_smog']
MONO = {'kiln5': 1, 'kiln15': 1, 'ind10': 1, 'road1': 1, 'road3': 1, 'no2_c': 1, 'built_c': 1, 'tree1': -1}
PRM = dict(objective='l2', num_leaves=7, learning_rate=0.03, min_data_in_leaf=15, lambda_l2=10.0, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1,
           verbose=-1, num_threads=2, seed=20261031, deterministic=True, force_row_wise=True, monotone_constraints=[MONO.get(f, 0) for f in FEAT],
           monotone_constraints_method='advanced')
ROUNDS = 300; MIN_DAYS = 20


def cell_rc(lat, lon):
    return np.clip(((N0 - np.asarray(lat)) / C1).astype(int), 0, NR - 1), np.clip(((np.asarray(lon) - W0) / C1).astype(int), 0, NC - 1)


def season_feats(G, r, c, s):
    o = {k: G[k][r, c] for k in FEAT if k in G}
    o['ndvi'] = G['ndvi_' + s][r, c]; o['no2'] = G['no2_' + s][r, c]; o['no2_c'] = G['no2c_' + s][r, c]
    o['is_smog'] = np.full(np.shape(r), 1.0 if s == 'smog' else 0.0); return o


def clusters(S, km=2.0):
    lat, lon = S.lat.values, S.lon.values; n = len(S); par = list(range(n))
    def f(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for i in range(n):
        d = 6371 * np.hypot(np.radians(lat - lat[i]), np.radians(lon - lon[i]) * np.cos(np.radians(lat[i])))
        for j in np.where((d <= km) & (np.arange(n) > i))[0]: par[f(i)] = f(j)
    root = np.array([f(i) for i in range(n)]); ids = S.station_id.astype(str).values
    rep = {r: min(ids[root == r]) for r in set(root)}; return np.array([rep[r] for r in root])


def fit(Y):
    d = lgb.Dataset(Y[FEAT].astype('float32'), Y.target.values, weight=np.sqrt(Y.n.values))
    m = lgb.train(PRM, d, ROUNDS); lo, hi = np.percentile(np.exp(Y.target.values), [2.5, 97.5]); return m, float(lo), float(hi)


def pred(M, X):
    m, lo, hi = M; return np.clip(np.exp(m.predict(X[FEAT].astype('float32'))), lo, hi)


def gate_region(g, col):
    sc = {c: A40.scores(g.truth.values, g[c].values) for c in ('served', col)}
    r = dict(stations=int(g.station_id.nunique()), days=int(g.date.nunique()), maeServed=sc['served']['mae'], maeLayer=sc[col]['mae'],
             biasServed=sc['served']['bias'], biasLayer=sc[col]['bias'], unhealthyObs=sc[col]['unhealthyObs'], pssServed=sc['served']['pss'], pssLayer=sc[col]['pss'],
             podServed=sc['served']['pod'], podLayer=sc[col]['pod'], farServed=sc['served']['far'], farLayer=sc[col]['far'])
    r['eligible'] = r['unhealthyObs'] >= 20
    if r['eligible']:
        h = g[['date', 'truth', 'served', col]].rename(columns={col: 'model'}); bt = A40.boot(h, ['model', 'served'])['served']
        r.update(dMae=bt['dMae'], dMaeLo=bt['dMaeLo'], dMaeHi=bt['dMaeHi'], dPss=bt['dPss'], dPssLo=bt['dPssLo'], dPssHi=bt['dPssHi'])
        r['pass'] = bool(bt['dMaeLo'] > 0 and bt['dPssHi'] >= 0)
    else:
        r['pass'] = None
    return r


def main():
    ap = argparse.ArgumentParser()
    for k in ('work', 'grid', 'tree', 'out'): ap.add_argument('--' + k, required=True)
    ap.add_argument('--grid-out', default=None)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    G = dict(np.load(a.grid))
    T = A40.feats(pd.read_parquet(os.path.join(a.work, 'aq40_table.parquet')))
    S = pd.read_parquet(os.path.join(a.work, 'aq40_stations.parquet'))
    T['lat_st'] = T.station_id.map(S.set_index('station_id').lat); T['lon_st'] = T.station_id.map(S.set_index('station_id').lon)
    sp = os.path.join(a.work, 'aq41_served.parquet')
    if os.path.exists(sp):
        V = pd.read_parquet(sp); T = T.merge(V, on=['station_id', 'date'])
    else:
        T = T.reset_index(drop=True); T['served'], T['servedBasis'] = A40.served(T, a.tree, a.work); T[['station_id', 'date', 'served', 'servedBasis']].to_parquet(sp, index=False)
    T = T[(T.served > 0) & (T.truth > 0)].copy()
    T['season'] = pd.to_datetime(T.date).dt.month.map(lambda m: SEAS.get(m, 'rest'))
    T['lr'] = np.log(T.truth / T.served)
    S['cluster'] = clusters(S); S['fold'] = S.cluster.map(lambda c: int(hashlib.sha1(str(c).encode()).hexdigest()[:8], 16) % 10)
    r, c = cell_rc(S.lat.values, S.lon.values); S['r'] = r; S['c'] = c
    # station-season targets and features
    Y = T.groupby(['station_id', 'season']).agg(target=('lr', 'mean'), n=('lr', 'size')).reset_index(); Y = Y[Y.n >= MIN_DAYS]
    Y = Y.merge(S[['station_id', 'region', 'cluster', 'fold', 'r', 'c']], on='station_id')
    for s in ('smog', 'rest'):
        m = Y.season == s; F = season_feats(G, Y.r.values[m], Y.c.values[m], s)
        for k, v in F.items(): Y.loc[m, k] = v
    R = dict(run=dt.datetime.now(dt.timezone(dt.timedelta(hours=5))).strftime('%Y-%m-%d %H:%M PKT'), rules='data/evidence/aq41/AQ41_RULES_20261031.json',
             rows=int(len(T)), stations=int(T.station_id.nunique()), stationSeasons=int(len(Y)), clusters=int(S.cluster.nunique()),
             servedBasis=T.servedBasis.value_counts().to_dict(), targetPct={p: float(np.percentile(np.exp(Y.target), p)) for p in (2.5, 10, 50, 90, 97.5)},
             featureMissing={k: float(Y[k].isna().mean()) for k in FEAT})
    print('rows', len(T), 'station-seasons', len(Y), 'clusters', R['clusters'], 'target pct', R['targetPct'], flush=True)
    # LSO
    Y['f_lso'] = np.nan
    for k in range(10):
        tr, te = Y[Y.fold != k], Y[Y.fold == k]
        if len(te): Y.loc[te.index, 'f_lso'] = pred(fit(tr), te)
    # LCO
    Y['f_lco'] = np.nan
    for rg in sorted(Y.region.unique()):
        tr, te = Y[Y.region != rg], Y[Y.region == rg]; Y.loc[te.index, 'f_lco'] = pred(fit(tr), te)
    # diagnostic (amendment 2, reported, not the gate): one constant factor per season from the same training folds (no spatial pattern)
    def scal(tr, te):
        w = np.sqrt(tr.n.values); m = {s: np.exp(np.average(tr.target.values[tr.season.values == s], weights=w[tr.season.values == s])) for s in ('smog', 'rest')}
        return te.season.map(m).values
    Y['s_lso'] = np.nan; Y['s_lco'] = np.nan
    for k in range(10):
        tr, te = Y[Y.fold != k], Y[Y.fold == k]
        if len(te): Y.loc[te.index, 's_lso'] = scal(tr, te)
    for rg in sorted(Y.region.unique()):
        tr, te = Y[Y.region != rg], Y[Y.region == rg]; Y.loc[te.index, 's_lco'] = scal(tr, te)
    T = T.merge(Y[['station_id', 'season', 'f_lso', 'f_lco', 's_lso', 's_lco']], on=['station_id', 'season'], how='inner')
    T['lso'] = T.served * T.f_lso; T['lco'] = T.served * T.f_lco; T['slso'] = T.served * T.s_lso; T['slco'] = T.served * T.s_lco
    out = {}
    for rg, g in list(T.groupby('region')) + [('ALL', T)]:
        o = dict(LSO=gate_region(g, 'lso'), LCO=gate_region(g, 'lco'))
        o['pass'] = bool(o['LSO']['pass'] and o['LCO']['pass']) if o['LSO']['eligible'] else None
        for nm, lay, sc in (('LSO', 'lso', 'slso'), ('LCO', 'lco', 'slco')):   # layer vs the constant factor (does the 1 km pattern add to a level shift?)
            o[nm]['maeConstFactor'] = float(np.mean(np.abs(g[sc] - g.truth)))
            if o['LSO']['eligible']:
                h = g[['date', 'truth', lay, sc]].rename(columns={lay: 'model', sc: 'const'}); bt = A40.boot(h, ['model', 'const'])['const']
                o[nm]['vsConst'] = dict(dMae=bt['dMae'], dMaeLo=bt['dMaeLo'], dMaeHi=bt['dMaeHi'], dPssHi=bt['dPssHi'])
        for s, gs in g.groupby('season'):
            o['season_' + s] = dict(rows=int(len(gs)), maeServed=float(np.mean(np.abs(gs.served - gs.truth))), maeLSO=float(np.mean(np.abs(gs.lso - gs.truth))),
                                     maeLCO=float(np.mean(np.abs(gs.lco - gs.truth))))
        out[rg] = o
        print(rg, o['LSO']['stations'], 'st unh', o['LSO']['unhealthyObs'], 'served', round(o['LSO']['maeServed'], 1), 'LSO', round(o['LSO']['maeLayer'], 1), round(o['LSO'].get('dMaeLo', np.nan), 2),
              round(o['LSO'].get('dPssHi', np.nan), 3), '| LCO', round(o['LCO']['maeLayer'], 1), round(o['LCO'].get('dMaeLo', np.nan), 2), round(o['LCO'].get('dPssHi', np.nan), 3), 'pass', o['pass'], '| const LSO', round(o['LSO']['maeConstFactor'], 1), round(o['LSO'].get('vsConst', {}).get('dMaeLo', np.nan), 2), 'LCO', round(o['LCO']['maeConstFactor'], 1), round(o['LCO'].get('vsConst', {}).get('dMaeLo', np.nan), 2), flush=True)
    R['regions'] = out; R['passRegions'] = [k for k, v in out.items() if k != 'ALL' and v['pass']]
    # final model, importance, plausibility
    FM = fit(Y); imp = dict(zip(FEAT, FM[0].feature_importance('gain'))); tot = sum(imp.values()) or 1
    R['final'] = dict(clip=[FM[1], FM[2]], gainShare={k: round(float(v / tot), 3) for k, v in sorted(imp.items(), key=lambda x: -x[1])})
    pdp = {}
    for f in ('kiln5', 'kiln15', 'ind10', 'road1', 'road3', 'built1', 'built_c', 'lpop1', 'tree1', 'no2_c', 'elev_c', 'bare1', 'crop1'):
        q = np.nanpercentile(Y[f], [10, 90]); X0 = Y[FEAT].copy(); X0[f] = q[0]; X1 = Y[FEAT].copy(); X1[f] = q[1]
        pdp[f] = dict(p10=float(q[0]), p90=float(q[1]), factorChange=float(np.mean(np.exp(FM[0].predict(X1.astype('float32')))) / np.mean(np.exp(FM[0].predict(X0.astype('float32')))) - 1))
    R['final']['partialDependence_p10_to_p90'] = pdp
    print('gain', R['final']['gainShare']); print('pdp', {k: round(v['factorChange'], 3) for k, v in pdp.items()}); print('pass', R['passRegions'], flush=True)
    json.dump(R, open(os.path.join(a.out, 'aq41_result.json'), 'w'), indent=1, default=str)
    Y.to_parquet(os.path.join(a.work, 'aq41_station_seasons.parquet'), index=False)
    if a.grid_out:
        mask = G['mask']; rr, cc = np.where(mask); res = {}
        for s in ('smog', 'rest'):
            X = pd.DataFrame(season_feats(G, rr, cc, s)); f = np.full((NR, NC), np.nan, 'float32'); f[rr, cc] = pred(FM, X); res[s] = f
        np.savez(a.grid_out, smog=res['smog'], rest=res['rest'], clip=np.array([FM[1], FM[2]]))
        FM[0].save_model(a.grid_out.replace('.npz', '.lgb.txt'))
        print('grid written', {s: (float(np.nanpercentile(v, 1)), float(np.nanmedian(v)), float(np.nanpercentile(v, 99))) for s, v in res.items()})


if __name__ == '__main__':
    main()
