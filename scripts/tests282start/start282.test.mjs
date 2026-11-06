import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.282 · START282 · the customer start page: ONE right drawer (slides in, header with name + coloured temperature chip + close,
// collapse handle), six coloured tabs as a carousel (click, arrow keys, trackpad swipe, progress dots), each tab with real data from the
// served endpoints, the Report tab built in place (preview numbers = panel numbers, Short / Full, print-to-PDF A4 path, share link
// round-trip, never /analyst), the rivers layer (/n3/rivers.json present, drawn, animating, downstream = DEM high -> low for the Indus and
// the Jhelum read from data/feat/t_elev independently, reduced motion static), the national numbers, MACH 108 display name, 0 page /
// console / CSP errors, 0 requests to another origin, ASCII-only deploy scripts. VER282 (S61-S70): OSM river lines, Shyok, no Esri, sea green.
// usage: node scripts/tests282start/start282.test.mjs <base url>
import { readFileSync, existsSync, readdirSync, openSync, readSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
/* v91.17.283.12: the start page reads the point state (/api/pointstate); psf puts its area on the point as the drawer reads it; "now" is printed by the one rule (0.1 C, a trailing .0 dropped) */
const psf = (x) => (x && x.ok ? { ...x, point: { ...x.point, tehsil: x.area.tehsil, district: x.area.district, province: x.area.province } } : x);
const nearOf = (B) => ({ station: B && B.station && B.station.ok ? { name: B.station.name, tempC: B.station.reading && B.station.reading.tempC, km: B.station.km } : null });   /* v283.19: the bundle's ONE station (/api/fleet/nearest is retired) */
const fmtNow = (t) => String(Math.round(t * 10) / 10);

const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:9131';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d = '') => { d = String(d).replace(/\n/g, ' | '); if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d.slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d.slice(0, 900) : '')); } };
const BENIGN = /Failed to load resource/;   /* the cloud test server has no street archive: its raster fallback proxy answers 502 */
const j = async (p) => (await fetch(BASE + p, { headers: { 'x-agn-view': 'customer' } })).json();

async function open(w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' }); const page = await ctx.newPage(); const E = { page: [], console: [], ext: [] };
  page.on('pageerror', (e) => E.page.push(String(e.message || e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.test(m.text())) E.console.push(m.text().slice(0, 200)); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) E.ext.push(u.slice(0, 120)); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); }); window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  const t0 = Date.now(); await page.goto(BASE + (opts.path || '/'), { waitUntil: 'load' }); E.loadMs = Date.now() - t0;
  await page.waitForFunction(() => window.AGNSTART && window.map, null, { timeout: 30000 });
  return { ctx, page, E };
}
async function pick(page, q) {
  await page.evaluate((q) => { document.getElementById('q').value = q; document.getElementById('sform').requestSubmit(); }, q);
  await page.waitForFunction(() => document.querySelector('#card[data-ready]') && window.AGNSTART.data && window.AGNSTART.data.st.facts !== 'load' && window.AGNSTART.data.st.past !== 'load', null, { timeout: 90000 });
  await page.waitForTimeout(900);
}

