import * as __T from '../lib/testenv.mjs';
/* v91.17.283.15 · the analyst page in the CLIENT view against a server with this release (the mock provider is enough):
     1  each drought view is painted from its own issued layer (/api/levels?layer=drought_<view>) on its own palette; a view never shows
        the headline's colours unless its own levels are the same
     2  the sponge day views are offered to clients, labelled "screening index, not a tested runoff forecast", and painted from their issued layer
     3  a provider product is read through the page store (GET /api/pointstate/product), no provider host is asked by the page
     4  the issued levels follow the run stamp: a new levels stamp drops the store and reads the layer once; no timer re-reads
   usage: node scripts/tests28315/page.test.mjs [http://127.0.0.1:8787] */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const BASE = __T.BASE;
/* the test runner's copy holds an old engine record (stale: the map shows no level for a stale run). In that copy only (never against
   another server), the held record is posted again as a fresh engine report, so the server applies its science and the levels are current */
if (/nigraan-run-/.test(__T.ROOT) && existsSync(join(__T.ROOT, 'data', 'engine-latest.json'))) {
  const rec = JSON.parse(readFileSync(join(__T.ROOT, 'data', 'engine-latest.json'), 'utf8')); rec.at = new Date().toISOString();
  const r = await fetch(BASE + '/api/engine/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec) }).catch((e) => ({ status: String(e) }));
  console.log('NOTE the runner copy\'s engine record posted again as a fresh report: ' + r.status); }
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } }), pg = await ctx.newPage(); const errs = [], req = [];
pg.on('pageerror', (e) => errs.push(String(e).slice(0, 160))); pg.on('request', (r) => req.push({ u: r.url(), t: Date.now() }));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 180000 });
await pg.waitForFunction(() => window.AGN && AGN.v283 && AGN.v283.issuedLevel && AGN.hz5 && AGN.hz5.scales && AGN.droughtView && typeof districtLayer !== 'undefined' && !!districtLayer && AGN.pointState && AGN.pointState.product, null, { timeout: 240000 });
await pg.waitForTimeout(15000);
ok(await pg.evaluate(() => !document.documentElement.classList.contains('agn-operator')), '0 the page is in the client view');

/* 2 · the sponge views */
const opts = await pg.evaluate(() => [...document.querySelectorAll('#mapHazardPick option')].filter((o) => /^nss_(dynamic|runoff)$/.test(o.value)).map((o) => ({ v: o.value, t: o.text, hidden: o.hidden || o.disabled || getComputedStyle(o).display === 'none' })));
ok(opts.length === 2 && opts.every((o) => !o.hidden && /screening index, not a tested runoff forecast/.test(o.t)), '2a the client picker offers Runoff retention today and Rain run-off today, labelled screening', JSON.stringify(opts));

/* paint one layer / view and compare every tehsil's fill with its issued level on the layer's own palette */
const paintCheck = (layer, view) => pg.evaluate(async ([layer, view]) => {
  const sel = document.getElementById('mapHazardPick'); sel.value = layer.startsWith('drought') ? 'drought' : layer; sel.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1500)); if (view) AGN.droughtView.set(view); await new Promise((r) => setTimeout(r, 2500));
  const j = await fetch('/api/levels?layer=' + layer + '&day=0', { cache: 'no-store' }).then((r) => r.json()); if (!j || !j.levels) return { why: (j && j.why) || 'no levels', layer };
  for (let i = 0; i < 20; i++) { const q = AGN.v283.issuedLevel(layer, Object.keys(j.levels)[0]); if (!q.pending) break; await new Promise((r) => setTimeout(r, 500)); }
  if (window.refreshDistrictHazard) refreshDistrictHazard(); await new Promise((r) => setTimeout(r, 800));
  const pal = AGN.hz5.scales.layers[layer] && AGN.hz5.scales.layers[layer].palette; let n = 0, bad = 0, ex = [], cols = {};
  districtLayer.eachLayer((l) => { const p = l.feature && l.feature.properties; if (!p || p.uid == null || p.dq === true || !(p.uid in j.levels)) return; const v = j.levels[p.uid]; const s = districtLayer.options.style(l.feature);
    cols[s.fillColor] = (cols[s.fillColor] || 0) + 1; if (!(v >= 0) || !pal) return; n++; if (String(s.fillColor).toLowerCase() !== String(pal[v]).toLowerCase()) { bad++; if (ex.length < 3) ex.push(p.uid + ' ' + v + ' ' + s.fillColor); } });
  return { layer, n, bad, ex, cols, levels: Object.values(j.levels).reduce((o, v) => { o[v] = (o[v] || 0) + 1; return o; }, {}) }; }, [layer, view]);
