/* v91.17.283.37 (NIGRAAN 1.0.1) · THE START PAGE (browser): the Pakistan view (A) and the place panel fixes (B1, B4)
   A1  opens on the Pakistan view: dark, no place, no pin, no card; the hazard surface drawn from GET /api/hazardgrid (no tehsil fill);
       the legend "Hazards today at Moderate or above" 0..6 with the counted and not-counted hazards; the rivers drawn; IIOJK "(disputed)"
   A2  no colour where nothing assessed: the surface image is transparent over IIOJK, the sea and the neighbours
   A3  a click drops a target and opens the bottom panel; its name, temperature, bars and count equal the server's place record of that
       exact point (GET /api/point, part hazardCount); no coordinates in it; not tested / not assessed bars never say Normal
   A4  the day slider changes the surface's day and both panels' day
   A5  "More about this place" and a search open the light map with the right-hand place panel (six tabs); the place is kept 60 s
   B1  the Now tab: none of the removed strings, one temperature with feels like, six key values (no pressure, no cloud), the chance of rain
       of the current or next window (never a window already past); every tab of the panel: no coordinates, no method words, no station
       distance, no run id, no code text, no agency name
   B4  "Use my location": a browser position that arrives after the user searched another place does not replace it
   M   mobile (390 x 844): the panels stack, no horizontal scroll
   Screenshots: <tree>/shots/ (start37_national.png, start37_click.png, start37_search.png, start37_mobile*.png)
   usage: node scripts/tests28337/start37.test.mjs [base] */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { T, browser, BASE, ROOT } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const SHOTS = process.env.NIGRAAN_SHOTS || join(ROOT, 'shots'); try { mkdirSync(SHOTS, { recursive: true }); } catch (_) {}
const C = { 'x-agn-view': 'customer' };
const getJ = async (p) => { const r = await fetch(BASE + p, { headers: C }); return r.json(); };
const br = await browser();
async function open(path, o = {}) { const ctx = await br.newContext({ viewport: o.vp || { width: 1366, height: 900 }, ...(o.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  if (o.init) await ctx.addInitScript(o.init); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  const req = []; pg.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE)) req.push(u.replace(BASE, '')); });
  await pg.goto(BASE + path, { waitUntil: 'load', timeout: 180000 }); return { ctx, pg, errs, req }; }
const S = (pg) => pg.evaluate(() => { const A = window.AGNSTART, N = A && A.nat; return { view: A && A.view, place: A && A.place ? { lat: A.place.lat, lon: A.place.lon, name: A.place.name } : null, dark: document.body.classList.contains('agn-dark'), nat: document.body.classList.contains('agn-nat'),
  open: document.body.classList.contains('nv-open'), card: !document.getElementById('card').hidden && document.getElementById('card').classList.contains('open'), pins: A && A.pinCount ? A.pinCount() : null, surf: !!(N && N.surf), drawn: N && N.drawn, day: N && N.day,
  hzFill: !!(A && A.hzLayer), zoom: window.map.getZoom() }; });
async function clickAt(pg, lat, lon) { const p = await pg.evaluate(([a, b]) => { const r = document.getElementById('map').getBoundingClientRect(), q = window.map.latLngToContainerPoint([a, b]); return { x: r.left + q.x, y: r.top + q.y }; }, [lat, lon]); await pg.mouse.click(p.x, p.y); }
/* v283.39 (1.0.3): the bottom panel is the Mora Lab chart: title "Hazards <day> at <place>", bars highest first, a summary; n = data-count (the map colour) */
const panelText = (pg) => pg.evaluate(() => { const el = document.getElementById('nvPanel'); return { name: (document.getElementById('nvName') || {}).textContent || '', t: '', m: '', n: el.getAttribute('data-count') || '–', s: (document.getElementById('nvTt') || {}).textContent.replace(/\s+/g, ' ').trim(), sum: (document.getElementById('nvSum') || {}).innerText || '',
  bars: Array.prototype.map.call(el.querySelectorAll('#nvBars .b'), (b) => ({ k: b.getAttribute('data-hz'), st: b.getAttribute('data-state'), w: b.querySelector('.bw').textContent })), all: el.innerText, vis: el.getBoundingClientRect().top < innerHeight - 20 }; });
