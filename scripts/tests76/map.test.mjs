import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.76 · agent M · map: one place, popups that stay, map on Pakistan, one scale, LoC.
   Usage: node scripts/tests76/map.test.mjs [base]   (default http://127.0.0.1:8787). PASS/FAIL lines; exit 1 on any FAIL.
   UX audit IDs (s75/UX_AUDIT_A.md): A-01 A-02 A-03 A-04 A-09 A-10 A-11 A-12 A-21 A-22 A-23 A-24 A-25 A-27 A-52 + Line of Control. */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { readFileSync as __rf99 } from 'node:fs';
const SCALES = JSON.parse(__rf99(new URL('../../data/map-layer-scales.json', import.meta.url)));
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
let fails = 0, passes = 0;
const ok = (c, name, info) => { if (c) { passes++; console.log('PASS ' + name + (info ? ' · ' + info : '')); } else { fails++; console.log('FAIL ' + name + (info ? ' · ' + info : '')); } };
const J = async (p) => { const r = await fetch(BASE + p, { cache: 'no-store' }); return r.ok ? r.json() : { __status: r.status }; };
const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

/* ── server: the data files behind the map ── */
const sc = await J('/api/map/layer?id=scales:map');
ok(sc && sc.ready === true && sc.layers, 'scales:map served from data/map-layer-scales.json', sc && sc.file);
for (const k of ['nss_baseline', 'nss_dynamic', 'nss_retention', 'nss_runoff', 'aqi', 'comfort']) {
  const L = sc && sc.layers && sc.layers[k];
  /* v91.17.103 · a capacity layer (Runoff Retention Potential) has its own five classes and palette instead of the hazard levels */
  ok(L && Array.isArray(L.cuts) && L.cuts.length === 5 && (L.palette ? (L.palette.length === 5 && (L.words || []).length === 5 && L.cuts.every(c => c.idx != null)) : W.every(w => L.cuts.some(c => c.level === w))) && !!L.source && !!L.direction, 'A-12 scale ' + k + ': five levels (or five own classes), a direction and a source');
  if (L) { const mins = L.cuts.map(c => c.min == null ? -Infinity : c.min); ok(mins.every((m, i) => i === 0 || m < mins[i - 1]), 'A-12 scale ' + k + ': cuts ordered, no overlap', mins.join('>')); }
}
const oc = sc && sc.outlookChance;
ok(oc && oc.classes && oc.classes.length === 5 && oc.classes[0].min === 0 && oc.classes[4].max === 100 && oc.classes.every((c, i) => i === 0 || c.min === oc.classes[i - 1].max + 1), 'A-11 outlook chance classes contiguous 0-100', oc && oc.classes.map(c => c.min + '-' + c.max).join(','));
const loc = await J('/api/map/layer?id=line:loc');
const lc = loc && loc.geometry && loc.geometry.coordinates;
ok(loc && loc.ready && loc.geometry && loc.geometry.type === 'LineString' && lc.length > 1000, 'LoC geometry served (data/loc-line.json)', lc && lc.length + ' points');
ok(lc && lc.every(([x, y]) => x > 73 && x < 78.5 && y > 32.5 && y < 36), 'LoC geometry inside Kashmir bounds');
ok(loc && loc.source && /ai-geo-navigators-pk-maps/.test(loc.source.bundle || '') && /^[0-9a-f]{64}$/.test(loc.source.sha256 || ''), 'LoC provenance: bundle and sha256');
ok(loc && loc.properties && /ceasefire/.test(loc.properties.status || ''), 'LoC is a ceasefire line, not an international boundary');
const cat = JSON.stringify(await J('/api/map/layers'));
ok(!/ECMWF|NASA|CAMS|Open-Meteo|GloFAS|ERA5/.test(cat), 'no supplier names in the outlook layer list');
const wk = await J('/api/map/layer?id=week:t');
ok(!/ECMWF|NASA|CAMS/.test(String(wk.source || '')), 'no supplier names in an outlook layer source line', wk.source);

/* ── client ── */
const pw = await __T.playwright();
const chromium = pw.chromium || pw.default.chromium;
const browser = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __agnChrome(__T.chromiumPath()), args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
page.setDefaultTimeout(120000);
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
const t0 = Date.now();
/* A-01 / A-27: the first minute */
let off = [], selfPop = 0, allNd = 0, loaded = false, sawLoading = false;
for (let i = 0; i < 45; i++) {
  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => { let c = null, fit = true; try { const cc = map.getCenter(); c = [cc.lat, cc.lng]; const b = map.getBounds(); fit = b.contains([24.5, 62]) && b.contains([36, 75.5]) && (b.getEast() - b.getWest()) < 40; } catch (_) {}
    const l = document.getElementById('v3legend'); const rows = l ? [...l.querySelectorAll('.agn-hz5-row')].slice(0, 5).map((r) => +((r.innerText.match(/(\d+)\s*$/) || [])[1] || 0)) : [];
    return { c, pop: document.querySelectorAll('.leaflet-popup').length, leg: l ? l.innerText.replace(/\n/g, ' ') : '', loading: !!(l && l.classList.contains('agn-leg-loading')), placed: rows.reduce((a, x) => a + x, 0), fit }; });   /* v91.17.230 · the five level rows by position (the heat key speaks UTCI classes, not 'Normal') */
  if (s.c && !s.fit && Date.now() - t0 > 5000) off.push(Math.round((Date.now() - t0) / 1000) + 's ' + s.c.map(x => x.toFixed(2)).join(','));
  if (s.pop) selfPop++;
  if (s.loading) sawLoading = true;
  if (/Normal 0 Low 0 Moderate 0 High 0 Severe 0 No data (5[6-9]\d)/.test(s.leg)) allNd++;
  if (!s.loading && s.placed > 0) { if (!loaded) loaded = Date.now(); else if (Date.now() - loaded > 16000 && i > 16) break; }
}
ok(off.length === 0, 'A-01 the map stays fitted to Pakistan through load', off.slice(0, 3).join(' '));
ok(selfPop === 0, 'A-01 no popup opens by itself at load', 'samples with a popup: ' + selfPop);
ok(allNd === 0, 'A-27 no "No data 57x" key while the levels load', sawLoading ? 'loading row seen' : 'data was already there');
ok(!!loaded, 'the hazard key shows levels after load');
const leg = await page.evaluate(() => { const l = document.getElementById('v3legend'); const b = l.querySelector('.agn-leg-row b'); const p = document.querySelector('.leaflet-agnLoc-pane path');
  return { tf: getComputedStyle(l).transform, px: b ? parseFloat(getComputedStyle(b).fontSize) : 0, loc: !!l.querySelector('.agn-leg-loc'), locPath: !!p, dash: p && p.getAttribute('stroke-dasharray') }; });
