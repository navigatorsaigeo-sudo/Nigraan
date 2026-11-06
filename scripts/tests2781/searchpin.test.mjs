import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.278.1 · FIX2781 4 · a searched place: one pin at the exact searched point, labelled with its name, its popup open on the pin
// with the tehsil level of the hazard on the map (said to be the tehsil's), the temperature now and a way to the place's forecast;
// three searches leave one pin; a click on another tehsil still gives the tehsil popup; the popup fits inside the map at 1366 and 1920;
// 0 page / console / CSP errors, client and operator. Also: while the server's fleet status is pending, no station says "no reading
// received". Browser test (playwright). usage: node scripts/tests2781/searchpin.test.mjs <base url> [outdir]
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8995', OUT = process.argv[3] || null;
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 700) : '')); } };
const BENIGN = /Failed to load resource/;
async function open(op, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); const E = { page: [], console: [] };
  page.on('pageerror', (e) => E.page.push(String(e.message || e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.test(m.text())) E.console.push(m.text().slice(0, 200)); });
  await page.addInitScript((o) => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); });
    try { if (o) localStorage.setItem('agn.operator.v1', '1'); else localStorage.removeItem('agn.operator.v1'); } catch (_) {} }, op);
  await page.goto(BASE + '/analyst' + (op ? '?operator=1' : ''), { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.AGN && AGN.point && AGN.point.search && AGN.flow && window.map, null, { timeout: 180000 });
  await page.waitForFunction(() => { const c = document.querySelector('.citysel'); return c && c.offsetParent !== null && Array.isArray(window.STATIONS) && window.STATIONS.length > 0 && document.readyState === 'complete'; }, null, { timeout: 120000 }).catch(() => {});   /* v91.17.283.6: the console is up (header search shown, stations listed), not a fixed 6 s */
  return { ctx, page, E };
}
/* v91.17.283.6 · robust at 1366 (and under load): every step waits on the page's own state with a time limit, not on a fixed time; the
   checks themselves are unchanged. The popup wait now also refuses "Tehsil level: Loading…" (the old guard was lower-case only and let the
   capitalised placeholder through: the S4 failures at 1366), and waits until the popup's box AND text have stopped changing. */
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
const hdrSearch = async (page, q) => { await page.click('.citysel'); await page.waitForSelector('#hdrPlaceInput', { state: 'visible', timeout: 30000 }); await page.fill('#hdrPlaceInput', q);
  await page.waitForFunction((q) => { const b = document.querySelector('#hdrPlaceResults button[data-i]'); return b && b.offsetParent !== null && document.getElementById('hdrPlaceInput').value === q; }, q, { timeout: 60000 }).catch(() => {});
  const first = await page.evaluate(() => { const b = document.querySelector('#hdrPlaceResults button[data-i]'); return b ? b.innerText.replace(/\n/g, ' / ') : null; });
  await page.click('#hdrPlaceResults button[data-i]'); return first; };
const waitPop = async (page) => { const okp = await page.waitForFunction(() => { const p = document.querySelector('.agn-pt-pop'); return p && /Tehsil level: \S/.test(p.innerText) && !/Tehsil level: loading/i.test(p.innerText) && /Now \d/.test(p.innerText); }, null, { timeout: 120000 }).then(() => true, () => false);
  /* the map has settled: the popup's box and text have not changed for 1 s (polled on the page's own state) */
  await page.waitForFunction(() => { const p = document.querySelector('.agn-pt-popup'); if (!p) return false; const k = JSON.stringify(p.getBoundingClientRect()) + '|' + p.innerText.length; const W = window.__spSettle = window.__spSettle || {};
    if (W.k !== k) { W.k = k; W.t = Date.now(); return false; } return Date.now() - W.t >= 1000; }, null, { timeout: 60000, polling: 200 }).catch(() => {});
  return okp; };
const state = (page) => page.evaluate(() => { const m = map, pin = AGN.point.pin(), pops = [];
  m.eachLayer((l) => { if (l instanceof L.Popup && l.isOpen && l.isOpen()) { const e = l.getElement(); const r = e.getBoundingClientRect(); pops.push({ cls: l.options.className, ll: [l.getLatLng().lat, l.getLatLng().lng], txt: e.innerText.slice(0, 600), box: [r.left, r.top, r.right, r.bottom] }); } });
  const c = m.getContainer().getBoundingClientRect(); const pe = document.querySelector('.agn-pt-marker'); const pr = pe ? pe.getBoundingClientRect() : null;
  const sel = [...document.querySelectorAll('.wx-pin.sel')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0).length;
  return { pin, pops, map: [c.left, c.top, c.right, c.bottom], pinBox: pr ? [pr.left, pr.top, pr.right, pr.bottom] : null, lab: pe ? (pe.querySelector('.agn-pt-lab') || {}).textContent : null, selShown: sel, active: AGN.flow.location() }; });
