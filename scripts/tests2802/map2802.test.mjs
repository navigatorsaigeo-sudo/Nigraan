import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.280.2 · MAP2802 · start page for the public and businesses: hazard layer draws only Low and above (Normal, not yet issued and no level
// left clear) in the console legend colours, no tehsil / district / province line at any zoom (same-level areas merge with no seam), a legend
// chip, an "All Normal" note, a soft teal halo around the selected site's pin (no outline), province names as faint labels at country zoom
// (points from the AGN province polygons, fading out around zoom 8), card wording "surrounding area", the page version, 0 page/console/CSP errors.
// The test server's hazard run is days old, so hazard levels are a FIXTURE laid over the server's answer in the browser (marked FIXTURE).
// Browser test (playwright). usage: node scripts/tests2802/map2802.test.mjs <base url>
const BASE = process.argv[2] || 'http://127.0.0.1:9092';
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 900) : '')); } };
const COL = ['#BFD6B4', '#E8D48A', '#E6B655', '#E39A3B', '#C8553D'];
const today = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
/* FIXTURE levels by layer: drought cycles Normal, Low, Moderate, High, Severe, no data over the tehsils; heat all Normal; cold all Low */
const FIX = { drought: (i) => [0, 1, 2, 3, 4, -1][i % 6], heat: () => 0, cold: () => 1, wind: () => -1 };
const ALL = [];
async function open(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); const E = [];
  page.on('pageerror', (e) => E.push(String(e.message || e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) E.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective); }); });
  await page.route(/\/api\/levels\?layer=(drought|heat|cold|wind)&day=0$/, async (route) => { const r = await route.fetch(); const J = await r.json(); const k = /layer=(\w+)/.exec(route.request().url())[1];
    if (J.levels) { J.stale = false; J.at = new Date(Date.now() - 20 * 60e3).toISOString(); J.date = today(); let i = 0; for (const u of Object.keys(J.levels)) J.levels[u] = FIX[k](i++); }
    await route.fulfill({ response: r, json: J }); });
  /* FIXTURE site levels: fresh run, heat Low every day, the rest Normal (so the card shows its hazard block with levels) */
  await page.route('**/api/levels/unit?**', async (route) => { const r = await route.fetch(); const J = await r.json();
    if (Array.isArray(J.days) && J.days.length) { J.stale = false; J.at = new Date(Date.now() - 20 * 60e3).toISOString();
      J.days = [0, 1, 2, 3].map((i) => { const d = J.days[i] || J.days[0]; const L = {}; for (const k of ['heat', 'cold', 'rain_hz', 'flood', 'drought']) L[k] = { name: (d.layers[k] || {}).name || k, level: k === 'heat' ? 1 : 0, word: k === 'heat' ? 'Low' : 'Normal' };
        return { day: i, date: new Date(Date.parse(today() + 'T00:00:00Z') + i * 864e5).toISOString().slice(0, 10), layers: L }; }); }
    await route.fulfill({ response: r, json: J }); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.AGNSTART && window.map && window.AGNSTART.base, null, { timeout: 60000 }); await page.waitForTimeout(2500);
  ALL.push(E); return { ctx, page, E };
}
async function layer(page, k) { await page.evaluate((k) => window.AGNSTART.setHz(k, 0), k);
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('hzNote').textContent), null, { timeout: 60000 }); await page.waitForTimeout(800); }
/* median colour of a 7 x 7 patch around lat/lon points on the rendered screen */
async function colourAt(page, pts) {
  const xy = await page.evaluate((P) => P.map((p) => { const c = map.latLngToContainerPoint(p), o = map.getContainer().getBoundingClientRect(); return [Math.round(c.x + o.left), Math.round(c.y + o.top)]; }), pts);
  const png = (await page.screenshot()).toString('base64'); const vp = page.viewportSize(); const p2 = await page.context().newPage();
  const out = await p2.evaluate(async ([b64, XY, W, H]) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    return XY.map(([x, y]) => { const d = g.getImageData(x - 3, y - 3, 7, 7).data; const ch = [[], [], []];
      for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
      return ch.map((a) => a.sort((u, v) => u - v)[a.length >> 1]); }); }, [png, xy, vp.width, vp.height]);
  await p2.close(); return out;
}
const hzState = (page) => page.evaluate(() => { const S = window.AGNSTART, out = { paths: 0, fills: {}, bad: [], strokeDiff: 0, levelsDrawn: {}, other: 0 };
  if (S.hzLayer) S.hzLayer.eachLayer((l) => { if (l.getElement().getAttribute('fill') === 'url(#agnHatch)') { out.hatch = (out.hatch || 0) + 1; return; } out.paths++;   /* FIX2821 A: hatched "Not assessed" areas counted apart */ const f = l.feature.properties.uid, el = l.getElement(), fill = el.getAttribute('fill'), st = el.getAttribute('stroke');
    out.fills[fill] = (out.fills[fill] || 0) + 1; if (st && st !== 'none' && st.toLowerCase() !== fill.toLowerCase()) out.strokeDiff++; out.levelsDrawn[f] = fill; });
  map.eachLayer((l) => { if (l instanceof L.GeoJSON && l !== S.hzLayer) out.other++; });
  const pane = map.getPane('agnHz'); out.paneOp = getComputedStyle(pane).opacity; out.fillOp = [...pane.querySelectorAll('path')].map((p) => p.getAttribute('fill-opacity'))[0];
  out.dashed = [...document.querySelectorAll('.leaflet-pane path')].filter((p) => p.getAttribute('stroke-dasharray') && !/pk-(iiojk|loc)/.test(p.getAttribute('class') || '')).length;
  out.chip = document.getElementById('hzChip').hidden ? null : document.getElementById('hzChip').textContent; out.chipCls = document.getElementById('hzChip').className;
  out.legend = document.getElementById('hzLegend').textContent; return out; });

