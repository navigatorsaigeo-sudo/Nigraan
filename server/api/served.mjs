/* ══ v91.17.283 · WS4 · THE SERVED LEVELS, ONE FUNCTION ════════════════════════════════════════════════════════════════════════════
   What a client sees for a tehsil's hazard levels: the server engine's record (engine.unit, the same record /api/levels/unit serves)
   with the model gate's client rules applied (data/model-gate.resolved.json, scripts/gen/gen_gate.py):
     - owner decision B: the local-rain (pluvial) flood level is hidden from client screens until event-tested; the client "Flood" level
       is the river-flooding level (client_rules.substitute), product type Indicative;
     - owner decision A: heat High / Severe and every cold level are Indicative and raise no alert (per-level rules derived from the
       evidence files); an engine alert on such a level is withheld, with the reason;
     - every level carries its product type; a missing level is "Not assessed" with its reason, never Normal or 0 (D12: engine code -2
       is "Not assessed (outside method range)", not "does not occur").
   The AI analyst, the report and (requested of the route owners) GET /api/levels/unit, /api/levels and /api/alerts read this function,
   so the console, the start page, the AI and a report quote the same words. The operator view (operator = true) keeps every layer and
   the engine's own alert list, annotated the same way. */
import { evidenceDomain, inDomain } from './evdomain.mjs';   /* v91.17.283.8 · audit 9 */
import { skillEvidence } from './evidence.mjs';
import { rainClassMm } from './rainprob.mjs';   /* v91.17.283.27 · item 3 */
import { STATE_CODES, STATE_TEXT, STATE_LABEL } from './states.mjs';
import { hazardListOf } from './hazardlist.mjs';
import { airOfUnit, summaryOf } from './placesummary.mjs';   /* v283.49 · 1.0.10 item 1: air quality in the place summary */   /* v283.35 · A3: the served unit carries the one hazard list */   /* v283.31 · 4.3 the map states; v283.35: one home (states.mjs) */
const WORDS_DEFAULT = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

/* v91.17.283.2 · every drought row the server returns is labelled observed: the level is computed from the observed index, not forecast */
export const DROUGHT_OBSERVED = Object.freeze({ observed: true, basis: 'observed', observedBasis: 'observed: computed from the observed drought index (rain SPI / SPEI over the last 30-90 days, with the soil and vegetation readings), not a forecast' });
export const droughtObserved = (row) => (row && (row.hazard === 'drought' || row.layer === 'drought')) ? { ...row, ...DROUGHT_OBSERVED } : row;
export const NOT_ASSESSED = {
  /* v91.17.283.35 · the generic reason of each code from the one home of the map states (states.mjs) */
  '-1': STATE_TEXT['-1'], '-2': STATE_TEXT['-2'], '-3': STATE_TEXT['-3'], '-4': STATE_TEXT['-4'], '-5': STATE_TEXT['-5'], '-6': STATE_TEXT['-6'],
  notIssued: 'not issued for this day',
  /* v91.17.283.8 · audit 2 · the gate is missing or unreadable: no client level is served (fail closed) */
  gate: 'model gate unavailable: the model gate could not be read on this server, so the client rules (hidden layers, substitutes, product types, alert permissions) cannot be applied',
  noReachScored: 'no modelled river reach scored here: this tehsil has no river reach in the river-flow model, or its reach returned no flow in this run (other tehsils were scored)',
};

/* v91.17.283.8 · the row's level word from its class rank (the one hazard scale: 1 Low, 2 Moderate, 3 High, 4 Severe) or its band on the
   operational ladder; sev (2-5) is a display severity, not an index into the level words (sev 4 is High, not Severe) */
export const alertLevelWord = (a, W = ['Normal', 'Low', 'Moderate', 'High', 'Severe']) => { const LAD = { Act: 'Severe', Watch: 'High', Monitor: 'Moderate', Low: 'Low' };
  if (!a) return null; const r = Number(a.classRank); if (Number.isInteger(r) && r >= 1 && r <= 4) return W[r] || null; if (a.band && LAD[a.band]) return LAD[a.band]; return W.includes(a.band) ? a.band : null; };

