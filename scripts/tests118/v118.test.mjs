import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.118 · point engine (/api/point/forecast and the pin popup), GLOF history wording, quota report.
   node nigraan-local/scripts/tests118/v118.test.mjs (server running) */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const SUP = /\b(PMD|FFD|NASA|ERA5|IMERG|ECMWF|GloFAS|Open-Meteo|NOAA|DWD)\b/;
const P = await (await fetch(BASE + '/api/point?lat=33.67594&lon=73.06655', { signal: AbortSignal.timeout(90000) })).json();
ok(P.ok && P.place && P.place.tehsil === 'Islamabad' && P.point.elevM > 400, 'point engine places the point (tehsil, height; v283.19: the bundle place)', JSON.stringify([P.place, P.point]));
ok(P.hours.length >= 48 && P.hours.every(h => h.lo90 == null || (h.lo90 <= h.tempC && h.tempC <= h.hi90)), 'every hour carries its temperature inside its 90 % range (' + P.hours.length + ' hours)');
ok(P.days.length >= 2 && P.days.every(d => d.tmaxC >= d.tminC), 'day max / min from the corrected curve');
ok(((P.source && P.source.chain) || []).some(c => /national temperature model/.test(String(c))), 'the chain names the national model', JSON.stringify(P.source && P.source.chain));   /* v283.19: the bundle source chain */
{ const PE = { ...P, parts: undefined }; ok(!SUP.test(JSON.stringify(PE)), 'point engine output names no supplier (v283.19: the bundle\'s point state; its parts carry their own data credits)', (JSON.stringify(PE).match(SUP) || [])[0]); }
const O = await (await fetch(BASE + '/api/point?lat=34.08&lon=74.80')).json(); ok(O.ok === false && /IIOJK|disputed|outside/i.test(O.why || ''), 'a point in IIOJK is not scored', JSON.stringify(O));
const G = readFileSync(ROOT + 'server/api/glof.mjs', 'utf8'); ok(!/or a documented outburst within ' \+ param\('recurrenceYears'\)/.test(G) && /18 % of years/.test(G), 'GLOF: past outbursts are history (with their measured recurrence), not a Watch precursor');
const Q = execFileSync(process.execPath, [ROOT + 'scripts/quota_report.mjs'], { encoding: 'utf8' }); ok(/^20\d\d-\d\d-\d\d/m.test(Q), 'quota report reads the store');
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return !!(AGN.point && window.driveFromPoint && document.getElementById('agnPtInput')); } catch (_) { return false; } }, null, { timeout: 300000, polling: 1000 }).catch(() => {});
await pg.evaluate(() => AGN.point.goText('33.67594, 73.06655', { quiet: true, label: 'Test point' }));
await pg.waitForFunction(() => /Now [\d.]+ °C/.test((document.querySelector('.agn-pt-pop') || {}).innerText || '') && /Today .* °C at this point/.test((document.querySelector('.agn-pt-pop') || {}).innerText || ''), null, { timeout: 90000 }).catch(() => {});
const T = await pg.evaluate(() => (document.querySelector('.agn-pt-pop') || {}).innerText || '');
/* v91.17.283.11 · the popup reads the point state (one record for the Overview): its hourly values carry no 90 % range (not calibrated for that chain) */
ok(/Now [\d.]+ °C/.test(T) && !/90 % range/.test(T), 'pin popup: the point temperature (point state; no uncalibrated range)', T.slice(0, 400));
const T2 = await pg.evaluate(() => (document.querySelector('.agn-pt-pop') || {}).textContent || '');   /* v91.17.195 · the corrections line is in the popup's Details fold */
ok(/Today \d+–\d+ °C at this point · \S/.test(T2), 'pin popup: today\'s range at the point and the corrections applied (v91.17.283.11: the point state\'s chain)', T2.slice(0, 600));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v118: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
