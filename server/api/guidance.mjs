/* ══ v91.17.283.48 · "WHAT TO DO HERE" (release 1.0.8/1.0.9) · behind GUIDANCE_PANEL=1 (OFF by default) ════════════════════════════════
   The guidance and policy panel of a place (spec data/guidance/_inputs/what-to-do-here-spec.md): what to do now, which rules apply, the
   user's rights and duties, and who to contact, for the place's hazard levels and the chosen audience. ONLY curated, sourced library
   text is returned (data/guidance/*.json, built by scripts/gen/build_guidance_library.mjs); nothing is generated at run time.

   GET /api/guidance?lat=&lon=&audience=&lang=      a point (its tehsil by polygon, the place bundle's rule)
   GET /api/guidance?unit=<tehsil id>&audience=&lang=  a tehsil (its centre point for the location facts)
     audience  public | business | official (v1; aliases household, site, district)   lang  en | ur (Urdu text not reviewed yet: English
     with a note)   view  the caller's (x-agn-view, index.mjs customerView): customer sees only items its view policy allows; the operator
     sees every item, flagged with the reason it is not shown to customers.
   GET /api/guidance/library   the library's manifest (version, review, view policy) and the validator's verdict

   Matching (spec "Matching rules", owner decisions 2 Nov 2026):
     1. tehsil -> district -> province (server/contract/units.json);
     2. the level per hazard = NIGRAAN's served level (served.mjs servedUnit, the client rules applied, the map's values), the highest of
        today and the next 3 days (days 0-3); a withheld or not-assessed level never triggers guidance;
     3. the applicability state per hazard comes from the server's own endpoint GET /api/hazards/applicability (called in process, never
        re-derived here): "cannot happen here" -> one line "not relevant here", no guidance for that hazard;
     4. Moderate -> Monitor (before), High -> Watch (before, then "if it gets worse"), Severe -> Act (during, then before),
        Normal / Low -> standing preparedness, no level (not tested, not assessed, withheld) -> contacts and "no level here", never "clear";
        GLOF is an exposure (susceptibility, not a day forecast) -> "before" actions only;
     5. items filtered by hazard, audience, jurisdiction (national or the province), location conditions, status allowed for the view;
        regulatory and official first, then time-critical, then priority; 6 per phase, the rest in `more`; a provincial item replaces the
        national item it names in `supersedes`;
     6. nothing matched -> "No specific guidance in the library for this case" and the contacts;
     7. provenance: library version, every item id returned, the levels and applicability states used.
   Location rules stay conditional ("may be a notified flood plain"): no gazette layer of notified flood plains, notified rivers or
   Section 144 orders exists. Their triggers are NIGRAAN facts with a sourced threshold (see FACT_RULES). */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const GUIDANCE_ON = () => process.env.GUIDANCE_PANEL === '1';
export const LIBRARY_FILES = ['manifest.json', 'sources.json', 'action_items.json', 'regulatory_items.json', 'duties_rights.json', 'contacts.json'];
export const LEVEL_WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
export const STATUSES = ['checked-text', 'machine-verified-official-text', 'checked-secondary', 'to-verify'];
export const KINDS = ['regulatory', 'official', 'good-practice'];
export const PROVINCES = ['punjab', 'sindh', 'kp', 'balochistan', 'gb', 'ajk', 'ict'];
export const PROVINCE_KEY = { 'Punjab': 'punjab', 'Sindh': 'sindh', 'Khyber Pakhtunkhwa': 'kp', 'Balochistan': 'balochistan', 'Gilgit Baltistan': 'gb', 'Gilgit-Baltistan': 'gb', 'Azad Kashmir': 'ajk', 'Federal Capital': 'ict' };
export const PROVINCE_NAME = { punjab: 'Punjab', sindh: 'Sindh', kp: 'Khyber Pakhtunkhwa', balochistan: 'Balochistan', gb: 'Gilgit-Baltistan', ajk: 'Azad Jammu and Kashmir', ict: 'Islamabad Capital Territory' };
export const AUDIENCE_ALIAS = { public: 'public', household: 'public', business: 'business', site: 'business', official: 'official', district: 'official' };
/* the guidance hazard -> the served layer and the applicability row it is read from */
export const HAZARD_LAYER = { flood: { layer: 'flood', applicability: 'flood_riverine', name: 'Flood' }, heat: { layer: 'heat', applicability: 'heat', name: 'Heat' },
  landslide: { layer: 'landslide', applicability: 'landslide', name: 'Landslide' }, glof: { layer: 'glof', applicability: 'glof', name: 'Glacial lake outburst flood (GLOF)' },
  smog: { layer: null, applicability: null, name: 'Smog' } };
export const NO_MATCH = 'No specific guidance in the library for this case.';
export const NOT_RELEVANT = 'not relevant here';
export const NO_LEVEL = 'no level here';

