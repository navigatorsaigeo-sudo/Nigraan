#!/usr/bin/env node
/* v91.17.283.13 · HAZARD SCIENCE PACKAGE: one check per item, each written so that it FAILS on the tree before this package and PASSES after.
   Usage: node scripts/tests28313/hazsci.test.mjs [tree] [dataDir]
     tree     the NIGRAAN folder to test (default: this tree); the base tree is tested the same way (base-vs-new comparison)
     dataDir  the data folder (default NIGRAAN_DATA_DIR, else <tree>/data); it needs the live data files (engine-latest.json, hand-tehsil.json,
              landslide-rain.json, drought-chirps.json, sponge-tehsil.v2.json, flood.json, river-outlook.json, hazard-applicability.json)
   A first argument that is a URL (the shared test server of run-tests.mjs) is ignored: these checks need no server.
   Prints PASS / FAIL per check; exit 1 on any FAIL. */
import { readFileSync, existsSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = process.argv.slice(2).filter((x) => !/^https?:/.test(x));
const TREE = resolve(A[0] || HERE), DATA = resolve(A[1] || process.env.NIGRAAN_DATA_DIR || join(TREE, 'data'));
const mod = async (rel) => { const f = join(TREE, 'server', 'api', rel); return existsSync(f) ? import(pathToFileURL(f).href) : null; };
const J = (dir, f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (_) { return null; } };
let fails = 0, passes = 0;
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); };
const W5 = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

/* the record as served by the tree: the engine report, after the tree's own server-side steps (hazsci.mjs where it exists) */
async function served(rec) {
  const H = await mod('hazsci.mjs'); if (!H) return rec;
  const { buildUnitIndex } = await mod('national.mjs'); const { createHand } = await mod('hand.mjs'); const { createLandslideOdds } = await mod('landslideodds.mjs'); const { createFlood } = await mod('flood.mjs');
  let settle = null; try { settle = JSON.parse(readFileSync(join(DATA, 'settlement-elevation.json'), 'utf8')); } catch (_) {}
  const units = buildUnitIndex(JSON.parse(readFileSync(join(TREE, 'server', 'contract', 'units.json'), 'utf8')), settle);
  const app = { dataDir: DATA, units, contractDir: join(TREE, 'server', 'contract'), provider: { configured: () => false }, store: { filter: () => [] } };
  process.env.MACH_OFFLINE = '1'; app.flood = createFlood(app, DATA); app.hand = createHand(DATA, units); app.landslideOdds = createLandslideOdds(app, DATA);
  const O = (J(DATA, 'outlook.json') || {}).ensemble; app.outlook = { dayRows: () => (O && O.units ? { at: O.at, members: O.members, days: O.days, units: O.units } : null) };
  H.createHazSci(app, { dataDir: DATA }).apply(rec); return rec;
}
const ENG = J(DATA, 'engine-latest.json');
if (!ENG) { console.log('SKIP no engine-latest.json in ' + DATA); process.exit(77); }
const S = await served(JSON.parse(JSON.stringify(ENG)));
const L0 = (k) => S.days[0].layers[k];

