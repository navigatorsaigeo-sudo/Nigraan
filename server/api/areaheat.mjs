/* == v91.17.283.12 . AREA HEAT FROM THE POINT STATES ==================================================================================
   The heat level of a tehsil (the map, /api/levels, /api/levels/unit, the alerts) was the page engine's UTCI at the tehsil centroid, from
   a different forecast request than the point every Overview widget reads (owner 24 Oct: the left tile said Normal, the map coloured the
   plains Low). It is now the HIGHEST heat level over the tehsil's own point states (pointstate.mjs, the served forecast chain):
     points    each tehsil's main settlement (data/tehsil-anchor.json anchor) and its polygon centre point (the file's centre) when the two lie
               more than 5 km apart (a hill tehsil's town and its high ground); both are points the pages can select
     value     per PKT day 0-3, the day's highest UTCI in shade over those points (pointstate days[].heat.utciMaxC, utci.mjs), and its level
               on the one rule (utci.mjs utciAgnScore: a level only from strong heat stress, UTCI 32 C), placed on the AGN band cuts
     when      once per provider model run (pointstate run key), in the background (tag 'pointstate-area', one multi-location request per
               40 points, one at a time), and again on the first engine report after a server start
     where     engine.report() calls apply(rec) on every report it receives, and apply() runs on the held report when a new set lands,
               so the issued heat layer, its scores, its counts and the heat alert rows are the area values. A tehsil without a point
               state keeps the engine's level (and the record says how many tehsils were replaced).
   NIGRAAN_AREA_HEAT=0 turns it off; NIGRAAN_AREA_HEAT_MIN_H (default 3) is the shortest interval between two passes. */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { heatCellOf, coldCellOf } from './utcilevel.mjs';
import { schedule } from './scheduler.mjs';
import { levelOfScreeningScore } from './scalecuts.mjs';
import { rowUnits } from './engine.mjs';
import { comfortDays, COMFORT_NAME, COMFORT_NOTE } from './comfort.mjs';   /* v283.35 · item 5 */
import { heatIndexDays, heatBands } from './heatindex.mjs';   /* v283.40 · heat-index band by day */

const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const km = (a, b, c, d) => { const p = Math.PI / 180; const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
/* v91.17.283.24 · H17 · the AGN band cuts from data/hazard-scale.json screeningCuts (scalecuts.mjs, the one home) */
export const levelOfScore = (s) => levelOfScreeningScore(s);
export const NO_POINT_STATE = 'data missing: no point state of the served forecast chain holds this tehsil and day yet';

/* r42 · 1.0.6 · the held hourly temperatures of a pass: per point [time, tempC] from the present PKT hour, 48 hours */
export function holdHours(P, states, run) {
  const from = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 13); const pts = [];
  P.forEach((p, i) => { const s = states[i]; if (!s || !s.ok || !Array.isArray(s.hours)) return;
    const hs = s.hours.filter((x) => x && typeof x.time === 'string' && x.time.slice(0, 13) >= from && isN(x.tempC)).slice(0, 48); if (!hs.length) return;
    const v = [hs[0].tempC]; for (let k = 1; k < hs.length; k++) { if (Date.parse(hs[k].time + ':00Z') - Date.parse(hs[k - 1].time + ':00Z') !== 3600e3) break; v.push(hs[k].tempC); }   /* consecutive hours only */
    const tn = String(p.uid || '').split('|').pop();
    pts.push({ uid: p.uid, name: p.name || (p.kind === 'centre' ? tn + ' (centre)' : tn), kind: p.kind, lat: p.lat, lon: p.lon, elevM: s.point && isN(s.point.elevM) ? s.point.elevM : null, t0: hs[0].time.slice(0, 13), v }); });
  return { run, at: new Date().toISOString(), pts };
}
export function pointsOf(anchorUnits, popCells = null) {
  const out = [];
  for (const [uid, u] of Object.entries(anchorUnits || {})) {
    const a = u && u.anchor, c = u && u.centre;
    const pc = popCells && Array.isArray(popCells[uid]) ? popCells[uid] : null;
    if (a && isN(a.lat) && isN(a.lon)) out.push({ uid, lat: a.lat, lon: a.lon, kind: 'main settlement', name: a.name || null, pop: pc && pc[0] && pc[0].kind === 'main settlement' ? pc[0].pop : Math.max(1, Number(a.population) || 1) });
    if (c && isN(c.lat) && isN(c.lon) && (!a || km(a.lat, a.lon, c.lat, c.lon) > 5)) out.push({ uid, lat: c.lat, lon: c.lon, kind: 'centre', pop: 0 });
    /* v91.17.283.31 · owner 2.2 · the tehsil's other populated places (data/tehsil-popcells.json towns) */
    if (pc) for (const t of pc) if (t.kind === 'town' && isN(t.lat) && isN(t.lon)) out.push({ uid, lat: t.lat, lon: t.lon, kind: 'town', name: t.name || null, pop: Number(t.pop) || 1 });
  }
  return out;
}
/* v91.17.283.31 · owner 2.2 · THE POPULATED-AREA LEVEL: the highest level L that at least `share` of the population of the tehsil's populated
   points reaches. An unassessed populated point counts as both ends (lowest and highest level): the level is served only when both give
   the same answer, else not assessed with the point's reason. */