/* the location facts behind the conditional rules: each threshold names its source (owner rule: no unsourced cut-offs) */
export const FACT_RULES = {
  lowLandNearRiver: 'the point lies in the lowest tested height-above-river class (data/hand-calibration.json t_hand class 1, the class with the largest mapped flooded share in all four NDMA floods, order held out of sample) AND in or beside (within 270 m of) the mapped river flood extent (JRC / GloFAS undefended maps, 1-in-10 to 1-in-500 years)',
  inRiverFloodExtent: 'the point lies in the mapped river flood extent (JRC / GloFAS undefended maps, 1-in-10 to 1-in-500 years), the nearest proxy NIGRAAN holds for the "active flood plain"; no river corridor line exists',
  within1500ftOfWater: 'the point lies within 1,500 ft (457 m, the outer zoning distance of the KP River Protection Ordinance s.4(2)) of persistent surface water (JRC Global Surface Water, >= 50 % of the time) and its tehsil has a river channel (GET /api/hazards/applicability, river flooding not "cannot happen here")',
};
const FT1500_KM = 1500 * 0.3048 / 1000;

/* ── the validator (also run by scripts/validate-guidance.mjs and before the builder writes) ── */
export function validateLibrary(lib) {
  const errors = [], E = (m) => errors.push(m);
  if (!lib || typeof lib !== 'object') return { ok: false, errors: ['no library'], counts: '' };
  const M = lib.manifest || {};
  if (!M.version || !/^\d+\.\d+\.\d+$/.test(M.version)) E('manifest: version missing or not x.y.z');
  if (!M.review || typeof M.review.reviewer !== 'string') E('manifest: review.reviewer must be a string (may be empty)');
  if (!M.viewPolicy || !M.viewPolicy.customer) E('manifest: viewPolicy.customer missing');
  const okSt = new Set(M.officialSourceStatuses || ['checked-text']);
  const src = new Map((lib.sources || []).map((s) => [s.id, s]));
  for (const s of lib.sources || []) { if (!s.id || !s.title) E('source ' + (s.id || '?') + ': id and title required'); if (!STATUSES.includes(s.status)) E('source ' + s.id + ': bad status ' + s.status); }
  const ids = new Set();
  const items = [...(lib.actions || []), ...(lib.regulatory || []), ...(lib.duties || [])];
  for (const it of items) {
    const w = 'item ' + (it && it.id || '?');
    if (!it || !it.id) { E('item without id'); continue; }
    if (ids.has(it.id)) E(w + ': duplicate id'); ids.add(it.id);
    if (typeof it.text_en !== 'string' || !it.text_en.trim()) E(w + ': text_en missing');
    if (!('text_ur' in it)) E(w + ': text_ur field missing (may be null)');
    if (!KINDS.includes(it.kind)) E(w + ': bad kind ' + it.kind);
    if (!['do', 'rules', 'rights'].includes(it.tab)) E(w + ': bad tab ' + it.tab);
    if (!STATUSES.includes(it.status)) E(w + ': bad status ' + it.status);
    if (!Array.isArray(it.hazards) || !it.hazards.length) E(w + ': hazards missing');
    if (!Array.isArray(it.jurisdictions) || !it.jurisdictions.length || it.jurisdictions.some((j) => j !== 'national' && !PROVINCES.includes(j))) E(w + ': bad jurisdictions');
    if (typeof it.reviewer !== 'string') E(w + ': reviewer field must be a string (may be empty)');
    if (!('reviewedOn' in it) || !('nextReviewBy' in it)) E(w + ': review date fields missing');
    if (it.sourceId != null && !src.has(it.sourceId)) E(w + ': unknown source ' + it.sourceId);
    /* spec: an official item must point to a source whose text was checked, or it is rejected at build time */
    if (it.kind === 'official') { const s = src.get(it.sourceId); if (!s || !okSt.has(s.status)) E(w + ': official item without a checked source (' + (it.sourceId || 'none') + (s ? ', ' + s.status : '') + ')'); }
    /* an item with no source at all may never reach a customer */
    if (it.sourceId == null && it.status !== 'to-verify' && it.status !== 'checked-secondary') E(w + ': no source but status ' + it.status);
    if (it.tab === 'do' && (!['before', 'during'].includes(it.phase) || !Array.isArray(it.levels))) E(w + ': do item needs phase and levels');
    for (const c of it.conditions || []) if (!FACT_RULES[c]) E(w + ': unknown condition ' + c);
  }
  for (const c of lib.contacts || []) { if (!c.id || !c.name || !c.province) E('contact ' + (c.id || '?') + ': id, name, province required'); if (c.customer && !(Array.isArray(c.phone) && c.phone.length)) E('contact ' + c.id + ': customer-visible without a number'); }
  const counts = (lib.sources || []).length + ' sources, ' + (lib.actions || []).length + ' actions, ' + (lib.regulatory || []).length + ' rule/right lines, ' + (lib.duties || []).length + ' audience lines, ' + (lib.contacts || []).length + ' contacts';
  return { ok: !errors.length, errors, counts };
}

/* ── library loading (cached by mtime) ── */
const CACHE = new Map();
export function loadLibrary(dataDir) {
  const dir = join(dataDir, 'guidance');
  try {
    const key = LIBRARY_FILES.map((f) => { const st = statSync(join(dir, f)); return f + ':' + st.size + ':' + st.mtimeMs; }).join('|');
    const hit = CACHE.get(dir); if (hit && hit.key === key) return hit.lib;
    const rd = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const lib = { manifest: rd('manifest.json'), sources: rd('sources.json'), actions: rd('action_items.json'), regulatory: rd('regulatory_items.json'), duties: rd('duties_rights.json'), contacts: rd('contacts.json') };
    const V = validateLibrary(lib); lib.valid = V; lib.srcById = Object.fromEntries(lib.sources.map((s) => [s.id, s]));
    CACHE.set(dir, { key, lib }); return lib;
  } catch (e) { return { error: 'the guidance library is not in this install (' + (existsSync(dir) ? 'unreadable' : 'no data/guidance') + ')' }; }
}

