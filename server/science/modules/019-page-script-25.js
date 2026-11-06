(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const records = new Map();
  const serviceToSection = Object.freeze({
    overview:'overview', livedata:'livedata', airisk:'airisk', assessments:'assessments',
    operations:'operations', modelLab:'modelab', hybridLab:'hybridlab'
  });

  function now(){ return Date.now(); }
  function clone(value){
    if(value == null) return value;
    if(typeof structuredClone === 'function'){
      try{return structuredClone(value);}catch(_){}
    }
    try{return JSON.parse(JSON.stringify(value));}catch(_){return value;}
  }
  function list(value){ return Array.isArray(value) ? Array.from(new Set(value.map(String))) : []; }
  function contract(name){
    const c=AGN.services && AGN.services.contracts && AGN.services.contracts[name];
    return Array.isArray(c) ? c.slice() : [];
  }
  function normalizeMethods(value){
    const out={};
    Object.keys(value||{}).forEach(key=>{ if(typeof value[key]==='function') out[key]=value[key]; });
    return out;
  }
  function resolveGlobal(path){
    let value=global;
    for(const part of String(path).split('.')) value=value && value[part];
    return value;
  }
  function inspectGlobals(names){
    return list(names).map(name=>({name,available:resolveGlobal(name)!==undefined,type:typeof resolveGlobal(name)}));
  }
  function makeContext(name,options){
    const section=options.section || serviceToSection[name] || name;
    return Object.freeze({
      name,
      section,
      AGN,
      global,
      store:AGN.store || null,
      events:AGN.events || null,
      api:AGN.api || null,
      state:AGN.sectionState ? AGN.sectionState.for(section) : null,
      service:function(dep){return AGN.services.require(dep);},
      tryService:function(dep){return AGN.services.get(dep);},
      adapter:function(dep){return AGN.adapters.require(dep);},
      tryAdapter:function(dep){return AGN.adapters.get(dep);},
      dataService:function(dep){return AGN.dataServices.require(dep);},
      tryDataService:function(dep){return AGN.dataServices.get(dep);},
      repository:function(dep){return AGN.repositories.require(dep);},
      tryRepository:function(dep){return AGN.repositories&&AGN.repositories.get(dep)?AGN.repositories.require(dep):null;},
      workflow:function(dep){return AGN.workflows.require(dep);},
      tryWorkflow:function(dep){return AGN.workflows&&AGN.workflows.get(dep)?AGN.workflows.require(dep):null;},
      select:function(path){return AGN.store ? AGN.store.select(path) : undefined;},
      emit:function(type,detail){if(AGN.events)AGN.events.emit(type,detail);}
    });
  }
  function define(name,factoryOrMethods,options){
    options=options||{};
    if(!name || typeof name!=='string') throw new TypeError('Implementation name is required');
    if(!serviceToSection[name]) throw new Error('Unknown top-level implementation: '+name);
    if(!AGN.services) throw new Error('AGN.services must load before AGN.implementations');
    if(records.has(name) && options.replace!==true) throw new Error('Implementation is already defined: '+name);
    if(records.has(name)) dispose(name);

    const required=contract(name);
    const context=makeContext(name,options);
    const produced=typeof factoryOrMethods==='function' ? factoryOrMethods(context) : factoryOrMethods;
    const methods=normalizeMethods(produced);
    const missing=required.filter(method=>typeof methods[method]!=='function');
    if(missing.length) throw new Error('Implementation '+name+' is missing contract methods: '+missing.join(', '));

    const record={
      name,
      section:context.section,
      owner:options.owner || context.section,
      source:options.source || null,
      moduleType:options.moduleType || 'section-implementation',
      required,
      methods:Object.keys(methods),
      dependencies:list(options.dependencies),
      globalDependencies:list(options.globalDependencies),
      compatibilityGlobals:list(options.compatibilityGlobals),
      definedAt:now(),
      initialized:true,
      calls:0,
      failures:0,
      lastMethod:null,
      lastCallAt:null,
      lastDurationMs:null,
      lastError:null,
      dispose:null,
      serviceUnregister:null
    };

    const wrapped={};
    Object.keys(methods).forEach(method=>{
      wrapped[method]=function(){
        const args=Array.prototype.slice.call(arguments);
        const started=global.performance&&typeof global.performance.now==='function'?global.performance.now():now();
        record.calls+=1;record.lastMethod=method;record.lastCallAt=now();record.lastError=null;
        try{
          const result=methods[method].apply(context,args);
          if(result&&typeof result.then==='function'){
            return result.then(value=>{
              const ended=global.performance&&typeof global.performance.now==='function'?global.performance.now():now();
              record.lastDurationMs=Math.max(0,ended-started);return value;
            }).catch(error=>{
              record.failures+=1;record.lastError=String(error&&error.message||error);
              if(AGN.events)AGN.events.emit('implementation:error',{name,method,error,at:now()});
              throw error;
            });
          }
          const ended=global.performance&&typeof global.performance.now==='function'?global.performance.now():now();
          record.lastDurationMs=Math.max(0,ended-started);return result;
        }catch(error){
          record.failures+=1;record.lastError=String(error&&error.message||error);
          if(AGN.events)AGN.events.emit('implementation:error',{name,method,error,at:now()});
          throw error;
        }
      };
    });

    record.dispose=typeof options.dispose==='function'?options.dispose:null;
    records.set(name,record);
    record.serviceUnregister=AGN.services.register(name,wrapped,{
      source:'implementation:'+String(record.source||record.owner),
      compatibility:options.compatibility!==false
    });
    if(AGN.events)AGN.events.emit('implementation:defined',{
      name,section:record.section,owner:record.owner,methods:record.methods.slice(),source:record.source,at:record.definedAt
    });
    return Object.freeze({name,section:record.section,service:AGN.services.get(name),diagnostics:()=>diagnostics(name)});
  }
  function dispose(name){
    const record=records.get(name);if(!record)return false;
    try{if(record.dispose)record.dispose();}catch(error){record.lastError=String(error&&error.message||error);}
    try{if(record.serviceUnregister)record.serviceUnregister();}catch(_){}
    records.delete(name);
    if(AGN.events)AGN.events.emit('implementation:disposed',{name,at:now()});
    return true;
  }
  function diagnostics(name){
    if(name){
      const r=records.get(name);if(!r)return null;
      const globals=inspectGlobals(r.globalDependencies);
      const missingGlobals=globals.filter(x=>!x.available).map(x=>x.name);
      const missingDependencies=r.dependencies.filter(function(dep){
        if(String(dep).indexOf('adapter:')===0) return !(AGN.adapters&&AGN.adapters.has(String(dep).slice(8)));
        if(String(dep).indexOf('data:')===0) return !(AGN.dataServices&&AGN.dataServices.has(String(dep).slice(5)));
        if(String(dep).indexOf('repository:')===0) return !(AGN.repositories&&AGN.repositories.get(String(dep).slice(11)));
        if(String(dep).indexOf('workflow:')===0) return !(AGN.workflows&&AGN.workflows.get(String(dep).slice(9)));
        return !(AGN.services&&AGN.services.has(dep));
      });
      const service=AGN.services.diagnostics(name);
      return {
        name:r.name,section:r.section,owner:r.owner,source:r.source,moduleType:r.moduleType,
        required:r.required.slice(),methods:r.methods.slice(),dependencies:r.dependencies.slice(),
        globalDependencies:r.globalDependencies.slice(),compatibilityGlobals:r.compatibilityGlobals.slice(),
        globalStatus:globals,missingGlobals,missingDependencies,definedAt:r.definedAt,initialized:r.initialized,
        calls:r.calls,failures:r.failures,lastMethod:r.lastMethod,lastCallAt:r.lastCallAt,
        lastDurationMs:r.lastDurationMs,lastError:r.lastError,
        contractReady:!!service && r.required.every(method=>(service.methods||[]).includes(method)),
        isolationStatus:missingDependencies.length?'blocked':(r.compatibilityGlobals.length?'compatibility-boundary':'isolated')
      };
    }
    const implementations={};records.forEach((_r,key)=>{implementations[key]=diagnostics(key);});
    const values=Object.values(implementations);
    return {
      registered:records.size,
      expected:Object.keys(serviceToSection).length,
      isolated:values.filter(x=>x.isolationStatus==='isolated').length,
      compatibilityBoundaries:values.reduce((n,x)=>n+x.compatibilityGlobals.length,0),
      missingGlobals:values.reduce((n,x)=>n+x.missingGlobals.length,0),
      implementations
    };
  }
  function snapshot(){
    const out={};records.forEach((_r,name)=>{
      const service=AGN.services.get(name);
      out[name]={diagnostics:diagnostics(name),state:service&&typeof service.getState==='function'?clone(service.getState()):null};
    });return out;
  }
  function requireImplementation(name){
    if(!records.has(name))throw new Error('Required NIGRAAN implementation is unavailable: '+name);
    return AGN.services.require(name);
  }
  function assertReady(){
    const expected=Object.keys(serviceToSection);
    const missing=expected.filter(name=>!records.has(name));
    const incomplete=expected.filter(name=>{const d=diagnostics(name);return d&&!d.contractReady;});
    return {ok:missing.length===0&&incomplete.length===0,missing,incomplete,diagnostics:diagnostics()};
  }

  AGN.implementations={define,dispose,has:name=>records.has(name),require:requireImplementation,diagnostics,snapshot,assertReady,names:Object.freeze(Object.keys(serviceToSection))};
  AGN.architecture=Object.assign({},AGN.architecture,{
    implementations:'section-owned implementation modules registered behind AGN.services contracts and explicit adapter or data-service dependencies'
  });
})(window);
