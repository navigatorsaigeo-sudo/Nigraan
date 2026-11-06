#!/usr/bin/env python3
"""NIGRAAN v91.17.283.6 item 5 - the 90 % temperature range above the highest training station (held-out test).

Question: for a point more than MARGIN m above the highest station the national residual model was trained on, does the served
90 % range (quantile models q05 / q95 + the zone's conformal widening, centred on the model value) still cover 90 % of the
observations, and does widening its LOWER side by the measured extrapolation warm bias (cand_height.json) fix it?

Design (the leave-band-out of cand_height.py, same recipe and seed): fit the national residual mean (500 rounds) and the 5 % / 95 %
quantile models (QROUNDS 300, national_train.py) on stations at or below a cut (3,500 m; 4,000 m), locked points never fitted, fit
weeks (blk 0) only. Score stations more than MARGIN m above the fit maximum on the other weeks (blk 1): stations AND weeks unseen.
  current  [T0 + q05 - W, T0 + q95 + W], W = the mountain zone widenC of data/national-model.json (nopool)
  widened  lower side moved down by B, upper side unchanged; central value unchanged
  B        from cand_height.json only: the upper end of the 95 % station-cluster bootstrap interval of the hour-weighted mean
           bias (current model - observed) of its test stations more than MARGIN m above the fit maximum, both cuts pooled
           (the measured extrapolation warm bias). LOSO: for each scored station, B is recomputed without that station.
  Candidate 2 (named by the owner on 22 Oct before this run's second pass): B2 = the measured interval "+1.6 to +2.0 C" itself, i.e.
           the larger of the two cuts' hour-weighted extrapolation biases of cand_height.json (bias_full 2.039 / 1.558: max 2.04);
           LOSO: each cut's hour-weighted bias recomputed from its per_station rows without the scored station.
  Run 1 (22 Oct, B only) gave: cut 3,500 pass, cut 4,000 FAIL (over-coverage 0.988): kept in the output as candidate 1.
Pass rule (decided before the run): at BOTH cuts the widened coverage is closer to 0.90 than the current one, and its 95 % station
cluster bootstrap interval of coverage contains 0.90 or lies above the current one's upper bound.
usage: python h5_height_range_test.py <national dir> <cand_height.json> <national-model.json> <out json>"""
import sys, json, hashlib, numpy as np, pandas as pd, lightgbm as lgb
ND, CH, NM, OUT = sys.argv[1:5]
MARGIN = 300.0
FEATS = ['temperature_2m', 'dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'shortwave_radiation', 'precipitation', 'lat', 'lon', 'elev',
         'hs', 'hc', 'ds', 'dc', 'dep', 'wds', 'wdc', 'fc_dtr', 'fc_tmax', 'calm_clear', 't_elev', 't_slope', 't_aspect_sin', 't_aspect_cos',
         't_tpi300', 't_tpi1000', 't_valley_depth', 't_svf', 't_capp', 't_hand', 's_wc_tree', 's_wc_crop', 's_wc_built', 's_wc_bare',
         's_wc_water', 's_wc_snow', 's_built10', 'w_dist', 'c_pr_ann', 'relief', 'dz_cell', 's_ndvi', 's_ndmi', 'l_day', 'l_night',
         'l_day_anom', 'l_night_anom', 'c_tmax', 'c_tmin', 'capp_cc', 'vd_cc', 'cc_prev6', 'ws_prev6', 'sw_day', 'pr_prev72', 'dt3']
PAR = dict(learning_rate=0.05, num_leaves=63, min_data_in_leaf=300, feature_fraction=0.8, bagging_fraction=0.7, bagging_freq=1,
           lambda_l2=5.0, verbose=-1, num_threads=2, seed=20261022)
rng = np.random.default_rng(20261022)
chb = open(CH, 'rb').read(); C = json.loads(chb); M = json.load(open(NM))
W = float(M['zones']['nopool']['mountain']['widenC'])
top = max(s['elev'] for s in M['bias']['stations'])


def bias_ci(rows, B=4000):
    b = np.array([r['bias_full'] for r in rows]); h = np.array([r['hours'] for r in rows])
    est = float((b * h).sum() / h.sum()); n = len(b); bs = []
    for _ in range(B):
        i = rng.integers(0, n, n); bs.append((b[i] * h[i]).sum() / h[i].sum())
    return est, float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))


pool = []
for cut, v in C['cuts'].items():
    for s in v['per_station']:
        if s['above_fit_max_m'] > MARGIN: pool.append(dict(s, cut=cut))
est, blo, bhi = bias_ci(pool)
res = {'design': __doc__.split('\n')[2].strip(), 'marginM': MARGIN, 'topTrainingStationM': top, 'widenC_mountain_nopool': W,
       'candHeightSha256': hashlib.sha256(chb).hexdigest(), 'extrapolationBias': {'stations': len(pool), 'hourWeightedMeanC': round(est, 3),
       'ci95C': [round(blo, 3), round(bhi, 3)], 'B_C': round(bhi, 2)}, 'cuts': {}}
print('B', res['extrapolationBias'], flush=True)

T = pd.read_parquet(f'{ND}/table.parquet', columns=['t', 'pid', 'obs', 'r'] + FEATS)
for c in FEATS: T[c] = T[c].astype('float32')
LOCK = set(json.load(open(f'{ND}/test_locked.json'))['points'])
T['blk'] = ((T.t - pd.Timestamp('2022-12-26', tz='UTC')).dt.days // 14) % 2
T['day'] = (T.t + pd.Timedelta(hours=5)).dt.date.astype(str)
n_st = T[T.blk == 0].groupby('pid').size(); T['w'] = T.pid.map(np.minimum(1.0, 4000.0 / n_st)).fillna(1.0).astype('float32')


def cov_ci(si, hit, B=1000):
    ns = si.max() + 1; S = np.bincount(si, hit, ns); N = np.bincount(si, None, ns)
    WS = rng.multinomial(ns, np.ones(ns) / ns, size=B); r = (WS @ S) / (WS @ N)
    return float(hit.mean()), float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))


