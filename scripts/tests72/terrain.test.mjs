/* v91.17.72 · terrain (agent T): 30 m Copernicus GLO-30 feature bands, settlement heights, point heights, 30 m HAND, masks.
   node scripts/tests72/terrain.test.mjs [baseUrl]
   The data checks read the install's data/ directly (NIGRAAN_DATA_DIR or ../../data); the optional server checks run when
   baseUrl answers (the existing terrain and HAND routes must keep serving). PASS/FAIL lines; exit 1 on any FAIL. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeatGrid } from '../../server/api/featgrid.mjs';
import { createPointHeight } from '../../server/api/pointheight.mjs';
import { createHand } from '../../server/api/hand.mjs';
import { createTerrain } from '../../server/api/terrain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const J = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const r1 = (x) => x == null ? x : Math.round(x * 10) / 10;

/* ── 1. feature bands ── */
const fg = createFeatGrid(DATA);
const BANDS = ['t_elev', 't_elev_p10', 't_elev_p90', 't_slope', 't_slope_p90', 't_aspect_sin', 't_aspect_cos', 't_tpi300', 't_tpi1000', 't_valley_depth', 't_svf', 't_capp'];
for (const b of BANDS) { const m = fg.meta(b); ok(!!m && /GLO-30/.test(m.source || '') && !!m.licence && !!m.method, `band ${b} present with source, method and licence (${m ? m.stats.n + ' cells' : 'missing'})`); }
const P = {
  gilgit: [35.9195, 74.3080],       // Gilgit town on the valley floor (about 1,480 m)
  lahore: [31.5580, 74.3500],       // Lahore, the walled-city side of the plain
  murree: [33.9070, 73.3943],       // Murree ridge
  skarduFloor: [35.2970, 75.6330],  // Skardu basin floor
};
const v = (b, k) => fg.value(b, P[k][0], P[k][1]);
ok(v('t_tpi1000', 'gilgit') < 0, `Gilgit valley floor: t_tpi1000 ${r1(v('t_tpi1000', 'gilgit'))} m < 0`);
ok(v('t_valley_depth', 'gilgit') > 500, `Gilgit valley floor: t_valley_depth ${r1(v('t_valley_depth', 'gilgit'))} m > 500`);
ok(v('t_elev', 'gilgit') > 1350 && v('t_elev', 'gilgit') < 1650, `Gilgit t_elev ${r1(v('t_elev', 'gilgit'))} m in 1350-1650`);
ok(v('t_capp', 'gilgit') > v('t_capp', 'murree'), `cold-air pooling: Gilgit floor ${r1(v('t_capp', 'gilgit'))} > Murree ridge ${r1(v('t_capp', 'murree'))}`);
ok(v('t_svf', 'gilgit') < v('t_svf', 'lahore'), `sky view: Gilgit ${v('t_svf', 'gilgit')} < Lahore ${v('t_svf', 'lahore')}`);
ok(v('t_slope', 'lahore') < 1, `Lahore t_slope ${r1(v('t_slope', 'lahore'))} deg < 1`);
/* Murree: the Mall sits on the ridge crest (the flattest cell around, built-up); the hills around it are the steep part */
const mur = []; for (let di = -3; di <= 3; di++) for (let dj = -3; dj <= 3; dj++) mur.push(fg.value('t_slope', P.murree[0] + di / 400, P.murree[1] + dj / 400));
mur.sort((a, b) => a - b); const murMed = mur[Math.floor(mur.length / 2)];
ok(murMed > 15, `Murree hills (7x7 cells around the Mall): median t_slope ${r1(murMed)} deg > 15`);
ok(v('t_slope', 'murree') > 8, `Murree Mall ridge-crest cell t_slope ${r1(v('t_slope', 'murree'))} deg > 8`);
const mh = [33.895, 73.39];
ok(fg.value('t_elev_p90', ...mh) - fg.value('t_elev_p10', ...mh) > 50, `Murree hillside within-cell relief ${r1(fg.value('t_elev_p90', ...mh) - fg.value('t_elev_p10', ...mh))} m > 50`);
for (const b of ['t_aspect_sin', 't_aspect_cos']) ok(Math.abs(v(b, 'murree')) <= 1, `${b} within [-1, 1] at Murree (${v(b, 'murree')})`);
/* the Skardu basin floor is wider than the 1 km TPI disk (TPI about 0 there); its depth below the ridges is what marks it */
ok(v('t_valley_depth', 'skarduFloor') > 300 && v('t_capp', 'skarduFloor') > v('t_capp', 'lahore'), `Skardu basin floor: valley depth ${r1(v('t_valley_depth', 'skarduFloor'))} m > 300, capp ${v('t_capp', 'skarduFloor')} > Lahore ${v('t_capp', 'lahore')}`);
const rules = J('terrain30-rules.json');
ok(rules.capp && rules.capp.terms && Object.values(rules.capp.terms).every((t) => typeof t.w === 'number' && typeof t.scale === 'number'), 'capp weights and scales come from data/terrain30-rules.json');

