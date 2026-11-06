


(function (G) {
  'use strict';
  function el() { return document.getElementById('agnBudget'); }
  function paint() {
    var host = el(); if (!host) return;
    var st = null, plan = 'unknown plan';
    try { st = G.AGN && G.AGN.api && G.AGN.api.stats ? G.AGN.api.stats() : null; } catch (_) {}
    try { if (G.AGN && G.AGN.tier) plan = G.AGN.tier.isPaid() ? 'Professional plan' : 'no plan configured'; } catch (_) {}
    if (!st || !st.cap) {
      host.title = 'API budget unavailable';
      host.setAttribute('data-state', 'unknown');
      return;
    }
    var frac = Math.max(0, Math.min(1, (st.weight || 0) / st.cap));
    var fill = host.querySelector('i');
    if (fill) fill.style.width = (frac * 100).toFixed(1) + '%';
    host.setAttribute('data-state', st.capped ? 'capped' : (frac > 0.8 ? 'high' : 'ok'));
    host.title = 'API budget · ' + Math.round(st.weight || 0).toLocaleString() + ' of '
               + Number(st.cap).toLocaleString() + ' used on the ' + plan
               + ' · ' + (st.requests || 0) + ' requests, ' + Math.round(st.savedWeight || 0).toLocaleString()
               + ' saved from cache'
               + (st.capped ? ' · BUDGET REACHED, live refresh paused' : '');
  }
  G.AGN = G.AGN || {};
  G.AGN.budgetBar = { paint: paint };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();
  setInterval(paint, 5000);
})(window);
