import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.128 · one psychrometric module (A-03: dew point, relative humidity, wet bulb at height), one NOW per point in the map
   popup (U-03), and the interface fixes U-12/13/16/17/18/20/22/24/26/27/28/31/34/35/37/38/40. node scripts/tests128/v128.test.mjs */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { fileURLToPath as __agnF2P } from 'node:url';
const __agnPath = (u) => { const p = __agnF2P(u); return /[\\/]$/.test(u.href) && !/[\\/]$/.test(p) ? p + '/' : p; };   /* v91.17.255 · B-7 · Windows: URL.pathname gave /D:/... */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
const APP = __agnPath(new URL('../../', import.meta.url)).replace(/^\/([A-Za-z]:)/, '$1');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const P = await import(new URL('../../server/api/psychro.mjs', import.meta.url).href);

/* 1 · the module: exact inverse, saturation identity, height dependence, refusal */
let worstRT = 0; for (const t of [-10, 0, 10, 20, 30, 40, 48]) for (const r of [5, 20, 50, 80, 99]) { const td = P.dewPointC(t, r); worstRT = Math.max(worstRT, Math.abs(P.rhFromDew(t, td) - r)); }
ok(worstRT < 1e-9, 'relative humidity -> dew point -> relative humidity returns the input (worst ' + worstRT.toExponential(1) + ' %)');
ok(P.wetBulbC(30, 100) === 30 && P.wetBulbC(30, 100, { elevationM: 3000 }) === 30, 'at saturation the wet bulb is the air temperature at any height');
ok(P.wetBulbC(35, 25, { elevationM: 1500 }) < P.wetBulbC(35, 25) - 0.7, 'thinner air at 1,500 m gives a lower wet bulb than sea level', [P.wetBulbC(35, 25, { elevationM: 1500 }), P.wetBulbC(35, 25)].join(' vs '));
ok(P.wetBulbC(30, -5) === null && P.wetBulbC(70, 50) === null, 'non-physical inputs are refused');
/* the page's documented reference cases (base v91.3 comment: psychrometric at station pressure) */
const ref = [[10, 38, 55, 29.87], [540, 40, 45, 29.11], [1500, 35, 25, 19.64], [1680, 36, 20, 18.70], [2228, 32, 30, 18.51]];
const refErr = ref.map(([z, t, r, w]) => Math.abs(P.wetBulbC(t, r, { elevationM: z }) - w));
ok(Math.max(...refErr) < 0.02, 'the five documented Pakistan reference cases (Karachi to Skardu) reproduce to 0.02 C', refErr.map(x => x.toFixed(3)).join(','));

/* 2 · no other moist-air constants on the server */
const api = APP + 'server/api/', bad = [];
for (const f of readdirSync(api).filter(f => f.endsWith('.mjs') && f !== 'psychro.mjs')) { const s = readFileSync(api + f, 'utf8');
  if (/17\.62\s*\*|17\.625\s*\*|17\.27\s*\*|atan\(0\.151977/.test(s)) bad.push(f); }
ok(!bad.length, 'no server module keeps its own Magnus constants or Stull fit', bad.join(','));

/* 3 · page and server agree */
const PW = __T.playwrightSync();
const br = await __T.launch(PW.chromium, { executablePath: process.env.PW_CHROME || __agnChrome(__T.chromiumPath()) });
const pg = await br.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return typeof wetBulbStullC === 'function' && typeof dewPointC === 'function' && AGN.data.activePoint(); } catch (_) { return false; } }, null, { timeout: 300000, polling: 2000 }).catch(() => {});
const grid = []; for (const z of [0, 500, 1500, 2500, 4000]) for (const t of [5, 20, 32, 40, 46]) for (const r of [8, 30, 60, 90]) grid.push([z, t, r]);
const PG = await pg.evaluate((g) => g.map(([z, t, r]) => [wetBulbStullC(t, r, { elevationM: z }), dewPointC(t, r)]), grid);
let wW = 0, wD = 0; grid.forEach(([z, t, r], i) => { wW = Math.max(wW, Math.abs(P.wetBulbC(t, r, { elevationM: z }) - PG[i][0])); wD = Math.max(wD, Math.abs(P.dewPointC(t, r) - PG[i][1])); });
ok(wW <= 1e-4 && wD < 1e-9, 'page and server give the same wet bulb at height (within the page solver\'s 1e-4 C bracket, v91.17.163 O11) and the same dew point on ' + grid.length + ' cases', 'wet bulb ' + wW + ' dew ' + wD);

