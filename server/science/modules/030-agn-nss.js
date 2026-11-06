

(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

   
  var _SOIL = null;
  function _soilFor(district) {
    if (_SOIL === null) {
      try {
        var el = document.getElementById('agn-soil');
        _SOIL = el ? (JSON.parse(el.textContent).d || {}) : {};
      } catch (_) { _SOIL = {}; }
    }
    return district ? (_SOIL[district] || null) : null;
  }

  

  var _FCWP = {};
  function _fcwpFor(district) {
    if (!district) return null;
    if (Object.prototype.hasOwnProperty.call(_FCWP, district)) return _FCWP[district];
    var t = _soilFor(district);
    if (!t || !isFinite(t[0]) || !isFinite(t[1])) { _FCWP[district] = null; return null; }
    var C = t[0] / 100, S = t[1] / 100, OM = 0.8;
    var t15 = -0.024 * S + 0.487 * C + 0.006 * OM + 0.005 * (S * OM) - 0.013 * (C * OM) + 0.068 * (S * C) + 0.031;
    var wp = t15 + (0.14 * t15 - 0.02);
    var t33 = -0.251 * S + 0.195 * C + 0.011 * OM + 0.006 * (S * OM) - 0.027 * (C * OM) + 0.452 * (S * C) + 0.299;
    var fc = t33 + (1.283 * t33 * t33 - 0.374 * t33 - 0.015);
    if (!(fc > wp) || !(wp > 0) || fc > 0.7) { _FCWP[district] = null; return null; }
    var r = { fc: Math.round(fc * 1000) / 1000, wp: Math.round(wp * 1000) / 1000,
              clayPct: t[0], sandPct: t[1], texture: t[3],
              basis: 'Saxton & Rawls (2006) pedotransfer on ISRIC SoilGrids texture for ' + district
                   + ' (' + t[3] + ', ' + t[0] + '% clay, ' + t[1] + '% sand), organic matter declared at 0.8%' };
    _FCWP[district] = r; return r;
  }
  try { G.AGN.soilWater = { fcwp: _fcwpFor, texture: _soilFor }; } catch (_) {}

  

  function _cnFromTexture(row, clayPct) {
    if (clayPct == null) return null;
    var cols = ['A', 'B', 'C', 'D'];
    var p = Math.max(0, Math.min(1, (clayPct - 10) / (45 - 10))) * (cols.length - 1);
    var i = Math.min(cols.length - 2, Math.floor(p)), f = p - i;
    var lo = row[cols[i]], hi = row[cols[i + 1]];
    if (lo == null || hi == null) return null;
    return lo + (hi - lo) * f;
  }

  var NSS_CONFIG = {
    methodVersion: 'nss-1.0.0',
    lambda: 0.20,
    lambdaLocked: true,
    pRefPK: 100,           
    pRefIntl: 50,          
     
    cn2: {
      trees:  { A:30, B:55, C:70, D:77 },
      grass:  { A:49, B:69, C:79, D:84 },
      shrub:  { A:36, B:60, C:73, D:79 },
      crops:  { A:67, B:78, C:85, D:89 },
      bare:   { A:77, B:86, C:91, D:94 },
      built:  { A:98, B:98, C:98, D:98 }
    },
     
    hsgProxy: {
      arid_plains:      'B',   
      irrigated_plains: 'C',   
      rainfed:          'C',
      highland:         'C',
      high_mountain:    'D'    
    },
     
    perviousRemainder: {
      arid_plains:      'bare',
      irrigated_plains: 'crops',
      rainfed:          'crops',
      highland:         'grass',
      high_mountain:    'shrub'
    },
     
    fSlope: [[2,1.00],[5,0.95],[10,0.90],[20,0.80],[30,0.70],[1e9,0.60]],
    

    arcSpan: { dryMult: 1.00, wetMult: 1.00 },
     
    amcBandMm: [36, 53],
    saturationWarnShare: 0.35
  };
  G.NSS_CONFIG = NSS_CONFIG;

   
  function S_mm(cn) { return 25400 / cn - 254; }
  

  function runoff(P, cn, lambda, fSlope) {
    var lam = (lambda == null) ? NSS_CONFIG.lambda : lambda;
    var f = (fSlope == null || !(fSlope > 0)) ? 1 : fSlope;
    var s = S_mm(cn) * f, Ia = lam * s;
    return (P <= Ia) ? 0 : Math.pow(P - Ia, 2) / (P + (1 - lam) * s);
  }
  function retentionRatio(P, cn, lambda, fSlope) {
    if (!(P > 0)) return 0;
    return Math.max(0, Math.min(1, (P - runoff(P, cn, lambda, fSlope)) / P));
  }
  

  function cn005From020(cn020) {
    return 100 / (1.879 * Math.pow(100 / cn020 - 1, 1.15) + 1);
  }
  

  

  function arcPos(api) {
    if (api == null || !isFinite(api)) return 0.5;
    var mm = Math.max(0, api) * ((G.AGN_WETNESS_CFG && G.AGN_WETNESS_CFG.API_CAP) || 120);
    var lo = NSS_CONFIG.amcBandMm[0], hi = NSS_CONFIG.amcBandMm[1];
    

    if (mm <= hi) return 0.5;
    return Math.min(1, 0.5 + 0.5 * (mm - hi) / hi);
  }
  function cnArc(cn2, api) {
    var cn1 = cn2 / (2.281 - 0.01281 * cn2);
    var cn3 = cn2 / (0.427 + 0.00573 * cn2);
    var a = arcPos(api);
    return (a <= 0.5) ? cn1 + (cn2 - cn1) * (a / 0.5)
                      : cn2 + (cn3 - cn2) * ((a - 0.5) / 0.5);
  }
  function fSlopeFor(slopePct) {
    var t = NSS_CONFIG.fSlope;
    for (var i = 0; i < t.length; i++) if (slopePct <= t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  }
   
  function saturationCN(P, lambda) {
    var lam = (lambda == null) ? NSS_CONFIG.lambda : lambda;
    return 25400 / (P / lam + 254);
  }

   
  

  var _UIDX = null;
  function _uidFor(tehsilKey) {
    if (!_UIDX) {
      _UIDX = {};
      try {
        ((G.PK_DISTRICTS && G.PK_DISTRICTS.features) || []).forEach(function (x) {
          var p = x.properties || {};
          if (p.key && p.uid) _UIDX[p.key] = p.uid;
        });
      } catch (_) { _UIDX = {}; }
    }
    return _UIDX[tehsilKey] || null;
  }

  

  var COVER_TALLY = { observed: 0, noBuiltFallback: 0, trueNoData: 0, ambiguous: 0 };
  function _tally(k) { COVER_TALLY[k] = (COVER_TALLY[k] || 0) + 1; }

  function coverFor(tehsil, district, zone) {
    var rec = null;
    

    try {
      var uidW = _uidFor(tehsil);
      var WT = G.LANDCOVER_TEHSIL;
      if (uidW && WT && WT.ready && WT.units && WT.units[uidW] && WT.units[uidW].cn) {
        var cw = WT.units[uidW].cn, land = 1 - (cw.water || 0);
        if (land > 0.2) {
          var fW = {}; ['trees', 'shrub', 'grass', 'crops', 'bare', 'built'].forEach(function (k) { var v = (cw[k] || 0) / land; if (v > 0.0005) fW[k] = Math.round(v * 10000) / 10000; });
          _tally('observed');
          return { ok: true, fractions: fW, remainderClass: null, fallback: false, measured: true, waterShare: cw.water || 0,
                   status: 'worldcover', source: 'ESA WorldCover 2021 class shares (10 m, read at 160 m)',
                   landCoverBasis: 'ESA WorldCover 2021 measured class shares: tree, shrub, grass, crop, bare, built',
                   landCoverConfidence: 'B', treeObserved: true,
                   note: 'every class measured; water and wetland (' + Math.round((cw.water || 0) * 100) + '%) excluded from the runoff score; built at 10 m taken as sealed' };
        }
      }
    } catch (_) {}

    

    try {
      var uid = _uidFor(tehsil);
      if (uid && G.AGN.lcz && G.AGN.lcz.byUid) rec = G.AGN.lcz.byUid(uid);
    } catch (_) {}
    if (!rec) {
      try { rec = G.AGN.lcz ? G.AGN.lcz.tehsil(tehsil, district) : null; } catch (_) {}
      if (rec && rec.ambiguous) rec = null;
    }

     
    if (!rec) { _tally('trueNoData');
      return { ok: false, reason: 'no LCZ record for this unit',
               landCoverBasis: 'none', landCoverConfidence: 'no-data' }; }
    if (rec.ambiguous) { _tally('ambiguous');
      return { ok: false, reason: 'ambiguous tehsil identification — pass district',
               landCoverBasis: 'none', landCoverConfidence: 'no-data' }; }
    if (rec.status === 'no_lcz_coverage') { _tally('trueNoData');
      return { ok: false, reason: 'no_lcz_coverage — no land-cover raster over this unit',
               landCoverBasis: 'none', landCoverConfidence: 'no-data' }; }

    var restClass = NSS_CONFIG.perviousRemainder[zone] || 'crops';

    

    if (rec.status === 'no_built_area' || rec.bf == null) {
      var treeNB = (rec.tree != null) ? Math.max(0, Math.min(1, rec.tree)) : 0;
      var fNB = { built: 0, trees: treeNB };
      fNB[restClass] = (fNB[restClass] || 0) + Math.max(0, 1 - treeNB);
      _tally('noBuiltFallback');
      return { ok: true, fractions: fNB, remainderClass: restClass,
               status: rec.status || 'no_built_area',
               fallback: true,
               source: 'No built LCZ detected; natural cover represented by zone fallback',
               landCoverBasis: 'No built LCZ detected; natural cover represented by zone fallback',
               landCoverConfidence: 'D',
               treeObserved: (rec.tree != null),
               note: 'built and impervious set to 0 from the observed absence of built cells; '
                   + 'the remaining ' + Math.round((1 - treeNB) * 100) + '% is ASSUMED to be '
                   + restClass + ' from the agro-climatic zone, not measured' };
    }

    

    /* v91.17.283.10 · SEALED SHARE OF THE BUILT LCZ CELLS = ROOFS + PAVING. Until v283.9 this was bf x isf: the roofs (building
       surface fraction, bsf) were dropped, so Lahore City read 12 % sealed and Gulberg Town (Karachi) 42 %, and the remainder of
       the built cells was given the agro-climatic zone class (crops). Stewart & Oke (2012, BAMS 93:1879, Table 3) split an LCZ
       cell into building surface + impervious (paved) surface + pervious surface fractions; the tehsil record carries the first
       two (class midpoints, data/lcz-grid.json ucp_source), so the pervious part of a built cell is 1 - bsf - isf. Its cover is
       the class's own (S&O 2012 Table 2 land-cover descriptions): LCZ 4, 5, 6, 9 "abundance of pervious land cover (low plants,
       scattered trees)" -> grass; LCZ 1, 2, 3, 7, 8, 10 "few or no trees, land cover mostly paved / hard-packed" -> bare.
       Only the non-built share (1 - bf) takes the observed trees (LCZ 11 + 0.5 x LCZ 12) and the zone remainder.
       Held-out check (REPORT.md T1-A, pre-registered): against ESA WorldCover 2021 10 m built share (not an input here) the
       mean absolute error of the sealed share on the 22 LCZ 1-3 tehsils fell from 0.261 to 0.038, and on all 553 from 0.028 to 0.022. */
    var LCZ_PERVIOUS = { 1: 'bare', 2: 'bare', 3: 'bare', 4: 'grass', 5: 'grass', 6: 'grass', 7: 'bare', 8: 'bare', 9: 'grass', 10: 'bare' };
    var bf   = Math.max(0, Math.min(1, rec.bf || 0));
    var sealedInBuilt = Math.max(0, Math.min(1, (rec.bsf || 0) + (rec.isf || 0)));
    var imp  = bf * sealedInBuilt;
    var urbanPervious = Math.max(0, bf - imp);
    var urbanClass = LCZ_PERVIOUS[rec.lcz] || 'grass';
    var tree = Math.max(0, Math.min(1 - bf, rec.tree || 0));
    var rest = Math.max(0, 1 - bf - tree);
    var f = { built: imp, trees: tree };
    if (urbanPervious > 0) f[urbanClass] = (f[urbanClass] || 0) + urbanPervious;
    if (rest > 0) f[restClass] = (f[restClass] || 0) + rest;
    _tally('observed');
    return { ok: true, fractions: f, remainderClass: restClass, fallback: false,
             builtShare: bf, sealedInBuilt: sealedInBuilt, urbanPerviousClass: urbanClass, urbanPerviousShare: urbanPervious,
             source: 'WUDAPT/LCZ tehsil morphology', status: rec.status || 'ok',
             landCoverBasis: 'WUDAPT/LCZ observed morphology: sealed = built share x (building + impervious surface fraction), '
                           + 'the pervious part of the built cells ' + urbanClass + ' (Stewart & Oke 2012), the rest of the unit '
                           + restClass + ' from the agro-climatic zone',
             landCoverConfidence: 'C' };
  }

  

  function coverageReport(quiet) {
    var out = { observed: 0, noBuiltFallback: 0, trueNoData: 0, ambiguous: 0,
                total: 0, units: { trueNoData: [], ambiguous: [], noBuiltFallback: [] } };
    var keys = [];
    try { keys = Object.keys(G.DISTRICT_IN || {}); } catch (_) {}
    keys.forEach(function (k) {
      out.total++;
      var zone = 'irrigated_plains', d = null;
      try { if (typeof G.hzTerrainFor === 'function') { var t = G.hzTerrainFor(k); if (t && t.zone) zone = t.zone; } } catch (_) {}
      try { if (typeof G.PK_KEY_TO_DISTRICT !== 'undefined') d = G.PK_KEY_TO_DISTRICT[k]; } catch (_) {}
      var c = coverFor(k, d, zone);
      if (!c.ok) {
        if (/ambiguous/.test(c.reason || '')) { out.ambiguous++; out.units.ambiguous.push(k); }
        else { out.trueNoData++; out.units.trueNoData.push(k); }
      } else if (c.fallback) { out.noBuiltFallback++; out.units.noBuiltFallback.push(k); }
      else out.observed++;
    });
    if (!quiet) {
      try {
        console.info('NSS coverage:\n  observed LCZ: ' + out.observed
          + '\n  no-built fallback: ' + out.noBuiltFallback
          + '\n  true no-data: ' + out.trueNoData
          + (out.units.trueNoData.length ? ' (' + out.units.trueNoData.join(', ') + ')' : '')
          + '\n  ambiguous: ' + out.ambiguous);
      } catch (_) {}
    }
    return out;
  }

   
  

  var SP_COVERS = ['trees', 'shrub', 'grass', 'crops', 'bare', 'built'], SP_HSG = ['A', 'B', 'C', 'D'];
  function spongeFor(tehsil) {
    try { var T = G.SPONGE_TEHSIL; if (!T || !T.ready || !T.units) return null; return T.units[tehsil] || null; } catch (_) { return null; }
  }
  function scoreSponge(sp, api, stormP) {
    var Fs = (G.SPONGE_TEHSIL && G.SPONGE_TEHSIL.fSlope) || [1, 0.95, 0.9, 0.8, 0.7, 0.6];
    function evaluate(P, useApi) {
      var q = 0, cnW = 0, satArea = 0, fW = 0;
      sp.bins.forEach(function (b) {
        var k = SP_COVERS[b[0]], a = b[3]; if (!(a > 0) || !k) return;
        var cn2 = NSS_CONFIG.cn2[k][SP_HSG[b[1]] || 'C'], F = Fs[b[2]] || 1;
        var cn = (k === 'built') ? 98 : (useApi ? cnArc(cn2, api) : cn2);
        cnW += a * cn; fW += a * F;
        q += a * ((k === 'built') ? P : runoff(P, cn, null, F));
        if (k !== 'built' && cn <= saturationCN(P)) satArea += a;
      });
      var ret = P - q;
      return { retentionMm: ret, runoffMm: q, score: Math.round(ret / P * 100), satShare: satArea, cnAreaWeighted: +cnW.toFixed(1), fMean: fW };
    }
    return { evaluate: evaluate };
  }
   
  function equivalentS(P, Q) {
    if (!(P > 0) || Q == null) return null; var q = Math.max(1e-3, Math.min(P - 1e-3, Q));
    var A = 0.04, B = -(0.4 * P + 0.8 * q), C = P * P - P * q, d = B * B - 4 * A * C; if (d < 0) d = 0;
    return (-B - Math.sqrt(d)) / (2 * A);
  }
  G.AGN_SPONGE_CLASSES = { edgesCN: [94.5, 88, 82, 74.5], words: ['Sealed: runs off like pavement', 'Runs off like bare ground', 'Like cropland', 'Like grassland', 'Absorbs like woodland'],
    basis: 'equivalent curve number between the NRCS reference covers of soil group C (sealed 98, bare 91, crops 85, grass 79, woodland 70), edges at the midpoints' };
  function spongeClass(S) { if (S == null || !isFinite(S)) return null; var cn = 25400 / (S + 254), E = G.AGN_SPONGE_CLASSES.edgesCN;
    for (var i = 0; i < E.length; i++) if (cn >= E[i]) return i; return E.length; }
  function score(tehsil, district, zone, slopePct, api, stormP) {
    var _sp = spongeFor(tehsil);
    if (_sp && _sp.bins && _sp.bins.length) return scoreFromSponge(_sp, api, stormP);
    var cov = coverFor(tehsil, district, zone);
    if (!cov.ok) {
      return { ok: false, reason: cov.reason, confidence: 'no-data',
               methodVersion: NSS_CONFIG.methodVersion };
    }
    

    var soilRec = _soilFor(district), hsg, hsgBasis, texture = null, clayPct = null;
    if (soilRec) {
      clayPct = soilRec[0]; texture = soilRec[3]; hsg = soilRec[4];
      hsgBasis = 'SoilGrids ' + texture + ' (clay ' + soilRec[0] + '%, sand ' + soilRec[1] + '%)';
    } else {
      hsg = NSS_CONFIG.hsgProxy[zone] || 'C';
      hsgBasis = 'zone proxy — SoilGrids masks built-up land here';
    }
    var F   = fSlopeFor(slopePct == null ? 0 : slopePct);

    function evaluate(P, useApi) {
      var retMm = 0, satArea = 0, cnW = 0;
      Object.keys(cov.fractions).forEach(function (k) {
        var a = cov.fractions[k]; if (!(a > 0)) return;
        var _row = NSS_CONFIG.cn2[k];
        var _interp = (clayPct != null) ? _cnFromTexture(_row, clayPct) : null;
        var cn2 = (_interp != null) ? _interp : _row[hsg];
        var cn  = (k === 'built') ? cn2 : (useApi ? cnArc(cn2, api) : cn2);    
        cnW += a * cn;
        

        

        var r = (k === 'built') ? 0 : retentionRatio(P, cn, null, F);
        retMm += a * r * P;
        if (k !== 'built' && cn <= saturationCN(P)) satArea += a;
      });
      return { retentionMm: retMm, runoffMm: P - retMm,
               score: Math.round(retMm / P * 100),
               satShare: satArea, cnAreaWeighted: +cnW.toFixed(1) };
    }

    var bPK = evaluate(NSS_CONFIG.pRefPK, false);
    var dPK = evaluate(NSS_CONFIG.pRefPK, true);
    var bIN = evaluate(NSS_CONFIG.pRefIntl, false);
    var dIN = evaluate(NSS_CONFIG.pRefIntl, true);
    

    var pStorm = (stormP != null && isFinite(stormP) && stormP > 0)
                   ? Math.min(500, Math.max(1, stormP)) : null;
    var bST = pStorm ? evaluate(pStorm, false) : null;
    var dST = pStorm ? evaluate(pStorm, true)  : null;

     
    

    var soilConfidence = (clayPct != null) ? 'C' : 'D';
    var landConfidence = cov.landCoverConfidence || 'C';
    var _rank = { A: 4, B: 3, C: 2, D: 1 };
    var confidence = (_rank[landConfidence] <= _rank[soilConfidence]) ? landConfidence : soilConfidence;
    var reasons = [];
    reasons.push((clayPct != null)
      ? 'soil: SoilGrids ' + texture + ' converted to HSG ' + hsg + ' via the USDA texture triangle'
      : 'soil: hydrologic soil group PROXIED from agro-climatic zone (SoilGrids masks built-up land here)');
    reasons.push('land cover: ' + (cov.landCoverBasis || 'WUDAPT/LCZ observed morphology'));
    if (cov.fallback && cov.note) reasons.push(cov.note);
    if (cov.status !== 'ok') reasons.push('land-cover status: ' + cov.status);
    if (api == null) reasons.push('no antecedent index — dynamic score omitted');
    if (bPK.satShare > NSS_CONFIG.saturationWarnShare)
      reasons.push('low discrimination: ' + Math.round(bPK.satShare * 100)
                   + '% of area saturates the 0-100 score at 100 mm — read the depth, not the score');

    return {
      ok: true, methodVersion: NSS_CONFIG.methodVersion,
       
      retentionMm: +bPK.retentionMm.toFixed(1),
      dynamicRetentionMm: (api == null) ? null : +dPK.retentionMm.toFixed(1),
       
      bnss: bPK.score, dnss: (api == null) ? null : dPK.score,
      bnss50: bIN.score, dnss50: (api == null) ? null : dIN.score,
      depletion: (api == null) ? null : bPK.score - dPK.score,
      runoffMm: +bPK.runoffMm.toFixed(1),
      dynamicRunoffMm: (api == null) ? null : +dPK.runoffMm.toFixed(1),
       
      runoffCoefficient: +(dPK.runoffMm / NSS_CONFIG.pRefPK).toFixed(3),
      baselineRunoffCoefficient: +(bPK.runoffMm / NSS_CONFIG.pRefPK).toFixed(3),
       
      pRefPK: NSS_CONFIG.pRefPK, pRefIntl: NSS_CONFIG.pRefIntl,
      lambda: NSS_CONFIG.lambda, lambdaLocked: NSS_CONFIG.lambdaLocked,
      hsg: hsg, hsgBasis: hsgBasis, soilTexture: texture, clayPct: clayPct,
      cnBasis: (clayPct != null) ? 'texture-interpolated across NRCS A-D columns'
                                 : 'tabulated NRCS column for HSG ' + hsg,
      fSlope: F, slopePct: slopePct,
      

      stormP: pStorm,
      stormRetentionMm:        bST ? +bST.retentionMm.toFixed(1) : null,
      stormRunoffMm:           bST ? +bST.runoffMm.toFixed(1)    : null,
      stormDynamicRetentionMm: (dST && api != null) ? +dST.retentionMm.toFixed(1) : null,
      stormDynamicRunoffMm:    (dST && api != null) ? +dST.runoffMm.toFixed(1)    : null,
      stormRetentionPct:       bST ? Math.round(bST.retentionMm / pStorm * 100) : null,
      stormDynamicRetentionPct:(dST && api != null) ? Math.round(dST.retentionMm / pStorm * 100) : null,
       
       
      landCoverBasis: cov.landCoverBasis || 'WUDAPT/LCZ observed morphology',
      landCoverConfidence: landConfidence,
      landCoverFallback: !!cov.fallback,
      landCoverStatus: cov.status,
      treeObserved: (cov.treeObserved !== undefined) ? cov.treeObserved : true,
      soilBasis: hsgBasis, soilConfidence: soilConfidence,
      

      imperviousFraction: (cov.fractions.built==null ? null : +Number(cov.fractions.built).toFixed(3)),
      treeFraction:       (cov.fractions.trees==null ? null : +Number(cov.fractions.trees).toFixed(3)),   /* v91.17.283.10: the cover key is 'trees' */
      coverFractions: cov.fractions, coverStatus: cov.status,
      cnBaseline: bPK.cnAreaWeighted,
      cnDynamic:  (api == null) ? null : dPK.cnAreaWeighted,
      api: api, apiLabel: (window.AGN && AGN.wetness) ? AGN.wetness.label(api) : null,
      cnAreaWeighted: dPK.cnAreaWeighted,
      cnAreaWeightedNote: 'diagnostic only — averaging CN before runoff is not pixel-first',
      saturationShare: +bPK.satShare.toFixed(2),
      saturationCN100: +saturationCN(100).toFixed(1),
      saturationCN50: +saturationCN(50).toFixed(1),
      cover: cov.fractions, coverSource: cov.source,
      remainderClass: cov.remainderClass,
      

      terrainCeiling: 100,
      terrainStorageFactor: Math.round(F * 100) / 100,
      terrainStorageNote: 'slope scales the potential maximum retention S by ' + (Math.round(F * 100) / 100)
        + ' inside the SCS equation. Before v91.17.4 this factor was applied to the retention RATIO afterwards, which manufactured (1 - F) x P of runoff on storms the equation said produced none and capped the score at ' + Math.round(F * 100) + '/100.',
      confidence: confidence, confidenceReasons: reasons
    };
  }

  function scoreFromSponge(sp, api, stormP) {
    var E = scoreSponge(sp, api, stormP).evaluate;
    var bPK = E(NSS_CONFIG.pRefPK, false), dPK = (api == null) ? null : E(NSS_CONFIG.pRefPK, true);
    var bIN = E(NSS_CONFIG.pRefIntl, false), dIN = (api == null) ? null : E(NSS_CONFIG.pRefIntl, true);
    var pStorm = (stormP != null && isFinite(stormP) && stormP > 0) ? Math.min(500, Math.max(1, stormP)) : null;
    var bST = pStorm ? E(pStorm, false) : null, dST = (pStorm && api != null) ? E(pStorm, true) : null;
    var cov = {}; sp.bins.forEach(function (b) { var k = SP_COVERS[b[0]]; cov[k] = (cov[k] || 0) + b[3]; });
    var hs = sp.hsgShare || [], hi = 0; for (var i = 1; i < hs.length; i++) if (hs[i] > hs[hi]) hi = i;
    var Sb = equivalentS(NSS_CONFIG.pRefPK, bPK.runoffMm), Sd = dPK ? equivalentS(NSS_CONFIG.pRefPK, dPK.runoffMm) : null;
    var reasons = ['soil: HYSOGs250m hydrologic soil group per 250 m cell (Ross et al. 2018), dual groups as D (undrained)',
                   'land cover: ESA WorldCover 2021 measured at 10 m, per 250 m cell; built ground sealed (CN 98) at every wetness',
                   'pixel first: runoff summed over ' + sp.bins.length + ' cover x soil x slope shares, curve numbers never averaged'];
    if (api == null) reasons.push('no antecedent index: current-wetness view omitted');
    return {
      ok: true, methodVersion: 'nss-2.0.0 (250 m, HYSOGs)', sponge250: true,
      retentionMm: +bPK.retentionMm.toFixed(1), dynamicRetentionMm: dPK ? +dPK.retentionMm.toFixed(1) : null,
      bnss: bPK.score, dnss: dPK ? dPK.score : null, bnss50: bIN.score, dnss50: dIN ? dIN.score : null,
      depletion: dPK ? bPK.score - dPK.score : null,
      runoffMm: +bPK.runoffMm.toFixed(1), dynamicRunoffMm: dPK ? +dPK.runoffMm.toFixed(1) : null,
      runoffCoefficient: +((dPK || bPK).runoffMm / NSS_CONFIG.pRefPK).toFixed(3), baselineRunoffCoefficient: +(bPK.runoffMm / NSS_CONFIG.pRefPK).toFixed(3),
      pRefPK: NSS_CONFIG.pRefPK, pRefIntl: NSS_CONFIG.pRefIntl, lambda: NSS_CONFIG.lambda, lambdaLocked: NSS_CONFIG.lambdaLocked,
      hsg: SP_HSG[hi], hsgBasis: 'HYSOGs250m: ' + SP_HSG.map(function (g, i) { return g + ' ' + Math.round((hs[i] || 0) * 100) + '%'; }).join(', '),
      hsgShare: hs, soilTexture: null, clayPct: null, cnBasis: 'NRCS table value per cover and soil group, per 250 m cell',
      fSlope: +bPK.fMean.toFixed(2), slopePct: null,
      stormP: pStorm, stormRetentionMm: bST ? +bST.retentionMm.toFixed(1) : null, stormRunoffMm: bST ? +bST.runoffMm.toFixed(1) : null,
      stormDynamicRetentionMm: dST ? +dST.retentionMm.toFixed(1) : null, stormDynamicRunoffMm: dST ? +dST.runoffMm.toFixed(1) : null,
      stormRetentionPct: bST ? Math.round(bST.retentionMm / pStorm * 100) : null, stormDynamicRetentionPct: dST ? Math.round(dST.retentionMm / pStorm * 100) : null,
      landCoverBasis: 'ESA WorldCover 2021, 10 m shares per 250 m cell', landCoverConfidence: 'B', landCoverFallback: false, landCoverStatus: 'worldcover-250m', treeObserved: true,
      soilBasis: 'HYSOGs250m', soilConfidence: 'C', imperviousFraction: +(cov.built || 0).toFixed(3), treeFraction: +(cov.trees || 0).toFixed(3),
      coverFractions: cov, coverStatus: 'worldcover-250m', cnBaseline: bPK.cnAreaWeighted, cnDynamic: dPK ? dPK.cnAreaWeighted : null,
      api: api, apiLabel: (G.AGN && G.AGN.wetness) ? G.AGN.wetness.label(api) : null, cnAreaWeighted: (dPK || bPK).cnAreaWeighted,
      cnAreaWeightedNote: 'diagnostic only: the runoff is computed per share (pixel first)',
      equivalentS: Sb == null ? null : +Sb.toFixed(1), equivalentSDynamic: Sd == null ? null : +Sd.toFixed(1),
      equivalentCN: Sb == null ? null : +(25400 / (Sb + 254)).toFixed(1), equivalentCNDynamic: Sd == null ? null : +(25400 / (Sd + 254)).toFixed(1),
      spongeClass: spongeClass(Sb), spongeClassDynamic: spongeClass(Sd), classShare: sp.classShare || null,
      saturationShare: +bPK.satShare.toFixed(2), saturationCN100: +saturationCN(100).toFixed(1), saturationCN50: +saturationCN(50).toFixed(1),
      cover: cov, coverSource: 'ESA WorldCover 2021 + HYSOGs250m, 250 m cells', remainderClass: null,
      terrainCeiling: 100, terrainStorageFactor: +bPK.fMean.toFixed(2), terrainStorageNote: 'slope scales S per 250 m cell inside the SCS equation',
      confidence: 'C', confidenceReasons: reasons
    };
  }
  G.AGN.nss = {
    config: NSS_CONFIG, score: score, coverFor: coverFor, coverageReport: coverageReport, equivalentS: equivalentS, spongeClass: spongeClass,
    runoff: runoff, retentionRatio: retentionRatio, S_mm: S_mm,
    cnArc: cnArc, fSlopeFor: fSlopeFor, saturationCN: saturationCN,
    cn005From020: cn005From020,
     
    selfTest: function () {
      var f = [], ok = function (c, m) { if (!c) f.push(m); };
      ok(Math.abs(saturationCN(100) - 33.7) < 0.2, 'saturation CN at 100 mm');
      ok(Math.abs(saturationCN(50) - 50.4) < 0.2, 'saturation CN at 50 mm');
       
      var prev = 1e9;
      for (var cn = 30; cn <= 98; cn++) {
        var d = NSS_CONFIG.pRefPK - runoff(NSS_CONFIG.pRefPK, cn);
        ok(d <= prev + 1e-9, 'retention depth monotone at CN ' + cn); prev = d;
      }
       
      ok(NSS_CONFIG.lambdaLocked && NSS_CONFIG.lambda === 0.20,
         'lambda must stay 0.20 while the CN table is the 0.20 table');
       
      var pf = 1.01;
      [1, 4, 8, 15, 25, 40].forEach(function (s) {
        var v = fSlopeFor(s);
        ok(v > 0 && v <= 1, 'F_slope in range at ' + s + '%');
        ok(v <= pf + 1e-9, 'F_slope monotone at ' + s + '%'); pf = v;
      });
       
      [25, 50, 100, 150].forEach(function (P) {
        [30, 60, 98].forEach(function (cn) {
          ok(runoff(P, cn) <= P + 1e-9, 'Q<=P at P=' + P + ' CN=' + cn);
        });
      });
      return { passed: f.length === 0, failures: f };
    }
  };
  try { if (G.console && G.__MACH_DEBUG) console.info('[AGN] NSS v1.0.0 loaded (confidence C — HSG proxied)'); } catch (e) {}
})(typeof window !== 'undefined' ? window : this);

