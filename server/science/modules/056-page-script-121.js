


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  var STATE = { RETRIEVED: 'retrieved', DESIGN: 'design', ABSENT: 'absent' };
  var RANK  = { absent: 0, design: 1, retrieved: 2 };
  var FIT   = { DIRECT: 'direct', PROXY: 'proxy', NONE: 'none' };

  

  var MEASURAND = {
    heat    : { claims: 'wet-bulb and apparent temperature load on people',
                direct: 'temperature_2m + relative_humidity_2m', proxy: null, why: null },
    flood   : { claims: 'rainfall runoff and river discharge against a return period',
                direct: 'precipitation + river_discharge', proxy: null, why: null },
    drought : { claims: 'water balance, atmospheric demand and root-zone moisture',
                direct: 'precipitation + et0 + soil_moisture', proxy: null, why: null },
    wind    : { claims: 'damaging gust at 10 m',
                direct: 'wind_gusts_10m', proxy: 'wind_speed_10m',
                why: 'where the provider returns no gust, the sustained wind stands in through a '
                   + 'declared gust factor. It is a driver of the measurand, not the measurand.' },
    cold    : { claims: 'cold stress (UTCI in shade) at settlement elevation',
                direct: 'temperature_2m, relative_humidity_2m and wind_speed_10m at the valley floor (UTCI in shade)', proxy: null, why: null },
    glof    : { claims: 'glacial lake outburst potential at a documented source',
                direct: 'lake inventory + outburst history', proxy: 'air temperature as a melt driver',
                why: 'melt, rain and season may modify a trigger state only AFTER a documented '
                   + 'source exists. Temperature alone cannot create one, and a unit with no '
                   + 'inventory record scores null rather than zero.' },
    landslide:{ claims: 'slope failure susceptibility under rainfall',
                direct: 'slope + antecedent moisture + rainfall', proxy: null, why: null },
    

    seismic : { claims: 'design-basis ground-shaking zone, as a screening category',
                direct: null,
                proxy: 'BCP SP-2007 Table 2.2 zone (legacy category) per tehsil / district; BCP 2021 Ss and S1 per site',
                why: 'Every district carries its BCP SP-2007 zone from the code\'s own tehsil table. '
                   + 'BCP 2021 Ss / S1 come from the code maps (digitised); the site class is assumed D '
                   + 'unless given. Recent seismicity is reported beside this score and is '
                   + 'never added to it. A site-specific PSHA is the authority for any design or '
                   + 'investment decision.' },
    air     : { claims: 'population exposure to particulate matter',
                direct: 'pm2_5 + pm10', proxy: null, why: null }
  };

  function num(v) { return (v === null || v === undefined || v === '') ? null
                         : (isFinite(Number(v)) ? Number(v) : null); }
  function weakest(a, b) { return RANK[a] <= RANK[b] ? a : b; }

  

  var VOCAB = {
     
    observed:   STATE.RETRIEVED, reanalysis: STATE.RETRIEVED,
    forecast:   STATE.RETRIEVED, projection: STATE.RETRIEVED,
    static:     STATE.RETRIEVED,     
    derived:    STATE.DESIGN,        
    expert:     STATE.DESIGN,        

     
    'multi-model':  STATE.RETRIEVED, 'single-model': STATE.RETRIEVED,
    climatology:    STATE.DESIGN,    unavailable:    STATE.ABSENT,

     
    live: STATE.RETRIEVED, partial: STATE.RETRIEVED, cached: STATE.RETRIEVED,
    seed: STATE.DESIGN,    none: STATE.ABSENT,

     
    retrieved: STATE.RETRIEVED,
    'retrieved-zero': STATE.DESIGN,  
    absent:    STATE.ABSENT, invalid: STATE.ABSENT, 'no-bridge': STATE.ABSENT,

     
    measured: STATE.RETRIEVED,
    anchored: STATE.DESIGN,   
    heuristic: STATE.DESIGN, design: STATE.DESIGN, superseded: STATE.DESIGN
  };

  function fromWord(w) {
    if (w === null || w === undefined) return null;
    var k = String(w).toLowerCase();
    if (VOCAB[k]) return VOCAB[k];
    

    if (/^measured\b/.test(k) && !/expert|heuristic|design/.test(k)) return STATE.RETRIEVED;
    if (/measured|expert|heuristic|design|anchored/.test(k)) return STATE.DESIGN;
    return null;
  }

  

  function of(x) {
    if (x === null || x === undefined) return { state: STATE.ABSENT, why: 'no value supplied' };
    if (typeof x === 'string') {
      var w = fromWord(x);
      return w ? { state: w, why: 'vocabulary word "' + x + '"' }
               : { state: null, unknown: true, why: 'unrecognised vocabulary word "' + x + '"' };
    }
    if (typeof x !== 'object') return { state: null, unknown: true, why: 'not a provenance-carrying value' };

     
    if (x.sourceState !== undefined && (x.kind === 'empirical' || x.kind === 'gaussian' || x.kind === 'refused')) {
      if (x.ok === false) return { state: STATE.ABSENT, source: 'mc.marginal',
                                   why: x.why || x.evidenceText || 'the marginal was refused' };
      var ms = fromWord(x.sourceState);
      if (x.kind === 'gaussian') return { state: STATE.DESIGN, source: 'mc.marginal',
        why: 'a declared dispersion, not a retrieved one' };
      return { state: ms || STATE.DESIGN, source: 'mc.marginal',
               why: x.evidenceText || ('sourceState ' + x.sourceState) };
    }
     
    if (x.level !== undefined && x.mode !== undefined) {
      var lw = typeof x.level === 'number'
        ? ['none','seed','cached','partial','live'][x.level] : x.level;
      return { state: fromWord(lw) || STATE.ABSENT, source: 'status',
               why: x.reason || ('status level ' + lw) };
    }
    

    if (x.kind !== undefined && x.id !== undefined) {
      if (num(x.value) === null) return { state: STATE.ABSENT, source: 'evidence',
        why: (x.refuses && x.refuses[0]) || 'the record holds no value' };
      if (x.kind === 'derived') return { state: STATE.DESIGN, source: 'evidence',
        why: 'derived here — its own inputs decide, so it is not retrieved on its own account' };
      return { state: fromWord(x.kind) || STATE.DESIGN, source: 'evidence',
               why: x.source || ('kind ' + x.kind) };
    }
     
    if (x.tier !== undefined && (x.value !== undefined || x.median !== undefined)) {
      if (num(x.value) === null && num(x.median) === null)
        return { state: STATE.ABSENT, source: 'uncertainty', why: x.basis || 'no value' };
      return { state: fromWord(x.tier) || STATE.DESIGN, source: 'uncertainty',
               why: x.source || x.basis || ('tier ' + x.tier) };
    }
     
    if (x.score !== undefined) {
      if (x.unavailable === true || num(x.score) === null)
        return { state: STATE.ABSENT, source: 'hazard',
                 why: x.basis || x.note || x.reason || 'the hazard did not score' };
      if (x.gated === true) return { state: STATE.DESIGN, source: 'hazard',
        why: x.note || x.reason || 'gated — the score is a structural zero, not a measurement' };
      return { state: STATE.RETRIEVED, source: 'hazard', why: x.basis || 'the hazard scored' };
    }
     
    if (x.calibrationStatus !== undefined) {
      return { state: fromWord(x.calibrationStatus) || STATE.DESIGN, source: 'registry',
               why: x.basis || ('calibrationStatus ' + x.calibrationStatus) };
    }
    return { state: null, unknown: true, why: 'no provenance field recognised on this object' };
  }

  

  function derive(inputs, label) {
    var list = (inputs || []).map(function (i) {
      return (i && i.state !== undefined && i.why !== undefined) ? i : of(i);
    });
    if (!list.length) return { state: STATE.ABSENT, why: 'nothing was supplied to derive from',
                               inputs: [], label: label || null };
    var unknown = list.filter(function (r) { return r.unknown; });
    if (unknown.length) return { state: null, unknown: true, inputs: list, label: label || null,
      why: unknown.length + ' input(s) carry no recognised provenance, so the result has none either' };
    var worst = list.reduce(function (a, r) { return weakest(a, r.state); }, STATE.RETRIEVED);
    var driver = list.filter(function (r) { return r.state === worst; })[0];
    return { state: worst, inputs: list, label: label || null,
             why: (label ? label + ': ' : '') + worst + ' (set by its weakest input: ' + driver.why + ')',    
             weakestLink: driver };
  }

  

  function fitness(hazard, servedBy) {
    var m = MEASURAND[hazard];
    if (!m) return { fit: FIT.NONE, why: 'no measurand is declared for "' + hazard + '"' };
    if (!servedBy) return { fit: FIT.NONE, measurand: m.claims,
                            why: 'nothing is serving this hazard' };
    var s = String(servedBy);
    if (m.direct && m.direct.indexOf(s) >= 0)
      return { fit: FIT.DIRECT, measurand: m.claims, served: s,
               why: s + ' is the quantity ' + hazard + ' is defined on' };
    if (m.proxy && m.proxy.indexOf(s) >= 0)
      return { fit: FIT.PROXY, measurand: m.claims, served: s, why: m.why };
    return { fit: FIT.NONE, measurand: m.claims, served: s,
             why: s + ' is neither the declared measurand for ' + hazard + ' nor its declared proxy' };
  }

  

  var OUTPUT_CLASS = {
    UNIT:     { key: 'unit', label: 'Unit screening',
                sub: 'One tehsil, scored on retrieved evidence for that unit. The figure describes '
                   + 'this place at this lead time.' },
    NATIONAL: { key: 'national', label: 'National screening board',
                sub: 'All 576 Pakistani tehsils ranked together. Units differ in how much evidence '
                   + 'has landed, so the ranking is a screening order rather than a comparison of '
                   + 'equals, and each row carries its own state.' },
    SCENARIO: { key: 'scenario', label: 'Scenario — not a forecast',
                sub: 'The inputs were moved by hand in the Scenario Lab. Every figure here answers '
                   + '"what would the engine say if the weather were this", which is a sensitivity '
                   + 'analysis. It is not a forecast, it carries no probability, and no alert, '
                   + 'report or export may be issued from it.' },
    DEMO:     { key: 'demo', label: 'Demonstration — design surface',
                sub: 'The hazard layer under this figure is a design surface rather than retrieved '
                   + 'evidence. It exists so the architecture can be exercised. No document is issued.' }
  };
  function outputClass(ctx) {
    ctx = ctx || {};
    if (ctx.scenario === true) return OUTPUT_CLASS.SCENARIO;   
    var p = ctx.prov ? (ctx.prov.state || ctx.prov) : null;
    if (p !== STATE.RETRIEVED) return OUTPUT_CLASS.DEMO;
    return ctx.national === true ? OUTPUT_CLASS.NATIONAL : OUTPUT_CLASS.UNIT;
  }

  

  var DESCRIPTIVE = {
    

    'wind.engineParity': 'states that two other AGN engines carry a different wind curve',
    'wind.canonicalEngine': 'names which of the three engines is the authority',
    'wind.externalEnginesPending': 'names the two engines awaiting migration',
    'confidence.rule': 'states that confidence is worst-factor and never an average',
    'flood.riverReference': 'describes the global river-flow model reanalysis behind the baked return periods',
    'glof.canonicalEngine': 'names the published GLOF engine (the lake-routed corridor class), which does not read this registry entry',
    

    'drought.canonicalEngine': 'names the published drought engine (the SPI-30/90 + FAO-56 '
      + 'composite), which does not read this registry entry',
    'drought.secondaryEngine': 'names the engine the constants in this entry belong to',
    'drought.engineSeparationNote': 'states that two engines answer for one hazard and why '
      + 'the separation is declared rather than resolved'
  };

  function entries() {
    var R = G.FORMULA_REGISTRY, out = [];
    if (!R) return out;
    Object.keys(R).forEach(function (g) {
      var grp = R[g];
      if (!grp || typeof grp !== 'object') return;
      Object.keys(grp).forEach(function (k) {
        var e = grp[k];
        if (!e || typeof e !== 'object' || !('value' in e)) return;
        out.push({ path: g + '.' + k, group: g, key: k, value: e.value,
                   unit: e.unit || null, basis: e.basis || null,
                   calibrationStatus: e.calibrationStatus || null,
                   prov: of(e).state });
      });
    });
    return out;
  }

  

  var REACH = null;
  

  function reachable(path) {
    if (REACH === null) {
      REACH = Object.create(null);
      var src = '';
      try {
        var sc = document.getElementsByTagName('script');
        for (var i = 0; i < sc.length; i++) if (!sc[i].src) src += sc[i].textContent;
      } catch (_) { src = ''; }
      REACH.__ok = !!src; REACH.__lit = Object.create(null); REACH.__dyn = Object.create(null);
      if (src) {
        var m, reL = /FR\((['"])([^'"\n]+)\1\)/g, reD = /FR\((['"])([^'".\n]+)\.\1 ?\+/g;
        while ((m = reL.exec(src))) REACH.__lit[m[2]] = true;
        while ((m = reD.exec(src))) REACH.__dyn[m[2]] = true;
      }
      src = null;
    }
    if (!REACH.__ok) return null;
    if (!(path in REACH)) REACH[path] = !!(REACH.__dyn[path.split('.')[0]] || REACH.__lit[path]);
    return REACH[path];
  }

  function parameters() {
    var all = entries(), reads = (G.FR && G.FR.__read) || {};
    var consumed = [], unreached = [], dead = [], descriptive = [], undocumented = [];
    all.forEach(function (e) {
      e.reads = reads[e.path] || 0;
      if (!e.basis || !e.calibrationStatus) undocumented.push(e.path);
      if (e.reads > 0) { consumed.push(e); return; }
      

      if (e.calibrationStatus === 'superseded') {
        e.descriptiveWhy = 'superseded — retained as the record of a replaced model, by its own declaration';
        descriptive.push(e); return;
      }
      if (DESCRIPTIVE[e.path]) { e.descriptiveWhy = DESCRIPTIVE[e.path]; descriptive.push(e); return; }
      e.reachable = reachable(e.path);
      if (e.reachable === true) unreached.push(e);
      else if (e.reachable === false) dead.push(e);
      else unreached.push(e);                    
    });
    var unconsumed = unreached.concat(dead);
    

    var second = [];
    try {
      var T = G.AGN_TUNING;
      if (T) Object.keys(T).forEach(function (k) {
        if (k.charAt(0) === '_') return;
        if (typeof T[k] === 'number') second.push('AGN_TUNING.' + k + ' = ' + T[k]);
      });
    } catch (_) {}
    return {
      total: all.length,
      consumed: consumed.length, unconsumed: unconsumed.length,
      unreached: unreached.length, dead: dead.length,
      descriptive: descriptive.length, undocumented: undocumented,
      consumedPct: all.length ? Math.round(100 * consumed.length / all.length) : 0,
      unconsumedPaths: unconsumed.map(function (e) { return e.path; }),
      unreachedPaths: unreached.map(function (e) { return e.path; }),
      deadPaths: dead.map(function (e) { return e.path; }),
      descriptivePaths: descriptive.map(function (e) { return e.path; }),
      secondRegistry: second,
      byProvenance: all.reduce(function (a, e) { a[e.prov] = (a[e.prov] || 0) + 1; return a; }, {}),
      rows: all
    };
  }

  

  var DEVIATIONS = [
    { id: 'DEV-01', subject: 'wind curve · three engines, one registry',
      spec: 'The formula registry\'s wind entry is the canonical wind curve: the interpolated ladder '
          + '40 km/h → 0, 62 → 30, 89 → 55, 118 → 78, 160 → 92, 220 → 100 (gust in km/h at 10 m to the index 0-100). '
          + 'The onset (40 km/h) is its first breakpoint and the slope (1.3636 per km/h) its first segment; both '
          + 'are derived from the ladder and neither describes the curve above 62 km/h. '
          + 'v91.12 corrected this line, which read "slope 1.25 score/km/h" and described a '
          + 'linear curve the engine has not run since v91.8.',
      built: 'This page implements it. The older Python method file and the older JavaScript hazard engine still carry the legacy '
           + 'curve (gust minus 18, times 3.0), which maps a 40 km/h gust to '
           + 'about 92/100.',
      why: 'The divergence is real and is reported rather than implied fixed. The registry\'s wind parity flag is '
         + 'set to false for exactly this reason.',
      effect: 'The same tehsil and the same gust read differently depending on which AGN engine '
            + 'runs. Handover must not claim formula parity until the other two are migrated.',
      test: 'G16 · the parity flag must stay false while the other engines are unmigrated' },

    { id: 'DEV-02', subject: 'Monte Carlo heat bridge',
      spec: 'The index sensitivity to air temperature is the heat air-stress slope, 7 score per °C.',
      built: 'The simulation reads the air-stress slope times the humid-path air-temperature weight = 2.8 score per °C.',
      why: 'The air-stress slope is the gradient of the AIR-STRESS TERM, and the heat index blends that term '
         + 'against wet bulb at a weight. Using the raw gradient treats a term\'s internal slope as '
         + 'the index\'s sensitivity: on the measured Skardu 11-model spread of 21.7 °C it produced '
         + '152 index points of dispersion, held at the ceiling of 30 — a leg pinned at the bound on '
         + 'the unit where model disagreement matters most.',
      effect: 'Simulated heat dispersion is 2.5x narrower and no longer saturates. The humid path\'s '
            + 'air weight (0.40) is used rather than the dry zone\'s (0.35), so the wider of the two '
            + 'admissible readings is the one that ships.',
      test: 'G15 MC-12 · asserts the weighted value and fails on a regression to the raw gradient' },

    { id: 'DEV-03', subject: 'Monte Carlo · drought has no bridge',
      spec: 'Every scored hazard has a bridge from its ensemble spread to the index.',
      built: 'Drought has no bridge in the formula registry (it is declared as having none), and the simulation refuses it.',
      why: 'The drought scale is a water-balance deficit accumulated over the forecast window; the '
         + 'ensemble member is one hour of rainfall. Dividing one by the other produces a number in '
         + 'no unit at all, and clamping a meaningless ratio into a plausible range is how it would '
         + 'have stayed invisible.',
      effect: 'A drought leg cannot enter a compound simulation. It scores normally on its own path.',
      test: 'G15 · the simulation refuses a drought bridge and says so' },

    { id: 'DEV-04', subject: 'evidence completeness never touches severity',
      spec: 'A coverage penalty is applied to the hazard score.',
      built: 'Completeness governs CONFIDENCE and the Screen/Watch state. It never multiplies a '
           + 'hazard score. The registry\'s confidence rule takes the worst factor, never an average.',
      why: 'Data quality is a property of the observer, not of the atmosphere. A hazard does not '
         + 'become less severe because NIGRAAN holds fewer feeds, and multiplying by completeness '
         + 'would let a district reduce its reported risk by withholding data.',
      effect: 'Scores are unchanged by coverage; coverage is reported beside every figure.',
      test: 'G12 · the status ladder takes the weakest input and never the best' },

    { id: 'DEV-05', subject: 'the second constants registry, retired',
      spec: 'The formula registry is the single authority for every scientific constant.',
      built: 'It was not. A second tuning table carried the four cold-ramp numbers (zero point, mid point, mid value, slope) '
           + 'that the registry\'s cold entry also declared, with fuller bases and a different '
           + 'provenance claim, that nothing read. The cold index also held a third inline copy as a '
           + 'fallback. v89.27 wires the cold index to the registry and reduces the tuning table to behaviour '
           + 'switches.',
      why: 'Two registries describing one curve disagree about how well calibrated it is, and '
         + 'whichever a reviewer opens, the other is wrong about the product.',
      effect: 'No score changes — the numbers were identical. Recalibrating the registry now moves '
            + 'the score, which it previously did not.',
      test: 'G16 · the parameter list must show no second registry' },

    { id: 'DEV-06', subject: 'constants declared and typed again',
      spec: 'Every constant a formula uses is read from the registry.',
      built: 'Measured before this build: 23 of 84 entries were never read, and five had '
           + 'byte-identical twins at the call site. The heat index computed (EHF / 20) x 85 while '
           + 'the registry\'s severe-EHF value (20 °C², attributed to Nairn & Fawcett 2015 and marked anchored) and '
           + 'its scale (85) went unread; the cold index typed its own season factors; the flood index typed '
           + 'the riverine blend; and the v89.19 riverine tail used two constants with no registry '
           + 'entry at all. All are wired, and the tail is now declared.',
      why: 'A registry entry that cites a paper while the code carries its own copy of the number is '
         + 'documentation of a model that is not running. It fails in the direction that looks '
         + 'safest: recalibrate the registry, publish the change, and the score does not move.',
      effect: 'No score changes today — every twin was equal. The registry is now load-bearing.',
      test: 'G16 · the registry counts its own reads and the gate drives the engine before asserting' },

    { id: 'DEV-07', subject: 'the declared dependence table',
      spec: 'A declared rank correlation is available for every compound pair.',
      built: 'Only heat with flood is measured. v91.17.3 replaced the prior with the OBSERVED daily '
           + 'rank correlation between daily maximum temperature and daily rainfall, standardised per station: near zero on the station record. '
           + 'The prior is 0.00. The other three pairs are marked as not measured and cannot run, '
           + 'because their hazards have no bridge.',
      why: 'The previous prior, -0.253, was a real measurement of the wrong quantity: the median '
         + 'rank correlation BETWEEN MODELS inside one forecast hour, over four days of September '
         + '2026. That is model spread, not atmospheric dependence, and a negative prior '
         + 'SUPPRESSES the joint probability of heat and flood. Every compound run before v91.17.3 '
         + 'therefore understated how often the two arrive together. The model figure is retained '
         + 'as the model correlation, named for what it measures, and is not used.',
      effect: 'The declared fallback is the COMMON path, not a corner case — in 80.3% of sampled '
            + 'unit-hours every model reported identical rainfall, so no rank correlation exists. '
            + 'A locally measured ensemble correlation still overrides the prior wherever enough paired '
            + 'members exist; that path is unchanged.',
      test: 'G15 · the measured flag and the value are both asserted' },

    { id: 'DEV-08', subject: 'sovereignty · what is scored and what is only shown',
      spec: 'All 577 tehsil polygons carry a hazard score.',
      built: '576 are scored. Azad Jammu & Kashmir and Gilgit-Baltistan are shown and scored as '
           + 'Pakistan. IIOJK is shown as disputed and is never scored; the denominator stays 576.',
      why: 'A screening score is an operational statement about a place NIGRAAN can act on. '
         + 'Publishing one for territory under dispute would be a claim the platform is not making.',
      effect: 'Every national count, percentile and ranking is over 576 units. The disputed polygon '
            + 'renders and returns no score.',
      test: 'G7 · the disputed unit returns no score rather than a zero' },

    { id: 'DEV-09', subject: 'the GLOF inventory is evidence, not a driver',
      spec: 'The ICIMOD/NDMA basin inventory drives the GLOF score.',
      built: 'It is a bounded modifier of at most the registry\'s inventory cap in points. The driver is '
           + 'documented outburst history and named hazardous glaciers.',
      why: 'Raw lake counts over-weight large low-threat basins — the Indus basin holds 815 lakes '
         + 'against Hunza\'s 216 — and would degrade the calibration rather than improve it.',
      effect: 'A unit with no inventory record gets no score (no value), not a zero: no documented source is a '
            + 'different claim from a documented absence of one.',
      test: 'G4 · the two GLOF absence states stay distinguishable' }
  ];

  

  function integrity() {
    var p = parameters(), checks = [];
    function add(name, ok, detail) { checks.push({ name: name, pass: !!ok, detail: detail }); }

    add('Every registry entry carries a basis and a calibration status',
        p.undocumented.length === 0,
        p.undocumented.length ? p.undocumented.join(', ') : p.total + ' entries, all documented');

    add('No second constants registry',
        p.secondRegistry.length === 0,
        p.secondRegistry.length ? p.secondRegistry.join(' · ')
          : 'FORMULA_REGISTRY is the only place a scientific constant is declared');

    

    (function () {
      var HAZ_ENGINES = [
        { hazard:'wind',      fn:'hzWind',      entry:'wind' },
        { hazard:'heat',      fn:'hzHeat',      entry:'heat' },
        { hazard:'flood',     fn:'hzFlood',     entry:'flood' },
        { hazard:'cold',      fn:'hzCold',      entry:'cold' },
        { hazard:'drought',   fn:'hzDrought',   entry:'drought' },
        { hazard:'landslide', fn:'hzLandslide', entry:'landslide' },
        { hazard:'glof',      fn:'hzGLOF',      entry:'glof' }    
      ];
      var bad = [], declared = [], noEntry = [];
      HAZ_ENGINES.forEach(function (h) {
        var src = null;
        try { src = String(G[h.fn] || (typeof window !== 'undefined' ? window[h.fn] : '') || ''); }
        catch (_) { src = ''; }
        if (!src) return;                        
        var reg = null;
        try { reg = (G.FORMULA_REGISTRY || {})[h.entry] || null; } catch (_) { reg = null; }
        

        if (!reg) { noEntry.push(h.hazard); return; }
        var readsOwn = new RegExp("FR\\(['\"]" + h.entry + "\\.").test(src);
        if (readsOwn) return;
         
        var canon = reg && reg.canonicalEngine && reg.canonicalEngine.value;
        if (canon) { declared.push(h.hazard + ' (canonicalEngine: ' + canon + ')'); return; }
        bad.push(h.hazard + ': ' + h.fn + ' reads no constant from FORMULA_REGISTRY.'
                 + h.entry + ', and that entry does not declare which engine it describes');
      });
      add('Every published hazard engine reads the registry entry that documents it, '
          + 'or the registry declares which engine it describes',
          bad.length === 0,
          bad.length ? bad.join(' · ')
            : ((declared.length
                 ? (declared.length + ' hazard' + (declared.length === 1 ? '' : 's')
                    + ' with a declared engine separation: ' + declared.join('; ') + '. ')
                 : '')
               + (noEntry.length
                 ? (noEntry.length + ' hazard' + (noEntry.length === 1 ? ' has' : 's have')
                    + ' no FORMULA_REGISTRY group at all (' + noEntry.join(', ')
                    + ') - its constants live with its engine. ')
                 : '')
               + 'no hazard engine is documented by an entry it does not read'));
    })();

    add('No constant is declared, documented and read by no code at all',
        p.dead === 0,
        p.dead ? ('declared with a basis and a calibration status, and no formula reads it: '
                  + p.deadPaths.join(', '))
          : p.consumed + ' consumed by a running path, ' + p.unreached + ' reachable but not '
            + 'exercised here, ' + p.descriptive + ' descriptive by declaration');

    var stale = Object.keys(DESCRIPTIVE).filter(function (path) {
      return !p.rows.some(function (e) { return e.path === path; });
    });
    add('The descriptive list names only entries that exist',
        stale.length === 0,
        stale.length ? ('names a constant that is gone: ' + stale.join(', '))
          : Object.keys(DESCRIPTIVE).length + ' descriptive entries, all present');

    var supersededRead = p.rows.filter(function (e) {
      return e.calibrationStatus === 'superseded' && e.reads > 0; }).map(function (e) { return e.path; });
    add('Nothing marked superseded is still being read',
        supersededRead.length === 0,
        supersededRead.length ? ('marked superseded and still read: ' + supersededRead.join(', '))
          : 'every retired constant is retired in fact as well as in its status');

    var readDescriptive = p.rows.filter(function (e) {
      return DESCRIPTIVE[e.path] && e.reads > 0; }).map(function (e) { return e.path; });
    add('Nothing declared descriptive is actually being read',
        readDescriptive.length === 0,
        readDescriptive.length ? ('read by a formula but listed as descriptive: ' + readDescriptive.join(', '))
          : 'the two sets are disjoint');

    var ids = DEVIATIONS.map(function (d) { return d.id; });
    add('Deviation ids are unique',
        ids.length === new Set(ids).size,
        ids.length + ' recorded deviations');
    var thin = DEVIATIONS.filter(function (d) {
      return !d.spec || !d.built || !d.why || !d.effect || !d.test; }).map(function (d) { return d.id; });
    add('Every deviation states spec, build, reason, effect and test',
        thin.length === 0,
        thin.length ? ('incomplete: ' + thin.join(', ')) : ids.length + ' complete');

    var badVocab = [];
    ['observed','reanalysis','forecast','projection','static','derived','expert',
     'multi-model','single-model','climatology','unavailable',
     'live','partial','cached','seed','none',
     'retrieved','retrieved-zero','absent','invalid','no-bridge',
     'measured','anchored','heuristic','design'].forEach(function (w) {
      if (!fromWord(w)) badVocab.push(w);
    });
    add('Every module vocabulary word maps to a state',
        badVocab.length === 0,
        badVocab.length ? ('unmapped: ' + badVocab.join(', ')) : '25 words across five modules, all mapped');

    var unfit = Object.keys(MEASURAND).filter(function (h) {
      var m = MEASURAND[h]; return !!(m.proxy && !m.why); });
    add('Every proxy states why it is standing in',
        unfit.length === 0,
        unfit.length ? ('unexplained proxy: ' + unfit.join(', '))
          : Object.keys(MEASURAND).filter(function (h) { return !!MEASURAND[h].proxy; }).length
            + ' declared proxies, each with its reason');

    return { checks: checks, pass: checks.every(function (c) { return c.pass; }),
             passed: checks.filter(function (c) { return c.pass; }).length,
             total: checks.length, parameters: p };
  }

  function selfTest() {
    var out = [];
    function t(n, f) { try { var r = f(); out.push({ name: n, pass: !!r.pass, detail: r.detail }); }
                       catch (e) { out.push({ name: n, pass: false, detail: 'threw: ' + e.message }); } }

    t('PV-01 weakest link, not average', function () {
      var d = derive(['forecast', 'forecast', 'climatology'], 'a blended figure');
      return { pass: d.state === STATE.DESIGN,
               detail: 'two retrieved inputs and one design input give ' + d.state };
    });
    t('PV-02 absent beats design', function () {
      var d = derive(['climatology', 'unavailable']);
      return { pass: d.state === STATE.ABSENT, detail: 'gives ' + d.state };
    });
    t('PV-03 all retrieved stays retrieved', function () {
      var d = derive(['observed', 'forecast', 'static']);
      return { pass: d.state === STATE.RETRIEVED, detail: 'gives ' + d.state };
    });
    t('PV-04 the weakest link is named', function () {
      var d = derive(['forecast', 'expert']);
      return { pass: /expert|design/.test(d.why), detail: d.why };
    });
    t('PV-05 an unknown vocabulary word is not defaulted', function () {
      var r = of('probably fine');
      return { pass: r.unknown === true && r.state === null, detail: r.why };
    });
    t('PV-06 an unknown input poisons the derivation', function () {
      var d = derive(['forecast', 'probably fine']);
      return { pass: d.unknown === true && d.state === null, detail: d.why };
    });
    t('PV-07 a gaussian marginal is design however it is labelled', function () {
      var r = of({ kind: 'gaussian', ok: true, sourceState: 'retrieved', sigma: 9 });
      return { pass: r.state === STATE.DESIGN, detail: r.why };
    });
    t('PV-08 an empirical marginal is retrieved', function () {
      var r = of({ kind: 'empirical', ok: true, sourceState: 'retrieved', n: 11, evidenceText: 'x' });
      return { pass: r.state === STATE.RETRIEVED, detail: r.why };
    });
    t('PV-09 a hazard that did not score is absent', function () {
      var a = of({ score: null, unavailable: true, basis: 'no wind input' });
      var b = of({ score: 0, gated: true, note: 'zone gate closed' });
      return { pass: a.state === STATE.ABSENT && b.state === STATE.DESIGN,
               detail: 'unavailable -> ' + a.state + '; gated zero -> ' + b.state };
    });
    t('PV-10 a scenario can never become a forecast', function () {
      var c = outputClass({ scenario: true, prov: STATE.RETRIEVED, national: true });
      return { pass: c.key === 'scenario', detail: 'fully retrieved national scenario is still ' + c.key };
    });
    t('PV-11 a design surface is a demonstration', function () {
      var c = outputClass({ prov: STATE.DESIGN });
      return { pass: c.key === 'demo', detail: c.label };
    });
    t('PV-12 a proxy is retrieved AND unfit', function () {
      var f = fitness('glof', 'air temperature as a melt driver');
      return { pass: f.fit === FIT.PROXY && !!f.why, detail: f.why };
    });
    t('PV-13 an unrelated variable is not a proxy', function () {
      var f = fitness('heat', 'river_discharge');
      return { pass: f.fit === FIT.NONE, detail: f.why };
    });
    t('PV-14 registry integrity', function () {
      var i = integrity();
      return { pass: i.pass, detail: i.passed + '/' + i.total + ' · ' +
               i.checks.filter(function (c) { return !c.pass; }).map(function (c) { return c.name; }).join('; ') };
    });

    var passed = out.filter(function (x) { return x.pass; }).length;
    return { checks: out, passed: passed, total: out.length, ok: passed === out.length };
  }

  G.AGN.prov = {
    STATE: STATE, FIT: FIT, MEASURAND: MEASURAND, OUTPUT_CLASS: OUTPUT_CLASS,
    of: of, derive: derive, fitness: fitness, outputClass: outputClass,
    parameters: parameters, entries: entries, DEVIATIONS: DEVIATIONS,
    DESCRIPTIVE: DESCRIPTIVE, integrity: integrity, selfTest: selfTest,
    version: 'v89.27'
  };
})(window);
