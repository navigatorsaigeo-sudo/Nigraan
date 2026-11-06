import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.125 · stages 1-3 of the correction plan (CEO, 2 Oct) and the external audit of 91.17.123:
   A01 quality gates read the data, A02 whole-record digest, A03 leads by elapsed time, A04/A05 explicit windows and missing forcing,
   A06 AI meaning checks, A07/A08 cache keys, A11 forecast vs observation classes, A12 constant vapour in the live layer, A13/A14 one
   weather state on the card, A16 archived model identity, A17 rain day completeness, A21 missing emission scopes.
   node nigraan-local/scripts/tests125/v125.test.mjs   (set PLAYWRIGHT_MODULE / PW_CHROME to run the page part elsewhere) */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
const APP = (__T.ROOT + '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const imp = (p) => import(new URL('../../' + p, import.meta.url).href);

/* A01 / A02 */
const Q = await imp('server/api/quality.mjs'); const { hashStable } = await imp('server/api/core.mjs');
const now = new Date().toISOString();
const rec = (T) => ({ runId: 'r1', unitKey: 'u1', lat: 33.7, lon: 73.0, resolvedLat: 33.7, resolvedLon: 73.0, resolvedElevationM: 500, validTime: now, coverage: 100, disputed: false,
  leads: { '0': { temperature_2m: T[0] } }, hourly: { time: ['a', 'b', 'c'], temperature_2m: T }, temperatureBasis: { version: 'x' } });
const app = (recs) => ({ store: { filter: (c, f) => recs.filter(f) }, units: { tehsil: [{ unitId: 'u1', disputed: false }] } });
const runOf = (recs, completed) => ({ run_id: 'r1', requested_units: 1, completed_at: completed, unit_level: 'tehsil', development_limited: false, records_sha256: Q.recordsDigest(recs), digest_version: Q.DIGEST_VERSION });
const ev = (recs, completed = now, mut) => { const r = runOf(recs, completed); if (mut) mut(recs); return Q.evaluateRun(app(recs), r); };
const failed = (e) => e.results.filter(x => !x.passed && x.blocking).map(x => x.gate);
ok(ev([rec([20, 21, 22])]).status === 'passed', 'quality: a valid record passes');
ok(failed(ev([rec(['20', '21', '22'])])).includes('QG2'), 'A01: a string temperature fails completeness');
ok(failed(ev([rec([null, null, null])])).includes('QG2'), 'A01: an all-null series at an asserted 100 % fails completeness');
ok(failed(ev([rec([20, 21, 22])], '2099-01-01T00:00:00Z')).includes('QG3'), 'A01: a completion time in the future fails freshness');
ok(failed(ev([rec([25, 25, 25])], now, (r) => { r[0].hourly.temperature_2m = [55, 55, 55]; })).includes('QG8'), 'A02: changing an hourly value after ingestion breaks the digest');
ok(failed(ev([rec([25, 25, 25])], now, (r) => { r[0].lat = 24.9; })).includes('QG8'), 'A02: changing coordinates after ingestion breaks the digest');

/* A03 */
const { leadsFromHourly } = await imp('server/api/provider.mjs'); const b0 = Date.parse('2026-10-02T00:00Z');
let L = leadsFromHourly({ time: ['2026-10-02T00:00', '2026-10-02T02:00'], temperature_2m: [20, 22] }, ['temperature_2m'], [0, 1, 2], b0);
ok(L.leads['1'].validTime === null && L.leads['2'].temperature_2m === 22 && L.coverage < 100, 'A03: lead +1 cannot become +2', JSON.stringify(L.leads));
L = leadsFromHourly({ time: ['2026-10-02T00:00', '2026-10-02T00:00'], temperature_2m: [20, 22] }, ['temperature_2m'], [0], b0);
ok(L.coverage === 0 && L.timeError, 'A03: duplicate timestamps are refused');
L = leadsFromHourly({ time: ['2026-10-05T00:00'], temperature_2m: [20] }, ['temperature_2m'], [0], b0);
ok(L.coverage === 0, 'A03: a base hour outside the series gives no data');

/* A04 / A05: v91.17.283.19 retired the physical-state module (the card of /api/state/point; freezing exposure and the 72 h
   wind maximum were its own); the place bundle (GET /api/point) carries the point state */
{ const { readFileSync } = await import('node:fs'); const IX = readFileSync(new URL('../../server/api/index.mjs', import.meta.url), 'utf8');
  /* v91.17.283.20 (A3): the module is loaded again as the OPERATOR-only bundle part state; its old route stays retired */
  ok(/import \{ createState \} from '\.\/state\.mjs'/.test(IX) && /operatorParts: \['state'/.test(IX) && !/'\/api\/state\/point'/.test(IX), 'A04/A05: the physical-state module serves only the operator bundle part state (/api/state/point stays retired)'); }

/* A06 */
const AI = await imp('server/api/ai.mjs'); AI.setKnownPlaces(['Islamabad', 'Karachi', 'Lahore']);
const facts = { place: 'Islamabad', validDate: '2026-10-02', forecast: { tmaxC: 35 } };
const fw = (t) => AI.firewallAnswer(t, facts).removed === 0;
ok(fw('The maximum temperature in Islamabad on {fact:validDate} is {fact:forecast.tmaxC} °C.'), 'A06: a correct fact sentence passes');
ok(!fw('Rainfall of {fact:forecast.tmaxC} mm is expected in Islamabad.'), 'A06: a temperature written as rain is refused');
ok(!fw('Gusts will reach {fact:forecast.tmaxC} km/h.'), 'A06: a temperature written as wind is refused');
ok(!fw('Expected financial loss is PKR {fact:forecast.tmaxC}.'), 'A06: a temperature written as money is refused');
ok(!fw('The maximum temperature in Karachi will be {fact:forecast.tmaxC} °C.'), 'A06: another city is refused');
ok(!fw('Next Friday the maximum in Islamabad will be {fact:forecast.tmaxC} °C.'), 'A06: another day is refused');

/* A11 */
const GR = JSON.parse(readFileSync(APP + 'data/model-gate.resolved.json', 'utf8')); const ge = (id) => GR.entries.find(e => e.id === id);
ok(ge('hourly-forecast').class === 'forecast_input' && ge('hourly-forecast').resolved.canAlert === false, 'A11: the raw forecast is a forecast input, not an observation, and cannot alert on its own');
ok(ge('rain-fell').class === 'satellite_estimate' && ge('vegetation-health').class === 'satellite_estimate', 'A11: satellite products are satellite estimates with a stated ground check');
/* v91.17.283 · owner decision A (20 Oct 2026): heat High and Severe are Indicative and cannot alert (heat Moderate keeps alerts); cold cannot alert */
{ const UL = ge('utci').resolved.levels;
  ok(ge('utci').resolved.canAlert && ge('cold').resolved.canAlert === false && (ge('utci').dependencies || []).includes('hyperlocal-temperature') && (ge('cold').dependencies || []).includes('hyperlocal-temperature')
    && !!UL && UL.Moderate && UL.Moderate.canAlert === true && UL.High && UL.High.canAlert === false && UL.Severe && UL.Severe.canAlert === false,
    'A11: heat and cold rest on the tested temperature chain; heat alerts up to Moderate only, cold does not alert (owner decision A)', JSON.stringify({ utci: ge('utci').resolved.canAlert, utciLevels: UL && Object.fromEntries(Object.entries(UL).map(([k, v]) => [k, v.canAlert])), cold: ge('cold').resolved.canAlert })); }

/* A12 */
const HL = await imp('server/api/hyperlocal.mjs'); const src12 = readFileSync(APP + 'server/api/hyperlocal.mjs', 'utf8');
ok(/function follow\(/.test(src12) && /esat\(T0\) \/ esat\(T1\)/.test(src12), 'A12: the live layer moves humidity at constant vapour');

/* A16 */
const src16 = readFileSync(APP + 'server/api/pointengine.mjs', 'utf8');
ok(/mv, id: p\.id/.test(src16) && /national: ident\('national-model\.json'\)/.test(src16), 'A16: each archived issue carries model versions and hashes');
ok(/fineKey = \(lat, lon\) => \(\+lat\)\.toFixed\(5\)/.test(readFileSync(APP + 'server/api/pointstate.mjs', 'utf8')), 'A08: the point record cache key is the exact coordinate (v283.24 P13: the point engine\'s own cache is gone; the height is the place\'s)');

/* A07 */
const src07 = readFileSync(APP + 'server/api/natmodel.mjs', 'utf8');
ok(/const hk = Object\.keys\(loc\.hourly\)/.test(src07) && /Math\.floor\(Date\.now\(\) \/ 3600e3\)/.test(src07), 'A07: the residual cache key covers every hourly input, the members and the hour');

/* A17 */
const src17 = readFileSync(APP + 'server/api/rainchance.mjs', 'utf8');
ok(/e\.seen\.has\(ms\)/.test(src17) && /nbMissing/.test(src17), 'A17: repeated hours count once and a missing neighbour day withholds the chance');

/* page: A13 / A14 / A21 */
let PW = null; try { PW = __T.playwrightSync(); } catch (_) { PW = null; }
if (PW) {
  const br = await __T.launch(PW.chromium, process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
  const pg = await br.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await pg.waitForFunction(() => { try { const p = AGN.data.activePoint(); const v = p && AGN.nowAt.peek(p.lat, p.lon); return v && v.rh != null && document.getElementById('agnCcNow122'); } catch (_) { return false; } }, null, { timeout: 300000, polling: 2000 }).catch(() => {});
  await pg.waitForTimeout(4000);
  const C = await pg.evaluate(() => { const p = AGN.data.activePoint(), v = AGN.nowAt.peek(p.lat, p.lon) || {};
    return { v: { t: v.tempC, rh: v.rh, w: v.windKmh, f: v.feelsC, u: v.utciShadeC }, t: parseFloat(document.getElementById('ccTemp').textContent), rh: parseFloat(document.getElementById('ccHum').textContent),
      w: parseFloat(document.getElementById('ccWind').textContent), f: parseFloat(document.getElementById('ccFeels').textContent), chip: ((document.querySelector('#ccConf .conf-chip') || {}).textContent || '').trim(),
      note: (document.getElementById('agnCcNow122') || {}).textContent || '' }; });
  ok(C.v.t != null && Math.abs(C.t - C.v.t) < 0.05 && Math.abs(C.rh - Math.round(C.v.rh)) < 0.5 && Math.abs(C.w - Math.round(C.v.windKmh ?? C.v.w)) < 0.5, 'A13: temperature, humidity and wind on the card are one state', JSON.stringify(C));
  ok(C.v.f == null || Math.abs(C.f - Math.round(C.v.f)) < 0.5, 'A13: feels-like is the same hour\'s state', JSON.stringify(C));
  ok(!C.chip || /Station-supported|Model estimate/.test(C.chip), 'A14: the chip states the support of this number, not a blanket "High"', C.chip);
  ok(C.v.u == null || /UTCI/.test(C.note), 'A13: the card states the shade UTCI of the same hour', C.note);
  /* v91.17.276 · A21 updated to the current design: the emission (GHG) table left NIGRAAN with the financial and ESG content in v91.17.266,
     and build/base (the v80 source page this check read) is not shipped; the check is now that no emission table or renderer remains */
  const GH = await pg.evaluate(() => ({ fn: typeof window.renderGhg, el: !!document.getElementById('agnGhgTable') }));
  ok(GH.fn === 'undefined' && !GH.el, 'A21 (v266 design): no emission-scope table or renderer remains on the page', JSON.stringify(GH));
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await br.close();
} else console.log('SKIP page checks (no Playwright here)');

/* the served point state carries the comfort values of the same hour */
const realFetch = globalThis.fetch; const PF = await realFetch(BASE + '/api/point?lat=33.6844&lon=73.0479')   /* v283.19: the place bundle */.then(r => r.json()).catch(e => ({ e: e.message }));
ok(PF.ok && PF.now && 'utciShadeC' in PF.now && 'dewC' in PF.now && 'feelsC' in PF.now, 'stage 3: the point engine returns one state per hour (T, RH, dew point, wind, feels-like, shade UTCI)', JSON.stringify(PF.now || PF).slice(0, 300));
console.log((fails ? 'FAIL' : 'PASS') + ' v125: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