/* ── the level of one hazard over days 0-3 from the served unit (servedUnit output) ── */
export function hazardLevel(S, layer) {
  if (!S || !S.ready) return { word: null, withheld: true, why: (S && S.why) || 'the issued levels of this tehsil are not loaded' };
  if (S.gateUnavailable) return { word: null, withheld: true, why: S.why || 'the model gate is unavailable' };
  if ((S.hidden || []).some((h) => h.layer === layer)) return { word: null, withheld: true, why: (S.hidden.find((h) => h.layer === layer) || {}).why || 'withheld from client screens' };
  const days = (S.days || []).filter((d) => Number.isInteger(d.day) && d.day >= 0 && d.day <= 3);
  let best = null; const per = [], states = new Set(); let why = null;
  for (const d of days) { const v = d.layers && d.layers[layer]; if (!v) { per.push({ date: d.date, day: d.day, word: null, state: 'missing' }); states.add('missing'); continue; }
    if (v.assessed === false || !(v.level >= 0)) { per.push({ date: d.date, day: d.day, word: null, state: v.state || 'missing' }); states.add(v.state || 'missing'); why = why || v.notAssessedWhy || null; continue; }
    const w = LEVEL_WORDS[v.level] || v.word; per.push({ date: d.date, day: d.day, word: w, state: 'value', productType: v.productType || null });
    if (!best || v.level > best.i) best = { i: v.level, word: w, date: d.date, productType: v.productType || null, testStatus: v.testStatus || null }; }
  if (!days.length) return { word: null, withheld: true, why: 'no issued day', days: per };
  if (!best) { const all = [...states]; return { word: null, state: all.length === 1 ? all[0] : 'missing', why: why || 'not assessed on the issued days', days: per }; }
  return { word: best.word, i: best.i, peakDate: best.date, productType: best.productType, testStatus: best.testStatus, days: per };
}

/* ── the location facts of the conditional rules ── */
export function evalFacts(F, extra = {}) {
  const out = {};
  const hand = extra.handM != null ? extra.handM : (F && F.heightAboveRiver ? F.heightAboveRiver.value : null);
  const lowBreak = extra.handLowBreakM ?? null;
  const fm = F && F.floodMap ? F.floodMap.value : null;
  const near = fm === 'in the mapped flood extent' || fm === 'beside the mapped flood extent' ? true : fm === 'outside the mapped flood extent' ? false : null;
  const wd = extra.waterKm != null ? extra.waterKm : (F && F.nearestWater && !F.nearestWater.atLeast ? F.nearestWater.value : (F && F.nearestWater && F.nearestWater.atLeast ? Infinity : null));
  /* low land near a river */
  if (hand == null || lowBreak == null) out.lowLandNearRiver = { met: null, why: hand == null ? 'the height-above-river grid is not on this server' : 'the height-above-river classes are not on this server' };
  else if (hand >= lowBreak) out.lowLandNearRiver = { met: false, why: 'height above the nearest river ' + hand + ' m (the lowest tested class ends at ' + lowBreak + ' m)' };
  else if (near == null) out.lowLandNearRiver = { met: null, why: 'low land (' + hand + ' m above the nearest river) but the river flood map for this point is not on this server' };
  else out.lowLandNearRiver = { met: near, why: 'height above the nearest river ' + hand + ' m (lowest tested class, below ' + lowBreak + ' m); ' + fm };
  /* in the mapped river flood extent */
  out.inRiverFloodExtent = fm == null ? { met: null, why: 'the river flood map for this point is not on this server' } : { met: fm === 'in the mapped flood extent', why: fm };
  /* KP: within 1,500 ft of water, in a tehsil with a river */
  if (wd == null) out.within1500ftOfWater = { met: null, why: 'no surface-water distance held for this point' };
  else if (extra.riverState === 'not_applicable') out.within1500ftOfWater = { met: false, why: 'no river channel in this tehsil (applicability: river flooding cannot happen here)' };
  else out.within1500ftOfWater = { met: wd <= FT1500_KM, why: (wd === Infinity ? 'more than 20 km' : Math.round(wd * 1000) + ' m') + ' from persistent surface water (1,500 ft = 457 m)' };
  return out;
}

const STALE_MS = (M) => ((M.review && M.review.staleAfterMonths) || 12) * 30.44 * 864e5;
/* why an item is not shown to a customer (null = shown) */
export function customerBlock(lib, it, now = Date.now()) {
  const pol = (lib.manifest.viewPolicy && lib.manifest.viewPolicy.customer) || {};
  const allowed = pol[it.tab] || ['checked-text'];
  if (!allowed.includes(it.status)) return it.status === 'to-verify' ? 'not verified yet (operator view only)' : it.status === 'checked-secondary' ? 'checked from secondary sources only (operator view only until reviewed)' : 'status ' + it.status + ': this line is shown to customers only once its text is checked against the official text (checked-text)';
  const basis = it.reviewedOn || it.verifiedOn; if (!basis || now - Date.parse(basis) > STALE_MS(lib.manifest)) return 'not reviewed within ' + ((lib.manifest.review && lib.manifest.review.staleAfterMonths) || 12) + ' months';
  return null;
}

