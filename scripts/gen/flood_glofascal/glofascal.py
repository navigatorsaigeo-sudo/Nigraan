#!/usr/bin/env python3
"""v283 WS9 · GloFAS river flow calibrated to the daily river-gauge sheet, per gauge, with a held-out test (INTERNAL).

Why: when the daily gauge sheet stops, NIGRAAN still needs a gauge-equivalent flow from the river model. That correction must be
fitted while the sheet runs and must be shown to beat the raw model flow on days it never saw.

data  model : GloFAS v4 daily discharge in the SERVED frame (v283.10): the provider flood API at each reach's snapped cell, timezone
              GMT, exactly as flood.mjs fetches the forecast this correction is applied to (part 3: row D = UTC mean of D-1)
              (station-lake/archive/glofas/glofas_served_gmt_daily.csv.gz, built by glofas_served_series.py; GLOFAS_SERVED overrides).
              Until v283.9 the fit used station-lake/archive/glofas/glofas_irsa_daily.csv.gz: a different date frame (UTC day of the
              24 h mean; the served label is 1 day later to 2023-07 and 2 days later from 2023-08), a different product from 2023-08
              (ERA5-forced reanalysis vs the provider's archived operational forecast) and different cells at Tarbela, Balloki and
              Sidhnai. A correction fitted there is mis-timed and mis-scaled on the served flow (scripts/tests28310/glofas).
      gauge : daily inflow (thousand cusecs, 06:00): 2024-06-16..2025-10-15 bulletins (station-lake/raw/flood_bulletins/
              01_gauge_observations_master.csv, category bulletin) and 2026-05-05.. the daily river sheet
              (station-lake/archive/river/irsa_daily_2026.parquet, qc == ok)
      limits: each gauge's official flood limits (data/river-outlook.json 'limits': Low, Medium, High, V.High, Exceptional)
forms (fitted on the fit seasons only):
      QM   empirical quantile mapping model -> gauge (99 quantiles; above/below the fitted range the end ratio is carried)
      LLS  log-linear with a seasonal term: ln g = a + b ln m + c sin(2 pi doy/365) + d cos(2 pi doy/365), smearing (Duan) back-transform
      lag  L in -2..+2 d in the served frame (model day t+L stands for gauge day t) by Spearman on the fit seasons. The 06:00 PKT
           reading of day t closes the UTC day t-1, which the served GMT frame labels t (forecast part); +-2 d around it for routing.
           (The same physical window as -1..+3 in the Asia/Karachi frame of the first v283.10 refit.)
test  leave one season out (2024, 2025, 2026): every held-out day is predicted by a fit that never saw its season.
raw   the raw model flow at the same fitted lag (v283.10; v283.9 compared the raw flow at lag 0, a timing handicap for raw).
persistence  the gauge's previous-day reading carried to the day (reported per gauge with its 7-day block bootstrap CI; not gated:
      the correction is for when the sheet stops, where yesterday's reading does not exist).
metrics  MAE and bias (thousand cusecs); flood-class exceedance at the gauge's Low and Medium limits: hit rate (POD), false-alarm
      ratio (FAR), CSI. 95 % intervals by 7-day block bootstrap (2000 draws).
gate per gauge and form: MAE gain (raw - cal) lower 95 % bound > 0 in the pooled held-out set AND no held-out season with a worse MAE
      AND |bias| not larger AND, at both the Low and the Medium flood limit, CSI and hit rate not lower than raw (when the gauge had
      such days held out). (v283 second pass: the first pass gated on the Low limit only and let through corrections that lost the
      Medium-limit days: pooled Medium hit rate 0.44 raw -> 0.01; recorded in EVIDENCE.md.)
      Among forms that pass, the one with the lower held-out MAE is served (both results are written).
outputs data/flood-glofascal/glofascal.json (per-gauge final fit on every season + held-out record), work/glofascal_heldout.csv.gz
scope  lead 0 (reanalysis, observed-weather forcing): no archived GloFAS forecasts by lead exist in the copies, so the forecast
      days carry the weather-forecast error in addition; the correction is a flow-scale correction, not a forecast-skill claim.
"""
import os, sys, json, math, datetime
import numpy as np, pandas as pd

_NIG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..'))   # the nig folder (station-lake beside nigraan-local)
UP = os.environ.get('WS9_UP') or (_NIG if os.path.isdir(os.path.join(_NIG, 'station-lake')) else '/mnt/user-data/uploads/NIGRAAN/nig')
APPD = os.environ.get('WS9_APP', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'data'))
WORK = os.environ.get('WS9_WORK') or os.path.join(__import__('tempfile').gettempdir(), 'nigraan_flood_work')
M3 = 28.316846592   # m3/s per thousand cusecs
RNG = np.random.default_rng(283)

