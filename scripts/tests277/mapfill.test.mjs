import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.277 · L8 · THE CLASSIC MAP'S FILL IS THE LEVEL — ported from the retired /next console check (tests237, v91.17.237).
   In a real browser (Playwright) on the one main page, for every hazard layer the map draws as levels (day 0):
     S  the map is switched to the layer the way a reader does it (the map's hazard picker, #mapHazardPick change), and the check
        confirms the map now draws that layer (AGN.hz5.currentKey() === layer) before it compares anything. A layer the map did not
        switch to is a FAIL, never a comparison of another layer's levels.
     A  every tehsil's fill on the map is the colour of the level the page holds for it (AGN.hz5.unitLevel): Normal .. Severe in the
        level colours, no reading in the no-data grey, "cannot happen" in the not-applicable fill; IIOJK is never filled as a level.
     C  (v91.17.283.24 · W1) the level the page holds for each tehsil is the issued run's (GET /api/levels of the layer the page reads);
        when that run is not current the page holds no level of its own (the browser derives no level). Never SKIPs.
     B  where the server engine's list (/api/levels) is current and was made by this build (not stale, same build stamp as the page),
        the level the page holds for each tehsil is the engine's level for it (both resolved). When the engine list is stale or from
        another build (the offline harness: engine off), or resolves almost nothing (the mock provider gives the engine no inputs), B
        prints SKIP with the reason; it is never a silent pass.
   v91.17.277 O5: until this fix the check switched the layer with AGN.hazard.set(layer). That sets the prediction hazard only; the map
   stays on its layer (window.mapLayer; only the picker's applyDistrictFill moves it), so A and B read the heat map for every layer and
   B compared heat levels with the engine's flood / wind / cold lists (the 324/576, 293/545, 130/576 "disagreements" of the first
   engine-on run). Switched through the picker, page and engine agree in 576 of 576 tehsils for all six layers (CHANGES.md, O5).
   usage: node scripts/tests277/mapfill.test.mjs http://127.0.0.1:8962 */
import { createRequire } from 'node:module';
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8962';
const req = createRequire(import.meta.url);
let PW = __T.playwrightSync();
const exe = process.env.PW_CHROME || __T.chromiumPath();
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + String(i).slice(0, 400) : '')); } };
const br = await __T.launch(PW.chromium, { executablePath: exe, args: ['--no-sandbox'] });
const pg = await br.newPage({ viewport: { width: 1600, height: 1000 } }); const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 180000 });
await pg.waitForFunction(() => window.AGN && AGN.hz5 && AGN.hz5.unitLevel && AGN.hazard && AGN.selfcheck && typeof districtLayer !== 'undefined' && window.map, null, { timeout: 180000 });
/* the browser's own national run fills the inputs; wait until the page says its sweep is done (or 4 min) */
await pg.waitForFunction(() => { try { return AGN.hz5.sweep().done; } catch (_) { return false; } }, null, { timeout: 240000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(3000);
const build = await pg.evaluate(() => (window.AGN_BUILD && AGN_BUILD.patch) || null);
const LAYERS = ['heat', 'flood', 'rain_hz', 'wind', 'cold', 'landslide'];
let compared = 0;
for (const hz of LAYERS) {
  /* S · switch the MAP to the layer as a reader does: the map's hazard picker (its change handler is applyDistrictFill) */
  const sw = await pg.evaluate((hz) => { try { if (!AGN.hazard.valid(hz)) return { skip: 'not a hazard' }; if (AGN.day && AGN.day.set) AGN.day.set(0);
      const el = document.getElementById('mapHazardPick'); if (!el) return { skip: 'no map hazard picker' };
      if (![].some.call(el.options || [], (o) => o.value === hz)) return { skip: 'not in the map hazard picker' };
      el.value = hz; el.dispatchEvent(new Event('change', { bubbles: true })); return { set: true }; } catch (e) { return { err: String(e) }; } }, hz);
  if (sw.skip) { console.log('SKIP ' + hz + ': ' + sw.skip + ' on this page'); continue; }
  await pg.waitForTimeout(2500);
  const drawn = await pg.evaluate(() => ({ key: AGN.hz5.currentKey(), layer: (typeof currentMapLayer === 'function') ? currentMapLayer() : null, pick: (document.getElementById('mapHazardPick') || {}).value }));
  ok(!sw.err && drawn.key === hz && drawn.layer === hz && drawn.pick === hz, 'S · ' + hz + ': the map draws the layer it was switched to (picker ' + drawn.pick + ', map layer ' + drawn.layer + ', levels of ' + drawn.key + ')', sw.err);
  if (drawn.key !== hz) continue;   /* never compare another layer's levels */
  const D = await pg.evaluate(() => { const H = AGN.hz5, out = {}; let IJ = null; try { IJ = IIOJK; } catch (_) {}
    districtLayer.eachLayer((l) => { const p = l.feature && l.feature.properties; if (!p || p.key == null) return; const o = l.options || {};
      if (p.province === IJ) { out[p.key] = { ij: true, fill: String(o.fillColor || '').toLowerCase(), op: o.fillOpacity }; return; }
      const u = H.unitLevel(p.key) || {}; out[p.key] = { uid: p.uid || null, i: u.i == null ? null : u.i, na: !!u.na, nd: !!u.nd, pend: !!u.pending, fill: String(o.fillColor || '').toLowerCase(), op: o.fillOpacity }; });
    return { units: out, fill: H.fill.map((c) => String(c).toLowerCase()), nd: String(H.noData.fill).toLowerCase(), na: String(H.notApplicable.fill).toLowerCase(), key: H.currentKey() }; });
  const bad = [], seen = { lv: 0, nd: 0, na: 0, ij: 0 };
  for (const [u, s] of Object.entries(D.units)) {
    if (s.ij) { seen.ij++; if (D.fill.includes(s.fill) && s.op > 0) bad.push(u + ' IIOJK filled ' + s.fill); continue; }
    if (s.i != null) { seen.lv++; if (s.fill !== D.fill[s.i]) bad.push(u + ' level ' + s.i + ' drawn ' + s.fill); }
    else if (s.na) { seen.na++; if (s.fill !== D.na && !(s.op === 0)) bad.push(u + ' n/a drawn ' + s.fill); }
    else { seen.nd++; if (D.fill.includes(s.fill) && s.op > 0) bad.push(u + ' no reading drawn as a level ' + s.fill); } }
  ok(!bad.length && seen.lv + seen.nd + seen.na > 500, 'A · ' + hz + ' day 0: ' + Object.keys(D.units).length + ' tehsils drawn as the level the page holds (' + seen.lv + ' levelled, ' + seen.nd + ' no reading, ' + seen.na + ' cannot happen, ' + seen.ij + ' IIOJK unfilled)', bad.slice(0, 5).join('; '));
  /* C (v91.17.283.24 · W1: the browser derives no level) · the level the page holds for each tehsil is the issued run's (GET /api/levels, the
     layer the page reads: a customer's Flood is the river-flooding level); when that run is not current the page holds no level at all */
  const C = await pg.evaluate(async (hz) => { const op = !!(AGN.operator && AGN.operator()), lay = (!op && hz === 'flood') ? 'flood_riverine' : hz;
    const j = await fetch('/api/levels?layer=' + lay + '&day=0', { cache: 'no-store', headers: { 'x-agn-view': op ? 'operator' : 'customer' } }).then((r) => r.json()).catch(() => null);
    const cur = !!(j && j.levels && !j.stale && !(j.validUntil && Date.now() >= Date.parse(j.validUntil))), mis = []; let n = 0, lv = 0;
    for (const p of AGN.selfcheck.units()) { const u = AGN.hz5.unitLevel(p.key) || {}; if (u.pending) continue; n++; const pi = u.i != null ? u.i : u.na ? -2 : -1; if (pi >= 0) lv++;
      if (cur) { const v = j.levels[p.uid], e = (v != null && v >= 0) ? v : v === -2 ? -2 : -1; if (e !== pi) mis.push(p.uid + ' page ' + pi + ' / issued ' + e); }
      else if (pi >= 0) mis.push(p.uid + ' page level ' + pi + ' with no current issued run'); }
    return { n, mis, cur, lv, lay }; }, hz);
  ok(C.n > 500 && !C.mis.length, 'C · ' + hz + ' day 0: the map\'s level is the issued run\'s (' + C.lay + ', ' + (C.cur ? 'current' : 'not current: the page holds no level') + ') in ' + (C.n - C.mis.length) + ' of ' + C.n + ' tehsils', C.mis.slice(0, 6).join('; '));
  const L = await (await fetch(BASE + '/api/levels?layer=' + hz + '&day=0')).json().catch(() => null);
  if (!L || !L.ready || L.stale || L.build !== build) { console.log('SKIP B · ' + hz + ': the engine list is ' + (!L || !L.ready ? 'not ready' : L.stale ? 'stale (made ' + L.at + ')' : 'from build ' + L.build + ', this page is ' + build)); continue; }
  /* the engine keys a tehsil by province|district|tehsil (the map feature's uid); the map's own key is the tehsil name */
  const engRes = Object.values(L.levels || {}).filter((e) => e != null && e >= 0).length;
  if (engRes < 100) { console.log('SKIP B · ' + hz + ': the engine list resolves ' + engRes + ' tehsils (no inputs for it in this run)'); continue; }
  const mis = []; let both = 0;
  for (const [u, s] of Object.entries(D.units)) { if (s.ij || s.i == null || !s.uid) continue; const e = L.levels[s.uid]; if (e == null || e < 0) continue; both++; if (e !== s.i) mis.push(s.uid + ' page ' + s.i + ' / engine ' + e); }
  compared++;
  ok(!mis.length && both > 100, 'B · ' + hz + ' day 0: the page holds the engine\'s level in ' + (both - mis.length) + ' of ' + both + ' tehsils resolved by both', mis.slice(0, 6).join('; '));
}
ok(!errs.length, 'no page errors', errs.slice(0, 3).join(' | '));
console.log('engine comparisons run: ' + compared + (compared ? '' : ' (engine list not current for this build)'));
await br.close();
console.log(`\n${fail ? 'FAIL' : 'PASS'} mapfill: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
