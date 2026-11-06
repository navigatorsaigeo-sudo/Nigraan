#!/usr/bin/env python3
"""
v91.17.78 · C · ERA5-Land soil water and snow per tehsil (Copernicus Climate Data Store, cdsapi).

  Variables  swvl1 (0-7 cm), swvl2 (7-28 cm), swvl3 (28-100 cm) volumetric soil water, m3/m3
             sd  snow depth water equivalent, m of water
  Grid       ERA5-Land native 0.1 deg over the Pakistan box N 37.5 W 60.5 S 23.5 E 78
  Per tehsil the mean over the land cells whose centre lies inside the tehsil (data/era5land-cells.json, built once
  with --cells from data/pk-tehsils.json); a tehsil with no cell centre inside takes the valid cell nearest its
  settlement point.

  root zone  theta_rz = (7*swvl1 + 21*swvl2 + 72*swvl3) / 100    depth-weighted over 0-100 cm

Modes
  --cells        build data/era5land-cells.json (needs shapely; one-off, not on the laptop)
  --climatology  data/era5land-climatology.json: per tehsil and calendar month, 30 monthly means of 1996-2025
                 (reanalysis-era5-land-monthly-means, 3 requests) -> mean, sd, p10/p50/p90 of theta_rz, swvl1, sd
  --recent       data/era5land-recent.json: the last 60 days of daily values (reanalysis-era5-land at 00/06/12/18 UTC,
                 mean of the four; one request per calendar month; the post-processed daily-statistics product queued
                 for over an hour on 27 Sep 2026 while the hourly product ran in a minute), per tehsil: the daily series, the trailing
                 30-day mean of theta_rz and its percentile / z against the calendar-month climatology (a 30-day
                 mean is compared with 30 monthly means: like with like), and the snow water change over 7 and
                 14 days (negative = melt or sublimation).
                 This is the LEARN_ALL job "era5land" on the laptop.

Key: CDSAPI_RC, else <app>/cds.key (.cdsapirc format: url / key lines). It is never printed or logged.
Licence: CC-BY-4.0 (Copernicus CDS catalogue entries reanalysis-era5-land-monthly-means and reanalysis-era5-land,
checked 27 Sep 2026). Attribution is written into every output file.
Usage: python era5land.py --app <nigraan-local> (--recent | --climatology | --cells) [--work <dir>] [--days 60]
"""
import sys, os, json, time, math, argparse, datetime as dt, zipfile, glob, calendar, warnings
warnings.filterwarnings("ignore", message="Mean of empty slice")