export function shareLevel(pts, share) {
  const tot = pts.reduce((s, p) => s + p.w, 0); if (!(tot > 0)) return { level: null };
  const at = (fill) => { let best = 0; for (let L = 1; L <= 4; L++) { const w = pts.reduce((s, p) => s + ((p.level == null ? fill : p.level) >= L ? p.w : 0), 0); if (w / tot >= share - 1e-9) best = L; } return best; };
  const lo = at(0), hi = at(4); return lo === hi ? { level: lo } : { level: null, range: [lo, hi] };
}
/* per unit and date: the highest day UTCI over the unit's point states.
   v91.17.283.23 · audit 8: a point whose day UTCI could not be assessed (outside the UTCI range, humidity missing, ...) is NOT dropped from
   the maximum: the highest assessed value is then only a lower bound, so the unit's level is served only when that bound is already the
   top level (Severe); otherwise the unit-day is not assessed, with the point's reason. */
/* v91.17.283.28 · S3 · a point whose state FAILED (or is absent, or does not hold the date) is the same as a point not assessed: its UTCI
   is unknown, so the unit-day's highest assessed value is only a lower bound. The dates are the run's days 0-3 (every date any point
   state of the pass holds), so a unit whose points all failed is not assessed on each of them (before: the failed point was skipped and
   the unit's level stood on the points that happened to answer). */
