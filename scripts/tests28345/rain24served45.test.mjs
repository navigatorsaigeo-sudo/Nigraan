/* v91.17.283.45 (NIGRAAN 1.0.8) · measured past-24 h rain at the 44 gauges that passed C2 is SERVED by default (a fact beside the model rain,
   never a level); NIGRAAN_EWS_RAIN24=0 is the off state. usage: node scripts/tests28345/rain24served45.test.mjs */
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
const LAKE = process.env.NIGRAAN_STATION_LAKE || ((await import('node:fs')).existsSync(join(ROOT, 'station-lake', 'scripts', 'ews_rain24.py')) ? join(ROOT, 'station-lake') : join(ROOT, '..', 'station-lake'));   /* the cloud tree holds it inside; the laptop at nig\\station-lake */
const R = await import(pathToFileURL(join(API, 'ewsrain.mjs')).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 300) : '')); } };
const G = JSON.parse(readFileSync(join(ROOT, 'data', 'ews-rain24-gauges.json'), 'utf8')); const C2SHA = 'e0c862663c0e9038690e13dc4032db9e289e05d1d0ab6a41dd0e88c05d384180';   /* sha256 of JSON.stringify(ids) of the locked result ews_full/results/ews-rain24-gauges.json (1 Nov 2026) */
const shaIds = (await import('node:crypto')).createHash('sha256').update(JSON.stringify(G.ids || [])).digest('hex');
ok(Array.isArray(G.ids) && G.ids.length === 44 && shaIds === C2SHA, 'the allow list is the 44 gauges that passed C2 (identical to the locked result file)', G.ids && G.ids.length);
ok(R.REACH_KM === 5 && R.REACH_DZ_M === 500, 'reach = the pre-registered C3 rule (5 km, 500 m)');
const D = mkdtempSync(join(tmpdir(), 'v45r24-')); const now = Date.parse('2026-11-02T04:30:00Z'); const id = G.ids[0];
writeFileSync(join(D, 'ews-rain24.json'), JSON.stringify({ end: '2026-11-02T04:00Z', gauges: [{ id, lat: 36.0, lon: 74.0, elev: 3000, mm24: 3.14, complete: true }] })); writeFileSync(join(D, 'ews-rain24-gauges.json'), JSON.stringify(G));
delete process.env.NIGRAAN_EWS_RAIN24; const m = R.measuredRain24(D, 36.0, 74.0, 3000, now);
ok(R.EWS_RAIN24_ON() === true && m && m.mm === 3.1 && /measured at a nearby rain gauge/.test(m.basis) && /does not set any level/.test(m.note), 'switch unset: served (rounded to 0.1 mm, labelled as a measurement)', JSON.stringify(m));
process.env.NIGRAAN_EWS_RAIN24 = '0'; ok(R.EWS_RAIN24_ON() === false && R.measuredRain24(D, 36.0, 74.0, 3000, now) === null, 'NIGRAAN_EWS_RAIN24=0: off, reads nothing'); delete process.env.NIGRAAN_EWS_RAIN24;
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const ai = strip(readFileSync(join(API, 'ai.mjs'), 'utf8')); const uses = ai.split('\n').filter((l) => /measuredRain24|rainPast24Measured/.test(l));
ok(uses.length === 2 && uses.every((l) => !/level|alert|Level/.test(l.replace(/catchmentWetness/g, ''))), 'ai.mjs only adds catchmentWetness.rainPast24Measured (a fact); no level or alert reads it', uses.join('\n').slice(0, 300));
const readers = (await import('node:fs')).readdirSync(API).filter((f) => /\.mjs$/.test(f) && f !== 'ewsrain.mjs').filter((f) => /ewsrain|ews-rain24/.test(strip(readFileSync(join(API, f), 'utf8')))).sort();
ok(JSON.stringify(readers) === JSON.stringify(['ai.mjs']), 'only ai.mjs reads the measurement (no hazard, level, alert or report module)', readers.join(','));
const py = strip(readFileSync(join(API, 'pyjobs.mjs'), 'utf8')); ok(/NIGRAAN_EWS_RAIN24 !== '0' \? \[\{ id: 'ewsRain24'/.test(py), 'the producer job ewsRain24 runs unless NIGRAAN_EWS_RAIN24=0');
const SL = readFileSync(join(LAKE, 'scripts', 'ews_rain24.py'), 'utf8'); ok(/from qc_build import rain_increment, screen/.test(SL), 'the producer uses the archive\'s own increment and screen rule (qc_build)');
console.log('rain24served45: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
