


(function (G) {
  'use strict';
  var D = G.document, AGN = G.AGN = G.AGN || {};
  var OVERRIDDEN = false;

  function sel() { return D.getElementById('aiSectorSel'); }
  function note() {
    var n = D.getElementById('aiSectorSource');
    if (n) return n;
    var seg = D.getElementById('aiSectorSeg');
    if (!seg) return null;
    n = D.createElement('span');
    n.id = 'aiSectorSource';
    n.className = 'agn-sector-source';
    seg.parentNode.insertBefore(n, seg.nextSibling);
    return n;
  }

  function leadAsset() {
    try {
      var p = AGN.project && AGN.project.state ? AGN.project.state() : null;
      var list = (p && p.assets) || [];
      if (!list.length) return null;
      var active = (AGN.project && AGN.project.activeAsset) ? AGN.project.activeAsset() : null;
      if (active) return active;
      return list[0];
    } catch (_) { return null; }
  }

  function apply(reason) {
    var s = sel(), n = note();
    if (!s || !n) return;
    var a = leadAsset();
    if (!a) {
      OVERRIDDEN = false;
      n.textContent = 'No client project is open, so this sector is a choice you are making, '
        + 'not a fact about an asset. Load a project in the Assets tab to have it follow the '
        + 'asset register.';
      return;
    }
    var want = String(a.asset_type || '').toLowerCase();
    var known = [].some.call(s.options, function (o) { return o.value === want; });
    if (OVERRIDDEN && reason === 'change') {
      n.textContent = 'Sector override — you have selected ' + s.value + ', which is not '
        + 'the declared type of ' + (a.name || 'the leading asset') + ' ('
        + (a.asset_type || 'unclassified') + '). This is a scenario, not an assessment of '
        + 'that asset.';
      return;
    }
    if (!known) {
      n.textContent = 'The leading asset ' + (a.name || '') + ' is recorded as "'
        + (a.asset_type || 'unclassified') + '", which is not one of the sector lenses this '
        + 'build holds, so the sector below is a choice rather than the asset\u2019s own type.';
      return;
    }
    if (s.value !== want) { s.value = want; try { s.dispatchEvent(new Event('change', { bubbles:true })); } catch (_) {} }
    n.textContent = 'Sector from ' + (a.name || 'the leading asset') + ' · '
      + (a.location || 'location not stated')
      + ' — the active asset in the open project.';
  }

  function wire() {
    var s = sel(); if (!s) return;
    s.addEventListener('change', function () {
      var a = leadAsset();
      if (a && String(a.asset_type || '').toLowerCase() !== s.value) OVERRIDDEN = true;
      else OVERRIDDEN = false;
      apply('change');
    });
    D.addEventListener('agn:project', function () { OVERRIDDEN = false; apply('project'); });
    setTimeout(function () { apply('init'); }, 700);
  }

  AGN.aiSector = { apply:apply, overridden:function () { return OVERRIDDEN; } };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', wire);
  else wire();
})(window);
