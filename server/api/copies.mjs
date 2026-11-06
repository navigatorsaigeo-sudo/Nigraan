/* ══ v91.17.269 · COPY, NOT FETCH (A4; CEO rule 16 Oct 2026) → v91.17.283.28 · RETIRED: NIGRAAN IS INDEPENDENT OF LAMHA ══════════════
   Owner decision 28 Oct 2026 11:10 PKT: NIGRAAN must be FULLY INDEPENDENT of LAMHA, with no live data dependency. This module copied
   LAMHA's MACH database sync, METAR, EWS readings and the PMD-origin catalogues into nig/copies every 15 minutes and gated the
   consumers on them. All of that is retired; every consumer now reads NIGRAAN's own feeds:
     MACH     fleet.mjs polls the MACH database itself (obs.key, /v1/latest every 10 min); machdb.mjs keeps the record and the own
              day files (station-lake/scripts/mach_db_sync.py --live every 10 min, the record every 6 h)
     METAR    station-lake/scripts/metar_sync.py every 30 min (AWC, IEM) into the own folder; synop.mjs reads it, then IEM itself
     PMD-EWS  station-lake/scripts/ews_sync.py, mode own, every 30 min into the own folder; pyjobs ewsAppend reads it
     meta     LAMHA's MACH QC tables and the PMD-origin catalogues: copied ONCE into NIGRAAN by _admin\independence\COPY_HISTORY_ONCE.ps1
   The own folder is server/api/ownpaths.mjs (D:\NIGRAAN\nig\own). What stays here: the tolerant CSV readers other modules import
   (splitCsvLine, streamCsv, pick, utcMs), and createCopies() as an inert shim with the same methods, so the server, the operations
   route GET /api/ops/copies and the accuracy monitor keep working: run() copies nothing, gate() / mach() / metar() say "retired",
   ews() names NIGRAAN's own EWS store, status() says retired and lists the own feeds. data/copy-sources.json holds no dataset. Files
   already copied into nig/copies stay where they are (nothing reads, moves or deletes them; the copies retention job keeps its rule).
   The retired code is in the deploy's REMOVED list (v91.17.283.28). */
import { existsSync, readFileSync, statSync, createReadStream, openSync, readSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { ownDir } from './ownpaths.mjs';
import { ewsSource } from './ewssource.mjs';

/* ── tolerant CSV ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else if (c !== '\r') cur += c; }
  out.push(cur); return out;
}
/* stream the rows of a CSV (plain or gzip, by name or by its magic bytes) as objects keyed by the header; calls onRow(row).
   '#' comment lines before the header are skipped (LAMHA's register starts with one); the last line of a plain file that does not
   end in a newline is a torn append (copied while LAMHA was writing it) and is left out, as is any short line */
export async function streamCsv(file, onRow, opt = {}) {
  let gz = /\.gz$/i.test(file), endsNl = true;
  try { const fd = openSync(file, 'r'), b = Buffer.alloc(2), st = statSync(file); readSync(fd, b, 0, 2, 0); if (b[0] === 0x1f && b[1] === 0x8b) gz = true;
    if (!gz && st.size > 0) { const e = Buffer.alloc(1); readSync(fd, e, 0, 1, st.size - 1); endsNl = e[0] === 0x0a; } closeSync(fd); } catch (_) {}
  const raw = createReadStream(file); const src = gz ? raw.pipe(createGunzip()) : raw;
  const rl = createInterface({ input: src, crlfDelay: Infinity });
  let head = null, n = 0, torn = 0, pending = null;
  const take = (line) => {
    if (!line.trim()) return;
    const c = splitCsvLine(line); if (c.length < head.length - 1) { torn++; return; }
    n++; if (opt.cells) { onRow(c, head); return; }   /* cells: the split line and the header, no object per row (big files) */
    const o = {}; for (let i = 0; i < head.length; i++) o[head[i]] = c[i] == null ? '' : c[i]; onRow(o);
  };
  const done = new Promise((res, rej) => { src.on('error', rej); raw.on('error', rej); rl.on('close', res); });
  rl.on('line', (line) => {
    if (head === null) { const l = line.replace(/^\uFEFF/, ''); if (!l.trim() || l.startsWith('#')) return; head = splitCsvLine(l).map((h) => h.trim()); return; }
    if (pending !== null) take(pending); pending = line;
  });
  await done;
  if (pending !== null) { if (endsNl || gz) take(pending); else if (pending.trim()) torn++; }
  return { header: head || [], rows: n, torn };
}
/* the first column of the header among the aliases (case-insensitive) */
export function pick(header, names) { const H = new Map(header.map((h) => [String(h).toLowerCase(), h])); for (const n of names) { const h = H.get(n.toLowerCase()); if (h) return h; } return null; }
const num = (v) => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
/* ISO times with Z or an offset; 'YYYY-MM-DD HH:MM[:SS]' and a bare date (pandas writes midnight as a bare date) are UTC */
export function utcMs(v) {
  const s = String(v == null ? '' : v).trim(); if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(s + 'T00:00:00Z');
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return Date.parse(s.replace(' ', 'T') + 'Z');
  return Date.parse(s);
}
const RETIRED = 'retired v91.17.283.28: NIGRAAN is independent of LAMHA (owner, 28 Oct 2026); its own feeds replace the copies';
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return null; } };
const ageMin = (f) => { try { return Math.round((Date.now() - statSync(f).mtimeMs) / 60e3); } catch (_) { return null; } };

