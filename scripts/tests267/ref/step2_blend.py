#!/usr/bin/env python3
"""v91.17.261 · STEP 2: BLEND FIRST, THEN CALIBRATE (INTERNAL; evaluation only, nothing is served by this script).

The previous Step 2 model learned "observation minus the model median" and replaced the whole served chain; it lost to the chain.
This redesign only replaces the chain's STARTING forecast. Instead of the provider's best_match, the start is a weighted mix of the
named global models, and the served chain (national model, zone corrections, calibration) then runs on top unchanged.

Weights  convex (every weight >= 0, sum = 1) least squares of the observed 2 m temperature on the models' forecasts at that lead,
         per zone x lead (1, 2, 3, 5 d) x 3-hour PKT block; a cell with fewer than 500 rows falls back to zone x lead, then lead.
         No intercept: bias stays the chain's job (the chain was built to correct a raw global forecast).
Models   ECMWF IFS 0.25, GFS, ICON, GEM, CMA, JMA, Meteo-France ARPEGE, UKMO, ECMWF AIFS (archive/model/mm, forecasts as issued).
         Nested sets from the data: the models are ranked by how often they are present in the training rows, and sets of the top
         9, 8, ... 4 are fitted. A row uses the largest set whose models are all present (temperature and dew point).
Dew pt   the same weights on the models' dew points: a convex mix of pairs that each have Td <= T keeps Td <= T.
Train    the non-locked national points only (archive/national/test_locked.json: 48 points, whole 0.5-degree cells, never used).
Held out window 1 (1 Oct 2025 - 26 Sep 2026): leave one month out, so the weights for a month never saw that month.
         window 2 (27 Sep 2026 onward): weights fitted on everything before 27 Sep 2026.
Output   archive/step2/blend/<pid>.json (locked points: hourly blended temperature and dew point by lead, from 25 Sep 2025),
         reports/step2_blend_weights.json (window-2 weights and fit sizes), reports/step2_blend_raw.json (raw skill, no chain).
v91.17.264 --regime: heat-regime weights. Step 2e found the blend start too WARM on the hottest 5 % plains days (daily maximum
         +0.50 C against the station, best_match -0.45 C; the served chain then adds what it learned for best_match). Model skill
         changes with the weather: a row is in the heat regime when the median of the CORE models' forecast for it is at or above
         the 90th percentile of that median for its zone and calendar month (training points only; a forecast quantity, known at
         issue time, so no observation enters the switch). Heat rows get their own weights (zone x lead x block, falling back to
         zone x lead) where 500 or more training rows exist; all other rows keep the ordinary weights.
usage: python step2_blend.py [--points N] [--tag v2] [--regime]   (--tag: output to archive/step2/blend_<tag>, reports/step2_blend_*_<tag>.json;
       synop station-months flagged by step2_screen.py (archive/step2/obs_screen.json) are left out of training and scoring)
"""
import os, sys, json, time, argparse, numpy as np, pandas as pd
from scipy.optimize import nnls
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); ROOT = os.path.dirname(HERE)
import mm_table as M
NAT = os.path.join(ROOT, 'archive', 'national'); S2 = os.path.join(ROOT, 'archive', 'step2'); REP = os.path.join(ROOT, 'reports')
SET9 = ['ifs', 'gfs', 'icon', 'gem', 'cma', 'jma', 'arp', 'ukmo', 'aifs']
SETS = []   # filled in main() from model coverage
LEADS = [1, 2, 3, 5]; W2 = pd.Timestamp('2026-09-27', tz='UTC'); W1 = pd.Timestamp('2025-10-01', tz='UTC')
EXPORT_FROM = pd.Timestamp('2025-09-25', tz='UTC'); MIN_ROWS = 500
LONG = {v: k for k, v in M.SHORT.items()}


def zones(P):
    try:
        sys.path.insert(0, os.path.join(ROOT, '..', 'nigraan-local', 'scripts')); from temp_zone_rank import Zoner
        Z = Zoner(); return {r.pid: Z.zone(r.lat, r.lon, float(r.elev) if r.elev == r.elev else 0.0) for r in P.itertuples()}, 'Zoner'
    except Exception as e:
        T = pd.read_parquet(os.path.join(NAT, 'table.parquet'), columns=['pid', 'zone']).drop_duplicates('pid')
        return dict(zip(T.pid, T.zone)), 'table.parquet (' + str(e)[:80] + ')'


