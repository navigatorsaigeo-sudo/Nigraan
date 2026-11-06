// v91.17.283.5 integration - W6 page side and U1 one UTCI reading.
// W6: the served science module of the self-check (page script 228) gives river flooding level -3 ("no modelled river reach") where the
//     page's river check found no covered reach (aiDistrictRisk noDataClass 'method'); -1 stays for a feed failure and for other layers;
//     the self-check and the engine report (page script 231) count -3 with "no data", so counts / nd / coverage do not change.
// U1: the left panel tile, the place popup and the bar read one UTCI: the tehsil hottest-hour shade UTCI the heat level is scored on
//     (hzDayInput(<tehsil>,'heat').heatUtciShade); the point-curve overrides do not replace it.
// usage: node scripts/tests2835/integ.test.mjs [tree]     (no server; a URL argument from the test runner is ignored)
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const ARG = process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : null;   /* the test runner passes its server URL: not a tree */
const APP = ARG || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const MOD = join(APP, 'server', 'science', 'modules');
const file = (re) => readdirSync(MOD).find((f) => re.test(f));
const m106 = readFileSync(join(MOD, file(/^106-page-script-228\.js$/)), 'utf8');
const m107 = readFileSync(join(MOD, file(/^107-page-script-231\.js$/)), 'utf8');