export function aggregate(points, states, o = {}) {
  const share = isN(o.share) ? o.share : null;   /* v283.36 · launch item 16 · no 0.25 fallback */
  if (share == null) return {};
  const U = {}, dates = new Set();
  states.forEach((s) => { if (s && s.ok && Array.isArray(s.days)) for (const d of s.days) if (d.lead >= 0 && d.lead <= 3 && d.heat) dates.add(d.date); });
  points.forEach((p, i) => { const s = states[i]; const u = U[p.uid] || (U[p.uid] = { points: 0, days: {}, cold: {} }); u.points++;
    const ok = !!(s && s.ok && Array.isArray(s.days)), byDate = new Map(ok ? s.days.filter((d) => d.lead <= 3 && d.heat).map((d) => [d.date, d]) : []);
    for (const date of dates) { const d = byDate.get(date), base = { point: p.kind, name: p.name || null, lat: p.lat, lon: p.lon, w: isN(p.pop) ? p.pop : (p.kind === 'centre' ? 0 : 1) };
      const failWhy = !d ? (ok ? 'not assessed: the point state does not hold this day' : 'not assessed: the point state failed (' + String((s && s.why) || 'no answer').slice(0, 120) + ')') : null;
      const h = (u.days[date] = u.days[date] || { utciMaxC: null, pts: [], notAssessed: [] }), c = (u.cold[date] = u.cold[date] || { utciMinC: null, pts: [], notAssessed: [] });
      const hv = d && d.heat && isN(d.heat.utciMaxC) ? d.heat.utciMaxC : null, cv = d && d.cold && isN(d.cold.utciMinC) ? d.cold.utciMinC : null;
      if (hv == null) h.notAssessed.push({ ...base, why: failWhy || (d.heat && d.heat.why) || 'not assessed' });
      else if (h.utciMaxC == null || hv > h.utciMaxC) Object.assign(h, { utciMaxC: hv, at: d.heat.at, cls: d.heat.cls, point: p.kind, lat: p.lat, lon: p.lon, name: p.name || null });
      if (cv == null) c.notAssessed.push({ ...base, why: failWhy || (d && d.cold && d.cold.why) || 'not assessed' });
      else if (c.utciMinC == null || cv < c.utciMinC) Object.assign(c, { utciMinC: cv, at: d.cold.at, point: p.kind, lat: p.lat, lon: p.lon, name: p.name || null });
      { h.pts.push({ ...base, level: hv == null ? null : heatCellOf(hv).level, utci: hv }); c.pts.push({ ...base, level: cv == null ? null : coldCellOf(cv).level, utci: cv }); } } });
  const fin = (o, ext) => { let pop = o.pts.filter((p) => p.w > 0 && p.point !== 'centre');
    if (!pop.length) pop = o.pts.filter((p) => p.point === 'centre').map((p) => ({ ...p, w: 1 }));   /* no settlement known: the centre stands in */
    const r = pop.length ? shareLevel(pop, share) : { level: null };
    o.extremePoint = o[ext] == null ? null : { utciC: o[ext], at: o.at || null, point: o.point, name: o.name || null, lat: o.lat, lon: o.lon };
    o.populated = pop.map((p) => ({ name: p.name, point: p.point, pop: p.w, utciC: p.utci, level: p.level }));
    o.share = share;
    if (r.level == null) { o.level = null; o.score = null; const na = o.notAssessed[0]; o.why = pop.length ? 'not assessed: ' + (na ? na.point + (na.name ? ' ' + na.name : '') + ' point ' + String(na.why).replace(/^not assessed:\s*/, '') : 'no populated point assessed') : 'not assessed: no populated point held for this tehsil'; }
    else { o.level = r.level; o.score = null; o.levelBasis = 'level reached by at least ' + Math.round(share * 100) + ' % of the population of ' + pop.length + ' populated point' + (pop.length > 1 ? 's' : ''); }
    if (!o.notAssessed.length) delete o.notAssessed; delete o.pts; };
  /* v91.17.283.35 · item 5 · the tehsil's heat discomfort (DI) is that of its MAIN SETTLEMENT point state (the polygon centre when no
     settlement is known), from the one comfort function (comfort.mjs comfortDays): the place record of that point prints the same value */
  points.forEach((p, i) => { const u = U[p.uid]; if (!u) return; const rank = p.kind === 'main settlement' ? 2 : p.kind === 'centre' ? 1 : 0; if (!rank || (u.comfortRank || 0) >= rank) return;
    const s = states[i]; u.comfortRank = rank; u.comfortPoint = { kind: p.kind, name: p.name || null, lat: p.lat, lon: p.lon };
    u.comfort = {}; if (s && s.ok) for (const c of comfortDays(s, 3)) u.comfort[c.date] = { ...c, point: u.comfortPoint };
    else u.comfortWhy = 'data missing: the point state of the ' + p.kind + ' failed (' + String((s && s.why) || 'no answer').slice(0, 120) + ')';
    /* v283.40 · the heat-index band of the same point state (heatindex.mjs heatIndexDays; one value per tehsil and day); v283.40 merge: its own
       statement, so the comfort else above stays with the comfort if (the sci40 insertion had moved it onto the heat-index if) */
    u.heatIndex = {}; if (s && s.ok && o.heatBands) for (const c of heatIndexDays(s, o.heatBands, 3)) u.heatIndex[c.date] = { ...c, point: u.comfortPoint }; });
  for (const u of Object.values(U)) { delete u.comfortRank; for (const o of Object.values(u.days)) { fin(o, 'utciMaxC'); const hc = heatCellOf(o.utciMaxC); o.hottestScore = hc.score; }
    for (const o of Object.values(u.cold)) fin(o, 'utciMinC'); }
  return U;
}
/* the issued record's heat layer replaced by the area values (pure apart from the record it edits) */
export function applyTo(rec, U, meta = {}) {
  applyCold(rec, U); applyComfort(rec, U); applyHeatIndex(rec, U, meta.heatBands || null);
  if (!rec || !Array.isArray(rec.days) || !U) return { replaced: 0 };
  let replaced = 0; const lv = {};
  for (const d of rec.days) { const H = d.layers && d.layers.heat; if (!H || !H.L) continue; lv[d.date] = {};
    for (const uid of Object.keys(H.L)) { const a = U[uid] && U[uid].days[d.date];
      if (H.L[uid] === -2) continue;   /* not applicable here stays as the engine said */
      const src = (H.src = H.src || {});
      /* v91.17.283.35 · audit A5 · no point state: NOT ASSESSED, never the page engine's level (it used a second UTCI scale) */
      if (!a && /^area/.test(H.src && H.src[uid] || '')) continue;   /* a value the area pass already set on this held record stays */
      if (!a) { H.L[uid] = -1; if (H.S) delete H.S[uid]; (H.why = H.why || {})[uid] = NO_POINT_STATE; src[uid] = 'not assessed (no point state)'; replaced++; lv[d.date][uid] = -1; continue; }
      if (a.level == null) { H.L[uid] = -1; if (H.S) delete H.S[uid]; (H.why = H.why || {})[uid] = a.why || 'not assessed'; src[uid] = 'area (not assessed)'; replaced++; lv[d.date][uid] = -1; continue; }
      H.L[uid] = a.level; if (H.S) delete H.S[uid]; if (H.why) delete H.why[uid]; src[uid] = U[uid].carried ? 'area (previous pass, ' + U[uid].carried + ': this pass had no answer for the tehsil)' : meta.previous ? 'area (previous run, ' + meta.at + ')' : 'area'; replaced++; lv[d.date][uid] = a.level; (H.hottest = H.hottest || {})[uid] = a.extremePoint; }
    const counts = [0, 0, 0, 0, 0]; for (const v of Object.values(H.L)) if (v >= 0 && v <= 4) counts[v]++; H.counts = counts; H.areaBasis = 'tehsil heat = the level reached by at least the registered share of the population of its populated points (main settlement and towns, data/tehsil-popcells.json; the polygon centre is reported, not weighted), served forecast chain; the hottest point is served beside it'; }
  /* heat alert rows: a heat holder keeps its row only when the area level of its unit on that day still reaches the row's level */
  const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
  /* v91.17.283.23 · self-audit H5 / H10: the row's units by their unique keys (engine.mjs rowUnits); a district row is judged on the highest
     area level among its tehsils, not kept unchecked */
  const day = rec.alertsCtx && Number.isInteger(rec.alertsCtx.day) ? rec.alertsCtx.day : 0; const date = (rec.days.find((x) => x.day === day) || {}).date;
  let dropped = 0;
  for (const listName of ['alerts', 'alertsFull']) { const L = rec[listName]; if (!Array.isArray(L)) continue;
    rec[listName] = L.filter((r) => { const hz = Array.isArray(r.hazards) ? r.hazards : r.holders ? r.holders.map((h) => h.hazard) : [r.hazard];
      if (!hz.includes('heat') || hz.length > 1) return true;
      const us = rowUnits(rec, r).filter((u) => date && lv[date] && lv[date][u] !== undefined); if (!us.length) return true;
      const a = Math.max(...us.map((u) => lv[date][u]));
      const want = W.indexOf(String(r.band || '').replace(/^\w/, (c) => c.toUpperCase())); const keep = a >= 2 && (want < 0 || a === Math.min(want, 4));   /* v283.23 H5: the row's level must BE the issued area level (a row at Moderate where the area is High would understate it; High raises no alert) */
      if (!keep) dropped++; return keep; }); }
  rec.areaHeat = { applied: true, replaced, alertRowsDropped: dropped, run: meta.run || null, at: meta.at || null, points: meta.points || null,
    basis: 'tehsil heat = the level reached by at least the registered share of the population of its populated points (owner 2.2; an AGN rule, untested), served forecast chain; a level only from strong heat stress (UTCI 32 C); hottest point beside it' };
  return { replaced, dropped };
}

