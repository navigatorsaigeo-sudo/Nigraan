import { alignBatch } from './provider.mjs';
/* ════════════════════════════════════════════════════════════════════════════
   RIVERINE FLOOD — GloFAS on snapped main-stem reaches, with return periods.

   v91.17.3 · Stage 2A.1 / 3.1.

   WHY THIS EXISTS, AND WHY IT IS NOT THE OLD FLOOD LAYER.

   The browser asked the flood API at tehsil centroids and read the number it
   got back. Two things were wrong with that and they pull in opposite
   directions.

   1. A CENTROID IS NOT A RIVER. GloFAS is a 5 km grid and only the cells the
      model routes water through carry discharge; every other cell returns
      0 m³/s. Measured at Guddu Barrage (28.42, 69.72), the nominal structure
      coordinate returns 0.0 while the Indus main stem 12 km away carries
      5,570 m³/s. A zero that means "not a river cell" and a zero that means
      "the river is dry" are the same number, and the old layer could not tell
      them apart.

   2. THE MOUNTAIN TRIBUTARIES CARRY NO SIGNAL. Measured against eight mountain
      gauges, the day-to-day CHANGE in GloFAS discharge correlates with the
      observed change at 0.00. Not weakly — not at all. At 5 km the model
      cannot resolve a Gilgit or Swat tributary, so a number it produces there
      is an artefact of routing, not a forecast.

   So this module does one thing and refuses the other. It publishes riverine
   flood on MAIN STEMS AND BARRAGES, where the catchment is large enough for a
   5 km model, at points snapped to the modelled channel. It publishes nothing
   for mountain tributaries and says why.

   HOW A NUMBER BECOMES A STATEMENT.
   A discharge in m³/s means nothing to a reader without a scale. The scale is
   the point's own record: 1984-2025 daily discharge from the GloFAS
   reanalysis, reduced to annual maxima and fitted with a Gumbel distribution
   by the method of moments, giving return levels at 1.5, 2, 5, 10, 20 and
   50 years. Every forecast day is then reported as which return level the
   ENSEMBLE MEMBERS cross and what share of them cross it.

   WHAT THIS IS NOT. The return levels are fitted to the MODEL's own
   reanalysis, not to gauge records, because WAPDA discharge is not in this
   build. So "a 10-year flood" here means "a discharge this model exceeds
   about once a decade in its own 42-year record", which is a defensible
   scale for change but is not a calibrated flood frequency. Every response
   says so. Nothing here is an official flood warning; the Flood Forecasting
   Division issues those.
   ════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const RP = [1.5, 2, 5, 10, 20, 50];
/* MEASURED, not assumed: the GloFAS archive on this plan returns null before
   1997-01-01. A 1984 start fetched thirteen years of nulls and paid for them —
   the call is weighted by days, so that was about 30% of the cost of every
   refit buying nothing. 1997 onward gives 30 annual maxima, which is a
   defensible sample for a two-parameter fit and a thin one for a 50-year
   level; the 50-year return level is published with that caveat attached. */
const HIST_START = '1997-01-01';
/* == v91.17.3 . THE SNAP RULE, AND WHY THE FIRST ONE WAS WRONG ==============
   The first rule was "the highest-discharge cell within 33 km". Measured, it
   moved points a median of 32 km and produced confidently wrong rivers:

     Sidhnai Barrage (Ravi)  -> the CHENAB, 41 km away, same cell as Trimmu
     Gilgit and Danyor       -> the same INDUS cell, 40 km away
     Nowshera (Kabul)        -> the Indus, 33 km south

   A headworks on the Ravi that reports the Chenab's discharge is worse than
   one that reports nothing, because the number is plausible.

   The rule is now NEAREST, not largest: search outward from the nominal point
   and take the nearest cell carrying at least MIN_SHARE of the largest
   discharge in the search area. The share excludes a trickle in an irrigation
   cell without letting a bigger river two rings out win. A point with no
   qualifying cell inside MAX_SNAP_KM is REFUSED and says so, rather than
   being moved onto whatever the model does route nearby. */
const SNAP_STEP = 0.05, SNAP_RING = 6;
const MIN_SHARE = 0.20, MAX_SNAP_KM = 15, LOCAL_KM = 8;

const r1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);

/* ══ v91.17.70 · Sprint 1 · RIVER FLOW IS SCORED AS RARITY IN THE MODEL'S OWN RECORD ══════════════════════
   The customer class for a reach is no longer a model discharge in m³/s, nor a model flow placed on the official
   barrage limits. It is how rare the flow is in the SAME model's own 1997-onward record at the SAME cell
   (data/river-rarity.json, station-lake/scripts/river_rarity.py; GloFAS / Copernicus CEMS, licence and
   attribution in that file's header). A multiplicative model bias at a reach cancels:
     - lower Indus: the model runs 1.5-3x the barrage inflow (no canal withdrawal), and its own 2-year flow sat in
       the official "High" band, so an ordinary monsoon read High. [measured, river_rarity.py internal check:
       Guddu/Sukkur/Kotri false-High station-days 5.7 % -> 0.0 %, exact class match 0.41 -> 0.61, 723 station-days
       2024-06-16 to 2025-10-15]
     - Chenab, Ravi, Sutlej, Jhelum: the model runs 2-13x low; the m³/s return levels it printed described a river
       the model does not have. They now read as a rarity class, with no model discharge shown.
   Ladder (a priori, not fitted to any gauge): Act >= the model's 5-year flow; Watch >= its 2-year flow;
   Monitor >= its half-month 95th-percentile daily flow; Low otherwise. The day's class uses the ensemble median.
   Model discharge numbers and return levels in m³/s are served only with NIGRAAN_INTERNAL_REF=1 (internal
   testing); the official barrage limits are never read on this path. */
/* v91.17.71 · refmode.mjs: the model m³/s numbers stay an internal display (internalNames(), as in v70). The v70 fix is
   kept: MODEL flow is scored against the model's own record, never against the official gauge limits (the lower-Indus
   false "High" came from that comparison). The official limits would apply only to a GAUGED OBSERVED flow; no observed
   river feed is wired into this module (the bulletin archive in data/obs is not live), so there is nothing to score. */
import { stationData, internalNames } from './refmode.mjs';
import { schedule } from './scheduler.mjs';
import { screeningCuts } from './scalecuts.mjs';   /* v283.24 H17 */
const INTERNAL_REF = () => internalNames();
export const RIVER_LEVELS = ['Low', 'Monitor', 'Watch', 'Act'];
/* v91.17.283.23 · self-audit H4 · ONE stale rule for the river model forecast: older than this it is not served as current (river chance,
   river level, report) */
export { RIVER_STALE_H } from './dataage.mjs';   /* v283.36 item 29: one data-age table (was 30 h here and again in floodextent.mjs) */
const RARITY_WORDS = { Low: 'no flood signal', Monitor: 'high for the time of year',
  Watch: 'rare flow: a 5-year model flow or more, when the river most often reached Medium flood', Act: 'rare flood flow: a 5-year flow or rarer for this reach' };
