/* == v91.17.283.13 . HAZARD SCIENCE ON THE SERVER: ONE VALUE PER PLACE PER RUN ==========================================================
   The issued levels (/api/levels, /api/levels/unit, the map, the alerts, the archive) of six layers are computed here from the server's
   own inputs and replace the page engine's values in the issued record, the way areaheat.mjs does for heat (v283.12). Each layer has one
   method, written once (the functions below are pure and tested: scripts/tests28313):

     flood_riverine  a gauge's river level reaches a tehsil only along the river: data/river-link.json (scripts/v28313/build_river_link.py,
                     main-stem centre lines, gauge reaches by chainage, the national channel review as mask) replaces the district
                     inheritance (data/river-reach-units.json); the reach signal is the server's own, per day: the gauge's current measured
                     or outlook class (river-outlook.json, per-gauge age), else the reach's model-flow ladder (flood.mjs); the height above
                     the river (HAND, hand.mjs factor, band weights calibrated on the 2010 and 2014 flood extents, tested on 2025) is applied
                     to it; a tehsil with no ground in any flooded HAND band is off the floodplain and gets no river level.
     rain_hz         v283.15: lead days 1-3 read the calibrated probability (rainprob.mjs, data/rain-prob-coefs.json): the level is the highest
                     class marked tested in the coefficient file at or above its cut (none is tested: Normal), the probability a screening fact;
                     the other days: the ensemble share of members whose day rain total reaches the 24-hour rain classes of the India Meteorological
                     Department (data/hazard-scale.json rainClasses24h: moderate / heavy / very heavy / extremely heavy), valid members only, at least half
                     of the members valid; the level is the highest class at least half of the valid members reach (Low .. Severe).
                     Scored on IMERG (17 Sep - 22 Oct 2026, scripts/v28313/score_rain.mjs): no skill at any class, so every rung is
                     SCREENING (gate: no alerts until an event test passes)
     landslide       the landslide likelihood (landslideodds.mjs) inside the physical mask of data/hazard-applicability.json (share of
                     the tehsil's 30 m cells steeper than 25 deg): no tehsil-mean slope gate; the level is the model's odds band
                     (2 / 5 / 10 / 20 x an ordinary day, its held-out validation bands)
     drought         one number, one date: SPI-3 of the last complete calendar month from CHIRPS (data/drought-chirps.json; McKee et
                     al. 1993, WMO-No. 1090) placed on the US Drought Monitor SPI categories (D0 -0.5, D1 -0.8, D2 -1.3, D3 -1.6; Svoboda
                     et al. 2002); root-zone soil is a supporting fact, never averaged into the level
     nss_baseline    the 250 m NRCS curve-number table only (data/sponge-tehsil.v2.json, pixel first); its own documented classes
                     (equivalent curve number between the NRCS group-C reference covers); no table -> not assessed (never a fallback)
     nss_dynamic     the same table at the antecedent moisture condition of the 5-day model rain, not measured (NRCS NEH-4 growing-season
                     bands 36 / 53 mm); a tehsil without 5 observed days of rain is labelled missing, not filled
     nss_runoff      v283.15: the run-off depth of the 5-day model rain (v283.35: per day at its own AMC, summed) over the 250 m cells (NRCS, lambda 0.2,
                     usual wetness AMC II, built cells sealed), on the run-off bands of data/map-layer-scales.json (1 / 5 / 10 / 25 mm:
                     house bands, so SCREENING: a screening index, not a tested runoff forecast; never an alert)
     drought types   v283.15: each drought view is its own index on its own published classes, one record per tehsil per run (layers
                     drought_rain, drought_soil, drought_crops, drought_water; the headline 'drought' stays SPI-3):
                       drought_rain   SPI-3 (CHIRPS), US Drought Monitor SPI categories (the headline index itself)
                       drought_soil   root-zone soil moisture percentile, USDM percentile classes (D0 30, D1 20, D2 10, D3 5)
                       drought_crops  Vegetation Health Index, Kogan classes (40 / 30 / 20 / 10)
                       drought_water  snow water and river flow percentiles (USDM percentile classes; reservoirs: no record held),
                                      the more severe; untested (drought-type.json withheld), shown as a reading, never named as the type
                     the bands are the server's own (climatology.mjs droughtNational -> droughttype.mjs, cuts in data/drought-type.json);
                     a view with no reading is -1 'no reading', never the headline level
     glof            one class-to-level table (data/hazard-scale.json glofLadder), the same in glof.mjs
   Codes: -1 no data / not assessed (the reason is in layer.why[unit]), -2 not applicable here (physical mask), -3 no river level here.
   NIGRAAN_HAZSCI=0 turns it off (the engine's values are then served as before). */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gaugeAge, gaugeCurrent } from './rivercal.mjs';
import { RIVER_STALE_H } from './flood.mjs';
import { STATUS_SKILL } from './river31.mjs';
import { RAIN5_BASIS } from './landslideodds.mjs';   /* v283.35 · B5 */   /* v283.35 · A2/B8: the sheet is a signal of the one river cell */
import { imergRain5, imergShadow } from './imergpastrain.mjs';   /* sci43 · B1b: IMERG Late past-day rain in the tested tehsils, OFF unless NIGRAAN_IMERG_PAST_RAIN=1 */
import { schedule } from './scheduler.mjs';
import { screeningCuts, landslideOddsEdges, droughtSpiBounds, levelUp, levelDown } from './scalecuts.mjs';   /* v283.24 H17 */
import { rainClassProbs, rainClassSharesCalibrated, detLevel, RAIN_CLASS_MM, rainClassMm } from './rainprob.mjs';   /* v283.24 heavy-rain method d; v283.27 item 3: the classes' one home */

const isN = (x) => typeof x === 'number' && Number.isFinite(x);
/* v91.17.283.24 · H17 · the cuts are read from data/hazard-scale.json (scalecuts.mjs, the one home); BAND_CUTS is the register's value at load */
export const BAND_CUTS = screeningCuts();
export const levelOfScore = (s, cuts = screeningCuts()) => levelUp(s, cuts);
function recount(layer) { const c = [0, 0, 0, 0, 0]; let na = 0, nd = 0; for (const v of Object.values(layer.L)) { if (v >= 0 && v <= 4) c[v]++; else if (v === -2) na++; else nd++; } layer.counts = c; layer.na = na; layer.nd = nd; }
function setCell(layer, uid, L, S, why, fact) { layer.L[uid] = L; if (S != null) (layer.S = layer.S || {})[uid] = S; else if (layer.S) delete layer.S[uid];
  if (why) (layer.why = layer.why || {})[uid] = why; else if (layer.why) delete layer.why[uid];
  if (fact) (layer.facts = layer.facts || {})[uid] = fact; }

/* -------------------------------------------------------------------------------------------------------------------- river (item 1) */
/* the reach signal of a gauge on a date, from the server's own river records (no page input):
     measured   the gauge's class from the river sheet / gauge outlook (data/river-outlook.json), when that gauge is current (per-gauge age,
                rivercal.mjs gaugeAge) and has a class for the date: the official class placed on the five levels (Below Low -> Normal,
                Low, Medium -> Moderate, High, Very High / Exceptional -> Severe) at the band core GAUGE_CLASS_CORE
     model      otherwise the reach's model-flow ladder position for the date (flood.mjs dayView: the ensemble median on the reach's own
                percentiles and return periods, data/river-level-scale.json), x 100 */
export const GAUGE_CLASS_CORE = [10, 30, 55, 75, 88, 95];   /* FR gaugeOutlookCore (kept for the register; v283.35: no longer used to place a level) */
/* v91.17.283.35 · audit A1 · an official gauge class is an OBSERVATION (or the official outlook of one): it is placed on the five levels
   directly (Below Low -> Normal, Low -> Low, Medium -> Moderate, High -> High, Very High / Exceptional -> Severe), never turned into a score
   and multiplied by the untested height-above-river factor (a measured Very High flood at factor 0.3 was served as Low) */
export const GAUGE_CLASS_LEVEL = [0, 1, 2, 3, 4, 4];
export const levelOfGaugeClass = (cls) => (isN(cls) ? GAUGE_CLASS_LEVEL[Math.max(0, Math.min(5, Math.round(cls)))] : null);
export function gaugeClassOn(g, date) { if (!g || g.stale || g.current === false) return null;
  if (g.lastReading === date && isN(g.cls)) return { cls: g.cls, measured: true };
  const d = (g.days || []).find((x) => x.date === date && isN(x.cls)); return d ? { cls: d.cls, measured: false, k: d.k } : null; }
/* v91.17.283.35 · audit A2 / B8 · THE RIVER GAUGE SHEET IS A SIGNAL OF THE ONE RIVER CELL (it was applied only in the place record, so the
   map and the place card differed). A sheet reading dated today (PKT) is today's measured status; a reading older than today is "last
   measured <date>", carried forward with the tested skill of status persistence at the TRUE lead (day + age of the reading): POD / FAR of
   leads 1-3 (river31.mjs STATUS_SKILL); beyond lead 3 the persistence was not tested and the sheet is not used. */
