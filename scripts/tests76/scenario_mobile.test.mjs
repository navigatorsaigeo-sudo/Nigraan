import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.76 · S · 06 Scenario (CEO decision 3: fix it) + phone/tablet layout + 11 Observations plain states, measured in a browser.
     node scripts/tests76/scenario_mobile.test.mjs [baseUrl]        default http://127.0.0.1:8787
   A-17  the Scenario tab produces a result: baseline levels for the place, and each stress test changes the level it should,
         for Islamabad, Karachi and Gilgit; the baseline is the map's own value (same engine call, same input)
   A-18  one temperature on the customer view of 06; the engineering lab (raw/fused strip) is operator-only
   mag   stress magnitudes are the served climatology (rain p99 / 20-y max for the month, tx90 for the date), not constants
   B-08  phone 390×844: map inside the first screen, Pakistan inside the view, one Layers button, no map control > 25 % of the
         map, map controls ≥ 44 px
   B-26  phone: no sideways page scroll
   B-27  phone and tablet: fixed pills do not overlap each other
   B-28  phone: no control under 24 × 24 on 01 and 06
   B-09  11 Observations on phone and tablet: fleet map and table inside the viewport (the table scrolls in its own box)
   B-29  11 Observations: no raw screen codes or minute counts for a customer; plain states; operator view keeps the codes
   desk  1440 and 1920: the phone/tablet stylesheet changes nothing (layout of header, tabs, map, controls and pills identical
         with and without it)
   zero page errors                                                                                                     */
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const PW = __T.playwrightUrl() || 'playwright';
const CHROME = __T.chromiumPath();
let fails = 0, passes = 0;
/* v91.17.85 · CEO decision 28 Sep: NIGRAAN is a desktop system with no phone or tablet layout. Those checks are reported as SKIP
   (set AGN_MOBILE=1 to run them). A-18's lab check follows the 27 Sep decision: the full lab is back for customers, folded. */
const MOBILE = /\b(phone|tablet)\b|^desk (1440|1920)/;
const ok = (c, name, detail) => { if (!process.env.AGN_MOBILE && MOBILE.test(name)) { console.log('SKIP ' + name + ' (desktop-only product)'); return; } if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 400) : '')); };
const LEVELS = ['Normal', 'Low', 'Moderate', 'High', 'Severe', 'No data', 'Cannot occur here'];

const _pw = await __T.playwright(); const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
const browser = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const perr = [];
async function openPage(w, h, mobile, q = '') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  page.on('pageerror', e => perr.push(w + ': ' + String(e && e.message).slice(0, 200)));
  await page.goto(BASE + '/analyst' + q, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!(window.DISTRICT_IN && window.STATIONS && window.AGN && AGN.scenario76 && typeof hzDayInput === 'function'
    && Object.keys(DISTRICT_IN).some(k => DISTRICT_IN[k] && DISTRICT_IN[k].fc72)), null, { timeout: 180000 }).catch(() => {});
  return page;
}
const click = (page, sel) => page.evaluate(s => { const b = document.querySelector(s); if (b) b.click(); return !!b; }, sel);

