/* v91.17.116 · A DEPENDENCY-FREE PMTiles v3 READER ═══════════════════════════════════════════════════════════════════════
   Serves vector tiles straight out of one local archive file (data/basemap/pk-streets.pmtiles: the Pakistan extract of the
   Protomaps basemap, OpenStreetMap data, ODbL). No tile server, no third-party host, works offline.
   Spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md (header 127 bytes; directories are varint-encoded and
   gzip-compressed; tile ids run along a Hilbert curve per zoom). */
import { openSync, readSync, fstatSync, existsSync, closeSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

function u64(b, o) { return Number(b.readBigUInt64LE(o)); }
function readVarint(b, p) { let v = 0, s = 1, x; do { x = b[p.i++]; v += (x & 0x7f) * s; s *= 128; } while (x & 0x80); return v; }

/* (z, x, y) -> tile id: the count of tiles on lower zooms plus the Hilbert index on this zoom */
export function zxyToTileId(z, x, y) {
  let acc = 0; for (let t = 0; t < z; t++) acc += Math.pow(4, t);
  const n = Math.pow(2, z); let rx, ry, d = 0, xx = x, yy = y;
  for (let s = n / 2; s >= 1; s /= 2) {
    rx = (xx & s) > 0 ? 1 : 0; ry = (yy & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) { if (rx === 1) { xx = s - 1 - xx; yy = s - 1 - yy; } const t = xx; xx = yy; yy = t; }
  }
  return acc + d;
}

function parseDirectory(buf) {
  const p = { i: 0 }; const n = readVarint(buf, p); const E = new Array(n);
  let last = 0;
  for (let k = 0; k < n; k++) { last += readVarint(buf, p); E[k] = { tileId: last, runLength: 0, length: 0, offset: 0 }; }
  for (let k = 0; k < n; k++) E[k].runLength = readVarint(buf, p);
  for (let k = 0; k < n; k++) E[k].length = readVarint(buf, p);
  for (let k = 0; k < n; k++) { const v = readVarint(buf, p); E[k].offset = (v === 0 && k > 0) ? E[k - 1].offset + E[k - 1].length : v - 1; }
  return E;
}
function findEntry(E, id) {
  let lo = 0, hi = E.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; const c = id - E[m].tileId; if (c > 0) lo = m + 1; else if (c < 0) hi = m - 1; else return E[m]; }
  if (hi >= 0) { const e = E[hi]; if (e.runLength === 0) return e; if (id - e.tileId < e.runLength) return e; }
  return null;
}

export function openPmtiles(file) {
  if (!existsSync(file)) return null;
  const fd = openSync(file, 'r'); const size = fstatSync(fd).size;
  const read = (off, len) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, off); return b; };
  const h = read(0, 127);
  if (h.toString('latin1', 0, 7) !== 'PMTiles' || h[7] !== 3) { closeSync(fd); throw new Error('not a PMTiles v3 archive'); }
  const H = { rootOff: u64(h, 8), rootLen: u64(h, 16), metaOff: u64(h, 24), metaLen: u64(h, 32), leafOff: u64(h, 40), leafLen: u64(h, 48),
    dataOff: u64(h, 56), dataLen: u64(h, 64), addressed: u64(h, 72), entries: u64(h, 80), contents: u64(h, 88),
    clustered: h[96], internalCompression: h[97], tileCompression: h[98], tileType: h[99], minZoom: h[100], maxZoom: h[101],
    bounds: [h.readInt32LE(102) / 1e7, h.readInt32LE(106) / 1e7, h.readInt32LE(110) / 1e7, h.readInt32LE(114) / 1e7] };
  const unz = (b) => H.internalCompression === 2 ? gunzipSync(b) : b;   /* 2 = gzip */
  const root = parseDirectory(unz(read(H.rootOff, H.rootLen)));
  let meta = {}; try { meta = JSON.parse(unz(read(H.metaOff, H.metaLen)).toString('utf8')); } catch (_) {}
  const leafCache = new Map();
  function leaf(off, len) { const k = off + ':' + len; let d = leafCache.get(k); if (d) { leafCache.delete(k); leafCache.set(k, d); return d; }
    d = parseDirectory(unz(read(H.leafOff + off, len))); leafCache.set(k, d); if (leafCache.size > 256) leafCache.delete(leafCache.keys().next().value); return d; }
  function tile(z, x, y) {
    if (z < H.minZoom || z > H.maxZoom) return null; const n = Math.pow(2, z); if (x < 0 || y < 0 || x >= n || y >= n) return null;
    const id = zxyToTileId(z, x, y); let dir = root;
    for (let depth = 0; depth < 4; depth++) {
      const e = findEntry(dir, id); if (!e) return null;
      if (e.runLength > 0) return read(H.dataOff + e.offset, e.length);
      dir = leaf(e.offset, e.length);
    }
    return null;
  }
  return { header: H, meta, size, tile, close: () => closeSync(fd),
    tileType: ['unknown', 'mvt', 'png', 'jpeg', 'webp', 'avif'][H.tileType] || 'unknown',
    tileEncoding: H.tileCompression === 2 ? 'gzip' : null };
}
