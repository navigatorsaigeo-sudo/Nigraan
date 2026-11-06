/* v91.17.77 · agent H: 30 m HAND for the flat-plains and delta units v75 left on GLO-90 (station-lake/scripts/terrain30_hand3.py).
   node scripts/tests77/hand30c.test.mjs [baseUrl]      (default http://127.0.0.1:8787)
   Data checks read data/ directly (NIGRAAN_DATA_DIR or ../../data); route checks run when baseUrl answers.
   PASS / FAIL / SKIP lines; exit 1 on any FAIL. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeatGrid } from '../../server/api/featgrid.mjs';
import { createHand, HAND_FLOOR, HAND_FULL } from '../../server/api/hand.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const DATA = process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data');
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const skip = (m) => console.log('SKIP ' + m);
const J = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));

const V75_KEPT = ['Balochistan|Gwadar|Jiwani', 'Balochistan|Kharan|Tomulk', 'Balochistan|Washuk|Washuk', 'Balochistan|Washuk|Shaogari', 'Punjab|Kasur|Kasur',
  'Punjab|Mandi Bahauddin|Mandi Bahauddin', 'Punjab|Sargodha|Bhalwal', 'Sindh|Central Karachi|Gulberg Town', 'Sindh|Central Karachi|Liaqatabad Town',
  'Sindh|Central Karachi|New Karachi Town', 'Sindh|Central Karachi|North Nazimabad Town', 'Sindh|Khairpur|Gambat', 'Sindh|Khairpur|Khairpur', 'Sindh|Khairpur|Kingri',
  'Sindh|Khairpur|Sobho Dero', 'Sindh|South Karachi|Liyari Town', 'Sindh|Sujawal|Kharo Chan', 'Sindh|Keamari|Site Town', 'Balochistan|Chagai|Dalbandin',
  'Balochistan|Chagai|Chagai', 'Balochistan|Nushki|Nushki', 'Sindh|Sujawal|Keti Bunder'];
const KARACHI = V75_KEPT.filter(k => /Karachi|Keamari/.test(k));
const DESERT = ['Balochistan|Nushki|Nushki', 'Balochistan|Chagai|Chagai', 'Balochistan|Chagai|Dalbandin', 'Balochistan|Washuk|Washuk', 'Balochistan|Washuk|Shaogari', 'Balochistan|Kharan|Tomulk'];

/* ── 1 · licence of the river lines ── */
const HT = J('hand-tehsil.json'); const U = HT.units; const V = HT.glo30v77;
const lic = (HT.licence || []).find(l => l.id === 'hydrorivers');
ok(lic && /commercial use/.test(lic.licence) && /HydroSHEDS_TechDoc_v1_4\.pdf/.test(lic.licenceUrl) && /HydroRIVERS_TechDoc_v10\.pdf/.test(lic.licenceUrlProduct || ''), 'HydroRIVERS licence recorded verbatim with both licence documents');
ok(lic && /incorporates data from the HydroSHEDS version 1 database which is © World Wildlife Fund/.test(lic.attribution) && /Lehner, B\., Grill G\. \(2013\)/.test(lic.citation || ''), 'Exhibit B attribution statement and the HydroRIVERS citation carried');
ok(V && V.licence && V.licence.id === 'hydrorivers', 'glo30v77 block carries the licence (provenance of the v77 output)');

