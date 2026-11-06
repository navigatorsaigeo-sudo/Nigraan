import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.77 · agent G · CEO map report (27 Sep): urban heat masked to towns and to Pakistan-administered area; outlook layers on the
   map's one palette with the main map's boundaries and no silent white; typed coordinates and "Use my location" to the exact point.
   Usage: node scripts/tests77/ceo_map.test.mjs [base]   (default http://127.0.0.1:8787). PASS/FAIL lines; exit 1 on any FAIL. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails = 0, passes = 0;
const ok = (c, name, info) => { if (c) { passes++; console.log('PASS ' + name + (info ? ' · ' + info : '')); } else { fails++; console.log('FAIL ' + name + (info ? ' · ' + info : '')); } };
const J = async (p) => { try { const r = await fetch(BASE + p, { cache: 'no-store' }); return r.ok ? r.json() : { __status: r.status }; } catch (e) { return { __error: e.message }; } };
const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

/* the disputed polygon, from the build's own tehsil file */
const TEH = JSON.parse(readFileSync(join(ROOT, 'data', 'pk-tehsils.json'), 'utf8'));
const IJF = TEH.features.find(f => /Occupied/.test(f.properties.province));
const polysOf = (f) => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
const inRing = (x, y, r) => { let s = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) s = !s; } return s; };
const inF = (f, lat, lon) => polysOf(f).some(p => inRing(lon, lat, p[0]) && !p.slice(1).some(h => inRing(lon, lat, h)));
const inIJ = (lat, lon) => inF(IJF, lat, lon);

/* ── 1 · urban heat: towns only, Pakistan-administered area only ── */
const um = JSON.parse(readFileSync(join(ROOT, 'data', 'urban-mask.json'), 'utf8'));
const uhm = JSON.parse(readFileSync(join(ROOT, 'data', 'urban-heat-map.json'), 'utf8'));
const st = await J('/api/urban/status');
ok(st.mask && st.mask.urbanOnly === true && st.mask.populationPerKm2Min === um.rule.populationPerKm2Min, 'urban heat: density threshold is the data file\'s, unchanged', st.mask && (st.mask.populationPerKm2Min + ' /km2'));
ok(st.mask && st.mask.clusterPopulationMin === uhm.cluster.populationMin && /Degree of Urbanisation/.test(uhm.cluster.source), 'urban heat: town patch minimum from data/urban-heat-map.json with its source', st.mask && st.mask.clusterPopulationMin);
ok(st.mask && /urban areas only/.test(st.mask.legend.subtitle || ''), 'urban heat: the key says "urban areas only"', st.mask && st.mask.legend.subtitle);
/* v91.17.283.6 · expected behaviour updated to the intended decisions: C12 (data/urban-heat-c12.json, v91.17.283.3/.5: the urban heat cell map
   showed no skill against independent stations, so while the file is applied the cells, every point answer (towns and the low-density
   village alike) and the roll-up are "not assessed" with the file's reason) and the v91.17.283.2 mountain rule (Gilgit and Skardu carry no
   heat island even when C12 is released). Released (applied: false), the original town / village / cell checks run unchanged. */
