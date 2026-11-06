#!/usr/bin/env python3
"""v283.10: the model series is now the SERVED river flow (provider API at the snapped reach cells, exactly
as flood.mjs fetches the forecast this is applied to; timezone GMT since v283.10 part 3, row D = UTC mean of D-1):
station-lake/archive/glofas/glofas_served_gmt_daily.csv.gz (scripts/gen/flood_glofascal/glofas_served_series.py; GLOFAS_SERVED
overrides). The station file
glofas_irsa_daily.csv.gz used until v283.9 has other day labels (the served label is 1 day later to 2023-08-04 and 2 days later
after), another product from 2023-08-05 and other cells at Tarbela, Balloki and Sidhnai (scripts/tests28310/glofas). The served
level (lv_srv) is therefore now the level a client sees for that day. Lag window -2..+2 d in the served GMT frame (RIVERCAL_LAGS
overrides, e.g. -2,3). RIVERCAL_FIT / RIVERCAL_APPLY (paths)
fit on one series and apply on another, for before/after evidence only.

v91.17.274 RIVER - GloFAS reach flow calibrated to the daily river-gauge record (INTERNAL fit + held-out test).

data   model : GloFAS v4 reanalysis daily discharge at the gauge cells (station-lake/archive/glofas/glofas_irsa_daily.csv.gz,
               1991-2026-10-09; cells checked equal to the served reach cells: 2-year flow within 0-3 %, except Balloki/Sidhnai/Partab)
       obs   : gauge inflow, thousand cusecs, daily 06:00:
               2024-06-16..2025-10-15  station-lake/raw/flood_bulletins/01_gauge_observations_master.csv (bulletins)
               2026-05-05..2026-10-13  station-lake/archive/river/irsa_daily_2026.parquet (daily river sheet, qc == ok)
       served: the reach map level of data/river-rarity.json + data/river-level-scale.json (same arithmetic as flood.mjs riverLevel)
       class : official flood limits per gauge (river-outlook.json 'limits'), level word = min(class, 4) exactly as /api/flood/gauges
method per reach (fit seasons only):
       1. lag L in -2..+2 days with the best Spearman rank correlation model(t+L) vs gauge(t)
       2. empirical quantile mapping model -> gauge on the fit days (99 quantiles); above the fitted range the top ratio is carried
test   leave one season out (2024, 2025, 2026). Window 1 = held-out 2024 + 2025; window 2 = held-out 2026 (fit on 2024-25 only).
gate   per reach: level abs error (served - candidate) W1 lower 95 % bound > 0, W2 mean >= 0; flow MAE not worse beyond doubt
       (vs the raw model flow); flood days (gauge Medium or more) level error not worse beyond doubt; no month worse beyond doubt;
       seasonal peak date error not worse than the raw model. Bootstrap = 7-day blocks, 2000 draws.
"""
import os, sys, json, math
import numpy as np, pandas as pd

UP = os.environ.get('RIVERCAL_UP') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')   # the nig folder (station-lake beside nigraan-local); cloud run: RIVERCAL_UP=/mnt/user-data/uploads/NIGRAAN/nig
APPD = os.environ.get('RIVERCAL_APP') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data')
OUT = os.environ.get('RIVERCAL_WORK') or os.path.dirname(os.path.abspath(__file__))
M3 = 28.316846592  # m3/s per thousand cusecs
RNG = np.random.default_rng(274)

# reach id -> (model column, bulletin name, sheet name)
REACH = {
 'tarbela': ('Tarbela Dam', 'tarbela', 'Tarbela Dam'), 'kalabagh': ('Kala Bagh', 'kalabagh', 'Kala Bagh'),
 'chashma': ('Chashma', 'chashma', 'Chashma'), 'taunsa': ('Taunsa', 'taunsa', 'Taunsa'), 'guddu': ('Guddu', 'guddu', 'Guddu'),
 'sukkur': ('Sukkur', 'sukkur', 'Sukkur'), 'kotri': ('Kotri', 'kotri', 'Kotri'), 'nowshera': ('Nowshera', 'nowshera', 'Nowshera'),
 'mangla': ('Mangla Dam', 'mangla', 'Mangla Dam'), 'rasul': ('New Rasul', 'rasul', 'New Rasul'), 'marala': ('Marala', 'marala', 'Marala'),
 'khanki': ('Khanki', 'khanki', 'Khanki'), 'qadirabad': ('Qadirabad', 'qadirabad', 'Qadirabad'), 'trimmu': ('Trimmu', 'trimmu', 'Trimmu'),
 'panjnad': ('Panjnad', 'panjnad', 'Panjnad'), 'sulemanki': ('Sulemanki', 'sulemanki', 'Sulemanki'), 'islam': ('Islam', 'islam', 'Islam'),
 'balloki': ('Balloki', 'balloki', 'Balloki'), 'sidhnai': ('Sidhnai', 'sidhnai', 'Sidhnai'),
}
NAMEFIX = {'punjnad': 'panjnad', 'suleimanki': 'sulemanki', 'kala bagh': 'kalabagh'}


