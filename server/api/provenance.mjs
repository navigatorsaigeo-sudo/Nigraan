/* v91.17.126 · stage 7 (external audit A16/A24, CEO plan "attach every report to the exact inputs, model versions and calculations
   used") · ONE PROVENANCE BLOCK. The identity of every model and rule file that shapes a served number: its version and the first 16
   hex digits of its SHA-256, the package version, the newest complete national run (id, base time, record digest) and the levels the
   engine last published. Reports, the AI and the forward-test archive stamp this block, so any figure can be traced to the exact files
   that made it. Hashes are re-read at most every 10 minutes. */
import { readFileSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { writeFileAtomicSync } from './store.mjs';   /* v91.17.283 · WS3 · the cache is written atomically */
import { readFile as readFileP } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath as __fu } from 'node:url';
const CODE_ROOT = join(__fu(new URL('.', import.meta.url)), '..', '..');   /* v91.17.283 · INTEG */

const FILES = { national: 'national-model.json', downscale: 'downscale-model.json', hyperlocal: 'hyperlocal-model.json', tempCorrection: 'temp-correction.json',
  humwind: 'humwind-model.json', dew: 'dew-offset-lowland.json', rainChance: 'rain-chance-model.json', riverChance: 'river-prob-model.json', landslideOdds: 'landslide-odds-model.json',
  gate: 'model-gate.json', rules: 'rule-ledger.json', utciClimatology: 'utci-climatology.json', floodDepth: 'flood-depth/index.json' };   /* v91.17.207 · the river flood depth maps (their index names the source, version and check) */

