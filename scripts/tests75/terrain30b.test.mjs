/* v91.17.75 · terrain 30 m round 2 (agent T): national 30 m HAND (basin-chunked), 30 m riverine weights, the 30 m landslide
   susceptibility, the GLOF lake terrain on GLO-30, the hillshade overlay and its route.
   node scripts/tests75/terrain30b.test.mjs [baseUrl]
   Data checks read data/ directly (NIGRAAN_DATA_DIR or ../../data); the route checks run when baseUrl answers (default
   http://127.0.0.1:8804, agent T's port). PASS / FAIL / SKIP lines; exit 1 on any FAIL. */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeatGrid } from '../../server/api/featgrid.mjs';
import { createHand } from '../../server/api/hand.mjs';
import { createTerrain } from '../../server/api/terrain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const DATA = process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data');
const BASE = (process.argv[2] || 'http://127.0.0.1:8804').replace(/\/$/, '');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const skip = (m) => console.log('SKIP ' + m);
const J = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const med = (a) => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/* ── D1 · national 30 m HAND ── */
const HT = J('hand-tehsil.json'); const U = HT.units;
const pk = Object.keys(U).filter(k => !/Illegally/.test(k));
const g30 = pk.filter(k => U[k].basis === 'GLO-30');
ok(g30.length >= 540, `HAND on GLO-30 for ${g30.length} of ${pk.length} Pakistan-administered tehsils (v72: 95)`);
ok(g30.filter(k => U[k].glo90 && U[k].glo90.major).length >= g30.length - 10, `GLO-30 records keep their GLO-90 record as glo90 (${g30.filter(k => U[k].glo90 && U[k].glo90.major).length} of ${g30.length}; a unit without a GLO-90 major record has none to keep)`);
ok(HT.glo30 && HT.glo30.version === 'v91.17.75' && /basin/i.test(HT.glo30.chunking || ''), 'header: v91.17.75, basin chunking');
const fbm = med(g30.map(k => U[k].fallbackShare && U[k].fallbackShare.major));
ok(fbm != null && fbm < 0.36, `median fallback share (major) ${fbm} < 0.36 (v72 priority areas)`);
const v72 = g30.filter(k => U[k].v72 && U[k].v72.fallbackShare);
if (v72.length) ok(med(v72.map(k => U[k].fallbackShare.major)) < med(v72.map(k => U[k].v72.fallbackShare.major)), `v72 priority units: fallback ${med(v72.map(k => U[k].v72.fallbackShare.major))} -> ${med(v72.map(k => U[k].fallbackShare.major))}`);
ok(g30.every(k => { const m = U[k].major; return m && Math.abs(m.lt2 + m.b2_5 + m.b5_10 + m.gt10 - 1) < 0.01; }), 'major bands of every GLO-30 record add up to 1');
const kept = (HT.glo30 && HT.glo30.keptGlo90) || {};
ok(Object.keys(kept).some(k => /Illegally/.test(k)), 'the disputed polygon is kept on its GLO-90 record and named in keptGlo90');
const fg = createFeatGrid(DATA);
const mh = fg.meta('t_hand');
ok(mh && /national/i.test(mh.coverage || '') && mh.stats.n > 12e6, `t_hand national: ${mh ? mh.stats.n : 0} cells`);
const muz = fg.value('t_hand', 30.07, 71.19), gujar = fg.value('t_hand', 33.26, 73.30);   // Muzaffargarh floodplain; Gujar Khan plateau
ok(muz != null && gujar != null && muz < gujar, `t_hand: Muzaffargarh floodplain ${muz} m < Gujar Khan plateau ${gujar} m`);
const CAL = J('flood-extent-calibration.json');
ok(CAL.bandWeights30 && CAL.glo30 && CAL.glo30.pixelAuc && CAL.glo30.pixelAuc.hand30 != null, `30 m band weights and pixel AUC (30 m ${CAL.glo30 && CAL.glo30.pixelAuc.hand30} / 180 m ${CAL.glo30 && CAL.glo30.pixelAuc.hand180})`);
const W = CAL.bandWeights30 || {};
ok(W.lt2 === 1 && W.b2_5 <= 1.05 && W.b5_10 <= W.b2_5 + 0.05 && W.b10_20 <= W.b5_10 + 0.05, `30 m weights fall with height: ${JSON.stringify(W)}`);
ok(CAL.bandWeights && CAL.sets && CAL.sets.hi2022, 'the 180 m calibration is kept beside it');
const hand = createHand(DATA, { tehsil: [] });
const one = g30.find(k => U[k].major && U[k].major.lt2 > 0.05);
const h1 = one && hand.of(one);
ok(h1 && h1.demBasis === 'GLO-30' && h1.weightsBasis && /30/.test(h1.weightsBasis) && JSON.stringify(h1.weights) === JSON.stringify({ lt2: W.lt2, b2_5: W.b2_5, b5_10: W.b5_10, b10_20: W.b10_20 || 0 }), `hand.mjs weights a GLO-30 unit with the 30 m weights (${one})`);
const iio = Object.keys(U).find(k => /Illegally/.test(k)); const h2 = iio && hand.of(iio);
ok(!h2 || h2.weightsBasis === undefined || /GLO-90/.test(h2.weightsBasis), 'a GLO-90 record keeps the 180 m weights');
const AP = J('hazard-applicability.json');
const fr = AP.layers ? AP.layers.flood_riverine : AP.flood_riverine;
ok(fr && fr.source && fr.source.includes(HT.built || '') || (fr && /hand-tehsil/.test(fr.source || '')), 'flood_riverine mask rebuilt from hand-tehsil.json');

