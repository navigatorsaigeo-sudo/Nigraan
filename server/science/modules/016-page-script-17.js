(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const repositories = new Map();
  const stats = new Map();
  const config = { defaultMode:'backend', allowDemo:true };

  function clone(value){
    if(value==null)return value;
    if(typeof structuredClone==='function'){try{return structuredClone(value);}catch(_){}}
    try{return JSON.parse(JSON.stringify(value));}catch(_){return value;}
  }
  function nowIso(){return new Date().toISOString();}
  function uid(prefix){
    if(global.crypto&&typeof global.crypto.randomUUID==='function')return prefix+'-'+global.crypto.randomUUID();
    return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  }
  function repoError(code,message,details){const e=new Error(message);e.name='AGNRepositoryError';e.code=code;e.details=clone(details||null);return e;}
  function unwrap(value){return value&&value.data!==undefined&&value.store?value.data:value;}
  function explicitMode(options){
    options=options||{};
    if(options.mode)return options.mode;
    if(options.demo===true)return 'demo';
    return config.defaultMode;
  }
  function ensureMode(mode){
    if(mode!=='backend'&&mode!=='demo')throw repoError('REPOSITORY_MODE_INVALID','Repository mode must be backend or demo.',{mode});
    if(mode==='demo'&&!config.allowDemo)throw repoError('DEMO_MODE_DISABLED','Offline demonstration mode is disabled.');
    return mode;
  }
  function define(name,definition){
    if(repositories.has(name))throw new Error('Repository already defined: '+name);
    const d=definition||{};
    if(!d.section||!d.methods)throw new Error('Repository '+name+' requires section and methods.');
    const record=Object.freeze({name,section:d.section,source:d.source||'core/16-repositories.js',endpoints:Object.freeze((d.endpoints||[]).slice()),demoStores:Object.freeze((d.demoStores||[]).slice()),methods:Object.freeze(Object.assign({},d.methods))});
    repositories.set(name,record);
    stats.set(name,{calls:0,successes:0,failures:0,demoCalls:0,backendCalls:0,lastMethod:null,lastMode:null,lastAt:null,lastDurationMs:null,lastError:null});
    return record;
  }
  function get(name){return repositories.get(name)||null;}
  function requireRepo(name){const r=get(name);if(!r)throw repoError('REPOSITORY_NOT_FOUND','Repository is not registered: '+name);return publicApi(r);}
  function names(){return Array.from(repositories.keys());}
  function publicApi(record){
    const api={name:record.name,section:record.section,endpoints:record.endpoints.slice(),demoStores:record.demoStores.slice()};
    Object.keys(record.methods).forEach(method=>{api[method]=function(){return invoke(record.name,method,Array.from(arguments));};});
    return Object.freeze(api);
  }
  async function invoke(name,method,args){
    const r=get(name);if(!r)throw repoError('REPOSITORY_NOT_FOUND','Repository is not registered: '+name);
    const fn=r.methods[method];if(typeof fn!=='function')throw repoError('REPOSITORY_METHOD_NOT_FOUND','Repository method is not registered: '+name+'.'+method);
    const st=stats.get(name),started=Date.now();st.calls+=1;st.lastMethod=method;st.lastAt=nowIso();
    const options=(args&&args.length&&args[args.length-1]&&typeof args[args.length-1]==='object'&&!Array.isArray(args[args.length-1]))?args[args.length-1]:{};
    const mode=ensureMode(explicitMode(options));st.lastMode=mode;if(mode==='demo')st.demoCalls+=1;else st.backendCalls+=1;
    try{const out=await fn.apply(null,args);st.successes+=1;st.lastDurationMs=Date.now()-started;st.lastError=null;if(AGN.events)AGN.events.emit('repository:success',{repository:name,method,mode,durationMs:st.lastDurationMs});return out;}
    catch(error){st.failures+=1;st.lastDurationMs=Date.now()-started;st.lastError=String(error&&error.message||error);if(AGN.events)AGN.events.emit('repository:error',{repository:name,method,mode,error:st.lastError,code:error&&error.code||null});throw error;}
  }
  async function backend(endpoint,params,options){
    if(!AGN.backendInterfaces||typeof AGN.backendInterfaces.request!=='function')throw repoError('BACKEND_INTERFACE_UNAVAILABLE','Backend interface registry is unavailable.',{endpoint});
    const env=await AGN.backendInterfaces.request(endpoint,params||{},options||{});
    return {mode:'backend',persisted:true,endpoint,data:clone(env.data),meta:clone(env.meta||{}),pagination:clone(env.pagination||null),requestId:env.requestId||null,traceId:env.traceId||null};
  }
  async function demoCommit(store,record,options){
    if(!AGN.persistence)throw repoError('PERSISTENCE_UNAVAILABLE','Persistence registry is unavailable.',{store});
    options=Object.assign({},options||{},{mode:'demo',demo:true,adapter:(options&&options.adapter)||'session'});
    const saved=await AGN.persistence.commit(store,record,options);
    return {mode:'demo',persisted:true,operational:false,store,data:clone(unwrap(saved)),record:clone(saved),warnings:['Browser demonstration record. Not an operational or shared backend record.']};
  }
  async function demoRead(store,id,options){
    if(!AGN.persistence)throw repoError('PERSISTENCE_UNAVAILABLE','Persistence registry is unavailable.',{store});
    const saved=await AGN.persistence.read(store,id,Object.assign({},options||{},{adapter:(options&&options.adapter)||'session'}));
    return {mode:'demo',persisted:!!saved,operational:false,store,data:clone(unwrap(saved)),record:clone(saved),warnings:['Browser demonstration record. Not an operational or shared backend record.']};
  }
  async function demoList(store,options){
    if(!AGN.persistence)throw repoError('PERSISTENCE_UNAVAILABLE','Persistence registry is unavailable.',{store});
    const rows=await AGN.persistence.list(store,Object.assign({},options||{},{adapter:(options&&options.adapter)||'session'}));
    return {mode:'demo',persisted:true,operational:false,store,data:(rows||[]).map(unwrap).map(clone),records:clone(rows||[]),warnings:['Browser demonstration records. Not operational or shared backend records.']};
  }
  async function demoRemove(store,id,options){
    if(!AGN.persistence)throw repoError('PERSISTENCE_UNAVAILABLE','Persistence registry is unavailable.',{store});
    const removed=await AGN.persistence.remove(store,id,Object.assign({},options||{},{demo:true,adapter:(options&&options.adapter)||'session'}));
    return {mode:'demo',persisted:true,operational:false,store,id,removed:!!removed};
  }
  function modeOf(options){return ensureMode(explicitMode(options));}
  function requireBackendMethod(name,method){throw repoError('REPOSITORY_BACKEND_METHOD_UNAVAILABLE','Backend repository method is not defined by the current endpoint contracts: '+name+'.'+method,{repository:name,method});}
  function normalizeEvidence(value){return AGN.contracts?AGN.contracts.normalize('evidence',value,{boundary:'repository',repository:'assessmentEvidence'}):clone(value);}
  function idOf(value,candidates,prefix){for(const key of candidates){if(value&&value[key])return String(value[key]);}return uid(prefix);}

  if(AGN.persistence){
    AGN.persistence.defineStore('local_demo_assessment_evidence',{adapter:'session',backendRequired:false,demoAllowed:true,immutable:true,audit:true,retention:'browser session only',idField:'calculationId',contract:'evidence',description:'Offline assessment evidence demonstration records.'});
    AGN.persistence.defineStore('local_demo_outcomes',{adapter:'session',backendRequired:false,demoAllowed:true,immutable:true,audit:true,retention:'browser session only',idField:'outcomeId',description:'Offline post-event outcome demonstration records.'});
    AGN.persistence.defineStore('local_demo_model_experiments',{adapter:'session',backendRequired:false,demoAllowed:true,immutable:true,audit:true,retention:'browser session only',idField:'experimentId',description:'Offline Model Confidence experiment demonstration records.'});
    AGN.persistence.defineStore('local_demo_hybrid_experiments',{adapter:'session',backendRequired:false,demoAllowed:true,immutable:true,audit:true,retention:'browser session only',idField:'experimentId',description:'Offline Scenario Lab experiment demonstration records.'});
    AGN.persistence.defineStore('local_demo_risk_explanations',{adapter:'session',backendRequired:false,demoAllowed:true,immutable:true,audit:true,retention:'browser session only',idField:'explanationId',description:'Offline deterministic risk explanation demonstration records.'});
    AGN.persistence.defineStore('local_demo_operational_states',{adapter:'session',backendRequired:false,demoAllowed:true,immutable:true,audit:true,retention:'browser session only',idField:'stateId',description:'Offline operational-state snapshots.'});
  }

  define('assessmentEvidence',{section:'assessments',endpoints:['assessments.create','assessments.evidence'],demoStores:['local_demo_assessment_evidence'],methods:{
    async create(evidence,options){
      options=options||{};const mode=modeOf(options);const normalized=normalizeEvidence(evidence||{});
      const calculationId=idOf(normalized,['calculationId','calculation_id','id'],'AGN-ASMT');normalized.calculationId=calculationId;normalized.calculation_id=normalized.calculation_id||calculationId;
      if(mode==='demo')return demoCommit('local_demo_assessment_evidence',normalized,Object.assign({},options,{id:calculationId,contract:'evidence',source:options.source||'assessment-workflow'}));
      const body=options.requestBody||{asset:normalized.asset||{},hazards:(normalized.hazards||normalized.results||[]).map(x=>x.key||x.hazard).filter(Boolean),horizon:normalized.horizon&&normalized.horizon.selected||normalized.horizon||'present',design_life_years:normalized.asset&&normalized.asset.design_life_years||undefined,scenario_id:options.scenarioId||undefined,evidence_context:normalized};
      return backend('assessments.create',{body},options);
    },
    async get(calculationId,options){const mode=modeOf(options);if(mode==='demo')return demoRead('local_demo_assessment_evidence',calculationId,options);return backend('assessments.evidence',{path:{calculation_id:calculationId}},options);},
    async list(options){const mode=modeOf(options);if(mode==='demo')return demoList('local_demo_assessment_evidence',options);return requireBackendMethod('assessmentEvidence','list');}
  }});

  define('actions',{section:'operations',endpoints:['operations.actions.create','operations.actions.update'],demoStores:['local_demo_actions'],methods:{
    async create(action,options){
      options=options||{};const mode=modeOf(options);const id=idOf(action,['actionId','action_id','id'],'AGN-ACT');const value=Object.assign({},clone(action||{}),{id,actionId:id,action_id:id,version:Number(action&&action.version||1),persistence:mode==='demo'?'browser_session_demo':'backend'});
      if(mode==='demo')return demoCommit('local_demo_actions',value,Object.assign({},options,{id,source:options.source||'operations-workflow'}));
      const body=options.requestBody||{unit_id:value.unit_id||value.unitId||value.unit_name,hazard:value.hazard,hazard_result_id:value.hazard_result_id||value.hazardResultId,owner_id:value.owner_id||value.ownerId||value.owner,sop_id:value.sop_id||value.sopId,deadline_basis:value.deadline_basis||value.deadlineBasis,evidence_ids:value.evidence_ids||value.evidenceIds||[]};
      return backend('operations.actions.create',{body},options);
    },
    async update(actionId,patch,options){
      options=options||{};const mode=modeOf(options);
      if(mode==='demo'){
        const existing=await AGN.persistence.read('local_demo_actions',actionId,{adapter:options.adapter||'session'});if(!existing)throw repoError('ACTION_NOT_FOUND','Demo action not found: '+actionId);
        const current=unwrap(existing)||{};const next=Object.assign({},current,clone(patch||{}),{id:actionId,actionId,action_id:actionId,version:Number(current.version||1)+1,updated_at:nowIso()});
        return demoCommit('local_demo_actions',next,Object.assign({},options,{id:actionId,expectedVersion:existing.version,source:options.source||'operations-workflow'}));
      }
      const body=Object.assign({},patch||{});if(body.version==null)body.version=options.version;if(body.version==null)throw repoError('ACTION_VERSION_REQUIRED','Action update requires the current optimistic-lock version.');
      return backend('operations.actions.update',{path:{action_id:actionId},body},options);
    },
    async get(actionId,options){const mode=modeOf(options);if(mode==='demo')return demoRead('local_demo_actions',actionId,options);return requireBackendMethod('actions','get');},
    async list(options){const mode=modeOf(options);if(mode==='demo')return demoList('local_demo_actions',options);return requireBackendMethod('actions','list');},
    async remove(actionId,options){const mode=modeOf(options);if(mode==='demo')return demoRemove('local_demo_actions',actionId,options);return requireBackendMethod('actions','remove');}
  }});

  define('outcomes',{section:'operations',endpoints:['operations.outcomes.create'],demoStores:['local_demo_outcomes'],methods:{
    async create(outcome,options){
      options=options||{};const mode=modeOf(options);const id=idOf(outcome,['outcomeId','outcome_id','id'],'AGN-OUT');const value=Object.assign({},clone(outcome||{}),{id,outcomeId:id,outcome_id:id,createdAt:outcome&&outcome.createdAt||nowIso()});
      if(mode==='demo')return demoCommit('local_demo_outcomes',value,Object.assign({},options,{id,source:options.source||'outcome-workflow'}));
      const body=options.requestBody||{action_id:value.action_id||value.actionId||undefined,event_id:value.event_id||value.eventId,unit_id:value.unit_id||value.unitId||value.district,observed_impacts:value.observed_impacts||value.observedImpacts||{observed:value.observed,action:value.action,notes:value.notes},verification_sources:value.verification_sources||value.verificationSources||[],reviewer_id:value.reviewer_id||value.reviewerId};
      return backend('operations.outcomes.create',{body},options);
    },
    async get(outcomeId,options){const mode=modeOf(options);if(mode==='demo')return demoRead('local_demo_outcomes',outcomeId,options);return requireBackendMethod('outcomes','get');},
    async list(options){const mode=modeOf(options);if(mode==='demo')return demoList('local_demo_outcomes',options);return requireBackendMethod('outcomes','list');}
  }});

  define('operationalState',{section:'operations',endpoints:['operations.state'],demoStores:['local_demo_operational_states'],methods:{
    async get(query,options){const mode=modeOf(options);if(mode==='backend')return backend('operations.state',{query:query||{}},options);const id=idOf(query,['stateId','id'],'AGN-OPS-STATE');return demoCommit('local_demo_operational_states',Object.assign({stateId:id,capturedAt:nowIso()},clone(query||{})),Object.assign({},options,{id}));},
    async list(options){const mode=modeOf(options);if(mode==='demo')return demoList('local_demo_operational_states',options);return requireBackendMethod('operationalState','list');}
  }});

  define('modelExperiments',{section:'modelab',endpoints:['modelLab.verification.run','modelLab.skill'],demoStores:['local_demo_model_experiments'],methods:{
    async save(experiment,options){options=options||{};const mode=modeOf(options);if(mode!=='demo')return requireBackendMethod('modelExperiments','save');const id=idOf(experiment,['experimentId','experiment_id','id'],'AGN-ML-EXP');const value=Object.assign({},clone(experiment||{}),{id,experimentId:id,experiment_id:id,createdAt:experiment&&experiment.createdAt||experiment&&experiment.created_at||nowIso()});return demoCommit('local_demo_model_experiments',value,Object.assign({},options,{id,source:options.source||'model-lab-workflow'}));},
    async list(options){const mode=modeOf(options);if(mode==='demo')return demoList('local_demo_model_experiments',options);return requireBackendMethod('modelExperiments','list');},
    async runVerification(request,options){if(modeOf(options)!=='backend')throw repoError('BACKEND_REQUIRED','Model verification runs require the backend verification service.');return backend('modelLab.verification.run',{body:request||{}},options);},
    async skill(query,options){if(modeOf(options)!=='backend')throw repoError('BACKEND_REQUIRED','Verified model skill requires the backend skill service.');return backend('modelLab.skill',{query:query||{}},options);}
  }});

  define('hybridExperiments',{section:'hybridlab',endpoints:['hybridLab.experiments.create'],demoStores:['local_demo_hybrid_experiments'],methods:{
    async create(experiment,options){options=options||{};const mode=modeOf(options);const id=idOf(experiment,['experimentId','experiment_id','id'],'AGN-HYB-EXP');const value=Object.assign({},clone(experiment||{}),{id,experimentId:id,experiment_id:id,createdAt:experiment&&experiment.createdAt||nowIso()});if(mode==='demo')return demoCommit('local_demo_hybrid_experiments',value,Object.assign({},options,{id,source:options.source||'hybrid-lab-workflow'}));return backend('hybridLab.experiments.create',{body:options.requestBody||experiment||{}},options);},
    async list(options){const mode=modeOf(options);if(mode==='demo')return demoList('local_demo_hybrid_experiments',options);return requireBackendMethod('hybridExperiments','list');}
  }});

  define('riskExplanations',{section:'airisk',endpoints:['airisk.explain'],demoStores:['local_demo_risk_explanations'],methods:{
    async create(request,options){options=options||{};const mode=modeOf(options);if(mode==='backend')return backend('airisk.explain',{body:request||{}},options);const id=idOf(request,['explanationId','id'],'AGN-EXPLAIN');const value={id,explanationId:id,createdAt:nowIso(),audience:request&&request.audience||'technical',summary:request&&request.summary||'Deterministic frontend explanation only.',drivers:request&&request.drivers||[],limitations:(request&&request.limitations||[]).concat(['Backend evidence retrieval and language-model service not connected.']),sourceReferences:request&&request.sourceReferences||[],request:clone(request||{})};return demoCommit('local_demo_risk_explanations',value,Object.assign({},options,{id,source:options.source||'risk-workflow'}));},
    async list(options){const mode=modeOf(options);if(mode==='demo')return demoList('local_demo_risk_explanations',options);return requireBackendMethod('riskExplanations','list');}
  }});

  function diagnostics(){const out={};repositories.forEach((r,name)=>{out[name]=Object.assign({name,section:r.section,endpoints:r.endpoints.slice(),demoStores:r.demoStores.slice(),methods:Object.keys(r.methods),backendConfigured:!!(AGN.backendInterfaces&&AGN.backendInterfaces.config&&AGN.backendInterfaces.config.baseUrl)},clone(stats.get(name)));});return {registered:repositories.size,defaultMode:config.defaultMode,allowDemo:config.allowDemo,repositories:out};}
  AGN.repositories={define,get,require:requireRepo,names,configure:function(options){Object.assign(config,options||{});return diagnostics();},invoke,diagnostics,snapshot:function(){return clone(diagnostics());},errors:{repoError}};
  AGN.architecture=Object.assign({},AGN.architecture,{repositories:'endpoint-specific backend and explicit offline-demo repositories for evidence, actions, outcomes and experiments'});
})(window);
