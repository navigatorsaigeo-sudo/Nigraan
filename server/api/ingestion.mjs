import { randomBytes } from 'node:crypto';
import { ApiError, newId, nowIso, hashStable, requireConfirmed } from './core.mjs';
import { runNationalIngest } from './national.mjs';
import { PROVIDER_ID } from './provider.mjs';
import { raiseDeduped } from './ops.mjs';   /* v91.17.283 · WS3 */

const LEASE_MS = 10 * 60e3;
const TERMINAL = ['succeeded', 'dead_letter', 'cancelled'];

export function createIngestion(app) {
  const { store } = app;
  async function event(type, details, ctx) {
    const ev = { event_id: newId('wev'), at: nowIso(), type, actor_id: ctx && ctx.identity ? ctx.identity.actorId : 'system', ...details };
    await store.insert('workerEvents', ev); return ev;
  }
  function ensureWorker(id, metadata = {}) {
    let w = store.find('workers', x => x.worker_id === id);
    if (!w) { w = { worker_id: id, status: 'active', metadata, registered_at: nowIso(), last_heartbeat_at: nowIso(), current_job_id: null, lease_expires_at: null, processed: 0 }; store.all('workers').push(w); }
    return w;
  }
  async function enqueue(payload, { priority = 100, max_attempts = 3, replay_of = null, schedule_id = null, idempotencyKey = null } = {}, ctx) {
    const job = { job_id: newId('job'), status: 'queued', payload, priority, attempts: 0, max_attempts, created_at: nowIso(), updated_at: nowIso(),
      next_attempt_at: nowIso(), run_id: null, last_error: null, lease: null, replay_of, schedule_id, request_sha256: hashStable(payload),
      created_by: ctx && ctx.identity ? ctx.identity.actorId : 'system', history: [{ at: nowIso(), status: 'queued' }] };
    await store.insert('jobs', job);
    await event('job.enqueued', { job_id: job.job_id, schedule_id, replay_of }, ctx);
    return job;
  }
  async function recover(ctx) {
    const now = Date.now(); let expired = 0, requeued = [], dead = [];
    for (const j of store.filter('jobs', j => j.status === 'running' && j.lease && Date.parse(j.lease.expires_at) < now)) {
      expired++; j.lease = null; j.updated_at = nowIso();
      if (j.attempts >= j.max_attempts) { j.status = 'dead_letter'; dead.push(j.job_id); j.history.push({ at: nowIso(), status: 'dead_letter', reason: 'lease expired' }); await raiseDeduped(app, { type: 'ingestion.dead_letter', severity: 'critical', message: 'Job ' + j.job_id + ' dead-lettered after lease expiry.', place: 'ingestion queue', hazard: 'dead_letter', level: 'lease expired', details: { job_id: j.job_id } }); try { if (app.ops && app.ops.fail) await app.ops.fail('ingestion-job', 'job ' + j.job_id + ' lease expired'); } catch (_) {} }
      else { j.status = 'queued'; requeued.push(j.job_id); j.history.push({ at: nowIso(), status: 'queued', reason: 'lease expired' }); }
    }
    for (const w of store.all('workers')) if (w.status === 'active' && now - Date.parse(w.last_heartbeat_at) > LEASE_MS) { w.status = 'stale'; }
    await store.save('jobs', 'workers');
    if (expired) await event('lease.recovered', { expired, requeued, dead }, ctx);
    return { checkedAt: nowIso(), expired, requeuedJobs: requeued, deadLetterJobs: dead };
  }
  async function runOnce(workerId, ctx) {
    const w = ensureWorker(workerId || 'local-api-worker');
    w.status = 'active'; w.last_heartbeat_at = nowIso();
    const now = Date.now();
    const job = store.filter('jobs', j => j.status === 'queued' && Date.parse(j.next_attempt_at) <= now).sort((a, b) => a.priority - b.priority || Date.parse(a.created_at) - Date.parse(b.created_at))[0];
    if (!job) { await store.save('jobs', 'workers'); return { processed: 0, worker_id: w.worker_id, job: null }; }
    const token = randomBytes(16).toString('hex');
    job.status = 'running'; job.attempts++; job.updated_at = nowIso();
    job.lease = { worker_id: w.worker_id, token, expires_at: new Date(now + LEASE_MS).toISOString() };
    job.history.push({ at: nowIso(), status: 'running', attempt: job.attempts, worker_id: w.worker_id });
    w.current_job_id = job.job_id; w.lease_expires_at = job.lease.expires_at; await store.save('jobs', 'workers');
    await event('job.claimed', { job_id: job.job_id, worker_id: w.worker_id, attempt: job.attempts }, ctx);
    try {
      const run = await runNationalIngest(app, job.payload, ctx, { jobId: job.job_id });
      job.run_id = run.run_id;
      if (run.status === 'failed') throw Object.assign(new Error('Run failed: ' + (run.errors[0] ? run.errors[0].message : 'no records')), { code: (run.errors[0] || {}).code || 'PROVIDER_UNAVAILABLE' });
      job.status = 'succeeded'; job.last_error = null; job.history.push({ at: nowIso(), status: 'succeeded', run_id: run.run_id, coverage: run.coverage });
      w.processed++; try { if (app.ops && app.ops.success) app.ops.success('ingestion-job'); } catch (_) {}
    } catch (e) {
      job.last_error = { code: e.code || 'INTERNAL_ERROR', message: e.message, at: nowIso() };
      const terminal = e.code === 'PROVIDER_QUOTA_EXHAUSTED' || e.code === 'CONTRACT_INVALID';
      if (terminal || job.attempts >= job.max_attempts) {
        job.status = 'dead_letter'; job.history.push({ at: nowIso(), status: 'dead_letter', reason: job.last_error.code });
        await raiseDeduped(app, { type: 'ingestion.dead_letter', severity: 'critical', message: 'Job ' + job.job_id + ' dead-lettered: ' + e.message, place: 'ingestion queue', hazard: 'dead_letter', level: job.last_error.code, details: { job_id: job.job_id } }); try { if (app.ops && app.ops.fail) await app.ops.fail('ingestion-job', 'job ' + job.job_id + ': ' + e.message); } catch (_) {}
      } else {
        job.status = 'queued'; job.next_attempt_at = new Date(Date.now() + Math.min(30 * 60e3, 60e3 * 2 ** job.attempts)).toISOString();
        job.history.push({ at: nowIso(), status: 'queued', reason: 'retry after ' + job.last_error.code });
      }
    } finally {
      job.lease = null; job.updated_at = nowIso(); w.current_job_id = null; w.lease_expires_at = null; w.last_heartbeat_at = nowIso();
      await store.save('jobs', 'workers');
      await event('job.finished', { job_id: job.job_id, status: job.status, run_id: job.run_id }, ctx);
    }
    return { processed: 1, worker_id: w.worker_id, job };
  }
  async function tick(ctx) {
    const now = Date.now(); const due = store.filter('schedules', s => s.enabled && Date.parse(s.next_run_at) <= now); const jobs = [];
    for (const s of due) {
      const active = store.find('jobs', j => j.schedule_id === s.schedule_id && !TERMINAL.includes(j.status));
      if (active) { s.skipped = (s.skipped || 0) + 1; }
      else { const j = await enqueue(s.payload, { schedule_id: s.schedule_id }, ctx); jobs.push(j.job_id); s.last_enqueued_job = j.job_id; }
      s.last_tick_at = nowIso();
      let next = Date.parse(s.next_run_at); while (next <= now) next += s.cadence_minutes * 60e3; s.next_run_at = new Date(next).toISOString();
    }
    await store.save('jobs', 'workers');
    return { dueSchedules: due.map(s => s.schedule_id), enqueuedJobs: jobs };
  }
  const findJob = (id) => { const j = store.find('jobs', x => x.job_id === id); if (!j) throw new ApiError(404, 'NOT_FOUND', 'Job ' + id + ' not found.'); return j; };

  const handlers = {
    'ingestion.jobs.create': async (_a, { body }, ctx) => {
      const p = body.payload || {};
      if (!p.variables || !p.lead_hours) throw new ApiError(422, 'CONTRACT_INVALID', 'payload needs unit_level, variables and lead_hours (the national/ingest body).');
      return { data: await enqueue(p, { priority: body.priority ?? 100, max_attempts: body.max_attempts ?? 3 }, ctx), status: 201 };
    },
    'ingestion.jobs.list': async (_a, { query }) => ({ data: store.all('jobs').filter(j => !query.status || j.status === query.status).slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)), collection: true }),
    'ingestion.jobs.get': async (_a, { path }) => { const j = findJob(path.job_id); return { data: { ...j, run: j.run_id ? store.find('runs', r => r.run_id === j.run_id) : null } }; },
    'ingestion.jobs.retry': async (_a, { path }, ctx) => {
      const j = findJob(path.job_id);
      if (j.status === 'running') throw new ApiError(409, 'JOB_RUNNING', 'Job is running.');
      if (!['dead_letter', 'failed', 'cancelled'].includes(j.status)) throw new ApiError(409, 'JOB_NOT_RETRYABLE', 'Only dead-letter, failed or cancelled jobs can be retried (status ' + j.status + ').');
      j.status = 'queued'; j.attempts = 0; j.next_attempt_at = nowIso(); j.updated_at = nowIso(); j.history.push({ at: nowIso(), status: 'queued', reason: 'manual retry' });
      await store.save('jobs', 'workers'); await event('job.retried', { job_id: j.job_id }, ctx); return { data: j };
    },
    'ingestion.jobs.cancel': async (_a, { path }, ctx) => {
      const j = findJob(path.job_id);
      if (j.status === 'running') throw new ApiError(409, 'JOB_RUNNING', 'A running job cannot be cancelled; wait for it or let its lease expire.');
      if (!TERMINAL.includes(j.status)) { j.status = 'cancelled'; j.updated_at = nowIso(); j.history.push({ at: nowIso(), status: 'cancelled' }); await store.save('jobs', 'workers'); await event('job.cancelled', { job_id: j.job_id }, ctx); }
      return { data: j };
    },
    'ingestion.worker.runOnce': async (_a, { body }, ctx) => { await recover(ctx); return { data: await runOnce(body.worker_id, ctx) }; },
    'ingestion.schedules.create': async (_a, { body }, ctx) => {
      if (body.cadence_minutes < 15) throw new ApiError(422, 'CONTRACT_INVALID', 'cadence_minutes must be at least 15 to protect the provider quota.');
      const s = { schedule_id: newId('sch'), name: body.name, cadence_minutes: body.cadence_minutes, enabled: body.enabled !== false,
        next_run_at: body.next_run_at ? new Date(body.next_run_at).toISOString() : nowIso(), payload: body.payload, created_at: nowIso(), created_by: ctx.identity.actorId };
      await store.insert('schedules', s); await event('schedule.created', { schedule_id: s.schedule_id }, ctx); return { data: s, status: 201 };
    },
    'ingestion.schedules.list': async () => ({ data: store.all('schedules'), collection: true }),
    'ingestion.schedules.tick': async (_a, _p, ctx) => ({ data: await tick(ctx) }),
    'ingestion.observability.metrics': async () => {
      const jobs = store.all('jobs'); const c = (s) => jobs.filter(j => j.status === s).length;
      const runs = store.all('runs').filter(r => r.completed_at).sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at));
      return { data: { queueDepth: c('queued'), running: c('running'), completed: c('succeeded'), deadLetter: c('dead_letter'), cancelled: c('cancelled'),
        openAlerts: store.filter('alerts', a => a.status === 'open').length, retries: jobs.reduce((s, j) => s + Math.max(0, j.attempts - 1), 0),
        latestCoverage: runs[0] ? { run_id: runs[0].run_id, coverage: runs[0].coverage, status: runs[0].status, completed_at: runs[0].completed_at } : null,
        workers: { active: store.filter('workers', w => w.status === 'active').length, stale: store.filter('workers', w => w.status === 'stale').length },
        backgroundWorker: app.backgroundWorker } };
    },
    'ingestion.observability.alerts': async (_a, { query }) => {
      const st = query.status || 'open';
      let rows = store.all('alerts').filter(a => st === 'all' || a.status === st).slice().sort((a, b) => Date.parse(b.raised_at) - Date.parse(a.raised_at));
      if (query.limit) rows = rows.slice(0, Number(query.limit));
      return { data: rows, collection: true };
    },
    'ingestion.alerts.acknowledge': async (_a, { path, body }, ctx) => {
      const a = store.find('alerts', x => x.alert_id === path.alert_id);
      if (!a) throw new ApiError(404, 'NOT_FOUND', 'Alert ' + path.alert_id + ' not found.');
      if (a.status !== 'acknowledged') { a.status = 'acknowledged'; a.acknowledged_at = nowIso(); a.acknowledged_by = ctx.identity.actorId; a.note = body.note || null; await store.save('alerts'); await event('alert.acknowledged', { alert_id: a.alert_id }, ctx); }
      return { data: a };
    },
    'ingestion.workers.list': async () => ({ data: store.all('workers').map(w => ({ ...w, lease_active: !!(w.lease_expires_at && Date.parse(w.lease_expires_at) > Date.now()) })), collection: true }),
    'ingestion.workers.register': async (_a, { body }, ctx) => {
      const w = ensureWorker(body.worker_id, body.metadata || {}); w.status = 'active'; w.last_heartbeat_at = nowIso(); if (body.metadata) w.metadata = body.metadata;
      await store.save('jobs', 'workers'); await event('worker.registered', { worker_id: w.worker_id }, ctx); return { data: w, status: 201 };
    },
    'ingestion.workers.heartbeat': async (_a, { path, body }, ctx) => {
      const w = store.find('workers', x => x.worker_id === path.worker_id);
      if (!w) throw new ApiError(404, 'NOT_FOUND', 'Worker ' + path.worker_id + ' is not registered.');
      w.last_heartbeat_at = nowIso(); w.status = 'active';
      if (body.lease_token) {
        const j = store.find('jobs', x => x.lease && x.lease.token === body.lease_token && x.lease.worker_id === w.worker_id);
        if (!j) throw new ApiError(409, 'LEASE_TOKEN_INVALID', 'The lease token does not match a lease held by this worker.');
        j.lease.expires_at = new Date(Date.now() + LEASE_MS).toISOString(); w.lease_expires_at = j.lease.expires_at;
      }
      await store.save('jobs', 'workers'); return { data: w };
    },
    'ingestion.workers.recover': async (_a, _p, ctx) => ({ data: await recover(ctx) }),
    'ingestion.quotas.list': async () => {
      const today = app.provider.windowFor();
      const windows = store.filter('quotaWindows', w => w.providerId === PROVIDER_ID).slice().sort((a, b) => b.day.localeCompare(a.day)).slice(0, 14);
      return { data: { selectedProvider: { id: PROVIDER_ID, label: app.provider.label, tier: 'commercial', configured: app.provider.configured() },
        policy: { dailyCallLimit: app.provider.dailyLimit, enforcement: app.provider.dailyLimit ? 'local hard stop before the provider limit' : 'provider-enforced; local accounting only', countedUnits: ['calls', 'locations'], window: 'UTC day' },
        activeWindow: today, recentWindows: windows, resets: store.all('quotaResets').slice(-10) } };
    },
    'ingestion.quotas.reset': async (_a, { path, body }, ctx) => {
      requireConfirmed(body);
      if (path.provider_id !== PROVIDER_ID) throw new ApiError(404, 'NOT_FOUND', 'Provider ' + path.provider_id + ' is not configured.');
      const w = app.provider.windowFor(); const before = { calls: w.calls, locations: w.locations, backendWeighted: w.backendWeighted, browserWeighted: w.browserWeighted };
      w.calls = 0; w.locations = 0; w.quotaErrors = 0; w.backendWeighted = 0; w.browserWeighted = 0; w.reset = true;   /* v91.17.68 · the weighted counters are what the budget enforces (B22) */
      const rec = { reset_id: newId('qrs'), provider_id: PROVIDER_ID, reset: true, actor_id: ctx.identity.actorId, reason: body.reason, at: nowIso(), window: w.day, before,
        note: 'Resets this server\'s local accounting only. It cannot and does not reset the provider\'s own quota.' };
      await store.insert('quotaResets', rec); await event('quota.reset', { provider_id: PROVIDER_ID, reason: body.reason }, ctx); return { data: rec };
    },
    'ingestion.jobs.replay': async (_a, { path, body }, ctx) => {
      requireConfirmed(body);
      const src = findJob(path.job_id);
      if (!TERMINAL.includes(src.status)) throw new ApiError(409, 'JOB_NOT_RETRYABLE', 'Only terminal jobs can be replayed (status ' + src.status + ').');
      const j = await enqueue(src.payload, { priority: src.priority, max_attempts: src.max_attempts, replay_of: src.job_id }, ctx);
      const rec = { replay_id: newId('rpl'), source_job_id: src.job_id, new_job: j, reason: body.reason, actor_id: ctx.identity.actorId, at: nowIso() };
      await event('job.replayed', { source_job_id: src.job_id, new_job_id: j.job_id, reason: body.reason }, ctx); return { data: rec, status: 201 };
    },
    'ingestion.workerEvents.list': async () => ({ data: store.all('workerEvents').slice().reverse(), collection: true }),
  };
  return { handlers, runOnce, recover, tick, enqueue };
}