def frame(pid):
    """(time UTC, L) x {model}_t, {model}_td for the nine models and leads 1, 2, 3, 5"""
    cols = {}
    for s in SET9:
        d = M.model_frame(LONG[s], pid)
        if d is None: continue
        d = d[d.index.get_level_values('L').isin(LEADS)]
        cols[s + '_t'] = d['t']; cols[s + '_td'] = d['td']
    if not cols: return None
    W = pd.DataFrame(cols).astype('float32')
    W = W.reset_index(); W['ts'] = pd.to_datetime(W['time'], unit='s', utc=True)
    return W.drop(columns='time')


def solve(X, y):
    """convex least squares: min |Xw - y|, w >= 0, sum w = 1 (equality by a heavily weighted extra row)"""
    lam = 1e3 * np.sqrt(len(y)) * max(1.0, float(np.abs(y).mean()))
    A = np.vstack([X, lam * np.ones((1, X.shape[1]))]); b = np.append(y, lam)
    w, _ = nnls(A.astype(np.float64), b.astype(np.float64)); s = w.sum()
    return w / s if s > 0 else np.full(X.shape[1], 1.0 / X.shape[1])


def fit_fold(D, zone_list):
    """weights[(set index, zone, L, block)] with fallbacks; D = training rows (obs present). v91.17.264: with a 'hot' column, heat-regime
    cells are fitted too, keyed (set index, zone, L, block, 'hot')"""
    out = {}
    if 'hot' in D and D.hot.any():
        H = D[D.hot]; base = fit_fold(D.drop(columns=['hot']), zone_list); out.update(base)
        for k, v in fit_fold(H.drop(columns=['hot']), zone_list).items():
            if k[1] != '*': out[k + ('hot',)] = v
        return out
    for si, S in enumerate(SETS):
        c = [s + '_t' for s in S]; d = D[D[c].notna().all(axis=1)]
        if len(d) < MIN_ROWS: continue
        X = d[c].values; y = d['obs'].values; zz = d['zone'].values; LL = d['L'].values; bb = d['blk'].values
        for L in LEADS:
            mL = LL == L
            if mL.sum() < MIN_ROWS: continue
            wL = solve(X[mL], y[mL]); out[(si, '*', L, -1)] = (wL, int(mL.sum()))
            for z in zone_list:
                mz = mL & (zz == z)
                if mz.sum() < MIN_ROWS: continue
                out[(si, z, L, -1)] = (solve(X[mz], y[mz]), int(mz.sum()))
                for b in range(8):
                    m = mz & (bb == b)
                    if m.sum() >= MIN_ROWS: out[(si, z, L, b)] = (solve(X[m], y[m]), int(m.sum()))
    return out


def pick(Wt, si, z, L, b, hot=False):
    for k in (((si, z, L, b, 'hot'), (si, z, L, -1, 'hot')) if hot else ()) + ((si, z, L, b), (si, z, L, -1), (si, '*', L, -1)):
        if k in Wt: return Wt[k][0]
    return None


