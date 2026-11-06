"""WS5 v283 item 2 (audit A8): monotone refit of the rain-triggered landslide odds model, held-out comparison with the served form.
Design = station-lake/scripts/landslide_prob_liquid.py (case-control on the NASA Global Landslide Catalog 2007-2017, controls at
the same cell, month +-1, not within 3 days of an event). Rain: NASA POWER daily (MERRA-2, PRECTOTCORR minus PRECSNOLAND = liquid)
at the event cell, because the served model's ERA5 cache is not in the cloud. All candidate models are refitted on THIS rain, so the
comparison isolates the method (constraint), not the rain source.
  A  current form: logistic on log1p P1, P3, P7, unconstrained (the served method)
  S  served coefficients as shipped (0.238, 0.921, -0.410) applied to this rain (no refit; basis differs: reference only)
  B  monotone: same features, every coefficient constrained >= 0 (more rain never lowers the odds)
  B2 monotone, P7 dropped (P1, P3)
Held out: (1) leave-one-year-out; (2) strict time split, fit 2007-2013, test 2014-2017. AUC with year-block bootstrap CIs,
paired AUC differences, calibration of the served odds-ratio bands (reference = national median ordinary day of the month,
fitted without the test year), and the A8 monotonicity defect rate (share of case days where adding 10 mm to day -4..-7 lowers OR).
Slope cannot be fitted in this design: cases and controls share the cell, so slope has no contrast (it belongs to susceptibility).
usage: python3 landslide_monotone_test.py <landslide_events.csv> <rain dir> <out json> [--era5] [--write-model <model json>]
  --era5         <rain dir> is the served model's ERA5 cache (station-lake/../landslide/cache, the landslide_backtest.py cache of
                 customer-archive-api rain_sum 2007-2017 per cell; file = sha1 of the request URL without the key), not NASA POWER.
  --served-model <json>  the installed model: the rebuilt cache must reproduce its case and control counts exactly (cache check)
  --write-model  if the SERVE RULE holds, write a served-format model file (features P1, P3) to this path.
SERVE RULE (coordinator, 21 Oct 2026; stated before the ERA5 run): B2 is served when it is NOT WORSE than the current form - the
  paired AUC difference B2 - A has an upper 95 % bound >= 0 in BOTH designs (leave-one-year-out and 2007-13 -> 2014-17) - AND it
  removes the A8 defect (share of event days where more week rain lowers the odds = 0). Removing a physically wrong sign at no
  skill loss counts as a win.
  Only rain on the SAME basis as the served model (ERA5) may produce a served file."""