let C12 = null; try { C12 = JSON.parse(readFileSync(join(ROOT, 'data', 'urban-heat-c12.json'), 'utf8')); if (!C12.applied) C12 = null; } catch (_) { C12 = null; }
for (const [nm, q] of [['national', 'w=60&s=23&e=78&n=37.5&zoom=6'], ['Kashmir', 'w=73&s=32.5&e=77&n=36&zoom=8'], ['Srinagar valley', 'w=74.3&s=33.5&e=75.5&n=34.6&zoom=10']]) {
  const c = await J('/api/urban/cells?' + q + '&max=18000');
  if (C12) { ok(c.ready && c.withheld === true && (c.cells || []).length === 0 && c.why === C12.reason, 'urban heat ' + nm + ': C12 applied, no cell drawn, the decision\'s reason given', (c.cells || []).length + ' cells · ' + String(c.why).slice(0, 80)); continue; }
  const n = c.cells ? c.cells.length / 3 : 0; let inside = 0, corner = 0;
  for (let i = 0; i < n; i++) { const la = c.cells[i * 3], lo = c.cells[i * 3 + 1]; if (inIJ(la, lo)) inside++;
    const hy = c.extents ? c.extents[i * 2] : 0, hx = c.extents ? c.extents[i * 2 + 1] : 0;
    if ([[la - hy, lo - hx], [la - hy, lo + hx], [la + hy, lo - hx], [la + hy, lo + hx]].some(([a, b]) => inIJ(a, b))) corner++; }
  ok(c.ready && inside === 0, 'urban heat ' + nm + ': no drawn cell centre inside IIOJK', n + ' cells, ' + inside + ' inside');
  ok(c.ready && Array.isArray(c.extents) && c.extents.length === n * 2 && corner <= Math.max(1, Math.round(n * 0.002)), 'urban heat ' + nm + ': each drawn cell covers its town cells (extents), none reaching over the LoC', corner + ' boxes touching IIOJK');
}
const P = async (lat, lon) => J('/api/urban/point?lat=' + lat + '&lon=' + lon + '&hoursFromSunset=2');
for (const [nm, la, lo] of [['Islamabad', 33.70, 73.05], ['Lahore', 31.55, 74.35], ['Karachi', 24.86, 67.01], ['Gilgit city', 35.92, 74.31], ['Skardu', 35.30, 75.63]]) {
  const r = await P(la, lo);
  if (C12) ok(r.ready && r.withheld === true && r.assessed === false && !r.heatIsland && r.why === C12.reason, 'urban heat: ' + nm + ': C12 applied, not assessed with the reason, no heat-island figure', String(r.why).slice(0, 90));
  else if (/Gilgit|Skardu/.test(nm)) ok(r.ready && r.withheld === true && !r.heatIsland, 'urban heat: ' + nm + ' (mountain town, v91.17.283.2 rule) carries no heat island', String(r.why).slice(0, 90));
  else ok(r.urban === true && r.heatIsland && r.heatIsland.maxC > 0, 'urban heat: ' + nm + ' is a town and carries a heat island', r.heatIsland ? r.heatIsland.maxC + ' C' : r.why); }
{ const r = await P(35.35, 74.86); if (C12) ok(r.ready && r.withheld === true && !r.smallSettlement && !r.heatIsland && r.why === C12.reason, 'urban heat: a GB valley village (Astore valley): C12 applied, not assessed (lowDensityAnswers), no "no heat island" claim', String(r.why).slice(0, 90));
  else ok(r.urban === false && r.smallSettlement === true, 'urban heat: a GB valley village (Astore valley, 35.35 N 74.86 E) is not urban', r.why); }
{ const r = await P(34.08, 74.80); ok(r.urban === false && r.administered === false, 'urban heat: Srinagar (IIOJK) is not described', r.why); }

/* ── 2 · outlook scale in the data file ── */
const sc = await J('/api/map/layer?id=scales:map');
const oc = sc && sc.outlookChance;
ok(oc && oc.classes.length === 5 && oc.classes.every((c, i) => c.level === W[i]) && /hazard-scale/.test(oc.levelsFrom || '') && !!oc.source, 'outlook chance classes carry the five map levels, with provenance', oc && oc.classes.map(c => c.min + '-' + c.max + ' ' + c.level).join(', '));

/* ── 3 · typed coordinates, server side ── */
const G = async (q) => { const j = await J('/api/geo/search?q=' + encodeURIComponent(q) + '&limit=3'); return j; };
for (const q of ['33.69, 73.05', '33.69 73.05', "33°41'N 73°03'E", 'N33.69 E73.05', '33.69N 73.05E', '33° 41′ 24″ N, 73° 03′ 00″ E']) {
  const j = await G(q); const r = j.results && j.results[0], c = j.parsed && j.parsed.coordinates;
  ok(c && Math.abs(c.lat - 33.69) < 0.01 && Math.abs(c.lon - 73.05) < 0.01 && r && r.administered === true && r.tehsil === 'Islamabad' && Number.isFinite(r.elevM) && /terrain/.test(r.elevSource || ''), 'coordinates "' + q + '" -> the exact point in Islamabad tehsil with its height', r && (r.name + ' · ' + r.elevM + ' m · ' + r.elevSource)); }
{ const j = await G('N34.08 E74.80'), r = j.results && j.results[0]; ok(r && r.administered === false && r.disputed === true && !j.autoSelect, 'coordinates in IIOJK: disputed, not scored', r && r.why); }
{ const j = await G('31.0, 77.0'), r = j.results && j.results[0]; ok(r && r.administered === false && r.outside === true, 'coordinates outside Pakistan-administered territory: said plainly', r && r.why); }
{ const j = await G('E-7'); ok(!(j.parsed && j.parsed.coordinates), 'a sector name with digits (E-7) is not read as coordinates'); }
{ const j = await G('36.3 74.9'), r = j.results && j.results[0]; ok(r && r.administered && r.forecastElevM == null && /relief/.test(r.elevSource || ''), 'a rough 250 m cell: the forecast keeps the provider\'s own point terrain, and says why', r && r.elevSource); }

