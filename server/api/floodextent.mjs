/* ══ v283 WS9 · RIVER FLOOD EXTENT FORECAST (INDICATIVE) ══════════════════════════════════════════════════════════════════════════
   Which ground along the major rivers the forecast river flow would put under water, day by day over the river forecast (30 days),
   with an uncertainty band from the ensemble.

   How (built offline, scripts/gen/flood_extent/fx_grid.py, fx_calibrate.py, fx_pack.py; evidence in data/flood-extent/fx-model.json):
     · every 250 m cell near a major river carries its height above the river (fx_h) and the forecast reach it belongs to (fx_r);
     · per reach, the water height above the river is h = a(reach) + b · ln(Q / Q2): Q the forecast flow at the reach, Q2 the model's
       own 2-year flow there. a and b were fitted to the observed flood extents of 2010, 2014 and 2022 (area matching per reach) and the
       whole method was tested on 2025, which no fit saw, against a fixed-height baseline (CSI, hit rate, false-alarm area);
     · a cell is drawn when its height above the river is below h: class 3 'likely' (below h at the ensemble's low flow q10),
       2 'expected' (median), 1 'possible' (high flow q90).
   Served only when fx-model.json says the held-out test passed (served: true). Otherwise every answer is 'not available' with the reason.
   Never drawn: rain ponding, hill-torrent and urban flash floods (no observed extent to test them), cells outside the river domain
   (answered 'not assessed', never 'dry'), reaches the river model does not represent (river-rarity.json rule shared with riverprob.mjs),
   reaches without training data, and any day of a forecast older than 30 h.
   Light: the lookup bands are read in 100 x 100 blocks on demand (LRU); a tile is 65 536 comparisons; tiles are cached per forecast run.
   Product type: Indicative. Not an official flood warning. */
import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

import { RIVER_STALE_H as STALE_H } from './dataage.mjs';   /* v283.36 item 29: the one river rule */
const CLASS_WORDS = { 3: 'likely', 2: 'expected', 1: 'possible' };

