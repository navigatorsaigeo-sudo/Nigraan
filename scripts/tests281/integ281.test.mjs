import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.281 · INTEG281 · the start page brand bar, flag geometry, national pulse chips from the served alert rows, the site report panel
// (six sections that load independently, skeletons, retry lines, chart from hours lo90/hi90, hazard tiles that switch the layer, facts,
// past 30 days, what to do, report bar wired to the console's site report and its short edition, share link), the station display rule
// (one rule for /api/fleet/nearest and /api/place/facts: nearest reporting station passing the fleet screens; held out only from the
// forecast correction = shown, raw reading), /api/flood/depth unknown when a listed tile is missing on disk, 10 places card = API answers,
// 0 page / console / CSP errors, 0 requests to another origin. Pulse rows and fresh levels are FIXTUREs where marked (the test server's
// engine run is days old). usage: node scripts/tests281/integ281.test.mjs <base url> [outdir for screenshots]
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* v91.17.283.12: the start page reads the point state (/api/pointstate); psf puts its area on the point as the drawer reads it; "now" is printed by the one rule (0.1 C, a trailing .0 dropped) */
const psf = (x) => (x && x.ok ? { ...x, point: { ...x.point, tehsil: x.area.tehsil, district: x.area.district, province: x.area.province } } : x);
const fmtNow = (t) => String(Math.round(t * 10) / 10);

const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:9112', OUT = process.argv[3] || null;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d = '') => { d = String(d).replace(/\n/g, ' | '); if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 900) : '')); } };
const BENIGN = /Failed to load resource/;
const j = async (p) => { for (let k = 0; ; k++) { try { return await (await fetch(BASE + p, { headers: { 'x-agn-view': 'customer' } })).json(); } catch (e) { if (k >= 3) throw e; await new Promise((r) => setTimeout(r, 1500)); } } };
const todayIso = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const plus = (n) => new Date(Date.parse(todayIso() + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(/^-0\.0$/, '0.0'), r0 = (x) => String(Math.round(x));
const SHORT = { heat: 'Heat stress', cold: 'Cold stress and frost', rain_hz: 'Heavy rain', flood: 'Flood', wind: 'Wind and gusts', landslide: 'Landslide', glof: 'GLOF', drought: 'Drought' };
const ORDER = Object.keys(SHORT);

async function open(w, h, setup) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); const E = { page: [], console: [], ext: [] };
  page.on('pageerror', (e) => E.page.push(String(e.message || e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.test(m.text())) E.console.push(m.text().slice(0, 200)); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) E.ext.push(u.slice(0, 120)); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); }); });
  if (setup) await setup(page);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.AGNSTART && window.map && window.L, null, { timeout: 60000 }); await page.waitForTimeout(800);
  return { ctx, page, E };
}
const search = async (page, q) => { const s0 = await page.evaluate(() => window.AGNSTART.seq); await page.fill('#q', q); await page.click('#go');
  await page.waitForFunction((s0) => window.AGNSTART.seq > s0 || !document.querySelector('#sr').hidden && !/Searching/.test(document.querySelector('#sr').textContent) || !document.querySelector('#msgBar').hidden, s0, { timeout: 60000 }).catch(() => {});
  const list = await page.evaluate(() => document.querySelector('#sr').hidden ? 0 : document.querySelectorAll('#sr button[data-i]').length); if (list) await page.click('#sr button[data-i="0"]'); };
const selectAt = (page, lat, lon, name) => page.evaluate(([a, b, n]) => window.AGNSTART.select({ lat: a, lon: b, name: n, src: 'test' }), [lat, lon, name]);
const waitAll = (page) => page.waitForFunction(() => { const S = window.AGNSTART, d = S.data; return document.querySelector('#card[data-ready]') && d && d.st && d.st.facts !== 'load' && d.st.past !== 'load' && !document.querySelector('#card .sk'); }, null, { timeout: 120000 }).then(() => true, () => false);

