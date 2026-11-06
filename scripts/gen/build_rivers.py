"""v91.17.282 START282 / VER282 . build data/pk-rivers.json: the major rivers of the start page as compact lines, ordered DOWNSTREAM.

Geometry is OpenStreetMap's own river centre-lines (waterway=river), the same lines the street map draws, so the blue ribbons sit on the
mapped water at every zoom. (The first v282 build traced lines over the DEM and JRC water; on the plains that followed canals and
cut straight across the doabs: replaced.)
Inputs (nothing is typed but the OSM names that belong to each river):
  OSM river lines   scripts/gen/river_lines_osm.mjs over the Protomaps basemap build (OpenStreetMap, ODbL), layer "water", kind
                    "river", zoom 10; each piece clipped to its tile so pieces meet end to end
  data/feat/t_elev  Copernicus DEM GLO-30 (0.0025 deg): the drawing domain (Pakistan and ~5 km past the frontier) and the downstream order
  server/contract/riverpoints.json   NIGRAAN's river forecast points (for the river click: nearest point, its status)
Method
  1 The pieces of one river (its OSM names, below) are cut to the DEM domain.
  2 Vertices closer than 25 m are merged (pieces of one way meet at the tile edge, tributary ways share a vertex) and the pieces become one
    graph; separate parts are bridged at their nearest vertices when the gap is under 5 km (a short reach missing from the zoom-10 lines).
  3 The main stem is the longest of the shortest paths across the largest part (two Dijkstra sweeps): side channels and short braids
    with the same name drop out.
  4 Downstream order from the DEM: the line is reversed if the median ground height of its first tenth is below its last tenth.
  5 Douglas-Peucker simplification (0.0006 deg, about 60 m) and coordinates rounded to 1e-4 deg (about 11 m).
  6 Forecast points of the river: distance to the line (snapKm), DEM height there (elevM), listed high to low; a point more than 15 km
    from the line (outside the domain) is left out. "joins": the drawn river whose line passes within 3 km of this river's last vertex.
  Shyok has no NIGRAAN river forecast point: drawn as a map line only (the river click says so).
usage: node scripts/gen/river_lines_osm.mjs <basemap.pmtiles> <osm_rivers.json>
       python3 scripts/gen/build_rivers.py <tree root> <osm_rivers.json> [out json]"""
import sys, os, json, zlib, heapq, datetime, math
import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import LineString, Point

ROOT = sys.argv[1]; OSM = sys.argv[2]; OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, 'data', 'pk-rivers.json')
FEAT = os.path.join(ROOT, 'data', 'feat')
NAMES = {   # river -> the OSM names its pieces carry in the Pakistan box (spelling variants as mapped)
    'Indus': ['Indus', 'Indus River'], 'Jhelum': ['Jhelum River', 'Jhelum (Veth)'], 'Chenab': ['Chenab River', 'Chenab', 'Chenab RIver'],
    'Ravi': ['Ravi River', 'Ravi'], 'Sutlej': ['Sutlej River', 'Sutlej'], 'Panjnad': ['Panjnad'], 'Kabul': ['Kabul River'],
    'Swat': ['Swat River', 'River Swat'], 'Gilgit': ['Gilgit River'], 'Hunza': ['Hunza River', 'Hunza'], 'Shyok': ['Shyok River']}

def band(name):
    J = json.load(open(os.path.join(FEAT, name + '.json'))); G = J['grid']; B = G['block']
    A = np.full((G['rows'], G['cols']), J['nodata'], dtype=np.int16)
    blocks = J['blocks'] if isinstance(J['blocks'], dict) else json.loads(J['blocks'])
    fds = {}
    for k, (part, off, ln) in blocks.items():
        br, bc = map(int, k.split(','))
        f = fds.get(part) or open(os.path.join(FEAT, name + '.p' + str(part) + '.bin'), 'rb'); fds[part] = f
        f.seek(off); a = np.frombuffer(zlib.decompress(f.read(ln)), dtype=np.int16).reshape(B, B)
        r0, c0 = br * B, bc * B; h = min(B, G['rows'] - r0); w = min(B, G['cols'] - c0)
        A[r0:r0 + h, c0:c0 + w] = a[:h, :w]
    return J, G, A

