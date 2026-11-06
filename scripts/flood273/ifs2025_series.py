"""v91.17.273 FLOOD · 2025 monsoon forecast replay input: as-issued ECMWF IFS open-data rain (LAMHA copy,
data/nwp/ifs_asissued/ifs_fields_2025MM.nc, 0.25 deg, 4 runs a day, 3-h windows at steps 3..21 h) -> a continuous 3-hourly
short-lead rain series at each tehsil point (the point the served chain forecasts for: pk-tehsils lat/lon, nearest grid cell),
taking from each run the windows ending at +3 h and +6 h (so every 3-h slot comes from the newest run, lead 0-6 h).
Hourly series for the served engine: each 3-h amount spread evenly over its 3 hours (a lower bound on the hourly peak: the served
chain reads the peak hourly rate; this basis under-states it, said in the report). PKT days (UTC+5).
Output data/flood273/ifs2025_hourly.json {dates:[PKT dates], units:{uid:[[24 x 0.1 mm] per date]}}"""
import json, sys, os, numpy as np, xarray as xr, pandas as pd
ROOT, LAMHA = sys.argv[1], sys.argv[2]; MODE = sys.argv[3] if len(sys.argv) > 3 else 'even'
import gzip
LL = {}
for f in ('fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz'):   # the tehsil point the served chain forecasts for (served archive)
    for l in gzip.open(os.path.join(ROOT, 'data', 'archive', 'forecast', f), 'rt'):
        try: r = json.loads(l); LL[r['u']] = (r['lat'], r['lon'])
        except Exception: pass
P = [(u, la, lo) for u, (la, lo) in LL.items()]
slots = {}   # UTC slot start -> {uid: amount}
for mm in ('06', '07', '08', '09'):
    d = xr.open_dataset(os.path.join(LAMHA, 'data', 'nwp', 'ifs_asissued', f'ifs_fields_2025{mm}.nc'))
    lat = d.lat.values; lon = d.lon.values
    ii = {u: (int(np.abs(lat - la).argmin()), int(np.abs(lon - lo).argmin())) for u, la, lo in P if la is not None}
    tp = d.tp_win.sel(step_h=[3, 6]).values   # init, 2, lat, lon
    for k, init in enumerate(pd.to_datetime(d.init_utc.values)):
        for s, st in enumerate((3, 6)):
            t0 = init + pd.Timedelta(hours=st - 3)
            a = tp[k, s]
            if not np.isfinite(a).any(): continue
            slots[t0] = {u: float(a[i, j]) for u, (i, j) in ii.items()}
times = sorted(slots)
print('slots', len(times), times[0], times[-1])
start = pd.Timestamp('2025-06-02 00:00') ; end = pd.Timestamp('2025-09-30 23:00')   # PKT
dates = pd.date_range(start, end, freq='D')
out = {'dates': [d.strftime('%Y-%m-%d') for d in dates], 'basis': 'ECMWF IFS open data as issued, 0.25 deg, lead 0-6 h, 3-h windows ' + ('spread evenly over hours' if MODE == 'even' else 'put in the first hour of the window'), 'units': {}}
miss = 0
for u, _, _ in P:
    rows = []
    for dd in dates:
        h = []
        for hr in range(24):
            tutc = dd + pd.Timedelta(hours=hr - 5); s0 = tutc.floor('3h')
            v = slots.get(s0, {}).get(u)
            if v is None or not np.isfinite(v): h.append(None); continue
            # MODE even: the 3-h amount spread over its hours (lower bound of the hourly peak); front: all of it in the window's
            # first hour (upper bound). The served chain's own hourly peak lies between the two.
            h.append(round(max(0.0, v) / 3 * 10) if MODE == 'even' else (round(max(0.0, v) * 10) if tutc == s0 else 0))
        if any(x is None for x in h): miss += 1
        rows.append(h)
    out['units'][u] = rows
print('unit-days with a missing hour', miss, 'of', len(P) * len(dates))
json.dump(out, open(os.path.join(ROOT, 'data', 'flood273', ('ifs2025_hourly.json' if MODE == 'even' else 'ifs2025_hourly_front.json')), 'w'))