/* ---------- B · brand bar, flag, clock, footer line ---------- */
{ const { ctx, page, E } = await open(1366, 768); await page.waitForFunction(() => window.AGNSTART.base, null, { timeout: 30000 }).catch(() => {});
  const b = await page.evaluate(() => { const img = document.getElementById('agnLogo'), bar = document.getElementById('bar'), r = bar.getBoundingClientRect(), ir = img.getBoundingClientRect();
    const st = getComputedStyle(document.querySelector('.bname strong')); const imgs = [...document.querySelectorAll('img:not(.leaflet-tile)')].map((i) => i.getAttribute('src').slice(0, 22));
    return { src: img.getAttribute('src').slice(0, 22), nat: [img.naturalWidth, img.naturalHeight], disp: [Math.round(ir.width), Math.round(ir.height)], bar: [r.left, r.top, Math.round(r.width), Math.round(r.height)], bg: getComputedStyle(bar).backgroundColor,
      name: document.querySelector('.bname strong').textContent, fw: st.fontWeight, ff: st.fontFamily, sub: document.querySelector('.bname span').textContent, subCol: getComputedStyle(document.querySelector('.bname span')).color,
      right: [...document.querySelectorAll('#topRight > *')].map((e) => e.id || e.className), pk: document.querySelector('.pkid').innerText.trim(), clock: document.getElementById('clock').textContent,
      saved: document.getElementById('btnSaved').textContent, an: document.getElementById('btnAnalyst').textContent, anBg: getComputedStyle(document.getElementById('btnAnalyst')).backgroundColor,
      pill: /AI GEO NIGRAAN/.test(document.body.innerText), imgs, attr: document.querySelector('.leaflet-control-attribution').textContent }; });
  ok(b.src === 'data:image/png;base64,' && b.nat[0] === 239 && b.nat[1] === 112 && b.disp[0] >= 120 && b.imgs.every((s) => s.startsWith('data:image/png')), 'B1 official AGN logo inline as a data URI (no image file), shown at >= 120 px wide (identity minimum)', JSON.stringify([b.nat, b.disp, b.imgs.length]));
  ok(b.bar[0] === 0 && b.bar[1] === 0 && b.bar[2] === 1366 && b.bar[3] <= 64 && b.bg === 'rgb(255, 255, 255)', 'B2 brand bar full width, slim (<= 64 px), white', JSON.stringify(b.bar) + ' ' + b.bg);
  ok(b.name === 'NIGRAAN' && +b.fw >= 700 && /^Manrope/.test(b.ff) && b.sub === 'National Integrated Geo-Risk, Alert & Atmospheric Network' && /rgb\((9\d|1[01]\d), (1[01]\d|9\d), (1[01]\d|9\d)\)/.test(b.subCol), 'B3 "NIGRAAN" bold Manrope + the full name small grey', JSON.stringify([b.name, b.fw, b.ff.slice(0, 20), b.sub, b.subCol]));
  ok(!b.pill, 'B4 the old "AI GEO NIGRAAN" pill is gone');
  const now = new Date(Date.now() + 5 * 3600e3), want = DN[now.getUTCDay()] + ' ' + now.getUTCDate() + ' ' + MN[now.getUTCMonth()] + ' · ';
  ok(b.pk === 'Pakistan' && b.clock.startsWith(want) && /· \d\d:\d\d PKT$/.test(b.clock) && Math.abs(Date.parse(now.toISOString().slice(0, 11) + b.clock.slice(-9, -4) + ':00Z') - Date.parse(now.toISOString().slice(0, 16) + ':00Z')) <= 120e3, 'B5 right side: flag, "Pakistan", live clock "Mon 19 Oct · 13:15 PKT" form in PKT', b.pk + ' | ' + b.clock);
  ok(b.saved === 'My sites' && b.an === 'Analyst view' && b.anBg === 'rgb(91, 154, 160)', 'B6 My sites and Analyst view (sea green #5B9AA0 action)', b.anBg);
  /* the flag to the official construction (H = 20, L = 30): checked on the drawn SVG geometry */
  const f = await page.evaluate(() => { const s = document.getElementById('pkFlag'), vb = s.getAttribute('viewBox'), R = [...s.querySelectorAll('rect')].map((r) => ({ x: +(r.getAttribute('x') || 0), w: +r.getAttribute('width'), h: +r.getAttribute('height'), fill: r.getAttribute('fill') }));
    const path = s.querySelector('path'), poly = s.querySelector('polygon'); const P = (x, y) => { const p = s.createSVGPoint(); p.x = x; p.y = y; return p; };
    const d = path.getAttribute('d'), arcs = [...d.matchAll(/A([\d.]+) ([\d.]+)/g)].map((m) => +m[1]);
    const pts = poly.getAttribute('points').trim().split(/\s+/).map((q) => q.split(',').map(Number));
    const H = 20, TR = [30, 0], BL = [7.5, 20], dl = Math.hypot(BL[0] - TR[0], BL[1] - TR[1]), u = [(BL[0] - TR[0]) / dl, (BL[1] - TR[1]) / dl], A = [18.75, 10], at = (k) => [TR[0] + u[0] * k, TR[1] + u[1] * k];
    const B = at(13), dA = Math.hypot(A[0] - TR[0], A[1] - TR[1]);
    const away = [A[0] + u[0] * 5.7, A[1] + u[1] * 5.7], inB = B, nearTR = at(dA - 5.8);
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const outer = pts.filter((_, i) => i % 2 === 0), rad = outer.map((p) => Math.hypot(p[0] - cx, p[1] - cy)), tip = outer.reduce((a, p) => (Math.hypot(p[0] - TR[0], p[1] - TR[1]) < Math.hypot(a[0] - TR[0], a[1] - TR[1]) ? p : a));
    const tipOnDiag = Math.abs((tip[0] - TR[0]) * u[1] - (tip[1] - TR[1]) * u[0]), tipFromA = Math.hypot(tip[0] - A[0], tip[1] - A[1]), cFromTR = Math.hypot(cx - TR[0], cy - TR[1]);
    return { vb, R, arcs, fillAway: path.isPointInFill(P(away[0], away[1])), fillB: path.isPointInFill(P(inB[0], inB[1])), fillNearTR: path.isPointInFill(P(nearTR[0], nearTR[1])), fillA: path.isPointInFill(P(A[0], A[1])),
      starIn: poly.isPointInFill(P(cx, cy)), n: pts.length, rad: [Math.min(...rad), Math.max(...rad)], tipOnDiag, tipFromA, cFromTR, dA, fills: [path.getAttribute('fill'), poly.getAttribute('fill')] }; });
  ok(f.vb === '0 0 30 20' && f.R[0].w === 30 && f.R[0].h === 20 && f.R[0].fill === '#FFFFFF' && f.R[1].x === 7.5 && f.R[1].w === 22.5 && f.R[1].fill === '#01411C', 'B7 flag 3:2, white hoist 1/4 of the length, dark green #01411C', JSON.stringify([f.vb, f.R.slice(0, 2)]));
  ok(f.arcs[0] === 6 && f.arcs[1] === 5.5 && f.fillAway && !f.fillB && !f.fillNearTR && f.fills[0] === '#FFFFFF', 'B8 crescent: outer arc r 3/10 H round the green centre, inner arc r 11/40 H round B (13/20 H from the top fly corner on the diagonal); opening to the top fly corner', JSON.stringify([f.arcs, f.fillAway, f.fillB, f.fillNearTR]));
  ok(f.n === 10 && f.starIn && Math.abs(f.rad[0] - 2) < 0.01 && Math.abs(f.rad[1] - 2) < 0.01 && f.tipOnDiag < 0.01 && Math.abs(f.tipFromA - 6) < 0.01 && Math.abs(f.cFromTR - (f.dA - 6 + 2)) < 0.01, 'B9 five-pointed star: circumscribed r 1/10 H, one point on the diagonal towards the top fly corner, its tip where the outer arc cuts the diagonal', JSON.stringify([f.n, f.rad, f.tipOnDiag, f.tipFromA, f.cFromTR]));
  ok(/^© 2026 AI Geo Navigators · NIGRAAN v91\.17\.28[12]/.test(b.attr) && /Copernicus DEM/.test(b.attr) && /OpenStreetMap/.test(b.attr) && !/Esri|Maxar|Earthstar/.test(b.attr) && /Boundaries: AI Geo Navigators/.test(b.attr) && !/\bPMD\b|\bFFD\b|Meteorological Department|Flood Forecasting Division/i.test(b.attr), 'B10 footer line: © 2026 AI Geo Navigators · NIGRAAN v91.17.281/282 + credits of what is drawn (no Esri); no PMD / FFD', b.attr.slice(0, 200));
  const prot = await page.evaluate(() => /Protomaps/.test(document.querySelector('.leaflet-control-attribution').textContent) || !(window.AGNSTART.base && window.AGNSTART.base.kind === 'streets'));
  ok(prot, 'B11 Protomaps credited when the street tiles are drawn');
  const blue = await page.evaluate(() => { const bad = []; const isBlue = (c) => { const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(c); if (!m || m[4] === '0') return false; const r = +m[1], g = +m[2], b = +m[3]; return b > r + 40 && b > g + 25; };
    document.querySelectorAll('#bar *, #pulse *, #hero *, #hzWrap *, #zoom *').forEach((e) => { if (e.closest('svg') || e.tagName === 'IMG') return; const s = getComputedStyle(e); for (const k of ['color', 'backgroundColor', 'borderTopColor']) if (isBlue(s[k])) bad.push((e.id || e.className || e.tagName) + ' ' + k + ' ' + s[k]); }); return bad; });
  /* START282 · the owner asked for the console's colour-coded palette (Overview navy, Forecast sky, ...): blue / navy in the chrome may now
     only be those two tab colours */
  const TABC = /rgba?\((29, 53, 87|43, 140, 196)(, [\d.]+)?\)/;
  ok(!blue.filter((x) => !TABC.test(x)).length, 'B12 (START282) blue / navy in the page chrome only as the console tab colours (Overview navy, Forecast sky)', blue.filter((x) => !TABC.test(x)).slice(0, 4).join(' | '));
  const meta = await page.evaluate(() => document.querySelector('meta[name="agn-version"]').getAttribute('content'));
  ok(meta === '91.17.282.1', 'B13 page version 91.17.282.1 (FIX2821; START282 before)', meta);
  if (OUT) await page.screenshot({ path: OUT + '/first_1366.png' });
  const csp = await page.evaluate(() => window.__csp || []);
  ok(!E.page.length && !E.console.length && !csp.length && !E.ext.length, 'B14 first view: 0 page / console / CSP errors, 0 requests to another origin', JSON.stringify({ ...E, csp }));
  await ctx.close(); }

