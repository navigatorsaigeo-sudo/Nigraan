(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const records = new Map();

  function now(){ return Date.now(); }
  function list(value){ return Array.isArray(value) ? Array.from(new Set(value.map(String))) : []; }
  function getPath(path){
    return String(path).split('.').reduce(function(value,key){return value == null ? undefined : value[key];},global);
  }
  function normalizeMethods(methods){
    const out={};Object.keys(methods||{}).forEach(function(key){if(typeof methods[key]==='function')out[key]=methods[key];});return out;
  }
  function define(name,methods,options){
    options=options||{};
    if(!name||typeof name!=='string')throw new TypeError('Adapter name is required');
    if(records.has(name)&&options.replace!==true)throw new Error('Adapter already defined: '+name);
    if(records.has(name))records.delete(name);
    const produced=typeof methods==='function'?methods({AGN,global,getPath}):methods;
    const normalized=normalizeMethods(produced);
    const required=list(options.contract);
    const missing=required.filter(function(method){return typeof normalized[method]!=='function';});
    if(missing.length)throw new Error('Adapter '+name+' is missing methods: '+missing.join(', '));
    const record={
      name,
      source:options.source||null,
      owner:options.owner||'shared',
      methods:Object.keys(normalized),
      required,
      globalDependencies:list(options.globalDependencies),
      compatibilityGlobals:list(options.compatibilityGlobals),
      calls:0,failures:0,lastMethod:null,lastCallAt:null,lastDurationMs:null,lastError:null,definedAt:now()
    };
    const wrapped={};
    Object.keys(normalized).forEach(function(method){
      wrapped[method]=function(){
        const args=Array.prototype.slice.call(arguments),started=global.performance&&performance.now?performance.now():now();
        record.calls+=1;record.lastMethod=method;record.lastCallAt=now();record.lastError=null;
        try{
          const result=normalized[method].apply(null,args);
          if(result&&typeof result.then==='function')return result.then(function(value){record.lastDurationMs=(global.performance&&performance.now?performance.now():now())-started;return value;}).catch(function(error){record.failures+=1;record.lastError=String(error&&error.message||error);throw error;});
          record.lastDurationMs=(global.performance&&performance.now?performance.now():now())-started;return result;
        }catch(error){record.failures+=1;record.lastError=String(error&&error.message||error);throw error;}
      };
    });
    record.api=Object.freeze(wrapped);records.set(name,record);
    if(AGN.events)AGN.events.emit('adapter:defined',{name,source:record.source,owner:record.owner,at:record.definedAt});
    return record.api;
  }
  function get(name){const record=records.get(name);return record?record.api:null;}
  function requireAdapter(name){const api=get(name);if(!api)throw new Error('Required adapter unavailable: '+name);return api;}
  function diagnostics(name){
    function one(record){
      const globalStatus=record.globalDependencies.map(function(dep){const value=getPath(dep);return {name:dep,available:value!==undefined,type:typeof value};});
      return {name:record.name,source:record.source,owner:record.owner,methods:record.methods.slice(),required:record.required.slice(),globalDependencies:record.globalDependencies.slice(),compatibilityGlobals:record.compatibilityGlobals.slice(),globalStatus,missingGlobals:globalStatus.filter(function(x){return !x.available;}).map(function(x){return x.name;}),calls:record.calls,failures:record.failures,lastMethod:record.lastMethod,lastCallAt:record.lastCallAt,lastDurationMs:record.lastDurationMs,lastError:record.lastError,definedAt:record.definedAt};
    }
    if(name){const record=records.get(name);return record?one(record):null;}
    const adapters={};records.forEach(function(record,key){adapters[key]=one(record);});
    const values=Object.values(adapters);
    return {registered:records.size,compatibilityBoundaries:values.reduce(function(sum,x){return sum+x.compatibilityGlobals.length;},0),missingGlobals:values.reduce(function(sum,x){return sum+x.missingGlobals.length;},0),adapters};
  }
  function snapshot(){const out={};records.forEach(function(record,key){out[key]=diagnostics(key);});return out;}

  AGN.adapters={define,get,require:requireAdapter,has:function(name){return records.has(name);},call:function(name,method){const api=requireAdapter(name);if(typeof api[method]!=='function')throw new Error('Adapter method unavailable: '+name+'.'+method);return api[method].apply(null,Array.prototype.slice.call(arguments,2));},diagnostics,snapshot,names:function(){return Array.from(records.keys());}};

  define('mapLegacy',function(){
    function map(){return global.map||null;}
    function markers(){return global.markers||global.weatherMarkers||{};}
    function layers(){return {district:global.districtLayer||null,province:global.provLayer||null};}
    return {
      isReady:function(){const m=map();return !!(m&&typeof m.invalidateSize==='function');},
      invalidate:function(){const m=map();if(global.agnInvalidateMap)return global.agnInvalidateMap();if(m&&m.invalidateSize)return m.invalidateSize({animate:false});},
      closePopup:function(){const m=map();if(m&&m.closePopup)return m.closePopup();},
      fitNationalBounds:function(options){const m=map(),ls=layers();if(!m)return false;let b=null;if(ls.district&&ls.district.getBounds)b=ls.district.getBounds();if((!b||!b.isValid||!b.isValid())&&ls.province&&ls.province.getBounds)b=ls.province.getBounds();if(!b||!b.isValid||!b.isValid())return false;m.fitBounds(b,options||{padding:[10,10],animate:false});return true;},
      forEachMarker:function(fn){const ms=markers();Object.keys(ms||{}).forEach(function(id){fn(ms[id],id);});},
      stationById:function(id){const raw=(global.STATIONS||[]).find(function(st){return st.id===id;})||null;return raw&&AGN.contracts?AGN.contracts.normalize('station',raw,{boundary:'mapLegacy.stationById'}):raw;},
      resolveUnitForPoint:function(lat,lon){const ls=layers();let unit=null;if(!ls.district||!ls.district.eachLayer)return null;ls.district.eachLayer(function(layer){if(unit||!layer.feature)return;try{if(layer.getBounds&&!layer.getBounds().contains([lat,lon]))return;}catch(_){}const props=layer.feature.properties||{};if(AGN.geo&&typeof AGN.geo.pointInFeature==='function'){try{if(!AGN.geo.pointInFeature(lat,lon,layer.feature))return;}catch(_){return;}}unit=props.key||props.tehsil||props.district||props.d||null;});return unit;},
      selectUnit:function(unit){let target=null,ls=layers();if(ls.district&&ls.district.eachLayer)ls.district.eachLayer(function(layer){const p=layer.feature&&layer.feature.properties||{};if(!target&&(p.key===unit||p.tehsil===unit||p.district===unit||p.d===unit))target=layer;});if(target&&typeof global.selectDistrict==='function'){global.selectDistrict({key:unit,name:unit},target);return true;}return false;},
      wrapSelectDistrict:function(after){const original=global.selectDistrict;if(typeof original!=='function')return null;function wrapped(){let result;try{result=original.apply(this,arguments);}finally{try{after&&after.apply(this,arguments);}catch(_){}}return result;}global.selectDistrict=wrapped;return function(){if(global.selectDistrict===wrapped)global.selectDistrict=original;};},
      refreshHazard:function(){if(typeof global.refreshDistrictHazard==='function')return global.refreshDistrictHazard();},
      refreshProvince:function(){if(typeof global.refreshProvinceFill==='function')return global.refreshProvinceFill();},
      drawLegend:function(){if(typeof global.drawLegend==='function')return global.drawLegend();},
      getRamp:function(key){return global.HAZARD_RAMPS&&global.HAZARD_RAMPS[key]?global.HAZARD_RAMPS[key].slice():null;},
      setRamp:function(key,value){global.HAZARD_RAMPS=global.HAZARD_RAMPS||{};global.HAZARD_RAMPS[key]=Array.isArray(value)?value.slice():value;return global.HAZARD_RAMPS[key]&&global.HAZARD_RAMPS[key].slice?global.HAZARD_RAMPS[key].slice():global.HAZARD_RAMPS[key];}
    };
  },{source:'core/10-adapters.js',owner:'overview',contract:['isReady','invalidate','closePopup','fitNationalBounds','forEachMarker','stationById','resolveUnitForPoint','selectUnit','wrapSelectDistrict','refreshHazard','refreshProvince','drawLegend','getRamp','setRamp'],globalDependencies:['map','markers','weatherMarkers','districtLayer','provLayer','STATIONS','selectDistrict','refreshDistrictHazard','refreshProvinceFill','drawLegend','HAZARD_RAMPS'],compatibilityGlobals:['map','markers','districtLayer','provLayer','selectDistrict','refreshDistrictHazard','refreshProvinceFill','HAZARD_RAMPS']});

  define('liveLegacy',{
    refreshPins:function(){if(typeof global.refreshPins==='function')return global.refreshPins();},
    activeStationId:function(){return typeof global.activeStationId==='function'?global.activeStationId():global.selectedId||null;},
    stationById:function(id){const raw=(global.STATIONS||[]).find(function(st){return st.id===id;})||null;return raw&&AGN.contracts?AGN.contracts.normalize('station',raw,{boundary:'liveLegacy.stationById'}):raw;},
    recomputeStation:function(station){if(station&&typeof global.recomputeStation==='function')return global.recomputeStation(station);},
    closePlaceSearch:function(){if(typeof global.mpClose==='function')return global.mpClose();}
  },{source:'core/10-adapters.js',owner:'livedata',contract:['refreshPins','activeStationId','stationById','recomputeStation','closePlaceSearch'],globalDependencies:['refreshPins','activeStationId','selectedId','STATIONS','recomputeStation','mpClose'],compatibilityGlobals:['refreshPins','activeStationId','selectedId','STATIONS','recomputeStation','mpClose']});

  define('aiLegacy',{
    render:function(){if(typeof global.aiRender==='function')return global.aiRender();},
    selectedHazard:function(){return global.aiState&&global.aiState.hazard||null;},
    setSelectedHazard:function(value){if(global.aiState)global.aiState.hazard=value;return value;}
  },{source:'core/10-adapters.js',owner:'airisk',contract:['render','selectedHazard','setSelectedHazard'],globalDependencies:['aiRender','aiState'],compatibilityGlobals:['aiRender','aiState']});

  define('riskLegacy',{
    stationRisk:function(station,hazard,lead){const raw=typeof global.aiStationRisk==='function'?global.aiStationRisk(station,hazard,lead):null;return raw&&AGN.contracts?AGN.contracts.normalize('hazardResult',Object.assign({hazard:hazard,unitKey:station&&station.id||station&&station.name,unitType:'station'},raw),{boundary:'riskLegacy.stationRisk',lead:lead}):raw;},
    stationComfort:function(station){return typeof global.stationComfort==='function'?global.stationComfort(station):null;}
  },{source:'core/10-adapters.js',owner:'shared-risk',contract:['stationRisk','stationComfort'],globalDependencies:['aiStationRisk','stationComfort'],compatibilityGlobals:['aiStationRisk','stationComfort']});

  define('locationLegacy',{
    activeStation:function(){if(global.aiState&&global.aiState.station)return global.aiState.station;const id=typeof global.activeStationId==='function'?global.activeStationId():global.selectedId||null;const base=(global.STATIONS||[]).find(function(st){return st.id===id;})||(global.STATIONS||[])[0]||null;const raw=typeof global.effStation==='function'?global.effStation(base):base;return raw&&AGN.contracts?AGN.contracts.normalize('station',raw,{boundary:'locationLegacy.activeStation'}):raw;},
    context:function(station){const d=global.STATION_DISTRICT&&station&&global.STATION_DISTRICT[station.id]||null;return {tehsil:station&&station.tehsil||d&&d.tehsil||'Point context',district:station&&station.district||d&&d.district||station&&station.name||'Active location',province:station&&station.province||d&&d.province||''};},
    stationById:function(id){const raw=(global.STATIONS||[]).find(function(st){return st.id===id;})||null;return raw&&AGN.contracts?AGN.contracts.normalize('station',raw,{boundary:'locationLegacy.stationById'}):raw;}
  },{source:'core/10-adapters.js',owner:'shared-location',contract:['activeStation','context','stationById'],globalDependencies:['aiState','activeStationId','selectedId','STATIONS','effStation','STATION_DISTRICT'],compatibilityGlobals:['aiState','activeStationId','selectedId','STATIONS','effStation','STATION_DISTRICT']});

  define('modelLabLegacy',{
    getState:function(){return global.mmState||null;},
    updateState:function(patch){global.mmState=Object.assign(global.mmState||{},patch||{});return global.mmState;},
    reloadVariable:function(){if(typeof global.mmReloadVar==='function')return Promise.resolve(global.mmReloadVar()).then(function(value){return {called:true,value:value};});return Promise.resolve({called:false,value:null});},
    loadStation:function(station){if(typeof global.mmOnCity==='function')return global.mmOnCity(station);},
    activeStationId:function(){return typeof global.activeStationId==='function'?global.activeStationId():global.selectedId||null;},
    activeStation:function(){if(global.aiState&&global.aiState.station)return global.aiState.station;const id=typeof global.activeStationId==='function'?global.activeStationId():global.selectedId||null;const base=(global.STATIONS||[]).find(function(st){return st.id===id;})||(global.STATIONS||[])[0]||null;const raw=typeof global.effStation==='function'?global.effStation(base):base;return raw&&AGN.contracts?AGN.contracts.normalize('station',raw,{boundary:'modelLabLegacy.activeStation'}):raw;},
    modelDefinitions:function(){return Array.isArray(global.MM_MODELS)?global.MM_MODELS.slice():[];},
    stats:function(series,lead){return typeof global.mmStats==='function'?global.mmStats(series,lead):null;}
  },{source:'core/10-adapters.js',owner:'modelab',contract:['getState','updateState','reloadVariable','loadStation','activeStationId','activeStation','modelDefinitions','stats'],globalDependencies:['aiState','mmState','mmReloadVar','mmOnCity','activeStationId','selectedId','STATIONS','effStation','MM_MODELS','mmStats'],compatibilityGlobals:['mmState','mmReloadVar','mmOnCity','activeStationId','MM_MODELS','mmStats']});

  AGN.architecture=Object.assign({},AGN.architecture,{adapters:'compatibility globals isolated behind measured section-owned adapters'});
})(window);
