#!/usr/bin/env python3
"""v283.10 · river flood chance (data/river-prob-model.json, built by station-lake/scripts/river_prob_model.py) re-scored on the served
river-flow frame, with Brier skill vs persistence and 7-day block bootstrap 95 % CIs, per held-out monsoon (pooled) and per gauge.

Same method as river_prob_model.py v91.17.105 (features r2, r95; cumulative logistic + isotonic on out-of-fold predictions grouped
by reach; leave-one-monsoon-out 2024 / 2025; persistence = yesterday's observed class as a 0/1 forecast). Differences, all stated:
  - model flow: the served series (glofas_served_pkt_daily.csv.gz, provider API, timezone Asia/Karachi). The provider cache the
    original used is the same series in GMT labels = served label - 1 day (identical values, scripts/tests28310/glofas/xcorr_lag.py),
    so lag +1 here reproduces the original training pairing and lag 0 is the pairing riverprob.mjs serves (forecast row date = day).
  - limits: data/river-outlook.json 'limits' (thousand cusecs; Low, Medium, High) instead of ffd_flood_limits.csv (not in the copy).
pass rule (scripts/tests28310/glofas/PASS_RULES.txt R3): a threshold is un-withheld only if BSS vs persistence has a bootstrap 95 %
  lower bound > 0 in EVERY held-out monsoon, pooled over gauges.
usage: python riverprob_rescore.py --served <csv.gz> --up <nig folder> --app <data dir> --out <json> [--with-2026]
       --with-2026 adds the 2026 daily river sheet (qc ok, Jun-Oct) as a third held-out monsoon; lag +2 in the served frame is the
       proposed relabel (row D = mean of UTC day D) in the forecast part, which covers all three monsoons"""
import os, sys, json
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.isotonic import IsotonicRegression

a = sys.argv[1:]; opt = lambda n, d=None: a[a.index(n) + 1] if n in a else d
APPD = opt('--app'); UP = opt('--up'); KCS = 28.316846592; WITH2026 = '--with-2026' in a
KN = {1: 'Low or higher', 2: 'Medium or higher', 3: 'High or higher'}
NAMEFIX = {'punjnad': 'panjnad', 'suleimanki': 'sulemanki', 'kala bagh': 'kalabagh'}
FEATS = ['r2', 'r95']


def half_month(d): return (d.month - 1) * 2 + (1 if d.day > 15 else 0)


def pairs(S, L):
    T = json.load(open(os.path.join(APPD, 'river-rarity.json')))['reaches']
    M = json.load(open(os.path.join(APPD, 'river-prob-model.json')))
    LIM = {g['id']: g['limits'] for g in json.load(open(os.path.join(APPD, 'river-outlook.json')))['gauges'] if g.get('limits')}
    B = pd.read_csv(os.path.join(UP, 'station-lake/raw/flood_bulletins/01_gauge_observations_master.csv')); B = B[B.category == 'bulletin'].copy()
    B['st'] = B.station.str.strip().str.lower().replace(NAMEFIX); B['inflow'] = pd.to_numeric(B.inflow, errors='coerce'); B['date'] = pd.to_datetime(B.date)
    if WITH2026:   # the 2026 daily river sheet as a third monsoon (qc ok), same station names as glofascal
        Q = pd.read_parquet(os.path.join(UP, 'station-lake/archive/river/irsa_daily_2026.parquet')); Q = Q[Q.qc == 'ok'].copy()
        Q['st'] = Q.station.str.strip().str.lower().replace({'tarbela dam': 'tarbela', 'kala bagh': 'kalabagh', 'mangla dam': 'mangla', 'new rasul': 'rasul'})
        Q['inflow'] = Q.inflow_cusecs / 1000.0; Q['date'] = pd.to_datetime(Q.date)
        B = pd.concat([B[['st', 'inflow', 'date']], Q[['st', 'inflow', 'date']]])
    rows = []
    for r in B.itertuples():
        if r.st not in M['reaches'] or r.st not in S.columns or r.st not in LIM or pd.isna(r.inflow) or r.date.month not in (6, 7, 8, 9, 10): continue
        s = S[r.st]; t = r.date + pd.Timedelta(days=L)
        if t not in s.index: continue
        q, q1, q3 = s.get(t), s.get(t - pd.Timedelta(days=1)), s.get(t - pd.Timedelta(days=3))
        lv = T[r.st]['levels']; bins = T[r.st]['seasonal']; b = half_month(r.date); p95 = bins[b][3] if bins and bins[b] else None
        if not all(x is not None and np.isfinite(x) and x > 0 for x in (q, q1, q3)) or not (lv.get('rp2') and p95): continue
        lim = LIM[r.st]; y = sum(1 for k in range(3) if lim[k] is not None and r.inflow >= lim[k])
        rows.append(dict(st=r.st, date=r.date, year=r.date.year, y=y, r2=np.log(q / lv['rp2']), r95=np.log(q / p95)))
    D = pd.DataFrame(rows).drop_duplicates(['st', 'date']).sort_values(['st', 'date']).reset_index(drop=True)
    prev = D.set_index(['st', 'date']).y
    D['yprev'] = [prev.get((s, d - pd.Timedelta(days=1)), np.nan) for s, d in zip(D.st, D.date)]
    return D