def limits():
    j = json.load(open(os.path.join(APPD, 'river-outlook.json')))
    L = {g['id']: g['limits'] for g in j['gauges'] if g.get('limits')}
    return L


def cls(q, lim):
    if q is None or not np.isfinite(q): return None
    i = 0
    for k, t in enumerate(lim):
        if t is not None and q >= t: i = k + 1
    return i


def obs():
    A = pd.read_csv(os.path.join(UP, 'station-lake/raw/flood_bulletins/01_gauge_observations_master.csv'))
    A = A[A.category == 'bulletin'][['date', 'station', 'inflow']].copy()
    A['st'] = A.station.str.strip().str.lower().replace(NAMEFIX)
    A['inflow'] = pd.to_numeric(A.inflow, errors='coerce')
    P = pd.read_parquet(os.path.join(UP, 'station-lake/archive/river/irsa_daily_2026.parquet'))
    P = P[P.qc == 'ok']
    inv = {v[2]: k for k, v in REACH.items()}
    P = P[P.station.isin(inv)].copy(); P['st'] = P.station.map(inv); P['inflow'] = P.inflow_cusecs / 1000.0
    G = pd.concat([A[['date', 'st', 'inflow']], P[['date', 'st', 'inflow']]])
    G['date'] = pd.to_datetime(G.date); G = G.dropna(subset=['inflow']).drop_duplicates(['st', 'date'], keep='last')
    G['season'] = G.date.dt.year
    return G


SERVED = os.environ.get('GLOFAS_SERVED') or os.path.join(UP, 'station-lake/archive/glofas/glofas_served_gmt_daily.csv.gz')
LAGS = range(*[int(x) for x in os.environ.get('RIVERCAL_LAGS', '-2,3').split(',')])


def model_series(path=None):
    """model flow (m3/s), columns = reach ids; the station file (legacy, evidence only) is mapped by its column names"""
    G = pd.read_csv(path or SERVED, index_col=0, parse_dates=True)
    if 'Kala Bagh' in G.columns: G = pd.DataFrame({rid: G[c[0]] for rid, c in REACH.items() if c[0] in G.columns})
    return G


# ---- the served level (flood.mjs riverLevel, same arithmetic) ----
RLS = json.load(open(os.path.join(APPD, 'river-level-scale.json')))
RR = json.load(open(os.path.join(APPD, 'river-rarity.json')))['reaches']
CUTS = [0.25, 0.45, 0.65, 0.82]


def hm_bin(d): return (d.month - 1) * 2 + (1 if d.day > 15 else 0)


def served_level(rid, q_m3s, d):
    R = RR.get(rid)
    if not R or q_m3s is None or not np.isfinite(q_m3s): return None
    lv = R['levels']; b = R.get('seasonal'); bin_ = b[hm_bin(d)] if b else None
    if not (lv['rp2'] > 0 and lv['rp5'] > 0 and lv['rp20'] > 0) or not bin_: return None
    e = lambda x: x * (1 - 1e-4)
    p95 = min(bin_[3], lv['rp2'] * 0.98)
    X = {'p80': bin_[1], 'p90': bin_[2], 'p95': p95, 'rp2-': e(lv['rp2']), 'rp2': lv['rp2'], 'rp5-': e(lv['rp5']), 'rp5': lv['rp5'],
         'rp20-': e(lv['rp20']), 'rp20': lv['rp20'], 'rp20x1.5': lv['rp20'] * 1.5}
    k = [[X[a[0]], a[1]] for a in RLS['knots']]
    for i in range(1, len(k)):
        if not k[i][0] > k[i - 1][0]: k[i][0] = k[i - 1][0] + 0.01
    q = q_m3s
    if q <= k[0][0]: y = 0
    elif q >= k[-1][0]: y = 1
    else:
        y = 0
        for j in range(1, len(k)):
            if q <= k[j][0]:
                x0, y0 = k[j - 1]; x1, y1 = k[j]; y = y0 + (y1 - y0) * ((q - x0) / (x1 - x0)); break
    y = max(0, min(1, y)); i = 0
    while i < len(CUTS) and y >= CUTS[i]: i += 1
    return i


def served_shown(rid):
    """flood.mjs rarityClass returns null (no class shown) for these"""
    R = RR.get(rid) or {}
    return not (R.get('fitRefused') or R.get('modelRepresentsRiver') is False or (R.get('gaugeCheck') or {}).get('verdict') == 'under-call')


# ---- fit ----
def fit_lag(m, o_idx, o_val):
    best = None
    for L in LAGS:
        mm = m.shift(-L).reindex(o_idx)   # model(t+L)
        ok = mm.notna().values
        if ok.sum() < 40: continue
        rho = pd.Series(mm.values[ok]).rank().corr(pd.Series(o_val[ok]).rank())
        if best is None or rho > best[1]: best = (L, rho)
    return best[0] if best else 0


def fit_map(m, o):
    qs = np.linspace(0.01, 0.99, 99)
    mq = np.quantile(m, qs); oq = np.quantile(o, qs)
    mq = np.maximum.accumulate(mq + np.arange(99) * 1e-6)   # strictly increasing for interp
    return mq, oq


