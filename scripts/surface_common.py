"""v91.17.72 · S (surface) · shared helpers for the surface_*.py jobs.

- Pakistan mask on the g9 feature grid (featgrid.py): cells whose centre lies in one of the 577 tehsils in
  data/pk-tehsils.json, dilated by MASK_PAD_CELLS so border stations and 10 km neighbourhood means keep support.
- the 409 training points (/home/claude/nig/s72/points.csv)
- licence objects for every source used by the S jobs
- point-feature table helpers (merge columns into /home/claude/nig/s72/pointfeat_S.csv + units sidecar .json)
"""
import csv, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from featgrid import GRID, grid_coords, cell_of, write_band, read_band  # noqa: E402

ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'data')
S72 = '/home/claude/nig/s72'
SCRATCH = '/home/claude/scratch72/S'
POINTS = os.path.join(S72, 'points.csv')
PF_CSV = os.path.join(S72, 'pointfeat_S.csv')
PF_JSON = os.path.join(S72, 'pointfeat_S.json')
MASK_PAD_CELLS = 40            # 40 cells x 1/400 deg = 0.1 deg (about 10 km)
os.makedirs(SCRATCH, exist_ok=True)

LIC = {
    'worldcover': {'dataset': 'ESA WorldCover 10 m 2021 v200', 'provider': 'European Space Agency (ESA) WorldCover consortium',
                   'licence': 'CC BY 4.0', 'licenceUrl': 'https://creativecommons.org/licenses/by/4.0/',
                   'attribution': '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium (Zanaga et al. 2022, doi:10.5281/zenodo.7254221)',
                   'url': 'https://esa-worldcover.org (AWS open data s3://esa-worldcover/v200/2021/map)', 'customer': True},
    'gsw': {'dataset': 'JRC Global Surface Water v1.4 (1984-2021) occurrence', 'provider': 'European Commission Joint Research Centre / Copernicus Programme',
            'licence': 'free of charge, without restriction of use (Copernicus data policy)', 'licenceUrl': 'https://global-surface-water.appspot.com/download',
            'attribution': 'Source: EC JRC/Google, Pekel et al. (2016) High-resolution mapping of global surface water and its long-term changes, Nature 540, 418-422',
            'url': 'https://global-surface-water.appspot.com (via Microsoft Planetary Computer jrc-gsw)', 'customer': True},
    's2': {'dataset': 'Copernicus Sentinel-2 L2A (surface reflectance, scene classification)', 'provider': 'ESA / Copernicus; COGs by Element 84 (earth-search, AWS open data sentinel-cogs)',
           'licence': 'Copernicus Sentinel data terms (free, full and open; attribution)', 'licenceUrl': 'https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice',
           'attribution': 'Contains modified Copernicus Sentinel data [2024-2026]', 'url': 'https://earth-search.aws.element84.com/v1 (collection sentinel-2-l2a)', 'customer': True},
    'modis13': {'dataset': 'MODIS Terra MOD13A1 v061 16-day NDVI 500 m', 'provider': 'NASA LP DAAC',
                'licence': 'NASA open data (no restriction on use)', 'licenceUrl': 'https://lpdaac.usgs.gov/data/data-citation-and-policies/',
                'attribution': 'Didan, K. (2021). MOD13A1 MODIS/Terra Vegetation Indices 16-Day L3 Global 500m SIN Grid V061. NASA EOSDIS LP DAAC',
                'url': 'https://planetarycomputer.microsoft.com/dataset/modis-13A1-061', 'customer': True},
    'modis11': {'dataset': 'MODIS Terra MOD11A2 and Aqua MYD11A2 v061 8-day land surface temperature 1 km', 'provider': 'NASA LP DAAC',
                'licence': 'NASA open data (no restriction on use)', 'licenceUrl': 'https://lpdaac.usgs.gov/data/data-citation-and-policies/',
                'attribution': 'Wan, Z., Hook, S., Hulley, G. (2021). MOD11A2 / MYD11A2 MODIS Land Surface Temperature/Emissivity 8-Day L3 Global 1km SIN Grid V061. NASA EOSDIS LP DAAC',
                'url': 'https://planetarycomputer.microsoft.com/dataset/modis-11A2-061', 'customer': True},
    'chelsa': {'dataset': 'CHELSA V2.1 climatologies 1981-2010 (tasmax, tasmin, pr)', 'provider': 'WSL Swiss Federal Research Institute (Karger et al.)',
               'licence': 'CC0 1.0', 'licenceUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
               'attribution': 'Karger, D.N. et al. (2017) Climatologies at high resolution for the earth land surface areas. Scientific Data 4, 170122; CHELSA V2.1 (doi:10.16904/envidat.228)',
               'url': 'https://chelsa-climate.org (os.zhdk.cloud.switch.ch/envicloud/chelsa/chelsa_V2/GLOBAL/climatologies/1981-2010)', 'customer': True},
    'landsat': {'dataset': 'Landsat 8/9 Collection 2 Level-2 surface temperature (ST_B10)', 'provider': 'U.S. Geological Survey',
                'licence': 'Public domain (USGS)', 'licenceUrl': 'https://www.usgs.gov/information-policies-and-instructions/crediting-usgs',
                'attribution': 'Landsat Level-2 Surface Temperature courtesy of the U.S. Geological Survey',
                'url': 'https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2', 'customer': True},
    'ghsl': {'dataset': 'GHS-BUILT-S R2023A 10 m (E2018)', 'provider': 'European Commission, Joint Research Centre (JRC)',
             'licence': 'CC BY 4.0', 'licenceUrl': 'https://creativecommons.org/licenses/by/4.0/',
             'attribution': 'GHSL Data Package 2023, European Commission JRC (Pesaresi et al. 2023)',
             'url': 'https://human-settlement.emergency.copernicus.eu', 'customer': True},
}