def blend_rows(F, Wt, z):
    """blended t, td for the rows of frame F (one point) with weights Wt; NaN where no set is complete"""
    bt = np.full(len(F), np.nan); bd = np.full(len(F), np.nan); used = np.full(len(F), -1)
    for si, S in enumerate(SETS):
        c = [s + '_t' for s in S]; cd = [s + '_td' for s in S]
        if not all(x in F for x in c + cd): continue
        ok = F[c].notna().all(axis=1).values & F[cd].notna().all(axis=1).values & np.isnan(bt)
        if not ok.any(): continue
        hotc = 'hot' if 'hot' in F else None
        for key_, ix in F[ok].groupby(['L', 'blk'] + ([hotc] if hotc else [])).groups.items():
            L, b = key_[0], key_[1]; w = pick(Wt, si, z, L, b, bool(key_[2]) if hotc else False)
            if w is None: continue
            i = F.index.get_indexer(ix)
            bt[i] = F.loc[ix, c].values @ w; bd[i] = F.loc[ix, cd].values @ w; used[i] = si
    return bt, bd, used


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--points', type=int, default=0); ap.add_argument('--tag', default=''); ap.add_argument('--regime', action='store_true'); a = ap.parse_args(); t0 = time.time()
    import step2_screen; BAD = step2_screen.flagged(); sfx = ('_' + a.tag) if a.tag else ''; BL = os.path.join(S2, 'blend' + sfx); print('screened station-months', len(BAD), flush=True)
    os.makedirs(BL, exist_ok=True); os.makedirs(REP, exist_ok=True)
    P = pd.read_csv(os.path.join(NAT, 'points.csv')); LOCK = M.LOCK
    if a.points: P = pd.concat([P[~P.pid.isin(LOCK)].head(a.points), P[P.pid.isin(LOCK)].head(max(2, a.points // 4))])
    ZN, zsrc = zones(P); print('zones from', zsrc, flush=True)
    O = pd.read_parquet(os.path.join(NAT, 'table.parquet'), columns=['t', 'pid', 'obs']); O['t'] = pd.to_datetime(O.t, utc=True)
    O = {p: g.drop_duplicates('t').set_index('t').obs for p, g in O.groupby('pid')}
    train, locked = [], {}
    for i, r in enumerate(P.itertuples()):
        F = frame(r.pid)
        if F is None: continue
        F['zone'] = ZN.get(r.pid, 'plains'); F['blk'] = ((F.ts.dt.hour + 5) % 24) // 3
        if r.pid in LOCK: locked[r.pid] = F[F.ts >= EXPORT_FROM].reset_index(drop=True)
        else:
            o = O.get(r.pid)
            if o is not None:
                d = F[F.ts < W2].copy(); d['obs'] = o.reindex(d.ts).values; d = d[d.obs.notna()]
                if BAD: d = d[~(r.pid + '|' + d.ts.dt.strftime('%Y-%m')).isin(BAD)]
                if len(d): train.append(d.drop(columns=[c for c in d.columns if c.endswith('_td')]))
        if i % 20 == 0: print(i, r.pid, f'{time.time() - t0:.0f}s', flush=True)
    D = pd.concat(train, ignore_index=True); D['ym'] = D.ts.dt.strftime('%Y-%m')
    HOTQ = None
    if a.regime:   # v91.17.264: heat regime switch from the forecast alone (median of the CORE models), 90th percentile per zone x month
        core = [c + '_t' for c in M.CORE if c + '_t' in D]
        D['med'] = D[core].median(axis=1); D['mon'] = D.ts.dt.month
        HOTQ = D.groupby(['zone', 'mon']).med.quantile(0.9).to_dict()
        D['hot'] = D.med >= np.array([HOTQ.get((z, m), np.inf) for z, m in zip(D.zone, D.mon)])
        D = D.drop(columns=['med', 'mon']); print('heat regime rows', int(D.hot.sum()), 'of', len(D), flush=True)
    zl = sorted(D.zone.unique()); print('training rows', len(D), 'points', len(train), 'zones', zl, flush=True)
    cov = D[[m + '_t' for m in SET9]].notna().mean().sort_values(ascending=False); order = [c[:-2] for c in cov.index]
    SETS[:] = [order[:k] for k in range(len(order), 3, -1)]; print('model coverage', cov.round(3).to_dict(), flush=True)
    months = pd.period_range(W1.strftime('%Y-%m'), (W2 - pd.Timedelta(days=1)).strftime('%Y-%m'), freq='M').strftime('%Y-%m').tolist()
    folds = {m: fit_fold(D[D.ym != m], zl) for m in months}; print('month folds fitted', f'{time.time() - t0:.0f}s', flush=True)
    folds['W2'] = fit_fold(D, zl)
    # locked points: each row blended with the weights of its own fold
    raw = []
    for pid, F in locked.items():
        if not len(F): continue
        z = ZN.get(pid, 'plains'); key = np.where(F.ts >= W2, 'W2', F.ts.dt.strftime('%Y-%m'))
        if HOTQ is not None:
            core = [c + '_t' for c in M.CORE if c + '_t' in F]; med = F[core].median(axis=1)
            F = F.assign(hot=(med >= np.array([HOTQ.get((z, m), np.inf) for m in F.ts.dt.month])).values)
        key = np.where(np.isin(key, list(folds)), key, months[0])   # the export margin before 1 Oct 2025 uses the first fold
        bt = np.full(len(F), np.nan); bd = np.full(len(F), np.nan); used = np.full(len(F), -1)
        for k in np.unique(key):
            m = key == k; t_, d_, u_ = blend_rows(F[m].reset_index(drop=True), folds[k], z); bt[m] = t_; bd[m] = d_; used[m] = u_
        F = F.assign(bt=bt, bd=bd, used=used)
        ts = sorted(F.ts.unique()); idx = {t: j for j, t in enumerate(ts)}
        doc = {'pid': pid, 'zone': z, 'time': [pd.Timestamp(t).strftime('%Y-%m-%dT%H:%M') for t in ts], 't': {}, 'td': {}, 'set': {}}
        for L in LEADS:
            g = F[F.L == L]; vt = [None] * len(ts); vd = [None] * len(ts); vs = [None] * len(ts)
            for t, x, y, u in zip(g.ts, g.bt, g.bd, g.used):
                j = idx[t]
                if x == x: vt[j] = round(float(x), 2); vd[j] = round(float(y), 2); vs[j] = int(u)
            doc['t'][str(L)] = vt; doc['td'][str(L)] = vd; doc['set'][str(L)] = vs
        json.dump(doc, open(os.path.join(BL, pid.replace(':', '_').replace('/', '_') + '.json'), 'w'))
        o = O.get(pid)
        if o is not None:
            g = F[F.ts < W2].copy(); g['obs'] = o.reindex(g.ts).values; g = g[g.obs.notna() & g.bt.notna()]
            if BAD: g = g[~(pid + '|' + g.ts.dt.strftime('%Y-%m')).isin(BAD)]
            med = g[[s + '_t' for s in M.CORE if s + '_t' in g]].median(axis=1)
            raw.append(pd.DataFrame({'pid': pid, 'zone': z, 'L': g.L.values, 'e_blend': (g.bt - g.obs).abs().values, 'e_median': (med - g.obs).abs().values,
                                     'e_ifs': (g.ifs_t - g.obs).abs().values if 'ifs_t' in g else np.nan}))
    W = folds['W2']
    rep = {'built': time.strftime('%Y-%m-%d %H:%M'), 'regime': ({f'{k[0]}|{k[1]}': round(float(v), 2) for k, v in HOTQ.items()} if HOTQ else None), 'screened_station_months': len(BAD), 'zones_from': zsrc, 'model_coverage': {k: round(float(v), 3) for k, v in cov.items()}, 'train_rows': int(len(D)), 'train_points': len(train), 'locked_exported': len(locked),
           'sets': {str(i): s for i, s in enumerate(SETS)}, 'window2_weights': {}}
    for k, (w, n) in sorted(W.items(), key=lambda kv: (kv[0][0], str(kv[0][1]), kv[0][2], kv[0][3], len(kv[0]))):
        si, z, L, b = k[:4]; rep['window2_weights'][f'set{si}|{z}|L{L}|blk{b}' + ('|hot' if len(k) > 4 else '')] = dict(n=n, w={s: round(float(x), 3) for s, x in zip(SETS[si], w)})
    json.dump(rep, open(os.path.join(REP, 'step2_blend_weights' + sfx + '.json'), 'w'), indent=1)
    if raw:
        R = pd.concat(raw, ignore_index=True)
        out = {f'{z}|L{L}': dict(n=int(len(g)), mae_blend=round(float(g.e_blend.mean()), 3), mae_median=round(float(g.e_median.mean()), 3), mae_ifs=round(float(g.e_ifs.mean()), 3))
               for (z, L), g in R.groupby(['zone', 'L'])}
        json.dump({'window': 'locked points, 1 Oct 2025 - 26 Sep 2026, raw forecast only (no chain)', 'cells': out}, open(os.path.join(REP, 'step2_blend_raw' + sfx + '.json'), 'w'), indent=1)
        print(pd.DataFrame(out).T.to_string())
    print('done', f'{time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