function gateFull(app) { try { const G = app.gate && app.gate.full ? app.gate.full() : null; return G && G.ready ? G : null; } catch (_) { return null; } }
function entryOf(app, layer) { try { return app.gate && app.gate.entryOf ? app.gate.entryOf(layer) : null; } catch (_) { return null; } }

/* the gate's verdict on one layer at one level word: product type, whether it may alert, and why.
   v91.17.283.8 · audit 9 · ctx = { day, uid | province }: a level whose alert permission rests on evidence (not an owner decision) keeps it
   only inside the domain the evidence tested (evdomain.mjs: the forecast days and region of data/skill-evidence.json); elsewhere it is
   Indicative with the reason "outside the tested domain" and raises no alert. Without ctx the domain cannot be confirmed (fail closed). */
export function levelTag(app, layer, word, ctx = null) {
  const e = entryOf(app, layer);
  if (!e) return { productType: null, canAlert: false, model: null, why: 'no gate entry for this layer' };
  const r = e.resolved || {}, L = r.levels && word ? r.levels[word] : null;
  if (L && L.canAlert && !L.ownerDecision) { const dom = domainOf(app, layer);
    if (dom) { const d = inDomain(dom, ctx); if (!d.ok) return { productType: 'Indicative', canAlert: false, model: e.id, why: d.why, outsideTestedDomain: true, testedDomain: dom.ready ? { days: dom.leads, region: dom.region } : null }; } }
  if (L) return { productType: L.productType, canAlert: !!L.canAlert, model: e.id, why: L.why || null };
  /* v91.17.283.23 · audit 16 · the product type of the layer from the gate's ONE label function (gate.mjs tagOf -> ptOf: the thresholds
     register's label where it names the entry, e.g. "Chance of rain (screening)"), never the raw entry field beside it */
  let pt = null; try { pt = app.gate && app.gate.tagOf ? app.gate.tagOf(layer).productType : null; } catch (_) { pt = null; }
  return { productType: pt || e.product_type || null, canAlert: !!r.canAlert && !(word === 'Normal' || word === 'Low'), model: e.id, why: null };
}

function domainOf(app, layer) { try { return evidenceDomain(app.dataDir || (app.store && app.store.dataDir), layer); } catch (_) { return { ready: false, why: 'the evidence could not be read' }; } }

/* v91.17.283.8 · audit 2 · FAIL CLOSED: a missing or unreadable gate (or one without client_rules) gives ready:false, and every client
   consumer serves "not assessed (model gate unavailable)" in place of the raw layer; nothing is hidden or substituted by guess, and no raw
   layer (local-rain flooding, the combined flood level) reaches a client. The operator view keeps the engine record. */
export function clientRules(app) { const G = gateFull(app); if (G && G.client_rules && typeof G.client_rules === 'object') return { ready: true, ...G.client_rules };
  return { ready: false, failClosed: true, why: NOT_ASSESSED.gate, hidden_layers: {}, substitute: {} }; }
export const gateUnavailableLayer = (name) => ({ name, level: -1, word: 'Not assessed', assessed: false, productType: null, canAlert: false, gateUnavailable: true, notAssessedWhy: NOT_ASSESSED.gate });

