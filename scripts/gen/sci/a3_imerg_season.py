"""SCI item 3: IMERG 2025 monsoon (15 Jun - 30 Sep) per 0.1 deg cell: max hourly rain (two half-hours summed, clock hours),
max PKT-day total, days >= 25 mm. usage: python3 a3_imerg_season.py <imerg dir> <out.npz>"""
import sys, numpy as np, xarray as xr, pandas as pd
D, OUT = sys.argv[1], sys.argv[2]
hmax = dmax = n25 = None; lat = lon = None
for m in ['06', '07', '08', '09']:
    ds = xr.open_dataset(f'{D}/IMERG_subhourly_PAK_2025{m}.nc'); lat, lon = ds.lat.values, ds.lon.values
    t = pd.to_datetime(ds.time.values); keep = (t >= '2025-06-15') & (t < '2025-10-01')
    p = ds.precipitation_mm.values[keep].astype(np.float32); t = t[keep]
    p = np.where(p < 0, np.nan, p)
    hr = t.floor('h'); hk = pd.factorize(hr)[0]; H = np.zeros((hk.max() + 1,) + p.shape[1:], np.float32); np.add.at(H, hk, np.nan_to_num(p))
    dk = pd.factorize((t + pd.Timedelta(hours=5)).floor('D'))[0]; Dd = np.zeros((dk.max() + 1,) + p.shape[1:], np.float32); np.add.at(Dd, dk, np.nan_to_num(p))
    hm, dm, c = H.max(0), Dd.max(0), (Dd >= 25).sum(0)
    hmax = hm if hmax is None else np.maximum(hmax, hm); dmax = dm if dmax is None else np.maximum(dmax, dm); n25 = c if n25 is None else n25 + c
    print(m, p.shape, float(np.nanmax(hm)), float(dm.max()), flush=True); del p, H, Dd, ds
np.savez(OUT, lat=lat, lon=lon, hmax=hmax, dmax=dmax, n25=n25)
