#!/usr/bin/env python3
"""v283.10 · evidence for the glofas_irsa_daily date/product defect: lagged cross-correlation per gauge per year, lags -3..+3.

lag convention: L is the shift with series B(t+L) best matching series A(t) (Pearson r of day-to-day log changes, which removes the
seasonal autocorrelation that makes level correlations flat across lags). Gauge comparisons: A = gauge inflow (06:00 PKT sheet).
inputs  --file   station-lake/archive/glofas/glofas_irsa_daily.csv.gz
        --served glofas_served_pkt_daily.csv.gz (glofas_served_series.py; the served frame)
        --api    a folder with provider JSON pulls seamless_v4.json / consolidated_v4.json / forecast_v4.json (timezone GMT), optional
        --up     the nig folder (station-lake/raw/flood_bulletins, station-lake/archive/river)
out     --out    lags.json
"""
import os, sys, json
import numpy as np, pandas as pd

a = sys.argv[1:]; opt = lambda n, d=None: a[a.index(n) + 1] if n in a else d
COL = {'tarbela': 'Tarbela Dam', 'kalabagh': 'Kala Bagh', 'chashma': 'Chashma', 'taunsa': 'Taunsa', 'guddu': 'Guddu', 'sukkur': 'Sukkur',
       'kotri': 'Kotri', 'nowshera': 'Nowshera', 'mangla': 'Mangla Dam', 'rasul': 'New Rasul', 'marala': 'Marala', 'khanki': 'Khanki',
       'qadirabad': 'Qadirabad', 'trimmu': 'Trimmu', 'panjnad': 'Panjnad', 'sulemanki': 'Sulemanki', 'islam': 'Islam', 'balloki': 'Balloki',
       'sidhnai': 'Sidhnai'}
LAGS = range(-3, 4)
NAMEFIX = {'punjnad': 'panjnad', 'suleimanki': 'sulemanki', 'kala bagh': 'kalabagh'}


def dl(s): return np.log(s.where(s > 0)).diff()


def best_lag(A, B, minn=60):
    dA, dB = dl(A), dl(B); r = {}
    for L in LAGS:
        x = pd.concat([dA, dB.shift(-L).reindex(dA.index)], axis=1).dropna()
        x = x[np.isfinite(x).all(axis=1)]
        if len(x) >= minn and x.iloc[:, 0].std() > 0 and x.iloc[:, 1].std() > 0: r[L] = float(np.corrcoef(x.iloc[:, 0], x.iloc[:, 1])[0, 1])
    if not r: return None, {}
    return max(r, key=r.get), {k: round(v, 3) for k, v in r.items()}


def within2(A, B, L):
    b = B.shift(-L).reindex(A.index); ok = A.notna() & b.notna()
    return round(float(((A - b).abs() <= 0.02 * b.abs().clip(lower=1))[ok].mean() * 100), 1) if ok.sum() else None


def gauges(up):
    A = pd.read_csv(os.path.join(up, 'station-lake/raw/flood_bulletins/01_gauge_observations_master.csv'))
    A = A[A.category == 'bulletin'][['date', 'station', 'inflow']].copy()
    A['st'] = A.station.str.strip().str.lower().replace(NAMEFIX); A['inflow'] = pd.to_numeric(A.inflow, errors='coerce')
    P = pd.read_parquet(os.path.join(up, 'station-lake/archive/river/irsa_daily_2026.parquet')); P = P[P.qc == 'ok']
    inv = {v: k for k, v in COL.items()}; P = P[P.station.isin(inv)].copy(); P['st'] = P.station.map(inv); P['inflow'] = P.inflow_cusecs / 1000.0
    G = pd.concat([A[['date', 'st', 'inflow']], P[['date', 'st', 'inflow']]]); G['date'] = pd.to_datetime(G.date)
    G = G.dropna(subset=['inflow']); G = G[G.inflow > 0].drop_duplicates(['st', 'date'], keep='last')
    return G.pivot(index='date', columns='st', values='inflow').asfreq('D')


def api(folder, model):
    f = os.path.join(folder, model + '.json')
    if not folder or not os.path.exists(f): return None
    J = json.load(open(f))
    return pd.DataFrame({i: pd.Series(d['daily']['river_discharge'], index=pd.to_datetime(d['daily']['time']), dtype=float) for i, d in zip(J['ids'], J['data'])})


def main():
    F0 = pd.read_csv(opt('--file'), index_col=0, parse_dates=True); F = pd.DataFrame({k: F0[v] for k, v in COL.items()})
    S = pd.read_csv(opt('--served'), index_col=0, parse_dates=True)[list(COL)]
    out = dict(lagConvention='L = shift with B(t+L) best matching A(t); Pearson r of daily log changes; lags -3..+3', pairs={})
    pairs = [('file_vs_servedPKT', F, S)]
    for m in ('seamless_v4', 'consolidated_v4', 'forecast_v4'):
        X = api(opt('--api'), m)
        if X is not None: pairs.append(('file_vs_%s_GMT' % m, F, X[list(COL)]))
    for name, A, B in pairs:
        rows = {}
        for g in COL:
            for y in range(1997, 2027):
                a_, b_ = A[g][str(y)], B[g]
                if a_.notna().sum() < 60: continue
                L, r = best_lag(a_, b_)
                if L is None: continue
                rows.setdefault(g, {})[str(y)] = dict(best=L, r=r, within2pctAtBest=within2(a_, b_, L), within2pctAt0=within2(a_, b_, 0))
        out['pairs'][name] = rows
    G = gauges(opt('--up'))
    for name, M in (('gauge_vs_file', F), ('gauge_vs_servedPKT', S)):
        rows = {}
        for g in COL:
            if g not in G.columns: continue
            for y in (2024, 2025, 2026):
                L, r = best_lag(G[g][str(y)], M[g], minn=40)
                if L is not None: rows.setdefault(g, {})[str(y)] = dict(best=L, r=r)
        out['pairs'][name] = rows
    # summary: share of gauge-years per best lag, by period
    summ = {}
    for name, rows in out['pairs'].items():
        per = {}
        for g, ys in rows.items():
            for y, v in ys.items():
                p = 'gauge years' if name.startswith('gauge') else ('1997-2022' if int(y) <= 2022 else ('2023' if int(y) == 2023 else '2024-2026'))
                per.setdefault(p, []).append(v['best'])
        summ[name] = {p: {str(L): int(sum(1 for x in v if x == L)) for L in LAGS if any(x == L for x in v)} | {'n': len(v)} for p, v in per.items()}
    out['summary'] = summ
    os.makedirs(os.path.dirname(os.path.abspath(opt('--out'))), exist_ok=True)
    json.dump(out, open(opt('--out'), 'w'), indent=1)
    print(json.dumps(summ, indent=1))


if __name__ == '__main__':
    main()
