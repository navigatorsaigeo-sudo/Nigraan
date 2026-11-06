(function(global){
  'use strict';
  const AGN=global.AGN=global.AGN||{};
  const state={mode:'disconnected',profileId:'offline',baseUrl:null,lastHealth:null,lastProbe:null,lastError:null,connectedAt:null};

  const DEFAULT_URL=(function(){
    try{
      if(typeof window!=='undefined'&&window.AGN_BACKEND_URL) return String(window.AGN_BACKEND_URL);
      var m=document.querySelector('meta[name="agn-backend-url"]');
      if(m&&m.content) return m.content;
    }catch(_){}
    return '/api';
  })();
  const ALL_SCOPES=['hazards:read','forecast:read','evidence:read','units:read','model-verification:read','risk:explain','assessments:write','hybrid-experiments:write','operations:read','actions:write','outcomes:write','actions:approve','model-verification:write','providers:read','forecast:write','national-runs:read','ingestion-jobs:read','ingestion-jobs:write','ingestion-schedules:read','ingestion-schedules:write','observability:read','observability:write','ingestion-workers:read','ingestion-workers:write','provider-quotas:read','provider-quotas:write','ingestion-replay:write','quality:read','quality:evaluate','promotions:read','promotions:write','promotions:scientific-review','promotions:operations-review','promotions:revoke','security:posture:read','security:policies:read','security:identity:read','security:access:evaluate','audit:read','audit:export','secrets:read','secrets:validate','migrations:read','migrations:plan','acceptance:read','acceptance:write','backups:write','resilience:write','uat:read','uat:write','handover:read','handover:write','urban-heat:read','urban-heat:estimate'];
  function clone(v){try{return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}catch(_){return v;}}
  function emit(reason){if(AGN.events)AGN.events.emit('integration:change',{reason,state:diagnostics()});}
  function configureProfile(baseUrl){
    const url=String(baseUrl||DEFAULT_URL).replace(/\/$/,'');
    const current=AGN.connectionProfiles&&AGN.connectionProfiles.get?AGN.connectionProfiles.get('development'):null;
    const definition=Object.assign({},current||{}, {label:'Local integration backend',environment:'development',baseUrl:url,healthPath:'/health',apiVersion:'1.0',authMode:'bearer',timeoutMs:15000,retry:{maxAttempts:2,baseDelayMs:200,maxDelayMs:1200,jitter:0.1},sync:{enabled:true,batchSize:10,maxQueue:250,conflictPolicy:'manual'},metadata:Object.assign({},current&&current.metadata||{},{description:'Local integration backend. Development only.',maxConcurrent:6,minSpacingMs:20})});
    if(AGN.connectionProfiles&&AGN.connectionProfiles.replace)AGN.connectionProfiles.replace('development',definition);
    if(AGN.connectionProfiles&&AGN.connectionProfiles.select)AGN.connectionProfiles.select('development');
    state.profileId='development';state.baseUrl=url;return url;
  }
  function setDevelopmentIdentity(options){
    options=options||{};
    if(!AGN.identity||!AGN.identity.setSession)throw new Error('Identity boundary is unavailable.');
    AGN.identity.configure({mode:'development-token',issuer:'agn-dev-backend',audience:'agn-nigraan',persistSession:false,tokenProvider:async()=>options.token||'agn-dev-token'});
    AGN.identity.setSession({sessionId:'dev-session-'+Date.now(),tenantId:options.tenantId||'agn-development',authenticated:true,trusted:true,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+8*60*60*1000).toISOString(),issuer:'agn-dev-backend',audience:'agn-nigraan',authMethod:'development-token',token:options.token||'agn-dev-token',source:'v80-integration-console',actor:{id:options.actorId||'dev-admin',name:'Development Administrator',roles:['admin'],scopes:ALL_SCOPES}}, {reason:'v80-local-integration'});
  }
  async function connectLocal(options){
    options=options||{};state.lastError=null;
    try{
      configureProfile(options.baseUrl||DEFAULT_URL);setDevelopmentIdentity(options);
      const health=await AGN.connectionProfiles.healthCheck('development',{timeoutMs:5000});
      state.lastHealth=health;
      if(health.status!=='healthy'&&health.status!=='degraded')throw Object.assign(new Error('Local integration backend is not healthy.'),{code:'INTEGRATION_BACKEND_UNHEALTHY'});
      state.mode='development-connected';state.connectedAt=new Date().toISOString();emit('connected');return diagnostics();
    }catch(error){state.mode='error';state.lastError=String(error&&error.message||error);emit('connect-failed');throw error;}
  }
  function disconnect(){
    if(AGN.identity&&AGN.identity.clearSession)AGN.identity.clearSession('v80-integration-disconnect');
    if(AGN.connectionProfiles&&AGN.connectionProfiles.select)AGN.connectionProfiles.select('offline',{allowIncomplete:true});
    Object.assign(state,{mode:'disconnected',profileId:'offline',baseUrl:null,lastHealth:null,lastProbe:null,lastError:null,connectedAt:null});emit('disconnected');return diagnostics();
  }
  async function health(){
    if(!AGN.connectionProfiles)throw new Error('Connection profiles unavailable.');
    const result=await AGN.connectionProfiles.healthCheck(state.profileId==='development'?'development':undefined,{timeoutMs:5000});state.lastHealth=result;emit('health');return result;
  }
  async function probe(options){
    options=options||{};
    if(state.mode!=='development-connected')await connectLocal(options);
    const today=new Date().toISOString().slice(0,10);
    const tests=[];
    async function run(name,fn){const started=Date.now();try{const value=await fn();tests.push({name,ok:true,durationMs:Date.now()-started,summary:value&&value.contract&&value.contract.id||'ok'});}catch(error){tests.push({name,ok:false,durationMs:Date.now()-started,code:error&&error.code||error&&error.name||'ERROR',message:String(error&&error.message||error)});}}
    await run('production handover posture',()=>AGN.backendInterfaces.request('handover.posture',{}));
    await run('operational handover checklist',()=>AGN.backendInterfaces.request('handover.checklist',{}));
    await run('staging acceptance posture',()=>AGN.backendInterfaces.request('acceptance.posture',{}));
    await run('acceptance scenarios',()=>AGN.backendInterfaces.request('acceptance.scenarios.list',{}));
    await run('enterprise security posture',()=>AGN.backendInterfaces.request('security.posture',{}));
    await run('identity diagnostics',()=>AGN.backendInterfaces.request('security.identity.diagnostics',{}));
    await run('national cache',()=>AGN.backendInterfaces.request('live.nationalCache',{}));
    await run('provider registry',()=>AGN.backendInterfaces.request('system.providers',{query:{probe:false}}));
    await run('urban heat posture',()=>AGN.backendInterfaces.request('urbanHeat.posture',{}));
    await run('urban heat profiles',()=>AGN.backendInterfaces.request('urbanHeat.profiles',{}));
    await run('ingestion metrics',()=>AGN.backendInterfaces.request('ingestion.observability.metrics',{}));
    await run('worker registry',()=>AGN.backendInterfaces.request('ingestion.workers.list',{}));
    await run('provider quotas',()=>AGN.backendInterfaces.request('ingestion.quotas.list',{}));
    await run('unit search',()=>AGN.backendInterfaces.request('shared.units.search',{query:{q:'Islamabad',level:'all',limit:5}}));
    await run('point forecast',()=>AGN.backendInterfaces.request('live.pointForecast',{query:{latitude:33.6844,longitude:73.0479,variables:['temperature_2m','precipitation'],models:['best_match'],lead_hours:[0,24]}}));
    await run('national hazards',()=>AGN.backendInterfaces.request('overview.nationalHazards',{path:{hazard:'heat'},query:{valid_date:today,lead_hours:0,level:'district',limit:5}}));
    await run('operational state',()=>AGN.backendInterfaces.request('operations.state',{query:{unit_id:'islamabad',horizon:'now',hazards:['heat','flood']}}));
    state.lastProbe={at:new Date().toISOString(),passed:tests.filter(x=>x.ok).length,failed:tests.filter(x=>!x.ok).length,tests};emit('probe');return clone(state.lastProbe);
  }
  function diagnostics(){return clone(Object.assign({},state,{identity:AGN.identity&&AGN.identity.diagnostics?AGN.identity.diagnostics():null,connection:AGN.connectionProfiles&&AGN.connectionProfiles.diagnostics?AGN.connectionProfiles.diagnostics():null}));}
  function render(){
    let back=document.getElementById('agnIntegrationBack');
    if(!back){back=document.createElement('div');back.id='agnIntegrationBack';back.className='agn-integration-back';back.innerHTML='<div class="agn-integration-modal" role="dialog" aria-modal="true" aria-labelledby="agnIntegrationTitle"><button type="button" class="agn-integration-close" aria-label="Close">×</button><div class="agn-integration-eyebrow">V81.0 BACKEND INTEGRATION</div><h2 id="agnIntegrationTitle">Integration candidate console</h2><p class="agn-integration-sub">Connects only to the supplied local development backend. It uses a server-derived development identity and does not represent production OIDC, managed secrets, a managed database, validated model service or operational deployment.</p><label>Local backend URL<input id="agnIntegrationUrl" value="'+DEFAULT_URL+'" /></label><div class="agn-integration-actions"><button type="button" data-action="connect">Connect local backend</button><button type="button" data-action="health">Health check</button><button type="button" data-action="probe">Run contract probe</button><button type="button" data-action="disconnect">Disconnect</button></div><pre id="agnIntegrationStatus"></pre></div>';document.body.appendChild(back);
      back.querySelector('.agn-integration-close').onclick=()=>back.classList.remove('show');back.addEventListener('click',e=>{if(e.target===back)back.classList.remove('show');});
      back.querySelector('[data-action="connect"]').onclick=async()=>{await uiCall(()=>connectLocal({baseUrl:back.querySelector('#agnIntegrationUrl').value}));};
      back.querySelector('[data-action="health"]').onclick=async()=>{await uiCall(()=>health());};
      back.querySelector('[data-action="probe"]').onclick=async()=>{await uiCall(()=>probe({baseUrl:back.querySelector('#agnIntegrationUrl').value}));};
      back.querySelector('[data-action="disconnect"]').onclick=()=>{disconnect();update();};
    }
    update();back.classList.add('show');
  }
  async function uiCall(fn){try{await fn();}catch(error){state.lastError=String(error&&error.message||error);}update();}
  function update(){const el=document.getElementById('agnIntegrationStatus');if(el)el.textContent=JSON.stringify(diagnostics(),null,2);}
  function installButton(){
    if(document.getElementById('agnIntegrationBtn'))return;
    const host=document.querySelector('.topbar .right,.topbar-actions,.top-actions,.topbar')||document.body;
    const btn=document.createElement('button');btn.type='button';btn.id='agnIntegrationBtn';btn.className='agn-integration-btn';btn.textContent='Integration';btn.title='Open backend integration console';btn.onclick=render;host.appendChild(btn);
  }
  AGN.integration={connectLocal,disconnect,health,probe,diagnostics,render,defaultUrl:DEFAULT_URL};
   
  try{ if(/^https?:$/.test(location.protocol) && new URLSearchParams(location.search).get('integration')!=='off'){
    (function tryConnect(k){ fetch(location.origin+'/health',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(h){
      if(!h||h.service!=='nigraan-local') return; return connectLocal({baseUrl:location.origin});
    }).catch(function(e){ try{console.warn('[AGN] local backend connect failed: '+(e&&e.message));}catch(_){} if(k<5) setTimeout(function(){tryConnect(k+1);},5000); }); })(0);
  } }catch(_){}
  AGN.architecture=Object.assign({},AGN.architecture,{integration:'environment-driven local backend integration scaffold with contract probe; production systems remain unconnected'});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton);else installButton();
})(window);