export const pktToday = (now = Date.now()) => new Date(now + 5 * 3600e3).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
export function sheetSignal(m, date, today, skill) {
  if (!m || !isN(m.level) || !m.date) return null;
  const lead = dayDiff(date, m.date); if (!(lead >= 0)) return null;
  if (lead === 0 && m.date === today) return { level: m.level, cls: m.level, basis: 'measured official status at ' + m.station + ' (' + m.date + ')', measured: { station: m.station, date: m.date, status: m.status, flowCusec: m.flowCusec ?? null, observed: true } };
  const sk = skill && skill[lead]; if (!sk) return { none: true, why: 'the last sheet reading at ' + m.station + ' (' + m.date + ') is ' + lead + ' days before ' + date + ': status persistence is tested to 3 days only' };
  return { level: m.level, cls: m.level, basis: 'last measured ' + m.date + ' at ' + m.station + ', carried forward ' + lead + ' day' + (lead > 1 ? 's' : '') + ' (status persistence: POD ' + sk.pod + ', FAR ' + sk.far + ')',
    measured: { station: m.station, date: m.date, status: m.status, flowCusec: m.flowCusec ?? null, observed: false, carried: true, lead, pod: sk.pod, far: sk.far } };
}
export function reachSignal(gid, date, { gauges, dayView, sheet = null, today = null, skill = null }) {
  const sh = sheet ? sheetSignal(sheet(gid), date, today || pktToday(), skill) : null;
  if (sh && !sh.none) return { level: sh.level, basis: sh.basis, cls: sh.cls, measured: sh.measured, source: 'sheet' };
  const gc = gaugeClassOn(gauges && gauges[gid], date);
  if (gc) return { level: levelOfGaugeClass(gc.cls), basis: gc.measured ? 'measured flow class' : 'gauge outlook class (' + gc.k + ' day ahead)', cls: gc.cls };
  const v = dayView ? dayView(gid, date) : null;
  if (v && isN(v.ladder)) { const score = Math.round(v.ladder * 1000) / 10; return { level: levelOfScore(score), score, basis: 'model flow on the reach ladder' + (v.untested ? ' (untested rung)' : ''), levelIndex: v.levelIndex }; }
  return { level: null, why: v && v.classWhy ? v.classWhy : 'no river forecast for this reach on ' + date };
}
/* v91.17.283.35 · item 3 · the floodplain share is an EXPOSURE FACT beside the level, never a multiplier of it */
export const floodplainText = (s) => isN(s) ? Math.round(s * 100) + ' % of the tehsil lies in the height-above-river bands that flooded (within about 10 m of a major river)' : null;
export const RIVER_NO_CHANNEL_WHY = 'cannot happen here: no river channel in this tehsil (river network: the channels of the river model after the national channel review); flooding from nullahs and hill torrents is local-rain flooding';
export const RIVER_UNGAUGED_WHY = 'level not tested here: a river runs through this tehsil but has no gauge, so no river flood level is issued; flooding from nullahs and hill torrents is local-rain flooding';
export function riverCell(uid, link, sig, hand, mask = null) {
  const U = link && link.units && link.units[uid];
  const facts = U ? { modelChannelCells: U.modelChannelCells, disputedChannelCells: U.disputedChannelCells } : {};
  /* off the floodplain by the height above the river (the physical mask of hazard-applicability.json, or no ground in a flooded HAND band):
     cannot happen here, the same on every surface */
  /* v283.36 · C-now test 5 (river exclusion mask) FAILED: 10 of the 97 "off-floodplain" tehsils had >= 1 km2 of observed flood water in the
     held-out 2010 / 2014 / 2025 extents (Chakwal|Choa Saidan Shah 50.6 km2, Bhimber|Samahni 12.5 km2). No tehsil carries "cannot happen" for
     river flooding any more: a masked tehsil is "not assessed here" with its measured floodplain share as a fact (no gauged reach: -3). */
  /* v91.17.283.41 (NIGRAAN 1.0.5) · owner rule 31 Oct 22:55 PKT · RIVER FLOODING FROM THE RIVER NETWORK ONLY (never the failed HAND mask):
       gauged reach through or along the tehsil   -> the reach level (as before; the failed height-above-river exclusion no longer withholds it)
       an ungauged river channel in the tehsil    -> -5 not tested: no level is issued (the 5 km river model has no tested signal on
                                                     ungauged channels, flood.mjs); local-rain flooding covers nullahs and hill torrents
       no river channel at all                    -> -4 cannot happen here (a physical fact): no channel cell of the river model after the
                                                     national channel review (data/river-link.json modelChannelCells, disputed cells are
                                                     channels with no river on the ground) and no gauged reach
     NIGRAAN_RIVER_NETWORK=0 returns to the 1.0.4 rule (test switch). */
  if (process.env.NIGRAAN_RIVER_NETWORK !== '0') {
    const reached = !!(U && U.reaches && Object.keys(U.reaches).length);
    if (!reached && U && !(U.modelChannelCells > 0)) return { L: -4, why: RIVER_NO_CHANNEL_WHY, facts: { ...facts, riverGroup: 'no_channel' } };
    if (!reached) return { L: -5, why: RIVER_UNGAUGED_WHY, facts: { ...facts, riverGroup: 'ungauged' } };
    mask = null; hand = hand && isN(hand.floodplainShare) && hand.floodplainShare <= 0 ? { ...hand, floodplainShare: null } : hand;
  }
  const offWhy = (km2) => 'not assessed: river flooding is not assessed here (the off-floodplain rule failed its held-out test; ' + (isN(km2) ? km2 + ' km²' : 'no ground') + ' of this tehsil lies within 10 m above a major river)';
  if (mask && mask.applies === false) return { L: (!U || !U.reaches || !Object.keys(U.reaches).length) ? -3 : -1, why: (!U || !U.reaches || !Object.keys(U.reaches).length) ? 'no gauged river reach passes through or along this tehsil; ' + offWhy(mask.km2).replace(/^not assessed: /, '') : offWhy(mask.km2), facts: { ...facts, floodplainShare: isN(mask.share) ? mask.share : null, floodplainKm2: isN(mask.km2) ? mask.km2 : null, maskFailed: true } };
  if (!U || !U.reaches || !Object.keys(U.reaches).length)
    return { L: -3, why: 'no gauged river reach passes through or along this tehsil' + (U && U.disputedChannelCells ? ' (' + U.disputedChannelCells + ' model channel cells here are disputed by the channel review: no river on the ground)' : ''), facts };
  if (hand && isN(hand.floodplainShare) && hand.floodplainShare <= 0)
    return { L: -1, why: 'not assessed: river flooding is not assessed here (no ground of this tehsil lies in a height-above-river band that flooded in 2010 or 2014; that exclusion failed its held-out test)', facts: { ...facts, floodplainShare: 0, maskFailed: true } };
  /* v91.17.283.23 · audit 15 · a tehsil linked to reaches whose feed gave no score this run is MISSING DATA (-1), not "no river here" (-3) */
  const linked = Object.entries(U.reaches).map(([g, e]) => ({ g, e, s: sig[g] })).filter((x) => x.s && isN(x.s.level));
  if (!linked.length) return { L: -1, why: 'linked to ' + Object.keys(U.reaches).join(', ') + ', whose reach has no score in this run (' + Object.keys(U.reaches).map((g) => (sig[g] && sig[g].why) || 'no reach score').join('; ') + ')', facts };
  const best = linked.reduce((a, b) => (b.s.level > a.s.level || (b.s.level === a.s.level && (b.s.score ?? -1) > (a.s.score ?? -1)) ? b : a));
  const fs = hand && isN(hand.floodplainShare) ? hand.floodplainShare : null;
  /* v283.36 item 21: official = the level is an official gauge class (sheet, measured class or the official gauge outlook); only these alert */
  return { L: best.s.level, S: best.s.score ?? null, facts: { ...facts, gauge: best.g, river: best.e.river, reachLevel: best.s.level, official: best.s.source === 'sheet' || isN(best.s.cls), ...(best.s.score != null ? { reachScore: best.s.score } : {}), reachBasis: best.s.basis || null,
    ...(best.s.measured ? { measured: best.s.measured } : {}), floodplainShare: fs, ...(fs != null ? { floodplainText: floodplainText(fs) } : { floodplainWhy: (hand && hand.why) || 'no height-above-river record for this tehsil' }),
    settlementKmToRiver: best.e.settlementKmToRiver ?? null } };
}
/* v91.17.283.23 · audit 17 · when a server method cannot run (input missing, error), every cell it owns becomes not assessed with the
   reason; the page engine's older value is never left in place looking current (the physical mask, -2, stays) */
export function failLayer(rec, keys, why) { let n = 0;
  for (const d of rec.days || []) for (const k of keys) { const X = d.layers && d.layers[k]; if (!X || !X.L) continue;
    for (const uid of Object.keys(X.L)) { if (X.L[uid] === -2 || X.L[uid] === -4) continue; setCell(X, uid, -1, null, why, null); n++; } recount(X); X.basis = 'not assessed: ' + why; }
  return n; }
export function applyRiver(rec, { link, signalOf, handOf, maskOf = null }) {
  if (!link) { const why = 'not assessed: the river link table (data/river-link.json) is not in this install'; return { replaced: failLayer(rec, ['flood_riverine'], why), why }; }
  let replaced = 0; const used = {};
  for (const d of rec.days) { const R = d.layers.flood_riverine; if (!R) continue;
    if (R.held != null) delete R.held;   /* the river level is per day now (it was day 0's, held over the issue) */
    const sig = {}; for (const g of Object.keys(link.gauges || {})) sig[g] = signalOf(g, d.date);
    if (d.day === 0) for (const [g, x] of Object.entries(sig)) used[g] = x.level;
    for (const uid of Object.keys(R.L)) {   /* v283.35: the engine's physical mask (-2) is the floodplain mask: served -4 with its reason */
      const mk = maskOf ? maskOf(uid) : null, m = mk || (R.L[uid] === -2 ? { applies: false } : null);
      const c = riverCell(uid, link, sig, handOf ? handOf(uid) : null, m); setCell(R, uid, c.L, c.S ?? null, c.why || null, c.facts); replaced++; }
    recount(R); R.basis = 'river level by drainage: the official class of the gauged reach (measured, outlook or the sheet), else the reach\'s model-flow ladder, unreduced; ' + (process.env.NIGRAAN_RIVER_NETWORK !== '0' ? 'an ungauged river: not tested; no river channel at all: cannot happen here (river network only, v283.41)' : 'not assessed where the failed off-floodplain rule applied (height above the river) cannot happen') + '; the floodplain share is a separate fact'; }
  return { replaced, reachScoresDay0: used };
}

/* ---------------------------------------------------------------------------------------------------------------------- rain (item 2) */
export const RAIN_CLASSES = RAIN_CLASS_MM;   /* v283.27 item 3: the register's 24-h rain classes at load (data/hazard-scale.json rainClasses24h); the cells read rainClassMm() */
import { RAIN_ENS_STALE_H, ensAge } from './stale.mjs';
import { drainageUnits } from './glofdrain.mjs';   /* v283.36 item 18 */   /* v283.35 · B7: one home; v283.36 item 29: the data-age table */
export { RAIN_ENS_STALE_H };
export const RAIN_SHARE = null;   /* v283.36 item 20: retired (was 50 %: a pre-set decision, not fitted, no skill on IMERG); shares are facts only */
export function rainCell(row, members) {
  const c = row && row.prc;
  if (!c) return { L: -1, why: 'the ensemble run held predates the rain-class shares (they arrive with the next ensemble run)' };
  if (c.p == null) return { L: -1, why: c.why || 'not assessed: too few valid members' };
  /* v283.15 · item 9 · a calibrated row (rainprob.mjs, lead days 1-3) carries its own level: the highest TESTED class at or above its cut
     (none is tested in data/rain-prob-coefs.json, so Normal); the 50 % share rule is not applied to it. The probability is a fact. */
  if (c.calibrated === true && Number.isInteger(c.L)) {
    const k0 = String(rainClassMm()[0]), p15 = c.p[k0], st = c.status || {};   /* v283.27 item 3: the lowest class from its one home */
    const facts = { validMembers: c.n, of: members, probability: c.p, status: st, calibrated: true, zone: c.zone || null, regime: c.regime || null,
      text: 'chance of \u2265' + k0 + ' mm: ' + (isN(p15) ? Math.round(p15) : '?') + ' %' + (st[k0] === 'tested' ? '' : ', screening, not a tested level') };
    return rainNoClear(c.L, rainClassMm().length > 0 && rainClassMm().every((t) => st[String(t)] === 'tested'), p15, facts, facts.text);
  }
  if (!rainClassMm().length) return { L: -1, why: 'not assessed: the 24-hour rain classes (data/hazard-scale.json rainClasses24h) are not loaded' };
  /* v283.36 · launch item 20 · no level from the share of members: the share per daily rain class is the fact */
  const k0 = String(rainClassMm()[0]);
  return rainNoClear(0, false, c.p[k0], { validMembers: c.n, of: members, shares: c.p, sharesText: rainClassMm().map((t) => (isN(c.p[String(t)]) ? Math.round(c.p[String(t)]) : '?') + ' % reach ' + t + ' mm').join(', ') },
    rainClassMm().map((t) => (isN(c.p[String(t)]) ? Math.round(c.p[String(t)]) : '?') + ' % of the valid members reach ' + t + ' mm').join('; '));
}
/* v91.17.283.23 · audit 2 · NOT TESTED IS NEVER NORMAL. Normal (0) says no rain class is reached; it is served only when every class was
   tested (data/rain-prob-coefs.json gate). An untested screen may flag a class (a positive screening flag, labelled screening), but it
   cannot clear a place: below every flag the cell is not assessed (-1) with the screening fact as its reason. */
export function rainNoClear(L, allTested, S, facts, fact) {
  /* v283.36 · launch items 7 / 20 · an untested screen sets NO level at all: neither a positive flag (the "half of the members" rule was
     a pre-set decision with no skill) nor a clear. The shares of members per daily rain class stay as facts. */
  if (allTested) return { L, S, facts };
  return { L: -5, S: null, why: 'not tested: screening only, no rain class has passed its event test here (' + fact + ')', facts: { ...facts, screeningOnly: true } };   /* v283.31 · 4.3 state not_tested (was -1, read as missing) */
}
/* ══ v91.17.283.24 · HEAVY-RAIN METHOD D (data/rain-prob-coefs-ifsdet.json; rainprob.mjs detLevel) ══════════════════════════════════
   On lead days 1-3 in the plains, where the station event test passed (>= 15.6 mm), the cell's level is the tested chance of >= 15.6 mm
   from the IFS deterministic day total of the 00 UTC run (ecmwf010.mjs pktDayTotals, the runs this server already fetches): Normal under
   the cut, "Low or heavier" at or above it. Other zones, day 0, days 4+ and a day without that total keep the ensemble screening below
   (not assessed unless a screening class is flagged). The ensemble share stays a fact. det(uid, date) -> { mm, lead, run, zone, month } */
/* == v91.17.283.31 · science lane (scratchpad/rain31, rules31.json locked before scoring) · METHOD D BY ZONE ==========================
   data/rain-prob-coefs-ifsdet-zones.json: the cells that passed the leave-one-year-out station test (2023-2026), beside the plains
   15.6 mm cells of data/rain-prob-coefs-ifsdet.json (unchanged):
     mountain >= 15.6 mm, lead days 1-3 (new)       plains >= 64.5 mm, lead days 1-2 (new)
   Every other zone, class and lead is NOT TESTED (code -5) with its reason (coast: failed held-out test; hills: too few events; ...).
   Today is read from the previous 00 UTC run at lead 1 (ecmwf010 pktDayTotals: fromPreviousRun), a tested lead, and says so.
   Each level carries its cell's tested skill (BSS with its lower bound, POD and FAR with 95 % intervals, events): these new cells catch
   few events and most warnings are false, so the served text calls them a low-skill warning and never more. */
const ZWHY = (Cz, zone) => { const N = (Cz && Cz.notTestedByZone) || {}; return (N[zone] && N[zone].why) || ('not tested: no cell of method d passed its test in the ' + zone + ' zone'); };
export function zoneProb(Cz, cls, lead, zone, mm, month) {
  const c = Cz && Cz.cells ? Cz.cells[cls + '|' + lead + '|' + zone] : null; if (!c || !Number.isFinite(mm)) return null;
  const x1 = Math.min(c.hi1, Math.max(c.lo1, Math.log1p(Math.max(0, mm)))), x2 = month >= 6 && month <= 9 ? 1 : 0;
  const p = Math.min(0.999, Math.max(0.001, 1 / (1 + Math.exp(-(c.w0 + c.w1 * x1 + c.w2 * x2)))));
  return { p, cut: c.cut, skill: c.skill || null }; }