/* v91.17.283.35 · item 5 / audit A4, L9 · THE ISSUED COMFORT LAYER ('comfort'): Giles level of the day's highest hourly DI at the tehsil's
   main settlement (S = the DI rounded to 0.1 for display, V the same), never the page's seed or its own calculation */
export function applyComfort(rec, U) {
  let n = 0; if (!rec || !Array.isArray(rec.days)) return { replaced: 0 };
  for (const d of rec.days) { const H = d.layers && (d.layers.heat || Object.values(d.layers).find((x) => x && x.L)); if (!H) continue;
    const C = (d.layers.comfort = d.layers.comfort && d.layers.comfort.L ? d.layers.comfort : { L: {}, S: {} }); C.V = C.V || {}; C.facts = C.facts || {}; C.why = C.why || {};
    for (const uid of Object.keys(H.L)) { const u = U && U[uid], c = u && u.comfort ? u.comfort[d.date] : null;
      if (!c) { if (C.src && C.src[uid] === 'area' && !(U && U[uid])) continue;   /* a value of an earlier pass on this held record stays */
        C.L[uid] = -1; delete C.S[uid]; delete C.V[uid]; delete C.facts[uid]; C.why[uid] = (u && u.comfortWhy) || 'data missing: no point state of the served forecast chain holds this tehsil and day yet'; n++; continue; }
      if (!c.assessed) { C.L[uid] = -1; delete C.S[uid]; delete C.V[uid]; delete C.facts[uid]; C.why[uid] = c.why; n++; continue; }
      C.L[uid] = c.level; C.S[uid] = c.diMax; C.V[uid] = c.diMax; delete C.why[uid]; C.facts[uid] = { diMax: c.diMax, at: c.at, giles: c.giles, point: c.point ? c.point.kind + (c.point.name ? ' ' + c.point.name : '') : null };
      (C.src = C.src || {})[uid] = 'area'; n++; }
    const counts = [0, 0, 0, 0, 0]; let nd = 0; for (const v of Object.values(C.L)) { if (v >= 0 && v <= 4) counts[v]++; else nd++; } C.counts = counts; C.na = 0; C.nd = nd;
    C.name = COMFORT_NAME; C.basis = 'the day\'s highest hourly Thom discomfort index at the tehsil\'s main settlement, all 24 hours required; Giles et al. (1990) classes; ' + COMFORT_NOTE; }
  rec.areaComfort = { applied: true, replaced: n }; return { replaced: n };
}

