/* v91.17.281 GEO281 · NAMED-AREA INDEX for the reverse place name ("which named area CONTAINS this point").
   Source: the local street map (data/basemap/pk-streets.pmtiles = Protomaps basemap build of OpenStreetMap, ODbL). Nothing is typed in.

   WHY. /api/geo/reverse named a point after the nearest place POINT (a sector centroid within 1.2 km, else a settlement within 1.5 km).
   Near a sector edge the nearest centroid is the neighbour: 33.680860, 72.992720 is inside OSM's F-11/1 polygon but 1.15 km from the
   G-11 point and 1.45 km from the F-11 point, so it was called "G-11, Islamabad".

   HOW THE POLYGONS GET THEIR NAMES. The Protomaps schema keeps an area's geometry in the `landuse` layer WITHOUT a name and puts the
   area's name on a label point in `pois` (or `places`) carrying THE SAME FEATURE ID (OSM way id + 2^45, relation id + 2^46). The two are
   joined by id here. Measured on the Islamabad extract: 790 residential polygon pieces at z15 join a named residential label this way.
   Only settlement-type areas are kept (label kind residential / administrative / neighbourhood / suburb / quarter / village / hamlet /
   town / city / locality on a residential or settlement landuse polygon). Facilities — commercial, retail, industrial, military,
   parks, schools — are not "where a place is": measured, they named points "Consulate General of Iran", "Brickworks",
   "Civic Commercial Area Sector T DHA Phase 2" instead of the locality around them.

   NAME. name:en when the label carries one; else the label's own name when it is Latin script; else the English name OSM gives the same
   local-script name in the offline place index (data/pk-places-osm.tsv.gz alternate names); else the local-script name as is.

   OUTPUT data/place-areas/pk-place-areas.json.gz:
     { built, source, licence, z, extent, kinds:[...], areas:[[name, kindIdx, areaM2, labelLat, labelLon, localName|null], ...],
       tiles: { "x/y": [areaIdx, nRings, nPts, x0, y0, dx, dy, ..., nPts, ..., areaIdx, nRings, ...] } }   (tile-local MVT coordinates)
   usage: node scripts/gen/build_place_areas.mjs [archive.pmtiles ...] [--out file]
          (default archive data/basemap/pk-streets.pmtiles; several archives may be given, the first one holding a tile wins) */
