


(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)));
  const num=v=>(v===null||v===undefined||v==='')?null:(Number.isFinite(Number(v))?Number(v):null);
  const fmt=(v,d=1,s='')=>num(v)==null?'—':Number(v).toFixed(d)+s;
  const locationAdapter=window.AGN&&AGN.adapters?AGN.adapters.require('locationLegacy'):null;
  const riskAdapter=window.AGN&&AGN.adapters?AGN.adapters.require('riskLegacy'):null;
  const state=(window.AGN&&AGN.sectionState)?AGN.sectionState.state('hybridlab',{hazard:'flood',preset:'baseline',values:{},advanced:{},baseline:null,last:null}):{hazard:'flood',preset:'baseline',values:{},advanced:{},baseline:null,last:null};
  state.advanced=state.advanced||{};

  const HAZARDS={
    flood:{label:'Flood',maturity:'Physically anchored screening',validation:'Local impact calibration incomplete',boundary:'Core response uses the existing NIGRAAN pluvial/riverine flood screening engine. Terrain, NSS morphology and current river state stay at baseline. EO water signals and urban exposure are shown separately and do not become flood probability.'},
    heat:{label:'Heat stress',maturity:'Physically anchored screening',validation:'Heat pathway physically anchored; local impact validation incomplete',boundary:'Core response uses the existing heat pathway on cloned temperature, humidity and wind. LST, 850 hPa warmth, stagnation and urban form are contextual diagnostics unless a production heat equation explicitly consumes them.'},
    wind:{label:'Wind and gusts',maturity:'Physically anchored screening',validation:'Damage-threshold curve anchored; local impact validation incomplete',boundary:'Core response uses the existing gust-load and terrain-exposure wind pathway. Atmospheric ventilation assumptions and urban exposure remain separate context.'},
    drought:{label:'Drought',maturity:'Experimental short-window screening',validation:'Not SPI; impact calibration incomplete',boundary:'Operational SPI-30/90 is not slider-adjusted. The core scenario uses the existing P − ET₀, VPD and root-zone short-window screen. NDVI and NDMI are EO corroboration only until a validated crop-response model is connected.'},
    multi:{label:'Multi-driver',maturity:'Parallel pathway comparison',validation:'No compound probability or aggregate score',boundary:'Flood, heat, wind and short-window drought are recalculated in parallel. Advanced diagnostics are reported beside them. Unlike hazards are never collapsed into a synthetic compound score.'}
  };

  const PRESETS={
    flood:[
      {key:'baseline',label:'Current baseline',v:{},a:{}},
      {key:'heavy_rain',label:'Extreme rainfall',v:{rainIntensity:22,duration:3,wetness:65},a:{ndwiChange:.06}},
      {key:'saturated',label:'Saturated catchment',v:{rainIntensity:28,duration:6,wetness:92},a:{ndmiAnom:.08,ndwiChange:.04}},
      {key:'cloudburst',label:'Cloudburst test',v:{rainIntensity:65,duration:2,wetness:78},a:{ndwiChange:.12}},
      {key:'urban_runoff',label:'Urban runoff context',v:{rainIntensity:35,duration:2,wetness:72},a:{builtUpPct:75,popDensity:6500,ndviAnom:-.12,lstAnom:2.5}},
      {key:'water_check',label:'Post-event water check',v:{},a:{ndwiChange:.35}}
    ],
    heat:[
      {key:'baseline',label:'Current baseline',v:{},a:{}},
      {key:'dry_heat',label:'Dry heatwave',v:{tempDelta:6,rhDelta:-12,windPct:80},a:{lstAnom:6,t850Delta:3.5,mslpDelta:4,ventPct:25,blhPct:25,ndviAnom:-.08,ndmiAnom:-.08}},
      {key:'humid_heat',label:'Humid heat',v:{tempDelta:4,rhDelta:20,windPct:75},a:{lstAnom:4,t850Delta:2,mslpDelta:3,ventPct:35,blhPct:35}},
      {key:'urban_heat',label:'Urban heat island',v:{tempDelta:2.5,rhDelta:5,windPct:70},a:{lstAnom:7,t850Delta:2.5,mslpDelta:2,ventPct:20,blhPct:20,builtUpPct:80,popDensity:9000,ndviAnom:-.18,ndmiAnom:-.12}},
      {key:'stagnation',label:'Atmospheric stagnation',v:{tempDelta:1,rhDelta:0,windPct:55},a:{t850Delta:1.5,mslpDelta:8,ventPct:10,blhPct:10}},
      {key:'extreme_heat',label:'Extreme heat test',v:{tempDelta:8,rhDelta:5,windPct:60},a:{lstAnom:9,t850Delta:5,mslpDelta:5,ventPct:15,blhPct:15}}
    ],
    wind:[
      {key:'baseline',label:'Current baseline',v:{},a:{}},
      {key:'gust_front',label:'Gust front',v:{windAdd:15,gustAdd:45},a:{ventPct:75,blhPct:70}},
      {key:'severe_gust',label:'Severe gust',v:{windAdd:25,gustAdd:75},a:{ventPct:85,blhPct:80}},
      {key:'urban_wind',label:'Urban wind exposure',v:{windAdd:20,gustAdd:60},a:{builtUpPct:75,popDensity:8000,ventPct:60}},
      {key:'extreme_gust',label:'Extreme gust test',v:{windAdd:35,gustAdd:105},a:{ventPct:90,blhPct:85}}
    ],
    drought:[
      {key:'baseline',label:'Current baseline',v:{},a:{}},
      {key:'dry_spell',label:'Dry spell',v:{wbDelta:-12,vpdAdd:.6,rootDelta:-.03},a:{ndviAnom:-.10,ndmiAnom:-.12,lstAnom:3,t850Delta:1.5,phenology:true}},
      {key:'crop_stress',label:'Crop stress',v:{wbDelta:-25,vpdAdd:1.2,rootDelta:-.07},a:{ndviAnom:-.22,ndmiAnom:-.18,lstAnom:5.5,t850Delta:2.5,phenology:true}},
      {key:'vegetation_decline',label:'Vegetation decline',v:{wbDelta:-10,vpdAdd:.4,rootDelta:-.03},a:{ndviAnom:-.28,ndmiAnom:-.22,lstAnom:4,phenology:true}},
      {key:'severe_deficit',label:'Severe deficit test',v:{wbDelta:-40,vpdAdd:1.8,rootDelta:-.10},a:{ndviAnom:-.32,ndmiAnom:-.25,lstAnom:7,t850Delta:3.5,phenology:true}}
    ],
    multi:[
      {key:'baseline',label:'Current baseline',v:{},a:{}},
      {key:'monsoon_heat',label:'Hot wet monsoon',v:{rainIntensity:28,duration:4,wetness:82,tempDelta:4,rhDelta:15,windPct:85,windAdd:10,gustAdd:35,wbDelta:-8,vpdAdd:.4,rootDelta:-.02},a:{lstAnom:4,t850Delta:2.5,mslpDelta:2,ventPct:35,blhPct:35,ndviAnom:-.05,ndmiAnom:.03,ndwiChange:.15,builtUpPct:55,popDensity:5000}},
      {key:'hot_dry_wind',label:'Hot dry wind',v:{rainIntensity:0,duration:1,wetness:25,tempDelta:7,rhDelta:-18,windPct:120,windAdd:25,gustAdd:60,wbDelta:-28,vpdAdd:1.6,rootDelta:-.08},a:{lstAnom:7,t850Delta:4,mslpDelta:3,ventPct:70,blhPct:65,ndviAnom:-.22,ndmiAnom:-.20,popDensity:3000}},
      {key:'compound_stress',label:'Compound stress test',v:{rainIntensity:35,duration:3,wetness:90,tempDelta:5,rhDelta:10,windPct:90,windAdd:18,gustAdd:50,wbDelta:-20,vpdAdd:1.0,rootDelta:-.05},a:{lstAnom:6,t850Delta:3,mslpDelta:6,ventPct:20,blhPct:18,ndviAnom:-.18,ndmiAnom:-.15,ndwiChange:.10,builtUpPct:70,popDensity:7000}},
      {key:'urban_heat_stagnation',label:'Urban heat + stagnation',v:{tempDelta:4,rhDelta:8,windPct:55},a:{lstAnom:8,t850Delta:3.5,mslpDelta:8,ventPct:10,blhPct:10,builtUpPct:85,popDensity:9500,ndviAnom:-.20}}
    ]
  };

  function activeStation(){ try{return locationAdapter.activeStation();}catch(_){return null;} }
  function districtName(s){try{if(typeof aiStationDistrict==='function')return aiStationDistrict(s);}catch(_){}return s&&s.name?s.name:null;}
  function districtRow(name){try{return(window.DISTRICT_IN&&name)?DISTRICT_IN[name]:null;}catch(_){return null;}}
  function currentWetness(name,s){let v=num(s&&s.apiIndex),basis=s&&s.apiBasis||null;try{if(window.AGN&&AGN.wetness&&name){const w=AGN.wetness.currentWetness(name,0);if(w&&w.value!=null){v=num(w.value);basis=w.basis||basis;}}}catch(_){}return{value:v,basis:basis};}
  function baseInput(s,name){const row=districtRow(name)||{},d=row.derived||{};let c=null;try{c=riskAdapter.stationComfort(s);}catch(_){}const wet=currentWetness(name,s),om=s&&s.omFeatures||{}; const _evr=(window.DISTRICT_IN&&name&&DISTRICT_IN[name])||{};return{weatherLive:_evr.weatherLive,featureLive:_evr.featureLive,nationalLive:_evr.nationalLive,forecastLive:_evr.forecastLive,fcSource:_evr.fcSource,t:num(s&&s.t),hum:num(s&&s.hum),wind:num(s&&s.wind),gust:num(s&&s.gust),rain:num(s&&s.rain),feels:num(c&&c.feels)!=null?num(c.feels):num(s&&s.feels),aqi:num(s&&s.aqi),uv:num(s&&s.uv),soilMoist:num(row.soilMoist)!=null?num(row.soilMoist):num(s&&s.soilMoist),api:wet.value,apiBasis:wet.basis,waterBalance:num(row.waterBalance)!=null?num(row.waterBalance):num(d.waterBalance),vpd:num(s&&s.vpdLive)!=null?num(s.vpdLive):(num(row.vpd)!=null?num(row.vpd):num(d.vpd)),et0:num(s&&s.et0Live)!=null?num(s.et0Live):num(row.et0),smRoot:num(row.smRoot),derived:d,heatApparentMax:num(row.heatApparentMax),tMinWarmest:num(row.tMinWarmest),radToday:num(row.radToday),tm3:num(s&&s.tm3),t95:num(s&&s.t95),tm30:num(s&&s.tm30),tn10:num(s&&s.tn10),tn90:num(s&&s.tn90),tx90:num(s&&s.tx90),t850:num(om.t850)!=null?num(om.t850):num(row.t850),pressureMsl:num(om.pressureMsl)!=null?num(om.pressureMsl):num(row.pressureMsl),blh:num(s&&s.blhLive)};}
  function clone(o){return JSON.parse(JSON.stringify(o||{}));}
  function scoreCore(name,inp,hz){try{if(typeof hzScore==='function'&&name)return hzScore(name,inp,hz,24,name);}catch(e){if(window.__MACH_DEBUG)console.debug('[scenario score]',hz,e&&e.message);}return{score:null,top:'Engine unavailable',drivers:[0,0,0,0],metricLabels:['—','—','—','—'],notes:['','','','']};}
  function droughtScreen(inp){const terms=[],weights=[],detail=[];const wb=num(inp.waterBalance),vp=num(inp.vpd),sr=num(inp.smRoot);if(wb!=null){const t=clamp(-wb/FR('drought.wbDeficitFullScale')*100,0,100);terms.push(t);weights.push(FR('drought.wbWeight'));detail.push(['P − ET0 deficit',wb.toFixed(1)+' mm',t.toFixed(0)+'/100','4-day water-balance forcing']);}if(vp!=null&&wb==null){ const o=FR('drought.vpdOnsetKpa'),f=FR('drought.vpdFullScaleKpa');const t=clamp((vp-o)/(f-o)*100,0,100);terms.push(t);weights.push(FR('drought.vpdWeight'));detail.push(['VPD',vp.toFixed(2)+' kPa',t.toFixed(0)+'/100','atmospheric evaporative demand']);}if(sr!=null){const wp=FR('drought.smRootWiltProxy'),fc=FR('drought.smRootFieldCap');const avail=Math.max(0,Math.min(1,(sr-wp)/Math.max(1e-6,fc-wp)));const t=clamp((1-avail)*100,0,100);terms.push(t);weights.push(FR('drought.smRootWeight'));detail.push(['Root-zone moisture',sr.toFixed(3)+' m³/m³',t.toFixed(0)+'/100','FAO-inspired available-water depletion']);}if(!terms.length)return{score:null,top:'No short-window drought inputs',detail,termCount:0};let tw=0,acc=0;weights.forEach((w,i)=>{tw+=w;acc+=w*terms[i];});

var _declTw=FR('drought.wbWeight')+FR('drought.vpdWeight')+FR('drought.smRootWeight');
var _share=tw/Math.max(1e-6,_declTw);
if(_share<0.5){var _m=[];if(wb==null)_m.push('P−ET₀ water balance');if(vp==null)_m.push('VPD');if(sr==null)_m.push('root-zone soil moisture');
  return{score:null,top:'Not screened — too little of the composite',detail,termCount:terms.length,
    why:_m.join(', ')+' unavailable — '+Math.round(_share*100)+'% of the declared weight remains, below the 50% this screening requires. '
       +'No drought band is issued: a band carried on that little of the composite is a guess with a number on it.'};}
return{score:clamp(acc/Math.max(1e-6,tw),0,100),top:terms.length===3?'Water balance + VPD + root zone':'Partial water-stress screen',detail,termCount:terms.length,
    

    model:'short-window-water-stress',
    model_label:'4-day forecast water balance (P-ET0) 0.55 + VPD 0.20 + root-zone moisture 0.25',
    model_window:'4 day forecast',
    model_note:'a short-window operational screen, not the SPI-30/90 + FAO-56 composite '
              +'published as the drought hazard'};}

  function ringAreaKm2(coords){if(!Array.isArray(coords)||coords.length<3)return 0;const R=6371.0088,rad=Math.PI/180;let a=0;for(let i=0;i<coords.length;i++){const p=coords[i],q=coords[(i+1)%coords.length];if(!p||!q)continue;let dl=(Number(q[0])-Number(p[0]))*rad;if(dl>Math.PI)dl-=2*Math.PI;if(dl<-Math.PI)dl+=2*Math.PI;a+=dl*(2+Math.sin(Number(p[1])*rad)+Math.sin(Number(q[1])*rad));}return Math.abs(a)*R*R/2;}
  function geometryAreaKm2(g){if(!g||!g.type||!g.coordinates)return 0;function poly(rings){if(!Array.isArray(rings)||!rings.length)return 0;let x=ringAreaKm2(rings[0]);for(let i=1;i<rings.length;i++)x-=ringAreaKm2(rings[i]);return Math.max(0,x);}if(g.type==='Polygon')return poly(g.coordinates);if(g.type==='MultiPolygon')return g.coordinates.reduce((s,p)=>s+poly(p),0);return 0;}
  function populationDensity(name,s){try{const fc=window.PK_DISTRICTS,dp=window.PK_DISTRICT_POP,tp=window.PK_TEHSIL_POP;if(fc&&Array.isArray(fc.features)&&dp&&num(dp[name])!=null){const fs=fc.features.filter(f=>f&&f.properties&&f.properties.district===name);const area=fs.reduce((z,f)=>z+geometryAreaKm2(f.geometry),0);if(area>0)return{value:Number(dp[name])/area,source:'population grid 2020 district population / administrative polygon area'};}const tn=s&&s.name;if(fc&&Array.isArray(fc.features)&&tp&&tn&&num(tp[tn])!=null){const f=fc.features.find(x=>x&&x.properties&&(x.properties.key===tn||x.properties.tehsil===tn));const area=f?geometryAreaKm2(f.geometry):0;if(area>0)return{value:Number(tp[tn])/area,source:'population grid 2020 tehsil population / administrative polygon area'};}}catch(_){}return{value:null,source:'population density baseline unavailable'};}
  function morphologyContext(s,name){try{if(window.AGN&&AGN.lcz){if(AGN.lcz.tehsil&&s&&s.name){const t=AGN.lcz.tehsil(s.name,name);if(t&&!t.ambiguous&&t.status==='ok'&&num(t.bf)!=null)return{builtUpPct:clamp(num(t.bf)*100,0,100),source:'WUDAPT LCZ tehsil built-up fraction · morphology only, not station-validated'};}if(AGN.lcz.describe){const d=AGN.lcz.describe(Number(s&&s.lat),Number(s&&s.lon),s&&s.name,name);if(d&&num(d.builtFraction)!=null)return{builtUpPct:clamp(num(d.builtFraction)*100,0,100),source:(d.source||'WUDAPT LCZ point morphology')+' · local cell context'};}}}catch(_){}return{builtUpPct:null,source:'LCZ built-up baseline unavailable'};}
  function advancedBaseline(s,name,inp){const pop=populationDensity(name,s),m=morphologyContext(s,name);return{ndviAnom:0,ndmiAnom:0,ndwiChange:0,lstAnom:0,t850Delta:0,mslpDelta:0,ventPct:50,blhPct:50,builtUpPct:m.builtUpPct,popDensity:pop.value,phenology:true,liveT850:num(inp.t850),liveMslp:num(inp.pressureMsl),liveBlh:num(inp.blh),builtSource:m.source,popSource:pop.source};}
  function baselineSnapshot(){const s=activeStation();if(!s)return null;const name=districtName(s),inp=baseInput(s,name);
  

  var _subj=null;
  try{ var _d=(window.AGN&&AGN.subject&&AGN.subject.demand)?AGN.subject.demand('hybridlab'):null;
       if(_d&&_d.ok&&_d.subject) _subj=_d.subject.unitKey||_d.subject.unit||_d.subject.tehsil||null; }catch(_){}
  var _nm=function(x){ return String(x==null?'':x).trim().toLowerCase(); };
  return{station:s,name:name||s.name||'Selected location',inp,adv:advancedBaseline(s,name,inp),
         subjectUnit:_subj,
         subjectMismatch:!!(_subj && name && _nm(_subj)!==_nm(name))};}

  const defs={
    flood:[{id:'rainIntensity',label:'Hypothetical rain intensity',unit:'mm/h',min:0,max:100,step:1,scientific:'Feeds the existing PK-tuned rainfall-intensity curve.',base:b=>Math.max(0,num(b.inp.rain)||0)},{id:'duration',label:'Constant storm duration',unit:'h',min:1,max:6,step:1,scientific:'Defines the hypothetical 1–6 h accumulation as intensity × duration.',base:()=>1},{id:'wetness',label:'Antecedent wetness',unit:'%',min:0,max:100,step:1,scientific:'Feeds the existing antecedent-wetness amplifier/API pathway.',base:b=>Math.round((num(b.inp.api)||0)*100)}],
    heat:[{id:'tempDelta',label:'Air-temperature change',unit:'°C',min:-5,max:12,step:.5,scientific:'Changes the same dry-bulb and wet-bulb heat inputs.',base:()=>0},{id:'rhDelta',label:'Relative-humidity change',unit:'% points',min:-40,max:40,step:1,scientific:'Changes wet-bulb load and apparent temperature.',base:()=>0},{id:'windPct',label:'Wind retained from baseline',unit:'%',min:20,max:180,step:5,scientific:'Used only through the existing apparent-temperature/comfort calculation before heat scoring.',base:()=>100}],
    wind:[{id:'windAdd',label:'Sustained-wind change',unit:'km/h',min:-30,max:80,step:5,scientific:'Changes sustained wind; used as fallback if gust is unavailable.',base:()=>0},{id:'gustAdd',label:'Gust change',unit:'km/h',min:-50,max:140,step:5,scientific:'Feeds the existing gust damage-threshold curve directly.',base:()=>0}],
    drought:[{id:'wbDelta',label:'P − ET₀ change over screening window',unit:'mm',min:-60,max:30,step:1,scientific:'Changes the same water-balance deficit term used by the NIGRAAN fallback screen.',base:()=>0},{id:'vpdAdd',label:'VPD change',unit:'kPa',min:-1.5,max:3,step:.1,scientific:'Changes the same atmospheric-demand term.',base:()=>0},{id:'rootDelta',label:'Root-zone moisture change',unit:'m³/m³',min:-.15,max:.15,step:.01,scientific:'Applied only when a root-zone baseline exists; otherwise this term stays unavailable.',base:()=>0,optional:'root'}]
  };defs.multi=[...defs.flood,...defs.heat,...defs.wind,...defs.drought];

  const ADV_GROUPS={
    eo:[
      {id:'ndviAnom',label:'NDVI anomaly',unit:'',min:-.40,max:.30,step:.01,status:'scenario',role:'Vegetation-condition evidence. Does not directly modify core hazard.',base:()=>0},
      {id:'ndmiAnom',label:'NDMI anomaly',unit:'',min:-.35,max:.30,step:.01,status:'scenario',role:'Canopy-moisture evidence for drought/agriculture interpretation.',base:()=>0},
      {id:'ndwiChange',label:'Open-water NDWI change',unit:'',min:-.30,max:.60,step:.01,status:'scenario',role:'Post-event surface-water change candidate; never a flood forecast.',base:()=>0},
      {id:'lstAnom',label:'Land-surface temperature anomaly',unit:'°C',min:-3,max:12,step:.1,status:'scenario',role:'Surface thermal context; kept separate from 2 m air-temperature hazard physics.',base:()=>0}
    ],
    atmosphere:[
      {id:'t850Delta',label:'850 hPa temperature change',unit:'°C',min:-5,max:10,step:.1,status:'context',role:'Warm-air-mass persistence context; scenario delta applied to the modelled 850 hPa baseline when available.',base:()=>0},
      {id:'mslpDelta',label:'MSLP change',unit:'hPa',min:-10,max:15,step:.5,status:'context',role:'Synoptic-pressure context only; not a pollution or hazard score.',base:()=>0},
      {id:'ventPct',label:'Ventilation percentile assumption',unit:'th',min:0,max:100,step:1,status:'context',role:'Scenario percentile assumption. A climatological percentile service is not connected in this HTML.',base:()=>50},
      {id:'blhPct',label:'Boundary-layer-height percentile assumption',unit:'th',min:0,max:100,step:1,status:'context',role:'Scenario percentile assumption. Live BLH metres are shown separately when available.',base:()=>50}
    ],
    exposure:[
      {id:'builtUpPct',label:'Built-up fraction',unit:'%',min:0,max:100,step:1,status:'exposure',role:'LCZ morphology / urban exposure context. Does not make meteorological hazard larger by itself.',base:b=>num(b.adv.builtUpPct)!=null?num(b.adv.builtUpPct):0,optional:'built'},
      {id:'popDensity',label:'Population density',unit:'people/km²',min:0,max:15000,step:100,status:'exposure',role:'Resident exposure context from population / polygon area when available; never a physical hazard driver.',base:b=>num(b.adv.popDensity)!=null?Math.min(15000,num(b.adv.popDensity)):0,optional:'pop'},
      {id:'phenology',label:'Valid crop phenology window',type:'checkbox',status:'scenario',role:'Gates agricultural interpretation of NDVI/NDMI only; it does not alter meteorological drought physics.',base:()=>true}
    ]
  };
  const ADV_DEFS=[...ADV_GROUPS.eo,...ADV_GROUPS.atmosphere,...ADV_GROUPS.exposure];

  function baseControlValue(def,b){return def.type==='checkbox'?!!def.base(b):Number(def.base(b));}
  function currentValue(def,b){if(Object.prototype.hasOwnProperty.call(state.values,def.id))return Number(state.values[def.id]);return baseControlValue(def,b);}
  function advancedBaseValue(def,b){return baseControlValue(def,b);}
  function advancedValue(def,b){if(Object.prototype.hasOwnProperty.call(state.advanced,def.id))return def.type==='checkbox'?!!state.advanced[def.id]:Number(state.advanced[def.id]);return advancedBaseValue(def,b);}
  function setDefaultsForHazard(h,b){state.values={};(defs[h]||[]).forEach(d=>state.values[d.id]=baseControlValue(d,b));state.advanced={};ADV_DEFS.forEach(d=>state.advanced[d.id]=advancedBaseValue(d,b));state.preset='baseline';}

  function renderControls(b){const host=$('cfeDynamicControls');if(!host)return;const list=defs[state.hazard]||[];host.innerHTML=list.map(d=>{const disabled=d.optional==='root'&&num(b.inp.smRoot)==null,v=currentValue(d,b),dec=d.step<1?(d.step<.1?2:1):0;return`<div class="scenario-control ${disabled?'disabled':''}" data-control="${d.id}"><div class="scenario-control-top"><div><b>${d.label}</b><small>${d.scientific}</small></div><output id="out-${d.id}">${Number(v).toFixed(dec)} ${d.unit}</output></div><input type="range" id="ctl-${d.id}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" ${disabled?'disabled':''} aria-label="${d.label}">${disabled?'<em>Root-zone baseline unavailable; term is omitted and the existing drought weights renormalise.</em>':''}</div>`;}).join('');list.forEach(d=>{const e=$('ctl-'+d.id);if(e)e.addEventListener('input',()=>{state.values[d.id]=Number(e.value);state.preset='custom';markPreset();updateControlOutputs();renderResults();});});updateControlOutputs();renderAdvancedControls(b);}
  function updateControlOutputs(){const b=state.baseline;if(!b)return;(defs[state.hazard]||[]).forEach(d=>{const o=$('out-'+d.id);if(!o)return;const v=currentValue(d,b),dec=d.step<1?(d.step<.1?2:1):0;o.textContent=Number(v).toFixed(dec)+' '+d.unit;});}
  function advancedUnavailable(def,b){return(def.optional==='built'&&num(b.adv.builtUpPct)==null)||(def.optional==='pop'&&num(b.adv.popDensity)==null);}
  function renderAdvancedGroup(group,hostId,b){const host=$(hostId);if(!host)return;host.innerHTML=ADV_GROUPS[group].map(d=>{const unavailable=advancedUnavailable(d,b),v=advancedValue(d,b);if(d.type==='checkbox')return`<div class="scenario-check-control status-${d.status}"><div><label><input id="adv-${d.id}" type="checkbox" ${v?'checked':''}>${d.label}</label><small>${d.role}</small><i class="scenario-status-chip">scenario assumption</i></div></div>`;const dec=d.step<1?(d.step<.1?2:1):0,display=unavailable&&Number(v)===0?'—':Number(v).toFixed(dec)+' '+d.unit;return`<div class="scenario-control status-${d.status}" data-advanced="${d.id}"><div class="scenario-control-top"><div><b>${d.label}</b><small>${d.role}</small><i class="scenario-status-chip">${d.status==='scenario'?'scenario-only':d.status==='context'?'context / experimental':'exposure only'}</i></div><output id="advout-${d.id}">${display}</output></div><input type="range" id="adv-${d.id}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" aria-label="${d.label}">${unavailable?'<em>Observed baseline unavailable. Zero means no declared scenario value; presets or the user may still define an explicit scenario assumption.</em>':''}</div>`;}).join('');ADV_GROUPS[group].forEach(d=>{const e=$('adv-'+d.id);if(!e)return;e.addEventListener(d.type==='checkbox'?'change':'input',()=>{state.advanced[d.id]=d.type==='checkbox'?!!e.checked:Number(e.value);state.preset='custom';markPreset(); try{const o=$('advout-'+d.id);if(o&&d.type!=='checkbox'){const dec=d.step<1?(d.step<.1?2:1):0;o.textContent=Number(e.value).toFixed(dec)+' '+d.unit;}}catch(_){}renderResults();});});}
  function renderAdvancedControls(b){renderAdvancedGroup('eo','cfeEOControls',b);renderAdvancedGroup('atmosphere','cfeAtmosControls',b);renderAdvancedGroup('exposure','cfeExposureControls',b);}

  function renderPresets(b){const host=$('cfeScenarioButtons');if(!host)return;host.innerHTML='';(PRESETS[state.hazard]||[]).forEach(p=>{const bt=document.createElement('button');bt.type='button';bt.dataset.preset=p.key;bt.textContent=p.label;bt.addEventListener('click',()=>applyPreset(p,b));host.appendChild(bt);});markPreset();}
  function markPreset(){document.querySelectorAll('#cfeScenarioButtons button').forEach(x=>{const on=x.dataset.preset===state.preset;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on?'true':'false');});}
  function applyPreset(p,b){setDefaultsForHazard(state.hazard,b);Object.entries(p.v||{}).forEach(([k,v])=>state.values[k]=v);Object.entries(p.a||{}).forEach(([k,v])=>state.advanced[k]=v);state.preset=p.key;renderControls(b);markPreset();renderResults();}

  function evaluateFlood(b,values){const inp=clone(b.inp),rain=Math.max(0,Number(values.rainIntensity)),dur=Math.max(1,Math.min(6,Number(values.duration)||1));inp.rain=rain;inp.api=clamp(Number(values.wetness),0,100)/100;inp.rain6hDay=rain*dur;inp.dayIndex=0;const r=scoreCore(b.name,inp,'flood');return{score:num(r.score),raw:r,drivers:[['Rain intensity',fmt(b.inp.rain,1,' mm/h'),fmt(rain,1,' mm/h'),'PK-tuned intensity curve'],['Storm accumulation','current observed window',fmt(rain*dur,1,' mm'),'scenario assumes constant intensity × duration'],['Antecedent wetness',fmt((num(b.inp.api)||0)*100,0,'%'),fmt(values.wetness,0,'%'),'existing API/wetness amplifier'],['River state',r.flood&&r.flood.riverine!=null?String(r.flood.riverine)+'/100':'unchanged / unavailable',r.flood&&r.flood.riverine!=null?String(r.flood.riverine)+'/100':'unchanged / unavailable','held at current baseline; not scenario-generated']]};}
  function evaluateHeat(b,values){if(num(b.inp.t)==null||num(b.inp.hum)==null) return{score:null,raw:null,unavailable:true,why:'temperature or humidity missing: no heat sensitivity is computed',drivers:[]};const inp=clone(b.inp),s=Object.assign({},b.station);s.t=(num(b.inp.t)||0)+Number(values.tempDelta||0);s.hum=clamp((num(b.inp.hum)||50)+Number(values.rhDelta||0),1,100);s.wind=Math.max(0,(num(b.inp.wind)||0)*Number(values.windPct||100)/100);let c=null;try{c=riskAdapter.stationComfort(s);}catch(_){}inp.t=s.t;inp.hum=s.hum;inp.wind=s.wind;inp.feels=num(c&&c.feels)!=null?num(c.feels):s.t;inp.heatDryTemp=s.t;inp.heatWetBulbTemp=s.t;inp.heatMeanRh=s.hum;inp.heatApparentMax=inp.feels;const r=scoreCore(b.name,inp,'heat');return{score:num(r.score),raw:r,drivers:[['Air temperature',fmt(b.inp.t,1,'°C'),fmt(inp.t,1,'°C'),'dry-heat + wet-bulb inputs'],['Relative humidity',fmt(b.inp.hum,0,'%'),fmt(inp.hum,0,'%'),'wet-bulb load'],['Wind',fmt(b.inp.wind,0,' km/h'),fmt(inp.wind,0,' km/h'),'apparent-temperature calculation'],['Apparent temperature',fmt(b.inp.feels,1,'°C'),fmt(inp.feels,1,'°C'),'existing comfort physics before heat score']]};}
  function evaluateWind(b,values){if(num(b.inp.gust)==null&&num(b.inp.wind)==null) return{score:null,raw:null,unavailable:true,why:'no wind or gust for this place: no wind sensitivity is computed',drivers:[]};const inp=clone(b.inp);inp.wind=Math.max(0,(num(b.inp.wind)||0)+Number(values.windAdd||0));const bg=num(b.inp.gust)!=null?num(b.inp.gust):(num(b.inp.wind)||0)*FR('wind.gustFromWindK');inp.gust=Math.max(0,bg+Number(values.gustAdd||0));const r=scoreCore(b.name,inp,'wind');return{score:num(r.score),raw:r,drivers:[['Sustained wind',fmt(b.inp.wind,0,' km/h'),fmt(inp.wind,0,' km/h'),'fallback support'],['Gust',fmt(bg,0,' km/h'),fmt(inp.gust,0,' km/h'),'damage-threshold driver'],['Terrain',r.terr&&r.terr.tri!=null?'TRI '+fmt(r.terr.tri,0):'—',r.terr&&r.terr.tri!=null?'TRI '+fmt(r.terr.tri,0):'—','held constant'],['Exposure factor','baseline',r.raw&&r.raw.exposure?fmt(r.raw.exposure,2):'engine derived','terrain-derived; not user-adjusted']]};}
  function evaluateDrought(b,values){
  

  const _haveWB=num(b.inp.waterBalance)!=null, _haveVPD=num(b.inp.vpd)!=null, _haveRoot=num(b.inp.smRoot)!=null;
  if(!_haveWB && !_haveVPD && !_haveRoot){
    return {score:null, unavailable:true,
      reason:'Core drought scenario unavailable — baseline P\u2212ET\u2080, VPD and root-zone '
            +'moisture are all missing for this unit. Advanced NDVI/NDMI diagnostics remain available.',
      raw:{score:null}, drivers:[]};
  }
  const inp=clone(b.inp);inp.waterBalance=num(b.inp.waterBalance)!=null?num(b.inp.waterBalance)+Number(values.wbDelta||0):null;inp.vpd=num(b.inp.vpd)!=null?Math.max(0,num(b.inp.vpd)+Number(values.vpdAdd||0)):null;inp.smRoot=num(b.inp.smRoot)!=null?clamp(num(b.inp.smRoot)+Number(values.rootDelta||0),0,1):null;const r=droughtScreen(inp),base=droughtScreen(b.inp);const rows=[];[['P − ET0',b.inp.waterBalance,inp.waterBalance,'mm'],['VPD',b.inp.vpd,inp.vpd,'kPa'],['Root-zone moisture',b.inp.smRoot,inp.smRoot,'m³/m³']].forEach(z=>rows.push([z[0],fmt(z[1],z[3]==='m³/m³'?3:z[3]==='kPa'?2:1,' '+z[3]),fmt(z[2],z[3]==='m³/m³'?3:z[3]==='kPa'?2:1,' '+z[3]),z[0]==='P − ET0'?'water-balance forcing':z[0]==='VPD'?'atmospheric demand':'available-water depletion']));return{score:num(r.score),raw:r,baseScore:num(base.score),drivers:rows};}
  function evaluator(h,b,v){return h==='flood'?evaluateFlood(b,v):h==='heat'?evaluateHeat(b,v):h==='wind'?evaluateWind(b,v):h==='drought'?evaluateDrought(b,v):null;}
  function baselineValuesFor(h,b){const o={};(defs[h]||[]).forEach(d=>o[d.id]=baseControlValue(d,b));return o;}
  

