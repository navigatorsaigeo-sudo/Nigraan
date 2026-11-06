


(function(G){'use strict';
  var D=G.document, AGN=G.AGN=G.AGN||{};
  function $(i){ return D.getElementById(i); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function txt(e){ return e?String(e.textContent||'').replace(/\s+/g,' ').trim():''; }
  function op(e){ if(e&&!e.classList.contains('agn-op-only')){ e.classList.add('agn-op-only'); e.setAttribute('data-agn-u2','op'); } }
  function idle(e,on){ if(!e) return; if(on&&!e.classList.contains('agn-idle')) e.classList.add('agn-idle'); else if(!on&&e.classList.contains('agn-idle')) e.classList.remove('agn-idle'); }
  function setText(e,t){ if(e&&e.textContent!==t) e.textContent=t; }
  function project(){ try{ return AGN.project&&AGN.project.state?AGN.project.state():null; }catch(_){ return null; } }
   
  function projectOpen(){ var p=project(); return !!(p&&p.company&&p.company.client_name); }
  AGN.cleanup=AGN.cleanup||{}; AGN.cleanup.projectOpen=projectOpen;
  var IDLE=/^(not run\.?|not run for this location|not evaluated yet\.?|no register loaded\.?|cmip6 request running \/ status pending\.?|not loaded\b.*|not measured|pending|loading)$/i;

   
  var HERO_CUST='The forecast for the selected place: conditions now, the next 72 hours hour by hour, the next 15 days, weeks 1–6, the season ahead and the 2050s.';
  function forecast(){
    var v=$('agn-panel-livedata')||D.querySelector('.view[data-view="livedata"]'); if(!v) return;
    ['omLiveSection','synbar','mverifyCard','agnMosLine','agnLczCell','agnUrbanHeatStrip','agnStateRows'].forEach(function(id){ op($(id)); });
    var hero=v.querySelector(':scope > .agn-hero'); if(hero){ var p0=hero.querySelector('p:not(.agn-cust-hero)');
      if(p0){ op(p0); if(!hero.querySelector('.agn-cust-hero')){ var pc=D.createElement('p'); pc.className='agn-cust-hero agn-cust-only'; pc.textContent=HERO_CUST; hero.appendChild(pc); } } }
     
    var pv=$('predVal'); if(pv){ var chip=pv.closest('.model-chip'); idle(chip, /^[—–-]?$/.test(txt(pv))); }
    var fl=$('agnFloodBand'); if(fl){ var cell=fl.closest('.ops-cell'); idle(cell, /^(loading|—|)$/i.test(txt(fl)) || /no active location/i.test(txt($('agnFloodNote')))); }
    idle($('agnEnsState'), IDLE.test(txt($('agnEnsState'))));
    idle($('agnV91CmipStatus'), IDLE.test(txt($('agnV91CmipStatus'))));
     
    var rows=$('agnV91CmipRows'); if(rows){ var tw=rows.closest('table'); idle(tw&&tw.parentNode, /^not loaded\b/i.test(txt(rows))); }
     
    if($('agnHz87')) return;
     
    var fold=$('agnFcMore');
    if(!fold && ($('agnEnsSection')||$('agnV91CmipCard'))){
      fold=D.createElement('details'); fold.id='agnFcMore';
      fold.innerHTML='<summary>More forecast detail <small>forecast interval from two ensemble systems · 2030s and 2050s climate change</small></summary><div class="agn-fcmore-body"></div>';
    }
    if(fold){ var body=fold.querySelector('.agn-fcmore-body');
      ['agnEnsSection','agnV91CmipCard'].forEach(function(id){ var e=$(id); if(e&&e.parentNode!==body) body.appendChild(e); }); }
     
    var want=[v.querySelector(':scope > .agn-v91-story-head'), v.querySelector(':scope > .tab-purpose'), hero, $('synbar'), $('omLiveSection'),
      v.querySelector(':scope > section.live-summary-row'), v.querySelector(':scope > section.premium-deck'), $('agnOutlookInline'),
      v.querySelector(':scope > section.rail-flow'), $('mmSection'), v.querySelector(':scope > .timewrap'),
      fold].filter(function(e){ return e && (e.parentNode===v || e===fold || e.id==='agnOutlookInline'); });
    var need=false, kids=[].slice.call(v.children).filter(function(c){ return want.indexOf(c)>=0; });
    if(kids.length!==want.length) need=true; else for(var i=0;i<want.length;i++) if(kids[i]!==want[i]){ need=true; break; }
    if(need){ var anchor=want[0]; for(var j=1;j<want.length;j++){ var e=want[j]; if(anchor.nextElementSibling!==e) v.insertBefore(e, anchor.nextElementSibling); anchor=e; } }
  }

   
  function operations(){
    var v=$('agn-panel-operations'); if(!v) return;
    v.querySelectorAll('#opsxHorizon button[aria-disabled="true"]').forEach(op);
    v.querySelectorAll('.backend-req-btn').forEach(op);
    v.querySelectorAll('.opsx-governance span').forEach(function(s){ if(/backend|contract/i.test(txt(s))) op(s); });
    v.querySelectorAll('.opsx-kpi').forEach(function(k){ var b=k.querySelector('b'); if(/^data not connected$/i.test(txt(b))) op(k); });
    v.querySelectorAll('article.opsx-card').forEach(function(c){ var h=c.querySelector('h3'); if(h&&/^command readiness$/i.test(txt(h))) op(c); });
    ['assetBody','skillBody','assetState'].forEach(function(id){ var e=$(id), t=txt(e); idle(e, IDLE.test(t)||/^no register loaded\b/i.test(t)); });
    var sk=$('skillStamp'); idle(sk, IDLE.test(txt(sk)));
    var cc=$('crossCard'); if(cc) cc.querySelectorAll('div,span,p').forEach(function(e){ if(e.children.length===0) idle(e, IDLE.test(txt(e))); });
  }

   
  function assets(){
    op($('agnLegacyClientDelete')); op($('agnV9116Contracts'));
    var c=$('asmtConfidence');
    if(c){ var t=txt(c), m=t.match(/^([^·]{1,24}?)\s*·\s*(.+)$/), k=c.parentNode, d=k.querySelector('small.agn-kpi-detail');
      if(m){ if(!d){ d=D.createElement('small'); d.className='agn-kpi-detail'; k.insertBefore(d, c.nextSibling); }
        setText(d, m[2]); setText(c, m[1]); }
      else if(d && c.getAttribute('data-agn-u2-split')!==t){ setText(d,''); }
      c.setAttribute('data-agn-u2-split', txt(c)); }
    D.querySelectorAll('[id^="agnSubjectStrip-"]').forEach(function(s){
      var t=txt(s), cust=s.nextElementSibling&&s.nextElementSibling.classList.contains('agn-subj-cust')?s.nextElementSibling:null;
      var mm=/missing:[^.]*\bactive asset\b/i.test(t);
      if(!mm){ if(cust){ cust.remove(); } if(s.getAttribute('data-agn-u2')==='op'){ s.classList.remove('agn-op-only'); s.removeAttribute('data-agn-u2'); } return; }
      var reading=(t.match(/This workspace is reading:\s*([^.]+)\./)||t.match(/Subject unit:\s*([^.]+)\./)||[])[1];
      var msg=(/assessments$/.test(s.id)?'Pick an asset in the client project below to tie this page to it.':'Pick an asset in the Assets tab to tie this page to it.')+(reading?' Until then it shows the selected place: '+reading.trim()+'.':'');
      if(!cust){ cust=D.createElement('div'); cust.className='agn-subj-cust agn-cust-only'; cust.setAttribute('role','note'); s.parentNode.insertBefore(cust, s.nextSibling); }
      setText(cust,msg); op(s);
    });
  }

   
  function spatial(){
    D.querySelectorAll('#agnAssetEvidenceProfileBody .agn-v9116-oef > span').forEach(function(s){
      var b=s.querySelector('b'), rest=txt(s).slice(txt(b).length).trim();
      if(/^(planned|partial)\b/i.test(rest)) op(s);
    });
  }

   
   
  function wrapViz(){
    var V=AGN.viz; if(!V||!V.coverage||V.coverage.__u2) return false;
    var orig=V.coverage;
    var fn=function(a,b,c,o){ var h=orig.apply(this,arguments), t=(o&&o.title)||'';
      var L=(o&&o.labels)||(/^Sources by retrieval coverage/i.test(t)?['complete','partial','not retrieved']:null);
      if(!L||typeof h!=='string') return h;
      return h.replace(/>live (\d+)</g,'>'+L[0]+' $1<').replace(/>estimated (\d+)</g,'>'+L[1]+' $1<').replace(/>unavailable (\d+)</g,'>'+L[2]+' $1<')
              .replace(/(\d+) live, (\d+) estimated, (\d+) unavailable of (\d+)/g,'$1 '+L[0]+', $2 '+L[1]+', $3 '+L[2]+' of $4'); };
    fn.__u2=true; V.coverage=fn;
    try{ if(AGN.sustain&&AGN.sustain.renderFabric) AGN.sustain.renderFabric(); }catch(_){}
    return true;
  }
  var COPY={};
  var NAMES=null;
  

  function names(){
    var map={}, long2tab={}, n=0;
    D.querySelectorAll('#machNav button[id^="agn-tab-"]').forEach(function(b){ var v=b.id.slice(8), lab=txt(b.querySelector('.nav-label')||b).replace(/^\d+\s*/,''); if(lab){ map[v]=lab; n++; } });
    if(n<5) return null;
    D.querySelectorAll('.view .agn-v91-story-head .agn-v91-head-line > b').forEach(function(b){
      var view=b.closest('.view'), v=view&&(view.getAttribute('data-view')||String(view.id||'').replace(/^agn-panel-/,'')); if(!v||!map[v]) return;
      var old=b.getAttribute('data-agn-long')||txt(b); if(!b.getAttribute('data-agn-long')) b.setAttribute('data-agn-long',old);
      long2tab[old]=map[v]; long2tab[txt(b)]=map[v]; if(COPY[v]) long2tab[COPY[v]]=map[v];
    });
    NAMES={tab:map,long2tab:long2tab}; return NAMES;
  }
  function headings(){
    var N=names(); if(!N) return;
    D.querySelectorAll('.view .agn-v91-story-head .agn-v91-head-line > b').forEach(function(b){
      var view=b.closest('.view'), v=view&&(view.getAttribute('data-view')||String(view.id||'').replace(/^agn-panel-/,'')), tab=N.tab[v]; if(!tab) return;
      var old=b.getAttribute('data-agn-long')||txt(b); if(!b.getAttribute('data-agn-long')){ b.setAttribute('data-agn-long',old); N.long2tab[old]=tab; }
      var want=old.toLowerCase().indexOf(tab.toLowerCase())===0?old:(COPY[v]||tab);
      setText(b,want); N.long2tab[want]=tab;
    });
  }

   
  var T=0, last=0;
  function sweep(){ T=0; last=Date.now();
    [forecast,operations,assets,spatial,headings,wrapViz].forEach(function(f){ try{ f(); }catch(e){ try{ (G.console||{}).debug&&console.debug('[cleanup_ui]',f.name,e&&e.message); }catch(_){} } });
  }
  function soon(){ if(T) return; var wait=Math.max(250,1500-(Date.now()-last));     T=setTimeout(sweep,wait); }
  AGN.cleanup.sweep=sweep; AGN.cleanup.names=function(){ return NAMES; };
  function start(){
    sweep();
    

    try{ AGN.cleanup.observer=new MutationObserver(soon); AGN.cleanup.observer.observe(D.body,{childList:true,subtree:true}); }catch(_){ setInterval(sweep,10000); document.addEventListener('agn:dom',sweep); }
    ['agn:view','agn:project','agn:active-asset','agn:operator','agn:location'].forEach(function(n){ D.addEventListener(n,soon); });
  }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',start); else start();
})(window);
