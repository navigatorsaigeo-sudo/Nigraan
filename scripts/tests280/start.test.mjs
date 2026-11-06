import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.280 · NEWPAGE · the customer start page at / (search-first): routes (the console at /analyst, operator mode as before), search by
// place name, tehsil name and "lat, lon", outside Pakistan refused in plain words, "Use my location", a map click is a search, one pin only,
// the site card's fields equal the server's answers (point forecast, tehsil levels, product type, nearest station, actions), hazards above
// Normal shown large and the rest counted, "Not yet issued" days, a stale run shows no current level and says when it ran (PKT), no code
// words / NaN / null, My sites from the casebook store with pins coloured by the worst level of the next 4 days, the Analyst view link and the
// card's buttons open the console at that place, hazard layers off by default, 0 page / console / CSP errors at 1366 and 1920.
// Fresh hazard levels are a test fixture laid over the server's own answer in the browser (the test server's engine run is days old), marked
// FIXTURE in the test names. Browser test (playwright). usage: node scripts/tests280/start.test.mjs <base url> [outdir for screenshots]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* v91.17.283.12: the point state in the shape the drawer reads (its area on the point) */
const psf = (x) => (x && x.ok ? { ...x, point: { ...x.point, tehsil: x.area.tehsil, district: x.area.district, province: x.area.province } } : x);
const nearOf = (B) => ({ station: B && B.station && B.station.ok ? { name: B.station.name, tempC: B.station.reading && B.station.reading.tempC, km: B.station.km } : null });   /* v283.19: the bundle's ONE station (/api/fleet/nearest is retired) */
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:9041', OUT = process.argv[3] || null;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 900) : '')); } };
const BENIGN = /Failed to load resource/;
const CODE = /\bnull\b|\bundefined\b|NaN|\[object|rain_hz|flood_pluvial|flood_riverine|nss_|unitId|\buid\b|gate-\d|gateTag|productType|statusNote|\bscore\b|-0\.0\b/;
const COL = ['#BFD6B4', '#E8D48A', '#E6B655', '#E39A3B', '#C8553D'];
const todayIso = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const plus = (n) => new Date(Date.parse(todayIso() + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const j = async (p) => (await fetch(BASE + p, { headers: { 'x-agn-view': 'customer' } })).json();

/* ---------- R · routes ---------- */
{ const g = (p) => fetch(BASE + p, { redirect: 'manual' });
  const r = await g('/'); const t = await r.text(); const mf = JSON.parse(readFileSync(join(ROOT, 'artefact', 'MANIFEST.json'), 'utf8'));
  const sha = createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');
  ok(r.status === 200 && /data-agn-page="start"/.test(t) && mf['NIGRAAN_START.html'] && mf['NIGRAAN_START.html'].sha256 === sha, 'R1 / serves the start page byte for byte (MANIFEST sha256)', r.status + ' ' + sha.slice(0, 12));
  ok(/<meta content="[^"]*script-src 'self'( 'sha256-[^']+')+;[^"]*style-src 'self'( 'sha256-[^']+')+/.test(t) && !/<script[^>]+src="https?:/.test(t), 'R2 CSP sealed (script and style hashes), no outside script');
  const a = await g('/analyst'); ok(a.status === 302 && /^(http[^?]+)?\/analyst\?backend=/.test(a.headers.get('location') || ''), 'R3 /analyst gets the console first-load redirect', a.status + ' ' + a.headers.get('location'));
  const at = await (await fetch(BASE + '/analyst?backend=x')).text(); ok(/agn-security-profile="client-hashed"/.test(at) && /Analyst view/.test(at) && /href="\/"/.test(at), 'R4 /analyst is the console, its page switch names Start and Analyst view');
  const o = await g('/?operator=1'); ok(o.status === 302 && /\/\?backend=.*operator=1/.test(o.headers.get('location') || ''), 'R5 /?operator=1 still opens the console (operator mode unchanged)', o.headers.get('location'));
  const e = await g('/?engine=1'); ok(e.status === 302 && /engine=1/.test(e.headers.get('location') || ''), 'R6 /?engine=1 (browser engine runner) still opens the console');
  const c = await g('/classic'), cu = await g('/customize'), nx = await g('/next');
  ok(c.status === 302 && cu.status === 200 && nx.status === 302, 'R7 /classic, /customize and /next answer as before', [c.status, cu.status, nx.status].join(' '));
}

async function open(w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(opts.geo ? { geolocation: opts.geo, permissions: ['geolocation'] } : {}) });
  const page = await ctx.newPage(); const E = { page: [], console: [] };
  page.on('pageerror', (e) => E.page.push(String(e.message || e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.test(m.text())) E.console.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); }); });
  if (opts.fixture) await fixture(page, opts.fixture);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.AGNSTART && window.map && window.L, null, { timeout: 60000 }); await page.waitForTimeout(800);
  return { ctx, page, E };
}
/* FIXTURE: fresh levels laid over the server's answer (dates moved to today..+3, not stale); the fixture's levels by hazard per day */
const FIX = { heat: [1, 2, 1, 0], cold: [0, 0, 0, 0], rain_hz: [0, 0, 0, null], flood: [0, 0, 0, 0], wind: [-1, -1, -1, -1], landslide: [1, 1, 1, 1], glof: [-2, -2, -2, -2], drought: [0, 0, 0, 0] };
async function fixture(page, F) {
  await page.route('**/api/levels/unit?**', async (route) => { const r = await route.fetch(); const J = await r.json();
    if (Array.isArray(J.days)) { J.stale = false; J.at = new Date(Date.now() - 20 * 60e3).toISOString();
      J.days = [0, 1, 2, 3].map((i) => { const d = J.days[i] || J.days[0]; const L = {}; for (const [k, v] of Object.entries(F)) { if (v[i] == null) continue; L[k] = { name: (d.layers[k] || {}).name || k, level: v[i], word: v[i] >= 0 ? ['Normal', 'Low', 'Moderate', 'High', 'Severe'][v[i]] : v[i] === -2 ? 'not applicable' : 'no data' }; } return { day: i, date: plus(i), layers: L }; }); }
    await route.fulfill({ response: r, json: J }); });
  await page.route('**/api/levels?layer=heat&day=1', async (route) => { const r = await route.fetch(); const J = await r.json();
    if (J.levels) { J.stale = false; J.at = new Date(Date.now() - 20 * 60e3).toISOString(); J.date = plus(1); let i = 0; for (const k of Object.keys(J.levels)) J.levels[k] = (i++) % 4; }
    await route.fulfill({ response: r, json: J }); });
}
/* a search is done when the page has started a new selection, or answered with a message */
const search = async (page, q) => { const s0 = await page.evaluate(() => window.AGNSTART.seq); await page.fill('#q', q); await page.click('#go');
  await page.waitForFunction((s0) => window.AGNSTART.seq > s0 || !document.querySelector('#sr').hidden && !/Searching/.test(document.querySelector('#sr').textContent) || !document.querySelector('#msgBar').hidden, s0, { timeout: 60000 }).catch(() => {}); };
