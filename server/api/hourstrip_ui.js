/* == v91.17.283.22 . THE HOUR-BY-HOUR STRIP OF A PLACE, ONE COMPONENT FOR EVERY PAGE (served as /agn-hour-strip.js, its look as
   /agn-hour-strip.css) ================================================================================================================
   Owner, 26 Oct 2026: the strip of v91.17.283.21 (start drawer, Forecast tab) also in the analyst page's Forecast tab, the same component
   (no copy), and rain in 3-hour windows in every hourly table. Everything is read from the place bundle the page already holds
   (GET /api/point, server/api/point.mjs): no request of its own.
     hours      B.hours (PKT, corrected): time, tempC, feelsC, rainMm, windKmh, gustKmh, cloudPct, swRad, weatherCode
     days       B.days: date, tmaxC, tminC, rainMm;  now: B.now.time;  run: B.issuedAt
     chance     part poolHazard, windows3h (server/api/pool.mjs rainWindows): per 3-hour PKT window the equal-system share of ensemble
                members whose rain summed over the window reaches tau; screening fallback (deterministic models, one vote per family) marked
     15 min     part land (the provider's 15-minute rain now) and B.station (the nearest AGN station's reading): only real 15-minute values
   Rain is never shown at an hour: a window holds the hours stamped hh, hh+1, hh+2 PKT (00-03 ... 21-24), the hours the day total adds up;
   its amount is the sum of the record's three hourly values (none unless all three are held).
   The label of the chance of rain is the register's (GET /api/registry/levels rainChance.label: "screening" until its reliability re-test
   passes); the page hands that answer in (o.registry), the component never asks for it.
   API: AGNHourStrip.box(B, o)          the strip (step buttons, 3 h / 1 h / now 15 min) as HTML; o: {mode, productType, registry, title}
        AGNHourStrip.wire(root, getB, o) the step buttons of a drawn box (o.mode is kept on o)
        AGNHourStrip.windows(B)         the 3-hour windows of the record [{start, hours, mm}]
        AGNHourStrip.chance(B)          {st: ok | load | na | limited, by, tau, why, retryAt}
        AGNHourStrip.cells(B, times, o) the window cells of an hourly table: per listed hour {key, first, span, html, title, mm, p}
        AGNHourStrip.label(reg)         the chance-of-rain label word of the register */
