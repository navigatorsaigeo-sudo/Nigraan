import { ApiError, newId, nowIso, hashStable, requireConfirmed } from './core.mjs';

export const GATE_VERSION = 'agn.quality-gates.v2';   /* v91.17.125 · external audit A01, A02 */
/* v91.17.125 · A02 · the run digest covers every decision input of a record, not only unitKey and leads: changing an hourly value, the
   coordinates, the resolved grid point, the valid time or the correction basis after ingestion now breaks QG8. Runs written before
   v125 carry digest_version 1 and are checked with the old digest, labelled legacy. */
export const DIGEST_VERSION = 2;
export function recordCanon(r) { return [r.unitKey, r.lat, r.lon, r.resolvedLat ?? null, r.resolvedLon ?? null, r.resolvedElevationM ?? null, r.validTime ?? null,
  r.leads, r.hourly, r.pastToday ?? null, r.temperatureBasis ?? null, r.biasCorrected ?? null, r.provider ?? null, ...(r.rainExt ? [r.rainExt] : [])]; }   /* W1: rainExt only where held (older records keep their digest) */
export function recordsDigest(recs) { return hashStable(recs.map(recordCanon)); }
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
/* finite numeric share of a record's hourly variables (the 'time' axis excluded), from the data itself, not the record's own claim */
function finiteShare(r) { let n = 0, ok = 0; const H = r && r.hourly; if (!H) return 0;
  for (const [k, arr] of Object.entries(H)) { if (k === 'time' || !Array.isArray(arr)) continue; for (const x of arr) { n++; if (isNum(x)) ok++; } }
  return n ? 100 * ok / n : 0; }
export const GATES = [
  { id: 'QG1', name: 'Unit coverage', blocking: true, threshold: 95, description: 'Returned units / requested units, percent.' },
  { id: 'QG2', name: 'Variable completeness', blocking: true, threshold: 95, description: 'Mean share of non-null values across requested variables and leads.' },
  { id: 'QG3', name: 'Freshness', blocking: true, threshold: 360, description: 'Minutes since run completion at evaluation time.' },
  { id: 'QG4', name: 'Physical plausibility', blocking: true, threshold: 0.1, description: 'Percent of values outside physical bounds (T -60..60 °C, RH 0..100 %, precipitation 0..500 mm/h, wind 0..300 km/h).' },
  { id: 'QG5', name: 'Spatial resolution sanity', blocking: true, threshold: 99, description: 'Percent of records whose resolved grid point is within 0.25° of the unit centroid; no duplicate unit keys.' },
  { id: 'QG6', name: 'Full national run', blocking: true, threshold: null, description: 'Run is tehsil-level and not development-limited (no max_units).' },
  { id: 'QG7', name: 'Disputed territory flagged', blocking: true, threshold: null, description: 'Every record for disputed territory carries disputed: true.' },
  { id: 'QG8', name: 'Record integrity', blocking: true, threshold: null, description: 'records_sha256 recomputed from stored records equals the run summary.' },
];
const BOUNDS = { temperature_2m: [-60, 60], apparent_temperature: [-80, 75], dew_point_2m: [-80, 40], relative_humidity_2m: [0, 100], precipitation: [0, 500], rain: [0, 500], wind_speed_10m: [0, 300], wind_gusts_10m: [0, 400], cloud_cover: [0, 100], surface_pressure: [300, 1100], pressure_msl: [850, 1100] };

