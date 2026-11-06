

(function(){
  if(typeof window.AGN==='undefined') window.AGN={};
  if(AGN.cascade) return;

  var CD = {};           
  var aiLocal=(window.AGN&&AGN.sectionState)?AGN.sectionState.state('airisk',{workspace:'analyst',selectedHazard:'flood',leadHours:24,cascade:{snow:{loaded:false,units:0},soil:{loaded:false,units:0},cape:{loaded:false,units:0}}}):{cascade:{snow:{loaded:false,units:0},soil:{loaded:false,units:0},cape:{loaded:false,units:0}}};
  var STATE=aiLocal.cascade;

  function terr(k){ try{ return (typeof hzTerrainFor==='function')?hzTerrainFor(k):null; }catch(_){ return null; } }
   
  function num(v){ return AGN.parse.numberOrNull(v); }

   
  function eligible(kind){
    var out=[];
    try{
      (window.PK_DISTRICT_CENTROIDS||[]).forEach(function(c){
        if(window.IIOJK && c.province===window.IIOJK) return;
        if(!(window.DISTRICT_IN||{})[c.key]) return;
        var t=terr(c.key); if(!t) return;
        if(kind==='snow'){
          

          if(t.zone==='high_mountain' || t.zone==='highland' || (t.emax!=null && t.emax>=3000)) out.push(c);
        } else if(kind==='soil'){
           
          var sp=(t.slopeP95!=null?t.slopeP95:t.slope);
          if(sp!=null && sp>=15) out.push(c);
        } else if(kind==='cape'){
          

          if(t.zone!=='high_mountain') out.push(c);
        }
      });
    }catch(_){}
    return out;
  }

  async function fetchChunked(pts, hourly, days){
    var CHUNK=36, got=0;
    for(var i=0;i<pts.length;i+=CHUNK){
      var batch=pts.slice(i,i+CHUNK);
      var url='https://api.open-meteo.com/v1/forecast'
        +'?latitude='+batch.map(function(x){return x.lat;}).join(',')
        +'&longitude='+batch.map(function(x){return x.lon;}).join(',')
        +'&hourly='+hourly
        

        +(function(){try{return (window.AGN&&AGN.elevation)?AGN.elevation.paramForPoints(batch):'';}catch(_){return '';}})()
        +'&forecast_days='+(days||3)+'&timezone=auto&models=best_match';
      try{

        var rows = await (await AGN.api.fetch(url,{cache:'no-store'})).json();
        if(!Array.isArray(rows)) rows=[rows];
        rows.forEach(function(r,ix){
          var k=batch[ix] && batch[ix].key; if(!k||!r||!r.hourly) return;
          CD[k]=CD[k]||{};
          Object.keys(r.hourly).forEach(function(v){ if(v!=='time') CD[k][v]=r.hourly[v]; });
          CD[k].time=r.hourly.time; got++;
        });
      }catch(e){
        try{ AGN.diagnostics.capture({module:'cascade-fetch',error:e,context:{hourly:hourly,chunk:i}}); }catch(_){}
      }
    }
    return got;
  }

  async function loadSnow(force){
    if(STATE.snow.loaded && !force) return STATE.snow;
    var pts=eligible('snow');
    STATE.snow.units = await fetchChunked(pts,'snow_depth,snowfall,freezing_level_height,temperature_2m',3);
    STATE.snow.loaded = STATE.snow.units>0;
    STATE.snow.eligible = pts.length;
    emit(); return STATE.snow;
  }
  async function loadSoil(force){
    if(STATE.soil.loaded && !force) return STATE.soil;
    var pts=eligible('soil');
    STATE.soil.units = await fetchChunked(pts,'soil_moisture_27_to_81cm,precipitation',3);
    STATE.soil.loaded = STATE.soil.units>0;
    STATE.soil.eligible = pts.length;
    emit(); return STATE.soil;
  }

  

  async function loadCape(force){
    if(STATE.cape.loaded && !force) return STATE.cape;
    var pts=eligible('cape');
    STATE.cape.units = await fetchChunked(pts,'cape',3);
    STATE.cape.loaded = STATE.cape.units>0;
    STATE.cape.eligible = pts.length;
    emit(); return STATE.cape;
  }
  function emit(){    }

   
  function series(k,v){ var d=CD[k]; return (d&&Array.isArray(d[v]))?d[v]:null; }
  function windowMean(a,from,len){
    if(!a) return null; var s=0,n=0;
    for(var i=from;i<Math.min(a.length,from+len);i++){ if(a[i]!=null){ s+=a[i]; n++; } }
    return n?s/n:null;
  }
  function windowMax(a,from,len){
    if(!a) return null; var m=null;
    for(var i=from;i<Math.min(a.length,from+len);i++){ if(a[i]!=null && (m==null||a[i]>m)) m=a[i]; }
    return m;
  }

  

  var DDF = 4.5;        

  

  function snowmelt(k, hoursAhead){
    var t=terr(k); if(!t) return null;
    var sd=series(k,'snow_depth'), fl=series(k,'freezing_level_height'), tt=series(k,'temperature_2m');
    if(!sd && !tt) return null;
    var H=hoursAhead||72;

     
    var pdd=0, hrs=0;
    if(tt){ for(var i=0;i<Math.min(tt.length,H);i++){ if(tt[i]!=null){ if(tt[i]>0) pdd+=tt[i]/24; hrs++; } } }

    

    var depth0=(sd&&sd.length)?num(sd[0]):null;
    var swe = null;
    var sweWhy = 'the available snow water equivalent is NOT known for this unit. The model '
               + 'snow-depth field is the only candidate and it does not verify here: 310 cm '
               + 'modelled against 36 cm observed, correlation -0.10 against the station '
               + 'archive. Nothing is substituted for it, so the melt below is a POTENTIAL '
               + '(what this much warmth would release if the snow is present), not a volume.';

    

    var flMean=windowMean(fl,0,H);
    var frac=null;
    if(flMean!=null && t.emin!=null && t.emax!=null && t.emax>t.emin){
      frac = Math.max(0, Math.min(1, (flMean-t.emin)/(t.emax-t.emin)));
    }

     
    var meltMm = pdd*DDF;
    if(swe!=null) meltMm = Math.min(meltMm, swe);
    var contributing = (frac!=null?frac:(t.zone==='high_mountain'?0.6:t.zone==='highland'?0.35:0));
    

    

    var score = (meltMm==null)?0 : Math.max(0, Math.min(100, (meltMm*contributing)/60*100));

    

    return { score:Math.round(score), pdd:+pdd.toFixed(1), meltMm:Math.round(meltMm||0),
             meltIsPotential:true, meltMeasurand:'potential melt depth from positive degree days, NOT limited by an observed snowpack',
             sweMm:null, sweWhy:sweWhy,
             snowDepthM:depth0,
             snowDepthWhy:'model field, shown for context only. It does not verify at these '
                         +'points: 310 cm modelled against 36 cm observed, correlation -0.10. '
                         +'Do not derive a snow water equivalent from it.',
             freezingLevelM:(flMean!=null?Math.round(flMean):null),
             basinFractionAboveFL:(frac!=null?+frac.toFixed(2):null),
             hoursUsed:hrs, ddf:DDF,
             basis:'potential positive degree-day melt (no snow depth is used: the model field is withheld), routed by the '
                  +'fraction of the unit above the forecast freezing level',
             limits:'point forecast for the unit centroid, not a distributed snow model. '
                   +'No glacier ice melt, no routing lag, no channel attenuation.' };
  }

  

  var LS_A = 73.90, LS_B = -0.79;
  var LS_DURATIONS = [1,3,6,12,24];

  function landslideThreshold(D){ return LS_A*Math.pow(D,LS_B); }

  

  function lsOddsScore(or){
    var C=(typeof AGN_BAND_CUTS!=='undefined')?AGN_BAND_CUTS:[]; var m=function(k,d){ var c=C.filter(function(x){return x.key===k;})[0]; return c?c.min:d; };
    var e=[0,2,5,10,20], s=[0,m('low',25),m('moderate',45),m('high',65),m('severe',82)];
    if(!(or>0)) return 0;
    if(or<2) return Math.round(s[1]*or/2*10)/10;
    for(var i=1;i<4;i++) if(or<e[i+1]) return Math.round((s[i]+(s[i+1]-s[i])*Math.log(or/e[i])/Math.log(e[i+1]/e[i]))*10)/10;
    return Math.round(Math.min(99.9, s[4]+(100-s[4])*(1-Math.exp(-Math.log(or/20)/Math.LN2)))*10)/10;
  }
  try{ window.lsOddsScore=lsOddsScore; }catch(_){}
  function hzLandslide(k, inp, tr){
    var d=0; try{ d=(window.AGN&&AGN.day&&typeof AGN.day.get==='function')?(+AGN.day.get()||0):0; }catch(_){ d=0; }
    var S=hzLandslideScreen(k, inp, tr);
    if(S && (S.ineligible || (S.unavailable && S.effSlope==null))) return S;    
    var date=new Date(Date.now()+5*3600e3+d*864e5).toISOString().slice(0,10), row=null, O=null;
    try{ O=window.LS_ODDS; row=(O&&O.ready&&O.byKey&&O.byKey[k])?O.byKey[k][date]:null; }catch(_){ row=null; }
    if(row!=null && isFinite(+row)){
      var or=+row, sc=lsOddsScore(or);
      return Object.assign({}, S||{}, { score:sc, unavailable:false, gated:false, calibrated:true, oddsRatio:or, oddsDate:date,
        oddsModel:(O&&O.version)||null, kind:'Rain-triggered landslide likelihood (calibrated)',
        basis:'a ranking against an ordinary day of the month from the day\u2019s and the 3-day rain; the number read is the rate observed for the model\u2019s class (tested 2007-2017, each year held out)' });
    }
    

    return { score:null, unavailable:true, kind:'Rain-triggered landslide likelihood (calibrated)', effSlope:S?S.effSlope:null,
      reason:(O&&O.ready) ? ('the calibrated landslide likelihood holds no value for this tehsil on '+date+' (under 30 of the last 60 days of rain held, or outside its run), so no level is given')
                          : ('the calibrated landslide likelihood has not arrived yet'+((O&&O.why)?' ('+O.why+')':'')+', so no level is given') };
  }
  function hzLandslideScreen(k, inp, tr){
    tr = tr || terr(k) || {};
    

    if(!tr || tr.slope==null){
      return { score:null, unavailable:true,
               reason:'slope is not held for this unit, so the rainfall-triggered '
                    + 'shallow-failure screen cannot be evaluated. This is an absence '
                    + 'of terrain data, not a finding of low susceptibility',
               kind:'Rainfall-triggered landslide (screening)', effSlope:null };
    }
    var eff = (typeof hzEffSlope==='function' && hzEffSlope(tr)!=null) ? hzEffSlope(tr) : tr.slope;

    

    

    if(eff < 12) return { score:null, unavailable:true, ineligible:true, gated:true,
      reason:'effective slope '+eff.toFixed(1)+' deg is below the 12 deg shallow-failure '
           + 'gate — rainfall-triggered shallow failure is not the governing process on '
           + 'this ground, so there is no landslide screening score to give',
      effSlope:eff, kind:'Rainfall-triggered landslide (screening)' };

     
    var rain=null, _n0=0;
    

    try{ var rec=(window.DISTRICT_IN||{})[k]; if(rec&&rec.fc72&&rec.fc72.rain){ _n0=Math.max(0, rec.fc72.nowIdx||0); rain=rec.fc72.rain.slice(_n0); } }catch(_){}
    if(!rain) rain=series(k,'precipitation');
    

    var best={ratio:0,D:null,I:null,thr:null,startHour:null,windowsTested:0};
    if(rain && rain.length){
      LS_DURATIONS.forEach(function(D){
        var thr=landslideThreshold(D);
        if(!(thr>0)) return;
        var last=rain.length-D;
        if(last<0){
          

          var tot0=0,n0=0;
          for(var j=0;j<rain.length;j++){ if(rain[j]!=null){ tot0+=rain[j]; n0++; } }
          if(n0<Math.max(1,Math.ceil(rain.length/2))) return;
          var I0=tot0/n0, r0=I0/thr;
          best.windowsTested++;
          if(r0>best.ratio) best={ratio:r0,D:D,I:+I0.toFixed(2),thr:+thr.toFixed(2),
                                  startHour:0,partial:true,windowsTested:best.windowsTested};
          return;
        }
        for(var st=0; st<=last; st++){
          var tot=0,n=0;
          for(var i=st;i<st+D;i++){ if(rain[i]!=null){ tot+=rain[i]; n++; } }
          if(n < Math.ceil(D/2)) continue;
          best.windowsTested++;
          var I=tot/n, r=I/thr;
          if(r>best.ratio) best={ratio:r,D:D,I:+I.toFixed(2),thr:+thr.toFixed(2),
                                 startHour:st,partial:(n<D),windowsTested:best.windowsTested};
        }
      });
    } else if(inp && inp.rain!=null){
      var I1=inp.rain, t1=landslideThreshold(1);
      best={ratio:I1/t1,D:1,I:+I1.toFixed(2),thr:+t1.toFixed(2)};
    } else {
      

      return { score:null, unavailable:true,
               reason:'no rainfall series and no current rainfall value for this unit — '
                    + 'the intensity-duration screen has no trigger to evaluate',
               kind:'Rainfall-triggered landslide (screening)', effSlope:eff };
    }

    

    var deep=series(k,'soil_moisture_27_to_81cm');
    var deepNow=(deep&&deep.length)?num(deep[0]):null;
    

    var _LW=FR('landslide.wetness'), _LS=FR('landslide.slopeFactor'), _LR=FR('landslide.reliefFactor'), _LC=FR('landslide.scoreCurve');    
    var wet = deepNow!=null ? Math.max(0,Math.min(1,(deepNow-_LW.deepFrom)/_LW.deepSpan))
            : (inp && inp.api!=null ? Math.max(0,Math.min(1,inp.api))
            : (inp && inp.soilMoist!=null ? Math.max(0,Math.min(1,(inp.soilMoist-_LW.surfFrom)/_LW.surfSpan)) : null));
    var wetKnown = (wet!=null);
    var wetBasis = deepNow!=null ? 'deep soil moisture 27-81 cm'
                 : (inp && inp.api!=null ? 'antecedent precipitation index'
                 : (inp && inp.soilMoist!=null ? 'soil moisture 7-28 cm'
                 : 'UNRESOLVED - no deep soil moisture, no antecedent index and no surface soil moisture arrived, so the wetness modifier is dropped rather than assumed'));

     
    var slopeF  = Math.min(_LS.max, _LS.min + (eff-_LS.fromDeg)/_LS.spanDeg*_LS.gain);
    var relief  = (tr.emax!=null && tr.emin!=null) ? (tr.emax-tr.emin) : null;
    var reliefF = relief!=null ? Math.min(_LR.max, 1 + Math.max(0,(relief-_LR.fromM))/_LR.spanM*_LR.gain) : 1;

    

    var wetMod   = wetKnown ? (0.55+0.45*wet) : 1;
    

    var suscF = 1, suscClass = null;
    try{ var _S=window.LS30_TEHSIL; var _r=_S&&_S.ready&&_S.units?_S.units[k]:null; if(_r&&_r[0]!=null){ suscClass=_r[0]; var _f=(_S.classFactor||{})[String(_r[0])]; if(_f>0) suscF=_f; } }catch(_){}
    

    if(suscClass!=null){ slopeF=1; reliefF=1; }
    var terrainMod = slopeF*wetMod*reliefF*suscF;
    

    var _gridAnchor = 1; try{ var _g=FR('landslide.gridAnchorRatio'); if(_g>0 && _g<=1) _gridAnchor=_g; }catch(_){}
    var effRatio = (best.ratio/_gridAnchor)*terrainMod;
    

    var _hiCut=((typeof AGN_BAND_CUTS!=='undefined'&&AGN_BAND_CUTS.filter(function(c){return c.key==='high';})[0])||{}).min;
    var _anc=(_hiCut!=null)?_hiCut:_LC.anchor, _head=100-_anc;
    var base = Math.min(100, best.ratio*_anc);
    var score = effRatio<=0 ? 0
              : effRatio<=1 ? Math.max(0, _anc*effRatio)
              : Math.min(100, _anc + _head*(1-Math.exp(-(effRatio-1)/_LC.eFold)));
    var anchorNote = 'the Dahal & Hasegawa (2008) rainfall intensity-duration threshold is anchored at 62/100 for an EFFECTIVE exceedance ratio of 1.0. The effective ratio is the measured exceedance ('
      + (Math.round(best.ratio*100)/100) + (_gridAnchor!==1 ? ', read against the gridded-rain anchor of '+_gridAnchor+' measured on a global landslide catalogue: '+(Math.round(best.ratio/_gridAnchor*100)/100) : '') + ') scaled by terrain (' + (Math.round(terrainMod*100)/100)
      + ' = slope ' + (Math.round(slopeF*100)/100) + ' x wetness ' + (wetKnown?(Math.round(wetMod*100)/100):'dropped, unresolved')
      + ' x relief ' + (Math.round(reliefF*100)/100) + (suscClass!=null ? ' x susceptibility ' + (Math.round(suscF*100)/100) + ' (30 m class ' + suscClass + ' of 5)' : '') + '), because steeper, wetter, higher-relief ground fails at lower rainfall. Above the anchor the scale is compressive, so a 3x exceedance reads 97 rather than clipping at 100 the way it did before v91.17.4.';

    

    var _prov = (function(){
      try{
        var pv = (typeof provinceOf!=='undefined') ? provinceOf[k] : null;
        var dn = (typeof resolveDistrict==='function') ? resolveDistrict(k) : k;
        var MAKRAN = ['Gwadar','Kech','Panjgur','Awaran','Lasbela','Washuk','Turbat'];
        var KIRTHAR_SULAIMAN = ['Khuzdar','Kalat','Kharan','Mastung','Surab','Nushki','Ziarat',
          'Harnai','Zhob','Loralai','Sherani','Musakhel','Barkhan','Kohlu','Duki','Sibi',
          'Dera Bugti','Jamshoro','Dadu','Qila Saifullah','Quetta','Pishin','Chaman'];
        var KARAKORAM = ['Hunza','Nagar','Gilgit','Ghizer','Skardu','Shigar','Ghanche','Kharmang',
          'Astore','Diamir','Gupis Yasin','Roundu','Chitral','Chitral Upper','Chitral Lower'];
        if (MAKRAN.indexOf(dn)>=0) return 'Makran accretionary prism';
        if (KIRTHAR_SULAIMAN.indexOf(dn)>=0) return 'Kirthar / Sulaiman fold-thrust';
        if (KARAKORAM.indexOf(dn)>=0) return 'Karakoram / Hindu Kush';
        

        if (['Murree','Rawalpindi','Abbottabad','Haripur','Mansehra','Battagram','Batagram',
             'Shangla','Buner','Torghar','Tor Ghar'].indexOf(dn)>=0) return 'HKH / Himalaya';
        if (pv==='Balochistan') return 'Balochistan - province not resolved to a range';
        if (tr.zone==='high_mountain'||tr.zone==='highland') return 'HKH / Himalaya';
        return 'plains - not a landslide province';
      }catch(_){ return null; }
    })();
    var _transferable = (_prov==='HKH / Himalaya');
    var hkh = _transferable;
    

    var _litho=null;
    try{ var _LT=window.LITHO_TEHSIL; if(_LT && _LT.ready && _LT.units && _LT.units[k]) _litho=_LT.units[k]; }catch(_){}
    if(_litho && _litho.material){
      var _mat=_litho.material;
      _prov = (_mat==='crystalline' ? 'crystalline (metamorphics / plutonics): weathered regolith, the closest analogue to the fitted material'
             : _mat==='sedimentary' ? 'sedimentary fold-thrust rock (carbonate, shale, sandstone): rockfall, toppling and rotational failure; the regolith curve is a poor analogue'
             : _mat==='volcanic' ? 'volcanic arc rock: not the fitted material'
             : _mat==='unconsolidated' ? 'unconsolidated sediment (valley fill, moraine, fan): the slope gate decides eligibility; the curve was not fitted on it'
             : _mat) + ' \u2014 ' + Math.round(100*_litho.materialShare) + '% of the unit; dominant class ' + _litho.dominant + ' (250 m lithology map)';
      _transferable = (_mat==='crystalline'); hkh = _transferable;
    }
    return { score:Math.round(score),
             kind:'Rainfall-triggered landslide (screening)',
             exceedanceRatio:+best.ratio.toFixed(2),
             effectiveExceedanceRatio:+effRatio.toFixed(2),
             terrainModifier:+terrainMod.toFixed(2),
             slopeFactor:+slopeF.toFixed(2), reliefFactor:+reliefF.toFixed(2),
             wetness:(wetKnown?+wet.toFixed(2):null), wetnessBasis:wetBasis, wetnessApplied:wetKnown,
             anchorNote:anchorNote,
             governingDurationH:best.D,
             intensityMmH:best.I, thresholdMmH:best.thr,
             

             crossingStartHour:(best.startHour!=null?best.startHour:null),
             crossingWindowBasis:(best.startHour!=null
               ? ('worst '+best.D+'-hour window in the next '+((rain&&rain.length)||0)+' forecast hours (from the current hour) starts at +'+best.startHour+' h')
               : 'present-hour intensity only (no forecast series)'),
             

             effSlope:+eff.toFixed(1),
             deepSoilVv:deepNow, reliefM:relief,
             threshold:'Dahal & Hasegawa 2008 HKH: I = 73.90 x D^-0.79'+(_gridAnchor!==1?' · anchor at ratio '+_gridAnchor+' on gridded rain':''),
             gridAnchorRatio:_gridAnchor,
             

             transferable:_transferable, lithoProvince:_prov,
             lithologySource:(_litho?'250 m lithology class map (material share)':'district-name proxy'),
             limits:'Rainfall TRIGGER screen, not a susceptibility map. '+(_litho?'Lithology is a 250 m material class, not a failure inventory. No land cover, ':'No lithology, land cover, ')
                   +'prior-failure inventory or road-cut geometry. The empirical threshold carries '
                   +'HKH lithology implicitly and does NOT transfer to Makran or the Kirthar front'
                   +(hkh?'':' — THIS UNIT IS OUTSIDE THE FITTED REGION, treat as indicative only') };
  }

  

  function droughtRunoffBoost(k){
    try{
      var d=(typeof hzDrought==='function')?hzDrought(k):null;
      if(!d || d.score==null) return {boost:0, reason:'no SPI composite for this unit'};
       
      var f=Math.max(0, Math.min(1, (d.score-55)/35));
      return { boost:+(f*0.12).toFixed(4), droughtScore:d.score, factor:+f.toFixed(2),
               reason:f>0? 'dry antecedent soil raises runoff response' : 'drought below the 55 engagement threshold',
               basis:'SPI-30/90 + FAO-56 composite, already computed. Bounded to +0.12 on the runoff '
                    +'coefficient so it cannot move a unit a band on its own.' };
    }catch(e){ return {boost:0, reason:'error: '+e.message}; }
  }

  

  function heatDroughtDemand(k, inp){
    try{
      var rec=(window.DISTRICT_IN||{})[k]||{};
      var et0 = (inp&&inp.et0!=null)?inp.et0 : (rec.et0!=null?rec.et0:null);
      if(et0==null) return {score:null, reason:'ET0 not loaded for this unit'};
       
      var demand=Math.max(0,Math.min(100, et0/8*100));
      var t=(inp&&inp.t!=null)?inp.t:rec.t;
      return { score:Math.round(demand), et0MmDay:et0, airTempC:t,
               basis:'FAO-56 Penman-Monteith reference evapotranspiration as atmospheric demand',
               limits:'demand, not deficit. A deficit needs supply - soil water and irrigation - '
                     +'which this build does not hold.' };
    }catch(e){ return {score:null, reason:'error: '+e.message}; }
  }

  


  var _glofSrcIdx=null;
  function _glofSources(){
    if(_glofSrcIdx) return _glofSrcIdx;
    var out=[];
    try{
      if(typeof GLOF_REGISTER==='undefined') return (_glofSrcIdx=out);
      var byDist={};
      Object.keys(window.DISTRICT_IN||{}).forEach(function(kk){
        var d=(typeof resolveDistrict==='function')?resolveDistrict(kk):kk;
        (byDist[d]=byDist[d]||[]).push(kk);
      });
      Object.keys(GLOF_REGISTER).forEach(function(srcDist){
        var reg=GLOF_REGISTER[srcDist]; if(!reg||!reg.basin) return;
        (byDist[srcDist]||[]).forEach(function(sk){
          var st=terr(sk); if(!st||st.elev==null) return;
          var g=(typeof hzGLOF==='function')?hzGLOF(sk,(window.DISTRICT_IN||{})[sk]||{},st):null;
          if(!g||!g.score) return;
          out.push({unit:sk,district:srcDist,basin:reg.basin,elev:st.elev,score:g.score});
        });
      });
    }catch(e){ try{ AGN.diagnostics.capture({module:'glof-source-index',error:e}); }catch(_){} }
    return (_glofSrcIdx=out);
  }
  try{ document.addEventListener('agn:data',function(){ _glofSrcIdx=null; }); }catch(_){}

  function glofDownstream(k){
    try{
      var myT=terr(k); if(!myT || myT.elev==null) return null;
      var best=null;
      _glofSources().forEach(function(src){
        if(src.elev <= myT.elev) return;                   
        var drop=src.elev-myT.elev;
        if(drop<300) return;                               
        

        var att=Math.max(0.15, 1 - drop/4500);
        var share=src.score*att;
        if(!best || share>best.score) best={ score:Math.round(share), sourceUnit:src.unit,
          sourceDistrict:src.district, basin:src.basin, sourceScore:src.score,
          verticalDropM:Math.round(drop), attenuation:+att.toFixed(2) };
      });
      if(!best) return null;
      best.basis='elevation-only prototype with vertical-drop attenuation \u2014 connectivity NOT '
        +'established, not for production use';
      best.limits='NOT hydraulic routing. No flow path, no arrival time, no peak discharge, no '
                 +'channel cross-section. Identifies WHICH units are downstream of a signalling '
                 +'source, not what would arrive or when.';
      return best;
    }catch(e){ try{ AGN.diagnostics.capture({module:'glof-downstream',error:e,context:{unit:k}}); }catch(_){} return null; }
  }

  function convective(k, inp){
    

    try{ var _te=terr(k); if(_te && _te.elev!=null && _te.elev>=1000){
      return { score:null, unavailable:true, withheld:true, capeWithheld:true,
               basis:'CAPE convective band withheld above 1,000 m',
               limits:'In testing on the mountain station record, CAPE of 1,000 J/kg or more almost never preceded heavy rain and nearly all its alarms were false. No convective score is given here; read the rain forecast instead.' }; } }catch(_){}
    var cape=series(k,'cape');
    var now=(cape&&cape.length)?num(cape[0]):null;
    var pk=windowMax(cape,0,24);
    if(now==null){
      var mm=(inp&&inp.rain!=null)?inp.rain:0;
      return { score:Math.round(Math.max(0,Math.min(100,mm*4))), basis:'rain proxy - CAPE not loaded',
               isProxy:true, limits:'pure rain transform. CAPE unavailable for this unit — rainfall proxy only.' };
    }
     
    var sc = now<300?0 : now<1000?(now-300)/700*30 : now<2500?30+(now-1000)/1500*40 : Math.min(100,70+(now-2500)/1500*30);
    return { score:Math.round(sc), capeJkg:Math.round(now), cape24hPeak:(pk!=null?Math.round(pk):null),
             basis:'CAPE convective available potential energy, standard instability bands',
             isProxy:false,
             limits:'instability, not strike density. A flash-density climatology would still be '
                   +'better for asset-level lightning risk.' };
  }

   
  AGN.cascade = {
    state:function(){ return STATE; },
    data:function(k){ return k?CD[k]:CD; },
    loadSnow:loadSnow, loadSoil:loadSoil, loadCape:loadCape,
    /* v91.17.283.19 · the cascade layers are inputs of the hazard engine: read only by the server's engine (engine mode); the browser shows the
        issued levels and asks no provider forecast */
    loadAll:async function(force){ if(!(window.AGN&&AGN.engineMode)) return STATE; await loadSnow(force); await loadSoil(force); await loadCape(force); return STATE; },
    eligible:eligible,
    snowmelt:snowmelt, landslide:hzLandslide, droughtRunoffBoost:droughtRunoffBoost,
    heatDroughtDemand:heatDroughtDemand, glofDownstream:glofDownstream, convective:convective,
    landslideThreshold:landslideThreshold
  };
  

  try{ window.hzLandslide=function(name,inp,tr){ return hzLandslide(name,inp,tr); }; }catch(_){}
})();