(function (W) {
  'use strict';
  var D = W.document;
  if (W.AGNHourStrip) return;
  var DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fin(x) { return x != null && x !== '' && isFinite(+x); }
  function r1(x) { return fin(x) ? (Math.round(+x * 10) / 10).toFixed(1).replace(/^-0\.0$/, '0.0') : null; }
  function r0(x) { if (!fin(x)) return null; var v = Math.round(+x); return v === 0 ? '0' : String(v); }
  function todayIso() { return new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); }
  function dayLab(iso) { var d = new Date(iso + 'T00:00:00Z'); return isNaN(d) ? '' : DN[d.getUTCDay()] + ' ' + d.getUTCDate(); }
  function localHm(s) { var m = /T(\d\d:\d\d)/.exec(String(s || '')); return m ? m[1] : ''; }
  function pktHm(iso) { var t = Date.parse(iso); return isFinite(t) ? new Date(t + 5 * 3600e3).toISOString().slice(11, 16) : null; }
  /* the look: one stylesheet, linked once (the pages allow style sheets of their own origin) */
  function css() { if (D.querySelector('link[data-agnhs]')) return; var l = D.createElement('link'); l.rel = 'stylesheet'; l.href = '/agn-hour-strip.css'; l.setAttribute('data-agnhs', '1'); (D.head || D.documentElement).appendChild(l); }
  try { if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', css); else css(); } catch (_) {}
  var S = { cw: 46, ch: 110, gustHi: 20 };   /* gustHi: the owner's highlight of gusts of 20 km/h and above (a display mark, not a hazard level) */
  function hsWin(t) { var s = String(t || ''), h = +s.slice(11, 13); return isFinite(h) && s.length >= 13 ? s.slice(0, 11) + ('0' + (h - h % 3)).slice(-2) + ':00' : ''; }
  /* v91.17.283.23 · audit 12 · a rain value stamped hh is the rain of the PRECEDING hour (hh-1 to hh), so it belongs to the window holding
     hh-1: the window hh..hh+3 sums the values stamped hh+1, hh+2 and hh+3 (the same rule as the server's chance windows, pool.mjs) */
  function rainWin(t) { var s = String(t || ''); var ms = Date.parse(s.slice(0, 16) + ':00Z'); if (!isFinite(ms)) return ''; return hsWin(new Date(ms - 3600e3).toISOString().slice(0, 16)); }
  function winEnd(k) { return ('0' + ((+k.slice(11, 13) + 3) % 24)).slice(-2) + ':00'; }
  function hoursOf(B) { return (B && Array.isArray(B.hours)) ? B.hours : []; }
  function cols(B, mode) { var n = (B && B.now) || {}, H = hoursOf(B), w0 = hsWin(n.time || (H[0] && H[0].time)); var c = H.filter(function (h) { return String(h.time) >= w0; });
    return mode === '3' ? c.filter(function (h) { return +String(h.time).slice(11, 13) % 3 === 0; }) : c; }
  /* the 3-hour windows of the record: the sum of the window's hourly corrected rain (null unless all three hours are held) */
  function windows(B) { var H = hoursOf(B), M = {}, o = [];
    H.forEach(function (h) { var k = rainWin(h.time); if (!k) return; if (!M[k]) { M[k] = []; o.push(k); } M[k].push(h); });
    return o.map(function (k) { var a = M[k], ok = a.length === 3 && a.every(function (h) { return fin(h.rainMm); }); return { start: k, hours: a.map(function (h) { return h.time; }), mm: ok ? Math.round(10 * a.reduce(function (s, h) { return s + (+h.rainMm); }, 0)) / 10 : null }; }); }
  /* the chance of a window: the bundle part poolHazard (windows3h); pending while the part is computed; limited while the provider limit
     holds it (the server retries it on its own and the page reads it again at retryAt) */
  function chance(B) { var x = B && B.parts && B.parts.poolHazard; if (!x) return { st: 'na', why: 'the chance of rain is not part of this record' }; if (x.pending) return { st: 'load' };
    if (x.limited) return { st: 'limited', why: x.why || 'not available right now (provider limit) - retrying', retryAt: x.retryAt || null };
    var v = x.v, w = v && v.windows3h; if (x.unavailable || !w) return { st: 'na', why: (x.why || 'not available') }; if (!w.ok) return { st: 'na', why: w.why || 'not available', tau: w.tauMm };
    var m = {}; (w.windows || []).forEach(function (r) { m[r.start] = r; }); return { st: 'ok', by: m, tau: w.tauMm }; }
  /* the register's label of the chance of rain ("screening" until the reliability re-test passes); without the register's answer the
     most cautious word */
  function label(reg) { var r = reg || (W.AGN && W.AGN.levelLegends) || null; return (r && r.rainChance && r.rainChance.label) || 'screening'; }
  function chanceTitle(CH, r, p) { var scr = !!(r && r.screening);
    return CH.st === 'load' ? 'being computed' : CH.st !== 'ok' ? CH.why : !r ? 'no chance for this window' : p == null ? (r.why || 'not available') : (scr ? 'screening fallback: ' + r.why : 'share of ' + r.members + ' ensemble members with at least ' + CH.tau + ' mm in the window'); }
  function chanceInner(CH, r, p) { var scr = !!(r && r.screening);
    return CH.st === 'load' ? '<span class="z">\u2026</span>' : p == null ? '<span class="z">\u2013</span>' : '<span class="' + (p > 0 ? 'w' : 'z') + (scr ? ' scr' : '') + '">' + p + '</span>'; }
  /* v91.17.283.23 · day or night of an hour from the sun's elevation at that instant (NOAA solar position, about 0.5 deg), not from the
     hour's radiation: the provider's radiation is the mean of the PRECEDING hour, so 18:00 showed a sun after sunset */
  function sunElev(lat, lon, iso) { var t = Date.parse(String(iso).slice(0, 16) + ':00Z') - 5 * 3600e3; if (!isFinite(t) || !fin(lat) || !fin(lon)) return null;
    var d = new Date(t), jd = t / 864e5 + 2440587.5, n = jd - 2451545, L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) * Math.PI / 180,
      lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI / 180, eps = (23.439 - 4e-7 * n) * Math.PI / 180,
      dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)),
      gmst = (18.697374558 + 24.06570982441908 * n) % 24, ha = ((gmst * 15 + (+lon)) * Math.PI / 180) - ra, la = (+lat) * Math.PI / 180;
    return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI; }
  function sky(h, pt) { var c = h.weatherCode == null || h.weatherCode === '' ? NaN : +h.weatherCode, el = pt ? sunElev(pt.lat, pt.lon, h.time) : null,
      day = el != null ? el > 0 : (fin(h.swRad) && +h.swRad > 0), cl = fin(h.cloudPct) ? +h.cloudPct : null;   /* v283.23 self-audit W4: a missing weather code is not code 0 (clear) */
    /* the sky only (cloud and sun); rain is shown in its own 3-hour rows, never as an hourly icon */
    var sun = '<circle cx="12" cy="12" r="5" fill="#E8A93A"/><g stroke="#E8A93A" stroke-width="2">' + [[1, 0], [0, 1], [-1, 0], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]].map(function (p) { return '<line x1="' + (12 + 8 * p[0]) + '" y1="' + (12 + 8 * p[1]) + '" x2="' + (12 + 10.5 * p[0]) + '" y2="' + (12 + 10.5 * p[1]) + '"/>'; }).join('') + '</g>',
      moon = '<path d="M15 3a8 8 0 1 0 6 13A7 7 0 0 1 15 3z" fill="#7C8FA3"/>', cloud = '<path d="M7 19h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 7 19z" fill="#AEBAC0"/>',
      part = (day ? '<circle cx="9" cy="9" r="4" fill="#E8A93A"/>' : '<path d="M11 3a5 5 0 1 0 4 8A4.4 4.4 0 0 1 11 3z" fill="#7C8FA3"/>') + cloud;
    var k = fin(c) ? (c <= 1 ? 'clear' : c === 2 ? 'part' : 'cloud') : (cl == null ? null : cl < 25 ? 'clear' : cl < 70 ? 'part' : 'cloud'); if (!k) return '\u2013';
    var t = { clear: day ? 'Clear, sun' : 'Clear', part: 'Partly cloudy', cloud: c === 45 || c === 48 ? 'Fog' : 'Cloudy' }[k];
    return '<svg width="22" height="22" viewBox="0 0 24 24" role="img" aria-label="' + t + '"><title>' + t + '</title>' + (k === 'clear' ? (day ? sun : moon) : k === 'part' ? part : cloud) + '</svg>'; }
  function nowList(B) { var L = [], P = (B && B.parts) || {}, ld = P.land && !P.land.pending && !P.land.unavailable ? P.land.v : null, wc = ld && ld.water && ld.water.current, st = B && B.station && B.station.ok ? B.station : null, r = (st && st.reading) || {};
    if (wc && fin(wc.precipitation) && wc.time) { var iv = fin(wc.interval) ? +wc.interval : 900, t1 = String(wc.time).slice(0, 16), t0 = new Date(Date.parse(t1 + ':00Z') - iv * 1000).toISOString().slice(11, 16);
      L.push('<li data-hs15="rain"><b>Rain ' + esc(t0) + '\u2013' + esc(t1.slice(11, 16)) + ' PKT: ' + esc(r1(wc.precipitation)) + ' mm</b><div class="small">the provider\u2019s 15-minute value at this place (model), not a measurement</div></li>'); }
    if (st && (fin(r.tempC) || fin(r.windKmh)) && r.observedAt) { var q = []; if (fin(r.tempC)) q.push(r1(r.tempC) + ' \u00b0C'); if (fin(r.rh)) q.push('humidity ' + r0(r.rh) + ' %'); if (fin(r.windKmh)) q.push('wind ' + r0(r.windKmh) + ' km/h');
      var ot = Date.parse(r.observedAt), od = isFinite(ot) ? new Date(ot + 5 * 3600e3).toISOString() : null;
      L.push('<li data-hs15="station"><b>' + esc(st.name) + ', ' + esc(r1(st.km)) + ' km: ' + esc(q.join(' \u00b7 ')) + '</b><div class="small">AGN station reading of ' + esc(od ? (od.slice(0, 10) === todayIso() ? 'today ' : dayLab(od.slice(0, 10)) + ' ') + od.slice(11, 16) + ' PKT' : '') + ' (an observation)</div></li>'); }
    return L.length ? '<ul class="hsNow" id="hsNow">' + L.join('') + '</ul><div class="small">Only real 15-minute values are listed; nothing is filled in between hours.</div>'
      : '<div class="note" id="hsNow">No 15-minute value is held for this place right now (no provider 15-minute rain and no AGN station reading in reach).</div>'; }
  function strip(B, mode, o) { var C = cols(B, mode), cw = S.cw, ch = S.ch, n = C.length; if (!n) return '<div class="note">The hours of this forecast are not available.</div>';
    var Wd = n * cw, F = {}; ((B && B.days) || []).forEach(function (x) { F[x.date] = x; });
    var WI = windows(B), WM = {}; WI.forEach(function (w) { WM[w.start] = w; }); var CH = chance(B), pt = o.productType || 'product type not recorded', lab = label(o.registry);
    var days = [], hd = '', seps = '';
    C.forEach(function (h, i) { var dt = String(h.time).slice(0, 10); if (!days.length || days[days.length - 1].dt !== dt) days.push({ dt: dt, a: i, b: i }); else days[days.length - 1].b = i; });
    days.forEach(function (g, j) { var x = F[g.dt] || {}, w = (g.b - g.a + 1) * cw; if (j) seps += '<div class="hsSep" style="left:' + (g.a * cw) + 'px"></div>';
      hd += '<div class="hsDh" data-date="' + esc(g.dt) + '" style="left:' + (g.a * cw) + 'px;width:' + (w - 4) + 'px"><b>' + esc(g.dt === todayIso() ? 'Today' : dayLab(g.dt)) + '</b>' + (w >= 2 * cw ? '<span class="hsChip">\u2191 ' + esc(r0(x.tmaxC) || '\u2013') + '\u00b0 \u2193 ' + esc(r0(x.tminC) || '\u2013') + '\u00b0</span><span class="hsChip r" data-dayrain="' + esc(fin(x.rainMm) ? r1(x.rainMm) : '') + '">' + esc(fin(x.rainMm) ? r1(x.rainMm) + ' mm' : '\u2013') + '</span>' : '') + '</div>'; });
    var rows = '<div class="hsRow">' + C.map(function (h) { return '<div style="width:' + cw + 'px" data-t="' + esc(h.time) + '">' + esc(localHm(h.time)) + '</div>'; }).join('') + '</div>';
    rows += '<div class="hsRow">' + C.map(function (h) { return '<div style="width:' + cw + 'px">' + sky(h, B && B.point) + '</div>'; }).join('') + '</div>';
    /* temperature (corrected) and feels like on one chart */
    var T = C.map(function (h) { return fin(h.tempC) ? +h.tempC : null; }), Fl = C.map(function (h) { return fin(h.feelsC) ? +h.feelsC : null; }), all = T.concat(Fl).filter(function (v) { return v != null; });
    if (all.length) { var lo = Math.min.apply(null, all) - 2, hi = Math.max.apply(null, all) + 3, Y = function (v) { return 14 + (hi - v) / (hi - lo) * (ch - 30); }, X = function (i) { return i * cw + cw / 2; };
      var line = function (A) { var s = '', on = false; A.forEach(function (v, i) { if (v == null) { on = false; return; } s += (on ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); on = true; }); return s; };
      var pts = T.map(function (v, i) { return v == null ? null : [X(i), Y(v)]; }).filter(Boolean), area = pts.length > 1 ? 'M' + pts[0][0].toFixed(1) + ' ' + ch + 'L' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L') + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + ch + 'Z' : '';
      var g = '<path d="' + area + '" fill="#2F6468" fill-opacity=".08"/><path d="' + line(Fl) + '" fill="none" stroke="#C8781E" stroke-width="1.6" stroke-dasharray="4 3"/><path d="' + line(T) + '" fill="none" stroke="#2F6468" stroke-width="2.2" stroke-linejoin="round"/>';
      T.forEach(function (v, i) { if (v == null) return; g += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="2.6" fill="#2F6468"/>'; if (mode === '3' || +String(C[i].time).slice(11, 13) % 3 === 0) g += '<text class="hsT" x="' + X(i).toFixed(1) + '" y="' + (Y(v) - 7).toFixed(1) + '" text-anchor="middle">' + esc(r0(v)) + '\u00b0</text>'; });
      rows += '<div class="hsRow" style="height:' + ch + 'px"><svg width="' + Wd + '" height="' + ch + '" role="img" aria-label="Temperature (corrected) and feels like, \u00b0C, PKT">' + g + '</svg></div>'; }
    else rows += '<div class="hsRow" style="height:' + ch + 'px"><div class="small" style="width:' + Wd + 'px">No temperature for these hours.</div></div>';
    /* rain and its chance: 3-hour windows in every step */
    var segs = []; C.forEach(function (h) { var k = hsWin(h.time); if (!segs.length || segs[segs.length - 1].k !== k) segs.push({ k: k, n: 1 }); else segs[segs.length - 1].n++; });
    rows += '<div class="hsRow hsWinRow" id="hsRain">' + segs.map(function (s) { var w = WM[s.k], mm = w ? w.mm : null; return '<div style="width:' + (s.n * cw) + 'px" data-win="' + esc(s.k) + '" data-mm="' + (mm == null ? '' : mm) + '" title="Rain ' + esc(s.k.slice(11, 16)) + '\u2013' + esc(winEnd(s.k)) + ' PKT">' + (mm == null ? '<span class="z">\u2013</span>' : mm > 0 ? '<span class="w">' + esc(r1(mm)) + '</span>' : '<span class="z">\u00b7</span>') + '</div>'; }).join('') + '</div>';
    if (CH.st === 'limited') rows += '<div class="hsRow hsWinRow" id="hsChance" data-limited="1"><div style="width:' + Wd + 'px" title="' + esc(CH.why) + '"><span class="lim">' + esc(CH.why) + '</span></div></div>';
    else rows += '<div class="hsRow hsWinRow" id="hsChance">' + segs.map(function (s) { var r = CH.st === 'ok' ? CH.by[s.k] : null, p = r && fin(r.pRain) ? Math.round(100 * r.pRain) : null;
      return '<div style="width:' + (s.n * cw) + 'px" data-win="' + esc(s.k) + '" data-p="' + (p == null ? '' : p) + '" data-basis="' + (r && r.basis ? esc(r.basis) : '') + '" title="' + esc(chanceTitle(CH, r, p)) + '">' + chanceInner(CH, r, p) + '</div>'; }).join('') + '</div>';
    rows += '<div class="hsRow">' + C.map(function (h) { return '<div style="width:' + cw + 'px">' + esc(r0(h.windKmh) || '\u2013') + '</div>'; }).join('') + '</div>';
    rows += '<div class="hsRow">' + C.map(function (h) { var g2 = fin(h.gustKmh) ? +h.gustKmh : null; return '<div style="width:' + cw + 'px">' + (g2 == null ? '\u2013' : '<span class="g' + (g2 >= S.gustHi ? ' hi' : '') + '">' + esc(r0(g2)) + '</span>') + '</div>'; }).join('') + '</div>';
    var labs = '<div class="hsLab" aria-hidden="true"><div style="height:40px"></div><div>Time<small>PKT</small></div><div>Sky</div><div style="height:' + ch + 'px">Temp<small>\u00b0C</small></div><div>Rain<small>mm \u00b7 3 h</small></div><div>Chance<small>%' + (o.client ? '' : ' (' + esc(lab) + ')') + '</small></div><div>Wind<small>km/h</small></div><div>Gusts<small>km/h</small></div></div>';
    return '<div class="hsWrap" id="hStrip">' + labs + '<div class="hsScroll" tabindex="0" aria-label="Hour by hour, scroll sideways for more hours"><div class="hsIn" style="width:' + Wd + 'px"><div class="hsDays">' + hd + '</div>' + seps + rows + '</div></div></div>'
      + '<div class="hsLeg small"><span><i></i>Temperature (corrected)</span><span><i class="d"></i>Feels like</span><span>gusts of ' + S.gustHi + ' km/h and above highlighted</span></div>'
      + '<div class="small" id="hsChanceNote">Rain and chance of rain are for 3-hour windows (PKT). ' + (o.client ? 'Chance of rain: the chance of at least ' + (CH.tau != null ? esc(CH.tau) + ' mm' : 'a wet window') + ' in the window' : 'Chance of rain (' + esc(lab) + '): the share of the ensemble members with at least ' + (CH.tau != null ? esc(CH.tau) + ' mm' : 'the wet threshold') + ' in the window' + (String(pt).toLowerCase().indexOf(String(lab).toLowerCase()) < 0 ? ' \u00b7 ' + esc(pt) : ''))   /* v91.17.283.37 · o.client: no method words on a client screen */
      + (CH.st === 'ok' && Object.keys(CH.by).some(function (k) { return CH.by[k].screening; }) ? ' \u00b7 slanted: screening fallback (no ensemble members for that window)' : '') + (CH.st === 'limited' ? ' \u00b7 ' + esc(CH.why) : '') + '.</div>'; }
  function box(B, o) { o = o || {}; var mode = o.mode || '3', b = '<div id="hsBox" data-mode="' + mode + '">';
    b += '<div class="hsRes" role="group" aria-label="Step of the strip">' + [['3', '3 h', ''], ['1', '1 h', ''], ['15', 'now (15 min)', 'only real 15-minute values: the provider\u2019s 15-minute rain now and the nearest AGN station\u2019s reading']].map(function (x) { return '<button type="button" data-hs="' + x[0] + '" aria-pressed="' + (mode === x[0]) + '"' + (x[2] ? ' title="' + esc(x[2]) + '"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>';
    return '<div class="agnhs">' + (o.title !== false ? '<h2 class="hsTitle">Next 4 days, hour by hour</h2><div class="small" id="hsLine">' + (o.client ? 'Forecast for this point' + (B && B.issuedAt && pktHm(B.issuedAt) ? ', updated ' + esc(pktHm(B.issuedAt)) + ' PKT' : '') : 'Corrected NIGRAAN forecast for this point' + (B && B.issuedAt && pktHm(B.issuedAt) ? ' (run of ' + esc(pktHm(B.issuedAt)) + ' PKT)' : '')) + '. Scroll sideways for more hours.</div>' : '')
      + b + (mode === '15' ? nowList(B) : strip(B, mode, o)) + '</div></div>'; }
  /* the step buttons of a drawn box: the box is drawn again in place with the new step (no request) */
  function wire(root, getB, o) { if (!root) return; o = o || {};
    Array.prototype.forEach.call(root.querySelectorAll('#hsBox [data-hs]'), function (b) { b.onclick = function () { o.mode = b.getAttribute('data-hs'); var x = root.querySelector('.agnhs'), B = getB();
      if (x && B) { var sc = x.querySelector('.hsScroll'), sl = sc ? sc.scrollLeft : 0; x.outerHTML = box(B, o); var s2 = root.querySelector('.agnhs .hsScroll'); if (s2 && sl) s2.scrollLeft = sl; wire(root, getB, o); if (o.onDraw) try { o.onDraw(); } catch (_) {} } }; }); }
  /* the window cells of an hourly table: per listed hour time, whether it opens a window run in the list (first), how many listed hours
     the run holds (span), and the cell content (rain mm of the 3-hour window and its chance) */
  function cells(B, times, o) { o = o || {}; var WM = {}; windows(B).forEach(function (w) { WM[w.start] = w; }); var CH = chance(B), out = [];
    var cur = null;
    (times || []).forEach(function (t) { var k = hsWin(t); if (cur && k === cur.key) { cur.span++; out.push({ key: k, first: false }); return; }
      var w = WM[k], r = CH.st === 'ok' ? CH.by[k] : null, p = r && fin(r.pRain) ? Math.round(100 * r.pRain) : null, mm = w ? w.mm : null;
      var c = { key: k, first: true, span: 1, mm: mm, p: p, limited: CH.st === 'limited', screening: !!(r && r.screening), tau: CH.tau,
        rainHtml: mm == null ? '<span class="z">\u2013</span>' : mm > 0 ? esc(r1(mm)) + ' mm' : '<span class="z">0 mm</span>',
        chanceHtml: CH.st === 'limited' ? '<span class="lim">' + esc(CH.why) + '</span>' : chanceInner(CH, r, p) + (p != null ? '<span class="' + (p > 0 ? '' : 'z') + '"> %</span>' : ''),
        title: 'Rain ' + k.slice(11, 16) + '\u2013' + winEnd(k) + ' PKT; chance of rain (' + label(o.registry) + '): ' + chanceTitle(CH, r, p) };
      cur = c; out.push(c); });
    return out; }
  W.AGNHourStrip = { version: '91.17.283.23', box: box, wire: wire, windows: windows, chance: chance, cells: cells, label: label, win: hsWin, winEnd: winEnd, css: css };
})(window);
