/* v91.17.253 (11 Oct 2026, AIGEO laptop) · REBUILD data/basemap/pk-streets.pmtiles, which was not in the drive-failure restore.
   Same source as v91.17.116: the Protomaps daily basemap build (OpenStreetMap data, ODbL; Protomaps basemap schema), cut to the
   Pakistan box with HTTP range requests - the header and only the directories that cover the box first, then only the tiles inside
   the box, every zoom from 0 to the build's maximum. Node built-ins only: nothing is downloaded except the map data itself.
   The archive is written as <out>.tmp, read back with server/api/pmtiles.mjs (the reader the server uses) and byte-compared with the
   source on sample tiles at every zoom; only then does it replace data/basemap/pk-streets.pmtiles. The server picks the new file up
   by itself within a minute (it re-probes /tiles/streets every 60 s).
   node scripts/gen/extract_streets.mjs [--src <url of a .pmtiles build>] [--bbox w,s,e,n] [--out <file>] [--maxzoom z]   */
import { openSync, writeSync, closeSync, createReadStream, createWriteStream, renameSync, existsSync, unlinkSync, statSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { openPmtiles, zxyToTileId } from '../../server/api/pmtiles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BBOX = arg('--bbox', '60.5,23.4,78.0,37.2').split(',').map(Number);   // lon/lat box around Pakistan incl. AJK and Gilgit-Baltistan
const OUT = resolve(arg('--out', join(ROOT, 'data', 'basemap', 'pk-streets.pmtiles')));
const t0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)} s] ${m}`);

async function get(url, start, len, tries = 6) {
  for (let k = 1; ; k++) {
    try {
      const r = await fetch(url, { headers: { range: `bytes=${start}-${start + len - 1}`, 'user-agent': 'AI-GEO-NIGRAAN-local/91.17 street-map extract (aigeo360.com)' }, signal: AbortSignal.timeout(300000) });
      if (r.status !== 206 && !(r.status === 200 && start === 0)) throw new Error('HTTP ' + r.status);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length < len) throw new Error(`short read ${b.length} of ${len}`);
      return b.subarray(0, len);
    } catch (e) { if (k >= tries) throw e; await new Promise((ok) => setTimeout(ok, 3000 * k)); }
  }
}
async function latestBuild() {
  for (let d = 0; d < 8; d++) {
    const t = new Date(Date.now() - d * 864e5); const id = t.toISOString().slice(0, 10).replace(/-/g, '');
    const u = `https://build.protomaps.com/${id}.pmtiles`;
    try { const r = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(60000) }); if (r.ok) return u; } catch (_) {}
  }
  throw new Error('no Protomaps daily build found in the last 8 days');
}

/* ---- PMTiles v3 directories ---- */
function readVarint(b, p) { let v = 0, s = 1, x; do { x = b[p.i++]; v += (x & 0x7f) * s; s *= 128; } while (x & 0x80); return v; }
function parseDir(buf) {
  const p = { i: 0 }; const n = readVarint(buf, p); const E = new Array(n); let last = 0;
  for (let k = 0; k < n; k++) { last += readVarint(buf, p); E[k] = { tileId: last, runLength: 0, length: 0, offset: 0 }; }
  for (let k = 0; k < n; k++) E[k].runLength = readVarint(buf, p);
  for (let k = 0; k < n; k++) E[k].length = readVarint(buf, p);
  for (let k = 0; k < n; k++) { const v = readVarint(buf, p); E[k].offset = (v === 0 && k > 0) ? E[k - 1].offset + E[k - 1].length : v - 1; }
  return E;
}
function varint(out, v) { while (v >= 128) { out.push((v % 128) | 128); v = Math.floor(v / 128); } out.push(v); }
function serializeDir(E) {
  const o = []; varint(o, E.length); let last = 0;
  for (const e of E) { varint(o, e.tileId - last); last = e.tileId; }
  for (const e of E) varint(o, e.runLength);
  for (const e of E) varint(o, e.length);
  E.forEach((e, k) => varint(o, k > 0 && e.offset === E[k - 1].offset + E[k - 1].length ? 0 : e.offset + 1));
  return Buffer.from(o);
}

/* ---- tiles inside the box ---- */
const lon2x = (lon, n) => Math.min(n - 1, Math.max(0, Math.floor((lon + 180) / 360 * n)));
const lat2y = (lat, n) => { const r = lat * Math.PI / 180; return Math.min(n - 1, Math.max(0, Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n))); };
function boxTiles(maxZ) {
  const ids = []; const per = [];
  for (let z = 0; z <= maxZ; z++) {
    const n = 2 ** z, x0 = lon2x(BBOX[0], n), x1 = lon2x(BBOX[2], n), y0 = lat2y(BBOX[3], n), y1 = lat2y(BBOX[1], n);
    per.push({ z, x0, x1, y0, y1 });
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) ids.push(zxyToTileId(z, x, y));
  }
  return { ids: Float64Array.from(ids).sort(), per };
}

