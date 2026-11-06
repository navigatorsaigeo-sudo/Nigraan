/* ══ v91.17.61 · THE FAMILY-AWARE FORECAST POOL FOR A POINT ═══════════════════════════════════════════════════════
   One route, four products on top of the model layer, with the forecast and the confidence kept apart:

     consensus     weighted median of the deterministic models, each forecast FAMILY one vote (ECMWF: IFS + AIFS;
                   NOAA: GFS + AIGFS; ICON, GEM, UKMO, ARPEGE, JMA one each). MET Norway and HARMONIE do not vote over
                   Pakistan (ECMWF-driven / no domain). The plain mean is kept as a diagnostic.
     probability   rain from the two ensembles with EQUAL SYSTEM weight (each ECMWF member 0.5/51, each WeatherNext
                   member 0.5/64): P10/P50/P90 daily totals and P(R > 1, 5, 10, 25, 50, 100 mm).
     agreement     the inter-model dispersion (P90 − P10 of the family-weighted distribution) and a class on the
                   variable's own scale; physical-NWP and AI-model agreement reported separately.
     confidence    a lead-time regime (0–72 h full pool; day 4–7 ensemble distributions; day 8–15 probabilities and
                   ranges only), never a change to the number.

   Weights are equal per family because the Pakistan model-skill registry (rank_models.py per variable × zone ×
   season × lead) is not yet built; the route says so in every response (scientificStatus Probabilistic for the
   ensembles, Empirical for the pooling rule). The per-model temperatures are raw model values (the served correction
   is applied to the single served forecast, not to the comparison); the response says so in correctionNote. */

const FAMILY = { ecmwf_ifs025: 'ecmwf', ecmwf_aifs025_single: 'ecmwf', gfs_seamless: 'noaa', ncep_aigfs025: 'noaa', icon_seamless: 'dwd', gem_seamless: 'eccc', ukmo_seamless: 'ukmo', meteofrance_seamless: 'meteofrance', jma_seamless: 'jma' };
const AI = { ecmwf_aifs025_single: 1, ncep_aigfs025: 1 };
const MODELS = Object.keys(FAMILY);
const NOT_POOLED = { metno_seamless: 'ECMWF-driven outside the Nordic nest: a second ECMWF vote', knmi_seamless: 'HARMONIE has no Pakistan domain; falls back to its driving global model', meteofrance_arome: 'AROME does not cover Pakistan; ARPEGE is what meteofrance_seamless serves here' };
const ENS = [{ id: 'ecmwf_ifs025', name: 'ECMWF ENS' }, { id: 'google_weathernext2_ensemble', name: 'WeatherNext 2', ai: true }];
/* ══ v283.10 · THE AI MODELS ARE SHADOW-ONLY IN THE POOL UNTIL THEY PASS (pre-registered rule, owner) ═══════════════════════
   ECMWF AIFS, NOAA AIGFS and Google WeatherNext 2 entered the family pool (v91.17.61) and the rain probabilities (v91.17.65)
   without a held-out test of the pool with them against the pool without them: data/ens-wet-reliability.json scored 0 ensemble
   hours, data/ensemble-log is empty, the IMERG threshold tau was fitted on the ECMWF IFS deterministic grid (2024, before
   WeatherNext 2 existed) and the model-skill registry weights are in-sample. Until a held-out test passes (rule: v283.10
   REPORT.md), every pool output is computed WITHOUT them (AI_SHADOW below); the operator can ask for the full pool with
   ai=1 on /api/pool/point and /api/pool/hazard (never in the customer view), labelled shadow. NIGRAAN_POOL_AI=1 restores the
   v91.17.61-65 pool for everyone once the test has passed. */
const AI_SHADOW = Object.freeze(['ecmwf_aifs025_single', 'ncep_aigfs025', 'google_weathernext2_ensemble']);
/* v283.10 INTEGRATION · OWNER-DECISION SWITCH (option (c)): data/pool-ai.json {"aiInPool": false} keeps the AI models shadow-only (the
   default shipped in v283.10); {"aiInPool": true} drops option (c) and restores the v91.17.61-65 pool for every view, with no code
   change. NIGRAAN_POOL_AI=1 (environment) also restores it. A missing or unreadable switch file means false (option (c) applies). */
let SWITCH_FILE = null, swAt = 0, swVal = false;
const switchOn = () => { if (!SWITCH_FILE) return false; const now = Date.now(); if (now - swAt < 60e3) return swVal; swAt = now;
  try { swVal = JSON.parse(readFileSync(SWITCH_FILE, 'utf8')).aiInPool === true; } catch (_) { swVal = false; } return swVal; };
const aiDefault = () => process.env.NIGRAAN_POOL_AI === '1' || switchOn();
const aiSource = () => process.env.NIGRAAN_POOL_AI === '1' ? 'NIGRAAN_POOL_AI=1' : switchOn() ? 'data/pool-ai.json aiInPool true' : null;
const modelsFor = (ai) => ai ? MODELS : MODELS.filter(m => !AI[m]);
const ensFor = (ai) => ai ? ENS : ENS.filter(s => !s.ai);
const aiNote = (ai) => ai ? { inPool: true, models: AI_SHADOW.slice(), status: aiSource() ? 'restored by the owner switch (' + aiSource() + ')' : 'shadow (operator request ai=1): not tested against the pool without them on held-out data' }
  : { inPool: false, shadow: AI_SHADOW.slice(), why: 'AI weather models are shadow-only until a held-out test of the pool with them beats the pool without them (pre-registered rule, v283.10)' };
const RAIN_TH = [1, 5, 10, 25, 50, 100];
/* agreement classes: dispersion (P90 − P10) on the variable's own scale */
const AGREE = { temperature_2m: [1.5, 3, 5], wind_speed_10m: [2, 4, 7], relative_humidity_2m: [8, 15, 25], precipitation: [2, 6, 15] };
const agreeClass = (v, d) => { const c = AGREE[v] || AGREE.temperature_2m; return d == null ? null : d <= c[0] ? 'High' : d <= c[1] ? 'Moderate' : d <= c[2] ? 'Low' : 'Very low'; };

