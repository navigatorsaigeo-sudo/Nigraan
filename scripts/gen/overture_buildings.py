"""v91.17.283.4 · item 1 · BUILD data/basemap/pk-buildings.pmtiles: Overture Maps building footprints for Pakistan, stored on this computer.

Run once offline (and again when a newer Overture release is wanted); the server then serves the tiles from the local file
(/tiles/buildings/{z}/{x}/{y}.mvt) and the street map draws them at zoom 15 and closer. No runtime call goes to any outside host.

Source: Overture Maps Foundation, theme buildings, type building (GeoParquet on the public bucket s3://overturemaps-us-west-2, no
account needed). Licence: ODbL 1.0 (the release is a derived database that includes OpenStreetMap); some features carry
CDLA-Permissive-2.0 sources. The credit "Buildings (c) Overture Maps Foundation" is printed by the server's status answer.

Method (no third-party tiling tool):
  1. DuckDB reads only the rows whose bounding box meets the requested box and writes, for every z14 tile a footprint touches, one row
     (tile, footprint WKB) ordered by tile id, to a local Parquet work file.
  2. Each z14 tile is cut from those rows: the footprints are moved to tile pixels (extent 4096, Web Mercator), clipped to the tile with
     a 64-pixel margin, oriented (outer ring clockwise in tile pixels, holes the other way, as the vector-tile spec 2.1 requires) and
     encoded as one layer "building" (Mapbox Vector Tile 2.1), gzip-compressed.
  3. The tiles are written as a PMTiles v3 archive (root directory plus leaf directories), read back with the server's own reader
     (server/api/pmtiles.mjs is not needed for that: this script re-reads the directories it wrote and checks every tile's bytes).
The archive holds zoom 14 only; the page draws from zoom 15, over-zooming the z14 data (about 0.6 m per tile pixel at z14).

usage: python scripts/gen/overture_buildings.py [--bbox w,s,e,n] [--release 2026-10-21.0] [--out data/basemap/pk-buildings.pmtiles]
                                                [--work <dir>] [--max-tiles N]
needs: Python 3.10+, duckdb (with its httpfs and spatial extensions, fetched by duckdb on first use), shapely 2, pyarrow, numpy."""
import argparse, gzip, io, json, math, os, struct, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ap = argparse.ArgumentParser()
ap.add_argument('--bbox', default='60.5,23.4,78.0,37.2', help='lon/lat box (default: Pakistan incl. AJK and Gilgit-Baltistan)')
ap.add_argument('--release', default='2026-10-21.0')
ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'basemap', 'pk-buildings.pmtiles'))
ap.add_argument('--work', default=None)
ap.add_argument('--max-tiles', type=int, default=0, help='stop after N tiles (test runs)')
A = ap.parse_args()
W, S, E, N = [float(x) for x in A.bbox.split(',')]
Z = 14; EXT = 4096; BUF = 64
OUT = os.path.abspath(A.out); WORK = os.path.abspath(A.work or (OUT + '.work')); os.makedirs(WORK, exist_ok=True); os.makedirs(os.path.dirname(OUT), exist_ok=True)
t0 = time.time()
def log(m): print('[%6.0f s] %s' % (time.time() - t0, m), flush=True)

import numpy as np
import pyarrow.parquet as pq
import shapely
from shapely import geometry as sg