def fit(D, k):
    X = D[FEATS].values; y = (D.y >= k).astype(int).values
    m = LogisticRegression(C=1.0, max_iter=2000).fit(X, y)
    oof = np.full(len(D), np.nan); sts = D.st.unique()
    for g in np.array_split(np.random.RandomState(0).permutation(sts), min(5, len(sts))):
        te = D.st.isin(g).values
        if y[~te].min() == y[~te].max(): continue
        oof[te] = LogisticRegression(C=1.0, max_iter=2000).fit(X[~te], y[~te]).predict_proba(X[te])[:, 1]
    ok = np.isfinite(oof)
    return m, IsotonicRegression(out_of_bounds='clip', y_min=0, y_max=1).fit(oof[ok], y[ok])


def predict(models, D):
    P = {k: iso.predict(m.predict_proba(D[FEATS].values)[:, 1]) for k, (m, iso) in models.items()}
    P[2] = np.minimum(P[2], P[1]); P[3] = np.minimum(P[3], P[2]); return P


def bss_ci(p, o, pers, dates, rng, n=2000):
    ok = np.isfinite(pers); p, o, pers, dates = p[ok], o[ok], pers[ok], np.asarray(dates)[ok]
    if len(o) < 20 or o.sum() == 0: return dict(n=int(len(o)), events=int(o.sum()), bss=None, ci=[None, None])
    bm, bp = (p - o) ** 2, (pers - o) ** 2
    wk = pd.Series(pd.to_datetime(dates)).dt.to_period('W').astype(str).values; u = np.unique(wk); idx = {w: np.where(wk == w)[0] for w in u}
    est = 1 - bm.mean() / bp.mean() if bp.mean() > 0 else None; bs = []
    for _ in range(n):
        j = np.concatenate([idx[w] for w in rng.choice(u, len(u))]); d = bp[j].mean()
        if d > 0: bs.append(1 - bm[j].mean() / d)
    return dict(n=int(len(o)), events=int(o.sum()), brier=round(float(bm.mean()), 4), brierPersistence=round(float(bp.mean()), 4),
                bss=None if est is None else round(float(est), 3), ci=[round(float(np.quantile(bs, 0.025)), 3), round(float(np.quantile(bs, 0.975)), 3)] if bs else [None, None])


def score(D):
    rng = np.random.default_rng(28310); H = []
    for test in sorted(D.year.unique()):
        tr, te = D[D.year != test], D[D.year == test]
        P = predict({k: fit(tr, k) for k in (1, 2, 3)}, te)
        h = te.copy()
        for k in (1, 2, 3): h['p%d' % k] = P[k]
        H.append(h)
    H = pd.concat(H); out = dict(pairs=int(len(D)), byMonsoon={}, byGauge={})
    for y in sorted(H.year.unique()):
        h = H[H.year == y]
        out['byMonsoon'][str(y)] = {KN[k]: bss_ci(h['p%d' % k].values, (h.y >= k).values.astype(float), np.where(np.isfinite(h.yprev), (h.yprev >= k).astype(float), np.nan), h.date.values, rng) for k in (1, 2, 3)}
    for g in sorted(H.st.unique()):
        h = H[H.st == g]
        out['byGauge'][g] = {KN[k]: bss_ci(h['p%d' % k].values, (h.y >= k).values.astype(float), np.where(np.isfinite(h.yprev), (h.yprev >= k).astype(float), np.nan), h.date.values, rng) for k in (1, 2)}
    out['passR3'] = {KN[k]: all((out['byMonsoon'][y][KN[k]]['ci'][0] or -1) > 0 for y in out['byMonsoon']) for k in (1, 2, 3)}
    return out


def main():
    S = pd.read_csv(opt('--served'), index_col=0, parse_dates=True)
    R = {}
    for name, L in ((('servedPairing_lag0', 0), ('relabel_utcDay_lag+2', 2)) if WITH2026 else (('trainedPairing_lag+1', 1), ('servedPairing_lag0', 0), ('lag+2', 2))):
        R[name] = score(pairs(S, L))
        print(name, 'pairs', R[name]['pairs'], 'R3', R[name]['passR3'])
        for y, v in R[name]['byMonsoon'].items():
            print('  ', y, {k: (x['bss'], x['ci']) for k, x in v.items()})
    json.dump(R, open(opt('--out'), 'w'), indent=1)


if __name__ == '__main__':
    main()
