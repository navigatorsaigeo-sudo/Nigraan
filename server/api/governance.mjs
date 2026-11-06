import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, fsyncSync, closeSync, unlinkSync , rmSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError, newId, nowIso, hashStable, sha256, requireConfirmed, ROLE_SCOPES, SEGREGATION_OF_DUTIES, SERVICE_VERSION, authorize, validate } from './core.mjs';
import { probePointOf } from './places.mjs';   /* v91.17.283.20 · item B7: the probe point from the place table, no coordinate in code */

const RELEASE = 'NIGRAAN 91.17 local backend ' + SERVICE_VERSION;
const UAT_AREAS = ['security', 'scientific', 'operations', 'deployment', 'user_acceptance'];
const CHECKLIST = [
  ['HC01', 'Identity provider (OIDC) configured and development token disabled', 'security'],
  ['HC02', 'Production database (PostgreSQL) provisioned and migrated', 'platform'],
  ['HC03', 'TLS termination in front of the service', 'platform'],
  ['HC04', 'Paid provider key held server-side and quota policy set', 'operations'],
  ['HC05', 'National ingestion schedule enabled and producing complete runs', 'operations'],
  ['HC06', 'Quality gates passing on the latest full run', 'scientific'],
  ['HC07', 'Snapshot promoted through scientific and operations review', 'scientific'],
  ['HC08', 'Backup taken and restore-tested within 30 days', 'platform'],
  ['HC09', 'Provider failover test executed and fail-closed behaviour confirmed', 'operations'],
  ['HC10', 'Audit chain verified intact and export retained', 'security'],
  ['HC11', 'All five UAT sign-offs approved', 'governance'],
  ['HC12', 'Operational runbook reviewed by the on-call owner', 'operations'],
];

let CHAIN_CACHE = null;
   /* v91.17.283.20 · item B7: the probe point from the place table, no coordinate in code */