def apply_map(x, mq, oq):
    x = np.asarray(x, float); y = np.interp(x, mq, oq)
    hi = x > mq[-1]; y[hi] = x[hi] * (oq[-1] / mq[-1] if mq[-1] > 0 else 1)
    lo = x < mq[0]; y[lo] = x[lo] * (oq[0] / mq[0] if mq[0] > 0 else 1)
    return y


def blocks_boot(d, dates, n=2000):
    """mean and 95 % CI by 7-day block bootstrap"""
    d = np.asarray(d, float)
    if len(d) == 0: return (None, None, None)
    wk = pd.Series(pd.to_datetime(dates)).dt.to_period('W').astype(str).values
    u = np.unique(wk); idx = {w: np.where(wk == w)[0] for w in u}
    if len(u) < 3: m = d.mean(); return (m, m, m)
    ms = []
    for _ in range(n):
        pick = RNG.choice(u, len(u)); ii = np.concatenate([idx[w] for w in pick]); ms.append(d[ii].mean())
    return (float(d.mean()), float(np.quantile(ms, 0.025)), float(np.quantile(ms, 0.975)))


def main():
    G = model_series(os.environ.get('RIVERCAL_FIT')); GA = model_series(os.environ.get('RIVERCAL_APPLY')) if os.environ.get('RIVERCAL_APPLY') else G
    O = obs(); LIM = limits()
    rows, final, detail = [], {}, []
    for rid in REACH:
        lim = LIM.get(rid)
        if lim is None or rid not in G.columns or rid not in GA.columns: continue
        m_k = G[rid] / M3   # thousand cusecs (fit)
        a_k = GA[rid] / M3   # thousand cusecs (applied: the served flow)
        g = O[O.st == rid].set_index('date').sort_index()
        seasons = sorted(g.season.unique())
        recs = []
        for test in seasons:
            fit = g[g.season != test] if test != 2026 else g[g.season < 2026]
            tst = g[g.season == test]
            if len(fit) < 60 or len(tst) < 20: continue
            L = fit_lag(m_k, fit.index, fit.inflow.values)
            mf = m_k.shift(-L).reindex(fit.index); ok = mf.notna().values
            mq, oq = fit_map(mf.values[ok], fit.inflow.values[ok])
            mt = a_k.shift(-L).reindex(tst.index); raw0 = a_k.reindex(tst.index)
            # variant B: log-linear (log gauge = a + b log model) on the fit days
            lm, lo = np.log(np.maximum(mf.values[ok], 1e-3)), np.log(np.maximum(fit.inflow.values[ok], 1e-3))
            bb, aa = np.polyfit(lm, lo, 1); s2 = np.var(lo - (aa + bb * lm))
            # variant C: quantile mapping inside a +-30-day day-of-year window of the fit days
            fdoy = fit.index.dayofyear.values; fmv = mf.values; fov = fit.inflow.values
            for d, o, mv, r0 in zip(tst.index, tst.inflow.values, mt.values, raw0.values):
                if not (np.isfinite(mv) and np.isfinite(r0)): continue
                c = float(apply_map([mv], mq, oq)[0])
                cB = float(np.exp(aa + bb * np.log(max(mv, 1e-3)) + s2 / 2))
                dd = np.abs(((fdoy - d.dayofyear) + 182) % 365 - 182); w = ok & (dd <= 30)
                if w.sum() >= 40:
                    mq2, oq2 = fit_map(fmv[w], fov[w]); cC = float(apply_map([mv], mq2, oq2)[0])
                else: cC = c
                recs.append(dict(reach=rid, date=d, season=test, obs=o, raw=r0, cal=c, calB=cB, calC=cC, lag=L,
                                 lv_obs=min(cls(o, lim), 4), lv_cal=min(cls(c, lim), 4), lv_calB=min(cls(cB, lim), 4), lv_calC=min(cls(cC, lim), 4),
                                 lv_srv=(served_level(rid, r0 * M3, d) if served_shown(rid) else None), cls_obs=cls(o, lim)))
        if not recs: continue
        R = pd.DataFrame(recs); detail.append(R)
        # final fit on every season, for serving
        L = fit_lag(m_k, g.index, g.inflow.values); mf = m_k.shift(-L).reindex(g.index); ok = mf.notna().values
        mq, oq = fit_map(mf.values[ok], g.inflow.values[ok])
        final[rid] = dict(lagDays=int(L), modelQ=[round(float(v) * M3, 2) for v in mq], gaugeQ=[round(float(v), 3) for v in oq],
                          limits=lim, seasons=[int(s) for s in seasons], n=int(ok.sum()),
                          first=str(g.index.min().date()), last=str(g.index.max().date()))
    D = pd.concat(detail)
    D.to_csv(os.path.join(OUT, 'rivercal_heldout_days.csv.gz'), index=False)
    json.dump(final, open(os.path.join(OUT, 'rivercal_final_fit.json'), 'w'))
    print('held-out reach-days', len(D))


if __name__ == '__main__':
    main()
