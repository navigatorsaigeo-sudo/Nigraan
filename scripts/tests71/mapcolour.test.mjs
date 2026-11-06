#!/usr/bin/env node
import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.71 · MAP COLOURING (agent G): no tehsil outside a hazard's physical mask carries a colour.
   The CEO found the GLOF map colouring the whole of Pakistan (v91.17.70: all 577 tehsils had a GLOF level) and asked for the
   same check "for all" layers. data/hazard-applicability.json (scripts/build_applicability.py) holds each mask with its
   thresholds and their sources; the server drops any value outside it; the map leaves those tehsils unfilled.

   node scripts/tests71/mapcolour.test.mjs [baseUrl] [--artefact <file>] [--no-browser]
     baseUrl     default http://127.0.0.1:8787
     --artefact  serve this HTML file as the page (Playwright route) instead of the server's artefact, e.g. a build
                 with the f71g1 FIX dir applied, to check the client before the integrator rebuilds (a copy that
                 was patched by hand must have its CSP meta removed or re-hashed, or the edited scripts are blocked)
   Prints per-layer counts (coloured / unfilled) so the counts can be eyeballed: GLOF coloured is tens, not 577.
   PASS / FAIL / INFO / SKIP lines; exit 1 on any FAIL. The client check SKIPs when the served artefact predates
   the f71g1 FIX (no `agn-hzmask-js` in the page) and no --artefact is given. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const args = process.argv.slice(2);