/* v283.10 · RIVER DATE FRAME (operator note; data/evidence/glofas28310, scripts/tests28310/glofas).
   GloFAS stamps a daily mean at the END of its 24 h (ECMWF). The provider keeps that stamp for its forecast product, so its GMT
   label D holds the mean of UTC day D-1 (00-24 UTC = 05:00 PKT D-1 to 05:00 PKT D). Until v283.9 the server asked for
   timezone Asia/Karachi, which moves every daily label one more day: the river row shown as day D held the mean of UTC day D-2
   (live check 23 Oct 2026, 16/16 gauges; archive 2024-26, 51/57 gauge-years). The river sheet of day D is read at 06:00 PKT
   (01:00 UTC on D); the mean of UTC day D-1 ends one hour before it and pairs with it best (R6: r 0.051 vs 0.037 for day D,
   35 of 57 gauge-years). From v283.10 the river forecast is requested in GMT and the client day D shows that mean (R7: map level
   vs the gauge class, 2024-26, 5,390 client-visible gauge-days, |error| 0.2354 -> 0.2334, change -0.0020 [-0.0045, -0.0002];
   no gauge worse beyond its interval). Rows dated before the Pakistan date are dropped, so day 0 stays today in Pakistan.
   Not refitted for the one-day move: river-rarity.json half-month bins (built on the old labels; a 1-2 day bin shift moves the
   half-month p95 by a median 0.6-1.7 %) and river-prob-model.json (withheld; its pairing must be refitted before any release). */
export const RIVER_TZ = 'GMT';
export const RIVER_DATE_FRAME = { since: 'v283.10', requestTimezone: 'GMT', clientDayD: 'GloFAS mean of UTC day D-1 (05:00 PKT D-1 to 05:00 PKT D)',
  pairedWith: 'the 06:00 PKT river sheet of day D', before: 'until v283.9 (timezone Asia/Karachi) day D held the mean of UTC day D-2: two days earlier than its label',
  evidence: 'data/evidence/glofas28310/{live_frame,gauge_pairing}.json' };
const pktToday = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
/* one location's daily block, rows before the Pakistan date dropped, at most 30 days (every daily array sliced alike) */
export function riverDaysFromToday(d, today = pktToday(), maxDays = 30) {
  if (!d || !Array.isArray(d.time)) return d || {};
  let i0 = 0; while (i0 < d.time.length && String(d.time[i0]) < today) i0++;
  const out = {}; for (const [k, v] of Object.entries(d)) out[k] = Array.isArray(v) ? v.slice(i0, i0 + maxDays) : v;
  return out;
}

export function halfMonthBin(iso) { const m = Number(String(iso).slice(5, 7)), d = Number(String(iso).slice(8, 10)); return (m >= 1 && m <= 12) ? (m - 1) * 2 + (d > 15 ? 1 : 0) : null; }
/* one reach's rarity class for a flow on a date; R = the reach record of data/river-rarity.json */
/* v91.17.226 · audit D-18 · ONE RIVER LEVEL. The map level of a reach's flow is read here from data/river-level-scale.json (the same
   knots and the same shared map cuts the page's riverRatio() uses) and served with the class, so the AI, the API and the page say
   the same word for the same flow: the 5-year model flow is Moderate (most often Medium flood in the bulletins), the 20-year flow
   High, 1.5 x the 20-year flow Severe. The AI used to map the class Watch through the generic alert ladder to High. */
let RLS_FILE = new URL('../../data/river-level-scale.json', import.meta.url);   /* the server's data directory replaces this at start */
let _rls = null, _rlsAt = 0;
function riverScale() {
  if (!_rls || Date.now() - _rlsAt > 10 * 60e3) { _rlsAt = Date.now(); try { _rls = JSON.parse(readFileSync(RLS_FILE, 'utf8')); } catch { /* keep the last */ } }
  return _rls;
}
export const RIVER_MAP_WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
/* v91.17.283.24 · H17 · the shared map cuts: data/hazard-scale.json screeningCuts / 100 (scalecuts.mjs, the one home) */
const riverMapCuts = () => { const c = screeningCuts(); return c ? c.map((x) => x / 100) : null; };
export function riverLevel(R, q, dateIso) {
  const S = riverScale(); if (!S || !Array.isArray(S.knots) || !R || !R.levels || q == null || !isFinite(q)) return null;
  const lv = R.levels, b = halfMonthBin(dateIso), bin = (b != null && R.seasonal) ? R.seasonal[b] : null;
  if (!(lv.rp2 > 0 && lv.rp5 > 0 && lv.rp20 > 0) || !bin) return null;
  const e = (x) => x * (1 - 1e-4), p95 = Math.min(bin[3], lv.rp2 * 0.98);
  const X = { p80: bin[1], p90: bin[2], p95, 'rp2-': e(lv.rp2), rp2: lv.rp2, 'rp5-': e(lv.rp5), rp5: lv.rp5, 'rp20-': e(lv.rp20), rp20: lv.rp20, 'rp20x1.5': lv.rp20 * 1.5 };
  /* v283.36 · launch item 21 · the 1.5 x 20-year step (Severe) is withheld: no source, no such days in the record. The ladder tops out at
     the 20-year model flow (High, itself an untested rung, said so); a flow beyond it is "beyond the 20-year model flow" with no higher level */
  const k = S.knots.filter((a) => a[0] !== 'rp20x1.5').map((a) => [X[a[0]], a[1]]);
  if (k.some((a) => a[0] == null || !isFinite(a[0]))) return null;
  for (let i = 1; i < k.length; i++) if (!(k[i][0] > k[i - 1][0])) k[i][0] = k[i - 1][0] + 0.01;
  let y = 0;
  if (q <= k[0][0]) y = 0; else if (q >= k[k.length - 1][0]) y = 1;
  else for (let j = 1; j < k.length; j++) if (q <= k[j][0]) { const [x0, y0] = k[j - 1], [x1, y1] = k[j]; y = y0 + (y1 - y0) * ((q - x0) / (x1 - x0)); break; }
  y = Math.max(0, Math.min(1, y));
  const RC = riverMapCuts(); if (!RC) return null;   /* no register: no level (not assessed) */
  let i = 0; while (i < RC.length && y >= RC[i]) i++;
  const out = { level: RIVER_MAP_WORDS[i], levelIndex: i, ladder: Math.round(y * 1000) / 1000, scale: S.version || null };
  /* v91.17.283.3 · audit A6 · the 2- to 5-year band keeps its level (the class most often observed there was below Low), but the client
     is told the share that did reach Low, read from the scale's own evidence (river-level-scale.json bandShareAtLow), never typed here */
  if (q >= lv.rp2 && q < lv.rp5) { const sh = riverBandShare(S, '2yr-5yr');
    out.watch = true; out.levelNote = RIVER_MAP_WORDS[i] + ' (watch)' + (sh != null ? ': about ' + Math.round(sh / 10) + ' in 10 such days reached the official Low flood limit (' + sh + ' % in the 2024-25 bulletins)' : ''); }
  /* v91.17.283.3 · audit A7 · rungs with no days in the record are untested (river-level-scale.json "levels"): say so with the word */
  if (q >= lv.rp20) { out.untested = true; out.levelNote = RIVER_MAP_WORDS[i] + ': ' + (q > lv.rp20 ? 'beyond' : 'at') + ' the 20-year model flow (untested rung: no such days in the record; no higher step is given)'; }
  return out;
}
/* the share of days at or above the official Low limit on a rung: the scale's structured field (river-level-scale.json bandShareAtLow.rungs,
   v91.17.283.27 item 6; it was parsed out of the free-text "why" with a regular expression); null if absent */
