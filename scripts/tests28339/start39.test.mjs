/* v91.17.283.39 (NIGRAAN 1.0.3) · THE START PAGE, Mora Lab model (owner-approved 31 Oct)
   O1  open with the location granted: dark Pakistan view, no zoom change, no white map, no drawer, for 20 s; the crosshair at the visitor's
       point; the bottom panel open for that place ("Hazards today at <place>")
   O2  open with the location denied: dark, no crosshair, the panel collapsed, the hint "Click the map or use Current location"
   C1  a click moves the crosshair (one crosshair) and the panel follows; a drag of the crosshair and its drop read the new point
   C2  hover does nothing (no request, no panel change)
   P1  the panel: one bar per hazard of the server's part hazardCount for that day, sorted highest level first; the hazards without a level
       are grey dashed lines with the server's state word, never Normal; the summary (highest, above Normal, worst day) from those values
   P2  the day slider changes the map's day and the chart together
   P3  the collapse arrow hides the chart and keeps the strip and the crosshair; Escape folds it too
   L1  "Current location" next to the search box moves the crosshair to the visitor's point on the dark view and opens the panel
   Z1  zooming in still fades to the white street map and hides the panel and the crosshair; zooming out brings them back
   S1  a search still opens the white map and the full place drawer; "Full details" does the same for the crosshair's point
   M1  phone 390 x 844: a bottom sheet with the map visible above it, the crosshair visible, no horizontal scroll
   usage: node scripts/tests28339/start39.test.mjs [base] */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { T, browser, BASE, ROOT } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const SHOTS = process.env.NIGRAAN_SHOTS || join(ROOT, 'shots'); try { mkdirSync(SHOTS, { recursive: true }); } catch (_) {}
const C = { 'x-agn-view': 'customer' };
const getJ = async (p) => { const r = await fetch(BASE + p, { headers: C }); return r.json(); };
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const LAT = 31.5204, LON = 74.3587;
const br = await browser();
const DENY = () => { navigator.geolocation.getCurrentPosition = function (s, e) { setTimeout(function () { e({ code: 1, message: 'User denied Geolocation' }); }, 300); }; };
async function open(o = {}) { const ctx = await br.newContext({ viewport: o.vp || { width: 1440, height: 731 }, ...(o.mobile ? { isMobile: true, hasTouch: true } : {}), ...(o.grant ? { geolocation: { latitude: LAT, longitude: LON, accuracy: 25 }, permissions: ['geolocation'] } : {}) });
  if (o.init) await ctx.addInitScript(o.init); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  const req = []; pg.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE)) req.push(u.replace(BASE, '')); });
  await pg.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); return { ctx, pg, errs, req }; }
const S = (pg) => pg.evaluate(() => { const A = window.AGNSTART, N = A.nat, b = document.body.classList, card = document.getElementById('card');
  const pin = N.pin && window.map.hasLayer(N.pin) ? N.pin.getLatLng() : null;
  return { view: A.view, dark: b.contains('agn-dark'), open: b.contains('nv-open'), has: b.contains('nv-has'), card: !card.hidden && card.classList.contains('open'), zoom: window.map.getZoom(),
    pin: pin ? { lat: pin.lat, lon: pin.lng } : null, pins: document.querySelectorAll('.nv-pin').length, sel: N.sel, day: N.day, drawn: N.drawn && N.drawn.day,
    hint: document.getElementById('nvHint2').hidden ? null : document.getElementById('nvHint2').textContent, title: document.getElementById('nvTt').hidden ? null : document.getElementById('nvTt').textContent.replace(/\s+/g, ' ').trim(),
    panelVis: getComputedStyle(document.getElementById('nvPanel')).visibility, panelTop: Math.round(document.getElementById('nvPanel').getBoundingClientRect().top), ih: innerHeight,
    count: document.getElementById('nvPanel').getAttribute('data-count'), bars: [...document.querySelectorAll('#nvBars .b')].map((x) => ({ k: x.getAttribute('data-hz'), st: x.getAttribute('data-state'), lv: x.getAttribute('data-level'), w: x.querySelector('.bw').textContent.trim(), grey: !!x.querySelector('.gl') })),
    top: document.getElementById('nvTop').textContent, above: document.getElementById('nvAbove').textContent, worst: document.getElementById('nvWorst').textContent, msg: document.getElementById('msgBar').hidden ? null : document.getElementById('msgText').textContent }; });