ok(leg.tf === 'none' && leg.px >= 11, 'A-25 key text at least 11 px (no scale)', leg.px + 'px ' + leg.tf);
ok(leg.locPath && !!leg.dash, 'Line of Control drawn dashed', leg.dash);
ok(leg.loc, 'key has a "Line of Control" entry');
/* A-21 terrain */
const tb = () => page.evaluate(() => { const b = document.getElementById('agnTerrainBtn'); return b ? { aria: b.getAttribute('aria-checked'), on: b.classList.contains('on'), lay: !!(AGN.terrain && AGN.terrain.on()) } : null; });
let t1 = await tb();
ok(t1 && (t1.aria === 'true') === t1.on && t1.on === t1.lay, 'A-21 Terrain looks pressed exactly when relief is on', JSON.stringify(t1));
/* v91.17.82 · since v80 these buttons live in the More layers menu: open it before each click */
const openL = () => page.evaluate(() => { const m = document.getElementById('agnLayersMenu80'); if (m) m.classList.add('open'); });
await openL(); await page.locator('#agnTerrainBtn').click(); await page.waitForTimeout(700); const t2 = await tb();
ok(t2 && t2.on !== t1.on && (t2.aria === 'true') === t2.on && t2.on === t2.lay, 'A-21 Terrain click flips look and relief together', JSON.stringify(t2));
await openL(); await page.locator('#agnTerrainBtn').click(); await page.waitForTimeout(400);
/* A-22 */
const ma = await page.evaluate(() => { const b = document.getElementById('agnMyAssets'); return b ? { d: b.disabled, v: getComputedStyle(b).display } : null; });
ok(!ma || !ma.d || ma.v === 'none', 'A-22 a disabled "My assets" is hidden', JSON.stringify(ma));
/* A-02 / A-52 / A-03 / A-04 */
await page.evaluate(() => { document.querySelector('#map').scrollIntoView({ block: 'start' }); map.fitBounds([[23.6, 60.8], [37.1, 77.9]]); });
await page.waitForTimeout(800);
const state = () => page.evaluate(() => { const g = k => { const e = document.querySelector('.agn-ctx-v[data-ctx="' + k + '"]'); return e ? e.textContent.trim() : ''; };
  const pop = document.querySelector('.leaflet-popup .agn-place-pop b.n'); let ap = null; try { ap = AGN.data.activePoint(); } catch (_) {}
  return { U: g('unit').split(' · ')[0], cc: (document.getElementById('ccLoc') || {}).textContent, panel: (document.querySelector('#mpLeft .mp-h h4') || {}).textContent, strip: ((document.getElementById('hourSub') || {}).textContent || '').split(' · ')[0], store: ap && ap.name, pop: pop ? pop.textContent : null,
    thick: [...document.querySelectorAll('#map .leaflet-overlay-pane path')].filter(p => +(p.getAttribute('stroke-width') || 0) >= 2.5).length }; });
