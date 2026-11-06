/* ══ v91.17.283.48 · "WHAT TO DO HERE" PANEL (classic analyst page) · served as /agn-guidance.js only with GUIDANCE_PANEL=1 ════════════════════
   Mounted under the place's hazard levels: Overview (under the map and its place levels) and Client Risk (under the site workspace head).
   The page computes nothing: every item, rule, right, contact, level and applicability line is the server's (GET /api/guidance, the
   library data/guidance; no text is generated). Audience: public, business / site, district official (v1); the choice is remembered in
   this browser. Every item carries its source link; Copy puts the line and its source on the clipboard. The operator view shows the
   items customers do not see, flagged with the reason. */
(function(){
  'use strict';
  var D=document, W=window, KEY='agn.guidance.audience', LKEY='agn.guidance.lang';
  if(W.__agnGuidance) return; W.__agnGuidance=1;
  var css=D.createElement('link'); css.rel='stylesheet'; css.href='/agn-guidance.css'; D.head.appendChild(css);
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function get(k,d){ try{ var v=localStorage.getItem(k); return v||d; }catch(_){ return d; } }
  function put(k,v){ try{ localStorage.setItem(k,v); }catch(_){} }
  function isOp(){ try{ return !!(W.AGN&&AGN.operator&&AGN.operator()); }catch(_){ return false; } }
  function point(){ var p=null; try{ p=W.AGN&&AGN.data&&AGN.data.activePoint&&AGN.data.activePoint(); }catch(_){ p=null; } return p&&p.lat!=null&&p.lon!=null?{lat:+p.lat,lon:+p.lon}:null; }
  var S={aud:get(KEY,'public'),lang:get(LKEY,'en'),hz:null,tab:'do',data:null,key:null,busy:false,err:null};
  var MOUNTS=[
    {id:'agnGuidanceOverview', where:function(){ var g=D.querySelector('.view[data-view="overview"] .overview-map-grid'); return g?{after:g}:null; }},
    {id:'agnGuidanceClientRisk', where:function(){ var h=D.querySelector('#machAssessmentWorkspace .asmt-hero'); return h?{after:h}:null; }}
  ];
  function mount(){ MOUNTS.forEach(function(m){ if(D.getElementById(m.id)) return; var w=m.where(); if(!w) return;
    var s=D.createElement('section'); s.id=m.id; s.className='agng'; s.setAttribute('aria-label','What to do here'); s.setAttribute('data-agn-guidance','panel');
    w.after.parentNode.insertBefore(s,w.after.nextSibling); paint(s); }); }
  function load(force){ var p=point(); if(!p){ S.data=null; S.err='Choose a place at the top of the page to see what to do there.'; paintAll(); return; }
    var k=p.lat.toFixed(4)+','+p.lon.toFixed(4)+'|'+S.aud+'|'+S.lang+'|'+(isOp()?'op':'cu'); if(k===S.key&&!force) return; S.key=k; S.busy=true; paintAll();
    var u='/api/guidance?lat='+p.lat.toFixed(5)+'&lon='+p.lon.toFixed(5)+'&audience='+encodeURIComponent(S.aud)+'&lang='+encodeURIComponent(S.lang);
    fetch(u,{cache:'no-store'}).then(function(r){ return r.json().catch(function(){ return {ok:false,why:'the server answered '+r.status}; }); },function(){ return {ok:false,why:'the server could not be reached'}; })
      .then(function(j){ if(S.key!==k) return; S.busy=false; S.data=j&&j.ok?j:null; S.err=j&&j.ok?null:((j&&j.why)||'not available');
        if(S.data){ var hz=S.data.hazards.filter(function(h){ return h.status==='level'||h.status==='standing'||h.status==='exposure'; });
          var rank={act:4,watch:3,monitor:2,exposure:1,standing:0}; hz.sort(function(a,b){ return (rank[b.guidanceLevel]||0)-(rank[a.guidanceLevel]||0); });
          if(!S.hz||!S.data.hazards.some(function(h){ return h.hazard===S.hz; })) S.hz=(hz[0]||S.data.hazards[0]||{}).hazard||null; }
        paintAll(); try{ D.dispatchEvent(new CustomEvent('agn:guidance',{detail:S.data})); }catch(_){} }); }
  function srcLinks(it){ var s=it.source||{}, h='';
    if(s.url) h+='<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer" title="'+esc(s.section||s.doc||'')+'">Source: '+esc(s.doc||s.short||'source')+(s.section&&s.id!=='ndrr'&&s.section.length<40?' '+esc(s.section):'')+'</a>';
    else h+='<span class="agn-flag agng-flag">'+esc(s.short||'No official source')+'</span>';
    if(s.lawUrl&&s.lawUrl!==s.url) h+='<a href="'+esc(s.lawUrl)+'" target="_blank" rel="noopener noreferrer" title="'+esc(s.title||'')+'">Library entry: '+esc(s.short||'law or plan')+'</a>';
    h+='<button type="button" data-agng-copy="'+esc(it.id)+'">Copy</button>';
    if(it.flagged) h+='<span class="agng-flag">'+esc(it.customerHiddenWhy||(it.conditions?'location fact not confirmed':'operator view only'))+'</span>';
    if(isOp()) h+='<span>'+esc(it.id)+' · '+esc(it.status)+'</span>';
    if(it.langNote) h+='<span>'+esc(it.langNote)+'</span>';
    return h; }
  function itemHtml(it){ var c=''; if(it.conditions) for(var k in it.conditions){ var x=it.conditions[k]; c+='<span>'+esc((x.met===true?'Applies here: ':x.met===null?'Could not check: ':'')+x.why)+'</span>'; }
    return '<div class="agng-item" dir="'+(it.lang==='ur'?'rtl':'ltr')+'"><p>'+esc(it.text)+'</p><div class="agng-why">'+srcLinks(it)+c+(it.jurisdictionNote?'<span>'+esc(it.jurisdictionNote)+'</span>':'')+'</div></div>'; }
  function list(items,more){ var h=(items||[]).map(itemHtml).join(''); if(more&&more.length) h+='<details class="agng-more"><summary>Show '+more.length+' more</summary>'+more.map(itemHtml).join('')+'</details>'; return h; }
  function hidden(o){ if(!o||!isOp()) return ''; var t=[]; for(var k in o) t.push(o[k]+' hidden from customers: '+k); return t.length?'<p class="agng-msg">'+esc(t.join('; '))+'</p>':''; }
  function body(H){ var G=S.data;
    if(S.tab==='contacts'){ var C=G.contacts; return (C.items.length?C.items.map(function(c){ return '<div class="agng-contact"><div><b>'+esc(c.name)+'</b><span>'+esc(c.note||'')+'</span>'+(c.source?' <a href="'+esc(c.source)+'" target="_blank" rel="noopener noreferrer">source</a>':'')+(isOp()&&c.customerHiddenWhy?' <span class="agng-flag">'+esc(c.customerHiddenWhy)+'</span>':'')+(c.districtNote?' <span class="agng-flag">'+esc(c.districtNote)+'</span>':'')+'</div><div>'+(c.phone||[]).map(function(n){ return '<a href="tel:'+esc(String(n).replace(/[^0-9+]/g,''))+'">'+esc(n)+'</a>'; }).join(' ')+'</div></div>'; }).join(''):'<p class="agng-msg">'+esc(C.message||'')+'</p>')+(C.note?'<p class="agng-msg">'+esc(C.note)+'</p>':'')+(isOp()&&C.hiddenFromCustomers?'<p class="agng-msg">'+esc(C.hiddenFromCustomers+' contact(s) hidden from customers (not officially published or not found)')+'</p>':''); }
    if(!H) return '<p class="agng-msg">No hazard selected.</p>';
    if(H.status==='not_relevant'||H.status==='no_level'||H.status==='coming') return '<p class="agng-line">'+esc(H.line)+'</p>';
    var T=H.tabs;
    if(S.tab==='do') return (H.glofNote?'<p class="agng-msg">'+esc(H.glofNote)+'</p>':'')+T.do.phases.map(function(p){ return (p.items.length||p.more.length?'<p class="agng-phase">'+esc(p.title)+'</p>'+list(p.items,p.more):'')+hidden(p.hiddenFromCustomers); }).join('')+(T.do.message?'<p class="agng-msg">'+esc(T.do.message)+'</p>':'');
    if(S.tab==='rules') return list(T.rules.items)+(T.rules.message?'<p class="agng-msg">'+esc(T.rules.message)+'</p>':'')+hidden(T.rules.hiddenFromCustomers);
    if(S.tab==='rights') return list(T.rights.items)+(T.rights.duties.length?'<p class="agng-phase">Your duties</p>'+list(T.rights.duties):'')+(T.rights.message?'<p class="agng-msg">'+esc(T.rights.message)+'</p>':'')+hidden(T.rights.hiddenFromCustomers);
    return ''; }
  function paint(el){ var G=S.data, h='<h3>What to do here</h3>';
    if(!G){ el.innerHTML=h+'<p class="agng-sub">'+esc(S.busy?'Loading the guidance for this place…':(S.err||'Loading…'))+'</p>'; return; }
    var P=G.place||{}; h+='<p class="agng-sub">'+esc([P.tehsil,P.district,P.province].filter(Boolean).join(', '))+(isOp()?' \u00b7 the place\u2019s served levels, highest of today and the next 3 days':'')+'</p>';
    h+='<div class="agng-row"><label for="'+el.id+'Aud">I am</label><select id="'+el.id+'Aud" data-agng-aud="1">'+G.audiences.map(function(a){ return '<option value="'+esc(a.id)+'"'+(a.id===G.audience?' selected':'')+'>'+esc(a.label)+'</option>'; }).join('')+'</select>'
      +'<label for="'+el.id+'Lang">Language</label><select id="'+el.id+'Lang" data-agng-lang="1"><option value="en"'+(G.lang==='en'?' selected':'')+'>English</option><option value="ur"'+(G.lang==='ur'?' selected':'')+'>اردو</option></select></div>';
    if(G.langNote) h+='<p class="agng-msg">'+esc(G.langNote)+'</p>';
    h+='<div class="agng-hz" role="group" aria-label="Hazard">'+G.hazards.map(function(x){ var w=x.status==='level'||x.status==='standing'||x.status==='exposure'?((x.level.word?x.level.word+' · ':'')+x.label):x.status==='not_relevant'?'not relevant':x.status==='no_level'?'no level':'coming'; return '<button type="button" data-agng-hz="'+esc(x.hazard)+'" aria-pressed="'+(x.hazard===S.hz)+'">'+esc(x.name)+': '+esc(w)+'</button>'; }).join('')+'</div>';
    var H=G.hazards.filter(function(x){ return x.hazard===S.hz; })[0]||null;
    var tabs=[['do','Do now'],['rules','Rules here'],['rights','Your rights'],['contacts','Contacts']];
    h+='<div class="agng-tabs" role="tablist">'+tabs.map(function(t){ return '<button type="button" role="tab" data-agng-tab="'+t[0]+'" aria-selected="'+(S.tab===t[0])+'">'+t[1]+'</button>'; }).join('')+'</div>';
    h+='<div role="tabpanel">'+body(H)+'</div>';
    var L=G.library||{}; h+='<div class="agng-foot">Guidance library '+esc(L.version)+(L.reviewer?' \u00b7 reviewed by '+esc(L.reviewer):'')+' \u00b7 checked against official text '+esc(L.verifiedOn)+'. '+esc(G.footer)+(isOp()&&L.reviewerNote?' '+esc(L.reviewerNote):'')+(isOp()&&G.officialWarningNote?' '+esc(G.officialWarningNote):'')+'</div>';
    el.innerHTML=h; }
  function paintAll(){ MOUNTS.forEach(function(m){ var e=D.getElementById(m.id); if(e) paint(e); }); }
  function itemById(id){ var G=S.data; if(!G) return null; var f=null; G.hazards.forEach(function(H){ if(!H.tabs) return; H.tabs.do.phases.forEach(function(p){ p.items.concat(p.more).forEach(function(i){ if(i.id===id) f=i; }); }); ['rules','rights'].forEach(function(t){ (H.tabs[t].items||[]).concat(H.tabs[t].duties||[]).forEach(function(i){ if(i.id===id) f=i; }); }); }); return f; }
  D.addEventListener('click',function(e){ var x=e.target&&e.target.closest?e.target.closest('[data-agng-hz],[data-agng-tab],[data-agng-copy]'):null; if(!x||!x.closest('.agng')) return;
    if(x.hasAttribute('data-agng-hz')){ S.hz=x.getAttribute('data-agng-hz'); paintAll(); return; }
    if(x.hasAttribute('data-agng-tab')){ S.tab=x.getAttribute('data-agng-tab'); paintAll(); return; }
    var it=itemById(x.getAttribute('data-agng-copy')); if(!it) return; var s=it.source||{}; var t=it.text+' (Source: '+(s.doc||s.short||'')+(s.url?', '+s.url:'')+')';
    try{ (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ x.textContent='Copied'; },function(){ x.textContent='Copy failed'; }); }catch(_){ x.textContent='Copy failed'; } });
  D.addEventListener('change',function(e){ var x=e.target; if(!x||!x.closest||!x.closest('.agng')) return;
    if(x.hasAttribute('data-agng-aud')){ S.aud=x.value; put(KEY,S.aud); load(true); }
    if(x.hasAttribute('data-agng-lang')){ S.lang=x.value; put(LKEY,S.lang); load(true); } });
  ['agn:location','agn:data','agn:operator'].forEach(function(ev){ D.addEventListener(ev,function(){ setTimeout(function(){ mount(); load(false); },200); }); });
  var n=0; (function boot(){ mount(); load(false); if(++n<40) setTimeout(boot, n<10?700:4000); })();
  setInterval(function(){ mount(); load(false); },15000);
  W.AGN=W.AGN||{}; AGN.guidance={ data:function(){ return S.data; }, reload:function(){ load(true); } };
})();
