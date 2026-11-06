import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.147 · audit fixes, checked on the running server and the live NIGRAAN page */
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787', H = { 'Sec-Fetch-Site': 'same-origin' };
let passes = 0, fails = 0; const ok = (c, m, d) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' :: ' + (d || ''))); c ? passes++ : fails++; };
const J = async (p) => (await fetch(BASE + p, { headers: H })).json();
const px = (q) => J('/px/v1/forecast?__omhost=api.open-meteo.com&' + q);
/* data F1: the same hour, asked with a short past window, equals the 3-day request */
{ const q = 'latitude=33.70863&longitude=73.0371&elevation=562&hourly=temperature_2m&timezone=Asia%2FKarachi';
  const a = await px(q + '&forecast_days=3'), b = await px(q + '&forecast_days=1&past_hours=2');
  const t = b.hourly.time[b.hourly.time.length - 1], va = a.hourly.temperature_2m[a.hourly.time.indexOf(t)], vb = b.hourly.temperature_2m[b.hourly.time.length - 1];
  const nowH = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 13), k = b.hourly.time.findIndex((x) => x.slice(0, 13) === nowH);
  ok(va === vb && k === 2, 'F1: a past_hours request gives the same hour as the 3-day request, and keeps exactly the hours asked for', JSON.stringify({ va, vb, k, first: b.hourly.time[0] })); }
/* data F2: day max/min equal the served curve after every layer */
{ const j = await px('latitude=33.7204&longitude=73.0561&current=temperature_2m&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=Asia%2FKarachi');
  const bad = j.daily.time.filter((d, i) => { const v = j.hourly.time.map((t, k) => t.startsWith(d) ? j.hourly.temperature_2m[k] : null).filter((x) => x != null); return v.length === 24 && (Math.max(...v) !== j.daily.temperature_2m_max[i] || Math.min(...v) !== j.daily.temperature_2m_min[i]); });
  ok(bad.length === 0, 'F2: each day card equals the served hourly curve (F-7, synop layer on)', bad.join(',')); }
/* data F3: a rain-only request in the mountains is mapped (temperature fetched and removed) */
{ const j = await px('latitude=35.92&longitude=74.31&hourly=precipitation,wind_gusts_10m&forecast_days=4&timezone=Asia%2FKarachi');
  ok(!('temperature_2m' in j.hourly) && j.agn_rainqm && (j.agn_rainqm.applied === (j.agn_rainqm.daysMapped > 0)), 'F3: mountain rain mapping honest on a rain-only request; temperature not leaked', JSON.stringify(j.agn_rainqm)); }
/* F12: chain identity on health, point and the proxy */
{ const h = await J('/api/health'); const r = await fetch(BASE + '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=33.7&longitude=73.05&hourly=temperature_2m&forecast_days=1', { headers: H });
  const p = await J('/api/point?lat=33.7104&lon=73.0597');   /* v283.19: the place bundle */
  ok(/^91\.17\.\d+(\.\d+)?-local$/.test(h.serviceVersion) /* v276: any release (was pinned to 91.17.14x-15x) */ && h.chain && /^[0-9a-f]{16}$/.test(h.chain.id) && r.headers.get('x-agn-chain') === h.chain.id && p.chainId === h.chain.id, 'F12: version 91.17.147 and one chain identity on health, the proxy and the point engine', JSON.stringify({ v: h.serviceVersion, c: h.chain, x: r.headers.get('x-agn-chain'), p: p.chainId })); }
/* UI 8: the area list and the point card give the same "now" at the same place */
{ const a0 = await J('/api/point?lat=33.7204&lon=73.0561'); const a = (a0.parts && a0.parts.near && a0.parts.near.v) || { places: [] }; const f8 = a.places.find((x) => x.name === 'F-8'); const p = await J('/api/point?lat=' + f8.lat + '&lon=' + f8.lon);   /* v283.19: the bundle part near */
  ok(f8 && Math.abs(f8.tempC - p.now.tempC) < 0.05 && f8.time === p.now.time, 'UI 8: area list and point card agree at F-8', JSON.stringify({ area: f8 && [f8.tempC, f8.time], point: [p.now.tempC, p.now.time] })); }
/* H1: shade UTCI served beside the sun value */
{ /* v91.17.283.19: the physical-state card (sun UTCI) is retired; the place bundle serves UTCI in shade for every hour */
  const s = await J('/api/point?lat=31.52&lon=74.35'); const hs = (s.hours || []).filter((h) => h.utciShadeC != null);
  ok(hs.length >= 24 && s.now && s.now.utciShadeC != null, 'H1: UTCI in shade served for every hour of the place bundle', JSON.stringify({ hours: hs.length, now: s.now && s.now.utciShadeC })); }
/* #141: ground-checked PM2.5 near Lahore, CAMS alone far from any monitor */
{ const a = await J('/api/smog/unit?lat=31.52&lon=74.35'), b = await J('/api/smog/unit?lat=30.18&lon=67.00'), n = await J('/api/smog/national?day=0');
  const x = a.days && a.days[0], y = b.days && b.days[0];
  ok(x && x.groundChecked && x.groundChecked.city === 'Lahore' && x.pm25Cams != null && y && y.groundChecked === false && (y.pm25Basis === 'national model' ? (y.pm25 != null && y.nationalModel && y.nationalModel.version) : y.pm25 === y.pm25Cams) && n.tehsils > 500, '#141 (v199): PM2.5 ground-checked at Lahore, national model or CAMS alone (marked) at Quetta (Multan has its own ground fit since v154); smog covers every tehsil (' + n.tehsils + ')', JSON.stringify({ x: x && [x.pm25Cams, x.pm25], y: y && [y.pm25, y.groundChecked], n: n.tehsils })); }
/* page: the heat label and the engine wrappers are in place on NIGRAAN */
const PW = __T.playwrightSync();
const br = await __T.launch(PW.chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.route('**/*', (r) => (r.request().method() !== 'GET' ? r.abort() : r.continue()));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => window.AGN && AGN.physics && AGN.physics.__agnSci && AGN.cascade && AGN.cascade.__agnHz, null, { timeout: 120000 }).catch(() => {});
const hl = await pg.evaluate(() => { const c = window.AGN && AGN.physics; if (!c) return null; const d1 = c.heatIndexDetail(38, 70); const a = window.heatRiskLabel(null, null); c.heatIndexDetail(30, 50); return { d1: d1 && d1.bound, a: a && a.risk, basis: a && a.basis, ps: !!(window.heatRiskLabel && window.heatRiskLabel.__agnPs), ok: !!c.__agnSci, hz: !!(AGN.cascade && AGN.cascade.__agnHz) }; });
/* v91.17.283.11 · the page's heat words are the UTCI level of the point state (heatRiskLabel no longer reads the heat index); the heat-index table bound is unchanged */
ok(hl && hl.d1 === 'maxIndexC' && hl.basis === 'utci' && /^(Normal|Moderate|High|Severe|Not assessed)$/.test(hl.a) && hl.hz, 'H3: the heat-index table bound holds (38 C at 70 %: above the table); the heat words are the point state\'s UTCI level; engine no-data wrappers loaded', JSON.stringify(hl));
const sw = await pg.evaluate(() => { const r = document.getElementById('agn-switch').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
ok(sw.w < 260 && sw.h < 32, 'UI 59: the page switch is compact (' + sw.w + ' x ' + sw.h + ' px)', JSON.stringify(sw));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v147 audit fixes: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