function wquant(pts, q) { let acc = 0; for (const p of pts) { acc += p.w; if (acc >= q - 1e-12) return p.x; } return pts.length ? pts[pts.length - 1].x : null; }
function familyPool(vals, skill) {   /* vals: [{model, x}]; skill: {model: {w}} from the registry cell, or null */
  const v = vals.filter(p => Number.isFinite(p.x)); if (!v.length) return null;
  const fam = {}; for (const p of v) { const f = FAMILY[p.model] || p.model; fam[f] = (fam[f] || 0) + 1; }
  const nf = Object.keys(fam).length;
  /* v91.17.62 · skill weights from the Pakistan model-skill registry where the cell has them (renormalised over the
     models present); otherwise one vote per family */
  const useSkill = !!(skill && v.filter(p => skill[p.model] && skill[p.model].w > 0).length >= 3);
  let pts; let unscored = [];
  if (useSkill) {
    /* a model the registry could not score in this cell (e.g. AIGFS before it existed) gets the cell's smallest weight, and is named */
    const ws = Object.values(skill).map(x => x.w).filter(x => x > 0); const wmin = Math.min(...ws);
    const wOf = (m) => (skill[m] && skill[m].w > 0) ? skill[m].w : (unscored.push(m), wmin);
    const raw = v.map(p => ({ x: p.x, w: wOf(p.model), model: p.model })); const z = raw.reduce((a, p) => a + p.w, 0); pts = raw.map(p => ({ ...p, w: p.w / z }));
  }
  else pts = v.map(p => ({ x: p.x, w: (1 / nf) / fam[FAMILY[p.model] || p.model], model: p.model }));
  pts.sort((a, b) => a.x - b.x);
  const r2 = (x) => x == null ? null : Math.round(x * 100) / 100;
  const p10 = r2(wquant(pts, 0.1)), p50 = r2(wquant(pts, 0.5)), p90 = r2(wquant(pts, 0.9));
  const mean = v.reduce((s, p) => s + p.x, 0) / v.length;
  const phys = v.filter(p => !AI[p.model]).map(p => p.x), ai = v.filter(p => AI[p.model]).map(p => p.x);
  const span = (a) => a.length >= 2 ? Math.max(...a) - Math.min(...a) : null;
  return { p50, p10, p90, weighting: useSkill ? 'skill' : 'equal-family', unscored: useSkill && unscored.length ? unscored : undefined, mean: Math.round(mean * 100) / 100, dispersion: (p10 != null && p90 != null) ? Math.round((p90 - p10) * 100) / 100 : null, n: v.length, families: nf,
    byModel: Object.fromEntries(v.map(p => [p.model, p.x])), physicalSpan: span(phys), aiSpan: span(ai), aiN: ai.length, physicalN: phys.length };
}
function equalSystem(systems) {   /* systems: [{id, members:[numbers]}] */
  const live = systems.filter(s => s.members.length); if (!live.length) return null;
  const pts = []; for (const s of live) { const w = (1 / live.length) / s.members.length; for (const x of s.members) pts.push({ x, w }); }
  pts.sort((a, b) => a.x - b.x);
  const ex = {}; for (const t of RAIN_TH) ex[t] = Math.round(pts.reduce((a, p) => a + (p.x >= t ? p.w : 0), 0) * 1000) / 1000;
  const perSys = Object.fromEntries(live.map(s => { const m = s.members.slice().sort((a, b) => a - b); return [s.id, { members: m.length, p50: m[Math.floor((m.length - 1) / 2)], weightPerMember: Math.round(1e4 * (1 / live.length) / m.length) / 1e4 }]; }));
  const p50 = wquant(pts, 0.5), p10 = wquant(pts, 0.1), p90 = wquant(pts, 0.9);
  const sysMed = live.map(s => perSys[s.id].p50); const sysSpread = sysMed.length > 1 ? Math.max(...sysMed) - Math.min(...sysMed) : null;
  return { p10, p25: wquant(pts, 0.25), p50, p75: wquant(pts, 0.75), p90, exceed: ex, systems: perSys, systemAgreement: sysSpread == null ? null : (sysSpread <= Math.max(2, 0.3 * Math.max(1, p50)) ? 'High' : sysSpread <= Math.max(5, 0.6 * Math.max(1, p50)) ? 'Moderate' : 'Low'), systemMedianSpreadMm: sysSpread == null ? null : Math.round(sysSpread * 10) / 10 };
}
const regime = (leadH) => leadH < 72 ? { name: 'short range (0–72 h)', use: 'full multi-model pool with the served corrections; deterministic P50 usable' } : leadH < 168 ? { name: 'medium range (day 4–7)', use: 'ensemble distributions first; deterministic models are scenarios' } : { name: 'extended (day 8–15)', use: 'probabilities and ranges only; no local deterministic number' };

