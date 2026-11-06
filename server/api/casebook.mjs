/* ══════════════════════════════════════════════════════════════════════════
   THE CASEBOOK · v91.17.66 · v91.17.67 risk cards, portfolio, report families

   One case document per asset, and the three records it stands on.

   The client project (schema 3) lives in the browser and is saved as a file;
   this build wrote "when the backend exists, the same schema becomes their
   account data". This is that backend, local and durable (the JSON store):

     projects        the project document as the client saved it, by project_id
     assetFields     the provenance overlay: one record per (project, asset,
                     field) — value, provenance, source, note, who, when. The
                     platform never writes `estimated`; only a client can mark
                     a field estimated. Unrecorded fields the project carries
                     are `client_supplied`; fields it lacks are `missing`.
     interventions   the adaptation tracker: one record per intervention on an
                     asset — hazard, status, owner, due, risk before and
                     after (declared classes, each with provenance), evidence.
     caseSnapshots   a dated summary per asset, for year-to-year change.

   The case document is the decision chain the report families read:
     HAZARD → EXPOSURE → VULNERABILITY → CONDITION → CONSEQUENCE → RESPONSE →
     RESIDUAL → MONITORING, and a confidence panel. Hazard comes from the
   engines this server already runs (the national run for the asset's tehsil,
   the ensemble hazard feed at the point, the urban term, the climatology
   baseline). Everything client-side carries its provenance class. Nothing is
   estimated by the platform to fill a page: a missing field is `missing`.
   ══════════════════════════════════════════════════════════════════════════ */
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { unitAtPoint } from './unitresolve.mjs';   /* v91.17.70 */
import { utciAgnScore, utciClass } from './utci.mjs';   /* v91.17.252 · W2 · C3-8 · UTCI, the one public heat scale */

import { stationData, internalNames, label } from './refmode.mjs';
/* v91.17.70 · option 2: PMD material and circular verdicts are internal diagnostics (NIGRAAN_INTERNAL_REF=1).
   v91.17.71 · two switches: the station-derived DATA (calibration, station-anchored normals, the full lake inventory) is
   used by default (stationData()); supplier NAMES and the internal verdicts stay behind internalNames(); the customer text
   credits the data generically with label(key) from data/source-labels.json. */
const INTERNAL = () => internalNames();
const PROVENANCE = ['verified', 'client_supplied', 'estimated', 'missing'];
const STATUSES = ['proposed', 'planned', 'in_progress', 'done', 'cancelled'];
/* v91.17.252 · W2 · C3-9 · the tracker's risk classes are the five customer levels (riskClasses()); a record written on the v67 ladder
   (minimal / low / moderate / high / very_high, five classes in the same order) reads as the level at its position */
const LEGACY_RISK = ['minimal', 'low', 'moderate', 'high', 'very_high'];
/* the asset fields the chain reads, by layer; a field the project does not carry is reported missing, never invented */
const FIELDS = {
  exposure: ['name', 'asset_type', 'industry', 'subtype', 'latitude', 'longitude', 'elevation_m', 'province', 'district', 'location'],
  vulnerability: ['floor_elevation_m', 'construction_type', 'flood_protection', 'drainage_condition', 'backup_power', 'backup_duration_hr', 'cooling_type', 'year_built'],
  condition: ['condition_class', 'last_inspection', 'defects_open', 'maintenance_status'],
  consequence: ['criticality', 'maximum_tolerable_downtime_hr', 'recovery_time_hr'],   /* v91.17.266 · value, currency, replacement value and revenue left with the financial content */
};
/* v91.17.84 · the Master Asset Register template names some of these fields differently; the chain reads either spelling */
const ALIAS = { name: ['asset_name'], subtype: ['asset_subtype'], location: ['address', 'district'] };
const nowIso = () => new Date().toISOString();
/* v91.17.205 · a missing value stays missing: Number(null) and Number('') are 0, which sent assets without coordinates to 0°N 0°E */
const num = (v) => (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) ? NaN : Number(v);
const present = (v) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
const RUN_STALE_H = 3;   /* the national run is hourly; older than 3 h it is reported as stale, not served */

