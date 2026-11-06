import { ApiError, newId, nowIso, hashStable, SERVICE_VERSION } from './core.mjs';
import { heatIndexC, heatIndexDetail } from './heatindex.mjs';
import { wetBulbC, r1 as r1p } from './psychro.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/* v91.17.279 · CLAIMS279 S-10/P11 · the level word of a 0-100 screening index comes from data/hazard-scale.json screeningCuts (the map's
   ladder: 65 = High, 82 = Severe), never from a number typed here; null when the file cannot be read */
function screeningWord(dataDir, score) {
  try { const S = JSON.parse(readFileSync(join(dataDir || join(process.cwd(), 'data'), 'hazard-scale.json'), 'utf8'));
    const c = (S.screeningCuts || []).filter((x) => x && Number.isFinite(x.min)).sort((a, b) => b.min - a.min).find((x) => score >= x.min);
    return c ? c.level : null; } catch (_) { return null; }
}

/* ── physically standard human-heat formulas ─────────────────────────── */
/* v91.17.127 · A-03 · one heat index (server/api/heatindex.mjs) */
/* v91.17.128 · A-03 · the one psychrometric wet bulb (psychro.mjs); this estimate has no height, so it is solved at sea level */
/* v91.17.157 · audit: solved at the site height when the caller gives elevation_m (Quetta 36 C / 20 %: 19.8 at sea level, 18.7 at 1,680 m) */
const wetBulbStull = (t, rh, z) => r1p(wetBulbC(t, rh, Number.isFinite(Number(z)) && z !== null && z !== '' ? { elevationM: Number(z) } : null));
/* NWS heat-index bands in °C: 80 / 90 / 103 / 125 °F = 26.7 / 32.2 / 39.4 / 51.7 °C (v91.17.34: the 41 / 54 cuts were not the NWS bands the row cites) */
/* v91.17.147 · audit C1 · a refused index is not "none": above the table's 43.3 C dry bulb the index is at least the air temperature
   (>= 43.3 C, past the 39.4 C danger band); above the 58.3 C table ceiling it is past 51.7 C (extreme danger). */
const heatClassOf = (t, rh) => { const d = heatIndexDetail(t, rh); if (!d.refused) return heatClass(d.value);
  if (d.bound === 'maxIndexC') return 'extreme danger (above the heat-index table ceiling)';
  if (d.bound === 'maxAirTempC') return 'danger or worse (air temperature above the heat-index table, 43.3 C)';
  return null; };
const heatClass = (hi) => hi == null ? null : hi >= 51.7 ? 'extreme danger' : hi >= 39.4 ? 'danger' : hi >= 32.2 ? 'extreme caution' : hi >= 26.7 ? 'caution' : 'none';

/* Local Climate Zone priors (Stewart & Oke 2012 classes). The offsets are
   PROVISIONAL, uncalibrated for Pakistan, and bounded; they are not observations. */
const PROFILES = [
  { id: 'LCZ1', name: 'Compact high-rise', offsetC: 1.2, rangeC: [0.4, 2.5] },
  { id: 'LCZ2', name: 'Compact mid-rise', offsetC: 1.0, rangeC: [0.3, 2.0] },
  { id: 'LCZ3', name: 'Compact low-rise', offsetC: 0.8, rangeC: [0.2, 1.8] },
  { id: 'LCZ6', name: 'Open low-rise', offsetC: 0.3, rangeC: [0.0, 1.0] },
  { id: 'LCZ7', name: 'Lightweight low-rise (dense informal)', offsetC: 1.0, rangeC: [0.3, 2.0] },
  { id: 'LCZ8', name: 'Large low-rise (industrial/commercial)', offsetC: 0.6, rangeC: [0.1, 1.5] },
  { id: 'LCZ9', name: 'Sparsely built', offsetC: 0.0, rangeC: [-0.3, 0.5] },
  { id: 'LCZA', name: 'Dense trees', offsetC: -0.8, rangeC: [-1.8, -0.2] },
  { id: 'LCZD', name: 'Low plants', offsetC: -0.2, rangeC: [-0.8, 0.3] },
  { id: 'LCZG', name: 'Water', offsetC: -0.5, rangeC: [-1.5, 0.0] },
].map(p => ({ ...p, status: 'provisional', calibrated: false, source: 'LCZ class prior (Stewart & Oke 2012 typology); magnitude not calibrated for Pakistan' }));