const COORD_RE = /\b(?:2[3-9]|3[0-7])\.\d{2,}\s*(?:°\s*N)?\s*[,/]\s*(?:6[0-9]|7[0-9])\.\d{2,}\b/;
const CODE_RE = /[\w-]+\.(?:mjs|json|py)\b|\b(?:server|data|scripts|station-lake)\/[\w./-]+/;
const AGENCY_RE = /\bPMD\b|Pakistan Meteorological Department|\bFFD\b|Flood Forecasting Division|(?<![\w-])EWS(?![\w-])|\bIRSA\b/;
const RUNID_RE = /\b(?:pr1-[0-9a-f]{8}|sc[0-9a-f]{24}|run[ _-]?id|slot\d{5,})\b|\b91\.17\.283\.\d+\b|\bv91\.17\b/i;
const METHOD_RE = /apparent temperature|\(screening\)|\bscreening\b(?! index)|forecast for this place|Nearest (?:AGN )?station|\bmethod\b|ensemble members|held-out|\bmodel run\b|run of \d|\bMOS\b|\bIFS\b|Product type not recorded/i;
const REMOVED = ['(apparent temperature)', '(screening)', 'forecast for this place', 'Nearest station', 'no AGN station reading within 25 km', 'Pressure, hPa', 'Cloud, %'];
/* ---------- A1 / A2 the Pakistan view ---------- */
{ const o = await open('/'); await o.pg.waitForTimeout(9000);
  let s = await S(o.pg);
  ok(s.view === 'start' && !s.place && !s.card && s.pins === 0, 'A1 opens on the Pakistan view: no default place, no pin, no card', JSON.stringify(s));
  ok(s.dark && s.nat, 'A1 the Pakistan view is dark', JSON.stringify(s));
  await o.pg.waitForFunction(() => window.AGNSTART.nat && window.AGNSTART.nat.surf, null, { timeout: 60000 }).catch(() => {});
  s = await S(o.pg);
  ok(s.surf && s.drawn && s.drawn.day === 0 && !s.hzFill, 'A1 the hazard surface is drawn from the server grid (no tehsil fill)', JSON.stringify(s));
  ok(o.req.some((u) => /^\/api\/hazardgrid\?day=0/.test(u)) && !o.req.some((u) => /\/n3\/tehsils\.json/.test(u)), 'A1 the surface reads GET /api/hazardgrid (and no tehsil geometry)', o.req.filter((u) => /hazardgrid|tehsils/.test(u)).join(' '));
  const lg = await o.pg.evaluate(() => (document.getElementById('nvLegend') || {}).innerText || '');
  const gj = await getJ('/api/hazardgrid?day=0'), mx = await o.pg.evaluate(() => (document.getElementById('nvMax') || {}).textContent);
  ok(/Hazards today at Moderate or above/.test(lg) && /Counted: Heat, Cold, Heavy rain/.test(lg) && /Not counted: /.test(lg) && gj.scale && mx === String(gj.counted.length) && gj.scale.max === gj.counted.length, 'A1 legend: "Hazards today at Moderate or above", 0 to the number of counted hazards (' + mx + '), counted and not-counted hazards', lg);
  const vis = await o.pg.evaluate(() => ({ rivers: !!(window.AGNSTART.rivers && window.AGNSTART.rivers.layer), riv: (window.AGNSTART.rivers && window.AGNSTART.rivers.vis || []).length, lab: (document.querySelector('.pk-lab') || {}).textContent || '', prov: !!document.querySelector('.pk-prov-line'), title: (document.getElementById('nvTitle') || {}).textContent || '' }));
  ok(vis.rivers && vis.riv > 0, 'A1 the 3D rivers are drawn on the dark view', JSON.stringify(vis));
  ok(/IIOJK \(disputed\)/.test(vis.lab) && vis.prov && /Weather risk today, anywhere in Pakistan/.test(vis.title), 'A1 IIOJK (disputed), province lines and the title', JSON.stringify(vis));
  /* A2: the surface image over IIOJK, the sea and the neighbours is transparent */
  const A = await o.pg.evaluate(async () => { const N = window.AGNSTART.nat, im = N.surf.getElement(), b = N.surf.getBounds(); await (im.decode ? im.decode().catch(() => {}) : null);
    const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
    const m = (la) => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)); const px = (la, lo) => [Math.floor((lo - b.getWest()) / (b.getEast() - b.getWest()) * cv.width), Math.floor((m(b.getNorth()) - m(la)) / (m(b.getNorth()) - m(b.getSouth())) * cv.height)];
    const a = (la, lo) => { const [x, y] = px(la, lo); return g.getImageData(x, y, 1, 1).data[3]; };
    let land = 0; for (const [la, lo] of [[30.2, 71.5], [27.7, 68.9], [31.5, 74.3], [29.0, 66.0], [34.0, 71.6]]) land = Math.max(land, a(la, lo));
    return { iiojk: a(33.0, 76.0), sea: a(24.0, 64.0), afg: a(34.0, 69.0), india: a(30.0, 76.5), land }; });
  ok(A.iiojk === 0 && A.sea === 0 && A.afg === 0 && A.india === 0, 'A2 no colour where nothing is assessed (IIOJK, sea, Afghanistan, India)', JSON.stringify(A));
  ok(A.land > 0, 'A2 the surface is coloured over assessed land', JSON.stringify(A));
  await o.pg.screenshot({ path: join(SHOTS, 'start37_national.png') });
  /* A3 click -> bottom panel == place record */
  const pts = [[30.19570, 71.47530], [27.70000, 68.86000], [35.30000, 75.63000]]; let same = 0, n = 0; const D = [];
  for (const [la, lo] of pts) {
    await o.pg.evaluate(([a, b]) => window.map.setView([a, b], 6.5, { animate: false }), [la, lo]); await o.pg.waitForTimeout(600);
    await clickAt(o.pg, la, lo); await o.pg.waitForFunction(() => window.AGNSTART.nat.B && document.querySelectorAll('#nvBars .b').length > 0, null, { timeout: 90000 }).catch(() => {}); await o.pg.waitForTimeout(800);
    const sel = await o.pg.evaluate(() => window.AGNSTART.nat.sel); const P = await panelText(o.pg);
    const B = await getJ('/api/point?lat=' + sel.lat.toFixed(5) + '&lon=' + sel.lon.toFixed(5) + '&complete=1'); n++;
    const hc = B.parts && B.parts.hazardCount && B.parts.hazardCount.v, d0 = hc && hc.days[0];
    const pl = B.place || {}, wantName = pl.kind === 'near' && pl.near && pl.near.name ? pl.near.name : pl.name;
    const srt = (a) => JSON.stringify(a.slice().sort((x, y) => x.k < y.k ? -1 : 1));
    const wantBars = d0 ? d0.bars.map((b) => ({ k: b.key, st: b.state, w: b.state === 'level' ? (b.label || ['Normal', 'Low', 'Moderate', 'High', 'Severe'][b.level]) : b.word })) : [];
    const gotBars = P.bars.map((b) => ({ k: b.k, st: b.st, w: b.w.replace(/\s*·\s*area$/, '').trim() }));
    const good = P.name === wantName && srt(gotBars) === srt(wantBars) && P.n === (d0 && d0.count != null ? String(d0.count) : '–');
    if (good) same++; else D.push(JSON.stringify({ sel, P: { name: P.name, t: P.t, n: P.n, bars: gotBars }, B: { name: wantName, n: d0 && d0.count, bars: wantBars } }).slice(0, 900));
    ok(!COORD_RE.test(P.all) && !/\d+\.\d{3,}/.test(P.name), 'A3 bottom panel at ' + la + ', ' + lo + ': no coordinates', P.all.slice(0, 200));
    ok(!P.bars.some((b) => b.st !== 'level' && /Normal/.test(b.w)), 'A3 not tested / not assessed bars never say Normal', JSON.stringify(P.bars));
    ok(P.vis && /^Hazards today (at|near) /.test(P.s) && /Highest|No hazard level/.test(P.sum) && /Worst day|No day above Normal/.test(P.sum), 'A3 (1.0.3) the title "Hazards today at <place>" and the summary', P.s + ' | ' + P.sum);
    if (n === 1) await o.pg.screenshot({ path: join(SHOTS, 'start37_click.png') }); }
  ok(same === n, 'A3 bottom panel values == the server place record at that exact point (' + same + ' of ' + n + ')', D.join(' || '));
  const pin = await o.pg.evaluate(() => document.querySelectorAll('.nv-pin svg').length === 1);
  ok(pin, 'A3 (1.0.3) one crosshair marks the clicked point', pin);
  /* A4 the day slider */
  await o.pg.evaluate(() => { const r = document.getElementById('nvDayR'); r.value = '2'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await o.pg.waitForFunction(() => window.AGNSTART.nat.drawn && window.AGNSTART.nat.drawn.day === 2, null, { timeout: 30000 }).catch(() => {});
  s = await S(o.pg); const P2 = await panelText(o.pg); const lg2 = await o.pg.evaluate(() => (document.getElementById('nvLegend') || {}).innerText || '');
  ok(s.day === 2 && s.drawn && s.drawn.day === 2 && o.req.some((u) => /hazardgrid\?day=2/.test(u)), 'A4 the slider draws day +2 from the server grid', JSON.stringify(s.drawn));
  ok(/^Hazards on [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} (at|near) /.test(P2.s), 'A4 the bottom panel follows the day ("Hazards on <day> at ...")', P2.s);
  ok(/Hazards on [A-Z][a-z]{2} \d/.test(lg2), 'A4 the legend follows the day', lg2.slice(0, 80));
  await o.pg.evaluate(() => { const r = document.getElementById('nvDayR'); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await o.pg.waitForTimeout(1500);
  /* A5 More about this place -> light map + right panel */
  await o.pg.click('#nvMore'); await o.pg.waitForFunction(() => document.getElementById('card').getAttribute('data-ready') === '1', null, { timeout: 90000 }).catch(() => {}); await o.pg.waitForTimeout(1500);
  s = await S(o.pg); const tabs = await o.pg.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#dTabs .dtab'), (b) => b.textContent));
  ok(s.view === 'card' && s.card && !s.dark && !s.open, 'A5 "Full details" (was More about this place) opens the light map with the right-hand place panel', JSON.stringify(s));
  ok(tabs.join('|') === 'Now|Forecast|Hazards|This place|Past 30 days|Report', 'A5 the panel keeps its tabs (Now, Forecast, Hazards, This place, Past 30 days, Report)', tabs.join('|'));
  ok(o.errs.length === 0, 'A no page errors on the Pakistan view', o.errs.join(' | ')); await o.ctx.close(); }
/* ---------- A5 search -> light map, right panel; kept 60 s; B1 every tab ---------- */
{ const o = await open('/'); await o.pg.waitForTimeout(6000);
  await o.pg.fill('#q', 'Multan'); await o.pg.waitForSelector('#sr button[data-ac]', { timeout: 30000 }).catch(() => {}); await o.pg.keyboard.press('ArrowDown'); await o.pg.keyboard.press('Enter');
  await o.pg.waitForFunction(() => document.getElementById('card').getAttribute('data-ready') === '1', null, { timeout: 120000 }).catch(() => {}); await o.pg.waitForTimeout(4000);
  let s = await S(o.pg); const p0 = s.place;
  ok(s.view === 'card' && s.card && !s.dark && s.zoom >= 10 && /Multan/i.test((p0 && p0.name) || ''), 'A5 a search opens the right-hand panel on the light map', JSON.stringify(s));
  await o.pg.screenshot({ path: join(SHOTS, 'start37_search.png') });
  /* B1 the Now tab */
  const now = await o.pg.evaluate(() => { const p = document.getElementById('pane_now'); return { txt: p.innerText, head: document.getElementById('cSub').innerText + ' ' + document.getElementById('cName').innerText, labels: Array.prototype.map.call(p.querySelectorAll('#nowStats span'), (x) => x.textContent), temps: p.querySelectorAll('[data-num="tempNow"]').length, upd: p.querySelectorAll('.upd').length }; });
  ok(REMOVED.every((r) => now.txt.indexOf(r) < 0) && !/\bNow, \d\d:\d\d PKT\b/.test(now.txt), 'B1 the Now tab has none of the removed strings', REMOVED.filter((r) => now.txt.indexOf(r) >= 0).join(' | ') + ' :: ' + now.txt.slice(0, 300));
  ok(!COORD_RE.test(now.head) && !/\d{2}\.\d{2}, \d{2}\.\d{2}/.test(now.head), 'B1 no coordinates in the header', now.head);
  ok(now.labels.length === 6 && /^Dew point/.test(now.labels[0]) && /^Gusts/.test(now.labels[1]) && /^Rain next 72 h/.test(now.labels[2]) && /^UV/.test(now.labels[3]) && /^Chance of rain/.test(now.labels[4]) && /^Air quality \(AQI\)/.test(now.labels[5]), 'B1 six key values: dew point, gusts, rain next 72 h, UV, chance of rain, AQI', now.labels.join(' | '));
  ok(now.temps === 1 && now.upd === 1 && /Feels like -?\d+ °C/.test(now.txt) && /humidity \d+ %/.test(now.txt) && /Wind \d+ km\/h/.test(now.txt) && /today -?\S+ °C/.test(now.txt) && /heat stress/i.test(now.txt), 'B1 one large temperature with feels like, humidity, wind, today\'s range, one update time and the heat-stress line', JSON.stringify({ temps: now.temps, upd: now.upd }) + ' ' + now.txt.slice(0, 300));
  const win = /Chance of rain (\d\d):(\d\d)[–-](\d\d):(\d\d) PKT/.exec(now.txt); const nowPkt = new Date(Date.now() + 5 * 3600e3), hm = nowPkt.getUTCHours() * 60 + nowPkt.getUTCMinutes();
  const endM = win ? ((+win[3] * 60 + +win[4]) || 1440) : null, startM = win ? +win[1] * 60 + +win[2] : null;
  ok(!win || (endM > hm || startM > hm || (startM > endM)), 'B1 the chance of rain is for the current or next window, never one already past', win ? win[0] + ' at ' + nowPkt.toISOString().slice(11, 16) + ' PKT' : 'no window shown');
  /* every tab of the panel */
  const bad = [];
  for (const t of ['now', 'fc', 'hz', 'place', 'p30', 'rep']) { await o.pg.evaluate((k) => window.AGNSTART.goTab(k), t); await o.pg.waitForTimeout(t === 'rep' ? 5000 : 1500);
    /* the report's own documentation (#repLimits limitations, #repTypes sources and product types, #repHowTo how to use these figures: part of the report by design) keeps its words; every other text of the tab is a client screen */
    const txt = await o.pg.evaluate((k) => { const p = document.getElementById('pane_' + k); if (!p) return ''; const c = p.cloneNode(true); c.querySelectorAll('#repLimits, #repTypes, #repHowTo, #repHowTable, #repGateAsOf').forEach((x) => x.remove()); document.body.appendChild(c); c.style.position = 'absolute'; c.style.left = '-99999px'; const t = c.innerText; c.remove(); return t; }, t);
    const full = await o.pg.evaluate((k) => (document.getElementById('pane_' + k) || {}).innerText || '', t);
    for (const [nm, re] of [['coordinates', COORD_RE], ['code text', CODE_RE], ['agency name', AGENCY_RE], ['run id', RUNID_RE]]) { const m = re.exec(full); if (m) bad.push(t + ' (whole pane): ' + nm + ': ' + full.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, ' ')); }
    for (const [nm, re] of [['coordinates', COORD_RE], ['method words', METHOD_RE], ['code text', CODE_RE], ['agency name', AGENCY_RE], ['run id', RUNID_RE], ['station distance', /\b\d+(?:\.\d)? km \((?:MACH|AGN)|Nearest AGN station/]]) { const m = re.exec(txt); if (m) bad.push(t + ': ' + nm + ': ' + txt.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, ' ')); } }
  ok(bad.length === 0, 'B1 every tab of the place panel: no coordinates, method words, code text, agency names, run ids or station distances', bad.slice(0, 12).join(' || '));
  const pc = await o.pg.evaluate(() => { const e = document.getElementById('pcSec'); return e ? e.innerText : ''; });
  ok(/At this point · Today/i.test(pc) && /(hazards? at Moderate or above at this point today|No counted hazard is assessed at this point today)/i.test(pc), 'A4 the place panel shows the point\'s count for the slider\'s day', pc.slice(0, 200));
  await o.pg.evaluate(() => window.AGNSTART.goTab('now'));
  await o.pg.waitForTimeout(60000); s = await S(o.pg);
  ok(s.view === 'card' && s.card && s.place && p0 && s.place.lat === p0.lat && s.place.lon === p0.lon, 'A5 the place is kept 60 s (no reset to the Pakistan view)', JSON.stringify(s));
  ok(o.errs.length === 0, 'no page errors (search, tabs)', o.errs.join(' | ')); await o.ctx.close(); }
/* ---------- B4 the location race ---------- */
{ const init = () => { const fake = { getCurrentPosition: (ok) => { setTimeout(() => ok({ coords: { latitude: 24.86, longitude: 67.01, accuracy: 20 } }), 6000); }, watchPosition: () => 0, clearWatch: () => {} };
    try { Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true }); } catch (_) {} };
  const o = await open('/', { init }); await o.pg.waitForTimeout(5000);
  await o.pg.click('#myLoc'); await o.pg.waitForTimeout(800);
  await o.pg.fill('#q', 'Multan'); await o.pg.waitForSelector('#sr button[data-ac]', { timeout: 30000 }).catch(() => {}); await o.pg.keyboard.press('ArrowDown'); await o.pg.keyboard.press('Enter');
  await o.pg.waitForTimeout(9000); let s = await S(o.pg);
  ok(s.place && /Multan/i.test(s.place.name || '') && Math.abs(s.place.lat - 24.86) > 1, 'B4 a late browser position does not replace the place searched meanwhile', JSON.stringify(s.place));
  await o.pg.click('#home').catch(() => {}); await o.pg.waitForTimeout(1500);
  await o.pg.click('#myLoc'); await o.pg.waitForTimeout(800); await clickAt(o.pg, 30.2, 71.5); await o.pg.waitForTimeout(9000); s = await S(o.pg);
  ok(!s.place && s.view === 'start', 'B4 a click on the map cancels a pending browser position (no jump to it)', JSON.stringify(s));
  await o.ctx.close(); }
