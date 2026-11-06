"""GEO281 · does the AGN boundary line up with the OSM basemap? Measured, in metres. No typed coordinates: sample places are taken
evenly along our own lines, Karachi/Gwadar from the place index (largest-population row of that name), OSM geometry from the street
map archive (Protomaps build of OSM).
usage: python3 align_check.py <srv root> <pk.pmtiles> <bundle data dir/> [pk-tehsils.json to test (default data/pk-tehsils.json)]
Prints a JSON report."""
import sys, json, gzip, math, subprocess, random
import shapely, pyogrio
from shapely.geometry import shape, Point, LineString, MultiLineString, box, Polygon
from shapely.ops import unary_union, linemerge
ROOT, PM, BUN = sys.argv[1], sys.argv[2], sys.argv[3]
TEH = sys.argv[4] if len(sys.argv) > 4 else ROOT + '/data/pk-tehsils.json'
M = lambda lat: (111320 * math.cos(math.radians(lat)), 110574)   # metres per degree lon, lat

def tiles_for(points, z):
    n = 2 ** z; s = set()
    for lon, lat in points:
        x = int((lon + 180) / 360 * n); y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n); s.add((z, x, y))
    return sorted(s)
def dump(tiles, layers):
    r = subprocess.run(['node', ROOT + '/scripts/tests281geo/dump_tiles.mjs', PM, layers], input=json.dumps([list(t) for t in tiles]), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)
def tile_box(z, x, y):
    n = 2 ** z; lon0 = x / n * 360 - 180; lon1 = (x + 1) / n * 360 - 180
    lat = lambda yy: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n)))); return box(lon0, lat(y + 1), lon1, lat(y))
def dist_m(pts, geom, lat):
    kx, ky = M(lat); g = shapely.transform(geom, lambda c: c * [kx, ky])
    return [g.distance(Point(p[0] * kx, p[1] * ky)) for p in pts]
