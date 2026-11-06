
(function(){
  'use strict';
  var D=document, R=D.documentElement, G=window, KEY='agn.operator.v2';   /* v91.17.283.12: a new key, so an opt-in remembered before this build does not carry over */
  G.AGN=G.AGN||{};
  var S={on:false, eligible:null, basis:'', labels:null, rules:null};

   
  function isOn(){ return S.on; }
  isOn.eligible=function(){ return S.eligible; };
  isOn.basis=function(){ return S.basis; };
  isOn.set=function(on){ if(on && S.eligible!==true) return false; setMode(!!on,'account menu'); return S.on===!!on; };
  G.AGN.operator=isOn;
  

  (function(){ var of=G.fetch; if(!of||of.__agnView) return;
    /* v91.17.283.19 · a national item (a same-origin GET of this server that names no place: no lat, lon, unit, points, station, id or query)
       is read once per page load and kept until the bundle stamp changes (agn:levels-run, agn:now with a run); live checks, the place
       bundle, products and the user's own records are never kept */
    var NAT={}, PLACE_Q=/[?&](lat|lon|latitude|longitude|unit|units|pts|station|q|name|sector)=/i, LIVE=/^\/api\/(pointstate\/run|point|point\/batch|pointstate\/product|snapshot|shown\/.*|selfcheck\/.*|engine\/.*)$/;
    function natKey(url, init, view){ if(init&&init.method&&String(init.method).toUpperCase()!=='GET') return null;
      var u; try{ u=new URL(url, location.href); }catch(_){ return null; } if(u.origin!==location.origin||!/^\/api\//.test(u.pathname)||LIVE.test(u.pathname)||PLACE_Q.test(u.search)) return null; return view+' '+u.pathname+u.search; }
    function natDrop(){ NAT={}; }
    D.addEventListener('agn:levels-run',function(e){ if(e&&e.detail&&!e.detail.first) natDrop(); }); D.addEventListener('agn:now',function(e){ if(e&&e.detail&&e.detail.run) natDrop(); });
    /* the user's own records (the reports library, the case files) are read again after the user writes one */
    function natWrote(url){ try{ var u=new URL(url, location.href); if(/^\/api\/(reports|case)(\/|$)/.test(u.pathname)) Object.keys(NAT).forEach(function(k){ if(/ \/api\/(reports|case)(\/|\?|$)/.test(k)) delete NAT[k]; }); }catch(_){} }
    var nf=function(input, init){ var nk=null; try{ if(init&&init.method&&String(init.method).toUpperCase()!=='GET') natWrote(typeof input==='string'?input:(input&&input.url)||''); var url=typeof input==='string'?input:(input&&input.url)||'';
        var same=url.charAt(0)==='/'||url.indexOf(location.origin+'/')===0||!/^[a-z]+:/i.test(url);
        if(same && /(^|\/)api\//.test(url)){ init=init?Object.assign({},init):{}; var h=new Headers(init.headers||(typeof input!=='string'&&input&&input.headers)||{}); if(!h.has('x-agn-view')) h.set('x-agn-view',S.on?'operator':'customer'); init.headers=h; nk=typeof input==='string'?natKey(url,init,h.get('x-agn-view')):null; } }catch(_){}   /* v91.17.283.12: the server gives operator answers only on this explicit header (a loopback caller is not an operator by itself) */
      if(nk){ var c=NAT[nk]; if(!c){ var i2=Object.assign({},init); delete i2.signal; c=NAT[nk]=of.call(this,input,i2).then(function(r){ if(r.status>=500) setTimeout(function(){ if(NAT[nk]===c) delete NAT[nk]; },60000); return r; },function(e){ if(NAT[nk]===c) delete NAT[nk]; throw e; }); } return c.then(function(r){ return r.clone(); }); }
      return of.call(this,input,init); };
    nf.__agnView=true; G.fetch=nf;
    /* v283.36 · launch item 9 · own place first, national layers next, other tabs only when opened: the page-wide prefetch keeps the map's own layers only */
    var NAT_PAGE=['/api/map/layer?id=line:loc'];
    setTimeout(function(){ NAT_PAGE.forEach(function(u){ try{ G.fetch(u,{cache:'no-store'}).catch(function(){}); }catch(_){} }); },4000); })();
  function store(on){ try{ if(on) G.localStorage.setItem(KEY,'1'); else G.localStorage.removeItem(KEY); }catch(_){} }
  function setMode(on, why){
    on=!!on; if(on===S.on) return;
    S.on=on; R.classList.toggle('agn-operator',on); store(on);
    sweepAll(); setTitle(); paintAccount();
    try{ D.dispatchEvent(new CustomEvent('agn:operator',{detail:{operator:on, reason:why||''}})); }catch(_){}
    if(!on){ try{ var mv=D.querySelector('.view.active[data-view="modelab"]'); if(mv){ var ob=D.querySelector('#machNav [data-goto="overview"]'); if(ob) ob.click(); } }catch(_){} }
  }
  D.addEventListener('agn:view',function(e){ if(!S.on&&e&&e.detail&&e.detail.view==='modelab'){ setTimeout(function(){ var ob=D.querySelector('#machNav [data-goto="overview"]'); if(ob&&!S.on) ob.click(); },0); } });
  var q=null; try{ q=new URLSearchParams(G.location.search).get('operator'); }catch(_){}
  var wanted=false; try{ wanted = q==='1' ? true : (q==='0' ? false : G.localStorage.getItem(KEY)==='1'); }catch(_){ wanted = q==='1'; }
  if(q==='0') store(false);
  function ask(){
    return fetch(G.location.origin+'/api/operator/status',{cache:'no-store',credentials:'same-origin'})
      .then(function(r){ return r.ok ? r.json() : {operator:false, basis:'status '+r.status}; })
      .catch(function(){ return {operator:false, basis:'server unreachable'}; });
  }
  ask().then(function(j){
    S.eligible = !!(j && j.operator===true); S.basis = (j && j.basis) || '';
    if(S.eligible && wanted) setMode(true,'?operator=1 on this machine');
    else if(!S.eligible) store(false);
    if(!S.on && R.classList.contains('agn-operator')) R.classList.remove('agn-operator');   /* v91.17.283.17: set in the head (agn-boot) from this machine's choice; the server decides */
    paintAccount();
  });

  

  var BRAND=[
    [/\bMAch\b/g,'MACH']
    /* v91.17.283.12: the 11 rules that branded model output 'MACH forecast' on screen are removed; texts are worded by source at the source */
  ];
  var CODE=[
    [/\bWhere the fitted payload is loaded, AGN\.glofas supplies that claim/g,'Where fitted return levels are loaded, they supply that claim'],
    [/\bsee AGN\.glofas\b/g,'see the river model'],
    [/\bsourced in AGN\.transition\b/g,'sourced in the transition-policy register'],
    [/^\s*AGN\.transition\s*$/g,'Transition-policy register'],
    [/\bAs of (?:[vV]\d+(?:\.\d+)*[a-z]?|PATCH-[\w]+),?\s+(\w)/g,function(_,c){ return c.toUpperCase(); }],
    [/\s*\((?:[vV]\d{2}(?:\.\d+){1,2}[a-z]?(?:,\s*)?)+\)/g,''],
    [/\s*·\s*[vV]\d{2}(?:\.\d+){1,2}\b(?:\s*·\s*(?:decision[- ]integrity|decision record))?/g,''],
    [/\b[vV]\d{2}(?:\.\d+){1,2}\s*·\s*(?:decision[- ]integrity|decision record)\s*/g,''],
    [/(^|\s)[vV](?:8\d|9\d)(?:\.\d+){1,2}\b\s*(?:·\s*)?/g,'$1'],
    [/\bAGN(?:\.[A-Za-z_$][\w$]*)+(?:\(\))?/g,function(m){ return plainId(m); }],
    [/(?<![\w./-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w-]|\.[a-z0-9])/g,function(m){ return plainKey(m); }]
  ];
  var KEYWORD={asset_id:'asset ID',asset_name:'asset name',asset_type:'asset type',geometry_type:'geometry type',
    maximum_tolerable_downtime_hr:'maximum tolerable downtime (hours)',construction_type:'construction type',floor_elevation_m:'floor elevation (m)',
    backup_power:'backup power',active_asset_id:'active asset',temperature_2m:'2 m temperature',best_match:'best match',current_scaled:'current value scaled',
    disable_bias_correction:'the bias-correction setting'};
  function plainKey(k){
    if(KEYWORD[k]) return KEYWORD[k];
    var unit={m:' (m)',km:' (km)',hr:' (hours)',h:' (hours)',mm:' (mm)',pct:' (%)',c:' (°C)',kcs:' (thousand cusecs)'};
    var parts=k.split('_'), last=parts[parts.length-1];
    if(parts.length>2 && unit[last]) return parts.slice(0,-1).join(' ')+unit[last];
    return parts.join(' ');
  }
  function plainId(id){
    var t=id.replace(/\(\)$/,'').split('.'); var last=t[t.length-1]||'';
    var w=last.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase();
    return 'the '+w+(/threshold|setting|register|model|rule|table|ladder/.test(w)?'':' setting');
  }
  var CUST=[];               
  var QUICK_B=/MACH|MACH/, QUICK_C=null;
  function buildRules(j){
    var L=(j&&j.labels)||{}, sr=j&&j.screenRules, out=[];
    ((sr&&sr.rules)||[]).forEach(function(r){
      try{ var re=new RegExp(r[0], r[1]||'g'); var rep=String(r[2]||'').replace(/\{(\w+)\}/g,function(_,k){ return L[k]||k; });
        out.push([re,rep]); }catch(_){}
    });
    CUST=out;
    var src=out.map(function(r){ return r[0].source; }).concat(CODE.map(function(r){ return r[0].source; }));
    try{ QUICK_C=new RegExp(src.join('|')); }catch(_){ QUICK_C=/./; }
    S.labels=L; S.rules=out.length;
  }
  buildRules(null);
  fetch(G.location.origin+'/api/source-labels',{cache:'no-cache',credentials:'same-origin'})
    .then(function(r){ return r.ok?r.json():null; }).then(function(j){ if(j){ buildRules(j); sweepAll(); } }).catch(function(){});

  function collapse(t){
     
    return t.replace(/\b((?:[a-z][\w-]* ){0,3}(?:model|forecast|estimate|centre|reanalysis|feed|grid|provider|imagery|programme))((?:\s*(?:,|\/|\+| and| or)\s*\1\b)+)/g,
      function(_,w){ return /s$/.test(w) ? w : w+'s'; }).replace(/\b(model|forecast|models|forecasts) \1\b/g,'$1');
  }
  function rewrite(s, customer){
    var t=s, i;
    if(QUICK_B.test(t)) for(i=0;i<BRAND.length;i++) t=t.replace(BRAND[i][0],BRAND[i][1]);
    if(customer && QUICK_C && QUICK_C.test(t)){
      for(i=0;i<CODE.length;i++) t=t.replace(CODE[i][0],CODE[i][1]);
      var before=t;
      for(i=0;i<CUST.length;i++) t=t.replace(CUST[i][0],CUST[i][1]);
      if(t!==before) t=collapse(t);
    }
    return t;
  }
  var SKIP_TAG={SCRIPT:1,STYLE:1,TEXTAREA:1,NOSCRIPT:1,TEMPLATE:1};
  function zone(el){                          
    for(var x=el; x && x!==D.body; x=x.parentElement){
      if(SKIP_TAG[x.tagName] || x.isContentEditable) return 0;
      var c=x.classList;
      if(c && c.contains('agn-no-sweep')) return 0;
      if(c && c.contains('leaflet-control-attribution')) return 1;    
      if(x.id==='agnSourcesView' || (x.dataset && x.dataset.view==='sources')) return 1;
    }
    return 2;
  }
  var TXT=new WeakMap(), TOUCHED=[];          
  var PIN=new WeakMap();                      
  function doText(n){
    var v=n.nodeValue; if(!v || v.length<2) return;
    var pin=PIN.get(n); if(pin){ if(v===pin.out) return; PIN.delete(n); }
    var rec=TXT.get(n), src=(rec && v===rec.out) ? rec.src : v;
    if(!QUICK_B.test(src) && !(QUICK_C && !S.on && QUICK_C.test(src))) { if(rec) TXT.delete(n); return; }
    var p=n.parentElement; if(!p) return;
    var z=zone(p); if(!z) return;
    var out=rewrite(src, z===2 && !S.on);
    if(p.tagName==='CODE' && out!==src && z===2 && !S.on) p.classList.add('agn-code-plain');
    if(out!==v){ n.nodeValue=out; }
    if(out!==src){ if(!rec) TOUCHED.push(new WeakRef(n)); TXT.set(n,{src:src,out:out}); }
    else if(rec) TXT.delete(n);
  }
  var ATTR=new WeakMap(), ANAMES=['title','aria-label','placeholder'];
  function doAttrs(el){
    var rec=ATTR.get(el)||null;
    for(var i=0;i<ANAMES.length;i++){
      var a=ANAMES[i], v=el.getAttribute(a); if(v==null || v.length<3) continue;
      var r=rec&&rec[a], src=(r && v===r.out) ? r.src : v;
      if(!QUICK_B.test(src) && !(QUICK_C && !S.on && QUICK_C.test(src))) continue;
      var z=zone(el); if(!z) return;
      var out=rewrite(src, z===2 && !S.on);
      if(out!==v) el.setAttribute(a,out);
      if(out!==src){ rec=rec||{}; rec[a]={src:src,out:out}; ATTR.set(el,rec); }
    }
  }
  function sweep(root){
    if(!root) return;
    if(root.nodeType===3){ doText(root); if(!S.on && root.parentElement && root.parentElement.closest && root.parentElement.closest('#mmModels')) fixModelList(root.parentElement); return; }
    if(root.nodeType!==1 && root.nodeType!==9 && root.nodeType!==11) return;
    if(root.nodeType===1){ if(SKIP_TAG[root.tagName]) return; doAttrs(root); }
    var w=D.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while((n=w.nextNode())) doText(n);
    if(root.querySelectorAll){ var els=root.querySelectorAll('[title],[aria-label],[placeholder]'); for(var i=0;i<els.length;i++) doAttrs(els[i]); }
    fixCode(root); fixModelList(root);
  }
  function restoreAll(){
    for(var i=0;i<TOUCHED.length;i++){ var n=TOUCHED[i].deref(); if(!n) continue; var r=TXT.get(n); if(r && n.nodeValue===r.out) n.nodeValue=r.src; }
    TOUCHED=TOUCHED.filter(function(x){ return !!x.deref(); });
    for(var j=0;j<PINNED.length;j++){ var m=PINNED[j].deref(); if(!m) continue; var q=PIN.get(m); if(q && m.nodeValue===q.out){ m.nodeValue=q.src; } PIN.delete(m); }
    PINNED=[];
    D.querySelectorAll('code.agn-code-plain').forEach(function(c){ c.classList.remove('agn-code-plain'); });
    D.querySelectorAll('[data-agn-cust-hidden]').forEach(function(e){ e.classList.remove('agn-op-only'); e.removeAttribute('data-agn-cust-hidden'); });
  }
  function sweepAll(){ if(S.on) restoreAll(); if(D.body) sweep(D.body); if(!S.on) markEvidence(); }
  

  isOn.customerHtml=function(h){
    if(S.on || !h || typeof h!=='string') return h;
    var t=D.createElement('template'); t.innerHTML=h; var root=t.content;
    var credit=function(el){ for(var x=el; x; x=x.parentElement){ if(x.hasAttribute && (x.hasAttribute('data-rp-sources') || (x.classList && x.classList.contains('leaflet-control-attribution')))) return true;
        if(x.tagName==='P' && /^\s*Sources and licences\./.test(x.textContent||'')) return true; } return false; };
    var w=D.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, list=[]; while((n=w.nextNode())) list.push(n);
    list.forEach(function(n){ var p=n.parentElement; if(p && (p.tagName==='SCRIPT'||p.tagName==='STYLE')) return; var v=n.nodeValue; if(!v||v.length<2) return;
      var out=rewrite(v, !(p && credit(p))); if(out!==v) n.nodeValue=out; });
    [].slice.call(root.querySelectorAll('[title],[aria-label],[placeholder]')).forEach(function(el){ if(credit(el)) return;
      ANAMES.forEach(function(a){ var v=el.getAttribute(a); if(v&&v.length>2){ var o=rewrite(v,true); if(o!==v) el.setAttribute(a,o); } }); });
    return t.innerHTML; };
  isOn.customerText=function(s){ return (S.on||typeof s!=='string')?s:rewrite(s,true); };

  

  var PINNED=[];
  function pinText(n, out){
    var cur=n.nodeValue, pin=PIN.get(n), rec=TXT.get(n);
    var src=pin && cur===pin.out ? pin.src : (rec && cur===rec.out ? rec.src : cur);
    if(cur!==out) n.nodeValue=out;
    if(!pin) PINNED.push(new WeakRef(n));
    PIN.set(n,{src:src,out:out}); TXT.delete(n);
  }
  function firstText(el){ if(!el) return null; var w=D.createTreeWalker(el,NodeFilter.SHOW_TEXT), n; while((n=w.nextNode())) if(n.nodeValue.trim()) return n; return null; }
  function srcOf(n){ var p=PIN.get(n); if(p && n.nodeValue===p.out) return p.src; var r=TXT.get(n); return r && n.nodeValue===r.out ? r.src : n.nodeValue; }
  function fixModelList(root){
    if(S.on) return;
    var box=(root.id==='mmModels') ? root : (root.querySelector ? root.querySelector('#mmModels') : null);
    if(!box && root.closest) box=root.closest('#mmModels');
    if(!box) return;
    var rows=box.querySelectorAll('.mm-model');
    for(var i=0;i<rows.length;i++){
      var nm=firstText(rows[i].querySelector('.mm-mname')), og=firstText(rows[i].querySelector('.mm-morg'));
      if(nm) pinText(nm, 'Model '+(i<26?String.fromCharCode(65+i):(i+1)));
      if(og){
        var o=srcOf(og), bits=o.split(/\s*·\s*/).slice(1).map(function(b){ return b.trim(); });
        var ai=bits.some(function(b){ return /^(ML|AI)$/i.test(b); }), ind=/MET Norway|met\.no|Yr\b/i.test(o+' '+(nm?srcOf(nm):''));
         
        var kind=ind?'Independent provider':(ai?'AI model':'Physics model');
        var rest=bits.filter(function(b){ return /^not pooled$|^fallback$/i.test(b); }).map(function(b){ return /^not pooled$/i.test(b)?'comparison only':b; });
        if(ind && rest.indexOf('comparison only')<0) rest.push('comparison only');
        pinText(og, kind+(rest.length?' · '+rest.join(' · '):''));
      }
    }
  }
   
  function fixCode(root){
    if(S.on || !root.querySelectorAll) return;
    var codes=root.tagName==='CODE' ? [root] : root.querySelectorAll('code');
    for(var i=0;i<codes.length;i++){
      var c=codes[i], raw=(c.textContent||'').trim(), prev=c.previousSibling;
      if(raw==='AGN.hazards.alertThreshold' || raw==='the alert threshold'){
        var lvl=null; try{ var t=AGN.hazards.alertThreshold(); lvl=t&&t.label; }catch(_){}
        if(prev && prev.nodeType===3 && /the threshold this build publishes on\s*$/.test(prev.nodeValue)){
          var rec=TXT.get(prev), src=(rec&&prev.nodeValue===rec.out)?rec.src:prev.nodeValue;
          var out=src.replace(/the threshold this build publishes on\s*$/, lvl ? ('the published alert level ('+lvl+' or worse)') : 'the published alert level');
          prev.nodeValue=out; if(!rec) TOUCHED.push(new WeakRef(prev)); TXT.set(prev,{src:src,out:out});
          c.classList.add('agn-op-only'); c.setAttribute('data-agn-cust-hidden','1');
        }
      }
    }
  }
   
  var EV_HIDE=/^(Raw, processed and multi-model mean|Output provenance|Experiment register|Integrity self-test|Temporal resolution QA)/;
  function markEvidence(){
    var v=D.querySelector('.view.ml-view, .view[data-view="modelab"]'); if(!v) return;
    v.querySelectorAll('.ml-card, article.opsx-card').forEach(function(card){
      if(card.classList.contains('agn-op-only')) return;
      var h=card.querySelector('h3'); if(h && EV_HIDE.test((h.textContent||'').trim())){ card.classList.add('agn-op-only'); card.setAttribute('data-agn-cust-hidden','1'); }
    });
    v.querySelectorAll('.agn-diag-head').forEach(function(h){
      [h, h.nextElementSibling].forEach(function(e){ if(e && !e.classList.contains('agn-op-only') && !e.matches('.ml-card,.panel,section')){ e.classList.add('agn-op-only'); e.setAttribute('data-agn-cust-hidden','1'); } });
      var n=h.nextElementSibling; if(n && /verification ledger|raw dataset/i.test(n.textContent||'')){ n.classList.add('agn-op-only'); n.setAttribute('data-agn-cust-hidden','1'); }
    });
    v.querySelectorAll('div,span,small,p').forEach(function(e){
      if(e.children.length>2) return;
      var t=(e.textContent||'').trim();
      if(/^v\d{2}(?:\.\d+)*\s*·?\s*architecture\b/i.test(t) && !e.classList.contains('agn-op-only')){ e.classList.add('agn-op-only'); e.setAttribute('data-agn-cust-hidden','1'); }
    });
  }

   
  var pend=[], sched=false;
  var evT=0;
  function markEvidenceSoon(){ if(evT) return; evT=setTimeout(function(){ evT=0; if(!S.on) markEvidence(); },700); }
  function flush(){ sched=false; var list=pend; pend=[]; for(var i=0;i<list.length;i++){ var n=list[i]; if(n.isConnected) sweep(n); } if(!S.on) markEvidenceSoon(); }
  var mo=new MutationObserver(function(ms){
    for(var i=0;i<ms.length;i++){
      var m=ms[i];
      if(m.type==='characterData') pend.push(m.target);
      else if(m.type==='attributes') pend.push(m.target);
      else for(var k=0;k<m.addedNodes.length;k++) pend.push(m.addedNodes[k]);
    }
    if(pend.length && !sched){ sched=true; (G.queueMicrotask||setTimeout)(flush); }
  });

   
  var TITLE0=null;
  function setTitle(){
    var t=D.querySelector('title'); if(!t) return;
    var cur=D.title;
    if(TITLE0==null || (cur!==customerTitle(TITLE0) && cur!==TITLE0)) TITLE0=cur;
    var want=S.on ? TITLE0 : customerTitle(TITLE0);
    if(D.title!==want) D.title=want;
  }
  function customerTitle(t){ return String(t||'').replace(/\s*[vV]\d{2}(?:\.\d+){1,2}\s*·\s*Decision (?:Integrity|Record)\s*/i,' ').replace(/\s*[vV]\d{2}(?:\.\d+){1,2}\b/g,'').replace(/\s{2,}/g,' ').replace(/^\s*·\s*|\s*·\s*$/g,'').trim(); }

   
  var BACKS=['agnIntegrationBack','agnProviderBack','agnQueueBack','agnGovernanceBack','agnQualityBack','agnEnterpriseSecurityBack',
             'agnStagingAcceptanceBack','agnOperationalHandoverBack','agnNationalArchiveBack','agnUrbanHeatBack'];
  D.addEventListener('keydown',function(e){
    if(e.key!=='Escape' && e.key!=='Esc') return;
    if(closeAccount(true)){ e.preventDefault(); return; }
    for(var i=0;i<BACKS.length;i++){
      var b=D.getElementById(BACKS[i]); if(!b) continue;
      var r=b.getBoundingClientRect(); if(!(r.width>0 && r.height>0) || getComputedStyle(b).display==='none' || getComputedStyle(b).visibility==='hidden') continue;
      var x=b.querySelector('[class$="-close"],button[aria-label="Close"]');
      if(x) x.click(); else b.style.display='none';
      e.preventDefault(); e.stopPropagation();
      var opener=D.getElementById('agnBackendPill'); if(BACKS[i]==='agnIntegrationBack' && opener && S.on) try{ opener.focus(); }catch(_){}
      return;
    }
  },true);

   
  var BTN=null, MENU=null;
  function mountAccount(){
    if(BTN && BTN.isConnected) return;
    var old=D.querySelector('header.topbar .avatar'); if(!old) return;
    var b;
    if(old.tagName==='BUTTON'){ b=old; } else {
      b=D.createElement('button'); b.type='button'; b.className=old.className; b.textContent=(old.textContent||'AJ').trim();
      old.parentNode.replaceChild(b, old);
    }
    b.classList.add('agn-acct-btn'); b.id='agnAccountBtn';
    b.setAttribute('aria-haspopup','menu'); b.setAttribute('aria-expanded','false'); b.setAttribute('aria-controls','agnAccountMenu');
    b.setAttribute('aria-label','Account: '+(b.textContent||'').trim()); b.removeAttribute('tabindex');
    b.addEventListener('click',function(e){ e.stopPropagation(); if(MENU && !MENU.hidden) closeAccount(false); else openAccount(); });
    b.addEventListener('keydown',function(e){ if(e.key==='ArrowDown'){ e.preventDefault(); openAccount(); } });
    BTN=b;
    if(!MENU){
      MENU=D.createElement('div'); MENU.id='agnAccountMenu'; MENU.setAttribute('role','menu'); MENU.setAttribute('aria-labelledby','agnAccountBtn'); MENU.hidden=true;
      MENU.className='agn-no-sweep';
      D.body.appendChild(MENU);
      MENU.addEventListener('keydown',function(e){
        var items=[].slice.call(MENU.querySelectorAll('[role=menuitemcheckbox],[role=menuitem]'));
        var i=items.indexOf(D.activeElement);
        if(e.key==='ArrowDown'){ e.preventDefault(); if(items.length) items[(i+1)%items.length].focus(); }
        else if(e.key==='ArrowUp'){ e.preventDefault(); if(items.length) items[(i-1+items.length)%items.length].focus(); }
        else if(e.key==='Tab'){ closeAccount(false); }
      });
      D.addEventListener('click',function(e){ if(MENU && !MENU.hidden && !MENU.contains(e.target) && e.target!==BTN) closeAccount(false); });
    }
    paintAccount();
  }
  function paintAccount(){
    if(!MENU) return;
    var who=BTN ? (BTN.textContent||'').trim() : '';
    var h='<div class="agn-acct-id" role="presentation"><b>'+esc(who||'Account')+'</b><span>NIGRAAN workspace · '+(S.on?'operator view':'customer view')+'</span></div>';
    if(S.eligible===true){
      h+='<button type="button" role="menuitemcheckbox" aria-checked="'+(S.on?'true':'false')+'" data-agn-op-toggle="1">Operator mode <i>'+(S.on?'On':'Off')+'</i></button>'
        +'<div class="agn-acct-note" role="presentation">'+(S.on?'Engineering consoles, QA output and version tags are shown.':'Shown only on this computer.')+'</div>';
    } else {
      h+='<div class="agn-acct-note" role="presentation">Profile: '+esc(who||'—')+'</div>';
    }
    MENU.innerHTML=h;
    var t=MENU.querySelector('[data-agn-op-toggle]');
    if(t) t.addEventListener('click',function(){ isOn.set(!S.on); var n=MENU.querySelector('[data-agn-op-toggle]'); if(n) n.focus(); });
  }
  function openAccount(){
    if(!BTN||!MENU) return; paintAccount();
    var r=BTN.getBoundingClientRect(); MENU.hidden=false;
    var w=MENU.offsetWidth||240;
    MENU.style.top=Math.round(r.bottom+8)+'px'; MENU.style.left=Math.max(8, Math.round(Math.min(r.right, G.innerWidth-8)-w))+'px';
    BTN.setAttribute('aria-expanded','true');
    var f=MENU.querySelector('[role=menuitemcheckbox],[role=menuitem]'); try{ (f||MENU).focus(); }catch(_){}
    if(!f){ MENU.tabIndex=-1; try{ MENU.focus(); }catch(_){} }
  }
  function closeAccount(focusBack){
    if(!MENU || MENU.hidden) return false;
    MENU.hidden=true; if(BTN){ BTN.setAttribute('aria-expanded','false'); if(focusBack!==false || MENU.contains(D.activeElement)) try{ BTN.focus(); }catch(_){} }
    return true;
  }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

   
  var TOAST=null, toastT=0;
  function toast(msg){
    if(!TOAST){ TOAST=D.createElement('div'); TOAST.id='agnToast'; TOAST.setAttribute('role','status'); TOAST.setAttribute('aria-live','polite'); TOAST.className='agn-no-sweep'; D.body.appendChild(TOAST); }
    TOAST.textContent=msg; TOAST.classList.add('agn-show'); clearTimeout(toastT); toastT=setTimeout(function(){ TOAST.classList.remove('agn-show'); },2200);
  }
  G.AGN.toast=G.AGN.toast||toast;
  function wireBrief(){
    var lab=D.getElementById('exportLabel'); if(!lab || lab.__agnToast) return; lab.__agnToast=1;
    new MutationObserver(function(){ if((lab.textContent||'').trim()==='Copied') toast('Brief copied'); }).observe(lab,{childList:true,characterData:true,subtree:true});
  }

  function start(){
    R.classList.toggle('agn-operator',S.on||(S.eligible===null&&wanted));   /* v91.17.283.40 · kept until the server has answered (layout jump) */
    mountAccount(); wireBrief(); setTitle(); sweepAll();
    mo.observe(D.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ANAMES});
    var t=D.querySelector('title'); if(t) new MutationObserver(function(){ setTitle(); }).observe(t,{childList:true,characterData:true,subtree:true});
     
    var n=0, iv=setInterval(function(){ mountAccount(); wireBrief(); setTitle(); if(++n>30) clearInterval(iv); },1000);
  }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',start); else start();
})();