/* ---------- P · national pulse strip ---------- */
const AL = await j('/api/alerts');
{ const { ctx, page, E } = await open(1366, 768); await page.waitForFunction(() => !/Loading/.test(document.getElementById('pulse').textContent), null, { timeout: 30000 }).catch(() => {});
  const t = await page.evaluate(() => document.getElementById('pulse').innerText.replace(/\n/g, ' '));
  const det = await page.evaluate(() => ((document.getElementById('pulseNote') || {}).title || '') + ' | ' + ((document.getElementById('pulseFold') || {}).textContent || ''));
  /* v91.17.283.6 · expected text updated to the intended v91.17.283.2 S8 wording (CHANGES v283.2 "Old suites", UI S7/S8): the strip is one short
     line and the full sentence is in the note's tooltip and the Details fold. Each state is checked on both: the short line and the old full
     sentence (now the detail); never "All clear". */
  const want = !AL || AL.ready === false || !Array.isArray(AL.rows) ? [/Alert list not available|did not answer/, /not available|did not answer/] : AL.stale ? [/Alert list out of date · last run .* PKT/, /out of date \(last run .* PKT\), so no current alert is shown/] : !AL.rows.length ? [/No active alerts · run of \d\d:\d\d PKT/, /No active alerts for the hazards that can alert: /] :   /* FIX2821 A: never "all clear" */ [/·/, /.?/];
  ok(want[0].test(t) && want[1].test(det) && !/All clear/.test(t + det), 'P1 the strip reads the served list (/api/alerts): ' + (AL && AL.stale ? 'out of date here, said so (never "all clear")' : 'as served'), t + ' || ' + det);
  await ctx.close(); }
