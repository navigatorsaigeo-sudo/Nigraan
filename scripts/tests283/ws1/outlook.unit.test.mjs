/* v91.17.283 · WS1 · D1: the 15-day ensemble outlook is updated twice daily, from the 00 and 12 UTC ECMWF ENS runs (server/api/outlook.mjs
   ensembleDue / tick), read from the provider's model metadata (api/modelruns.mjs). No server: createOutlook with a counting provider.
     O1-O3  the latest run is 12 UTC and the stored outlook is older: due, target 12 UTC; 06 UTC latest with the 00 UTC run stored: not due;
     O4-O6  tick(): no ensemble fetch while the latest run is 06/18 UTC and the 00/12 run is stored; one fetch when the 12 UTC run appears,
            then none on the next ticks (the issue is recorded);
     O7     the served unit outlook says "updated twice daily".
   Fails on v91.17.283 as frozen (no ensembleDue: the outlook was fetched every 6 h from any run).
   usage: node scripts/tests283/ws1/outlook.unit.test.mjs */
import { mkdtempSync, writeFileSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d != null ? ' :: ' + String(d).slice(0, 300) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = mkdtempSync(join(tmpdir(), 'agn-ol-'));
try {
  const { createOutlook } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'outlook.mjs')).href);
  const { createModelRuns } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'modelruns.mjs')).href);
  copyFileSync(join(ROOT, 'data', 'provider-models.json'), join(D, 'provider-models.json'));
  const day = Math.floor(Date.now() / 864e5) * 86400 - 86400;   /* yesterday 00 UTC, s (every run of that day is in the past) */
  let ensInit = day + 6 * 3600;   /* the provider's latest ENS run: 06 UTC */
  const META = () => ({ ecmwf_ifs025_ensemble: { init: ensInit, avail: ensInit + 1, interval: 1 } });   /* always due: every poll reads it */
  const mr = createModelRuns({ dataDir: D, metaFetch: async (kind, d) => { const m = META()[d] || { init: day, avail: day + 1, interval: 1 }; return { last_run_initialisation_time: m.init, last_run_availability_time: m.avail, update_interval_seconds: m.interval }; } });
  const JM = JSON.parse(readFileSync(join(ROOT, 'data', 'provider-models.json'), 'utf8')); JM.pollSeconds = 0.001; writeFileSync(join(D, 'provider-models.json'), JSON.stringify(JM));
  const now = new Date().toISOString();
  /* stored state: the 00 UTC run's outlook; bias, radiation and season fresh, so only the ensemble path can call */
  writeFileSync(join(D, 'outlook.json'), JSON.stringify({ ensemble: { at: now, issueInit: day, model: 'ecmwf_ifs025', members: 51, days: [], units: {}, events: {} }, ensBias: { at: now }, radiation: { at: now }, seasonal: { at: now, units: {}, weeks: ['x'], months: ['y'], issue: {} } }));
  const calls = []; const units = { tehsil: [{ unitId: 'u1', name: 'Test', lat: 33.7, lon: 73.05, elevM: 540 }] };
  const provider = { configured: () => true, call: async (kind, path, params) => { calls.push(kind + ' ' + path); if (kind === 'ensemble') return [{ latitude: 33.7, longitude: 73.05, daily: { time: [] } }]; throw new Error('not in this test'); } };
  const app = { provider, units, modelRuns: mr, dataDir: D };
  const O = createOutlook(app, D);
  const d1 = await O.ensembleDue();
  ok(d1.run === false && d1.target === day && d1.latestIsMain === false, 'O1 latest run 06 UTC, the 00 UTC run stored: not due (target = the 00 UTC run)', JSON.stringify(d1));
  ensInit = day + 12 * 3600; await sleep(5);
  const d2 = await O.ensembleDue();
  ok(d2.run === true && d2.target === day + 12 * 3600 && d2.latestIsMain === true, 'O2 the 12 UTC run appears: due', JSON.stringify(d2));
  ensInit = day + 18 * 3600; await sleep(5);
  const d3 = await O.ensembleDue();
  ok(d3.run === true && d3.target === day + 12 * 3600, 'O3 the 12 UTC run was missed and 18 UTC is the latest: still due once for the 12 UTC issue', JSON.stringify(d3));
  /* tick */
  ensInit = day + 6 * 3600; await sleep(5); const n0 = calls.filter((c) => c.startsWith('ensemble')).length;
  O.tick(); await sleep(300); O.tick(); await sleep(300);
  ok(calls.filter((c) => c.startsWith('ensemble')).length === n0, 'O4 tick: no ENS fetch while the latest run is 06 UTC and the 00 UTC outlook is stored', calls.join(' | '));
  ensInit = day + 12 * 3600; await sleep(5);
  O.tick(); for (let i = 0; i < 50 && calls.filter((c) => c.startsWith('ensemble')).length === n0; i++) await sleep(100);
  await sleep(500); const n1 = calls.filter((c) => c.startsWith('ensemble')).length;
  ok(n1 > n0, 'O5 tick: the 12 UTC run is fetched', n1 - n0);
  const st = JSON.parse(readFileSync(join(D, 'outlook.json'), 'utf8'));
  O.tick(); await sleep(500); O.tick(); await sleep(500);
  const n2 = calls.filter((c) => c.startsWith('ensemble')).length;
  ok(n2 === n1, 'O6 ... and not again on later ticks (issue recorded or the run kept the stored outlook)', (n2 - n1) + ' issueInit ' + (st.ensemble && st.ensemble.issueInit));
  const src = readFileSync(join(ROOT, 'server', 'api', 'outlook.mjs'), 'utf8');
  ok(/updated twice daily, from the 00 and 12 UTC ensemble runs/.test(src) && /updated: ENS_UPDATED/.test(src), 'O7 the outlook answer states "updated twice daily" (the 00 and 12 UTC runs)');
} catch (e) { ok(false, 'test run', e && e.stack || e); }
finally { rmSync(D, { recursive: true, force: true }); }
console.log(`\noutlook unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