for (const [want, lat, lng, zz] of [['Gilgit', 35.80, 74.45], ['Gulshan Iqbal Town', 24.95, 67.15, 10], ['Quetta', 30.10, 67.10]]) {
  /* v91.17.82 · Karachi's weather pins cover Gulshan at national zoom; a reader zooms in to pick a city tehsil */
  await page.evaluate(([a, b, z]) => { map.closePopup(); if (z) map.setView([a, b], z, { animate: false }); else map.fitBounds([[23.6, 60.8], [37.1, 77.9]]); }, [lat, lng, zz || 0]);   /* a popup's autopan (a reader's click) may have moved the map */
  await page.waitForTimeout(600);
  const pt = await page.evaluate(([a, b]) => { const p = map.latLngToContainerPoint([a, b]); const r = document.querySelector('#map').getBoundingClientRect(); let x = r.x + p.x, y = r.y + p.y;
    /* v91.17.82 · a weather pin can sit on the point (Karachi); step right until the click lands on the tehsil itself */
    for (let k = 0; k < 8; k++) { const e = document.elementFromPoint(x, y); if (!(e && e.closest && e.closest('.leaflet-marker-icon,.leaflet-marker-pane,#agnPtBox,.maptools'))) break; x += 12; }
    return [x, y]; }, [lat, lng]);
  await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(1500);
  const s0 = await state(); const name = s0.pop || want;
  ok(!!s0.pop && s0.pop === s0.panel, 'A-02 click ' + want + ': a popup names the clicked tehsil, as the panels do', s0.pop + ' / ' + s0.panel);
  let s = null, done = false; const tt = Date.now();
  while (Date.now() - tt < 60000) { await page.waitForTimeout(2000); s = await state(); if (s.U === name && s.cc === name && s.strip === name && s.panel === name && s.store === name) { done = true; break; } }
  ok(done, 'A-03/A-04 ' + name + ': panels, 24 h strip, card, store and UNIT all name the clicked place', JSON.stringify(s) + ' after ' + Math.round((Date.now() - tt) / 1000) + ' s');
  await page.mouse.move(pt[0] + 240, pt[1] + 90); await page.waitForTimeout(9000); const s2 = await state();
  ok(s2.U === name && s2.panel === name && s2.cc === name && s2.strip === name, 'A-03 ' + name + ': nothing reverts it 9 s later', JSON.stringify(s2));
  ok(s2.pop === name, 'A-02 ' + name + ': the popup stays', String(s2.pop));
  ok(s2.thick >= 1, 'A-52 ' + name + ': the selected tehsil keeps its outline', 'thick paths ' + s2.thick);
}
/* A-12 */
const PAL = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026', '#aab1b8', '#9467c9', 'url(#agnNAHatch)', 'url(#agnnahatch)', '#c9b6ea', '#ffffff', 'url(#agniiojkhatch)', 'none'];
for (const v of ['nss_baseline', 'nss_runoff', 'aqi', '']) {   /* v91.17.101 · nss_retention left the picker (duplicate of nss_dynamic) */
  await page.selectOption('#mapHazardPick', v); await page.waitForTimeout(3500);
  const r = await page.evaluate(() => { const l = document.getElementById('v3legend'); const rows = [...l.querySelectorAll('.agn-leg-row')].filter(x => !/agn-leg-(note|dist|valid|src|loc)/.test(x.className)).map(x => [(x.querySelector('b') || {}).textContent, (x.querySelector('span') || {}).textContent]);
    const bad = {}; document.querySelectorAll('#map .leaflet-overlay-pane path').forEach(p => { const f = (p.getAttribute('fill') || 'none').toLowerCase(), o = +(p.getAttribute('fill-opacity') || 1); if (o > 0 && p.getAttribute('fill') !== null) bad[f] = (bad[f] || 0) + 1; }); return { rows, fills: bad }; });
  const words = r.rows.slice(0, 5).map(x => x[0]);
  /* v91.17.99 · a capacity layer may carry its own five words (data/map-layer-scales.json words[]) */
  const LW = (SCALES && SCALES.layers && SCALES.layers[v] && SCALES.layers[v].words) || W;
  ok(LW.every((w, i) => words[i] === w) && r.rows.slice(0, 5).every(x => /^\d+$/.test(String(x[1] || '').trim())), 'A-12 layer "' + (v || 'comfort') + '": the five levels with a count', JSON.stringify(r.rows.slice(0, 6)));
  const OWN = ((SCALES && SCALES.layers && SCALES.layers[v] && SCALES.layers[v].palette) || []).map(c => c.toLowerCase());   /* v91.17.103 · a layer's own palette */
  const other = Object.keys(r.fills).filter(f => !PAL.includes(f) && !OWN.includes(f));
  ok(other.length === 0, 'A-12 layer "' + (v || 'comfort') + '": fills only from the one palette', other.join(','));
}
/* A-09 · v91.17.266: "Show map data table" sits in the Overview "Details" disclosure (one fold for Key, Temperature detail, table, method) */
const openDet = () => page.evaluate(() => { const d = document.getElementById('agnOvDetails'); if (d && !d.open) { const sm = d.querySelector('summary'); if (sm) sm.click(); else d.open = true; } }).then(() => page.waitForTimeout(400));
await page.selectOption('#mapHazardPick', 'heat'); await page.waitForTimeout(3500);
await openDet(); await page.getByRole('button', { name: /map data table/i }).click(); await page.waitForTimeout(2500);
const tbl = await page.evaluate(() => { const t = document.getElementById('mapTable'); const r = t.getBoundingClientRect(); let p = t.parentElement, clip = null;
  while (p && p !== document.body) { const cs = getComputedStyle(p); if (/hidden|clip/.test(cs.overflow)) { const pr = p.getBoundingClientRect(); if (pr.bottom < r.bottom - 2 || pr.top > r.top + 2) { clip = p.className; break; } } p = p.parentElement; }
  const cap = (t.querySelector('.a11y-cap') || {}).textContent || ''; const leg = document.getElementById('v3legend').innerText.replace(/\n/g, ' ');
  const cnt = {}; ['Severe', 'High', 'Moderate', 'Low', 'Normal'].forEach(w => { const m = cap.match(new RegExp(w + ' (\\d+)')); cnt[w] = m ? +m[1] : null; });
  const lc = {}; ['Severe', 'High', 'Moderate', 'Low', 'Normal'].forEach(w => { const m = leg.match(new RegExp(w + ' (\\d+)')); lc[w] = m ? +m[1] : null; });
  return { rows: t.querySelectorAll('tbody tr').length, cap, cnt, lc, clip, h: r.height, disc: /discomfort/i.test(cap) }; });
