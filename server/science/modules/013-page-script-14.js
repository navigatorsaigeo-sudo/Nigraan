(function (global) {
  'use strict';
  const AGN = global.AGN = global.AGN || {};
  const nativeFetch = global.fetch ? global.fetch.bind(global) : null;
  if (!nativeFetch) throw new Error('Fetch API is unavailable');

  const config = {
    maxConcurrent: 4,
    minSpacingMs: 120,
    dailyFreeTier: 10000,
    sessionWeightCap: 2500,
    

    breakerTrip: 3,
    breakerCooldownMs: 90000,
    softWarnAt: 1800,
    ttl: { forecast: 12 * 60e3, air: 15 * 60e3, archive: 24 * 60 * 60e3, seismic: 5 * 60e3, other: 5 * 60e3 }
  };
  let active = 0, lastAt = 0, spent = 0, served = 0, saved = 0, firstAt = null, lastRequestAt = null;
  const queue = [], memory = new Map(), inflight = new Map(), byHost = {};

  function urlOf(input) { return typeof input === 'string' ? input : input && input.url || String(input || ''); }
  function hostOf(url) { try { return new URL(url, location.href).host || 'local'; } catch (_) { return 'local'; } }
  function requestClass(url) {
    if (/archive-api|historical-forecast-api/.test(url)) return 'archive';
    if (/air-quality-api/.test(url)) return 'air';
    if (/earthquake\.usgs/.test(url)) return 'seismic';
    if (/forecast-api|api\.open-meteo/.test(url)) return 'forecast';
    return 'other';
  }
  function weight(url) {
    if (!/open-meteo\.com/.test(url)) return 1;
    const coords = Math.max(1, (url.match(/latitude=([^&]+)/)||['',''])[1].split(',').filter(Boolean).length);
    const variables = ((url.match(/[?&](?:hourly|daily|current)=([^&]+)/)||['',''])[1] || '').split(',').filter(Boolean).length || 1;
    return Math.max(1, coords * Math.max(1, variables / 4));
  }
  function cacheKey(url, init) { return (init && init.method || 'GET') + '|' + url; }
  function cacheGet(key, ttl) {
    const item = memory.get(key);
    if (!item || Date.now() - item.at > ttl) return null;
    return item.value;
  }
  function cachePut(key, value) { memory.set(key, { at: Date.now(), value }); }
  

  function resolveTierCap() {
    try {
      if (global.AGN && global.AGN.tier && typeof global.AGN.tier.get === 'function')
        return global.AGN.tier.get('sessionWeight', config.sessionWeightCap);
    } catch (_) {}
    return config.sessionWeightCap;
  }

  function pump() {
    while (queue.length && active < config.maxConcurrent) {
      const wait = config.minSpacingMs - (Date.now() - lastAt);
      if (wait > 0) { setTimeout(pump, wait); return; }
      active += 1; lastAt = Date.now(); queue.shift()();
    }
  }
  function slot(pri) { if (pri === 'bypass') { active += 1; return Promise.resolve(); }
    return new Promise(resolve => { if (pri) queue.unshift(resolve); else queue.push(resolve); pump(); }); }    
  function sweepSized(u) { try { return ((u.match(/[?&]latitude=([^&]+)/) || ['', ''])[1]).split(/,|%2C/i).filter(Boolean).length >= 20; } catch (_) { return false; } }
  function responseFrom(value, state) {
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type':'application/json', 'x-agn-cache': state } });
  }
  

  const OM_COMMERCIAL_HOST = {
    'api.open-meteo.com'                    : 'customer-api.open-meteo.com',
    'air-quality-api.open-meteo.com'        : 'customer-air-quality-api.open-meteo.com',
    'flood-api.open-meteo.com'              : 'customer-flood-api.open-meteo.com',
    'archive-api.open-meteo.com'            : 'customer-archive-api.open-meteo.com',
    'climate-api.open-meteo.com'            : 'customer-climate-api.open-meteo.com',
    'ensemble-api.open-meteo.com'           : 'customer-ensemble-api.open-meteo.com',
    'historical-forecast-api.open-meteo.com': 'customer-historical-forecast-api.open-meteo.com',
    

    'previous-runs-api.open-meteo.com'      : 'customer-previous-runs-api.open-meteo.com',
    'marine-api.open-meteo.com'             : 'customer-marine-api.open-meteo.com',
    'seasonal-api.open-meteo.com'           : 'customer-seasonal-api.open-meteo.com',
    'satellite-api.open-meteo.com'          : 'customer-satellite-api.open-meteo.com'
    

  };

  

  const INTERNAL_KEY='';
  const INTERNAL=!!INTERNAL_KEY;
  

  

  try{ global.AGN_BUILD=global.AGN_BUILD||{};
       global.AGN_BUILD.credential_embedded=(INTERNAL_KEY.length>0);
       global.AGN_BUILD.credential_len=INTERNAL_KEY.length; }catch(_){}
  const BACKEND_REFUSE=/(^|[?&#])(api[-_]?key|key|token|access[-_]?token|secret|password|pass|auth)=/i;

  const CONNECTOR = {
    _backend: null,
    get backend(){ return this._backend; },
    get configured(){ return !!this._backend || INTERNAL; },
    get viaBackend(){ return !!this._backend; },
    get internal(){ return INTERNAL; },
    via(){ return this._backend ? ('the AGN backend at '+this._backend)
         : (INTERNAL ? 'this internal build’s compiled key' : 'the free public hosts'); },
    

    set(v){
      if(v==null||v===''){ this._backend=null;
        try{ localStorage.removeItem('NIGRAAN_BACKEND'); }catch(e){}
        return {ok:true, backend:null, why:'The connector is cleared. Commercial routes are on the free hosts again.'}; }
      const raw=String(v).trim().replace(/\/+$/,'');
      if(!/^https?:\/\//i.test(raw))
        return {ok:false, why:'That is not a backend address. Give the URL of the service that holds your key, such as https://api.nigraan.aigeo360.com/v1 — not the key itself.'};
      if(BACKEND_REFUSE.test(raw))
        return {ok:false, why:'That URL carries a credential in its query string. NIGRAAN will not store one and will not send one. The key belongs in the backend’s environment.'};
      this._backend=raw;
      try{ localStorage.setItem('NIGRAAN_BACKEND',raw); }catch(e){}
      return {ok:true, backend:raw, why:'Commercial routes now go through '+raw+'. The key stays in that service; this page never sees it.'};
    },
    init(){
      let v=null;
      try{ v=new URLSearchParams(location.search).get('backend'); }catch(e){}
      if(!v){ try{ v=localStorage.getItem('NIGRAAN_BACKEND'); }catch(e){} }
      if(!v) return null;
      const r=this.set(v);
      if(!r.ok){ try{ localStorage.removeItem('NIGRAAN_BACKEND'); }catch(e){}
                 try{ console.warn('NIGRAAN connector refused: '+r.why); }catch(e){} }
      return r;
    },
    

    tier(host){ return OM_COMMERCIAL_HOST[host] ? (this.configured?'commercial':'refused') : 'open'; },
     
    route(url){
      let u; try{ u=new URL(url); }catch(e){ return {url:url, host:null, tier:'open'}; }
      const commercial=OM_COMMERCIAL_HOST[u.hostname];
      if(!commercial) return {url:url, host:u.hostname, tier:'open'};
      if(this._backend){
        

        const b=this._backend.replace(/\/+$/,'');
        const q=new URLSearchParams(u.search);
        q.set('__omhost', u.hostname);
        

        try{
          var ZB=[[36.72,71.85,37.72,75.85],[35.72,70.85,36.72,76.85],[34.72,70.85,35.72,77.85],[33.72,69.85,34.72,78.85],[32.72,68.85,33.72,71.85],[32.72,72.85,33.72,78.85],[31.72,67.85,32.72,70.85],[31.72,74.85,32.72,75.85],[29.72,65.85,31.72,70.85],[28.72,60.85,29.72,64.85],[28.72,65.85,29.72,67.85],[26.72,64.85,28.72,67.85],[25.72,65.85,26.72,66.85]], ZM='best_match,icon_seamless,gfs_seamless,meteofrance_seamless';    
          if(u.hostname==='api.open-meteo.com' && u.pathname==='/v1/forecast' && !q.has('models')){
            var la=String(q.get('latitude')||'').split(',').map(Number), lo=String(q.get('longitude')||'').split(',').map(Number);
            var inZ=function(a,o){ for(var i=0;i<ZB.length;i++){ var z=ZB[i]; if(a>=z[0]&&a<=z[2]&&o>=z[1]&&o<=z[3]) return true; } return false; };
            if(la.length && la.length===lo.length && la.length<=50 && la.some(function(a,i){ return isFinite(a)&&isFinite(lo[i])&&inZ(a,lo[i]); })) q.set('models', ZM);
          }
        }catch(e){}
        return {url:b+u.pathname+'?'+q.toString(), host:new URL(b).hostname, tier:'backend'};
      }
      if(INTERNAL){
        u.hostname=commercial;
        u.searchParams.set('apikey',INTERNAL_KEY);
        return {url:u.toString(), host:commercial, tier:'commercial'};
      }
      

      return {url:null, host:u.hostname, tier:'refused',
              why:'no backend and no credential configured for the forecast provider'
                 +'. The free tier of the forecast provider is licensed for non-commercial use, '
                 +'so this build will not fall back to it.'};
    }
  };
  try{ CONNECTOR.init(); }catch(e){}
  

  const ROUTE_TAKEN = Object.create(null);
  

  const HOST_OUTCOME = Object.create(null);
  function noteOutcome(host, ok, why) {
    const e = HOST_OUTCOME[host] || (HOST_OUTCOME[host] = { ok: 0, failed: 0, lastError: null });
    if (ok) e.ok += 1;
    else { e.failed += 1; e.lastError = String(why || 'no reason given').slice(0, 200);
           

           e.lastErrorAt = Date.now(); }
  }

  

  const breaker = Object.create(null);

  /* v91.17.283.19 · ONE SERVER CALL DRIVES THE PAGE: in the browser no section reads the provider forecast (/v1/forecast): a place is its
     bundle (GET /api/point) and any other point its corrected record (GET /api/point/batch), both through the page store (AGN.pointState).
     Only the server's own hazard engine (this page in engine mode, ?engine=1) reads it, for the inputs of the issued levels. */
  const providerForecast = (u) => { try { const x = new URL(u); return x.hostname === 'api.open-meteo.com' && x.pathname === '/v1/forecast'; } catch (_) { return false; } };
  async function managedFetch(input, init) {
    

    const rawUrl = urlOf(input);
    if (providerForecast(rawUrl) && !(global.AGN && global.AGN.engineMode)) return Promise.reject(new Error('the page does not read the provider forecast: the page store (GET /api/point, /api/point/batch) carries every forecast value'));
    const routed = CONNECTOR.route(rawUrl);
    ROUTE_TAKEN[hostOf(rawUrl)] = routed.tier;
    

    if (routed.tier === 'refused' || routed.url == null) {
      noteOutcome(hostOf(rawUrl), false, routed.why || 'route refused');
      return Promise.reject(new Error('AGN route refused: ' + (routed.why || 'no licensed route for ' + hostOf(rawUrl))));
    }
    const url = routed.url;
    const host = hostOf(url), cls = requestClass(rawUrl), key = cacheKey(url, init), ttl = config.ttl[cls];
    const managed = /(open-meteo\.com|earthquake\.usgs\.gov|api\.met\.no)/.test(url);
    byHost[host] = (byHost[host] || 0) + 1;
    if (firstAt == null) firstAt = performance.now(); lastRequestAt = performance.now();
    

    const routedInput = (typeof input === 'string' || (typeof URL !== 'undefined' && input instanceof URL))
      ? url
      : ((typeof Request !== 'undefined' && input instanceof Request) ? new Request(url, input) : url);

    if (!managed || (init && init.method && String(init.method).toUpperCase() !== 'GET')) return nativeFetch(routedInput, init);
    const hit = cacheGet(key, ttl);
    const w = weight(url);
    if (hit != null) { saved += w; return responseFrom(hit, 'hit'); }
    if (inflight.has(key)) return inflight.get(key).then(v => responseFrom(v, 'inflight'));
    

    const request = slot(sweepSized(url) ? (/\/px\//.test(url) ? 'bypass' : true) : false).then(async () => {
      

      

          const tierCap = resolveTierCap();
      if (spent + w > tierCap) {
        AGN.api.capped = true;
        throw new Error('AGN API session budget reached; live refresh paused');
      }
      

      const br = breaker[host];
      if (br && br.openUntil > Date.now()) {
        const secs = Math.ceil((br.openUntil - Date.now()) / 1000);
        noteOutcome(host, false, 'circuit breaker open, rate-limited for ' + secs + 's');
        throw new Error('BREAKER_OPEN ' + host + ' rate-limited; not retrying for ' + secs + 's');
      }
      spent += w; served += 1;
      let response;
      try {
        response = await nativeFetch(routedInput, init);
        

        try { if (response && response.ok && sweepSized(urlOf(routedInput))) { const _a = Number(response.headers.get('x-agn-cache-age-s') || 0), _st = response.headers.get('x-agn-cache') || 'network', _p = global.__AGN_SWEEP_AGE;
          const _f = Date.now() - _a * 1000;    
          global.__AGN_SWEEP_AGE = (_p && Date.now() - _p.at < 90e3 && _p.fetchedAt <= _f) ? { fetchedAt: _p.fetchedAt, state: _p.state, at: _p.at } : { fetchedAt: _f, state: _st, at: Date.now() };
          if (typeof global.setLiveBadge === 'function' && global.__AGN_LIVE_LAST != null) global.setLiveBadge(global.__AGN_LIVE_LAST); } } catch (_) {}
      } catch (netErr) {
        

        noteOutcome(host, false, String((netErr && netErr.message) || netErr));
        throw netErr;
      }
      if (!response.ok) {
        if (response.status === 429) {
          AGN.api.throttledAt = Date.now();
          const b = breaker[host] = breaker[host] || { fails: 0, openUntil: 0 };
          b.fails += 1;
          if (b.fails >= config.breakerTrip) {
            b.openUntil = Date.now() + config.breakerCooldownMs;
            b.fails = 0;
            try {
              console.warn('[AGN api] circuit breaker OPEN for ' + host + ' — '
                + config.breakerTrip + ' consecutive 429s. Pausing requests for '
                + Math.round(config.breakerCooldownMs / 1000) + 's.');
            } catch (_) {}
          }
        }
        noteOutcome(host, false, 'HTTP ' + response.status);
        throw new Error('HTTP ' + response.status + ' for ' + host);
      }
      noteOutcome(host, true, null);
      if (breaker[host]) breaker[host].fails = 0;
      const type = response.headers.get('content-type') || '';
      if (!type.includes('json')) return response;
      const value = await response.clone().json();
      cachePut(key, value);
      return value;
    }).finally(() => { active = Math.max(0, active - 1); pump(); });
    inflight.set(key, request);
    

    request.finally(() => inflight.delete(key)).catch(() => {});
    const value = await request;
    return value instanceof Response ? value : responseFrom(value, 'miss');
  }

  /* v91.17.283.15 · item 3 · a provider product of a place is read from the server's record through the page store (AGN.pointState.product,
     GET /api/pointstate/product): this is the one door for it; a section asked before the store has loaded waits for it (30 s at most) */
  function productFetch(name, q) {
    return new Promise((res, rej) => { let n = 0; (function wait() { const S = global.AGN && global.AGN.pointState; if (S && S.product) return res(S.product(name, q));
      if (++n > 120) return rej(new Error('the page store is not loaded')); setTimeout(wait, 250); })(); }); }
  AGN.api = {
    fetch: managedFetch,
    product: productFetch,
    nativeFetch,
    config,
    

    connector: CONNECTOR,
    routeTaken(){ return Object.assign({}, ROUTE_TAKEN); },
     
    outcomes(){
      return Object.keys(HOST_OUTCOME).map(function(hst){
        const e = HOST_OUTCOME[hst];
        return { route: hst, ok: e.ok, failed: e.failed,
                 state: e.failed ? (e.ok ? 'partial' : 'error') : 'ok',
                 okCount: e.ok, failedCount: e.failed, lastErrorAt: e.lastErrorAt || null,
                 why: e.lastError,
                 tier: ROUTE_TAKEN[hst] || null };
      });
    },
    commercialHosts: OM_COMMERCIAL_HOST,
    internal: INTERNAL,
    capped: false,
    throttledAt: null,
    clearCache() { const count = memory.size; memory.clear(); return count; },
    

    breakerState() {
      const now = Date.now(), out = {};
      Object.keys(breaker).forEach(h => {
        out[h] = { fails: breaker[h].fails,
                   openForMs: Math.max(0, breaker[h].openUntil - now) };
      });
      return out;
    },
    resetBreaker(host) {
      if (host) { delete breaker[host]; return 1; }
      let n = 0; Object.keys(breaker).forEach(h => { delete breaker[h]; n++; });
      AGN.api.capped = false; return n;
    },
    stats() { return { requests: served, weight: +spent.toFixed(1), savedWeight: +saved.toFixed(1), active, queued: queue.length, cap: resolveTierCap(), capFree: config.sessionWeightCap, capped: !!this.capped, byHost: Object.assign({}, byHost), firstAt, lastRequestAt }; },
    async json(input, init, options) { const r = await managedFetch(input, init); const value=await r.json(); if(options&&options.contract&&AGN.contracts)return AGN.contracts.assert(options.contract,value,Object.assign({boundary:'AGN.api.json',url:urlOf(input)},options.context||{})); return value; },
    async jsonContract(contract,input,init,context){const r=await managedFetch(input,init);const value=await r.json();return AGN.contracts?AGN.contracts.assert(contract,value,Object.assign({boundary:'AGN.api.jsonContract',url:urlOf(input)},context||{})):value;},
    envelope(contract,value,meta){return AGN.contracts?AGN.contracts.envelope(contract,value,meta):{schema:contract,data:value,meta:meta||{}};}
  };
  
  AGN.net = AGN.api;
})(window);
