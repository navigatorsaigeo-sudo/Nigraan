/* == v91.17.283.20 . B5 . THE ONE PLACE SEARCH AND MY-LOCATION OF EVERY PAGE (served as /agn-place-search.js) =========================
   Owner, 25 Oct 2026: one search and one my-location control, used by the start page and the Overview top bar; the analyst's other place
   boxes (header list, place search, storyline, model lab, map box) attach to the same code. Everything a place box does lives here:
     - typed coordinates (decimal or degrees-minutes-seconds) are a point, never a search
     - suggestions while typing (2 letters or more, 180 ms after the last key): GET /api/geo/search?suggest=1, the server's rows in the
       server's order (one ranking, one dedupe: server/api/places.mjs); a later answer never replaces a newer one
     - a full search (Enter / Check): GET /api/geo/search; the server's first row is taken when the server says autoSelect
     - my location: the browser's position with high accuracy (15 s at most); a network fix of 1 km or worse is coarse and is handed to
       the page (onCoarse) instead of being used as the place
   A page mounts it on its own input and list (the markup it already has); a box with its own row look attaches with its renderer.
   API: AGNPlaceSearch.mount(o) -> { search(q), suggest(q), locate(), close(), show(html) }; AGNPlaceSearch.attach(o) -> { run(q) }
        AGNPlaceSearch.search(q, {limit, suggest}) -> the server answer; AGNPlaceSearch.locate() -> {lat, lon, accuracyM, coarse};
        AGNPlaceSearch.parseLL(q) -> {lat, lon} or null */
