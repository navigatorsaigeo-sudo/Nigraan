


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var D = G.document;

  var VIEW_LABEL = {
    overview: 'Overview', livedata: 'Forecast', airisk: 'AI Decision',
    assessments: 'Assets', report: 'Reports', hybridlab: 'Scenario',
    operations: 'Operations', modelab: 'Evidence & Methods'
  };

  function activeViewEl() {
    return D.querySelector('.view.active') || D.querySelector('.view');
  }
  function activeViewName() {
    var v = activeViewEl();
    return v ? (v.getAttribute('data-view') || 'view') : 'view';
  }

  


  var NATIONAL_VIEWS = { overview: true };

  

  function agnSubjectPlace() {
    try {
      var S = G.AGN && G.AGN.subject; if (!S) return null;
      var s = null;
      try { var r = (typeof S.demand === 'function') ? S.demand('calculator') : null;
            s = (r && r.subject) ? r.subject : r; } catch (_) {}
      if (!s || !s.unit) { try { s = S.get(); } catch (_) { s = null; } }
      if (!s || !s.unit) return null;
      var out = { name: s.unit, __fromSubject: true,
                  assetId: s.asset_id || null, assetName: s.asset_name || null };
      if (s.asset_lat != null && s.asset_lon != null) { out.lat = s.asset_lat; out.lon = s.asset_lon; }
      return out;
    } catch (_) { return null; }
  }
  try { G.agnSubjectPlace = agnSubjectPlace; } catch (_) {}
  function activeUnitKey() {
    try {
      var L = agnSubjectPlace() || (G.AGN.flow && G.AGN.flow.location ? G.AGN.flow.location() : null);
      if (!L || !L.name) return null;
      var D_ = G.DISTRICT_IN || {};
      if (D_[L.name]) return L.name;
      var d = G.PK_KEY_TO_DISTRICT && G.PK_KEY_TO_DISTRICT[L.name];
      if (d && D_[d]) return d;
      /* v91.17.268 · a settlement name is not a unit key: the unit is the tehsil that contains the chosen point (AGN.siteUnit) */
      var P = (L.lat != null && L.lon != null) ? L : null;
      if (!P) { var F = G.AGN.flow && G.AGN.flow.location ? G.AGN.flow.location() : null; if (F && F.lat != null && F.lon != null && String(F.name || '') === String(L.name)) P = F; }
      var su = (P && G.AGN.siteUnit) ? G.AGN.siteUnit(+P.lat, +P.lon) : null;
      return (su && su.key && D_[su.key]) ? su.key : null;
    } catch (_) { return null; }
  }

  function unitIsLive(key) {
    try {
      var r = (G.DISTRICT_IN || {})[key];
      return !!(r && (r.weatherLive || r.nationalLive || r.forecastLive));
    } catch (_) { return false; }
  }

  function nationalCovered() {
    try {
      var ns = (typeof G.NATIONAL_STATE !== 'undefined') ? G.NATIONAL_STATE : null;
      return ns && typeof ns.covered === 'number' ? ns.covered : 0;
    } catch (_) { return 0; }
  }

  function issuable() {
    var n = 0;
    try { n = (G.AGN.evidence && G.AGN.evidence.count) ? G.AGN.evidence.count() : 0; } catch (_) {}



    

    var scenario = false, preset = null;
    try {
      var st = G.AGN.sectionState && G.AGN.sectionState.state
        ? G.AGN.sectionState.state('hybridlab', {}) : null;
      preset = st ? (st.preset || null) : null;
      scenario = !!(preset && preset !== 'baseline');
    } catch (_) {}

    var view = activeViewName();
    var national = !!NATIONAL_VIEWS[view];
    var unit = national ? null : activeUnitKey();
    var live = national ? (nationalCovered() > 0) : (!!unit && unitIsLive(unit));

    var cls = null;
    try {
      cls = G.AGN.prov && G.AGN.prov.outputClass
        ? G.AGN.prov.outputClass({
            scenario: scenario,
            prov: (n > 0 && live) ? G.AGN.prov.STATE.RETRIEVED : G.AGN.prov.STATE.ABSENT,
            national: national
          })
        : null;
    } catch (_) {}

    

    var _rtMode = 'live';
    try{ if(G.AGN && G.AGN.runtimeMode) _rtMode = G.AGN.runtimeMode.mode; }catch(_){}
    

    var _receiptBound = false;
    try {
      var _q0 = (G.AGN && G.AGN.qaReceipt) || {};
      var _l0 = (G.AGN && G.AGN.liveAcceptance) || {};
      _receiptBound = (_q0.stamped === true) && !!_q0.identity_sha256
                      && !!_l0.binds_identity
                      && String(_l0.binds_identity) === String(_q0.identity_sha256);
    } catch (_) { _receiptBound = false; }
    

    var _below = [];
    try { if (G.AGN && G.AGN.calibrationLadder) _below = G.AGN.calibrationLadder.belowFloor(); } catch (_) { _below = []; }
    var _recCons = null;
    try {
      var _r0 = (G.AGN && G.AGN.decisionRecord) ? G.AGN.decisionRecord.last() : null;
      _recCons = _r0 ? !!_r0.consistent : null;
    } catch (_) { _recCons = null; }
    var base = { cls: cls, view: view, national: national, unit: unit,
                 evidence: n, live: live, runtimeMode: _rtMode,
                 receiptBound: _receiptBound,
                 stagesBelowFloor: _below, recordConsistent: _recCons };

    

    try {
      var _ri = G.AGN.reportIntegrity;
      if (_ri && _ri.degraded) {
        return Object.assign(base, { ok: false, degraded: true, why:
          'The canonical hazard classifier was unavailable when this document was '
          + 'built, so hazards were classified by the local fallback and a '
          + 'classification may differ from the screen. The preview and the JSON '
          + 'diagnostic remain available and are marked degraded; no client '
          + 'document is issued from this state.' });
      }
    } catch (_) {}

    

    try {
      var _ci = (G.AGN.decisionCase && G.AGN.decisionCase.integrity)
        ? G.AGN.decisionCase.integrity() : null;
      

      if (_ci && _ci.demo === true) {
        return Object.assign(base, { ok: false, demo: true, caseIntegrity: _ci, why:
          'This package is the Complete Demo Case \u2014 demonstration data carried '
          + 'under a demonstration client, loaded to walk through the workflow. Every '
          + 'record in it is marked demo and none of it describes a real asset. No '
          + 'client document is issued from it. Clear the client data and load the '
          + 'real project to produce an issuable package.' });
      }

      

      if (_ci && _ci.total > 0 && _ci.case_established === false) {
        return Object.assign(base, { ok: false, caseIntegrity: _ci, why:
          'This project has no decision case yet: it is missing '
          + ((_ci.case_missing || ['a client name', 'an active asset']).join(' and '))
          + '. A decision case is the client, the asset, the hazard and the horizon '
          + 'together, and it is what a document is issued under — without it the '
          + (_ci.total + ' record(s) already gathered cannot be shown to belong to '
             + 'anything. Set both in the client project and the evidence binds.') });
      }
      

      try {
        var _fd = (AGN.sectionState && AGN.sectionState.state)
                    ? (AGN.sectionState.state('assessments', {}) || {}).reportDoc : null;
        if (_fd && _fd.identity_incomplete && _fd.identity_incomplete.length) {
          return { ok:false, cls:CLASSES.demo ? null : null,
                   why:'the frozen document cannot be traced to a decision case: it is '
                     + 'missing ' + _fd.identity_incomplete.join(', ').replace(/_/g, ' ')
                     + '. A client document states which case, asset, hazard and horizon '
                     + 'produced it, and carries a hash over that statement.' };
        }
      } catch (_) {}
      if (_ci && _ci.total > 0 && _ci.issuable === false) {
        return Object.assign(base, { ok: false, caseIntegrity: _ci, why:
          (_ci.mismatched > 0
            ? ('This package mixes evidence from more than one decision case: '
               + (_ci.why || (_ci.mismatched + ' record(s) disagree with the active case'))
               + '. ')
            

            : (_ci.unbound > 0
                ? (_ci.unbound + ' of ' + _ci.total + ' contributing record'
                   + (_ci.total === 1 ? '' : 's') + ' '
                   + (_ci.unbound === 1 ? 'is' : 'are') + ' not bound to this decision case, '
                   + (_ci.unbound === 1 ? 'written' : 'written') + ' before it was established. '
                   + (_ci.unbound === 1 ? 'It carries its' : 'Each one carries its')
                   + ' own asset, hazard and horizon, so binding '
                   + (_ci.unbound === 1 ? 'it' : 'them') + ' is a recomputation rather than a '
                   + 'guess: press Rebind to this decision case on the Result workspace, which '
                   + 'appears there whenever records can be carried. ')
                : ('This package may not be issued under the active decision case: '
                   + (_ci.why || 'the case integrity check did not pass') + '. ')))
          + 'A document carries its evidence forward under one case id; evidence that '
          + 'cannot be shown to belong to this one is not issued under it. Re-run the '
          + 'affected sections against the active case, or remove the records that '
          + 'belong elsewhere.' });
      }
    } catch (_) {}

    if (scenario) {
      return Object.assign(base, { ok: false, why: 'The Scenario Lab is on the "' + preset
        + '" setting rather than baseline. Every figure on screen answers '
        + '"what would the engine say if the weather were this", which is a sensitivity '
        + 'analysis and not a forecast. No document is issued from it. Reset the Scenario '
        + 'Lab to baseline and print again.' });
    }
    if (!n) {
      return Object.assign(base, { ok: false, why: 'Nothing has been retrieved in this session, so '
        + 'the hazard layer under these figures is a design surface rather than evidence. '
        + 'Load live data first — a PDF of a design surface is indistinguishable from a '
        + 'PDF of a forecast once it has been forwarded twice.' });
    }
    if (!live) {
      return Object.assign(base, { ok: false, why: national
        ? ('The national sweep has covered no units, so this board is drawn from seed '
           + 'values. Evidence held about other things in this session does not make '
           + 'this screen issuable.')
        : (unit
            ? ('No live values have landed for ' + unit + '. This session holds ' + n
               + ' evidence records, but none of them is about the unit on screen, and a '
               + 'document is only as good as the claims it actually makes.')
            : 'No unit is active, so there is nothing here whose provenance can be established.') });
    }
    

    try {
      if (G.AGN && G.AGN.runtimeMode && G.AGN.runtimeMode.isFixture()) {
        

        return Object.assign(base, { ok: false, evidence: n, live: false,
                 runtimeMode: 'fixture',
                 cls: { key: 'fixture', label: 'Fixture \u2014 seeded architecture exercise',
                        sub: 'Dynamic hazards in this session may be computed without live values '
                           + 'rather than provider readings. The mode exists so the architecture '
                           + 'can be exercised with nothing live. No document is issued from it.' },
                 why: 'This session is running in FIXTURE mode, in which dynamic hazards may be '
                    + 'scored without live values rather than from retrieved provider evidence. Nothing '
                    + 'produced in fixture mode may be issued. Switch to live mode and re-run '
                    + 'the affected sections against retrieved data.' });
      }
    } catch (_) {}

    

    try {
      var _dr = (G.AGN && G.AGN.decisionRecord) ? G.AGN.decisionRecord.last() : null;
      if (_dr && _dr.consistent === false) {
        return Object.assign(base, { ok: false, decisionRecord: G.AGN.decisionRecord.summary(), why:
          'The decision record compiled in this session does not agree with its own '
          + 'contract: it holds ' + _dr.ledger.issued + ' issued number(s), and re-checking '
          + 'them against the payload contract and the calibration ladder does not return '
          + 'the same verdict. One of the two is wrong and this build cannot tell you which, '
          + 'so no document is issued from either. Recompile the record; if it disagrees '
          + 'again the routing is at fault and not the numbers.' });
      }
    } catch (_) {}

    

    

    if (!_receiptBound) {
      var _why;
      try {
        var _q = (G.AGN && G.AGN.qaReceipt) || {};
        var _la = (G.AGN && G.AGN.liveAcceptance) || {};
        if (_q.stamped !== true) {
          _why = 'This artefact carries no external QA receipt: no gate suite has been '
               + 'bound to these exact bytes. That is the normal state of a development '
               + 'build and it is not a defect - it is the reason a development build '
               + 'may not issue a client document. Stamp the build against a suite run '
               + 'over these bytes, or use a delivered artefact.';
        } else {
          _why = 'The live-provider acceptance run on file was not made against this '
               + 'build. ' + (_la.binds_identity
                   ? 'It names identity ' + String(_la.binds_identity).slice(0, 12)
                     + '\u2026 while this artefact is '
                     + String(_q.identity_sha256 || 'unidentified').slice(0, 12) + '\u2026. '
                   : 'It names no build at all. ')
               + 'A pass from another artefact is historical evidence and cannot qualify '
               + 'these bytes: the providers it exercised are not the ones this code '
               + 'calls. Re-run the acceptance against this build and stamp it.';
        }
      } catch (_) {
        _why = 'This artefact cannot show that any suite or any live-provider run was '
             + 'bound to these exact bytes, so it may not issue a client document.';
      }
      return Object.assign(base, { ok: false, receiptBound: false, why: _why });
    }

    return Object.assign(base, { ok: true, receiptBound: true, why: null });
  }

   
  function contextHeader(kind) {
    var iss = issuable(), lines = [];
    var loc = null;
    try { loc = G.AGN.flow && G.AGN.flow.location ? G.AGN.flow.location() : null; } catch (_) {}
    lines.push('NIGRAAN — ' + (VIEW_LABEL[activeViewName()] || activeViewName()));
    lines.push('Exported ' + new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    if (loc && loc.name) lines.push('Location: ' + loc.name
      + (loc.lat != null ? ' (' + Number(loc.lat).toFixed(3) + ', ' + Number(loc.lon).toFixed(3) + ')' : ''));
    if (iss.cls) lines.push('Output class: ' + iss.cls.label + ' — ' + iss.cls.sub);
    lines.push('Scope: ' + (iss.national ? 'national board' : ('unit ' + (iss.unit || 'none')))
      + ' · live: ' + (iss.live ? 'yes' : 'no') + ' · evidence records: ' + iss.evidence);
    lines.push('Issuable: ' + (iss.ok ? 'yes' : 'no — ' + iss.why));
    try {
      var t = G.AGN.tier && G.AGN.tier.describe ? G.AGN.tier.describe() : null;
       
    } catch (_) {}
    try {
      var ev = G.AGN.evidence && G.AGN.evidence.summary ? G.AGN.evidence.summary() : null;
      if (ev) lines.push('Evidence: ' + ev.records + ' records from ' + ev.sources
        + ' sources, ' + ev.unavailable + ' recording no value');
    } catch (_) {}
    if (kind) lines.push('Export: ' + kind);
    return lines;
  }

   
  function printStampEl() {
    var el = D.getElementById('agnPrintStamp');
    if (!el) {
      el = D.createElement('div');
      el.id = 'agnPrintStamp';
      D.body.insertBefore(el, D.body.firstChild);
    }
    return el;
  }

  

  function printScope() {
    var marked = [];
    try { D.documentElement.classList.add('agn-printing-report'); } catch (_) {}
    try {
      var node = D.getElementById('asmtReportPreview');
      if (node) {
        node.classList.add('agn-print-keep'); marked.push(node);
        var cur = node;
        while (cur && cur.parentNode && cur.parentNode !== D.documentElement) {
          var par = cur.parentNode;
          if (par.nodeType !== 1) break;
          [].slice.call(par.children).forEach(function (sib) {
            if (sib !== cur) { sib.classList.add('agn-print-drop'); marked.push(sib); }
          });
          par.classList.add('agn-print-keep'); marked.push(par);
          cur = par;
        }
      }
    } catch (_) {}
    return { kept: marked.length,
             release: function () {
               try { D.documentElement.classList.remove('agn-printing-report'); } catch (_) {}
               try { marked.forEach(function (el) {
                       el.classList.remove('agn-print-keep');
                       el.classList.remove('agn-print-drop'); }); marked = []; } catch (_) {}
             } };
  }

  function doPrint(noteEl) {
    var iss = issuable();
    if (!iss.ok) {
      if (noteEl) {
        noteEl.textContent = 'Printing refused. ' + iss.why;
        noteEl.style.color = '#b45309';
      }
      return false;
    }
    var el = printStampEl();
    el.textContent = contextHeader('PDF').join('  ·  ');
    var v = activeViewEl();
    

    if (v && el.parentNode !== v) v.insertBefore(el, v.firstChild);
    if (noteEl) { noteEl.textContent = ''; noteEl.style.color = ''; }
    

    var _scope = printScope();
    var _title0 = D.title;
    try {
      var _d = null;
      try { _d = AGN.sectionState.state('assessments', {}).reportDoc || null; } catch (_) {}
      if (_d && _d.title) D.title = String(_d.title) + (_d.id ? ' \u00b7 ' + _d.id : '');
    } catch (_) {}
    var _unmark = function () {
      _scope.release();
      try { if (_title0) D.title = _title0; } catch (_) {}
    };
    try { if (G.matchMedia) {
            var _mq = G.matchMedia('print');
            var _h = function (ev) { if (!ev.matches) { _unmark();
                       try { _mq.removeEventListener('change', _h); } catch (_) {} } };
            _mq.addEventListener('change', _h);
          } }catch(_){}
    try { G.addEventListener('afterprint', _unmark, { once: true }); } catch (_) {}
    setTimeout(function () { try { G.print(); } catch (_) {} }, 60);
     
    setTimeout(_unmark, 20000);
    return true;
  }

   
  function agnMoveArchitectureBadge() {
    try {
      if (D.getElementById('agnArchitectureInfo')) return;
      var lab = D.querySelector('[data-view="modelab"]');
      if (!lab) return;
      var b = D.createElement('button');
      b.id = 'agnArchitectureInfo';
      b.className = 'agn-arch-badge agn-build-badge';
      b.type = 'button';
      b.title = 'AI GEO NIGRAAN build and architecture';
      b.textContent = 'Architecture \u00b7 v' + (G.AGN_VERSION || 'version-unset');
      var row = D.getElementById('agnVerifyRow');
      if (row) row.appendChild(b); else lab.appendChild(b);
    } catch (_) {}
  }

  function init() { setTimeout(agnMoveArchitectureBadge, 900); }
  if (D.readyState !== 'loading') init();
  else D.addEventListener('DOMContentLoaded', init);

  G.AGN.exports = {
    issuable: issuable,
    contextHeader: contextHeader, print: doPrint, printScope: printScope, activeViewEl: activeViewEl,
    activeUnitKey: activeUnitKey, unitIsLive: unitIsLive,
    version: 'v89.36'
  };
})(window);
