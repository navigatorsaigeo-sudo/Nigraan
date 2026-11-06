import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.280 · FIX280 · three defects seen live 19 Oct 2026 (items 1, 2, 4 of the brief).
//  (item 3, a rooftop station label, was withdrawn by the owner on 19 Oct: no label, the siting offset unchanged)
//  R  point forecast "likely range": every hour's 90 % range is the national model's own spread for that hour, moved with every later
//     chain stage (synoptic running correction, weather MOS, live stations, final corrections), so it stays centred where the national
//     stage centred it (live 03:00 PKT, Gilgit: 9.7 C with 7.2-17.7, the synoptic step had moved the value -3 C and left the range).
//     Server check at 10 places: (value - lo, hi - value) per hour equal those of the same forecast with the later stages off
//     (/px __nolive=1&__nowx=1), so no band is wider or shifted against its source; the count of hours a later stage moved is printed.
//  Q  earthquakes: an event alerts for 24 h after its origin time, then stays a map reference; level words describe shaking only, no
//     damage phrase anywhere in the served answer (module test on the real rule file, fixture copy; no network).
//  P  start page: the card keeps "lat, lon" on one line and the first view fits Pakistan at 1366 x 768 (browser).
// usage: node scripts/tests280/fix280.test.mjs <base url>
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:9041';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 400) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 900) : '')); } };
const realFetch = globalThis.fetch;

/* ---------- R · the hourly 90 % range ---------- */
const PLACES = [['Gilgit', 35.9, 74.37], ['Gilgit airport', 35.919, 74.334], ['Skardu', 35.3, 75.63], ['Chitral', 35.85, 71.79], ['Islamabad G-8', 33.6942, 73.0524],
  ['Lahore', 31.52, 74.36], ['Karachi', 24.86, 67.01], ['Quetta', 30.18, 66.98], ['Peshawar', 34.01, 71.58], ['Multan', 30.2, 71.47]];
{ let checked = 0, moved = 0, worst = 0, night = 0, nightOk = 0, bad = [], skipped = 0; const synopAt = [];
  for (const [nm, la, lo] of PLACES) {
    let el = null; try { const pf = await (await realFetch(BASE + '/api/point?lat=' + la + '&lon=' + lo)).json(); el = pf && pf.point ? pf.point.elevM : null;   /* v283.19: the place bundle */ } catch (_) { el = null; }
    const q = 'latitude=' + la + '&longitude=' + lo + (el != null ? '&elevation=' + Math.round(el) : '') + '&hourly=temperature_2m&forecast_days=4&timezone=Asia%2FKarachi&__omhost=api.open-meteo.com';   /* the point engine's own request */
    const get = async (x) => { try { const r = await realFetch(BASE + '/px/v1/forecast?' + q + x, { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'point-engine' }, signal: AbortSignal.timeout(90000) }); return r.ok ? r.json() : null; } catch (_) { return null; } };
    const [A, B] = await Promise.all([get(''), get('&__nolive=1&__nowx=1')]);
    const RA = A && A.agn_national && A.agn_national.range90, RB = B && B.agn_national && B.agn_national.range90;
    if (!RA || !RB) { console.log('   ' + nm + ': no national range here (' + (A && A.agn_national ? 'national ' + A.agn_national.applied : 'no national block') + ')'); continue; }
    /* __nolive also removes the MACH running correction (L2), which runs BEFORE the national stage: such a place has no clean reference */
    if (/L2/.test(String((A.agn_temperature_basis || {}).correction || ''))) { console.log('   ' + nm + ': MACH running correction before the national stage, no clean reference; skipped'); skipped++; continue; }
    if (A.agn_synop && A.agn_synop.applied) synopAt.push(nm + ' (' + A.agn_synop.station + ', now ' + A.agn_synop.nowTermC + ' C)');
    const TA = A.hourly.temperature_2m, TB = B.hourly.temperature_2m, tm = A.hourly.time;
    for (let i = 0; i < TA.length; i++) { if (RA.lo[i] == null || RB.lo[i] == null || TA[i] == null || TB[i] == null) continue; checked++;
      const dl = (TA[i] - RA.lo[i]) - (TB[i] - RB.lo[i]), dh = (RA.hi[i] - TA[i]) - (RB.hi[i] - TB[i]), w = (RA.hi[i] - RA.lo[i]) - (RB.hi[i] - RB.lo[i]);
      if (Math.abs(TA[i] - TB[i]) >= 0.05) moved++; const e = Math.max(Math.abs(dl), Math.abs(dh), Math.abs(w)); if (e > worst) worst = e;
      const h = +String(tm[i]).slice(11, 13); if (h >= 20 || h <= 5) { night++; if (Math.abs(w) <= 0.15 && TA[i] >= RA.lo[i] && TA[i] <= RA.hi[i]) nightOk++; }
      if (e > 0.15 && bad.length < 4) bad.push(nm + ' ' + tm[i] + ' T ' + TA[i] + ' [' + RA.lo[i] + ', ' + RA.hi[i] + '] vs source T ' + TB[i] + ' [' + RB.lo[i] + ', ' + RB.hi[i] + ']'); } }
  console.log('   range: ' + checked + ' hours at ' + PLACES.length + ' places; a later stage moved the value at ' + moved + ' of them; worst offset difference ' + worst.toFixed(2) + ' C');
  ok(checked > 150 && worst <= 0.15, 'R1 every hour: value - lo and hi - value equal the national stage\'s own spread for that hour (rounding 0.1)', bad.join(' | ') || 'worst ' + worst.toFixed(2));
  ok(night > 40 && nightOk === night, 'R2 night hours (20-05 PKT): no band wider than the source\'s hourly spread, and the value inside its band', nightOk + '/' + night);
  /* v91.17.283.19: /api/point/forecast is retired; the place bundle (the point state) shows no uncalibrated band (v283.12 rule), the band
     stays on the served national stage checked in R1 / R2 */
  const pe = await (await realFetch(BASE + '/api/point?lat=35.9&lon=74.37')).json().catch(() => null);
  const hs = pe && pe.ok ? pe.hours : [];
  ok(hs.length > 20 && hs.every((h) => h.lo90 == null && h.hi90 == null), 'R3 the place bundle at Gilgit: ' + hs.length + ' hours, none with an uncalibrated band (the band is the served national stage\'s, R1 / R2)'); }

