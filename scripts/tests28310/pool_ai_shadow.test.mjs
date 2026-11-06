#!/usr/bin/env node
/* v283.10 · the AI weather models are shadow-only in the pool (server/api/pool.mjs AI_SHADOW). No server, no network: the pool is
   built on a stub fetch with synthetic members, so every expected number is exact.
     node scripts/tests28310/pool_ai_shadow.test.mjs            (exit 0 = PASS)
   Checks: (1) the default pool asks for and pools no AI model (7 physical models, ECMWF ENS alone); (2) ai:true gives the
   v91.17.61-65 pool (9 models, ENS + WeatherNext 2 at 0.5/0.5) for the operator shadow; (3) the exact P(R >= k) both ways;
   (4) NIGRAAN_POOL_AI=1 restores the AI pool as the default; (5) the routes never give the AI pool to the customer view, and the
   casebook reads the default; (6) the hourly-strip note and dissent text in the page module name the pool actually used. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails = 0; const check = (name, ok, got) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) fails++; };

/* ---- synthetic provider: 3 days hourly, ECMWF ENS 51 members (10 of them 6 mm/day), WeatherNext 2 64 members (40 of them 6 mm/day) */
const T0 = new Date(); T0.setUTCMinutes(0, 0, 0); T0.setUTCHours(0);
const hours = Array.from({ length: 72 }, (_, i) => new Date(T0.getTime() + i * 3600e3).toISOString().slice(0, 16));
const TEMP = { ecmwf_ifs025: 20, ecmwf_aifs025_single: 30, gfs_seamless: 21, ncep_aigfs025: 31, icon_seamless: 22, gem_seamless: 23, ukmo_seamless: 24, meteofrance_seamless: 25, jma_seamless: 26 };
const ENSN = { ecmwf_ifs025: [51, 10], google_weathernext2_ensemble: [64, 40] };
const calls = [];
globalThis.fetch = async (u) => {
  const url = new URL(String(u)); const host = url.searchParams.get('__omhost'); const models = (url.searchParams.get('models') || '').split(',').filter(Boolean);
  calls.push({ path: url.pathname, host, models });
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  if (host === 'api.open-meteo.com' && url.searchParams.get('daily')) { const days = [...new Set(hours.map(h => h.slice(0, 10)))]; return ok({ elevation: 500, daily: { time: days, precipitation_sum: days.map(() => 0.5) } }); }
  if (host === 'api.open-meteo.com') { const H = { time: hours }; for (const m of models) { H['temperature_2m_' + m] = hours.map(() => TEMP[m]); H['relative_humidity_2m_' + m] = hours.map(() => 50); H['wind_speed_10m_' + m] = hours.map(() => 3); H['precipitation_' + m] = hours.map(() => 0); } return ok({ elevation: 500, hourly: H }); }
  if (host === 'ensemble-api.open-meteo.com') {
    const m = models[0]; const [n, wet] = ENSN[m]; const daily = !!url.searchParams.get('daily');
    if (daily) { const days = [...new Set(hours.map(h => h.slice(0, 10)))]; const D = { time: days }; for (let k = 0; k < n; k++) D['precipitation_sum' + (k ? '_member' + String(k).padStart(2, '0') : '')] = days.map(() => k < wet ? 6 : 0); return ok({ daily: D }); }
    const H = { time: hours }; for (let k = 0; k < n; k++) H['precipitation' + (k ? '_member' + String(k).padStart(2, '0') : '')] = hours.map(() => k < wet ? 2 : 0); return ok({ hourly: H });
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
delete process.env.NIGRAAN_POOL_AI;
const { createPool } = await import(join(ROOT, 'server', 'api', 'pool.mjs'));
const app = { dataDir: join(ROOT, 'data') };
const pool = createPool(app);
const isAi = (m) => pool.AI_SHADOW.includes(m);

/* (1) default: no AI anywhere */
calls.length = 0;
const P0 = await pool.point({ lat: 33.7, lon: 73.05, elevM: 540, days: 3 });
check('default pool requests no AI model', calls.every(c => !c.models.some(isAi)), calls.map(c => c.models));
check('default family pool: 7 models, 7 families, median 23.0 C', P0.now.temperature.n === 7 && P0.now.temperature.families === 7 && P0.now.temperature.p50 === 23, P0.now.temperature);
check('default ensemble: ECMWF ENS alone', P0.ensembleRain.length > 0 && Object.keys(P0.ensembleRain[0].systems).join() === 'ECMWF ENS', P0.ensembleRain[0] && P0.ensembleRain[0].systems);
check('default P(R24 >= 5 mm) = 10/51 = 0.196', P0.ensembleRain[0].exceed[5] === 0.196, P0.ensembleRain[0].exceed);
check('default response says AI shadow-only', P0.aiModels && P0.aiModels.inPool === false && P0.rule.models.length === 7, P0.aiModels);

/* (2)+(3) operator shadow: the v91.17.61-65 pool */
const P1 = await pool.point({ lat: 33.7, lon: 73.05, elevM: 540, days: 3, ai: true });
check('ai:true family pool: 9 models, 7 families', P1.now.temperature.n === 9 && P1.now.temperature.families === 7, P1.now.temperature);
check('ai:true P(R24 >= 5 mm) = 0.5*10/51 + 0.5*40/64 = 0.411', P1.ensembleRain[0].exceed[5] === 0.411, P1.ensembleRain[0].exceed);
check('ai:true median moves: 24.0 C (AI members 30/31 C pull the ECMWF and NOAA votes)', P1.now.temperature.p50 === 24, P1.now.temperature.p50);

/* hazard feed: hourly and daily, both ways, cached separately */
calls.length = 0;
const H0 = await pool.hazard({ lat: 33.7, lon: 73.05, elevM: 540, mm: 5 });
check('default hazard requests no AI model', calls.every(c => !c.models.some(isAi)), calls.filter(c => c.models.some(isAi)));
check('default hazard hourly pGt1 = 10/51 = 0.196', H0.hourly.length === 72 && H0.hourly[0].pGt1 === 0.196 && H0.hourly[0].systems === 1, H0.hourly[0]);
check('default hazard: 7-model temperature band, aiModels.inPool false', H0.poolModelCount === 7 && H0.aiModels.inPool === false && /seven-model/.test(H0.rule.temperature), [H0.poolModelCount, H0.aiModels]);
check('default trigger 5 mm probability 0.196', H0.trigger.days[0].probability === 0.196, H0.trigger.days[0]);
const H1 = await pool.hazard({ lat: 33.7, lon: 73.05, elevM: 540, mm: 5, ai: true });
check('ai:true hazard hourly pGt1 = 0.411, 2 systems, 9 models', H1.hourly[0].pGt1 === 0.411 && H1.hourly[0].systems === 2 && H1.poolModelCount === 9 && H1.cached === false, [H1.hourly[0], H1.poolModelCount, H1.cached]);
const H0b = await pool.hazard({ lat: 33.7, lon: 73.05, elevM: 540, mm: 5 });
check('the cache keeps the two pools apart', H0b.cached === true && H0b.hourly[0].pGt1 === 0.196, [H0b.cached, H0b.hourly[0].pGt1]);

/* (4) the switch for after a pass */
process.env.NIGRAAN_POOL_AI = '1';
const P2 = await pool.point({ lat: 33.71, lon: 73.05, elevM: 540, days: 3 });
check('NIGRAAN_POOL_AI=1 makes the AI pool the default', P2.now.temperature.n === 9 && P2.aiModels.inPool === true, P2.aiModels);
delete process.env.NIGRAAN_POOL_AI;

/* (5) wiring: the customer view never gets the AI pool; the casebook reads the default */
const IDX = readFileSync(join(ROOT, 'server', 'api', 'index.mjs'), 'utf8');
check('poolAi: only ai=1 and not the customer view', /const poolAi = \(req, url\) => \(url\.searchParams\.get\('ai'\) === '1' && !customerView\(req\)\) \? true : undefined;/.test(IDX), null);
check('both public pool routes pass poolAi', (IDX.match(/app\.pool\.(point|hazard)\(\{[^}]*ai: poolAi\(req, url\) \}\)/g) || []).length === 2, null);
const CB = readFileSync(join(ROOT, 'server', 'api', 'casebook.mjs'), 'utf8');
check('casebook hazard call carries no ai flag (default pool)', /app\.pool\.hazard\(\{ lat, lon, elevM, mm: 25 \}\)/.test(CB) && !/WeatherNext 2, equal system weight', method/.test(CB.replace(/\? 'ECMWF ENS \+ WeatherNext 2, equal system weight'/, '')), null);

/* (6) the page module's note and dissent text follow the response */
async function noteText(resp) {
  const listeners = {}; const els = {};
  const el = (id) => (els[id] = els[id] || { id, style: {}, textContent: '', parentNode: { appendChild: (n) => { els[n.id] = n; } } });
  const D = { addEventListener: (e, f) => { (listeners[e] = listeners[e] || []).push(f); }, dispatchEvent: (ev) => { (listeners[ev.type] || []).forEach(f => f(ev)); return true; },
    getElementById: (id) => id === 'hscroll' ? el('hscroll') : (els[id] || null), createElement: () => ({ style: {} }) };
  const t0 = Date.now(); const time = [], temp = [];
  for (let i = 0; i < 30; i++) { const d = new Date(t0 + i * 3600e3); time.push(new Date(d.getTime() + 5 * 3600e3).toISOString().slice(0, 16)); temp.push(25); }
  const band = time.map((t, i) => ({ t: new Date(t0 + i * 3600e3).toISOString().slice(0, 13) + ':00', p10: 10, p50: 11, p90: 12 }));
  const G = { document: D, location: { protocol: 'http:' }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, Date, Math, Number, String, Object, Array, JSON, isFinite, encodeURIComponent, setTimeout: () => 0,
    __AGN_PROB_STRIP: { lat: 33.7, lon: 73.05, off: 18000, time, temp },
    fetch: async () => ({ ok: true, json: async () => ({ hourly: [], days: [], temperature: band, rainCalibration: { ok: true, tauMm: 0.5, group: 'plains (below 1,000 m)' }, ...resp }) }) };
  G.window = G;
  vm.runInNewContext(readFileSync(join(ROOT, 'server', 'science', 'modules', '093-page-script-194.js'), 'utf8'), G);
  G.AGN.prob.prime(33.7, 73.05, 540); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  return (els.agnProbNote || {}).textContent || '';
}
const tNo = await noteText({ aiModels: { inPool: false }, poolModelCount: 7 });
check('strip note without AI: "global ensemble members", 7-model band', /share of global ensemble members whose/.test(tNo) && !/AI weather model/.test(tNo) && /7-model P10/.test(tNo), tNo);
const tAi = await noteText({ aiModels: { inPool: true }, poolModelCount: 9 });
check('strip note with the AI pool (operator) keeps its v91.17.65 wording', /global ensemble and AI weather model members/.test(tAi) && /9-model P10/.test(tAi), tAi);
const tOld = await noteText({});
check('an older server (no aiModels field) reads as no AI; band falls back to "nine-model"', /global ensemble members/.test(tOld) && /nine-model/.test(tOld), tOld);

console.log(fails ? fails + ' FAIL' : 'ALL PASS'); process.exit(fails ? 1 : 0);
