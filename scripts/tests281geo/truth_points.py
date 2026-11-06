"""GEO281 · ground truth for the reverse place name, generated from OpenStreetMap itself (no hand-typed names or coordinates).
Independent of the server code path: a separate Python MVT decoder + shapely. For each extract (.pmtiles, Protomaps schema) the
z15 landuse polygons of settlement kinds are clipped to their tile, unioned per feature id, and named by the label point with the
same id. Test points are sampled at random (fixed seed) INSIDE named polygons — half near an edge (10-40 m inside the boundary,
preferring edges that face another named area, e.g. the F-11/G-11 sector line) and half anywhere inside. The truth for a point is
the SMALLEST named area that contains it (the rule the server must follow).
usage: python3 truth_points.py <out.json> <set>=<file.pmtiles>[:<n>[:<name regex>[:<neighbour regex within 400 m>[:<w,s,e,n>]]]] ...   (stdlib + shapely)"""
import sys, json, gzip, struct, math, random, re
from shapely.geometry import Polygon, Point, box
from shapely.ops import unary_union
from shapely.validation import make_valid
LABEL_KINDS = {'residential','administrative','neighbourhood','suburb','quarter','village','hamlet','town','city','locality','isolated_dwelling'}
AREA_KINDS = {'residential','other','neighbourhood','suburb','quarter','village','hamlet','town','city','locality'}
LATIN = re.compile(r'^[\x00-\x7FÀ-ɏ‘’“”–—]+$')

def varint(b, p):
    r = s = 0
    while True:
        x = b[p]; p += 1; r |= (x & 0x7f) << s; s += 7
        if not x & 0x80: return r, p
def fields(b):
    p = 0
    while p < len(b):
        t, p = varint(b, p); f, w = t >> 3, t & 7
        if w == 0: v, p = varint(b, p)
        elif w == 1: v = b[p:p+8]; p += 8
        elif w == 2: n, p = varint(b, p); v = b[p:p+n]; p += n
        elif w == 5: v = b[p:p+4]; p += 4
        else: raise ValueError(w)
        yield f, w, v
def packed(b):
    out = []; p = 0
    while p < len(b): v, p = varint(b, p); out.append(v)
    return out
def val(b):
    for f, w, v in fields(b):
        if f == 1: return v.decode()
        if f == 2: return struct.unpack('<f', v)[0]
        if f == 3: return struct.unpack('<d', v)[0]
        if f in (4, 5): return v
        if f == 6: return (v >> 1) ^ -(v & 1)
        if f == 7: return bool(v)
def layers(tile):
    for f, w, v in fields(tile):
        if f != 3: continue
        name = None; feats = []; keys = []; vals = []; ext = 4096
        for f2, w2, v2 in fields(v):
            if f2 == 1: name = v2.decode()
            elif f2 == 2: feats.append(v2)
            elif f2 == 3: keys.append(v2.decode())
            elif f2 == 4: vals.append(val(v2))
            elif f2 == 5: ext = v2
        out = []
        for fb in feats:
            fid = 0; tags = []; typ = 0; geom = []
            for f3, w3, v3 in fields(fb):
                if f3 == 1: fid = v3
                elif f3 == 2: tags = packed(v3)
                elif f3 == 3: typ = v3
                elif f3 == 4: geom = packed(v3)
            props = {keys[tags[i]]: vals[tags[i+1]] for i in range(0, len(tags), 2)}
            rings = []; cur = None; x = y = 0; i = 0
            while i < len(geom):
                c = geom[i]; i += 1; cid, cnt = c & 7, c >> 3
                if cid in (1, 2):
                    for _ in range(cnt):
                        dx, dy = geom[i], geom[i+1]; i += 2
                        x += (dx >> 1) ^ -(dx & 1); y += (dy >> 1) ^ -(dy & 1)
                        if cid == 1: cur = [(x, y)]; rings.append(cur)
                        else: cur.append((x, y))
            out.append((fid, typ, props, ext, rings))
        yield name, out

