/* v91.17.283.10 SP · SPONGE (curve-number ground sponge), tehsil LCZ path, and the soil-moisture / upper-air source pins.
   node scripts/tests28310/sponge/sponge.test.mjs [landcover-2025-tehsil.json]   exit 0 = PASS
   S1  every LCZ 1-3 dominated tehsil: sealed share >= bf x (bsf + isf) (roofs AND paving), <= 1
   S2  no compact-city (LCZ 1-3) tehsil carries crop cover inside its built share: crops <= the non-built, non-tree share, and the
       pervious part of the built cells is the LCZ class cover (Stewart & Oke 2012: LCZ 1-3, 7, 8, 10 bare; 4-6, 9 grass)
   S3  fractions of every observed tehsil sum to 1; the tree share sits in the non-built share only
   S4  the 23 no_built_area tehsils: built 0; with the WorldCover tehsil file given, each has a 10 m built share under 1 %
   S5  the module in server/science equals the page script it was taken from (no drift) and NSS selfTest passes
   P1  one soil-moisture depth per use: the national sweep writes the 7-28 cm layer into soilMoist (never the 0-1/1-3 cm mean), keeps the
       forecast model's root zone out of smRoot (ERA5 drought root zone), and the FAO-56 cross-source ratio is out of both drought composites
   P2  the wetness job names its model (ecmwf_ifs), the smog job no longer asks the 925 hPa level and withholds the inversion step
   P3  850 hPa values are masked where the level is at or below the surface pressure (station card, selected-district row, 72 h series) */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { pageBlocks, readManifest, sha1 } from '../../../server/science/loader.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WC = process.argv[2] || '/mnt/user-data/uploads/NIGRAAN/nig/nigraan-local/data/landcover-2025-tehsil.json';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const MOD = (f) => readFileSync(join(ROOT, 'server', 'science', 'modules', f), 'utf8');

/* ---- the NSS module standalone: G.AGN.lcz from data/lcz-grid.json, tehsil key = uid ---- */
const grid = JSON.parse(readFileSync(join(ROOT, 'data', 'lcz-grid.json'), 'utf8')).tehsils;
const G = { console, AGN: {} };
G.window = G; G.document = { getElementById: () => null };
G.PK_DISTRICTS = { features: Object.keys(grid).map((u) => ({ properties: { key: u, uid: u } })) };
G.AGN.lcz = { byUid: (u) => (grid[u] ? Object.assign({ uid: u }, grid[u]) : null), tehsil: () => null };
vm.createContext(G); vm.runInContext(MOD('030-agn-nss.js'), G, { filename: '030-agn-nss.js' });
const N = G.AGN.nss; ok(N && N.coverFor, 'AGN.nss loads standalone');
ok(N.selfTest().passed, 'NSS selfTest: ' + JSON.stringify(N.selfTest().failures));