const T = await (await fetch(BASE + '/n3/tehsils.json')).json(); const TP = T.features.map((f) => f.properties);
const sindh = [...new Set(TP.filter((p) => p.province === 'Sindh').map((p) => p.district))].slice(0, 2), kz = TP.find((p) => /Khuzdar/.test(p.district)) || TP.find((p) => p.province === 'Balochistan');
const ago = new Date(Date.now() - 2 * 3600e3 + 5 * 3600e3), qt = ago.getUTCDate() + ' ' + MN[ago.getUTCMonth()] + ' ' + ago.getUTCFullYear() + ', ' + ago.toISOString().slice(11, 16) + ' PKT';
const ROWS = [
  { name: sindh[0], district: true, drivingTehsil: null, alert: 'Heat · Act', sev: 5, classRank: 4, band: 'Act', index: 80, hazard: 'heat', holders: [{ hazard: 'heat', index: 80 }], basis: 'district row from the national priority board' },
  { name: sindh[1], district: true, drivingTehsil: null, alert: 'Heat · Watch', sev: 4, classRank: 3, band: 'Watch', index: 66, hazard: 'heat', holders: [{ hazard: 'heat', index: 66 }], basis: 'district row from the national priority board' },
  { name: kz.tehsil + (kz.district !== kz.tehsil ? ', ' + kz.district : ''), agnQuake: true, uid: kz.uid, alert: 'Earthquake M5.7 · Strong', level: 'Strong', sev: 4, classRank: 3, band: 'Strong', index: null, hazard: 'seismic', basis: 'Strong shaking expected · intensity VI, ' + qt },
  { name: 'Lahore', district: true, alert: 'Heavy rain + Flood · Watch', sev: 4, classRank: 2, band: 'Watch', hazard: 'rain_hz', holders: [{ hazard: 'rain_hz' }, { hazard: 'flood' }], basis: 'x' }];
const fixAlerts = (rows) => async (page) => { await page.route('**/api/alerts', async (route) => { const r = await route.fetch(); const J = await r.json(); J.ready = true; J.stale = false; J.stampMismatch = false; /* v91.17.283.28: a current run (the start page reads the served stampMismatch flag, as the console) */ J.rows = rows; J.count = rows.length; J.ctx = { day: 0, basis: 'peak', lead: 24 }; J.days = [{ day: 0, date: todayIso(), layers: [] }]; await route.fulfill({ response: r, json: J }); }); };
{ const { ctx, page, E } = await open(1366, 768, fixAlerts(ROWS));
  await page.waitForFunction(() => document.querySelectorAll('#pulse .pchip').length > 0, null, { timeout: 30000 }).catch(() => {});
  const chips = await page.evaluate(() => [...document.querySelectorAll('#pulse .pchip')].map((c) => c.textContent));
  const lahoreProv = (TP.find((p) => p.district === 'Lahore') || {}).province;
  const want = ['Heat · Sindh · today', 'Earthquake M5.7 · ' + kz.district.replace(/ District$/, '') + ' · 2 h ago', 'Heavy rain · Lahore · today', 'Flood · Lahore · today'];
  ok(chips.length >= 2 && chips.length <= 4 && JSON.stringify(chips) === JSON.stringify(want), 'P2 FIXTURE rows: chips grouped by hazard + province (two Sindh districts -> "Sindh"), one district named, the list\'s day, the quake\'s own time ("2 h ago"); highest first', JSON.stringify(chips) + ' want ' + JSON.stringify(want));
  ok(chips.every((c) => !/rain_hz|seismic|null|undefined|NaN/.test(c)), 'P3 chip text from the rows only, no code words');
  if (OUT) await page.screenshot({ path: OUT + '/pulse_1366.png', clip: { x: 0, y: 0, width: 1366, height: 110 } });
  await page.click('#pulse .pchip >> nth=0'); await page.waitForTimeout(1600);
  const fly = await page.evaluate((ds) => { const c = map.getCenter(); let b = null; map.eachLayer(() => {}); const F = []; return { c: [c.lat, c.lng], z: map.getZoom(), g: window.AGNSTART.pulse.groups[0].feats.length }; }, sindh);
  const sb = (() => { let s = 90, n = -90, w = 180, e = -180; for (const f of T.features) if (f.properties.province === 'Sindh' && sindh.includes(f.properties.district)) { const walk = (a) => { if (typeof a[0] === 'number') { w = Math.min(w, a[0]); e = Math.max(e, a[0]); s = Math.min(s, a[1]); n = Math.max(n, a[1]); } else a.forEach(walk); }; walk(f.geometry.coordinates); } return { s, n, w, e }; })();
  ok(fly.g > 0 && fly.c[0] > sb.s - 1 && fly.c[0] < sb.n + 1 && fly.c[1] > sb.w - 3 && fly.c[1] < sb.e + 1 && fly.z >= 6.5, 'P4 a chip flies the map to its area (the districts of the group)', JSON.stringify({ fly, sb }));
  ok(!E.page.length && !E.console.length, 'P5 FIXTURE 0 page / console errors', JSON.stringify(E)); await ctx.close(); }
{ const { ctx, page } = await open(1366, 768, fixAlerts([])); await page.waitForFunction(() => !/Loading/.test(document.getElementById('pulse').textContent), null, { timeout: 30000 }).catch(() => {});
  /* v91.17.283.6 · P6 expected text: v91.17.283.2 S8 short line, the hazards that can alert named in the tooltip / Details fold */
  const t = await page.evaluate(() => ({ s: document.getElementById('pulse').innerText, d: (document.getElementById('pulseNote') || {}).title || '', f: (document.getElementById('pulseFold') || {}).textContent || '' }));
  ok(/No active alerts · run of \d\d:\d\d PKT/.test(t.s) && /^No active alerts for the hazards that can alert: \S/.test(t.d) && t.f === t.d && !/All clear/.test(t.s + t.d), 'P6 FIXTURE no alert row: the gate\'s alert-eligible hazards named, never "All clear" (FIX2821)', JSON.stringify(t).replace(/\n/g, ' ')); await ctx.close(); }

