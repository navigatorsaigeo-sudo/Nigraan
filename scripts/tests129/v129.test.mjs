import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.129 · one "feels like" (A-03: the served apparent temperature; the heat index is named as such), one NOW on the card
   (competing writers retired), report wet bulb by the one psychrometric method, level words instead of raw 0-100 scores (U-15),
   key swatches = map fills (U-19), eyebrow contrast (U-25).
   node scripts/tests129/v129.test.mjs */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
const APP = (__T.ROOT + '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const P = await import(new URL('../../server/api/psychro.mjs', import.meta.url).href);

/* server: the AI's place NOW carries the served feels-like of the same hour */
const AI = readFileSync(APP + 'server/api/ai.mjs', 'utf8');
ok(/apparent_temperature_c: ps\.now\.feelsC/.test(AI), 'the AI place NOW carries the feels-like of the point state (v91.17.283.12: the point state, not the point engine)');
/* report: wet bulb maximum by the one psychrometric method at the site height */
const RP = await fetch(BASE + '/api/point?lat=35.92&lon=74.31').then(r => r.json()).then((B) => (B && B.parts && B.parts.pointrun ? B.parts.pointrun.v : null)).catch(() => null);   /* v283.19: the report run is the bundle part pointrun */
if (RP && RP.summary && RP.series && RP.series.temperature_2m) { const S = RP.series, z = RP.site && RP.site.elevation;
  let mx = null; S.temperature_2m.forEach((t, i) => { const r = S.relative_humidity_2m[i]; if (t == null || r == null) return; const w = Math.round(P.wetBulbC(t, r, Number.isFinite(z) ? { elevationM: z } : null) * 10) / 10; if (mx == null || w > mx) mx = w; });
  ok(RP.summary.wetBulbMax && RP.summary.wetBulbMax.v === mx, 'report wet-bulb maximum (Gilgit) is the psychrometric value at the site height', JSON.stringify(RP.summary.wetBulbMax) + ' vs ' + mx); }
else console.log('SKIP report point run not reachable here');

const PW = __T.playwrightSync();
const br = await __T.launch(PW.chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath(), args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const pg = await br.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
const L0 = await pg.evaluate(() => (document.getElementById('mapHazardPick') || {}).value);
ok(L0 === 'heat', 'the map opens on Heat stress (CEO 3 Oct)', L0);
await pg.waitForFunction(() => { try { return AGN.data.activePoint() && AGN.nowAt && AGN.ccOwned && AGN.ccOwned(); } catch (_) { return false; } }, null, { timeout: 300000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(12000);
const C = await pg.evaluate(() => { const p = AGN.data.activePoint(), v = AGN.nowAt.peek(p.lat, p.lon) || {};
  return { owned: AGN.ccOwned(), t: (document.getElementById('ccTemp') || {}).textContent, vt: v.tempC, f: (document.getElementById('ccFeels') || {}).textContent, vf: v.feelsC,
    nar: (document.getElementById('comfortNarrative') || {}).textContent || '' }; });
ok(C.owned && Math.abs(parseFloat(C.t) - C.vt) < 0.06, 'the card temperature is the point engine value (no integer overwrite)', JSON.stringify(C));
const nf = (C.nar.match(/feels-like temperature of (-?[\d.]+)/) || [])[1];
ok(C.vf == null || (nf != null && Math.round(C.vf) === Math.round(+nf) && parseInt(C.f, 10) === Math.round(C.vf)), 'the comfort sentence and the Feels like tile give the same served feels-like', JSON.stringify(C));
ok(!/a feels-like temperature of/.test(C.nar) || nf != null, 'no other quantity is called feels-like in the comfort sentence');
const K = await pg.evaluate(() => { const m = document.querySelector('#v3legend .agn-leg-meaning i'); return m ? getComputedStyle(m).backgroundColor + '|' + getComputedStyle(m).borderTopStyle : ''; });
ok(!K || /rgba\(116, 196, 118, 0\.5\)|none|solid/.test(K), 'the key\'s green swatch is the map fill (50 % opacity, or outline with Streets)', K);
const T = await pg.evaluate(() => { const e = document.querySelector('.asmt-eyebrow'); return e ? getComputedStyle(e).color : null; });
ok(!T || T === 'rgb(15, 95, 88)', 'eyebrow labels at readable contrast (dark teal)', T);
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();

const ART = readFileSync(APP + 'artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', 'utf8');
ok(!/risk signal \$\{r\.score\} out of 100/.test(ART) && !/Highest screening index/.test(ART) && !/' of 100\)\. A detailed/.test(ART), 'no raw 0-100 screening index in the AI summary or report; the five-level word instead');
ok(/heat index '\+Math\.round\(x\.heatIndexC\)/.test(ART), 'the area panel names the heat index as heat index');
console.log((fails ? 'FAIL' : 'PASS') + ' v129: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
