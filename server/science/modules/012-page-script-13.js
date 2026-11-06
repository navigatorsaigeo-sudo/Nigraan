(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const adapters = new Map();
  const stores = new Map();
  const stats = { reads:0, writes:0, appends:0, removes:0, failures:0, denied:0, lastAt:null, lastStore:null, lastError:null };
  const config = { defaultAdapter:'memory', allowBrowserDemo:true, namespace:'agn.v81.0', backendAdapter:'backend' };
  const memoryData = new Map();

  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') { try { return structuredClone(value); } catch (_) {} }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }
  function nowIso() { return new Date().toISOString(); }
  function uid(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return prefix + '-' + global.crypto.randomUUID();
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
  }
  function stable(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stable(value[k])).join(',') + '}';
  }
  async function integrityTag(value) {
    const text = stable(value);
    try {
      if (global.crypto && global.crypto.subtle && typeof TextEncoder !== 'undefined') {
        const digest = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return { algorithm:'SHA-256', value:Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('') };
      }
    } catch (_) {}
    let h=2166136261; for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);} return { algorithm:'FNV-1a-32-diagnostic', value:(h>>>0).toString(16).padStart(8,'0') };
  }
  function safeStorage(kind) { try { return kind === 'local' ? global.localStorage || null : global.sessionStorage || null; } catch (_) { return null; } }
  function memoryStore(name) { if (!memoryData.has(name)) memoryData.set(name,new Map()); return memoryData.get(name); }
  function serializedAdapter(kind) {
    return {
      available:function(){return !!safeStorage(kind);},
      async get(store,key){const s=safeStorage(kind);if(!s)return null;try{return clone(JSON.parse(s.getItem(config.namespace+'.'+store+'.'+key)||'null'));}catch(_){return null;}},
      async put(store,key,value){const s=safeStorage(kind);if(!s)throw persistenceError('PERSISTENCE_ADAPTER_UNAVAILABLE',kind+'Storage is unavailable.');s.setItem(config.namespace+'.'+store+'.'+key,JSON.stringify(value));return clone(value);},
      async remove(store,key){const s=safeStorage(kind);if(!s)return false;s.removeItem(config.namespace+'.'+store+'.'+key);return true;},
      async list(store){const s=safeStorage(kind);if(!s)return[];const prefix=config.namespace+'.'+store+'.';const out=[];for(let i=0;i<s.length;i++){const k=s.key(i);if(k&&k.startsWith(prefix)){try{out.push(JSON.parse(s.getItem(k)));}catch(_){}}}return clone(out);}
    };
  }
  function persistenceError(code,message,details) { const e=new Error(message);e.name='AGNPersistenceError';e.code=code;e.details=details||null;return e; }
  function registerAdapter(name,adapter,options) {
    if (!name || !adapter) throw new Error('Persistence adapter name and implementation are required.');
    const required=['get','put','remove','list']; const missing=required.filter(x=>typeof adapter[x]!=='function'); if(missing.length)throw new Error('Persistence adapter '+name+' missing: '+missing.join(', '));
    adapters.set(name,{name,api:Object.freeze(adapter),source:options&&options.source||null,demoOnly:!!(options&&options.demoOnly),registeredAt:nowIso()}); return adapter;
  }
  function defineStore(name,policy) {
    policy=policy||{};
    stores.set(name,Object.freeze({
      name,
      adapter:policy.adapter||config.defaultAdapter,
      backendRequired:policy.backendRequired !== false,
      demoAllowed:!!policy.demoAllowed,
      immutable:!!policy.immutable,
      audit:policy.audit !== false,
      retention:policy.retention||'not specified',
      idField:policy.idField||'id',
      endpoint:policy.endpoint||null,
      contract:policy.contract||null,
      description:policy.description||''
    }));
    return stores.get(name);
  }
  function getStore(name){return stores.get(name)||null;}
  function getAdapter(name){const record=adapters.get(name);return record&&record.api||null;}
  function configure(options){Object.assign(config,options||{});return diagnostics();}
  async function identityContext(options) {
    if (options && options.identity) return clone(options.identity);
    if (AGN.identity && typeof AGN.identity.resolve==='function') return AGN.identity.resolve(options||{});
    const user=AGN.store&&AGN.store.select?AGN.store.select('user')||{}:{};
    return {tenantId:user.tenantId||null,actor:user.id?{id:user.id,roles:user.roles||[],scopes:user.scopes||[]}:null,sessionId:user.sessionId||null,authenticated:!!user.authenticated,trusted:!!user.trusted};
  }
  function policyAdapter(policy,options){return options&&options.adapter||policy.adapter||config.defaultAdapter;}
  async function authorizeWrite(policy,options,identity){
    const adapterName=policyAdapter(policy,options);
    const record=adapters.get(adapterName);
    if(!record)throw persistenceError('PERSISTENCE_ADAPTER_UNAVAILABLE','Persistence adapter is not registered: '+adapterName);
    const demo=!!(options&&options.demo);
    if(policy.backendRequired && adapterName!==config.backendAdapter && !(demo&&policy.demoAllowed&&config.allowBrowserDemo)){
      stats.denied+=1;throw persistenceError('PERSISTENCE_BACKEND_REQUIRED','Backend persistence is required for store '+policy.name+'.',{store:policy.name,requiredAdapter:config.backendAdapter});
    }
    if(record.demoOnly && !demo){stats.denied+=1;throw persistenceError('DEMO_PERSISTENCE_EXPLICIT_OPT_IN_REQUIRED','Browser persistence requires explicit demo:true.',{store:policy.name,adapter:adapterName});}
    if(policy.backendRequired && (!identity||!identity.authenticated||!identity.tenantId)){
      stats.denied+=1;throw persistenceError('PERSISTENCE_AUTH_REQUIRED','Authenticated tenant context is required for '+policy.name+'.',{store:policy.name});
    }
    return {adapterName,adapter:record.api};
  }
  async function envelope(policy,record,options,identity,existing) {
    options=options||{};
    const id=options.id||record&&record[policy.idField]||record&&record.id||uid('rec');
    const now=nowIso();
    const data=clone(record||{});
    const version=existing?Number(existing.version||0)+1:Number(options.version||1);
    const audit={
      tenantId:identity&&identity.tenantId||null,
      actorId:identity&&identity.actor&&identity.actor.id||null,
      sessionId:identity&&identity.sessionId||null,
      source:options.source||'frontend',
      requestId:options.requestId||uid('persist'),
      contract:options.contract||policy.contract||null,
      createdAt:existing&&existing.audit&&existing.audit.createdAt||now,
      updatedAt:now
    };
    const payload={id,store:policy.name,version,immutable:policy.immutable,data,audit};
    payload.integrity=await integrityTag({id:payload.id,store:payload.store,version:payload.version,data:payload.data,audit:payload.audit});
    return payload;
  }
  async function read(storeName,key,options){
    const policy=getStore(storeName);if(!policy)throw persistenceError('PERSISTENCE_STORE_UNKNOWN','Unknown persistence store: '+storeName);
    const adapter=getAdapter(policyAdapter(policy,options));if(!adapter)throw persistenceError('PERSISTENCE_ADAPTER_UNAVAILABLE','Adapter unavailable for '+storeName);
    stats.reads+=1;stats.lastAt=nowIso();stats.lastStore=storeName;try{return await adapter.get(storeName,key);}catch(e){stats.failures+=1;stats.lastError=String(e.message||e);throw e;}
  }
  async function list(storeName,options){
    const policy=getStore(storeName);if(!policy)throw persistenceError('PERSISTENCE_STORE_UNKNOWN','Unknown persistence store: '+storeName);
    const adapter=getAdapter(policyAdapter(policy,options));if(!adapter)throw persistenceError('PERSISTENCE_ADAPTER_UNAVAILABLE','Adapter unavailable for '+storeName);
    stats.reads+=1;stats.lastAt=nowIso();stats.lastStore=storeName;try{return await adapter.list(storeName);}catch(e){stats.failures+=1;stats.lastError=String(e.message||e);throw e;}
  }
  async function commit(storeName,record,options){
    options=options||{};const policy=getStore(storeName);if(!policy)throw persistenceError('PERSISTENCE_STORE_UNKNOWN','Unknown persistence store: '+storeName);
    const identity=await identityContext(options);const access=await authorizeWrite(policy,options,identity);
    const key=options.id||record&&record[policy.idField]||record&&record.id||uid('rec');
    const existing=await access.adapter.get(storeName,key);
    if(policy.immutable&&existing)throw persistenceError('IMMUTABLE_RECORD_EXISTS','Immutable record already exists: '+key,{store:storeName,id:key});
    if(existing&&options.expectedVersion!=null&&Number(existing.version)!==Number(options.expectedVersion))throw persistenceError('PERSISTENCE_VERSION_CONFLICT','Optimistic-lock version mismatch.',{expected:options.expectedVersion,actual:existing.version});
    const value=await envelope(policy,Object.assign({},record,{[policy.idField]:key}),Object.assign({},options,{id:key}),identity,existing);
    stats.writes+=1;stats.lastAt=nowIso();stats.lastStore=storeName;stats.lastError=null;
    try{const saved=await access.adapter.put(storeName,key,value);if(AGN.events)AGN.events.emit('persistence:commit',{store:storeName,id:key,version:value.version,adapter:access.adapterName});return saved;}catch(e){stats.failures+=1;stats.lastError=String(e.message||e);throw e;}
  }
  async function append(storeName,event,options){
    options=options||{};stats.appends+=1;return commit(storeName,event,Object.assign({},options,{id:options.id||uid('evt')}));
  }
  async function remove(storeName,key,options){
    options=options||{};const policy=getStore(storeName);if(!policy)throw persistenceError('PERSISTENCE_STORE_UNKNOWN','Unknown persistence store: '+storeName);
    if(policy.immutable)throw persistenceError('IMMUTABLE_RECORD_REMOVE_DENIED','Immutable store records cannot be removed.',{store:storeName,id:key});
    const identity=await identityContext(options);const access=await authorizeWrite(policy,options,identity);stats.removes+=1;stats.lastAt=nowIso();stats.lastStore=storeName;return access.adapter.remove(storeName,key);
  }
  function syncEndpointPolicies(endpoints){
    (endpoints||[]).forEach(endpoint=>{const p=endpoint.persistence||{};if(!p.required||!p.store||p.store==='none'||stores.has(p.store))return;defineStore(p.store,{adapter:config.backendAdapter,backendRequired:true,immutable:!!p.immutable,audit:!!p.audit,retention:p.retention||'not specified',endpoint:endpoint.id,contract:endpoint.response&&endpoint.response.dataContract||null,description:endpoint.title||endpoint.id});});
    return diagnostics();
  }
  function diagnostics(){
    const a={};adapters.forEach((r,name)=>{a[name]={name,available:typeof r.api.available==='function'?!!r.api.available():true,demoOnly:r.demoOnly,source:r.source};});
    const s={};stores.forEach((p,name)=>{s[name]=clone(p);});
    return {configured:true,defaultAdapter:config.defaultAdapter,backendAdapter:config.backendAdapter,allowBrowserDemo:config.allowBrowserDemo,adapters:a,stores:s,stats:clone(stats)};
  }

  registerAdapter('memory',{
    available:function(){return true;},
    async get(store,key){return clone(memoryStore(store).get(key)||null);},
    async put(store,key,value){memoryStore(store).set(key,clone(value));return clone(value);},
    async remove(store,key){return memoryStore(store).delete(key);},
    async list(store){return clone(Array.from(memoryStore(store).values()));}
  },{source:'core/15-persistence-adapters.js'});
  registerAdapter('session',serializedAdapter('session'),{source:'core/15-persistence-adapters.js',demoOnly:true});
  registerAdapter('localDemo',serializedAdapter('local'),{source:'core/15-persistence-adapters.js',demoOnly:true});
  registerAdapter('backend',{
    available:function(){return !!(AGN.backendInterfaces&&AGN.backendInterfaces.config&&AGN.backendInterfaces.config.baseUrl);},
    async get(){throw persistenceError('BACKEND_ADAPTER_ENDPOINT_REQUIRED','Generic backend reads require an endpoint-specific repository.');},
    async put(){throw persistenceError('BACKEND_ADAPTER_ENDPOINT_REQUIRED','Generic backend writes require an endpoint-specific repository.');},
    async remove(){throw persistenceError('BACKEND_ADAPTER_ENDPOINT_REQUIRED','Generic backend deletes require an endpoint-specific repository.');},
    async list(){throw persistenceError('BACKEND_ADAPTER_ENDPOINT_REQUIRED','Generic backend lists require an endpoint-specific repository.');}
  },{source:'core/15-persistence-adapters.js'});

  defineStore('local_demo_actions',{adapter:'session',backendRequired:false,demoAllowed:true,immutable:false,audit:true,retention:'browser session only',description:'Non-operational action UI demonstration records.'});
  defineStore('local_demo_reviews',{adapter:'session',backendRequired:false,demoAllowed:true,immutable:false,audit:true,retention:'browser session only',description:'Non-operational review UI demonstration records.'});
  defineStore('local_demo_experiments',{adapter:'session',backendRequired:false,demoAllowed:true,immutable:false,audit:true,retention:'browser session only',description:'Non-operational experiment UI records.'});
  defineStore('frontend_cache',{adapter:'memory',backendRequired:false,demoAllowed:true,immutable:false,audit:false,retention:'runtime only',description:'Transient frontend cache.'});

  AGN.persistence={configure,registerAdapter,defineStore,getStore,getAdapter,read,list,commit,append,remove,syncEndpointPolicies,diagnostics,snapshot:function(){return clone(diagnostics());},integrityTag};
  AGN.architecture=Object.assign({},AGN.architecture,{persistence:'policy-controlled memory, browser-demo and backend persistence adapters with audit metadata and safe backend-required failures'});
})(window);
