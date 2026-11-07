// v91.17.283.49 · 1.0.10 data item 1 · air quality is part of the place's top-level summary (one function: placesummary.mjs), read by the
// served unit (levels part, reports, Customize), the start page hazard count (bars + day summary) and Ask NIGRAAN. Unit checks, no server.
// Case: the owner's report of Islamabad I-8 (2 Nov 2026 15:54 PKT): every weather hazard below Moderate, PM2.5 Unhealthy 5 days (up to 72.4).
// Fails on 1.0.9: no placesummary.mjs, the air bar of the hazard count is "Not tested" and no day summary, the served unit has no summary.
// usage: node scripts/tests28349dat/summary113.test.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const imp = (rel) => import(pathToFileURL(join(APP, rel)).href);
const end = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

ok(existsSync(join(APP, 'server/api/placesummary.mjs')), 'one home of the place summary: server/api/placesummary.mjs');
if (!existsSync(join(APP, 'server/api/placesummary.mjs'))) end();
const PS = await imp('server/api/placesummary.mjs');
const { countOf } = await imp('server/api/hazardcount.mjs');
const { servedUnit } = await imp('server/api/served.mjs');

/* the owner's case: the smog answer of Islamabad tehsil as printed in the report (5 days Unhealthy) */
const days = [['2026-11-02', 72.4], ['2026-11-03', 63], ['2026-11-04', 69.4], ['2026-11-05', 68.9], ['2026-11-06', 67.9]].map(([date, pm25]) => ({ date, pm25, aqi: 160, aqiCategory: 'Unhealthy' }));
const SMOG = { at: '2026-11-02T10:30:00Z', days };
const HL = { ready: true, hazards: [], conditions: [{ key: 'heat', name: 'Heat stress', text: 'Low heat stress (UTCI 27.8)' }], notAssessed: [], standing: [], none: 'Every daily hazard was assessed; none reached Moderate in the period' };
const A = PS.airPart(PS.airDays(SMOG, '2026-11-02'));
ok(A.raises && A.dayCount === 5 && A.peakPm25 === 72.4 && A.worst === 'Unhealthy', 'air part: Unhealthy on 5 of 5 days, peak 72.4', JSON.stringify({ r: A.raises, n: A.dayCount, p: A.peakPm25, w: A.worst }));
const S = PS.summaryOf(HL, A);
ok(S.state === 'attention' && S.raised === true, 'summary state: attention (raised), never an all-clear', S.state);
ok(/Air quality Unhealthy on 5 of 5 days/.test(S.headline) && /72\.4 µg\/m³/.test(S.headline) && /no weather hazard reached Moderate/.test(S.headline), 'headline names the class, the days and the peak PM2.5', S.headline);
ok(!/no hazard at this site/i.test(S.headline) && /served air-quality forecast/.test(S.headline), 'headline: no "no hazard" wording; labelled as the served forecast (no skill claim)');
/* the class boundary comes from the published scale's order, not a number in code */
ok(PS.AIR_RAISES_FROM === PS.AQI_CATEGORIES.indexOf('Unhealthy for sensitive groups'), 'raised from "Unhealthy for sensitive groups" (US EPA AQI order)');
const Amod = PS.airPart(PS.airDays({ days: days.map((d) => ({ ...d, aqiCategory: 'Moderate', pm25: 20 })) }, '2026-11-02'));
ok(PS.summaryOf(HL, Amod).state === 'clear', 'Moderate air and every hazard assessed below Moderate: clear');
ok(PS.summaryOf({ ...HL, hazards: [{ key: 'heat', name: 'Heat stress', level: 'High', date: '2026-11-03' }], none: null }, A).state === 'hazard', 'a weather hazard at Moderate+ keeps state hazard (air line added)');
ok(PS.summaryOf(HL, { assessed: false, raises: false, why: 'no served air-quality value' }).state === 'incomplete', 'air not assessed: no all-clear');

/* the start page / place panel: the hazard count with the tehsil's air days */
const lead = (d) => Math.round((Date.parse(d.date) - Date.parse('2026-11-02')) / 864e5);
const SL = { ok: true, hazards: { heat: { days: [0, 1, 2, 3].map((L) => ({ lead: L, date: days[L].date, assessed: true, level: L ? 0 : 1 })) }, cold: { days: [0, 1, 2, 3].map((L) => ({ lead: L, date: days[L].date, assessed: true, level: 0 })) },
  rain: { days: [0, 1, 2, 3].map((L) => ({ lead: L, date: days[L].date, assessed: true, level: 0 })) } } };
const gate = { tagOf: () => ({ status: 'operational' }) };
const C0 = countOf(SL, gate, null, {});
const C1 = countOf(SL, gate, null, { air: PS.airDays(SMOG, '2026-11-02').map((d) => ({ ...d, lead: lead(d) })) });
const air0 = C0.days[0].bars.find((b) => b.key === 'air'), air1 = C1.days[0].bars.find((b) => b.key === 'air');
ok(air0 && air0.code === -5, 'national surface (no air handed in): the air bar is unchanged (Not tested)');
ok(air1 && air1.state === 'value' && air1.word === 'Unhealthy' && air1.counted === false && air1.raisesSummary === true && air1.pm25 === 72.4, 'place bundle: the air bar carries the served class and PM2.5, never counted', JSON.stringify(air1));
ok(C1.days[0].count === C0.days[0].count, 'the hazard count is unchanged by air quality (' + C1.days[0].count + ')');
ok(C1.days.every((d) => d.summary && d.summary.state === 'attention' && d.summary.raised && /Unhealthy/.test(d.summary.air.line)), 'every day summary is raised by the air quality');

/* the served unit (levels part, report context, Customize): summary from the same function */
const eng = { unit: () => ({ ready: true, unit: 'Federal Capital|Islamabad|Islamabad', words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], alerts: [],
  days: [0, 1, 2].map((d) => ({ day: d, date: days[d].date, layers: { heat: { name: 'Heat stress', level: d ? 0 : 1, word: d ? 'Normal' : 'Low', assessed: true }, cold: { name: 'Cold stress', level: 0, word: 'Normal', assessed: true } } })) }) };
const app = { engine: eng, smog: { unit: () => SMOG }, dataDir: join(APP, 'data'), gate: { full: () => null } };
let U = null; try { U = servedUnit(app, 'Federal Capital|Islamabad|Islamabad', true); } catch (e) { U = { err: e.message }; }
ok(U && U.summary && U.summary.state === 'attention' && U.hazardList && U.hazardList.summary === U.summary && U.hazardList.air && U.hazardList.air.dayCount >= 3, 'served unit: summary attention, carried in the hazard list (reports read it)', JSON.stringify(U && U.summary ? { s: U.summary.state, h: U.summary.headline } : U).slice(0, 200));
/* Ask NIGRAAN: the facts carry the summary and the prompt forbids an all-clear while it is raised */
const AI = readFileSync(join(APP, 'server/api/ai.mjs'), 'utf8');
ok(/f\.placeSummary = \{/.test(AI) && /Never say "no hazard"[^']*placeSummary\.raised/.test(AI), 'Ask NIGRAAN: facts.placeSummary + the rule against an all-clear while raised');
end();
