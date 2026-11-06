// v91.17.283.49 · 1.0.10 data item 6 · the shown place answer (server/api/shownplace.mjs): one rounding rule and the kind of every
// now-value, so the pages cannot print 21 / 27 on one page and 21.0 / 26.8 on another. Unit checks, no server. Fails on 1.0.9 (no module,
// no `shown` in the bundle). The pages' own use of it is checked by samevalue113 (browser) and here by source (data-shown on each page).
// usage: node scripts/tests28349dat/shown113.test.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const end = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
if (!existsSync(join(APP, 'server/api/shownplace.mjs'))) { ok(false, 'server/api/shownplace.mjs exists'); end(); }
const { shownOf, t1 } = await import(pathToFileURL(join(APP, 'server/api/shownplace.mjs')).href);
ok(t1(21) === '21.0' && t1(26.84) === '26.8' && t1(-0.04) === '0.0' && t1(8.65) === '8.7' && t1(null) === null, 'one rounding rule: 21 -> 21.0, 26.84 -> 26.8, -0.04 -> 0.0');
const B = { ok: true, issuedAt: '2026-11-02T10:45:00Z', run: 'r', now: { time: '2026-11-02T15:00', tempC: 21, feelsC: 20.96, rh: 47.4, windKmh: 5.8, live: true, heatLevel: 'Normal' }, days: [{ date: '2026-11-02', lead: 0, tmaxC: 26.84, tminC: 8.6 }],
  station: { ok: true, name: 'I-8, Islamabad', km: 0.04, ageMin: 6.2, reading: { tempC: 22.36 } } };
const S = shownOf(B, { summary: { state: 'attention', raised: true, headline: 'Air quality Unhealthy ...' } });
/* v91.17.283.51 (1.0.10.2 C2): a quality-checked reading taken after the forecast hour began IS the now value (owner, 3 Nov); the forecast is the second line */
ok(S.now.kind === 'measured' && S.now.value === '22.4' && /^Temperature measured now near /.test(S.now.label) && S.now.station == null && S.now.forecastValue === '21.0', 'now: the fresher station reading, labelled measured', JSON.stringify(S.now));
ok(S.measured.value == null && /^forecast for \d\d:\d\d PKT(?: \(corrected with live station readings\))?: 21\.0 °C$/.test(S.measured.label), 'second line: the forecast, with its time', S.measured.label);
ok(S.today.high === '26.8' && S.today.low === '8.6' && S.now.feels === '21.0' && S.now.rh === '47' && S.now.wind === '6', 'today high / low and the other now values by the same rule');
const S2 = shownOf({ ...B, station: { ok: false, why: 'no AGN station reading within 25 km' } }, { feed: { text: 'station data unavailable since 15:12 PKT' } });
ok(S2.measured.value === null && /^No live temperature measurement near .* right now; the value shown is the forecast\.$/.test(S2.measured.label), 'feed down: the one sentence by location (owner 3 Nov 18:54)');
const S3 = shownOf({ ...B, station: { ok: false, why: 'no AGN station reading within 25 km' } });
ok(/^No live temperature measurement near .* right now; the value shown is the forecast\.$/.test(S3.measured.label), 'no station: says why, never a forecast labelled as measured');
const PT = readFileSync(join(APP, 'server/api/point.mjs'), 'utf8'); ok(/B\.shown = shownOf\(B, \{ summary: sm, feed(, air)? \}\)/.test(PT), 'the place bundle carries shown (point.mjs)');
const pages = { 'artefact/NIGRAAN_START.html': ['data-shown="now"', 'data-shown="today"', 'data-shown="nowLabel"', 'data-shown="measured"', 'data-shown="summaryAir"'],
  'artefact/AI_GEO_NIGRAAN_v91_17_MACH.html': ['data-shown="now"', 'data-shown="today"', 'data-shown="nowLabel"', 'data-shown="measured"', 'data-shown="summary"'],
  'artefact/NIGRAAN_3.html': ['data-shown="now"', 'data-shown="todayHigh"', 'data-shown="todayLow"', 'data-shown="nowLabel"', 'data-shown="measured"', 'data-shown="summary"'] };
for (const [f, keys] of Object.entries(pages)) { const s = readFileSync(join(APP, f), 'utf8'); const miss = keys.filter((k) => !s.includes(k)); ok(!miss.length, f + ': prints the shown strings (' + keys.length + ' keys)', miss.join(', ')); }
const ST = readFileSync(join(APP, 'artefact/NIGRAAN_START.html'), 'utf8');
ok(/tmax:SD\.high!=null\?SD\.high:r0\(d0\.tmaxC\)/.test(ST), 'start page: today high / low from the shown strings (was r0: whole degrees)');
end();