AREA = [37.5, 60.5, 23.5, 78.0]                      # N, W, S, E
VARS = ['volumetric_soil_water_layer_1', 'volumetric_soil_water_layer_2', 'volumetric_soil_water_layer_3', 'snow_depth_water_equivalent']
SHORT = ['swvl1', 'swvl2', 'swvl3', 'sd']
DEPTH = (7.0, 21.0, 72.0)
CLIM_PERIOD = (1996, 2025)
SYNOPTIC = ['00:00', '06:00', '12:00', '18:00']          # the daily value = mean of the four synoptic hours (UTC day); soil water and snow are slow states
LAG_DAYS = 5
LICENCE = {
    'licence': 'CC-BY-4.0',
    'licenceUrl': 'https://spdx.org/licenses/CC-BY-4.0',
    'attribution': 'Contains modified Copernicus Climate Change Service information %d.' % dt.date.today().year + ' Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains.',
    'citations': [
        'Copernicus Climate Change Service (2022): ERA5-Land monthly averaged data from 1950 to present. Copernicus Climate Change Service (C3S) Climate Data Store (CDS). DOI: 10.24381/cds.68d2bb30 (Accessed on 27-Sep-2026)',
        'Munoz Sabater, J. (2019): ERA5-Land monthly averaged data from 1950 to present. Copernicus Climate Change Service (C3S) Climate Data Store (CDS). DOI: 10.24381/cds.68d2bb30',
        'Copernicus Climate Change Service (C3S) (2019): ERA5-Land hourly data from 1950 to present. Copernicus Climate Change Service (C3S) Climate Data Store (CDS). DOI: 10.24381/cds.e2161bac (Accessed on 27-Sep-2026)',
        'Munoz Sabater, J. (2019): ERA5-Land hourly data from 1950 to present. Copernicus Climate Change Service (C3S) Climate Data Store (CDS). DOI: 10.24381/cds.e2161bac',
        'Munoz-Sabater, J. et al. (2021): ERA5-Land: a state-of-the-art global reanalysis dataset for land applications. Earth Syst. Sci. Data 13, 4349-4383. DOI: 10.5194/essd-13-4349-2021',
    ],

    'provider': 'Copernicus Climate Change Service (C3S) / ECMWF, via the Climate Data Store API (cdsapi)',
}
# the header record scripts/licence_headers.py writes (same shape), so a rebuilt file keeps it
LICENCE_RECORD = [{'id': 'era5land', 'dataset': 'ERA5-Land reanalysis (monthly means, and hourly fields for the recent days)', 'provider': 'Copernicus Climate Change Service (C3S) / ECMWF',
                   'licence': 'CC BY 4.0 (Copernicus CDS)', 'licenceUrl': 'https://creativecommons.org/licenses/by/4.0/',
                   'attribution': 'Contains modified Copernicus Climate Change Service information %d; Munoz-Sabater et al. (2021) ERA5-Land, DOI 10.24381/cds.68d2bb30 and 10.24381/cds.e2161bac' % dt.date.today().year,
                   'url': 'https://cds.climate.copernicus.eu', 'use': 'antecedent soil water and snow water per tehsil (wetness and melt inputs)', 'customer': True}]


def log(*a):
    print(*a, flush=True)


def need(mod, why):
    try:
        return __import__(mod)
    except Exception:
        log(f'{mod} is not installed ({why}); run SETUP_PYTHON.bat, or: python -m pip install cdsapi netCDF4. Nothing written.')
        sys.exit(0)


def client(app):
    if not os.environ.get('CDSAPI_RC'):
        k = os.path.join(app, 'cds.key')
        if not os.path.exists(k):
            log('no CDS key: put the .cdsapirc-format file at nigraan-local\\cds.key (or set CDSAPI_RC). Nothing written.'); sys.exit(0)
        os.environ['CDSAPI_RC'] = k
    cdsapi = need('cdsapi', 'the Copernicus Climate Data Store client')
    return cdsapi.Client(quiet=True, progress=False)


def retrieve(c, dataset, req, target, budget_s):
    """one request; the CDS rejects when too many requests for a dataset are queued, so wait and ask again within the budget"""
    t0 = time.time()
    while True:
        try:
            c.retrieve(dataset, req, target); return True
        except Exception as e:
            msg = str(e).splitlines()[-1][:200] if str(e) else type(e).__name__
            if 'temporarily limited' in str(e) and time.time() - t0 < budget_s:
                log('  queue full at the CDS, waiting 90 s'); time.sleep(90); continue
            log('  request failed:', msg); return False


def open_nc(path):
    """netCDF4 dataset(s) from a .nc or a zip of .nc files -> dict short -> (times[], array[t, lat, lon]), lat[], lon[]"""
    nc = need('netCDF4', 'reads the CDS netCDF files'); import numpy as np
    files = [path]
    if zipfile.is_zipfile(path):
        d = path + '.d'; os.makedirs(d, exist_ok=True)
        with zipfile.ZipFile(path) as z: z.extractall(d)
        files = sorted(glob.glob(os.path.join(d, '*.nc')))
    out, lat, lon, times = {}, None, None, None
    for f in files:
        D = nc.Dataset(f)
        tn = 'valid_time' if 'valid_time' in D.variables else 'time'
        t = nc.num2date(D.variables[tn][:], D.variables[tn].units, only_use_cftime_datetimes=False)
        tt = [dt.date(x.year, x.month, x.day) for x in t]
        lat = np.array(D.variables['latitude'][:]); lon = np.array(D.variables['longitude'][:])
        for v in SHORT:
            if v in D.variables:
                a = np.ma.filled(D.variables[v][:].astype('f8'), np.nan)
                out[v] = (tt, a)
        D.close()
    return out, lat, lon


