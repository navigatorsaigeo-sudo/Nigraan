import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.282.1 · FIX2821 · the external review of v282, item by item:
// A states (no active alert / assessed Normal / not assessed / unavailable or stale), the reviewer's case 1 Normal + 7 missing, the pulse's
//   empty-list wording from the model gate, the map hatch "Not assessed";
// B report completeness guard, model limitations from the gate's client limitations + the console's "How to use these figures", report ID
//   archived in the reports library and re-opened by ID, share link to the archived ID with an honest scope;
// C freshness: cached levels / forecasts expire on the server's validUntil and issue (fake page clock), "Updated" + stale badge;
// D river popup while the site is loading; E selected-tab contrast >= 4.5:1, drawer at 375 / 768 / 1366; F "Feels like (apparent temperature)"
//   vs "UTCI (thermal stress index)", "Level for the surrounding area (<name>)"; G build scripts without /home/claude paths.
// Fresh levels and alert lists are FIXTURES laid over the server's own answers in the browser (the test server's engine run is days old).
// usage: node scripts/tests2821/fix2821.test.mjs <base url> [screenshot dir]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* v91.17.283.12: the start page reads the point state (/api/pointstate); psf puts its area on the point as the drawer reads it; "now" is printed by the one rule (0.1 C, a trailing .0 dropped) */
const psf = (x) => (x && x.ok ? { ...x, point: { ...x.point, tehsil: x.area.tehsil, district: x.area.district, province: x.area.province } } : x);
const fmtNow = (t) => String(Math.round(t * 10) / 10);

