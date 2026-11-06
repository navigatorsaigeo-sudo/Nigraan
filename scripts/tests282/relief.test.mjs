/* v91.17.282 RELIEF282 tests: node scripts/tests282/relief.test.mjs http://127.0.0.1:<port> [dataDir of that server]
   Route returns valid PNGs, cache works, output deterministic, unknown z/x/y -> 404, outside-Pakistan style, missing-DEM fallback,
   performance (first render and cached). Read-only apart from the server's own tile cache. */
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { existsSync, rmSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRelief } from '../../server/api/relief.mjs';

const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8787';
const DATA = process.argv[3] || null;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const get = async (p) => { const t = performance.now(); const r = await fetch(BASE + p); const b = Buffer.from(await r.arrayBuffer()); return { r, b, ms: performance.now() - t }; };
const tileOf = (lat, lon, z) => { const n = 2 ** z, la = lat * Math.PI / 180; return [z, Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n)]; };
const pxOf = (lat, lon, z) => { const n = 2 ** z * 256, la = lat * Math.PI / 180; return [Math.floor((lon + 180) / 360 * n) % 256, Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n) % 256]; };
const sha = (b) => createHash('sha256').update(b).digest('hex');

/* minimal PNG decoder (RGB 8 bit, filters 0-4) with CRC check */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function decode(b) {
  if (b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('signature');
  let o = 8, w, h, ct, idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    if (crc32(b.subarray(o + 4, o + 8 + len)) !== b.readUInt32BE(o + 8 + len)) throw new Error('crc ' + type);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8) throw new Error('depth'); }
    if (type === 'IDAT') idat.push(data); if (type === 'IEND') break; o += 12 + len; }
  if (ct !== 2) return { w, h, ct, px: null };
  const raw = inflateSync(Buffer.concat(idat)), s = w * 3, px = Buffer.alloc(s * h);
  for (let y = 0; y < h; y++) { const f = raw[y * (s + 1)]; for (let i = 0; i < s; i++) { const v = raw[y * (s + 1) + 1 + i], a = i >= 3 ? px[y * s + i - 3] : 0, u = y ? px[(y - 1) * s + i] : 0, c = (i >= 3 && y) ? px[(y - 1) * s + i - 3] : 0;
    let p = 0; if (f === 1) p = a; else if (f === 2) p = u; else if (f === 3) p = (a + u) >> 1; else if (f === 4) { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
    px[y * s + i] = (v + p) & 255; } }
  return { w, h, ct, px };
}
const sat = (px, x, y) => { const i = (y * 256 + x) * 3, r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const meanSat = (px) => { let s = 0; for (let y = 0; y < 256; y += 4) for (let x = 0; x < 256; x += 4) s += sat(px, x, y); return s / 4096; };

const st = (await get('/tiles/relief/status')); const S = JSON.parse(st.b.toString());
ok(st.r.status === 200 && S.ready === true, 'status ready (' + (S.why || 'ok') + '), version ' + S.version);
ok(S.sources && S.sources[0] && /Copernicus DEM GLO-30/.test(S.sources[0].source) && S.sources[0].licence, 'status names the DEM source + licence');

/* valid PNGs at the four demo views, z4 and z12 */
const VIEWS = [[30.2, 69.4, 4], [30.2, 69.4, 5], [36.0, 74.5, 7], [33.68, 73.05, 9], [33.7, 73.06, 11], [33.7, 73.06, 12]];
const first = [], firstMiss = [];
for (const [la, lo, z] of VIEWS) { const [Z, X, Y] = tileOf(la, lo, z); const g = await get(`/tiles/relief/${Z}/${X}/${Y}.png`);
  let d = null; try { d = decode(g.b); } catch (e) { d = { err: e.message }; }
  ok(g.r.status === 200 && g.r.headers.get('content-type') === 'image/png' && d.w === 256 && d.h === 256 && d.ct === 2 && d.px, `z${Z} ${X}/${Y} valid 256x256 RGB PNG (${g.b.length} B, ${g.r.headers.get('x-relief')}, ${g.ms.toFixed(0)} ms)`);
  first.push(g.ms); if (g.r.headers.get('x-relief') === 'miss') firstMiss.push(g.ms); }

/* cache: second request is a hit with identical bytes; the file is on disk */
{ const [Z, X, Y] = tileOf(33.68, 73.05, 9); const a = await get(`/tiles/relief/${Z}/${X}/${Y}.png`), b = await get(`/tiles/relief/${Z}/${X}/${Y}.png`);
  ok(a.r.headers.get('x-relief') === 'hit' && b.r.headers.get('x-relief') === 'hit' && sha(a.b) === sha(b.b), 'repeat request is a cache hit, same bytes');
  if (DATA) { const f = join(DATA, 'cache', 'relief', S.version, 'pk', String(Z), String(X), Y + '.png'); ok(existsSync(f), 'tile cached on disk at data/cache/relief/<ver>/pk/z/x/y.png');
    /* determinism: delete the cached file, render again, same bytes */
    const before = sha(a.b); rmSync(f); const c = await get(`/tiles/relief/${Z}/${X}/${Y}.png`);
    ok(c.r.headers.get('x-relief') === 'miss' && sha(c.b) === before, 'deterministic: re-render after cache delete gives identical bytes'); }
}
/* determinism across a fresh module instance (no shared state) */
if (DATA) { const R2 = createRelief(DATA); const [Z, X, Y] = tileOf(36.0, 74.5, 7); const t = await R2.tile(Z, X, Y, 'pk'); const g = await get(`/tiles/relief/${Z}/${X}/${Y}.png`);
  ok(t && sha(t.buf) === sha(g.b), 'deterministic: a second module instance returns the same bytes'); }

/* 404s */
for (const p of ['/tiles/relief/3/5/3.png', '/tiles/relief/13/5800/3300.png', '/tiles/relief/5/32/10.png', '/tiles/relief/5/10/32.png', '/tiles/relief/x/1/1.png', '/tiles/relief/5/1/1.jpg', '/tiles/relief/muted/3/0/0.png', '/tiles/relief/other/5/1/1.png'])
  { const g = await get(p); ok(g.r.status === 404, '404 for ' + p); }
/* a valid tile far from Pakistan (no DEM): 200, flat colour */
{ const g = await get('/tiles/relief/5/5/5.png'); const d = decode(g.b); let same = true; for (let i = 3; i < d.px.length; i += 3 * 97) if (d.px[i] !== d.px[0] || d.px[i + 1] !== d.px[1]) same = false;
  ok(g.r.status === 200 && same, 'tile beyond the DEM domain is a flat light tile (no error)'); }

/* outside-Pakistan style: Islamabad pixel (inside) full colour; same tile from the muted set is less saturated; an IIOJK pixel inside the
   DEM belt is muted in the main set */
{ const [Z, X, Y] = tileOf(33.68, 73.05, 9); const a = decode((await get(`/tiles/relief/${Z}/${X}/${Y}.png`)).b), m = decode((await get(`/tiles/relief/muted/${Z}/${X}/${Y}.png`)).b);
  const sa = meanSat(a.px), sm = meanSat(m.px); ok(sm < sa * 0.5, `muted set less saturated (mean saturation ${sa.toFixed(3)} -> ${sm.toFixed(3)})`);
  const [px1, py1] = pxOf(33.60, 73.10, 9); ok(sat(a.px, px1, py1) > 0.08, 'inside Pakistan pixel (Rawalpindi plains) keeps full colour, saturation ' + sat(a.px, px1, py1).toFixed(3)); }
if (DATA) { /* every 4th pixel of a z9 tile across the Line of Control east of Islamabad: pixels inside the AGN boundary (tehsil polygons
   without the IIOJK polygon) vs pixels outside it that still have DEM data (the ~5 km belt; flat no-data pixels excluded) */
  const T = JSON.parse(readFileSync(join(DATA, 'pk-tehsils.json'), 'utf8')).features.filter((f) => f.properties.province !== 'Indian Illegally Occupied Jammu Kashmir');
  const polys = []; for (const f of T) { const g = f.geometry; for (const rings of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) { let b = [999, 999, -999, -999]; for (const p of rings[0]) { b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])]; } polys.push({ rings, b }); } }
  const inside = (lo, la) => polys.some(({ rings, b }) => { if (lo < b[0] || lo > b[2] || la < b[1] || la > b[3]) return false; let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) c = !c; } return c; });
  const z = 9, [Z, X, Y] = tileOf(33.9, 74.0, z); const a = decode((await get(`/tiles/relief/${Z}/${X}/${Y}.png`)).b);
  let si = 0, ni = 0, so = 0, no = 0; const n = 2 ** z * 256;
  for (let py = 2; py < 256; py += 4) for (let px = 2; px < 256; px += 4) {
    const lo = (X * 256 + px + 0.5) / n * 360 - 180, la = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * (Y * 256 + py + 0.5) / n)));
    const i3 = (py * 256 + px) * 3; if (a.px[i3] === 0xf2 && a.px[i3 + 1] === 0xf1 && a.px[i3 + 2] === 0xed) continue;
    const s = sat(a.px, px, py); if (inside(lo, la)) { si += s; ni++; } else { so += s; no++; } }
  ok(ni > 50 && no > 50 && so / no < 0.5 * si / ni, `outside style across the Line of Control: inside mean saturation ${(si / ni).toFixed(3)} (n ${ni}) vs outside-with-DEM ${(so / no).toFixed(3)} (n ${no})`); }