/* W6 · run the module's own unitOn with a stub engine */
function unitOnWith(r, lvl) {
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const G = { AGN: { hz5: { levelOf: () => lvl } }, document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, body: el(), head: el() }, hzDayInput: () => ({ t: 20 }), aiDistrictRisk: () => r, aiState: { lead: 24 },
    setInterval: () => 0, setTimeout: () => 0, PK_DISTRICTS: { features: [] }, fetch: () => Promise.resolve({ ok: true }) };
  G.window = G; const ctx = vm.createContext(G);
  try { vm.runInContext(m106.replace(/^\(function\(\)\{/, '(function(){ var window=globalThis; ').replace(/var G=window, D=document;/, 'var G=globalThis, D=globalThis.document;'), ctx, { timeout: 5000 }); } catch (e) { if (!(G.AGN.selfcheck && G.AGN.selfcheck.unitOn)) throw e; }
  return (hz) => G.AGN.selfcheck.unitOn(hz, { key: 'K', uid: 'U' }).lv;
}
const noReach = { score: null, noData: true, noDataClass: 'method' }, feed = { score: null, noData: true, noDataClass: 'feed' };
let u = unitOnWith(noReach, { nd: true });
ok(u('flood_riverine') === -3, 'W6 river flooding, no covered reach -> -3', u('flood_riverine'));
ok(u('flood_pluvial') === -1 && u('heat') === -1, 'W6 other layers with the same answer stay -1');
u = unitOnWith(feed, { nd: true });
ok(u('flood_riverine') === -1, 'W6 river flooding, feed failure (no river sweep) stays -1 (no data)');
u = unitOnWith({ score: 40, noDataClass: null }, { i: 2 });
ok(u('flood_riverine') === 2, 'W6 a scored reach keeps its level');
u = unitOnWith(noReach, { na: true });
ok(u('flood_riverine') === -2, 'W6 outside the physical mask stays -2');
ok(/else if\(u\.lv===-1\|\|u\.lv===-3\) nd\+\+;/.test(m106) && /else if\(u\.lv===-1\|\|u\.lv===-3\) nd\+\+;/.test(m107),
  'W6 the self-check and the engine report count -3 with no data (counts, nd and coverage unchanged)');

/* the server serves -3 with its exact reason */
const served = readFileSync(join(APP, 'server', 'api', 'served.mjs'), 'utf8'), engine = readFileSync(join(APP, 'server', 'api', 'engine.mjs'), 'utf8');
ok(/'-3': 'no modelled river reach for this place/.test(served) && /lv === -3 \? \{ noRiverReach: true \}/.test(engine), 'W6 the server maps -3 to "no modelled river reach"');

/* start page: -3 drawn Not assessed, its Flood row says why */
const start = readFileSync(join(APP, 'artefact', 'NIGRAAN_START.html'), 'utf8');
ok(/v===-1\|\|v===-3\|\|v===-2/.test(start) && /return 'no modelled river reach'/.test(start), 'W6 start page draws -3 as Not assessed and names the reason');
/* v91.17.283.6: the version check follows the release (it pinned 91.17.283.5): the start page carries the tree's own package.json version, 283.5 or later */
{ const pv = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')).version, m = /content="(91\.17\.283\.(\d+))" name="agn-version"/.exec(start);
  ok(m && m[1] === pv && Number(m[2]) >= 5, 'start page agn-version = package.json (' + pv + '), 91.17.283.5 or later', m && m[1]); }

/* U1 · one UTCI */
const page = readFileSync(join(APP, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
/* v91.17.283.12: the heat tile is the point state's day at its source (data-agn-ps), and the overrides that rewrote it are removed */
ok(/data-agn-ps="'\+\(PSx\?_e\(PSx\.key\):''\)\+'" data-utci="'/.test(page) && /data-utci-src="run"/.test(page), 'U1 the tile is the point state\'s day (one value, marked as the run value)');
ok(!/function pointTiles\(/.test(page) && !/t\.getAttribute\('data-utci-src'\)!=='run'\)\{   \/\* v91\.17\.283\.5 U1/.test(page), 'U1 the point-curve and present-hour overrides of the tile are gone (v91.17.283.12)');
ok(/var u=okn\(inp\.heatUtciShade\)\?\+inp\.heatUtciShade/.test(page) && /'UTCI '\+\(Math\.round\(u\*10\)\/10\)\.toFixed\(1\)\+' °C in shade at the hottest hour'/.test(page),
  'U1 the popup reads the same input (heatUtciShade) and prints it to 0.1 °C as the tile does');
const m = /<script id="agn-v283-js">([\s\S]*?)<\/script>/.exec(page);
ok(m && /tile\.getAttribute\('data-utci'\)/.test(m[1]) && /var gov=coldGoverns\(u,C\);/.test(m[1]), 'U1 the cold / heat choice reads the tile’s (run) UTCI');
/* C12 x the v283.2 town-only fix: with C12 applied a village (Astore) is not assessed either; with C12 released it keeps its small-settlement answer */
{ const { createUrbanHeat } = await import(join(APP, 'server', 'api', 'urbanheat.mjs'));
  const D = join(APP, 'data'); const U = createUrbanHeat(null, D), R = createUrbanHeat(null, D, { nationalWithheld: false });
  const v = U.estimate(35.35, 74.86, { hoursFromSunset: 2 }), r = R.estimate(35.35, 74.86, { hoursFromSunset: 2 });
  const c12 = JSON.parse(readFileSync(join(D, 'urban-heat-c12.json'), 'utf8'));
  ok(v.withheld === true && v.assessed === false && v.why === c12.reason && !v.smallSettlement && typeof c12.lowDensityAnswers === 'string', 'C12 Astore village: not assessed under C12 (no held-out pass for the low-density statement either)');
  ok(r.smallSettlement === true && !r.withheld, 'C12 released: Astore keeps its small-settlement answer (v283.2 withholding covers town cells only)'); }
/* C12 x the MACH fleet urban term: the served layer is withheld, the fleet's measured term on the served temperature is not */
{ const { createUrbanHeat } = await import(join(APP, 'server', 'api', 'urbanheat.mjs'));
  const U = createUrbanHeat(null, join(APP, 'data')), R = createUrbanHeat(null, join(APP, 'data'), { nationalWithheld: false });
  const p = [33.6938, 73.0652];   /* Islamabad F-7, a built cell */
  const s = U.estimate(...p, { hoursFromSunset: 2 }), f = U.estimate(...p, { hoursFromSunset: 2, fleetTerm: true }), r = R.estimate(...p, { hoursFromSunset: 2 });
  ok(s.withheld === true && !s.heatIsland, 'C12 served point answer in Islamabad: withheld');
  ok(f.urban === true && JSON.stringify(f) === JSON.stringify(r), 'C12 the fleet urban term reads the cell exactly as before C12 (served temperature unchanged)', String(f.urban));
  const fh = readFileSync(join(APP, 'server', 'api', 'fleethistory.mjs'), 'utf8');
  ok((fh.match(/fleetTerm: true/g) || []).length === 2 && /uhiCheck\(true\)/.test(fh), 'C12 fleethistory: the term\u2019s three internal reads pass fleetTerm; the served check does not'); }
console.log((fail ? 'FAIL' : 'PASS') + ' v283.5 integration: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