/* ---------- 1366: hazard layer ---------- */
{ const { ctx, page, E } = await open(1366, 768);
  const want = await page.evaluate(async (FIXs) => { const J = await (await fetch('/api/levels?layer=drought&day=0', { headers: { 'x-agn-view': 'customer' } })).json(); return Object.keys(J.levels || {}); });
  const lv = {}; want.forEach((u, i) => { lv[u] = FIX.drought(i); });
  await layer(page, 'drought'); const d = await hzState(page);
  const tehs = await page.evaluate(() => window.AGNSTART.tehs.features.map((f) => f.properties.uid));
  const expUp = tehs.filter((u) => lv[u] >= 1 && lv[u] <= 4).length, normal = tehs.filter((u) => lv[u] === 0).length, nod = tehs.filter((u) => !(u in lv) || lv[u] < 0).length;
  const drawnNormal = Object.keys(d.levelsDrawn).filter((u) => lv[u] === 0 || !(lv[u] >= 1)).length;
  ok(d.paths === expUp && drawnNormal === 0 && !d.fills[COL[0]] && !d.fills['#F1F4F2'] && normal > 0 && nod > 0, 'N1 FIXTURE Normal, not yet issued and no-data tehsils are not filled (clear): only Low and above are drawn', JSON.stringify({ drawn: d.paths, lowPlus: expUp, normal, noData: nod, fills: d.fills }));
  const wrong = Object.entries(d.levelsDrawn).filter(([u, c]) => c.toUpperCase() !== COL[lv[u]]).length;
  ok(wrong === 0 && [1, 2, 3, 4].every((i) => d.fills[COL[i]] > 0), 'N2 FIXTURE Low, Moderate, High, Severe each drawn in its console legend colour (per tehsil)', JSON.stringify(d.fills) + ' wrong ' + wrong);
  ok(d.strokeDiff === 0 && d.other === 0 && d.dashed === 0 && +d.paneOp > 0.5 && +d.paneOp < 0.6 && d.fillOp === '1', 'N3 no tehsil / district boundary line: no stroke differs from its own fill, one transparent pane (0.55), no other outline layer, no dashed line but IIOJK / LoC', JSON.stringify({ strokeDiff: d.strokeDiff, other: d.other, dashed: d.dashed, paneOp: d.paneOp, fillOp: d.fillOp }));
  ok(d.chip && /Low/.test(d.chip) && /Moderate/.test(d.chip) && /High/.test(d.chip) && /Severe/.test(d.chip) && /Normal: not coloured/.test(d.chip) && !/No level/.test(d.legend) && /not coloured/.test(d.legend), 'N4 legend chip on the map while the layer is on: Low · Moderate · High · Severe · Normal: not coloured (menu legend says the same)', d.chip + ' | ' + d.legend);
  /* seam test: cold = every tehsil Low; the colour on a vertex shared by two Low tehsils equals the colour inside them (no line, no hairline gap) */
  await layer(page, 'cold');
  const sh = await page.evaluate(() => { const F = window.AGNSTART.tehs.features, seen = new Map(), out = [];
    const ring = (g) => g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
    F.forEach((f, i) => ring(f.geometry).forEach((c) => { const k = c[0].toFixed(4) + ',' + c[1].toFixed(4); if (!seen.has(k)) seen.set(k, new Set()); seen.get(k).add(i); }));
    const B = map.getBounds().pad(-0.1), cands = [];
    for (const [k, s] of seen) if (s.size === 2) { const [x, y] = k.split(',').map(Number); if (B.contains([y, x]) && y > 25 && y < 31 && x > 66 && x < 72) cands.push([y, x]); }
    /* FIX2821: a vertex under a map control (the legend chip grew by the "Not assessed" key) is not a seam: the next candidate is taken */
    const under = (q) => { const cp = map.latLngToContainerPoint(q), r = map.getContainer().getBoundingClientRect(); return [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24]].some(([dx, dy]) => { const el = document.elementFromPoint(cp.x + r.left + dx, cp.y + r.top + dy); return !el || !!el.closest('#hzWrap,#zoom,#card,#pulse,#natStats,.leaflet-control-container'); }); };   /* 24 px: the controls' shadows */
    for (let i = 0; i < cands.length && out.length < 6; i += Math.max(1, Math.floor(cands.length / 6))) { let k = i; while (k < cands.length && under(cands[k])) k++; if (k < cands.length) out.push(cands[k]); } return out; });
  /* INTEG281: the painted relief under the fills varies by place; the seam test reads the fill pane over the plain map (relief pane hidden for the read) */
  await page.evaluate(() => { const r = map.getPane('agnRelief'); if (r) r.style.display = 'none'; const v = map.getPane('agnRiver'); if (v) v.style.display = 'none'; }); await page.waitForTimeout(300);   /* START282 · the river ribbons are hidden for the read too */
  const cs = await colourAt(page, sh); const low = await colourAt(page, [[27.0, 67.5], [29.5, 69.0], [26.0, 68.5]]);
  await page.evaluate(() => { const r = map.getPane('agnRelief'); if (r) r.style.display = ''; const v = map.getPane('agnRiver'); if (v) v.style.display = ''; });
  const ref = low[0]; const dmax = Math.max(...cs.map((c) => Math.max(...c.map((v, i) => Math.abs(v - ref[i])))));
  ok(sh.length >= 3 && dmax <= 6 && low.every((c) => Math.max(...c.map((v, i) => Math.abs(v - ref[i]))) <= 6), 'N5 FIXTURE same-level tehsils merge: the colour on vertices shared by two Low tehsils equals the Low fill inside (within 6 levels, no seam)', JSON.stringify({ n: sh.length, ref, cs, dmax }));
  /* all Normal */
  await layer(page, 'heat'); const h = await hzState(page);
  ok(h.paths === 0 && (h.hatch ? /^No assessed area above Normal today for Heat stress·Not assessed \(\d+ areas?\)/.test(h.chip) : /^All Normal today for Heat stress/.test(h.chip)) && /alln/.test(h.chipCls), 'N6 FIXTURE every tehsil with a level Normal: nothing filled; "All Normal" only when no area lacks a level (FIX2821)', JSON.stringify({ paths: h.paths, chip: h.chip }));
  await layer(page, 'wind'); const wd = await hzState(page);
  ok(wd.paths === 0 && wd.hatch > 500 && /^No area has a level today for Wind and gusts·Not assessed/.test(wd.chip || ''), 'N7 FIXTURE no level anywhere: no level fill, every area hatched "Not assessed", said plainly (not "All Normal")', wd.chip);
  await page.evaluate(() => window.AGNSTART.setHz(null, 0)); await page.waitForTimeout(300); const off = await hzState(page);
  ok(off.paths === 0 && off.chip === null && (await page.textContent('#hzBtnTxt')) === 'Hazard layers · off', 'N8 layer off: no fill, no chip, button says off (off by default as before)', JSON.stringify({ chip: off.chip }));
  /* province labels at country zoom */
  const pl = await page.evaluate(() => { const S = window.AGNSTART, fr = S.bound.frontier; const pip = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a.lat > pt.lat) !== (b.lat > pt.lat) && pt.lng < (b.lng - a.lng) * (pt.lat - a.lat) / (b.lat - a.lat) + a.lng) c = !c; } return c; };
    const rings = fr.getLatLngs().map((r) => Array.isArray(r[0]) ? r[0] : r);
    const L = S.prov.map((m) => { const el = m.getElement(), sp = el.firstChild, r = sp.getBoundingClientRect(), cs = getComputedStyle(sp); return { name: sp.textContent, shown: !el.classList.contains('off'), inside: rings.some((rg) => pip(m.getLatLng(), rg)), r: [r.left, r.top, r.right, r.bottom], ls: parseFloat(cs.letterSpacing), op: +cs.opacity, tt: cs.textTransform, fs: parseFloat(cs.fontSize) }; });
    const lab = S.bound.label.getElement().getBoundingClientRect(); return { L, z: map.getZoom(), paneOp: getComputedStyle(map.getPane('agnLab')).opacity, src: JSON.parse(document.getElementById('agn-pk-prov').textContent).src, iio: [lab.left, lab.top, lab.right, lab.bottom] }; });
  const big = ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Gilgit-Baltistan'];
  const shown = pl.L.filter((x) => x.shown); const ov = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const overlaps = shown.filter((a, i) => shown.some((b, j) => j > i && ov(a.r, b.r)) || ov(a.r, pl.iio)).map((x) => x.name);
  ok(big.every((n) => shown.some((x) => x.name === n)) && pl.L.length === 7 && pl.L.every((x) => x.inside) && /province polygons/.test(pl.src), 'N9 province names at country zoom (Punjab, Sindh, KP, Balochistan, GB shown; AJK, ICT where they fit), every label point inside Pakistan, points from the AGN province polygons', JSON.stringify({ z: pl.z, shown: shown.map((x) => x.name) }));
  ok(!overlaps.length && shown.every((x) => x.ls >= 3 && x.op < 0.6 && x.tt === 'uppercase' && x.fs >= 11) && +pl.paneOp === 1, 'N10 labels large-letter-spaced and faint (opacity < 0.6), none overlapping another or the IIOJK label', JSON.stringify({ overlaps, s: shown.map((x) => [x.name, x.fs, x.ls, x.op]) }));
  const fade = []; for (const z of [7.5, 8, 8.5, 10]) { await page.evaluate((z) => map.setView([33.6, 73.4], z, { animate: false }), z); await page.waitForTimeout(400);
    fade.push(await page.evaluate(() => { const P = map.getPane('agnLab'); const a = window.AGNSTART.prov.find((m) => /Azad/.test(m._agn.name)).getElement(); return [map.getZoom(), +getComputedStyle(P).opacity, getComputedStyle(P).display, !a.classList.contains('off'), a.firstChild.style.transform]; })); }
  ok(fade[0][1] === 1 && fade[1][1] > 0 && fade[1][1] < 1 && fade[2][2] === 'none' && fade[3][2] === 'none' && fade[0][3] && /rotate\(-?[6-9]\d/.test(fade[0][4]), 'N11 labels fade out from zoom 7.5 to none at 8.5 (hidden above); AJK written along its long axis where it fits (zoom 7.5)', JSON.stringify(fade));
  /* no province / district / tehsil line anywhere: the only stroked vectors are the frontier, IIOJK, LoC (and the halo has no stroke) */
  const lines = await page.evaluate(() => [...document.querySelectorAll('.leaflet-pane path')].filter((p) => p.getAttribute('stroke') && p.getAttribute('stroke') !== 'none' && !/pk-(frontier|iiojk|loc)|hz-fill/.test(p.getAttribute('class') || '')).map((p) => p.getAttribute('class')));
  ok(!lines.length, 'N12 no province, district or tehsil line at any zoom (stroked vectors: national frontier, IIOJK, Line of Control only)', JSON.stringify(lines));
  /* after a search: pin + soft teal halo, no outline; card wording */
  await page.evaluate(() => map.setZoom(6)); await page.fill('#q', 'G-8, Islamabad'); await page.click('#go');
  await page.waitForFunction(() => document.querySelector('#card[data-ready]') && document.querySelector('#hzSec'), null, { timeout: 90000 }).catch(() => {}); await page.waitForTimeout(1200);
  const sel = await page.evaluate(() => { const S = window.AGNSTART, h = S.halo, el = h && h.getElement(); return { pins: S.pinCount(), halo: !!h, r: h && h.getRadius(), c: h && h.getLatLng(), p: S.place && [S.place.lat, S.place.lon], fill: el && el.getAttribute('fill'), fo: el && +el.getAttribute('fill-opacity'), stroke: el && el.getAttribute('stroke'), outline: document.querySelectorAll('.sel-tehsil').length,
    geo: (() => { let n = 0; map.eachLayer((l) => { if (l instanceof L.GeoJSON) n++; }); return n; })(), card: document.getElementById('card').innerText, hz: document.getElementById('hzSec').innerText }; });
  ok(sel.pins === 1 && sel.halo && sel.r >= 2000 && sel.r <= 3000 && Math.abs(sel.c.lat - sel.p[0]) < 1e-6 && /^#2f8f8a$/i.test(sel.fill) && sel.fo < 0.3 && (sel.stroke === null || sel.stroke === 'none') && sel.outline === 0 && sel.geo === 0, 'N13 after a search: the pin and a soft teal halo around it (2-3 km, no edge line), no tehsil outline or other area shape', JSON.stringify({ pins: sel.pins, r: sel.r, fill: sel.fill, fo: sel.fo, stroke: sel.stroke, outline: sel.outline, geo: sel.geo }));
  ok(!/tehsil/i.test(sel.card) && /surrounding area/i.test(sel.hz) && /Low for the surrounding area/.test(sel.hz), 'N14 FIXTURE card wording: no "tehsil" anywhere on the card (action texts included); levels are "for the surrounding area"', sel.hz.replace(/\n/g, ' | ').slice(0, 300));
  await page.click('.tab[data-t="hz"]'); await page.waitForTimeout(600); const wide = await page.evaluate(() => document.getElementById('pane_hz').innerText);
  ok(!/tehsil/i.test(wide) && /Levels are for the surrounding area/.test(wide), 'N15 FIXTURE Hazards tab (START282: the former full view): "Levels are for the surrounding area", no "tehsil"', wide.slice(0, 200));
  await page.evaluate(() => document.getElementById('home').click()); await page.waitForTimeout(400); const h2 = await page.evaluate(() => ({ halo: !!window.AGNSTART.halo, pins: window.AGNSTART.pinCount(), n: document.querySelectorAll('.sel-halo').length }));
  ok(!h2.halo && h2.pins === 0 && h2.n === 0, 'N16 Start again removes the pin and its halo', JSON.stringify(h2));
  const v = await page.evaluate(() => (document.querySelector('meta[name="agn-version"]') || {}).content);
  ok(v === '91.17.282.1', 'N17 the page carries its version (meta agn-version 91.17.282.1 since FIX2821; the deploy live check reads it)', v);
  const csp = await page.evaluate(() => window.__csp || []);
  ok(!E.length && !csp.length, 'N18 0 page / console / CSP errors (1366)', JSON.stringify({ E, csp }));
  await ctx.close();
}
/* ---------- phone: chip fits, no horizontal scroll ---------- */
{ const { ctx, page, E } = await open(390, 844);
  await layer(page, 'drought'); const r = await page.evaluate(() => { const c = document.getElementById('hzChip').getBoundingClientRect(); return { l: c.left, r: c.right, vw: innerWidth, sw: document.documentElement.scrollWidth, shown: !document.getElementById('hzChip').hidden }; });
  const csp = await page.evaluate(() => window.__csp || []);
  ok(r.shown && r.l >= 0 && r.r <= r.vw && r.sw <= r.vw && !E.length && !csp.length, 'N19 phone width: the legend chip fits on screen, no horizontal scroll, 0 errors', JSON.stringify({ r, E, csp }));
  await ctx.close();
}
await browser.close();
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL'); process.exit(fail ? 1 : 0);
