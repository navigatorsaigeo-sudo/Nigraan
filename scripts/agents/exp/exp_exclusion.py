#!/usr/bin/env python3
"""v91.17.283.10 . agent 6 . STATION EXCLUSION candidate (a station the diagnostic agent names as not representative).
Rule (RULES_20261101.json NONREP_stations, judged by the national_paired.py rule): champion = the national residual recipe trained WITH the
station(s); challenger = the same recipe trained WITHOUT them; both scored on the SAME held-out rows, which exclude the candidate stations.
Design   leave-cell-out: 0.5-degree cells -> 5 folds (crc32-balanced, as national_train.py / blend_r.py); for fold k both models are
         fitted on the OTHER folds' stations, alternate 14-day blocks blk 0 only, and scored on fold k's stations in blk 1 weeks (stations
         AND weeks unseen). Locked test points (test_locked.json) are never fitted and are scored as their own stratum; the current
         non-representative list (--nonrep) is never fitted and never scored.
Recipe   cand_height.py / national_train.py no-pool features and LightGBM parameters (seed 20261022), ROUNDS rounds (default 500).
Score    hourly MAE of T0 + residual; paired difference |champion error| - |challenger error|; two-way cluster bootstrap over stations x days
         (B = 1000, default_rng(20261022)).
Decision PROMOTE only if the overall 95 % lower bound > 0, AND every zone's and the locked stratum's lower bound > -max(0.05, 0.03 x MAE).
         If no candidate station is ever fitted by the champion (all are locked or already listed), the two models are the same fit:
         'no effect on the national fit', not promoted.
usage    python exp_exclusion.py <national dir> <out.json> --stations <pid>[,<pid>...] [--nonrep <json>] [--rounds N] [--B N]"""
import os, sys, json, zlib, argparse, time, numpy as np, pandas as pd

ap = argparse.ArgumentParser(); ap.add_argument('nd'); ap.add_argument('out'); ap.add_argument('--stations', required=True)
ap.add_argument('--nonrep', default=None); ap.add_argument('--rounds', type=int, default=500); ap.add_argument('--B', type=int, default=1000); a = ap.parse_args()
t0 = time.time()
CAND = [s for s in a.stations.split(',') if s]
FEATS = ['temperature_2m', 'dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'shortwave_radiation', 'precipitation', 'lat', 'lon', 'elev',
         'hs', 'hc', 'ds', 'dc', 'dep', 'wds', 'wdc', 'fc_dtr', 'fc_tmax', 'calm_clear', 't_elev', 't_slope', 't_aspect_sin', 't_aspect_cos',
         't_tpi300', 't_tpi1000', 't_valley_depth', 't_svf', 't_capp', 't_hand', 's_wc_tree', 's_wc_crop', 's_wc_built', 's_wc_bare',
         's_wc_water', 's_wc_snow', 's_built10', 'w_dist', 'c_pr_ann', 'relief', 'dz_cell', 's_ndvi', 's_ndmi', 'l_day', 'l_night',
         'l_day_anom', 'l_night_anom', 'c_tmax', 'c_tmin', 'capp_cc', 'vd_cc', 'cc_prev6', 'ws_prev6', 'sw_day', 'pr_prev72', 'dt3']
PAR = dict(learning_rate=0.05, num_leaves=63, min_data_in_leaf=300, feature_fraction=0.8, bagging_fraction=0.7, bagging_freq=1,
           lambda_l2=5.0, verbose=-1, num_threads=2, seed=20261022)
LOCK = set(json.load(open(os.path.join(a.nd, 'test_locked.json')))['points'])
NONREP = set(x['pid'] for x in json.load(open(a.nonrep))['stations']) if a.nonrep and os.path.exists(a.nonrep) else set()
NONREP -= set(CAND)
P = pd.read_csv(os.path.join(a.nd, 'points.csv'))
res = {'design': 'leave-cell-out 5 folds; fit blk-0 weeks of the other folds, score blk-1 weeks of the fold; champion WITH vs challenger WITHOUT the candidate stations',
       'stations': CAND, 'rounds': a.rounds, 'B': a.B}
known = set(P.pid)
res['unknownStations'] = [s for s in CAND if s not in known]
fitted = [s for s in CAND if s in known and s not in LOCK and s not in NONREP]
res['candidateStationsFittedByChampion'] = fitted
res['alreadyNeverFitted'] = {s: ('locked test point' if s in LOCK else 'already non-representative' if s in NONREP else 'not a national point') for s in CAND if s not in fitted}
if not fitted:
    res.update(promote=False, effect='none', why='no candidate station is fitted by the current recipe (locked, already listed or unknown): the champion and challenger are the same fit, so excluding them cannot change the national model')
    json.dump(res, open(a.out, 'w'), indent=1); print(res['why']); sys.exit(0)
