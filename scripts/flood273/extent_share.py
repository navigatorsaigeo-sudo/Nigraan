"""v91.17.273 FLOOD · observed flooded share per tehsil per year from the flood extents NIGRAAN holds
(FloodExtent_WGS84: Flood_2010/2014/2022/2025, the client vector extents). Equal-area overlay (Albers 25/35N, 70E).
Output: data/flood273/extent-share.json {year: {uid: share}} (share of the tehsil area mapped as flooded in that year's extent)."""
import json, sys, os, geopandas as gpd
from shapely.validation import make_valid
ROOT = sys.argv[1]; SRC = sys.argv[2]; OUT = os.path.join(ROOT, 'data', 'flood273'); os.makedirs(OUT, exist_ok=True)
AEA = '+proj=aea +lat_1=25 +lat_2=35 +lat_0=30 +lon_0=70 +datum=WGS84 +units=m'
T = gpd.read_file(os.path.join(ROOT, 'data', 'pk-tehsils.json'))[['uid', 'geometry']]
T['geometry'] = T.geometry.apply(make_valid); T = T.to_crs(AEA); T['area'] = T.area
res = {}
for y in (2010, 2014, 2022, 2025):
    F = gpd.read_file(os.path.join(SRC, f'Flood_{y}.shp')).to_crs(AEA)
    F['geometry'] = F.geometry.apply(make_valid).buffer(0)
    fu = F.union_all() if hasattr(F, 'union_all') else F.unary_union
    xmin, ymin, xmax, ymax = fu.bounds
    out = {}
    for r in T.itertuples():
        b = r.geometry.bounds
        if b[2] < xmin or b[0] > xmax or b[3] < ymin or b[1] > ymax: out[r.uid] = 0.0; continue
        try: a = r.geometry.intersection(fu).area
        except Exception: a = make_valid(r.geometry).buffer(0).intersection(fu).area
        out[r.uid] = round(a / r.area, 5) if r.area > 0 else 0.0
    res[str(y)] = out
    print(y, 'tehsils with >=1% flooded', sum(v >= 0.01 for v in out.values()), 'total km2', round(fu.area / 1e6), flush=True)
json.dump({'built': 'v91.17.273', 'source': 'FloodExtent_WGS84 Flood_2010/2014/2022/2025 (client vector extents held by NIGRAAN)', 'shares': res}, open(os.path.join(OUT, 'extent-share.json'), 'w'))
