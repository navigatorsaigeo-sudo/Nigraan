(function(global){
  'use strict';
  const AGN=global.AGN=global.AGN||{};
  const B=AGN.backendInterfaces;
  const PROFILES=[
    {id:'isb-f7-provisional',name:'F-7',aliases:[],latitude:33.7204,longitude:73.0561,matchRadiusKm:1.2,lczCandidate:'LCZ 6 / B transitional',lczLabel:'Open low-rise with scattered trees',profileStatus:'provisional_expert_demonstration',features:{tree_canopy_fraction:.38,impervious_fraction:.42,building_fraction:.23,mean_building_height_m:8,sky_view_factor:.76,ndvi:.38,road_fraction:.10,distance_to_green_m:90,distance_to_hills_km:2,ventilation_factor:1.15,lst_anomaly_c:-.7,anthropogenic_heat_index:.2}},
    {id:'isb-i8-provisional',name:'I-8 Markaz Ground',aliases:['I-8','I 8','I-8 Markaz'],latitude:33.6689,longitude:73.0730,matchRadiusKm:1.4,lczCandidate:'LCZ 6 / 8 transitional',lczLabel:'Open low-rise / large low-rise transport-influenced',profileStatus:'provisional_expert_demonstration',features:{tree_canopy_fraction:.14,impervious_fraction:.62,building_fraction:.35,mean_building_height_m:10,sky_view_factor:.65,ndvi:.17,road_fraction:.22,distance_to_green_m:180,distance_to_hills_km:7.5,ventilation_factor:.85,lst_anomaly_c:.4,anthropogenic_heat_index:.7}},
    {id:'rwp-raja-bazaar-provisional',name:'Raja Bazaar',aliases:['Raja Bazar'],latitude:33.6123,longitude:73.0563,matchRadiusKm:1.2,lczCandidate:'LCZ 3 candidate',lczLabel:'Compact low-rise commercial core',profileStatus:'provisional_expert_demonstration',features:{tree_canopy_fraction:.04,impervious_fraction:.86,building_fraction:.66,mean_building_height_m:11,sky_view_factor:.36,ndvi:.05,road_fraction:.26,distance_to_green_m:650,distance_to_hills_km:11.5,ventilation_factor:.55,lst_anomaly_c:1.4,anthropogenic_heat_index:1.2}}
  ];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const num=(v,d)=>(v===null||v===undefined||v==='')?d:(Number.isFinite(Number(v))?Number(v):d);
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function haversine(lat1,lon1,lat2,lon2){const r=6371.0088,p1=lat1*Math.PI/180,p2=lat2*Math.PI/180,dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180,a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*r*Math.asin(Math.sqrt(a));}
  function matchProfile(input){const n=norm(input&&input.name);let best=null,dist=null;for(const p of PROFILES){const names=[p.name].concat(p.aliases||[]).map(norm);if(n&&names.includes(n))return {profile:p,distanceKm:0};if(input&&Number.isFinite(+input.latitude)&&Number.isFinite(+input.longitude)){const d=haversine(+input.latitude,+input.longitude,p.latitude,p.longitude);if(d<=p.matchRadiusKm&&(dist==null||d<dist)){best=p;dist=d;}}}return {profile:best,distanceKm:dist};}
  function phase(hour,solar){if(Number.isFinite(+solar))return +solar>=60?'day':'night';const h=Number.isFinite(+hour)?(+hour%24):14;return h>=7&&h<18?'day':'night';}
  function morphologyDelta(features,ph){const f=features||{},tree=clamp(num(f.tree_canopy_fraction,.25),0,1),imp=clamp(num(f.impervious_fraction,.45),0,1),bld=clamp(num(f.building_fraction,.30),0,1),ndvi=clamp(num(f.ndvi,.25),-1,1),road=clamp(num(f.road_fraction,.12),0,1),svf=clamp(num(f.sky_view_factor,.70),.05,1),vent=clamp(num(f.ventilation_factor,1),.3,1.7),hills=Math.max(0,num(f.distance_to_hills_km,8)),lst=clamp(num(f.lst_anomaly_c,0),-8,8),anth=clamp(num(f.anthropogenic_heat_index,.5),0,3);let terms;if(ph==='day'){terms={impervious:1.8*(imp-.45),building:1.2*(bld-.30),tree_canopy:-2*(tree-.25),vegetation:-.8*(ndvi-.25),roads:.6*(road-.12),street_shade:-.6*Math.max(0,.6-svf),ventilation:-.9*(vent-1),foothill_context:-.6*Math.exp(-hills/3),surface_thermal_anomaly:.25*lst,anthropogenic_heat:.25*anth};}else{terms={impervious:2*(imp-.45),building:1.4*(bld-.30),tree_canopy:-1*(tree-.25),vegetation:-.5*(ndvi-.25),roads:.7*(road-.12),canyon_heat_retention:1.2*Math.max(0,.7-svf),ventilation:-1.2*(vent-1),foothill_context:-.4*Math.exp(-hills/3),surface_thermal_anomaly:.15*lst,anthropogenic_heat:.45*anth};}const raw=Object.values(terms).reduce((a,b)=>a+b,0);return {delta:clamp(raw,-2,2.5),raw,terms};}
  



var HEAT_VALIDITY={
  minAirTempC:-30, maxAirTempC:43.3, maxIndexC:58.3, minRhPct:1, maxRhPct:100,
  source:'NWS apparent-temperature table (Rothfusz 1990, NWS Technical Attachment '
        +'SR 90-23). The table is published to 137 F (58.3 C) with dry bulb to '
        +'110 F (43.3 C).',
  why:'above the table the T^2 R^2 term diverges and the polynomial is '
     +'extrapolation rather than the published method, so this engine has no '
     +'answer rather than a large one.',
  lowBranchFloored:true,
  lowBranchFlooredWhy:'below 80 F the NWS value is the Steadman average; this engine '
     +'returns max(air temperature, average) because NWS publishes no heat index '
     +'below the air temperature. The floor is therefore part of the method as '
     +'implemented here and is declared as such - v91.10 said the low branch was '
     +'NOT floored while the code floored it, which is the contradiction this '
     +'field exists to close.'
};
function heatIndexDetail(t,rh){
  var T=Number(t), R=Number(rh);
  if(!isFinite(T)||!isFinite(R))
    return {value:null, refused:true, airTempC:(isFinite(T)?T:null),
            why:'air temperature and relative humidity are both required and one is absent'};
  if(T>HEAT_VALIDITY.maxAirTempC)
    return {value:null, refused:true, airTempC:T, bound:'maxAirTempC',
            limit:HEAT_VALIDITY.maxAirTempC,
            why:'air temperature '+T.toFixed(1)+' C is above the validity of the heat-index '
               +'method ('+HEAT_VALIDITY.maxAirTempC+' C dry bulb). '+HEAT_VALIDITY.why};
  if(T<HEAT_VALIDITY.minAirTempC)
    return {value:null, refused:true, airTempC:T, bound:'minAirTempC',
            limit:HEAT_VALIDITY.minAirTempC,
            why:'air temperature '+T.toFixed(1)+' C is below the range this index is '
               +'defined over. '+HEAT_VALIDITY.why};
  var v=heatIndexRaw(T,R);
  if(v==null)
    return {value:null, refused:true, airTempC:T,
            why:'the index could not be evaluated for these inputs'};
  if(v>HEAT_VALIDITY.maxIndexC)
    return {value:null, refused:true, airTempC:T, bound:'maxIndexC',
            limit:HEAT_VALIDITY.maxIndexC, extrapolated:Math.round(v*10)/10,
            why:'the regression returns '+v.toFixed(1)+' C, above the published table '
               +'ceiling of '+HEAT_VALIDITY.maxIndexC+' C. '+HEAT_VALIDITY.why};
  return {value:v, refused:false, airTempC:T, within:true};
}
function heatIndexC(t,rh){
  var d=heatIndexDetail(t,rh);
  return d.refused ? null : d.value;
}
function heatIndexRaw(t,rh){
  var T=t*9/5+32, R=Math.max(1,Math.min(100,Number(rh)));
  if(!isFinite(T)||!isFinite(R)) return null;
  var simple=0.5*(T+61+((T-68)*1.2)+(R*0.094));
  var avg=(simple+T)/2;
  

  if(avg<80) return (avg-32)*5/9;   /* v91.17.283.35 · D5: NWS exactly (server/api/heatindex.mjs), no floor at T */
  var HI=-42.379+2.04901523*T+10.14333127*R-0.22475541*T*R-0.00683783*T*T-0.05481717*R*R
        +0.00122874*T*T*R+0.00085282*T*R*R-0.00000199*T*T*R*R;
  if(R<13&&T>=80&&T<=112) HI-=((13-R)/4)*Math.sqrt((17-Math.abs(T-95))/17);
  if(R>85&&T>=80&&T<=87)  HI+=((R-85)/10)*((87-T)/5);
  return (HI-32)*5/9;
}
try{ var _P=(window.AGN=window.AGN||{}); _P.physics=_P.physics||{};
     _P.physics.heatIndexC=heatIndexC;
     _P.physics.heatIndexRaw=heatIndexRaw;
     _P.physics.heatIndexDetail=heatIndexDetail;
     _P.physics.heatIndexValidity=HEAT_VALIDITY;
     

     _P.physics.heatIndexBasis='NWS: Steadman simple index averaged with air temperature below '
       +'80 F, Rothfusz regression with the low-humidity and high-humidity adjustments above it. '
       +'Floored at air temperature on BOTH branches - NWS publishes no heat index below the '
       +'air temperature. Refused outside the published table: dry bulb above '
       +HEAT_VALIDITY.maxAirTempC+' C, or an index above '+HEAT_VALIDITY.maxIndexC+' C.';
     

     _P.physics.heatIndexDiscontinuity={
       boundaryF:80, boundaryCRange:[26.0,27.2],
       maxStepC:2.6, worstAt:{airTempC:26.05, humidityPct:100},
       smoothed:false,
       why:'the Steadman average and the Rothfusz regression are separate fits and do not '
          +'meet at the 80 F boundary. Blending them would publish a number neither '
          +'reference defines, so the step is declared rather than removed.',
       affectsHazardScore:false,
       affectsHazardScoreWhy:'the low branch ends below 27.2 C and the lowest zone heat '
          +'threshold is 28 C, so the apparent-temperature stress term is zero across the band'
     }; }catch(_){}
  

  function wetBulb(t,rh,elevM){
    if(typeof window.wetBulbStullC!=='function') return null;
    return window.wetBulbStullC(t,rh,Number.isFinite(+elevM)?{elevationM:+elevM}:null);
  }
  function estimateLocal(payload){const p=Object.assign({},payload||{}),regional=num(p.regional_air_temperature_c,num(p.temperature_c,34)),rh=num(p.relative_humidity_pct,num(p.humidity_pct,45)),wind=num(p.wind_kmh,10),solar=num(p.solar_wm2,0),m=( (global.AGN&&global.AGN.urbanHeat&&typeof global.AGN.urbanHeat.matchProfile==='function')?global.AGN.urbanHeat.matchProfile:matchProfile)({name:p.name,latitude:p.latitude,longitude:p.longitude}),profile=m.profile,supplied=p.features||{},features=Object.assign({},profile?profile.features:{},supplied),ph=phase(p.hour_local,solar);let terrain=0; const _pe=num(p.point_elevation_m,null), _ge=num(p.provider_grid_elevation_m,null);if(p.elevation_adjusted_by_provider===false&&_pe!=null&&_ge!=null&&Number.isFinite(_pe)&&Number.isFinite(_ge))terrain=clamp(-.0065*(_pe-_ge),-4,4);const md=(profile||Object.keys(supplied).length)?morphologyDelta(features,ph):{delta:0,raw:0,terms:{}},cal=p.calibration_status==='validated'?num(p.calibrated_bias_c,0):0,local=regional+terrain+md.delta+cal,keys=['tree_canopy_fraction','impervious_fraction','building_fraction','sky_view_factor','ndvi','road_fraction','distance_to_hills_km','ventilation_factor','lst_anomaly_c','anthropogenic_heat_index'],complete=features?keys.filter(k=>features[k]!=null).length/keys.length:0,confidence=p.calibration_status==='validated'?'calibrated':Object.keys(supplied).length&&complete>=.8?'eo-feature-candidate':profile?'provisional-demonstration':'regional-model-only',uncertainty=confidence==='calibrated'?.6:confidence==='eo-feature-candidate'?1:confidence==='provisional-demonstration'?1.5:2.5,shade=features?clamp(num(features.tree_canopy_fraction,0)*.5+(1-num(features.sky_view_factor,1))*.35,0,.85):0,mrt=solar>60?local+Math.min(18,(solar/80)*(1-shade)):local,rhL=(function(){ try{if(!Number.isFinite(regional)||!Number.isFinite(rh)||local===regional)return rh;var A=17.625,B=243.04,g=Math.log(Math.max(1,rh)/100)+A*regional/(B+regional),td=B*g/(A-g);return clamp(100*Math.exp(A*td/(B+td)-A*local/(B+local)),1,100);}catch(_){return rh;}})(),hi=heatIndexC(local,rhL),wb=wetBulb(local,rhL,_pe),ped=Math.max(local,hi,local+.25*(mrt-local)-.025*wind);return {schema:'agn.urban-heat-microclimate.v1',release:(global.AGN_VERSION||'version-unset'),operational:false,status:profile||Object.keys(supplied).length?'provisional-local-estimate':'regional-model-only',location:{name:p.name,latitude:p.latitude,longitude:p.longitude,pointElevationM:p.point_elevation_m},regional:{airTemperatureC:+regional.toFixed(2),humidityPct:+rh.toFixed(1),windKmh:+wind.toFixed(1),solarWm2:+solar.toFixed(1),provider:p.provider||'regional-model',gridLatitude:p.grid_latitude,gridLongitude:p.grid_longitude,modelResolutionKm:p.model_resolution_km},microclimate:{phase:ph,lczCandidate:profile?profile.lczCandidate:p.lcz_candidate,lczLabel:profile?profile.lczLabel:null,terrainDeltaC:+terrain.toFixed(2),morphologyDeltaC:+md.delta.toFixed(2),calibrationDeltaC:+cal.toFixed(2),urbanDeltaC:+(terrain+md.delta+cal).toFixed(2),localAirTemperatureC:+local.toFixed(2),rawPriorDeltaC:+md.raw.toFixed(2),terms:Object.fromEntries(Object.entries(md.terms).map(([k,v])=>[k,+v.toFixed(3)]))},humanHeat:{heatIndexC:+hi.toFixed(2),wetBulbC:(wb==null?null:+wb.toFixed(2)),wetBulbBasis:(typeof window.wetBulbBasis==='function'?window.wetBulbBasis(Number.isFinite(_pe)?{elevationM:_pe}:null):null),wetBulbWhy:(wb==null&&typeof window.wetBulbRefusalWhy==='function'?window.wetBulbRefusalWhy(local,rh):null),meanRadiantTemperatureProxyC:+mrt.toFixed(2),pedestrianHeatProxyC:+ped.toFixed(2),utciStatus:'not-computed'},quality:{confidence,uncertaintyPlusMinusC:uncertainty,featureCompleteness:+complete.toFixed(2),calibrationStatus:p.calibration_status||'not-validated',profileStatus:profile&&profile.profileStatus,gridWarning:'Regional provider grid and neighbourhood morphology are separate evidence layers.'},profile:profile||null,limitations:['Development estimator, not an observation.','Provisional profiles cannot support warnings.','Local sensors and seasonal calibration are required before operations promotion.']};}
  function stationPayload(s){const f=s&&s.omFeatures||{},terr=AGN.terrain&&AGN.terrain.forStation?AGN.terrain.forStation(s):null;return {name:s&&s.name,latitude:s&&s.lat,longitude:s&&s.lon,regional_air_temperature_c:num(s&&s.t,34),relative_humidity_pct:num(s&&s.hum,45),wind_kmh:num(s&&s.wind,10),solar_wm2:num(f.shortwave,num(s&&s.shortwave,0)),hour_local:(new Date()).getHours(),point_elevation_m:num(s&&s.elev,terr&&terr.elev_m),provider_grid_elevation_m:num(s&&s.gridElev,null),grid_latitude:num(s&&s.gridLat,null),grid_longitude:num(s&&s.gridLon,null),elevation_adjusted_by_provider:!!(s&&s.__lapseAdjusted),provider:s&&s.liveSource||'regional-model'};}
  function localizeStation(s){if(!s)return null; if(C12.withheld)return null;   /* v91.17.283.6 C12: no provisional profile estimate */ if(!(s.t!=null&&Number.isFinite(+s.t))||s.t==null||!(s.hum!=null&&Number.isFinite(+s.hum))||s.hum==null)return null;const key=[s.name,s.lat,s.lon,s.t,s.hum,s.wind,s.omFeatures&&s.omFeatures.shortwave].join('|');if(s.__urbanHeat&&s.__urbanHeatKey===key)return s.__urbanHeat;const out=estimateLocal(stationPayload(s));try{s.__urbanHeat=out;s.__urbanHeatKey=key;s.urbanHeatDeltaC=out.microclimate.urbanDeltaC;s.localAirTemperatureC=out.microclimate.localAirTemperatureC;}catch(_){}return out;}
  function compareLocal(base){const points=PROFILES.map(p=>({name:p.name,latitude:p.latitude,longitude:p.longitude}));const b=Object.assign({regional_air_temperature_c:34,relative_humidity_pct:45,wind_kmh:12,solar_wm2:650,hour_local:14},base||{}),results=points.map(p=>estimateLocal(Object.assign({},b,p))),temps=results.map(r=>r.microclimate.localAirTemperatureC);return {schema:'agn.urban-heat-comparison.v1',release:(global.AGN_VERSION||'version-unset'),operational:false,sharedRegionalBaseline:true,regionalAirTemperatureC:b.regional_air_temperature_c,localTemperatureRangeC:+(Math.max.apply(null,temps)-Math.min.apply(null,temps)).toFixed(2),results,warning:'Controlled development comparison. Differences are morphology-prior estimates until EO features and local sensor calibration are connected.'};}

  if(B&&typeof B.defineEndpoint==='function'){
    const field=(name,type,required,description,extra)=>Object.assign({name,type,required,description},extra||{}),errors=[{code:'AUTH_REQUIRED',httpStatus:401},{code:'SCOPE_REQUIRED',httpStatus:403},{code:'VALIDATION_ERROR',httpStatus:422}];
    const ensure=(id,d)=>{if(!B.get(id))B.defineEndpoint(id,d);};
    ensure('urbanHeat.posture',{section:'livedata',title:'Urban heat correction posture',service:'Microclimate readiness and scientific boundary',method:'GET',path:'/api/v1/urban-heat/posture',auth:{scopes:['urban-heat:read']},request:{},response:{requiredFields:['release','operational','regionalWeatherSeparated','calibratedLocalAirModel'],description:'Urban heat correction readiness and limitations.'},persistence:{required:false,store:'urban_heat_posture',retention:'diagnostic',immutable:true,audit:true},errors});
    ensure('urbanHeat.profiles',{section:'livedata',title:'Urban morphology profiles',service:'LCZ candidate and morphology feature registry',method:'GET',path:'/api/v1/urban-heat/profiles',auth:{scopes:['urban-heat:read']},request:{},response:{collection:true,description:'Provisional or validated neighbourhood morphology profiles.'},persistence:{required:false,store:'urban_heat_profiles',retention:'model lifetime',immutable:true,audit:true},errors});
    ensure('urbanHeat.estimate',{section:'livedata',title:'Estimate local urban heat',service:'Regional-to-neighbourhood microclimate correction',method:'POST',path:'/api/v1/urban-heat/estimate',auth:{scopes:['urban-heat:estimate']},idempotency:{required:true},request:{body:[field('name','string',false,'Location name.'),field('latitude','number',true,'Latitude.'),field('longitude','number',true,'Longitude.'),field('regional_air_temperature_c','number',true,'Regional 2 m model temperature.'),field('relative_humidity_pct','number',true,'Relative humidity.'),field('wind_kmh','number',true,'Wind speed.'),field('solar_wm2','number',false,'Shortwave radiation.'),field('features','object',false,'EO and urban morphology features.')]},response:{requiredFields:['regional','microclimate','humanHeat','quality'],description:'Bounded neighbourhood estimate with confidence and provenance.'},persistence:{required:false,store:'urban_heat_estimates',retention:'diagnostic',immutable:true,audit:true},validation:['Provisional profiles cannot be labelled operational.','Surface temperature cannot be directly substituted for 2 m air temperature.'],errors});
    ensure('urbanHeat.compare',{section:'livedata',title:'Compare neighbourhood heat',service:'Controlled same-baseline neighbourhood comparison',method:'POST',path:'/api/v1/urban-heat/compare',auth:{scopes:['urban-heat:estimate']},idempotency:{required:true},request:{body:[field('points','array',true,'Locations to compare.'),field('regional_air_temperature_c','number',true,'Shared regional baseline.'),field('relative_humidity_pct','number',true,'Shared humidity.'),field('wind_kmh','number',true,'Shared wind.'),field('solar_wm2','number',false,'Shared radiation.')]},response:{requiredFields:['sharedRegionalBaseline','regionalAirTemperatureC','localTemperatureRangeC','results'],description:'Controlled comparison isolating morphology-prior effects.'},persistence:{required:false,store:'urban_heat_comparisons',retention:'diagnostic',immutable:true,audit:true},errors});
    B.defineGuide('urban-heat-microclimate',{title:'Urban heat microclimate and LCZ correction',sub:'Separates regional provider temperature from neighbourhood morphology and human-exposure context. Provisional profiles are visibly non-operational until EO features and local sensor calibration are supplied.',service:'Regional weather provider, EO feature service, LCZ classifier, urban sensor network and scientific validation workflow',endpoints:['urbanHeat.posture','urbanHeat.profiles','urbanHeat.estimate','urbanHeat.compare']});
  }

  const state={last:null,lastError:null};
  /* v91.17.283.6 · C12 (data/urban-heat-c12.json, urban-heat-c12-91.17.283.3, decided 2026-10-22): nothing about urban heat is served without a held-out pass.
     The provisional LCZ morphology profiles below never had one, so while C12 is applied (or the server has not said otherwise) the panel,
     the local comparison and the per-station localisation say "not assessed (no tested skill)" with the decision's own reason. */
  const C12={withheld:true,why:"not assessed: the urban heat cell map showed no skill against independent stations (Karachi and Lahore, 11 stations: rank correlation 0.005, and a larger error than assuming no difference), so it is withheld in all of Pakistan",rule:"nothing is served unless it beats the current value (no urban-rural difference) on held-out data",releaseWhen:"a held-out test at independent stations in which the cell map beats 'no difference' (lower error, confidence interval of the paired difference below 0) and ranks stations (rank correlation interval above 0)",version:"urban-heat-c12-91.17.283.3",source:'data/urban-heat-c12.json'};
  const c12Why=()=>String(C12.why||'').replace(/^not assessed:\s*/i,'').replace(/^./,c=>c.toUpperCase());
  function c12Status(){return {schema:'agn.urban-heat-c12.v1',assessed:false,status:'not assessed (no tested skill)',why:C12.why,rule:C12.rule,releaseWhen:C12.releaseWhen,decision:C12.version,source:C12.source};}
  function c12Refresh(){try{if(!/^https?:$/.test(location.protocol))return;fetch(location.origin+'/api/urban/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{const c=j&&j.c12;if(!c||typeof c!=='object')return;C12.withheld=c.applied!==false;if(c.reason)C12.why=c.reason;if(c.rule)C12.rule=c.rule;if(c.releaseWhen)C12.releaseWhen=c.releaseWhen;if(c.version)C12.version=c.version;C12.source='GET /api/urban/status';try{const b=document.getElementById('agnUrbanHeatBack');if(b&&b.__c12)paintC12(b);}catch(_){}}).catch(()=>{});}catch(_){}}
  function paintC12(back){back.__c12=true;const e=x=>String(x==null?'':x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    back.innerHTML='<div class="agn-urban-heat-modal" role="dialog" aria-modal="true" aria-labelledby="agnUrbanHeatTitle"><button class="agn-urban-heat-close" type="button" aria-label="Close">\u00d7</button><div class="agn-urban-heat-eyebrow">URBAN HEAT \u00b7 NOT ASSESSED</div><h2 id="agnUrbanHeatTitle">Urban heat microclimate and Local Climate Zone correction</h2><p class="agn-urban-heat-boundary" id="agnUhC12"><b>Not assessed (no tested skill).</b> '+e(c12Why())+'</p><div class="agn-urban-heat-method"><b>Rule</b><span>'+e(C12.rule)+'</span></div><div class="agn-urban-heat-method"><b>Served again when</b><span>'+e(C12.releaseWhen)+'</span></div><div class="agn-urban-heat-method"><b>Operator note</b><span>The neighbourhood profiles (F-7, I-8, Raja Bazaar) and the LCZ offsets are provisional class priors with no held-out test, so no local estimate, comparison or profile offset is computed here. Decision: '+e(C12.version)+' ('+e(C12.source)+').</span></div><div class="agn-urban-heat-actions"><button data-uh="posture">Backend posture</button></div><pre id="agnUrbanHeatStatus" class="agn-urban-heat-status"></pre></div>';
    back.querySelector('.agn-urban-heat-close').onclick=()=>back.classList.remove('open');back.onclick=ev=>{if(ev.target===back)back.classList.remove('open');};
    back.querySelectorAll('[data-uh]').forEach(b=>b.onclick=()=>Promise.resolve(request('urbanHeat.posture',{})).catch(()=>{}));state.last=c12Status();renderStatus();return back;}
  async function request(id,params,opts){if(!B)throw new Error('Backend interface unavailable');try{state.lastError=null;state.last=await B.request(id,params||{},opts||{});return state.last;}catch(e){state.lastError={code:e&&e.code,message:String(e&&e.message||e)};throw e;}finally{renderStatus();}}
  function activeStation(){const id=typeof global.activeStationId==='function'?global.activeStationId():global.selectedId;return (global.STATIONS||[]).find(s=>s.id===id)||(global.STATIONS||[])[0]||null;}
  function currentEstimate(){const s=activeStation();return s?localizeStation(s):null;}
  function fmt(v,d=1){return Number.isFinite(+v)?(+v).toFixed(d):'—';}
  function renderStrip(){const host=document.querySelector('.card.cc');if(!host)return;let strip=document.getElementById('agnUrbanHeatStrip');if(!strip){strip=document.createElement('div');strip.id='agnUrbanHeatStrip';strip.className='agn-urban-heat-strip';strip.innerHTML='<div class="agn-uh-head"><div><span>Neighbourhood heat correction</span><b id="agnUhStatus">Regional model only</b></div><button type="button" id="agnUhCompareBtn">Compare F-7 · I-8 · Raja Bazaar</button></div><div class="agn-uh-grid"><div><span>Regional 2 m</span><b id="agnUhRegional">—</b><em>Provider model grid</em></div><div><span>Local estimate</span><b id="agnUhLocal">—</b><em id="agnUhLocalNote">Adjustment unavailable</em></div><div><span>Urban ΔT</span><b id="agnUhDelta">—</b><em id="agnUhDeltaNote">No LCZ profile</em></div><div><span>Confidence</span><b id="agnUhConfidence">—</b><em id="agnUhUncertainty">—</em></div></div><div class="agn-uh-warning" id="agnUhWarning"></div>';host.appendChild(strip);strip.querySelector('#agnUhCompareBtn').addEventListener('click',open);}
    

    const s0=activeStation(); const set=(id,t)=>{const el=document.getElementById(id);if(el&&el.textContent!==t)el.textContent=t;};    
    if(!s0||!Number.isFinite(+s0.lat)||!Number.isFinite(+s0.lon)) return;
    set('agnUhRegional',fmt(s0.t)+'°C');
    try{ const cb=document.getElementById('agnUhCompareBtn'); if(cb){ if(cb.textContent!=='Urban field (measured cells)') cb.textContent='Urban field (measured cells)'; cb.disabled=true; cb.title='Population-weighted heat-island field from GHSL/MODIS cells, calibrated on two station pairs'; } }catch(_){}
    const key=(+s0.lat).toFixed(3)+','+(+s0.lon).toFixed(3);
    if(renderStrip.__key===key && renderStrip.__r){ paint(renderStrip.__r); return; }
    if(renderStrip.__key===key && (renderStrip.__busy || (renderStrip.__failAt && Date.now()-renderStrip.__failAt<120000))) return;    /* v91.17.266 · one request per point; a failure waits 2 min */
    if(renderStrip.__key!==key){ renderStrip.__r=null; renderStrip.__failAt=0; }
    renderStrip.__key=key; renderStrip.__busy=true; set('agnUhStatus','Loading urban field\u2026');
    var fail=function(){ renderStrip.__busy=false; renderStrip.__failAt=Date.now(); set('agnUhStatus','Urban field not available right now'); set('agnUhWarning','the urban field did not answer for this point'); };
    /* v91.17.283.15 · the urban field is part of the place's point-state record (the page store), not a request of its own */
    (window.AGN&&AGN.pointState?AGN.pointState.get(+s0.lat,+s0.lon):Promise.resolve(null))
      .then(function(ps){ return ps&&ps.ok&&ps.urban?ps.urban:null; })
      .then(function(r){ if(renderStrip.__key!==key) return; if(!r){ fail(); return; } renderStrip.__busy=false; renderStrip.__r=r; paint(r); })
      .catch(function(){ if(renderStrip.__key===key) fail(); });
    function paint(r){
      if(r.withheld){ set('agnUhStatus','Urban heat island: not assessed'); set('agnUhLocal','\u2014'); set('agnUhDelta','\u2014'); set('agnUhLocalNote','withheld'); set('agnUhDeltaNote','withheld'); set('agnUhConfidence','n/a'); set('agnUhUncertainty',''); set('agnUhWarning',String(r.why||'').replace(/^not assessed:\s*/i,'').replace(/^./,function(c){ return c.toUpperCase(); })); return; }   /* v91.17.283.5 C12 */
      if(!r.ready||!r.urban){ set('agnUhStatus','No urban heat island here'); set('agnUhLocal','\u2014'); set('agnUhDelta','0.0°C'); set('agnUhLocalNote','built surface under 5 %'); set('agnUhDeltaNote','no island to report'); set('agnUhConfidence','n/a'); set('agnUhUncertainty',''); set('agnUhWarning',r.why||'less than 5 % built surface at this point'); return; }
      const hi=r.heatIsland||{};
      set('agnUhStatus','Measured urban field \u00b7 potential on top of the forecast');
      set('agnUhLocal',(hi.nowC!=null?(hi.nowC>0?'+':'')+fmt(hi.nowC):'\u2014')+'°C now');
      set('agnUhLocalNote',(r.lcz&&r.lcz.name?('LCZ '+r.lcz.class+' '+r.lcz.name):'built cell')+(r.fleet&&r.fleet.applied?(' \u00b7 MACH fleet term '+(r.fleet.termC>0?'+':'')+fmt(r.fleet.termC)+'\u00b0C is on the served forecast here ('+r.fleet.cityName+', '+r.fleet.stations+' stations, Tier B)'):' \u00b7 not a temperature, not added to the forecast'));
      set('agnUhDelta',(hi.maxC!=null?'+'+fmt(hi.maxC):'\u2014')+'°C');
      set('agnUhDeltaNote','typical calm, clear night maximum (Oke 1981 geometry and Oke 1973 town size, calibrated '+fmt(hi.calibration,2)+' on 2 station pairs and 16 MACH stations)');
      set('agnUhConfidence',(r.fleet&&r.fleet.check&&r.fleet.check.stations>=15)?('fleet-checked \u00b7 '+r.fleet.check.stations+' points, rank rho '+fmt(r.fleet.check.spearman,2)):((hi.calibrationExtrapolation&&hi.calibrationExtrapolation.factor>1.5)?'ranking only':'two-pair calibration'));
      set('agnUhUncertainty',(r.fleet&&r.fleet.check&&r.fleet.check.stations>=15)?('model night maximum '+fmt(r.fleet.check.modelMeanMaxC)+'\u00b0C vs fleet '+fmt(r.fleet.check.observedMeanMaxC)+'\u00b0C (Islamabad-Rawalpindi, vs the rural airport) \u00b7 the served forecast carries the fleet residual, not this potential'):'sign verified at one pair, magnitude not \u00b7 not a sensor reading');
      set('agnUhWarning',(r.caveat||'')+(hi.calibrationExtrapolation&&hi.calibrationExtrapolation.note?' '+hi.calibrationExtrapolation.note:''));
    }
  }
  function comparison(){if(C12.withheld)return c12Status();const s=activeStation(),base=s?stationPayload(s):{};return compareLocal(base);}   /* v91.17.283.6 C12 */
  function renderStatus(){const el=document.getElementById('agnUrbanHeatStatus');if(el)el.textContent=JSON.stringify(state.last||comparison(),null,2);}
  function renderModal(){let back=document.getElementById('agnUrbanHeatBack');if(C12.withheld){if(!back){back=document.createElement('div');back.id='agnUrbanHeatBack';back.className='agn-urban-heat-back';document.body.appendChild(back);}c12Refresh();return paintC12(back);}   /* v91.17.283.6 C12 */
  if(back&&back.__c12){back.remove();back=null;}if(back)return back;back=document.createElement('div');back.id='agnUrbanHeatBack';back.className='agn-urban-heat-back';back.innerHTML='<div class="agn-urban-heat-modal" role="dialog" aria-modal="true" aria-labelledby="agnUrbanHeatTitle"><button class="agn-urban-heat-close" type="button" aria-label="Close">×</button><div class="agn-urban-heat-eyebrow">V81.0 SCIENTIFIC CORRECTION</div><h2 id="agnUrbanHeatTitle">Urban heat microclimate and Local Climate Zone correction</h2><p class="agn-urban-heat-boundary">Regional weather remains the atmospheric baseline. Neighbourhood differences are added only through a separate, bounded morphology layer with visible confidence. The three example profiles are provisional demonstrations—not observations or operational classifications.</p><div class="agn-urban-heat-actions"><button data-uh="local">Local comparison</button><button data-uh="posture">Backend posture</button><button data-uh="profiles">Profiles</button><button data-uh="estimate">Estimate selected point</button><button data-uh="compare">Backend comparison</button></div><div class="agn-urban-heat-method"><b>Required for operational promotion</b><span>100 m LCZ/urban morphology grid · Sentinel-2 canopy and imperviousness · Landsat surface-temperature anomaly · building geometry and sky-view factor · calibrated urban sensors · seasonal/day-night validation · uncertainty and bias evidence.</span></div><pre id="agnUrbanHeatStatus" class="agn-urban-heat-status"></pre></div>';document.body.appendChild(back);back.querySelector('.agn-urban-heat-close').onclick=()=>back.classList.remove('open');back.onclick=e=>{if(e.target===back)back.classList.remove('open');};const actions={local:async()=>{state.last=comparison();renderStatus();},posture:()=>request('urbanHeat.posture',{}),profiles:()=>request('urbanHeat.profiles',{}),estimate:()=>{const s=activeStation();return request('urbanHeat.estimate',{body:stationPayload(s)},{idempotencyKey:'urban-estimate-'+Date.now()});},compare:()=>{const s=activeStation(),base=stationPayload(s);return request('urbanHeat.compare',{body:Object.assign({},base,{points:PROFILES.map(p=>({name:p.name,latitude:p.latitude,longitude:p.longitude}))})},{idempotencyKey:'urban-compare-'+Date.now()});}};back.querySelectorAll('[data-uh]').forEach(b=>b.onclick=()=>Promise.resolve(actions[b.dataset.uh]()).catch(()=>{}));state.last=comparison();renderStatus();return back;}
  function open(){renderModal().classList.add('open');}
  function installButton(){if(document.getElementById('agnUrbanHeatButton'))return;const btn=document.createElement('button');btn.type='button';btn.id='agnUrbanHeatButton';btn.className='agn-urban-heat-button';btn.textContent='Urban heat';btn.title='Open neighbourhood heat correction console';btn.onclick=open;const host=document.querySelector('.topbar-actions,.hdr-actions,.top-actions,.nav-actions,.topbar')||document.body;host.appendChild(btn);}
  try{c12Refresh();}catch(_){}
  AGN.urbanHeat={c12:()=>({withheld:C12.withheld,why:C12.why,rule:C12.rule,releaseWhen:C12.releaseWhen,version:C12.version,source:C12.source}),profiles:PROFILES,matchProfile,morphologyDelta,estimateLocal,localizeStation,stationPayload,compareLocal,currentEstimate,open,diagnostics:()=>({state,comparison:comparison()})};
  AGN.architecture=Object.assign({},AGN.architecture,{urbanHeatMicroclimate:'regional 2 m weather separated from bounded LCZ/morphology correction, confidence and calibration status'});
  function install(){installButton();renderStrip();setInterval(renderStrip,10000);document.addEventListener('agn:dom',renderStrip);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);
