"""GEO281 · data/pk-tehsils-fine.json.gz: the AGN tehsil polygons at the bundle's FULL published resolution, for point -> tehsil resolution.
Measured (scripts/tests281geo/align_check.py): data/pk-tehsils.json (the display file) departs from the official full-resolution
tehsils by 774 m median / 1,409 m max (Hausdorff), and 41% of points within 250 m of a tehsil edge (25% at 250-500 m, 13% of all
points within 2 km) resolved to the WRONG tehsil. This file keeps the official geometry as published in
ai-geo-navigators-pk-maps bundle 3.3.0 pakistan.gpkg layer tehsil_boundary (0.0001 deg tolerance, ~11 m; shared edges exact),
coordinates rounded to 1e-5 deg (~1 m), no further simplification. Properties exactly as data/pk-tehsils.json (matched on
province + district + tehsil; the build stops if any tehsil does not match one-to-one). Official lines are not changed.
usage: python3 build_tehsils_fine.py <bundle data dir/> <srv root>"""
import sys, json, gzip, pyogrio
from shapely.geometry import mapping
BUN, ROOT = sys.argv[1], sys.argv[2]
g = pyogrio.read_dataframe(BUN + 'pakistan.gpkg', layer='tehsil_boundary')
assert str(g.crs).upper().endswith('4326'), g.crs
cur = json.load(open(ROOT + '/data/pk-tehsils.json'))
k = lambda p: (p['province'], p['district'], p['tehsil'])
props = {k(f['properties']): f['properties'] for f in cur['features']}
assert len(props) == len(cur['features']) == len(g), (len(props), len(g))
def rnd(c):
    if isinstance(c[0], (int, float)): return [round(c[0], 5), round(c[1], 5)]
    return [rnd(x) for x in c]
feats = []
for r in g.itertuples():
    p = props.pop((r.province, r.district, r.tehsil))
    m = mapping(r.geometry); feats.append({'type': 'Feature', 'properties': p, 'geometry': {'type': m['type'], 'coordinates': rnd(m['coordinates'])}})
assert not props, props
out = {'built': cur.get('built'), 'builtNote': 'GEO281: official tehsil geometry at full published resolution (bundle 3.3.0 pakistan.gpkg tehsil_boundary, 0.0001 deg), for point-in-tehsil; display keeps data/pk-tehsils.json',
       'source': 'AI Geo Navigators boundary data (2026), bundle 3.3.0, pakistan.gpkg', 'type': 'FeatureCollection', 'features': feats}
s = json.dumps(out, separators=(',', ':')).encode(); gzip.open(ROOT + '/data/pk-tehsils-fine.json.gz', 'wb', 9).write(s)
print('wrote data/pk-tehsils-fine.json.gz', len(feats), 'tehsils', round(len(s) / 1e6, 2), 'MB raw')