/* ---- 1 · first view: no side panel, centred search, national numbers, rivers ---- */
{
  const { ctx, page, E } = await open(1366, 768);
  await page.waitForTimeout(3000);
  const s = await page.evaluate(() => { const h = document.getElementById('hero').getBoundingClientRect(), c = document.getElementById('card');
    const fp = [...document.querySelectorAll('.leaflet-agnFrontier-pane path')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0), fb = fp.length ? { left: Math.min(...fp.map((r) => r.left)) } : null;
    return { heroMid: (h.left + h.right) / 2, heroLeft: h.left, heroRight: h.right, heroW: h.width, frontierLeft: fb ? fb.left : null, w: innerWidth, cardHidden: c.hidden, saved: document.getElementById('saved').hidden, ns: [...document.querySelectorAll('#natStats .ns')].map((x) => x.id + ':' + x.textContent), accent: getComputedStyle(document.getElementById('bar'), '::after').backgroundImage }; });
  /* v91.17.283.1 (owner): the search is a compact panel floating at the top left (was centred at the top); Pakistan's first fit lies right of it */
  ok(s.heroLeft <= 24 && s.heroW >= 340 && s.heroW <= 400 && s.frontierLeft != null && s.frontierLeft >= s.heroRight && s.cardHidden && s.saved, 'S1 first view: no side panel, the search a top-left panel, Pakistan fitted right of it', JSON.stringify(s).slice(0, 260));
  ok(/linear-gradient/.test(s.accent) && (s.accent.match(/rgb\(/g) || []).length >= 6, 'S2 multicolour accent line under the brand bar (6 tab colours)', s.accent.slice(0, 120));
  /* v91.17.283.26 (owner 28 Oct): the Warmest / Coolest chips are removed; the fleet chip counts checked readings (usableChecked). This test
     encoded the old rule (warmest / coolest AGN station = /api/fleet/latest). */
  const fs = await j('/api/fleet/status'); const fls = s.ns.find((x) => x.startsWith('nsFleet:')) || '';
  ok(!s.ns.some((x) => /^ns(Hot|Cold):/.test(x)), 'S3 no Warmest / Coolest chip (removed, owner 28 Oct)', s.ns.join(' | '));
  ok(fls.includes(fs.usableChecked + '/' + fs.stations), 'S4 AGN stations reporting = /api/fleet/status usableChecked (checked readings)', fls);
  const lv = await Promise.all(['heat', 'cold', 'rain_hz', 'flood', 'wind', 'landslide', 'glof', 'drought'].map((k) => j('/api/levels?layer=' + k + '&day=0')));
  const cur = lv.filter((x) => x && !x.stale && x.levels);
  ok(cur.length ? s.ns.some((x) => x.startsWith('nsHigh:')) : !s.ns.some((x) => x.startsWith('nsHigh:')), 'S5 "areas at High or Severe" only when a current level run exists (else omitted)', cur.length + ' current');
  const R = await j('/n3/rivers.json');
  const names = (R.rivers || []).map((r) => r.name);
  ok(['Indus', 'Jhelum', 'Chenab', 'Ravi', 'Sutlej', 'Kabul', 'Swat', 'Gilgit', 'Hunza'].every((n) => names.includes(n)), 'S6 /n3/rivers.json: the major rivers present', names.join(','));
  ok(JSON.stringify(R).length <= 300000, 'S7 rivers data compact (<= 300 KB)', JSON.stringify(R).length + ' bytes');
  const r0 = await page.evaluate(() => { const R = window.AGNSTART.rivers; return { has: !!(R.layer && R.data), frames: R.frames, off: R.offset, canvas: !!document.querySelector('.leaflet-pane canvas.agn-rivers') }; });
  await page.waitForTimeout(1200);
  const r1 = await page.evaluate(() => { const R = window.AGNSTART.rivers; return { frames: R.frames, off: R.offset, vis: (R.vis || []).length }; });
  ok(r0.has && r0.canvas && r1.vis > 0, 'S8 rivers layer present and drawn on the map', JSON.stringify(r1));
  ok(r1.frames > r0.frames + 10 && r1.off > r0.off, 'S9 rivers animate (water flows)', r0.frames + ' -> ' + r1.frames + ' frames in 1.2 s');
  ok(r1.frames - r0.frames <= 45, 'S10 animation throttled (<= ~30 frames a second)', (r1.frames - r0.frames) + ' frames in 1.2 s');
  /* pixels on the Indus near Attock are river blue */
  const px = await page.evaluate(() => { const R = window.AGNSTART.rivers, rv = R.data.rivers.find((r) => r.name === 'Indus'), q = rv.coords[Math.floor(rv.coords.length * 0.25)];
    const p = map.latLngToContainerPoint([q[1], q[0]]), c = document.querySelector('canvas.agn-rivers'), g = c.getContext('2d'), k = window.devicePixelRatio || 1, d = g.getImageData(Math.round(p.x * k) - 2, Math.round(p.y * k) - 2, 5, 5).data; let blue = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100 && d[i + 2] > d[i] + 40) blue++; return blue; });
  ok(px >= 3, 'S11 the Indus ribbon is drawn in blue on the river canvas', px + ' blue pixels of 25');
  ok(E.page.length === 0 && E.console.length === 0, 'S12 first view: 0 page / console errors', JSON.stringify(E).slice(0, 300));
  ok(E.ext.length === 0, 'S13 0 requests to another origin', E.ext.join(' '));
  ok(E.loadMs < 2000, 'S14 first paint path: page load event under 2 s on the test server', E.loadMs + ' ms');
  await ctx.close();
}

