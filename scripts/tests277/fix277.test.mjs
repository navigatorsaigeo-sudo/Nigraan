import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.277 · FIX277 · the launch defects L1-L6 and L9 (LAUNCH_DEFECTS.md, v91.17.276 walk-through). L8 is tests277/mapfill.test.mjs.
     L1  map: no temperature chip and no AGN pin sits on a place name, at national zoom and at city zoom (10 places); no place name is
         hidden for a pin
     L2  (v91.17.283.24 W1: the Scenario reads served levels and waits for no page input; the table shows at once.) Before: Scenario: while today's levels are on their way the tab says so plainly (how many tehsils are in, and the end of the run at the
         measured pace), never a bare "Loading ..."; the "Not run" badge is on one line
     L3  Forecast 72 h chart: with the last hour on a 6-hour tick (the case that clipped "06:0C"), no axis label runs past the chart, on
         every chart tab (temperature, heat stress, rain, wind, humidity)
     L4  the recorded deviations (operator assurance report) carry no code words: no null / undefined / NaN, no registry or function
         identifiers (the six report types as drawn, client and operator: tests277/reports277.test.mjs)
     L5  the airport and synoptic site-offset stages are retired: no module, no route, not in the chain, no step in the point record
     L6  the measured-albedo feature is retired: no route, no page cache; Tmrt uses the fixed 0.20 and /state says so
     L9  the CSS-hidden blocks are gone with their code (#cmip6Card, #agnCmipBox, the AI watch workspace, #asmtNextActions); the visible
         CMIP6 card on the Forecast tab still runs the seven-model engine; the Scenario tab still draws
     K1  page build stamp = package version
   usage: node scripts/tests277/fix277.test.mjs http://127.0.0.1:8962 */
import { createRequire } from 'node:module'; import { readFileSync, existsSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8962';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const req = createRequire(import.meta.url);
let PW = __T.playwrightSync();
const exe = process.env.PW_CHROME || __T.chromiumPath();
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + String(i).slice(0, 500) : '')); } };
const H = { 'Sec-Fetch-Site': 'same-origin' };
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const html = src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'), pkg = JSON.parse(src('package.json'));

