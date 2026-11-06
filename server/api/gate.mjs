/* v91.17.103 · the model gate on the server: data/model-gate.resolved.json (scripts/gen/gen_gate.py) and data/rule-ledger.json.
   publicSummary() carries no sources, methods or skill figures (supplier names and held-out skill stay operator-only). */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { customerScrub } from './customerscrub.mjs';

/* v91.17.268 · interface 2 · the gate status a CLIENT report may print (GET /api/report/gate-status): entry names and known limitations
   with supplier names replaced by role words (customerscrub.mjs). No skill score reaches a client (build rule): a parenthesis that
   carries a score, a signed bias in °C, a file, an audit or a held-out figure is cut out, and a limitation that still names a score, an
   internal file, an audit or a build number after that is left out whole. Nothing is reworded or added. */
const METRIC = /\b(?:MAE|RMSE|FAR|POD|CSI|HSS|ETS|Brier|BSS|AUC|ROC|CRPS|bias|hit rate|false[- ]alarm rate|detection rate)\b/i;
const INTERNAL = /\baudit\w*|\bv\d{2,}\b|\.(?:py|md|json|csv|parquet)\b|station-lake|\bv?91\.17\.\d+|\bleakage\b|model register|held-out|fails its gate/i;
const BIAS_C = /[+\-\u2212]\d+(?:\.\d+)?\s*\u00b0?\s*C\b/;
const NAMES = /(?<![\w-])(?:PMD|FFD)(?![\w-])|Pakistan Meteorological|Flood Forecasting Division/i;
/* v91.17.279 · CLAIMS279 S-03/P1 · a limitation is never dropped for a client. The gate entry's client_limitations (plain words, one per known
   limitation, written by hand and checked one for one by gen_gate.py) is used where it exists; otherwise the operator text is cut of its
   score parentheses as before, and a sentence that still carries a score word is kept (not dropped) - the build test fails on it. */