import sys, os, json, hashlib, urllib.parse, numpy as np, pandas as pd
from scipy.optimize import minimize
from sklearn.metrics import roc_auc_score
EVF, C, OUT = sys.argv[1:4]; ERA5 = '--era5' in sys.argv; WM = sys.argv[sys.argv.index('--write-model') + 1] if '--write-model' in sys.argv else None
HOST = 'https://customer-archive-api.open-meteo.com/v1/archive'; missing = []
EV = pd.read_csv(EVF)
rows = []; series = {}
for cell, g in EV.groupby('cell'):
    if ERA5:
        r0 = g.iloc[0]; q = {'latitude': round(r0.lat, 4), 'longitude': round(r0.lon, 4), 'start_date': '2007-01-01', 'end_date': '2017-12-31', 'timezone': 'UTC', 'daily': 'rain_sum'}
        f = os.path.join(C, hashlib.sha1((HOST + '?' + urllib.parse.urlencode(q) + '&').encode()).hexdigest() + '.json')
        if not os.path.exists(f): missing.append(cell); continue
        j = json.load(open(f)); dts = j['daily']['time']; dv = np.array([np.nan if x is None else x for x in j['daily']['rain_sum']], float)
    else:
        f = os.path.join(C, cell.replace(',', '_') + '.json')
        if not os.path.exists(f): missing.append(cell); continue
        j = json.load(open(f)); ks = sorted(j['P']); P = np.array([j['P'][k] for k in ks], float); S = np.array([j['S'].get(k, 0) for k in ks], float)
        P[P < 0] = np.nan; S[S < 0] = 0; dv = np.clip(P - S, 0, None)
        dts = [f'{k[:4]}-{k[4:6]}-{k[6:]}' for k in ks]
    ix = {d: i for i, d in enumerate(dts)}
    ev_days = set(pd.to_datetime(g.date).dt.date); months = set(pd.to_datetime(g.date).dt.month)
    Pn = lambda n, i: float(np.nansum(dv[max(0, i-n+1):i+1]))
    feat = lambda i: (max(Pn(1, i), Pn(1, i+1) if i+1 < len(dv) else 0), Pn(3, i), Pn(7, i))
    series[cell] = (dv, ix)
    for r in g.itertuples():
        if r.date not in ix or ix[r.date] < 60: continue
        i = ix[r.date]; rows.append((cell, int(r.date[:4]), int(r.date[5:7]), i, 1) + feat(i))
    dd = np.array(dts, dtype='datetime64[D]'); mo = (dd.astype('datetime64[M]').astype(int) % 12) + 1; yr_ = dd.astype('datetime64[Y]').astype(int) + 1970
    keep = np.zeros(len(dv), bool); keep[60:] = True
    keep &= np.any([np.abs(((mo - m + 6) % 12) - 6) <= 1 for m in months], axis=0)
    for e in ev_days: keep &= np.abs((dd - np.datetime64(e, 'D')).astype(int)) > 3
    c1 = np.concatenate([[0.0], np.cumsum(np.nan_to_num(dv))]); idx = np.where(keep)[0]
    win = lambda n: c1[idx + 1] - c1[np.maximum(0, idx - n + 1)]
    nxt = np.where(idx + 1 < len(dv), np.nan_to_num(dv[np.minimum(idx + 1, len(dv) - 1)]), 0.0)
    p1 = np.maximum(np.nan_to_num(dv[idx]), nxt)
    for i, a1, a3, a7 in zip(idx, p1, win(3), win(7)): rows.append((cell, int(yr_[i]), int(mo[i]), int(i), 0, float(a1), float(a3), float(a7)))
T = pd.DataFrame(rows, columns=['cell', 'year', 'month', 'i', 'y', 'P1', 'P3', 'P7'])
F = ['P1', 'P3', 'P7']; X = np.log1p(T[F].values); y = T.y.values; yrs = T.year.values
def fit(Xt, yt, nonneg, C=1.0):
    k = Xt.shape[1]
    def nll(w):
        z = w[0] + Xt @ w[1:]; p = 1/(1+np.exp(-z))
        l = -np.sum(yt*np.log(p+1e-12) + (1-yt)*np.log(1-p+1e-12)) + 0.5*np.sum(w[1:]**2)/C
        g0 = p - yt; return l, np.concatenate([[g0.sum()], Xt.T @ g0 + w[1:]/C])
    b = [(None, None)] + [((0, None) if nonneg else (None, None))]*k
    r = minimize(nll, np.zeros(k+1), jac=True, method='L-BFGS-B', bounds=b); return r.x
SERVED = np.array([0.23773, 0.92089, -0.41015])
cols = {'A': [0, 1, 2], 'B': [0, 1, 2], 'B2': [0, 1]}
def loyo():
    oof = {m: np.full(len(T), np.nan) for m in ['A', 'B', 'B2', 'S']}; coefs = {m: [] for m in ['A', 'B', 'B2']}
    for yr in sorted(set(yrs)):
        tr = yrs != yr; te = ~tr
        if y[te].sum() == 0: continue
        for m in ['A', 'B', 'B2']:
            w = fit(X[tr][:, cols[m]], y[tr], m != 'A'); oof[m][te] = X[te][:, cols[m]] @ w[1:]; coefs[m].append(w[1:].tolist())
        oof['S'][te] = X[te] @ SERVED
    return oof, coefs
