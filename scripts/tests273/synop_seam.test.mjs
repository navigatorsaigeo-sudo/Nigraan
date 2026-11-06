import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.273 · TEMP · the Gilgit/Skardu calibration seam (tests71 'offset outruns the curve', laptop 1.17-1.37 C at 09-11 PKT).
   Cause: the synoptic running correction (server/api/synop.mjs) added the latest-report anomaly only from the report hour on, so the
   correction stepped by 0.6 x anomaly at the report. This replays the real Gilgit reports (fixtures/synop_gilgit.json: observed and
   served, 3-15 Oct 2026) with the clock frozen after every report of 10-15 Oct, on a flat curve (so every change is the correction's):
     1 at every report hour the correction's change is no larger than the running hour bias's own change + 0.3 C (the tests71 rule)
     2 hours at and after the latest report are unchanged against v272 (the held-out tested forecast is not touched)
     3 6 h and more before the report: unchanged against v272
   usage: node scripts/tests273/synop_seam.test.mjs [base tree for the v272 comparison] */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), APP = join(HERE, '..', '..'), BASE = (process.argv[2] && !/^https?:/.test(process.argv[2])) ? process.argv[2] : __T.needPath('NIGRAAN_CMP_TREE_V272', '/tmp/claude-0/v272/integ', 'the v272 comparison tree') /* v276: a server URL (suite runner) is not a tree */;
let P = 0, F = 0; const pass = (m, d) => { P++; console.log('PASS ' + m + (d ? ' · ' + d : '')); }, fail = (m, d) => { F++; console.log('FAIL ' + m + (d ? ' · ' + d : '')); };
const FX = JSON.parse(readFileSync(join(HERE, 'fixtures', 'synop_gilgit.json'), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'syn273-')); mkdirSync(join(dir, 'cache'));
writeFileSync(join(dir, 'synop-stations.json'), JSON.stringify({ stations: FX.station }));
const realNow = Date.now; let NOW = 0; Date.now = () => NOW;
const reports = Object.keys(FX.records['41516']).filter((t) => t >= '2026-10-10').sort();
const run = async (tree, nowIso) => {
  NOW = Date.parse(nowIso);
  writeFileSync(join(dir, 'cache', 'synop-recent.json'), JSON.stringify({ 41516: Object.fromEntries(Object.entries(FX.records['41516']).filter(([t]) => Date.parse(t) <= NOW)) }));
  const { createSynop } = await import(pathToFileURL(join(tree, 'server', 'api', 'synop.mjs')).href + '?t=' + tree.length);
  const syn = createSynop({}, dir); const t0 = NOW - 12 * 3600e3 - (NOW % 3600e3);
  const time = [...Array(30)].map((_, i) => new Date(t0 + 5 * 3600e3 + i * 3600e3).toISOString().slice(0, 16));
  const loc = { utc_offset_seconds: 18000, elevation: 1460, hourly: { time, temperature_2m: time.map(() => 10) } };
  syn.apply(loc, 35.919, 74.334); const M = syn.model('41516', NOW);
  return { ms: time.map((t) => Date.parse(t + 'Z') - 5 * 3600e3), c: loc.hourly.temperature_2m.map((v) => v - 10), M };
};
const hodAt = (hod, utcH) => { const a = Math.floor(utcH / 3) * 3 % 24, b = (a + 3) % 24, f = (utcH - Math.floor(utcH / 3) * 3) / 3; if (hod[a] == null && hod[b] == null) return null; if (hod[a] == null) return hod[b]; if (hod[b] == null) return hod[a]; return hod[a] + (hod[b] - hod[a]) * f; };
let worstNew = -9, worstOld = -9, whereOld = null, after = 0, before6 = 0, nRep = 0;
for (const rep of reports) {
  const now = new Date(Date.parse(rep) + 80 * 60e3).toISOString();   /* 80 min after the report time (the report has arrived) */
  const A = await run(APP, now), B = await run(BASE, now); if (!A.M || !A.M.last || A.M.anom == null) continue; nRep++;
  const L = A.M.last.ms; const k = A.ms.indexOf(L); if (k < 1) continue;
  const dh = Math.abs(hodAt(A.M.hod, new Date(L).getUTCHours()) - hodAt(A.M.hod, new Date(L - 3600e3).getUTCHours()));
  const exNew = Math.abs(A.c[k] - A.c[k - 1]) - dh - 0.3, exOld = Math.abs(B.c[k] - B.c[k - 1]) - dh - 0.3;
  if (exNew > worstNew) worstNew = exNew; if (exOld > worstOld) { worstOld = exOld; whereOld = rep + ' (anomaly ' + A.M.anom.toFixed(2) + ' C)'; }
  for (let i = 0; i < A.ms.length; i++) { if (A.ms[i] >= L && Math.abs(A.c[i] - B.c[i]) > 1e-9) after++; if (A.ms[i] <= L - 6 * 3600e3 && Math.abs(A.c[i] - B.c[i]) > 1e-9) before6++; }
}
Date.now = realNow;
nRep >= 20 ? pass('replayed Gilgit reports', nRep + ' report times, 10-15 Oct 2026') : fail('replayed reports', String(nRep));
worstOld > 0 ? pass('v272 has the seam (reproduced)', 'step beyond the rule by ' + worstOld.toFixed(2) + ' C at ' + whereOld) : fail('v272 seam not reproduced', worstOld.toFixed(2));
worstNew <= 0.05 ? pass('v273: no step at the report hour', 'largest excess ' + worstNew.toFixed(2) + ' C (rule: hour-bias change + 0.3 C)') : fail('v273 step at the report hour', worstNew.toFixed(2) + ' C');
after === 0 ? pass('hours at and after the latest report unchanged (the tested forecast)') : fail('hours after the report changed', String(after));
before6 === 0 ? pass('hours 6 h and more before the report unchanged') : fail('hours 6 h+ before changed', String(before6));
console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
