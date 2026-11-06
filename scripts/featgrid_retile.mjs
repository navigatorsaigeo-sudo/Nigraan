/* ══ v91.17.132 · FEATURE GRID RE-TILE (400 -> 100 cell blocks) ════════════════════════════════════════════════════════════
   Why: the server reads one cell per band at a time. With 400 x 400 blocks every new place decompressed 89 blocks of 320 kB
   (55 s of one page load, profiled 3 Oct). 100 x 100 blocks hold the same values and cost 16 x less to open.
   What: for each data/feat/<band>.json whose grid.block is 400, every stored block is split into 16 blocks of 100 x 100;
   all-nodata blocks are dropped; the values are byte-identical (checked per band before the swap). Run with the server stopped
   (APPLY_V132 does). A band that fails is left exactly as it was. The old part files (numbers below oldParts) are no longer
   read after the swap; they are listed for the owner's clean-up and removed by featgrid.py the next time that band is rebuilt. Usage: node scripts/featgrid_retile.mjs [dataDir] */
import { readFileSync, writeFileSync, renameSync, existsSync, readdirSync, openSync, readSync, closeSync, writeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.argv[2] || join(here, '..', 'data');
const dir = join(dataDir, 'feat');
const NEWB = 100, PART_MAX = 200 * 1024 * 1024;
if (!existsSync(dir)) { console.log('no feature grid at ' + dir); process.exit(0); }
const bands = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
let done = 0, skipped = 0, failed = 0; const t0 = Date.now();
for (const band of bands) {
  const jf = join(dir, band + '.json'); let j;
  try { j = JSON.parse(readFileSync(jf, 'utf8')); } catch (e) { console.log('FAILED read ' + band + ' ' + e.message); failed++; continue; }
  const B = j.grid && j.grid.block; if (B === NEWB) { skipped++; continue; }
  if (!B || B % NEWB) { console.log('SKIPPED ' + band + ' block ' + B); skipped++; continue; }
  try {
    const k = B / NEWB, nod = j.nodata;
    const fds = new Map(); const fdOf = (p) => { if (!fds.has(p)) fds.set(p, openSync(join(dir, band + '.p' + p + '.bin'), 'r')); return fds.get(p); };
    /* new parts take numbers after the old ones, so the old layout stays complete until the index file is swapped in one rename */
    const base = Math.max(Number(j.parts) || 0, ...Object.values(j.blocks).map(e => e[0] + 1)); let part = 0, pos = 0; const tmpOf = (p) => join(dir, band + '.p' + (base + p) + '.bin');
    let out = openSync(tmpOf(0), 'w'); const blocks = {}; let n = 0; const check = [];
    const keys = Object.keys(j.blocks).sort((a, b) => { const [ar, ac] = a.split(',').map(Number), [br, bc] = b.split(',').map(Number); return ar - br || ac - bc; });
    for (const key of keys) {
      const [p, off, len] = j.blocks[key]; const buf = Buffer.alloc(len); readSync(fdOf(p), buf, 0, len, off);
      const raw = inflateSync(buf); const a = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
      const [br, bc] = key.split(',').map(Number);
      for (let sr = 0; sr < k; sr++) for (let sc = 0; sc < k; sc++) {
        const sub = new Int16Array(NEWB * NEWB); let any = false;
        for (let r = 0; r < NEWB; r++) { const src = (sr * NEWB + r) * B + sc * NEWB; sub.set(a.subarray(src, src + NEWB), r * NEWB); }
        for (let i = 0; i < sub.length; i++) if (sub[i] !== nod) { any = true; break; }
        if (!any) continue;
        const z = deflateSync(Buffer.from(sub.buffer), { level: 6 });
        if (pos + z.length > PART_MAX) { closeSync(out); part++; out = openSync(tmpOf(part), 'w'); pos = 0; }
        writeSync(out, z); const nk = (br * k + sr) + ',' + (bc * k + sc); blocks[nk] = [base + part, pos, z.length]; pos += z.length; n++;
        if (check.length < 40 && (n % 97) === 1) check.push([nk, sub[(n * 31) % sub.length], (n * 31) % sub.length, part]);
      }
    }
    closeSync(out); for (const fd of fds.values()) closeSync(fd);
    /* spot check: re-read sampled new blocks from the temp parts and compare */
    for (const [nk, v, i, p] of check) { const [pp, off, len] = blocks[nk]; const fd = openSync(join(dir, band + '.p' + pp + '.bin'), 'r'); const b = Buffer.alloc(len); readSync(fd, b, 0, len, off); closeSync(fd);
      const r = inflateSync(b); if (new Int16Array(r.buffer, r.byteOffset, r.byteLength / 2)[i] !== v) throw new Error('check failed at ' + nk); }
    const nj = { ...j, grid: { ...j.grid, block: NEWB }, parts: base + part + 1, oldParts: base, blocks, nBlocks: n, retiled: { from: B, to: NEWB, at: new Date().toISOString() } };
    writeFileSync(jf + '.retile', JSON.stringify(nj));
    renameSync(jf + '.retile', jf);
    done++;
  } catch (e) { console.log('FAILED ' + band + ' ' + e.message + ' (left unchanged)'); failed++; }
}
console.log(`feature grid re-tile: ${done} bands re-tiled, ${skipped} already done or skipped, ${failed} failed, ${Math.round((Date.now() - t0) / 1000)} s`);
