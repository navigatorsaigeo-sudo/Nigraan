


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  var MODE = { SCREEN: 'screen', WATCH: 'watch' };
  var FRESH_MS = 3 * 60 * 60 * 1000;       
  var STALE_MS = 12 * 60 * 60 * 1000;      

  

  var LEVEL = { NONE: 0, SEED: 1, CACHED: 2, PARTIAL: 3, LIVE: 4 };
  var LABEL = ['No data', 'Seed', 'Cached', 'Partial', 'Live'];

  function num(v){ return (v===null||v===undefined||v==='')?null:(isFinite(Number(v))?Number(v):null); }

  

  function levelOf(v, now) {
    if (!v) return { level: LEVEL.NONE, why: 'no value' };
    if (v.tier === 'climatology') return { level: LEVEL.SEED, why: 'climatology, not a forecast' };
    if (v.unavailable === true || v.tier === 'unavailable' || v.value === null)
      return { level: LEVEL.NONE, why: 'value not available' };
    var t = num(v.at) || num(v.issuedMs) || num(v.districtFetchedAt) || num(v.fetchedAt);
    var live = (v.live === true) || (v.weatherLive === true) || (v.featureLive === true)
            || v.tier === 'multi-model' || v.tier === 'single-model';
    if (!live) return { level: LEVEL.SEED, why: 'no live fetch reached this value' };
    if (t == null) return { level: LEVEL.PARTIAL, why: 'live but undated' };
    var age = now - t;
    if (age > STALE_MS) return { level: LEVEL.SEED, why: 'older than 12 h — not operational' };
    if (age > FRESH_MS) return { level: LEVEL.CACHED, why: 'older than 3 h' };
    return { level: LEVEL.LIVE, why: 'fresh', age: age };
  }

  

  function from(values, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var mode = opts.mode || MODE.WATCH;
    var list = Array.isArray(values) ? values : (values ? [values] : []);
    if (!list.length) {
      return { mode: mode, level: LEVEL.NONE, label: 'No data', live: false,
               reason: 'nothing was supplied to derive a status from',
               counts: {}, n: 0, weakest: null };
    }
    var worst = LEVEL.LIVE, why = 'fresh', counts = {}, oldest = null;
    list.forEach(function (v) {
      var r = levelOf(v, now);
      counts[LABEL[r.level]] = (counts[LABEL[r.level]] || 0) + 1;
      if (r.level < worst) { worst = r.level; why = r.why; }
      if (r.age != null && (oldest == null || r.age > oldest)) oldest = r.age;
    });
    

    if (mode === MODE.SCREEN) {
      return { mode: mode, level: Math.min(worst, LEVEL.SEED),
               label: 'Screening', live: false,
               reason: 'screening is climatological — it makes no live claim',
               counts: counts, n: list.length, oldestMs: oldest, weakest: why };
    }
    return { mode: mode, level: worst, label: LABEL[worst], live: worst === LEVEL.LIVE,
             reason: why, counts: counts, n: list.length, oldestMs: oldest, weakest: why };
  }

  

  var PROVIDERS = Object.create(null);
  function register(id, mode, getter) {
    if (!id || typeof getter !== 'function') return false;
    PROVIDERS[id] = { mode: mode || MODE.WATCH, getter: getter };
    return true;
  }
  function of(id, opts) {
    var p = PROVIDERS[id];
    if (!p) return from([], { mode: (opts && opts.mode) || MODE.WATCH });
    var vals = [];
    try { vals = p.getter() || []; } catch (_) { vals = []; }
    return from(vals, { mode: p.mode, now: opts && opts.now });
  }

  

  function stamp(at, applied) {
    var n = num(applied);
    if (n !== null && n <= 0) {
      return { advanced: false, reason: 'no values were applied — freshness unchanged' };
    }
    return { advanced: true, at: num(at) || Date.now(), applied: n };
  }

  G.AGN.status = {
    MODE: MODE, LEVEL: LEVEL, LABEL: LABEL,
    FRESH_MS: FRESH_MS, STALE_MS: STALE_MS,
    levelOf: levelOf, from: from, register: register, of: of, stamp: stamp,
    providers: function () { return Object.keys(PROVIDERS); },
     
    badge: function (st) {
      if (!st) return { text: 'No data', live: false, detail: '' };
      if (st.mode === MODE.SCREEN)
        return { text: 'Screening', live: false,
                 detail: 'climatological — no live claim' };
      var detail = st.reason || '';
      if (st.n > 1 && st.counts) {
        var parts = [];
        Object.keys(st.counts).forEach(function (k) { parts.push(st.counts[k] + ' ' + k.toLowerCase()); });
        detail = parts.join(', ') + (detail ? ' · ' + detail : '');
      }
      return { text: st.label, live: st.live, detail: detail };
    }
  };
})(window);