/* one tehsil, every layer and day, as served */
export function servedUnit(app, uid, operator = false) {
  const r = app.engine && app.engine.unit ? app.engine.unit(uid, !!operator) : { ready: false, why: 'the hazard engine is not loaded on this server' };
  if (!r || !r.ready) return r;
  const R = clientRules(app), W = (r.words && r.words.length ? r.words : WORDS_DEFAULT);
  if (!operator && !R.ready) {   /* v91.17.283.8 · audit 2: every layer not assessed, every alert withheld, with the reason */
    const { alerts, alertsGateDropped, ...rest } = r;
    return { ...rest, gateUnavailable: true, why: NOT_ASSESSED.gate, servedBy: 'served.mjs (model gate unavailable: fail closed)', hidden: [],
      days: r.days.map((d) => ({ ...d, layers: Object.fromEntries(Object.entries(d.layers).filter(([k]) => k !== 'flood_pluvial').map(([k, v]) => [k, gateUnavailableLayer(v.name || k)])) })),
      alerts: [], ...((alerts || []).length ? { alertsWithheld: alerts.map((a) => ({ hazard: a.hazard, name: a.name, why: NOT_ASSESSED.gate })) } : {}) }; }
  const hidden = operator ? {} : (R.hidden_layers || {}), sub = operator ? {} : (R.substitute || {});
  const out = { ...r, days: [], hidden: Object.entries(hidden).map(([layer, why]) => ({ layer, why })), servedBy: 'served.mjs (gate ' + ((gateFull(app) || {}).version || '?') + ')' };
  for (const d of r.days) {
    const L = {};
    for (const [k, v] of Object.entries(d.layers)) {
      if (k in hidden) continue;
      L[k] = annotate(app, k, { ...v }, W, null, { day: d.day, uid: r.unit });
    }
    for (const [k, s] of Object.entries(sub)) {
      if (!(k in d.layers) && !(s.from in d.layers)) continue;
      const src = d.layers[s.from];
      L[k] = src ? annotate(app, k, { ...src, name: (d.layers[k] && d.layers[k].name) || src.name, basis: s.note, from: s.from }, W, null, { day: d.day, uid: r.unit })
        : annotate(app, k, { name: (d.layers[k] && d.layers[k].name) || k, level: -1, word: 'no data', basis: s.note, from: s.from }, W, 'the river-flooding level is not issued for this day', { day: d.day, uid: r.unit });
    }
    out.days.push({ ...d, layers: L });
  }
  /* alerts: an alert on a level that may not alert is withheld (the operator list keeps it, flagged) */
  const keep = [], withheld = [];
  for (const a of r.alerts || []) {
    const hz = a.hazard || null; const lvl = alertLevelWord(a, W);
    const t = hz ? levelTag(app, hz, lvl, { day: a.day != null ? a.day : (r.alertsDay != null ? r.alertsDay : 0), uid: r.unit }) : null;
    const hiddenHz = hz && hz in hidden; const ownerNo = (hz && NO_CLIENT_ALERT[hz]) || riverAlertWhy(app, a, r.unit, a.day != null ? a.day : r.alertsDay);   /* v91.17.283.10 owner decision; v283.36 item 21 river official only */
    if (hiddenHz || ownerNo || (t && t.model && !t.canAlert)) withheld.push({ ...a, withheldWhy: hiddenHz ? hidden[hz] : ownerNo ? ownerNo : (t.why || (t.productType || 'this level') + ': display only, raises no alerts') });
    else keep.push(a);
  }
  out.alerts = (operator ? (r.alerts || []).map((a) => withheld.find((w) => w === a || (w.name === a.name && w.hazard === a.hazard)) ? { ...a, clientWithheld: true } : a) : keep).map(droughtObserved);
  /* v91.17.283 · INTEG · rows the engine's own re-gate already left out (engine.mjs alertGate: heat High / Severe, cold) are listed too */
  const gd = (r.alertsGateDropped || []).map((w) => ({ hazard: w.hazard, name: w.name, why: w.why }));
  if (withheld.length || gd.length) out.alertsWithheld = withheld.map((w) => ({ hazard: w.hazard, name: w.name, why: w.withheldWhy })).concat(gd);
  delete out.alertsGateDropped;
  try { out.hazardList = hazardListOf(out); } catch (_) { out.hazardList = { ready: false, hazards: [], conditions: [], notAssessed: [], standing: [], none: null }; }
  /* v91.17.283.49 · 1.0.10 item 1 · the place summary (placesummary.mjs): the hazard list plus the served air quality of the same days */
  try { const d0 = out.days && out.days[0] && out.days[0].date; const air = airOfUnit(app, uid, d0 || null); out.hazardList.air = air; out.hazardList.summary = summaryOf(out.hazardList, air); out.summary = out.hazardList.summary; } catch (_) {}
  return out;
}

