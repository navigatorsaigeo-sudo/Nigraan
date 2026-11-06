/* ══ v91.17.152 · OBSERVED FLOOD WATER (satellite, 3-day composite, 250 m) ══════════════════════════════════════════════════
   Why: the 2022 weekly flood maps (UNOSAT VIIRS, 9 windows Jul-Oct) show that once the plains flood, the water stays for weeks:
   of the tehsils flooded in 25-31 Aug 2022, 85 % were still flooded a month later and 78 % after seven weeks, while the rain of
   the last 1-7 days no longer explained where water stood (AUC 0.29-0.37 after the peak). A rain-driven daily flood level falls back
   to Normal while fields and settlements are still under water. An observation of standing water is the direct answer.
   What: NASA LANCE MODIS NRT Global Flood Product, 3-day composite (MCDWD_L3_F3_NRT, collection 6.1; Terra + Aqua, 250 m;
   terrain shadow and HAND-masked pixels removed by the producer). Classes used as published: 0 no water, 1 normal water (the
   product's reference water), 2 recurring seasonal flood, 3 flood (unusual), 255 insufficient data (cloud, shadow, masked).
   No threshold is added here: each tehsil gets the pixel shares of each class, and the share NOT seen (255) is always shown
   beside them, so "no flood seen" under cloud is never read as "no flood".
   Tiles h24v05, h25v05, h24v06, h25v06 cover Pakistan. Pixels are assigned to tehsils by the run table data/floodobs-runs.bin
   (pixel centre inside the polygon; built by scripts/floodstudy/floodobs_runs.py).
   Access: the user's Earthdata token (EARTHDATA_TOKEN or nigraan-local/earthdata.key), sent only to NASA EOSDIS hosts, never
   logged, never sent to the browser. NIGRAAN_FLOODOBS=0 switches it off.
   History: one compact file per day in data/floodobs-history/ so the persistence of standing water can be calibrated next season. */
import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';
import { inflateSync } from 'node:zlib';

const CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id=C2019424090-LANCEMODIS&bounding_box=60.5,23.5,78,37.5&page_size=40&sort_key=-start_date';
const TRUSTED = /^https:\/\/([\w-]+\.)*(eosdis\.nasa\.gov|earthdata\.nasa\.gov)\//i;
const TILES = ['h24v05', 'h25v05', 'h24v06', 'h25v06'];

function extractToken(s) { const m = String(s || '').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g); return m ? m.sort((a, b) => b.length - a.length)[0] : null; }
function tokenExp(t) { try { const p = JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); return p.exp ? new Date(p.exp * 1000).toISOString().slice(0, 10) : null; } catch (_) { return null; } }

/* minimal reader for the producer's GeoTIFF: little- or big-endian classic TIFF, one 8-bit band, tiled, deflate (8 / 32946) or none */
export function readTiffU8(buf) {
  const le = buf[0] === 0x49; const u16 = (o) => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o); const u32 = (o) => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
  if (u16(2) !== 42) throw new Error('not a classic TIFF');
  const ifd = u32(4), n = u16(ifd), tags = {};
  const size = { 1: 1, 3: 2, 4: 4, 16: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), sz = (size[type] || 1) * cnt, off = sz <= 4 ? e + 8 : u32(e + 8);
    const rd = (k) => type === 3 ? u16(off + 2 * k) : type === 4 ? u32(off + 4 * k) : buf[off + k];
    if (type === 3 || type === 4 || type === 1) tags[tag] = cnt === 1 ? rd(0) : Array.from({ length: cnt }, (_, k) => rd(k));
  }
  const W = tags[256], H = tags[257], tw = tags[322], th = tags[323], comp = tags[259] || 1;
  if (tags[258] !== 8 || !tw || !th) throw new Error('unsupported TIFF layout');
  if (tags[317] && tags[317] !== 1) throw new Error('predictor not supported');
  const offs = [].concat(tags[324]), lens = [].concat(tags[325]); const out = new Uint8Array(W * H); const across = Math.ceil(W / tw);
  for (let t = 0; t < offs.length; t++) {
    const raw = buf.subarray(offs[t], offs[t] + lens[t]); const px = comp === 8 || comp === 32946 ? inflateSync(raw) : comp === 1 ? raw : null;
    if (!px) throw new Error('compression ' + comp + ' not supported');
    const ty = Math.floor(t / across) * th, tx = (t % across) * tw;
    for (let y = 0; y < th && ty + y < H; y++) { const w = Math.min(tw, W - tx); out.set(px.subarray(y * tw, y * tw + w), (ty + y) * W + tx); }
  }
  return { W, H, data: out };
}