ok(tbl.rows >= 570, 'A-09 the table lists every unit of the layer', tbl.rows + ' rows');
ok(!tbl.disc && /Heat stress/.test(tbl.cap), 'A-09 the table is the layer on screen (Heat stress), not the discomfort index', tbl.cap.slice(0, 90));
ok(JSON.stringify(tbl.cnt) === JSON.stringify(tbl.lc), 'A-09 the table counts equal the map key counts', JSON.stringify(tbl.cnt) + ' vs ' + JSON.stringify(tbl.lc));
ok(!tbl.clip && tbl.h > 300, 'A-09 the table is not clipped', 'height ' + Math.round(tbl.h) + (tbl.clip ? ' clipped by ' + tbl.clip : ''));
await openDet(); await page.getByRole('button', { name: /map data table/i }).click();
await page.selectOption('#mapHazardPick', 'flood'); await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelector('#map').scrollIntoView({ block: 'start' })); await page.waitForTimeout(500);
/* A-10 / A-11 / A-24 */
await openL(); await page.locator('#agnOlMapBtn').click(); await page.waitForTimeout(4000);
await page.selectOption('#agnOlSel', 'ev:heatSpell'); await page.waitForTimeout(9000);
const ol = await page.evaluate(() => { const p = document.getElementById('agnOlMap'); const r = p.getBoundingClientRect(); const m = document.getElementById('map').getBoundingClientRect();
  const inside = (ll) => { const pt = map.latLngToContainerPoint(ll); const x = m.x + pt.x, y = m.y + pt.y; return x >= r.x && x <= r.right && y >= r.y && y <= r.bottom; };
  return { rows: [...p.querySelectorAll('.leg div')].map(d => d.textContent), ctx: (document.querySelector('.agn-ctx-v[data-ctx="hazard"]') || {}).textContent, tag: (document.getElementById('agnOlTag') || {}).className, isb: inside([33.68, 73.05]), lhr: inside([31.52, 74.36]) }; });