# ---------- 1 · rows per tile, from the Overture release ----------
RAW = os.path.join(WORK, 'tiles_%s_%s.parquet' % (A.release, '_'.join('%g' % v for v in (W, S, E, N))))
if not os.path.exists(RAW):
    import duckdb
    c = duckdb.connect(); c.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    c.execute("CREATE OR REPLACE SECRET overture (TYPE s3, PROVIDER config, KEY_ID '', SECRET '', REGION 'us-west-2');")   # public bucket, no account
    src = 's3://overturemaps-us-west-2/release/%s/theme=buildings/type=building/*' % A.release
    n = 2 ** Z
    tx = lambda lon: 'CAST(floor((%s + 180.0) / 360.0 * %d) AS INTEGER)' % (lon, n)
    ty = lambda lat: 'CAST(floor((1.0 - ln(tan(radians(%s)) + 1.0 / cos(radians(%s))) / pi()) / 2.0 * %d) AS INTEGER)' % (lat, lat, n)
    log('reading release %s for box %s (the scan of the release index takes a few minutes)' % (A.release, A.bbox))
    c.execute("""COPY (
      WITH b AS (SELECT ST_AsWKB(geometry) AS g, bbox FROM read_parquet('%s', hive_partitioning=1)
                 WHERE bbox.xmin < %r AND bbox.xmax > %r AND bbox.ymin < %r AND bbox.ymax > %r AND NOT coalesce(is_underground, false)),
           t AS (SELECT g, %s AS x0, %s AS x1, %s AS y0, %s AS y1 FROM b)
      SELECT x, unnest(range(y0, y1 + 1)) AS y, g FROM (SELECT unnest(range(x0, x1 + 1)) AS x, y0, y1, g FROM t) ORDER BY y, x
    ) TO '%s' (FORMAT parquet, ROW_GROUP_SIZE 200000)""" % (src, E, W, N, S, tx('bbox.xmin'), tx('bbox.xmax'), ty('bbox.ymax'), ty('bbox.ymin'), RAW.replace("'", "''")))
    log('rows written: %s' % RAW)

# ---------- 2 · Mapbox Vector Tile 2.1 encoder (one polygon layer, no attributes) ----------
def varint(v):
    b = bytearray()
    while True:
        x = v & 0x7f; v >>= 7
        if v: b.append(x | 0x80)
        else: b.append(x); return bytes(b)
def zz(v): return (v << 1) ^ (v >> 31)
def field(num, wt, payload):
    if wt == 0: return varint((num << 3) | 0) + varint(payload)
    return varint((num << 3) | 2) + varint(len(payload)) + payload
def ring_cmds(coords, cur):
    pts = [(int(round(x)), int(round(y))) for x, y in coords[:-1]]
    q = []
    for p in pts:
        if not q or p != q[-1]: q.append(p)
    if len(q) < 3: return None, cur
    out = [(1 | (1 << 3)), zz(q[0][0] - cur[0]), zz(q[0][1] - cur[1])]; cur = q[0]
    out.append(2 | ((len(q) - 1) << 3))
    for p in q[1:]: out += [zz(p[0] - cur[0]), zz(p[1] - cur[1])]; cur = p
    out.append(7 | (1 << 3))
    return out, cur
def signed_area(coords):
    s = 0.0
    for (x1, y1), (x2, y2) in zip(coords[:-1], coords[1:]): s += x1 * y2 - x2 * y1
    return s / 2.0
def poly_geom(p, cur):
    cmds = []
    ext = list(p.exterior.coords)
    if signed_area(ext) < 0: ext = ext[::-1]           # outer ring: positive area in tile pixels (y down) = clockwise on screen
    c, cur = ring_cmds(ext, cur)
    if c is None: return [], cur
    cmds += c
    for h in p.interiors:
        hc = list(h.coords)
        if signed_area(hc) > 0: hc = hc[::-1]
        c, cur = ring_cmds(hc, cur)
        if c: cmds += c
    return cmds, cur
def encode_tile(geoms):
    feats = b''
    for g in geoms:
        parts = list(g.geoms) if g.geom_type in ('MultiPolygon', 'GeometryCollection') else [g]
        cmds, cur = [], (0, 0)
        for p in parts:
            if p.geom_type != 'Polygon' or p.is_empty: continue
            c, cur = poly_geom(p, cur); cmds += c
        if not cmds: continue
        packed = b''.join(varint(v) for v in cmds)
        feats += field(2, 2, field(3, 0, 3) + field(4, 2, packed))   # type POLYGON, geometry
    if not feats: return None
    layer = field(15, 0, 2) + field(1, 2, b'building') + feats + field(5, 0, EXT)
    return field(3, 2, layer)