oof, coefs = loyo()
ok = ~np.isnan(oof['A'])
def auc_ci(sc, mask, nb=300, seed=5):
    rng = np.random.default_rng(seed); ys = sorted(set(yrs[mask])); out = []
    idx = {k: np.where(mask & (yrs == k))[0] for k in ys}
    for _ in range(nb):
        ii = np.concatenate([idx[k] for k in rng.choice(ys, len(ys))])
        if 0 < y[ii].sum() < len(ii): out.append(sc(ii))
    return [round(float(np.percentile(out, 2.5)), 3), round(float(np.percentile(out, 97.5)), 3)]
res = {'loyo': {}}
for m in ['A', 'S', 'B', 'B2']:
    s = oof[m]; res['loyo'][m] = dict(auc=round(float(roc_auc_score(y[ok], s[ok])), 3), ci95=auc_ci(lambda ii: roc_auc_score(y[ii], s[ii]), ok))
for m in ['B', 'B2', 'S']:
    a, b = oof[m], oof['A']; res['loyo']['diff_%s_minus_A' % m] = auc_ci(lambda ii: roc_auc_score(y[ii], a[ii]) - roc_auc_score(y[ii], b[ii]), ok)
res['loyo']['coef_mean'] = {m: np.round(np.mean(coefs[m], 0), 3).tolist() for m in coefs}
res['loyo']['A_P7_negative_in_folds'] = int(sum(c[2] < 0 for c in coefs['A'])); res['loyo']['folds'] = len(coefs['A'])
# strict time split
tr = yrs <= 2013; te = yrs >= 2014; ts = {}
W = {}
for m in ['A', 'B', 'B2']:
    W[m] = fit(X[tr][:, cols[m]], y[tr], m != 'A'); ts[m] = X[:, cols[m]] @ W[m][1:]
ts['S'] = X @ SERVED
res['time_split'] = {'train': '2007-2013', 'test': '2014-2017', 'cases_test': int(y[te].sum()), 'controls_test': int((1-y[te]).sum())}
for m in ['A', 'S', 'B', 'B2']:
    s = ts[m]; res['time_split'][m] = dict(auc=round(float(roc_auc_score(y[te], s[te])), 3), ci95=auc_ci(lambda ii: roc_auc_score(y[ii], s[ii]), te), coef=(W[m][1:].round(3).tolist() if m in W else SERVED.tolist()))
for m in ['B', 'B2', 'S']:
    a, b = ts[m], ts['A']; res['time_split']['diff_%s_minus_A' % m] = auc_ci(lambda ii: roc_auc_score(y[ii], a[ii]) - roc_auc_score(y[ii], b[ii]), te)
# served-form calibration (LOYO): OR vs the national median ordinary day of the month, fitted without the test year
def calib(m):
    s = oof[m]; D = T[ok].assign(s=s[ok]); out = []
    lor = np.empty(len(D))
    for yr in sorted(set(D.year)):
        trm = (D.year != yr) & (D.y == 0); ref = D[trm].groupby('month').s.median(); te_ = D.year == yr
        lor[te_.values] = D.s[te_].values - D.month[te_].map(ref).values
    D['OR'] = np.exp(lor); bands = [0, 1, 2, 5, 10, 20, 1e9]; lab = ['<1', '1-2', '2-5', '5-10', '10-20', '>=20']
    D['band'] = pd.cut(D.OR, bands, labels=lab, right=False); base = D.y.sum() / (D.y == 0).sum()
    for b, g in D.groupby('band', observed=True):
        ev = int(g.y.sum()); od = int((g.y == 0).sum()); out.append(dict(band=str(b), events=ev, ordinaryDays=od, observedVsOrdinaryDay=round((ev/od)/base, 2) if od else None))
    return out
res['served_form_calibration_loyo'] = {m: calib(m) for m in ['A', 'B', 'B2']}
# A8 defect rate: add 10 mm to day i-4 (inside P7, outside P3 and P1) and see if OR drops
def defect(w, cs):
    lo = 0
    for r in T[T.y == 1].itertuples():
        x0 = np.log1p([r.P1, r.P3, r.P7])[cs]; x1 = np.log1p([r.P1, r.P3, r.P7 + 10])[cs]; lo += (x1 - x0) @ w < 0
    return round(lo / int(T.y.sum()), 3)
