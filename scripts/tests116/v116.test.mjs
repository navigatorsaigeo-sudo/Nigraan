import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.116 · own street map (OpenStreetMap, local archive), offline street search, exact pin (drag, distances).
   node nigraan-local/scripts/tests116/v116.test.mjs  (server running; data/basemap/pk-streets.pmtiles and data/geo/street-index.json installed) */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const J = async (p) => (await fetch(BASE + p)).json();

/* the archive reader */
const { zxyToTileId } = await import(ROOT + 'server/api/pmtiles.mjs');
ok(zxyToTileId(0, 0, 0) === 0 && zxyToTileId(1, 0, 0) === 1 && zxyToTileId(1, 0, 1) === 2 && zxyToTileId(1, 1, 1) === 3 && zxyToTileId(1, 1, 0) === 4 && zxyToTileId(2, 0, 0) === 5, 'tile ids follow the PMTiles Hilbert order (spec test values)');
const ST = await J('/tiles/streets/status');
ok(ST.ready && ST.maxDataZoom >= 14 && /OpenStreetMap/.test(ST.attribution) && /ODbL/.test(ST.licence), 'street map installed, to zoom ' + ST.maxDataZoom + ', OpenStreetMap / ODbL credited', JSON.stringify(ST).slice(0, 300));
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z), lat2y = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
const t = await fetch(BASE + `/tiles/streets/14/${lon2x(73.0551, 14)}/${lat2y(33.7215, 14)}.mvt`); const tb = Buffer.from(await t.arrayBuffer());
ok(t.status === 200 && /protobuf/.test(t.headers.get('content-type')) && tb.length > 500 && tb.toString('latin1').includes('roads'), 'Islamabad tile at zoom 14 carries roads (' + tb.length + ' bytes)');
const t2 = await fetch(BASE + '/tiles/streets/14/0/0.mvt'); ok(t2.status === 204, 'a tile outside the archive answers 204, not an error');

/* search */
const S1 = await J('/api/geo/search?q=' + encodeURIComponent('Shifa International') + '&limit=6');
const h = (S1.results || [])[0]; ok(h && h.exact && /Shifa International Hospital/.test(h.name) && h.tehsil === 'Islamabad' && h.lat > 33.6 && h.lat < 33.75, 'a hospital is found offline with its tehsil (' + (h && h.name) + ')', JSON.stringify(S1).slice(0, 300));
const S2 = await J('/api/geo/search?q=' + encodeURIComponent('Jinnah Avenue Islamabad') + '&limit=6');
const S2s = (S2.results || []).filter(r => r.exact); ok(S2s.length >= 1 && S2s.every(r => r.tehsil === 'Islamabad' || r.district === 'Islamabad'), 'a trailing place word filters the streets ("Jinnah Avenue Islamabad")');
const S3 = await J('/api/geo/search?q=Lahore&limit=6'); ok(S3.results[0] && !S3.results[0].exact, 'a city search still answers the city first, streets after');
const IX = JSON.parse(readFileSync(ROOT + 'data/geo/street-index.json', 'utf8')); ok(IX.n > 100000 && /ODbL/.test(IX.licence), 'street index: ' + IX.n + ' names, ODbL');

