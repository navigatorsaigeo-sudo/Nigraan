
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const modelAdapter=window.AGN&&AGN.adapters?AGN.adapters.require('modelLabLegacy'):null;
  const storage=window.AGN&&AGN.dataServices?AGN.dataServices.require('storage'):null;
  const contracts=window.AGN&&AGN.dataServices?AGN.dataServices.require('contracts'):null;
  
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storeKey='agn:model-lab:experiments:v1';
  const experimentWorkflow=window.AGN&&AGN.workflows?AGN.workflows.require('modelExperiments'):null;
  const modelLocal=(window.AGN&&AGN.sectionState)?AGN.sectionState.state('modelab',{currentExperimentId:'',memoryExperiments:[],comparisonTimer:0,comparisonQueued:false,variable:'temp',leadHours:24,season:'auto'}):{currentExperimentId:'',memoryExperiments:[],comparisonTimer:0,comparisonQueued:false,variable:'temp',leadHours:24,season:'auto'};

  function activeStation(){try{return modelAdapter.activeStation();}catch(_){return null;}}
  function districtContext(s){
    let d=null;
    try{ d=(typeof STATION_DISTRICT!=='undefined'&&s&&STATION_DISTRICT[s.id])||null; }catch(_){ }
    return {tehsil:(s&&s.tehsil)||(d&&d.tehsil)||'Point context',district:(s&&s.district)||(d&&d.district)||'Administrative context',province:(s&&s.province)||(d&&d.province)||''};
  }
  

  function regionProfile(s){
     
    try{ if(window.AGN && AGN.terrain) AGN.terrain.decorate(s); }catch(_){ }
    const ctx=districtContext(s), nested=(s&&s.terrain)||{};
    const n=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
    const text=v=>String(v==null?'':v).toLowerCase().replace(/[_-]+/g,' ').trim();
    let terr=null;
    try{
      if(typeof hzTerrainFor==='function') terr=hzTerrainFor(ctx.district,ctx.tehsil);
    }catch(_){ terr=null; }

    const landform=text(
      (s&&(s.landform||s.landform_class||s.landformClass)) ||
      nested.landform || nested.landform_class || nested.landformClass
    );
    const tpi=n(
      s&&(s.tpi_300!=null?s.tpi_300:(s.tpi300!=null?s.tpi300:null))
    ) ?? n(nested.tpi_300!=null?nested.tpi_300:nested.tpi300);
    const zone=text(
      (s&&(s.terrainZone||s.regionZone||s.zone)) || nested.zone || (terr&&terr.zone)
    );
    const elev=n(s&&s.elev) ?? n(terr&&terr.elev) ?? 0;
    const slope=n(s&&s.slope) ?? n(nested.slope) ?? n(terr&&terr.slope);
    const slopeP95=n(s&&s.slopeP95) ?? n(nested.slopeP95) ?? n(terr&&terr.slopeP95);
    const lat=n(s&&s.lat), lon=n(s&&s.lon), hum=n(s&&s.hum), temp=n(s&&s.t);

    const isCoastalLandform=/coast|coastal|delta|tidal|intertidal|estuary|mudflat/.test(landform);
    const isMountainLandform=/mountain|alpine|glacier|glacial|ridge|upper slope|summit|cirque/.test(landform);
    const isFoothillLandform=/foothill|piedmont|lower slope|valley|alluvial fan/.test(landform);
    const coastalCoordinate=lat!=null&&lon!=null&&lat<26.7&&lon<68.9;
    const highRelief=(tpi!=null&&tpi>=80)||(slopeP95!=null&&slopeP95>=25)||(slope!=null&&slope>=15);

    if(isCoastalLandform||coastalCoordinate){
      return {label:'Coastal and delta',basis:isCoastalLandform?'Point landform':'Coastal coordinate envelope',landform,tpi,zone,elev,slope,slopeP95};
    }
    if(zone==='high mountain'||zone==='high_mountain'||elev>=2500||(elev>=1500&&(isMountainLandform||highRelief))){
      const basis=(zone==='high mountain'||zone==='high_mountain')?'Canonical terrain zone':isMountainLandform?'Point landform':elev>=2500?'Point elevation':'Elevation plus terrain relief';
      return {label:'High mountain',basis,landform,tpi,zone,elev,slope,slopeP95};
    }
    if(lat!=null&&lat>=31.2&&(zone==='highland'||zone==='irrigated plains'||zone==='irrigated_plains'||isFoothillLandform||highRelief)){
      return {label:'Monsoon north and foothill',basis:isFoothillLandform?'Point landform':'Latitude plus terrain zone or relief',landform,tpi,zone,elev,slope,slopeP95};
    }
    if(zone==='highland'||(elev>=900&&(isMountainLandform||highRelief))){
      return {label:'Arid highland',basis:zone==='highland'?'Canonical terrain zone':'Elevation plus terrain relief',landform,tpi,zone,elev,slope,slopeP95};
    }
    if((zone==='arid plains'||zone==='arid_plains')||(temp!=null&&temp>=37&&hum!=null&&hum<45&&elev<900)){
      return {label:'Hot arid plain',basis:(zone==='arid plains'||zone==='arid_plains')?'Canonical terrain zone':'Current hot-dry regime',landform,tpi,zone,elev,slope,slopeP95};
    }
    return {label:'Indus plain',basis:zone?'Canonical terrain zone fallback':'Geographic and terrain fallback',landform,tpi,zone,elev,slope,slopeP95};
  }
  function regionClass(s){ return regionProfile(s).label; }
  function seasonName(){
    const selected=$('mlSeason')&&$('mlSeason').value; if(selected&&selected!=='auto') return selected.replace(/\b\w/g,c=>c.toUpperCase());
    const m=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Karachi',month:'numeric'}).format(new Date()));
    if(m<=2||m===12)return 'Winter'; if(m<=5)return 'Pre monsoon'; if(m<=9)return 'Monsoon'; return 'Post monsoon';
  }
  function varMeta(){
    const k=($('mlVariable')&&$('mlVariable').value)||'temp';
    return {temp:{label:'Temperature',unit:'°C',dec:1},feels:{label:'Feels like',unit:'°C',dec:1},wind:{label:'Wind',unit:' km/h',dec:1},precip:{label:'Precipitation',unit:' mm',dec:2}}[k];
  }
  function number(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;}
  function fmt(v,meta){return v==null?'—':Number(v).toFixed(meta.dec)+meta.unit;}
  function modelStats(){
    try{ const state=modelAdapter.getState(); if(state&&state.series) return modelAdapter.stats(state.series,state.lead||48); }catch(_){ }
    return null;
  }
  function ensembleRecord(s){
    try{ const key=`${(+s.lat).toFixed(3)},${(+s.lon).toFixed(3)}`; return (typeof ENS_CACHE!=='undefined'&&ENS_CACHE[key])||null; }catch(_){ return null; }
  }
  function primaryProcessedFused(s){
    const key=$('mlVariable').value, meta=varMeta(); let raw=null,processed=null,rawNote='',processedNote='';
    if(key==='temp'){
      raw=number(s.tRaw!=null?s.tRaw:s.t); processed=number(s.t);
      rawNote=(s.liveSource==='metno'?'independent forecast provider model point':'best-match model at the requested elevation');
      if(s.__lapseAdjusted) processedNote='Provider elevation processing retained; no second lapse correction';
      else if(number(s.gridElev)!=null&&number(s.elev)!=null&&Math.abs(s.gridElev-s.elev)>150) processedNote='Terrain mismatch identified for backend correction testing';
      else processedNote='No additional temperature correction applied';
    }else if(key==='feels'){
      raw=number(s.apparentLive!=null?s.apparentLive:s.feels); try{processed=number(stationComfort(s).feels);}catch(_){processed=raw;}
      rawNote='Provider apparent temperature when available'; processedNote='AGN comfort engine from temperature, humidity and wind';
    }else if(key==='wind'){
      raw=number(s.wind); processed=raw; rawNote='10 m provider wind'; processedNote='No terrain wind correction in this prototype';
    }else{
      raw=number(s.rain); processed=raw; rawNote='Current provider precipitation'; processedNote='Quality checked, no adjustment in this prototype';
    }
    

    let fused=null, fusedNote='Live comparison is not loaded for this variable and location';
    const st=modelStats();
    const modelState=modelAdapter.getState();
    const leadSel=Math.max(0,Number(($('mlLead')||{}).value)||0);
    const nowMs=Date.now();
    

    var _provValid=null;
    try{
      var _sid=(typeof mmState!=='undefined')?mmState.seriesIdentity:null;
      if(_sid && mmState.seriesTimes && mmState.seriesTimes.length){
        _provValid=mmState.seriesTimes[Math.min(mmState.seriesTimes.length-1,Math.max(0,leadSel-1))]||null;
      }
    }catch(_){}
    const validCtx={variable:key, lead:leadSel,
      initTime:(st&&st.initTime)||null,
      initTimeBasis:(st&&st.initTime)?'provider':'unavailable — modelStats() carries no initialization time',
      rawValid:new Date(nowMs).toISOString(),
      fusedValid:_provValid||new Date(nowMs+leadSel*3600000).toISOString(),
      fusedValidBasis:_provValid?'provider hourly.time':'derived from lead (provider timestamp unavailable)',
      aligned:(leadSel===0)};
    if(modelState&&modelState.variable===key&&st&&st.mean){
      const lead=Math.max(1,leadSel||1),idx=Math.min(st.mean.length-1,lead-1);
      if(st.mean[idx]!=null){
        fused=number(st.mean[idx]);
        fusedNote=`Multi-model mean of ${st.keys.length} streams · valid +${lead} h (`
          +new Date(nowMs+lead*3600000).toISOString().slice(0,16).replace('T',' ')+' UTC)';
      }
    }
    rawNote      = rawNote      + ' · valid now';
    processedNote= processedNote+ ' · valid now';
    if(!validCtx.aligned && fused!=null){
      fusedNote += '. NOT TEMPORALLY ALIGNED with Raw/Processed, which are current values.';
    }
    return {raw,processed,fused,rawNote,processedNote,fusedNote,meta,validTime:validCtx};
  }
  function confidenceParts(s){
    

    const parts=[];
    const selectedVar=($('mlVariable')||{}).value;
    let pd=null;
    if(selectedVar==='temp'||selectedVar==='feels'){
      try{pd=typeof window.providerDisagreement==='function'?window.providerDisagreement(s):null;}catch(_){}
    }
    parts.push({name:'Provider difference',display:pd==null?'—':pd.toFixed(1)+'°C',
      note:(selectedVar==='temp'||selectedVar==='feels')?(pd==null?'Independent provider comparison pending':'MACH minus independent forecast provider absolute temperature difference; descriptive cross-provider check, not skill.'):'Independent provider comparison is not wired for the selected variable'});
    const ms=modelStats(), meta=varMeta();
    parts.push({name:'Inter-model spread',display:ms?ms.avgSpread.toFixed(2)+' '+String(meta.unit||'').trim():'—',
      note:ms?('Mean max-minus-min spread across '+ms.keys.length+' active model streams; agreement index is descriptive, not verified accuracy.'):'Multi-model comparison pending'});
    const en=ensembleRecord(s);
    

    var _mlVar=(typeof mmState!=='undefined'&&mmState.variable)?mmState.variable:'temp';
    

    var _ensOk=(_mlVar==='temp');
    parts.push({name:_ensOk?'global ensemble spread (temperature)':'global ensemble spread',
      display:(!_ensOk)?(_mlVar==='feels'
              ? '— feels-like ensemble requires member-level T/RH/wind (not derived)'
              : '— ensemble not loaded for this variable')
              :(en&&en.loaded?(Number(en.tSpread||0).toFixed(2)+'°C'):'—'),
      note:en&&en.loaded?((en.members||51)+' members; standard deviation is an uncertainty diagnostic, not event probability.'):'Ensemble request pending or unavailable'});
    const elev=number(s.elev),grid=number(s.gridElev),dz=elev!=null&&grid!=null?Math.abs(elev-grid):null;
    parts.push({name:'Terrain mismatch',display:dz==null?'—':Math.round(dz)+' m',
      note:dz==null?'Native grid elevation unresolved':'Absolute provider-grid to point elevation difference; no synthetic confidence score is inferred.'});
    const ts=number(s.liveFetchedAt),age=ts==null?null:Math.max(0,(Date.now()-ts)/60000);
    parts.push({name:'Data age',display:age==null?'—':Math.round(age)+' min',
      note:age==null?'Live timestamp unavailable':'Elapsed time since the active location fetch.'});
    return parts;
  }
  function conflictRows(s){
    const rows=[]; let pd=null; try{pd=typeof window.providerDisagreement==='function'?window.providerDisagreement(s):null;}catch(_){ }
    if(pd!=null) rows.push({level:pd>4?'high':pd>2?'medium':'low',title:'Provider temperature difference',detail:`Independent providers differ by ${pd.toFixed(1)}°C at the active location.`});
    const elev=number(s.elev),grid=number(s.gridElev),dz=elev!=null&&grid!=null?Math.abs(elev-grid):null;
    if(dz!=null) rows.push({level:dz>500?'high':dz>150?'medium':'low',title:'Terrain representation',detail:`Model grid and point elevation differ by ${Math.round(dz)} m.`});
    const ms=modelStats(); if(ms) rows.push({level:ms.agree<55?'high':ms.agree<75?'medium':'low',title:'Inter model spread',detail:`Average spread is ${ms.avgSpread.toFixed(2)} ${varMeta().unit.trim()} with ${ms.keys.length} active streams.`});
    const en=ensembleRecord(s); if(en&&en.loaded) rows.push({level:en.agreement<65?'high':en.agreement<80?'medium':'low',title:'international forecast centre member uncertainty',detail:((typeof mmState!=='undefined'&&mmState.variable&&mmState.variable!=='temp')
        ? `${en.members||51} members. This diagnostic is the TEMPERATURE spread and does not describe `
          +`the selected ${mmState.variable} variable — no ${mmState.variable} ensemble is loaded.`
        : `${en.members||51} members, temperature spread ${(en.tSpread||0).toFixed(2)}°C.`)});
    if(!s.weatherLive&&!s.featureLive) rows.push({level:'high',title:'Active location is using seed context',detail:'Live provider output has not reached this location in the current session.'});
    return rows;
  }
  const conflictStyle={low:['#059669','rgba(5,150,105,.11)','Low'],medium:['#F08A24','rgba(240,138,36,.12)','Review'],high:['#982122','rgba(152,33,34,.11)','Conflict'],pending:['#8B7AA8','rgba(139,122,168,.12)','Pending']};

  function experimentId(){
    if(modelLocal.currentExperimentId)return modelLocal.currentExperimentId;
    const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');
    let n=1; try{n=Number(sessionStorage.getItem('agnExpCounter')||0)+1;sessionStorage.setItem('agnExpCounter',String(n));}catch(_){ }
    modelLocal.currentExperimentId=`AGN-EXP-${d}-${String(n).padStart(3,'0')}`; return modelLocal.currentExperimentId;
  }
  function currentSnapshot(){
    const s=activeStation(),ctx=districtContext(s),values=primaryProcessedFused(s),ms=modelStats(),conf=confidenceParts(s);
    return {experiment_id:experimentId(),created_at:new Date().toISOString(),build_version:(window.AGN_BUILD||{}).version||null,location:{id:s&&s.id,name:s&&s.name,latitude:s&&s.lat,longitude:s&&s.lon,point_elevation_m:s&&s.elev,grid_elevation_m:s&&s.gridElev,tehsil:ctx.tehsil,district:ctx.district,province:ctx.province,regional_class:regionClass(s),regional_class_basis:regionProfile(s).basis,landform:regionProfile(s).landform||null,tpi_300:regionProfile(s).tpi},evaluation:{variable:$('mlVariable').value,lead_hours:Number($('mlLead').value),season:seasonName()},outputs:{primary:values.raw,processed:values.processed,fused:values.fused,unit:values.meta.unit},models:{state:(modelAdapter.getState()||{}).source,active:ms?ms.keys:[],agreement:ms&&ms.agree,average_spread:ms&&ms.avgSpread},evidence_diagnostics:{status:'descriptive-not-skill',parts:conf},conflicts:conflictRows(s),source:{live:!!(s&&s.weatherLive),provider:s&&s.liveSource||'seed',fetched_at:s&&s.liveFetchedAt||null}};
  }
  function download(name,text){const blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}
  function loadExperiments(){const v=storage.get(storeKey,[]);modelLocal.memoryExperiments=Array.isArray(v)?v:[];return modelLocal.memoryExperiments;}
  function saveExperiments(v){modelLocal.memoryExperiments=v.slice(0,30);storage.set(storeKey,modelLocal.memoryExperiments);}

  const suitability=[
    ['High mountain','Temperature, wind, snow and precipitation','global forecast model, AIFS, ICON','independent forecast provider','Elevation mismatch, inversion regime and valley representation'],
    ['Monsoon north and foothill','Rainfall, humidity and heat','global forecast model, ICON, GFS','independent forecast provider','Convective timing, orographic rainfall and urban heat'],
    ['Indus plain','Maximum temperature, rainfall and wind','AIFS, GFS, global forecast model','independent forecast provider','Dry heat bias, irrigation moisture and monsoon timing'],
    ['Hot arid plain','Maximum temperature, gust and dust support','AIFS, GFS, global forecast model','independent forecast provider','Extreme dry heat and boundary layer behaviour'],
    ['Arid highland','Temperature, cold and wind','global forecast model, ICON, AIFS','independent forecast provider','Basin inversion, elevation and sparse terrain representation'],
    ['Coastal and delta','Humidity, apparent temperature, wind and rain','global forecast model, GFS, AIFS','independent forecast provider','Sea breeze, wet bulb heat and coastal rainfall']
  ];
  function datasetRows(s){
    const en=ensembleRecord(s),ms=modelStats(),flood=(()=>{try{const k=`${(+s.lat).toFixed(3)},${(+s.lon).toFixed(3)}`;return typeof FLOOD_CACHE!=='undefined'?FLOOD_CACHE[k]:null;}catch(_){return null;}})();
    const live=!!(s.weatherLive||s.featureLive);
    return [
      ['Best-match model','Primary point weather and atmospheric features',live?'live':'experimental','Point and district samples','Weather, heat, flood, drought, sectors','Backend source adapter and caching'],
      ['independent forecast provider Locationforecast','Independent provider and fallback',(modelAdapter.getState()||{}).source==='live'?'live':'experimental','Selected points','Provider comparison and fallback','Independent adapter and provider SLA'],
      ['Deterministic model set','Inter model comparison and regional model testing',(modelAdapter.getState()||{}).source==='live'?'live':'experimental','Selected point and forecast window','Model Lab and forecast diagnostics','Archive every run and calculate regional skill'],
      ['global ensemble','Within model uncertainty',en&&en.loaded?'live':'experimental','Selected point','Confidence and forecast spread','Hazard specific ensemble products'],
      ['global reanalysis and historical forecast','Historical reference and deterministic verification','experimental','Three reference points on demand','Forecast skill and climatology','Scheduled verification service and station comparison'],
      ['satellite climate record and MERRA 2','Independent precipitation baseline fallback','experimental','Point climatology','Drought baseline','Backend climatology service'],
      ['CAMS air quality','Modelled AQI and particulate context','live','Point and district samples','Health, comfort and sectors','Quality control and local monitor fusion'],
      ['global river-flow model','Major river discharge context',flood&&flood.loaded?'live':'experimental','Major river grid','Flood engine','Basin mapping and discharge calibration'],
      ['Copernicus GLO 30 terrain','Elevation, slope and terrain ruggedness','static','Tehsil zonal statistics','Flood, wind, cold and GLOF','Versioned spatial feature service'],
      ['ICIMOD and GLOF register','Glacial lake and PDGL susceptibility','static','Northern basin and district','GLOF engine','Versioned inventory and monitoring updates'],
      ['Global earthquake feed','Recent seismic activity overlay','live','Event point and district radius','Seismic context','Event ingestion and ground motion service'],
      ['Satellite feature service','NDVI, NDMI, NDWI, LST and anomalies','planned','Raster and zonal products','Feature Lab, drought and heat','EO pipeline, QA, baselines and feature store']
    ];
  }
  function pill(state){const k=state==='live'?'live':state==='static'?'static':state==='planned'?'planned':'experimental';return `<span class="ml-pill ${k}">${esc(state)}</span>`;}

  function renderLedger(){
    const rows=loadExperiments(),host=$('mlExperimentRows'); if(!host)return;
    host.innerHTML=rows.length?rows.map(x=>`<tr><td><b>${esc(x.experiment_id)}</b></td><td>${esc(new Date(x.created_at).toLocaleString())}</td><td>${esc(x.location&&x.location.name)}</td><td>${esc(x.evaluation&&x.evaluation.variable)}</td><td>${esc(x.evaluation&&x.evaluation.lead_hours)}h</td><td>${esc(x.location&&x.location.regional_class)}</td><td>${pill(x.source&&x.source.live?'live':'experimental')}</td></tr>`).join(''):`<tr><td colspan="7" class="ml-ledger-empty">No experiment saved in this browser session.</td></tr>`;
  }
  function render(){
    const s=activeStation(); if(!s||!$('mlPlace'))return; const ctx=districtContext(s),region=regionProfile(s),reg=region.label,meta=varMeta(),vals=primaryProcessedFused(s),ms=modelStats();
    $('mlPlace').textContent=s.name||'Selected location'; $('mlExperimentId').textContent=experimentId(); $('mlExperimentTime').textContent=new Date().toLocaleString('en-GB',{timeZone:'Asia/Karachi'})+' PKT';
    $('mlGeoSupport').textContent=s.id&&String(s.id).startsWith('dist:')?'District sample':'Point weather'; $('mlGeoContext').textContent=`${ctx.tehsil} · ${ctx.district}${ctx.province?' · '+ctx.province:''}`;
    $('mlRegion').textContent=reg; $('mlRegion').title='Classification basis: '+region.basis; $('mlSeasonText').textContent=seasonName(); $('mlMatrixRegion').textContent=reg; $('mlMatrixRegion').title='Classification basis: '+region.basis;
    const currentModelState=modelAdapter.getState()||{}; const count=ms?ms.keys.length:0,total=modelAdapter.modelDefinitions().length; $('mlCoverage').textContent=count?`${count} / ${total}`:'Pending'; $('mlCoverageNote').textContent=count?`${currentModelState.source||'unknown'} streams for ${currentModelState.variable||'selected variable'}, ${currentModelState.lead||Number(($('mlLead')||{}).value)||0}h`:'Load the selected model comparison';
    $('mlVariableTag').textContent=meta.label; $('mlRawValue').textContent=fmt(vals.raw,meta); $('mlAdjustedValue').textContent=fmt(vals.processed,meta); $('mlFusedValue').textContent=fmt(vals.fused,meta); $('mlRawNote').textContent=vals.rawNote; $('mlAdjustedNote').textContent=vals.processedNote; $('mlFusedNote').textContent=vals.fusedNote;
    $('mlProcessingChain').innerHTML=`<strong>${esc((s.liveSource||'seed').replace(/-/g,' '))}</strong><span class="ml-arrow">→</span>${esc(vals.processedNote)}<span class="ml-arrow">→</span>${ms?ms.keys.length+' model streams':'comparison pending'}<span class="ml-arrow">→</span>backend selection or fusion`;
    const parts=confidenceParts(s), band='Diagnostics';
    $('mlUncertainty').innerHTML=parts.map(p=>`<div class="ml-urow ml-diagnostic-row"><span title="${esc(p.note)}">${esc(p.name)}</span><span class="ml-uval">${esc(p.display||'—')}</span><small>${esc(p.note||'')}</small></div>`).join('');
    $('mlOverallConfidence').textContent='No probability'; $('mlOverallConfidence').title='Raw diagnostics are shown separately. Verified skill requires observation-matched verification.'; $('mlOverallBand').textContent=band;
     
    try{
      if(window.AGN&&AGN.work&&typeof AGN.work.publishModelLab==='function'){
        AGN.work.publishModelLab({
          location:{ id:s.id||null, name:s.name||null, lat:s.lat, lon:s.lon,
                     tehsil:ctx.tehsil||null, district:ctx.district||null, province:ctx.province||null },
          variable:meta.key||($('mlVariable')||{}).value||null, variableLabel:meta.label||null,
          unit:meta.unit||null, leadHours:Number(($('mlLead')||{}).value)||null,
          raw:vals.raw, processed:vals.processed, fused:vals.fused,
          processedNote:vals.processedNote||null,
          confidence:null, confidenceBand:null, evidenceReadiness:null,
          diagnostics:parts.map(function(pp){ return {name:pp.name, display:pp.display, note:pp.note}; }),
          modelCount:count, modelTotal:total, region:reg, regionBasis:region.basis||null,
          provider:s.liveSource||'seed', experimentId:experimentId(),
          structured:true, at:Date.now()
        });
      }
    }catch(_){}
    const _cr=conflictRows(s); $('mlConflicts').innerHTML=_cr.length?'':'<p class="ml-note">No comparison has been loaded for this location: no conflict to report yet.</p>'; if(_cr.length) $('mlConflicts').innerHTML=_cr.map(r=>{const st=conflictStyle[r.level];return `<div class="ml-conflict"><i style="background:${st[0]}"></i><div><h4>${esc(r.title)}</h4><p>${esc(r.detail)}</p></div><strong style="color:${st[0]};background:${st[1]}">${st[2]}</strong></div>`;}).join('');
    const fetched=s.liveFetchedAt?new Date(s.liveFetchedAt).toLocaleString('en-GB',{timeZone:'Asia/Karachi'}):'Not available'; const grid=number(s.gridElev),elev=number(s.elev);
    const prov=[['Source',({metno:'second-opinion feed (fallback)'}[String(s.liveSource||'').toLowerCase()])||(s.liveSource?'model forecast':'no live reading')],['Resolved model','Model forecast best-match blend; the underlying model is not named in the response'],['Issue or fetch time',fetched+' PKT'],['Valid support','Active point and selected forecast lead'],['Spatial resolution','Provider model grid, approximately 11 km reference'],['Point elevation',elev==null?'Not available':Math.round(elev)+' m'],['Native grid elevation',grid==null?'Pending':Math.round(grid)+' m'],['Transformation',vals.processedNote],['Regional classification',reg+' · '+region.basis],['Landform / TPI 300',region.landform||region.tpi!=null?((region.landform||'not supplied')+' · '+(region.tpi==null?'TPI not supplied':'TPI '+Math.round(region.tpi))):'Not supplied; canonical terrain fallback used'],['Canonical field',($('mlVariable').value==='temp'?'temperature_2m':$('mlVariable').value==='feels'?'apparent_temperature':$('mlVariable').value==='wind'?'wind_speed_10m':'precipitation')],['Data status',(s.weatherLive||s.featureLive)?'Live or recently refreshed':'Seed or fallback context']];
    $('mlProvenance').innerHTML=prov.map(x=>`<div><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('');
    $('mlSuitabilityRows').innerHTML=suitability.map(r=>`<tr class="${r[0]===reg?'ml-row-current':''}"><td><b>${esc(r[0])}</b>${r[0]===reg?' <span class="ml-pill static">Selected</span>':''}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td><td><span class="ml-pill pending">Evaluation pending</span></td></tr>`).join('');
    $('mlDatasetRows').innerHTML=datasetRows(s).map(r=>`<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${pill(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td><td>${esc(r[5])}</td></tr>`).join('');
    $('mlModeStatus').textContent=(s.weatherLive?'Live source':'Seed or fallback')+' · '+meta.label+' · '+$('mlLead').value+'h';
    renderLedger();
  }
  async function loadComparison(){
    const b=$('mlLoadModels'),old=b.textContent;b.disabled=true;b.textContent='Loading…';
    try{
      modelAdapter.updateState({variable:$('mlVariable').value,lead:Number($('mlLead').value)});
      const reloaded=await modelAdapter.reloadVariable(); if(!reloaded||!reloaded.called) await modelAdapter.loadStation(activeStation());
    }catch(e){$('mlModeStatus').textContent='Comparison failed · '+e.message;}
    finally{b.disabled=false;b.textContent=old;setTimeout(render,50);}
  }
  function save(){const rows=loadExperiments(),snap=currentSnapshot();rows.unshift(snap);saveExperiments(rows);if(experimentWorkflow)experimentWorkflow.save(snap,{demo:true,source:'model-lab-ui'}).catch(function(e){if(window.__MACH_DEBUG)console.debug('[model experiment repository]',e&&e.message);});modelLocal.currentExperimentId='';render();}
  function queueComparison(){clearTimeout(modelLocal.comparisonTimer);modelLocal.comparisonQueued=true;modelLocal.comparisonTimer=setTimeout(function(){modelLocal.comparisonQueued=false;loadComparison();},220);}
  function bind(){
    $('mlVariable').addEventListener('change',queueComparison);$('mlLead').addEventListener('change',queueComparison);$('mlSeason').addEventListener('change',render);$('mlLoadModels').addEventListener('click',loadComparison);$('mlSaveExperiment').addEventListener('click',save);$('mlExportExperiment').addEventListener('click',()=>{const x=currentSnapshot();download(x.experiment_id+'.json',JSON.stringify(x,null,2));});$('mlClearExperiments').addEventListener('click',()=>{if(window.confirm('Clear the browser-local Model Lab experiment register? This cannot be undone.')){saveExperiments([]);renderLedger();}});
  }
  function init(){if(!$('mlPlace'))return;bind();render();}
  window.AGN=window.AGN||{};
  if(AGN.implementations) AGN.implementations.define('modelLab',{
    render:render,
    loadComparison:loadComparison,
    queueComparison:queueComparison,
    cancelQueuedComparison:function(){clearTimeout(modelLocal.comparisonTimer);modelLocal.comparisonQueued=false;},
    getState:function(){contracts.apiPayload({schema:'model-lab-state',data:{variable:modelLocal.variable,lead:modelLocal.lead}},{section:'modelab',boundary:'getState'});return {currentExperimentId:modelLocal.currentExperimentId,comparisonQueued:modelLocal.comparisonQueued,variable:($('mlVariable')||{}).value||modelLocal.variable,leadHours:Number(($('mlLead')||{}).value||modelLocal.leadHours),season:($('mlSeason')||{}).value||modelLocal.season,experimentCount:loadExperiments().length};}
  },{source:'modules/model-lab/33-agn-model-lab.js',owner:'modelab',moduleType:'isolated-section-implementation',dependencies:['data:contracts','data:persistence','workflow:modelExperiments','adapter:modelLabLegacy','data:storage'],globalDependencies:[],compatibilityGlobals:[]});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
