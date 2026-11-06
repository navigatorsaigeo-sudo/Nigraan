/* v91.17.283.37 (NIGRAAN 1.0.1, round 4, owner 30 Oct) · OPEN AT THE PERSON'S OWN LOCATION, start page and Analyst Overview.
   Granted (Playwright geolocation permission and coordinates): the point opens as a map click / typed coordinates do, with "Your location",
   the pulse marker and the browser's accuracy circle, and the SAME values as picking that point by hand. Coarse (5 km): the plain
   "Approximate location (about 5 km) - ..." line. Declined, 15 s with no answer, not offered, not https: the dark Pakistan view (start) or
   the last place / "Choose a place" (Overview) with one short line saying why. Race: a pick made before the position arrives wins.
   A #agnplace hand-over wins (no request). Phone (390 px).
   usage: node scripts/tests28337/autoloc37.test.mjs [base] */
import { T, browser, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const br = await browser();
const LAT = 31.5204, LON = 74.3587, MUL = '30.19570, 71.47530';
const GRANT = (acc) => ({ geolocation: { latitude: LAT, longitude: LON, accuracy: acc }, permissions: ['geolocation'] });
/* a browser's geolocation answered by a stub (declined, never, not offered, not https, late) */
const STUB = {
  denied: () => { navigator.geolocation.getCurrentPosition = function (s, e) { setTimeout(function () { e({ code: 1, message: 'User denied Geolocation' }); }, 300); }; },
  never: () => { navigator.geolocation.getCurrentPosition = function () {}; },
  none: () => { Object.defineProperty(Navigator.prototype, 'geolocation', { get: function () { return undefined; }, configurable: true }); },
  insecure: () => { Object.defineProperty(window, 'isSecureContext', { get: function () { return false; }, configurable: true }); },
  late: () => { navigator.geolocation.getCurrentPosition = function (s) { setTimeout(function () { s({ coords: { latitude: 31.5204, longitude: 74.3587, accuracy: 30 } }); }, 12000); }; },
};
async function page(path, o = {}) {
  const ctx = await br.newContext({ viewport: { width: o.w || 1366, height: o.h || 900 }, ...(o.mob ? { isMobile: true, hasTouch: true } : {}), ...(o.ctx || {}) });
  if (o.init) await ctx.addInitScript(o.init); if (o.ls) await ctx.addInitScript(o.ls);
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE + path, { waitUntil: 'load', timeout: 120000 }); return { ctx, pg, errs };
}
/* ---------------- the start page ---------------- */
const SS = () => { const g = (i) => document.getElementById(i); const card = g('card');
  const nums = {}; document.querySelectorAll('#pane_now [data-num]').forEach((e) => { nums[e.getAttribute('data-num')] = e.textContent.trim(); });
  return { dark: document.body.classList.contains('agn-dark'), view: card && !card.closest('[hidden]') && card.getBoundingClientRect().width > 0 ? 'card' : 'start',
    name: g('cName') ? g('cName').textContent.trim() : null, you: g('cYou') ? g('cYou').textContent.trim() : null, note: g('cLocNote') ? g('cLocNote').textContent.trim() : null,
    msg: g('msgBar').hidden ? null : g('msgText').textContent.trim(), me: document.querySelectorAll('.me-pulse').length, acc: document.querySelectorAll('.me-acc').length,
    ready: card && card.getAttribute('data-ready') === '1', tab: (document.querySelector('#dTabs [aria-selected="true"]') || {}).id || null, nums,
    asked: AGNSTART.autoLoc.asked, loc: Object.assign({}, AGNSTART.autoLoc.loc()), sw: document.documentElement.scrollWidth, iw: innerWidth }; };
async function startWait(pg, f, ms = 30000) { const t0 = Date.now(); let s; for (;;) { s = await pg.evaluate(SS); if (f(s) || Date.now() - t0 > ms) return s; await pg.waitForTimeout(500); } }
/* v91.17.283.39 (1.0.3): on the dark Pakistan view the visitor's location only places the crosshair and opens the bottom panel (no zoom,
   no white map, no drawer); denied / none: no crosshair, the panel collapsed, the hint "Click the map or use Current location" */