/* ── 4 · client ── */
const pw = await __T.playwright();
const chromium = pw.chromium || pw.default.chromium;
const browser = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath(), args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true, geolocation: { latitude: 33.7215, longitude: 73.0433, accuracy: 20 }, permissions: ['geolocation'] });
const page = await ctx.newPage(); page.setDefaultTimeout(120000);
const errs = []; page.on('pageerror', e => errs.push(e.message));
const ext = []; page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u.slice(0, 100)); });
await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
const until = async (fn, re, max = 60000) => { const t = Date.now(); let v; while (Date.now() - t < max) { v = await fn(); if (re.test(String(v || ''))) return v; await page.waitForTimeout(1000); } return v; };
await until(() => page.evaluate(() => (document.getElementById('v3legend') || {}).innerText || ''), /Normal\s*\d+/, 150000);
await page.evaluate(() => document.querySelector('#map').scrollIntoView({ block: 'start' })); await page.keyboard.press('Shift');
/* v91.17.80 · the layer buttons live in the More layers menu: keep it open for these checks */
const openLayers = () => page.evaluate(() => { const m = document.getElementById('agnLayersMenu80'); if (m) m.classList.add('open'); });
await page.waitForTimeout(1500); await openLayers();
/* urban heat key */
await openLayers(); await page.evaluate(() => document.getElementById('agnUhiBtn').click());
/* v91.17.283.6 · C12 applied (v91.17.283.5 page side): the key says "Not assessed" with the decision's reason instead of a ramp */
const uk = await until(() => page.evaluate(() => (document.getElementById('agnUhiLegend') || {}).innerText || ''), C12 ? /Not assessed\./ : /urban areas only/, 30000);
if (C12) ok(/Urban heat island/.test(uk) && /Not assessed\./.test(uk) && uk.includes(C12.reason.replace(/^not assessed:\s*/i, '').replace(/^./, (c) => c.toUpperCase())), 'the Urban heat key: C12 applied, "Not assessed" with the decision\'s reason', String(uk).split('\n').slice(0, 3).join(' | '));
else ok(/urban areas only/.test(uk) && /villages/i.test(uk), 'the Urban heat key says urban areas only and that villages are blank', String(uk).split('\n').slice(0, 2).join(' | '));
await openLayers(); await page.evaluate(() => document.getElementById('agnUhiBtn').click()); await page.waitForTimeout(800);
/* outlook */
const olState = () => page.evaluate(() => { const w = document.getElementById('mpMapWrap'); const pane = map.getPane('agnOutlook');
  const fills = {}; let strokes = 0; if (pane) pane.querySelectorAll('path').forEach(p => { const f = (p.getAttribute('fill') || 'none').toLowerCase(); if (f !== 'none') fills[f] = (fills[f] || 0) + 1; if ((p.getAttribute('stroke') || 'none') !== 'none') strokes++; });
  const hatch = [...document.querySelectorAll('#map .leaflet-overlay-pane path')].find(p => /agnIIOJKHatch/i.test(p.getAttribute('fill') || ''));
  const dist = {}; try { districtLayer.eachLayer(l => { const pr = l.feature.properties; if (pr.province === IIOJK || pr.key === selectedDistrict) return; const k = l.options.color + '@' + l.options.weight; dist[k] = (dist[k] || 0) + 1; }); } catch (_) {}
  let base = 0; document.querySelectorAll('#map .leaflet-overlay-pane path').forEach(p => { const f = p.getAttribute('fill'); const o = Math.min(+(p.getAttribute('fill-opacity') || 1), +getComputedStyle(p).fillOpacity); if (f && f !== 'none' && o > 0.05) base++; });
  return { on: w.classList.contains('agn-ol-active'), z: pane ? +pane.style.zIndex : null, fills, strokes, hatchOpacity: hatch ? +getComputedStyle(hatch).fillOpacity : null, dist, base,
    rows: [...document.querySelectorAll('#agnOlMap .leg div')].map(d => d.textContent), swatches: [...document.querySelectorAll('#agnOlMap .leg div[data-hz5-level] i')].map(i => getComputedStyle(i).backgroundColor),
    pick: getComputedStyle(document.getElementById('mapHazardPick')).display, tag: (document.getElementById('agnOlTag') || {}).textContent, ctx: (document.querySelector('.agn-ctx-v[data-ctx="hazard"]') || {}).textContent }; });
