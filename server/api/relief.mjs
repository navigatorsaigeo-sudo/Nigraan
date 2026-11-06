/* ══ v91.17.282 · RELIEF282 · PAINTED SHADED-RELIEF BASEMAP ═══════════════════════════════════════════════════════════════════════
   /tiles/relief/{z}/{x}/{y}.png        Pakistan in full colour, outside Pakistan the same relief muted (desaturated, lightened)
   /tiles/relief/muted/{z}/{x}/{y}.png  everything in the muted style (for a page that wants one style under its own mask)
   /tiles/relief/status                 JSON: ready, data source, licence, cache, timings
   z 4-12 (404 outside that range or for x/y outside the zoom's tile range). 256 px Web Mercator, opaque RGB PNG.

   DATA (nothing new is shipped; both bands are already in data/feat on the laptop and in every tree):
     data/feat/t_elev  Copernicus DEM GLO-30 DSM, mean of the 81 one-arc-second pixels per 9 arc-second (0.0025 deg, ~250 m) cell,
                       cells within ~5 km of Pakistan incl. AJK and GB (station-lake/scripts/terrain30_*.py). Licence: Copernicus DEM
                       licence, free incl. commercial use with attribution "(c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space
                       GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA".
     data/feat/w_dist  JRC Global Surface Water v1.4 occurrence >= 50 % -> distance 0 km; a cell with w_dist == 0 is water
                       (Pekel et al. 2016, Copernicus data policy, free without restriction).
     data/pk-tehsils.json  AGN tehsil polygons; the union without the "Indian Illegally Occupied Jammu Kashmir" polygon is "inside".
   Beyond the DEM domain (more than ~5 km outside Pakistan) no elevation exists on the laptop or in NIGRAAN: those pixels are a flat
   light colour (OUT_FLAT). No coarser open DEM is present, so none is invented.

   METHOD
     Levels: L0 = the 0.0025 deg grid (read block by block), L1 = 4 x 4 means (0.01 deg), L2 = 16 x 16 means (0.04 deg). A zoom
       uses the coarsest level whose cell is not larger than one screen pixel (z4-5 L2, z6-7 L1, z8-12 L0). Elevation is the mean of
       the valid cells (nodata when fewer than half are valid); water and "inside Pakistan" are fractions 0-1, so a wide river (the
       Indus and its main tributaries, the reservoirs) keeps a strong line at low zoom and a thin stream fades out: the strength
       comes from the measured water share, no river is named or hard-coded.
     Hillshade: Horn (1981) 3 x 3 gradient on the level's grid, metric cell size per row (cos latitude), sun azimuth 315 deg,
       altitude 45 deg (the cartographic standard), Lambertian n.L. Cartographic vertical exaggeration grows with cell size
       (VE below) because a coarser grid flattens real slopes; it changes only the look, never a served value.
     Hypsometric tint: colour stops by elevation (TINT): plains warm cream, hills sage, mountains stone, above ~4500 m near-white.
       Shadows are mixed toward a cool grey, lit slopes toward white ("painted" relief). Water is a blue-grey over the tint.
     Per screen pixel: bilinear interpolation of elevation, shade, water and inside fraction from the level grid.
     Outside style: luminance-desaturated (75 %) and lightened (45 %) toward white; the border blends by the inside fraction.
   CACHE: data/cache/relief/<ver>/<style>/<z>/<x>/<y>.png (atomic write), <ver> = hash of renderer version + band build stamps +
     tehsil file stamp, so a new DEM or a new rule never serves an old tile. Overviews + mask: data/cache/relief/<ver>/overview.bin.
   Output is deterministic (same input bytes -> same PNG bytes). No native dependency (node:zlib only). If t_elev is missing the
   routes answer a 1 x 1 transparent PNG with x-relief: unavailable (no broken tiles, no errors) and status says why. */
