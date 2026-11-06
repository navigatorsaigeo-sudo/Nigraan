/* v91.17.231 · equality harness: the correction chain on every cached sweep body (data/cache/provider/sweep), clock frozen at FIXED_NOW,
   live layer off; writes a hash per body. Run it on two app copies (APPDIR) or two modes (MODE=sync|async, NIGRAAN_LGB_POOL=0) with the same
   FIXED_NOW and compare the files: v231 matched the v230 code on 284 bodies (14,102 places), sync and pooled.
   usage: FIXED_NOW=<ms> MODE=sync|async OUT=out.json [APPDIR=<app>] [NFILES=n] node scripts/tests231/equality_run.mjs */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
const FIX = Number(process.env.FIXED_NOW); const realNow = Date.now; Date.now = () => FIX;
const APP = process.env.APPDIR || join(fileURLToPath(import.meta.url), '..', '..', '..');
const { createBackend } = await import(pathToFileURL(join(APP, 'server', 'api', 'index.mjs')).href);
const backend = createBackend({ root: APP, dataDir: APP + '/data' });
await new Promise(r => setTimeout(r, 4000));
const V = backend.app.verification;
const dir = APP + '/data/cache/provider/sweep';
const files = readdirSync(dir).filter(f => /^[0-9a-f]+\.json$/.test(f)).sort().slice(0, Number(process.env.NFILES || 12));
const zoneReq = backend.app.mos && backend.app.mos.requestModels ? backend.app.mos.requestModels() : null;
const out = {}; const t0 = realNow();
for (const f of files) {
  const buf = readFileSync(dir + '/' + f); let j; try { j = JSON.parse(buf); } catch { continue; }
  const arr = Array.isArray(j) ? j : [j];
  const zone = arr[0] && arr[0].hourly && Object.keys(arr[0].hourly).some(k => /_(icon|gfs|ecmwf|meteofrance)/.test(k));
  const qs = new URLSearchParams({ latitude: arr.map(l => l.latitude).join(','), longitude: arr.map(l => l.longitude).join(','), models: zone && zoneReq ? zoneReq : 'best_match' });
  const r = process.env.MODE === 'async' ? await V.correctResponseAsync(buf, qs, [], null, 0, false, null, true, false) : V.correctResponse(buf, qs, [], null, 0, false, null, true, false);
  out[f] = { n: r.n, len: r.buf.length, sha: createHash('sha256').update(r.buf).digest('hex').slice(0, 16), zone: !!zone, places: arr.length };
}
out.__ms = realNow() - t0;
writeFileSync(process.env.OUT, JSON.stringify(out, null, 1)); console.log('done', process.env.MODE, out.__ms, 'ms'); process.exit(0);