const inJur = (it, prov) => it.jurisdictions.includes('national') || (prov && it.jurisdictions.includes(prov));
const forAud = (it, a) => it.audiences.includes('*') || it.audiences.includes(a);
const forHz = (it, h) => it.hazards.includes('*') || it.hazards.includes(h);
const rank = (it) => (it.kind === 'regulatory' || it.kind === 'official' ? 0 : 1) * 100 + (it.timeCritical ? 0 : 1) * 10 + Math.min(9, it.priority || 9);

function itemOut(lib, it, view, lang, now, cond) {
  const s = it.sourceId ? lib.srcById[it.sourceId] : null, block = customerBlock(lib, it, now);
  const ur = lang === 'ur' && it.text_ur;
  return { id: it.id, kind: it.kind, text: ur ? it.text_ur : it.text_en, lang: ur ? 'ur' : 'en', ...(lang === 'ur' && !ur ? { langNote: 'Urdu text not reviewed yet: shown in English' } : {}),
    source: s ? { id: s.id, short: s.short, title: s.title, url: (it.sourceRef && it.sourceRef.url) || (s.source && s.source.url) || null, lawUrl: s.source && s.source.url || null, doc: (it.sourceRef && it.sourceRef.doc) || s.title, section: (it.sourceRef && it.sourceRef.section) || null }
      : { id: null, short: 'No official source', title: null, url: null, doc: null, section: null, note: it.unsupportedWhy || 'no official source found' },
    status: it.status, timeCritical: !!it.timeCritical, ...(it.jurisdictionNote ? { jurisdictionNote: it.jurisdictionNote } : {}),
    ...(cond ? { conditions: cond } : {}),
    ...(view === 'operator' ? { flagged: !!block || (cond && Object.values(cond).some((c) => c.met !== true)), ...(block ? { customerHiddenWhy: block } : {}), review: { reviewer: it.reviewer, reviewedOn: it.reviewedOn, verifiedOn: it.verifiedOn, nextReviewBy: it.nextReviewBy } } : {}) };
}

/* the items of one list after the view and condition filters; returns { shown, hidden } (hidden: operator count by reason) */
function pick(lib, list, ctx, extraFilter) {
  const shown = [], hiddenWhy = {};
  const sup = new Set(list.filter((it) => it.supersedes && inJur(it, ctx.province) && it.jurisdictions.includes(ctx.province)).flatMap((it) => [].concat(it.supersedes)));
  for (const it of list) {
    if (sup.has(it.id)) continue;
    if (!extraFilter(it)) continue;
    let cond = null;
    if (it.conditions && it.conditions.length) { cond = {}; for (const c of it.conditions) cond[c] = (ctx.facts && ctx.facts[c]) || { met: null, why: 'fact not computed' };
      const vals = Object.values(cond);
      if (vals.some((c) => c.met === false)) continue;                                    /* not triggered at this place */
      if (ctx.view !== 'operator' && vals.some((c) => c.met !== true)) { hiddenWhy['location fact could not be checked'] = (hiddenWhy['location fact could not be checked'] || 0) + 1; continue; } }
    const block = customerBlock(lib, it, ctx.now);
    if (block && ctx.view !== 'operator') { hiddenWhy[block] = (hiddenWhy[block] || 0) + 1; continue; }
    shown.push({ it, cond });
  }
  shown.sort((a, b) => rank(a.it) - rank(b.it) || a.it.id.localeCompare(b.it.id));
  return { shown, hiddenWhy };
}

