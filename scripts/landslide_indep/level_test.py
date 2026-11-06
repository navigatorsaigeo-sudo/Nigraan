#!/usr/bin/env python3
"""v91.17.112 · how much more likely is a rain-triggered landslide today than on an ordinary day at the same place and season?
Case-control on the NASA Global Landslide Catalog (2007-2017, rain-triggered, location within 25 km, one per day and 0.1 deg cell;
station-lake/reports/landslide_events.csv) and ERA5 daily rain at the event point (the cached responses of landslide_backtest.py):
  cases     the event day (P1 = the larger of the day and the day after: the catalogue date is +-1 day)
  controls  every other day at the same cell, same season (month +-1), 2007-2017, not within 3 days of an event there
  model     logistic regression on log(1+P1), log(1+P3), log(1+P7), log(1+API15). The intercept depends only on how many controls
            were drawn and on how complete the catalogue is, so it is NOT used: the output is the ODDS RATIO against the median
            control day of the same cell and season ("x times as likely as an ordinary day here"), which the design does identify.
  test      leave-one-year-out (each year scored by a model that never saw it): AUC, and the observed event share by predicted
            odds-ratio band against the share on ordinary days (does "10x" mean about ten times?)
The catalogue is news-based and incomplete, so a probability per day is not identifiable; the relative likelihood is.
Output: nigraan-local/data/landslide-odds-model.json, station-lake/reports/landslide_odds.md"""
import os, sys, json, datetime as dt, numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); sys.path.insert(0, HERE)
import landslide_backtest as LB
EV = pd.read_csv(f'{ROOT}/reports/landslide_events.csv')
def api15(dv, i): k = np.arange(0, min(60, i + 1)); w = dv[i - k]; return float(np.nansum(w * np.exp(-k / 15)))
rows = []
for cell, g in EV.groupby('cell'):
    r0 = g.iloc[0]
    try: dd = LB.fetch(r0.lat, r0.lon, '2007-01-01', '2017-12-31', False, 'cached')
    except Exception as e: print('no cache', cell, str(e)[:60]); continue
    dts = dd['daily']['time']; dv = np.array([np.nan if x is None else x for x in dd['daily']['precipitation_sum']], float)
    ix = {d: i for i, d in enumerate(dts)}; ev_days = set(pd.to_datetime(g.date).dt.date); months = set(pd.to_datetime(g.date).dt.month)
    P = lambda n, i: float(np.nansum(dv[max(0, i - n + 1):i + 1]))
    feat = lambda i: (max(P(1, i), P(1, i + 1) if i + 1 < len(dv) else 0), P(3, i), P(7, i), api15(dv, i))
    for r in g.itertuples():
        if r.date not in ix or ix[r.date] < 60: continue
        i = ix[r.date]; rows.append((cell, r.province, int(r.date[:4]), r.date, 1) + feat(i))
    for i in range(60, len(dv)):
        d = dt.date.fromisoformat(dts[i])
        if not any(abs(((d.month - m + 6) % 12) - 6) <= 1 for m in months): continue
        if any(abs((d - e).days) <= 3 for e in ev_days): continue
        rows.append((cell, None, d.year, dts[i], 0) + feat(i))
T = pd.DataFrame(rows, columns=['cell', 'province', 'year', 'date', 'y', 'P1', 'P3', 'P7', 'API15']).dropna(subset=['P1','P3','P7','API15'])
F = ['P1', 'P3', 'P7', 'API15']; X = np.log1p(T[F].clip(lower=0).values); y = T.y.values
print('cases', int(y.sum()), 'controls', int((1 - y).sum()), 'cells', T.cell.nunique(), flush=True)
oof = np.full(len(T), np.nan); COEFS = {}
for yr in sorted(T.year.unique()):
    tr = T.year.values != yr; te = ~tr
    if y[te].sum() == 0: continue
    m = LogisticRegression(C=1.0, max_iter=2000, class_weight=None).fit(X[tr], y[tr]); oof[te] = m.decision_function(X[te]); COEFS[yr] = m.coef_[0]
