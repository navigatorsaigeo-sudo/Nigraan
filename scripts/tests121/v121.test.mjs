import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
import { partOf } from '../lib/retired.mjs';   /* v91.17.283.19: /api/fleet/nearest is the bundle's station */
/* v91.17.121 · map space and popup: search on the first toolbar row, a closable key, the street map not washed green, the popup's
   distance / height words, the point engine's "now" without waiting for the page reading, one afternoon UTCI per tehsil.
   node nigraan-local/scripts/tests121/v121.test.mjs */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __agnChrome(__T.chromiumPath()) });
const pg = await br.newPage({ viewport: { width: 1280, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return AGN.hz5.sweep().done && document.getElementById('agnPtBox') && document.getElementById('v3legend') && AGN.streets && AGN.streets.status(); } catch (_) { return false; } }, null, { timeout: 400000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(6000);
const L = await pg.evaluate(() => { const b = document.getElementById('agnPtBox').getBoundingClientRect(), g = document.getElementById('geoLevelTab').getBoundingClientRect(), m = document.getElementById('map').getBoundingClientRect();
  return { boxTop: Math.round(b.top), geoTop: Math.round(g.top), boxW: Math.round(b.width), mapTop: Math.round(m.top) }; });
ok(Math.abs(L.boxTop - L.geoTop) < 12 && L.boxW >= 150, 'search box on the first toolbar row beside Province / Tehsil', JSON.stringify(L));
const K = await pg.evaluate(async () => { const lg = document.getElementById('v3legend'), b = lg.querySelector('.agn-leg-tg'); const h0 = lg.getBoundingClientRect().height; b.click(); await new Promise(r => setTimeout(r, 300));
  const h1 = lg.getBoundingClientRect().height, saved = localStorage.getItem('agn.legend.min'); b.click(); await new Promise(r => setTimeout(r, 300)); return { h0, h1, saved, h2: lg.getBoundingClientRect().height, txt: b.textContent }; });
ok(K.h1 < 40 && K.h0 > 150 && K.saved === '1' && K.h2 > 150, 'the key closes to a tab and opens again; the choice is remembered', JSON.stringify(K));
const SV = await pg.evaluate(async () => { AGN.streets.set(true); await new Promise(r => setTimeout(r, 1500)); const p = document.querySelector('#map .leaflet-overlay-pane path');
  const o = { cls: document.documentElement.classList.contains('agn-streets-on'), fo: p ? getComputedStyle(p).fillOpacity : null, attr: (document.getElementById('agnBasemapAttr') || {}).textContent };
  AGN.streets.set(false); await new Promise(r => setTimeout(r, 800)); o.attr2 = (document.getElementById('agnBasemapAttr') || {}).textContent; o.cls2 = document.documentElement.classList.contains('agn-streets-on'); return o; });
ok(SV.cls && Number(SV.fo) <= 0.21 && /OpenStreetMap/.test(SV.attr) && !/Esri/.test(SV.attr) && !SV.cls2 && !/Streets/.test(SV.attr2 || ''), 'street map: hazard fill washed, credit line names OpenStreetMap, restored when off', JSON.stringify(SV));
for (let i = 0; i < 30; i++) { const j = await (await fetch(BASE + '/api/point?lat=33.66465&lon=73.08314')).json().then((B) => partOf(B, 'station')).catch(() => ({})); if (j && j.station) break; await new Promise(r => setTimeout(r, 5000)); }
await pg.evaluate(() => AGN.point.goText('33.66465, 73.08314', { quiet: true }));
await pg.waitForFunction(() => { const p = document.querySelector('.agn-pt-pop'); return p && /Nearest MACH station/.test(p.textContent) && /Now /.test(p.textContent); }, null, { timeout: 120000, polling: 1000 }).catch(() => {});
const P = await pg.evaluate(() => (document.querySelector('.agn-pt-pop') || {}).textContent || '');
const NJ = await (await fetch(BASE + '/api/point?lat=33.66465&lon=73.08314')).json().then((B) => partOf(B, 'station')).catch(() => ({}));
if (!NJ || !NJ.station || NJ.station.km >= 1) console.log('SKIP station wording: I-8 not usable at this hour (' + (NJ && NJ.station ? NJ.station.name + ' ' + NJ.station.km + ' km' : 'none') + ')'); else ok(/Nearest MACH station [^·]+· \d+ m away/.test(P) && /same height|m (higher|lower)/.test(P) && !/0\.0 km/.test(P) && !/\b0 m lower/.test(P), 'station distance in metres and "same height" wording', P.slice(0, 400));
ok(/Now \d/.test(P) && /90 % range/.test(P), 'popup shows the point hour with its range', P.slice(0, 400));
ok(!/Loading the exact point/.test(await pg.evaluate(() => (document.getElementById('agnPtSt') || {}).textContent || '')), 'no loading banner over the popup');
const U = await pg.evaluate(() => { try { agnOpenLiveData('Islamabad'); } catch (_) {} const t = document.querySelector('#mpLeftIn [data-agn-utci] .u') || document.querySelector('#mpLeftIn [data-agn-utci] .v');   /* v256: the tile prints the level word big (.v) and the UTCI value under it (.u) */ const di = hzDayInput('Islamabad', 'heat');
  return { tile: t ? (function (m) { return m ? parseFloat(m[0]) : null; })(String(t.textContent).match(/-?\d+(\.\d+)?/)) : null, lv: di && di.heatUtciShade != null ? Math.round(di.heatUtciShade * 10) / 10 : null }; });
if (U.lv == null) console.log('SKIP UTCI tile check: no day series for Islamabad in this page (' + JSON.stringify(U) + ')'); else ok(U.tile != null && Math.abs(U.tile - U.lv) <= 0.1, 'one afternoon UTCI: the 01 tile equals the level\'s value', JSON.stringify(U));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v121: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