import { openSync, readSync, writeFileSync, mkdirSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPmtiles } from '../../server/api/pmtiles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2); const oi = argv.indexOf('--out');
const OUT = resolve(oi >= 0 ? argv[oi + 1] : join(ROOT, 'data', 'place-areas', 'pk-place-areas.json.gz'));
const FILES = argv.filter((a, i) => oi < 0 || (i !== oi && i !== oi + 1));
if (!FILES.length) FILES.push(join(ROOT, 'data', 'basemap', 'pk-streets.pmtiles'));
const t0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)} s] ${m}`);

/* ── minimal MVT decoder (spec 2.1): layers, feature id, tags, geometry ── */
const dec = new TextDecoder();
function R(b) { this.b = b; this.p = 0; }
R.prototype.v = function () { let r = 0, s = 1, x; do { x = this.b[this.p++]; r += (x & 0x7f) * s; s *= 128; } while (x & 0x80); return r; };
R.prototype.bytes = function () { const n = this.v(); const o = this.b.subarray(this.p, this.p + n); this.p += n; return o; };
R.prototype.skip = function (w) { if (w === 0) this.v(); else if (w === 1) this.p += 8; else if (w === 2) this.p += this.v(); else if (w === 5) this.p += 4; };
function value(b) { const r = new R(b); let out = null; while (r.p < b.length) { const t = r.v(), f = t >> 3, w = t & 7;
  if (f === 1) out = dec.decode(r.bytes()); else if (f === 2) { out = Buffer.from(b.buffer, b.byteOffset + r.p, 4).readFloatLE(0); r.p += 4; }
  else if (f === 3) { out = Buffer.from(b.buffer, b.byteOffset + r.p, 8).readDoubleLE(0); r.p += 8; }
  else if (f === 4 || f === 5) out = r.v(); else if (f === 6) { const z = r.v(); out = (z >>> 1) ^ -(z & 1); } else if (f === 7) out = !!r.v(); else r.skip(w); }
  return out; }
function geometry(g) { const r = new R(g); const parts = []; let cur = null, x = 0, y = 0;
  while (r.p < g.length) { const c = r.v(); const id = c & 7, cnt = c >> 3;
    if (id === 1 || id === 2) for (let k = 0; k < cnt; k++) { const dx = r.v(), dy = r.v(); x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
      if (id === 1) { cur = [x, y]; parts.push(cur); } else cur.push(x, y); } }
  return parts; }   /* rings as flat [x0,y0,x1,y1,...]; MVT rings are implicitly closed */
export function decodeTile(buf, want) { const r = new R(buf); const out = {};
  while (r.p < buf.length) { const t = r.v(), f = t >> 3, w = t & 7; if (f !== 3) { r.skip(w); continue; }
    const lb = r.bytes(); const L = new R(lb); let name = null; const feats = [], keys = [], vals = []; let extent = 4096;
    while (L.p < lb.length) { const t2 = L.v(), f2 = t2 >> 3, w2 = t2 & 7;
      if (f2 === 1) name = dec.decode(L.bytes()); else if (f2 === 2) feats.push(L.bytes()); else if (f2 === 3) keys.push(dec.decode(L.bytes())); else if (f2 === 4) vals.push(value(L.bytes())); else if (f2 === 5) extent = L.v(); else L.skip(w2); }
    if (want && !want.has(name)) continue;
    const arr = out[name] = [];
    for (const fb of feats) { const q = new R(fb); let tags = null, g = null, type = 0, id = 0;
      while (q.p < fb.length) { const t3 = q.v(), f3 = t3 >> 3, w3 = t3 & 7; if (f3 === 1) id = q.v(); else if (f3 === 2) tags = q.bytes(); else if (f3 === 3) type = q.v(); else if (f3 === 4) g = q.bytes(); else q.skip(w3); }
      const props = {}; if (tags) { const tr = new R(tags); while (tr.p < tags.length) { const k = tr.v(), v = tr.v(); props[keys[k]] = vals[v]; } }
      arr.push({ id, type, props, extent, rings: g ? geometry(g) : [] }); } }
  return out; }

/* which areas name a place */
export const LABEL_KINDS = new Set(['residential', 'administrative', 'neighbourhood', 'suburb', 'quarter', 'village', 'hamlet', 'town', 'city', 'locality', 'isolated_dwelling']);
export const AREA_KINDS = new Set(['residential', 'other', 'neighbourhood', 'suburb', 'quarter', 'village', 'hamlet', 'town', 'city', 'locality']);
/* a name is a name: at least two letters (OSM carries stray labels such as "s") */
export const NAMEOK = (n) => (String(n).match(/\p{L}/gu) || []).length >= 2;
const LATIN = /^[\x00-\x7FÀ-ɏ‘’“”–—]+$/;

/* English names for local-script names, from the offline OSM place index (column 3 = alternate names) */
function altMap() { const m = new Map(); const f = join(ROOT, 'data', 'pk-places-osm.tsv.gz'); if (!existsSync(f)) return m;
  for (const line of gunzipSync(readFileSync(f)).toString('utf8').split('\n')) { const c = line.split('\t'); if (c.length < 3 || !c[2]) continue;
    if (!LATIN.test(c[0])) continue; for (const a of c[2].split(',')) { const k = a.trim(); if (k && !LATIN.test(k) && !m.has(k)) m.set(k, c[0]); } }
  return m; }

function* tilesAt(file) {   /* every tile of the archive's max zoom: [z, x, y, buffer] */
  const P = openPmtiles(file); const H = P.header; const z = H.maxZoom;
  const fd = openSync(file, 'r'); const read = (o, l) => { const b = Buffer.alloc(l); readSync(fd, b, 0, l, o); return b; };
  const unz = (b) => H.internalCompression === 2 ? gunzipSync(b) : b;
  const base = (zz) => { let a = 0; for (let t = 0; t < zz; t++) a += Math.pow(4, t); return a; }; const lo = base(z), hi = base(z + 1);
  function idToXY(zz, d) { const n = Math.pow(2, zz); let x = 0, y = 0, t = d; for (let s = 1; s < n; s *= 2) { const rx = 1 & (t / 2), ry = 1 & (t ^ rx); if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const tmp = x; x = y; y = tmp; } x += s * rx; y += s * ry; t = Math.floor(t / 4); } return [x, y]; }
  function parseDir(buf) { const p = { i: 0 }; const rv = () => { let v = 0, s = 1, x; do { x = buf[p.i++]; v += (x & 0x7f) * s; s *= 128; } while (x & 0x80); return v; };
    const n = rv(); const E = []; let last = 0; for (let k = 0; k < n; k++) { last += rv(); E.push({ id: last }); } for (const e of E) e.rl = rv(); for (const e of E) e.len = rv();
    for (let k = 0; k < n; k++) { const v = rv(); E[k].off = (v === 0 && k > 0) ? E[k - 1].off + E[k - 1].len : v - 1; } return E; }
  const stack = [parseDir(unz(read(H.rootOff, H.rootLen)))];
  while (stack.length) { const E = stack.pop();
    for (const e of E) {
      if (e.rl === 0) { stack.push(parseDir(unz(read(H.leafOff + e.off, e.len)))); continue; }
      if (e.id + e.rl <= lo || e.id >= hi) continue;
      let data = read(H.dataOff + e.off, e.len); if (P.tileEncoding === 'gzip') data = gunzipSync(data);
      for (let k = 0; k < e.rl; k++) { const id = e.id + k; if (id < lo || id >= hi) continue; const [x, y] = idToXY(z, id - lo); yield [z, x, y, data]; } } }
  P.close();
}

const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i += 2) { const j = (i + 2) % n; a += r[i] * r[j + 1] - r[j] * r[i + 1]; } return a / 2; };

function main() {
  const ALT = altMap(); log('alternate-name map: ' + ALT.size + ' local-script names with an English form');
  const labels = new Map();   /* id -> { kind, en, local, lat, lon } */
  const polys = new Map();    /* "x/y" -> [{ id, kind, rings }] ; settlement-kind landuse pieces, any id */
  const areaPx = new Map();   /* id -> summed area (m2) */
  let Z = null, tiles = 0; const seenTile = new Set(); const sources = [];
  for (const file of FILES) {
    const P = openPmtiles(file); if (!P) { console.error('no archive at ' + file); process.exit(1); }
    sources.push({ file: file.split(/[\\/]/).pop(), build: P.meta['planetiler:buildtime'] || P.meta.version || null, bounds: P.header.bounds, maxZoom: P.header.maxZoom }); P.close();
    for (const [z, x, y, buf] of tilesAt(file)) {
      if (Z == null) Z = z; if (z !== Z) { console.error('archives differ in max zoom'); process.exit(1); }
      const key = x + '/' + y; if (seenTile.has(key)) continue; seenTile.add(key); tiles++;
      const L = decodeTile(buf, new Set(['landuse', 'pois', 'places'])); const n = 2 ** z;
      for (const ln of ['pois', 'places']) for (const f of (L[ln] || [])) {
        if (f.type !== 1 || !f.id || !f.props.name || !LABEL_KINDS.has(f.props.kind) || !NAMEOK(f.props.name)) continue;
        const cur = labels.get(f.id); const en = f.props['name:en'] || (LATIN.test(f.props.name) ? f.props.name : null);
        if (cur && (cur.en || !en)) continue;
        const px = f.rings[0][0] / f.extent, py = f.rings[0][1] / f.extent;
        const lon = (x + px) / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + py) / n))) * 180 / Math.PI;
        labels.set(f.id, { kind: f.props.kind, en, local: LATIN.test(f.props.name) ? null : f.props.name, lat, lon });
      }
      const latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n))) * 180 / Math.PI;
      const mPerUnit = 40075016.686 * Math.cos(latC * Math.PI / 180) / n / 4096;
      for (const f of (L.landuse || [])) {
        if (f.type !== 3 || !f.id || !AREA_KINDS.has(f.props.kind)) continue;
        let a = polys.get(key); if (!a) { a = []; polys.set(key, a); }
        const rings = f.extent === 4096 ? f.rings : f.rings.map((r) => r.map((v) => Math.round(v * 4096 / f.extent)));
        a.push({ id: f.id, kind: f.props.kind, rings });
        /* area inside the tile proper (the buffer would count twice across tiles): clip-free approximation, signed ring sum */
        let s = 0; for (const r of rings) s += ringArea(r); areaPx.set(f.id, (areaPx.get(f.id) || 0) + Math.abs(s) * mPerUnit * mPerUnit);
      }
      if (tiles % 50000 === 0) log(`  tiles ${tiles}, labels ${labels.size}, polygon tiles ${polys.size}`);
    }
  }
  log(`read ${tiles} tiles at z${Z}; ${labels.size} named settlement labels`);
  /* join */
  const kinds = [], kIdx = (k) => { let i = kinds.indexOf(k); if (i < 0) i = kinds.push(k) - 1; return i; };
  const areas = [], aIdx = new Map(); let pieces = 0, verts = 0, viaAlt = 0, localOnly = 0;
  const out = {};
  for (const [key, arr] of polys) {
    const flat = [];
    for (const p of arr) {
      const lb = labels.get(p.id); if (!lb) continue;
      let ai = aIdx.get(p.id);
      if (ai == null) {
        let name = lb.en; if (!name && lb.local && ALT.has(lb.local)) { name = ALT.get(lb.local); viaAlt++; } if (!name) { name = lb.local; localOnly++; }
        ai = areas.push([name, kIdx(lb.kind), Math.round(areaPx.get(p.id) || 0), Math.round(lb.lat * 1e5) / 1e5, Math.round(lb.lon * 1e5) / 1e5, lb.local || null]) - 1; aIdx.set(p.id, ai);
      }
      flat.push(ai, p.rings.length);
      for (const r of p.rings) { const m = r.length / 2; flat.push(m, r[0], r[1]); for (let i = 2; i < r.length; i += 2) flat.push(r[i] - r[i - 2], r[i + 1] - r[i - 1]); verts += m; }
      pieces++;
    }
    if (flat.length) out[key] = flat;
  }
  const doc = { built: new Date().toISOString(), source: 'OpenStreetMap (Protomaps basemap build) via the local street map: ' + sources.map((s) => s.file + (s.build ? ' (' + s.build + ')' : '')).join(', '),
    licence: 'ODbL 1.0, © OpenStreetMap contributors', method: 'landuse polygon joined to its named label point by feature id (Protomaps schema); settlement kinds only',
    z: Z, extent: 4096, sources, kinds, areas, tiles: out };
  mkdirSync(dirname(OUT), { recursive: true });
  const body = gzipSync(Buffer.from(JSON.stringify(doc))); writeFileSync(OUT + '.tmp', body); renameSync(OUT + '.tmp', OUT);
  log(`wrote ${OUT}: ${areas.length} named areas, ${pieces} pieces, ${verts} vertices in ${Object.keys(out).length} tiles, ${(body.length / 1e6).toFixed(2)} MB gz; English name via alternate-name map ${viaAlt}, local script only ${localOnly}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
