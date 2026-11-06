import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.74 · UI · the CEO's four map asks, measured on the page a browser loads.
     node scripts/tests74/ui.test.mjs [baseUrl]        default http://127.0.0.1:8787
   1. a map popup stays open (5 s) and is not under the map toolbar
   2. every hazard map key reads exactly Normal / Low / Moderate / High / Severe
   3. Normal units wear the light green tint (75; was: unfilled) and stay apart from the unfilled mask; High and Severe use
      the one palette; "Check these" counts High + Severe
   4. no 3D or Animate control, no animated-weather checkbox; zero page errors                                            */
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const PW = __T.playwrightUrl() || 'playwright';
const CHROME = __T.chromiumPath();
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 260) : '')); };
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
/* v91.17.269 A10 · the heat and cold keys name the five levels by their UTCI stress class (agn-hz5-js HW, the UTCI-to-AGN mapping of the
   model gate entries utci-agn-map / utci-agn-cold-map): one row per level, in level order. The rain key adds two Normal sub-states
   ("Normal, rain day more likely than not", "Normal, rained earlier today ..."), drawn in their own blue tints; they are not levels. */
const KEYWORDS = { heat: ['No heat stress (UTCI under 26 °C)', 'Moderate heat stress (26–32)', 'Strong heat stress (32–38)', 'Very strong heat stress (38–46)', 'Extreme heat stress (46+)'],
  cold: ['No or slight cold stress (UTCI above 0 °C)', 'Moderate cold stress (0 to −13)', 'Strong cold stress (−13 to −27)', 'Very strong cold stress (−27 to −40)', 'Extreme cold stress (below −40)'] };
const PAL = { high: '#e8552d', severe: '#a50026' };
const LAYERS = ['flood', 'flood_pluvial', 'flood_riverine', 'landslide', 'glof', 'heat', 'cold', 'wind', 'drought', 'seismic', 'cyclone', 'rain_hz'];

