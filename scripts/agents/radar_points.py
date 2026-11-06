"""v91.17.283.7 - partner-network radar rain (SRI) at points, hourly, for the verification agent (operator-only rain truth).
Reads NIGRAAN's copy <radar>/<site>/sri/<site>_sri_YYYY-MM-DD.nc (never LAMHA's folder). Each file holds 10-minute frames of a
surface-rain-rate BAND index (band k = [band_lower[k], band_upper[k]) mm/h; band 0 = below the lowest band; 255 = outside radar range).
A band is an interval, so the rain of an hour is an interval too: for the hour ending at h (UTC; the served hourly rain is the preceding
hour's total), with all six frames present, lower = sum(band lower) x 10 min, upper = sum(band upper) x 10 min (open top band: no upper).
A point is inside radar range when its nearest grid cell is within one cell of it and no frame of the hour reads 255 there.
The file's own notes on position are recorded with the result (geometry, time base, radar position), because the verification depends
on them: 'assumed radar-centred azimuthal equidistant, +-R km, no resampling'.
usage: python radar_points.py --radar <...\\from_lamha\\radar\\netcdf> --site islamabad --days 2026-10-14,2026-10-15 --points pts.json --out out.json"""
import sys, os, json, argparse, math, datetime
ap = argparse.ArgumentParser(); ap.add_argument('--radar', required=True); ap.add_argument('--site', required=True); ap.add_argument('--days', required=True)
ap.add_argument('--points', required=True); ap.add_argument('--out', required=True); A = ap.parse_args()
reader = None
try:
    import netCDF4; reader = 'netCDF4'
except Exception:
    try:
        import h5netcdf; reader = 'h5netcdf'
    except Exception:
        try:
            import xarray; reader = 'xarray'
        except Exception:
            print('no NetCDF reader (netCDF4, h5netcdf or xarray) in this Python'); sys.exit(3)
import numpy as np
def load(f):
    if reader == 'netCDF4':
        d = netCDF4.Dataset(f); d.set_auto_mask(False)
        att = {k: (d.getncattr(k).item() if hasattr(d.getncattr(k), 'item') else d.getncattr(k)) for k in d.ncattrs()}
        tu = d['time'].getncattr('units'); t = np.asarray(d['time'][:]); band = np.asarray(d['band'][:]); lo = np.asarray(d['band_lower'][:]); hi = np.asarray(d['band_upper'][:]); la = np.asarray(d['lat'][:]); ln = np.asarray(d['lon'][:]); d.close()
    else:
        import xarray as xr
        d = xr.open_dataset(f, decode_times=False, mask_and_scale=False, engine='h5netcdf' if reader == 'h5netcdf' else None)
        att = {k: (v.item() if hasattr(v, 'item') else v) for k, v in d.attrs.items()}; tu = d['time'].attrs['units']; t = d['time'].values; band = d['band'].values; lo = d['band_lower'].values; hi = d['band_upper'].values; la = d['lat'].values; ln = d['lon'].values; d.close()
    base = datetime.datetime.strptime(tu.replace('minutes since ', '').strip()[:19], '%Y-%m-%d %H:%M:%S').replace(tzinfo=datetime.timezone.utc)
    ms = [int((base + datetime.timedelta(minutes=int(x))).timestamp() * 1000) for x in t]
    return att, ms, band, lo.astype(float), hi.astype(float), la, ln
pts = json.load(open(A.points)); days = [d for d in A.days.split(',') if d]
files = []
for d in sorted(set(days + [(datetime.date.fromisoformat(x) - datetime.timedelta(days=1)).isoformat() for x in days])):
    f = os.path.join(A.radar, A.site, 'sri', '%s_sri_%s.nc' % (A.site, d))
    if os.path.exists(f): files.append(f)
out = {'site': A.site, 'reader': reader, 'files': [os.path.basename(f) for f in files], 'notes': None, 'points': {}, 'hours': {}}
if not files:
    json.dump(out, open(A.out, 'w')); print('no radar file for these days'); sys.exit(0)
frames = {}   # ms -> band grid
notes = None; LO = HI = LA = LN = None
for f in files:
    att, ms, band, lo, hi, la, ln = load(f)
    if notes is None: notes = {k: att.get(k) for k in ('geometry', 'time', 'radar_lat', 'radar_lon', 'radar_height_m', 'Conventions')}
    LO, HI, LA, LN = lo, hi, la, ln
    for i, m in enumerate(ms): frames[m] = band[i]
out['notes'] = notes
# band k -> [lower, upper) mm/h; band 0 = [0, lower of band 1)
lo_of = np.zeros(256); hi_of = np.full(256, np.nan)
for k in range(len(LO)):
    lo_of[k] = 0.0 if k == 0 else (LO[k] if np.isfinite(LO[k]) else np.nan)
    hi_of[k] = (LO[1] if len(LO) > 1 else np.nan) if k == 0 else (HI[k] if np.isfinite(HI[k]) else np.inf)
# nearest cell of every point (within one cell)
step_km = None
try: step_km = abs(float(LA[1, 0] - LA[0, 0])) * 111.2
except Exception: step_km = 2.5
for p in pts:
    if not (np.nanmin(LA) <= p['lat'] <= np.nanmax(LA) and np.nanmin(LN) <= p['lon'] <= np.nanmax(LN)): continue
    dy = (LA - p['lat']) * 111.2; dx = (LN - p['lon']) * 111.2 * math.cos(math.radians(p['lat'])); d2 = dy * dy + dx * dx
    j, i = np.unravel_index(np.nanargmin(d2), d2.shape); dk = float(math.sqrt(d2[j, i]))
    if dk <= max(2.0, 1.5 * step_km): out['points'][p['id']] = [int(j), int(i), round(dk, 2)]
times = sorted(frames)
t0 = min(int((datetime.datetime.fromisoformat(d) - datetime.timedelta(hours=5)).replace(tzinfo=datetime.timezone.utc).timestamp() * 1000) for d in days)
t1 = max(int((datetime.datetime.fromisoformat(d) + datetime.timedelta(hours=19)).replace(tzinfo=datetime.timezone.utc).timestamp() * 1000) for d in days)
for pid, (j, i, dk) in out['points'].items():
    H = {}
    for h in range(t0 + 3600000, t1 + 3600000, 3600000):
        fr = [frames[m][j, i] for m in times if h - 3600000 <= m < h]
        if len(fr) < 6: continue
        fr = fr[:6]
        if any(int(b) == 255 for b in fr): continue
        L = float(sum(lo_of[int(b)] for b in fr)) / 6.0; U = float(sum(hi_of[int(b)] for b in fr)) / 6.0
        H[str(h)] = [round(L, 3), (round(U, 3) if math.isfinite(U) else None)]
    out['hours'][pid] = H
os.makedirs(os.path.dirname(os.path.abspath(A.out)), exist_ok=True); json.dump(out, open(A.out, 'w'))
print('radar %s: %d files, %d points in range, %d point-hours' % (A.site, len(files), len(out['points']), sum(len(v) for v in out['hours'].values())))