export function createFloodExtent(app, dataDir) {
  const dir = join(dataDir, 'flood-extent');
  let M = null, mStamp = null, mErr = null, checked = 0;
  function model() {
    const now = Date.now(); if (now - checked < 30e3) return M; checked = now;
    try { const f = join(dir, 'fx-model.json'); const s = statSync(f).mtimeMs; if (s !== mStamp) { M = JSON.parse(readFileSync(f, 'utf8')); mStamp = s; mErr = null; closeBands(); lru.clear(); tiles.clear(); } }
    catch (e) { M = null; mStamp = null; mErr = e.code === 'ENOENT' ? 'the river flood extent tables are not installed (data/flood-extent)' : e.message; }
    return M;
  }
  let rar = null, rarStamp = null;
  function rarity() { try { const f = join(dataDir, 'river-rarity.json'); const s = statSync(f).mtimeMs; if (s !== rarStamp) { rar = JSON.parse(readFileSync(f, 'utf8')); rarStamp = s; } } catch { rar = null; } return rar; }

  /* ── band reader (feature-grid block format) ── */
  const bands = new Map(), lru = new Map();
  function closeBands() { for (const b of bands.values()) if (b && b.fd != null) try { closeSync(b.fd); } catch (_) {} bands.clear(); }
  function band(name) {
    if (bands.has(name)) return bands.get(name);
    let b = null;
    try { const j = JSON.parse(readFileSync(join(dir, name + '.json'), 'utf8')); b = { j, fd: openSync(join(dir, name + '.p0.bin'), 'r') }; } catch { b = null; }
    bands.set(name, b); return b;
  }
  function block(name, br, bc) {
    const key = name + '|' + mStamp + '|' + br + ',' + bc;
    if (lru.has(key)) { const v = lru.get(key); lru.delete(key); lru.set(key, v); return v; }
    const b = band(name); if (!b) return undefined;
    const e = b.j.blocks[br + ',' + bc]; let a = null;
    if (e) { const buf = Buffer.alloc(e[2]); readSync(b.fd, buf, 0, e[2], e[1]); const raw = inflateSync(buf); a = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2); }
    lru.set(key, a); while (lru.size > 400) lru.delete(lru.keys().next().value);
    return a;
  }
  function cellAt(lat, lon) {
    const b = band('fx_h'); if (!b) return undefined;
    const g = b.j.grid, row = Math.floor((g.north - lat) / g.cell), col = Math.floor((lon - g.west) / g.cell);
    if (row < 0 || col < 0 || row >= g.rows || col >= g.cols) return null;
    const br = Math.floor(row / g.block), bc = Math.floor(col / g.block), k = (row - br * g.block) * g.block + (col - bc * g.block);
    const h = block('fx_h', br, bc); if (!h || h[k] === -32768) return null;
    const r = block('fx_r', br, bc); if (!r || r[k] === -32768) return null;
    return { hM: h[k] / 10, reach: r[k] };
  }

  /* ── water height per reach and day ── */
  function hOf(Mo, rid, q) {
    const R = Mo.reaches[rid]; if (!R || !(q > 0) || !(R.q2 > 0)) return null;
    const x = Math.log(q / R.q2), m = Mo.models[Mo.chosen];
    const a = Mo.chosen === 'M2' ? m.a[rid] : m.a; if (!Number.isFinite(a)) return null;
    return a + m.b * x;
  }
  function areaAt(R, h) {   /* km² of the reach domain below h, from the precomputed lookup (0.5 m steps, linear between) */
    const L = R.areaLookup, X = L.hM, Y = L.km2; if (h == null) return null;
    if (h <= X[0]) return Y[0]; if (h >= X[X.length - 1]) return Y[Y.length - 1];
    const i = Math.floor((h - X[0]) / 0.5), t = (h - X[i]) / 0.5; return Math.round(Y[i] + t * (Y[i + 1] - Y[i]));
  }
  function reachWithheld(Mo, rid) {
    const RR = rarity(); const r = RR && RR.reaches ? RR.reaches[rid] : null;
    if (r && (r.fitRefused || r.modelRepresentsRiver === false || (r.gaugeCheck && /under-call/.test(r.gaugeCheck.verdict || '')))) return 'the river model does not represent this reach well enough';
    if (Mo.chosen === 'M2' && !Number.isFinite((Mo.models.M2.a || {})[rid])) return 'no observed flood extent to calibrate this reach';
    if (!(Mo.reaches[rid] && Mo.reaches[rid].trainRows > 0)) return 'no observed flood extent to calibrate this reach';
    return null;
  }
  const readyErr = () => {
    const Mo = model(); if (!Mo) return { ready: false, status: 'not available', why: mErr || 'no extent model' };
    if (process.env.NIGRAAN_FLOODEXTENT === '0') return { ready: false, status: 'not available', why: 'switched off (NIGRAAN_FLOODEXTENT=0)' };
    if (!Mo.served) return { ready: false, status: 'not available', productType: 'Indicative', why: 'the flood extent method did not pass its test on a flood year it never saw: ' + (Mo.why || []).join('; '), evidence: evidence(Mo) };
    if (!app || !app.flood || !app.flood.forecastDays) return { ready: false, status: 'not available', why: 'the river forecast is not running' };
    return null;
  };
  function evidence(Mo) { return { heldOutEvent: Mo.heldOut, trainEvents: Mo.train, test: Mo.test2025, csiGain: Mo.csiGain2025, chosen: Mo.chosen, heightBasis: Mo.heightBasisText, domainKm: Mo.domainKm }; }

  /* the water heights of every served reach for forecast day `day` (0 = today), q10 / median / q90 */
  function dayHeights(day) {
    const e = readyErr(); if (e) return e;
    const Mo = model(); const out = {}; let date = null, at = null, stale = 0;
    for (const rid of Mo.reachOrder) {
      const w = reachWithheld(Mo, rid); if (w) { out[rid] = { why: w }; continue; }
      const F = app.flood.forecastDays(rid);
      if (!F || !F.days || !F.days.length) { out[rid] = { why: 'no river forecast for this reach' }; continue; }
      const ageH = (Date.now() - Date.parse(F.at)) / 3600e3;
      if (!(ageH <= STALE_H)) { out[rid] = { why: 'the river forecast for this reach is ' + (Number.isFinite(ageH) ? Math.round(ageH) + ' h' : 'of unknown age') + ' old' }; stale++; continue; }
      const d = F.days[day]; if (!d || !Array.isArray(d.q)) { out[rid] = { why: 'no ensemble flow for this day' }; continue; }
      date = date || d.date; at = at || F.at;
      const h = d.q.map((q) => hOf(Mo, rid, q)); const R = Mo.reaches[rid];
      out[rid] = { date: d.date, flowM3s: d.q, waterAboveRiverM: h.map((v) => v == null ? null : Math.round(v * 10) / 10), floodedKm2: h.map((v) => areaAt(R, v)) };
    }
    return { ready: true, productType: 'Indicative', day, date, forecastAt: at, staleReaches: stale, reaches: out };
  }

  function national(day = 0) {
    const H = dayHeights(day); if (!H.ready) return H;
    const Mo = model(); let k10 = 0, k50 = 0, k90 = 0, drawn = 0;
    for (const v of Object.values(H.reaches)) if (v.floodedKm2) { drawn++; k10 += v.floodedKm2[0] || 0; k50 += v.floodedKm2[1] || 0; k90 += v.floodedKm2[2] || 0; }
    return { ...H, version: Mo.version, drawnReaches: drawn, floodedKm2: { likely: k10, expected: k50, possible: k90 },
      classes: { 3: 'likely: under water even at the low ensemble flow', 2: 'expected: under water at the median flow', 1: 'possible: under water only at the high ensemble flow' },
      evidence: evidence(Mo), limits: Mo.limits, tiles: '/api/flood/extent/tile/' + day + '/{z}/{x}/{y}.png',
      disclaimer: 'Indicative river flood extent from the GloFAS (Copernicus CEMS) river forecast and the terrain height above the major rivers, calibrated on past flood extents. River floods on the major rivers only; embankments, breaches, drains, rain ponding and flash floods are not modelled. Not an official flood warning.' };
  }

  function point(lat, lon, day = 0) {
    lat = Number(lat); lon = Number(lon); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ready: false, why: 'no coordinate' };
    const H = dayHeights(day); if (!H.ready) return H;
    const Mo = model(); const c = cellAt(lat, lon);
    if (c === undefined) return { ready: false, status: 'not available', why: 'the extent lookup bands are not installed' };
    if (c === null) return { ready: true, productType: 'Indicative', status: 'not assessed', why: 'outside the river flood domain (more than ' + Mo.domainKm + ' km from a major river, or no terrain): river flooding is not drawn here, which does not mean dry' };
    const rid = Mo.reachOrder[c.reach], v = H.reaches[rid];
    if (!v || !v.waterAboveRiverM) return { ready: true, productType: 'Indicative', status: 'not assessed', reach: rid, why: (v && v.why) || 'no forecast for this reach' };
    const w = v.waterAboveRiverM, cls = w[0] != null && c.hM < w[0] ? 3 : w[1] != null && c.hM < w[1] ? 2 : w[2] != null && c.hM < w[2] ? 1 : 0;
    return { ready: true, productType: 'Indicative', date: v.date, reach: rid, heightAboveRiverM: c.hM, waterAboveRiverM: w, class: cls, word: CLASS_WORDS[cls] || 'not reached',
      depthIndicativeM: w.map((x) => x == null ? null : Math.max(0, Math.round((x - c.hM) * 10) / 10)), limits: Mo.limits };
  }

  /* ── PNG tiles (web mercator), palette PNG with transparency ── */
  const PAL = [[0, 0, 0, 0], [158, 202, 225, 150], [66, 146, 198, 185], [8, 69, 148, 215]];
  function png(w, h, idx) {
    const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; idx.copy ? idx.copy(raw, y * (w + 1) + 1, y * w, y * w + w) : raw.set(idx.subarray(y * w, y * w + w), y * (w + 1) + 1); }
    const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(PAL.flatMap((p) => p.slice(0, 3)))),
      chunk('tRNS', Buffer.from(PAL.map((p) => p[3]))), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  }
  const tiles = new Map();
  function tile(day, z, x, y) {
    z |= 0; x |= 0; y |= 0; day |= 0;
    if (z < 5 || z > 13 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return { status: 400, body: { error: 'tile out of range (zoom 5-13)' } };
    const H = dayHeights(day); if (!H.ready) return { status: 503, body: H };
    const Mo = model(); const key = [day, H.forecastAt, z, x, y].join('/');
    if (tiles.has(key)) return { status: 200, type: 'image/png', body: tiles.get(key), headers: { 'X-Product-Type': 'Indicative' } };
    const W = (Array.isArray(Mo.reachOrder) ? Mo.reachOrder : []).map((rid) => { const v = H.reaches[rid]; return v && v.waterAboveRiverM ? v.waterAboveRiverM : null; });
    const n = 2 ** z, idx = new Uint8Array(256 * 256);
    const b = band('fx_h'); if (!b) return { status: 503, body: { ready: false, status: 'not available', why: 'the extent lookup bands are not installed' } };
    const g = b.j.grid, cols = new Int32Array(256);
    for (let px = 0; px < 256; px++) cols[px] = Math.floor(((x + (px + 0.5) / 256) / n * 360 - 180 - g.west) / g.cell);
    for (let py = 0; py < 256; py++) {
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + (py + 0.5) / 256) / n))) * 180 / Math.PI;
      const row = Math.floor((g.north - lat) / g.cell); if (row < 0 || row >= g.rows) continue;
      const br = Math.floor(row / g.block), rk = (row - br * g.block) * g.block;
      let lastBc = -1, hb = null, rb = null;
      for (let px = 0; px < 256; px++) {
        const col = cols[px]; if (col < 0 || col >= g.cols) continue;
        const bc = Math.floor(col / g.block);
        if (bc !== lastBc) { lastBc = bc; hb = block('fx_h', br, bc); rb = hb ? block('fx_r', br, bc) : null; }
        if (!hb || !rb) continue;
        const k = rk + (col - bc * g.block), hv = hb[k]; if (hv === -32768) continue;
        const w = W[rb[k]]; if (!w) continue;
        const hM = hv / 10;
        idx[py * 256 + px] = w[0] != null && hM < w[0] ? 3 : w[1] != null && hM < w[1] ? 2 : w[2] != null && hM < w[2] ? 1 : 0;
      }
    }
    const buf = png(256, 256, Buffer.from(idx.buffer));
    tiles.set(key, buf); while (tiles.size > 600) tiles.delete(tiles.keys().next().value);
    return { status: 200, type: 'image/png', body: buf, headers: { 'X-Product-Type': 'Indicative' } };
  }

  function status() {
    const Mo = model(); if (!Mo) return { ready: false, why: mErr || 'no extent model' };
    return { ready: !!Mo.served, served: !!Mo.served, why: Mo.why, version: Mo.version, built: Mo.built, productType: 'Indicative', bandsInstalled: !!band('fx_h') && !!band('fx_r'), evidence: evidence(Mo) };
  }

  /* routes (wired by the API index: GET /api/flood/extent, /api/flood/extent/point, /api/flood/extent/tile/{day}/{z}/{x}/{y}.png) */
  function route(p, url) {
    if (p === '/api/flood/extent') { const d = Number(url.searchParams.get('day') || 0); if (!Number.isInteger(d) || d < 0 || d > 30) return { status: 400, body: { error: 'day must be an integer 0-30' } }; const r = national(d); return { status: r.ready ? 200 : 503, body: r }; }
    if (p === '/api/flood/extent/status') return { status: 200, body: status() };
    if (p === '/api/flood/extent/point') { const d = Number(url.searchParams.get('day') || 0); if (!Number.isInteger(d) || d < 0 || d > 30) return { status: 400, body: { error: 'day must be an integer 0-30' } }; const r = point(url.searchParams.get('lat'), url.searchParams.get('lon'), d); return { status: r.ready ? 200 : 503, body: r }; }
    const m = /^\/api\/flood\/extent\/tile\/(\d+)\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(p);
    if (m) { if (Number(m[1]) > 30) return { status: 400, body: { error: 'day must be 0-30' } }; return tile(+m[1], +m[2], +m[3], +m[4]); }
    return null;
  }
  function close() { closeBands(); lru.clear(); tiles.clear(); }
  return { national, point, tile, status, route, dayHeights, cellAt, close };
}