try {
  /* ── 06 Scenario at desktop ─────────────────────────────────────────────────────────────────────────────────── */
  const page = await openPage(1440, 900, false);
  await click(page, '#agn-tab-hybridlab');
  const got = await page.waitForFunction(() => { const r = document.querySelectorAll('#agnScnRows tr'); return r.length >= 6; }, null, { timeout: 120000 }).then(() => true).catch(() => false);
  ok(got, 'A-17 06 Scenario shows a result table (hazard, now, scenario, change)');
  /* v91.17.283.29 · W1 · the Scenario is the SERVER's run (GET /api/scenario): every level, now and under the stress test, is the server's
     place-record scoring at the place's own point; the page scores nothing. For three places: the baseline rows, then +4 °C and the 10-year
     rain day (the server's presets), which can only hold or raise the hazards they drive (delta method). */
  const R = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
    const run = async (preset) => { let b = null; for (let i = 0; i < 90 && !(b = document.querySelector('#agnScn button[data-preset="' + preset + '"]')); i++) { const L = document.querySelector('#agnScn button[data-scn-load]'); if (L) L.click(); await wait(1000); }   /* v283.29: the stress tests are loaded on request (opening the tab makes no request) */ if (!b) return null; b.click();
      for (let i = 0; i < 90; i++) { const r = AGN.scenario76.result(); if (r && r.query.indexOf('preset=' + preset) >= 0) return r.place; await wait(1000); } return null; };
    const peaks = (P, part) => { const H = P && P[part] && P[part].hazards; return H ? Object.fromEntries(Object.entries(H).map(([k, x]) => [k, x.peak && x.peak.level != null ? x.peak.level : null])) : null; };
    for (const id of ['isb', 'khi', 'gil']) { const st = (window.STATIONS || []).find((x) => x.id === id); if (st && AGN.pointState && AGN.pointState.bundle) await AGN.pointState.bundle(+st.lat, +st.lon);   /* the place's record is read first, as when the place is picked */
      AGN.scenario76.select(id); const base = await run('baseline'), w4 = await run('gwl4'), r10 = await run('rain10');
      out[id] = { why: base && !base.ok ? base.why : null, base: base && base.ok ? peaks(base, 'baseline') : null, w4: w4 && w4.ok ? [peaks(w4, 'baseline'), peaks(w4, 'scenario')] : (w4 ? w4.why : null), r10: r10 && r10.ok ? [peaks(r10, 'baseline'), peaks(r10, 'scenario')] : (r10 ? r10.why : null),
        state: AGN.scenario76.state() }; }
    return out; });
  for (const id of ['isb', 'khi', 'gil']) {
    const r = R[id];
    ok(!!r.base && Object.keys(r.base).length >= 7 && r.state.server === true, `A-17 ${id} baseline: the server's levels at the place (7 hazards)`, JSON.stringify(r).slice(0, 400));
    const hold = (pair, keys) => Array.isArray(pair) && keys.every((k) => pair[0][k] == null || pair[1][k] == null || pair[1][k] >= pair[0][k]);
    ok(hold(r.w4, ['heat']), `A-17 ${id} "+4 °C" never lowers heat stress`, JSON.stringify(r.w4));
    ok(hold(r.r10, ['rain', 'flood']) || typeof r.r10 === 'string', `A-17 ${id} "10-year rain day" never lowers heavy rain or flood (or names why it cannot run)`, JSON.stringify(r.r10));
  }
  /* the panel as a customer sees it: level words only, one place, no engineering lab */
  const V = await page.evaluate(() => { const p = document.getElementById('agn-panel-hybridlab'); const t = p.innerText; const h = document.getElementById('agnScn');
    const chips = [...h.querySelectorAll('#agnScnRows .lv')].map(x => x.textContent.trim());
    const cfe = document.getElementById('cfeSection');
    return { chips, fused: /fused/i.test(t), airTemp: /Air temp/.test(t), cfeShown: cfe ? cfe.getBoundingClientRect().height > 0 : false, text: t.slice(0, 200) }; });
  ok(V.chips.length >= 12 && V.chips.every(c => LEVELS.concat(['Not assessed']).includes(c)), 'A-17 every level on the panel is Normal/Low/Moderate/High/Severe/Not assessed', [...new Set(V.chips)].join(', '));
  ok(!V.fused && !V.airTemp && !V.cfeShown, 'A-18 customer view of 06: no raw/fused strip, engineering lab folded under the operator sweep', JSON.stringify({ fused: V.fused, air: V.airTemp, lab: V.cfeShown }));
  const clicked = await page.evaluate(() => [...document.querySelectorAll('#agnScnRows tr[data-hz]')].map(tr => tr.dataset.hz + ':' + (tr.querySelector('.dl') || {}).textContent));
  ok(clicked.length === 7, 'A-17 the page paints the server answer (7 hazard rows)', clicked.join(' | '));
  /* desktop: the phone/tablet stylesheet is inert */
  const inert = async (pg, w) => {
    await click(pg, '#agn-tab-overview'); await pg.waitForTimeout(1500);
    return pg.evaluate(() => { const sels = ['header.topbar', '#machNav', '#agnContextBar', '#map', '.maptools', '#v3days', '#v3legend', '#agnOutlookBtn', '#agnViewToggle', '#agnBackendPill', '.mappanel'];
      const snap = () => sels.map(s => { const e = document.querySelector(s); if (!e) return s + ':none'; const r = e.getBoundingClientRect(); return s + ':' + [r.x, r.y, r.width, r.height].map(Math.round).join(',') + ':' + getComputedStyle(e).display; }).join(' ') + ' body-pb:' + getComputedStyle(document.body).paddingBottom;
      const a = snap(); const st = document.getElementById('agn-mobile76-css'); const par = st && st.parentNode; if (st) st.remove(); const b = snap(); if (st) par.appendChild(st);
      const lb = document.getElementById('agnMLayersBtn'), bar = document.getElementById('agnMBar');
      return { same: a === b, a, b, hasCss: !!st, layers: lb ? getComputedStyle(lb).display : 'absent', bar: !!bar }; });
  };
  const d1 = await inert(page, 1440);
  ok(d1.hasCss && d1.same && d1.layers !== 'inline-flex' && d1.layers !== 'flex' && !d1.bar, 'desk 1440: layout identical with and without the phone/tablet stylesheet; no Layers button, no bottom bar', d1.same ? '' : d1.a + ' ≠ ' + d1.b);
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(1500);
  const d2 = await inert(page, 1920);
  ok(d2.same && !d2.bar, 'desk 1920: layout identical with and without the phone/tablet stylesheet', d2.same ? '' : d2.a + ' ≠ ' + d2.b);
  await page.close();

  /* ── phone 390 × 844 ────────────────────────────────────────────────────────────────────────────────────────── */
  const ph = await openPage(390, 844, true);
  await ph.waitForTimeout(6000);
  const M = await ph.evaluate(() => {
    const vw = document.documentElement.clientWidth; const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
    const m = document.getElementById('map'); const mr = m.getBoundingClientRect(); const area = mr.width * mr.height;
    const ctrls = [...document.querySelectorAll('#mpMapWrap *')].filter(e => vis(e) && getComputedStyle(e).position === 'absolute' && !/map-fade/.test(e.className) && (!m.contains(e) || e.closest('.leaflet-control'))).map(e => { const r = e.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, mr.right) - Math.max(r.x, mr.x)), h = Math.max(0, Math.min(r.bottom, mr.bottom) - Math.max(r.y, mr.y)); return { id: e.id || String(e.className).split(' ')[0], pct: 100 * w * h / area }; });
    let pkIn = null; try { pkIn = map.getBounds().pad(0.02).contains(districtLayer.getBounds()); } catch (_) {}
    const lb = document.getElementById('agnMLayersBtn'); const lr = lb ? lb.getBoundingClientRect() : null;
    const zm = [...document.querySelectorAll('#mpMapWrap .leaflet-control-zoom a')].map(a => { const r = a.getBoundingClientRect(); return Math.min(r.width, r.height); });
    const inter = [...document.querySelectorAll('button,a[href],input,select,[role=tab],[role=button]')].filter(vis).filter(e => !e.closest('.leaflet-marker-pane'));
    const small = inter.filter(e => { const r = e.getBoundingClientRect(); return (r.width < 24 || r.height < 24) && !(e.tagName === 'A' && getComputedStyle(e).display === 'inline'); }).map(e => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
    const fixed = [...document.querySelectorAll('body *')].filter(e => vis(e) && getComputedStyle(e).position === 'fixed' && e.id !== 'agnMBar').map(e => { const r = e.getBoundingClientRect(); return { id: e.id, r: [r.x, r.y, r.right, r.bottom] }; }).filter(f => (f.r[2] - f.r[0]) < vw);
    const ov = []; for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) { const a = fixed[i].r, b = fixed[j].r; if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) ov.push(fixed[i].id + '×' + fixed[j].id); }
    return { vw, sw: document.documentElement.scrollWidth, mapTop: mr.y + scrollY, mapH: mr.height, ctrls, pkIn, layers: lr ? [lr.width, lr.height] : null, zm, small, ov, tools: getComputedStyle(document.querySelector('#mpMapWrap .maptools')).display };
  });
  ok(M.mapTop + 120 < 844, 'B-26 phone: the map starts inside the first screen (≥ 120 px of map visible at load)', 'map top ' + Math.round(M.mapTop));
  ok(M.sw <= M.vw, 'B-26 phone: no sideways page scroll', M.sw + ' / ' + M.vw);
  ok(M.pkIn === true, 'B-08 phone: Pakistan inside the map view at load');
  ok(M.layers && M.layers[0] >= 44 && M.layers[1] >= 44 && M.tools === 'none', 'B-08 phone: the toolbar is folded behind one Layers button (≥ 44 px)', JSON.stringify(M.layers) + ' toolbar ' + M.tools);
  const big = M.ctrls.filter(c => c.pct > 25);
  ok(!big.length, 'B-08 phone: no map control covers more than 25 % of the map', M.ctrls.map(c => c.id + ' ' + c.pct.toFixed(1) + '%').join(', '));
  ok(M.zm.length === 2 && M.zm.every(x => x >= 44), 'B-28 phone: zoom buttons ≥ 44 px', M.zm.join(','));
  ok(!M.small.length, 'B-28 phone 01: no control under 24 × 24', M.small.slice(0, 6).join(' | '));
  ok(!M.ov.length, 'B-27 phone: fixed pills do not overlap', M.ov.join(', '));
  /* the sheet opens and closes */
  await click(ph, '#agnMLayersBtn'); await ph.waitForTimeout(500);
  const sheet = await ph.evaluate(() => { const t = document.querySelector('#mpMapWrap .maptools'); const r = t.getBoundingClientRect(); const s = document.getElementById('mapHazardPick'); const sr = s ? s.getBoundingClientRect() : null; const m = document.getElementById('map').getBoundingClientRect();
    return { disp: getComputedStyle(t).display, inMap: r.x >= m.x - 1 && r.right <= m.right + 1, pick: sr ? sr.right <= m.right + 1 : null }; });
  ok(sheet.disp !== 'none' && sheet.inMap && sheet.pick !== false, 'B-08 phone: Layers opens the toolbar as a sheet inside the map (layer picker fits)', JSON.stringify(sheet));
  await ph.keyboard.press('Escape'); await ph.waitForTimeout(300);
  ok(await ph.evaluate(() => getComputedStyle(document.querySelector('#mpMapWrap .maptools')).display === 'none'), 'B-08 phone: Escape closes the sheet');
  /* 06 on the phone */
  await click(ph, '#agn-tab-hybridlab'); await ph.waitForTimeout(3000);
  const s6 = await ph.evaluate(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
    const small = [...document.querySelectorAll('button,a[href],input,select,[role=tab]')].filter(vis).filter(e => { const r = e.getBoundingClientRect(); return (r.width < 24 || r.height < 24) && !(e.tagName === 'A' && getComputedStyle(e).display === 'inline'); });
    return { small: small.length, ex: small.slice(0, 5).map(e => (e.id || e.className) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)), sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; });
  ok(!s6.small && s6.sw <= s6.vw, 'B-28 phone 06: no control under 24 × 24, no sideways scroll', s6.ex.join(' | '));
  /* 11 on the phone */
  await click(ph, '[data-goto="modelab"]');
  await ph.waitForFunction(() => document.querySelectorAll('#agnObsTable tbody tr').length > 1, null, { timeout: 90000 }).catch(() => {});
  await ph.waitForTimeout(1500);
  const o = await ph.evaluate(() => { const vw = document.documentElement.clientWidth; const m = document.getElementById('agnObsMap'); const w = document.querySelector('.agn-obs-wrap'); const v = document.getElementById('agnObsSection');
    let pkIn = null; try { const lm = m && m._leaflet_id ? null : null; } catch (_) {}
    const t = v ? v.innerText : '';
    return { vw, map: m ? m.getBoundingClientRect().right : null, wrapR: w ? w.getBoundingClientRect().right : null, wrapScroll: w ? w.scrollWidth > w.clientWidth : null, sw: document.documentElement.scrollWidth,
      raw: (t.match(/deadphysics|dead\s*physics|mirrored of|rh-dew|no-reading|imperial-converted|forecast-not-station|Age min|five-rule|fleet_pairs|\.csv/gi) || []),
      plain: /Reporting|Offline \d+ (min|h|days)|Duplicate of another station|Failed quality check|No reading/.test(t), bigAge: /\b\d{4,} min\b/.test(t) }; });
  ok(o.map == null && o.wrapR <= o.vw && o.sw <= o.vw, 'B-09 phone, Evidence & Methods: the fleet table inside the viewport, scrolling in its own box; no second map (v91.17.250: the map is on the Overview only)', JSON.stringify(o).slice(0, 200));
  ok(!o.raw.length && o.plain && !o.bigAge, 'B-29 phone 11: plain states for a customer; no raw screen codes, file names or minute counts', o.raw.join(', '));
  await click(ph, '#agnObsAll'); await ph.waitForTimeout(800);
  const all = await ph.evaluate(() => { const t = document.getElementById('agnObsSection').innerText; return { n: document.querySelectorAll('#agnObsTable tbody tr').length, raw: /deadphysics|mirrored of|Age min/.test(t), off: /Offline \d+ (min|h|days)/.test(t), big: /\b\d{4,} min\b/.test(t) }; });
  ok(all.n > 20 && !all.raw && !all.big, 'B-29 phone 11: "Show all stations" lists the whole fleet in plain words (ages as min / h / days)', JSON.stringify(all));
  await ph.close();

  /* ── operator view keeps the codes ──────────────────────────────────────────────────────────────────────────── */
  const op = await openPage(1440, 900, false);
  await op.evaluate(() => document.documentElement.classList.add('agn-operator'));
  await click(op, '[data-goto="modelab"]');
  await op.waitForFunction(() => document.querySelectorAll('#agnObsTable tbody tr').length > 1, null, { timeout: 90000 }).catch(() => {});
  await click(op, '#agnObsAll'); await op.waitForTimeout(800);
  const ot = await op.evaluate(() => document.getElementById('agnObsSection').innerText);
  ok(/dead|mirrored/.test(ot) && /\(\d+ min\)/.test(ot), 'B-29 operator view (html.agn-operator): the raw screen codes and minute ages are still there');
  await click(op, '#agn-tab-hybridlab'); await op.waitForTimeout(1500);
  ok(await op.evaluate(() => document.getElementById('cfeSection').getBoundingClientRect().height > 0), 'A-17 operator view: the engineering scenario lab is available');
  await op.close();

  /* ── tablet 820 × 1180 ──────────────────────────────────────────────────────────────────────────────────────── */
  const tb = await openPage(820, 1180, true);
  await tb.waitForTimeout(4000);
  const T = await tb.evaluate(() => { const vw = document.documentElement.clientWidth; const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
    const fixed = [...document.querySelectorAll('body *')].filter(e => vis(e) && getComputedStyle(e).position === 'fixed' && e.id !== 'agnMBar').map(e => { const r = e.getBoundingClientRect(); return { id: e.id, r: [r.x, r.y, r.right, r.bottom] }; }).filter(f => (f.r[2] - f.r[0]) < vw);
    const ov = []; for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) { const a = fixed[i].r, b = fixed[j].r; if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) ov.push(fixed[i].id + '×' + fixed[j].id); }
    let pkIn = null; try { pkIn = map.getBounds().pad(0.02).contains(districtLayer.getBounds()); } catch (_) {}
    return { ov, sw: document.documentElement.scrollWidth, vw, pkIn }; });
  ok(!T.ov.length && T.sw <= T.vw, 'B-27 tablet: fixed pills do not overlap; no sideways scroll', T.ov.join(', '));
  ok(T.pkIn === true, 'B-08 tablet: Pakistan inside the map view at load');
  await click(tb, '[data-goto="modelab"]');
  await tb.waitForFunction(() => document.querySelectorAll('#agnObsTable tbody tr').length > 1, null, { timeout: 90000 }).catch(() => {});
  await tb.waitForTimeout(1000);
  const t11 = await tb.evaluate(() => { const vw = document.documentElement.clientWidth; const w = document.querySelector('.agn-obs-wrap'); return { vw, w: w ? w.getBoundingClientRect().right : null, map: !!document.getElementById('agnObsMap') }; });
  ok(t11.w != null && t11.w <= t11.vw && !t11.map, 'B-09 tablet, Evidence & Methods: the fleet table inside the viewport; no second map', JSON.stringify(t11));
  await tb.close();
} catch (e) { ok(false, 'harness', e && e.stack); }
ok(!perr.length, 'zero page errors', perr.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