const NS = () => { const N = AGNSTART.nat, b = document.body.classList; const pin = N.pin && window.map.hasLayer(N.pin) ? N.pin.getLatLng() : null;
  return { dark: b.contains('agn-dark'), view: AGNSTART.view, open: b.contains('nv-open'), pin: pin ? [pin.lat, pin.lng] : null, sub: document.getElementById('nvSub').textContent, title: document.getElementById('nvTt').hidden ? null : document.getElementById('nvTt').textContent.replace(/\s+/g, ' ').trim(),
    hint: document.getElementById('nvHint2').hidden ? null : document.getElementById('nvHint2').textContent, why: document.getElementById('nvHint2').getAttribute('data-why'), msg: document.getElementById('msgBar').hidden ? null : document.getElementById('msgText').textContent.trim(),
    bars: [...document.querySelectorAll('#nvBars .b')].map((x) => x.getAttribute('data-hz') + ':' + x.querySelector('.bw').textContent.trim()).join(','), me: document.querySelectorAll('.me-pulse').length, zoom: window.map.getZoom(), asked: AGNSTART.autoLoc.asked, sw: document.documentElement.scrollWidth, iw: innerWidth }; };
async function natWait(pg, f, ms = 30000) { const t0 = Date.now(); let s; for (;;) { s = await pg.evaluate(NS); if (f(s) || Date.now() - t0 > ms) return s; await pg.waitForTimeout(500); } }
{ // S1 granted, fine accuracy + S2 the same values as a click on that point
  const { ctx, pg, errs } = await page('/', { ctx: GRANT(25) });
  const z0 = await pg.evaluate(() => window.map.getZoom());
  let s = await natWait(pg, (x) => x.bars); await pg.waitForTimeout(6000); s = await pg.evaluate(NS);
  ok(s.dark && s.view === 'start' && s.open && Math.abs(s.zoom - z0) < 0.01, 'start S1 (1.0.3): the located point opens the bottom panel on the dark view (no zoom, no white map, no drawer)', JSON.stringify(s));
  ok(s.pin && Math.abs(s.pin[0] - LAT) < 1e-4 && Math.abs(s.pin[1] - LON) < 1e-4, 'start S1: the crosshair at the visitor\'s point', JSON.stringify(s.pin));
  ok(/^Your location · /.test(s.sub) && /^Hazards today (at|near) \S/.test(s.title || ''), 'start S1: "Your location" and "Hazards today at <place>"', s.sub + ' | ' + s.title);
  ok(s.me === 0, 'start S1: no other marker than the crosshair', s.me);
  ok(errs.length === 0, 'start S1: no page errors', errs.join(' | '));
  const c2 = await br.newContext({ viewport: { width: 1366, height: 900 } }); await c2.addInitScript(STUB.never); const p2 = await c2.newPage();
  await p2.goto(BASE + '/', { waitUntil: 'load', timeout: 120000 }); await p2.waitForTimeout(1500);
  await p2.evaluate(([la, lo]) => AGNSTART.nat.read(la, lo, {}), [LAT, LON]);
  let m = await natWait(p2, (x) => x.bars); await p2.waitForTimeout(3000); m = await p2.evaluate(NS);
  ok(s.bars && s.bars === m.bars && s.title === m.title, 'start S2: the located point shows the same values as a click on that point', JSON.stringify({ auto: [s.title, s.bars], click: [m.title, m.bars] }));
  await c2.close(); await ctx.close(); }
{ // S3 coarse
  const { ctx, pg } = await page('/', { ctx: GRANT(5000) });
  const s = await natWait(pg, (x) => x.bars);
  ok(/^Approximate location \(about 5 km\) · /.test(s.sub) && s.pin && s.dark, 'start S3: a 5 km position says plainly it is approximate (crosshair, dark view)', s.sub);
  await ctx.close(); }