export function createCopies(app, root, dataDir, opts = {}) {
  const CFG = readJson(join(dataDir, 'copy-sources.json')) || {}; const cp = CFG.copies || {};
  const copiesDir = resolve(process.env[cp.env || 'NIGRAAN_COPIES_DIR'] || join(root, ...(Array.isArray(cp.default) ? cp.default : ['..', 'copies'])));
  const own = () => ownDir(root);
  const no = () => ({ ok: false, why: RETIRED });
  /* the own feeds that replaced the copies, for the operations page (no network, file times only) */
  function ownFeeds() {
    const O = own(); const f = (...p) => join(O, ...p);
    let ews = null; try { const E = ewsSource(root, dataDir); ews = { mode: E.mode, store: E.live, lastSync: E.lastSync }; } catch (e) { ews = { error: e.message }; }
    return { ownDir: O,
      mach: { dir: f('data', 'mach', 'db'), lastSyncAgeMin: ageMin(f('data', 'mach', 'db', 'last_sync.txt')), registerAgeMin: ageMin(f('data', 'mach', 'db', 'latest_status.json')), job: 'machDbLive (machdb.mjs, 10 min)' },
      metar: { dir: f('data', 'obs_other', 'metar_live'), last: readJson(f('data', 'obs_other', 'metar_live', 'sync_status.json')), job: 'metarSync (pyjobs.mjs, 30 min)' },
      ews: { ...ews, job: 'ewsSync (pyjobs.mjs, 30 min)' },
      radar: { dir: f('data', 'radar'), pullLogAgeMin: ageMin(f('data', 'radar', 'pull_log.txt')), job: 'radarPull (pyjobs.mjs, 6 h)' } };
  }
  function status() {
    return { on: false, retired: RETIRED, config: CFG.version ? { version: CFG.version } : null, copiesDir, sources: {}, datasets: {}, ewsSource: (() => { try { const E = ewsSource(root, dataDir); return { mode: E.mode, active: E.active, from: E.root, why: E.why, decidedAt: E.decidedAt || null }; } catch (e) { return { error: e.message }; } })(), ownFeeds: ownFeeds() };
  }
  return { run: async () => no(), gate: () => no(), mach: async () => no(), metar: async () => no(),
    ews: () => { const r = own(); return existsSync(join(r, 'data', 'pmd', 'ews_live', 'raw')) ? { ok: true, root: r } : { ok: false, why: 'no own EWS store yet (' + join(r, 'data', 'pmd', 'ews_live', 'raw') + ')' }; },
    status, copiesDir };
}
