/* v91.17.39 · HAND: WHERE A RIVER'S WATER SPREADS ═══════════════════════════
   Height Above Nearest Drainage per tehsil, from the Copernicus GLO-90 DEM at 6 arc-seconds
   (station-lake/scripts/hand.py), as the share of each tehsil's area within the low bands
   above the MAJOR drainage (more than 30,000 upstream cells, about 970 km²: the rivers GloFAS
   models). The LOCAL network (small rivers and drains) is kept for the pluvial "where water
   collects" but is not applied to any score yet.

   The riverine pathway used to give every tehsil of a gauged district the same score: Gujar
   Khan (1% of its area within 5 m of a major river) scored like Muzaffargarh (42%). The reach
   exceedance says how big the river is; HAND says how much of the unit that river can reach.
   The "where" factor is
       s = lt2 + b2_5 + 0.5·b5_10           the floodplain share (major network)
       w = FLOOR + (1 − FLOOR) · min(1, s / FULL)
   with FLOOR 0.3 (a river in flood still matters where the floodplain is narrow: towns sit on
   the bank) and FULL 0.5 (half the unit within reach counts as fully exposed). Both are
   screening constants, not calibrated; the calibration is Sentinel-1 flood extents of 2022 and
   2025 against the bands, which has not been run. NIGRAAN_HAND=0 withholds the factor.

   Units outside the 66–75 E / 23.5–35 N domain, or with less than half their polygon inside
   it, get no factor (1, with the reason printed): GB, AJK, western Balochistan. HAND is not a
   depth, not a probability and not a levee map.

   v91.17.70 · THE 92 SCORED UNITS OUTSIDE THAT DOMAIN NOW HAVE HAND (hand.py --extend): the same GLO-90 6" D8 method on
   three more domains, north 70–78 E / 33–37.5 N (GB, Chitral, Kohistan, Swat, Dir, Neelum), east 73.5–77 E / 31–33.5 N
   (Shakargarh, Zafarwal) and west 60.5–67.5 E / 24–30.5 N (Makran, Kech, Panjgur, Washuk, Kharan, Gwadar, Lasbela).
   Each extended record names its `grid`; the file header carries the Copernicus DEM licence and the extension provenance.
   567 of 576 scored units now carry a riverine factor [measured]; the other 9 have a record but no major river
   (7 Karachi towns and Keti Bunder drain to the sea, Tomulk and Shaogari into the Kharan / Mashkel closed basin).

   v91.17.77 · THE FLAT-PLAINS UNITS v75 LEFT ON GLO-90 (station-lake/scripts/terrain30_hand3.py, agent H): HydroRIVERS lines
   burned into the 30 m DSM, Priority-Flood + epsilon, D8, HAND; a unit moves to GLO-30 only when >= 60 % of its pixels get a
   value and its pixel AUC against the riverine flood extents is sensible and not below GLO-90 (hand-tehsil.json glo30v77).
   Kasur, Khairpur and Kingri moved; Kharo Chan (delta) is served on its 2022 observed flooded share (basis
   'observed-extent-2022', below); every unit still on GLO-90 carries its reason in keptGlo90, served as glo90Reason. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const HAND_FLOOR = 0.3, HAND_FULL = 0.5, MIN_COVERAGE = 0.5;
/* v91.17.49 · CALIBRATED AGAINST THE 2022 AND 2010 FLOOD EXTENTS (station-lake/scripts/flood_extent_calibration.py,
   UNOSAT Sentinel-1 / Landsat-8 / Sentinel-2 / VIIRS / MODIS polygons on this grid). Measured share of each HAND band
   under water in 2022 inside the high-resolution domain: < 2 m 27.5 %, 2–5 m 23.4 %, 5–10 m 18.2 %, 10–20 m 9.9 %,
   > 20 m 0.8 %. The band weights are those rates relative to the floodplain; the 10–20 m band, weight 0 before, is
   in. Nationally (VIIRS, 458 tehsils) the floodplain share ranks the flooded share at Spearman 0.79 (in-sample; 0.45 held out on 2025, v91.17.101). TWI ≥ 10 ground
   flooded at 19–24 % against 1–2 % for TWI 8–10 and ~0 below: the pluvial "where" is applied as an amplifier
   (never a deflator, so the mountain flash-flood units keep their score): 1 + 0.3 · min(1, share(TWI ≥ 10) / 0.5). */
const DEFAULT_WEIGHTS = null;   /* v283.36 · launch item 16 · no default band weights: without data/flood-extent-calibration.json there is no floodplain share (fail closed) */
export const PLUVIAL_UPLIFT_MAX = 0.3, PLUVIAL_TWI_FULL = 0.5;