function baselineEvaluator(h,b){
  if(h==='drought') return {score:droughtScreen(b.inp).score, raw:droughtScreen(b.inp), baselineExact:true};
  const r=scoreCore(b.name, b.inp, h);
  return {score:num(r.score), raw:r, baselineExact:true};
}
  function resultCard(label,base,scen,note){const d=num(base)!=null&&num(scen)!=null?Number(scen)-Number(base):null,cls=d==null?'zero':d>0.49?'up':d<-.49?'down':'zero';return`<article class="scenario-score-card"><span>${label}</span><div class="scenario-score-pair"><b>${num(base)==null?'—':Math.round(base)}</b><i>→</i><b>${num(scen)==null?'—':Math.round(scen)}</b></div><div class="scenario-score-delta ${cls}">${d==null?'Δ —':'Δ '+(d>=0?'+':'')+d.toFixed(1)}</div><small>${note||'0–100 screening, not probability'}</small></article>`;}
  function renderSingle(b){const h=state.hazard,bv=baselineValuesFor(h,b),sv=Object.assign({},bv,state.values),base=baselineEvaluator(h,b),scen=evaluator(h,b,sv);$('cfeCompareGrid').innerHTML=resultCard('Baseline '+HAZARDS[h].label,base.score,scen.score,h==='drought'?'Short-window screen; not SPI':'0–100 screening; not probability');$('cfePathway').innerHTML=`<div><b>${HAZARDS[h].label} pathway</b><span>${scen&&scen.raw&&scen.raw.top?scen.raw.top:(scen&&scen.raw&&scen.raw.topDriver)||'Existing NIGRAAN equation'}</span></div>`;$('cfeDriverRows').innerHTML=(scen.drivers||[]).map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('');const same=num(base.score)!=null&&num(scen.score)!=null&&Math.round(base.score)===Math.round(scen.score);$('cfeExplain').innerHTML=same?'<b>No core-score change.</b> Core controls did run. The altered inputs either remain below the next response threshold or a held-constant pathway still governs. Advanced diagnostics below may still change because they are deliberately kept separate from the core score.':'<b>Core scenario response changed.</b> The delta comes from re-running the declared NIGRAAN pathway on cloned inputs. It is sensitivity, not forecast.';state.last={hazard:h,baseline:base,scenario:scen,values:sv,advanced:Object.assign({},state.advanced)};}
  function renderMulti(b){const hs=['flood','heat','wind','drought'];let cards='',rows=[];hs.forEach(h=>{const bv=baselineValuesFor(h,b),sv=Object.assign({},bv,state.values),ba=baselineEvaluator(h,b),sc=evaluator(h,b,sv);cards+=resultCard(HAZARDS[h].label,ba.score,sc.score,'No cross-hazard aggregation.');(sc.drivers||[]).slice(0,2).forEach(r=>rows.push([HAZARDS[h].label+' · '+r[0],r[1],r[2],r[3]]));});$('cfeCompareGrid').innerHTML=cards;$('cfePathway').innerHTML='<div><b>Compound handling</b><span>Parallel hazards only. No synthetic compound score or event probability is generated.</span></div>';$('cfeDriverRows').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('');$('cfeExplain').innerHTML='<b>Multi-driver mode preserves unlike quantities.</b> Flood, heat, wind and drought screening remain separate, with advanced diagnostics shown independently below.';state.last={hazard:'multi',values:Object.assign({},state.values),advanced:Object.assign({},state.advanced)};}

  function advFmt(id,v,b){if(id==='phenology')return v?'Valid window':'Outside / unspecified';if(id==='builtUpPct')return num(b.adv.builtUpPct)==null&&Number(v)===0?'—':fmt(v,0,'%');if(id==='popDensity')return num(b.adv.popDensity)==null&&Number(v)===0?'—':Math.round(v).toLocaleString()+' /km²';if(id==='ventPct'||id==='blhPct')return Math.round(v)+'th percentile assumption';if(id==='t850Delta'||id==='lstAnom')return (v>=0?'+':'')+Number(v).toFixed(1)+'°C';if(id==='mslpDelta')return (v>=0?'+':'')+Number(v).toFixed(1)+' hPa';return (v>=0?'+':'')+Number(v).toFixed(2);}
  function advBaselineDisplay(d,b){if(d.id==='t850Delta')return num(b.adv.liveT850)!=null?fmt(b.adv.liveT850,1,'°C'):'—';if(d.id==='mslpDelta')return num(b.adv.liveMslp)!=null?fmt(b.adv.liveMslp,0,' hPa'):'—';if(d.id==='blhPct')return num(b.adv.liveBlh)!=null?fmt(b.adv.liveBlh,0,' m live'):'—';if(d.id==='ventPct')return 'climatology not connected';if(d.id==='builtUpPct')return num(b.adv.builtUpPct)!=null?fmt(b.adv.builtUpPct,0,'%'):'—';if(d.id==='popDensity')return num(b.adv.popDensity)!=null?Math.round(b.adv.popDensity).toLocaleString()+' /km²':'—';if(d.id==='phenology')return 'scenario assumption';return '0.00 anomaly';}
  function advScenarioDisplay(d,v,b){if(d.id==='t850Delta'&&num(b.adv.liveT850)!=null)return fmt(b.adv.liveT850+Number(v),1,'°C')+' ('+(v>=0?'+':'')+Number(v).toFixed(1)+')';if(d.id==='mslpDelta'&&num(b.adv.liveMslp)!=null)return fmt(b.adv.liveMslp+Number(v),0,' hPa')+' ('+(v>=0?'+':'')+Number(v).toFixed(1)+')';return advFmt(d.id,v,b);}
  function advancedDiagnostics(b){const a=state.advanced,phen=!!a.phenology,ndvi=Number(a.ndviAnom||0),ndmi=Number(a.ndmiAnom||0),lst=Number(a.lstAnom||0),t850=Number(a.t850Delta||0),mslp=Number(a.mslpDelta||0),vent=Number(a.ventPct==null?50:a.ventPct),blh=Number(a.blhPct==null?50:a.blhPct),ndwi=Number(a.ndwiChange||0),built=Number(a.builtUpPct||0),pop=Number(a.popDensity||0);let veg='Limited departure',vegNote='NDVI/NDMI are scenario anomalies, not live EO observations.';if(!phen){veg='Phenology gate off';vegNote='Crop interpretation is withheld outside the declared phenology window.';}else if(ndvi<=-.20||ndmi<=-.15){veg='Strong negative signal';}else if(ndvi<=-.10||ndmi<=-.08){veg='Moderate negative signal';}else if(ndvi>=.10&&ndmi>=.08){veg='Positive vegetation/moisture signal';}let thermal='Limited thermal departure';if(lst>=6||t850>=3.5)thermal='Strong warm persistence context';else if(lst>=3||t850>=2)thermal='Elevated warm persistence context';else if(lst<=-1||t850<=-1)thermal='Cooler surface / air-mass context';let n=(mslp>=5?1:0)+(vent<=25?1:0)+(blh<=25?1:0),stag=n===3?'Strong stagnation setup':n===2?'Elevated stagnation setup':'Limited stagnation setup';let water=ndwi>=.20?'Strong water-change candidate':ndwi>=.05?'Water-change candidate':ndwi<=-.05?'Lower open-water signal':'No material NDWI change';let urban='Exposure context';if((num(b.adv.builtUpPct)!=null&&built>b.adv.builtUpPct+15)||(num(b.adv.popDensity)!=null&&pop>b.adv.popDensity*1.5))urban='Higher urban/exposure scenario';return[{title:'Vegetation / canopy moisture',state:veg,note:vegNote,raw:`NDVI ${ndvi>=0?'+':''}${ndvi.toFixed(2)} · NDMI ${ndmi>=0?'+':''}${ndmi.toFixed(2)}`,warn:veg!=='Limited departure'&&veg!=='Positive vegetation/moisture signal'},{title:'Surface & warm-air context',state:thermal,note:'LST and T850 are context diagnostics; they do not silently replace 2 m air temperature.',raw:`LST ${lst>=0?'+':''}${lst.toFixed(1)}°C · T850 ${t850>=0?'+':''}${t850.toFixed(1)}°C`,warn:thermal.indexOf('Strong')===0},{title:'Atmospheric stagnation',state:stag,note:'Directional heuristic from pressure + ventilation + BLH assumptions. Not AQI and not emissions modelling.',raw:`MSLP ${mslp>=0?'+':''}${mslp.toFixed(1)} hPa · vent ${Math.round(vent)}th · BLH ${Math.round(blh)}th`,warn:n>=2},{title:'Open-water change',state:water,note:'NDWI is confirmation context only. Cloud mask, pre-event baseline and preferably SAR are required for inundation evidence.',raw:`NDWI Δ ${ndwi>=0?'+':''}${ndwi.toFixed(2)}`,warn:ndwi>=.05},{title:'Urban form & exposure',state:urban,note:'Built-up and population affect exposure/context. They do not increase meteorological hazard by themselves.',raw:`Built ${Math.round(built)}% · ${Math.round(pop).toLocaleString()} /km²`,warn:false}];}
  function renderAdvancedResults(b){const diags=advancedDiagnostics(b);$('cfeAdvancedGrid').innerHTML=diags.map(d=>`<article class="advanced-diagnostic ${d.warn?'warn':''}"><span>${d.title}</span><b>${d.state}</b><small>${d.raw}</small><i class="diag-state">${d.warn?'attention':'context'}</i><small>${d.note}</small></article>`).join('');$('cfeAdvancedRows').innerHTML=ADV_DEFS.map(d=>{const v=advancedValue(d,b),src=d.status==='scenario'?'Scenario-only / no live EO service':d.status==='context'?(d.id==='t850Delta'||d.id==='mslpDelta'||d.id==='blhPct'?'Live baseline where available + scenario assumption':'Scenario percentile assumption'):(d.id==='builtUpPct'?b.adv.builtSource:b.adv.popSource);return`<tr><td>${d.label}</td><td>${advBaselineDisplay(d,b)}</td><td>${advScenarioDisplay(d,v,b)}</td><td>${d.role}<br><small>${src}</small></td></tr>`;}).join('');}

  function renderResults(){const b=state.baseline;if(!b)return;const meta=HAZARDS[state.hazard];$('cfeBoundaryText').textContent=meta.boundary;$('cfeMaturity').textContent=meta.maturity;$('cfeValidationState').textContent=meta.validation;$('cfeResultSubtitle').textContent=state.hazard==='multi'?'Parallel core pathways; no aggregate score.':'Same '+meta.label.toLowerCase()+' core pathway, cloned scenario inputs.';$('cfeAssumptionBox').innerHTML='<b>Assumption boundary.</b> '+meta.boundary;$('cfeSweepResult').innerHTML='<span>Scenario changed. Run the sensitivity sweep to recompute the selected envelopes.</span>';if(state.hazard==='multi')renderMulti(b);else renderSingle(b);renderAdvancedResults(b);renderSweepVariables(b);}
  function sync(){const b=baselineSnapshot();if(!b)return; try{ if(window.AGN&&AGN.subject&&AGN.subject.demand) AGN.subject.demand('hybridlab'); }catch(_){}state.baseline=b;$('cfePlace').textContent=b.name;$('cfeBmLocation').textContent=b.name; try{var _pl=$('cfePlace');if(_pl){var _n=document.getElementById('cfeSubjectNote');if(!_n){_n=document.createElement('div');_n.id='cfeSubjectNote';_n.style.cssText='font-size:0.75rem;line-height:1.4;font-weight:650;margin-top:4px';_pl.parentNode.insertBefore(_n,_pl.nextSibling);}if(b.subjectMismatch){_n.style.color='#b3261e';_n.textContent='This baseline is '+b.name+', not the decision subject ('+b.subjectUnit+'). Everything below is a sensitivity study of '+b.name+' and is not an answer about '+b.subjectUnit+'.';}else if(b.subjectUnit){_n.style.color='#35682B';_n.textContent='Baseline follows the decision subject ('+b.subjectUnit+').';}else{_n.style.color='#5d6b76';_n.textContent='No decision subject is set, so this baseline is the location picker. Exploratory only — it is not bound to any asset or case.';}}}catch(_){}$('cfeBmTemp').textContent=fmt(b.inp.t,1,'°C');$('cfeBmHum').textContent=fmt(b.inp.hum,0,'%');$('cfeBmRain').textContent=fmt(b.inp.rain,1,' mm/h');$('cfeBmGust').textContent=fmt(b.inp.gust,0,' km/h');$('cfeBmWet').textContent=num(b.inp.api)!=null?fmt(b.inp.api*100,0,'%'):'—';$('cfeBmWB').textContent=fmt(b.inp.waterBalance,1,' mm');$('cfeBmVpd').textContent=fmt(b.inp.vpd,2,' kPa');$('cfeBmT850').textContent=fmt(b.adv.liveT850,1,'°C');$('cfeBmMslp').textContent=fmt(b.adv.liveMslp,0,' hPa');$('cfeBmBlh').textContent=fmt(b.adv.liveBlh,0,' m');$('cfeBmBuilt').textContent=num(b.adv.builtUpPct)!=null?fmt(b.adv.builtUpPct,0,'%'):'—';$('cfeBmPopDensity').textContent=num(b.adv.popDensity)!=null?Math.round(b.adv.popDensity).toLocaleString()+'/km²':'—';
  

  if(!state.preset || state.preset==='baseline'){
    setDefaultsForHazard(state.hazard,b);
  } else {
    (defs[state.hazard]||[]).forEach(function(dfn){
      if(state.values[dfn.id]===undefined) state.values[dfn.id]=baseControlValue(dfn,b);
    });
    ADV_DEFS.forEach(function(dfn){
      if(state.advanced[dfn.id]===undefined) state.advanced[dfn.id]=advancedBaseValue(dfn,b);
    });
  }
  renderPresets(b);renderControls(b);renderResults();}
  function setHazard(h){if(!HAZARDS[h])return;state.hazard=h;document.querySelectorAll('#cfeHazardTabs button').forEach(bt=>{const on=bt.dataset.scenarioHazard===h;bt.classList.toggle('active',on);bt.setAttribute('aria-selected',on?'true':'false');});if(state.baseline){setDefaultsForHazard(h,state.baseline);renderPresets(state.baseline);renderControls(state.baseline);renderResults();}}

  function seedFrom(obj){const t=JSON.stringify(obj);let h=2166136261>>>0;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function quantile(a,q){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),p=(s.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(p-lo);}
  function renderSweepVariables(b){const host=$('cfeSweepVariables');if(!host)return;const core=defs[state.hazard]||[],adv=ADV_DEFS.filter(d=>d.type!=='checkbox');let html='';core.forEach(d=>{const base=baseControlValue(d,b),tar=currentValue(d,b),changed=Math.abs(Number(tar)-Number(base))>1e-9;html+=`<label><input type="checkbox" data-sweep-core="${d.id}" ${changed?'checked':''}>${d.label}</label>`;});adv.forEach(d=>{const base=advancedBaseValue(d,b),tar=advancedValue(d,b),changed=Math.abs(Number(tar)-Number(base))>1e-9;html+=`<label class="advanced"><input type="checkbox" data-sweep-advanced="${d.id}" ${changed?'checked':''}>${d.label}</label>`;});host.innerHTML=html;}
  function selectedSet(attr){return new Set(Array.from(document.querySelectorAll(`#cfeSweepVariables input[${attr}]:checked`)).map(e=>e.getAttribute(attr)));}
  

  

  var EMP_MAP={
    tempDelta:   {key:'t',    centre:true },
    rhDelta:     {key:'rh',   centre:true },
    rainIntensity:{key:'rain',centre:false},
    dischargeDelta:{key:'q',  centre:true }
  };
  function empiricalFor(varId, unitName){
    try{
      if(!(window.AGN && AGN.evidence && unitName)) return null;
      var spec=EMP_MAP[varId]; if(!spec) return null;
      var d=AGN.evidence.distribution(spec.key+':'+unitName);
      if(!(d && d.members && d.members.length>=3)) return null;
      var m=d.members.slice();
      if(!spec.centre) return m;
      var srt=m.slice().sort(function(a,b){return a-b;});
      var med=srt[Math.floor(srt.length/2)];
      return m.map(function(x){ return x-med; });
    }catch(_){ return null; }
  }
  function sweepFor(h,b,n,rand,selected){const defsH=defs[h]||[],bv=baselineValuesFor(h,b),target=Object.assign({},bv,state.values),scores=[];
    var _unit=(b&&(b.name||b.key))||null, _emp={}, _empUsed={};
    defsH.forEach(function(d){ var m=empiricalFor(d.id,_unit); if(m) _emp[d.id]=m; });
    for(let i=0;i<n;i++){const v={};defsH.forEach(d=>{const a=Number(bv[d.id]),z=Number(target[d.id]);
      if(selected.has(d.id) && _emp[d.id]){
        var mm=_emp[d.id]; v[d.id]=mm[Math.min(mm.length-1, Math.floor(rand()*mm.length))]; _empUsed[d.id]=mm.length;
      } else {
        v[d.id]=selected.has(d.id)?a+(z-a)*rand():z;
      }});
    window.__mcEmpirical=_empUsed;
    window.__mcSampling={empirical:Object.keys(_empUsed), uniform:defsH
      .filter(function(d){return selected.has(d.id) && !_emp[d.id];}).map(function(d){return d.id;})};const r=evaluator(h,b,v);if(r&&num(r.score)!=null)scores.push(Number(r.score));}return{n:scores.length,p10:quantile(scores,.1),p50:quantile(scores,.5),p90:quantile(scores,.9),min:scores.length?Math.min(...scores):null,max:scores.length?Math.max(...scores):null};}
  function advancedSweep(b,n,rand,selected){const rows=[];ADV_DEFS.filter(d=>d.type!=='checkbox'&&selected.has(d.id)).forEach(d=>{const a=Number(advancedBaseValue(d,b)),z=Number(advancedValue(d,b)),vals=[];for(let i=0;i<n;i++)vals.push(a+(z-a)*rand());rows.push({d,p10:quantile(vals,.1),p50:quantile(vals,.5),p90:quantile(vals,.9)});});return rows;}
  

  try{ window.__mcSweepProbe=function(h,unitName,ids){
    var b={name:unitName}, sel=new Set(ids||[]);
    try{ sweepFor(h,b,8,function(){return 0.5;},sel); }catch(_){}
    return window.__mcSampling||null;
  }; }catch(_){}

  function runSweep(){const b=state.baseline;if(!b)return;const n=Math.max(100,Math.min(1000,Number($('cfeSweepN').value)||500)),rand=rng(seedFrom({h:state.hazard,v:state.values,a:state.advanced,n,b:b.name,ver:'89.11'})),selCore=selectedSet('data-sweep-core'),selAdv=selectedSet('data-sweep-advanced');

  let coreResult=null;
  let coreHtml='';if(state.hazard==='multi'){const rows=['flood','heat','wind','drought'].map(h=>[HAZARDS[h].label,sweepFor(h,b,n,rand,selCore)]);
    coreResult={mode:'multi',pathways:rows.map(function(pair,ix){
      var key=['flood','heat','wind','drought'][ix], rr=pair[1];
      return {hazard:key,label:pair[0],p10:rr.p10,p50:rr.p50,p90:rr.p90,
              min:rr.min,max:rr.max,runs:rr.n};})};coreHtml='<table><thead><tr><th>Pathway</th><th>P10</th><th>Median</th><th>P90</th><th>Runs</th></tr></thead><tbody>'+rows.map(([h,r])=>`<tr><td>${h}</td><td>${r.p10==null?'—':r.p10.toFixed(0)}</td><td>${r.p50==null?'—':r.p50.toFixed(0)}</td><td>${r.p90==null?'—':r.p90.toFixed(0)}</td><td>${r.n}</td></tr>`).join('')+'</tbody></table>';}else{const r=sweepFor(state.hazard,b,n,rand,selCore);
    coreResult={mode:'single',hazard:state.hazard,p10:r.p10,p50:r.p50,p90:r.p90,
                min:r.min,max:r.max,runs:r.n};coreHtml=r.n?`<div class="sweep-kpis"><span><small>P10 core score</small><b>${r.p10.toFixed(0)}</b></span><span><small>Median</small><b>${r.p50.toFixed(0)}</b></span><span><small>P90</small><b>${r.p90.toFixed(0)}</b></span><span><small>Range</small><b>${r.min.toFixed(0)}–${r.max.toFixed(0)}</b></span></div>`:'<span>Insufficient core inputs for this sweep.</span>';}const ar=advancedSweep(b,n,rand,selAdv),advHtml=ar.length?'<table class="sweep-advanced-table"><thead><tr><th>Advanced variable</th><th>P10</th><th>Median</th><th>P90</th></tr></thead><tbody>'+ar.map(x=>`<tr><td>${x.d.label}</td><td>${advFmt(x.d.id,x.p10,b)}</td><td>${advFmt(x.d.id,x.p50,b)}</td><td>${advFmt(x.d.id,x.p90,b)}</td></tr>`).join('')+'</tbody></table>':'';

  

  var scenarioResult={
    scenario_id:'AGN-SCN-'+Date.now().toString(36),
    hazard:state.hazard, preset:state.preset, samples:n,
    unit:(b&&b.name)||null,
    core_score:coreResult,
    advanced_parameters:(ar&&ar.map)?ar.map(function(x){
      return {id:x.d&&x.d.id,label:x.d&&x.d.label,p10:x.p10,p50:x.p50,p90:x.p90};}):null,
    probability_boundary:'uniform sensitivity envelope over the declared scenario '
      +'boundary; percentiles are not event probability'
  };
  window.AGN_SCENARIO_LAST=scenarioResult;
  

  try{
    if(AGN.scenario && AGN.scenario.setActive) AGN.scenario.setActive(scenarioResult.scenario_id);
  }catch(_){ }
  document.dispatchEvent(new CustomEvent('agn:scenario-sweep',{detail:scenarioResult}));
  $('cfeSweepResult').innerHTML=coreHtml+advHtml+`<p>${n} reproducible uniform samples. Checked core variables affect only their existing scientific pathway; advanced-variable envelopes remain separate diagnostics. These percentiles are <b>not event probability</b>.</p>`;}

  function init(){if(!$('cfeSection'))return;document.querySelectorAll('#cfeHazardTabs button').forEach(b=>b.addEventListener('click',()=>setHazard(b.dataset.scenarioHazard)));$('cfeSync').addEventListener('click',sync);$('cfeRunSweep').addEventListener('click',runSweep);document.addEventListener('agn:location',()=>setTimeout(sync,80));sync();}
  window.AGN=window.AGN||{};
  if(AGN.implementations)AGN.implementations.define('hybridLab',{sync,render:renderResults,setScenario:function(k){const b=state.baseline;if(!b)return;const p=(PRESETS[state.hazard]||[]).find(x=>x.key===k);if(p)applyPreset(p,b);},getState:function(){return{hazard:state.hazard,preset:state.preset,values:Object.assign({},state.values),advanced:Object.assign({},state.advanced),baseline:state.baseline?{name:state.baseline.name,inp:Object.assign({},state.baseline.inp),adv:Object.assign({},state.baseline.adv)}:null,last:state.last};}},{source:'modules/scenario-lab/v89.11.js',owner:'hybridlab',moduleType:'advanced-scientific-sandbox',dependencies:['adapter:locationLegacy','adapter:riskLegacy','hazard:hzScore','formula:FORMULA_REGISTRY','dataset:WUDAPT-LCZ','dataset:population grid'],globalDependencies:['hzScore','FR'],compatibilityGlobals:[]});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
