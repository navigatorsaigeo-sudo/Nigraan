// v91.17.283.2 - every drought row the server returns is labelled "observed" (computed from the observed index): served unit layers and
// alerts, national counts, the site-screen row, the report watch row, the AI drought facts and /api/climatology/drought. Nothing else
// changes (other layers carry no observed label; levels and words are untouched).
// usage: node scripts/tests2832/drought_observed.test.mjs     (no server)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const S = await import(pathToFileURL(join(APP, 'server', 'api', 'served.mjs')).href);
const W = ['Low', 'Moderate', 'High', 'Severe', 'Extreme'];
const unit = { ready: true, words: W, days: [{ date: '2026-10-21', layers: { drought: { name: 'Drought', level: 2, word: 'High', score: 61 }, heat: { name: 'Heat stress', level: 0, word: 'Low', score: 10 } } }],
  alerts: [{ hazard: 'drought', name: 'X', sev: 2, band: 'High' }, { hazard: 'heat', name: 'X', sev: 1, band: 'Moderate' }] };
const app = { engine: { unit: () => JSON.parse(JSON.stringify(unit)), levels: () => ({ ready: true, words: W, levels: { a: 2, b: 0 }, day: 0 }), latest: () => null }, gate: { full: () => ({ ready: true, client_rules: {} }), entryOf: () => null } };   /* v91.17.283.8 (audit 2): a readable gate with no client rules; gate null now fails closed */
const u = S.servedUnit(app, 'a');
const dl = u.days[0].layers.drought, hl = u.days[0].layers.heat;
ok(dl.observed === true && dl.basis === 'observed' && /observed drought index/.test(dl.observedBasis), 'served unit: the drought layer is labelled observed', JSON.stringify({ observed: dl.observed, basis: dl.basis }));
ok(dl.level === 2 && dl.word === 'High' && dl.score === 61, 'served unit: the drought level, word and score are unchanged');
ok(hl.observed === undefined && hl.basis === undefined, 'served unit: other layers carry no observed label');
const da = u.alerts.find((a) => a.hazard === 'drought'), ha = u.alerts.find((a) => a.hazard === 'heat');
/* v91.17.283.10 owner decision (23 Oct 2026): drought never raises a client alert; the operator list keeps the row, labelled observed */
const uo = S.servedUnit(app, 'a', true); const dao = uo.alerts.find((a) => a.hazard === 'drought');
ok(!da && (u.alertsWithheld || []).some((w) => w.hazard === 'drought') && dao && dao.observed === true && dao.basis === 'observed', 'served alerts: no drought alert for a client (owner decision); the operator row is labelled observed');
ok(ha && ha.observed === undefined, 'served alerts: other rows unchanged');
const n = S.servedNational(app, 'drought', 0); const nh = S.servedNational(app, 'heat', 0);
ok(n.ready && n.observed === true && n.basis === 'observed', 'national drought counts: labelled observed');
ok(nh.ready && nh.observed === undefined && nh.basis === undefined, 'national counts of other layers: unchanged');
const src = (f) => readFileSync(join(APP, 'server', 'api', f), 'utf8');
ok(/parameter: 'Drought \(last 30-90 days\)'[\s\S]{0,600}observed: true, basis: 'observed'[\s\S]{0,300}'Observed: computed from the observed drought index/.test(src('siterisk.mjs')), 'site screen: the drought row carries observed and says so in its meaning');
ok(/push\('Drought \(90-day condition\)', `observed \(computed from the observed index\)/.test(src('report.mjs')), 'report watch list: the 90-day drought row says observed');
ok(/rainSource: t\.rainSource \|\| 'ERA5', observed: true, basis: 'observed: computed from the observed drought index/.test(src('ai.mjs')), 'AI drought facts: observed and its basis');
ok(/'\/api\/climatology\/drought'[\s\S]{0,200}observed: true, basis: 'observed: computed/.test(src('index.mjs')), '/api/climatology/drought: observed and its basis');
console.log(`\nDROUGHT-OBSERVED ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
