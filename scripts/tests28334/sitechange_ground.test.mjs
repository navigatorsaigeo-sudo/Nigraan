/* v91.17.283.34 · Scenario Lab B on real ground data (no server; the module with a small app of the tehsil polygons):
     G1  a drawn 2 ha site in Islamabad: cover shares of the cells under it (sum 1), slope %, soil groups of the tehsil, the 2/10/25-year
         design rain of the tehsil = data/rain-return-levels.json (24 h point for volume, 1/3/6/24 h area for peak)
     G2  the result = the TR-55 reference (nrcsRunoffCalc) on those inputs (v283.36: weighted CN, CN 98 built, no slope factor)
     G3  more built raises runoff volume at every return period; peak, storage and pond are withheld (v283.36)
     G4  90 ha is answered (no area cut-off, v283.36); green roof / permeable paving not modelled; a built share over 100 % refused
     G5  the answer has the fixed labels, no code text (.mjs/.json/server/data paths), and an id + checksum that the result store returns
     G6  the vegetation index: with NIGRAAN_S2SITE=0 the answer says the reading is off (never a made-up value)
   usage: node scripts/tests28334/sitechange_ground.test.mjs [dataDir]   (default: the laptop data folder or the tree's data; the 250 m
   feature grid, sponge-tehsil.v2.json and landslide-susceptibility30.json must be installed, otherwise the test SKIPs) */