/* page */
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message)); const REQ = []; pg.on('request', r => { if (/geo\/search/.test(r.url())) REQ.push(r.url().split('?')[1].slice(0, 50)); }); pg.on('requestfailed', r => { if (/geo\/search/.test(r.url())) REQ.push('FAILED ' + (r.failure() || {}).errorText); });
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return !!(document.getElementById('agnPtInput') && AGN.streets && AGN.streets.status()); } catch (_) { return false; } }, null, { timeout: 300000, polling: 1000 }).catch(() => {});
const seg = await pg.evaluate(() => { const s = document.querySelector('.seg[aria-label="Map layer"]'); return s ? [...s.querySelectorAll('button')].map(b => b.textContent.trim()) : []; });
ok(seg.join('|') === 'Map|Streets|Satellite', 'basemap choice Map | Streets | Satellite (' + seg.join('|') + ')');
await pg.click('#agnStreetsBtn'); await pg.waitForTimeout(1500);
const on = await pg.evaluate(() => ({ on: AGN.streets.on(), max: map.getMaxZoom(), pressed: document.getElementById('agnStreetsBtn').getAttribute('aria-pressed'), map: document.querySelector('.seg button[data-layer="radar"]').getAttribute('aria-pressed') }));
ok(on.on && on.max >= 18 && on.pressed === 'true' && on.map === 'false', 'Streets on: street level zoom allowed, button pressed', JSON.stringify(on));
const nob = await pg.evaluate(() => { const L = (AGN.streets.on() && map._layers) ? Object.values(map._layers).find(l => l.paintRules) : null; return L ? { b: L.paintRules.filter(r => r.dataLayer === 'boundaries').length, n: L.paintRules.length } : null; });
ok(nob && nob.b === 0 && nob.n > 20, 'the street map draws no boundary lines from the map data (AGN boundaries only)', JSON.stringify(nob));
await pg.waitForTimeout(3000); await pg.click('#agnPtInput'); await pg.keyboard.type('Shifa International', { delay: 25 });
await pg.waitForFunction(() => document.querySelectorAll('#agnPtRes button').length > 0, null, { timeout: 60000 }).catch(() => {});
console.log('requests seen:', REQ.join(' ; ')); console.log('geo requests:', await pg.evaluate(() => performance.getEntriesByType('resource').filter(e => /geo\/search/.test(e.name)).map(e => e.name.split('?')[1].slice(0,40) + ' ' + Math.round(e.duration) + 'ms').join(' ; ')));
console.log('search box:', await pg.evaluate(() => [(document.getElementById('agnPtInput')||{}).value, (document.getElementById('agnPtRes')||{}).innerText, (document.getElementById('agnPtSt')||{}).innerText].join(' / ')));
await pg.evaluate(() => { const b = document.querySelector('#agnPtRes button'); if (b) b.click(); });
await pg.waitForFunction(() => /Nearest MACH station|No MACH station/.test((document.querySelector('.agn-pt-pop') || {}).innerText || '') && /Forecast model cell|Now /.test((document.querySelector('.agn-pt-pop') || {}).innerText || ''), null, { timeout: 60000 }).catch(() => {});
const P = await pg.evaluate(() => ({ t: (document.querySelector('.agn-pt-pop') || {}).innerText || '', z: map.getZoom(), pins: document.querySelectorAll('.agn-pt-marker').length }));
ok(/Shifa International Hospital/.test(P.t) && /Islamabad tehsil/.test(P.t) && P.pins === 1 && P.z >= 15, 'picking a street-map hit drops the exact pin at street zoom', JSON.stringify(P).slice(0, 300));
ok(/Nearest MACH station .* km/.test(P.t), 'the pin popup gives the nearest MACH station and its distance');
/* v91.17.121 · the point engine's hour now shows before the page reading lands; the model-cell distance comes with the page reading */
await pg.waitForFunction(() => { try { return !AGN.point.state().rec || /Forecast model cell/.test((document.querySelector('.agn-pt-pop') || {}).innerText || ''); } catch (_) { return false; } }, null, { timeout: 60000 }).catch(() => {});
const P2 = await pg.evaluate(() => ({ t: (document.querySelector('.agn-pt-pop') || {}).innerText || '', rec: !!(AGN.point.state().rec && AGN.point.state().rec.ok !== false) }));
ok(/Forecast model cell [\d.]+ km/.test(P2.t) || !P2.rec, 'the pin popup gives the distance to the forecast model cell (once the page reading has landed)', P2.t.slice(0, 400));
await pg.waitForTimeout(2000);   /* v131: let the popup's auto-pan animation finish before measuring the pin */
const bb = await (await pg.$('.agn-pt-marker')).boundingBox(); const before = await pg.evaluate(() => AGN.point.state().row.lat);
await pg.mouse.move(bb.x + 9, bb.y + 9); await pg.mouse.down(); await pg.mouse.move(bb.x + 110, bb.y + 50, { steps: 8 }); await pg.mouse.up();
await pg.waitForFunction((b) => { try { return AGN.point.state().row.lat !== b; } catch (_) { return false; } }, before, { timeout: 90000 }).catch(() => {});
const after = await pg.evaluate(() => ({ lat: AGN.point.state().row.lat, label: AGN.point.state().label }));
ok(after.lat !== before && after.label === 'Dropped pin', 'dragging the pin reads the new point', JSON.stringify(after));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v116: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