const skillText = (sk) => sk ? 'in the held-out test it caught ' + Math.round(100 * sk.pod) + ' % of these days (' + sk.hits + ' of ' + sk.events + ') and ' + Math.round(100 * sk.far) + ' % of its warnings were false' : 'skill not recorded';
export function detCell(Cd, D, row, Cz = null) {
  if (!D || !Number.isFinite(D.mm)) return null;
  const today = D.fromPreviousRun ? ' (today: the previous 00 UTC run at lead 1)' : '';
  if (Cz && D.zone && D.zone !== 'plains') {
    const z = zoneProb(Cz, 15.6, D.lead, D.zone, D.mm, D.month);
    if (!z) return { L: -5, why: 'not tested: ' + ZWHY(Cz, D.zone), facts: { method: 'd', zone: D.zone, runLead: D.lead, state: 'not_tested' } };
    const p = Math.round(1000 * z.p) / 10, L = z.p >= z.cut ? 1 : 0;
    const text = 'chance of \u226515.6 mm: ' + p + ' %' + today + (L ? ': Low or heavier, a low-skill warning: ' + skillText(z.skill) : ': no class reached');
    return { L, S: p, facts: { method: 'd-z', calibrated: true, tested: true, lowSkill: true, zone: D.zone, runLead: D.lead, run: D.run || null, fromPreviousRun: !!D.fromPreviousRun,
      probability: { '15.6': p }, cut: Math.round(1000 * z.cut) / 10, status: { '15.6': 'tested' }, skill: z.skill, ...(L ? { lowOrHeavier: true, levelLabel: 'Low or heavier' } : {}), text } };
  }
  if (!Cd || D.zone !== 'plains') return null;
  const r = rainClassProbs(Cd, null, 0, { zone: D.zone, month: D.month, lead: D.lead, detMm: D.mm }); const lv = detLevel(Cd, r); if (!lv) return null;
  const k0 = String(rainClassMm()[0]), p15 = Math.round(1000 * r.p[k0]) / 10, ens = row && row.prc && row.prc.p ? row.prc.p : null;
  const text = 'chance of \u2265' + k0 + ' mm: ' + p15 + ' % (tested in the plains, lead day ' + D.lead + ' of the 00 UTC run)' + (lv.L ? ': Low or heavier (the heavier classes are not tested)' : ': no class reached');
  /* v283.31 · plains >= 64.5 mm at lead days 1-2 (zone cells): Moderate or heavier when it reaches its cut; a low-skill warning */
  const k1 = rainClassMm()[1];   /* the second class (64.5 mm) from its one home (register) */
  const z64 = Cz ? zoneProb(Cz, k1, D.lead, 'plains', D.mm, D.month) : null; const p64 = z64 ? Math.round(1000 * z64.p) / 10 : null;
  const L = z64 && lv.L === 1 && z64.p >= z64.cut ? 2 : lv.L;
  const sk15 = Cz && Cz.plainsSkill ? Cz.plainsSkill['15.6|' + D.lead + '|plains'] || null : null;
  const text2 = L === 2 ? 'chance of \u2265' + k0 + ' mm: ' + p15 + ' %, of \u2265' + k1 + ' mm: ' + p64 + ' %' + today + ': Moderate or heavier, a low-skill warning for the ' + k1 + ' mm class: ' + skillText(z64.skill) : text + today;
  return { L, S: p15, facts: { method: 'd', calibrated: true, tested: true, zone: D.zone, regime: r.regime, runLead: D.lead, run: D.run || null, fromPreviousRun: !!D.fromPreviousRun,
    probability: { [k0]: p15, ...(p64 != null ? { [String(k1)]: p64 } : {}) }, cut: Math.round(1000 * lv.cut) / 10, status: { [k0]: 'tested', ...(z64 ? { [String(k1)]: 'tested' } : {}) }, skill: sk15, ...(z64 ? { skill64: z64.skill, cut64: Math.round(1000 * z64.cut) / 10 } : {}),
    ...(L === 2 ? { lowOrHeavier: true, lowSkill: true, levelLabel: 'Moderate or heavier' } : lv.L ? { lowOrHeavier: true, levelLabel: 'Low or heavier' } : { nested: 'every heavier class lies inside the tested 15.6 mm class' }),
    ...(ens ? { ensembleShares: ens } : {}), text: text2 } };
}
/* ══ v91.17.283.27 · item 1 · HOW RARE THE DAY'S RAIN IS: data/rain-return-levels.json, the ONE home of rain rarity ══════════════════════
   Return levels of the wettest 1 / 3 / 6 / 24 h of the year per tehsil, catchment and district (satellite rain estimate IMERG V07 Final
   Run 2001-2025, 0.1 deg; GEV by L-moments with the regional shape, Hosking 1990, Hosking & Wallis 1997), tested on held-out years
   (2014-2025 exceedance 0.49 / 0.22 / 0.12 against 0.5 / 0.2 / 0.1 at 24 h) and against the gauges. It replaces the ERA5 wet-day
   percentile table the analyst page carried (agn-rain-clim), whose "above the 20-year maximum" level was exceeded in 24.5 % of
   gauge station-years (nominal 5 %). The 24-h level is the POINT level (the area level x the zone's gauge factor, which passed its
   leave-one-gauge-out test); the 1-6 h levels are AREA rain (about 10 km): their gauge factor failed, so they are never read as a point.
   The day's rarity is a FACT beside the 24-h class level, never a level of its own: the forecast day total (ensemble median) placed
   between the tehsil's return levels; under the 2-year level it reads "less than a 2-year event", above the 100-year level it reads
   "beyond 100-year" (the file's rarityRule). No interpolation and no typed level. */
export function rarityBand(RL, levels, mm) {
  const T = RL && Array.isArray(RL.returnPeriods) ? RL.returnPeriods : null;
  if (!T || !Array.isArray(levels) || levels.length !== T.length || !isN(mm)) return null;
  let i = -1; for (let k = 0; k < levels.length; k++) if (isN(levels[k]) && mm >= levels[k]) i = k;
  if (i < 0) return { band: '<' + T[0], words: (RL.rarityRule && RL.rarityRule.below) || ('under the ' + T[0] + '-year level'), atLeastYears: null, belowYears: T[0], nextMm: levels[0] };
  if (i === T.length - 1) return { band: '>=' + T[i], words: (RL.rarityRule && RL.rarityRule.above) || ('beyond the ' + T[i] + '-year level'), atLeastYears: T[i], belowYears: null, levelMm: levels[i] };
  return { band: T[i] + '-' + T[i + 1], words: 'at or above the ' + T[i] + '-year level (' + levels[i] + ' mm), under the ' + T[i + 1] + '-year level (' + levels[i + 1] + ' mm)', atLeastYears: T[i], belowYears: T[i + 1], levelMm: levels[i], nextMm: levels[i + 1] };
}
export function dayRarity(RL, uid, mm) {
  if (!RL || !RL.units) return { assessed: false, why: 'not assessed: the rain return levels (data/rain-return-levels.json) are not loaded' };
  const U = RL.units[uid]; if (!U || U.assessed === false) return { assessed: false, why: 'not assessed: ' + ((U && U.why) || 'no rain return levels for this tehsil') };
  const E = U['24h']; const pt = E && Array.isArray(E.pointRl), lv = E ? (pt ? E.pointRl : E.areaRl) : null;
  if (!lv) return { assessed: false, why: 'not assessed: no 24-hour return levels for this tehsil' };
  if (!isN(mm)) return { assessed: false, why: 'not assessed: no forecast day total for this day' };
  const b = rarityBand(RL, lv, mm); if (!b) return { assessed: false, why: 'not assessed: the return levels of this tehsil are incomplete' };
  return { assessed: true, mm: Math.round(mm * 10) / 10, duration: '24h', scale: pt ? 'point' : 'area', ...b,
    basis: (pt ? 'point (station-scale) 24-hour return level: the satellite area level x the tested gauge factor of the ' + (U.zone || 'terrain') + ' zone'
      : 'satellite area rain (about 10 km), 24 hours') + '; return levels from ' + (E.years || '?') + ' years of satellite rain (2001-2025)',
    amountBasis: 'the forecast day total (ensemble median)', returnPeriods: RL.returnPeriods, levelsMm: lv };
}
/* v91.17.283.31 · item 1.4 · THE RAIN LEVELS FOLLOW THE CLOCK, NOT THE ENSEMBLE FETCH. A calibrated row carries the lead it was computed
   at; at PKT midnight every held row moves one lead and was withheld ("computed at lead 2 for a day that is now lead 1") until the next
   00 UTC ensemble run arrived (~13:00 PKT), so from midnight to early afternoon no rain level was issued (the 06:49 PKT run of 29 Oct:
   0 of 576 today, 0 on days +2 and +3). The row keeps the member statistics the calibrated model reads (row.prs: n, mean, sd, class
   counts), so it is re-read at the CURRENT lead with the same coefficients: lead 1-3 calibrated again, lead 0 the plain member share
   (screening, as an uncalibrated day always was). Nothing is guessed: the same members, the same model, today's lead. */
export function releadRow(row, lead, date, members, coefs) {
  const c = row && row.prc, st = row && row.prs;
  if (!c || c.calibrated !== true || !st || !Number.isFinite(st.n) || !Array.isArray(st.m)) return null;
  try { const r = rainClassSharesCalibrated(coefs || null, [], members, { zone: c.zone || 'plains', month: Number(String(date).slice(5, 7)), lead, stats: st }, c.basis || 'precipitation');
    return r && r.p ? { ...row, prc: r.lead == null && !r.calibrated ? { ...r, calibrated: false, relead: { from: c.lead, to: lead } } : { ...r, relead: { from: c.lead, to: lead } } } : null; } catch (_) { return null; } }
export function applyRain(rec, ens, { det = null, detCoefs = null, rl = null, coefs = null, zoneCoefs = null } = {}) {
  let replaced = 0;
  for (const d of rec.days) { const R = d.layers.rain_hz; if (!R) continue;
    const k = ens && Array.isArray(ens.days) ? ens.days.indexOf(d.date) : -1;
    /* v91.17.283.23 · self-audit H6 · an ensemble run older than RAIN_ENS_STALE_H is not served as current, and a calibrated day whose lead
       has moved since it was computed (the coefficients are per lead) is not assessed until the next run */
    const EA = ensAge(ens), ageH = EA.ageH, stale = !!ens && EA.stale;   /* v283.36 item 29: age from the run's base time */
    for (const uid of Object.keys(R.L)) { const rows = ens && ens.units && ens.units[uid];
      const row = rows && k >= 0 ? rows[k] : null, cl = row && row.prc;
      /* v283.31 · 1.4 / 4.3 · an input that does not cover the day, or is too old, is state "input not current" (code -6) with its age */
      const c = !ens ? { L: -1, why: 'no ensemble run held' } : stale ? { L: -6, why: 'input not current: the ensemble run held is ' + (isFinite(ageH) ? Math.round(ageH) + ' h' : 'of unknown age') + ' old (more than ' + RAIN_ENS_STALE_H + ' h): not served as current', inputAgeH: isFinite(ageH) ? Math.round(ageH) : null }
        : k < 0 ? { L: -6, why: 'input not current: the ensemble run held (' + (isFinite(ageH) ? Math.round(ageH) + ' h old' : 'age unknown') + ') does not cover ' + d.date } : !rows ? { L: -1, why: 'not in the ensemble run' }
        : cl && cl.calibrated === true && Number.isInteger(cl.lead) && Number.isInteger(d.day) && cl.lead !== d.day
          ? (() => { const r2 = releadRow(row, d.day, d.date, ens.members, coefs); return r2 ? rainCell(r2, ens.members) : { L: -1, why: 'computed at lead ' + cl.lead + ' for a day that is now lead ' + d.day + ', and the member statistics are not held to re-read it: not assessed until the next ensemble run' }; })()
        : rainCell(row, ens.members);
      const dc = det && detCoefs && Number.isInteger(d.day) && d.day >= 0 && d.day <= 3 ? detCell(detCoefs, det(uid, d.date), row, zoneCoefs) : null;   /* v283.31 · day 0 from the previous run at lead 1; zone cells */
      const cc = dc || c;
      /* v283.27 item 1: the day's rarity beside the class (a fact; the level is unchanged) */
      if (!stale && row && Array.isArray(row.pr) && isN(row.pr[1])) cc.facts = { ...(cc.facts || {}), dayRarity: dayRarity(rl, uid, row.pr[1]) };   /* never from a stale run */
      setCell(R, uid, cc.L, cc.S ?? null, cc.why || null, cc.facts || null); replaced++; }
    const nd = Object.values(R.facts || {}).filter((f) => f && f.method === 'd').length;
    recount(R); R.basis = (nd ? 'plains, lead days 1-3: tested chance that the station day total reaches ' + rainClassMm()[0] + ' mm from the IFS deterministic 00 UTC day total (Normal under the cut, Low or heavier at or above it; ' + nd + ' tehsils); elsewhere: ' : '')
      + (Object.values(R.facts || {}).some((f) => f && f.calibrated && f.method !== 'd') ? 'calibrated probability that the ~10 km pixel day total reaches the class (IFS ENS, IMERG basis); screening'
      : 'share of ensemble members reaching the 24-h rain classes ' + rainClassMm().join(' / ') + ' mm (India Meteorological Department categories; valid members, at least half valid); screening'); }
  return { replaced };
}