function classify(features = {}) {
  if (features.lcz) { const p = PROFILES.find(x => x.id === String(features.lcz).toUpperCase()); if (p) return { profile: p, basis: 'supplied LCZ' }; }
  const imp = Number(features.impervious_fraction), tree = Number(features.tree_canopy_fraction), h = Number(features.building_height_m), water = Number(features.water_fraction);
  if (water > 0.5) return { profile: PROFILES.find(p => p.id === 'LCZG'), basis: 'water_fraction > 0.5' };
  if (tree > 0.6) return { profile: PROFILES.find(p => p.id === 'LCZA'), basis: 'tree_canopy_fraction > 0.6' };
  if (!(imp >= 0)) return { profile: null, basis: 'no morphology features supplied' };
  if (imp > 0.7) return { profile: PROFILES.find(p => p.id === (h > 25 ? 'LCZ1' : h > 10 ? 'LCZ2' : 'LCZ3')), basis: 'impervious_fraction > 0.7, building_height_m ' + (h || 'n/a') };
  if (imp > 0.4) return { profile: PROFILES.find(p => p.id === 'LCZ6'), basis: 'impervious_fraction 0.4–0.7' };
  if (imp > 0.15) return { profile: PROFILES.find(p => p.id === 'LCZ9'), basis: 'impervious_fraction 0.15–0.4' };
  return { profile: PROFILES.find(p => p.id === 'LCZD'), basis: 'impervious_fraction <= 0.15' };
}
function estimate(b) {
  const T = b.regional_air_temperature_c, rh = b.relative_humidity_pct, wind = b.wind_kmh;
  const { profile, basis } = classify(b.features);
  const windDamp = Math.max(0.3, 1 - wind / 30); const solar = b.solar_wm2 != null ? (b.solar_wm2 > 200 ? 1 : 1.15) : 1;
  const k = windDamp * solar;
  const off = profile ? Math.round(profile.offsetC * k * 10) / 10 : 0;
  const local = Math.round((T + off) * 10) / 10;
  const es = (x) => 6.112 * Math.exp(17.67 * x / (x + 243.5)); const rhL = rh == null ? rh : Math.round(Math.min(100, rh * es(T) / es(local)) * 10) / 10;
  const hiR = heatIndexC(T, rh), hiL = heatIndexC(local, rhL);
  return {
    name: b.name || null, location: { latitude: b.latitude, longitude: b.longitude },
    regional: { airTemperatureC: T, relativeHumidityPct: rh, windKmh: wind, solarWm2: b.solar_wm2 ?? null, role: 'atmospheric baseline, unchanged' },
    microclimate: { profile: profile ? { id: profile.id, name: profile.name } : null, classificationBasis: basis, adjustmentC: off, adjustmentRangeC: profile ? profile.rangeC.map(x => Math.round((T + x * k) * 10) / 10) : [T, T], localAirTemperatureC: local, windDamping: Math.round(windDamp * 100) / 100 },
    humanHeat: { regional: { heatIndexC: hiR, wetBulbC: wetBulbStull(T, rh, b.elevation_m), class: heatClassOf(T, rh) }, local: { heatIndexC: hiL, wetBulbC: wetBulbStull(local, rhL, b.elevation_m), class: heatClassOf(local, rhL) }, localRelativeHumidityPct: rhL, formulas: ['NWS Rothfusz heat index (floored at air temperature)', (Number.isFinite(Number(b.elevation_m)) && b.elevation_m !== null && b.elevation_m !== '' ? 'psychrometric wet bulb at the site height (' + Number(b.elevation_m) + ' m)' : 'psychrometric wet bulb at sea level (no height supplied)'), 'local humidity at constant vapour pressure'] },
    quality: { status: 'provisional', calibrated: false, confidence: profile ? 'low' : 'none', operational: false, note: 'Morphology offset is a bounded class prior, not a calibrated local air model.' },
  };
}