export function riverBandShare(S, rung) { const v = S && S.bandShareAtLow && S.bandShareAtLow.rungs ? S.bandShareAtLow.rungs[rung] : null; return typeof v === 'number' && Number.isFinite(v) ? v : null; }

export function rarityClass(R, q, dateIso) {
  if (!R || !R.levels || q == null || !isFinite(q)) return null;
  /* v91.17.92 audit: no class where the reach's own fit was refused or the gauge check found the model reach under-calls */
  if (R.fitRefused || R.modelRepresentsRiver === false || (R.gaugeCheck && R.gaugeCheck.verdict === 'under-call')) return null;   /* v91.17.113 · Ravi model reach ~1 % of the river */
  const lv = R.levels, b = halfMonthBin(dateIso), bin = (b != null && R.seasonal) ? R.seasonal[b] : null;
  const p95 = bin && bin[3] != null ? Math.min(bin[3], lv.rp2 * 0.98) : null;
  /* v91.17.113 · the class each rung most often meant in the bulletins (station-lake/reports/river_ladder_evidence.md, data/river-level-scale.json):
     below the 5-year model flow the river was most often below the official Low limit on every rung, at the 5-year flow most often Medium.
     The rarity band below stays as context. Act needs an observed signal (it is not raised from model flow alone). */
  const cls = q >= lv.rp5 ? 'Watch' : 'Low';
  const band = q >= lv.rp20 ? '20-year or rarer' : q >= lv.rp10 ? '10- to 20-year' : q >= lv.rp5 ? '5- to 10-year' : q >= lv.rp2 ? '2- to 5-year (watch: the river was most often under the Low flood limit at this flow' + (riverBandShare(riverScale(), '2yr-5yr') != null ? ', but about ' + Math.round(riverBandShare(riverScale(), '2yr-5yr') / 10) + ' in 10 such days reached it)' : ')')
    : (p95 != null && q >= p95) ? 'above the usual range for the date (no flood signal)' : 'within the usual range for the date';
  const L = riverLevel(R, q, dateIso);
  return { class: cls, word: RARITY_WORDS[cls], band, basis: 'rarity in the model\'s own 1997-onward record at this reach (' + band + ')',
    level: L ? L.level : null, levelIndex: L ? L.levelIndex : null, ladder: L ? L.ladder : null, ...(L && L.levelNote ? { levelNote: L.levelNote } : {}), ...(L && L.watch ? { watch: true } : {}), ...(L && L.untested ? { untested: true } : {}) };
}

/* Gumbel by the method of moments. Two parameters from a mean and a standard
   deviation is the right level of ambition for 42 annual maxima: an L-moment
   GEV fit on this sample size mostly fits the tail to noise. */
/* ══ v91.17.4 · FIT VERSION ════════════════════════════════════════════════
   The stored fit is a file, and a file outlives the code that wrote it. Before
   this version the stored climate was serving a `method` string that said
   "1984-01-01 onward" over data that started in 1997, and its sampleCaveat was
   missing entirely, because both had been added to gumbel() after the fit ran.
   Nothing noticed. The read side now refuses a fit whose version does not match
   and says what to re-run. Bump this whenever gumbel(), RP or HIST_START change. */
const FIT_VERSION = 'gumbel-mom-v2-1997-applicability';

/* ══ APPLICABILITY ════════════════════════════════════════════════════════════
   Gumbel (EV1) has a FIXED skewness of 1.1396 and a coefficient of variation
   bounded by its two parameters. A sample far outside that shape is not fitted
   badly, it is not described at all, and the levels that come back are
   arithmetic rather than hydrology.

   Measured on this build's own 25 points, 30 annual maxima each:

       23 points   CV 0.23 - 0.56      Gumbel is a reasonable description
       balloki     CV 0.72             Ravi below the Indian diversions
       sidhnai     CV 1.83             median discharge today 0.0 m3/s

   Sidhnai's fit puts the 1.5-year level at 3.1 m3/s against a mean of 77.5, and
   its 50-year level at 446 against an observed maximum of 808. The Ravi below
   Balloki is a regulated, frequently dry channel; a flood frequency on it is
   not information.

   NOTE ON rp50 < observedMax GENERALLY. For n = 30 the expected sample maximum
   sits at reduced variate 0.5772 + ln(30) = 3.978 against rp50's 3.902, so the
   record max exceeding rp50 about half the time is what a CORRECT fit does. It
   is not used as a rejection test on its own; only the extreme ratio is. */
const FIT_MAX_CV = 0.80;          /* above this the sample is not a Gumbel shape */
const FIT_MIN_RP50_OVER_OBSMAX = 0.70;   /* far below 1 means the tail is wrong, not merely sampled */
const FIT_MAX_ZERO_SHARE = 0.20;  /* a channel dry in a fifth of its annual maxima is regulated, not natural */

/* v91.17.283.27 · item 2 · the estimator's own minimum sample (it refuses fewer annual maxima as "a guess"): ONE constant, read by gumbel()
   and by the retry rule below (a fit refused for too few years is asked again on a later run) */
export const FIT_MIN_N = 20;
export function gumbel(annualMax) {
  const x = annualMax.filter((v) => v != null && isFinite(v)).sort((a, b) => a - b);
  const n = x.length;
  if (n < FIT_MIN_N) return { ok: false, short: true, why: 'fewer than ' + FIT_MIN_N + ' annual maxima; a return period from this is a guess', n, fitVersion: FIT_VERSION };
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  if (!(sd > 0)) return { ok: false, why: 'the annual maxima do not vary, so no distribution can be fitted', n, fitVersion: FIT_VERSION };
  const alpha = sd * Math.sqrt(6) / Math.PI;
  const u = mean - 0.5772156649 * alpha;
  const levels = {};
  for (const T of RP) levels['rp' + String(T).replace('.', '_')] = r1(u - alpha * Math.log(-Math.log(1 - 1 / T)));

  /* applicability, evaluated on the sample and on the fit it produced */
  const cv = mean > 0 ? sd / mean : Infinity;
  const observedMax = x[n - 1];
  const zeroShare = x.filter((v) => v <= 0.05).length / n;
  const ratio = observedMax > 0 ? levels.rp50 / observedMax : null;
  const fail = [];
  if (!(cv <= FIT_MAX_CV)) fail.push('the annual maxima have a coefficient of variation of ' + cv.toFixed(2)
    + ', and Gumbel has a fixed skewness of 1.14 — a sample this dispersed is not the shape this distribution describes');
  if (zeroShare > FIT_MAX_ZERO_SHARE) fail.push(Math.round(100 * zeroShare) + ' % of the annual maxima are effectively zero, so this reach is regulated or seasonally dry rather than naturally flowing');
  if (ratio != null && ratio < FIT_MIN_RP50_OVER_OBSMAX) fail.push('the fitted 50-year level (' + r1(levels.rp50)
    + ') is only ' + Math.round(100 * ratio) + ' % of the observed 30-year maximum (' + r1(observedMax)
    + '), which is far outside what sampling alone explains');
  if (fail.length) {
    return { ok: false, refused: true, n, mean: r1(mean), sd: r1(sd), cv: r1(cv), observedMax: r1(observedMax),
      zeroShare: Math.round(100 * zeroShare) / 100, fitVersion: FIT_VERSION,
      why: 'a Gumbel fit is REFUSED for this reach: ' + fail.join('; ') + '. No return levels are published for it.',
      levelsWithheld: Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, r1(v)])) };
  }

  return {
    ok: true, n, mean: r1(mean), sd: r1(sd), cv: r1(cv), levels,
    fitVersion: FIT_VERSION,
    observedMax: r1(x[n - 1]),
    method: 'Gumbel (EV1) by the method of moments on annual maxima of the GloFAS reanalysis, ' + HIST_START + ' onward',
    caveat: 'fitted to the MODEL reanalysis, not to gauge records. A "10-year" level here is a discharge this model exceeds about once a decade in its own record; it is a scale for change, not a calibrated flood frequency.',
    abstractionCaveat: 'the reanalysis carries NO canal withdrawal. This build\u2019s own fitted levels say so plainly: Guddu 16176, Sukkur 15928 and Kotri 16227 m3/s agree within 2 % across two of the largest irrigation barrages on earth, and Attock matches Tarbela and Chashma matches Taunsa the same way. On the lower Indus these levels describe a river with its diversions left in, which is not the river that reaches the barrage.',
    sampleCaveat: n < 40
      ? 'fitted on ' + n + ' annual maxima. That supports the 2, 5 and 10-year levels; the 20 and 50-year levels are extrapolations beyond the record and should be read as order-of-magnitude, not as design values.'
      : null,
  };
}