/* ----------------------------------------------------------------------------------------------------------------- landslide (item 3) */
export const ODDS_EDGES = landslideOddsEdges();   /* data/hazard-scale.json landslideOddsEdges (the model's held-out odds bands) */
export const levelOfOdds = (or) => { const e = landslideOddsEdges(); return levelUp(or, e ? e.slice(0, 3) : e); };   /* v283.36 C-now 2a: edges 2 / 5 / 10 only (top band "10x or more" = High; no Severe) */
/* v91.17.283.41 (NIGRAAN 1.0.5) · owner update 31 Oct 22:55 PKT (replaces item 7 and launch item 24's no-hatch rule): a tehsil outside the
   steep-ground mask is placed by data/landslide-groups.json (scripts/tests28341/landslide_groups41.py, 30 m terrain + the event records):
     b  steep ground within reachKm of the tehsil -> -5 "No local steep ground; debris from nearby slopes possible" (grey, no level)
     c  no steep ground in or near the tehsil     -> -4 "Cannot happen here" (hatched)
   no groups file -> the 1.0.4 rule (-1 not assessed). NIGRAAN_LANDSLIDE_GROUPS=0 = the 1.0.4 rule (test switch). */
export const LANDSLIDE_EDGE_WHY = 'No local steep ground; debris from nearby slopes possible';
export const LANDSLIDE_PLAINS_WHY = 'cannot happen here: no steep ground in this tehsil or near it';
/* v91.17.283.47 · NIGRAAN 1.0.8 · owner rule 2 Nov 2026 01:15 PKT · LANDSLIDE "CANNOT HAPPEN HERE" FROM A PUBLISHED SOURCE: the GIRI
   landslide susceptibility (NGI for UNDRR / CDRI / UNEP-GRID-Geneva, CC BY 4.0), every ~370 m cell of the tehsil in the lowest class
   (very low) for rain- AND earthquake-triggered landslides and no bordering tehsil with a moderate-or-higher cell (data/landslide-possible.json,
   scripts/tests28347/landslide_possible47.py; inventory check: 0 of 236 NASA catalogue events fall in such a tehsil). That tehsil is
   "cannot happen here" (-4). The failed 30 Oct steep-ground mask no longer decides impossibility: outside it, a GIRI-possible tehsil is
   "No local steep ground; debris from nearby slopes possible" (-5, value not tested). NIGRAAN_LANDSLIDE_GIRI=0 = the 1.0.7 groups. */
export const LANDSLIDE_GIRI_WHY = 'cannot happen here: every ~370 m cell of this tehsil and of the tehsils around it is in the lowest landslide susceptibility class (GIRI, very low, for rain- and earthquake-triggered landslides)';
export function applyLandslide(rec, { mask, odds, groups = null, possible = null }) {
  const GU = process.env.NIGRAAN_LANDSLIDE_GROUPS !== '0' && groups && groups.units ? groups.units : null, reachKm = groups && groups.params && groups.params.reachKm ? groups.params.reachKm.value : null;
  const PU = process.env.NIGRAAN_LANDSLIDE_GIRI !== '0' && possible && possible.units ? possible.units : null;
  let replaced = 0;
  for (const d of rec.days) { const S = d.layers.landslide; if (!S) continue;
    for (const uid of Object.keys(S.L)) { const m = mask && mask[uid];
      if (PU) { const P = PU[uid];
        if (P && P.possible === false) { setCell(S, uid, -4, null, LANDSLIDE_GIRI_WHY, { landslideSource: 'GIRI', cannotHappen: true }); replaced++; continue; }
        if (m && m.applies === false) { setCell(S, uid, -5, null, LANDSLIDE_EDGE_WHY, { landslideSource: 'GIRI', kmToSteep: GU && GU[uid] ? GU[uid].kmToSteep ?? null : null, steepShare30m: isN(m.steepShare30m) ? m.steepShare30m : null }); replaced++; continue; } }
      /* v283.36 · launch item 24 · NO "cannot happen here" for landslides: a flat tehsil can still receive run-out from steep ground upstream.
         It is outside the model's range (-2) with the plain reason */
      const gq = m && m.applies === false && GU && GU[uid] ? GU[uid].group : null;
      if (gq === 'b') { setCell(S, uid, -5, null, LANDSLIDE_EDGE_WHY, { landslideGroup: 'b', kmToSteep: GU[uid].kmToSteep ?? null, steepShare30m: isN(m.steepShare30m) ? m.steepShare30m : null }); replaced++; continue; }
      if (gq === 'c') { setCell(S, uid, -4, null, LANDSLIDE_PLAINS_WHY + (reachKm ? ' (none within ' + reachKm + ' km)' : ''), { landslideGroup: 'c', kmToSteep: GU[uid].kmToSteep ?? null }); replaced++; continue; }
      if (m && m.applies === false) { setCell(S, uid, -1, null, 'not assessed: no local steep ground (' + (isN(m.steepShare30m) && m.steepShare30m > 0 ? (Math.round(m.steepShare30m * 10000) / 100) + ' % of the 30 m cells are' : 'no 30 m cell is') + ' steeper than 25 deg); run-out from upstream is not modelled', { steepShare30m: isN(m.steepShare30m) ? m.steepShare30m : null }); replaced++; continue; }
      if (!odds || !odds.ready) { setCell(S, uid, -1, null, 'the landslide likelihood is not available' + (odds && odds.why ? ': ' + odds.why : ''), null); replaced++; continue; }
      const u = odds.units[uid]; const r = u && u.days.find((x) => x.date === d.date);
      if (!r) { setCell(S, uid, -1, null, 'no landslide likelihood for this tehsil on ' + d.date, null); replaced++; continue; }
      if (!isN(r.ratio)) { setCell(S, uid, -1, null, r.why || 'not assessed', null); replaced++; continue; }
      setCell(S, uid, levelOfOdds(r.ratio), r.ratio, null, { observedRatio: r.observedRatio ?? null, modelBand: r.modelBand ?? null, ...(r.inputAgeH != null ? { inputAgeH: r.inputAgeH } : {}) }); replaced++; }
    recount(S); S.basis = 'landslide likelihood odds band inside the steep-ground mask (share of 30 m cells steeper than 25 deg)'; }
  return { replaced };
}

/* ------------------------------------------------------------------------------------------------------------------- drought (item 5) */
export const USDM_SPI = droughtSpiBounds();   /* data/hazard-scale.json droughtSpiBounds: D0 .. D3 upper bounds (D4 <= -2.0 is inside Severe) */
export const levelOfSpi = (v) => levelDown(v, droughtSpiBounds());
export function droughtCell(u, soil) {
  if (!u) return { L: -1, why: 'no CHIRPS record for this tehsil' };
  const m = u.monthly && u.monthly.month; const v = m && m.spi3 ? m.spi3.value : null;
  const fact = { index: 'SPI-3 (CHIRPS)', month: m ? m.month : null, spi3: v, ...(soil ? { rootZoneSoilPercentile: soil.percentile ?? null, soilAt: soil.at ?? null } : {}) };
  if (u.provisional) return { L: -1, why: 'not assessed: above 1,800 m no rain product carries the monthly rain anomaly at the independent valley gauges', facts: fact };
  if (v == null) { const arid = m && m.spi3 && m.spi3.arid || (u.spi90 && u.spi90.arid); return arid ? { L: -2, why: 'drought index not defined: arid climate (the 1991-2020 rain of this window is under 10 mm)', facts: fact } : { L: -1, why: 'no SPI-3 for ' + (m ? m.month : 'the last month'), facts: fact }; }
  return { L: levelOfSpi(v), S: v, facts: fact };
}
/* v91.17.283.35 · audit D2 · a PRELIMINARY CHIRPS month is flagged on every cell and in the basis; a month whose successor is overdue is
   input not current (-6). Overdue is read from the CHIRPS release schedule (Funk et al. 2015; CHC: the preliminary month a few days after
   its end, the final product in about the third week of the following month): the held month is overdue once the FOLLOWING month has
   ended and its final product is due (21 days later), i.e. a newer month should be held. */
export const CHIRPS_FINAL_LAG_D = 21;
export function droughtMonthAge(month, today = pktToday()) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return { overdue: false };
  const [y, m] = month.split('-').map(Number); const nextEnd = new Date(Date.UTC(y, m + 1, 0)), due = new Date(nextEnd.getTime() + CHIRPS_FINAL_LAG_D * 864e5).toISOString().slice(0, 10);
  return { overdue: today > due, dueBy: due };
}
export function applyDrought(rec, { chirps, soilOf, dtypeOf, today = null }) {
  let replaced = 0; const d0 = rec.days.find((d) => d.day === 0) || rec.days[0]; const D = d0 && d0.layers.drought; if (!D) return { replaced };
  const mb = chirps && chirps.monthBasis ? chirps.monthBasis : null, prelim = !!(mb && mb.prelim), age = droughtMonthAge(mb && mb.month, today || pktToday());
  for (const uid of Object.keys(D.L)) { let c = chirps ? droughtCell(chirps.units[uid], soilOf ? soilOf(uid) : null) : { L: -1, why: 'data/drought-chirps.json is not in this install' };
    if (c.facts) c.facts = { ...c.facts, prelim };
    if (age.overdue && c.L >= 0) c = { L: -6, why: 'input not current: the drought month held is ' + mb.month + (prelim ? ' (preliminary)' : '') + '; a newer month was due by ' + age.dueBy, facts: c.facts };
    setCell(D, uid, c.L, c.S ?? null, c.why || null, c.facts || null); replaced++; }
  recount(D); D.basis = 'SPI-3 of ' + (chirps && chirps.monthBasis ? chirps.monthBasis.month + (prelim ? ' (preliminary CHIRPS month)' : '') : 'the last month') + ' (CHIRPS) on the US Drought Monitor SPI categories; soil moisture is a supporting fact';
  D.date = chirps && chirps.monthBasis ? chirps.monthBasis.month : null;
  /* v283.15 · the type views: one record per tehsil, from the server's indicator bands */
  const types = {}; for (const k of Object.keys(DTYPE_VIEWS)) { const T = { L: {}, S: {} };
    for (const uid of Object.keys(D.L)) { const c = droughtTypeCell(k, uid, D, dtypeOf ? dtypeOf(uid) : null); setCell(T, uid, c.L, c.S ?? null, c.why || null, c.facts || null); if (c.at != null) (T.at = T.at || {})[uid] = c.at; }
    /* v91.17.283.24 · audit leftover · ONE DATE PER VALUE: a type view carried the SPI month of the headline layer as its date, though its
       values are a soil-moisture day, a vegetation week or 30-day snow and river readings. Each cell now carries the date of its own
       reading (facts.at / week); the view's date is that date when every cell shares it, else null with datesPerCell (never the SPI month). */
    recount(T); T.basis = DTYPE_VIEWS[k];
    if (k === 'drought_rain') T.date = D.date; else { const ds = new Set(Object.values(T.at || {}).filter((x) => x != null)); T.date = ds.size === 1 ? [...ds][0] : null; if (ds.size > 1) T.datesPerCell = true; }
    delete T.at; types[k] = T; d0.layers[k] = T; }
  for (const d of rec.days) if (d !== d0) { if (d.layers.drought) d.layers.drought = { ...D, L: { ...D.L }, S: { ...(D.S || {}) }, held: d.layers.drought.held ?? 0 };
    for (const [k, T] of Object.entries(types)) d.layers[k] = { ...T, L: { ...T.L }, S: { ...T.S }, held: 0 }; }
  return { replaced, types: Object.fromEntries(Object.entries(types).map(([k, T]) => [k, { counts: T.counts, nd: T.nd, na: T.na }])) };
}
/* v283.15 · the drought type views (owner 24 Oct 17:02 PKT: "switching from one drought to another in the same area has the same colour") */
export const DTYPE_VIEWS = {
  drought_rain: 'meteorological drought: SPI-3 (CHIRPS) on the US Drought Monitor SPI categories',
  drought_soil: 'agricultural drought, soil: root-zone soil moisture percentile on the US Drought Monitor percentile classes',
  drought_crops: 'agricultural drought, crops: Vegetation Health Index on the Kogan (1995, 2002) classes',
  drought_water: 'hydrological drought: snow water and river flow percentiles on the US Drought Monitor percentile classes (untested: a reading, not a named type)' };