const PERV = { 1: 'bare', 2: 'bare', 3: 'bare', 4: 'grass', 5: 'grass', 6: 'grass', 7: 'bare', 8: 'bare', 9: 'grass', 10: 'bare' };
let n13 = 0, nObs = 0, nNB = 0;
for (const [u, r] of Object.entries(grid)) {
  for (const zone of ['irrigated_plains', 'arid_plains', 'highland']) {
    const c = N.coverFor(u, null, zone); if (!c.ok) { ok(r.status === 'no_lcz_coverage', u + ': no cover with status ' + r.status); continue; }
    const f = c.fractions, sum = Object.values(f).reduce((a, b) => a + b, 0);
    if (r.status === 'no_built_area') { if (zone === 'irrigated_plains') nNB++; ok(f.built === 0, u + ' no_built_area: built 0'); ok(Math.abs(sum - 1) < 1e-9, u + ' sums to 1'); continue; }
    if (zone === 'irrigated_plains') nObs++;
    const bf = Math.min(1, r.bf || 0), want = bf * Math.min(1, (r.bsf || 0) + (r.isf || 0));
    ok(Math.abs(sum - 1) < 1e-9, `S3 ${u} (${zone}) fractions sum ${sum}`);
    ok((f.trees || 0) <= 1 - bf + 1e-12, `S3 ${u} tree share inside the non-built share`);
    if ([1, 2, 3].includes(r.lcz)) {
      if (zone === 'irrigated_plains') n13++;
      ok(f.built >= want - 1e-12 && f.built <= 1 + 1e-12, `S1 ${u}: sealed ${f.built.toFixed(4)} >= bf(bsf+isf) ${want.toFixed(4)}`);
      ok((f.crops || 0) <= Math.max(0, 1 - bf - (f.trees || 0)) + 1e-12, `S2 ${u} (${zone}): crops ${(f.crops || 0).toFixed(4)} inside the built share`);
      ok(c.urbanPerviousClass === PERV[r.lcz], `S2 ${u}: urban pervious class ${c.urbanPerviousClass} (S&O LCZ ${r.lcz} -> ${PERV[r.lcz]})`);
      if (bf >= 0.999) ok((f.crops || 0) <= 1 - bf + 1e-12, `S2 ${u}: an all-built tehsil has no crop cover beyond its unbuilt ${(1 - bf).toFixed(4)}`);
    }
  }
}
ok(n13 >= 20, 'S1/S2 ran on ' + n13 + ' LCZ 1-3 tehsils (22 expected)');
ok(nNB === 23, 'S4 ' + nNB + ' no_built_area tehsils (23 expected)');
console.log(`  LCZ 1-3 tehsils ${n13}, observed ${nObs}, no_built_area ${nNB}`);
/* the two named in the defect */
const gul = N.coverFor('Sindh|Central Karachi|Gulberg Town', null, 'arid_plains').fractions, lah = N.coverFor('Punjab|Lahore|Lahore City', null, 'irrigated_plains').fractions;
ok(gul.built > 0.85, 'Gulberg Town sealed ' + gul.built.toFixed(3) + ' (was 0.423)');
ok(lah.built > 0.25, 'Lahore City sealed ' + lah.built.toFixed(3) + ' (was 0.118)');

if (existsSync(WC)) {
  const w = JSON.parse(readFileSync(WC, 'utf8')).units;
  for (const [u, r] of Object.entries(grid)) if (r.status === 'no_built_area') { const x = w[u]; ok(x && x.worldcoverBuilt10m != null && x.worldcoverBuilt10m < 0.01, `S4 ${u}: WorldCover 10 m built ${x && x.worldcoverBuilt10m} < 1 %`); }
} else console.log('  S4 WorldCover check skipped (file not here): ' + WC);

/* ---- S5 drift: modules = page scripts ---- */
const M = readManifest(), { blocks } = pageBlocks(); const hs = new Set(blocks.map((b) => sha1(b.code)));
for (const m of M.modules.filter((m) => /^0(29|30|31|33|34|36|48)-|^025-|^098-/.test(m.file))) {
  ok(sha1(MOD(m.file)) === m.sha1, 'S5 ' + m.file + ' matches its manifest hash'); ok(hs.has(m.from.sha1), 'S5 ' + m.file + ' is in the served page');
}

