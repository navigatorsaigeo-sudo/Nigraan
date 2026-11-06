(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const records = new Map();
  const SECTION_NAMES = ['overview','livedata','airisk','assessments','operations','modelab','hybridlab'];

  function now() { return Date.now(); }
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }

    if (value === null || typeof value !== 'object') return value;
    try {
      const json = JSON.stringify(value);
      if (typeof json !== 'string') return value;
      return JSON.parse(json);
    } catch (_) { return value; }
  }
  function merge(target, patch) {
    const out = Array.isArray(target) ? target.slice() : Object.assign({}, target || {});
    Object.keys(patch || {}).forEach(key => {
      const value = patch[key];
      out[key] = isObject(value) ? merge(target && target[key], value) : clone(value);
    });
    return out;
  }

  

  function writableObject(o) {
    if (!isObject(o)) return false;
    try { return Object.isExtensible(o) && !Object.isFrozen(o) && !Object.isSealed(o); }
    catch (_) { return false; }
  }

  function applyPatch(target, patch) {
    Object.keys(patch || {}).forEach(key => {
      const value = patch[key];
      if (isObject(value)) {
        if (!writableObject(target[key])) target[key] = {};
        applyPatch(target[key], value);
      } else if (Array.isArray(value)) {
        if (Array.isArray(target[key]) && Object.isExtensible(target[key])) {
          target[key].splice(0, target[key].length, ...clone(value));
        } else target[key] = clone(value);
      } else target[key] = value;
    });
    return target;
  }
  function replaceInPlace(target, value) {
    Object.keys(target).forEach(key => { if (!(key in (value || {}))) delete target[key]; });
    return applyPatch(target, value || {});
  }
  function getAt(root, path) {
    if (!path) return root;
    return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], root);
  }
  function patchAt(path, value) {
    const keys = String(path).split('.');
    let patch = clone(value);
    for (let i = keys.length - 1; i >= 0; i--) patch = { [keys[i]]: patch };
    return patch;
  }
  function assertName(name) {
    if (!SECTION_NAMES.includes(name)) throw new Error('Unknown NIGRAAN section state: ' + name);
  }
  function emit(rec, patch, previous, meta) {
    rec.version += 1;
    rec.writeCount += 1;
    rec.lastWriteAt = now();
    rec.lastMeta = clone(meta || {});
    const change = {
      section: rec.name,
      state: clone(rec.data),
      previous: clone(previous),
      patch: clone(patch),
      meta: clone(meta || {}),
      version: rec.version,
      at: rec.lastWriteAt
    };
    [...rec.subscribers].forEach(fn => {
      try { fn(change); } catch (error) { console.error('[AGN.sectionState:' + rec.name + ']', error); }
    });
    if (AGN.events) {
      AGN.events.emit('section-state:change', change);
      AGN.events.emit('section-state:' + rec.name, change);
    }
    return change.state;
  }
  function proxify(rec, target, path) {
    if (!isObject(target) && !Array.isArray(target)) return target;
    if (rec.proxyCache.has(target)) return rec.proxyCache.get(target);
    const proxy = new Proxy(target, {
      get(obj, key) {
        const value = obj[key];
        return (isObject(value) || Array.isArray(value)) ? proxify(rec, value, path.concat(String(key))) : value;
      },
      set(obj, key, value) {
        const previous = clone(rec.data);
        obj[key] = value;
        emit(rec, patchAt(path.concat(String(key)).join('.'), value), previous, { reason: 'direct-section-write' });
        return true;
      },
      deleteProperty(obj, key) {
        if (!(key in obj)) return true;
        const previous = clone(rec.data);
        delete obj[key];
        emit(rec, patchAt(path.concat(String(key)).join('.'), undefined), previous, { reason: 'direct-section-delete' });
        return true;
      }
    });
    rec.proxyCache.set(target, proxy);
    return proxy;
  }
  function create(name, defaults) {
    assertName(name);
    const data = clone(defaults || {});
    const rec = {
      name,
      defaults: clone(defaults || {}),
      data,
      proxyCache: new WeakMap(),
      subscribers: new Set(),
      version: 0,
      writeCount: 0,
      readCount: 0,
      mounted: false,
      mountedAt: null,
      unmountedAt: null,
      lastWriteAt: null,
      lastMeta: null
    };
    rec.proxy = proxify(rec, rec.data, []);
    records.set(name, rec);
    return rec;
  }
  function lacks(def, have) {
    if (!isObject(def)) return false; if (!isObject(have)) return true;
    for (const k of Object.keys(def)) { if (!(k in have)) return true; if (isObject(def[k]) && lacks(def[k], have[k])) return true; }
    return false;
  }
  function ensure(name, defaults) {
    assertName(name);
    const existing = records.get(name);
    if (existing) {
      

      if (defaults && !lacks(defaults, existing.data) && !lacks(defaults, existing.defaults)) return existing;
      if (defaults) {
        const previous = clone(existing.data);
        const combined = merge(defaults, existing.data);
        replaceInPlace(existing.data, combined);
        existing.defaults = merge(existing.defaults, defaults);
        emit(existing, {}, previous, { reason: 'extend-defaults' });
      }
      return existing;
    }
    return create(name, defaults || {});
  }
  function apiFor(name, defaults) {
    const rec = ensure(name, defaults);
    return {
      name,
      get state() { rec.readCount += 1; return rec.proxy; },
      getState() { rec.readCount += 1; return clone(rec.data); },
      select(path) { rec.readCount += 1; return clone(getAt(rec.data, path)); },
      set(patch, meta) {
        const previous = clone(rec.data);
        applyPatch(rec.data, patch || {});
        return emit(rec, patch || {}, previous, meta || {});
      },
      update(path, value, meta) { return this.set(patchAt(path, value), meta); },
      replace(value, meta) {
        const previous = clone(rec.data);
        replaceInPlace(rec.data, clone(value || {}));
        return emit(rec, value || {}, previous, meta || {});
      },
      reset(meta) { return this.replace(rec.defaults, Object.assign({ reason: 'reset' }, meta || {})); },
      subscribe(fn) { rec.subscribers.add(fn); return () => rec.subscribers.delete(fn); },
      diagnostics() { return diagnostics(name); }
    };
  }
  function diagnostics(name) {
    if (name) {
      const rec = records.get(name);
      if (!rec) return null;
      return {
        name: rec.name,
        mounted: rec.mounted,
        version: rec.version,
        writes: rec.writeCount,
        reads: rec.readCount,
        mountedAt: rec.mountedAt,
        unmountedAt: rec.unmountedAt,
        lastWriteAt: rec.lastWriteAt,
        lastMeta: clone(rec.lastMeta),
        keys: Object.keys(rec.data)
      };
    }
    const sections = {};
    records.forEach((_, section) => { sections[section] = diagnostics(section); });
    return { registered: records.size, sections };
  }
  function markMounted(name, mounted) {
    const rec = ensure(name, {});
    rec.mounted = !!mounted;
    if (mounted) rec.mountedAt = now();
    else rec.unmountedAt = now();
  }
  function snapshot() {
    const out = {};
    records.forEach((rec, name) => { out[name] = clone(rec.data); });
    return out;
  }

  AGN.sectionState = {
    names: SECTION_NAMES.slice(),
    register: apiFor,
    for: apiFor,
    state(name, defaults) { return apiFor(name, defaults).state; },
    snapshot,
    diagnostics,
    markMounted,
    has(name) { return records.has(name); },
    reset(name, meta) { return apiFor(name).reset(meta); }
  };
  AGN.architecture = Object.assign({}, AGN.architecture, {
    sectionState: 'isolated state registry for seven top-level sections'
  });
})(window);