SERVED = os.environ.get('GLOFAS_SERVED') or os.path.join(UP, 'station-lake/archive/glofas/glofas_served_gmt_daily.csv.gz')
FRAME = 'provider-api-gmt'   # v283.10 part 3: the server requests the river forecast in GMT; glofascal.mjs refuses any other frame
LAGS = range(-2, 3)
REACH = {  # reach id -> (station-file column (legacy, evidence only), bulletin name, sheet name)
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
    return {g['id']: g['limits'] for g in j['gauges'] if g.get('limits')}


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
    G['date'] = pd.to_datetime(G.date); G = G.dropna(subset=['inflow'])
    G = G[G.inflow > 0].drop_duplicates(['st', 'date'], keep='last')
    G['season'] = G.date.dt.year
    return G


def fit_lag(m, idx, o, lags=None):
    best = None
    for L in (lags if lags is not None else LAGS):
        mm = m.shift(-L).reindex(idx).values; ok = np.isfinite(mm)
        if ok.sum() < 40: continue
        rho = pd.Series(mm[ok]).rank().corr(pd.Series(o[ok]).rank())
        if best is None or rho > best[1]: best = (L, rho)
    return best[0] if best else 0


def fit_qm(m, o):
    qs = np.linspace(0.01, 0.99, 99)
    mq = np.maximum.accumulate(np.quantile(m, qs) + np.arange(99) * 1e-6); oq = np.quantile(o, qs)
    return mq, oq


def apply_qm(x, mq, oq):
    x = np.asarray(x, float); y = np.interp(x, mq, oq)
    hi = x > mq[-1]; y[hi] = x[hi] * (oq[-1] / mq[-1] if mq[-1] > 0 else 1)
    lo = x < mq[0]; y[lo] = x[lo] * (oq[0] / mq[0] if mq[0] > 0 else 1)
    return y


def X_lls(m, doy):
    w = 2 * np.pi * np.asarray(doy) / 365.25
    return np.column_stack([np.ones(len(m)), np.log(np.maximum(m, 1e-3)), np.sin(w), np.cos(w)])


def fit_lls(m, o, doy):
    X = X_lls(m, doy); y = np.log(np.maximum(o, 1e-3))
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    smear = float(np.mean(np.exp(y - X @ beta)))   # Duan smearing
    return beta, smear


def apply_lls(m, doy, beta, smear):
    return np.exp(X_lls(m, doy) @ beta) * smear


def boot(d, dates, n=2000):
    d = np.asarray(d, float)
    if not len(d): return [None, None, None]
    wk = pd.Series(pd.to_datetime(dates)).dt.to_period('W').astype(str).values
    u = np.unique(wk); idx = {w: np.where(wk == w)[0] for w in u}
    if len(u) < 3: return [float(d.mean())] * 3
    ms = [d[np.concatenate([idx[w] for w in RNG.choice(u, len(u))])].mean() for _ in range(n)]
    return [float(d.mean()), float(np.quantile(ms, 0.025)), float(np.quantile(ms, 0.975))]


def exceed(o, p, t):
    if t is None: return None
    O = o >= t; P = p >= t
    h = int((O & P).sum()); mi = int((O & ~P).sum()); fa = int((~O & P).sum())
    return dict(events=int(O.sum()), hits=h, misses=mi, falseAlarms=fa,
                pod=(h / (h + mi)) if h + mi else None, far=(fa / (h + fa)) if h + fa else None,
                csi=(h / (h + mi + fa)) if h + mi + fa else None)


def r(x, k=2):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), k)


def load_served():
    return pd.read_csv(SERVED, index_col=0, parse_dates=True)