EJ, G, E = band('t_elev'); ND = EJ['nodata']; CELL = G['cell']; NR, NC = G['rows'], G['cols']
def rc(lon, lat): return int((G['north'] - lat) / CELL), int((lon - G['west']) / CELL)
def inside(lon, lat):
    r, c = rc(lon, lat); return 0 <= r < NR and 0 <= c < NC and E[r, c] != ND
def elev(lon, lat, k=2):
    r, c = rc(lon, lat); w = E[max(0, r - k):r + k + 1, max(0, c - k):c + k + 1]; v = w[w != ND]
    return float(np.median(v)) if v.size else None
def km(a, b):
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2)); y = math.radians(b[1] - a[1]); return 6371 * math.hypot(x, y)

SRC = json.load(open(OSM)); LINES = SRC['lines']
def pieces(river):
    out = []
    for nm in NAMES[river]:
        for l in LINES.get(nm, []):
            cur = []
            for p in l:
                if inside(*p): cur.append(p)
                else:
                    if len(cur) > 1: out.append(cur)
                    cur = []
            if len(cur) > 1: out.append(cur)
    return out

class VList(list):
    """vertex list that can grow (gap closing adds vertices) and be indexed with numpy index arrays"""
    @property
    def a(self): return np.array(self, dtype=float)
    def __getitem__(self, i):
        if isinstance(i, (list, np.ndarray)) or (isinstance(i, tuple)): return np.array(self, dtype=float)[i]
        return list.__getitem__(self, i)
class XArr:
    def __init__(self, a, kx): self.a = a; self.kx = kx
    def __getitem__(self, i): return self.a[i]
def X_append(X, p): X.a = np.r_[X.a, [[p[0] * X.kx, p[1]]]]