/* ── THE MATCHING, a pure function: library + resolved context -> panel ── */
export function selectGuidance(lib, ctx) {
  const M = lib.manifest, now = ctx.now || Date.now(), view = ctx.view === 'operator' ? 'operator' : 'customer', lang = ctx.lang === 'ur' ? 'ur' : 'en';
  const aud = AUDIENCE_ALIAS[String(ctx.audience || 'public').toLowerCase()] || 'public', audItems = (M.audiencesV1[aud] || {}).items || 'household';
  const prov = ctx.province || null, per = M.perPhase || 6, ids = new Set();
  const C = { ...ctx, view, now, province: prov };
  const take = (arr) => arr.map(({ it, cond }) => { ids.add(it.id); return itemOut(lib, it, view, lang, now, cond); });
  const hazards = [];
  for (const hz of [...M.hazardsV1, ...(M.hazardsLater || [])]) {
    const H = (ctx.hazards || {})[hz] || {}, name = (HAZARD_LAYER[hz] || {}).name || hz;
    if (!M.hazardsV1.includes(hz)) { if (view === 'operator') hazards.push({ hazard: hz, name, status: 'coming', line: name + ': guidance coming in a later version.' }); continue; }   /* owner 30 Oct: no noise on client screens */
    const A = H.applicability || null, L = H.level || {};
    const out = { hazard: hz, name, applicability: A ? { state: A.state, text: A.text, why: A.why || null } : null, level: { word: L.word || null, peakDate: L.peakDate || null, productType: L.productType || null, testStatus: L.testStatus || null, days: L.days || [], ...(L.word ? {} : { why: L.why || null, state: L.state || null, withheld: !!L.withheld }) } };
    /* cannot happen here: one line, no guidance (applicability endpoint, or the served level itself on every day) */
    const cannot = (A && A.state === 'not_applicable') || (!L.word && L.state === 'not_applicable');
    if (cannot) { hazards.push({ ...out, status: 'not_relevant', line: ((A && A.name) || name) + ': ' + NOT_RELEVANT + (A && (A.why || A.text) ? ' (' + (A.why || A.text) + ')' : L.why ? ' (' + L.why + ')' : '') + '.' }); continue; }
    /* GLOF: an exposure (lakes drain here, GET /api/hazards/applicability "can happen here"), never a day level: "before" actions only */
    const glofExposed = hz === 'glof' && ((A && A.state === 'value') || !!L.word);
    if (!L.word && !glofExposed) { hazards.push({ ...out, status: 'no_level', line: name + ': ' + NO_LEVEL + (view === 'operator' ? ' (' + (L.withheld ? 'level withheld: ' : '') + (L.why || (A && A.text) || 'not assessed') + '; contacts only, never an all-clear)' : '') + '.' }); continue; }
    const g = glofExposed ? 'exposure' : (M.levelMap[L.word] || 'standing');
    const phases = glofExposed ? M.phases.glofExposure : M.phases[g];
    /* Do now */
    const doList = lib.actions.filter((it) => forHz(it, hz) && forAud(it, audItems) && inJur(it, prov));
    const ph = phases.map(([phase, title]) => { const P = pick(lib, doList.filter((it) => it.phase === phase && (g === 'standing' || g === 'exposure' || it.levels.includes(g))), C, () => true);
      const all = take(P.shown); return { phase, title, items: all.slice(0, per), more: all.slice(per), ...(view === 'operator' && Object.keys(P.hiddenWhy).length ? { hiddenFromCustomers: P.hiddenWhy } : {}) }; });
    /* Rules here */
    const R = pick(lib, lib.regulatory.filter((it) => it.tab === 'rules' && forHz(it, hz) && inJur(it, prov)), C, () => true);
    /* Your rights: the rights lines, then the audience's duties */
    const RR = pick(lib, lib.regulatory.filter((it) => it.tab === 'rights' && forHz(it, hz) && inJur(it, prov)), C, () => true);
    const DU = pick(lib, lib.duties.filter((it) => forAud(it, audItems) && it.line === 'duty'), C, () => true);
    const DR = pick(lib, lib.duties.filter((it) => forAud(it, audItems) && it.line === 'right'), C, () => true);
    const nDo = ph.reduce((a, p) => a + p.items.length + p.more.length, 0);
    hazards.push({ ...out, status: g === 'standing' ? 'standing' : g === 'exposure' ? 'exposure' : 'level', guidanceLevel: g, label: g === 'standing' ? 'Standing preparedness' : g === 'exposure' ? 'Exposure: prepare' : g.charAt(0).toUpperCase() + g.slice(1),
      ...(glofExposed && view === 'operator' ? { glofNote: 'GLOF is an exposure (glacial lakes drain here; no outburst level is issued, not a day forecast): preparation actions only.' + (A && A.text ? ' ' + A.text.charAt(0).toUpperCase() + A.text.slice(1) + '.' : '') } : {}),
      tabs: {
        do: { phases: ph, ...(nDo ? {} : { message: NO_MATCH }) },
        rules: { items: take(R.shown), ...(R.shown.length ? {} : { message: 'No location rule in the library for this case.' }), ...(view === 'operator' && Object.keys(R.hiddenWhy).length ? { hiddenFromCustomers: R.hiddenWhy } : {}) },
        rights: { items: take(RR.shown).concat(take(DR.shown)), duties: take(DU.shown), ...(RR.shown.length + DR.shown.length + DU.shown.length ? {} : { message: 'No checked rights or duties lines for this case yet.' }),
          ...(view === 'operator' && (Object.keys(RR.hiddenWhy).length || Object.keys(DU.hiddenWhy).length) ? { hiddenFromCustomers: { ...RR.hiddenWhy, ...DU.hiddenWhy, ...DR.hiddenWhy } } : {}) } } });
  }
  /* Contacts: national first, then the province, then the district */
  const cs = (lib.contacts || []).filter((c) => c.province === 'national' || c.province === prov).filter((c) => !c.district || (ctx.district && c.district === ctx.district));
  const order = { national: 0, authority: 1, rescue: 2, district: 3, irrigation: 4, other: 5 };
  const contacts = cs.filter((c) => view === 'operator' || c.customer).sort((a, b) => (a.province === 'national' ? -1 : 0) - (b.province === 'national' ? -1 : 0) || (order[a.role] ?? 9) - (order[b.role] ?? 9))
    .map((c) => { ids.add(c.id); return { id: c.id, name: c.name + (c.district ? ' · ' + c.district : ''), phone: c.phone, role: c.role, note: c.note || null, source: c.verifiedUrl || null, ...(view === 'operator' ? { customer: !!c.customer, status: c.status, ...(c.operatorOnlyWhy ? { customerHiddenWhy: c.operatorOnlyWhy } : {}), ...(c.districtNote ? { districtNote: c.districtNote } : {}), verifiedOn: c.verifiedOn } : {}) }; });
  const hiddenC = cs.filter((c) => !c.customer).length;
  const lv = Object.fromEntries(hazards.filter((h) => h.level).map((h) => [h.hazard, { word: h.level.word, peakDate: h.level.peakDate, status: h.status, applicability: h.applicability ? h.applicability.state : null }]));
  return { ok: true, schema: 'agn.guidance.v1', view, audience: aud, audiences: Object.entries(M.audiencesV1).map(([k, v]) => ({ id: k, label: v.label })), lang, ...(lang === 'ur' ? { langNote: 'Urdu texts are not reviewed by a native speaker yet; English is shown.' } : {}),
    officialWarning: null, ...(view === 'operator' ? { officialWarningNote: (M.officialWarnings || {}).note || null } : {}),
    hazards,
    contacts: { items: contacts, ...(contacts.length ? {} : { message: 'No officially published contact for this place in the library yet.' }), ...(view === 'operator' ? { hiddenFromCustomers: hiddenC } : {}) },
    library: { version: M.version, built: M.built, reviewer: M.review.reviewer, verifiedOn: M.review.verifiedOn, ...(view === 'operator' ? { reviewerNote: M.review.reviewerNote } : {}) },
    footer: M.footer,
    provenance: { library: 'nigraan-guidance', libraryVersion: M.version, itemIds: [...ids].sort(), levels: lv, rule: 'items selected by the guidance matching from the guidance library (no generated text)' } };
}

