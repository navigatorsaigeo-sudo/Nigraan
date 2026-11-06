// v91.17.283.10 · OWNER DECISION 23 Oct 2026 02:37 PKT: drought MUST appear in the client report as a monthly screening section,
// labelled "Drought screening index (observed rain and soil, updated monthly); a Low level does not rule out drought", and must never
// raise a client alert. Integration test:
//   offline (always): for a sample of tehsils the served client unit + report drought section (report.mjs droughtSectionOf over
//     served.mjs servedUnit, the real model gate) carries level, month of data and the screening note; the client alert list holds no
//     drought alert even if the engine raised one; the operator keeps it, flagged; /api/alerts applies the same owner rule (source).
//   page: the report kit prints the section with its label (080-agn-report-plus) and the escalation clock skips drought.
//   live (node drought_report_integ.test.mjs <server>): GET /api/report/context for sample tehsils in the customer view has the drought
//     section with level, month and note; GET /api/alerts and /api/levels/unit in the customer view hold no drought alert.
import { imp, src, BASE, get, CUST, ok, done } from '../tests2838/lib.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { servedUnit, NO_CLIENT_ALERT } = await imp('server/api/served.mjs');
const { droughtSectionOf, DROUGHT_TITLE } = await imp('server/api/report.mjs');
const { createGate } = await imp('server/api/gate.mjs');
const LABEL = 'Drought screening index (observed rain and soil, updated monthly); a Low level does not rule out drought';
ok(DROUGHT_TITLE === LABEL, 'report.mjs: the section title is the owner\'s label, verbatim', DROUGHT_TITLE);
ok(NO_CLIENT_ALERT && /never a client alert/.test(NO_CLIENT_ALERT.drought || ''), 'served.mjs: the owner rule "drought never raises a client alert" is explicit', JSON.stringify(NO_CLIENT_ALERT));

/* a stub engine over the REAL gate (data/model-gate.resolved.json): 4 sample tehsils, each class of the drought ladder, each with an
   engine drought alert (the engine may raise one; the client must not see it) and a heat row as control */
const SAMPLE = [['Punjab|Lahore|Lahore City', 'Low', 0], ['Sindh|Tharparkar|Mithi', 'Monitor', 2], ['Balochistan|Quetta|Quetta City', 'Watch', 3], ['Khyber Pakhtunkhwa|Peshawar|Peshawar Town-I', 'Act', 4]];
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const gate = createGate(join(ROOT, 'data'));
const engine = { unit: (uid) => { const s = SAMPLE.find((x) => x[0] === uid); return { ready: true, unit: uid, words: WORDS, alertsDay: 0,
  days: [0, 1].map((d) => ({ day: d, date: '2026-10-2' + (3 + d), layers: { drought: { name: 'Drought', level: s[2], word: WORDS[s[2]] }, heat: { name: 'Heat stress', level: 1, word: 'Low' } } })),
  alerts: [{ hazard: 'drought', name: uid.split('|')[2], band: s[1] === 'Low' ? 'Monitor' : s[1], day: 0 }] }; } };
const climatology = { droughtNational: () => ({ ready: true, month: { month: '2026-09', label: 'September 2026' },
  units: Object.fromEntries(SAMPLE.map(([u, c]) => [u, { drought: { class: c }, month: { basis: 'calendar month', month: '2026-09', label: 'September 2026' } }])) }) };
