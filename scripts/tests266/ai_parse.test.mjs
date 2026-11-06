/* v91.17.266 · the AI Analyst's parsing layer, offline (no provider key, no model): a typo of a weather word is never a place,
   a question that names no place is answered for the dashboard place (context.place, or context.location + context.point),
   a plain forecast question is answered day by day with no method note in the text, and provenance is marked operatorOnly.
   usage: node scripts/tests266/ai_parse.test.mjs   (reads data/ and server/contract/units.json; starts no server) */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
process.env.NIGRAAN_DATA_DIR = process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data');
const { createAI, intentWordOf, daysAsked } = await import(join(ROOT, 'server/api/ai.mjs'));
const { buildUnitIndex } = await import(join(ROOT, 'server/api/national.mjs'));
const { createPlaces } = await import(join(ROOT, 'server/api/places.mjs'));   /* v91.17.283.18 · the one place layer */
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 300) : '')); };
const dataDir = join(ROOT, 'data');
const units = buildUnitIndex(JSON.parse(readFileSync(join(ROOT, 'server/contract/units.json'), 'utf8')), null);
const app = { dataDir, units, store: { all: () => [], filter: () => [], find: () => null, insert: async () => {} }, provider: { configured: () => false, call: async () => { throw new Error('no provider key (test)'); } } };
app.places = createPlaces(app);
const ai = createAI(app, ROOT); const H = ai.testHooks;
await new Promise((r) => setTimeout(r, 2500));   /* the place index loads 1.5 s after start */

/* 1 · intent words and typos */
for (const [w, want] of [['frecast', 'forecast'], ['wether', 'weather'], ['temprature', 'temperature'], ['tomorow', 'tomorrow'], ['forcast', 'forecast']]) ok(intentWordOf(w) === want, '1 typo ' + w + ' -> ' + want, intentWordOf(w));
const isPl = (w) => app.places.hasName(w);
for (const w of ['Raiwind', 'Gilgit', 'Lahore', 'Swat', 'Badin', 'Kohat']) ok(intentWordOf(w, isPl) == null, '1 place ' + w + ' is not an intent word');
ok(JSON.stringify(daysAsked('frecast 7 days')) === '{"n":7,"from":"today"}', '1 "frecast 7 days" asks 7 days', JSON.stringify(daysAsked('frecast 7 days')));
ok(JSON.stringify(daysAsked('7 day forecast')) === '{"n":7,"from":"today"}', '1 "7 day forecast" asks 7 days');
ok(JSON.stringify(daysAsked('rain tomorrow in Gilgit')) === '{"n":1,"from":"tomorrow"}', '1 "rain tomorrow" asks tomorrow');
ok(daysAsked('weather') && daysAsked('weather').n === 3, '1 "weather" asks the next days');

/* 2 · candidates: no typo reaches the gazetteer */
const C = (p) => H.placeCandidates(p);
ok(C('frecast 7 days').length === 0, '2 "frecast 7 days" has no place candidate', JSON.stringify(C('frecast 7 days')));
ok(C('7 day forecast').length === 0, '2 "7 day forecast" has no place candidate', JSON.stringify(C('7 day forecast')));
ok(C('Frecast Gilgit').join() === 'Gilgit', '2 "Frecast Gilgit" -> Gilgit', JSON.stringify(C('Frecast Gilgit')));
ok(C('rain tomorrow in Gilgit').map((x) => x.toLowerCase()).includes('gilgit'), '2 "rain tomorrow in Gilgit" keeps Gilgit', JSON.stringify(C('rain tomorrow in Gilgit')));
ok(C('weather in Raiwind').map((x) => x.toLowerCase()).includes('raiwind'), '2 Raiwind (a town spelt near "raining") stays a place', JSON.stringify(C('weather in Raiwind')));
{ const r = await H.resolveAskedPlace('frecast 7 days', null); ok(!r.place && !r.candidate, '2 "frecast 7 days" resolves no place and names no unresolved place', JSON.stringify(r)); }
{ const r = await H.resolveAskedPlace('wether in lahore', null); ok(r.place && /lahore/i.test(r.place.name), '2 "wether in lahore" resolves Lahore', r.place && r.place.name); }

