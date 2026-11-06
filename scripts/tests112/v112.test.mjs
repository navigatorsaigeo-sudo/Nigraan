import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.112 · rain-triggered landslide likelihood against an ordinary day.
   node nigraan-local/scripts/tests112/v112.test.mjs  (server running, landslide rain job has run) */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const get = async (p, h = {}) => { const r = await fetch(BASE + p, { headers: h, signal: AbortSignal.timeout(120000) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t }; };
const SUP = /ECMWF|GloFAS|WeatherNext|DeepMind|NOAA|\bDWD\b|KNMI|Met Office|MET Norway|Météo-France|ERA5|IMERG|NASA|USGS|GHS-POP|Pakistan Meteorological|Flood Forecasting Division|ISD-Lite|GLOF-II|AEGIS|Open-Meteo|met\.no|\bPMD\b|\bFFD\b/;

/* 1 · the model file and its held-out test */
const M = JSON.parse(readFileSync(ROOT + 'data/landslide-odds-model.json', 'utf8'));
ok(Array.isArray(M.features) && M.coef.length === M.features.length && M.coef[M.features.indexOf('P1')] > 0 && M.coef[M.features.indexOf('P3')] > 0, 'more rain on the day and over 3 days raises the ratio (' + (M.features || []).map((f, i) => f + ' ' + M.coef[i]).join(', ') + ')');   /* v91.17.228 · the v162 liquid model has P1, P3, P7 */
const sv = M.validation && M.validation.served; ok(sv && sv.auc >= 0.7, 'served form held-out AUC >= 0.7 (' + (sv && sv.auc) + ')');
const mid = { '2-5': 3.2, '5-10': 7.1, '10-20': 14.1 };
for (const c of (sv ? sv.calibration : [])) if (mid[c.band]) ok(c.observedVsOrdinaryDay >= mid[c.band] / 2 && c.observedVsOrdinaryDay <= mid[c.band] * 2, 'calibration band ' + c.band + ': observed ' + c.observedVsOrdinaryDay + 'x within a factor 2 of the band');
const obs = sv ? sv.calibration.map(c => c.observedVsOrdinaryDay) : []; ok(obs.length >= 5 && obs.every((v, i) => !i || v > obs[i - 1]), 'observed ratio rises band by band (' + obs.join(', ') + ')');
ok(Object.keys(M.referenceByMonth).length === 12, 'an ordinary day for every month');

/* 2 · the features match the training definition */
const { features, oddsRatio } = await import(ROOT + 'server/api/landslideodds.mjs');
const rain = Array.from({ length: 70 }, (_, k) => (k % 5) * 2); rain[65] = 30; rain[66] = 50;
const f = features(rain, 65); let api = 0; for (let k = 0; k < 60; k++) api += rain[65 - k] * Math.exp(-k / 15);
ok(f && f.P1 === 50 && f.P3 === rain[63] + rain[64] + 30 && f.P7 === rain.slice(59, 66).reduce((a, b) => a + b, 0) && Math.abs(f.API15 - api) < 1e-9, 'P1 is the larger of the day and the next; P3, P7, API15 as trained', JSON.stringify(f));
const ref = M.referenceByMonth['7']; ok(Math.abs(oddsRatio(M, ref, 7) - 1) < 1e-9, 'the ordinary day of the month scores exactly 1x');
ok(features(rain.map((v, k) => k < 40 ? null : v), 65) === null, 'fewer than 30 antecedent days: no ratio');

/* 3 · the API */
const C = await get('/api/landslide/odds', { 'x-agn-view': 'customer' }), O = await get('/api/landslide/odds');
ok(C.status === 200 && C.json && C.json.ready, 'customer /api/landslide/odds answers', C.text.slice(0, 200));
ok(!SUP.test(C.text), 'customer landslide text names no supplier', (C.text.match(SUP) || [])[0]);
ok(!('validation' in C.json) && O.json && O.json.validation && O.json.validation.served, 'held-out skill is operator-only');
const A = JSON.parse(readFileSync(ROOT + 'data/hazard-applicability.json', 'utf8')); const outside = new Set(Object.keys(A.layers.landslide.units));
const uids = Object.keys(C.json.units); ok(uids.length >= 300 && uids.every(u => !outside.has(u)), 'only tehsils inside the landslide mask (' + uids.length + ')');
let bad = []; for (const [u, x] of Object.entries(C.json.units)) for (const d of x.days) if (d.ratio != null && !(d.ratio > 0 && d.ratio < 1e4)) bad.push(u + ' ' + d.ratio);
ok(!bad.length, 'every ratio is positive and finite', bad.slice(0, 5).join(' | '));

/* 4 · the map layer */
const cat = await get('/api/map/layers'); const items = (cat.json || []).flatMap(g => g.items.map(i => i[0]));
ok(items.includes('ls:odds'), 'ls:odds in the map catalogue');
const L = await get('/api/map/layer?id=ls:odds&i=0', { 'x-agn-view': 'customer' }); const v = Object.keys(L.json.values || {});
ok(L.json.ready && L.json.type === 'levels' && L.json.classes.length === 5 && v.length >= 300 && v.every(u => !outside.has(u)), 'ls:odds: ' + v.length + ' tehsils, five classes, none outside the mask', L.text.slice(0, 300));
ok(Object.keys(L.json.whys).filter(u => outside.has(u)).length === outside.size, 'every tehsil outside the mask carries the terrain reason');
ok(!SUP.test(L.text), 'ls:odds layer text names no supplier', (L.text.match(SUP) || [])[0]);
ok(L.json.classes[0].max === 2 && L.json.classes[4].max == null, 'class edges come from the calibration bands (2, 5, 10, 20)');

/* 5 · gate, ledger, AI */
const G = JSON.parse(readFileSync(ROOT + 'data/model-gate.resolved.json', 'utf8')); const ge = (G.entries || []).find(e => e.id === 'landslide-odds');
ok(ge && ge.status === 'operational' && ge.class === 'calibrated_model' && ge.layers.includes('ls:odds'), 'gate entry landslide-odds covers ls:odds');
const R = JSON.parse(readFileSync(ROOT + 'data/rule-ledger.json', 'utf8')); ok(R.rules.some(r => r.id === 'landslide-odds'), 'rule ledger records the change');
const top = Object.entries(C.json.units).map(([u, x]) => [u, Math.max(...x.days.map(d => d.ratio || 0))]).sort((a, b) => b[1] - a[1])[0];
const nm = top[0].split('|').pop(); const EV = await get('/api/ai/evidence?prompt=' + encodeURIComponent('landslide risk in ' + nm + ' this week'));
const au = EV.json && EV.json.facts && (EV.json.facts.askedUnits || []).find(a => a.landslideRainTrigger);
ok(au && au.landslideRainTrigger.days.length >= 1, 'AI facts carry the landslide ratio for ' + nm, EV.text.slice(0, 300));

/* 6 · the page */
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return !!(window.AGN && AGN.gate && AGN.gate.tag); } catch (_) { return false; } }, null, { timeout: 180000, polling: 1000 }).catch(() => {});
const tg = await pg.evaluate(() => { try { var t = AGN.gate.tag('ls:odds'); return [t.text, AGN.gate.status('ls:odds')]; } catch (e) { return ['err ' + e.message]; } });
ok(tg[1] === 'operational', 'page gate: ls:odds tagged operational (' + tg[0] + ')', JSON.stringify(tg));
await pg.waitForFunction(() => { try { return RIVER_STATE.loaded; } catch (_) { return false; } }, null, { timeout: 300000, polling: 2000 }).catch(() => {});
const rr = await pg.evaluate(async () => { const before = RIVER_STATE.at; RIVER_STATE.loaded = false; RIVER_STATE.error = 'simulated'; const started = AGN_ENGINE_RIVER_RETRY(); const again = AGN_ENGINE_RIVER_RETRY();
  for (let i = 0; i < 90 && !RIVER_STATE.loaded; i++) await new Promise(x => setTimeout(x, 1000)); return { started, again, loaded: RIVER_STATE.loaded, newer: RIVER_STATE.at > before }; });
ok(rr.started && !rr.again && rr.loaded && rr.newer, 'engine retries a failed river sweep, at most once per 9 minutes', JSON.stringify(rr));
await pg.waitForTimeout(3000); ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v112: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