/* ── the server part: resolve the place, the served levels, the applicability states and the facts, then select ── */
export function createGuidance(app, dataDir, { applicability } = {}) {
  const lib = () => loadLibrary(dataDir);
  let handBreak = undefined;
  const lowBreak = () => { if (handBreak !== undefined) return handBreak; try { const H = JSON.parse(readFileSync(join(dataDir, 'hand-calibration.json'), 'utf8')); const c = H.bands && H.bands.t_hand && H.bands.t_hand.classes; handBreak = c && c[0] && Number.isFinite(c[0].toM) ? c[0].toM : null; } catch (_) { handBreak = null; } return handBreak; };
  async function resolve(q) {
    let lat = q.lat != null && q.lat !== '' ? Number(q.lat) : NaN, lon = q.lon != null && q.lon !== '' ? Number(q.lon) : NaN, unit = null;
    const T = (app.units && app.units.tehsil) || [];
    if (q.unit) { unit = T.find((u) => u.unitId === q.unit) || null; if (!unit) return { error: 404, why: 'no tehsil with this id' }; if (!(isFinite(lat) && isFinite(lon))) { lat = unit.lat; lon = unit.lon; } }
    else { if (!(isFinite(lat) && isFinite(lon))) return { error: 400, why: 'lat and lon (or unit) required' };
      if (lat < 20 || lat > 40 || lon < 58 || lon > 82) return { error: 400, why: 'coordinate outside the window this build covers (20-40 N, 58-82 E)' };
      try { const { unitAtPoint } = await import('./unitresolve.mjs'); const r = unitAtPoint(app, lat, lon); unit = r && r.unit ? T.find((u) => u.unitId === r.unit.unitId) || r.unit : null; } catch (_) { unit = null; } }
    if (!unit) return { error: 200, why: 'the place lies in no tehsil' };
    return { lat, lon, unit };
  }
  async function forPlace(q, { view = 'customer', now } = {}) {
    const L = lib(); if (L.error) return { ok: false, why: L.error };
    if (!L.valid.ok) return { ok: false, why: 'the guidance library failed its check: ' + L.valid.errors.slice(0, 3).join('; ') };
    const P = await resolve(q); if (P.error) return { ok: false, status: P.error, why: P.why };
    const u = P.unit, province = PROVINCE_KEY[u.province] || null;
    if (!province) return { ok: false, why: u.disputed ? 'disputed territory: no guidance is published' : 'no guidance for this territory' };
    /* the served levels (the map's, the client rules applied) */
    let S = null; try { const { servedUnit } = await import('./served.mjs'); S = servedUnit(app, u.unitId, false); } catch (_) { S = null; }
    /* the applicability states: GET /api/hazards/applicability, the server's own endpoint */
    let rows = null, appWhy = null; try { const j = applicability ? await applicability(u.unitId) : null; if (j && j.ok) rows = j.hazards; else appWhy = (j && j.why) || 'the applicability endpoint did not answer'; } catch (e) { appWhy = 'the applicability endpoint did not answer'; }
    const rowOf = (k) => (rows || []).find((r) => r.hazard === k) || null;
    const hazards = {};
    for (const hz of L.manifest.hazardsV1) { const HL = HAZARD_LAYER[hz]; hazards[hz] = { level: hazardLevel(S, HL.layer), applicability: HL.applicability ? rowOf(HL.applicability) : null }; }
    /* location facts (place facts module: the console's own values) */
    let F = null; try { const r = app.placeFacts ? await app.placeFacts.facts(P.lat, P.lon) : null; F = r && r.ok ? r.fields : null; } catch (_) { F = null; }
    let handM = null, waterKm = null; try { const fg = app.featGrid; if (fg) { const h = fg.value('t_hand', P.lat, P.lon); if (Number.isFinite(h)) handM = Math.round(h * 10) / 10; const w = fg.value('w_dist', P.lat, P.lon); if (Number.isFinite(w)) waterKm = w; } } catch (_) {}
    const riverRow = rowOf('flood_riverine');
    const facts = evalFacts(F, { handM, handLowBreakM: lowBreak(), waterKm, riverState: riverRow ? riverRow.state : null });
    const out = selectGuidance(L, { province, district: u.district, audience: q.audience, lang: q.lang, view, now, hazards, facts });
    out.place = { tehsil: u.tehsil || u.name, district: u.district, province: PROVINCE_NAME[province], provinceKey: province, lat: Math.round(P.lat * 1e5) / 1e5, lon: Math.round(P.lon * 1e5) / 1e5, ...(view === 'operator' ? { unitId: u.unitId } : {}) };
    out.levelsBasis = { rule: 'the served level of each hazard (the map’s, client rules applied), the highest of today and the next 3 days', issueId: S && S.issueId || null, at: S && S.at || null };
    out.applicabilityBasis = rows ? { source: 'GET /api/hazards/applicability' } : { source: 'GET /api/hazards/applicability', why: appWhy };
    if (view === 'operator') out.facts = Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, { ...v, rule: FACT_RULES[k] }]));
    out.provenance.applicability = Object.fromEntries(Object.entries(hazards).map(([k, v]) => [k, v.applicability ? v.applicability.state : null]));
    out.provenance.place = out.place.tehsil + ', ' + out.place.district + ', ' + out.place.province;
    out.provenance.at = new Date(now || Date.now()).toISOString();
    return out;
  }
  function status() { const L = lib(); if (L.error) return { ok: false, why: L.error }; return { ok: L.valid.ok, ...(L.valid.ok ? {} : { errors: L.valid.errors }), counts: L.valid.counts, manifest: L.manifest }; }
  return { forPlace, status, library: lib };
}

