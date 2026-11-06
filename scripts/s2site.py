"""v91.17.283.34 . Scenario Lab B . the site's vegetation index now (Sentinel-2 L2A) and the typical index of nearby ground per cover.

Called by server/api/sitechange.mjs at request time (one process per uncached site; the server caches the answer 7 days).
Input : argv[1] = JSON {"poly": [[lat, lon], ...], "days": 60, "scenes": 3, "bufferKm": 2}
Output: one JSON line on stdout.
Source: Microsoft Planetary Computer STAC, collection sentinel-2-l2a (COGs signed with the anonymous collection token) and
        esa-worldcover (2021 v200, 10 m). No key, no fee.
Method: the most recent scenes of the last `days` days on ONE MGRS tile (the tile holding the site), newest first, kept while the
        site's pixels are at least 30 % clear by the scene classification (SCL 4 vegetation, 5 not vegetated, 7 unclassified);
        up to `scenes` scenes; per-pixel median of the kept scenes; NDVI = (B08 - B04)/(B08 + B04), NDMI = (B08 - B11)/(B08 + B11)
        (B11 and SCL at 20 m repeated to 10 m); the site value is the mean over the polygon's clear pixels.
        Typical index per cover: the median of the clear pixels of that WorldCover class within bufferKm of the site (same scenes).
"""
import sys, json, math, datetime as dt, urllib.request, warnings
warnings.filterwarnings('ignore')
STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
TOKEN = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/'
CLEAR = (4, 5, 7)
WC = {10: 'trees', 20: 'shrub', 30: 'grass', 40: 'crops', 50: 'built', 60: 'bare'}


