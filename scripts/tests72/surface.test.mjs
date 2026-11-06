#!/usr/bin/env node
/* v91.17.72 · SURFACE / WATER / LST / CLIMATOLOGY feature-grid bands (agent S).
   Reads the bands through server/api/featgrid.mjs directly (no server needed) and checks:
     1  every s_/l_/c_/w_ band written by S carries a provenance header (built, method, source, licence with url + attribution)
     2  plausibility at known places: Lahore built share high; Hunza valley walls snow/bare; Karachi close to water;
        summer day LST Jacobabad >> Murree; Lahore night LST above its 10 km surroundings; CHELSA July tmax Jacobabad >> Murree;
        irrigated Punjab greener than the Thar in JJA (Sentinel-2)
     3  point features file: 407 located points carry the core features, units sidecar covers every column
   node scripts/tests72/surface.test.mjs [dataDir]        (default nigraan-local/data) */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DATA = process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : join(ROOT, 'data');
const { createFeatGrid } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'featgrid.mjs')).href);
const fg = createFeatGrid(DATA);

let fails = 0, passes = 0;
const check = (name, ok, detail) => { if (ok) { passes++; console.log('PASS ' + name); } else { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' · ' + String(detail).slice(0, 300) : '')); } };
const v = (b, lat, lon) => fg.value(b, lat, lon);
/* mean of a band over a small box (n x n cells around the point), ignoring nulls */
const boxMean = (b, lat, lon, half = 4) => { let s = 0, n = 0; for (let i = -half; i <= half; i++) for (let j = -half; j <= half; j++) { const x = v(b, lat + i / 400, lon + j / 400); if (x != null) { s += x; n++; } } return n ? s / n : null; };
const f2 = (x) => (x == null ? 'null' : (+x).toFixed(2));

const P = {
  lahore: [31.5580, 74.3280],        // Lahore old city / Mall
  karachi: [24.8560, 67.0010],       // Karachi Saddar
  jacobabad: [28.2810, 68.4380],
  murree: [33.9070, 73.3920],
  hunzaWall: [36.3600, 74.7300],     // high ground east of Karimabad (Ultar side)
  punjabIrr: [30.9500, 73.6000],     // canal-irrigated cropland NE of Okara (WorldCover crop share 0.82 in the box)
  thar: [28.4000, 71.6000],          // Cholistan desert (Bahawalpur)
};

// 1 provenance
const mine = fg.list().filter((b) => /^(s|l|c|w)_/.test(b));
check('S bands present (>= 40)', mine.length >= 40, mine.length);
const noProv = mine.filter((b) => { const m = fg.meta(b); return !(m && m.built && m.method && m.source && m.licence && m.licence.url && m.licence.attribution && m.licence.licence); });
check('every S band has built/method/source/licence(url, attribution)', noProv.length === 0, noProv.join(','));
for (const b of ['s_wc_tree', 's_wc_crop', 's_wc_built', 's_wc_bare', 's_wc_water', 's_wc_snow', 'w_occ', 'w_dist',
  's_ndvi_djf', 's_ndvi_mam', 's_ndvi_jja', 's_ndvi_son', 's_ndmi_jja', 's_ndbi_jja',
  'l_day_jja', 'l_night_djf', 'l_day_anom_jja', 'l_night_anom_djf', 'c_tmax_01', 'c_tmax_07', 'c_tmin_01', 'c_tmin_07']) {
  check('band ' + b + ' exists', fg.meta(b) != null);
}