/* 4 · interface */
await pg.waitForTimeout(15000);
const UI = await pg.evaluate(() => ({ scale: !!document.querySelector('.agn-risk-scale'), humLabel: (document.getElementById('riskHum') || {}).closest ? document.getElementById('riskHum').closest('.risk-rowx').textContent : '',
  rec: recoveryWindow({}, { heatStress: 5 }), ops: [...document.querySelectorAll('[data-opsx]')].map(b => b.textContent.trim()).join('|'),
  font: getComputedStyle(document.querySelector('select')).fontFamily === getComputedStyle(document.body).fontFamily }));
ok(UI.scale && /Humidity load/.test(UI.humLabel), 'the comfort bars carry their 0-100 scale and the humidity bar is named as a load score');
ok(UI.rec[0] === 'Not needed', 'with no heat stress the recovery window says it is not needed (was 00:00 at night)', JSON.stringify(UI.rec));
ok(!/Situation Room|Action Centre|Post Event Verification/.test(UI.ops), 'Operations sub-tabs in sentence case', UI.ops);
ok(UI.font, 'form controls use the page font');
const OB = await pg.evaluate(async () => { const b = document.querySelector('[data-goto="livedata"]') || document.querySelector('button[data-view="livedata"]'); if (b) b.click(); await new Promise(r => setTimeout(r, 9000));
  return { k: (document.getElementById('agnObsKpis') || {}).textContent || '', st: (document.getElementById('agnObsStamp') || {}).textContent || '', names: [...document.querySelectorAll('#agnObsTable tbody tr td:nth-child(2)')].map(t => t.textContent) }; });
ok(!OB.k || /\b108\b/.test(OB.k), 'the fleet count is every registered station (108)', OB.k.slice(0, 300));
ok(!/Updated/.test(OB.st) || /\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2} PKT/.test(OB.st), 'the Observations stamp is 24 h Pakistan time', OB.st);
ok(!OB.names.some(n => /,\s*$/.test(n)), 'no station name ends in a comma');
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();

/* 5 · built page and sources */
const ART = readFileSync(APP + 'artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', 'utf8');
ok(!/\b(model|reanalysis|the)\s+\1\b/i.test(ART.replace(/<script[^>]*src[^>]*><\/script>/g, '')), 'no doubled words left by the supplier-name rewrite');
ok(!/font(-size)?:\s*(\d{3}\s+)?(9|10|10\.5)px/.test(ART.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'no CSS font below 11 px');
/* v91.17.283.6 · expected text updated to the intended wording of v91.17.283.2 S7 / S10e (build/v2832/apply2832.py, CHANGES v283.2 "Old suites":
   the chip counts AREAS at High or Severe from the issued run, as the start page does; "places" became "areas"). The check is as strict as
   before: the High-or-Severe count wording must be there (chip and list head) and "places need checking" must not. */
ok(/'areas High or Severe'/.test(ART) && /' at High or Severe · click to zoom'/.test(ART) && !/places need checking/.test(ART), 'the map chip counts areas at High or Severe (v283.2 S7 wording), not "places need checking"');
ok(/:focus-visible\{outline:2px solid #0C3851!important/.test(ART), 'every keyboard focus shows a ring');
ok(!/phase:'0\d · /.test(ART) && !/District integrity:/.test(ART), 'no internal numbering or changelog wording in Operations');
/* v91.17.266 · the formatted financial example value left with the Financial tab (owner decision) */
ok(/agnDaysWhy/.test(ART) && /agn-slow-note/.test(ART) && !/agnFinExValueFmt/.test(ART), 'day-button reason and slow-source note are in the page; no financial example value');
const MU = readFileSync(APP + 'build/map_ui.html', 'utf8');
ok(/pv\(pn\.rh,rec\.hum\)/.test(MU) && /pv\(pn\.windKmh,rec\.wind\)/.test(MU), 'the point popup reads humidity and wind from the point engine hour');
console.log((fails ? 'FAIL' : 'PASS') + ' v128: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
