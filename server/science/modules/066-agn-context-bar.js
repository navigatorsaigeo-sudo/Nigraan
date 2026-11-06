


(function (G) {
  'use strict';
  var D = G.document, AGN = G.AGN = G.AGN || {};
  var UNSET = {
    location:'no location selected', unit:'unit unresolved',
    hazard:'no layer selected', time:'time basis unresolved',
    data:'data state unknown', client:'no client project open',
    

    subject:'no decision subject established'
  };

  function bar() {
    var el = D.getElementById('agnContextBar');
    if (el) return el;
    var nav = D.getElementById('machNav');
    if (!nav || !nav.parentNode) return null;
    el = D.createElement('div');
    el.id = 'agnContextBar';
    el.className = 'agn-ctxbar';
    el.setAttribute('aria-label', 'Current analysis context');
    el.setAttribute('aria-live', 'polite');
    nav.parentNode.insertBefore(el, nav.nextSibling);
    return el;
  }

  function txt(id) { var e = D.getElementById(id); return e ? (e.textContent || '').trim() : ''; }

  

  var _grain = { val: null, at: 0, els: [], obs: null };
  function mapGrain() {
    var now = Date.now();
    if (_grain.val !== null && now - _grain.at < 2000 && _grain.els.length && _grain.els.every(function (e) { return e.isConnected; })) return _grain.val;
    var pressed = [].filter.call(D.querySelectorAll('.maptools button'),
      function (b) {
        if (!/^(province|tehsil)$/i.test((b.textContent || '').trim())) return false;
        return b.getAttribute('aria-pressed') === 'true'
            || b.classList.contains('on') || b.classList.contains('active');
      })[0];
    var g = pressed ? ' \u00b7 ' + (pressed.textContent || '').trim().toLowerCase() + ' view' : '';
    try {
      if (_grain.obs) _grain.obs.disconnect();
      _grain.els = [].slice.call(D.querySelectorAll('.maptools'));
      if (_grain.els.length && typeof MutationObserver === 'function') {
        _grain.obs = new MutationObserver(function () { _grain.val = null; });
        _grain.els.forEach(function (e) { _grain.obs.observe(e, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-pressed', 'class'] }); });
        _grain.val = g; _grain.at = now;
      } else _grain.val = null;
    } catch (_) { _grain.val = null; }
    return g;
  }
  function read() {
    var out = {};
    try {
      var sel = D.querySelector('.citysel button');
      out.location = sel ? (sel.textContent || '').trim() : '';
    } catch (_) {}
    try {
      

      var st = null;
      try { st = (G.STATIONS || []).find(function (x) { return x.id === (G.selectedId || ''); })
                 || (G.STATIONS || [])[0] || null; } catch (_) {}
      

      

      

      var _stN = st ? (st.tehsil || st.district || st.name || st.id) : null;
       
      var _subDom = null; try { var _sc = D.querySelector('.agn-ctx-v[data-ctx="subject"]'); var _st = (typeof G.__agnCtxSubject === 'string') ? G.__agnCtxSubject.trim() : (_sc ? String(_sc.textContent || '').trim() : '');     if (_st && !/^no |^unit not/i.test(_st)) _subDom = _st.split(' \u00b7 ').pop(); } catch (_) {}
      var _locN = out.location && String(out.location).replace(/\s*\/.*$/, '');
      var nm = _subDom || _locN || _stN;
      if (nm && AGN.geo && AGN.geo.resolve) { var _g0 = AGN.geo.resolve(nm); if ((!_g0 || !_g0.resolved) && _locN && nm !== _locN) { var _g1 = AGN.geo.resolve(_locN); if (_g1 && _g1.resolved) nm = _locN; } }
      var g = (AGN.geo && AGN.geo.resolve && nm) ? AGN.geo.resolve(nm) : null;
      if ((!g || !g.resolved) && _stN && nm !== _stN) { var g2 = AGN.geo.resolve(_stN); if (g2 && g2.resolved) g = g2; }
      var grain = '';
      try {
        

        grain = mapGrain();
      } catch (_) {}
      if (g && g.resolved && g.key) out.unit = g.key + grain;
      else if (g) {
        out.unit = (AGN.geo.unresolvedLabel ? AGN.geo.unresolvedLabel() : 'unit not resolved');
        out.unitWhy = g.note || ('the platform could not resolve "' + nm + '" to a unit');
      }
    } catch (_) {}
    

    try {
      var pick = D.getElementById('mapHazardPick');
      out.hazard = pick && pick.selectedIndex >= 0
        ? (pick.options[pick.selectedIndex].text || '').trim() : '';
      out.hazard_id = null;
      try {
        var _sel = (AGN.hazard && AGN.hazard.get) ? AGN.hazard.get() : null;
        out.hazard_id = (AGN.hazardRegistry && AGN.hazardRegistry.resolve)
                          ? AGN.hazardRegistry.resolve(_sel) : _sel;
      } catch (_) {}
       
      if (out.hazard_id == null && pick && pick.value) {
        try { out.hazard_id = (AGN.hazardRegistry && AGN.hazardRegistry.resolve)
                                ? AGN.hazardRegistry.resolve(pick.value) : null; } catch (_) {}
      }
      if (out.hazard_id == null && out.hazard) {
        try { out.hazard_id = (AGN.hazardRegistry && AGN.hazardRegistry.resolve)
                                ? AGN.hazardRegistry.resolve(out.hazard) : null; } catch (_) {}
      }
    } catch (_) {}
    try {
      var basis = AGN.day && AGN.day.basis ? AGN.day.basis() : null;
      out.time = basis === 'current' ? 'current hour'
               : basis === 'peak' ? "today's peak" : (basis || '');
      

      try {
        var _hid = out.hazard_id || (D.getElementById('mapHazardPick') || {}).value || '';
        if (_hid === 'drought') {
          var _dn = G.__agnDroughtNat || null;
          out.time = '90-day window' + (_dn && _dn.asOf ? (' to ' + _dn.asOf) : '') + ' (global reanalysis, not a forecast)';
          out.timeWhy = 'SPEI/SPI-90 and root-zone soil moisture over the 90 days ending on the last global reanalysis day, about five days back; the day buttons do not move this layer';
        } else if (_hid === 'glof') {
          
          out.time = 'lake register \u00b7 our Sentinel-2 lake reads (not a forecast)';
          out.timeWhy = 'level from the routed glacial-lake register and our own lake reads; it changes with a new read or report, not with the hour';
        } else if (_hid === 'seismic' || _hid === 'cyclone') {
          out.time = 'static layer (no valid period)';
          out.timeWhy = 'a design-basis or exposure class; it does not change with the forecast';
        } else if (/^nss_/.test(_hid)) {
          out.time = (_hid === 'nss_baseline') ? 'static land property' : 'wetness-adjusted for the selected day';
        }
      } catch (_) {}
    } catch (_) {}
    try {
      

      var grade = txt('agnProvGrade') || txt('agnGradeBadge') || txt('agnDataGrade');
      var live = D.querySelector('.agn-prov-dot');
      out.data = grade || (live ? (live.getAttribute('title') || '').split('\n')[0] : '');
      

      try {
        var _hid2 = out.hazard_id || (D.getElementById('mapHazardPick') || {}).value || '';
        if (/^(heat|telco_heat|cold|wind|telco_wind|flood|flood_pluvial|rain_hz|landslide|telco_flood)$/.test(_hid2)) {
          out.data = grade ? (grade + ' \u00b7 temperature verification') : out.data;
        } else if (_hid2 === 'drought') { out.data = 'global reanalysis table \u00b7 grade not applicable'; out.dataWhy = 'the temperature verification grade does not cover a reanalysis drought index'; }
        else if (_hid2 === 'glof') { out.data = 'lake register \u00b7 grade not applicable'; out.dataWhy = 'the temperature verification grade does not cover the glacial-lake register'; }
        else if (_hid2 === 'seismic' || _hid2 === 'cyclone') { out.data = 'static \u00b7 grade not applicable'; }
        else if (_hid2 === 'aqi') { out.data = 'CAMS model \u00b7 no sensor, no grade'; }
      } catch (_) {}
      var dot = D.getElementById('agnProvDot') || live;
      if (dot && dot.getAttribute('title')) out.dataWhy = dot.getAttribute('title').split('\n')[0];
    } catch (_) {}
    try {
      var p = AGN.project && AGN.project.state ? AGN.project.state() : null;
      if (p && p.company && p.company.client_name) {
        out.client = p.company.client_name + ' · ' + (p.assets || []).length + ' asset'
          + ((p.assets || []).length === 1 ? '' : 's');
      }
    } catch (_) {}
    return out;
  }

  

  function subjectField(out) {
    try {
      var s = AGN.subject ? AGN.subject.get() : null;
      if (!s) return;
      var view = '';
      try { var av = D.querySelector('.view.active[data-view]'); view = av ? av.dataset.view : ''; } catch (_) {}
      var mode = AGN.subject.modeOf(view);
      if (s.unit) {
        out.subject = s.asset_name ? (s.asset_name + ' \u00b7 ' + s.unit) : s.unit;
        out.subjectWhy = s.unitWhy
          + ' \u00b7 ' + ({follows:'this workspace FOLLOWS the subject',
                              compares:'this workspace COMPARES against the subject',
                              national:'this workspace is NATIONAL context'}[mode]
                             || 'this workspace has NOT DECLARED its relationship to the subject')
          + ': ' + AGN.subject.modeWhy(view)
          + (s.complete ? '' : ' \u00b7 not yet a complete decision case: missing ' + s.missing.join(', '));
      } else if (s.unitUnresolvedName) {
        out.subjectWhy = 'the name "' + s.unitUnresolvedName + '" was offered as the subject and this '
          + 'build holds no unit for it, so no subject is established';
      }
    } catch (_) {}
  }

  var LABELS = [['subject','Subject'], ['location','Location'], ['unit','Unit'],
                ['hazard','Layer'], ['time','Time'], ['data','Data'], ['client','Client']];

  function paint() {
    var el = bar(); if (!el) return;
    

    var _sj = {}; subjectField(_sj); G.__agnCtxSubject = _sj.subject || '';
    var v = read();
    subjectField(v);
     
    try { var _ol = AGN.olState ? AGN.olState() : null;
      if (_ol && _ol.id && _ol.data && _ol.data.ready) { v.hazard = 'Outlook: ' + (_ol.data.title || _ol.id); v.hazardWhy = 'an outlook layer is painting the map; the hazard layer in the picker is underneath it';
        if (_ol.data.valid) v.time = 'outlook period ' + _ol.data.valid; } } catch (_) {}
    el.innerHTML = LABELS.map(function (pair) {
      var k = pair[0], value = (v[k] || '').trim();
      var unresolved = !value;
      var why = v[k + 'Why'];
      return '<span class="agn-ctx-item' + (unresolved ? ' agn-ctx-unset' : '') + '"'
        + (why ? ' title="' + String(why).replace(/"/g, '&quot;').slice(0, 220) + '"' : '') + '>'
        + '<span class="agn-ctx-k">' + pair[1] + '</span>'
        + '<span class="agn-ctx-v" data-ctx="' + k + '">'
        + String(unresolved ? UNSET[k] : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        + '</span></span>';
    }).join('');
  }

  function wire() {
    paint();
    ['agn:project', 'agn:assets', 'agn:day', 'agn:location', 'agn:layer']
      .forEach(function (n) { D.addEventListener(n, paint); });
    var pick = D.getElementById('mapHazardPick');
    if (pick) pick.addEventListener('change', paint);
    D.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('.citysel') || t.closest('#v3days') || t.closest('.dist-toggle')
          || t.closest('#machNav')) setTimeout(paint, 220);
    }, true);
    

  }

  AGN.context = { read:read, refresh:paint, unresolved:function () { return Object.assign({}, UNSET); } };

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', wire);
  else wire();
})(window);