T = pd.read_parquet(os.path.join(a.nd, 'table.parquet'), columns=['t', 'pid', 'obs', 'r', 'zone'] + FEATS)
for c in FEATS: T[c] = T[c].astype('float32')
T = T[~T.pid.isin(NONREP)]
T['blk'] = ((T.t - pd.Timestamp('2022-12-26', tz='UTC')).dt.days // 14) % 2
T['day'] = (T.t + pd.Timedelta(hours=5)).dt.date.astype(str)
n_st = T[T.blk == 0].groupby('pid').size(); T['w'] = T.pid.map(np.minimum(1.0, 4000.0 / n_st)).fillna(1.0).astype('float32')
cells = (np.floor(P.lat * 2).astype(int).astype(str) + '_' + np.floor(P.lon * 2).astype(int).astype(str)).values
cs = pd.Series(cells).value_counts(); load = [0] * 5; fold_of = {}
for c in sorted(sorted(cs.index, key=lambda c: zlib.crc32(c.encode())), key=lambda c: -cs[c]): k = int(np.argmin(load)); fold_of[c] = k; load[k] += cs[c]
FOLD = dict(zip(P.pid, [fold_of[c] for c in cells])); T['fold'] = T.pid.map(FOLD).fillna(-1).astype(int)
import lightgbm as lgb
parts = []
for k in range(5):
    base = (T.fold != k) & (T.fold >= 0) & (T.blk == 0) & ~T.pid.isin(LOCK)
    te = (T.fold == k) & (T.blk == 1) & ~T.pid.isin(CAND)
    if not te.any(): continue
    trc = base; trx = base & ~T.pid.isin(CAND)
    D = T.loc[te, ['pid', 'day', 'zone', 'obs', 'temperature_2m']].copy(); D['locked'] = D.pid.isin(LOCK)
    if (trc & T.pid.isin(CAND)).any():
        mc = lgb.train(dict(PAR, objective='l2'), lgb.Dataset(T.loc[trc, FEATS].values, T.loc[trc, 'r'].values, weight=T.loc[trc, 'w'].values), a.rounds)
        mx = lgb.train(dict(PAR, objective='l2'), lgb.Dataset(T.loc[trx, FEATS].values, T.loc[trx, 'r'].values, weight=T.loc[trx, 'w'].values), a.rounds)
        X = T.loc[te, FEATS].values; D['p_c'] = D.temperature_2m + mc.predict(X); D['p_x'] = D.temperature_2m + mx.predict(X); del mc, mx
        D['same'] = False
    else:   # the candidate stations sit in this fold: neither model sees them here, the fits are identical
        mc = lgb.train(dict(PAR, objective='l2'), lgb.Dataset(T.loc[trc, FEATS].values, T.loc[trc, 'r'].values, weight=T.loc[trc, 'w'].values), a.rounds)
        D['p_c'] = D.temperature_2m + mc.predict(T.loc[te, FEATS].values); D['p_x'] = D['p_c']; D['same'] = True; del mc
    parts.append(D); print('fold', k, 'rows', int(te.sum()), f'{time.time() - t0:.0f}s', flush=True)
D = pd.concat(parts, ignore_index=True)
rng = np.random.default_rng(20261022)


def boot(G):
    si = pd.factorize(G.pid)[0]; di = pd.factorize(G.day)[0]
    ec = (G.p_c - G.obs).abs().values; ex = (G.p_x - G.obs).abs().values; d = ec - ex
    ns, nd = si.max() + 1, di.max() + 1; S = np.zeros((ns, nd)); N = np.zeros((ns, nd)); np.add.at(S, (si, di), d); np.add.at(N, (si, di), 1)
    WS = rng.multinomial(ns, np.ones(ns) / ns, size=a.B); WD = rng.multinomial(nd, np.ones(nd) / nd, size=a.B)
    num = ((WS @ S) * WD).sum(1); den = ((WS @ N) * WD).sum(1); r = num[den > 0] / den[den > 0]
    m0 = float(ec.mean())
    return dict(n=int(len(G)), stations=int(G.pid.nunique()), mae_current=round(m0, 3), mae_candidate=round(float(ex.mean()), 3),
                bias_current=round(float((G.p_c - G.obs).mean()), 3), bias_candidate=round(float((G.p_x - G.obs).mean()), 3),
                gain=round(float(d.mean()), 4), ci95=[round(float(np.percentile(r, 2.5)), 4), round(float(np.percentile(r, 97.5)), 4)],
                margin=round(max(0.05, 0.03 * m0), 3))


NL = D[~D.locked]
res['all'] = boot(NL)
res['zones'] = {z: boot(NL[NL.zone == z]) for z in sorted(NL.zone.unique()) if NL[NL.zone == z].pid.nunique() >= 3}
res['locked'] = boot(D[D.locked]) if D.locked.any() else None
ok = res['all']['ci95'][0] > 0 and all(x['ci95'][0] > -x['margin'] for x in res['zones'].values()) and (res['locked'] is None or res['locked']['ci95'][0] > -res['locked']['margin'])
res['promote'] = bool(ok); res['effect'] = 'refit'
json.dump(res, open(a.out, 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != 'zones'}, indent=1)); print('done', f'{time.time() - t0:.0f}s')