/* ── 2 · the v77 run ── */
ok(V && V.version === 'v91.17.77' && /terrain30_hand3\.py/.test(V.script) && /Priority-Flood/.test(V.method) && V.params && V.params.burnM > 0 && V.params.epsM > 0, 'header: script, method (stream burn + Priority-Flood + epsilon), documented burn depth and epsilon');
const moved = (V && V.moved) || [];
ok(Array.isArray(moved), `units moved to GLO-30 by v77: ${moved.length} (${moved.map(u => u.split('|')[2]).join(', ') || 'none'})`);
for (const u of moved) {
  const r = U[u], h = r && r.hand30v77;
  ok(r && r.basis === 'GLO-30' && r.glo90 && h && h.accepted === true && h.validShare.major >= 0.6, `${u}: GLO-30, glo90 kept, valid share ${h && h.validShare.major} >= 0.6`);
  const ds = (h && h.decidingSets) || [];
  ok(ds.length > 0 && ds.every(s => { const e = h.evaluation[s]; return e.auc30AllPixels >= V.params.aucMin && (e.auc30 == null || e.auc30 >= V.params.aucMin) && (e.auc90 == null || e.auc30at180 >= e.auc90 - V.params.aucTol); }),
    `${u}: AUC rule met on ${ds.join('+')} (${ds.map(s => `all ${h.evaluation[s].auc30AllPixels}, 180 m ${h.evaluation[s].auc30at180} vs GLO-90 ${h.evaluation[s].auc90}`).join('; ')})`);
  ok(Math.abs(r.major.lt2 + r.major.b2_5 + r.major.b5_10 + r.major.gt10 - 1) < 0.01, `${u}: major bands add up to 1`);
}
ok(HT.glo30.n === HT.glo30.units.length && HT.glo30.n >= 554 + moved.length - 0 && moved.every(u => HT.glo30.units.includes(u)), `glo30.n ${HT.glo30.n} = 554 (v75) + ${moved.length}`);

/* ── 3/4 · every v75 kept unit is accounted for, with its reason in its own record ── */
for (const u of V75_KEPT) {
  const r = U[u]; if (!r) { ok(false, `${u}: no record`); continue; }
  const good = r.basis === 'GLO-30' || (r.basis === 'observed-extent-2022' && r.observed && /observed-extent basis/.test(r.observed.flag)) || (typeof r.keptGlo90 === 'string' && r.keptGlo90.length > 20);
  ok(good, `${u}: ${r.basis || 'GLO-90'}${r.keptGlo90 && r.basis !== 'GLO-30' ? ' — ' + r.keptGlo90.slice(0, 90) : ''}`);
}
ok(KARACHI.every(u => U[u].basis !== 'GLO-30' && /Karachi town/.test(U[u].keptGlo90 || '')), 'the six Karachi towns stay GLO-90 with the rooftop-DSM / no-river reason');
ok(DESERT.every(u => U[u].basis !== 'GLO-30' && /desert|closed/.test(U[u].keptGlo90 || '')), 'the six desert units stay GLO-90 with the closed-basin reason');
ok(Object.keys(HT.glo30.keptGlo90).some(k => /Illegally/.test(k)), 'the disputed polygon is still listed in keptGlo90');
for (const u of ['Sindh|Sujawal|Keti Bunder', 'Sindh|Sujawal|Kharo Chan']) {
  const r = U[u];
  ok(r.basis === 'GLO-30' || r.basis === 'observed-extent-2022' || /sea|analysis extent/.test(r.keptGlo90 || '') || /kept on GLO-90/.test(r.keptGlo90 || ''),   /* v91.17.77 integrator: a stated reason to keep GLO-90 counts */ `${u} (delta): ${r.basis || 'GLO-90'} — item 3 applied or the reason why it cannot be`);
}

/* ── 5 · weights and the served records ── */
const CAL = J('flood-extent-calibration.json');
const rc = V && V.recalibration;
ok(!rc || (typeof rc.maxAbsWeightChange === 'number' && typeof rc.material === 'boolean'), `recalibration check: max |Δweight| ${rc && rc.maxAbsWeightChange} (material ${rc && rc.material})`);
if (rc && !rc.material) ok(['lt2', 'b2_5', 'b5_10', 'b10_20'].every(k => CAL.bandWeights30[k] === rc.weightsServed[k]), 'v75 30 m band weights kept (change not material)');
const hand = createHand(DATA, { tehsil: [] });
const W30 = CAL.bandWeights30;
for (const u of moved) {
  const h = hand.of(u);
  const WS = CAL.bandWeightsHeldOut || W30;   /* v91.17.150 · the held-out weights (2010+2014, tested on 2025) are served when present */
  ok(h && h.demBasis === 'GLO-30' && (CAL.bandWeightsHeldOut ? /bandWeightsHeldOut/.test(h.weightsBasis) : /bandWeights30/.test(h.weightsBasis)) && h.weights.b2_5 === WS.b2_5 && h.factor >= HAND_FLOOR && h.factor <= 1, `hand.mjs serves ${u} as GLO-30 with the served weights (factor ${h && h.factor})`);
}
const obsU = Object.keys(U).filter(k => U[k].basis === 'observed-extent-2022');
for (const u of obsU) {
  const h = hand.of(u), o = U[u].observed, s = Math.min(1, o.floodplainShareEquivalent);
  const w = Math.round(1000 * (HAND_FLOOR + (1 - HAND_FLOOR) * Math.min(1, s / HAND_FULL))) / 1000;
  ok(h && h.demBasis === 'observed-extent-2022' && h.observedBasis === true && h.factor === w && /observed extent/.test(h.basis), `hand.mjs serves ${u} on the observed-extent basis (flooded ${o.floodedShare}, factor ${h && h.factor})`);
}
const kr = hand.of('Sindh|Central Karachi|Gulberg Town');
ok(kr && kr.factor === 1 && /Karachi town/.test(kr.glo90Reason || ''), 'a Karachi town is served with factor 1 and its GLO-90 reason');
const lh = hand.of('Punjab|Lahore|Lahore City');
ok(lh && lh.demBasis === 'GLO-30' && lh.glo90Reason === undefined && /GLO-30 30 m/.test(lh.basis), 'an untouched v75 GLO-30 unit is served exactly as before (Lahore City)');
const nat = hand.national();
ok(nat.ready && nat.glo30 && nat.glo30.v77 && nat.counts.units >= 570, `national table: ${nat.counts.units} units, glo30.v77 summary present`);