/* ---- 1 river: no district inheritance; link by drainage; HAND applied; no river level off the gauged reaches ---- */
{ const R = L0('flood_riverine'); const RU = (J(DATA, 'river-reach-units.json') || {}).reaches || {};
  const inh = new Set(); for (const r of Object.values(RU)) for (const u of r.units || []) inh.add(u);
  const desert = ['Punjab|Bahawalnagar|Fort Abbas', 'Punjab|Bahawalpur|Yazman', 'Sindh|Jacobabad|Thul', 'Sindh|Dadu|Johi'];
  check('1a desert / off-river tehsils of gauged districts carry no river level (Fort Abbas, Yazman, Thul, Johi)', desert.every((u) => R.L[u] === -3), desert.map((u) => u.split('|')[2] + '=' + R.L[u]).join(' '));
  const link = J(DATA, 'river-link.json') || J(join(TREE, 'data'), 'river-link.json');
  const lvl = Object.entries(R.L).filter(([, v]) => v >= 0).map(([u]) => u);
  const lvlOk = !!link && lvl.every((u) => link.units[u] && Object.keys(link.units[u].reaches).length);
  if (!lvl.length && link) console.log('NOTE 1b: no tehsil has a river level in this data (no river forecast for the record\'s dates): checked on the linked set only');
  check('1b every tehsil with a river level is linked to a gauged reach along the river (river-link.json)', lvlOk && (lvl.length > 0 || !!link), lvl.length + ' with a level');
  const inhNoLink = [...inh].filter((u) => link && link.units[u] && !Object.keys(link.units[u].reaches).length && R.L[u] !== -2);
  if (!inh.size) console.log('NOTE 1c: data/river-reach-units.json (the old inheritance list) is not in this data folder: checked on 1a only');
  check('1c no inherited tehsil without a drainage link keeps a level', inh.size ? inhNoLink.length > 0 && inhNoLink.every((u) => R.L[u] === -3) : !!link, inhNoLink.length + ' inherited tehsils not on a gauged reach');
  const H = await mod('hazsci.mjs');
  if (H && H.riverCell) { const lk = { units: { X: { reaches: { g: { river: 'Indus' } }, modelChannelCells: 3, disputedChannelCells: 0 } } };
    /* v91.17.283.35 · audit A1: the class is the level unreduced (the HAND factor was untested as a multiplier); off the floodplain cannot happen (-4) */
    const a = H.riverCell('X', lk, { g: { level: 2 } }, { factor: 0.32, floodplainShare: 0.014 }), b = H.riverCell('X', lk, { g: { level: 2 } }, { factor: 1, floodplainShare: 0.6 }), c = H.riverCell('X', lk, { g: { level: 2 } }, { factor: 0.3, floodplainShare: 0 });
    check('1d a Medium-class reach reads Moderate on a narrow and a wide floodplain alike (the share is a fact); off the floodplain: not assessed (v283.36 C-now 5: never cannot happen)', a.L === 2 && b.L === 2 && c.L === -1 && a.facts.floodplainShare === 0.014, 'narrow ' + a.L + ' wide ' + b.L + ' off ' + c.L); }
  else check('1d HAND applied to the river score', false, 'no server river calculator in this tree');
  const nd = S.days.map((d) => d.layers.flood_riverine && d.layers.flood_riverine.held != null);
  check('1e the river level is per day, not day 0 held over the issue', nd.every((x) => !x), JSON.stringify(nd)); }

/* ---- 2 rain: the level can exceed Low; valid members with a minimum count; no alerts without an event test ---- */
{ const H = await mod('hazsci.mjs'); const O = await mod('outlook.mjs');
  if (H && O && O.rainClassShares) {
    const v = Array.from({ length: 40 }, (_, i) => (i < 24 ? 70 : 5));   /* 40 valid of 51, 24 at 70 mm */
    const c = O.rainClassShares(v, 51); const r = H.rainCell({ prc: c }, 51);
    const few = O.rainClassShares(v.slice(0, 20), 51);
    check('2a (v283.36 item 20) most valid members reaching 64.5 mm sets no level (untested share rule): not tested, the share a fact', r.L === -5 && r.facts && r.facts.shares && c.p['64.5'] === 60, 'L=' + r.L + ' P64.5=' + c.p['64.5'] + '% of ' + c.n + ' valid');
    check('2b fewer than half the members valid -> not assessed (no share)', few.p === null && H.rainCell({ prc: few }, 51).L === -1, few.why); }
  else { const lv = (J(DATA, 'model-gate.resolved.json') || {}).entries || []; check('2a the day level can exceed Low', false, 'rain level from the one-rung chance scale (Low only)'); check('2b minimum valid member count', false, 'not in this tree'); }
  const G = J(join(TREE, 'data'), 'model-gate.resolved.json'); const own = G && G.layerOwner && G.layerOwner.rain_hz; const e = G && G.entries.find((x) => x.id === own);
  check('2c rain_hz raises no alert without a per-level event test', !!e && e.resolved.canAlert === false, own + ' canAlert=' + (e && e.resolved.canAlert));
  const paper = G ? G.entries.filter((x) => x.resolved.canAlert && x.class !== 'observation' && !x.evidence).map((x) => x.id) : ['?'];
  check('2d no entry alerts on complete paperwork alone (every alerting forecast / satellite entry has an event test)', paper.length === 0, paper.join(', ')); }

