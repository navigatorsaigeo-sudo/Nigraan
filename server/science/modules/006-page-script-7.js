(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const listeners = new Map();
  AGN.events = {
    on(type, handler) {
      if (typeof handler !== 'function') throw new TypeError('handler must be a function');
      const set = listeners.get(type) || new Set();
      set.add(handler); listeners.set(type, set);
      return () => set.delete(handler);
    },
    once(type, handler) {
      const off = this.on(type, payload => { off(); handler(payload); });
      return off;
    },
    emit(type, payload) {
      const set = listeners.get(type);
      if (!set) return;
      [...set].forEach(handler => {
        try { handler(payload); }
        catch (error) { setTimeout(() => { throw error; }, 0); }
      });
    },
    clear(type) { type ? listeners.delete(type) : listeners.clear(); }
  };
})(window);