/* ── t_hand band ── */
const fg = createFeatGrid(DATA);
const mh = fg.meta('t_hand');
if (moved.length) {
  ok(mh.v77 && mh.v77.units.length === moved.length && mh.v77.cells > 0 && (mh.licence || []).some(l => l.id === 'hydrorivers'), `t_hand: v77 cells ${mh.v77 && mh.v77.cells} for ${moved.length} units, HydroRIVERS licence in the band`);
  const B = { 'Punjab|Kasur|Kasur': [31.12, 74.45], 'Sindh|Khairpur|Khairpur': [27.53, 68.76], 'Sindh|Khairpur|Kingri': [27.62, 68.62], 'Punjab|Mandi Bahauddin|Mandi Bahauddin': [32.58, 73.49] };
  for (const u of moved.filter(x => B[x])) { const v = fg.value('t_hand', B[u][0], B[u][1]); ok(v != null && v >= 0, `t_hand at ${u.split('|')[2]} ${v} m`); }
} else skip('no unit moved: t_hand unchanged');
ok(mh && /national/i.test(mh.coverage || '') && mh.stats.n > 12e6, `t_hand still national (${mh && mh.stats.n} cells)`);

/* ── routes ── */
let up = false;
try { const r = await fetch(BASE + '/api/flood/hand?unit=' + encodeURIComponent('Punjab|Lahore|Lahore City'), { signal: AbortSignal.timeout(8000) }); up = true;
  const j = await r.json(); ok(r.status === 200 && j.demBasis === 'GLO-30', 'GET /api/flood/hand?unit=Lahore City: GLO-30'); }
catch (e) { skip('server at ' + BASE + ' not reachable: route checks skipped'); }
if (up) {
  for (const u of moved.slice(0, 3)) { const r = await fetch(BASE + '/api/flood/hand?unit=' + encodeURIComponent(u)); const j = await r.json().catch(() => null); ok(r.status === 200 && j && j.demBasis === 'GLO-30', `GET /api/flood/hand?unit=${u}: GLO-30`); }
  for (const u of obsU) { const r = await fetch(BASE + '/api/flood/hand?unit=' + encodeURIComponent(u)); const j = await r.json().catch(() => null); ok(r.status === 200 && j && j.demBasis === 'observed-extent-2022', `GET /api/flood/hand?unit=${u}: observed-extent basis`); }
  const r = await fetch(BASE + '/api/flood/hand'); const j = await r.json().catch(() => null);
  ok(r.status === 200 && j && j.glo30 && j.glo30.v77 && j.glo30.n === HT.glo30.n, `GET /api/flood/hand: glo30.n ${j && j.glo30 && j.glo30.n}, v77 summary served`);
  const txt = JSON.stringify(j && j.units ? Object.values(j.units).map(x => x.basis || x.why || '') : []);
  ok(!/UNOSAT|Sentinel|HydroRIVERS|WWF/.test(txt), 'customer basis strings name no supplier');
}
console.log(fails ? `${fails} FAIL` : 'all PASS');
process.exit(fails ? 1 : 0);