def wink(lo, hi, y, a=0.10):
    return float(np.mean((hi - lo) + (2 / a) * (lo - y) * (y < lo) + (2 / a) * (y - hi) * (y > hi)))


ok_all = True; ok2_all = [True]
for cut in (3500, 4000):
    tr = (T.elev <= cut) & (T.blk == 0) & ~T.pid.isin(LOCK)
    zmax = float(T.loc[tr, 'elev'].max())
    te = (T.elev > zmax + MARGIN) & (T.blk == 1)
    X = T.loc[tr, FEATS].values; y = T.loc[tr, 'r'].values; wt = T.loc[tr, 'w'].values
    ds = lgb.Dataset(X, y, weight=wt, free_raw_data=False)
    m = lgb.train(dict(PAR, objective='l2'), ds, 500)
    q5 = lgb.train(dict(PAR, objective='quantile', alpha=0.05), ds, 300)
    q95 = lgb.train(dict(PAR, objective='quantile', alpha=0.95), ds, 300)
    Xt = T.loc[te, FEATS].values; D = T.loc[te, ['pid', 'day', 'elev', 'obs', 'temperature_2m']].copy()
    D['p'] = D.temperature_2m + m.predict(Xt); D['lo'] = D.temperature_2m + q5.predict(Xt) - W; D['hi'] = D.temperature_2m + q95.predict(Xt) + W
    # LOSO B for each scored station (the station's own cand_height rows left out)
    Bs = {}
    for pid in D.pid.unique():
        _, _, bh = bias_ci([r for r in pool if r['pid'] != pid], B=1000); Bs[pid] = max(0.0, bh)
    D['B'] = D.pid.map(Bs)
    def b2(pid):
        v = []
        for c, cv in C['cuts'].items():
            R = [r for r in cv['per_station'] if r['pid'] != pid]; v.append(sum(r['bias_full'] * r['hours'] for r in R) / sum(r['hours'] for r in R))
        return max(0.0, max(v))
    B2s = {pid: b2(pid) for pid in D.pid.unique()}
    D['B2'] = D.pid.map(B2s); D['lo3'] = D.lo - D.B2
    D[['pid', 'day', 'obs', 'p', 'lo', 'hi', 'B', 'B2']].to_parquet(OUT.replace('.json', '_%d.parquet' % cut))
    D['lo2'] = D.lo - D.B
    si = pd.factorize(D.pid)[0]; yv = D.obs.values
    h1 = ((yv >= D.lo.values) & (yv <= D.hi.values)).astype(float); h2 = ((yv >= D.lo2.values) & (yv <= D.hi.values)).astype(float)
    c1 = cov_ci(si, h1); c2 = cov_ci(si, h2)
    below1 = float((yv < D.lo.values).mean()); above1 = float((yv > D.hi.values).mean()); below2 = float((yv < D.lo2.values).mean())
    ok = abs(c2[0] - 0.9) < abs(c1[0] - 0.9) and ((c2[1] <= 0.9 <= c2[2]) or c2[1] > c1[2])
    h3 = ((yv >= D.lo3.values) & (yv <= D.hi.values)).astype(float); c3 = cov_ci(si, h3)
    ok2 = abs(c3[0] - 0.9) < abs(c1[0] - 0.9) and ((c3[1] <= 0.9 <= c3[2]) or c3[1] > c1[2])
    ok_all = ok_all and ok; ok2_all[0] = ok2_all[0] and ok2
    res['cuts'][str(cut)] = dict(fit_max_elev_m=zmax, scored_stations=int(D.pid.nunique()), scored_hours=int(len(D)),
        bias_model_C=round(float((D.p - D.obs).mean()), 3), coverage_current=[round(x, 3) for x in c1], coverage_widened=[round(x, 3) for x in c2],
        below_current=round(below1, 3), above_current=round(above1, 3), below_widened=round(below2, 3),
        winkler_current=round(wink(D.lo.values, D.hi.values, yv), 3), winkler_widened=round(wink(D.lo2.values, D.hi.values, yv), 3),
        mean_width_current=round(float((D.hi - D.lo).mean()), 2), mean_width_widened=round(float((D.hi - D.lo2).mean()), 2),
        loso_B=[round(min(Bs.values()), 2), round(max(Bs.values()), 2)], pass_=ok,
        candidate2=dict(loso_B2=[round(min(B2s.values()), 2), round(max(B2s.values()), 2)], coverage=[round(x, 3) for x in c3], below=round(float((yv < D.lo3.values).mean()), 3),
                        winkler=round(wink(D.lo3.values, D.hi.values, yv), 3), mean_width=round(float((D.hi - D.lo3).mean()), 2), pass_=ok2))
    print(cut, json.dumps(res['cuts'][str(cut)]), flush=True)
    del m, q5, q95, ds
res['pass'] = ok_all; res['candidate2_pass'] = ok2_all[0]
res['candidate2_B_C'] = round(max(v['bias_full'] for v in C['cuts'].values()), 2)
json.dump(res, open(OUT, 'w'), indent=1)
print('pass', ok_all, 'candidate2', ok2_all[0])
