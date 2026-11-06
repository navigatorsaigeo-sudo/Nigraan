#!/usr/bin/env python3
"""v91.17.244 · tehsil, province and national outlines as ONE topology (no doubled borders).

The page's old outlines were simplified polygon by polygon, so two neighbours simplified their shared border differently and the map
drew two lines a few hundred metres apart (only 45.5 % of neighbour vertices were shared). Here:
  1. the full-resolution AGN tehsils (ai-geo-navigators-pk-maps, pakistan_tehsils.parquet, 577) plus the IIOJK polygon
     (one of the 577 units) are noded together and polygonised into faces; each face goes to the unit holding its interior point
     (overlap slivers: the larger unit; gap slivers inside the outline: the neighbour sharing the longest edge). Result: a valid coverage.
  2. shapely.coverage_simplify (GEOS CoverageSimplifier) simplifies every shared edge once, so neighbours keep identical borders.
  3. provinces and the national outline are dissolved from the same simplified tehsils, so their lines lie exactly on tehsil lines.
Output: data/geo/boundaries-topo.json {PK_DISTRICTS, PK_PROVINCES, PK_NATIONAL} in the page's existing property layout.
Usage: python3 scripts/gen/topo_boundaries.py <pk-maps data dir> [tolerance_deg=0.0025]"""
import sys, os, json, glob, numpy as np, shapely, geopandas as gpd
from shapely.geometry import mapping

D = sys.argv[1] if len(sys.argv) > 1 else glob.glob('/root/.claude/skills/synced/*/ai-geo-navigators-pk-maps/data')[0]
TOL = float(sys.argv[2]) if len(sys.argv) > 2 else 0.009
APP = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IIOJK = 'Indian Illegally Occupied Jammu Kashmir'

T = gpd.read_parquet(f'{D}/pakistan_tehsils.parquet').reset_index(drop=True)
units = list(T.geometry.values)   # the 577 units include IIOJK as one unit (province, district and tehsil all IIOJK), as the page has it
names = [dict(province=r.province, division=r.division, district=r.district, tehsil=r.tehsil) for r in T.itertuples()]
N = len(units)

# 1 · node and polygonise (cached: the noding takes minutes; the cache is keyed on the source file's size and time)
CACHE = f'{APP}/data/geo/.coverage-cache.wkb.json'; st = os.stat(f'{D}/pakistan_tehsils.parquet'); sig = f'{st.st_size}:{int(st.st_mtime)}'
geo = None
if os.path.exists(CACHE):
    c = json.load(open(CACHE))
    if c.get('sig') == sig: geo = np.array([shapely.from_wkb(bytes.fromhex(h)) for h in c['wkb']], dtype=object)
if geo is None:
  lines = shapely.union_all([shapely.boundary(g) for g in units])
  faces = list(shapely.get_parts(shapely.polygonize(shapely.get_parts(lines))))
  tree = shapely.STRtree(units); owner = np.full(len(faces), -1)
  for i, f in enumerate(faces):
      p = f.point_on_surface(); hit = [j for j in tree.query(p, 'intersects')]
      if hit: owner[i] = max(hit, key=lambda j: units[j].area)
  print('noded faces', len(faces), flush=True)
  outline = shapely.union_all(units).buffer(1e-9); shapely.prepare(outline)
  gaps = [i for i in np.where(owner < 0)[0] if outline.contains(faces[i])]
  ftree = shapely.STRtree(faces)
  for _ in range(3):
      for i in list(gaps):
          best, bl = -1, 0.0
          for k in ftree.query(faces[i], 'touches'):
              if owner[k] < 0: continue
              L = faces[k].boundary.intersection(faces[i].boundary).length
              if L > bl: best, bl = owner[k], L
          if best >= 0: owner[i] = best; gaps.remove(i)
  print('faces', len(faces), 'gap faces left unassigned', len(gaps), flush=True)
  geo = []
  for j in range(N):
      fs = [faces[i] for i in np.where(owner == j)[0]]
      assert fs, f'unit {j} {names[j]} lost all faces'
      geo.append(shapely.union_all(fs))
  geo = np.array(geo, dtype=object)
  os.makedirs(os.path.dirname(CACHE), exist_ok=True); json.dump({'sig': sig, 'wkb': [shapely.to_wkb(g, hex=True) for g in geo]}, open(CACHE, 'w'))
assert shapely.coverage_is_valid(geo), 'coverage still invalid after polygonise'

# 2 · simplify the shared edges once
S = shapely.coverage_simplify(geo, TOL, simplify_boundary=True)
bad = shapely.coverage_invalid_edges(S); print('vertices', int(shapely.get_num_coordinates(S).sum()), 'mismatched shared edges', int((~shapely.is_empty(bad)).sum()), flush=True)
# coordinates are written at 4 decimals (about 11 m) below; a shared vertex rounds to the same point on both sides

def poly_only(g):
    parts = [p for p in shapely.get_parts(g) if p.geom_type == 'Polygon' and p.area > 0]
    return parts[0] if len(parts) == 1 else shapely.MultiPolygon(parts)

def feat(i, props, g):
    m = mapping(poly_only(g))
    rnd = lambda c: [round(c[0], 4), round(c[1], 4)]
    if m['type'] == 'Polygon': m = dict(type='Polygon', coordinates=[[rnd(c) for c in r] for r in m['coordinates']])
    else: m = dict(type='MultiPolygon', coordinates=[[[rnd(c) for c in r] for r in p] for p in m['coordinates']])
    return dict(type='Feature', id=str(i), properties=props, geometry=m)

out = {'PK_DISTRICTS': {'type': 'FeatureCollection', 'features': []}, 'PK_PROVINCES': {'type': 'FeatureCollection', 'features': []},
       'PK_NATIONAL': {'type': 'FeatureCollection', 'features': []}}
for j in range(N):
    n = names[j]; out['PK_DISTRICTS']['features'].append(feat(j, dict(n, key=None, uid=f"{n['province']}|{n['district']}|{n['tehsil']}"), S[j]))
provs = sorted({n['province'] for n in names})
for i, pv in enumerate(provs):
    g = shapely.union_all([S[j] for j in range(N) if names[j]['province'] == pv])
    out['PK_PROVINCES']['features'].append(feat(i, {'province': pv}, g))
out['PK_NATIONAL']['features'].append(feat(0, {}, shapely.union_all([S[j] for j in range(N) if names[j]['province'] != IIOJK])))
os.makedirs(f'{APP}/data/geo', exist_ok=True)
json.dump(dict(out, method=__doc__.split('\n')[0], tolerance=TOL, source='AI Geo Navigators boundary data (2026), ai-geo-navigators-pk-maps'),
          open(f'{APP}/data/geo/boundaries-topo.json', 'w'), separators=(',', ':'))
print('written', {k: len(json.dumps(v, separators=(',', ':'))) // 1024 for k, v in out.items()}, 'KB')
