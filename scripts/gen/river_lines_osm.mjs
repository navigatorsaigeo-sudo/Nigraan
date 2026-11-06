/* v91.17.282 · VER282 · the named river lines of OpenStreetMap (waterway=river) as the street map carries them, for build_rivers.py.
   Source: a Protomaps basemap archive (OpenStreetMap data, ODbL; Protomaps basemap schema), the same build the street map is cut from
   (scripts/gen/extract_streets.mjs). Layer "water", line features with kind "river" (Protomaps keeps waterway=river lines from z9),
   read at ONE zoom (default 10, about 10 m per tile unit) over the Pakistan box. Each line is clipped to its own tile square (vector
   tiles repeat a buffer of the neighbour tile; clipping removes the overlap so the pieces of one way meet end to end at the tile edge).
   Output {zoom, source, built, lines: {name: [[[lon,lat],...], ...]}}; the name is the OSM name (name:en when present), '' = unnamed river
   lines (build_rivers.py uses them only to close a gap in a named river).
   Node built-ins only. usage: node scripts/gen/river_lines_osm.mjs <archive.pmtiles> <out.json> [zoom]   */
import { gunzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { openPmtiles } = await import(pathToFileURL(resolve(ROOT, 'server', 'api', 'pmtiles.mjs')).href);
const [file, out] = [process.argv[2], process.argv[3]]; const Z = Number(process.argv[4] || 10);
if (!file || !out) { console.error('usage: node scripts/gen/river_lines_osm.mjs <archive.pmtiles> <out.json> [zoom]'); process.exit(2); }

/* ---- protobuf / MVT (spec 2.1) ---- */
function fields(b) { let p = 0; const vi = () => { let v = 0, s = 1, x; do { x = b[p++]; v += (x & 0x7f) * s; s *= 128; } while (x & 0x80); return v; };
  const m = []; while (p < b.length) { const k = vi(), f = Math.floor(k / 8), t = k & 7; let v;
    if (t === 0) v = vi(); else if (t === 2) { const l = vi(); v = b.subarray(p, p + l); p += l; } else if (t === 1) { v = b.readDoubleLE(p); p += 8; } else if (t === 5) { v = b.readFloatLE(p); p += 4; } else throw new Error('wire type ' + t);
    m.push([f, t, v]); } return m; }
function packed(b) { const o = []; let p = 0; while (p < b.length) { let v = 0, s = 1, x; do { x = b[p++]; v += (x & 0x7f) * s; s *= 128; } while (x & 0x80); o.push(v); } return o; }
const zz = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);
function value(b) { for (const [h, , v] of fields(b)) { if (h === 1) return v.toString(); if (h === 2 || h === 3) return v; if (h === 4 || h === 5) return v; if (h === 6) return zz(v); if (h === 7) return !!v; } return null; }
function layers(buf) { const L = {};
  for (const [f, , lb] of fields(buf)) { if (f !== 3) continue; let name, ext = 4096; const keys = [], vals = [], feats = [];
    for (const [g, , v] of fields(lb)) { if (g === 1) name = v.toString(); else if (g === 3) keys.push(v.toString()); else if (g === 4) vals.push(value(v)); else if (g === 5) ext = v; else if (g === 2) feats.push(v); }
    L[name] = { ext, feats: feats.map((fb) => { let tags = [], type = 0, geom = []; for (const [g, , v] of fields(fb)) { if (g === 2) tags = packed(v); else if (g === 3) type = v; else if (g === 4) geom = packed(v); }
      const props = {}; for (let i = 0; i < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]]; return { props, type, geom }; }) }; }
  return L; }
function lineParts(geom) { const o = []; let x = 0, y = 0, cur = null, i = 0;
  while (i < geom.length) { const c = geom[i++], id = c & 7, n = c >> 3; if (id === 7) continue;
    for (let k = 0; k < n; k++) { x += zz(geom[i++]); y += zz(geom[i++]); if (id === 1) { cur = [[x, y]]; o.push(cur); } else cur.push([x, y]); } }
  return o; }
/* clip a polyline to the square [0, e] x [0, e] (Liang-Barsky per segment); returns the pieces inside */
function clip(P, e) { const out = []; let cur = null;
  for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], dx = x1 - x0, dy = y1 - y0; let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, x0], [dx, e - x0], [-dy, y0], [dy, e - y0]]) { if (p === 0) { if (q < 0) { ok = false; break; } continue; } const r = q / p; if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
    if (!ok) { cur = null; continue; }
    const a = [x0 + t0 * dx, y0 + t0 * dy], b = [x0 + t1 * dx, y0 + t1 * dy];
    if (!cur || t0 > 0) { cur = [a]; out.push(cur); }
    cur.push(b); if (t1 < 1) cur = null; }
  return out.filter((l) => l.length > 1); }

const P = openPmtiles(resolve(file)); if (!P) throw new Error('archive not found: ' + file);
const [W, S, E, N] = [60.5, 23.4, 78.0, 37.2]; const n2 = 2 ** Z;
const tx = (lon) => Math.floor((lon + 180) / 360 * n2), ty = (lat) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n2); };
const lines = {}; let tiles = 0, feats = 0;
for (let x = tx(W); x <= tx(E); x++) for (let y = ty(N); y <= ty(S); y++) {
  let b = P.tile(Z, x, y); if (!b) continue; if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b); tiles++;
  const wl = layers(b).water; if (!wl) continue;
  for (const f of wl.feats) { if (f.type !== 2 || f.props.kind !== 'river') continue; const nm = f.props['name:en'] || f.props.name || ''; feats++;   /* '' = unnamed: used only to bridge a gap in a named river */
    for (const part of lineParts(f.geom)) for (const c of clip(part, wl.ext)) (lines[nm] ||= []).push(c.map(([px, py]) => { const X = (x + px / wl.ext) / n2, Y = (y + py / wl.ext) / n2;
      return [+(X * 360 - 180).toFixed(6), +(Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) * 180 / Math.PI).toFixed(6)]; })); } }
const meta = P.meta || {};
writeFileSync(out, JSON.stringify({ zoom: Z, source: (meta['agn:extract'] || {}).source || file, built: meta['planetiler:osm:osmosisreplicationtime'] || meta.built || null, attribution: meta.attribution || null, lines }));
console.log(`zoom ${Z}: ${tiles} tiles, ${feats} river features, ${Object.keys(lines).length} names -> ${out}`);