(function (W) {
  'use strict';
  var D = W.document;
  if (W.AGNPlaceSearch) return;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fin(x) { return x != null && x !== '' && isFinite(+x); }
  function clean(n) { return String(n == null ? '' : n).replace(/^[\s"'“”‘’`]+|[\s"'“”‘’`]+$/g, '').replace(/\s*["“”]\s*/g, ' ').replace(/\s{2,}/g, ' '); }
  function norm(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  /* typed coordinates */
  function parseDMS(q) { var s = String(q || '').trim(), re = /(\d{1,3})\s*[°º˚]\s*(?:(\d{1,2}(?:\.\d+)?)\s*['′’]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|”|'')\s*)?([NSEWnsew])?/g, m, v = [];
    while ((m = re.exec(s)) && v.length < 2) { var d = +m[1] + (m[2] ? +m[2] / 60 : 0) + (m[3] ? +m[3] / 3600 : 0); if (/[SWsw]/.test(m[4] || '')) d = -d; v.push({ d: d, h: (m[4] || '').toUpperCase() }); }
    if (v.length !== 2) return null; if (/[EW]/.test(v[0].h) && /[NS]/.test(v[1].h)) v.reverse(); return { lat: Math.round(v[0].d * 1e5) / 1e5, lon: Math.round(v[1].d * 1e5) / 1e5 }; }
  function parseLL(q) { if (/[°º˚]\s*\d+(?:\.\d+)?\s*['′’]/.test(String(q || ''))) return parseDMS(q); var s = String(q || '').trim().replace(/[°]/g, '');
    var m = /^([-+]?\d{1,3}(?:\.\d+)?)\s*([NnSs])?\s*[,;\s]\s*([-+]?\d{1,3}(?:\.\d+)?)\s*([EeWw])?$/.exec(s); if (!m) return null;
    var a = +m[1], b = +m[3]; if (/[sS]/.test(m[2] || '')) a = -a; if (/[wW]/.test(m[4] || '')) b = -b; return { lat: a, lon: b }; }
  /* the server's place search (one request per question) */
  function getJ(u, o) { return fetch(u, Object.assign({ cache: 'no-store' }, o || {})).then(function (r) { return r.ok ? r.json() : null; }); }
  function search(q, o) { o = o || {}; return getJ('/api/geo/search?q=' + encodeURIComponent(String(q == null ? '' : q).trim()) + '&limit=' + (o.limit || 8) + (o.suggest ? '&suggest=1' : ''), o.signal ? { signal: o.signal } : null); }
  function usable(r) { return r && fin(r.lat) && fin(r.lon) && r.scoreable !== false && !r.disputed && !r.outside && r.administered !== false; }
  /* my location: the browser's position, high accuracy; the reason in words when there is none */
  function locate() {
    return new Promise(function (res, rej) {
      if (!navigator.geolocation) return rej(kind(new Error('this browser does not offer location'), 'unsupported'));
      if (!W.isSecureContext) return rej(kind(new Error('the browser only shares location over https, or on localhost'), 'insecure'));
      var done = false, t = setTimeout(function () { if (done) return; done = true; rej(kind(new Error('the browser gave no position within 15 s. On Windows, check Settings › Privacy & security › Location (location services on, and allowed for the browser), or search your place by name'), 'timeout')); }, 15000);
      navigator.geolocation.getCurrentPosition(function (p) { if (done) return; done = true; clearTimeout(t);
        var la = p && p.coords ? Number(p.coords.latitude) : NaN, lo = p && p.coords ? Number(p.coords.longitude) : NaN;
        if (!isFinite(la) || !isFinite(lo)) return rej(kind(new Error('the browser returned a position with no usable coordinates'), 'unavailable'));
        if (la < -90 || la > 90 || lo < -180 || lo > 180) return rej(kind(new Error('the browser returned coordinates outside the range of the Earth (' + la + ', ' + lo + ')'), 'unavailable'));
        var acc = p.coords && isFinite(p.coords.accuracy) ? p.coords.accuracy : null, coarse = acc != null && acc >= 1000;
        res({ lat: la, lon: lo, accuracyM: acc, coarse: coarse, label: 'My location' + (acc == null ? '' : coarse ? ' (±' + (acc / 1000).toFixed(acc < 10000 ? 1 : 0) + ' km)' : ' (±' + Math.round(acc) + ' m)') }); },
      function (e) { if (done) return; done = true; clearTimeout(t);
        rej(kind(new Error((e && e.code === 1) ? 'location permission was declined for this page' : (e && e.code === 2) ? 'the browser could not determine a position' : (e && e.code === 3) ? 'the location request timed out' : (e && e.message) || 'the location request failed'),
          (e && e.code === 1) ? 'denied' : (e && e.code === 3) ? 'timeout' : 'unavailable')); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });   /* v91.17.283.37 · R4: 15 s, the same limit as the guard above */
    });
  }
  /* v91.17.283.37 · R4 · the owner's rule (30 Oct): NIGRAAN opens at the person's own location. The words of that path, one place for every
     page: the reason in one short line when there is no position, and the plain note of a coarse one (the browser's own accuracy, never
     hidden, never shown as exact; 1 km or worse is coarse, as above) */
  function kind(e, k) { e.kind = k; return e; }
  var WHY = { denied: 'Location was not shared', timeout: 'No position from the browser within 15 s', unsupported: 'This browser does not share location',
    insecure: 'Location needs a secure (https) address', unavailable: 'The browser could not find your position', outside: 'Your location is outside Pakistan' };
  function whyShort(e) { return WHY[(e && e.kind) || 'unavailable'] || WHY.unavailable; }
  function kmText(m) { var k = m / 1000; return k < 10 ? String(Math.round(k * 10) / 10) : String(Math.round(k)); }
  function accText(m) { return m == null || !isFinite(m) ? '' : m >= 1000 ? 'about ' + kmText(m) + ' km' : 'about ' + Math.max(1, Math.round(m)) + ' m'; }
  function coarseNote(m) { return 'Approximate location (' + accText(m) + ') - search your exact place for a precise reading'; }
  /* the row words */
  function nameOf(r) { var n = clean(r.name); if (r.level === 'tehsil' || r.level === 'district') return r.resolvedLabel ? clean(r.resolvedLabel) : r.level === 'tehsil' ? n + ' tehsil, ' + (r.district || r.province || '') : n + ' district, ' + (r.province || '');
    var q = String(r.district || r.province || '').replace(/ District$/, ''); return n + (q && q !== n ? ', ' + q : ''); }
  function subOf(r) { return [r.level === 'tehsil' ? 'Tehsil' : r.level === 'district' ? 'District' : (r.kind ? String(r.kind).replace(/_/g, ' ') : null), r.level === 'district' ? null : String(r.district || '').replace(/ District$/, '') || null, r.province || null, r.note || null]
    .filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' · '); }
  function hi(t, nq) { var s = String(t), n = s.toLowerCase(), i = nq ? n.indexOf(nq) : -1; return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<b>' + esc(s.slice(i, i + nq.length)) + '</b>' + esc(s.slice(i + nq.length)); }
  function place(r) { return { lat: +r.lat, lon: +r.lon, id: r.id || null, name: nameOf(r), src: 'search', tehsilHit: r.level === 'tehsil', row: r }; }

  /* attach: a box with its own row look (render(rows, q)) gets the typing, the debounce, the order of answers and the server search */
  function attach(o) {
    var inp = o.input, seq = 0, tmr = null;   /* no input: the box calls run(q) itself */
    function run(q) { var my = ++seq; return search(q, { limit: o.limit || 8, suggest: !!o.suggest }).then(function (j) { if (my !== seq) return; var R = ((j && j.results) || []).filter(o.keepDisputed ? function (r) { return r && fin(r.lat); } : usable);
        if (o.render) o.render(o.hit ? R.map(o.hit) : R, q, j); }, function () { if (my === seq && o.fail) o.fail(q); }); }
    if (inp) inp.addEventListener('input', function () { var q = inp.value.trim(); clearTimeout(tmr); if (q.length < 2 || (!o.coords && parseLL(q))) { seq++; if (o.clear) o.clear(q); return; } tmr = setTimeout(function () { run(q); }, o.delay || 220); });
    return { run: run, cancel: function () { seq++; clearTimeout(tmr); } };
  }

  /* mount: the full control (the start page's look: suggestions, Check, typed coordinates, my location) on a page's form */
  function mount(o) {
    var inp = o.input, list = o.list, box = o.box || null, say = o.say || function () {}, AC = { t: 0, seq: 0, i: -1, rows: [], ctl: null }, SRES = [];
    /* v91.17.283.37 · B4 · "Use my location" race (live check 30 Oct): a browser position that arrives AFTER the user searched or picked another
       place must not replace it. Each location request has its number; any other pick (a row, typed coordinates, a search, or the page's own
       map click through cancelLocation) cancels the pending one, and its late answer is dropped. */
    var LOC = { seq: 0, pending: false, cancelled: 0 };
    function cancelLoc() { if (!LOC.pending) return false; LOC.seq++; LOC.pending = false; LOC.cancelled++; if (o.locBtn) o.locBtn.disabled = false; return true; }
    if (!inp || !list) return null;
    var inBox = function (la, lo) { return !box || (la >= box.s && la <= box.n && lo >= box.w && lo <= box.e); };
    function show(html) { list.innerHTML = html; list.hidden = !html; }
    function acClose() { AC.i = -1; AC.rows = []; inp.removeAttribute('aria-activedescendant'); inp.setAttribute('aria-expanded', 'false'); }
    function close() { clearTimeout(AC.t); AC.seq++; if (AC.ctl) try { AC.ctl.abort(); } catch (_) {} show(''); acClose(); }
    function pickRow(r) { cancelLoc(); var p = place(r); inp.value = p.name; say(''); o.onPick(p); }
    function acMark(i) { var b = Array.prototype.slice.call(list.querySelectorAll('button[data-ac]')); if (!b.length) { AC.i = -1; return; } AC.i = (i + b.length) % b.length;
      b.forEach(function (x, k) { x.setAttribute('aria-selected', String(k === AC.i)); x.classList.toggle('on', k === AC.i); }); inp.setAttribute('aria-activedescendant', b[AC.i].id);
      var el = b[AC.i]; if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop; else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight; }
    function acPick(k) { var r = AC.rows[k]; if (!r) return false; close(); pickRow(r); return true; }
    function suggest(q) { var seq = ++AC.seq, nq = norm(q); if (nq.length < 2 || parseLL(q) || /^[-+\d\s.,°'"NSEWnsew]+$/.test(q)) { show(''); acClose(); return AC; }
      if (AC.ctl) try { AC.ctl.abort(); } catch (_) {} AC.ctl = W.AbortController ? new AbortController() : null;
      search(q, { limit: 8, suggest: true, signal: AC.ctl ? AC.ctl.signal : null }).then(function (j) { return ((j && j.results) || []).filter(usable); }, function () { return []; }).then(function (R) { if (seq !== AC.seq) return;
        var rows = R.slice(0, 8).map(function (r) { return Object.assign({}, r, { name: clean(r.name) }); }); AC.rows = rows; AC.i = -1;
        if (!rows.length) { show('<div class="msg">No place begins with “' + esc(q) + '”. Press ' + (o.checkWord || 'Check') + ' to search all spellings.</div>'); acClose(); return; }
        show('<div class="achd">Suggestions</div>' + rows.map(function (r, k) { return '<button type="button" role="option" id="' + (o.idPrefix || 'ac') + k + '" data-ac="' + k + '" aria-selected="false">' + hi(r.name, nq) + '<small>' + esc(subOf(r)) + '</small></button>'; }).join(''));
        inp.setAttribute('aria-expanded', 'true'); }); return AC; }
    function full(q) { q = String(q || '').trim(); close(); if (q) { cancelLoc(); say(''); } if (!q) return;
      var ll = parseLL(q);
      if (ll) { if (!isFinite(ll.lat) || !isFinite(ll.lon) || Math.abs(ll.lat) > 90 || Math.abs(ll.lon) > 180) { show('<div class="msg bad">That is not a valid coordinate. Type it as lat, lon, for example 31.52, 74.36.</div>'); return; }
        if (!inBox(ll.lat, ll.lon)) { var sw = inBox(ll.lon, ll.lat) ? ' Did you mean ' + ll.lon + ', ' + ll.lat + ' (lat first)?' : '';
          show('<div class="msg bad" id="outsideMsg">' + esc(ll.lat + ', ' + ll.lon) + ' is outside Pakistan. NIGRAAN covers points inside Pakistan only.' + esc(sw) + '</div>'); return; }
        o.onPick({ lat: ll.lat, lon: ll.lon, name: null, src: 'coords' }); return; }
      show('<div class="msg">Searching…</div>');
      search(q, { limit: 8 }).then(function (j) {
        var R = ((j && j.results) || []).filter(usable); SRES = R;
        if (!R.length) { show('<div class="msg bad">No place in Pakistan matches "' + esc(q) + '". Try a town, a tehsil, or type lat, lon.</div>'); return; }
        if (j.autoSelect && j.results && R[0] === j.results[0]) { show(''); pickRow(R[0]);   /* v91.17.283.24 W21: the server's own first row only (a row this page filtered out is never replaced by the next one) */ var sb = subOf(R[0]); if (sb) say('Showing ' + nameOf(R[0]) + ' (' + sb + '). Not the place you meant? Add the district or province to the search.'); return; }
        var exact = !!(R[0] && R[0].score >= 3), note = exact ? '' : '<div class="msg near">No place is named exactly “' + esc(q) + '”. The closest names in Pakistan:</div>';
        show(note + R.map(function (r, i) { return '<button type="button" role="option" data-i="' + i + '">' + esc(nameOf(r)) + '<small>' + esc(subOf(r)) + '</small></button>'; }).join(''));
      }).catch(function () { show('<div class="msg bad">The place search did not answer. Try again, or type lat, lon.</div>'); }); }
    /* v91.17.283.37 · R4 · auto (opts.auto): the page's own request on open. Its failure is one short line (o.onAutoFail(why), else say);
       a coarse position is opened like a fine one, with coarse:true and the browser's accuracy, and the page says it is approximate */
    function myLocation(opts) { var auto = !!(opts && opts.auto), my = ++LOC.seq; LOC.pending = true; LOC.auto = auto; say(auto ? 'Finding your location…' : 'Asking this browser for its location…'); if (o.locBtn && !auto) o.locBtn.disabled = true;   /* the page's own request on open leaves "Use my location" usable (a click takes over) */
      return locate().then(function (p) { if (my !== LOC.seq) return; LOC.pending = false; say(''); if (!inBox(p.lat, p.lon)) { if (auto && o.onAutoFail) { o.onAutoFail(WHY.outside, p); return; } say('Your location (' + (Math.round(p.lat * 10) / 10) + ', ' + (Math.round(p.lon * 10) / 10) + ') is outside Pakistan. NIGRAAN covers points inside Pakistan only.'); return; }
          if (p.coarse && o.onCoarse && !auto) { o.onCoarse(p); return; }
          o.onPick({ lat: p.lat, lon: p.lon, name: null, src: 'gps', accuracyM: p.accuracyM, coarse: !!p.coarse, auto: auto, label: p.label }); },
        function (e) { if (my !== LOC.seq) return; LOC.pending = false; if (auto) { if (o.onAutoFail) o.onAutoFail(whyShort(e), e); else say(whyShort(e)); return; } say('Location: ' + ((e && e.message) || 'not shared') + '. Search a place or click the map instead.'); })
        .then(function () { if (my === LOC.seq && o.locBtn) o.locBtn.disabled = false; }); }
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); if (list.id) inp.setAttribute('aria-controls', list.id); inp.setAttribute('aria-expanded', 'false');
    inp.addEventListener('input', function () { var q = inp.value; clearTimeout(AC.t); AC.t = setTimeout(function () { suggest(q.trim()); }, 180); });
    inp.addEventListener('keydown', function (e) { var open = !list.hidden && AC.rows.length;
      if (e.key === 'ArrowDown') { if (open) { e.preventDefault(); acMark(AC.i + 1); } }
      else if (e.key === 'ArrowUp') { if (open) { e.preventDefault(); acMark(AC.i < 0 ? -1 : AC.i - 1); } }
      else if (e.key === 'Enter') { if (open && AC.i >= 0) { e.preventDefault(); acPick(AC.i); } else if (!o.form) { e.preventDefault(); full(inp.value); } else { clearTimeout(AC.t); AC.seq++; acClose(); } }
      else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); show(''); acClose(); } } });
    if (o.form) o.form.addEventListener('submit', function (e) { e.preventDefault(); if (AC.i >= 0 && !list.hidden && acPick(AC.i)) return; full(inp.value); });
    list.addEventListener('click', function (e) { var a = e.target.closest('button[data-ac]'); if (a) { acPick(+a.getAttribute('data-ac')); return; } var b = e.target.closest('button[data-i]'); if (b) { var r = SRES[+b.getAttribute('data-i')]; if (r) { show(''); pickRow(r); } } });
    D.addEventListener('click', function (e) { if (!(o.form || inp.parentNode).contains(e.target) && !list.contains(e.target)) show(''); });
    if (o.locBtn) o.locBtn.addEventListener('click', function (e) { e.preventDefault(); myLocation(); });
    return { search: full, suggest: suggest, locate: myLocation, close: close, show: show, state: AC, cancelLocation: cancelLoc, loc: LOC };
  }
  W.AGNPlaceSearch = { version: 'place-search-1 (v91.17.283.37)', mount: mount, attach: attach, search: search, locate: locate, parseLL: parseLL, nameOf: nameOf, subOf: subOf, usable: usable,
    whyShort: whyShort, accText: accText, coarseNote: coarseNote };
})(window);
