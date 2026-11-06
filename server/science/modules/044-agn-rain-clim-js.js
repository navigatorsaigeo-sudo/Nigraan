

(function (G) {
  'use strict';
  var AGN = G.AGN = G.AGN || {};
  var T = null, META = null;

  function load() {
    if (T) return T;
    var el = document.getElementById('agn-rain-clim');
    if (!el) throw new Error('AGN.rainClim: payload missing');
    META = JSON.parse(el.textContent);
    T = META.t;
    return T;
  }

   
  function rowFor(key, month) {
    load();
    var e = T[key]; if (!e) return null;
    if (month == null) return e[1];
    var m = e[0][Math.max(0, Math.min(11, month))];
    return m || null;
  }

   
  function classify(key, mmDay, month) {
    var r = rowFor(key, month);
    if (!r) return { known: false, reason: 'no climatology for this unit' };
    

    var ref = 'month', nWet = null, minWet = null;
    try {
      if (month != null) {
        var mi = Math.max(0, Math.min(11, month));
        var yrs = +((String((META && META.period) || '').match(/\((\d+)\s*y\)/) || [])[1]);
        minWet = (typeof G.FR === 'function') ? Number(G.FR('rain_local.monthMinWetDays')) : NaN;
        nWet = (Number(r[0]) || 0) * [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mi] * yrs;
        var an = T[key] && T[key][1];
        if (isFinite(nWet) && isFinite(minWet) && minWet > 0 && an && an[4] != null && an[5] != null
            && (r[4] == null || r[5] == null || nWet < minWet)) { r = an; ref = 'annual'; }
      }
    } catch (_) { ref = 'month'; }
    var wetFrac = r[0], p50 = r[1], p90 = r[2], p95 = r[3], p99 = r[4], mx = r[5];
    if (p99 == null || mx == null) {
      return { known: false, reason: 'too few wet days in this month to form a distribution',
               wetFrac: wetFrac };
    }
    var band, rank;
    if (mmDay < 1.0)      { band = 'dry';            rank = 0; }
    else if (mmDay > mx)  { band = 'above 20-yr max'; rank = 100; }
    else if (mmDay >= p99){ band = '>=p99';          rank = 90; }
    else if (mmDay >= p95){ band = 'p95-p99';        rank = 75; }
    else if (mmDay >= p90){ band = 'p90-p95';        rank = 50; }
    else if (mmDay >= p50){ band = 'p50-p90';        rank = 25; }
    else                  { band = '<p50';           rank = 8; }
    var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return { known: true, band: band, rank: rank, mmDay: mmDay,
             p50: p50, p90: p90, p95: p95, p99: p99, max20y: mx, wetFrac: wetFrac,
             reference: (month == null) ? 'annual' : ref, monthWetDays: (nWet == null || !isFinite(nWet)) ? null : Math.round(nWet), minWetDays: (isFinite(minWet) ? minWet : null),
             basis: 'global reanalysis 2005-2024 wet-day distribution, ' + (month == null ? 'annual'
               : (ref === 'annual' ? 'annual (' + MON[month] + ' holds ' + Math.round(nWet) + ' wet days in the record, fewer than the ' + minWet + ' a monthly rank needs)'
                                   : MON[month]))
               + ', daily depths only' };
  }

  

  function forUnit(key, dayIndex) {
    var D = G.DISTRICT_IN || {}, row = D[key];
    if (!row || !Array.isArray(row.days) || !row.days.length) {
      return { known: false, reason: 'no forecast days for this unit' };
    }
    var d = row.days[Math.max(0, Math.min(row.days.length - 1, dayIndex || 0))];
    if (!d || d.precip == null) return { known: false, reason: 'no daily precipitation value' };
    var mon = d.date ? (+String(d.date).slice(5, 7) - 1) : (new Date()).getMonth();
    var c = classify(key, Number(d.precip), mon);
    c.date = d.date; return c;
  }

  AGN.rainClim = {
    classify: classify, forUnit: forUnit, row: rowFor,
    meta: function () { load(); return { v: META.v, src: META.src, period: META.period,
      wetThresh: META.wetThresh, units: Object.keys(T).length }; },
    coverage: function () { load(); return Object.keys(T).length; },
    limits: [
      'global reanalysis, not CHIRPS or gauge: understates convective extremes.',
      'Daily depths only — never apply to an hourly mm/h rate.',
      '20 years supports p95 well and p99 weakly; rarer events are reported as ' +
        'above the 20-year maximum rather than extrapolated.'
    ]
  };
})(window);