export function createFloodObs(app, dataDir) {
  const root = new URL('../../', import.meta.url);
  const on = () => process.env.NIGRAAN_FLOODOBS !== '0';
  const latestFile = join(dataDir, 'floodobs-latest.json'), histDir = join(dataDir, 'floodobs-history');
  let RUNS = null, HDR = null, LATEST = null; const state = { lastCheck: null, lastError: null, busy: false };
  try { LATEST = JSON.parse(readFileSync(latestFile, 'utf8')); } catch (_) {}
  function token() {
    if (process.env.EARTHDATA_TOKEN) return extractToken(process.env.EARTHDATA_TOKEN);
    for (const n of ['earthdata.key', 'earthdata.key.txt']) { try { const t = extractToken(readFileSync(new URL(n, root), 'utf8')); if (t) return t; } catch (_) {} }
    return null;
  }
  function runs() {
    if (RUNS) return true;
    try { HDR = JSON.parse(readFileSync(join(dataDir, 'floodobs-runs.json'), 'utf8')); RUNS = readFileSync(join(dataDir, 'floodobs-runs.bin')); return true; } catch (_) { return false; }
  }
  async function get(url, auth) {
    let u = url;
    for (let hop = 0; hop < 5; hop++) {   /* redirects followed by hand: the token goes only to NASA EOSDIS / Earthdata hosts */
      if (auth && !TRUSTED.test(u)) throw new Error('refused to send the token to ' + new URL(u).host);
      const r = await fetch(u, { headers: auth ? { Authorization: 'Bearer ' + auth } : {}, redirect: 'manual', signal: AbortSignal.timeout(180000) });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u).href; continue; }
      if (!r.ok) throw new Error('http ' + r.status + ' from ' + new URL(u).host);
      return Buffer.from(await r.arrayBuffer());
    }
    throw new Error('too many redirects');
  }
  async function aggregate(grid) {   /* yields to the event loop every 400 rows so served requests are not held up */   /* grid: Map tile -> Uint8Array 4800x4800 */
    const n = HDR.units.length, C = new Float64Array(n * 5), FK = new Float64Array(n), RK = new Float64Array(n); let o = 0; const k0 = (HDR.pixelDeg * 111.32) ** 2;
    for (let r = 0; r < HDR.rows; r++) {
      if (r % 400 === 0) await new Promise((ok) => setImmediate(ok));
      const k = RUNS.readUInt16LE(o); o += 2; const R = HDR.row0 + r, ty = R < 4800 ? 'v05' : 'v06', yy = R % 4800; const pk = k0 * Math.cos((40 - (R + 0.5) * HDR.pixelDeg) * Math.PI / 180);   /* pixel area at this row */
      for (let j = 0; j < k; j++) {
        const a = RUNS.readUInt16LE(o), l = RUNS.readUInt16LE(o + 2), u = RUNS.readUInt16LE(o + 4); o += 6;
        for (let c = HDR.col0 + a; c < HDR.col0 + a + l; c++) {
          const tile = grid.get((c < 4800 ? 'h24' : 'h25') + ty); const v = tile ? tile[yy * 4800 + (c % 4800)] : 255;
          C[u * 5 + (v === 0 ? 0 : v === 1 ? 1 : v === 2 ? 2 : v === 3 ? 3 : 4)]++; if (v === 3) FK[u] += pk; else if (v === 2) RK[u] += pk;
        }
      }
    }
    const units = {}; const nat = [0, 0, 0, 0, 0]; let natF = 0, natR = 0;
    for (let i = 0; i < n; i++) {
      const c = [0, 1, 2, 3, 4].map((k) => C[i * 5 + k]); const tot = c.reduce((s, x) => s + x, 0); c.forEach((x, k) => nat[k] += x);
      const seen = tot - c[4];
      units[HDR.units[i]] = { pixels: tot, seenShare: tot ? +(seen / tot).toFixed(4) : null, floodShareOfSeen: seen ? +(c[3] / seen).toFixed(5) : null,
        recurringShareOfSeen: seen ? +(c[2] / seen).toFixed(5) : null, normalWaterShareOfSeen: seen ? +(c[1] / seen).toFixed(5) : null,
        floodKm2: +FK[i].toFixed(1), recurringKm2: +RK[i].toFixed(1), counts: c }; natF += FK[i]; natR += RK[i];
    }
    return { units, national: { counts: nat, seenShare: +((nat[0] + nat[1] + nat[2] + nat[3]) / nat.reduce((s, x) => s + x, 0)).toFixed(4), floodKm2: +natF.toFixed(0), recurringKm2: +natR.toFixed(0) } };
  }
  async function refresh(force = false) {
    if (!on() || state.busy) return { ok: false, why: state.busy ? 'already running' : 'switched off (NIGRAAN_FLOODOBS=0)' };
    const T = token(); if (!T) return { ok: false, why: 'no Earthdata token: put it in nigraan-local/earthdata.key' };
    if (!runs()) return { ok: false, why: 'data/floodobs-runs.bin is not in this install' };
    state.busy = true; state.lastCheck = new Date().toISOString();
    try {
      const q = JSON.parse((await get(CMR, null)).toString('utf8'));
      const byDay = {}; for (const e of q.feed.entry || []) { const u = (e.links || []).map((l) => l.href).find((h) => /\.tif$/.test(h)); if (!u) continue; const m = u.match(/\.A(\d{7})\.(h\d\dv\d\d)\./); if (!m) continue; (byDay[m[1]] = byDay[m[1]] || {})[m[2]] = u; }
      const day = Object.keys(byDay).sort().reverse().find((d) => TILES.every((t) => byDay[d][t]));
      if (!day) throw new Error('no day with all four Pakistan tiles in the catalogue');
      if (!force && LATEST && LATEST.productDay === day) { state.lastError = null; return { ok: true, unchanged: true, productDay: day }; }
      const grid = new Map();
      for (const t of TILES) { const b = await get(byDay[day][t], T); const r = readTiffU8(b); if (r.W !== 4800 || r.H !== 4800) throw new Error('unexpected tile size ' + r.W + 'x' + r.H); grid.set(t, r.data); await new Promise((ok) => setImmediate(ok)); }
      const A = await aggregate(grid); const y = +day.slice(0, 4), doy = +day.slice(4); const end = new Date(Date.UTC(y, 0, doy)); const start = new Date(end.getTime() - 2 * 864e5);
      LATEST = { schema: 'agn.floodobs.v1', product: 'MODIS NRT Global Flood Product, 3-day composite (MCDWD_L3_F3_NRT 6.1, NASA LANCE)', productDay: day,
        window: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }, fetchedAt: new Date().toISOString(),
        classes: { 0: 'no water', 1: 'normal water (reference)', 2: 'recurring seasonal flood', 3: 'flood (unusual)', 255: 'not seen (cloud, shadow, masked)' },
        caveats: ['250 m pixels: water in narrow channels, streets and small fields is missed', 'cloud hides water; the not-seen share is part of every answer', 'thin cloud shadow and dark burnt or wet soil can read as water; the 3-day composite and the producer\'s terrain and HAND masks reduce but do not remove this', 'near-real-time product: the producer may reprocess the same day'],
        ...A };
      writeFileSync(latestFile + '.tmp', JSON.stringify(LATEST)); renameSync(latestFile + '.tmp', latestFile);
      mkdirSync(histDir, { recursive: true });
      const compact = { productDay: day, window: LATEST.window, national: A.national, units: Object.fromEntries(Object.entries(A.units).map(([k, v]) => [k, v.counts])) };
      writeFileSync(join(histDir, end.toISOString().slice(0, 10) + '.json'), JSON.stringify(compact));
      state.lastError = null; return { ok: true, productDay: day, national: A.national };
    } catch (e) { state.lastError = e.message; return { ok: false, why: e.message }; }
    finally { state.busy = false; }
  }
  function unit(uid) {
    if (!LATEST) return { ok: false, why: 'no satellite flood map fetched yet' };
    const u = LATEST.units[uid]; if (!u) return { ok: false, why: 'no such tehsil in the flood map' };
    const ageDays = (Date.now() - Date.parse(LATEST.window.end + 'T00:00:00Z')) / 864e5;
    return { ok: true, unit: uid, window: LATEST.window, productDay: LATEST.productDay, ageDays: +ageDays.toFixed(1), stale: ageDays > 4, ...u, product: LATEST.product, caveats: LATEST.caveats };
  }
  function national() {
    if (!LATEST) return { ok: false, why: 'no satellite flood map fetched yet' };
    const ageDays = (Date.now() - Date.parse(LATEST.window.end + 'T00:00:00Z')) / 864e5;   /* v91.17.157 · audit: the same 4-day stale rule as unit() */
    return { ok: true, product: LATEST.product, productDay: LATEST.productDay, window: LATEST.window, ageDays: +ageDays.toFixed(1), stale: ageDays > 4, fetchedAt: LATEST.fetchedAt, national: LATEST.national, classes: LATEST.classes, caveats: LATEST.caveats,
      units: Object.fromEntries(Object.entries(LATEST.units).map(([k, v]) => [k, [v.floodShareOfSeen, v.seenShare, v.recurringShareOfSeen]])), unitsFields: ['flood share of seen pixels', 'seen share', 'recurring-flood share of seen pixels'] };
  }
  function history() { try { return readdirSync(histDir).filter((f) => f.endsWith('.json')).sort(); } catch (_) { return []; } }
  function status() { const T = token(); return { on: on(), token: T ? { present: true, expires: tokenExp(T) } : { present: false }, runs: runs(), latest: LATEST ? { productDay: LATEST.productDay, window: LATEST.window, fetchedAt: LATEST.fetchedAt } : null, historyDays: history().length, ...state }; }
  function start() { if (!on()) return; schedule(app, 'floodobs', 6 * 3600e3, () => refresh(), { firstMs: 90000, heavy: true, label: 'observed flood extent' }); }
  function route(p, url) {
    if (p === '/api/floodobs') return { status: 200, body: national() };
    if (p === '/api/floodobs/unit') { const r = unit(String(url.searchParams.get('u') || '')); return { status: r.ok ? 200 : 404, body: r }; }
    if (p === '/api/floodobs/status') return { status: 200, body: status() };
    return null;
  }
  return { refresh, unit, national, status, start, route, latest: () => LATEST };
}