def jget(url, body=None, timeout=30):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers={'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def out(o):
    sys.stdout.write(json.dumps(o, separators=(',', ':')) + '\n'); sys.stdout.flush()


def main():
    a = json.loads(sys.argv[1]); poly = a['poly']; days = int(a.get('days', 60)); K = int(a.get('scenes', 3)); bkm = float(a.get('bufferKm', 2))
    try:
        import numpy as np, rasterio
        from rasterio.windows import from_bounds
        from rasterio.features import geometry_mask
        from rasterio.warp import reproject, Resampling
        from pyproj import Transformer
    except Exception as e:
        return out({'ok': False, 'why': 'the image reader is not installed on this computer (' + type(e).__name__ + ')'})
    ring = [[float(p[1]), float(p[0])] for p in poly]
    if ring[0] != ring[-1]: ring.append(ring[0])
    geom = {'type': 'Polygon', 'coordinates': [ring]}
    now = dt.datetime.utcnow(); d0 = (now - dt.timedelta(days=days)).strftime('%Y-%m-%dT00:00:00Z'); d1 = now.strftime('%Y-%m-%dT23:59:59Z')
    try:
        tok = jget(TOKEN + 'sentinel-2-l2a')['token']; wtok = jget(TOKEN + 'esa-worldcover')['token']
        fc = jget(STAC + '/search', {'collections': ['sentinel-2-l2a'], 'intersects': geom, 'datetime': d0 + '/' + d1, 'limit': 40,
                                     'sortby': [{'field': 'properties.datetime', 'direction': 'desc'}], 'query': {'eo:cloud_cover': {'lt': 80}}})
    except Exception as e:
        return out({'ok': False, 'unreachable': True, 'why': 'the satellite image service could not be reached (' + type(e).__name__ + ')'})
    items = fc.get('features', [])
    if not items: return out({'ok': False, 'why': 'no satellite scene of the last ' + str(days) + ' days covers this site'})
    lons = [p[0] for p in ring]; lats = [p[1] for p in ring]; clat = (min(lats) + max(lats)) / 2

    def interior(it):   # how far the site lies inside the tile footprint (bbox): prefer the tile that holds it best
        b = it.get('bbox') or [0, 0, 0, 0]; return min(min(lons) - b[0], b[2] - max(lons), min(lats) - b[1], b[3] - max(lats))
    tile = max(items, key=interior).get('properties', {}).get('s2:mgrs_tile')
    items = [it for it in items if it.get('properties', {}).get('s2:mgrs_tile') == tile] or items
    sign = lambda h, t: h + ('&' if '?' in h else '?') + t
    epsg = items[0]['properties'].get('proj:epsg') or int(str(items[0]['properties'].get('proj:code', 'EPSG:32643')).split(':')[1])
    tr = Transformer.from_crs(4326, epsg, always_xy=True)
    xs, ys = tr.transform(lons, lats)
    buf = bkm * 1000.0
    bx0, by0, bx1, by1 = min(xs) - buf, min(ys) - buf, max(xs) + buf, max(ys) + buf
    # snap to the 20 m grid so that 10 m and 20 m windows align (S2 tiles have origins on multiples of 60 m)
    bx0 = math.floor(bx0 / 60) * 60; by0 = math.floor(by0 / 60) * 60; bx1 = math.ceil(bx1 / 60) * 60; by1 = math.ceil(by1 / 60) * 60
    W10 = int(round((bx1 - bx0) / 10)); H10 = int(round((by1 - by0) / 10))
    T10 = rasterio.transform.from_origin(bx0, by1, 10, 10)
    site = ~geometry_mask([{'type': 'Polygon', 'coordinates': [[list(p) for p in zip(xs, ys)] + [[xs[0], ys[0]]]]}], (H10, W10), T10, all_touched=True)
    if site.sum() == 0: return out({'ok': False, 'why': 'the site is smaller than one 10 m pixel'})

    def read(href, res):
        with rasterio.open(href) as ds:
            w = from_bounds(bx0, by0, bx1, by1, ds.transform)
            v = ds.read(1, window=w, boundless=True, fill_value=0, out_shape=(int(round((by1 - by0) / res)), int(round((bx1 - bx0) / res)))).astype('float32')
            off = 1000.0 if (ds.tags().get('BOA_ADD_OFFSET') or '') else 0.0
        return v, off
    kept = []; NV = []; NM = []
    for it in items:
        if len(kept) >= K: break
        A = it['assets']; base = it['properties'].get('s2:processing_baseline', '00.00')
        try:
            scl, _ = read(sign(A['SCL']['href'], tok), 20); scl = np.repeat(np.repeat(scl, 2, 0), 2, 1)[:H10, :W10]
            ok = np.isin(scl, CLEAR); cs = float(ok[site].mean())
            if cs < 0.3: continue
            b4, _ = read(sign(A['B04']['href'], tok), 10); b8, _ = read(sign(A['B08']['href'], tok), 10)
            b11, _ = read(sign(A['B11']['href'], tok), 20); b11 = np.repeat(np.repeat(b11, 2, 0), 2, 1)[:H10, :W10]
        except Exception:
            continue
        off = 1000.0 if base >= '04.00' else 0.0   # processing baseline 04.00+: DN carry a +1000 offset
        b4, b8, b11 = b4 - off, b8 - off, b11 - off
        with np.errstate(all='ignore'):
            ndvi = (b8 - b4) / (b8 + b4); ndmi = (b8 - b11) / (b8 + b11)
        bad = ~ok | (b4 <= 0) | (b8 <= 0) | (b11 <= 0)
        ndvi[bad] = np.nan; ndmi[bad] = np.nan
        NV.append(ndvi); NM.append(ndmi); kept.append({'id': it['id'], 'date': it['properties']['datetime'][:10], 'clearShare': round(cs, 2)})
    if not kept: return out({'ok': False, 'why': 'no clear satellite scene over the site in the last ' + str(days) + ' days (clouds)'})
    with np.errstate(all='ignore'):
        nv = np.nanmedian(np.stack(NV), 0); nm = np.nanmedian(np.stack(NM), 0)
    sv = nv[site]; sm = nm[site]; n = int(np.isfinite(sv).sum())
    if n == 0: return out({'ok': False, 'why': 'no clear pixel over the site in the kept scenes'})
    res = {'ok': True, 'tile': tile, 'scenes': kept, 'pixels': n, 'ndvi': round(float(np.nanmean(sv)), 3), 'ndmi': round(float(np.nanmean(sm)), 3),
           'source': 'Sentinel-2 L2A, ' + str(len(kept)) + ' most recent clear scene(s) of the last ' + str(days) + ' days, median per pixel, mean over the site'}
    typ = {}
    try:
        wc = jget(STAC + '/search', {'collections': ['esa-worldcover'], 'intersects': geom, 'limit': 4})
        wi = [f for f in wc.get('features', []) if '2021' in f['id']] or wc.get('features', [])
        cls = np.zeros((H10, W10), 'uint8')
        for f in wi[:2]:
            with rasterio.open(sign(f['assets']['map']['href'], wtok)) as ds:
                tmp = np.zeros((H10, W10), 'uint8')
                reproject(rasterio.band(ds, 1), tmp, dst_transform=T10, dst_crs='EPSG:' + str(epsg), resampling=Resampling.nearest)
                cls = np.where(cls == 0, tmp, cls)
        for c, name in WC.items():
            m = (cls == c) & np.isfinite(nv)
            if m.sum() >= 20: typ[name] = {'ndvi': round(float(np.nanmedian(nv[m])), 3), 'ndmi': round(float(np.nanmedian(nm[m])), 3), 'pixels': int(m.sum())}
        res['typical'] = typ; res['typicalBasis'] = 'median of the clear pixels of each ESA WorldCover 2021 class within ' + str(bkm) + ' km of the site, same scenes'
    except Exception as e:
        res['typical'] = {}; res['typicalWhy'] = 'the land-cover map could not be read (' + type(e).__name__ + ')'
    out(res)


if __name__ == '__main__':
    try: main()
    except Exception as e: out({'ok': False, 'why': 'the satellite reading failed (' + type(e).__name__ + ')'})