def stats(d):
    d = sorted(d); return None if not d else {'n': len(d), 'median_m': round(d[len(d) // 2]), 'p90_m': round(d[int(0.9 * (len(d) - 1))]), 'max_m': round(d[-1])}
def along(lines, k, rng=None):   # k points evenly spaced along a (multi)line
    L = linemerge(lines) if lines.geom_type != 'LineString' else lines; tot = L.length
    return [L.interpolate((i + 0.5) / k, normalized=True) for i in range(k)]

# ── our geometry ──
nat_full = unary_union(list(pyogrio.read_dataframe(BUN + 'pakistan.gpkg', layer='national').geometry))
prov = pyogrio.read_dataframe(BUN + 'pakistan.gpkg', layer='provinces_clean')
dist_ = pyogrio.read_dataframe(BUN + 'pakistan.gpkg', layer='districts')
html = open(ROOT + '/build/start/start.src.html', encoding='utf8').read()
i = html.index('id="agn-pk-bound">') + len('id="agn-pk-bound">'); B = json.loads(html[i:html.index('</script>', i)])
import os
if os.environ.get('BOUND_JSON'): B = json.load(open(os.environ['BOUND_JSON']))   # a candidate outline (mkbound.py output) instead of the page's
q = B.get('q', 1000)
def dec(r):
    out = []; x = y = 0
    for j in range(0, len(r), 2): x += r[j]; y += r[j + 1]; out.append((x / q, y / q))
    return out
start_nat = unary_union([Polygon(dec(p[0])) for p in B['national']])
T = json.load(open(TEH)); teh = [(f['properties'], shape(f['geometry'])) for f in T['features']]
teh_prov = {}
for p, g in teh: teh_prov.setdefault(p['province'], []).append(g)
teh_prov = {k: unary_union(v) for k, v in teh_prov.items()}
rep = {}

# ── (a1) coastline: OSM land ("earth" polygon edges, tile edges removed) vs our national outline, near Karachi and Gwadar ──
rows = {}
for line in gzip.open(ROOT + '/data/pk-places.tsv.gz', 'rt', encoding='utf8'):
    c = line.rstrip('\n').split('\t')
    if len(c) > 6 and c[0] in ('Karachi', 'Gwadar') and (c[0] not in rows or int(c[6] or 0) > rows[c[0]][2]): rows[c[0]] = (float(c[4]), float(c[3]), int(c[6] or 0))
coast = nat_full.boundary
for city, (lon, lat, _) in rows.items():
    # coastal stretch of OUR outline within 40 km of the city, 8 sample points along it, z13 OSM tiles there
    near = coast.intersection(Point(lon, lat).buffer(40 / 111))
    pts = [(p.x, p.y) for p in along(near, 8)]
    F = dump(tiles_for(pts, 13), 'earth')
    osm = []
    for f in F:
        tb = tile_box(*f['tile']).exterior.buffer(1e-6)
        for r in f['rings']:
            for v in r:
                if not tb.contains(Point(v)) and Point(v).distance(Point(lon, lat)) < 45 / 111: osm.append(v)
    rep['coastline_' + city] = {'osm_vertices': len(osm), 'vs_bundle_full_0.0001deg': stats(dist_m(osm, nat_full.boundary, lat)),
                                'vs_start_page_outline': stats(dist_m(osm, start_nat.boundary, lat))}

# ── (a2) province lines: OSM admin_level 4 vs AGN provinces (full) and vs the tehsil polygons the server resolves with ──
inner = []
P = list(prov.itertuples())
for a in range(len(P)):
    for b in range(a + 1, len(P)):
        if 'Indian' in P[a].province or 'Indian' in P[b].province: continue
        s = P[a].geometry.boundary.intersection(P[b].geometry.boundary)
        if not s.is_empty and s.length > 0.05: inner.append((P[a].province + ' | ' + P[b].province, s))
samples = []
tot = sum(s.length for _, s in inner)
for nm, s in inner:
    k = max(1, round(10 * s.length / tot))
    for p in along(s if s.geom_type != 'GeometryCollection' else MultiLineString([g for g in s.geoms if g.geom_type == 'LineString']), k): samples.append((nm, p))
prov_lines = unary_union([g.boundary for g in prov.geometry]); teh_lines = unary_union([g.boundary for g in teh_prov.values()])
out = []
for nm, p in samples:
    F = dump(tiles_for([(p.x, p.y)], 12), 'boundaries')
    osm = [v for f in F if f['props'].get('kind_detail') == 4 for r in f['rings'] for v in r if Point(v).distance(p) < 5 / 111]
    if not osm: out.append({'where': nm, 'lon': round(p.x, 3), 'lat': round(p.y, 3), 'osm': 'no admin-4 line within 5 km'}); continue
    out.append({'where': nm, 'lon': round(p.x, 3), 'lat': round(p.y, 3), 'osm_vertices': len(osm),
                'vs_bundle_full': stats(dist_m(osm, prov_lines, p.y)), 'vs_pk_tehsils_json': stats(dist_m(osm, teh_lines, p.y))})
rep['province_lines_vs_osm_admin4'] = out

# ── (a3) tehsil lines: OSM admin_level 7 (tehsil) and 6 (district) lines vs the official tehsil edges, 12 places spread along them ──
Gt = pyogrio.read_dataframe(BUN + 'pakistan.gpkg', layer='tehsil_boundary')
tedges = unary_union([g.boundary for g in Gt.geometry]).difference(nat_full.boundary.buffer(0.001))
el = [l for l in getattr(tedges, 'geoms', [tedges]) if l.length > 0.02]
rng0 = random.Random(7); picks = rng0.sample(el, min(12, len(el))); out = []
for l in picks:
    p = l.interpolate(0.5, normalized=True)
    F = dump(tiles_for([(p.x, p.y)], 12), 'boundaries')
    for lvl in (7, 6):
        osm = [v for f in F if f['props'].get('kind_detail') == lvl for r in f['rings'] for v in r if Point(v).distance(p) < 3 / 111]
        if osm: out.append({'lon': round(p.x, 3), 'lat': round(p.y, 3), 'osm_admin_level': lvl, 'osm_vertices': len(osm), 'vs_official_tehsil_edges': stats(dist_m(osm, tedges, p.y))}); break
    else: out.append({'lon': round(p.x, 3), 'lat': round(p.y, 3), 'osm': 'no admin 6/7 line within 3 km'})
rep['tehsil_lines_vs_osm_admin6_7'] = out

# ── (c) simplification of the served geometry vs the bundle's full-resolution coverage ──
G = {(r.province, r.district, r.tehsil): r.geometry for r in pyogrio.read_dataframe(BUN + 'pakistan.gpkg', layer='tehsil_boundary').itertuples()}
hd = sorted(g.hausdorff_distance(G[(p['province'], p['district'], p['tehsil'])]) * 1e5 for p, g in teh if (p['province'], p['district'], p['tehsil']) in G)
rep['pk_tehsils_json_vs_full_hausdorff_m'] = {'n': len(hd), 'median': round(hd[len(hd) // 2]), 'p90': round(hd[int(.9 * len(hd))]), 'max': round(hd[-1]), 'vertices': int(sum(shapely.get_num_coordinates(g) for _, g in teh))}
sv = [c for g in getattr(start_nat, 'geoms', [start_nat]) for c in g.exterior.coords]
rep['start_page_outline_vertices_to_full_line_m'] = stats([d for d in dist_m(sv, nat_full.boundary, 30)])

# ── (d) which tehsil holds a point near an edge: served polygons vs the full-resolution official polygons ──
rng = random.Random(281); edges = unary_union([g.boundary for g in G.values()]); keys = list(G.keys())
from shapely import STRtree
gl = list(G.values()); tree = STRtree(gl); tl = [g for _, g in teh]; ttree = STRtree(tl)
pts = []
el = list(edges.geoms) if hasattr(edges, 'geoms') else [edges]; wts = [l.length for l in el]
while len(pts) < 3000:
    l = rng.choices(el, wts)[0]; c = l.interpolate(rng.random(), normalized=True); a = rng.random() * 2 * math.pi; r = rng.uniform(0, 2000)
    lat = c.y + r * math.sin(a) / 110574; lon = c.x + r * math.cos(a) / M(c.y)[0]; pts.append((Point(lon, lat), r))
dis = []; bins = {}
for p, r in pts:
    hf = [keys[j] for j in tree.query(p, predicate='within')]; ht = [tuple(teh[j][0][k] for k in ('province', 'district', 'tehsil')) for j in ttree.query(p, predicate='within')]
    if not hf: continue
    b = '0-250m' if r < 250 else '250-500m' if r < 500 else '500-1000m' if r < 1000 else '1-2km'; bins.setdefault(b, [0, 0]); bins[b][1] += 1
    if not ht or ht[0] != hf[0]: bins[b][0] += 1; dis.append(round(edges.distance(p) * 1e5))
rep['tehsil_resolution_near_edges'] = {'points': sum(v[1] for v in bins.values()), 'wrong_tehsil_by_distance_from_edge': {k: f'{v[0]}/{v[1]}' for k, v in sorted(bins.items())},
                                       'wrong_total': len(dis), 'wrong_dist_to_edge_m': stats(dis)}
print(json.dumps(rep, indent=1))