import { label, stationData, internalNames } from './refmode.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { hourEndingDay, hourEndingWindow, hourEndingTotals } from './pktday.mjs';
import { downscaleFor } from './downscale.mjs';   /* v91.17.73 (agent A) · the served AI term for the dissent band */
const SEASON = ['DJF', 'DJF', 'MAM', 'MAM', 'MAM', 'JJA', 'JJA', 'JJA', 'SON', 'SON', 'SON', 'DJF'];
export function createPool(app) {
  SWITCH_FILE = app && app.dataDir ? join(app.dataDir, 'pool-ai.json') : null; swAt = 0;   /* v283.10 integration: the owner switch */
  const port = Number(process.env.PORT || 8787);
  /* v91.17.62 · the model-skill registry (station-lake/scripts/model_skill.py): weights per zone|season|lead|variable */
  let SK = null; const skFile = app && app.dataDir ? join(app.dataDir, 'model-skill.json') : null;
  const loadSkill = () => { try { SK = skFile && existsSync(skFile) ? JSON.parse(readFileSync(skFile, 'utf8')) : null; } catch { SK = null; } return SK; };
  loadSkill();
  /* ══ v91.17.68 · THE HOURLY RAIN PROBABILITY IS FREQUENCY-MATCHED TO GAUGES, OR NOT SERVED ═══════════════════════
     MEASURED (station-lake/scripts/ens_wet_reliability.py, 24 Jun–21 Aug 2026, 40 mountain ARG/AWS gauges and six
     Islamabad fleet gauges, 66,263 gauge-hours, the deterministic 0.25° grid at 0–24 h lead): the grid is "wet"
     (≥ 0.2 mm/h) 4.9× as often as a valley gauge in the mountains and 4.3× as often as a gauge in Islamabad; 85 % of
     the grid's wet hours were dry at the gauge. P(member ≥ 0.1 mm) is therefore the share of members whose 25-km cell
     carries a trace, not the chance of rain at the point — at Passu it printed 78 % under a clear sky. Frequency
     matching gives the grid amount τ whose exceedance frequency equals the gauge wet-hour frequency (τ ≈ 0.7 mm in the
     mountains, IQR 0.5–0.8 over 34 gauges; ≈ 0.9 mm in the plains); a member above τ is a member whose grid rain was,
     historically, rain at the gauge. Even then POD 0.31 / FAR 0.71 in the mountains: an hourly rain chance at a valley
     point is a weak forecast, and the response says so. Without the calibration file no calibrated value is served
     (pRain null with the reason); the raw member share stays under its own name (pWet) for the drill-down.
     The mountain/plains line (1,500 m) is the build's own boundary (gust withholding); gauges between 700 and 1,900 m
     were not in the sample, and the calibration record says so. (1,000 m: the registry's zone line, see cellFor.) */
  const wetFile = app && app.dataDir ? join(app.dataDir, 'ens-wet-reliability.json') : null; let WET = null, wetAt = 0;
  const MOUNTAIN_ELEV_M = 1000;   /* the model-skill registry's own zone boundary (cellFor), so one line serves both */
  const loadWet = () => { try { WET = wetFile && existsSync(wetFile) ? JSON.parse(readFileSync(wetFile, 'utf8')) : null; } catch { WET = null; } wetAt = Date.now(); return WET; };
  loadWet();
  /* ══ v91.17.70 · Sprint 1 · THE CHANCE OF RAIN IS CALIBRATED AGAINST IMERG, NOT AGAINST PMD GAUGES ══════════════════
     Option 2 (25 Sep 2026): no threshold a customer sees may be fitted to PMD records. The member threshold tau is now
     frequency-matched to NASA GPM IMERG (open satellite rain, 0.1°) at tehsil anchor points, day threshold from the IMERG
     wet-day share (>= 1 mm) and hour threshold from that share times the wet hours per wet day at AGN's own MACH gauges:
     data/rain-chance-calibration.json (station-lake/scripts/rain_imerg_calibration.py). The PMD gauges only TEST it
     (internal, station-lake/reports/rain_imerg_calibration.md: mountain daily Brier 0.1543 against 0.1542 for the old
     PMD-fitted tau and 0.174 for the untreated trace share, out of sample Oct 2025 - Aug 2026). The number is labelled
     "chance of rain" (rain in the ~10 km area around the point on that day / hour). The PMD-fitted table
     (ens-wet-reliability.json) is read only with NIGRAAN_INTERNAL_REF=1, for comparison. */
  const imergFile = app && app.dataDir ? join(app.dataDir, 'rain-chance-calibration.json') : null; let IMC = null, imcAt = 0;
  const loadImc = () => { try { IMC = imergFile && existsSync(imergFile) ? JSON.parse(readFileSync(imergFile, 'utf8')) : null; } catch { IMC = null; } imcAt = Date.now(); return IMC; };
  loadImc();
  function wetCalibration(elevM) {
    if (internalNames() && process.env.NIGRAAN_RAIN_TAU === 'pmd') return wetCalibrationPmd(elevM);   /* v91.17.71 · the gauge-matched threshold, internal comparison only; the served gauge calibration is gaugeDayChance */
    if (Date.now() - imcAt > 10 * 60e3) loadImc();
    const G = IMC && IMC.groups; if (!G) return { ok: false, why: 'no chance-of-rain calibration on this install (data/rain-chance-calibration.json): run station-lake/scripts/rain_imerg_calibration.py' };
    const line = IMC.groupLineM || MOUNTAIN_ELEV_M;
    const group = elevM == null ? null : (elevM >= line ? 'mountain' : 'plains'); const x = group && G[group] && G[group].ecmwf_ifs025;
    if (!x) return { ok: false, why: elevM == null ? 'the point has no elevation, so its calibration group is unknown' : 'no calibration group for this elevation' };
    return { ok: true, label: IMC.label || 'chance of rain', reference: 'IMERG', group: group === 'mountain' ? 'mountain (1,000 m and above)' : 'plains (below 1,000 m)',
      tauMm: x.tauHourMm, window: IMC.window, points: x.points, podAtTau: x.podAtTau, farAtTau: x.farAtTau, gridWetRatio: x.imergWetDayShare > 0 ? Math.round(100 * x.gridWetDayShareAt1mm / x.imergWetDayShare) / 100 : null,
      day: { tauMm: x.tauDayMm, imergWetDayShare: x.imergWetDayShare, gridWetDayShareAt1mm: x.gridWetDayShareAt1mm, podAtTau: x.podAtTau, farAtTau: x.farAtTau, pointDays: x.pointDays },
      basis: IMC.method, source: IMC.source ? IMC.source.attribution : null };
  }
  /* ══ v91.17.71 · THE DAY CHANCE OF RAIN, CALIBRATED ON THE MOUNTAIN GAUGES (stationData(), default ON) ═════════════════
     data/rain-gauge-calibration.json (station-lake/scripts/rain_gauge_calibration.py): k = how many of the three
     deterministic models (ecmwf_ifs025, icon_seamless, gfs_seamless) reach their IMERG day threshold on the Pakistan day;
     the chance is the gauges' observed wet-day frequency given k. Served only where the gauges measure rain: mountain
     points between domain.minElevM and domain.maxElevM, in the liquid months (the gauges undercatch snow). Held out
     [measured, internal]: Brier skill against climatology +0.30 leave-one-gauge-out and +0.35 on 2026, against +0.06 /
     +0.25 for the member share above the IMERG threshold. Elsewhere the IMERG-calibrated member share serves as before.
     NIGRAAN_RAIN_GAUGE=0 or NIGRAAN_STATION_DATA=0 turns it off. */
  /* v91.17.99 · plains chance of a heavy-rain day (IMERG >= 25 mm) from the served day total: data/rain-heavy-chance.json
     (station-lake/scripts/imerg_heavy_chance.py; fit Jun-Sep 2024-25, tested on Jun-Sep 2026). Served only for a threshold whose
     held-out Brier skill passed (serve: true), in its domain (plains, June-September). */
  const heavyFile = app && app.dataDir ? join(app.dataDir, 'rain-heavy-chance.json') : null; let HC = null, hcAt = 0;
  const loadHc = () => { try { HC = heavyFile && existsSync(heavyFile) ? JSON.parse(readFileSync(heavyFile, 'utf8')) : null; } catch { HC = null; } hcAt = Date.now(); return HC; };
  function heavyChance(dayTotal, date, elevM) {
    if (!HC || Date.now() - hcAt > 3600e3) loadHc(); if (!HC || dayTotal == null || !Number.isFinite(+dayTotal)) return null;
    if (elevM != null && elevM >= 1000) return null;
    const m = +String(date).slice(5, 7); if (!(HC.domain.months || []).includes(m)) return null;
    const T = HC.thresholds && HC.thresholds['25']; if (!T || !T.serve) return null;
    let b = 0; for (let i = 0; i < HC.binsMm.length; i++) if (+dayTotal >= HC.binsMm[i]) b = i;
    return T.chance[b];
  }
  const gaugeFile = app && app.dataDir ? join(app.dataDir, 'rain-gauge-calibration.json') : null; let GC = null, gcAt = 0;
  const loadGc = () => { try { GC = gaugeFile && existsSync(gaugeFile) ? JSON.parse(readFileSync(gaugeFile, 'utf8')) : null; } catch { GC = null; } gcAt = Date.now(); return GC; };
  loadGc();
  function gaugeDayChance(elevM, date, byModel, hours) {
    if (!stationData() || process.env.NIGRAAN_RAIN_GAUGE === '0') return null;
    if (Date.now() - gcAt > 10 * 60e3) loadGc();
    const G = GC; if (!G || !G.domain || !G.pk || elevM == null || !date) return null;
    if (elevM < G.domain.minElevM || elevM > G.domain.maxElevM) return null;
    const mo = Number(String(date).slice(5, 7)); if (!(G.domain.months || []).includes(mo)) return null;
    if (hours != null && hours < 22) return null;   /* a partial first day is not a Pakistan day total */
    let k = 0; for (const m of G.models || []) { const x = byModel ? byModel[m] : null; if (x == null || !Number.isFinite(x)) return null; if (x >= G.tauDayMm[m]) k++; }
    const half = (G.pk.halfRule && mo >= 8) ? 'late' : 'early';
    const p = ((G.pk.half || {})[half] || {})[String(k)] ?? (G.pk.pooled || {})[String(k)];
    return p == null ? null : { p: Math.round(1000 * p) / 1000, k, of: (G.models || []).length };
  }
  const gaugeCalibrationInfo = () => GC && stationData() && process.env.NIGRAAN_RAIN_GAUGE !== '0' ? { applied: 'day chance in the domain', label: label(GC.calibrationLabel || 'calibration'), source: label(GC.creditLabel || 'network'), tier: GC.tier || 'B', domain: GC.domain, method: GC.method, version: GC.version, ...(internalNames() ? { internal: { source: GC.source, n: GC.n } } : {}) } : null;
  function wetCalibrationPmd(elevM) {
    if (Date.now() - wetAt > 10 * 60e3) loadWet();
    const T = WET && WET.deterministic && WET.deterministic.tau; if (!T) return { ok: false, why: 'no gauge calibration on this install (data/ens-wet-reliability.json): run station-lake/scripts/ens_wet_reliability.py' };
    const group = elevM == null ? null : (elevM >= MOUNTAIN_ELEV_M ? 'mountain' : 'islamabad'); const x = group && T[group] && T[group].ecmwf_ifs025;
    if (!x) return { ok: false, why: elevM == null ? 'the point has no elevation, so its gauge group is unknown' : 'no gauge group for this elevation' };
    const det = WET.deterministic.groups && WET.deterministic.groups[group] && WET.deterministic.groups[group].ecmwf_ifs025;
    /* v91.17.69 · the day threshold, matched to the gauge wet-day frequency (>= 1.0 mm, 00-24 PKT); null when the file predates it */
    const TD = WET.deterministic.tauDay && WET.deterministic.tauDay[group] && WET.deterministic.tauDay[group].ecmwf_ifs025;
    const day = TD ? { tauMm: TD.tauMm, gaugeWetDayShare: TD.gaugeWetDayShare, gridWetDayShareAt1mm: TD.gridWetDayShareAt1mm, podAtTau: TD.podAtTau, farAtTau: TD.farAtTau, gaugeDays: TD.days, gauges: TD.gauges }
                   : { tauMm: null, why: 'the calibration file has no day threshold yet: run LEARN_NIGRAAN.bat rainprob (v91.17.69)' };
    return { ok: true, day, group: group === 'islamabad' ? 'plains (Islamabad gauges)' : 'mountain (GB / KP ARG-AWS gauges)', tauMm: x.tauMm, gauges: x.gauges, window: WET.deterministic.window, podAtTau: x.podAtTau, farAtTau: x.farAtTau, gridWetRatio: det ? det.wetRatio : null, gridFar02: det ? det.far02 : null, hours: det ? det.hours : null, basis: WET.deterministic.rule, sampleGap: 'no gauge between about 700 and 1,900 m in the sample; the line between the groups is the model-skill registry\'s 1,000 m zone boundary' };
  }
  const cellFor = (elevM, whenIso, leadH, variable) => { if (!SK || !SK.cells) return null; const zone = (elevM != null && elevM >= 1000) ? 'mountain' : 'plains'; const mo = Number(String(whenIso).slice(5, 7)) - 1; const lead = Math.min(3, Math.floor(leadH / 24) + 1); const c = SK.cells[zone + '|' + SEASON[mo] + '|' + lead + '|' + variable]; return c && c.weights ? { key: zone + '|' + SEASON[mo] + '|' + lead + '|' + variable, weights: c.weights, stations: c.stations, status: c.status || null, alpha: c.alpha ?? null, tier: c.verification_tier || null } : null; };
  /* v91.17.283.22 · ONE FETCH PER PRODUCT AND POINT. The caller's tag goes with the request (the place record's parts are tagged
     'place-record', a user tag of data/provider-budget.json: the place record is essential and is never shed as background; every other
     caller keeps 'pool'). An identical request already on its way is joined, not sent again (the place bundle builds its parts at once:
     poolHazard and the operator part pool asked the same products side by side); the /px run memo then keeps one answer per run. */
  const PX_INFLIGHT = new Map();
  const px = async (host, path, q, tag = 'pool') => { q.set('__omhost', host); const u = `http://127.0.0.1:${port}/px${path}?` + q.toString(), k = tag + '|' + u;
    if (PX_INFLIGHT.has(k)) return PX_INFLIGHT.get(k);
    const p = (async () => { const r = await fetch(u, { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': tag } }); if (!r.ok) { const e = new Error(host + ' ' + r.status); e.status = r.status; throw e; } return r.json(); })();
    PX_INFLIGHT.set(k, p); try { return await p; } finally { PX_INFLIGHT.delete(k); } };
  async function point({ lat, lon, elevM = null, days = 7, ai = aiDefault(), tag = 'pool' }) {
    const PM = modelsFor(ai), PE = ensFor(ai);
    const q = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'UTC', forecast_days: String(Math.max(1, Math.min(10, days))), models: PM.join(','), hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation', wind_speed_unit: 'ms' });
    if (elevM != null) q.set('elevation', String(Math.round(elevM)));
    const M = await px('api.open-meteo.com', '/v1/forecast', q, tag); const H = M.hourly || {}; const T = H.time || [];
    const at = (v, i) => PM.map(m => ({ model: m, x: Array.isArray(H[v + '_' + m]) ? H[v + '_' + m][i] : null }));
    /* v91.17.68 · "now" is the current hour, not 00:00 UTC of the request day: T[0] is the day start, so leadH and the
       served `now` were offset by the hour of the day (up to 23 h stale at 23 UTC). i0 = the hour nearest now. */
    const nowMs = Date.now(); let i0 = 0; for (let i = 0; i < T.length; i++) { if (Date.parse(T[i] + 'Z') <= nowMs + 1800e3) i0 = i; else break; }
    /* v91.17.70 · ONE BASIS: every model's temperature is taken at the served point height (the same elevation the served
       forecast uses) and, where the served forecast carries the MACH running correction, the same correction is added to
       every model before the band is formed, so the dissent flag compares like with like */
    const rbFn = (app && app.fleet && app.fleet.runningBias) ? (iso) => app.fleet.runningBias(lat, lon, elevM ?? M.elevation ?? null, Date.parse(iso + 'Z')) : null;
    const l2Probe = rbFn && T.length ? rbFn(T[Math.min(T.length - 1, 0)]) : null; const l2On = !!(l2Probe && l2Probe.applied);
    /* v91.17.71 · where the served forecast carries the station calibration (mountain / hills, mos.mjs calibrationAt), every
       model temperature takes the same day's offsets on the same diurnal shape (Tmin offset at 00 UTC, Tmax offset at
       09 UTC), so the dissent comparison stays like with like */
    let scProbe = null; const scMemo = new Map();
    try { const ez = elevM ?? M.elevation ?? null; if (!l2On && app && app.mos && app.mos.calibrationOn && app.mos.calibrationOn() && ez != null) { const zone = app.mos.zoneOfPoint(lat, lon, ez); if (zone === 'mountain' || zone === 'hills' || ((zone === 'plains' || zone === 'coast') && app.mos.calibratedZone && app.mos.calibratedZone(zone) && app.mos.calibrationAt(lat, lon, ez, zone, new Date(Date.now() + 5 * 3600e3).getUTCMonth() + 1))) scProbe = { zone, ez }; } } catch (_) { scProbe = null; }
    const scAt = (iso) => { if (!scProbe) return 0; const tMs = Date.parse(iso + 'Z'); const mo = new Date(tMs + 5 * 3600e3).getUTCMonth() + 1; if (!scMemo.has(mo)) scMemo.set(mo, app.mos.calibrationAt(lat, lon, scProbe.ez, scProbe.zone, mo)); const c = scMemo.get(mo); if (!c) return 0; const d = new Date(tMs); const h = d.getUTCHours() + d.getUTCMinutes() / 60; const w = h <= 9 ? h / 9 : Math.max(0, (24 - h) / 15); return c.tn + (c.tx - c.tn) * w; };
    /* v91.17.73 (agent A) · the AI local correction the served forecast took at this point and Pakistan day (downscale.mjs
       servedTerm) joins every model on the same diurnal shape, so the dissent comparison stays like with like */
    const aiAt = (iso) => { try { const D = downscaleFor(app); if (l2On || !D || !D.servedTerm) return 0; const tMs = Date.parse(iso + 'Z'); const r = D.servedTerm(lat, lon, new Date(tMs + 5 * 3600e3).toISOString().slice(0, 10)); if (!r) return 0; const d = new Date(tMs); const h = d.getUTCHours() + d.getUTCMinutes() / 60; const w = h <= 9 ? h / 9 : Math.max(0, (24 - h) / 15); return r.dTn + (r.dTx - r.dTn) * w; } catch (_) { return 0; } };
    const atT = (i) => { const vals = at('temperature_2m', i); const ai = aiAt(T[i]); if (scProbe || ai) { const a = (scProbe ? scAt(T[i]) : 0) + ai; return a ? vals.map(p => ({ ...p, x: p.x == null ? null : Math.round((p.x + a) * 100) / 100 })) : vals; } if (!l2On) return vals; const r = rbFn(T[i]); return r && r.applied ? vals.map(p => ({ ...p, x: p.x == null ? null : Math.round((p.x + r.t) * 100) / 100 })) : vals; };
    const hourly = [];
    for (let i = 0; i < T.length; i++) {
      const ct = cellFor(elevM ?? M.elevation, T[i], Math.max(0, i - i0), 'temperature_2m'); const cw = cellFor(elevM ?? M.elevation, T[i], Math.max(0, i - i0), 'wind_speed_10m');   /* v91.17.68 · the wind pool is wind_speed_10m; its own skill cell, not the gust cell (B16) */
      const t = familyPool(atT(i), ct && ct.weights), w = familyPool(at('wind_speed_10m', i), cw && cw.weights), rh = familyPool(at('relative_humidity_2m', i), null);
      hourly.push({ t: T[i], leadH: i - i0, temperature: t && { p50: t.p50, p10: t.p10, p90: t.p90, weighting: t.weighting, skillCell: ct ? ct.key : null, skillStatus: ct ? ct.status : null, skillAlpha: ct ? ct.alpha : null, unscored: t.unscored, mean: t.mean, dispersion: t.dispersion, agreement: agreeClass('temperature_2m', t.dispersion), n: t.n, families: t.families, physicalAgreement: agreeClass('temperature_2m', t.physicalSpan), aiAgreement: agreeClass('temperature_2m', t.aiSpan) },
        wind: w && { p50: w.p50, p10: w.p10, p90: w.p90, dispersion: w.dispersion, agreement: agreeClass('wind_speed_10m', w.dispersion), n: w.n }, humidity: rh && { p50: rh.p50, dispersion: rh.dispersion, agreement: agreeClass('relative_humidity_2m', rh.dispersion), n: rh.n } });
    }
    /* daily rain totals per model (family pool of totals) */
    /* v91.17.68 · day totals on Pakistan days (00–24 PKT), the basis of every class trigger on the dashboard; the hourly
       series stays UTC because the strip joins it by UTC hour (B2) */
    /* v91.17.283.28 · S2 · hour-ending amounts: a PKT day is the hours ending 01:00-24:00 (pktday.mjs hourEndingDay, the one rule) */
    const dayIdx = {}; T.forEach((t, i) => { const d = hourEndingDay(t, { utc: true }); (dayIdx[d] = dayIdx[d] || []).push(i); });
    const detRain = Object.entries(dayIdx).map(([d, idx]) => { const vals = PM.map(m => { const a = H['precipitation_' + m]; if (!Array.isArray(a)) return { model: m, x: null }; let s = 0, n = 0; for (const i of idx) if (a[i] != null) { s += a[i]; n++; } return { model: m, x: n === 24 ? s : null }; });   /* v283.28 S2: a day total only from all 24 hours (a part day is not the day's rain) */ const cp = cellFor(elevM ?? M.elevation, d + 'T00', idx[0], 'precipitation'); const p = familyPool(vals, cp && cp.weights); return { date: d, hours: idx.length, weighting: p && p.weighting, skillCell: cp ? cp.key : null, skillStatus: cp ? cp.status : null, p50: p && p.p50, p10: p && p.p10, p90: p && p.p90, mean: p && p.mean, agreement: p && agreeClass('precipitation', p.dispersion), n: p && p.n, byModel: p && p.byModel }; });
    /* the two ensembles, equal-system */
    const ensDays = []; const ensErr = [];
    const sysDaily = {};
    for (const s of PE) {
      try {
        /* v91.17.283.28 · S2 · each member's PKT day total by the hour-ending rule from its hourly rain (the provider's own day total adds the
           hours stamped 00-23); a member day is a total only with all 24 hours (else null: not a member of that day) */
        const nd = Math.max(1, Math.min(10, days));
        const eq = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'UTC', past_days: '1', forecast_days: String(Math.min(11, nd + 1)), models: s.id, hourly: 'precipitation' });   /* past_days 1: today's hours from 01:00 PKT (20 UTC the day before) */
        const E = await px('ensemble-api.open-meteo.com', '/v1/ensemble', eq, tag); const Hh = E.hourly || {}; const keys = Object.keys(Hh).filter(k => k.startsWith('precipitation'));
        const today = hourEndingDay(Date.now() + 3600e3), want = Array.from({ length: nd }, (_, k) => new Date(Date.parse(today + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10));
        const tots = keys.map((k) => hourEndingTotals(Hh.time || [], Hh[k], { utc: true }));
        sysDaily[s.id] = { dates: want, members: tots.map((m) => want.map((d) => { const e = m.get(d); return e && e.n === 24 && !e.dup ? Math.round(e.sum * 100) / 100 : null; })) };
      } catch (e) { if (e && e.status === 429) throw e; ensErr.push(s.name + ': ' + e.message); }   /* v91.17.283.22 · a provider-limit refusal fails the call (the place bundle retries the part), never a silent partial answer */
    }
    const dates = (Object.values(sysDaily)[0] || { dates: [] }).dates;
    for (let di = 0; di < dates.length; di++) {
      const systems = PE.filter(s => sysDaily[s.id]).map(s => ({ id: s.name, members: sysDaily[s.id].members.map(m => m[di]).filter(x => x != null) }));
      const es = equalSystem(systems); if (es) ensDays.push({ date: dates[di], leadDays: di, ...es });
    }
    const lead0 = hourly[i0] || hourly[0] || {};
    const out = {
      at: T[0] || null, lat, lon, elevM: M.elevation ?? null, correctedTemperature: !!(M.agn_bias_correction && M.agn_bias_correction.applied),
      correctionNote: l2On ? 'every model temperature is at the served point height and carries the same MACH running correction as the served forecast' : scProbe ? 'every model temperature is at the served point height and carries the same station calibration as the served forecast (the day\'s Tmin offset at dawn, the Tmax offset in the afternoon)' : 'every model temperature is the model\'s own value at the served point height, the same basis as the served forecast here (no running correction applies at this point)',
      basis: { elevM: M.elevation ?? null, height: elevM != null ? 'caller-supplied height' : 'the provider\'s DEM at the point', correction: l2On ? 'L0+L2' : (scProbe && scMemo.size && [...scMemo.values()].some(Boolean) ? 'L0+SC' : 'L0'), calibration: scProbe && [...scMemo.values()].some(Boolean) ? { tier: 'B', label: label('calibration'), source: app.mos.calibrationCredit(scProbe.zone) } : null, runningCorrection: l2On ? { stations: l2Probe.stations } : null, version: (app && app.mos && app.mos.version) || null },
      aiModels: aiNote(ai),
      rule: { consensus: 'weighted median, one vote per forecast family (' + [...new Set(Object.values(FAMILY))].join(', ') + ')' + (ai ? '; ECMWF and NOAA pairs share their family vote' : '; one physical model per family (AI models shadow-only)'), models: PM.slice(), notPooled: NOT_POOLED, ensembles: ai ? 'equal system weight: each ECMWF ENS member 0.5/51, each WeatherNext 2 member 0.5/64' : 'ECMWF ENS alone: each member 1/51 (WeatherNext 2 shadow-only)', weights: SK ? 'skill weights from the Pakistan model-skill registry (built ' + String(SK.built).slice(0, 10) + ', ' + SK.cellsWithWeights + ' cells) where the zone|season|lead|variable cell has them; equal per family elsewhere' : 'equal per family: the model-skill registry is not installed', skillRegistry: SK ? { built: SK.built, window: SK.window, cellsWithWeights: SK.cellsWithWeights, cellsWithout: SK.cellsWithout, rule: SK.rule, verification: SK.verification || null, statuses: SK.statuses || null } : null, scientificStatus: { ensembleProbabilities: 'Probabilistic', poolingRule: 'Empirical', consensusValue: 'Physical / Empirical (the models are)' } },
      now: { temperature: lead0.temperature || null, wind: lead0.wind || null, humidity: lead0.humidity || null, regime: regime(0) },
      hourly, deterministicRain: detRain, ensembleRain: ensDays, ensembleErrors: ensErr,
      regimes: [regime(0), regime(96), regime(200)],
      note: 'forecast and confidence are separate: the P50 is never moved by disagreement; agreement classes are dispersion on the variable\'s own scale (temperature High ≤ 1.5 °C P90−P10, Moderate ≤ 3, Low ≤ 5)'
    };
    /* v91.17.283.21 · the deterministic models' hourly rain (UTC rows), kept off the answer (not enumerable): the screening fallback of the
       3-hour rain windows of hazard() when the ensemble members do not cover a window */
    Object.defineProperty(out, 'rainByModel', { value: { time: T, models: PM.map((m) => ({ model: m, x: Array.isArray(H['precipitation_' + m]) ? H['precipitation_' + m] : null })) }, enumerable: false });
    return out;
  }

  /* ══ v91.17.65 · THE HAZARD FEED: P(R > k) FROM THE ENSEMBLES, HOURLY AND DAILY ══════════════════════════════
     The hazard classes fired on one deterministic rain series; the ensembles already served daily P(R > k) on
     /api/pool/point. This gives the classes and the hourly strip what they need in one call: per hour for 72 h the
     equal-system probability of rain (≥ 0.1 mm), of ≥ 1 mm and ≥ 5 mm, with the P50/P90; per day P(R24 > 1..100 mm)
     with a log-linear interpolation to any trigger total (`mm`), and the deterministic served total beside it so a
     class can say "single run, ensembles disagree" (det ≥ trigger, P < 0.15) or "ensemble watch" (det < trigger,
     P ≥ 0.40). Cached 20 minutes per point. */
  const HZ_CACHE = new Map(); const HZ_TTL = 20 * 60e3;
  function pExceed(ex, mm) {
    if (!ex) return null; const th = RAIN_TH.filter(t => ex[t] != null); if (!th.length) return null;
    if (mm <= th[0]) return ex[th[0]]; if (mm >= th[th.length - 1]) return ex[th[th.length - 1]];
    for (let i = 0; i < th.length - 1; i++) { const a = th[i], b = th[i + 1]; if (mm >= a && mm <= b) { const f = (Math.log(mm) - Math.log(a)) / (Math.log(b) - Math.log(a)); return Math.round(1000 * (ex[a] + f * (ex[b] - ex[a]))) / 1000; } }
    return null;
  }
  function verdict(det, p) {
    if (det == null || p == null) return null;
    return { detAboveTrigger: det >= 1, probability: p, agreement: (det >= 1 && p < 0.15) ? 'single run, ensembles disagree' : (det < 1 && p >= 0.4) ? 'ensemble watch: the single run is below the trigger but the ensembles put it at ' + Math.round(100 * p) + ' %' : (det >= 1 ? 'ensembles support the trigger' : 'below the trigger on both') };
  }
  /* ══ v91.17.283.21 · RAIN IN 3-HOUR WINDOWS (owner, 26 Oct 2026: rain is never shown at an exact hour) ══════════════════════════════
     The place's rain is shown per 3-hour PKT window (00-03, 03-06, ... 21-24; a window holds the hours stamped 00, 01, 02 PKT, the same
     hours the day totals of the place record add up). The chance of rain in a window is the equal-system share of ensemble MEMBERS whose
     rain accumulated over the window's three hours reaches the wet threshold tau of the chance-of-rain calibration (the threshold the
     hourly chance uses; data/rain-chance-calibration.json): one member, one complete window sum, one vote. It is never a combination of
     hourly probabilities. A window the members do not cover in full (the ensemble did not arrive, or its hours end) takes the screening
     value: the share of the deterministic forecast models (one vote per family) whose window sum reaches the same tau, labelled
     screening; a window neither covers is null with the reason. */
  const HOURLY_DAYS = 3;   /* the hourly rows of hazard() (as before v283.21) */
  const WINDOW_DAYS = 4;   /* the days of hours of the place record (server/api/pointstate.mjs): the windows cover all of them */
  /* v91.17.283.23 · audit 12 · a rain value stamped hh (UTC) is the rain of the PRECEDING hour, so it is placed by hh-1: window hh..hh+3 PKT
     sums the values stamped hh+1, hh+2, hh+3 PKT (one rule with the strip, hourstrip_ui.js rainWin) */
  const pktWin = (utc) => hourEndingWindow(utc, { utc: true });   /* v283.28 S2: the one rule (pktday.mjs) */
  function rainWindows(PE, sysH, time, cal, det) {
    const tau = cal && cal.ok && cal.tauMm > 0 ? cal.tauMm : null;
    const base = { tauMm: tau, dayBasis: 'Asia/Karachi (PKT) 3-hour windows; a window hh to hh+3 holds the rain of its three hours (the values stamped hh+1, hh+2, hh+3 PKT: each is the preceding hour)', rule: 'share of ensemble members (equal system weight) whose rain summed over the window reaches tau; screening fallback: share of the deterministic forecast models (one vote per family) over the same window and tau' };
    if (tau == null) return { ...base, ok: false, why: (cal && cal.why) || 'no chance-of-rain calibration (tau) on this install', windows: [] };
    const W = new Map(); const slot = (k) => { if (!W.has(k)) W.set(k, { start: k, ens: [], det: [] }); return W.get(k); };
    time.forEach((t, i) => slot(pktWin(t)).ens.push(i));
    const dT = det && Array.isArray(det.time) ? det.time : []; dT.forEach((t, i) => slot(pktWin(t)).det.push(i));
    const sum = (arr, idx) => { if (!Array.isArray(arr) || idx.length !== 3) return null; let s = 0; for (const i of idx) { const v = arr[i]; if (v == null || !Number.isFinite(v)) return null; s += v; } return s; };
    const windows = [...W.values()].sort((a, b) => (a.start < b.start ? -1 : 1)).map((w) => {
      const end = (() => { const d = new Date(Date.parse(w.start + ':00Z') + 3 * 3600e3); return d.toISOString().slice(0, 16); })();
      const live = PE.filter((s) => sysH[s.id]).map((s) => ({ id: s.name, sums: sysH[s.id].members.map((m) => sum(m, w.ens)).filter((x) => x != null) })).filter((s) => s.sums.length);
      if (live.length) { let p = 0, n = 0; for (const s of live) { const wt = (1 / live.length) / s.sums.length; for (const x of s.sums) { n++; if (x >= tau) p += wt; } }
        return { start: w.start, end, pRain: Math.round(1000 * p) / 1000, basis: 'members', members: n, systems: live.map((s) => s.id) }; }
      const ms = (det && det.models || []).map((m) => ({ model: m.model, x: sum(m.x, w.det) })).filter((m) => m.x != null);
      if (ms.length) { const fam = {}; for (const m of ms) { const f = FAMILY[m.model] || m.model; fam[f] = (fam[f] || 0) + 1; } const nf = Object.keys(fam).length;
        let p = 0; for (const m of ms) if (m.x >= tau) p += (1 / nf) / fam[FAMILY[m.model] || m.model];
        return { start: w.start, end, pRain: Math.round(1000 * p) / 1000, basis: 'screening', screening: true, models: ms.length, families: nf, why: 'no ensemble members cover this window: share of the deterministic forecast models (one vote per family)' }; }
      return { start: w.start, end, pRain: null, basis: null, why: 'neither the ensemble members nor the forecast models cover all three hours of this window' };
    });
    return { ...base, ok: true, windows };
  }
  /* v91.17.283.22 · the hazard feed reads the SAME pool request as the operator part pool (5 days: POOL_DAYS) and keeps its own 3 days
     (HOURLY_DAYS) of it: the first 3 days of a 5-day answer of the same run are the 3-day answer, so every value is unchanged and the
     place asks the multi-model forecast and the ensemble day totals once instead of twice */
  const POOL_DAYS = 5;
  const firstDays = (P, n) => { const T = (P.rainByModel && P.rainByModel.time) || []; const cut = n * 24; const R = { ...P, hourly: (P.hourly || []).slice(0, cut), deterministicRain: (P.deterministicRain || []).slice(0, n), ensembleRain: (P.ensembleRain || []).slice(0, n) };
    Object.defineProperty(R, 'rainByModel', { value: { time: T.slice(0, cut), models: (P.rainByModel ? P.rainByModel.models : []).map((m) => ({ model: m.model, x: Array.isArray(m.x) ? m.x.slice(0, cut) : null })) }, enumerable: false }); return R; };
  async function hazard({ lat, lon, elevM = null, mm = null, ai = aiDefault(), tag = 'pool' }) {
    const PE = ensFor(ai);
    const key = lat.toFixed(3) + ',' + lon.toFixed(3) + (ai ? '|ai' : ''); const hit = HZ_CACHE.get(key);
    let R = hit && Date.now() - hit.at < HZ_TTL ? hit.r : null;
    if (!R) {
      const P = firstDays(await point({ lat, lon, elevM, days: POOL_DAYS, ai, tag }), HOURLY_DAYS);
      const sysH = {}; const errs = [];
      for (const s of PE) {
        try {
          const eq = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'UTC', forecast_days: String(WINDOW_DAYS), models: s.id, hourly: 'precipitation' });
          const E = await px('ensemble-api.open-meteo.com', '/v1/ensemble', eq, tag); const Hh = E.hourly || {}; const keys = Object.keys(Hh).filter(k => k.startsWith('precipitation'));
          sysH[s.id] = { time: Hh.time || [], members: keys.map(k => Hh[k]) };
        } catch (e) { if (e && e.status === 429) throw e; errs.push(s.name + ': ' + e.message); }   /* v91.17.283.22 · as in point() */
      }
      const time = (Object.values(sysH)[0] || { time: [] }).time; const hourly = []; const cal = wetCalibration(elevM ?? P.elevM);
      for (let i = 0; i < Math.min(time.length, HOURLY_DAYS * 24); i++) {
        const systems = PE.filter(s => sysH[s.id]).map(s => ({ id: s.name, members: sysH[s.id].members.map(m => m[i]).filter(x => x != null) }));
        const live = systems.filter(x => x.members.length); if (!live.length) continue;
        const pts = []; for (const sy of live) { const w = (1 / live.length) / sy.members.length; for (const x of sy.members) pts.push({ x, w }); }
        pts.sort((a, b) => a.x - b.x); const wq = (q) => { let acc = 0; for (const p of pts) { acc += p.w; if (acc >= q - 1e-9) return p.x; } return pts[pts.length - 1].x; };
        const pw = (t) => Math.round(1000 * pts.reduce((a, p) => a + (p.x >= t ? p.w : 0), 0)) / 1000;
        hourly.push({ t: time[i], pWet: pw(0.1), pRain: cal.ok ? pw(cal.tauMm) : null, pGt1: pw(1), pGt5: pw(5), p50: Math.round(10 * wq(0.5)) / 10, p90: Math.round(10 * wq(0.9)) / 10, systems: live.length });
      }
      const windows3h = rainWindows(PE, sysH, time, cal, P.rainByModel);
      const detByDate = Object.fromEntries((P.deterministicRain || []).map(d => [d.date, d]));
      /* the served single forecast's own daily totals (best match), the series the classes fire on */
      let served = {};
      /* v91.17.283.28 · S2 · the served day totals by the hour-ending rule from the served hourly rain (24 hours or no total) */
      try { const sq = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'UTC', past_days: '1', forecast_days: '4', hourly: 'precipitation' }); if (elevM != null) sq.set('elevation', String(elevM)); const S = await px('api.open-meteo.com', '/v1/forecast', sq, tag); const Hs = S.hourly || {};
        for (const [d, e] of hourEndingTotals(Hs.time || [], Hs.precipitation || [], { utc: true })) if (e.n === 24 && !e.dup) served[d] = Math.round(e.sum * 100) / 100; } catch (e) { errs.push('served: ' + e.message); }
      const tauDay = cal && cal.ok && cal.day && cal.day.tauMm > 0 ? cal.day.tauMm : null;
      const ez = elevM ?? P.elevM;
      const days = (P.ensembleRain || []).map(d => { const gd = detByDate[d.date] ? gaugeDayChance(ez, d.date, detByDate[d.date].byModel, detByDate[d.date].hours) : null; return { date: d.date, leadDays: d.leadDays, ex: d.exceed, pRainDay: gd ? gd.p : (tauDay != null && d.exceed ? pExceed(d.exceed, tauDay) : null), pRainDayBasis: gd ? 'station calibration' : 'ensemble share above the IMERG threshold', ...(gd ? { pRainDayModels: gd.k + ' of ' + gd.of } : {}), pHeavy25: heavyChance(served[d.date] ?? (detByDate[d.date] ? detByDate[d.date].p50 : null), d.date, P.elevM), p10: d.p10, p50: d.p50, p90: d.p90, systems: d.systems ? Object.keys(d.systems).length : null, systemAgreement: d.systemAgreement || null, detServed: served[d.date] ?? null, consensusP50: detByDate[d.date] ? (detByDate[d.date].p50 ?? null) : null }; });
      const temperature = (P.hourly || []).slice(0, 72).map(h => ({ t: h.t, p10: h.temperature ? h.temperature.p10 : null, p50: h.temperature ? h.temperature.p50 : null, p90: h.temperature ? h.temperature.p90 : null, n: h.temperature ? h.temperature.n : null }));
      R = { at: new Date().toISOString(), lat, lon, elevM: P.elevM, aiModels: aiNote(ai), poolModelCount: (P.rule && P.rule.models || []).length, dayBasis: 'Asia/Karachi calendar days (00–24 PKT), the basis of the dashboard\'s class triggers; hourly rows are UTC', hourly, windows3h, days, temperature, ensembleErrors: [...(P.ensembleErrors || []), ...errs], rainCalibration: cal, rainDayCalibration: days.some(x => x.pRainDayBasis === 'station calibration') ? gaugeCalibrationInfo() : null, heavyRainCalibration: days.some(x => x.pHeavy25 != null) && HC ? { what: 'pHeavy25 = chance of a heavy-rain day (satellite rain at or above 25 mm at the point) from the served day total', reference: HC.reference, fit: HC.fit, heldOutBrierSkill: HC.thresholds['25'].heldOut2026.brierSkill, domain: HC.domain } : null, rule: { weighting: ai ? 'equal system (ECMWF ENS 51 × 0.5/51, WeatherNext 2 64 × 0.5/64)' : 'ECMWF ENS alone (51 × 1/51); WeatherNext 2 shadow-only', hourly: 'pWet = P(1 h ≥ 0.1 mm) = the share of members whose grid cell carries a trace (not printed as a chance); pRain = the chance of rain: P(1 h ≥ τ) with τ frequency-matched to IMERG satellite rain (rainCalibration, v91.17.70), null when no calibration exists; pRainDay likewise with the day threshold, except in the mountain liquid-rain domain, where it is the station-calibrated day chance (pRainDayBasis, rainDayCalibration, v91.17.71); pGt1, pGt5 likewise; P50/P90 of the hourly member totals', daily: 'ex = P(R24 ≥ k) for k in ' + RAIN_TH.join('/') + ' mm; any trigger total is read by log-linear interpolation between the two nearest k', verdict: 'single run, ensembles disagree: served total ≥ trigger and P < 0.15; ensemble watch: served total < trigger and P ≥ 0.40', temperature: 'P10/P50/P90 of the ' + (ai ? 'nine' : 'seven') + '-model pool per hour on the served basis (same height, same running correction) for the dissent flag on the served forecast' } };
      HZ_CACHE.set(key, { at: Date.now(), r: R }); if (HZ_CACHE.size > 500) HZ_CACHE.delete(HZ_CACHE.keys().next().value);
    }
    const out = { ...R, cached: !!hit && R === hit.r };
    if (mm != null && mm > 0) out.trigger = { mm, days: R.days.map(d => { const p = pExceed(d.ex, mm); return { date: d.date, leadDays: d.leadDays, probability: p, detServed: d.detServed, consensusP50: d.consensusP50, verdict: verdict(d.detServed != null ? d.detServed / mm : null, p) }; }) };
    return out;
  }
  return { point, hazard, rainWindows, pktWin, pExceed, POOL_DAYS, MODELS, FAMILY, NOT_POOLED, AI_SHADOW, modelsFor, ensFor, aiDefault, aiSource, reloadSkill: loadSkill, skill: () => SK, wetCalibration, gaugeDayChance };
}