/* ── 2. settlement heights: schema unchanged, GLO-30 basis ── */
const S = J('settlement-elevation.json');
ok(JSON.stringify(Object.keys(S)) === JSON.stringify(['built', 'licence', 'method', 'settlementElevM', 'use', 'sources', 'counts', 'units']), 'settlement-elevation.json top-level keys unchanged');
const UK = ['pop', 'popWeightedMeanM', 'popMedianM', 'p10M', 'p90M', 'peakCellM', 'anchorElevM', 'shareWithin150mOfAnchor', 'settlementElevM', 'gapM', 'cells300m'];
const us = Object.values(S.units);
ok(us.length >= 570 && us.every((u) => JSON.stringify(Object.keys(u)) === JSON.stringify(UK)), `settlement units (${us.length}) keep the 11 fields in order`);
ok(/GLO-30/.test(S.method) && S.licence.some((l) => l.id === 'copernicus_dem30'), 'settlement heights on GLO-30, licence recorded');
const gojal = S.units['Gilgit Baltistan|Hunza|Gojal'];
ok(gojal && gojal.settlementElevM > 2700 && gojal.settlementElevM < 3300 && gojal.settlementElevM < gojal.anchorElevM - 300, `Gojal settlement height ${gojal && gojal.settlementElevM} m, well below the ${gojal && gojal.anchorElevM} m anchor (Passu 2,475, Sost 2,800, Shimshal 3,100)`);

/* ── 3. point heights ── */
const ph = createPointHeight(DATA, { featGrid: fg });
const passu = ph.heightAt(36.46632, 74.89415);
ok(passu.basis === 'place30' && passu.sendElevation && passu.elevM > 2350 && passu.elevM < 2650, `Passu: ${passu.basis} ${passu.elevM} m (GeoNames 2,475 m)`);
const pj = J('place-height30.json');
const iP = pj.lat.findIndex((la, i) => Math.abs(la - 36.46632) < 1e-5 && Math.abs(pj.lon[i] - 74.89415) < 1e-5);
ok(iP >= 0 && pj.h[iP] === passu.elevM, `Passu height is the stored 30 m value (${iP >= 0 ? pj.h[iP] : 'none'})`);
const near = ph.heightAt(36.46632 + 0.0005, 74.89415);   // 56 m north
ok(near.basis === 'place30' && near.place.distM < 100, `a request 56 m from Passu matches it (${near.place && near.place.distM} m)`);
const kar = ph.heightAt(36.32692, 74.66141);
ok(kar.basis === 'place30' && kar.elevM > 2250 && kar.elevM < 2600, `Karimabad (Hunza): ${kar.elevM} m (GeoNames 2,386 m)`);
const slope = ph.heightAt(36.1450, 74.4900);   // Rakaposhi north face, no place within 100 m
ok(slope.basis === 'cell30' && slope.keepProviderDem === true && slope.sendElevation === false, `steep cell without a place keeps the provider DEM (relief ${slope.cell && slope.cell.reliefM} m > ${slope.reliefKeepProviderM})`);
const flat = ph.heightAt(30.6000, 72.0000);
ok(flat.basis === 'cell30' && flat.sendElevation === true && flat.elevM > 100 && flat.elevM < 250, `flat Punjab cell sends the 30 m cell height (${flat.elevM} m)`);
ok(ph.heightAt(10, 10).sendElevation === false, 'outside the grid: nothing sent');
ok(typeof rules.pointHeight.reliefKeepProviderM.value === 'number' && rules.pointHeight.reliefKeepProviderM.n > 1000, `relief threshold ${rules.pointHeight.reliefKeepProviderM.value} m measured on n=${rules.pointHeight.reliefKeepProviderM.n}`);