const app = { engine, gate, climatology, dataDir: join(ROOT, 'data') };
for (const [uid, cls] of SAMPLE) {
  const L = servedUnit(app, uid, false);
  ok(L && L.ready && !(L.alerts || []).some((a) => a.hazard === 'drought') && (L.alertsWithheld || []).some((w) => w.hazard === 'drought'), uid + ': client alert list holds no drought alert (withheld, with the reason)', JSON.stringify({ alerts: L.alerts, withheld: L.alertsWithheld }).slice(0, 300));
  const O = servedUnit(app, uid, true);
  ok(O && (O.alerts || []).some((a) => a.hazard === 'drought' && a.clientWithheld === true), uid + ': the operator keeps the engine\'s drought row, flagged clientWithheld');
  const levels = { ready: true, days: L.days.map((d) => ({ day: d.day, date: d.date, layers: Object.fromEntries(Object.entries(d.layers).map(([k, v]) => [k, { name: v.name, word: v.assessed === false ? 'Not assessed' : v.word, productType: v.productType || null }])) })) };
  const S = droughtSectionOf(app, { unitId: uid }, levels);
  ok(S && S.title === LABEL && S.level === levels.days[0].layers.drought.word && S.droughtClass === cls && S.month === 'September 2026' && /1 in 4/.test(S.note) && S.raisesAlert === false && S.productType === 'Screening index',
    uid + ': report drought section has the label, the served level (' + (S && S.level) + '), class ' + cls + ', the month of data and the screening note', JSON.stringify(S).slice(0, 400));
}
/* no drought table yet: the section is still there, Not assessed, with the reason */
const S0 = droughtSectionOf({ climatology: { droughtNational: () => ({ ready: false, why: 'the national SPI/SPEI table has not been built yet' }) } }, { unitId: 'x' }, { ready: false });
ok(S0 && S0.title === LABEL && S0.level === 'Not assessed' && S0.month === 'not available' && /not been built/.test(S0.notAssessedWhy || ''), 'no drought table: the section stays in the report, Not assessed, with the reason', JSON.stringify(S0).slice(0, 300));

/* /api/alerts applies the same rule; report.mjs puts the section into every context */
const IDX = src('server/api/index.mjs'), RP = src('server/api/report.mjs');
ok(/\(hz && NO_CLIENT_ALERT\[hz\]\) \? NO_CLIENT_ALERT\[hz\]/.test(IDX), '/api/alerts (customer view): drought rows withheld by the owner rule');
ok(/ctx\.drought = droughtSectionOf\(app, u, ctx\.levels\)/.test(RP), 'report.mjs context(): every report context carries ctx.drought');
/* the page report kit prints it */
const K = src('server/science/modules/080-agn-report-plus-js.js');
ok(K.includes('rpt-drought') && K.includes('C.drought') && K.includes('screening index (observed rain and soil, updated monthly)'), 'report kit (080-agn-report-plus): prints the drought screening section with the owner\'s label from the server context');

if (BASE) {
  const units = ['Punjab|Lahore|Lahore City', 'Sindh|Tharparkar|Mithi', 'Sindh|Sujawal|Jati', 'Balochistan|Quetta|Quetta City', 'Khyber Pakhtunkhwa|Peshawar|Town-I'];
  let n = 0;
  for (const u of units) {
    const r = await get('/api/report/context?unit=' + encodeURIComponent(u) + '&section=operations', CUST);
    if (r.s !== 200 || !r.j) { ok(false, 'live: report context for ' + u, String(r.s) + ' ' + String(r.t).slice(0, 200)); continue; } n++;
    const D = r.j.drought;
    ok(D && D.title === LABEL && typeof D.level === 'string' && D.level.length && typeof D.month === 'string' && /1 in 4/.test(D.note || '') && D.raisesAlert === false, 'live: customer report context for ' + u + ' has the drought section (level ' + (D && D.level) + ', month ' + (D && D.month) + ', note)', JSON.stringify(D).slice(0, 300));
    const lu = await get('/api/levels/unit?unit=' + encodeURIComponent(u), CUST);
    if (lu.s === 200 && lu.j) ok(!(lu.j.alerts || []).some((a) => a.hazard === 'drought'), 'live: customer /api/levels/unit ' + u + ' holds no drought alert');
  }
  ok(n >= 3, 'live: report contexts answered for the sample', n + ' of ' + units.length);
  const al = await get('/api/alerts', CUST);
  ok(al.s === 200 && al.j && !(al.j.rows || []).some((a) => a && a.hazard === 'drought'), 'live: customer /api/alerts holds no drought alert', JSON.stringify(al.j && (al.j.rows || []).map((a) => a.hazard)).slice(0, 200));
} else console.log('     (live part skipped: no server address)');
done('DROUGHT-REPORT-INTEG');
