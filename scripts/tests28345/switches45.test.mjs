/* v91.17.283.45 (NIGRAAN 1.0.8) · the switch states of the EWS full-scale / satellite items as decided (BUILD_NOTES_109.md):
   served: rain24; SHADOW: IMERG past rain, dew-point anchor; OFF: THS channel switch, weekly retrain rewire, gust probe.
   usage: node scripts/tests28345/switches45.test.mjs */
import { readFileSync, existsSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
const LAKE = process.env.NIGRAAN_STATION_LAKE || ((await import('node:fs')).existsSync(join(ROOT, 'station-lake', 'scripts', 'ews_rain24.py')) ? join(ROOT, 'station-lake') : join(ROOT, '..', 'station-lake'));   /* the cloud tree holds it inside; the laptop at nig\\station-lake */
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 300) : '')); } };
for (const k of ['NIGRAAN_EWS_THS', 'NIGRAAN_EWS_RAIN24', 'NIGRAAN_IMERG_PAST_RAIN', 'NIGRAAN_EWS_TD_SHADOW']) delete process.env[k];
const A = await import(pathToFileURL(join(API, 'ewsanchor.mjs')).href), R = await import(pathToFileURL(join(API, 'ewsrain.mjs')).href), I = await import(pathToFileURL(join(API, 'imergpastrain.mjs')).href);
ok(A.EWS_THS_ON() === false, 'THS channel switch OFF (no own locked test; the E1 shadow ledger is registered on Air Temperature: a new promotion id is needed)');
ok(R.EWS_RAIN24_ON() === true, 'measured rain24 SERVED');
ok(I.imergMode() === 'shadow' && I.imergOn() === false, 'IMERG past rain SHADOW (not served)');
const td = JSON.parse(readFileSync(join(ROOT, 'data', 'ews-live-anchor-td.json'), 'utf8')); ok(td.shadow === true && td.live === false, 'dew-point anchor SHADOW (live false)');
ok(!existsSync(join(ROOT, 'data', 'mos-retrain-stations.json')), 'weekly retrain rewire OFF: no data/mos-retrain-stations.json (R2 was KEPT at the locked gates)');
const src = JSON.parse(readFileSync(join(ROOT, 'data', 'ews-source.json'), 'utf8')); ok(src.probeDropped !== true, 'gust probe OFF (ews-source.json has no probeDropped:true)');
const sync = readFileSync(join(LAKE, 'scripts', 'ews_sync.py'), 'utf8'); ok(!/'probeDropped': True/.test(sync), 'ews_sync.py: the gust probe is never on by default (1.0.8 does not ship the diagnostic copy)');
const rt = readFileSync(join(LAKE, 'scripts', 'retrain.py'), 'utf8'); ok(!/mos-retrain-stations\.json/.test(rt) || !existsSync(join(ROOT, 'data', 'mos-retrain-stations.json')), 'retrain.py: no rewire switch file, the engine as before');
ok(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version === '91.17.283.45' && /build: '91\.17\.283\.45', name: 'NIGRAAN 1\.0\.8'/.test(readFileSync(join(API, 'index.mjs'), 'utf8')), 'stamped 91.17.283.45 / NIGRAAN 1.0.8');
console.log('switches45: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
