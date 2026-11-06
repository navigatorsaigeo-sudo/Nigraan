import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.105 · river flood as a probability of the official flow class.
   node nigraan-local/scripts/tests105/v105.test.mjs  (server running) */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const get = async (p, h = {}) => { const r = await fetch(BASE + p, { headers: h, signal: AbortSignal.timeout(120000) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t }; };
const SUP = /ECMWF|GloFAS|WeatherNext|DeepMind|NOAA|\bDWD\b|KNMI|Met Office|MET Norway|Météo-France|ERA5|IMERG|NASA|USGS|GHS-POP|Pakistan Meteorological|Flood Forecasting Division|ISD-Lite|GLOF-II|AEGIS|Open-Meteo|met\.no|\bPMD\b|\bFFD\b/;

/* the model file: the gate rule holds threshold by threshold */
const M = JSON.parse(readFileSync(ROOT + 'data/river-prob-model.json', 'utf8'));
for (const [k, T] of Object.entries(M.thresholds)) {
  const ys = Object.values(M.validation.byMonsoon).map(v => v[T.name] && v[T.name].bssClim);
  const pass = ys.length >= 2 && ys.every(b => b != null && b > 0);
  ok(pass === !!T.served, 'gate rule: ' + T.name + ' served=' + T.served + ' (held-out BSS ' + ys.join(', ') + ')');
  const X = T.isotonic.x, Y = T.isotonic.y; ok(X.every((v, i) => !i || v >= X[i - 1]) && Y.every((v, i) => !i || v >= Y[i - 1] - 1e-12) && Y.every(v => v >= 0 && v <= 1), 'isotonic map of ' + T.name + ' is monotone and in [0,1]');
}
ok(M.thresholds['3'] && !M.thresholds['3'].served, 'High or higher is withheld (failed 2025)');

/* the gate */
const G = JSON.parse(readFileSync(ROOT + 'data/model-gate.resolved.json', 'utf8'));
const ge = (G.entries || []).find(e => e.id === 'river-chance');
ok(ge && ge.status === 'operational' && ge.class === 'calibrated_model' && ['rv:1', 'rv:2'].every(l => ge.layers.includes(l)), 'gate entry river-chance is a calibrated model covering rv:1 and rv:2', JSON.stringify(ge && { s: ge.status, c: ge.class }));

/* the API */
const C = await get('/api/flood/chance', { 'x-agn-view': 'customer' }), O = await get('/api/flood/chance');
ok(C.status === 200 && C.json && C.json.ready, 'customer /api/flood/chance answers', C.text.slice(0, 200));
ok(!SUP.test(C.text), 'customer river chance names no supplier', (C.text.match(SUP) || [])[0]);
ok(!('validation' in C.json) && O.json && O.json.validation && O.json.validation.byMonsoon, 'held-out skill is operator-only');
let bad = [], n = 0, order = [];
for (const [id, r] of Object.entries(C.json.reaches)) for (const d of r.days) { if (!d.p) continue; n++;
  for (const v of Object.values(d.p)) if (!(v >= 0 && v <= 100)) bad.push(id + ' ' + d.date + ' ' + v);
  if (d.p['1'] != null && d.p['2'] != null && d.p['2'] > d.p['1']) order.push(id + ' ' + d.date);
  if ('3' in d.p) bad.push(id + ' serves High'); }
ok(n > 100 && !bad.length, 'every chance is a percentage in 0-100 and High is never served (' + n + ' reach-days)', bad.slice(0, 5).join(' | '));
ok(!order.length, 'P(Medium+) never exceeds P(Low+)', order.slice(0, 5).join(' | '));
ok(Object.keys(C.json.reaches).length >= 18, 'all trained reaches answer (' + Object.keys(C.json.reaches).length + ')');

/* rising flow gives rising chance (the model's direction) */
const { createRiverProb } = await import(ROOT + 'server/api/riverprob.mjs');
const T1 = M.thresholds['1']; const s = (r) => 1 / (1 + Math.exp(-(T1.intercept + T1.coef[0] * r + T1.coef[1] * r)));
ok(s(1) > s(0) && s(0) > s(-1), 'Low+ chance rises with flow relative to the reach norms');

/* the map layers */
const cat = await get('/api/map/layers');
const items = (cat.json || []).flatMap(g => g.items.map(i => i[0]));
ok(items.includes('rv:1') && items.includes('rv:2'), 'river chance layers in the map catalogue');
for (const id of ['rv:1', 'rv:2']) { const L = await get('/api/map/layer?id=' + id + '&i=0', { 'x-agn-view': 'customer' });
  const v = Object.values(L.json.values || {}); const nw = Object.keys(L.json.whys || {}).length;
  ok(L.json.ready && L.json.type === 'chance' && v.length >= 100 && v.every(x => x >= 0 && x <= 100) && v.length + nw >= 575, id + ': ' + v.length + ' tehsils with a chance, ' + nw + ' with a reason', L.text.slice(0, 300));
  ok(!SUP.test(L.text), id + ' layer text names no supplier', (L.text.match(SUP) || [])[0]); }

/* the page */
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return !!(window.AGN && AGN.gate && AGN.gate.tag); } catch (_) { return false; } }, null, { timeout: 180000, polling: 1000 }).catch(() => {});
const tg = await pg.evaluate(() => { try { var t=AGN.gate.tag('rv:2'); return [t.text, AGN.gate.status('rv:2')]; } catch (e) { return ['err ' + e.message]; } });
ok(tg[1] === 'operational' && /Operational/.test(tg[0]), 'page gate: rv:2 tagged operational (' + tg[0] + ')', JSON.stringify(tg));
await pg.waitForTimeout(3000);
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v105: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
