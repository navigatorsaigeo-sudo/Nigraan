#!/usr/bin/env python3
"""NIGRAAN retrain prep - candidate H: training height envelope of the learned temperature residual (prior patch v91.17.283.2).

There is no station above the highest training station (4,669 m), so the envelope is tested by moving the ceiling down:
  fit the national residual model (national_train.py recipe, no-pool feature set, blk 0 weeks) on stations at or below a cut
  (3,500 m; 4,000 m), locked test points never fitted; score stations above the cut on blk 1 weeks (stations AND weeks unseen).
  full     T0 + tree residual                      (current behaviour: a tree returns the top of its training set)
  envelope T0 + factor x tree residual, factor = clip(1 - (z - zmax_fit) / Lz, 0, 1), Lz = 600 m (bias.Lz of national-model.json)
  raw      T0 alone (Open-Meteo best_match at the station height)
Score  MAE, bias; two-way cluster bootstrap (stations x days, B = 1000) of MAE(full) - MAE(envelope) on rows with factor < 1.
Rule   RULES_20261101.json H: promote only if the lower bound > 0 at BOTH cuts.
usage  python cand_height.py <national dir> <out json> [rounds]"""
import sys, json, numpy as np, pandas as pd, lightgbm as lgb
ND, OUT = sys.argv[1], sys.argv[2]; ROUNDS = int(sys.argv[3]) if len(sys.argv) > 3 else 500
FEATS = ['temperature_2m', 'dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'shortwave_radiation', 'precipitation', 'lat', 'lon', 'elev',
         'hs', 'hc', 'ds', 'dc', 'dep', 'wds', 'wdc', 'fc_dtr', 'fc_tmax', 'calm_clear', 't_elev', 't_slope', 't_aspect_sin', 't_aspect_cos',
         't_tpi300', 't_tpi1000', 't_valley_depth', 't_svf', 't_capp', 't_hand', 's_wc_tree', 's_wc_crop', 's_wc_built', 's_wc_bare',
         's_wc_water', 's_wc_snow', 's_built10', 'w_dist', 'c_pr_ann', 'relief', 'dz_cell', 's_ndvi', 's_ndmi', 'l_day', 'l_night',
         'l_day_anom', 'l_night_anom', 'c_tmax', 'c_tmin', 'capp_cc', 'vd_cc', 'cc_prev6', 'ws_prev6', 'sw_day', 'pr_prev72', 'dt3']
PAR = dict(learning_rate=0.05, num_leaves=63, min_data_in_leaf=300, feature_fraction=0.8, bagging_fraction=0.7, bagging_freq=1,
           lambda_l2=5.0, verbose=-1, num_threads=2, seed=20261022)
LZ = 600.0
T = pd.read_parquet(f'{ND}/table.parquet', columns=['t', 'pid', 'obs', 'r', 'zone'] + FEATS)
for c in FEATS: T[c] = T[c].astype('float32')
LOCK = set(json.load(open(f'{ND}/test_locked.json'))['points'])
T['blk'] = ((T.t - pd.Timestamp('2022-12-26', tz='UTC')).dt.days // 14) % 2
T['day'] = (T.t + pd.Timedelta(hours=5)).dt.date.astype(str)
n_st = T[T.blk == 0].groupby('pid').size(); T['w'] = T.pid.map(np.minimum(1.0, 4000.0 / n_st)).fillna(1.0).astype('float32')
res = {'design': __doc__.split('\n')[3].strip(), 'Lz_m': LZ, 'rounds': ROUNDS, 'cuts': {}}
rng = np.random.default_rng(20261022)


def boot(si, di, diff, B=1000):
    ns, nd = si.max() + 1, di.max() + 1
    S = np.zeros((ns, nd)); N = np.zeros((ns, nd)); np.add.at(S, (si, di), diff); np.add.at(N, (si, di), 1)
    WS = rng.multinomial(ns, np.ones(ns) / ns, size=B); WD = rng.multinomial(nd, np.ones(nd) / nd, size=B)
    num = ((WS @ S) * WD).sum(1); den = ((WS @ N) * WD).sum(1); r = num[den > 0] / den[den > 0]
    return float(diff.mean()), float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))