import { readFileSync, existsSync, mkdtempSync, readdirSync, symlinkSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const M = await import(join(ROOT, 'server', 'api', 'sitechange.mjs'));
const ST = await import(join(ROOT, 'server', 'api', 'scenariostore.mjs'));
let pass = 0, fail = 0, skip = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 600) : '')); } };
const cands = [process.argv[2], process.env.NIGRAAN_GROUND_DATA, 'D:\\NIGRAAN\\nig\\nigraan-local\\data', '/mnt/user-data/uploads/NIGRAAN/nig/nigraan-local/data', join(ROOT, 'data')].filter(Boolean);
const SRC = cands.find((d) => existsSync(join(d, 'feat', 't_slope.json')) && existsSync(join(d, 'feat', 's_wc_grass.json')) && existsSync(join(d, 'sponge-tehsil.v2.json')));
if (!SRC) { console.log('SKIP the 250 m feature grid (t_slope, s_wc_*) and sponge-tehsil.v2.json are not installed here'); console.log('\n0 passed, 0 failed, 1 skipped'); process.exit(0); }
/* a data folder: the tree's data, with the ground files of SRC (read only; results go to the temp folder) */
const D = mkdtempSync(join(tmpdir(), 'sc34-'));
for (const f of readdirSync(join(ROOT, 'data'))) if (!['feat', 'sponge-tehsil.v2.json', 'landslide-susceptibility30.json', 'scenario-results', 'cache'].includes(f)) symlinkSync(join(ROOT, 'data', f), join(D, f));
for (const f of ['feat', 'sponge-tehsil.v2.json', 'landslide-susceptibility30.json']) if (existsSync(join(SRC, f))) symlinkSync(join(SRC, f), join(D, f));
const tehsils = JSON.parse(readFileSync(join(D, 'pk-tehsils.json'), 'utf8')).features.map((f) => ({ unitId: f.properties.uid, name: f.properties.name }));
process.env.NIGRAAN_S2SITE = '0';
const app = { dataDir: D, units: { tehsil: tehsils } };
const S = M.createSiteChange(app, { dataDir: D, root: ROOT });
const sq = (lat, lon, m) => { const d = m / 111195, dl = d / Math.cos(lat * Math.PI / 180); return [[lat, lon], [lat, lon + dl], [lat + d, lon + dl], [lat + d, lon]]; };
const ring = sq(33.640, 73.000, 141.42);
const g0 = S.ground(ring); const B0 = g0.ok ? (g0.before.built || 0) : 0, BU = Math.min(1, Math.round((B0 + 0.4) * 100) / 100);
let r = await S.run({ ring, change: { built: BU }, pondM3: 500 });
const b = r.body; ok(r.status === 200 && b.ok, 'G1 a 2 ha site in Islamabad answered', JSON.stringify(b).slice(0, 400));
if (b.ok) {
  const I = b.inputs, sum = (o) => Object.values(o).reduce((a, x) => a + x, 0);
  ok(Math.abs(sum(I.before) - 1) < 0.005 && Math.abs(sum(I.after) - 1) < 0.005, 'G1 cover shares before and after sum to 1', JSON.stringify([I.before, I.after]));
  ok(Math.abs(I.areaHa - 2) < 0.05 && I.slopePct >= 0 && I.slopePct <= 60 && Math.abs(sum(I.hsg) - 1) < 0.005, 'G1 area 2 ha, slope ' + I.slopePct + ' %, soil groups ' + JSON.stringify(I.hsg));
  const RL = JSON.parse(readFileSync(join(D, 'rain-return-levels.json'), 'utf8')); const U = RL.units[I.tehsil]; const k = RL.returnPeriods.indexOf(10);
  ok(I.designRain['10']['24h_point'] === U['24h'].pointRl[k] && I.designRain['10']['1h'] === U['1h'].areaRl[k], 'G1 design rain = the tehsil’s return levels (24 h point ' + U['24h'].pointRl[k] + ' mm)');
  /* v283.36 items 3/26 + C-now 4: TR-55 weighted CN (impervious CN 98), no slope factor; runoff depth and volume only (peak, storage and pond withheld) */
  const ref = M.nrcsRunoffCalc(I.areaM2, I.hsg, I.before, I.after, I.designRain);
  const rel = (x, y) => Math.abs(x - y) <= 0.01 * Math.max(1, Math.abs(y));
  ok(Object.keys(ref).every((T) => rel(ref[T].after.volume_m3, b.returnPeriods[T].after.volume_m3) && rel(ref[T].before.volume_m3, b.returnPeriods[T].before.volume_m3) && rel(ref[T].after.CN, b.returnPeriods[T].after.CN)), 'G2 the result = the TR-55 reference (weighted CN, CN 98 for built, no slope factor) on the served inputs');
  ok(Object.values(b.returnPeriods).every((x) => x.after.volume_m3 > x.before.volume_m3 && x.extra_volume_m3 > 0), 'G3 built ' + Math.round(B0 * 100) + ' % -> ' + Math.round(BU * 100) + ' %: more runoff volume at every return period');
  ok(Object.values(b.returnPeriods).every((x) => x.after.peak_m3s === undefined && x.storage_needed_m3 === undefined && x.pondText === undefined) && /not given in this release/.test(b.withheld || ''), 'G3 peak flow, storage and "pond enough" are withheld, with the reason', JSON.stringify(b.returnPeriods).slice(0, 300));
  ok(b.label === M.LABEL && b.surfaceHeat.figure === null && /No temperature figure/.test(b.surfaceHeat.direction) && /not modelled/.test(b.airHeat), 'G5 fixed labels; surface heat direction only; air heat not modelled');
  const CODE = /\.mjs|\.json|server\/|data\//; const hits = []; const walk = (o, p) => { if (typeof o === 'string') { if (CODE.test(o)) hits.push(p + ': ' + o.slice(0, 100)); } else if (o && typeof o === 'object') for (const [k2, v] of Object.entries(o)) walk(v, p + '.' + k2); }; walk(b, '');
  ok(!hits.length, 'G5 no code text in the answer', hits.join(' | '));
  ok(/^sc[0-9a-f]{24}$/.test(b.id) && /^pr1-/.test(b.checksum) && ST.scenarioStore(D).get(b.id) && ST.scenarioStore(D).get(b.id).checksum === b.checksum, 'G5 kept by id with its checksum');
  ok(b.vegetation && b.vegetation.ok === false && /switched off/.test(b.vegetation.why), 'G6 the vegetation reading off: said so, no value', JSON.stringify(b.vegetation));
  ok(b.slope && b.slope.text === 'no cut or fill face given', 'G1 slope flag without a face');
  r = await S.run({ ring, change: { built: 0.5 }, faceDeg: 30 }); ok(r.body.ok && r.body.slope.flag === true, 'G1 a 30° face: flagged');
}
r = await S.run({ ring: sq(33.69, 73.05, 950), change: { built: 0.5 } }); ok(r.status === 200 && r.body.ok === true, 'G4 90 ha: answered (v283.36 item 4: no area cut-off)', JSON.stringify(r.body).slice(0, 200));
r = await S.run({ ring, change: { built: 0.8, permeable: 0.4 } }); ok(r.body.ok === false && r.body.notModelled && r.body.why === M.NOT_MODELLED_SITE, 'G4 permeable paving / green roof: not modelled (no tested curve number, v283.36 item 26)', r.body.why);
r = await S.run({ ring, change: { built: 1.4 } }); ok(r.body.ok === false, 'G4 a built share over 100 % refused', r.body.why);
r = await S.run({ ring: [[1, 2]] }); ok(r.status === 400, 'G4 no ring: refused');
try { rmSync(D, { recursive: true, force: true }); } catch (_) {}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