/* missing DEM: no relief, no error */
{ const d = mkdtempSync(join(tmpdir(), 'relief-empty-')); const R0 = createRelief(d); const s0 = R0.status();
  let code = 0, hdr = {}, body = null; const res = { headersSent: false, writeHead(c, h) { code = c; hdr = h; this.headersSent = true; }, end(b) { body = b; } };
  const handled = R0.handle({}, res, '/tiles/relief/7/90/50.png'); await new Promise((r) => setTimeout(r, 50));
  ok(handled && s0.ready === false && code === 200 && hdr['x-relief'] === 'unavailable' && body && decode(body).w === 1, 'missing DEM: status not ready, tile is a 1x1 transparent PNG (' + s0.why + ')');
  rmSync(d, { recursive: true, force: true }); }

/* performance: 40 uncached tiles (z6-z12 around Pakistan, both styles), then 200 cached requests */
{ const cold = []; const list = [];
  for (const [la, lo] of [[24.9, 67.0], [31.5, 74.3], [34.0, 71.5], [30.2, 71.4], [35.9, 74.3]]) for (const z of [6, 8, 10, 12]) { const [Z, X, Y] = tileOf(la, lo, z); list.push(`/tiles/relief/${Z}/${X + 1}/${Y}.png`, `/tiles/relief/muted/${Z}/${X}/${Y + 1}.png`); }
  for (const p of list) { const g = await get(p); if (g.r.headers.get('x-relief') === 'miss') cold.push(g.ms); }
  const hot = []; for (let i = 0; i < 200; i++) { const g = await get(list[i % list.length]); hot.push(g.ms); }
  const q = (a, f) => { const s = [...a].sort((u, v) => u - v); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
  console.log(`PERF first render over HTTP: n=${cold.length} p50 ${q(cold, 0.5).toFixed(1)} ms p95 ${q(cold, 0.95).toFixed(1)} max ${Math.max(...cold).toFixed(1)} ms`);
  console.log(`PERF cached over HTTP: n=${hot.length} p50 ${q(hot, 0.5).toFixed(2)} ms p95 ${q(hot, 0.95).toFixed(2)} max ${Math.max(...hot).toFixed(2)} ms`);
  ok(cold.length >= 20 && q(cold, 0.95) <= 300, 'first render p95 <= 300 ms (INTEG281: >= 20 uncached of the 40; in the suite the start page tests render some of them first)');
  ok(q(hot, 0.95) <= 50, 'cached tile p95 <= 50 ms');
  const S2 = JSON.parse((await get('/tiles/relief/status')).b.toString()); console.log('PERF server-side', JSON.stringify(S2.stats), 'overview build ms', S2.overviewBuildMs); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