/* v91.17.283.24 · integration item 4 · THE ONE HOME of a served level label that differs from the level word: a heavy-rain cell levelled by
   method d (hazsci.mjs detCell: the tested >= 15.6 mm chance) at Low is said "Low or heavier" (its facts.levelLabel; the heavier classes are
   not tested). The unit answer (annotate: levelLabel) and the national answer (engine.mjs levels: labels { uid: label }) both read it here. */
export function levelLabelOf(layer, level, facts) {
  return layer === 'rain_hz' && (level === 1 || level === 2) && facts && (facts.method === 'd' || facts.method === 'd-z') && facts.tested === true && typeof facts.levelLabel === 'string' && facts.levelLabel ? facts.levelLabel : null;   /* v283.31 · zone cells: Moderate or heavier (plains 64.5) */
}
function annotate(app, layer, v, W, whyOverride, ctx = null) {
  const t = levelTag(app, layer, v.level >= 0 ? (W[v.level] || null) : null, ctx);
  v.productType = t.productType;
  if (t.outsideTestedDomain) { v.outsideTestedDomain = true; v.productTypeWhy = t.why; }
  /* v91.17.283.8 · science audit · one wording on every surface: cold has no event test yet; GLOF is a susceptibility, not a day forecast;
     the river flood rungs above Moderate (the 20-year flow and Severe) have no day in the bulletin record they were tested on */
  if (layer === 'cold' && v.level >= 0) { v.testStatus = COLD_TEST; v.testWhy = coldWhy(app); }
  if (layer === 'glof') v.basisNote = GLOF_BASIS;
  /* v283.36 · launch item 23 · Low stays "Low heat stress" WITH its UTCI value: the area value of the issued cell (the hottest / coldest
     assessed point of the tehsil, areaheat.mjs) travels with the served level, so every list prints the same number */
  if ((layer === 'heat' || layer === 'cold') && v.level >= 0 && ctx && ctx.uid && v.value == null) { try { const L = app.engine && app.engine.latest ? app.engine.latest() : null; const dd = L && L.days ? L.days.find((x) => x.day === ctx.day) : null;
    const X = dd && dd.layers && dd.layers[layer]; const e = X && (layer === 'heat' ? X.hottest : X.coldest); const p = e && e[ctx.uid]; if (p && Number.isFinite(p.utciC)) { v.value = p.utciC; v.unit = '°C'; v.valueBasis = 'UTCI in shade at ' + (p.point || 'the main settlement') + (p.at ? ', ' + p.at + ' PKT' : ''); } } catch (_) {} }
  if (UNTESTED_LAYERS.includes(layer) && v.level >= 0) { v.testStatus = UNTESTED_LABEL; t.canAlert = false; }   /* v283.35 · C items */
  if ((layer === 'flood' || layer === 'flood_riverine') && v.level >= 3 && !(v.facts && /^(measured flow class|gauge outlook class)/.test(String(v.facts.reachBasis || '')))) { v.testStatus = 'untested'; v.testWhy = riverRungWhy(app); }   /* v283.23 H19: a measured gauge class is not a model rung */
  if (layer === 'drought' || /^drought_/.test(layer)) { Object.assign(v, DROUGHT_OBSERVED); v.basisNote = DROUGHT_SCREEN; }   /* v91.17.283.2; v91.17.283.10 DRYSPONGE; v283.15 the type views */
  /* v91.17.283.15 · item 9 · a calibrated rain day: the probability is shown as a screening fact; the level may alert only where the
     coefficient file marks its class tested (data/rain-prob-coefs.json gate; none is today) */
  if (layer === 'rain_hz' && v.facts && v.facts.calibrated) { v.fact = v.facts.text || null;
    /* v91.17.283.24 · heavy-rain method d (hazsci.mjs detCell): Normal and Low rest on the tested >= 15.6 mm class; Low is said "Low or
       heavier" (the heavier classes are not tested); it never alerts (the gate entry rain-classes stays experimental) */
    if ((v.facts.method === 'd' || v.facts.method === 'd-z') && v.facts.tested && v.level >= 0 && v.level <= 2) { t.canAlert = false; const lb = levelLabelOf(layer, v.level, v.facts); if (lb) v.levelLabel = lb; if (v.facts.lowSkill) { v.lowSkill = true; v.skill = v.facts.skill64 || v.facts.skill || null; } }   /* v283.31 · zone cells: a low-skill warning, never an alert */
    else { const k = rainClassMm().map(String)[v.level - 1];   /* v91.17.283.27 · item 3: the classes from their one home (hazard-scale.json rainClasses24h) */
      if (!(k && v.facts.status && v.facts.status[k] === 'tested')) { v.productType = 'Screening index'; t.canAlert = false; } } }
  if (/^nss_(baseline|dynamic|runoff)$/.test(layer)) { v.basisNote = SPONGE_BASIS; v.testStatus = SPONGE_TEST; }   /* v91.17.283.10 · DRYSPONGE S1; v283.15 the day views: screening, never an alert */
  if (v.level >= 0) { v.canAlert = t.canAlert; v.assessed = true; v.state = 'value'; }
  else {
    v.assessed = false; v.state = STATE_CODES[String(v.level)] || 'missing'; v.stateLabel = STATE_LABEL[v.state];   /* v283.31 · 4.3; v283.35 the state's label */
    /* v91.17.283.23 · audit 15 · the cell's own reason (hazsci.mjs: outside the validated height, screening only, linked reach without a
       score, ...) is kept; the generic sentence is used only when the engine gave none */
    v.notAssessedWhy = whyOverride || (typeof v.why === 'string' && v.why ? v.why : null)
      || (v.noRiverReach ? NOT_ASSESSED['-3'] : v.noRiverReachScored ? NOT_ASSESSED.noReachScored : NOT_ASSESSED[String(v.level)] || NOT_ASSESSED['-1']);
    v.word = 'Not assessed';   /* D12: never "does not occur" / "not applicable"; v283 INTEG: one word for every negative code, the same
       word the AI quotes (permanent L3); the reason is notAssessedWhy ("outside the method's range", "no data", ...) */
  }
  return v;
}

