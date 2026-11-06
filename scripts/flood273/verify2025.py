"""v91.17.273 FLOOD · the served pluvial level replayed on the 2025 monsoon (replay2025.mjs, IFS as-issued rain) against the 2025
flood extent NIGRAAN holds (extent-share.json). Season Jun 12 - Sep 30 (after a 10-day rain-memory spin-up).
Tables: per level, tehsils whose season peak level reached it: hit rate (flooded tehsils caught) and false-alarm ratio (warned
tehsils not flooded), national and per zone; AUC of the season peak score and of the days at Moderate or above; the same for the
observed CHIRPS rain as a reference. A refit of the cuts can only be tested on held-out YEARS: one replayable year (2025) exists, so
the isotonic fit is shown with held-out provinces for information only and nothing is served from it."""
import json, gzip, sys, os, numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.isotonic import IsotonicRegression
ROOT = sys.argv[1]; D = os.path.join(ROOT, 'data')
TAG = sys.argv[2] if len(sys.argv) > 2 else ''
R = json.load(open(f'{D}/flood273/replay2025{TAG}.json')); SH = json.load(open(f'{D}/flood273/extent-share.json'))['shares']['2025']
Z = {}
for f in ('fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz'):
    for l in gzip.open(f'{D}/archive/forecast/{f}', 'rt'):
        try: r = json.loads(l); Z[r['u']] = r.get('z')
        except Exception: pass
dates = R['dates']; i0 = dates.index('2025-06-12')
rows = []
for u, v in R['units'].items():
    if u not in SH: continue
    L = [x for x in v['L'][i0:] if x is not None]; S = [x for x in v['s'][i0:] if x is not None]
    if not L: continue
    if max(L) == -2: continue   # outside the pluvial mask (none expected)
    rows.append(dict(u=u, z=Z.get(u) or 'unknown', prov=u.split('|')[0], f=int(SH[u] >= 0.01), share=SH[u], maxL=max(L), maxS=max(S) if S else np.nan,
                     dM=sum(1 for x in L if x >= 2), dL=sum(1 for x in L if x >= 1), nd=sum(1 for x in v['L'][i0:] if x == -1)))
import pandas as pd
df = pd.DataFrame(rows)
out = {'tehsils': len(df), 'flooded': int(df.f.sum()), 'season': [dates[i0], dates[-1]], 'basis': R['basis'],
       'seasonPeakLevelCounts': df.maxL.value_counts().sort_index().to_dict(), 'noDataUnitDays': int(df.nd.sum())}
def auc(y, s):
    m = np.isfinite(s); return round(float(roc_auc_score(y[m], s[m])), 3) if len(set(y[m])) > 1 else None
out['auc'] = {'seasonPeakScore': auc(df.f.values, df.maxS.values), 'daysModerateOrAbove': auc(df.f.values, df.dM.values.astype(float)), 'daysLowOrAbove': auc(df.f.values, df.dL.values.astype(float)),
              'byZone_peakScore': {z: auc(g.f.values, g.maxS.values) for z, g in df.groupby('z')}}
tab = {}
for scope, g in [('all', df)] + [(z, gz) for z, gz in df.groupby('z')]:
    t = {}
    for L in range(1, 5):
        at = g[g.maxL >= L]
        t[L] = {'warned': int(len(at)), 'hits': int(at.f.sum()), 'hitRate': round(at.f.sum() / max(g.f.sum(), 1), 3) if g.f.sum() else None,
                'falseAlarmRatio': round(1 - at.f.mean(), 3) if len(at) else None}
    tab[scope] = {'tehsils': int(len(g)), 'flooded': int(g.f.sum()), 'byLevel': t}
out['hitFalseAlarm'] = tab
# information only: isotonic flooded-share on the season peak score, provinces held out
P = np.full(len(df), np.nan)
for pv in df.prov.unique():
    te = (df.prov == pv).values; tr = ~te & np.isfinite(df.maxS.values)
    if te.sum() == 0 or df.f.values[tr].sum() == 0: continue
    iso = IsotonicRegression(out_of_bounds='clip').fit(df.maxS.values[tr], df.f.values[tr]); m = te & np.isfinite(df.maxS.values); P[m] = iso.predict(df.maxS.values[m])
m = np.isfinite(P); base = df.f.mean()
out['isotonicHeldOutProvinces_infoOnly'] = {'auc': auc(df.f.values[m], P[m]), 'brierSkillVsClimatology': round(1 - np.mean((P[m] - df.f.values[m]) ** 2) / np.mean((base - df.f.values[m]) ** 2), 3)}
json.dump(out, open(f'{D}/flood273/verify2025{TAG}.json', 'w'), indent=1, default=str)
print(json.dumps(out, indent=1, default=str))
