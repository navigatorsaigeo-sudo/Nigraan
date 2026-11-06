
(function(){
  

  var root=document.documentElement, KEY='agn.view.v1';
  var full=false; try{ full=new URLSearchParams(location.search).get('view')==='full' || localStorage.getItem(KEY)==='full'; }catch(_){}
  function apply(){ root.classList.toggle('agn-clean',!full); var b=document.getElementById('agnViewToggle'); if(b) b.textContent=full?'Clean view':'Full detail'; }
  function tidy(scope){
    (scope||document).querySelectorAll('.mp-ev:not([data-agn-tidy])').forEach(function(ev){    
      if(ev.dataset.agnTidy) return; ev.dataset.agnTidy='1';
      var spans=ev.children, onlyWhy=spans.length&&spans[0].querySelector('i');
      Array.prototype.forEach.call(spans,function(s){
        var t=(s.textContent||'').trim();
        if(t==='measured') s.classList.add('agn-chip-measured');
        if(/^index \d+\/100$/.test(t)) s.classList.add('agn-index-dup');
      });
      if(/^the 0-100 index ranks severity WITHIN/.test((ev.textContent||'').trim())){ ev.classList.add('agn-quiet'); return; }
      if(onlyWhy && /did not arrive|no physical quantity/.test(spans[0].textContent)){
        var rest=Array.prototype.some.call(spans,function(s,i){ return i>0 && !s.classList.contains('agn-chip-measured') && !s.classList.contains('agn-index-dup'); });
        if(!rest) ev.classList.add('agn-quiet');
      }
    });
  }
  function mount(){
    apply();
    if(!document.getElementById('agnViewToggle')){ var b=document.createElement('button'); b.id='agnViewToggle'; b.type='button';
      b.onclick=function(){ full=!full; try{localStorage.setItem(KEY,full?'full':'clean');}catch(_){} apply(); }; document.body.appendChild(b); apply(); }
    (function pill(){ var el=document.createElement('button'); el.id='agnBackendPill'; el.type='button'; el.textContent='Backend: checking';
      el.title='Local backend status. Click for the integration console.';
      el.onclick=function(){ try{ AGN.integration.render(); }catch(_){} }; document.body.appendChild(el);
      function upd(){ var d=null; try{ d=AGN.integration.diagnostics(); }catch(_){}
        var on=!!(d&&d.mode==='development-connected');
        

        fetch(location.origin+'/api/health',{cache:'no-store'})
          .then(function(r){ return r.ok?r.json():null; }).then(function(j){
            var lr=j&&j.data&&j.data.latestRun; el.dataset.state=on?'on':(j?'up':'off');
            var t=lr&&lr.completed_at?new Date(lr.completed_at).toLocaleTimeString('en-GB', {timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):null;
            el.textContent='Backend: '+(on?'connected':(j?'running':'offline'))+(lr?(' · '+(t?('run '+t+' · '):'run in progress · ')+lr.coverage+'%'):(j&&j.data?' · first run pending':'')); var G=window.__agnDrought; if(G&&G.state==='running') el.textContent+=' · drought '+(G.done+G.failed)+'/'+G.total;
          }).catch(function(){ el.dataset.state='off'; el.textContent='Backend: offline'; });
      }
      upd(); setInterval(upd,60000); })();
    

    (function climAnchors(n){
      var D=window.DISTRICT_IN||{};
      var ready=Object.keys(D).some(function(k){ return D[k] && D[k].weatherLive; });
      if(!ready) return n<900 && setTimeout(function(){ climAnchors(n+1); },1000);    
      var key2uid={};
      try{ ((window.PK_DISTRICTS&&PK_DISTRICTS.features)||[]).forEach(function(f){
             var q=f.properties||{}; if(q.key&&q.uid) key2uid[q.key]=q.uid; }); }catch(_){}
      fetch(location.origin+'/api/climatology/thresholds',{cache:'no-store'})
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(j){
          if(!j||!j.ready||!j.thresholds) return;
          var T=j.thresholds, hit=0, miss=0;
          Object.keys(D).forEach(function(k){
            var uid=key2uid[k]||k, t=T[uid];
            if(!t){ miss++; return; }
            hit++;
            D[k].tn10=t.tn10; D[k].tn90=t.tn90; D[k].tx90=t.tx90; D[k].pr3_99=t.pr3_99; D[k].utci50=(t.u50!=null?t.u50:null); D[k].utci90=(t.u90!=null?t.u90:null); D[k].utci95=(t.u95!=null?t.u95:null); D[k].utciC50=(t.c50!=null?t.c50:null); D[k].utciC10=(t.c10!=null?t.c10:null); D[k].utciC05=(t.c05!=null?t.c05:null); if(t.tm95!=null) D[k].tm95Clim=t.tm95;    
            D[k].climBasis=j.basis;
          });
          window.__agnClimAnchors={joined:hit, unmatched:miss, date:j.date, basis:j.basis};
          try{ console.info('[AGN] local climatology joined to '+hit+' units ('+miss+' unmatched), '+j.date); }catch(_){}
          try{ document.dispatchEvent(new CustomEvent('agn:clim-anchors')); }catch(_){}
        }).catch(function(){});
    })(0);
     
    (function landcoverTable(n){
      fetch(location.origin+'/api/terrain/landcover',{cache:'no-store'})
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(j){
          if(!j||!j.ready||!j.units){ window.LANDCOVER_TEHSIL={ready:false, why:(j&&j.why)||'not served'}; return; }
          window.LANDCOVER_TEHSIL=j;
          try{ console.info('[AGN] WorldCover class shares for '+Object.keys(j.units).length+' tehsils'); }catch(_){}
          try{ document.dispatchEvent(new CustomEvent('agn:landcover')); }catch(_){}
        }).catch(function(){ if(n<3) setTimeout(function(){ landcoverTable(n+1); },5000); });
    })(0);
     
    (function spongeTable(n){
      fetch(location.origin+'/api/terrain/sponge',{cache:'no-store'})
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(j){
          if(!j||!j.ready||!j.units){ window.SPONGE_TEHSIL={ready:false, why:(j&&j.why)||'not served'}; return; }
          window.SPONGE_TEHSIL=j;
          try{ console.info('[AGN] 250 m sponge for '+Object.keys(j.units).length+' tehsils'); }catch(_){}
          try{ document.dispatchEvent(new CustomEvent('agn:landcover')); }catch(_){}
          try{ if(typeof repaintHazardLayer==='function') repaintHazardLayer(); }catch(_){}
        }).catch(function(){ if(n<3) setTimeout(function(){ spongeTable(n+1); },5000); });
    })(0);
    

    (function ls30Table(n){
      fetch(location.origin+'/api/landslide/giri',{cache:'no-store'})
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(j){
          var s=j&&j.susceptibility30;
          if(!s||!s.ready||!s.units){ window.LS30_TEHSIL={ready:false, why:(s&&s.why)||'not served'}; return; }
          window.LS30_TEHSIL=s;
          try{ console.info('[AGN] 30 m landslide susceptibility for '+Object.keys(s.units).length+' tehsils (served: '+s.served+')'); }catch(_){}
          try{ document.dispatchEvent(new CustomEvent('agn:landslide30')); }catch(_){}
        }).catch(function(){ if(n<3) setTimeout(function(){ ls30Table(n+1); },5000); });
    })(0);
     
    (function lsOdds(n){
      fetch(location.origin+'/api/landslide/odds',{cache:'no-store'})
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(j){
          if(!j||!j.ready||!j.units){ window.LS_ODDS={ready:false, why:(j&&j.why)||'not served'}; return; }
          var by={}; for(var uid in j.units){ var u=j.units[uid]; if(!u||!u.key) continue; var m={}; (u.days||[]).forEach(function(r){ if(r&&r.ratio!=null) m[r.date]=r.ratio; }); by[u.key]=m; }
          window.LS_ODDS={ready:true, at:j.at, version:j.modelVersion, days:j.days, byKey:by, observedBands:j.observedBands||null};
          try{ document.dispatchEvent(new CustomEvent('agn:landslideodds')); }catch(_){}
        }).catch(function(){})
        .then(function(){ setTimeout(function(){ lsOdds(0); }, (window.LS_ODDS&&window.LS_ODDS.ready)?30*60e3:60e3); });
    })(0);
     
    (function lithoTable(n){
      fetch(location.origin+'/api/terrain/lithology',{cache:'no-store'})
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(j){
          if(!j||!j.ready||!j.units){ window.LITHO_TEHSIL={ready:false, why:(j&&j.why)||'not served'}; return; }
          window.LITHO_TEHSIL=j;
          try{ console.info('[AGN] lithology material class for '+Object.keys(j.units).length+' tehsils'); }catch(_){}
          try{ document.dispatchEvent(new CustomEvent('agn:lithology')); }catch(_){}
        }).catch(function(){ if(n<3) setTimeout(function(){ lithoTable(n+1); },5000); });
    })(0);
     
    (function handTable(n){
      fetch(location.origin+'/api/flood/hand',{cache:'no-store'})
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(j){
          if(!j||!j.ready||!j.units){ window.HAND_TEHSIL={ready:false, why:(j&&j.why)||'not served'}; return; }
          window.HAND_TEHSIL=j;
          try{ console.info('[AGN] HAND floodplain shares for '+Object.keys(j.units).length+' tehsils (riverine where-factor, floor '+j.factor.floor+')'); }catch(_){}
          try{ document.dispatchEvent(new CustomEvent('agn:hand')); }catch(_){}
        }).catch(function(){ if(n<3) setTimeout(function(){ handTable(n+1); },5000); });
    })(0);
    (function tiles(n){ if(!window.AGN||!AGN.basemap) return n<40&&setTimeout(function(){tiles(n+1);},500);
      fetch(location.origin+'/tiles/config',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(c){
        if(!c||!c.template) return; var res=AGN.basemap.configure(c);
        try{ var btn=document.querySelector('.seg button[data-layer="satellite"].on')||document.querySelector('.seg button[data-layer="radar"]'); if(btn) btn.click(); }catch(_){}
        try{ console.info('[AGN] basemap configured from local server: '+JSON.stringify(res)); }catch(_){}
      }).catch(function(){}); })(0);
    

    (function drought(){
      var P=window.__agnDrought={state:'waiting',done:0,failed:0,total:0};
      function ready(){ try{ var D=window.DISTRICT_IN||{}, n=0; for(var k in D){ if(D[k]&&D[k].weatherLive) n++; } return n>400 && typeof loadDistrictSPI==='function' && window.PK_DISTRICT_CENTROIDS; }catch(_){ return false; } }
      var started=false;
      function begin(){ if(started) return; started=true; (function wait(t){ if(!ready()) return t<120 && setTimeout(function(){wait(t+1);},2000); start(); })(0); }
      

      window.AGN=window.AGN||{}; AGN.drought={ start:function(){ try{ if(typeof agnDroughtNational==='function') agnDroughtNational(0); }catch(_){} }, state:function(){ return P; } };
      

      function wanted(){ return false; }
      document.addEventListener('change',function(e){ if(e.target && e.target.id==='mapHazardPick' && wanted()) begin(); },true);
      try{ if(sessionStorage.getItem('agn:drought:ran')==='1') begin(); }catch(_){}
      try{ document.addEventListener('agn:drought-complete',function(){ sessionStorage.setItem('agn:drought:ran','1'); }); }catch(_){}
      function repaint(){ try{ document.dispatchEvent(new CustomEvent('agn:data',{detail:{reason:'drought-composite'}})); }catch(_){} try{ if(AGN.data&&AGN.data.national) AGN.data.national(); }catch(_){} }
      function start(){
        window.__agnSpiAllowed=true;
        var seen={}, jobs=[];
        PK_DISTRICT_CENTROIDS.forEach(function(c){ if(!c||c.lat==null) return; var d=(typeof resolveDistrict==='function')?resolveDistrict(c.key||c.tehsil||c.district):c.district;
          if(!d||seen[d]) return; if(typeof isScoreableDistrict==='function' && !isScoreableDistrict(c.key||d)) return; seen[d]=1; jobs.push({d:d,lat:c.lat,lon:c.lon}); });
        P.total=jobs.length; P.state='running'; var idx=0, active=0, sinceRepaint=0;
        function next(){
          while(active<3 && idx<jobs.length){ (function(j){ active++;
            Promise.resolve().then(function(){ return loadDistrictSPI(j.d,j.lat,j.lon); }).then(function(r){ if(r&&r.composite!=null) P.done++; else P.failed++; })
              .catch(function(){ P.failed++; }).then(function(){ active--; if(++sinceRepaint>=15){ sinceRepaint=0; repaint(); } if(idx>=jobs.length&&active===0){ P.state='complete'; repaint(); } else next(); });
          })(jobs[idx++]); }
        }
        next();
      }
    })();
    (function verif(){ function load(){ fetch(location.origin+'/api/verification/grades',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){ if(j) window.__agnVerif=j; }).catch(function(){}); }
      load(); setInterval(load, 5*60000); })();
    (function ai(){ function set(s){ var cfg=window.NIGRAAN_LLM_CONFIG; if(!cfg||!s||!s.configured) return;
        var llm=s.mode==='llm'; cfg.endpoint=location.origin+'/api/ai/chat'; cfg.model=llm?(s.provider+' / '+(s.model||'auto')):'local retrieval (no language model)';
         
        cfg.timeoutMs = (s.provider==='ollama' || s.local) ? 200000 : (cfg.timeoutMs||45000); cfg.provider=s.provider||null; if(s.modelNote) cfg.modelNote=s.modelNote;
        var st=document.getElementById('nigraanLlmStatus'); if(st){ st.classList.add('connected'); st.innerHTML='<span></span>'+(llm?'Reasoning model: ':'')+cfg.model.replace(/[<>&]/g,''); }
        var m=document.getElementById('agnAiExecMode'); if(m){ m.setAttribute('data-ai-exec-mode',llm?'backend':'retrieval'); var bb=m.querySelector('b'); if(bb) bb.textContent=llm?('AI BACKEND CONFIGURED \u00b7 '+cfg.model):'LOCAL RETRIEVAL \u00b7 NO LANGUAGE MODEL';
          var ss=m.querySelector('.agn-intake-status'); if(ss) ss.textContent=llm?('Answers come from '+cfg.model+' through the local server, grounded only in dashboard values and the stored forecast for the places you name. The model writes no number of its own: every number is filled in by code from the facts pack, and a sentence with any other number, probability or return period is removed.'+(s.local===false?' Cloud model: the question and the facts leave this machine.':' Local model: nothing leaves this machine.')+''):'Questions naming a tehsil (for example "temperature in Gilgit") are answered by looking up the stored forecast. Open questions need a free model key in nigraan-local\\ai.key.'; }
      }
      fetch(location.origin+'/api/ai/status',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(s){ set(s); setTimeout(function(){ set(s); },3000); }).catch(function(){}); })();
    (function gradeTip(){ var _gt=function(){ var g=document.getElementById('agnProvGrade'), V=window.__agnVerif; if(!g||!V||!V.summary) return; var S=V.summary;
        var t=(g.title&&/^A \(|Verification:/.test(g.title))?g.title:(g.title||'');
        var extra=' Test month '+S.testWindow.start_date+' to '+S.testWindow.end_date+': 24 h temperature RMSE median '+S.medianRmse24Raw+' \u00b0C raw, '+S.medianRmse24Served+' \u00b0C as served; '+S.passedRaw+' tehsils pass raw, '+S.passed+' as served (need '+Math.ceil(S.unitsTotal*S.rule.nationalPassShare)+').'+(V.ledger&&V.ledger.scored?(' Live ledger: '+V.ledger.scored+' served forecasts scored.'):'');
        if(S.testWindow && g.title.indexOf('Test month')<0) g.title=t+extra; var c=document.querySelector('[data-ctx="data"]'); if(c && g.textContent && c.textContent!==g.textContent) c.textContent=g.textContent; }; setInterval(_gt,10000); document.addEventListener('agn:dom',_gt); })();    
    tidy(); new MutationObserver(function(m){ for(var i=0;i<m.length;i++){ if(m[i].addedNodes.length){ tidy(); break; } } }).observe(document.body,{childList:true,subtree:true});
     
    (function wrap(){ if(!window.AGN||typeof AGN.writeRefusal!=='function') return setTimeout(wrap,500);
      if(AGN.writeRefusal.__agnClean) return; var orig=AGN.writeRefusal;
      var w=function(store,why){ if(!full && store==='hazard_evidence'){ try{console.info('[AGN] '+why);}catch(_){} return null; } return orig.apply(this,arguments); };
      w.__agnClean=true; AGN.writeRefusal=w; })();
     
    var n=0, t=setInterval(function(){ n++; var L=document.getElementById('mpLeftIn');
       
      if(L && /Daily parameters not loaded/.test(L.textContent)) try{ document.dispatchEvent(new CustomEvent('agn:livedata-rerender')); }catch(_){}
      if(n>60) clearInterval(t); },4000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
  apply();
})();
