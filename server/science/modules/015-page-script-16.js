(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const profiles = new Map();
  const stats = new Map();
  let activeId = 'offline';

  function clone(v){if(v==null)return v;try{return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}catch(_){return v;}}
  function nowIso(){return new Date().toISOString();}
  function profileError(code,message,details){const e=new Error(message);e.name='AGNConnectionProfileError';e.code=code;e.details=clone(details||null);return e;}
  function normalizeBaseUrl(value){return String(value||'').trim().replace(/\/$/,'');}
  function validate(def){
    const issues=[]; const env=def.environment||'offline'; const url=normalizeBaseUrl(def.baseUrl);
    if(!['offline','demo','development','staging','production'].includes(env))issues.push('Unsupported environment: '+env);
    if(url){
      let parsed=null;try{parsed=new URL(url);}catch(_){issues.push('baseUrl must be an absolute URL.');}
      if(parsed&&['staging','production'].includes(env)&&parsed.protocol!=='https:')issues.push(env+' profiles require HTTPS.');
      if(parsed&&parsed.username)issues.push('Credentials must not be embedded in baseUrl.');
    }
    if(['staging','production'].includes(env)&&!url)issues.push(env+' profiles require baseUrl before activation.');
    if(def.sync&&def.sync.enabled&&(!url||env==='offline'||env==='demo'))issues.push('Synchronisation requires a configured development, staging or production backend.');
    return issues;
  }
  function normalize(id,definition){
    const d=definition||{};
    return Object.freeze({
      id:String(id), label:d.label||String(id), environment:d.environment||'offline', baseUrl:normalizeBaseUrl(d.baseUrl),
      healthPath:d.healthPath||'/health', apiVersion:d.apiVersion||'1.0', authMode:d.authMode||'bearer', timeoutMs:Number(d.timeoutMs||30000),
      retry:Object.freeze(Object.assign({maxAttempts:2,baseDelayMs:350,maxDelayMs:5000,jitter:0.2},d.retry||{})),
      sync:Object.freeze(Object.assign({enabled:false,batchSize:20,maxQueue:500,conflictPolicy:'manual'},d.sync||{})),
      metadata:Object.freeze(Object.assign({},d.metadata||{})), source:d.source||'core/18-connection-profiles.js'
    });
  }
  function define(id,definition){
    if(profiles.has(id))throw profileError('PROFILE_EXISTS','Connection profile already exists: '+id);
    const record=normalize(id,definition); const issues=validate(record);
    profiles.set(id,record); stats.set(id,{selected:0,healthChecks:0,lastSelectedAt:null,lastHealthAt:null,lastHealthStatus:record.baseUrl?'unchecked':'offline',lastLatencyMs:null,lastError:issues.join('; ')||null,valid:issues.length===0});
    return clone(record);
  }
  function replace(id,definition){profiles.delete(id);stats.delete(id);return define(id,definition);}
  function get(id){return profiles.has(id)?clone(profiles.get(id)):null;}
  function list(){return Array.from(profiles.values()).map(clone);}
  function active(){return get(activeId);}
  function apply(record){
    if(AGN.backendInterfaces&&typeof AGN.backendInterfaces.configure==='function')AGN.backendInterfaces.configure({baseUrl:record.baseUrl,apiVersion:record.apiVersion,authMode:record.authMode,timeoutMs:record.timeoutMs,profileId:record.id,retry:clone(record.retry)});
    if(AGN.api&&AGN.api.config){
      if(record.metadata.maxConcurrent!=null)AGN.api.config.maxConcurrent=Number(record.metadata.maxConcurrent);
      if(record.metadata.minSpacingMs!=null)AGN.api.config.minSpacingMs=Number(record.metadata.minSpacingMs);
    }
    if(AGN.store&&typeof AGN.store.set==='function')AGN.store.set({connection:{profileId:record.id,environment:record.environment,configured:!!record.baseUrl,healthStatus:(stats.get(record.id)||{}).lastHealthStatus||'unchecked'}},{reason:'connection-profile-selected'});
  }
  function select(id,options){
    options=options||{}; const record=profiles.get(id); if(!record)throw profileError('PROFILE_NOT_FOUND','Unknown connection profile: '+id);
    const issues=validate(record); if(issues.length&&!options.allowIncomplete)throw profileError('PROFILE_INVALID','Connection profile cannot be activated: '+issues.join(' '),{id,issues});
    activeId=id; const s=stats.get(id);s.selected+=1;s.lastSelectedAt=nowIso();s.valid=issues.length===0;s.lastError=issues.join('; ')||null;apply(record);
    if(AGN.events)AGN.events.emit('connection:profile',{profileId:id,environment:record.environment,configured:!!record.baseUrl});
    return diagnostics();
  }
  async function healthCheck(id,options){
    options=options||{}; id=id||activeId; const record=profiles.get(id); if(!record)throw profileError('PROFILE_NOT_FOUND','Unknown connection profile: '+id);
    const s=stats.get(id);s.healthChecks+=1;s.lastHealthAt=nowIso();
    if(!record.baseUrl){s.lastHealthStatus=record.environment==='demo'?'demo':'offline';s.lastLatencyMs=0;s.lastError=null;return {profileId:id,status:s.lastHealthStatus,latencyMs:0,checkedAt:s.lastHealthAt,configured:false};}
    const url=record.baseUrl+record.healthPath; const started=Date.now(); let timer=null,controller=null;
    try{
      if(global.AbortController){controller=new AbortController();timer=setTimeout(()=>controller.abort(),options.timeoutMs||Math.min(record.timeoutMs,10000));}
      const fetcher=AGN.api&&AGN.api.nativeFetch?AGN.api.nativeFetch:global.fetch.bind(global);
      const response=await fetcher(url,{method:'GET',headers:{Accept:'application/json','X-AGN-Client-Version':(global.AGN_BUILD&&global.AGN_BUILD.version)||AGN.version||global.AGN_VERSION|| 'version-unset','X-AGN-Connection-Profile':id},signal:controller&&controller.signal});
      const latency=Date.now()-started;let payload=null;try{payload=await response.clone().json();}catch(_){}
      const status=response.ok?(payload&&payload.status==='degraded'?'degraded':'healthy'):'unreachable';
      s.lastHealthStatus=status;s.lastLatencyMs=latency;s.lastError=response.ok?null:'HTTP '+response.status;
      if(AGN.store&&AGN.store.set)AGN.store.set({connection:{profileId:id,environment:record.environment,configured:true,healthStatus:status,lastHealthAt:s.lastHealthAt}},{reason:'connection-health'});
      if(AGN.events)AGN.events.emit('connection:health',{profileId:id,status,latencyMs:latency});
      return {profileId:id,status,latencyMs:latency,checkedAt:s.lastHealthAt,configured:true,httpStatus:response.status,data:payload};
    }catch(error){const latency=Date.now()-started;s.lastHealthStatus='unreachable';s.lastLatencyMs=latency;s.lastError=String(error&&error.message||error);if(AGN.events)AGN.events.emit('connection:health',{profileId:id,status:'unreachable',latencyMs:latency,error:s.lastError});return {profileId:id,status:'unreachable',latencyMs:latency,checkedAt:s.lastHealthAt,configured:true,error:s.lastError};}
    finally{if(timer)clearTimeout(timer);}
  }
  function diagnostics(){const out={};profiles.forEach((p,id)=>{out[id]=Object.assign({},clone(p),clone(stats.get(id)),{active:id===activeId,issues:validate(p)});});return {activeProfileId:activeId,active:active(),registered:profiles.size,profiles:out};}

  define('offline',{label:'Offline',environment:'offline',baseUrl:'',healthPath:'',retry:{maxAttempts:1},sync:{enabled:false},metadata:{description:'No backend calls. Local interface and explicit demo workflows only.'}});
  define('demo',{label:'Offline demonstration',environment:'demo',baseUrl:'',healthPath:'',retry:{maxAttempts:1},sync:{enabled:false},metadata:{description:'Browser-session demonstration records. Non-operational.'}});
  define('development',{label:'Development backend',environment:'development',baseUrl:'',healthPath:'/health',retry:{maxAttempts:2},sync:{enabled:true,batchSize:10,maxQueue:250,conflictPolicy:'manual'},metadata:{description:'Developer-configured local or remote backend profile.'}});
  define('staging',{label:'Staging backend',environment:'staging',baseUrl:'',healthPath:'/health',retry:{maxAttempts:3},sync:{enabled:true,batchSize:20,maxQueue:500,conflictPolicy:'manual'},metadata:{description:'HTTPS staging environment. Requires configured identity.'}});
  define('production',{label:'Production backend',environment:'production',baseUrl:'',healthPath:'/health',retry:{maxAttempts:3},sync:{enabled:true,batchSize:25,maxQueue:1000,conflictPolicy:'manual'},metadata:{description:'HTTPS production environment. No browser-demo fallback.'}});
  select('offline',{allowIncomplete:true});

  AGN.connectionProfiles={define,replace,get,list,active,select,healthCheck,validate:function(id){const p=profiles.get(id);return p?validate(p):['Unknown profile'];},diagnostics,snapshot:function(){return clone(diagnostics());},errors:{profileError}};
  AGN.architecture=Object.assign({},AGN.architecture,{connections:'named offline, development, staging and production profiles with health, retry and synchronisation policy; credentials are never stored in profiles'});
})(window);