export function createWork(app) {
  const { store, audit, provider, units } = app;

  async function executeVerification(run) {
    const ctx = { identity: { actorId: run.created_by, tenantId: null } };
    try {
      run.status = 'running'; run.started_at = nowIso(); await store.save('verificationRuns');
      const locs = run.units_or_regions.map(x => units.all.find(u => u.unitId === x || u.name.toLowerCase() === String(x).toLowerCase())).filter(Boolean);
      if (!locs.length) throw new ApiError(422, 'CONTRACT_INVALID', 'None of units_or_regions matched the unit registry.');
      const days = [...new Set(run.lead_hours.map(l => Math.max(1, Math.min(7, Math.ceil(Number(l) / 24)))))];
      const v = run.variable; const hourly = days.map(d => v + '_previous_day' + d);
      const rows = [];
      for (const u of locs) {
        const fc = await provider.call('previousRuns', '/v1/forecast', { latitude: u.lat, longitude: u.lon, hourly, models: run.model_ids, start_date: run.period.start_date, end_date: run.period.end_date, timezone: 'GMT' });
        const ref = await provider.call('archive', '/v1/archive', { latitude: u.lat, longitude: u.lon, hourly: v, models: run.reference_dataset, start_date: run.period.start_date, end_date: run.period.end_date, timezone: 'GMT' });
        const obs = (ref.hourly || {})[v] || [];
        for (const m of run.model_ids) for (const d of days) {
          const key = v + '_previous_day' + d + (run.model_ids.length > 1 ? '_' + m : '');
          const f = (fc.hourly || {})[key] || (fc.hourly || {})[v + '_previous_day' + d] || [];
          let n = 0, se = 0, ae = 0, e = 0;
          for (let i = 0; i < Math.min(f.length, obs.length); i++) if (f[i] != null && obs[i] != null) { const d0 = f[i] - obs[i]; n++; e += d0; ae += Math.abs(d0); se += d0 * d0; }
          const month = Number(run.period.start_date.slice(5, 7)); const season = [12, 1, 2].includes(month) ? 'DJF' : [3, 4, 5].includes(month) ? 'MAM' : [6, 7, 8].includes(month) ? 'JJA' : 'SON';
          rows.push({ skill_id: newId('skl'), runId: run.runId, variable: v, lead_hours: d * 24, lead_basis: 'previous_day' + d + ' (forecast issued ' + d + ' day(s) before valid time)', region: u.unitId, region_name: u.name, model_id: m, season,
            n, bias: n ? Math.round(1000 * e / n) / 1000 : null, mae: n ? Math.round(1000 * ae / n) / 1000 : null, rmse: n ? Math.round(1000 * Math.sqrt(se / n)) / 1000 : null,
            probabilistic: null, probabilisticNote: 'deterministic models only; CRPS requires ensemble members', reference: run.reference_dataset, period: run.period, created_at: nowIso() });
        }
      }
      await store.insertMany('skill', rows);
      run.status = 'completed'; run.completed_at = nowIso(); run.results = rows.length; await store.save('verificationRuns');
      await audit.record('model_verification.run', 'completed', ctx, { runId: run.runId, rows: rows.length });
    } catch (e) {
      run.status = 'failed'; run.error = { code: e.code || 'INTERNAL_ERROR', message: e.message }; run.completed_at = nowIso(); await store.save('verificationRuns');
      await audit.record('model_verification.run', 'failed', ctx, { runId: run.runId, code: run.error.code });
    }
  }

  const handlers = {
    'airisk.explain': async (_a, { body }, ctx) => {
      const h = body.hazard_result || {};
      const ev = body.evidence_id ? store.find('assessments', a => a.calculationId === body.evidence_id) : null;
      const unit = h.unitKey || h.unit || h.name || 'the selected unit';
      const cls = h.class || h.category || null; const score = h.score != null && isFinite(h.score) ? Number(h.score) : null;
      const drivers = (Array.isArray(h.drivers) ? h.drivers : h.driver ? [h.driver] : []).map(String);
      const lim = [];
      if (score == null) lim.push('No score was supplied' + (h.reason ? ' (' + h.reason + ')' : '') + '; nothing is inferred in its place.');
      if (h.coverage != null && h.coverage < 100) lim.push('Input coverage is ' + h.coverage + '%.');
      if (!h.formulaVersion) lim.push('The formula version was not supplied.');
      if (!h.validTime) lim.push('The valid time was not supplied.');
      lim.push('A screening index ranks severity within one hazard. It is not a probability or a return period and is not comparable across hazards.');
      if (body.language && !/^en/i.test(body.language)) lim.push('Language ' + body.language + ' is not available; the explanation is in English.');
      if (body.evidence_id && !ev) lim.push('Evidence ' + body.evidence_id + ' is not stored on this server, so it could not be cross-checked.');
      const hz = h.hazard || 'hazard';
      const head = score == null ? `No ${hz} score is available for ${unit}.` : `${hz[0].toUpperCase() + hz.slice(1)} screening index ${score}/100${cls ? ' (' + cls + ')' : ''} for ${unit}${h.validTime ? ', valid ' + h.validTime : ''}.`;
      const tail = { executive: drivers.length ? ' Main driver: ' + drivers[0] + '.' : '', technical: (drivers.length ? ' Drivers: ' + drivers.join('; ') + '.' : '') + (h.formulaVersion ? ' Formula ' + h.formulaVersion + '.' : ''), public: (() => { const w = score != null ? screeningWord(app.dataDir, score) : null; return w === 'Severe' || w === 'High' ? ' Conditions are ' + w.toLowerCase() + ' for this hazard; follow official guidance.' : ''; })(), operations: drivers.length ? ' Watch: ' + drivers.join(', ') + '.' : '' }[body.audience] || '';
      const out = { explanationId: newId('exp'), summary: head + tail, drivers, limitations: lim,
        sourceReferences: [ev ? { type: 'evidence', id: ev.calculationId, hash: ev.evidenceHash } : body.evidence_id ? { type: 'evidence', id: body.evidence_id, verified: false } : null, h.formulaVersion ? { type: 'formula', id: h.formulaVersion } : null, { type: 'hazard_result', hash: hashStable(h) }].filter(Boolean),
        audience: body.audience, generator: 'deterministic-template-v1', model: null, question: body.question || null,
        questionAnswered: body.question ? false : null, questionNote: body.question ? 'Free-text questions need a language model, which this backend does not run. The summary uses only the supplied result.' : null, createdAt: nowIso() };
      await store.insert('explanations', out); return { data: out };
    },
    'assessments.create': async (_a, { body }, ctx) => {
      const ec = body.evidence_context || {};
      const rec = { calculationId: newId('calc'), calculatedAt: nowIso(), validTime: ec.valid_time || ec.validTime || nowIso(), buildVersion: '91.17', serviceVersion: SERVICE_VERSION,
        formulaVersion: ec.formula_version || ec.formulaVersion || null, inputCoverage: ec.coverage ?? null,
        inputs: { asset: body.asset, hazards: body.hazards, horizon: body.horizon, design_life_years: body.design_life_years ?? null, scenario_id: body.scenario_id ?? null },
        sources: ec.sources || [], results: ec.results || [], computedBy: ec.results && ec.results.length ? 'client canonical engine (frozen as supplied)' : 'none supplied',
        frozenBy: ctx.identity.actorId, tenantId: ctx.identity.tenantId, contractVersion: 'evidence@1.0.0' };
      rec.evidenceHash = hashStable(rec);
      await store.insert('assessments', rec); await audit.record('assessment.freeze', 'success', ctx, { calculationId: rec.calculationId, evidenceHash: rec.evidenceHash });
      return { data: rec, status: 201 };
    },
    'assessments.evidence': async (_a, { path }) => { const r = store.find('assessments', a => a.calculationId === path.calculation_id); if (!r) throw new ApiError(404, 'NOT_FOUND', 'Evidence ' + path.calculation_id + ' not found.'); return { data: { ...r, hashVerified: hashStable((({ evidenceHash, ...x }) => x)(r)) === r.evidenceHash } }; },

    'operations.actions.create': async (_a, { body }, ctx) => {
      const unit = units.all.find(u => u.unitId === body.unit_id);
      const known = new Set(store.all('assessments').map(a => a.calculationId));
      const a = { actionId: newId('act'), unit_id: body.unit_id, unit_known: !!unit, hazard: body.hazard, hazard_result_id: body.hazard_result_id, owner_id: body.owner_id, sop_id: body.sop_id,
        deadline_basis: body.deadline_basis, evidence_ids: body.evidence_ids, evidence_verified: body.evidence_ids.filter(id => known.has(id)), status: 'open', version: 1,
        createdAt: nowIso(), updatedAt: nowIso(), created_by: ctx.identity.actorId, history: [{ at: nowIso(), status: 'open', actor: ctx.identity.actorId, version: 1 }] };
      await store.insert('actions', a); await audit.record('action.create', 'success', ctx, { actionId: a.actionId }); return { data: a, status: 201 };
    },
    'operations.actions.update': async (_a, { path, body }, ctx) => {
      const a = store.find('actions', x => x.actionId === path.action_id); if (!a) throw new ApiError(404, 'NOT_FOUND', 'Action not found.');
      if (body.version !== a.version) throw new ApiError(409, 'VERSION_CONFLICT', 'Action is at version ' + a.version + ', update was based on ' + body.version + '.', { details: { currentVersion: a.version } });
      const FLOW = { open: ['in_progress', 'cancelled'], in_progress: ['pending_approval', 'cancelled'], pending_approval: ['approved', 'in_progress', 'cancelled'], approved: ['closed'], closed: [], cancelled: [] };
      if (body.approval) {
        const can = ctx.identity.scopes.includes('*') || ctx.identity.scopes.includes('actions:approve');
        if (!can) throw new ApiError(403, 'SCOPE_REQUIRED', 'actions:approve is required to record an approval.');
        if (ctx.identity.actorId === a.created_by) throw new ApiError(403, 'ROLE_REQUIRED', 'Segregation of duties: the creator of an action cannot approve it.');
        if (a.status !== 'pending_approval') throw new ApiError(409, 'VERSION_CONFLICT', 'Action is ' + a.status + ', not pending approval.');
        a.approval = { ...body.approval, actor_id: ctx.identity.actorId, at: nowIso() }; body.status = body.approval.decision === 'reject' ? 'in_progress' : 'approved';
      }
      if (body.status && body.status !== a.status) {
        if (!FLOW[a.status].includes(body.status)) throw new ApiError(422, 'CONTRACT_INVALID', 'Cannot move action from ' + a.status + ' to ' + body.status + '.');
        if (body.status === 'approved' && !body.approval) throw new ApiError(422, 'CONTRACT_INVALID', 'Approval must be recorded through the approval object.');
        a.status = body.status;
      }
      if (body.owner_id) a.owner_id = body.owner_id;
      a.version++; a.updatedAt = nowIso(); a.history.push({ at: nowIso(), status: a.status, actor: ctx.identity.actorId, version: a.version, note: body.note || null });
      await store.save('actions');   /* v91.17.283 · WS3 · the row was changed in place: name its collection so its bytes are rebuilt at this write */
      await audit.record('action.update', 'success', ctx, { actionId: a.actionId, status: a.status, version: a.version }); return { data: a };
    },
    'operations.outcomes.create': async (_a, { body }, ctx) => {
      if (body.action_id && !store.find('actions', x => x.actionId === body.action_id)) throw new ApiError(404, 'NOT_FOUND', 'Action ' + body.action_id + ' not found.');
      const o = { outcomeId: newId('out'), action_id: body.action_id || null, event_id: body.event_id, unit_id: body.unit_id, observed_impacts: body.observed_impacts, verification_sources: body.verification_sources, reviewer_id: body.reviewer_id, recorded_by: ctx.identity.actorId, createdAt: nowIso(), immutable: true };
      o.evidenceHash = hashStable(o); await store.insert('outcomes', o); await audit.record('outcome.create', 'success', ctx, { outcomeId: o.outcomeId, evidenceHash: o.evidenceHash }); return { data: o, status: 201 };
    },

    'modelLab.verification.run': async (_a, { body }, ctx) => {
      const p = body.period || {}; const s = Date.parse(p.start_date), e = Date.parse(p.end_date);
      if (!(s && e) || e < s) throw new ApiError(422, 'CONTRACT_INVALID', 'period needs start_date and end_date (YYYY-MM-DD), end after start.');
      if ((e - s) / 864e5 > 31) throw new ApiError(422, 'CONTRACT_INVALID', 'period may span at most 31 days per run.');
      if (Date.now() - e < 6 * 864e5) throw new ApiError(422, 'CONTRACT_INVALID', 'end_date must be at least 6 days ago: the reanalysis reference lags real time by about 5 days.');
      if (!['era5', 'era5_land', 'era5_seamless'].includes(body.reference_dataset)) throw new ApiError(422, 'CONTRACT_INVALID', 'reference_dataset must be era5, era5_land or era5_seamless.');
      if (body.units_or_regions.length > 10) throw new ApiError(422, 'CONTRACT_INVALID', 'At most 10 units per verification run.');
      const run = { runId: newId('ver'), status: 'queued', model_ids: body.model_ids, initialization_cycles: body.initialization_cycles, initializationNote: 'The previous-runs archive exposes forecasts by days-before-valid-time, not by named cycle; cycles are recorded but not selectable.',
        lead_hours: body.lead_hours, variable: body.variable, units_or_regions: body.units_or_regions, reference_dataset: body.reference_dataset, period: { start_date: p.start_date, end_date: p.end_date }, createdAt: nowIso(), created_by: ctx.identity.actorId };
      await store.insert('verificationRuns', run); setImmediate(() => executeVerification(run));
      return { data: run, status: 202 };
    },
    'modelLab.skill': async (_a, { query }) => {
      const leads = (Array.isArray(query.lead_hours) ? query.lead_hours : [query.lead_hours]).map(Number);
      const models = query.model_ids && query.model_ids.length ? query.model_ids : null;
      const rows = store.all('skill').filter(r => r.variable === query.variable && leads.includes(r.lead_hours) && (r.region === query.region || r.region_name.toLowerCase() === String(query.region).toLowerCase()) && (!query.season || r.season === query.season) && (!models || models.includes(r.model_id)));
      return { data: rows, collection: true, meta: { verificationRuns: store.all('verificationRuns').slice(-5).map(r => ({ runId: r.runId, status: r.status, error: r.error || null })) } };
    },
    'hybridLab.experiments.create': async (_a, { body }, ctx) => {
      const x = body.scenario_inputs || {}, w = body.coefficients || {}; const intercept = Number(w.intercept || 0);
      const terms = Object.keys(w).filter(k => k !== 'intercept');
      const missing = terms.filter(k => typeof x[k] !== 'number');
      if (missing.length) throw new ApiError(422, 'CONTRACT_INVALID', 'scenario_inputs lacks numeric values for: ' + missing.join(', '));
      const score = (ww) => Math.max(0, Math.min(100, intercept + terms.reduce((s, k) => s + ww[k] * x[k], 0)));
      const base = score(w); let lo = base, hi = base; const sens = {};
      for (const k of terms) { const up = score({ ...w, [k]: w[k] * 1.1 }), dn = score({ ...w, [k]: w[k] * 0.9 }); sens[k] = Math.round(Math.abs(up - dn) * 100) / 100; lo = Math.min(lo, up, dn); hi = Math.max(hi, up, dn); }
      const ts = Object.values(body.feature_timestamps || {}).map(Date.parse).filter(Boolean);
      const spreadH = ts.length > 1 ? (Math.max(...ts) - Math.min(...ts)) / 3600e3 : 0;
      const diagnostics = [];
      if (terms.some(k => !(body.feature_timestamps || {})[k])) diagnostics.push('Some features have no timestamp.');
      if (spreadH > 24) diagnostics.push('Feature timestamps span ' + Math.round(spreadH) + ' h; inputs are temporally misaligned.');
      const e = { experimentId: newId('hyb'), candidateScore: Math.round(base * 100) / 100, sensitivityRange: [Math.round(lo * 100) / 100, Math.round(hi * 100) / 100], sensitivityByCoefficient: sens, perturbation: '±10% per coefficient, one at a time',
        promotionStatus: 'experimental — not eligible: no verification against observed outcomes', baseline_id: body.baseline_id, hypothesis_id: body.hypothesis_id, unit_or_location: body.unit_or_location, diagnostics, inputsHash: hashStable(body), createdAt: nowIso(), created_by: ctx.identity.actorId };
      await store.insert('experiments', e); return { data: e, status: 201 };
    },

    'urbanHeat.posture': async () => ({ data: { release: '91.17', operational: false, regionalWeatherSeparated: true, calibratedLocalAirModel: false, profilesStatus: 'provisional', limitations: ['No local air-temperature observations have calibrated the LCZ offsets.', 'Offsets are bounded class priors with wind damping, not a microclimate model.'], formulas: ['NWS Rothfusz heat index (floored at air temperature)', 'psychrometric wet bulb at the site height when the request gives one, at sea level otherwise'] } }),   /* v91.17.208 · the posture has no request body: it read b.elevation_m and answered 500 */
    'urbanHeat.profiles': async () => ({ data: PROFILES, collection: true }),
    'urbanHeat.estimate': async (_a, { body }) => ({ data: estimate(body) }),
    'urbanHeat.compare': async (_a, { body }) => {
      if (!Array.isArray(body.points) || body.points.length < 2 || body.points.length > 20) throw new ApiError(422, 'VALIDATION_ERROR', 'points must contain 2 to 20 locations.');
      const results = body.points.map(p => estimate({ ...body, ...p, regional_air_temperature_c: body.regional_air_temperature_c, relative_humidity_pct: body.relative_humidity_pct, wind_kmh: body.wind_kmh, solar_wm2: body.solar_wm2 }));
      const temps = results.map(r => r.microclimate.localAirTemperatureC);
      return { data: { sharedRegionalBaseline: true, regionalAirTemperatureC: body.regional_air_temperature_c, localTemperatureRangeC: [Math.min(...temps), Math.max(...temps)], results, note: 'Every point uses the same regional weather, so differences come only from the morphology prior.' } };
    },
  };
  /* v91.17.283.6 · item 2 · C12 (data/urban-heat-c12.json): while it is applied, the provisional LCZ profile offsets above (never tested on
     held-out data) are not served by the operator interface either. The posture carries the decision; profiles, estimate and compare answer
     "not assessed (no tested skill)" with the decision's reason and no number. Released (applied: false): the handlers answer as before. */
  const c12 = () => { try { const c = app.urbanHeat && typeof app.urbanHeat.c12 === 'function' ? app.urbanHeat.c12() : null; return c && c.applied ? c : null; } catch (_) { return null; } };
  const notAssessed = (c) => ({ assessed: false, status: 'not assessed (no tested skill)', why: c.reason, rule: c.rule, releaseWhen: c.releaseWhen, decision: c.version, source: c.source });
  for (const k of ['urbanHeat.posture', 'urbanHeat.profiles', 'urbanHeat.estimate', 'urbanHeat.compare']) {
    const f = handlers[k];
    handlers[k] = async (...a) => { const c = c12(); if (!c) return f(...a);
      if (k === 'urbanHeat.posture') return { data: { release: '91.17', operational: false, regionalWeatherSeparated: true, calibratedLocalAirModel: false, profilesStatus: 'not assessed (no tested skill)', c12: notAssessed(c) } };
      if (k === 'urbanHeat.profiles') return { data: [], collection: true, meta: notAssessed(c) };
      return { data: notAssessed(c) }; };
  }
  return { handlers };
}