const waitB = (pg) => pg.waitForFunction(() => window.AGNSTART.nat.B && document.querySelectorAll('#nvBars .b').length > 0, null, { timeout: 90000 }).catch(() => {});
async function px(pg, lat, lon) { return pg.evaluate(([a, b]) => { const r = document.getElementById('map').getBoundingClientRect(), q = window.map.latLngToContainerPoint([a, b]); return { x: r.left + q.x, y: r.top + q.y }; }, [lat, lon]); }
/* the panel's bars vs the server's part hazardCount of that exact point and day */
async function check(pg, tag) { const s = await S(pg); const B = await getJ('/api/point?lat=' + s.sel.lat.toFixed(5) + '&lon=' + s.sel.lon.toFixed(5) + '&parts=hazardCount&complete=1');
  const v = B.parts.hazardCount.v, day = v.days[s.day];
  const want = day.bars.map((b, i) => ({ k: b.key, st: b.state, lv: b.state === 'level' ? b.level : null, w: b.state === 'level' ? (b.label || WORDS[b.level]) : b.word, i }));
  const sorted = want.slice().sort((x, y) => (x.lv != null && y.lv != null) ? (y.lv - x.lv) || (x.i - y.i) : x.lv != null ? -1 : y.lv != null ? 1 : x.i - y.i);
  const got = s.bars.map((b) => ({ k: b.k, st: b.st, lv: b.lv == null ? null : +b.lv, w: b.w }));
  ok(JSON.stringify(got) === JSON.stringify(sorted.map(({ i, ...r }) => r)), tag + ': one bar per hazard of the server, highest first, the server\'s words', JSON.stringify({ got, want: sorted }).slice(0, 900));
  ok(s.bars.every((b) => b.st === 'level' ? !b.grey : (b.grey && !/Normal/.test(b.w))), tag + ': a hazard without a level is a grey line with its state word, never Normal', JSON.stringify(s.bars));
  ok(s.count === (day.count == null ? '' : String(day.count)), tag + ': data-count = the server count (the map colour)', s.count + ' vs ' + day.count);
  const top = sorted[0] && sorted[0].lv != null ? sorted[0] : null; const nAbove = want.filter((x) => x.lv != null && x.lv >= 1).length;
  ok(top ? (top.lv === 0 ? /Normal/.test(s.top) : s.top.includes(day.bars.find((b) => b.key === top.k).name) && s.top.includes(top.w)) : /No hazard level/.test(s.top), tag + ': the summary names the highest hazard and its word', s.top);
  ok(nAbove ? s.above.startsWith(nAbove + ' of ') : /Normal|No hazard/.test(s.above), tag + ': how many are above Normal', s.above + ' (' + nAbove + ')');
  ok(/^Worst day: |^No day above Normal in the next \d+ days$/.test(s.worst), tag + ': the worst day of the days served', s.worst);
  return { s, B }; }

