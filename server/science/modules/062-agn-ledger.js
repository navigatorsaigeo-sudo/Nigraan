


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var D = G.document;

  function EV() { return G.AGN && G.AGN.evidence ? G.AGN.evidence : null; }
  function point(lat, lon) {
    return (lat == null || lon == null) ? null
      : (Number(lat).toFixed(3) + ',' + Number(lon).toFixed(3));
  }

   
  function file(id, rec) {
    var E = EV();
    if (!E || !E.record || !id) return null;
    try { E.record(id, rec); return id; } catch (_) { return null; }
  }

  

  function fileEnsemble(res) {
    if (!res || !res.systems) return [];
    var unit = point(res.lat, res.lon) || 'point';
    var out = [];
    res.systems.forEach(function (sys) {
      var id = 'forecast.' + sys.id + ':' + unit + ':' + res.variable;
      if (sys.absent) {
        out.push(file(id, {
          label: sys.name + ' — ' + res.variable, kind: EV().KIND.FORECAST,
          value: null, unit: res.unit, source: sys.org, method: 'ensemble',
          tier: 'unavailable', unitKey: unit, hazard: null,
          issued: res.issued, licence: 'MACH forecast (commercial licence)',
          refuses: ['this system returned nothing for this request — ' + (sys.why || 'no reason given')]
        }));
        return;
      }
      var d1 = (sys.days && (sys.days[1] || sys.days[0])) || {};
      out.push(file(id, {
        label: sys.name + ' — ' + res.variable, kind: EV().KIND.FORECAST,
        value: (d1.p50 == null ? null : d1.p50), unit: res.unit,
        source: sys.org + ' / ' + sys.name,
        method: sys.members + '-member ensemble, '
              + (res.accumulation
                  ? ((sys.nativeStepH || sys.declaredStepH) + ' h native steps summed per day')
                  : 'hourly grid'),
        tier: sys.members >= 3 ? 'multi-member' : 'single',
        models: [sys.id], n: sys.members,
        median: d1.p50, p10: d1.p10, p90: d1.p90,
        spread: (d1.p10 == null || d1.p90 == null) ? null : (d1.p90 - d1.p10),
        elevation: res.elevation, issued: res.issued, unitKey: unit,
        hazard: (res.variable === 'precipitation') ? 'flood' : 'heat',
        lead: (d1.leadDays == null ? null : d1.leadDays * 24),
        licence: 'MACH forecast (commercial licence)',
        refuses: [
          'an ensemble member share is not a calibrated probability — no hindcast '
            + 'reliability has been scored for these systems over Pakistan',
          sys.stepAsDeclared === false
            ? ('the response came back on a ' + sys.nativeStepH + ' h grid, not the declared '
               + sys.declaredStepH + ' h')
            : null,
          sys.shortOfExpected
            ? ('only ' + sys.members + ' of ' + sys.expected + ' members answered')
            : null
        ].filter(Boolean)
      }));
    });
    

    var pd = (res.days && (res.days[1] || res.days[0])) || {};
    if (res.pooled) {
      out.push(file('forecast.pooled:' + unit + ':' + res.variable, {
        label: 'Pooled interval — ' + res.variable, kind: EV().KIND.DERIVED,
        value: (pd.p50 == null ? null : pd.p50), unit: res.unit,
        source: res.model, method: res.pooling || 'member-weighted pool',
        tier: 'multi-system', n: res.members,
        median: pd.p50, p10: pd.p10, p90: pd.p90,
        unitKey: unit, issued: res.issued,
        hazard: (res.variable === 'precipitation') ? 'flood' : 'heat',
        licence: 'MACH forecast (commercial licence)',
        refuses: ['member-weighted, not skill-weighted — the shares follow the member '
                  + 'counts because no relative skill has been measured over Pakistan',
                  'derived from the per-system records beside it, not retrieved separately']
      }));
    }
    return out.filter(Boolean);
  }

   

   
  function fileMC(res, unitKey) {
    if (!res) return [];
    var id = 'simulation.mc:' + (unitKey || res.unitKey || 'unit');
    if (res.refused) {
      return [file(id, {
        label: 'Compound simulation', kind: EV().KIND.DERIVED,
        value: null, source: 'AGN.mc', method: 'refused', tier: 'unavailable',
        unitKey: unitKey || res.unitKey || null, hazard: 'compound',
        refuses: [res.why || 'the simulation refused']
      })].filter(Boolean);
    }
    return [file(id, {
      label: 'Compound joint exceedance — ' + res.hazardA + ' and ' + res.hazardB,
      kind: EV().KIND.DERIVED,
      value: res.joint == null ? null : res.joint, unit: 'fraction of trials',
      source: 'AGN.mc', method: res.basis + ' · ' + res.dependence,
      

      tier: (res.rhoSource === 'measured' || res.rhoSource === 'measured-pooled')
              ? 'measured-dependence' : 'declared-dependence',
      extra: {
        dependenceOrigin: (res.rhoSource === 'measured' || res.rhoSource === 'measured-pooled')
                ? 'measured' : 'declared',
        dependenceScope: res.rhoScope || (res.rhoSource === 'measured' ? 'unit'
                       : (res.rhoSource === 'measured-pooled' ? 'national' : 'prior')),
        rhoSource: res.rhoSource || null,
        rhoPairs: res.rhoPairs || null,
        rhoCI: res.rhoCI ? [res.rhoCI.lo, res.rhoCI.hi] : null
      },
      n: res.N, unitKey: unitKey || res.unitKey || null, hazard: 'compound',
      refuses: [
        'a fraction of simulated trials, not a calibrated probability',
        res.severityReportable === false ? res.severityWithheldWhy : null,
        res.liftReportable === false ? res.liftWithheldWhy : null,
        res.rhoSource && res.rhoSource !== 'measured'
          ? ('the dependence is ' + res.rhoSource + ', not measured at this unit')
          : null
      ].filter(Boolean)
    })].filter(Boolean);
  }

   
  function fileCmip(rec) {
    if (!rec) return [];
    var unit = (rec.location && rec.location.name) || 'unit';
    var t = rec.temperature_delta_c;
    var per = (rec.per_model && rec.per_model.temperature_delta_c) || [];
    return [file('climate.cmip6:' + unit + ':' + rec.horizon, {
      label: 'CMIP6 temperature delta — ' + rec.horizon + 's vs ' + rec.baseline,
      kind: EV().KIND.PROJECTION || EV().KIND.DERIVED,
      value: t ? t.mean : null, unit: '°C',
      source: 'CMIP6 HighResMIP via MACH',
      method: per.length + ' of ' + (rec.models_requested || []).length + ' models, '
            + rec.future_window.start + ' to ' + rec.future_window.end,
      tier: per.length >= 2 ? 'multi-model' : 'insufficient',
      models: per.map(function (x) { return x.model; }), n: per.length,
      median: t ? t.mean : null,
      spread: t ? (t.max - t.min) : null,
      unitKey: unit, issued: rec.created_at,
      refuses: [
        'downscaled and linearly bias-corrected to land reanalysis by the provider; '
        + 'corrected absolute values, models\u2019 own change signal',
        'not applied to any hazard or engineering score',
        'a single high-emission trajectory, not a scenario comparison',
        (rec.models_unavailable || []).length
          ? ((rec.models_unavailable || []).length + ' models did not answer')
          : null
      ].filter(Boolean)
    })].filter(Boolean);
  }

   

   
  var filed = { ensemble: 0, mc: 0, cmip6: 0, nowcast: 0, assets: 0, skill: 0 };

  

  function fileNowcast(r) {
    if (!r || !r.variables || !r.variables.length) return [];
    var unit = point(r.lat, r.lon) || 'point';
    return r.variables.map(function (v) {
      var real = (v.state === 'sub-hourly');
      var refuses = [
        'the 15-minute cadence is what the endpoint returns; the resolution filed here '
        + 'is what was measured on the response — ' + (v.resolutionWhy || 'not established'),
        'a point value at a tehsil centroid, not an area mean'
      ];
      if (!real) refuses.push('no rate of change and no threshold crossing were computed: '
        + (v.rateRefusedWhy || v.why || 'the series did not support them'));
      if (v.threshold && v.threshold.isDefault) refuses.push(
        'the operating limit is an AGN default with a stated basis, not this client\'s limit');
      return file('nowcast.minutely15:' + unit + ':' + v.key, {
        label: '15-minute model-feed QA — ' + v.label, kind: EV().KIND.FORECAST,
        value: real ? v.current : null, unit: v.unit,
        source: 'MACH minutely_15',
        method: real
          ? ('15-minute steps, resolution measured: ' + Math.round(v.linearFraction * 100)
             + '% linear over ' + v.linearSteps + ' steps')
          : ('not usable for sub-hourly timing — ' + (v.resolutionWhy || v.why || 'no measurement')),
        tier: real ? 'sub-hourly' : 'unavailable',
        unitKey: unit, issued: r.issued,
        licence: 'MACH forecast (commercial licence)',
        refuses: refuses
      });
    }).filter(Boolean);
  }

  D.addEventListener('agn:nowcast', function (e) {
    var n = fileNowcast(e && e.detail).length; filed.nowcast += n;
  });

  

  function fileAssets(res) {
    if (!res || !res.rows || !res.rows.length) return [];
    return res.rows.map(function (r) {
      var evaluated = (r.state === 'approaching' || r.state === 'window-closed');
      return file('asset.limit:' + r.assetId + ':' + r.variable, {
        label: 'Asset limit — ' + r.asset + ' · ' + r.variable,
        kind: EV().KIND.DERIVED,
        value: (evaluated && r.leadToAction != null) ? r.leadToAction : null,
        unit: 'minutes of usable lead',
        source: 'AGN.assets',
        method: r.state + ' · limit ' + r.limit + ' ' + r.dir
              + ' · authority: ' + r.authority
              + (r.actionMin == null ? ' · no registered action time'
                                     : ' · response ' + r.actionMin + ' min'),
        tier: evaluated ? 'client-limit' : 'unavailable',
        unitKey: r.assetId, issued: new Date().toISOString(),
        refuses: [
          'exposure only — this says the forecast crosses a limit written for this asset, '
          + 'not that the asset stops',
          'not a downtime estimate: whether work halts depends on the asset condition, the '
          + 'crew and the client rules, none of which this build holds',
          'no monetary figure is derived from this row, here or downstream',
          (r.authority === 'agn-default'
            ? 'the limit is an AGN default, not a limit this client set'
            : 'the limit is the client\'s, on the stated authority — AGN did not choose it'),
          r.why || 'no further qualification'
        ]
      });
    }).filter(Boolean);
  }

  D.addEventListener('agn:assetsEvaluated', function (e) {
    var n = fileAssets(e && e.detail).length; filed.assets += n;
  });

  

  function fileSkill(res) {
    if (!res || !res.ok || !res.pooled) return [];
    var out = [];
    Object.keys(res.pooled).forEach(function (lead) {
      var s = res.pooled[lead];
      if (!s || !s.usable) return;
      out.push(file('skill.lead:' + res.model + ':' + res.variable + ':' + lead, {
        label: 'Forecast error — ' + res.variable + ' at day ' + lead,
        kind: EV().KIND.DERIVED,
        value: Math.round(s.mae * 1000) / 1000, unit: 'MAE, model units',
        source: res.model + ' verified against ' + res.reference.source,
        method: 'lead-resolved archived forecast vs reanalysis, ' + s.n + ' hourly pairs over '
              + s.points + ' points',
        tier: 'measured-skill', n: s.n, unitKey: 'national', issued: res.at,
        refuses: [
          res.reference.why,
          res.reference.confounds[0],
          res.reference.confounds[1],
          'one window of one weather regime, not a climatology of forecast skill',
          'the national figure hides a per-point range wider than the lead effect — '
          + s.why
        ]
      }));
    });
    

    out.push(file('skill.weighting:' + res.variable, {
      label: 'Ensemble weighting — left unchanged',
      kind: EV().KIND.DERIVED, value: null, unit: null,
      source: 'AGN.skill', method: 'retrospective comparison attempted',
      tier: 'unavailable', unitKey: 'national', issued: res.at,
      refuses: [res.weighting.why,
                res.weighting.settledBy || 'no route stated',
                'the member-count split is not a finding that the systems are equally '
                + 'skilful — it is the absence of a measurement that could say otherwise']
    }));
    return out.filter(Boolean);
  }

  D.addEventListener('agn:skill', function (e) {
    var n = fileSkill(e && e.detail).length; filed.skill += n;
  });

  D.addEventListener('agn:ensemble', function (e) {
    var n = fileEnsemble(e && e.detail).length; filed.ensemble += n;
  });
  D.addEventListener('agn:cmip6', function (e) {
    var n = fileCmip(e && e.detail).length; filed.cmip6 += n;
  });
  D.addEventListener('agn:mc', function (e) {
    var d = (e && e.detail) || {};
    var n = fileMC(d.res, d.unit).length; filed.mc += n;
  });

  


  G.AGN.ledger = {
    file: file, filed: function () { return Object.assign({}, filed); },
    fileEnsemble: fileEnsemble, fileMC: fileMC,
    fileCmip: fileCmip,
    fileNowcast: fileNowcast, fileAssets: fileAssets, fileSkill: fileSkill,
    version: 'v89.40'
  };
})(window);
