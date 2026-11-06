


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  var C = {
    navy: '#0C3851', sea: '#14B8A6', ink: '#1c2b36', line: '#e4e9ed',
    grid: '#eef2f5', mute: '#71808a', warn: '#DA750F', bad: '#B3261E',
    sev: ['#2c7fb8', '#41ab5d', '#fecc5c', '#fd8d3c', '#e31a1c']
  };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(v) { return (v === null || v === undefined || v === '' ||
                            (typeof v === 'number' && !isFinite(v))) ? null : Number(v); }
  function sevColour(v) {
    if (v == null) return C.line;
    return C.sev[Math.max(0, Math.min(4, Math.floor(v / 20.0000001)))];
  }
  

  function _agnWhyClip(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (s.length <= n) return s;
    var cut = s.slice(0, n - 1);
    var sp = cut.lastIndexOf(' ');
    if (sp > n * 0.55) cut = cut.slice(0, sp);
    return cut.replace(/[\s,.;:\u2014-]+$/, '') + '\u2026';
  }
  function _agnWhyCaption(items) {
    var bad = (items || []).filter(function (x) { return x && x.value == null; });
    if (!bad.length) return '';
    return ' Not scored — ' + bad.map(function (x) {
      return (x.label || 'row') + ': ' + String(x.why || 'no input').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
    }).join('; ') + '.';
  }
  function wrap(w, h, title, desc, body, cls) {
    return '<figure class="agn-fig' + (cls ? ' ' + cls : '') + '">'
      + '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" width="100%" '
      + 'preserveAspectRatio="xMidYMid meet" aria-label="' + esc(title) + '">'
      + '<title>' + esc(title) + '</title><desc>' + esc(desc) + '</desc>'
      + body + '</svg>'
      + '<figcaption>' + esc(title) + ' — ' + esc(desc) + '</figcaption></figure>';
  }

  

  function bars(items, opts) {
    opts = opts || {};
    items = items || [];
    if (!items.length) return empty('No hazard was scored.');
    var W = 640, rowH = 30, padL = 150, padR = 60, top = 8;
    var H = top + items.length * rowH + 8;
    var max = opts.max || 100, plot = W - padL - padR, out = [];
    
    for (var g = 0; g <= max; g += max / 5) {
      var gx = padL + plot * (g / max);
      out.push('<line x1="' + gx + '" y1="' + top + '" x2="' + gx + '" y2="' + (H - 8)
        + '" stroke="' + C.grid + '" stroke-width="1"/>');
      out.push('<text x="' + gx + '" y="' + (H - 0) + '" font-size="9" fill="' + C.mute
        + '" text-anchor="middle">' + g + '</text>');
    }
    

    var _gapId = 'agnGap-' + (bars._n = (bars._n || 0) + 1);
    out.push('<pattern id="' + _gapId + '" width="6" height="6" patternUnits="userSpaceOnUse" '
      + 'patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="'
      + C.line + '" stroke-width="3"/></pattern>');
    items.forEach(function (it, i) {
      var y = top + i * rowH, v = num(it.value);
      out.push('<text x="' + (padL - 8) + '" y="' + (y + 15) + '" font-size="11" fill="' + C.ink
        + '" text-anchor="end">' + esc(it.label) + '</text>');
      if (v === null) {
        

        out.push('<rect x="' + padL + '" y="' + (y + 5) + '" width="' + plot + '" height="16" '
          + 'fill="url(#' + _gapId + ')" stroke="' + C.line + '"/>');
        out.push('<text x="' + (padL + 6) + '" y="' + (y + 17) + '" font-size="9.5" fill="' + C.bad
          + '">'
          + '<title>' + esc(it.why || 'no input') + '</title>'
          + 'not scored — ' + esc(_agnWhyClip(it.why || 'no input', 58)) + '</text>');
      } else {
        var w = Math.max(1, plot * (Math.min(v, max) / max));
        out.push('<rect x="' + padL + '" y="' + (y + 5) + '" width="' + w + '" height="16" rx="2" fill="'
          + sevColour(v) + '"/>');
        out.push('<text x="' + (padL + w + 6) + '" y="' + (y + 17) + '" font-size="11" font-weight="700" fill="'
          + C.ink + '">' + Math.round(v) + '</text>');
      }
    });
    var scored = items.filter(function (x) { return num(x.value) !== null; });
    return wrap(W, H + 6, opts.title || 'Hazard screening',
      scored.length + ' of ' + items.length + ' scored; '
      + (items.length - scored.length) + ' not scored and shown as gaps.'
      + _agnWhyCaption(items),
      out.join(''));
  }

  

  function series(items, opts) {
    opts = opts || {};
    items = items || [];
    if (!items.length) return empty('Nothing to plot.');
    if (opts.diverging) return seriesDiv84(items, opts);
    var W = 640, rowH = 30, padL = 118, padR = 132, top = 8;
    var H = top + items.length * rowH + 18;
    var vals = items.map(function (x) { return num(x.value); })
                    .filter(function (v) { return v !== null; });
    if (!vals.length) {
      

      vals = [1];
    }
    var max = (opts.max != null && isFinite(opts.max))
      ? opts.max : Math.max.apply(null, vals);
    if (!(max > 0)) max = 1;
    var plot = W - padL - padR, out = [], unit = opts.unit || '';
    var col = opts.colour || C.navy;
    var dec = (opts.decimals != null) ? opts.decimals : (max < 20 ? 1 : 0);
    for (var g = 0; g <= 4; g++) {
      var gv = max * g / 4, gx = padL + plot * (g / 4);
      out.push('<line x1="' + gx + '" y1="' + top + '" x2="' + gx + '" y2="' + (H - 18)
        + '" stroke="' + C.grid + '" stroke-width="1"/>');
      out.push('<text x="' + gx + '" y="' + (H - 5) + '" font-size="9" fill="' + C.mute
        + '" text-anchor="middle">' + gv.toFixed(dec) + '</text>');
    }
    out.push('<pattern id="agnGap2" width="6" height="6" patternUnits="userSpaceOnUse" '
      + 'patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="'
      + C.line + '" stroke-width="3"/></pattern>');
    items.forEach(function (it, i) {
      var y = top + i * rowH, v = num(it.value);
      out.push('<text x="' + (padL - 8) + '" y="' + (y + 15) + '" font-size="10.5" fill="' + C.ink
        + '" text-anchor="end">' + esc(it.label) + '</text>');
      if (v === null) {
        out.push('<rect x="' + padL + '" y="' + (y + 5) + '" width="' + plot + '" height="15" '
          + 'fill="url(#agnGap2)" stroke="' + C.line + '"/>');
        out.push('<text x="' + (padL + 6) + '" y="' + (y + 16) + '" font-size="9" fill="' + C.bad
          + '">'
          + '<title>' + esc(it.why || 'not returned') + '</title>'
          + 'no value — ' + esc(_agnWhyClip(it.why || 'not returned', 52)) + '</text>');
      } else {
        var w = Math.max(1.5, plot * (Math.min(v, max) / max));
        out.push('<rect x="' + padL + '" y="' + (y + 5) + '" width="' + w + '" height="15" rx="2" fill="'
          + col + '" opacity="0.88"/>');
        out.push('<text x="' + (padL + plot + 6) + '" y="' + (y + 16) + '" font-size="10" '
          + 'font-weight="700" fill="' + C.ink + '">' + v.toFixed(dec) + esc(unit) + '</text>');
        if (it.note)
          out.push('<text x="' + (padL + Math.min(w + 6, plot - 4)) + '" y="' + (y + 16)
            + '" font-size="8.5" fill="' + C.mute + '">' + esc(String(it.note).slice(0, 40)) + '</text>');
      }
    });
    var got = items.filter(function (x) { return num(x.value) !== null; }).length;
    return wrap(W, H, opts.title || 'Series',
      got + ' of ' + items.length + ' values present'
      + (got < items.length ? '; the rest are drawn as labelled gaps' : '')
      + (unit ? ' · ' + unit.trim() : ''),
      out.join(''));
  }

   
  function seriesDiv84(items, opts) {
    var W = 640, rowH = 34, padL = 96, padR = 150, top = 8, H = top + items.length * rowH + 18;
    var vals = items.map(function (x) { return num(x.value); }).filter(function (v) { return v !== null; });
    var max = Math.max.apply(null, vals.map(Math.abs).concat([0.5])); max = Math.ceil(max * 2) / 2;
    var plot = W - padL - padR, mid = padL + plot / 2, out = [], unit = opts.unit || '', dec = opts.decimals != null ? opts.decimals : 1;
    [-1, -0.5, 0, 0.5, 1].forEach(function (g) { var gx = mid + g * plot / 2;
      out.push('<line x1="' + gx + '" y1="' + top + '" x2="' + gx + '" y2="' + (H - 18) + '" stroke="' + (g === 0 ? C.ink : C.grid) + '" stroke-width="' + (g === 0 ? 1.2 : 1) + '"/>');
      out.push('<text x="' + gx + '" y="' + (H - 5) + '" font-size="9" fill="' + C.mute + '" text-anchor="middle">' + (g > 0 ? '+' : '') + (g * max).toFixed(dec) + '</text>'); });
    out.push('<pattern id="agnGap3" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="' + C.line + '" stroke-width="3"/></pattern>');
    items.forEach(function (it, i) {
      var y = top + i * rowH, v = num(it.value);
      out.push('<text x="' + (padL - 8) + '" y="' + (y + 16) + '" font-size="10.5" fill="' + C.ink + '" text-anchor="end">' + esc(it.label) + '</text>');
      if (v === null) {
        out.push('<rect x="' + padL + '" y="' + (y + 5) + '" width="' + plot + '" height="16" fill="url(#agnGap3)" stroke="' + C.line + '"/>');
        out.push('<text x="' + (padL + 6) + '" y="' + (y + 17) + '" font-size="9" fill="' + C.mute + '"><title>' + esc(it.why || '') + '</title>' + esc(_agnWhyClip(it.why || 'no value', 70)) + '</text>');
        return; }
      var w = Math.max(1.5, (plot / 2) * Math.min(Math.abs(v), max) / max), x = v >= 0 ? mid : mid - w;
      out.push('<rect x="' + x + '" y="' + (y + 5) + '" width="' + w + '" height="16" rx="2" fill="' + (v >= 0 ? (opts.colour || C.navy) : (opts.colourNeg || '#2c7fb8')) + '" opacity="0.9"/>');
      out.push('<text x="' + (padL + plot + 8) + '" y="' + (y + 14) + '" font-size="11" font-weight="700" fill="' + C.ink + '">' + (v > 0 ? '+' : '') + v.toFixed(dec) + esc(unit) + '</text>');
      if (it.note) out.push('<text x="' + (padL + plot + 8) + '" y="' + (y + 27) + '" font-size="8.5" fill="' + C.mute + '">' + esc(String(it.note).slice(0, 34)) + '</text>');
    });
    var got = vals.length;
    return wrap(W, H, opts.title || 'Departure', got + ' of ' + items.length + ' months have a value · right of the line = above normal, left = below' + (unit ? ' · ' + unit.trim() : ''), out.join(''));
  }

   
  function histogram(counts, opts) {
    opts = opts || {};
    counts = Array.prototype.slice.call(counts || []);
    if (!counts.length) return empty('No distribution to draw.');
    var W = 640, H = 200, padL = 40, padB = 26, padT = 12, padR = 10;
    var n = counts.length, max = Math.max.apply(null, counts) || 1;
    var plotW = W - padL - padR, plotH = H - padB - padT, bw = plotW / n, out = [];
    out.push('<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="'
      + (H - padB) + '" stroke="' + C.line + '"/>');
    counts.forEach(function (c, i) {
      var h = plotH * (c / max);
      out.push('<rect x="' + (padL + i * bw) + '" y="' + (H - padB - h) + '" width="'
        + Math.max(1, bw - 1) + '" height="' + h + '" fill="' + sevColour((i + 0.5) / n * 100) + '"/>');
    });
    [0, 25, 50, 75, 100].forEach(function (p) {
      var x = padL + plotW * (p / 100);
      out.push('<text x="' + x + '" y="' + (H - 8) + '" font-size="9" fill="' + C.mute
        + '" text-anchor="middle">' + p + '</text>');
    });
     
    if (opts.ceilingMass != null && opts.ceilingMass > 0) {
      var cx = padL + plotW * 0.9995;
      out.push('<line x1="' + cx + '" y1="' + padT + '" x2="' + cx + '" y2="' + (H - padB)
        + '" stroke="' + C.bad + '" stroke-dasharray="3 2"/>');
      out.push('<text x="' + (cx - 4) + '" y="' + (padT + 10) + '" font-size="9.5" fill="' + C.bad
        + '" text-anchor="end">' + (100 * opts.ceilingMass).toFixed(1) + '% at the ceiling</text>');
    }
    var marks = opts.marks || [];
    marks.forEach(function (m) {
      if (m.value == null) return;
      var x = padL + plotW * (m.value / 100);
      out.push('<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (H - padB)
        + '" stroke="' + C.navy + '" stroke-width="1.2"/>');
      out.push('<text x="' + (x + 3) + '" y="' + (padT + 10) + '" font-size="9.5" fill="' + C.navy
        + '">' + esc(m.label) + '</text>');
    });
    return wrap(W, H, opts.title || 'Combined severity, simulated',
      opts.desc || (n + ' bins over ' + (opts.N ? opts.N.toLocaleString() + ' trials' : 'the trials')),
      out.join(''));
  }

   
  function heat(grid, n, opts) {
    opts = opts || {};
    grid = Array.prototype.slice.call(grid || []);
    if (!grid.length || !n) return empty('A joint grid needs a compound pair.');
    var W = 300, H = 240, pad = 34, out = [];
    var max = Math.max.apply(null, grid) || 1, r0 = n, r1 = -1, c0 = n, c1 = -1, rr, cc;
    for (rr = 0; rr < n; rr++) for (cc = 0; cc < n; cc++) if (grid[rr * n + cc] > 0) { r0 = Math.min(r0, rr); r1 = Math.max(r1, rr); c0 = Math.min(c0, cc); c1 = Math.max(c1, cc); }
    if (r1 < 0) { r0 = 0; r1 = n - 1; c0 = 0; c1 = n - 1; }
    var grow = function (a, b) { a = Math.max(0, a - 1); b = Math.min(n - 1, b + 1); while (b - a + 1 < Math.min(6, n)) { if (a > 0) a--; if (b - a + 1 < Math.min(6, n) && b < n - 1) b++; } return [a, b]; };
    var gr = grow(r0, r1), gc = grow(c0, c1); r0 = gr[0]; r1 = gr[1]; c0 = gc[0]; c1 = gc[1];
    var nc = c1 - c0 + 1, nr = r1 - r0 + 1, cw = (W - pad - 8) / nc, ch = (H - pad - 8) / nr, bw = 100 / n;
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
      var v = grid[r * n + c], t = v / max;
      out.push('<rect x="' + (pad + (c - c0) * cw).toFixed(1) + '" y="' + (H - pad - (r - r0 + 1) * ch).toFixed(1) + '" width="'
        + cw.toFixed(1) + '" height="' + ch.toFixed(1) + '" fill="' + C.sea + '" fill-opacity="'
        + (t === 0 ? 0.04 : 0.12 + 0.88 * Math.pow(t, 0.55)).toFixed(3) + '"/>');
    }
     
    out.push('<text x="' + pad + '" y="' + (H - pad + 11) + '" font-size="8.5" fill="' + C.mute + '">' + Math.round(c0 * bw) + '</text>');
    out.push('<text x="' + (W - 8) + '" y="' + (H - pad + 11) + '" font-size="8.5" fill="' + C.mute + '" text-anchor="end">' + Math.round((c1 + 1) * bw) + '</text>');
    out.push('<text x="' + (pad - 3) + '" y="' + (H - pad) + '" font-size="8.5" fill="' + C.mute + '" text-anchor="end">' + Math.round(r0 * bw) + '</text>');
    out.push('<text x="' + (pad - 3) + '" y="14" font-size="8.5" fill="' + C.mute + '" text-anchor="end">' + Math.round((r1 + 1) * bw) + '</text>');
    out.push('<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - 8) + '" y2="' + (H - pad)
      + '" stroke="' + C.line + '"/>');
    out.push('<line x1="' + pad + '" y1="8" x2="' + pad + '" y2="' + (H - pad) + '" stroke="' + C.line + '"/>');
    out.push('<text x="' + (pad + (W - pad - 8) / 2) + '" y="' + (H - 8) + '" font-size="9.5" fill="'
      + C.mute + '" text-anchor="middle">' + esc(opts.xLabel || 'leg A') + '</text>');
    out.push('<text x="12" y="' + (H - pad) / 2 + '" font-size="9.5" fill="' + C.mute
      + '" transform="rotate(-90 12 ' + (H - pad) / 2 + ')" text-anchor="middle">'
      + esc(opts.yLabel || 'leg B') + '</text>');
    return wrap(W, H, opts.title || 'Joint distribution',
      (opts.desc || (n + '×' + n + ' cells; density where the two legs co-occur')) + ' (zoomed to where the trials fell; axis ends give the index range)',
      out.join(''));
  }

   
  function coverage(live, estimated, absent, opts) {
    opts = opts || {};
    var total = (live || 0) + (estimated || 0) + (absent || 0);
    if (!total) return empty('No coverage to report.');
    var W = 640, H = 64, barY = 14, barH = 22, out = [];
    var segs = [[live, C.sea, 'live'], [estimated, C.warn, 'estimated'], [absent, C.line, 'unavailable']];
    var x = 0;
    segs.forEach(function (s) {
      if (!s[0]) return;
      var w = (W) * (s[0] / total);
      out.push('<rect x="' + x + '" y="' + barY + '" width="' + w + '" height="' + barH + '" fill="' + s[1] + '"/>');
      if (w > 46) out.push('<text x="' + (x + 6) + '" y="' + (barY + 15) + '" font-size="10.5" '
        + 'font-weight="700" fill="' + (s[1] === C.line ? C.ink : '#fff') + '">' + s[0] + '</text>');
      x += w;
    });
    var legend = segs.filter(function (s) { return s[0]; }).map(function (s, i) {
      return '<rect x="' + (i * 150) + '" y="' + (barY + barH + 10) + '" width="9" height="9" fill="' + s[1] + '"/>'
        + '<text x="' + (i * 150 + 14) + '" y="' + (barY + barH + 19) + '" font-size="10" fill="' + C.mute + '">'
        + esc(s[2]) + ' ' + s[0] + '</text>'; }).join('');
    return wrap(W, H, opts.title || 'Data coverage',
      live + ' live, ' + estimated + ' estimated, ' + absent + ' unavailable of ' + total,
      out.join('') + legend);
  }

   
  function ranges(rows, opts) {
    opts = opts || {};
    rows = (rows || []).filter(function (r) { return num(r.lo) !== null && num(r.hi) !== null; });
    if (!rows.length) return empty('No ensemble spread to draw.');
    var W = 640, rowH = 28, padL = 170, padR = 46, top = 10;
    var H = top + rows.length * rowH + 22;
    var lo = Math.min.apply(null, rows.map(function (r) { return r.lo; }));
    var hi = Math.max.apply(null, rows.map(function (r) { return r.hi; }));
    if (hi - lo < 1e-9) { hi = lo + 1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var plot = W - padL - padR, out = [];
    var X = function (v) { return padL + plot * ((v - lo) / (hi - lo)); };
    rows.forEach(function (r, i) {
      var y = top + i * rowH;
      out.push('<text x="' + (padL - 8) + '" y="' + (y + 15) + '" font-size="11" fill="' + C.ink
        + '" text-anchor="end">' + esc(r.label) + '</text>');
      out.push('<line x1="' + X(r.lo) + '" y1="' + (y + 11) + '" x2="' + X(r.hi) + '" y2="' + (y + 11)
        + '" stroke="' + (r.colour || C.sea) + '" stroke-width="7" stroke-linecap="round" opacity="0.55"/>');
      if (num(r.mid) !== null)
        out.push('<circle cx="' + X(r.mid) + '" cy="' + (y + 11) + '" r="4" fill="' + C.navy + '"/>');
      out.push('<text x="' + (X(r.hi) + 6) + '" y="' + (y + 15) + '" font-size="9.5" fill="' + C.mute
        + '">' + (r.hi - r.lo).toFixed(1) + (opts.unit || '') + '</text>');
    });
    [lo, (lo + hi) / 2, hi].forEach(function (v) {
      out.push('<text x="' + X(v) + '" y="' + (H - 4) + '" font-size="9" fill="' + C.mute
        + '" text-anchor="middle">' + v.toFixed(1) + '</text>');
    });
    return wrap(W, H, opts.title || 'Ensemble spread',
      rows.length + ' systems; the bar is the member range, the dot the median',
      out.join(''));
  }

  function empty(msg) {
    return '<figure class="agn-fig agn-fig-empty"><p>' + esc(msg) + '</p></figure>';
  }

  function selfTest() {
    var out = [];
    function t(n, f) { try { var r = f(); out.push({ name: n, pass: !!r.pass, detail: r.detail }); }
                       catch (e) { out.push({ name: n, pass: false, detail: 'threw: ' + e.message }); } }
    t('VZ-01 an unscored hazard is a labelled gap, not a zero bar', function () {
      var h = bars([{ label: 'Wind', value: null, why: 'no gust input' },
                    { label: 'Heat', value: 62 }]);
      return { pass: h.indexOf('not scored') >= 0 && h.indexOf('no gust input') >= 0
                  && h.indexOf('url(#agnGap') >= 0,
               detail: 'the gap is drawn, hatched and captioned' };
    });
    t('VZ-02 and it is not silently dropped', function () {
      var h = bars([{ label: 'Wind', value: null, why: 'x' }, { label: 'Heat', value: 62 }]);
      return { pass: h.indexOf('Wind') >= 0, detail: 'the category keeps its row' };
    });
    t('VZ-03 the caption counts what was scored', function () {
      var h = bars([{ label: 'A', value: null }, { label: 'B', value: 1 }, { label: 'C', value: 2 }]);
      return { pass: /2 of 3 scored/.test(h), detail: 'caption states the coverage' };
    });
    t('VZ-04 every chart carries a title and a description', function () {
      var all = [bars([{ label: 'A', value: 1 }]), histogram([1, 2, 3]),
                 heat([1, 2, 3, 4], 2), coverage(1, 2, 3), ranges([{ label: 'x', lo: 1, hi: 2, mid: 1.5 }])];
      return { pass: all.every(function (h) { return /<title>/.test(h) && /<desc>/.test(h); }),
               detail: all.length + ' chart types, all labelled' };
    });
    t('VZ-05 an empty input draws a statement, not an axis', function () {
      var all = [bars([]), histogram([]), heat([], 0), coverage(0, 0, 0), ranges([])];
      return { pass: all.every(function (h) { return /agn-fig-empty/.test(h) && !/<svg/.test(h); }),
               detail: 'five empty cases, none draws a chart' };
    });
    t('VZ-06 the ceiling mass is marked on the histogram', function () {
      var h = histogram([1, 2, 3], { ceilingMass: 0.41, N: 10000 });
      return { pass: /41\.0% at the ceiling/.test(h), detail: 'censoring is visible in the picture' };
    });
    t('VZ-07 a null value never becomes a number', function () {
      

      var b = bars([{ label: 'A', value: null, why: 'w' }]);
      var q = series([{ label: 'A', value: null, why: 'w' },
                      { label: 'B', value: null, why: 'w' }], { unit: ' mm' });
      var okB = b.indexOf('font-weight="700"') < 0 && b.indexOf('url(#agnGap') >= 0;
      var okQ = q.indexOf('font-weight="700"') < 0 && q.indexOf('url(#agnGap') >= 0
                && q.indexOf('no value') >= 0;
      return { pass: okB && okQ,
               detail: 'neither primitive prints a value label when every row is a gap' };
    });
    t('VZ-09 a quantity is not drawn on the hazard scale', function () {
      

      var a = series([{ label: 'x', value: 250 }], { unit: ' mm' });
      var b = series([{ label: 'x', value: 95 }],  { unit: ' mm' });
      return { pass: a.indexOf('250.0 mm') >= 0 || a.indexOf('250 mm') >= 0,
               detail: 'series prints the quantity with its unit, ' +
                       (a === b ? 'BUT two different values drew identically' : 'and scales to it') };
    });
    t('VZ-08 no external resource is referenced', function () {
      var all = [bars([{ label: 'A', value: 1 }]), histogram([1]), heat([1], 1),
                 coverage(1, 1, 1), ranges([{ label: 'x', lo: 0, hi: 1 }])].join('');
      return { pass: !/https?:|<script|url\(http/.test(all),
               detail: 'inline SVG only — the policy admits no external script' };
    });
    var passed = out.filter(function (x) { return x.pass; }).length;
    return { checks: out, passed: passed, total: out.length, ok: passed === out.length };
  }

  G.AGN.viz = { bars: bars, series: series, histogram: histogram, heat: heat, coverage: coverage,
                ranges: ranges, empty: empty, colours: C, selfTest: selfTest,
                version: 'v89.34' };
})(window);