import { readFileSync, existsSync, statSync, openSync, readSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const RENDER_VERSION = 'relief-r2';
const MINZ = 4, MAXZ = 12, TS = 256;
const VE = [1.4, 2.2, 3.4];                 /* vertical exaggeration per level L0, L1, L2 */
const SUN_AZ = 315 * Math.PI / 180, SUN_ALT = 45 * Math.PI / 180;
const ZEN = Math.PI / 2 - SUN_ALT, COSZ = Math.cos(ZEN), SINZ = Math.sin(ZEN), SINA = Math.sin(SUN_AZ), COSA = Math.cos(SUN_AZ);
const TINT = [   /* metres, rgb */
  [-50, 0xee, 0xe7, 0xd3], [100, 0xf1, 0xe8, 0xcf], [350, 0xec, 0xe2, 0xc3], [700, 0xdf, 0xdd, 0xb8], [1100, 0xcd, 0xd5, 0xae],
  [1700, 0xbc, 0xc7, 0xa1], [2300, 0xbd, 0xba, 0xa2], [3000, 0xb5, 0xab, 0x99], [3800, 0xbf, 0xb7, 0xab], [4500, 0xdb, 0xd7, 0xd1],
  [5200, 0xf1, 0xef, 0xeb], [6000, 0xfa, 0xfa, 0xf8], [9000, 0xff, 0xff, 0xff]];
const WATER = [0x8d, 0xa6, 0xb8], SHADOW = [0x5c, 0x63, 0x6e], OUT_FLAT = [0xf2, 0xf1, 0xed];
const SHADE_K = 1.05;                        /* light factor = 1 + K (hs - cos zen) */
const IIOJK = 'Indian Illegally Occupied Jammu Kashmir';
const EMPTY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg==', 'base64');

/* ---------- PNG (RGB, adaptive filter per row) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
export function pngRGB(rgb, w, h) {
  const stride = w * 3, raw = Buffer.alloc((stride + 1) * h), cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < h; y++) {
    const o = y * stride; let best = 0, bestCost = Infinity;
    for (let f = 0; f < 4; f++) {
      const out = cand[f]; let cost = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? rgb[o + i - 3] : 0, b = y ? rgb[o - stride + i] : 0, c = (i >= 3 && y) ? rgb[o - stride + i - 3] : 0, v = rgb[o + i];
        let r;
        if (f === 0) r = v; else if (f === 1) r = v - a; else if (f === 2) r = v - b;
        else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); r = v - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        r &= 255; out[i] = r; cost += r < 128 ? r : 256 - r;
      }
      if (cost < bestCost) { bestCost = cost; best = f; }
    }
    const F = [0, 1, 2, 4][best]; raw[y * (stride + 1)] = F; cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- colour ---------- */
const LUT_MIN = -50, LUT_STEP = 5, LUT_N = Math.ceil((9000 - LUT_MIN) / LUT_STEP) + 1;
const LUT = (() => { const t = new Float32Array(LUT_N * 3);
  for (let i = 0; i < LUT_N; i++) { const e = LUT_MIN + i * LUT_STEP; let k = 0; while (k < TINT.length - 2 && e > TINT[k + 1][0]) k++;
    const A = TINT[k], B = TINT[k + 1], f = Math.max(0, Math.min(1, (e - A[0]) / (B[0] - A[0])));
    for (let c = 0; c < 3; c++) t[i * 3 + c] = A[c + 1] + (B[c + 1] - A[c + 1]) * f; }
  return t; })();
function mute(c) { const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; for (let i = 0; i < 3; i++) { const d = l + (c[i] - l) * 0.25; c[i] = d + (255 - d) * 0.45; } }

/* ---------- module ---------- */
export function createRelief(dataDir, { maxBlocks = 320 } = {}) {
  const featDir = join(dataDir, 'feat'), cacheRoot = join(dataDir, 'cache', 'relief');
  const st = { renders: 0, cacheHits: 0, renderMs: [], hitMs: [], errors: 0, lastError: null };
  let S = null, loadErr = null, ovPromise = null;

  function load() {
    if (S || loadErr) return S;
    try {
      const ej = join(featDir, 't_elev.json'); if (!existsSync(ej)) { loadErr = 'data/feat/t_elev.json is not installed'; return null; }
      const E = JSON.parse(readFileSync(ej, 'utf8'));
      const wj = join(featDir, 'w_dist.json'); const W = existsSync(wj) ? JSON.parse(readFileSync(wj, 'utf8')) : null;
      const G = E.grid; if (W && JSON.stringify(W.grid) !== JSON.stringify(G)) throw new Error('w_dist grid differs from t_elev grid');
      const tf = join(dataDir, 'pk-tehsils.json'); const tstamp = existsSync(tf) ? String(statSync(tf).size) + ':' + (JSON.parse(readFileSync(tf, 'utf8')).built || '') : 'none';
      const ver = createHash('sha1').update([RENDER_VERSION, E.built, W ? W.built : 'nowater', tstamp, JSON.stringify(TINT), VE.join()].join('|')).digest('hex').slice(0, 12);
      S = { E, W, G, ver, dir: join(cacheRoot, ver), tf, fds: new Map(), lru: new Map(), ov: null };
    } catch (e) { loadErr = String(e.message || e); S = null; }
    return S;
  }
  function fd(f) { let d = S.fds.get(f); if (d == null) { d = openSync(f, 'r'); S.fds.set(f, d); } return d; }
  function block(band, br, bc) {   /* Int16Array(100*100) or null */
    const j = band === 'e' ? S.E : S.W; if (!j) return null;
    const key = band + br + ',' + bc; const L = S.lru;
    if (L.has(key)) { const v = L.get(key); L.delete(key); L.set(key, v); return v; }
    const e = j.blocks[br + ',' + bc]; let a = null;
    if (e) { const [part, off, len] = e; const buf = Buffer.alloc(len); readSync(fd(join(featDir, j.band + '.p' + part + '.bin')), buf, 0, len, off);
      const raw = inflateSync(buf); a = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2); }
    L.set(key, a); while (L.size > maxBlocks) L.delete(L.keys().next().value);
    return a;
  }

  function readBlock(band, br, bc) {   /* uncached read (overview build: every block once) */
    const j = band === 'e' ? S.E : S.W; if (!j) return null; const e = j.blocks[br + ',' + bc]; if (!e) return null;
    const [part, off, len] = e; const buf = Buffer.alloc(len); readSync(fd(join(featDir, j.band + '.p' + part + '.bin')), buf, 0, len, off);
    const raw = inflateSync(buf); return new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  }
  /* inside-Pakistan mask on the L0 grid (bit set), scanline fill of every tehsil ring at cell centres */
  function buildMask() {
    const G = S.G, n = G.cols * G.rows, bits = new Uint8Array((n + 7) >> 3);
    if (!existsSync(S.tf)) return bits;
    const T = JSON.parse(readFileSync(S.tf, 'utf8'));
    for (const f of T.features || []) {
      if (!f.geometry || (f.properties && f.properties.province === IIOJK)) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      for (const rings of polys) {
        let la0 = 90, la1 = -90; for (const r of rings) for (const p of r) { if (p[1] < la0) la0 = p[1]; if (p[1] > la1) la1 = p[1]; }
        const r0 = Math.max(0, Math.floor((G.north - la1) / G.cell - 0.5)), r1 = Math.min(G.rows - 1, Math.ceil((G.north - la0) / G.cell - 0.5));
        const xs = [];
        for (let r = r0; r <= r1; r++) {
          const lat = G.north - (r + 0.5) * G.cell; xs.length = 0;
          for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const a = ring[i], b = ring[j]; if ((a[1] > lat) !== (b[1] > lat)) xs.push(a[0] + (lat - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
          }
          xs.sort((p, q) => p - q);
          for (let k = 0; k + 1 < xs.length; k += 2) {
            const c0 = Math.max(0, Math.ceil((xs[k] - G.west) / G.cell - 0.5)), c1 = Math.min(G.cols - 1, Math.floor((xs[k + 1] - G.west) / G.cell - 0.5));
            for (let c = c0; c <= c1; c++) { const id = r * G.cols + c; bits[id >> 3] |= 1 << (id & 7); }
          }
        }
      }
    }
    return bits;
  }
  const inMask = (bits, r, c) => { const id = r * S.G.cols + c; return (bits[id >> 3] >> (id & 7)) & 1; };

  /* overviews L1 (x4) and L2 (x16): elevation (Int16, -32768 nodata), water and inside fractions (Uint8 0-255) */
  function overviews() {
    if (S.ov) return Promise.resolve(S.ov);
    if (ovPromise) return ovPromise;
    ovPromise = new Promise((resolve, reject) => {
      const G = S.G, f = join(S.dir, 'overview.bin');
      const c1 = Math.ceil(G.cols / 4), r1 = Math.ceil(G.rows / 4), c2 = Math.ceil(c1 / 4), r2 = Math.ceil(r1 / 4);
      const lens = [G.cols * G.rows + 7 >> 3, r1 * c1 * 2, r1 * c1, r1 * c1, r2 * c2 * 2, r2 * c2, r2 * c2];
      const wrap = (buf) => { let o = 0; const take = (n) => { const b = buf.subarray(o, o + n); o += n; return b; };
        const mask = new Uint8Array(take(lens[0]));
        const cp16 = (b) => { const a = new Int16Array(b.length / 2); Buffer.from(a.buffer).set(b); return a; };
        return { mask, L1: { c: c1, r: r1, cell: G.cell * 4, e: cp16(take(lens[1])), w: new Uint8Array(take(lens[2])), m: new Uint8Array(take(lens[3])) },
                 L2: { c: c2, r: r2, cell: G.cell * 16, e: cp16(take(lens[4])), w: new Uint8Array(take(lens[5])), m: new Uint8Array(take(lens[6])) } }; };
      try { if (existsSync(f)) { const b = readFileSync(f); if (b.length === lens.reduce((a, x) => a + x, 0)) { S.ov = wrap(b); return resolve(S.ov); } } } catch (_) {}
      const t0 = Date.now(); const mask = buildMask();
      const n1 = r1 * c1, sE = new Int32Array(n1), nE = new Uint8Array(n1), nW = new Uint8Array(n1), nM = new Uint8Array(n1);
      const nbr = Math.ceil(G.rows / G.block), nbc = Math.ceil(G.cols / G.block); const B = G.block;
      let k = 0; const total = nbr * nbc;
      const step = () => {
        try {
          const until = Date.now() + 25;
          while (k < total && Date.now() < until) {
            const br = Math.floor(k / nbc), bc = k % nbc; k++;
            const ea = readBlock('e', br, bc), wa = readBlock('w', br, bc);
            for (let i = 0; i < B; i++) { const r = br * B + i; if (r >= G.rows) break; const R1 = r >> 2;
              for (let j = 0; j < B; j++) { const c = bc * B + j; if (c >= G.cols) break; const id = R1 * c1 + (c >> 2);
                if (inMask(mask, r, c)) nM[id]++;
                if (ea) { const v = ea[i * B + j]; if (v !== S.E.nodata) { sE[id] += v; nE[id]++; } }
                if (wa) { const v = wa[i * B + j]; if (v === 0) nW[id]++; } } }
          }
          if (k < total) return setImmediate(step);
          /* L1 */
          const e1 = new Int16Array(n1).fill(-32768), w1 = new Uint8Array(n1), m1 = new Uint8Array(n1);
          for (let id = 0; id < n1; id++) { if (nE[id] >= 8) e1[id] = Math.round(sE[id] / nE[id]); w1[id] = Math.round(255 * nW[id] / 16); m1[id] = Math.round(255 * nM[id] / 16); }
          /* L2 from L1 */
          const n2 = r2 * c2, e2 = new Int16Array(n2).fill(-32768), w2 = new Uint8Array(n2), m2 = new Uint8Array(n2);
          for (let R = 0; R < r2; R++) for (let C = 0; C < c2; C++) { let s = 0, ne = 0, sw = 0, sm = 0;
            for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const r = R * 4 + i, c = C * 4 + j; if (r >= r1 || c >= c1) continue; const id = r * c1 + c;
              if (e1[id] !== -32768) { s += e1[id]; ne++; } sw += w1[id]; sm += m1[id]; }
            const id2 = R * c2 + C; if (ne >= 8) e2[id2] = Math.round(s / ne); w2[id2] = Math.round(sw / 16); m2[id2] = Math.round(sm / 16); }
          const buf = Buffer.concat([mask, Buffer.from(e1.buffer), w1, m1, Buffer.from(e2.buffer), w2, m2].map((a) => Buffer.from(a.buffer || a, a.byteOffset || 0, a.byteLength)));
          try { mkdirSync(S.dir, { recursive: true }); const tmp = f + '.' + process.pid + '.tmp'; writeFileSync(tmp, buf); renameSync(tmp, f); } catch (_) {}
          S.ov = wrap(buf); S.ovMs = Date.now() - t0; resolve(S.ov);
        } catch (e) { ovPromise = null; reject(e); }
      };
      step();
    });
    return ovPromise;
  }

  /* window of a level: rows R0..R0+h-1, cols C0..C0+w-1 -> elevation (NaN = nodata), water 0-1, inside 0-1 */
  function windowL0(R0, C0, h, w) {
    const G = S.G, B = G.block, n = h * w, E = new Float32Array(n).fill(NaN), W0 = new Float32Array(n), M = new Float32Array(n), bits = S.ov.mask, nd = S.E.nodata;
    const ra = Math.max(0, R0), rb = Math.min(G.rows - 1, R0 + h - 1), ca = Math.max(0, C0), cb = Math.min(G.cols - 1, C0 + w - 1);
    for (let br = Math.floor(ra / B); br <= Math.floor(rb / B); br++) for (let bc = Math.floor(ca / B); bc <= Math.floor(cb / B); bc++) {
      const ea = block('e', br, bc), wa = block('w', br, bc);
      const r0 = Math.max(ra, br * B), r1 = Math.min(rb, br * B + B - 1), c0 = Math.max(ca, bc * B), c1 = Math.min(cb, bc * B + B - 1);
      for (let r = r0; r <= r1; r++) { const oi = (r - R0) * w - C0, qi = (r - br * B) * B - bc * B;
        for (let c = c0; c <= c1; c++) { const o = oi + c, q = qi + c;
          if (ea) { const v = ea[q]; if (v !== nd) E[o] = v; }
          if (wa && wa[q] === 0) W0[o] = 1;
          const id = r * G.cols + c; M[o] = (bits[id >> 3] >> (id & 7)) & 1; } } }
    /* 3 x 3 binomial smoothing of the water flags: rounds the 250 m staircase and drops isolated single-cell ponds (centre 0.25) */
    const Wf = new Float32Array(n);
    for (let i = 1; i < h - 1; i++) for (let j = 1; j < w - 1; j++) { const o = i * w + j;
      Wf[o] = (4 * W0[o] + 2 * (W0[o - 1] + W0[o + 1] + W0[o - w] + W0[o + w]) + W0[o - w - 1] + W0[o - w + 1] + W0[o + w - 1] + W0[o + w + 1]) / 16; }
    return { E, Wf, M };
  }
  function windowLv(L, R0, C0, h, w) {
    const n = h * w, E = new Float32Array(n).fill(NaN), Wf = new Float32Array(n), M = new Float32Array(n);
    for (let i = 0; i < h; i++) { const r = R0 + i; if (r < 0 || r >= L.r) continue;
      for (let j = 0; j < w; j++) { const c = C0 + j; if (c < 0 || c >= L.c) continue; const id = r * L.c + c, o = i * w + j;
        if (L.e[id] !== -32768) E[o] = L.e[id]; Wf[o] = L.w[id] / 255; M[o] = L.m[id] / 255; } }
    return { E, Wf, M };
  }

  function render(z, x, y, muted, shade) {   /* v91.17.282 START282 · shade: white ground, hillshade shadows only (no tint, no water) */
    const G = S.G, lvl = z <= 5 ? 2 : z <= 7 ? 1 : 0, cell = lvl === 0 ? G.cell : lvl === 1 ? S.ov.L1.cell : S.ov.L2.cell;
    const n2 = Math.pow(2, z), lonOf = (px) => (x * TS + px) / (TS * n2) * 360 - 180;
    const latOf = (py) => { const t = Math.PI * (1 - 2 * (y * TS + py) / (TS * n2)); return 180 / Math.PI * Math.atan(Math.sinh(t)); };
    const lonW = lonOf(0), lonE = lonOf(TS), latN = latOf(0), latS = latOf(TS);
    const out = Buffer.alloc(TS * TS * 3);
    const flat = () => { const c = OUT_FLAT.slice(); for (let i = 0; i < TS * TS; i++) { out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; } return out; };
    const gE = G.west + G.cols * G.cell, gS = G.north - G.rows * G.cell;
    if (lonE <= G.west || lonW >= gE || latS >= G.north || latN <= gS) return flat();
    /* grid window (continuous coordinate: col = (lon - west)/cell - 0.5) plus a 2-cell margin for Horn and bilinear */
    const C0 = Math.floor((lonW - G.west) / cell - 0.5) - 2, C1 = Math.floor((lonE - G.west) / cell - 0.5) + 3;
    const R0 = Math.floor((G.north - latN) / cell - 0.5) - 2, R1 = Math.floor((G.north - latS) / cell - 0.5) + 3;
    const w = C1 - C0 + 1, h = R1 - R0 + 1;
    const win = lvl === 0 ? windowL0(R0, C0, h, w) : windowLv(lvl === 1 ? S.ov.L1 : S.ov.L2, R0, C0, h, w);
    const { E, Wf, M } = win;
    /* Horn hillshade per window cell */
    const HS = new Float32Array(h * w).fill(COSZ), ve = VE[lvl], dy = cell * 110574;
    for (let i = 1; i < h - 1; i++) { const lat = G.north - (R0 + i + 0.5) * cell, dx = cell * 111320 * Math.cos(lat * Math.PI / 180), kx = ve / (8 * dx), ky = ve / (8 * dy);
      for (let j = 1; j < w - 1; j++) { const o = i * w + j, e0 = E[o]; if (e0 !== e0) continue;
        let a = E[o - w - 1], b = E[o - w], c = E[o - w + 1], d = E[o - 1], f = E[o + 1], gg = E[o + w - 1], hh = E[o + w], ii = E[o + w + 1];
        if (a !== a) a = e0; if (b !== b) b = e0; if (c !== c) c = e0; if (d !== d) d = e0; if (f !== f) f = e0; if (gg !== gg) gg = e0; if (hh !== hh) hh = e0; if (ii !== ii) ii = e0;
        const gx = ((c + 2 * f + ii) - (a + 2 * d + gg)) * kx;          /* dz/d(east) */
        const gn = ((a + 2 * b + c) - (gg + 2 * hh + ii)) * ky;         /* dz/d(north) */
        const hs = (COSZ - gx * SINZ * SINA - gn * SINZ * COSA) / Math.sqrt(1 + gx * gx + gn * gn);
        HS[o] = hs < 0 ? 0 : hs; } }
    const wK = lvl === 0 ? 1 : lvl === 1 ? 2.2 : 3.2;      /* water share -> line strength (a cell is one fraction of a pixel) */
    const col = [0, 0, 0], mc = [0, 0, 0], GC = new Float64Array(TS); for (let px = 0; px < TS; px++) GC[px] = (lonOf(px + 0.5) - G.west) / cell - 0.5 - C0;
    for (let py = 0; py < TS; py++) {
      const lat = latOf(py + 0.5), gr = (G.north - lat) / cell - 0.5 - R0, r0 = Math.floor(gr), fy = gr - r0;
      for (let px = 0; px < TS; px++) {
        const gc = GC[px], c0 = Math.floor(gc), fx = gc - c0;
        const o00 = r0 * w + c0, o01 = o00 + 1, o10 = o00 + w, o11 = o10 + 1;
        const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
        let se = 0, sw = 0, sh = 0, v;
        v = E[o00]; if (v === v) { se += v * w00; sh += HS[o00] * w00; sw += w00; }
        v = E[o01]; if (v === v) { se += v * w01; sh += HS[o01] * w01; sw += w01; }
        v = E[o10]; if (v === v) { se += v * w10; sh += HS[o10] * w10; sw += w10; }
        v = E[o11]; if (v === v) { se += v * w11; sh += HS[o11] * w11; sw += w11; }
        const wat = Wf[o00] * w00 + Wf[o01] * w01 + Wf[o10] * w10 + Wf[o11] * w11;
        const ins = muted ? 0 : M[o00] * w00 + M[o01] * w01 + M[o10] * w10 + M[o11] * w11;
        const q = (py * TS + px) * 3;
        if (sw < 0.5) { out[q] = OUT_FLAT[0]; out[q + 1] = OUT_FLAT[1]; out[q + 2] = OUT_FLAT[2]; if (shade) { out[q] = out[q + 1] = out[q + 2] = 255; } continue; }   /* beyond the DEM: flat, not muted again */
        if (shade) { const hs = sh / sw, fct = 1 + SHADE_K * (hs - COSZ), d = fct < 1 ? Math.min(1, 1 - fct) : 0;   /* level ground and lit slopes stay white */
          for (let k = 0; k < 3; k++) out[q + k] = Math.round(255 * (1 - d) + SHADOW[k] * d); continue; }
        {
          const e = se / sw, hs = sh / sw; let li = Math.round((e - LUT_MIN) / LUT_STEP); li = li < 0 ? 0 : li >= LUT_N ? LUT_N - 1 : li;
          col[0] = LUT[li * 3]; col[1] = LUT[li * 3 + 1]; col[2] = LUT[li * 3 + 2];
          const fct = 1 + SHADE_K * (hs - COSZ);
          if (fct < 1) { const d = Math.min(1, (1 - fct)) * 0.75; for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - d) + SHADOW[k] * d; }
          else { const u = Math.min(1, (fct - 1) * 1.6); for (let k = 0; k < 3; k++) col[k] = col[k] + (255 - col[k]) * u; }
          let wa = lvl === 0 ? (wat - 0.32) / 0.3 : wat * wK; wa = wa < 0 ? 0 : wa > 1 ? 1 : wa; wa *= 0.9;
          if (wa > 0) for (let k = 0; k < 3; k++) col[k] = col[k] * (1 - wa) + WATER[k] * wa;
        }
        if (ins < 1) { mc[0] = col[0]; mc[1] = col[1]; mc[2] = col[2]; mute(mc); for (let k = 0; k < 3; k++) col[k] = mc[k] + (col[k] - mc[k]) * ins; }
        out[q] = Math.round(col[0]); out[q + 1] = Math.round(col[1]); out[q + 2] = Math.round(col[2]);
      }
    }
    return out;
  }

  const inflight = new Map(); let flatPng = null;
  async function tile(z, x, y, style) {
    if (!load()) return null;
    const muted = style === 'muted', shade = style === 'shade', sdir = shade ? 'shade' : muted ? 'muted' : 'pk';
    const f = join(S.dir, sdir, String(z), String(x), y + '.png');
    const t0 = process.hrtime.bigint();
    if (existsSync(f)) { const b = readFileSync(f); st.cacheHits++; st.hitMs.push(Number(process.hrtime.bigint() - t0) / 1e6); if (st.hitMs.length > 500) st.hitMs.shift(); return { buf: b, cache: 'hit' }; }
    const key = f; if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      await overviews();
      const t1 = process.hrtime.bigint();
      const rgb = render(z, x, y, muted, shade); const buf = pngRGB(rgb, TS, TS);
      st.renders++; st.renderMs.push(Number(process.hrtime.bigint() - t1) / 1e6); if (st.renderMs.length > 500) st.renderMs.shift();
      try { mkdirSync(join(S.dir, sdir, String(z), String(x)), { recursive: true }); const tmp = f + '.' + process.pid + '.tmp'; writeFileSync(tmp, buf); renameSync(tmp, f); } catch (_) {}
      return { buf, cache: 'miss' };
    })();
    inflight.set(key, p); try { return await p; } finally { inflight.delete(key); }
  }
  const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((u, v) => u - v); return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] * 10) / 10; };
  function status() {
    load();
    return { ready: !!S, why: loadErr, minZoom: MINZ, maxZoom: MAXZ, template: '/tiles/relief/{z}/{x}/{y}.png', mutedTemplate: '/tiles/relief/muted/{z}/{x}/{y}.png', shadeTemplate: '/tiles/relief/shade/{z}/{x}/{y}.png',
      version: S ? S.ver : null, overviewReady: !!(S && S.ov), overviewBuildMs: S ? S.ovMs || null : null,
      grid: S ? { cellDeg: S.G.cell, west: S.G.west, north: S.G.north, cols: S.G.cols, rows: S.G.rows, domain: S.E.domain || null } : null,
      sources: S ? [{ band: 't_elev', source: S.E.source, built: S.E.built, method: S.E.method, licence: (S.E.licence || [])[0] || null }, S.W ? { band: 'w_dist', source: S.W.source, built: S.W.built, licence: (S.W.licence || [])[0] || null } : null].filter(Boolean) : [],
      method: 'Horn hillshade, sun 315 deg / 45 deg, hypsometric tint; outside Pakistan desaturated + lightened; beyond the DEM domain flat colour',
      stats: { renders: st.renders, cacheHits: st.cacheHits, renderMsP50: pct(st.renderMs, 0.5), renderMsP95: pct(st.renderMs, 0.95), hitMsP50: pct(st.hitMs, 0.5), hitMsP95: pct(st.hitMs, 0.95), errors: st.errors, lastError: st.lastError } };
  }
  /* v91.17.283 · WS1 · canonical integers only (no sign, no leading zero, so one tile has one URL and one cache file) */
  const RX = /^\/tiles\/relief\/(?:(muted|shade)\/)?(0|[1-9]\d?)\/(0|[1-9]\d{0,4})\/(0|[1-9]\d{0,4})\.png$/;
  /* v91.17.283 · WS1 · the tile range that holds data at zoom z: the DEM grid's own extent (Pakistan + ~5 km, data/feat/t_elev.json), in
     tile numbers. A tile outside it is all flat colour (render() returns flat() there): it is answered with the same flat tile (byte for byte, every style) from memory,
     and never rendered or written to the disk cache, so requests for the ~22 million out-of-country tiles z4-12 cannot fill the disk. */
  function dataRange(z) {
    if (!load()) return null; const G = S.G, n = 2 ** z, west = G.west, east = G.west + G.cols * G.cell, north = G.north, south = G.north - G.rows * G.cell;
    const tx = (lon) => Math.floor((lon + 180) / 360 * n), ty = (lat) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
    return { x0: Math.max(0, tx(west)), x1: Math.min(n - 1, tx(east)), y0: Math.max(0, ty(north)), y1: Math.min(n - 1, ty(south)) };
  }
  let flatTile = null;
  const flatPngOf = () => flatTile || (flatTile = pngRGB((() => { const b = Buffer.alloc(TS * TS * 3); for (let i = 0; i < TS * TS; i++) { b[i * 3] = OUT_FLAT[0]; b[i * 3 + 1] = OUT_FLAT[1]; b[i * 3 + 2] = OUT_FLAT[2]; } return b; })(), TS, TS));
  /* returns true when the path is a relief route (the response is then written, possibly asynchronously) */
  function handle(req, res, p) {
    if (!p.startsWith('/tiles/relief')) return false;
    const send = (code, type, body, extra) => { if (res.headersSent) return; res.writeHead(code, Object.assign({ 'content-type': type, 'content-length': body.length }, extra || {})); res.end(body); };
    if (p === '/tiles/relief/status') { send(200, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(status())), { 'cache-control': 'no-store' }); return true; }
    const m = RX.exec(p);
    if (!m) { send(404, 'application/json', Buffer.from('{"error":"not_found"}')); return true; }
    const z = +m[2], x = +m[3], y = +m[4], n = 2 ** z;
    if (z < MINZ || z > MAXZ || x >= n || y >= n) { send(404, 'application/json', Buffer.from(JSON.stringify({ error: 'tile_out_of_range', minZoom: MINZ, maxZoom: MAXZ }))); return true; }
    { const R = dataRange(z); if (R && (x < R.x0 || x > R.x1 || y < R.y0 || y > R.y1)) {   /* v91.17.283 · WS1 · outside the data extent */
      send(200, 'image/png', flatPngOf(), { 'cache-control': 'public, max-age=604800', 'x-relief': 'outside' }); return true; } }
    tile(z, x, y, m[1] || 'pk').then((r) => {
      if (!r) return send(200, 'image/png', EMPTY_PNG, { 'cache-control': 'no-store', 'x-relief': 'unavailable' });
      send(200, 'image/png', r.buf, { 'cache-control': 'public, max-age=604800', 'x-relief': r.cache, 'x-relief-version': S.ver });
    }).catch((e) => { st.errors++; st.lastError = String(e && e.message || e); send(200, 'image/png', EMPTY_PNG, { 'cache-control': 'no-store', 'x-relief': 'error' }); });
    return true;
  }
  return { handle, tile, status, warm: () => (load() ? overviews().then(() => true) : Promise.resolve(false)) };
}