for (const [k, why, wait] of [['denied', 'Location was not shared', 4000], ['never', 'No position from the browser within 15 s', 18000], ['none', 'This browser does not share location', 3000], ['insecure', 'Location needs a secure (https) address', 3000]]) {
  const { ctx, pg } = await page('/', { init: STUB[k] }); await pg.waitForTimeout(wait);
  const s = await pg.evaluate(NS);
  ok(s.dark && s.view === 'start' && !s.open && !s.pin && s.hint === 'Click the map or use Current location' && s.why === why && !s.msg, 'start S4 ' + k + ': the dark Pakistan view, no crosshair, the panel collapsed, one short hint', JSON.stringify({ dark: s.dark, view: s.view, open: s.open, hint: s.hint, why: s.why, msg: s.msg }));
  ok(s.me === 0, 'start S4 ' + k + ': no location marker', s.me);
  await ctx.close(); }
{ // S5 race: a search before the position arrives wins
  const { ctx, pg } = await page('/', { init: STUB.late }); await pg.waitForTimeout(1500);
  await pg.fill('#q', 'Multan'); await pg.press('#q', 'Enter');
  await pg.waitForTimeout(14000); const s = await startWait(pg, (x) => x.ready);
  ok(/Multan/i.test(s.name || '') && !s.you && s.me === 0, 'start S5: the searched place stays; the late position is dropped', JSON.stringify({ name: s.name, you: s.you, me: s.me }));
  ok(s.loc.cancelled >= 1 && !s.loc.pending, 'start S5: the pending request was cancelled by the pick', JSON.stringify(s.loc));
  await ctx.close(); }
{ // S6 a #agnplace hand-over wins
  const { ctx, pg } = await page('/#agnplace=33.68440,73.04790,Islamabad', { ctx: GRANT(25) });
  const s = await startWait(pg, (x) => x.ready);
  ok(s.asked === false && !s.you && s.me === 0 && !/Mian Mir|Lahore/.test(s.name || ''), 'start S6: the hand-over place opens, no location request', JSON.stringify({ asked: s.asked, name: s.name, you: s.you }));
  await ctx.close(); }
{ // S7 phone
  const { ctx, pg } = await page('/', { ctx: GRANT(25), w: 390, h: 844, mob: true });
  const s = await natWait(pg, (x) => x.bars);
  ok(s.dark && s.open && s.pin && /^Your location/.test(s.sub), 'start S7 phone: the located point opens the bottom sheet with "Your location"', JSON.stringify({ dark: s.dark, open: s.open, sub: s.sub }));
  ok(s.sw <= s.iw + 1, 'start S7 phone: no horizontal scroll', s.sw + ' > ' + s.iw);
  await pg.screenshot({ path: (process.env.SHOTS || '/dev/shm') + '/autoloc37_phone.png' }); await ctx.close(); }
/* ---------------- the Analyst Overview ---------------- */
const OS = () => { const n = document.getElementById('agnLocNote'), q = (s) => document.querySelector(s);
  const top = { t: (q('#agnLive84 .t .v') || {}).textContent, hum: (q('#agnLive84 [data-k="hum"] b') || {}).textContent, wind: (q('#agnLive84 [data-k="wind"] b') || {}).textContent };
  return { lab: document.getElementById('cityLabel').textContent.trim(), note: n && !n.hidden ? n.querySelector('.t').textContent : null, kind: n && !n.hidden ? n.getAttribute('data-kind') : null,
    st: AGNAutoLoc.state, pin: AGN.point.pin(), me: document.querySelectorAll('.me-pulse').length, top, noplace: document.documentElement.classList.contains('agn-noplace'),
    sw: document.documentElement.scrollWidth, iw: innerWidth }; };
