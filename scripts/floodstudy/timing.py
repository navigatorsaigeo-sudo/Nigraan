import json, numpy as np, pandas as pd, datetime as dt
from sklearn.metrics import roc_auc_score
W = json.load(open('weekly2022.json')); R = json.load(open('rain_jas.json'))
d0 = dt.date(2022, 7, 1); days = [d0 + dt.timedelta(i) for i in range(92)]
wk = {k: (dt.date.fromisoformat(f'{k[6:10]}-{k[10:12]}-{k[12:14]}'), dt.date.fromisoformat(f'{k[15:19]}-{k[19:21]}-{k[21:23]}')) for k in W}
weekly = [k for k in W if (wk[k][1] - wk[k][0]).days <= 21]
units = [u for u in W[weekly[0]]['flooded'] if u in R and R[u].get('2022')]
rain = {u: np.nan_to_num(np.array([x if x is not None else np.nan for x in R[u]['2022']], float)) for u in units}
out = {'windows': {}, 'lagScan': {}, 'persistence': {}}
for k in sorted(weekly, key=lambda k: wk[k][0]):
    s, e = wk[k]; y = np.array([W[k]['flooded'][u] >= 0.01 for u in units])
    out['windows'][k] = {'start': str(s), 'end': str(e), 'flooded': int(y.sum())}
    i0 = (s - d0).days
    if i0 < 14 or i0 > 92: continue
    res = {}
    for n in (3, 7, 14, 30, 45, 60):
        x = np.array([rain[u][max(0, i0 - n):min(i0, 92)].sum() for u in units])
        res[n] = round(float(roc_auc_score(y, x)), 3) if 0 < y.sum() < len(y) else None
    out['lagScan'][k] = res; print(k, int(y.sum()), res, flush=True)
# persistence: of tehsils flooded in a window, share still flooded in each later window
ks = sorted(weekly, key=lambda k: wk[k][0]); base = [k for k in ks if k.startswith('VIIRS_20220825')][0]
f0 = {u for u in units if W[base]['flooded'][u] >= 0.01}
for k in ks:
    if wk[k][0] < wk[base][0]: continue
    out['persistence'][k] = round(len([u for u in f0 if W[k]['flooded'][u] >= 0.01]) / len(f0), 3)
# total flooded area (km2) per window
A = json.load(open('/home/claude/nig/floodstudy/water_feats.json'))
out['areaKm2'] = {k: round(sum(W[k]['flooded'][u] * A[u]['areaKm2'] for u in W[k]['flooded'] if u in A)) for k in ks}
json.dump(out, open('timing2022.json', 'w'), indent=1); print(json.dumps({'persistence': out['persistence'], 'areaKm2': out['areaKm2']}, indent=0))
# decay scan: antecedent index API_tau at window start, pooled over post-peak windows, with and without the land-only susceptibility p
S = json.load(open('/home/claude/nig/nigraan-local/data/flood-susceptibility.json'))
SU = S.get('units') or {}
pp = lambda u: (SU.get(u) or {}).get('p')
rows = []
for k in ks:
    s, e = wk[k]; i0 = (s - d0).days
    if s < dt.date(2022, 8, 25) or i0 > 92: continue
    for u in units:
        if pp(u) is None: continue
        r = rain[u][:min(i0, 92)]; lag = np.arange(len(r))[::-1]
        rows.append({'k': k, 'u': u, 'y': int(W[k]['flooded'][u] >= 0.01), 'p': pp(u), **{f'api{t}': float((r * np.exp(-lag / t)).sum()) for t in (7, 15, 30, 45, 60, 90)}})
D = pd.DataFrame(rows); from sklearn.linear_model import LogisticRegression
dec = {}
for t in (7, 15, 30, 45, 60, 90):
    X = np.c_[np.log1p(D[f'api{t}']), np.log(D.p / (1 - D.p))]; P = np.zeros(len(D))
    for k in D.k.unique():   # leave one window out
        te = (D.k == k).values; m = LogisticRegression().fit(X[~te], D.y[~te]); P[te] = m.predict_proba(X[te])[:, 1]
    dec[t] = {'aucApiOnly': round(float(roc_auc_score(D.y, D[f'api{t}'])), 3), 'aucApiPlusSusceptibility': round(float(roc_auc_score(D.y, P)), 3)}
X = np.log(D.p / (1 - D.p)).values; dec['susceptibilityOnly'] = round(float(roc_auc_score(D.y, X)), 3)
out['decayScan'] = dec; out['decayRows'] = int(len(D)); json.dump(out, open('timing2022.json', 'w'), indent=1); print(json.dumps(dec, indent=0))
