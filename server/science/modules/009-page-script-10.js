(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const records = new Map();
  const contracts = Object.freeze({
    overview: ['refresh','rebindMarkers','invalidate','closePopups','getState'],
    livedata: ['refresh','render','close','getState'],
    airisk: ['refresh','activateWorkspace','getState'],
    assessments: ['refresh','run','syncCurrent','generateReport','getState'],
    operations: ['render','renderSituation','prefillReview','getState'],
    modelLab: ['render','loadComparison','queueComparison','cancelQueuedComparison','getState'],
    hybridLab: ['sync','render','setScenario','getState']
  });

  AGN.sectionApis = AGN.sectionApis || {}; 

  function now() { return Date.now(); }
  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }
  function normalizeMethods(impl) {
    const out = {};
    Object.keys(impl || {}).forEach(key => {
      if (typeof impl[key] === 'function') out[key] = impl[key];
    });
    return out;
  }
  function expected(name, explicit) {
    return Array.isArray(explicit) ? explicit.slice() : (contracts[name] || []).slice();
  }
  function validate(name, methods, required) {
    const missing = required.filter(method => typeof methods[method] !== 'function');
    if (missing.length) throw new Error('Service '+name+' is missing required methods: '+missing.join(', '));
  }
  function facade(name) {
    return new Proxy({}, {
      get(_target, key) {
        if (key === '__serviceName') return name;
        if (key === '__compatibilityFacade') return true;
        const rec = records.get(name);
        if (!rec) return undefined;
        if (key === 'getDiagnostics') return () => diagnostics(name);
        const value = rec.methods[key];
        if (typeof value !== 'function') return value;
        return function () { return call(name, key, ...arguments); };
      },
      set() {
        console.warn('[AGN.services] sectionApis is read-only compatibility state. Register through AGN.services.register().');
        return false;
      },
      ownKeys() {
        const rec = records.get(name);
        return rec ? Object.keys(rec.methods) : [];
      },
      getOwnPropertyDescriptor() { return { enumerable:true, configurable:true }; }
    });
  }
  function register(name, implementation, options) {
    if (!name || typeof name !== 'string') throw new TypeError('Service name is required');
    const methods = normalizeMethods(implementation);
    const required = expected(name, options && options.contract);
    validate(name, methods, required);
    const prior = records.get(name);
    const rec = {
      name,
      methods,
      original: implementation,
      required,
      version: prior ? prior.version + 1 : 1,
      registeredAt: now(),
      calls: prior ? prior.calls : 0,
      failures: prior ? prior.failures : 0,
      lastCallAt: prior ? prior.lastCallAt : null,
      lastMethod: prior ? prior.lastMethod : null,
      lastDurationMs: prior ? prior.lastDurationMs : null,
      lastError: null,
      source: options && options.source || null,
      compatibility: options && options.compatibility !== false
    };
    records.set(name, rec);
    if (rec.compatibility) {
      const compat = facade(name);
      Object.defineProperty(AGN.sectionApis, name, {
        configurable:true,
        enumerable:true,
        get:function(){ return compat; },
        set:function(){ console.warn('[AGN.services] '+name+' compatibility facade is read-only.'); }
      });
    }
    if (AGN.events) AGN.events.emit('service:registered', { name, version:rec.version, methods:Object.keys(methods), at:rec.registeredAt });
    return () => unregister(name, implementation);
  }
  function unregister(name, implementation) {
    const rec = records.get(name);
    if (!rec) return false;
    if (implementation && rec.original !== implementation) return false;
    records.delete(name);
    try { delete AGN.sectionApis[name]; } catch (_) { AGN.sectionApis[name] = undefined; }
    if (AGN.events) AGN.events.emit('service:unregistered', { name, at:now() });
    return true;
  }
  function get(name) {
    const rec = records.get(name);
    if (!rec) return null;
    return new Proxy({}, {
      get(_target, key) {
        if (key === 'name') return name;
        if (key === 'methods') return Object.keys(rec.methods);
        if (key === 'diagnostics') return () => diagnostics(name);
        const value = rec.methods[key];
        return typeof value === 'function' ? function () { return call(name, key, ...arguments); } : value;
      }
    });
  }
  function requireService(name) {
    const service = get(name);
    if (!service) throw new Error('Required NIGRAAN service is unavailable: '+name);
    return service;
  }
  function call(name, method) {
    const args = Array.prototype.slice.call(arguments, 2);
    const rec = records.get(name);
    if (!rec) {
      const error = new Error('Service is not registered: '+name);
      if (AGN.events) AGN.events.emit('service:error', { name, method, error, at:now() });
      throw error;
    }
    const fn = rec.methods[method];
    if (typeof fn !== 'function') throw new Error('Service '+name+' has no method '+method);
    const started = global.performance && typeof global.performance.now === 'function' ? global.performance.now() : now();
    rec.calls += 1; rec.lastCallAt = now(); rec.lastMethod = method; rec.lastError = null;
    try {
      const result = fn.apply(null, args);
      if (result && typeof result.then === 'function') {
        return result.then(value => {
          const ended = global.performance && typeof global.performance.now === 'function' ? global.performance.now() : now();
          rec.lastDurationMs = Math.max(0, ended - started);
          return value;
        }).catch(error => {
          rec.failures += 1; rec.lastError = String(error && error.message || error);
          if (AGN.events) AGN.events.emit('service:error', { name, method, error, at:now() });
          throw error;
        });
      }
      const ended = global.performance && typeof global.performance.now === 'function' ? global.performance.now() : now();
      rec.lastDurationMs = Math.max(0, ended - started);
      return result;
    } catch (error) {
      rec.failures += 1; rec.lastError = String(error && error.message || error);
      if (AGN.events) AGN.events.emit('service:error', { name, method, error, at:now() });
      throw error;
    }
  }
  function diagnostics(name) {
    if (name) {
      const rec = records.get(name);
      if (!rec) return null;
      return {
        name:rec.name,
        version:rec.version,
        required:rec.required.slice(),
        methods:Object.keys(rec.methods),
        source:rec.source,
        calls:rec.calls,
        failures:rec.failures,
        registeredAt:rec.registeredAt,
        lastCallAt:rec.lastCallAt,
        lastMethod:rec.lastMethod,
        lastDurationMs:rec.lastDurationMs,
        lastError:rec.lastError,
        compatibilityFacade:rec.compatibility
      };
    }
    const services = {};
    records.forEach((_rec, key) => { services[key] = diagnostics(key); });
    return { registered:records.size, expected:Object.keys(contracts).length, services };
  }
  function snapshot() {
    const out = {};
    records.forEach((_rec, name) => {
      const service = get(name);
      out[name] = {
        diagnostics: diagnostics(name),
        state: service && typeof service.getState === 'function' ? clone(service.getState()) : null
      };
    });
    return out;
  }

  AGN.services = { register, unregister, get, require:requireService, call, has:name=>records.has(name), diagnostics, snapshot, contracts:clone(contracts) };
  AGN.architecture = Object.assign({}, AGN.architecture, {
    services: 'contract-checked controller services for seven top-level sections'
  });
})(window);