def run(G, lags=None, raw_lagged=True, GA=None):
    """G: model flow (m3/s), columns = reach ids. Returns (out, D). raw_lagged=False reproduces the v283.9 raw comparison.
    GA: apply the fold fits to this series instead (evidence: a fit on the station file applied to the served flow)."""
    global RNG; RNG = np.random.default_rng(283)   # every run draws the same bootstrap stream
    O = obs(); LIM = limits(); out = {}; rows = []
    for rid in REACH:
        lim = LIM.get(rid); mcol = rid
        if lim is None or mcol not in G.columns: continue
        mk = G[mcol] / M3; ak = (GA[mcol] / M3) if GA is not None and mcol in GA.columns else mk
        g = O[O.st == rid].set_index('date').sort_index()
        seasons = sorted(int(s) for s in g.season.unique())
        recs = []
        for test in seasons:
            fit, tst = g[g.season != test], g[g.season == test]
            if len(fit) < 60 or len(tst) < 20: continue
            L = fit_lag(mk, fit.index, fit.inflow.values, lags)
            mf = mk.shift(-L).reindex(fit.index).values; ok = np.isfinite(mf)
            mq, oq = fit_qm(mf[ok], fit.inflow.values[ok])
            beta, sm = fit_lls(mf[ok], fit.inflow.values[ok], fit.index.dayofyear.values[ok])
            mt = ak.shift(-L).reindex(tst.index).values; raw = mt if raw_lagged else ak.reindex(tst.index).values
            okt = np.isfinite(mt) & np.isfinite(raw)
            if okt.sum() < 20: continue
            qm = apply_qm(mt[okt], mq, oq); ll = apply_lls(mt[okt], tst.index.dayofyear.values[okt], beta, sm)
            prev = g.inflow.reindex(tst.index - pd.Timedelta(days=1)).values   # persistence: the gauge reading of the day before
            for d, o, a, b, c, p in zip(tst.index[okt], tst.inflow.values[okt], raw[okt], qm, ll, prev[okt]):
                recs.append(dict(reach=rid, date=d, season=test, lag=L, obs=o, raw=a, QM=b, LLS=c, pers=p))
        if not recs: continue
        R = pd.DataFrame(recs); rows.append(R)
        res = {'raw': {}}
        for f in ['raw', 'QM', 'LLS']:
            e = (R[f] - R.obs)
            res.setdefault(f, {})
            res[f].update(mae=r(e.abs().mean()), bias=r(e.mean()),
                          maeBySeason={str(s): r((R[R.season == s][f] - R[R.season == s].obs).abs().mean()) for s in sorted(R.season.unique())},
                          low=exceed(R.obs.values, R[f].values, lim[0]), medium=exceed(R.obs.values, R[f].values, lim[1]))
        gates = {}
        for f in ['QM', 'LLS']:
            gain = boot((R.raw - R.obs).abs().values - (R[f] - R.obs).abs().values, R.date.values)
            worseSeason = [s for s, v in res[f]['maeBySeason'].items() if v is not None and res['raw']['maeBySeason'][s] is not None and v > res['raw']['maeBySeason'][s]]
            why = []
            if not (gain[1] is not None and gain[1] > 0): why.append('MAE gain lower 95 % bound <= 0')
            if worseSeason: why.append('MAE worse in held-out season ' + ', '.join(worseSeason))
            if abs(res[f]['bias']) > abs(res['raw']['bias']): why.append('|bias| larger than raw')
            lr, lc = res['raw']['low'], res[f]['low']
            if lr and lr['events'] and (lc['csi'] or 0) < (lr['csi'] or 0): why.append('Low-limit CSI lower than raw')
            if lr and lr['events'] and (lc['pod'] or 0) < (lr['pod'] or 0): why.append('Low-limit hit rate lower than raw')
            mr, mc = res['raw']['medium'], res[f]['medium']
            if mr and mr['events'] and (mc['csi'] or 0) < (mr['csi'] or 0): why.append('Medium-limit CSI lower than raw')
            if mr and mr['events'] and (mc['pod'] or 0) < (mr['pod'] or 0): why.append('Medium-limit hit rate lower than raw')
            gates[f] = dict(passes=not why, why=why, maeGain=[r(x) for x in gain])
        passing = [f for f in ['QM', 'LLS'] if gates[f]['passes']]
        served = min(passing, key=lambda f: res[f]['mae']) if passing else None
        Rp = R[np.isfinite(R.pers.astype(float))]
        vsP = dict(n=len(Rp), maePersistence=r((Rp.pers - Rp.obs).abs().mean()) if len(Rp) else None)
        for f in ['raw', 'QM', 'LLS']:
            vsP[f] = dict(mae=r((Rp[f] - Rp.obs).abs().mean()) if len(Rp) else None,
                          maeGainVsPersistence=[r(x) for x in boot((Rp.pers - Rp.obs).abs().values - (Rp[f] - Rp.obs).abs().values, Rp.date.values)])
        # final fit on every season (served only if a form passed)
        L = fit_lag(mk, g.index, g.inflow.values, lags); mf = mk.shift(-L).reindex(g.index).values; ok = np.isfinite(mf)
        mq, oq = fit_qm(mf[ok], g.inflow.values[ok]); beta, sm = fit_lls(mf[ok], g.inflow.values[ok], g.index.dayofyear.values[ok])
        months = sorted(set(int(x) for x in g.index.month))
        out[rid] = dict(modelColumn=mcol, limitsKcusecs=lim, seasons=seasons, nPairs=int(ok.sum()), first=str(g.index.min().date()), last=str(g.index.max().date()),
                        fitMonths=months, heldOut=dict(n=len(R), **res), vsPersistence=vsP, gate=gates, served=served,
                        fit=dict(lagDays=int(L), QM=dict(modelKcusecs=[r(v, 3) for v in mq], gaugeKcusecs=[r(v, 3) for v in oq]),
                                 LLS=dict(beta=[float(b) for b in beta], smear=float(sm), terms=['1', 'ln m', 'sin 2pi doy/365.25', 'cos 2pi doy/365.25'])))
    return out, pd.concat(rows)


