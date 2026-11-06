import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* GEO281 · does the drawn street map sit where Leaflet says, and does a click return the clicked feature's OSM coordinate?
   Measured in the page's own pipeline (same Leaflet map, same protomaps-leaflet renderer, same /tiles/streets server):
   1. a test layer draws every named major road of the street map in pure red on top; the red pixels are compared with the OSM road
      geometry (from the same archive, read independently by dump_tiles.mjs) projected by map.latLngToContainerPoint → registration
      error in pixels and metres (median / p90 of red-pixel distance to the nearest projected road line, and the best-fit shift);
   2. the mouse clicks the pixel where the OSM intersection is drawn (centroid of the red pixels within 6 px of the expected point) and
      the coordinate the page reports (Leaflet click latlng) is compared with the OSM coordinate.
   Views: OSM intersections derived from the data (7th Avenue × Jinnah Avenue, Faisal × Jinnah, 9th × Jinnah) and the G-8 Markaz label.
   usage: node click_align.mjs <base url> <pk.pmtiles> <views.json> [page path, default /] > report.json   (needs playwright) */
const { chromium } = __T.playwrightSync();
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = process.env.GEO281_TESTS || dirname(fileURLToPath(import.meta.url));
const [BASE, PM, VIEWS, PAGE = '/'] = process.argv.slice(2);
const views = JSON.parse(readFileSync(VIEWS, 'utf8'));
const exe = __T.chromiumPath();
const browser = await __T.launch(chromium, { executablePath: exe || undefined });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.goto(BASE + PAGE, { waitUntil: 'load' });
await page.waitForFunction('typeof map !== "undefined" && map && map.latLngToContainerPoint && window.protomapsL && (window.__agnM = map)', null, { timeout: 90000 });
await page.waitForTimeout(6000);   /* let the page finish its own first view before the test moves the map */
const out = [];
for (const v of views) {
  const z = v.zoom || 17;
  /* the OSM major roads around the view, read from the archive directly (z15 tiles) */
  const n = 2 ** 15, tx = Math.floor((v.lon + 180) / 360 * n), s = Math.sin(v.lat * Math.PI / 180), ty = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
  const req = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) req.push([15, tx + dx, ty + dy]);
  const F = JSON.parse(execFileSync(process.execPath, [join(HERE, 'dump_tiles.mjs'), PM, 'roads'], { input: JSON.stringify(req), maxBuffer: 1 << 28 }).toString());
  const lines = F.filter((f) => f.props.kind === 'major_road' && f.props.name).flatMap((f) => f.rings);
  const r = await page.evaluate(async ({ v, z, lines }) => {
    const m = window.__agnM; m.setView([v.lat, v.lon], z, { animate: false });
    if (window.__agnRed) { m.removeLayer(window.__agnRed); }
    const P = window.protomapsL;
    if (!m.getPane('agnRedTop')) { const pn = m.createPane('agnRedTop'); pn.style.zIndex = 650; pn.style.pointerEvents = 'none'; }
    window.__agnRed = P.leafletLayer({ url: location.origin + '/tiles/streets/{z}/{x}/{y}.mvt', maxDataZoom: 15, maxZoom: 19, pane: 'agnRedTop',
      paintRules: [{ dataLayer: 'roads', symbolizer: new P.LineSymbolizer({ color: '#ff0000', width: 2 }), filter: (zz, f) => f.props.kind === 'major_road' && !!f.props.name }], labelRules: [] });
    window.__agnRed.addTo(m);
    await new Promise((ok) => setTimeout(ok, 4000));
    const proj = lines.map((ln) => ln.map(([lo, la]) => { const p = m.latLngToContainerPoint([la, lo]); return [p.x, p.y]; }));
    const c = m.latLngToContainerPoint([v.lat, v.lon]);
    const mpp = 40075016.686 * Math.cos(v.lat * Math.PI / 180) / (256 * 2 ** m.getZoom());
    return { proj, centre: [c.x, c.y], mpp, zoom: m.getZoom(), size: [m.getSize().x, m.getSize().y] };
  }, { v, z, lines });
  /* red pixels from a screenshot of the map element */
  const box = await page.locator('#map').boundingBox();
  const png = await page.screenshot({ clip: box });
  /* decode the screenshot in the page itself (no PNG library): image -> canvas -> pixels */
  let red = await page.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const o = [];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) o.push([x + 0.5, y + 0.5]); }
    return o; }, png.toString('base64'));
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const dmin = (p, sx = 0, sy = 0) => { let d = Infinity; for (const L of r.proj) for (let i = 1; i < L.length; i++) { const e = segD([p[0] - sx, p[1] - sy], L[i - 1], L[i]); if (e < d) d = e; } return d; };
  /* only red pixels inside the area whose OSM roads were read (the centre z15 tile and its neighbours) */
  const reach = 40075016.686 * Math.cos(v.lat * Math.PI / 180) / n / r.mpp;
  red = red.filter((p) => Math.abs(p[0] - r.centre[0]) < reach && Math.abs(p[1] - r.centre[1]) < reach);
  const sub = red.filter((_, i) => i % Math.max(1, Math.floor(red.length / 1500)) === 0);
  const ds = sub.map((p) => dmin(p)).sort((a, b) => a - b);
  let best = [0, 0, Infinity]; for (let sx = -6; sx <= 6; sx += 1) for (let sy = -6; sy <= 6; sy += 1) { const m = sub.slice(0, 400).map((p) => dmin(p, sx, sy)).sort((a, b) => a - b)[200]; if (m < best[2]) best = [sx, sy, m]; }
  /* click where the intersection is drawn */
  const near = red.filter((p) => Math.hypot(p[0] - r.centre[0], p[1] - r.centre[1]) <= 6);
  const at = near.length ? [near.reduce((a, p) => a + p[0], 0) / near.length, near.reduce((a, p) => a + p[1], 0) / near.length] : r.centre;
  await page.evaluate(() => { window.__agnClick = null; window.__agnM.once('click', (e) => { window.__agnClick = [e.latlng.lat, e.latlng.lng]; }); });
  await page.mouse.click(box.x + at[0], box.y + at[1]); await page.waitForTimeout(500);
  const ck = await page.evaluate(() => window.__agnClick);
  const km = ck ? Math.hypot((ck[0] - v.lat) * 110574, (ck[1] - v.lon) * 111320 * Math.cos(v.lat * Math.PI / 180)) : null;
  out.push({ view: v.name, osm: [v.lat, v.lon], zoom: r.zoom, metresPerPixel: +r.mpp.toFixed(2), redPixels: red.length,
    redToOsmLine_px: ds.length ? { median: +ds[ds.length >> 1].toFixed(2), p90: +ds[Math.floor(ds.length * 0.9)].toFixed(2) } : null,
    bestShift_px: [best[0], best[1]], drawnIntersection_px_from_expected: near.length ? +Math.hypot(at[0] - r.centre[0], at[1] - r.centre[1]).toFixed(2) : 'no red pixel within 6 px',
    click: ck ? { latlng: ck.map((x) => +x.toFixed(6)), errorFromOsm_m: +km.toFixed(2), errorPx: +(km / r.mpp).toFixed(2) } : null });
  if (v.markOnly) {}
}
await browser.close();
process.stdout.write(JSON.stringify(out, null, 1));