def load_points():
    with open(POINTS) as f:
        rows = list(csv.DictReader(f))
    for r in rows:   # two MACH rows carry no coordinates [measured]; they are kept with lat/lon None and get blank features
        try: r['lat'] = float(r['lat']); r['lon'] = float(r['lon'])
        except ValueError: r['lat'] = r['lon'] = None
    return rows


def located_points():
    return [p for p in load_points() if p['lat'] is not None]


def pak_mask():
    """bool (rows, cols): tehsil cells dilated by MASK_PAD_CELLS; cached in scratch"""
    fn = os.path.join(SCRATCH, 'pakmask.npy')
    if os.path.exists(fn):
        return np.load(fn)
    import rasterio.features
    from affine import Affine
    from scipy.ndimage import binary_dilation
    gj = json.load(open(os.path.join(DATA, 'pk-tehsils.json')))
    tr = Affine(GRID['cell'], 0, GRID['west'], 0, -GRID['cell'], GRID['north'])
    m = rasterio.features.rasterize(((f['geometry'], 1) for f in gj['features']), out_shape=(GRID['rows'], GRID['cols']),
                                    transform=tr, fill=0, dtype='uint8').astype(bool)
    k = MASK_PAD_CELLS
    yy, xx = np.mgrid[-k:k + 1, -k:k + 1]
    m = binary_dilation(m, structure=(xx * xx + yy * yy) <= k * k)
    np.save(fn, m)
    return m


def g9_transform():
    from affine import Affine
    return Affine(GRID['cell'], 0, GRID['west'], 0, -GRID['cell'], GRID['north'])


def merge_pointfeat(cols, units):
    """cols: {feature: {id: value}}; units: {feature: 'unit - description'}; merges into pointfeat_S.csv/json"""
    import fcntl
    with open(PF_CSV + '.lock', 'w') as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        _merge_pointfeat(cols, units)


def _merge_pointfeat(cols, units):
    pts = load_points()
    table = {p['id']: {} for p in pts}
    if os.path.exists(PF_CSV):
        with open(PF_CSV) as f:
            for r in csv.DictReader(f):
                table.setdefault(r['id'], {}).update({k: v for k, v in r.items() if k != 'id'})
    for feat, vals in cols.items():
        for pid in table:
            v = vals.get(pid)
            table[pid][feat] = '' if v is None or (isinstance(v, float) and not np.isfinite(v)) else (round(v, 4) if isinstance(v, float) else v)
    feats = []
    for pid in table:
        for k in table[pid]:
            if k not in feats: feats.append(k)
    with open(PF_CSV, 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(['id'] + feats)
        for p in pts:
            w.writerow([p['id']] + [table[p['id']].get(k, '') for k in feats])
    meta = json.load(open(PF_JSON)) if os.path.exists(PF_JSON) else {'agent': 'S (surface)', 'build': 'v91.17.72', 'units': {}, 'sources': {}}
    meta['units'].update(units)
    meta['n'] = len(pts)
    json.dump(meta, open(PF_JSON, 'w'), indent=1)


def note_sources(keys, extra=None):
    meta = json.load(open(PF_JSON)) if os.path.exists(PF_JSON) else {'agent': 'S (surface)', 'build': 'v91.17.72', 'units': {}, 'sources': {}}
    for k in keys: meta['sources'][k] = LIC[k]
    if extra: meta.update(extra)
    json.dump(meta, open(PF_JSON, 'w'), indent=1)


def disk_free_gb(path='/home/claude'):
    st = os.statvfs(path); return st.f_bavail * st.f_frsize / 1e9


def scratch_used_gb():
    t = 0
    for dp, _, fs in os.walk(SCRATCH):
        for f in fs:
            try: t += os.path.getsize(os.path.join(dp, f))
            except OSError: pass
    return t / 1e9


def requantize(name, scale):
    """re-write an existing band at a coarser scale, keeping its provenance (used to keep the feature grid small)"""
    import json as _j
    idx = _j.load(open(os.path.join(DATA, 'feat', name + '.json')))
    a = read_band(DATA, name)
    keep = {k: v for k, v in idx.items() if k not in ('band', 'grid', 'dtype', 'nodata', 'scale', 'offset', 'units', 'built', 'method', 'source',
                                                        'parts', 'blocks', 'nBlocks', 'stats', 'licence')}
    return write_band(DATA, name, a, scale=scale, offset=idx.get('offset', 0.0), units=idx['units'], method=idx['method'], source=idx['source'],
                      licence=idx.get('licence'), extra=keep)