// 2 plausibility
const lb = boxMean('s_wc_built', ...P.lahore, 2);
check('Lahore built share high (5x5 cells >= 0.6)', lb != null && lb >= 0.6, f2(lb));
const hs = boxMean('s_wc_snow', ...P.hunzaWall, 8), hb = boxMean('s_wc_bare', ...P.hunzaWall, 8);
check('Hunza valley walls mostly snow/ice + bare (>= 0.6)', hs != null && hb != null && hs + hb >= 0.6, `snow ${f2(hs)} bare ${f2(hb)}`);
check('Hunza has snow/ice (>= 0.05)', hs != null && hs >= 0.05, f2(hs));
const kd = v('w_dist', ...P.karachi);
check('Karachi Saddar near water (w_dist <= 3 km)', kd != null && kd <= 3, f2(kd));
const td = v('w_dist', ...P.thar);
check('Cholistan desert far from water (w_dist > Karachi)', td != null && td > kd, f2(td));
const lj = v('l_day_jja', ...P.jacobabad), lm = v('l_day_jja', ...P.murree);
check('JJA day LST Jacobabad > Murree + 10 C', lj != null && lm != null && lj > lm + 10, `${f2(lj)} vs ${f2(lm)}`);
check('JJA day LST Jacobabad within 40-60 C', lj != null && lj > 40 && lj < 60, f2(lj));
const ln = boxMean('l_night_anom_djf', ...P.lahore, 2);
check('Lahore DJF night LST anomaly vs 10 km positive', ln != null && ln > 0, f2(ln));
const lnj = boxMean('l_night_anom_jja', ...P.lahore, 2);
check('Lahore JJA night LST anomaly vs 10 km positive', lnj != null && lnj > 0, f2(lnj));
const cj = v('c_tmax_07', ...P.jacobabad), cm = v('c_tmax_07', ...P.murree);
check('CHELSA July tmax Jacobabad > Murree + 12 C', cj != null && cm != null && cj > cm + 12, `${f2(cj)} vs ${f2(cm)}`);
const cjn = v('c_tmin_01', ...P.murree);
check('CHELSA January tmin Murree below 2 C', cjn != null && cjn < 2, f2(cjn));
const ni = boxMean('s_ndvi_jja', ...P.punjabIrr, 8), nt = boxMean('s_ndvi_jja', ...P.thar, 8);
check('S2 JJA NDVI irrigated Punjab > Cholistan + 0.15', ni != null && nt != null && ni > nt + 0.15, `${f2(ni)} vs ${f2(nt)}`);
const nb = boxMean('s_ndbi_jja', ...P.lahore, 2), nbi = boxMean('s_ndbi_jja', ...P.punjabIrr, 8);
check('S2 JJA NDBI Lahore core > irrigated Punjab', nb != null && nbi != null && nb > nbi, `${f2(nb)} vs ${f2(nbi)}`);
// national coverage of the main bands inside Pakistan: sample a lattice of points and require values
let tot = 0; const miss = {};
const cov = ['s_wc_crop', 'w_dist', 's_ndvi_jja', 's_ndvi_djf', 'l_day_jja', 'l_night_djf', 'c_tmax_07'];
for (let lat = 24.5; lat <= 36.5; lat += 0.5) for (let lon = 61.5; lon <= 77; lon += 0.5) {
  if (v('s_wc_crop', lat, lon) == null) continue;   // outside the Pakistan mask
  tot++; for (const b of cov) if (v(b, lat, lon) == null) miss[b] = (miss[b] || 0) + 1;
}
for (const b of cov) check(`coverage ${b} >= 98% of in-mask lattice points (n=${tot})`, tot > 200 && (miss[b] || 0) <= tot * 0.02, `${miss[b] || 0} missing`);

// 3 point features
const S72 = process.env.NIGRAAN_S72_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 's72');   /* v283 WS7: was /home/claude/nig/s72 (sibling of nigraan-local) */
const PF = join(S72, 'pointfeat_S.csv'), PJ = join(S72, 'pointfeat_S.json');
if (existsSync(PF) && existsSync(PJ)) {
  const lines = readFileSync(PF, 'utf8').trim().split(/\r?\n/); const head = lines[0].split(',');
  const units = JSON.parse(readFileSync(PJ, 'utf8')).units || {};
  check('pointfeat_S rows = 409', lines.length - 1 === 409, lines.length - 1);
  const noUnit = head.slice(1).filter((h) => !units[h]);
  check('every point feature has a unit', noUnit.length === 0, noUnit.join(','));
  const need = ['s_wc_class', 's_wc_built_b500', 'w_dist_km', 's_ndvi_jja_b100', 'l_day_jja', 'l_night_anom_djf', 'c_tmax_07'];
  for (const k of need) {
    const i = head.indexOf(k);
    const n = i < 0 ? 0 : lines.slice(1).filter((l) => { const c = l.match(/("[^"]*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '')); return c[i] !== '' && c[i] !== undefined; }).length;
    check(`point feature ${k} filled for >= 400 points`, n >= 400, n);
  }
} else console.log('SKIP pointfeat_S.csv/json · a build intermediate of the cloud surface run (scripts/surface_common.py, <nig>/s72 or NIGRAAN_S72_DIR), not shipped with nigraan-local; checked where that build runs (v91.17.269 A10)');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
