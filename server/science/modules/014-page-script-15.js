(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const endpoints = new Map();
  const endpointStats = new Map();
  const sectionGuides = new Map();
  const DEFAULT_API_VERSION = '1.0';
  const MEDIA_TYPE = 'application/vnd.agn+json';
  const config = {
    baseUrl: '',
    apiVersion: DEFAULT_API_VERSION,
    clientVersion: (global.AGN_VERSION || 'version-unset'),    
    timeoutMs: 30000,
    authMode: 'bearer',
    tokenProvider: null,
    tenantProvider: null,
    actorProvider: null,
    headersProvider: null,
    profileId: 'offline',
    retry: { maxAttempts:1, baseDelayMs:350, maxDelayMs:5000, jitter:0.2 }
  };

  function clone(value) {
    if (value == null) return value;
    if (typeof structuredClone === 'function') { try { return structuredClone(value); } catch (_) {} }
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }
  function nowIso() { return new Date().toISOString(); }
  function uid(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return prefix + '-' + global.crypto.randomUUID();
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function asArray(value) { return Array.isArray(value) ? value.slice() : []; }
  function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function typeOk(value, type) {
    if (value == null) return true;
    if (type === 'array') return Array.isArray(value);
    if (type === 'integer') return Number.isInteger(Number(value));
    if (type === 'number') return Number.isFinite(Number(value));
    if (type === 'object') return value && typeof value === 'object' && !Array.isArray(value);
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'date-time') return !Number.isNaN(new Date(value).getTime());
    return typeof value === type;
  }
  function validateFields(fields, values, location) {
    const issues = [];
    const source = asObject(values);
    asArray(fields).forEach(field => {
      const value = source[field.name];
      if (field.required && (value == null || value === '')) issues.push({ path: location + '.' + field.name, code:'required', message: field.name + ' is required.' });
      if (value != null && field.type && !typeOk(value, field.type)) issues.push({ path: location + '.' + field.name, code:'type', message: field.name + ' must be ' + field.type + '.' });
      if (value != null && field.enum && !field.enum.includes(value)) issues.push({ path: location + '.' + field.name, code:'enum', message: field.name + ' must be one of: ' + field.enum.join(', ') + '.' });
      if (value != null && field.min != null && Number(value) < field.min) issues.push({ path: location + '.' + field.name, code:'minimum', message: field.name + ' must be at least ' + field.min + '.' });
      if (value != null && field.max != null && Number(value) > field.max) issues.push({ path: location + '.' + field.name, code:'maximum', message: field.name + ' must be at most ' + field.max + '.' });
    });
    return issues;
  }
  function normalizeField(field) {
    return Object.freeze({
      name: String(field.name), type: field.type || 'string', required: !!field.required,
      enum: field.enum ? asArray(field.enum) : null, min: field.min, max: field.max,
      description: field.description || ''
    });
  }
  

  const GOV_UNSET='UNSET — SPECIFY BEFORE FREEZE';
  function endpointGovernanceDefaults(id,d) {
    d=d||{}; var section=String(d.section||'shared'), method=String(d.method||'GET').toUpperCase();
    var read=(method==='GET'||method==='HEAD');
    var live=['overview','livedata','operations','airisk'].indexOf(section)>=0;
    var climate=(section==='climate'||section==='hybridlab');
    var model=(section==='modelab');
    var staleAfterMinutes = read ? (live?360:model?1440:climate?43200:10080) : null;
    var refresh = read ? (live?'provider-cycle / request-time; staleAfterMinutes is numeric in this contract'
                      : model?'on verified model-run ingest; skill refresh nightly when observations are available'
                      : climate?'on provider/scenario version change; catalogue review at least monthly'
                      :'request-time or source-version change') : 'event-driven on authorized write';
    var cache = read ? (live?'cache allowed only with valid_time, generated_at and stale flag; default TTL 15 minutes for UI responses'
                     :'version-aware cache; invalidate on source or contract version change') : 'no client cache for mutable writes';
    var schedule = read ? (live?'scheduled ingestion follows provider cadence; UI reads normalized backend state'
                        : model?'nightly verification job plus event-driven model-run ingestion'
                        : climate?'provider/scenario update job; no synthetic polling'
                        :'on-demand or source-version job') : 'event-driven';
    return {
      

      purpose:d.purpose || d.description || GOV_UNSET,
      

      responseUnits:d.responseUnits || GOV_UNSET,
      refreshCadence:d.refreshCadence || refresh,
      cachePolicy:d.cachePolicy || cache,
      jobSchedule:d.jobSchedule || schedule,
      providerFallback:d.providerFallback || 'Fail closed by default. Any fallback must be explicitly declared in response provenance; never silently substitute a different scientific product.',
      qualityFlags:Object.freeze((d.qualityFlags||['source_status','stale','provisional','validation_status','evidence_quality']).slice()),
      editableBy:d.editableBy || (read?'system/provider pipeline; governed review where applicable':'authorized role/scoped user; immutable audit history required'),
      reportIntegration:d.reportIntegration || ('Eligible for '+section+' evidence/report sections only when provenance and validation status permit issuance.'),
      evidenceProvenance:d.evidenceProvenance || 'provider/dataset or operator source, run/valid time, resolution, transformation/formula version, quality flag and evidence identifier required for decision-bearing outputs',
      responseShape:d.responseShape || ((d.response&&d.response.collection)?'standard collection envelope':'standard object envelope'),
      staleAfterMinutes:(d.staleAfterMinutes!=null?Number(d.staleAfterMinutes):staleAfterMinutes),
      providerAccess:d.providerAccess || 'production external-provider requests must pass through the server-side provider adapter/proxy; direct browser calls remain prototype-only'
    };
  }
  function defineEndpoint(id, definition) {
    if (endpoints.has(id)) throw new Error('Backend endpoint already defined: ' + id);
    const d = asObject(definition);
    if (!d.section || !d.method || !d.path) throw new Error('Endpoint ' + id + ' requires section, method and path.');
    const gov = endpointGovernanceDefaults(id,d);
    const record = Object.freeze({
      id,
      version: d.version || '1.0.0',
      apiVersion: d.apiVersion || DEFAULT_API_VERSION,
      section: d.section,
      title: d.title || id,
      description: d.description || ((d.service||d.section)+' — '+(d.title||id)+'.'),
      purpose: gov.purpose, responseUnits: gov.responseUnits, refreshCadence: gov.refreshCadence,
      cachePolicy: gov.cachePolicy, jobSchedule: gov.jobSchedule, providerFallback: gov.providerFallback,
      qualityFlags: gov.qualityFlags, editableBy: gov.editableBy, reportIntegration: gov.reportIntegration,
      evidenceProvenance: gov.evidenceProvenance, responseShape: gov.responseShape,
      staleAfterMinutes: gov.staleAfterMinutes, providerAccess: gov.providerAccess,
      service: d.service || '',
      method: String(d.method).toUpperCase(),
      path: d.path,
      auth: Object.freeze({ required: d.auth ? d.auth.required !== false : true, scopes: Object.freeze(asArray(d.auth && d.auth.scopes)), roles: Object.freeze(asArray(d.auth && d.auth.roles)) }),
      request: Object.freeze({
        path: Object.freeze(asArray(d.request && d.request.path).map(normalizeField)),
        query: Object.freeze(asArray(d.request && d.request.query).map(normalizeField)),
        body: Object.freeze(asArray(d.request && d.request.body).map(normalizeField)),
        bodyContract: d.request && d.request.bodyContract || null
      }),
      response: Object.freeze({
        dataContract: d.response && d.response.dataContract || null,
        requiredFields: Object.freeze(asArray(d.response && d.response.requiredFields)),
        collection: !!(d.response && d.response.collection),
        description: d.response && d.response.description || ''
      }),
      pagination: Object.freeze(Object.assign({ mode:'none', defaultLimit:null, maxLimit:null }, d.pagination || {})),
      idempotency: Object.freeze(Object.assign({ required:false, header:'Idempotency-Key' }, d.idempotency || {})),
      persistence: Object.freeze(Object.assign({ required:false, store:'none', retention:'not specified', immutable:false, audit:false }, d.persistence || {})),
      validation: Object.freeze(asArray(d.validation)),
      errors: Object.freeze(asArray(d.errors).map(x => Object.freeze(Object.assign({ retryable:false, httpStatus:400 }, x)))),
      source: d.source || 'core/13-backend-interfaces.js'
    });
    endpoints.set(id, record);
    endpointStats.set(id, { calls:0, successes:0, failures:0, retries:0, validationFailures:0, lastAt:null, lastDurationMs:null, lastStatus:null, lastError:null, lastRequestId:null });
    return record;
  }
  function get(id) { return endpoints.get(id) || null; }
  function list(section) { return Array.from(endpoints.values()).filter(x => !section || x.section === section); }
  function defineGuide(key, guide) { sectionGuides.set(key, Object.freeze(Object.assign({ key, endpoints:[] }, clone(guide || {})))); }
  function guide(key) {
    const g = sectionGuides.get(key) || sectionGuides.get('sequence');
    if (!g) return null;
    return Object.assign({}, clone(g), { endpointDefinitions: asArray(g.endpoints).map(id => clone(get(id))).filter(Boolean) });
  }
  function configure(options) { Object.assign(config, options || {}); return diagnostics(); }
  function storeUser() {
    try { return AGN.store && AGN.store.select ? AGN.store.select('user') || AGN.store.select('context.user') || null : null; } catch (_) { return null; }
  }
  async function resolveContext(options) {
    options = options || {};
    if (AGN.identity && typeof AGN.identity.resolve === 'function') {
      const resolved = await AGN.identity.resolve(options);
      if (resolved) return Object.assign({ token:null, tenantId:null, actor:null, authenticated:false, trusted:false, sessionId:null }, resolved, {
        authenticated: !!(resolved.authenticated || (resolved.token && resolved.actor)),
        trusted: !!resolved.trusted
      });
    }
    const user = storeUser() || {};
    const token = options.token != null ? options.token : (typeof config.tokenProvider === 'function' ? await config.tokenProvider() : null);
    const tenantId = options.tenantId || (typeof config.tenantProvider === 'function' ? await config.tenantProvider() : null) || user.tenantId || user.organizationId || null;
    const actor = options.actor || (typeof config.actorProvider === 'function' ? await config.actorProvider() : null) || (user.id ? { id:user.id, name:user.name || null, roles:asArray(user.roles), scopes:asArray(user.scopes) } : null);
    return { token, tenantId, actor, authenticated:!!(token && actor), trusted:false, sessionId:user.sessionId || null };
  }
  function validateRequest(id, params) {
    const endpoint = get(id); if (!endpoint) throw new Error('Unknown backend endpoint: ' + id);
    const p = params || {};
    let issues = [];
    issues = issues.concat(validateFields(endpoint.request.path, p.path, 'path'));
    issues = issues.concat(validateFields(endpoint.request.query, p.query, 'query'));
    issues = issues.concat(validateFields(endpoint.request.body, p.body, 'body'));
    if (endpoint.request.bodyContract && p.body != null && AGN.contracts) {
      const result = AGN.contracts.validate(endpoint.request.bodyContract, p.body, { boundary:'backend.request', endpoint:id });
      if (!result.ok) issues = issues.concat(result.issues.map(x => ({ path:'body.' + (x.path || ''), code:x.code, message:x.message })));
    }
    return { ok:issues.length === 0, endpoint:id, issues };
  }
  function validateResponse(id, envelope) {
    const endpoint = get(id); if (!endpoint) throw new Error('Unknown backend endpoint: ' + id);
    const issues = [];
    const env = asObject(envelope);
    if (env.apiVersion && env.apiVersion !== endpoint.apiVersion) issues.push({ path:'apiVersion', code:'version_mismatch', message:'Expected API version ' + endpoint.apiVersion + ', received ' + env.apiVersion + '.' });
    const contract = env.contract && (typeof env.contract === 'string' ? env.contract : env.contract.id);
    if (contract && contract !== endpoint.id) issues.push({ path:'contract', code:'contract_mismatch', message:'Expected endpoint contract ' + endpoint.id + ', received ' + contract + '.' });
    endpoint.response.requiredFields.forEach(field => { if (!env.data || env.data[field] == null) issues.push({ path:'data.' + field, code:'required', message:'Response field ' + field + ' is required.' }); });
    if (endpoint.response.collection && env.data != null && !Array.isArray(env.data)) issues.push({ path:'data', code:'type', message:'Response data must be an array.' });
    if (endpoint.response.dataContract && env.data != null && AGN.contracts) {
      const values = endpoint.response.collection ? env.data : [env.data];
      values.forEach((value, index) => {
        const result = AGN.contracts.validate(endpoint.response.dataContract, value, { boundary:'backend.response', endpoint:id, index });
        if (!result.ok) result.issues.forEach(x => issues.push({ path:'data' + (endpoint.response.collection ? '['+index+']' : '') + '.' + (x.path || ''), code:x.code, message:x.message }));
      });
    }
    if (endpoint.pagination.mode !== 'none' && env.pagination) {
      if (env.pagination.limit != null && endpoint.pagination.maxLimit && Number(env.pagination.limit) > endpoint.pagination.maxLimit) issues.push({ path:'pagination.limit', code:'maximum', message:'Pagination limit exceeds ' + endpoint.pagination.maxLimit + '.' });
    }
    return { ok:issues.length === 0, endpoint:id, issues };
  }
  function buildPath(endpoint, pathParams) {
    let path = endpoint.path;
    asArray(endpoint.request.path).forEach(field => { path = path.replace('{' + field.name + '}', encodeURIComponent(pathParams && pathParams[field.name] != null ? pathParams[field.name] : '')); });
    return path;
  }
  function buildQuery(query) {
    const q = new URLSearchParams();
    Object.keys(query || {}).forEach(key => { const v=query[key]; if(v==null||v==='')return; if(Array.isArray(v))v.forEach(x=>q.append(key,x));else q.set(key,v); });
    const text=q.toString();return text?'?'+text:'';
  }
  function standardError(response, payload, endpoint, requestId, traceId) {
    const raw = asObject(payload && (payload.error || (payload.errors && payload.errors[0])));
    const err = new Error(raw.message || ('Backend request failed with HTTP ' + response.status));
    err.name = 'AGNBackendError';
    err.code = raw.code || 'BACKEND_HTTP_' + response.status;
    err.httpStatus = response.status;
    err.retryable = !!raw.retryable || response.status === 429 || response.status >= 500;
    err.details = clone(raw.details || payload || null);
    err.fieldErrors = asArray(raw.fieldErrors);
    err.endpoint = endpoint.id; err.requestId=requestId; err.traceId=traceId;
    return err;
  }
  async function request(id, params, options) {
    const endpoint=get(id); if(!endpoint)throw new Error('Unknown backend endpoint: '+id);
    const stat=endpointStats.get(id); const started=Date.now(); stat.calls+=1; stat.lastAt=started;
    const validation=validateRequest(id,params||{});
    if(!validation.ok){stat.failures+=1;stat.validationFailures+=1;stat.lastStatus='request-invalid';stat.lastError=validation.issues.map(x=>x.path+': '+x.message).join('; ');const e=new Error('Backend request contract failed: '+stat.lastError);e.name='AGNBackendContractError';e.code='REQUEST_CONTRACT_INVALID';e.issues=validation.issues;e.endpoint=id;throw e;}
    if(!config.baseUrl){stat.failures+=1;stat.lastStatus='backend-required';stat.lastError='Backend base URL is not configured.';const e=new Error('Backend required: configure AGN.backendInterfaces before calling '+id);e.name='AGNBackendRequiredError';e.code='BACKEND_NOT_CONFIGURED';e.endpoint=id;e.guide=guide(endpoint.section);throw e;}
    const context=await resolveContext(options); const requestId=(options&&options.requestId)||uid('req'); const traceId=(options&&options.traceId)||uid('trace'); stat.lastRequestId=requestId;
    if(endpoint.auth.required&&!context.token){stat.failures+=1;stat.lastStatus='auth-missing';stat.lastError='Authentication token is required.';const e=new Error('Authentication token required for '+id);e.name='AGNBackendAuthError';e.code='AUTH_REQUIRED';e.endpoint=id;throw e;}
    const decision = AGN.permissions && typeof AGN.permissions.authorize === 'function'
      ? AGN.permissions.authorize({ required:endpoint.auth.required, scopes:endpoint.auth.scopes, roles:endpoint.auth.roles, trusted:endpoint.method!=='GET'&&endpoint.method!=='HEAD' }, context)
      : { allowed:true, missingScopes:[], missingRoles:[], reasons:[] };
    if(!decision.allowed){stat.failures+=1;stat.lastStatus=(decision.reasons&&decision.reasons[0])||'access-denied';stat.lastError='Access denied: '+(decision.reasons||[]).join(', ');const e=new Error(stat.lastError);e.name='AGNBackendAuthError';e.code=(decision.reasons&&decision.reasons[0])||'ACCESS_DENIED';e.scopes=decision.missingScopes||[];e.roles=decision.missingRoles||[];e.endpoint=id;e.decision=decision;throw e;}
    const headers={
      'Accept': MEDIA_TYPE+'; version='+endpoint.apiVersion,
      'X-AGN-API-Version':endpoint.apiVersion,
      'X-AGN-Client-Version':config.clientVersion,
      'X-AGN-Contract':endpoint.id+'@'+endpoint.version,
      'X-Request-ID':requestId,
      'X-Trace-ID':traceId,
      'X-AGN-Connection-Profile':config.profileId||'offline'
    };
    if(endpoint.method!=='GET'&&endpoint.method!=='HEAD')headers['Content-Type']=MEDIA_TYPE+'; version='+endpoint.apiVersion;
    if(context.token)headers.Authorization=(config.authMode==='bearer'?'Bearer ':'')+context.token;
    if(context.tenantId)headers['X-AGN-Tenant-ID']=context.tenantId;
    if(context.actor&&context.actor.id)headers['X-AGN-Actor-ID']=context.actor.id;
    if(context.actor&&Array.isArray(context.actor.roles)&&context.actor.roles.length)headers['X-AGN-Roles']=context.actor.roles.join(',');
    if(context.sessionId)headers['X-AGN-Session-ID']=context.sessionId;
    if(endpoint.idempotency.required)headers[endpoint.idempotency.header]=(options&&options.idempotencyKey)||uid('idem');
    if(typeof config.headersProvider==='function')Object.assign(headers,await config.headersProvider(endpoint,context)||{});
    Object.assign(headers,options&&options.headers||{});
    const url=config.baseUrl.replace(/\/$/,'')+buildPath(endpoint,params&&params.path)+buildQuery(params&&params.query);
    const init={method:endpoint.method,headers,signal:options&&options.signal};
    if(params&&params.body!=null&&endpoint.method!=='GET'&&endpoint.method!=='HEAD')init.body=JSON.stringify({apiVersion:endpoint.apiVersion,contract:{id:endpoint.id,version:endpoint.version},requestId,traceId,tenantId:context.tenantId,actor:context.actor,data:params.body});
    let timer=null,controller=null;
    if(!init.signal&&global.AbortController){controller=new AbortController();init.signal=controller.signal;timer=setTimeout(()=>controller.abort(),(options&&options.timeoutMs)||config.timeoutMs);}
    try{
      const retryCfg=Object.assign({maxAttempts:1,baseDelayMs:350,maxDelayMs:5000,jitter:0.2},config.retry||{});
      const retryPermitted=endpoint.method==='GET'||endpoint.method==='HEAD'||endpoint.idempotency.required;
      const maxAttempts=retryPermitted?Math.max(1,Number(retryCfg.maxAttempts||1)):1;
      let response=null,payload=null,lastRequestError=null;
      for(let attempt=1;attempt<=maxAttempts;attempt+=1){
        try{
          response=await AGN.api.fetch(url,init);payload=null;try{payload=await response.json();}catch(_){payload={};}
          if(!response.ok)throw standardError(response,payload,endpoint,requestId,traceId);
          lastRequestError=null;break;
        }catch(error){
          lastRequestError=error;const canRetry=attempt<maxAttempts&&(error&&error.retryable||error&&error.name==='TypeError');
          if(!canRetry)throw error;
          stat.retries=(stat.retries||0)+1;
          const raw=Math.min(Number(retryCfg.maxDelayMs||5000),Number(retryCfg.baseDelayMs||350)*Math.pow(2,attempt-1));
          const jitter=Number(retryCfg.jitter||0);const delay=Math.max(0,Math.round(raw*(1+(Math.random()*2-1)*jitter)));
          if(AGN.events)AGN.events.emit('backend:retry',{endpoint:id,requestId,traceId,attempt,nextAttempt:attempt+1,delayMs:delay,code:error&&error.code||null});
          await new Promise(resolve=>setTimeout(resolve,delay));
        }
      }
      if(lastRequestError)throw lastRequestError;
      const env=Object.assign({ok:true,apiVersion:endpoint.apiVersion,contract:{id:endpoint.id,version:endpoint.version},requestId,traceId,generatedAt:nowIso(),meta:{},pagination:null,errors:[]},asObject(payload));
      const responseValidation=validateResponse(id,env);
      if(!responseValidation.ok){const e=new Error('Backend response contract failed: '+responseValidation.issues.map(x=>x.path+': '+x.message).join('; '));e.name='AGNBackendContractError';e.code='RESPONSE_CONTRACT_INVALID';e.issues=responseValidation.issues;e.endpoint=id;throw e;}
      stat.successes+=1;stat.lastStatus='success';stat.lastError=null;stat.lastDurationMs=Date.now()-started;
      if(AGN.events)AGN.events.emit('backend:success',{endpoint:id,requestId,traceId,durationMs:stat.lastDurationMs});
      return env;
    }catch(error){stat.failures+=1;stat.lastStatus=error.code||error.name||'failed';stat.lastError=String(error.message||error);stat.lastDurationMs=Date.now()-started;if(AGN.events)AGN.events.emit('backend:error',{endpoint:id,requestId,traceId,error:stat.lastError,code:error.code||null});throw error;}
    finally{if(timer)clearTimeout(timer);}
  }
  function diagnostics(id){
    if(id){const e=get(id);if(!e)return null;return Object.assign({id:e.id,section:e.section,method:e.method,path:e.path,version:e.version,scopes:e.auth.scopes.slice(),roles:e.auth.roles.slice(),persistence:clone(e.persistence),configured:!!config.baseUrl},clone(endpointStats.get(id)));}
    const out={};endpoints.forEach((_,key)=>{out[key]=diagnostics(key);});return {registered:endpoints.size,configured:!!config.baseUrl,baseUrl:config.baseUrl||null,profileId:config.profileId||'offline',retry:clone(config.retry||{}),apiVersion:config.apiVersion,clientVersion:config.clientVersion,authMode:config.authMode,identity:AGN.identity&&AGN.identity.diagnostics?AGN.identity.diagnostics():null,persistence:AGN.persistence&&AGN.persistence.diagnostics?AGN.persistence.diagnostics():null,endpoints:out,sections:Array.from(sectionGuides.keys())};
  }
  

  function jsonType(t){
    switch(String(t||'').toLowerCase()){
      case 'integer': return {type:'integer'};
      case 'number': case 'float': case 'double': return {type:'number'};
      case 'boolean': case 'bool': return {type:'boolean'};
      case 'array': return {type:'array',items:{}};
      case 'object': return {type:'object',additionalProperties:true};
      case 'date-time': return {type:'string',format:'date-time'};
      case 'date': return {type:'string',format:'date'};
      case 'uuid': return {type:'string',format:'uuid'};
      default: return {type:'string'};
    }
  }
  function fieldSchema(f){
    var sc=jsonType(f.type);
    if(f.enum && f.enum.length) sc.enum=f.enum.slice();
    if(f.min!=null){ if(sc.type==='string') sc.minLength=f.min; else sc.minimum=f.min; }
    if(f.max!=null){ if(sc.type==='string') sc.maxLength=f.max; else sc.maximum=f.max; }
    if(f.description) sc.description=f.description;
    return sc;
  }
  function bodySchema(e){
    var body=(e.request && e.request.body) || [];
    if(!body.length && !(e.request && e.request.bodyContract)) return null;
    var props={}, req=[];
    body.forEach(function(f){ props[f.name]=fieldSchema(f); if(f.required) req.push(f.name); });
    var sc={type:'object',properties:props,additionalProperties:false};
    if(req.length) sc.required=req;
    if(e.request && e.request.bodyContract){
      sc['x-agn-body-contract']=e.request.bodyContract;
      sc.description='Request body for '+e.id+'. Declared contract: '+e.request.bodyContract+'.';
    }
    if(!body.length) sc.description=(sc.description||'')
      +' The contract names a body contract but declares no fields inline; '
      +'the backend owns the field list for this shape.';
    return sc;
  }
  

  function componentSchemas(){
    var out={};
    out.ErrorEnvelope={type:'object',required:['ok','error'],properties:{
      ok:{type:'boolean',enum:[false]},
      error:{type:'object',required:['code','message'],properties:{
        code:{type:'string'},message:{type:'string'},retryable:{type:'boolean'},
        details:{type:'object',additionalProperties:true},
        fieldErrors:{type:'array',items:{type:'object',properties:{
          path:{type:'string'},code:{type:'string'},message:{type:'string'}}}}}},
      requestId:{type:'string'},traceId:{type:'string'}},
      description:'The single error shape every endpoint returns.'};
    out.Pagination={type:'object',nullable:true,properties:{
      mode:{type:'string',enum:['cursor','page','none']},
      cursor:{type:'string',nullable:true},
      nextCursor:{type:'string',nullable:true},
      limit:{type:'integer'},total:{type:'integer',nullable:true}},
      description:'Cursor pagination envelope. total is null where the backend cannot count cheaply.'};
    

    function fieldProp(why){
      return {description:why,
              'x-agn-type-source':'declared by the contract as a required field NAME; the '
                +'backend owns its type. Typed request fields are in the Req_* schemas.'};
    }
    var byContract={};
    endpoints.forEach(function(e){
      var req=(e.response && e.response.requiredFields) || [];
      var name=(e.response && e.response.dataContract) || null;
      if(!name && !req.length) return;
      var key = name ? String(name).replace(/[^A-Za-z0-9]/g,'_')
                     : ('Data_'+String(e.id).replace(/[^A-Za-z0-9]/g,'_'));
      key=key.charAt(0).toUpperCase()+key.slice(1);
      if(!byContract[key]){
        byContract[key]={name:name, req:req.slice(), eps:[e.id],
                         desc:(e.response&&e.response.description)||null};
      } else {
        var b=byContract[key];
        b.eps.push(e.id);
        b.req=b.req.filter(function(f){ return req.indexOf(f)>=0; });
        if(!b.desc) b.desc=(e.response&&e.response.description)||null;
      }
    });
    Object.keys(byContract).forEach(function(key){
      var b=byContract[key], props={};
      b.req.forEach(function(f){
        props[f]=fieldProp('Required by '+(b.eps.length===1?'contract ':'contracts ')
                           +b.eps.join(', ')+'.');
      });
      out[key]={type:'object', additionalProperties:true, properties:props,
        description:(b.desc || ('Payload for '+(b.name||b.eps[0])+'.'))
          + (b.eps.length>1
              ? (' Shared by '+b.eps.length+' endpoints; `required` is the INTERSECTION of '
                +'what they declare, and each operation carries its own set in '
                +'`x-agn-response.requiredFields`.')
              : '')};
      if(b.name) out[key]['x-agn-data-contract']=b.name;
      out[key]['x-agn-endpoints']=b.eps.slice();
      if(b.req.length) out[key].required=b.req.slice();
    });
    endpoints.forEach(function(e){
      var b=bodySchema(e); if(!b) return;
      var key='Req_'+String(e.id).replace(/[^A-Za-z0-9]/g,'_');
      out[key]=b;
    });
     
    out.SuccessEnvelope={type:'object',required:['ok','apiVersion','data'],properties:{
      ok:{type:'boolean',enum:[true]},apiVersion:{type:'string'},
      contract:{type:'object',properties:{id:{type:'string'},version:{type:'string'}}},
      requestId:{type:'string'},traceId:{type:'string'},
      generatedAt:{type:'string',format:'date-time'},
      data:{},meta:{type:'object',additionalProperties:true},
      pagination:{$ref:'#/components/schemas/Pagination'},
      errors:{type:'array',items:{}}},
      description:'The single success shape every endpoint returns; data carries the contract payload.'};
    return out;
  }
  function responseKey(e){
    var name=(e.response && e.response.dataContract) || null;
    var req=(e.response && e.response.requiredFields) || [];
    if(!name && !req.length) return null;
    var key = name ? String(name).replace(/[^A-Za-z0-9]/g,'_')
                   : ('Data_'+String(e.id).replace(/[^A-Za-z0-9]/g,'_'));
    return key.charAt(0).toUpperCase()+key.slice(1);
  }
  function responseFor(e,schemas){
    var key = responseKey(e);
    var dataSchema = (key && schemas[key])
      ? (e.response && e.response.collection
          ? {type:'array',items:{$ref:'#/components/schemas/'+key}}
          : {$ref:'#/components/schemas/'+key})
      : {description:'This contract declares neither a data contract nor required response '
                    +'fields, so the backend owns the shape entirely.'};
    return {type:'object',required:['ok','apiVersion','data'],
      properties:{
        ok:{type:'boolean',enum:[true]},apiVersion:{type:'string'},
        contract:{type:'object',properties:{id:{type:'string',enum:[e.id]},version:{type:'string'}}},
        requestId:{type:'string'},traceId:{type:'string'},
        generatedAt:{type:'string',format:'date-time'},
        data:dataSchema,
        meta:{type:'object',additionalProperties:true},
        pagination:{$ref:'#/components/schemas/Pagination'},
        errors:{type:'array',items:{}}}};
  }
  function openApiDocument(){
    const schemas=componentSchemas();
    const paths={};
    endpoints.forEach(e=>{
      const path=paths[e.path]=paths[e.path]||{};
      const method=e.method.toLowerCase();
      const pathFields=(e.request&&e.request.path)||[];
      const queryFields=(e.request&&e.request.query)||[];
      const op={
        operationId:e.id.replace(/[^a-zA-Z0-9]/g,'_'),
        summary:e.title,
        description:(e.description||e.title||'')
          +(e.validation&&e.validation.length
              ? '\n\nBackend validation required by this contract:\n- '+e.validation.join('\n- ')
              : '')
          +(e.persistence&&e.persistence.required
              ? '\n\nPersistence: store `'+e.persistence.store+'`, retention '
                +e.persistence.retention+(e.persistence.immutable?', immutable':'')
                +(e.persistence.audit?', audited':'')+'.'
              : ''),
        tags:[e.section],
        security:e.auth.required?[{bearerAuth:e.auth.scopes}]:[],
        parameters:pathFields.map(f=>({name:f.name,in:'path',required:true,
                                       schema:fieldSchema(f),description:f.description}))
          .concat(queryFields.map(f=>({name:f.name,in:'query',required:!!f.required,
                                       schema:fieldSchema(f),description:f.description})))
      };
      if(e.idempotency&&e.idempotency.required){
        op.parameters.push({name:e.idempotency.header||'Idempotency-Key',in:'header',
          required:true,schema:{type:'string'},
          description:'Idempotency key. This contract requires it: a repeated key must '
                     +'return the original result rather than acting twice.'});
      }
      const body=bodySchema(e);
      if(body){
        op.requestBody={required:true,content:{}};
        op.requestBody.content[MEDIA_TYPE]={schema:{$ref:'#/components/schemas/Req_'
          +String(e.id).replace(/[^A-Za-z0-9]/g,'_')}};
      }
      const okSchema=responseFor(e,schemas);
      const errContent={}; errContent[MEDIA_TYPE]={schema:{$ref:'#/components/schemas/ErrorEnvelope'}};
      const okContent={};  okContent[MEDIA_TYPE]={schema:okSchema};
      op.responses={'200':{description:e.response.description||'Successful response',content:okContent}};
      (e.errors||[]).forEach(function(er){
        op.responses[String(er.httpStatus)]={
          description:er.message+(er.retryable?' (retryable)':' (not retryable)')
                     +' Code: '+er.code+'.',
          content:errContent};
      });
      ['400','401','403','409','422','429','500'].forEach(function(code){
        if(op.responses[code]) return;
        op.responses[code]={description:({
          '400':'Request contract error','401':'Authentication required',
          '403':'Required scope or role missing','409':'Version or persistence conflict',
          '422':'Scientific or data validation failure','429':'Rate limit exceeded',
          '500':'Backend service error'})[code],content:errContent};
      });
      op['x-agn-response']={ dataContract:(e.response&&e.response.dataContract)||null,
                             requiredFields:((e.response&&e.response.requiredFields)||[]).slice(),
                             collection:!!(e.response&&e.response.collection),
                             note:'the fields AGN.backendInterfaces.validateResponse enforces '
                                 +'for THIS operation. Where a component schema is shared, '
                                 +'these may be stricter than its intersection.' };
      op['x-agn-contract']={id:e.id,version:e.version,apiVersion:e.apiVersion,
        service:e.service||null,purpose:e.purpose||null,responseUnits:e.responseUnits||null,
        refreshCadence:e.refreshCadence||null,cachePolicy:e.cachePolicy||null,jobSchedule:e.jobSchedule||null,
        providerFallback:e.providerFallback||null,qualityFlags:e.qualityFlags||[],editableBy:e.editableBy||null,
        reportIntegration:e.reportIntegration||null,evidenceProvenance:e.evidenceProvenance||null,
        responseShape:e.responseShape||null,staleAfterMinutes:e.staleAfterMinutes,providerAccess:e.providerAccess||null,
        pagination:e.pagination,persistence:e.persistence,idempotency:e.idempotency,
        auth:{scopes:e.auth.scopes,roles:e.auth.roles},errors:e.errors,
        validation:e.validation||[]};
      path[method]=op;
    });
    return {openapi:'3.1.0',
      info:{title:'AGN NIGRAAN Backend Interface Contracts',
        version:(global.AGN_VERSION|| 'version-unset'),
        description:'Endpoint contracts generated from the current deployment-readiness, '
          +'connection-profile, synchronization, repository, workflow, identity and '
          +'persistence-aware frontend registry.\n\n'
          

          +'WHAT THIS DOCUMENT GUARANTEES: every request body, path parameter and query '
          +'parameter is typed from the same contract objects the running validator reads, '
          +'and every endpoint that declares required response fields carries them in a '
          +'named component and in x-agn-response on the operation.\n\n'
          +'WHAT IT DOES NOT: the contracts declare required field NAMES for responses, not '
          +'their types, so a response component states what must be present and leaves the '
          +'shape of each field to the backend. Request bodies are strict '
          +'(additionalProperties:false) where the contract enumerates fields; responses are '
          +'open (additionalProperties:true). Where a component is shared between endpoints, '
          +'its `required` is the intersection - read x-agn-response for the per-operation '
          +'set that AGN.backendInterfaces.validateResponse actually enforces.'},
      

      servers:[{url:(config.baseUrl||''),
                description:(config.baseUrl
                  ? 'the configured backend origin'
                  : 'no backend origin is configured in this build: paths are same-origin '
                    +'and already carry the /api/v1 prefix. Set the deployment origin here '
                    +'(and in {{BACKEND_ORIGIN}} in the Content-Security-Policy).')}],
      components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}},
                  schemas:schemas},
      paths};
  }

  AGN.backendInterfaces={
    defineEndpoint,get,list,defineGuide,guide,configure,request,validateRequest,validateResponse,diagnostics,
    snapshot:function(){return clone({diagnostics:diagnostics(),guides:Object.fromEntries(Array.from(sectionGuides.entries())),openapi:openApiDocument()});},
    openApiDocument,config,standards:{apiVersion:DEFAULT_API_VERSION,mediaType:MEDIA_TYPE,errorEnvelope:{ok:false,error:{code:'STRING',message:'Human-readable message',retryable:false,details:{},fieldErrors:[]},requestId:'STRING',traceId:'STRING'},successEnvelope:{ok:true,apiVersion:'1.0',contract:{id:'endpoint.id',version:'1.0.0'},requestId:'STRING',traceId:'STRING',generatedAt:'ISO-8601',data:{},meta:{},pagination:null,errors:[]}}
  };

  const commonErrors=[
    {code:'AUTH_REQUIRED',httpStatus:401,message:'Authentication is required.'},
    {code:'SCOPE_REQUIRED',httpStatus:403,message:'Required scope is missing.'},
    {code:'ROLE_REQUIRED',httpStatus:403,message:'Required role is missing.'},
    {code:'TRUSTED_SESSION_REQUIRED',httpStatus:403,message:'A trusted authenticated session is required for this write.'},
    {code:'CONTRACT_INVALID',httpStatus:422,message:'Request or response violates the endpoint contract.'},
    {code:'VERSION_CONFLICT',httpStatus:409,message:'API or contract version is incompatible.'},
    {code:'RATE_LIMITED',httpStatus:429,message:'Request rate exceeded.',retryable:true},
    {code:'SERVICE_UNAVAILABLE',httpStatus:503,message:'Backend service is unavailable.',retryable:true}
  ];
  const field=(name,type,required,description,extra)=>Object.assign({name,type,required,description},extra||{});

  defineEndpoint('overview.nationalHazards',{section:'overview',title:'National hazard unit summary',service:'National hazard tile and unit-summary service',method:'GET',path:'/api/v1/national/hazards/{hazard}',auth:{scopes:['hazards:read']},request:{path:[field('hazard','string',true,'Canonical hazard key.')],query:[field('valid_date','string',true,'Requested valid date.'),field('lead_hours','integer',true,'Forecast lead in hours.',{enum:[0,24,48,72]}),field('level','string',true,'Administrative level.',{enum:['tehsil','district','province']}),field('model_run','date-time',false,'Specific provider or fusion run.'),field('cursor','string',false,'Pagination cursor.'),field('limit','integer',false,'Page size.',{min:1,max:1000})]},response:{dataContract:'hazardResult',collection:true,description:'Versioned hazard screening results by administrative unit.'},pagination:{mode:'cursor',defaultLimit:500,maxLimit:1000},persistence:{required:true,store:'hazard_snapshots',retention:'7 years',immutable:true,audit:true},validation:['Reject unsupported lead or hazard combinations.','Reject stale provider runs.','Withhold results below hazard-specific input or spatial coverage thresholds.'],errors:commonErrors});
  defineEndpoint('live.pointForecast',{section:'livedata',title:'Point forecast broker',service:'Forecast broker',method:'GET',path:'/api/v1/forecast/point',auth:{scopes:['forecast:read']},request:{query:[field('latitude','number',true,'Latitude.',{min:-90,max:90}),field('longitude','number',true,'Longitude.',{min:-180,max:180}),field('variables','array',true,'Requested normalized variables.'),field('models','array',false,'Named provider model identifiers.'),field('initialization_time','date-time',false,'Requested model cycle.'),field('lead_hours','array',false,'Requested lead hours.')]},response:{dataContract:'forecast',requiredFields:['unitKey'],description:'Normalized point forecast with provider and valid-time metadata.'},persistence:{required:true,store:'forecast_cache_and_raw_archive',retention:'raw 90 days, normalized 7 years',immutable:false,audit:true},validation:['Provider model IDs must be allowlisted.','Initialization and valid time must be internally consistent.','Units must be normalized before return.'],errors:commonErrors});
  defineEndpoint('live.nationalForecast',{section:'livedata',title:'National forecast aggregation',service:'National aggregation service',method:'GET',path:'/api/v1/forecast/national',auth:{scopes:['forecast:read']},request:{query:[field('unit_level','string',true,'Administrative level.',{enum:['tehsil','district']}),field('variables','array',true,'Requested variables.'),field('lead_hours','array',true,'Requested lead hours.'),field('model_run','date-time',false,'Requested model run.'),field('cursor','string',false,'Pagination cursor.'),field('limit','integer',false,'Page size.',{min:1,max:1000})]},response:{dataContract:'forecast',collection:true,description:'Forecast records for national administrative units.'},pagination:{mode:'cursor',defaultLimit:500,maxLimit:1000},persistence:{required:true,store:'national_forecast_runs',retention:'7 years',immutable:true,audit:true},validation:['Every record must contain unit key, valid time and provider run.','National coverage must be returned in response metadata.'],errors:commonErrors});
  defineEndpoint('airisk.explain',{section:'airisk',title:'Constrained risk explanation',service:'Evidence retrieval and explanation service',method:'POST',path:'/api/v1/risk/explain',auth:{scopes:['risk:explain']},request:{body:[field('evidence_id','string',false,'Persistent evidence identifier.'),field('hazard_result','object',true,'Structured hazard-result object.'),field('audience','string',true,'Requested audience.',{enum:['executive','technical','public','operations']}),field('language','string',false,'Output language.'),field('question','string',false,'Optional constrained question.')]},response:{requiredFields:['summary','drivers','limitations','sourceReferences'],description:'Grounded explanation derived only from supplied evidence.'},idempotency:{required:true},persistence:{required:true,store:'risk_explanations',retention:'7 years',immutable:true,audit:true},validation:['Reject missing source references.','Reject unsupported hazard or lead combinations.','Store prompt contract version and output hash.'],errors:commonErrors});
  defineEndpoint('assessments.create',{section:'assessments',title:'Create reproducible assessment',service:'Asset, scenario and assessment evidence service',method:'POST',path:'/api/v1/assessments',auth:{scopes:['assessments:write']},request:{body:[field('asset','object',true,'Asset identity, coordinates and class.'),field('hazards','array',true,'Requested hazard set.'),field('horizon','string',true,'Current or scenario horizon.'),field('design_life_years','integer',false,'Asset design life.',{min:1,max:100}),field('scenario_id','string',false,'Versioned climate scenario identifier.'),field('evidence_context','object',true,'Source, formula and valid-time context.')]},response:{dataContract:'evidence',requiredFields:['calculationId'],description:'Frozen assessment evidence and calculation record.'},idempotency:{required:true},persistence:{required:true,store:'assessment_evidence',retention:'permanent or policy-defined',immutable:true,audit:true},validation:['Reject unknown asset classes.','Reject uncertain location matches.','Never coerce missing inputs to zero.','Future horizons require a versioned scenario.'],errors:commonErrors});
  defineEndpoint('assessments.evidence',{section:'assessments',title:'Retrieve assessment evidence',service:'Assessment evidence service',method:'GET',path:'/api/v1/evidence/{calculation_id}',auth:{scopes:['evidence:read']},request:{path:[field('calculation_id','string',true,'Immutable calculation identifier.')]},response:{dataContract:'evidence',requiredFields:['calculationId'],description:'Previously frozen assessment evidence.'},persistence:{required:true,store:'assessment_evidence',retention:'permanent or policy-defined',immutable:true,audit:true},validation:['Return immutable evidence only.','Include report hash and approval status when available.'],errors:commonErrors});
  defineEndpoint('operations.state',{section:'operations',title:'Lead-specific operational state',service:'Operational state service',method:'GET',path:'/api/v1/operations/state',auth:{scopes:['operations:read']},request:{query:[field('unit_id','string',true,'Canonical administrative unit ID.'),field('horizon','string',true,'Operational horizon.',{enum:['now','6h','24h','72h','seasonal','2030','2050']}),field('hazards','array',false,'Hazard set.'),field('initialization_time','date-time',false,'Forecast initialization.'),field('scenario_id','string',false,'Scenario identifier for non-forecast horizons.')]},response:{requiredFields:['unit','verdicts','validTime','expiresAt'],description:'Recalculated operational state for the requested horizon.'},persistence:{required:true,store:'operational_states',retention:'7 years',immutable:true,audit:true},validation:['Every horizon must map to a distinct data product.','Current scores may not be relabelled as future.'],errors:commonErrors});
  defineEndpoint('operations.actions.create',{section:'operations',title:'Create operational action',service:'Operational workflow service',method:'POST',path:'/api/v1/actions',auth:{scopes:['actions:write'],roles:['operator','supervisor']},request:{body:[field('unit_id','string',true,'Canonical unit ID.'),field('hazard','string',true,'Hazard key.'),field('hazard_result_id','string',true,'Evidence-linked hazard result.'),field('owner_id','string',true,'Assigned owner.'),field('sop_id','string',true,'Approved SOP.'),field('deadline_basis','object',true,'Lead, SOP and authority basis.'),field('evidence_ids','array',true,'Linked evidence identifiers.')]},response:{requiredFields:['actionId','status','createdAt','version'],description:'Persistent action with immutable identifier and workflow version.'},idempotency:{required:true},persistence:{required:true,store:'actions_and_action_history',retention:'permanent or policy-defined',immutable:false,audit:true},validation:['Resolve the unit before creation.','Use SOP-based deadlines.','Prevent duplicate active actions for the same evidence and SOP.'],errors:commonErrors});
  defineEndpoint('operations.actions.update',{section:'operations',title:'Update operational action',service:'Operational workflow service',method:'PATCH',path:'/api/v1/actions/{action_id}',auth:{scopes:['actions:write'],roles:['operator','supervisor','approver']},request:{path:[field('action_id','string',true,'Action ID.')],body:[field('version','integer',true,'Current optimistic-lock version.'),field('status','string',false,'New workflow status.'),field('owner_id','string',false,'Updated owner.'),field('note','string',false,'Audit note.'),field('approval','object',false,'Approval decision and authority.')]},response:{requiredFields:['actionId','status','updatedAt','version'],description:'Updated action and new optimistic-lock version.'},idempotency:{required:true},persistence:{required:true,store:'actions_and_action_history',retention:'permanent or policy-defined',immutable:false,audit:true},validation:['Enforce optimistic locking.','Reject unauthorized status transitions.','Append, never overwrite, history records.'],errors:commonErrors});
  defineEndpoint('operations.outcomes.create',{section:'operations',title:'Create post-event outcome',service:'Outcome evidence ledger',method:'POST',path:'/api/v1/outcomes',auth:{scopes:['outcomes:write']},request:{body:[field('action_id','string',false,'Related action.'),field('event_id','string',true,'Event identifier.'),field('unit_id','string',true,'Canonical unit ID.'),field('observed_impacts','object',true,'Observed impact measures.'),field('verification_sources','array',true,'Evidence sources.'),field('reviewer_id','string',true,'Reviewer identity.')]},response:{requiredFields:['outcomeId','createdAt','evidenceHash'],description:'Immutable post-event outcome record.'},idempotency:{required:true},persistence:{required:true,store:'outcome_ledger',retention:'permanent',immutable:true,audit:true},validation:['Require source-backed observed impacts.','Prevent duplicate event-unit outcomes.'],errors:commonErrors});
  defineEndpoint('modelLab.verification.run',{section:'modelab',title:'Create model-verification run',service:'Scheduled model verification service',method:'POST',path:'/api/v1/model-verification/runs',auth:{scopes:['model-verification:write']},request:{body:[field('model_ids','array',true,'Named model IDs.'),field('initialization_cycles','array',true,'Forecast cycles.'),field('lead_hours','array',true,'Lead hours.'),field('variable','string',true,'Verified variable.'),field('units_or_regions','array',true,'Verification domains.'),field('reference_dataset','string',true,'Independent reference dataset.'),field('period','object',true,'Verification date range.')]},response:{requiredFields:['runId','status','createdAt'],description:'Scheduled verification run.'},idempotency:{required:true},persistence:{required:true,store:'model_verification_runs',retention:'permanent',immutable:true,audit:true},validation:['Independent providers must not be passed as another provider model ID.','Cycles and leads must align exactly.'],errors:commonErrors});
  defineEndpoint('modelLab.skill',{section:'modelab',title:'Retrieve verified model skill',service:'Model skill service',method:'GET',path:'/api/v1/model-verification/skill',auth:{scopes:['model-verification:read']},request:{query:[field('variable','string',true,'Variable.'),field('lead_hours','integer',true,'Lead hour.',{min:0,max:720}),field('region','string',true,'Region or unit.'),field('season','string',false,'Season.'),field('model_ids','array',false,'Optional model filter.'),field('cursor','string',false,'Pagination cursor.'),field('limit','integer',false,'Page size.',{min:1,max:200})]},response:{collection:true,requiredFields:[],description:'MAE, RMSE, bias, probabilistic skill and sample metadata.'},pagination:{mode:'cursor',defaultLimit:50,maxLimit:200},persistence:{required:true,store:'model_skill_versions',retention:'permanent',immutable:true,audit:true},validation:['Return sample count and skill version.','Include confidence interval where supported.'],errors:commonErrors});
  defineEndpoint('hybridLab.experiments.create',{section:'hybridlab',title:'Create governed scenario experiment',service:'Scenario experiment and sensitivity service',method:'POST',path:'/api/v1/hybrid/experiments',auth:{scopes:['hybrid-experiments:write']},request:{body:[field('unit_or_location','object',true,'Canonical unit or point.'),field('feature_timestamps','object',true,'Timestamp for every feature.'),field('scenario_inputs','object',true,'Scenario values.'),field('coefficients','object',true,'Versioned coefficient set.'),field('baseline_id','string',true,'Baseline evidence identifier.'),field('hypothesis_id','string',true,'Governed hypothesis identifier.')]},response:{requiredFields:['experimentId','candidateScore','sensitivityRange','promotionStatus'],description:'Experimental result with diagnostics and governance status.'},idempotency:{required:true},persistence:{required:true,store:'hybrid_experiments',retention:'permanent',immutable:true,audit:true},validation:['Enforce temporal alignment.','Calculate collinearity diagnostics.','Require holdout validation and independent review before promotion.'],errors:commonErrors});
  defineEndpoint('system.providers',{section:'shared',title:'Provider adapter registry',service:'Backend provider and capability registry',method:'GET',path:'/api/v1/system/providers',auth:{scopes:['providers:read']},request:{query:[field('probe','boolean',false,'Run lightweight health probes for configured adapters.')]},response:{requiredFields:['schema','status','selection','adapters','productionBoundary'],description:'Configured provider adapters, capability health, provenance, fallback and operational-status boundaries.'},persistence:{required:false,store:'runtime_provider_registry',retention:'diagnostic only',immutable:false,audit:true},validation:['Never expose credentials or secrets.','Every adapter must declare operational status and source mode.','Fallback use must be explicit in diagnostics and response metadata.','Network probes must use bounded timeouts.'],errors:commonErrors});
  defineEndpoint('shared.units.search',{section:'shared',title:'Administrative unit search',service:'Canonical geography service',method:'GET',path:'/api/v1/units/search',auth:{scopes:['units:read']},request:{query:[field('q','string',true,'Search text.'),field('level','string',false,'Unit level.',{enum:['tehsil','district','province','all']}),field('cursor','string',false,'Pagination cursor.'),field('limit','integer',false,'Page size.',{min:1,max:100})]},response:{collection:true,description:'Canonical unit identities and hierarchy.'},pagination:{mode:'cursor',defaultLimit:20,maxLimit:100},persistence:{required:true,store:'canonical_unit_registry',retention:'versioned permanent',immutable:false,audit:true},validation:['Return canonical IDs, names and parent hierarchy.'],errors:commonErrors});

  defineGuide('sequence',{title:'Provider adapter and backend readiness sequence',sub:'Endpoint-specific repositories and governed workflow adapters now sit above identity, permission, persistence and backend contracts. Backend configuration remains mandatory for operational records.',sequence:[['1','Interface registry','Endpoint request and response contracts, authentication scopes and API versions are defined.','frontend'],['2','Standard envelopes','Success, error, pagination and trace envelopes are defined.','frontend'],['3','Persistence rules','Every write endpoint declares idempotency, audit and retention requirements.','frontend'],['4','Service implementation','Backend teams implement endpoints and connect identity, databases, queues and model services.','backend'],['5','Integration verification','Contract tests, scientific validation, load tests and security review are required before enabling controls.','backend']],endpoints:[]});
  defineGuide('overview',{title:'Overview backend interface contracts',sub:'National map and forecast-day products use one versioned geospatial interface.',service:'National hazard tile and unit-summary service',endpoints:['overview.nationalHazards']});
  defineGuide('providers',{title:'Provider adapter backend interface contract',sub:'Provider selection, health, provenance and fallback are controlled by the backend and never by embedded frontend credentials.',service:'Backend provider and capability registry',endpoints:['system.providers']});
  defineGuide('livedata',{title:'Live and Forecast backend interface contracts',sub:'Point and national forecast products are brokered and normalized outside the browser.',service:'Forecast broker and national aggregation service',endpoints:['live.pointForecast','live.nationalForecast']});
  defineGuide('airisk',{title:'AI and Risk backend interface contracts',sub:'Explanation output is constrained to versioned evidence and source references.',service:'Evidence retrieval and constrained explanation service',endpoints:['airisk.explain']});
  defineGuide('assessments',{title:'Assessment backend interface contracts',sub:'Assessments create immutable evidence and retrieve it by calculation ID.',service:'Asset, scenario and assessment evidence service',endpoints:['assessments.create','assessments.evidence']});
  defineGuide('operations',{title:'Operations backend interface contracts',sub:'Operational state, actions, approvals and outcomes require persistent role-controlled services.',service:'Operational workflow and evidence ledger',endpoints:['operations.state','operations.actions.create','operations.actions.update','operations.outcomes.create']});
  defineGuide('operations-horizons',{title:'Operations horizon backend interface contract',sub:'The horizon control remains disabled until a distinct operational state exists for each supported horizon.',service:'Lead-specific operational state service',endpoints:['operations.state']});
  defineGuide('modelab',{title:'Model Lab backend interface contracts',sub:'Skill is calculated by initialization, lead, variable, region and reference dataset.',service:'Scheduled verification and skill service',endpoints:['modelLab.verification.run','modelLab.skill']});
  defineGuide('hybridlab',{title:'Scenario Lab scientific sandbox contract',sub:'Scenario runs clone current inputs, preserve operational state and store governed scenario assumptions separately from forecast evidence.',service:'Scenario experiment and sensitivity service',endpoints:['hybridLab.experiments.create']});
  defineGuide('evidence',{title:'Assessment evidence backend interface contract',sub:'Evidence must be immutable, versioned and retrievable by calculation ID.',service:'Assessment evidence service',endpoints:['assessments.create','assessments.evidence']});
  if (AGN.persistence && typeof AGN.persistence.syncEndpointPolicies === 'function') AGN.persistence.syncEndpointPolicies(list());
  AGN.architecture=Object.assign({},AGN.architecture,{backend:'endpoint contracts enforced through tenant-aware identity, role/scope permissions and persistence policies'});
})(window);