export function createHand(dataDir, units) {
  const file = join(dataDir, 'hand-tehsil.json');
  let D = null, err = null;
  try { if (existsSync(file)) D = JSON.parse(readFileSync(file, 'utf8')); else err = 'data/hand-tehsil.json is not in this install (LEARN_NIGRAAN.bat hand builds it from the GLO-90 tiles)'; }
  catch (e) { err = e.message; }
  let CAL = null; try { const cf = join(dataDir, 'flood-extent-calibration.json'); if (existsSync(cf)) CAL = JSON.parse(readFileSync(cf, 'utf8')); } catch {}
  /* v91.17.101 · registry flood-hand-weights (L1/L2/L4): the weights were fitted on 2022 and the 0.79 quoted on 2022. They are now
     refitted on the 2010 and 2014 national extents and tested on 2025 (station-lake/scripts/hand_weights_split.py): held-out Spearman
     0.45 against 0.45 for the 2022 weights and 0.44 for the uncalibrated default: the floodplain share ranks a flood year it never
     saw at about 0.45, and the band weights barely change that. Served: the held-out weights, for both grids (the ratio form only
     reorders units). The observed-2022 'where' basis (an outcome used as a predictor) is withdrawn. */
  const HO = CAL && CAL.bandWeightsHeldOut ? { lt2: CAL.bandWeightsHeldOut.lt2, b2_5: CAL.bandWeightsHeldOut.b2_5, b5_10: CAL.bandWeightsHeldOut.b5_10, b10_20: CAL.bandWeightsHeldOut.b10_20 || 0 } : null;
  const WEIGHTS = HO ? HO : (CAL && CAL.bandWeights) ? { lt2: CAL.bandWeights.lt2, b2_5: CAL.bandWeights.b2_5, b5_10: CAL.bandWeights.b5_10, b10_20: CAL.bandWeights.b10_20 || 0 } : DEFAULT_WEIGHTS;
  const calibrated = !!(CAL && CAL.bandWeights);
  /* v91.17.75 · 30 m weights: every Pakistan-administered unit now carries GLO-30 HAND (terrain30_hand2.py, basin-chunked). The 2022
     flood rates by band were re-measured on the 30 m bands at 1 arc-second (flood-extent-calibration.json glo30, bandWeights30);
     a GLO-30 record is weighted with them, a GLO-90 record (the disputed unit, units the run kept) with the 180 m weights. */
  const W30 = HO ? HO : (CAL && CAL.bandWeights30) ? { lt2: CAL.bandWeights30.lt2, b2_5: CAL.bandWeights30.b2_5, b5_10: CAL.bandWeights30.b5_10, b10_20: CAL.bandWeights30.b10_20 || 0 } : null;
  const weightsOf = (r) => (r && r.basis === 'GLO-30' && W30) ? W30 : WEIGHTS;
  const on = () => process.env.NIGRAAN_HAND !== '0' && !!(D && D.units);
  const keyOf = new Map(); for (const u of (units && units.tehsil) || []) keyOf.set(u.unitId, u.key);

  function of(unitId) {
    if (!on()) return null;
    const r = D.units[unitId]; if (!r) return null;
    /* v91.17.72 · priority units carried 30 m HAND (terrain30_hand.py); v91.17.75 · every Pakistan-administered unit the national run could
       hold (terrain30_hand2.py, 554 of 576) carries basis 'GLO-30'; the rest keep their GLO-90 record (hand-tehsil.json glo30.keptGlo90) */
    const gridTxt = r.basis === 'GLO-30' ? 'GLO-30 30 m' : 'GLO-90 180 m', basisOf = r.basis || 'GLO-90';
    const twi = r.twi ? { median: r.twi.median, p90: r.twi.p90, shareOver8: r.twi.shareOver8, shareOver10: r.twi.shareOver10 } : null;
    /* v91.17.44 · the pluvial "where": converging flats and hollows (TWI ≥ 10) and ground within 2 m of the local drains.
       Served as context (the report and the AI say where water collects); not a multiplier on the pluvial score, which the
       Sentinel-1 calibration has to earn first. */
    const pf = (calibrated && twi) ? Math.round(1000 * (1 + PLUVIAL_UPLIFT_MAX * Math.min(1, twi.shareOver10 / PLUVIAL_TWI_FULL))) / 1000 : null;
    const where = (twi || r.local) ? { twiShareOver8: twi ? twi.shareOver8 : null, twiShareOver10: twi ? twi.shareOver10 : null, localLt2: r.local ? r.local.lt2 : null,
      pluvialFactor: pf, applied: pf != null,
      text: (twi ? Math.round(100 * twi.shareOver10) + '% of the unit is converging flats and hollows (topographic wetness index, TWI ≥ 10)' : '') + (r.local ? (twi ? ', ' : '') + Math.round(100 * r.local.lt2) + '% within 2 m above the local drains' : '') + ' (' + (r.basis === 'GLO-30' ? 'TWI on GLO-90 180 m, drains on GLO-30 30 m' : gridTxt) + '; where rain collects, not a depth)' + (pf != null ? '; pluvial ×' + pf.toFixed(2) + ' (TWI ≥ 10 ground flooded at 19–24% in 2022 against under 2% elsewhere)' : '') } : null;
    /* v91.17.77 · delta units without a usable GLO-30 HAND (terrain30_hand3.py): the 2022 observed flooded share is the 'where'
       record (basis 'observed-extent-2022'); s = floodedShare / P(flooded | 30 m HAND < 2 m, 2022), the calibration's own ratio,
       then the same floor / fullShare curve. Flagged as an observed-extent basis, one event, not a terrain measure. */
    if (r.basis === 'observed-extent-2022') return { unitId, key: keyOf.get(unitId) || null, coverage: r.coverage ?? null, factor: 1, twi, where, observedBasis: true,
      why: 'terrain height above the river could not be measured in this delta unit; the 2022 flooded share is not used as a predictor of flooding (v91.17.101), so no factor is applied' };
    if (!r.major) return { unitId, key: keyOf.get(unitId) || null, coverage: r.coverage ?? null, factor: 1, local: r.local ? { lt2: r.local.lt2, b2_5: r.local.b2_5, medianM: r.local.medianM } : null, twi, where, glo90Reason: r.keptGlo90 || undefined, why: 'the unit does not drain through a major river (over about 970 km² upstream): coastal Karachi and the delta creeks drain to the sea; no riverine factor applied' };
    if (r.coverage != null && r.coverage < MIN_COVERAGE) return { unitId, key: keyOf.get(unitId) || null, coverage: r.coverage, factor: 1, twi, where, why: 'only ' + Math.round(r.coverage * 100) + '% of the unit is inside the HAND domain; no factor applied' };
    if (!weightsOf(r)) return { unitId, key: keyOf.get(unitId) || null, coverage: r.coverage ?? null, factor: null, floodplainShare: null, twi, where, notAvailable: true, why: 'not available: the HAND band weights (data/flood-extent-calibration.json) are not in this install' };
    const Wt = weightsOf(r), m = r.major, s = Math.min(1, Wt.lt2 * m.lt2 + Wt.b2_5 * m.b2_5 + Wt.b5_10 * m.b5_10 + Wt.b10_20 * (m.b10_20 || 0));
    const w = Math.round(1000 * (HAND_FLOOR + (1 - HAND_FLOOR) * Math.min(1, s / HAND_FULL))) / 1000;
    return { unitId, key: keyOf.get(unitId) || null, coverage: r.coverage ?? null, km2: r.km2, network: 'major', demBasis: basisOf, glo90Reason: r.basis === 'GLO-30' ? undefined : (r.keptGlo90 || undefined), glo90: r.glo90 && r.glo90.major ? { lt2: r.glo90.major.lt2, b2_5: r.glo90.major.b2_5, b5_10: r.glo90.major.b5_10, medianM: r.glo90.major.medianM } : undefined, bands: { lt2: m.lt2, b2_5: m.b2_5, b5_10: m.b5_10, gt10: m.gt10 }, medianM: m.medianM,
      local: r.local ? { lt2: r.local.lt2, b2_5: r.local.b2_5, medianM: r.local.medianM } : null, twi, where,
      floodplainShare: Math.round(s * 1000) / 1000, factor: w,
      weights: Wt, weightsBasis: HO ? 'band rates of the 2010 and 2014 flood extents, tested on 2025 (bandWeightsHeldOut; held-out Spearman ' + ((CAL.bandWeightsHeldOut.test2025 || {}).spearman ?? 'n/a') + ')' : Wt === W30 ? 'GLO-30 2022 band rates (bandWeights30)' : 'GLO-90 2022 band rates (bandWeights)', calibrated,
      basis: Math.round(100 * (m.lt2 + m.b2_5)) + '% of the unit within 5 m above the major rivers, ' + Math.round(100 * m.b5_10) + '% at 5–10 m' + (m.b10_20 != null ? ', ' + Math.round(100 * m.b10_20) + '% at 10–20 m' : '') + ' (HAND, ' + gridTxt + (calibrated ? (HO ? ', bands weighted by their 2010 and 2014 flood rates (tested on 2025)' : ', bands weighted by their 2022 flood rates' + (Wt === W30 ? ' on 30 m' : '')) : '')   /* v91.17.153 · the sentence names the weights actually used */ + ') → riverine ×' + w.toFixed(2) };
  }
  function national() {
    if (!on()) return { ready: false, why: process.env.NIGRAAN_HAND === '0' ? 'withheld by NIGRAAN_HAND=0' : err || 'no HAND table' };
    const out = {}; let n = 0, over30 = 0, floored = 0, partial = 0;
    for (const uid of Object.keys(D.units)) { const h = of(uid); if (!h) continue; n++; if (h.why) { partial++; } else if (h.bands) { if (h.bands.lt2 > 0.3) over30++; if (h.factor <= HAND_FLOOR + 1e-9) floored++; } out[h.key || uid] = h; }
    return { ready: true, built: D.built, file: statSync(file).mtime.toISOString(), domain: D.domain, glo30: D.glo30 ? { built: D.glo30.built, n: D.glo30.n, method: D.glo30.method, caveat: D.glo30.caveat, fallbackShareMedian: D.glo30.fallbackShareMedian || null, v77: D.glo30v77 ? { built: D.glo30v77.built, moved: D.glo30v77.moved, observedExtent: D.glo30v77.observedExtent, stillGlo90: D.glo30v77.stillGlo90 ? Object.keys(D.glo30v77.stillGlo90).length : 0, groupAuc: D.glo30v77.groupAuc, recalibration: D.glo30v77.recalibration } : null, keptGlo90: D.glo30.keptGlo90 ? Object.keys(D.glo30.keptGlo90).length : null, calibration30: CAL && CAL.glo30 ? { pixelAuc: CAL.glo30.pixelAuc, tehsilSkill: CAL.glo30.tehsilSkill, bandWeights: CAL.glo30.bandWeights } : null } : null, extensions: D.extensions ? Object.fromEntries(Object.entries(D.extensions).map(([k, v]) => [k, { domain: v.domain, built: v.built, n: v.n }])) : null, licence: D.licence || null, attribution: D.attribution || null, gridArcsec: D.gridArcsec, method: D.method, networks: D.networks, bandsMeaning: D.bands, twiMeaning: D.twi || null, caveat: D.caveat,
      pluvialWhere: calibrated ? { applied: true, formula: 'pluvial × (1 + ' + PLUVIAL_UPLIFT_MAX + ' · min(1, share(TWI ≥ 10) / ' + PLUVIAL_TWI_FULL + '))', why: 'TWI ≥ 10 ground flooded at 19–24 % in 2022 (UNOSAT extents) against 1–2 % for TWI 8–10 and under 0.5 % below; an amplifier only, so steep units keep their flash-flood score' }
                                 : { applied: false, why: 'TWI ≥ 10 share and local HAND < 2 m share are served per unit as `where` and printed as context; no flood-extent calibration table in this install' },
      calibration: CAL ? { built: CAL.built, source: CAL.source, bandWeights: CAL.bandWeights, fullShareFromData: CAL.fullShare, sets: Object.fromEntries(Object.entries(CAL.sets || {}).map(([k, v]) => [k, v.measured ? { domainKm2: v.domainKm2, floodedShare: v.floodedShare, bandRates: Object.fromEntries(Object.entries(v.bandRates || {}).map(([b, x]) => [b, x.rate])), twiRates: Object.fromEntries(Object.entries(v.twiRates || {}).map(([b, x]) => [b, x.rate])), tehsils: v.tehsils ? { n: v.tehsils.n, spearman: v.tehsils.spearmanFloodplainShare, spearmanNnls: v.tehsils.spearmanNnls } : null } : { measured: false }])) } : null,
      factor: { floor: HAND_FLOOR, fullShare: HAND_FULL, minCoverage: MIN_COVERAGE, weights: WEIGHTS, weights30: W30, calibrated, formula: 'w = floor + (1 − floor) · min(1, (w1·lt2 + w2·b2_5 + w3·b5_10 + w4·b10_20) / fullShare), major network; applied to the riverine pathway score in the browser engine' + (calibrated ? '; band weights = the 2022 flood rate of each band relative to the floodplain (UNOSAT extents); fullShare 0.5 sits between the 0.52 (2022 high-resolution) and 0.29 (2022 VIIRS national) read from the data; the floor is not identifiable from extents' : '; screening constants, uncalibrated') },
      counts: { units: n, lt2Over30pct: over30, atFloor: floored, partialCoverage: partial, notInDomain: ((units && units.tehsil) || []).length - n },
      units: out };
  }
  function status() { return on() ? { ready: true, built: D.built, units: Object.keys(D.units).length, glo30Units: D.glo30 ? D.glo30.n : 0, extended: D.extensions ? Object.values(D.extensions).reduce((a, v) => a + (v.n || 0), 0) : 0, factor: { floor: HAND_FLOOR, fullShare: HAND_FULL } } : { ready: false, why: process.env.NIGRAAN_HAND === '0' ? 'withheld by NIGRAAN_HAND=0' : err || 'no HAND table' }; }
  return { of, national, status, on };
}