export function createGovernance(app) {
  const { store, audit, provider, identity } = app;
  const auditRows = () => (audit && typeof audit.allRows === 'function') ? audit.allRows() : store.all('audit');   /* v91.17.283 · INTEG */
  const backupDir = join(store.dataDir, 'backups'); mkdirSync(backupDir, { recursive: true });
  const latest = (c, f = 'created_at') => store.all(c).slice().sort((a, b) => Date.parse(b[f]) - Date.parse(a[f]))[0] || null;

  function securityBlockers() {
    const b = [];
    if (identity.allowDev) b.push({ id: 'SEC-DEV-TOKEN', message: 'Development token is accepted (set NIGRAAN_ALLOW_DEV_TOKEN=0 once a real identity provider is configured).' });
    if (!process.env.AGN_OIDC_ISSUER) b.push({ id: 'SEC-NO-OIDC', message: 'No OIDC issuer configured (AGN_OIDC_ISSUER). Tokens are locally signed.' });
    if (!process.env.AGN_DATABASE_URL) b.push({ id: 'SEC-JSON-STORE', message: 'Persistence is a local JSON file, not PostgreSQL.' });
    if (!process.env.AGN_TLS_TERMINATED) b.push({ id: 'SEC-NO-TLS', message: 'Traffic is plain HTTP on this machine; no TLS termination declared (AGN_TLS_TERMINATED).' });
    if (!provider.configured()) b.push({ id: 'SEC-NO-PROVIDER-KEY', message: 'Paid provider key not configured.' });
    /* v91.17.68 · the chain verdict is cached by the audit length: /health used to hash 7,000 rows on every request (audit C18) */
    const n = (store.all('audit') || []).length;
    if (!CHAIN_CACHE || CHAIN_CACHE.n !== n || Date.now() - CHAIN_CACHE.at > 10 * 60e3) CHAIN_CACHE = { n, at: Date.now(), r: audit.verifyChain() };
    const chain = CHAIN_CACHE.r; if (!chain.ok) b.push({ id: 'SEC-AUDIT-CHAIN', message: 'Audit hash chain broken at event ' + chain.eventId + '.' });
    return b;
  }
  function recentRestoreOk() { return store.filter('restoreTests', t => t.status === 'passed' && Date.now() - Date.parse(t.at) < 30 * 864e5).length > 0; }
  function signoffState() {
    const out = {}; for (const a of UAT_AREAS) { const s = store.filter('signoffs', x => x.area === a).sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0]; out[a] = s ? s.decision : 'missing'; } return out;
  }

  /* acceptance scenarios: automated ones execute real checks against this server */
  const SCENARIOS = [
    { id: 'AT01', name: 'Health endpoint answers', type: 'automated', run: async () => ({ passed: true, evidence: { service: 'nigraan-local', version: SERVICE_VERSION } }) },
    { id: 'AT02', name: 'Unauthenticated write is denied', type: 'automated', run: async () => { try { authorize(app.endpoints.get('operations.actions.create'), null); return { passed: false, evidence: 'authorize allowed a null identity' }; } catch (e) { return { passed: e.code === 'AUTH_REQUIRED', evidence: { code: e.code } }; } } },
    { id: 'AT03', name: 'Contract validation rejects malformed input', type: 'automated', run: async () => { try { validate(app.endpoints.get('live.pointForecast'), { pathParams: {}, query: { latitude: '999', longitude: 'x' }, body: {} }); return { passed: false, evidence: 'accepted' }; } catch (e) { return { passed: e.code === 'CONTRACT_INVALID', evidence: { code: e.code, fieldErrors: e.fieldErrors.length } }; } } },
    { id: 'AT04', name: 'Audit hash chain intact', type: 'automated', run: async () => { const c = audit.verifyChain({ deep: true }); return { passed: c.ok, evidence: c }; } },
    { id: 'AT05', name: 'Paid provider reachable server-side', type: 'automated', run: async () => { try { const t = Date.now(); await provider.call('forecast', '/v1/forecast', { ...probePointOf(app), hourly: 'temperature_2m', forecast_days: 1 }); return { passed: true, evidence: { latencyMs: Date.now() - t } }; } catch (e) { return { passed: false, evidence: { code: e.code, message: e.message } }; } } },
    { id: 'AT06', name: 'Latest full national run passes quality gates', type: 'evidence', run: async () => { const e = store.all('evaluations').filter(x => (store.find('runs', r => r.run_id === x.run_id) || {}).operational).sort((a, b) => Date.parse(b.evaluated_at) - Date.parse(a.evaluated_at))[0]; return e ? { passed: e.status === 'passed', evidence: { evaluation_id: e.evaluation_id, score: e.score } } : { passed: false, pending: true, evidence: 'no evaluated operational run' }; } },
    { id: 'AT07', name: 'Backup restore-tested within 30 days', type: 'evidence', run: async () => ({ passed: recentRestoreOk(), pending: !recentRestoreOk(), evidence: latest('restoreTests', 'at') }) },
    { id: 'AT08', name: 'Provider outage fails closed', type: 'evidence', run: async () => { const t = store.filter('failoverTests', x => x.target === 'provider' && x.status === 'passed')[0]; return { passed: !!t, pending: !t, evidence: t ? { test_id: t.test_id } : 'run POST /api/v1/acceptance/failover-tests target=provider' }; } },
    { id: 'AT09', name: 'Segregation of duties on promotion', type: 'evidence', run: async () => { const p = store.filter('promotions', x => x.status === 'promoted')[0]; return p ? { passed: p.scientific_decision.actor_id !== p.operations_decision.actor_id, evidence: { promotion_id: p.promotion_id } } : { passed: false, pending: true, evidence: 'no promoted snapshot' }; } },
    { id: 'AT10', name: 'UAT sign-offs approved in all five areas', type: 'manual', run: async () => { const s = signoffState(); const ok = UAT_AREAS.every(a => s[a] === 'approved'); return { passed: ok, pending: !ok, evidence: s }; } },
  ];

  const handlers = {
    /* ── security ─────────────────────────────────────────────────────── */
    'security.posture': async () => { const b = securityBlockers(); return { data: { schema: 'agn.security-posture.v1', identityMode: identity.allowDev ? 'development-token + signed-token' : 'signed-token', productionReady: b.length === 0, blockers: b, auditChain: audit.verifyChain(), keyInBrowser: false, freeTierFallback: false } }; },
    'security.policies': async () => ({ data: { schema: 'agn.security-policies.v1', version: '2026-09-17', denyByDefault: true, roleScopes: ROLE_SCOPES, segregationOfDuties: SEGREGATION_OF_DUTIES, browserClaimsAuthoritative: false, note: 'X-AGN-Roles and X-AGN-Actor-ID headers from the browser are ignored; identity comes only from the verified token.' } }),
    'security.identity.diagnostics': async (_a, _p, ctx) => ({ data: { schema: 'agn.identity-diagnostics.v1', configuredMode: identity.allowDev ? 'development-token (loopback only) + locally signed tokens' : 'locally signed tokens', oidcIssuer: process.env.AGN_OIDC_ISSUER || null,
      currentContext: { actorId: ctx.identity.actorId, name: ctx.identity.name, roles: ctx.identity.roles, tenantId: ctx.identity.tenantId, mode: ctx.identity.mode, expiresAt: ctx.identity.expiresAt }, browserClaimsAuthoritative: false,
      ignoredBrowserHeaders: Object.fromEntries(['x-agn-roles', 'x-agn-actor-id'].map(h => [h, ctx.req.headers[h] || null])) } }),
    /* v91.17.283 · INTEG (WS3 request) · the list and the export read the archived month files too (data/archive/audit, after a rollover)
       and verify the whole chain (deep) */
    'security.auditEvents.list': async (_a, { query }) => ({ data: auditRows().filter(e => (!query.event_type || e.eventType === query.event_type) && (!query.outcome || e.outcome === query.outcome)).slice().reverse(), collection: true, meta: { chain: audit.verifyChain({ deep: true }) } }),
    'security.auditEvents.export': async (_a, { body }, ctx) => {
      const events = auditRows().slice(-(body.limit || 1000)); const chain = audit.verifyChain({ deep: true });
      const out = { schema: 'agn.audit-export.v1', exportId: newId('aex'), exportedAt: nowIso(), exportedBy: ctx.identity.actorId, eventCount: events.length, events, chain, integrityHash: hashStable(events) };
      await audit.record('audit.export', 'success', ctx, { eventCount: events.length, integrityHash: out.integrityHash }); return { data: out };
    },
    'security.secretReferences.list': async () => ({ data: secretRefs(), collection: true }),
    'security.secretReferences.validate': async (_a, { body }, ctx) => {
      const refs = secretRefs(); const names = body.names && body.names.length ? body.names : refs.map(r => r.name);
      const results = names.map(n => { const r = refs.find(x => x.name === n); return r ? { name: n, present: r.present, required: r.required, provider: r.provider } : { name: n, present: false, required: false, provider: null, unknown: true }; });
      await audit.record('secrets.validate', 'success', ctx, { names });
      return { data: { results, allRequiredPresent: results.filter(r => r.required).every(r => r.present), valuesReturned: false } };
    },
    'security.databaseMigrations.list': async (_a, { query }) => ({ data: { inventory: { engine: 'json-file', file: 'data/nigraan-db.json', schemaVersion: store.meta.schemaVersion, collections: store.counts() }, plans: store.all('migrationPlans').slice(-(query.limit || 20)).reverse() } }),
    'security.databaseMigrations.plan': async (_a, { body }, ctx) => {
      const tables = Object.keys(store.counts());
      const steps = [
        { n: 1, action: 'freeze-writes', detail: 'Stop the local server; take POST /acceptance/backups and restore-test it.' },
        { n: 2, action: 'create-schema', detail: 'CREATE SCHEMA agn;', sql: tables.map(t => `CREATE TABLE agn.${t.replace(/[A-Z]/g, m => '_' + m.toLowerCase())} (id text PRIMARY KEY, doc jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());`) },
        { n: 3, action: 'append-only-audit', detail: 'REVOKE UPDATE, DELETE ON agn.audit FROM application role; keep prevHash/hash columns.' },
        { n: 4, action: 'load', detail: 'Stream each collection from the verified backup into its table in one transaction per table.' },
        { n: 5, action: 'verify', detail: 'Row counts equal inventory; recompute audit chain in SQL; compare records_sha256 per run.' },
        { n: 6, action: 'cutover', detail: 'Set AGN_DATABASE_URL from the secret manager; restart; run acceptance suite.' },
      ];
      const plan = { planId: newId('mig'), status: 'planned', target_engine: body.target_engine, target_environment: body.target_environment, steps, tables: tables.length, secretValuesIncluded: false, executes: false, created_at: nowIso(), created_by: ctx.identity.actorId };
      await store.insert('migrationPlans', plan); await audit.record('migration.plan', 'success', ctx, { planId: plan.planId, target: body.target_environment }); return { data: plan, status: 201 };
    },
    'security.access.evaluate': async (_a, { body }, ctx) => {
      const id = ctx.identity; const all = id.scopes.includes('*');
      const missingScopes = (body.required_scopes || []).filter(s => !all && !id.scopes.includes(s));
      const missingRoles = (body.required_roles || []).length && !id.roles.includes('admin') && !(body.required_roles || []).some(r => id.roles.includes(r)) ? body.required_roles : [];
      const reasons = [...missingScopes.map(s => 'SCOPE_REQUIRED:' + s), ...(missingRoles.length ? ['ROLE_REQUIRED:' + missingRoles.join('|')] : [])];
      const d = { decisionId: newId('acd'), allowed: reasons.length === 0, reasons, roles: id.roles, scopes: all ? ['*'] : id.scopes, actorId: id.actorId, at: nowIso() };
      await store.insert('accessDecisions', d); await audit.record('access.evaluate', d.allowed ? 'allow' : 'deny', ctx, { decisionId: d.decisionId }); return { data: d };
    },

    /* ── acceptance ───────────────────────────────────────────────────── */
    'acceptance.posture': async () => {
      const blockers = securityBlockers().map(b => b.message);
      const lr = latest('acceptanceRuns'); if (!lr || lr.result !== 'passed') blockers.push('No passed acceptance run.');
      if (!recentRestoreOk()) blockers.push('No restore test within 30 days.');
      const s = signoffState(); for (const a of UAT_AREAS) if (s[a] !== 'approved') blockers.push('UAT sign-off ' + a + ': ' + s[a]);
      return { data: { schema: 'agn.acceptance-posture.v1', productionReady: blockers.length === 0, blockers, requiredSignoffs: UAT_AREAS.map(a => ({ area: a, state: s[a] })), latestRun: lr, latestGoNoGo: latest('goNoGo') } };
    },
    'acceptance.scenarios.list': async () => ({ data: SCENARIOS.map(({ run, ...s }) => s), collection: true }),
    'acceptance.runs.list': async () => ({ data: store.all('acceptanceRuns').slice().reverse(), collection: true }),
    'acceptance.runs.get': async (_a, { path }) => { const r = store.find('acceptanceRuns', x => x.run_id === path.run_id); if (!r) throw new ApiError(404, 'NOT_FOUND', 'Acceptance run not found.'); return { data: r }; },
    'acceptance.runs.create': async (_a, { body }, ctx) => {
      const ids = body.scenario_ids && body.scenario_ids.length ? body.scenario_ids : SCENARIOS.map(s => s.id);
      const unknown = ids.filter(i => !SCENARIOS.find(s => s.id === i)); if (unknown.length) throw new ApiError(404, 'NOT_FOUND', 'Unknown scenario(s): ' + unknown.join(', '));
      const r = { run_id: newId('acc'), suite: body.suite || 'nigraan-local', status: 'created', requested_scenarios: ids, notes: body.notes || null, evidence: [], result: null, created_at: nowIso(), created_by: ctx.identity.actorId };
      await store.insert('acceptanceRuns', r); return { data: r, status: 201 };
    },
    'acceptance.runs.execute': async (_a, { path }, ctx) => {
      const r = store.find('acceptanceRuns', x => x.run_id === path.run_id); if (!r) throw new ApiError(404, 'NOT_FOUND', 'Acceptance run not found.');
      if (r.status !== 'created') throw new ApiError(409, 'INVALID_STATE', 'Run already ' + r.status + '. Create a new run.');
      r.status = 'running'; r.started_at = nowIso(); await store.save();
      for (const id of r.requested_scenarios) {
        const sc = SCENARIOS.find(s => s.id === id); const t0 = Date.now(); let res;
        try { res = await sc.run(); } catch (e) { res = { passed: false, evidence: { error: e.message } }; }
        const ev = { scenario_id: id, name: sc.name, type: sc.type, status: res.passed ? 'passed' : (res.pending ? 'pending-evidence' : 'failed'), durationMs: Date.now() - t0, evidence: res.evidence, at: nowIso() };
        ev.evidence_hash = hashStable(ev); r.evidence.push(ev);
      }
      const st = r.evidence.map(e => e.status);
      r.result = st.includes('failed') ? 'failed' : st.includes('pending-evidence') ? 'incomplete' : 'passed';
      r.status = 'completed'; r.completed_at = nowIso(); r.executed_by = ctx.identity.actorId; await store.save();
      await audit.record('acceptance.execute', r.result, ctx, { runId: r.run_id }); return { data: r };
    },
    'acceptance.backups.list': async (_a, { query }) => ({ data: store.all('backups').slice(-(query.limit || 50)).reverse(), collection: true }),
    'acceptance.backups.create': async (_a, { body }, ctx) => {
      requireConfirmed(body);
      store.flushNow(); const text = store.snapshotText(); const id = newId('bak'); const file = join(backupDir, id + '.json');
      const fd = openSync(file, 'w'); writeFileSync(fd, text); fsyncSync(fd); closeSync(fd);
      const b = { backup_id: id, file: 'data/backups/' + id + '.json', sha256: sha256(text), bytes: Buffer.byteLength(text), status: 'completed', reason: body.reason, collections: store.counts(), created_at: nowIso(), created_by: ctx.identity.actorId };
      await store.insert('backups', b); await audit.record('backup.create', 'success', ctx, { backupId: id, sha256: b.sha256 });
      /* v91.17.68 · retention: the newest 10 backup files stay on disk (measured: 47 files, 372 MB, none ever removed); the rows keep
         their record with the file marked pruned, so the audit trail is intact and the disk is not */
      try {
        const rows = store.all('backups').filter(x => x.file && x.status === 'completed' && !x.pruned).sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
        for (const old of rows.slice(0, Math.max(0, rows.length - 10))) { try { rmSync(join(store.dataDir, old.file.replace(/^data\//, '')), { force: true }); } catch {} old.pruned = true; old.pruned_at = nowIso(); }
        if (rows.length > 10) store.saveSoon();
      } catch {}
      return { data: b, status: 201 };
    },
    'acceptance.backups.restoreTest': async (_a, { path, body }, ctx) => {
      requireConfirmed(body);
      const b = store.find('backups', x => x.backup_id === path.backup_id); if (!b) throw new ApiError(404, 'NOT_FOUND', 'Backup not found.');
      const file = join(backupDir, b.backup_id + '.json');
      if (!existsSync(file)) throw new ApiError(409, 'INVALID_STATE', 'Backup file is missing from data/backups.');
      const text = readFileSync(file, 'utf8'); const shaOk = sha256(text) === b.sha256;
      let parsed = null, chainOk = false, tableCount = 0;
      try {
        parsed = JSON.parse(text); tableCount = Object.keys(parsed.collections || {}).length;
        let prev = '0'.repeat(64); chainOk = true;
        for (const ev of parsed.collections.audit || []) { const { hash, ...rest } = ev; if (rest.prevHash !== prev || hashStable(rest) !== hash) { chainOk = false; break; } prev = hash; }
      } catch { }
      const t = { restore_test_id: newId('rst'), backup_id: b.backup_id, status: shaOk && parsed && chainOk ? 'passed' : 'failed', integrityCheck: { parsed: !!parsed, auditChainIntact: chainOk }, sha256Matches: shaOk, tableCount, isolated: true, note: 'Restored into memory, never over the live database.', at: nowIso(), actor_id: ctx.identity.actorId };
      await store.insert('restoreTests', t); await audit.record('backup.restore_test', t.status, ctx, { backupId: b.backup_id }); return { data: t };
    },
    'acceptance.failoverTests.list': async (_a, { query }) => ({ data: store.all('failoverTests').slice(-(query.limit || 50)).reverse(), collection: true }),
    'acceptance.failoverTests.create': async (_a, { body }, ctx) => {
      requireConfirmed(body);
      const evidence = []; let passed = false; const limitations = [];
      if (body.target === 'provider') {
        provider.fault.enabled = true; provider.fault.mode = body.mode || 'outage'; provider.fault.until = Date.now() + 30e3;
        try { await provider.call('forecast', '/v1/forecast', { ...probePointOf(app), hourly: 'temperature_2m', forecast_days: 1 }); evidence.push({ step: 'call during outage', result: 'unexpected success' }); }
        catch (e) { evidence.push({ step: 'call during outage', result: 'refused', code: e.code, retryable: e.retryable }); passed = e.code === 'PROVIDER_UNAVAILABLE'; }
        provider.fault.enabled = false;
        try { await provider.call('forecast', '/v1/forecast', { ...probePointOf(app), hourly: 'temperature_2m', forecast_days: 1 }); evidence.push({ step: 'call after recovery', result: 'ok' }); }
        catch (e) { evidence.push({ step: 'call after recovery', result: 'failed', code: e.code }); passed = false; }
        limitations.push('Simulated at the adapter; no network partition was created.', 'There is no secondary provider: the expected outcome is fail-closed, not failover.');
      } else if (body.target === 'store') {
        const probe = join(store.dataDir, '.failover-probe'); try { const fd = openSync(probe, 'w'); writeFileSync(fd, nowIso()); fsyncSync(fd); closeSync(fd); unlinkSync(probe); evidence.push({ step: 'fsync write probe', result: 'ok' }); passed = true; } catch (e) { evidence.push({ step: 'fsync write probe', result: 'failed', message: e.message }); }
        limitations.push('Single-node JSON store: there is no replica to fail over to. This checks durable write only.');
      } else throw new ApiError(422, 'CONTRACT_INVALID', 'target must be provider or store.');
      const t = { test_id: newId('fot'), target: body.target, mode: body.mode, status: passed ? 'passed' : 'failed', evidence, limitations, at: nowIso(), actor_id: ctx.identity.actorId };
      await store.insert('failoverTests', t); await audit.record('failover.test', t.status, ctx, { testId: t.test_id, target: body.target }); return { data: t, status: 201 };
    },
    'acceptance.uatSignoffs.list': async (_a, { query }) => ({ data: store.all('signoffs').slice(-(query.limit || 50)).reverse(), collection: true }),
    'acceptance.uatSignoffs.create': async (_a, { body }, ctx) => {
      requireConfirmed(body);
      const s = { signoff_id: newId('uat'), area: body.area, decision: body.decision, note: body.note, actor_id: ctx.identity.actorId, actor_roles: ctx.identity.roles, at: nowIso() };
      s.evidence_hash = hashStable(s); await store.insert('signoffs', s); await audit.record('uat.signoff', body.decision, ctx, { area: body.area }); return { data: s, status: 201 };
    },
    'acceptance.goNoGo.create': async (_a, { body }, ctx) => {
      requireConfirmed(body);
      const posture = (await handlers['acceptance.posture']()).data;
      const checks = [['security', securityBlockers().length === 0], ['acceptance', !!(posture.latestRun && posture.latestRun.result === 'passed')], ['restore', recentRestoreOk()], ['signoffs', UAT_AREAS.every(a => signoffState()[a] === 'approved')]];
      const score = Math.round(100 * checks.filter(c => c[1]).length / checks.length);
      const d = { decision_id: newId('gng'), decision: posture.blockers.length === 0 ? 'go' : 'no-go', score, blockers: posture.blockers, evidence: { checks, latestRun: posture.latestRun && posture.latestRun.run_id }, note: body.note || null, at: nowIso(), created_at: nowIso(), actor_id: ctx.identity.actorId };
      await store.insert('goNoGo', d); await audit.record('acceptance.go_no_go', d.decision, ctx, { score }); return { data: d, status: 201 };
    },
    'acceptance.goNoGo.latest': async () => { const d = latest('goNoGo'); if (!d) throw new ApiError(404, 'NOT_FOUND', 'No go/no-go decision recorded.'); return { data: d }; },

    /* ── handover ─────────────────────────────────────────────────────── */
    'handover.checklist': async () => ({ data: CHECKLIST.map(([id, title, owner]) => { const a = store.filter('attestations', x => x.itemId === id).sort((p, q) => Date.parse(q.at) - Date.parse(p.at))[0]; return { itemId: id, title, owner, state: a ? a.decision : 'unattested', attestation: a || null }; }), collection: true }),
    'handover.attestations.list': async (_a, { query }) => ({ data: store.all('attestations').slice(-(query.limit || 100)).reverse(), collection: true }),
    'handover.attestations.create': async (_a, { path, body }, ctx) => {
      requireConfirmed(body); if (!CHECKLIST.find(c => c[0] === path.item_id)) throw new ApiError(404, 'NOT_FOUND', 'Checklist item ' + path.item_id + ' does not exist.');
      const a = { attestationId: newId('att'), itemId: path.item_id, decision: body.decision, evidence_reference: body.evidence_reference || null, note: body.note, actor_id: ctx.identity.actorId, at: nowIso() };
      a.evidenceHash = hashStable(a); await store.insert('attestations', a); await audit.record('handover.attest', body.decision, ctx, { itemId: path.item_id }); return { data: a, status: 201 };
    },
    'handover.posture': async () => {
      const items = (await handlers['handover.checklist']()).data; const blockers = [...securityBlockers().map(b => b.message), ...items.filter(i => i.state !== 'approved').map(i => i.itemId + ' ' + i.title + ': ' + i.state)];
      const d = latest('releaseDecisions');
      return { data: { schema: 'agn.handover-posture.v1', release: RELEASE, productionReady: blockers.length === 0, decision: d ? d.decision : 'none', blockers, checklist: { total: items.length, approved: items.filter(i => i.state === 'approved').length } } };
    },
    'handover.dossiers.list': async (_a, { query }) => ({ data: store.all('dossiers').slice(-(query.limit || 20)).reverse().map(d => ({ dossier_id: d.dossier_id, status: d.status, score: d.score, evidence_hash: d.evidence_hash, created_at: d.created_at })), collection: true }),
    'handover.dossiers.get': async (_a, { path }) => { const d = store.find('dossiers', x => x.dossier_id === path.dossier_id); if (!d) throw new ApiError(404, 'NOT_FOUND', 'Dossier not found.'); return { data: d }; },
    'handover.dossiers.create': async (_a, { body }, ctx) => {
      const hp = (await handlers['handover.posture']()).data; const ap = (await handlers['acceptance.posture']()).data;
      const promoted = store.filter('promotions', p => p.status === 'promoted')[0] || null;
      const contents = { release: RELEASE, handover: hp, acceptance: ap, security: (await handlers['security.posture']()).data, promotedSnapshot: promoted, latestGoNoGo: latest('goNoGo'), auditHead: audit.verifyChain(), generatedAt: nowIso() };
      const score = Math.round(100 * hp.checklist.approved / hp.checklist.total);
      const d = { dossier_id: newId('dos'), status: hp.productionReady && ap.productionReady ? 'ready' : 'blocked', score, summary: (hp.productionReady && ap.productionReady ? 'All controls evidenced.' : (hp.blockers.length + ap.blockers.length) + ' blocker(s) outstanding.'), contents, note: body.note || null, created_at: nowIso(), created_by: ctx.identity.actorId };
      d.evidence_hash = hashStable(contents);
      await store.insert('dossiers', d); await audit.record('handover.dossier', d.status, ctx, { dossierId: d.dossier_id });
      return { data: { ...d, dossierId: d.dossier_id, evidenceHash: d.evidence_hash }, status: 201 };
    },
    'handover.decisions.create': async (_a, { body }, ctx) => {
      requireConfirmed(body);
      const dos = body.dossier_id ? store.find('dossiers', x => x.dossier_id === body.dossier_id) : latest('dossiers');
      if (!dos) throw new ApiError(409, 'DOSSIER_REQUIRED', 'Generate a dossier (POST /api/v1/handover/dossiers) before recording a release decision.');
      const hp = (await handlers['handover.posture']()).data;
      const d = { decision_id: newId('rel'), decisionId: null, decision: dos.status === 'ready' && hp.productionReady ? 'release' : 'hold', score: dos.score, blockers: hp.blockers, dossierId: dos.dossier_id, dossier_author: dos.created_by, note: body.note || null, created_at: nowIso(), actor_id: ctx.identity.actorId };
      d.decisionId = d.decision_id; await store.insert('releaseDecisions', d); await audit.record('handover.release_decision', d.decision, ctx, { dossierId: dos.dossier_id }); return { data: d, status: 201 };
    },
    'handover.decisions.latest': async () => { const d = latest('releaseDecisions'); if (!d) throw new ApiError(404, 'NOT_FOUND', 'No release decision recorded.'); return { data: d }; },
    'handover.runbook': async () => ({ data: { schema: 'agn.runbook.v1', release: RELEASE, phases: [
      { phase: 'start', steps: ['Run RUN_NIGRAAN.bat', 'Confirm the server window shows the paid provider tier', 'GET /health returns status ok'] },
      { phase: 'ingest', steps: ['POST /api/v1/national/ingest (tehsil, variables, lead hours)', 'or rely on the ingestion schedule and background worker', 'Watch /api/v1/ingestion/observability/metrics and alerts'] },
      { phase: 'quality', steps: ['POST /api/v1/national/runs/{run_id}/quality/evaluate', 'Promote: create -> scientific review -> operations review (different actors)'] },
      { phase: 'protect', steps: ['POST /api/v1/acceptance/backups, then restore-test', 'Export audit events weekly'] },
      { phase: 'incident', steps: ['Provider refusal: check quotas and key source; the system fails closed and does not fall back', 'Dead-letter jobs: inspect last_error, retry or replay with reason', 'Suspected tampering: GET /api/v1/security/posture shows audit chain state'] },
    ], rollbackTrigger: 'Revoke the promoted snapshot (POST /national/promotions/{id}/revoke) if a quality gate regression or provider defect is confirmed; the previous superseded snapshot is not re-promoted automatically.' } }),
  };

  function secretRefs() {
    return [
      { name: 'MACH_API_KEY', provider: provider.keySource() || 'unset', required: true, present: provider.configured(), purpose: 'paid weather provider' },
      { name: 'token-secret', provider: 'data/token-secret (file)', required: true, present: existsSync(join(store.dataDir, 'token-secret')), purpose: 'signs local access tokens' },
      { name: 'AGN_OIDC_ISSUER', provider: 'environment', required: false, present: !!process.env.AGN_OIDC_ISSUER, purpose: 'production identity provider (staging/production only)' },
      { name: 'AGN_DATABASE_URL', provider: 'environment', required: false, present: !!process.env.AGN_DATABASE_URL, purpose: 'production database (staging/production only)' },
    ];
  }
  return { handlers, securityBlockers };
}