def reduce_units(cells, arr, lat, lon):
    """arr[t, lat, lon] -> {uid: [t values]} as the mean of that unit's cells"""
    import numpy as np
    la0, lo0 = float(lat[0]), float(lon[0]); dla = float(lat[1] - lat[0]); dlo = float(lon[1] - lon[0])
    out = {}
    for uid, cl in cells['units'].items():
        ii = [int(round((c[0] - la0) / dla)) for c in cl['cells']]; jj = [int(round((c[1] - lo0) / dlo)) for c in cl['cells']]
        v = arr[:, ii, jj]
        with np.errstate(all='ignore'):
            m = np.nanmean(v, axis=1)
        out[uid] = m
    return out


def rz(s1, s2, s3):
    return (DEPTH[0] * s1 + DEPTH[1] * s2 + DEPTH[2] * s3) / sum(DEPTH)


def r(x, n=4):
    return None if x is None or not math.isfinite(x) else round(float(x), n) + 0.0   # + 0.0: no "-0.0"


def build_cells(app, work):
    import numpy as np
    from shapely.geometry import shape, Point
    from shapely.prepared import prep
    ref = sorted(glob.glob(os.path.join(work, 'monthly_*.nc')))
    if not ref: log('need one monthly file in', work, 'to know the land mask'); sys.exit(1)
    V, lat, lon = open_nc(ref[0]); mask = np.isfinite(V['swvl1'][1][0])
    units = {u['unitId']: u for u in json.load(open(os.path.join(app, 'server', 'contract', 'units.json')))}
    G = json.load(open(os.path.join(app, 'data', 'pk-tehsils.json')))
    LA, LO = np.meshgrid(lat, lon, indexing='ij')
    out = {}; nearest = 0
    for f in G['features']:
        uid = f['properties'].get('uid'); u = units.get(uid)
        if not u or u.get('disputed'): continue
        g = shape(f['geometry']); P = prep(g); x0, y0, x1, y1 = g.bounds
        sel = np.where(mask & (LA >= y0) & (LA <= y1) & (LO >= x0) & (LO <= x1))
        cl = [[round(float(lat[i]), 2), round(float(lon[j]), 2)] for i, j in zip(*sel) if P.contains(Point(float(lon[j]), float(lat[i])))]
        how = 'inside'
        if not cl:
            d = (LA - u['lat']) ** 2 + ((LO - u['lon']) * math.cos(math.radians(u['lat']))) ** 2; d[~mask] = np.inf
            i, j = np.unravel_index(np.argmin(d), d.shape); cl = [[round(float(lat[i]), 2), round(float(lon[j]), 2)]]; how = 'nearest to the settlement point'; nearest += 1
        out[uid] = {'cells': cl, 'how': how}
    res = {'licence': LICENCE_RECORD, 'built': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'grid': 'ERA5-Land 0.1 deg, box N37.5 W60.5 S23.5 E78, land cells only (finite swvl1)',
           'rule': 'cell centres inside the tehsil polygon (data/pk-tehsils.json); where none, the valid cell nearest the settlement point (units.json lat/lon)',
           'units': out, 'nearestOnly': nearest}
    json.dump(res, open(os.path.join(app, 'data', 'era5land-cells.json'), 'w'), separators=(',', ':'))
    log('cells:', len(out), 'tehsils,', nearest, 'by nearest cell')


def monthly_series(app, work, c, budget):
    y0, y1 = CLIM_PERIOD; chunks = [(a, min(a + 9, y1)) for a in range(y0, y1 + 1, 10)]
    files = []
    for a, b in chunks:
        f = os.path.join(work, f'monthly_{a}-{b}.nc')
        if not (os.path.exists(f) and os.path.getsize(f) > 0):
            if c is None: c = client(app)
            req = {'product_type': ['monthly_averaged_reanalysis'], 'variable': VARS, 'year': [str(y) for y in range(a, b + 1)],
                   'month': [f'{m:02d}' for m in range(1, 13)], 'time': ['00:00'], 'area': AREA, 'data_format': 'netcdf', 'download_format': 'unarchived'}
            log('requesting monthly means', a, b)
            if not retrieve(c, 'reanalysis-era5-land-monthly-means', req, f, budget): return None
        files.append(f)
    return files


