/* v91.17.283 · WS8 · THE SCIENCE LOADER (prototype; off unless NIGRAAN_ENGINE_SCIENCE=1 is wired in server/api/engine.mjs).
   The server engine used to run the scripts it extracts from the served analyst page (server/engine/vmpage.mjs), so an edit to the
   page's interface could change a hazard level. This loader runs the hazard science from its own files instead:
     server/science/manifest.json   the modules in run order (each one names the page script it was taken from and that script's hash)
     server/science/modules/*.js    the science: mask -> day input -> hazard engine -> five-level ladder -> alerts -> engine report
     server/science/data/*.json     the data blocks the science reads (settlements, registries, model tables)
   It runs them in the same host the page runner uses (server/science/host.mjs, lifted unchanged from vmpage.mjs), so a level
   from the modules is a level from the page: scripts/tests283/ws8/identity.mjs proves it at 60 fixed places, days 0-6.
   The page can load the same files (GET /science/<file>, see CHANGES.md) and keeps only presentation.
   Run directly (node server/science/loader.mjs) it is the engine runner, a drop-in for vmpage.mjs: same environment variables,
   same log, same report to POST /api/engine/report. */
import { readFileSync, appendFileSync, statSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createHost } from './host.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const sha1 = (s) => createHash('sha1').update(s).digest('hex');

/* the served page's scripts, exactly as server/engine/vmpage.mjs reads them (the old path; used by the identity test) */
export function pageBlocks(file) {
  const html = readFileSync(file || process.env.NIGRAAN_ENGINE_ARTEFACT || join(ROOT, 'artefact', process.env.NIGRAAN_ARTEFACT || 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
  const json = new Map();
  for (const m of html.matchAll(/<script\b([^>]*application\/json[^>]*)>([\s\S]*?)<\/script>/g)) { const id = (m[1].match(/id="([^"]+)"/) || [])[1]; if (id) json.set(id, m[2]); }
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], code: m[2] })).filter((b) => !/application\/json/.test(b.attrs) && !/\bsrc=/.test(b.attrs));
  return { blocks, json };
}

/* the science modules (the new path) */
export function readManifest() { return JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8')); }
export function scienceBlocks() {
  const M = readManifest(), json = new Map(), blocks = [];
  for (const d of M.data) json.set(d.id, readFileSync(join(HERE, 'data', d.file), 'utf8'));
  for (const m of M.modules) { const code = readFileSync(join(HERE, 'modules', m.file), 'utf8');
    blocks.push({ attrs: m.id ? ' id="' + m.id + '"' : '', code, file: 'science/' + m.file }); }
  return { blocks, json, manifest: M };
}

/* in-process use (the server imports this module directly; no page, no child process):
     const sci = createScience({ port, fetch?, log? });  sci.boot();
     sci.derive()            the engine record the runner posts (days 0-3 x layers x tehsils, alerts, district board)
     sci.unitOn(hz, key, d)  one tehsil, one layer, one day: { lv, r, inp }
   The science keeps its own state (forecasts it fetched, the sweep); call boot() once and give it time to fetch its inputs. */
export function createScience(opts = {}) {
  const { blocks, json, manifest } = scienceBlocks();
  const host = createHost({ blocks, json, port: opts.port || 8787, fetch: opts.fetch, log: opts.log, cbLimitMs: opts.cbLimitMs, onReload: opts.onReload || (() => {}) });
  const { ctx, vm } = host; const q = (e) => vm.runInContext(e, ctx, { timeout: opts.cbLimitMs || 600000 });
  return { manifest, ctx, boot: () => host.boot(),
    derive: () => q('AGN.engine.derive()'),
    unitOn: (hz, key, day) => { ctx.__a = [hz, key, Number(day) || 0];
      return q(`(function(){ var D0=AGN.day, g=D0.get, b=D0.basis, a=__a; try{ D0.get=function(){ return a[2]; }; D0.basis=function(){ return 'peak'; };
        var p=AGN.selfcheck.units().find(function(u){ return u.key===a[1] || u.uid===a[1]; }); return p?AGN.selfcheck.unitOn(a[0],p):null; } finally { D0.get=g; D0.basis=b; } })()`); } };
}

/* ---- the runner (node server/science/loader.mjs), a drop-in for server/engine/vmpage.mjs ---- */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const PORT = Number(process.env.NIGRAAN_ENGINE_PORT || process.env.PORT || 8787), ORIGIN = 'http://127.0.0.1:' + PORT;
  const DATA = process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data');
  const LOG = join(DATA, 'engine-vm.log');
  const SEEN = new Map();
  const log = (...a) => { const m = a.map(String).join(' '); const key = m.replace(/\d+/g, '#').slice(0, 160); const n = (SEEN.get(key) || 0) + 1; SEEN.set(key, n); if (n > 3 && n % 500) return; if (n > 3) a.push('(seen ' + n + ' times)'); try { try { if (statSync(LOG).size > 1048576) renameSync(LOG, LOG + '.1'); } catch (_) {} appendFileSync(LOG, new Date().toISOString() + ' [science] ' + a.map(String).join(' ') + '\n'); } catch (_) {} };
  const { blocks, json, manifest } = scienceBlocks();
  const host = createHost({ blocks, json, port: PORT, cbLimitMs: Number(process.env.NIGRAAN_ENGINE_CB_LIMIT_S || 600) * 1000, log });
  const { ctx, vm } = host;
  const r = host.boot();
  log('science modules started: ' + r.ran + ' of ' + r.of + ' modules (manifest ' + manifest.version + ') in ' + r.ms + ' ms' + (r.failed.length ? '; modules that stopped: ' + r.failed.join(' | ') : ''));
  process.on('uncaughtException', (e) => { log('uncaught:', String(e && e.stack || e).slice(0, 300)); });
  process.on('unhandledRejection', (e) => { log('unhandled rejection:', String(e && e.message || e).slice(0, 200)); });
  setInterval(() => { try { log('status: ' + vm.runInContext('JSON.stringify({ sweep: !!(window.AGN && AGN.hz5 && AGN.hz5.sweep && AGN.hz5.sweep().done), wx: (AGN.engine && AGN.engine.wxCover) ? Math.round(AGN.engine.wxCover() * 1000) / 1000 : null, lastRun: AGN.engine ? AGN.engine.lastRun : null })', ctx, { timeout: 5000 })); } catch (e) { log('status failed: ' + e.message); } }, 300000);
  setInterval(() => { fetch(ORIGIN + '/health').catch(() => { log('server gone: runner exits'); process.exit(0); }); }, 120000).unref?.();
}
export { sha1 };