/* ── D2 · landslide susceptibility ── */
const LS = J('landslide-susceptibility30.json');
ok(Object.keys(LS.units).length >= 570, `susceptibility for ${Object.keys(LS.units).length} tehsils`);
ok(['model30', 'model30+giri', 'giri'].includes(LS.served) && LS.auc.giriMeanClass.aucTehsil > 0 && LS.auc.model30.aucTehsilOof > 0, `served ${LS.served}: AUC GIRI ${LS.auc.giriMeanClass.aucTehsil} · 30 m OOF ${LS.auc.model30.aucTehsilOof} · 30 m+GIRI OOF ${LS.auc['model30+giri'].aucTehsilOof}`);
const best = Math.max(LS.auc.giriMeanClass.aucTehsil, LS.auc.model30.aucTehsilOof, LS.auc['model30+giri'].aucTehsilOof);
const servedAuc = LS.served === 'giri' ? LS.auc.giriMeanClass.aucTehsil : LS.auc[LS.served].aucTehsilOof;
ok(servedAuc === best, 'the served candidate has the best tehsil AUC');
ok(LS.fits && LS.fits.model30 && LS.fits.model30.coef && LS.params && LS.params.classCutsRelDensity && LS.params.classFactor, 'weights, cut points and class factors are in the data file');
const cls = Object.values(LS.units).map(u => u.served.class);
ok(new Set(cls).size >= 4, `the served classes use ${new Set(cls).size} of 5 levels: ${JSON.stringify(LS.classUnits.served)}`);
const T = createTerrain(DATA, { tehsil: [] });
const gj = T.susceptibility('Gilgit Baltistan|Hunza|Gojal'), lh = T.susceptibility('Punjab|Lahore|Lahore City');
ok(gj.ready && lh.ready && gj.class > lh.class, `Gojal (KKH) class ${gj.class} > Lahore City class ${lh.class}`);
const gi = T.giri('Gilgit Baltistan|Hunza|Gojal');
ok(gi.susceptibility30 && gi.susceptibility30.class === gj.class, '/api/landslide/giri?unit= carries susceptibility30');
const nat = T.giri(null);
ok(nat.susceptibility30 && nat.susceptibility30.units && Object.keys(nat.susceptibility30.units).length >= 570 && nat.susceptibility30.classFactor, '/api/landslide/giri (national) carries the class table and the class factors for the browser');

/* ── D3 · GLOF lake terrain ── */
for (const f of ['glof-terrain-merged.json', 'glof-terrain-open.json']) {
  const G = J(f); const L = Object.values(G.lakes);
  const n30 = L.filter(x => x.dem === 'GLO-30').length;
  ok(/GLO-30/.test(G.dem) && n30 >= 0.95 * L.length, `${f}: ${n30} of ${L.length} lakes on GLO-30`);
  ok(L.filter(x => x.dem === 'GLO-30').every(x => x.glo90 && 'relief1kmM' in x && 'slope1kmDeg' in x && 'dropToValley2kmM' in x), `${f}: each 30 m record keeps glo90 and adds the 2 km lake-to-valley drop`);
  ok(L.filter(x => x.damSlopeDeg != null).length >= 0.3 * L.length, `${f}: dam / moraine face slope for ${L.filter(x => x.damSlopeDeg != null).length} lakes`);
  ok(Object.values(G.basins).filter(b => b.glo90RepElevM !== undefined).length >= 0.95 * Object.keys(G.basins).length, `${f}: basin heights on GLO-30`);
}

