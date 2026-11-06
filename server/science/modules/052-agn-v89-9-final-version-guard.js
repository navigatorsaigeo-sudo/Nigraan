


(function(G){
  'use strict';
  var AGN = G.AGN = G.AGN || {};
  var VERSION = G.AGN_VERSION || 'version-unset';    
  

  

  var CHANNEL = (G.AGN_BUILD && G.AGN_BUILD.channel) || 'channel-unset';
  var RELEASE = Object.freeze({
    version: VERSION,
    channel: CHANNEL,
    builtAt: '2026-09-08',
    note: 'v89.44a scientific correction (acceptance-audit closure): per-quantile Monte Carlo censoring honoured by every renderer including the report and the histogram marks; the barrage popup quotes the coefficient the correction actually applies; the seismic and cyclone map legends no longer describe engines that were replaced; portfolio currency ingested, validated and never guessed; precipitation carries an accumulation-aware null model and a declared no-native-sub-hourly contract; seismic published as a BCP zone category with an evidence class in place of a fabricated confidence percentage; the printed Fisher width corrected. Preceding v89.44 correction: fourteen source-level defects closed after a '
        + 'two-board audit. Rainfall is no longer synthesised from humidity and a refused '
        + 'hazard no longer reads as zero; driver labels and values come from one object; '
        + 'null no longer becomes a number in real-estate screening; GLOF declares its '
        + 'rainfall input; recent seismicity is reported beside the seismic score and no '
        + 'longer added to it; the seismic evidence declaration states what actually runs; '
        + 'each Monte Carlo quantile is censored at its own ceiling tolerance; models=era5 '
        + 'is pinned at every archive call and the lag figure measured against an unpinned '
        + 'request is withdrawn; an unlicensed route refuses instead of downgrading; the '
        + 'portfolio export is complete; the three hazards with no methods '
        + 'card have one; and every model declares its native resolution so the effective '
        + 'figure is computed rather than asserted. No calibration constant was changed.'
  });
  

  try {
    if (AGN.release && AGN.release.metadata) {
      AGN.release.metadata.version = RELEASE.version;
      AGN.release.metadata.channel = RELEASE.channel;
      try { Object.freeze(AGN.release.metadata); } catch (_) {}
      AGN.release.current = RELEASE;              
    } else {
      AGN.release = { metadata: RELEASE, current: RELEASE,
                      snapshot: function(){ return JSON.parse(JSON.stringify(RELEASE)); } };
    }
  } catch (_) {}
  try { AGN.version = RELEASE.version; } catch (_) {}
  try { if (G.AGN_BUILD) { G.AGN_BUILD.version = RELEASE.version; G.AGN_BUILD.channel = RELEASE.channel; } } catch (_) {}

  function applyOnce(){
    try {
      var m = document.querySelector('meta[name="agn-release"]');
      if (m) m.setAttribute('content', RELEASE.version + ';' + RELEASE.channel + ';' + RELEASE.builtAt);
    } catch (_) {}
    try { document.documentElement.setAttribute('data-agn-release', RELEASE.version); } catch (_) {}
    try { document.documentElement.setAttribute('data-agn-channel', RELEASE.channel); } catch (_) {}
    

    try {
      if (AGN.versionAudit) {
        var d = AGN.versionAudit();
        if (d && d.length && G.console) console.warn('[AGN release audit] ' + d.length + ' surface(s) disagree with ' + RELEASE.version, d);
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyOnce);
  else applyOnce();
})(window);
