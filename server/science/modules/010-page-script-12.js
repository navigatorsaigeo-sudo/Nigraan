(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const listeners = new Set();
  const stats = { sessions:0, clears:0, authorizationChecks:0, denied:0, lastAt:null, lastDecision:null, lastError:null };
  const config = {
    mode: 'unconfigured',
    issuer: null,
    audience: 'agn-nigraan',
    persistSession: false,
    sessionStorageKey: 'agn.identity.session.v1',
    tokenProvider: null,
    sessionProvider: null,
    tenantProvider: null
  };
  const roleCatalog = Object.freeze({
    viewer: Object.freeze(['hazards:read','forecast:read','evidence:read','units:read','model-verification:read']),
    analyst: Object.freeze(['hazards:read','forecast:read','evidence:read','units:read','model-verification:read','risk:explain','assessments:write','hybrid-experiments:write']),
    operator: Object.freeze(['hazards:read','forecast:read','evidence:read','units:read','operations:read','actions:write','outcomes:write']),
    supervisor: Object.freeze(['hazards:read','forecast:read','evidence:read','units:read','operations:read','actions:write','outcomes:write','actions:approve']),
    approver: Object.freeze(['hazards:read','forecast:read','evidence:read','units:read','operations:read','actions:approve']),
    admin: Object.freeze(['*'])
  });
  let session = null;

  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') { try { return structuredClone(value); } catch (_) {} }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }
  function asArray(value) { return Array.isArray(value) ? value.filter(Boolean).map(String) : []; }
  function unique(values) { return Array.from(new Set(values)); }
  function nowIso() { return new Date().toISOString(); }
  function isExpired(value) { return !!(value && !Number.isNaN(new Date(value).getTime()) && new Date(value).getTime() <= Date.now()); }
  function safeSessionStorage() { try { return global.sessionStorage || null; } catch (_) { return null; } }
  function emit(reason) {
    const payload = { reason:reason || 'update', session:snapshotSession(), diagnostics:diagnostics() };
    listeners.forEach(fn => { try { fn(clone(payload)); } catch (e) { console.error('[AGN.identity]', e); } });
    if (AGN.events) AGN.events.emit('identity:change', payload);
  }
  function normalizeActor(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const roles = unique(asArray(raw.roles).concat(raw.role ? [raw.role] : []));
    const explicitScopes = unique(asArray(raw.scopes));
    const derivedScopes = [];
    roles.forEach(role => { (roleCatalog[role] || []).forEach(scope => derivedScopes.push(scope)); });
    return {
      id: raw.id != null ? String(raw.id) : null,
      name: raw.name != null ? String(raw.name) : null,
      email: raw.email != null ? String(raw.email) : null,
      roles,
      scopes: unique(explicitScopes.concat(derivedScopes)),
      attributes: raw.attributes && typeof raw.attributes === 'object' ? clone(raw.attributes) : {}
    };
  }
  function normalizeSession(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const actor = normalizeActor(raw.actor || raw.user || raw);
    const authenticated = raw.authenticated === true && !!actor.id;
    return {
      sessionId: raw.sessionId != null ? String(raw.sessionId) : null,
      tenantId: raw.tenantId != null ? String(raw.tenantId) : null,
      actor,
      authenticated,
      trusted: raw.trusted === true && authenticated,
      issuedAt: raw.issuedAt || null,
      expiresAt: raw.expiresAt || null,
      issuer: raw.issuer || config.issuer || null,
      audience: raw.audience || config.audience || null,
      authMethod: raw.authMethod || config.mode || 'unconfigured',
      token: raw.token || null,
      claims: raw.claims && typeof raw.claims === 'object' ? clone(raw.claims) : {},
      source: raw.source || 'runtime'
    };
  }
  function snapshotSession() {
    if (!session) return null;
    const value = clone(session);
    if (value) delete value.token;
    return value;
  }
  function syncStore(reason) {
    if (!AGN.store) return;
    const s = snapshotSession();
    const actor = s && s.actor || {};
    AGN.store.set({ user: {
      id: actor.id || null,
      name: actor.name || null,
      role: actor.roles && actor.roles[0] || 'local-demo',
      roles: actor.roles || [],
      scopes: actor.scopes || [],
      tenantId: s && s.tenantId || null,
      authenticated: !!(s && s.authenticated),
      trusted: !!(s && s.trusted),
      sessionId: s && s.sessionId || null,
      expiresAt: s && s.expiresAt || null,
      authMethod: s && s.authMethod || 'unconfigured'
    } }, { reason:reason || 'identity-sync' });
  }
  function persist() {
    const storage = safeSessionStorage();
    if (!storage || !config.persistSession) return;
    try {
      const safe = snapshotSession();
      if (safe) storage.setItem(config.sessionStorageKey, JSON.stringify(safe));
      else storage.removeItem(config.sessionStorageKey);
    } catch (_) {}
  }
  function hydrate() {
    const storage = safeSessionStorage();
    if (!storage || !config.persistSession) return null;
    try {
      const raw = JSON.parse(storage.getItem(config.sessionStorageKey) || 'null');
      if (!raw) return null;
      const value = normalizeSession(raw);
      if (isExpired(value.expiresAt)) { storage.removeItem(config.sessionStorageKey); return null; }
      session = value;
      syncStore('identity-hydrate');
      return snapshotSession();
    } catch (_) { return null; }
  }
  function configure(options) {
    Object.assign(config, options || {});
    if (options && options.persistSession) hydrate();
    return diagnostics();
  }
  function setSession(raw, options) {
    options = options || {};
    const value = normalizeSession(raw);
    if (value.expiresAt && isExpired(value.expiresAt)) {
      const error = new Error('Identity session is expired.');
      error.name = 'AGNIdentityError'; error.code = 'SESSION_EXPIRED'; throw error;
    }
    if (value.authenticated && !value.tenantId && options.requireTenant !== false) {
      const error = new Error('Authenticated sessions require a tenant ID.');
      error.name = 'AGNIdentityError'; error.code = 'TENANT_REQUIRED'; throw error;
    }
    session = value;
    stats.sessions += 1; stats.lastAt = nowIso(); stats.lastError = null;
    persist(); syncStore('identity-session'); emit(options.reason || 'session-set');
    return snapshotSession();
  }
  function clearSession(reason) {
    session = null; stats.clears += 1; stats.lastAt = nowIso(); persist(); syncStore('identity-clear'); emit(reason || 'session-cleared');
  }
  async function resolve(options) {
    options = options || {};
    let candidate = options.session || null;
    if (!candidate && typeof config.sessionProvider === 'function') candidate = await config.sessionProvider();
    if (candidate) setSession(candidate, { reason:'provider-session', requireTenant:options.requireTenant });
    let token = options.token != null ? options.token : session && session.token;
    if (!token && typeof config.tokenProvider === 'function') token = await config.tokenProvider();
    let tenantId = options.tenantId || session && session.tenantId;
    if (!tenantId && typeof config.tenantProvider === 'function') tenantId = await config.tenantProvider();
    const actor = options.actor ? normalizeActor(options.actor) : session && clone(session.actor) || null;
    return { token:token || null, tenantId:tenantId || null, actor, sessionId:session && session.sessionId || null, authenticated:!!(session && session.authenticated), trusted:!!(session && session.trusted), authMethod:session && session.authMethod || config.mode };
  }
  function matchesScope(granted, required) { return granted === '*' || granted === required; }
  function authorize(requirements, context) {
    requirements = requirements || {};
    context = context || { actor:session && session.actor, authenticated:session && session.authenticated, trusted:session && session.trusted, tenantId:session && session.tenantId };
    const actor = context.actor || {};
    const grantedScopes = asArray(actor.scopes);
    const grantedRoles = asArray(actor.roles);
    const requiredScopes = asArray(requirements.scopes);
    const requiredRoles = asArray(requirements.roles);
    const missingScopes = requiredScopes.filter(required => !grantedScopes.some(granted => matchesScope(granted, required)));
    const missingRoles = requiredRoles.length && !requiredRoles.some(role => grantedRoles.includes(role)) ? requiredRoles.slice() : [];
    const authRequired = requirements.required !== false;
    const reasons = [];
    if (authRequired && !context.authenticated) reasons.push('AUTH_REQUIRED');
    if (authRequired && !context.tenantId) reasons.push('TENANT_REQUIRED');
    if (missingScopes.length) reasons.push('SCOPE_REQUIRED');
    if (missingRoles.length) reasons.push('ROLE_REQUIRED');
    if (requirements.trusted === true && !context.trusted) reasons.push('TRUSTED_SESSION_REQUIRED');
    const decision = { allowed:reasons.length===0, reasons, missingScopes, missingRoles, authenticated:!!context.authenticated, trusted:!!context.trusted, tenantId:context.tenantId || null, actorId:actor.id || null, roles:grantedRoles, scopes:grantedScopes };
    stats.authorizationChecks += 1; if (!decision.allowed) stats.denied += 1; stats.lastDecision = clone(decision); stats.lastAt = nowIso();
    return decision;
  }
  function requirePermission(requirements, context) {
    const decision = authorize(requirements, context);
    if (decision.allowed) return decision;
    const code = decision.reasons[0] || 'ACCESS_DENIED';
    const error = new Error('Access denied: ' + decision.reasons.join(', '));
    error.name = 'AGNAuthorizationError'; error.code = code; error.decision = decision; throw error;
  }
  function diagnostics() {
    const s = snapshotSession();
    return {
      configured: config.mode !== 'unconfigured' || typeof config.sessionProvider === 'function' || typeof config.tokenProvider === 'function',
      mode: config.mode,
      issuer: config.issuer,
      audience: config.audience,
      persistSession: !!config.persistSession,
      authenticated: !!(s && s.authenticated),
      trusted: !!(s && s.trusted),
      tenantId: s && s.tenantId || null,
      actor: s && s.actor || null,
      expiresAt: s && s.expiresAt || null,
      expired: !!(s && isExpired(s.expiresAt)),
      roleCatalog: clone(roleCatalog),
      stats: clone(stats)
    };
  }
  AGN.identity = { configure, setSession, clearSession, resolve, session:snapshotSession, diagnostics, snapshot:function(){return clone(diagnostics());}, subscribe:function(fn){listeners.add(fn);return function(){listeners.delete(fn);};}, hydrate };
  AGN.permissions = { authorize, require:requirePermission, hasScope:function(scope){return authorize({required:false,scopes:[scope]}).missingScopes.length===0;}, hasRole:function(role){const s=session&&session.actor;return !!(s&&asArray(s.roles).includes(role));}, roles:function(){return clone(roleCatalog);}, diagnostics:function(){return clone(stats);} };
  syncStore('identity-boot');
  AGN.architecture = Object.assign({}, AGN.architecture, { identity:'tenant-aware identity context and role/scope authorization boundary; no provider connected by default' });
})(window);
