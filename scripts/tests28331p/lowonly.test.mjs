/* v91.17.283.31 · owner (29 Oct) · the heat side mirrors the cold fix, and a report lists a hazard only at Moderate or above:
   - UTCI 26-32 is heat Low, worded "moderate heat stress" (register utci.heatLevels); cold Low is "moderate cold stress"; Low never alerts
   - a place with only Low values gives a report with no hazard listed ("Every daily hazard was assessed; none reached Moderate in the period", v283.36 item 23) and Low as condition lines,
     in the server report context, the console reports (r268), the report add-on and NIGRAAN_3 */
import { readFileSync } from 'node:fs';
import { T, browser, open, consoleReady } from '../tests28328p/lib.mjs';
const t = T();
const U = await import('../../server/api/utcilevel.mjs'), RP = await import('../../server/api/report.mjs');
const reg = JSON.parse(readFileSync(new URL('../../data/thresholds-register.json', import.meta.url), 'utf8')), rows = Array.isArray(reg) ? reg : reg.rows;
const hl = rows.find((r) => r.id === 'utci.heatLevels'), cl = rows.find((r) => r.id === 'utci.coldLevels');
t.ok(hl && JSON.stringify(hl.value.bandsC[0]) === JSON.stringify([26, 32, 'Low']) && hl.value.lowWords === 'moderate heat stress', 'register: utci.heatLevels Low 26-32 "moderate heat stress"', JSON.stringify(hl && hl.value));
t.ok(cl && cl.value.lowWords === 'moderate cold stress', 'register: utci.coldLevels Low worded "moderate cold stress"');
const cells = [25.9, 26, 31.9, 32, 38, 46].map((u) => [u, U.heatCellOf(u)]);
t.ok(cells.map(([, c]) => c.word).join() === 'Normal,Low,Low,Moderate,High,Severe', 'heat level of UTCI 25.9/26/31.9/32/38/46', JSON.stringify(cells.map(([u, c]) => [u, c.word])));
t.ok(U.heatCellOf(28).condition === 'moderate heat stress' && U.coldCellOf(-5).condition === 'moderate cold stress' && U.heatCellOf(35).condition == null, 'Low carries its condition words; Moderate has none');
const lowOnly = { ready: true, days: [{ day: 0, date: '2026-10-29', layers: { heat: { name: 'Heat', word: 'Low' }, cold: { name: 'Cold', word: 'Normal' }, wind: { name: 'Wind', word: 'Low' } } }, { day: 1, date: '2026-10-30', layers: { heat: { name: 'Heat', word: 'Low' }, wind: { name: 'Wind', word: 'Normal' } } }] };
const HL = RP.hazardListOf(lowOnly);
t.ok(HL.ready && HL.hazards.length === 0 && HL.none === 'Every daily hazard was assessed; none reached Moderate in the period' && HL.conditions.some((c) => /^Low heat stress/.test(c.text)) && HL.conditions.every((c) => c.raisesAlert === false), 'server report context: only Low -> no hazard listed, Low as condition lines', JSON.stringify(HL));
const mod = RP.hazardListOf({ ready: true, days: [{ day: 0, date: '2026-10-29', layers: { heat: { name: 'Heat', word: 'Moderate' }, wind: { name: 'Wind', word: 'Low' } } }] });
t.ok(mod.hazards.length === 1 && mod.hazards[0].key === 'heat' && mod.none === null && mod.conditions.length === 1, 'server report context: Moderate listed, Low a condition', JSON.stringify(mod));
const N3 = readFileSync(new URL('../../artefact/NIGRAAN_3.html', import.meta.url), 'utf8');
/* v91.17.283.35 · audit A3: the "no hazard" sentence is the server's (levels.hazardList), never a page literal */
t.ok(/h\.max!=null&&h\.max>=2&&/.test(N3) && /HL\.none\|\|HL\.partial\|\|HL\.nothingAssessed/.test(N3) && /moderate heat stress/.test(N3), 'NIGRAAN_3 site report: hazards at Moderate or above, the server\'s "no hazard" sentence, Low as conditions');
const MACH = readFileSync(new URL('../../artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', import.meta.url), 'utf8');
t.ok(/topRank<VR\.Moderate\) \? \(\(C\.hazardList&&C\.hazardList\.ready&&!C\.hazardList\.none\)/.test(MACH) && /:'no hazard at this site in the period'\)/.test(MACH), 'report add-on: nothing at Moderate -> the server\'s sentence (no hazard only when all were assessed)');
/* the console reports (r268) render the Hazards section from a place with only Low levels */
const br = await browser();
const o = await open(br, '/analyst'); const pg = o.pg; await consoleReady(pg);
const r = await pg.evaluate((HL) => { const row = (i) => [{ i, date: '2026-10-29' }, { i: 0, date: '2026-10-30' }];
  const EN = { days: [{ date: '2026-10-29' }, { date: '2026-10-30' }], hz: [{ key: 'heat', label: 'Heat', peak: { i: 1, date: '2026-10-29' }, row: row(1) }, { key: 'cold', label: 'Cold', peak: { i: 0, date: '2026-10-29' }, row: row(0) }, { key: 'wind', label: 'Wind', peak: { i: 1, date: '2026-10-30' }, row: row(1) }] };
  const SH = AGN.reportLevels.shownOf(EN); return { shown: SH.shown.length, html: AGN.reportLevels.findings(EN, HL) }; }, HL);   /* v283.35: the server's hazard list (hazardListOf) is passed, as the served unit carries it */
t.ok(r.shown === 0, 'console report: only Low -> no hazard listed', JSON.stringify(r.shown));
t.ok(/Every daily hazard was assessed; none reached Moderate in the period/.test(r.html) && /Low heat stress/.test(r.html) && !/rk-find|finding/i.test(r.html.replace(/rk-nohaz|rk-cond/g, '')), 'console report: the Hazards section says no hazard and gives Low as a condition line', r.html.slice(0, 400));
t.ok(o.errs.length === 0, 'no page errors', o.errs.join(' | '));
await br.close(); t.done();