export function createProvenance(app) {
  /* v91.17.283 · INTEG (WS7 request) · the data folder follows NIGRAAN_DATA_DIR (a server started with another data folder wrote its bin-hash
     cache into the folder it was started from); the code root (server/, package.json) is this file's own tree, never the data folder's parent */
  const dataDir = app.dataDir || process.env.NIGRAAN_DATA_DIR || join(CODE_ROOT, 'data');
  let memo = null, memoAt = 0;
  /* v91.17.283.53 · C · event loop: every 10 min models() read and parsed every model table again (national-model 5.4 MB, ml-mos 6.9 MB,
     humwind 3.7 MB, ...) on the server's one thread, 1-2 s in which no request was answered; a table is now read again only when its size
     or time changed (the same identity: version, sha-256 of the bytes, time) */
  const IDC = new Map();
  function ident(f) { let st = null; try { st = statSync(join(dataDir, f)); } catch (_) { st = null; }
    const k = st ? st.size + ':' + st.mtimeMs : null, c = k ? IDC.get(f) : null; if (c && c.k === k) return { ...c.v };
    const v = ident0(f); if (k && !v.missing) IDC.set(f, { k, v: { ...v } }); return v; }
  function ident0(f) {
    try { const p = join(dataDir, f); const b = readFileSync(p); let v = null; try { const j = JSON.parse(b.toString('utf8')); v = j.version || j.modelVersion || null; } catch (_) {}
      return { file: f, version: v, sha256_16: createHash('sha256').update(b).digest('hex').slice(0, 16), modified: new Date(statSync(p).mtimeMs).toISOString() }; } catch (_) { return { file: f, missing: true }; } }
  function models() {
    if (memo && Date.now() - memoAt < 10 * 60e3) return memo;
    let pkg = null; try { pkg = JSON.parse(readFileSync(join(CODE_ROOT, 'package.json'), 'utf8')).version; } catch (_) {}
    memo = { app: pkg, files: Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, ident(f)])) }; memoAt = Date.now(); return memo;
  }
  /* v91.17.147 · audit data F12 · CHAIN IDENTITY: one hash over all the server code (every .mjs under server/) and every table under data/ and
     data/feat/ (*.json), plus the package version. The list above names the main models; this names everything the chain reads, so
     two archived values with the same chain id were made by identical code and tables. Re-checked by size and time once a minute. */
  let cm = null, cAt = 0, busy = false;
  const LIVE = /(^|[\\/])(nigraan-db|ai-served-terms|selfcheck-latest|engine-latest|ffd-drive-state|ffd-drive|glof-bulletins|glof-lakes-live[\w-]*|mach-running-bias|model-gate\.resolved|national-score|flood|forward-test-points|smog|outlook|wetness|drought-national|drought-chirps|station-verification|landslide-rain|ensemble-scores|seasonal-scores|anomaly-climate|fires|snow-status|soil-water|vegetation-health|river-outlook|imerg-cells|imerg-verification|spi-pentad|event-memory|verify-issued|era5land-recent|urban-heat-map|drop-import|model-skill|synop-recent|epd-recent|manifest)\.json$|-(state|latest|recent|status)\.json$/;   /* v91.17.147 · review F5: feeds and job outputs rewritten while running */
  /* v91.17.207 · the binary grids the chain reads: the feature grids and the river flood depth tiles */
  /* v91.17.283.8 · audit 4 · and the other binary science tables: the flood-extent tiles, the drought rain table (chirps-tehsil.npz) and the
     urban grids (urban*.f16, urban.idx, urban.unit), by content */
  const BIN_TOP = /^(chirps-tehsil\.npz|urban[\w-]*\.f16|urban\.idx|urban\.unit)$/;
  function binFiles() { const out = []; for (const d of ['feat', 'flood-depth', 'flood-extent']) { try { for (const n of readdirSync(join(dataDir, d)).filter((x) => x.endsWith('.bin')).sort()) out.push(join(dataDir, d, n)); } catch (_) {} }
    try { for (const n of readdirSync(dataDir).filter((x) => BIN_TOP.test(x)).sort()) out.push(join(dataDir, n)); } catch (_) {}
    return out; }
  function listFiles() { const root = CODE_ROOT, files = [];
    const walk = (d, ext, deep) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of es) { const f = join(d, e.name); if (e.isDirectory()) { if (deep && e.name !== 'node_modules') walk(f, ext, deep); } else if (e.name.endsWith(ext)) files.push(f); } };
    walk(join(root, 'server'), '.mjs', true); walk(dataDir, '.json', false); walk(join(dataDir, 'feat'), '.json', false);
    /* v91.17.283.8 · audit 4 · THE CALCULATION CODE IN FULL: the served pages (artefact/*.html: the default hazard engine runs in the page),
       the extracted science modules and their data (server/science/**: .js and .json), and the nested science tables (data/evidence/**,
       the flood-depth / flood-extent / GloFAS-calibration indexes). A change to any of them changes the chain id. */
    walk(join(root, 'artefact'), '.html', false); walk(join(root, 'server'), '.js', true); walk(join(root, 'server'), '.json', true);
    walk(join(dataDir, 'evidence'), '', true); for (const d of ['flood-depth', 'flood-extent', 'flood-glofascal']) walk(join(dataDir, d), '.json', false);
    /* live state written while the server runs (the store, engine and self-check results, running biases, scores, feeds) is not code or
       a table: it is left out, and served values carry its own time */
    return [...new Set(files)].filter((f) => !(f.startsWith(dataDir) && LIVE.test(f.slice(dataDir.length)))).sort(); }   /* v91.17.283.8: the live-state rule applies to the data folder only (server/science/manifest.json is code) */
  /* the hash is built in the background, one file per turn of the event loop (about 100 MB of tables), and replaced when done */
  async function rebuild(files, sig) { busy = true;
    try { const root = CODE_ROOT; let pkg = null; try { pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version; } catch (_) {}
      const h = createHash('sha256'); h.update(String(pkg)); let code = 0, tables = 0;
      /* v91.17.207 · audit B12 · the feature grids enter by CONTENT (sha-256 of each .bin), not size and date. A content hash is kept per file
         with its size and date (data/archive/provenance-bin-hash.json), so a restart re-reads only grids that changed on disk. */
      try { const cf = join(dataDir, 'archive', 'provenance-bin-hash.json'); let cache = {}; try { cache = JSON.parse(readFileSync(cf, 'utf8')); } catch (_) { cache = {}; }
        let changed = false; const next = {};
        for (const e of binFiles().map((f) => f.slice(dataDir.length + 1).split('\\').join('/'))) { const f = join(dataDir, e), st = statSync(f), k = st.size + ':' + Math.floor(st.mtimeMs);
          let c = cache[e]; if (!c || c.k !== k) { c = { k, h: createHash('sha256').update(await readFileP(f)).digest('hex') }; changed = true; await new Promise((ok) => setImmediate(ok)); } next[e] = c;
          h.update(e + ':' + c.h); tables++; }
        if (changed || Object.keys(cache).length !== Object.keys(next).length) { try { mkdirSync(join(dataDir, 'archive'), { recursive: true }); writeFileAtomicSync(cf, JSON.stringify(next)); } catch (_) {} } } catch (_) {}   /* the feature-grid tiles (650 MB) by size and time, not content */
      for (const f of files) { try { const b = await readFileP(f); h.update(f.slice(root.length)); h.update(b); /\.(mjs|js|html)$/.test(f) ? code++ : tables++; } catch (_) {} await new Promise((ok) => setImmediate(ok)); }
      cm = { sig, out: { id: h.digest('hex').slice(0, 16), app: pkg, codeFiles: code, tableFiles: tables, at: new Date().toISOString() } };
    } finally { busy = false; } }
  function chain() {
    if (!busy && (!cm || Date.now() - cAt >= 60e3)) { cAt = Date.now(); const files = listFiles();
      /* v91.17.207 · audit B12 · the feature grids are in the signature too: a grid-only change now rebuilds the identity */
      const bins = binFiles();
      const sig = files.concat(bins).map((f) => { try { const st = statSync(f); return f + ':' + st.size + ':' + Math.floor(st.mtimeMs); } catch (_) { return f; } }).join('|');
      if (!cm || cm.sig !== sig) rebuild(files, sig).catch(() => {}); }
    return cm ? cm.out : { id: null, pending: true, why: 'the chain identity is being computed (first minute after start)' };
  }
  function block() {
    const m = models(); let run = null, levels = null;
    try { const R = app.store.filter('runs', r => r.status === 'complete' && r.unit_level === 'tehsil').sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')))[0];
      if (R) run = { runId: R.run_id, base: R.base_valid_time || null, completed: R.completed_at, recordsDigest: R.records_sha256, digestVersion: R.digest_version || 1 }; } catch (_) {}
    try { const h = app.engine && app.engine.levels ? app.engine.levels(null, 0, false) : null; if (h && h.ready) levels = { publishedAt: h.at, build: h.build, gate: h.gate }; } catch (_) {}
    let ch = null; try { ch = chain(); } catch (_) {}
    let snap = null; try { snap = app.snapshot ? app.snapshot.id() : null; } catch (_) {}   /* v91.17.207 · the analysis snapshot (code + tables + forecast inputs) */
    return { schema: 'agn.provenance.v1', at: new Date().toISOString(), app: m.app, snapshot: snap, chain: ch, models: m.files, nationalRun: run, levels };
  }
  function stamp(obj) { const b = block(); const body = JSON.stringify({ ...obj, provenance: undefined, provenanceSha256: undefined });
    return { provenance: b, provenanceSha256: createHash('sha256').update(body + JSON.stringify(b)).digest('hex') }; }
  try { setTimeout(() => chain(), 5000).unref(); } catch (_) {}
  return { models, block, stamp, chain };
}
