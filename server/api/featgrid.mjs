/* ══ v91.17.72 · FEATURE GRID READER ═══════════════════════════════════════════════════════════════════════════════
   Reads the national 9-arc-second feature grid written by scripts/featgrid.py (data/feat/<band>.json + parts).
   value(band, lat, lon) -> number | null (null: outside the grid, no block, or nodata). Blocks are inflated on demand
   and kept in a small LRU; the index files are re-read when they change on disk. No native dependencies. */
import { readFileSync, existsSync, statSync, openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

/* ══ v91.17.269 · ONE GRID PER DATA FOLDER (PERF A3) ══════════════════════════════════════════════════════════════════════════════
   Measured on v268 (CHANGES.md, PERF): four modules each made their own reader of the same data/feat folder (the backend, the point
   heights in server.mjs, the past-30-days page and, lazily, the AI downscale), and each one parsed the 20 MB answer file
   data/cache/featgrid-memo.json at start (0.4-0.5 s each here, about three times that on the laptop) and wrote it back every 10 min
   with a synchronous JSON.stringify of up to 400 000 answers on the main thread (the recurring 1.7 s event-loop stalls of the
   laptop log). The answers are not worth keeping across a restart: with 100 x 100 blocks a new place reads every band in under a
   millisecond from the band files (measured 0.3 ms median, the same values). So: one reader per data folder (a later caller asking
   for a smaller block cache gets the shared, larger one: the values do not depend on it), the in-memory answers are kept, the disk
   copy is neither read nor written (the old file is listed in REMOVED.txt), and a band that is not installed is remembered for 30 s
   like an installed one instead of being looked for on disk at every value() call. */
const SHARED = new Map();
export function createFeatGrid(dataDir, { maxBlocks = 3000 } = {}) {
  const k = join(dataDir, 'feat'); const hit = SHARED.get(k);
  if (hit) { hit.grow(maxBlocks); return hit.api; }
  const g = makeFeatGrid(dataDir, maxBlocks); SHARED.set(k, g); return g.api;
}
function makeFeatGrid(dataDir, maxBlocks) {   /* v91.17.132 · 3000 blocks of 100 x 100 (about 60 MB; a 400 x 400 band file still reads, at 16 x the cost per block) */
  const dir = join(dataDir, 'feat');
  const idx = new Map();   /* band -> { stamp, j } */
  const lru = new Map();   /* key -> Int16Array */
  /* v91.17.269 · PERF A3 · the band part files stay open (one handle per part, reopened when the band's index file changes): a new
     place read every band's block with an open, a read and a close, and on the laptop (Windows, file scanning on open) the opens were
     most of the 40 ms a new place took over 118 bands (tests132 on the laptop, 13 Oct). Now one read per block. */
  const fds = new Map();   /* part file -> fd */
  const fdOf = (f) => { let fd = fds.get(f); if (fd == null) { fd = openSync(f, 'r'); fds.set(f, fd); } return fd; };
  const dropFds = (band) => { for (const [f, fd] of fds) if (f.startsWith(join(dir, band + '.p'))) { try { closeSync(fd); } catch (_) {} fds.delete(f); } };
  function index(band) {
    /* v91.17.91 · the index file is checked on disk at most every 5 s (a stat per value() call made a 120 x 120 map grid spend
       most of its time in the file system) */
    const c0 = idx.get(band); if (c0 && Date.now() - c0.checked < 30000) return c0.j;   /* v91.17.234 · 30 s (was 5 s; existsSync 1.3 s in a 150 s laptop profile) */
    const f = join(dir, band + '.json');
    if (!existsSync(f)) { idx.set(band, { stamp: null, j: null, checked: Date.now() }); return null; }
    const st = statSync(f).mtimeMs;
    const c = idx.get(band);
    if (c && c.stamp === st) { c.checked = Date.now(); return c.j; }
    let j = null; try { j = JSON.parse(readFileSync(f, 'utf8')); } catch { j = null; }
    idx.set(band, { stamp: st, j, checked: Date.now() });
    for (const k of [...lru.keys()]) if (k.startsWith(band + '|')) lru.delete(k);
    dropFds(band);
    return j;
  }
  function block(band, j, br, bc) {
    const key = band + '|' + j.built + '|' + br + ',' + bc;
    if (lru.has(key)) { const v = lru.get(key); lru.delete(key); lru.set(key, v); return v; }
    const e = j.blocks[br + ',' + bc]; if (!e) return null;
    const [part, off, len] = e; const buf = Buffer.alloc(len);
    const pf = join(dir, band + '.p' + part + '.bin');
    try { readSync(fdOf(pf), buf, 0, len, off); } catch (e) { const fd = fds.get(pf); fds.delete(pf); if (fd != null) try { closeSync(fd); } catch (_) {} throw e; }
    const raw = inflateSync(buf); const a = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    lru.set(key, a); while (lru.size > maxBlocks) lru.delete(lru.keys().next().value);
    return a;
  }
  /* v91.17.132 · SPEED (CEO 3 Oct "system too slow"). 89 bands share a 96-block cache, so a point needing all bands evicted the
     blocks the next point needed and every lookup inflated a 320 kB block again: 45 % of the server's busy time in one page load
     (profiled 3 Oct). A cell's static values never change while the band file is unchanged, so each answer is remembered per
     (band, file build, row, column); the block cache stays for new cells. 400 000 answers is about 40 MB at most. */
  const memo = new Map(); const MEMO_MAX = 400000;
  function value(band, lat, lon) {
    const j = index(band); if (!j) return null;
    const G = j.grid; const r = Math.floor((G.north - lat) / G.cell), c = Math.floor((lon - G.west) / G.cell);
    if (!(r >= 0 && r < G.rows && c >= 0 && c < G.cols)) return null;
    const mk = band + '|' + j.built + '|' + r + '|' + c; const hit = memo.get(mk); if (hit !== undefined) return hit;
    const B = G.block; const a = block(band, j, Math.floor(r / B), Math.floor(c / B));
    const v = a ? a[(r % B) * B + (c % B)] : null;
    const out = (v == null || v === j.nodata) ? null : v * j.scale + j.offset;
    memo.set(mk, out); if (memo.size > MEMO_MAX) { let n = 0; for (const k of memo.keys()) { memo.delete(k); if (++n >= 50000) break; } }
    return out;
  }
  function at(lat, lon, bands) { const out = {}; for (const b of (bands || list())) out[b] = value(b, lat, lon); return out; }
  function list() { return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []; }
  function meta(band) { const j = index(band); if (!j) return null; const { blocks, ...m } = j; return m; }
  return { api: { value, at, list, meta }, grow: (n) => { if (n > maxBlocks) maxBlocks = n; } };
}
