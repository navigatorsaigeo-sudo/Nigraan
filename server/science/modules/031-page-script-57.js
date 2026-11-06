

const FLOOD_RC_FLOOR_BY_ZONE = {
  irrigated_plains: 0.55,   
  arid_plains:      0.45,   
  rainfed:          0.40,
  highland:         0.35,
  high_mountain:    0.30    
};
function hzRunoffFloor(zone){
  var T=(typeof AGN_TUNING!=='undefined')?AGN_TUNING:null;
  if(T && T.FLOOD_RC_LEGACY) return 0;                      
  var byZone=null;
  try{ byZone=FR('flood.rcFloorByZone'); }catch(_){ byZone=FLOOD_RC_FLOOR_BY_ZONE; }
  var v=(byZone||FLOOD_RC_FLOOR_BY_ZONE)[zone];
  return (v!=null?v:FLOOD_RC_FLOOR_BY_ZONE.irrigated_plains);
}
try{ window.hzRunoffFloor=hzRunoffFloor; }catch(_){}



function hzRunoffCoeff(zone, slope, unitKey, terrRef, apiIn, stormMm){
  

  

  var api = (apiIn == null || !isFinite(apiIn)) ? null : Math.max(0, Math.min(1, apiIn));
  try{
    

    if(unitKey && window.AGN && AGN.nss && ((terrRef && terrRef.slope!=null) || slope!=null)){
      var dist=null;
      try{ if(typeof PK_KEY_TO_DISTRICT!=='undefined') dist=PK_KEY_TO_DISTRICT[unitKey]||null; }catch(_){}
      

      var meanDeg=(terrRef && terrRef.slope!=null) ? terrRef.slope : (slope!=null?slope:0);
      var slopePct=Math.tan(meanDeg*Math.PI/180)*100;
      var _storm=(stormMm!=null && isFinite(stormMm) && stormMm>0) ? stormMm : null;
      

      var s=AGN.nss.score(unitKey, dist, zone, slopePct, null, _storm);
      

      var _rcRaw = (_storm!=null && s && s.stormDynamicRunoffMm!=null)
                     ? (s.stormDynamicRunoffMm/_storm)
                     : (s && s.stormRunoffMm!=null && _storm!=null)
                       ? (s.stormRunoffMm/_storm)
                       : (s ? s.runoffCoefficient : null);
      if(s && s.ok && _rcRaw!=null){
        var rcN=hzClamp(_rcRaw,0,1);
        

        var _dBoost=null;
        try{
          if(window.AGN && AGN.cascade){
            var b=AGN.cascade.droughtRunoffBoost(unitKey);
            if(b && b.boost>0) _dBoost=b;
          }
        }catch(_){}
        var _p95=(terrRef&&terrRef.slopeP95!=null)?terrRef.slopeP95:null;
        var _varFlag=(_p95!=null && (_p95-meanDeg)>8);
        hzRunoffCoeff._lastBasis={
          

          basis:'NSS (observed land cover + slope + CN)'
                + (_storm!=null ? ' at the '+_storm.toFixed(1)+' mm event depth'
                                : ' at the 100 mm reference storm — no event depth supplied'),
          stormMm:_storm, stormBasis:(_storm!=null?'event 6 h accumulation':'reference storm'),
          arcApi:api, arcApplied:false,
          arcNote:'curve number held at AMC II (neutral): the antecedent shift is not applied until its back-test passes'
                 +(api!=null ? ' (API '+api.toFixed(2)+' reported, not applied)' : ''),
          droughtRunoffDiagnostic:(_dBoost ? ('drought '+_dBoost.droughtScore+'/100 would add +'+_dBoost.boost
                 +' to the runoff coefficient; not applied (no record supports it)') : null),
          confidence:s.confidence, hsg:s.hsg, hsgBasis:s.hsgBasis,
          retentionMm:s.retentionMm, fSlope:s.fSlope, methodVersion:s.methodVersion,
          slopeMeanDeg:+meanDeg.toFixed(1), slopeP95Deg:_p95,
          terrainVariability:_varFlag,
          terrainNote:_varFlag?('high terrain variability: mean '+meanDeg.toFixed(1)
            +' deg vs p95 '+_p95.toFixed(1)+' deg — prefer sub-unit maps over one unit score')
            :null};
        return rcN;
      }
    }
  }catch(e){ if(window.__MACH_DEBUG) console.debug('[NSS rc]', e&&e.message); }

   
  var base=(HZ_ZONES[zone]||HZ_ZONES.irrigated_plains).runoff;
  var rcFallback=hzClamp(base + Math.min(0.25, slope/35*0.25), 0, 1);
  

  hzRunoffCoeff._lastBasis={basis:'zone lookup fallback (no LCZ morphology for this unit)',
    confidence:'C', hsg:null, hsgBasis:null};
  return rcFallback;
}


function hzWetBulb(t, rh, elevM){
  if(typeof wetBulbStullC!=='function') return NaN;
  var w=wetBulbStullC(t, rh, Number.isFinite(+elevM)?{elevationM:+elevM}:null);
  return (w==null) ? NaN : w;
}
function hzWetBulbBasis(elevM){
  try{ return wetBulbBasis(Number.isFinite(+elevM)?{elevationM:+elevM}:null); }
  catch(_){ return 'wet-bulb basis unavailable'; }
}









function hzEffSlope(terr){
  if(!terr || terr.slope==null) return null;
  const p95 = terr.slopeP95;
  if(p95==null || !isFinite(p95)) return terr.slope;
  const relief = p95 - terr.slope;
  if(relief > 20) return terr.slope*0.4 + p95*0.6;   
  if(relief > 10) return terr.slope*0.7 + p95*0.3;   
  return terr.slope;                                  
}
window.hzEffSlope = hzEffSlope;



function hzRainIntensityIndex(mmPerHour){
  const mm = Number(mmPerHour);
  if(!Number.isFinite(mm)) return null;
  

  const _rb=FR('flood.rainBands'), _ra=FR('flood.rainAnchors'), _rt=FR('flood.rainAboveTop');
  return mm<=0 ? 0
       : mm<_rb[0] ? hzClamp(mm/_rb[0]*_ra[0], 0, _ra[0])
       : mm<_rb[1] ? hzClamp(_ra[0]+(mm-_rb[0])/(_rb[1]-_rb[0])*(_ra[1]-_ra[0]), _ra[0], _ra[1])
       : mm<_rb[2] ? hzClamp(_ra[1]+(mm-_rb[1])/(_rb[2]-_rb[1])*(_ra[2]-_ra[1]), _ra[1], _ra[2])
       : mm<_rb[3] ? hzClamp(_ra[2]+(mm-_rb[2])/(_rb[3]-_rb[2])*(_ra[3]-_ra[2]), _ra[2], _ra[3])
       :             hzClamp(_ra[3]+(mm-_rb[3])*_rt, _ra[3], 100);
}
function hzFlood(inp, terr, name, ext){
  if(!agnEngineHost()) return agnPageRefusal('flood');   /* v283.36 items 16 / 22: the page flood engine is off on client pages (the server issues the level) */
  ext=ext||{};
  

  const _slopeKnown = !!(terr && terr.slope!=null);
  const effSlope = _slopeKnown ? ((hzEffSlope(terr)!=null) ? hzEffSlope(terr) : terr.slope) : null;
  

  const _eventMm = (inp && inp.rain6hDay!=null && isFinite(inp.rain6hDay) && inp.rain6hDay>0)
                     ? Number(inp.rain6hDay) : null;
  const zone=terr.zone, rc=hzRunoffCoeff(zone, effSlope, name, terr,
                                         (inp&&inp.api!=null)?inp.api:null, _eventMm);
  

  

  const _rainNum=v=>(v===null||v===undefined||v===''||(typeof v==='string'&&!v.trim()))?NaN:Number(v);
  const _rainIn=_rainNum(inp && inp.rain);
  const _rainKnown=Number.isFinite(_rainIn);
  let mm=_rainKnown?_rainIn:0, snowCm=null, liquidBasis='all precipitation treated as liquid';
  try{
     
    const _dSel=(inp && inp.dayIndex!=null && isFinite(inp.dayIndex)) ? Math.max(0, Math.round(Number(inp.dayIndex))) : 0;
    const _d0=(Array.isArray(inp.days)&&inp.days.length)
      ? ((inp.dayDate!=null) ? (inp.days.find(function(d){ return d && d.date===inp.dayDate; })||null) : (inp.days[_dSel]||null))
      : null;
    if(_d0 && _d0.snow!=null && _d0.precip!=null){
      snowCm=Number(_d0.snow)||0;
      if(snowCm>0){
        const _swe=snowCm*FR('flood_ext.swePerCm');
        const _liq=Math.max(0, Number(_d0.precip)-_swe);
         
        const _share=(Number(_d0.precip)>0)?(_liq/Number(_d0.precip)):1;
        mm = (_liq<FR('flood_ext.liquidFloorMm')) ? 0 : mm*_share;
        liquidBasis='liquid share '+Math.round(_share*100)+'% ('+snowCm.toFixed(1)
          +' cm snow held as pack, released via the melt pathway)';
      }
    }
  }catch(_){}
  

  const _rb=FR('flood.rainBands'), _ra=FR('flood.rainAnchors'), _rt=FR('flood.rainAboveTop');
  const rainPulse = mm<=0 ? 0
                  : mm<_rb[0] ? hzClamp(mm/_rb[0]*_ra[0], 0, _ra[0])
                  : mm<_rb[1] ? hzClamp(_ra[0]+(mm-_rb[0])/(_rb[1]-_rb[0])*(_ra[1]-_ra[0]), _ra[0], _ra[1])
                  : mm<_rb[2] ? hzClamp(_ra[1]+(mm-_rb[1])/(_rb[2]-_rb[1])*(_ra[2]-_ra[1]), _ra[1], _ra[2])
                  : mm<_rb[3] ? hzClamp(_ra[2]+(mm-_rb[2])/(_rb[3]-_rb[2])*(_ra[3]-_ra[2]), _ra[2], _ra[3])
                  :             hzClamp(_ra[3]+(mm-_rb[3])*_rt, _ra[3], 100);

  

  let antecedent, antBasis;
  if(inp.api!=null){ antecedent=hzClamp(inp.api*100,0,100); antBasis='7-day API (rainfall memory)'; }
  else if(inp.soilMoist!=null){ antecedent=hzClamp(inp.soilMoist*FR('flood.soilFallbackK'),0,100); antBasis='soil moisture'; }
  

  /* v91.17.283.4 A4: the humidity fallback (relative humidity x 0.5 used as soil wetness) is removed: air humidity is not a measure of
     how wet the ground is. Without the 7-day rain memory or a soil-moisture reading the antecedent term stays unresolved. */
  else { antecedent=null; antBasis='unresolved — no rain memory or soil moisture arrived'; }

  

  let accum=null;
  if(inp.rain6hDay!=null && inp.dayIndex!=null){
    accum=hzClamp(inp.rain6hDay/FR('flood.accumFullScale')*100, 0, 100);
  } else if(inp.dayIndex==null){
    

    try{ const a6=(typeof rainAccum6h==='function'&&name)?rainAccum6h(name):null;
         if(a6!=null) accum=hzClamp(a6/FR('flood.accumFullScale')*100, 0, 100); }catch(e){}
  }

  const _fs=FR('flood.flashSlopeDeg'), _ff=FR('flood.flashFactors');
  

  

  const _ds=FR('flood.rainDriveSplit');
  

  let rainDrive = (accum!=null) ? Math.max(rainPulse, accum) : rainPulse;
  
  

  

  const antNorm   = (antecedent==null) ? null : hzClamp(antecedent/100, 0, 1);
  const antKnown  = (antNorm!=null);

  

  const _rcBasis = (typeof hzRunoffCoeff!=='undefined' && hzRunoffCoeff._lastBasis) ? hzRunoffCoeff._lastBasis : null;
  const _nssRc = !!(_rcBasis && _rcBasis.basis && _rcBasis.basis.indexOf('NSS')===0);

  const _wa=FR('flood.wetAmplifier');
  

  const _arcRan = !!(_nssRc && _rcBasis && _rcBasis.arcApplied);
  

  const wetAmp    = _arcRan ? 1 : (antKnown ? (_wa.dry + (_wa.saturated-_wa.dry)*antNorm) : 1);
  const satResid  = (_arcRan || !antKnown) ? 0 : antNorm*FR('flood.saturationResidualMax');
  const antecedentPath = _arcRan
    ? ('curve-number antecedent runoff condition inside the NSS coefficient · '
       + (_rcBasis.arcNote||''))
    : (!antKnown
        ? 'NO ANTECEDENT TERM — neither the rain memory nor soil moisture resolved for this unit, so the wetness amplifier and saturation residual are both dropped rather than scored as dry ground. The pluvial score below carries rainfall and runoff only.'
        : (_nssRc
            ? 'wetAmplifier + saturationResidual — NSS ran at AMC II, so its coefficient carries no antecedent term'
            : 'wetAmplifier + saturationResidual — the zone route carries no antecedent term'));
  

  const antecedentOnlyCore = antKnown ? antNorm*FR('flood.saturationResidualMax') : 0;
  const pluvialCore = hzClamp(rainDrive*wetAmp + satResid, 0, 100);

  

  const rcEff = _nssRc ? rc : (hzRunoffFloor(zone) + (1-hzRunoffFloor(zone))*rc);
  const _cb=FR('flood.cloudburstBonus');
  

  

  const _antFloorScore = antecedentOnlyCore * hzRunoffFloor(zone);
  

  const _rainDriveOn = (mm>0) || (typeof rainDrive==='number' && rainDrive>0);
  const pluvial = (!_rainDriveOn)
    ? hzClamp(_antFloorScore, 0, 100)
    : hzClamp(Math.max(
        

        pluvialCore * rcEff,
        _antFloorScore), 0, 100);

  

  let riverine=null, riverInfo=null;
  const rv=ext.river;
  if(rv && rv.covered){
    

    const _rb = FR('flood.riverineBlend');
    

    
    

    let melt=0;
    const _meltDriver = (ext.melt && ext.melt.score>0) ? Math.round(ext.melt.score) : 0;   

    

    let _rSrc='deterministic discharge on the return-period curve';
    

    var _hw=1, _hwWhy=null;
    try{ if(rv.hand && rv.hand.factor!=null && isFinite(rv.hand.factor)){ _hw=Math.max(0, Math.min(1, +rv.hand.factor)); _hwWhy=rv.hand.basis||rv.hand.why||null; }
         else _hwWhy=(window.HAND_TEHSIL&&HAND_TEHSIL.ready===false)?('HAND not served: '+(HAND_TEHSIL.why||'no table')):'HAND not computed for this unit (no HAND table in this install)'; }catch(_){ _hw=1; }
    let _tail=0;
    const _e=rv.ens;
    if(_e && _e.ratioMedian!=null){
      

      const _base=_e.ratioMedian*100;
      const _spread=(_e.ratioP90!=null?_e.ratioP90:_e.ratioMedian)*100 - _base;
      

      const _rt=FR('flood.riverineEnsembleTail');
      _tail=Math.min(_rt.cap, Math.max(0, _spread*_rt.spreadShare));
      

      

      riverine = hzClamp((_base+_tail) + melt, 0, 100);
      const _pc=v=>(v==null?'n/a':Math.round(v*100)+'%');
      _rSrc = _e.members+'-member median on the return-period curve (+'+Math.round(_tail)
            + ' tail) · P(>2yr)='+_pc(_e.exceed2)+', P(>5yr)='+_pc(_e.exceed5)
            + ', P(>20yr)='+_pc(_e.exceed20)
            + ' · peak in '+_e.leadDays+' day'+(_e.leadDays===1?'':'s');    
    } else if(Number.isFinite(Number(rv.ratio))) {
      riverine = hzClamp(Number(rv.ratio)*100 + melt, 0, 100);    
    } else {
      

      riverine = null;
    }

    var _gOut=null, _modelRiverine=riverine;
    try{ var _gd=(window.AGN&&AGN.day&&AGN.day.get)?(AGN.day.get()||0):0; var _gid=(window.agnReachIdOf&&rv.gauge)?agnReachIdOf(rv.gauge):null;
         if(_gid && window.agnGaugeOutlook) _gOut=agnGaugeOutlook.forReach(_gid, _gd); }catch(_){ _gOut=null; }
    if(_gOut){ var _GC=FR('gaugeOutlookCore'); var _gc=_GC[Math.max(0,Math.min(_GC.length-1,_gOut.cls))];
      riverine=hzClamp(_gc,0,100);
      _rSrc=(_gOut.measured?'measured flow at ':'AGN gauge outlook ('+_gOut.k+' day'+(_gOut.k===1?'':'s')+' ahead) at ')+_gOut.name+': '+_gOut.clsName
           +(_modelRiverine!=null?' · model-flow ladder '+Math.round(_modelRiverine)+' shown as context':''); }
    riverInfo = {ratio:(Number.isFinite(Number(rv.ratio))?+Number(rv.ratio).toFixed(2):null),
                 gaugeOutlook:_gOut, modelRiverine:(_modelRiverine==null?null:Math.round(_modelRiverine)),
                 ratioAvailable:Number.isFinite(Number(rv.ratio)),
                 riverineUnavailableWhy:(riverine==null && !(_e && _e.ratioMedian!=null))
                   ? 'the gauge is covered but this run returned no discharge value — the riverine '
                    +'pathway is not scored and the pluvial pathway carries the score'
                   : null,
                 level:rv.level, gauge:rv.gauge||null,
                 basis:rv.basis||null, pctOfBankfull:rv.pctOfBankfull!=null?rv.pctOfBankfull:null,
                 meltAdd:Math.round(melt), refYears:rv.refYears||null,
                  
                 exceed2:_e?_e.exceed2:null, exceed5:_e?_e.exceed5:null, exceed20:_e?_e.exceed20:null,
                 members:_e?_e.members:null, leadDays:_e?_e.leadDays:null,
                 medianQ:_e?_e.median:null, p10:_e?_e.p10:null, p90:_e?_e.p90:null,
                 ratioMedian:_e?_e.ratioMedian:null, ratioP90:_e?_e.ratioP90:null,
                 tailUplift:Math.round(_tail),
                 hand:rv.hand||null, handFactor:_hw, handWhy:_hwWhy,    
                 scoreBasis:_rSrc, ensembleUsed:!!(_e&&_e.ratioMedian!=null)};
  }

  

  const _pluvOK = _rainKnown;
  

  var _pwf=1, _pwWhy=null;
  try{ if(ext&&ext.where&&ext.where.applied&&ext.where.pluvialFactor!=null&&isFinite(ext.where.pluvialFactor)){ _pwf=Math.max(1, Math.min(1.3, +ext.where.pluvialFactor)); _pwWhy=ext.where.text||null; } }catch(_){ _pwf=1; }
  const _pluv   = _pluvOK ? hzClamp(pluvial*_pwf, 0, 100) : null;
  const _riv    = riverine;
  let governing, score, unavailable=false;
  if(_pluv==null && _riv==null){
    governing='none'; score=null; unavailable=true;
  } else if(_riv!=null && (_pluv==null || _riv>_pluv)){
    governing='riverine'; score=hzClamp(_riv,0,100);
  } else {
    governing='pluvial';  score=hzClamp(_pluv,0,100);
  }

   
  const rainActive = mm>0;
  const driverBasis = governing==='riverine' ? 'riverine'
                    : rainActive              ? 'rainfall'
                    : (accum!=null&&accum>0)  ? 'recent accumulation'
                    :                           'antecedent only';

  

  const _rvLead = (riverInfo && riverInfo.leadDays!=null) ? riverInfo.leadDays : null;
  const pathways = {
    pluvial:  (_pluv==null)
      ? { score: null, unavailable: true,
          basis: 'no rainfall value for this unit — pluvial pathway not scored' }
      : { score: Math.round(_pluv), leadHours: 12,
          basis: 'local cell — rain, intensity and storage over the next hours',
           
          where: (ext&&ext.where)?ext.where:null, whereFactor:_pwf, whereWhy:_pwWhy },
    riverine: (riverine==null)
      ? { score: null, unavailable: true,
          basis: (rv && rv.covered===false) ? 'no gauge upstream — river state unknown'
                                            : 'river sweep has not run' }
      : { score: Math.round(riverine),
          leadHours: _rvLead!=null ? _rvLead*24 : null,
          leadDays: _rvLead,
          basis: riverInfo ? riverInfo.scoreBasis : null,
          upstream: true }
  };
  

  const crossLayer = (function(){
    if(!_rainKnown || score==null) return null;
    var ri = null;
    try { ri = (typeof hzRainIntensityIndex==='function') ? hzRainIntensityIndex(mm) : null; } catch(_){}
    if(ri==null || !isFinite(ri)) return null;
    var gap = ri - score;
    if(Math.abs(gap) < 18) return null;              
    return {
      rainfallIndex: Math.round(ri), floodIndex: Math.round(score), gap: Math.round(gap),
      why: gap > 0
        ? ('the rainfall-intensity layer reads ' + Math.round(ri) + ' and this flood layer reads '
           + Math.round(score) + '. They measure different things: intensity is the rain itself, '
           + 'flood is the share of it that becomes runoff here. On this ground the curve-number '
           + 'runoff ratio is ' + rcEff.toFixed(2) + ' (' + (_rcBasis?_rcBasis.basis:'basis unknown')
           + '), and the first millimetres are absorbed by the initial abstraction before any '
           + 'runoff forms. High intensity with a low flood score means the water is expected to '
           + 'soak in or drain, not that the rain is not coming.')
        : ('this flood layer reads ' + Math.round(score) + ' against a rainfall intensity of '
           + Math.round(ri) + ', because the governing pathway is ' + governing
           + ' — water already in the system, not rain on this cell.'),
      calibrationNote: 'the flood ladder has not been validated against observed Pakistani flood '
                     + 'events. Read the gap as a statement about runoff, not as a verified '
                     + 'severity difference.'
    };
  })();

  const leadStatement = governing==='none'
    ? 'not scored — neither a rainfall value nor an upstream gauge is available'
    : governing==='riverine'
    ? (_rvLead!=null
        ? ('upstream signal — peak expected in ' + _rvLead + ' day' + (_rvLead===1?'':'s')
           + ', driven by rainfall already fallen upstream, not by local rain')
        : 'upstream signal — lead time not resolved')
    : 'local signal — hours, driven by rain on this cell';

  

  var _noPathway = (_pluv == null && riverine == null
                    && (governing == null || governing === 'none'));
  var _ctxScore = _noPathway ? (score == null ? null : Math.round(score)) : null;
  


  return { liquidBasis, snowCm,
          score:(score==null?null:Math.round(score)), unavailable:unavailable,
          pathwayUnavailable:_noPathway,
          contextScore:_ctxScore,
          contextScoreWhy:_noPathway
            ? 'an antecedent/context signal, not a flood pathway result. Neither the pluvial '
             +'nor the riverine pathway scored, so this build publishes no flood screening '
             +'value for this unit; the number is retained here as context only.' : null,
          why:_noPathway
            ? 'No pluvial rainfall input and no river discharge were available, so neither '
             +'flood pathway could be scored. Any antecedent signal is reported as context '
             +'and not as a flood score.'
            : undefined,
          noDataClass:_noPathway ? 'feed' : undefined,
          rainKnown:_rainKnown,
          kind: governing==='riverine' ? 'riverine flood (screening)'
              : effSlope>=12 ? 'flash flood (screening)' : 'pluvial flood (screening)',
          governingPath:governing, driverBasis:driverBasis, rainActive:rainActive,
          crossLayer:crossLayer,
          pathways:pathways, leadStatement:leadStatement,
          pluvial:(_pluv==null?null:Math.round(_pluv)), riverine:(riverine==null?null:Math.round(riverine)),
          river:riverInfo,
          riverCovered:!!(rv&&rv.covered), riverChecked:!!rv,
          runoff:rc, runoffFloor:_nssRc?null:hzRunoffFloor(zone), rcEff:+rcEff.toFixed(3),
          runoffBasis:_rcBasis?_rcBasis.basis:'unknown',
          runoffConfidence:_rcBasis?_rcBasis.confidence:null,
          nssRetentionMm:(_rcBasis&&_rcBasis.retentionMm!=null)?_rcBasis.retentionMm:null,
          hsg:_rcBasis?_rcBasis.hsg:null, hsgBasis:_rcBasis?_rcBasis.hsgBasis:null,
          terrainVariability:_rcBasis?!!_rcBasis.terrainVariability:false,
          terrainNote:_rcBasis?_rcBasis.terrainNote:null,
          rainPulse:Math.round(rainPulse), antecedent:(antecedent==null?null:Math.round(antecedent)), antecedentAvailable:(antecedent!=null), antecedentBasis:antBasis, antecedentPath:antecedentPath,
          accum:(accum==null?null:Math.round(accum)), accumAvailable:(accum!=null),
          rainDrive:Math.round(rainDrive), wetAmp:+wetAmp.toFixed(2),
          saturationResidual:Math.round(satResid),
          weightsUsed:(accum!=null?'intensity+6h accumulation':'intensity only (6h window unavailable)')
                      +' x wetAmp '+wetAmp.toFixed(2)+' + saturation residual '+Math.round(satResid),
          api:(inp.api!=null?+inp.api.toFixed(2):null),
          effSlope:(effSlope!=null?+effSlope.toFixed(1):null),
          slopeMean:(terr.slope!=null?+terr.slope.toFixed(1):null),
          slopeP95:(terr.slopeP95!=null?+terr.slopeP95.toFixed(1):null)};
}











/* v91.17.283.24 · W1 · THE HAZARD ENGINE RUNS ON THE SERVER ONLY. hzScore and the hazard formulas (hzHeat, hzWind, hzCold) are the server's
   hazard engine: the server runs this page's scripts in its own engine host (server/engine/vmpage.mjs with ?engine=1; server/science holds
   the same code), and GET /api/levels, /api/levels/unit and the place bundle's levels part are its answers. In a browser they refuse, so no
   section can show a level of its own: the map, the place, the sites and the AI tab read the served levels (AGN.v283, AGN.engineLevels). */
function agnEngineHost(){ try{ return (typeof navigator!=='undefined'&&navigator.platform==='engine')||/[?&]engine=1(&|$)/.test(String((typeof location!=='undefined'&&location.search)||'')); }catch(_){ return false; } }
function agnPageRefusal(hazard){
  var why='not assessed on this page: hazard levels are computed by the server and shown as it issues them';
  return { score:null, riskSignal:null, mapValue:null, noData:true, notAssessed:true, pageRefusal:true, noDataWhy:why, noDataClass:'served',
           noDataClassLabel:'Not assessed', noDataClassNote:why, physicalMeasurand:null, physicalUnit:null, physicalValue:null, screeningIndex:null,
           screeningBand:null, categorical:false, top:'Not assessed', kind:(hazard||'hazard'), driver:'Not assessed', why:why, basis:why,
           metricLabels:['Not assessed','\u2014','\u2014','\u2014'], notes:[why,'','',''], drivers:[0,0,0,0] }; }
try{ window.agnEngineHost=agnEngineHost; window.agnPageRefusal=agnPageRefusal; }catch(_){}
function hzHeat(inp, terr){
  if(!agnEngineHost()) return agnPageRefusal('heat');

  const zone=terr.zone;
  

  const _n=v=>(v===null||v===undefined||v===''||(typeof v==='string'&&!v.trim()))?NaN:Number(v);
  const _anyT=[inp&&inp.heatDryTemp, inp&&inp.t, inp&&inp.heatWetBulbAirTemp,
               inp&&inp.heatWetBulbTemp, inp&&inp.feels, inp&&inp.heatApparentMax]
              .some(v=>Number.isFinite(_n(v)));
  if(!_anyT){
    return {score:null, unavailable:true,
            basis:'no temperature input — not scored',
            rhBasis:'not computed'};
  }
  

  const _rhIn = (inp && inp.heatMeanRh!=null) ? _n(inp.heatMeanRh) : _n(inp && inp.hum);
  const _rhOk = Number.isFinite(_rhIn);
  

  const wetT  = inp.heatWetBulbAirTemp!=null ? inp.heatWetBulbAirTemp
              : inp.heatWetBulbTemp!=null ? inp.heatWetBulbTemp : inp.t;
  const wetRh = _rhOk ? _rhIn : null;
  

  const _wbElev = (terr && Number.isFinite(+terr.elev)) ? +terr.elev
                : (inp && Number.isFinite(+inp.elev)) ? +inp.elev : null;
  const wb = _rhOk ? hzWetBulb(wetT, wetRh, _wbElev) : NaN;
  const _wbBasis = hzWetBulbBasis(_wbElev);
  

  const _wbRefused = _rhOk && !Number.isFinite(wb);
  

  const _feelsDirect = inp.heatApparentMax!=null ? inp.heatApparentMax
                     : (inp.feels!=null ? inp.feels : null);
  
  const feels = _feelsDirect!=null ? _feelsDirect : inp.t;
  
  const airT = inp.heatDryTemp!=null ? inp.heatDryTemp : inp.t;
   
  const _wl=FR('heat.wetBulbLadder');
  

  const wbStress = !Number.isFinite(wb) ? null : (function(P){
    if(wb<=P[0][0]) return 0;
    for(var i=1;i<P.length;i++){
      if(wb<=P[i][0]){
        var a=P[i-1], b=P[i];
        return hzClamp(a[1]+((wb-a[0])/(b[0]-a[0]))*(b[1]-a[1]),0,100);
      }
    }
    return 100;
  })(_wl.points);
  

   
  const HEAT_ABS_FLOOR_C = (function(){ try{ var v=FR('heat.localThresholdFloorC'); return Number.isFinite(v)?v:28; }catch(_){ return 28; } })();
  const _zoneThr = (HZ_ZONES[zone]||HZ_ZONES.irrigated_plains).heatThr;
  const _tx90In  = (inp && inp.tx90!=null && Number.isFinite(Number(inp.tx90))) ? Number(inp.tx90) : null;
  const _heatThr = (_tx90In!=null) ? Math.max(_tx90In, HEAT_ABS_FLOOR_C) : _zoneThr;
  const _heatThrBasis = (_tx90In==null)
    ? ('zone constant ' + _zoneThr + ' °C — no local climatology is held for this unit')
    : (_tx90In < HEAT_ABS_FLOOR_C
        ? ('local 90th-percentile daily maximum is ' + _tx90In.toFixed(1) + ' °C for this date, raised to the '
           + HEAT_ABS_FLOOR_C + ' °C physiological floor — locally unusual warmth here is not heat-health stress')
        : ('local 90th-percentile daily maximum for this date (' + _tx90In.toFixed(1)
           + ' °C, global reanalysis 1991-2020), not a zone constant'));
  

  const _airVsLocal = (airT!=null ? airT : feels);
  const airStress=hzClamp((_airVsLocal-_heatThr)*FR('heat.airStressSlope'), 0, 100);
  const _feelsFloorK = (function(){ try{ var v=FR('heat.feelsFloorFactor'); return Number.isFinite(v)?v:0.5; }catch(_){ return 0.5; } })();
  const _feelsFloor = (feels!=null && _heatThr!=null)
    ? hzClamp((feels-_heatThr)*FR('heat.airStressSlope')*_feelsFloorK, 0, 100) : null;   

  const dryHeat = hzClamp((airT-FR('heat.dryOnsetC'))*FR('heat.drySlope'), 0, 100);   

  const dryZone = (zone==='arid_plains'||zone==='irrigated_plains'||zone==='rainfed');
   
  const _hp=FR('heat.humidPathWeights'), _dp=FR('heat.dryPathWeights');
  

  

  

  const _wbOut = (wbStress==null);
  const _renorm = (num, wsum) => (wsum>0 ? num/wsum : null);
  const humidPath = _wbOut
    ? _renorm(airStress*_hp.airTemp, _hp.airTemp)
    : Math.max(wbStress, wbStress*_hp.wetBulb + airStress*_hp.airTemp);
  const dryPath   = dryZone
    ? (dryHeat*_dp.dryZone.dryHeat + airStress*_dp.dryZone.airTemp)
    : (_wbOut
        ? _renorm(dryHeat*_dp.other.dryHeat + airStress*_dp.other.airTemp,
                  _dp.other.dryHeat + _dp.other.airTemp)
        : 

          Math.max(wbStress,
            _renorm(dryHeat*_dp.other.dryHeat + airStress*_dp.other.airTemp,
                    _dp.other.dryHeat + _dp.other.airTemp)));
  

  let _wbLowerBound=null, _wbLbStress=null;
  if(_wbOut && Number.isFinite(airT) && typeof hzWetBulb==='function'){
    try{ const _lb=hzWetBulb(airT, 20, _wbElev);   if(_lb!=null && isFinite(_lb)){ _wbLowerBound=Math.round(_lb*10)/10;
      _wbLbStress=(function(P){ if(_lb<=P[0][0]) return 0; for(var i=1;i<P.length;i++){ if(_lb<=P[i][0]){ var a=P[i-1], b=P[i]; return hzClamp(a[1]+((_lb-a[0])/(b[0]-a[0]))*(b[1]-a[1]),0,100); } } return 100; })(_wl.points); } }catch(_){}
  }
  const humidPathBounded = (_wbLbStress!=null && humidPath!=null) ? Math.max(humidPath, _wbLbStress) : humidPath;
  const _pathRenormalised = _wbOut && !dryZone;
  const _pathNote = _wbOut
    ? ('no wet-bulb term for this unit, so the remaining weights were renormalised'
       + (_wbLowerBound!=null ? ('; a wet-bulb LOWER BOUND at 20 % humidity (' + _wbLowerBound + ' C) enters as a floor, so the absence of humidity cannot read as relief') : '')
       + '. The humid pathway is a bound here, which is a WIDER uncertainty than a scored wet bulb, not a lower hazard.')
    : null;
  

  let score = hzClamp(Math.max(humidPathBounded==null?0:humidPathBounded, dryPath==null?0:dryPath,
                               (_feelsFloor==null?0:_feelsFloor)), 0, 100);
  
  
  
  
  
  
  
  

  let nightUplift=0, radUplift=0, nightMinUsed=null, radUsed=null;
  {
    const _dv=inp.derived||{};
    const _tmin=(inp.tMinWarmest!=null)?inp.tMinWarmest:_dv.tMinWarmest;
    if(_tmin!=null){
      nightMinUsed=_tmin;
      

      const _oC=FR('heat.nightReliefOnsetC'), _fC=FR('heat.nightReliefFullC');
      const _tn90In=(inp && inp.tn90!=null && Number.isFinite(Number(inp.tn90))) ? Number(inp.tn90) : null;
      const _o=(_tn90In!=null)?Math.max(_tn90In,_oC):_oC, _f=_o+(_fC-_oC);    
      nightUplift = hzClamp((_tmin-_o)/(_f-_o), 0, 1) * FR('heat.nightUpliftMax');
    }
    const _rad=(inp.radToday!=null)?inp.radToday:_dv.radToday;
    if(_rad!=null){
      radUsed=_rad;
      

      let _vent=1;
      try{
      }catch(_){}
      const _ventFactor = hzClamp(2 - _vent, 0.5, 1.6);    
      radUplift = hzClamp(_rad/FR('heat.radFullScaleMJ'), 0, 1) * FR('heat.radUpliftMax') * _ventFactor;
    }
    

    
  }
  let ehf=null,ehiSig=null,ehiAccl=null,ehfSaturated=false,ehfSaturationAt=null;
  

  

  var _t95c = (inp.tm95Clim!=null && isFinite(inp.tm95Clim)) ? +inp.tm95Clim : null;
  var _ehfClim = _t95c!=null || !(inp.t95Basis && inp.t95Basis.isClimatology===false);
  var _t95use = _t95c!=null ? _t95c : inp.t95;
  if(_ehfClim && inp.tm3!=null && _t95use!=null && inp.tm30!=null){
    ehiSig  = inp.tm3 - _t95use;
    ehiAccl = inp.tm3 - inp.tm30;
    ehf = Math.max(0,ehiSig) * Math.max(1,ehiAccl);
    

    

    const _ehfSat = FR('heat.ehfSevereC2') * 100 / FR('heat.ehfScaleTo');
    const ehfScore = hzClamp((ehf/FR('heat.ehfSevereC2'))*FR('heat.ehfScaleTo'), 0, 100);
    ehfSaturated = ehf >= _ehfSat;
    ehfSaturationAt = Math.round(_ehfSat*10)/10;
    score = hzClamp(Math.max(score, ehfScore), 0, 100);
  }

  

  const _legacyIndex = Math.round(score);
   
  const _fh = !!(inp && inp.timeBasis==='forecast hour');
  let _uS = (!_fh && inp && inp.heatUtciShade!=null && isFinite(+inp.heatUtciShade)) ? +inp.heatUtciShade : null;
  let _uBasis = (!_fh && inp && inp.heatUtciBasis) || null, _uCalm = !_fh && !!(inp && inp.heatUtciCalm);
  

  let _uLead = _fh ? 'forecast hour' : (inp && inp.timeBasis==='current') ? 'present hour' : (_uS!=null ? 'day peak' : null);
  let _uPeakT = null, _uDayTmax = null, _uAt = null;
  if(_uS==null && !_fh && inp && inp.timeBasis==null && inp.fc72 && typeof hzDayWindow==='function'){
    try{ const _dw=hzDayWindow(inp.fc72, 0, 'heat'), _pp=_dw&&_dw.utciPair;
      if(_pp && _pp.u!=null && isFinite(+_pp.u)){
        _uS=+_pp.u; _uCalm=!!_pp.calm; _uLead='day peak'; _uAt=_pp.time||null;
        _uPeakT=(_pp.t!=null&&isFinite(+_pp.t))?+_pp.t:null; _uDayTmax=(_dw.tmax!=null&&isFinite(+_dw.tmax))?+_dw.tmax:null;
        _uBasis='UTCI in shade at the hour of the day\'s highest UTCI ('+String(_pp.time||'').slice(11,16)+' PKT), from this unit\'s hourly series'+(_pp.calm?'; no wind at that hour, calm reference wind used (an upper bound)':''); } }catch(_){}
  }
   
  const _uTa = (_fh && Number.isFinite(_n(inp.t))) ? _n(inp.t) : +airT, _uRh = (_fh && Number.isFinite(_n(inp.hum))) ? _n(inp.hum) : _rhIn;
  if(_uS==null && _rhOk && Number.isFinite(_uTa) && typeof agnUtci==='function'){
    const _wk=_n(inp && ((!_fh && inp.heatUtciWind!=null) ? inp.heatUtciWind : inp.wind));
    _uCalm = !Number.isFinite(_wk);
    _uS = agnUtci(_uTa, _uTa, _uCalm?0.5:_wk/3.6, _uRh);
    _uBasis = 'UTCI in shade from the air temperature, humidity and wind supplied'+(_uCalm?'; no wind supplied, calm reference wind (0.5 m/s) used: wind changes UTCI either way (lower in moderate heat, higher above about 40 °C)':'');
  }
  if(_uLead==null) _uLead = (inp && inp.timeBasis==='peak') ? 'day peak' : 'present hour';
  const _uDay = (inp && inp.dayIndex!=null && isFinite(+inp.dayIndex)) ? +inp.dayIndex : 0;
  const _uHm = _uAt ? String(_uAt).slice(11,16) : (function(){ var m=/\((\d{2}:\d{2}) PKT\)/.exec(String(_uBasis||'')); return m?m[1]:null; })();
  const _uLeadLabel = _uLead==='forecast hour' ? ('the forecast hour at +'+((inp&&inp.forecastHorizonHours!=null)?inp.forecastHorizonHours:'?')+' h')
                    : _uLead==='present hour' ? 'the present hour'
                    : ((_uDay>0 ? ('the hottest hour of day +'+_uDay) : 'the hottest hour today')+(_uHm?' ('+_uHm+' PKT)':''));
  if(_uS==null || !isFinite(_uS)){
    return {score:null, unavailable:true, reason:(_rhOk?'UTCI could not be computed for this hour (inputs outside the UTCI polynomial range), so heat is not scored'
                                                       :'no humidity value: UTCI needs humidity and none is assumed, so heat is not scored'),
            basis:'heat severity is UTCI in shade; not computed', rhBasis:(_rhOk?'humidity supplied':'humidity unavailable'),
            legacyIndex:_legacyIndex, legacyRole:'diagnostic (weight 0)'};
  }
  const _agnU = (typeof agnUtciAgnScore==='function') ? agnUtciAgnScore(_uS) : null;
  const _uClass = (typeof agnUtciClass==='function') ? agnUtciClass(_uS) : null;
   
  if(_agnU==null || !isFinite(_agnU)){
    return {score:null, unavailable:true, reason:'the UTCI value could not be placed on the AGN level mapping, so heat is not scored',
            basis:'heat severity is UTCI in shade; AGN level mapping unavailable', utciShade:_uS, utciClass:_uClass,
            rhBasis:(_rhOk?'humidity supplied':'humidity unavailable'), legacyIndex:_legacyIndex, legacyRole:'diagnostic (weight 0)'};
  }
  score = _agnU;

  return {score:Math.round(score), unavailable:false,
          severityQuantity:'UTCI in shade', utciShade:_uS, utciAirC:(_uPeakT!=null?_uPeakT:((!_fh&&inp&&inp.heatUtciT!=null&&isFinite(+inp.heatUtciT))?+inp.heatUtciT:(Number.isFinite(_uTa)?_uTa:null))), utciClass:_uClass, utciBasis:_uBasis, utciCalmWind:_uCalm, utciLead:_uLead, utciLeadLabel:_uLeadLabel, utciDayIndex:(_uLead==='day peak'?_uDay:null),
          agnMapping:{class:'convention', version:((typeof AGN_UTCI_AGN_MAP!=='undefined'&&AGN_UTCI_AGN_MAP.version)||null), why:'AGN level mapped from the published UTCI value; an internal convention, not a published threshold'},
          localAnomalyC:((_uDayTmax!=null&&Number.isFinite(+_uDayTmax)&&_tx90In!=null)?Math.round((+_uDayTmax-_tx90In)*10)/10:null),    
           localAnomalyBasis:'air temperature minus this unit\'s local 90th-percentile daily maximum for the date (reported, not scored)',
          

          utciLocal:(function(){ var p50=inp&&inp.utci50, p90=inp&&inp.utci90, p95=inp&&inp.utci95; if(_uS==null||p90==null||!isFinite(+p90)) return null;
            var r=(p95!=null&&_uS>=+p95)?'above this place\'s 95th percentile for the date':(_uS>=+p90)?'above this place\'s 90th percentile for the date':(p50!=null&&_uS>=+p50)?'above the median for this place and date':'at or below the median for this place and date';
            return {p50:p50, p90:+p90, p95:p95, rank:r, basis:'daily maximum shade UTCI, 1996-2025, 15-day window (reported, not scored)'}; })(),
          legacyIndex:_legacyIndex, legacyRole:'diagnostic (weight 0): the withdrawn wet-bulb / air / dry / apparent / EHF index, kept for comparison only',
          rhBasis:(_rhOk?'humidity supplied — wet-bulb path active'
                       :'humidity unavailable — wet-bulb path not used, score from dry path only'),
          wetBulbUsed:_rhOk,
          wb, dryHeat:Math.round(dryHeat),
          nightUplift:Math.round(nightUplift*10)/10, radUplift:Math.round(radUplift*10)/10,
          upliftsApplied:false, warmNightFlag:(nightUplift>=4), strongSunFlag:(radUplift>=6),
          upliftsNote:'warm-night and radiation terms are reported as flags and are not added to the index (they would have added '+(Math.round((nightUplift+radUplift)*10)/10)+')',
          nightMinUsed, radUsed,
          humidPath:(humidPath==null?null:Math.round(humidPath)), dryPath:(dryPath==null?null:Math.round(dryPath)),
          pathRenormalised:_pathRenormalised, pathNote:_pathNote,
          wbStress:(wbStress==null?null:Math.round(wbStress)), airStress:Math.round(airStress),
          heatThr:_heatThr, heatThrZoneConstant:_zoneThr, heatThrLocalTx90:_tx90In, heatThrBasis:_heatThrBasis,
          feelsUsed:feels, airTempUsed:airT, wetBulbTempUsed:wetT, wetBulbRhUsed:wetRh,
          governingPath:(dryPath>=humidPath?'dry':'humid'), dryZone:dryZone,
          ehf:(ehf!=null?+ehf.toFixed(1):null), ehiSig:(ehiSig!=null?+ehiSig.toFixed(1):null), ehiAccl:(ehiAccl!=null?+ehiAccl.toFixed(1):null),
          ehfSaturated, ehfSaturationAt,
          ehfWhy:(ehf==null?null:(ehfSaturated
            ? ('the Excess Heat Factor is '+(+ehf.toFixed(1))+' C² against a scale that reaches 100 at '+ehfSaturationAt+' C², so this score is at the top of an UNCALIBRATED scale rather than at the worst case this unit can reach. The divisor is a national stand-in; Nairn & Fawcett define severity against the local 85th percentile of positive EHF, which this build does not hold.')
            : ('Excess Heat Factor '+(+ehf.toFixed(1))+' C²; this scale reaches 100 at '+ehfSaturationAt+' C² and the divisor is a national stand-in, not a local percentile.')))};
}












function hzWind(inp, terr){
  if(!agnEngineHost()) return agnPageRefusal('wind');
   
  const _gustLive=(inp && inp.gust!=null && inp.gust!=='');
  

  

  const _num=v=>(v===null||v===undefined||v===''||(typeof v==='string'&&!v.trim()))?NaN:Number(v);
  const _wIn=_num(inp && inp.wind), _gIn=_num(inp && inp.gust);
  const _anyWind = Number.isFinite(_gIn) || Number.isFinite(_wIn);
  

  

  const _wCut = (function(){ try{ var v=FR('wind.mountainWithholdM'); return Number.isFinite(v)?v:1500; }catch(_){ return 1500; } })();
  const _wEl = Number(inp && inp.elev != null ? inp.elev
             : (terr && Number.isFinite(Number(terr.emin)) ? terr.emin
             : (terr && terr.elev != null ? terr.elev : NaN)));
  if (Number.isFinite(_wEl) && _wEl >= _wCut) {
    return { score:null, unavailable:true, mountainWithheld:true, elevation:_wEl,
             reason:'wind is not scored above 1,500 m (this site: '+Math.round(_wEl)+' m): measured against '
                   +'mountain stations the model gust raised 19 false alarms in 20 at 40 km/h and the model '
                   +'sustained wind ran at half the observed speed. Withheld until a terrain wind correction is validated.',
             gustBasis:'withheld above 1,500 m' };
  }

  

  

  const _windEstimated = !!(inp && (inp.windEstimated === true
                        || inp.estimated === true
                        || inp.fcSource === 'agn_field_estimate'));
  if (!Number.isFinite(_gIn) && Number.isFinite(_wIn) && _windEstimated) {
    return { score:null, unavailable:true,
             gustBasis:'no gust value, and the sustained wind at this unit is an '
                     + 'estimate from live neighbours rather than a retrieval — a gust '
                     + 'derived from it would be a threshold crossing no model produced',
             windEstimated:true,
             reason:'gust not derivable from an estimated wind' };
  }
  const gust = Number.isFinite(_gIn) ? _gIn
             : NaN;   /* v283.36 item 17: no 1.5 gust factor: gust not forecast */
  const _ex=FR('wind.exposureMax');
  

  

  const _tri = (terr && terr.tri!=null) ? Number(terr.tri) : NaN;
  const _triOk = Number.isFinite(_tri);
  const exposure = _triOk ? (1+Math.min(_ex, _tri/FR('wind.triFullScale')*_ex)) : 1;
  const _gustN = Number(gust);
  if(!_anyWind || !Number.isFinite(_gustN)){
    return {score:null, unavailable:true, exposure:null,
            gustBasis:'no wind input — not scored', exposureBasis:'not computed'};
  }
  

  const _wlad = FR('wind.ladder').points;
  

  const _wOnset = FR('wind.onsetKmh');
  const _wSlope = FR('wind.slope');
  if (_wlad[0][0] !== _wOnset ||
      Math.abs(((_wlad[1][1]-_wlad[0][1])/(_wlad[1][0]-_wlad[0][0])) - _wSlope) > 0.005) {
    try{ console.warn('[AGN] wind.onsetKmh/slope disagree with wind.ladder'); }catch(_){ }
  }
  const _wbase = (function(P){
    if(_gustN<=P[0][0]) return 0;
    for(var i=1;i<P.length;i++){
      if(_gustN<=P[i][0]){
        var a=P[i-1], b=P[i];
        return a[1]+((_gustN-a[0])/(b[0]-a[0]))*(b[1]-a[1]);
      }
    }
    return 100;
  })(_wlad);
  const raw = _wbase*exposure;

  const _sc=hzClamp(raw,0,100);
  return {score:Number.isFinite(_sc)?Math.round(_sc):null,
          unavailable:!Number.isFinite(_sc),
          exposure, gustBasis:(_gustLive?'forecast-gust':'sustained-wind-fallback'),
          exposureBasis:(!(_ex>0)?'no terrain amplification (not supported by the station test)':(_triOk?'terrain ruggedness applied':'terrain ruggedness unavailable — no amplification'))};   

}



function hzCold(inp, terr){
  if(!agnEngineHost()) return agnPageRefusal('cold');
  var L=null; try{ L=hzColdLegacyRamp(inp, terr); }catch(_){ L=null; }
  var _n=function(v){ return (v==null||v===''||!isFinite(+v))?null:+v; };
  var fh=!!(inp && inp.timeBasis==='forecast hour');
  var u=(!fh && inp && _n(inp.coldUtciShade)!=null) ? +inp.coldUtciShade : null, basis=(!fh && inp && inp.coldUtciBasis) || null, calm=!fh && !!(inp && inp.coldUtciCalm);
  if(u==null){
    var _tmin0=inp ? (inp.tminDay!=null ? inp.tminDay : (inp.tmin!=null ? inp.tmin : (Array.isArray(inp.days)&&inp.days[0]&&inp.days[0].tmin!=null ? inp.days[0].tmin : inp.t))) : null;    
    var tmin=_n(inp && (fh ? inp.t : _tmin0)), rh=_n(inp && (inp.coldUtciRh!=null && !fh ? inp.coldUtciRh : inp.hum)), wk=_n(inp && inp.wind);
    if(tmin==null) return {score:null, unavailable:true, reason:'no temperature value for this unit, so cold is not scored'};
    if(rh==null || typeof agnUtci!=='function') return {score:null, unavailable:true, reason:'no humidity value: UTCI needs humidity and none is assumed, so cold is not scored'};
    calm=(wk==null); u=agnUtci(tmin, tmin, calm?0.5:wk/3.6, rh); basis=fh?'UTCI in shade for this hour':'UTCI in shade from the day\'s minimum temperature, mean humidity and mean wind (no hourly pair held)';
    if(u==null) return {score:null, unavailable:true, reason:'UTCI could not be computed for these inputs (outside the polynomial range), so cold is not scored'};
  }
   
  if(calm && basis && !/lower bound/.test(basis)) basis+='; no wind held, so calm wind (0.5 m/s) is used: a lower bound on cold stress, any wind makes it colder';
  var sc=(typeof agnUtciColdScore==='function') ? agnUtciColdScore(u) : null;
  var cls=(typeof agnUtciClass==='function') ? agnUtciClass(u) : null;
  var tmin2=_n(inp && (inp.tminDay!=null ? inp.tminDay : (inp.tmin!=null ? inp.tmin : (Array.isArray(inp.days)&&inp.days[0]&&inp.days[0].tmin!=null ? inp.days[0].tmin : inp.t)))), tn10=_n(inp && inp.tn10);
  return {score:(sc==null?null:Math.round(sc)), unavailable:sc==null, severityQuantity:'UTCI in shade (cold)', utciShade:u, utciClass:cls, utciBasis:basis, utciCalmWind:calm,
          coldUtciAirC:_n(inp && inp.coldUtciT), coldUtciWindKmh:_n(inp && inp.coldUtciWind),
          agnMapping:{class:'convention', version:((typeof AGN_UTCI_COLD_MAP!=='undefined'&&AGN_UTCI_COLD_MAP.version)||null), why:'one AGN level per published UTCI cold-stress class; an internal convention'},
          localAnomalyC:(tmin2!=null&&tn10!=null)?Math.round((tmin2-tn10)*10)/10:null, localAnchorC:tn10,
          localAnomalyBasis:'night minimum minus this unit\'s 10th-percentile night minimum for the date (1996-2025): negative means colder than nine nights in ten here (reported, not scored)',
          legacyRampScore:(L&&L.score!=null)?L.score:null, legacyRole:'diagnostic (weight 0): the withdrawn tn10-anchored ramp',
          utciLocal:(function(){ var c50=_n(inp&&inp.utciC50), c10=_n(inp&&inp.utciC10), c05=_n(inp&&inp.utciC05); if(c10==null) return null;
            var r=(c05!=null&&u<=c05)?'below this place\'s 5th percentile for the date':(u<=c10)?'below this place\'s 10th percentile for the date':(c50!=null&&u<=c50)?'below the median for this place and date':'above the median for this place and date';
            return {p05:c05, p10:c10, p50:c50, rank:r, basis:'daily minimum shade UTCI, 1996-2025, 15-day window (reported, not scored)'}; })(),
          elevBasis:L?L.elevBasis:null, coldBasis:'severity is the day\'s lowest UTCI in shade, published cold-stress class '+(cls||'')+'; the AGN level is the convention one level per class'};
}
function hzColdLegacyRamp(inp, terr){
  if(!(HZ_ZONES[terr.zone]||{}).coldGate) return {score:0, gated:true};

  

  

  const _tminDay = (inp && Number.isFinite(inp.tmin)) ? inp.tmin
                 : (inp && Array.isArray(inp.days) && inp.days[0] && Number.isFinite(inp.days[0].tmin)) ? inp.days[0].tmin : null;
  const t=(_tminDay!=null)?Math.min(_tminDay, Number.isFinite(inp.t)?inp.t:_tminDay):inp.t;
  

  if(!Number.isFinite(t)) return {score:null, unavailable:true,
    reason:'no temperature value for this unit — cold is not scored'};

  

  const mon=(function(){ try{ if(window.MACH_TIME&&MACH_TIME.day) return +MACH_TIME.day(0).slice(5,7); }catch(_){}
                         return new Date().getMonth()+1; })();
  

  const _cs = FR('cold.seasonFactors');
  const seasonFactor = (mon>=11||mon<=3) ? _cs.coreNovToMar
                     : (mon===10||mon===4) ? _cs.shoulderOctApr
                     : _cs.offSeason;                    

  
  const liveElev = Number.isFinite(inp.elev) ? inp.elev : null;
  const floorElev = Number.isFinite(terr.emin) ? terr.emin : null;
  const useElev = liveElev!=null ? liveElev
                : (floorElev!=null ? floorElev : terr.elev);

  

  const _CT={ COLD_RAMP_ZERO_AT:FR('cold.rampZeroAtC'), COLD_RAMP_MID_AT:FR('cold.rampMidAtC'),
              COLD_RAMP_MID_VAL:FR('cold.rampMidValue'), COLD_RAMP_SLOPE:FR('cold.rampSlopeBelow') };
  const _z=_CT.COLD_RAMP_ZERO_AT, _m=_CT.COLD_RAMP_MID_AT, _mv=_CT.COLD_RAMP_MID_VAL;
  const coldStress = t>=_z ? 0
                   : t>=_m ? hzClamp((_z-t)*(_mv/(_z-_m)), 0, 100)
                   : hzClamp(_mv + (_m-t)*_CT.COLD_RAMP_SLOPE, _mv, 100);
   
  

  const _ea=FR('cold.elevAmpBands');
  const elevAmp = useElev>=3000 ? _ea.at3000m
                : useElev>=2000 ? (_ea.at2000m + (_ea.at3000m-_ea.at2000m)*hzClamp((useElev-2000)/1000,0,1))
                : (1 + (_ea.at2000m-1)*hzClamp((useElev-1000)/1000,0,1));
   
  

  const _tn10 = (inp && Number.isFinite(inp.tn10)) ? inp.tn10 : null;
  const _localAnchor = (_tn10 != null);
  

  if(!_localAnchor) return {score:null, unavailable:true, reason:'the local cold baseline (this unit\'s 10th-percentile night minimum for the date) has not loaded, so cold is not scored'};
  

  const _TN10_MARGIN_C = (function(){ try{ var v=FR('cold.localAnchorMarginC'); return Number.isFinite(v)?v:2; }catch(_){ return 2; } })();
  const _AB = (function(){ try{ var b=FR('cold.anchorBounds'); return (b&&Number.isFinite(b.shiftMaxC))?b:{shiftMinC:0,shiftMaxC:8}; }catch(_){ return {shiftMinC:0,shiftMaxC:8}; } })();
  

  const _anchorRaw = _localAnchor ? (_tn10 + _TN10_MARGIN_C) : null;
  const _anchorC = _localAnchor ? Math.min(_anchorRaw, _z) : null;
  const _shiftRaw = _localAnchor ? (_z - _anchorC)
                                 : ((seasonFactor>=1) ? 0 : (seasonFactor>=0.5 ? 4 : 8));
  const _shift = Math.max(_AB.shiftMinC, Math.min(_shiftRaw, Math.min(_AB.shiftMaxC, _z)));
  const _anchorClamped = _localAnchor && (_anchorRaw > _z || _shiftRaw > _z);
  const tGated = t + _shift;
  const _gatedStress = tGated>=_z ? 0
                     : tGated>=_m ? hzClamp((_z-tGated)*(_mv/(_z-_m)), 0, 100)
                     : hzClamp(_mv + (_m-tGated)*_CT.COLD_RAMP_SLOPE, _mv, 100);
  

  const score=Math.round(hzClamp(_gatedStress,0,100));
  return {score:score, elevBasis:useElev, season:seasonFactor, seasonShiftC:_shift,
          elevAmp:1, elevAmpDiagnostic:Math.round(elevAmp*100)/100,
          rawColdStress:Math.round(coldStress),
          localAnchorC:_tn10, localAnchorUsed:_localAnchor, anchorClamped:_anchorClamped,
          anchorBasis:(_anchorClamped
            ? ('the local anchor ('+(_anchorRaw!=null?_anchorRaw.toFixed(1):'?')+' C) fell outside the bounds [0 C shift, ramp zero '+_z+' C], so the ramp is bounded there: a warm place cannot read an ordinary night as frost, and a glacier-mean polygon cannot hide a valley frost')
            : null),
          coldBasis:(_localAnchor
            ? ('anchored on this unit\'s own climatology: the 10th-percentile daily minimum for this day of year is '
               + _tn10.toFixed(1) + ' °C (1996-2025 operational normal), so the ramp starts ' + _TN10_MARGIN_C
               + ' °C below that. A score here means the air is colder than about nine nights in ten are at this place at this time of year — not colder than some national figure.')
            : 'NO LOCAL ANCHOR — the 1996-2025 tn10 for this unit did not arrive, so a fixed seasonal shift of ' + _shift + ' °C is used instead. That is a national fallback, not a local threshold.'),
          seasonBasis:(_shift===0
            ? 'winter core (Nov-Mar): the ramp is used as calibrated'
            : 'out of season: the ramp is shifted '+_shift+' C colder so ordinary warm-season nights score nothing, while air that is genuinely cold for this place and date reaches the full scale. The previous build multiplied the SCORE by '+seasonFactor+' instead, which capped the attainable score at '+Math.round(seasonFactor*100)+'/100 whatever the temperature.'),
          offSeason:(seasonFactor<1)};
}

function hzGLOF(name, inp, terr){
  if(!agnEngineHost()) return agnPageRefusal('glof');   /* v283.36 items 16 / 18: page GLOF engine off client */
  

  try{
    var _N=(window.__agnGlofNat&&__agnGlofNat.units)?__agnGlofNat.units[name]:null;
    if(_N){
      var _rd=(typeof resolveDistrict==='function')?resolveDistrict(name):name;
      var _rg=(typeof GLOF_REGISTER!=='undefined'&&GLOF_REGISTER)?(GLOF_REGISTER[_rd]||GLOF_REGISTER[name]||null):null;
      var _ev=_rg?('expert register (evidence only): tier '+_rg.tier+', '+(_rg.named&&_rg.named.length?_rg.named.join(', '):'no named glacier')+(_rg.note?' \u00b7 '+_rg.note:'')):'no expert-register entry for this district';
      var _bul=(window.__agnGlofNat.bulletin&&__agnGlofNat.bulletin.published)?__agnGlofNat.bulletin.published:null;
      if(_N.applicable===false || _N.class==='Not applicable'){    
        return {score:null, notApplicable:true, gated:true, sourceState:'lake-routed', glofClass:'N', lakeClass:'Not applicable',
                categorical:true, category:'Not applicable', categoryLabel:'GLOF corridor: not applicable', mapValue:null,
                note:(_N.text||_N.basis), basis:_N.basis, evidence:_ev, bulletin:_bul, model:'lake-routed-class',
                kind:'GLOF level from the mapped glacial lakes routed 100 km along HydroBASINS'};
      }
       
      var _GLAD={Low:10,Monitor:36,Watch:60,Act:90};
      if(!Object.prototype.hasOwnProperty.call(_GLAD, String(_N.class))){
        return {score:null, categorical:true, unrecognisedClass:true, noData:true, lakeClass:String(_N.class==null?'none':_N.class),
                category:null, mapValue:null, categoryLabel:'GLOF level: no reading', basis:_N.basis, evidence:_ev, bulletin:_bul,
                sourceState:'lake-routed', model:'lake-routed-class', note:_N.basis,
                reason:'the lake-routed class for this unit ('+(_N.class==null?'none':_N.class)+') is not one the GLOF ladder issues, so no level is issued',
                kind:'GLOF level from the mapped glacial lakes routed 100 km along HydroBASINS'};
      }
      var _mv=(_N.index!=null)?Math.max(6,Math.round(_N.index*100)):_GLAD[_N.class];    
      

      var _gStand=(_N.class==='Monitor');
      return {score:null, categorical:true, category:(_N.class==='Low'?'Normal':_gStand?'Susceptible (standing, not a forecast)':_N.class), standingSusceptibility:_gStand, categoryLabel:(_gStand?'GLOF level: Normal (susceptible lakes upstream, a standing condition, not a forecast)':('GLOF level: '+({Low:'Normal',Watch:'High',Act:'Severe'}[_N.class]||_N.class)+(_N.class==='Low'?' (lakes upstream, nothing found)':''))), mapValue:_mv,    
              lakeClass:_N.class, basis:_N.basis, counts:{priority:_N.priority,watch:_N.watch,expanding:_N.expanding}, corridorBasins:_N.corridorBasins,
              named:_N.named||[], evidence:_ev, bulletin:_bul, sourceState:'lake-routed', model:'lake-routed-class',
              note:_N.basis,
              kind:'GLOF level from the mapped glacial lakes routed 100 km along HydroBASINS; the district expert register is evidence, not the fill'};
    }
  }catch(_){}
  
  
  
  
  
  
  
  
  
  const glofDist=resolveDistrict(name);   

  

  var AGN_GLOF_REG_ALIAS = {
    'Gupis-Yasin':'Gupis Yasin', 'Gupis Yasin':'Gupis Yasin',
    'Gupis':'Gupis Yasin', 'Yasin':'Gupis Yasin', 'Phandar':'Gupis Yasin',
    'Mastuj':'Chitral Upper', 'Mulkhow':'Chitral Upper', 'Torkhow':'Chitral Upper',
    'Chitral':'Chitral Lower', 'Drosh':'Chitral Lower', 'Lotkoh':'Chitral Lower',
    'Chitral Upper':'Chitral Upper', 'Chitral Lower':'Chitral Lower'
  };
  var _regKey = null, _regVia = null;
  if(typeof GLOF_REGISTER!=='undefined' && GLOF_REGISTER){
    if(GLOF_REGISTER[glofDist]!=null){ _regKey=glofDist; }
    else if(GLOF_REGISTER[name]!=null){ _regKey=name; }
    else {
      

      var _a = AGN_GLOF_REG_ALIAS[name] || AGN_GLOF_REG_ALIAS[glofDist] || null;
      if(_a && GLOF_REGISTER[_a]!=null){ _regKey=_a; _regVia=(AGN_GLOF_REG_ALIAS[name]?name:glofDist)+' → '+_a; }
    }
  }
  const reg = _regKey!=null ? GLOF_REGISTER[_regKey] : null;
  if(!reg){
    

    

    var AGN_GLOF_NO_PATH = {"Attock":"D","Awaran":"E","Badin":"E","Baka Khel":"E","Balanari":"E","Baldia Town":"E","Banda Daud Shah":"D","Bannu":"E","Baqrani":"D","Barkhan":"E","Barshore":"E","Basima":"E","Bela":"E","Bettani":"E","Bhag":"E","Bhakkar":"E","Bhalwal":"D","Bhera":"D","Bhiria":"E","Bin Qasim Town":"E","Birmal":"E","Buleda":"E","Bulri Shah Karim":"D","Central Orakzai":"E","Chachro":"E","Chagai":"E","Chakwal":"E","Chaman":"E","Chamber":"D","Chattar":"E","Chiniot":"E","Choa Saidan Shah":"D","Dadu":"E","Daharki":"E","Dahli":"E","Dalbandin":"E","Daraban":"E","Darazinda":"E","Darya Khan":"D","Dasht":"E","Dasht Spenzend":"E","Data Khel":"E","Daulat Pur":"E","Daur":"E","Dera Bugti":"E","Dera Ghazi Khan":"D","Dera Ismail Khan":"E","Dera Murad Jamali":"E","Dhadar":"E","Digri":"E","Diplo":"E","Dobandi":"E","Dokri":"E","Domel":"E","Dossali":"E","Drug":"E","Duki":"E","Dunyapur":"E","Dureji":"E","Faisalabad City":"E","Faiz Ganj":"E","Fateh Jang":"E","Fort Abbas":"E","Gadap Town":"E","Gaddani":"E","Gambat":"D","Gandakha":"E","Gandawa":"E","Garhi Khairo":"E","Garhi Yasin":"D","Garyum":"E","Ghorabari":"E","Ghotki":"D","Ghulam Khan":"E","Gichk":"E","Gishekore":"E","Gowargo":"E","Gujar Khan":"E","Gulberg Town":"E","Gulistan":"E","Gulshan Iqbal Town":"E","Gwadar":"E","Hala":"D","Hangu":"E","Harnai":"E","Hazro":"D","Hub":"E","Huramzai":"E","Hussain Bux Muree":"D","Hyderabad":"D","Hyderabad City":"D","Isakhel":"D","Islam Kot":"E","Islamabad":"E","Ismailzai":"E","Jacobabad":"D","Jaheen Parome":"E","Jam Nawaz Ali":"D","Jamshaid Town":"E","Jand":"D","Jandola":"E","Jati":"E","Jehangira":"D","Jhal Jhao":"E","Jhal Magsi":"E","Jhando Mari":"D","Jhat Pat":"E","Jhelum":"D","Jhudo":"E","Jiwani":"E","Johi":"E","Kahan":"E","Kakar Khurasan":"E","Kakki":"E","Kalat":"E","Kallar Kahar":"D","Kallar Sayaddan":"E","Kaloi":"E","Kalur Kot":"D","Kandh Kot":"D","Kandiaro":"E","Kanraj":"E","Karak":"D","Karezat":"E","Karor Lal Esan":"E","Kashmore":"D","Kech (Turbat)":"E","Kemari Town":"E","Keti Bunder":"E","Khairpur":"D","Khairpur Nathan Shah":"E","Khaliqabad":"E","Khangarh":"D","Khanpur":"E","Kharan":"E","Kharo Chan":"E","Khattan":"E","Khipro":"E","Khushab":"E","Khuzdar":"E","Killa Abdullah":"E","Killa Saifullah":"E","Kingri":"E","Kirdgap":"E","Kohat":"D","Kohlu":"E","Korangi Town":"E","Kot Addu":"D","Kot Diji":"D","Kot Ghulam Muhammad":"E","Kot Momin":"D","Kotri":"D","Kulachi":"E","Kunri":"E","Lachi":"D","Lahor":"D","Lairi":"E","Lakhi":"D","Lakhra":"E","Lakki Marwat":"D","Lalian":"E","Landhi Town":"E","Larkana":"D","Latifabad":"D","Lehri":"E","Leiah":"D","Liaqatabad Town":"E","Liaqatpur":"E","Liyari Town":"E","Lodhran":"E","Loralai":"E","Lower Kurram":"E","Mach":"E","Makin":"E","Malakwal":"D","Malir Town":"E","Mand":"E","Mandi Bahauddin":"D","Manjhand":"D","Mashkai":"E","Mashkhel":"E","Mastung":"E","Matiari":"D","Matli":"D","Mawand":"E","Meero Khan":"E","Mehar":"E","Mehrab Pur":"E","Mekhtar":"E","Mianwali":"D","Mir Ali":"E","Miran Shah":"E","Mirpur Bathoro":"D","Mirpur Khas":"D","Mirpur Mathelo":"D","Mirpur Sakro":"E","Miryan":"E","Mithi":"E","Mola":"E","Moro":"E","Multan City":"D","Musakhel":"E","Muslim Bagh":"E","Muzaffargarh":"D","Naal":"E","Nag":"E","Nagar Parkar":"E","Nara":"E","Nasir Abad":"E","Naushahro Feroze":"E","Naushera":"D","Nawabshah":"E","New Karachi Town":"E","New Sukkur":"D","Nokkundi":"E","Noorpur":"E","North Nazimabad Town":"E","Nushki":"E","Orangi Town":"E","Ormara":"E","Paharpur":"D","Panjgur":"E","Panjpai":"E","Pano Aqil":"D","Paroa":"E","Pasni":"E","Phelawagh":"E","Pind Dadan Khan":"D","Pindi Gheb":"E","Piplan":"D","Pishin":"E","Pithoro":"E","Qambar Ali Khan":"E","Qasimabad":"D","Quaidabad":"D","Qubo Saeed Khan":"E","Quetta City":"E","Quetta Saddar":"E","Rahim Yar Khan":"D","Rajanpur (Tribal Area)":"D","Rakhni":"E","Rato Dero":"D","Rawalpindi":"E","Razar":"D","Razmak":"E","Rohri":"D","Rojhan":"D","Saddar Town":"E","Sadiqabad":"D","Saeedabad":"D","Sahiwal":"E","Sakrand":"D","Salehpat":"D","Samaro":"E","Sanghar":"E","Sanni":"E","Sar Kharan":"E","Sarai Naurang":"E","Saranan":"E","Sararogha":"E","Sargodha":"E","Sehwan Sharif":"E","Serwakai":"E","Shah Bunder":"E","Shah Faisal Town":"E","Shahdad Kot":"E","Shahdadpur":"D","Shaheed Fazil Rahu":"E","Shahpur":"E","Shakargarh":"E","Shaogari":"E","Shawal":"E","Sherani":"E","Shewa":"E","Shikarpur":"D","Shuja Abad":"E","Sibi":"E","Sijawal Junejo":"D","Sindhri":"E","Sinjawi":"E","Sinjhoro":"E","Site Town":"E","Sobho Dero":"D","Sohbatpur":"E","Sonmiani":"E","Spinwam":"E","Sui":"E","Sujawal":"E","Sukkur":"D","Sunster":"E","Surab":"E","Taftan":"E","Takht-E-Nasrati":"D","Tala Gang":"D","Talhar":"E","Tall":"E","Tamboo":"E","Tandlian Wala":"E","Tando Adam":"D","Tando Allahyar":"D","Tando Bago":"E","Tando Ghulam Hyder":"D","Tando Muhammad Khan":"D","Tangwani":"D","Tank":"E","Taunsa":"D","Taxila":"E","Thano Bula Khan":"D","Thari Meer Wah":"D","Thatta":"D","Thul":"D","Tiarza":"E","Toi Khulla":"E","Tomulk":"E","Tump":"E","Ubauro":"D","Umer Kot":"E","Upper Orakzai":"E","Usta Mohammad":"E","Uthal":"E","Wadh":"E","Wana":"E","Warah":"E","Washuk":"E","Wazir":"E","Yazman":"E","Zehri":"E","Zhob":"E","Ziarat":"E"};
    var _gt=null; try{ _gt=(typeof hzTerrainFor==='function')?hzTerrainFor(name):null; }catch(_){}
    var _gemax=(_gt && _gt.emax!=null && isFinite(_gt.emax)) ? Math.round(Number(_gt.emax)) : null;
    var _GLACIER_FLOOR_M = 3500;
    if(_gemax!=null && _gemax >= _GLACIER_FLOOR_M){
      return {score:null, noData:true, gated:true, sourceState:'inventory-unresolved', glofClass:'B',
              note:'no GLOF inventory record covers this unit, and its own terrain reaches '+_gemax
                  +' m — high enough to hold a glacial lake. Source presence is UNKNOWN, so no score is '
                  +'produced. This unit needs an inventory survey.'};
    }
    var _np = AGN_GLOF_NO_PATH[name] || null;
    if(_np==='D'){
      return {score:null, notApplicable:true, gated:true, sourceState:'not-applicable', glofClass:'D',
              note:'no glacial lake can exist in this unit — its highest ground is '
                  +(_gemax!=null?_gemax+' m':'below the glacier floor')+', under the 3,500 m at which '
                  +'glacial lakes occur in the Hindu Kush-Karakoram-Himalaya — and an outburst from the '
                  +'upper Indus or Jhelum is intercepted by Tarbela or Mangla before it reaches here. '
                  +'What would arrive is a river flood, which the riverine flood hazard scores separately.'};
    }
    if(_np==='E'){
      return {score:null, notApplicable:true, gated:true, sourceState:'not-applicable', glofClass:'E',
              note:'no glacial lake can exist in this unit — its highest ground is '
                  +(_gemax!=null?_gemax+' m':'below the glacier floor')+' — and no glacier-fed river '
                  +'reaches within 80 km. GLOF is not a pathway here.'};
    }
    return {score:null, noData:true, gated:true, sourceState:'inventory-unresolved',
            note:'no GLOF inventory record for this unit — source presence unknown, so no '
                +'score is produced. Elevation and temperature alone cannot establish a source.'};
  }
  

  var _nat=(typeof window!=='undefined')?window.__agnGlofNat:null;
  return {score:null, noData:true, gated:true, glofClass:'P',
          sourceState:(_nat&&_nat.units)?'not-in-lake-table':'lake-table-pending', model:'lake-routed-class',
          note:(_nat&&_nat.units)
            ? 'the lake-routed GLOF class (server) lists no class for this unit, so no level is issued'
            : 'the lake-routed GLOF class has not reached this page yet; no level is issued until it does',
          evidence:reg?('expert register (evidence only): tier '+reg.tier+', '+(reg.named&&reg.named.length?reg.named.join(', '):'no named glacier')+(reg.note?' · '+reg.note:'')):null};
}

function hzDrought(name){
  if(!agnEngineHost()) return agnPageRefusal('drought');   /* v283.36 item 25: page drought screen off client */
  
  
  
  const drDist=resolveDistrict(name);   

  

  const d=(typeof DISTRICT_SPI!=='undefined')?(DISTRICT_SPI[name]||DISTRICT_SPI[drDist]):null;
  

  if(d && d.composite==null && d.arid){
    return {score:null, notApplicable:true, arid:true, gated:true, sourceState:'not-defined',
            note:d.aridWhy||'arid: the standardised drought indices are not defined where the window’s climatological rainfall is under 10 mm',
            model:'spi-fao56-composite', model_label:'SPI/SPEI refused: arid baseline', src:'arid mask'};
  }
  if(d && d.composite!=null){
    

    var _p=(d.parts||[]).map(function(x){return x.k;});
    var _names={fao56:'FAO-56 root-zone stress', spi:'SPI-30/90 precipitation anomaly',
                spei:'SPEI-90 water-balance anomaly',
                smPct:'root-zone soil moisture percentile against this unit\u2019s own global reanalysis record'};
    var _src=_p.length ? _p.map(function(k){return _names[k]||k;}).join(' + ')
                       : 'no index contributed';
    if(_p.length===1) _src += ' only — the other index did not return for this unit';
    

    var _spiS=(d.spiStress!=null)?d.spiStress:null, _faoS=(d.faoStress!=null)?d.faoStress:null;
    var _diverge=null;
    if(_spiS!=null && _faoS!=null && Math.abs(_spiS-_faoS)>=40){
      _diverge = (_spiS>_faoS)
        ? ('meteorological drought without soil-water stress: the precipitation anomaly scores '
           + _spiS + '/100 while the root zone scores ' + _faoS + '/100. The last '
           + '90 days have been unusually dry, and the soil is not short of water today - '
           + 'irrigation, recent rain or antecedent storage is currently covering the deficit. '
           + 'The composite of ' + d.composite + ' is the average of those two, and averages '
           + 'the disagreement away.')
        : ('soil-water stress without a precipitation anomaly: the root zone scores ' + _faoS
           + '/100 while the 90-day precipitation anomaly scores ' + _spiS + '/100. Rainfall has '
           + 'been near normal and the root zone is still short - heat, demand or drainage, not '
           + 'a rainfall deficit.');
    }
    return {score:d.composite, spi3:d.spi3, fao:d.faoStress, src:_src,
            divergence:_diverge, spiStress:_spiS, faoStress:_faoS,
            spi90:d.spi90, spei90:d.spei90, soilBasis:d.soilBasis||null,
             
            model:'spi-fao56-composite',
             
            model_label:(d.droughtMonth?('SPI-1 / SPI-3 for '+d.droughtMonth.label+' (calendar month)'+(d.droughtMonth.prelim?', preliminary rain':'')+' + FAO-56 root-zone stress'):'SPI-30/90 precipitation anomaly + FAO-56 root-zone stress, ')
                       +(d.droughtMonth?'':'weighted mean of whichever indices returned'),
            model_window:(d.droughtMonth?('calendar month '+d.droughtMonth.label+'; last month '+d.droughtMonth.prevLabel):'30 and 90 day'),
            droughtMonth:d.droughtMonth||null, droughtChange:(d.droughtClass&&d.droughtClass.change)||null,
            parts:d.parts, confidence:d.confidence,
            

            serverClass:(d.droughtClass&&d.droughtClass.class)||null, highValley:!!d.provisional, highValleyWhy:d.provisionalWhy||null,
            rainSource:d.rainSource||null};
  }
  return null;
}



var HZ_INPUTS = {
  heat:            ['t','hum'],
  telco_heat:      ['t','hum'],
  flood:           ['rain','soilMoist','api'],
  

  flood_pluvial:   ['rain','soilMoist','api'],
  flood_riverine:  [],
  telco_flood:     ['rain','soilMoist','api'],
  rain_hz:         ['rain'],
  wind:            ['gust','wind'],
  telco_wind:      ['gust','wind'],
  cold:            ['t'],
  

  drought:         [],
  landslide:       ['rain','soilMoist'],
  

  glof:            ['t','rain'],
  telco_lightning: ['rain','t','gust'],
  cyclone:         [],
  seismic:         []
};

function hzInputState(inp, field){
  if(!inp) return { state:'absent', why:'no input row for this unit' };
  var v = inp[field];
  if(v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v)))
    return { state:'absent',
             why:(typeof hzInputLabel==='function' ? hzInputLabel(field) : field)
                 + ' is not held for this unit' };
  var estimated = (inp.estimated === true) || (inp.fcSource === 'agn_field_estimate')
               || (field === 'wind' && inp.windEstimated === true);
  if(estimated)
    return { state:'design', estimated:true, value:v,
             why:(typeof hzInputLabel==='function' ? hzInputLabel(field) : field)
                 + ' is estimated from live neighbours, not measured at this unit' };
  var retrieved = (inp.fcSource === 'tehsil_centroid_open_meteo')
               || inp.nationalLive === true || inp.weatherLive === true || inp.forecastLive === true;
  return retrieved
    ? { state:'retrieved', value:v,
        why:(typeof hzInputLabel==='function' ? hzInputLabel(field) : field)
            + ' retrieved from the forecast model for this unit' }
    : { state:'design', value:v,
        why:(typeof hzInputLabel==='function' ? hzInputLabel(field) : field)
            + ' has no live value — no live measurement has landed here' };
}



var HZ_INPUT_LABEL = {
  t:         'air temperature',
  hum:       'relative humidity',
  rain:      'rainfall',
  soilMoist: 'soil moisture 7-28 cm',
  smRoot:    'root-zone soil moisture',
  api:       'antecedent wetness',
  gust:      'wind gust',
  wind:      'sustained wind',
  pm25:      'PM2.5 concentration'
};
function hzInputLabel(f){ return HZ_INPUT_LABEL[f] || f; }
 
function hzJoinPlain(list){
  if(!list.length) return '';
  if(list.length===1) return list[0];
  return list.slice(0,-1).join(', ') + ' and ' + list[list.length-1];
}


var HZ_STATE_WORD = {
  retrieved: 'retrieved from the forecast model for this unit',
  design:    'a design or estimated value, not a measurement for this unit',
  absent:    'not held for this unit'
};
var HZ_STATE_WORD_PLURAL = {
  retrieved: 'retrieved from the forecast model for this unit',
  design:    'design or estimated values, not measurements for this unit',
  absent:    'not held for this unit'
};
try{ window.HZ_INPUT_LABEL=HZ_INPUT_LABEL; window.hzInputLabel=hzInputLabel; }catch(_){}

function hzProvenance(inp, hazard){
  var fields = HZ_INPUTS[hazard] || [];
  var rows = fields.map(function(f){
    var st = hzInputState(inp, f); st.field = f; return st;
  });
  if(!rows.length){
    

    var _srv = { drought:'scored from the national global reanalysis SPEI/SPI-90 and root-zone soil-moisture table built on the server (window to the last global reanalysis day, about five days back), not from this row\u2019s live fields',
                 flood_riverine:'scored from the upstream global river-flow model reach, not from this row\u2019s live fields' }[hazard];
    if(_srv) return { state:'retrieved', inputs:[], serverTable:true, why:_srv };
    return { state:'design', inputs:[],
             why:'scored from static inputs only \u2014 no live measurement feeds this hazard' };
  }
  var RANK = { absent:0, design:1, retrieved:2 };
  

  var present = rows.filter(function(r){ return r.state !== 'absent'; });
  if(!present.length)
    return { state:'absent', inputs:rows,
             why:'not scored \u2014 ' + hzJoinPlain(fields.map(hzInputLabel))
                 + (fields.length===1 ? ' is' : ' are') + ' not held for this unit' };
  var worst = present.reduce(function(a,r){
    return RANK[r.state] < RANK[a] ? r.state : a; }, 'retrieved');
  var driver = present.filter(function(r){ return r.state === worst; })[0];
  

  var weakLabels = present.filter(function(r){ return r.state===worst; })
                          .map(function(r){ return hzInputLabel(r.field); });
  var absentRows = rows.filter(function(r){ return r.state==='absent'; });
  var why;
  if(worst==='retrieved'){
    why = 'every governing input is retrieved from the forecast model for this unit ('
        + hzJoinPlain(present.map(function(r){ return hzInputLabel(r.field); })) + ')';
  } else {
    why = (weakLabels.length===1 ? 'the weakest input is ' : 'the weakest inputs are ')
        + hzJoinPlain(weakLabels) + ' \u2014 '
        + (weakLabels.length===1 ? (HZ_STATE_WORD[worst] || worst)
                                 : (HZ_STATE_WORD_PLURAL[worst] || HZ_STATE_WORD[worst] || worst));
  }
  if(absentRows.length){
    why += '. ' + hzJoinPlain(absentRows.map(function(r){ return hzInputLabel(r.field); }))
         + (absentRows.length===1 ? ' is' : ' are') + ' not held at all, so '
         + (absentRows.length===1 ? 'that route is' : 'those routes are') + ' not used';
  }
  return { state:worst, inputs:rows, driver:(driver&&driver.field)||null,
           driverLabel:(driver&&hzInputLabel(driver.field))||null, why:why };
}
try{ window.hzProvenance = hzProvenance; window.hzInputState = hzInputState; window.HZ_INPUTS = HZ_INPUTS; }catch(_){}



(function(G){
  'use strict';
  var AGN = G.AGN = G.AGN || {};
  

  var MODE = 'live';
  try{ if(G.__AGN_RUNTIME_MODE__ === 'fixture') MODE = 'fixture'; }catch(_){}
  var WHY = {
    live:   'LIVE. A dynamic hazard scores only from retrieved provider evidence. '
          + 'Where neither live weather nor feature enrichment arrived, the hazard is '
          + 'reported unavailable rather than scored from a seed.',
    fixture:'FIXTURE. Example values are permitted so the architecture can be exercised '
          + 'with no provider. Nothing produced in this mode may be issued, and every '
          + 'document says so.'
  };
  AGN.runtimeMode = {
    get mode(){ return MODE; },
    modes: function(){ return ['live','fixture']; },
    why: function(){ return WHY[MODE]; },
    isFixture: function(){ return MODE === 'fixture'; },
    set: function(m){
      m = String(m || '').toLowerCase();
      if(m !== 'live' && m !== 'fixture') return MODE;
      MODE = m;
      try{ G.document.documentElement.setAttribute('data-agn-runtime-mode', MODE); }catch(_){}
      try{ G.document.dispatchEvent(new CustomEvent('agn:runtime-mode',{detail:{mode:MODE}})); }catch(_){}
      return MODE;
    },
    version:'v91.17'
  };
  try{ G.document.documentElement.setAttribute('data-agn-runtime-mode', MODE); }catch(_){}
  

  try{
    G.document.addEventListener('agn:runtime-mode', function(ev){
      try{
        var m = (ev && ev.detail && ev.detail.mode) || MODE;
        G.document.documentElement.setAttribute('data-agn-runtime-mode', m);
      }catch(_){}
      try{ G.document.dispatchEvent(new CustomEvent('agn:project',
             { detail:{ reason:'runtime-mode' } })); }catch(_){}
    });
  }catch(_){}
})(window);



var AGN_DYNAMIC_HAZARDS = ['flood','heat','drought','wind','cold','landslide','rain_hz'];
function agnProviderEvidencePresent(inp){
  if(!inp) return false;
  return !!(inp.weatherLive || inp.featureLive || inp.nationalLive
            || (inp.fcSource != null && inp.fcSource !== ''));
}

function hzScore(name, inp, hazard, lead, tehsilKey){
  if(!agnEngineHost()) return agnPageRefusal(hazard);   /* W1: a browser never scores a hazard */
  

  if(inp === null || inp === undefined){
    return { score:null, unavailable:true, kind:(hazard||'hazard')+' (screening)',
             reason:'no input data was supplied for this unit',
             basis:'hzScore was called with no input object, so there is nothing to '
                  +'score. This is a refusal, not a failure: the unit has no retrieved '
                  +'data and is reported as no data.' };
  }
  

  try{
    var _rk=tehsilKey||name;
    if(_rk && window.DISTRICT_IN && inp===window.DISTRICT_IN[_rk] && typeof hzDayInput==='function' && typeof hzDayCapable==='function' && hzDayCapable(hazard==='flood_pluvial'||hazard==='flood_riverine'?'flood':hazard)){
      var _di=hzDayInput(_rk, hazard==='flood_pluvial'||hazard==='flood_riverine'?'flood':hazard);
      if(_di && !_di.__unavailable) inp=_di;
    }
  }catch(_){}
  

  try{
    if(AGN_DYNAMIC_HAZARDS.indexOf(String(hazard)) >= 0
       && !agnProviderEvidencePresent(inp)
       && !(window.AGN && AGN.runtimeMode && AGN.runtimeMode.isFixture())){
      

      var _rc = (HZ_REFUSAL_CLASS && HZ_REFUSAL_CLASS.feed) || {};
      

      var _wy = 'The live forecast for this place had not arrived when it was screened, so '
              + 'no score is given. NIGRAAN never scores a hazard from stored example values. '
              + 'Screen again once the forecast has loaded.';
      return { score:null, riskSignal:null, mapValue:null,
               mapValueWhy:'no provider evidence arrived for this unit, so there is nothing '
                          +'to shade',
               noData:true, noDataWhy:_wy,
               noDataClass:'feed',
               noDataClassLabel:_rc.label || 'Input missing',
               noDataClassNote:_rc.note
                 || 'the method applies here and the data it needs did not arrive',
               providerUnavailable:true,
               physicalMeasurand:null, physicalUnit:null, physicalValue:null,
               physicalWhy:'no physical quantity is published without a provider reading',
               screeningIndex:null, screeningBand:null,
               scaleType:null, scaleWhy:null, categorical:false,
               provenance:null,
               top:'Not scored \u2014 provider evidence unavailable',
               kind:(hazard||'hazard')+' (screening)',
               driver:'Live provider evidence unavailable',
               metricLabels:['Live provider evidence unavailable','\u2014','\u2014','\u2014'],
               notes:[_wy,'','',''],
               drivers:[0,0,0,0],
               why:_wy,
               basis:'the provider did not answer for this unit, so the hazard is unavailable '
                    +'rather than scored from a seed' };
    }
  }catch(_){}

  

  var _hazNoData=false;
  

  var _floodRes=null, _heatRes=null;    
  
  
  
  
  
  
  

  if (typeof AGN_DISPUTED_KEY !== 'undefined' && AGN_DISPUTED_KEY &&
      (String(name||'').indexOf(AGN_DISPUTED_KEY) >= 0 ||
       String(tehsilKey||'').indexOf(AGN_DISPUTED_KEY) >= 0)) {
    return { score:null, riskSignal:null, noData:true,
             noDataWhy:'disputed territory — shown on the map, never scored. NIGRAAN scores '
                     + '576 tehsils of Pakistan; this feature is outside that set and no '
                     + 'hazard verdict is issued for it.',
             noDataClass:'ineligible',
             noDataClassLabel:'Not scored here',
             noDataClassNote:'AGN renders Indian Illegally Occupied Jammu and Kashmir as '
                           + 'disputed territory and issues no operational verdict for it.',
             disputed:true,
             physicalMeasurand:null, physicalUnit:null, physicalValue:null,
             physicalWhy:'no physical quantity is published for disputed territory',
             screeningIndex:null, screeningBand:null,
             scaleType:null, scaleWhy:null,
             provenance:null, top:'Not scored — disputed territory',
             metricLabels:['Not scored — disputed territory','—','—','—'],
             notes:['disputed territory','','',''], drivers:[0,0,0,0],
             zone:null, zoneLabel:null, terr:null, kind:'not scored' };
  }
  const terr=hzTerrainFor(name, tehsilKey);

  const lf=1;
  const _leadScaled=false;  
  
  
  
  const RAIN_DEP=new Set(['flood','telco_flood','rain_hz','glof']);
  const rainNoData = RAIN_DEP.has(hazard) && isNoData(inp&&inp.rain);
  let core, drivers, metricLabels, notes, top, kind='';
  

  let _categorical=false, _mapValue=null, _category=null, _categoryZone=null, _categoryLabel=null, _measurand=null,
      _evidenceClass=null, _evidenceClassWhy=null;

  

  var _hazNoDataWhy = null;

  function _absent(r) {
    return !r || r.unavailable === true || r.score === null || r.score === undefined
        || !isFinite(Number(r.score));
  }
  

  

  var _hazNoDataClass = null;
  function _noScore(kindLabel, why, label, refusalClass) {
    _hazNoData = true;
    _hazNoDataWhy = why || 'the governing input for this hazard was not available';
    _hazNoDataClass = refusalClass || 'feed';
    core = 0;
    drivers = [0, 0, 0, 0];
    metricLabels = [(label || kindLabel) + ' — not scored', '—', '—', '—'];
    notes = [_hazNoDataWhy, '', '', ''];
    top = 'Not scored';
    kind = kindLabel;
  }
   
  var HZ_REFUSAL_CLASS = {
    ineligible:{ label:'Not applicable here',
                 note:'the mechanism cannot occur at this site, so there is no score to give '
                     +'and no data that would produce one' },
    

    undefined: { label:'Index not defined here',
                 note:'the method’s index has no distribution to stand on in this climate; '
                     +'this is not a data gap and not an absence of the mechanism' },
    feed:      { label:'Input missing',
                 note:'the method applies here and the data it needs did not arrive' },
    method:    { label:'Not instrumented here',
                 note:'the data would apply, but this build holds no method or reference for '
                     +'this unit' }
  };
  try{ window.HZ_REFUSAL_CLASS=HZ_REFUSAL_CLASS; }catch(_){}
  function _whyOf(r, fallback) {
    if (!r) return fallback;
    return r.reason || r.why || r.basis || r.unavailableWhy || fallback;
  }
  

  var _floodOnly = (hazard==='flood_pluvial') ? 'pluvial'
                 : (hazard==='flood_riverine') ? 'riverine' : null;
  

  var _mkWhy=null; try{ _mkWhy=(typeof window.__agnHzMaskWhy==='function')?window.__agnHzMaskWhy(tehsilKey||name, _floodOnly?('flood_'+_floodOnly):hazard):null; }catch(_){ _mkWhy=null; }
  if(_floodOnly) hazard='flood';
  if(_mkWhy){
    _noScore((_floodOnly?('flood_'+_floodOnly):hazard)+' (screening)', _mkWhy, _mkWhy, 'ineligible');
    metricLabels=[_mkWhy,'\u2014','\u2014','\u2014']; notes=[_mkWhy,'','','']; top=_mkWhy;
  } else if(hazard==='flood'||hazard==='telco_flood'){

    let __river=null;
    try{
      

      if(typeof riverSignalFor==='function') __river=riverSignalFor(name);
      if((!__river || !__river.covered) && typeof FLOOD_CACHE!=='undefined'){
        const c=(typeof PK_DISTRICT_CENTROIDS!=='undefined')&&PK_DISTRICT_CENTROIDS.find(x=>x.district===name);
        const ll=c?c:(inp&&inp.lat!=null?inp:null);
        if(ll){ const k=`${(+ll.lat).toFixed(3)},${(+ll.lon).toFixed(3)}`; const fr=FLOOD_CACHE[k];
          if(fr&&fr.loaded&&fr.covered&&fr.ratio>0) __river={ratio:fr.ratio, covered:true, level:fr.level,
            gauge:'point sample', basis:fr.basis, pctOfBankfull:fr.pctOfBankfull, refYears:fr.refYears}; }
      }
    }catch(e){ if(window.__MACH_DEBUG) console.debug('[mach river]', e&&e.message); }
    

    try{
      if((!__river || !__river.covered) && window.PK_RIVER_GAUGES_WITHHELD && window.agnGaugeOutlook && typeof window.agnReachIdOf==='function'){
        var _dn=(typeof PK_KEY_TO_DISTRICT!=='undefined' && PK_KEY_TO_DISTRICT[name]) ? PK_KEY_TO_DISTRICT[name] : name, _gd0=(window.AGN&&AGN.day&&AGN.day.get)?(AGN.day.get()||0):0, _best=null;
        window.PK_RIVER_GAUGES_WITHHELD.forEach(function(g){ if(!g||!(g.districts||[]).some(function(d){ return d===_dn; })) return; var id=agnReachIdOf(g.name); if(!id) return;
          var o=null; try{ o=agnGaugeOutlook.forReach(id,_gd0); }catch(_){ o=null; } if(!o||!o.measured||o.cls==null) return; if(!_best||o.cls>_best.o.cls) _best={g:g,o:o}; });
        if(_best) __river={covered:true, gauge:_best.g.name, ratio:undefined, measuredOnly:true, level:_best.o.clsName,
          basis:'measured flow at '+_best.o.name+' (the team\u2019s daily barrage sheet); the flood model is not used on this reach: '+(_best.g.why||'not represented')};
      }
    }catch(_){}
    

    try{ if(__river && __river.covered && window.HAND_TEHSIL && HAND_TEHSIL.ready && HAND_TEHSIL.units){
           var _hk=HAND_TEHSIL.units[name]||null; __river=Object.assign({}, __river, {hand:_hk}); } }catch(_){}
    

    var __where=null;
    try{ if(window.HAND_TEHSIL && HAND_TEHSIL.ready && HAND_TEHSIL.units && HAND_TEHSIL.units[name]) __where=HAND_TEHSIL.units[name].where||null; }catch(_){}

    let __melt=null;
    try{ if(window.AGN && AGN.cascade){
      

      var _meltH = (inp && inp.forecastHorizonHours!=null) ? inp.forecastHorizonHours
                 : (typeof lead!=='undefined' && lead!=null) ? lead : 24;
      _meltH = Math.max(1, Math.min(72, Number(_meltH)||24));
      __melt=AGN.cascade.snowmelt(name, _meltH);
    } }
    catch(e){ try{ AGN.diagnostics.capture({module:'flood-snowmelt',error:e,context:{unit:name}}); }catch(_){} }

    const f=hzFlood(inp,terr,name,{river:__river, melt:__melt, where:__where});
    _floodRes=f;
    

    if(_absent(f)){ _noScore('Flood (screening)',
      _whyOf(f,'neither a rainfall value nor an upstream gauge is available for this unit'),
      'Flood', 'feed'); } else {
    core=f.score*lf; kind=f.kind;

    

    if(_floodOnly){
      var _pw=(f.pathways||{})[_floodOnly]||{};
      if(_pw.score==null || _pw.unavailable){
        core=null;
        

        _noScore(_floodOnly==='riverine' ? 'Riverine flood (screening)'
                                         : 'Pluvial flood (screening)',
                 _pw.basis || ('the '+_floodOnly+' pathway did not score for this unit'),
                 _floodOnly==='riverine' ? 'Riverine flood' : 'Pluvial flood',
                 (_floodOnly==='riverine' && f.riverChecked===true && f.riverCovered===false)
                   ? 'method' : 'feed');
      } else {
        core=_pw.score*lf;
        kind=(_floodOnly==='riverine') ? 'riverine flood (screening)'
                                       : ((f.effSlope!=null&&f.effSlope>=12)
                                            ? 'flash flood (screening)'
                                            : 'pluvial flood (screening)');
      }
    }

    const _eff=(f.effSlope!=null?f.effSlope:(terr.slope||0));
    const _slopeNote = (f.slopeP95!=null && f.effSlope!=null && f.slopeMean!=null && Math.abs(f.effSlope-f.slopeMean)>0.5)
      ? `${_eff.toFixed(1)}° effective (mean ${f.slopeMean.toFixed(1)}°, p95 ${f.slopeP95.toFixed(1)}°) · ${(f.runoff*100).toFixed(0)}% runoff`
      : `${terr.slope!=null?terr.slope.toFixed(1):'n/a'}° mean slope · ${(f.runoff*100).toFixed(0)}% runoff`;

    

    const _riverNote = !f.riverChecked ? 'river: sweep not run'
      : !f.riverCovered ? 'no gauge upstream — river state unknown'
      : `${f.river.level} · ${f.river.pctOfBankfull!=null?f.river.pctOfBankfull+'% of bankfull':''} · ${f.river.gauge||''}`;

    

    drivers=[Math.round(f.rainPulse), (f.antecedent==null?null:Math.round(f.antecedent)), Math.round(_eff*2.5),
             f.riverine!=null?f.riverine:(f.accum!=null?f.accum:0)];
    metricLabels=['Rain intensity (PK)','Antecedent wetness','Terrain slope (eff.)',
                  

                  (_floodOnly==='pluvial' && f.riverine!=null) ? 'Riverine pathway (context, not scored here)'
                  : f.riverine!=null?'Riverine pathway':'6h accumulation'];
    notes=[
      `${inp.rain!=null?inp.rain.toFixed(1)+' mm/h':(typeof NODATA_GLYPH!=='undefined'?NODATA_GLYPH:'\u2014')+' (no rainfall retrieved)'} → ${f.rainPulse}/100`,
      `${f.antecedent}/100 · ${f.antecedentBasis}`,
      _slopeNote,
      f.riverine!=null ? _riverNote
        : (f.accumAvailable ? `${f.accum}/100 (6h peak)` : `6h window unavailable — weights renormalised (${f.weightsUsed})`)
    ];

     
    try{ if(window.AGN&&AGN.prob&&inp&&inp.lat!=null){ var _ld2=(Number(lead)>=48)?2:(Number(lead)>=24)?1:0; var _v25=AGN.prob.verdict(inp.lat,inp.lon,_ld2,25), _v50=AGN.prob.verdict(inp.lat,inp.lon,_ld2,50); if(_v25&&_v50){ notes[0]=notes[0]+' \u00b7 ensembles day '+(_ld2+1)+': P(24 h > 25 mm) '+_v25.pct+' %, > 50 mm '+_v50.pct+' %'+((/disagree/.test(_v25.agreement)||/disagree/.test(_v50.agreement))?' (single run, ensembles disagree)':''); } } }catch(_){}
    

    top = f.governingPath==='riverine' ? `Riverine · ${f.river.level}`
        : f.driverBasis==='antecedent only' ? 'Antecedent only — no rain falling'
        : _eff>=12 ? 'Flash-flood terrain'
        : 'Rain + saturation';
    

    if(_floodOnly==='pluvial'){
      top = (f.driverBasis==='antecedent only') ? 'Antecedent only — no rain falling'
          : (_eff>=12 ? 'Flash-flood terrain' : 'Local rain + saturation');
      if(f.governingPath==='riverine') top += ' · the river, not local rain, governs the combined layer here';
    } else if(_floodOnly==='riverine'){
      top = (f.river && f.river.level) ? ('Riverine · ' + ({normal:'normal for the time of year','seasonally-high':'a little above usual, no flood signal',elevated:'high for the season, no flood signal',bankfull:'above the 2-year flow, no flood signal',high:'5-year flow: flood likely',extreme:'20-year flow or rarer'}[f.river.level] || f.river.level)) : 'Riverine pathway';    
    }
    var __floodBasis=f;   
    }
  } else if(hazard==='rain_hz'){
    
    
    
    
    
    
    

    

    var _rcRow=null, _rcBasis='peak', _rcDay=0;
    try{ _rcDay=(window.AGN&&AGN.day&&AGN.day.get)?(AGN.day.get()||0):0; _rcBasis=(window.AGN&&AGN.day&&AGN.day.basis)?AGN.day.basis():'peak'; }catch(_){}
    

    try{ if(!(inp && inp.timeBasis==='forecast hour') && window.agnRainChance){ _rcRow=window.agnRainChance.forKey(name, _rcDay);
      if(!_rcRow && inp && inp.lat!=null && inp.lon!=null){ var _rk=window.agnRainChance.keyAt(inp.lat, inp.lon); if(_rk) _rcRow=window.agnRainChance.forKey(_rk, _rcDay); } } }catch(_){ _rcRow=null; }    
    /* v91.17.278 · FIX278 3: a day whose calibrated chance is withheld at every threshold (the model needs the next day's forecast total and
       the forecast held does not reach it) was levelled Normal; it now has no level, with the reason */
    var _rcAny=!!(_rcRow&&_rcRow.p&&Object.keys(_rcRow.p).some(function(_q){ return _rcRow.p[_q]!=null; }));
    if(_rcRow && _rcRow.p && !_rcAny && !(inp && inp.timeBasis==='forecast hour')){
      _noScore('Rain (chance of rain, '+((window.AGNHourStrip&&AGNHourStrip.label)?AGNHourStrip.label(window.AGN&&AGN.levelLegends):'screening')+')', 'the rain chance for '+_rcRow.date+' is withheld: it needs the forecast rain of the day after as well, and the forecast held does not reach that day yet', 'Heavy rain', 'feed'); }
    else if(_rcRow && _rcRow.p){
      var _P=_rcRow.p, _L=FR('rainChance.levels'), _lvl='Normal';
      for(var _i=0;_i<_L.length;_i++){ var _c=_L[_i]; if((_c.thr!=null&&_P[_c.thr]!=null&&_P[_c.thr]>=_c.p)||(_c.p25!=null&&_P['25']!=null&&_P['25']>=_c.p25)||(_c.p10!=null&&_P['10']!=null&&_P['10']>=_c.p10)||(_c.p1!=null&&_P['1']!=null&&_P['1']>=_c.p1)){ _lvl=_c.level; break; } }
      core=({Normal:10,Low:30,Moderate:55,High:75,Severe:90})[_lvl]; _category=_lvl;    
      _categoryLabel='Rain on '+_rcRow.date+': '+(_P['1']!=null?_P['1']+'% chance of a rain day':'')+(_P['10']!=null?', '+_P['10']+'% of 10 mm or more':'')+(_P['15.6']!=null?', '+_P['15.6']+'% of moderate rain (15.6 mm) or more':'');
      drivers=[core, _P['1'], _P['10'], _P['25']];
      metricLabels=['Rain level (calibrated)','Chance of a rain day (%)','Chance of 10 mm or more (%)','Chance of 25 mm or more (%)'];
      notes=[_lvl+' · '+_rcRow.date, (_P['1']!=null?_P['1']+'%':'withheld'), (_P['10']!=null?_P['10']+'%':'withheld'), (_P['25']!=null?_P['25']+'%':'withheld')+' · forecast '+_rcRow.fcMm+' mm'];
      

      try{ var _A=_rcRow.amt;
        if(_A && (_A.p50!=null || _A.p90!=null)){
          var _f=function(v){ return v<1?(v<0.1?'0':String(Math.round(v*10)/10)):String(Math.round(v)); };
          var _mid=(_A.p50!=null)?(_A.p50<0.1?'most likely dry':'most likely about '+_f(_A.p50)+' mm'):'';
          var _rt=(_A.p10!=null&&_A.p90!=null)
                 ? (_mid+(_mid?'; ':'')+'8 in 10 days between '+_f(_A.p10)+' and '+_f(_A.p90)+' mm')
                 : (_mid+(_A.p90!=null?((_mid?'; ':'')+'1 in 10 chance of more than '+_f(_A.p90)+' mm'):(_A.p90Over!=null?'; more than '+_A.p90Over+' mm possible':'')));
          notes[3]=(_P['25']!=null?_P['25']+'%':'withheld')+' · rain in the area around: '+_rt;
          _categoryLabel+=' · rain in the ~10 km area around: '+_rt;
        } }catch(_){}
      top=_lvl==='Normal'?((_P['1']!=null&&_P['1']>=50)?'Light rain more likely than not (under 15.6 mm)':((_P['1']==null&&_rcRow.fcMm!=null&&_rcRow.fcMm>=1)?('Rain forecast, '+_rcRow.fcMm+' mm in the day (its chance is not available)'):'Dry or light rain likely')):(_lvl+' · 15.6 mm or more in the day is more likely than not');            
       
      try{ var _sp=(_rcDay===0)?agnRainSplit(name):null; if(_sp&&_sp.pastMm>=1){ top=(_lvl==='Normal'&&_sp.restMm<0.5)?('Rain earlier today: '+_sp.pastMm+' mm forecast before '+_sp.nowHour+' PKT; little more for the rest of the day ('+_sp.restMm+' mm)'):(top+' · '+_sp.pastMm+' mm of it before '+_sp.nowHour+' PKT, '+_sp.restMm+' mm still to come'); } }catch(_){}
      if(_rcBasis==='current' && _rcDay===0) notes[0]=notes[0]+' · today\'s chance of rain ('+((window.AGNHourStrip&&AGNHourStrip.label)?AGNHourStrip.label(window.AGN&&AGN.levelLegends):'screening')+'; the model hour has no point skill and is not levelled)';
    }
    else if(!(inp && inp.timeBasis==='forecast hour')){
      _noScore('Rain (chance of rain, '+((window.AGNHourStrip&&AGNHourStrip.label)?AGNHourStrip.label(window.AGN&&AGN.levelLegends):'screening')+')', (window.agnRainChance && window.agnRainChance.ready && window.agnRainChance.ready())
        ? 'no rain chance is issued for this unit today; the model hour has no point skill (POD 0.06, FAR 0.92 at 2 mm/h on 82 gauges), so it is not levelled'
        : 'the rain chance has not loaded yet; the model hour is not levelled (no point skill)', 'Heavy rain', 'feed'); }
    else if(typeof isNoData==='function' ? isNoData(inp&&inp.rain) : (inp==null||inp.rain==null)){
      _noScore('Rainfall intensity (screening)',
        'no rainfall value for this unit — intensity is not scored', 'Heavy rain', 'feed'); } else {
    const mm=(inp.rain||0);
    
    
    

    const rScore = hzRainIntensityIndex(mm);
    
    
    

    core=rScore;
    { const _rbk=FR('flood.rainBands'); kind = mm>=_rbk[2]?'extreme intensity (screening)' : mm>=_rbk[1]?'high intensity (screening)' : mm>=_rbk[0]?'moderate intensity (screening)' : 'low/dry (screening)'; }
    

    const peak6=(typeof rainPeak6h==='function')?rainPeak6h(name):null;
    

    drivers=[Math.round(rScore), Math.round(mm*10)/10, null, peak6!=null?Math.round(peak6*10)/10:null];
    metricLabels=['Intensity score','Current mm/h','Chance (see the strip)','6h peak mm/h'];
    notes=[`${Math.round(rScore)}/100 current intensity`, `${mm.toFixed(1)} mm/h (model rate)`,
           'chance: the gauge-matched share is on the strip',
           peak6!=null?`${peak6.toFixed(1)} mm/h peak (card)`:'6h peak: select district'];
     
    { const _rbw=FR('flood.rainBands'); top = mm>=_rbw[3]?'Very heavy rain' : mm>=_rbw[2]?'Heavy rain' : mm>=_rbw[1]?'Moderate rain' : mm>=_rbw[0]?'Light rain' : 'Dry or trace'; }
    

    }
  } else if(hazard==='heat'||hazard==='telco_heat'){
    const h=hzHeat(inp,terr); _heatRes=h;
    if(_absent(h)){ _noScore('Heat (screening)', _whyOf(h,'no temperature or humidity value for this unit'), 'Heat', 'feed'); } else {
    core=h.score*lf;
    
    
    

    const _thr        = h.heatThr;
    const _thrLabel   = (h.heatThrLocalTx90==null) ? 'zone constant'
                      : (h.heatThrLocalTx90 < h.heatThr) ? 'physiological floor (local 90th pct '+h.heatThrLocalTx90.toFixed(1)+')'
                      : 'local 90th pct';
    
    
    
    

    const _hLv = (typeof agnBandOf==='function' && agnBandOf(h.score)) ? agnBandOf(h.score).label : null;
    const _hAt = h.utciLeadLabel || 'the hour scored';
    drivers=[h.score, (isFinite(h.wb)?Math.round(h.wb*10)/10:null), h.localAnomalyC, ((h.utciLocal&&h.utciLocal.p90!=null&&isFinite(+h.utciLocal.p90))?Math.round(+h.utciLocal.p90*10)/10:null)];
    metricLabels=['Heat level (UTCI class, shade)','Wet bulb °C (diagnostic)','Air vs local 90th pct °C (diagnostic)','UTCI 90th pct here for the date °C (context)'];
    notes=[`${_hAt.charAt(0).toUpperCase()+_hAt.slice(1)}: UTCI ${Number(h.utciShade).toFixed(1)} °C in shade (${h.utciAirC!=null?Math.round(h.utciAirC):'—'}°C air) · UTCI class of that hour: ${h.utciClass}; the map level is this class (UTCI 26 / 32 / 38 / 46 °C, Bröde et al. 2012)`,
           (isFinite(h.wb)?`${h.wb.toFixed(1)} °C wet bulb · reported, not scored`:'wet bulb not computed'),
           ((h.localAnomalyC!=null?`today's maximum ${Math.abs(h.localAnomalyC)} °C ${h.localAnomalyC>=0?'above':'below'} this place\'s 90th-percentile daily maximum${h.heatThrLocalTx90!=null?' ('+Number(h.heatThrLocalTx90).toFixed(1)+' °C)':''}`:'no daily maximum or local climatology held')+' · reported, not scored'),
           (h.utciLocal?`heat stress ${h.utciLocal.rank} (UTCI ${Number(h.utciShade).toFixed(1)} °C) · 90th percentile ${h.utciLocal.p90} °C · ${h.utciLocal.basis}`:'no local UTCI climatology held for this unit')];
    top=h.utciClass?(h.utciClass+' · published UTCI class, '+_hAt):'UTCI';
    }
  } else if(hazard==='landslide'){
     
    let L=null;
    try{ if(window.AGN&&AGN.cascade) L=AGN.cascade.landslide(name,inp,terr); }catch(e){}
    

    if(!L || _absent(L)){ 

      _noScore('Landslide (screening)',
      L ? _whyOf(L,'the cascade engine returned no landslide score')
        : 'the cascade engine is not loaded — landslide is not scored', 'Landslide',
      

      L ? (L.ineligible ? 'ineligible' : 'feed') : 'method'); } else {
    core=L.score*lf; kind=L.kind;
    drivers=[L.score, Math.round((L.exceedanceRatio||0)*100), Math.round(L.effSlope||0), Math.round((L.wetness||0)*100)];
    metricLabels=['Landslide level (uncalibrated threshold screen)','Threshold exceedance %','Effective slope °','Antecedent wetness %'];    
    notes=[ L.gated? L.reason : (L.score+'/100 rainfall-threshold screen · uncalibrated: not a tested likelihood'),
            L.gated? 'slope gate closed' : ((L.intensityMmH||0)+' mm/h vs '+(L.thresholdMmH||0)+' mm/h threshold over '+(L.governingDurationH||'—')+' h'),
            'p95-weighted effective slope',
            L.deepSoilVv!=null? (L.deepSoilVv+' v/v deep soil') : 'antecedent index' ];
    top = L.gated? 'Below slope gate' : (L.exceedanceRatio>=1? ('Threshold exceeded'+(L.crossingStartHour!=null?' at +'+L.crossingStartHour+' h':'')) : 'Below threshold');
    if(!L.gated && L.crossingWindowBasis) notes[1]=notes[1]+' \u00b7 '+L.crossingWindowBasis;
    

    try{ if(!L.gated && window.AGN && AGN.prob && inp && inp.lat!=null){ var _ld=(Number(lead)>=48)?2:(Number(lead)>=24)?1:0; var _trig=(Number(L.thresholdMmH)||0)*(Number(L.governingDurationH)||0); var _v=_trig>0?AGN.prob.verdict(inp.lat,inp.lon,_ld,_trig):null; if(_v){ notes[1]=notes[1]+' \u00b7 ensembles: P(24 h > '+Math.round(_trig)+' mm) '+_v.pct+' % ('+_v.agreement+')'; if(/disagree/.test(_v.agreement)) top=top+' \u00b7 single run'; else if(/watch/.test(_v.agreement)) top=top+' \u00b7 ensemble watch'; } } }catch(_){}
    

    if(L.transferable===false) notes[3]='OUTSIDE the fitted HKH region — indicative only';
    if(L.calibrated){    
      var _ob=(function(r){ try{ var B=(window.LS_ODDS&&LS_ODDS.observedBands)||[]; for(var k=0;k<B.length;k++){ if(r>=B[k].lo&&(B[k].hi==null||r<B[k].hi)) return B[k]; } }catch(_){} return null; })(+L.oddsRatio);   /* v91.17.283.8: the observed ratio of the model's class */
      drivers=[L.score, _ob?_ob.observed:null, Math.round(L.effSlope||0), (L.wetness!=null?Math.round(L.wetness*100):null)];
      metricLabels=['Landslide level (ranked likelihood)','Observed times an ordinary day (this class)','Effective slope °','Antecedent wetness %'];
      notes=[ (_ob?'slides about '+_ob.observed+' times as often as on an ordinary day here this month, observed for days in the model\u2019s '+_ob.band+' class':'observed rate for this class not available')+' ('+L.oddsDate+') · a ranking tested on recorded landslides 2007-2017, each year held out; not a probability',
              'from the day\u2019s and the 3-day rain at the tehsil',
              'p95-weighted effective slope (below 12° the mechanism does not apply)',
              L.transferable===false ? 'rock here differs from most recorded slides: read with care' : (L.deepSoilVv!=null? (L.deepSoilVv+' v/v deep soil') : 'antecedent index') ];
      top = _ob?('about '+_ob.observed+'× an ordinary day (observed)'):'ranked: observed rate not available';
    }
    }
  } else if(hazard==='wind'||hazard==='telco_wind'){
    const w=hzWind(inp,terr);
    if(w && w.mountainWithheld){ _noScore('Wind (screening)', w.reason, 'Wind', 'ineligible');     }
    else if(_absent(w)){ _noScore('Wind (screening)', _whyOf(w,'no wind or gust value for this unit'), 'Wind', 'feed'); } else {
    core=w.score*lf;
    drivers=[w.score, (inp.gust!=null&&isFinite(+inp.gust)?Math.round(+inp.gust):null), Math.round(terr.tri/8), Math.round(w.exposure*100-100)];
    metricLabels=['Wind load','Gust km/h','Ruggedness','Exposure +%'];
     
    notes=[`${w.score}/100 load`, (inp.gust!=null&&isFinite(+inp.gust)?Math.round(+inp.gust)+' km/h gust'+(inp.gustBasisNote?' ('+inp.gustBasisNote+')':''):'gust not forecast'), (terr&&terr.tri!=null&&isFinite(terr.tri))?`TRI ${Number(terr.tri).toFixed(0)}`:'TRI not held', `+${Math.round(w.exposure*100-100)}% terrain`];
    top='Gust + exposure';
    }
  } else if(hazard==='cold'){
    const c=hzCold(inp,terr);
    if(c && c.unavailable && c.reason && !/no temperature/i.test(String(c.reason))){ _noScore('Cold (screening)', c.reason, 'Cold', 'feed'); }
    else if(_absent(c) || (c.gated && /no temperature/i.test(String(c.reason||'')))){
      

      _noScore('Cold (screening)', 'no temperature value for this unit', 'Cold', 'feed'); } else {
    core=c.score*lf;
    if(c.gated){ drivers=[0,0,0,0]; metricLabels=['Cold stress','—','—','—']; notes=['Not a cold-hazard zone (low elevation)','','','']; top='Gated (low elevation)'; }
    else {
      

      drivers=[c.score, (c.utciShade!=null?Math.round(c.utciShade*10)/10:null), c.localAnomalyC, ((c.utciLocal&&c.utciLocal.p10!=null&&isFinite(+c.utciLocal.p10))?Math.round(+c.utciLocal.p10*10)/10:null)];    
      metricLabels=['Cold level (UTCI class, shade, coldest hour)','UTCI °C (coldest hour)','Night min vs local 10th pct °C (diagnostic)','UTCI 10th pct here for the date °C (context)'];
      notes=[`UTCI ${Number(c.utciShade).toFixed(1)} °C in shade at the coldest hour (${c.coldUtciAirC!=null?Math.round(c.coldUtciAirC):'—'}°C air${c.coldUtciWindKmh!=null?', wind '+Math.round(c.coldUtciWindKmh)+' km/h':''}) · UTCI class: ${c.utciClass}; the map level is this class (UTCI 0 / -13 / -27 / -40 °C, Bröde et al. 2012)`,
             (c.utciBasis||''),
             ((c.localAnomalyC!=null?`${c.localAnomalyC>0?'+':''}${c.localAnomalyC} °C vs this place's 10th-percentile night (${Number(c.localAnchorC).toFixed(1)} °C)`:'no local night baseline held')+' · reported, not scored'),
             (c.utciLocal?`cold stress ${c.utciLocal.rank} · UTCI 10th percentile ${c.utciLocal.p10} °C · ${c.utciLocal.basis}`:'no local UTCI climatology held for this unit')];
      top=c.utciClass||'UTCI cold'; }
    }
  } else if(hazard==='glof'){
    const g=hzGLOF(name,inp,terr);
    

    

    if(g.notApplicable){
      _noScore('GLOF (screening)',
        (g.note||'no glacial source and no glacial flow path reaches this unit'),
        'GLOF risk', 'ineligible');
      metricLabels=['GLOF — not applicable','—','—','—'];
      top='Not applicable';
    }
    else if(g.unrecognisedClass){    
      _noScore('GLOF (screening)', g.reason||'the lake-routed class is not on the GLOF ladder', 'GLOF risk', 'feed');
      metricLabels=['GLOF risk — no data','—','—','—'];
      top='No reading';
    }
    else if(!(g.categorical===true && g.lakeClass) && (g.score==null || g.sourceState==='inventory-unresolved')){    
      

      _noScore('GLOF (screening)',
        'the GLOF inventory has not been checked for this unit. This is NOT evidence that no '
        +'glacial lake exists.', 'GLOF risk', 'method');
      metricLabels=['GLOF risk — no data','—','—','—'];
      top='Inventory unresolved';
    }
    else if(g.categorical===true && g.lakeClass){
      

      core=g.mapValue; _categorical=true; _mapValue=g.mapValue; _category=g.category; _categoryLabel=g.categoryLabel;
      drivers=[g.mapValue, (g.counts&&g.counts.priority)||0, (g.counts&&g.counts.watch)||0, (g.counts&&g.counts.expanding)||0];
      metricLabels=['GLOF level','Priority lakes upstream','Elevated lakes upstream','Lakes growing in our Sentinel-2 reads'];
      notes=[g.category+' \u00b7 '+(g.basis||''), (g.named&&g.named.length?('named: '+g.named.join(', ')):'no Priority lake named'), g.evidence||'', 'lake areas from our own Sentinel-2 reads'];
      top='GLOF level: '+g.category; kind=g.kind||kind;
    }
    else if(g.gated){ core=g.score*lf; drivers=[0,0,0,0]; metricLabels=['GLOF risk','—','—','—']; notes=['Inventory covers this unit; no glacial lake or glacier source present','','','']; top='No source in inventory'; }
    else { core=g.score*lf; drivers=[g.score, Math.round((g.base||0)), Math.round((g.melt||0)*100), Math.round(terr.elev/50)];
      metricLabels=['GLOF risk','Inventory baseline','Melt trigger %','Elevation'];
      notes=[`${g.score}/100${g.tier?' · Tier '+g.tier:''}`, `${g.base||0}/100 documented`, `${Math.round((g.melt||0)*100)}% melt state`, g.note||`${terr.elev.toFixed(0)} m`]; top='Documented lakes + melt'; }
  } else if(hazard==='drought'){
    const dr=hzDrought(name);
    if(dr && dr.notApplicable){
      

      _noScore('Drought (index)', dr.note||'Arid climate: drought index not defined', 'Drought', 'ineligible');    
      metricLabels=['Drought — index not defined (arid)','—','—','—'];
      top='Not defined here';
    }
    else if(dr){ core=dr.score*1; drivers=[dr.score, dr.fao!=null?dr.fao:null, null,null];    
      

      metricLabels=['Drought composite','FAO-56 root-zone stress (9-27 + 27-81 cm)','SPI-90 precipitation anomaly','SPEI-90 water balance'];
      notes=[`${dr.score}/100`,
             `${dr.fao!=null?dr.fao:'n/a'}/100 root-zone`,
             `SPI ${dr.spi90!=null?dr.spi90.toFixed(2):(dr.spi3!=null?dr.spi3.toFixed(2):'loading')}`,
             `${dr.spei90!=null?('SPEI '+dr.spei90.toFixed(2)):'SPEI not fitted here'}`];
      top='SPEI/SPI-90 (90-day standardised water-balance and rain indices) + root-zone stress';
      

      if(dr.divergence){ notes[0]=`${dr.score}/100 — ${dr.divergence}`; }
      

      if(dr.serverClass){ _categorical=true; _category=(String(dr.serverClass)==='Low')?'Normal':dr.serverClass;
        _categoryLabel='Drought: '+({Low:'Normal',Monitor:'Moderate',Watch:'High',Act:'Severe'}[String(dr.serverClass)]||dr.serverClass)+(dr.droughtMonth?' for '+dr.droughtMonth.label+', the latest month of the rainfall record':'')+(dr.droughtChange?' ('+dr.droughtChange.word+')':'')+(dr.highValley?' (provisional: high valley, rain not verified against gauges here)':'')+(dr.rainSource?' \u00b7 rain from '+(/CHIRPS/.test(dr.rainSource)?'the satellite rainfall record':'the global reanalysis'):'');
        if(dr.highValley){ notes[0]=notes[0]+' \u00b7 provisional (high valley)'; } } }
    else {
      
      
      
      const _k=(typeof SPI_FAILED!=='undefined') && Object.keys(SPI_FAILED||{}).length>0;

      const _dv=inp.derived||{};
      const _wb = (inp.waterBalance!=null)?inp.waterBalance:_dv.waterBalance;
      const _vp = (inp.vpd!=null)?inp.vpd:_dv.vpd;
      const _sr = inp.smRoot;
      const _terms=[], _w=[];
      if(_wb!=null){
        _terms.push(hzClamp(-_wb / FR('drought.wbDeficitFullScale') * 100, 0, 100));
        _w.push(FR('drought.wbWeight'));
      }
      

      if(_vp!=null && _wb==null){
        const _o=FR('drought.vpdOnsetKpa'), _f=FR('drought.vpdFullScaleKpa');
        _terms.push(hzClamp((_vp-_o)/(_f-_o)*100, 0, 100));
        _w.push(FR('drought.vpdWeight'));
      }
      if(_sr!=null){
         
        const _wp=FR('drought.smRootWiltProxy'), _fc=FR('drought.smRootFieldCap');
        const _avail=Math.max(0,Math.min(1,(_sr-_wp)/Math.max(1e-6,_fc-_wp)));
        _terms.push(hzClamp((1-_avail)*100, 0, 100));
        _w.push(FR('drought.smRootWeight'));
      }
      

      if(_terms.length){
        

        _noScore('Drought (screening)',
          'SPI not available for this unit, so no drought level is issued. The four-day water balance is a different measurand '
          +'from the 30-90 day SPI composite the drought ladder is defined on and is not levelled'
          +(_wb!=null ? (' (four-day P \u2212 ET\u2080 '+(_wb>=0?'+':'')+_wb.toFixed(1)+' mm, context only)') : '')+'.',
          'Drought', 'feed');
        metricLabels=['Drought — SPI not available','—','—','—'];
        top='SPI not available';
      } else {
        

        _noScore('Drought (screening)',
          _k ? 'the SPI/SPEI archive did not answer for this unit and no water-balance '
             + 'term could be formed from what did arrive, so there is nothing to score '
             + 'the accumulated deficit from'
             

             : (!(window.__agnDroughtNat && (window.__agnDroughtNat.joined || window.__agnDroughtNat.why))
                
               ? 'the national drought table (90-day SPI/SPEI and root-zone stress) has not loaded yet; it lands within about twenty seconds of loading and this re-scores itself'
               : 'the forecast inputs for this unit have not landed yet — the district burst is '
             + 'still in flight. This clears on its own within about fifteen seconds of loading; '
             + 'if it persists, the provider did not answer for this unit'),
          'Drought', _k ? 'feed' : 'feed');
        metricLabels=['Drought — no data','—','—','—'];
        top='No drought inputs';
      } }
  } else if(hazard==='seismic'){
    
    

    const s=(typeof hzSeismic==='function')?hzSeismic(name):{score:0};
    

    

    core=(s.mapValue!=null ? s.mapValue : (s.score!=null ? s.score : null));
    kind=s.kind||'Seismic';
    _categorical = (s.categorical===true);
    _mapValue = (s.mapValue!=null ? s.mapValue : null);
    _category = s.category||null; _categoryZone = s.zone||null;
    _categoryLabel = s.categoryLabel||null;
    _evidenceClass = s.evidenceClass||null; _evidenceClassWhy = s.evidenceClassWhy||null;
    drivers=[(core==null?null:Math.round(core)),0,0,0];
    metricLabels=[(s.categoryLabel||'Seismic zone'),'—','—','—'];
    notes=[s.note||'', s.evidenceClassWhy||'', '', ''];
    top = s.categoryLabel || s.zone || 'Design-basis zone';
  } else if(typeof NSS_LAYERS!=='undefined' && NSS_LAYERS[hazard]){
    var _nssNoData=false;
    

    

    var _wet=null, _dayIdx=0;
    try{ _dayIdx=(window.AGN&&AGN.day&&typeof AGN.day.get==='function')?AGN.day.get():0; }catch(_){}
    if(_dayIdx>0){
      var _dayOk=false;
       
      try{ var _c=(typeof window.nssDayCoverage==='function')?window.nssDayCoverage(_dayIdx):null; _dayOk=!!(_c&&_c.enabled); }catch(_){ _dayOk=false; }
      if(!_dayOk) _dayIdx=0;
    }
    try{ if(AGN.wetness) _wet=AGN.wetness.currentWetness(name,_dayIdx); }catch(_){}
    var _apiUse=(_wet&&_wet.value!=null)?_wet.value:((inp&&inp.api!=null)?inp.api:null);
    var _storm=null;
    try{ _storm=(typeof nssStormDepth!=='undefined')?nssStormDepth:100; }catch(_){ _storm=100; }
    

    var _fcRain=null;
    if(hazard==='nss_runoff'){
      try{ var _row=(window.DISTRICT_IN||{})[name];
        if(_row&&_row.fc72&&typeof window.hzDayWindow==='function'){ var _w=window.hzDayWindow(_row.fc72,_dayIdx,'flood'); if(_w&&_w.rainTotal!=null) _fcRain=+_w.rainTotal; }
        if(_fcRain==null&&_row&&Array.isArray(_row.days)&&_row.days[_dayIdx]&&_row.days[_dayIdx].precip!=null) _fcRain=+_row.days[_dayIdx].precip;
      }catch(_){ _fcRain=null; }
      if(_fcRain!=null&&_fcRain>=1) _storm=_fcRain;
    }

    let _n=null;
    try{
      if(AGN.nss && AGN.nss.score){
        const _d=(typeof PK_KEY_TO_DISTRICT!=='undefined')?PK_KEY_TO_DISTRICT[name]:null;
        const _pct=Math.tan(((terr&&terr.slope!=null)?terr.slope:0)*Math.PI/180)*100;
        _n=AGN.nss.score(name,_d,terr&&terr.zone,_pct,_apiUse,_storm);
      }
    }catch(_){}

    

    var _nssS=null;
    function _sOf(cn){ cn=+cn; return (isFinite(cn)&&cn>0&&cn<=100)?Math.round((25400/cn-254)*10)/10:null; }
    if(_n && _n.ok){ _nssS = (hazard==='nss_dynamic') ? (_apiUse!=null?_sOf(_n.cnDynamic):null) : (hazard==='nss_baseline'||hazard==='nss') ? _sOf(_n.cnBaseline) : null; }
    

    if(_n && _n.ok && _n.sponge250){ _nssS = (hazard==='nss_dynamic') ? (_apiUse!=null?_n.equivalentSDynamic:null) : (hazard==='nss_baseline'||hazard==='nss') ? _n.equivalentS : _nssS; }
    var _spWord=function(S){ var c=(window.AGN&&AGN.nss&&AGN.nss.spongeClass)?AGN.nss.spongeClass(S):null; return (c==null)?'—':window.AGN_SPONGE_CLASSES.words[c]; };
    if(!_n || !_n.ok){
      core=0; drivers=[0,0,0,0];
      metricLabels=['Sponginess — no data','—','—','—'];
      notes=[(_n&&_n.reason)?('No data: '+_n.reason):'NSS unavailable for this unit','','',''];
      top='No land-cover data'; _nssNoData=true;
    } else if(hazard==='nss_dynamic'){
      

      if(_n.dnss==null || _apiUse==null){
        

        core=0; _nssNoData=true; drivers=[0,0,0,0];
        metricLabels=['Current sponginess — unavailable','—','—','—'];
        notes=['Current wetness unavailable'+((_wet&&_wet.note)?': '+_wet.note:'')
               +' — baseline sponginess is '+_n.bnss+'/100','','',''];
        top='Current wetness unavailable';
      } else {
        core=_n.dnss;
        const _dep=(_n.bnss!=null)?(_n.bnss-_n.dnss):null;
        const _used=(_n.bnss>0&&_dep!=null)?Math.round(_dep/_n.bnss*100):null;
        kind='Ground sponge (today\'s wetness)';
        drivers=[_nssS, Math.round(_apiUse*100),
                 Math.round((_n.runoffCoefficient||0)*100), Math.round(_n.cnDynamic||0)];
        metricLabels=['Retention potential S (mm)','Soil wetness %',
                      'Runoff potential % of a 100 mm storm','Curve number now'];
        notes=[
          'S '+(_nssS!=null?_nssS:'—')+' mm = 25400/CN − 254 at CN '+(_n.cnDynamic!=null?_n.cnDynamic:'—')+' · usual-wetness S '+(_sOf(_n.cnBaseline)!=null?_sOf(_n.cnBaseline):'—')+' mm',
          (_n.dynamicRetentionMm!=null?_n.dynamicRetentionMm.toFixed(1):'—')+' mm retained, '
            +(_n.dynamicRunoffMm!=null?_n.dynamicRunoffMm.toFixed(1):'—')+' mm runoff of a 100 mm event',
          'CN '+(_n.cnDynamic!=null?_n.cnDynamic:'—')+' now vs '+(_n.cnBaseline!=null?_n.cnBaseline:'—')
            +' usual (average wetness) · HSG '+_n.hsg+' ('+_n.hsgBasis+')',
          'Wetness '+Math.round(_apiUse*100)+'% ('+((_wet&&_wet.basis)||'API')+', confidence '
            +((_wet&&_wet.confidence)||'C')+')'
            +(_used!=null?' — recent rain has used about '+_used+'% of baseline capacity':'')
        ];
        if(_n.sponge250){ notes[0]='Equivalent S '+(_nssS!=null?_nssS:'—')+' mm now vs '+(_n.equivalentS!=null?_n.equivalentS:'—')+' mm at usual wetness: wet ground can lower the sponge, dry ground never raises it above usual (v91.17.184)'; }
        top=_spWord(_nssS);
      }
    } else if(hazard==='nss_retention'){
      

      const _dyn=(_n.stormDynamicRetentionMm!=null);
      const _rmm=_dyn?_n.stormDynamicRetentionMm:_n.stormRetentionMm;
      const _qmm=_dyn?_n.stormDynamicRunoffMm:_n.stormRunoffMm;
      if(_rmm==null){
        core=0; _nssNoData=true; drivers=[0,0,0,0];
        metricLabels=['Storm retention — no data','—','—','—'];
        notes=['Retention unavailable for this unit','','',''];
        top='No data';
      } else {
        core=Math.round(_rmm/_n.stormP*100);
        kind='Storm retention @ '+_n.stormP+' mm'+(_dyn?' (current wetness)':' (baseline)');
        drivers=[core, Math.round(_rmm), Math.round(_qmm||0),
                 Math.round((_dyn?_n.cnDynamic:_n.cnBaseline)||0)];
        metricLabels=['Retained % of storm','Retained mm','Runoff mm','Curve number'];
        notes=[
          'Rainfall '+_n.stormP+' mm → retained '+_rmm.toFixed(1)+' mm ('+core+'%), runoff '
            +(_qmm!=null?_qmm.toFixed(1):'—')+' mm',
          'Recomputed through the NRCS equation at '+_n.stormP+' mm — not scaled from the 100 mm case',
          'CN '+((_dyn?_n.cnDynamic:_n.cnBaseline)||'—')+' · HSG '+_n.hsg+' ('+_n.hsgBasis+')',
          _dyn?('current wetness applied ('+((_wet&&_wet.basis)||'API')+')')
              :'usual (average wetness) conditions — current wetness unavailable'
        ];
        top=(core>=80?'Retains nearly all':core>=60?'High retention':core>=40?'Moderate retention'
            :core>=20?'Low retention':'Retains almost nothing');
      }
    } else if(hazard==='nss_runoff'){
       
      if(_fcRain==null){
        core=0; _nssNoData=true; drivers=[0,0,0,0];
        metricLabels=['Run-off today — no forecast rain for this unit','—','—','—'];
        notes=['No forecast rain total for the selected day','','','']; top='No data';
      } else {
        const _dynQ=(_fcRain>=1)?((_n.stormDynamicRunoffMm!=null)?_n.stormDynamicRunoffMm:_n.stormRunoffMm):0;
        const _qmm=(_dynQ==null)?null:Math.max(0,_dynQ);
        core=(_qmm==null)?0:Math.round(_qmm*10)/10; if(_qmm==null) _nssNoData=true;
        kind='Run-off from today\u2019s forecast rain';
        drivers=[core, Math.round(_fcRain*10)/10, Math.round((_n.cnDynamic||_n.cnBaseline)||0), Math.round((_n.fSlope||1)*100)];
        metricLabels=['Run-off mm','Forecast rain mm','Curve number (today)','Terrain factor %'];
        notes=[(core==null?'—':core+' mm')+' of run-off from '+(Math.round(_fcRain*10)/10)+' mm of forecast rain',
               (_fcRain<1?'under 1 mm of rain: no run-off':'NRCS curve-number equation at today\u2019s wetness'),
               'CN '+((_n.cnDynamic||_n.cnBaseline)||'—')+' · HSG '+_n.hsg+' ('+_n.hsgBasis+')',
               'Screening: run-off depth is not flood depth'];
        top=(core==null?'No data':core>=25?'Very much run-off':core>=10?'Much run-off':core>=5?'Some run-off':core>=1?'Little run-off':'No run-off');
      }
    } else if(hazard==='nss_runoff_share'){
       
      const _dyn=(_n.runoffCoefficient!=null&&_apiUse!=null);
      const _rc=_dyn?_n.runoffCoefficient:_n.baselineRunoffCoefficient;
      if(_rc==null){
        core=0; _nssNoData=true; drivers=[0,0,0,0];
        metricLabels=['Runoff potential — no data','—','—','—'];
        notes=['Runoff coefficient unavailable','','','']; top='No data';
      } else {
        core=Math.round(Math.max(0,Math.min(1,_rc))*100);
        kind='Runoff potential'+(_dyn?' (current wetness)':' (baseline)');
        drivers=[core, Math.round((_dyn?_n.dynamicRunoffMm:_n.runoffMm)||0),
                 Math.round((_dyn?_n.cnDynamic:_n.cnBaseline)||0), Math.round((_n.fSlope||1)*100)];
        metricLabels=['Runoff % of rainfall','Runoff mm @100 mm','Curve number','Terrain factor %'];
        notes=[
          core+'% of rainfall becomes direct runoff — HIGHER IS WORSE',
          (_dyn?_n.dynamicRunoffMm:_n.runoffMm).toFixed(1)+' mm runoff of a 100 mm event'
            +(_dyn?' at current wetness':' under baseline dry conditions'),
          'CN '+((_dyn?_n.cnDynamic:_n.cnBaseline)||'—')+' · HSG '+_n.hsg+' ('+_n.hsgBasis+')',
          'Feeds the flood engine as the runoff coefficient — this layer is land capacity, not flood hazard'
        ];
        top=(core>=80?'Very high runoff':core>=60?'High runoff':core>=40?'Moderate runoff'
            :core>=20?'Low runoff':'Very low runoff');
      }
    } else {
       
      core=(_n.bnss!=null)?_n.bnss:0;
      kind='Ground sponge (usual wetness)';
      drivers=[_nssS, Math.round(_n.retentionMm||0),
               Math.round((_n.baselineRunoffCoefficient||0)*100), Math.round(_n.cnBaseline||0)];
      metricLabels=['Retention potential S (mm)','Retained mm of a 100 mm storm',
                    'Runoff potential % of a 100 mm storm','Curve number (usual wetness)'];
      notes=[
        'S '+(_nssS!=null?_nssS:'—')+' mm = 25400/CN − 254 at CN '+(_n.cnBaseline!=null?_n.cnBaseline:'—')+' (average antecedent wetness); a capacity of the ground, not a hazard',
        (_n.retentionMm!=null?_n.retentionMm.toFixed(1):'—')+' mm retained, '
          +(_n.runoffMm!=null?_n.runoffMm.toFixed(1):'—')+' mm runoff of a 100 mm event',
        (_n.landCoverFallback
          ? 'Land cover: rural / no built LCZ detected · natural cover from agro-climatic zone '
            +'fallback ('+(_n.remainderClass||'—')+') · impervious 0% · land-cover confidence D'
           
          : 'CN '+(_n.cnBaseline!=null?_n.cnBaseline:'—')+' · impervious '
            +(_n.imperviousFraction==null?'not held':Math.round(_n.imperviousFraction*100)+'%')+', tree '
            +(_n.treeFraction==null?'not held':Math.round(_n.treeFraction*100)+'%')+' (WUDAPT/LCZ observed)')
          +' · Soil: '+_n.soilBasis,
        'Slope factor '+(_n.fSlope!=null?_n.fSlope.toFixed(2):'—')+' · λ '+_n.lambda
          +' · '+_n.methodVersion+' · confidence '+(_n.confidence||'C')
          +' (land cover '+(_n.landCoverConfidence||'—')+', soil '+(_n.soilConfidence||'—')+')'
      ];
       
      if(_n.sponge250){
        var _cs=_n.classShare||[], _W=window.AGN_SPONGE_CLASSES.words;
        notes[0]='Equivalent S '+(_nssS!=null?_nssS:'—')+' mm (curve number '+(_n.equivalentCN!=null?_n.equivalentCN:'—')+'): the storage that gives this tehsil\u2019s runoff from 100 mm on flat ground, summed cell by cell over its 250 m cells';
        notes[2]='Built and sealed: '+Math.round((_n.imperviousFraction||0)*100)+'% of the land (runs off, never sponge) · tree '+Math.round((_n.treeFraction||0)*100)+'% · Soil: '+_n.hsgBasis;
        notes[3]='Of its 250 m cells: '+_W.map(function(w,i){ return Math.round((_cs[i]||0)*100)+'% '+w.toLowerCase(); }).filter(function(x){ return !/^0%/.test(x); }).join(', ');
      }
      top=_spWord(_nssS);
    }
    } else if(hazard==='cyclone'){
    

    

    

    const cy=(typeof hzCyclone==='function')?hzCyclone(name):{mapValue:null};
    core=(cy.mapValue!=null?cy.mapValue:null); kind=cy.kind||'Cyclone';
    _categorical = true;
    _category = (core==null ? 'no coastal exposure segment is mapped for this unit'
                :core>=80?'inner-delta landfall corridor'
                :core>=65?'high-exposure coast'
                :core>=45?'exposed coast'
                :core>=25?'sheltered or near-coastal'
                :'inland - outside the landfall corridor');
    _categoryLabel = 'Standing coastal exposure segment (no live cyclone track)';
    _evidenceClass = 'C';
    

    if(cy.evidenceClass==='B'){ _evidenceClass='B'; _categoryLabel=(cy.categoryLabel||'Cyclone wind exposure')+' (track record, no live cyclone track)'; }
    _evidenceClassWhy = (cy.evidenceClass==='B') ? (cy.evidenceClassWhy+'. '+(cy.note||'')+' A standing exposure of the place, not a storm forecast.') : 'expert-entered Arabian Sea landfall-climatology segment. No published '
      + 'national cyclone zoning is bundled in this build, and this is not a computed index: '
      + 'it does not respond to any input and must not be compared with a scored hazard. '
      + 'NO LIVE CYCLONE TRACK IS WIRED INTO THIS BUILD — no JTWC, IMD or tropical-cyclone '
      + 'model feed. This segment describes a place, not a storm: it is identical on the day a '
      + 'cyclone makes landfall and on a clear day in January. The operational cyclone class is '
      + 'withdrawn until a track feed exists; what remains is standing exposure only.';
    drivers=[(core==null?null:Math.round(core)),0,0,0];
    metricLabels=['Standing coastal exposure segment','—','—','—'];
    notes=[cy.note||'', _evidenceClassWhy, '', '']; top=_category;
  } else if(hazard==='telco_lightning'){
    
    
    

    const _feels=(inp.feels!=null?inp.feels:inp.t);
    

    const _ltRain = (inp.rain!=null && isFinite(Number(inp.rain))) ? Number(inp.rain) : null;
    const _ltGustRaw = (inp.gust!=null && isFinite(Number(inp.gust))) ? Number(inp.gust)
                     : ((inp.wind!=null && isFinite(Number(inp.wind))) ? Number(inp.wind)*1.7 : null);
    const _ltHas = (_ltRain!=null);
    if(!_ltHas){ _noScore('Lightning proxy (screening)',
      'no rainfall value for this unit. The convective proxy is built on rainfall and '
      + 'modified by temperature and gust; with the measurand absent there is nothing to '
      + 'modify, and a dry hour is not the same statement as an unobserved one',
      'Lightning', 'feed'); } else {
    const conv=hzClamp((_ltRain*10 + Math.max(0,(_feels!=null?_feels:0)-30)*3 + (_ltGustRaw!=null?_ltGustRaw*0.4:0)),0,100);
    core=conv*lf;
    drivers=[Math.round(conv), Math.round(hzClamp(_ltRain*14,0,100)), 0, 0];
    metricLabels=['Convective proxy','Rain pulse','—','—'];
    notes=[`${Math.round(conv)}/100 proxy (no strike feed)`, `${(inp.rain||0).toFixed(1)} mm`, '', ''];
    top='Convective proxy';
    }
  } else {
    

    _noScore('Hazard screening', 'no hazard engine is registered for the key "'
             + String(hazard) + '" in this build, so no score is computed for it. '
             + 'Adding a hazard means adding its engine, not inheriting another '
             + 'hazard\'s number.', String(hazard), 'method');
  }
  

  var _noDataFlag=(typeof _nssNoData!=='undefined')?_nssNoData:false;
  

  

  if(typeof _hazNoData!=='undefined' && _hazNoData) _noDataFlag=true;
  

  if(_noDataFlag && typeof _hazNoDataWhy!=='undefined' && !_hazNoDataWhy){
    try{
      var _nw=(typeof notes!=='undefined' && notes && notes[0]) ? String(notes[0]) : '';
      if(_nw) _hazNoDataWhy=_nw.replace(/^No data:\s*/,'')
        + ' — the land-cover, soil and terrain inputs this layer needs are not held for this unit';
    }catch(_){}
  }
  const score=_noDataFlag ? null : Math.round(hzClamp(core,0,100));
  
  
  var _prov=null;
  try{ _prov=hzProvenance(inp, hazard);
       if(_noDataFlag && _prov.state!=='absent'){ _prov=Object.assign({},_prov,{state:'absent',
         why:(_hazNoDataWhy||_prov.why)}); } }catch(_){}
  

  var _phys = (function(){
    try{
      

      

      var _pT=(inp && inp.heatWetBulbTemp!=null && Number.isFinite(Number(inp.heatWetBulbTemp))) ? Number(inp.heatWetBulbTemp) : (inp?inp.t:NaN);
      var _pH=(inp && inp.heatMeanRh!=null && Number.isFinite(Number(inp.heatMeanRh))) ? Number(inp.heatMeanRh) : (inp?inp.hum:NaN);
      var _wbNow = (typeof hzWetBulb==='function' && Number.isFinite(_pT) && Number.isFinite(_pH))
                     ? hzWetBulb(_pT, _pH, (inp&&inp.elev!=null&&Number.isFinite(+inp.elev))?+inp.elev:null) : NaN;    
       
      var _uNow = (_heatRes && _heatRes.utciShade!=null && isFinite(+_heatRes.utciShade)) ? +_heatRes.utciShade    
                : (inp && inp.heatUtciShade!=null && isFinite(+inp.heatUtciShade)) ? +inp.heatUtciShade
                : ((typeof agnUtci==='function' && inp && Number.isFinite(+inp.t) && Number.isFinite(+inp.hum))
                    ? agnUtci(+inp.t, +inp.t, Number.isFinite(+inp.wind)&&inp.wind!=null?(+inp.wind)/3.6:0.5, +inp.hum) : null);
      var P = {
        heat:      { m:'UTCI in shade',                   u:'°C',    v:(_uNow!=null&&isFinite(_uNow))?+(+_uNow).toFixed(1):null },
        telco_heat:{ m:'UTCI in shade',                   u:'°C',    v:(_uNow!=null&&isFinite(_uNow))?+(+_uNow).toFixed(1):null },
        cold:      { m:'UTCI in shade (coldest hour)',    u:'°C',    v:(inp&&inp.coldUtciShade!=null&&isFinite(+inp.coldUtciShade))?+(+inp.coldUtciShade).toFixed(1):((inp&&Number.isFinite(inp.t))?null:null) },    
        rain_hz:   { m:'rainfall intensity',              u:'mm/h',  v:(inp&&Number.isFinite(inp.rain))?+Number(inp.rain).toFixed(1):null },
        

        wind:      (function(){
                     if(inp&&Number.isFinite(inp.gust))
                       return { m:'gust at 10 m', u:'km/h', v:Math.round(inp.gust) };
                     if(inp&&Number.isFinite(inp.wind))   /* v283.36 item 17: no gust factor */
                       return { m:'gust at 10 m', u:'km/h', v:null, why:'gust not forecast' };
                     if(false)
                       return { m:'gust at 10 m (estimated)', u:'km/h',
                                v:null,
                                why:'no forecast gust for this unit. This is the sustained wind of '
                                   +Math.round(inp.wind)+' km/h multiplied by '
                                   +k+'. That factor is an assumption, not a sourced value, and this is not a '
                                   +'forecast gust. A fixed ratio cannot represent the gust factor across '
                                   +'stability regimes, so do not read it as a threshold crossing.' };
                     return { m:'gust at 10 m', u:'km/h', v:null };
                   })(),
        telco_wind:{ m:'gust at 10 m',                    u:'km/h',  v:(inp&&Number.isFinite(inp.gust))?Math.round(inp.gust):null },
        flood:     { m:'6 h rainfall accumulation',       u:'mm',    v:(inp&&Number.isFinite(inp.rain6hDay))?+Number(inp.rain6hDay).toFixed(1):null },
        telco_flood:{m:'6 h rainfall accumulation',       u:'mm',    v:(inp&&Number.isFinite(inp.rain6hDay))?+Number(inp.rain6hDay).toFixed(1):null },
        nss_baseline:{ m:'potential maximum retention S (usual wetness)', u:'mm', v:(typeof _nssS!=='undefined'&&_nssS!=null)?_nssS:null },
        nss_dynamic: { m:'potential maximum retention S (current wetness)', u:'mm', v:(typeof _nssS!=='undefined'&&_nssS!=null)?_nssS:null },
        drought:   { m:'root-zone soil moisture',         u:'m³/m³', v:(inp&&Number.isFinite(inp.smRoot))?+Number(inp.smRoot).toFixed(3):null },
        landslide: { m:'rainfall over the governing duration', u:'mm', v:null },
        glof:      { m:'melt-driver temperature at the source elevation', u:'°C', v:null },
        air:       { m:'PM2.5 concentration',             u:'µg/m³', v:(inp&&Number.isFinite(inp.pm25))?+Number(inp.pm25).toFixed(1):null },
        seismic:   { m:null, u:null, v:null,
                     why:'a design-basis zone is a category, not a continuous physical quantity. '
                        +'The engineering quantities are PGA and spectral acceleration, and this '
                        +'build holds neither.' },
        cyclone:   { m:null, u:null, v:null,
                     why:'an expert coastal-segment exposure value. No track, no wind field and no '
                        +'surge model, so there is no physical quantity to report.' }
      };
      var e = P[hazard] || { m:null, u:null, v:null, why:'no physical measurand declared for this layer' };
      return { measurand:e.m, unit:e.u, value:e.v,
               why:e.why || (e.v==null && e.m ? 'the measurand is declared but its value did not arrive for this unit' : null) };
    }catch(_){ return { measurand:null, unit:null, value:null, why:'physical quantity could not be resolved' }; }
  })();
  

  var _publishedScore = _categorical ? null : score;
  return {score:_publishedScore, riskSignal:_publishedScore,
          mapValue:(_categorical ? (_mapValue!=null?_mapValue:score) : score),
          mapValueWhy:(_categorical
            ? 'an internal rendering value so the choropleth has something to shade. It is '
              +'not a hazard score, is not comparable with the live hazards on the same '
              +'colour ramp, and is never published as a number.'
            : null),
          noData:_noDataFlag, noDataWhy:_hazNoDataWhy,
          notApplicable:(_hazNoDataClass==='ineligible'), notApplicableWhy:(_hazNoDataClass==='ineligible'?_hazNoDataWhy:null),
          

          pathwayUnavailable:(_floodRes && _floodRes.pathwayUnavailable === true) || false,
          contextScore:(_floodRes && _floodRes.contextScore != null) ? _floodRes.contextScore : null,
          contextScoreWhy:(_floodRes && _floodRes.contextScoreWhy) || null,
          pathwayWhy:(_floodRes && _floodRes.why) || null,
          

          noDataClass:(_noDataFlag?(_hazNoDataClass||'feed'):null),
          noDataClassLabel:(_noDataFlag
            ? ((HZ_REFUSAL_CLASS[_hazNoDataClass||'feed']||{}).label||null) : null),
          noDataClassNote:(_noDataFlag
            ? ((HZ_REFUSAL_CLASS[_hazNoDataClass||'feed']||{}).note||null) : null),
           
          physicalMeasurand:_phys.measurand, physicalUnit:_phys.unit, physicalValue:_phys.value,
          physicalWhy:_phys.why,
          screeningIndex:(_categorical?null:score),
          

          screeningBand:(_categorical ? (_category||null)
                        : (score==null || !isFinite(score) ? null
                          : ((typeof riskWord==='function')?riskWord(score):null))),
          scaleType:(_categorical?'ordinal category':'ordinal index 0-100'),
          

          construction:_measurand,
          scaleWhy:'the 0-100 index ranks severity WITHIN this hazard. It is not a probability, '
                 + 'not a return period, and not comparable across hazards. Read the physical '
                 + 'quantity for anything that needs a number with a unit.',
          provenance:_prov, top, metricLabels, notes,
          

          drivers:drivers.map(function(v){ return (v==null||!isFinite(Number(v)))?null:Math.round(Number(v)); }), zone:terr.zone, zoneLabel:(HZ_ZONES[terr.zone]||{}).label, terr, kind,
          

          flood:(typeof __floodBasis!=='undefined'&&__floodBasis)?{
            governingPath:__floodBasis.governingPath, driverBasis:__floodBasis.driverBasis,
            

            crossLayer:__floodBasis.crossLayer,
            rainActive:__floodBasis.rainActive, pluvial:__floodBasis.pluvial,
            riverine:__floodBasis.riverine, river:__floodBasis.river,
            riverCovered:__floodBasis.riverCovered, riverChecked:__floodBasis.riverChecked,
            

            pathways:__floodBasis.pathways, leadStatement:__floodBasis.leadStatement,
            

            pathwayCoverage:(function(){
              var pw=__floodBasis.pathways||{};
              var p=!(pw.pluvial&&pw.pluvial.unavailable), r=!(pw.riverine&&pw.riverine.unavailable);
              return { pluvial:p, riverine:r,
                       both:(p&&r), neither:(!p&&!r),
                       why: (p&&r) ? 'both pathways scored; the higher governs'
                          : (p&&!r) ? ('pluvial only \u2014 '
                                       + ((pw.riverine&&pw.riverine.basis)||'the riverine pathway did not score')
                                       + '. River state here is UNKNOWN, not normal.')
                          : (!p&&r) ? ('riverine only \u2014 '
                                       + ((pw.pluvial&&pw.pluvial.basis)||'the pluvial pathway did not score'))
                          : 'neither pathway scored' };
            })(),
            antecedentBasis:__floodBasis.antecedentBasis, antecedentPath:__floodBasis.antecedentPath,
            accumAvailable:__floodBasis.accumAvailable,
            weightsUsed:__floodBasis.weightsUsed, runoffFloor:__floodBasis.runoffFloor,
            rcEff:__floodBasis.rcEff,
            runoffBasis:__floodBasis.runoffBasis, runoffConfidence:__floodBasis.runoffConfidence,
            nssRetentionMm:__floodBasis.nssRetentionMm,
            hsg:__floodBasis.hsg, hsgBasis:__floodBasis.hsgBasis
          }:null,
          rainNoData, provisional:rainNoData,   
          

          leadScaled:_leadScaled, leadFactor:lf,
          

          categorical:_categorical, category:_category, zone:_categoryZone,
          categoryLabel:_categoryLabel,
          evidenceClass:_evidenceClass, evidenceClassWhy:_evidenceClassWhy,
          

          comfort:{feels:(inp.feels!=null?inp.feels:(inp.t!=null?inp.t:null)),
                   feelsIsProxy:(inp.feels==null&&inp.t!=null),
                   

                   wb:(function(){ if(typeof hzWetBulb!=='function'||inp.t==null||inp.hum==null) return null;
                                   var _w=hzWetBulb(inp.t,inp.hum,(inp.elev!=null&&Number.isFinite(+inp.elev))?+inp.elev:null); return (_w==null||!isFinite(_w))?null:Math.round(_w); })(),
                   wbUnavailable:((inp.t==null||inp.hum==null)?'wet bulb needs both temperature and humidity; one of them did not arrive':null),
                   heatStress:score}};
}


  
/* v283.36 · launch item 28 · the old operator station-risk formula (aiRiskFor: rain pulse, heat load, gust potential with the 1.5 gust factor, AQI stress, lead factors) is deleted: no source, a second scorer kept only for parity */


function _canonicalRefusal(hazard, why){
  return { score:null, riskSignal:null, noData:true,
           noDataWhy:why, noDataClass:'method',
           noDataClassLabel:'Not instrumented here',
           screeningIndex:null, screeningBand:null,
           unavailable:why,
           top:'Not scored', kind:(hazard||'hazard')+' (screening)',
           drivers:[0,0,0,0],
           metricLabels:[(hazard||'hazard')+' \u2014 not scored','\u2014','\u2014','\u2014'],
           notes:[why,'','',''] };
}
try{ window._canonicalRefusal=_canonicalRefusal; }catch(_){}

function aiDistrictRisk(input,hazard,lead,name){
  if(!agnEngineHost()){   /* W1: the browser reads the issued level of the tehsil: from the levels the page holds for it (the place's bundle)
                             when it holds them, otherwise from the map's issued run of the layer (the dashboard's day) */
    var V0=window.AGN&&AGN.v283, E0=window.AGN&&AGN.engineLevels, u0=(V0&&V0.uidOf)?V0.uidOf(name):null;
    if(E0&&E0.own&&E0.own(u0)){ var d0=0; try{ d0=AGN.day&&AGN.day.get?(Number(AGN.day.get())||0):0; }catch(_){} return E0.result(hazard, u0, d0); }
    return (V0&&V0.resultFor)?V0.resultFor(name, hazard):agnPageRefusal(hazard); }
  
  
  if(name && typeof hzScore==='function'){
    return hzScore(name, input, hazard, lead, name);    
  }
  

  return _canonicalRefusal(hazard, !name
    ? 'this unit did not resolve to a district, so the canonical engine has no terrain, '
      + 'zone or elevation to score it with'
    : 'the canonical hazard engine is not loaded in this build');
}


function aiStationDistrict(s){
  if(!s) return null;
  

  try{
    var _DI=window.DISTRICT_IN||{};
    if(_DI[s.name]) return s.name;
    if(s.lat!=null && window.AGN && AGN.geo && AGN.geo.pointInFeature && window.PK_DISTRICTS && PK_DISTRICTS.features){
      var _c=aiStationDistrict.__c||(aiStationDistrict.__c={}), _k=s.lat+','+s.lon;
      if(_c[_k]) return _c[_k];
      var _f=PK_DISTRICTS.features.find(function(f){ var p=f&&f.properties||{}; return p.key && _DI[p.key] && p.province!==IIOJK && AGN.geo.pointInFeature(s.lat,s.lon,f); });
      if(_f){ _c[_k]=_f.properties.key; return _c[_k]; }
    }
  }catch(_){}
  if(typeof PK_DISTRICT_TERRAIN!=='undefined' && PK_DISTRICT_TERRAIN[s.name]) return s.name;
  if(typeof PK_DISTRICT_CENTROIDS==='undefined' || s.lat==null) return null;
  let best=null, bd=1e9;
  for(const d of PK_DISTRICT_CENTROIDS){ if(d.province===IIOJK) continue;
    const dd=(d.lat-s.lat)**2+(d.lon-s.lon)**2; if(dd<bd){ bd=dd; best=d.district; } }
  return best;
}

function aiForecastConditionsAt(stationId, leadHours){
  
  
  
  
  const e = (typeof window!=='undefined' && window.LIVE_HOURLY) ? window.LIVE_HOURLY[stationId] : null;
  if(!e || !Array.isArray(e.time) || !e.temp || e.nowIdx==null) return null;
  const target = e.nowIdx + Math.round(leadHours);   
  if(target < 0 || target >= e.time.length) return null;
  const at=(arr)=> (arr && arr[target]!=null) ? arr[target] : null;
  if(at(e.temp)==null) return null;
  return {
    t: at(e.temp), feels: at(e.feels), hum: at(e.hum), wind: at(e.wind),
    gust: at(e.gust),                       
    rain: at(e.rain),                       
    rainProb: at(e.rainProb),               
    snow: at(e.snow), pressure: at(e.pressure), soilMoist: at(e.soilMoist),
    idx: target, validTime: e.time[target], forecastHour: leadHours
  };
}
function aiStationRisk(s,hazard,lead){
  if(!agnEngineHost()){   /* W1: the browser reads the issued level of the station's tehsil on the day the lead falls on */
    var E0=window.AGN&&AGN.engineLevels; if(!E0||!E0.result) return agnPageRefusal(hazard);
    var md=null; try{ md=(aiState&&aiState.mapDay!=null&&isFinite(Number(aiState.mapDay)))?Number(aiState.mapDay):null; }catch(_){}
    var r0=E0.result(hazard, (s&&s.lat!=null)?E0.unitAt(+s.lat,+s.lon):null, md!=null?md:E0.dayOfLead(lead));
    r0.forecastHorizonHours=lead; return r0; }
  const name=aiStationDistrict(s);
  if(name && typeof hzScore==='function'){
    
    
    const fc = aiForecastConditionsAt(s.id, lead);
    let inp, usedForecast=false;
    if(fc && fc.t!=null){
      

      var _base=null; try{ _base=(typeof __dayInp==='function')?__dayInp(name, hazard):null; }catch(_){ _base=null; }
      if(!_base && DISTRICT_IN[name]) _base=Object.assign({}, DISTRICT_IN[name]);
      inp=Object.assign({}, _base||{}, { t:fc.t, hum:fc.hum!=null?fc.hum:s.hum, wind:fc.wind!=null?fc.wind:s.wind,
            
            gust:(fc.gust!=null?fc.gust:s.gust), rain:(fc.rain!=null?fc.rain:s.rain),
            snow:(fc.snow!=null?fc.snow:undefined), pressure:(fc.pressure!=null?fc.pressure:undefined),
            feels:fc.feels!=null?fc.feels:fc.t, uv:s.uv, aqi:s.aqi,
            
            soilMoist:(fc.soilMoist!=null?fc.soilMoist:(DISTRICT_IN[name]&&DISTRICT_IN[name].soilMoist)),
             
            timeBasis:'forecast hour', forecastHorizonHours:lead, heatDryTemp:fc.t, heatApparentMax:(fc.feels!=null?fc.feels:null), heatWetBulbAirTemp:fc.t, heatWetBulbTemp:fc.t, heatMeanRh:(fc.hum!=null?fc.hum:null),
            heatUtciShade:null, heatUtciT:null, heatUtciRh:null, heatUtciWind:null, heatUtciCalm:null, heatUtciBasis:null, coldUtciShade:null, coldUtciT:null, coldUtciRh:null, coldUtciWind:null, coldUtciCalm:null, coldUtciBasis:null,    
            weatherLive:true, forecastLive:true, fcSource:(_base&&_base.fcSource)||'station_hourly_live',
            api:(_base&&_base.api!=null)?_base.api:(s.apiIndex!=null?s.apiIndex:undefined) });
      usedForecast=true;
    } else {
      return _canonicalRefusal(hazard, 'forecast-hour inputs for +' + lead
        + ' h are not loaded for this station. NIGRAAN refuses rather than scaling current conditions into a future score');
    }
    const r = hzScore(name, inp, hazard, 24, name);
    r.forecastBasis = 'forecast_hour';
    r.validTime = fc.validTime;
    r.forecastHorizonHours = lead;
    return r;
  }
   
  return _canonicalRefusal(hazard, !name
    ? 'this station did not resolve to a district, so the canonical engine has no terrain, '
      + 'zone or elevation to score it with'
    : 'the canonical hazard engine is not loaded in this build');
}
try{ document.addEventListener('agn:sweep-done', function(){ try{ if(typeof aiRender==='function') aiRender(); }catch(_){} }); }catch(_){}    
/* v91.17.283.20 · B7 · THE ONE aiRender: the page's render (aiRenderBody), then the steps that were three save-and-wrap layers, in their
   order: the lead buttons (syncAiLead), the predictions and their sync (AGN.aiP75), the v76 predictions (AGN.aiP76) */
function aiRender(){ var out=aiRenderBody.apply(this,arguments);
  try{ if(typeof syncAiLead==='function') syncAiLead(); }catch(_){}
  if(window.AGN&&AGN.aiP75){ try{ AGN.aiP75.post(); }catch(e){ try{ console.warn('[AGN p75] predictions',e&&e.message); }catch(_){} } try{ AGN.aiP75.sync(); }catch(_){} }
  if(window.AGN&&AGN.aiP76){ try{ AGN.aiP76.post(); }catch(e){ try{ console.warn('[AGN p76] predictions',e&&e.message); }catch(_){} } }
  return out; }
function aiRenderBody(){
  
  
  
  
  
  if(typeof setPanelAccentFromHazard==='function'){ try{ setPanelAccentFromHazard(aiState.hazard); }catch(e){} }
  const _b0=STATIONS.find(x=>x.id===selectedId)||null; const base=aiState.station || (_b0?effStation(_b0):null); if(!base) return;   /* v283.36 item 14 */
  const s=base;
  
  
  try{
    if(s && s.id && typeof fetchHourlyForecast==='function' &&
       (!window.LIVE_HOURLY || !window.LIVE_HOURLY[s.id]) && !aiState._hourlyPending){
      aiState._hourlyPending=true;
      Promise.resolve(fetchHourlyForecast(s)).then(ok=>{ aiState._hourlyPending=false; if(ok) aiRender(); })
        .catch(()=>{ aiState._hourlyPending=false; });
    }
  }catch(e){}
  const h=AI_HAZARDS[aiState.hazard], r=aiStationRisk(s,aiState.hazard,aiState.lead), b=aiBand(r.score);
  aiState.last={s,r,b};
  aiSet('aiCity',s.name); aiSet('aiRiskScore',r.score==null?'\u2014':r.score); aiSet('aiBand',b.band); aiSet('aiBandNote',b.note);
  aiSet('aiProb',r.score==null?'\u2014':(r.score+'/100'));    
  if(r.served){   /* v91.17.283.24 · W1: the issued level of the station's tehsil, or "Not assessed" with the server's reason */
    aiSet('aiRiskScore', r.level!=null?r.category:'Not assessed'); aiSet('aiBand', r.level!=null?r.category:'Not assessed');
    aiSet('aiBandNote', r.level!=null?(r.categoryLabel||''):('Not assessed: '+(r.noDataWhy||'no issued level'))); }
  

  const _sprC=(function(){ try{ if(typeof mmStats==='function'&&typeof mmState!=='undefined'&&mmState&&mmState.series&&mmState.source==='live'){
      const st=mmStats(mmState.series, mmState.lead), vm=(typeof MM_VARMAP!=='undefined')?MM_VARMAP[mmState.variable]:null;
      if(st&&st.keys&&st.keys.length>1&&isFinite(st.avgSpread)&&vm) return {v:st.avgSpread, u:vm.unit, lab:vm.label, h:mmState.lead, at:(mmState.station&&mmState.station.name)||null}; } }catch(_){ }
    return null; })();
  const _sprOther=!!(_sprC&&_sprC.at&&s&&s.name&&_sprC.at!==s.name);
  const _confEl=document.getElementById('aiConfidence');
  if(!(_confEl&&_confEl.dataset.liveSpread==='1'))
    aiSet('aiConfidence', (_sprC&&!_sprOther) ? (Math.round(_sprC.v*10)/10).toFixed(1)+' '+_sprC.u : '—');
  aiSet('aiConfidenceSrc', !_sprC ? 'ensemble not live' : _sprOther ? ('the model range is loaded for '+_sprC.at+', not for this place')
        : ('mean range between the live models, '+_sprC.lab+' over '+_sprC.h+' h (lower = tighter)'));
  aiSet('aiLeadLabel',aiState.lead+'h'); aiSet('aiTopDriver',r.top);
  const ring=document.getElementById('aiRing'); if(ring) ring.style.setProperty('--ai-ang',Math.round(r.score/100*360)+'deg');
  aiSet('aiSummary',`${h.label} risk preview for ${s.name} at +${aiState.lead} h: ${(function(){ try{ var b=window.agnBandOf&&agnBandOf(r.score), W=(window.AGN&&AGN.hz5&&AGN.hz5.words)||['Normal','Low','Moderate','High','Severe']; return b?W[b.index]:'no level'; }catch(_){ return 'no level'; } })()} on NIGRAAN's five-level scale (a screening level, not a calibrated chance). `+(r.forecastBasis==='forecast_day_peak'?`Scored on the ${(window.AGN&&AGN.p76&&AGN.p76.peakLabel)?AGN.p76.peakLabel(r,aiState.lead):'day\u2019s peak'}.`:r.forecastBasis==='forecast_hour'?`Scored from the live forecast at +${aiState.lead}h${r.validTime?' ('+String(r.validTime).replace('T',' ')+')':''}.`:`Scored from current conditions (per-hour forecast still loading; not a true ${aiState.lead}h forecast yet).`)+` Not a calibrated probability or verified forecast skill score.`);
  
  
  try{
    const aiModeEl=document.getElementById('aiMode');
    if(aiModeEl){
      aiModeEl.textContent = (r.forecastBasis==='forecast_hour')
        ? ('rule-based · live forecast +'+aiState.lead+'h')
        : (r.forecastBasis==='forecast_day_peak') ? 'rule-based · live forecast, day peak'    
        : (r.forecastBasis==='issued_day') ? 'the issued level of the tehsil (server)'
        : r.served ? 'not assessed (server)'
        : 'rule-based · live inputs (forecast loading)';
    }
  }catch(e){}
  aiSet('aiBriefTitle',`${h.label} advisory · ${s.name}`);
  ['1','2','3','4'].forEach((n,i)=>{ aiSet('aiM'+n+'Label',r.metricLabels[i]); aiSet('aiM'+n,(r.score==null||r.drivers[i]==null)?'\u2014':r.drivers[i]); aiSet('aiM'+n+'Note',r.notes[i]);
    const _mc=document.getElementById('aiM'+n), _mw=_mc&&_mc.closest('.ai-metric'); if(_mw) _mw.style.display=/weight 0\)/.test(String(r.metricLabels[i]||''))?'none':''; });
  const drv=document.getElementById('aiDrivers');
  

  if(drv){
    const _lab=(r.metricLabels && r.metricLabels.length===r.drivers.length) ? r.metricLabels : h.drivers;
    drv.innerHTML=r.drivers.map((val,i)=>{ if(r.score==null) val=null; return `<div class="ai-driver"><span>${_lab[i]}</span><span class="track"><i style="width:${val==null?0:Math.max(0,Math.min(100,val))}%"></i></span><b>${val==null?(typeof NODATA_GLYPH!=='undefined'?NODATA_GLYPH:'\u2014'):val}</b></div>`; }).join('');    
  }
}
function aiOnCity(s){ aiState.station=s; aiRender(); }

const AI_SECTOR_HAZARDS={

  agriculture:[['drought','Drought'],['rain_hz','Heavy rain'],['flood','Flood'],['heat','Heat stress'],['cold','Cold stress (UTCI)'],['wind','Wind and gusts'],['glof','Glacial lake outburst flood (GLOF)']],
  telecom:    [['telco_wind','Wind'],['telco_flood','Flood'],['telco_heat','Heat'],['telco_lightning','Convective proxy'],['seismic','Seismic']],
  energy:     [['heat','Heat stress'],['flood','Flood'],['wind','Wind and gusts'],['seismic','Seismic'],['cold','Cold stress (UTCI)']],
  transport:  [['flood','Flood'],['rain_hz','Heavy rain'],['wind','Wind and gusts'],['seismic','Seismic'],['cold','Cold stress (UTCI)'],['glof','Glacial lake outburst flood (GLOF)']],
  water:      [['drought','Drought'],['flood','Flood'],['rain_hz','Heavy rain'],['seismic','Seismic'],['glof','Glacial lake outburst flood (GLOF)']],
  hospital:   [['heat','Heat stress'],['flood','Flood'],['cold','Cold stress (UTCI)'],['seismic','Seismic'],['wind','Wind and gusts']],
  industrial: [['flood','Flood'],['heat','Heat stress'],['seismic','Seismic'],['wind','Wind and gusts'],['rain_hz','Heavy rain']],
  commercial: [['flood','Flood'],['heat','Heat stress'],['rain_hz','Heavy rain'],['wind','Wind and gusts'],['seismic','Seismic']],
  

  population: [['heat','Heat stress'],['flood','Flood'],['cold','Cold stress (UTCI)'],['rain_hz','Heavy rain'],['drought','Drought'],['glof','Glacial lake outburst flood (GLOF)'],['seismic','Seismic']]
};



const AI_SECTOR_METRICS = {
  agriculture:{ unit:'Cropped hectares', pathway:'Yield loss, sowing delay, livestock stress',
    physicalThresholds:[
      {variable:'temperature_2m', operator:'>', value:35, unit:'°C', qualifier:'at flowering',
       consequence:'yield penalty', authority:'agn-default'}],
    screeningGuidance:[
      {hazard:'drought', operator:'>', index:60, consequence:'irrigation shortfall'},
      {hazard:'flood',   operator:'>', index:65, consequence:'standing-crop loss'}],
    owner:'Extension services, ag-lenders' },
  telecom:{ unit:'Tower sites', pathway:'Power loss, backhaul cut, site inundation',
    physicalThresholds:[
      {variable:'wind_gusts_10m', operator:'>', value:90, unit:'km/h',
       consequence:'structural check', authority:'agn-default'},
      {variable:'temperature_2m', operator:'>', value:45, unit:'°C',
       consequence:'equipment derating', authority:'agn-default'}],
    screeningGuidance:[
      {hazard:'flood', operator:'>', index:65, consequence:'generator and fuel access'}],
    owner:'Network operations' },
  energy:{ unit:'Substations, lines', pathway:'Derating, outage, access failure',
    physicalThresholds:[
      {variable:'temperature_2m', operator:'>', value:45, unit:'°C',
       consequence:'transformer derating', authority:'agn-default'},
      {variable:'wind_gusts_10m', operator:'>', value:100, unit:'km/h',
       consequence:'line and pylon risk', authority:'agn-default'}],
    screeningGuidance:[
      {hazard:'flood', operator:'>', index:65, consequence:'substation access and shutdown review'}],
    owner:'Grid operations' },
  transport:{ unit:'Road and rail km', pathway:'Washout, closure, slope failure',
    physicalThresholds:[
      {variable:'precipitation', operator:'>', value:30, unit:'mm/h',
       consequence:'surface flooding', authority:'agn-default'}],
    screeningGuidance:[
      {hazard:'flood',     operator:'>', index:70, consequence:'culvert and bridge review'},
      {hazard:'landslide', operator:'>', index:65, consequence:'slope review on steep sections'}],
    owner:'Highways, NHA' },
  water:{ unit:'Supply and treatment', pathway:'Source failure, turbidity, contamination',
    physicalThresholds:[],
    screeningGuidance:[
      {hazard:'drought', operator:'>', index:65, consequence:'source stress'},
      {hazard:'flood',   operator:'>', index:70, consequence:'intake contamination review'},
      {hazard:'glof',    operator:null, index:null, consequence:'headworks damage pathway'}],
    owner:'WASA, PHED' },
  hospital:{ unit:'Beds, critical services', pathway:'Surge demand, access loss, power failure',
    physicalThresholds:[
      {variable:'temperature_2m', operator:'>', value:42, unit:'°C',
       consequence:'heat-illness surge', authority:'agn-default'}],
    screeningGuidance:[
      {hazard:'flood', operator:'>', index:65, consequence:'access and supply'},
      {hazard:'cold',  operator:'>', index:60, consequence:'respiratory admissions'}],
    owner:'Health department' },
  industrial:{ unit:'Plants, output days', pathway:'Production halt, supply-chain break',
    physicalThresholds:[
      {variable:'temperature_2m', operator:'>', value:45, unit:'°C',
       consequence:'labour and cooling limits', authority:'agn-default'}],
    screeningGuidance:[
      {hazard:'flood',   operator:'>', index:65, consequence:'floor inundation review'},
      {hazard:'seismic', operator:null, index:null, consequence:'structural review'}],
    owner:'Plant operations, HSE' },
  commercial:{ unit:'Floor area, trading days', pathway:'Closure, stock loss, footfall drop',
    physicalThresholds:[
      {variable:'temperature_2m', operator:'>', value:42, unit:'°C',
       consequence:'cooling load and footfall', authority:'agn-default'},
      {variable:'wind_gusts_10m', operator:'>', value:90, unit:'km/h',
       consequence:'facade risk', authority:'agn-default'}],
    screeningGuidance:[
      {hazard:'flood', operator:'>', index:60, consequence:'ground-floor stock'}],
    owner:'Facilities, insurance' },
  population:{ unit:'Residents', pathway:'Heat and cold mortality, displacement, disease',
    physicalThresholds:[
      {variable:'temperature_2m', operator:'>', value:42, unit:'°C',
       consequence:'heat-illness protocols', authority:'agn-default'},
      {variable:'temperature_2m', operator:'<', value:0,  unit:'°C', qualifier:'with exposure',
       consequence:'shelter activation', authority:'agn-default'}],
    screeningGuidance:[
      {hazard:'flood', operator:'>', index:65, consequence:'evacuation planning'}],
    owner:'District administration, health and labour' }
};
 
function aiSectorThresholdText(M){
  var AUTH={ manufacturer:'manufacturer', standard:'standard', 'site-rule':'site rule',
             regulator:'regulator', 'agn-default':'AGN screening default' };
  var phys=(M&&M.physicalThresholds||[]).map(function(t){
    return t.variable+' '+t.operator+' '+t.value+' '+t.unit
         + (t.qualifier?' ('+t.qualifier+')':'')
         + ' → '+t.consequence+' ['+(AUTH[t.authority]||t.authority)+']'; });
  var scr=(M&&M.screeningGuidance||[]).map(function(g){
    return g.index==null ? (g.hazard+' → '+g.consequence)
         : (g.hazard+' index '+g.operator+' '+g.index+'/100 → '+g.consequence); });
  return { physical:phys, screening:scr,
    physicalNote:phys.length
      ? 'Physical thresholds, in their own units. These are the values an operating-limit '
       +'register compares a forecast against; every one below is an AGN screening default '
       +'until the client supplies its own.'
      : 'No physical threshold is declared for this sector in this build.',
    screeningNote:scr.length
      ? 'Screening guidance on NIGRAAN\'s own 0-100 index. These are NOT physical thresholds '
       +'and NOT operating limits: the index ranks severity within one hazard and carries no '
       +'unit. A number here can never be compared with a °C or a km/h above.'
      : null };
}
try{ window.aiSectorThresholdText=aiSectorThresholdText; }catch(_){}
window.AI_SECTOR_METRICS = AI_SECTOR_METRICS;
 
const AI_SECTOR_LABELS={
  agriculture:'Agriculture', telecom:'Telecom', energy:'Energy',
  transport:'Transport', water:'Water', hospital:'Health',
  industrial:'Industrial', commercial:'Commercial',
  population:'Population & people'
};


window.AI_SECTOR_HAZARDS=AI_SECTOR_HAZARDS;
window.AI_SECTOR_LABELS=AI_SECTOR_LABELS;
if(typeof aiState!=='undefined'){ aiState.sector = aiState.sector || 'agriculture'; }
function aiBuildHazardButtons(){
  const seg=document.getElementById('aiHazardSeg'); if(!seg) return;
  const list=AI_SECTOR_HAZARDS[aiState.sector]||AI_SECTOR_HAZARDS.agriculture;
  
  const prev=aiState.hazard;
  const stillValid=list.some(h=>h[0]===prev);
  const current=stillValid?prev:list[0][0];
  seg.classList.add('ai-haz-select-wrap');
  seg.innerHTML='<label class="ai-haz-label" for="aiHazardSelect">Hazard</label>'+
    `<select id="aiHazardSelect" class="ai-haz-select" aria-label="Prediction hazard">`+
    list.map(h=>`<option value="${h[0]}"${h[0]===current?' selected':''}>${h[1]}</option>`).join('')+
    `</select>`;
  aiState.hazard=current;
  
  
  
  
  
  if(current!==prev){
    try{
      const pick=document.getElementById('mapHazardPick');
      if(pick && typeof districtHazardMode!=='undefined' && districtHazardMode){ if(typeof ensurePickOption==='function') ensurePickOption(pick,current); pick.value=current; }
      if(typeof updateLayerMeta==='function' && typeof fillMetaKey==='function' && typeof districtHazardMode!=='undefined' && districtHazardMode) updateLayerMeta(fillMetaKey(current));
      if(typeof setPanelAccentFromHazard==='function') setPanelAccentFromHazard(current);
      if(typeof drawLegend==='function' && typeof districtHazardMode!=='undefined' && districtHazardMode) drawLegend();
    }catch(e){ if(window.__MACH_DEBUG) console.debug('[v31 hazard sync]', e&&e.message); }
  }
  const sel=document.getElementById('aiHazardSelect');
  if(sel) sel.onchange=function(){
    aiState.hazard=sel.value; aiRender();
    if(districtHazardMode && typeof refreshDistrictHazard==='function') refreshDistrictHazard();
    const pick=document.getElementById('mapHazardPick');
    if(pick && districtHazardMode){ if(typeof ensurePickOption==='function') ensurePickOption(pick,aiState.hazard); pick.value=aiState.hazard; }
  };
}
function aiInit(){
  

  (function(){
    var selEl=document.getElementById('aiSectorSel');
    if(selEl && !selEl.options.length){
      var keys=Object.keys(AI_SECTOR_HAZARDS);
      selEl.innerHTML=keys.map(function(k){
        return '<option value="'+k+'">'+(AI_SECTOR_LABELS[k]||k)+'</option>';
      }).join('');
      selEl.value=(window.AGN&&AGN.sector&&AGN.sector.get())||aiState.sector||'agriculture';
    }
    if(selEl) selEl.onchange=function(){
      if(window.AGN&&AGN.sector) AGN.sector.set(selEl.value,'airisk');
      else { aiState.sector=selEl.value; aiBuildHazardButtons(); aiRender(); }
    };
  })();
  aiBuildHazardButtons();
  document.querySelectorAll('#aiLeadSeg button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#aiLeadSeg button').forEach(x=>x.classList.remove('on'));b.classList.add('on');aiState.lead=parseInt(b.dataset.lead,10);aiRender(); });    
  aiRender();
}









const SPI_CACHE = {};   
const SPI_LOADING = {};
const SPI_FAILED = {};  



























var SPI_STRESS_KNOTS = [[0,0], [-1.0,45], [-1.5,65], [-2.0,82], [-3.0,100]];
function spiToStress(spi){
  if(spi==null || !Number.isFinite(+spi)) return null;
  var x = +spi;
  if(x >= 0) return 0;
  var K = SPI_STRESS_KNOTS;
  for(var i=0;i<K.length-1;i++){
    var a=K[i], b=K[i+1];
    if(x <= a[0] && x >= b[0]){
      if(x === a[0]) return a[1];
      if(x === b[0]) return b[1];
      

      var f=(a[0]-x)/(a[0]-b[0]);
      return Math.floor(a[1] + f*(b[1]-a[1]));
    }
  }
  return 100;                                      
}






const FAO56_KC = {
  wheat:  {kcMid:1.15, p:0.55, label:"Wheat (winter)"},
  cotton: {kcMid:1.15, p:0.65, label:"Cotton"},
  rice:   {kcMid:1.20, p:0.20, label:"Rice (paddy)"},
  maize:  {kcMid:1.20, p:0.55, label:"Maize (grain)"}
};


const SOIL_FC=0.30, SOIL_WP=0.10;   

function fao56Stress(soilMoist, cropKey, district, sw){
  const c=FAO56_KC[cropKey]; if(!c || soilMoist==null) return null;
  

  let FC=SOIL_FC, WP=SOIL_WP;
  

  if(sw && sw.fc!=null && sw.wp!=null && sw.fc>sw.wp){ FC=sw.fc; WP=sw.wp; }
  else try{ const s=(window.AGN&&AGN.soilWater&&district)?AGN.soilWater.fcwp(district):null;
       if(s){ FC=s.fc; WP=s.wp; } }catch(_){}
  const TAW=FC-WP, RAW=c.p*(FC-WP);
  if(!(TAW>0)) return null;
  

  const rew=(soilMoist-WP)/TAW;
  if(!(rew>=-0.02) || !(rew<=1.05)) return null;
  const Dr=Math.max(0, TAW*(1-Math.min(1,Math.max(0,rew))));
  const Ks = Dr<=RAW ? 1 : Math.max(0,(TAW-Dr)/(TAW-RAW));   
  return Math.round((1-Ks)*100);
}
function fao56Basis(district, sw){
  if(sw && sw.fc!=null && sw.wp!=null) return 'field capacity '+sw.fc+' and wilting point '+sw.wp
    + ' m3/m3 for this tehsil, from ISRIC SoilGrids texture at 15-30 and 30-60 cm ('
    + (sw.sandPct!=null?(sw.sandPct+'% sand, '+sw.clayPct+'% clay, '+sw.omPct+'% organic matter'):'')
    + ') through the Saxton & Rawls (2006) pedotransfer. Known inconsistency: the soil '
    + 'moisture is global reanalysis, which carries its own hydraulics, so pairing it with SoilGrids '
    + 'field capacity is better grounded than the single national pair it replaces but is '
    + 'not the same soil description on both sides.';
  try{ const s=(window.AGN&&AGN.soilWater&&district)?AGN.soilWater.fcwp(district):null;
       if(s) return s.basis; }catch(_){}
  return 'national constants: field capacity '+SOIL_FC+' and wilting point '+SOIL_WP
       + ' m3/m3. SoilGrids masks built-up land, so this district has no texture of its own'
       + ' and these are the same two numbers used everywhere - the stress here is the least'
       + ' local part of the drought score.';
}
try{ window.fao56Stress=fao56Stress; window.fao56Basis=fao56Basis; }catch(_){}



const DISTRICT_SPI={};




function agnGlofNational(n){
  try{
    var D=window.DISTRICT_IN||{};
    var ready=Object.keys(D).length>0;
    if(!ready) return n<90 && setTimeout(function(){ agnGlofNational(n+1); },1000);
    var key2uid={};
    try{ ((window.PK_DISTRICTS&&PK_DISTRICTS.features)||[]).forEach(function(f){
           var q=f.properties||{}; if(q.key&&q.uid) key2uid[q.key]=q.uid; }); }catch(_){}
    fetch(location.origin+'/api/glof/national',{cache:'no-store'})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        if(!j||!j.ok||!j.units){ window.__agnGlofNat={joined:0, why:(j&&j.why)||'the national GLOF class table is not available'};
          if(n<120) setTimeout(function(){ agnGlofNational(Math.max(n,90)+1); },60000); return; }
        var U={}, joined=0;
        Object.keys(D).forEach(function(k){ var uid=key2uid[k]||k, t=j.units[uid]; if(t){ U[k]=t; joined++; } });
        window.__agnGlofNat={joined:joined, units:U, builtAt:j.builtAt, ladder:j.ladder, bulletin:j.bulletin, method:j.method, touched:j.touched};
        try{ console.info('[AGN] GLOF corridor class joined to '+joined+' units ('+j.touched+' with a corridor)'); }catch(_){}
        try{ document.dispatchEvent(new CustomEvent('agn:data',{detail:{status:'updated',reason:'glof-national'}})); }catch(_){}
        try{ if(window.AGN&&AGN.map&&AGN.map.repaint) AGN.map.repaint(); }catch(_){}
      }).catch(function(){ window.__agnGlofNat={joined:0, why:'the request failed'}; if(n<120) setTimeout(function(){ agnGlofNational(Math.max(n,90)+1); },60000); });
  }catch(_){}
}
try{ agnGlofNational(0); }catch(_){}
(function agnDroughtNational(n){
  try{
    var D=window.DISTRICT_IN||{};
    var ready=Object.keys(D).some(function(k){ return D[k] && D[k].weatherLive; });
     
    if(!ready){ if(n===30 && !window.__agnDroughtNat){ window.__agnDroughtNat={joined:0, provisional:true, why:'the national weather sweep had not landed 30 s after load, so the drought table (90-day SPI/SPEI) was not joined; drought is stated as a gap'}; }
      return n<900 && setTimeout(function(){ agnDroughtNational(n+1); },1000); }    
    var key2uid={};
    try{ ((window.PK_DISTRICTS&&PK_DISTRICTS.features)||[]).forEach(function(f){
           var q=f.properties||{}; if(q.key&&q.uid) key2uid[q.key]=q.uid; }); }catch(_){}
    fetch(location.origin+'/api/climatology/drought',{cache:'no-store'})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        if(!j||!j.ready||!j.spi){
          window.__agnDroughtNat={joined:0, why:(j&&j.why)||'the national SPI/SPEI table is not available'};
          

          if(n<1020) setTimeout(function(){ agnDroughtNational(Math.max(n,900)+1); },60000);
          return;
        }
        var T=j.spi, joined=0, unmatched=0, composited=0;
        Object.keys(D).forEach(function(k){
          var uid=key2uid[k]||k, t=T[uid];
          if(!t){ unmatched++; return; }
          joined++;
          var v=function(f){ return (t[f] && t[f].value!=null) ? t[f].value : null; };
          var spi90=v('spi90'), spi30=v('spi30'), spei90=v('spei90'), spei30=v('spei30');
          var sm=v('smRoot');
          

          if(sm!=null){ try{ D[k].smRoot=sm; D[k].smRootBasis=j.method&&j.method.smRoot; }catch(_){} }
          var _dist=(typeof resolveDistrict==='function')?resolveDistrict(k):k;
          var _sw=(t.soilWater && t.soilWater.fc!=null)?t.soilWater:null;
          var fao=(typeof fao56Stress==='function' && sm!=null) ? fao56Stress(sm,'wheat',_dist,_sw) : null;
          var sS=(typeof spiToStress==='function' && spi90!=null) ? spiToStress(spi90) : null;
          var eS=(typeof spiToStress==='function' && spei90!=null) ? spiToStress(spei90) : null;
          var parts=[], acc=0, wsum=0;
          var _rew=(sm!=null && _sw && _sw.fc!=null) ? (sm-_sw.wp)/(_sw.fc-_sw.wp) : null;
          var _faoWhy = (fao!=null) ? null
            : (sm==null ? 'no root-zone soil moisture for this unit'
              : (_rew!=null && (_rew<-0.02||_rew>1.05))
                ? ('refused: the global reanalysis root-zone moisture sits at '+(_rew*100).toFixed(0)
                   +'% of extractable water against this unit\u2019s SoilGrids field capacity, '
                   +'which is outside the 0 to 100% the quantity can take. The two datasets '
                   +'describe different soils here, so the term is dropped rather than clamped '
                   +'into a confident extreme, and the composite renormalises over SPI and SPEI.')
                : 'no soil texture for this unit');
          

          var _smPct=(t.smRoot && t.smRoot.percentile!=null) ? t.smRoot.percentile : null;
          var _smStress=(_smPct==null)?null:Math.round(Math.max(0,(40-_smPct)/40*100));
          /* v91.17.283.10: the soil term is the ERA5 root zone as a percentile of its own ERA5 record (one source); the FAO-56 ratio
             (ERA5 water against SoilGrids field capacity / wilting point, two descriptions of the soil) stays as information only */
          if(_smStress!=null) parts.push(['smPct',_smStress,0.50]);
          

          var _anom = (eS!=null) ? ["spei", eS] : ((sS!=null) ? ["spi", sS] : null);
          if(_anom) parts.push([_anom[0], _anom[1], 0.50]);
          parts.forEach(function(p){ acc+=p[1]*p[2]; wsum+=p[2]; });
          

          var _share = wsum/1.0;
          var composite = (wsum>0 && _share>=0.5) ? Math.round(acc/wsum) : null;
          

          if(t.drought && t.drought.score!=null) composite=t.drought.score;
          else if(composite!=null){ var _soilS=_smStress; composite = (_anom && _soilS!=null) ? Math.min(_anom[1], _soilS) : (_anom ? Math.min(_anom[1], 47) : Math.min(composite, 29)); }
          

          var _aridWhy = (t.drought && t.drought.applicable===false && t.drought.text) || (t.spi90 && t.spi90.arid && t.spi90.why) || (t.spei90 && t.spei90.arid && t.spei90.why)
                       || (t.spi30 && t.spi30.arid && t.spi30.why) || null;
          

          var _arid = (t.drought && t.drought.applicable!=null) ? (t.drought.applicable===false) : (!!(t.spi90 && t.spi90.arid) || !!(t.spei90 && t.spei90.arid));
           
          try{ var _X=window.__agnDroughtX=window.__agnDroughtX||{};
            _X[k]={ spi3:spi90, soilPct:_smPct, vhi:(t.veg&&t.veg.vhi!=null)?t.veg.vhi:null, vegWord:(t.veg&&t.veg.word)||null, vegWeek:(t.veg&&t.veg.week)||null,
                    snowPct:(t.snow&&t.snow.sdPct!=null)?t.snow.sdPct:null, trend:(t.outlook&&t.outlook.trend)||null, outlook:t.outlook||null, arid:_arid,
                    dtype:t.dtype||null, cls:(t.drought&&t.drought.class)||null }; }catch(_){}
          

          if(_arid) composite=null;
          if(composite!=null) composited++;
          

          if(DISTRICT_SPI[k] && DISTRICT_SPI[k].composite!=null) return;
          DISTRICT_SPI[k]={
            arid:_arid, aridWhy:_arid?_aridWhy:null, droughtClass:(t.drought||null), droughtMonth:(t.month||null),    
            composite:composite, spi90:spi90, spi30:spi30, spi3:spi90!=null?spi90:spi30,
            spei90:spei90, spei30:spei30, spiStress:sS, speiStress:eS,
            faoStress:fao, soilMoist:sm, cropKey:'wheat',
            parts:parts.map(function(p){ return {k:p[0], v:p[1], w:p[2]}; }),
            

             
            provisional: !!(t.drought && t.drought.provisional), provisionalWhy: (t.drought && t.drought.provisionalWhy) || null, rainSource: t.rainSource || 'global reanalysis',
            confidence: (t.drought && t.drought.provisional) ? 'low' : (wsum>=1.0)?'high':(wsum>=0.5)?'medium':(wsum>0)?'low':null,
            confidenceBasis:'weight share '+Math.round(wsum*100)+'% of the declared composite',
            source:'national', asOf:j.asOf, basis:j.method&&j.method.spi,
            soilBasis:(typeof fao56Basis==='function')?fao56Basis(_dist,_sw):null, district:_dist, soilWater:_sw,
            faoRefusedWhy:_faoWhy, relativeExtractableWater:(_rew!=null?Math.round(_rew*1000)/1000:null),
            soilMoisturePercentile:_smPct, soilMoistureStress:_smStress,
            soilMoisturePercentileBasis:(t.smRoot&&t.smRoot.percentileBasis)||null,
            refusals:{ spi90:(t.spi90&&t.spi90.why)||null, spei90:(t.spei90&&t.spei90.why)||null,
                       smRoot:(t.smRoot&&t.smRoot.why)||null }
          };
        });
        window.__agnDroughtNat={joined:joined, unmatched:unmatched, scored:composited,
                                asOf:j.asOf, units:j.units};
        window.__agnDroughtViews=j.views||{};    
        try{ console.info('[AGN] national SPI/SPEI joined to '+joined+' units, '+composited
              +' with a composite, as of '+j.asOf); }catch(_){}
        try{ document.dispatchEvent(new CustomEvent('agn:drought-national')); }catch(_){}
        

        try{ document.dispatchEvent(new CustomEvent('agn:data',{detail:{status:'updated',reason:'drought-national'}})); }catch(_){}
        try{ if(window.AGN&&AGN.map&&AGN.map.repaint) AGN.map.repaint(); }catch(_){}
      }).catch(function(){ window.__agnDroughtNat={joined:0, why:'the request failed'}; if(n<1020) setTimeout(function(){ agnDroughtNational(Math.max(n,900)+1); },60000); });
  }catch(_){}
})(0);


function agnDroughtDistrictFromNational(districtName){
  try{
    if(!window.__agnDroughtNat || !window.__agnDroughtNat.joined) return null;
    var best=null, n=0, arid=0;
    Object.keys(DISTRICT_SPI).forEach(function(k){
      var e=DISTRICT_SPI[k]; if(!e || e.source!=='national') return;
      var d=(typeof resolveDistrict==='function')?resolveDistrict(k):k;
      if(d!==districtName) return;
      n++; if(e.arid) arid++;
      if(e.composite!=null && (!best || e.composite>best.composite)) best=e;
    });
    if(!n) return null;
    if(!best) return { composite:null, arid:arid===n, aridWhy:(arid===n)?'every tehsil of this district is arid-refused':null,
                       source:'national-district', tehsils:n, district:districtName };
    var out={}; for(var f in best) out[f]=best[f];
    out.source='national-district'; out.tehsils=n; out.district=districtName;
    out.districtBasis='worst composite among '+n+' joined tehsil(s) of '+districtName+' (national global reanalysis table)';
    return out;
  }catch(_){ return null; }
}
async function loadDistrictSPI(districtName, lat, lon, cropKey){
  if(DISTRICT_SPI[districtName]) return DISTRICT_SPI[districtName];
  { const natl=agnDroughtDistrictFromNational(districtName); if(natl){ DISTRICT_SPI[districtName]=natl; return natl; } }
  

    

  const ref={ composite:null, confidence:'refused', refused:true, source:'none', district:districtName,
           compositeWhy:'the national drought table on this server holds no row for this district yet, so no drought level is given' };
  DISTRICT_SPI[districtName]=ref;
  if(!window.__agnSpiRefuseHook){ window.__agnSpiRefuseHook=true;
    try{ document.addEventListener('agn:drought-national', function(){ try{ for(var k in DISTRICT_SPI){ if(DISTRICT_SPI[k]&&DISTRICT_SPI[k].refused) delete DISTRICT_SPI[k]; } }catch(_){} }); }catch(_){} }
  return ref;
}









const MM_MODELS = [
  {key:"ecmwf_ifs025",   name:"global forecast model",      org:"international forecast centre",          color:"#0C3851", ml:false, bias:0.0,  resKm:25, resNote:"IFS 0.25\u00b0 open data"},
  {key:"ecmwf_aifs025_single",  name:"AI weather model",     org:"international forecast centre · ML",     color:"#14B8A6", ml:true,  bias:-0.3, resKm:25, resNote:"AIFS 0.25\u00b0"}, 
  {key:"gfs_seamless",   name:"GFS",            org:"international climate centre",           color:"#F08A24", ml:false, bias:0.6,  resKm:13, resNote:"GFS 0.11\u00b0 seamless over PK"},
  {key:"ncep_aigfs025",  name:"AIGFS",          org:"international climate centre · ML",      color:"#8B7AA8", ml:true,  bias:0.2,  resKm:25, resNote:"AIGFS 0.25\u00b0"}, 
  {key:"icon_seamless",  name:"ICON",           org:"international forecast centre",            color:"#059669", ml:false, bias:-0.5, resKm:11, resNote:"ICON global 11 km; no PK nest"},
  {key:"meteofrance_seamless",name:"ARPEGE",org:"international forecast centre", color:"#C97B63", ml:false, bias:0.4,  resKm:25, resNote:"ARPEGE global; AROME does not cover PK, so the seamless feed is ARPEGE here"},
  {key:"ukmo_seamless",  name:"UKMO",           org:"UK forecast centre",  color:"#3A4B5F", ml:false, bias:-0.2, resKm:10, resNote:"UM global 10 km"},
  {key:"jma_seamless",   name:"JMA",            org:"Japan Met",      org2:"",         color:"#7FB069", ml:false, bias:0.8,  resKm:55, resNote:"GSM 0.5\u00b0 global \u2014 the COARSEST contributor; MSM does not cover PK"},
  {key:"gem_seamless",   name:"GEM",            org:"ECCC Canada",    color:"#2c7fb8", ml:false, bias:-0.6, resKm:15, resNote:"GEM global 15 km"},
  {key:"knmi_seamless",  name:"HARMONIE",       org:"international forecast centre · not pooled", color:"#E6B655", ml:false, bias:0.3,  resKm:25, resNote:"HARMONIE domain excludes PK; falls back to the driving global model — shown, not in the multi-model median (v91.17.61)"},
  

  {key:"google_weathernext2_ensemble", name:"AI weather model", org:"AI model developer AI weather model developer · ML",
   color:"#6C8EBF", ml:true, bias:0.0, provider:"ensemble", resKm:25,
   resNote:"AI weather model at 0.25\u00b0",
   note:"control run of the ensemble system; not served on the deterministic endpoint"}
];
window.MM_MODELS = MM_MODELS;



window.AGN = window.AGN || {};









AGN.timeContext = (function(G){
  'use strict';

  var HORIZONS = {
    now:        { id:'now',        label:'Current state',        product:'analysis and latest model state',
                  available:true,  sourceClass:'analysis', status:'operational' },
    nowcast:    { id:'nowcast',    label:'0-6 h nowcast',        product:'observation-led nowcast: radar, satellite, lightning, stations, blended with very-short-range NWP',
                  available:false, status:'unavailable', why:'this build has no observational nowcast. The 15-minute feed is hourly model output redistributed, and is labelled as such.' },
    short:      { id:'short',      label:'6-72 h',               product:'short-range deterministic and ensemble forecast, hazard engine re-run at each valid hour',
                  available:true,  sourceClass:'forecast', status:'operational' },
    medium:     { id:'medium',     label:'Day 3-15',             product:'medium-range ensemble, uncertainty growing with lead',
                  available:false, status:'experimental',
                  why:'the global ensemble that covers these leads is already fetched by this '
                     +'build (15 days, 51 members). No validated Day 3-15 product is built on '
                     +'it yet and no Pakistan verification stands behind it, so it is evidence '
                     +'rather than an operational horizon.' },
    subseasonal:{ id:'subseasonal',label:'Week 2-6',             product:'extended-range probabilities and weekly anomalies, never a daily value',
                  available:false, status:'experimental',
                  why:'weeks-ahead ensemble covers weeks 2-6 with 51 members and is served by the same '
                     +'seasonal endpoint this build already calls - one models= parameter away. '
                     +'No product is built on it and the provider states these fields are not '
                     +'bias-corrected, so it is area-scale outlook evidence, not an operational '
                     +'horizon.' },
    seasonal:   { id:'seasonal',   label:'1-7 months',           product:'seasonal ensemble expressed against its own hindcast climatology, with regional skill',
                  available:true,  sourceClass:'forecast', status:'experimental',
                  caveat:'experimental: no Pakistan hindcast calibration, so no Brier, ROC or reliability behind these probabilities.' },
    y2030:      { id:'y2030',      label:'2030s',                product:'bias-adjusted multi-scenario climate projection over a standard window',
                  available:false, status:'experimental', why:'the CMIP6 source here is seven HighResMIP models on one high-emission trajectory, downscaled and linearly bias-corrected to land reanalysis by the provider. It is a direction screen, not an asset planning projection.',
                  sourceClass:'projection' },
    y2050:      { id:'y2050',      label:'2050s',                product:'bias-adjusted multi-scenario climate projection over a standard window',
                  available:false, status:'experimental',
                  why:'seven-model HighResMIP deltas are held as a direction screen only; this '
                     +'build has no validated bias-adjusted multi-scenario projection to plan '
                     +'an asset against.', sourceClass:'projection' },
    y2080:      { id:'y2080',      label:'2080s',                product:'bias-adjusted multi-scenario climate projection over a standard window',
                  available:false, status:'unavailable', why:'the bundled HighResMIP data end at 2050. This horizon has no data at all in this build.',
                  sourceClass:'projection' }
  };

  var current = 'now';
  var listeners = [];

  function get(){ return HORIZONS[current]; }
  function id(){ return current; }
  function productFor(h){ return HORIZONS[h||current] || null; }
  function isAvailable(h){ var x=HORIZONS[h||current]; return !!x && x.available===true; }

  function set(h){
    if (!HORIZONS[h]) return { ok:false, why:'"'+h+'" is not a declared horizon' };
    current = h;
    var ctx = HORIZONS[h];
    listeners.forEach(function(fn){ try{ fn(ctx); }catch(_){} });
    try{ G.document.dispatchEvent(new CustomEvent('agn:horizon', { detail:ctx })); }catch(_){}
    return { ok:true, horizon:ctx };
  }

  function onChange(fn){ if (typeof fn==='function') listeners.push(fn); }

  

  

  

  var STRIP_ALIAS={ '6':'short', '24':'short', '72':'short', 'now':'now',
                    'nowcast':'nowcast', 'seasonal':'seasonal',
                    'subseasonal':'subseasonal', '2030':'y2030', '2050':'y2050',
                    '2080':'y2080' };
  function markHorizonControls(){
    try{
      var els=document.querySelectorAll('[data-horizon]');
      for(var i=0;i<els.length;i++){
        var el=els[i], raw=el.getAttribute('data-horizon');
        var id=STRIP_ALIAS[raw]||raw;
        if(!HORIZONS[id]) continue;
        var st=statusOf(id);
        el.setAttribute('data-agn-horizon-id', id);
        el.setAttribute('data-agn-horizon-status', st);
        if(st==='operational'){
          el.removeAttribute('data-agn-experimental');
          if(el.getAttribute('data-agn-horizon-note')){ el.removeAttribute('title');
            el.removeAttribute('data-agn-horizon-note'); }
          continue;
        }
        var note=unavailableNotice(id);
        el.setAttribute('data-agn-experimental', st);
        el.setAttribute('data-agn-horizon-note','1');
        if(note) el.setAttribute('title', note);
        

        if(!el.querySelector('.agn-hz-mark')){
          var m=document.createElement('sup');
          m.className='agn-hz-mark';
          m.textContent = (st==='experimental') ? ' exp' : ' n/a';
          m.setAttribute('aria-hidden','true');
          m.style.cssText='font-size:0.75rem;font-weight:800;opacity:.9;margin-left:3px';
          el.appendChild(m);
        }
      }
    }catch(_){}
  }
  try{
    if(document.readyState==='loading')
      document.addEventListener('DOMContentLoaded', markHorizonControls);
    else markHorizonControls();
     
    document.addEventListener('agn:time-selection', markHorizonControls);
    document.addEventListener('agn:project', markHorizonControls);
    setTimeout(markHorizonControls, 1200);
  }catch(_){}
  function unavailableNotice(h){
    var id = h||current;
    var x = HORIZONS[id];
    if (!x) return 'horizon not recognised';
    if (statusOf(id)==='operational') return null;
    if (!x.available) {
      return x.label + ' is not available in this build — ' + (x.why||'no product exists for it')
           + ' Current-state values are NOT shown under this label.';
    }
     
    return x.label + ' is EXPERIMENTAL in this build — '
         + (x.caveat || x.why || 'it has no validation behind it for an operational decision')
         + ' It is real evidence and it may not carry an operational decision on its own, so a '
         + 'client document cannot be issued under this horizon.';
  }

  

  function statusOf(h){
    var x = HORIZONS[h||current];
    if (!x) return 'unavailable';
    return x.status || (x.available === true ? 'operational' : 'unavailable');
  }
  function isOperational(h){ return statusOf(h) === 'operational'; }
  return { HORIZONS:HORIZONS, get:get, id:id, set:set, onChange:onChange,
           productFor:productFor, isAvailable:isAvailable,
           statusOf:statusOf, isOperational:isOperational,
           STATUSES:['operational','experimental','unavailable','not_applicable'],
           unavailableNotice:unavailableNotice,
           all:Object.keys(HORIZONS) };
})(window);

AGN.sourceClass = (function(){
  'use strict';
  var C = {
    OBSERVED:   { id:'observed',   label:'Observed',
                  what:'a physical measurement at a real instrument at a real time' },
    SATELLITE:  { id:'satellite',  label:'Satellite retrieval',
                  what:'a geophysical quantity inferred from radiance by a retrieval algorithm — '
                      +'a measurement of the sensor, a model of the quantity' },
    ANALYSIS:   { id:'analysis',   label:'Analysis',
                  what:'a model state constrained by observations at initialisation time' },
    REANALYSIS: { id:'reanalysis', label:'Reanalysis',
                  what:'a retrospective analysis over a fixed model version. Not an observation, '
                      +'and its own errors are correlated with the models verified against it' },
    FORECAST:   { id:'forecast',   label:'Forecast',
                  what:'a model state at a future valid time' },
    PROJECTION: { id:'projection', label:'Projection',
                  what:'a climate-model response to a scenario. Not a forecast — it carries no '
                      +'skill at a particular date' },
    STATIC:     { id:'static',     label:'Static dataset',
                  what:'a value that does not change between releases: terrain, an inventory, a '
                      +'zone table, an expert register' },
    DERIVED:    { id:'derived',    label:'Derived',
                  what:'computed from other values in this build. It inherits every limitation '
                      +'of its inputs' }
  };
  var BY = {}; Object.keys(C).forEach(function(k){ BY[C[k].id]=C[k]; });
  function get(id){ return BY[String(id||'').toLowerCase()] || null; }
  function isValid(id){ return !!get(id); }
  

  function isModelled(id){ var c=get(id); return !!c && c.id!=='observed'; }
  function describe(id){ var c=get(id); return c ? (c.label+' — '+c.what) : 'source class not declared'; }
  return Object.freeze({ CLASSES:C, get:get, isValid:isValid, isModelled:isModelled,
                         describe:describe, all:Object.keys(BY) });
})();



AGN.measurement = (function(G){
  'use strict';

  var TEMPORAL = ['instantaneous','hourly mean','hourly accumulation','daily mean',
                  'daily maximum','daily minimum','daily accumulation','monthly mean',
                  'monthly accumulation','climatological normal','static'];
  var SPATIAL  = ['point','model grid cell','satellite pixel','tehsil','district',
                  'catchment','river reach','coastal segment','asset','national'];

  

  var REQUIRED = ['measurand','unit','sourceClass','temporalSupport','spatialSupport'];

  function make(o){
    o = o || {};
    return {
       
      measurand: o.measurand || null,
      unit: o.unit || null,
      value: (o.value===undefined ? null : o.value),

       
      source: o.source || null,
      sourceClass: o.sourceClass || null,
      sourceClassNote: (G.AGN && G.AGN.sourceClass) ? G.AGN.sourceClass.describe(o.sourceClass) : null,

       
      measurementTime: o.measurementTime || null,
      issueTime: o.issueTime || null,
      validTime: o.validTime || null,
      temporalSupport: o.temporalSupport || null,
      nativeTemporalResolution: o.nativeTemporalResolution || null,
      returnedTemporalResolution: o.returnedTemporalResolution || null,

       
      spatialSupport: o.spatialSupport || null,
      nativeSpatialResolution: o.nativeSpatialResolution || null,
      location: o.location || null,
      crs: o.crs || 'EPSG:4326',

       
      transformation: o.transformation || null,
      biasCorrection: o.biasCorrection || null,
      algorithmVersion: o.algorithmVersion || null,
      dataVersion: o.dataVersion || null,

       
      calibrationStatus: o.calibrationStatus || null,
      uncertainty: (o.uncertainty===undefined ? null : o.uncertainty),
      missingState: o.missingState || (o.value==null ? 'absent' : 'present'),
      evidenceClass: o.evidenceClass || null,
      fitnessForUse: o.fitnessForUse || null
    };
  }

  function validate(m){
    if (!m) return { valid:false, missing:REQUIRED.slice(), why:'no measurement object' };
    var missing = REQUIRED.filter(function(f){ return m[f]==null || m[f]===''; });
    var bad = [];
    if (m.temporalSupport && TEMPORAL.indexOf(m.temporalSupport)<0) bad.push('temporalSupport');
    if (m.spatialSupport && SPATIAL.indexOf(m.spatialSupport)<0) bad.push('spatialSupport');
    if (m.sourceClass && G.AGN && G.AGN.sourceClass && !G.AGN.sourceClass.isValid(m.sourceClass))
      bad.push('sourceClass');
    return { valid: !missing.length && !bad.length, missing:missing, invalid:bad,
             why: missing.length ? ('not self-describing: '+missing.join(', ')+' absent')
                : bad.length ? ('outside the declared vocabulary: '+bad.join(', ')) : null };
  }

  

  function label(m){
    if (!m) return '';
    var bits = [];
    if (m.sourceClass && G.AGN && G.AGN.sourceClass) {
      var c = G.AGN.sourceClass.get(m.sourceClass); if (c) bits.push(c.label);
    }
    if (m.temporalSupport) bits.push(m.temporalSupport);
    if (m.spatialSupport) bits.push(m.spatialSupport);
    if (m.nativeSpatialResolution) bits.push(m.nativeSpatialResolution);
    return bits.join(' · ');
  }

  return { make:make, validate:validate, label:label,
           TEMPORAL_SUPPORT:TEMPORAL, SPATIAL_SUPPORT:SPATIAL, REQUIRED:REQUIRED };
})(window);

AGN.geo = (function(G){
  'use strict';

  

  var ALIAS = {
    'karachi'      : ['South Karachi','East Karachi','West Karachi','Central Karachi',
                      'Korangi','Malir','Keamari'],
    'batagram'     : ['Battagram'],
    'battagram'    : ['Battagram'],
    'tor ghar'     : ['Torghar'],
    'torghar'      : ['Torghar'],
    'kohistan'     : ['Lower Kohistan','Upper Kohistan','Kolai Palas'],
    'islamabad'    : ['Islamabad'],
    'rawalpindi'   : ['Rawalpindi'],
    'lahore'       : ['Lahore'],
    'gilgit'       : ['Gilgit'],
    'muzaffarabad' : ['Muzaffarabad']
  };

  function norm(x){ return String(x==null?'':x).trim().toLowerCase().replace(/\s+/g,' '); }

  

  var POINT_CAP_KM = 150;
  function _km(aLat,aLon,bLat,bLon){
    var R=6371, t=Math.PI/180;
    var dLa=(bLat-aLat)*t, dLo=(bLon-aLon)*t;
    var h=Math.sin(dLa/2)*Math.sin(dLa/2)
        + Math.cos(aLat*t)*Math.cos(bLat*t)*Math.sin(dLo/2)*Math.sin(dLo/2);
    return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function nearestUnit(lat, lon, districts){
    var rows=null;
    try{ rows = G.PK_DISTRICT_CENTROIDS || []; }catch(_){ return null; }
    if(!rows.length || lat==null || lon==null) return null;
    var want = districts && districts.length
             ? districts.reduce(function(o,d){ o[norm(d)]=1; return o; }, Object.create(null))
             : null;
    var best=null, bestKm=Infinity;
    for(var i=0;i<rows.length;i++){
      var r=rows[i];
      if(!r || r.lat==null || r.lon==null) continue;
      if(want && !want[norm(r.district)]) continue;
      var d=_km(Number(lat),Number(lon),Number(r.lat),Number(r.lon));
      if(d<bestKm){ bestKm=d; best=r; }
    }
    if(!best) return null;
    

    if(!want && bestKm > POINT_CAP_KM) return null;
    return { key:best.key, tehsil:best.tehsil, district:best.district,
             km:Math.round(bestKm*10)/10,
             method:'nearest tehsil centroid',
             precision:'centroid, not a polygon test - near a boundary this can '
                      +'name the adjoining tehsil' };
  }
   
  try{ if(typeof G.unitAt !== 'function'){
         G.unitAt = function(lat,lon){ var r=nearestUnit(lat,lon,null); return r?r.key:null; }; } }catch(_){}


  function unitTable(){
    try { return G.DISTRICT_IN || {}; } catch(_) { return {}; }
  }

  function resolve(name, opts){
    opts = opts || {};
    var tried = [];
    var out = function(step, key, note){
      return { resolved:(key!=null), key:key, step:step, note:note||null,
               tried:tried.slice(), queried:name,
               

               absentDataClaimPermitted:false };
    };
    if (name == null || name === '') { tried.push('empty'); return out('none', null, 'no name supplied'); }

    var T = unitTable(), n = norm(name);

    tried.push('canonical key');
    if (Object.prototype.hasOwnProperty.call(T, name)) return out('canonical key', name);

    tried.push('exact name');
    var keys = Object.keys(T);
    for (var i=0;i<keys.length;i++) if (norm(keys[i])===n) return out('exact name', keys[i]);

    

    var DISTRICTS = (function(){
      try{
        var out = Object.create(null);
        (G.PK_DISTRICT_CENTROIDS||[]).forEach(function(x){ if(x && x.district) out[x.district]=1; });
        return out;
      }catch(_){ return Object.create(null); }
    })();
    var known = function(a){ return Object.prototype.hasOwnProperty.call(T,a)
                                 || Object.prototype.hasOwnProperty.call(DISTRICTS,a); };

    tried.push('district name');
    for (var di in DISTRICTS) if (norm(di)===n) return out('district name', di);

    tried.push('alias');
    var al = ALIAS[n];
    if (al && al.length) {
      var hits = al.filter(known);
      if (hits.length === 1) return out('alias', hits[0], 'alias of "'+name+'"');
      if (hits.length > 1) {
        

        if (opts.lat!=null && opts.lon!=null) {
          try{
            var _pt = nearestUnit(opts.lat, opts.lon, hits);
            if (_pt) {
              tried.push('alias disambiguated by coordinates');
              var _r = out('alias+centroid', _pt.key,
                         '"'+name+'" names '+hits.length+' units in this build, so the name '
                        +'alone could not choose one. The coordinates supplied are '+_pt.km
                        +' km from the centroid of '+_pt.key+' ('+_pt.district+'), which is '
                        +'the nearest within those candidates. This is a centroid assignment, '
                        +'not a polygon test.');
              _r.method=_pt.method; _r.precision=_pt.precision;
              _r.km=_pt.km; _r.district=_pt.district; _r.candidates=hits;
              return _r;
            }
          }catch(_){}
        }
        return { resolved:false, key:null, step:'alias', ambiguous:true, candidates:hits,
                 tried:tried.slice(), queried:name, absentDataClaimPermitted:false,
                 note:'"'+name+'" names '+hits.length+' units in this build. A unit must be '
                     +'chosen; averaging them would report a place that does not exist. '
                     +'Supplying coordinates resolves it, because a point lies in one unit.' };
      }
    }

    tried.push('parent district');
    try{
      if (typeof G.resolveDistrict === 'function') {
        var d = G.resolveDistrict(name);
        if (d && d !== name && Object.prototype.hasOwnProperty.call(T,d))
          return out('parent district', d, 'resolved up from a tehsil');
      }
    }catch(_){}

    tried.push('coordinates');
    if (opts.lat!=null && opts.lon!=null) {
      try{
        var u = nearestUnit(opts.lat, opts.lon, null);
        if (u) {
          var _ru = out('coordinates', u.key,
                        'the name did not resolve, so the point did: '+u.km+' km from the '
                       +'centroid of '+u.key+'. This is a centroid assignment, not a polygon '
                       +'test, and it is capped at '+POINT_CAP_KM+' km so a point outside the '
                       +'country resolves to nothing rather than to the least distant tehsil.');
          _ru.method=u.method; _ru.precision=u.precision; _ru.km=u.km;
          return _ru;
        }
      }catch(_){}
    }

    return { resolved:false, key:null, step:'unresolved', tried:tried.slice(), queried:name,
             absentDataClaimPermitted:false,
             note:'"'+name+'" did not resolve to a unit in this build. This is a failed lookup, '
                 +'NOT a statement that data are missing for the place — the two must never be '
                 +'rendered the same way.' };
  }

   
  function unresolvedLabel(res){
    if (!res) return 'unit not resolved';
    if (res.ambiguous) return 'name matches ' + res.candidates.length + ' units — choose one';
    return 'unit not resolved (' + (res.queried||'') + ')';
  }

  return { resolve:resolve, unresolvedLabel:unresolvedLabel, aliases:ALIAS, normalise:norm };
})(window);

AGN.hazards = (function(G){
  'use strict';
  var CANON = 'hzScore';

  function evaluate(unit, inp, hazard, leadH, unitKeyIn){
    var lead = (leadH==null) ? 24 : leadH;
    if (typeof G.hzScore !== 'function') {
      return { available:false, why:'the canonical hazard engine is not loaded' };
    }
    var r;
    try { r = G.hzScore(unit, inp, hazard, lead, unitKeyIn || unit); }
    catch (e) { return { available:false, why:'engine threw: ' + String(e && e.message).slice(0,140) }; }
    if (!r) return { available:false, why:'the engine returned nothing for ' + hazard };

    return {
      available: true,
      engine: CANON,
      engineVersion: (G.AGN_VERSION || null),
      hazard: hazard, unit: unit, leadHours: lead,

       
      physical: { measurand:r.physicalMeasurand||null, unit:r.physicalUnit||null,
                  value:(r.physicalValue==null?null:r.physicalValue), why:r.physicalWhy||null },

       
      screening: { index:(r.screeningIndex==null?null:r.screeningIndex),
                   band:r.screeningBand||null,
                   

                   verdictClass:(function(){ try{ return (r.screeningIndex!=null && G.AGN && G.AGN.hazardValue && G.AGN.hazardValue.verdictOf) ? G.AGN.hazardValue.verdictOf(r.screeningIndex, hazard) : null; }catch(_){ return null; } })(),
                   classLadder:'Act 82 / Watch 48 / Monitor 30 (operational); the band is the 5-step display ladder 82/65/45/25',
                   scaleType:r.scaleType||null, scaleWhy:r.scaleWhy||null },

       
      categorical: r.categorical===true,
      category: r.category||null, zone: r.zone||null, categoryLabel: r.categoryLabel||null,

       
      evidenceClass: r.evidenceClass||null, evidenceClassWhy: r.evidenceClassWhy||null,
      provenance: r.provenance||null,
      unavailable: (r.score==null),
      unavailableWhy: r.noDataWhy || r.unavailable || null,
      provisional: r.provisional===true,

       
      drivers: r.drivers||null, metricLabels: r.metricLabels||null,
      notes: r.notes||null, top: r.top||null, kind: r.kind||null,

       
      raw: r
    };
  }

  

  function parity(station, hazard, leadH){
    try{
      if (typeof G.aiRiskFor !== 'function') return { checked:false, why:'no second scorer (the old station-risk formula was deleted in v283.36)' };
      var a = evaluate(station && station.name, station, hazard, leadH||24);
      var b = G.aiRiskFor(station, hazard, leadH||24);
      var av = a && a.screening ? a.screening.index : null;
      var bv = b ? b.score : null;
      return { checked:true, hazard:hazard, canonical:av, secondary:bv,
               agree: (av===bv),
               delta: (av==null||bv==null) ? null : Math.round((bv-av)*10)/10 };
    }catch(e){ return { checked:false, why:String(e && e.message).slice(0,120) }; }
  }


  

  

  var HZ_CLASSES = ['scored', 'categorical', 'unavailable'];
  function hzClassify(h){
    if(!h || typeof h !== 'object') return 'unavailable';
    if(h.categorical === true) return 'categorical';
    if(h.unavailable === true) return 'unavailable';
    var v = (h.screeningIndex !== undefined && h.screeningIndex !== null)
              ? h.screeningIndex : h.score;
    if(v === null || v === undefined) return 'unavailable';
    v = Number(v);
    return isFinite(v) ? 'scored' : 'unavailable';
  }
  

  function hzPartition(list){
    var out = { scored:[], categorical:[], unavailable:[] };
    (Array.isArray(list) ? list : []).forEach(function(h){
      out[hzClassify(h)].push(h);
    });
    return out;
  }

  return { evaluate:evaluate, parity:parity, canonicalEngine:CANON,
           CLASSES:HZ_CLASSES.slice(),
           classify:hzClassify, partition:hzPartition,
           band:function(sc){ return (typeof G.agnBandOf==='function')?G.agnBandOf(sc):null; },
           ladder:function(){ return (typeof G.agnBandLadder==='function')?G.agnBandLadder():[]; },
           bandCuts:function(){ return (typeof G.AGN_BAND_CUTS!=='undefined')
                                        ? G.AGN_BAND_CUTS.slice() : []; } };
})(window);



const AGN_DISPUTED_KEY = 'Indian Illegally Occupied';





var AGN_BASELINE_POLICY = window.AGN_BASELINE_POLICY = Object.freeze({
  observational: Object.freeze({ period:'1991-2020', source:'global reanalysis (0.25°); land reanalysis is not used in this build',
    usedBy:Object.freeze(['seasonal departures (SEAS5)','climatology normals',
                          'rainfall percentile','SPI gamma fit']),
    basis:'the current WMO standard normal' }),
  projection: Object.freeze({ period:'1991-2010', source:'CMIP6 HighResMIP',
    usedBy:Object.freeze(['2030s and 2050s temperature and precipitation deltas']),
    basis:'the fixed reference the deltas are computed against; all seven models cover it, and '
         +'the HighResMIP historical runs do not extend to 2020' }),
  rule:'Every anomaly, departure or delta this build prints states the period it was taken '
      +'against. A figure from the observational baseline and a figure from the projection '
      +'baseline are never differenced, summed or shown as one series.',
  calibrationStatus:'declared'
});

var AGN_FLOOD_POLICY = window.AGN_FLOOD_POLICY = Object.freeze({
  operationalDays: 30,
  providerDefaultDays: 92,
  providerMaxDays: 210,
  daily: Object.freeze(['river_discharge','river_discharge_median',
                        'river_discharge_p25','river_discharge_p75']),
  basis: 'The river-flow model (global river-flow model v4) serves 92 days by default and 210 at most, with the ensemble '
       + 'percentiles available across the whole range. 30 days is the OPERATIONAL river window '
       + 'this build supports: beyond it the product would be a seasonal water outlook, which '
       + 'needs its own language, its own skill statement and its own surface, and relabelling '
       + 'this request does not create it.',
  percentileRule: 'every FORECAST flood request carries the ensemble percentiles. A discharge '
       + 'without its spread is a point estimate rendered as a fact, and two of the three '
       + 'forecast call sites in v91.13 asked for exactly that. The one declared exception is '
       + 'the gauge batch, which compares a live discharge against a baked 29-year reanalysis '
       + 'reference and is answering a different question.',
  exceptions: Object.freeze([
    { site:'gauge batch (live discharge vs baked reanalysis reference)',
      omits:'ensemble percentiles',
      why:'it reports an observed-equivalent level against a fixed historical reference, not a '
         +'forecast distribution' }]),
  resolutionCaveat: 'global river-flow model is a 0.05 degree (~5 km) grid. It resolves the Indus main stem and '
       + 'the major tributaries; it does not resolve hill torrents, urban nullahs or Balochistan '
       + 'ephemeral channels, and the provider states the closest river may not be selected '
       + 'correctly for a given point.',
  calibrationStatus: 'measured'
});
try{ AGN.floodPolicy = AGN_FLOOD_POLICY; }catch(_){}

AGN.windContract = Object.freeze({
  contractVersion: 'wind-1.1',
  canonicalSource: 'NIGRAAN HTML FORMULA_REGISTRY.wind',
  measurand: 'damaging gust at 10 m',
  unit: 'km/h',
  onsetKmh: 40,
  slopePerKmh: 1.3636,    
  ladder: Object.freeze([[40,0],[62,30],[89,55],[118,78],[160,92],[220,100]]),
  formula: 'score = clamp(interpolate(ladder, gust), 0, 100) * terrainRuggednessFactor',
  gustProxy: 'where the provider returns no gust, sustained wind stands in through a declared '
           + 'gust factor and the result is flagged as a proxy. A gust is never derived from an '
           + 'ESTIMATED wind.',
  supersedes: 'wind-1.0, the linear (gust-40)*1.25 curve, which reached 100 at 120 km/h and '
            + 'returned the same 100 for a 118 km/h gust and a 220 km/h gust; and '
            + 'before it the legacy 18 km/h onset with a x3.0 slope, which mapped a 40 km/h gust '
            + 'to about 92/100',
  

  fixture: Object.freeze([
    { gustKmh: 20, score: 0 }, { gustKmh: 40, score: 0 }, { gustKmh: 62, score: 30.0 }, { gustKmh: 89, score: 55.0 }, { gustKmh: 118, score: 78.0 }, { gustKmh: 160, score: 92.0 }, { gustKmh: 200, score: 97.3333 }, { gustKmh: 220, score: 100.0 }, { gustKmh: 260, score: 100 }
  ]),
  parityStatus: 'NOT VERIFIED across implementations. methods.py and hazardEngine.js are '
              + 'outside this artefact and still carry the legacy curve. This is a backend '
              + 'acceptance gate, not a client-side claim.'
});



window.agnScoreOutOf100 = function (v) {
  return (v != null && isFinite(v)) ? (Math.round(v) + '/100')
       : ((typeof NODATA_GLYPH !== 'undefined' ? NODATA_GLYPH : '\u2014') + ' (not scored)');
};

 
window.mmEffectiveResolutionKm = function (keys) {
  var set = (keys && keys.length) ? MM_MODELS.filter(function (m) { return keys.indexOf(m.key) >= 0; }) : MM_MODELS;
  var known = set.filter(function (m) { return m.resKm != null; });
  if (!known.length) return null;
  return { coarsestKm: Math.max.apply(null, known.map(function (m) { return m.resKm; })),
           finestKm:   Math.min.apply(null, known.map(function (m) { return m.resKm; })),
           coarsestModel: known.slice().sort(function (a, b) { return b.resKm - a.resKm; })[0].name,
           n: known.length, undeclared: set.length - known.length };
};
const MM_VARMAP = {
  temp:   {api:"temperature_2m",      label:"temperature",  unit:"°C", title:"Temperature"},
  feels:  {api:"apparent_temperature",label:"feels-like",   unit:"°C", title:"Feels-like"},
  wind:   {api:"wind_speed_10m",      label:"wind speed",   unit:"km/h",title:"Wind speed"},
  precip: {api:"precipitation",       label:"precipitation",unit:"mm", title:"Precipitation"}
};
const mmState = { variable:"temp", lead:48, off:new Set(), station:null, series:null, source:"mock" };
window.mmState = mmState;



async function mmFetchLive(s, varKey, hours){
  

  var _derivedFeels = (varKey==='feels');
  const v = _derivedFeels
    ? 'temperature_2m,relative_humidity_2m,wind_speed_10m'
    : MM_VARMAP[varKey].api;
  
  

  const models=MM_MODELS.filter(m=>!m.provider).map(m=>m.key).join(",");
  
  
  

  /* v91.17.283.19 · the models side by side are a provider product the server holds: the place's default (temperature, 72 h) is its bundle's
     models part (GET /api/point, read once); another variable or a longer lead is asked once of the product route */
  const PS=await agnPS(); if(!PS) throw new Error('the page store is not loaded');
  const _deflt=(varKey==='temp'&&hours<=72);
  let j=null;
  if(_deflt){ const mv=await PS.part('models',s.lat,s.lon); if(!mv||!mv.ok) throw new Error('the models side by side are not available for this place'); j=mv.body; }
  else { const q={latitude:s.lat, longitude:s.lon, hourly:v, models:models, forecast_hours:Math.min(96,hours+24), timezone:'auto'}; if(Number.isFinite(Number(s&&s.elev))) q.elevation=String(Math.round(Number(s.elev)));
    const r=await PS.product('models',q); if(!r.ok) throw new Error("ompm "+r.status); j=await r.json(); }
  const series={};
  
  
  
  const times=(j.hourly&&j.hourly.time)||null;
  let startIdx=0;
  if(times&&times.length){
    const nowMs=Date.now();
    let best=0,bestDiff=Infinity;
    for(let i=0;i<times.length;i++){
      const tms=new Date(times[i]).getTime();
      const diff=Math.abs(tms-nowMs);
      if(tms<=nowMs+1800000 && diff<bestDiff){ bestDiff=diff; best=i; }  
    }
    startIdx=best;
  }
  

  try{
    if(times&&times.length) mmState.seriesTimes=times.slice(startIdx,startIdx+hours);
    else mmState.seriesTimes=null;
  }catch(_){}
  MM_MODELS.forEach(m=>{
    if(m.provider) return;   
    let arr=null;
    if(_derivedFeels){
       
      const tA=(j.hourly&&j.hourly[`temperature_2m_${m.key}`])||null;
      const hA=(j.hourly&&j.hourly[`relative_humidity_2m_${m.key}`])||null;
      const wA=(j.hourly&&j.hourly[`wind_speed_10m_${m.key}`])||null;
      const fn=(typeof window.feelsLikeC==='function')?window.feelsLikeC:null;
      if(tA&&hA&&wA&&fn){
        arr=tA.map((t,ix)=>{
          const rh=hA[ix], wk=wA[ix];
          return (t==null||rh==null||wk==null)?null:fn(t,rh,wk);
        });
      }
    } else {
      const colA=`${v}_${m.key}`;
      arr=(j.hourly&&j.hourly[colA])||null;
    }   
    if(arr&&arr.some(x=>x!=null)) series[m.key]=arr.slice(startIdx,startIdx+hours).map(x=>x==null?null:Math.round(x*10)/10);
  });
  
  
  

  const wnx=MM_MODELS.find(m=>m.provider==='ensemble');
  if(wnx){
    try{
      const wv=_derivedFeels ? 'temperature_2m,relative_humidity_2m,wind_speed_10m'
                             : MM_VARMAP[varKey].api;
      const wr=_deflt?await PS.partResp('ensemble',s.lat,s.lon):await PS.product('ensemble',{latitude:s.lat, longitude:s.lon, hourly:wv, models:wnx.key, forecast_days:Math.ceil(hours/24)+1});
      if(wr.ok){
        const wjr=await wr.json(), wj=_deflt?(wjr&&wjr.body):wjr;
        const wh=(wj&&wj.hourly)||{};
        let warr=null;
        if(_derivedFeels){
          const fn=(typeof window.feelsLikeC==='function')?window.feelsLikeC:null;
          const tA=wh.temperature_2m, hA=wh.relative_humidity_2m, wA=wh.wind_speed_10m;
          if(tA&&hA&&wA&&fn) warr=tA.map((t,ix)=>{
            const rh=hA[ix], wk=wA[ix];
            return (t==null||rh==null||wk==null)?null:fn(t,rh,wk); });
        } else {
          

          warr=wh[wv]||null;
        }
        

        const wt=wh.time||null;
        let wStart=0;
        if(wt&&wt.length){
          const nowMs=Date.now(); let best=0,bestDiff=Infinity;
          for(let i=0;i<wt.length;i++){
            const tms=new Date(wt[i]).getTime(), diff=Math.abs(tms-nowMs);
            if(tms<=nowMs+1800000 && diff<bestDiff){ bestDiff=diff; best=i; }
          }
          wStart=best;
        }
        if(warr&&warr.some(x=>x!=null)){
          series[wnx.key]=warr.slice(wStart,wStart+hours)
            .map(x=>x==null?null:Math.round(x*10)/10);
        }
      }
    }catch(_){}
  }
  if(Object.keys(series).length<2) throw new Error("ompm sparse");
  return series;
}

function mmActiveKeys(){ return MM_MODELS.filter(m=>!mmState.off.has(m.key) && mmHasData(m.key)).map(m=>m.key); }
function mmHasData(k){ const a=mmState.series&&mmState.series[k]; return !!(a&&a.some(x=>x!=null)); }

function mmStats(series, hours){
  
  const keys=mmActiveKeys().filter(k=>series[k]);
  const mean=[],lo=[],hi=[];
  for(let h=0;h<hours;h++){
    const vals=keys.map(k=>series[k][h]).filter(x=>x!=null);
    if(!vals.length){ mean.push(null);lo.push(null);hi.push(null); continue; }
    const m=vals.reduce((a,b)=>a+b,0)/vals.length;
    mean.push(m); lo.push(Math.min(...vals)); hi.push(Math.max(...vals));
  }
  
  const spreads=[]; for(let h=0;h<hours;h++){ if(hi[h]!=null) spreads.push(hi[h]-lo[h]); }
  const avgSpread=spreads.length?spreads.reduce((a,b)=>a+b,0)/spreads.length:0;
  const scale = mmState.variable==="wind"?12 : mmState.variable==="precip"?6 : 9;
  const agree=clamp(Math.round(100-(avgSpread/scale)*100),0,100);
  
  const peakVals=mean.slice(0,Math.min(36,hours)).filter(x=>x!=null);
  const peak=peakVals.length?Math.max(...peakVals):null;
  return {mean,lo,hi,agree,avgSpread,peak,keys};
}

function mmRender(){
  const s=mmState.station; if(!s) return;
  const hours=mmState.lead, vm=MM_VARMAP[mmState.variable], series=mmState.series||{};
  const st=mmStats(series,hours);
  
  document.getElementById('mmCity').textContent=s.name;
  document.getElementById('mmChartTitle').textContent=`Inter-model range · ${vm.label}`;
  const dot=document.getElementById('mmDot'), stat=document.getElementById('mmStatus');
  

  var _mmHas=false;
  try{ var _ser=mmState.series||{};
       mmActiveKeys().forEach(function(k){ (_ser[k]||[]).forEach(function(v){ if(v!=null) _mmHas=true; }); });
  }catch(_){}
  if(!_mmHas && !mmState.loading){
    try{
      var _svg=document.getElementById('mmChart');
      if(_svg) _svg.innerHTML='<text x="50%" y="46%" text-anchor="middle" '
        +'style="font:600 13px Manrope;fill:#8a2626">'
        +(mmState.source==='pending' ? 'Multi-model comparison not loaded'
                                     : 'Multi-model comparison unavailable')
        +'</text><text x="50%" y="62%" text-anchor="middle" '
        +'style="font:400 11px Manrope;fill:#6b7a82">'
        +(mmState.source==='pending'
            ? 'Choose a variable or lead to fetch it.'
            : ('No model series was returned, so none is drawn. '+(mmState.unavailableWhy?('Reason: '+mmState.unavailableWhy):'')))
        +'</text><text x="50%" y="76%" text-anchor="middle" '
        +'style="font:600 11px Manrope;fill:#0C3851">'
        +(mmState.source==='pending'?'Click the panel to load it.':'Click the panel to try again.')
        +'</text>';
      try{ _svg.style.cursor='pointer';
           _svg.onclick=function(){ try{ window.__machModelsRequested=true;
             if(typeof window.mmOnCity==='function' && mmState.station) window.mmOnCity(mmState.station); }catch(_){} }; }catch(_){}
      ['mmAgree','mmPeak','mmCount'].forEach(function(id){ var e=document.getElementById(id); if(e) e.textContent='\u2014'; });
      ['mmAgreeNote','mmPeakNote'].forEach(function(id){ var e=document.getElementById(id); if(e) e.textContent=''; });
      var _bar=document.getElementById('mmAgreeBar'); if(_bar) _bar.style.width='0%';
    }catch(_){}
    if(dot) dot.classList.add('mock');
    if(stat) stat.textContent = (mmState.source==='pending')
      ? 'not loaded — no series requested yet'
      : ('unavailable — ' + (mmState.unavailableWhy || 'the model feed did not answer')
         + '. No values are shown in place of it.');
    return;
  }
  if(mmState.source==="live"){ dot.classList.remove('mock'); stat.textContent="live · multi-model"; }
  else if(mmState.source==="stale"){ dot.classList.add('mock');
    stat.textContent="stale · last successful fetch, not refreshed"; }
  else { dot.classList.add('mock'); stat.textContent="unavailable — no model series"; }
  
  const W=680,H=230, padL=34,padR=10,padT=12,padB=20;
  const innerW=W-padL-padR, innerH=H-padT-padB;
  let vMin=Infinity,vMax=-Infinity;
  mmActiveKeys().forEach(k=>{ (series[k]||[]).slice(0,hours).forEach(v=>{ if(v==null)return; if(v<vMin)vMin=v; if(v>vMax)vMax=v; }); });
  if(!isFinite(vMin)){ vMin=0; vMax=1; }
  if(mmState.variable==="precip"||mmState.variable==="wind") vMin=Math.min(vMin,0);
  const span=(vMax-vMin)||1; vMin-=span*0.08; vMax+=span*0.08;
  const X=h=>padL + (hours<=1?0:h/(hours-1))*innerW;
  const Y=v=>padT + (1-(v-vMin)/(vMax-vMin))*innerH;
  const NS="http://www.w3.org/2000/svg";
  const svg=document.getElementById('mmChart'); svg.innerHTML="";
  
  for(let i=0;i<=3;i++){ const v=vMin+(vMax-vMin)*i/3, y=Y(v);
    const ln=document.createElementNS(NS,'line'); ln.setAttribute('x1',padL);ln.setAttribute('x2',W-padR);ln.setAttribute('y1',y);ln.setAttribute('y2',y);ln.setAttribute('class','mm-axis');ln.setAttribute('opacity', i===0?'0.9':'0.4'); svg.appendChild(ln);
    const tx=document.createElementNS(NS,'text'); tx.setAttribute('x',4);tx.setAttribute('y',y+3);tx.setAttribute('class','mm-axislbl'); tx.textContent=Math.round(v); svg.appendChild(tx);
  }
  
  for(let d=0; d*24<hours; d++){ const x=X(d*24);
    const tx=document.createElementNS(NS,'text'); tx.setAttribute('x',x+2);tx.setAttribute('y',H-6);tx.setAttribute('class','mm-axislbl'); tx.textContent="D"+(d+1); svg.appendChild(tx);
  }
  
  if(st.hi.some(x=>x!=null)){
     const top=[],bot=[];
    for(let h=0;h<hours;h++){ if(st.hi[h]==null)continue; top.push(`${X(h).toFixed(1)},${Y(st.hi[h]).toFixed(1)}`); }
    for(let h=hours-1;h>=0;h--){ if(st.lo[h]==null)continue; bot.push(`${X(h).toFixed(1)},${Y(st.lo[h]).toFixed(1)}`); }
    const band=document.createElementNS(NS,'path'); band.setAttribute('d',"M"+top.join(" L")+" L"+bot.join(" L")+" Z"); band.setAttribute('class','mm-band'); svg.appendChild(band);
  }
  
  mmActiveKeys().forEach(k=>{ const m=MM_MODELS.find(x=>x.key===k); const arr=series[k]; if(!arr)return;
    let d=""; for(let h=0;h<hours;h++){ if(arr[h]==null)continue; d+=(d?" L":"M")+X(h).toFixed(1)+","+Y(arr[h]).toFixed(1); }
    const p=document.createElementNS(NS,'path'); p.setAttribute('d',d); p.setAttribute('class','mm-modelline'); p.setAttribute('stroke',m.color); svg.appendChild(p);
  });
  
  let dm=""; for(let h=0;h<hours;h++){ if(st.mean[h]==null)continue; dm+=(dm?" L":"M")+X(h).toFixed(1)+","+Y(st.mean[h]).toFixed(1); }
  const mp=document.createElementNS(NS,'path'); mp.setAttribute('d',dm); mp.setAttribute('class','mm-meanline'); svg.appendChild(mp);
  
  const hv=document.createElementNS(NS,'line'); hv.setAttribute('class','mm-hover'); hv.setAttribute('y1',padT);hv.setAttribute('y2',H-padB); svg.appendChild(hv);
  const tip=document.getElementById('mmTip'); 
  svg.onmousemove=(e)=>{ const r=svg.getBoundingClientRect(); const px=(e.clientX-r.left)/r.width*W;
    let h=Math.round((px-padL)/innerW*(hours-1)); h=clamp(h,0,hours-1);
    hv.setAttribute('x1',X(h));hv.setAttribute('x2',X(h));hv.style.opacity=.8;
    if(st.mean[h]!=null){ tip.style.opacity=1;
      tip.innerHTML=`<b>+${h}h</b> · mean <b>${st.mean[h].toFixed(1)}${vm.unit}</b><br>spread ${st.lo[h].toFixed(1)}–${st.hi[h].toFixed(1)}`;
      const lx=clamp(X(h)/W*r.width+8,8,r.width-120); tip.style.left=lx+"px"; tip.style.top="14px";
    }
  };
  svg.onmouseleave=()=>{ hv.style.opacity=0; tip.style.opacity=0; };
  
  const leg=document.getElementById('mmLegend'); leg.innerHTML="";
  const mean=document.createElement('span'); mean.className='mm-legitem'; mean.innerHTML=`<span class="mm-swatch" style="background:var(--navy);height:3px"></span>Multi-model mean`; leg.appendChild(mean);
  const band=document.createElement('span'); band.className='mm-legitem'; band.innerHTML=`<span class="mm-swatch" style="background:var(--sea);opacity:.3;height:8px"></span>Model spread`; leg.appendChild(band);
  
  mmRenderRanking(series,st);
  
  

  const _agreeCuts = mmState.variable==="wind"?[2,4,7] : mmState.variable==="precip"?[2,6,15] : [1.5,3,5];
  const agreeWord = st.avgSpread<=_agreeCuts[0]?"High":st.avgSpread<=_agreeCuts[1]?"Moderate":st.avgSpread<=_agreeCuts[2]?"Low":"Very low";
  document.getElementById('mmAgree').textContent=`${st.avgSpread.toFixed(1)}${vm.unit} · agreement ${agreeWord}`;
  document.getElementById('mmAgreeBar').style.width=st.agree+"%";
  document.getElementById('mmAgreeNote').textContent=`Mean model-to-model spread over the window, ${st.keys.length} active models (High ≤ ${_agreeCuts[0]}, Moderate ≤ ${_agreeCuts[1]}, Low ≤ ${_agreeCuts[2]}, Very low above ${_agreeCuts[2]}${vm.unit})`;
  document.getElementById('mmCount').textContent=st.keys.length+" / "+MM_MODELS.length;
  document.getElementById('mmPeak').textContent= st.peak==null?"—":(st.peak.toFixed(mmState.variable==="precip"?1:0)+vm.unit);
  document.getElementById('mmPeakNote').textContent= mmState.variable==="temp"||mmState.variable==="feels"?"Highest hourly multi-model mean in the next 36 h (max of the mean, not mean of the maxima)":(mmState.variable==="wind"?"Peak of the multi-model mean wind in window":"Peak of the multi-model mean rate in window");    
}

function mmRenderRanking(series, st){
  const box=document.getElementById('mmModels'); box.innerHTML="";
  const vm=MM_VARMAP[mmState.variable];
  
  const refPeak=st.peak;
  const rows=MM_MODELS.map(m=>{
    const arr=series[m.key];
    let mp=null; if(arr){ const w=arr.slice(0,Math.min(36,mmState.lead)).filter(x=>x!=null); if(w.length) mp=Math.max(...w); }
    const delta= (mp==null||refPeak==null)?null:(mp-refPeak);
    return {m, mp, delta, absd: delta==null?999:Math.abs(delta)};
  }).sort((a,b)=> a.absd-b.absd);
  rows.forEach(({m,mp,delta})=>{
    const avail=mmHasData(m.key);
    const row=document.createElement('div'); row.className='mm-model'+((!avail||mmState.off.has(m.key))?' off':'');
    const dcls = delta==null?'zero':(Math.abs(delta)<0.3?'zero':(delta>0?'warm':'cool'));
    const dtxt = !avail?'no feed':(delta==null?'—':(delta>0?'+':'')+delta.toFixed(1)+vm.unit+' vs mean');
    row.innerHTML=`<span class="mm-chip-color" style="background:${m.color}"></span>`
      +`<span><span class="mm-mname">${m.name}${m.ml?'<span class="mm-ml-tag">ML</span>':''}</span><span class="mm-morg">${m.org}</span></span>`
      +`<span class="mm-mval"><span class="mm-mtemp">${!avail?'—':(mp==null?'—':mp.toFixed(mmState.variable==="precip"?1:0)+vm.unit)}</span><span class="mm-mdelta ${dcls}">${dtxt}</span></span>`;
    if(avail){ row.onclick=()=>{ if(mmState.off.has(m.key)){ mmState.off.delete(m.key);} else if(mmActiveKeys().length>2){ mmState.off.add(m.key);} mmRender(); }; }
    else { row.style.cursor='default'; }
    box.appendChild(row);
  });
}

async function mmOnCity(s){
  

  mmState.station=s; mmState.off.clear();
  
  if(window.__machDeferModels && !window.__machModelsRequested){
    

    

    ++mmReq;
    mmState.series=null;
    mmState.seriesIdentity=mmSeriesIdentity();
    mmState.source="pending"; mmState.unavailableWhy=null;
    mmState.loading=false; mmRender(); return;
  }
  
  const token = ++mmReq;
  const want  = mmSeriesIdentity();
  mmState.series=null; mmState.seriesIdentity=null; mmState.loading=true;
  try{ mmRender(); }catch(_){}
  document.getElementById('mmStatus').textContent="loading "+want.variable+" for "+(s.name||want.station)+"…";
  let series=null, source="live", why=null;
  

  try{ series = await mmFetchLive(s, want.variable, want.lead); }
  catch(e){ series=null; source="unavailable"; var _m=(e&&e.message)||''; why = /failed to fetch|networkerror|load failed|abort/i.test(_m) ? 'the model feed could not be reached'      : /timeout|timed out/i.test(_m) ? 'the model feed did not answer in time'      : /\b(4\d\d|5\d\d)\b/.test(_m) ? ('the model feed refused the request ('+_m+')')      : (_m || 'the model feed did not answer'); }
  mmState.unavailableWhy=why;
  if(token !== mmReq){
    try{ if(window.console&&window.__MACH_DEBUG) console.info('[mm] discarded stale city response for '+want.station); }catch(_){}
    return;
  }
  if(!mmIdentityMatches(want, mmSeriesIdentity())){
    document.getElementById('mmStatus').textContent="selection changed during load — not rendered";
    return;
  }
  mmState.series=series; mmState.source=source; mmState.seriesIdentity=want; mmState.loading=false;
  mmRender();
  
  
  if(mmState.source==='live' && typeof aiRender==='function'){ try{ aiRender(); }catch(e){} }
}


var mmReq = 0;
function mmSeriesIdentity(){
  return { variable: mmState.variable, lead: mmState.lead,
           station: mmState.station && (mmState.station.id || mmState.station.name),
           unit: null };
}
function mmIdentityMatches(a, b){
  if(!a || !b) return false;
  return a.variable===b.variable && String(a.lead)===String(b.lead) && a.station===b.station;
}
async function mmReloadVar(){
  const s=mmState.station; if(!s)return;
  const token = ++mmReq;
  const want  = mmSeriesIdentity();
   
  mmState.series = null;
  mmState.seriesIdentity = null;
  mmState.loading = true;
  try{ mmRender(); }catch(_){}
  const st=document.getElementById('mmStatus');
  if(st) st.textContent="loading "+want.variable+" at +"+want.lead+"h…";

  let series=null, source="live", why=null;
  

  try{ series = await mmFetchLive(s, want.variable, want.lead); }
  catch(e){ series=null; source="unavailable"; var _m=(e&&e.message)||''; why = /failed to fetch|networkerror|load failed|abort/i.test(_m) ? 'the model feed could not be reached'      : /timeout|timed out/i.test(_m) ? 'the model feed did not answer in time'      : /\b(4\d\d|5\d\d)\b/.test(_m) ? ('the model feed refused the request ('+_m+')')      : (_m || 'the model feed did not answer'); }
  mmState.unavailableWhy=why;

   
  if(token !== mmReq){
    try{ if(window.console&&window.__MACH_DEBUG) console.info('[mm] discarded stale response for '+want.variable+' +'+want.lead+'h'); }catch(_){}
    return;
  }
   
  if(!mmIdentityMatches(want, mmSeriesIdentity())){
    if(st) st.textContent="selection changed during load — not rendered";
    return;
  }
  mmState.series=series; mmState.seriesIdentity=want; mmState.source=source; mmState.loading=false;
  mmRender();
}

document.querySelectorAll('#mmVarSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#mmVarSeg button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  mmState.variable=b.dataset.var; mmReloadVar();
});
document.querySelectorAll('#mmLeadSeg button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#mmLeadSeg button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  mmState.lead=parseInt(b.dataset.lead,10); mmReloadVar();
});


window.__machDeferModels=true;
aiInit();
initTips();
drawLegend(); drawAlertList(); buildA11yTables(); agnBootPlace();
try{ document.addEventListener('agn:comfort',function(e){ if(e&&e.detail&&e.detail.day===0) try{ buildA11yTables(); }catch(_){} }); }catch(_){}   /* v283.35: rebuilt when the served comfort lands */





const WMO={
  0:["Clear","☀️"],1:["Mainly clear","🌤️"],2:["Partly cloudy","⛅"],3:["Overcast","☁️"],
  45:["Fog","🌫️"],48:["Rime fog","🌫️"],
  51:["Light drizzle","🌦️"],53:["Drizzle","🌦️"],55:["Heavy drizzle","🌦️"],
  61:["Light rain","🌦️"],63:["Rain","🌧️"],65:["Heavy rain","🌧️"],
  71:["Light snow","🌨️"],73:["Snow","🌨️"],75:["Heavy snow","❄️"],
  80:["Rain showers","🌦️"],81:["Showers","🌧️"],82:["Violent showers","⛈️"],
  95:["Thunderstorm","⛈️"],96:["Thunderstorm + hail","⛈️"],99:["Severe thunderstorm","⛈️"]
};
function wmoCond(code){ return WMO[code]||["—","🌡️"]; }





function conditionFromCode(code, prob, amount){
  if(code==null) return ["—","🌡️"];
  var c=Number(code), pp=Number(prob||0), amt=Number(amount||0);
  var lowSignal=(pp<30 && amt<0.2);
  if(c>=95 && lowSignal) return wmoCond(2);              
  if(c>=80 && c<95 && lowSignal) return wmoCond(3);      
  return wmoCond(c);
}
window.conditionFromCode=conditionFromCode;
window.wmoCond=wmoCond;
function sevFromTemp(t){ return t>=44?5 : t>=40?4 : t>=35?3 : t>=28?2 : 1; }


function recomputeStation(s){
  const c=stationComfort(s);              
  
  
  s.feels = (typeof s.apparentLive==='number') ? Math.round(s.apparentLive) : c.feels;
  s.sev=sevFromTemp(s.t);
  return s;
}
















async function fetchLiveStations(){
  /* v91.17.283.12 · ONE CALCULATION POINT: the 12 city stations are the point states of the 12 cities (AGN.pointState.many, the served
     chain), the one path for every city value the pins, the popups, the city menu and the cards show. The provider request here and
     its second copy (mach-openmeteo-wiring) are retired. */
  const P=await agnPS(); if(!P){ setLiveBadge(false); return false; }
  let S=[]; try{ S=await P.many(STATIONS.map(function(s){ return {lat:s.lat,lon:s.lon}; })); }catch(e){ S=[]; }
  let updated=0;
  STATIONS.forEach(function(s,i){ const ps=S[i]; if(!ps||!ps.ok||!ps.now) return; const n=ps.now;
    s.identityRejected=false; s.gridLat=ps.point.lat; s.gridLon=ps.point.lon; s.echoedElev=ps.point.elevM; s.pointState=ps.key;
    if(n.tempC!=null){ s.t=Number((+n.tempC).toFixed(1)); s.tRaw=s.t; s.__lapseAdjusted=true; }
    if(n.rh!=null) s.hum=Math.round(n.rh); if(n.windKmh!=null) s.wind=Math.round(n.windKmh); if(n.gustKmh!=null) s.gust=Math.round(n.gustKmh);
    if(n.rainMm!=null) s.rain=+(+n.rainMm).toFixed(1); if(n.uv!=null) s.uv=Math.round(n.uv); if(n.feelsC!=null) s.apparentLive=n.feelsC;
    if(n.weatherCode!=null){ const q=conditionFromCode(n.weatherCode,n.rainProb,n.rainMm); s.cond=q[0]; s.em=q[1]; }
    const nx={time:n.time, surfacePressure:n.pressureHpa, cloudCover:n.cloudPct, shortwave:n.swRad, source:P.sourceWord(ps), modelled:true}, pv=s.omFeatures||{}, o={};
    Object.keys(pv).forEach(function(k){ o[k]=pv[k]; }); Object.keys(nx).forEach(function(k){ if(nx[k]!=null) o[k]=nx[k]; }); s.omFeatures=o;
    if(o.soilMoist!=null) s.soilMoist=o.soilMoist; s.weatherLive=true; s.featureLive=true; s.liveSource='mach'; s.liveFetchedAt=Date.now();
    recomputeStation(s); updated++; });
  window.__AGN_IDENTITY_REJECTS=[]; setLiveBadge(updated>0); return updated>0;
}


function setLiveBadge(live){
  window.__AGN_LIVE_LAST=live;
  

  

  var _sa=window.__AGN_SWEEP_AGE; if(_sa&&Date.now()-_sa.at>15*60e3) _sa=null;
  var _ageS=_sa?Math.max(0,(Date.now()-_sa.fetchedAt)/1000):0, _old=_sa&&_ageS>600, _lg=_sa&&_sa.state==='sweep-last-good';
  var _asof=_old?(' · as of '+new Date(_sa.fetchedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Karachi'})+' PKT ('+Math.round(_ageS/60)+' min old)'):'';
  let el=document.getElementById('liveBadge');
  if(!el){ el=document.createElement('span'); el.id='liveBadge';
    el.style.cssText='display:inline-flex;align-items:center;gap:6px;font-size:0.75rem;font-weight:800;letter-spacing:.04em;padding:4px 9px;border-radius:999px;margin-left:10px;vertical-align:middle';
    const host=document.getElementById('ccLoc'); if(host&&host.parentNode) host.parentNode.appendChild(el);
  }
  if(live==='partial'){
    const n=(window.__AGN_IDENTITY_REJECTS||[]).length;
    el.textContent='● PARTIAL · '+n+' station'+(n===1?'':'s')+' refused on identity';
    el.style.color='var(--sand)'; el.style.background='rgba(240,138,36,.12)';
    el.title=(window.__AGN_IDENTITY_REJECTS||[]).join(' · ');
  }
  else if(live==='fallback-server'){ el.textContent='● LIVE · secondary global forecast (fallback, uncorrected)'+_asof; el.style.color='var(--sand)'; el.style.background='rgba(240,138,36,.12)'; }    
  else if(live==='fallback'){ el.textContent='● LIVE · second-opinion feed (fallback)'+(_lg?' · part of the map is the last good forecast'+_asof:_asof); el.style.color='var(--sea)'; el.style.background='rgba(20,184,166,.12)'; }
  else if(live&&_lg){ el.textContent='● LAST GOOD FORECAST'+_asof+' · provider not answering'; el.style.color='var(--sand)'; el.style.background='rgba(240,138,36,.12)'; }
  else if(live){ el.textContent='● LIVE · model forecast'+_asof; el.style.color='var(--sea)'; el.style.background='rgba(20,184,166,.12)'; }
  else { el.textContent='● synthetic (live unavailable)'; el.style.color='var(--sand)'; el.style.background='rgba(240,138,36,.12)'; }
}




async function fetchDistrictAQI(){
  /* v91.17.283.12 · the server AQI of each unit (agnSmogMany: /api/smog/units, 200 a request); no composition-forecast request */
  if(typeof PK_DISTRICT_CENTROIDS==='undefined') return false;
  const pts=PK_DISTRICT_CENTROIDS.filter(d=>d.province!==IIOJK&&DISTRICT_IN[d.key]); let updated=0; let V=[]; try{ V=await agnSmogMany(pts); }catch(_){ V=[]; }
  pts.forEach(function(d,n){ const inp=DISTRICT_IN[d.key], v=V[n]||null;
      inp.aqi=v?v.aqi:null; inp.pm25=v?v.pm25:null; inp.pm10=v?v.pm10:null; inp.dust=v?v.dust:null; inp.no2=null; inp.o3=null; inp.aod=null; inp.aqiBasis=v?v.basis:'not assessed';
      if(v&&v.aqi!=null){ inp.aqiLive=true; updated++; } });
  console.log('server AQI for',updated,'units');
  return updated>0;
}
(async function bootLive(){
  const ok=await fetchLiveStations();
  if(ok){
    refreshPins();
    const _ua=window.__userAction; window.__userAction=false;
    /* v91.17.283.31 · the first city view only when no place was searched or picked meanwhile (see window.__agnCityPicked) */
    if((typeof window.__agnCityPicked!=='function'||window.__agnCityPicked())&&selectedId) selectCity(selectedId,false);   /* v283.36 item 8: never Islamabad by default */   
    window.__userAction=_ua;
    drawRailAlerts && drawRailAlerts();
    if(typeof drawLegend==='function') drawLegend();
    buildA11yTables && buildA11yTables();
  }
  
  
  
})();

 
window.__userAction=true;

(function(){ const bar=document.getElementById('meteoParams'); if(bar){ bar.addEventListener('click',e=>{ const b=e.target.closest('.mp-btn'); if(b&&b.dataset.param) setMeteoParam(b.dataset.param); }); } })();
var __synD=document.getElementById('synDismiss'); if(__synD) __synD.onclick=()=>{const sb=document.getElementById('synbar'); if(sb){sb.classList.add('syn-collapsed'); sb.innerHTML='<span aria-hidden="true">⚠️</span><span><b>Demo districts · synthetic.</b> District choropleth and ag-risk scores are not live. Station tiles are live (MACH test feed).</span>';}};



(function(){
  if(!window.AGNConditions){ console.warn("agn-conditions.js not loaded — live-by-location disabled"); return; }
  var LIVE_ID="__live";

  function upsertLiveStation(rec, name){
    

    if(!rec || !Number.isFinite(Number(rec.lat)) || !Number.isFinite(Number(rec.lon))
       || Number(rec.lat)<-90 || Number(rec.lat)>90
       || Number(rec.lon)<-180 || Number(rec.lon)>180){
      try{ console.warn('[AGN] upsertLiveStation refused: the reading carried no usable coordinate ('
                        +(rec&&rec.lat)+', '+(rec&&rec.lon)+'); the map was not moved'); }catch(_){}
      return null;
    }
    var base=STATIONS.find(function(x){return x.id===LIVE_ID;});
    var prevAqi = base?base.aqi:96, prevPm=base?base.pm25:34;   
    var s={
      id:LIVE_ID, name:name||"Selected point",
      lat:Number(rec.lat), lon:Number(rec.lon),
      t:rec.t, feels:rec.feels, cond:rec.cond, em:rec.em,
      hum:rec.hum, wind:rec.wind, gust:rec.gust, rain:rec.rain, uv:rec.uv,
      sev:rec.sev, aqi:rec.aqi!=null?rec.aqi:prevAqi, pm25:rec.pm25!=null?rec.pm25:prevPm,
      alert:null, __live:true, __tier:rec.tier, __confidence:rec.confidence,
      
      
      weatherLive:true, liveSource:rec.source||'mach', liveFetchedAt:rec.fetchedAt||Date.now(),
      elev:(rec.realElev!=null?rec.realElev:(rec.gridElev!=null?rec.gridElev:null)),
      gridElev:(rec.gridElev!=null?rec.gridElev:null)
    };
    if(base){ Object.assign(base,s); } else { STATIONS.push(s); }
    
    if(!markers[LIVE_ID]){
      var m=L.marker([s.lat,s.lon],{icon:L.divIcon({className:"",html:pinHtml(s,true),iconSize:[34,34],iconAnchor:[6,34],popupAnchor:[10,-34]})}).addTo(map);
      m.bindPopup(popHtml(s),{closeButton:true,offset:[0,0]});
      m.on('click',function(){ selectCity(LIVE_ID,false); });
      markers[LIVE_ID]=m;
    } else {
      markers[LIVE_ID].setLatLng([s.lat,s.lon]);
    }
    return s;
  }

  function setSourceBadge(rec){
    var el=document.getElementById('liveBadge');
    if(!el && typeof window.setLiveBadge==='function'){ window.setLiveBadge(false); el=document.getElementById('liveBadge'); }
    if(!el) return;
    if(rec.ok){ el.textContent=rec.sourceLabel||"● LIVE"; el.style.color='var(--sea)'; el.style.background='rgba(20,184,166,.12)'; }
    else {
      
      
      
      var extra=(rec.sourceLabel||rec.source||'');
      var dup=/unavailable/i.test(extra);
      el.textContent = dup ? '● live unavailable' : ('● live unavailable · '+extra);
      el.style.color='var(--sand)'; el.style.background='rgba(240,138,36,.12)';
    }
  }

  
  /* v91.17.283.20 · B7 · THE ONE driveFromPoint: the map's sequencing of places (a newer place supersedes an older reading, the place kept
     for a reload: AGN.driveSeq in agn-map76-js) is called here, not wrapped around it; the reading itself is driveBody */
  window.driveFromPoint=function(lat,lon,name,recenter,realElev,distProps,distLayer){ var a=[].slice.call(arguments);
    try{ if(window.AGNAutoLoc) window.AGNAutoLoc.picked(lat,lon); }catch(_){}   /* v91.17.283.37 · R4: a place driven before the position arrives wins */
    /* the place the page was last driven to (read by the page switch: Customize opens there) */
    if(Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&window.AGN) AGN.drivenPoint={lat:+lat, lon:+lon, name:name||null};
    return (window.AGN&&typeof AGN.driveSeq==='function')?AGN.driveSeq(driveBody,this,a):driveBody.apply(this,a); };
  var driveBody=function(lat,lon,name,recenter,realElev,distProps,distLayer){


    if(!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))
       ||Number(lat)<-90||Number(lat)>90||Number(lon)<-180||Number(lon)>180){
      var _why='a location was requested with coordinates that are not a point on the Earth ('+lat+', '+lon+'), so nothing was changed';
      try{ console.warn('[AGN] driveFromPoint refused:', _why); }catch(_){}
      return Promise.resolve({ok:false, refused:true, error:_why, lat:lat, lon:lon});
    }
    return ((window.AGN&&AGN.condGuard)?AGN.condGuard:function(p){ return p; })(window.AGNConditions.getConditions(lat,lon,realElev)).then(function(rec){
      setSourceBadge(rec);
      if(!rec.ok){
        console.warn("getConditions failed:",rec.error);

        if(name){
          try{
            var _cl=document.getElementById('cityLabel'); if(_cl) _cl.textContent=name;
            var _cc=document.getElementById('ccLoc'); if(_cc) _cc.textContent=name;
            var _hs=document.getElementById('hourSub'); if(_hs) _hs.textContent=name+' · '+(DAY_OFFSET===0?'next 24 hours':'historical reanalysis')+' · PKT';
            
            var _conf=document.getElementById('ccConf'); if(_conf) _conf.innerHTML='<div class="asof asof-syn">Live data unavailable for '+name+' — showing no reading</div>';
            ['ccTemp','ccFeels','ccHum','ccWind','ccRain','ccUV'].forEach(function(id){var e=document.getElementById(id); if(e) e.textContent='—';});
            var _cond=document.getElementById('ccCond'); if(_cond) _cond.textContent='Live unavailable';
          }catch(_e){}
        }
        return rec;
      }
      

      if(!Number.isFinite(Number(rec.lat))) rec.lat=Number(lat);
      if(!Number.isFinite(Number(rec.lon))) rec.lon=Number(lon);
      var _live=upsertLiveStation(rec,name);
      if(!_live){
        

        return {ok:false, refused:true,
                error:'the live reading arrived without a usable coordinate, so the map was left where it was',
                lat:rec.lat, lon:rec.lon};
      }
      window.__userAction=false;            
      

      try{ selectCity(LIVE_ID,!!recenter); }
      catch(_mapErr){
        try{ window.__AGN_LOC_ERR={message:(_mapErr&&_mapErr.message)||'', stack:(_mapErr&&_mapErr.stack)||'',
                                   at:new Date().toISOString(), phase:'selectCity recenter='+!!recenter};
             console.warn('[AGN] map move failed after a valid reading:', _mapErr&&_mapErr.message, '\n', _mapErr&&_mapErr.stack); }catch(_){}
        try{ selectCity(LIVE_ID,false);
             rec.mapNote='Showing conditions for your location. The map could not be moved to it.'; }
        catch(_e2){
          return {ok:false, refused:true, lat:rec.lat, lon:rec.lon,
                  error:'Your location was found, but it could not be shown on the map or the card. Nothing was changed.'};
        }
      }
      
      
      try{
        if(distProps && distLayer && typeof showDistrictPanel==='function'){
          var key=distProps.key||distProps.district;
          if(typeof DISTRICT_IN!=='undefined'){
            var row=DISTRICT_IN[key]||(DISTRICT_IN[key]={});
            row.t=rec.t; row.hum=rec.hum; row.wind=rec.wind; row.feels=rec.feels; row.aqi=rec.aqi!=null?rec.aqi:row.aqi;
            row.weatherLive=true; row.districtFetchedAt=rec.fetchedAt||Date.now();
            row.liveMeta={source:rec.source||'mach',time:new Date(rec.fetchedAt||Date.now()).toISOString()};
          }
          showDistrictPanel(distProps, distLayer);   
        }
      }catch(_e){ if(window.__MACH_DEBUG) console.debug('[mach] panel live-sync', _e&&_e.message); }
      return rec;
    });
  };

  
  if(typeof districtLayer!=="undefined" && districtLayer.eachLayer){
    districtLayer.eachLayer(function(l){
      l.on('click',function(e){
        if(!districtsOn) return;
        var d=l.feature.properties, c=(e&&e.latlng&&isFinite(e.latlng.lat)&&isFinite(e.latlng.lng))?e.latlng:l.getBounds().getCenter();
        
        if(typeof selectDistrict==='function') selectDistrict(d,l);
        

        var _nm=d.tehsil||d.district;
        setTimeout(function(){ window.driveFromPoint(c.lat,c.lng,_nm,false); },0);
      });
    });
  }

  
  (function(){
    var host=document.getElementById('ccLoc');
    var bar = host && host.parentNode;
    if(!bar) return;
    var btn=document.createElement('button');
    btn.id='useLocBtn'; btn.type='button'; btn.textContent='Use my location';
    btn.style.cssText='margin-left:10px;font-size:0.75rem;font-weight:800;border:1px solid var(--sea);color:var(--sea);background:rgba(20,184,166,.08);border-radius:999px;padding:4px 10px;cursor:pointer';
    

    var note=document.createElement('span');
    note.id='useLocNote';
    

    note.style.cssText='display:none;margin:2px 0 8px;font-size:0.8rem;font-weight:600;line-height:1.35;'
      +'color:#ffe3e3;text-transform:none;letter-spacing:normal;font-family:inherit';
    btn.onclick=function(){
      btn.disabled=true; btn.textContent='Locating…'; note.style.display='none'; note.textContent='';
      AGN.places.locate().then(function(p){
        if(p.coarse){ note.textContent='Network position only (±'+(p.accuracyM/1000).toFixed(0)+' km): pick your place in the list that opened above.'; note.style.display=''; return {ok:false, coarse:true}; }
        return window.driveFromPoint(p.lat,p.lon,p.label,true).then(function(rec){
          if(rec&&rec.ok===false){
            note.textContent=rec.refused ? rec.error
              : ('no live reading for your location'+(rec.error?' — '+rec.error:''));
            note.style.display='';
          } else if(rec&&rec.mapNote){
             
            note.textContent=rec.mapNote; note.style.display='';
          }
          return rec;
        });
      }).catch(function(e){
        

        

        var _m=(e&&e.message)||'';
        var _stack=(e&&e.stack)||'';
        try{ window.__AGN_LOC_ERR={message:_m, stack:_stack, at:new Date().toISOString()}; }catch(_){}
        var _frame='';
        try{ var _ln=_stack.split('\n').slice(1).find(function(l){ return /:\d+:\d+/.test(l); })||'';
             _frame=(_ln.match(/at\s+([A-Za-z0-9_$.]+)/)||[])[1]||'';
             var _pos=(_ln.match(/:(\d+):\d+\)?\s*$/)||[])[1]||'';
             if(_frame||_pos) _frame=' ['+(_frame||'anonymous')+(_pos?' line '+_pos:'')+']'; }catch(_){}
        

        var _own='';
        try{ var _ls=_stack.split('\n').slice(1).filter(function(l){ return /:\d+:\d+/.test(l); });
             var _l0=((_ls[0]||'').match(/:(\d+):\d+\)?\s*$/)||[])[1];
             var _oc=_ls.find(function(l){ var n=(l.match(/:(\d+):\d+\)?\s*$/)||[])[1]; return n && n!==_l0; })||'';
             _own=((_oc.match(/at\s+([A-Za-z0-9_$.]+)/)||[])[1]||'anonymous')
                  +' line '+((_oc.match(/:(\d+):\d+\)?\s*$/)||[])[1]||'?');
             window.__AGN_LOC_ERR.caller=_own; }catch(_){}
        var _map=/latlng|invalid lat|leaflet|NaN/i.test(_m);
        note.textContent=_map
          ? 'Your location was found, but the map could not be moved to it. The conditions shown were not changed.'
          : ('Your location could not be used: '+(_m||'the location request failed')+'.');
        note.title='technical detail: '+(_m||'no message')+' · thrown at'+(_frame||' unknown')+' · caller '+(_own||'unknown');
        note.style.display='';
        try{ console.warn('[AGN] use-my-location:', _m, '\n', _stack); }catch(_){}
      }).finally(function(){ btn.disabled=false; btn.textContent='Use my location'; });
    };
    bar.appendChild(btn);
    if(bar.parentNode) bar.parentNode.insertBefore(note, bar.nextSibling); else bar.appendChild(note);
  })();
  /* v91.17.283.17 · the handed-over place (agnBootPlace) is read by the live-point engine once: the same point and label */
  try{ var _B=window.AGN_BOOT; if(_B&&_B.booted&&_B.place) window.driveFromPoint(_B.place.lat,_B.place.lon,_B.place.name||undefined,false); }catch(_){}
})();
map.whenReady(()=>{ provLayer.bringToFront(); if(typeof districtLayer!=='undefined'&&districtsOn) districtLayer.bringToFront(); natLayer.bringToFront(); });

(function(){ const panel=document.querySelector('.mappanel'); if(panel&&window.ResizeObserver){ let t; const ro=new ResizeObserver(()=>{ clearTimeout(t); t=setTimeout(()=>map.invalidateSize({animate:false}),60); }); ro.observe(panel); } setTimeout(()=>map.invalidateSize({animate:false}),200); window.addEventListener('resize',()=>map.invalidateSize({animate:false})); })();

 





const PK_RIVER_GAUGES_ALL = [
  {name:"Indus @ Tarbela", lat:34.09, lon:72.7, rp2:9928.5, rp5:12390.3, rp20:15583.7, obsMax:15204.5, yrs:29,
   bins:"405.4,465.9,527.5,556.2;408.3,510.9,547.3,570.2;428.5,552.4,613.6,748.9;514.2,688.0,778.1,899.3;607.1,730.5,871.6,987.1;662.7,878.4,973.1,1077.5;757.6,938.7,1054.8,1159.9;815.6,996.7,1103.1,1197.9;852.1,1039.9,1176.6,1338.7;994.4,1290.2,1451.8,1596.4;1366.7,1909.7,2357.3,3061.5;3082.2,6411.1,7078.6,8732.8;6575.6,9161.3,10567.2,12088.3;6575.6,8874.7,10203.8,11602.8;5635.4,6593.8,7905.8,9186.6;3952.7,5163.2,5977.6,6575.6;2810.9,3580.0,4041.0,4362.2;1926.5,2410.0,2763.4,3142.4;1351.1,1663.2,1863.7,2035.1;956.2,1157.8,1263.7,1335.0;676.6,802.5,876.0,929.7;514.2,614.2,660.6,703.4;428.5,499.3,540.0,578.2;405.4,466.7,512.1,558.8",
   districts:["Haripur", "Swabi", "Buner", "Torghar"]},
  {name:"Indus @ Besham", lat:34.72, lon:72.78, rp2:10087.3, rp5:12246.0, rp20:15046.3, obsMax:15065.1, yrs:29,
   bins:"363.8,407.3,431.5,448.8;356.3,403.8,422.3,443.6;364.6,431.7,465.7,518.3;408.3,506.0,557.7,606.6;447.8,538.5,583.3,648.2;522.6,636.4,721.1,787.1;598.8,742.4,822.4,915.2;665.8,825.0,930.1,1024.2;747.2,925.8,1062.2,1168.0;934.4,1249.3,1437.8,1618.6;1382.6,1950.6,2420.0,3197.9;3302.7,6936.5,8393.6,9310.1;7013.6,9357.4,10591.5,11994.0;6381.6,8728.7,10091.7,11260.6;5104.1,6455.5,7683.2,9068.9;3714.3,4710.9,5327.4,5860.4;2629.3,3342.5,3731.5,4015.1;1806.2,2258.4,2540.0,2848.7;1269.6,1555.7,1724.8,1874.0;886.2,1076.0,1178.2,1246.4;618.4,733.9,800.7,859.6;473.2,553.9,589.2,632.0;398.9,452.9,483.2,509.5;368.0,424.6,448.8,473.0",
   districts:["Shangla", "Batagram", "Upper Kohistan", "Lower Kohistan", "Kolai Palas"]},
  {name:"Indus @ Rondu", lat:35.44, lon:75.43, rp2:5481.8, rp5:6796.7, rp20:8502.4, obsMax:9570.9, yrs:29,
   bins:"170.8,216.9,228.6,232.9;178.9,209.4,219.3,224.3;181.4,206.0,215.8,218.8;182.2,205.5,211.6,221.7;185.6,204.1,210.8,219.3;193.5,209.4,218.9,231.1;200.4,218.8,230.7,246.1;207.0,233.5,252.6,285.4;222.9,277.6,322.6,358.3;292.1,410.1,469.5,517.1;433.5,660.3,894.4,1195.2;1157.8,3177.3,4026.2,4445.3;3498.4,4689.3,5573.4,6302.8;3530.8,4840.7,5507.1,6204.8;2889.7,3795.7,4486.4,5043.3;2064.4,2735.5,3181.8,3504.9;1373.0,1820.4,2127.1,2442.4;911.0,1165.8,1357.3,1500.8;628.5,784.2,870.0,958.4;440.6,543.5,594.9,637.0;296.2,371.6,411.7,442.4;216.3,272.5,297.5,315.1;174.0,232.3,247.9,261.3;166.5,224.9,235.4,243.8",
   districts:["Skardu", "Kharmang", "Shigar", "Astore"]},
  {name:"Shyok @ Khaplu", lat:35.16, lon:76.34, rp2:1590.8, rp5:2114.5, rp20:2794.0, obsMax:3190.5, yrs:29,
   bins:"47.2,53.1,60.1,64.4;44.9,50.6,53.9,58.2;42.6,48.1,50.0,52.6;40.3,45.0,47.8,49.2;37.5,42.5,44.8,46.0;35.3,39.9,42.2,43.4;33.9,38.0,40.7,42.0;33.0,37.6,40.6,42.5;32.5,39.5,45.5,55.2;37.2,59.3,68.3,73.1;56.1,82.1,105.0,158.1;133.0,355.6,672.3,962.4;670.4,1079.9,1389.0,1551.4;994.4,1392.2,1551.4,1728.0;978.5,1329.5,1493.9,1721.7;695.6,1016.2,1202.4,1349.8;437.5,607.4,742.0,853.3;276.3,373.3,430.5,498.6;186.1,241.3,275.4,311.2;129.9,165.9,184.6,200.7;89.8,115.7,128.1,139.9;68.2,85.1,95.2,104.1;56.5,67.9,74.3,81.4;51.1,58.9,67.7,70.8",
   districts:["Ghanche"]},
  {name:"Hunza @ Danyore", lat:35.83, lon:74.48, rp2:2890.8, rp5:3487.3, rp20:4261.0, obsMax:4455.6, yrs:29,
   bins:"93.0,98.8,102.5,106.8;85.5,90.6,94.3,97.1;79.7,85.3,89.5,94.9;76.1,86.7,96.8,104.6;74.7,88.2,100.2,113.4;80.5,100.4,114.5,134.1;92.1,113.4,131.6,159.9;100.2,131.4,154.0,182.6;117.0,144.7,165.7,188.6;142.2,205.1,264.2,326.0;224.4,404.1,664.6,869.2;930.1,1915.9,2338.9,2769.8;1810.3,2461.6,2837.0,3233.4;1576.6,2112.5,2471.9,2791.5;1232.1,1632.0,1857.7,2316.4;904.7,1156.2,1364.2,1491.8;676.6,838.5,930.1,1052.4;488.8,597.4,668.3,754.1;341.8,422.8,483.8,535.5;230.7,291.4,323.8,357.1;161.2,196.2,215.3,237.2;128.1,143.9,155.2,167.6;111.5,120.7,126.6,132.3;101.8,108.7,113.2,118.4",
   districts:["Hunza", "Nagar"]},
  {name:"Gilgit @ Gilgit", lat:35.92, lon:74.31, rp2:2840.2, rp5:3430.1, rp20:4195.3, obsMax:4404.6, yrs:29,
   bins:"89.0,94.5,98.2,101.8;81.8,86.5,90.0,92.8;76.1,81.4,84.9,89.8;72.1,81.4,88.7,96.2;69.8,81.6,91.9,102.6;74.2,92.5,103.5,120.4;84.7,104.2,119.0,144.8;92.3,120.9,140.2,166.1;107.9,133.3,154.0,173.9;131.1,188.0,244.8,302.2;205.5,375.9,633.7,845.5;902.6,1872.3,2283.6,2726.7;1777.3,2410.0,2783.9,3161.3;1540.7,2056.8,2420.0,2745.6;1204.0,1595.6,1817.0,2271.0;882.1,1129.3,1335.0,1463.9;658.2,816.0,906.0,1026.1;472.1,580.0,649.1,732.2;328.6,409.4,467.8,520.4;220.8,280.8,311.3,344.0;153.2,186.6,206.8,225.9;122.0,137.0,147.8,159.7;106.7,115.4,121.1,126.3;97.4,104.0,108.7,113.0",
   districts:["Gilgit", "Ghizer"]},
  {name:"Indus @ Attock", lat:33.9, lon:72.24, rp2:9952.7, rp5:12404.8, rp20:15585.7, obsMax:15274.7, yrs:29,
   bins:"416.8,473.2,541.2,575.8;423.6,526.5,565.2,591.7;443.6,575.8,650.3,778.8;532.3,720.1,810.3,974.9;624.2,772.0,932.3,1077.5;678.2,919.9,1024.7,1149.3;778.8,976.2,1095.5,1205.7;836.5,1019.9,1123.6,1225.9;864.0,1048.5,1198.5,1362.3;996.7,1287.8,1459.8,1587.5;1363.6,1900.1,2344.3,3025.1;3012.0,6375.8,7147.3,8752.9;6590.7,9246.0,10694.5,12088.3;6621.2,8952.6,10246.1,11672.5;5700.6,6697.9,8008.4,9173.9;3998.4,5237.4,6046.8,6621.2;2856.6,3629.8,4106.7,4443.3;1953.3,2449.2,2821.3,3193.5;1369.9,1693.3,1892.2,2073.0;971.8,1171.7,1286.7,1357.3;690.8,816.0,891.5,945.2;522.6,627.4,674.5,717.8;434.5,510.7,551.1,594.4;413.9,473.2,522.1,573.1",
   districts:["Attock", "Nowshera", "Mianwali"]},
  {name:"Indus @ Kalabagh", lat:32.96, lon:71.55, rp2:11835.2, rp5:14686.1, rp20:18384.2, obsMax:20796.0, yrs:29,
   bins:"517.8,630.3,722.1,791.5;536.0,680.1,755.8,821.2;575.8,764.6,993.0,1280.7;723.4,1106.1,1333.1,1567.9;896.4,1281.9,1548.5,1853.4;1017.6,1526.6,1815.4,2091.2;1260.8,1717.7,2069.1,2274.1;1505.6,1892.2,2196.9,2405.6;1544.2,1999.8,2351.9,2686.8;1689.4,2098.9,2357.3,2592.0;1989.7,2611.2,3167.1,3631.5;3705.8,7327.2,8263.2,10180.2;7869.5,10888.3,12415.5,13898.5;8090.0,10763.6,12071.7,13866.6;7078.5,8553.6,9889.1,11157.4;5163.2,6716.4,7725.8,8502.6;3774.7,4840.7,5459.1,6314.4;2605.2,3266.4,3834.3,4255.0;1835.5,2289.11,2576.5,2847.4;1348.0,1636.6,1792.9,1930.1;985.3,1168.5,1290.2,1397.9;735.2,903.5,1014.3,1060.2;578.4,700.5,783.5,866.0;526.2,631.4,711.2,782.1",
   districts:["Mianwali", "Karak", "Lakki Marwat", "Bhakkar"]},
  {name:"Indus @ Chashma", lat:32.33, lon:71.28, rp2:12235.6, rp5:15443.3, rp20:19604.2, obsMax:24265.1, yrs:29,
   bins:"551.1,667.6,763.9,844.3;574.4,716.8,804.4,869.6;612.8,799.6,1017.6,1338.7;743.7,1136.6,1387.7,1666.3;928.0,1317.9,1605.2,1887.0;1048.5,1562.2,1900.1,2195.8;1305.2,1803.7,2154.8,2390.1;1562.2,1977.8,2298.3,2458.2;1594.9,2076.8,2440.2,2777.4;1713.0,2157.7,2401.1,2651.2;1998.9,2576.5,3184.7,3609.8;3646.5,7260.1,8195.0,10138.1;7942.3,10989.1,12472.8,14340.7;8164.8,10938.6,12279.1,13982.0;7293.6,8752.9,10199.0,11549.5;5283.4,6853.9,7880.3,8644.7;3889.4,4976.4,5609.5,6491.5;2678.2,3348.7,3945.4,4350.1;1908.8,2355.1,2669.6,2942.1;1414.8,1698.0,1869.7,2007.2;1038.9,1227.0,1362.3,1470.6;787.9,965.9,1065.6,1117.9;621.3,752.4,842.3,919.5;563.9,673.5,764.6,835.8",
   districts:["Mianwali", "Bhakkar", "Dera Ismail Khan"]},
  {name:"Indus @ Taunsa", lat:30.51, lon:70.8, rp2:12218.8, rp5:15651.9, rp20:20105.2, obsMax:26301.7, yrs:29,
   bins:"575.8,690.8,777.0,864.8;593.3,733.5,828.9,898.1;628.5,804.8,984.8,1290.3;747.2,1158.3,1392.2,1628.3;923.7,1335.6,1608.2,1894.9;1065.6,1591.9,1952.5,2220.3;1284.3,1810.3,2166.7,2416.7;1547.8,1995.2,2314.3,2487.9;1605.9,2070.1,2421.2,2783.9;1647.2,2093.1,2370.4,2592.0;1852.5,2408.9,2912.4,3375.0;3249.9,6575.6,7905.8,9739.9;7887.6,10813.3,12364.2,14222.3;8297.5,11070.3,12387.0,14027.1;7602.3,9018.9,10548.1,12319.0;5431.5,7280.2,8164.8,9305.8;4044.8,5189.4,5890.2,6841.5;2804.4,3532.5,4154.3,4616.4;2008.1,2499.3,2831.7,3087.9;1512.6,1798.7,1962.4,2131.1;1105.6,1320.9,1459.8,1573.0;862.0,1041.8,1134.0,1202.9;656.7,808.1,917.3,994.0;596.0,712.2,797.0,880.5",
   districts:["Muzaffargarh", "Layyah", "Dera Ghazi Khan", "Rajanpur"]},
  {name:"Indus @ Guddu", lat:28.52, lon:69.82, rp2:16249.2, rp5:20434.5, rp20:25863.6, obsMax:30198.5, yrs:29,
   bins:"1530.1,1786.3,1951.5,2082.5;1540.7,1856.8,2034.2,2155.7;1587.5,1949.7,2139.9,2381.3;1635.8,2289.11,2893.7,3292.1;1818.7,2764.7,3229.0,3983.8;2045.5,3048.3,3797.4,4173.5;2397.8,3458.4,3921.8,4308.2;2798.0,3646.5,3907.4,4233.5;2957.0,3690.5,4056.0,4390.4;2253.2,3317.9,3783.4,4104.8;1654.8,2253.2,2804.6,3537.3;3068.0,6308.6,8728.7,10863.4;9288.7,13096.9,15295.8,17562.4;10938.6,14824.2,16709.9,18491.7;10518.6,12970.8,14607.3,17004.9;8374.3,11271.0,12840.0,14354.0;6545.4,8915.6,10833.3,13030.8;4863.1,6488.3,7647.9,8724.7;3613.1,4730.5,5476.7,6156.5;3197.9,3722.9,4110.5,4739.2;2772.3,3242.4,3576.7,3868.0;2222.3,2696.7,2957.0,3146.8;1761.0,2142.9,2368.2,2551.7;1605.9,1869.7,2057.7,2242.9",
   districts:["Kashmore", "Rajanpur", "Ghotki"]},
  {name:"Indus @ Sukkur", lat:27.7, lon:68.85, rp2:15998.3, rp5:20165.3, rp20:25570.5, obsMax:30478.0, yrs:29,
   bins:"1530.1,1781.4,1953.3,2073.0;1537.2,1831.3,2012.7,2122.2;1562.2,1913.3,2091.2,2341.1;1591.2,2228.5,2757.0,3175.9;1740.8,2709.2,3184.7,3925.5;1962.4,2970.7,3745.3,4091.6;2337.8,3390.6,3894.8,4272.7;2734.3,3604.8,3871.6,4204.3;2909.7,3654.9,3972.8,4314.2;2181.7,3257.4,3740.1,4059.7;1308.2,1940.8,2482.1,3044.1;2690.5,5342.2,8225.5,10040.5;8891.0,12704.7,14961.4,17209.8;10838.3,14824.2,16717.7,18432.2;10446.2,13000.7,14790.1,17052.0;8316.6,11219.2,12734.0,14327.6;6500.3,8956.8,10878.3,12988.7;4840.7,6548.4,7686.8,8825.7;3629.8,4752.4,5527.4,6204.8;3197.9,3733.2,4150.5,4752.4;2823.9,3273.9,3618.1,3896.6;2279.3,2760.9,2998.2,3195.0;1781.4,2187.8,2408.9,2590.8;1617.1,1879.2,2078.7,2262.6",
   districts:["Sukkur", "Shikarpur", "Khairpur", "Qambar Shahdadkot", "Larkana"]},
  {name:"Indus @ Kotri", lat:25.47, lon:68.26, rp2:16319.0, rp5:20687.0, rp20:26353.0, obsMax:29647.3, yrs:29,
   bins:"1537.2,1789.6,1956.0,2082.5;1516.0,1781.4,1974.2,2087.3;1526.6,1857.7,2015.5,2175.7;1533.6,2050.2,2543.5,3151.1;1605.9,2606.4,3206.8,3733.2;1852.5,2869.8,3665.1,4033.6;2237.7,3317.9,3880.5,4225.7;2593.2,3530.8,3832.5,4171.5;2850.0,3596.5,3852.0,4214.0;2207.0,3212.7,3688.8,4063.4;945.2,1614.9,2165.7,2584.8;1865.4,4101.0,6311.5,8753.2;8202.5,12054.9,14506.8,16307.0;10665.0,14776.5,16633.1,18070.7;10494.4,13030.7,15211.5,17273.3;8628.8,11485.8,13127.1,16895.6;6590.7,9357.4,11528.3,13879.4;4953.5,6719.5,8001.0,9374.6;3705.8,4854.1,5695.4,6279.6;3220.1,3774.7,4237.4,4774.3;2929.9,3395.2,3697.3,4024.3;2397.8,2871.1,3093.6,3324.1;1856.8,2289.11,2508.6,2684.4;1639.6,1919.4,2125.2,2304.7",
   districts:["Thatta", "Sujawal", "Jamshoro", "Hyderabad", "Badin", "Dadu", "Matiari", "Tando Muhammad Khan"]},
  {name:"Kabul @ Nowshera", lat:34.01, lon:71.98, rp2:1547.1, rp5:2051.9, rp20:2706.7, obsMax:3096.4, yrs:29,
   bins:"64.5,99.2,129.4,158.6;66.9,104.7,129.0,151.0;80.5,151.1,229.7,323.3;139.3,275.9,379.4,450.2;232.9,389.3,477.6,557.5;301.0,522.1,648.5,755.8;428.5,664.6,825.8,944.4;571.8,846.6,1041.8,1136.1;664.3,930.5,1112.3,1385.1;643.2,892.7,1017.6,1248.1;604.3,836.5,933.5,1038.9;806.2,1121.5,1281.9,1505.6;1226.4,1617.1,1802.0,2003.5;1284.3,1677.8,1944.4,2222.3;1100.5,1462.5,1740.0,2046.4;934.4,1235.0,1414.8,1634.4;738.6,999.5,1194.6,1379.4;528.7,730.5,860.0,1006.9;398.0,536.3,622.2,686.1;299.6,411.5,472.8,518.8;237.8,304.5,354.8,420.3;163.1,243.3,286.7,316.3;105.9,159.3,194.7,221.3;73.3,112.3,142.4,175.7",
   districts:["Nowshera", "Peshawar", "Charsadda", "Mohmand"]},
  {name:"Swat @ Chakdara", lat:34.65, lon:72.03, rp2:327.4, rp5:435.2, rp20:575.0, obsMax:764.6, yrs:29,
   bins:"18.8,26.0,30.9,35.7;17.9,25.7,30.0,33.5;19.8,32.8,42.3,55.8;30.1,47.4,59.1,69.1;41.5,59.0,74.7,83.8;50.5,76.8,87.6,96.3;69.3,87.8,106.2,120.3;78.2,106.7,123.1,138.6;80.5,115.7,130.6,145.5;85.5,109.2,126.5,142.0;99.7,124.9,141.1,158.8;152.1,220.3,252.3,286.1;264.5,324.1,362.1,411.1;291.4,358.9,413.8,486.5;258.4,327.6,375.0,440.6;217.3,267.5,323.0,364.8;177.2,218.3,248.0,297.4;134.8,168.8,191.0,218.5;102.8,130.3,146.8,162.2;79.2,99.5,111.4,123.6;62.7,77.0,84.7,91.9;45.9,61.3,68.1,75.0;30.6,43.1,49.4,54.3;22.1,31.2,37.0,41.6",
   districts:["Lower Dir", "Malakand", "Swat"]},
  {name:"Panjkora @ Timergara", lat:34.78, lon:71.75, rp2:111.7, rp5:157.9, rp20:217.8, obsMax:294.1, yrs:29,
   bins:"2.7,6.7,9.7,12.8;3.9,7.9,10.2,12.1;5.9,12.5,20.5,27.0;13.8,27.9,34.9,40.2;25.8,39.2,46.1,58.6;38.8,61.7,76.1,85.5;56.7,79.6,101.5,119.6;66.6,105.4,116.4,122.3;71.3,102.2,117.5,136.3;77.2,97.3,109.2,124.8;71.3,93.8,105.3,119.9;78.1,109.0,127.6,143.1;90.0,119.5,147.9,182.0;81.8,113.9,144.9,160.7;77.2,99.9,135.1,150.0;66.9,94.4,122.5,154.9;52.6,81.3,115.6,140.1;39.0,60.3,85.5,108.0;26.9,44.3,63.7,74.2;19.5,31.7,43.3,56.9;15.6,25.9,34.6,42.3;10.1,21.4,26.1,31.4;5.1,12.5,17.6,21.7;3.1,6.8,12.0,15.3",
   districts:["Upper Dir", "Lower Dir"]},
  {name:"Chitral @ Chitral", lat:35.8, lon:71.74, rp2:424.1, rp5:566.3, rp20:750.7, obsMax:880.0, yrs:29,
   bins:"1.9,3.1,4.1,5.4;1.0,1.7,2.3,2.9;0.7,1.6,2.4,3.2;1.1,2.7,4.6,5.8;2.0,4.3,5.8,7.3;3.8,8.1,11.2,13.2;7.9,12.9,16.9,20.8;13.1,20.9,27.8,33.4;18.2,26.2,36.0,45.0;23.3,34.4,49.1,61.5;34.2,60.7,72.9,88.5;98.1,195.4,250.0,300.9;257.8,355.6,421.3,523.6;299.6,392.9,456.1,529.4;251.3,342.6,397.7,435.3;190.4,243.5,285.4,337.4;138.0,180.6,207.5,239.1;92.1,122.6,143.8,163.8;61.4,83.8,98.9,112.6;39.9,55.9,67.0,76.5;24.4,35.8,42.1,49.8;14.0,21.4,26.9,32.0;7.3,11.5,14.6,17.5;3.7,6.1,8.0,9.4",
   districts:["Chitral"]},
  {name:"Kunhar @ Balakot", lat:34.45, lon:73.3, rp2:246.1, rp5:319.8, rp20:415.3, obsMax:434.5, yrs:29,
   bins:"14.8,16.5,17.6,18.1;14.3,15.7,16.9,17.4;14.4,16.2,17.2,18.4;15.1,17.8,20.1,22.6;16.3,20.0,22.7,25.2;19.2,25.3,28.1,33.6;23.9,32.4,36.3,39.4;27.7,37.6,42.0,45.8;30.8,40.5,48.9,54.5;32.7,44.1,50.0,57.8;41.3,56.5,67.9,79.3;86.1,176.4,214.6,265.6;166.5,232.3,272.0,318.0;150.7,202.7,237.0,262.4;128.4,166.6,187.0,214.1;107.6,133.0,148.3,163.6;89.6,106.7,118.3,127.4;70.3,84.4,92.2,98.5;53.8,64.8,71.9,76.2;40.9,49.3,54.3,58.0;30.9,37.1,40.6,43.6;23.7,28.3,31.0,33.4;18.9,21.8,23.6,25.1;16.2,18.0,19.3,20.5",
   districts:["Mansehra"]},
  {name:"Kurram @ Thal", lat:33.31, lon:70.5, rp2:103.5, rp5:253.2, rp20:447.2, obsMax:700.5, yrs:29,
   bins:"10.8,13.5,14.6,15.4;10.4,13.1,14.2,15.0;10.2,12.9,14.2,14.9;10.2,13.0,14.4,16.5;10.5,13.5,14.9,17.2;12.7,18.5,23.4,27.7;17.5,27.2,34.7,44.3;25.2,39.7,47.7,54.5;26.4,45.2,51.7,59.5;24.4,38.4,48.0,53.2;20.0,32.3,36.8,40.1;17.3,29.1,32.3,35.2;16.7,27.4,31.1,38.2;17.5,29.1,37.6,72.7;20.5,34.4,48.1,89.0;20.4,33.1,42.2,58.3;18.7,29.0,34.3,42.0;16.3,22.6,27.9,31.1;14.7,18.8,22.3,24.5;13.8,17.6,19.5,20.8;13.2,16.7,18.3,19.4;12.6,15.7,17.2,18.0;11.8,14.7,15.9,16.8;11.1,13.9,14.9,15.9",
   districts:["Kurram", "Hangu", "Bannu", "Lakki Marwat"]},
  {name:"Gomal @ Khajuri", lat:32.02, lon:70.65, rp2:185.9, rp5:409.5, rp20:699.5, obsMax:974.0, yrs:29,
   bins:"6.0,9.6,10.3,10.5;5.8,9.4,10.1,10.4;5.7,9.3,10.0,10.6;5.9,9.5,10.0,10.9;6.8,9.7,10.8,11.9;7.4,10.9,12.9,14.7;7.9,13.1,14.9,16.0;8.2,13.0,14.4,15.3;8.1,11.7,13.3,14.9;7.7,10.4,12.1,15.3;6.8,10.0,11.0,13.4;7.7,11.0,13.5,19.0;8.6,14.1,21.8,42.0;11.2,20.8,37.7,90.2;12.5,32.9,62.0,114.9;14.0,32.1,45.0,68.8;13.1,22.1,29.7,34.2;10.5,15.7,19.6,23.6;8.7,12.7,14.7,17.1;7.8,11.4,12.4,14.3;7.2,10.9,12.0,12.8;6.8,10.5,11.5,12.1;6.5,10.1,10.9,11.3;6.2,9.8,10.5,10.9",
   districts:["Tank", "Dera Ismail Khan"]},
  {name:"Soan @ Rawalpindi", lat:33.45, lon:73.0, rp2:284.6, rp5:577.0, rp20:956.3, obsMax:1389.0, yrs:29,
   bins:"6.4,11.3,18.5,33.5;7.8,15.3,25.0,40.9;9.5,19.7,35.2,61.9;11.8,30.7,51.9,75.8;13.1,32.2,53.5,70.3;12.2,31.4,45.2,59.6;12.3,27.1,39.1,53.2;10.7,19.2,29.3,39.1;9.0,13.6,20.2,28.9;7.9,11.2,15.8,19.1;8.2,11.7,15.9,19.8;9.9,17.8,26.5,38.0;15.3,28.4,41.4,59.0;21.3,35.4,47.9,65.9;24.1,37.7,51.8,79.1;21.9,36.2,51.2,78.1;17.4,29.5,42.5,63.2;12.2,20.9,32.0,42.4;8.9,14.0,20.8,28.0;7.7,11.6,16.7,23.8;7.2,11.1,15.1,18.8;6.5,9.0,11.5,14.7;6.1,8.9,11.7,16.9;6.1,9.7,12.1,17.6",
   districts:["Rawalpindi", "Islamabad"]},
  {name:"Jhelum @ Domel", lat:34.16, lon:73.42, rp2:1515.8, rp5:1878.6, rp20:2349.2, obsMax:2528.3, yrs:29,
   bins:"196.2,249.1,280.8,321.7;207.0,261.4,298.0,339.3;227.0,296.2,358.1,419.7;276.3,399.1,458.2,516.4;341.8,431.5,480.9,526.0;384.5,488.8,543.0,590.6;475.4,578.7,631.7,682.6;532.3,649.4,707.9,764.2;562.6,688.0,737.9,850.1;525.0,664.6,702.1,782.1;531.1,652.4,732.8,853.7;721.8,1005.5,1242.4,1495.3;1036.5,1405.0,1583.9,1713.0;1012.9,1323.3,1490.4,1638.8;925.8,1165.8,1304.0,1493.9;802.5,1005.9,1146.1,1385.1;682.9,878.8,1001.3,1130.9;534.8,668.9,779.6,876.0;421.7,512.3,578.4,630.5;349.8,418.8,457.8,501.3;289.4,352.2,391.8,430.5;244.5,303.2,341.8,374.0;213.8,264.5,302.8,330.6;199.4,249.1,278.6,302.9",
   districts:["Muzaffarabad", "Hattian", "Bagh"]},
  {name:"Poonch @ Kotli", lat:33.51, lon:73.9, rp2:184.9, rp5:369.4, rp20:608.6, obsMax:787.9, yrs:29,
   bins:"16.2,22.5,25.5,29.2;16.6,23.6,27.2,29.4;18.1,26.4,29.1,31.3;22.4,31.2,38.8,49.3;27.2,41.1,49.2,57.9;33.0,49.6,60.3,69.0;36.6,59.7,71.0,76.5;41.7,63.0,74.7,81.0;41.4,62.6,73.1,82.5;37.5,56.4,65.4,78.8;36.4,54.5,66.2,72.1;44.4,65.6,72.4,81.3;51.8,73.1,81.4,98.4;58.0,92.8,116.5,146.3;61.2,110.7,144.1,159.6;56.3,116.5,143.8,158.1;52.1,102.1,132.3,156.2;41.7,73.2,101.9,119.9;33.0,53.2,70.5,85.9;27.8,39.0,48.8,63.9;23.6,31.5,38.5,48.5;20.4,26.6,32.5,39.6;18.3,23.5,27.9,32.8;16.9,21.6,25.4,28.6",
   districts:["Kotli", "Poonch", "Sudhnoti"]},
  {name:"Jhelum @ Mangla", lat:32.94, lon:73.69, rp2:1513.4, rp5:1938.3, rp20:2489.5, obsMax:2889.7, yrs:29,
   bins:"260.2,290.7,322.3,351.5;261.4,316.0,361.7,388.8;267.5,343.4,398.2,439.3;302.4,421.9,512.6,615.6;368.8,534.8,615.0,726.1;436.5,598.8,706.3,802.5;539.8,697.2,807.4,881.7;617.0,765.0,845.5,883.7;625.6,784.2,842.3,961.5;472.1,738.6,798.8,846.2;305.9,514.7,609.4,699.8;591.9,886.2,1111.2,1301.0;1019.9,1367.4,1566.5,1783.8;1105.6,1424.6,1634.3,1829.6;1043.7,1344.9,1491.8,1733.6;898.5,1226.4,1448.4,1907.1;771.7,1098.5,1319.1,1626.1;603.0,812.2,1017.6,1151.4;470.0,599.1,734.2,833.8;411.1,493.3,562.9,647.3;348.1,422.6,489.5,558.5;296.9,367.1,411.7,473.2;261.4,316.1,386.8,420.7;260.2,294.1,344.0,386.1",
   districts:["Mirpur", "Bhimber", "Jhelum"]},
  {name:"Jhelum @ Rasul", lat:32.68, lon:73.41, rp2:3623.5, rp5:4995.3, rp20:6774.8, obsMax:8708.6, yrs:29,
   bins:"444.7,517.8,582.5,656.4;446.7,569.2,635.5,681.3;480.9,608.5,677.0,735.2;549.8,723.8,863.2,1115.3;621.3,876.0,1094.5,1256.8;715.1,1013.4,1148.7,1338.1;836.5,1121.5,1276.0,1398.6;947.4,1196.3,1292.0,1414.1;987.5,1237.8,1340.5,1410.9;757.6,1105.6,1259.7,1356.1;513.0,860.0,1015.2,1189.8;1015.2,1556.4,1952.5,2340.0;1882.7,2654.8,3261.9,3685.4;2279.3,3103.6,3392.1,3721.2;2171.7,2917.8,3234.9,3726.5;1908.8,2612.4,3125.1,3697.3;1602.2,2321.7,2823.9,3278.4;1284.3,1716.9,2122.2,2403.4;980.8,1263.7,1537.2,1672.4;821.2,1005.9,1118.4,1309.4;682.9,834.6,925.8,1033.7;553.6,682.9,758.3,869.2;477.6,573.7,663.7,762.1;455.0,522.6,600.2,684.2",
   districts:["Mandi Bahauddin", "Jhelum", "Sargodha"]},
  {name:"Chenab @ Marala", lat:32.67, lon:74.46, rp2:271.1, rp5:495.4, rp20:786.3, obsMax:1275.4, yrs:29,
   bins:"18.8,25.1,36.6,43.6;21.2,32.6,39.5,46.5;26.4,37.2,46.1,56.2;30.8,47.3,83.5,104.9;33.3,63.7,97.5,110.2;33.9,62.4,91.5,104.3;33.8,61.2,80.6,94.7;35.7,56.0,64.6,87.2;34.6,51.7,59.5,75.3;28.7,44.1,52.8,60.4;23.6,38.6,47.0,52.2;28.2,43.3,52.2,91.8;37.7,65.8,94.0,129.6;54.2,102.6,130.1,166.6;90.6,127.6,160.8,187.9;89.2,131.4,166.7,210.4;76.1,124.6,152.4,240.4;60.7,94.7,118.7,161.0;44.2,66.8,82.4,103.6;33.4,47.4,58.2,80.7;26.4,36.6,44.0,62.8;21.5,29.1,35.2,50.7;20.1,26.4,33.2,45.3;19.1,25.0,30.7,38.7",
   districts:["Sialkot", "Gujrat", "Narowal"]},
  {name:"Chenab @ Khanki", lat:32.4, lon:73.97, rp2:2176.4, rp5:3070.6, rp20:4230.5, obsMax:5419.0, yrs:29,
   bins:"178.9,216.5,249.6,276.3;179.3,237.3,257.2,274.4;202.2,249.7,270.6,305.9;222.9,282.8,427.6,493.1;243.9,360.1,452.7,523.8;266.9,371.6,463.1,530.9;294.8,413.2,461.2,565.0;313.1,430.7,464.2,569.2;337.1,445.7,481.6,550.6;291.4,408.6,458.4,533.1;260.8,388.2,446.5,562.9;427.6,770.6,977.6,1178.3;898.5,1400.5,1814.5,2061.5;1147.2,1617.8,1861.1,2130.1;1110.7,1530.8,1736.0,1903.6;994.4,1354.2,1580.3,1772.4;836.5,1161.0,1351.7,1597.1;664.3,870.0,1035.6,1169.6;491.0,642.0,745.5,828.9;381.8,480.9,553.1,613.3;299.6,380.1,424.6,470.4;238.3,297.7,330.7,371.0;203.6,244.6,278.4,321.0;186.1,219.3,244.8,281.2",
   districts:["Gujranwala", "Hafizabad", "Mandi Bahauddin"]},
  {name:"Chenab @ Trimmu", lat:31.14, lon:72.14, rp2:3600.3, rp5:4984.6, rp20:6780.1, obsMax:8297.5, yrs:29,
   bins:"457.1,536.0,596.9,664.9;459.3,576.0,656.1,694.0;493.3,625.6,687.6,742.0;553.6,720.4,851.3,1086.4;628.5,879.6,1102.1,1282.5;703.7,1016.2,1154.0,1359.8;834.6,1116.4,1284.3,1427.9;947.4,1200.2,1304.0,1427.9;994.4,1247.0,1352.9,1421.3;716.8,1108.2,1262.6,1356.7;343.4,656.7,804.8,1004.1;795.2,1408.3,1715.3,2107.6;1752.9,2510.9,3138.1,3529.2;2253.2,3113.6,3395.2,3733.2;2161.7,2943.4,3239.4,3757.4;1895.7,2607.6,3197.9,3825.5;1613.4,2343.2,2905.7,3444.1;1293.2,1752.9,2186.8,2505.1;987.5,1305.2,1589.0,1734.4;862.0,1056.3,1183.7,1412.8;731.8,904.7,992.1,1116.4;594.7,731.8,811.8,937.9;496.7,606.0,685.4,787.9;470.0,543.5,631.7,709.6",
   districts:["Jhang", "Chiniot", "Sargodha"]},
  {name:"Ravi @ Shahdara", lat:31.61, lon:74.28, rp2:1242.8, rp5:2051.4, rp20:3100.2, obsMax:3474.4, yrs:29,
   bins:"76.5,93.3,112.1,124.0;77.0,101.4,120.1,137.9;79.7,107.8,142.4,211.0;77.0,132.2,215.6,313.6;72.6,148.7,231.4,304.5;63.3,135.5,193.4,247.0;66.6,138.1,172.7,207.4;90.8,141.3,164.4,187.4;89.2,142.6,169.6,188.1;4.2,94.7,129.8,174.9;1.2,1.4,2.3,5.4;1.5,15.4,174.0,300.6;70.1,325.7,503.2,666.7;253.1,490.6,629.7,762.5;293.4,495.8,606.9,766.4;253.1,427.7,548.0,755.9;188.7,313.3,417.6,663.1;110.4,215.4,287.8,496.5;91.0,179.3,235.4,286.1;143.5,195.9,228.2,268.4;126.1,166.7,193.4,219.3;104.7,133.0,157.1,178.4;90.2,112.2,130.2,151.2;81.4,98.4,112.9,127.1",
   districts:["Lahore", "Sheikhupura", "Nankana Sahib"]},
  {name:"Ravi @ Balloki", lat:31.32, lon:73.96, rp2:1582.9, rp5:2677.0, rp20:4096.2, obsMax:5295.6, yrs:29,
   bins:"97.4,119.3,142.9,166.6;98.3,132.7,158.3,182.0;103.2,143.2,186.7,270.5;97.9,174.3,281.2,414.5;86.3,203.3,298.0,408.8;71.8,175.4,250.3,319.8;73.1,161.6,214.3,260.7;104.7,160.1,199.4,226.5;101.3,161.0,200.7,220.1;7.8,106.8,148.7,200.8;0.8,1.0,2.4,7.8;1.0,16.4,185.7,322.4;62.0,362.9,575.2,764.6;284.1,586.8,728.8,911.0;350.6,596.6,738.3,929.7;287.4,529.4,684.2,961.9;216.8,375.0,541.3,1018.9;119.0,254.5,357.9,606.7;98.3,213.4,277.0,350.4;183.1,244.7,279.5,346.1;173.2,223.0,257.2,294.3;137.4,173.3,202.5,226.4;113.3,139.9,161.2,184.3;102.0,122.6,142.4,157.1",
   districts:["Kasur", "Okara", "Nankana Sahib"]},
  {name:"Ravi @ Sidhnai", lat:30.6, lon:72.15, rp2:1479.5, rp5:2751.6, rp20:4401.9, obsMax:6279.6, yrs:29,
   bins:"106.9,128.1,152.8,180.3;106.9,142.6,175.1,199.8;108.7,155.8,199.1,287.5;91.9,190.5,309.3,442.2;70.9,228.6,323.8,443.4;37.5,190.4,283.1,357.1;36.0,163.5,228.4,283.8;82.6,145.6,200.4,229.5;79.9,146.0,200.8,225.5;0.2,85.0,134.0,198.3;0.0,0.0,0.0,0.1;0.0,0.3,36.9,185.8;0.6,238.3,430.0,628.5;157.5,496.0,690.2,878.5;253.1,525.0,704.0,882.1;194.0,452.1,627.4,903.1;133.0,292.5,493.1,955.6;46.4,176.6,280.1,561.1;16.9,179.5,266.9,392.2;205.5,277.6,316.1,399.5;223.9,282.1,319.6,362.1;168.8,215.1,249.7,281.6;126.9,155.4,177.5,199.3;113.0,134.0,154.6,171.0",
   districts:["Khanewal", "Multan", "Toba Tek Singh"]},
  {name:"Sutlej @ Ganda Singh", lat:31.02, lon:74.53, rp2:1136.3, rp5:1763.2, rp20:2576.3, obsMax:3555.3, yrs:29,
   bins:"343.4,414.1,456.7,479.6;354.6,413.0,452.5,474.3;353.0,403.6,442.6,467.8;346.5,404.5,446.9,492.9;331.7,410.1,472.1,545.5;324.1,381.8,441.8,514.5;316.7,361.2,405.4,460.5;309.5,354.6,387.0,427.6;307.3,338.6,360.9,413.9;228.1,312.3,332.4,353.6;8.7,111.1,162.7,205.3;72.0,232.9,283.4,332.3;273.2,383.1,485.2,570.5;345.7,520.4,690.8,995.8;430.5,768.8,1088.9,1327.0;494.4,1076.0,1314.8,1470.6;638.7,1030.3,1154.0,1445.1;667.3,905.1,1021.4,1382.0;578.4,777.8,945.7,1228.8;513.0,655.1,799.2,908.5;465.7,584.1,653.6,721.8;414.9,520.2,581.9,640.5;373.1,450.9,515.7,580.8;349.8,412.2,463.5,508.1",
   districts:["Kasur", "Pakpattan"]},
  {name:"Sutlej @ Sulemanki", lat:30.42, lon:73.87, rp2:1157.0, rp5:1754.3, rp20:2529.2, obsMax:3356.4, yrs:29,
   bins:"355.4,425.8,466.7,498.8;366.3,425.8,465.2,493.3;364.6,418.8,455.7,487.2;356.3,418.8,463.5,508.3;338.6,423.6,494.4,575.5;331.7,399.1,465.2,538.3;325.6,370.7,420.9,482.5;318.1,367.1,398.9,442.4;317.4,350.7,377.1,427.2;235.1,323.3,343.8,366.3;0.7,68.8,126.6,164.4;24.5,210.8,272.9,324.8;268.1,396.7,501.6,604.1;358.8,535.0,741.3,1006.4;433.5,789.7,1089.11,1326.4;507.2,1078.0,1326.4,1495.2;640.2,1043.7,1170.1,1457.8;668.9,913.5,1028.9,1413.7;578.4,781.0,951.4,1252.3;525.0,673.5,809.2,911.0;486.5,607.7,679.1,743.4;430.5,537.3,602.4,665.5;384.5,465.7,526.2,598.5;360.4,422.8,475.0,517.8",
   districts:["Pakpattan", "Bahawalnagar", "Okara"]},
  {name:"Sutlej @ Islam", lat:29.83, lon:72.55, rp2:1130.7, rp5:1726.4, rp20:2499.0, obsMax:3364.1, yrs:29,
   bins:"357.1,424.6,468.5,496.3;368.0,427.6,464.2,495.4;365.4,419.7,455.7,488.3;354.6,416.8,463.5,511.6;336.3,423.8,495.6,573.9;329.4,399.1,469.3,536.8;322.6,367.1,422.8,485.4;317.4,364.6,397.1,442.6;316.0,350.6,378.0,428.5;232.9,322.6,344.1,365.3;0.0,32.9,76.6,109.5;0.1,156.3,228.3,286.9;232.3,366.3,469.5,559.3;334.0,512.3,692.7,965.0;407.3,751.0,1058.2,1284.9;479.8,1047.6,1298.6,1467.9;608.5,1019.9,1145.6,1443.1;646.1,894.4,1017.1,1351.1;563.9,766.7,938.3,1248.3;525.0,673.8,804.4,898.1;494.4,619.9,687.0,752.7;436.5,547.3,613.0,670.4;388.9,470.2,529.9,598.8;362.1,426.6,476.5,523.3",
   districts:["Bahawalpur", "Bahawalnagar", "Vehari", "Lodhran"]},
  {name:"Panjnad Headworks", lat:29.24, lon:70.83, rp2:5310.4, rp5:7774.6, rp20:10971.1, obsMax:14059.5, yrs:29,
   bins:"954.0,1090.4,1240.7,1320.3;956.2,1153.0,1293.2,1360.4;978.5,1198.5,1325.2,1417.4;985.3,1296.2,1537.2,1913.3;996.7,1509.1,1848.3,2327.1;1093.0,1559.3,1872.3,2168.7;1187.5,1606.7,1831.3,2100.8;1320.3,1639.6,1779.7,2063.4;1379.4,1681.7,1855.1,2016.4;900.6,1475.4,1747.2,1872.3;120.1,459.3,630.2,825.4;575.8,1315.4,1703.6,2230.5;1852.5,2767.2,3638.2,4233.5;2665.9,3925.4,4622.8,5247.1;2916.4,3945.4,4752.4,5256.8;2665.9,3864.5,4836.3,5653.7;2420.0,3414.1,4565.7,5865.9;2017.4,2772.3,3347.1,4382.4;1587.5,2137.9,2624.4,3272.4;1583.9,1944.4,2166.7,2728.0;1547.8,1848.3,2024.8,2336.8;1278.4,1588.3,1751.3,1919.4;1065.6,1275.4,1408.3,1575.9;992.1,1124.1,1269.6,1374.9",
   districts:["Rahim Yar Khan", "Bahawalpur", "Muzaffargarh", "Lodhran"]}
];



const PK_RIVER_TRIBUTARY = new Set(['Shyok','Hunza','Gilgit','Swat','Panjkora','Chitral','Kunhar','Kurram','Gomal','Soan','Poonch']);


var AGN_RIVER_LEVEL_SCALE = {"version": "rls-91.17.113", "knots": [["p80", 0.0], ["p95", 0.04], ["rp2", 0.1], ["rp5-", 0.24], ["rp5", 0.45], ["rp20-", 0.64], ["rp20", 0.65], ["rp20x1.5", 0.82]]};    
const PK_RIVER_REACHES = {"tarbela":{"name":"Tarbela Dam","lat":34.075005,"lon":72.675,"rp2":9920.4,"rp5":12425.7,"rp20":15675.7,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"405.4,464.6,517.8,540.5;407.3,513.3,547.3,569.2;438.0,540.0,594.8,679.8;494.4,677.9,779.9,877.6;596.0,715.1,843.3,980.0;649.1,876.4,983.5,1075.6;750.6,911.4,1037.5,1224.2;821.2,999.0,1080.4,1157.8;818.4,999.0,1176.6,1280.0;967.3,1204.6,1357.3,1530.1;1294.7,1629.8,1950.6,2157.8;2531.2,4229.6,6026.2,6575.6;6575.6,8903.3,10496.8,12219.8;6575.6,9081.4,10542.9,11675.2;6066.4,6762.9,7621.5,9100.3;4086.9,5251.9,6044.1,6575.6;2899.7,3599.8,4008.6,4294.4;2008.1,2465.0,2772.3,3004.4;1411.5,1656.3,1817.0,1966.4;991.0,1126.2,1208.8,1268.7;676.6,771.7,841.6,880.0;521.4,610.2,660.6,705.8;425.6,496.7,535.5,568.6;405.4,466.7,502.5,569.2"},"attock":{"name":"Attock","lat":33.925003,"lon":72.225006,"rp2":9944.6,"rp5":12440.1,"rp20":15677.3,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"415.9,473.2,536.0,558.8;422.2,527.5,569.6,592.1;450.3,557.7,615.9,711.1;515.4,697.6,809.6,947.0;617.7,754.4,893.8,1063.4;665.8,918.2,1051.2,1144.8;771.7,943.5,1090.9,1277.7;842.3,1027.0,1103.1,1192.0;834.6,1004.1,1199.1,1340.7;968.4,1198.5,1366.7,1530.1;1290.2,1611.1,1945.3,2154.5;2496.5,4225.7,5987.3,6590.7;6605.9,8952.6,10410.3,12176.3;6636.4,9144.3,10699.4,11725.0;6122.5,6869.7,7727.6,9140.1;4158.1,5334.8,6179.2,6621.2;2950.2,3671.8,4075.6,4360.7;2040.7,2516.7,2822.6,3059.9;1427.9,1689.4,1849.1,2001.6;1008.2,1145.6,1226.4,1290.2;690.8,787.9,857.6,903.3;531.1,627.4,676.0,723.9;429.5,503.9,543.8,581.5;414.4,475.9,515.4,586.3"},"kalabagh":{"name":"Kalabagh","lat":32.975006,"lon":71.52501,"rp2":11833.7,"rp5":14744.1,"rp20":18519.4,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"516.6,625.6,712.8,777.4;535.4,686.4,766.4,831.3;577.1,744.4,877.0,1137.8;678.2,1070.0,1257.9,1498.0;844.3,1229.8,1523.4,1763.2;992.1,1461.2,1819.1,2055.4;1255.0,1697.2,2118.8,2367.9;1537.2,1946.2,2123.7,2249.1;1523.0,1986.9,2349.7,2729.9;1668.2,2069.1,2322.3,2547.9;1908.9,2386.8,2661.6,3002.0;3238.7,4946.7,6855.5,7783.0;7869.5,10572.1,12107.8,13820.3;8193.1,11090.8,12588.2,13937.0;7602.3,8632.8,9626.3,11005.6;5307.8,6759.8,7692.1,8231.0;3902.9,4811.8,5381.7,6266.6;2750.1,3364.1,3791.3,4148.1;1913.3,2316.4,2540.0,2750.7;1382.6,1624.5,1747.6,1852.5;985.3,1137.2,1253.9,1351.7;733.5,913.5,1018.1,1062.2;578.4,692.7,767.4,833.8;526.2,632.0,713.0,826.7"},"chashma":{"name":"Chashma Barrage","lat":32.425003,"lon":71.32501,"rp2":12226.0,"rp5":15510.2,"rp20":19770.5,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"544.8,659.1,747.2,831.9;571.8,721.8,808.5,878.1;612.1,778.8,895.2,1131.9;716.8,1113.3,1309.4,1550.0;878.0,1279.0,1566.5,1828.4;1031.8,1520.2,1909.3,2187.3;1305.2,1781.4,2266.3,2522.3;1604.1,2041.7,2217.2,2362.5;1569.4,2065.3,2437.9,2840.5;1709.0,2161.7,2388.5,2641.7;1937.7,2410.0,2679.4,3062.6;3231.2,4831.8,6653.3,7757.1;7933.1,10547.7,12085.5,13777.4;8326.2,11193.4,12649.3,14033.6;7708.0,8854.2,10178.0,11333.9;5419.0,6901.4,7783.0,8457.7;4026.2,4958.1,5533.8,6500.3;2807.7,3448.9,3889.4,4273.6;1971.4,2387.9,2614.8,2846.8;1444.4,1689.4,1821.6,1934.1;1038.9,1193.5,1296.2,1415.8;782.4,976.2,1064.6,1117.4;617.0,737.9,818.6,889.2;563.9,672.0,762.3,867.6"},"taunsa":{"name":"Taunsa Barrage","lat":30.525002,"lon":70.82501,"rp2":12207.4,"rp5":15701.3,"rp20":20233.4,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"567.9,686.7,765.3,845.5;592.6,730.1,825.0,884.4;628.5,777.4,903.5,1082.3;721.8,1118.4,1368.0,1594.9;869.0,1270.2,1551.7,1906.9;1051.0,1541.4,1935.9,2222.8;1285.8,1822.9,2243.4,2625.1;1562.2,2060.6,2279.9,2406.4;1602.2,2079.7,2453.7,2886.7;1658.6,2113.5,2387.4,2659.7;1781.4,2286.7,2443.0,2703.0;2879.7,4208.2,5579.9,7286.0;7788.3,10403.0,12024.4,13851.5;8364.7,11312.6,12626.0,14036.9;7815.3,9140.1,10616.0,11765.3;5713.8,7334.0,8170.5,9662.9;4182.1,5144.2,5846.9,6901.4;2926.5,3629.8,4126.6,4485.4;2073.9,2513.2,2778.7,2967.9;1553.2,1791.3,1931.0,2067.7;1110.7,1284.9,1403.8,1517.1;866.0,1051.4,1113.3,1160.2;656.7,801.4,892.7,956.2;600.2,723.1,806.2,896.4"},"guddu":{"name":"Guddu Barrage","lat":28.425003,"lon":69.675,"rp2":16224.1,"rp5":20465.1,"rp20":25966.3,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"1526.6,1769.1,1896.6,2001.6;1567.6,1836.4,2022.5,2157.0;1582.1,1917.7,2065.3,2220.0;1598.6,2225.4,2759.6,3333.3;1681.7,2656.1,3097.1,3789.1;1971.4,2924.5,3741.8,4216.5;2370.4,3484.0,3945.4,4345.1;2781.9,3693.9,3944.5,4153.8;2960.4,3646.5,4074.7,4360.7;2678.2,3487.2,3818.4,4167.7;1414.8,1887.9,2129.1,2539.2;2650.6,4340.1,5238.6,6933.3;8648.7,12217.0,14587.1,16051.8;10838.3,15176.5,16981.4,18536.5;10788.5,12970.8,14397.0,16846.2;8728.7,11302.2,12737.0,15134.6;6575.6,8936.2,11485.8,13381.9;5063.1,6741.2,7653.2,8506.5;3766.0,4680.7,5271.3,6098.6;3234.9,3734.9,4259.9,4783.6;2856.6,3227.5,3618.1,3901.1;2305.8,2677.0,2916.4,3105.7;1797.9,2118.3,2312.1,2561.1;1630.2,1891.3,2106.2,2311.1"},"sukkur":{"name":"Sukkur Barrage","lat":27.675003,"lon":68.82501,"rp2":15970.3,"rp5":20206.3,"rp20":25701.2,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"1526.6,1765.0,1895.7,1974.1;1551.4,1795.4,2009.0,2133.0;1553.2,1900.1,2022.5,2161.7;1569.4,2155.7,2665.9,3079.4;1626.4,2618.4,3063.8,3722.9;1911.1,2865.8,3715.2,4130.9;2313.7,3434.6,3862.7,4289.9;2668.9,3688.8,3934.5,4145.2;2933.3,3613.1,4036.4,4289.9;2629.3,3425.1,3774.7,4129.5;1091.7,1583.9,1769.9,2198.4;2248.1,3811.4,4636.7,6266.6;8335.8,11862.2,14130.9,15637.8;10726.5,14995.9,16903.4,18368.6;10751.3,13006.7,14520.1,17042.2;8779.1,11203.7,12678.4,14216.2;6552.9,8952.6,11520.3,13463.9;5063.1,6806.7,7704.5,8662.7;3774.7,4730.5,5394.2,6140.9;3249.9,3748.7,4274.6,4785.3;2896.3,3252.9,3663.4,3961.8;2359.5,2735.5,2977.5,3183.2;1822.9,2162.7,2364.9,2565.3;1639.6,1900.1,2122.2,2327.1"},"kotri":{"name":"Kotri Barrage","lat":25.425003,"lon":68.27501,"rp2":16300.4,"rp5":20739.9,"rp20":26498.7,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"1533.6,1783.0,1909.7,1989.7;1516.0,1746.4,1989.7,2122.7;1530.1,1848.3,1989.7,2064.4;1530.1,1992.4,2372.6,2895.0;1528.3,2541.1,3075.2,3608.3;1804.1,2810.9,3606.5,3999.8;2209.6,3340.9,3742.7,4106.2;2482.1,3604.8,3944.5,4206.3;2889.7,3557.0,3815.9,4192.2;2662.8,3428.3,3758.2,4170.6;748.0,1224.8,1471.7,1892.7;1582.1,2755.8,4026.2,4770.5;7235.0,11297.0,13522.8,15110.6;10530.7,14933.8,16864.5,18449.2;10788.5,13072.8,15106.8,17146.6;9045.9,11485.8,12976.8,17950.5;6697.9,9314.5,12510.3,14327.6;5151.3,6926.9,8004.8,9111.8;3853.8,4885.5,5690.2,6255.1;3272.4,3774.7,4328.1,4805.7;2970.7,3367.2,3745.3,4094.4;2431.2,2877.7,3083.6,3292.1;1904.5,2279.3,2491.3,2635.3;1658.6,1928.3,2175.7,2337.0"},"besham":{"name":"Besham Qila","lat":34.875,"lon":72.875015,"rp2":10070.5,"rp5":12263.3,"rp20":15107.6,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"360.4,398.0,416.8,431.7;348.1,390.7,402.6,422.6;356.3,390.0,421.8,436.1;372.2,452.7,519.0,550.6;405.9,481.2,521.4,564.8;465.7,592.2,688.3,749.1;557.5,672.3,747.5,849.3;638.7,776.0,856.4,951.8;678.2,868.4,983.5,1095.1;892.3,1163.7,1330.1,1445.1;1290.2,1678.6,1973.2,2216.0;2709.2,5050.3,6966.9,8071.4;7235.0,9288.7,10567.2,12421.2;6667.1,8899.2,10400.6,11588.1;5295.6,6590.7,7439.5,9007.5;3822.8,4776.5,5357.0,5719.1;2699.8,3304.2,3697.3,3916.4;1867.5,2274.1,2545.8,2740.3;1320.3,1530.1,1654.8,1807.4;912.1,1043.7,1128.8,1196.8;611.4,698.8,752.7,793.3;468.9,537.3,570.0,609.9;395.3,443.8,471.1,494.8;356.3,416.3,440.3,461.1"},"partab":{"name":"Partab Bridge","lat":35.725006,"lon":74.57501,"rp2":8385.4,"rp5":10262.2,"rp20":12696.8,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"282.8,314.8,333.3,342.2;275.1,303.8,317.4,324.8;270.0,296.2,308.0,313.1;271.3,300.3,315.2,337.8;275.7,296.9,314.5,332.8;285.4,324.8,364.7,407.4;305.9,345.3,388.9,419.3;328.6,387.3,430.6,484.5;342.6,445.9,483.3,531.1;452.4,601.0,691.1,766.8;655.9,924.1,1129.8,1357.6;1750.9,3530.8,5432.8,6419.2;5609.5,7193.5,8434.3,10197.8;5469.2,7317.1,8494.7,9340.2;4465.8,5609.5,6295.5,7438.6;3186.9,4072.8,4592.0,4965.5;2169.2,2748.2,3125.8,3340.9;1507.3,1848.3,2063.4,2273.3;1041.3,1223.6,1338.7,1455.9;718.5,830.8,900.6,960.3;482.1,557.5,594.1,635.2;360.4,415.9,443.6,460.3;304.5,360.4,371.4,384.1;277.6,335.5,351.1,362.0"},"kachura":{"name":"Kachura (Skardu)","lat":35.425003,"lon":75.425,"rp2":5477.4,"rp5":6815.6,"rp20":8551.5,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"173.2,215.3,229.7,232.7;183.3,208.0,220.3,224.4;182.9,205.1,214.8,217.3;182.2,205.5,211.5,223.1;185.6,204.1,211.8,222.4;193.1,209.9,221.9,245.6;201.3,216.8,237.9,248.2;208.9,236.1,246.7,270.1;215.0,267.7,298.4,323.8;277.6,380.4,436.6,477.7;416.4,571.8,664.6,774.4;970.6,1998.9,3019.6,3864.5;3530.8,4624.9,5295.6,6308.6;3714.4,5006.3,5741.5,6281.8;3032.9,3909.2,4415.7,4858.0;2166.7,2863.2,3243.1,3557.8;1419.7,1839.8,2151.8,2448.6;952.9,1206.8,1371.8,1551.2;656.7,778.8,850.5,927.1;457.1,537.3,578.0,611.4;301.7,363.1,392.6,409.2;212.8,271.4,292.5,307.5;174.0,231.8,249.6,262.6;165.5,224.6,236.7,245.0"},"mangla":{"name":"Mangla Dam","lat":33.175003,"lon":73.625015,"rp2":1908.4,"rp5":2695.1,"rp20":3715.6,"fitRefused":false,"notRiver":true,"notRiverWhy":"the model flow does not track floods at this regulated dam: on all 7 days the river was at Low flood or higher in the 2024-25 bulletins, the model stayed below its 5-year flow (station-lake/reports/river_ladder_evidence.md)","bins":"230.2,300.4,341.9,387.2;247.6,330.4,381.2,426.6;279.5,349.9,419.0,482.7;321.9,445.7,614.5,706.0;394.8,539.0,633.2,727.0;434.5,582.5,702.1,779.0;544.8,692.7,802.5,884.3;619.2,755.5,846.2,870.2;624.2,766.7,846.8,971.7;589.2,754.8,810.1,870.5;484.3,661.2,698.8,756.8;723.4,951.8,1116.4,1303.8;1104.4,1451.8,1677.8,1932.8;1122.3,1489.0,1697.6,1840.4;1087.9,1333.1,1506.3,1785.0;946.3,1199.6,1435.2,1835.8;797.0,1088.9,1339.3,1539.1;632.9,838.1,1029.2,1155.0;484.3,599.3,707.9,839.0;412.1,493.1,561.1,654.7;337.8,402.8,491.7,539.8;287.4,355.0,416.6,453.5;251.3,306.9,373.1,426.0;233.7,292.2,335.3,358.3"},"rasul":{"name":"Rasul Barrage","lat":32.675003,"lon":73.475006,"rp2":3618.6,"rp5":5006.2,"rp20":6806.1,"fitRefused":false,"notRiver":true,"notRiverWhy":"the model flow runs about 8 times the observed flow here and no flood day was observed in 2024-25 to test it: no level is claimed","bins":"445.7,515.4,586.8,649.4;448.3,548.8,639.0,683.1;475.4,594.9,655.1,706.2;531.1,692.7,835.0,1114.3;607.8,831.9,1063.4,1267.6;672.0,956.2,1131.4,1355.3;831.7,1100.0,1305.5,1439.2;935.5,1185.3,1264.3,1387.8;972.9,1218.0,1342.4,1431.1;850.1,1171.7,1275.7,1370.0;453.5,720.1,871.0,924.9;907.9,1320.9,1548.2,1748.3;1827.1,2507.4,2927.2,3326.4;2287.2,3206.7,3499.3,3810.1;2214.6,2911.1,3205.3,3454.8;1973.7,2554.1,3125.1,3697.3;1628.3,2393.4,2925.9,3383.9;1335.6,1817.0,2171.2,2429.8;989.8,1263.8,1540.7,1672.0;852.1,1017.6,1134.0,1344.9;687.6,829.2,929.7,1022.3;563.9,681.3,747.5,816.2;480.9,566.8,646.4,786.0;456.6,527.5,603.7,684.3"},"marala":{"name":"Marala Headworks","lat":32.675003,"lon":74.425,"rp2":1991.6,"rp5":2612.0,"rp20":3416.8,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"171.2,199.0,229.8,253.4;173.6,218.8,238.6,257.3;191.5,228.6,246.2,261.2;205.5,256.4,359.1,437.1;229.9,325.7,414.0,460.4;246.7,341.0,428.8,486.7;280.5,379.5,448.0,524.2;300.3,411.3,448.0,528.1;324.5,434.7,470.1,525.1;307.3,413.4,461.4,517.9;274.4,363.8,443.9,479.8;399.4,569.4,750.8,877.3;855.1,1195.2,1567.9,1826.5;1126.2,1617.1,1861.5,2079.4;1096.7,1467.9,1660.1,1836.0;979.6,1272.5,1454.8,1655.2;808.1,1117.4,1270.2,1509.0;663.5,851.7,973.1,1113.2;496.7,615.0,698.2,789.2;383.6,459.3,521.0,600.3;288.7,350.6,382.7,453.6;231.8,275.8,314.2,355.9;198.5,232.8,270.5,304.1;180.1,207.4,231.3,263.6"},"khanki":{"name":"Khanki Headworks","lat":32.425003,"lon":73.975006,"rp2":2173.5,"rp5":3083.5,"rp20":4263.9,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"179.7,210.7,247.7,273.5;181.6,233.9,257.9,278.3;201.1,245.7,265.7,286.4;217.8,271.3,399.5,488.1;242.5,353.2,445.9,518.5;256.0,359.7,459.9,531.2;292.4,400.2,474.9,569.9;308.0,422.6,457.2,569.9;331.3,445.9,476.5,545.7;306.3,414.3,467.9,533.8;247.6,338.8,421.8,461.4;384.9,558.5,726.9,881.4;877.0,1204.6,1584.3,1931.4;1167.2,1655.5,1882.7,2197.6;1121.0,1527.3,1713.4,1935.4;1018.8,1342.4,1558.9,1757.5;851.1,1190.8,1357.6,1657.7;693.2,894.4,1041.1,1190.1;515.4,640.2,738.3,854.1;403.6,482.1,546.9,644.4;308.7,374.0,414.9,490.9;245.0,293.4,328.3,374.0;208.9,246.3,281.8,319.6;189.1,221.8,240.9,277.3"},"qadirabad":{"name":"Qadirabad Headworks","lat":32.325005,"lon":73.675,"rp2":2187.4,"rp5":3097.4,"rp20":4277.9,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"181.0,213.0,249.7,273.8;182.4,235.7,262.7,280.2;201.5,246.7,264.5,291.1;219.3,272.3,397.3,482.3;242.8,355.4,451.1,528.2;255.5,362.1,462.7,531.4;292.4,403.2,473.7,563.9;308.7,423.6,456.2,571.8;331.3,447.8,476.6,546.1;305.2,413.0,468.9,537.4;225.2,317.4,400.9,443.6;372.2,527.0,679.5,862.2;875.0,1187.5,1613.4,1883.5;1159.1,1658.6,1885.3,2167.2;1130.1,1537.2,1721.7,1938.8;1024.7,1358.6,1581.0,1777.7;854.1,1201.8,1377.2,1681.7;698.0,902.2,1053.4,1208.9;517.8,645.2,746.8,868.0;411.1,489.2,553.6,654.9;318.9,388.2,424.6,501.7;250.8,300.4,333.4,381.6;210.8,248.7,284.5,321.6;190.9,224.4,243.9,283.9"},"trimmu":{"name":"Trimmu Barrage","lat":31.125,"lon":72.125015,"rp2":3595.7,"rp5":5004.5,"rp20":6831.9,"fitRefused":false,"notRiver":true,"notRiverWhy":"the model flow under-calls here: on all 11 days at Low flood or higher in the 2024-25 bulletins (8 of them High or worse) the model stayed below its 5-year flow","bins":"459.3,527.9,592.8,661.2;460.3,557.5,640.5,700.6;484.9,609.9,669.0,714.4;536.0,687.3,807.8,1006.9;614.2,827.7,1075.5,1300.8;680.6,948.3,1142.1,1312.1;830.8,1108.2,1281.6,1446.2;934.4,1190.2,1272.5,1411.1;980.8,1227.6,1342.1,1433.7;846.2,1176.6,1290.8,1376.4;247.6,507.9,655.3,731.8;702.9,1064.6,1402.1,1519.5;1681.7,2403.4,2810.9,3158.8;2250.7,3197.9,3540.6,3820.2;2219.8,2931.2,3214.1,3443.3;1966.9,2563.5,3173.0,3819.3;1652.9,2416.7,2979.6,3527.2;1343.3,1856.8,2241.3,2521.6;994.4,1302.8,1589.0,1728.4;884.1,1071.5,1206.0,1443.9;745.5,902.6,993.5,1091.7;605.7,728.8,793.3,898.9;499.0,597.4,665.2,795.7;474.3,550.8,653.8,721.5"},"balloki":{"name":"Balloki Headworks","lat":31.175003,"lon":73.875015,"rp2":36.4,"rp5":63.3,"rp20":98.1,"fitRefused":false,"notRiver":true,"notRiverWhy":"the model reach carries about 1 % of the observed flow (median model/observed 0.01 over the 2024-25 bulletin days, station-lake/reports/river_rarity_ffd_check.md): its rarity says nothing about the river","bins":"3.2,4.3,5.7,9.1;3.5,5.1,7.1,8.2;3.9,5.5,7.1,10.6;3.8,6.3,8.9,11.4;3.8,6.0,10.0,14.5;3.6,5.4,7.5,10.6;4.0,4.9,6.6,9.3;4.1,4.8,5.8,6.8;4.2,4.9,5.6,6.9;3.6,4.4,4.8,5.3;0.7,1.7,2.9,5.1;1.4,4.7,7.4,11.2;6.6,13.0,17.4,20.4;8.9,15.1,19.7,25.2;9.8,15.0,18.5,20.9;7.5,12.9,17.0,24.6;6.4,12.0,17.8,34.3;4.9,8.1,11.8,18.7;4.1,5.1,5.8,7.0;4.1,5.5,6.7,9.6;5.6,6.4,7.4,8.8;3.8,4.4,4.9,5.8;3.2,3.6,4.3,5.9;3.2,3.5,4.0,4.8"},"sidhnai":{"name":"Sidhnai Barrage","lat":30.675003,"lon":72.175,"rp2":55.5,"rp5":183.1,"rp20":348.6,"fitRefused":true,"notRiver":true,"notRiverWhy":"the model reach carries about 1 % of the observed flow (median model/observed 0.01 over the 2024-25 bulletin days, station-lake/reports/river_rarity_ffd_check.md): its rarity says nothing about the river","bins":"4.6,5.8,7.1,9.2;4.6,7.0,9.0,11.0;5.1,8.3,11.3,13.3;3.8,8.0,12.4,16.8;4.2,9.5,14.0,22.8;2.2,9.5,14.6,18.8;2.1,7.8,14.1,19.1;3.3,6.4,8.5,10.6;3.8,5.5,6.9,8.9;1.8,3.9,5.6,7.0;0.0,0.0,0.0,0.1;0.0,0.1,0.9,2.9;0.2,5.5,9.4,13.7;5.0,16.7,28.1,34.2;6.0,16.4,23.7,28.3;4.1,12.6,17.7,27.1;4.2,12.6,22.4,35.5;1.7,5.6,10.3,19.7;0.2,2.1,4.8,6.3;6.7,12.0,16.7,20.4;25.4,28.9,29.9,30.9;11.8,16.1,17.8,19.1;5.0,6.2,6.9,7.7;4.5,5.5,6.6,8.2"},"sulemanki":{"name":"Sulemanki Headworks","lat":30.375,"lon":73.82501,"rp2":1155.0,"rp5":1763.1,"rp20":2552.0,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"362.9,438.5,483.4,516.6;369.7,439.8,481.1,520.4;368.8,429.5,457.2,478.2;356.3,417.8,447.5,492.2;348.5,423.6,500.5,575.2;334.7,406.6,457.4,536.0;329.4,371.6,434.5,496.3;321.1,376.6,398.9,451.1;321.1,356.4,391.9,438.6;271.9,331.7,359.7,379.2;0.3,44.9,99.3,147.2;1.5,132.9,187.2,224.4;247.9,360.2,474.4,579.2;349.4,502.7,625.3,915.9;430.5,708.9,1058.5,1215.8;495.6,1040.4,1345.5,1495.6;619.2,1053.9,1147.2,1453.6;686.1,902.6,1045.6,1559.1;581.1,754.4,973.5,1190.9;537.9,699.5,816.9,911.9;488.8,624.5,679.1,733.9;437.5,538.8,591.9,647.0;381.8,467.8,524.8,604.2;361.7,417.6,472.6,531.1"},"islam":{"name":"Islam Headworks","lat":29.825005,"lon":72.52501,"rp2":1121.8,"rp5":1724.1,"rp20":2505.4,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"364.6,441.4,484.3,522.8;371.0,442.6,482.2,510.9;369.3,428.7,459.5,486.5;355.4,414.9,443.4,493.5;345.3,422.8,499.0,558.3;330.1,409.2,457.5,532.6;328.2,368.0,435.7,504.7;318.9,375.7,397.5,446.8;319.3,353.8,391.7,441.1;270.0,330.9,358.8,378.3;0.0,10.7,45.9,88.2;0.0,63.4,117.9,167.8;199.4,303.1,430.3,528.5;324.1,469.3,589.6,840.9;399.9,672.3,1031.8,1167.8;470.0,998.1,1329.5,1464.5;577.1,1034.1,1129.1,1434.0;661.2,877.6,1021.6,1502.2;561.3,737.6,961.9,1188.4;537.3,697.2,814.5,908.5;495.6,634.6,687.0,743.6;444.7,548.5,601.3,653.5;384.5,472.1,527.7,605.3;363.3,422.1,475.9,543.6"},"panjnad":{"name":"Panjnad Headworks","lat":29.325005,"lon":70.975006,"rp2":5323.1,"rp5":7857.8,"rp20":11145.8,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"958.4,1091.4,1224.7,1308.2;967.3,1147.7,1278.7,1354.3;989.8,1190.8,1308.2,1402.5;960.6,1201.3,1497.3,1858.5;987.5,1491.1,1825.0,2256.1;1052.2,1518.2,1874.9,2223.1;1183.4,1610.4,1870.1,2103.3;1317.3,1620.8,1733.2,2077.0;1368.3,1674.7,1836.0,2012.7;1114.6,1523.8,1810.8,1931.0;36.5,268.9,470.1,577.5;491.6,893.6,1297.4,1447.8;1689.4,2547.0,3243.1,3694.3;2572.4,3934.5,4538.4,5261.0;2873.1,3907.4,4731.6,5093.5;2584.2,3934.5,4875.4,5533.8;2473.6,3506.5,4677.4,6617.4;2112.5,2796.7,3418.0,4548.9;1565.8,2084.5,2510.9,3124.4;1604.1,1985.1,2222.8,2874.4;1580.2,1861.1,2034.2,2395.6;1314.2,1562.2,1695.7,1886.2;1078.0,1252.7,1399.9,1599.7;996.7,1145.6,1282.5,1399.4"},"nowshera":{"name":"Nowshera","lat":34.025,"lon":71.975006,"rp2":1545.4,"rp5":2059.2,"rp20":2725.6,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"61.5,101.2,128.5,161.2;67.2,105.0,134.0,158.3;81.3,135.5,210.0,262.8;124.3,268.1,331.2,423.8;214.0,356.1,451.0,515.4;281.5,476.8,619.6,755.8;426.1,636.7,849.4,970.4;593.3,850.5,1056.6,1114.7;670.4,950.0,1118.2,1401.7;690.8,932.7,1041.6,1296.9;603.0,827.3,923.9,1009.5;752.4,981.2,1131.4,1211.4;1219.4,1573.0,1770.3,1929.4;1306.7,1677.8,1967.3,2228.2;1135.3,1484.3,1785.5,1995.7;952.9,1244.1,1405.7,1587.7;748.0,1012.9,1190.5,1344.1;556.8,747.2,855.3,973.1;410.1,545.0,607.4,677.9;314.9,406.8,471.1,524.1;237.8,294.9,360.1,412.7;165.0,251.0,289.8,309.1;108.4,161.3,189.8,218.2;74.8,113.8,139.6,171.9"},"warsak":{"name":"Warsak Dam","lat":34.175003,"lon":71.425,"rp2":985.0,"rp5":1317.3,"rp20":1748.3,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"16.4,32.4,42.3,51.0;18.5,28.3,37.1,44.6;20.6,41.0,81.9,96.6;42.4,94.3,135.0,163.7;75.6,135.6,165.8,189.4;125.8,188.8,261.7,342.8;221.6,315.4,409.4,517.6;348.9,476.8,686.2,711.9;405.9,643.5,752.4,938.0;477.6,650.9,721.9,907.0;420.7,600.2,641.7,717.7;516.0,678.5,766.5,837.8;809.0,1066.6,1204.0,1331.1;814.6,1073.5,1275.4,1399.4;641.7,901.0,1091.2,1243.1;499.0,680.4,792.2,920.2;373.5,518.3,598.9,772.4;265.4,374.3,430.4,520.8;192.2,263.6,305.3,345.5;139.4,192.4,214.6,239.4;96.7,131.6,155.7,185.3;66.9,103.8,123.5,139.0;40.1,63.0,80.0,91.4;24.1,39.8,49.9,62.6"},"chenab_head":{"name":"Chenab at Akhnoor reach","lat":32.925003,"lon":74.725006,"rp2":1677.4,"rp5":2134.6,"rp20":2727.6,"fitRefused":false,"notRiver":false,"notRiverWhy":null,"bins":"137.0,153.7,172.9,183.4;137.0,162.0,172.4,180.1;144.9,164.7,172.0,182.9;153.2,186.4,213.5,244.8;174.0,219.9,258.5,272.5;196.7,235.2,271.3,299.6;223.9,278.2,319.6,348.6;251.3,327.9,358.8,374.0;272.5,363.9,398.0,416.4;267.8,358.3,392.6,418.9;256.6,327.9,382.1,418.3;356.3,521.6,676.6,823.5;786.0,1121.0,1472.0,1732.8;989.8,1449.8,1761.0,1913.7;940.9,1223.6,1411.9,1541.1;793.3,1027.0,1139.5,1255.3;658.9,878.0,967.5,1029.4;546.6,677.3,748.9,804.3;413.0,502.5,554.9,598.7;316.7,380.1,421.7,446.7;240.0,286.2,316.0,331.1;191.3,226.0,255.4,269.6;162.3,186.9,211.9,232.5;145.6,163.4,183.4,199.8"}};
(function(){ if(!PK_RIVER_REACHES) return;
  var MAP={'Indus @ Tarbela':'tarbela','Indus @ Besham':'besham','Indus @ Attock':'attock','Indus @ Kalabagh':'kalabagh','Indus @ Chashma':'chashma','Indus @ Taunsa':'taunsa',
    'Indus @ Guddu':'guddu','Indus @ Sukkur':'sukkur','Indus @ Kotri':'kotri','Kabul @ Nowshera':'nowshera','Jhelum @ Mangla':'mangla','Jhelum @ Rasul':'rasul',
    'Chenab @ Marala':'marala','Chenab @ Khanki':'khanki','Chenab @ Trimmu':'trimmu','Ravi @ Balloki':'balloki','Ravi @ Sidhnai':'sidhnai',
    'Sutlej @ Sulemanki':'sulemanki','Sutlej @ Islam':'islam','Panjnad Headworks':'panjnad'};
  window.agnReachIdOf=function(n){ return MAP[n]||null; };
  PK_RIVER_GAUGES_ALL.forEach(function(g){ var id=MAP[g.name], r=id&&PK_RIVER_REACHES[id]; if(!r) return;
    g.bakedLat=g.lat; g.bakedLon=g.lon; g.serverReach=id;
    if(r.fitRefused){ g.withheldWhy='the server refuses a return-period fit for this reach ('+r.name+')'; g.rp2=null; return; }
    if(r.notRiver){ g.withheldWhy=(r.notRiverWhy||'the model reach does not represent the river')+' ('+r.name+')'; g.rp2=null; return; }    
    g.lat=r.lat; g.lon=r.lon; g.rp2=r.rp2; g.rp5=r.rp5; g.rp20=r.rp20; if(r.bins) { g.bins=r.bins; delete g.__bins; } g.thresholdSource='data/river-rarity.json ('+r.name+', snapped cell)'; });
  

  var ADD={'Indus @ Sukkur':['Jacobabad','Naushahro Feroze','Shaheed Benazirabad'],'Chenab @ Trimmu':['Multan','Khanewal','Toba Tek Singh']};
  PK_RIVER_GAUGES_ALL.forEach(function(g){ var a=ADD[g.name]; if(!a) return; g.districts=(g.districts||[]).concat(a.filter(function(d){ return (g.districts||[]).indexOf(d)<0; })); });
})();
const PK_RIVER_GAUGES = PK_RIVER_GAUGES_ALL.filter(function(g){ return !PK_RIVER_TRIBUTARY.has(String(g.name).split(' @ ')[0]) && !g.withheldWhy; });
window.PK_RIVER_GAUGES_WITHHELD = PK_RIVER_GAUGES_ALL.filter(function(g){ return PK_RIVER_TRIBUTARY.has(String(g.name).split(' @ ')[0]) || g.withheldWhy; })
  .map(function(g){ return {name:g.name, districts:g.districts, why:g.withheldWhy||'mountain tributary: not represented at the global river-flow model grid (reanalysis maximum far below measured flood peaks)'}; });
window.PK_RIVER_GAUGES = PK_RIVER_GAUGES;



const RIVER_STATE = { loaded:false, loading:false, at:null, byDistrict:{}, gauges:[] };
window.RIVER_STATE = RIVER_STATE;

const RIVER_MIN_Q = 5;      

 


var AGN_FFD_LIMITS = {
  "Indus @ Tarbela":{station:"Tarbela",scalable:true,lacs:{low:2.5,medium:3.75,high:5,veryHigh:6.5,exceptional:8},m3s:{low:7079,medium:10619,high:14158,veryHigh:18406,exceptional:22653},designLacs:15,designM3s:42475,peakCusecs:832000,peakM3s:23560,peakDate:"30 Jul 2010"},
  "Indus @ Attock":{station:"Attock",scalable:true,lacs:{low:2.5,medium:3.75,high:5,veryHigh:6.5,exceptional:8},m3s:{low:7079,medium:10619,high:14158,veryHigh:18406,exceptional:22653}},
  "Indus @ Kalabagh":{station:"Kalabagh",scalable:true,lacs:{low:2.5,medium:3.75,high:5,veryHigh:6.5,exceptional:8},m3s:{low:7079,medium:10619,high:14158,veryHigh:18406,exceptional:22653},designLacs:9.5,designM3s:26901,peakCusecs:950005,peakM3s:26901,peakDate:"14 Jul 1942"},
  "Indus @ Chashma":{station:"Chashma",scalable:true,lacs:{low:2.5,medium:3.75,high:5,veryHigh:6.5,exceptional:8},m3s:{low:7079,medium:10619,high:14158,veryHigh:18406,exceptional:22653},designLacs:9.5,designM3s:26901,peakCusecs:1038873,peakM3s:29418,peakDate:"01 Aug 2010"},
  "Indus @ Taunsa":{station:"Taunsa",scalable:true,lacs:{low:2.5,medium:3.75,high:5,veryHigh:6.5,exceptional:8},m3s:{low:7079,medium:10619,high:14158,veryHigh:18406,exceptional:22653},designLacs:10,designM3s:28317,peakCusecs:959991,peakM3s:27184,peakDate:"02 Aug 2010"},
  "Indus @ Guddu":{station:"Guddu",scalable:true,lacs:{low:2,medium:3.5,high:5,veryHigh:7,exceptional:9},m3s:{low:5663,medium:9911,high:14158,veryHigh:19822,exceptional:25485},designLacs:12,designM3s:33980,peakCusecs:1199672,peakM3s:33971,peakDate:"15 Aug 1976"},
  "Indus @ Sukkur":{station:"Sukkur",scalable:true,lacs:{low:2,medium:3.5,high:5,veryHigh:7,exceptional:9},m3s:{low:5663,medium:9911,high:14158,veryHigh:19822,exceptional:25485},designLacs:9,designM3s:25485,peakCusecs:1166574,peakM3s:33034,peakDate:"15 Aug 1986"},
  "Indus @ Kotri":{station:"Kotri",scalable:true,lacs:{low:2,medium:3,high:4.5,veryHigh:6.5,exceptional:8},m3s:{low:5663,medium:8495,high:12743,veryHigh:18406,exceptional:22653},designLacs:8.75,designM3s:24777,peakCusecs:980329,peakM3s:27760,peakDate:"14 Aug 1956"},
  "Kabul @ Nowshera":{station:"Nowshera",scalable:true,lacs:{low:0.6,medium:0.9,high:1.4,veryHigh:2,exceptional:null},m3s:{low:1699,medium:2549,high:3964,veryHigh:5663,exceptional:null}},
  "Jhelum @ Mangla":{station:"Mangla",scalable:true,lacs:{low:0.75,medium:1.1,high:1.5,veryHigh:2.25,exceptional:3},m3s:{low:2124,medium:3115,high:4248,veryHigh:6371,exceptional:8495},designLacs:10.6,designM3s:30016,peakCusecs:1090000,peakM3s:30865,peakDate:"10 Sep 1992"},
  "Jhelum @ Rasul":{station:"Rasul",scalable:true,lacs:{low:0.75,medium:1.1,high:1.5,veryHigh:2.25,exceptional:3},m3s:{low:2124,medium:3115,high:4248,veryHigh:6371,exceptional:8495},designLacs:8.5,designM3s:24069,peakCusecs:952170,peakM3s:26962,peakDate:"10 Sep 1992"},
  "Chenab @ Marala":{station:"Marala",scalable:false,lowByFactor:"about 6",lacs:{low:1,medium:1.5,high:2,veryHigh:4,exceptional:6},m3s:{low:2832,medium:4248,high:5663,veryHigh:11327,exceptional:16990},designLacs:11,designM3s:31148,peakCusecs:1100000,peakM3s:31148,peakDate:"26 Aug 1957"},
  "Chenab @ Khanki":{station:"Khanki",scalable:false,lowByFactor:"about 5",lacs:{low:1,medium:1.5,high:2,veryHigh:4,exceptional:6},m3s:{low:2832,medium:4248,high:5663,veryHigh:11327,exceptional:16990},designLacs:11,designM3s:31148,peakCusecs:1086410,peakM3s:30764,peakDate:"27 Aug 1959"},
  "Chenab @ Trimmu":{station:"Trimmu",scalable:false,lowByFactor:"about 2",lacs:{low:1.5,medium:2,high:3,veryHigh:4.5,exceptional:6},m3s:{low:4248,medium:5663,high:8495,veryHigh:12743,exceptional:16990},designLacs:8.75,designM3s:24777,peakCusecs:944333,peakM3s:26740,peakDate:"04 Sep 1928"},
  "Ravi @ Shahdara":{station:"Shahdara",scalable:false,lowByFactor:"more than 10",lacs:{low:0.4,medium:0.65,high:0.9,veryHigh:1.35,exceptional:1.8},m3s:{low:1133,medium:1841,high:2549,veryHigh:3823,exceptional:5097},designLacs:2.5,designM3s:7079,peakCusecs:576000,peakM3s:16310,peakDate:"27 Sep 1988"},
  "Ravi @ Balloki":{station:"Balloki",scalable:false,lowByFactor:"about 50 against the gauge record and 93 against the 1988 peak",lacs:{low:0.4,medium:0.65,high:0.9,veryHigh:1.35,exceptional:1.8},m3s:{low:1133,medium:1841,high:2549,veryHigh:3823,exceptional:5097},designLacs:3.8,designM3s:10760,peakCusecs:389845,peakM3s:11039,peakDate:"28 Sep 1988"},
  "Ravi @ Sidhnai":{station:"Sidhnai",scalable:false,lowByFactor:"more than 10",lacs:{low:0.3,medium:0.46,high:0.6,veryHigh:0.9,exceptional:1.3},m3s:{low:850,medium:1303,high:1699,veryHigh:2549,exceptional:3681},designLacs:1.5,designM3s:4248,peakCusecs:330210,peakM3s:9350,peakDate:"02 Oct 1988"},
  "Sutlej @ Sulemanki":{station:"Suleimanki",scalable:false,lowByFactor:"about 1.5",lacs:{low:0.5,medium:0.8,high:1.2,veryHigh:1.75,exceptional:2.25},m3s:{low:1416,medium:2265,high:3398,veryHigh:4955,exceptional:6371},designLacs:3.25,designM3s:9203,peakCusecs:598872,peakM3s:16958,peakDate:"08 Oct 1955"},
  "Sutlej @ Islam":{station:"Islam",scalable:false,lowByFactor:"about 1.2",lacs:{low:0.5,medium:0.8,high:1.2,veryHigh:1.75,exceptional:2.25},m3s:{low:1416,medium:2265,high:3398,veryHigh:4955,exceptional:6371},designLacs:3,designM3s:8495,peakCusecs:492581,peakM3s:13948,peakDate:"11 Oct 1955"},
  "Panjnad Headworks":{station:"Panjnad",scalable:false,lowByFactor:"about 1.5",lacs:{low:1.5,medium:2.5,high:4,veryHigh:5.5,exceptional:7},m3s:{low:4248,medium:7079,high:11327,veryHigh:15574,exceptional:19822},designLacs:8.65,designM3s:24494,peakCusecs:802516,peakM3s:22725,peakDate:"17 Aug 1973"}
};


(function(){ try{ for(var i=PK_RIVER_GAUGES.length-1;i>=0;i--){ var g=PK_RIVER_GAUGES[i], F=AGN_FFD_LIMITS[g.name]; if(!F||F.scalable!==false) continue;
    var m=String(F.lowByFactor||'').match(/(more than|about)\s+(\d+(?:\.\d+)?)/); var x=m?+m[2]:null; if(x!=null && x>=10){ g.withheldWhy='the model reach carries under a tenth of the observed river flow ('+F.station+')'; PK_RIVER_GAUGES.splice(i,1); } } }catch(_){} })();
function riverBinIndex(){
  var mm=null, dd=null;
  try{ if(window.MACH_TIME && MACH_TIME.day){ var s=MACH_TIME.day(0); mm=+s.slice(5,7); dd=+s.slice(8,10); } }catch(_){}
  if(!mm){ var d=new Date(); mm=d.getMonth()+1; dd=d.getDate(); }
  return Math.max(0, Math.min(23, (mm-1)*2 + (dd>15?1:0)));
}

 
function riverClimFor(gauge){
  if(!gauge || !gauge.bins) return null;
  if(!gauge.__bins){
    try{ gauge.__bins = String(gauge.bins).split(';').map(function(r){ return r.split(',').map(Number); }); }
    catch(_){ return null; }
  }
  var b = gauge.__bins[riverBinIndex()] || gauge.__bins[0];
  if(!b || b.length<4) return null;
  return { p50:b[0], p80:b[1], p90:b[2], p95:b[3],
           rp2:gauge.rp2, rp5:gauge.rp5, rp20:gauge.rp20,
           

           gaugeName:gauge.name,
           obsMax:gauge.obsMax, yrs:gauge.yrs, bin:riverBinIndex() };
}
try{ window.riverClimFor=riverClimFor; window.riverBinIndex=riverBinIndex; }catch(_){}



function riverRatio(q, clim){
  if(q==null || !isFinite(q) || !clim)
    return {ratio:0, level:'no-reference', basis:'no global river-flow model reference climatology for this reach', covered:false};
  

  var _ffd = (typeof AGN_FFD_LIMITS!=='undefined' && clim && clim.gaugeName)
             ? AGN_FFD_LIMITS[clim.gaugeName] : null;
  

  if(_ffd && window.__NIGRAAN_INTERNAL_REF!==true) _ffd=null;
  if(_ffd && _ffd.scalable===false){
    return {ratio:0, level:'not-scalable', covered:false, official:true,
            officialStation:_ffd.station,
            basis:'the official flood limits for '+_ffd.station+' are published, but this '
                 +'reach cannot be scored from the model: the global river-flow model reanalysis carries no canal '
                 +'withdrawal and no upstream reservoir operation, and against the gauge record its '
                 +'discharge here is low by a factor of '+_ffd.lowByFactor+'. Discharge is reported; '
                 +'no flood level is claimed.'};
  }
  if(_ffd && _ffd.scalable!==false && q!=null && isFinite(q)){
    var L=_ffd.m3s;                        
    var _lvl, _b;
    if(L.exceptional!=null && q>=L.exceptional){ _lvl='exceptional'; _b='at or above the official Exceptional limit'; }
    else if(q>=L.veryHigh){ _lvl='very-high'; _b='at or above the official Very High limit'; }
    else if(q>=L.high){ _lvl='high'; _b='at or above the official High limit'; }
    else if(q>=L.medium){ _lvl='medium'; _b='at or above the official Medium limit'; }
    else if(q>=L.low){ _lvl='low'; _b='at or above the official Low flood limit'; }
    else { _lvl='normal'; _b='below the official Low flood limit'; }
    
    

    var _seg=function(v,a,b,lo,hi){ if(!(b>a)) return lo; return lo+(hi-lo)*Math.max(0,Math.min(1,(v-a)/(b-a))); };
    var _vh=(L.veryHigh!=null?L.veryHigh:L.high), _ex=(L.exceptional!=null?L.exceptional:_vh*1.25);
    var _r;
    if(q<L.low) _r=_seg(q,0,L.low,0,0.29);
    else if(q<L.medium) _r=_seg(q,L.low,L.medium,0.30,0.47);
    else if(q<L.high) _r=_seg(q,L.medium,L.high,0.48,0.81);
    else if(q<_vh) _r=_seg(q,L.high,_vh,0.82,0.89);
    else if(q<_ex) _r=_seg(q,_vh,_ex,0.90,0.96);
    else _r=Math.min(1,_seg(q,_ex,_ex*1.5,0.97,1.0));
    

    var _pctDesign=(_ffd.designM3s>0)?Math.round(q/_ffd.designM3s*100):null;
    var _pctPeak=(_ffd.peakM3s>0)?Math.round(q/_ffd.peakM3s*100):null;
    return {ratio:_r, level:_lvl, covered:true, official:true,
            officialStation:_ffd.station,
            pctOfDesign:_pctDesign, designM3s:(_ffd.designM3s||null),
            pctOfPeakOfRecord:_pctPeak, peakOfRecordM3s:(_ffd.peakM3s||null),
            peakOfRecordDate:(_ffd.peakDate||null),
            pctOfLow:(L.low>0?Math.round(q/L.low*100):null),
            pctOfBankfull:(L.high>0?Math.round(q/L.high*100):null),
            limits:L,
            basis:_b
                 +(_pctDesign!=null?(' · '+_pctDesign+'% of design capacity'):'')
                 +(_pctPeak!=null?(' · '+_pctPeak+'% of the peak of record, '+_ffd.peakDate):'')
                 +' ('+_ffd.station+', official river flood-warning limits, published in lacs '
                 +'of cusecs, last updated 9 Sep 2025). Discharge is the global river-flow model value, not a '
                 +'gauge reading.'};
  }
  if(!(clim.rp2 > RIVER_MIN_Q))
    return {ratio:0, level:'no-reference', covered:false,
            basis:'reach too small for global river-flow model (bankfull under '+RIVER_MIN_Q+' m3/s)'};
  

  var rp2=clim.rp2, rp5=Math.max(clim.rp5, rp2*1.02), rp20=Math.max(clim.rp20, rp5*1.02);
  var p95=Math.min(clim.p95, rp2*0.98);
  var p90=Math.min(clim.p90, p95*0.98);
  var p80=Math.min(clim.p80, p90*0.98);
  

  

  var _e=function(x){ return x*(1-1e-4); };
  

  var _RLS=AGN_RIVER_LEVEL_SCALE, _X={p80:p80,p90:p90,p95:p95,'rp2-':_e(rp2),rp2:rp2,'rp5-':_e(rp5),rp5:rp5,'rp20-':_e(rp20),rp20:rp20,'rp20x1.5':rp20*1.5};    
  var k=_RLS.knots.map(function(a){ return [_X[a[0]], a[1]]; });
  for(var i=1;i<k.length;i++) if(!(k[i][0]>k[i-1][0])) k[i][0]=k[i-1][0]+0.01;
  var ratio;
  if(q<=k[0][0]) ratio=0;
  else if(q>=k[k.length-1][0]) ratio=1;
  else { ratio=0;
    for(var j=1;j<k.length;j++){
      if(q<=k[j][0]){ var x0=k[j-1][0],x1=k[j][0],y0=k[j-1][1],y1=k[j][1];
        ratio=y0+(y1-y0)*((q-x0)/(x1-x0)); break; } }
  }
  ratio=Math.max(0,Math.min(1,ratio));
  

  var level = q>=rp20     ? 'extreme'
            : q>=rp5      ? 'high'
            : q>=rp2      ? 'bankfull'
            : q>=p95      ? 'elevated'
            : ratio>0     ? 'seasonally-high'
            :               'normal';    
   
  var basis = level==='extreme'         ? 'a 20-year flow or rarer in the model\u2019s own record for this reach'
            : level==='high'            ? 'a 5-year flow or rarer in the model\u2019s own record: on such days the river most often reached Medium flood'
            : level==='bankfull'        ? 'above its 2-year flow, below its 5-year flow: no flood signal (at such flows the river most often stayed under the Low flood limit)'
            : level==='elevated'        ? 'high for the time of year, below its 2-year flow: no flood signal'
            : level==='seasonally-high' ? 'a little above usual for the time of year'
            :                             'normal for the time of year';
  return {ratio:ratio, level:level, basis:basis, covered:true,
          rp2:clim.rp2, rp5:clim.rp5, rp20:clim.rp20, p80:p80, p95:p95,
          knotsRepaired:(p95<clim.p95),
          obsMax:clim.obsMax, refYears:clim.yrs,
          pctOfBankfull: clim.rp2>0 ? Math.round(q/clim.rp2*100) : null};
}
try{ window.riverRatio=riverRatio; }catch(_){}

async function riverSweep(force){
  if(RIVER_STATE.loading) return RIVER_STATE;
  if(RIVER_STATE.loaded && !force) return RIVER_STATE;
  if(typeof PK_RIVER_GAUGES==='undefined') return RIVER_STATE;
  RIVER_STATE.loading=true;
  const out=[], byDistrict={};
  

  var _all=null;
  try{
    

    

    var _u='https://flood-api.open-meteo.com/v1/flood?latitude='+PK_RIVER_GAUGES.map(function(g){return g.lat;}).join(',')
      +'&longitude='+PK_RIVER_GAUGES.map(function(g){return g.lon;}).join(',')
      +'&daily='+AGN_FLOOD_POLICY.daily.join(',')
      +'&ensemble=true&forecast_days='+AGN_FLOOD_POLICY.operationalDays+'&timezone=Asia%2FKarachi';
    var _r=await AGN.api.fetch(_u);
    if(!_r.ok) throw new Error('HTTP '+_r.status);
    _all=await _r.json(); if(!Array.isArray(_all)) _all=[_all];
  }catch(e){
    RIVER_STATE.loading=false; RIVER_STATE.error=String(e&&e.message||e);
    return RIVER_STATE;
  }
  for(let i=0;i<PK_RIVER_GAUGES.length;i++){
    const g=PK_RIVER_GAUGES[i];
    try{
      const d=(_all[i]&&_all[i].daily)||{};
      const series=(d.river_discharge||[]).filter(function(x){return x!=null;});
      const q=series.length?series[0]:null;
      

      let peak=null, peakDay=0;
      (d.river_discharge||[]).forEach(function(v,ix){ if(v!=null&&(peak==null||v>peak)){ peak=v; peakDay=ix; } });
      const clim=riverClimFor(g);
      const rr=riverRatio(q,clim);          
      const rp=riverRatio(peak,clim);       

      

      var _ens=null;
      try{
        var _mk=Object.keys(d).filter(function(k){ return /^river_discharge_member\d+$/.test(k); });
        if(_mk.length>=10 && clim && clim.rp2>0){
          var _days=(d.river_discharge||[]).length, _best=null;
          for(var _di=0; _di<_days; _di++){
            

            var vals=[], _c0=d.river_discharge && d.river_discharge[_di];
            if(_c0!=null && isFinite(_c0)) vals.push(Number(_c0));
            for(var _mi=0;_mi<_mk.length;_mi++){
              var vv=d[_mk[_mi]] && d[_mk[_mi]][_di];
              if(vv!=null && isFinite(vv)) vals.push(Number(vv));
            }
            if(vals.length<10) continue;
            var above=function(th){ if(th==null||!(th>0)) return null;
              var c=0; for(var z=0;z<vals.length;z++) if(vals[z]>=th) c++; return c/vals.length; };
            var e2=above(clim.rp2), e5=above(clim.rp5), e20=above(clim.rp20);
            vals.sort(function(a,b){return a-b;});
            var _qi=function(f){ return vals[Math.floor((vals.length-1)*f)]; };
            var med=_qi(0.5);
            var row={day:_di, n:vals.length, median:med,
                     p10:_qi(0.10),
                     p90:_qi(0.90),
                     exceed2:e2, exceed5:e5, exceed20:e20};
            if(!_best || (row.exceed5||0)>(_best.exceed5||0)
                      || ((row.exceed5||0)===(_best.exceed5||0) && (row.exceed2||0)>(_best.exceed2||0))) _best=row;
          }
          if(_best){
            

            var _rm=riverRatio(_best.median, clim);
            var _r90=riverRatio(_best.p90, clim);
            _ens={ members:_mk.length, days:_days,
                   leadDays:_best.day, exceed2:_best.exceed2,
                   exceed5:_best.exceed5, exceed20:_best.exceed20,
                   median:_best.median, p10:_best.p10, p90:_best.p90,
                   ratioMedian:_rm?_rm.ratio:null, ratioP90:_r90?_r90.ratio:null,
                   levelMedian:_rm?_rm.level:null,
                   basis:_mk.length+'-member global river-flow model ensemble against '+(clim.yrs||29)
                         +'-year return levels at this reach' };
          }
        }
      }catch(_){ _ens=null; }
      const rec={name:g.name, lat:g.lat, lon:g.lon, q:q, peak5d:peak, peakDay:peakDay,
                 ratio:rr.ratio, ratioPeak:rp.ratio,
                 level:rr.level, peakLevel:rp.level,
                 basis:rp.basis, covered:rp.covered,
                 rp2:g.rp2, rp5:g.rp5, rp20:g.rp20, obsMax:g.obsMax, refYears:g.yrs,
                 pctOfBankfull:rp.pctOfBankfull, ens:_ens,
                 districts:g.districts||[], loaded:(q!=null)};

      

      try{
        var _ffd=(typeof window.ffdNearest==='function')?window.ffdNearest(g.lat,g.lon,0.6):null;
        if(_ffd && _ffd.barrage && _ffd.barrage.k!=null){
          var _b=_ffd.barrage;
          var _qObs=(q!=null && typeof window.ffdCorrect==='function')?window.ffdCorrect(_b.name,q):null;
          var _pObs=(peak!=null && typeof window.ffdCorrect==='function')?window.ffdCorrect(_b.name,peak):null;
          var _kcs=function(cumecs){ return (cumecs==null)?null:Math.round(cumecs*0.0353147/1000*10)/10; };
          rec.ffd={
            barrage:_b.name, k:_b.k, matchDegrees:_ffd.degrees,
            observedEquivalentCumecs:(_qObs==null?null:Math.round(_qObs)),
            observedEquivalentKcs:_kcs(_qObs),
            peakObservedEquivalentKcs:_kcs(_pObs),
            designKcs:_b.design_kcs, peakHistoricKcs:_b.peak_hist_kcs, peakDate:_b.peak_date,
            shareOfDesign:(_qObs!=null&&_b.design_kcs)
              ? Math.round(_kcs(_qObs)/_b.design_kcs*1000)/10 : null,
            shareOfHistoricPeak:(_qObs!=null&&_b.peak_hist_kcs)
              ? Math.round(_kcs(_qObs)/_b.peak_hist_kcs*1000)/10 : null,
            appliedToRatio:false,
            basis:'global river-flow model discharge x '+_b.k+' (gauge observed-equivalent factor for '+_b.name+'). '
                +'Reported alongside the ratio, never inside it: the ratio divides global river-flow model by '
                +'global river-flow model return levels, so the model bias already cancels and correcting one '
                +'side alone would add a bias rather than remove one.'
          };
        }
      }catch(_){}
      out.push(rec);
      (g.districts||[]).forEach(function(dn){
        const prev=byDistrict[dn];
        

        var _rank = (_ens && _ens.exceed5!=null) ? (1 + _ens.exceed5) : rp.ratio;
        var _prevRank = prev ? (prev.__rank!=null ? prev.__rank : prev.ratio) : -1;
        if(!prev || _rank>_prevRank) byDistrict[dn]={ratio:rp.ratio, gauge:g.name,
          q:q, peak5d:peak, peakDay:peakDay, level:rp.level, basis:rp.basis,
          rp2:g.rp2, rp5:g.rp5, rp20:g.rp20, pctOfBankfull:rp.pctOfBankfull,
          refYears:g.yrs, covered:true, ens:_ens, __rank:_rank};
      });
    }catch(e){
      out.push({name:g.name, loaded:false, err:String(e&&e.message||e), districts:g.districts||[]});
    }
  }
  

  RIVER_STATE.coveredDistricts={};
  PK_RIVER_GAUGES.forEach(function(g){ (g.districts||[]).forEach(function(dn){ RIVER_STATE.coveredDistricts[dn]=true; }); });
  RIVER_STATE.gauges=out; RIVER_STATE.byDistrict=byDistrict;
  RIVER_STATE.loaded=true; RIVER_STATE.loading=false; RIVER_STATE.at=Date.now();
  try{ document.dispatchEvent(new CustomEvent('agn:river',{detail:{gauges:out.length}})); }catch(_){}
  return RIVER_STATE;
}
window.riverSweep = riverSweep;



function riverSignalFor(nameOrKey){
  if(!RIVER_STATE.loaded) return null;                 
  

  var dist=nameOrKey;
  try{ if(typeof PK_KEY_TO_DISTRICT!=='undefined' && PK_KEY_TO_DISTRICT[nameOrKey]) dist=PK_KEY_TO_DISTRICT[nameOrKey]; }catch(_){}
  var hit=RIVER_STATE.byDistrict[nameOrKey] || RIVER_STATE.byDistrict[dist];
  if(hit) return hit;
  

  var cov=RIVER_STATE.coveredDistricts||{};
  return {ratio:0, covered:false, level:'not-covered', gauge:null,
          basis:'no global river-flow model gauge upstream of '+dist+' - river state unknown, not normal',
          uncoveredOf:dist, networkSize:(PK_RIVER_GAUGES||[]).length,
          networkDistricts:Object.keys(cov).length};
}
window.riverSignalFor = riverSignalFor;




const PK_TEHSIL_POP_GAPS=['Sahiwal (Sargodha)',
  'Khanpur (Shikarpur)','Khanpur (Haripur)','Kingri (Musakhel)','Keti Bunder'];
window.PK_TEHSIL_POP_GAPS=PK_TEHSIL_POP_GAPS;
window.popForTehsil=function(key){
  var v=(window.PK_TEHSIL_POP||{})[key];
  if(v!=null) return {pop:v, complete:true};
  return {pop:null, complete:false,
          reason: PK_TEHSIL_POP_GAPS.indexOf(key)>=0 ? 'name-collision gap in source table' : 'not in population table'};
};
const PK_TEHSIL_POP = {"Bagh":121807,"Dhir Kot":137463,"Harighel":101761,"Barnala":127420,"Samahni":132454,"Chikar":49428,"Hattian":154340,"Haveli":96669,"Khurshid Abad":20088,"Mumtazabad":30967,"Charhoi":96716,"Dulliya Jattan":32752,"Fatehpur Thakiala":139468,"Khui Ratta":93762,"Dadyal":81938,"Mirpur":217370,"Muzaffarabad":429872,"Naseerabad":75561,"Sharda":28766,"Abbaspur":54212,"Hajira":183175,"Rawalakot":242169,"Thorar":12765,"Baluch":75131,"Mong":22474,"Pallandari":123357,"Tarar Khal":63968,"Awaran":29588,"Jhal Jhao":65796,"Mashkai":26151,"Gishekore":22855,"Barkhan":74315,"Rakhni":53051,"Taftan":17541,"Dera Bugti":66082,"Phelawagh":71150,"Sui":86929,"Gwadar":117119,"Jiwani":2505,"Ormara":19616,"Pasni":56815,"Harnai":56691,"Shahrigh":38508,"Gandakha":38589,"Usta Mohammad":140669,"Gandawa":56999,"Jhal Magsi":77740,"Dhadar":58107,"Mach":37364,"Sanni":75932,"Balanari":46129,"Khattan":27183,"Kalat":121458,"Khaliqabad":55822,"Buleda":86846,"Dasht":27090,"Kech (Turbat)":284160,"Mand":51573,"Tump":48867,"Kharan":64677,"Sar Kharan":8090,"Tomulk":62995,"Khuzdar":224690,"Mola":37114,"Naal":96105,"Wadh":126321,"Zehri":30691,"Dobandi":24332,"Killa Abdullah":169468,"Killa Saifullah":121265,"Muslim Bagh":116281,"Kohlu":60220,"Mawand":29532,"Bela":103284,"Hub":64032,"Kanraj":9144,"Sonmiani":23296,"Uthal":61889,"Lakhra":4232,"Lairi":3077,"Bhag":68975,"Lehri":40320,"Loralai":139145,"Mekhtar":25965,"Dasht Spenzend":24966,"Kirdgap":19404,"Mastung":134701,"Drug":90731,"Musakhel":47141,"Chattar":59997,"Dera Murad Jamali":157473,"Tamboo":84312,"Gowargo":10969,"Jaheen Parome":12314,"Panjgur":246634,"Gichk":2463,"Huramzai":30693,"Karezat":92504,"Pishin":184498,"Saranan":81803,"Panjpai":7208,"Quetta City":948179,"Quetta Saddar":154507,"Sherani":104920,"Sibi":127173,"Sohbatpur":133645,"Mashkhel":30903,"Basima":28933,"Washuk":30592,"Nag":38775,"Shaogari":7361,"Zhob":208048,"Sinjawi":57510,"Ziarat":40980,"Surab":114429,"Duki":142416,"Chaman":259418,"Astore":52864,"Shounter":65504,"Chilas":79274,"Ishkoman":16089,"Punial":45478,"Gilgit":126180,"Ali Abad":41421,"Gamba":4124,"Skardu":127291,"Nagar":63288,"Sikandar Abad":18126,"Gultari":797,"Kharmang":58844,"Daghoni":41203,"Khaplu":27696,"Shigar":55682,"Tangir":42663,"Gupis":24317,"Yasin":49841,"Rondu":19077,"Islamabad":1991104,"Bar Chamarkand":1073,"Barang":71740,"Khar":176025,"Mamund":238260,"Nawagai":62067,"Salarzai":218806,"Utman Khel":65028,"Bannu":604535,"Baka Khel":174393,"Domel":251305,"Kakki":61945,"Miryan":135058,"Wazir":34280,"Allai":210683,"Batagram":330220,"Daggar":365664,"Gagra":260709,"Khado Khel":145934,"Mandanr":117946,"Charsadda":833127,"Shabqadar":514609,"Tangi":456337,"Chitral":198153,"Drosh":82360,"Mastuj":82307,"Dera Ismail Khan":681626,"Daraban":93423,"Kulachi":171884,"Paroa":167048,"Darazinda":58016,"Hangu":265959,"Tall":285243,"Banda Daud Shah":174431,"Karak":279566,"Takht-E-Nasrati":299166,"Bara":441533,"Jamrud":70986,"Landi Kotal":230837,"Mulagori":43582,"Kohat":752467,"Lachi":133769,"Gumbat":98083,"Darra Adam Khel":168818,"Pattan":130781,"Bankad":98467,"Dassu":32578,"Kandia":71329,"Harban Basha":41276,"Seo":171244,"Palas":205462,"Battera Kolai":71292,"Central Kurram":267957,"Upper Kurram":293081,"Lakki Marwat":600373,"Sarai Naurang":208790,"Bettani":12061,"Adenzai":330678,"Balambat":237046,"Lalqila":149225,"Munda":100675,"Samarbagh":248380,"Timergara":229969,"Bat Khela":471142,"Dargai":298651,"Bala Kot":370147,"Mansehra":787575,"Oghi":271775,"Baffa Pakhal":222781,"Darband":59415,"Katlang":277721,"Mardan":958503,"Takht Bhai":700642,"Rustam":240391,"Garhi Kapura":371112,"Ambar":33106,"Baizai":111380,"Halimzai":50370,"Khwazai":22725,"Pandiali":129231,"Prang Ghar":27572,"Safi":102341,"Yaka Ghund":56902,"Data Khel":173851,"Dossali":30292,"Garyum":11585,"Mir Ali":99568,"Miran Shah":129418,"Razmak":5785,"Shewa":39781,"Spinwam":35111,"Shawal":5301,"Nowshera":763040,"Pabbi":329560,"Central Orakzai":101968,"Ismailzai":51496,"Lower Orakzai":76956,"Upper Orakzai":84422,"Town-I":537936,"Town-Ii":805972,"Town-Iii":1486925,"Town-Iv":675607,"Hassan Khel":81605,"Alpuri":322514,"Bisham":120279,"Chakisar":103727,"Makhuzai":30025,"Martoong":102338,"Puran":94123,"Birmal":89682,"Ladha":95275,"Makin":53476,"Sararogha":106713,"Serwakai":39665,"Tiarza":65197,"Toi Khulla":55602,"Wana":131637,"Swabi":470884,"Topi":390136,"Razar":560351,"Babuzai":789961,"Bahrain":75348,"Barikot":180565,"Charbagh":97223,"Kabal":414158,"Khwaza Khela":195606,"Matta Kharirai":272651,"Matta Sebujni":163485,"Tank":417320,"Jandola":28614,"Judba":144106,"Khander":142666,"Barawal":116640,"Dir":247436,"Kalkot":88142,"Khall":153055,"Shrengal":55182,"Wari":249332,"Larjam":92788,"Attock":334227,"Fateh Jang":365159,"Jand":382101,"Pindi Gheb":324856,"Bahawalnagar":893649,"Chishtian":828918,"Fort Abbas":477094,"Minchinabad":583464,"Ahmadpur East":1185545,"Bahawalpur":1338562,"Hasilpur":522064,"Khairpur Tamewali":310028,"Bhakkar":677001,"Darya Khan":396040,"Mankera":279011,"Chakwal":803044,"Choa Saidan Shah":176797,"Kallar Kahar":188543,"Tala Gang":611709,"Bhawana":465326,"Chiniot":596979,"Lalian":535331,"Kot Chatta":725362,"Taunsa":603782,"Chak Jhumra":416179,"Faisalabad City":4280732,"Faisalabad Sadar":1593740,"Jaranwala":1707868,"Summundri":848946,"Tandlian Wala":898088,"Gujranwala":3195597,"Kamoke":665597,"Nowshera Virkan":701381,"Wazirabad":1062079,"Gujrat":1809829,"Kharian":1290405,"Sarai Alamgir":291236,"Hafizabad":800341,"Pindi Bhattian":575723,"Ahmadpur Sial":365387,"Jhang":1665366,"Shorkot":742058,"Athara Hazari":321666,"Dina":333831,"Jhelum":530556,"Pind Dadan Khan":423706,"Sohawa":252250,"Kasur":1332198,"Kot Radha Kishen":588217,"Pattoki":1050358,"Jahanian":413228,"Kabirwala":1095837,"Khanewal":894148,"Mian Channu":1021431,"Khushab":860788,"Naushera":115844,"Noorpur":285835,"Quaidabad":239808,"Lahore Cantt":7121032,"Lahore City":5195862,"Choubara":265615,"Karor Lal Esan":640969,"Leiah":978554,"Dunyapur":564697,"Kahror Pacca":589943,"Lodhran":783994,"Malakwal":488049,"Mandi Bahauddin":772513,"Phalia":661754,"Mianwali":879728,"Jalalpur Pirwala":597031,"Multan City":2502937,"Multan Saddar":1354088,"Shujabad":703891,"Alipur":621319,"Jatoi":752760,"Kot Addu":1337615,"Muzaffargarh":1623768,"Nankana Sahib":1136835,"Sangla Hill":314109,"Shah Kot":320944,"Narowal":674563,"Okara":1436179,"Renala Khurd":582264,"Arif Wala":997418,"Pakpattan":1134966,"Khanpur":1136980,"Liaqatpur":1165010,"Rahim Yar Khan":1630424,"Jampur":801523,"Rajanpur":655337,"Rajanpur (Tribal Area)":24875,"Rojhan":346542,"Gujar Khan":813308,"Kahuta":278486,"Kallar Sayaddan":246747,"Kotli Sattian":110109,"Murree":306062,"Rawalpindi":3145470,"Taxila":594890,"Chichawatni":1297047,"Sahiwal":1750181,"Bhalwal":438229,"Kot Momin":527048,"Sahiwal":395643,"Sargodha":1788160,"Shahpur":447274,"Sillanwali":417055,"Bhera":397615,"Ferozewala":964523,"Muridke":506486,"Safdarabad":337130,"Sharak Pur":188802,"Sheikhupura":1736566,"Daska":976046,"Pasrur":1010849,"Sambrial":503863,"Sialkot":2016317,"Gojra":808429,"Kamalia":679752,"Toba Tek Singh":870645,"Pir Mahal":315716,"Burewala":1206775,"Mailsi":1153507,"Vehari":1092634,"Badin":459743,"Matli":452476,"Shaheed Fazil Rahu":308652,"Talhar":149465,"Tando Bago":392616,"Gulberg Town":1145116,"Liaqatabad Town":639947,"New Karachi Town":1177437,"North Nazimabad Town":1037404,"Dadu":505118,"Johi":343378,"Khairpur Nathan Shah":406957,"Mehar":498764,"Gulshan Iqbal Town":716669,"Jamshaid Town":2908030,"Daharki":327239,"Ghotki":470745,"Khangarh":146331,"Mirpur Mathelo":270546,"Ubauro":331423,"Hyderabad":537639,"Hyderabad City":2010424,"Latifabad":58025,"Qasimabad":151834,"Garhi Khairo":203735,"Jacobabad":430373,"Kotri":414181,"Manjhand":68856,"Sehwan Sharif":272000,"Thano Bula Khan":163801,"Meero Khan":158320,"Nasir Abad":200350,"Qambar Ali Khan":400785,"Qubo Saeed Khan":59498,"Shahdad Kot":242725,"Sijawal Junejo":122950,"Warah":280702,"Kandh Kot":360866,"Kashmore":423254,"Tangwani":287158,"Faiz Ganj":235353,"Gambat":261719,"Khairpur":447281,"Kingri":346759,"Kot Diji":357612,"Sobho Dero":294412,"Thari Meer Wah":354622,"Korangi Town":1226638,"Landhi Town":453598,"Shah Faisal Town":284062,"Baqrani":287378,"Dokri":239356,"Larkana":713393,"Rato Dero":361293,"Bin Qasim Town":634927,"Gadap Town":416481,"Malir Town":372621,"Hala":203125,"Matiari":404097,"Saeedabad":185756,"Digri":241347,"Hussain Bux Muree":109773,"Jhudo":219437,"Kot Ghulam Muhammad":283443,"Mirpur Khas":374233,"Shuja Abad":131596,"Sindhri":207725,"Bhiria":300957,"Kandiaro":327476,"Mehrab Pur":304447,"Moro":420745,"Naushahro Feroze":379411,"Jam Nawaz Ali":142310,"Khipro":381128,"Sanghar":421730,"Shahdadpur":503158,"Sinjhoro":317792,"Tando Adam":367300,"Daulat Pur":398950,"Daur":451423,"Nawabshah":435917,"Sakrand":453849,"Garhi Yasin":369324,"Khanpur":290899,"Lakhi":315246,"Shikarpur":424447,"Kemari Town":308974,"Liyari Town":1511618,"Saddar Town":2643028,"Jati":198598,"Kharo Chan":41918,"Mirpur Bathoro":239078,"Shah Bunder":157812,"Sujawal":203096,"New Sukkur":66281,"Pano Aqil":417956,"Rohri":289552,"Sukkur":675603,"Chamber":196344,"Jhando Mari":209794,"Tando Allahyar":378065,"Bulri Shah Karim":244183,"Tando Ghulam Hyder":201590,"Tando Muhammad Khan":260983,"Chachro":283562,"Islam Kot":191568,"Mithi":258070,"Kaloi":144246,"Ghorabari":207495,"Thatta":403002,"Kunri":253521,"Pithoro":124238,"Samaro":179789,"Umer Kot":496289,"Baldia Town":603561,"Orangi Town":1899552,"Site Town":1080180,"Haripur":866509,"Abbottabad":1071609,"Havelian":265574,"Lora":92738,"Lower Tanawal":78116,"Bhimber":125616,"Leepa":15875,"Kotli":314721,"Sehnsa":64129,"Athmuqam":119043,"Dalbandin":76031,"Nokkundi":9730,"Chagai":30107,"Sunster":4152,"Jhat Pat":206623,"Gulistan":7013,"Kahan":32872,"Dureji":38281,"Gaddani":72004,"Kingri":22125,"Nushki":121355,"Barshore":116055,"Kakar Khurasan":29601,"Mashabbrum":35894,"Gojal":13344,"Darel":40849,"Phandar":15296,"Lotkoh":51542,"Mulkhow":152128,"Paharpur":378178,"Ghazi":194135,"Khanpur":185026,"Lower Kurram":133735,"Ghulam Khan":13809,"Jehangira":440935,"Lahor":369997,"Kalam":12797,"Hasan Abdal":234496,"Hazro":495134,"Haroonabad":628094,"Yazman":665775,"Kalur Kot":360871,"Chunian":952374,"Isakhel":423999,"Piplan":437745,"Shakargarh":816376,"Zafarwal":601394,"Depalpur":1693752,"Sadiqabad":1280500,"Thul":531577,"Nara":148274,"Salehpat":123824,"Dahli":215636,"Diplo":112950,"Nagar Parkar":242892,"Mirpur Sakro":309187,"Dera Ghazi Khan":1389810};
const PK_DISTRICT_POP = {"Abbottabad":1508037,"Astore":118368,"Attock":2135973,"Awaran":144390,"Badin":1762952,"Bagh":361031,"Bahawalnagar":2783125,"Bahawalpur":3356200,"Bahwalnagar":628094,"Bahwalpur":665775,"Bajaur":832998,"Bannu":1261516,"Barkhan":127366,"Batagram":540903,"Bhakkar":1712924,"Bhimber":385490,"Buner":890251,"Central Karachi":3999905,"Chagai":133409,"Chakwal":1780093,"Chaman":259418,"Charsadda":1804073,"Chiniot":1597637,"Chitral":566490,"Dadu":1754218,"Darel":40849,"Dera Bugti":224162,"Dera Ghazi Khan":2718954,"Dera Ismail Khan":1550175,"Diamir":79274,"Duki":142416,"East Karachi":3624699,"Faisalabad":9745554,"Ghanche":104794,"Ghizer":61566,"Ghotki":1546284,"Gilgit":126180,"Gujranwala":5624653,"Gujrat":3391471,"Gupis-Yasin":89454,"Gwadar":200207,"Hafizabad":1376064,"Hangu":551203,"Haripur":1245671,"Harnai":95199,"Hattian":219643,"Haveli":147725,"Hub":197613,"Hunza":54765,"Hyderabad":2757922,"Islamabad":1991104,"Jacobabad":1165685,"Jaffarabad":206623,"Jamshoro":918838,"Jhal Magsi":134739,"Jhang":3094477,"Jhelum":1540342,"Kachhi":244714,"Kalat":177280,"Karak":753162,"Kashmore":1071279,"Kasur":3923148,"Keamari":1992715,"Kech":498535,"Khairpur":2446032,"Khanewal":3424644,"Kharan":135762,"Kharmang":59641,"Khushab":1502276,"Khuzdar":514921,"Khyber":786938,"Killa Abdullah":200813,"Killa Saifullah":237547,"Kohat":1153137,"Kohlu":122624,"Kolai Palas":276754,"Korangi":1964298,"Kotli":741549,"Kurram":694773,"Lahore":12316894,"Lakki Marwat":821224,"Larkana":1601420,"Lasbela":181627,"Layyah":1885138,"Lehri":109295,"Lodhran":1938634,"Loralai":165109,"Lower Dir":1295973,"Lower Kohistan":229248,"Malakand":769793,"Malir":1424029,"Mandi Bahauddin":1922316,"Mansehra":1711693,"Mardan":2548369,"Mastung":179072,"Matiari":792978,"Mianwali":1741472,"Mirpur":299308,"Mirpur Khas":1567553,"Mohmand":533628,"Multan":5157947,"Musakhel":159998,"Muzaffarabad":505433,"Muzaffargarh":4335461,"Nagar":81413,"Nankana Sahib":1771889,"Narowal":2092334,"Nasirabad":301782,"Naushahro Feroze":1733035,"Neelam Valley":147810,"North Waziristan":544501,"Nowshera":1533536,"Nushki":121355,"Okara":3712194,"Orakzai":314843,"Pakpattan":2132384,"Panjgur":272381,"Peshawar":3588045,"Pishin":505553,"Poonch":492322,"Qambar Shahdadkot":1465330,"Quetta":1109894,"Rahim Yar Khan":5212914,"Rajanpur":1828277,"Rawalpindi":5495071,"Roundu":19077,"Sahiwal":3047228,"Sanghar":2133417,"Sargodha":4411024,"Shaheed Benazir Abad":1740140,"Shangla":773006,"Sheikhupura":3733507,"Sherani":104920,"Shigar":55682,"Shikarpur":1399917,"Sialkot":4507076,"Sibi":127173,"Skardu":131415,"Sohbatpur":133645,"South Karachi":4154646,"South Waziristan":637246,"Sudhnoti":284929,"Sujawal":840501,"Sukkur":1573216,"Surab":114429,"Swabi":1791369,"Swat":2201794,"Tando Allahyar":784202,"Tando Muhammad Khan":706756,"Tangir":42663,"Tank":445934,"Tharparkar":1448924,"Thatta":919684,"Toba Tek Singh":2674542,"Tor Ghar":286773,"Umer Kot":1053837,"Upper Dir":1002574,"Upper Kohistan":316427,"Usta Muhammad":179258,"Vehari":3452917,"Washuk":136565,"West Karachi":1899552,"Zhob":237648,"Ziarat":98489};
window.PK_TEHSIL_POP = PK_TEHSIL_POP;
window.PK_DISTRICT_POP = PK_DISTRICT_POP;



AGN.exposure = (function(){
  

  var PK_TEHSIL_POP_AMBIGUOUS = {
    'Khanpur':[{district:'Rahim Yar Khan',province:'Punjab',pop:1136980},
               {district:'Shikarpur',province:'Sindh',pop:290899},
               {district:'Haripur',province:'Khyber Pakhtunkhwa',pop:185026}],
    'Sahiwal':[{district:'Sahiwal',province:'Punjab',pop:1750181},
               {district:'Sargodha',province:'Punjab',pop:395643}],
    'Kingri':[{district:'Khairpur',province:'Sindh',pop:346759},
              {district:'Musakhel',province:'Balochistan',pop:22125}]
  };
  function ambiguousNames(){ return Object.keys(PK_TEHSIL_POP_AMBIGUOUS); }
  function tehsilPop(name, districtHint){
    try{
      var amb=PK_TEHSIL_POP_AMBIGUOUS[name];
      if(amb){
        if(districtHint){
          var hit=amb.filter(function(x){ return String(x.district)===String(districtHint); })[0];
          if(hit) return hit.pop;
        }
         
        try{
          if(typeof resolveDistrict==='function'){
            var d=resolveDistrict(name);
            var h2=amb.filter(function(x){ return String(x.district)===String(d); })[0];
            if(h2) return h2.pop;
          }
        }catch(_){}
        return null;
      }
      return (typeof PK_TEHSIL_POP!=='undefined' && PK_TEHSIL_POP[name]) || null;
    }catch(_){ return null; }
  }
  

  function annotateAmbiguous(out, name, districtHint){
    var amb=PK_TEHSIL_POP_AMBIGUOUS[name]; if(!amb) return out;
    var d=districtHint;
    if(!d){ try{ d=(typeof resolveDistrict==='function')?resolveDistrict(name):null; }catch(_){ d=null; } }
    out.ambiguousName=true;
    out.resolvedDistrict=d||null;
    out.resolvedBasis=districtHint
      ? 'the district was supplied by the caller'
      : ('there are '+amb.length+' tehsils named '+name+' and this figure is the one in '
         +(d||'the district the build\'s own name resolver returned')+'. If the unit meant '
         +'is a different '+name+', supply its district - the populations differ by up to '
         + (Math.max.apply(null,amb.map(function(x){return x.pop;}))
            - Math.min.apply(null,amb.map(function(x){return x.pop;}))).toLocaleString('en-US')
         +' people.');
    return out;
  }
  function tehsilPopWhy(name){
    var amb=PK_TEHSIL_POP_AMBIGUOUS[name];
    if(!amb) return null;
    return 'there are '+amb.length+' tehsils named '+name+' in Pakistan ('
      + amb.map(function(x){ return x.district+', '+x.province; }).join('; ')
      + '), with populations from '+Math.min.apply(null,amb.map(function(x){return x.pop;})).toLocaleString('en-US')
      + ' to '+Math.max.apply(null,amb.map(function(x){return x.pop;})).toLocaleString('en-US')
      + '. The name alone does not identify one of them, so no population is reported. '
      + 'Supply the district to resolve it.';
  }
  function districtPop(name){
    try{ return (typeof PK_DISTRICT_POP!=='undefined' && PK_DISTRICT_POP[name]) || null; }catch(_){ return null; }
  }
  

  

  function forUnit(name, opts){
    if(!name) return null;
    var districtHint=null, level=null;
    if(typeof opts==='string') districtHint=opts;
    else if(opts && typeof opts==='object'){ districtHint=opts.district||null; level=opts.level||null; }

    if(level==='district'){
      var dOnly=districtPop(name);
      if(dOnly!=null) return {pop:dOnly, level:'district', levelAsked:'district'};
      return {pop:null, level:'district', levelAsked:'district', unavailable:true,
              why:'no district population is held for "'+name+'". It is not reported as a '
                 +'tehsil figure, because a district and a tehsil that share a name are '
                 +'different units and one is not an estimate of the other.'};
    }
    if(level==='tehsil'){
      var tOnly=tehsilPop(name, districtHint);
      if(tOnly!=null){
        var _t={pop:tOnly, level:'tehsil', levelAsked:'tehsil'};
        

        if(PK_TEHSIL_POP_AMBIGUOUS[name]) annotateAmbiguous(_t, name, districtHint);
        return _t;
      }
      return {pop:null, level:'tehsil', levelAsked:'tehsil', unavailable:true,
              why:tehsilPopWhy(name)
                 || ('no tehsil population is held for "'+name+'" in this build.')};
    }
    var t=tehsilPop(name, districtHint);
    if(t!=null){
      var out={pop:t, level:'tehsil'};
      if(PK_TEHSIL_POP_AMBIGUOUS[name]) annotateAmbiguous(out, name, districtHint);
      return out;
    }
    

    var why=tehsilPopWhy(name);
    if(why) return {pop:null, level:'tehsil', unavailable:true, why:why};
    var d=districtPop(name); if(d!=null) return {pop:d, level:'district'};
    

    return {pop:null, level:'unresolved', unavailable:true,
            why:'no population figure is held for "'+name+'" in this build. It is a gap in '
               +'the source table, not a zero: the unit exists and its population is simply '
               +'not recorded here. Any people-affected figure that would include it is '
               +'short by that unit.'};
  }
  function fmt(n){
    if(n==null) return '—';
    if(n>=1e6) return (n/1e6).toFixed(n>=1e7?0:1)+'M';
    if(n>=1e3) return Math.round(n/1e3)+'k';
    return String(Math.round(n));
  }
  

  function national(verdicts, minScore, opts){
    if(!verdicts || !verdicts.length) return null;
    

    var level=(opts && opts.level) || 'district';
    var total=0, units=0, missing=0, missingUnits=[];
    for(var i=0;i<verdicts.length;i++){
      var v=verdicts[i];
      

      if(!v) continue;
      

      var _lanes=(v.lanes||[]).filter(function(l){
        return l && !l.condition && !l.standing && (l.verdict==='Act' || l.verdict==='Watch'); });
      var _counts;
      if(v.lanes && v.lanes.length){
        _counts = _lanes.length>0;
      } else {
        _counts = !!(v.top && v.top.score!=null && v.top.score>=(minScore||0));
      }
      if(!_counts) continue;
      var p=forUnit(v.name, {level:level});
      if(p && p.pop!=null){ total+=p.pop; units++; }
      else { missing++; if(missingUnits.length<12) missingUnits.push(v.name); }
    }
    return {people:total, units:units, unresolved:missing, level:level,
             
            gate:'any EVENT hazard (hours-days) at Watch or above on the unit; accumulated conditions and standing susceptibilities do not count',
            gateFallback:'units with no hazard lanes fall back to a leading-index threshold of '
                        +(minScore||0)+'/100, which is a cross-hazard comparison and is reported '
                        +'as a fallback rather than used silently',
            unresolvedUnits:missingUnits,
            basis:units+' of '+(units+missing)+' unit'+((units+missing)===1?'':'s')
                 +' at or above the threshold have a '+level+' population in this build. '
                 +(missing
                    ? ('The '+missing+' without one'+(missingUnits.length
                        ? (' ('+missingUnits.slice(0,6).join(', ')
                           +(missing>6?', …':'')+')') : '')
                       +' are NOT counted as zero - they are not counted at all, so this '
                       +'figure is a floor rather than a total.')
                    : 'No unit is missing a population, so this is the whole set.')};
  }
  return { forUnit:forUnit, tehsilPop:tehsilPop, districtPop:districtPop,
            
           districtPopFor:function(n){ return forUnit(n,{level:'district'}); },
           tehsilPopFor:function(n,d){ return forUnit(n,{level:'tehsil',district:d}); },
           tehsilPopWhy:tehsilPopWhy, ambiguousNames:ambiguousNames,
           ambiguousTable:PK_TEHSIL_POP_AMBIGUOUS,
           fmt:fmt, national:national };
})();



(function(){
  if(typeof window.AGN==='undefined') window.AGN={};
  if(AGN.data) return;

  var store = {
    activePoint:null,      
    water:null,            
    thermal:null,          
    national:null,         
    river:null,            
    models:{},             
    archive:{},            
    portfolio:null
  };
  var listeners=[];
  var inflight={};         

  function key(lat,lon){ return (+lat).toFixed(3)+','+(+lon).toFixed(3); }

  

  function _fetch(url){
    if(inflight[url]) return inflight[url];
    var p;
    {
      p=(async function(){
        var ctl=(typeof AbortController==='undefined')?null:new AbortController();
        

        var _sameOrigin=(function(){ try{ return new URL(url,location.href).origin===location.origin; }
                                     catch(_){ return false; } })();
        var _waitMs=_sameOrigin?45000:18000;
        var timer=ctl?setTimeout(function(){
          ctl.abort(new Error('no answer from '+(_sameOrigin?'the local server':'the provider')
                              +' within '+Math.round(_waitMs/1000)+' s'));
        },_waitMs):null;
        try{ var r=await AGN.api.fetch(url,{cache:'no-store',signal:ctl&&ctl.signal});
          if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
        finally{ if(timer) clearTimeout(timer); }
      })();
    }
    inflight[url]=p;
    p.then(function(){ delete inflight[url]; },function(){ delete inflight[url]; });
    return p;
  }

  function emit(){ listeners.forEach(function(fn){ try{ fn(store); }catch(_){} });
    try{ document.dispatchEvent(new CustomEvent('agn:data',{detail:store})); }catch(_){} }

   
  var activeGen=0;   
  async function forecast(lat, lon, name, gen){
    /* v91.17.283.19 · the active point's values are its record in the page store (GET /api/point), the values every section shows */
    var P=await agnPS(); var j=P?await P.provider(lat,lon,{current:'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m',hourly:'temperature_2m,precipitation,wind_speed_10m',forecast_days:3}):null;
    if(!j) throw new Error('the record of this place is not available');
    var c=(j&&j.current)||{};
    var pt={ name:name||(store.activePoint&&store.activePoint.name)||'', lat:+lat, lon:+lon,
      t:c.temperature_2m, hum:c.relative_humidity_2m, rain:agnRainRate(c.precipitation,c),
      wind:c.wind_speed_10m, gust:c.wind_gusts_10m,
      hourly:(j&&j.hourly)||null, fetchedAt:Date.now(), source:'mach:forecast' };
    

    if(gen!=null && gen!==activeGen) return pt;
    store.activePoint=pt;
    
    if(Number.isFinite(pt.t)&&Number.isFinite(pt.hum)){
      var T=pt.t, RH=pt.hum;
      

      var _e = Number.isFinite(+(j&&j.elevation)) ? +j.elevation
             : (typeof window.agnElevationForUnit==='function'
                ? window.agnElevationForUnit(pt.lat, pt.lon) : null);
      var _wb = (typeof window.wetBulbStullC==='function')
              ? window.wetBulbStullC(T,RH,_e!=null?{elevationM:_e}:null) : null;
      store.thermal = (_wb==null)
        ? { t:T, hum:RH, wetBulb:null, elevationM:_e, basis:null,
            why:(typeof window.wetBulbRefusalWhy==='function'
                 ? window.wetBulbRefusalWhy(T,RH)
                 : 'no wet-bulb entry point available in this build'),
            fetchedAt:Date.now() }
        : { t:T, hum:RH, wetBulb:Math.round(_wb*10)/10, elevationM:_e, why:null,
            basis:(typeof window.wetBulbBasis==='function'
                   ? window.wetBulbBasis(_e!=null?{elevationM:_e}:null) : null),
            fetchedAt:Date.now() };
    }
    return pt;
  }

  function get(){ return store; }
  function activePoint(){ return store.activePoint; }
  function on(fn){ if(typeof fn==='function') listeners.push(fn); }

  

  async function setActive(station){
    if(!station||station.lat==null||station.lon==null) return store.activePoint;
    var gen=++activeGen;   
    

    try{
      await forecast(station.lat, station.lon, station.name, gen);
    }catch(e){
      if(gen===activeGen){
        store.activePoint={ name:station.name, lat:+station.lat, lon:+station.lon,
          t:station.t, hum:station.hum, rain:station.rain, wind:station.wind, gust:station.gust,
          hourly:null, fetchedAt:Date.now(), source:'seed', liveError:String(e&&e.message||e) };
        store.thermal=null;
        emit();
      }
      return store.activePoint;
    }
    if(gen!==activeGen) return store.activePoint;   
    emit();  
    

    try{ water(station.lat, station.lon).then(function(){ if(gen===activeGen) emit(); }); }catch(_){}
    return store.activePoint;
  }

  

  async function water(lat, lon, opts){
    

    opts = opts || {};
    /* v91.17.283.19 · the water inputs of the place are its bundle's land part (soil now, the 7 past days of rain) and riverflow part (the
       reach's daily discharge): GET /api/point, read once per place by the page store */
    var P=await agnPS(), B=P?await P.bundle(+lat,+lon):null, LP=P&&B?P.partOf(B,'land'):null, RP=P&&B?P.partOf(B,'riverflow'):null;
    

    var res={ rain:null, soilWet:null, antecedent:null, river:null, fetchedAt:Date.now(),
              weatherAvailable:false, riverAvailable:false };
    try{
      /* v91.17.283.20 · A4: the v283.16 inputs again: the provider's 15-minute rain now and soil now, and the hourly rain of the 7 past
         days and ALL of today, forecast hours included (the land part's water request, server/api/index.mjs) */
      if(!LP||!LP.ok||!LP.water) throw new Error('no land part'); var fj={current:LP.water.current||{}, hourly:LP.water.hourly||{}}; var c=fj.current||{};
      res.rain=agnRainRate(c.precipitation,c);
      res.soilWet=(c.soil_moisture_0_to_1cm!=null&&c.soil_moisture_1_to_3cm!=null)
        ? (c.soil_moisture_0_to_1cm+c.soil_moisture_1_to_3cm)/2 : c.soil_moisture_0_to_1cm;
      var past=(fj&&fj.hourly&&fj.hourly.precipitation)||[];
      res.antecedent=past.reduce(function(a,b){return a+(b||0);},0); 
      

      res.weatherAvailable=(res.rain!=null||res.soilWet!=null||res.antecedent!=null);
    }catch(_){}
    try{
      if(!RP||!RP.ok) throw new Error('no river part'); var d=RP.daily||{}, today=new Date(Date.now()+5*3600e3).toISOString().slice(0,10);
      var qs=(d.river_discharge||[]).filter(function(x,i){return x!=null&&String((d.time||[])[i]||'')>=today;});
      var pk=qs.length?Math.max.apply(null,qs):null;
      

      var near=null, bestKm=Infinity;
      try{
        (PK_RIVER_GAUGES||[]).forEach(function(g){
          var dy=(g.lat-lat)*111, dx=(g.lon-lon)*111*Math.cos(lat*Math.PI/180);
          var km=Math.sqrt(dx*dx+dy*dy); if(km<bestKm){ bestKm=km; near=g; }
        });
      }catch(_){}
      var rr={ratio:0, covered:false, level:'no-reference',
              basis:'no gauged reach within range - river state unknown'};
      if(near && bestKm<=60 && typeof riverRatio==='function'){
        rr=riverRatio(pk!=null?pk:qs[0], riverClimFor(near));
      }
      res.river={ q:qs[0], peak5d:pk, ratio:rr.ratio, covered:rr.covered,
        level:rr.level, basis:rr.basis, pctOfBankfull:rr.pctOfBankfull!=null?rr.pctOfBankfull:null,
        refGauge:(near&&bestKm<=60)?near.name:null, refKm:Math.round(bestKm) };
      

      res.riverAvailable=!!(res.river && (res.river.q!=null || res.river.peak5d!=null));
    }catch(_){}
    if(opts.persist !== false) store.water=res;
    return res;
  }

  

  async function national(force){
    if(typeof hydrateNational==='function'){
      var ns=await hydrateNational(force);
      store.national={ state:ns,
        byTehsil:(typeof DISTRICT_IN!=='undefined')?DISTRICT_IN:null,
        sweptAt:Date.now() };
    }
    emit();
    return store.national;
  }
  async function rivers(force){
    if(typeof riverSweep==='function'){
      var rs=await riverSweep(force);
      store.river={ byDistrict:(rs&&rs.byDistrict)||{}, gauges:(rs&&rs.gauges)||[], sweptAt:Date.now() };
    }
    emit();
    return store.river;
  }

  

  function compoundFlood(baseFloodScore, bundle){
    

    var w=bundle||store.water;
    if(!w || baseFloodScore==null) return null;
    

    var _anyTerm = (w.rain!=null || w.antecedent!=null || w.soilWet!=null || w.river!=null);
    var _declaredDown = (w.weatherAvailable===false && w.riverAvailable===false);
    if(_declaredDown || !_anyTerm){
      return { score:null, status:'unavailable', unavailable:true, uplift:null, primed:false,
               drivers:[],
               note:'Compound state unavailable — water inputs could not be retrieved. '
                   +'This is NOT a low-compound reading.' };
    }
    var base=+baseFloodScore;
    if(base<FR('compound.baseFloorToArm')) return { score:base, uplift:0, primed:false, note:'Base flood signal too low for a compound pathway.' };
    

    

    function _ramp(reg, x){
      if(x==null) return null;    
      var cap=reg.maxUplift;
      if(!isFinite(cap) || !isFinite(reg.zeroAt) || !isFinite(reg.fullAt)
         || reg.fullAt===reg.zeroAt) return null;
      var v=cap*(x-reg.zeroAt)/(reg.fullAt-reg.zeroAt);
      return isFinite(v) ? Math.max(0, Math.min(cap, v)) : null;
    }
    var _ca=FR('compound.antecedentMm7d');
    var antecedent = _ramp(_ca, w.antecedent);        
    var _cs=FR('compound.soilVv');
    var soil = _ramp(_cs, w.soilWet);                 

    var _cr=FR('compound.riverRise');
     
    var river = (w.river && w.river.covered)
      ? ((w.river.ratio!=null && isFinite(w.river.ratio))
           ? (isFinite(_cr.maxUplift) ? Math.max(0, Math.min(_cr.maxUplift, Math.max(0, w.river.ratio)*_cr.maxUplift)) : null)
           : null)
      : 0;
    

    if(antecedent===null || soil===null || river===null){
      return { score:null, status:'unavailable', unavailable:true, uplift:null, primed:false,
               drivers:[],
               note:'Compound state unavailable - '+([antecedent===null?'the 7-day antecedent rain':null, soil===null?'the root-zone soil water':null, river===null?'the river-rise ratio':null].filter(Boolean).join(', ')||'a declared compound ramp')+' did not arrive or could not be evaluated. This is NOT a low-compound reading.' };
    }
    var uplift = antecedent+soil+river;                    

    var COMPOUND_MULTIPLY = (function(){ try{ return FR('compound.multiplyScore'); }catch(_){ return false; } })();   

    var compound = COMPOUND_MULTIPLY
      ? Math.round(Math.min(100, base*(1+uplift)))
      : base;
    var primed = uplift>=0.4;
    var drivers=[];
    if(antecedent>0.15) drivers.push('primed basin ('+Math.round((w.antecedent||0))+'mm/7d)');
    if(soil>0.1) drivers.push('saturated soil');
    if(river>0.1) drivers.push('river '+(w.river.level||'elevated')
      +(w.river.pctOfBankfull!=null?' ('+w.river.pctOfBankfull+'% of bankfull)':''));
    if(w.river && !w.river.covered) drivers.push('river state unknown — no gauged reach in range');
    return { score:compound, base:base, uplift:Math.round(uplift*100)/100, primed:primed,
      drivers:drivers, note: primed
        ? 'Compound conditions present: '+(drivers.join(' + ')||'multiple water inputs')+'. Flood consequence elevated above the single-hazard signal.'
        : 'Water inputs present but not compounding strongly; flood consequence near the single-hazard signal.' };
  }

  AGN.data = {
    store:store, get:get, activePoint:activePoint, on:on,
    forecast:forecast, water:water, national:national, rivers:rivers, compoundFlood:compoundFlood, setActive:setActive, _fetch:_fetch, _key:key
  };
  /* v91.17.283.17 · the page opened at a handed-over place (agnBootPlace selected it before this store existed): the store takes it as
     its selected place now, so every section reads that place from the start (it was set only once the first forecast read returned) */
  try{ var _B=window.AGN_BOOT, _s=_B&&_B.booted&&typeof STATIONS!=='undefined'?STATIONS.find(function(x){ return x.id==='__live'; }):null;
    if(_s&&!store.activePoint){ store.activePoint={ name:_s.name, lat:+_s.lat, lon:+_s.lon, t:_s.t, hum:_s.hum, rain:_s.rain, wind:_s.wind, gust:_s.gust, hourly:null, fetchedAt:Date.now(), source:'selection', pending:true }; setActive(_s); } }catch(_){}
})();



(function(){
  if(typeof window.AGN==='undefined') window.AGN={};
  if(AGN.hazard) return;
  var HAZ={flood:'Flood',heat:'Heat stress',wind:'Wind and gusts',rain_hz:'Heavy rain',
           drought:'Drought',glof:'Glacial lake outburst flood (GLOF)',seismic:'Seismic',cold:'Cold stress (UTCI)',
           cyclone:'Cyclone',landslide:'Landslide'};   

  

  

  var NONHAZ={aqi:'Air quality', nss:'Natural sponginess',
              nss_baseline:'Ground sponge: screening index (soil and land cover), not a tested runoff forecast',
              nss_dynamic:'Runoff retention today: screening index, not a tested runoff forecast',
              nss_retention:'Storm retention capacity',
              nss_runoff:'Rain run-off, last 5 days: screening index, not a tested runoff forecast',
              '':'Heat discomfort (DI)'};
  var current='rain_hz';
  var listeners=[];
  function valid(k){ return (k in NONHAZ) || !!HAZ[k]; }
  function isHazard(k){ return !!HAZ[k===undefined?current:k]; }
  function label(k){ var q=(k===undefined?current:k); return HAZ[q]||NONHAZ[q]||''; }
  function get(){ return current; }
  function set(k, origin){
    if(!valid(k)) return current;
    if(k===current && origin!=='init') return current;   
    current=k;
    
    try{
      try{ if(window.aiState && window.AI_HAZARDS && AI_HAZARDS[k]) aiState.hazard=k; }catch(_){}    
      ['mapHazardPick','aiHazardSelect'].forEach(function(id){
        var el=document.getElementById(id);
        if(el && el.value!==k && origin!==id){
          var has=[].some.call(el.options||[],function(o){return o.value===k;});
          if(has) el.value=k;
        }
      });
    }catch(_){}
    listeners.forEach(function(fn){ try{ fn(current, origin); }catch(_){} });
    try{ document.dispatchEvent(new CustomEvent('agn:hazard',{detail:{hazard:current,origin:origin}})); }catch(_){}
    return current;
  }
  function on(fn){ if(typeof fn==='function') listeners.push(fn); }
  

  var displayMode=null;
  function setDisplay(k){ displayMode=k; return displayMode; }
  function getDisplay(){ return displayMode||current; }
  AGN.hazard={ setDisplay:setDisplay, getDisplay:getDisplay, set:set, get:get, label:label, on:on, valid:valid, isHazard:isHazard, all:HAZ, nonHazard:NONHAZ };
})();



const NATIONAL_STATE = { loaded:false, loading:false, at:null, covered:0 };
window.NATIONAL_STATE = NATIONAL_STATE;

async function hydrateNational(force){
  if(NATIONAL_STATE.loading) return NATIONAL_STATE;
  if(NATIONAL_STATE.loaded && !force) return NATIONAL_STATE;
  if(typeof PK_DISTRICT_CENTROIDS==='undefined' || typeof DISTRICT_IN==='undefined') return NATIONAL_STATE;
  /* v91.17.283.19 · in the browser the national rows are the district points' corrected records (the page store, one batch per run); the
     provider sweep below runs only in the server's hazard engine (engine mode) */
  if(!(window.AGN&&AGN.engineMode)){ NATIONAL_STATE.loading=true;
    var _n=0; try{ var _P=await agnPS(); _n=_P?await _P.districts():0; }catch(_){ _n=0; }
    Object.assign(NATIONAL_STATE,{loading:false, loaded:_n>0, resolution:'tehsil', points:_n, covered:_n, sweepable:_n, estimated:0, failedUnits:0, failedBatches:0, at:Date.now(), source:'point records'});
    return NATIONAL_STATE; }
  NATIONAL_STATE.loading=true;

  
  var byDist={};
  for(var i=0;i<PK_DISTRICT_CENTROIDS.length;i++){
    var c=PK_DISTRICT_CENTROIDS[i];
    if(!byDist[c.district]) byDist[c.district]=c;
  }
  var dists=Object.keys(byDist);    

  var pts=[];
  (function(){
    var C=(typeof PK_DISTRICT_CENTROIDS!=='undefined')?PK_DISTRICT_CENTROIDS:[];
    var IIOJK='Indian Illegally Occupied Jammu Kashmir';
    for(var i=0;i<C.length;i++){
      var c=C[i];
      if(!c || !c.key || !c.district || c.province===IIOJK) continue;
      if(c.lat==null || c.lon==null) continue;
      if(typeof DISTRICT_IN!=='undefined' && !DISTRICT_IN[c.key]) continue;
      pts.push(c);
    }
  })();

  

  var _tier=null; try{ _tier=(window.AGN&&AGN.tier)?AGN.tier.current():null; }catch(_){}
  var BATCH=120;
  try{
    if(window.AGN&&AGN.tier&&typeof AGN.tier.chunkFor==='function'){
       
      BATCH=AGN.tier.chunkFor(23, 11);
    }
  }catch(_){}
  if(!(BATCH>0)) BATCH=120;
  var LANES=(_tier&&_tier.lanes)||2, PACE=(_tier&&_tier.interChunkMs)||0;
  var RETRIES=(_tier&&_tier.retryDelays)||[3000,10000,30000];
  

  var RETRY_BUDGET_MS=45000, FIRST_WAIT_CAP_MS=8000;
  var _sweepDeadline=Date.now()+RETRY_BUDGET_MS, _networkDown=false;
  var covered=0, failedUnits=0, failedBatches=0, failReasons=Object.create(null), _jobs=[];
  

  for(var b=0;b<pts.length;b+=BATCH){
    _jobs.push((function(slice){ return function(){ return (async function(){
    var lats=slice.map(function(p){return p.lat.toFixed(4);}).join(',');
    var lons=slice.map(function(p){return p.lon.toFixed(4);}).join(',');
    

    var _elevCorrected=0;
    var elevs=slice.map(function(p){
      var e=null;
      try{ if(window.AGN && AGN.elevation) e=AGN.elevation.queryElevation(p); }catch(_){}
      if(e!=null && isFinite(e)){ _elevCorrected++; return e; }
      return 'nan';
    }).join(',');
    try{

      var u='https://api.open-meteo.com/v1/forecast?latitude='+lats+'&longitude='+lons
        +'&elevation='+elevs
        +'&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m'
        

        +',soil_moisture_0_to_1cm,soil_moisture_1_to_3cm'
        +',soil_moisture_9_to_27cm,soil_moisture_27_to_81cm'
        

        +'&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,'
        +'apparent_temperature_max,relative_humidity_2m_mean,dew_point_2m_mean,'
        +'precipitation_sum,precipitation_hours,precipitation_probability_max,'
        +'wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,'
        +'shortwave_radiation_sum,et0_fao_evapotranspiration,snowfall_sum'
        

        +'&past_days=7&forecast_days=4&timezone=Asia%2FKarachi';
      

      

      var r=null, _lastErr=null, _terminal=false;
      var _attempts=(_networkDown||Date.now()>=_sweepDeadline)?0:RETRIES.length;
      for(var _a=0; _a<=_attempts; _a++){
        try{
          r=await AGN.api.fetch(u);
          if(r && r.ok) break;
          var _st=r&&r.status;
          _lastErr='HTTP '+_st;
          try{
            var _bd=await r.clone().text();
            if(/daily .{0,24}limit|limit exceeded.{0,24}tomorrow/i.test(_bd)){
              _terminal=true; _lastErr='daily quota exhausted \u2014 retrying cannot succeed today';
            }
          }catch(_){}
          if(_st>=400 && _st<500 && _st!==429) _terminal=true;
          r=null;
        }catch(_e){
          _lastErr=(_e&&_e.message)||'fetch failed';
          _networkDown=true; _terminal=true;
          r=null;
        }
        if(_terminal || _a>=_attempts) break;
        var _wait=Math.min(RETRIES[_a], (_a===0)?FIRST_WAIT_CAP_MS:RETRIES[_a],
                           Math.max(0,_sweepDeadline-Date.now()));
        if(_wait<=0) break;
        await new Promise(function(res){ setTimeout(res, _wait); });
      }
      if(!r) throw new Error(_lastErr||'batch failed after retries');
      var j=await r.json();
      var arr=Array.isArray(j)?j:[j];
      for(var k=0;k<slice.length;k++){
        var cur=arr[k]&&arr[k].current; if(!cur) continue;
        

        try{
          var _row0=DISTRICT_IN[slice[k].key];
          if(_row0){
            var _ec=null;
            try{ if(window.AGN&&AGN.elevation) _ec=AGN.elevation.forCentroid(slice[k]); }catch(_){}
            _row0.requestedElevM = _ec ? _ec.queryElevation : null;
            _row0.resolvedElevM  = (arr[k] && arr[k].elevation!=null) ? arr[k].elevation : null;
            _row0.elevCorrected  = !!_ec;
            _row0.elevBasis      = _ec
              ? ('population-weighted (GLO-30 x WorldPop); polygon mean '+_ec.polygonMean+' m, '
                 +(_ec.deltaM>=0?'-':'+')+Math.abs(_ec.impliedBiasC).toFixed(1)+' \u00B0C correction')
              : 'no correction available for this unit \u2014 provider DEM at the centroid';
            _row0.elevRefuseSingle = _ec ? _ec.refuseSingleValue : false;
          }
        }catch(_){}
        

        

        var api=null, apiRaw=null;
        try{
          var ds=arr[k]&&arr[k].daily&&arr[k].daily.precipitation_sum;
          if(Array.isArray(ds)&&ds.length&&window.AGN&&AGN.wetness){
            apiRaw = AGN.wetness.raw(ds.slice(0,7));
            api    = AGN.wetness.normalize(apiRaw);
          }
        }catch(_){}
        

        var sm=null, smRoot=null;
        try{
          var s1=cur.soil_moisture_0_to_1cm, s3=cur.soil_moisture_1_to_3cm;
          if(s1!=null && s3!=null) sm=(Number(s1)+Number(s3))/2;
          else if(s1!=null) sm=Number(s1);
          var r1=cur.soil_moisture_9_to_27cm, r2=cur.soil_moisture_27_to_81cm;
           
          if(r1!=null && r2!=null) smRoot=(Number(r1)*18+Number(r2)*54)/72;
          else if(r1!=null) smRoot=Number(r1);
        }catch(_){}
        

        var days=null;
        try{
          var dd=arr[k]&&arr[k].daily;
          if(dd&&dd.precipitation_sum){
            var n=dd.precipitation_sum.length, st4=Math.max(0,n-4);
            function cut(a){ return (a||[]).slice(st4); }
             
            var pAll2=dd.precipitation_sum, _W=(window.AGN&&AGN.wetness)?AGN.wetness:null;
            var _K=_W?_W.config.K:0.90, acc2=0;
            for(var q=0;q<st4;q++) acc2=acc2*_K+Math.max(0,Number(pAll2[q])||0);
            var apiSeries=[];
            for(var q2=st4;q2<n;q2++){
              apiSeries.push(_W?_W.normalize(acc2):Math.max(0,Math.min(1,acc2/120)));
              acc2=acc2*_K+Math.max(0,Number(pAll2[q2])||0); }
            var T=cut(dd.temperature_2m_max), rec=[];
            for(var di2=0;di2<T.length&&di2<4;di2++){
              rec.push({
                date:(dd.time||[]).slice(st4)[di2]||null,
                tmax:cut(dd.temperature_2m_max)[di2], tmin:cut(dd.temperature_2m_min)[di2],
                tmean:cut(dd.temperature_2m_mean)[di2], appMax:cut(dd.apparent_temperature_max)[di2],
                rh:cut(dd.relative_humidity_2m_mean)[di2], dew:cut(dd.dew_point_2m_mean)[di2],
                precip:cut(dd.precipitation_sum)[di2], prHours:cut(dd.precipitation_hours)[di2], precipCor:(dd.precipitation_sum_corrected?cut(dd.precipitation_sum_corrected)[di2]:null), precipRaw:(dd.precipitation_sum_raw?cut(dd.precipitation_sum_raw)[di2]:null),
                prProb:cut(dd.precipitation_probability_max)[di2],
                wind:cut(dd.wind_speed_10m_max)[di2], gust:cut(dd.wind_gusts_10m_max)[di2],
                uv:cut(dd.uv_index_max)[di2], rad:cut(dd.shortwave_radiation_sum)[di2],
                et0:cut(dd.et0_fao_evapotranspiration)[di2],
                snow:cut(dd.snowfall_sum)[di2],
                api:apiSeries[di2]
              });
            }
            if(rec.length) days=rec;
          }
        }catch(_){}
        var reading={ t:cur.temperature_2m, hum:cur.relative_humidity_2m,
          rain:agnRainRate(cur.precipitation,cur), wind:cur.wind_speed_10m,
          api:api, apiRaw:apiRaw, soilSurface:sm, soilMoist:((typeof r1!=='undefined'&&r1!=null&&isFinite(Number(r1)))?Number(r1):null), smRootFc:smRoot, days:days };   /* v91.17.283.10: soilMoist is the 7-28 cm layer (as every other writer of the row); the 0-7 cm value is kept as soilSurface, the forecast model's root zone as smRootFc */
        

        var row=DISTRICT_IN[slice[k].key];
        if(row){
          if(!(row.weatherLive && row.districtFetchedAt && (Date.now()-row.districtFetchedAt)<5*60*1000)){
            row.t=reading.t; row.hum=reading.hum; row.rain=reading.rain; row.wind=reading.wind;
            if(reading.api!=null) row.api=reading.api;
            if(reading.soilMoist!=null) row.soilMoist=reading.soilMoist;   /* forecast model soil moisture 7-28 cm (ECMWF IFS layer 2, served under the 9-27 cm name) */ if(reading.soilSurface!=null) row.soilSurface=reading.soilSurface; if(reading.smRootFc!=null) row.smRootFc=reading.smRootFc;   /* v91.17.283.10: smRoot stays the drought root zone (ERA5, the reanalysis of its own percentile); the sweep no longer overwrites it with the forecast model's */
            if(reading.days) row.days=reading.days;
            row.nationalLive=true; row.nationalAt=Date.now();
            row.fcSource='tehsil_centroid_open_meteo';
            row.fcLabel='tehsil-centroid forecast';
            covered++;
          } else {
            

            covered++;
          }
        }
      }
    }catch(e){
      

      failedBatches++; failedUnits += slice.length;
      var _why=(e&&e.message)||'unknown';
      failReasons[_why]=(failReasons[_why]||0)+1;
      if(window.__MACH_DEBUG) console.debug('[hydrate batch]', _why);
    }
    })(); }; })(pts.slice(b,b+BATCH)));
  }
  

  await (async function(){
    var n=Math.max(1, LANES||1), i=0;
    async function lane(){
      while(i<_jobs.length){
        var run=_jobs[i++];
        try{ await run(); }catch(_){}
        if(PACE>0) await new Promise(function(r){ setTimeout(r,PACE); });
      }
    }
    var runners=[]; for(var L=0;L<n;L++) runners.push(lane());
    await Promise.all(runners);
  })();
  NATIONAL_STATE.resolution='tehsil';
  NATIONAL_STATE.points=pts.length;
  NATIONAL_STATE.loaded=true; NATIONAL_STATE.loading=false;
  NATIONAL_STATE.at=Date.now(); NATIONAL_STATE.covered=covered;
  NATIONAL_STATE.sweepable=pts.length;               
  NATIONAL_STATE.failedUnits=failedUnits;
  NATIONAL_STATE.failedBatches=failedBatches;
  NATIONAL_STATE.failReasons=failReasons;
  NATIONAL_STATE.batchSize=BATCH; NATIONAL_STATE.lanes=LANES;
  NATIONAL_STATE.tier=(_tier&&_tier.id)||null;
  

  try{
    if(window.AGN && AGN.field && covered>0){
      var _liveRows=[], _gapRows=[];
      for(var _i=0;_i<pts.length;_i++){
        var _p=pts[_i], _row=DISTRICT_IN[_p.key];
        if(!_row) continue;
        var _e=null; try{ if(AGN.elevation) _e=AGN.elevation.queryElevation(_p); }catch(_){}
        var _rec={key:_p.key, lat:_p.lat, lon:_p.lon, elev:(_e!=null&&isFinite(_e))?_e:null};
         
        var _distLive=!!(_row.weatherLive && _row.districtFetchedAt && (Date.now()-_row.districtFetchedAt)<5*60*1000 && _row.t!=null);
        if((_row.nationalAt && _row.fcSource==='tehsil_centroid_open_meteo') || _distLive){
          _rec.temperature_2m=_row.t; _rec.relative_humidity_2m=_row.hum;
          _rec.wind_speed_10m=_row.wind; _liveRows.push(_rec);
        } else _gapRows.push(_rec);
      }
      if(_liveRows.length>=3 && _gapRows.length){
        var _f=AGN.field.fill(_liveRows,_gapRows);
        var _applied=0;
        _f.rows.forEach(function(rw){
          var _r=DISTRICT_IN[rw.key]; if(!_r) return;
          var _any=false;
          if(rw.values.temperature_2m){ _r.t=Math.round(rw.values.temperature_2m.value*10)/10; _any=true; }
          if(rw.values.relative_humidity_2m){ _r.hum=Math.round(rw.values.relative_humidity_2m.value); _any=true; }
          if(rw.values.wind_speed_10m){ _r.wind=Math.round(rw.values.wind_speed_10m.value*10)/10; _any=true; }
          

          var _ctx=rw.values.precipitation;
          if(_ctx && _ctx.contextOnly){
            _r.rainEstimate=Math.round(_ctx.value*10)/10;
            _r.rainEstimateCaveat=_ctx.caveat;
            _r.rainEstimateTail=_ctx.tailWarning;
            _r.rainEstimateNeverScores=_ctx.neverScores;
          }
          if(_any){
            _applied++;
            _r.estimated=true;                        
            _r.estimatedFrom=(rw.values.temperature_2m||{}).neighbours||null;
            _r.estimatedNearestKm=(rw.values.temperature_2m||{}).nearestKm||null;
            _r.fcSource='agn_field_estimate';
            _r.fcLabel='estimated from live neighbours — not a forecast for this tehsil';
            

            _r.rain=null; _r.gust=null;
            _r.soilMoist=null; _r.smRoot=null; _r.soilSurface=null; _r.smRootFc=null; _r.api=null; _r.apiRaw=null;
            _r.antecedentCleared=true;

            

            _r.windEstimated=true;
          }
        });
        NATIONAL_STATE.estimated=_applied;
        NATIONAL_STATE.estimateRefused=_f.refusedUnits;
        NATIONAL_STATE.estimateError=_f.error;
        NATIONAL_STATE.estimateStatement=_f.statement;
        NATIONAL_STATE.estimateRefusedVars=_f.refusedVariables;
      }
    }
  }catch(_ef){ if(window.__MACH_DEBUG) console.debug('[field fill]', _ef&&_ef.message); }
  try{ document.dispatchEvent(new CustomEvent('agn:national',{detail:{covered:covered}})); }catch(_){}
  return NATIONAL_STATE;
}
window.hydrateNational = hydrateNational;

const FLOOD_CACHE = {};   


const ENS_CACHE = {};    
const FLOOD_LOADING = {};



const EQFEED = { quakes:[], loaded:false, loading:false, fetchedAt:null, err:null };

const EQ_BBOX = { minLat:22, maxLat:39, minLon:59, maxLon:79 };
async function usgsLoad(){
  if(EQFEED.loaded || EQFEED.loading) return EQFEED;
  EQFEED.loading=true;
  try{
    
     
    const url=(function(){ try{ if(/^https?:$/.test(location.protocol)) return location.origin+'/api/ext/usgs'; }catch(_){} return 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson'; })();
    const r=await AGN.api.fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('usgs '+r.status);
    const j=await r.json();
    const feats=(j&&j.features)||[];
    EQFEED.quakes=feats.map(f=>{
      const g=f.geometry&&f.geometry.coordinates, p=f.properties||{};
      if(!g) return null;
      const lon=g[0], lat=g[1], mag=p.mag;
      if(lat<EQ_BBOX.minLat||lat>EQ_BBOX.maxLat||lon<EQ_BBOX.minLon||lon>EQ_BBOX.maxLon) return null;
      if(mag==null) return null;
      return { lat, lon, mag, time:p.time, place:p.place };
    }).filter(Boolean);
    EQFEED.loaded=true; EQFEED.fetchedAt=Date.now();
  }catch(e){ EQFEED.err=String(e&&e.message||e); EQFEED.loaded=false; }
  finally{ EQFEED.loading=false; }
  return EQFEED;
}
window.usgsLoad=usgsLoad; window.__EQFEED=EQFEED;


function _kmBetween(aLat,aLon,bLat,bLon){
  const R=6371, dLat=(bLat-aLat)*Math.PI/180, dLon=(bLon-aLon)*Math.PI/180;
  const s=Math.sin(dLat/2)**2 + Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}


function seismicLiveNudge(lat, lon, name){
  try{ return (window.AGN&&AGN.quake&&typeof AGN.quake.forDistrict==='function')?AGN.quake.forDistrict(lat, lon, name):null; }catch(_){ return null; }
}
window.seismicLiveNudge=seismicLiveNudge;

async function floodLoad(s){
  if(!s || s.lat==null || s.lon==null) return null;
  const key=`${(+s.lat).toFixed(3)},${(+s.lon).toFixed(3)}`;
  if(FLOOD_CACHE[key]) return FLOOD_CACHE[key];
  if(FLOOD_LOADING[key]) return null;
  FLOOD_LOADING[key]=true;
  try{
     
    

    /* v91.17.283.12 (v283.13 hand-off) · the river reference of a point is the river link of its tehsil (GET /api/flood/riverlink: the gauged
       reaches along the main stem through or along it, by drainage), never "any gauge within 60 km". No link, or no answer: not assessed. */
    const NA=function(why){ FLOOD_CACHE[key]={loaded:true, covered:false, ratio:0, level:'not-assessed', q:null, peak:null, basis:'river flood not assessed at this point: '+why+' (flash-flood and pluvial legs still apply)', refGauge:null, refKm:null, at:Date.now()}; return FLOOD_CACHE[key]; };
    let RL=null; try{ RL=await AGN.pointState.part('river',+s.lat,+s.lon); }catch(_){ RL=null; }   /* v91.17.283.19: the bundle's river part */
    if(!RL||RL.ready!==true) return NA(RL&&RL.why?RL.why:'the river link of this place is not available on this server');
    if(RL.offFloodplain) return NA('the place stands off the floodplain of its river');
    const LR=RL.reaches||{}; let _g=null, _best=Infinity;
    (PK_RIVER_GAUGES||[]).forEach(function(g){ const r=g.serverReach&&LR[g.serverReach]; if(!r) return; const km=(r.settlementKmToRiver!=null&&isFinite(r.settlementKmToRiver))?+r.settlementKmToRiver:999; if(km<_best){ _best=km; _g=g; } });
    if(!_g) return NA('no gauged reach of the main stem passes through or along this tehsil');
    const _gk=_best<999?_best:null;
    const url=`https://flood-api.open-meteo.com/v1/flood?latitude=${_g.lat}&longitude=${_g.lon}`
      +`&daily=${AGN_FLOOD_POLICY.daily.join(',')}&ensemble=true`
      +`&forecast_days=${AGN_FLOOD_POLICY.operationalDays}&past_days=0&timezone=Asia%2FKarachi`;
    const r=await AGN.api.fetch(url); if(!r.ok) throw new Error('flood '+r.status);
    const j=await r.json();
    const d=j&&j.daily; if(!d||!d.river_discharge) throw new Error('no discharge');
    const q=d.river_discharge[0];
    let peak=null, peakDay=0;
    (d.river_discharge||[]).forEach(function(v,i){ if(v!=null&&(peak==null||v>peak)){ peak=v; peakDay=i; } });

    const near=_g, clim=riverClimFor(near);
    let rr=riverRatio(peak!=null?peak:q, clim);
    if(rr.covered) rr.basis=rr.basis+' (reference: '+near.name+', the linked reach of this tehsil'+(_gk!=null?', '+Math.round(_gk)+' km from the river':'')+')';
    const rec={loaded:true, q:q, peak:peak, peakDay:peakDay,
               ratio:rr.ratio, covered:rr.covered, level:rr.level, basis:rr.basis,
               pctOfBankfull:rr.pctOfBankfull!=null?rr.pctOfBankfull:null,
               refGauge:near.name, refKm:_gk!=null?Math.round(_gk):null, riverLink:RL.version||true,
               refYears:rr.refYears||null, at:Date.now()};
    FLOOD_CACHE[key]=rec;
    return rec;
  }catch(e){
    FLOOD_CACHE[key]={loaded:false, covered:false, ratio:0, err:String(e&&e.message||e), at:Date.now()};
    return FLOOD_CACHE[key];
  }finally{ delete FLOOD_LOADING[key]; }
}





const DECISION_HAZARDS = (window.AGN && AGN.hazardRegistry && AGN.hazardRegistry.rankable)
    ? AGN.hazardRegistry.rankable()           
    : ['flood','heat','drought','wind','cold','landslide'];
const STANDING_HAZARDS = ['glof','seismic','cyclone'];
try{ window.DECISION_HAZARDS=DECISION_HAZARDS; window.STANDING_HAZARDS=STANDING_HAZARDS; }catch(_){}





function ensembleAgreement(name){
  try{
    const c=(typeof PK_DISTRICT_CENTROIDS!=='undefined')&&PK_DISTRICT_CENTROIDS.find(x=>x.district===name);
    if(c){ const k=`${(+c.lat).toFixed(3)},${(+c.lon).toFixed(3)}`; const e=ENS_CACHE[k];
      if(e&&e.loaded&&e.agreement!=null) return e.agreement; }
  }catch(err){ if(window.__MACH_DEBUG) console.debug("[mach swallowed]", err&&err.message); }
  return null;
}
 
function decisionConfidence(name){ return ensembleAgreement(name); }



function districtVerdict(name, preferHazard){
  if(!isScoreableDistrict(name)) return null;   

  const lead=(typeof aiState!=='undefined'&&aiState.lead)||24;
  const all=[];
  let anyResolved=false;
  for(const hz of DECISION_HAZARDS){
    const inp=__dayInp(name, hz);
    if(!inp) continue;
    anyResolved=true;
    let r=null; try{ r=aiDistrictRisk(inp,hz,lead,name); }catch(e){ console.warn("[mach] aiDistrictRisk failed:", e&&e.message); }
    if(r&&r.score!=null) all.push({hazard:hz, score:r.score, drivers:r.drivers||null, notes:r.notes||null, top:r.top||null});
  }
  if(!all.length) return null;
  

  all.sort(function(a,b){
    var HV=(window.AGN&&AGN.hazardValue)||null;
    

    var la=(window.AGN&&AGN.level&&AGN.level.index)?AGN.level.index(a.score):null, lb=(window.AGN&&AGN.level&&AGN.level.index)?AGN.level.index(b.score):null;
    if(la!=null&&lb!=null&&la!==lb) return lb-la;
    var ra=HV?(HV.verdictRank[HV.verdictOf(a.score)]||0):0;
    var rb=HV?(HV.verdictRank[HV.verdictOf(b.score)]||0):0;
    if(rb!==ra) return rb-ra;
     
    if(preferHazard){ var pa=(a.hazard===preferHazard)?0:1, pb=(b.hazard===preferHazard)?0:1; if(pa!==pb) return pa-pb; }
     
    return String(a.hazard||a.label||'').localeCompare(String(b.hazard||b.label||''));
  });
  

  

  

  const STANDING=new Set((window.AGN && AGN.hazardRegistry && AGN.hazardRegistry.of)
    ? AGN.hazardRegistry.of('standing') : ['glof']);
  

  const CONDITION=new Set((window.AGN && AGN.hazardRegistry && AGN.hazardRegistry.of)
    ? AGN.hazardRegistry.of('accumulated') : ['drought']);
  if(!anyResolved) return null;   
  const liveAll=all.filter(x=>!STANDING.has(x.hazard) && !CONDITION.has(x.hazard));
  

  const standingTop=all.find(x=>STANDING.has(x.hazard))||null;
  const conditionTop=all.find(x=>CONDITION.has(x.hazard))||null;
  

  const eventLead=liveAll.length?liveAll[0]:null;
  let top=eventLead||conditionTop||all[0];
  const leadIsCondition=!eventLead && !!conditionTop;
  

  

  const primedInp = __dayInp(name, 'flood');
  const primed = (primedInp && primedInp.api!=null && primedInp.api>=0.6)
    ? {api:+primedInp.api.toFixed(2), soil:(primedInp.soilMoist!=null?+primedInp.soilMoist.toFixed(3):null)}
    : null;
  const band=(typeof aiBand==='function')?aiBand(top.score):{band:'',color:'var(--navy)'};
  const conf=decisionConfidence(name);

  
  
  
  
  
  
  
  
  
  
  
  
  
  let verdict, action, vcolor;
  

  const s=top.score, agree = conf,
        lowAgree = (agree!=null && agree<65), unknownAgree = (agree==null);
   
  const _agreementBasis = (conf==null)
    ? 'Ensemble agreement has not been computed for this unit'
    : 'Agreement is spread, not measured forecast skill';
  const verifyUrgency = (s>=82 && (lowAgree||unknownAgree)) ? 'high'
                      : (s>=65 && (lowAgree||unknownAgree)) ? 'elevated'
                      : 'routine';
  if(s>=82){ verdict='Act'; }
  else if(s>=65){ verdict='Watch'; }
  else if(s>=45){ verdict='Monitor'; }    
  else { verdict='Low'; }
  

  

  const HAZARD_ACTION = {
    flood:   { Act:'Escalate now: verify rainfall, drainage and exposed crossings; move assets off the floodplain and confirm access routes',
               Watch:'Brief teams; check drainage and crossings and monitor short-range rainfall — a pluvial signal moves in hours' },
    rain_hz: { Act:'Escalate now: suspend outdoor lifting and confirm drainage capacity on site',
               Watch:'Brief teams; monitor short-range rainfall intensity and check site drainage' },
    heat:    { Act:'Escalate now: stop or reschedule outdoor work, activate work-rest cycles, hydration and shaded recovery, and start health surveillance',
               Watch:'Brief supervisors; bring forward shift start times, enforce work-rest cycles and confirm water and shade before the peak' },
    

    drought: { Act:'Within the week: review the water balance and allocation for this unit — supply contracts and municipal storage where it is urban, irrigation priority and crop stress where it is agricultural. A 90-day condition: no short-range forecast resolves it and no escalation clock applies; track the accumulation indices monthly',
               Watch:'Over the coming weeks: review water balance and supply against the accumulation indices (SPEI/SPI-90, root-zone stress). Short-range forecasts will not resolve this' },
    wind:    { Act:'Escalate now: suspend crane and lifting operations, secure loose material, and apply the asset wind operating limits',
               Watch:'Brief teams; confirm wind operating limits for cranes and elevated work and secure loose material before the gust peak' },
    cold:    { Act:'Escalate now: protect exposed personnel, water lines and plant against freezing; confirm heating and transport continuity',
               Watch:'Brief teams; check frost protection on water lines and plant and confirm cold-weather transport arrangements' },
    glof:    { Act:'Escalate now: verify lake and melt trigger context, warn downstream settlements and confirm communication readiness',
               Watch:'Verify the lake and melt trigger context and confirm downstream communication readiness — this is corridor screening, not a live signal' },
    

    landslide:{Act:'Escalate now: close or inspect cut slopes and exposed routes and verify field conditions',
               Watch:'Brief teams; inspect cut slopes and exposed routes and monitor rainfall against the trigger threshold' }
  };
  try{ (window.AGN=window.AGN||{}).opsActionText = { table:HAZARD_ACTION, of:_verdictAction }; }catch(_){}
  function _verdictAction(verdict, hazard){
    var h = HAZARD_ACTION[hazard];
    if (h && h[verdict]) return h[verdict];
    if (verdict === 'Act')   return 'Escalate + verify in field';
    if (verdict === 'Watch') return 'Brief teams and verify field conditions'
                                  + ' (no hazard-specific guidance is held for ' + String(hazard||'this hazard') + ')';
    return null;
  }
  const VMAP={Act:{a:'Escalate + verify in field',c:'var(--red)'},Watch:{a:'Brief teams; monitor short-range forecast and verify field conditions',c:'var(--sev-4,#e8833a)'},Monitor:{a:'Routine monitoring',c:'var(--sev-3,#d9a441)'},Low:{a:'No action indicated',c:'var(--sea,#14B8A6)'},Clear:{a:'No action indicated',c:'var(--sea,#14B8A6)'}};
   
  action=_verdictAction(verdict, top.hazard) || VMAP[verdict].a; vcolor=VMAP[verdict].c;
  

  

  if(verifyUrgency !== 'routine'){
    action = action + (unknownAgree
      ? ' \u00b7 ensemble agreement not measured for this unit'
      : ' \u00b7 verify first (' + verifyUrgency + ' urgency: members disagree)');
  }

  
  const hzLabel=((typeof AI_HAZARDS!=='undefined'&&AI_HAZARDS[top.hazard])||{}).label||top.hazard;
  

  let _coNames=[];
  try{
    var _r=AGN.hazardValue.verdictRank[AGN.hazardValue.verdictOf(top.score)]||0;
    _coNames=all.filter(function(x){ return x.hazard!==top.hazard && x.score!=null
              && (AGN.hazardValue.verdictRank[AGN.hazardValue.verdictOf(x.score)]||0)===_r; })
             .map(function(x){ return ((typeof AI_HAZARDS!=='undefined'&&AI_HAZARDS[x.hazard])||{}).label||x.hazard; })
             .sort();
  }catch(_){}
  let why=`${hzLabel} at ${top.score}/100 (${band.band})`
        + (_coNames.length ? ` \u00b7 co-equal at this class with ${_coNames.join(' and ')} \u2014 no index comparison separates them` : '');
  if(top.top) why+=` · ${top.top}`;
  if(conf!=null) why+= ` \u00b7 ensemble agreement ${Math.round(conf)}%`
      + (lowAgree ? ' (members disagree \u2014 verify before acting; agreement is spread, not skill)' : '');
  else why+=' · agreement not loaded (select district for ensemble)';

  const f=(typeof PK_DISTRICTS!=='undefined')&&PK_DISTRICTS.features.find(x=>x.properties.key===name);
  

  var lanes = all.map(function(x){
    var lb = (typeof aiBand==='function') ? aiBand(x.score) : {band:'',color:'var(--navy)'};
    

    var lv = (window.AGN && AGN.hazardValue && AGN.hazardValue.verdictOf)
           ? AGN.hazardValue.verdictOf(x.score, x.hazard)
           : (typeof x.score==='number' && isFinite(x.score)
                ? (x.score>=82 ? 'Act' : x.score>=65 ? 'Watch' : x.score>=45 ? 'Monitor' : 'Low')
                : null);
    var lu = (x.score>=82 && (lowAgree||unknownAgree)) ? 'high'
           : (x.score>=65 && (lowAgree||unknownAgree)) ? 'elevated' : 'routine';
    var la = (HAZARD_ACTION[x.hazard] && HAZARD_ACTION[x.hazard][lv])
           || (VMAP[lv] && VMAP[lv].a) || null;
    return { hazard:x.hazard, score:x.score, band:lb.band, color:lb.color,
             verdict:lv, action:la, verify_urgency:lu,
             standing:STANDING.has(x.hazard),
             condition:CONDITION.has(x.hazard),
             timescale:STANDING.has(x.hazard)?'static':CONDITION.has(x.hazard)?'weeks-months':'hours-days',
             event:!STANDING.has(x.hazard) && !CONDITION.has(x.hazard),
             drivers:x.drivers||null, notes:x.notes||null,
             lane_basis:'this hazard\'s own verdict and action, derived from its own '
                       +'index and not from whichever hazard ranked highest on this unit' };
  });
  var actionable = lanes.filter(function(l){ return l.verdict==='Act' || l.verdict==='Watch'; });

  

  var _leadVerdict = top ? ((window.AGN&&AGN.hazardValue&&AGN.hazardValue.verdictOf)
                            ? AGN.hazardValue.verdictOf(top.score) : null) : null;
  var _leaders = lanes.filter(function(l){ return l.verdict===_leadVerdict; })
                      .map(function(l){ return {hazard:l.hazard, score:l.score,
                                                verdict:l.verdict, action:l.action}; });
  if(!_leaders.length && top) _leaders=[{hazard:top.hazard, score:top.score,
                                         verdict:_leadVerdict, action:null}];

  return {name, prov:f?f.properties.province:'', standing:standingTop, primed:primed,
          condition:conditionTop ? {hazard:conditionTop.hazard, score:conditionTop.score,
                                    verdict:(window.AGN&&AGN.hazardValue&&AGN.hazardValue.verdictOf)?AGN.hazardValue.verdictOf(conditionTop.score):null,
                                    timescale:'weeks-months'} : null,
          leadIsCondition:leadIsCondition,
          leadBasis:leadIsCondition
            ? 'no event hazard resolved for this unit; the lead shown is its accumulated condition and is flagged as such'
            : 'the event hazard at the worst operational class; accumulated conditions and standing susceptibilities are reported in their own lanes',
          leaders:_leaders, coEqual:_leaders.length>1, leadVerdict:_leadVerdict,
          leaders_basis:'every hazard holding the worst operational class for this unit. '
                       +'When more than one does, they are co-equal: no index comparison '
                       +'separates them and none is reported as leading the others.',
          top:{hazard:top.hazard,score:top.score,band:band.band,color:band.color,
                
               top_basis:'the display lead for this unit: the hazard at the worst operational '
                        +'class, with hazard NAME breaking ties within that class — a name carries no claim, which is why it is the right tie-break. It is not '
                        +'chosen by comparing indexes across hazards, which this build does not '
                        +'support. Every hazard that scored carries its own verdict and action '
                        +'in `lanes`; the lead orders the board and nothing else.',
               top_class:(window.AGN&&AGN.hazardValue&&AGN.hazardValue.verdictOf)
                          ? AGN.hazardValue.verdictOf(top.score) : null},
          lanes:lanes,
          actionable_hazards:actionable.map(function(l){ return l.hazard; }),
          actionable_count:actionable.length,
          multi_hazard:actionable.length>1,
          multi_hazard_note:actionable.length>1
            ? (actionable.length+' hazards on this unit are at Watch or above and each carries '
               +'its own instruction: '+actionable.map(function(l){ return l.hazard+' '+l.verdict; }).join(', ')
               +'. Acting on the lead hazard alone leaves the others unaddressed.')
            : null,
          all,
          

          confidence:conf, ensemble_agreement:conf, agreement_pct:conf,
          agreement_basis:_agreementBasis,
          verify_urgency:verifyUrgency,
          

          verdict, action, vcolor,
          why: why + (verifyUrgency==='routine' ? ''
               : ' Verification urgency ' + verifyUrgency + ': '
                 + (conf==null
                     ? 'ensemble agreement has not been computed for this unit'
                     : 'ensemble members disagree (' + Math.round(conf) + '/100 agreement)')
                 + '. ' + _agreementBasis
                 + ', so it raises how urgently this should be verified rather than '
                 + 'lowering the verdict.'),
          drivers:top.drivers, notes:top.notes};
}



function allVerdicts(){
  if(typeof DISTRICT_IN==='undefined') return [];
  const out=[], unassessed=[];

  for(const name in DISTRICT_IN){
    const v=districtVerdict(name);
    if(v){ v.unitLevel='tehsil'; out.push(v); }
    else unassessed.push(name);
  }
  out.unitLevel='tehsil';
  

  var _laneRank=function(v){
    var L=(v&&v.lanes)||[];
    var act=L.filter(function(l){ return l.verdict==='Act'; }).length;
    var watch=L.filter(function(l){ return l.verdict==='Act'||l.verdict==='Watch'; }).length;
    var urgent=L.some(function(l){ return l.verify_urgency==='high'; }) ? 1 : 0;
    return {act:act, watch:watch, urgent:urgent};
  };
  out.sort(function(a,b){
    var ra=_laneRank(a), rb=_laneRank(b);
    if(rb.act!==ra.act) return rb.act-ra.act;
    if(rb.watch!==ra.watch) return rb.watch-ra.watch;
    if(rb.urgent!==ra.urgent) return rb.urgent-ra.urgent;
    

    return String(a.name||'').localeCompare(String(b.name||''));
  });
  out.orderBasis='Ordered by how many hazards are at Act, then at Watch or above, then by '
    +'verification urgency, then by name. The leading index does not order this board and does '
    +'not break its ties: hazard indexes are not on a common scale and ranking districts by one '
    +'is not a comparison this product supports.';
  out.coverage={
    total:Object.keys(DISTRICT_IN).length,
    assessed:out.length,
    unassessed:unassessed.length,
    unassessedSample:unassessed.slice(0,12), unassessedUnits:function(){return unassessed.slice();},
    why:'no decision hazard resolved a day-indexed input for these units',
    warning:'absence from this board is NOT a clear verdict — these units were not assessed'
  };
  return out;
}








window.__renderFloodBadge=function(s){
  const el=document.getElementById('aiFloodLine'); if(!el||!s||s.lat==null) return;
  const k=`${(+s.lat).toFixed(3)},${(+s.lon).toFixed(3)}`; const fr=FLOOD_CACHE[k];
  if(!fr||!fr.loaded){ el.style.display='none'; return; }
  el.style.display='block';

  

  if(!fr.covered){
    el.innerHTML=`<b>River discharge (global river-flow model):</b> ${fr.q!=null?fr.q.toFixed(1):'n/a'} m³/s`
      +`<br><span class="ai-flood-rel rel-warn">⚠ no gauged reach within range (nearest reference `
      +`${fr.refGauge?fr.refGauge+', ':''}${fr.refKm!=null?fr.refKm+' km':'n/a'}) — river state unknown, `
      +`not normal · riverine pathway omitted from the score</span>`;
    return;
  }

  const lvlTxt = {extreme:'a 20-year flow or rarer for this reach',
                  high:'a 5-year flow or rarer for this reach: the river most often reached Medium flood on such days',
                  bankfull:'above its 2-year flow but below its 5-year flow: no flood signal',
                  elevated:'high for the time of year: no flood signal',
                  'seasonally-high':'a little above usual for the time of year',
                  normal:'normal for the time of year'}[fr.level]||fr.basis||'';
  

  const cls = ['extreme','high','very-high','exceptional'].indexOf(fr.level)>=0 ? 'rel-warn'
            : (fr.level==='not-scalable' ? 'rel-warn' : 'rel-ok');
  

  const _int = window.__NIGRAAN_INTERNAL_REF===true;
  el.innerHTML=`<b>River:</b> ${lvlTxt}`
    +(_int?`<br><span class="ai-flood-band">internal: ${fr.q!=null?fr.q.toFixed(1):'n/a'} m³/s`+(fr.peak!=null&&fr.peak!==fr.q?` · 5-day peak ${fr.peak.toFixed(1)}${fr.peakDay?` (+${fr.peakDay}d)`:''}`:'')+(fr.pctOfBankfull!=null?` · ${fr.pctOfBankfull}% of the 2-year flow`:'')+`</span>`:'')
    +`<br><span class="ai-flood-rel ${cls}">reference: ${fr.refGauge||'nearest gauge'} · `
    +`rarity in ${fr.refYears||29} years of the global river-flow model record at this reach</span>`;
};



window.__ensembleTrajectory=function(s){
  if(!s||s.lat==null) return null;
  const k=`${(+s.lat).toFixed(3)},${(+s.lon).toFixed(3)}`; const e=ENS_CACHE[k];
  if(!e||!e.loaded||e.tSpread==null) return null;
  

  const tight=e.tSpread<2.5, wide=e.tSpread>6.0;
  return { tSpread:e.tSpread, label: tight?'members tightly clustered (high confidence)':wide?'members widely spread (low confidence)':'moderate member spread',
           members:e.members };
};





window.__renderDataStatus=function(s){
  if(!s||s.lat==null) return;
  const k=`${(+s.lat).toFixed(3)},${(+s.lon).toFixed(3)}`;
  const fr=FLOOD_CACHE[k], en=ENS_CACHE[k];
  const cl=document.getElementById('aiConfidenceSrc');
  if(cl && en && en.loaded===false){ cl.textContent='live ensemble unavailable — using internal proxy'; }
  const fl=document.getElementById('aiFloodLine');
  if(fl && fr && fr.loaded===false){ fl.style.display='block'; fl.innerHTML='<span class="ai-flood-rel rel-warn">River discharge unavailable for this location (global river-flow model fetch failed) — riverine pathway omitted; score is pluvial only</span>'; }
};




let __warmTimer=null; const __warmDone=new Set();
window.__warmPoint=function(s, done){
  if(!s || s.lat==null || s.lon==null) return;
  const key=`${(+s.lat).toFixed(3)},${(+s.lon).toFixed(3)}`;
  if(__warmDone.has(key)){ if(typeof done==='function') done(); return; }
  __warmDone.add(key);
  if(__warmTimer) clearTimeout(__warmTimer);
  __warmTimer=setTimeout(function(){
    Promise.resolve(floodLoad(s)).then(function(){
      if(typeof done==='function') done();
    }, function(){ if(typeof done==='function') done(); });
  }, 150);
};





const INFO_CONTENT={
  decision:{t:'National decision summary',w:'The district holding the worst operational class right now, and how all districts split across Act / Watch / Monitor / Low.',s:'Derived from current district hazard scores. District inputs (temperature, humidity, wind, rain, soil moisture, air quality) are the model forecast; drought uses the reconnected SPI/FAO-56 pathway against the global reanalysis archive.',m:'Each district is scored on six hazards independently. Each earns its own operational class on its own index; the unit reports the worst class held, and every hazard at that class is reported co-equally rather than one being chosen. Ensemble disagreement raises verification urgency; it does not reduce the hazard verdict.',l:'Inputs are live, but the 0-100 scores are not yet calibrated against observed outcomes — calibration needs an impact-event ledger. FALLBACK RULE — DEMO: a seed context value may be shown when a live fetch fails, and it is labelled as a seed wherever it appears; every hazard reports the provenance of its own inputs, so a seed-fed score reads DESIGN, never RETRIEVED. PRODUCTION: missing live evidence is never replaced by a seed or demo value — the unit is reported as not scored, with the reason. This is decision-support screening, not a warning.'},
  feels:{t:'Feels-like engine',w:'Apparent temperature — what the air actually feels like to a human, combining heat and humidity.',s:'Live model forecast (apparent_temperature).',m:'Model apparent-temperature, lapse-adjusted to city elevation so highland cities are not given valley-floor values.',l:'Forecast model output, not a station reading.'},
  comfort:{t:'Humid heat discomfort',w:'A discomfort index from temperature and humidity together — humid heat is more dangerous than dry heat at the same temperature.',s:'Live MACH temperature + humidity.',m:'Discomfort index over the feels-like value; the heat hazard itself uses wet-bulb physiology, solved at the unit\'s pressure where its elevation is known.',l:'Comfort index, not a clinical heat-stress diagnosis.'},
  heat:{t:'Heat stress',w:'Heat stress for people outdoors in shade, as a level from Normal to Severe.',s:'Model forecast temperature, humidity and wind.',m:'UTCI in shade (the Universal Thermal Climate Index, Br\u00f6de et al. 2012) at the hottest hour of each day. The level follows the published UTCI heat-stress classes: Low from 26 \u00b0C (the end of no thermal stress), Moderate from 32 (moderate heat stress), High from 38 (strong), Severe from 46 (very strong).',l:'A forecast screening level, not a heat warning or a health forecast. Checked against AGN and partner weather stations: in the plains it rises on the days the stations record heat stress; on humid days on the Sindh coast and in mountain valleys it can read one level lower than the stations, and on the hottest days of a hot spell it can read one level low. Sun, work and clothing add stress the level does not count.'},
  flood:{t:'Flood',w:'Risk of inundation on a 0-100 scale.',s:'Live rainfall + soil moisture (MACH); river discharge from global river-flow model (5km); terrain slope from DEM.',m:'Two pathways, scored separately and never added. PLUVIAL: SCS-CN runoff from rainfall and antecedent soil saturation, amplified on steep terrain. RIVERINE: global river-flow model discharge against that gauge\'s own return-period and 29-year climatological context, scored inside 0-100 and governing only when it exceeds the pluvial path. A district with no gauge upstream reports the riverine pathway as unknown rather than as normal.',l:'Flood from local rain is a rain-based screening level, not a flood observation: it is set by the heaviest forecast rain hour and the heaviest 6 hours, scaled by how much of that rain this ground sheds. It does not see drains, nullahs or underpasses. On days of intense city downpours it can stay at Normal, so read it together with the Heavy rain layer. River flooding uses a 5 km global river-flow model: reliable for major rivers (Indus/Chenab/Jhelum/Kabul), unreliable for small catchments, not bias-corrected. Neither part is yet calibrated against dated flood reports.'},
  drought:{t:'Drought',w:'Agricultural drought stress on a 0-100 scale.',s:'Live root-zone soil moisture (MACH) in the demo; full version uses 30-year global reanalysis baseline.',m:'When the full SPI engine is connected: rolling 30/90-day precipitation anomaly (SPI-like, gamma-fit — not yet tested for formal WMO SPI conformance) + FAO-56 root-zone stress, weighted 0.40 / 0.60. The precipitation anomaly is mapped to the 0-100 scale through the WMO SPI drought classes (SPI 0 → 0, −1.0 → 45, −1.5 → 65, −2.0 → 82), so the score and the band name agree by construction. In the demo the SPI baseline is not connected, so the score uses live soil moisture (dry root zone raises stress).',l:'Demo runs on live soil moisture, NOT full SPI — the 30-year baseline requires a backend precompute service. Two further limits, both inputs this build does not hold: soil texture is assumed to be FAO-56 typical loam everywhere, so on sandy profiles the depletion is understated; and where only one of the two indices returns, the source line names which one and the score rests on it alone.'},
   
  wind:{t:'Wind and gusts',w:'Wind and gust load, as a level from Normal to Severe.',s:'Model forecast wind and gusts.',m:'The day\'s highest forecast gust on a fixed ladder of gust speeds (scoring starts at 40 km/h; the steps at 62, 89 and 118 km/h are AGN\'s assumed breakpoints, not fitted to damage records): Low from about 58 km/h, Moderate from about 78, High from about 102, Severe from about 130. Not scored above 1,500 m, where model gusts did not match mountain stations.',l:'Gusts from thunderstorms and dust storms are short and local, and the forecast models rarely place them: checked against weather stations, the level seldom rises on a day a station records a strong gust. Read it as the wind of the large-scale weather; a storm warning from the national warning authorities overrides it.'},
  cold:{t:'Cold stress (UTCI)',w:'Cold stress for people outdoors, as a level from Normal to Severe.',s:'Model forecast temperature, humidity and wind.',m:'UTCI in shade at the coldest hour of each day, on the published UTCI cold-stress classes: Low from 0 \u00b0C (moderate cold stress), Moderate from \u221213 (strong), High from \u221227 (very strong), Severe from \u221240 (extreme).',l:'A screening level, not a frost or cold-wave warning. It has not yet been checked on a winter of forecasts (the station check so far covers an autumn with no recorded cold stress); in mountain valleys the forecast models run colder than the stations on clear nights, so the level can read high there. Snow is not scored: there is no separate snow level.'},
  glof:{t:'Glacial lake outburst flood (GLOF)',w:'Exposure to an outburst from the glacial lakes upstream, as a level: Normal, High or Severe.',s:'SUPARCO glacial-lake inventory (Glacier Geospatial Portal) and SUPARCO GLOF bulletins; the 2024 national inventory where SUPARCO holds no record; open inventories (Hi-MAG, RGI 7.0, HMAGLOFDB); Copernicus DEM and HydroBASINS; our own Sentinel-2 reads of lake area.',m:'Each lake\'s outburst susceptibility (a model fitted on documented outbursts) is routed 100 km down the river network. A tehsil is Normal when the lakes upstream add up to little or are only susceptible (a standing condition), High when a lake within reach shows a precursor (growth in our satellite reads), Severe on an observed drainage or a confirmed outburst report.',l:'A screening of standing exposure, not an outburst forecast or a flood extent. Lakes change between satellite reads, and small lakes are not read every month.'},
  

  seismic:{t:'Seismic screening',
    w:'A design-basis ground-shaking ZONE, shown as a screening category. It is not a forecast and it does not change from day to day.',
    s:'Building Code of Pakistan Seismic Provisions 2007, Table 2.2 (446 tehsil rows) carried onto today\'s 576 tehsils and 163 districts; Building Code of Pakistan 2021, Section 1613.2.1 maps of Ss and S1 (MCE, 2% in 50 years), digitised to a 0.02-degree grid. Recent earthquakes come from the live earthquake feed and are shown separately (the Recent earthquakes toggle on the map).',
    m:'The zone is a category (with its Table 2.1 PGA band), never a 0-100 score. For a site, Ss and S1 are read at its coordinates (the upper edge of the code map band, as the code allows), site coefficients Fa and Fv from Tables 1613.2.3, SDS = 2/3 Fa Ss, SD1 = 2/3 Fv S1, and the Seismic Design Category from Tables 1613.2.5 (Site Class D and Risk Category II when not given, and said so). As of v89.44 recent seismicity is NOT added to this score: it is reported beside it as an event count, because a design-basis zone does not move on a seven-day timescale.',
    l:'Tehsils created after 2007 take the zone of their district\'s 2007 rows (or of the unit they were carved from); the 2021 maps are banded, so a value is a band edge, and the digitised grid is AGN\'s reading of the printed code map (about 2 km pixels), not an official PEC dataset. The site class needs a site investigation. A site-specific hazard study and the engineer of record are the authority for design. Seismic is excluded from the Act/Watch operational verdict for this reason.'},
  cyclone:{t:'Cyclone screening',
    w:'Standing exposure of a district to Arabian Sea tropical-cyclone landfall. It is not a track forecast and no active storm is being tracked.',
    s:'A 37-entry expert coastal-segment table covering the Sindh delta, Karachi and the Makran coast, with a small inland residual for remnant rain and wind.',
    m:'Each coastal segment carries an expert landfall-exposure value; inland districts take a bounded residual that decays with distance from the coast. The score is static between releases.',
    l:'Expert-assigned, not derived from a cyclone climatology or a basin track archive, and never calibrated against landfall records. It cannot tell you a storm is coming. Cyclone is excluded from the Act/Watch operational verdict.'},
  landslide:{t:'Landslide screening',
    w:'Rainfall-triggered slope-failure susceptibility on a 0-100 scale.',
    s:'Slope and terrain ruggedness from the Copernicus GLO-30 DEM; live rainfall and antecedent soil moisture from the model forecast.',
    m:'A slope-susceptibility base is raised where rainfall crosses a regional intensity threshold and where antecedent moisture is already high. A unit whose rainfall or soil moisture did not arrive reports the trigger as unresolved rather than as dry.',
    l:'The rainfall threshold is regional and does not transfer cleanly to every lithology — the Kirthar front and the Sulaiman range in particular sit outside the material it was written for, and that limitation is stated on the layer. There is no geology, no InSAR deformation and no landslide inventory in this build, and the score has never been validated against an observed failure record.'},
  ensemble:{t:'Ensemble spread / model agreement',w:'How much the forecast models agree with each other — an internal agreement indicator, not forecast probability.',s:'MACH Ensemble API (51-member international forecast centre), fetched for the selected location.',m:'Standard deviation across 51 ensemble members over the lead window. Tight spread means high agreement between members, which is not the same as accuracy — skill has to be measured against outcomes, not inferred from agreement. Loads only for the selected district.',l:'Not bias-corrected; area guidance. Only the selected district has loaded ensemble data — others show "agreement pending".'},
  meteogram:{t:'72-hour meteogram',w:'Hour-by-hour forecast trace for the selected location.',s:'Live hourly model forecast.',m:'Hourly temperature, apparent temperature, humidity, wind, precipitation probability over 72 hours.',l:'Forecast model output. precipitation_probability is the model\'s own value.'},
  trend:{t:'48-hour temperature trend',w:'Temperature trajectory over the next 48 hours.',s:'Live hourly model forecast.',m:'Hourly temperature sparkline for the selected location.',l:'Forecast model output, not a station reading.'},
  alerts:{t:'Active alerts',w:'Notable current conditions for the selected location.',s:'Derived from live conditions + hazard scores.',m:'Threshold flags on the live feed (heat, wind, rain) for the selected district.',l:'Decision-support flags, not official warnings. Official warnings are issued by the national warning authorities.'},
  lab:{t:'Climate feature laboratory',w:'A sandbox to test whether new satellite/atmospheric features (NDVI, soil moisture, heat persistence) would improve the score — before they touch production.',s:'Synthetic scenario controls (sliders), not live feeds.',m:'Each feature has a bounded, gated effect on a candidate score. The lab cannot write into the real score, forecast, or alerts.',l:'Intentionally synthetic. Feature coefficients are unvalidated hypotheses until back-tested against historical events. The wall to the core engine is deliberate.'},
  verification:{t:'Forecast skill / verification',w:'How the model output compares against a reference.',s:'global forecast model analysis (models=ecmwf_ifs) for recent windows, global reanalysis for climatologies; land reanalysis is not used.',m:'Deterministic error (MAE / RMSE / bias) against reanalysis. Reliability diagrams planned once the impact ledger exists.',l:'global reanalysis is a reanalysis reference, not ground truth over complex terrain. True validation needs the impact-event ledger.'},
  api:{t:'AI GEO NIGRAAN API',w:'The programmatic contract that serves scores to other systems.',s:'Planned FastAPI surface over the scoring engine. NOT AVAILABLE in this build.',m:'No API endpoints are served by this file. The scoring engine runs entirely in the browser; a provider-agnostic API is a roadmap item, not a current capability',l:'Demo surface. Production needs auth, rate limits, and a model-version registry.'},
  watchlist:{t:'District watchlist',w:'Districts ordered by the worst operational class currently held.',s:'Current district hazard scores.',m:'Ordered by the worst operational class each unit holds, then by hazard name. No index is compared across hazards. Same engine that drives the map and verdicts.',l:'District inputs live (MACH); scores uncalibrated until validated.'},
  sectorx:{t:'Sector × hazard exposure matrix',w:'How each economic sector (agriculture, telecom, energy, real estate) is exposed to each hazard, as a weighted matrix.',s:'Re-weights the live district hazard-engine scores per sector; no new data is computed.',m:'Sector exposure = Σ(hazard score × sector weight). Weights are AGN house values tuned with sector specialists, not a published standard.',l:'Screening view. Weights are tunable expert values, uncalibrated against sector loss records.'},
  impact:{t:'Impact intelligence',w:'The worst current hazard signal for this station\'s district, with the four main hazard bars.',s:'The same live hzScore hazard engine that drives the map and AI panel.',m:'Composite = max(heat, rainfall, wind, flood) from the real engine — this panel re-presents engine output and can never disagree with the map.',l:'0-100 uncalibrated screening signal, not a warning.'}
};
function infoPop(){ let p=document.getElementById('__infoPop'); if(!p){ p=document.createElement('div'); p.id='__infoPop'; p.className='mach-ipop'; document.body.appendChild(p); } return p; }
function showInfo(key, x, y){
  const c=INFO_CONTENT[key]; if(!c) return;
  const p=infoPop();
  p.innerHTML=`<button class="mach-ipop-close" aria-label="close">×</button>
    <h5>${c.t}</h5>
    <div class="info-row"><span class="info-k">What it is</span><span class="info-v">${c.w}</span></div>
    <div class="info-row"><span class="info-k">Data source</span><span class="info-v">${c.s}</span></div>
    <div class="info-row"><span class="info-k">How it's calculated</span><span class="info-v">${c.m}</span></div>
    <div class="info-row"><span class="info-k">Limits</span><span class="info-v info-limit">${c.l}</span></div>`;
  p.classList.add('show');
  
  const pw=Math.min(340, window.innerWidth-24), ph=p.offsetHeight||220;
  let px=Math.min(x, window.innerWidth-pw-12), py=y+18;
  if(py+ph>window.innerHeight-12) py=Math.max(12, y-ph-12);
  p.style.left=px+'px'; p.style.top=py+'px';
  p.querySelector('.mach-ipop-close').onclick=()=>p.classList.remove('show');
}
document.addEventListener('click', e=>{
  const dot=e.target.closest('.info-dot');
  if(dot){ e.stopPropagation(); const r=dot.getBoundingClientRect(); showInfo(dot.getAttribute('data-info'), r.left, r.bottom); return; }
  const pop=document.getElementById('__infoPop');
  if(pop && pop.classList.contains('show') && !e.target.closest('.mach-ipop')) pop.classList.remove('show');
});

function attachInfoDots(){
  const MAP=[
    ['Feels-like engine','feels'],['Human comfort engine','feels'],['Humid heat discomfort','comfort'],['48-hour temp trend','trend'],
    ['72-hour meteogram','meteogram'],['Active alerts','alerts'],['Operational advisory','ensemble'],
    ['Ensemble spread','ensemble'],['Inter-model spread','ensemble'],['Multi-model comparison','ensemble'],['Model ranking','ensemble'],['Risk trajectory','ensemble'],
    ['Explainability drivers','heat'],['District watchlist','watchlist'],
    ['Top-risk districts today','decision'],['Forecast skill','verification'],['Decision support','decision'],['Impact intelligence','impact'],
    ['Sector × hazard exposure','sectorx'],
    ['AI GEO NIGRAAN API','api'],['Data readiness and feature admission','lab'],['Scenario inputs','lab'],['Climate-signal sensitivity','lab'],['What-if controls','lab'],['Atmospheric and land-surface input status','lab'],
    ['Controlled response','lab'],['Water-change interpretation','lab'],['Scenario guidance','lab'],
    ['City comfort comparison','comfort'],['Current conditions','feels'],['Air &amp; sun','comfort'],['Air & sun','comfort'],['Premium operations brief','decision'],['Indicative pricing','api'],
    ['Hourly forecast','meteogram']
  ];
  document.querySelectorAll('h2,h3,h4').forEach(hd=>{
    if(hd.querySelector('.info-dot')) return;
    const txt=(hd.textContent||'').trim();
    for(const [needle,key] of MAP){
      if(txt.indexOf(needle)===0 || txt===needle){
        const b=document.createElement('button'); b.className='info-dot'; b.setAttribute('data-info',key);
        b.setAttribute('aria-label','What is this? Data source and method'); b.textContent='i';
        hd.appendChild(b); break;
      }
    }
  });
}
window.attachInfoDots=attachInfoDots;

 
(function mergeInit(){
  function go(){
try{ if(typeof attachInfoDots==='function') attachInfoDots(); }catch(e){ if(window.__MACH_DEBUG) console.debug("[mach swallowed]", e&&e.message); }
    
    try{
      if(typeof window.usgsLoad==='function' && window.__EQFEED && !window.__EQFEED.loaded && !window.__EQFEED.loading){
        window.usgsLoad().then(function(){
          if(typeof window.refreshDistrictHazard==='function') window.refreshDistrictHazard();
        });
      }
    }catch(e){ if(window.__MACH_DEBUG) console.debug("[mach usgs]", e&&e.message); }
  }
  
  if(document.readyState==='complete'||document.readyState==='interactive'){ setTimeout(go,800); }
  else document.addEventListener('DOMContentLoaded',()=>setTimeout(go,800));
  setTimeout(go,2500); setTimeout(go,5000);
  
})();