/* ── D4 · hillshade tiles ── */
const TD = join(DATA, 'tiles', 'hillshade');
const meta = existsSync(join(TD, 'meta.json')) ? JSON.parse(readFileSync(join(TD, 'meta.json'), 'utf8')) : null;
ok(meta && meta.minZoom === 5 && meta.maxZoom === 12 && meta.urlTemplate === '/tiles/hillshade/{z}/{x}/{y}.png', 'hillshade meta: /tiles/hillshade/{z}/{x}/{y}.png, z 5-12');
let files = 0, bytes = 0; const zs = new Set();
if (existsSync(TD)) for (const z of readdirSync(TD)) { const zp = join(TD, z); if (!statSync(zp).isDirectory()) continue; zs.add(+z); for (const x of readdirSync(zp)) for (const y of readdirSync(join(zp, x))) { files++; bytes += statSync(join(zp, x, y)).size; } }
ok(files > 1000 && bytes < 300e6 && [5, 6, 7, 8, 9, 10, 11, 12].every(z => zs.has(z)), `hillshade: ${files} tiles, ${(bytes / 1e6).toFixed(1)} MB (< 300), zooms ${[...zs].sort((a, b) => a - b).join(',')}`);
const t2 = (lat, lon, z) => { const n = 2 ** z; return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n)]; };
const [hx, hy] = t2(36.32, 74.66, 12), [lx, ly] = t2(31.52, 74.35, 12);
ok(existsSync(join(TD, '12', String(hx), hy + '.png')), 'z12 tile over Hunza exists');
ok(!existsSync(join(TD, '12', String(lx), ly + '.png')), 'z12 tile over flat Lahore is not written (flat = transparent)');
if (existsSync(join(TD, '12', String(hx), hy + '.png'))) {
  const b = readFileSync(join(TD, '12', String(hx), hy + '.png'));
  ok(b.slice(1, 4).toString() === 'PNG' && b[25] === 3 && b.includes(Buffer.from('tRNS')), 'tiles are palette PNGs with an alpha table (black with alpha: multiplies under alpha compositing)');
}
const srv = readFileSync(join(ROOT, 'server', 'server.mjs'), 'utf8');
ok(/'hillshade'\]\)/.test(srv), 'server.mjs keeps data/tiles/hillshade out of the legacy-cache purge');
ok(/\\\/tiles\\\/hillshade\\\/\(\\d\+\)/.test(srv), 'server.mjs routes /tiles/hillshade/{z}/{x}/{y}.png');

/* ── routes (optional) ── */
let up = false; try { const r = await fetch(BASE + '/tiles/hillshade/12/' + hx + '/' + hy + '.png', { signal: AbortSignal.timeout(8000) }); up = r.status > 0;
  ok(r.status === 200 && r.headers.get('content-type') === 'image/png' && r.headers.get('x-hillshade') === 'tile', 'GET /tiles/hillshade/12/Hunza: 200 image/png tile'); } catch (e) { skip('server at ' + BASE + ' not reachable: route checks skipped'); }
if (up) {
  const r2 = await fetch(BASE + '/tiles/hillshade/12/' + lx + '/' + ly + '.png'); ok(r2.status === 200 && r2.headers.get('x-hillshade') === 'empty', 'flat tile answers a transparent 1x1 PNG (no broken tile)');
  const r3 = await fetch(BASE + '/tiles/hillshade/13/1/1.png'); ok(r3.status === 404, 'zoom 13 is out of range (404)');
  const r4 = await fetch(BASE + '/api/landslide/giri?unit=' + encodeURIComponent('Gilgit Baltistan|Hunza|Gojal')); const j4 = await r4.json().catch(() => null);
  ok(r4.status === 200 && j4 && j4.susceptibility30 && j4.susceptibility30.class >= 1, '/api/landslide/giri?unit=Gojal serves susceptibility30');
  const r5 = await fetch(BASE + '/api/flood/hand'); const j5 = await r5.json().catch(() => null);
  ok(r5.status === 200 && j5 && j5.glo30 && j5.glo30.n >= 540, '/api/flood/hand national reports the GLO-30 coverage');
}
console.log(fails ? `${fails} FAIL` : 'all PASS');
process.exit(fails ? 1 : 0);
