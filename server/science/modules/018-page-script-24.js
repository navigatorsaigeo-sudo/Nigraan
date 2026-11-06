(function (global) {
  'use strict';
  const AGN=global.AGN=global.AGN||{};
  const records=new Map();
  function now(){return Date.now();}
  function clone(value){if(value==null)return value;if(typeof structuredClone==='function'){try{return structuredClone(value);}catch(_){}}try{return JSON.parse(JSON.stringify(value));}catch(_){return value;}}
  function getPath(path){return String(path).split('.').reduce(function(value,key){return value==null?undefined:value[key];},global);}
  function define(name,methods,options){options=options||{};if(records.has(name)&&options.replace!==true)throw new Error('Data service already defined: '+name);const api={};Object.keys(methods||{}).forEach(function(key){if(typeof methods[key]==='function')api[key]=methods[key];});const required=options.contract||[];const missing=required.filter(function(key){return typeof api[key]!=='function';});if(missing.length)throw new Error('Data service '+name+' missing: '+missing.join(', '));const record={name,api:Object.freeze(api),source:options.source||null,owner:options.owner||'shared',globalDependencies:(options.globalDependencies||[]).slice(),definedAt:now()};records.set(name,record);return record.api;}
  function get(name){const r=records.get(name);return r?r.api:null;}
  function requireService(name){const api=get(name);if(!api)throw new Error('Required data service unavailable: '+name);return api;}
  function diagnostics(name){function one(r){const status=r.globalDependencies.map(function(dep){const value=getPath(dep);return {name:dep,available:value!==undefined,type:typeof value};});return {name:r.name,source:r.source,owner:r.owner,methods:Object.keys(r.api),globalDependencies:r.globalDependencies.slice(),globalStatus:status,missingGlobals:status.filter(function(x){return !x.available;}).map(function(x){return x.name;}),definedAt:r.definedAt};}if(name){const r=records.get(name);return r?one(r):null;}const services={};records.forEach(function(r,k){services[k]=one(r);});return {registered:records.size,services};}
  AGN.dataServices={define,get,require:requireService,has:function(name){return records.has(name);},diagnostics,snapshot:function(){return clone(diagnostics());},names:function(){return Array.from(records.keys());}};

  define('geography',{
    input:function(key){const raw=global.DISTRICT_IN&&global.DISTRICT_IN[key]||null;if(raw&&AGN.contracts){const district=this.districtOf(key);AGN.contracts.observe('tehsil',{key:key,name:key,district:district,input:raw,validTime:raw.validTime||raw.updatedAt},{boundary:'geography.input',unit:key});}return raw;},
    hasInput:function(key){return !!(global.DISTRICT_IN&&global.DISTRICT_IN[key]);},
    inputKeys:function(){return Object.keys(global.DISTRICT_IN||{});},
    districtOf:function(tehsil){if(AGN.units&&typeof AGN.units.districtOf==='function')return AGN.units.districtOf(tehsil);return global.PK_KEY_TO_DISTRICT&&global.PK_KEY_TO_DISTRICT[tehsil]||null;},
    memberTehsils:function(district){if(AGN.units&&typeof AGN.units.tehsilsOf==='function')return AGN.units.tehsilsOf(district);return Object.keys(global.PK_KEY_TO_DISTRICT||{}).filter(function(key){return global.PK_KEY_TO_DISTRICT[key]===district;});},
    unitInput:function(name){const direct=global.DISTRICT_IN&&global.DISTRICT_IN[name];if(direct)return {key:name,input:direct,scope:'tehsil'};const members=this.memberTehsils(name),rows=members.map(function(key){return {key,input:global.DISTRICT_IN&&global.DISTRICT_IN[key]};}).filter(function(row){return !!row.input;});return rows.length?{key:name,rows,scope:'district'}:null;},
    firstForecastUnit:function(){return Object.keys(global.DISTRICT_IN||{}).find(function(key){return global.DISTRICT_IN[key]&&global.DISTRICT_IN[key].days;})||null;},
    nearestInputKey:function(lat,lon){let best=null,distance=Infinity;(global.PK_DISTRICT_CENTROIDS||[]).forEach(function(c){if(global.IIOJK&&c.province===global.IIOJK)return;const key=c.key||c.district;if(!key||!(global.DISTRICT_IN&&global.DISTRICT_IN[key]))return;const d=(Number(c.lat)-Number(lat))**2+(Number(c.lon)-Number(lon))**2;if(d<distance){distance=d;best=key;}});return best;},
    noun:function(level,count){return AGN.units&&typeof AGN.units.noun==='function'?AGN.units.noun(level,count):(Number(count)===1?level:level+'s');},
    rollupVerdict:function(district){const raw=AGN.units&&typeof AGN.units.rollupVerdict==='function'?AGN.units.rollupVerdict(district):null;if(raw&&AGN.contracts)return AGN.contracts.normalize('hazardResult',Object.assign({unitKey:district,unitType:'district'},raw),{boundary:'geography.rollupVerdict'});return raw;},
    tehsilRecord:function(key){const input=this.input(key);if(!input)return null;return AGN.contracts?AGN.contracts.normalize('tehsil',{key:key,name:key,district:this.districtOf(key),input:input,validTime:input.validTime||input.updatedAt},{boundary:'geography.tehsilRecord'}):{key:key,input:input};},
    districtRecord:function(district){const members=this.memberTehsils(district),available=members.filter(k=>this.hasInput(k));return AGN.contracts?AGN.contracts.normalize('district',{key:district,name:district,memberTehsils:members,coverage:members.length?available.length/members.length*100:null},{boundary:'geography.districtRecord'}):{key:district,memberTehsils:members};},
    forecastRecord:function(key){const input=this.input(key);if(!input)return null;return AGN.contracts?AGN.contracts.normalize('forecast',{unitKey:key,unitType:'tehsil',provider:input.provider||input.source||'model forecast',providerRun:input.providerRun,retrievedAt:input.updatedAt,validTime:input.validTime,days:input.days||[],hourly:input.hourly||{},coverage:input.coverage},{boundary:'geography.forecastRecord'}):{unitKey:key,days:input.days||[]};}
  },{source:'core/11-data-services.js',owner:'shared-geography',contract:['input','hasInput','inputKeys','districtOf','memberTehsils','unitInput','firstForecastUnit','nearestInputKey','noun','rollupVerdict','tehsilRecord','districtRecord','forecastRecord'],globalDependencies:['DISTRICT_IN','PK_KEY_TO_DISTRICT','PK_DISTRICT_CENTROIDS','IIOJK','AGN.units']});

  define('domain',{
    activePoint:function(){const raw=AGN.data&&typeof AGN.data.activePoint==='function'?AGN.data.activePoint():null;return raw&&AGN.contracts?AGN.contracts.normalize('station',raw,{boundary:'domain.activePoint'}):raw;},
    setActivePoint:function(point){const value=AGN.contracts?AGN.contracts.normalize('station',point,{boundary:'domain.setActivePoint'}):point;return AGN.data&&typeof AGN.data.setActive==='function'?AGN.data.setActive(value):null;},
    dataStore:function(){return AGN.data&&AGN.data.store||null;},
    compoundFlood:function(score,bundle){ return AGN.data&&typeof AGN.data.compoundFlood==='function'?AGN.data.compoundFlood(score,bundle):null;},
    hazard:function(){return AGN.hazard&&typeof AGN.hazard.get==='function'?AGN.hazard.get():AGN.store&&AGN.store.select('context.hazard');},
    hazardLabel:function(key){return AGN.hazard&&typeof AGN.hazard.label==='function'?AGN.hazard.label(key):key;},
    sector:function(){return AGN.sector&&typeof AGN.sector.get==='function'?AGN.sector.get():AGN.store&&AGN.store.select('context.sector');},
    setSector:function(value,source){return AGN.sector&&typeof AGN.sector.set==='function'?AGN.sector.set(value,source):null;},
    validSector:function(value){return !!(AGN.sector&&typeof AGN.sector.valid==='function'&&AGN.sector.valid(value));},
    formula:function(key){return AGN.formulas&&typeof AGN.formulas.get==='function'?AGN.formulas.get(key):AGN.formulas&&AGN.formulas[key]||null;},
    modelState:function(){return AGN.adapters&&AGN.adapters.has('modelLabLegacy')?AGN.adapters.require('modelLabLegacy').getState():global.mmState||null;}
  },{source:'core/11-data-services.js',owner:'shared-domain',contract:['activePoint','setActivePoint','dataStore','compoundFlood','hazard','hazardLabel','sector','setSector','validSector','formula','modelState'],globalDependencies:['AGN.data','AGN.hazard','AGN.sector','AGN.formulas','mmState']});

  define('storage',{
    get:function(key,fallback){try{const value=JSON.parse(global.localStorage.getItem(key)||'null');return value==null?clone(fallback):value;}catch(_){return clone(fallback);}},
    set:function(key,value){try{global.localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}},
    remove:function(key){try{global.localStorage.removeItem(key);return true;}catch(_){return false;}},
    raw:function(){return global.localStorage||null;},
    getTyped:function(key,contract,fallback){const value=this.get(key,fallback);return AGN.contracts?AGN.contracts.normalize(contract,value,{boundary:'storage.get',key:key}):value;},
    setTyped:function(key,contract,value){const normalized=AGN.contracts?AGN.contracts.assert(contract,value,{boundary:'storage.set',key:key}):value;return this.set(key,normalized);}
  },{source:'core/11-data-services.js',owner:'shared-storage',contract:['get','set','remove','raw','getTyped','setTyped'],globalDependencies:['localStorage']});

  define('contracts',{
    normalize:function(name,value,context){return AGN.contracts.normalize(name,value,context);},
    validate:function(name,value,context){return AGN.contracts.validate(name,value,context);},
    assert:function(name,value,context){return AGN.contracts.assert(name,value,context);},
    envelope:function(name,value,context){return AGN.contracts.envelope(name,value,context);},
    station:function(value,context){return AGN.contracts.normalize('station',value,context);},
    tehsil:function(value,context){return AGN.contracts.normalize('tehsil',value,context);},
    district:function(value,context){return AGN.contracts.normalize('district',value,context);},
    forecast:function(value,context){return AGN.contracts.normalize('forecast',value,context);},
    hazardResult:function(value,context){return AGN.contracts.normalize('hazardResult',value,context);},
    evidence:function(value,context){return AGN.contracts.normalize('evidence',value,context);},
    apiPayload:function(value,context){return AGN.contracts.normalize('apiPayload',value,context);},
    diagnostics:function(){return AGN.contracts.diagnostics();}
  },{source:'core/11-data-services.js',owner:'shared-contracts',contract:['normalize','validate','assert','envelope','station','tehsil','district','forecast','hazardResult','evidence','apiPayload','diagnostics'],globalDependencies:['AGN.contracts']});

  define('persistence',{
    diagnostics:function(){return AGN.persistence.diagnostics();},
    store:function(name){return AGN.persistence.getStore(name);},
    read:function(store,key,options){return AGN.persistence.read(store,key,options);},
    list:function(store,options){return AGN.persistence.list(store,options);},
    commit:function(store,value,options){return AGN.persistence.commit(store,value,options);},
    append:function(store,value,options){return AGN.persistence.append(store,value,options);},
    remove:function(store,key,options){return AGN.persistence.remove(store,key,options);}
  },{source:'core/11-data-services.js',owner:'shared-persistence',contract:['diagnostics','store','read','list','commit','append','remove'],globalDependencies:['AGN.persistence']});

  AGN.architecture=Object.assign({},AGN.architecture,{dataServices:'contract-aware geography, domain, legacy browser storage and policy-controlled persistence services'});
})(window);