def pm_tiles(path):
    f = open(path, 'rb'); h = f.read(127); u = lambda o: struct.unpack('<Q', h[o:o+8])[0]
    rootOff, rootLen, leafOff, dataOff = u(8), u(16), u(40), u(56); zmax = h[101]; tc = h[98]; ic = h[97]
    def rd(o, l): f.seek(o); return f.read(l)
    unz = (lambda b: gzip.decompress(b)) if ic == 2 else (lambda b: b)
    def pdir(b):
        p = 0; n, p = varint(b, p); ids = []; last = 0
        for _ in range(n): d, p = varint(b, p); last += d; ids.append(last)
        rl = []; ln = []; off = []
        for _ in range(n): v, p = varint(b, p); rl.append(v)
        for _ in range(n): v, p = varint(b, p); ln.append(v)
        for k in range(n):
            v, p = varint(b, p); off.append(off[k-1] + ln[k-1] if v == 0 and k > 0 else v - 1)
        return list(zip(ids, rl, ln, off))
    lo = sum(4**t for t in range(zmax)); hi = lo + 4**zmax
    def xy(z, d):
        n = 2**z; x = y = 0; t = d; s = 1
        while s < n:
            rx = 1 & (t // 2); ry = 1 & (t ^ rx)
            if ry == 0:
                if rx == 1: x = s-1-x; y = s-1-y
                x, y = y, x
            x += s*rx; y += s*ry; t //= 4; s *= 2
        return x, y
    stack = [pdir(unz(rd(rootOff, rootLen)))]
    while stack:
        for tid, rl, ln, off in stack.pop():
            if rl == 0: stack.append(pdir(unz(rd(leafOff + off, ln)))); continue
            if tid + rl <= lo or tid >= hi: continue
            data = rd(dataOff + off, ln); data = gzip.decompress(data) if tc == 2 else data
            for k in range(rl):
                i = tid + k
                if lo <= i < hi: x, y = xy(zmax, i - lo); yield zmax, x, y, data

def tolonlat(z, x, y, ext, px, py):
    n = 2**z; lon = (x + px/ext)/n*360 - 180; lat = math.degrees(math.atan(math.sinh(math.pi*(1 - 2*(y + py/ext)/n)))); return lon, lat

def areas_of(path):
    labels = {}; pieces = {}
    for z, x, y, data in pm_tiles(path):
        for ln, feats in layers(data):
            if ln in ('pois', 'places'):
                for fid, typ, pr, ext, rings in feats:
                    if typ != 1 or not fid or not pr.get('name') or pr.get('kind') not in LABEL_KINDS or sum(ch.isalpha() for ch in pr['name']) < 2: continue
                    en = pr.get('name:en') or (pr['name'] if LATIN.match(pr['name']) else None)
                    if fid in labels and (labels[fid][0] or not en): continue
                    labels[fid] = (en, pr['name'], pr.get('kind'))
            elif ln == 'landuse':
                clip = box(*tolonlat(z, x, y, 1, 0, 1), *tolonlat(z, x, y, 1, 1, 0))
                for fid, typ, pr, ext, rings in feats:
                    if typ != 3 or not fid or pr.get('kind') not in AREA_KINDS: continue
                    # MVT: exterior rings positive area in tile coords (y down), holes negative; build polygons
                    polys = []
                    for r in rings:
                        if len(r) < 3: continue
                        a = sum(r[i][0]*r[(i+1)%len(r)][1] - r[(i+1)%len(r)][0]*r[i][1] for i in range(len(r)))
                        ll = [tolonlat(z, x, y, ext, px, py) for px, py in r]
                        if a > 0: polys.append([ll, []])
                        elif polys: polys[-1][1].append(ll)
                    g = [make_valid(Polygon(o, h)) for o, h in polys]
                    g = unary_union(g).intersection(clip) if g else None
                    if g is not None and not g.is_empty: pieces.setdefault(fid, []).append(g)
    out = {}
    for fid, gs in pieces.items():
        if fid not in labels: continue
        g = unary_union(gs); en, raw, kind = labels[fid]
        lat0 = g.centroid.y; m2 = g.area * (111320**2) * math.cos(math.radians(lat0))
        out[fid] = dict(name=en or raw, local=raw, kind=kind, geom=g, m2=m2)
    return out

def truth(areas, pt):
    c = [a for a in areas.values() if a['geom'].contains(pt)]
    return min(c, key=lambda a: a['m2']) if c else None

def sample_none(areas, n, bb, rng):   # points inside the box that NO named area contains: the honest answer is "Near X", never "in X"
    out = []
    while len(out) < n:
        p = Point(rng.uniform(bb[0], bb[2]), rng.uniform(bb[1], bb[3]))
        if truth(areas, p) is None: out.append(dict(lat=round(p.y, 6), lon=round(p.x, 6), truth=None, truthKind=None, edgeM=None, edge=False, neighbours=[]))
    return out

def sample(areas, n, rx, rng, nrx=None, bb=None):
    if rx == 'NONE': return sample_none(areas, n, bb, rng)
    pool = [a for a in areas.values() if (not rx or re.search(rx, a['name'], re.I)) and (not bb or box(*bb).contains(a['geom'].representative_point()))]
    pool.sort(key=lambda a: a['name']); out = []; tries = 0
    while len(out) < n and tries < 20000 and pool:
        tries += 1; a = rng.choice(pool); g = a['geom']; edge = len(out) % 2 == 0
        minx, miny, maxx, maxy = g.bounds; p = Point(rng.uniform(minx, maxx), rng.uniform(miny, maxy))
        if not g.contains(p): continue
        dm = g.exterior.distance(p) * 111320 if g.geom_type == 'Polygon' else g.boundary.distance(p) * 111320
        if edge and not (10 <= dm <= 40): continue
        if not edge and dm < 10: continue
        t = truth(areas, p)
        if nrx and not any(b is not t and re.search(nrx, b['name'], re.I) and b['geom'].distance(p) * 111320 < 400 for b in areas.values()): continue
        out.append(dict(lat=round(p.y, 6), lon=round(p.x, 6), truth=t['name'], truthLocal=t['local'], truthKind=t['kind'], edgeM=round(dm, 1), edge=edge,
                        neighbours=sorted({b['name'] for b in areas.values() if b is not t and b['geom'].distance(p) * 111320 < 150})[:4]))
    return out

CACHE = {}
if __name__ == '__main__':
    rng = random.Random(281); res = []
    for spec in sys.argv[2:]:
        nm, rest = spec.split('=', 1); parts = rest.split(':'); path = parts[0]; n = int(parts[1]) if len(parts) > 1 else 6; rx = parts[2] or None if len(parts) > 2 else None
        nrx = parts[3] or None if len(parts) > 3 else None; bb = [float(v) for v in parts[4].split(',')] if len(parts) > 4 and parts[4] else None
        A = CACHE.get(path) or CACHE.setdefault(path, areas_of(path)); s = sample(A, n, rx, rng, nrx, bb)
        for p in s: p['set'] = nm
        res += s; print(nm, len(A), 'named areas;', len(s), 'points', file=sys.stderr)
    json.dump(res, open(sys.argv[1], 'w'), indent=0, ensure_ascii=False)