export function createCasebook(app) {
  const store = app.store;
  const clean = (s, n = 200) => String(s == null ? '' : s).slice(0, n);
  /* v91.17.252 · W2 · C3-7 · the one customer scale (data/hazard-scale.json, the map's), re-read when the file changes; null when absent.
     reachedFrom is the level of the response trigger (operationalLadder.Watch), the same "reached" line siterisk.mjs serves */
  let HS = null;
  const hazardScale = () => { try { const f = join(app.dataDir, 'hazard-scale.json'), m = statSync(f).mtimeMs; if (!HS || HS.m !== m) HS = { m, v: JSON.parse(readFileSync(f, 'utf8')) }; return HS.v; } catch (_) { return null; } };
  const scale = () => { const H = hazardScale(); return H && Array.isArray(H.levels) ? { levels: H.levels, reachedFrom: (H.operationalLadder && H.operationalLadder.Watch) || null, source: 'data/hazard-scale.json (levels; reachedFrom = operationalLadder.Watch, the response-trigger level)' } : null; };
  const levelOfScore = (x) => { const H = hazardScale(); const c = x == null || !H || !Array.isArray(H.screeningCuts) ? null : H.screeningCuts.find((k) => x >= k.min); return c ? c.level : null; };
  const isLevel = (w) => { const S = scale(); return !!(S && S.levels.includes(w)); };
  const rank = (w) => { const S = scale(); return S ? S.levels.indexOf(w) : -1; };
  const riskClasses = () => [...((scale() || {}).levels || []), 'unknown'];
  function riskClass(c) { const L = (scale() || {}).levels || [], k = String(c == null ? '' : c).trim().toLowerCase();
    return L.find((w) => w.toLowerCase() === k) || L[LEGACY_RISK.indexOf(k)] || 'unknown'; }

  /* ── projects ──────────────────────────────────────────────────────── */
  async function putProject(doc, who) {
    if (!doc || typeof doc !== 'object' || !doc.manifest || typeof doc.manifest !== 'object') throw new Error('not a NIGRAAN project document (no manifest)');
    const id = clean(doc.manifest.project_id || randomUUID(), 80); const ver = Number(doc.manifest.project_schema_version);
    if (!Number.isFinite(ver)) throw new Error('the manifest declares no schema version');
    const rec = { projectId: id, schemaVersion: ver, clientName: clean(doc.manifest.client_name, 120), assets: Array.isArray(doc.assets) ? doc.assets.length : 0, savedAt: nowIso(), savedBy: clean(who, 80), document: doc };
    /* v91.17.283 · WS3 · REPLACE IN ONE STEP: removeWhere() then insert() was two writes (a crash between them left the project deleted on
       disk; two saves at once could both insert). store.replace() swaps it in memory in one step and writes once. A client may send
       manifest.expected_saved_at (the savedAt it loaded): a project saved by someone else since is refused (409), not overwritten. */
    const old = store.find('projects', p => p.projectId === id);
    const exp = doc.manifest.expected_saved_at;
    if (exp != null && old && String(exp) !== String(old.savedAt)) throw Object.assign(new Error('project ' + id + ' was saved at ' + old.savedAt + ' by ' + (old.savedBy || 'someone') + ' after the copy this save is based on (' + exp + '); reload it first'), { status: 409, code: 'VERSION_CONFLICT' });
    if (exp != null && !old) throw Object.assign(new Error('project ' + id + ' is not on this server (expected_saved_at ' + exp + ' names a saved copy)'), { status: 409, code: 'VERSION_CONFLICT' });
    if (exp != null) delete doc.manifest.expected_saved_at;
    const r = typeof store.replace === 'function' ? await store.replace('projects', p => p.projectId === id, rec) : null;
    return { projectId: id, schemaVersion: ver, assets: rec.assets, savedAt: rec.savedAt, replaced: !!(r && r.replaced) };
  }
  function getProject(id) { return store.find('projects', p => p.projectId === id) || null; }
  /* v283.44 · the operator test namespace (_test-..., casesetaside.mjs) is never on the customer list */
  function listProjects() { return store.all('projects').filter(p => !String(p.projectId || '').startsWith('_test-')).map(p => ({ projectId: p.projectId, clientName: p.clientName, schemaVersion: p.schemaVersion, assets: p.assets, savedAt: p.savedAt })); }
  function assetOf(project, assetId) { const A = (project.document && project.document.assets) || []; return A.find(a => String(a.asset_id || a.name) === String(assetId)) || null; }

  /* ── the provenance overlay ────────────────────────────────────────── */
  async function setFields(projectId, assetId, fields, who) {
    const P = getProject(projectId); if (!P) throw new Error('no project ' + projectId);
    if (!assetOf(P, assetId)) throw new Error('no asset ' + assetId + ' in project ' + projectId);
    const out = [];
    for (const f of (Array.isArray(fields) ? fields : [])) {
      const field = clean(f.field, 60); if (!field) continue;
      const prov = PROVENANCE.includes(f.provenance) ? f.provenance : 'client_supplied';
      const rec = { id: randomUUID(), projectId, assetId: String(assetId), field, value: f.value === undefined ? null : f.value, provenance: prov, source: clean(f.source, 300), note: clean(f.note, 500), by: clean(who, 80), at: nowIso() };
      await store.replace('assetFields', x => x.projectId === projectId && x.assetId === String(assetId) && x.field === field, rec); out.push(rec);   /* v283 · WS3 · one step */
    }
    return out;
  }
  function fieldMap(projectId, assetId) { const m = {}; for (const r of store.filter('assetFields', x => x.projectId === projectId && x.assetId === String(assetId))) m[r.field] = r; return m; }
  /* every field the chain reads, with its provenance: the overlay wins, then the project's own value (client_supplied), else missing */
  function assetWithProvenance(P, asset) {
    const ov = fieldMap(P.projectId, asset.asset_id || asset.name); const layers = {}; const counts = { verified: 0, client_supplied: 0, estimated: 0, missing: 0 };
    for (const [layer, names] of Object.entries(FIELDS)) {
      layers[layer] = {};
      for (const n of names) {
        const o = ov[n]; let rec;
        if (o && present(o.value)) rec = { value: o.value, provenance: o.provenance, source: o.source || null, note: o.note || null, at: o.at };   /* v205 · an overlay without a value is not a value */
        else if (asset[n] !== undefined && asset[n] !== null && asset[n] !== '') rec = { value: asset[n], provenance: 'client_supplied', source: asset.record_source || 'client project document', note: null, at: P.savedAt };
        else if (ALIAS[n] && ALIAS[n].some(k => asset[k] !== undefined && asset[k] !== null && asset[k] !== '')) { const k = ALIAS[n].find(k => asset[k] !== undefined && asset[k] !== null && asset[k] !== '');   /* v91.17.84 · the template's column name */
          rec = { value: asset[k], provenance: 'client_supplied', source: asset.record_source || ('client project document (' + k + ')'), note: null, at: P.savedAt }; }
        else rec = { value: null, provenance: 'missing', source: null, note: null, at: null };
        counts[rec.provenance]++; layers[layer][n] = rec;
      }
    }
    /* limits are client thresholds: they travel as client_supplied unless overlaid */
    const limits = Array.isArray(asset.limits) ? asset.limits.map(l => ({ ...l, provenance: (l.authority && /manufacturer|design|inspection/i.test(l.authority)) ? 'verified' : 'client_supplied' })) : [];
    return { assetId: String(asset.asset_id || asset.name), layers, limits, counts, completeness: Math.round(100 * (1 - counts.missing / Object.values(FIELDS).reduce((a, v) => a + v.length, 0))) };
  }

  /* ── the adaptation tracker ────────────────────────────────────────── */
  function riskRec(x) { if (!x || typeof x !== 'object') return { class: 'unknown', provenance: 'missing', basis: null }; return { class: riskClass(x.class), provenance: PROVENANCE.includes(x.provenance) ? x.provenance : 'client_supplied', basis: clean(x.basis, 300) || null }; }
  async function upsertIntervention(body, who) {
    const projectId = clean(body.projectId, 80), assetId = clean(body.assetId, 120); if (!projectId || !assetId) throw new Error('projectId and assetId are required');
    const P = getProject(projectId); if (!P) throw new Error('no project ' + projectId); if (!assetOf(P, assetId)) throw new Error('no asset ' + assetId + ' in project ' + projectId);
    const old = body.id ? store.find('interventions', x => x.id === body.id) : null;
    const rec = { id: old ? old.id : randomUUID(), projectId, assetId, hazard: clean(body.hazard, 60) || null, title: clean(body.title, 200), description: clean(body.description, 2000) || null,
      status: STATUSES.includes(body.status) ? body.status : (old ? old.status : 'proposed'), owner: clean(body.owner, 120) || null, due: clean(body.due, 20) || null,
      /* v91.17.283 · WS3 (request of WS4) · no cost: financial content is out of scope since the owner's decision of 14 Oct; a cost sent is ignored */
      riskBefore: riskRec(body.riskBefore || (old && old.riskBefore)), riskAfter: riskRec(body.riskAfter || (old && old.riskAfter)),
      evidence: Array.isArray(body.evidence) ? body.evidence.slice(0, 50).map(e => clean(e, 200)) : (old ? old.evidence : []),
      history: [...(old ? old.history : []), { at: nowIso(), by: clean(who, 80), status: STATUSES.includes(body.status) ? body.status : (old ? old.status : 'proposed') }].slice(-50),
      createdAt: old ? old.createdAt : nowIso(), updatedAt: nowIso() };
    if (!rec.title) throw new Error('title is required');
    await store.replace('interventions', x => x.id === rec.id, rec); return rec;   /* v283 · WS3 · one step (a new id matches nothing: appended) */
  }
  function interventions(projectId, assetId) { return store.filter('interventions', x => x.projectId === projectId && (!assetId || x.assetId === String(assetId))).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1)
    .map(({ cost, ...x }) => ({ ...x, riskBefore: { ...x.riskBefore, class: riskClass(x.riskBefore && x.riskBefore.class) }, riskAfter: { ...x.riskAfter, class: riskClass(x.riskAfter && x.riskAfter.class) } })); }   /* v252 · W2 · C3-9 · a stored v67 class reads as its level */
  async function removeIntervention(id) { return store.removeWhere('interventions', x => x.id === id); }

  /* ── hazard, from the engines this server runs ──────────────────────── */
  /* v91.17.70 · the tehsil the asset lies IN (point in polygon, unitresolve.mjs), not the one with the nearest centroid: Hattar SEZ
     resolved to Taxila, Punjab, and 3 of 11 estates to a neighbour [measured, estate_resolver.py] */
  function unitFor(lat, lon) { const r = unitAtPoint(app, lat, lon); return r ? r.unit : null; }
  function latestRecord(unitId) {
    const runs = store.all('runs').filter(r => r.unit_level === 'tehsil' && ['complete', 'partial'].includes(r.status)).sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
    for (const run of runs) { const rec = store.find('records', x => x.runId === run.run_id && x.unitKey === unitId); if (rec) return { run, rec }; }
    return null;
  }
  async function hazardAt(lat, lon, elevM) {
    const u = unitFor(lat, lon); const out = { unit: u ? { id: u.unitId, name: u.name, district: u.district, province: u.province } : null, sources: [] };
    if (u) { const lr = latestRecord(u.unitId); if (lr) { out.nationalRun = { runId: lr.run.run_id, at: lr.run.started_at, validTime: lr.rec.validTime, leads: lr.rec.leads, biasCorrected: lr.rec.biasCorrected }; out.sources.push('national run ' + lr.run.run_id + ' (served forecast at the tehsil point)'); } }
    try { const h = await app.pool.hazard({ lat, lon, elevM, mm: 25 }); out.rainProbability = { aiInPool: !!(h.aiModels && h.aiModels.inPool), days: h.days.map(d => ({ date: d.date, ex: d.ex, p50: d.p50, p90: d.p90, detServed: d.detServed, systemAgreement: d.systemAgreement })), trigger25: h.trigger ? h.trigger.days : null, rule: h.rule }; out.sources.push('ensemble hazard feed (' + (h.aiModels && h.aiModels.inPool ? 'ECMWF ENS + WeatherNext 2, equal system' : 'ECMWF ENS; AI models shadow-only') + ')'); } catch (e) { out.rainProbabilityError = e.message; }
    try { if (app.fleetHistory && app.fleetHistory.ready()) { const z = elevM != null ? elevM : (app.fleetHistory.proxyElevM ? app.fleetHistory.proxyElevM(lat, lon) : null); const mosA = !!(app.mos && z != null && app.mos.adjust(lat, lon, z, Date.now(), 25).applied); const t = app.fleetHistory.urbanTerm(lat, lon, Date.now(), mosA);   /* v91.17.68 · the same table choice as /api/fleet/urban: the +offset table where the airport correction is on the point (audit C4) */ out.urbanTerm = t.applied ? { termC: t.termC, city: t.cityName, stations: t.stations, holdout: t.holdout, airportCorrectionOnPoint: mosA, table: t.table || null } : { applied: false, why: t.why }; if (t.applied) out.sources.push('MACH fleet urban term (Tier B)'); } } catch (e) { out.urbanTermError = e.message; }
    /* v91.17.252 · W2 · C3-8 · the heat baseline is on UTCI, the public heat scale: the hot-season 90th percentile of the daily maximum shade
       UTCI (data/utci-climatology.json via climatology.thresholds, moved onto the served basis like tx90), placed on a level by the map's
       mapping (utci.mjs utciAgnScore on the hazard-scale cuts). Air Tx90 stays beside it as supporting detail. */
    try { if (u && app.climatology && app.climatology.ready()) { let hot = null, hotShift = null, uPk = null;
      for (let doy = 1; doy <= 366; doy += 5) { const iso = new Date(Date.UTC(2021, 0, doy)).toISOString().slice(0, 10); const t = app.climatology.thresholds(u.unitId, iso); if (!t) continue;
        if (t.tx90 != null && (hot == null || t.tx90 > hot)) { hot = t.tx90; hotShift = t.basisShiftC ? t.basisShiftC.day : null; }
        if (t.u90 != null && (!uPk || t.u90 > uPk.u90)) uPk = { u90: t.u90, date: iso.slice(5) }; }
      const st = app.climatology.status ? app.climatology.status() : {}, UC = app.climatology.utciClim ? app.climatology.utciClim() : null, uc = UC && UC.units && UC.units[u.unitId];
      out.climatology = { hotSeasonUtci90: uPk ? uPk.u90 : null, hotSeasonUtciDate: uPk ? uPk.date : null, utciClass: uPk ? utciClass(uPk.u90) : null, utciLevel: uPk ? levelOfScore(utciAgnScore(uPk.u90)) : null,
        utciPeriod: UC ? UC.period || null : null, utciDaysPerYear: uc && Array.isArray(uc.daysPerYear) && Array.isArray(UC.levels) ? Object.fromEntries(UC.levels.map((w, i) => [w, uc.daysPerYear[i]])) : null,
        hotSeasonTx90: hot, stationCalibrated: !!hotShift, tier: hotShift ? 'B' : null,
        basis: 'shade UTCI: ERA5 daily fields ' + ((UC && UC.period) || '') + ' (data/utci-climatology.json); air Tx90: ERA5 ' + ((st.periods || {}).tx90 || st.period || '1991-2020') + ' daily archive at the tehsil elevation' + (hotShift ? ', moved onto the served basis by ' + label('calibration') + ' (tier B)' : '') + ' (data/climatology.json); sampled every 5th day' };
      out.sources.push('climatology baseline (UTCI heat stress)'); } } catch (e) { out.climatologyError = e.message; }
    /* v91.17.252 · W2 · C3-7 · the levels the map draws for this tehsil, from the one engine (/api/levels/unit): no second set of cuts */
    try { if (u && app.engine) { const E = app.engine.unit(u.unitId, false); out.mapLevels = E && E.ready ? mapLevelsOf(E) : { ready: false, why: (E && E.why) || 'the engine has not reported' }; if (out.mapLevels.ready) out.sources.push('map levels (the server engine, run ' + String(E.at || '').slice(0, 16) + 'Z)'); } } catch (e) { out.mapLevels = { ready: false, why: e.message }; }
    try { if (u && app.terrain && app.terrain.giri) { const g = app.terrain.giri(u.unitId); if (g && g.ready && g.shareHigh != null) { out.landslideSusceptibility = { giriShareHigh: g.shareHigh, giriMeanClass: g.meanClass, tier: 'independent map, Screening' }; out.sources.push('GIRI susceptibility (UNEP-GRID/NGI)'); } } } catch (e) {}
    try { if (u && app.glof && app.glof.eventsFor) { const R = app.glof.register(); const near = R && R.lakes ? R.lakes.filter(l => l.unitUid === u.unitId) : []; if (near.length) { const withEvents = near.map(l => ({ id: l.id, tier: l.tier, events: app.glof.eventsFor(l.id) })).filter(x => x.events); out.glof = { openRegister: /open/i.test(String((R && R.version) || '')), registerLakesInUnit: near.length, lakesWithDocumentedOutburst: withEvents.length, examples: withEvents.slice(0, 3).map(x => ({ lake: x.id, events: x.events.events, lastYear: x.events.lastYear })) }; out.sources.push('GLOF register + HMAGLOFDB'); } } } catch (e) {}
    return out;
  }

  /* v91.17.252 · W2 · C3-7 · the engine's answer for one tehsil as levels per layer and day, and each layer's highest level; a layer whose words
     are not the five levels (runoff retention) and the states (no data, not applicable) are kept per day and never peak */
  function mapLevelsOf(E) {
    const layers = {};
    for (const d of E.days || []) for (const [k, v] of Object.entries(d.layers || {})) {
      const L = layers[k] || (layers[k] = { name: v.name, byDay: [], peak: null }); L.byDay.push({ day: d.day, date: d.date, word: v.word });
      if (isLevel(v.word) && (!L.peak || rank(v.word) > rank(L.peak.word))) L.peak = { word: v.word, day: d.day, date: d.date }; }
    for (const k of Object.keys(layers)) if (!layers[k].byDay.some((x) => isLevel(x.word))) delete layers[k];
    return { ready: true, unit: E.unit, at: E.at, stale: !!E.stale, days: (E.days || []).map((d) => ({ day: d.day, date: d.date })), layers, scale: scale() };
  }
  /* the layers at a level above the scale's first (Normal), highest first */
  const raisedLevels = (M) => !M || !M.ready ? [] : Object.entries(M.layers).filter(([, L]) => L.peak && rank(L.peak.word) > 0).map(([k, L]) => ({ layer: k, name: L.name, word: L.peak.word, day: L.peak.day })).sort((a, b) => rank(b.word) - rank(a.word));

  /* ── the case document ─────────────────────────────────────────────── */
  async function document({ projectId, assetId }) {
    const P = getProject(projectId); if (!P) return { ok: false, why: 'no project ' + projectId + ' on this server (PUT /api/case/project with the project document first)' };
    const asset = assetOf(P, assetId); if (!asset) return { ok: false, why: 'no asset ' + assetId + ' in project ' + projectId };
    const A = assetWithProvenance(P, asset); const X = A.layers.exposure; const lat = num(X.latitude.value), lon = num(X.longitude.value), elev = num(X.elevation_m.value);   /* v205 · one authoritative record: the coordinates the chain shows are the ones it calculates with */
    const coordOk = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
    const hazard = coordOk ? await hazardAt(lat, lon, Number.isFinite(elev) ? elev : null) : { why: (Number.isFinite(lat) || Number.isFinite(lon)) ? 'the asset coordinates are not valid' : 'the asset has no coordinates', sources: [] };
    /* v91.17.207 · phase B · asset-level river flood: the depth of an undefended 1-in-10 ... 500 river flood at the asset's own cell (JRC / GloFAS)
       against its floor height when the client records floor_elevation_m (height of the ground floor above the ground) */
    if (coordOk && app.floodDepth) { try { const fe = A.layers.vulnerability.floor_elevation_m; const fl = fe && present(fe.value) ? num(fe.value) : NaN;
      hazard.riverFloodDepth = app.floodDepth.at(lat, lon, Number.isFinite(fl) ? fl : null); if (hazard.riverFloodDepth) hazard.riverFloodDepth.floorProvenance = Number.isFinite(fl) ? fe.provenance : 'missing'; } catch (_) {} }
    const iv = interventions(projectId, A.assetId);
    const byStatus = {}; for (const s of STATUSES) byStatus[s] = iv.filter(x => x.status === s).length;
    const declaredResidual = iv.filter(x => x.status === 'done' && x.riskAfter && x.riskAfter.class !== 'unknown').map(x => ({ hazard: x.hazard, before: x.riskBefore.class, after: x.riskAfter.class, provenance: x.riskAfter.provenance, basis: x.riskAfter.basis }));
    const runAgeH = hazard.nationalRun && hazard.nationalRun.at ? (Date.now() - Date.parse(hazard.nationalRun.at)) / 3600e3 : null;
    const runFresh = runAgeH != null && runAgeH <= RUN_STALE_H;
    const hazardStatus = !hazard.nationalRun ? 'no run for this unit' : runFresh ? 'served' : ('stale: the latest national run is ' + Math.round(runAgeH) + ' h old');
    const agreement = hazard.rainProbability && hazard.rainProbability.days[0] ? hazard.rainProbability.days[0].systemAgreement : null;
    const confidence = {
      observationalCoverage: hazard.urbanTerm && hazard.urbanTerm.termC != null ? 'fleet-covered city (Tier B history at the point)' : (hazard.unit ? 'tehsil-level served forecast; no fleet station within reach' : 'no unit'),
      modelAgreement: agreement || 'not read',
      assetDataQuality: A.counts, assetCompleteness: A.completeness,
      engineeringInformation: A.layers.condition.condition_class.provenance === 'missing' ? 'no condition record' : A.layers.condition.condition_class.provenance,
      hazardEvidence: !coordOk ? 'none: no valid coordinates' : runFresh ? 'current served run' : (hazard.nationalRun ? 'stale run' : 'no served run'),
      overall: (A.completeness >= 70 && A.counts.verified > 0 && coordOk && runFresh) ? 'moderate' : 'low',
      rule: 'v205 · asset quality and hazard evidence are judged separately; overall is moderate only when at least 70 % of the chain fields are present, at least one is verified AND the hazard rests on a current served run at valid coordinates; high needs an inspection-verified condition and a fleet-covered point (not yet reachable in this build)'
    };
    return { ok: true, schema: 'agn.case-document.v1', builtAt: nowIso(), snapshot: (() => { try { return app.snapshot ? app.snapshot.id() : null; } catch (_) { return null; } })(), project: { id: P.projectId, client: P.clientName, savedAt: P.savedAt }, asset: { id: A.assetId, name: asset.name || A.assetId, type: asset.asset_type || null, lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null, elevM: Number.isFinite(elev) ? elev : null },
      chain: {
        hazard: { ...hazard, status: hazardStatus, runAgeHours: runAgeH == null ? null : Math.round(runAgeH * 10) / 10 },
        exposure: A.layers.exposure, vulnerability: A.layers.vulnerability, condition: A.layers.condition, consequence: A.layers.consequence, limits: A.limits,
        response: { interventions: iv, byStatus, note: 'each intervention carries its own risk-before and risk-after as declared classes with provenance; the platform does not compute residual risk' },
        residual: { declared: declaredResidual, note: declaredResidual.length ? 'declared by the client on completed interventions' : 'no completed intervention declares a residual class' },
        monitoring: { snapshots: store.filter('caseSnapshots', s => s.projectId === projectId && s.assetId === A.assetId).length, lastSnapshot: (store.filter('caseSnapshots', s => s.projectId === projectId && s.assetId === A.assetId).sort((a, b) => b.at < a.at ? -1 : 1)[0] || {}).at || null }
      },
      confidence,
      /* v91.17.67 · the standard risk cards and the snapshot history travel with the document, so a report family prints them without a second read */
      riskCards: riskCards(hazard, A), history: history(projectId, A.assetId),
      provenanceClasses: PROVENANCE, riskClasses: riskClasses(), statuses: STATUSES,
      sources: (() => { try { return { line: app.sources.methodsLine(), at: '/api/sources' }; } catch (_) { return null; } })(),   /* v91.17.70 · the methods line */
      rule: 'HAZARD from the engines (map levels, served forecast, ensemble probability, urban term, UTCI climatology, GIRI, GLOF record); EXPOSURE, VULNERABILITY, CONDITION, CONSEQUENCE from the client record with a provenance class on every field, missing where absent; RESPONSE and RESIDUAL from the adaptation tracker; nothing estimated by the platform' };
  }

  /* ── the standard risk card · v91.17.67 ────────────────────────────────
     One card per hazard source the chain holds, in one shape, so every report family prints the same card and a reader
     can drill from the card to the evidence behind it. A card is only made from a value the engines returned; a source
     that did not answer is a card with `value: null` and the reason, never a filled-in guess. Evidence classes follow the
     report pages: OBSERVED / MODELLED / CALCULATED / CLIENT SUPPLIED; `validated` is the skill sheet's verdict for that
     source in Pakistan (validated / partly validated / not validated). */
  function riskCards(hazard, A) {
    const cards = []; const h = hazard || {};
    const card = (o) => cards.push({ id: o.id, hazard: o.hazard, headline: o.headline, value: o.value === undefined ? null : o.value, unit: o.unit || null, evidenceClass: o.evidenceClass, validated: o.validated, source: o.source, method: o.method, asOf: o.asOf || null, provenance: o.provenance || 'platform', limitation: o.limitation, drill: o.drill || [] });
    /* v91.17.252 · W2 · C3-7 · first card: the levels the map draws for this tehsil (the one engine), so a report and the map read the same */
    const M = h.mapLevels, up = raisedLevels(M), S = scale(), dayW = (d) => d ? 'day +' + d : 'today';
    card({ id: 'mapLevels', hazard: 'hazard levels on the map, this tehsil', headline: M && M.ready ? (up.length ? up.map((r) => r.name + ' ' + r.word + ' (' + dayW(r.day) + ')').join(' · ') : 'every hazard at ' + (S ? S.levels[0] : 'the first level') + ' on the map, today to day +' + Math.max(0, M.days.length - 1)) + (M.stale ? ' · the engine run is stale' : '') : 'map levels not available: ' + ((M && M.why) || (h.unit ? 'the engine is not loaded' : 'no unit resolved for this point')),
      value: M && M.ready ? { levels: Object.fromEntries(Object.entries(M.layers).map(([k, L]) => [k, L.peak ? { name: L.name, word: L.peak.word, day: L.peak.day } : { name: L.name, word: L.byDay[0].word }])), stale: M.stale, reachedFrom: S ? S.reachedFrom : null } : null, unit: 'level',
      evidenceClass: 'MODELLED', source: M && M.ready ? 'the server engine that draws the map, run ' + String(M.at || '').slice(0, 16) + 'Z' : 'none', method: 'each hazard on its own index, placed on the five levels of data/hazard-scale.json; the highest level over the days the engine derives (0 to +' + (M && M.ready ? Math.max(0, M.days.length - 1) : 3) + ')', asOf: M && M.ready ? M.at : null,
      limitation: 'tehsil-level screening, not a site survey; river flooding, GLOF and drought are derived for today only', drill: ['/api/levels/unit?unit=' + (h.unit ? h.unit.id : ''), 'data/hazard-scale.json'] });
    const lk = h.nationalRun && h.nationalRun.leads ? (h.nationalRun.leads['24'] ? '24' : (h.nationalRun.leads['0'] ? '0' : null)) : null;   /* v205 · the label states the lead actually used */
    const l = lk ? h.nationalRun.leads[lk] : null;
    card({ id: 'served24', hazard: lk === '0' ? 'weather, now' : 'weather, next 24 h', headline: l ? `${l.temperature_2m} °C · ${l.precipitation} mm · gust ${l.wind_gusts_10m} km/h at +${lk} h` : (h.nationalRun ? 'run held, no +24 h lead' : 'no national run for this unit'), value: l ? { temperatureC: l.temperature_2m, precipitationMm: l.precipitation, gustKmh: l.wind_gusts_10m } : null,
      evidenceClass: 'MODELLED', validated: 'partly validated', source: h.nationalRun ? 'national run ' + h.nationalRun.runId + ' at ' + (h.nationalRun.at || '').slice(0, 16) + 'Z, tehsil point ' + (h.unit ? h.unit.name : '') : 'none', method: INTERNAL() ? 'MACH forecast (best-match blend) at the tehsil point, station-corrected where the envelope allows' + (h.nationalRun && h.nationalRun.biasCorrected ? ' (correction applied)' : '') : 'MACH forecast at the tehsil point on the zone temperature basis (one model per zone, chosen by verification), at the settlement height' + (!stationData() ? '; no station-fitted correction' : (h.nationalRun && h.nationalRun.biasCorrected ? ', with ' + label('calibration') + ' applied (tier B)' : '; ' + label('calibration') + ' applies where the calibration envelope allows')),   /* v91.17.70 · v91.17.71: the station calibration is used again (stationData()); its supplier is not named */ asOf: h.nationalRun ? h.nationalRun.validTime : null,
      limitation: 'point rain is a modelled total, not a gauge', drill: ['/api/national/latest', 'skill sheet: forecast_verification, bias_correction'] });
    const t = h.rainProbability && h.rainProbability.trigger25 ? h.rainProbability.trigger25[0] : null;
    card({ id: 'rain25', hazard: 'heavy rain, day 1', headline: t ? `P(24 h > 25 mm) ${Math.round(100 * (t.probability || 0))} % · served total ${t.detServed} mm · ${t.verdict && t.verdict.agreement}` : (h.rainProbabilityError || 'ensemble feed did not answer'), value: t ? { probability: t.probability, servedMm: t.detServed, agreement: t.verdict && t.verdict.agreement, date: t.date } : null, unit: 'probability',
      evidenceClass: 'MODELLED', validated: 'not validated', source: 'ensemble hazard feed: ' + (h.rainProbability && h.rainProbability.aiInPool ? 'ECMWF ENS + WeatherNext 2, equal system weight' : 'ECMWF ENS (AI models shadow-only)'), method: 'member share above the threshold per lead day; verdict compares the served single run with the ensembles', asOf: t ? t.date : null,
      limitation: 'the share of ensemble members; 25 mm is a screening trigger, not a site design value', drill: ['/api/point (part poolHazard)', 'skill sheet: hazard_exceedance_feed'] });
    const fd = h.riverFloodDepth;
    if (fd) card({ id: 'riverFloodDepth', hazard: 'river flood at the asset', headline: fd.ready ? fd.summary : 'not assessed: ' + fd.why, value: fd.ready ? { depthByReturnPeriodM: Object.fromEntries(fd.rows.map((r) => [r.returnPeriod, r.depthM])), floorM: fd.floorM, floorReachedFrom: fd.floorReachedFrom } : null, unit: 'm',
      evidenceClass: 'MODELLED', validated: 'partly validated', source: fd.ready ? fd.source : 'none', method: 'depth at the asset\'s ~90 m cell per return period; water above the floor = depth minus the floor height (' + (fd.floorProvenance || 'missing') + ')', asOf: null,
      limitation: fd.ready ? fd.limits : 'maps not installed', drill: ['/api/flood/depth', 'data/flood-depth/index.json check: hit rate 0.79, AUC 0.83 against the mapped 2010 flood'] });
    const u = h.urbanTerm;
    card({ id: 'urbanHeat', hazard: 'urban heat', headline: u && u.termC != null ? `${u.termC > 0 ? '+' : ''}${u.termC} °C fleet urban term on the served temperature (${u.city}, ${u.stations} stations)` : (u && u.why ? 'not applied: ' + u.why : 'fleet history not loaded'), value: u && u.termC != null ? { termC: u.termC, city: u.city, stations: u.stations, holdout: u.holdout } : null, unit: '°C',
      evidenceClass: 'OBSERVED', validated: 'partly validated', source: 'MACH fleet history paired with the model (Tier B), leave-one-station-out holdout', method: 'city residual by hour, elevation-adjusted, clamped by the urban-heat map', asOf: null,
      limitation: 'consumer-grade roof-sited stations; the term is a city-scale correction, not a street-level measurement', drill: ['/api/fleet/urban', 'skill sheet: urban_fleet_term, fleet_history_verification'] });
    const c = h.climatology, cu = c && c.hotSeasonUtci90 != null;
    /* v91.17.252 · W2 · C3-8 · heat is on UTCI; the air Tx90 is supporting detail */
    card({ id: 'hotSeason', hazard: 'heat stress, seasonal baseline (UTCI)', headline: cu ? `UTCI ${c.hotSeasonUtci90} °C in shade in the hottest weeks (${String(c.utciClass || '').toLowerCase()}) · ${c.utciLevel || 'no level'}` + (c.hotSeasonTx90 != null ? ` · air Tx90 ${c.hotSeasonTx90} °C` : '') : (c ? 'no heat-stress climatology for this unit' : 'climatology not loaded'),
      value: cu ? { utci90C: c.hotSeasonUtci90, utciClass: c.utciClass, level: c.utciLevel, date: c.hotSeasonUtciDate, daysPerYear: c.utciDaysPerYear, tx90C: c.hotSeasonTx90 } : null, unit: '°C UTCI',
      evidenceClass: 'CALCULATED', source: 'ERA5 daily fields ' + ((c && c.utciPeriod) || '') + ' at the tehsil elevation (Copernicus C3S), shade UTCI by the Bröde et al. (2012) polynomial' + (c && c.stationCalibrated ? ', ' + label('calibration') + ' from ' + label('network') + ' (tier B)' : ''),
      method: '90th percentile of the daily maximum shade UTCI, highest over the year (every fifth day); class after Błażejczyk et al. (2013); level by the UTCI mapping of data/utci.json on the hazard-scale cuts, as the map; air Tx90 as supporting detail (' + ((c && c.basis) || 'climatology') + ')', asOf: null,
      limitation: 'a climate baseline, not a forecast; shade UTCI (sun adds several degrees in the open)', drill: ['/api/climatology/thresholds', 'skill sheet: climatology_baseline'] });
    const g = h.landslideSusceptibility;
    card({ id: 'landslide', hazard: 'landslide susceptibility', headline: g ? `${Math.round(100 * g.giriShareHigh)} % of the tehsil in GIRI class 4–5 (mean class ${g.giriMeanClass})` : 'no GIRI summary for this unit', value: g ? { shareHigh: g.giriShareHigh, meanClass: g.giriMeanClass } : null, unit: 'share',
      evidenceClass: 'CALCULATED', validated: 'not validated', source: 'GIRI rainfall-triggered susceptibility (UNEP-GRID / NGI), 12 arc-second, zonal per tehsil', method: 'share of cells in class 4–5', asOf: null,
      limitation: 'AUC 0.695 against the NASA catalogue (gate 0.7 not passed): Screening tier; a global terrain ranking, not a site slope survey', drill: ['/api/landslide/giri', 'skill sheet: giri_landslide_susceptibility'] });
    const gl = h.glof;
    card({ id: 'glof', hazard: 'glacial lake outburst', headline: gl ? `${gl.registerLakesInUnit} register lake(s) in the unit, ${gl.lakesWithDocumentedOutburst} with a documented outburst` : (h.unit ? 'no register lake in this unit (register consulted)' : 'no unit resolved for this point'), value: gl ? { lakes: gl.registerLakesInUnit, withEvents: gl.lakesWithDocumentedOutburst, examples: gl.examples } : (h.unit ? { lakes: 0, withEvents: 0 } : null), unit: 'count',
      evidenceClass: 'OBSERVED', validated: 'validated', source: INTERNAL() ? 'PMD 2024 lake register + HMAGLOFDB documented events (Steiner et al. 2023)' : (gl && gl.openRegister === false ? label('lakeInventory') : 'glacial-lake register (Hi-MAG, Chen et al. 2021, CC BY 4.0)') + ' + HMAGLOFDB documented events (Steiner et al. 2023, CC BY 4.0)',   /* v91.17.71 · the register the GLOF module serves, credited generically */ method: 'lakes whose outline sits in the tehsil; events joined within 3 km', asOf: null,
      limitation: 'a record of what has burst, not a probability that it will', drill: ['/api/glof/events', 'skill sheet: glof_documented_events'] });
    if (A) card({ id: 'assetRecord', hazard: 'asset record (exposure → consequence)', headline: `${A.completeness} % of the chain fields present · ${A.counts.verified} verified · ${A.counts.client_supplied} client-supplied · ${A.counts.estimated} estimated · ${A.counts.missing} missing`, value: { completeness: A.completeness, counts: A.counts }, unit: '%',
      evidenceClass: 'CLIENT SUPPLIED', validated: 'not validated', source: 'client project document and the provenance overlay', method: 'count of fields by provenance class; nothing filled in by the platform', asOf: null, provenance: 'client',
      limitation: 'a field marked verified is verified by the authority the client names, not by NIGRAAN', drill: ['/api/case/asset', 'skill sheet: case_document'] });
    /* ══ v91.17.70 · NO "VALIDATED" VERDICT ON A CUSTOMER CARD ════════════════════════════════════════════════════
       The verdicts came from the skill sheet: forecasts scored against their own reanalysis (circular, chair_crossexam
       S15) or against PMD records (internal only under option 2). A customer card carries the evidence class and, for the
       served weather, the source-chain tier (A: a MACH station measures it; B/C: model at the settlement height / with
       terrain). The verdicts return, marked internal, with NIGRAAN_INTERNAL_REF=1. */
    let fb = null; try { const U = h.unit && (app.units.tehsil || []).find((x) => x.unitId === h.unit.id); fb = U && app.report && app.report.forecastBasis ? app.report.forecastBasis(U) : null; } catch (_) { fb = null; }
    for (const k of cards) {
      if (INTERNAL()) { k.validated = k.validated ? 'internal diagnostic: ' + k.validated : k.validated; continue; }
      delete k.validated;
      k.drill = (k.drill || []).map((d) => String(d).replace(/^skill sheet: /, 'methods: ')).concat(['sources: /api/sources']);
      if (k.id === 'served24' && fb) k.quality = { tier: fb.tier, mark: fb.mark, label: fb.label, basis: fb.basis, mach: fb.mach };
      if (k.id === 'urbanHeat') k.quality = { label: 'measured by the MACH fleet in this city' };
    }
    return cards;
  }

  /* ── the portfolio · every asset of a project on one page · v91.17.67 ───────────────────────────────── */
  async function portfolio(projectId) {
    const P = getProject(projectId); if (!P) return { ok: false, why: 'no project ' + projectId + ' on this server' };
    const assets = (P.document && P.document.assets) || []; const rows = [];
    const CAP = 250;   /* v205 · every asset up to 250 is documented; any beyond are listed as not processed, never dropped silently */
    for (const a of assets.slice(CAP)) rows.push({ assetId: String(a.asset_id || a.name), name: a.name, ok: false, why: 'not processed: the portfolio report covers the first ' + CAP + ' assets' });
    for (const a of assets.slice(0, CAP)) {
      const d = await document({ projectId, assetId: a.asset_id || a.name }); if (!d.ok) { rows.push({ assetId: String(a.asset_id || a.name), name: a.name, ok: false, why: d.why }); continue; }
      /* v91.17.252 · W2 · C3-7 · a flag is a map level at or above the response-trigger level (hazard-scale.json) on a current engine run; the
         rain-share, urban-term, Tx90 and GIRI cuts (0.40 / +1 °C / 0.30, no source) are gone. Records that are not forecasts are `standing`. */
      const h = d.chain.hazard, M = h.mapLevels, S = scale(), up = raisedLevels(M), fd = h.riverFloodDepth;
      const flagsWhy = !M || !M.ready ? 'map levels not available' + (M && M.why ? ': ' + M.why : '') : M.stale ? 'the engine run is stale; no flag is raised from it' : !S || !S.reachedFrom ? 'no level scale (data/hazard-scale.json)' : null;
      const flags = flagsWhy ? [] : up.filter((r) => rank(r.word) >= rank(S.reachedFrom)).map((r) => r.name + ' ' + r.word + ' (' + (r.day ? 'day +' + r.day : 'today') + ')');
      const standing = [];
      if (fd && fd.ready && fd.floorReachedFrom) standing.push('river flood map reaches the floor from the 1-in-' + fd.floorReachedFrom + ' flood');
      else if (fd && fd.ready && fd.floorM == null && fd.firstWetReturnPeriod) standing.push('wet in the 1-in-' + fd.firstWetReturnPeriod + ' river flood map (floor height not recorded)');
      if (h.glof && h.glof.lakesWithDocumentedOutburst > 0) standing.push('documented glacial-lake outburst in the unit');
      const bs = d.chain.response.byStatus; const open = (bs.proposed || 0) + (bs.planned || 0) + (bs.in_progress || 0);
      rows.push({ assetId: d.asset.id, name: d.asset.name, type: d.asset.type, unit: h.unit ? h.unit.name : null, district: h.unit ? h.unit.district : null, province: h.unit ? h.unit.province : null, coordinates: d.asset.lat != null, completeness: d.confidence.assetCompleteness, verified: d.confidence.assetDataQuality.verified, missing: d.confidence.assetDataQuality.missing, overall: d.confidence.overall, agreement: d.confidence.modelAgreement,
        levels: M && M.ready ? up : null,
        flags, flagsWhy, standing, interventions: { open, done: bs.done || 0, cancelled: bs.cancelled || 0 }, residualDeclared: d.chain.residual.declared.length, lastSnapshot: d.chain.monitoring.lastSnapshot, sources: h.sources.length, ok: true });
    }
    const ok = rows.filter(r => r.ok);
    const summary = { assets: assets.length, documented: ok.length, notDocumented: rows.filter(r => !r.ok).map(r => ({ assetId: r.assetId, name: r.name, why: r.why })), withCoordinates: ok.filter(r => r.coordinates).length, meanCompleteness: ok.length ? Math.round(ok.reduce((s, r) => s + r.completeness, 0) / ok.length) : null, overall: { low: ok.filter(r => r.overall === 'low').length, moderate: ok.filter(r => r.overall === 'moderate').length, high: ok.filter(r => r.overall === 'high').length },
      flagged: ok.filter(r => r.flags.length).length, interventionsOpen: ok.reduce((s, r) => s + r.interventions.open, 0), interventionsDone: ok.reduce((s, r) => s + r.interventions.done, 0), snapshots: ok.filter(r => r.lastSnapshot).length };
    const S = scale();
    return { ok: true, schema: 'agn.case-portfolio.v1', builtAt: nowIso(), project: { id: P.projectId, client: P.clientName, savedAt: P.savedAt }, summary, assets: rows, scale: S,
      rule: 'one row per asset from its own case document; levels are the map\'s (the server engine, placed on data/hazard-scale.json), the highest over the days the engine derives; a flag is a hazard at ' + ((S && S.reachedFrom) || 'the response-trigger level') + ' or above on a current engine run; standing items are records (the river flood map at the floor, a documented outburst), not forecasts; it is not a ranking: ordering is by flags then by missing fields, never by an index compared across places' };
  }

  /* ── the report families over the case document · v91.17.67 ────────────────────────────────────────
     What each family needs from the document, and which are gated. The client prints the pages; the gate is decided here
     so the sheet, the harness and the UI read one rule. */
  const FAMILIES = {
    caseAsset: { title: 'Asset case report', audience: 'risk / engineering / site management', needs: ['case document with coordinates'], gated: false, standards: ['ISO 14091 (impact, vulnerability and risk assessment)', 'ISO 31000 (risk treatment record)', 'ISO 55001 (asset condition and intervention record)'] },
    casePortfolio: { title: 'Portfolio case report', audience: 'risk / management', needs: ['project on the server with two or more assets'], gated: false, standards: ['ISO 31000', 'ISO 55001'] },
    caseBoard: { title: 'Board brief', audience: 'board / executive', needs: ['project on the server; snapshots for the year-on-year line'], gated: false, standards: ['ISO 31000 (risk reporting)'] }
  };
  function families() { return { families: FAMILIES, rule: 'every family prints what the project holds, section by section, and names the input a missing section needs; nothing in any family is estimated by the platform' }; }

  /* ── snapshots: what changed year to year ──────────────────────────── */
  async function snapshot({ projectId, assetId, label }, who) {
    const d = await document({ projectId, assetId }); if (!d.ok) throw new Error(d.why);
    const h = d.chain.hazard; const l0 = h.nationalRun && h.nationalRun.leads ? h.nationalRun.leads['24'] || h.nationalRun.leads['0'] : null;
    const rec = { id: randomUUID(), projectId, assetId: d.asset.id, at: nowIso(), by: clean(who, 80), label: clean(label, 120) || null,
      summary: { completeness: d.confidence.assetCompleteness, counts: d.confidence.assetDataQuality, interventions: d.chain.response.byStatus, residualDeclared: d.chain.residual.declared.length, rainP25Day1: h.rainProbability && h.rainProbability.trigger25 ? h.rainProbability.trigger25[0].probability : null, servedDay1: l0 ? { temperature: l0.temperature_2m, precipitation: l0.precipitation, gust: l0.wind_gusts_10m } : null, urbanTermC: h.urbanTerm && h.urbanTerm.termC != null ? h.urbanTerm.termC : null, hotSeasonTx90: h.climatology ? h.climatology.hotSeasonTx90 : null, hotSeasonUtci90: h.climatology ? h.climatology.hotSeasonUtci90 : null, giriShareHigh: h.landslideSusceptibility ? h.landslideSusceptibility.giriShareHigh : null,
        mapLevels: h.mapLevels && h.mapLevels.ready ? Object.fromEntries(raisedLevels(h.mapLevels).map((r) => [r.name, r.word])) : null, overall: d.confidence.overall } };   /* v252 · W2 · C3-7/C3-8 */
    await store.insert('caseSnapshots', rec); return rec;
  }
  function history(projectId, assetId) {
    const S = store.filter('caseSnapshots', s => s.projectId === projectId && s.assetId === String(assetId)).sort((a, b) => a.at < b.at ? -1 : 1);
    const changes = []; for (let i = 1; i < S.length; i++) { const a = S[i - 1].summary, b = S[i].summary; const diff = {}; for (const k of ['completeness', 'residualDeclared', 'urbanTermC', 'hotSeasonUtci90', 'hotSeasonTx90', 'giriShareHigh', 'mapLevels', 'overall']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff[k] = { from: a[k], to: b[k] }; if (JSON.stringify(a.interventions) !== JSON.stringify(b.interventions)) diff.interventions = { from: a.interventions, to: b.interventions }; changes.push({ from: S[i - 1].at, to: S[i].at, changed: diff }); }
    return { snapshots: S, changes, note: 'a change is named by the field that moved; the hazard side moves with the served forecast and the data, the response side with the tracker' };
  }

  function status() { return { families: Object.keys(FAMILIES), projects: store.all('projects').length, assetFields: store.all('assetFields').length, interventions: store.all('interventions').length, snapshots: store.all('caseSnapshots').length, provenanceClasses: PROVENANCE, statuses: STATUSES, riskClasses: riskClasses(), chainFields: FIELDS }; }

  /* v91.17.252 · W2 · every card the case document can carry (each source asked, none answering; the river-depth card is made when the maps
     are installed), and the flag rule the portfolio applies: for the skill sheet and the harness, so neither holds a typed count */
  function cardCatalogue() { return riskCards({ riverFloodDepth: { ready: false, why: 'catalogue' } }, { completeness: 0, counts: { verified: 0, client_supplied: 0, estimated: 0, missing: 0 } }).map((k) => ({ id: k.id, hazard: k.hazard, evidenceClass: k.evidenceClass })); }
  function flagRule() { const S = scale(); return { reachedFrom: S ? S.reachedFrom : null, source: S ? S.source : null, levels: S ? S.levels : null, stale: 'no flag from a stale engine run', standing: ['river flood map at the floor', 'documented glacial-lake outburst'] }; }
  return { putProject, getProject, listProjects, setFields, assetWithProvenance, upsertIntervention, interventions, removeIntervention, document, snapshot, history, status, hazardAt, riskCards, cardCatalogue, flagRule, portfolio, families, FAMILIES };
}