const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:9151', OUT = process.argv[3] || null;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d = '') => { d = String(d).replace(/\n/g, ' | '); if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d.slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d.slice(0, 900) : '')); } };
const BENIGN = /Failed to load resource/;
const j = async (p) => (await fetch(BASE + p, { headers: { 'x-agn-view': 'customer' } })).json();
const todayIso = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const plus = (n) => new Date(Date.parse(todayIso() + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const ORDER = ['heat', 'cold', 'rain_hz', 'flood', 'wind', 'landslide', 'glof', 'drought'];
const SHORT = { heat: 'Heat stress', cold: 'Cold stress and frost', rain_hz: 'Heavy rain', flood: 'Flood', wind: 'Wind and gusts', landslide: 'Landslide', glof: 'GLOF', drought: 'Drought' };
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const G8 = { lat: 33.69421, lon: 73.05242, name: 'G-8, Islamabad' };

async function open(w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); const E = { page: [], console: [] };
  page.on('pageerror', (e) => E.page.push(String(e.message || e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.test(m.text())) E.console.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); }); window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  if (opts.clock) await page.clock.install({ time: opts.clock });
  if (opts.before) await opts.before(page);
  await page.goto(BASE + (opts.path || '/'), { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.AGNSTART && window.map, null, { timeout: 60000 });
  return { ctx, page, E };
}
const settled = (page) => page.waitForFunction(() => { const d = window.AGNSTART.data; return d && document.querySelector('#card[data-ready]') && ['f', 'lv', 'ctx', 'facts', 'past', 'gate'].every((k) => d.st[k] !== 'load'); }, null, { timeout: 120000 });
async function selectG8(page) { await page.evaluate((p) => window.AGNSTART.select({ ...p, src: 'search' }), G8); }
/* v91.17.283.19 · the start page reads one place bundle (GET /api/point); a fixture of a part (levels, past30, rainChance, context) patches
   that part of the bundle; several fixtures on one page share one route (applied in order) */
async function bundleFix(page, part, mod) {
  if (!page.__bp) { page.__bp = []; await page.route('**/api/point?**', async (route) => { let r; try { r = await route.fetch(); } catch (_) { return route.abort().catch(() => {}); } const J = await r.json(); for (const f of page.__bp) await f(J); await route.fulfill({ response: r, json: J }); }); }
  page.__bp.push(async (J) => { if (!J) return; if (part == null) return mod(J); if (!J.parts) return; const cur = J.parts[part] || {}; const v = await mod(cur.v == null ? {} : cur.v, J);
    J.parts[part] = v === null ? { ok: false, unavailable: true, at: new Date().toISOString(), why: cur.__why || 'the server answered 500' } : { ...cur, ok: true, unavailable: false, at: cur.at || new Date().toISOString(), v: v === undefined ? cur.v : v }; });
}
/* FIXTURE: the tehsil levels (the bundle part levels; was /api/levels/unit) with the given levels per hazard and day (null = the layer absent that day = not issued) */
function unitFix(F, o = {}) { return async (page) => {
  await bundleFix(page, 'levels', (J) => {
    if (Array.isArray(J.days) || J.ready === false || J.ready == null) { J.ready = true; J.stale = !!o.stale; J.at = o.at || new Date(Date.now() - 20 * 60e3).toISOString(); J.validUntil = o.validUntil || new Date(Date.now() + 160 * 60e3).toISOString();
      J.days = [0, 1, 2, 3].map((i) => { const L = {}; for (const [k, v] of Object.entries(F)) { if (v[i] == null) continue; L[k] = { name: SHORT[k], level: v[i], word: v[i] >= 0 ? WORDS[v[i]] : v[i] === -2 ? 'not applicable' : 'no data' }; } return { day: i, date: plus(i), layers: L }; }); }
    return J; }); }; }
const MISS7 = { heat: [0, 0, 0, 0], cold: [null, null, null, null], rain_hz: [null, null, null, null], flood: [null, null, null, null], wind: [null, null, null, null], landslide: [null, null, null, null], glof: [null, null, null, null], drought: [null, null, null, null] };

/* ---------- 0 · server fields the page now reads ---------- */
{ const h = await j('/api/levels?day=0'), pf = psf(await j('/api/point?lat=33.69421&lon=73.05242'));
  ok(h.ready === false || (Date.parse(h.validUntil) - Date.parse(h.received) === 3 * 3600e3), 'Z1 /api/levels head carries validUntil = received + the engine\'s own stale rule (3 h)', h.received + ' -> ' + h.validUntil);
  ok(pf.ok && !isNaN(Date.parse(pf.issuedAt)) && Math.abs(Date.now() - Date.parse(pf.issuedAt)) < 10 * 60e3, 'Z2 /api/pointstate carries issuedAt (the data issue time a report prints)', pf.issuedAt);
}

/* ---------- A1 · the states matrix (hzStates on the page, the reviewer's case end to end) ---------- */
{ const { ctx, page, E } = await open(1366, 768, { before: unitFix(MISS7) });
  const M = await page.evaluate(() => { const S = window.AGNSTART, row = (lv) => lv.map((v, i) => v === undefined ? { date: 'd' + i, issued: false } : { date: 'd' + i, issued: true, i: v >= 0 ? v : null, na: v === -2, nd: v === -1 });
    const mk = (spec) => ({ ok: true, dates: ['a', 'b', 'c', 'd'], hz: Object.entries(spec).map(([k, lv]) => { const r = row(lv), held = r.filter((x) => x.i != null), pk = held.length ? held.reduce((a, b) => (b.i > a.i ? b : a)) : null;
      return { key: k, short: k, row: r, peak: pk, na: r.every((x) => !x.issued || x.na) && r.some((x) => x.na) }; }) });
    const u = [undefined, undefined, undefined, undefined];
    const cases = { oneNormal7Missing: mk({ a: [0, 0, 0, 0], b: u, c: u, d: u, e: u, f: u, g: u, h: u }), allNormal: mk({ a: [0, 0, 0, 0], b: [0, 0, 0, 0], c: [-2, -2, -2, -2] }), oneLow: mk({ a: [0, 1, 0, 0], b: [0, 0, 0, 0] }),
      noData: mk({ a: [0, 0, 0, 0], b: [-1, -1, -1, -1] }), allMissing: mk({ a: u, b: u }), partialDays: mk({ a: [0, 0, u, u][0] === 0 ? [0, 0, undefined, undefined] : u, b: [0, 0, 0, 0] }) };
    const o = {}; for (const [n, L] of Object.entries(cases)) { const s = S.hzStates(L); o[n] = { all: s.allNormal, up: s.up.length, normal: s.normal.length, miss: s.miss.map((m) => m.why), na: s.na.length }; }
    o.stale = S.hzStates({ ok: false, stale: true }).allNormal; return o; });
  ok(M.oneNormal7Missing.all === false && M.oneNormal7Missing.normal === 1 && M.oneNormal7Missing.miss.length === 7 && M.oneNormal7Missing.miss.every((w) => w === 'not issued'), 'A1 reviewer case 1 Normal + 7 missing: NOT all Normal; 7 named not issued', JSON.stringify(M.oneNormal7Missing));
  ok(M.allNormal.all === true && M.allNormal.na === 1, 'A2 every expected hazard assessed Normal (one does not occur here): all Normal', JSON.stringify(M.allNormal));
  ok(M.oneLow.all === false && M.oneLow.up === 1, 'A3 one hazard Low: above Normal, not "all Normal"', JSON.stringify(M.oneLow));
  ok(M.noData.all === false && (M.noData.miss[0] === 'no data' || M.noData.miss[0] === 'data missing'), 'A4 a hazard with no data is "not assessed (data missing; v283.35 the state label)", never Normal', JSON.stringify(M.noData));
  ok(M.allMissing.all === false && M.allMissing.normal === 0 && M.allMissing.miss.length === 2, 'A5 nothing issued: not assessed, not Normal', JSON.stringify(M.allMissing));
  ok(M.partialDays.all === true, 'A6 a hazard assessed Normal on the days issued so far counts as assessed', JSON.stringify(M.partialDays));
  ok(M.stale === false, 'A7 a stale or unavailable run is never "all Normal"');
  await selectG8(page); await settled(page); await page.click('#tab_hz'); await page.waitForTimeout(500);
  const hz = await page.evaluate(() => ({ all: !!document.getElementById('hzAllNormal'), notAll: (document.getElementById('hzNotAll') || {}).textContent || '', na: (document.getElementById('hzNoLevel') || {}).textContent || '', others: (document.getElementById('hzOthers') || {}).textContent || '',
    tiles: [...document.querySelectorAll('#hzTiles .hzt .lvl')].map((x) => x.textContent) }));
  ok(!hz.all && /not every hazard expected here is assessed/.test(hz.notAll) && /Not assessed: Cold stress and frost \(not issued\), Heavy rain \(not issued\)/.test(hz.na) && /Assessed Normal \(1\)/.test(hz.others), 'A8 FIXTURE Hazards tab, 1 Normal + 7 missing: no "No hazard above Normal"; the 7 named not assessed; "Assessed Normal (1)"', JSON.stringify(hz));
  ok(hz.tiles.filter((t) => t === 'Not assessed').length === 7 && hz.tiles[0] === 'Normal', 'A9 FIXTURE tiles: Normal for heat, "Not assessed" for the 7 (not "No level")', hz.tiles.join(','));
  await page.click('#tab_rep'); await page.waitForTimeout(1200);
  const rp = await page.evaluate(() => ({ all: !!document.getElementById('repAllNormal'), not: (document.getElementById('repNotAll') || {}).textContent || '', st: (document.getElementById('repHzStates') || {}).textContent || '' }));
  ok(!rp.all && /not every hazard expected here is assessed/.test(rp.not) && /Assessed Normal: Heat stress\./.test(rp.st) && /Not assessed: .*Drought \(not issued\)/.test(rp.st), 'A10 FIXTURE report, 1 Normal + 7 missing: never reaches "No hazard above Normal"; lists Normal and not assessed', JSON.stringify(rp));
  if (OUT) { await page.click('#tab_hz'); await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/site_missing_hazards_1366.png' }); }
  ok(!E.page.length && !E.console.length, 'A11 0 page / console errors', JSON.stringify(E)); await ctx.close(); }
/* the all-Normal case end to end: the sentence appears only then */
{ const F = {}; for (const k of ORDER) F[k] = k === 'glof' ? [-2, -2, -2, -2] : [0, 0, 0, 0];
  const { ctx, page } = await open(1366, 768, { before: unitFix(F) }); await selectG8(page); await settled(page); await page.click('#tab_hz'); await page.waitForTimeout(400);
  const t = await page.evaluate(() => ({ all: (document.getElementById('hzAllNormal') || {}).textContent || '', notAll: !!document.getElementById('hzNotAll'), na: (document.getElementById('hzNoLevel') || {}).textContent || '' }));
  ok(/No hazard above Normal for the surrounding area/.test(t.all) && !t.notAll && /Does not occur here: GLOF/.test(t.na), 'A12 FIXTURE every expected hazard Normal (GLOF does not occur): "No hazard above Normal", GLOF named as not occurring', JSON.stringify(t)); await ctx.close(); }

/* ---------- A2 · national pulse: never "all clear" from an empty list ---------- */
const fixAlerts = (mod) => async (page) => { await page.route('**/api/alerts', async (route) => { if (mod === 'abort') return route.abort(); const r = await route.fetch(); const J = await r.json(); J.stampMismatch = false; /* v91.17.283.28: the fixture is a current run (the start page reads the served stampMismatch flag) */ mod(J); await route.fulfill({ response: r, json: J }); }); };
{ const G = await j('/api/gate'); const yes = [], no = [];
  for (const k of ORDER.concat(['quake'])) { const e = G.entries.find((x) => (x.layers || []).includes(k)); if (!e) continue; const nm = k === 'quake' ? 'Earthquake' : SHORT[k]; if (e.canAlert) yes.push(nm); else no.push(nm + ' (' + e.productType + ')'); }
  const lw = (a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const at = new Date(Date.now() - 30 * 60e3).toISOString();
  const { ctx, page, E } = await open(1366, 768, { before: fixAlerts((J) => { J.ready = true; J.stale = false; J.rows = []; J.count = 0; J.at = at; }) });
  await page.waitForFunction(() => /alert-eligible|No active alert/.test(document.getElementById('pulse').textContent), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500);
  const t = await page.evaluate(() => ({ txt: document.getElementById('pulseNote').textContent, det: document.getElementById('pulseNote').title, fold: (document.getElementById('pulseFold') || {}).textContent || '', vis: (() => { const n = document.getElementById('pulseNote'), r = n.getBoundingClientRect(), s = document.getElementById('natStats').getBoundingClientRect(); return { right: r.right, statsLeft: s.left, h: r.height, sh: n.scrollHeight }; })() }));
  /* v91.17.283.6 · expected text updated to the intended v91.17.283.2 S8 wording (CHANGES v283.2 "Old suites", UI S7/S8): the strip shows one
     short line ("No active alerts · run of HH:MM PKT"); the full sentence (the hazards that can alert, those that never do, the run time) is in
     the note's tooltip and the Details fold. The checks keep their strength: the same hazards, product types and run time, now read from the
     detail text, and no "All clear" anywhere. A13 has the same S8 cause as A14 and is updated with it. */
  ok(/^No active alerts · run of \d\d:\d\d PKT$/.test(t.txt) && t.det.startsWith('No active alerts for the hazards that can alert: ' + lw(yes)) && t.det.includes(lw(no) + ' are screening or indicative products and never alert.') && t.fold === t.det && !/All clear/i.test(t.txt + t.det), 'A13 FIXTURE empty alert list: short line; the detail names the gate\'s alert-eligible hazards (canAlert) and those that never alert with their product type; no "All clear"', t.txt + ' | ' + t.det);
  ok(/run of \d\d:\d\d PKT/.test(t.txt) && /\(run of .* PKT\)/.test(t.det) && yes.length >= 1 && no.length >= 1, 'A14 the empty list states its run time (short line and detail)', t.txt + ' | ' + yes.join(',') + ' | ' + no.join(','));
  ok(t.vis.right <= t.vis.statsLeft + 1 && t.vis.sh <= t.vis.h + 2, 'A15 the note fits left of the national numbers, nothing cut', JSON.stringify(t.vis));
  if (OUT) await page.screenshot({ path: OUT + '/pulse_no_alerts_1366.png', clip: { x: 0, y: 0, width: 1366, height: 160 } });
  ok(!E.page.length && !E.console.length, 'A16 0 errors', JSON.stringify(E)); await ctx.close();
  const s2 = await open(1366, 768, { before: fixAlerts((J) => { J.ready = true; J.stale = true; J.rows = []; J.at = at; }) }); await s2.page.waitForTimeout(3000);
  /* v91.17.283.6 · A17 expected text: v91.17.283.2 S8 short line "Alert list out of date · last run <PKT>" in the strip, the full sentence in the
     tooltip and the Details fold; still no reassurance anywhere */
  const t2 = await s2.page.evaluate(() => ({ strip: document.getElementById('pulse').textContent, det: (document.getElementById('pulseNote') || {}).title || '', fold: (document.getElementById('pulseFold') || {}).textContent || '' }));
  ok(/Alert list out of date · last run .* PKT/.test(t2.strip) && /out of date \(last run .* PKT\), so no current alert is shown/.test(t2.det) && t2.fold === t2.det && !/All clear|alert-eligible|can alert|No active alert/.test(t2.strip + t2.det), 'A17 FIXTURE stale list: "out of date (last run …)", no reassurance', JSON.stringify(t2)); await s2.ctx.close();
  const s3 = await open(1366, 768, { before: fixAlerts('abort') }); await s3.page.waitForTimeout(3000);
  const t3 = await s3.page.evaluate(() => document.getElementById('pulse').textContent); ok(/did not answer/.test(t3) && !/All clear/.test(t3), 'A18 FIXTURE failed list: "did not answer", no reassurance', t3); await s3.ctx.close(); }

/* ---------- A3 · map: areas without an assessed level are hatched "Not assessed" ---------- */
{ /* v91.17.283.20 (B6): the start page reads day 0 of every hazard in one request (/api/levels?layers=...&day=0); the fixture sets heat in it */
  const fixHeat = (J) => { if (J && J.levels) { J.stale = false; let i = 0; for (const k of Object.keys(J.levels)) { const m = i++ % 5; if (m === 4) delete J.levels[k]; else J.levels[k] = m === 3 ? -1 : m; } } return J; };
  const { ctx, page } = await open(1366, 768, { before: async (p) => { await p.route('**/api/levels?layer=heat&day=0', async (route) => { const r = await route.fetch(); const J = await r.json();
    fixHeat(J); await route.fulfill({ response: r, json: J }); });
    await p.route(/\/api\/levels\?layers=[^&]*&day=0$/, async (route) => { const r = await route.fetch(); const J = await r.json(); if (J && J.layers && J.layers.heat) fixHeat(J.layers.heat); await route.fulfill({ response: r, json: J }); }); } });
  await page.evaluate(() => window.AGNSTART.setHz('heat', 0)); await page.waitForFunction(() => window.AGNSTART.hzCount, null, { timeout: 60000 }); await page.waitForTimeout(800);
  const m = await page.evaluate(() => { const S = window.AGNSTART, f = {}; S.hzLayer.eachLayer((l) => { const k = l.getElement().getAttribute('fill'); f[k] = (f[k] || 0) + 1; });
    return { f, n: S.hzCount, chip: document.getElementById('hzChip').textContent, legend: document.getElementById('hzLegend').textContent, pat: !!document.querySelector('.leaflet-pane svg pattern#agnHatch'), normalDrawn: (() => { let x = 0; S.hzLayer.eachLayer((l) => { if (/#BFD6B4/i.test(l.getElement().getAttribute('fill'))) x++; }); return x; })() }; });
  ok(m.pat && m.f['url(#agnHatch)'] === m.n.none && m.n.none > 0 && m.normalDrawn === 0, 'A19 FIXTURE no-data and missing areas drawn with the hatch pattern; Normal stays clear (distinct)', JSON.stringify(m.f) + ' ' + JSON.stringify(m.n));
  ok(/Not assessed \(\d+ areas?\)/.test(m.chip) && /Not assessed: hatched/.test(m.legend) && /Normal: not coloured/.test(m.legend), 'A20 legend entry "Not assessed" on the map chip and in the menu legend', m.chip + ' | ' + m.legend);
  ok(/Hazard levels describe the surrounding area, not this exact point/.test(m.chip), 'F1 the map legend says levels describe the surrounding area, not this exact point', m.chip);
  await ctx.close(); }
{ const lv = await j('/api/levels?layer=heat&day=0'); const { ctx, page } = await open(1366, 768);
  await page.evaluate(() => window.AGNSTART.setHz('heat', 0)); await page.waitForFunction(() => window.AGNSTART.hzCount, null, { timeout: 60000 }); await page.waitForTimeout(600);
  const m = await page.evaluate(() => { let n = 0, h = 0; window.AGNSTART.hzLayer.eachLayer((l) => { n++; if (l.getElement().getAttribute('fill') === 'url(#agnHatch)') h++; }); return { n, h, t: window.AGNSTART.tehs.features.length, chip: document.getElementById('hzChip').textContent, note: document.getElementById('hzNote').textContent }; });
  ok(lv.stale ? (m.h === m.t && /Not assessed: The hazard run of .* is out of date/.test(m.chip) && /out of date/.test(m.note)) : m.n > 0, 'A21 an out-of-date run: every area hatched "Not assessed" with the reason (never clear like Normal)', JSON.stringify(m)); await ctx.close(); }

/* ---------- B · report: completeness guard, failed sections, limitations, ID + archive + reopen, share ---------- */
{ let release = null; const gate = new Promise((r) => { release = r; });
  const { ctx, page, E } = await open(1366, 768, { before: async (p) => {
    /* v91.17.283.19: the actions (report context) arrive in the one place bundle with every other section, so no section of the report
       waits on its own; the past 30 days part fails (500) */
    await bundleFix(p, 'past30', () => null); } });
  await selectG8(page); await page.waitForFunction(() => window.AGNSTART.data && window.AGNSTART.data.st.f === 'ok', null, { timeout: 90000 });
  const w = await page.evaluate(() => { const d = window.AGNSTART.data; return { st: { ...d.st } }; });
  ok(w.st.ctx !== 'load' && w.st.lv !== 'load' && w.st.past !== 'load' && w.st.facts !== 'load', 'B1 one bundle: when the forecast is in, the actions, levels, facts and past 30 days are in too (no section waits on its own)', JSON.stringify(w.st));
  await page.evaluate(() => window.AGNSTART.goTab('rep')); await page.waitForTimeout(1200);
  const w2 = await page.evaluate(() => ({ todo: document.getElementById('repDoc').innerText }));
  ok(!/Loading the actions/.test(w2.todo), 'B2 the report never shows the actions as still loading once the place is in', (/What to do\n([^\n]*)/.exec(w2.todo) || [])[1]);
  release(); await settled(page); await page.waitForTimeout(800);
  await page.click('#edFull'); await page.waitForTimeout(800);
  const c = await page.evaluate(() => ({ dis: document.getElementById('bPdf').disabled, wait: document.getElementById('repWait').textContent, na: (document.querySelector('#repDoc [data-na="past"]') || {}).textContent || '', done: document.getElementById('repWrap').getAttribute('data-complete') }));
  ok(!c.dis && !c.wait && c.done === 'true', 'B4 every section answered: Download enabled', JSON.stringify(c));
  ok(/The past 30 days: not available \(the server answered 500\)\./.test(c.na), 'B5 a failed section is printed "not available (reason)"', c.na);
  /* limitations: same source as the console reports (gate-status client limitations), all of them, and the console's own how-to text */
  const GS = await j('/api/report/gate-status'), LIM = await page.evaluate(() => ({ t: document.getElementById('repLimits').innerText, how: (document.getElementById('repHowTo') || {}).innerText || '', asof: document.getElementById('repGateAsOf').textContent }));
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  /* the page's display wording (MAP2802): "tehsil" reads "the surrounding area" / "area"; nothing else changes */
  const aw = (t) => String(t).replace(/\b(inside|within|in) the tehsil\b/gi, 'in the surrounding area').replace(/\b(the|this|its|each) tehsil\b/gi, 'the surrounding area').replace(/\btehsils\b/gi, 'areas').replace(/\btehsil\b/gi, 'area'); const own = GS.layerOwner, ids = [...new Set(ORDER.map((k) => own[k]).concat(['hyperlocal-temperature', 'hourly-forecast']))];
  const missing = []; for (const id of ids) { const e = GS.entries.find((x) => x.id === id); for (const l of (e && e.limitations) || []) { if (!LIM.t.includes(aw(cap(l.replace(/[.;\s]+$/, ''))))) missing.push(id + ': ' + l.slice(0, 50)); } }
  ok(!missing.length && ids.length >= 9, 'B6 report limitations = every client limitation of each hazard model and of the point engine (GET /api/report/gate-status, the console reports\' source)', missing.slice(0, 3).join(' | ') || ids.join(','));
  ok(/quoted mountain accuracy is optimistic/.test(LIM.t) && /Humidity from the forecast models runs dry/.test(LIM.t) && /not tested beyond day 5/.test(LIM.t), 'B7 the reviewer\'s limits are present in plain words: mountain validation optimistic, dry humidity bias, untested horizons', '');
  ok(/Product type: Forecast/.test(LIM.t) && /Product type: Screening index/.test(LIM.t) && LIM.asof.includes(GS.asOf), 'B8 product types per model and the gate date', LIM.asof);
  const con = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8'), st = readFileSync(join(ROOT, 'artefact', 'NIGRAAN_START.html'), 'utf8');
  const fa = con.indexOf('function howToHtml(o){'), fz = con.indexOf('\n  /* the event history of the place', fa), fsrc = con.slice(fa, fz).trimEnd();
  ok(fa > 0 && st.includes(fsrc) && /How to use these figures/.test(LIM.how) && /Hazard levels \(Normal to Severe\)/.test(LIM.how) && !/15-day forecast/.test(LIM.how), 'B9 "How to use these figures" is the console report\'s own function, byte for byte (no new text); rows for figures this report does not carry left out', LIM.how.slice(0, 120));
  /* identity: archive, ID, data issue time, reopen */
  const pf = await page.evaluate(() => window.AGNSTART.data.f.issuedAt);
  await page.click('#bPdf'); await page.waitForFunction(() => /archived/.test(document.getElementById('repStatus').textContent), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ st: document.getElementById('repStatus').textContent, id: document.getElementById('repDoc').getAttribute('data-report-id'), line: document.getElementById('repId').textContent, printed: window.__printed || 0 }));
  ok(r.printed === 1 && /^site-\d{8}-\d{4}-[0-9a-f]{16}$/.test(r.id) && r.st.includes('Report ' + r.id + ' archived'), 'B10 Download PDF archives the report first (POST /api/reports/issue), then prints', JSON.stringify(r));
  ok(/^Report ID site-\S+ · data issued \w{3} \d+ \w{3} \d{4} \d\d:\d\d PKT · rendered \w{3} \d+ \w{3} \d{4} \d\d:\d\d PKT$/.test(r.line) && !/today/.test(r.line), 'B11 "Report ID … · data issued … · rendered …" (absolute PKT times)', r.line);
  const rec = await j('/api/reports/' + r.id + '.json'), list = await j('/api/reports?limit=50'), le = (list.reports || []).find((x) => x.id === r.id);
  ok(rec.report_id === r.id && rec.data_issued_at === pf && le && le.dataAt === new Date(Date.parse(pf)).toISOString() && rec.sections && rec.sections['past 30 days'] === 'not available (the server answered 500)', 'B12 the archived record: the data issue time = the forecast\'s issuedAt (not the render time), section states kept', JSON.stringify({ d: rec.data_issued_at, pf, le: le && le.dataAt, s: rec.sections }));
  const h1 = await (await fetch(BASE + '/api/reports/' + r.id)).text(), h2 = await (await fetch(BASE + '/api/reports/' + r.id)).text();
  const shownName = await page.evaluate(() => window.AGNSTART.data.place.name);   /* v283.19: the one label, the place table's name */
  ok(h1 === h2 && h1.includes('Report ID ' + r.id) && h1.includes(shownName) && h1.includes('Limitations of these figures') && !/archived when you download/.test(h1) && /<img id="repMap"/.test(h1), 'B13 reopening by ID gives the archived document (same bytes each time; ID, place, limitations, map)', h1.length + ' bytes');
  const v = await open(1366, 900, { path: '/api/reports/' + r.id }).catch(() => null);
  if (v) { /* the archived page needs no script and loads nothing from outside */ await v.ctx.close(); }
  /* share = the archived ID, with an honest scope */
  await page.evaluate(() => { try { navigator.clipboard.writeText = () => Promise.reject(new Error('x')); } catch (_) {} }); await page.click('#bShare2'); await page.waitForTimeout(800);
  const sh = await page.evaluate(() => document.getElementById('repStatus').textContent); const link = (/(http\S+)/.exec(sh) || [])[1];
  const host = new URL(BASE).hostname, local = /^(localhost|127\.|::1)/.test(host);
  ok(link === BASE + '/api/reports/' + r.id && (local ? /Link works on this computer only\./.test(sh) : true) && !/#agnplace/.test(link), 'B14 Share link = the archived report ID (not coordinates); on this computer it says "Link works on this computer only"', sh);
  const again = await page.evaluate(() => window.AGNSTART.issueReport().then((x) => x.id)); ok(again === r.id, 'B15 the same data gives the same report ID (no duplicate in the library)', again);
  if (OUT) { await page.evaluate(() => document.getElementById('repLimits').scrollIntoView()); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/report_limitations_id_1366.png' });
    await page.evaluate(() => document.getElementById('pane_rep').scrollTop = 0); await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/report_id_1366.png' }); }
  ok(!E.page.length && !E.console.length, 'B16 0 page / console errors', JSON.stringify(E)); await ctx.close(); }

/* ---------- C · freshness with a fake page clock ---------- */
{ let FAKE = null; const T0 = Date.now(), C = { unit: 0, head: 0, layer: 0, fc: 0 }; let issue = new Date(T0 - 20 * 60e3).toISOString();
  const fresh = (J) => { J.ready = true; J.stale = false; J.stampMismatch = false; J.at = issue; J.received = issue; J.validUntil = new Date(T0 + 30 * 60e3).toISOString();
    if (J.layers && typeof J.layers === 'object') Object.values(J.layers).forEach((L) => { if (L && typeof L === 'object') fresh(L); });   /* v91.17.283.20 (B6): /api/levels?layers= holds each layer's answer */
    return J; };
  const { ctx, page, E } = await open(1366, 768, { clock: T0, before: async (p) => {
    await p.route('**/api/levels?**', async (route) => { const u = route.request().url(); if (/layers?=/.test(u)) C.layer++; else C.head++; const r = await route.fetch(); const J = await r.json(); await route.fulfill({ response: r, json: fresh(J) }); });
    await bundleFix(p, 'levels', (J) => { C.unit++; if (Array.isArray(J.days)) { fresh(J); J.days.forEach((d, i) => { d.date = plus(i); }); } return J; });   /* v283.19: the tehsil levels are the bundle part levels */
    await p.route('**/api/alerts', async (route) => { const r = await route.fetch(); const J = await r.json(); fresh(J); J.rows = []; await route.fulfill({ response: r, json: J }); });
    await bundleFix(p, null, (J) => { C.fc++;
      if (FAKE && J.now && Array.isArray(J.hours)) { const h0 = Math.floor((FAKE + 5 * 3600e3) / 3600e3) * 3600e3, hs = (ms) => new Date(ms).toISOString().slice(0, 16); J.now.time = hs(h0); J.hours.forEach((h, i) => { h.time = hs(h0 + i * 3600e3); }); }
      }); } });
  await selectG8(page); await settled(page); await page.waitForTimeout(1500); await page.click('#tab_hz'); await page.waitForTimeout(400);
  const c0 = { ...C }, s0 = await page.evaluate(() => ({ fr: { ...window.AGNSTART.fresh, timer: null }, upd: [...document.querySelectorAll('.upd')].map((x) => x.getAttribute('data-upd') + ':' + x.textContent), stale: document.querySelectorAll('.stb').length }));
  ok(s0.fr.valid === T0 + 30 * 60e3 && s0.stale === 0 && s0.upd.some((x) => /^hz:Updated \d\d:\d\d PKT$/.test(x)) && s0.upd.some((x) => /^now:Updated/.test(x)), 'C1 FIXTURE validity read from the server (validUntil); each section says when it was updated; nothing stale yet', JSON.stringify(s0).slice(0, 300));
  await page.clock.fastForward(31 * 60e3); await page.waitForFunction(() => window.AGNSTART.fresh.invalidations >= 1 && document.querySelector('[data-stale="hz"]'), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1000);
  const s1 = await page.evaluate(() => ({ inv: window.AGNSTART.fresh.invalidations, checks: window.AGNSTART.fresh.checks, why: window.AGNSTART.fresh.why, badge: [...document.querySelectorAll('.stb')].map((x) => x.getAttribute('data-stale')) }));
  ok(s1.why === 'clock' && s1.inv >= 1 && C.unit > c0.unit && C.layer > c0.layer, 'C2 FIXTURE the clock passing validUntil drops the cached national levels (types) and the site levels and reads them again', JSON.stringify({ s1, c0, C }));
  ok(s1.badge.includes('hz') && s1.badge.includes('todo'), 'C3 FIXTURE past validity: "Out of date" badge on the hazards and actions sections', JSON.stringify(s1.badge));
  if (OUT) await page.screenshot({ path: OUT + '/stale_badge_1366.png' });
  issue = new Date(T0 + 25 * 60e3).toISOString(); const u1 = C.unit;
  const inv1 = await page.evaluate(() => window.AGNSTART.fresh.invalidations); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForFunction((n) => window.AGNSTART.fresh.invalidations > n, inv1, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500);
  const s2 = await page.evaluate(() => ({ inv: window.AGNSTART.fresh.invalidations, at: window.AGNSTART.fresh.at, why: window.AGNSTART.fresh.why }));
  ok(s2.why === 'visible' && s2.inv > s1.inv && s2.at === issue && C.unit > u1, 'C4 FIXTURE back to the tab: a new issue id drops every cached level (saved sites, national, the site)', JSON.stringify(s2));
  /* the test server's forecast hour is real time; the page clock is ahead: the fixture moves the forecast's hours to the page's own hour */
  FAKE = await page.evaluate(() => Date.now()); await page.evaluate(() => window.AGNSTART.checkFresh('test')); await page.waitForTimeout(2500);
  const vF = await page.evaluate(() => window.AGNSTART.data.validF), now = await page.evaluate(() => Date.now()), f1 = C.fc;
  ok(vF && vF > now && vF - now <= 3600e3, 'C5 the forecast\'s validity comes from its own now hour + hour step', new Date(vF).toISOString());
  await page.clock.fastForward(Math.max(1000, vF - now + 3000)); await page.waitForTimeout(2500);
  ok(C.fc > f1, 'C6 FIXTURE the clock passing the forecast\'s validity reads the site forecast again (in place)', f1 + ' -> ' + C.fc);
  const src = readFileSync(join(ROOT, 'build', 'start', 'start.src.html'), 'utf8'); const fz = src.slice(src.indexOf('function freshTimer'), src.indexOf('function checkFresh'));
  ok(!/\d+\s*\*\s*60e3|\d+\s*\*\s*3600e3/.test(fz.replace('5*3600e3', '')), 'C7 the freshness timer uses server / response times only (no typed minutes)', '');
  ok(!E.page.length, 'C8 0 page errors', JSON.stringify(E)); await ctx.close(); }

/* ---------- D · river popup while the site loads ---------- */
{ const { ctx, page, E } = await open(1366, 768, { before: async (p) => { for (const pat of ['**/api/report/past30?**'])   /* v283.19: the place facts are a part of the bundle */ await p.route(pat, async (route) => { await new Promise((r) => setTimeout(r, 15000)); await route.continue(); }); } });
  await page.waitForFunction(() => window.AGNSTART.rivers.layer, null, { timeout: 30000 });
  await selectG8(page); await page.waitForFunction(() => window.AGNSTART.data && window.AGNSTART.data.st.f === 'ok', null, { timeout: 60000 });
  const seq0 = await page.evaluate(() => window.AGNSTART.seq);
  await page.evaluate(() => new Promise((r) => { map.once('moveend', r); map.setView([33.89, 72.25], 10, { animate: false }); })); await page.waitForTimeout(600);
  const pt = await page.evaluate(() => { const R = window.AGNSTART.rivers, W = map.getSize().x - document.getElementById('card').offsetWidth; for (const k of R.vis || []) { const rv = R.data.rivers[k]; if (rv.name !== 'Indus') continue; for (const q of rv.coords) { const p = map.latLngToContainerPoint([q[1], q[0]]); if (p.x > 40 && p.x < W - 40 && p.y > 60 && p.y < map.getSize().y - 60) return { x: p.x, y: p.y + map.getContainer().getBoundingClientRect().top }; } } return null; });
  if (pt) await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(500);
  const mid = await page.evaluate(() => ({ pop: window.AGNSTART.rivers.popup, popSeq: window.AGNSTART.popSeq, seq: window.AGNSTART.seq, st: { ...window.AGNSTART.data.st } }));
  await page.waitForFunction(() => { const d = window.AGNSTART.data; return d && d.st.facts !== 'load' && d.st.past !== 'load'; }, null, { timeout: 30000 }).catch(() => {});
  const end = await page.evaluate(() => ({ st: { ...window.AGNSTART.data.st }, place: !document.querySelector('#rb_place .sk'), p30: !document.querySelector('#rb_p30 .sk') }));
  ok(pt && mid.pop && mid.pop.river === 'Indus' && mid.popSeq >= 1 && mid.seq === seq0, 'D1 a river popup opened right after the place was selected uses its own counter (site request counter unchanged; v283.19: the sections arrive in one bundle)', JSON.stringify(mid));
  ok(end.st.facts === 'ok' && end.st.past === 'ok' && end.place && end.p30, 'D2 the site sections still complete after the river click', JSON.stringify(end));
  ok(!E.page.length && !E.console.length, 'D3 0 errors', JSON.stringify(E)); await ctx.close(); }

/* ---------- E · contrast and narrow screens ---------- */
const lum = (rgb) => { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
for (const [w, h] of [[1366, 768], [768, 1024], [375, 812]]) {
  const { ctx, page, E } = await open(w, h); await selectG8(page); await settled(page); await page.waitForTimeout(800);
  if (w === 1366) { const cs = [];
    for (const t of ['now', 'fc', 'hz', 'place', 'p30', 'rep']) { await page.evaluate((t) => window.AGNSTART.goTab(t), t); await page.waitForTimeout(450);
      const c = await page.evaluate((t) => { const b = document.getElementById('tab_' + t), s = getComputedStyle(b); return { bg: s.backgroundColor, fg: s.color, sel: b.getAttribute('aria-selected') }; }, t); cs.push([t, c.sel, Math.round(ratio(rgb(c.bg), rgb(c.fg)) * 100) / 100]); }
    ok(cs.every((x) => x[1] === 'true' && x[2] >= 4.5), 'E1 every selected tab: text contrast >= 4.5:1 (computed from the rendered colours)', JSON.stringify(cs));
    await page.evaluate(() => window.AGNSTART.goTab('now')); await page.waitForTimeout(1000); }   /* v91.17.283.12: past the 0.35 s width transition back from the wide Report tab */
  const geo = async () => page.evaluate(() => { const c = document.getElementById('card').getBoundingClientRect(), panes = [...document.querySelectorAll('#dTrack .pane')].map((p) => p.id + ':' + (p.scrollWidth - p.clientWidth));
    return { l: Math.round(c.left), r: Math.round(c.right), w: Math.round(c.width), vw: innerWidth, sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, over: panes.filter((x) => +x.split(':')[1] > 1),
      zoom: (() => { const z = document.getElementById('zoom'); const s = getComputedStyle(z); if (s.display === 'none') return 'hidden'; const r = z.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth ? 'in' : 'out'; })() }; });
  const g = await geo();
  ok(g.l >= 0 && g.r <= g.vw && Math.abs(g.w - Math.min(w >= 1600 ? 520 : 440, w)) <= 1 && g.sw <= g.vw && g.bw <= g.vw && !g.over.length && g.zoom !== 'out', 'E2 drawer at ' + w + ' px: max-width min(440 px, 100vw), nothing overflows (page or panes), zoom buttons on screen or hidden', JSON.stringify(g));
  await page.evaluate(() => window.AGNSTART.goTab('rep')); await page.waitForTimeout(900);
  const g2 = await geo(); const want = w < 900 ? w : Math.round(0.6 * w);
  ok(Math.abs(g2.w - want) <= 2 && g2.l >= 0 && g2.sw <= g2.vw && !g2.over.length, 'E3 report mode at ' + w + ' px: ' + (w < 900 ? 'full width (below 900 px)' : 'min(60vw, 100vw)') + ', nothing overflows', JSON.stringify(g2));
  if (w === 375 && OUT) await page.screenshot({ path: OUT + '/report_375.png' });
  ok(!E.page.length && !E.console.length, 'E4 ' + w + ' px: 0 errors', JSON.stringify(E)); await ctx.close(); }

/* ---------- F · wording precision ---------- */
{ const F = { heat: [2, 1, 0, 0], cold: [0, 0, 0, 0], rain_hz: [0, 0, 0, 0], flood: [0, 0, 0, 0], wind: [0, 0, 0, 0], landslide: [0, 0, 0, 0], glof: [-2, -2, -2, -2], drought: [0, 0, 0, 0] };
  const { ctx, page } = await open(1366, 768, { before: unitFix(F) }); await selectG8(page); await settled(page); await page.waitForTimeout(800);
  const pf = psf(await j('/api/point?lat=33.69421&lon=73.05242')), r0 = (x) => String(Math.round(x));
  const tx = await page.evaluate(() => ({ now: document.getElementById('nowBox').innerText, stat: document.getElementById('nowStats').innerText, h12: [...document.querySelectorAll('#h12Table th')].map((x) => x.textContent), n3: [...document.querySelectorAll('#n3Table th')].map((x) => x.textContent),
    why: [...document.querySelectorAll('#hzSec .hz .why')].map((x) => x.textContent), card: document.getElementById('card').innerText, supp: (document.getElementById('hzSupp') || {}).textContent, tags: [...document.querySelectorAll('#hzSec .hz .tag')].map((x) => x.textContent),
    table: (document.getElementById('hzTableSupp') || {}).textContent, pill: (document.querySelector('#pane_now .supp') || {}).textContent, tiles: (document.querySelector('#hzTiles + .note') || {}).textContent }));
  /* v91.17.283.37 · B1 (owner, live check 30 Oct): no method words on a client screen: "(apparent temperature)" is dropped; "Feels like" stays the forecast's feelsC */
  ok(tx.now.includes('Feels like ' + r0(pf.now.feelsC) + ' °C') && !/apparent temperature/.test(tx.now + tx.stat) && tx.h12.includes('Feels like °C'), 'F2 "Feels like" = the forecast\'s feelsC in Now and the hourly table (no "(apparent temperature)" on a client screen, v283.37 B1)', tx.now.split('\n')[1]);
  ok(tx.why.length && /^Heat stress index in shade up to -?\d+ °C at this site/.test(tx.why[0]) && tx.n3.some((x) => /^Heat stress index in shade, max °C$/.test(x)) && !/Feels-like/.test(tx.card), 'F3 the heat level text and the table name the UTCI as "Heat stress index" (plain words, v283.37 B1); "Feels-like" is never used for it', tx.why[0]);
  const area = pf.point.tehsil + (pf.point.district && pf.point.district.replace(/ District$/, '') !== pf.point.tehsil ? ', ' + pf.point.district.replace(/ District$/, '') : ''), lab = 'Level for the surrounding area (' + area + ')';
  ok(tx.supp === lab && tx.tags.every((t) => t.endsWith(' · ' + lab)) && tx.table === lab && tx.pill === 'at this point' && tx.tiles.includes('level for the surrounding area (' + area + ')'), 'F4 every level states its support: "' + lab + '" next to the levels, tags, the table and the tiles; the Now pill is the point\'s own heat level, "at this point" (v283.37)', JSON.stringify({ supp: tx.supp, tag: tx.tags[0], pill: tx.pill }));
  await page.evaluate(() => window.AGNSTART.goTab('rep')); await page.waitForTimeout(1000);
  const rp = await page.evaluate(() => ({ h3: [...document.querySelectorAll('#repDoc h3')].map((x) => x.textContent), kn: document.getElementById('repKn').innerText }));
  ok(rp.h3.includes('Hazards · ' + lab) && /Feels like/.test(rp.kn) && !/apparent temperature/.test(rp.kn), 'F5 the report carries the support label and the feels-like name (no "(apparent temperature)", v283.37 B1)', rp.h3.join(' | '));
  await ctx.close(); }

/* ---------- G · build scripts without a hard-coded /home/claude path ---------- */
{ const bad = []; const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(sh|py|mjs|js)$/.test(f.name) && /\/home\/claude\//.test(readFileSync(p, 'utf8'))) bad.push(p.replace(ROOT + '/', '')); } };
  walk(join(ROOT, 'build')); for (const f of ['scripts/gen/write_gate_v103.py']) if (existsSync(join(ROOT, f)) && /\/home\/claude\//.test(readFileSync(join(ROOT, f), 'utf8'))) bad.push(f);
  ok(!bad.length, 'G1 build scripts (build/, scripts/gen/write_gate_v103.py) carry no /home/claude path (ROOT-derived)', bad.join(', ')); }


/* ---------- R · science check (SCI2821): rain chance, AQ claims, measured out-of-sample figures ---------- */
{ const RC = { ready: true, runId: 'fixture', days: [{ date: plus(1), p: { 1: 35.2, 10: 8.1 }, fcMm: 3.1 }, { date: plus(2), p: { 1: null, 10: null }, why: { 1: 'withheld: the next day’s forecast total is not held, and the model needs it' }, fcMm: 0 }] };
  const { ctx, page, E } = await open(1366, 768, { before: async (p) => { await bundleFix(p, 'rainChance', () => RC); } });   /* v283.19: the bundle part rainChance */
  await selectG8(page); await settled(page); await page.waitForTimeout(800);
  const c = await page.evaluate(() => [...document.querySelectorAll('#rb_n3 .days3 > div')].map((x) => ({ d: x.getAttribute('data-date'), rc: (x.querySelector('.rcd') || {}).textContent || '', mm: (x.querySelector('.rmm') || {}).textContent || '', all: x.innerText })));
  const G = await j('/api/gate'), ptype = (id) => (G.entries.find((e) => e.id === id) || {}).productType;
  ok(c[0].rc === '35% chance of a rain day · ' + ptype('rain-chance') && /^Forecast amount \d+(\.\d)? mm · /.test(c[0].mm), 'R1 FIXTURE day 1: the served calibrated chance of a rain day (p[1], the console\'s wording) with its product type; the amount only as secondary text with its product type', JSON.stringify(c[0]));
  ok(/^Chance of a rain day withheld \(the next day.s forecast total is not held/.test(c[1].rc) && /^Chance of rain not issued for this day/.test(c[2].rc), 'R2 FIXTURE a withheld chance and a day the chance does not cover say so (never a guess)', c[1].rc + ' | ' + c[2].rc);
  ok(c.every((x) => !/\bDry\b/.test(x.all)), 'R3 no "Dry" word on the day cards', c.map((x) => x.all.replace(/\n/g, ' ')).join(' | '));
  await page.evaluate(() => window.AGNSTART.goTab('rep')); await page.waitForTimeout(800); await page.click('#edFull'); await page.waitForTimeout(900);
  const rp = await page.evaluate(() => ({ cards: [...document.querySelectorAll('#repN3 .rcd')].map((x) => x.textContent), head: [...document.querySelectorAll('#repN3Table th')].map((x) => x.textContent), doc: document.getElementById('repDoc').innerText, lim: document.getElementById('repLimits').innerText, asof: document.getElementById('repGateAsOf').textContent }));
  ok(rp.cards[0] === c[0].rc && rp.head.includes('Chance of rain (calibrated, area)') && !/\bDry\b/.test(rp.doc), 'R4 the report carries the same rain chance (cards and the 4-day table), no "Dry"', rp.cards.join(' | '));
  const O = JSON.parse(readFileSync(join(ROOT, 'build', 'start', 'validation-oos.json'), 'utf8'));
  ok(O.lines.length === 3 && O.lines.every((l) => rp.lim.includes(l)) && rp.asof.includes(O.sha256.slice(0, 16)), 'R5 the measured out-of-sample figures (generated from the science summary, its hash kept) are in the report limitations', O.lines[0].slice(0, 120));
  ok(/Daily maximum off by 1\.5–1\.6 °C on average and 0\.3–0\.4 °C too cool; daily minimum off by 1\.5–1\.6 °C and 1\.1–1\.2 °C too warm/.test(rp.lim) && /Mountains: hourly temperature off by 2\.0 °C \[1\.85–2\.\d\d\], about 1 °C too cold; hills: 2\.\d °C, about 2 °C too cold/.test(rp.lim) && /held 94–95 % of hours overall, 85 % in the hills, 97\.5 % in the mountains, and 86–89 % of plains daily/.test(rp.lim), 'R6 the numbers as measured: daily max / min error and bias, mountains and hills, 90 % range coverage', '');
  if (existsSync(O.source)) { const { createHash } = await import('node:crypto'); ok(createHash('sha256').update(readFileSync(O.source)).digest('hex') === O.sha256, 'R7 validation-oos.json sha256 = its source summary', O.source); }
  else ok(/^[0-9a-f]{64}$/.test(O.sha256) && /summary\.json$/.test(O.source), 'R7 validation-oos.json names its source and sha256 (source not on this machine)', O.source);
  const st = readFileSync(join(ROOT, 'artefact', 'NIGRAAN_START.html'), 'utf8'), src = readFileSync(join(ROOT, 'build', 'start', 'start.src.html'), 'utf8');
  ok(!O.lines.some((l) => src.includes(l.slice(0, 40))) && st.includes('id="agn-oos"'), 'R8 no out-of-sample number is typed into the page source (inlined at build from the JSON)', '');
  ok(!E.page.length && !E.console.length, 'R9 0 errors', JSON.stringify(E)); await ctx.close(); }
{ const GS = await j('/api/report/gate-status'), full = JSON.parse(readFileSync(join(ROOT, 'data', 'model-gate.resolved.json'), 'utf8'));
  const hl = full.entries.find((e) => e.id === 'hyperlocal-temperature'); const t = JSON.stringify((hl.known_limitations || []).concat(hl.client_limitations || []));
  ok(t.includes('(2.0 °C measured out of sample)') && !/2\.0-2\.4|2\.0–2\.4/.test(t) && !/2\.0-2\.4/.test(readFileSync(join(ROOT, 'data', 'model-gate.json'), 'utf8')), 'R10 the gate\'s mountain line reads "2.0 °C measured out of sample" (was "about 2.0-2.4")', '');
  const sk = await j('/api/skill'); ok(/^What each NIGRAAN value measures and how it is made\. Temperature accuracy is checked internally against reference records and live against AGN/.test(sk.statement || ''), 'R11 customer methods sheet: the accuracy sentence is scoped to temperature', (sk.statement || '').slice(0, 160));
  const sm = await fetch(BASE + '/api/smog/unit?unit=' + encodeURIComponent('Punjab|Lahore|Lahore City'), { headers: { 'x-agn-view': 'customer' } }); const smt = await sm.text();
  const { createSmog } = await import(join(ROOT, 'server', 'api', 'smog.mjs')); const I = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'pm25n-lahore-2025-11.json'), 'utf8'));
  const SM = createSmog({ provider: { configured: () => false }, units: { tehsil: [] } }, join(ROOT, 'data')); const raw = SM._dailies({ lat: 31.56, lon: 74.34, elevM: 215 }, I.aq, I.met);
  ok(!/heldOutMaeUgm3|ground-checked/.test(smt) && /heldOutMaeUgm3/.test(JSON.stringify(raw)) && typeof SM.unit === 'function' && SM.unit('none') == null, 'R12 /api/smog answers carry no held-out MAE and no "ground-checked" (answer ' + sm.status + '); the internal dailies keep them (cleaned on the way out)', smt.slice(0, 120)); }

await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