res['a8_more_week_rain_lowers_odds_share'] = {'served': defect(SERVED, [0, 1, 2]), 'A_time_split': defect(W['A'][1:], cols['A']), 'B_time_split': defect(W['B'][1:], cols['B']), 'B2_time_split': defect(W['B2'][1:], cols['B2'])}
res['data'] = dict(cases=int(y.sum()), controls=int((1-y).sum()), cells=int(T.cell.nunique()), rain=('ERA5 daily rain_sum (served model cache)' if ERA5 else 'NASA POWER daily MERRA-2 PRECTOTCORR - PRECSNOLAND (liquid), cell point, LST day'), cellsMissingRain=len(missing))
lo, ts_ = res['loyo']['diff_B2_minus_A'], res['time_split']['diff_B2_minus_A']
SM = json.load(open(sys.argv[sys.argv.index('--served-model') + 1])) if '--served-model' in sys.argv else None
repro = None if SM is None else bool(SM['validation']['cases'] == int(y.sum()) and SM['validation']['controls'] == int((1 - y).sum()))
res['cache_check'] = None if SM is None else dict(served_cases=SM['validation']['cases'], served_controls=SM['validation']['controls'], rebuilt_cases=int(y.sum()), rebuilt_controls=int((1 - y).sum()), reproduced=repro,
    unconstrained_full_fit_coef=fit(X, y, False)[1:].round(3).tolist(), served_coef=SM.get('coef'))
rule = bool(lo[1] >= 0 and ts_[1] >= 0 and res['a8_more_week_rain_lowers_odds_share']['B2_time_split'] == 0 and not missing and repro is not False)   # every catalogue cell must have its rain
res['serve_rule'] = dict(rule='B2 not worse (upper bound of paired AUC difference >= 0 in both designs), A8 share 0, rain for every cell', met=rule, basisServable=ERA5)
if WM and rule and ERA5:
    w = fit(X[:, [0, 1]], y, True); Dc = T[T.y == 0]
    refm = {str(m): {k: round(float(g[k].median()), 1) for k in ['P1', 'P3']} for m, g in Dc.groupby('month')}
    model = {'built': pd.Timestamp.now(tz='UTC').isoformat()[:19] + 'Z', 'version': 'landslide-odds-91.17.283-monotone', 'features': ['P1', 'P3'], 'transform': 'log(1 + mm)',
      'coef': [round(float(v), 5) for v in w[1:]], 'constraint': 'every coefficient >= 0 (more rain never lowers the odds); P7 dropped (audit A8)',
      'note': 'odds ratio = exp(coef . (x - x_ref)), x_ref = the features of an ordinary day; the intercept is not used',
      'reference': {k: round(float(Dc[k].median()), 1) for k in ['P1', 'P3']}, 'referenceByMonth': refm,
      'validation': {'design': 'leave-one-year-out 2007-2017 and fit 2007-2013 / test 2014-2017', 'cases': int(y.sum()), 'controls': int((1 - y).sum()), 'cells': int(T.cell.nunique()),
        'auc': res['loyo']['B2']['auc'], 'aucCi95': res['loyo']['B2']['ci95'], 'timeSplitAuc': res['time_split']['B2']['auc'], 'pairedVsCurrentLoyo': lo, 'pairedVsCurrentTimeSplit': ts_,
        'served': {'reference': 'national median ordinary day of the month (fitted without the test year)', 'calibration': res['served_form_calibration_loyo']['B2']}},
      'source': 'NASA Global Landslide Catalog (Kirschbaum et al. 2010, 2015), rain-triggered events 2007-2017; ERA5 daily liquid rain (rain_sum) at the event point',
      'serveRule': res['serve_rule']['rule']}
    json.dump(model, open(WM, 'w'), indent=1); res['serve_rule']['wrote'] = WM
json.dump(res, open(OUT, 'w'), indent=1); print(json.dumps(res, indent=1))