await openLayers(); await page.click('#agnOlMapBtn'); await until(() => page.evaluate(() => document.querySelectorAll('#agnOlSel option').length), /^[1-9]\d+$/, 20000);
await page.selectOption('#agnOlSel', 'ev:heatSpell');
await until(() => page.evaluate(() => (document.getElementById('agnOlMap') || {}).innerText || ''), /0–19% · Normal/, 30000); await page.waitForTimeout(1500);
let s = await olState();
const PAL = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026', '#aab1b8', '#9467c9', 'url(#agnNAHatch)', 'url(#agnnahatch)', '#c9b6ea'];
ok(s.on && Object.keys(s.fills).length > 0 && Object.keys(s.fills).every(f => PAL.includes(f)), 'outlook fills only from the map palette (five levels + No data grey)', JSON.stringify(s.fills));
ok(!s.fills['#f7fbff'] && !s.fills['#ffffff'], 'outlook: 0–19 % is Normal light green, never white');
ok(/^0–19% · Unlikely · \d+$/.test(s.rows[0] || '') && /^80–100% · Very likely · \d+$/.test(s.rows[4] || ''), 'outlook key: % range, chance word and count (v93: a chance is not a hazard level)', s.rows.slice(0, 5).join(' | '));
ok(s.strokes === 0 && s.z < 400, 'outlook is fill only, under the main map\'s lines (pane z ' + s.z + ')', s.strokes + ' stroked outlook paths');
ok(s.hatchOpacity > 0, 'outlook on: the IIOJK hatch is the main map\'s, still drawn', 'fill-opacity ' + s.hatchOpacity);
ok(Object.keys(s.dist).length === 1, 'outlook on: one tehsil stroke everywhere', JSON.stringify(s.dist));
ok(s.pick === 'none' && /^Outlook: Heat spell/.test(s.tag || '') && /^Outlook: Heat spell/.test(s.ctx || ''), 'outlook on: the layer picker and the context bar name the outlook', s.tag + ' / ' + s.ctx);
await page.selectOption('#agnOlSel', ''); await page.waitForTimeout(3000); s = await olState();
ok(!s.on && s.base > 500 && s.pick !== 'none', '"None" gives the hazard map back, coloured', s.base + ' filled units');
await page.selectOption('#agnOlSel', 'ev:coldSpell'); await until(() => page.evaluate(() => (document.getElementById('agnOlMap') || {}).innerText || ''), /Cold spell[\s\S]*0–19% · Normal/, 30000);
await page.evaluate(() => document.getElementById('agnOlClear').click()); await page.waitForTimeout(3000); s = await olState();
ok(!s.on && s.base > 500, 'Clear layer gives the hazard map back, coloured', s.base + ' filled units');
await page.route(/id=ev(%3A|:)rain3_75/, r => r.abort());
await page.selectOption('#agnOlSel', 'ev:rain3_75'); await page.waitForTimeout(4000); s = await olState();
const pnl = await page.evaluate(() => document.getElementById('agnOlMap').innerText);
ok(!s.on && s.base > 50 && /could not be loaded/.test(pnl) && /Retry/.test(pnl), 'a failed outlook load says so, offers Retry, and the hazard map stays coloured', s.base + ' filled units');
await page.evaluate(() => { document.getElementById('agnOlMap').classList.remove('open'); });
/* coordinates in the map search box */
const popup = () => page.evaluate(() => { const p = document.querySelector('.agn-pt-pop'); return p ? p.innerText.replace(/\n/g, ' | ') : ''; });
/* v91.17.222 · U-29: the map box is gone; the header search is the one place search (coordinates go through the same point path) */
const hdrGo = async (q) => { await page.evaluate(() => { const s = document.getElementById('citysel'); if (s && !s.classList.contains('open')) document.getElementById('cityBtn').click(); });
  await page.fill('#hdrPlaceInput', q); await until(() => page.evaluate(() => document.getElementById('hdrPlaceResults').innerText), /coordinates/, 20000); await page.press('#hdrPlaceInput', 'Enter'); };