/* 3 · the dashboard place */
ok(JSON.stringify(H.dashboardPlace({ location: 'I-8 / Islamabad', point: { lat: 33.6689, lon: 73.073 } })) === '{"name":"I-8","lat":33.6689,"lon":73.073}', '3 context.location + context.point', JSON.stringify(H.dashboardPlace({ location: 'I-8 / Islamabad', point: { lat: 33.6689, lon: 73.073 } })));
ok(JSON.stringify(H.dashboardPlace({ location: 'x', place: { name: 'Gulberg, Lahore', lat: 31.52, lon: 74.35 } })) === '{"name":"Gulberg, Lahore","lat":31.52,"lon":74.35}', '3 context.place wins');
ok(H.dashboardPlace({}) === null, '3 no dashboard place');

/* 4 · the forecast answer: day by day, no method note in the text */
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10), add = (n) => new Date(Date.parse(today + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const days = Array.from({ length: 7 }, (_, i) => ({ date: add(i), tmax_c: 30 + i, tmin_c: 18 + i / 2, rain_mm: i === 1 ? 4.2 : 0, gust_max_kmh: 20 + i }));
const unitX = { name: 'Islamabad', district: 'Islamabad', lat: 33.68, lon: 73.05, dashboardName: 'I-8', dailyForecast: { days, now: { temperature_c: 27.4, apparent_temperature_c: 28.1, relative_humidity_pct: 44 }, calibration: null }, rainChance: { days: [{ date: add(1), chancePct: { atLeast1mm: 62 } }] } };
{ const f = { daysAsked: daysAsked('frecast 7 days'), selectedUnit: unitX }; const a = H.forecastAnswer('frecast 7 days', f);
  ok(a && a.answer.split('\n').length === 8 && /^I-8 \(Islamabad tehsil\) · next 7 days/.test(a.answer), '4 "frecast 7 days" -> 7 day lines under the dashboard name', a && a.answer);
  ok(a && !/look-?up|computed|generated|bias correction|point forecast|NIGRAAN data|Based on/i.test(a.answer), '4 no method note in the answer text', a && a.answer);
  ok(a && a.notes.length >= 1, '4 the method goes to notes', a && JSON.stringify(a.notes)); }
{ const f = { daysAsked: daysAsked('rain tomorrow in Gilgit'), askedUnits: [{ ...unitX, dashboardName: undefined, name: 'Gilgit', district: 'Gilgit' }] }; const a = H.forecastAnswer('rain tomorrow in Gilgit', f);
  ok(a && /^Rain tomorrow \(.+\) at Gilgit: 4\.2 mm expected, 62% chance of a rain day\./.test(a.answer), '4 "rain tomorrow in Gilgit" leads with the rain', a && a.answer); }
{ const f = { daysAsked: daysAsked('weather'), selectedUnit: unitX }; const a = H.forecastAnswer('weather', f);
  ok(a && a.answer.split('\n').length === 5 && /Now: 27\.4 °C/.test(a.answer), '4 "weather" -> next 3 days and now', a && a.answer); }
{ const f = { daysAsked: daysAsked('7 day forecast'), selectedUnit: { name: 'Islamabad', district: 'Islamabad', dailyForecastUnavailable: 'provider down' } }; const a = H.forecastAnswer('7 day forecast', f);
  ok(a && /not available right now/.test(a.answer) && !/provider/.test(a.answer) && /provider down/.test(a.notes.join()), '4 a missing forecast says so plainly; the reason is an operator note', a && a.answer); }
ok(H.forecastAnswer('flood risk in Sukkur', { daysAsked: null, hazardsAsked: ['flood'] }) === null, '4 a hazard question is not a forecast answer');

/* 5 · interface 3: provenance marked operatorOnly */
{ const j = H.decorate({ answer: 'x', sources: ['a', 'b'], notes: ['m'] });
  ok(j.sourceChips.length === 3 && j.sourceChips.every((c) => c.operatorOnly === true) && j.operatorOnly.includes('sources') && j.operatorOnly.includes('provenance'), '5 sourceChips and operatorOnly', JSON.stringify(j)); }

console.log(`\n${fail ? 'FAIL' : 'PASS'} ai_parse: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
