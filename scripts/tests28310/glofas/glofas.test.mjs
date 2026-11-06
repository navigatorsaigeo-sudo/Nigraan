/* v283.10 · GloFAS series defect (glofas_irsa_daily date frame / product / cells) · unit tests (no server, no network).
     node scripts/tests28310/glofas/glofas.test.mjs
   G1* the evidence: date-frame lags and the 2024+ product splice are recorded (data/evidence/glofas28310).
   G2* the refit: data/flood-glofascal/glofascal.json is fitted in the served frame; the server refuses a table fitted in another frame.
   G3* the river flood chance stays withheld: no threshold passed the pre-registered rule (BSS vs persistence lower 95 % bound > 0
       in every held-out monsoon). */
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
let P = 0, F = 0; const ok = (c, n, d = '') => { if (c) { P++; console.log('PASS ' + n); } else { F++; console.log('FAIL ' + n + ' :: ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400)); } };
const J = (f) => { try { return JSON.parse(readFileSync(join(ROOT, f), 'utf8')); } catch { return null; } };

/* G1 evidence */
const LG = J('data/evidence/glofas28310/lags.json');
ok(!!LG, 'G1a lag evidence present');
if (LG) {
  const s = LG.summary.file_vs_servedPKT;
  const share = (p, L) => (s[p] && s[p][String(L)] || 0) / (s[p] ? s[p].n : 1);
  ok(share('1997-2022', 1) >= 0.8, 'G1b station file vs served frame: +1 d in the reanalysis years (R1 >= 80 % of gauge-years)', s['1997-2022']);
  ok(share('2024-2026', 2) >= 0.8, 'G1c station file vs served frame: +2 d from 2024 (forecast splice; R1 >= 80 %)', s['2024-2026']);
  const c = LG.summary['file_vs_consolidated_v4_GMT'];
  ok(!c || (c['2024-2026'] && (c['2024-2026']['0'] || 0) / c['2024-2026'].n >= 0.8), 'G1d station file = provider reanalysis at lag 0 while both exist (same product, same labels)', c && c['2024-2026']);
}
const PR = readFileSync(join(ROOT, 'scripts/tests28310/glofas/PASS_RULES.txt'), 'utf8');
ok(/R2/.test(PR) && /R3/.test(PR), 'G1e pass rules recorded');

/* G2 refit + server frame guard */
const GC = J('data/flood-glofascal/glofascal.json');
ok(GC && GC.modelFrame === 'provider-api-gmt' && /283\.10/.test(GC.version), 'G2a glofascal fitted in the served frame', GC && [GC.version, GC.modelFrame]);
ok(GC && Object.values(GC.reaches).every((v) => v.vsPersistence && v.vsPersistence.n > 0), 'G2b every gauge reports its held-out skill vs persistence');
ok(GC && Object.values(GC.reaches).every((v) => v.fit.lagDays >= -2 && v.fit.lagDays <= 2), 'G2c fitted lags inside the served-frame window -2..+2 (GMT frame, part 3)');
ok(GC && Object.entries(GC.reaches).every(([k, v]) => !v.served || (v.gate[v.served].passes)), 'G2d a gauge serves only a form whose held-out gate passed');
ok(GC && GC.productType === 'Internal calibration', 'G2e still internal (operator only)');
const { createGlofasCal } = await import(join(ROOT, 'server/api/glofascal.mjs'));
{
  const id = Object.keys(GC.reaches).find((k) => GC.reaches[k].served);
  const C = createGlofasCal(join(ROOT, 'data'));
  const days = Array.from({ length: 10 }, (_, j) => ({ date: '2026-08-' + String(10 + j), q: [3000, 3500, 4000] }));
  const eq = C.gaugeEquivalent(id, days);
  ok(eq && eq.ready && eq.lagDays === GC.reaches[id].fit.lagDays && eq.days.some((d) => d.kcusecs != null), 'G2f served-frame table is used', eq && eq.why);
  const d = mkdtempSync(join(tmpdir(), 'gc28310-')); mkdirSync(join(d, 'flood-glofascal'));
  const old = { ...GC }; delete old.modelFrame; old.version = 'glofascal-283.1';
  writeFileSync(join(d, 'flood-glofascal', 'glofascal.json'), JSON.stringify(old));
  const C2 = createGlofasCal(d);
  const st = C2.status(), e2 = C2.gaugeEquivalent(id, days), c2 = C2.correct(id, 3000, '2026-08-10');
  ok(st.ready === false && /date frame/.test(st.why) && e2 && e2.ready === false && c2.value === null, 'G2g a table fitted on the station-file frame is refused', [st, e2, c2]);
  rmSync(d, { recursive: true, force: true });
}

/* G3 river flood chance */
const RS = J('data/evidence/glofas28310/riverprob_rescore.json');
ok(!!RS, 'G3a river chance re-score present');
if (RS) {
  const anyPass = Object.values(RS).some((v) => Object.values(v.passR3).some(Boolean));
  const M = J('data/river-prob-model.json');
  ok(!anyPass, 'G3b no threshold beats persistence on held-out monsoons (rule R3), in any pairing', Object.fromEntries(Object.entries(RS).map(([k, v]) => [k, v.passR3])));
  ok(M && M.version === 'river-prob-91.17.105', 'G3c served river-prob-model.json unchanged (stays withheld for clients)', M && M.version);
  const s = RS.servedPairing_lag0.byMonsoon;
  ok(Math.abs(s['2024']['Low or higher'].bss - (-2.044)) < 0.01 && Math.abs(s['2025']['Medium or higher'].bss - (-0.75)) < 0.01, 'G3d re-score reproduces the stored BSS vs persistence (same frame, same pairs)');
}
const IDX = readFileSync(join(ROOT, 'server/api/index.mjs'), 'utf8');
ok(/RIVER_CHANCE_WITHHELD/.test(IDX) && /customerView\(req\)\) return send\(res, 200, \{ ready: false, withheld: true/.test(IDX), 'G3e the client river chance layer is still withheld');

/* G4 part 2: live date frame, relabel rule R4, refits R5 */
const LF = J('data/evidence/glofas28310/live_frame.json');
ok(LF && LF.byTz['Asia/Karachi'].modalLag === 2 && LF.byTz['Asia/Karachi'].established && LF.byTz.GMT.modalLag === 1, 'G4a live forecast path: the row shown as day D holds the UTC mean of D-2 (R4a established)', LF && [LF.byTz['Asia/Karachi'].modalLag, LF.byTz['Asia/Karachi'].share]);
const RL = J('data/evidence/glofas28310/relabel_levels.json');
ok(RL && RL.R4b && RL.R4b.passes === false && RL.R4b.failing.length > 0, 'G4b relabel failed its pre-registered gauge-truth rule (R4b): not shipped', RL && RL.R4b);
const FL = readFileSync(join(ROOT, 'server/api/flood.mjs'), 'utf8'), LM = readFileSync(join(ROOT, 'server/api/limits.mjs'), 'utf8');
ok(!/timezone: 'Asia\/Karachi'/.test(FL.split('runForecast')[2] || '') && /timezone: RIVER_TZ/.test(FL) && /timezone: RIVER_TZ/.test(LM), 'G4c the part-2 relabel (day D = UTC mean of D) was not shipped; part 3 ships the R7 frame instead (G5)');
const RC = J('data/river-cal.json'), RCB = readFileSync(join(ROOT, 'scripts/rivercal/rivercal_build.py'), 'utf8');
const CMP = J('data/evidence/glofas28310/refit_compare.json');
ok(CMP && CMP.decision.rivercalFlowAdopt === false && CMP.decision.rivercalStaleAdopt === false && RC.version === 'rcal-91.17.274', 'G4d rivercal flow refit not adopted (R5): the current flow table stays (stale ages: G5)', CMP && CMP.decision);
ok(/RIVERCAL_WRITE/.test(RCB), 'G4e a rivercal rebuild writes a candidate, not the served table, unless told to');
ok(CMP && CMP.decision.fxAdopt === true && J('data/flood-extent/fx-model.json').served === false, 'G4f flood-extent scripts read the served series (R5 no worse); the extent stays unserved');

/* G5 part 3: gauge pairing (R6/R7), served GMT frame, stale-sheet re-gate (R8) */
const GP = J('data/evidence/glofas28310/gauge_pairing.json');
ok(GP && GP.R6.established && GP.R6.picked === 'G-1', 'G5a the 06:00 PKT sheet of day G pairs with the UTC mean of G-1 (R6)', GP && GP.R6.pooled);
ok(GP && GP.R7.passes && GP.R7.pooled.diffNewMinusCurrent[0] <= 0 && GP.R7.pooled.diffNewMinusCurrent[2] <= 0.002 && GP.R7.worseCiSeparated.length === 0, 'G5b relabel day D -> UTC mean of D-1 passes R7', GP && GP.R7.pooled);
const fl = await import(join(ROOT, 'server/api/flood.mjs'));
ok(fl.RIVER_TZ === 'GMT' && /D-1/.test(fl.RIVER_DATE_FRAME.clientDayD) && /D-2/.test(fl.RIVER_DATE_FRAME.before), 'G5c the river forecast is requested in GMT and the operator note documents the old 2-day offset');
const dd = fl.riverDaysFromToday({ time: ['2026-10-22', '2026-10-23', '2026-10-24'], river_discharge: [1, 2, 3], river_discharge_member01: [4, 5, 6] }, '2026-10-23');
ok(dd.time[0] === '2026-10-23' && dd.river_discharge[0] === 2 && dd.river_discharge_member01[0] === 5 && dd.time.length === 2, 'G5d rows before the Pakistan date are dropped alike in every array (day 0 = today)', dd);
const SG = J('data/evidence/glofas28310/stale_gate.json');
const ages = Object.fromEntries(Object.entries(RC.reaches).filter(([, v]) => v.staleSheet && v.staleSheet.switchAgeDays != null).map(([k, v]) => [k, v.staleSheet.switchAgeDays]));
ok(SG && SG.reproducesShipped && ages.khanki === 9 && ages.sulemanki === 7 && ages.marala === 8 && ages.qadirabad === 8, 'G5e stale switch re-gated on the served level: Khanki 8 -> 9, Sulemanki 6 -> 7, Marala and Qadirabad 8 kept (R8)', ages);
const RCM = (await import(join(ROOT, 'server/api/rivercal.mjs'))).createRiverCal(join(ROOT, 'data'));
ok(RCM.switchAgeDays('khanki') === 9 && RCM.switchAgeDays('sulemanki') === 7, 'G5f the gauge panel reads the new ages');

console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