export function evaluateRun(app, run) {
  const recs = app.store.filter('records', r => r.runId === run.run_id);
  const results = []; const push = (g, value, passed, detail) => results.push({ gate: g.id, name: g.name, blocking: g.blocking, threshold: g.threshold, value, passed, detail });
  const unitCov = run.requested_units ? 100 * recs.length / run.requested_units : 0;
  push(GATES[0], Math.round(unitCov * 10) / 10, unitCov >= 95, recs.length + ' of ' + run.requested_units + ' units');
  /* A01 · completeness recomputed from finite numbers in the stored series (a string or an all-null series at an asserted 100 % fails) */
  const comp = recs.length ? recs.reduce((s, r) => s + finiteShare(r), 0) / recs.length : 0;
  push(GATES[1], Math.round(comp * 10) / 10, comp >= 95, 'mean share of finite numeric values in the stored hourly series');
  /* A01 · an unparseable completion time, or one more than 5 minutes in the future, fails freshness */
  const tc = run.completed_at ? Date.parse(run.completed_at) : NaN; const age = Number.isFinite(tc) ? (Date.now() - tc) / 60e3 : Infinity;
  push(GATES[2], Number.isFinite(age) ? Math.round(age) : null, Number.isFinite(age) && age >= -5 && age <= 360, !Number.isFinite(tc) ? 'completion time missing or unparseable' : age < -5 ? 'completion time is in the future' : 'minutes since completion');
  let n = 0, bad = 0; const badEx = [];
  for (const r of recs) for (const v of Object.keys(r.hourly)) { const b = BOUNDS[v]; if (!b) continue; for (const x of r.hourly[v]) { if (x == null) continue; n++; if (!isNum(x) || x < b[0] || x > b[1]) { bad++; if (badEx.length < 5) badEx.push({ unit: r.unitKey, variable: v, value: x }); } } }
  const badPct = n ? 100 * bad / n : 0;
  push(GATES[3], Math.round(badPct * 1000) / 1000, badPct <= 0.1, { checkedValues: n, outOfBounds: bad, examples: badEx });
  const keys = new Set(); let dup = 0, near = 0;
  for (const r of recs) { if (keys.has(r.unitKey)) dup++; keys.add(r.unitKey); if (r.resolvedLat != null && Math.abs(r.resolvedLat - r.lat) <= 0.25 && Math.abs(r.resolvedLon - r.lon) <= 0.25) near++; }
  const nearPct = recs.length ? 100 * near / recs.length : 0;
  push(GATES[4], Math.round(nearPct * 10) / 10, nearPct >= 99 && dup === 0, { duplicates: dup });
  push(GATES[5], run.unit_level === 'tehsil' && !run.development_limited, run.unit_level === 'tehsil' && !run.development_limited, { unit_level: run.unit_level, development_limited: run.development_limited });
  const disputedUnits = app.units[run.unit_level === 'district' ? 'district' : 'tehsil'].filter(u => u.disputed).map(u => u.unitId);
  const flagged = recs.filter(r => disputedUnits.includes(r.unitKey)).every(r => r.disputed === true);
  push(GATES[6], flagged, flagged, { disputedUnits: disputedUnits.length });
  const legacy = (run.digest_version || 1) < DIGEST_VERSION;
  const integ = recs.length > 0 && (legacy ? hashStable(recs.map(r => [r.unitKey, r.leads])) : recordsDigest(recs)) === run.records_sha256;
  push(GATES[7], integ, integ, [run.records_pruned ? 'records pruned' : null, legacy ? 'legacy digest (unitKey and leads only, run written before v91.17.125)' : null].filter(Boolean).join('; ') || null);
  const passed = results.filter(r => r.passed).length;
  return { results, score: Math.round(100 * passed / results.length), status: results.every(r => r.passed || !r.blocking) ? 'passed' : 'failed' };
}