export const COLD_TEST = 'no event test yet';
/* v91.17.283.10 · DRYSPONGE (data/evidence/drysponge/, rules written before the tests): the drought level ranks rain-fed wheat-loss seasons
   and documented droughts above chance but reached a drought level in only about 1 in 4 months of documented droughts: a screening
   index, and Low does not rule drought out. The curve-number sponge added no skill beyond rain on mapped non-riverine floods in 2 of 3
   years: the static view is a screening index of soil and land cover, never a runoff forecast (the day views are client-hidden). */
export const DROUGHT_SCREEN = 'observed rain and soil; a Low level does not rule out drought';
/* v91.17.283.23 · self-audit D4 · the report's drought sentence lives here too (one home for the drought screening wording) */
export const DROUGHT_SCREEN_NOTE = 'a monthly screening of observed rain and soil, not a forecast and not an alert: it caught about 1 in 4 months of documented droughts at Monitor or above, so a Low level does not rule out drought';
/* v91.17.283.10 · OWNER DECISION 23 Oct 2026 02:37 PKT: drought is a monthly screening section of the client report and never raises a
   client alert (no short-range drought alert, no escalation clock), whatever the gate entry says. Operators keep the row, flagged. */
export const NO_CLIENT_ALERT = Object.freeze({ drought: 'owner decision (23 Oct 2026): drought is a monthly screening section of the report, never a client alert',
  /* v91.17.283.35 · audit C1 / C3 / C4 · levels from untested house or expert thresholds raise no client alert */
  wind: 'not tested \u2014 no wind level in this release: the gust is shown in km/h',
  glof: 'site context, never an alert: glacial-lake susceptibility upstream (no outburst trigger has passed its test)',   /* v91.17.283.47 item 1 */
  landslide: 'indicative \u2014 thresholds not tested: the odds bands are relative to an ordinary day and the model was trained on a different rain basis than it is served on' });