/* ── 4. 30 m HAND ── */
const HT = J('hand-tehsil.json');
const lc = HT.units['Punjab|Lahore|Lahore City'];
ok(lc && lc.basis === 'GLO-30' && lc.glo90 && lc.glo90.major && ['lt2', 'b2_5', 'b5_10', 'gt10', 'medianM', 'b10_20', 'gt20'].every((k) => typeof lc.major[k] === 'number'), 'Lahore City HAND on GLO-30, major bands complete, GLO-90 record kept');
ok(HT.glo30 && HT.glo30.n >= 80, `hand-tehsil.json: ${HT.glo30 && HT.glo30.n} units on GLO-30`);
const units = JSON.parse(readFileSync(join(HERE, '..', '..', 'server', 'contract', 'units.json'), 'utf8'));
const hand = createHand(DATA, { tehsil: units });
const hl = hand.of('Punjab|Lahore|Lahore City');
ok(hl && hl.demBasis === 'GLO-30' && /GLO-30 30 m/.test(hl.basis) && hl.factor >= 0.3 && hl.factor <= 1, `hand.mjs serves the 30 m bands for Lahore City (factor ${hl && hl.factor})`);
const hg = hand.of('Punjab|Bahawalnagar|Fort Abbas');
ok(hg && (hg.demBasis === 'GLO-90' || (HT.glo30 && HT.glo30.version === 'v91.17.75' && hg.demBasis === 'GLO-30')), '(75) a unit outside the v72 priority areas keeps GLO-90, or carries GLO-30 after the v91.17.75 national run (' + (hg && hg.demBasis) + ')');
ok(fg.meta('t_hand') && fg.value('t_hand', 31.5580, 74.3500) != null, `t_hand band present (Lahore cell p10 ${r1(fg.value('t_hand', 31.5580, 74.3500))} m)`);

/* ── 5. masks and tehsil statistics ── */
const T30 = J('terrain30-tehsil.json');
ok(Object.keys(T30.units).length >= 570, `terrain30-tehsil.json: ${Object.keys(T30.units).length} tehsils`);
const ter = createTerrain(DATA, { tehsil: units });
const mr = ter.relief('Punjab|Rawalpindi|Murree');
ok(mr.ready && mr.slope.mean > 15 && mr.elev.p90 > mr.elev.p10, `terrain.relief(Murree): slope mean ${mr.slope && mr.slope.mean} deg`);
const A = J('hazard-applicability.json');
ok(A.layers.landslide.params.steepDeg && A.layers.landslide.params.minSteepShare.status === 'measured', `landslide mask on the 30 m slope (steeper than ${A.layers.landslide.params.steepDeg.value} deg, share >= ${A.layers.landslide.params.minSteepShare.value})`);
ok(A.layers.landslide.units['Punjab|Lahore|Lahore City'] && !A.layers.landslide.units['Punjab|Rawalpindi|Murree'], 'Lahore City outside, Murree inside the landslide mask');
ok(A.layers.hill_torrent && !A.layers.hill_torrent.units['Punjab|Rajanpur|Rajanpur'] && !!A.layers.hill_torrent.units['Punjab|Lahore|Lahore City'], 'hill-torrent layer: Rajanpur inside, Lahore City outside');
ok(/30 m p99/.test(A.layers.snow.rule), 'snow mask reads the 30 m p99 elevation');

/* ── 6. existing routes (when a server answers) ── */
try {
  const r = await fetch(BASE + '/api/terrain/lithology', { signal: AbortSignal.timeout(3000) });
  ok(r.status === 200, `GET /api/terrain/lithology ${r.status}`);
  const h = await fetch(BASE + '/api/flood/hand?unit=' + encodeURIComponent('Punjab|Lahore|Lahore City'), { signal: AbortSignal.timeout(5000) });
  ok(h.status === 200, `GET /api/flood/hand?unit=Lahore City ${h.status}`);
} catch (e) { console.log('SKIP server checks (' + BASE + ' not reachable)'); }

console.log(fails ? `${fails} FAIL` : 'all PASS');
process.exit(fails ? 1 : 0);
