import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.106 · the server engine: one engine for the map, the API, the AI facts, the alerts and the archive.
   node nigraan-local/scripts/tests106/v106.test.mjs  (server running with the engine on) */
import { readFileSync, existsSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const get = async (p, h = {}) => { const r = await fetch(BASE + p, { headers: h, signal: AbortSignal.timeout(120000) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t }; };
const SUP = /ECMWF|GloFAS|WeatherNext|DeepMind|NOAA|\bDWD\b|KNMI|Met Office|MET Norway|Météo-France|ERA5|IMERG|NASA|USGS|GHS-POP|Pakistan Meteorological|Flood Forecasting Division|ISD-Lite|GLOF-II|AEGIS|Open-Meteo|met\.no|\bPMD\b|\bFFD\b/;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 1 · the leftover rule: a process named by the pid file is stopped only if its command line names the engine profile */
{ const { createEngine } = await import(ROOT + 'server/api/engine.mjs');
  const mk = (tag) => spawn(process.execPath, ['-e', 'setTimeout(()=>{},120000)', '--', tag], { stdio: 'ignore' });
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };
  const A = mk('--user-data-dir=/x/engine-profile'), B = mk('--something-else'); await sleep(300);
  const d1 = mkdtempSync(join(tmpdir(), 'eng-')), d2 = mkdtempSync(join(tmpdir(), 'eng-'));
  writeFileSync(join(d1, 'engine-browser.pid'), String(A.pid)); writeFileSync(join(d2, 'engine-browser.pid'), String(B.pid));
  const save = process.env.NIGRAAN_ENGINE_BROWSER; process.env.NIGRAAN_ENGINE_BROWSER = '/nonexistent';
  const E1 = createEngine({}, d1, { port: 1 }), E2 = createEngine({}, d2, { port: 1 }); E1.start(3600e3); E2.start(3600e3); await sleep(500);
  ok(!alive(A.pid) && alive(B.pid), 'a leftover engine browser is stopped; an unrelated process with a reused pid is not');
  E1.stop(); E2.stop(); try { B.kill(); } catch (_) {} if (save == null) delete process.env.NIGRAAN_ENGINE_BROWSER; else process.env.NIGRAAN_ENGINE_BROWSER = save; }

/* 2 · the runner and its report */
let st = null; for (let i = 0; i < 40; i++) { st = (await get('/api/ops/engine')).json; if (st && st.reports > 0) break; await sleep(15000); }
ok(st && st.enabled && st.running && st.reports > 0 && st.latest && st.latest.ready && !st.latest.stale, 'the engine runs headless and has reported (' + (st && st.browser) + ', ' + (st && st.reports) + ' reports)', JSON.stringify(st).slice(0, 400));
const Lc = await get('/api/levels', { 'x-agn-view': 'customer' }), Lo = await get('/api/levels');
ok(Lc.json && Lc.json.ready && Lc.json.days.length >= 4 && Lc.json.days[0].layers.length >= 12 && Lc.json.days[1].layers.includes('heat') && Lc.json.days[1].layers.includes('drought') && Lc.json.days[1].layers.length === Lc.json.days[0].layers.length, 'levels for days 0-3; every hazard on every day (v91.17.273: once-per-issue layers carry the day-0 level, held)', JSON.stringify(Lc.json && Lc.json.days));
for (const [k, v] of Object.entries((Lc.json && Lc.json.layers) || {})) { const n = v.counts.reduce((a, b) => a + b, 0) + v.na + v.nd; if (n !== 576) { ok(false, 'every unit accounted for on ' + k, n); } }
const Hc = await get('/api/levels?layer=heat&day=0', { 'x-agn-view': 'customer' }), Ho = await get('/api/levels?layer=heat&day=0');
ok(Hc.json && Object.keys(Hc.json.levels).length >= 575 && !('scores' in Hc.json) && Ho.json && Ho.json.scores && Object.keys(Ho.json.scores).length > 400, 'heat levels for every tehsil; scores operator-only');
ok(!SUP.test(Hc.text) && !SUP.test(Lc.text), 'customer levels name no supplier', (Hc.text.match(SUP) || Lc.text.match(SUP) || [])[0]);
const U = await get('/api/levels/unit?unit=' + encodeURIComponent('Federal Capital|Islamabad|Islamabad'), { 'x-agn-view': 'customer' });
const U2 = U.json && U.json.ready ? U : await get('/api/levels/unit?unit=Islamabad', { 'x-agn-view': 'customer' });
ok(U2.json && U2.json.ready && U2.json.days[0].layers.heat && typeof U2.json.days[0].layers.heat.word === 'string', 'one tehsil, every layer, with words (' + (U2.json && U2.json.unit) + ': heat ' + (U2.json && U2.json.days && U2.json.days[0].layers.heat && U2.json.days[0].layers.heat.word) + ')', U2.text.slice(0, 300));
const nss = U2.json && U2.json.days[0].layers.nss_baseline; ok(!nss || nss.level < 0 || (!!nss.word && !['Normal', 'Low', 'Moderate', 'High', 'Severe'].includes(nss.word)), 'retention layer speaks its own scale words, not the hazard words (' + (nss && nss.word) + ')');   /* v91.17.226 · the words are plain now ("Runs off like bare ground"), data/map-layer-scales.json */
const dir = ROOT + 'data/archive/engine'; const af = existsSync(dir) ? readdirSync(dir).filter(f => /^engine_\d{4}-\d{2}\.jsonl\.gz$/.test(f)) : [];
ok(af.length >= 1, 'engine levels archived (' + af.join(', ') + ')');
const R = await fetch(BASE + '/api/engine/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); ok(R.status === 200 && (await R.json()).ok === false, 'a malformed report is refused');

/* 3 · the AI reads the same levels */
const EV = await get('/api/ai/evidence?prompt=' + encodeURIComponent('heat in Islamabad today'));
const ml = EV.json && EV.json.facts && EV.json.facts.askedUnits && EV.json.facts.askedUnits[0] && EV.json.facts.askedUnits[0].mapLevels;
const heatW = ml && ml.days[0].hazards.find(h => /^Heat/.test(h.hazard));
ok(heatW && U2.json && heatW.level === U2.json.days[0].layers.heat.word, 'AI facts carry the map levels (Islamabad heat: ' + (heatW && heatW.level) + ')', JSON.stringify(ml).slice(0, 300));

/* 4 · parity: the engine's day switch equals the map's own day switch, and the server equals a fresh page */
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return AGN.hz5.sweep().done && AGN.engine && AGN.selfcheck && AGN.selfcheck.unitOn; } catch (_) { return false; } }, null, { timeout: 300000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(90000);   /* v109: let the late inputs (cold baseline, river sweep) settle, as the engine does */
const P = await pg.evaluate(async () => { const o = { on: AGN.engine.on, diff: {} }; let E = AGN.engine.derive(); o.days = E.days.length;
  for (const d of [0, 1, 2]) { if (d === 0) { if (AGN.day.setBasis) AGN.day.setBasis('peak'); } AGN.day.set(d); await new Promise(r => setTimeout(r, 1500));
    const S = AGN.selfcheck.run(); E = AGN.engine.derive(); const ED = E.days.find(x => x.day === d);   /* back to back: the same inputs */
    for (const hz of Object.keys(ED.layers)) { const a = ED.layers[hz].L, b = (S.layers[hz] || {}).levels || {}; let n = 0, bad = 0, ex = []; for (const u in a) { n++; if (a[u] !== b[u]) { bad++; if (ex.length < 3) ex.push(u + ' ' + a[u] + '/' + b[u]); } } o.diff[d + ':' + hz] = { n, bad, ex }; } }
  AGN.day.set(0); return o; });
const pd = Object.entries(P.diff).filter(([, v]) => v.bad > 0);
ok(!P.on && P.days >= 4 && Object.keys(P.diff).length >= 20 && pd.length === 0, 'engine day switch = the map\'s own day switch on every layer, days 0-2 (' + Object.keys(P.diff).length + ' layer-days); a normal page does not report', JSON.stringify(pd.slice(0, 4)));
const day0 = await pg.evaluate(() => { const r = AGN.selfcheck.run(); const o = {}; for (const k in r.layers) o[k] = r.layers[k].levels; return o; });
let n = 0, same = 0; const ex = [];
for (const hz of Object.keys(day0)) { const s = (await get('/api/levels?layer=' + hz + '&day=0')).json; if (!s || !s.levels) continue; for (const u in day0[hz]) { n++; if (s.levels[u] === day0[hz][u]) same++; else if (ex.length < 5) ex.push(hz + ' ' + u + ' ' + s.levels[u] + '/' + day0[hz][u]); } }
const age = Math.round((Date.now() - Date.parse(((await get('/api/levels')).json || {}).received || 0)) / 60e3);
ok(n > 6000 && same / n >= 0.99, 'server levels agree with a fresh page on ' + (100 * same / Math.max(1, n)).toFixed(2) + ' % of ' + n + ' unit-layers (engine report ' + age + ' min old; differences are inputs refreshed between the two runs, the strict parity is the check above)', ex.join(' | '));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v106: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