/* ---- P1 soil moisture: one depth per use ---- */
const m31 = MOD('031-page-script-55.js'), m29 = MOD('029-agn-wetness.js');
ok(/soilSurface:sm, soilMoist:\(\(typeof r1!=='undefined'/.test(m31), 'P1 sweep: soilMoist = the 7-28 cm layer, the 0-7 cm mean kept as soilSurface');
ok(!/row\.soilMoist=reading\.soilMoist; if\(reading\.smRoot!=null\) row\.smRoot=reading\.smRoot/.test(m31), 'P1 sweep: no forecast-model root zone written into smRoot');
ok(/row\.smRootFc=reading\.smRootFc/.test(m31), 'P1 sweep: forecast-model root zone kept as smRootFc');
ok(/const fao = null;/.test(m31) && !/if\(fao!=null\) parts\.push\(\['fao56'/.test(m31), 'P1 drought: FAO-56 cross-source ratio withheld from both composites');
ok(/var _soilS=_smStress;/.test(m31), 'P1 drought fallback cap: the ERA5 percentile term');
ok(!/surface soil moisture/.test(m29) && !/soilMoist: 'surface soil moisture'/.test(m31), 'P1 labels: soilMoist is not called surface');
for (const f of ['033-mach-openmeteo-wiring.js', '034-mach-fast-audit-script.js', '036-mach-district-forecast-repair.js'])
  ok(!/soil_moisture_0_to_1cm|soil_moisture_1_to_3cm/.test(MOD(f)), 'P1 ' + f + ': only the 7-28 cm layer reaches soilMoist');
/* ---- P2 server sources ---- */
const wet = readFileSync(join(ROOT, 'server', 'api', 'wetness.mjs'), 'utf8'), smog = readFileSync(join(ROOT, 'server', 'api', 'smog.mjs'), 'utf8');
ok(/timezone: 'UTC', models: 'ecmwf_ifs' \}/.test(wet), 'P2 wetness job names ecmwf_ifs (its range was built on the same series)');
ok(!/'temperature_925hPa', 'visibility'/.test(smog), 'P2 smog: the best_match call no longer asks the 925 hPa level (ICON) beside its 2 m (IFS)');
ok(/models: 'icon_global', hourly: \['temperature_2m', 'temperature_925hPa', 'surface_pressure'\]/.test(smog) && /elevation: pb\.map\(\(\) => 'nan'\)/.test(smog), 'P2 smog: inversion pair from one ICON column at the model ground (Part 2)');
ok(/u\.elevM != null && u\.elevM < 500\);\n/.test(smog) && /!\(isp != null && isp <= 925\)/.test(smog), 'P2 smog: ICON call for plains units only; 925 hPa masked where it is under the model ground');
ok(/if \(plains && hr >= 4 && hr <= 10 && invOk\) \{ d\.invN = \(d\.invN \|\| 0\) \+ 1; if \(it925 - it2 >= 0\) d\.inv\+\+; \}/.test(smog), 'P2 smog: the inversion test reads only the ICON pair (never the mixed one)');
/* ---- P3 below-ground mask, behaviour ---- */
const m36 = MOD('036-mach-district-forecast-repair.js');
const rec = m36.match(/function recordForecast\(resp\)\{[\s\S]*?\n  \}\n/), nix = m36.match(/function nearestIndex\(times,currentTime\)\{[\s\S]*?\n  \}\n/); ok(!!rec && !!nix, 'P3 recordForecast found');
if (rec && nix) {
  const fn = new Function(nix[0] + rec[0] + '; return recordForecast;')();
  const r = fn({ current: { time: 't1' }, hourly: { time: ['t0', 't1', 't2'], surface_pressure: [790, 905, 851], temperature_850hPa: [12, 14, 15], wind_speed_850hPa: [20, 21, 22] } });
  ok(r.t850[0] === null && r.t850[1] === 14 && r.t850[2] === 15 && r.wind850[0] === null, 'P3 72 h series: 850 hPa null where surface pressure <= 850 (got ' + JSON.stringify(r.t850) + ')');
}
const m33 = MOD('033-mach-openmeteo-wiring.js');
ok(/\(sp!=null&&sp<=850\)\?null:n\(hourlyValue\(resp,'temperature_850hPa'\)\)/.test(m33) && /ICON global 13 km/.test(m33), 'P3 station card: masked below ground, source named ICON');
ok(/surface_pressure,weather_code'/.test(MOD('034-mach-fast-audit-script.js')) && /n\(c\.surface_pressure\)<=850\)\?null:n\(h\.temperature_850hPa/.test(MOD('034-mach-fast-audit-script.js')), 'P3 selected-district row: surface pressure asked, 850 hPa masked');

console.log(`SPONGE-28310 ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