/* ---------- S · station display rule (one rule for /api/fleet/nearest and /api/place/facts) ---------- */
const FL = await j('/api/fleet/latest'), OFFS = await fetch(BASE + '/api/fleet/offsets').then((r) => r.json()).catch(() => null); const rows = (FL && FL.rows) || [];
const heldKeys = Object.entries((OFFS && OFFS.stations) || {}).filter(([, v]) => v.heldOut).map(([k]) => k);
const shownOk = (r) => r && r.usable && r.status !== 'site-problem' && r.status !== 'silent';
{ const bad = [], agree = [], held = [], probes = [];
  for (const r of rows) { if (r.lat == null) continue; probes.push(r); }
  for (const r of probes.slice(0, 120)) { const q = 'lat=' + (+r.lat).toFixed(5) + '&lon=' + (+r.lon).toFixed(5);
    /* v91.17.283.19: the place bundle carries the ONE station (its rule) and the facts carry none (/api/fleet/nearest and /api/place/facts are retired) */
    const B = await j('/api/point?' + q); const st = B && B.station && B.station.ok ? B.station : null, s = st ? { key: st.id, name: st.name, km: st.km, tempC: st.reading ? st.reading.tempC : null } : null;
    const f = (B && B.parts && B.parts.facts && B.parts.facts.v) || {}, fs = f.fields && f.fields.station;
    if (s) { const L = rows.find((x) => x.key === s.key); if (!shownOk(L)) bad.push(r.key + '->' + s.key + ' ' + (L && L.status)); if (L && L.tempC !== s.tempC) bad.push(s.key + ' reading ' + s.tempC + ' vs raw ' + L.tempC); }
    if (!shownOk(r) && s && s.key === r.key) bad.push('not-shown station ' + r.key + ' (' + r.status + ') shown at its own place');
    agree.push(!fs);
    if (heldKeys.includes(r.key)) held.push({ key: r.key, ok: shownOk(r), shown: !!(s && s.key === r.key), status: r.status }); }
  ok(!bad.length, 'S1 the bundle station (/api/point) at every station point: only stations that report and pass the screens ("not used" / silent / unusable never), with the raw reading (no correction)', rows.length ? probes.length + ' points; ' + bad.slice(0, 4).join(' | ') : 'no fleet on this server');
  ok(agree.every(Boolean), 'S2 the place facts name no second station: the bundle\'s station is the only one at every point', agree.filter((x) => !x).length + ' disagree of ' + agree.length);
  ok(held.every((h) => !h.ok || h.shown) && (!heldKeys.length || held.length > 0), 'S3 stations held out only from the forecast correction (siting offsets) are shown at their own place when their readings pass the screens', JSON.stringify(held).slice(0, 400) || 'no held-out station on this server'); }

/* ---------- D · /api/flood/depth: a tile the index lists but the disk lacks is unknown, never dry ---------- */
{ const ix = JSON.parse(readFileSync(join(ROOT, 'data', 'flood-depth', 'index.json'), 'utf8')); const names = Object.keys(ix.files || {}); const dir = join(ROOT, 'data', 'flood-depth');
  const missing = names.filter((n) => !existsSync(join(dir, n))), present = names.filter((n) => existsSync(join(dir, n)));
  const ctr = (n) => { const m = /jrc_N(\d+)_E(\d+)\.bin/.exec(n); return [+m[1] - 0.5, +m[2] + 0.5]; };
  if (missing.length) { const [la, lo] = ctr(missing[0]); const r = await j('/api/flood/depth?lat=' + la + '&lon=' + lo);
    ok(r.ready === false && r.unknown === true && /not available/.test(r.why || '') && !/dry/.test(JSON.stringify(r).replace(/not dry/g, '')) && (r.missingTiles || []).includes(missing[0]), 'D1 listed tile missing on disk: "unknown / not available", never dry', JSON.stringify(r).slice(0, 300)); }
  else ok(true, 'D1 every listed flood tile is on disk here (the missing-tile case does not arise)');
  const all = new Set(names); let un = null; for (let la = 24; la <= 36 && !un; la++) for (let lo = 61; lo <= 77 && !un; lo++) { const nm = 'jrc_N' + la + '_E' + lo + '.bin'; if (!all.has(nm)) un = [la - 0.5, lo + 0.5]; }
  if (un) { const r = await j('/api/flood/depth?lat=' + un[0] + '&lon=' + un[1]); ok(r.ready === true && r.firstWetReturnPeriod == null, 'D2 a degree the index does not list (no wet cell was packed) still reads dry', JSON.stringify(r).slice(0, 160)); }
  if (present.length) { const [la, lo] = ctr(present[0]); const r = await j('/api/flood/depth?lat=' + la + '&lon=' + lo); ok(r.ready === true, 'D3 a listed tile that is on disk answers as before', JSON.stringify(r).slice(0, 160)); }
  else ok(true, 'D3 no flood tile installed on this server (the laptop has them)'); }

/* ---------- G · the site report panel ---------- */
const FIX = { heat: [1, 2, 1, 0], cold: [0, 0, 0, 0], rain_hz: [0, 0, 0, null], flood: [0, 0, 0, 0], wind: [-1, -1, -1, -1], landslide: [1, 1, 1, 1], glof: [-2, -2, -2, -2], drought: [0, 0, 0, 0] };
/* v91.17.283.19: the tehsil levels are the part levels of the place bundle (GET /api/point; was /api/levels/unit) */
const fixLevels = async (page) => { await page.route('**/api/point?**', async (route) => { let r; try { r = await route.fetch(); } catch (_) { return route.abort().catch(() => {}); } const B = await r.json(); const J = B && B.parts && B.parts.levels && B.parts.levels.v ? B.parts.levels.v : {};
  if (Array.isArray(J.days) || J.ready === false || J.ready == null) { if (!Array.isArray(J.days)) J.days = [{ layers: {} }]; J.ready = true; J.stale = false; J.at = new Date(Date.now() - 20 * 60e3).toISOString();
    J.days = [0, 1, 2, 3].map((i) => { const d = J.days[i] || J.days[0]; const L = {}; for (const [k, v] of Object.entries(FIX)) { if (v[i] == null) continue; L[k] = { name: (d.layers[k] || {}).name || k, level: v[i] }; } return { day: i, date: plus(i), layers: L }; }); }
  if (B && B.parts) B.parts.levels = { ...(B.parts.levels || {}), ok: true, unavailable: false, v: J }; await route.fulfill({ response: r, json: B }); }); };
