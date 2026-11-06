/* Contract enforcement shared by all 89 endpoints: identity, scopes/roles,
   request validation against the artefact's own contract, idempotency, envelopes,
   pagination and a hash-chained audit log. */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { join, basename } from 'node:path';
import { newId, nowIso, hashStable, sha256, appendLineSync } from './store.mjs';

export const API_VERSION = '1.0';
/* v91.17.34 · AUDIT F5 · one source of truth: package.json. /health, the API envelope and the release name read it. */
const _pkg = (() => { try { return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')); } catch { return {}; } })();
export const SERVICE_VERSION = String(_pkg.version || '91.17') + '-local';

const BASE = {
  viewer: ['hazards:read', 'forecast:read', 'evidence:read', 'units:read', 'model-verification:read'],
  analyst: ['hazards:read', 'forecast:read', 'evidence:read', 'units:read', 'model-verification:read', 'risk:explain', 'assessments:write', 'hybrid-experiments:write', 'urban-heat:read', 'urban-heat:estimate'],
  operator: ['hazards:read', 'forecast:read', 'evidence:read', 'units:read', 'operations:read', 'actions:write', 'outcomes:write',
    'forecast:write', 'national-runs:read', 'ingestion-jobs:read', 'ingestion-jobs:write', 'ingestion-schedules:read', 'ingestion-schedules:write',
    'observability:read', 'observability:write', 'ingestion-workers:read', 'ingestion-workers:write', 'provider-quotas:read', 'providers:read', 'quality:read', 'promotions:read'],
  supervisor: ['hazards:read', 'forecast:read', 'evidence:read', 'units:read', 'operations:read', 'actions:write', 'outcomes:write', 'actions:approve'],
  approver: ['hazards:read', 'forecast:read', 'evidence:read', 'units:read', 'operations:read', 'actions:approve'],
  scientific_reviewer: ['quality:read', 'quality:evaluate', 'promotions:read', 'promotions:write', 'promotions:scientific-review', 'national-runs:read', 'model-verification:read', 'model-verification:write', 'uat:read', 'uat:write', 'handover:read', 'handover:write', 'acceptance:read'],
  operations_approver: ['quality:read', 'promotions:read', 'promotions:operations-review', 'promotions:revoke', 'national-runs:read', 'uat:read', 'uat:write', 'handover:read', 'handover:write', 'acceptance:read', 'operations:read'],
  security_auditor: ['security:posture:read', 'security:policies:read', 'security:identity:read', 'security:access:evaluate', 'audit:read', 'audit:export', 'secrets:read', 'migrations:read', 'uat:read', 'uat:write', 'handover:read', 'handover:write', 'acceptance:read'],
  platform_admin: ['security:posture:read', 'security:policies:read', 'security:identity:read', 'security:access:evaluate', 'audit:read', 'audit:export', 'secrets:read', 'secrets:validate', 'migrations:read', 'migrations:plan', 'acceptance:read', 'acceptance:write', 'backups:write', 'resilience:write', 'uat:read', 'uat:write', 'handover:read', 'handover:write'],
  admin: ['*'],
};
export const ROLE_SCOPES = Object.freeze(BASE);
export const SEGREGATION_OF_DUTIES = [
  { rule: 'scientific-vs-operations-review', description: 'The actor who records the scientific review of a promotion cannot record its operations review.' },
  { rule: 'action-creator-vs-approver', description: 'An action cannot be approved by the actor who created it.' },
  { rule: 'dossier-vs-release-decision', description: 'Recorded, not enforced, in local development: a release decision names both dossier author and decision actor.' },
];

export class ApiError extends Error {
  constructor(status, code, message, { retryable = false, details = {}, fieldErrors = [] } = {}) {
    super(message); this.status = status; this.code = code; this.retryable = retryable; this.details = details; this.fieldErrors = fieldErrors;
  }
}

/* ── identity ─────────────────────────────────────────────────────────── */
export function createIdentity(dataDir) {
  const secretFile = join(dataDir, 'token-secret');
  /* v91.17.283 · WS3 · created exclusively ('wx': two processes starting together cannot both write a different secret) and fsynced */
  if (!existsSync(secretFile)) { try { const fd = openSync(secretFile, 'wx', 0o600); try { writeFileSync(fd, randomBytes(32).toString('hex')); fsyncSync(fd); } finally { closeSync(fd); } } catch (e) { if (e.code !== 'EEXIST') throw e; } }
  const secret = readFileSync(secretFile, 'utf8').trim();
  /* v91.17.16 · SEC-12 · an admin token with scope '*' was enabled by DEFAULT and
     had to be switched off. A development convenience that ships on is a
     production credential. It is opt-in now: NIGRAAN_ALLOW_DEV_TOKEN=1. The
     loopback restriction below is kept as the second lock, not the only one. */
  const allowDev = process.env.NIGRAAN_ALLOW_DEV_TOKEN === '1';
  const b64u = (b) => Buffer.from(b).toString('base64url');
  const mac = (s) => createHmac('sha256', secret).update(s).digest('base64url');

  function issue({ sub, name, roles, tenantId = 'agn-development', ttlHours = 8 }) {
    const now = Math.floor(Date.now() / 1000);
    const body = b64u(JSON.stringify({ iss: 'nigraan-local', aud: 'agn-nigraan', sub, name: name || sub, roles, tenantId, iat: now, exp: now + ttlHours * 3600 }));
    return 'agn1.' + body + '.' + mac('agn1.' + body);
  }
  function scopesFor(roles) {
    const s = new Set(); for (const r of roles || []) for (const x of (ROLE_SCOPES[r] || [])) s.add(x); return [...s];
  }
  function resolve(req) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const remote = req.socket.remoteAddress || '';
    const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    if (!token) return null;
    if (token === 'agn-dev-token') {
      if (!allowDev) throw new ApiError(401, 'AUTH_REQUIRED', 'The development token is disabled on this server (NIGRAAN_ALLOW_DEV_TOKEN=0).');
      if (!loopback) throw new ApiError(401, 'AUTH_REQUIRED', 'The development token is accepted only from this machine.');
      return { mode: 'development-token', actorId: 'dev-admin', name: 'Development Administrator', roles: ['admin'], scopes: ['*'], tenantId: 'agn-development', trusted: true, expiresAt: null };
    }
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'agn1') throw new ApiError(401, 'AUTH_REQUIRED', 'Token format is not recognised.');
    const expect = mac(parts[0] + '.' + parts[1]);
    const a = Buffer.from(expect), b = Buffer.from(parts[2]);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(401, 'AUTH_REQUIRED', 'Token signature is invalid.');
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (p.exp * 1000 < Date.now()) throw new ApiError(401, 'AUTH_REQUIRED', 'Token has expired.');
    return { mode: 'signed-token', actorId: p.sub, name: p.name, roles: p.roles || [], scopes: scopesFor(p.roles), tenantId: p.tenantId, trusted: true, expiresAt: new Date(p.exp * 1000).toISOString() };
  }
  return { issue, resolve, scopesFor, allowDev };
}

export function authorize(endpoint, identity) {
  const reasons = [], missingScopes = [], missingRoles = [];
  if (endpoint.auth.required && !identity) throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  if (!identity) return { allowed: true, reasons };
  const all = identity.scopes.includes('*');
  for (const s of endpoint.auth.scopes || []) if (!all && !identity.scopes.includes(s)) missingScopes.push(s);
  if (missingScopes.length) throw new ApiError(403, 'SCOPE_REQUIRED', 'Required scope is missing: ' + missingScopes.join(', '), { details: { missingScopes } });
  const roles = endpoint.auth.roles || [];
  if (roles.length && !identity.roles.includes('admin') && !roles.some(r => identity.roles.includes(r))) {
    missingRoles.push(...roles);
    throw new ApiError(403, 'ROLE_REQUIRED', 'One of these roles is required: ' + roles.join(', '), { details: { requiredRoles: roles } });
  }
  if (endpoint.method !== 'GET' && !identity.trusted) throw new ApiError(403, 'TRUSTED_SESSION_REQUIRED', 'A trusted authenticated session is required for this write.');
  return { allowed: true, reasons };
}

/* ── validation against the artefact's own field contract ─────────────── */
function coerce(field, raw, where) {
  const t = field.type;
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (t === 'array') {
    if (Array.isArray(raw)) return raw.flatMap(x => typeof x === 'string' && where === 'query' ? x.split(',') : [x]).filter(x => x !== '');
    return String(raw).split(',').filter(Boolean);
  }
  if (t === 'integer') { const n = Number(raw); return Number.isInteger(n) ? n : NaN; }
  if (t === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : NaN; }
  if (t === 'boolean') { if (raw === true || raw === 'true') return true; if (raw === false || raw === 'false') return false; return 'INVALID'; }
  return raw;
}
export function validate(endpoint, { pathParams, query, body }) {
  const errors = [], out = { path: {}, query: {}, body: {} };
  const check = (fields, src, where) => {
    for (const f of fields || []) {
      let v = coerce(f, src[f.name], where);
      const at = where + '.' + f.name;
      if (v === undefined) { if (f.required) errors.push({ field: at, code: 'required', message: f.name + ' is required.' }); continue; }
      const t = f.type;
      if ((t === 'integer' || t === 'number') && Number.isNaN(v)) { errors.push({ field: at, code: 'type', message: f.name + ' must be ' + t + '.' }); continue; }
      if (t === 'boolean' && v === 'INVALID') { errors.push({ field: at, code: 'type', message: f.name + ' must be boolean.' }); continue; }
      if (t === 'object' && (typeof v !== 'object' || Array.isArray(v))) { errors.push({ field: at, code: 'type', message: f.name + ' must be an object.' }); continue; }
      if (t === 'string' && typeof v !== 'string') { errors.push({ field: at, code: 'type', message: f.name + ' must be a string.' }); continue; }
      if (t === 'date-time' && Number.isNaN(Date.parse(v))) { errors.push({ field: at, code: 'type', message: f.name + ' must be an ISO-8601 date-time.' }); continue; }
      if (f.enum && f.enum.length) {
        const vals = Array.isArray(v) ? v : [v];
        const bad = vals.filter(x => !f.enum.map(String).includes(String(x)));
        if (bad.length) { errors.push({ field: at, code: 'enum', message: f.name + ' must be one of ' + f.enum.join(', ') + '.' }); continue; }
      }
      if (f.min != null && typeof v === 'number' && v < f.min) errors.push({ field: at, code: 'minimum', message: f.name + ' must be >= ' + f.min + '.' });
      if (f.max != null && typeof v === 'number' && v > f.max) errors.push({ field: at, code: 'maximum', message: f.name + ' must be <= ' + f.max + '.' });
      out[where][f.name] = v;
    }
  };
  check(endpoint.request.path, pathParams, 'path');
  check(endpoint.request.query, query, 'query');
  check(endpoint.request.body, body, 'body');
  if (errors.length) throw new ApiError(422, 'CONTRACT_INVALID', 'Request violates the endpoint contract.', { fieldErrors: errors });
  // pass through undeclared query keys (e.g. probe) so handlers can read them
  for (const [k, v] of Object.entries(query)) if (!(k in out.query)) out.query[k] = v;
  return out;
}

/* ── envelopes ────────────────────────────────────────────────────────── */
export function success(endpoint, ctx, data, { meta = {}, pagination = null } = {}) {
  return {
    ok: true, apiVersion: API_VERSION, contract: { id: endpoint.id, version: endpoint.version },
    requestId: ctx.requestId, traceId: ctx.traceId, generatedAt: nowIso(),
    data, meta: Object.assign({ service: 'nigraan-local', serviceVersion: SERVICE_VERSION }, meta), pagination, errors: [],
  };
}
export function failure(err, ctx) {
  return {
    ok: false,
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal error', retryable: !!err.retryable, details: err.details || {}, fieldErrors: err.fieldErrors || [] },
    requestId: ctx.requestId, traceId: ctx.traceId,
  };
}

export function paginate(rows, query, endpoint) {
  const mode = endpoint.pagination.mode;
  if (mode === 'none') return { page: rows, pagination: null };
  const def = endpoint.pagination.defaultLimit || 50, max = endpoint.pagination.maxLimit || 1000;
  const limit = Math.min(Math.max(1, Number(query.limit) || def), max);
  let offset = 0;
  if (query.cursor) {
    try { offset = Number(JSON.parse(Buffer.from(String(query.cursor), 'base64url').toString()).o) || 0; }
    catch { offset = Number(query.cursor) || 0; }
  }
  const page = rows.slice(offset, offset + limit);
  const next = offset + limit < rows.length ? Buffer.from(JSON.stringify({ o: offset + limit })).toString('base64url') : null;
  return { page, pagination: { mode, limit, offset, total: rows.length, nextCursor: next } };
}

/* ── audit: every row carries the hash of the previous one ────────────── */
/* ══ v91.17.283 · WS3 · THE AUDIT LOG ROLLS OVER (BY MONTH AND BY SIZE), THE CHAIN CONTINUES ═══════════════════════════════════════════
   The audit rows lived in the database for ever (retention 7 years): the collection only grew, and every save carried it. Now:
     - rows of an earlier Pakistan month are moved to data/archive/audit/audit_YYYY-MM.jsonl (one JSON row per line, appended, fsynced);
     - when the rows still in the database pass NIGRAAN_AUDIT_ROLL_MB (default 4 MB), the older half is moved the same way;
     - the database keeps auditArchive = { headHash, headEventId, archivedCount, segments }: the next row's prevHash is headHash when the
       database holds no row, so the chain runs on unbroken across the files and the database;
     - a move is resumable: the rows are written to the month file first (a row already there, by eventId, is not written twice), then
       taken out of the database in one save with the new head; a stop between the two only repeats the removal;
     - verifyChain() checks the rows in the database from the archived head; verifyChain({ deep: true }) also reads every month file from
       the first row. Nothing is deleted. */
const ZERO64 = '0'.repeat(64);
const pktMonth = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 5 * 3600e3).toISOString().slice(0, 7) : null; };
export function createAudit(store, opts = {}) {
  const retentionDays = Number(process.env.NIGRAAN_AUDIT_RETENTION_DAYS || 2555);
  const ADIR = join(opts.dataDir || store.dataDir || '.', 'archive', 'audit');
  const ROLL_BYTES = Math.max(16 * 1024, (Number(process.env.NIGRAAN_AUDIT_ROLL_MB) || 4) * 1048576);
  const meta = () => (store.meta && store.meta.auditArchive) || null;
  const head = () => { const m = meta(); return m && m.headHash ? m.headHash : ZERO64; };
  let approxBytes = null, sinceCheck = 0, rolling = null;
  async function record(type, outcome, ctx, details = {}) {
    const rows = store.all('audit');
    const prevHash = rows.length ? rows[rows.length - 1].hash : head();
    const ev = {
      eventId: newId('aud'), at: nowIso(), eventType: type, outcome,
      actorId: ctx.identity ? ctx.identity.actorId : null, tenantId: ctx.identity ? ctx.identity.tenantId : null,
      endpoint: ctx.endpointId || null, requestId: ctx.requestId || null, traceId: ctx.traceId || null,
      remote: ctx.remote || null, details,
      retainUntil: new Date(Date.now() + retentionDays * 864e5).toISOString(), prevHash,
    };
    ev.hash = hashStable(ev);
    await store.insert('audit', ev);
    if (approxBytes != null) approxBytes += JSON.stringify(ev).length + 1;
    if (++sinceCheck >= 25 || (rows.length && pktMonth(rows[0].at) !== pktMonth(ev.at))) { sinceCheck = 0; rollover().catch((e) => console.error('  audit: rollover failed (' + (e && e.message) + '); retried at the next check')); }
    return ev;
  }
  /* the eventId of the last whole row of a month file (a torn last line is skipped) */
  function lastIdOf(f) {
    let t; try { t = readFileSync(f, 'utf8'); } catch (_) { return null; }
    const L = t.split('\n'); for (let i = L.length - 1; i >= 0; i--) { if (!L[i].trim()) continue; try { return JSON.parse(L[i]).eventId || null; } catch (_) { continue; } }
    return null;
  }
  function rolloverSync(reason) {
    const rows = store.all('audit'); if (!rows.length) return null;
    if (approxBytes == null) approxBytes = JSON.stringify(rows).length;
    const cur = pktMonth(new Date().toISOString());
    let n = 0; while (n < rows.length && pktMonth(rows[n].at) && pktMonth(rows[n].at) < cur) n++;
    let why = n ? 'earlier month' : null;
    if (!n && approxBytes > ROLL_BYTES && rows.length > 1) { n = Math.floor(rows.length / 2); why = 'size ' + Math.round(approxBytes / 1048576 * 10) / 10 + ' MB over ' + Math.round(ROLL_BYTES / 1048576 * 10) / 10 + ' MB'; }
    if (!n) return null;
    const seg = rows.slice(0, n);
    mkdirSync(ADIR, { recursive: true });
    const by = new Map(); for (const r of seg) { const m = pktMonth(r.at) || cur; (by.get(m) || by.set(m, []).get(m)).push(r); }
    const files = [];
    for (const [m, list] of by) {
      const f = join(ADIR, 'audit_' + m + '.jsonl'); files.push(basename(f));
      const last = lastIdOf(f); let from = 0;
      if (last) { const k = list.findIndex((r) => r.eventId === last); if (k >= 0) from = k + 1; }
      if (from < list.length) appendLineSync(f, list.slice(from).map((r) => JSON.stringify(r)).join('\n'));
      if (lastIdOf(f) !== list[list.length - 1].eventId) throw new Error('audit month file ' + f + ' does not end with the last moved row');
    }
    const m0 = meta() || { archivedCount: 0, segments: [] };
    store.meta.auditArchive = { headHash: seg[n - 1].hash, headEventId: seg[n - 1].eventId, headAt: seg[n - 1].at, archivedCount: (m0.archivedCount || 0) + n,
      segments: [...new Set([...(m0.segments || []), ...files])].sort(), lastRollAt: nowIso(), lastReason: reason + ': ' + why, dir: 'data/archive/audit' };
    return new Set(seg.map((r) => r.eventId));
  }
  function rollover(reason = 'check') {
    if (rolling) return rolling.catch(() => {}).then(() => rollover(reason));   /* one at a time; a call during a move checks again after it */
    const p = (async () => {
      await null;   /* the guard is set before the body runs (a body that finishes at once must not clear it before it is set) */
      const ids = rolloverSync(reason); if (!ids) return { moved: 0 };
      await store.removeWhere('audit', (r) => ids.has(r.eventId)); approxBytes = null;
      return { moved: ids.size, head: meta() };
    })();
    rolling = p;
    p.then(() => { if (rolling === p) rolling = null; }, () => { if (rolling === p) rolling = null; });
    return p;
  }
  { const t = setInterval(() => { rollover('hourly').catch(() => {}); }, 3600e3); if (t.unref) t.unref(); }
  function verifyChain(o = {}) {
    let prev = ZERO64, archived = 0, torn = 0;
    if (o.deep && meta()) {
      for (const n of [...(meta().segments || [])].sort()) {
        let t = ''; try { t = readFileSync(join(ADIR, n), 'utf8'); } catch (_) { return { ok: false, missingSegment: n, checked: archived }; }
        for (const line of t.split('\n')) { if (!line.trim()) continue; let r; try { r = JSON.parse(line); } catch (_) { torn++; continue; }
          const { hash, ...rest } = r; if (rest.prevHash !== prev || hashStable(rest) !== hash) return { ok: false, brokenAt: archived, eventId: r.eventId, segment: n, checked: archived }; prev = hash; archived++; }
      }
    } else prev = head();
    const rows = store.all('audit');
    /* rows already written to a month file but not yet taken out of the database (a stop between the two steps) are skipped */
    let k0 = meta() && meta().headEventId ? rows.findIndex((r) => r.eventId === meta().headEventId) : -1;
    if (o.deep && meta()) { const kf = rows.findIndex((r) => r.hash === prev); if (kf >= 0) k0 = kf; else if (prev !== head()) return { ok: false, why: 'the archived files end at ' + prev + ', the database names ' + head(), checked: archived }; }
    for (let i = k0 + 1; i < rows.length; i++) {
      const { hash, ...rest } = rows[i];
      if (rest.prevHash !== prev || hashStable(rest) !== hash) return { ok: false, brokenAt: i, eventId: rows[i].eventId, checked: rows.length };
      prev = hash;
    }
    return { ok: true, checked: rows.length, head: prev, archived: meta() ? { count: meta().archivedCount, head: meta().headHash, segments: meta().segments, checkedDeep: o.deep ? archived : null, tornLines: o.deep ? torn : null } : null };
  }
  /* v91.17.283 · INTEG (WS3 request) · every audit row: the month files of data/archive/audit (oldest first), then the rows still in the
     database; rows written to a month file but not yet removed from the database are given once (by eventId) */
  function allRows() {
    const out = [], seen = new Set();
    for (const n of [...((meta() && meta().segments) || [])].sort()) {
      let t = ''; try { t = readFileSync(join(ADIR, n), 'utf8'); } catch (_) { continue; }
      for (const line of t.split('\n')) { if (!line.trim()) continue; let r; try { r = JSON.parse(line); } catch (_) { continue; } if (r && r.eventId && !seen.has(r.eventId)) { seen.add(r.eventId); out.push(r); } }
    }
    for (const r of store.all('audit')) if (!r || !r.eventId || !seen.has(r.eventId)) out.push(r);
    return out;
  }
  return { record, verifyChain, rollover, allRows };
}

export function requireConfirmed(body) {
  if (body.confirmed !== true) throw new ApiError(422, 'CONFIRMATION_REQUIRED', 'This action requires confirmed: true.');
}
export { newId, nowIso, hashStable, sha256 };
