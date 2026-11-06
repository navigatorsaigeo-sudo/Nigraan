


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var D = G.document;
  var TICK = null, AUTO = null;
  var AUTO_MS = 5 * 60 * 1000, TICK_MS = 30 * 1000;

  function $(id) { return D.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; });
  }
  function reg(name, fb) { try { return G.FR('nowcast.' + name); } catch (_) { return fb; } }
  function fmt(v, dp) {
    return (v === null || v === undefined || !isFinite(v)) ? '—' : Number(v).toFixed(dp || 0);
  }
  function signed(v, dp, unit) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(dp || 0) + unit;
  }
  function mins(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    if (n < 90) return Math.round(n) + ' min';
    var hh = Math.floor(n / 60), mm = Math.round(n % 60);
    return hh + ' h ' + (mm < 10 ? '0' : '') + mm + ' min';
  }

  

  function ageNow(res) {
    if (!res || !res.at) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(res.at));
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return Math.round((Date.now() - t) / 60000);
  }

  function badge(state) {
    var map = { 'sub-hourly': ['#35682B', 'sub-hourly'],
                'hourly-derived': ['#DA750F', 'hourly-derived'],
                'unknown': ['#8b7aa8', 'resolution unknown'],
                'absent': ['#8b7aa8', 'no values'],
                'stale': ['#B3261E', 'stale'] };
    var m = map[state] || ['#8b7aa8', esc(state)];
    return '<span style="display:inline-block;padding:1px 7px;border-radius:9px;font-size:0.75rem;'
         + 'font-weight:600;color:#fff;background:' + m[0] + '">' + esc(m[1]) + '</span>';
  }

  function render() {
    var host = $('nowcastBody'), stamp = $('nowcastStamp');
    if (!host) return;
    var res = G.AGN.nowcast && G.AGN.nowcast.last ? G.AGN.nowcast.last() : null;
    if (!res) {
      AGN_putH(host, '<div class="agn-enssub">Not run for this location.</div>');
      AGN_putT(stamp, 'Not run');
      return;
    }
    if (res.unavailable) {
      host.innerHTML = '<div class="agn-refusal"><b>No temporal diagnostic</b> — ' + esc(res.why) + '</div>';
      if (stamp) stamp.textContent = 'Unavailable';
      return;
    }

    var age = ageNow(res);
    var maxAge = reg('maxAgeMin', 90);
    var expired = (age === null) || (age > maxAge);
    if (stamp) stamp.textContent = expired ? 'Stale' : (mins(age) + ' old');

    var out = [];

    if (res.refreshFailed) {
      out.push('<div class="agn-refusal"><b>The last refresh did not answer</b> — '
        + esc(res.refreshFailedWhy) + '. The readings below are from '
        + esc(res.at) + ' UTC and are ' + mins(age) + ' old. They are not current.</div>');
    }
    if (expired) {
      

      out.push('<div class="agn-refusal"><b>Not current — values withheld.</b> '
        + (age === null
            ? 'No step in the last response falls at or before now, so nothing here is an '
              + 'observation of the present.'
            : 'The newest 15-minute step is ' + mins(age) + ' old, past the ' + maxAge
              + '-minute limit at which this build stops presenting a reading as current. '
              + 'Refresh, or treat the site as unmonitored.')
        + '</div>');
      host.innerHTML = out.join('');
      return;
    }

    out.push('<div class="agn-enssub" style="margin-bottom:10px">Newest step <b>'
      + esc(res.at) + ' UTC</b> · ' + mins(age) + ' old · ' + res.steps
      + ' steps from ' + esc(res.firstStep) + ' to ' + esc(res.lastStep)
      + '. The 15-minute cadence is what the endpoint returns; the label on each row is what '
      + 'was measured on this response at this point.</div>');

    out.push('<div class="opsx-tablewrap"><table class="opsx-table"><thead><tr>'
      + '<th>Variable</th><th class="num">Now</th><th>Resolution</th>'
      + '<th class="num">Change / h</th><th class="num">Next hour</th>'
      + '<th>Operating limit</th><th>Time to crossing</th></tr></thead><tbody>');

    res.variables.forEach(function (v) {
      var t = v.threshold || {};
      

      var cross = (!t || t.refused)
        ? ('<span class="agn-enssub">' + esc(t.why || 'not evaluated') + '</span>')
        : (t.alreadyOver
            ? ('<b style="color:#B3261E">Over the limit now</b><br><span class="agn-enssub">'
               + fmt(t.value, v.dp) + ' ' + esc(v.unit) + ' against ' + fmt(t.limit, 0) + ' '
               + esc(t.unit) + ' · '
               + (t.clearsInMin == null
                   ? 'no return below it within the horizon'
                   : 'releases in ' + mins(t.clearsInMin) + ' (' + esc(t.clearsAt) + ' UTC)')
               + '</span>')
            : (t.crosses
              ? ('<b>' + mins(t.leadMin) + '</b><br><span class="agn-enssub">at ' + esc(t.at)
                 + ' UTC · ' + fmt(t.value, v.dp) + ' ' + esc(v.unit) + '</span>')
              : ('<span class="agn-enssub">' + esc(t.why) + '</span>')));
      var lim = (!t || t.refused) ? '—'
        : (fmt(t.limit, 0) + ' ' + esc(t.unit) + ' ' + esc(t.dir)
           + '<br><span class="agn-enssub">' + esc(t.basis)
           + (t.isDefault ? ' · AGN default, not a client limit' : '') + '</span>');
      out.push('<tr><td><b>' + esc(v.label) + '</b></td>'
        + '<td class="num">' + (v.state === 'absent' ? '—'
            : fmt(v.current, v.dp) + ' ' + esc(v.unit)) + '</td>'
        + '<td>' + badge(v.state) + '<br><span class="agn-enssub">' + esc(v.why) + '</span></td>'
        + '<td class="num">' + (v.rate === null
            ? '<span class="agn-enssub">refused</span>'
            : '<b>' + signed(v.rate, v.dp, ' ' + v.unit) + '</b>') + '</td>'
        + '<td class="num">' + (v.rateForward === null
            ? '<span class="agn-enssub">refused</span>'
            : signed(v.rateForward, v.dp, ' ' + v.unit)) + '</td>'
        + '<td>' + lim + '</td><td>' + cross + '</td></tr>');
    });
    out.push('</tbody></table></div>');

    var refused = res.variables.filter(function (v) { return v.state !== 'sub-hourly'; });
    if (refused.length) {
      out.push('<div class="agn-refusal" style="margin-top:10px"><b>'
        + refused.length + ' of ' + res.variables.length
        + ' variables carry no sub-hourly information at this point</b><ul>'
        + refused.map(function (v) {
            return '<li><b>' + esc(v.label) + '</b> — ' + esc(v.why) + '</li>'; }).join('')
        + '</ul>They are shown because the values are real; their slopes and crossing times are '
        + 'not, and are withheld rather than drawn.</div>');
    }
    out.push('<div class="agn-enssub" style="margin-top:8px">Operating limits are AGN defaults '
      + 'with a stated basis. They are not this client\'s limits and no crossing time here is an '
      + 'instruction; the client asset register replaces them.</div>');
    host.innerHTML = out.join('');
  }

  function locate() {
    try {
       
      var S = (typeof G.agnSubjectPlace === 'function') ? G.agnSubjectPlace() : null;
      if (S && S.lat != null) return S;
      var L = G.AGN.flow && G.AGN.flow.location ? G.AGN.flow.location() : null;
      if (L && L.lat != null) return L;
    } catch (_) {}
    return null;
  }

  function run() {
    var st = $('nowcastState'), L = locate();
    if (!L) {
      var host = $('nowcastBody');
      if (host) host.innerHTML = '<div class="agn-refusal">No location is active. The nowcast is '
        + 'a point feed and there is nothing to run it against.</div>';
      return Promise.resolve(null);
    }
    if (st) st.textContent = 'Fetching 15-minute steps for ' + (L.name || 'the active location') + '…';
    return G.AGN.nowcast.run(L.lat, L.lon).then(function (r) {
      if (st) st.textContent = 'Active location: ' + (L.name || (L.lat + ',' + L.lon))
        + '. Operating limits are AGN defaults until a client asset register is loaded.';
      render();
      return r;
    });
  }

  function setAuto(on) {
    if (AUTO) { clearInterval(AUTO); AUTO = null; }
    if (on) AUTO = setInterval(function () { run(); }, AUTO_MS);
  }

  function init() {
    if (!$('nowcastBody')) return;
    var b = $('nowcastRun'); if (b) b.addEventListener('click', function () { run(); });
    var a = $('nowcastAuto');
    if (a) a.addEventListener('change', function () { setAuto(a.checked); if (a.checked) run(); });
    D.addEventListener('agn:location', function () {
      var st = $('nowcastState');
      if (st) st.textContent = 'Location changed — not run for this point yet.';
      render();
    });
    D.addEventListener('agn:nowcast', render);
    

    if (TICK) clearInterval(TICK);
    TICK = setInterval(render, TICK_MS);
    render();
  }
  if (D.readyState !== 'loading') init();
  else D.addEventListener('DOMContentLoaded', init);

  G.AGN.nowcastPanel = { render:render, run:run, ageNow:ageNow, setAuto:setAuto,
                         TICK_MS:TICK_MS, AUTO_MS:AUTO_MS, version:'v89.38' };
})(window);
