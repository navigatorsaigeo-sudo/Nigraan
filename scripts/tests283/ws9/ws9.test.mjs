/* v283 · WS9 river flood extent + river-flow calibration · unit tests (no server, no network).
     node scripts/tests283/ws9/ws9.test.mjs
   F* tests fail on the v91.17.282.1 base (the modules and tables do not exist there) and pass here.
   G* tests check the gates: a product whose held-out test did not pass is shipped OFF ('not available' with the reason), never drawn.
   S* tests force the extent model 'served' in a temp copy (never in data/) to exercise the serving path end to end. */
import { readFileSync, mkdtempSync, writeFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
let P = 0, F = 0; const ok = (c, n, d = '') => { if (c) { P++; console.log('PASS ' + n); } else { F++; console.log('FAIL ' + n + ' :: ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400)); } };
const tryImport = async (f) => { try { return await import(join(ROOT, f)); } catch (e) { return { __err: String(e) }; } };
const J = (f) => { try { return JSON.parse(readFileSync(join(ROOT, f), 'utf8')); } catch { return null; } };
const INTERNAL = /\bFFD\b|\bPMD\b|Flood Forecasting Division|Pakistan Meteorological|IRSA|WAPDA/i;

/* ── F1 · GloFAS correction per gauge, fitted and held-out tested ── */
const GC = J('data/flood-glofascal/glofascal.json');
ok(!!GC && GC.reaches && Object.keys(GC.reaches).length >= 15, 'F1a per-gauge calibration table exists (base: none)', GC && Object.keys(GC.reaches || {}).length);
{
  let bad = [];
  for (const [k, v] of Object.entries((GC && GC.reaches) || {})) {
    if (v.served) {
      const f = v.served, g = v.gate[f];
      if (!g.passes || !(v.heldOut[f].mae < v.heldOut.raw.mae) || !(g.maeGain[1] > 0) || Math.abs(v.heldOut[f].bias) > Math.abs(v.heldOut.raw.bias)) bad.push(k);
    } else if (!(v.gate.QM.why.length && v.gate.LLS.why.length)) bad.push(k + ' (not served without a reason)');
  }
  ok(GC && bad.length === 0, 'F1b a gauge carries a correction only when its held-out gate passed; every other gauge names why', bad);
  ok(GC && GC.summary.servedPooled.cal.mae < GC.summary.servedPooled.raw.mae, 'F1c served gauges: held-out MAE below raw', GC && GC.summary.servedPooled);
}
const { createGlofasCal, __err: e1 } = await tryImport('server/api/glofascal.mjs');
ok(!e1 && typeof createGlofasCal === 'function', 'F1d server/api/glofascal.mjs loads (base: missing)', e1);
if (createGlofasCal && GC) {
  const C = createGlofasCal(join(ROOT, 'data'));
  const servedId = Object.keys(GC.reaches).find((k) => GC.reaches[k].served === 'LLS'), qmId = Object.keys(GC.reaches).find((k) => GC.reaches[k].served === 'QM');
  const offId = Object.keys(GC.reaches).find((k) => !GC.reaches[k].served);
  /* v283.10: the served-frame refit serves LLS at every passing gauge; the QM path is then exercised on a temp copy where one gauge is set to QM */
  let CQ = C, qmTmp = null;
  if (!qmId) { qmTmp = mkdtempSync(join(tmpdir(), 'ws9qm-')); const T = JSON.parse(JSON.stringify(GC)); T.reaches[servedId].served = 'QM';
    cpSync(join(ROOT, 'data', 'flood-glofascal'), join(qmTmp, 'flood-glofascal'), { recursive: true }); writeFileSync(join(qmTmp, 'flood-glofascal', 'glofascal.json'), JSON.stringify(T)); CQ = createGlofasCal(qmTmp); }
  const a = C.correct(servedId, 5000, '2026-08-15'), b = CQ.correct(qmId || servedId, 5000, '2026-08-15'), c = C.correct(offId, 5000, '2026-08-15'), d = C.correct(servedId, 5000, '2026-01-15');
  if (qmTmp) rmSync(qmTmp, { recursive: true, force: true });
  ok(a.value > 0 && a.form === 'LLS' && b.value > 0 && b.form === 'QM', 'F1e LLS and QM forms apply (thousand cusecs)', [a, b]);
  ok(c.value === null && /held-out/.test(c.why), 'F1f a gauge whose correction failed returns no value, with the reason', c);
  ok(d.value === null && /months/.test(d.why), 'F1g outside the fitted months: no value', d);
  const days = Array.from({ length: 6 }, (_, j) => ({ date: '2026-08-' + String(10 + j).padStart(2, '0'), q: [4000 + j, 5000 + j, 6000 + j] }));
  const ge = C.gaugeEquivalent(servedId, days);
  const L = GC.reaches[servedId].fit.lagDays;
  ok(ge && ge.ready && ge.days.length === 6 && ge.days[0].range.length === 2 && (L > 0 ? ge.days[5].kcusecs === null : true), 'F1h gauge-equivalent per forecast day with the fitted lag and the ensemble range', ge);
  ok(!INTERNAL.test(JSON.stringify(C.status())), 'F1i no internal source named in the status', null);
  process.env.NIGRAAN_GLOFASCAL = '0'; ok(C.correct(servedId, 5000, '2026-08-15').value === null, 'F1j switch NIGRAAN_GLOFASCAL=0 turns it off'); delete process.env.NIGRAAN_GLOFASCAL;
}

/* ── F2 / G2 · flood extent model, evidence, gate ── */
const FX = J('data/flood-extent/fx-model.json');
ok(!!FX && FX.productType === 'Indicative' && FX.test2025 && FX.csiGain2025 && FX.train.join() === '2010,2014,2022' && FX.heldOut === 2025, 'F2a extent model with held-out 2025 evidence (base: none)', FX && Object.keys(FX));
if (FX) {
  const m = FX.models[FX.chosen], g = FX.csiGain2025.vsB0;
  const g2 = FX.csiGain2025.vsB2; const shouldServe = m.b > 0 && g[1] > 0 && FX.test2025[FX.chosen].csi > FX.test2025.B1.csi && (!Array.isArray(g2) || g2[1] > 0);
  ok(FX.served === shouldServe, 'G2a served flag equals the gate recomputed from the evidence (slope > 0, CSI gain lower bound > 0 over fixed height and, when installed, the return-period map; beats per-reach fixed height)', { served: FX.served, g, b: m.b });
  ok(FX.domainKm > 0 && FX.domainKm < FX.flooredShareByKm.length, 'G2b river-flood domain distance comes from the data (excess flooded share), not typed', FX.domainKm);
  ok(Object.values(FX.reaches).every((r) => r.areaLookup.km2.every((v, i, a) => i === 0 || v >= a[i - 1])), 'G2c per-reach area lookup rises with water height');
  ok(['balloki', 'sidhnai', 'trimmu'].every((r) => FX.withheldReaches.includes(r)), 'G2d reaches the river model does not represent are excluded from fit and test', FX.withheldReaches);
}
const { createFloodExtent, __err: e2 } = await tryImport('server/api/floodextent.mjs');
ok(!e2 && typeof createFloodExtent === 'function', 'F2b server/api/floodextent.mjs loads (base: missing)', e2);

const mkApp = (ageH, qScale = 1) => ({ flood: { forecastDays: (id) => ({ at: new Date(Date.now() - ageH * 3600e3).toISOString(), days: Array.from({ length: 30 }, (_, j) => ({ date: '2026-08-' + String(1 + j).padStart(2, '0'), q: [0.6, 1, 1.8].map((f) => f * qScale * ((FX && FX.reaches[id] && FX.reaches[id].q2) || 1000)) })) }) } });
if (createFloodExtent && FX) {
  const X = createFloodExtent(mkApp(2), join(ROOT, 'data'));
  if (!FX.served) {
    const n = X.national(0), t = X.tile(0, 8, 180, 107), p = X.point(27.7, 68.86, 0);
    ok(n.ready === false && n.status === 'not available' && /did not pass/.test(n.why), 'G2e extent not served: national answer is "not available" with the reason, never an empty (dry) map', n);
    ok(t.status === 503 && p.ready === false, 'G2f tiles and point answers withheld too', [t.status, p]);
    ok(!INTERNAL.test(JSON.stringify(n)), 'G2g no internal source named');
  }
  X.close();
  /* S · serving path on a temp copy with served forced on */
  const T = mkdtempSync(join(tmpdir(), 'ws9fx-'));
  try {
    cpSync(join(ROOT, 'data/flood-extent'), join(T, 'flood-extent'), { recursive: true });
    cpSync(join(ROOT, 'data/river-rarity.json'), join(T, 'river-rarity.json'));
    const M2 = JSON.parse(readFileSync(join(T, 'flood-extent/fx-model.json'), 'utf8')); M2.served = true; M2.why = [];
    writeFileSync(join(T, 'flood-extent/fx-model.json'), JSON.stringify(M2));
    const S = createFloodExtent(mkApp(2, 3), T);
    const n = S.national(0);
    ok(n.ready && n.productType === 'Indicative' && n.drawnReaches > 5 && n.floodedKm2.likely <= n.floodedKm2.expected && n.floodedKm2.expected <= n.floodedKm2.possible, 'S1 national: Indicative, band likely <= expected <= possible (km2)', n.floodedKm2);
    ok(n.reaches.trimmu && /does not represent/.test(n.reaches.trimmu.why || ''), 'S2 a reach the river model does not represent is not drawn, with the reason', n.reaches.trimmu);
    ok(!INTERNAL.test(JSON.stringify(n)) && /Not an official flood warning/.test(n.disclaimer), 'S3 client text: no internal source named, not-a-warning stated');
    const far = S.point(29.0, 64.0, 0);
    ok(far.ready && far.status === 'not assessed' && /does not mean dry/.test(far.why), 'S4 outside the river domain: "not assessed", never "dry"', far);
    const near = S.point(27.70, 68.86, 0);   /* Indus at Sukkur */
    ok(near.ready && (near.status === 'not assessed' || (near.reach && Array.isArray(near.waterAboveRiverM) && near.class >= 0)), 'S5 point on the Indus at Sukkur answers with reach, heights and class', near);
    const t = S.tile(0, 8, 176, 108);   /* Sukkur area at zoom 8 */
    const png = t.body;
    ok(t.status === 200 && t.type === 'image/png' && Buffer.isBuffer(png) && png.slice(1, 4).toString() === 'PNG', 'S6 tile is a PNG', t.status);
    if (t.status === 200) {
      const idat = []; let o = 8, w = 0; while (o < png.length) { const len = png.readUInt32BE(o), type = png.toString('latin1', o + 4, o + 8); if (type === 'IHDR') w = png.readUInt32BE(o + 8); if (type === 'IDAT') idat.push(png.slice(o + 8, o + 8 + len)); o += 12 + len; }
      const raw = inflateSync(Buffer.concat(idat)); let drawn = 0; for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if (raw[y * 257 + 1 + x]) drawn++;
      ok(w === 256 && raw.length === 256 * 257 && drawn > 0, 'S7 the Sukkur tile draws flooded cells at 3x the 2-year flow', { w, drawn });
    }
    const S2 = createFloodExtent(mkApp(40, 3), T); const st = S2.national(0);
    ok(st.ready && st.drawnReaches === 0 && Object.values(st.reaches).some((r) => /h old/.test(r.why || '')), 'S8 a river forecast older than 30 h draws nothing (withheld with its age)', st.staleReaches);
    const lo = createFloodExtent(mkApp(2, 0.3), T).national(0);
    ok(lo.floodedKm2.expected < n.floodedKm2.expected, 'S9 less flow, less water (monotone in flow)', [lo.floodedKm2, n.floodedKm2]);
    const bad = S.route('/api/flood/extent', new URL('http://x/api/flood/extent?day=99'));
    ok(bad.status === 400, 'S10 day outside 0-30 is a 400', bad);
    S.close(); S2.close();
  } finally { rmSync(T, { recursive: true, force: true }); }
}
console.log(`\nws9: ${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