def build_climatology(app, work, budget):
    import numpy as np
    cells = json.load(open(os.path.join(app, 'data', 'era5land-cells.json')))
    files = monthly_series(app, work, None, budget)
    if not files: log('climatology: the monthly means did not arrive; nothing written'); sys.exit(1)
    series = {}; times = []
    for f in files:
        V, lat, lon = open_nc(f); tt = V['swvl1'][0]; times += tt
        for v in SHORT:
            red = reduce_units(cells, V[v][1], lat, lon)
            for uid, arr in red.items(): series.setdefault(uid, {}).setdefault(v, []).extend(arr.tolist())
    months = np.array([t.month for t in times]); years = sorted(set(t.year for t in times))
    units = {}
    for uid, S in series.items():
        a = {v: np.array(S[v], float) for v in SHORT}; th = rz(a['swvl1'], a['swvl2'], a['swvl3'])
        rec = {}
        for name, x, nd in (('rz', th, 4), ('s1', a['swvl1'], 4), ('sd', np.maximum(a['sd'], 0) * 1000.0, 1)):   # sd in mm of water (tiny negative packing noise -> 0)
            row = {'mean': [], 'sd': [], 'p10': [], 'p50': [], 'p90': [], 'v': []}
            for m in range(1, 13):
                s = x[months == m]; s = s[np.isfinite(s)]
                if len(s) < 20:
                    for k in row: row[k].append(None)
                    continue
                row['mean'].append(r(s.mean(), nd)); row['sd'].append(r(s.std(ddof=1), nd))
                row['p10'].append(r(np.percentile(s, 10), nd)); row['p50'].append(r(np.percentile(s, 50), nd)); row['p90'].append(r(np.percentile(s, 90), nd))
                row['v'].append([r(z, nd) for z in s.tolist()])
            rec[name] = row
        units[uid] = rec
    out = {'name': 'era5land-climatology', 'built': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'period': f'{years[0]}-{years[-1]}', 'years': len(years),
           'dataset': 'ERA5-Land monthly averaged reanalysis (reanalysis-era5-land-monthly-means), 0.1 deg',
           'fields': {'rz': 'root-zone volumetric soil water 0-100 cm, m3/m3, (7*swvl1 + 21*swvl2 + 72*swvl3)/100',
                      's1': 'surface layer 0-7 cm volumetric soil water (swvl1), m3/m3', 'sd': 'snow depth water equivalent, mm of water'},
           'per': 'unit -> field -> {mean, sd, p10, p50, p90: [12 calendar months], v: [12][30 monthly means, one per year]}',
           'aggregation': 'mean over the tehsil land cells of data/era5land-cells.json',
           'normal': 'operational normal, most recent 30 complete years (WMO-No. 1203, 2017)',
           'caveat': 'tehsil means include glacier cells, where the reanalysis snow water is capped and near-permanent; read the snow change, not the level, there',
           'provenance': dict(LICENCE, builder='scripts/era5land.py --climatology', requests='3 CDS requests, one per decade'), 'licence': LICENCE_RECORD, 'units': units}
    json.dump(out, open(os.path.join(app, 'data', 'era5land-climatology.json'), 'w'), separators=(',', ':'))
    log('climatology:', len(units), 'tehsils', out['period'])


def pctl(v, sample):
    s = sorted(x for x in sample if x is not None)
    if v is None or len(s) < 10: return None
    below = sum(1 for x in s if x < v); eq = sum(1 for x in s if x == v)
    return round(100.0 * (below + 0.5 * eq) / len(s), 1)