async function main() {
  const SRC = arg('--src', null) || await latestBuild();
  log('source ' + SRC + ' · box ' + BBOX.join(','));
  const head = await get(SRC, 0, 16384);
  if (head.toString('latin1', 0, 7) !== 'PMTiles' || head[7] !== 3) throw new Error('source is not a PMTiles v3 archive');
  const u64 = (o) => Number(head.readBigUInt64LE(o));
  const H = { rootOff: u64(8), rootLen: u64(16), metaOff: u64(24), metaLen: u64(32), leafOff: u64(40), dataOff: u64(56),
    ic: head[97], tc: head[98], tt: head[99], minZ: head[100], maxZ: head[101] };
  const unz = (b) => H.ic === 2 ? gunzipSync(b) : b;
  const maxZ = Math.min(H.maxZ, Number(arg('--maxzoom', H.maxZ)));
  const { ids, per } = boxTiles(maxZ);
  log(`zoom 0-${maxZ}: ${ids.length.toLocaleString()} tile positions in the box`);

  /* walk the directories: keep only entries that cover a wanted tile id; fetch the leaves those entries point to */
  const found = [];   // [tileId, srcOffset, length]
  let dirsFetched = 1;
  async function walk(E) {
    const leaves = [];
    for (let k = 0; k < E.length; k++) {
      const e = E[k]; const end = e.runLength > 0 ? e.tileId + e.runLength : (k + 1 < E.length ? E[k + 1].tileId : Infinity);
      let lo = 0, hi = ids.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ids[m] < e.tileId) lo = m + 1; else hi = m; }
      if (lo >= ids.length || ids[lo] >= end) continue;
      if (e.runLength > 0) { for (let i = lo; i < ids.length && ids[i] < end; i++) found.push([ids[i], e.offset, e.length]); }
      else leaves.push(e);
    }
    for (let i = 0; i < leaves.length; i += 8) {
      const part = await Promise.all(leaves.slice(i, i + 8).map((e) => get(SRC, H.leafOff + e.offset, e.length)));
      dirsFetched += part.length;
      for (const b of part) await walk(parseDir(unz(b)));
    }
  }
  await walk(parseDir(unz(head.subarray(H.rootOff, H.rootOff + H.rootLen))));
  found.sort((a, b) => a[0] - b[0]);
  log(`${dirsFetched} directories read; ${found.length.toLocaleString()} tiles exist in the box`);

  /* unique tile contents in source order, fetched in coalesced ranges, written to the data part in that order */
  const uniq = [...new Map(found.map((f) => [f[1], f[2]])).entries()].sort((a, b) => a[0] - b[0]);
  const chunks = []; let c = null;
  for (const [off, len] of uniq) {
    if (c && off - (c.start + c.len) <= 262144 && off + len - c.start <= 33554432) { c.len = off + len - c.start; c.tiles.push([off, len]); }
    else { c = { start: off, len, tiles: [[off, len]] }; chunks.push(c); }
  }
  const total = chunks.reduce((s, x) => s + x.len, 0);
  log(`${uniq.length.toLocaleString()} unique tiles, ${(uniq.reduce((s, x) => s + x[1], 0) / 1e9).toFixed(2)} GB, in ${chunks.length} requests (${(total / 1e9).toFixed(2)} GB transferred)`);
  mkdirSync(dirname(OUT), { recursive: true });
  const dataTmp = OUT + '.data.tmp'; const fd = openSync(dataTmp, 'w'); const newOff = new Map(); let pos = 0, done = 0, bytes = 0;
  const queue = chunks.slice(); const results = new Map(); let next = 0;
  async function worker() { while (queue.length) { while (results.size > 12) await new Promise((ok) => setTimeout(ok, 100)); const ch = queue.shift(); const b = await get(SRC, H.dataOff + ch.start, ch.len); results.set(ch, b); } }
  let failed = null; const workers = Array.from({ length: 4 }, () => worker().catch((e) => { failed = e; }));
  while (next < chunks.length) {   // write strictly in source order as chunks arrive
    const ch = chunks[next];
    if (!results.has(ch)) { if (failed) throw failed; await new Promise((ok) => setTimeout(ok, 50)); continue; }
    const b = results.get(ch); results.delete(ch);
    for (const [off, len] of ch.tiles) { writeSync(fd, b, off - ch.start, len); newOff.set(off, pos); pos += len; }
    next++; done++; bytes += ch.len;
    if (done % 25 === 0 || done === chunks.length) log(`  ${done}/${chunks.length} requests, ${(bytes / 1e9).toFixed(2)} GB`);
  }
  await Promise.all(workers); closeSync(fd);

  /* entries in tile-id order; consecutive ids with the same content become one run */
  const E = [];
  for (const [id, off, len] of found) {
    const o = newOff.get(off); const l = E[E.length - 1];
    if (l && l.offset === o && l.tileId + l.runLength === id) l.runLength++; else E.push({ tileId: id, offset: o, length: len, runLength: 1 });
  }
  let root, leafBuf = Buffer.alloc(0);
  const whole = gzipSync(serializeDir(E));
  if (whole.length <= 16384 - 127) root = whole;
  else {
    for (let size = 4096; ; size *= 2) {
      const R = [], L = []; let lo = 0;
      for (let i = 0; i < E.length; i += size) { const b = gzipSync(serializeDir(E.slice(i, i + size))); R.push({ tileId: E[i].tileId, offset: lo, length: b.length, runLength: 0 }); L.push(b); lo += b.length; }
      root = gzipSync(serializeDir(R)); leafBuf = Buffer.concat(L);
      if (root.length <= 16384 - 127) break;
    }
  }
  const srcMeta = await get(SRC, H.metaOff, u64(32)); let meta = {};
  try { meta = JSON.parse(unz(srcMeta).toString('utf8')); } catch (_) {}
  meta['agn:extract'] = { source: SRC, bbox: BBOX, maxzoom: maxZ, at: new Date().toISOString(), tool: 'nigraan-local/scripts/gen/extract_streets.mjs' };
  const metaBuf = gzipSync(Buffer.from(JSON.stringify(meta)));
  const h = Buffer.alloc(127); h.write('PMTiles', 0, 'latin1'); h[7] = 3;
  const W = (o, v) => h.writeBigUInt64LE(BigInt(v), o);
  const rootOff = 127, metaOff = rootOff + root.length, leafOff = metaOff + metaBuf.length, dataOff = leafOff + leafBuf.length;
  W(8, rootOff); W(16, root.length); W(24, metaOff); W(32, metaBuf.length); W(40, leafOff); W(48, leafBuf.length); W(56, dataOff); W(64, pos);
  W(72, found.length); W(80, E.length); W(88, uniq.length);
  h[96] = 1; h[97] = 2; h[98] = H.tc; h[99] = H.tt; h[100] = 0; h[101] = maxZ;
  h.writeInt32LE(Math.round(BBOX[0] * 1e7), 102); h.writeInt32LE(Math.round(BBOX[1] * 1e7), 106);
  h.writeInt32LE(Math.round(BBOX[2] * 1e7), 110); h.writeInt32LE(Math.round(BBOX[3] * 1e7), 114);
  h[118] = 6; h.writeInt32LE(Math.round(69.35 * 1e7), 119); h.writeInt32LE(Math.round(30.4 * 1e7), 123);
  const tmp = OUT + '.tmp'; const hf = openSync(tmp, 'w'); for (const b of [h, root, metaBuf, leafBuf]) writeSync(hf, b); closeSync(hf);
  await pipeline(createReadStream(dataTmp), createWriteStream(tmp, { flags: 'a' })); unlinkSync(dataTmp);
  log(`written ${tmp}: ${(statSync(tmp).size / 1e9).toFixed(2)} GB, ${E.length.toLocaleString()} entries, ${leafBuf.length ? 'root + leaf directories' : 'root directory only'}`);

  /* read it back with the server's own reader and compare sample tiles with the source, at every zoom */
  const P = openPmtiles(tmp); let checked = 0, bad = 0, missing = 0;
  const srcOf = new Map(found.map((f) => [f[0], f]));
  for (const r of per) {
    const xs = [...new Set([r.x0, r.x1, (r.x0 + r.x1) >> 1])], ys = [...new Set([r.y0, r.y1, (r.y0 + r.y1) >> 1])];
    for (const x of xs) for (const y of ys) {
      const id = zxyToTileId(r.z, x, y); const s = srcOf.get(id); const t = P.tile(r.z, x, y);
      if (!s) { if (t) bad++; else missing++; continue; }
      const want = await get(SRC, H.dataOff + s[1], s[2]); checked++;
      if (!t || Buffer.compare(t, want) !== 0) { bad++; console.log(`  MISMATCH z${r.z}/${x}/${y}`); }
    }
  }
  P.close();
  log(`read-back check: ${checked} tiles identical to the source${missing ? `, ${missing} positions empty in both` : ''}, ${bad} wrong`);
  if (bad || P.header.maxZoom !== maxZ || P.header.addressed !== found.length) { log('NOT INSTALLED: the check failed; ' + tmp + ' kept for inspection'); process.exit(1); }
  if (existsSync(OUT)) renameSync(OUT, OUT + '.old');
  renameSync(tmp, OUT);
  log(`street map installed: ${OUT} (${(statSync(OUT).size / 1e9).toFixed(2)} GB, zoom 0-${maxZ}, built ${meta['planetiler:buildtime'] || 'n/a'})`);
}
main().catch((e) => { console.error('STREET MAP NOT BUILT: ' + (e && e.stack || e)); process.exit(1); });