export function createFlood(app, dataDir) {
  const { provider } = app;
  const file = join(dataDir, 'flood.json');
  const contract = JSON.parse(readFileSync(join(app.contractDir || join(dataDir, '..', 'server', 'contract'), 'riverpoints.json'), 'utf8'));
  const POINTS = contract.points;

  let S = { snapped: null, climate: null, forecast: null };
  try { if (existsSync(file)) S = Object.assign(S, JSON.parse(readFileSync(file, 'utf8'))); } catch { /* start empty */ }
  /* v91.17.70 · the rarity table (data/river-rarity.json), re-read at most every 10 minutes */
  RLS_FILE = join(dataDir, 'river-level-scale.json'); _rlsAt = 0;   /* v91.17.226 · audit D-18 */
  const rarityFile = join(dataDir, 'river-rarity.json'); let RR = null, rrAt = 0;
  function rarityTable() {
    if (Date.now() - rrAt > 10 * 60e3) { rrAt = Date.now(); try { RR = existsSync(rarityFile) ? JSON.parse(readFileSync(rarityFile, 'utf8')) : null; } catch { RR = null; } }
    return RR;
  }
  const reachRarity = (id) => { const T = rarityTable(); return T && T.reaches ? T.reaches[String(id || '').toLowerCase()] || null : null; };
  /* the customer view of one forecast day: the rarity class of the ensemble median, and the share of members at or
     above the model's own 2- and 5-year flows. Discharge and levels in m³/s only with NIGRAAN_INTERNAL_REF=1. */
  function dayView(id, d) {
    const R = reachRarity(id), q = d && d.q ? d.q[1] : null;
    const rc = rarityClass(R, q, d && d.date);
    const out = { date: d && d.date, class: rc ? rc.class : null, word: rc ? rc.word : null, band: rc ? rc.band : null, level: rc ? rc.level : null, levelIndex: rc ? rc.levelIndex : null, ladder: rc ? rc.ladder ?? null : null,   /* v91.17.283.13 · the ladder position (0-1) the issued river level is read from (hazsci.mjs) */
      ...(rc && rc.levelNote ? { levelNote: rc.levelNote } : {}), ...(rc && rc.watch ? { watch: true } : {}), ...(rc && rc.untested ? { untested: true } : {}),
      shareAbove2yr: d && d.p ? d.p.rp2 : null, shareAbove5yr: d && d.p ? d.p.rp5 : null };
    if (!rc) out.classWhy = R && (R.fitRefused || (R.gaugeCheck && R.gaugeCheck.verdict === 'under-call')) ? 'the model does not represent this reach well enough to class it' : R ? 'no ensemble median for this day' : 'no rarity record for this reach yet (station-lake/scripts/river_rarity.py)';
    /* v91.17.79 · the reach's check against the bulletin gauges and recorded peaks: operator only (the customer row stays the class) */
    if (R && R.gaugeCheck && INTERNAL_REF()) out.gaugeCheck = R.gaugeCheck;
    return out;
  }
  function nationalCounts(rows) { const c = { Act: 0, Watch: 0, Monitor: 0, Low: 0 }; rows.forEach((r) => { if (r.class && c[r.class] != null) c[r.class]++; }); return c; }
  const running = { snap: false, climate: false, forecast: false };
  const last = { snap: null, climate: null, forecast: null };

  function save() {
    const tmp = file + '.tmp';
    writeFileSync(tmp, JSON.stringify(S));
    for (let i = 0; i < 5; i++) { try { renameSync(tmp, file); return; } catch { const t = Date.now() + 60; while (Date.now() < t); } }
    writeFileSync(file, JSON.stringify(S));
  }
  const list = (x) => (Array.isArray(x) ? x : [x]);
  const km = (la1, lo1, la2, lo2) => {
    const R = 6371, d = Math.PI / 180;
    const a = Math.sin((la2 - la1) * d / 2) ** 2 + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin((lo2 - lo1) * d / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  /* ── 1 · SNAP ──────────────────────────────────────────────────────────────
     A grid around the nominal point, one forecast day, one variable. The cell
     with the largest discharge inside the ring is the modelled main channel.
     Largest rather than nearest on purpose: at a confluence the nearest cell is
     often a tributary carrying a tenth of the flow, and a barrage sits on the
     main stem. The distance moved is published so a reader can see how far the
     model's channel is from the real structure. */
  /* v91.17.27 · P6-5 · one snapping rule, used for the FFD points and for any client asset */
  async function snapCoordinate(lat, lon) {
        const lats = [], lons = [];
        for (let i = -SNAP_RING; i <= SNAP_RING; i++) {
          for (let j = -SNAP_RING; j <= SNAP_RING; j++) {
            lats.push(+(lat + i * SNAP_STEP).toFixed(4));
            lons.push(+(lon + j * SNAP_STEP).toFixed(4));
          }
        }
        let body;
        try {
          body = await provider.call('flood', '/v1/flood',
            { latitude: lats, longitude: lons, daily: 'river_discharge', forecast_days: 1 },
            { locations: lats.length, timeoutMs: 180000 });
        } catch (e) { return { ok: false, why: e.message }; }
        const cells = [];
        list(body).forEach((r) => {
          const v = ((r && r.daily) || {}).river_discharge;
          const q = v && v.length ? v[0] : null;
          if (q == null || !(q > 0)) return;
          cells.push({ q, lat: r.latitude, lon: r.longitude, km: km(lat, lon, r.latitude, r.longitude) });
        });
        if (!cells.length) return { ok: false, why: 'no GloFAS cell within ' + Math.round(SNAP_RING * SNAP_STEP * 111) + ' km carries any discharge' };
        /* == v91.17.3 . THE SHARE IS LOCAL, NOT AREA-WIDE ====================
           Comparing each cell to the largest discharge in the whole 33 km
           search area punishes a small river for standing next to a big one.
           Measured on the first pass of this rule: Sidhnai on the Ravi and
           Nowshera on the Kabul were both refused, because the Chenab and the
           Indus respectively dominate their neighbourhoods. Both are real
           rivers with real headworks and both deserve an answer.
           The qualifying share is taken against the largest discharge within
           LOCAL_KM, which is the channel the structure actually sits on. The
           area-wide share travels with the result so a reader can see at a
           glance that the Ravi at Balloki carries 0.4% of what the Chenab
           carries 20 km away -- which is the true and useful fact, not a
           reason to withhold the point. */
        const local = cells.filter((c) => c.km <= LOCAL_KM);
        const qLocal = local.length ? Math.max(...local.map((c) => c.q)) : 0;
        const qMax = Math.max(...cells.map((c) => c.q));
        /* v91.17.68 · with no flowing cell inside LOCAL_KM the share test used to compare a cell against itself and pass the
           nearest trickle (audit A6); the reference is then the largest discharge within the snap radius */
        const qRef = qLocal || Math.max(0, ...cells.filter((c) => c.km <= MAX_SNAP_KM).map((c) => c.q));
        const ok = cells.filter((c) => c.km <= MAX_SNAP_KM && qRef > 0 && c.q >= MIN_SHARE * qRef)
                        .sort((a, b) => a.km - b.km);
        if (!ok.length) {
          const near = cells.slice().sort((a, b) => a.km - b.km)[0];
          return { ok: false, why: 'no GloFAS cell within ' + MAX_SNAP_KM + ' km carries at least ' + Math.round(MIN_SHARE * 100)
               + '% of the largest discharge on its own local channel (' + r1(qLocal) + ' m3/s within ' + LOCAL_KM
               + ' km). The nearest cell with any flow is '
               + Math.round(near.km) + ' km away at ' + r1(near.q) + ' m3/s, and this point is NOT snapped to it: at that '
               + 'distance the model is routing a different channel, and a confident number on the wrong river is worse '
               + 'than no number.' };
        }
        const best = ok[0];
        return { ok: true, snap: {
          snapLat: best.lat, snapLon: best.lon,
          snapKm: Math.round(best.km * 10) / 10,
          snapDischarge: r1(best.q),
          snapShareOfLocalChannel: Math.round(100 * best.q / (qLocal || best.q)) / 100,
          snapShareOfAreaMax: Math.round(1000 * best.q / qMax) / 1000,
          snapAreaMaxDischarge: r1(qMax),
          snapScaleNote: qMax > 0 && best.q < 0.1 * qMax
            ? 'this channel carries ' + (Math.round(1000 * best.q / qMax) / 10) + '% of the largest river within 33 km ('
              + r1(qMax) + ' m3/s). That is a fact about the river, not a defect in the snap.'
            : null,
          snapWhy: 'the NEAREST GloFAS cell carrying at least ' + Math.round(MIN_SHARE * 100) + '% of the largest discharge '
            + 'on the local channel (within ' + LOCAL_KM + ' km; the largest within ' + MAX_SNAP_KM + ' km when no cell flows that close), within ' + MAX_SNAP_KM + ' km. Nearest rather than largest: the largest cell in a 30 km '
            + 'neighbourhood is often a different river.',
        } };
  }

  async function runSnap(force) {
    if (running.snap) return { started: false, why: 'already running' };
    if (!force && S.snapped && S.snapped.points && Object.keys(S.snapped.points).length >= POINTS.filter((p) => !p.tributary).length) {   /* v91.17.68 · tributaries are recorded under failed, so the count is of main-stem points (A15) */
      return { started: false, why: 'already snapped; pass force=1 to redo' };
    }
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    running.snap = true;
    const out = { at: null, points: {}, failed: [] };
    try {
      for (const p of POINTS) {
        /* a point this module has already decided it will not publish is not
           snapped at all: snapping produces a coordinate, and a coordinate
           invites a number. */
        if (p.tributary) { out.failed.push({ id: p.id, name: p.name, river: p.river, tributary: true, why: p.tributaryWhy }); continue; }
        const sr = await snapCoordinate(p.lat, p.lon);
        if (!sr.ok) { out.failed.push({ id: p.id, name: p.name, river: p.river, why: sr.why }); last.snap = sr.why; continue; }
        out.points[p.id] = { ...p, ...sr.snap };
      }
      out.at = new Date().toISOString();
      S.snapped = out; save();
      return { started: true, snapped: Object.keys(out.points).length, failed: out.failed.length };
    } finally { running.snap = false; }
  }

  /* ── 2 · RETURN PERIODS ────────────────────────────────────────────────────
     42 years of daily reanalysis at each snapped cell, reduced to annual
     maxima and fitted. Run once; the record only grows by a year at a time. */
  /* v91.17.283.27 · item 2 · a fit refused for TOO FEW YEARS (the history request came back truncated: 27 Oct 2026, all 25 reaches n = 1,
     only 1997 complete) is not a property of the reach; it is retried on a later run (only those reaches), with the reason recorded:
     the record the request answered (first and last day, days, complete years) and the attempts. A fit refused for its shape is final. */
  const shortFit = (c) => !!(c && c.ok === false && !c.refused && Number.isFinite(Number(c.n)) && Number(c.n) < FIT_MIN_N);
  function shortFits() { const P = S.climate && S.climate.points ? S.climate.points : {}; return Object.keys(P).filter((id) => shortFit(P[id])); }
  /* at most one retry per forecast run: a reach is asked again only when its last attempt is older than the newest river forecast (a
     forecast that keeps failing, and so is retried every 10 minutes, does not repeat the 30-year history request with it) */
  const retryDue = (id) => { const c = S.climate && S.climate.points && S.climate.points[id], last = c && c.retry ? Date.parse(c.retry.lastAt || '') : NaN, fa = S.forecast ? Date.parse(S.forecast.at || '') : NaN;
    return !Number.isFinite(last) || (Number.isFinite(fa) && last < fa); };
  async function runClimate(force, onlyIds = null) {
    if (running.climate) return { started: false, why: 'already running' };
    if (!S.snapped) return { started: false, why: 'snap first' };
    if (!force && !onlyIds && S.climate && S.climate.points && Object.keys(S.climate.points).length) {
      return { started: false, why: 'return periods already fitted; pass force=1 to refit' };
    }
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    running.climate = true;
    const end = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const prev = (S.climate && S.climate.points) || {};
    const out = onlyIds && S.climate ? { ...S.climate, points: { ...prev }, failed: [] } : { at: null, window: { start: HIST_START, end }, points: {}, failed: [] };
    const retryOf = (id, why) => { const r = (prev[id] && prev[id].retry) || { attempts: 0 }; return { attempts: (r.attempts || 0) + 1, firstAt: r.firstAt || new Date().toISOString(), lastAt: new Date().toISOString(), why }; };
    try {
      const ids = (onlyIds || Object.keys(S.snapped.points)).filter((id) => S.snapped.points[id]);
      for (const id of ids) {
        const p = S.snapped.points[id];
        let body;
        try {
          body = await provider.call('flood', '/v1/flood',
            { latitude: p.snapLat, longitude: p.snapLon, daily: 'river_discharge', start_date: HIST_START, end_date: end },
            { locations: 1, timeoutMs: 300000 });
        } catch (e) { out.failed.push({ id, why: e.message }); last.climate = e.message; if (onlyIds && prev[id]) out.points[id] = { ...prev[id], retry: retryOf(id, 'the history request failed (' + e.message + '); asked again on a later run') }; continue; }
        const d = (list(body)[0] || {}).daily || {};
        const t = d.time || [], q = d.river_discharge || [];
        if (!t.length) { out.failed.push({ id, why: 'no record returned' }); if (onlyIds && prev[id]) out.points[id] = { ...prev[id], retry: retryOf(id, 'the history request returned no record; asked again on a later run') }; continue; }
        /* v91.17.68 · an annual maximum counts only for a year with at least 350 valid days (audit A4): the partial current year
           and any gap year used to enter the Gumbel sample as a full year, which in spring meant a low-flow-season "maximum" */
        const byYear = new Map(), nYear = new Map();
        for (let i = 0; i < t.length; i++) {
          const y = t[i].slice(0, 4), v = q[i];
          if (v == null || !isFinite(v)) continue;
          nYear.set(y, (nYear.get(y) || 0) + 1);
          if (!byYear.has(y) || v > byYear.get(y)) byYear.set(y, v);
        }
        const dropped = [...byYear.keys()].filter((y) => (nYear.get(y) || 0) < 350);
        for (const y of dropped) byYear.delete(y);
        const years = [...byYear.keys()].sort();
        const fit = gumbel([...byYear.values()]);
        const got = { from: t[0] || null, to: t[t.length - 1] || null, days: t.length, validDays: [...nYear.values()].reduce((a, b) => a + b, 0), completeYears: years.length, asked: { start: HIST_START, end } };
        out.points[id] = { ...fit, years: years.length, firstYear: years[0] || null, lastYear: years[years.length - 1] || null, incompleteYearsDropped: dropped, yearRule: 'a year enters the annual-maximum sample only with >= 350 valid days', got,
          ...(fit.short ? { retry: retryOf(id, 'the history request (' + HIST_START + ' to ' + end + ') answered ' + got.days + ' days (' + got.from + ' to ' + got.to + '), ' + years.length + ' complete year(s); the fit needs ' + FIT_MIN_N + ' annual maxima: asked again on a later run') } : {}) };
      }
      out.at = new Date().toISOString(); if (onlyIds) out.retriedAt = out.at;
      S.climate = out; save();
      return { started: true, fitted: Object.values(out.points).filter((c) => c && c.ok).length, short: shortFits().length, failed: out.failed.length, ...(onlyIds ? { retried: onlyIds.length } : {}) };
    } finally { running.climate = false; }
  }

  /* ── 3 · THE FORECAST ──────────────────────────────────────────────────────
     30 days of ensemble discharge at the snapped cells. Each day is reported
     as the share of members crossing each return level — the same currency
     the rest of this build uses for an ensemble event. */
  async function runForecast() {
    if (running.forecast) return { started: false, why: 'already running' };
    if (!S.snapped) return { started: false, why: 'snap first' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    running.forecast = true;
    const out = { at: null, days: [], points: {}, failed: [], members: 0 };
    try {
      const ids = Object.keys(S.snapped.points);
      for (let i = 0; i < ids.length; i += 20) {
        const batch = ids.slice(i, i + 20).map((id) => S.snapped.points[id]);
        let body;
        try {
          body = await provider.call('flood', '/v1/flood',
            { latitude: batch.map((p) => p.snapLat), longitude: batch.map((p) => p.snapLon),
              daily: 'river_discharge', forecast_days: 31, ensemble: true, timezone: RIVER_TZ },   /* v283.10 · GMT labels (see RIVER_DATE_FRAME); 31 so 30 days remain from the Pakistan date */
            { locations: batch.length, timeoutMs: 180000 });
        } catch (e) { batch.forEach((p) => out.failed.push({ id: p.id, why: e.message })); last.forecast = e.message; continue; }
        alignBatch(list(body), batch, (p) => [p.snapLat, p.snapLon]).forEach((r, k) => {   /* v91.17.157 · audit: matched by coordinate */
          const p = batch[k], d = riverDaysFromToday((r && r.daily) || {});
          if (!d.time) { out.failed.push({ id: p.id, why: 'no daily block' }); return; }
          if (!out.days.length) out.days = d.time;
          const memberKeys = Object.keys(d).filter((x) => /^river_discharge_member\d+$/.test(x)).sort();
          const control = d.river_discharge || [];
          const members = memberKeys.map((x) => d[x]);
          if (members.length > out.members) out.members = members.length;
          const cl = (S.climate && S.climate.points && S.climate.points[p.id]) || null;
          const levels = (cl && cl.ok) ? cl.levels : null;
          const rows = d.time.map((date, j) => {
            const vals = [control[j], ...members.map((m) => m[j])].filter((v) => v != null && isFinite(v)).sort((a, b) => a - b);
            const row = { date, n: vals.length,
              q: vals.length ? [r1(vals[Math.floor((vals.length - 1) * 0.1)]), r1(vals[Math.floor((vals.length - 1) * 0.5)]), r1(vals[Math.floor((vals.length - 1) * 0.9)])] : null };
            if (levels && vals.length) {
              row.p = {};
              for (const T of RP) {
                const key = 'rp' + String(T).replace('.', '_');
                const lv = levels[key];
                row.p[key] = lv == null ? null : Math.round(100 * vals.filter((v) => v >= lv).length / vals.length);
              }
            } else { row.p = null; row.pWhy = 'no return periods are fitted for this point, so a discharge cannot be placed on a scale'; }
            return row;
          });
          out.points[p.id] = { point: p, climate: cl, days: rows };
        });
      }
      out.at = new Date().toISOString();
      /* v91.17.157 · audit H · a failed run no longer replaces a good one. Nothing returned: the previous forecast stays, with
         the error recorded. Some reaches failed: their previous days are carried, re-aligned by date and marked with the run
         they came from, so a reach never vanishes from the national count and never reads as an all-clear. */
      const prev = S.forecast;
      if (!Object.keys(out.points).length) {
        last.forecast = 'no reach returned a forecast (' + out.failed.length + ' failed); the previous run of ' + (prev && prev.at || 'none') + ' is kept';
        return { started: true, points: 0, failed: out.failed.length, kept: prev ? prev.at : null };
      }
      out.carried = 0;
      if (prev && prev.points) for (const fl of out.failed) {
        const pf = prev.points[fl.id]; if (!pf || out.points[fl.id]) continue;
        const byDate = {}; (pf.days || []).forEach((d) => { byDate[d.date] = d; });
        out.points[fl.id] = { ...pf, carriedFrom: pf.carriedFrom || prev.at,
          days: out.days.map((date) => byDate[date] || { date, n: 0, q: null, p: null, pWhy: 'not in the last good run' }) };
        out.carried++;
      }
      S.forecast = out; save();
      return { started: true, points: Object.keys(out.points).length, failed: out.failed.length, carried: out.carried };
    } finally { running.forecast = false; }
  }

  /* ── read side ─────────────────────────────────────────────────────────── */
  /* v91.17.70 · the class is rarity in the model's own record; the authority is not named (option 2) */
  const DISCLAIMER = 'River class per reach from the GloFAS (Copernicus CEMS) ensemble: how rare the forecast flow is in the same model\'s own 1997-onward record at that reach — Watch at the model\'s 5-year flow or more (in the 2024-25 bulletins the river most often reached Medium flood on such days), otherwise Low (below the 5-year flow the river was most often under the Low flood limit). Act is not raised from model flow alone. This is not an official flood warning; the national flood authority issues those.';
  const TRIBUTARY_REFUSAL = 'No riverine flood is published for mountain tributaries. Measured against eight mountain gauges, the day-to-day CHANGE in GloFAS discharge correlates with the observed change at 0.00 — at 5 km the model cannot resolve these channels, so a number it produces there is routing, not a forecast.';

  /* v91.17.4 · a stored fit may not serve under a method string it did not
     produce. If the version does not match, the levels are withheld and the
     response says which job re-creates them. */
  function freshClimate(cl) {
    if (!cl) return null;
    if (cl.fitVersion === FIT_VERSION) return cl;
    return { ok: false, stale: true, storedFitVersion: cl.fitVersion || 'unversioned', expected: FIT_VERSION,
      why: 'these return levels were fitted by an earlier version of the estimator and are withheld rather than served under the current method statement. Re-run POST /api/flood/run?what=climate&force=1.',
      n: cl.n ?? null, observedMax: cl.observedMax ?? null };
  }
  function point(id) {
    const f = S.forecast && S.forecast.points && S.forecast.points[String(id || '').toLowerCase()];
    if (!f) return null;
    const cl = freshClimate(f.climate);
    const stale = !!(cl && cl.stale);
    const pid = String(id || '').toLowerCase();
    const days = (stale ? f.days.map((d) => ({ ...d, p: null, pWhy: 'return levels withheld: ' + cl.why })) : f.days);
    /* v91.17.70 · the customer view: rarity class per day; model m³/s and return levels only under NIGRAAN_INTERNAL_REF=1 */
    if (!INTERNAL_REF()) {
      const P = f.point || {};
      return { point: { id: P.id, name: P.name, river: P.river, kind: P.kind, province: P.province, lat: P.lat, lon: P.lon },
        days: days.map((d) => dayView(pid, d)), at: f.carriedFrom || S.forecast.at, carriedFrom: f.carriedFrom || null, members: S.forecast.members, disclaimer: DISCLAIMER,   /* v91.17.161 · a carried reach reports its own run time */
        rarity: { levels: RIVER_LEVELS, table: (rarityTable() || {}).built || null } };
    }
    return { ...f, climate: cl, days: days.map((d) => ({ ...d, ...dayView(pid, d) })),
      at: f.carriedFrom || S.forecast.at, carriedFrom: f.carriedFrom || null, members: S.forecast.members, disclaimer: DISCLAIMER, internalRef: true };
  }
  function national(dayIndex) {
    if (!S.forecast) return { ready: false, why: 'the riverine job has not run' };
    const k = Math.max(0, Math.min((S.forecast.days.length || 1) - 1, Number(dayIndex) || 0));
    const rows = Object.entries(S.forecast.points).map(([id, f]) => {
      const d = f.days[k] || {};
      /* v91.17.68 · the same stale-fit rule as point(): an exceedance share from a superseded estimator is withheld with the
         levels, not served beside "levels withheld" (audit A5) */
      const cl = freshClimate(f.climate); const stale = !!(cl && cl.stale);
      /* v91.17.70 · the customer row is the rarity class; the m³/s fields below are internal (NIGRAAN_INTERNAL_REF=1) */
      if (!INTERNAL_REF()) {
        const v0 = dayView(id, d); const oldH = f.carriedFrom ? (Date.now() - Date.parse(f.carriedFrom)) / 3600e3 : 0;
        const v = oldH > 30 ? { ...v0, class: null, word: null, band: null, classWhy: 'no forecast for this reach in the last runs; its last one is ' + Math.round(oldH) + ' h old' } : v0;   /* v91.17.161 */
        return { id, name: f.point.name, river: f.point.river, kind: f.point.kind, province: f.point.province, date: d.date,
          class: v.class, word: v.word, band: v.band, level: v.class ? v.level : null, levelIndex: v.class ? v.levelIndex : null, classWhy: v.classWhy || null, carriedFrom: f.carriedFrom || null,
          shareAbove2yr: stale ? null : v.shareAbove2yr, shareAbove5yr: stale ? null : v.shareAbove5yr };
      }
      return { id, name: f.point.name, river: f.point.river, kind: f.point.kind, province: f.point.province, ...dayView(id, d), carriedFrom: f.carriedFrom || null,
        snapKm: f.point.snapKm, date: d.date, q: d.q,
        p: stale ? null : (d.p || null), pWhy: stale ? 'return levels withheld: ' + cl.why : (d.pWhy || null),
        levels: (f.climate && f.climate.ok && f.climate.fitVersion === FIT_VERSION) ? f.climate.levels : null,
        levelsWhy: (f.climate && f.climate.ok && f.climate.fitVersion === FIT_VERSION) ? null
          : (f.climate && f.climate.refused ? f.climate.why
             : f.climate && f.climate.fitVersion !== FIT_VERSION ? 'return levels withheld: fitted by an earlier estimator version (' + (f.climate.fitVersion || 'unversioned') + '); re-run the climate job'
             : (f.climate && f.climate.why) || 'no return levels are fitted for this point') };
    });
    const ageH = (Date.now() - Date.parse(S.forecast.at)) / 3600e3;
    const byClass = nationalCounts(rows);
    /* v91.17.157 · audit · coverage: reaches carried from an older run and reaches missing from both runs are counted */
    const carried = Object.values(S.forecast.points).filter((f) => f.carriedFrom).length;
    const expected = S.snapped && S.snapped.points ? Object.keys(S.snapped.points).length : rows.length;
    const missing = Math.max(0, expected - rows.length);
    return { ready: true, at: S.forecast.at, ageH: Math.round(ageH * 10) / 10, stale: ageH > 30, staleWhy: ageH > 30 ? 'the riverine forecast is ' + Math.round(ageH) + ' h old; it refreshes daily when the server runs' : null, date: rows[0] && rows[0].date, dayIndex: k, days: S.forecast.days,
      members: S.forecast.members, points: rows.length, expectedPoints: expected, carriedPoints: carried, missingPoints: missing,
      partial: carried > 0 || missing > 0, partialWhy: (carried || missing) ? (carried ? carried + ' reach(es) carried from an older run' : '') + (carried && missing ? '; ' : '') + (missing ? missing + ' reach(es) with no forecast (not assessed, not Low)' : '') : null,
      /* v91.17.70 · counts by rarity class; medianAboveRp2 / Rp10 kept as names for old readers, now on the class */
      levels: RIVER_LEVELS, byClass, mapLevels: RIVER_MAP_WORDS, byLevel: rows.reduce((c, r) => { if (r.level) c[r.level] = (c[r.level] || 0) + 1; return c; }, {}), counts: { medianAboveRp2: byClass.Watch + byClass.Act, medianAboveRp10: rows.filter((r) => (r.class === 'Watch' || r.class === 'Act') && /^(10|20)/.test(r.band || '')).length },
      rarity: { table: (rarityTable() || {}).built || null, source: rarityTable() ? rarityTable().source : null, ladder: rarityTable() ? rarityTable().ladder : null },
      internalRef: INTERNAL_REF(),
      rows: rows.sort((a, b) => String(a.river).localeCompare(String(b.river)) || String(a.name).localeCompare(String(b.name))),
      disclaimer: DISCLAIMER, tributaries: TRIBUTARY_REFUSAL };
  }
  function status() {
    return {
      points: POINTS.length,
      snapped: S.snapped ? { at: S.snapped.at, points: Object.keys(S.snapped.points).length, failed: S.snapped.failed.length,
        movedKm: (() => { const v = Object.values(S.snapped.points).map((p) => p.snapKm).sort((a, b) => a - b);
          return v.length ? { min: v[0], median: v[Math.floor(v.length / 2)], max: v[v.length - 1] } : null; })() } : null,
      climate: S.climate ? { at: S.climate.at, window: S.climate.window, fitted: Object.keys(S.climate.points).length, failed: S.climate.failed.length } : null,
      forecast: S.forecast ? { at: S.forecast.at, points: Object.keys(S.forecast.points).length, days: S.forecast.days.length, members: S.forecast.members, failed: S.forecast.failed.length } : null,
      dateFrame: RIVER_DATE_FRAME,   /* v283.10 · operator note: which 24 h a river day holds */
      running, lastError: last,
      returnPeriods: RP, method: 'Gumbel (EV1), method of moments, annual maxima of the GloFAS reanalysis',
      disclaimer: DISCLAIMER, tributaries: TRIBUTARY_REFUSAL,
      /* v91.17.70 · the rarity table and the internal flag the client reads before it touches any official-limit code */
      rarity: rarityTable() ? { built: rarityTable().built, reaches: Object.keys(rarityTable().reaches || {}).length, ladder: rarityTable().ladder, source: rarityTable().source } : { built: null, why: 'run station-lake/scripts/river_rarity.py' },
      levels: RIVER_LEVELS, internalRef: INTERNAL_REF(), stationData: stationData(),
    };
  }

  /* ══ v91.17.4 · A STALE FIT REPAIRS ITSELF ═══════════════════════════════
     The read side now withholds return levels whose fitVersion does not match
     the estimator, which is correct but would leave a deployment silently
     without levels until somebody remembered to POST the climate job. That is
     the same "you had to know" failure the version check exists to remove, so
     the refit runs itself: once, in the background, only when the stored fit is
     actually stale, and followed by a forecast pass so the exceedance shares
     are rebuilt against the new levels. It costs one archive sweep over 25
     points and it happens at most once per estimator version. */
  function refitIfStale() {
    try {
      const pts = S.climate && S.climate.points ? Object.values(S.climate.points) : [];
      if (!pts.length) return;
      const stale = pts.filter((c) => c && c.fitVersion !== FIT_VERSION).length;
      if (!stale) { const sh = shortFits().filter(retryDue); if (!sh.length || !provider.configured() || process.env.MACH_OFFLINE) return;
        /* v283.27 item 2: fits refused for too few years are retried once at start (and again with each forecast refresh below) */
        console.log('  flood      %d of %d stored fits have fewer than %d annual maxima (a truncated history answer); asking again in the background', sh.length, pts.length, FIT_MIN_N);
        setTimeout(async () => { try { const r = await runClimate(true, sh); if (r && r.started && sh.some((id) => S.climate && S.climate.points[id] && S.climate.points[id].ok)) await runForecast(); }   /* the forecast is rebuilt only when a reach gained a fit */ catch (e) { console.error('  flood      short-fit retry failed:', e && e.message); } }, 4000);
        return; }
      console.log('  flood      %d of %d stored return-period fits predate %s; refitting in the background',
        stale, pts.length, FIT_VERSION);
      setTimeout(async () => {
        try {
          await runClimate(true);
          await runForecast();
          console.log('  flood      return periods refitted to %s and the forecast rebuilt against them', FIT_VERSION);
        } catch (e) { console.error('  flood      background refit failed:', e && e.message); }
      }, 4000);
    } catch { /* a refit that cannot start must not stop the server */ }
  }
  refitIfStale();
  /* v91.17.34 · AUDIT · the riverine forecast was never scheduled: it ran only from POST /api/flood/run, so day 0 was
     four days old. It now refreshes when older than 24 h, once the server has settled. */
  let forecastRunning = false;
  async function refreshIfOld() {
    if (forecastRunning || !provider.configured()) return;
    const age = S.forecast ? (Date.now() - Date.parse(S.forecast.at)) / 3600e3 : Infinity;
    const pkt = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    const day0 = S.forecast && S.forecast.days && S.forecast.days[0];
    if (age < 24 && day0 === pkt) return;   /* refresh when a day old, or as soon as day 0 is no longer the Pakistan date */
    forecastRunning = true; try {
      /* v91.17.35 · an install without data/flood.json had no snapped reaches and no return levels, so the
         forecast had nothing to run on and the river layer never appeared. Build them first when absent. */
      if (!S.snapped || !Object.keys(S.snapped.points || {}).length) { await runSnap(true); console.log('  flood      reaches snapped to the model channel'); }
      if (!S.climate || !S.climate.points || !Object.keys(S.climate.points).length) { await runClimate(true); console.log('  flood      return levels fitted'); }
      else { const sh = shortFits().filter(retryDue); if (sh.length) { const r = await runClimate(true, sh); console.log('  flood      %d short fit(s) asked again: %d now short', sh.length, r && r.short != null ? r.short : sh.length); } }   /* v283.27 item 2 */
      await runForecast(); console.log('  flood      riverine forecast refreshed'); } catch (e) { console.error('  flood      refresh failed:', e && e.message); } finally { forecastRunning = false; }
  }
  if (!process.env.MACH_OFFLINE) { schedule(app, 'flood', 10 * 60e3, () => refreshIfOld(), { firstMs: 6 * 60e3, label: 'river flood forecast' }); }   /* v91.17.39 · every 10 min, not hourly: day 0 stayed on yesterday for up to an hour after midnight PKT (measured 00:18) */

  /* v91.17.274 · RIVER · the raw forecast days of one reach (ensemble q in m³/s, server side only) and the customer day view, for the
     gauge panel's stale-sheet switch and the operator gauge-equivalent flow (rivercal.mjs) */
  function forecastDays(id) { const f = S.forecast && S.forecast.points && S.forecast.points[String(id || '').toLowerCase()];
    return f ? { days: f.days || [], at: f.carriedFrom || S.forecast.at, carriedFrom: f.carriedFrom || null } : null; }
  return { snapCoordinate, runSnap, runClimate, runForecast, refreshIfOld, point, national, status, POINTS, FIT_VERSION, shortFits, retryDue,
    snapped: () => S.snapped, climate: () => S.climate, reachRarity, rarityClass, internalRef: INTERNAL_REF, forecastDays, dayView };
}
