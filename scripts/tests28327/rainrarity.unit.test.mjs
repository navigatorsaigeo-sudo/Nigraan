/* v91.17.283.27 . ITEM 1 · RAIN RARITY HAS ONE HOME: data/rain-return-levels.json (25-year satellite return levels, passed its locked
   test, PLAN_A / RESULTS 28 Oct 2026), offline (no server, no provider):
     R1  the shipped file: served, the locked tests recorded as passed, 1/3/6/24-h levels per tehsil, catchment and district; only the
         24-h entry carries a point level (the sub-daily gauge factor failed); catchments outside the satellite clip are not assessed
     R2  the day rarity (hazsci.mjs dayRarity / rarityBand): below the 2-year level "less than a 2-year event", between two levels the
         lower one named, beyond the 100-year level "beyond 100-year"; the 24-h POINT level is read; no file / unknown tehsil / no amount
         = not assessed with the reason (never a band)
     R3  applyRain: the rarity is a fact beside the class (dayRarity), the cell's level is unchanged; without the file the fact says
         not assessed
     R4  the place bundle part rainRarity (hazsci rainLevels): 1-6 h labelled area rain, 24 h with the point level
     R5  catchment heavy rain (catchment.mjs) reads the catchment's own 24-h AREA levels: the class is the share of members reaching the
         2-year day; a catchment outside the clip is not assessed (no provider call); no IFS record is fetched or stored
     R6  the replaced copies are gone: the page's ERA5 table (agn-rain-clim) and its module, every AGN.rainClim reader, the rain_local
         rank scores and the ERA5 rarity floor (formula registry, page, science modules); the register names the new source
   usage: node scripts/tests28327/rainrarity.unit.test.mjs */
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
const imp = (f) => import(pathToFileURL(join(API, f)).href);
const J = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };

