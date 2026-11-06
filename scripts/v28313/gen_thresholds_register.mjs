#!/usr/bin/env node
/* v91.17.283.13 · audit item 10 · THE THRESHOLDS REGISTER, GENERATED FROM THE CODE AND THE PARAMETER FILES (never typed by hand, so it
   cannot drift): every level cut in use, its value, and either its published source / its test, or "screening" when neither exists.
   Inputs (read only): the formula registry (data/formula-registry.json; on older builds the page's agn-formula-registry block, evaluated in a sandbox), the server's own
   constants (imported from the modules that use them), data/hazard-scale.json, data/river-level-scale.json, data/hazard-applicability.json,
   data/landslide-odds-model.json, data/drought-class.json, data/utci.json, data/sponge-tehsil.v2.json, data/model-gate.json.
   Status rule: 'published' = a cited published scale or standard; 'tested' = a measured / held-out / anchored value with its evidence;
   'screening' = expert, heuristic, design or house values with neither (shown as screening, never as a tested level); 'superseded' = kept
   in the registry, not used for a level. No value is changed here.
   Usage: node scripts/v28313/gen_thresholds_register.mjs [--check]   (--check: exit 1 when data/thresholds-register.json is out of date) */
import vm from 'node:vm';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as HZ from '../../server/api/hazsci.mjs';
import { AQI_PM25_TABLE } from '../../server/api/smog.mjs';
import { HAND_FLOOR, HAND_FULL } from '../../server/api/hand.mjs';
import { GAUGE_STALE_DAYS } from '../../server/api/rivercal.mjs';
import { LEVEL_OF_CLASS } from '../../server/api/pointstate.mjs';   /* v91.17.283.20 · the level of each UTCI class (the legends of the pages) */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const J = (f) => { try { return JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8')); } catch (_) { return null; } };
/* the formula register: the server's file (data/formula-registry.json, served at /api/registry/formula since v283.12), else the copy
   embedded in the page (older builds) */
let FRo = J('formula-registry.json');
if (!FRo) { const ART = join(ROOT, 'artefact', process.env.NIGRAAN_ARTEFACT || 'AI_GEO_NIGRAAN_v91_17_MACH.html');
  const m = readFileSync(ART, 'utf8').match(/<script id="agn-formula-registry">([\s\S]*?)<\/script>/);
  const ctx = { window: {}, document: { readyState: 'complete', addEventListener() {} }, console: { log() {}, warn() {} } }; vm.createContext(ctx);
  try { vm.runInContext(m[1] + '\n;this.__FR = FORMULA_REGISTRY;', ctx, { timeout: 10000 }); FRo = ctx.__FR; } catch (e) { console.error('formula registry not evaluated:', e.message); process.exit(2); } }
const SCREEN = /^(expert|heuristic|design|assumed|house|convention)/i, TESTED = /^(measured|anchored|calibrated|fitted|tested)/i, PUB = /^(standard|published)/i, SUPER = /^superseded/i;
const statusOf = (cs) => { const s = String(cs || '').trim(); return SUPER.test(s) ? 'superseded' : PUB.test(s) ? 'published' : TESTED.test(s) ? 'tested' : SCREEN.test(s) ? 'screening' : s ? 'screening' : 'screening'; };
const rows = [];
const add = (r) => rows.push({ hazard: r.hazard, id: r.id, value: r.value, unit: r.unit || null, status: r.status, source: r.source || null, where: r.where, ...(r.note ? { note: r.note } : {}) });
/* 1 · the page formula registry (every entry with a value and a calibration status) */
const HAZ_OF = (k) => ({ heat: 'heat', cold: 'cold', rainChance: 'heavy rain', flood: 'flood', wind: 'wind', drought: 'drought', glof: 'glof', landslide: 'landslide', gaugeOutlookCore: 'river gauges', confidence: 'report confidence' }[k] || k);
(function walk(o, path) { for (const [k, v] of Object.entries(o || {})) { if (!v || typeof v !== 'object' || Array.isArray(v)) continue; const p = path.concat(k);
  if ('value' in v && ('calibrationStatus' in v || 'basis' in v)) { const st = statusOf(v.calibrationStatus);
    add({ hazard: HAZ_OF(p[0]), id: 'FR.' + p.join('.'), value: v.value, unit: v.unit, status: st, source: st === 'screening' ? 'screening: ' + (v.basis || 'no source or test recorded') : (v.evidence ? v.evidence + '; ' : '') + (v.basis || v.calibrationStatus), where: 'page formula registry (agn-formula-registry)', note: 'calibrationStatus: ' + (v.calibrationStatus || 'none') }); }
  else walk(v, p); } })(FRo, []);
/* 2 · the one hazard scale */
const HS = J('hazard-scale.json');
for (const c of (HS && HS.screeningCuts) || []) add({ hazard: 'all 0-100 indices', id: 'hazard-scale.screeningCuts.' + c.level, value: c.min, unit: 'index (0-100)', status: 'screening', source: 'screening: AGN house band cuts (AGN_BAND_CUTS), not a published scale; a hazard placed on them is a screening level unless its own entry carries a test', where: 'data/hazard-scale.json' });
if (HS && HS.glofLadder) add({ hazard: 'glof', id: 'hazard-scale.glofLadder', value: HS.glofLadder, status: 'screening', source: 'screening: expert evidence ladder (glof.mjs); one class-to-level table (' + (HS.glofLadderSource || '') + ')', where: 'data/hazard-scale.json' });
/* 3 · the server's own level cuts (imported from the modules) */
/* v91.17.283.27 · item 3 · the 24-hour rain classes have one home, data/hazard-scale.json rainClasses24h (its source is written there once) */
{ const RC = (HS && HS.rainClasses24h) || {}; add({ hazard: 'heavy rain', id: 'hazard-scale.rainClasses24h', value: HZ.RAIN_CLASSES, unit: RC.unit || 'mm per 24 h', status: RC.status || 'published', source: RC.source || null, where: 'data/hazard-scale.json rainClasses24h (read by scalecuts.mjs for hazsci.mjs, rainprob.mjs, outlook.mjs, served.mjs, maplayers.mjs rain_fell)' }); }
/* v91.17.283.27 · item 1 · rain rarity: the one home data/rain-return-levels.json (read from the file, never copied here) */
{ const RL = J('rain-return-levels.json'); if (RL) { const T = RL.tests || {}, TH = T.temporalHoldOut || {}, f = RL.pointFactor24h || {};
  const hold = Object.entries(TH).filter(([k]) => k.startsWith('24h|')).map(([k, v]) => k.split('|')[1] + ' ' + (v.observed != null ? Math.round(v.observed * 100) / 100 : '?') + ' vs ' + v.nominal).join(', ');
  add({ hazard: 'heavy rain', id: 'rain-return-levels.returnPeriods', value: RL.returnPeriods, unit: 'years (return period of the wettest 1 / 3 / 6 / 24 h of the year, per tehsil, catchment and district)', status: RL.served ? 'tested' : 'screening',
    source: (RL.source || '') + '; ' + (RL.method || '') + '; held-out years 2014-2025, 24 h exceedance ' + hold + '; 1-6 h are area rain (their gauge factor failed)', where: 'data/rain-return-levels.json (hazsci.mjs dayRarity / rainLevels, catchment.mjs heavyRain)', note: RL.version || null });
  if (f.byZone) add({ hazard: 'heavy rain', id: 'rain-return-levels.pointFactor24h', value: Object.fromEntries(Object.entries(f.byZone).map(([z, v]) => [z, { T2: Math.round(v.T2 * 1000) / 1000, T5: Math.round(v.T5 * 1000) / 1000, T10: Math.round(v.T10 * 1000) / 1000, gauges: v.gauges }])), unit: 'point / 0.1 deg area ratio of the 24-h return level',
    status: f.test && f.test.passed ? 'tested' : 'screening', source: 'leave-one-gauge-out test on ' + ((f.test && f.test.T2 && f.test.T2.gauges) || '?') + ' daily gauges (GHCN-Daily / GSOD): median error at T2 ' + (f.test && f.test.T2 ? Math.round(f.test.T2.medianEraw * 100) / 100 + ' -> ' + Math.round(f.test.T2.medianEcor * 100) / 100 : '?') + '; ' + (f.appliesTo || ''), where: 'data/rain-return-levels.json pointFactor24h (the 24-h pointRl)' }); } }
add({ hazard: 'heavy rain', id: 'hazsci.RAIN_SHARE', value: HZ.RAIN_SHARE, unit: '% of valid ensemble members', status: 'screening', source: 'screening: pre-set decision (more likely than not), carried from rainChance.levels; scored on IMERG 17 Sep - 22 Oct 2026: no skill at any class (model-gate rain-classes)', where: 'server/api/hazsci.mjs' });
/* v91.17.283.24 · heavy-rain method d (data/rain-prob-coefs-ifsdet.json): the cut of each class per lead; only a class whose gate passed in a zone is tested */
const RD = J('rain-prob-coefs-ifsdet.json');
if (RD && RD.cutsByLead) for (const [cls, byLead] of Object.entries(RD.cutsByLead)) { const zs = [...new Set(Object.entries(RD.gate || {}).filter(([k, g]) => k.startsWith(cls + '|') && g && g.tested).flatMap(([, g]) => Object.entries(g.zones || {}).filter(([, v]) => v).map(([z]) => z)))];
  add({ hazard: 'heavy rain', id: 'rainprob.ifsdet.cut.' + cls, value: byLead, unit: 'probability (per lead day)', status: zs.length ? 'tested' : 'screening',
    source: zs.length ? 'station event test: calibrated chance of >= ' + cls + ' mm from the IFS deterministic 00 UTC day total, cut maximising ETS on 2023-2025, held-out 2026 BSS and ETS lower 90 % bounds > 0; ' + (RD.test || '') : 'screening: the station event test failed for this class (' + (RD.test || 'no test') + '); never sets a level',
    where: 'data/rain-prob-coefs-ifsdet.json cutsByLead (rainprob.mjs cutOf / detLevel)', note: zs.length ? 'tested in: ' + zs.join(', ') + '; Normal under the cut, Low or heavier at or above it (serving rule: ' + ((RD.servingRule || {}).approved || '') + ')' : 'never sets a level' }); }
add({ hazard: 'landslide', id: 'hazsci.ODDS_EDGES', value: HZ.ODDS_EDGES, unit: 'odds ratio vs an ordinary day', status: 'tested', source: 'the odds bands of the model held-out validation (leave-one-year-out, ' + (((J('landslide-odds-model.json') || {}).validation || {}).served ? 'validation.served.calibration' : 'validation') + ', data/landslide-odds-model.json)', where: 'server/api/hazsci.mjs' });
add({ hazard: 'drought', id: 'hazsci.USDM_SPI', value: HZ.USDM_SPI, unit: 'SPI-3', status: 'published', source: 'US Drought Monitor SPI categories D0-D3 (Svoboda et al. 2002, BAMS 83:1181; NDMC); SPI: McKee et al. 1993, WMO-No. 1090 (2012)', where: 'server/api/hazsci.mjs' });
add({ hazard: 'sponge', id: 'hazsci.AMC_MM', value: HZ.AMC_MM, unit: 'mm, 5-day antecedent rain', status: 'published', source: 'USDA NRCS NEH Part 630 / NEH-4 antecedent moisture condition, growing season (< 36 mm dry, > 53 mm wet)', where: 'server/api/hazsci.mjs' });
const V2 = J('sponge-tehsil.v2.json'); if (V2) add({ hazard: 'sponge', id: 'sponge-tehsil.v2.edgesCN', value: V2.edgesCN, unit: 'equivalent curve number', status: 'screening', source: 'screening (documented house rule): midpoints between the NRCS group-C reference covers (sealed 98, bare 91, crops 85, grass 79, woodland 70); the curve numbers themselves are published (USDA NRCS TR-55)', where: 'data/sponge-tehsil.v2.json' });
add({ hazard: 'flood (river)', id: 'hand.HAND_FLOOR_FULL', value: { floor: HAND_FLOOR, fullShare: HAND_FULL }, status: 'screening', source: 'screening constants (hand.mjs: not calibrated); the band weights are tested (2010 and 2014 extents, 2025 held out, Spearman 0.45)', where: 'server/api/hand.mjs' });
add({ hazard: 'flood (river)', id: 'river-link.halfModelCell', value: ((J('river-link.json') || {}).tolerance || {}).halfModelCellDeg ?? null, unit: 'deg', status: 'published', source: 'half of the 0.05 deg river-model (GloFAS v4) cell the level comes from: a resolution, not a tuned value', where: 'data/river-link.json' });
add({ hazard: 'river gauges', id: 'rivercal.GAUGE_STALE_DAYS', value: GAUGE_STALE_DAYS, unit: 'days', status: 'screening', source: 'screening: house rule (a gauge older than 2 days is not current), carried from the sheet rule', where: 'server/api/rivercal.mjs' });
add({ hazard: 'air quality', id: 'smog.AQI_PM25', value: AQI_PM25_TABLE(), unit: 'ug/m3 -> AQI', status: 'published', source: 'US EPA PM2.5 AQI breakpoints, 2024 revision (EPA-454/B-24-002); NowCast (EPA 2013 / TAD 2024)', where: 'server/api/smog.mjs' });
/* 4 · parameter files */
const RLS = J('river-level-scale.json'); if (RLS) for (const [x, y] of RLS.knots) add({ hazard: 'flood (river)', id: 'river-level-scale.' + x, value: y, unit: 'ladder position (0-1)', status: /rp20/.test(x) ? 'screening' : 'tested', source: /rp20/.test(x) ? 'screening: untested (no 20-year days in the record; river-level-scale.json levels)' : 'tested rung by rung against the flood bulletins Jun-Oct 2024 and 2025 (river-level-scale.json why)', where: 'data/river-level-scale.json' });
const AP = J('hazard-applicability.json'); const LP = AP && AP.layers && AP.layers.landslide && AP.layers.landslide.params;
if (LP) for (const [k, v] of Object.entries(LP)) add({ hazard: 'landslide', id: 'hazard-applicability.landslide.' + k, value: v.value, unit: v.unit, status: statusOf(v.status), source: statusOf(v.status) === 'screening' ? 'screening: ' + (v.method || '') : (v.source || v.method || ''), where: 'data/hazard-applicability.json' });
const DC = J('drought-class.json'); if (DC && DC.categories) for (const [k, v] of Object.entries(DC.categories)) add({ hazard: 'drought', id: 'drought-class.' + k, value: { indexAtMost: v.indexAtMost, soilPercentileAtMost: v.soilPercentileAtMost }, status: 'published', source: 'US Drought Monitor (' + v.usdm + ')', where: 'data/drought-class.json (server drought class; the issued level reads hazsci.USDM_SPI)' });
const UT = J('utci.json'); if (UT) add({ hazard: 'heat / cold', id: 'utci.classes', value: UT.classes || UT.stressClasses || null, unit: 'deg C UTCI', status: 'published', source: 'UTCI stress classes (Blazejczyk et al. 2013; Broede et al. 2012)', where: 'data/utci.json' });
/* v91.17.283.20 · item B4 · the level of each UTCI class, the rule every heat and cold level is issued by (server/api/pointstate.mjs
   LEVEL_OF_CLASS), with each level's UTCI band taken from the classes above: the pages draw every heat / cold legend from this row
   (GET /api/registry/levels). Words: the five level words of the hazard scale; a class with no level is "None" (shown as Normal). */
if (UT) { const C = (UT.classes || UT.stressClasses || []).map(([u, n]) => [u == null ? null : u, n]); const lo = (i) => (i > 0 ? C[i - 1][0] : null);
  const L = { words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], heat: {}, cold: {}, none: {}, unused: 'not used on the UTCI scale',
    validRange: { airC: [-50, 50], tmrtMinusAirC: [-30, 70], wind10Ms: [0.5, 17], rhPct: [0, 100], vapourKpaMax: 5 }, outside: 'not assessed (outside the valid range of the UTCI polynomial)' };
  /* class i covers [bound of class i-1, its own bound): range [lower, upper], null = open */
  /* v91.17.283.32 · hotfix · the Low band of each side (owner 29 Oct: UTCI moderate heat stress 26-32 and moderate cold stress 0 to -13 are
     Low, worded mild heat / cold stress, never an alert; utcilevel.mjs heatCellOf / coldCellOf issue them): the legend shows a Low row */
  const LOW_OF_CLASS = { 'Moderate heat stress': ['heat', 'Low', 'mild heat stress'], 'Moderate cold stress': ['cold', 'Low', 'mild cold stress'] };
  C.forEach(([up, name], i) => { const m = LEVEL_OF_CLASS[name] || LOW_OF_CLASS[name]; if (!m) return; L[m[0]][m[1]] = { cls: name, range: [lo(i), up], ...(m[2] ? { words: m[2] } : {}) }; });
  const hMin = Math.min(...Object.values(L.heat).map((b) => b.range[0])), cMax = Math.max(...Object.values(L.cold).map((b) => b.range[1]));
  L.none = { heat: 'UTCI under ' + hMin + ' \u00b0C (no heat stress)', cold: 'UTCI ' + (cMax < 0 ? '\u2212' + Math.abs(cMax) : cMax) + ' \u00b0C or above (no cold stress)' };
  add({ hazard: 'heat / cold', id: 'utci.levels', value: L, unit: 'deg C UTCI', status: statusOf(UT.agnMapping && UT.agnMapping.class), source: 'the level of each UTCI stress class (Blazejczyk et al. 2013): a level only from strong stress (server/api/pointstate.mjs LEVEL_OF_CLASS); ' + (UT.agnMapping && UT.agnMapping.class ? 'class ' + UT.agnMapping.class : 'house convention'), where: 'server/api/pointstate.mjs' }); }
/* v91.17.283.20 · item A8 · the point of a point state, recorded: since v283.19 a point state (and the tehsil area heat over its anchor
   points) is computed at the exact point asked (5 decimals, ~1 m; cache key 4 decimals), no longer at the 0.01 deg cell (~1.1 km): the
   forecast height of a tehsil anchor is the height of the exact anchor point. Not a level cut: a design rule, recorded here. */
add({ hazard: 'heat', id: 'pointstate.pointPrecision', value: { pointDecimals: 5, cacheKeyDecimals: 4, areaHeatAnchor: 'exact anchor point' }, unit: 'decimal degrees', status: 'screening', source: 'design (v91.17.283.19, kept in v91.17.283.20): the point state and the area heat anchors are computed at the exact point, not the 0.01 deg cell; the real-data check plan is in STATUS_V283_20', where: 'server/api/pointstate.mjs, server/api/areaheat.mjs' });
/* v91.17.283.22 · item 6 · THE CLASSES OF EACH MAP HAZARD AND WHERE ITS ALERTS START, from the rules that issue its levels (never typed on a
   page): every legend and colour bar of the pages shows only these classes (GET /api/registry/levels), and one line says where alerts start.
   classes: the level words the layer's own rule can issue (the five words of the hazard scale, Normal excluded): heat / cold from
   pointstate.mjs LEVEL_OF_CLASS (a level only from strong stress: no Low), GLOF from the class-to-level table (hazard-scale.json glofLadder),
   heavy rain from the 24-h rain classes (data/hazard-scale.json rainClasses24h, India Meteorological Department categories, one level per class), landslide from the odds bands (ODDS_EDGES),
   drought from the USDM SPI categories (USDM_SPI), flood and wind from the house cuts of the one 0-100 scale (hazard-scale.json
   screeningCuts). alertsFrom: the lowest of those classes the model gate lets alert (model-gate.resolved.json: the entry's resolved
   alertLevels when it lists them, else every class when the entry can alert, else none). */
{ const WORDS5 = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
  const G = J('model-gate.resolved.json') || J('model-gate.json');
  const cutsWords = (n) => WORDS5.slice(1, 1 + n);
  const heatCold = (k) => WORDS5.filter((w) => w === 'Low' || Object.values(LEVEL_OF_CLASS).some((m) => m[0] === k && m[1] === w));   /* v91.17.283.32 · Low issued since v283.31 (utci.heatLevels / coldLevels) */
  const glofWords = HS && HS.glofLadder ? WORDS5.slice(1).filter((w) => Object.values(HS.glofLadder).includes(w)) : [];
  const houseCuts = ((HS && HS.screeningCuts) || []).filter((c) => c.level !== 'Normal').map((c) => c.level);
  const LAYERS = [
    ['heat', heatCold('heat'), 'pointstate.mjs LEVEL_OF_CLASS (UTCI stress classes, Blazejczyk et al. 2013)', 'published'],
    ['cold', heatCold('cold'), 'pointstate.mjs LEVEL_OF_CLASS (UTCI stress classes, Blazejczyk et al. 2013)', 'published'],
    ['rain_hz', cutsWords(HZ.RAIN_CLASSES.length), 'hazard-scale.rainClasses24h (' + ((HS && HS.rainClasses24h && HS.rainClasses24h.source) || '24-hour rain classes') + ')', 'published'],
    ['flood', WORDS5.slice(1).filter((w) => houseCuts.includes(w)), 'hazard-scale.json screeningCuts (house cuts of the 0-100 scale)', 'screening'],
    ['wind', WORDS5.slice(1).filter((w) => houseCuts.includes(w)), 'hazard-scale.json screeningCuts (house cuts of the 0-100 scale)', 'screening'],
    ['landslide', cutsWords(HZ.ODDS_EDGES.length), 'hazsci.ODDS_EDGES (odds bands of the held-out validation)', 'tested'],
    ['glof', glofWords, 'hazard-scale.json glofLadder (class-to-level table)', 'screening'],
    ['drought', cutsWords(HZ.USDM_SPI.length), 'hazsci.USDM_SPI (US Drought Monitor SPI categories)', 'published']];
  for (const [layer, classes, from, st] of LAYERS) {
    const e = G && Array.isArray(G.entries) ? G.entries.find((x) => (x.layers || []).includes(layer)) : null, r = e && e.resolved;
    const can = (Array.isArray(r && r.alertLevels) ? classes.filter((w) => r.alertLevels.includes(w)) : (r && r.canAlert ? classes.slice() : [])).filter((w) => !((layer === 'heat' || layer === 'cold') && w === 'Low'));   /* v91.17.283.32 · a heat / cold Low never alerts */
    add({ hazard: layer, id: 'legend.' + layer, value: { classes, alertsFrom: can.length ? can[0] : null, alertClasses: can, gateEntry: e ? e.id : null, gateStatus: r ? r.status : null },
      status: st, source: 'classes: ' + from + '; alerts: ' + (e ? 'model gate entry ' + e.id + ' (' + (Array.isArray(r && r.alertLevels) ? 'alert levels ' + (r.alertLevels.join(', ') || 'none') : r && r.canAlert ? 'can alert' : 'display only: ' + ((r && r.why && r.why[0]) || 'no alert')) + ')' : 'no model gate entry'),
      where: 'GET /api/registry/levels (layers), every map legend and colour bar' }); } }
/* v91.17.283.31 · science lane · method d by zone (data/rain-prob-coefs-ifsdet-zones.json) and the mountain rain amount mapping
   (data/rain-amount-qm-mountain.json): every cell that passed its leave-one-year-out station test, with its cut and skill */
{ const ZC = J('rain-prob-coefs-ifsdet-zones.json');
  if (ZC && ZC.cells) for (const [k, c] of Object.entries(ZC.cells)) { const [cls, lead, zone] = k.split('|');
    add({ hazard: 'heavy rain', id: 'rainprob.ifsdet.zone.' + k, value: { cut: c.cut, w: [c.w0, c.w1, c.w2], clamp: [c.lo1, c.hi1], skill: c.skill ? { bss: c.skill.bss, bssLower95: c.skill.bssLower95, pod: c.skill.pod, far: c.skill.far, events: c.skill.events } : null }, unit: 'probability',
      status: c.skill && c.skill.pass ? 'tested' : 'screening', source: 'data/rain-prob-coefs-ifsdet-zones.json (' + (ZC.version || '?') + '): leave-one-year-out 2023-2026 station test; ' + ((ZC.source && ZC.source.rules) || ''),
      where: 'hazsci.mjs detCell / zoneProb (rain_hz, siteLevels rain)', note: 'class ' + cls + ' mm, lead ' + lead + ', ' + zone + ': a low-skill warning, never an alert' }); }
  const QM = J('rain-amount-qm-mountain.json');
  if (QM && QM.tables) add({ hazard: 'heavy rain', id: 'rainamount.qm.mountain', value: { tables: Object.keys(QM.tables), applies: QM.applies || 'mountain zone' }, unit: 'mm per PKT day',
      status: 'tested', source: 'data/rain-amount-qm-mountain.json (' + (QM.version || '?') + '): held-out MAE 2.43 -> 1.02 mm (lead 1) in the mountains; plains / coast / hills keep the raw amount', where: 'rainamount.mjs shownRainMm (placeRecord days, rain_amount layer)' }); }
/* v91.17.283.31 · owner 2.1 · THE COLD LEVELS OF A UTCI, NO GAP (utcilevel.mjs coldCellOf reads this row): Low from the first UTCI cold
   stress class below 0 C, then one level per published class; owner 2.2 · the populated-area share of the tehsil heat and cold level */
/* v91.17.283.31 · owner (29 Oct) · THE HEAT SIDE MIRRORS THE COLD ONE (utcilevel.mjs heatCellOf reads this row): UTCI 26-32 (moderate heat
   stress) is Low, worded "mild heat stress"; a Low is a condition, never a hazard or an alert */
add({ hazard: 'heat', id: 'utci.heatLevels', value: { bandsC: [[26, 32, 'Low'], [32, 38, 'Moderate'], [38, 46, 'High'], [46, null, 'Severe']], normalBelowC: 26, lowWords: 'mild heat stress', alerts: 'Low never raises an alert',
    rule: 'UTCI in shade, the warmer end exclusive: u < 26 Normal; 26 <= u < 32 Low; 32 <= u < 38 Moderate; 38 <= u < 46 High; u >= 46 Severe' }, unit: 'deg C UTCI',
  status: 'published', source: 'UTCI heat stress classes (Blazejczyk et al. 2013: moderate 26 to 32, strong 32 to 38, very strong 38 to 46, extreme 46 and above), one level each; owner (29 Oct 2026): the heat side mirrors utci.coldLevels, no gap between Normal and Moderate',
  where: 'utcilevel.mjs heatCellOf (place record, site levels, the tehsil heat area level)' });
add({ hazard: 'cold', id: 'utci.coldLevels', value: { bandsC: [[0, -13, 'Low'], [-13, -27, 'Moderate'], [-27, -40, 'High'], [-40, null, 'Severe']], normalFromC: 0, lowWords: 'mild cold stress', alerts: 'Low never raises an alert',
    rule: 'UTCI in shade, the colder end exclusive: u >= 0 Normal; -13 <= u < 0 Low; -27 <= u < -13 Moderate; -40 <= u < -27 High; u < -40 Severe' }, unit: 'deg C UTCI',
  status: 'published', source: 'UTCI cold stress classes (Blazejczyk et al. 2013: moderate 0 to -13, strong -13 to -27, very strong -27 to -40, extreme below -40), one level each; owner 2.1 (29 Oct 2026): no gap between Normal and Moderate',
  where: 'utcilevel.mjs coldCellOf (place record, site levels, the tehsil cold area level)' });
{ const PC = J('tehsil-popcells.json'); if (PC && PC.rule) add({ hazard: 'heat / cold', id: 'areaheat.populatedShare', value: { share: PC.rule.share, minPop: PC.rule.minPop, maxExtra: PC.rule.maxExtra }, unit: 'share of population',
    status: 'expert', source: PC.rule.source, where: 'areaheat.mjs aggregate (tehsil heat and cold level), data/tehsil-popcells.json', note: PC.rule.text }); }
/* v91.17.283.22 · item 8 · THE ONE LABEL OF THE CHANCE OF RAIN: the chance of rain (the day chance and the 3-hour window chance) is a
   SCREENING value until the rain-chance reliability re-test passes (the re-test of LEARN_ALL rainprob found no pairs on 25 Oct 2026; the
   3-hour window share applies the hourly threshold tau to a 3-hour sum and has never been tested against observed rain) */
{ const RCT = J('rain-chance-retest.json');
  const passed = !!(RCT && RCT.passed === true);
  const GE = (J('model-gate.json') || {}).entries || [], gateEntries = GE.filter((e) => (e.layers || []).some((l) => /^rc:/.test(String(l)))).map((e) => e.id);
  add({ hazard: 'heavy rain', id: 'rainChance.label', value: { label: passed ? 'tested' : 'screening', windows: passed ? 'tested' : 'screening', productType: passed ? null : 'Chance of rain (screening)', gateEntries, retest: RCT ? { passed, at: RCT.at || null, why: RCT.why || null } : null },
    status: passed ? 'tested' : 'screening', source: passed ? 'data/rain-chance-retest.json: the reliability re-test passed' : 'screening: no passed reliability re-test of the chance of rain (data/rain-chance-retest.json absent or not passed; LEARN_ALL rainprob 25 Oct 2026: no pairs)',
    where: 'GET /api/registry/levels (rainChance), every chance-of-rain label of the pages' }); }
/* v91.17.283.33 · Scenario Lab flood outcome: the model file and its sha256 (display only, never an alert, never in the live forecast or the map) */
{ const FO = J('flood-outcome-model.json'); if (FO) { let sha = null; try { sha = createHash('sha256').update(readFileSync(join(ROOT, 'data', 'flood-outcome-model.json'))).digest('hex'); } catch (_) {}
  add({ hazard: 'flood (local rain)', id: 'floodOutcome.model', value: { file: 'data/flood-outcome-model.json', sha256: sha, version: FO.version, model: FO.model, pass: FO.pass, trainedRainMm: { mountain: FO.validRange.mountain.R24, plains: FO.validRange.plains.R24 },
      covered: (FO.districts || []).filter((d) => d.covered).length, notCovered: (FO.districts || []).filter((d) => !d.covered).map((d) => d.district) }, unit: 'probability of local flooding reported in the district on the day',
    status: 'tested', source: 'leave-one-year-out 2022-2026 against the national disaster situation reports (plan locked before scoring, sha256 ' + FO.plan + '): Brier skill mountain 0.015 [0.004, 0.024], plains 0.013 [0.006, 0.018], 4 of 5 years positive, reliable',
    where: 'floodoutcome.mjs (GET /api/scenario floodOutcome): Scenario Lab only, display only' }); } }
/* 5 · gate entries whose class is expert / heuristic in their own words are listed by the FR rows above; the gate's product type is noted */
const counts = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
const body = { what: 'NIGRAAN thresholds register: every level cut in use, with its source or test, or screening', generatedBy: 'scripts/v28313/gen_thresholds_register.mjs', rule: 'published = a cited published scale; tested = measured / held-out / anchored with its evidence; screening = expert, heuristic, design or house values (shown as screening, never as a tested level); superseded = not used for a level', counts, rows };
const inputs = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const out = JSON.stringify({ ...body, rowsSha256: inputs }, null, 1) + '\n';
const file = join(ROOT, 'data', 'thresholds-register.json');
if (process.argv.includes('--check')) { let cur = null; try { cur = JSON.parse(readFileSync(file, 'utf8')); } catch (_) {} if (!cur || cur.rowsSha256 !== inputs) { console.log('FAIL thresholds-register.json is out of date (regenerate)'); process.exit(1); } console.log('PASS thresholds register current (' + rows.length + ' rows)'); process.exit(0); }
writeFileSync(file, out); console.log('thresholds register:', rows.length, 'rows', JSON.stringify(counts));
