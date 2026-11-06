"""SCI item 6 · audit C9 · 5-day snowfall sum vs 5-day degree-day pack for 'snow lying' (rule: /tmp/claude-0/sci/RULES.md item 6).
usage: python3 c9_snowpack_test.py <obs dir> <out.json>"""
import sys, json, numpy as np, pandas as pd
OBS, OUT = sys.argv[1:3]
S = pd.read_parquet(f'{OBS}/Snow_Level.parquet', columns=['timestamp_pkt', 'station_name', 'value_qc']).dropna()
T = pd.read_parquet(f'{OBS}/Air_Temperature.parquet', columns=['timestamp_pkt', 'station_name', 'value_qc']).dropna()
for X in (S, T): X['d'] = pd.to_datetime(X.timestamp_pkt.astype(str).str[:10])
Sd = S.groupby(['station_name', 'd']).value_qc.median().rename('z').reset_index(); Td = T.groupby(['station_name', 'd']).agg(tm=('value_qc', 'mean'), tx=('value_qc', 'max'), tn=('value_qc', 'min'), n=('value_qc', 'size')).reset_index()
import os
if os.environ.get('C9_TMEAN') == 'txtn': Td['tm'] = (Td.tx + Td.tn) / 2   # sensitivity: the (Tmax+Tmin)/2 the forecast members carry
Td = Td[Td.n >= 72]   # >= half a day of 10-min readings
D = Sd.merge(Td[['station_name', 'd', 'tm']], on=['station_name', 'd'], how='inner').sort_values(['station_name', 'd'])
rows, used = [], {}
for st, g in D.groupby('station_name'):
    g = g.set_index('d').asfreq('D'); g['station_name'] = st
    summer = g[g.index.month.isin([7, 8])].z.dropna()
    if len(summer) < 20 or summer.quantile(.75) - summer.quantile(.25) > 5: continue
    base = summer.median(); noise = summer.diff().abs().dropna().quantile(.95) if len(summer) > 5 else 1.0
    g['depth'] = g.z - base; inc = g.z.diff(); g['new'] = np.where(inc > noise, inc, 0.0); g.loc[inc.isna(), 'new'] = np.nan
    win = g[g.index.month.isin([11, 12, 1, 2, 3, 4])]
    if win.depth.notna().sum() < 60: continue
    used[st] = dict(baseCm=round(float(base), 1), noiseCm=round(float(noise), 2), winterDays=int(win.depth.notna().sum()))
    rows.append(g)
G = pd.concat(rows)
def evaluate(G, ddf):
    out = []
    for st, g in G.groupby('station_name'):
        new = g.new.values; tm = g.tm.values; dep = g.depth.values; idx = g.index
        for k in range(5, len(g)):
            if idx[k].month not in (11, 12, 1, 2, 3, 4) or np.isnan(dep[k]): continue
            w = new[k - 5:k]; t = tm[k - 5:k]
            if np.isnan(w).any() or np.isnan(t).any(): continue
            A = w.sum() >= 5
            swe = 0.0
            for j in range(5): swe = max(0.0, swe + w[j] / 0.7 - ddf * max(0.0, t[j]))
            B = swe * 0.7 >= 5
            truth = dep[k] >= 5
            if w.sum() <= 0 and not truth: continue
            win = '2024-25' if pd.Timestamp('2024-10-01') <= idx[k] < pd.Timestamp('2025-07-01') else '2025-26' if pd.Timestamp('2025-10-01') <= idx[k] < pd.Timestamp('2026-07-01') else 'other'
            out.append((st, idx[k], win, A, B, truth))
    return pd.DataFrame(out, columns=['st', 'd', 'win', 'A', 'B', 'y'])
def pss(p, y):
    h = (p & y).sum(); m = (~p & y).sum(); f = (p & ~y).sum(); c = (~p & ~y).sum()
    return (h / (h + m) if h + m else np.nan) - (f / (f + c) if f + c else np.nan)
cal = {}
for ddf in np.round(np.arange(2.5, 11.61, 0.1), 1):
    E = evaluate(G, ddf); e = E[E.win == '2024-25']
    if len(e): cal[float(ddf)] = pss(e.B.values, e.y.values)
best = max(cal, key=lambda k: (cal[k], -k))
E = evaluate(G, best); te = E[E.win == '2025-26'].copy(); te['blk'] = te.st + '|' + te.d.dt.isocalendar().week.astype(str) + '|' + te.d.dt.year.astype(str)
keys = te.blk.unique(); ix = {k: np.where(te.blk.values == k)[0] for k in keys}; rng = np.random.default_rng(13); diffs = []
for _ in range(2000):
    ii = np.concatenate([ix[k] for k in rng.choice(keys, len(keys))]); s = te.iloc[ii]; diffs.append(pss(s.B.values, s.y.values) - pss(s.A.values, s.y.values))
ci = [round(float(np.nanpercentile(diffs, 2.5)), 3), round(float(np.nanpercentile(diffs, 97.5)), 3)]
cnt = lambda p, y: dict(hits=int((p & y).sum()), misses=int((~p & y).sum()), falseAlarms=int((p & ~y).sum()), correctNeg=int((~p & ~y).sum()), pss=round(float(pss(p, y)), 3))
res = dict(stations=used, ddfChosen=best, calPss={str(k): round(v, 3) for k, v in cal.items() if abs(k * 10 % 10) < 1e-9}, calWinter=dict(n=int((E.win == '2024-25').sum())),
           test=dict(winter='2025-26', n=len(te), stations=int(te.st.nunique()), served=cnt(te.A.values, te.y.values), candidate=cnt(te.B.values, te.y.values), pssDiffCi=ci))
res['promote'] = bool(ci[0] > 0)
json.dump(res, open(OUT, 'w'), indent=1, default=str); print(json.dumps(res, indent=1, default=str))