ok(/^Outlook: Heat spell/.test(ol.ctx || ''), 'A-10 the context bar Layer names the outlook layer', ol.ctx);
ok(/\bon\b/.test(ol.tag || ''), 'A-10 the map-layer picker shows the outlook tag');
const rg = ol.rows.map(t => (t.match(/^(\d+)–(\d+)%/) || []).slice(1).map(Number)).filter(x => x.length === 2);
ok(rg.length === 5 && rg[0][0] === 0 && rg[4][1] === 100 && rg.every((x, i) => i === 0 || x[0] === rg[i - 1][1] + 1), 'A-11 heat-spell key contiguous 0-100 with counts', ol.rows.slice(0, 5).join(' | '));
ok(!ol.isb && !ol.lhr, 'A-24 the Outlook panel does not cover Islamabad or Lahore');
await page.evaluate(() => { if (AGN.olClear) AGN.olClear(); document.getElementById('agnOlMap').classList.remove('open'); }); await page.waitForTimeout(1200);
/* A-23 */
await openL(); await page.locator('#agnGlofBtn').click(); await page.waitForTimeout(7000);
const gl = await page.evaluate(() => { const a = document.getElementById('agnGlofLeg'), b = document.getElementById('v3days'); if (!a || !b || !a.classList.contains('open')) return null; const r = a.getBoundingClientRect(), d = b.getBoundingClientRect(); return !(r.right < d.x || r.x > d.right || r.bottom < d.y || r.y > d.bottom); });
ok(gl === false, 'A-23 the glacial-lake key does not cover the day buttons', String(gl));
ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