await hdrGo('35.92 74.31');
let pp = await until(popup, /Hazard levels of Gilgit tehsil \| (?!Loading)/, 90000);
/* v91.17.222 · the popup leads with three lines (U-17); height and the asked height are behind "Details", read from the point state */
const ptst = await page.evaluate(() => { const st = AGN.point.state(); return { elevM: st.row && st.row.elevM, asked: st.rec && (st.rec.echoedElev != null ? st.rec.echoedElev : st.rec.realElev) }; });
ok(/35\.92000° N, 74\.31000° E/.test(pp) && /Details: height/.test(pp) && ptst.elevM === 1466 && /Gilgit tehsil/.test(pp), 'typed coordinates: the popup names the exact point and its tehsil; the point carries its height (1466 m) behind Details', pp.slice(0, 160) + ' · ' + JSON.stringify(ptst));
ok(/Now -?\d/.test(pp) && ptst.asked != null && Math.abs(ptst.asked - 1466) <= 2, 'typed coordinates: the point forecast, asked at the point\'s height', 'asked at ' + ptst.asked + ' m');
ok(/(Normal|Low|Moderate|High|Severe)/.test(pp.split('Hazard levels')[1] || ''), 'typed coordinates: the levels of the containing tehsil', (pp.split('Hazard levels')[1] || '').slice(0, 120));
await hdrGo('N34.08 E74.80');
pp = await until(popup, /IIOJK|disputed/, 20000);
ok(/disputed/.test(pp) && !/Hazard levels/.test(pp), 'coordinates in IIOJK: said plainly, no levels', pp.slice(0, 120));
/* my location (browser position granted in this test) */
await page.evaluate(() => { const s = document.getElementById('citysel'); if (s && !s.classList.contains('open')) document.getElementById('cityBtn').click(); }); await page.click('#hdrUseLoc');
pp = await until(popup, /My location[\s\S]*Hazard levels of [^|]+\| (?!Loading)/, 90000);
ok(/My location \(±20 m\)/.test(pp) && /33\.72150° N, 73\.04330° E/.test(pp) && /Islamabad tehsil/.test(pp), '"My location": the exact point, its tehsil and levels', pp.slice(0, 140));
await page.evaluate(() => { navigator.geolocation.getCurrentPosition = function (ok, err) { setTimeout(function () { err({ code: 1 }); }, 20); }; });
await page.evaluate(() => { const s = document.getElementById('citysel'); if (s && !s.classList.contains('open')) document.getElementById('cityBtn').click(); }); await page.click('#hdrUseLoc'); const den = await until(() => page.evaluate(() => (document.getElementById('hdrPlaceResults') || {}).textContent || ''), /not shared/, 10000);
ok(/permission was declined/.test(den || ''), 'location refused: a plain message, nothing changed', den);
/* header place picker: a coordinate row takes the exact-point path */
await page.evaluate(() => { const b = document.getElementById('cityBtn') || document.querySelector('.citysel button'); if (b) b.click(); });
await hdrGo('24.8607, 67.0011');   /* v91.17.228 · open the header search first (the panel closes after the previous place) */
pp = await until(popup, /24\.86070° N[\s\S]*Liyari Town tehsil/, 60000);
ok(/24\.86070° N, 67\.00110° E/.test(pp) && /Liyari Town tehsil/.test(pp), 'header place picker: typed coordinates go to the exact point', pp.slice(0, 120));
ok(ext.length === 0, 'the page called no third-party host (coordinates stay on this server)', ext.slice(0, 3).join(' '));
ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