/* ---- 3 landslide: per-input staleness; steep-share mask, no tehsil-mean slope gate ---- */
{ const M = await mod('landslideodds.mjs'); const tmp = mkdtempSync(join(tmpdir(), 'nig28313-ls-'));
  try { for (const f of ['landslide-odds-model.json', 'hazard-applicability.json', 'map-layer-scales.json']) if (existsSync(join(DATA, f))) copyFileSync(join(DATA, f), join(tmp, f));
    const day = (k) => new Date(Date.now() + 5 * 3600e3 + k * 864e5).toISOString().slice(0, 10);
    const obs = {}, fc = {}; for (let k = -62; k < 0; k++) obs[day(k)] = 2; for (let k = 0; k < 7; k++) fc[day(k)] = 3;
    const old = new Date(Date.now() - 40 * 3600e3).toISOString(), fresh = new Date().toISOString();
    writeFileSync(join(tmp, 'landslide-rain.json'), JSON.stringify({ at: fresh, basis: 'rain_sum', units: { A: { obs, fc, at: old }, B: { obs, fc, at: fresh } } }));
    const app = { provider: { configured: () => false }, units: { tehsil: [{ unitId: 'A', key: 'A', lat: 34, lon: 73 }, { unitId: 'B', key: 'B', lat: 34, lon: 73 }] } };
    const n = M.createLandslideOdds(app, tmp).national(); const sA = (n.units.A.days || []).filter((r) => r.ratio != null).length, sB = (n.units.B.days || []).filter((r) => r.ratio != null).length;
    check('3a a tehsil whose refresh is 40 h old keeps the days its forecast still covers (per-input staleness)', sA >= 4 && sB >= 5, 'served days: late tehsil ' + sA + ', fresh tehsil ' + sB); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  const AP = J(DATA, 'hazard-applicability.json'); const mask = (AP && AP.layers.landslide.units) || {}; const LS = L0('landslide');
  const out = Object.keys(LS.L).filter((u) => LS.L[u] === -4 || LS.L[u] === -2 || (LS.L[u] === -1 && LS.why && /no local steep ground/.test(LS.why[u] || ''))), maskOut = Object.keys(mask).filter((u) => mask[u].applies === false);
  check('3b (v283.36 item 24) the landslide "no local steep ground" state is exactly the steep-share mask (no tehsil-mean slope gate)', out.length === maskOut.length && out.every((u) => mask[u] && mask[u].applies === false), out.length + ' not applicable vs ' + maskOut.length + ' in the mask'); }

/* ---- 4 gauged rivers: per-gauge age; one scale ---- */
{ const RC = await mod('rivercal.mjs');
  if (RC && RC.gaugeAge) { const t = Date.parse('2026-10-24T06:00:00Z');
    const a = RC.gaugeCurrent(RC.gaugeAge({ id: 'x', lastReading: '2026-10-20', cls: 2, clsName: 'Medium', days: [{ k: 1, date: '2026-10-21', cls: 2 }] }, '2026-10-23', t));
    const b = RC.gaugeCurrent(RC.gaugeAge({ id: 'y', lastReading: '2026-10-23', cls: 1, clsName: 'Low', days: [] }, '2026-10-23', t));
    check('4a a gauge 4 days without a reading inside a fresh sheet is not current (no class; last measured kept), a fresh one stays', a.cls === null && a.current === false && a.lastMeasured.cls === 2 && b.cls === 1 && !b.stale, a.why); }
  else check('4a staleness per gauge', false, 'the sheet decides for every gauge in this tree');
  const src = readFileSync(join(TREE, 'server', 'api', 'index.mjs'), 'utf8');
  check('4b the model switch never writes an AGN level word into the official class field', !/clsName: MW\[/.test(src), 'clsName: MW[...] ' + (/clsName: MW\[/.test(src) ? 'present' : 'absent')); }

/* ---- 5 drought: one number, one date ---- */
{ const D = L0('drought'); const C = J(DATA, 'drought-chirps.json') || { units: {} }; const H = await mod('hazsci.mjs');
  const sp = (v) => v == null ? null : v <= -1.6 ? 4 : v <= -1.3 ? 3 : v <= -0.8 ? 2 : v <= -0.5 ? 1 : 0;
  const us = Object.keys(D.L).filter((u) => D.L[u] >= 0); const bad = us.filter((u) => { const m = C.units[u] && C.units[u].monthly && C.units[u].monthly.month; return !m || sp(m.spi3 && m.spi3.value) !== D.L[u]; });
  check('5a every drought level is the US Drought Monitor category of SPI-3 (CHIRPS) for one month', us.length > 0 && bad.length === 0, us.length + ' levels, ' + bad.length + ' not SPI-3 (e.g. ' + bad.slice(0, 2).join('; ') + ')');
  check('5b the drought layer names its one date', !!(D.date && /^\d{4}-\d\d$/.test(D.date)), String(D.date)); }

/* ---- 6 sponge: one source; fail closed; documented classes ---- */
{ const V = J(DATA, 'sponge-tehsil.v2.json'); const H = await mod('hazsci.mjs'); const N = L0('nss_baseline');
  if (!V) console.log('SKIP 6a: data/sponge-tehsil.v2.json is not in this data folder');
  else if (H && H.spongeOf) { const by = new Map(Object.entries(V.units).map(([k, u]) => [u.uid || k, u]));
    const bad = Object.keys(N.L).filter((u) => by.get(u) && H.spongeOf(V, by.get(u)).cls !== N.L[u]);
    check('6a every served sponge class is the 250 m table\'s own class (equivalent CN at the NRCS group-C covers)', bad.length === 0, bad.length + ' differ');
  }
  if (H && H.applySponge) { const rec = { days: [{ day: 0, date: '2026-10-24', layers: { nss_baseline: { L: { a: 1, b: 2 }, S: {} } } }] }; H.applySponge(rec, { v2: null });
    check('6b no 250 m table -> not assessed for every tehsil (never a fallback)', Object.values(rec.days[0].layers.nss_baseline.L).every((x) => x === -1)); }
  else { if (V) check('6a served sponge class = the 250 m table class', false, 'the engine\'s 0-100 band is served in this tree'); check('6b fail closed without the table', false, 'not in this tree'); }
  const wsrc = readFileSync(join(TREE, 'server', 'api', 'wetness.mjs'), 'utf8');
  check('6c the wetness sponge reads the 250 m table only (no v1 SoilGrids sponge, no tehsil-mean CN table)', !/load\('sponge-tehsil\.json'\)/.test(wsrc) && !/load\('cn-tehsil\.json'\)/.test(wsrc));
  const ND = L0('nss_dynamic'); const lab = Object.keys(ND.L).filter((u) => ND.L[u] === -1);
  check('6d every tehsil without a wetness sponge is labelled missing with its reason', lab.every((u) => ND.why && ND.why[u]), lab.length + ' labelled'); }

/* ---- 7 GLOF: one class mapping ---- */
{ const HS = J(join(TREE, 'data'), 'hazard-scale.json'); const src = readFileSync(join(TREE, 'server', 'api', 'glof.mjs'), 'utf8');
  const own = /const LEVEL_WORD = \{[^}]*Monitor: '(\w+)'/.exec(src); const table = HS && (HS.glofLadder || HS.operationalLadder);
  check('7a GLOF Monitor has one level on every surface (glof.mjs reads hazard-scale.json, no own copy)', !own && !!(HS && HS.glofLadder && HS.glofLadder.Monitor), own ? 'glof.mjs Monitor=' + own[1] + ' vs hazard-scale ' + (table && table.Monitor) : 'glofLadder.Monitor=' + (HS && HS.glofLadder && HS.glofLadder.Monitor)); }

/* ---- 9 thresholds register ---- */
{ const R = J(join(TREE, 'data'), 'thresholds-register.json'); const gen = join(TREE, 'scripts', 'v28313', 'gen_thresholds_register.mjs');
  const fresh = existsSync(gen) ? spawnSync(process.execPath, [gen, '--check'], { cwd: TREE, encoding: 'utf8' }) : null;
  check('9a data/thresholds-register.json exists and matches the code', !!R && !!fresh && fresh.status === 0, fresh ? (fresh.stdout || fresh.stderr).trim() : 'no register');
  const eh = R ? R.rows.filter((r) => /calibrationStatus: (expert|heuristic)$/.test(r.note || '')) : [];
  check('9b every expert / heuristic registry entry (52 + 23 in the page register of v283.11) and the house cuts 25/45/65/82 are screening', eh.length >= 75 && eh.every((r) => r.status === 'screening') && R.rows.filter((r) => /screeningCuts/.test(r.id)).every((r) => r.status === 'screening'), eh.length + ' expert/heuristic rows'); }

console.log('\n' + passes + ' passed, ' + fails + ' failed (tree ' + TREE + ', data ' + DATA + ')');
process.exit(fails ? 1 : 0);