/* ── K1 ── */
ok((html.match(/G\.AGN_BUILD\.patch='([^']+)'/) || [])[1] === pkg.version, 'K1 page build stamp = package version ' + pkg.version);

/* ── L5 ── server: the retired stages */
const V = src('server/api/verification.mjs'), I = src('server/api/index.mjs'), PE = src('server/api/pointengine.mjs'), HL = src('server/api/hyperlocal.mjs'), SV = src('server/server.mjs');
const stages = JSON.parse(((V.match(/const CHAIN_STAGES = (\[[^\]]*\])/) || [])[1] || '[]').replace(/'/g, '"'));
ok(!existsSync(join(ROOT, 'server/api/airportsite.mjs')) && !/airportsite\.mjs|createAirportSite|app\.airportSite/.test(I + V + PE + HL + SV + src('server/api/accmon_worker.mjs')),
  'L5 the airport / synoptic site-offset module is gone and nothing outside accmon.mjs refers to it');
ok(stages.length && !stages.includes('airport') && stages[0] === 'wxmos', 'L5 the served chain has no airport stage (' + stages.join(' > ') + ')');
ok(!/agn_airport_site|agn_site_station|airport thermometer calibration|synoptic station calibration \(/.test(PE), 'L5 the point record has no airport / synoptic site step');
const rAS = await fetch(BASE + '/api/airport-site/status', { headers: H }); ok(rAS.status === 404, 'L5 /api/airport-site/status is retired (' + rAS.status + ')');
const pf = await fetch(BASE + '/api/point?lat=33.5491&lon=72.8256', { headers: H }).then((r) => r.json()).catch(() => null);
const chain = ((pf && pf.source && pf.source.chain) || []).map((c) => (typeof c === 'string' ? { step: c } : c)), bsteps = ((pf && pf.build && pf.build.steps) || []).map((c) => (typeof c === 'string' ? { step: c } : c));   /* v283.19: the bundle's source chain */
ok(pf && pf.ok && chain.length && !chain.concat(bsteps).some((c) => /airport|synoptic station calibration/.test(c.step)), 'L5 Islamabad airport point: no airport / site step in the served chain (' + chain.map((c) => c.step).join(' > ') + ')');

/* ── L6 ── the measured albedo */
const TH = await import(pathToFileURL(join(ROOT, 'server/api/thermal.mjs')).href);
ok(!('surfaceAlbedo' in TH) && TH.FIXED_ALBEDO === 0.2, 'L6 thermal.mjs: no measured-albedo reader; the fixed surface albedo is 0.20');
{ const w = Date.parse('2026-01-15T07:00:00Z'), base = { tC: 10, rhPct: 40, pressureHpa: 1000, wind10: 2, ssrd: 600, fdir: 450, dsrp: null, cloudFrac: 0.1, whenMs: w, lat: 36.85, lon: 75.42 };
  const a = TH.thermalHour(base), m = TH.meanRadiantTemperature(10, 40, 0.1, 600, 450, null, TH.cosSolarZenith(36.85, 75.42, w), 0.2);
  ok(a.tmrt === m.tmrt, 'L6 Tmrt in the thermal hour is the 0.20-albedo value (' + a.tmrt + ' C)'); }
const rAl = await fetch(BASE + '/api/albedo?lat=33.7&lon=73.05', { headers: H }); ok(rAl.status === 404, 'L6 /api/albedo is retired (' + rAl.status + ')');
const stp = null;   /* v283.19: /api/state/point (the physical-state card) is retired */
const alb = stp && JSON.stringify(stp).match(/"albedo":("[^"]*"|null)/); ok(!alb || alb[1] === 'null' || /fixed 0\.20/.test(alb[1]), 'L6 no served answer names a measured albedo (' + (alb ? alb[1] : 'the physical-state card is retired') + ')');
ok(!/albedoAt|\/api\/albedo/.test(html), 'L6 the page asks for no measured albedo');

/* ── L9 ── page source */
ok(!/id="cmip6Card"|cmip6Load|cmip6Rows|cmip6Status|cmip6HorizonEcho|agnCmipBox|asmtNextActions|data-ai-workspace="watch"|execRender|exportDecisions|aiRenderDistricts|agn-v244-css|id="agn-v71-js"/.test(html),
  'L9 no hidden block, nor the code that built it, is left in the page');
ok(!/display:none!important\}\s*#agnCmipBox|#cmip6Card\{display:none/.test(html), 'L9 no rule hides a block that is still built');

/* ── L4 ── deviations (source) */
const dev = html.slice(html.indexOf('var DEVIATIONS = ['), html.indexOf('\n  ];', html.indexOf('var DEVIATIONS = [')));
const CODE = /\b(null|undefined|NaN)\b|\[object|[A-Z]{3,}_[A-Z_]{2,}|\b[a-z]+[A-Z]\w*\.\w+|\b[a-z][a-z0-9]*\.[a-z][A-Za-z0-9]*[A-Z]\w*|\b[a-z]+[A-Z][A-Za-z0-9]*\b|\w+\(\w*\)|\b\w+\.(js|py|mjs)\b/;
const devStrings = (dev.match(/'(?:[^'\\]|\\.)*'/g) || []).map((s) => s.slice(1, -1)).join(' ');
const devHits = devStrings.split(/(?<=[.;:])\s+/).filter((s) => CODE.test(s.replace(/DEV-\d+|MC-\d+|G\d+/g, '')));
ok(dev.length > 1000 && !devHits.length, 'L4 the recorded deviations are in plain words (' + (dev.match(/id: 'DEV-/g) || []).length + ' deviations)', devHits.slice(0, 4).join(' | '));

/* ── browser ── */
const br = await __T.launch(PW.chromium, { executablePath: exe, args: ['--no-sandbox'] });
const open = async (op) => { const ctx = await br.newContext({ viewport: { width: 1600, height: 1000 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await pg.addInitScript((o) => { try { if (o) localStorage.setItem('agn.operator.v1', '1'); else localStorage.removeItem('agn.operator.v1'); } catch (_) {} }, op);
  await pg.goto(BASE + '/analyst' + (op ? '?operator=1' : ''), { waitUntil: 'domcontentloaded', timeout: 180000 });
  await pg.waitForFunction(() => window.AGN && AGN.reports268 && AGN.flow && AGN.flow.setActiveLocation && window.map, null, { timeout: 180000 }); await pg.waitForTimeout(8000);
  return { ctx, pg, errs }; };
const go = (pg, v) => pg.evaluate((v) => document.querySelector('#machNav button[data-goto="' + v + '"]').click(), v);
const { ctx, pg, errs } = await open(false);

/* L2 · the Scenario wait line. The offline national run is usually in before the tab opens, so the test holds it back: the day inputs of
   every tehsil are withheld, then handed back 40 at a time each second (the run "arriving"), and the line is read on the way */
await pg.evaluate(() => { AGN.flow.setActiveLocation({ name: 'Skardu', lat: 35.2971, lon: 75.6333 }, 'Skardu', { src: 'search' }); });
/* the real run first (the records handed back must be the arrived ones) */
await pg.waitForFunction(() => { const D0 = window.DISTRICT_IN || {}; return Object.keys(D0).filter((k) => { const r = D0[k]; return r && (r.weatherLive || r.nationalLive || r.fcSource); }).length > 500; }, null, { timeout: 240000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(1500);
await pg.evaluate(() => { const R = window.DISTRICT_IN, C = {}, keys = Object.keys(R); window.__agnT277 = { R, keys, i: 0 };
  keys.forEach((k) => { const r = Object.assign({}, R[k]); delete r.weatherLive; delete r.nationalLive; delete r.fcSource; C[k] = r; }); window.DISTRICT_IN = C;
  const sk = keys.filter((k) => /Skardu/i.test(k)); window.__agnT277.keys = keys.filter((k) => sk.indexOf(k) < 0).concat(sk);
  window.__agnT277.t = setInterval(() => { const T = window.__agnT277; for (let n = 0; n < 40 && T.i < T.keys.length; n++, T.i++) window.DISTRICT_IN[T.keys[T.i]] = T.R[T.keys[T.i]]; }, 1000); });
await go(pg, 'hybridlab'); await pg.waitForTimeout(1500);
/* v91.17.283.24 · W1: the Scenario's "Now" column is the tehsil's issued level (the server) and its scenario column is not assessed: the tab
   no longer waits for the page's national inputs, so while they are withheld it shows the table at once (no wait line) */
const waits = []; for (let k = 0; k < 4; k++) { waits.push(await pg.evaluate(() => { const w = document.querySelector('.view.active .scn-wait'); return { w: w ? w.textContent : null, rows: !!document.getElementById('agnScnRows') }; })); await pg.waitForTimeout(2600); }
console.log('   wait lines: ' + waits.map((x) => x.w).join(' || '));
ok(waits.every((x) => x.w === null && x.rows), 'L2 while the page\'s national inputs are withheld the Scenario tab shows the stress-test table at once (its levels are the server\'s; no wait line)', JSON.stringify(waits));
await pg.evaluate(() => { const T = window.__agnT277; clearInterval(T.t); window.DISTRICT_IN = T.R; try { document.dispatchEvent(new CustomEvent('agn:data')); } catch (_) {} });
await pg.waitForTimeout(2500);
const scn = await pg.evaluate(() => { const v = document.querySelector('.view.active'); const w = v.querySelector('.scn-wait'); const b = document.getElementById('susMcStamp');
  const r = b ? b.getBoundingClientRect() : null, lh = b ? parseFloat(getComputedStyle(b).lineHeight) || 16 : 16;
  return { wait: w ? w.textContent : null, all: v.innerText, badgeH: r ? r.height : null, lh, badge: b ? b.textContent : null }; });
ok(!/Loading today's levels/.test(scn.all), 'L2 no bare "Loading today\'s levels" line');
ok(scn.badgeH != null && scn.badgeH < 1.6 * scn.lh, 'L2 the "' + scn.badge + '" badge is on one line (' + scn.badgeH + ' px, line ' + scn.lh + ' px)');
await pg.waitForFunction(() => { const v = document.querySelector('.view.active'); return v && !v.querySelector('.scn-wait'); }, null, { timeout: 240000, polling: 2000 }).catch(() => {});
const scn2 = await pg.evaluate(() => { const v = document.querySelector('.view.active'); return { wait: !!v.querySelector('.scn-wait'), rows: !!document.getElementById('agnScnRows') }; });
ok(!scn2.wait && scn2.rows, 'L9 the Scenario stress test draws once the levels are in');
await go(pg, 'overview'); await pg.waitForTimeout(3000);

/* L1 · chips and pins against place names, national and city zoom, 10 places */
const PL = [['Islamabad', 33.6844, 73.0479], ['Lahore', 31.5204, 74.3587], ['Karachi', 24.8607, 67.0011], ['Multan', 30.1575, 71.5249], ['Peshawar', 34.0151, 71.5249],
  ['Quetta', 30.1798, 66.975], ['Gilgit', 35.9208, 74.3089], ['Skardu', 35.2971, 75.6333], ['Muzaffarabad', 34.37, 73.47], ['Turbat', 26.0031, 63.0544]];
const measure = () => pg.evaluate(() => { const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && e.offsetParent !== null ? r : null; };
  const M = document.getElementById('map').getBoundingClientRect(); const inMap = (r) => r && r.right > M.left && r.left < M.right && r.bottom > M.top && r.top < M.bottom;
  const hit = (a, c) => !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom);
  const names = [...document.querySelectorAll('#map .capital-anchor .cap-name')].map((e) => ({ t: e.textContent.trim(), r: vis(e) })).filter((x) => inMap(x.r));
  const chips = [...document.querySelectorAll('#map .leaflet-marker-pane .wx-pin')].map((e) => ({ t: e.textContent.trim(), r: vis(e.querySelector('.body') || e) })).filter((x) => x.r);
  const pins = [...document.querySelectorAll('#map .agn200-pin')].map((e) => { const r = vis(e); if (!r) return null; const w = e.offsetWidth, cx = (r.left + r.right) / 2; return { left: cx - w / 2, right: cx + w / 2, top: r.top, bottom: r.bottom }; }).filter((r) => inMap(r));
  const over = []; names.forEach((n) => { chips.forEach((c) => { if (hit(n.r, c.r)) over.push('chip "' + c.t + '" on ' + n.t); }); pins.forEach((p) => { if (hit(n.r, p)) over.push('pin on ' + n.t); }); });
  return { over, names: names.length, chips: chips.length, pins: pins.length, hidden: [...document.querySelectorAll('#map .capital-anchor.agn-cap-hide .cap-name')].map((e) => e.textContent.trim()), z: map.getZoom() }; });
const natO = [], natHid = new Set(), cityO = []; let nN = 0, nC = 0;
for (const [nm, la, lo] of PL) { await pg.evaluate(([n, a, o]) => AGN.flow.setActiveLocation({ name: n, lat: a, lon: o }, n, { src: 'search' }), [nm, la, lo]); await pg.waitForTimeout(3000);
  const m = await measure(); natO.push(...m.over.map((x) => nm + ': ' + x)); m.hidden.forEach((h) => natHid.add(h)); nN += m.names; nC += m.chips; }
ok(!natO.length && nN > 0 && nC > 0, 'L1 national zoom, 10 places: no chip or pin on a place name (' + nN + ' names, ' + nC + ' chips seen)', natO.slice(0, 5).join('; '));
ok(!['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Quetta', 'Gilgit'].some((n) => natHid.has(n)), 'L1 national zoom: no main city name is hidden to make room (' + ([...natHid].join(', ') || 'none hidden') + ')');
for (let i = 0; i < 4; i++) { await pg.click('.leaflet-control-zoom-in'); await pg.waitForTimeout(800); }
let zc = null;
for (const [nm, la, lo] of PL) { await pg.evaluate(([a, o]) => map.panTo([a, o], { animate: false }), [la, lo]); await pg.waitForTimeout(2200); const m = await measure(); zc = m.z; cityO.push(...m.over.map((x) => nm + ': ' + x)); }
ok(!cityO.length && zc >= 7.5, 'L1 city zoom (' + zc + '), 10 places: no chip or pin on a place name', cityO.slice(0, 5).join('; '));
/* L3 · 72 h chart, last hour on a 6-hour tick */
await go(pg, 'livedata'); await pg.waitForTimeout(6000);
const L3 = await pg.evaluate(async () => { const out = []; const ap = AGN.data.activePoint(); const v = AGN.nowAt.peek(ap.lat, ap.lon) || await AGN.nowAt.get(ap.lat, ap.lon);
  if (!v || !v.hours) return { none: true };
  const svg = document.getElementById('agnFc251C'); let card = svg; while (card && !card.querySelector('.tabs')) card = card.parentElement;
  const real = AGN.nowAt.peek; let n = 0;
  try { for (let shift = 0; shift < 6; shift++) {
      const H = v.hours.slice(), nowT = String(v.time || ''); let i0 = H.findIndex((h) => String(h.time) >= nowT); if (i0 < 0) i0 = 0;
      let k = Math.min(H.length - 1, i0 + 66) - shift;   /* the chart shows at most 6 h before now to 66 h after it: end the window there */ while (k > 0 && (Number(String(H[k].time).slice(11, 13)) % 6)) k--; const cut = Object.assign({}, v, { hours: H.slice(0, k + 1) });
      AGN.nowAt.peek = function () { return cut; }; AGN.fc251.render();
      for (const t of ['temp', 'utci', 'rain', 'wind', 'rh']) { const b = card.querySelector('.tabs button[data-t="' + t + '"]'); if (!b) continue; b.click(); n++;
        const R = svg.getBoundingClientRect(); svg.querySelectorAll('text').forEach((x) => { const r = x.getBoundingClientRect(); if (r.width && (r.right > R.right + 0.5 || r.left < R.left - 0.5)) out.push(t + ' "' + x.textContent + '" ' + Math.round(Math.max(r.right - R.right, R.left - r.left)) + ' px'); }); } } }
  finally { AGN.nowAt.peek = real; const b0 = card.querySelector('.tabs button[data-t="temp"]'); if (b0) b0.click(); AGN.fc251.render(); }
  return { out, n }; });
ok(!L3.none && L3.n >= 25 && !L3.out.length, 'L3 no axis label of the 72 h chart runs past the chart (' + L3.n + ' drawings: 5 tabs x 6 window ends, last hour on a 6-hour tick)', L3.none ? 'no forecast' : L3.out.slice(0, 5).join('; '));

/* L9 · the visible CMIP6 card runs the engine itself */
const cm = await pg.evaluate(async () => { const b = document.getElementById('agnV91CmipLoad'), st = document.getElementById('agnV91CmipStatus'); if (!b || !st || !(AGN.cmip6 && AGN.cmip6.run)) return { missing: true };
  const before = st.textContent; b.click(); await new Promise((r) => setTimeout(r, 1500)); const during = st.textContent;
  const t0 = Date.now(); while (b.getAttribute('aria-busy') === 'true' && Date.now() - t0 < 95000) await new Promise((r) => setTimeout(r, 1000));
  return { before, during, after: st.textContent, rows: document.getElementById('agnV91CmipRows').innerText }; });
ok(!cm.missing && cm.before === 'Not loaded.' && cm.after !== cm.before && !/status pending/.test(cm.after), 'L9 the Forecast CMIP6 card runs the seven-model engine (' + (cm.missing ? 'missing' : String(cm.after).slice(0, 110)) + ')', JSON.stringify(cm).slice(0, 300));

ok(!errs.length, 'client page: no page errors', errs.slice(0, 3).join(' | '));
await ctx.close();

/* L4 · the reports as drawn: tests277/reports277.test.mjs */
await br.close();
console.log(`\n${fail ? 'FAIL' : 'PASS'} fix277: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