ok = ~np.isnan(oof); auc = roc_auc_score(y[ok], oof[ok])
# odds ratio against the median control day of the same cell (season already matched): exp(score - median control score at the cell)
D = T[ok].assign(s=oof[ok]); med = D[D.y == 0].groupby('cell').s.median(); D['lor'] = D.s - D.cell.map(med); D['OR'] = np.exp(D.lor)
bands = [0, 1, 2, 5, 10, 20, 1e9]; lab = ['<1', '1-2', '2-5', '5-10', '10-20', '>=20']
D['band'] = pd.cut(D.OR, bands, labels=lab, right=False)
base = D.y.sum() / (D.y == 0).sum()   # event-to-control ratio overall (case-control sampling constant)
cal = []
for b, g in D.groupby('band', observed=True):
    ev, ct = int(g.y.sum()), int((g.y == 0).sum())
    cal.append({'band': str(b), 'events': ev, 'ordinaryDays': ct, 'predictedOR_median': round(float(g.OR.median()), 2), 'observedRelative': round((ev / max(ct, 1)) / base, 2) if ct else None})
# relative to the ORDINARY DAY: the observed ratio in a band divided by the ratio among days the model calls ordinary (OR 0.5-2)
ref = D[(D.OR >= 0.5) & (D.OR < 2)]; refr = ref.y.sum() / max((ref.y == 0).sum(), 1)
for c in cal: g = D[D.band.astype(str) == c['band']]; c['observedVsOrdinaryDay'] = round(float((g.y.sum() / max((g.y == 0).sum(), 1)) / refr), 2) if refr > 0 else None
# SERVED variant: reference = the national median control day of the month, fitted without the test year
T['mo'] = pd.to_datetime(T.date).dt.month; cal_s = []
lor_s = np.full(len(T), np.nan)
for yr, cf in COEFS.items():
    trm = (T.year.values != yr) & (y == 0); refm = {mo: np.log1p(g[F].median().values) for mo, g in T[trm].groupby('mo')}
    te = np.where(T.year.values == yr)[0]
    R = np.stack([refm[mo] for mo in T.mo.values[te]]); lor_s[te] = (X[te] - R) @ cf
Ds = T.assign(OR=np.exp(lor_s))[~np.isnan(lor_s)]; Ds['band'] = pd.cut(Ds.OR, bands, labels=lab, right=False)
refs = Ds[(Ds.OR >= 0.5) & (Ds.OR < 2)]; rr = refs.y.sum() / max((refs.y == 0).sum(), 1)
for b, g in Ds.groupby('band', observed=True):
    ev, ct = int(g.y.sum()), int((g.y == 0).sum()); cal_s.append({'band': str(b), 'events': ev, 'ordinaryDays': ct, 'observedVsOrdinaryDay': round(float((ev / max(ct, 1)) / rr), 2)})
auc_s = roc_auc_score(Ds.y, lor_s[~np.isnan(lor_s)])

import json
rng=np.random.default_rng(5); yrs=Ds.year.unique(); cuts=[2,5,10,20]
def rel(D):
    r=D[(D.OR>=0.5)&(D.OR<2)]; rr=r.y.sum()/max((r.y==0).sum(),1); out={}
    for b,g in D.groupby('band',observed=True): out[str(b)]=(g.y.sum()/max((g.y==0).sum(),1))/rr if rr>0 else np.nan
    return out
base=rel(Ds); bs={k:[] for k in base}
for _ in range(1000):
    S=pd.concat([Ds[Ds.year==y] for y in rng.choice(yrs,len(yrs))]); r=rel(S)
    for k in bs: bs[k].append(r.get(k,np.nan))
tab=[]
for c in cal_s:
    b=c['band']; lo,hi=np.nanpercentile(bs[b],[2.5,97.5]); tab.append({**c,'ci95':[round(float(lo),2),round(float(hi),2)]})
ev=Ds[Ds.y==1]; od=Ds[Ds.y==0]
det=[{'cut':k,'eventsAtOrAbove':round(float((ev.OR>=k).mean()),3),'ordinaryDaysAtOrAbove':round(float((od.OR>=k).mean()),4),'ordinaryDaysPerYearPerPlace':round(float((od.OR>=k).mean()*365),1)} for k in cuts]
mon=Ds[Ds.mo.isin([6,7,8,9])]; dry=Ds[~Ds.mo.isin([6,7,8,9])]
from sklearn.metrics import roc_auc_score as A
res={'servedAuc':round(float(auc_s),3),'bands':tab,'detection':det,'aucMonsoon':round(float(A(mon.y,np.log(mon.OR))),3),'aucOther':round(float(A(dry.y,np.log(dry.OR))),3),'eventsMonsoon':int(mon.y.sum()),'eventsOther':int(dry.y.sum())}
json.dump(res,open('/home/claude/nig/landslide/indep/level_test.json','w'),indent=1); print(json.dumps(res,indent=1))