export function createQuality(app) {
  const { store, audit } = app;
  const run = (id) => { const r = store.find('runs', x => x.run_id === id); if (!r) throw new ApiError(404, 'NOT_FOUND', 'Run ' + id + ' not found.'); return r; };
  const promo = (id) => { const p = store.find('promotions', x => x.promotion_id === id); if (!p) throw new ApiError(404, 'NOT_FOUND', 'Promotion ' + id + ' not found.'); return p; };
  const latestEval = (runId) => store.filter('evaluations', e => e.run_id === runId).sort((a, b) => Date.parse(b.evaluated_at) - Date.parse(a.evaluated_at))[0] || null;

  const handlers = {
    'quality.gates.list': async () => ({ data: { version: GATE_VERSION, gates: GATES,
      promotionPolicy: { steps: ['quality evaluation passed', 'scientific review approve', 'operations review approve'], segregationOfDuties: 'scientific and operations reviewers must be different actors', operationalRequirement: 'run.operational must be true and every blocking gate must pass', revocation: 'operations_approver or admin, with reason' } } }),
    'quality.evaluations.create': async (_a, { path, body }, ctx) => {
      const r = run(path.run_id);
      if (r.status === 'running') throw new ApiError(409, 'PROMOTION_STATE_CONFLICT', 'Run is still running.');
      const prev = latestEval(r.run_id);
      if (prev && !body.force && Date.now() - Date.parse(prev.evaluated_at) < 5 * 60e3) return { data: prev };
      const ev = evaluateRun(app, r);
      const rec = { evaluation_id: newId('qev'), run_id: r.run_id, gate_version: GATE_VERSION, status: ev.status, score: ev.score, results: ev.results, evaluated_at: nowIso(), evaluated_by: ctx.identity.actorId, run_records_sha256: r.records_sha256 };
      rec.integrity_sha256 = hashStable(rec);
      await store.insert('evaluations', rec); await audit.record('quality.evaluate', ev.status, ctx, { runId: r.run_id, score: ev.score });
      return { data: rec, status: 201 };
    },
    'quality.evaluations.get': async (_a, { path }) => {
      run(path.run_id); const e = latestEval(path.run_id);
      if (!e) throw new ApiError(404, 'QUALITY_EVALUATION_REQUIRED', 'Run ' + path.run_id + ' has not been evaluated.');
      return { data: e };
    },
    'quality.promotions.list': async (_a, { query }) => ({ data: store.all('promotions').filter(p => !query.status || p.status === query.status).slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)), collection: true }),
    'quality.promotions.create': async (_a, { path, body }, ctx) => {
      const r = run(path.run_id); const e = latestEval(r.run_id);
      if (!e) throw new ApiError(409, 'QUALITY_EVALUATION_REQUIRED', 'Evaluate the run before proposing promotion.');
      if (e.status !== 'passed') throw new ApiError(409, 'QUALITY_GATES_FAILED', 'Latest evaluation failed: ' + e.results.filter(x => !x.passed).map(x => x.gate + ' ' + x.name).join(', '));
      if (store.find('promotions', p => p.run_id === r.run_id && ['pending_scientific_review', 'pending_operations_review', 'promoted'].includes(p.status))) throw new ApiError(409, 'PROMOTION_STATE_CONFLICT', 'This run already has an active promotion.');
      const p = { promotion_id: newId('prm'), run_id: r.run_id, evaluation_id: e.evaluation_id, status: 'pending_scientific_review', reason: body.reason, created_at: nowIso(), created_by: ctx.identity.actorId, scientific_decision: null, operations_decision: null, history: [{ at: nowIso(), status: 'pending_scientific_review', actor: ctx.identity.actorId }] };
      await store.insert('promotions', p); await audit.record('promotion.create', 'success', ctx, { promotionId: p.promotion_id, runId: r.run_id });
      return { data: p, status: 201 };
    },
    'quality.promotions.scientificReview': async (_a, { path, body }, ctx) => {
      requireConfirmed(body); const p = promo(path.promotion_id);
      if (p.status !== 'pending_scientific_review') throw new ApiError(409, 'PROMOTION_STATE_CONFLICT', 'Promotion is ' + p.status + ', not awaiting scientific review.');
      p.scientific_decision = { decision: body.decision, reason: body.reason, actor_id: ctx.identity.actorId, at: nowIso() };
      p.status = body.decision === 'approve' ? 'pending_operations_review' : 'rejected';
      p.history.push({ at: nowIso(), status: p.status, actor: ctx.identity.actorId }); await store.save();
      await audit.record('promotion.scientific_review', body.decision, ctx, { promotionId: p.promotion_id }); return { data: p };
    },
    'quality.promotions.operationsReview': async (_a, { path, body }, ctx) => {
      requireConfirmed(body); const p = promo(path.promotion_id);
      if (p.status !== 'pending_operations_review') throw new ApiError(409, 'PROMOTION_STATE_CONFLICT', 'Promotion is ' + p.status + ', not awaiting operations review.');
      if (p.scientific_decision && p.scientific_decision.actor_id === ctx.identity.actorId) throw new ApiError(409, 'PROMOTION_STATE_CONFLICT', 'Segregation of duties: the scientific reviewer (' + p.scientific_decision.actor_id + ') cannot also record the operations review. Issue a token for a second actor with scripts/issue-token.mjs.');
      if (body.decision === 'approve') {
        const r = run(p.run_id); const e = latestEval(p.run_id);
        const blockers = [];
        if (!r.operational) blockers.push('run is not operational (full tehsil run, complete status)');
        if (!e || e.status !== 'passed') blockers.push('latest quality evaluation did not pass');
        if (blockers.length) throw new ApiError(409, 'OPERATIONAL_QUALITY_BLOCKED', 'Operations approval blocked: ' + blockers.join('; '));
        for (const old of store.filter('promotions', x => x.status === 'promoted')) { old.status = 'superseded'; old.superseded_by = p.promotion_id; old.history.push({ at: nowIso(), status: 'superseded' }); }
        p.status = 'promoted'; p.promoted_at = nowIso();
      } else p.status = 'rejected';
      p.operations_decision = { decision: body.decision, reason: body.reason, actor_id: ctx.identity.actorId, at: nowIso() };
      p.history.push({ at: nowIso(), status: p.status, actor: ctx.identity.actorId }); await store.save();
      await audit.record('promotion.operations_review', body.decision, ctx, { promotionId: p.promotion_id }); return { data: p };
    },
    'quality.promotions.revoke': async (_a, { path, body }, ctx) => {
      requireConfirmed(body); const p = promo(path.promotion_id);
      if (!['promoted', 'pending_operations_review', 'pending_scientific_review'].includes(p.status)) throw new ApiError(409, 'PROMOTION_STATE_CONFLICT', 'Promotion is ' + p.status + '.');
      p.status = 'revoked'; p.revoked_at = nowIso(); p.revocation = { reason: body.reason, actor_id: ctx.identity.actorId };
      p.history.push({ at: nowIso(), status: 'revoked', actor: ctx.identity.actorId }); await store.save();
      await audit.record('promotion.revoke', 'success', ctx, { promotionId: p.promotion_id, reason: body.reason }); return { data: p };
    },
    'quality.promotedSnapshot.latest': async () => {
      const p = store.filter('promotions', x => x.status === 'promoted').sort((a, b) => Date.parse(b.promoted_at) - Date.parse(a.promoted_at))[0];
      if (!p) throw new ApiError(404, 'NOT_FOUND', 'No snapshot has been scientifically and operationally approved yet.');
      const r = run(p.run_id); const e = store.find('evaluations', x => x.evaluation_id === p.evaluation_id);
      return { data: { promotion: p, quality: e, run: r, records: store.filter('records', x => x.runId === r.run_id), operational: r.operational } };
    },
  };
  return { handlers };
}
