"""SCI item 3 · audit A3 · does the hourly-rain ladder (or the day-total trigger) explain where 2025 flooding happened outside the
riverine domain? Rule: /tmp/claude-0/sci/RULES.md item 3.
usage: python3 a3_trigger_test.py <fx work dir> <imerg2025.npz> <pk-tehsils.json> <out.json>"""
import sys, json, numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy.stats import spearmanr, rankdata
from shapely.geometry import shape, Point
W, IM, TJ, OUT = sys.argv[1:5]
meta = json.load(open(f'{W}/fx_meta.json')); Z = np.load(f'{W}/fx_terrain.npz'); dist = Z['dist']
DOM = 29.0; BANDS = [2.3, 5.3, 7.2, 7.7]
obs = np.load(f'{W}/fx_obs_2025.npy'); fr = meta['frames']['2025']
H, Wd = obs.shape; cell = meta['cell']; T = from_origin(meta['west'] + meta['c0'] * cell, meta['north'] - meta['r0'] * cell, cell, cell)
TH = json.load(open(TJ))['features']
tid = rasterize(((f['geometry'], i + 1) for i, f in enumerate(TH)), out_shape=(H, Wd), transform=T, fill=0, dtype='uint16')
nonriv = ~(dist <= DOM)                       # beyond the riverine domain (NaN = beyond the 60 km storage cap)
lat = meta['north'] - (meta['r0'] + np.arange(H) + 0.5) * cell; lon = meta['west'] + (meta['c0'] + np.arange(Wd) + 0.5) * cell
inframe = ((lat >= fr[1]) & (lat <= fr[3]))[:, None] & ((lon >= fr[0]) & (lon <= fr[2]))[None, :]
sel = nonriv & inframe & (tid > 0)
n_all = np.bincount(tid[sel], minlength=len(TH) + 1); n_fl = np.bincount(tid[sel], weights=obs[sel], minlength=len(TH) + 1)
frame_share = float(n_fl.sum() / n_all.sum())
R = np.load(IM); glat, glon = R['lat'], R['lon']
rows = []
for i, f in enumerate(TH):
    g = shape(f['geometry']); c = g.centroid
    if not (fr[0] <= c.x <= fr[2] and fr[1] <= c.y <= fr[3]): continue
    if n_all[i + 1] < 40: continue           # fewer than ~2.5 km2 of non-riverine land in the frame
    a, b, cc, d = g.bounds
    ii = np.where((glat >= b) & (glat <= d))[0]; jj = np.where((glon >= a) & (glon <= cc))[0]
    pts = [(p, q) for p in ii for q in jj if g.contains(Point(glon[q], glat[p]))]
    if not pts: p = int(np.abs(glat - c.y).argmin()); q = int(np.abs(glon - c.x).argmin()); pts = [(p, q)]
    hm = max(float(R['hmax'][p, q]) for p, q in pts); dm = max(float(R['dmax'][p, q]) for p, q in pts); nn = max(int(R['n25'][p, q]) for p, q in pts)
    if not np.isfinite(hm): continue
    rows.append(dict(uid=f['properties']['uid'], share=float(n_fl[i + 1] / n_all[i + 1]), cells=int(n_all[i + 1]), P_hour=hm, P_ladder=int(sum(hm >= x for x in BANDS)), P_day=dm, P_d25=nn))
y = np.array([r['share'] > frame_share for r in rows]); s = np.array([r['share'] for r in rows])
def auc(x, y):
    r = rankdata(x); n1 = y.sum(); n0 = len(y) - n1; return float((r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))
P = {k: np.array([r[k] for r in rows], float) for k in ['P_hour', 'P_ladder', 'P_day', 'P_d25']}
rng = np.random.default_rng(3); B = 2000; boots = {k: [] for k in P}; rho = {k: [] for k in P}
for _ in range(B):
    ix = rng.integers(0, len(rows), len(rows)); yy = y[ix]
    if yy.all() or not yy.any(): continue
    for k in P: boots[k].append(auc(P[k][ix], yy)); rho[k].append(spearmanr(P[k][ix], s[ix]).statistic)
ci = lambda v: [round(float(np.percentile(v, 2.5)), 3), round(float(np.percentile(v, 97.5)), 3)]
res = dict(event='2025 (15 Jun - 30 Sep), extent Flood_2025.shp, cells > %g km from the major rivers' % DOM, tehsils=len(rows), events=int(y.sum()), frameShare=round(frame_share, 4),
           metrics={k: dict(auc=round(auc(P[k], y), 3), auc_ci=ci(boots[k]), rho=round(float(spearmanr(P[k], s).statistic), 3), rho_ci=ci(rho[k])) for k in P},
           paired={k + '-P_hour': dict(auc_diff_ci=ci(np.array(boots[k]) - np.array(boots['P_hour'])), rho_diff_ci=ci(np.array(rho[k]) - np.array(rho['P_hour']))) for k in ['P_ladder', 'P_day', 'P_d25']})
sup = res['metrics']['P_hour']['auc_ci'][0] > 0.5
res['ladderSupported'] = bool(sup)
res['promote'] = [k for k in ['P_day', 'P_d25'] if res['metrics'][k]['auc_ci'][0] > 0.5 and res['paired'][k + '-P_hour']['auc_diff_ci'][0] > 0]
res['rows'] = rows
json.dump(res, open(OUT, 'w'), indent=1); r2 = dict(res); r2.pop('rows'); print(json.dumps(r2, indent=1))
