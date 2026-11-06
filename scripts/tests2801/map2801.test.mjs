import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.280.1 · MAP2801 · start page map: the street renderer's "white" flavour (no landcover yellow), the AGN official frontier (bundle 3.3.0:
// AJK and GB inside, IIOJK grey + dashed and labelled "IIOJK (disputed)", Line of Control dashed), a soft mask outside Pakistan in a pane below the
// overlays, no edge where the street archive ends, the search card docked top-left and the first view fitting Pakistan to its right.
// Browser test (playwright). usage: node scripts/tests2801/map2801.test.mjs <base url>
const BASE = process.argv[2] || 'http://127.0.0.1:9072';
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 900) : '')); } };
async function open(w, h, route) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); const E = [];
  page.on('pageerror', (e) => E.push(String(e.message || e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) E.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective); }); });
  if (route) await route(page);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.AGNSTART && window.map && window.AGNSTART.base, null, { timeout: 60000 }); await page.waitForTimeout(3000);
  return { ctx, page, E };
}
/* median colour of a 15 x 15 patch around a lat/lon on the rendered screen */
async function colourAt(page, pts) {
  const xy = await page.evaluate((P) => P.map((p) => { const c = map.latLngToContainerPoint(p), o = map.getContainer().getBoundingClientRect(); return [Math.round(c.x + o.left), Math.round(c.y + o.top)]; }), pts);
  const png = (await page.screenshot()).toString('base64'); const vp = page.viewportSize();
  const p2 = await page.context().newPage();
  const out = await p2.evaluate(async ([b64, XY, W, H]) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    return XY.map(([x, y]) => { const d = g.getImageData(x - 7, y - 7, 15, 15).data; const ch = [[], [], []];
      for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
      return ch.map((a) => a.sort((u, v) => u - v)[a.length >> 1]); }); }, [png, xy, vp.width, vp.height]);
  await p2.close(); return out;
}
/* ---------- 1366 x 768 first view ---------- */
{ const { ctx, page, E } = await open(1366, 768);
  const s = await page.evaluate(() => { const S = window.AGNSTART, b = S.bound || {}; const q = (c) => document.querySelector('.' + c);
    const pane = (n) => +getComputedStyle(map.getPane(n)).zIndex; const ov = +getComputedStyle(map.getPane('overlayPane')).zIndex, tp = +getComputedStyle(map.getPane('tilePane')).zIndex;
    const json = document.getElementById('agn-pk-bound').textContent; const J = JSON.parse(json);
    const nb = b.frontier ? b.frontier.getBounds() : null; const hr = document.getElementById('hero').getBoundingClientRect(), br = document.getElementById('brand').getBoundingClientRect();
    const sw = nb && map.latLngToContainerPoint(nb.getSouthWest()), ne = nb && map.latLngToContainerPoint(nb.getNorthEast()); const sz = map.getSize();
    return { flavor: S.flavor, base: S.base, mask: !!q('pk-mask'), maskOp: q('pk-mask') && q('pk-mask').getAttribute('fill-opacity'), maskHoles: b.mask ? b.mask.getLatLngs().length : 0,
      maskPane: pane('agnMask'), frontPane: pane('agnFrontier'), ov, tp, front: !!q('pk-frontier'), frontDash: q('pk-frontier') && q('pk-frontier').getAttribute('stroke-dasharray'),
      iio: !!q('pk-iiojk'), iioFill: q('pk-iiojk') && q('pk-iiojk').getAttribute('fill'), iioDash: q('pk-iiojk') && q('pk-iiojk').getAttribute('stroke-dasharray'),
      loc: !!q('pk-loc'), locDash: q('pk-loc') && q('pk-loc').getAttribute('stroke-dasharray'), lab: q('pk-lab') && q('pk-lab').textContent,
      src: J.src, jsonBytes: json.length, nb: nb && [nb.getWest(), nb.getSouth(), nb.getEast(), nb.getNorth()].map((x) => +x.toFixed(2)),
      hero: [hr.left, hr.top, hr.right, hr.bottom].map(Math.round), brandBottom: Math.round(br.bottom), pk: sw && [sw.x, ne.y, ne.x, sw.y].map(Math.round), size: [sz.x, sz.y], zoom: map.getZoom(),
      attr: document.querySelector('.leaflet-control-attribution').textContent, bg: getComputedStyle(map.getContainer()).backgroundColor, csp: window.__csp || [] }; });
  ok(s.flavor === 'white' && s.base && s.base.flavor === 'white', 'M1 street renderer flavour is "white" (not the light/OSM colours)', JSON.stringify(s.base));
  ok(s.mask && Math.abs(+s.maskOp - 0.62) < 0.05 && s.maskHoles >= 2, 'M2 mask over everything outside Pakistan (soft, opacity ~0.6, the frontier rings as holes)', s.maskOp + ' rings ' + s.maskHoles);
  ok(s.maskPane > s.tp && s.maskPane < s.ov && s.frontPane < s.ov && s.frontPane > s.maskPane, 'M3 mask and frontier panes sit between the street tiles and the overlays (hazard fill, pins stay on top)', [s.tp, s.maskPane, s.frontPane, s.ov].join(' < '));
  ok(s.front && !s.frontDash && s.nb && Math.abs(s.nb[0] - 60.87) < 0.02 && Math.abs(s.nb[2] - 79.31) < 0.02 && Math.abs(s.nb[1] - 23.81) < 0.05 && Math.abs(s.nb[3] - 37.09) < 0.02, 'M4 national frontier drawn solid from the AGN bundle (extent 60.87-79.31 E, 23.81-37.09 N: AJK, GB and IIOJK inside)', JSON.stringify(s.nb));
  ok(s.iio && /^#bfbfbf$/i.test(s.iioFill) && s.iioDash && s.lab === 'IIOJK (disputed)', 'M5 IIOJK grey #BFBFBF, dashed edge, labelled "IIOJK (disputed)"', [s.iioFill, s.iioDash, s.lab].join(' | '));
  ok(s.loc && s.locDash && s.locDash !== s.frontDash, 'M6 Line of Control dashed, distinct from the frontier', s.locDash);
  ok(/AI Geo Navigators boundary data \(2026\)/.test(s.src) && /Boundaries: AI Geo Navigators \(2026\)/.test(s.attr) && s.jsonBytes <= 160000, 'M7 boundary source named, attribution shown, inline boundary <= 160 KB (INTEG281: GEO281 outline at ~45 m, 151 KB)', s.jsonBytes + ' bytes');
  ok(Math.abs((s.hero[0] + s.hero[2]) / 2 - 683) <= 2 && s.hero[1] >= s.brandBottom && s.hero[2] - s.hero[0] <= 680 && s.hero[3] < 300, 'M8 (START282) search centred at the top below the bars, <= 680 px wide, compact', JSON.stringify(s.hero) + ' brand bottom ' + s.brandBottom);
  ok(s.pk[1] + 98 >= s.hero[3] && s.pk[0] >= 0 && s.pk[2] <= s.size[0] && s.pk[3] <= s.size[1] && s.zoom >= 5.25, 'M9 (START282) first view: all of Pakistan below the centred search and inside the screen at 1366 x 768 (zoom >= 5.25)', JSON.stringify({ pk: s.pk, hero: s.hero, zoom: s.zoom }));
  ok(s.bg === 'rgb(255, 255, 255)', 'M10 (START282) map background = the street renderer earth colour, white (masked land reads the same in and out of the archive)', s.bg);
  /* rendered colours: no yellow inside Pakistan; no step where the street archive's tiles end (z6 tiles 44-45/26 of the Islamabad extract here) */
  const [pkIn, afIn, afOut] = await colourAt(page, [[30.0, 66.9], [33.3, 68.6], [33.3, 66.2]]);
  const yellow = (c) => c[0] - c[2] > 10 && c[1] - c[2] > 10;
  ok(!yellow(pkIn) && !yellow(afIn), 'M11 no desert / farmland yellow (Balochistan, masked Afghanistan)', JSON.stringify([pkIn, afIn]));
  const dd = Math.max(...afIn.map((v, i) => Math.abs(v - afOut[i])));
  ok(dd <= 4, 'M12 no hard edge at the street archive boundary outside Pakistan (masked colour in vs out of the archive within 4 levels)', JSON.stringify([afIn, afOut]) + ' max diff ' + dd);
  ok(E.length === 0 && s.csp.length === 0, 'M13 no page / console / CSP errors (1366)', JSON.stringify(E.concat(s.csp)));
  await ctx.close(); }
/* ---------- 1920 x 1080 and phone ---------- */
{ const { ctx, page, E } = await open(1920, 1080);
  const s = await page.evaluate(() => { const b = AGNSTART.bound.frontier.getBounds(), h = document.getElementById('hero').getBoundingClientRect(); const sw = map.latLngToContainerPoint(b.getSouthWest()), ne = map.latLngToContainerPoint(b.getNorthEast()); return { pk: [sw.x, ne.y, ne.x, sw.y].map(Math.round), right: Math.round(h.right), bottom: Math.round(h.bottom), size: [map.getSize().x, map.getSize().y], zoom: map.getZoom() }; });
  ok(s.pk[1] + 98 >= s.bottom && s.pk[0] >= 0 && s.pk[2] <= s.size[0] && s.pk[3] <= s.size[1] && s.zoom >= 6, 'M14 (START282) first view at 1920 x 1080: Pakistan below the centred search, inside the screen (zoom >= 6)', JSON.stringify(s));
  ok(E.length === 0, 'M15 no page errors (1920)', JSON.stringify(E)); await ctx.close(); }
{ const { ctx, page, E } = await open(390, 844);
  const s = await page.evaluate(() => { const b = AGNSTART.bound.frontier.getBounds(), h = document.getElementById('hero').getBoundingClientRect(); const sw = map.latLngToContainerPoint(b.getSouthWest()), ne = map.latLngToContainerPoint(b.getNorthEast()); return { pk: [sw.x, ne.y, ne.x, sw.y].map(Math.round), hero: [h.left, h.top, h.right, h.bottom].map(Math.round) }; });
  ok(s.hero[0] <= 16 && s.hero[2] >= 374 && s.pk[1] + 98 >= s.hero[3] - 2, 'M16 phone: the card stays on top, full width; Pakistan fitted below it', JSON.stringify(s));
  ok(E.length === 0, 'M17 no page errors (phone)', JSON.stringify(E)); await ctx.close(); }
/* ---------- no raster map under the local street tiles (it came through the upstream tile proxy: not offline); raster only when the archive is missing ---------- */
{ const req = []; const { ctx, page, E } = await open(1366, 768, async (p) => { p.on('request', (r) => { if (/\/tiles\/(v\d+\/)?(light|config)/.test(r.url())) req.push(r.url().replace(/^https?:\/\/[^/]+/, '')); }); });
  const s = await page.evaluate(() => { let tl = 0; map.eachLayer((l) => { if (l instanceof L.TileLayer && !/\/tiles\/relief\//.test(l._url || '')) tl++; }); return { base: AGNSTART.base, tl }; });
  ok(s.base.kind === 'streets' && s.base.underlay === false && s.tl === 0 && req.length === 0, 'M18 street archive present: no raster map underneath, no raster tile request on first view', JSON.stringify(s) + ' raster requests ' + req.length + ' ' + req.slice(0, 3).join(' '));
  ok(E.length === 0, 'M19 no page errors (street archive case)', JSON.stringify(E)); await ctx.close(); }
{ const req = []; const { ctx, page } = await open(1366, 768, async (p) => { p.on('request', (r) => { if (/\/tiles\/(v\d+\/)?(light|imagery|config)/.test(r.url())) req.push(r.url().replace(/^https?:\/\/[^/]+/, '')); }); await p.route('**/tiles/streets/status', (r) => r.fulfill({ json: { ready: false, why: 'test: not installed' } })); });
  await page.waitForFunction(() => window.AGNSTART.base && window.AGNSTART.base.kind === 'none', null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1500);
  const s = await page.evaluate(() => { let tl = 0; map.eachLayer((l) => { if (l instanceof L.TileLayer && !/\/tiles\/relief\//.test(l._url || '')) tl++; }); return { base: AGNSTART.base, tl, mask: !!document.querySelector('.pk-mask'), att: (document.querySelector('.leaflet-control-attribution') || {}).textContent || '' }; });
  /* VER282: no raster fallback any more - the light map is Esri imagery behind the server's upstream proxy (unlicensed, not offline) */
  ok(s.base && s.base.kind === 'none' && s.tl === 0 && s.mask && req.length === 0 && !/Esri|Maxar/.test(s.att), 'M22 street archive missing: white ground, no raster map and no Esri credit (mask and frontier still drawn)', JSON.stringify(s).slice(0, 300) + ' raster requests ' + req.length); await ctx.close(); }
/* ---------- home button refits; search still opens the left site card ---------- */
{ const { ctx, page } = await open(1366, 768);
  await page.evaluate(() => map.setView([31.5, 74.3], 12, { animate: false }));
  await page.fill('#q', '33.69, 73.05'); await page.click('#go'); await page.waitForFunction(() => !document.getElementById('card').hidden, null, { timeout: 60000 });
  await page.waitForTimeout(600); const c = await page.evaluate(() => { const r = document.getElementById('card').getBoundingClientRect(); return { right: Math.round(r.right), w: innerWidth, hero: getComputedStyle(document.getElementById('hero')).display }; });
  ok(c.right === c.w && c.hero === 'none', 'M20 (START282) after a search the one drawer is on the right and the search card is hidden', JSON.stringify(c));
  await page.click('#home'); await page.waitForTimeout(800);
  const z = await page.evaluate(() => { const b = AGNSTART.bound.frontier.getBounds(), h = document.getElementById('hero').getBoundingClientRect(), m = map.getContainer().getBoundingClientRect(); return { y: Math.round(map.latLngToContainerPoint(b.getNorthEast()).y + m.top), bottom: Math.round(h.bottom), zoom: map.getZoom() }; });
  ok(z.y >= z.bottom && z.zoom >= 5.25, 'M21 (START282) Start again refits Pakistan below the centred search', JSON.stringify(z)); await ctx.close(); }
await browser.close();
console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