async function ovWait(pg, f, ms = 40000) { const t0 = Date.now(); let s; for (;;) { s = await pg.evaluate(OS); if (f(s) || Date.now() - t0 > ms) return s; await pg.waitForTimeout(500); } }
const settled = (x) => x.top.t && /\d/.test(x.top.t) && x.top.hum && /\d/.test(x.top.hum) && x.top.wind && /\d/.test(x.top.wind);
{ // O1 granted + O2 same values as typed coordinates
  const { ctx, pg, errs } = await page('/analyst', { ctx: GRANT(25) });
  const s = await ovWait(pg, (x) => x.st === 'located' && x.pin && settled(x) && !/Finding|Choose/.test(x.lab));
  ok(s.st === 'located' && s.pin && Math.abs(s.pin.lat - LAT) < 1e-4 && Math.abs(s.pin.lon - LON) < 1e-4, 'overview O1: the located point is the page\'s place', JSON.stringify(s.pin));
  ok(s.kind === 'you' && s.note === 'Your location (accuracy about 25 m)' && s.me === 1, 'overview O1: "Your location" with the accuracy, and the pulse marker', JSON.stringify({ note: s.note, me: s.me }));
  ok(!/Finding|Choose/.test(s.lab), 'overview O1: the place label is the place', s.lab);
  ok(errs.length === 0, 'overview O1: no page errors', errs.join(' | '));
  await pg.waitForTimeout(3000); const s1 = await pg.evaluate(OS);
  const c2 = await br.newContext({ viewport: { width: 1366, height: 900 } }); await c2.addInitScript(STUB.never); const p2 = await c2.newPage();
  await p2.goto(BASE + '/analyst', { waitUntil: 'load', timeout: 120000 }); await p2.waitForTimeout(2500);
  await p2.evaluate((t) => AGN.point.goText(t, { quiet: true }), LAT.toFixed(5) + ', ' + LON.toFixed(5));
  await ovWait(p2, (x) => x.pin && settled(x) && !/Finding|Choose/.test(x.lab)); await p2.waitForTimeout(3000); const m = await p2.evaluate(OS);
  ok(JSON.stringify(s1.top) === JSON.stringify(m.top) && s1.lab === m.lab, 'overview O2: the located point shows the same values as typing that point', JSON.stringify({ auto: s1.top, typed: m.top, l1: s1.lab, l2: m.lab }));
  ok(m.st === 'cancelled', 'overview O2: a typed point while the position is pending cancels it', m.st);
  await c2.close(); await ctx.close(); }
{ // O3 coarse
  const { ctx, pg } = await page('/analyst', { ctx: GRANT(5000) });
  const s = await ovWait(pg, (x) => x.st === 'located' && x.note);
  ok(s.kind === 'coarse' && s.note === 'Approximate location (about 5 km) - search your exact place for a precise reading', 'overview O3: a 5 km position says plainly it is approximate', s.note);
  ok(await pg.evaluate(() => document.querySelector('#agnLocNote button').hidden), 'overview O3: the approximate line cannot be closed while that point is shown', '');
  await ctx.close(); }
{ // O4 declined, no last place / with a last place
  const { ctx, pg } = await page('/analyst', { init: STUB.denied }); await pg.waitForTimeout(5000);
  const s = await pg.evaluate(OS);
  ok(s.st === 'failed' && s.note === 'Location was not shared - choose a place.' && s.lab === 'Choose a place' && !s.pin, 'overview O4: declined and no last place: "Choose a place" with one short line', JSON.stringify(s));
  const id = await pg.evaluate(() => STATIONS.filter((x) => x.id !== '__live')[0].id); await ctx.close();
  const o = await page('/analyst', { init: STUB.denied, ls: 'localStorage.setItem("agn.lastPlace", JSON.stringify({id:' + JSON.stringify(id) + '}))' }); await o.pg.waitForTimeout(6000);
  const s2 = await o.pg.evaluate((i) => Object.assign({ sel: typeof selectedId !== 'undefined' ? selectedId : null, want: i }, (function () { const n = document.getElementById('agnLocNote'); return { note: n && !n.hidden ? n.querySelector('.t').textContent : null }; })()), id);
  ok(s2.sel === id && s2.note === 'Location was not shared - showing your last place.', 'overview O4: declined: the last place, with one short line', JSON.stringify(s2));
  await o.ctx.close(); }
{ // O5 timeout (15 s, no answer)
  const { ctx, pg } = await page('/analyst', { init: STUB.never }); await pg.waitForTimeout(8000);
  const a = await pg.evaluate(OS); ok(a.st === 'asking' && /Finding your location/.test(a.lab), 'overview O5: while waiting: "Finding your location…"', a.lab);
  await pg.waitForTimeout(10000); const s = await pg.evaluate(OS);
  ok(s.st === 'failed' && s.note === 'No position from the browser within 15 s - choose a place.' && s.lab === 'Choose a place', 'overview O5: no answer in 15 s: one short line, "Choose a place"', JSON.stringify({ st: s.st, note: s.note, lab: s.lab }));
  await ctx.close(); }
{ // O6 race: a typed point before the position arrives wins
  const { ctx, pg } = await page('/analyst', { init: STUB.late }); await pg.waitForTimeout(2000);
  await pg.evaluate((t) => AGN.point.goText(t, { quiet: true }), MUL); await pg.waitForTimeout(15000);
  const s = await pg.evaluate(OS);
  ok(s.st === 'cancelled' && s.pin && Math.abs(s.pin.lat - 30.1957) < 1e-3 && s.me === 0, 'overview O6: the typed place stays; the late position is dropped', JSON.stringify({ st: s.st, pin: s.pin, me: s.me }));
  await ctx.close(); }
{ // O7 a #agnplace hand-over wins
  const { ctx, pg } = await page('/analyst#agnplace=33.68440,73.04790,Islamabad', { ctx: GRANT(25) }); await pg.waitForTimeout(8000);
  const s = await pg.evaluate(OS);
  ok(s.st === 'idle' && s.me === 0 && !s.note, 'overview O7: the hand-over place opens, no location request', JSON.stringify({ st: s.st, lab: s.lab }));
  await ctx.close(); }
{ // O8 phone
  const { ctx, pg } = await page('/analyst', { ctx: GRANT(25), w: 390, h: 844, mob: true });
  const s = await ovWait(pg, (x) => x.st === 'located' && x.pin);
  const box = await pg.evaluate(() => { const n = document.getElementById('agnLocNote'); if (!n || n.hidden) return null; const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, iw: innerWidth, ih: innerHeight }; });
  ok(s.st === 'located' && s.kind === 'you' && box && box.l >= 0 && box.r <= box.iw && box.b <= box.ih, 'overview O8 phone: located, the line inside the screen', JSON.stringify({ st: s.st, box }));
  await pg.screenshot({ path: (process.env.SHOTS || '/dev/shm') + '/autoloc37_overview_phone.png' }); await ctx.close(); }
await br.close(); done();