const BASE = (args.find(a => /^https?:/.test(a)) || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const ART = args.includes('--artefact') ? args[args.indexOf('--artefact') + 1] : null;
const NOBROWSER = args.includes('--no-browser');
let fails = 0, passes = 0;
const ok = (c, name, extra) => { if (c) { passes++; console.log('PASS ' + name + (extra != null && extra !== '' ? ' · ' + String(extra).slice(0, 300) : '')); } else { fails++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const info = (t) => console.log('INFO ' + t), skip = (t) => console.log('SKIP ' + t);
const get = async (p) => { const r = await fetch(BASE + p, { signal: AbortSignal.timeout(300000) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; };

const FC = JSON.parse(readFileSync(join(ROOT, 'data', 'pk-tehsils.json'), 'utf8'));
const KEY2UID = new Map(FC.features.map(f => [f.properties.key, f.properties.uid]));
const UID2KEY = new Map(FC.features.map(f => [f.properties.uid, f.properties.key]));
const CITY = { 'Saddar Town': 'Karachi Saddar', 'Lahore City': 'Lahore City', 'Multan City': 'Multan City', 'Hyderabad City': 'Hyderabad City' };

/* ── 1. the masks ── */
const MA = await get('/api/map/layer?id=mask:all');
ok(MA.json && MA.json.ready, 'masks served (/api/map/layer?id=mask:all)', MA.json && MA.json.error);
const ML = (MA.json && MA.json.layers) || {};
console.log('\n  mask                      applies   unfilled   reason');
for (const [k, v] of Object.entries(ML)) console.log('  ' + k.padEnd(24) + String(v.applies).padStart(8) + String(v.outside).padStart(11) + '   ' + v.reason);
console.log('');
for (const k of ['glof', 'flood_riverine', 'landslide', 'cyclone', 'ev:meltWarmth', 'ev:coastalHeat', 'ev:heavySnow', 'day:tn0']) ok(ML[k] && ML[k].outside > 0 && ML[k].applies > 0, 'mask ' + k + ' present', ML[k] && (ML[k].applies + ' applies / ' + ML[k].outside + ' unfilled'));
ok(ML.glof && ML.glof.applies <= 150, 'GLOF colours tens of tehsils, not 577: ' + (ML.glof && ML.glof.applies));
for (const [k, nm] of Object.entries(CITY)) ok(ML.glof && ML.glof.byKey && ML.glof.byKey[k] === 'No glacial lake upstream', nm + ' is never GLOF-coloured', ML.glof && ML.glof.byKey && ML.glof.byKey[k]);
ok(ML.landslide && ML.landslide.byKey['Saddar Town'] && ML.landslide.byKey['Lahore City'], 'Karachi Saddar and Lahore City are too flat for landslides');
ok(ML['ev:heavySnow'] && ML['ev:heavySnow'].byKey['Saddar Town'] && ML['ev:heavySnow'].byKey['Lahore City'] && !ML['ev:heavySnow'].byKey['Murree'], 'snow: unfilled in Karachi and Lahore, applies in Murree');
ok(ML['ev:coastalHeat'] && !ML['ev:coastalHeat'].byKey['Saddar Town'] && ML['ev:coastalHeat'].byKey['Lahore City'], 'coastal heat: applies in Karachi, unfilled in Lahore');
ok(ML.cyclone && !ML.cyclone.byKey['Saddar Town'] && ML.cyclone.byKey['Lahore City'], 'cyclone: applies on the coast, unfilled in Lahore');

/* GLOF mask agrees with the lake module's own national table */
const N = await get('/api/glof/national');
if (N.json && N.json.ok) {
  const naN = Object.entries(N.json.units).filter(([, u]) => u.applicable === false).map(([uid]) => UID2KEY.get(uid)).sort();
  const naM = Object.keys((ML.glof || {}).byKey || {}).sort();
  ok(naN.length === naM.length && naN.every((k, i) => k === naM[i]), 'GLOF mask equals the national table\'s not-applicable set (' + naN.length + ')');
  const col = Object.values(N.json.units).filter(u => u.applicable === true && u.class && u.index != null);
  ok(Object.values(N.json.units).filter(u => u.applicable === false).every(u => u.class == null && u.index == null), 'no not-applicable tehsil carries a GLOF class or map grade');
  info('GLOF: coloured ' + col.length + ' ' + JSON.stringify(N.json.counts) + ' · unfilled ' + N.json.notApplicable + ' (v91.17.70: 577 coloured, 532 Low / 39 Monitor / 6 Watch)');
}

/* ── 2. every outlook layer: no value outside its mask ── */
const CAT = await get('/api/map/layers');
const ids = []; for (const g of (CAT.json || [])) for (const [id] of g.items) ids.push(id);
ok(ids.length > 20, 'layer catalogue served (' + ids.length + ' layers)');
const defI = (id) => /^day:/.test(id) ? 1 : /^air:/.test(id) ? 1 : /^week:/.test(id) ? 2 : /^month:/.test(id) ? 1 : 0;
console.log('\n  layer            ready  coloured  unfilled  masked-out  reason');
for (const id of ids) {
  const L = await get('/api/map/layer?id=' + encodeURIComponent(id) + '&i=' + defI(id));
  const d = L.json || {};
  if (!d.ready) { console.log('  ' + id.padEnd(17) + '  no    (layer not built on this server)'); continue; }
  const vals = d.values || {}, mk = ML[id];
  const bad = mk ? Object.keys(mk.byKey || {}).map(k => KEY2UID.get(k)).filter(uid => uid && vals[uid] != null) : [];
  const unf = (d.units || 576) - Object.keys(vals).length;
  console.log('  ' + id.padEnd(17) + '  yes' + String(Object.keys(vals).length).padStart(9) + String(unf).padStart(10) + String(mk ? mk.outside : '-').padStart(12) + '  ' + (mk ? mk.reason : 'applies everywhere'));
  if (mk) ok(bad.length === 0, id + ': no tehsil outside the mask carries a value', bad.slice(0, 3).join(', '));
  if (mk) ok(Object.keys(mk.byKey).every(k => { const uid = KEY2UID.get(k); return !uid || (d.whys && d.whys[uid]); }), id + ': every unfilled tehsil carries its reason');
}
console.log('');

/* ── 3. drought: arid tehsils carry no class ── */
const D = await get('/api/climatology/drought');
if (D.json && D.json.ready) { const cc = {}; Object.values(D.json.spi).forEach(u => { const k = u.drought ? (u.drought.applicable === false ? 'unfilled (arid)' : u.drought.class) : 'none'; cc[k] = (cc[k] || 0) + 1; });
  ok((cc['unfilled (arid)'] || 0) > 0 && !Object.values(D.json.spi).some(u => u.drought && u.drought.applicable === false && u.drought.class), 'drought: arid tehsils with no defined index are unfilled, not Low', JSON.stringify(cc)); info('drought classes: ' + JSON.stringify(cc)); }
else skip('drought table not built on this server');

/* ── 4. the client: count filled tehsil paths on the GLOF map ── */
const PW = __T.playwrightUrl() || 'playwright', CHROME = __T.chromiumPath();
if (NOBROWSER) skip('client check (--no-browser)');
else if (!existsSync(PW) || !existsSync(CHROME)) skip('client check: Playwright or Chromium not installed here');
else {
  let html = null;
  if (ART) html = readFileSync(ART, 'utf8');
  const page0 = await fetch(BASE + '/analyst', { signal: AbortSignal.timeout(60000) }).then(r => r.text()).catch(() => '');
  if (!ART && !/agn-hzmask-js/.test(page0)) skip('client check: the served artefact predates the f71g1 FIX (no agn-hzmask-js); rebuild with f71g1 + build/map_ui.html, or pass --artefact <patched build>');
  else {
    const _pw = await __T.playwright(); const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
    const b = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox'] });
    try {
      const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
      const perr = []; page.on('pageerror', e => perr.push(String(e && e.message).slice(0, 200)));
      await page.addInitScript(() => { window.__AGN_HARNESS = true; try { localStorage.setItem('agn3d', '0'); localStorage.setItem('agn3danim', '0'); } catch (_) {} });
      if (html) await page.route(BASE + '/analyst', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
      await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
      const ready = await page.waitForFunction(() => !!(window.AGN && window.AGN.hzMask && window.__agnGlofNat && window.__agnGlofNat.units && typeof window.districtHazardInfo === 'function'), null, { timeout: 180000 }).then(() => true).catch(() => false);
      ok(ready, 'page loaded the masks and the GLOF national table');
      /* v91.17.283.24 · W1: the client draws the issued run (GET /api/levels of the layer, the server's masks applied there: section 2);
         it derives no level of its own. A tehsil the run does not level is never filled; with no current run nothing is filled. */
      const count = async (hz) => page.evaluate(async (hz) => {
        const sel = document.getElementById('mapHazardPick'); if (![].some.call(sel.options, (o) => o.value === hz)) return { absent: true };
        sel.value = hz; sel.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 4000));
        const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')];
        const filled = paths.filter(p => { const cs = getComputedStyle(p); const fo = parseFloat(p.getAttribute('fill-opacity') ?? cs.fillOpacity); const f = p.getAttribute('fill') || cs.fill; return fo > 0.05 && f && f !== 'none' && !/rgba\(0, ?0, ?0, ?0\)|transparent/.test(f) && (window.AGN.hz5.fill || []).map((c) => String(c).toLowerCase()).includes(String(f).toLowerCase()); }).length;
        const j = await fetch('/api/levels?layer=' + hz + '&day=0', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
        const cur = !!(j && j.levels && !j.stale && !(j.validUntil && Date.now() >= Date.parse(j.validUntil)));
        const issued = cur ? Object.values(j.levels).filter((v) => v != null && v >= 0).length : 0;
        const probe = {}; for (const k of ['Saddar Town', 'Lahore City', 'Multan City', 'Hyderabad City', 'Gojal']) { try { const h = window.districtHazardInfo(k); probe[k] = h ? { served: !!h.served, level: h.level, na: !!h.notApplicable, why: h.why || h.notApplicableWhy || null } : null; } catch (e) { probe[k] = String(e.message); } }
        return { paths: paths.length, filled, probe, cur, issued };
      }, hz);
      const g = await count('glof');
      info('client GLOF map: ' + g.filled + ' filled of ' + g.paths + ' paths (issued run ' + (g.cur ? 'current, ' + g.issued + ' levelled' : 'not current') + ') · ' + JSON.stringify(g.probe));
      ok(g.cur ? (g.filled > 0 && g.filled <= 150) : g.filled === 0, 'client GLOF map fills only what the issued run levels (' + g.filled + (g.cur ? ', tens, not 577' : ': no current run, nothing filled') + ')');
      for (const k of Object.keys(CITY)) ok(g.probe[k] && g.probe[k].served && g.probe[k].level == null, 'client: ' + CITY[k] + ' carries no GLOF level (' + (g.probe[k] && (g.probe[k].na ? 'cannot occur here' : g.probe[k].why)) + ')', JSON.stringify(g.probe[k]));
      ok(g.probe.Gojal && g.probe.Gojal.served && (!g.cur || g.probe.Gojal.level != null || g.probe.Gojal.na), 'client: Gojal reads its issued GLOF level' + (g.cur ? '' : ' (no current run: none shown)'), JSON.stringify(g.probe.Gojal));
      const l = await count('landslide'); info('client landslide map: ' + l.filled + ' filled of ' + l.paths);
      ok(l.probe['Saddar Town'] && l.probe['Saddar Town'].served && l.probe['Saddar Town'].level == null, 'client: Karachi Saddar is unfilled on landslide', JSON.stringify(l.probe['Saddar Town']));
      const c = await count('cyclone'); info('client cyclone map: ' + (c.absent ? 'not offered' : c.filled + ' filled of ' + c.paths));
      ok(c.absent || (c.filled === 0 && c.probe['Lahore City'] && c.probe['Lahore City'].level == null), 'client: Lahore City is unfilled on cyclone (the server issues no tehsil cyclone level)', JSON.stringify(c.probe && c.probe['Lahore City']));
      ok(perr.length === 0, 'no uncaught page error', perr[0]);
    } finally { await b.close(); }
  }
}
console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
