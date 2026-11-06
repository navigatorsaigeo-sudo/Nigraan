/* v91.17.283.10 . agents 6 and 7 on the operator Health page: the card "Experiments and weekly proposals" inside the operator-only
   "Health and skill" section (Evidence & Methods). Served from this origin as /agn-ops-exp.js (the page's CSP allows script-src 'self'
   and seals its own inline scripts; the page file is unchanged). It reads GET /api/ops/experiments only in operator mode (a customer
   view makes no request) and offers Approve / Revert, which ask for the typed experiment id (or target) and POST to the loopback-only
   routes. Every number shown comes from the agents' files. */
(function (G) {
  'use strict';
  var D = G.document, S = { data: null, busy: false };
  function op() { try { return D.documentElement.classList.contains('agn-operator') && G.AGN && typeof G.AGN.operator === 'function' && G.AGN.operator(); } catch (_) { return false; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pkt(iso) { var t = Date.parse(iso || ''); return isFinite(t) ? new Date(t + 18e6).toISOString().slice(0, 16).replace('T', ' ') + ' PKT' : '–'; }
  function ci(c) { return c && c.length === 2 ? ' <span class="ci">[' + esc(c[0]) + ', ' + esc(c[1]) + ']</span>' : ''; }
  function card() {
    var sec = D.getElementById('agnHealthSkill'); if (!sec) return null; var c = D.getElementById('agnHsExp'); if (c) return c;
    c = D.createElement('div'); c.className = 'agn-hs-card'; c.id = 'agnHsExpCard';
    c.innerHTML = '<h3>Experiments and weekly proposals (operator only; nothing is served until the owner approves)</h3><div id="agnHsExp" class="agn-hs-body" style="max-height:680px">Loading…</div>';
    var grids = sec.querySelectorAll(':scope > .agn-hs-grid2'); var last = grids.length ? grids[grids.length - 1] : null;
    if (last) sec.insertBefore(c, last); else sec.appendChild(c);
    return D.getElementById('agnHsExp');
  }
  function paint() {
    var el = card(); if (!el || !S.data) return; var d = S.data, W = d.week, h = '';
    h += '<p class="agn-hs-muted">' + esc(d.rule) + '. Weekly run Sunday 03:00 PKT (' + esc(d.budgetMin) + ' min budget); report Monday 08:00 PKT. <a href="/api/ops/experiments/page" target="_blank" rel="noopener">Open the weekly proposals page</a>.</p>';
    if (!W) h += '<p class="agn-hs-muted">No experimentation run yet: ' + esc(d.due && d.due.experiments && d.due.experiments.why) + '.</p>';
    else {
      h += '<p>Week of ' + esc(W.week) + ' · ' + esc(W.usedMin) + ' of ' + esc(W.budgetMin) + ' min used · read ' + esc(pkt(W.at)) + '</p>';
      h += '<table><thead><tr><th>Experiment</th><th>Status</th><th>Result (95 % intervals)</th><th>Compute</th></tr></thead><tbody>' + W.results.map(function (x) {
        var res = x.status === 'done' ? '<b>' + (x.promote ? 'PROMOTE (owner approval needed)' : 'Not promoted') + '</b>' + (x.mode === 'recorded' ? ' · <span class="agn-hs-muted">rule applied to the recorded output ' + esc(x.recordedFrom) + '</span>' : '') + '<br>' + (x.headline || []).slice(0, 5).map(function (k) { return esc(k.label) + ': ' + esc(k.value == null ? '' : k.value) + ci(k.ci); }).join('<br>') + (x.reasons && x.reasons.length ? '<br><span class="agn-hs-muted">' + esc(x.reasons.join(' | ')) + '</span>' : '') : '<span class="agn-hs-muted">' + esc(x.why || '') + '</span>';
        var cost = x.cost && x.cost.lastWallMin != null ? esc(x.cost.lastWallMin) + ' min · ' + esc(x.cost.lastPeakMb) + ' MB' : (x.cost && x.cost.estimateMin ? '~' + esc(x.cost.estimateMin) + ' min expected' : '–');
        return '<tr><td><b>' + esc(x.id) + '</b><br><span class="agn-hs-muted">' + esc(x.title) + '</span></td><td>' + esc(x.status) + '</td><td>' + res + '</td><td class="num">' + cost + '</td></tr>'; }).join('') + '</tbody></table>';
      if (W.queue && W.queue.length) h += '<p class="agn-hs-muted">Queued: ' + W.queue.map(function (q) { return esc(q.id) + ' (' + esc(q.why) + ')'; }).join('; ') + '.</p>';
    }
    h += '<h4>Ready for approval</h4>' + (d.ready && d.ready.length ? '<ul>' + d.ready.map(function (p) { return '<li><b>' + esc(p.id) + '</b> · ' + esc(p.title) + ' · changes ' + esc(p.pointer.file) + ' (from ' + esc(p.pointer.fromVersion) + ') <button type="button" data-exp-approve="' + esc(p.record) + '" data-exp-id="' + esc(p.id) + '">Approve…</button></li>'; }).join('') + '</ul>' : '<p class="agn-hs-muted">None. Nothing served changes.</p>');
    var T = d.targets || {}; h += '<h4>Data pointers</h4><table><thead><tr><th>Target</th><th>Holds</th><th>Previous</th><th></th></tr></thead><tbody>' + Object.keys(T).map(function (k) { var s = T[k] || {}; return '<tr><td>' + esc(k) + '</td><td>' + esc(s.version || s.file) + '</td><td>' + esc(s.previous ? (s.previous.version || s.previous.file) : '–') + '</td><td>' + (s.previous || (k === 'fx-model-served' && s.served) ? '<button type="button" data-exp-revert="' + esc(k) + '">Revert…</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>';
    var P = d.proposals && d.proposals.report; if (P) h += '<p class="agn-hs-muted">Last weekly report ' + esc(P.day) + ': ' + P.found.incidents.length + ' feed incident(s), ' + (P.found.drift ? P.found.drift.flags.length : 0) + ' drift flag(s), ' + P.found.diagnoses.length + ' diagnosis item(s), ' + P.ready.length + ' ready, ' + P.owner.length + ' owner item(s). File: _admin\\proposals_' + esc(P.day) + '.md</p>';
    if (d.approvals && d.approvals.length) h += '<h4>Approvals log</h4><ul>' + d.approvals.slice(0, 8).map(function (a) { return '<li>' + esc(pkt(a.at)) + ' · ' + esc(a.action) + ' ' + esc(a.id || a.target || '') + ': <b>' + esc(a.result) + '</b>' + (a.why ? ' (' + esc(a.why) + ')' : '') + '</li>'; }).join('') + '</ul>';
    el.innerHTML = h;
  }
  function load() { if (!op() || S.busy || !D.getElementById('agnHealthSkill')) return; S.busy = true; card();
    fetch('/api/ops/experiments', { cache: 'no-store', headers: { 'x-agn-view': 'operator' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { S.busy = false; if (j) { S.data = j; paint(); } else { var e = card(); if (e) e.textContent = 'The server did not answer (operator scope needed).'; } }).catch(function () { S.busy = false; }); }
  function post(path, body) { return fetch(path, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-agn-view': 'operator' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return { ok: false, why: 'HTTP ' + r.status }; }); }); }
  D.addEventListener('click', function (e) { var t = e.target && e.target.closest ? e.target : null; if (!t || !op()) return;
    var a = t.closest('[data-exp-approve]'); if (a) { var id = a.getAttribute('data-exp-id'); var c = G.prompt('Approving changes a served data pointer (the previous one is kept and can be reverted). Type the experiment id to confirm:\n' + id, ''); if (c == null) return;
      post('/api/ops/experiments/approve', { record: a.getAttribute('data-exp-approve'), confirm: c }).then(function (r) { G.alert(r.ok ? 'Approved: ' + r.target + ' now ' + ((r.to && (r.to.version || r.to.file)) || '') : 'Refused: ' + (r.why || r.error)); load(); }); return; }
    var v = t.closest('[data-exp-revert]'); if (v) { var k = v.getAttribute('data-exp-revert'); var c2 = G.prompt('Revert ' + k + ' to its previous pointer. Type the target name to confirm:\n' + k, ''); if (c2 == null) return;
      post('/api/ops/experiments/revert', { target: k, confirm: c2 }).then(function (r) { G.alert(r.ok ? 'Reverted: ' + r.target : 'Refused: ' + (r.why || r.error)); load(); }); return; }
    if (t.closest('[data-goto="modelab"],#machNav .agn-v91-tech')) setTimeout(load, 400); }, false);
  D.addEventListener('agn:view', function (e) { if (e && e.detail && e.detail.view === 'modelab') load(); });
  D.addEventListener('agn:operator', function (e) { if (e && e.detail && e.detail.operator) setTimeout(load, 700); });
  setInterval(function () { var s = D.getElementById('agnHealthSkill'); if (op() && s && s.offsetParent) load(); }, 300000);
  G.AGN = G.AGN || {}; G.AGN.experiments = { load: load, state: function () { return S.data; } };
})(window);