/* ---------- M mobile ---------- */
{ const o = await open('/', { vp: { width: 390, height: 844 }, mobile: true }); await o.pg.waitForTimeout(9000);
  const w0 = await o.pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  ok(w0.sw <= w0.iw + 1, 'M no horizontal scroll on a phone (Pakistan view)', JSON.stringify(w0));
  await o.pg.screenshot({ path: join(SHOTS, 'start37_mobile.png') });
  await o.pg.evaluate(() => window.map.setView([30.2, 71.5], 6, { animate: false })); await o.pg.waitForTimeout(800);
  await clickAt(o.pg, 30.2, 71.5); await o.pg.waitForFunction(() => window.AGNSTART.nat.B, null, { timeout: 90000 }).catch(() => {}); await o.pg.waitForTimeout(1500);
  const r = await o.pg.evaluate(() => { const p = document.getElementById('nvPanel').getBoundingClientRect(); return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, ih: innerHeight, iw: innerWidth, sw: document.documentElement.scrollWidth }; });
  ok(r.top >= 0 && r.top < r.ih && r.left >= 0 && r.right <= r.iw + 1 && r.sw <= r.iw + 1, 'M the bottom panel fits the phone screen (stacked, scrollable)', JSON.stringify(r));
  await o.pg.screenshot({ path: join(SHOTS, 'start37_mobile_click.png') });
  await o.pg.click('#nvMore'); await o.pg.waitForTimeout(8000);
  const c = await o.pg.evaluate(() => { const e = document.getElementById('card').getBoundingClientRect(); return { w: e.width, iw: innerWidth, dark: document.body.classList.contains('agn-dark') }; });
  ok(c.w >= c.iw - 1 && !c.dark, 'M the place panel takes the phone width on the light map', JSON.stringify(c));
  await o.pg.screenshot({ path: join(SHOTS, 'start37_mobile_place.png') });
  ok(o.errs.length === 0, 'M no page errors on a phone', o.errs.join(' | ')); await o.ctx.close(); }
await br.close(); done();