{ // O1 granted
  const o = await open({ grant: true }); await o.pg.waitForTimeout(2500); const z0 = await o.pg.evaluate(() => window.map.getZoom()); const samples = [];
  for (let i = 0; i < 9; i++) { samples.push(await S(o.pg)); await o.pg.waitForTimeout(2000); }
  const s = samples[samples.length - 1];
  ok(samples.every((x) => x.dark && x.view === 'start' && !x.card), 'O1 granted: dark Pakistan view for 20 s, never the white map or the drawer (no flip)', JSON.stringify(samples.map((x) => [x.dark, x.view, x.card])));
  ok(samples.every((x) => Math.abs(x.zoom - z0) < 0.01), 'O1 granted: no zoom change on open', samples.map((x) => x.zoom).join(','));
  ok(s.pin && Math.abs(s.pin.lat - LAT) < 1e-4 && Math.abs(s.pin.lon - LON) < 1e-4 && s.pins === 1, 'O1 granted: one crosshair at the visitor\'s point', JSON.stringify(s.pin));
  ok(s.open && /^Hazards today (at|near) \S/.test(s.title || ''), 'O1 granted: the bottom panel is open for that place: "Hazards today at <place>"', s.title);
  await waitB(o.pg); await check(o.pg, 'O1');
  await o.pg.screenshot({ path: join(SHOTS, 'start39_open_granted.png') });
  ok(o.errs.length === 0, 'O1 no page errors', o.errs.join(' | '));
  /* C2 hover does nothing */
  await o.pg.evaluate(() => { window.map.setView([27.7, 68.86], window.map.getZoom(), { animate: false }); window.map.panBy([0, 140], { animate: false }); }); await o.pg.waitForTimeout(600);   /* the point above the open panel (a pan, as a person would) */
  const n0 = o.req.length, t0 = (await S(o.pg)).title; const p = await px(o.pg, 27.7, 68.86); await o.pg.mouse.move(p.x, p.y); await o.pg.waitForTimeout(400); await o.pg.mouse.move(p.x + 30, p.y + 20); await o.pg.waitForTimeout(1500);
  const s2 = await S(o.pg); ok(!o.req.slice(n0).some((u) => /\/api\/point/.test(u)) && s2.title === t0 && s2.pin.lat === s.pin.lat, 'C2 hover does nothing (no request, no change)', o.req.slice(n0).join(' '));
  /* C1 click moves the crosshair */
  await o.pg.mouse.click(p.x, p.y); await o.pg.waitForTimeout(300); await waitB(o.pg); await o.pg.waitForTimeout(800);
  let c = await S(o.pg);
  ok(c.pins === 1 && c.pin && Math.abs(c.pin.lat - 27.7) < 0.05 && Math.abs(c.pin.lon - 68.86) < 0.05 && c.dark && !c.card, 'C1 a click moves the one crosshair there (dark view kept)', JSON.stringify(c.pin));
  await check(o.pg, 'C1 click');
  /* C1 drag */
  const a = await o.pg.evaluate(() => { const r = window.AGNSTART.nat.pin.getElement().querySelector('svg').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const q = await px(o.pg, 29.7, 70.86);
  await o.pg.mouse.move(a.x, a.y); await o.pg.mouse.down(); for (let i = 1; i <= 12; i++) await o.pg.mouse.move(a.x + (q.x - a.x) * i / 12, a.y + (q.y - a.y) * i / 12); await o.pg.mouse.up();
  await o.pg.waitForTimeout(300); await waitB(o.pg); await o.pg.waitForTimeout(800); c = await S(o.pg);
  ok(c.pin && Math.abs(c.pin.lat - 29.7) < 0.15 && Math.abs(c.pin.lon - 70.86) < 0.15 && c.sel && Math.abs(c.sel.lat - c.pin.lat) < 1e-4, 'C1 the crosshair can be dragged; on drop the panel reads the new point', JSON.stringify({ pin: c.pin, sel: c.sel }));
  await check(o.pg, 'C1 drag');
  /* P2 day slider */
  await o.pg.evaluate(() => { const r = document.getElementById('nvDayR'); r.value = '2'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await o.pg.waitForTimeout(2500);
  c = await S(o.pg); ok(c.day === 2 && /^Hazards on [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} (at|near) /.test(c.title || '') && o.req.some((u) => /hazardgrid\?day=2/.test(u)), 'P2 the day slider changes the map\'s day and the chart\'s day together', JSON.stringify({ day: c.day, title: c.title }));
  await check(o.pg, 'P2 day 2');
  await o.pg.evaluate(() => { const r = document.getElementById('nvDayR'); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await o.pg.waitForTimeout(1200);
  /* P3 collapse */
  await o.pg.click('#nvCol'); await o.pg.waitForTimeout(700); c = await S(o.pg);
  const strip = await o.pg.evaluate(() => { const r = document.getElementById('nvDay').getBoundingClientRect(); return r.top < innerHeight && r.height > 40; });
  ok(!c.open && c.pin && c.has && strip && c.panelTop > c.ih - 58 - 60, 'P3 the collapse arrow hides the chart; the strip and the crosshair stay', JSON.stringify({ open: c.open, pin: !!c.pin, top: c.panelTop, ih: c.ih }));
  await o.pg.click('#nvCol'); await o.pg.waitForTimeout(700); c = await S(o.pg); ok(c.open, 'P3 the arrow opens it again', c.open);
  await o.pg.keyboard.press('Escape'); await o.pg.waitForTimeout(500); c = await S(o.pg); ok(!c.open && c.pin, 'P3 Escape folds the chart, the crosshair stays', JSON.stringify({ open: c.open }));
  await o.pg.click('#nvCol'); await o.pg.waitForTimeout(600);
  /* Z1 zoom in -> white; out -> back */
  const sel0 = (await S(o.pg)).sel; await o.pg.evaluate(([a, b]) => window.map.setView([a, b], 12, { animate: false }), [sel0.lat, sel0.lon]); await o.pg.waitForTimeout(1500);
  c = await S(o.pg); ok(!c.dark && c.view === 'start' && !c.pin && c.panelVis === 'hidden' && !c.card, 'Z1 zooming in fades to the white street map; the panel and the crosshair hide', JSON.stringify({ dark: c.dark, pin: c.pin, vis: c.panelVis }));
  await o.pg.evaluate(() => window.map.setZoom(5.3, { animate: false })); await o.pg.waitForTimeout(1500);
  c = await S(o.pg); ok(c.dark && c.pin && Math.abs(c.pin.lat - sel0.lat) < 1e-6 && c.panelVis === 'visible' && c.open, 'Z1 zooming out to dark brings back the crosshair and the panel', JSON.stringify({ dark: c.dark, pin: c.pin, vis: c.panelVis, open: c.open }));
  /* S1 Full details */
  await o.pg.click('#nvMore'); await o.pg.waitForFunction(() => document.getElementById('card').getAttribute('data-ready') === '1', null, { timeout: 90000 }).catch(() => {}); await o.pg.waitForTimeout(1500);
  c = await S(o.pg); ok(c.view === 'card' && c.card && !c.dark && c.zoom >= 10 && !c.pin, '"Full details" opens the white street map and the full place drawer', JSON.stringify({ view: c.view, card: c.card, dark: c.dark, zoom: c.zoom }));
  ok(o.errs.length === 0, 'no page errors (click, drag, slider, zoom, Full details)', o.errs.join(' | '));
  await o.ctx.close(); }
{ // O2 denied
  const o = await open({ init: DENY }); await o.pg.waitForTimeout(6000); const s = await S(o.pg);
  ok(s.dark && s.view === 'start' && !s.card && !s.pin && !s.open && !s.has, 'O2 denied: dark, no crosshair, the panel collapsed', JSON.stringify(s).slice(0, 300));
  ok(s.hint === 'Click the map or use Current location' && !s.msg, 'O2 denied: one short hint "Click the map or use Current location"', JSON.stringify({ hint: s.hint, msg: s.msg }));
  await o.pg.screenshot({ path: join(SHOTS, 'start39_open_denied.png') });
  /* S1 search unchanged */
  await o.pg.fill('#q', 'Multan'); await o.pg.waitForSelector('#sr button[data-ac]', { timeout: 30000 }).catch(() => {}); await o.pg.keyboard.press('ArrowDown'); await o.pg.keyboard.press('Enter');
  await o.pg.waitForFunction(() => document.getElementById('card').getAttribute('data-ready') === '1', null, { timeout: 120000 }).catch(() => {}); await o.pg.waitForTimeout(2000);
  const c = await S(o.pg); ok(c.view === 'card' && c.card && !c.dark && c.zoom >= 10, 'S1 a search still zooms in to the white map with the full place drawer', JSON.stringify({ view: c.view, dark: c.dark, zoom: c.zoom }));
  ok(o.errs.length === 0, 'O2 no page errors', o.errs.join(' | ')); await o.ctx.close(); }
{ // L1 Current location (denied on open, granted when pressed)
  const o = await open({ init: DENY }); await o.pg.waitForTimeout(4000);
  await o.ctx.grantPermissions(['geolocation']); await o.ctx.setGeolocation({ latitude: 33.6844, longitude: 73.0479, accuracy: 30 });
  await o.pg.evaluate(() => { delete navigator.geolocation.getCurrentPosition; });   /* the stub off: the browser's own position */
  const box = await o.pg.evaluate(() => { const a = document.getElementById('myLoc').getBoundingClientRect(), b = document.querySelector('#hero .sbox').getBoundingClientRect(); return { a: [a.left, a.top, a.width], b: [b.right, b.top], txt: document.getElementById('myLoc').textContent.trim(), form: !!document.getElementById('myLoc').closest('form') }; });
  ok(box.form && box.txt === 'Current location' && Math.abs(box.a[1] - box.b[1]) < 12 && box.a[0] >= box.b[0] - 1, '"Current location" sits next to the search box', JSON.stringify(box));
  const z0 = await o.pg.evaluate(() => window.map.getZoom());
  await o.pg.click('#myLoc'); await o.pg.waitForTimeout(1500); await waitB(o.pg); await o.pg.waitForTimeout(800); const s = await S(o.pg);
  ok(s.dark && !s.card && s.pin && Math.abs(s.pin.lat - 33.6844) < 1e-3 && s.open && Math.abs(s.zoom - z0) < 0.01, 'L1 Current location moves the crosshair to the visitor\'s point on the dark view and opens the panel (no zoom)', JSON.stringify({ pin: s.pin, open: s.open, zoom: [z0, s.zoom] }));
  await check(o.pg, 'L1');
  await o.ctx.close(); }
{ // M1 phone
  const o = await open({ grant: true, vp: { width: 390, height: 844 }, mobile: true }); await o.pg.waitForTimeout(3000); await waitB(o.pg); await o.pg.waitForTimeout(1500);
  const s = await S(o.pg);
  const g = await o.pg.evaluate(() => { const p = document.getElementById('nvPanel').getBoundingClientRect(), h = document.getElementById('hero').getBoundingClientRect(), m = document.getElementById('map').getBoundingClientRect(), pin = window.AGNSTART.nat.pin && window.AGNSTART.nat.pin.getElement() ? window.AGNSTART.nat.pin.getElement().getBoundingClientRect() : null;
    return { pTop: p.top, hBot: h.bottom, mTop: m.top, pin: pin ? pin.top : null, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  ok(s.dark && s.open && !s.card, 'M1 phone: the bottom sheet opens on the dark view', JSON.stringify({ dark: s.dark, open: s.open }));
  ok(g.pTop - Math.max(g.hBot, g.mTop) > 120 && g.pin != null && g.pin > g.hBot && g.pin < g.pTop, 'M1 phone: the map is visible above the sheet and the crosshair is in it', JSON.stringify(g));
  ok(g.sw <= g.iw + 1, 'M1 phone: no horizontal scroll', JSON.stringify(g));
  await o.pg.screenshot({ path: join(SHOTS, 'start39_phone.png') });
  ok(o.errs.length === 0, 'M1 no page errors', o.errs.join(' | ')); await o.ctx.close(); }
await br.close(); done();