# ---------- 3 · tile pixels, clipping ----------
def to_px(x, y):
    n = 2 ** Z
    def f(coords):
        lon, lat = coords[:, 0], np.clip(coords[:, 1], -85.0511, 85.0511)
        X = (lon + 180.0) / 360.0 * n * EXT
        r = np.radians(lat); Y = (1.0 - np.log(np.tan(r) + 1.0 / np.cos(r)) / math.pi) / 2.0 * n * EXT
        return np.column_stack([X - x * EXT, Y - y * EXT])
    return f
def zxy_to_id(z, x, y):
    acc = sum(4 ** t for t in range(z)); n = 2 ** z; d = 0; xx, yy = x, y; s = n // 2
    while s >= 1:
        rx = 1 if (xx & s) > 0 else 0; ry = 1 if (yy & s) > 0 else 0
        d += s * s * ((3 * rx) ^ ry)
        if ry == 0:
            if rx == 1: xx = s - 1 - xx; yy = s - 1 - yy
            xx, yy = yy, xx
        s //= 2
    return acc + d

DATA = os.path.join(WORK, 'tiles.bin'); entries = []; ntile = 0; nfeat = 0
with open(DATA, 'wb') as fd:
    pf = pq.ParquetFile(RAW); cur_key = None; buf = []
    def flush(key, wkbs):
        global ntile, nfeat
        x, y = key; gs = shapely.from_wkb(np.array(wkbs, dtype=object), on_invalid='ignore')
        gs = [g for g in gs if g is not None and not g.is_empty]
        if not gs: return
        f = to_px(x, y); px = [shapely.transform(g, f) for g in gs]
        cl = shapely.clip_by_rect(np.array(px, dtype=object), -BUF, -BUF, EXT + BUF, EXT + BUF)
        keep = [g for g in cl if g is not None and not g.is_empty and g.area >= 1.0]
        t = encode_tile(keep)
        if t is None: return
        b = gzip.compress(t, 6); off = fd.tell(); fd.write(b)
        entries.append((zxy_to_id(Z, x, y), off, len(b))); ntile += 1; nfeat += len(keep)
        if ntile % 2000 == 0: log('%d tiles, %d footprints' % (ntile, nfeat))
    stop = False
    for rg in range(pf.num_row_groups):
        tb = pf.read_row_group(rg, columns=['x', 'y', 'g'])
        X = tb.column('x').to_numpy(); Y = tb.column('y').to_numpy(); G = tb.column('g').to_pylist()
        for i in range(len(X)):
            k = (int(X[i]), int(Y[i]))
            if k != cur_key:
                if cur_key is not None: flush(cur_key, buf)
                cur_key, buf = k, []
                if A.max_tiles and ntile >= A.max_tiles: stop = True; break
            buf.append(G[i])
        if stop: break
    if cur_key is not None and not stop: flush(cur_key, buf)
log('%d tiles, %d footprints cut' % (ntile, nfeat))
if not entries: sys.exit('no building in the box: nothing written')

# ---------- 4 · PMTiles v3 (root + leaf directories), tile data in tile-id order ----------
entries.sort()
def ser_dir(es):
    b = bytearray(varint(len(es))); last = 0
    for e in es: b += varint(e[0] - last); last = e[0]
    for e in es: b += varint(e[3])                       # run length
    for e in es: b += varint(e[2])                       # length
    for e in es: b += varint(e[1] + 1)                   # offset + 1 (never the "contiguous" shortcut)
    return gzip.compress(bytes(b), 6)
# tile data rewritten in tile-id order (clustered)
TD = os.path.join(WORK, 'tiles.sorted.bin'); ordered = []
with open(DATA, 'rb') as fi, open(TD, 'wb') as fo:
    for tid, off, ln in entries:
        fi.seek(off); b = fi.read(ln); ordered.append((tid, fo.tell(), ln, 1)); fo.write(b)