/* v91.17.283.40 · THE ISSUED HEAT-INDEX LAYER ('heat_index'): the NWS band of the day at the tehsil's main settlement (heatindex.mjs
   heatIndexDays), its own scale (data/map-layer-scales.json heat_index words), lead days 1-3; a parameter, not a hazard (hazardlist.mjs
   PARAMETER_LAYERS), no alert. Hours at or above each band and their measured error ride as operator facts (engine.mjs OPERATOR_FACTS). */
export const HEAT_INDEX_NOT_TESTED = 'not tested: the heat-index band was tested at lead days 1-3 only';
export function applyHeatIndex(rec, U, B = null) {
  let n = 0; if (!rec || !Array.isArray(rec.days)) return { replaced: 0 };
  for (const d of rec.days) { const H = d.layers && (d.layers.heat || Object.values(d.layers).find((x) => x && x.L)); if (!H) continue;
    const X = (d.layers.heat_index = d.layers.heat_index && d.layers.heat_index.L ? d.layers.heat_index : { L: {}, S: {} }); X.V = X.V || {}; X.facts = X.facts || {}; X.why = X.why || {};
    const lead = Number.isInteger(d.day) ? d.day : null; const tested = !!(B && Array.isArray(B.servedLeads) && B.servedLeads.includes(lead));
    for (const uid of Object.keys(H.L)) { const u = U && U[uid], c = u && u.heatIndex ? u.heatIndex[d.date] : null;
      const clear = () => { delete X.S[uid]; delete X.V[uid]; delete X.facts[uid]; };
      if (!tested) { X.L[uid] = -5; clear(); X.why[uid] = HEAT_INDEX_NOT_TESTED + (B ? '' : ' (data/heat-index-bands.json not loaded)'); n++; continue; }
      if (!c) { if (X.src && X.src[uid] === 'area' && !(U && U[uid])) continue;
        X.L[uid] = -1; clear(); X.why[uid] = (u && u.comfortWhy) || 'data missing: no point state of the served forecast chain holds this tehsil and day yet'; n++; continue; }
      if (!c.assessed) { X.L[uid] = /^outside range/.test(c.why || '') ? -2 : c.notTested ? -5 : -1; clear(); X.why[uid] = c.why; n++; continue; }
      X.L[uid] = c.level; X.S[uid] = c.hiMaxC; X.V[uid] = c.hiMaxC; delete X.why[uid];
      X.facts[uid] = { heatIndexMaxC: c.hiMaxC, at: c.at, band: c.word, point: c.point ? c.point.kind + (c.point.name ? ' ' + c.point.name : '') : null,
        ...(c.extremeDangerNotTested ? { extremeDangerNotTested: 'at or above the NWS Extreme Danger onset (54.4 C), which is not tested: served as Danger or higher' } : {}),
        hoursAtOrAbove: c.hoursAtOrAbove, hoursErrorMAE: c.hoursErrorMAE };
      (X.src = X.src || {})[uid] = 'area'; n++; }
    const counts = [0, 0, 0]; let nd = 0; for (const v of Object.values(X.L)) { if (v >= 0 && v <= 2) counts[v]++; else nd++; } X.counts = counts; X.na = 0; X.nd = nd;
    X.name = (B && B.name) || 'Heat index band (NWS)'; X.ownScale = true; X.words = (B && B.levels) || null;
    X.basis = 'the band of the day\'s highest hourly NWS heat index at the tehsil\'s main settlement, all 24 hours required; ' + ((B && B.source) || 'NWS SR 90-23') + '; lead days 1-3 (tested); a parameter, no alert'; }
  rec.areaHeatIndex = { applied: true, replaced: n }; return { replaced: n };
}

