


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var D = G.document;
  function $(id) { return D.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function n1(v) { return (v == null || !isFinite(v)) ? '—' : (Math.round(v * 10) / 10); }

  var UNIT = { precipitation: ' mm', temperature_2m: ' °C' };
  var LAST = null;           
  var BUSY = false;

  function place() {
    try {
      

      var S = (typeof G.agnSubjectPlace === 'function') ? G.agnSubjectPlace() : null;
      if (S && S.lat != null && S.lon != null) return S;
      var L = G.AGN.flow && G.AGN.flow.location ? G.AGN.flow.location() : null;
      if (L && L.lat != null && L.lon != null) return L;
    } catch (_) {}
    return null;
  }

  function refusal(msg) {
    return '<div class="agn-refusal">' + esc(msg) + '</div>';
  }

   
  function systemTable(res, lead) {
    var rows = (res.systems || []).map(function (sys) {
      if (sys.absent) {
        return '<tr><td><b>' + esc(sys.name) + '</b></td>'
             + '<td colspan="5" style="color:#8a6d3b">did not answer — ' + esc(sys.why) + '</td></tr>';
      }
      var d = (sys.days || [])[lead] || {};
      var spread = (d.p10 == null || d.p90 == null) ? null : (d.p90 - d.p10);
      var u = UNIT[res.variable] || '';
      return '<tr>'
        + '<td><b>' + esc(sys.name) + '</b><br><span class="agn-enssub">' + esc(sys.org) + '</span></td>'
        + '<td><span class="agn-kind ' + (sys.kind === 'physical' ? 'physical' : 'ml') + '">'
        + esc(sys.kind === 'physical' ? 'physical' : 'machine learning') + '</span></td>'
        + '<td>' + sys.members + (sys.shortOfExpected
              ? ' <span style="color:#b45309">of ' + sys.expected + '</span>' : '') + '</td>'
        + '<td>' + n1(d.p50) + u + '</td>'
        + '<td>' + n1(d.p10) + ' – ' + n1(d.p90) + u + '</td>'
        + '<td>' + (spread == null ? '—' : n1(spread) + u) + '</td>'
        + '</tr>';
    }).join('');
    return '<table class="agn-systab"><thead><tr>'
      + '<th>System</th><th>Type</th><th>Members</th><th>Median</th>'
      + '<th>10th–90th</th><th>Spread</th></tr></thead><tbody>'
      + rows + '</tbody></table>';
  }

   
  function disagreement(res, lead) {
    var s = G.AGN.ens && G.AGN.ens.systemSpread ? G.AGN.ens.systemSpread(lead, res) : null;
    if (!s) {
      return refusal('Only one system answered, so there is no between-system '
        + 'disagreement to report. The interval below is that system’s own '
        + 'member spread and is not a multi-system range.');
    }
    var u = UNIT[res.variable] || '';
    var widest = s.widest;
    var txt = '<b>The two systems differ.</b> ';
    if (s.medianGap != null) {
      txt += 'Their medians are ' + n1(s.medianGap) + u + ' apart at this lead time. ';
    }
    if (widest && widest.spread != null) {
      var other = s.rows.filter(function (r) { return r.id !== widest.id; })[0];
      txt += esc(widest.name) + ' is the wider of the two (' + n1(widest.spread) + u
           + (other && other.spread != null ? ' against ' + n1(other.spread) + u : '') + '). ';
    }
    

    var r = res;
    if (r.shares && r.shares.length > 1) {
      txt += 'The pool is <b>equal-system</b>: '
           + r.shares.map(function (x) {
               return esc(x.name) + ' ' + x.members + ' members, 50%'; }).join('; ')
           + '. Each system carries half the vote whatever its member count; '
           + 'relative skill over Pakistan is not yet measured per system, so no skill weight is applied.';
    }
    var eq = (G.AGN.ens && G.AGN.ens.equalWeightDay) ? G.AGN.ens.equalWeightDay(lead, r) : null;
    if (eq && eq.p50 != null) {
      var pooled = (r.days && r.days[lead]) || {};
      var mw = pooled.memberWeighted || {};
      txt += '<br><span class="agn-enssub">Member-count pool (diagnostic) median '
           + n1(mw.p50 != null ? mw.p50 : pooled.p50) + u + ' against the equal-system ' + n1(pooled.p50) + u
           + ' \u00b7 ' + esc(eq.note) + '</span>';
    }
    return '<div class="agn-callout">' + txt + '</div>';
  }

   
  function render(res) {
    var host = $('agnEnsBody');
    if (!host) return;
    if (!res) { host.innerHTML = ''; return; }
    var viz = G.AGN.viz;
    var u = UNIT[res.variable] || '';
    var lead = 1;                        
    if (!res.days || res.days.length < 2) lead = 0;

    var out = [];

    out.push(disagreement(res, lead));
    out.push(systemTable(res, lead));

     
    if (viz) {
      var rr = (res.systems || []).filter(function (x) { return !x.absent; }).map(function (sys) {
        var d = (sys.days || [])[lead] || {};
        return { label: sys.name, lo: d.p10, hi: d.p90, mid: d.p50,
                 colour: sys.kind === 'physical' ? '#0C3851' : '#14B8A6' };
      });
      var pooled = res.days[lead] || {};
      if (pooled.p10 != null) {
        rr.push({ label: 'Pooled (' + res.members + ')', lo: pooled.p10, hi: pooled.p90,
                  mid: pooled.p50, colour: '#DA750F' });
      }
      out.push(viz.ranges(rr, {
        title: 'Member range at lead day ' + lead + (res.days[lead] ? ' · ' + res.days[lead].date : ''),
        unit: u
      }));

      

      var byDay = res.days.map(function (d) {
        return d.insufficient
          ? { label: d.date, value: null, why: 'no members returned for this day' }
          : { label: d.date, value: d.p50,
              note: n1(d.p10) + '–' + n1(d.p90) + u + (d.disagreement ? ' · members disagree' : '') };
      });
      out.push(viz.series(byDay, {
        title: 'Pooled median by lead day',
        unit: u,
        colour: (res.variable === 'precipitation') ? '#0C3851' : '#DA750F'
      }));
    }

     
    var d0 = res.days[lead] || {};
    var ex = Object.keys(d0.exceed || {});
    if (ex.length) {
      out.push('<table class="agn-systab"><thead><tr><th>Threshold</th>'
        + '<th>Pooled probability</th>'
        + (res.systems || []).filter(function (x) { return !x.absent; })
             .map(function (x) { return '<th>' + esc(x.name) + '</th>'; }).join('')
        + '</tr></thead><tbody>'
        + ex.map(function (t) {
            return '<tr><td>≥ ' + esc(t) + u + '</td><td><b>'
              + Math.round((d0.exceed[t] || 0) * 100) + '%</b></td>'
              + (res.systems || []).filter(function (x) { return !x.absent; }).map(function (x) {
                  var dd = (x.days || [])[lead] || {};
                  var p = (dd.exceed || {})[t];
                  return '<td>' + (p == null ? '—' : Math.round(p * 100) + '%') + '</td>';
                }).join('')
              + '</tr>';
          }).join('')
        + '</tbody></table>');
    }

    out.push('<p class="agn-enssub" style="margin:8px 0 0">'
      + esc(res.accumulationBasis || '') + '. '
      + esc(res.pooling || 'Single system · no pooling applied.')
      + ' Issued ' + esc(String(res.issued).replace('T', ' ').slice(0, 16)) + ' UTC.</p>');

    host.innerHTML = out.join('');
  }

   
  function run() {
    if (BUSY) return;
    var L = place();
    var st = $('agnEnsState'), pl = $('agnEnsPlace');
    if (pl) pl.textContent = L ? (L.name || (n1(L.lat) + ', ' + n1(L.lon))) : 'No location selected';
    if (!L) {
      if (st) st.textContent = 'no location';
      render(null);
      var h = $('agnEnsBody');
      if (h) h.innerHTML = refusal('Choose a location first. The ensemble is a '
        + 'point forecast and there is nothing to run it against yet.');
      return;
    }
    if (!G.AGN.ens || !G.AGN.ens.fetch) {
      if (st) st.textContent = 'ensemble module unavailable';
      return;
    }
    BUSY = true;
    if (st) st.textContent = 'running both systems…';
    var v = ($('agnEnsVar') || {}).value || 'precipitation';
    G.AGN.ens.fetch(L.lat, L.lon, { variable: v, days: 7 }).then(function (res) {
      LAST = res;
      if (st) {
        st.textContent = res.systemsUsed + ' of ' + res.systemsRequested
          + ' systems · ' + res.members + ' members';
      }
      render(res);
    }).catch(function (e) {
      LAST = null;
      if (st) st.textContent = 'failed';
      var h = $('agnEnsBody');
      if (h) h.innerHTML = refusal('The ensemble request did not complete: '
        + (e && e.message ? e.message : 'unknown error')
        + '. Nothing is shown rather than a value carried over from an earlier run.');
    }).then(function () { BUSY = false; });
  }

  function init() {
    if (!$('agnEnsSection')) return;
    var b = $('agnEnsRun'); if (b) b.addEventListener('click', run);
    var v = $('agnEnsVar'); if (v) v.addEventListener('change', function () { if (LAST) run(); });
    D.addEventListener('agn:location', function () {
      var L = place(), pl = $('agnEnsPlace');
      if (pl) pl.textContent = L ? (L.name || (n1(L.lat) + ', ' + n1(L.lon))) : 'No location selected';
      

      LAST = null;
      var h = $('agnEnsBody'), st = $('agnEnsState');
      if (h) h.innerHTML = '';
      if (st) st.textContent = 'Not run for this location';
    });
    var L = place(), pl = $('agnEnsPlace');
    if (pl && L) pl.textContent = L.name || (n1(L.lat) + ', ' + n1(L.lon));
  }

  if (D.readyState !== 'loading') init();
  else D.addEventListener('DOMContentLoaded', init);

  G.AGN.ensPanel = { run: run, render: render, last: function () { return LAST; }, version: 'v89.36' };
})(window);