/* one view of one tehsil: D = the headline layer (SPI-3), t = the server's drought type record of the tehsil (droughttype.mjs u.dtype) */
export function droughtTypeCell(view, uid, D, t) {
  if (view === 'drought_rain') { const L = D.L[uid]; return { L, S: D.S ? D.S[uid] ?? null : null, why: L < 0 && D.why ? D.why[uid] : null, facts: D.facts ? D.facts[uid] : null }; }
  const I = t && t.indicators; if (!I) return { L: -1, why: 'no reading: the drought indicator record of this tehsil is not held' };
  if (view === 'drought_soil') return I.soil && isN(I.soil.band) ? { L: I.soil.band, S: I.soil.percentile, at: I.soil.at || null, facts: { index: 'root-zone soil moisture percentile', percentile: I.soil.percentile, at: I.soil.at || null } } : { L: -1, why: 'no reading: no root-zone soil moisture percentile for this tehsil' };
  if (view === 'drought_crops') return I.crops && isN(I.crops.band) ? { L: I.crops.band, S: I.crops.vhi, at: I.crops.week ?? null, facts: { index: 'Vegetation Health Index', vhi: I.crops.vhi, week: I.crops.week ?? null } } : { L: -1, why: 'no reading: no vegetated land with a vegetation health reading in this tehsil' };
  if (view === 'drought_water') { const parts = [];
    if (I.snow && isN(I.snow.band)) parts.push({ what: 'snow water (30 days)', band: I.snow.band, percentile: I.snow.percentile, at: I.snow.at || null });
    for (const r of I.rivers || []) if (isN(r.band)) parts.push({ what: 'river flow at ' + r.station + ' (30 days)', band: r.band, percentile: r.percentile, at: r.at || null });
    if (!parts.length) return { L: -1, why: 'no reading: no snow season here, no judged river gauge in this tehsil and no reservoir record held' };
    const top = parts.reduce((a, b) => (b.band > a.band ? b : a));
    return { L: top.band, S: top.percentile, at: top.at || null, facts: { index: 'snow water and river flow percentiles', readings: parts, reservoirs: 'no reservoir record held', untested: true } }; }
  return { L: -1, why: 'unknown view' };
}

/* ------------------------------------------------------------------------------------------------------------------- sponge (item 6) */
const LAMBDA = 0.2, P_REF = 100;
const S_mm = (cn) => 25400 / cn - 254;
export function runoffMm(P, cn, f = 1) { const s = S_mm(cn) * f, ia = LAMBDA * s; return P <= ia ? 0 : (P - ia) ** 2 / (P + (1 - LAMBDA) * s); }
export function equivalentS(P, Q) { const q = Math.max(1e-3, Math.min(P - 1e-3, Q)); const A = 0.04, B = -(0.4 * P + 0.8 * q), C = P * P - P * q; const d = Math.max(0, B * B - 4 * A * C); return (-B - Math.sqrt(d)) / (2 * A); }
/* antecedent moisture condition I / II / III (NRCS NEH-4 ch. 4 and 10, growing season: 5-day rain < 36 mm dry, > 53 mm wet) and the
   CN(I) / CN(III) conversions CN/(2.281 - 0.01281 CN) and CN/(0.427 + 0.00573 CN): Hawkins et al. (1985), NRCS NEH-630 ch. 10
   (v283.35 · audit D6: they were cited as Chow et al. 1988, whose forms are 4.2CN/(10 - 0.058CN) and 23CN/(10 + 0.13CN)) */
export const AMC_MM = [36, 53];
export const cnAtAmc = (cn2, amc) => (amc === 1 ? cn2 / (2.281 - 0.01281 * cn2) : amc === 3 ? cn2 / (0.427 + 0.00573 * cn2) : cn2);
export const amcOf = (rain5) => (!isN(rain5) ? null : rain5 < AMC_MM[0] ? 1 : rain5 > AMC_MM[1] ? 3 : 2);
export function spongeOf(V, u, amc = 2) {
  let q = 0, a = 0; for (const b of u.bins || []) { const k = V.covers[b[0]], sh = b[3]; if (!(sh > 0) || !k) continue; a += sh;
    q += sh * (k === 'built' ? P_REF : runoffMm(P_REF, cnAtAmc(V.cn2[k][b[1]], amc), V.fSlope[b[2]] || 1)); }   /* built: sealed, every drop runs off */
  if (!(a > 0)) return null; q /= a; const S = equivalentS(P_REF, q); const cn = 25400 / (S + 254);
  let cls = V.edgesCN.length; for (let i = 0; i < V.edgesCN.length; i++) if (cn >= V.edgesCN[i]) { cls = i; break; }
  return { equivalentS: Math.round(S * 10) / 10, equivalentCN: Math.round(cn * 10) / 10, runoffMm: Math.round(q * 10) / 10, retainedShare: Math.round((P_REF - q) / P_REF * 1000) / 1000, cls, built: u.built ?? null };
}
const _spIdx = new WeakMap();
function spongeIndex(V) { let m = _spIdx.get(V); if (!m) { m = new Map(); for (const [k, u] of Object.entries(V.units)) m.set(u.uid || k, u); _spIdx.set(V, m); } return m; }
/* v283.15 · the run-off depth (mm) of a rain depth P over the tehsil's 250 m cells, pixel first (built: sealed, all of it runs off) */
export function runoffOf(V, u, P, amc = 2) {
  let q = 0, a = 0; for (const b of u.bins || []) { const k = V.covers[b[0]], sh = b[3]; if (!(sh > 0) || !k) continue; a += sh;
    q += sh * (k === 'built' ? P : runoffMm(P, cnAtAmc(V.cn2[k][b[1]], amc), V.fSlope[b[2]] || 1)); }
  return a > 0 ? Math.round(q / a * 10) / 10 : null;
}
/* ══ v283.36 · launch item 6 · RUNOFF PER STORM FROM HOURLY RAIN WHERE HELD ═════════════════════════════════════════════════════════════
   The NRCS equation is applied to a STORM (NEH-630 ch. 10), not to a calendar day: a storm crossing midnight loses its initial abstraction
   once, two storms on one day lose it twice. Storms are separated by a dry spell of at least 6 hours (the minimum inter-event time of
   Huff 1967 and the US EPA SWMM rainfall statistics); each storm's antecedent moisture condition is its own 5 days of rain before its start
   (NEH-4 growing-season bands 36 / 53 mm). Where the hourly rain is not complete for the window (a missing hour), the per-day method of
   v283.35 is used and the cell says so. Proven by fixed reference cases (scripts/tests28336/runoff36.unit.test.mjs, REFERENCE_CASES_36.md). */
/* v283.40 · item 6 sources of the dry-spell rule: Huff (1967) Time distribution of rainfall in heavy storms, Water Resour. Res. 3(4) 1007-1019
   (storms = rain periods separated by 6 h or more without rain); Driscoll, Palhegyi, Strecker & Shelley (1989) Analysis of storm event
   characteristics for selected rainfall gages throughout the United States, US EPA (minimum inter-event time 6 h, the EPA SYNOP default). */
export const HOURLY_BASIS = 'provider hourly rain of the last 5 days and the 5 before them (model rain, not measured)';
export const STORM_GAP_H = 6;
export function stormsOf(hours, gapH = STORM_GAP_H) {   /* hours: [{ t: ms, mm }] sorted, one per hour; returns [{ start, end, mm }] */
  const out = []; let cur = null, dry = 0;
  for (const h of hours) { if (h.mm > 0) { if (!cur || dry >= gapH) { cur = { start: h.t, end: h.t, mm: 0 }; out.push(cur); } cur.mm += h.mm; cur.end = h.t; dry = 0; } else dry++; }
  return out.map((x) => ({ ...x, mm: Math.round(x.mm * 100) / 100 }));
}
export function hourlyComplete(hours, fromMs, toMs) { const want = Math.round((toMs - fromMs) / 3600e3); if (!(want > 0)) return false;
  const have = new Set(hours.filter((h) => h.t >= fromMs && h.t < toMs && isN(h.mm)).map((h) => h.t)); return have.size >= want; }
/* per-storm runoff over a window [fromMs, toMs): storms that START inside the window; AMC from the 120 h before each start (needs hours from fromMs - 120 h) */
export function stormRunoff(hours, fromMs, toMs, runoffOfAmc) {
  if (!hourlyComplete(hours, fromMs - 120 * 3600e3, toMs)) { const want = Math.round((toMs - fromMs) / 3600e3) + 120, have = new Set(hours.filter((h) => h.t >= fromMs - 120 * 3600e3 && h.t < toMs && isN(h.mm)).map((h) => h.t)).size;
    return { ok: false, why: 'hourly rain incomplete for the window and the 5 days before it', missingHours: Math.max(0, want - have) }; }
  const H = hours.filter((h) => h.t >= fromMs - 120 * 3600e3 && h.t < toMs).sort((a, b) => a.t - b.t);
  const storms = stormsOf(H).filter((x) => x.start >= fromMs && x.start < toMs); let q = 0; const per = [];
  for (const x of storms) { const a5 = H.filter((h) => h.t >= x.start - 120 * 3600e3 && h.t < x.start).reduce((a, h) => a + h.mm, 0), am = amcOf(a5);
    const qd = runoffOfAmc(x.mm, am); if (qd == null) return { ok: false, why: 'no runoff for a storm' }; q += qd; per.push({ start: new Date(x.start).toISOString(), mm: x.mm, rain5Mm: Math.round(a5 * 10) / 10, amc: am, runoffMm: Math.round(qd * 10) / 10 }); }
  return { ok: true, runoffMm: Math.round(q * 10) / 10, storms: per, method: 'NRCS runoff per storm (6 h dry spell separates storms) at each storm\u2019s own antecedent moisture' };
}
/* the run-off bands of the map scale (data/map-layer-scales.json nss_runoff.cuts, house bands: screening) -> level 0..4 */
export function runoffLevel(mm, cuts) { if (!isN(mm) || !Array.isArray(cuts)) return null; const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
  for (const c of cuts) if (c.min == null || mm >= c.min) { const i = c.idx != null ? c.idx : W.indexOf(c.level); return i < 0 ? null : i; } return null; }
export const SPONGE_LAYERS = ['nss_baseline', 'nss_dynamic', 'nss_runoff'];
/* v91.17.283.24 · self-audit H20 · the client caveat of each sponge view is the model gate's own (data/model-gate.json client_limitations of the
   entry that lists the layer), not a second wording typed here; days 1-3 say they hold day 0's observed state */
export function gateCaveat(gate, layer) { const E = gate && Array.isArray(gate.entries) ? gate.entries : Array.isArray(gate) ? gate : null; const e = E ? E.find((x) => x && Array.isArray(x.layers) && x.layers.includes(layer)) : null;
  return e && Array.isArray(e.client_limitations) && e.client_limitations.length ? String(e.client_limitations[0]) : null; }