/* v91.17.283.35 · the client label of a level whose thresholds are untested (C items): said on every surface beside the level */
export const UNTESTED_LABEL = 'indicative \u2014 thresholds not tested';
/* v283.36 · launch item 21 · a river alert comes from an official gauge class only (measured, the sheet, or the official gauge outlook);
   a level from the model-flow ladder is shown, never alerted (the 30 / 48 / 82 alert cuts are removed) */
export const RIVER_ALERT_WHY = 'river alerts come from official gauge classes only: this level is from the model-flow ladder';
export function riverAlertWhy(app, a, uid0, day0) {
  const hz = a && a.hazard; if (hz !== 'flood' && hz !== 'flood_riverine') return null;
  try { const L = app.engine && app.engine.latest ? app.engine.latest() : null; const uid = uid0 || a.uid || a.unitId; const day = a.day != null ? a.day : day0 != null ? day0 : 0;
    const d = L && L.days ? L.days.find((x) => x.day === day) || L.days[0] : null; const X = d && d.layers ? d.layers.flood_riverine || d.layers.flood : null;
    const f = X && X.facts && uid ? X.facts[uid] : null; return f && f.official === true ? null : RIVER_ALERT_WHY; } catch (_) { return RIVER_ALERT_WHY; } }
export const UNTESTED_LAYERS = Object.freeze(['wind', 'glof', 'landslide', 'aqi']);
export const SPONGE_BASIS = 'soil and land cover';
export const SPONGE_TEST = 'not a tested runoff forecast';
/* the evidence behind these words ships with the server (the release packer ships the data files the code names) */
export const DRYSPONGE_EVIDENCE = Object.freeze(['data/drought-test-drysponge.json', 'data/sponge-cn-test-drysponge.json', 'data/evidence/drysponge/RULES.md']);
export const GLOF_BASIS = 'susceptibility, not a day forecast';
function coldWhy(app) { try { const L = evidenceLinesOf(app, 'cold'); return L[0] || 'no cold-stress day has been observed in a test window yet, so the level could not be tested against events'; } catch (_) { return null; } }
function riverRungWhy(app) { try { const e = app.gate && app.gate.byId ? app.gate.byId('river-ladder') : null; const t = e && (e.client_limitations || e.known_limitations || []).find((x) => /untested/i.test(String(x))); return t || 'this river flow rung has not been tested against recorded flood days'; } catch (_) { return null; } }
function evidenceLinesOf(app, k) { const E = skillEvidence(app.dataDir || (app.store && app.store.dataDir)); return E && E.ready && E.lines && Array.isArray(E.lines[k]) ? E.lines[k] : []; }

/* the client words for one layer on one day, for prose (AI, report): "High (Indicative)", "Not assessed: <why>" */
export function levelPhrase(v) {
  if (!v) return 'Not assessed: ' + NOT_ASSESSED.notIssued;
  if (v.assessed === false) return 'Not assessed: ' + v.notAssessedWhy;
  return (v.levelLabel || v.word) + (v.productType ? ' (' + v.productType.toLowerCase() + (v.canAlert === false && v.level >= 2 ? ', raises no alert' : '') + (v.outsideTestedDomain ? ', outside the tested domain' : '') + (v.testStatus ? ', ' + v.testStatus : '') + (v.basisNote ? ', ' + v.basisNote : '') + ')' : '');
}

/* national counts for one layer and day, as served: the same client rules (hidden layer -> not served; substitute -> the source layer's
   levels), engine code -1 / -2 counted as "not assessed" with their reasons, never as Normal */