const inside = (b, m) => b && b[0] >= m[0] - 1 && b[1] >= m[1] - 1 && b[2] <= m[2] + 1 && b[3] <= m[3] + 1;

for (const [op, w, h] of [[false, 1366, 768], [true, 1920, 1080]]) {
  const V = (op ? 'operator ' : 'client ') + w; const { ctx, page, E } = await open(op, w, h);
  /* S0 · status while the fleet has not been polled: no "no reading received" text anywhere */
  const st0 = await page.evaluate(() => fetch('/api/fleet/check').then((r) => r.json()).then((j) => ({ pending: j.stations.filter((s) => s.pending).length, n: j.stations.length })));
  const silentTxt = await page.evaluate(() => /no reading received/i.test(document.body.innerText));
  ok(!silentTxt, V + ' S0 no "no reading received" on the page (fleet pending ' + st0.pending + ' of ' + st0.n + ')');
  /* S1 · header search G-8 */
  const f1 = await hdrSearch(page, 'G-8'); const got1 = await waitPop(page); const s1 = await state(page);
  const want = await page.evaluate(() => fetch('/api/geo/search?q=G-8&limit=1').then((r) => r.json()).then((j) => j.results[0]));
  ok(s1.pin && Math.abs(s1.pin.lat - want.lat) < 1e-6 && Math.abs(s1.pin.lon - want.lon) < 1e-6, V + ' S1 the pin is at the exact searched point', JSON.stringify([f1, s1.pin, want.lat, want.lon]));
  ok(s1.lab === 'G-8, Islamabad' && s1.pin.pins === 1, V + ' S2 one pin, labelled with the searched name', JSON.stringify([s1.lab, s1.pin && s1.pin.pins]));
  const pp = s1.pops.filter((p) => p.cls === 'agn-pt-popup');
  ok(got1 && pp.length === 1 && Math.abs(pp[0].ll[0] - want.lat) < 1e-6 && Math.abs(pp[0].ll[1] - want.lon) < 1e-6 && s1.pops.length === 1, V + ' S3 the popup is open on the pin (anchored at the searched point), no tehsil-centre popup', JSON.stringify(s1.pops.map((p) => [p.cls, p.ll])));
  const t = pp[0] ? pp[0].txt : '';
  ok(/^G-8, Islamabad/.test(t) && /Islamabad tehsil/.test(t) && /Tehsil level: (Normal|Low|Moderate|High|Severe|Extreme)/.test(t) && /Now \d/.test(t) && /Detailed forecast for G-8, Islamabad/.test(t), V + ' S4 popup: place name, its tehsil, the tehsil level of the map hazard, temperature now, the forecast button', t.replace(/\n/g, ' | '));
  ok(!/\bnull\b|\bundefined\b|NaN|\[object|unitId|statusNote/.test(t), V + ' S5 plain text, no code words');
  ok(inside(pp[0] && pp[0].box, s1.map) && inside(s1.pinBox, s1.map), V + ' S6 popup and pin inside the map, nothing clipped', JSON.stringify([pp[0] && pp[0].box, s1.map]));
  const vis = await page.evaluate(() => { const c = document.querySelector('.agn-pt-popup .leaflet-popup-content'), cb = c.getBoundingClientRect(); const need = ['.tl', '.w', '.agn-pt-fc'].map((s) => c.querySelector(s));
    return need.map((e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.top >= cb.top - 1 && r.bottom <= cb.bottom + 1; }); });
  ok(vis.every(Boolean), V + ' S6b the tehsil level, the temperature now and the forecast button show without scrolling the popup', JSON.stringify(vis));
  ok(s1.selShown === 0, V + ' S7 one marker: the selected-place chip is not drawn beside the pin', s1.selShown);
  ok(s1.active && Math.abs(s1.active.lat - want.lat) < 1e-6 && /G-8/.test(s1.active.name), V + ' S8 the active place is the searched place, driven by its own name', JSON.stringify(s1.active));
  const outl = await page.evaluate(() => AGN.selFocus.state()); ok(outl.on && /Islamabad/.test(outl.tehsil || ''), V + ' S9 the tehsil outline is kept', JSON.stringify(outl));
  if (OUT) await page.screenshot({ path: OUT + '/pin_' + (op ? 'op' : 'cl') + w + '_g8.png' });
  /* S10 · three searches leave one pin */
  await hdrSearch(page, 'Murree'); await waitPop(page); await hdrSearch(page, 'Gulberg'); await waitPop(page);
  const s3 = await state(page); ok(s3.pin && s3.pin.pins === 1 && s3.pops.filter((p) => p.cls === 'agn-pt-popup').length === 1, V + ' S10 one pin and one popup after 3 searches', JSON.stringify([s3.pin, s3.lab]));
  ok(inside((s3.pops[0] || {}).box, s3.map), V + ' S11 the third popup inside the map too', JSON.stringify([(s3.pops[0] || {}).box, s3.map]));
  /* S12 · the forecast button opens the place's forecast */
  await page.click('.agn-pt-pop .agn-pt-fc'); await page.waitForFunction(() => { const v = document.querySelector('.view.active'); return v && /livedata/.test(v.id); }, null, { timeout: 30000 }).catch(() => {});
  const fv = await page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? v.id : null; }); ok(/livedata/.test(fv || ''), V + ' S12 "Detailed forecast" opens the Forecast view', fv);
  await page.evaluate(() => { const b = document.querySelector('#machNav button[data-goto="overview"]'); if (b) b.click(); }); await page.waitForFunction(() => { const v = document.querySelector('.view.active'); return v && !/livedata/.test(v.id) && map.getContainer().getBoundingClientRect().width > 0; }, null, { timeout: 30000 }).catch(() => {}); await settle(page);
  /* S13 · a click on another tehsil gives the tehsil popup as today (and the old pin goes) */
  const pt = await page.evaluate(() => { map.setView([31.52, 74.36], 9, { animate: false }); const p = map.latLngToContainerPoint([31.40, 74.20]); const c = map.getContainer().getBoundingClientRect(); return [c.left + p.x, c.top + p.y]; });
  await settle(page); await page.mouse.click(pt[0], pt[1]);
  await page.waitForFunction(() => { let place = false, ptp = false; map.eachLayer((l) => { if (l instanceof L.Popup && l.isOpen && l.isOpen()) { if (l.options.className === 'agn-place-popup') place = true; if (l.options.className === 'agn-pt-popup') ptp = true; } }); return place && !ptp && !AGN.point.pin(); }, null, { timeout: 60000, polling: 250 }).catch(() => {});
  const s4 = await state(page); ok(s4.pops.some((p) => p.cls === 'agn-place-popup') && !s4.pops.some((p) => p.cls === 'agn-pt-popup'), V + ' S13 a map click on a tehsil gives the tehsil popup', JSON.stringify(s4.pops.map((p) => [p.cls, p.txt.slice(0, 60)])));
  ok(!s4.pin, V + ' S14 the earlier search pin is gone once another place is chosen', JSON.stringify(s4.pin));
  /* S15 · a search through the flow (src search) gets the pin and popup at its point */
  await page.evaluate(() => AGN.flow.setActiveLocation({ name: 'Lahore', lat: 31.5204, lon: 74.3587 }, 'Lahore', { src: 'search' }));
  await page.waitForFunction(() => { const p = AGN.point.pin(); return p && Math.abs(p.lat - 31.5204) < 1e-6; }, null, { timeout: 60000 }).catch(() => {}); await waitPop(page);
  const s5 = await state(page); ok(s5.pin && Math.abs(s5.pin.lat - 31.5204) < 1e-6 && s5.pin.pins === 1 && s5.pops.some((p) => p.cls === 'agn-pt-popup' && /Tehsil level:/.test(p.txt)), V + ' S15 setActiveLocation(src search): one pin at the point, its popup with the tehsil level', JSON.stringify([s5.pin, s5.pops.map((p) => p.cls)]));
  if (OUT) await page.screenshot({ path: OUT + '/pin_' + (op ? 'op' : 'cl') + w + '_lahore.png' });
  const csp = await page.evaluate(() => (window.__csp || []).slice(0, 5));
  ok(!E.page.length && !E.console.length && !csp.length, V + ' S16 0 page / console / CSP errors', JSON.stringify({ page: E.page.slice(0, 3), console: E.console.slice(0, 3), csp }));
  await ctx.close();
}
await browser.close();
console.log(`\n${fail ? 'FAIL' : 'PASS'} searchpin2781: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
