


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var D = G.document;
  function $(id) { return D.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; });
  }
  function mins(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a < 90) return Math.round(n) + ' min';
    var hh = Math.floor(a / 60), mm = Math.round(a % 60);
    return (n < 0 ? '-' : '') + hh + ' h ' + (mm < 10 ? '0' : '') + mm + ' min';
  }
  var PILL = {
    'window-closed': ['#B3261E', 'Response window closed'],
    'over':          ['#DA750F', 'Over the limit now'],
    'approaching':   ['#0C3851', 'Approaching'],
    'clear':         ['#35682B', 'Not crossed'],
    'not-evaluated': ['#8b7aa8', 'Not evaluated']
  };
  function pill(state) {
    var p = PILL[state] || ['#8b7aa8', state];
    return '<span style="display:inline-block;padding:1px 8px;border-radius:9px;font-size:0.75rem;'
         + 'font-weight:600;color:#fff;background:' + p[0] + '">' + esc(p[1]) + '</span>';
  }

  var LAST = null;

  


  

  function confCell(r) {
    var c = r.confidence;
    if (!c) return '<span class="agn-enssub">not assessed</span>';
    if (!c.assessed) {
      return '<span style="color:#B3261E;font-weight:600">No measured error</span>'
           + '<br><span class="agn-enssub">' + esc(c.why) + '</span>';
    }
    var e = c.error || {};
    var HEAD = {
      'crossing-inside-error': ['#DA750F', 'Crossing inside the error'],
      'crossing-beyond-error': ['#35682B', 'Crossing beyond the error'],
      'clear-inside-error':    ['#DA750F', 'Not crossed, by less than the error'],
      'clear-beyond-error':    ['#35682B', 'Not crossed, by more than the error']
    };
    var hd = HEAD[c.verdict] || ['#8b7aa8', 'assessed'];
    var head = '<b style="color:' + hd[0] + '">' + esc(hd[1]) + '</b>';
    return head + '<br><span class="agn-enssub">'
      + esc(c.scaleName ? c.scaleName.toUpperCase() : 'RMSE') + ' '
      + (c.scale == null ? '—' : Number(c.scale).toFixed(2))
      + ' · ' + (c.passesLimit ? 'exceedance ' : 'clearance ')
      + (c.margin == null ? '—' : Math.abs(Number(c.margin)).toFixed(2))
      + (c.timingUncertaintyMin != null ? ' · timing ±' + mins(c.timingUncertaintyMin) : '')
      + '<br>' + esc(e.why || '')
      + (e.upperBound ? ' (upper bound)' : '')
      + '</span>';
  }

  function renderRegister() {
    var s = G.AGN.assets.summary(), st = $('assetState'), stamp = $('assetStamp');
    if (stamp) stamp.textContent = s.assets ? (s.assets + ' assets · ' + s.limits + ' limits')
                                            : 'No register';
    if (st) {
      st.textContent = s.assets
        ? ('Loaded from ' + s.source + ': ' + s.assets + ' assets, ' + s.limits + ' limits'
           + (s.rejected ? ', ' + s.rejected + ' rows rejected' : '')
           + (s.withoutActionTime ? ', ' + s.withoutActionTime + ' limits with no action time' : '')
           + '.')
        : 'No sites with operating limits yet: add them in Client Risk \u203a Add sites.';
    }
  }

  function render() {
    var host = $('assetBody');
    if (!host) return;
    var rej = G.AGN.assets.rejected();
    var out = [];

    if (rej.length) {
      out.push('<div class="agn-refusal"><b>' + rej.length + ' register row'
        + (rej.length === 1 ? '' : 's') + ' rejected</b> — listed rather than repaired, because '
        + 'a default filled in here would put an AGN number inside a client operating envelope '
        + 'under the client\'s own asset name.<ul>'
        + rej.map(function (x) {
            return '<li><b>' + esc(x.name || x.id) + '</b> — ' + esc(x.errors.join('; ')) + '</li>';
          }).join('') + '</ul></div>');
    }

    if (!LAST) {
      out.push('<div class="agn-enssub">' + (G.AGN.assets.summary().assets
        ? 'Register loaded. Evaluate it against the nowcast to see the time left to act.'
        : 'No sites with operating limits yet: add them in Client Risk \u203a Add sites.') + '</div>');
      host.innerHTML = out.join('');
      return;
    }
    if (!LAST.ok) {
      out.push('<div class="agn-refusal"><b>Nothing to evaluate</b> — ' + esc(LAST.why) + '</div>');
      host.innerHTML = out.join('');
      return;
    }

    var c = LAST.counts || {};
    out.push('<div class="agn-enssub" style="margin-bottom:10px">'
      + LAST.assets + ' assets · ' + LAST.rows.length + ' limits evaluated · '
      + (c['window-closed'] || 0) + ' with the response window closed · '
      + (c.over || 0) + ' over the limit · ' + (c.approaching || 0) + ' approaching · '
      + (c.clear || 0) + ' clear · ' + (c['not-evaluated'] || 0) + ' not evaluated. '
      + '<b>Exposure only.</b> This board says whether the forecast crosses a limit written '
      + 'for the asset. It does not say the asset stops, and it produces no monetary '
      + 'figure.</div>');

    out.push('<div class="opsx-tablewrap"><table class="opsx-table"><thead><tr>'
      + '<th>Asset</th><th>Limit</th><th>Authority</th><th>State</th>'
      + '<th class="num">Crossing</th><th class="num">Response</th>'
      + '<th class="num">Time left to act</th><th>Measured error</th>'
      + '<th>What this means</th></tr></thead><tbody>');

    LAST.rows.forEach(function (r) {
      var left;
      if (r.state === 'window-closed') {
        left = '<b style="color:#B3261E">Closed</b><br><span class="agn-enssub">short by '
             + mins(Math.abs(r.leadToAction)) + '</span>';
      } else if (r.state === 'approaching') {
        left = (r.leadToAction == null)
          ? '<span class="agn-enssub">no action time registered</span>'
          : '<b>' + mins(r.leadToAction) + '</b>';
      } else if (r.state === 'over') {
        left = '<span class="agn-enssub">already crossed'
             + (r.clearsInMin == null ? '' : ' · releases in ' + mins(r.clearsInMin)) + '</span>';
      } else { left = '—'; }

      out.push('<tr><td><b>' + esc(r.asset) + '</b><br><span class="agn-enssub">'
        + esc(r.assetId) + '</span></td>'
        + '<td>' + esc(r.variable) + ' ' + esc(r.dir) + ' ' + esc(r.limit) + '</td>'
        + '<td>' + esc(r.authority)
        + (r.authority === 'agn-default'
            ? '<br><span class="agn-enssub">an AGN default, not a limit this client set</span>'
            : (r.reference ? '<br><span class="agn-enssub">' + esc(r.reference) + '</span>' : ''))
        + '</td>'
        + '<td>' + pill(r.state) + '</td>'
        + '<td class="num">' + (r.leadMin == null ? '—' : mins(r.leadMin)) + '</td>'
        + '<td class="num">' + (r.actionMin == null
            ? '<span class="agn-enssub">not registered</span>' : mins(r.actionMin)) + '</td>'
        + '<td class="num">' + left + '</td>'
        + '<td>' + confCell(r) + '</td>'
        + '<td><span class="agn-enssub">' + esc(r.why) + '</span></td></tr>');
    });
    out.push('</tbody></table></div>');

    var ne = LAST.rows.filter(function (r) { return r.state === 'not-evaluated'; });
    if (ne.length) {
      out.push('<div class="agn-refusal" style="margin-top:10px"><b>' + ne.length
        + ' limit' + (ne.length === 1 ? '' : 's') + ' could not be timed</b><ul>'
        + ne.map(function (r) {
            return '<li><b>' + esc(r.asset) + ' · ' + esc(r.variable) + '</b> — '
                 + esc(r.why) + '</li>'; }).join('')
        + '</ul>They are on the board rather than dropped: an asset missing from a board reads '
        + 'as an asset that is fine.</div>');
    }

    var noErr = LAST.rows.filter(function (x) {
      return x.confidence && !x.confidence.assessed; });
    if (noErr.length) {
      out.push('<div class="agn-refusal" style="margin-top:10px"><b>' + noErr.length
        + ' of these limits sit on a variable whose error has not been measured</b><ul>'
        + noErr.map(function (x) {
            return '<li><b>' + esc(x.asset) + ' · ' + esc(x.variable) + '</b> — '
                 + esc(x.confidence.why) + '</li>'; }).join('')
        + '</ul>No related variable\'s error is substituted. A crossing on these rows is '
        + 'shown with its time and without any claim about how reliable that time is.</div>');
    }
    out.push('<div class="agn-enssub" style="margin-top:8px"><b>What this board is not.</b> '
      + 'It is not a downtime estimate — whether work halts depends on the asset condition, the '
      + 'crew and the client\'s own rules, none of which this build holds. It is not a loss '
      + 'estimate, and no monetary figure is derived from it anywhere.</div>');
    host.innerHTML = out.join('');
  }

  function nowcastFor(lat, lon) {
    return G.AGN.nowcast.run(lat, lon);
  }
  

  try { G.AGN = G.AGN || {}; G.AGN.assetsBoard = { last:function () { return LAST; },
        evaluate:function () { return evaluate(); } }; } catch (_) {}

  function evaluate() {
    var st = $('assetState');
    if (st) st.textContent = 'Evaluating the register against the nowcast…';
    return G.AGN.assets.evaluate(nowcastFor).then(function (res) {
      LAST = res; renderRegister(); render(); return res;
    }).catch(function (e) {
      LAST = { ok:false, why:String((e && e.message) || e) };
      render(); return LAST;
    });
  }

  function loadRows(rows, source) {
    G.AGN.assets.load(rows, source);
    LAST = null;
    renderRegister(); render();
  }

  function init() {
    if (!$('assetBody')) return;
    var b;
    if ((b = $('assetEvaluate'))) b.addEventListener('click', function () { evaluate(); });
    

    D.addEventListener('agn:assets', renderRegister);
    

    D.addEventListener('agn:assetsEvaluated', function (e) {
      LAST = (e && e.detail) || LAST; renderRegister(); render();
    });
    renderRegister(); render();
  }
  if (D.readyState !== 'loading') init();
  else D.addEventListener('DOMContentLoaded', init);

  G.AGN.assetBoard = { render:render, evaluate:evaluate, loadRows:loadRows,
                       last:function () { return LAST; }, version:'v89.39' };
})(window);