def main_stem(river):
    CUR[0] = river
    P = pieces(river)
    if not P: return None
    V = VList([p for l in P for p in l]); kx = math.cos(math.radians(float(np.mean([p[1] for p in V]))))
    X = XArr(np.c_[V.a[:, 0] * kx, V.a[:, 1]], kx)           # local equirectangular degrees
    par = list(range(len(V)))
    def find(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for i, j in cKDTree(X.a).query_pairs(0.025 / 111.0): par[find(i)] = find(j)          # 25 m
    node = [find(i) for i in range(len(V))]
    adj = {}
    def edge(a, b, w):
        if a == b: return
        adj.setdefault(a, {}); adj.setdefault(b, {})
        if w < adj[a].get(b, 1e18): adj[a][b] = w; adj[b][a] = w
    k = 0
    for l in P:
        for i in range(1, len(l)): edge(node[k + i - 1], node[k + i], km(l[i - 1], l[i]))
        k += len(l)
    def comps():
        seen, C = {}, []
        for s in adj:
            if s in seen: continue
            st = [s]; seen[s] = len(C); cc = [s]
            while st:
                u = st.pop()
                for v in adj[u]:
                    if v not in seen: seen[v] = len(C); cc.append(v); st.append(v)
            C.append(cc)
        return seen, C
    seen, C = comps(); n0 = len(C)
    if len(C) > 1:   # bridge parts at their nearest vertices, gap < 5 km (Kruskal over part pairs)
        ids = np.array(list(adj.keys())); cand = []
        for a, b in cKDTree(X[ids]).query_pairs(5.0 / 111.0):
            ca, cb = seen[ids[a]], seen[ids[b]]
            if ca != cb: cand.append((km(V[ids[a]], V[ids[b]]), int(ids[a]), int(ids[b]), ca, cb))
        cand.sort(); cp = list(range(len(C)))
        def cf(i):
            while cp[i] != i: cp[i] = cp[cp[i]]; i = cp[i]
            return i
        for d, a, b, ca, cb in cand:
            if cf(ca) != cf(cb): cp[cf(ca)] = cf(cb); edge(a, b, d)
        seen, C = comps()
    if len(C) > 1: gap_unnamed(adj, V, X, comps, edge)
    seen, C = comps()
    big = max(C, key=lambda cc: sum(w for u in cc for w in adj[u].values()))
    def dijkstra(s):
        D = {s: 0.0}; prev = {}; h = [(0.0, s)]
        while h:
            d, u = heapq.heappop(h)
            if d > D[u]: continue
            for v, w in adj[u].items():
                if d + w < D.get(v, 1e18): D[v] = d + w; prev[v] = u; heapq.heappush(h, (d + w, v))
        return D, prev
    D, _ = dijkstra(big[0]); a = max(D, key=D.get)
    D, prev = dijkstra(a); b = max(D, key=D.get)
    path = [b]
    while path[-1] != a: path.append(prev[path[-1]])
    xy = [list(V[i]) for i in path]
    t = max(3, len(xy) // 10)
    med = lambda L: (lambda v: v[len(v) // 2] if v else None)(sorted(x for x in L if x is not None))
    h0, h1 = med([elev(*p) for p in xy[:t]]), med([elev(*p) for p in xy[-t:]])
    if h0 is not None and h1 is not None and h0 < h1: xy.reverse()
    return {'xy': xy, 'parts': n0, 'partsAfterBridging': len(C), 'pieces': len(P), 'gaps': GAPS.pop(river, [])}

UN = None; GAPS = {}; CUR = [None]
def gap_unnamed(adj, V, X, comps, edge):
    """close a gap between two parts of a named river along UNNAMED OSM river lines (a reach mapped without its name): shortest path on
    the unnamed network from any vertex of one part to any vertex of the other, accepted only if it is under 1.5 x the straight gap + 5 km
    and the gap is under 60 km. The path's vertices are added to the river (real OSM geometry, never a straight join)."""
    global UN
    if UN is None:
        U = [l for l in LINES.get('', [])]; pts, segs = [], []
        for l in U:
            cur = []
            for p in l:
                if inside(*p): cur.append(p)
                else:
                    if len(cur) > 1: segs.append(cur)
                    cur = []
            if len(cur) > 1: segs.append(cur)
        UN = segs; print('unnamed river pieces in the domain', len(UN))
    while True:
        seen, C = comps()
        if len(C) < 2: return
        C.sort(key=lambda cc: -len(cc)); A = C[0]; done = False
        for Bc in C[1:]:
            ia = np.array(A); ib = np.array(Bc); TA = cKDTree(X[ia]); d, j = TA.query(X[ib]); k = int(np.argmin(d))
            a0, b0 = int(ia[j[k]]), int(ib[k]); gap = km(V[a0], V[b0])
            if gap > 60: print('  ', CUR[0], 'part of', len(Bc), 'vertices is', round(gap), 'km away: left out'); continue
            lo = np.minimum(V[a0], V[b0]) - 0.15; hi = np.maximum(V[a0], V[b0]) + 0.15
            segs = [s for s in UN if any(lo[0] <= p[0] <= hi[0] and lo[1] <= p[1] <= hi[1] for p in s)]
            if not segs: continue
            # local graph: unnamed vertices (ids from len(V)) + both parts' vertices inside the box, joined within 50 m
            UV = np.array([p for s in segs for p in s]); kx = math.cos(math.radians(float(UV[:, 1].mean())))
            box = lambda ids: [int(i) for i in ids if lo[0] <= V[i][0] <= hi[0] and lo[1] <= V[i][1] <= hi[1]]
            na, nb = box(A), box(Bc)
            Y = np.r_[np.c_[UV[:, 0] * kx, UV[:, 1]], np.c_[V[na, 0] * kx, V[na, 1]], np.c_[V[nb, 0] * kx, V[nb, 1]]]
            gid = list(range(len(UV))) + [('a', i) for i in na] + [('b', i) for i in nb]
            g = {}
            def ge(u, v, w):
                if u == v: return
                g.setdefault(u, {})[v] = min(w, g.get(u, {}).get(v, 1e18)); g.setdefault(v, {})[u] = g[u][v]
            def pt(u): return UV[u] if isinstance(u, int) else V[u[1]]
            k0 = 0
            for s in segs:
                for i in range(1, len(s)): ge(k0 + i - 1, k0 + i, km(s[i - 1], s[i]))
                k0 += len(s)
            for i, j2 in cKDTree(Y).query_pairs(0.05 / 111.0):
                ge(gid[i], gid[j2], km(pt(gid[i]), pt(gid[j2])))
            D = {u: 0.0 for u in gid if isinstance(u, tuple) and u[0] == 'a' and u in g}; prev = {}; h = [(0.0, u) for u in D]; heapq.heapify(h); hit = None
            while h:
                dd, u = heapq.heappop(h)
                if dd > D[u]: continue
                if isinstance(u, tuple) and u[0] == 'b': hit = u; break
                for v, w in g[u].items():
                    if dd + w < D.get(v, 1e18): D[v] = dd + w; prev[v] = u; heapq.heappush(h, (dd + w, v))
            if hit is None or D[hit] > 1.5 * gap + 5:
                print('  ', CUR[0], 'gap', round(gap, 1), 'km at', [round(x, 3) for x in V[a0]], [round(x, 3) for x in V[b0]], 'not closed:', 'no unnamed path' if hit is None else 'path %.0f km too long' % D[hit]); continue
            path = [hit]
            while path[-1] in prev: path.append(prev[path[-1]])
            ids = []
            for u in path:
                if isinstance(u, tuple): ids.append(u[1])
                else: V.append(list(UV[u])); X_append(X, V[-1]); ids.append(len(V) - 1)
            for i in range(1, len(ids)): edge(ids[i - 1], ids[i], km(V[ids[i - 1]], V[ids[i]]))
            GAPS.setdefault(CUR[0], []).append({'gapKm': round(gap, 1), 'viaUnnamedKm': round(D[hit], 1)}); print('  ', CUR[0], 'gap', round(gap, 1), 'km closed along unnamed OSM river lines,', round(D[hit], 1), 'km')
            done = True; break
        if not done: return

RP = json.load(open(os.path.join(ROOT, 'server', 'contract', 'riverpoints.json')))['points']
rivers, info = [], {}
for rv in NAMES:
    m = main_stem(rv)
    if not m: print(rv, 'no OSM line inside the DEM domain'); continue
    ls = LineString(m['xy']).simplify(0.0006, preserve_topology=False)
    xy = [[round(x, 4), round(y, 4)] for x, y in ls.coords]
    xy = [p for i, p in enumerate(xy) if i == 0 or p != xy[i - 1]]
    info[rv] = {'xy': xy, 'm': m, 'L': LineString(xy)}
for rv, I in info.items():
    xy = I['xy']; L = I['L']; pts = []
    for p in RP:
        if p['river'] != rv: continue
        q = L.interpolate(L.project(Point(p['lon'], p['lat']))); d = km((p['lon'], p['lat']), (q.x, q.y))
        if d > 15: print(rv, p['id'], 'is', round(d, 1), 'km from the drawn line: not listed'); continue
        pts.append({'id': p['id'], 'name': p['name'], 'lat': p['lat'], 'lon': p['lon'], 'elevM': elev(q.x, q.y), 'snapKm': round(d, 2)})
    pts.sort(key=lambda s: -(s['elevM'] if s['elevM'] is not None else -1e9))
    end = xy[-1]; joins, best = None, 3.0
    for o, J in info.items():
        if o == rv: continue
        q = J['L'].interpolate(J['L'].project(Point(end))); d = km(end, (q.x, q.y))
        if d < best: best, joins = d, o
    e0, e1 = elev(*xy[0]), elev(*xy[-1]); lk = sum(km(xy[i - 1], xy[i]) for i in range(1, len(xy)))
    rivers.append({'name': rv, 'points': [s['id'] for s in pts], 'pointsByElevation': pts, 'joins': joins, 'elevStartM': e0, 'elevEndM': e1,
                   'lengthKm': round(lk, 1), 'coords': xy})
    m = I['m']; print(rv, 'pieces', m['pieces'], 'parts', m['parts'], '->', m['partsAfterBridging'], 'vertices', len(xy), 'km', round(lk), 'elev', e0, '->', e1, 'joins', joins, 'points', [s['id'] for s in pts])
doc = __doc__.split('Method\n', 1)[1].split('usage:')[0].rstrip()
out = {'schema': 'agn.rivers.v1', 'version': '91.17.282', 'built': datetime.date.today().isoformat(), 'productType': 'Reference',
       'what': 'river centre-lines (OpenStreetMap waterway=river) of the major rivers, ordered downstream (first vertex upstream)',
       'method': doc,
       'sources': [{'layer': 'water, kind river (OpenStreetMap waterway=river)', 'dataset': 'Protomaps basemap build, zoom %s' % SRC.get('zoom'), 'source': SRC.get('source'), 'osmTime': SRC.get('built')},
                   {'band': 't_elev', 'dataset': EJ.get('source'), 'built': EJ.get('built')}, {'file': 'server/contract/riverpoints.json'}],
       'attribution': 'Rivers © OpenStreetMap contributors',
       'rivers': rivers}
s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
open(OUT, 'w', encoding='utf-8').write(s); print('wrote', OUT, len(s.encode('utf-8')), 'bytes')
