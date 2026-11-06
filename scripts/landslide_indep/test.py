"""Independent test of the served landslide odds model on events after its training period (2018-2026),
from the user-supplied GB landslide inventory (Landslide_events.shp) and the COOLR HKH export (LS_inven.csv).
Rain: ERA5 daily at the event point (same archive and cache as the training). Served odds = national median ordinary day of the month."""
import sys, json, datetime as dt, numpy as np, pandas as pd, geopandas as gpd
sys.path.insert(0, '/home/claude/nig/station-lake/scripts'); import landslide_backtest as LB
from sklearn.metrics import roc_auc_score
U = '/mnt/user-data/uploads/AI_GEO_NIGRAAN_local_and_react_v91_17/deploy/DROP_DATA_HERE/Data_9_23/GB_Landslide_layers/Landslide_inventory/'
M = json.load(open('/home/claude/nig/nigraan-local/data/landslide-odds-model.json'))
KEY = open('/home/claude/nig/nigraan-local/mach.key').read().strip()
e = gpd.read_file(U + 'Landslide_points/Landslide_events.shp')
e = e[e.Date.astype(str).str.match(r'^\d{4}-\d{2}-\d{2}$') & e.Trigger.astype(str).str.startswith('Rainfall') & ~e.Data_Quali.isin(['regional', '50km', '100km'])]
A = pd.DataFrame({'src': 'gb_inventory', 'date': e.Date.astype(str), 'lat': e.Latitude.astype(float), 'lon': e.Longitude.astype(float), 'name': e.Location.astype(str)})
l = pd.read_csv(U + 'LS_inven.csv'); l = l[l.trigger.isin(['rain', 'downpour', 'continuous_rain', 'monsoon'])]
B = pd.DataFrame({'src': 'coolr_hkh', 'date': l.date.astype(str).str[:10], 'lat': l.latitude, 'lon': l.longitude, 'name': l.location.astype(str)})
E = pd.concat([A, B]); E = E[(E.date >= '2018-01-01') & (E.date <= '2026-09-20')]
E['cell'] = (E.lat.round(1)).astype(str) + ',' + (E.lon.round(1)).astype(str)
E = E.drop_duplicates(['cell', 'date']).reset_index(drop=True)
print('events', len(E), E.src.value_counts().to_dict(), 'cells', E.cell.nunique(), flush=True)
def api15(dv, i): k = np.arange(0, min(60, i + 1)); return float(np.nansum(dv[i - k] * np.exp(-k / 15)))
ref = lambda mo: M['referenceByMonth'].get(str(mo), M['reference'])
def OR(f, mo): r = ref(mo); return float(np.exp(sum(c * (np.log1p(f[k]) - np.log1p(r[k])) for k, c in zip(M['features'], M['coef']))))
rows = []
for cell, g in E.groupby('cell'):
    r0 = g.iloc[0]
    try: dd = LB.fetch(r0.lat, r0.lon, '2017-09-01', '2026-09-25', False, KEY)
    except Exception as ex: print('fetch fail', cell, str(ex)[:80], flush=True); continue
    dts = dd['daily']['time']; dv = np.array([np.nan if x is None else x for x in dd['daily']['precipitation_sum']], float)
    ix = {d: i for i, d in enumerate(dts)}; evd = set(pd.to_datetime(g.date).dt.date); months = set(pd.to_datetime(g.date).dt.month)
    P = lambda n, i: float(np.nansum(dv[max(0, i - n + 1):i + 1]))
    feat = lambda i: {'P1': max(P(1, i), P(1, i + 1) if i + 1 < len(dv) and not np.isnan(dv[i + 1]) else 0), 'P3': P(3, i), 'P7': P(7, i), 'API15': api15(dv, i)}
    for r in g.itertuples():
        if r.date not in ix or ix[r.date] < 60 or np.isnan(dv[ix[r.date]]): continue
        i = ix[r.date]; f = feat(i); rows.append((cell, r.src, r.date, 1, OR(f, int(r.date[5:7])), f['P1'], f['P7']))
    for i in range(60, len(dv) - 1):
        if np.isnan(dv[i]): continue
        d = dt.date.fromisoformat(dts[i])
        if not any(abs(((d.month - m + 6) % 12) - 6) <= 1 for m in months) or any(abs((d - x).days) <= 3 for x in evd): continue
        f = feat(i); rows.append((cell, None, dts[i], 0, OR(f, d.month), f['P1'], f['P7']))
T = pd.DataFrame(rows, columns=['cell', 'src', 'date', 'y', 'OR', 'P1', 'P7'])
y = T.y.values; auc = roc_auc_score(y, np.log(T.OR)); print('cases', int(y.sum()), 'controls', int((1 - y).sum()), 'AUC', round(auc, 3))
bands = [0, 1, 2, 5, 10, 20, 1e9]; lab = ['<1', '1-2', '2-5', '5-10', '10-20', '>=20']
T['band'] = pd.cut(T.OR, bands, labels=lab, right=False)
refd = T[(T.OR >= 0.5) & (T.OR < 2)]; rr = refd.y.sum() / max((refd.y == 0).sum(), 1)
cal = []
for b, g in T.groupby('band', observed=True):
    ev, ct = int(g.y.sum()), int((g.y == 0).sum()); cal.append({'band': str(b), 'events': ev, 'ordinaryDays': ct, 'observedVsOrdinaryDay': round(float((ev / max(ct, 1)) / rr), 2) if rr else None})
print(json.dumps(cal))
# bootstrap AUC by cell
rng = np.random.default_rng(1); cells = T.cell.unique(); bs = []
for _ in range(300):
    s = rng.choice(cells, len(cells)); D = pd.concat([T[T.cell == c] for c in s])
    if D.y.sum() and (1 - D.y).sum(): bs.append(roc_auc_score(D.y, np.log(D.OR)))
lo, hi = np.percentile(bs, [2.5, 97.5])
out = {'design': 'independent: events after the training period (2018-2026), user-supplied GB inventory + COOLR HKH; served reference', 'events': int(y.sum()), 'ordinaryDays': int((1 - y).sum()), 'cells': int(T.cell.nunique()), 'auc': round(float(auc), 3), 'auc95': [round(float(lo), 3), round(float(hi), 3)], 'calibration': cal,
       'eventsAboveOR2': int(((T.y == 1) & (T.OR >= 2)).sum()), 'eventsAboveOR5': int(((T.y == 1) & (T.OR >= 5)).sum())}
json.dump(out, open('/home/claude/nig/landslide/indep/result.json', 'w'), indent=1); T.to_csv('/home/claude/nig/landslide/indep/scored.csv', index=False); print(json.dumps(out))