def build_recent(app, work, days, budget):
    import numpy as np
    cells = json.load(open(os.path.join(app, 'data', 'era5land-cells.json')))
    CL = json.load(open(os.path.join(app, 'data', 'era5land-climatology.json')))
    today = dt.date.today(); start = today - dt.timedelta(days=days + 10)
    months = []; d = dt.date(start.year, start.month, 1)
    while d <= today: months.append((d.year, d.month)); d = dt.date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    c = client(app); files = []
    lastday = today - dt.timedelta(days=LAG_DAYS)            # ERA5-Land reaches about five days behind real time
    for (y, m) in months:
        f = os.path.join(work, f'hourly_{y}-{m:02d}.nc')
        mend = dt.date(y, m, calendar.monthrange(y, m)[1])
        cur = (lastday - mend).days < 12                     # a month that may still gain days is asked again
        if os.path.exists(f) and os.path.getsize(f) > 0 and not cur: files.append(f); continue
        last = min(mend, lastday).day if (y, m) <= (lastday.year, lastday.month) else 0
        if last < 1: continue
        req = {'variable': VARS, 'year': str(y), 'month': f'{m:02d}', 'day': [f'{k:02d}' for k in range(1, last + 1)],
               'time': SYNOPTIC, 'area': AREA, 'data_format': 'netcdf', 'download_format': 'unarchived'}
        log('requesting', y, m, 'days 1 -', last)
        tmp = f + '.part'
        if retrieve(c, 'reanalysis-era5-land', req, tmp, budget):
            os.replace(tmp, f); files.append(f)
        elif os.path.exists(f): files.append(f); log('  keeping the previous copy of', y, m)
    if not files: log('recent: no file arrived; nothing written'); sys.exit(1)
    for old in glob.glob(os.path.join(work, 'hourly_*.nc')):           # the work folder keeps only the months of the window
        try:
            yy, mm = map(int, os.path.basename(old)[7:14].split('-'))
            if (yy, mm) < months[0]: os.remove(old)
        except Exception: pass
    series = {}; times = []
    for f in sorted(files):
        V, lat, lon = open_nc(f); tt = V['swvl1'][0]
        byday = {}
        for k, t in enumerate(tt):
            if np.isfinite(V['swvl1'][1][k]).any(): byday.setdefault(t, []).append(k)   # a time the CDS has not produced comes back empty
        days_ok = sorted(t for t, ks in byday.items() if len(ks) >= len(SYNOPTIC) - 1)
        times += days_ok
        for v in SHORT:
            with np.errstate(all='ignore'):
                daily = np.stack([np.nanmean(V[v][1][byday[t]], axis=0) for t in days_ok]) if days_ok else np.zeros((0,) + V[v][1].shape[1:])
            red = reduce_units(cells, daily, lat, lon)
            for uid, arr in red.items(): series.setdefault(uid, {}).setdefault(v, []).extend(arr.tolist())
    order = sorted(range(len(times)), key=lambda k: times[k]); times = [times[k] for k in order]
    keep = [k for k, t in enumerate(times) if t > times[-1] - dt.timedelta(days=days)]
    T = [times[k].isoformat() for k in keep]
    last = times[-1]; mon = last.month
    # the trailing 30 days straddle two calendar months: the climatological sample is the same blend of each year's monthly means
    w30 = {}
    for k in range(30): t = last - dt.timedelta(days=k); w30[t.month] = w30.get(t.month, 0) + 1 / 30.0
    def blend(field):
        cols = [field['v'][m - 1] for m in w30]
        if any(c is None for c in cols) or len(set(len(c) for c in cols)) != 1: return field['v'][mon - 1]
        return [sum(w * c[i] for w, c in zip(w30.values(), cols)) for i in range(len(cols[0]))]
    units = {}
    for uid, S in series.items():
        a = {v: np.array([S[v][k] for k in order], float) for v in SHORT}
        th = rz(a['swvl1'], a['swvl2'], a['swvl3']); sdmm = np.maximum(a['sd'], 0) * 1000.0
        c = CL['units'].get(uid)
        rz30 = float(np.nanmean(th[-30:])) if len(th) >= 30 else None
        s130 = float(np.nanmean(a['swvl1'][-30:])) if len(th) >= 30 else None
        clim = c and c['rz']; smp = blend(clim) if clim else None
        mean = float(np.mean(smp)) if smp else None; sd = float(np.std(smp, ddof=1)) if smp and len(smp) > 2 else None
        rec = {'rz': [r(x) for x in th[keep]], 's1': [r(x) for x in a['swvl1'][keep]], 'sdMm': [r(x, 1) for x in sdmm[keep]],
               'rz30': r(rz30), 'rz30Pct': pctl(r(rz30), smp) if smp else None,
               'rz30Z': r((rz30 - mean) / sd, 2) if (rz30 is not None and mean is not None and sd) else None,
               's130Pct': pctl(r(s130), blend(c['s1'])) if c else None,
               'sdMmNow': r(sdmm[-1], 1), 'sdChange7Mm': r(sdmm[-1] - sdmm[-8], 1) if len(sdmm) >= 8 else None, 'sdChange14Mm': r(sdmm[-1] - sdmm[-15], 1) if len(sdmm) >= 15 else None,
               'sdPct': pctl(r(float(np.nanmean(sdmm[-30:])), 1), blend(c['sd'])) if c and len(sdmm) >= 30 and max(blend(c['sd']) or [0]) >= 1 else None}   # no percentile where this season has no snow
        units[uid] = rec
    out = {'name': 'era5land-recent', 'built': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'from': T[0], 'to': T[-1], 'days': len(T), 'dates': T,
           'dataset': 'ERA5-Land hourly (reanalysis-era5-land), daily value = mean of 00/06/12/18 UTC, 0.1 deg',
           'lagNote': 'ERA5-Land reaches about five days behind real time; "to" is the last day the CDS had produced',
           'fields': {'rz': 'daily root-zone soil water 0-100 cm, m3/m3', 's1': 'daily 0-7 cm soil water, m3/m3', 'sdMm': 'daily snow water equivalent, mm',
                      'rz30': 'mean rz over the last 30 days', 'rz30Pct': 'percentile of rz30 among the 30 years of data/era5land-climatology.json, each year the monthly means blended in the proportion the 30-day window covers each calendar month (like with like: a 30-day mean against monthly means)',
                      'rz30Z': '(rz30 - monthly mean) / monthly sd', 's130Pct': 'the same percentile for the 0-7 cm layer',
                      'sdMmNow': 'snow water on the last day, mm', 'sdChange7Mm': 'change over 7 days (negative = melt or sublimation)', 'sdChange14Mm': 'change over 14 days',
                      'sdPct': 'the same percentile for the 30-day mean snow water; null where the season holds under 1 mm in every year'},
           'climatology': {'file': 'data/era5land-climatology.json', 'period': CL.get('period'), 'built': CL.get('built')},
           'provenance': dict(LICENCE, builder='scripts/era5land.py --recent (LEARN_ALL job "era5land")'), 'licence': LICENCE_RECORD, 'units': units}
    tmp = os.path.join(app, 'data', 'era5land-recent.json.tmp')
    json.dump(out, open(tmp, 'w'), separators=(',', ':')); os.replace(tmp, os.path.join(app, 'data', 'era5land-recent.json'))
    log('recent:', len(units), 'tehsils', T[0], '..', T[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--app', default='.'); ap.add_argument('--work', default=None); ap.add_argument('--days', type=int, default=60)
    ap.add_argument('--budget', type=int, default=5400, help='seconds to keep asking a full CDS queue before giving up')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--cells', action='store_true'); g.add_argument('--climatology', action='store_true'); g.add_argument('--recent', action='store_true')
    a = ap.parse_args(); app = os.path.abspath(a.app)
    work = a.work or os.path.join(app, 'archive', 'era5land'); os.makedirs(work, exist_ok=True)
    need('numpy', 'arrays')
    if a.cells: build_cells(app, work)
    elif a.climatology: build_climatology(app, work, a.budget)
    else: build_recent(app, work, a.days, a.budget)


if __name__ == '__main__':
    main()
