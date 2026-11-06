(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const initial = Object.freeze({
    build: { version: (global.AGN_VERSION || 'version-unset'),
             schema: 'tehsil-v15-production-handover' },
    location: { stationId: null, tehsil: null, district: null, province: null, preview: null },
    context: { section: 'overview', hazard: 'flood', sector: 'national', adminLevel: 'tehsil', leadHours: 0 },
    data: { generation: 0, status: 'booting', validTime: null, coverage: null },
    user: { id: null, name: null, role: 'local-demo', roles: [], scopes: [], tenantId: null, authenticated: false, trusted: false, sessionId: null, expiresAt: null, authMethod: 'unconfigured' }
  });
  let state = typeof structuredClone === 'function' ? structuredClone(initial) : JSON.parse(JSON.stringify(initial));
  const subscribers = new Set();
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function merge(target, patch) {
    const out = Array.isArray(target) ? target.slice() : Object.assign({}, target);
    Object.keys(patch || {}).forEach(key => {
      const value = patch[key];
      out[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? merge(target && target[key] || {}, value) : value;
    });
    return out;
  }
  AGN.store = {
    getState() { return clone(state); },
    select(path) {
      return String(path).split('.').reduce((v, key) => v == null ? undefined : v[key], state);
    },
    set(patch, meta) {
      const previous = state;
      state = merge(state, patch || {});
      const change = { state: clone(state), previous: clone(previous), patch: clone(patch), meta: meta || {} };
      subscribers.forEach(fn => { try { fn(change); } catch (e) { console.error('[AGN.store]', e); } });
      if (AGN.events) AGN.events.emit('state:change', change);
      return clone(state);
    },
    update(path, value, meta) {
      const keys = String(path).split('.');
      let patch = value;
      for (let i = keys.length - 1; i >= 0; i--) patch = { [keys[i]]: patch };
      return this.set(patch, meta);
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    nextGeneration(reason) {
      const generation = Number(state.data.generation || 0) + 1;
      this.set({ data: { generation } }, { reason: reason || 'request' });
      return generation;
    },
    isCurrentGeneration(generation) { return Number(state.data.generation) === Number(generation); }
  };
})(window);