export function clientLimitations(list, plain) {
  const out = [];
  const L = Array.isArray(list) ? list : [], C = Array.isArray(plain) && plain.length === L.length ? plain : null;
  for (let i = 0; i < L.length; i++) { const raw = C && typeof C[i] === 'string' && C[i].trim() ? C[i] : L[i];
    if (typeof raw !== 'string') continue;
    let s = raw.replace(/\s*\(([^()]*)\)/g, (m, inner) => (METRIC.test(inner) || INTERNAL.test(inner) || BIAS_C.test(inner)) ? '' : m);
    s = customerScrub(s).replace(/\b(satellite rain(?:fall)?) \(satellite rainfall\)/gi, '$1')   /* v91.17.268 · "satellite rain (IMERG)" scrubs to a doubled phrase */
      .replace(/\s+([;,.])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    if (NAMES.test(s)) s = s.replace(new RegExp(NAMES.source, 'gi'), 'the national service');
    out.push(s || 'a further limitation is recorded for this model');
  }
  return out;
}

export function createGate(dataDir) {
  let G = null, L = null, at = 0, RG = null, rgAt = 0;
  /* v91.17.283.22 · item 8: the product type of the chance of rain is the register's (data/thresholds-register.json rainChance.label:
     "Chance of rain (screening)" until its reliability re-test passes), for the gate entries the register names; every other entry keeps
     its model-gate product type */
  function ptOf(e) { try { const m = statSync(join(dataDir, 'thresholds-register.json')).mtimeMs; if (m !== rgAt) { rgAt = m; const R = JSON.parse(readFileSync(join(dataDir, 'thresholds-register.json'), 'utf8')); const r = (R.rows || []).find((x) => x.id === 'rainChance.label'); RG = r && r.value ? r.value : null; } } catch (_) { RG = null; }
    return RG && RG.productType && Array.isArray(RG.gateEntries) && RG.gateEntries.includes(e.id) ? RG.productType : (e.product_type || null); }
  function load() {
    try { const m = statSync(join(dataDir, 'model-gate.resolved.json')).mtimeMs; if (G && m === at) return; G = JSON.parse(readFileSync(join(dataDir, 'model-gate.resolved.json'), 'utf8')); at = m; } catch (_) { G = null; }
    try { L = JSON.parse(readFileSync(join(dataDir, 'rule-ledger.json'), 'utf8')); } catch (_) { L = null; }
  }
  const ALIAS = { rainfall: 'rain_hz', telco_heat: 'heat', telco_flood: 'flood', telco_wind: 'wind', earthquake: 'quake' };
  /* v91.17.283.23 · self-audit W8 · the per-level rule (product type, may it alert) reaches the pages from the gate itself, so no page keeps
     its own copy of owner decision A; the evidence text stays server-side */
  function lvOf(e) { const L = e && e.resolved && e.resolved.levels; if (!L) return {};
    return { levels: Object.fromEntries(Object.entries(L).map(([w, v]) => [w, { productType: v.productType || null, canAlert: !!v.canAlert }])) }; }
  /* v91.17.283.25 · an operator-only entry (the EWS shadow anchor, data/model-gate.json operator_only) never reaches a client route */
  const clientEntries = () => G.entries.filter((e) => !e.operator_only);
  function entryOf(layer) { load(); if (!G) return null; const id = G.layerOwner[ALIAS[layer] || layer]; return id ? G.entries.find((e) => e.id === id) || null : null; }
  return {
    version: () => { load(); return G ? G.version : null; },
    /* v91.17.283.24 · the general alert minimum (class rank) of a hazard without a per-level policy: data/model-gate.json alert_min_class_rank, the
       one home (the page gets the same value in the slim gate); null when the gate is not loaded (the caller fails closed) */
    alertMinRank: () => { load(); const v = G && G.alert_min_class_rank ? Number(G.alert_min_class_rank.value) : NaN; return Number.isInteger(v) && v >= 1 && v <= 4 ? v : null; },
    entryOf,
    byId: (id) => { load(); return G ? G.entries.find((e) => e.id === id) || null : null; },   /* v91.17.279 · site-risk trigger tier */
    productTypeOf: (id) => { load(); const e = G ? G.entries.find((x) => x.id === id) : null; return e ? ptOf(e) : null; },   /* v283.23 audit 16: the one label */
    statusOf: (layer) => { const e = entryOf(layer); return e ? e.resolved.status : 'experimental'; },
    canAlert: (h) => { const e = entryOf(h); return !!(e && e.resolved.canAlert); },
    tagOf: (layer) => { const e = entryOf(layer); if (!e) return { status: 'experimental', class: null, canAlert: false };
      return { status: e.resolved.status, class: e.class, canAlert: e.resolved.canAlert, model: e.id, productType: ptOf(e) }; },
    publicSummary: () => { load(); if (!G) return { ready: false };
      return { ready: true, version: G.version, statuses: G.statuses, alertMinClassRank: G.alert_min_class_rank ? G.alert_min_class_rank.value ?? null : null,
        entries: clientEntries().map((e) => ({ id: e.id, name: e.name, class: e.class, status: e.resolved.status, canAlert: e.resolved.canAlert, productType: ptOf(e), layers: e.layers || [], ...lvOf(e) })) }; },
    full: () => { load(); if (!G) return { ready: false }; return { ready: true, ...G, ledger: L }; },
    clientStatus: () => { load(); if (!G) return { ok: false, reason: 'The model gate is not on this server.' };
      /* v91.17.279 · the product type reaches the page through the inlined gate table (same model-gate.json field); this route keeps its five keys */
      const entries = clientEntries().map((e) => ({ id: e.id, name: customerScrub(String(e.name || e.id)), status: e.resolved.status,
        layers: (e.layers || []).filter((x) => typeof x === 'string' && x), limitations: clientLimitations(e.known_limitations, e.client_limitations), ...lvOf(e) }));
      const layerOwner = {}; for (const [k, v] of Object.entries(G.layerOwner || {})) if (k) layerOwner[k] = v;
      for (const [a, k] of Object.entries(ALIAS)) if (layerOwner[k] && !layerOwner[a]) layerOwner[a] = layerOwner[k];
      return { ok: true, version: G.version, asOf: G.built || null, statuses: G.statuses, entries, layerOwner }; },
  };
}