export function servedNational(app, layer, day = 0, operator = false) {
  const R = clientRules(app);
  if (!operator && !R.ready) return { ready: false, gateUnavailable: true, layer, why: NOT_ASSESSED.gate };   /* v91.17.283.8 · audit 2 */
  if (!operator && R.hidden_layers && layer in R.hidden_layers) return { ready: false, hidden: true, why: R.hidden_layers[layer] };
  const sub = !operator && R.substitute && R.substitute[layer];
  const src = sub ? sub.from : layer;
  const L = app.engine && app.engine.levels ? app.engine.levels(src, day, operator) : { ready: false, why: 'the hazard engine is not loaded on this server' };
  if (!L || !L.ready) return { ready: false, why: (L && L.why) || 'no served levels' };
  const latest = app.engine.latest ? app.engine.latest() : null; const keys = (latest && latest.unitKeys) || {};
  /* v91.17.283.23 · self-audit H8 · a layer with its own scale (the retention classes: 0 sealed .. 4 absorbs like woodland; the drought type
     views) is counted in its own words, never as hazard levels (woodland was counted as "Severe") */
  let LW = null; try { LW = app.engine.layerWords ? app.engine.layerWords(src) : null; } catch (_) { LW = null; }
  const W = LW && LW.length ? LW : L.words && L.words.length ? L.words : WORDS_DEFAULT;
  const counts = Object.fromEntries(W.map((w) => [w, 0])); let noData = 0, outside = 0, noReach = 0, noReachScored = 0, cannot = 0, notTested = 0, notCurrent = 0; const rows = [];
  /* v91.17.283.8 · audit 10 · river flooding: -3 (no modelled river reach) and a -1 where the layer scored other tehsils (no reach scored here,
     engine.mjs riverNoReach) are counted apart from "no data", with the same reasons the unit answer gives */
  const river = src === 'flood_riverine', scoredElsewhere = river && Array.isArray(L.counts) && L.counts.some((c) => c > 0);
  for (const [uid, lv] of Object.entries(L.levels || {})) {
    if (lv >= 0) { counts[W[lv]] = (counts[W[lv]] || 0) + 1; rows.push({ unit: uid, key: keys[uid] || uid, level: W[lv], i: lv }); }
    else if (lv === -2) outside++; else if (lv === -3) noReach++; else if (lv === -4) cannot++; else if (lv === -5) notTested++; else if (lv === -6) notCurrent++; else if (lv === -1 && scoredElsewhere) noReachScored++; else noData++;   /* v283.31 · 4.3 */
  }
  return { ready: true, layer, from: sub ? src : undefined, basis: sub ? sub.note : layer === 'drought' ? 'observed' : undefined, ...(layer === 'drought' ? { observed: true, observedBasis: DROUGHT_OBSERVED.observedBasis } : {}), day: L.day, date: L.date, at: L.at, stale: L.stale,
    productType: levelTag(app, layer, null).productType, counts, rows, ...(LW ? { ownScale: true, words: W } : {}),
    notAssessed: { noData: { tehsils: noData, why: NOT_ASSESSED['-1'] }, outsideMethodRange: { tehsils: outside, why: NOT_ASSESSED['-2'] }, ...(cannot ? { cannotHappen: { tehsils: cannot, why: NOT_ASSESSED['-4'] } } : {}), ...(notTested ? { notTested: { tehsils: notTested, why: NOT_ASSESSED['-5'] } } : {}), ...(notCurrent ? { inputNotCurrent: { tehsils: notCurrent, why: NOT_ASSESSED['-6'] } } : {}),
      ...(river ? { noRiverReach: { tehsils: noReach, why: NOT_ASSESSED['-3'] }, noRiverReachScored: { tehsils: noReachScored, why: NOT_ASSESSED.noReachScored } } : {}) },
    ...(!operator ? { productTypeNote: (() => { const d = domainOf(app, layer); return d && d.ready ? 'levels whose alert permission rests on a test are Indicative outside the tested domain (forecast day ' + d.leads.join(' and ') + ', ' + d.region + ')' : undefined; })() } : {}),
    levelRules: (() => { const e = entryOf(app, layer); return e && e.resolved && e.resolved.levels ? Object.fromEntries(Object.entries(e.resolved.levels).map(([k, v]) => [k, { productType: v.productType, canAlert: v.canAlert }])) : undefined; })() };
}

