"""Cross-check of NIGRAAN's rain-deficit index (CHIRPS v3 pentads, tehsil mean) against the user-supplied ERA5 pixelwise SPI-3
(1980-2025, gamma, calibrated 1980-2025). Same definition on our side: 3-month totals ending Mar/Jun/Sep/Dec, gamma with zero
adjustment, fitted per tehsil and season on 1991-2020. Compared per tehsil-season 1991-2025: Pearson r, drought (<= -1) agreement, kappa."""
import json, numpy as np, pandas as pd, xarray as xr, geopandas as gpd
from scipy import stats
z = np.load('/home/claude/nig/nigraan-local/data/chirps-tehsil.npz', allow_pickle=True); P = z['P']; K = z['keys']; U = z['uids']
yr = np.array([int(k[:4]) for k in K]); mo = np.array([int(k[5:7]) for k in K])
rows = {}
for y in range(1991, 2026):
    for end in (3, 6, 9, 12):
        ms = [end - 2, end - 1, end]; sel = (yr == y) & np.isin(mo, ms)
        if sel.sum() == 18: rows[(y, end)] = np.nansum(P[:, sel], 1)
def spi(series, cal):
    x = np.asarray(series, float); c = np.asarray(cal, float); q = (c <= 0).mean(); pos = c[c > 0]
    if len(pos) < 10: return np.full(len(x), np.nan)
    a, loc, sc = stats.gamma.fit(pos, floc=0); F = np.where(x > 0, q + (1 - q) * stats.gamma.cdf(x, a, loc=0, scale=sc), q)
    return stats.norm.ppf(np.clip(F, 1e-3, 1 - 1e-3))
ours = {}
for end in (3, 6, 9, 12):
    ys = [y for y in range(1991, 2026) if (y, end) in rows]; M = np.array([rows[(y, end)] for y in ys])
    cal = np.array([y <= 2020 for y in ys])
    for i, u in enumerate(U):
        s = spi(M[:, i], M[cal, i])
        for j, y in enumerate(ys): ours[(u, y, end)] = s[j]
d = xr.open_dataset('/mnt/user-data/uploads/AI_GEO_NIGRAAN_local_and_react_v91_17/deploy/DROP_DATA_HERE/Data_9_23/Metrological drought/PIXELWISE_SPI3_SPEI3_FOUR_PERIODS_NO_MK_POINTS_1980_2025/Pakistan_Pixelwise_SPI3_SPEI3_No_MK_Points_1980_2025.nc')
T = gpd.read_file('/home/claude/nig/nigraan-local/data/pk-tehsils.json').set_index('uid'); T = T[T.index.isin(U)]
pts = T.to_crs(6933).representative_point().to_crs(4326)
la = xr.DataArray(pts.y.values, dims='u'); lo = xr.DataArray(pts.x.values, dims='u')
S = d.SPI_3.sel(latitude=la, longitude=lo, method='nearest').values; E = d.SPEI_3.sel(latitude=la, longitude=lo, method='nearest').values
t = pd.to_datetime(d.time.values); R = []
for ti, tt in enumerate(t):
    if tt.year < 1991: continue
    for ui, u in enumerate(T.index):
        o = ours.get((u, tt.year, tt.month))
        if o is None or np.isnan(o) or np.isnan(S[ti, ui]): continue
        R.append((u, tt.year, tt.month, o, float(S[ti, ui]), float(E[ti, ui])))
R = pd.DataFrame(R, columns=['u', 'y', 'm', 'ours', 'era5spi', 'era5spei'])
def kappa(a, b):
    po = (a == b).mean(); pe = a.mean() * b.mean() + (1 - a.mean()) * (1 - b.mean()); return (po - pe) / (1 - pe)
out = {'pairs': int(len(R)), 'tehsils': int(R.u.nunique()), 'years': [int(R.y.min()), int(R.y.max())]}
for nm, col in (('vsERA5_SPI3', 'era5spi'), ('vsERA5_SPEI3', 'era5spei')):
    a = R.ours <= -1; b = R[col] <= -1
    out[nm] = {'r': round(float(np.corrcoef(R.ours, R[col])[0, 1]), 3), 'droughtAgree': round(float((a == b).mean()), 3), 'kappa': round(float(kappa(a.values, b.values)), 3),
               'hitRateOfERA5Droughts': round(float((a & b).sum() / max(b.sum(), 1)), 3), 'falseShare': round(float((a & ~b).sum() / max(a.sum(), 1)), 3),
               'bySeason': {int(m): round(float(np.corrcoef(g.ours, g[col])[0, 1]), 3) for m, g in R.groupby('m')}}
pr = R.merge(T[['province']], left_on='u', right_index=True).groupby('province').apply(lambda g: round(float(np.corrcoef(g.ours, g.era5spi)[0, 1]), 3)).to_dict()
out['rByProvince'] = pr
json.dump(out, open('/home/claude/nig/drought_xcheck/result.json', 'w'), indent=1); print(json.dumps(out, indent=1))