const RL = J('data', 'rain-return-levels.json');
/* ── R1 ── */
{
  ok(RL.served === true && /passed every locked test/.test(RL.servedWhy || ''), 'R1a the return-level file is served, with why', RL.servedWhy);
  ok(JSON.stringify(RL.returnPeriods) === '[2,5,10,25,50,100]', 'R1b return periods 2-100 years', RL.returnPeriods);
  const U = Object.values(RL.units);
  ok(U.length === 577 && U.every((u) => ['1h', '3h', '6h', '24h'].every((k) => u[k] && u[k].areaRl && u[k].areaRl.length === 6)), 'R1c 577 tehsils with 1/3/6/24-h area levels', U.length);
  ok(U.every((u) => Array.isArray(u['24h'].pointRl) && !u['1h'].pointRl && !u['3h'].pointRl && !u['6h'].pointRl), 'R1d only the 24-h entry carries a point level');
  const na = Object.values(RL.catchments).filter((c) => c.assessed === false);
  ok(na.length > 0 && na.every((c) => /outside the satellite/.test(c.why)), 'R1e catchments outside the satellite clip are marked not assessed with the reason', na.length);
  ok(RL.pointFactor24h && RL.pointFactor24h.test && RL.pointFactor24h.test.passed === true, 'R1f the 24-h gauge factor test is recorded as passed');
  ok(RL.tests && RL.tests.subDailyFactor && JSON.stringify(RL.tests.subDailyFactor).includes('false'), 'R1g the sub-daily factor test is recorded (failed)');
}
const HZ = await imp('hazsci.mjs');
/* ── R2 ── */
{
  const uid = Object.keys(RL.units)[0], P = RL.units[uid]['24h'].pointRl;
  const below = HZ.dayRarity(RL, uid, P[0] - 0.5), mid = HZ.dayRarity(RL, uid, (P[2] + P[3]) / 2), top = HZ.dayRarity(RL, uid, P[5] + 10), at2 = HZ.dayRarity(RL, uid, P[0]);
  ok(below.assessed && below.band === '<2' && /less than a 2-year/.test(below.words), 'R2a under the 2-year point level: "less than a 2-year event"', below);
  ok(mid.assessed && mid.band === '10-25' && mid.atLeastYears === 10 && mid.belowYears === 25, 'R2b between the 10- and 25-year levels: the 10-year level named', mid);
  ok(top.assessed && top.band === '>=100' && /beyond 100-year/.test(top.words), 'R2c beyond the 100-year level: "beyond 100-year"', top);
  ok(at2.band === '2-5', 'R2d exactly at the 2-year level counts as reached', at2);
  ok(mid.scale === 'point' && JSON.stringify(mid.levelsMm) === JSON.stringify(P) && /gauge factor/.test(mid.basis), 'R2e the 24-h POINT level is read (gauge factor), and said', mid.basis);
  const n1 = HZ.dayRarity(null, uid, 50), n2 = HZ.dayRarity(RL, 'Nowhere|X|Y', 50), n3 = HZ.dayRarity(RL, uid, null);
  ok([n1, n2, n3].every((x) => x.assessed === false && /not assessed/.test(x.why) && x.band === undefined), 'R2f no file / unknown tehsil / no amount: not assessed with the reason, never a band', [n1, n2, n3]);
}
/* ── R3 ── */
{
  const uid = Object.keys(RL.units)[5]; const date = '2026-11-02';
  const mk = () => ({ days: [{ day: 4, date, layers: { rain_hz: { L: { [uid]: 0 } } } }] });
  const ens = { at: new Date().toISOString(), members: 51, days: [date], units: { [uid]: [{ pr: [0, 140, 200], n: 51, prc: { n: 51, of: 51, p: { '15.6': 90, '64.5': 70, '115.6': 55, '204.5': 10 } } }] } };
  const a = mk(), b = mk(); HZ.applyRain(a, ens, {}); HZ.applyRain(b, ens, { rl: RL });
  const fa = a.days[0].layers.rain_hz, fb = b.days[0].layers.rain_hz;
  ok(fa.L[uid] === fb.L[uid] && fa.L[uid] === -5, 'R3a the rarity changes no level (v283.36 item 22: no 50 %-of-members level, not tested)', [fa.L[uid], fb.L[uid]]);
  const dr = fb.facts[uid].dayRarity;
  ok(dr && dr.assessed && dr.mm === 140 && dr.amountBasis === 'the forecast day total (ensemble median)', 'R3b the rarity of the forecast day total is a fact beside the class', dr);
  ok(fa.facts[uid].dayRarity && fa.facts[uid].dayRarity.assessed === false, 'R3c without the file the rarity fact says not assessed', fa.facts[uid].dayRarity);
  ok(/India Meteorological Department/.test(fb.basis), 'R3d the layer basis names the source of the classes', fb.basis);
  const c = mk(); HZ.applyRain(c, { ...ens, at: new Date(Date.now() - 48 * 3600e3).toISOString() }, { rl: RL }); const fc = c.days[0].layers.rain_hz;
  ok(fc.L[uid] === -6 && !(fc.facts && fc.facts[uid] && fc.facts[uid].dayRarity), 'R3e (v283.31 state -6 input not current) a stale ensemble run gives no rarity fact (the cell is not assessed)', fc.facts);
}
/* ── R4 ── */
{
  const app = { engine: null };
  const H = HZ.createHazSci(app, { dataDir: join(ROOT, 'data') });
  const uid = Object.keys(RL.units)[3]; const r = H.rainLevels(uid);
  ok(r.ready && /area rain/.test(r.durations['1h'].scale) && !r.durations['1h'].pointRl && /point level/.test(r.durations['24h'].scale) && r.durations['24h'].pointRl, 'R4a rainLevels: 1-6 h labelled area rain, 24 h with the point level', r.durations);
  ok(H.rainLevels('Nowhere').ready === false, 'R4b an unknown tehsil is not ready, with the reason');
  const idx = readFileSync(join(API, 'index.mjs'), 'utf8');
  ok(/rainRarity: \(c\) =>[^\n]*rainLevels\(c\.uid\)/.test(idx), 'R4c the place bundle carries the part rainRarity');
}
/* ── R5 ── */
{
  const M = await imp('catchment.mjs');
  const T = mkdtempSync(join(tmpdir(), 'c27-'));
  const ida = Object.keys(RL.catchments).find((k) => RL.catchments[k].assessed !== false), idn = Object.keys(RL.catchments).find((k) => RL.catchments[k].assessed === false);
  const sq = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
  writeFileSync(join(T, 'hybas_pk_lev07.json'), JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { id: Number(ida), down: 0, area: 1800, up: 1800 }, geometry: sq(70, 30, 70.4, 30.4) },
    { type: 'Feature', properties: { id: Number(idn), down: 0, area: 1800, up: 1800 }, geometry: sq(71, 30, 71.4, 30.4) }] }));
  copyFileSync(join(ROOT, 'data', 'rain-return-levels.json'), join(T, 'rain-return-levels.json'));
  copyFileSync(join(ROOT, 'data', 'formula-registry.json'), join(T, 'formula-registry.json'));
  const L2 = RL.catchments[ida]['24h'].areaRl[0];
  const calls = []; const provider = { call: async (kind, path, q) => { calls.push(kind); const n = q.latitude.length;
    /* 10 members: 4 reach the 2-year day, 6 do not (every point the same value) */
    const day = { time: ['2026-11-02'], precipitation_sum: [L2 + 1] }; for (let m = 1; m < 10; m++) day['precipitation_sum_member' + String(m).padStart(2, '0')] = [m < 4 ? L2 + 5 : L2 / 3];
    return Array.from({ length: n }, () => ({ daily: day })); } };
  const C = M.createCatchment({ provider, dataDir: T });
  const vn = await C.heavyRain(30.2, 71.2);
  ok(vn.ok === false && vn.notAssessed === true && /not assessed: outside the satellite/.test(vn.why) && !calls.length, 'R5a a catchment outside the satellite clip is not assessed with the reason, and no provider call is made', vn);
  const v = await C.heavyRain(30.2, 70.2);
  ok(v.ok && v.peakChance === 40 && v.class === 'Watch' && v.record.levelsMm[2] === L2 && /2-year wettest day/.test(v.record.against), 'R5b the class reads the share of members reaching the catchment\'s own 2-year day (4 of 10: 40 % -> Watch)', v);
  ok(v.record.scale === 'area rain (catchment mean)' && v.days[0].chance5y != null, 'R5c the members are read against the AREA levels; 5- and 10-year shares are facts', v.record);
  ok(!calls.includes('historicalForecast') && !existsSync(join(T, 'catchment-p99.json')), 'R5d no IFS history is fetched and no record store is written', calls);
  rmSync(T, { recursive: true, force: true });
}
/* ── R6 ── */
{
  const page = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
  ok(!/agn-rain-clim/.test(page) && !/AGN\.rainClim/.test(page) && !/rain_local\./.test(page), 'R6a the page carries no ERA5 rain table, no AGN.rainClim reader and no rain_local rank', [/agn-rain-clim/.test(page), /AGN\.rainClim/.test(page)]);
  const mods = readdirSync(join(ROOT, 'server', 'science', 'modules')); const any = mods.some((f) => /rainClim|rain_local|rarityFloorByRank/.test(readFileSync(join(ROOT, 'server', 'science', 'modules', f), 'utf8')));
  ok(!mods.some((f) => /rain-clim/.test(f)) && !any && !existsSync(join(ROOT, 'server', 'science', 'data', 'agn-rain-clim.json')), 'R6b the science modules and data hold no copy (module, payload, readers)');
  const FR = J('data', 'formula-registry.json');
  ok(!FR.rain_local && !FR.flood_ext.rarityFloorByRank && !FR.flood_ext.rarityWeight, 'R6c the formula registry holds no ERA5 rarity rank or floor');
  const G = J('data', 'model-gate.json').entries.find((e) => e.id === 'flood-pluvial');
  ok(!/20-year maximum/.test(G.method) && G.known_limitations.length === G.client_limitations.length, 'R6d the pluvial gate entry no longer claims the ERA5 rarity floor (limitations stay paired)', G.method);
  const RG = J('data', 'thresholds-register.json').rows;
  ok(RG.some((r) => r.id === 'rain-return-levels.returnPeriods' && r.status === 'tested' && /IMERG/.test(r.source)) && RG.some((r) => r.id === 'rain-return-levels.pointFactor24h' && r.status === 'tested') && !RG.some((r) => /^FR\.rain_local\./.test(r.id)), 'R6e the thresholds register names the new source (levels and gauge factor tested) and drops the ERA5 ranks');
  const cat = readFileSync(join(API, 'catchment.mjs'), 'utf8');
  ok(!/historicalForecast|saveP99|p99store/.test(cat.replace(/\/\*[\s\S]*?\*\//g, '')), 'R6f catchment.mjs keeps no IFS percentile record (code)');
  const ws8 = J('scripts', 'tests283', 'ws8', 'keep.json');
  ok(!ws8.data.includes('agn-rain-clim') && !ws8.blocks.some((b) => b.id === 'agn-rain-clim-js'), 'R6g the science extraction list no longer keeps the table');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
