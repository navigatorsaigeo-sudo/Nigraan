
/* AI GEO NIGRAAN report kit (v91.17.268, v91.17.270 additions: cover logo, map place names, stackChart, the 2-page brief), global AGNRK. The parts every printed NIGRAAN report is built from (rk.css).
   Structure ported from the HISAAB report kit. No AI text: every sentence a report prints is written by the page from its own
   figures and stated rules. Charts are inline SVG and always carry a title, units, dates, a legend, the source and a one-line
   reading. Maps carry a legend, a scale bar, a north arrow, the source and the date. Confidence comes from the model gate
   status of the layer (data/model-gate.json via /api/ops/gate), never from a hand-typed level. */
(function (root, make) {
  if (typeof module === "object" && module.exports) module.exports = make();
  else root.AGNRK = make();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fin = function (x) { return x != null && x !== "" && isFinite(Number(x)); };
  var nf = function (x, d) { d = d || 0; return !fin(x) ? "–" : Number(x).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var COL = ["#1E7A68", "#6B5B8C", "#B7791F", "#4F5D55", "#7FB7B0", "#A99BC2"];
  var WORDS = ["Normal", "Low", "Moderate", "High", "Severe"];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var pk = function (t) { var d = new Date((t instanceof Date ? t.getTime() : t == null ? Date.now() : Number(t)) + 5 * 3600e3); return d; };
  /* all times in Pakistan time (UTC+5, no daylight saving) */
  var when = function (t) { var d = pk(t); return d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear() + ", " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2) + " PKT"; };
  var today = function (t) { var d = pk(t); return d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear(); };
  var dayMs = function (ymd) { return Date.parse(String(ymd).slice(0, 10) + "T12:00:00Z"); };
  var dayLab = function (ymd, withDow) { var t = typeof ymd === "number" ? ymd : dayMs(ymd); if (!isFinite(t)) return String(ymd || ""); var d = new Date(t); return (withDow === false ? "" : DOW[d.getUTCDay()] + " ") + d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
  function hash(s) { var h = 0x811c9dc5; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ("0000000" + h.toString(16)).slice(-8); }
  /* severity: index 0..4 on the NIGRAAN scale (Normal, Low, Moderate, High, Severe); null = not available */
  var levelIndex = function (w) { if (fin(w)) { var n = Number(w); return n >= 0 && n <= 4 ? Math.round(n) : null; } var i = WORDS.map(function (x) { return x.toLowerCase(); }).indexOf(String(w || "").toLowerCase()); return i < 0 ? null : i; };
  var sevWord = function (i) { return i == null ? "Not available" : WORDS[i]; };
  var sev = function (i, txt) { i = i == null ? null : levelIndex(i); return '<span class="rk-sev ' + (i == null ? "na" : "s" + i) + '">' + esc(txt || sevWord(i)) + "</span>"; };
  /* confidence: the model gate status of the layer behind a finding */
  var CONF = {
    operational: ["c-hi", "In service (see its product type)"],
    provisional: ["c-mod", "Provisional: tested, still under review"],
    reference: ["c-na", "Reference level: a published or fixed scale, not a forecast test"],
    experimental: ["", "Experimental: shown only, raises no warning"],
    observed: ["c-hi", "Measured: station or satellite reading"],
    projection: ["c-na", "Projection: median and spread of climate models"],
    na: ["c-na", "Not available"]
  };
  var confText = function (st) { return (CONF[st] || CONF.na)[1]; };
  var conf = function (st, extra) { var c = CONF[st] || CONF.na; return '<span class="rk-conf ' + c[0] + '">Confidence · ' + esc(c[1]) + (extra ? " · " + esc(extra) : "") + "</span>"; };
  var h2 = function (n, t, id) { return "<h2" + (id ? ' id="' + esc(id) + '"' : "") + '><span class="n">' + esc(n) + "</span>" + esc(t) + "</h2>"; };
  var card = function (k, v, s, tone) { return '<div class="rk-card ' + (tone || "") + '"><div class="k">' + k + '</div><div class="v">' + v + "</div>" + (s ? '<div class="s">' + s + "</div>" : "") + "</div>"; };
  var na = function (t) { return '<p class="na">' + esc(t) + "</p>"; };
  function table(head, rows, right, caption) {
    right = right || [];
    /* v268 MAIN: a table of up to 12 rows prints whole (no header left alone at the foot of a page); a longer one may run on, row by row */
    return "<table" + (rows.length > 12 ? ' class="long"' : "") + ">" + (caption ? '<caption style="text-align:left;font-weight:700;padding:2pt 0">' + esc(caption) + "</caption>" : "") + "<thead><tr>" + head.map(function (h, i) { return "<th" + (right.indexOf(i) >= 0 ? ' class="r"' : "") + ">" + h + "</th>"; }).join("") + "</tr></thead><tbody>"
      + rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (right.indexOf(i) >= 0 ? ' class="r"' : "") + ">" + (c == null ? "–" : c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }
  /* one hazard finding, always in the same seven parts; a part with nothing to say prints "Not available" rather than vanishing */
  function finding(o) {
    /* v268 MAIN: the Map and Chart parts run the full width of the finding, so their figures print at the kit's text size (12 pt) */
    /* v270: each label and its part are wrapped together, so a label is never left alone at the foot of a page */
    var part = function (k, v, wide) { var c = wide ? ' class="wide"' : ""; return '<div class="pr' + (wide ? " wide" : "") + '"><dt' + c + ">" + k + "</dt><dd" + c + ">" + (v || '<span class="muted">Not available</span>') + "</dd></div>"; };
    return '<section class="rk-find"' + (o.id ? ' id="' + esc(o.id) + '"' : "") + "><header><h3>" + esc(o.title) + "</h3>" + sev(o.lv) + (o.when ? '<span class="rk-tag g">' + esc(o.when) + "</span>" : "") + (o.conf || "") + '</header><div class="body"><dl>'
      + part("Finding", o.finding) + part("Evidence", o.evidence) + part("Map", o.map, true) + part("Chart", o.chart, true) + part("Consequence", o.consequence) + part("Action", o.action) + part("Confidence", o.confText) + "</dl></div></section>";
  }
  /* figure frame */
  function fig(o, svg) {
    var lg = (o.legend || []).map(function (L) { var c = L[0], n = L[1], dash = L[2], band = L[3]; return '<span><i style="background:' + (dash ? "repeating-linear-gradient(90deg," + c + " 0 5px,transparent 5px 8px)" : c) + (band ? ";opacity:.35" : "") + '"></i>' + esc(n) + "</span>"; }).join("");
    return '<figure class="rk-fig"><figcaption><b>' + esc(o.title) + "</b>" + (o.units ? " · " + esc(o.units) : "") + (o.dates ? " · " + esc(o.dates) : "") + "</figcaption>" + svg
      + (lg ? '<div class="rk-legend">' + lg + "</div>" : "") + (o.source ? '<p class="rk-src">Source: ' + esc(o.source) + "</p>" : "") + (o.reading ? '<p class="rk-read">' + esc(o.reading) + "</p>" : "") + "</figure>";
  }
  function ticks(lo, hi, n) {
    var span = hi - lo || Math.abs(hi) || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).filter(function (s) { return s >= raw; })[0] || raw;
    var t = []; for (var v = Math.floor(lo / st) * st; v <= hi + st * 1e-9; v += st) t.push(Math.round(v / st) * st); return t;
  }
  /* v268 MAIN: the decimals a tick label needs so that steps of 0.5 or 0.25 do not print as repeated whole numbers */
  function tickDp(t) { if (t.length < 2) return 0; var st = Math.abs(t[1] - t[0]); return st >= 1 ? 0 : st >= 0.1 ? (Math.abs(st * 10 - Math.round(st * 10)) < 1e-9 ? 1 : 2) : 2; }
  /* day chart: one value per day on a date axis.
     o.days: ['YYYY-MM-DD', ...]; o.lines: [{name, vals:[..], color, dash}]; o.band: {name, lo:[..], hi:[..], color} (a spread, drawn shaded);
     o.bars: {name, vals:[..], color, units} on the right axis (e.g. rain mm); o.y: {label}; o.now: index of today (a marker line).
     A null value is a gap, not a zero. */
  function dayChart(o) {
    var days = o.days || [], n = days.length;
    if (!n) return fig(o, '<div class="rk-nomap">Not available</div>');
    var W = 680, H = o.h || 300, L = 56, R = o.bars && !(o.bars.units && o.y && o.bars.units === o.y.label) ? 56 : 16, T = 14, B = 46;
    var vals = [];
    (o.lines || []).forEach(function (s) { (s.vals || []).forEach(function (v) { if (fin(v)) vals.push(+v); }); });
    if (o.band) (o.band.lo || []).concat(o.band.hi || []).forEach(function (v) { if (fin(v)) vals.push(+v); });
    /* v268 MAIN: a chart with bars and no line value (e.g. rain held, temperature not) reads its left axis from the bars */
    var barsOnly = !vals.length && !!o.bars, bmax0 = 1;
    /* v268 MAIN: bars in the units of the left axis (rain bars beside a wet-case rain line) are drawn on that axis, from 0 */
    var shared = !!o.bars && !barsOnly && !!o.bars.units && !!(o.y && o.y.label) && o.bars.units === o.y.label;
    if (shared) { (o.bars.vals || []).forEach(function (v) { if (fin(v)) vals.push(+v); }); vals.push(0); }
    if (barsOnly) { (o.bars.vals || []).forEach(function (v) { if (fin(v) && +v > bmax0) bmax0 = +v; }); }
    var lo = barsOnly ? 0 : vals.length ? Math.min.apply(null, vals) : 0, hi = barsOnly ? bmax0 : vals.length ? Math.max.apply(null, vals) : 1, pad = barsOnly ? 0 : Math.max(shared ? 0.5 : 1, (hi - lo) * 0.08); lo = shared ? 0 : lo - pad; hi += pad;
    var X = function (i) { return L + (n === 1 ? 0.5 : i / (n - 1)) * (W - L - R); }, Y = function (v) { return T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B); };
    var g = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.title) + '">';
    var tk = ticks(lo, hi, 4).filter(function (t) { return t >= lo && t <= hi; }), tdp = tickDp(tk);
    tk.forEach(function (t) { g += '<line class="ax" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (Y(t) + 5).toFixed(1) + '" text-anchor="end">' + esc(nf(t, tdp)) + "</text>"; });
    if (o.bars) {
      var bv = (o.bars.vals || []).map(function (v) { return fin(v) ? +v : null; }), bmax = Math.max.apply(null, [1].concat(bv.filter(function (v) { return v != null; }))), rt = ticks(0, bmax, 3), rdp = tickDp(rt), bw = Math.max(4, (W - L - R) / n * 0.55), bh = H - T - B;
      if (rt.length > 1 && rt[rt.length - 1] < bmax - 1e-9) rt.push(+(rt[rt.length - 1] + (rt[1] - rt[0])).toFixed(6));
      if (!barsOnly && !shared) bmax = rt[rt.length - 1] || bmax;
      bv.forEach(function (v, i) { if (v != null && v > 0) { var h = shared ? (Y(0) - Y(v)) : bh * v / bmax; g += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (T + bh - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + (o.bars.color || "#7FB7B0") + '" opacity=".75"/>'; } });
      /* v268 MAIN: the right axis carries ticks (0 to the rounded top of the bars) instead of only the largest bar and 0 */
      if (!barsOnly && !shared) rt.forEach(function (t) { var y = T + bh - bh * t / bmax; g += '<text x="' + (W - R + 6) + '" y="' + (y + 5).toFixed(1) + '">' + esc(nf(t, rdp)) + "</text>"; });
    }
    if (o.band) {
      var up = [], dn = [];
      (o.band.hi || []).forEach(function (v, i) { var w = (o.band.lo || [])[i]; if (fin(v) && fin(w)) { up.push(X(i).toFixed(1) + "," + Y(+v).toFixed(1)); dn.unshift(X(i).toFixed(1) + "," + Y(+w).toFixed(1)); } });
      if (up.length > 1) g += '<polygon points="' + up.concat(dn).join(" ") + '" fill="' + (o.band.color || "#1E7A68") + '" opacity=".18"/>';
    }
    if (o.now != null && o.now >= 0 && o.now < n) g += '<line x1="' + X(o.now).toFixed(1) + '" x2="' + X(o.now).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="#9AA39E" stroke-dasharray="4 4"/>';
    (o.lines || []).forEach(function (s, k) {
      var c = s.color || COL[k % COL.length], d = "", on = false;
      (s.vals || []).forEach(function (v, i) { if (!fin(v)) { on = false; return; } d += (on ? " L" : " M") + X(i).toFixed(1) + " " + Y(+v).toFixed(1); on = true; });
      if (d) g += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.5"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : "") + "/>";
      (s.vals || []).forEach(function (v, i) { if (fin(v)) g += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(+v).toFixed(1) + '" r="2.8" fill="' + c + '"/>'; });
    });
    var step = Math.max(1, Math.ceil(n / 7));
    for (var i = 0; i < n; i += step) g += '<text x="' + X(i).toFixed(1) + '" y="' + (H - B + 20) + '" text-anchor="' + (i === 0 ? "start" : "middle") + '">' + esc(dayLab(days[i], false)) + "</text>";
    var yl = barsOnly ? (o.bars.units || (o.y && o.y.label)) : (o.y && o.y.label);
    if (yl) g += '<text x="14" y="' + (T + (H - T - B) / 2) + '" text-anchor="middle" transform="rotate(-90 14 ' + (T + (H - T - B) / 2) + ')">' + esc(yl) + "</text>";
    if (o.bars && o.bars.units && !barsOnly && !shared) g += '<text x="' + (W - 15) + '" y="' + (T + (H - T - B) / 2) + '" text-anchor="middle" transform="rotate(90 ' + (W - 15) + " " + (T + (H - T - B) / 2) + ')">' + esc(o.bars.units) + "</text>";
    g += "</svg>";
    var legend = (o.lines || []).map(function (s, k) { return [s.color || COL[k % COL.length], s.name, s.dash]; });
    if (o.band) legend.push([o.band.color || "#1E7A68", o.band.name, false, true]);
    if (o.bars) legend.push([o.bars.color || "#7FB7B0", o.bars.name]);
    return fig(Object.assign({ legend: legend }, o), g);
  }
  /* horizontal bars: rows [{label, value, color, note}] */
  function barChart(o) {
    var rows = o.rows || [], W = 680, rh = 28, Lw = o.labelW || 220, R = 120, H = rows.length * rh + 8, max = Math.max.apply(null, [1e-12].concat(rows.map(function (r) { return Math.abs(r.value || 0); }))), f = o.fmt || function (v) { return nf(v); };
    var g = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.title) + '">';
    rows.forEach(function (r, i) { var y = 4 + i * rh, w = (W - Lw - R) * Math.abs(r.value || 0) / max;
      g += '<text x="' + (Lw - 8) + '" y="' + (y + 18) + '" text-anchor="end">' + esc(r.label) + "</text>";
      g += r.value == null ? '<text x="' + Lw + '" y="' + (y + 18) + '" style="fill:#8a958e">Not available</text>' : '<rect x="' + Lw + '" y="' + (y + 4) + '" width="' + Math.max(1, w).toFixed(1) + '" height="' + (rh - 10) + '" rx="2" fill="' + (r.color || COL[0]) + '"/><text x="' + (Lw + w + 6).toFixed(1) + '" y="' + (y + 18) + '">' + esc(f(r.value)) + "</text>"; });
    return fig(o, g + "</svg>");
  }
  /* range plot: rows [{label, lo, mid, hi, color}] */
  function rangeChart(o) {
    var rows = o.rows || [], W = 680, rh = 30, Lw = o.labelW || 220, R = 24, H = rows.length * rh + 40, f = o.fmt || function (v) { return nf(v, 1); };
    var vals = []; rows.forEach(function (r) { [r.lo, r.mid, r.hi].forEach(function (v) { if (fin(v)) vals.push(+v); }); }); if (o.zero !== false) vals.push(0);
    if (!vals.length) return fig(o, '<div class="rk-nomap">Not available</div>');
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad;
    var X = function (v) { return Lw + (v - lo) / (hi - lo) * (W - Lw - R); };
    var g = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.title) + '">';
    ticks(lo, hi, 5).filter(function (t) { return t >= lo && t <= hi; }).forEach(function (t) { g += '<line class="' + (t === 0 ? "ax0" : "ax") + '" x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y1="4" y2="' + (H - 30) + '"/><text x="' + X(t).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(f(t)) + "</text>"; });
    rows.forEach(function (r, i) { var y = 6 + i * rh + rh / 2, c = r.color || COL[i % 2];
      g += '<text x="' + (Lw - 8) + '" y="' + (y + 5) + '" text-anchor="end">' + esc(r.label) + "</text>";
      if (!fin(r.lo) || !fin(r.hi)) { g += '<text x="' + Lw + '" y="' + (y + 5) + '" style="fill:#8a958e">Not available</text>'; return; }
      g += '<line x1="' + X(+r.lo).toFixed(1) + '" x2="' + X(+r.hi).toFixed(1) + '" y1="' + y + '" y2="' + y + '" stroke="' + c + '" stroke-width="7" stroke-linecap="round" opacity=".45"/>';
      if (fin(r.mid)) g += '<circle cx="' + X(+r.mid).toFixed(1) + '" cy="' + y + '" r="6" fill="' + c + '"/>'; });
    return fig(o, g + "</svg>");
  }
  /* v270 · stacked horizontal bars (counts): rows [{label, parts:[n per class]}], o.colors (one per class), o.names (legend), o.unit
     (e.g. "sites"). A row with no count prints "none". */
  function stackChart(o) {
    var rows = o.rows || [], W = 680, rh = 30, Lw = o.labelW || 200, R = 70, T = 6, B = o.unit ? 50 : 34, H = rows.length * rh + T + B, cols = o.colors || COL;
    var tot = rows.map(function (r) { return (r.parts || []).reduce(function (a, b) { return a + (fin(b) ? +b : 0); }, 0); }), max = Math.max.apply(null, [1].concat(tot));
    var tk = ticks(0, max, 4).filter(function (t) { return t >= 0 && t <= max && Math.abs(t - Math.round(t)) < 1e-9; });
    var X = function (v) { return Lw + (W - Lw - R) * v / max; };
    var g = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.title) + '">';
    tk.forEach(function (t) { g += '<line class="' + (t === 0 ? "ax0" : "ax") + '" x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y1="' + T + '" y2="' + (H - B + 4) + '"/><text x="' + X(t).toFixed(1) + '" y="' + (H - B + 22) + '" text-anchor="middle">' + esc(nf(t)) + "</text>"; });
    rows.forEach(function (r, i) { var y = T + i * rh, x = Lw;
      g += '<text x="' + (Lw - 8) + '" y="' + (y + 20) + '" text-anchor="end">' + esc(r.label) + "</text>";
      (r.parts || []).forEach(function (v, k) { if (!fin(v) || +v <= 0) return; var w = (W - Lw - R) * v / max; g += '<rect x="' + x.toFixed(1) + '" y="' + (y + 5) + '" width="' + w.toFixed(1) + '" height="' + (rh - 10) + '" fill="' + cols[k % cols.length] + '" stroke="#fff" stroke-width="1"/>'; x += w; });
      g += '<text x="' + (x + 6).toFixed(1) + '" y="' + (y + 20) + '">' + (tot[i] ? esc(nf(tot[i])) : "none") + "</text>"; });
    if (o.unit) g += '<text x="' + ((Lw + W - R) / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(o.unit) + "</text>";
    var lg = (o.names || []).map(function (n, k) { return [cols[k % cols.length], n]; }).filter(function (L, k) { return rows.some(function (r) { return fin((r.parts || [])[k]) && +r.parts[k] > 0; }); });
    return fig(Object.assign({ legend: lg }, o), g + "</svg>");
  }
  /* a vector map drawn from geometry the page already holds (tehsil or district polygons, points). No tiles, so it prints the
     same offline. o: {bbox:[w,s,e,n], polys:[{rings:[[[lon,lat],..]], fill, stroke, width, label}], points:[{lon,lat,color,label,r,shape:'sq'|'dot'|'star'}],
     legend:[[color,label,square]], labels:[{lon,lat,text}] (v270: place names, light), title, units, dates, source, reading, missing}.
     Equirectangular with the cos(latitude) aspect. */
  function areaMap(o) {
    var bb = o.bbox;
    if (!bb || !(bb[2] > bb[0]) || !(bb[3] > bb[1]) || (!(o.polys || []).length && !(o.points || []).length)) return fig(Object.assign({}, o, { legend: [] }), '<div class="rk-nomap">' + esc(o.missing || "Map not available: the boundaries for this place were not loaded when the report was made.") + "</div>");
    var lat0 = (bb[1] + bb[3]) / 2, kx = Math.cos(lat0 * Math.PI / 180), W = 680, H = o.h || Math.max(260, Math.min(520, Math.round(W * (bb[3] - bb[1]) / ((bb[2] - bb[0]) * kx))));   /* v268 MAIN: o.h fixes the map height */
    var sx = W / ((bb[2] - bb[0]) * kx), sy = H / (bb[3] - bb[1]), s = Math.min(sx, sy), ox = (W - (bb[2] - bb[0]) * kx * s) / 2, oy = (H - (bb[3] - bb[1]) * s) / 2;
    var P = function (lon, lat) { return [(ox + (lon - bb[0]) * kx * s).toFixed(1), (oy + (bb[3] - lat) * s).toFixed(1)]; };
    var g = '<svg class="base" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.title) + '"><rect width="' + W + '" height="' + H + '" fill="#F7F5EE"/>';
    (o.polys || []).forEach(function (p) {
      var d = (p.rings || []).map(function (r) { return "M" + r.map(function (c) { return P(c[0], c[1]).join(" "); }).join(" L") + " Z"; }).join(" ");
      if (d) g += '<path d="' + d + '" fill="' + (p.fill || "none") + '" fill-rule="evenodd" stroke="' + (p.stroke || "#8C978F") + '" stroke-width="' + (p.width || 1) + '"/>';
    });
    /* v91.17.272.1: the scale bar is sized first, so its box and the north arrow's are kept clear (the map prints at about 1 px per unit) */
    var widthKm = (bb[2] - bb[0]) * 111.32 * kx * (W / ((bb[2] - bb[0]) * kx * s));
    var sc = "", scPct = 0;
    if (widthKm > 0) { var target = widthKm / 4, mag = Math.pow(10, Math.floor(Math.log10(target))), km = [1, 2, 5, 10].map(function (m) { return m * mag; }).filter(function (v) { return v <= target; }).pop() || mag, frac = km / widthKm;
      scPct = Math.max(12, frac * 100 + 3);
      sc = '<div class="scale" style="width:' + scPct.toFixed(1) + '%"><div style="height:5px;background:#1F2A24;width:' + (100 * frac / Math.max(0.12, frac + 0.03)).toFixed(1) + '%"></div>' + nf(km, km < 1 ? 1 : 0) + " km</div>"; }
    var hit = function (a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); };
    var keep = [[0, 0, 52, 66]]; if (scPct) keep.push([W - scPct / 100 * W - 14, 0, W, 48]);
    /* v91.17.272.1: site labels first. Each tries the right of its dot, then the left (near the right edge), then above or below; when no
       place beside the dot is free (dots closer than a label) the label is set off along a short leader line. Inside the frame always. */
    var dots = (o.points || []).map(function (p) { var q = P(p.lon, p.lat), r = p.r || 6, e = p.shape === "star" ? r + 4 : r; return [+q[0] - e - 2, +q[1] - e - 2, +q[0] + e + 2, +q[1] + e + 2]; });
    var placed = [], leads = [], tw = function (t) { return String(t).length * 9 + 4; };
    var free = function (b) { return b[0] >= 2 && b[1] >= 2 && b[2] <= W - 2 && b[3] <= H - 2 && !keep.some(function (k) { return hit(b, k); }) && !placed.some(function (k) { return hit(b, k.b); }) && !dots.some(function (k) { return hit(b, k); }); };
    var lbox = function (tx, by, w) { return [tx - 2, by - 15, tx + w + 2, by + 5]; };
    (o.points || []).forEach(function (p, i) { if (!p.label) return; var q = P(p.lon, p.lat), x = +q[0], y = +q[1], r = p.shape === "star" ? (p.r || 6) + 4 : (p.r || 6), w = tw(p.label), got = null;
      var cand = [[x + r + 5, y + 5], [x - r - 5 - w, y + 5], [x + r - 2, y - r - 8], [x + r - 2, y + r + 18], [x - r + 2 - w, y - r - 8], [x - r + 2 - w, y + r + 18]];
      /* dots closer than a label (they touch): the label goes out along a leader, away from its neighbours, so each number reads with its own dot */
      var nb = dots.filter(function (k, j) { if (j === i) return false; var cx = (k[0] + k[2]) / 2, cy = (k[1] + k[3]) / 2; return Math.hypot(cx - x, cy - y) < 2 * r + 10; });
      var a0 = null; if (nb.length) { var mx = 0, my = 0; nb.forEach(function (k) { mx += (k[0] + k[2]) / 2; my += (k[1] + k[3]) / 2; }); mx /= nb.length; my /= nb.length; a0 = Math.atan2(y - my, x - mx); cand = []; }
      for (var c = 0; c < cand.length && !got; c++) { var b = lbox(cand[c][0], cand[c][1], w); if (free(b)) got = { tx: cand[c][0], by: cand[c][1], b: b }; }
      for (var dd = 24; dd <= 72 && !got; dd += 16) for (var a = 0; a < 8 && !got; a++) { var an = a0 != null ? a0 + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * Math.PI / 4 : a * Math.PI / 4 - Math.PI / 4, ax = x + Math.cos(an) * dd, ay = y + Math.sin(an) * dd, tx = Math.cos(an) >= -0.01 ? ax + 2 : ax - 2 - w, b2 = lbox(tx, ay + 5, w);
        if (free(b2)) got = { tx: tx, by: ay + 5, b: b2, lead: [x + Math.cos(an) * (r + 1), y + Math.sin(an) * (r + 1), ax, ay] }; }
      if (!got) { var fx = Math.max(4, Math.min(x + r + 5, W - 4 - w)), fy = Math.max(19, Math.min(y + 5, H - 7)); got = { tx: fx, by: fy, b: lbox(fx, fy, w) }; }
      got.text = p.label; placed.push(got); });
    /* town names keep clear of the boxes, the site labels and the labelled dots (unlabelled dots, e.g. stations, may sit under a name as before) */
    var boxes = keep.concat(dots.filter(function (k, j) { return (o.points[j] || {}).label; }), placed.map(function (k) { return k.b; }));
    /* v270: place names under the report layer (light): towns and cities the page holds, placed largest first, a name that would
       overlap one already placed (or the map edge) is left out */
    (o.labels || []).forEach(function (L) { if (!fin(L.lon) || !fin(L.lat) || !L.text) return; var q = P(L.lon, L.lat), x = +q[0], y = +q[1], w = String(L.text).length * 8.6 + 10, bx = [x - 4, y - 15, x + 6 + w, y + 6];
      if (x < 4 || y < 16 || bx[2] > W - 4 || y > H - 6) return;
      if (boxes.some(function (b) { return !(bx[2] < b[0] || bx[0] > b[2] || bx[3] < b[1] || bx[1] > b[3]); })) return; boxes.push(bx);
      g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6" fill="#6E7B73"/><text class="lb" x="' + (x + 5).toFixed(1) + '" y="' + (y + 5).toFixed(1) + '" style="fill:#4F5D55;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(L.text) + "</text>"; });
    (o.polys || []).forEach(function (p) { if (p.label && p.at) { var q = P(p.at[0], p.at[1]); g += '<text x="' + q[0] + '" y="' + q[1] + '" text-anchor="middle" style="fill:#1F2A24;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(p.label) + "</text>"; } });
    placed.forEach(function (k) { if (k.lead) g += '<line x1="' + k.lead[0].toFixed(1) + '" y1="' + k.lead[1].toFixed(1) + '" x2="' + k.lead[2].toFixed(1) + '" y2="' + k.lead[3].toFixed(1) + '" stroke="#1F2A24" stroke-width="1.2"/>'; });
    (o.points || []).forEach(function (p) { var q = P(p.lon, p.lat), r = p.r || 6, c = p.color || "#1F2A24";
      if (p.shape === "sq") g += '<rect x="' + (q[0] - r) + '" y="' + (q[1] - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" fill="' + c + '" stroke="#fff" stroke-width="1.5"/>';
      else if (p.shape === "star") g += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (r + 3) + '" fill="#fff" stroke="' + c + '" stroke-width="3"/><circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (r - 2) + '" fill="' + c + '"/>';
      else g += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + r + '" fill="' + c + '" stroke="#fff" stroke-width="1.5"/>'; });
    placed.forEach(function (k) { g += '<text class="pl" x="' + k.tx.toFixed(1) + '" y="' + k.by.toFixed(1) + '" style="fill:#1F2A24;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(k.text) + "</text>"; });
    g += "</svg>";
    var north = '<svg class="north" viewBox="0 0 26 36" aria-label="North"><polygon points="13,3 20,22 13,17 6,22" fill="#1F2A24"/><text x="13" y="33" text-anchor="middle" style="font-size:12px;font-weight:700;fill:#1F2A24">N</text></svg>';
    var lg = (o.legend || []).length ? '<div class="lg">' + o.legend.map(function (L) { return '<span><i class="' + (L[2] ? "sq" : "") + '" style="background:' + L[0] + '"></i>' + esc(L[1]) + "</span>"; }).join("") + "</div>" : "";
    return fig(Object.assign({}, o, { legend: [] }), '<div class="rk-map">' + g + north + sc + lg + "</div>");
  }
  /* cover: brand, report kind, title, place, contents. No date or document-ID line (AGN document rule): those are on the summary page. */
  function cover(o) {
    return '<section class="rk-cover"><div class="top"><div class="brand">' + (o.logo ? '<img class="rk-logo" src="' + esc(o.logo) + '" alt="AI Geo Navigators">' : "") + '<span>AI GEO NIGRAAN</span></div><div class="kind">' + esc(o.kind) + "</div></div>"
      + '<div class="title"><h1>' + esc(o.title) + '</h1><p class="sub">' + esc(o.subtitle || "") + "</p></div>"
      + ((o.contents || []).length ? '<div class="contents"><h3>Contents</h3><ol>' + o.contents.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ol></div>" : "")
      + '<div class="bottom">Prepared with AI GEO NIGRAAN by AI Geo Navigators (Private) Limited · www.aigeo360.com · info@aigeo360.com. '
      + "Every sentence in this report is written by fixed rules from the figures shown; nothing is written by an AI model. It ranks and dates what needs attention; it does not replace a site survey, a design calculation or an official warning.</div></section>";
  }
  /* v270 · the head of a 2-page brief (no cover page: the brief is the summary): brand with the logo, kind, place and the issued line */
  function briefHead(o) {
    return '<header class="rk-bhead"><div class="top"><div class="brand">' + (o.logo ? '<img class="rk-logo" src="' + esc(o.logo) + '" alt="AI Geo Navigators">' : "") + '<span>AI GEO NIGRAAN</span></div><div class="kind">' + esc(o.kind) + " · short edition</div></div>"
      + "<h1>" + esc(o.title) + "</h1>" + (o.subtitle ? '<p class="sub">' + esc(o.subtitle) + "</p>" : "") + issued(o) + "</header>";
  }
  /* the line under the summary heading: when, which run, which report */
  var issued = function (o) { return '<p class="muted">Issued ' + esc(o.when) + (o.run ? " · forecast run " + esc(o.run) : "") + " · report " + esc(o.id) + "</p>"; };
  var foot = function (o) { return '<div class="rk-foot">Report ' + esc(o.id) + " · issued " + esc(o.when) + (o.run ? " · forecast run " + esc(o.run) : "") + (o.extra ? " · " + esc(o.extra) : "") + "<br>AI Geo Navigators (Private) Limited · www.aigeo360.com · info@aigeo360.com</div>"; };
  /* the assessment record: what went in, what came out, which methods, the dates and the limits. Stored with the report. */
  function record(o) {
    var body = { record_version: "1", product: "AI GEO NIGRAAN", kind: o.kind, created_pkt: when(), created_utc: new Date().toISOString(), run: o.run || null, subject: o.subject || null,
      verdict: o.verdict || null, inputs: o.inputs || {}, results: o.results || {}, method_versions: o.methods || {}, dates: o.dates || {}, limits: o.limits || [] };
    var d = pk(); var ymd = d.getUTCFullYear() + ("0" + (d.getUTCMonth() + 1)).slice(-2) + ("0" + d.getUTCDate()).slice(-2);
    body.report_id = o.id || ("NIGRAAN-" + String(o.kind || "report").toUpperCase().replace(/[^A-Z0-9]+/g, "") + "-" + ymd + "-" + hash(JSON.stringify([body.kind, body.run, body.subject, body.inputs, body.results])));
    return body;
  }
  function download(name, text, type) { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "application/octet-stream" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  /* a stand-alone copy of a report: the kit's own sealed stylesheet travels with it */
  function standalone(html, title) {
    var css = ""; try { var el = document.getElementById("agn-rk-css"); css = el ? el.textContent : ""; } catch (_) {}
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(title || "AI GEO NIGRAAN report") + "</title><style>" + css + "body{margin:0;background:#ECEFED;padding:12px}@media print{body{background:#fff;padding:0}}</style></head><body>" + html + "</body></html>";
  }
  /* the reader: a report opened from a section stays over that section. o: {html, title, fileBase, record, onIssue(kind) -> Promise|void, extraButtons:[{label, on}], bare,
     back: the element focus returns to on Close (default: the element focused when the reader opened)} */
  var OPEN = null;
  function close() { if (OPEN) { try { OPEN.el.remove(); } catch (_) {} try { document.removeEventListener("keydown", OPEN.key); } catch (_) {} try { document.body.style.overflow = OPEN.ovf; } catch (_) {} if (OPEN.back) try { OPEN.back.focus(); } catch (_) {} OPEN = null; } }
  function reader(o) {
    close();
    var ov = document.createElement("div"); ov.className = "rk-overlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", o.title || "Report");
    var bar = document.createElement("div"); bar.className = "rk-bar no-print";
    var st = document.createElement("span"); st.className = "st"; st.setAttribute("aria-live", "polite");
    var btn = function (label, fn, pri) { var b = document.createElement("button"); b.type = "button"; b.textContent = label; if (pri) b.className = "pri"; b.addEventListener("click", fn); bar.appendChild(b); return b; };
    var issue = function (kind) { try { var r = o.onIssue ? o.onIssue(kind) : null; if (r && r.then) r.then(function (m) { if (m) st.textContent = m; }, function () { st.textContent = "Not saved to the reports library (the server did not answer)."; }); } catch (_) {} };
    /* v270: o.bare (a reader that holds no report yet, e.g. "Add sites first") carries no print or download */
    if (!o.bare) {
      btn("Save as PDF / Print", function () { issue("print"); document.body.classList.add("rk-printing"); setTimeout(function () { try { window.print(); } finally { setTimeout(function () { document.body.classList.remove("rk-printing"); }, 300); } }, 60); }, true);
      btn("Download HTML", function () { issue("html"); download((o.fileBase || "nigraan-report") + ".html", standalone(o.html, o.title), "text/html"); });
    }
    if (o.record) btn("Download record (JSON)", function () { download((o.fileBase || "nigraan-report") + ".record.json", JSON.stringify(o.record, null, 1), "application/json"); });
    (o.extraButtons || []).forEach(function (x) { btn(x.label, x.on); });
    var cl = btn("Close", close);
    bar.appendChild(st);
    var page = document.createElement("div"); page.innerHTML = o.html;
    ov.appendChild(bar); ov.appendChild(page); document.body.appendChild(ov);
    var key = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key);
    OPEN = { el: ov, key: key, back: o.back || document.activeElement, ovf: document.body.style.overflow };
    document.body.style.overflow = "hidden";
    try { cl.focus(); } catch (_) {}
    return { el: ov, status: function (t) { st.textContent = t; }, close: close };
  }
  return { esc: esc, nf: nf, fin: fin, COL: COL, WORDS: WORDS, when: when, today: today, dayLab: dayLab, dayMs: dayMs, hash: hash, levelIndex: levelIndex, sev: sev, sevWord: sevWord,
    conf: conf, confText: confText, CONF: CONF, h2: h2, card: card, na: na, table: table, finding: finding, fig: fig, dayChart: dayChart, barChart: barChart, rangeChart: rangeChart,
    areaMap: areaMap, stackChart: stackChart, cover: cover, briefHead: briefHead, issued: issued, foot: foot, record: record, download: download, standalone: standalone, reader: reader, close: close };
});