/* v91.17.283.31 · owner 2.2 · the issued cold layer from the populated-area cold level (the register's UTCI cold levels, no gap) */
export function applyCold(rec, U) {
  let replaced = 0; if (!rec || !Array.isArray(rec.days) || !U) return { replaced };
  for (const d of rec.days) { const C = d.layers && d.layers.cold; if (!C || !C.L) continue; const src = (C.src = C.src || {});
    for (const uid of Object.keys(C.L)) { const a = U[uid] && U[uid].cold && U[uid].cold[d.date]; if (C.L[uid] === -2) continue;
      if (!a && /^area/.test(src[uid] || '')) continue;
      if (!a) { C.L[uid] = -1; if (C.S) delete C.S[uid]; (C.why = C.why || {})[uid] = NO_POINT_STATE; src[uid] = 'not assessed (no point state)'; replaced++; continue; }   /* v283.35 · A5 */
      if (a.level == null) { C.L[uid] = -1; if (C.S) delete C.S[uid]; (C.why = C.why || {})[uid] = a.why || 'not assessed'; src[uid] = 'area (not assessed)'; replaced++; continue; }
      C.L[uid] = a.level; if (C.S) delete C.S[uid]; if (C.why) delete C.why[uid]; src[uid] = 'area'; replaced++;
      (C.coldest = C.coldest || {})[uid] = a.extremePoint; }
    const counts = [0, 0, 0, 0, 0]; for (const v of Object.values(C.L)) if (v >= 0 && v <= 4) counts[v]++; C.counts = counts;
    C.areaBasis = 'tehsil cold = the level reached by at least the registered share of the population of its populated points (data/tehsil-popcells.json), UTCI cold levels of the thresholds register (utci.coldLevels); the coldest point is served beside it'; }
  rec.areaCold = { applied: true, replaced }; return { replaced };
}