for cut in (3500, 4000):
    tr = (T.elev <= cut) & (T.blk == 0) & ~T.pid.isin(LOCK)
    te = (T.elev > cut) & (T.blk == 1)
    zmax = float(T.loc[tr, 'elev'].max())
    m = lgb.train(dict(PAR, objective='l2'), lgb.Dataset(T.loc[tr, FEATS].values, T.loc[tr, 'r'].values, weight=T.loc[tr, 'w'].values), ROUNDS)
    # H2: mean training residual of the top 500 m below the ceiling, by PKT 3-hour block
    top = tr & (T.elev > zmax - 500)
    blk3 = ((T.t + pd.Timedelta(hours=5)).dt.hour // 3)
    cband = T.loc[top, 'r'].groupby(blk3[top]).mean()
    D = T.loc[te, ['pid', 'day', 'elev', 'obs', 'temperature_2m', 'zone']].copy()
    D['cb'] = blk3[te].map(cband).fillna(float(T.loc[top, 'r'].mean())).values
    D['res'] = m.predict(T.loc[te, FEATS].values)
    D['f'] = np.clip(1 - (D.elev - zmax) / LZ, 0, 1)
    D['p_full'] = D.temperature_2m + D.res; D['p_env'] = D.temperature_2m + D.f * D.res
    D['p_h2'] = D.temperature_2m + D.f * D.res + (1 - D.f) * D.cb
    D = D[D.f < 1]
    si = pd.factorize(D.pid)[0]; di = pd.factorize(D.day)[0]
    ef, ee, er = (D.p_full - D.obs).abs().values, (D.p_env - D.obs).abs().values, (D.temperature_2m - D.obs).abs().values
    g, lo, hi = boot(si, di, ef - ee)
    g2, lo2, hi2 = boot(si, di, er - ee)
    eh = (D.p_h2 - D.obs).abs().values
    g3, lo3, hi3 = boot(si, di, ef - eh)
    per = D.groupby('pid').apply(lambda x: pd.Series(dict(elev=x.elev.iloc[0], above_fit_max_m=round(x.elev.iloc[0] - zmax), factor=round(x.f.iloc[0], 2), hours=len(x),
                                                       bias_raw=round((x.temperature_2m - x.obs).mean(), 2), bias_full=round((x.p_full - x.obs).mean(), 2), bias_env=round((x.p_env - x.obs).mean(), 2), bias_h2=round((x.p_h2 - x.obs).mean(), 2), mae_h2=round((x.p_h2 - x.obs).abs().mean(), 2),
                                                       mae_raw=round((x.temperature_2m - x.obs).abs().mean(), 2), mae_full=round((x.p_full - x.obs).abs().mean(), 2), mae_env=round((x.p_env - x.obs).abs().mean(), 2))), include_groups=False)
    res['cuts'][str(cut)] = dict(fit_max_elev_m=zmax, fit_stations=int(T.loc[tr, 'pid'].nunique()), test_stations=int(D.pid.nunique()), test_hours=int(len(D)),
                                 mae_raw=round(float(er.mean()), 3), mae_full=round(float(ef.mean()), 3), mae_envelope=round(float(ee.mean()), 3),
                                 bias_raw=round(float((D.temperature_2m - D.obs).mean()), 3), bias_full=round(float((D.p_full - D.obs).mean()), 3), bias_envelope=round(float((D.p_env - D.obs).mean()), 3),
                                 mae_h2=round(float(eh.mean()), 3), bias_h2=round(float((D.p_h2 - D.obs).mean()), 3), gain_h2_vs_full=round(g3, 3), ci95_h2=[round(lo3, 3), round(hi3, 3)],
                                 top_band_residual_by_3h=[round(float(v), 2) for v in cband.values],
                                 gain_envelope_vs_full=round(g, 3), ci95=[round(lo, 3), round(hi, 3)], gain_envelope_vs_raw=round(g2, 3), ci95_vs_raw=[round(lo2, 3), round(hi2, 3)],
                                 per_station=per.reset_index().to_dict('records'))
    print(cut, json.dumps({k: v for k, v in res['cuts'][str(cut)].items() if k != 'per_station'}), flush=True)
    del m
res['promotable'] = all(res['cuts'][c]['ci95'][0] > 0 for c in res['cuts'])
res['h2_promotable'] = all(res['cuts'][c]['ci95_h2'][0] > 0 for c in res['cuts'])
json.dump(res, open(OUT, 'w'), indent=1, default=float)
print('promotable', res['promotable'], 'h2_promotable', res['h2_promotable'])