/* == v91.17.283.28 · S6 · ONE RIVER-FLOOD STATUS RULE; v91.17.283.35 · audit A2: IT IS THE ISSUED CELL =================================
   The river status of a place is the served river-flooding cell of its tehsil (hazsci.mjs riverCell: the official class of the gauged reach
   from the river gauge sheet, the gauge outlook or the model-flow ladder, unreduced; off the floodplain -> cannot happen here; no gauged
   reach -> not assessed). Until v283.34 this function re-derived the level from the sheet without the floodplain rule, so the map and the
   place card differed; now it only reads the issued cell, so the place record, the site levels, the report and Customize print the map's
   value and reason. */
export const NO_GAUGED_REACH = 'not assessed: no gauged reach (no river gauge reach links to this tehsil, so river flooding is not scored here)';
export function riverStatus(app, uid) {
  const rule = 'the issued river-flooding cell of the tehsil (hazsci.mjs riverCell): official gauge class (sheet, outlook) else model-flow ladder, unreduced; off the floodplain: cannot happen here; the floodplain share is a fact';
  if (!uid) return { assessed: false, why: 'not assessed: the point lies in no tehsil', rule };
  let link = null; try { link = app.hazSci && app.hazSci.riverLink ? app.hazSci.riverLink(uid) : null; } catch (_) { link = null; }
  const reaches = link && link.ready ? Object.entries(link.reaches || {}).map(([id, r]) => ({ id, river: r.river || null, insideKm: r.reachInsideKmApprox ?? null })) : [];
  const S = servedUnit(app, uid, false); if (!S || !S.ready) return { assessed: false, reaches, why: 'not assessed: ' + ((S && S.why) || 'no issued levels'), rule };
  const days = (S.days || []).map((d) => { const v = d.layers && (d.layers.flood_riverine || null); if (!v) return { date: d.date, day: d.day, assessed: false, why: 'not assessed: the river-flooding level is not issued for this day' };
    const f = v.facts || {};
    return v.assessed ? { date: d.date, day: d.day, assessed: true, level: v.level, word: v.word, ...(f.reachBasis ? { rarity: f.reachBasis } : {}), ...(f.measured ? { measured: f.measured } : {}), ...(v.testStatus ? { testStatus: v.testStatus } : {}), ...(f.floodplainText ? { floodplain: f.floodplainText } : {}) }
      : { date: d.date, day: d.day, assessed: false, state: v.state, why: v.notAssessedWhy || 'not assessed' }; });
  const off = days.some((d) => d.state === 'not_applicable');
  const first = days.find((d) => !d.assessed && d.why);
  return { assessed: days.some((d) => d.assessed), reaches, offFloodplain: off, ...(!days.some((d) => d.assessed) && first ? { why: first.why } : {}), ...(reaches.length ? {} : { noGaugedReach: true }), days, rule,
    ...(link && link.ready && link.floodplainShare != null ? { floodplainShare: link.floodplainShare } : {}) };
}

/* == v91.17.283.35 · owner order "one server value per quantity" · THE TEHSIL LEVELS EVERY SURFACE CARRIES ===========================
   The served tehsil levels (servedUnit: the map's values) in a compact form, for the surfaces that also show values at the site's own
   point (place record, scenario baseline, Customize): one tehsil value per layer and day, with its state and reason, so a page never
   shows a tehsil level of its own making beside the map's. */
export function tehsilLevelsOf(app, uid) {
  if (!uid) return { ready: false, why: 'the point lies in no tehsil' };
  let S = null; try { S = servedUnit(app, uid, false); } catch (_) { S = null; }
  if (!S || !S.ready) return { ready: false, why: (S && S.why) || 'the issued levels of this tehsil are not loaded' };
  const layers = {};
  for (const d of S.days || []) for (const [k, v] of Object.entries(d.layers || {})) (layers[k] = layers[k] || []).push({ date: d.date, day: d.day, level: v.assessed === false ? null : v.level, word: v.assessed === false ? 'Not assessed' : v.word, state: v.assessed === false ? v.state : 'value', ...(v.assessed === false ? { why: v.notAssessedWhy } : {}), ...(v.levelLabel ? { levelLabel: v.levelLabel } : {}) });
  return { ready: true, unit: S.unit, issueId: S.issueId || null, at: S.at || null, scope: 'tehsil (the map’s values)', layers, hazardList: S.hazardList || null };
}
