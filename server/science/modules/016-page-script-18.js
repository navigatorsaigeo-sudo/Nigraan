(function (global) {
  'use strict';
  const AGN=global.AGN=global.AGN||{};
  const workflows=new Map(),stats=new Map();
  const transitions={open:['acknowledged','escalated','closed'],acknowledged:['escalated','closed'],escalated:['acknowledged','closed'],closed:[]};
  function clone(v){if(v==null)return v;try{return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}catch(_){return v;}}
  function nowIso(){return new Date().toISOString();}
  function flowError(code,message,details){const e=new Error(message);e.name='AGNWorkflowError';e.code=code;e.details=clone(details||null);return e;}
  function define(name,definition){if(workflows.has(name))throw new Error('Workflow already defined: '+name);const d=definition||{};const r=Object.freeze({name,section:d.section||name,source:d.source||'core/17-workflows.js',repositories:Object.freeze((d.repositories||[]).slice()),methods:Object.freeze(Object.assign({},d.methods||{}))});workflows.set(name,r);stats.set(name,{calls:0,successes:0,failures:0,lastMethod:null,lastMode:null,lastAt:null,lastError:null,lastDurationMs:null});return r;}
  function get(name){return workflows.get(name)||null;}
  function requireFlow(name){const r=get(name);if(!r)throw flowError('WORKFLOW_NOT_FOUND','Workflow is not registered: '+name);const api={name:r.name,section:r.section,repositories:r.repositories.slice()};Object.keys(r.methods).forEach(method=>api[method]=function(){return invoke(name,method,Array.from(arguments));});return Object.freeze(api);}
  async function invoke(name,method,args){const r=get(name);if(!r)throw flowError('WORKFLOW_NOT_FOUND','Workflow is not registered: '+name);const fn=r.methods[method];if(typeof fn!=='function')throw flowError('WORKFLOW_METHOD_NOT_FOUND','Workflow method is not registered: '+name+'.'+method);const s=stats.get(name),started=Date.now(),options=args&&args.length&&args[args.length-1]&&typeof args[args.length-1]==='object'?args[args.length-1]:{};s.calls++;s.lastMethod=method;s.lastMode=options&&options.demo===true?'demo':options&&options.mode||'backend';s.lastAt=nowIso();try{const result=await fn.apply(null,args);s.successes++;s.lastDurationMs=Date.now()-started;s.lastError=null;if(AGN.events)AGN.events.emit('workflow:success',{workflow:name,method,mode:s.lastMode,durationMs:s.lastDurationMs});return result;}catch(e){s.failures++;s.lastDurationMs=Date.now()-started;s.lastError=String(e&&e.message||e);if(AGN.events)AGN.events.emit('workflow:error',{workflow:name,method,mode:s.lastMode,error:s.lastError,code:e&&e.code||null});throw e;}}
  function ensureDemoLabel(result){if(result&&result.mode==='demo')result.workflowStatus='demo_non_operational';return result;}
  function repo(name){if(!AGN.repositories)throw flowError('REPOSITORY_REGISTRY_UNAVAILABLE','Repository registry is unavailable.');return AGN.repositories.require(name);}

  define('assessments',{section:'assessments',repositories:['assessmentEvidence'],methods:{
    async createEvidence(evidence,options){const result=await repo('assessmentEvidence').create(evidence,options||{});if(AGN.events)AGN.events.emit('assessment:evidence:stored',{mode:result.mode,calculationId:result.data&&result.data.calculationId||result.data&&result.data.calculation_id||null});return ensureDemoLabel(result);},
    async retrieveEvidence(calculationId,options){return ensureDemoLabel(await repo('assessmentEvidence').get(calculationId,options||{}));},
    async listEvidence(options){return ensureDemoLabel(await repo('assessmentEvidence').list(options||{}));}
  }});

  define('actions',{section:'operations',repositories:['actions'],methods:{
    async create(action,options){if(!action||!action.hazard)throw flowError('ACTION_HAZARD_REQUIRED','Action creation requires a hazard.');if(!action.unit_id&&!action.unit_name&&!action.unitId)throw flowError('ACTION_UNIT_REQUIRED','Action creation requires a resolved unit.');return ensureDemoLabel(await repo('actions').create(action,options||{}));},
    async transition(actionId,status,options){options=options||{};const currentStatus=options.currentStatus||'open';if(!(transitions[currentStatus]||[]).includes(status))throw flowError('ACTION_TRANSITION_INVALID','Action transition is not allowed: '+currentStatus+' → '+status,{currentStatus,status});const patch={version:options.version,status,note:options.note||'',approval:options.approval||undefined};return ensureDemoLabel(await repo('actions').update(actionId,patch,options));},
    async list(options){return ensureDemoLabel(await repo('actions').list(options||{}));},
    async get(actionId,options){return ensureDemoLabel(await repo('actions').get(actionId,options||{}));}
  }});

  define('outcomes',{section:'operations',repositories:['outcomes'],methods:{
    async record(outcome,options){if(!outcome||(!outcome.event_id&&!outcome.eventId))throw flowError('OUTCOME_EVENT_REQUIRED','Post-event outcome requires an event identifier.');if(!outcome.unit_id&&!outcome.unitId&&!outcome.district)throw flowError('OUTCOME_UNIT_REQUIRED','Post-event outcome requires a resolved unit.');return ensureDemoLabel(await repo('outcomes').create(outcome,options||{}));},
    async list(options){return ensureDemoLabel(await repo('outcomes').list(options||{}));}
  }});

  define('modelExperiments',{section:'modelab',repositories:['modelExperiments'],methods:{
    async save(snapshot,options){return ensureDemoLabel(await repo('modelExperiments').save(snapshot,Object.assign({demo:true},options||{})));},
    async list(options){return ensureDemoLabel(await repo('modelExperiments').list(Object.assign({demo:true},options||{})));},
    async submitVerification(request,options){return repo('modelExperiments').runVerification(request,Object.assign({mode:'backend'},options||{}));},
    async retrieveSkill(query,options){return repo('modelExperiments').skill(query,Object.assign({mode:'backend'},options||{}));}
  }});

  define('hybridExperiments',{section:'hybridlab',repositories:['hybridExperiments'],methods:{
    async create(experiment,options){return ensureDemoLabel(await repo('hybridExperiments').create(experiment,options||{}));},
    async list(options){return ensureDemoLabel(await repo('hybridExperiments').list(Object.assign({demo:true},options||{})));}
  }});

  define('riskExplanations',{section:'airisk',repositories:['riskExplanations'],methods:{
    async explain(request,options){if(!request||!request.hazard_result)throw flowError('HAZARD_RESULT_REQUIRED','Risk explanation requires a structured hazard result.');return ensureDemoLabel(await repo('riskExplanations').create(request,options||{}));},
    async list(options){return ensureDemoLabel(await repo('riskExplanations').list(Object.assign({demo:true},options||{})));}
  }});

  define('operationalState',{section:'operations',repositories:['operationalState'],methods:{
    async load(query,options){return ensureDemoLabel(await repo('operationalState').get(query,options||{}));},
    async listDemo(options){return ensureDemoLabel(await repo('operationalState').list(Object.assign({demo:true},options||{})));}
  }});

  function diagnostics(){const out={};workflows.forEach((r,name)=>out[name]=Object.assign({name,section:r.section,repositories:r.repositories.slice(),methods:Object.keys(r.methods)},clone(stats.get(name))));return {registered:workflows.size,workflows:out,actionTransitions:clone(transitions)};}
  AGN.workflows={define,get,require:requireFlow,invoke,diagnostics,snapshot:function(){return clone(diagnostics());},transitions:clone(transitions),errors:{flowError}};
  AGN.architecture=Object.assign({},AGN.architecture,{workflows:'explicit backend or non-operational demo workflows for assessments, actions, outcomes, evidence and experiments'});
})(window);