const waitCard = (page) => page.waitForFunction(() => { const S = window.AGNSTART; return document.querySelector('#card[data-ready]') && document.querySelector('#nowT') && document.querySelector('#hzSec') && S.data && S.data.place === S.place; }, null, { timeout: 90000 }).then(() => true, () => false);
const st = (page) => page.evaluate(() => { const S = window.AGNSTART, p = S.place; return { place: p && { lat: p.lat, lon: p.lon, name: p.name }, pins: S.pinCount(), view: S.view,
  card: (document.querySelector('#card') || {}).innerText || '', cardHidden: document.querySelector('#card').hidden, msg: document.querySelector('#msgBar').hidden ? '' : document.querySelector('#msgText').textContent,
  sr: document.querySelector('#sr').hidden ? '' : document.querySelector('#sr').innerText }; });

for (const [w, h] of [[1366, 768], [1920, 1080]]) {
  const V = w + ' '; const { ctx, page, E } = await open(w, h);
  /* S0 · the start: clean map, hazard layers off */
  const s0 = await page.evaluate(() => { let n = 0; map.eachLayer((l) => { if (l instanceof L.GeoJSON) n++; }); return { geo: n, hz: document.querySelector('#hzBtnTxt').textContent, hero: !document.querySelector('#hero').hidden && getComputedStyle(document.querySelector('#hero')).display !== 'none', an: document.querySelector('#btnAnalyst').getAttribute('href') }; });
  ok(s0.geo === 0 && s0.hz === 'Hazard layers · off' && s0.hero && s0.an === '/analyst', V + 'S0 start: search card, hazard layers off (no tehsil fill), Analyst view button', JSON.stringify(s0));
  if (OUT) await page.screenshot({ path: OUT + '/start_' + w + '.png' });
  /* S1 · place name */
  await search(page, 'G-8, Islamabad'); const c1 = await waitCard(page); await page.waitForTimeout(1500); const s1 = await st(page);
  const want = await j('/api/geo/search?q=' + encodeURIComponent('G-8, Islamabad') + '&limit=8'); const w0 = want.results[0];
  ok(c1 && s1.place && Math.abs(s1.place.lat - w0.lat) < 1e-6 && Math.abs(s1.place.lon - w0.lon) < 1e-6 && s1.pins === 1, V + 'S1 search by name: one pin at the searched point', JSON.stringify([s1.place, s1.pins, w0.lat, w0.lon]));
  ok(/^G-8\b/.test(s1.card), V + 'S2 the card is named for the searched place (v283.19: the record\'s name, the one label)', s1.card.slice(0, 40));
  /* S3 · card fields equal the server's answers */
  const q = 'lat=' + s1.place.lat.toFixed(5) + '&lon=' + s1.place.lon.toFixed(5);
  /* v91.17.283.12: the drawer reads the point state (/api/pointstate); its area is the point's tehsil, district and province */
  const pf = psf(await j('/api/point?' + q)), uid = pf.point.province + '|' + pf.point.district + '|' + pf.point.tehsil, lu = await j('/api/levels/unit?unit=' + encodeURIComponent(uid)), fl = nearOf(pf), cx = await j('/api/report/context?' + q);
  const card = await page.evaluate(() => ({ sub: document.querySelector('#cSub').textContent, t: document.querySelector('#nowT').textContent, box: document.querySelector('#nowBox').innerText, line: document.querySelector('#nowLine').textContent + ' ' + ((document.querySelector('#stLine') || {}).textContent || ''),
    days: [...document.querySelectorAll('#n3Sec .days3>div')].map((d) => ({ date: d.getAttribute('data-date'), tt: d.querySelector('.tt') && d.querySelector('.tt').textContent, ds: d.querySelector('.ds').textContent })),
    todo: [...document.querySelectorAll('#todoSec li')].map((l) => l.firstChild.textContent), hz: document.querySelector('#hzSec').innerText, btns: [...document.querySelectorAll('#repBar .btns>*')].map((b) => b.textContent) }));
  const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1), r0 = (x) => String(Math.round(x));
  ok(card.sub.includes(pf.point.district) && !/tehsil/i.test(card.sub) && card.sub.includes(pf.point.province) && card.sub.includes(Math.round(pf.point.elevM) + ' m') && card.sub.includes(s1.place.lat.toFixed(2) + ', ' + s1.place.lon.toFixed(2)), V + 'S3 name line (MAP2802: district, no tehsil wording): district, province, height and coordinates of the point forecast', card.sub);
  ok(card.t === String(Math.round(pf.now.tempC * 10) / 10) + '°C' &&   /* the one print rule for now (0.1 C, a trailing .0 dropped) */ card.box.includes('Feels like (apparent temperature) ' + r0(pf.now.feelsC) + ' °C')   /* FIX2821 F: the exact name */ && card.box.includes('humidity ' + r0(pf.now.rh) + ' %') && card.box.includes('Wind ' + r0(pf.now.windKmh) + ' km/h') && card.box.includes('today ' + r0(pf.days[0].tminC) + '–' + r0(pf.days[0].tmaxC) + ' °C'), V + 'S4 now: temperature, feels, humidity, wind, today range equal the point state', card.t + ' | ' + card.box.replace(/\n/g, ' '));
  ok(card.line.startsWith('Now, ' + pf.now.time.slice(11, 16) + ' PKT') && (fl.station && fl.station.tempC != null ? card.line.includes(fl.station.name) && card.line.includes(r1(fl.station.tempC) + ' °C') : /no AGN station reading within (15|25) km/.test(card.line)), V + 'S5 time in PKT and the nearest AGN station as /api/fleet/nearest says', card.line + ' | station ' + JSON.stringify(fl.station && fl.station.name));
  ok(card.days.length === 3 && card.days.every((d, i) => d.date === pf.days[i + 1].date && d.tt === r0(pf.days[i + 1].tmaxC) + '° ' + r0(pf.days[i + 1].tminC) + '°'), V + 'S6 next 3 days: dates, max and min equal the point forecast', JSON.stringify(card.days));
  const acts = [...(cx.actions || []).map((a) => a.action || (a.actions || [])[0]).filter(Boolean), ...(cx.standing || []).map((s) => s.measure)].slice(0, 3);
  ok(JSON.stringify(card.todo) === JSON.stringify(acts) && (acts.length ? card.todo.length >= 1 : /No action is raised/.test(await page.evaluate(() => document.querySelector('#todoSec').innerText))), V + 'S7 what to do: the first 2-3 actions of /api/report/context (forecast actions, then standing measures), none invented', JSON.stringify(card.todo).slice(0, 300));
  ok(JSON.stringify(card.btns) === JSON.stringify(['Build the site report', 'Share link', 'Save site']) && await page.evaluate(() => !!document.querySelector('#bFull') && !!document.querySelector('#bSave')), V + 'S8 (START282: the report is built in the drawer) Build the site report, Share link, Save site; Full forecast below', JSON.stringify(card.btns));
  if (lu.stale) { const p = new Date(Date.parse(lu.at) + 5 * 3600e3).toISOString().slice(11, 16);
    ok(/is out of date, so no current level is shown/.test(card.hz) && card.hz.includes(p + ' PKT') && !/Normal|Low|Moderate|High|Severe/.test(card.hz.replace(/HAZARDS[^\n]*/i, '')), V + 'S9 the server run is stale: no current level, the run time in PKT (the one stale rule)', card.hz.replace(/\n/g, ' | ')); }
  else ok(true, V + 'S9 the server run is current (the stale case is not on this server)');
  const txt1 = await page.evaluate(() => document.body.innerText); ok(!CODE.test(txt1) && !/\bUTC\b|T\d\d:\d\dZ/.test(txt1), V + 'S10 no code words, NaN, null or UTC times', (txt1.match(CODE) || txt1.match(/\bUTC\b|T\d\d:\d\dZ/) || [''])[0]);
  if (OUT) await page.screenshot({ path: OUT + '/card_' + w + '.png' });
  /* S11 · START282 · the drawer's tabs (one drawer, coloured tabs; the former expanded view is the tab panes) */
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.tab')].map((t) => t.textContent));
  ok(JSON.stringify(tabs) === JSON.stringify(['Now', 'Forecast', 'Hazards', 'This place', 'Past 30 days', 'Report']), V + 'S11 drawer tabs (START282)', JSON.stringify(tabs));
  await page.click('.tab[data-t="p30"]'); await page.waitForFunction(() => document.querySelector('#p30Table') || /not available/.test(document.querySelector('#pane_p30').innerText), null, { timeout: 60000 }).catch(() => {});
  const p30 = await j('/api/report/past30?' + q); const rows = await page.evaluate(() => [...document.querySelectorAll('#p30Table tbody tr')].map((r) => [...r.children].slice(1, 4).map((c) => c.textContent)));
  const want30 = p30.daily.slice().reverse().map((r) => [r.tmaxC == null ? '–' : r1(r.tmaxC), r.tminC == null ? '–' : r1(r.tminC), r.rainMm == null ? '–' : r1(r.rainMm)]);
  ok(rows.length === p30.daily.length && JSON.stringify(rows) === JSON.stringify(want30), V + 'S12 past 30 days equal /api/report/past30', rows.length + ' rows');
  const wt = []; for (const t of ['now', 'fc', 'hz', 'place', 'p30', 'rep']) { await page.click('.tab[data-t="' + t + '"]'); await page.waitForTimeout(t === 'p30' || t === 'rep' ? 1200 : 400); wt.push(await page.evaluate((t) => document.querySelector('#pane_' + t).innerText, t)); if (OUT && w === 1366) await page.screenshot({ path: OUT + '/tab_' + t + '_' + w + '.png' }); }
  ok(wt.every((x) => x.length > 20 && !CODE.test(x)), V + 'S13 every tab has content, no code words / NaN / null', wt.map((x) => (x.match(CODE) || [''])[0]).join('|'));
  await page.click('.tab[data-t="now"]'); await page.waitForTimeout(300);
  /* S14 · lat, lon typed */
  await search(page, '31.52, 74.36'); await waitCard(page); await page.waitForTimeout(1200); const s2 = await st(page); const pf2 = psf(await j('/api/point?lat=31.52000&lon=74.36000'));
  ok(s2.place && s2.place.lat === 31.52 && s2.place.lon === 74.36 && s2.pins === 1 && s2.card.includes(pf2.point.district) && !/tehsil/i.test(s2.card), V + 'S14 "31.52, 74.36": the pin at that point, its district from the point forecast (MAP2802: no tehsil wording)', JSON.stringify([s2.place, pf2.point.district]));
  /* S15 · outside Pakistan */
  await search(page, '51.5, -0.12'); await page.waitForTimeout(600); const s3 = await st(page);
  ok(/outside Pakistan/.test(s3.sr) && s3.pins <= 1 && !(s3.place && s3.place.lat === 51.5), V + 'S15 "51.5, -0.12": outside Pakistan, said in plain words, no pin there (the place before stays)', s3.sr);
  await search(page, '74.36, 31.52'); await page.waitForTimeout(400); const s3b = await st(page); ok(/Did you mean 31\.52, 74\.36/.test(s3b.sr), V + 'S16 lat and lon swapped: the message offers the other order', s3b.sr);
  for (const [qq, nm] of [['34.53, 69.17', 'Kabul'], ['28.61, 77.21', 'Delhi']]) { await search(page, qq); await page.waitForTimeout(4000); const s3c = await st(page);
    ok(/outside Pakistan/.test(s3c.msg) && s3c.pins === 0 && !s3c.place, V + 'S17 a point near Pakistan but outside (' + nm + '): the server\'s answer, no pin', s3c.msg); }
  await search(page, 'abc, def'); await page.waitForTimeout(2500); const s3d = await st(page); ok(/No place in Pakistan matches|lat, lon/.test(s3d.sr) && s3d.pins === 0, V + 'S18 nonsense: a plain message, no pin', s3d.sr);
  /* S19 · tehsil name */
  await search(page, 'Lahore'); await page.waitForTimeout(2500); const list = await page.evaluate(() => [...document.querySelectorAll('#sr button[data-i]')].map((b) => b.innerText.replace(/\n/g, ' / ')));
  const ti = list.findIndex((x) => /^Lahore Cantt tehsil/.test(x)); ok(ti >= 0, V + 'S19 an ambiguous name lists the matches, tehsils among them', JSON.stringify(list));
  if (ti >= 0) { await page.click('#sr button[data-i="' + ti + '"]'); await waitCard(page); await page.waitForTimeout(1200); const s4 = await st(page); ok(/Lahore Cantt tehsil/.test(s4.card) && s4.pins === 1, V + 'S20 a tehsil picked: its card, one pin', s4.card.slice(0, 80)); }
  /* S21 · map click = search */
  const pt = await page.evaluate(() => { map.setView([33.60, 73.10], 11, { animate: false }); const c = map.getContainer().getBoundingClientRect(); return [Math.round(c.left + c.width * 0.3), Math.round(c.top + c.height * 0.55)]; });   /* START282 · the drawer covers the right: click the free map */
  await page.waitForTimeout(600); const ll = await page.evaluate((p) => { const c = map.getContainer().getBoundingClientRect(); const x = map.containerPointToLatLng([p[0] - c.left, p[1] - c.top]); return [x.lat, x.lng]; }, pt);
  await page.mouse.click(pt[0], pt[1]); await waitCard(page); await page.waitForTimeout(1500); const s5 = await st(page);
  ok(s5.place && Math.abs(s5.place.lat - ll[0]) < 1e-5 && Math.abs(s5.place.lon - ll[1]) < 1e-5 && s5.pins === 1 && s5.place.name && !/null/.test(s5.place.name), V + 'S21 a map click is a search: one pin at the clicked point, a name for it', JSON.stringify([s5.place, s5.pins]));
  await search(page, 'Murree'); await waitCard(page); await page.waitForTimeout(800); const s6 = await st(page); ok(s6.pins === 1, V + 'S22 after four searches and a click: one pin', s6.pins);
  /* S23 · save site and My sites */
  await page.click('#bSave'); await page.waitForFunction(() => /Saved to My sites|Already in My sites/.test(document.querySelector('#saveStatus').textContent), null, { timeout: 30000 }).catch(() => {});
  const sv = await page.evaluate(() => document.querySelector('#saveStatus').textContent); const prj = await j('/api/case/project?id=my-sites');
  const a0 = prj.document && prj.document.assets.find((a) => a.name === s6.place.name);
  ok(/Saved to My sites|Already in My sites/.test(sv) && a0 && Math.abs(a0.latitude - s6.place.lat) < 1e-4, V + 'S23 Save site writes the site to the casebook store (project my-sites)', sv + ' · ' + JSON.stringify(a0 && [a0.name, a0.latitude, a0.longitude]));
  await page.click('#btnSaved'); await page.waitForFunction(() => document.querySelector('#sitesH'), null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(1000);
  const sv2 = await page.evaluate(() => ({ h: document.querySelector('#sitesH').textContent, rows: [...document.querySelectorAll('.srow')].map((r) => r.innerText.replace(/\n/g, ' / ')), pf: document.querySelector('#bPortfolio').getAttribute('href'), pins: (() => { let n = 0; map.eachLayer((l) => { if (l instanceof L.CircleMarker) n++; }); return n; })(), txt: document.querySelector('#saved').innerText }));
  ok(sv2.h === 'My sites · ' + prj.document.assets.length && sv2.rows.length === prj.document.assets.length && sv2.pins === prj.document.assets.length && sv2.rows.some((r) => r.startsWith(s6.place.name)), V + 'S24 My sites: every saved site listed and pinned', JSON.stringify(sv2.rows).slice(0, 300));
  ok(sv2.pf === '/analyst#agnproject=my-sites&agnview=assessments' && !CODE.test(sv2.txt), V + 'S25 My sites links to the portfolio view in /analyst; plain text', sv2.pf);
  if (OUT) await page.screenshot({ path: OUT + '/saved_' + w + '.png' });
  await page.click('#btnSaved'); await page.waitForTimeout(400);
  /* S26 · hazard layers on the stale server: no fill, says why */
  await page.click('#hzBtn'); await page.click('#hzOpts button[data-k="heat"]'); await page.waitForFunction(() => !/Loading/.test(document.querySelector('#hzNote').textContent), null, { timeout: 60000 }).catch(() => {});
  const hz = await page.evaluate(() => ({ note: document.querySelector('#hzNote').textContent, btn: document.querySelector('#hzBtnTxt').textContent, geo: (() => { let n = 0; map.eachLayer((l) => { if (l instanceof L.GeoJSON) n++; }); return n; })() }));
  const lvh = await j('/api/levels?layer=heat&day=0'); ok(hz.btn === 'Hazard layers · Heat stress' && (lvh.stale ? /out of date/.test(hz.note) && hz.geo === 1 && /Not assessed/.test(await page.textContent('#hzChip')) : hz.geo === 1)   /* FIX2821 A: an out-of-date run is drawn hatched "Not assessed", never as current */, V + 'S26 Hazard layers: one button turns on a hazard; a stale run is not drawn as current', JSON.stringify(hz));
  await page.click('#hzOpts button[data-k=""]'); await page.waitForTimeout(300);
  const csp = await page.evaluate(() => (window.__csp || []).slice(0, 5));
  ok(!E.page.length && !E.console.length && !csp.length, V + 'S27 0 page / console / CSP errors', JSON.stringify({ page: E.page.slice(0, 3), console: E.console.slice(0, 3), csp }));
  await ctx.close();
}