const _pw = await __T.playwright(); const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
const b = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const perr = []; page.on('pageerror', e => perr.push(String(e && e.message).slice(0, 200)));
  await page.addInitScript(() => { window.__AGN_HARNESS = true; });
  await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const ready = await page.waitForFunction(() => !!(window.AGN && AGN.hz5 && typeof districtLayer !== 'undefined' && document.querySelector('#v3legend[data-hz5="1"]') && window.AGN.hzMask), null, { timeout: 180000 }).then(() => true).catch(() => false);
  ok(ready, 'page loaded with the one-scale map key');
  await page.waitForTimeout(25000);   /* the national sweep lands */

  /* ── 4 · no 3D / Animate ── */
  const t4 = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const tools = document.querySelector('#mpMapWrap .maptools');
    const words = tools ? [...tools.querySelectorAll('button')].map(x => (x.textContent || '').trim()) : [];
    const o = { words, btn3d: !!document.getElementById('agn3dBtn'), anim: !!document.getElementById('agn3dAnim'), panes: document.querySelectorAll('[class*="agn3d"]').length };
    const ob = document.getElementById('agnOlMapBtn'); if (ob) ob.click(); await w(2500);
    const sel = document.getElementById('agnOlSel'); if (sel) { sel.value = 'air:fires'; sel.dispatchEvent(new Event('change', { bubbles: true })); } await w(6000);
    o.olAnim = !!document.getElementById('agnOlAnim'); o.olText = (document.getElementById('agnOlMap') || {}).innerText || '';
    o.olLevels = [...document.querySelectorAll('#agnOlMap [data-hz5-level]')].map(x => x.getAttribute('data-hz5-level'));
    o.canvas = [...document.querySelectorAll('#map canvas')].filter(c => c.style.zIndex === '590').length;
    const chip = document.getElementById('agnCheckChip'); o.olChip = chip && !chip.hidden ? Number(chip.getAttribute('data-count')) : null;
    const pane = document.querySelector('.leaflet-agnOutlook-pane svg'); const ps = pane ? [...pane.querySelectorAll('path')] : [];
    o.olHS = ps.filter(p => ['#e8552d', '#a50026'].includes((p.getAttribute('fill') || '').toLowerCase()) && Number(p.getAttribute('fill-opacity')) > 0.5).length;
    const cl = document.getElementById('agnOlClear'); if (cl) cl.click(); await w(1500);
    const x = document.querySelector('#agnOlMap .x'); if (x) x.click(); await w(500);
    return o;
  });
  ok(!t4.btn3d && !t4.anim && !t4.words.some(x => /^(3D|Animate)$/.test(x)), 'no 3D or Animate button on the map toolbar', t4.words.join(' | '));
  ok(t4.panes === 0 && t4.canvas === 0, 'no 3D relief pane and no weather canvas on the map', t4.panes + ' panes · ' + t4.canvas + ' canvases');
  ok(!t4.olAnim && !/Animated weather/.test(t4.olText), 'the Outlook layers panel has no animated-weather checkbox', t4.olAnim);
  ok(JSON.stringify(t4.olLevels) === JSON.stringify(WORDS), 'outlook class layer (crop fires) keys the five levels', t4.olLevels.join('/'));
  ok(t4.olChip === t4.olHS, '"Check these" on the outlook class layer counts its High + Severe units', t4.olChip + ' chip vs ' + t4.olHS + ' painted');

  /* ── 2 + 3 · every hazard layer: the key, the fill, the chip ── */
  for (const hz of LAYERS) {
    const r = await page.evaluate(async (hz) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const p = document.getElementById('mapHazardPick'); p.value = hz; p.dispatchEvent(new Event('change', { bubbles: true })); await w(3000);
      const leg = document.getElementById('v3legend');
      const labels = [...leg.querySelectorAll('.agn-leg-row:not(.agn-leg-meaning):not(.agn-leg-note):not(.agn-leg-valid):not(.agn-leg-dist)')].map(x => (x.querySelector('b') || {}).textContent).filter(t => t && !/^No data$|^No reading$|^Does not occur here$|^No modelled river reach \(not assessed\)$|^Unfilled|^Line of Control|^Normal, /.test(t));   /* the river layer's not-applicable row has its own words (v91.17.269 A10) */
      const H = AGN.hz5, lv = [0, 0, 0, 0, 0]; let normalBad = 0, normalN = 0, hsBad = 0, hsDom = 0, foreign = 0; const foreignEx = [];
      const allowed = new Set(H.fill.concat(['#e5ebf0', '#b9bec4', '#c8d2da', 'rgba(0,0,0,0)', '#aab1b8', '#9467c9', 'url(#agnNAHatch)', 'url(#agnnahatch)', '#c9b6ea', '#ffffff']));   /* (75) No data is #aab1b8; the IIOJK tehsil path is #ffffff at 0 (the province layer draws its hatch) */
      districtLayer.eachLayer(l => {
        const pp = l.feature.properties, el = l._path; if (!el) return;
        const fill = (el.getAttribute('fill') || '').toLowerCase(), fo = Number(el.getAttribute('fill-opacity'));
        if (fo > 0 && !allowed.has(fill)) { foreign++; if (foreignEx.length < 3) foreignEx.push(fill); }
        if ((fill === '#e8552d' || fill === '#a50026') && fo > 0.5) hsDom++;
        if (pp.province === 'IIOJK' || pp.dq === true) return;
        let h = null; try { h = districtHazardInfo(pp.key); } catch (_) {}
        if (!h) return; const L = H.levelOf(hz, h.score, h); if (L.i == null) return; lv[L.i]++;
        if (L.i === 0) { normalN++; if (!(fill === H.fill[0] && Math.abs(fo - H.opacity[0]) < 0.01 && fo > 0)) normalBad++; }   /* (75) Normal is a light green tint (CEO), not unfilled */
        if (L.i >= 3 && !((fill === (L.i === 3 ? '#e8552d' : '#a50026')) && fo > 0.5)) hsBad++;
      });
      const chip = document.getElementById('agnCheckChip');
      return { labels, lv, normalN, normalBad, hsBad, hsDom, foreign, foreignEx, chip: chip && !chip.hidden ? Number(chip.getAttribute('data-count')) : null,
               dist: ((leg.querySelector('.agn-leg-dist') || {}).textContent || '').slice(0, 140) };
    }, hz);
    ok(JSON.stringify(r.labels) === JSON.stringify(KEYWORDS[hz] || WORDS), hz + ' · the map key reads exactly ' + (KEYWORDS[hz] ? 'the five UTCI stress classes, in level order' : 'Normal / Low / Moderate / High / Severe'), r.labels.join('/'));
    ok(r.normalBad === 0, hz + ' · Normal units wear the light green tint, visibly apart from the unfilled mask (75; was: unfilled)', r.normalN + ' Normal units, ' + r.normalBad + ' not in the Normal tint');
    ok(r.hsBad === 0 && r.foreign === 0, hz + ' · High and Severe units wear #e8552d / #a50026; no old ramp colour is left', 'mismatched ' + r.hsBad + ' · foreign fills ' + r.foreign + ' ' + r.foreignEx.join(','));
    ok(r.chip === r.lv[3] + r.lv[4] && r.chip === r.hsDom, hz + ' · "Check these" = the High + Severe units on the map', 'chip ' + r.chip + ' · levels ' + r.lv.join('/') + ' · painted ' + r.hsDom + ' · ' + r.dist);
  }
  /* the list zooms to a unit */
  const z = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const p = document.getElementById('mapHazardPick'); p.value = 'seismic'; p.dispatchEvent(new Event('change', { bubbles: true })); await w(3000);
    const chip = document.getElementById('agnCheckChip'); chip.click(); await w(400);
    const rows = [...document.querySelectorAll('#agnCheckList button[data-k]')]; const z0 = map.getZoom();
    if (rows[0]) rows[0].click(); await w(1800);
    const out = { rows: rows.length, chip: Number(chip.getAttribute('data-count')), z0, z1: map.getZoom(), first: rows[0] ? rows[0].innerText.replace(/\s+/g, ' ') : null };
    chip.click(); p.value = 'flood'; p.dispatchEvent(new Event('change', { bubbles: true })); await w(1500);
    return out;
  });
  ok(z.rows === z.chip && z.rows > 0 && z.z1 > z.z0, 'the "Check these" list names each unit with its level and zooms to it on click', JSON.stringify(z));

  /* ── 1 · the Gilgit popup ── */
  const pt = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    /* tehsil mode, and the Gilgit pin (the popup the CEO saw: temperature, wind, risk, "As of … · MAch") */
    const tt = [...document.querySelectorAll('#mpMapWrap .maptools button')].find(x => /^Tehsil$/.test((x.textContent || '').trim())); if (tt && !tt.classList.contains('on')) { tt.click(); await w(800); }
    const st = (typeof STATIONS !== 'undefined' ? STATIONS : []).find(s => /^Gilgit$/i.test(s.name)); const mk = st && typeof markers !== 'undefined' && markers[st.id];
    if (!mk) return { none: true, why: 'no Gilgit pin' };
    /* the CEO's case: Gilgit sits just below the toolbar, so a popup opening upward from the pin lands under it */
    map.closePopup(); map.setView(mk.getLatLng(), 7, { animate: false }); await w(600);
    const r = map.getContainer().getBoundingClientRect(), tb = document.querySelector('#mpMapWrap .maptools').getBoundingClientRect();
    const c = map.latLngToContainerPoint(mk.getLatLng()); map.panBy([0, c.y - (Math.max(0, tb.bottom - r.top) + 60)], { animate: false });   /* (84) the toolbar now sits above the map: 60 px below the map top */ await w(900);
    const ic = mk._icon && mk._icon.getBoundingClientRect(); if (!ic) return { none: true, why: 'pin not drawn' };
    const x = ic.left + ic.width / 2, y = ic.top + ic.height / 2, el = document.elementFromPoint(x, y);
    return { x, y, zoom: map.getZoom(), hit: el && el.closest && el.closest('.leaflet-marker-icon') ? 'Gilgit pin' : (el && el.tagName), toolbarBottom: Math.round(tb.bottom) };
  });
  ok(pt && !pt.none, 'the Gilgit pin is on screen just below the toolbar (tehsil mode)', JSON.stringify(pt));
  if (pt && !pt.none) {
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(700);
    const opened = await page.evaluate(() => !!document.querySelector('.leaflet-popup'));
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => {
      const pop = document.querySelector('.leaflet-popup'), tb = document.querySelector('#mpMapWrap .maptools');
      if (!pop) return { open: false };
      const a = pop.getBoundingClientRect(), t = tb.getBoundingClientRect();
      const inter = !(a.right <= t.left || a.left >= t.right || a.bottom <= t.top || a.top >= t.bottom);
      const zp = Number(getComputedStyle(document.querySelector('.leaflet-popup-pane')).zIndex), zo = Number(getComputedStyle(document.querySelector('.leaflet-overlay-pane')).zIndex), zt = Number(getComputedStyle(tb).zIndex);
      return { open: true, inter, pop: [a.left, a.top, a.right, a.bottom].map(Math.round), tb: [t.left, t.top, t.right, t.bottom].map(Math.round), txt: pop.innerText.replace(/\s+/g, ' ').slice(0, 70), zp, zo, zt };
    });
    ok(opened && st.open, 'the Gilgit popup opens and is still open 5 s later', JSON.stringify({ opened, open: st.open, txt: st.txt }));
    ok(st.open && !st.inter, 'the popup does not sit under the map toolbar', JSON.stringify({ pop: st.pop, toolbar: st.tb }));
    ok(st.open && st.zp > st.zo && st.zt > 400, 'the popup sits above the map fill and below the toolbar', 'popup pane ' + st.zp + ' · overlay ' + st.zo + ' · toolbar ' + st.zt + ' (outside the map pane)');
  }
  ok(perr.length === 0, 'zero page errors', perr.join(' | '));
} finally { await b.close(); }
console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