/* GET a route of this server in process (no socket): used to read GET /api/hazards/applicability exactly as a page reads it */
export function inProcessGet(handle, path, headers = { 'x-agn-view': 'customer' }) {
  return new Promise((resolveP) => {
    const url = new URL(path, 'http://127.0.0.1');
    const req = { method: 'GET', url: url.pathname + url.search, headers: { host: '127.0.0.1', ...headers }, socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' }, connection: { remoteAddress: '127.0.0.1' }, on() {}, once() {} };
    let status = 200; const chunks = [];
    const res = { statusCode: 200, headersSent: false, writeHead(s) { status = s; this.statusCode = s; this.headersSent = true; return this; }, setHeader() {}, getHeader() { return undefined; }, removeHeader() {},
      write(b) { if (b) chunks.push(Buffer.from(b)); return true; }, end(b) { if (b) chunks.push(Buffer.from(b)); try { resolveP({ status, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch (_) { resolveP({ status, json: null }); } }, on() {}, once() {} };
    Promise.resolve(handle(req, res, url)).then((r) => { if (r === false) resolveP({ status: 404, json: null }); }, () => resolveP({ status: 500, json: null }));
  });
}

/* the route (index.mjs calls it only when GUIDANCE_PANEL=1) */
export async function guidanceRoute(G, req, res, url, { send, customerView }) {
  const p = url.pathname, view = customerView(req) ? 'customer' : 'operator';
  if (req.method !== 'GET') return send(res, 405, { ok: false, why: 'GET only' });
  if (p === '/api/guidance/library') { const s = G.status(); return send(res, 200, view === 'operator' ? s : { ok: s.ok, counts: s.counts, version: s.manifest && s.manifest.version, review: s.manifest && s.manifest.review, viewPolicy: s.manifest && s.manifest.viewPolicy }); }
  if (p !== '/api/guidance') return send(res, 404, { ok: false, why: 'unknown guidance route' });
  const q = Object.fromEntries(url.searchParams);
  if (q.audience && !AUDIENCE_ALIAS[String(q.audience).toLowerCase()]) return send(res, 400, { ok: false, why: 'audience must be public, business or official' });
  if (q.lang && !['en', 'ur'].includes(q.lang)) return send(res, 400, { ok: false, why: 'lang must be en or ur' });
  const r = await G.forPlace(q, { view });
  let body = r.status ? (({ status, ...x }) => x)(r) : r;
  /* the customer answer: the owner's agency rule (PMD / FFD never named) applied here, then marked clean so the response point does not
     replace the issuing authorities the guidance must cite (NDMA, PDMAs: the official source of every item and the published helplines) */
  if (view === 'customer') { body = await agencyOnlyDeep(body); res.__agnClean = true; }
  return send(res, r.ok === false && r.status && r.status !== 200 ? r.status : 200, body);
}
/* library text (item text, its source citation, contact names and notes, the footer) keeps the issuing authorities under the agency rule
   only; every other string (level reasons, applicability lines from the engine) gets the full client wording rule of the response point */
const LIB_KEYS = new Set(['text', 'source', 'name', 'note', 'footer', 'doc', 'title', 'short', 'section', 'lawUrl', 'url']);
async function agencyOnlyDeep(x) { const { agencyText, clientText } = await import('./customerscrub.mjs');
  const walk = (v, d, lib) => d > 40 ? v : typeof v === 'string' ? (lib ? agencyText(v) : clientText(v)) : Array.isArray(v) ? v.map((y) => walk(y, d + 1, lib)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, y]) => [k, walk(y, d + 1, lib || LIB_KEYS.has(k))])) : v;
  return walk(x, 0, false); }

/* the "What to do" section of an issued site report (reports.mjs, GUIDANCE_PANEL=1): code-rendered from the same selection */
const escH = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function guidanceHtml(results) {
  const o = ['<section class="agn-guidance" data-agn-guidance="server"><h2>What to do</h2>'];
  for (const g of results || []) {
    if (!g || g.ok === false) { o.push('<p class="small">What to do: not available (' + escH((g && g.why) || 'no answer') + ').</p>'); continue; }
    o.push('<p class="small">' + escH(g.place ? g.place.tehsil + ', ' + g.place.district + ', ' + g.place.province : '') + ' · audience ' + escH(g.audience) + ' · library ' + escH(g.library.version) + '</p>');
    for (const h of g.hazards) {
      if (h.status === 'coming') continue;
      if (h.status === 'not_relevant' || h.status === 'no_level') { o.push('<p>' + escH(h.line) + '</p>'); continue; }
      o.push('<h3>' + escH(h.name) + ': ' + (h.level.word ? escH(h.level.word) + ' (' + escH(h.label) + ')' : escH(h.label)) + '</h3>');
      for (const ph of h.tabs.do.phases) { const all = ph.items.concat(ph.more); if (!all.length) continue; o.push('<p><b>' + escH(ph.title) + '</b></p><ul>' + all.map((it) => '<li>' + escH(it.text) + ' <span class="small">[' + escH(it.id) + '; ' + escH(it.source.doc || it.source.short) + (it.source.url ? ' ' + escH(it.source.url) : '') + ']</span></li>').join('') + '</ul>'); }
      if (h.tabs.do.message) o.push('<p>' + escH(h.tabs.do.message) + '</p>');
      if (h.tabs.rules.items.length) o.push('<p><b>Rules here</b></p><ul>' + h.tabs.rules.items.map((it) => '<li>' + escH(it.text) + ' <span class="small">[' + escH(it.id) + '; ' + escH(it.source.short) + (it.source.section ? ' ' + escH(it.source.section) : '') + ']</span></li>').join('') + '</ul>');
      if (h.tabs.rights.items.length) o.push('<p><b>Your rights</b></p><ul>' + h.tabs.rights.items.map((it) => '<li>' + escH(it.text) + ' <span class="small">[' + escH(it.id) + '; ' + escH(it.source.short) + ']</span></li>').join('') + '</ul>');
    }
    o.push('<p><b>Contacts</b></p><ul>' + (g.contacts.items.length ? g.contacts.items.map((c) => '<li>' + escH(c.name) + ': ' + escH((c.phone || []).join(', ')) + (c.note ? ' (' + escH(c.note) + ')' : '') + '</li>').join('') : '<li>' + escH(g.contacts.message || 'none') + '</li>') + '</ul>');
    o.push('<p class="small">' + escH(g.footer) + ' Provenance: guidance library ' + escH(g.provenance.libraryVersion) + ', items ' + escH(g.provenance.itemIds.join(', ')) + '.</p>');
  }
  o.push('</section>'); return o.join('');
}
export function bindGuidance(html, results) { const blk = guidanceHtml(results); const s = String(html); const i = s.indexOf('</section>', s.indexOf('data-agn-decision="server"'));
  if (s.indexOf('data-agn-decision="server"') >= 0 && i >= 0) return s.slice(0, i + 10) + blk + s.slice(i + 10);
  const b = s.search(/<body[^>]*>/i); if (b < 0) return blk + s; const j = s.indexOf('>', b) + 1; return s.slice(0, j) + blk + s.slice(j); }

/* the AI assistant: "what should I do" answered from the selected items only (ai.mjs, GUIDANCE_PANEL=1) */
export const WHAT_TO_DO_Q = /\b(what\s+(should|shall|must|can|do)\s+(i|we)\s+do|what\s+to\s+do|what\s+do\s+(i|we)\s+do|how\s+(should|do|can)\s+(i|we)\s+(prepare|stay\s+safe|protect))\b/i;
export function guidanceAnswer(g) {
  if (!g || g.ok === false) return { answer: 'I cannot give guidance for this place: ' + ((g && g.why) || 'the guidance library did not answer') + '. In an emergency call Rescue 1122 where the service operates, or the NDMA helpline 111-157-157.', items: [] };
  const lines = [], used = [];
  const active = g.hazards.filter((h) => h.status === 'level' || h.status === 'standing' || h.status === 'exposure').sort((a, b) => (b.level.word ? LEVEL_WORDS.indexOf(b.level.word) : -1) - (a.level.word ? LEVEL_WORDS.indexOf(a.level.word) : -1));
  for (const h of active) {
    const its = h.tabs.do.phases.flatMap((p) => p.items.map((it) => ({ ...it, phase: p.title })));
    if (!its.length) continue;
    lines.push(h.name + ' (' + (h.level.word ? h.level.word + ', ' : '') + h.label + '):');
    for (const it of its) { lines.push('- ' + it.text + ' [' + it.id + '; source: ' + (it.source.doc || it.source.short) + ']'); used.push(it.id); }
  }
  for (const h of g.hazards.filter((x) => x.status === 'not_relevant' || x.status === 'no_level')) lines.push(h.line);
  if (!used.length) lines.unshift(NO_MATCH);
  const cs = g.contacts.items.map((c) => c.name + ': ' + (c.phone || []).join(', ')).join('; ');
  if (cs) lines.push('Contacts: ' + cs + '.');
  lines.push(g.footer);
  return { answer: lines.join('\n'), items: used };
}