/* ---------- Q · earthquakes: 24 h alert window, shaking words only ---------- */
{ process.env.NIGRAAN_QUAKE = '0';
  const { createQuake } = await import(join(ROOT, 'server/api/quake.mjs'));
  const D = mkdtempSync(join(tmpdir(), 'fix280-q-')); mkdirSync(join(D, 'cache', 'quake'), { recursive: true });
  copyFileSync(join(FX, 'seismic-felt-rule.json'), join(D, 'seismic-felt-rule.json')); copyFileSync(join(ROOT, 'data', 'pk-tehsils.json'), join(D, 'pk-tehsils.json'));
  const now = Date.now(), fl = (lv, i, mmi) => ({ uid: 'Balochistan|Khuzdar|Khuzdar', tehsil: 'Khuzdar', district: 'Khuzdar', province: 'Balochistan', level: lv, levelIndex: i, expectedIntensity: mmi, distanceKm: 0, source: 'equation' });
  const ev = (id, agoH, mag) => ({ id, time: now - agoH * 3600e3, updated: now - agoH * 3600e3, mag, magType: 'mww', depthKm: 10, lon: 66.63, lat: 27.83, place: 'Khuzdar, Pakistan', status: 'reviewed', shakemap: false, via: 'feed', flags: [fl('Severe', 4, 6.9)] });
  writeFileSync(join(D, 'cache', 'quake', 'state.json'), JSON.stringify({ events: [ev('us7000old', 48, 5.7), ev('us7000new', 2, 5.4)], lastPollOk: now }));
  globalThis.fetch = async () => { throw new Error('offline test'); };
  const Q = createQuake({}, D, {}); const r = await Q.route('/api/quake/live', new URL('http://x/api/quake/live'), { method: 'GET' }); globalThis.fetch = realFetch;
  const b = r && r.body; const E = (b && b.events) || []; const old = E.find((e) => e.id === 'us7000old'), nw = E.find((e) => e.id === 'us7000new');
  ok(old && old.withinAlertWindow === false && nw && nw.withinAlertWindow === true && b.alertWindowHours === 24, 'Q1 an event 48 h old no longer alerts, one 2 h old does (24 h window, owner rule)', JSON.stringify({ old: old && old.withinAlertWindow, nw: nw && nw.withinAlertWindow, h: b && b.alertWindowHours }));
  ok(old && E.length === 2, 'Q2 the 48 h old event is still served for the map (reference only)');
  const txt = JSON.stringify(b || {}); ok(b && !/damage/i.test(txt), 'Q3 no damage phrase anywhere in the served earthquake answer', (txt.match(/.{60}damage.{40}/i) || [''])[0]);
  const sev = (b.levels || []).find((l) => l.level === 'Severe'), hi = (b.levels || []).find((l) => l.level === 'High');
  ok(sev && /^very strong shaking or stronger/.test(sev.plain) && hi && /^strong shaking/.test(hi.plain), 'Q4 level words describe shaking intensity only (ShakeMap perceived-shaking column)', (b.levels || []).map((l) => l.level + ': ' + l.plain).join(' | '));
  const W = (b.flagged || []).filter((f) => f.withinAlertWindow && f.levelIndex >= 3);
  ok(W.length === 1 && W[0].eventId === 'us7000new', 'Q5 the alert list (flagged, in window, High or above) holds the 2 h event only', JSON.stringify(W.map((f) => f.eventId)));
  /* the console builds the alert row from these words (agn-quake-js alertRows; v280 SYN280: basis = '<Level> shaking expected · intensity <class>, <time>', the class from the served plain words) */
  const page = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8'); const qi = page.indexOf('<script id="agn-quake-js">'), qs = page.slice(qi, page.indexOf('</script>', qi));
  ok(qi > 0 && !/damage/i.test(qs) && /basis:f\.level\+' shaking expected'\+\(function\(m\)\{ return m\?' \\u00b7 intensity '\+m\[1\]:''; \}\)\(\/\\\(intensity \(\[\^\)\]\+\)\\\)\/\.exec\(plain\(f\.levelIndex\)\)\)/.test(qs) && /f\.withinAlertWindow/.test(qs), 'Q6 the console alert row and popups take the served shaking words and window; no damage phrase in that script'); }

