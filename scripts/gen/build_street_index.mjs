/* v91.17.116 · OFFLINE STREET / PLACE SEARCH INDEX from the local street map (data/basemap/pk-streets.pmtiles, OpenStreetMap, ODbL).
   Reads every zoom-14 tile, keeps named roads, points of interest, neighbourhoods/places and named water, one entry per name and kind per
   ~1 km cell (the first point of the feature), English and local-script names both. Output data/geo/street-index.json:
     { built, source, licence, n, kinds:[...], rows:[[name, kindIdx, lat, lon, nameLocal?], ...] }
   node scripts/gen/build_street_index.mjs [archive] */
import { openPmtiles } from '../../server/api/pmtiles.mjs';
import { gunzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = process.argv[2] || join(ROOT, 'data', 'basemap', 'pk-streets.pmtiles');
const P = openPmtiles(FILE); if (!P) { console.error('no archive at ' + FILE); process.exit(1); }

/* minimal protobuf reader */
function R(b) { this.b = b; this.p = 0; }
R.prototype.v = function () { let r = 0, s = 1, x; do { x = this.b[this.p++]; r += (x & 0x7f) * s; s *= 128; } while (x & 0x80); return r; };
R.prototype.bytes = function () { const n = this.v(); const o = this.b.subarray(this.p, this.p + n); this.p += n; return o; };
R.prototype.skip = function (w) { if (w === 0) this.v(); else if (w === 1) this.p += 8; else if (w === 2) this.p += this.v(); else if (w === 5) this.p += 4; };
const dec = new TextDecoder();
function value(b) { const r = new R(b); let out = null; while (r.p < b.length) { const t = r.v(), f = t >> 3, w = t & 7;
  if (f === 1 && w === 2) out = dec.decode(r.bytes()); else if (f === 4 || f === 5) out = r.v(); else if (f === 6) { const z = r.v(); out = (z >>> 1) ^ -(z & 1); } else if (f === 7) out = !!r.v(); else if (f === 2) { out = r.b.readFloatLE ? Buffer.from(r.b.buffer, r.b.byteOffset + r.p, 4).readFloatLE(0) : null; r.p += 4; } else if (f === 3) { out = Buffer.from(r.b.buffer, r.b.byteOffset + r.p, 8).readDoubleLE(0); r.p += 8; } else r.skip(w); }
  return out; }
const WANT = new Set(['roads', 'pois', 'places', 'water']);
function layer(b, z, x, y, emit) {
  const r = new R(b); let name = null; const feats = [], keys = [], vals = []; let extent = 4096;
  while (r.p < b.length) { const t = r.v(), f = t >> 3, w = t & 7;
    if (f === 1) name = dec.decode(r.bytes()); else if (f === 2) feats.push(r.bytes()); else if (f === 3) keys.push(dec.decode(r.bytes())); else if (f === 4) vals.push(value(r.bytes())); else if (f === 5) extent = r.v(); else r.skip(w); }
  if (!WANT.has(name)) return;
  const n = Math.pow(2, z);
  for (const fb of feats) { const q = new R(fb); let tags = null, geom = null;
    while (q.p < fb.length) { const t = q.v(), f = t >> 3, w = t & 7; if (f === 2) tags = q.bytes(); else if (f === 4) geom = q.bytes(); else q.skip(w); }
    if (!tags || !geom) continue; const tr = new R(tags); const props = {}; while (tr.p < tags.length) { const k = tr.v(), v = tr.v(); props[keys[k]] = vals[v]; }
    const nm = props['name:en'] || props.name; if (!nm || typeof nm !== 'string') continue;
    const g = new R(geom); const cmd = g.v(); if ((cmd & 7) !== 1) continue; const dx = g.v(), dy = g.v(); const px = (dx >>> 1) ^ -(dx & 1), py = (dy >>> 1) ^ -(dy & 1);
    const lon = (x + px / extent) / n * 360 - 180; const yy = (y + py / extent) / n; const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * yy))) * 180 / Math.PI;
    emit(name, props, nm, props.name && props.name !== nm ? props.name : null, lat, lon); }
}
/* traverse every tile at the archive's max zoom */
const H = P.header; const zMax = H.maxZoom;
const base = (z) => { let a = 0; for (let t = 0; t < z; t++) a += Math.pow(4, t); return a; };
const lo = base(zMax), hi = base(zMax + 1);
function idToXY(z, d) { const n = Math.pow(2, z); let x = 0, y = 0, t = d; for (let s = 1; s < n; s *= 2) { const rx = 1 & (t / 2), ry = 1 & (t ^ rx); if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const tmp = x; x = y; y = tmp; } x += s * rx; y += s * ry; t = Math.floor(t / 4); } return [x, y]; }
/* walk the directory tree; leaves hold runs of tile ids */
import { readSync, openSync } from 'node:fs';
const fd = openSync(FILE, 'r'); const read = (o, l) => { const b = Buffer.alloc(l); readSync(fd, b, 0, l, o); return b; };
function parseDir(buf) { const p = { i: 0 }; const rv = () => { let v = 0, s = 1, x; do { x = buf[p.i++]; v += (x & 0x7f) * s; s *= 128; } while (x & 0x80); return v; };
  const n = rv(); const E = []; let last = 0; for (let k = 0; k < n; k++) { last += rv(); E.push({ id: last }); } for (const e of E) e.rl = rv(); for (const e of E) e.len = rv();
  for (let k = 0; k < n; k++) { const v = rv(); E[k].off = (v === 0 && k > 0) ? E[k - 1].off + E[k - 1].len : v - 1; } return E; }
const seen = new Map(); const KINDS = []; const kIdx = (k) => { let i = KINDS.indexOf(k); if (i < 0) { KINDS.push(k); i = KINDS.length - 1; } return i; };
let tiles = 0;
function visit(E) { for (const e of E) {
  if (e.rl === 0) { visit(parseDir(gunzipSync(read(H.leafOff + e.off, e.len)))); continue; }
  if (e.id + e.rl <= lo || e.id >= hi) continue;
  const data = read(H.dataOff + e.off, e.len); const tb = P.tileEncoding === 'gzip' ? gunzipSync(data) : data;
  for (let k = 0; k < e.rl; k++) { const id = e.id + k; if (id < lo || id >= hi) continue; const [x, y] = idToXY(zMax, id - lo); tiles++;
    const r = new R(tb); while (r.p < tb.length) { const t = r.v(), f = t >> 3, w = t & 7; if (f === 3) layer(r.bytes(), zMax, x, y, (L, props, nm, local, lat, lon) => {
      const kind = L === 'roads' ? 'road' : L === 'water' ? 'water' : (props.kind || L); const key = nm.toLowerCase() + '|' + kind + '|' + Math.round(lat * 100) + '|' + Math.round(lon * 100);
      if (!seen.has(key)) seen.set(key, [nm, kIdx(kind), Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5].concat(local ? [local] : [])); }); else r.skip(w); } }
  if (tiles % 50000 < e.rl) console.log('  tiles', tiles, 'entries', seen.size);
} }
visit(parseDir(gunzipSync(read(H.rootOff, H.rootLen))));
const rows = [...seen.values()];
mkdirSync(join(ROOT, 'data', 'geo'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'geo', 'street-index.json'), JSON.stringify({ built: new Date().toISOString(), source: 'OpenStreetMap via the local street map (' + (P.meta['planetiler:buildtime'] || '') + ')', licence: 'ODbL 1.0, © OpenStreetMap contributors', zoom: zMax, tiles, n: rows.length, kinds: KINDS, rows }));
console.log('done', tiles, 'tiles', rows.length, 'entries');