def main():
    out, D = run(load_served()); os.makedirs(WORK, exist_ok=True)
    D.to_csv(os.path.join(WORK, 'glofascal_heldout.csv.gz'), index=False)
    # pooled summary
    def pooled(f):
        e = D[f] - D.obs; return dict(mae=r(e.abs().mean()), bias=r(e.mean()))
    servedRows = D[D.reach.isin([k for k, v in out.items() if v['served']])]
    def pooled_ex(which):
        t = {'raw': [0, 0, 0], 'cal': [0, 0, 0]}
        for k, v in out.items():
            if not v['served']: continue
            for f, key in [('raw', 'raw'), (v['served'], 'cal')]:
                e = v['heldOut'][f][which]
                if e: t[key][0] += e['hits']; t[key][1] += e['misses']; t[key][2] += e['falseAlarms']
        return {k: dict(events=h + m, pod=r(h / (h + m), 3) if h + m else None, far=r(fa / (h + fa), 3) if h + fa else None, csi=r(h / (h + m + fa), 3) if h + m + fa else None) for k, (h, m, fa) in t.items()}
    summ = dict(servedLowLimit=pooled_ex('low'), servedMediumLimit=pooled_ex('medium'), reaches=len(out), heldOutDays=len(D), pooled={f: pooled(f) for f in ['raw', 'QM', 'LLS']},
                servedGauges=sorted(k for k, v in out.items() if v['served']),
                servedPooled=dict(n=len(servedRows), raw=dict(mae=r((servedRows.raw - servedRows.obs).abs().mean())),
                                  cal=dict(mae=r(np.mean([abs(getattr(row, out[row.reach]['served']) - row.obs) for row in servedRows.itertuples()])) if len(servedRows) else None)))
    J = dict(version='glofascal-283.10', modelFrame=FRAME, modelSeries=os.path.basename(SERVED), built=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5))).strftime('%Y-%m-%d %H:%M PKT'),
             productType='Internal calibration', what='GloFAS reach flow corrected to the daily river-gauge record per gauge; served only where the correction beat the raw model flow on held-out seasons. Internal: never shown to clients by source name.',
             method=__doc__, unit='thousand cusecs (gauge); model input m3/s', m3sPerKcusecs=M3, summary=summ, reaches=out)
    os.makedirs(os.path.join(APPD, 'flood-glofascal'), exist_ok=True)
    json.dump(J, open(os.path.join(APPD, 'flood-glofascal', 'glofascal.json'), 'w'), indent=1)
    print(json.dumps(summ, indent=1))
    for k, v in out.items():
        h = v['heldOut']
        print(f"{k:10s} n={h['n']:4d} raw {h['raw']['mae']:7.1f}/{h['raw']['bias']:7.1f} QM {h['QM']['mae']:7.1f}/{h['QM']['bias']:7.1f} {'P' if v['gate']['QM']['passes'] else '-'} "
              f"LLS {h['LLS']['mae']:7.1f}/{h['LLS']['bias']:7.1f} {'P' if v['gate']['LLS']['passes'] else '-'} served={v['served']} lowCSI raw/QM/LLS "
              f"{(h['raw']['low'] or {}).get('csi')}/{(h['QM']['low'] or {}).get('csi')}/{(h['LLS']['low'] or {}).get('csi')} ev={(h['raw']['low'] or {}).get('events')}")


if __name__ == '__main__':
    main()