/* F · FIXTURE: fresh levels (the server's answer with the dates moved to today and levels set), hazards above Normal and product tags */
{ const { ctx, page, E } = await open(1366, 768, { fixture: FIX });
  await search(page, 'G-8, Islamabad'); await waitCard(page); await page.waitForTimeout(1500);
  const f = await page.evaluate(() => ({ big: [...document.querySelectorAll('#hzSec .hz')].map((x) => ({ k: x.getAttribute('data-hz'), lvl: x.querySelector('.lvl').textContent, why: x.querySelector('.why').textContent, tag: x.querySelector('.tag').textContent })),
    others: (document.querySelector('#hzOthers') || {}).textContent || '', none: (document.querySelector('#hzNoLevel') || {}).textContent || '', days: [...document.querySelectorAll('#n3Sec .ds')].map((d) => d.textContent), hz: document.querySelector('#hzSec').innerText }));
  ok(f.big.map((x) => x.k).join() === 'heat,landslide' && f.big[0].lvl === 'Moderate' && f.big[1].lvl === 'Low', 'F1 FIXTURE hazards above Normal shown large, highest first (heat Moderate, landslide Low)', JSON.stringify(f.big.map((x) => [x.k, x.lvl])));
  ok(f.others === 'Assessed Normal (4) ›' && /Not assessed: Wind and gusts \(no data\)\. Does not occur here: GLOF\./.test(f.none)   /* FIX2821 A: wind has no data, so not "all other Normal" */, 'F2 FIXTURE the rest counted: Normal (4) = cold, heavy rain, flood, drought; those without a level named', f.others + ' | ' + f.none);
  ok(/surrounding area, \w{3} \d+/.test(f.big[0].why) && /UTCI \(thermal stress index\) in shade up to -?\d+ °C at this site/.test(f.big[0].why) && /Low for the surrounding area, \w{3} \d+ to \w{3} \d+\./.test(f.big[1].why), 'F3 FIXTURE one-line reasons: the point forecast number at this site and the level for the surrounding area with its days (MAP2802 wording)', f.big.map((x) => x.why).join(' | '));
  const types = {}; for (const k of ['heat', 'landslide']) types[k] = (await j('/api/levels?layer=' + k + '&day=0')).gateTag.productType;
  ok(f.big.every((x) => x.tag.startsWith(types[x.k] + ' · Level for the surrounding area (')   /* FIX2821 F: named support */), 'F4 FIXTURE product tags from the model gate (one field), each labelled surrounding area (MAP2802)', JSON.stringify(f.big.map((x) => x.tag)) + ' want ' + JSON.stringify(types));
  ok(/Heat stress Moderate/.test(f.days[0]) && /Heat stress Low · Landslide Low/.test(f.days[1]) && /Landslide Low/.test(f.days[2]), 'F5 FIXTURE next 3 days carry each day\'s levels', JSON.stringify(f.days));
  await page.click('.tab[data-t="hz"]'); await page.waitForTimeout(500); await page.click('#hzOthers'); await page.waitForTimeout(500);   /* START282 · the hazards are a tab of the drawer */
  /* v91.17.283.6 item 1: the evidence tag moved from a 6th column to under the hazard name (.hzev) so the four days fit the drawer; it is
     read from there into the same position r[5], so F6 / F7 check exactly what they checked before */
  const t = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#hzTable tbody tr')].map((r) => [r.getAttribute('data-hz'), ...[...r.children].slice(1).map((c) => c.textContent), ((r.querySelector('.hzev') || {}).textContent) || '']), head: [...document.querySelectorAll('#hzTable th')].map((x) => x.textContent) }));
  const rain = t.rows.find((r) => r[0] === 'rain_hz'), glof = t.rows.find((r) => r[0] === 'glof'), heat = t.rows.find((r) => r[0] === 'heat');
  ok(rain && rain[4] === 'Not yet issued' && rain[1] === 'Normal' && glof[1] === 'Does not occur' && heat.slice(1, 5).join() === 'Low,Moderate,Low,Normal', 'F6 FIXTURE All hazards table: "Not yet issued" for a day the run has not issued, "Does not occur", the levels by day', JSON.stringify([rain, glof, heat]));
  const tags = t.rows.map((r) => r[5]); const want = {}; for (const k of t.rows.map((r) => r[0])) want[k] = (await j('/api/levels?layer=' + k + '&day=0')).gateTag.productType;
  ok(t.rows.every((r) => r[5].startsWith(want[r[0]] + ' · Level for the surrounding area (')), 'F7 FIXTURE every hazard row has its product tag from the model gate', JSON.stringify(tags));
  if (OUT) await page.screenshot({ path: OUT + '/fixture_allhazards_1366.png' });
  await page.click('.tab[data-t="now"]'); await page.waitForTimeout(300); if (OUT) await page.screenshot({ path: OUT + '/fixture_card_1366.png' });
  /* hazard layer with fresh levels: the tehsil fill draws, day +1 */
  await page.click('#hzBtn'); await page.click('#hzDays button[data-d="1"]'); await page.click('#hzOpts button[data-k="heat"]'); await page.waitForTimeout(4000);
  const g = await page.evaluate(() => { let n = 0, fills = new Set(); map.eachLayer((l) => { if (l instanceof L.GeoJSON) { n++; l.eachLayer((p) => fills.add(p.options.fillColor)); } }); return { n, fills: [...fills], note: document.querySelector('#hzNote').textContent }; });
  ok(g.n === 1 && ['#E8D48A', '#E6B655', '#E39A3B'].every((c) => g.fills.includes(c)) && !g.fills.includes('#BFD6B4') && /by area/.test(g.note) && /PKT/.test(g.note), 'F8 FIXTURE Hazard layers: the fill for the chosen hazard and day, Low and above coloured by level, Normal not filled (MAP2802), noted by area with its time', JSON.stringify(g));
  if (OUT) await page.screenshot({ path: OUT + '/fixture_hazardlayer_1366.png' });
  await page.click('#hzOpts button[data-k=""]'); await page.waitForTimeout(300);
  /* My sites with fresh levels: pin colour = the worst level of the next 4 days */
  await page.click('#btnSaved'); await page.waitForFunction(() => document.querySelector('#sitesH'), null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(1500);
  const ms = await page.evaluate(() => ({ rows: [...document.querySelectorAll('.srow')].map((r) => ({ lvl: r.querySelector('.lvl').textContent, why: r.querySelector('.why').textContent })), pins: (() => { const c = []; map.eachLayer((l) => { if (l instanceof L.CircleMarker) c.push(l.options.fillColor); }); return c; })(), attn: (document.querySelector('#attn') || {}).innerText }));
  ok(ms.rows.length > 0 && ms.rows.every((r) => r.lvl === 'Moderate' && /Heat stress Moderate/.test(r.why)) && ms.pins.every((c) => c === COL[2]) && /(has|have) a hazard above Normal/.test(ms.attn), 'F9 FIXTURE My sites: pins and list coloured by the worst level of the next 4 days, with the reason', JSON.stringify(ms).slice(0, 400));
  if (OUT) await page.screenshot({ path: OUT + '/fixture_saved_1366.png' });
  ok(!E.page.length && !E.console.length, 'F10 FIXTURE 0 page / console errors', JSON.stringify(E));
  await ctx.close();
}

/* G · Use my location */
{ const { ctx, page } = await open(1366, 768, { geo: { latitude: 31.5204, longitude: 74.3587 } });
  await page.click('#myLoc'); await waitCard(page); await page.waitForTimeout(1000); const s = await st(page);
  ok(s.place && Math.abs(s.place.lat - 31.5204) < 1e-6 && s.place.name === 'My location' && s.pins === 1 && /^My location/.test(s.card), 'G1 Use my location: one pin at the browser position, its card', JSON.stringify(s.place));
  await ctx.close(); }

/* A · the Analyst view link and the card buttons open the console at the place */
{ const { ctx, page, E } = await open(1366, 768);
  await search(page, 'G-8, Islamabad'); await waitCard(page);
  const hrefs = await page.evaluate(() => ({ an: document.querySelector('#btnAnalyst').getAttribute('href'), full: document.querySelector('#bFull').getAttribute('href'), rep: [...document.querySelectorAll('#card a')].filter((a) => /agnreport/.test(a.getAttribute('href') || '')).length }));
  ok(/^\/analyst#agnplace=33\.69421,73\.05242,G-8%2C%20Islamabad$/.test(hrefs.an) && /&agnview=livedata$/.test(hrefs.full) && hrefs.rep === 0, 'A1 Analyst view and Full forecast links carry the place; the site report is built in the drawer (START282: no /analyst report link)', JSON.stringify(hrefs));
  await page.click('#bFull'); await page.waitForFunction(() => window.AGN && AGN.flow && AGN.point && window.map, null, { timeout: 180000 });
  await page.waitForFunction(() => { const v = document.querySelector('.view.active'); return v && /livedata/.test(v.id); }, null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(4000);
  /* GEO281 · the console names the handed-over point by /api/geo/reverse after its own start-up point (33.6844, 73.0479); that point was
     itself called "G-8" by the old nearest-centroid rule, so A3 passed before the switch. Wait (up to 30 s) for the place's own name. */
  await page.waitForFunction(() => /G-8, Islamabad/.test((document.querySelector('.view.active') || {}).innerText || ''), null, { timeout: 30000 }).catch(() => {});
  const a = await page.evaluate(() => { const v = document.querySelector('.view.active'), s = AGN.point.state(); return { path: location.pathname, view: v && v.id, label: s && s.label, row: s && s.row && [s.row.lat, s.row.lon], fc: (document.querySelector('.view.active') || {}).innerText.slice(0, 400) }; });
  ok(a.path === '/analyst' && /livedata/.test(a.view || '') && a.label === 'G-8, Islamabad' && a.row && Math.abs(a.row[0] - 33.69421) < 1e-6, 'A2 Full forecast opens the console Forecast view at the place', JSON.stringify(a).slice(0, 300));
  ok(/G-8, Islamabad/.test(a.fc), 'A3 the Forecast view names the place', a.fc.slice(0, 120));
  ok(!E.page.length && !E.console.length, 'A4 0 page / console errors through the hand-over', JSON.stringify(E));
  await ctx.close(); }
{ const { ctx, page, E } = await open(1366, 768);
  await page.click('#btnSaved'); await page.waitForSelector('#bPortfolio', { timeout: 60000 }); await page.click('#bPortfolio');
  await page.waitForFunction(() => window.AGN && AGN.project && AGN.project.state && AGN.project.state().project_id === 'my-sites', null, { timeout: 180000 }).catch(() => {}); await page.waitForTimeout(3000);
  const p = await page.evaluate(() => { const s = AGN.project.state(), v = document.querySelector('.view.active'); return { id: s.project_id, n: (s.assets || []).length, view: v && v.id }; }); const prj = await j('/api/case/project?id=my-sites');
  ok(p.id === 'my-sites' && p.n === prj.document.assets.length && /assessments/.test(p.view || ''), 'A5 Portfolio view opens the console Assets view with My sites loaded', JSON.stringify(p));
  ok(!E.page.length && !E.console.length, 'A6 0 page / console errors', JSON.stringify(E));
  await ctx.close(); }
await browser.close();
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