/* ---------- P · pages ---------- */
{
  const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
  const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await pg.waitForFunction(() => window.map && window.AGNSTART, null, { timeout: 30000 }).catch(() => {}); await pg.waitForTimeout(1500);
  const fit = await pg.evaluate(() => { const m = window.map, a = m.latLngToContainerPoint([37.1, 60.8]), b = m.latLngToContainerPoint([23.6, 77.9]), s = m.getSize(); return { z: m.getZoom(), w: b.x - a.x, h: b.y - a.y, W: s.x, H: s.y, x0: a.x, y0: a.y }; });
  const frac = Math.max(fit.w / fit.W, fit.h / fit.H);
  ok(fit.x0 >= -1 && fit.y0 >= -1 && fit.x0 + fit.w <= fit.W + 1 && fit.y0 + fit.h <= fit.H + 1 && frac >= 0.6, 'P5 (START282: the search is centred above the map) first view at 1366 x 768: all of Pakistan in view, filling at least 60 % of the map', JSON.stringify({ zoom: fit.z, pkPx: [Math.round(fit.w), Math.round(fit.h)], fill: Math.round(frac * 100) + ' %' }));
  await pg.fill('#q', '33.69, 73.05'); await pg.click('#go');
  await pg.waitForFunction(() => document.querySelector('#card[data-ready]') && document.querySelector('#cSub .nw'), null, { timeout: 90000 }).catch(() => {});
  const co = await pg.evaluate(() => { const e = document.querySelector('#cSub .nw'); if (!e) return null; const r = e.getClientRects(); return { t: e.textContent, lines: r.length, ws: getComputedStyle(e).whiteSpace }; });
  ok(co && co.t === '33.69, 73.05' && co.lines === 1 && co.ws === 'nowrap', 'P6 start card at 1366: "33.69, 73.05" stays on one line', JSON.stringify(co));
  ok(!errs.length, 'P7 no page error', errs.join(' | ')); await browser.close(); }

console.log(`\n${fail ? 'FAIL' : 'PASS'} fix280: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