export function applySponge(rec, { v2, rain5Of, runoffCuts, gate = null, hourlyOf = null }) {   /* v283.36 item 6: hourlyOf(uid) -> [{ t, mm }] where held */
  let replaced = 0; const d0 = rec.days[0]; if (!d0) return { replaced };
  /* v91.17.283.24 · audit leftover (sponge race) · the sponge layers are the server's: when the engine scored before its 250 m table had
     loaded and left a sponge layer out, the layer is made here from the tehsils of any layer of the day (each cell then set below or
     "not assessed"), instead of the view being dropped */
  const base = d0.layers.nss_baseline || d0.layers.nss_dynamic || Object.values(d0.layers).find((x) => x && x.L && typeof x.L === 'object'); if (!base) return { replaced };
  for (const key of SPONGE_LAYERS) if (!d0.layers[key]) d0.layers[key] = { L: Object.fromEntries(Object.keys(base.L).map((u) => [u, -1])), S: {} };
  const byUid = v2 && v2.units ? spongeIndex(v2) : null;
  for (const key of SPONGE_LAYERS) { const N = d0.layers[key]; if (!N) continue; let perStorm = 0, incompleteH = 0;
    for (const uid of Object.keys(N.L)) { const u = byUid ? byUid.get(uid) || null : null;
      if (!v2 || !v2.units) { setCell(N, uid, -1, null, 'not assessed: the 250 m curve-number table (sponge-tehsil.v2.json) is not loaded', null); replaced++; continue; }
      if (!u) { setCell(N, uid, -1, null, 'not in the 250 m curve-number table', null); replaced++; continue; }
      let amc = 2, extra = null, r5 = null, asOf = d0.date, late = null;
      if (key !== 'nss_baseline') { r5 = rain5Of ? rain5Of(uid, d0.date) : null;
        /* v91.17.283.35 · audit L7 · after PKT midnight yesterday's rain is not yet held as a past day: the last COMPLETE result is kept with
           its date and the state "input not current" (-6), never a blank with a wrong reason */
        if (!r5 || !isN(r5.mm)) { const prev = new Date(Date.parse(d0.date + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10); const r5p = rain5Of ? rain5Of(uid, prev) : null;
          if (r5p && isN(r5p.mm)) { r5 = r5p; asOf = prev; late = 'input not current: the model rain of the 5 days before ' + d0.date + ' is not complete yet (the day has just turned); the last complete result is that of ' + prev; }
          else { setCell(N, uid, -1, null, 'data missing: fewer than 5 days of model rain (not measured) are held for this tehsil', null); replaced++; continue; } } }
      if (key === 'nss_runoff' && hourlyOf && !(r5 && r5.source === 'imerg-late')) { const H = hourlyOf(uid);   /* sci43: satellite days are never mixed with model hours */
        /* v283.40 item 6: the window is the SAME 5 days as the per-day method (the 5 complete PKT days before asOf; v283.36 ended it a day
           later, inside the day not yet over, so it could never be complete); each storm's moisture from the 120 h before its start */
        const to = Date.parse(asOf + 'T00:00:00+05:00'), from = to - 5 * 864e5;
        const SR = H && H.length ? stormRunoff(H, from, to, (mm, am) => runoffOf(v2, u, mm, am)) : null;
        if (SR && SR.ok) { const L = runoffLevel(SR.runoffMm, runoffCuts); if (L != null) { const fct = { runoffMm: SR.runoffMm, storms: SR.storms, method: SR.method, rainBasis: HOURLY_BASIS, window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, asOf, screening: true }; if (late) setCell(N, uid, -6, null, late, fct); else setCell(N, uid, L, SR.runoffMm, null, fct); perStorm++; replaced++; continue; } }
        /* hourly rain held for this tehsil but not complete: fail closed (a missing hour is never filled, and the per-day method is not
           used in its place: the owner rule is runoff per storm) */
        if (H && H.length) { setCell(N, uid, -1, null, 'data missing: ' + (SR && SR.why ? SR.why : 'the hourly rain is not complete') + ' (' + (SR && SR.missingHours != null ? SR.missingHours + ' hours missing; ' : '') + 'runoff per storm needs every hour)', { incomplete: true, missingHours: SR ? SR.missingHours ?? null : null }); incompleteH++; replaced++; continue; } }
      if (key === 'nss_runoff') {
        /* v91.17.283.35 · item 7 · EVENT-BASED: the NRCS runoff of EACH day's rain at that day's antecedent moisture condition (the 5 days before
           it), summed over the 5 days (NRCS NEH-630 ch. 10 applies the equation to a storm, not to a 5-day total) */
        let q = 0, ok = true; const per = [];
        for (const x of r5.daily || []) { const a5 = rain5Of(uid, x.date), am = a5 && isN(a5.mm) ? amcOf(a5.mm) : null; if (am == null) { ok = false; break; }
          const qd = runoffOf(v2, u, x.mm, am); if (qd == null) { ok = false; break; } q += qd; per.push({ date: x.date, rainMm: x.mm, amc: am, runoffMm: qd }); }
        if (!ok || !(r5.daily || []).length) { setCell(N, uid, -1, null, 'data missing: the 5 days before one of the rain days are not all held, so its moisture condition is unknown', null); replaced++; continue; }
        q = Math.round(q * 10) / 10; const L = runoffLevel(q, runoffCuts);
        if (L == null) { setCell(N, uid, -1, null, 'the run-off bands are not loaded', null); replaced++; continue; }
        const fct = { runoffMm: q, rain5Mm: r5.mm, rainBasis: (r5 && r5.basis) || RAIN5_BASIS, perDay: per, method: 'NRCS runoff per day at its own antecedent moisture condition, summed (hourly rain not held: per day)', asOf, screening: true };
        if (late) setCell(N, uid, -6, null, late, fct); else setCell(N, uid, L, q, null, fct); replaced++; continue; }
      if (key === 'nss_dynamic') { amc = amcOf(r5.mm); extra = { rain5Mm: r5.mm, rainBasis: (r5 && r5.basis) || RAIN5_BASIS, amc: ['', 'I (dry)', 'II (usual)', 'III (wet)'][amc], asOf }; }
      const s = spongeOf(v2, u, amc); if (!s) { setCell(N, uid, -1, null, 'no land cells in the 250 m table', null); replaced++; continue; }
      if (late) setCell(N, uid, -6, null, late, { ...s, ...(extra || {}) }); else setCell(N, uid, s.cls, s.equivalentS, null, { ...s, ...(extra || {}) }); replaced++; }
    const cav = gateCaveat(gate, key);
    recount(N); if (key === 'nss_runoff') N.method = { perStorm, perDay: Object.keys(N.L).length - perStorm - incompleteH, hourlyIncomplete: incompleteH, stormGapH: STORM_GAP_H };
    N.basis = (key === 'nss_runoff' ? (perStorm ? 'run-off depth over the tehsil\'s 250 m cells: the NRCS runoff of each storm of the last 5 days (storms separated by a dry spell of ' + STORM_GAP_H + ' h or more) at its own antecedent moisture, summed; ' + HOURLY_BASIS + (perStorm < Object.keys(N.L).length ? '; where the hourly rain is not held yet: each day\'s runoff at its own antecedent moisture, summed (' + RAIN5_BASIS + ')' : '')
      : 'run-off depth over the tehsil\'s 250 m cells: the NRCS runoff of each of the last 5 days at its own antecedent moisture, summed; ' + RAIN5_BASIS)
      : 'equivalent retention S of the tehsil\'s 250 m cells (NRCS curve numbers, pixel first), classes at the group-C reference covers' + (key === 'nss_dynamic' ? ', at the antecedent moisture condition of the ' + RAIN5_BASIS : '')) + (cav ? '; ' + cav : ''); }
  /* observed state: days 1-3 carry day 0's record (no forecast of the sponge is issued) */
  for (const key of SPONGE_LAYERS) { const N0 = d0.layers[key]; if (!N0) continue;
    for (const d of rec.days.slice(1)) d.layers[key] = { ...N0, L: { ...N0.L }, S: { ...(N0.S || {}) }, held: (d.layers[key] && d.layers[key].held) ?? 0,
      ...(key !== 'nss_baseline' ? { heldFrom: d0.date, basis: N0.basis + '; the observed state of ' + d0.date + ' held for this day (no forecast of the sponge is issued)' } : {}) }; }
  return { replaced };
}

/* --------------------------------------------------------------------------------------------------------------------- GLOF (item 7) */
export const GLOF_OUTSIDE = 'outside the method\u2019s range: no mapped glacial lake lies in this tehsil or drains into it within the routed lake corridor (an outburst further upstream would arrive as a river flood, scored by river flooding)';
export function glofLadder(hs) { return (hs && hs.glofLadder) || null; }
/* v283.36 · NIGRAAN 1.0 · launch item 18 · GLOF LEVELS BECOME FACTS. The class ladder (monitor sum, tier cuts, reach factors, report
   lifetime) is untested: no tehsil gets a GLOF level. A tehsil that a mapped glacial lake lies in or drains into (HydroBASINS level-7
   chains, any distance: glofdrain.mjs) is "not tested" (-5) with the facts: lakes in the tehsil, lakes upstream, whether a lake is on
   the 100 km routed reach and its observed signal, the bulletin date. "Cannot happen here" (-4) only where no lake lies upstream at all. */
export const GLOF_FACTS_WHY = 'no outburst level is issued; the glacial lakes that drain here are shown';
/* v91.17.283.38 · item 8 · the exposure word of a tehsil inside the GLOF reach (data/glof-reach.json): facts, not a level */
/* v91.17.283.47 item 1: the words name the SUSCEPTIBILITY of the lakes (site context), not a warning level ("Priority" / "Watch" read as
   warning words and collided with the guidance ladder Watch = High) */
export const GLOF_EXPOSURE_WORD = { priority: 'site context: a high-susceptibility glacial lake drains here (susceptibility, not a warning level)', watch: 'site context: a moderate-susceptibility glacial lake drains here (susceptibility, not a warning level)', none: 'site context: low-susceptibility glacial lakes only' };
export const GLOF_OUTSIDE_REACH = 'cannot happen here: outside the mountain reach of glacial-lake outbursts (Gilgit-Baltistan, Azad Kashmir and the Khyber Pakhtunkhwa mountains)';
export function glofFactsText(u, dr, bulletin) {
  const p = [];
  if (dr && dr.lakesIn) p.push(dr.lakesIn + ' mapped glacial lake(s) in this tehsil'); else if (u && u.lakesInTehsil) p.push(u.lakesInTehsil + ' mapped glacial lake(s) in this tehsil');
  if (dr && dr.lakesUpstream) p.push(dr.lakesUpstream + ' mapped glacial lake(s) upstream in its drainage');
  if (dr && dr.tiers) { const t = dr.tiers; const q = []; if (t.t1) q.push(t.t1 + ' high'); if (t.t2) q.push(t.t2 + ' moderate'); if (t.t3) q.push(t.t3 + ' low'); if (q.length) p.push('susceptibility of those lakes: ' + q.join(', ')); }   /* v283.38 item 8 (the 100 km route is not a travel limit: no longer named) */
  if (u && u.signal) p.push('observed signal: ' + String(u.signal));
  if (u && Array.isArray(u.named) && u.named.length) p.push('lakes: ' + u.named.slice(0, 3).map((x) => (x && (x.name || x.id)) || x).join(', '));
  if (bulletin && bulletin.published) p.push('latest lake bulletin ' + bulletin.published);
  return p.join('; ');
}
export function applyGlof(rec, { nat, ladder, drain = null }) {
  const d0 = rec.days.find((d) => d.day === 0) || rec.days[0]; const G = d0 && d0.layers.glof; if (!G) return { replaced: 0 };
  let replaced = 0; const dOk = !!(drain && drain.ok);
  for (const uid of Object.keys(G.L)) { const u = nat && nat.units ? nat.units[uid] : null, dr = dOk ? drain.units[uid] : null;
    if (u && u.disputed) { setCell(G, uid, -1, null, 'not assessed: not scored (disputed territory)', null); replaced++; continue; }
    const connected = dr ? dr.connected : (u && u.applicable === true) ? true : null;
    if (connected === false) { if (dr && dr.inRegion === false) { setCell(G, uid, -4, null, GLOF_OUTSIDE_REACH, { lakesUpstream: 0, lakesIn: 0, outsideReach: true }); replaced++; continue; }
      setCell(G, uid, -4, null, 'cannot happen here: no mapped glacial lake lies in this tehsil or anywhere upstream of it', { lakesUpstream: 0, lakesIn: 0 }); replaced++; continue; }
    if (connected == null) { setCell(G, uid, -1, null, 'not available: ' + (!dOk ? 'the drainage map (HydroBASINS level 7) is not in this install' : 'this tehsil is not in the drainage table') + (u && u.applicable === false ? '; no lake within the 100 km routed reach (further upstream not checked)' : ''), null); replaced++; continue; }
    const facts = { lakesIn: dr ? dr.lakesIn : (u && u.lakesInTehsil) || 0, lakesUpstream: dr ? dr.lakesUpstream : null, onRoutedReach: !!(u && u.applicable === true), signal: (u && u.signal) || null,
      bulletin: nat && nat.bulletin ? nat.bulletin.published : null, exposure: (dr && dr.exposure) || null, tiers: (dr && dr.tiers) || null, text: glofFactsText(u, dr, nat && nat.bulletin) };
    const ew = facts.exposure && GLOF_EXPOSURE_WORD[facts.exposure];
    setCell(G, uid, -5, null, (ew ? ew + '; ' : '') + GLOF_FACTS_WHY + (facts.text ? ': ' + facts.text : ''), facts); replaced++; }
  recount(G); G.basis = 'glacial-lake outburst: facts only (the glacial lakes in and upstream of the tehsil by susceptibility, observed signals, bulletin date); where: Gilgit-Baltistan, Azad Kashmir and the Khyber Pakhtunkhwa mountains, drainage connectivity (data/glof-reach.json)';
  for (const d of rec.days) if (d !== d0 && d.layers.glof) d.layers.glof = { ...G, L: { ...G.L }, held: d.layers.glof.held ?? 0 };
  return { replaced };
}

/* ------------------------------------------------------------------------------------------------- combined flood (v91.17.283.47) */
/* NIGRAAN 1.0.8 item 2 · THE COMBINED FLOOD LEVEL FOLLOWS ITS COMPONENTS. The rule of the gate entry flood-composite (data/model-gate.json:
   "operator: max of pluvial and riverine pathways") with the display rules (31 Oct): a level only where tested. The page engine reported
   Normal (0) in all 576 tehsils while river flooding was "cannot happen" in 238 and "not tested" in 136 and local-rain flooding "not
   assessed" in 152. Per tehsil and day: a pathway that cannot happen there (-4) is left out; the combined level is the highest TESTED
   pathway level; Normal only when every pathway that can happen there is tested and Normal; a tested pathway above Normal is kept as the
   level with the untested pathways named (the flood there is at least that level); otherwise the state of the untested pathway (not
   tested -5, input not current -6, missing -1), never Normal. Both pathways cannot happen -> cannot happen (-4). NIGRAAN_FLOOD_COMBINE=0 = 1.0.7. */
export const FLOOD_PATHS = Object.freeze([['flood_riverine', 'river flooding'], ['flood_pluvial', 'flooding from local rain']]);
export function combineFloodCell(codes) {   /* codes: [[name, code|undefined, why|null]] -> { L, why, facts } */
  const can = codes.filter(([, c]) => c !== -4); const comp = Object.fromEntries(codes.map(([n, c]) => [n, c == null ? null : c]));
  if (!can.length) return { L: -4, why: 'cannot happen here: ' + codes.map(([n]) => n).join(' and ') + ' cannot happen here', facts: { components: comp } };
  const tested = can.filter(([, c]) => isN(c) && c >= 0), open = can.filter(([, c]) => !(isN(c) && c >= 0));
  const maxT = tested.length ? Math.max(...tested.map(([, c]) => c)) : null;
  if (!open.length) return { L: maxT, why: null, facts: { components: comp } };
  if (maxT != null && maxT > 0) return { L: maxT, why: null, facts: { components: comp, atLeast: true, notTested: open.map(([n]) => n) } };
  const nt = ([, c, w]) => c === -5 || (c === -1 && /not tested/i.test(String(w || '')));   /* a pathway "not assessed" because what it reads is not tested */
  const st = open.some(nt) ? -5 : open.some(([, c]) => c === -6) ? -6 : -1;
  const lead = (st === -5 ? open.find(nt) : open.find(([, c]) => c === st)) || open[0];
  const word = st === -5 ? 'level not tested here' : st === -6 ? 'input not current' : 'not assessed';
  return { L: st, why: word + ': ' + lead[0] + (lead[2] ? ' (' + String(lead[2]).replace(/^(level not tested here|not tested here|not tested|not assessed|input not current)\s*:?\s*/i, '') + ')' : ' has no tested level here') + (maxT === 0 ? '; the tested pathway is Normal' : ''), facts: { components: comp, ...(maxT === 0 ? { testedNormal: tested.map(([n]) => n) } : {}) } };
}
export function applyFloodCombined(rec) { let n = 0; if (process.env.NIGRAAN_FLOOD_COMBINE === '0') return { replaced: 0, off: true };
  for (const d of rec.days || []) { const F = d.layers && d.layers.flood; if (!F || !F.L) continue;
    for (const uid of Object.keys(F.L)) { const codes = FLOOD_PATHS.map(([k, name]) => { const X = d.layers[k]; const c = X && X.L ? X.L[uid] : undefined; return [name, c, X && X.why ? X.why[uid] || null : null]; });
      const r = combineFloodCell(codes); const S0 = F.S ? F.S[uid] : null; setCell(F, uid, r.L, r.L >= 0 && S0 != null ? S0 : null, r.why, r.facts); n++; }
    recount(F); F.basis = 'the highest tested level of river flooding and flooding from local rain (a pathway that cannot happen here is left out; no Normal where a pathway is not tested)'; }
  return { replaced: n }; }

/* ---------------------------------------------------------------------------------------------------------------- wind (v283.35) */
/* audit L5 / item 6 · the page engine withholds wind above 1,500 m (hzWind: measured against mountain stations the model gust raised 19
   false alarms in 20); the cell came as -2 with no reason. It is NOT TESTED HERE (-5), with the reason. The levels themselves (gust ladder,
   1.5 gust factor) are untested house constants (formula-registry wind.ladder "ASSUMED"): every wind level is labelled indicative and
   raises no alert (served.mjs annotate / NO_CLIENT_ALERT). */
export const WIND_WITHHELD_WHY = 'not tested here: wind is not scored above 1,500 m (measured against mountain stations the model gust raised 19 false alarms in 20 at 40 km/h and the model sustained wind ran at half the observed speed)';
/* v283.36 · NIGRAAN 1.0 · launch item 17 · THE GUST LADDER IS NO LONGER A LEVEL ANYWHERE. Its breakpoints (40/62/89/118/160/220 km/h) are
   assumed, not fitted, and the 1.5 gust-from-wind factor has no source: every wind cell is "not tested" (-5) with the reason; the client
   reads the gust p10/p50/p90 km/h (members) and, below 1,500 m, the chance of exceeding a limit the client registered. */
export const WIND_LADDER_WITHHELD_WHY = 'not tested: the wind level ladder (gust breakpoints) has no tested basis; the gust is shown in km/h (members p10 / p50 / p90) and against any limit you registered';
export function applyWind(rec) { let n = 0;
  for (const d of rec.days || []) { const W = d.layers && d.layers.wind; if (!W || !W.L) continue;
    for (const uid of Object.keys(W.L)) { const mtn = W.L[uid] === -2 || (W.L[uid] === -5 && /1,500 m/.test(String((W.why && W.why[uid]) || WIND_WITHHELD_WHY)));
      setCell(W, uid, -5, null, mtn ? WIND_WITHHELD_WHY : WIND_LADDER_WITHHELD_WHY, null); n++; }
    recount(W); W.basis = 'withheld: no wind level (gust values in km/h instead)'; }
  return { replaced: n }; }

/* ------------------------------------------------------------------------------------------------------------------------- service */
export function createHazSci(app, { dataDir }) {
  const on = () => process.env.NIGRAAN_HAZSCI !== '0';
  const cache = new Map();
  const load = (f) => { const p = join(dataDir, f); try { const mt = statSync(p).mtimeMs; const c = cache.get(f); if (c && c.mt === mt) return c.v; const v = JSON.parse(readFileSync(p, 'utf8')); cache.set(f, { mt, v }); return v; } catch (_) { return null; } };
  const last = { at: null, layers: {} };
  /* v283.36 item 18 · drainage connectivity of every tehsil to the mapped glacial lakes (cached per file set) */
  let DR = null, DRkey = null;
  /* v91.17.283.38 · item 8 · the GLOF reach (data/glof-reach.json, owner decision 30 Oct): Gilgit-Baltistan, Azad Kashmir and the Khyber
     Pakhtunkhwa mountain tehsils (terrain zone, Koerner et al. 2011) that a mapped glacial lake (not classed 'not-glacial') lies in or drains
     into; every other tehsil cannot have a GLOF. Each unit carries its lakes upstream by susceptibility tier and its exposure word. */
  const glofDrain = () => { const hb = load('hybas_pk_lev07.json'), rg = load('glof-register-current.json') || load('glof-register-merged.json') || load('glof-register-open.json'), th = load('pk-tehsils.json');
    const reach = load('glof-reach.json'), tz = load('tehsil-terrain-zone.json'), rel = load('glof-lake-relevance.json');
    const key = [hb, rg, th, reach, tz, rel].map((x) => (x ? 1 : 0)).join(''); if (DR && DRkey === key && DR._hb === hb && DR._rg === rg && DR._reach === reach) return DR;
    try { const ex = new Set((reach && reach.excludeRelevanceClasses) || []), RL = (rel && rel.lakes) || {};
      const lakes = rg && Array.isArray(rg.lakes) ? rg.lakes.filter((L) => !(RL[L.id] && ex.has(RL[L.id].class))).map((L) => ({ id: L.id, lat: L.lat, lon: L.lon, tier: L.tier })) : [];
      const MS = new Map(); for (const v of Object.values((tz && tz.units) || {})) if (v && v.uid) MS.set(v.uid, Number(v.mountainShare));
      const inRegion = reach ? (uid) => { const prov = String(uid).split('|')[0]; if ((reach.regionProvinces || []).includes(prov)) return true;
        if ((reach.mountainProvinces || []).includes(prov)) { const m = MS.get(uid); return Number.isFinite(m) && m >= Number(reach.mountainShareMin ?? 0.5); } return false; } : null;
      DR = hb && th && lakes.length ? drainageUnits(hb, lakes, th, inRegion ? { inRegion } : {}) : { ok: false, why: 'drainage inputs missing' };
      if (DR.ok && reach) DR.reach = { rule: reach.rule, source: reach.reachSource, version: reach.version }; } catch (e) { DR = { ok: false, why: String(e && e.message || e) }; }
    Object.defineProperty(DR, '_hb', { value: hb, enumerable: false }); Object.defineProperty(DR, '_rg', { value: rg, enumerable: false }); Object.defineProperty(DR, '_reach', { value: reach, enumerable: false }); DRkey = key; return DR; };
  function inputs() {
    const link = load('river-link.json');
    const app_ = load('hazard-applicability.json'); const mask = app_ && app_.layers && app_.layers.landslide ? app_.layers.landslide.units : {};
    return { link, mask, app_, lsGroups: load('landslide-groups.json'), lsPossible: load('landslide-possible.json'), chirps: load('drought-chirps.json'), v2: load('sponge-tehsil.v2.json'), hs: load('hazard-scale.json'), dnat: load('drought-national.json'), scales: load('map-layer-scales.json') };
  }
  function apply(rec) {
    if (!on() || !rec || !Array.isArray(rec.days)) return { applied: false };
    const I = inputs(); const out = {};
    /* v91.17.283.35 · A5 / item 5 · the area values (heat, cold, comfort) are applied to every revision too, so a held record never keeps a page
       engine heat level or lacks the comfort layer between two area passes */
    try { if (app.areaHeat && app.areaHeat.apply) out.area = app.areaHeat.apply(rec); } catch (e) { out.area = { error: String(e && e.message || e).slice(0, 160) }; }
    const OWN = { wind: ['wind'], flood_riverine: ['flood_riverine'], rain_hz: ['rain_hz'], landslide: ['landslide'], drought: ['drought', ...Object.keys(DTYPE_VIEWS)], sponge: SPONGE_LAYERS, glof: ['glof'] };
    const step = (k, f) => { try { out[k] = f(); } catch (e) { const m = String(e && e.message || e).slice(0, 160);
      out[k] = { error: m, failed: failLayer(rec, OWN[k] || [k], 'not assessed: the server method for this layer failed in this run (' + m + ')') }; } };
    const RO = load('river-outlook.json'); const gauges = {}; for (const g of (RO && RO.gauges) || []) gauges[g.id] = gaugeCurrent(gaugeAge(g, RO.basedOn));
    /* v91.17.283.23 · self-audit H4 · a reach forecast older than the river stale rule is not used (it was served as current for days) */
    const dayView = (gid, date) => { try { const F = app.flood && app.flood.forecastDays(gid); if (!F) return null;
      const ageH = (Date.now() - Date.parse(F.at)) / 3600e3; if (!(ageH <= RIVER_STALE_H)) return { classWhy: 'the river forecast of this reach is ' + (isFinite(ageH) ? Math.round(ageH) + ' h' : 'of unknown age') + ' old (more than ' + RIVER_STALE_H + ' h): not used' };
      const fd = F.days.find((x) => x.date === date); return fd ? app.flood.dayView(gid, fd) : null; } catch (_) { return null; } };
    const sheet = (g) => { try { return app.riverSheet ? app.riverSheet.measuredFor(g) : null; } catch (_) { return null; } }, today = pktToday();
    const rMask = I.app_ && I.app_.layers && I.app_.layers.flood_riverine ? I.app_.layers.flood_riverine.units || {} : {};
    step('flood_riverine', () => applyRiver(rec, { link: I.link, signalOf: (g, date) => reachSignal(g, date, { gauges, dayView, sheet, today, skill: STATUS_SKILL }), handOf: (uid) => { try { return app.hand ? app.hand.of(uid) : null; } catch (_) { return null; } },
      maskOf: (uid) => (rMask[uid] && rMask[uid].applies === false ? rMask[uid] : null) }));
    step('rain_hz', () => applyRain(rec, app.outlook && app.outlook.dayRows ? app.outlook.dayRows() : null, { detCoefs: load('rain-prob-coefs-ifsdet.json'), det: detOf(), rl: load('rain-return-levels.json'), coefs: load('rain-prob-coefs.json'), zoneCoefs: load('rain-prob-coefs-ifsdet-zones.json') }));
    /* v91.17.283.31 · item 2.6 · flooding from local rain reads the day's rain: where the rain level is not assessed, that flood level is
       not assessed either (same state, the rain's reason), never a Normal resting on an unknown rain */
    step('flood_pluvial', () => { let n = 0; for (const d of rec.days) { const P = d.layers.flood_pluvial, R = d.layers.rain_hz; if (!P || !R) continue;
        for (const uid of Object.keys(P.L)) { const r = R.L[uid]; if (r == null || r >= 0 || P.L[uid] < 0) continue;
          setCell(P, uid, r === -6 ? -6 : -1, null, 'not assessed: the rain this level reads is not assessed for this day (' + ((R.why && R.why[uid]) || 'no rain level') + ')', null); n++; }
        recount(P); } return { replaced: n }; });
    step('landslide', () => applyLandslide(rec, { mask: I.mask, groups: I.lsGroups, possible: I.lsPossible, odds: app.landslideOdds ? app.landslideOdds.national() : null }));
    let DN = null; try { DN = app.climatology && app.climatology.droughtNational ? app.climatology.droughtNational() : null; } catch (_) { DN = null; }
    step('drought', () => applyDrought(rec, { chirps: I.chirps, soilOf: (uid) => (I.dnat && I.dnat.units && I.dnat.units[uid] && I.dnat.units[uid].smRoot) || null,
      dtypeOf: (uid) => (DN && DN.ready && DN.spi && DN.spi[uid] && DN.spi[uid].dtype) || null }));
    step('sponge', () => applySponge(rec, { hourlyOf: app.rainHourly && typeof app.rainHourly.of === 'function' ? (uid) => app.rainHourly.of(uid) : null, v2: I.v2, runoffCuts: I.scales && I.scales.layers && I.scales.layers.nss_runoff ? I.scales.layers.nss_runoff.cuts : null, rain5Of: (uid, date) => (imergRain5(dataDir, uid, date) || null) || (app.rainHistory ? app.rainHistory.rain5(uid, date) : app.landslideOdds && app.landslideOdds.rain5 ? app.landslideOdds.rain5(uid, date) : null)   /* v283.31 · 1.1 · the shared rain history (all tehsils) */, gate: load('model-gate.json') }));
    step('wind', () => applyWind(rec));
    step('flood', () => applyFloodCombined(rec));   /* v91.17.283.47 item 2: after both pathways are final */
    step('glof', () => applyGlof(rec, { nat: app.glof && app.glof.national ? app.glof.national() : null, ladder: glofLadder(I.hs), drain: glofDrain() }));
    try { imergShadow(dataDir, (uid, date) => (app.rainHistory ? app.rainHistory.rain5(uid, date) : app.landslideOdds && app.landslideOdds.rain5 ? app.landslideOdds.rain5(uid, date) : null)); } catch (_) {}   /* v283.45 · IMERG past rain SHADOW (logged, never served; outside step(): the record is untouched) */
    rec.hazSci = { applied: true, at: new Date().toISOString(), layers: out, version: '91.17.283.36' }; last.at = rec.hazSci.at; last.layers = out;
    return rec.hazSci;
  }
  /* the IFS deterministic PKT-day total of a tehsil point for method d: the tehsil point and the served zone rule (mos.zoneOfPoint) the
     ensemble rows use; a date outside lead 1-3 of the newest held 00 UTC run has none */
  /* v91.17.283.28 · S5 · the method-d input at ANY point (a tehsil point or a site's own coordinate and height): one function */
  function detAt(lat, lon, elevM, date) {
    if (!app.ecmwf010 || !app.ecmwf010.pktDayTotals || lat == null || lon == null) return null;
    let T = null; try { T = app.ecmwf010.pktDayTotals(lat, lon); } catch (_) { T = null; } const x = T && T.days ? T.days[date] : null; if (!x) return null;
    let zone = null; try { zone = app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(lat, lon, elevM ?? null) : null; } catch (_) { zone = null; }
    return { mm: x.mm, lead: x.lead, run: x.run || T.run, ...(x.fromPreviousRun ? { fromPreviousRun: true } : {}), zone, month: Number(String(date).slice(5, 7)) };
  }
  function detOf() {
    if (!app.ecmwf010 || !app.ecmwf010.pktDayTotals) return null;
    const U = new Map(((app.units && app.units.tehsil) || []).map((u) => [u.unitId, u]));
    return (uid, date) => { const u = U.get(uid); if (!u || u.lat == null || u.lon == null || u.disputed) return null; return detAt(u.lat, u.lon, u.elevM ?? null, date); };
  }
  /* the method-d cell of a site's own point and day (the code the tehsil cells use: detCell); null where the method is not defined there */
  /* o.mm: a scenario's day total in place of the forecast one (scenario.mjs); the zone and the lead are still the point's */
  function rainAt(lat, lon, elevM, date, lead, o = {}) { const Cd = load('rain-prob-coefs-ifsdet.json'); if (!Cd) return { why: 'the method-d coefficients (data/rain-prob-coefs-ifsdet.json) are not in this install' };
    if (!(lead >= 0 && lead <= 3)) return { why: 'the calibrated chance is defined for lead days 1-3 of a 00 UTC run (today: the previous run at lead 1) only (method d)' };
    let D = detAt(lat, lon, elevM, date);
    if (isN(o.mm)) { let zone = D ? D.zone : null; if (!D) try { zone = app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(lat, lon, elevM ?? null) : null; } catch (_) { zone = null; }
      D = { mm: o.mm, lead, run: D ? D.run : null, zone, month: Number(String(date).slice(5, 7)), scenario: true }; }
    if (!D) return { why: 'no IFS 00 UTC day total held for this point and day' };
    const c = detCell(Cd, D, null, load('rain-prob-coefs-ifsdet-zones.json'));   /* v283.31 · the zone cells (mountain 15.6, plains 64.5) */
    if (c && c.L === -5) return { why: c.why, notTested: true };
    return c ? { cell: c, det: D } : { why: 'the method-d chance could not be computed for this day (zone: ' + (D.zone || 'unknown') + ')' }; }
  function riverLink(uid) { const L = load('river-link.json'); if (!L) return { ready: false, why: 'data/river-link.json is not in this install' };
    const u = L.units[uid]; if (!u) return { ready: false, why: 'unknown tehsil ' + uid };
    let hand = null; try { hand = app.hand ? app.hand.of(uid) : null; } catch (_) {}
    return { ready: true, unit: uid, version: L.version, reaches: u.reaches, modelChannelCells: u.modelChannelCells, disputedChannelCells: u.disputedChannelCells,
      floodplainShare: hand ? hand.floodplainShare ?? null : null, handFactor: hand ? hand.factor ?? null : null,
      offFloodplain: !!(hand && isN(hand.floodplainShare) && hand.floodplainShare <= 0), method: L.method }; }
  /* v283.27 item 1: a tehsil's rain return levels (every duration, labelled point or area) for the place bundle (part rainRarity) */
  function rainLevels(uid) { const RL = load('rain-return-levels.json'); if (!RL || !RL.units) return { ready: false, why: 'the rain return levels (data/rain-return-levels.json) are not in this install' };
    const U = RL.units[uid]; if (!U) return { ready: false, why: 'no rain return levels for this tehsil' };
    const dur = {}; for (const k of ['1h', '3h', '6h', '24h']) { const E = U[k]; if (!E) continue;
      dur[k] = { areaRl: E.areaRl || null, ...(Array.isArray(E.pointRl) ? { pointRl: E.pointRl } : {}), years: E.years ?? null,
        scale: Array.isArray(E.pointRl) ? 'point level (station scale, tested gauge factor) and area level' : 'area rain (about 10 km): not a point level' }; }
    return { ready: true, unit: uid, zone: U.zone || null, returnPeriods: RL.returnPeriods, durations: dur, rarityRule: RL.rarityRule || null,
      source: 'satellite rain estimate 2001-2025 (25 years), annual maxima, GEV by L-moments', limits: RL.limits || [] }; }
  function status() { return { on: on(), at: last.at, layers: last.layers, inputsSig: last.sig || null }; }
  /* v91.17.283.23 · self-audit H16 · the held issue takes new inputs as a new revision (engine.revise: written and archived): a new river
     sheet, river model run, ensemble run, drought month, sponge table or lake record is applied without waiting for the next engine
     report. The signature is the inputs' file times and run times; nothing is recomputed while it is unchanged. */
  function inputsSig() { const m = (f) => { try { return statSync(join(dataDir, f)).mtimeMs; } catch (_) { return 0; } };
    let fa = null, ea = null; try { fa = app.flood && app.flood.status ? ((app.flood.status().forecast || {}).at || null) : null; } catch (_) {} try { const r = app.outlook && app.outlook.dayRows ? app.outlook.dayRows() : null; ea = r ? r.at : null; } catch (_) {}
    let dr = null; try { dr = app.ecmwf010 && app.ecmwf010.run00 ? app.ecmwf010.run00() : null; } catch (_) {}   /* v283.24: a new 00 UTC run (method d) */
    let sh = null; try { const S = app.riverSheet ? app.riverSheet.stations() : null; sh = S && S.ready ? S.newest : null; } catch (_) {}   /* v283.35: a new sheet day, a new PKT day */
    return pktToday() + '|' + sh + '|' + ['river-link.json', 'river-outlook.json', 'drought-chirps.json', 'drought-national.json', 'sponge-tehsil.v2.json', 'hazard-scale.json', 'hazard-applicability.json', 'landslide-groups.json', 'landslide-possible.json', 'landslide-rain.json', 'rain-prob-coefs-ifsdet.json', 'rain-return-levels.json'].map(m).join(',') + '|' + fa + '|' + ea + '|' + dr; }
  async function refreshIfNew() { if (!on() || !app.engine || !app.engine.revise || !app.engine.latest || !app.engine.latest()) return { started: false };
    const sig = inputsSig(); if (last.sig === sig) return { started: false, same: true }; const first = last.sig == null; last.sig = sig; if (first) return { started: false, baseline: true };
    app.engine.revise('server hazard science: new inputs', (rec) => apply(rec)); return { started: true }; }
  schedule(app, 'hazsci-inputs', 15 * 60e3, () => refreshIfNew(), { firstMs: 5 * 60e3, label: 'hazard science: apply new inputs to the held issue' });
  /* the report held from before a restart is served at once with these values (not only from the next engine report) */
  setTimeout(() => { try { const L = app.engine && app.engine.latest ? app.engine.latest() : null; if (L && !(L.hazSci && L.hazSci.version === '91.17.283.36')) {
    if (app.engine.revise) app.engine.revise('server hazard science ' + '91.17.283.36' + ' applied to the record held from before a restart', (rec) => apply(rec)); else apply(L); } } catch (_) {} }, 0).unref?.();   /* v283.23 audit 1: a new revision, archived */
  /* v91.17.283.49 · 1.0.10 data item 2 · THE MAP'S DROUGHT CELL FOR ONE TEHSIL. The site-risk row read levelOfScore(drought.score), but
     the drought class carries no score since v283.36 (score: null, the USDM category of the index itself), so every tehsil with a drought
     reading fell to the "Drought index not defined (arid climate)" text (Islamabad, SPI-3 +0.97). Every reader of a tehsil's drought now
     takes this cell: the same CHIRPS SPI-3, the same USDM bounds (levelOfSpi), the same arid / provisional / overdue states as the map. */
  function droughtAt(uid, today = null) {
    const I = inputs(); const ch = I.chirps; if (!ch || !ch.units) return { L: -1, why: 'data/drought-chirps.json is not in this install', facts: null };
    const mb = ch.monthBasis || null, prelim = !!(mb && mb.prelim), age = droughtMonthAge(mb && mb.month, today || pktToday());
    let c = droughtCell(ch.units[uid], (I.dnat && I.dnat.units && I.dnat.units[uid] && I.dnat.units[uid].smRoot) || null);
    if (c.facts) c.facts = { ...c.facts, prelim };
    if (age.overdue && c.L >= 0) c = { L: -6, why: 'input not current: the drought month held is ' + mb.month + (prelim ? ' (preliminary)' : '') + '; a newer month was due by ' + age.dueBy, facts: c.facts };
    const m = ch.units[uid] && ch.units[uid].monthly && ch.units[uid].monthly.month;
    return { ...c, mm: m && m.spi3 && m.spi3.mm != null ? m.spi3.mm : null, climMm: m && m.spi3 && m.spi3.climMm != null ? m.spi3.climMm : null, month: mb ? mb.month : null, prelim };
  }
  return { apply, status, riverLink, refreshIfNew, rainLevels, rainAt, detAt, glofDrain, droughtAt };
}