const D = {};
for (const [layer, view] of [['drought_rain', 'rain'], ['drought_soil', 'soil'], ['drought_crops', 'crops'], ['drought_water', 'water']]) { const r = await paintCheck(layer, view); D[view] = r;
  ok(r && !r.why && r.bad === 0, '1 drought view ' + view + ': every tehsil with a level is painted from ' + layer + ' on its own palette (' + (r.n || 0) + ' tehsils, levels ' + JSON.stringify(r.levels || {}) + ')', JSON.stringify(r).slice(0, 600)); }
const keyOf = (r) => JSON.stringify(r && r.levels);
ok(Object.values(D).every((r, i, a) => i === 0 || keyOf(r) === keyOf(a[0]) || JSON.stringify(r.cols) !== JSON.stringify(a[0].cols)), '1b views whose levels differ are painted differently', Object.entries(D).map(([k, r]) => k + ' ' + JSON.stringify(r.cols)).join(' | '));
for (const layer of ['nss_dynamic', 'nss_runoff']) { const r = await paintCheck(layer, null); ok(r && !r.why && r.bad === 0, '2b ' + layer + ' is painted from its issued layer (' + (r.n || 0) + ' tehsils with a level, levels ' + JSON.stringify(r.levels || {}) + ')', JSON.stringify(r).slice(0, 600)); }

/* 3 · a product through the store */
const t3 = Date.now(); const P = await pg.evaluate(async () => { const r = await AGN.api.product('ensemble', { latitude: 31.558, longitude: 74.351, models: 'ecmwf_ifs025', hourly: 'precipitation', forecast_days: 5 }); const j = await r.json().catch(() => null); return { status: r.status, keys: j ? Object.keys(j).slice(0, 6) : null }; });
const asked = req.filter((x) => x.t >= t3); ok(asked.some((x) => /\/api\/pointstate\/product\?name=ensemble/.test(x.u)) && !asked.some((x) => /open-meteo\.com|\/px\/v1\//.test(x.u)), '3 a provider product is read through the page store from the server record (no provider request from the page)', JSON.stringify(P) + ' ' + asked.map((x) => x.u.replace(BASE, '')).slice(0, 4).join(' '));

/* 4 · the issued levels follow the run stamp */
const R4 = await pg.evaluate(async () => { const real = window.fetch, seen = []; window.fetch = function (u) { seen.push(String(u && u.url ? u.url : u)); return real.apply(this, arguments); };
  try { AGN.v283.issuedLevel('drought_soil', 'x'); await new Promise((r) => setTimeout(r, 1500)); const before = seen.filter((u) => /\/api\/levels\?layer=drought_soil/.test(u)).length;
    await AGN.pointState.checkRun(); AGN.v283.issuedLevel('drought_soil', 'x'); await new Promise((r) => setTimeout(r, 1000)); const same = seen.filter((u) => /\/api\/levels\?layer=drought_soil/.test(u)).length;
    document.dispatchEvent(new CustomEvent('agn:levels-run', { detail: { levels: 'TEST-LEVELS', first: false } })); AGN.v283.issuedLevel('drought_soil', 'x'); await new Promise((r) => setTimeout(r, 1500));
    const after = seen.filter((u) => /\/api\/levels\?layer=drought_soil/.test(u)).length; return { before, same, after, levelsRun: AGN.pointState.levelsRun() }; } finally { window.fetch = real; } });
ok(R4.same === R4.before && R4.after === R4.before + 1 && !!R4.levelsRun, '4 the levels store keeps a run until the levels stamp changes, then reads it once (no timer re-read)', JSON.stringify(R4));
ok(!errs.length, '5 no page error', errs.slice(0, 3).join(' | '));
await ctx.close(); await br.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