root_es = ordered; leaves = b''
if len(ser_dir(ordered)) > 16384 - 127 - 2048:
    size = 4096
    while True:
        root_es, lb = [], bytearray()
        for i in range(0, len(ordered), size):
            chunk = ordered[i:i + size]; d = ser_dir(chunk); root_es.append((chunk[0][0], len(lb), len(d), 0)); lb += d
        if len(ser_dir(root_es)) <= 16384 - 127 - 2048: leaves = bytes(lb); break
        size *= 2
root = ser_dir(root_es)
meta = json.dumps({'name': 'NIGRAAN buildings (Overture)', 'format': 'pbf', 'overture_release': A.release, 'bbox': [W, S, E, N],
                   'attribution': 'Buildings (c) Overture Maps Foundation', 'license': 'ODbL-1.0 (includes OpenStreetMap); some sources CDLA-Permissive-2.0',
                   'vector_layers': [{'id': 'building', 'fields': {}, 'minzoom': Z, 'maxzoom': Z}], 'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}).encode()
meta = gzip.compress(meta, 6)
td_len = os.path.getsize(TD)
o_root = 127; o_meta = o_root + len(root); o_leaf = o_meta + len(meta); o_data = o_leaf + len(leaves)
e7 = lambda v: int(round(v * 1e7))
hdr = b'PMTiles' + bytes([3]) + struct.pack('<QQQQQQQQQQQ', o_root, len(root), o_meta, len(meta), o_leaf, len(leaves), o_data, td_len,
                                             len(ordered), len(ordered), len(ordered))
hdr += bytes([1, 2, 2, 1, Z, Z]) + struct.pack('<iiii', e7(W), e7(S), e7(E), e7(N)) + bytes([Z]) + struct.pack('<ii', e7((W + E) / 2), e7((S + N) / 2))
assert len(hdr) == 127, len(hdr)
TMP = OUT + '.tmp'
with open(TMP, 'wb') as fo:
    fo.write(hdr); fo.write(root); fo.write(meta); fo.write(leaves)
    with open(TD, 'rb') as fi:
        while True:
            b = fi.read(1 << 22)
            if not b: break
            fo.write(b)
# ---------- 5 · read-back: every tile through the directories just written ----------
def rd_dir(b):
    b = gzip.decompress(b); p = [0]
    def rv():
        v = 0; s = 0
        while True:
            x = b[p[0]]; p[0] += 1; v |= (x & 0x7f) << s; s += 7
            if not x & 0x80: return v
    n = rv(); ids = []; last = 0
    for _ in range(n): last += rv(); ids.append(last)
    rl = [rv() for _ in range(n)]; ln = [rv() for _ in range(n)]; of = [rv() - 1 for _ in range(n)]
    return list(zip(ids, rl, ln, of))
bad = 0; checked = 0
with open(TMP, 'rb') as f:
    h = f.read(127); r_off, r_len, m_off, m_len, l_off, l_len, d_off = struct.unpack('<QQQQQQQ', h[8:64])
    f.seek(r_off); R = rd_dir(f.read(r_len)); got = []
    for tid, rl, ln, of in R:
        if rl == 0: f.seek(l_off + of); got += [e for e in rd_dir(f.read(ln))]
        else: got.append((tid, rl, ln, of))
    want = {e[0]: e for e in ordered}
    with open(TD, 'rb') as fd2:
        for tid, rl, ln, of in got:
            e = want.get(tid); checked += 1
            if not e or e[2] != ln: bad += 1; continue
            f.seek(d_off + of); a = f.read(ln); fd2.seek(e[1]); bb = fd2.read(ln)
            if a != bb: bad += 1
    if checked != len(ordered): bad += abs(len(ordered) - checked)
if bad: sys.exit('read-back FAILED: %d of %d tiles differ; %s kept for inspection, %s not replaced' % (bad, len(ordered), TMP, OUT))
os.replace(TMP, OUT)
for f in (DATA, TD):
    try: os.remove(f)
    except OSError: pass
log('written %s: %d tiles, %d footprints, %.1f MB; read-back %d tiles identical; the server picks it up within a minute' % (OUT, len(ordered), nfeat, os.path.getsize(OUT) / 1e6, checked))