/* ---- 2 · direction downstream, checked on the DEM (data/feat/t_elev read here, not through the page) ---- */
{
  const EJ = JSON.parse(readFileSync(join(ROOT, 'data', 'feat', 't_elev.json'), 'utf8')), G = EJ.grid, B = G.block, blocks = typeof EJ.blocks === 'string' ? JSON.parse(EJ.blocks.replace(/'/g, '"')) : EJ.blocks;
  const fds = {}; const cache = new Map();
  const elev = (lat, lon) => { const r = Math.floor((G.north - lat) / G.cell), c = Math.floor((lon - G.west) / G.cell), br = Math.floor(r / B), bc = Math.floor(c / B), key = br + ',' + bc;
    if (!cache.has(key)) { const e = blocks[key]; let a = null; if (e) { const [part, off, len] = e; const f = fds[part] ?? (fds[part] = openSync(join(ROOT, 'data', 'feat', 't_elev.p' + part + '.bin'), 'r')); const buf = Buffer.alloc(len); readSync(f, buf, 0, len, off); const raw = inflateSync(buf); a = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2); } cache.set(key, a); }
    const a = cache.get(key); if (!a) return null; const v = a[(r - br * B) * B + (c - bc * B)]; return v === EJ.nodata ? null : v; };
  const R = await j('/n3/rivers.json');
  for (const name of ['Indus', 'Jhelum']) {
    const rv = R.rivers.find((r) => r.name === name); const C = rv.coords, n = C.length, k = Math.max(3, Math.floor(n / 10));
    const med = (arr) => { const v = arr.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
    const head = med(C.slice(0, k).map((q) => elev(q[1], q[0]))), tail = med(C.slice(n - k).map((q) => elev(q[1], q[0])));
    ok(head != null && tail != null && head > tail, 'S15 ' + name + ' runs downstream: DEM at the first tenth above the last tenth', head + ' m -> ' + tail + ' m');
  }
  /* flow animation follows vertex order (lineDashOffset decreases = dashes move from the first vertex to the last) */
  const src = readFileSync(join(ROOT, 'artefact', 'NIGRAAN_START.html'), 'utf8');
  ok(/g\.lineDashOffset=-t;/.test(src) && /RIV\.offset=\(\(now-t0\)\/1000\*14\)/.test(src), 'S16 the dash offset grows negative with time: the dashes move along the vertex order (downstream)');
}

/* ---- 3 · Islamabad: the drawer, tabs, carousel, each tab real data, report ---- */
{
  const { ctx, page, E } = await open(1366, 768);
  await page.waitForTimeout(1500);
  await pick(page, 'G-8, Islamabad');
  await page.waitForTimeout(600);
  const dr = await page.evaluate(() => { const c = document.getElementById('card'), r = c.getBoundingClientRect(); const P = window.AGNSTART.place, p = map.latLngToContainerPoint([P.lat, P.lon]), m = map.getContainer().getBoundingClientRect();
    return { open: c.classList.contains('open') && !c.hidden, left: r.left, right: r.right, w: r.width, pinX: p.x + m.left, pinY: p.y + m.top, asides: [...document.querySelectorAll('aside')].filter((a) => !a.hidden).length, tf: getComputedStyle(c).transitionDuration }; });
  ok(dr.open && Math.abs(dr.right - 1366) < 2 && Math.abs(dr.w - 440) < 3, 'S17 one drawer on the right, 440 px at 1366', JSON.stringify(dr));
  ok(dr.asides === 1, 'S18 exactly one side panel visible', dr.asides);
  ok(dr.pinX < dr.left - 20 && dr.pinX > 20, 'S19 the pin is in the visible map, not under the drawer', dr.pinX + ' < ' + dr.left);
  ok(/0\.35s/.test(dr.tf), 'S20 the drawer slides (transform 350 ms)', dr.tf);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#dTabs .dtab')].map((b) => ({ t: b.getAttribute('data-t'), txt: b.textContent, bb: getComputedStyle(b).borderBottomColor, bg: getComputedStyle(b).backgroundColor })));
  ok(tabs.map((t) => t.txt).join('|') === 'Now|Forecast|Hazards|This place|Past 30 days|Report', 'S21 tabs Now · Forecast · Hazards · This place · Past 30 days · Report', tabs.map((t) => t.txt).join('|'));
  ok(new Set(tabs.map((t) => t.bb)).size === 6 && new Set(tabs.map((t) => t.bg)).size === 6, 'S22 each tab its own colour with a coloured underline', tabs.map((t) => t.bb).join(' '));
  const hd = await page.evaluate(() => ({ name: document.getElementById('cName').textContent, chip: document.getElementById('tChip') && document.getElementById('tChip').textContent, x: !!document.getElementById('cClose'), handle: !!document.getElementById('dHandle'), dots: document.querySelectorAll('#dDots i').length }));
  const S = await page.evaluate(() => { const d = window.AGNSTART.data; return { t: d.f.now.tempC, q: d.q }; });
  ok(hd.name.length > 2 && hd.chip && hd.chip.includes(fmtNow(S.t)) && hd.x && hd.handle && hd.dots === 6, 'S23 drawer header: name, temperature chip (= point forecast), close, handle, 6 dots', JSON.stringify(hd));
  /* Now = point forecast + station */
  const pf = psf(await j('/api/point?' + S.q)), nr = nearOf(pf);
  /* v91.17.283.37 · B1: the Now tab shows the point forecast only (no "Now, HH:MM PKT · forecast for this place" line and no station line: a station distance is an operator fact) */
  const now = await page.evaluate(() => ({ t: document.getElementById('nowT').textContent, line: !!document.getElementById('nowLine'), st: !!document.getElementById('stLine'), txt: document.getElementById('pane_now').innerText }));
  ok(now.t.startsWith(fmtNow(pf.now.tempC)) && !now.line && !now.st && !/Nearest station/.test(now.txt), 'S24 Now tab: temperature = API; no "forecast for this place" or station line (v283.37 B1)', now.t + ' | ' + now.txt.slice(0, 120));
  /* carousel: click, keyboard, wheel */
  const pos = async () => page.evaluate(() => ({ tab: window.AGNSTART.tab, tf: document.getElementById('dTrack').style.transform, on: document.querySelector('#dDots i.on').getAttribute('data-t') }));
  await page.click('#tab_fc'); await page.waitForTimeout(500); const p1 = await pos();
  ok(p1.tab === 'fc' && /translateX\(-16\.6667%\)/.test(p1.tf) && p1.on === 'fc', 'S25 tab click slides the track one pane left; the dot follows', JSON.stringify(p1));
  await page.focus('#tab_fc'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500); const p2 = await pos();
  ok(p2.tab === 'hz' && /-33\.3333%/.test(p2.tf), 'S26 arrow key moves to the next tab', JSON.stringify(p2));
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(500); const p3 = await pos();
  ok(p3.tab === 'fc', 'S27 arrow left moves back', JSON.stringify(p3));
  const vb = await page.evaluate(() => { const r = document.getElementById('dView').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 100 }; });
  await page.mouse.move(vb.x, vb.y); await page.mouse.wheel(120, 0); await page.waitForTimeout(600); const p4 = await pos();
  ok(p4.tab === 'hz', 'S28 trackpad (horizontal wheel) swipe switches tab', JSON.stringify(p4));
  /* Forecast: 3-day cards + chart with band = API days / hours */
  const fc = await page.evaluate(() => ({ cards: [...document.querySelectorAll('#rb_n3 .days3 [data-date]')].map((x) => x.getAttribute('data-date') + ':' + x.querySelector('.tt').textContent), band: !!document.querySelector('#n3Chart path[fill="#5B9AA0"]'), hours: +document.getElementById('n3Chart').getAttribute('data-hours') }));
  const want = pf.days.slice(1, 4).map((x) => x.date + ':' + Math.round(x.tmaxC) + '° ' + Math.round(x.tminC) + '°');
  ok(JSON.stringify(fc.cards) === JSON.stringify(want), 'S29 Forecast tab: 3 day cards = the point state days', fc.cards.join(' / '));
  ok(!fc.band && fc.hours >= 24, 'S30 Forecast tab: hourly chart of the point state (v91.17.283.12: no uncalibrated likely-range band)', JSON.stringify(fc));
  /* Hazards: coloured tiles; tap = layer on */
  const hz = await page.evaluate(() => [...document.querySelectorAll('#hzTiles .hzt')].map((b) => b.getAttribute('data-hzk') + ':' + b.style.getPropertyValue('--hc')));
  ok(hz.length === 8 && hz.every((x) => /:#/.test(x)), 'S31 Hazards tab: 8 tiles, each coloured by its level', hz.join(' '));
  await page.click('#hzTiles .hzt[data-hzk="heat"]'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => window.AGNSTART.hz === 'heat' && document.getElementById('hzBtnTxt').textContent.includes('Heat')), 'S32 tapping a hazard tile turns that layer on the map');
  /* This place: facts = API */
  await page.click('#tab_place'); await page.waitForTimeout(500);
  const fa = (pf && pf.parts && pf.parts.facts && pf.parts.facts.v) || {};   /* v283.19: the bundle part facts */ const fr = await page.evaluate(() => [...document.querySelectorAll('#rb_place .fr')].map((x) => x.getAttribute('data-f')));
  const want2 = Object.keys(fa.fields || {}).filter((k) => fr.includes(k)); ok(fr.length > 0 && fr.every((k) => (fa.fields || {})[k]), 'S33 This place tab: rows only for fields the facts endpoint gave', fr.join(','));
  /* Past 30 days = API */
  await page.click('#tab_p30'); await page.waitForTimeout(500);
  const p30 = await j('/api/report/past30?' + S.q); const pr = await page.evaluate(() => ({ rows: document.querySelectorAll('#p30Table tbody tr').length, line: (document.getElementById('p30Line') || {}).textContent || '', none: !!document.getElementById('p30None') }));
  ok(p30 && p30.ok ? pr.rows === p30.daily.length : pr.none, 'S34 Past 30 days tab: one row per served day (or the not-available note)', JSON.stringify(pr));
  /* Report */
  await page.click('#tab_rep'); await page.waitForTimeout(1200);
  const rp = await page.evaluate(() => { const c = document.getElementById('card'); const P = window.AGNSTART.place, p = map.latLngToContainerPoint([P.lat, P.lon]), m = map.getContainer().getBoundingClientRect();
    const nums = {}; document.querySelectorAll('#repDoc [data-num]').forEach((e) => { nums[e.getAttribute('data-num')] = e.textContent.replace(/[^0-9.\-]/g, ''); });
    const pan = {}; document.querySelectorAll('#pane_now [data-num]').forEach((e) => { pan[e.getAttribute('data-num')] = e.textContent.replace(/[^0-9.\-]/g, ''); });
    const kn = window.AGNSTART.keyNumbers(window.AGNSTART.data);
    return { w: c.getBoundingClientRect().width, left: c.getBoundingClientRect().left, pinX: p.x + m.left, nums, pan, kn, img: !!document.querySelector('#repMap'), loc: !!document.querySelector('#repLocator'), ed: document.getElementById('repDoc').getAttribute('data-edition'), links: [...document.querySelectorAll('#pane_rep a')].map((a) => a.getAttribute('href')), name: document.getElementById('repName').textContent }; });
  ok(Math.abs(rp.w - 0.6 * 1366) < 4, 'S35 Report tab widens the same drawer to 60 % of the screen', rp.w);
  ok(rp.pinX < rp.left, 'S36 the pin stays visible left of the wide drawer', rp.pinX + ' < ' + rp.left);
  const keys = Object.keys(rp.pan).filter((k) => k in rp.nums);   /* v283.19: the card also shows dew point, gusts, pressure, cloud, UV and rain chance; every number both show is the same */ ok(keys.length >= 4 && keys.every((k) => rp.nums[k] === rp.pan[k]), 'S37 report numbers = panel numbers (one data object)', JSON.stringify({ pan: rp.pan, rep: rp.nums }).slice(0, 300));
  ok(rp.nums.tempNow === fmtNow(pf.now.tempC) && rp.nums.tmax === String(Math.round(pf.days[0].tmaxC)), 'S38 report numbers = the point state', JSON.stringify(rp.nums));
  ok(rp.img && rp.loc && rp.ed === 'short', 'S39 report preview: map snapshot from the map canvas + locator, Short edition first', JSON.stringify({ img: rp.img, loc: rp.loc, ed: rp.ed }));
  ok(rp.links.every((h) => !/analyst/.test(h || '')), 'S40 the report never links to /analyst', rp.links.join(' '));
  await page.click('#edFull'); await page.waitForTimeout(800);
  const full = await page.evaluate(() => ({ ed: document.getElementById('repDoc').getAttribute('data-edition'), tbl: !!document.getElementById('repHzTable') || !!document.querySelector('#repDoc .note'), n3: !!document.getElementById('repN3Table'), types: document.querySelectorAll('#repTypes tr').length }));
  ok(full.ed === 'full' && full.n3 && full.types === 8, 'S41 Full edition adds the tables and the 8 product types', JSON.stringify(full));
  const url0 = page.url(); await page.click('#bPdf'); await page.waitForTimeout(400);
  const pdf = await page.evaluate(() => ({ printed: window.__printed || 0, st: document.getElementById('repStatus').textContent }));
  ok(pdf.printed === 1 && page.url() === url0, 'S42 Download PDF = print of the preview (A4 stylesheet), no navigation', JSON.stringify(pdf));
  await page.emulateMedia({ media: 'print' });
  const pm = await page.evaluate(() => ({ bar: getComputedStyle(document.getElementById('bar')).display, map: getComputedStyle(document.getElementById('map')).display, doc: getComputedStyle(document.getElementById('repDoc')).display, tabs: getComputedStyle(document.getElementById('dTabs')).display, h: document.getElementById('repDoc').getBoundingClientRect().height }));
  ok(pm.bar === 'none' && pm.map === 'none' && pm.tabs === 'none' && pm.doc !== 'none' && pm.h > 400, 'S43 print stylesheet: only the report document is printed', JSON.stringify(pm));
  await page.emulateMedia({ media: 'screen' });
  ok(/size:A4/.test(readFileSync(join(ROOT, 'artefact', 'NIGRAAN_START.html'), 'utf8')), 'S44 print page size A4');
  /* share link round-trip */
  await page.evaluate(() => { try { navigator.clipboard.writeText = () => Promise.reject(new Error('x')); } catch (_) {} }); await page.click('#bShare2'); await page.waitForTimeout(300);
  const sh = await page.evaluate(() => document.getElementById('repStatus').textContent); const m = /(http\S+)/.exec(sh); const link = m && m[1];
  ok(link && /\/api\/reports\/site-\d{8}-\d{4}-[0-9a-f]{16}$/.test(link), 'S45 share link = the archived report ID (FIX2821; was lat, lon)', link);
  const P0 = await page.evaluate(() => window.AGNSTART.place);
  ok(E.page.length === 0 && E.console.length === 0 && E.ext.length === 0, 'S46 Islamabad, all tabs: 0 page / console errors, 0 other origin', JSON.stringify(E).slice(0, 300));
  const csp = await page.evaluate(() => window.__csp || []); ok(csp.length === 0, 'S47 0 CSP violations', csp.join(' '));
  /* tuck + close */
  await page.click('#dHandle'); await page.waitForTimeout(500);
  const tk = await page.evaluate(() => ({ tuck: document.body.classList.contains('v-tuck'), chip: getComputedStyle(document.getElementById('tuckChip')).display, txt: document.getElementById('tuckChip').textContent }));
  ok(tk.tuck && tk.chip === 'flex' && /°C/.test(tk.txt), 'S48 collapse handle tucks the drawer, the site summary chip stays', JSON.stringify(tk));
  await page.click('#tuckChip'); await page.waitForTimeout(500);
  await page.click('#cClose'); await page.waitForTimeout(700);
  const cl = await page.evaluate(() => ({ hidden: document.getElementById('card').hidden, view: window.AGNSTART.view, pins: window.AGNSTART.pinCount(), hero: getComputedStyle(document.getElementById('hero')).display }));
  ok(cl.hidden && cl.view === 'start' && cl.pins === 0 && cl.hero !== 'none', 'S49 close slides the drawer out, back to the centred search', JSON.stringify(cl));
  await ctx.close();
  const ar = await (await fetch(link)).text();   /* FIX2821: the link opens the archived report of this place */
  /* v91.17.283.37 · B1: the report names the place; it prints no coordinates (a client screen) */
  ok(ar.includes('id="repName">' + P0.name.replace(/&/g, '&amp;') + '<') && !ar.includes(P0.lat.toFixed(5) + ', ' + P0.lon.toFixed(5)), 'S50 share link opens the archived report of the same place (by name, no coordinates, v283.37)', P0.name);
}

/* ---- 4 · 1920: drawer 520 px; reduced motion: static rivers, no slide ---- */
{
  const { ctx, page } = await open(1920, 1080, { reduced: true });
  await page.waitForTimeout(2500);
  const f0 = await page.evaluate(() => window.AGNSTART.rivers.frames); await page.waitForTimeout(1000); const f1 = await page.evaluate(() => ({ f: window.AGNSTART.rivers.frames, red: window.AGNSTART.rivers.reduced, vis: (window.AGNSTART.rivers.vis || []).length }));
  ok(f1.red && f1.f === f0 && f1.vis > 0, 'S51 prefers-reduced-motion: rivers drawn, not animated', JSON.stringify(f1));
  await pick(page, 'Gilgit');
  const g = await page.evaluate(() => { const c = document.getElementById('card'); return { w: c.getBoundingClientRect().width, tr: getComputedStyle(c).transitionDuration, track: getComputedStyle(document.getElementById('dTrack')).transitionDuration }; });
  ok(Math.abs(g.w - 520) < 3, 'S52 drawer 520 px at 1920', g.w);
  ok(/^0s/.test(g.tr) && /^0s/.test(g.track), 'S53 reduced motion: no slide transitions', JSON.stringify(g));
  await ctx.close();
}

/* ---- 5 · river click: name, product type, nearest forecast point status ---- */
{
  const { ctx, page, E } = await open(1366, 768);
  await page.waitForFunction(() => window.AGNSTART.rivers.data, null, { timeout: 30000 });
  await page.evaluate(() => map.setView([33.9, 72.25], 10, { animate: false })); await page.waitForTimeout(1500);
  const pt = await page.evaluate(() => { const R = window.AGNSTART.rivers, rv = R.data.rivers.find((r) => r.name === 'Indus'); let best = null; rv.coords.forEach((q) => { const d = Math.hypot(q[1] - 33.9, q[0] - 72.25); if (!best || d < best.d) best = { d, q }; }); const p = map.latLngToContainerPoint([best.q[1], best.q[0]]), m = map.getContainer().getBoundingClientRect(); return { x: p.x + m.left, y: p.y + m.top }; });
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(2500);
  const pop = await page.evaluate(() => ({ p: window.AGNSTART.rivers.popup, txt: (document.querySelector('.rv-pop') || {}).textContent || '', view: window.AGNSTART.view }));
  const gate = await j('/api/levels?layer=flood_riverine&day=0');
  ok(pop.p && pop.p.river === 'Indus' && /Indus/.test(pop.txt) && pop.view === 'start', 'S54 a river click opens the river popup (not a site)', pop.txt.slice(0, 160));
  ok(pop.txt.includes(((gate.gateTag || {}).productType || 'Product type not recorded')), 'S55 river product type from the model gate', (gate.gateTag || {}).productType);
  const fp = pop.p && pop.p.point ? await j('/api/flood/point?id=' + pop.p.point) : null;
  /* v283 INTEG: with no river forecast on this server (the test server runs no flood job) /api/flood/point answers 404 point_not_found;
     the popup must then say the forecast is not available, never a status */
  if (fp && fp.error === 'point_not_found') ok(/forecast is not available/i.test(pop.txt), 'S56 nearest river forecast point without a forecast: the popup says it is not available (= /api/flood/point 404)', pop.txt.slice(0, 160));
  else ok(fp && fp.point && pop.txt.includes(fp.point.name) && (pop.p.status === 'none' ? /No river forecast for today/.test(pop.txt) : pop.txt.includes(pop.p.status)), 'S56 nearest river forecast point and its status = /api/flood/point', (fp && fp.point.name) + ' · ' + pop.p.status);
  ok(E.page.length === 0 && E.console.length === 0, 'S57 river click: 0 errors', JSON.stringify(E).slice(0, 200));
  await ctx.close();
}

/* ---- 6 · MACH 108 display name; ASCII-only deploy scripts ---- */
{
  const reg = JSON.parse(readFileSync(join(ROOT, 'data', 'mach-fleet-stations.json'), 'utf8')); const all = JSON.stringify(reg);
  const s108 = (reg.stations || []).find((s) => s.no === 108), s105 = (reg.stations || []).find((s) => s.no === 105);
  ok(s108 && s108.name === 'Khomar, Gilgit' && s108.key === 'danyore' && s108.lat === 35.908035, 'S58 MACH 108 is "Khomar, Gilgit" (key and position unchanged)', JSON.stringify(s108 && { n: s108.name, k: s108.key }));
  const st = await j('/api/fleet/stations'); const live = (st.stations || []).find((s) => s.no === 108);
  ok(live && live.name === 'Khomar, Gilgit', 'S59 the server serves MACH 108 as "Khomar, Gilgit"', live && live.name);
  const dirs = [join(ROOT, '_admin')].filter(existsSync); let bad = [];
  for (const d of dirs) for (const f of readdirSync(d)) if (/\.(ps1|bat|cmd)$/i.test(f)) { const b = readFileSync(join(d, f)); if (b.some((x) => x > 127)) bad.push(f); }
  ok(bad.length === 0, 'S60 _admin deploy scripts are pure ASCII', bad.join(' '));
}
/* ---- 7 · VER282: river lines are OpenStreetMap's river centre-lines (no straight canal-like reaches), Shyok as a map line, no Esri raster
   or Esri credits, sea-green actions ---- */
{
  const R = await j('/n3/rivers.json'); const by = (n) => R.rivers.find((r) => r.name === n);
  const kmd = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), b[1] - a[1]) * 111.2;
  ok(/OpenStreetMap/.test(JSON.stringify(R.sources || [])) && /OpenStreetMap/.test(R.attribution || ''), 'S61 river geometry from OpenStreetMap river lines, credited', R.attribution);
  const long = []; for (const r of R.rivers) { let m = 0; for (let i = 1; i < r.coords.length; i++) m = Math.max(m, kmd(r.coords[i - 1], r.coords[i])); if (m > 10) long.push(r.name + ' ' + m.toFixed(1) + ' km'); }
  ok(long.length === 0, 'S62 no straight reach longer than 10 km on any river (the DEM/JRC trace drew 14-45 km straight lines across Punjab)', long.join(', ') || 'max <= 10 km');
  const bar = { Indus: ['kalabagh', 'chashma', 'taunsa', 'guddu', 'sukkur', 'kotri'], Chenab: ['marala', 'khanki', 'qadirabad', 'trimmu'], Ravi: ['balloki'], Sutlej: ['sulemanki', 'islam'], Panjnad: ['panjnad'] };
  const off = []; for (const [rv, ids] of Object.entries(bar)) for (const id of ids) { const p = (by(rv).pointsByElevation || []).find((x) => x.id === id); if (!p || !(p.snapKm <= 2.5)) off.push(rv + '/' + id + ' ' + (p ? p.snapKm : 'missing')); }
  ok(off.length === 0, 'S63 the barrages lie on their drawn river (<= 2.5 km)', off.join(', ') || 'all within 2.5 km');
  const sh = by('Shyok'); ok(sh && sh.coords.length > 20 && (sh.points || []).length === 0, 'S64 Shyok drawn as a map line without a river forecast point', sh && sh.coords.length + ' vertices');
  const src = readFileSync(join(ROOT, 'artefact', 'NIGRAAN_START.html'), 'utf8');
  ok(!/getJ\('\/tiles\/config'\)/.test(src) && !/Maxar|Earthstar|Garmin/.test(src), 'S65 the start page never asks for the raster light map (Esri) and carries no Esri credits');
  ok(!/#1d3557|#2b8cc4/i.test(src), 'S66 no navy or sky-blue colour left in the start page (actions are sea green)');
  const { ctx, page, E } = await open(1366, 768);
  await page.waitForFunction(() => window.AGNSTART.rivers.data, null, { timeout: 30000 }); await page.waitForTimeout(1500);
  const look = await page.evaluate(() => ({ att: (document.querySelector('.leaflet-control-attribution') || {}).textContent || '', btn: getComputedStyle(document.querySelector('.sbtn')).backgroundColor, dark: document.body.classList.contains('agn-dark') }));
  ok(!/Esri|Maxar|Earthstar|Garmin|HERE/.test(look.att) && /OpenStreetMap/.test(look.att), 'S67 footer credits only what is drawn (no Esri)', look.att);
  ok(look.btn === (look.dark ? 'rgb(47, 125, 140)' : 'rgb(47, 100, 104)'), 'S68 (v283.37: teal #2F7D8C on the dark Pakistan view) the search button is sea green #2F6468', look.btn);
  await page.evaluate(() => { const s = window.AGNSTART.rivers.data.rivers.find((r) => r.name === 'Shyok'), q = s.coords[Math.floor(s.coords.length / 2)]; map.setView([q[1], q[0]], 10, { animate: false }); }); await page.waitForTimeout(1500);
  const pt = await page.evaluate(() => { const s = window.AGNSTART.rivers.data.rivers.find((r) => r.name === 'Shyok'), q = s.coords[Math.floor(s.coords.length / 2)], p = map.latLngToContainerPoint([q[1], q[0]]), m = map.getContainer().getBoundingClientRect(); return { x: p.x + m.left, y: p.y + m.top }; });
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(1500);
  const pop = await page.evaluate(() => ({ p: window.AGNSTART.rivers.popup, txt: (document.querySelector('.rv-pop') || {}).textContent || '' }));
  ok(pop.p && pop.p.river === 'Shyok' && /No river forecast point on this river/.test(pop.txt) && !/undefined|NaN|null/.test(pop.txt), 'S69 Shyok click: name and "no river forecast point", no error', pop.txt.slice(0, 160));
  const blueAt = async (name, lat, lon) => page.evaluate(([name, lat, lon]) => { const rv = window.AGNSTART.rivers.data.rivers.find((r) => r.name === name); let best = null; rv.coords.forEach((q) => { const d = Math.hypot(q[1] - lat, q[0] - lon); if (!best || d < best.d) best = { d, q }; });
    const p = map.latLngToContainerPoint([best.q[1], best.q[0]]), c = document.querySelector('canvas.agn-rivers'), g = c.getContext('2d'), k = window.devicePixelRatio || 1, d = g.getImageData(Math.round(p.x * k) - 2, Math.round(p.y * k) - 2, 5, 5).data; let b = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100 && d[i + 2] > d[i] + 40) b++; return b; }, [name, lat, lon]);
  await page.evaluate(() => map.setView([33.9, 72.25], 11, { animate: false })); await page.waitForTimeout(1200); const b1 = await blueAt('Indus', 33.9, 72.25);
  await page.evaluate(() => map.setView([35.92, 74.36], 11, { animate: false })); await page.waitForTimeout(1200); const b2 = await blueAt('Hunza', 35.95, 74.36);
  const sh2 = await page.evaluate(() => { const R = window.AGNSTART.rivers, k = R.data.rivers.findIndex((r) => r.name === 'Hunza'), q = R.data.rivers[k].coords[0], a = map.latLngToLayerPoint([q[1], q[0]]), b = R.pts[k][0]; return Math.hypot(a.x - b.x, a.y - b.y); });
  ok(b1 >= 3 && b2 >= 3 && sh2 < 1, 'S71 a jump to a far place at the same zoom redraws the rivers in their place (pixel origin reset)', 'Attock ' + b1 + ', then Gilgit/Hunza ' + b2 + ' blue pixels of 25, drawn offset ' + sh2.toFixed(0) + ' px');
  ok(E.page.length === 0 && E.console.length === 0 && E.ext.length === 0, 'S70 VER282 checks: 0 errors, 0 other-origin requests', JSON.stringify(E).slice(0, 200));
  await ctx.close();
}
await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
