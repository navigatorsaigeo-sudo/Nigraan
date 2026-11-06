/* ══ v91.17.184 · THE 250 m SPONGE AS MAP TILES ════════════════════════════════════════════════════════════════════════════════
   data/sponge-250m.bin (station-lake/scripts/sponge250.py): a JSON header line, then the zlib-compressed class grid (uint8, one
   cell per 9 arc seconds, 255 = no land or outside Pakistan). Classes 0-4: sealed (runs off like pavement), like bare ground, like
   cropland, like grassland, absorbs like woodland. /tiles/sponge/{z}/{x}/{y}.png renders a 256 px Web Mercator tile by nearest cell
   (z 4-13), as an indexed PNG with the five colours (ColorBrewer BrBG 5) and transparency where there is no class. Tiles are kept
   in memory (LRU 600). Nothing here decides a class; the grid file does. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

/* v91.17.283.49 (1.0.10 regressions): the five class colours are the sponge value ramp of data/map-layer-scales.json display.sponge.ramp
   (sand = holds the least .. sea green = holds the most), read at start, so the 250 m tiles match the tehsil classes and the key; the
   ColorBrewer BrBG 5 below (brown .. teal) is the fallback when the file has no ramp. */
const PAL_BRBG = [[0x8c, 0x51, 0x0a], [0xd8, 0xb3, 0x65], [0xf6, 0xe8, 0xc3], [0x5a, 0xb4, 0xac], [0x01, 0x66, 0x5e]];
let PAL = PAL_BRBG;
function rampFrom(dataDir) {
  try { const R = JSON.parse(readFileSync(join(dataDir, 'map-layer-scales.json'), 'utf8')).display.sponge.ramp;
    if (Array.isArray(R) && R.length === 5 && R.every((h) => /^#[0-9a-f]{6}$/i.test(h))) return R.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))); } catch (_) {}
  return PAL_BRBG; }
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
function png(idx, w, h, alpha) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const plte = Buffer.alloc(3 * 6); PAL.forEach((c, i) => { plte[3 * i] = c[0]; plte[3 * i + 1] = c[1]; plte[3 * i + 2] = c[2]; });
  const trns = Buffer.from([alpha, alpha, alpha, alpha, alpha, 0]);   /* index 5 = transparent */
  const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; idx.copy(raw, y * (w + 1) + 1, y * w, y * w + w); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

export function createSpongeTiles(dataDir) {
  const f = join(dataDir, 'sponge-250m.bin'); let G = null, mt = 0; const cache = new Map();
  PAL = rampFrom(dataDir);
  function grid() {
    if (!existsSync(f)) return null; const m = statSync(f).mtimeMs; if (G && m === mt) return G;
    const b = readFileSync(f); const nl = b.indexOf(10); const hdr = JSON.parse(b.subarray(0, nl).toString('utf8'));
    G = { hdr, cls: inflateSync(b.subarray(nl + 1)) }; mt = m; cache.clear(); return G;
  }
  function tile(z, x, y) {
    const g = grid(); if (!g) return null; if (z < 4 || z > 13) return null;
    const k = z + '/' + x + '/' + y; if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
    const { west, north, cell, rows, cols } = g.hdr.grid; const n = Math.pow(2, z), out = Buffer.alloc(256 * 256, 5);
    const lon0 = x / n * 360 - 180, dlon = 360 / n / 256;
    for (let py = 0; py < 256; py++) {
      const yy = (y + (py + 0.5) / 256) / n; const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * yy))) * 180 / Math.PI;
      const r = Math.floor((north - lat) / cell); if (r < 0 || r >= rows) continue; const row = r * cols;
      for (let px = 0; px < 256; px++) { const lon = lon0 + (px + 0.5) * dlon; const c = Math.floor((lon - west) / cell); if (c < 0 || c >= cols) continue; const v = g.cls[row + c]; if (v < 5) out[py * 256 + px] = v; }
    }
    const buf = png(out, 256, 256, 235); cache.set(k, buf); if (cache.size > 600) cache.delete(cache.keys().next().value); return buf;
  }
  function status() { const g = grid(); return g ? { ready: true, version: g.hdr.version, built: g.hdr.built, classes: g.hdr.classes, grid: g.hdr.grid } : { ready: false, why: 'data/sponge-250m.bin is not in this install' }; }
  /* v91.17.283.49 · 1.0.10 item 3 · the class of the 250 m cell at a point (the same grid and the same cell rule as the tiles: row =
     floor((north - lat) / cell), col = floor((lon - west) / cell), 255 = no land / outside Pakistan). Until 1.0.9 no point lookup existed, so
     a site report printed the tehsil's class ("Like cropland" for Islamabad tehsil, mostly fields and hills) as the site's: I-8's own
     cell is sealed ground. */
  function classAt(lat, lon) {
    const g = grid(); if (!g) return { ok: false, why: 'data/sponge-250m.bin is not in this install' };
    const { west, north, cell, rows, cols } = g.hdr.grid; const r = Math.floor((north - lat) / cell), c = Math.floor((lon - west) / cell);
    if (!(r >= 0 && r < rows && c >= 0 && c < cols)) return { ok: false, why: 'outside the 250 m grid' };
    const v = g.cls[r * cols + c]; if (v >= (g.hdr.classes || []).length) return { ok: false, why: 'no land class in this 250 m cell (water, snow or outside Pakistan)' };
    return { ok: true, cls: v, word: g.hdr.classes[v], cellM: Math.round(cell * 111320), version: g.hdr.version, built: g.hdr.built };
  }
  return { tile, status, classAt };
}
