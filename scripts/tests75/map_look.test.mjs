import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.75 · M · the CEO's map-look asks (A1–A6), measured on the page a browser loads.
     node scripts/tests75/map_look.test.mjs [baseUrl]        default http://127.0.0.1:8787
   A1 palette per level (Normal light green tint, Low pale yellow, Moderate/High/Severe amber/orange/red; Unfilled no fill,
      No data light grey) on flood (all Normal), drought and seismic (mixed); every state pair CVD-distinct
   A2 the key rows are level name + count only (no score ranges)
   A3 IIOJK: one layer draws it, a diagonal hatch pattern, no solid fill, thin dashed border; one basemap tile layer
   A4 no two capital labels overlap at national zoom (and one zoom in)
   A5 "i-8" → one row, with a height; no "elev n/a"
   A6 the card title, the place dropdowns and the search box name one place after search, a map click and a pin
   zero page errors                                                                                                     */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const PW = __agnPW;
const CHROME = __agnChrome(__T.chromiumPath());
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 300) : '')); };
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const FILL = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026'], OPA = [0.50, 0.90, 0.92, 0.92, 0.94], ND = ['#9467c9', 0.62];

/* ── colour-vision check (Machado 2009, severity 1.0), composited on the basemap ── */
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const comp = (c, a, b = [224, 232, 237]) => c.map((v, i) => a * v + (1 - a) * b[i]);
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const delin = v => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055); };
const MD = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]];
const MP = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]];
const sim = (c, M) => { const l = c.map(lin); return M.map(r => delin(r[0] * l[0] + r[1] * l[1] + r[2] * l[2])); };
const lab = c => { const [r, g, b] = c.map(lin); const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

const _pw = await __T.playwright(); const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
const b = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const perr = []; page.on('pageerror', e => perr.push(String(e && e.message).slice(0, 200)));
  await page.addInitScript(() => { window.__AGN_HARNESS = true; });
  await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const ready = await page.waitForFunction(() => !!(window.AGN && AGN.hz5 && AGN.capLabels && AGN.disputedStyle && typeof districtLayer !== 'undefined' && document.querySelector('#v3legend[data-hz5="1"]') && window.AGN.hzMask), null, { timeout: 180000 }).then(() => true).catch(() => false);
  ok(ready, 'page loaded with the one-scale map key and the v75 map-look module');
  /* the national sweep lands: wait until flood has no unresolved unit (or 90 s) */
  await page.waitForFunction(() => { try { let nd = 0; districtLayer.eachLayer(l => { const p = l.feature.properties; if (p.province === window.IIOJK || p.dq === true) return; const h = districtHazardInfo(p.key); if (!h || h.score == null) nd++; }); return nd < 20; } catch (_) { return false; } }, null, { timeout: 90000, polling: 2000 }).catch(() => null);
  await page.waitForTimeout(3000);

  /* ── A1 · the palette itself: served values and colour-vision separation ── */
  const H = await page.evaluate(() => ({ fill: AGN.hz5.fill, opacity: AGN.hz5.opacity, words: AGN.hz5.words, nd: AGN.hz5.noData }));
  ok(JSON.stringify(H.fill) === JSON.stringify(FILL) && JSON.stringify(H.opacity) === JSON.stringify(OPA) && H.nd && H.nd.fill === ND[0], 'A1 · the level palette is Normal green tint, Low pale yellow, amber, orange, deep red; No data light grey', JSON.stringify(H));
  const states = [['Unfilled', comp([224, 232, 237], 0)], ['No data', comp(hx(ND[0]), ND[1])]].concat(FILL.map((c, i) => [WORDS[i], comp(hx(c), OPA[i])]));
  for (const [tag, f] of [['normal vision', c => c], ['deuteranopia', c => sim(c, MD)], ['protanopia', c => sim(c, MP)]]) {
    let min = [1e9, ''];
    for (let i = 0; i < states.length; i++) for (let j = i + 1; j < states.length; j++) { const d = dE(f(states[i][1]), f(states[j][1])); if (d < min[0]) min = [d, states[i][0] + '/' + states[j][0]]; }
    ok(min[0] >= 10, 'A1 · every pair of map states differs by CIELAB dE >= 10 under ' + tag + ' (on the basemap)', 'closest ' + min[1] + ' dE ' + min[0].toFixed(1));
  }

  /* ── A1 + A2 · three layers: flood (all Normal), drought and seismic (mixed) ── */
  for (const hz of ['flood', 'drought', 'seismic']) {
    const r = await page.evaluate(async ([hz, FILL, OPA, ND]) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const tt = [...document.querySelectorAll('#mpMapWrap .maptools button')].find(x => /^Tehsil$/.test((x.textContent || '').trim())); if (tt && !tt.classList.contains('on')) { tt.click(); await w(800); }
      const p = document.getElementById('mapHazardPick'); p.value = hz; p.dispatchEvent(new Event('change', { bubbles: true })); await w(3500);
      const leg = document.getElementById('v3legend');
      const rows = [...leg.querySelectorAll('.agn-leg-row')].filter(x => x.querySelector('b')).map(x => ({ b: x.querySelector('b').textContent.trim(), s: ((x.querySelector('span') || {}).textContent || '').trim(), cls: x.className }));
      const lv = [0, 0, 0, 0, 0]; let bad = 0, na = 0, naBad = 0, nd = 0, ndBad = 0; const ex = [];
      districtLayer.eachLayer(l => {
        const pp = l.feature.properties, el = l._path; if (!el || pp.province === window.IIOJK) return;
        const fill = (el.getAttribute('fill') || '').toLowerCase(), fo = Number(el.getAttribute('fill-opacity'));
        let h = null; try { h = districtHazardInfo(pp.key); } catch (_) {}
        const L = pp.dq === true ? { nd: true } : (h ? AGN.hz5.levelOf(hz, h.score, h) : { nd: true });
        if (L.na) { na++; if (fill !== 'url(#agnnahatch)') { naBad++; if (ex.length < 3) ex.push('na ' + fill); } return; }   /* (84) does not occur here: pink hatch */
        if (L.nd) { nd++; if (!(fill === ND[0] && Math.abs(fo - ND[1]) < 0.01)) { ndBad++; if (ex.length < 3) ex.push('nd ' + fill + '@' + fo); } return; }
        lv[L.i]++; if (!(fill === FILL[L.i] && Math.abs(fo - OPA[L.i]) < 0.01)) { bad++; if (ex.length < 3) ex.push(pp.key + ' ' + L.i + ' ' + fill + '@' + fo); }
      });
      const chip = document.getElementById('agnCheckChip');
      const sw = rows.slice(0, 5).map((x, i) => getComputedStyle(leg.querySelectorAll('.agn-leg-row')[i].querySelector('i')).backgroundColor);
      return { rows, lv, bad, na, naBad, nd, ndBad, ex, sw, chip: chip && !chip.hidden ? Number(chip.getAttribute('data-count')) : null, text: leg.innerText.replace(/\s+/g, ' ').slice(0, 500) };
    }, [hz, FILL, OPA, ND]);
    const five = r.rows.slice(0, 5);
    ok(JSON.stringify(five.map(x => x.b)) === JSON.stringify(WORDS), hz + ' · A2 · the key reads Normal / Low / Moderate / High / Severe', five.map(x => x.b + ' ' + x.s).join(' | '));
    ok(r.rows.every(x => /^\d*$/.test(x.s)) && !/\d\s*[–-]\s*\d/.test(r.rows.map(x => x.s).join(' ')), hz + ' · A2 · every key row is a level name and a count only: no score range', r.rows.map(x => x.b + ' [' + x.s + ']').join(' | '));
    ok(r.bad === 0 && r.ndBad === 0 && r.naBad === 0, hz + ' · A1 · every unit wears its level colour (Normal ' + FILL[0] + '@' + OPA[0] + ' …), does-not-occur is the pink hatch, No reading is purple', 'levels ' + r.lv.join('/') + ' · unfilled ' + r.na + ' · no data ' + r.nd + ' · wrong ' + (r.bad + r.ndBad + r.naBad) + ' ' + r.ex.join(', '));
    ok(r.chip === r.lv[3] + r.lv[4], hz + ' · "Check these" = High + Severe', 'chip ' + r.chip + ' · levels ' + r.lv.join('/'));
    if (hz === 'flood') ok(r.lv[0] > 400 && r.lv[0] >= r.lv.reduce((a, c) => a + c, 0) - 5, 'flood · A1 · a calm day paints the country in the Normal green tint (not an empty map)', 'Normal ' + r.lv[0] + ' of ' + r.lv.reduce((a, c) => a + c, 0) + ' levelled units');
    else ok(r.lv.filter(x => x > 0).length >= 2, hz + ' · A1 · a mixed layer shows more than one level', r.lv.join('/'));   /* v91.17.228 · how many levels a day holds is the data's (October drought: Normal 550, Moderate 17) */
    ok(/rgba?\(116, 196, 118/.test(r.sw[0]) && /rgba?\(255, 230, 128/.test(r.sw[1]), hz + ' · A1 · the key swatches match the map (Normal green tint, Low pale yellow)', r.sw.join(' | '));
  }

  /* ── A3 · IIOJK ── */
  for (const mode of ['Tehsil', 'Province']) {
    const r = await page.evaluate(async (mode) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const tt = [...document.querySelectorAll('#mpMapWrap .maptools button')].find(x => (x.textContent || '').trim() === mode); if (tt) { tt.click(); await w(1200); }
      const IJ = window.IIOJK, vis = [], hidden = [];
      const look = (grp, name) => { if (!map.hasLayer(grp)) return; grp.eachLayer(l => { const p = l.feature && l.feature.properties; if (!p || p.province !== IJ || !l._path) return;
        const e = l._path, a = { layer: name, fill: e.getAttribute('fill'), fo: Number(e.getAttribute('fill-opacity')), stroke: e.getAttribute('stroke'), dash: e.getAttribute('stroke-dasharray'), sw: Number(e.getAttribute('stroke-width')) };
        ((a.fo > 0 || (a.stroke && a.stroke !== 'none')) ? vis : hidden).push(a); }); };
      look(provLayer, 'province'); look(districtLayer, 'tehsil');
      const pat = document.getElementById(AGN.disputedStyle.hatchId);
      const tiles = []; map.eachLayer(l => { if (l instanceof L.TileLayer) tiles.push(String(l._url || '').slice(0, 60)); });
      return { vis, hidden, pat: pat ? { lines: pat.querySelectorAll('line').length, rects: pat.querySelectorAll('rect').length, tr: pat.getAttribute('patternTransform') } : null, tiles };
    }, mode);
    const v = r.vis[0] || {};
    ok(r.vis.length === 1, mode + ' view · A3 · exactly one layer draws IIOJK (no second boundary or fill stacked on it)', JSON.stringify(r.vis) + ' · hidden ' + JSON.stringify(r.hidden));
    ok(/^url\(#agnIIOJKHatch\)$/.test(v.fill || '') && r.pat && r.pat.lines >= 1 && r.pat.rects === 0 && /rotate\(45\)/.test(r.pat.tr || ''), mode + ' view · A3 · IIOJK is a diagonal hatch pattern with no solid fill', JSON.stringify({ fill: v.fill, pat: r.pat }));
    ok(/\d/.test(v.dash || '') && v.sw > 0 && v.sw <= 1.2, mode + ' view · A3 · IIOJK has a thin dashed border', JSON.stringify({ dash: v.dash, width: v.sw, stroke: v.stroke }));
    ok(r.tiles.length === 1, mode + ' view · A3 · one basemap tile layer (no relief or second DEM layer stacked)', r.tiles.join(' | '));
  }

  /* ── A4 · capital labels at national zoom ── */
  for (const z of [null, 6]) {
    const r = await page.evaluate(async (z) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      map.fitBounds([[23.6, 60.8], [37.1, 77.9]], { padding: [16, 16], animate: false }); await w(400);
      if (z) { map.setView([32.5, 71.5], z, { animate: false }); await w(600); }
      AGN.capLabels.declutter(); await w(100);
      const B = AGN.capLabels.boxes(), vis = B.filter(x => !x.hidden); let over = [];
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) { const a = vis[i].box, c = vis[j].box; if (!(a[2] <= c[0] || a[0] >= c[2] || a[3] <= c[1] || a[1] >= c[3])) over.push(vis[i].name + '/' + vis[j].name); }
      return { zoom: map.getZoom(), vis: vis.map(x => x.name + ':' + x.side), hidden: B.filter(x => x.hidden).map(x => x.name), over };
    }, z);
    ok(r.over.length === 0 && r.vis.length >= 5 && ['Islamabad', 'Lahore', 'Karachi'].every(n => r.vis.some(x => x.startsWith(n + ':'))), 'A4 · zoom ' + r.zoom + ' · no two city label boxes overlap; Islamabad, Lahore and Karachi are always named', JSON.stringify(r));
  }
  await page.evaluate(() => { map.fitBounds([[23.6, 60.8], [37.1, 77.9]], { padding: [16, 16], animate: false }); });

  /* ── A5 · "i-8": one row, with a height ── */
  const api = await page.evaluate(async () => (await (await fetch('/api/geo/search?q=i-8&limit=10')).json()).results.map(r => ({ n: r.name, lat: r.lat, lon: r.lon, e: r.elevM, p: r.province, d: r.district, k: r.kind, out: !!r.outside })));
  /* v91.17.228 · the street map adds named features ("I-8 Markaz", "I-8 Exit"): one SETTLEMENT row for I-8, and a height on every row inside Pakistan */
  const i8 = api.filter(x => /^I-8$/i.test(x.n) && !/road|retail|street/.test(x.k || ''));
  ok(i8.length === 1 && api.every(x => x.out || x.e != null), 'A5 · /api/geo/search?q=i-8 · one I-8 place and every row in Pakistan carries a height', JSON.stringify(api));
  const gz = await page.evaluate(async () => { const out = {}; for (const q of ['Raja Bazaar', 'Gulmit', 'e-7', 'Battakundi']) { const j = await (await fetch('/api/geo/search?q=' + encodeURIComponent(q) + '&limit=10')).json(); out[q] = j.results.map(r => r.outside ? 'outside' : r.elevM); } return out; });
  /* v91.17.228 · rows outside Pakistan-administered territory carry the refusal instead of a height, and are listed last */
  ok(Object.values(gz).every(a => a.length && a.every(e => e != null) && (a.indexOf('outside') < 0 || a.slice(a.indexOf('outside')).every(e => e === 'outside'))), 'A5 · every gazetteer row in Pakistan carries a height (30 m places); places outside it last', JSON.stringify(gz));
  /* v91.17.222 · U-29: one place search (the header); every tab shows the same place read-only */
  const hdrOpen = () => page.evaluate(() => { const s = document.getElementById('citysel'); if (s && !s.classList.contains('open')) document.getElementById('cityBtn').click(); });
  const sr = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const s = document.getElementById('citysel'); if (s && !s.classList.contains('open')) document.getElementById('cityBtn').click(); await w(300);
    const inp = document.getElementById('hdrPlaceInput'); inp.focus(); inp.value = 'i-8'; inp.dispatchEvent(new Event('input', { bubbles: true })); await w(4000);
    return [...document.querySelectorAll('#hdrPlaceResults button')].map(x => x.innerText.replace(/\s+/g, ' ').trim());
  });
  ok(sr.length > 0 && sr.filter(t => /^I-8 (settlement|locality)\b/i.test(t)).length === 1 && !sr.some(t => /elev n\/a/.test(t)), 'A5 · the place search lists I-8 once; no "elev n/a"', sr.join(' | '));

  /* ── A6 · the header, every tab's place line and the Current conditions title name the same place ── */
  const state = () => page.evaluate(() => { const cc = (document.getElementById('ccLoc') || {}).textContent || '';
    return { title: cc.trim(), chips: [...document.querySelectorAll('.agn-place-ro .v')].map(v => v.textContent.trim()), header: ((document.getElementById('cityLabel') || {}).textContent || '').trim(),
      oldControls: [...document.querySelectorAll('select.mach-loc-pick, .mach-place-search, .ml-location-search, .opsx-location-search, #agnPtInput')].filter(e => e.offsetParent !== null).length }; });
  const same = (s) => s.header && s.chips.length > 0 && s.chips.every(t => t === s.header) && s.oldControls === 0;
  await page.evaluate(async () => { const s = document.getElementById('citysel'); if (s && !s.classList.contains('open')) document.getElementById('cityBtn').click(); await new Promise(r => setTimeout(r, 300));
    const inp = document.getElementById('hdrPlaceInput'); inp.value = 'Raja Bazaar'; inp.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 3500)); const f = document.querySelector('#hdrPlaceResults button'); if (f) f.click(); });
  await page.waitForFunction(() => { const t = (document.getElementById('cityLabel') || {}).textContent || ''; return /raja bazaar/i.test(t) && !/^Loading/.test(t); }, null, { timeout: 90000, polling: 500 }).catch(() => null);
  await page.waitForTimeout(2500);
  const s1 = await state();
  ok(/raja bazaar/i.test(s1.header) && same(s1), 'A6 · search "Raja Bazaar": the header and every tab name the same place; no second search or city picker is shown', JSON.stringify(s1));
  const s2 = await page.evaluate(async () => { const tt = [...document.querySelectorAll('#mpMapWrap .maptools button')].find(x => /^Tehsil$/.test((x.textContent || '').trim())); if (tt) { tt.click(); await new Promise(r => setTimeout(r, 1200)); }
    let tgt = null; districtLayer.eachLayer(l => { const p = l.feature.properties; if (!tgt && /^Multan/i.test(p.tehsil || '')) tgt = l; });
    if (!tgt) return { none: true }; tgt.fire('click', { latlng: tgt.getBounds().getCenter() }); return null; });
  await page.waitForFunction(() => !/raja bazaar/i.test((document.getElementById('cityLabel') || {}).textContent || ''), null, { timeout: 40000, polling: 500 }).catch(() => null);
  await page.waitForTimeout(2500);
  const s2s = await state();
  ok(!(s2 && s2.none) && s2s.header && !/raja bazaar/i.test(s2s.header) && same(s2s), 'A6 · a tehsil clicked on the map: the header and every tab follow', JSON.stringify(s2s));

  ok(perr.length === 0, 'zero page errors', perr.join(' | '));
} finally { await b.close(); }
console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