export function createAreaHeat(app, { dataDir }) {
  const on = () => process.env.NIGRAAN_AREA_HEAT !== '0';
  let anchors = null; try { anchors = JSON.parse(readFileSync(join(dataDir, 'tehsil-anchor.json'), 'utf8')).units || {}; } catch (_) { anchors = {}; }
  let PC = null; try { PC = JSON.parse(readFileSync(join(dataDir, 'tehsil-popcells.json'), 'utf8')); } catch (_) { PC = null; }
  const P = pointsOf(anchors, PC && PC.units), SHARE = PC && PC.rule && isN(PC.rule.share) ? PC.rule.share : null;   /* v283.36 item 16: rule file missing -> no area level (fail closed) */
  const st = { busy: false, run: null, at: null, units: null, ms: null, ok: 0, failed: 0, lastError: null, previous: false, held: null };
  /* v91.17.283.41 (NIGRAAN 1.0.5) · item 23 · AFTER A RESTART THE LAST VALUES STAY: the last completed area pass is kept on disk
     (data/cache/areaheat-last.json: units, run, at) and read back at start, so the issued record keeps the previous run's area values (each
     cell's source names that run's time) until the new pass completes; before 1.0.5 every tehsil was "data missing (no point state)" for
     the 10-20 minutes of the first pass after each restart. A kept pass older than 30 h is not used (the days it holds have passed).
     NIGRAAN_AREA_HEAT_KEEP=0 = the 1.0.4 behaviour. */
  const KEEP = join(dataDir, 'cache', 'areaheat-last.json');
  if (process.env.NIGRAAN_AREA_HEAT_KEEP !== '0') { try { const k = JSON.parse(readFileSync(KEEP, 'utf8')); if (k && k.units && k.at && Date.now() - Date.parse(k.at) < 30 * 3600e3) { st.units = k.units; st.run = k.run || null; st.at = k.at; st.previous = true; if (k.held && Array.isArray(k.held.pts) && k.held.pts.every((q) => q && q.t0 && Array.isArray(q.v))) st.held = k.held; } } catch (_) {} }
  const keepSave = () => { if (process.env.NIGRAAN_AREA_HEAT_KEEP === '0') return; try { mkdirSync(join(dataDir, 'cache'), { recursive: true }); const t = KEEP + '.tmp'; writeFileSync(t, JSON.stringify({ run: st.run, at: st.at, units: st.units, held: st.held })); renameSync(t, KEEP); } catch (_) {} };
  async function refresh(force = false) {
    if (!on() || st.busy || !app.pointState) return { started: false };
    let run = null; try { run = app.pointState.status().run; } catch (_) {}
    /* once per model run, and not more often than every NIGRAAN_AREA_HEAT_MIN_H hours (default 3): about 900 points a pass, so the provider
       budget stays bounded when a run key changes hourly */
    const minMs = (Number(process.env.NIGRAAN_AREA_HEAT_MIN_H) > 0 ? Number(process.env.NIGRAAN_AREA_HEAT_MIN_H) : 3) * 3600e3;
    if (!force && st.units && !st.previous && (st.run === run || (st.at && Date.now() - Date.parse(st.at) < minMs))) return { started: false, same: st.run === run };
    st.busy = true; const t0 = Date.now();
    try {
      const states = [];
      for (let i = 0; i < P.length; i += 40) { const part = P.slice(i, i + 40);
        let r = []; try { r = await app.pointState.many(part, { tag: 'pointstate-area' }); } catch (e) { st.lastError = String(e && e.message || e).slice(0, 160); r = part.map(() => null); }
        states.push(...r); await new Promise((res) => setTimeout(res, 1000)); }
      /* v91.17.283.52 · N3 · the points whose state failed (provider time-out, no answer) are asked once more, after a pause */
      const failedIdx = states.map((s, i) => (s && s.ok ? -1 : i)).filter((i) => i >= 0); st.retried = failedIdx.length; st.recovered = 0;
      if (failedIdx.length && failedIdx.length < states.length) { await new Promise((res) => setTimeout(res, Number(process.env.NIGRAAN_AREA_HEAT_RETRY_S) >= 0 && process.env.NIGRAAN_AREA_HEAT_RETRY_S !== '' && process.env.NIGRAAN_AREA_HEAT_RETRY_S != null ? Number(process.env.NIGRAAN_AREA_HEAT_RETRY_S) * 1000 : 20000));
        for (let i = 0; i < failedIdx.length; i += 40) { const ix = failedIdx.slice(i, i + 40); let r = []; try { r = await app.pointState.many(ix.map((k) => P[k]), { tag: 'pointstate-area-retry' }); } catch (e) { r = ix.map(() => null); }
          ix.forEach((k, j) => { if (r[j] && r[j].ok) { states[k] = r[j]; st.recovered++; } }); await new Promise((res) => setTimeout(res, 1000)); } }
      st.ok = states.filter((s) => s && s.ok).length; st.failed = states.length - st.ok;
      if (st.ok) st.held = holdHours(P, states, run);   /* r42 · 1.0.6: the sweep's hourly temperatures, for the nearby list (no new call) */
      if (st.ok && SHARE == null) { st.lastError = 'not available: the population rule (data/tehsil-popcells.json rule.share) is not in this install'; }
      else if (st.ok) { const U1 = aggregate(P, states, { share: SHARE, heatBands: heatBands(dataDir) });
        /* v91.17.283.52 · N3 · a tehsil whose points ALL failed keeps the previous completed pass (under 6 h old), its source saying so */
        const prevU = st.units, prevAt = st.at; st.carried = 0;
        if (prevU && prevAt && Date.now() - Date.parse(prevAt) < 6 * 3600e3) { const anyOk = {}; P.forEach((p, i) => { if (states[i] && states[i].ok) anyOk[p.uid] = 1; });
          for (const uid of Object.keys(U1)) if (!anyOk[uid] && prevU[uid]) { U1[uid] = { ...prevU[uid], carried: prevU[uid].carried || prevAt }; st.carried++; } }
        st.units = U1; st.run = run; st.at = new Date().toISOString(); st.ms = Date.now() - t0; st.previous = false; keepSave();
        try { if (app.engine && app.engine.reapply) app.engine.reapply(); } catch (_) {} }
      return { started: true, ok: st.ok, failed: st.failed };
    } finally { st.busy = false; }
  }
  function apply(rec) { if (!on()) return { replaced: 0 }; return applyTo(rec, st.units || {}, { run: st.run, at: st.at, points: P.length, heatBands: heatBands(dataDir), previous: st.previous }); }   /* v283.35 · A5: before the first pass, a cell the pass never set is not assessed (never the engine's level) */
  function status() { return { on: on(), points: P.length, run: st.run, at: st.at, previousRunKept: st.previous, ms: st.ms, ok: st.ok, failed: st.failed, retried: st.retried || 0, recovered: st.recovered || 0, carried: st.carried || 0, busy: st.busy, units: st.units ? Object.keys(st.units).length : 0, lastError: st.lastError }; }
  function unit(uid) { return st.units ? st.units[uid] || null : null; }
  /* r42 · 1.0.6 · TEMPERATURE NOW NEARBY FROM THE TEHSIL SWEEP: the points of this pass (each tehsil's main settlement, its centre when
     more than 5 km away, its towns) within km of a place, each with the served hourly temperature of the pass's own point state at the
     present PKT hour. Read only: no provider request, no blend member, nothing computed (the pass runs once per model run as before). */
  function nearNow(lat, lon, radKm = 12, limit = 40) {
    const H = st.held; if (!H || !Array.isArray(H.pts)) return { ok: false, why: 'the tehsil sweep has not completed since the server started', places: [] };
    const hr = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 13);
    const out = []; for (const q of H.pts) { const d = km(lat, lon, q.lat, q.lon); if (!(d <= radKm)) continue; const k = Math.round((Date.parse(hr + ':00:00Z') - Date.parse(String(q.t0) + ':00:00Z')) / 3600e3), t = Array.isArray(q.v) && k >= 0 ? q.v[k] : null; if (!isN(t)) continue;
      out.push({ uid: q.uid, name: q.name, kind: q.kind, lat: q.lat, lon: q.lon, elevM: q.elevM, km: Math.round(d * 10) / 10, tempC: t, time: hr + ':00' }); }
    out.sort((a, b) => a.km - b.km);
    return { ok: true, run: H.run, at: H.at, hour: hr + ':00', radiusKm: radKm, places: out.slice(0, limit),
      source: 'the tehsil sweep of the run: each point the served forecast chain at its own height, read at the present hour (the same point states the area heat level uses)' };
  }
  /* r43 · 1.0.7 · THE MAP'S "°C air now" LABELS (owner 1 Nov: the classic Overview's temperature labels): every tehsil's main settlement of
     the same held pass, its served temperature at the present PKT hour (the value nearNow serves for the same point), with the population
     the pass weights it by, so the page keeps the largest place where labels would overlap. Read only: no provider request. */
  function labelsNow() {
    const H = st.held; if (!H || !Array.isArray(H.pts)) return { ok: false, why: 'the tehsil sweep has not completed since the server started', places: [] };
    const hr = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 13); const pop = new Map(); for (const p of P) pop.set(p.uid + '|' + p.lat + '|' + p.lon, Number(p.pop) || 0);
    const out = []; for (const q of H.pts) { if (q.kind !== 'main settlement') continue; const k = Math.round((Date.parse(hr + ':00:00Z') - Date.parse(String(q.t0) + ':00:00Z')) / 3600e3), t = Array.isArray(q.v) && k >= 0 ? q.v[k] : null; if (!isN(t)) continue;
      out.push({ uid: q.uid, name: q.name, lat: q.lat, lon: q.lon, tempC: t, pop: pop.get(q.uid + '|' + q.lat + '|' + q.lon) || 0, time: hr + ':00' }); }
    out.sort((a, b) => b.pop - a.pop);
    return { ok: true, run: H.run, at: H.at, hour: hr + ':00', places: out };
  }
  if (on() && process.env.NIGRAAN_ENGINE !== '0') schedule(app, 'area-heat',   /* no engine on this server: no issued record to apply it to */
     20 * 60e3, () => refresh(), { firstMs: 8 * 60e3, heavy: 'bulk', label: 'area heat from the point states' });
  return { refresh, apply, status, unit, nearNow, labelsNow, points: () => P.slice() };
}