for (const [w, h] of [[1366, 768], [1920, 1080]]) { const V = w + ' ';
  let release = null; const held = new Promise((r) => { release = r; });
  const { ctx, page, E } = await open(w, h, async (p) => { await fixLevels(p); });   /* v283.19: one bundle fills every section (no part arrives on its own) */
  await search(page, 'Gilgit');
  await page.waitForFunction(() => document.querySelector('#card[data-ready]'), null, { timeout: 90000 }).catch(() => {});
  const mid = await page.evaluate(() => ({ placeSk: !!document.querySelector('#rb_place .sk'), nowT: !!document.querySelector('#rb_now #nowT'), hz: !!document.querySelector('#rb_hz #hzSec') }));
  release();
  ok(mid.nowT && mid.hz, V + 'G1 the one place bundle fills Now and Hazards when the card is ready (no blank panel)', JSON.stringify(mid));
  const all = await waitAll(page);
  const S = await page.evaluate(() => { const d = window.AGNSTART.data; return { place: d.place, secs: [...document.querySelectorAll('#card .rs')].map((s) => s.closest('.pane').id.replace('pane_', '') + ':' + s.id), tabs: [...document.querySelectorAll('#dTabs .dtab')].map((t) => t.textContent),
    chart: (() => { const c = document.getElementById('n3Chart'); return c ? { hours: +c.getAttribute('data-hours'), band: c.querySelectorAll('path').length } : null; })(),
    tiles: [...document.querySelectorAll('#hzTiles .hzt')].map((t) => ({ k: t.getAttribute('data-hzk'), lvl: t.querySelector('.lvl').textContent, type: t.querySelector('.ht').textContent })),
    facts: [...document.querySelectorAll('#factsBox .fr')].map((r) => r.getAttribute('data-f')), factsTxt: (document.getElementById('rb_place') || {}).innerText || '', p30: (document.getElementById('rb_p30') || {}).innerText || '', todo: [...document.querySelectorAll('#todoSec li')].length,
    btns: [...document.querySelectorAll('#repBar .btns>*')].map((b) => b.textContent), anRep: [...document.querySelectorAll('#card a')].filter((a) => /agnreport/.test(a.getAttribute('href') || '')).length, repDoc: !!document.getElementById('repDoc') }; });
  ok(all && JSON.stringify(S.secs) === JSON.stringify(['now:rs_now', 'fc:rs_n3', 'hz:rs_hz', 'hz:rs_todo', 'place:rs_place', 'p30:rs_p30', 'rep:rs_rep']) && S.tabs.join('|') === 'Now|Forecast|Hazards|This place|Past 30 days|Report', V + 'G2 (START282) the drawer tabs carry the sections: Now, Forecast (next 3 days), Hazards (+ what to do), This place, Past 30 days, Report', JSON.stringify(S.secs));
  const q = 'lat=' + S.place.lat.toFixed(5) + '&lon=' + S.place.lon.toFixed(5); const pf = psf(await j('/api/point?' + q));
  const hrs = (pf.hours || []).filter((x) => String(x.time) >= String(pf.now.time) && x.tempC != null).slice(0, 73);
  ok(S.chart && S.chart.hours === hrs.length && !(S.chart.band >= 2), V + 'G3 Next 3 days chart: the hours from now to +72 h of the point state (v91.17.283.12: no uncalibrated lo90 / hi90 band)', JSON.stringify(S.chart) + ' want ' + hrs.length);
  const types = {}; for (const k of ORDER) { const g = (await j('/api/levels?layer=' + k + '&day=0')).gateTag; types[k] = g && g.productType; }
  const wantLvl = { heat: 'Moderate', cold: 'Normal', rain_hz: 'Normal', flood: 'Normal', wind: 'Not assessed', landslide: 'Low', glof: 'Does not occur', drought: 'Normal' };
  ok(S.tiles.length === 8 && S.tiles.every((t) => t.lvl === wantLvl[t.k] && t.type === (types[t.k] || 'Product type not recorded')), V + 'G4 FIXTURE hazard tiles: one per hazard, the highest level today to +3 and the product type label from the model gate', JSON.stringify(S.tiles.map((t) => [t.k, t.lvl, t.type])));
  await page.click('.tab[data-t="hz"]'); await page.waitForTimeout(500);   /* START282 · the tiles are in the Hazards tab */
  await page.click('#hzTiles .hzt[data-hzk="heat"]'); await page.waitForTimeout(600);
  const hz = await page.evaluate(() => ({ s: window.AGNSTART.hz, btn: document.getElementById('hzBtnTxt').textContent, pressed: document.querySelector('.hzt[data-hzk="heat"]').getAttribute('aria-pressed') }));
  ok(hz.s === 'heat' && hz.btn === 'Hazard layers · Heat stress' && hz.pressed === 'true', V + 'G5 tapping a hazard tile turns that hazard layer on', JSON.stringify(hz));
  await page.click('#hzTiles .hzt[data-hzk="heat"]'); await page.waitForTimeout(300);
  const F = (pf && pf.parts && pf.parts.facts && pf.parts.facts.v) || {};   /* v283.19: the bundle part facts */ const fk = Object.keys(F.fields || {}).filter((k) => !['terrainPosition'].includes(k));
  ok(S.facts.length > 0 && fk.every((k) => S.facts.includes(k)) && (F.omitted || []).every((o) => !S.facts.includes(o.field)) && !/N\/A|null|undefined|NaN/.test(S.factsTxt), V + 'G6 This place = /api/place/facts: every field shown, omitted fields not shown at all (no "N/A")', JSON.stringify({ shown: S.facts, served: fk, omitted: (F.omitted || []).map((o) => o.field) }));
  const P = await j('/api/report/past30?' + q); const sm = P.summary || {};
  ok(P.ok ? S.p30.includes('Rain ' + r0(sm.rainMm) + ' mm') && (sm.rainNormalMm != null ? S.p30.includes('normal of ' + r0(sm.rainNormalMm) + ' mm') : !/normal of/.test(S.p30)) && (sm.tmeanAnomC != null ? S.p30.includes(r1(sm.tmeanAnomC) + ' °C against the normal') : true) : /not available/.test(S.p30), V + 'G7 Past 30 days: observed against the normal from /api/report/past30 (the reports\' endpoint)', S.p30.slice(0, 200));
  ok(S.todo >= 0 && JSON.stringify(S.btns) === JSON.stringify(['Build the site report', 'Share link', 'Save site']), V + 'G8 (START282) Now tab: Build the site report, Share link, Save site', JSON.stringify(S.btns));
  ok(S.anRep === 0 && S.repDoc, V + 'G9 (START282) the site report is built in the drawer (Report tab), no link to the console report', JSON.stringify({ anRep: S.anRep, repDoc: S.repDoc }));
  if (OUT) { await page.screenshot({ path: OUT + '/gilgit_' + w + '.png' }); for (const k of ['n3', 'hz', 'place', 'p30', 'todo']) { await page.evaluate((k) => document.getElementById('rs_' + k).scrollIntoView({ block: 'start' }), k); await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/gilgit_' + k + '_' + w + '.png' }); } }
  const csp = await page.evaluate(() => window.__csp || []);
  ok(!E.page.length && !E.console.length && !csp.length && !E.ext.length, V + 'G10 0 page / console / CSP errors, 0 requests to another origin', JSON.stringify({ ...E, csp }));
  await ctx.close(); }
/* retry line + share link */
{ let failP30 = true; const { ctx, page, E } = await open(1366, 768, async (p) => { await p.route('**/api/point?**', async (route) => { let r; try { r = await route.fetch(); } catch (_) { return route.abort().catch(() => {}); } const B = await r.json(); if (failP30 && B && B.parts) B.parts.past30 = { ok: false, unavailable: true, at: new Date().toISOString(), why: 'the server answered 503' }; await route.fulfill({ response: r, json: B }); }); });   /* v283.19: the past 30 days is the bundle part past30; Retry asks the bundle again */
  await search(page, 'G-8, Islamabad'); await page.waitForFunction(() => document.querySelector('#rb_p30 [data-retry]'), null, { timeout: 90000 }).catch(() => {});
  const r = await page.evaluate(() => (document.getElementById('rb_p30') || {}).innerText || ''); ok(/did not load\. Retry/.test(r), 'G11 a section whose answer fails shows a short retry line', r);
  failP30 = false; await page.click('.tab[data-t="p30"]'); await page.waitForTimeout(500); await page.click('#rb_p30 [data-retry]');   /* START282 · Past 30 days is a tab */ await page.waitForFunction(() => document.querySelector('#rb_p30 #p30Line, #rb_p30 #p30None'), null, { timeout: 60000 }).catch(() => {});
  ok(await page.evaluate(() => !!document.querySelector('#rb_p30 #p30Line, #rb_p30 #p30None')), 'G12 Retry loads the section');
  await page.click('.tab[data-t="now"]'); await page.waitForTimeout(500);
  await page.click('#bShare'); await page.waitForTimeout(800); const st = await page.evaluate(() => document.getElementById('saveStatus').textContent);
  const u = (/(https?:\/\/\S+)/.exec(st) || [])[1]; const pl = await page.evaluate(() => window.AGNSTART.place);
  ok(u && u.startsWith(BASE + '/#agnplace=' + pl.lat.toFixed(5) + ',' + pl.lon.toFixed(5)), 'G13 Share link gives this page\'s link at the place', st);
  const p2 = await ctx.newPage(); await p2.goto(u, { waitUntil: 'domcontentloaded' }); await p2.waitForFunction(() => window.AGNSTART && window.AGNSTART.place && document.querySelector('#card[data-ready]'), null, { timeout: 90000 }).catch(() => {});
  const s2 = await p2.evaluate(() => window.AGNSTART.place); ok(s2 && Math.abs(s2.lat - pl.lat) < 1e-5 && Math.abs(s2.lon - pl.lon) < 1e-5 && s2.name === pl.name, 'G14 the shared link opens the page at that place', JSON.stringify(s2));
  ok(!E.page.length, 'G15 0 page errors', JSON.stringify(E)); await ctx.close(); }

/* ---------- M · 10 places: the panel equals the server's answers (temperature, levels, station, facts) ---------- */
const PLACES = [['G-8 Islamabad', 33.69421, 73.05242], ['Gilgit', 35.92, 74.31], ['Jutial', 35.9, 74.36], ['Lahore', 31.52, 74.36], ['Karachi Clifton', 24.82, 67.03], ['Quetta', 30.18, 66.99], ['Peshawar', 34.01, 71.58], ['Multan', 30.2, 71.47], ['Skardu', 35.3, 75.63], ['Mithi', 24.74, 69.8]];
{ const { ctx, page, E } = await open(1366, 768); const res = [];
  for (const [nm, la, lo] of PLACES) { await selectAt(page, la, lo, nm); await waitAll(page); await page.waitForTimeout(300);
    const c = await page.evaluate(() => ({ t: (document.getElementById('nowT') || {}).textContent, line: ((document.getElementById('nowLine') || {}).textContent || '') + ' ' + ((document.getElementById('stLine') || {}).textContent || ''),   /* v283.19: the station on its own line */ facts: [...document.querySelectorAll('#factsBox .fr')].map((r) => r.getAttribute('data-f')), st: (document.querySelector('#factsBox .fr[data-f="station"] .fv') || {}).firstChild?.textContent || null,
      tiles: [...document.querySelectorAll('#hzTiles .hzt')].map((t) => t.querySelector('.lvl').textContent), hzNote: (document.getElementById('hzNone') || {}).textContent || '' }));
    const q = 'lat=' + la.toFixed(5) + '&lon=' + lo.toFixed(5); const pf = psf(await j('/api/point?' + q)), fl = { station: pf && pf.station && pf.station.ok ? { name: pf.station.name, km: pf.station.km, tempC: pf.station.reading && pf.station.reading.tempC } : null }, fa = (pf && pf.parts && pf.parts.facts && pf.parts.facts.v) || {};   /* v283.19: one bundle */
    const uid = pf.point.province + '|' + pf.point.district + '|' + pf.point.tehsil, lu = await j('/api/levels/unit?unit=' + encodeURIComponent(uid));
    const s = fl.station, fs = fa.fields && fa.fields.station;
    const tOk = c.t === fmtNow(pf.now.tempC) + '°C';
    const sOk = s && s.tempC != null ? c.line.includes(s.name + ', ' + r1(s.km) + ' km: ' + r1(s.tempC) + ' °C') && c.st === s.name + ', ' + r1(s.km) + ' km: ' + r1(s.tempC) + ' °C' + (fs && fs.observedAt ? ' (' + fs.observedAt + ')' : '') : /no AGN station reading within (15|25) km/.test(c.line) && !c.st;
    const lOk = lu.stale ? c.tiles.every((x) => x === 'No current level') && /out of date/.test(c.hzNote) : c.tiles.length === 8;
    const fOk = Object.keys(fa.fields || {}).filter((k) => k !== 'terrainPosition').every((k) => c.facts.includes(k));
    res.push({ nm, tOk, sOk, lOk, fOk, st: s ? s.name : null }); }
  ok(res.every((r) => r.tOk), 'M1 10 places: temperature now = the point state', JSON.stringify(res.filter((r) => !r.tOk)));
  ok(res.every((r) => r.sOk), 'M2 10 places: the nearest AGN station (name, km, °C) in Now and in This place = /api/fleet/nearest = /api/place/facts', JSON.stringify(res.map((r) => [r.nm, r.st, r.sOk])));
  ok(res.every((r) => r.lOk), 'M3 10 places: hazard levels = /api/levels/unit (stale run: no current level)', JSON.stringify(res.filter((r) => !r.lOk)));
  ok(res.every((r) => r.fOk), 'M4 10 places: This place shows every field of /api/place/facts', JSON.stringify(res.filter((r) => !r.fOk)));
  ok(!E.page.length && !E.console.length && !E.ext.length, 'M5 0 page / console errors, 0 outside requests over 10 places', JSON.stringify(E)); await ctx.close(); }

/* ---------- L · Lahore with the heat layer (screenshot) ---------- */
if (OUT) { const { ctx, page } = await open(1920, 1080, async (p) => { await fixLevels(p); await p.route('**/api/levels?layer=heat&day=0', async (route) => { const r = await route.fetch(); const J = await r.json();
    if (J.levels) { J.stale = false; J.at = new Date(Date.now() - 20 * 60e3).toISOString(); J.date = todayIso(); let i = 0; for (const k of Object.keys(J.levels)) J.levels[k] = (i++) % 4; } await route.fulfill({ response: r, json: J }); }); });
  await search(page, '31.52, 74.36'); await waitAll(page); await page.click('.tab[data-t="hz"]'); await page.waitForTimeout(500);
  await page.click('#hzTiles .hzt[data-hzk="heat"]'); await page.waitForTimeout(3500); await page.screenshot({ path: OUT + '/lahore_heat_FIXTURE_1920.png' }); await ctx.close(); }

/* ---------- R · START282 · the site report is built in place (Report tab): preview, no navigation ---------- */
{ const { ctx, page } = await open(1366, 768); await search(page, 'G-8, Islamabad'); await page.waitForFunction(() => document.querySelector('#card[data-ready]'), null, { timeout: 90000 }).catch(() => {});
  const u0 = page.url(); await page.click('#bOpenRep'); await page.waitForTimeout(1500);
  const t = await page.evaluate(() => ({ tab: window.AGNSTART.tab, doc: !!document.getElementById('repDoc'), title: (document.getElementById('repName') || {}).textContent, btns: [...document.querySelectorAll('#repWrap button')].map((b) => b.textContent.trim()) }));
  ok(page.url() === u0 && t.tab === 'rep' && t.doc && /G-8/.test(t.title || '') && t.btns.includes('Download PDF') && t.btns.includes('Short') && t.btns.includes('Full'), 'R1 (START282) "Build the site report" opens the Report tab: the preview here (Download PDF, Short / Full), no navigation', JSON.stringify(t));
  await ctx.close(); }
await browser.close();
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
