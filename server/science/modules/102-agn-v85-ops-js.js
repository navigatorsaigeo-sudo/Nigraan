
(function(G){
  'use strict';
  var D=G.document;
   
  function work(){ var b=D.getElementById('crossBody'); if(!b||!b.querySelector('.opsx-table')) return; if(D.getElementById('agnWork85')) return;
    var btn=D.createElement('button'); btn.type='button'; btn.id='agnWork85'; btn.className='agn-work85-btn'; btn.textContent='Show the working (thresholds, sources, limits not crossed)';
    btn.addEventListener('click',function(){ var on=b.classList.toggle('agn-work85'); btn.textContent=on?'Hide the working':'Show the working (thresholds, sources, limits not crossed)'; });
    b.parentNode.insertBefore(btn,b); }
  

  function nat(){ var pane=D.querySelector('.opsx-pane[data-opsx-pane="situation"]'); if(!pane||D.getElementById('agnNatWatch85')) return;
    var kpis=pane.querySelector(':scope > .opsx-kpis'), board=(D.getElementById('opsxPriorityRows')||{}).closest?D.getElementById('opsxPriorityRows').closest('article'):null; if(!kpis||!board) return;
    var d=D.createElement('details'); d.id='agnNatWatch85';
    d.innerHTML='<summary>National watch · all of Pakistan<small>The whole-country status, the most exposed districts and the population in them. Your own sites are above.</small></summary><div class="in"></div>';
    var inner=d.querySelector('.in'), grid=board.parentNode; inner.appendChild(kpis); inner.appendChild(board);
    grid.parentNode.insertBefore(d,grid); }
   
  G.agnChainNow85=function(name){ try{ var a=G.AGN.project&&G.AGN.project.activeAsset&&G.AGN.project.activeAsset(); if(!a||a.latitude==null||!G.AGN.scenario76) return null;
      var u=G.aiStationDistrict({name:'',lat:+a.latitude,lon:+a.longitude}); if(!u) return null;
       
      try{ var pc=D.getElementById('mpRightIn'), ttl=pc&&pc.querySelector('b,h3,.agn-mps-t'), lv=pc&&pc.querySelector('.agn-mps-lv');
        if(lv&&pc.textContent.indexOf(u)>=0){ var w=(lv.textContent||'').trim(), why=((lv.nextElementSibling||{}).textContent||'').replace(/^[\s·]+/,'').trim(), nm0=String(name||a.name).replace(/\s*\(AJG Supplies\)$/,'');
          if(/^(Normal|Low|Moderate|High|Severe)$/.test(w)) return (w==='Normal'?'All scored hazards are Normal at '+nm0+' now (tehsil '+u+'). Nothing to act on.':w+' at '+nm0+' now ('+why+').')+' Same reading as the Overview place card.'; } }catch(_){} var rows=G.AGN.scenario76.compute(u)||[];
      var sc=rows.filter(function(r){ return r.base&&r.base.i!=null; }); if(!sc.length) return null;
      var top=sc.slice().sort(function(x,y){ return y.base.i-x.base.i; })[0], W=['Normal','Low','Moderate','High','Severe'], nm=String(name||a.name).replace(/\s*\(AJG Supplies\)$/,'');
      if(top.base.i===0) return 'All '+sc.length+' scored hazards are Normal at '+nm+' today (tehsil '+u+'). Nothing to act on in the next 72 h.';
      var more=sc.filter(function(r){ return r.base.i>0&&r!==top; }).map(function(r){ return r.label+' '+W[r.base.i]; });
      return top.label+' is the highest level at '+nm+' today: '+W[top.base.i]+(more.length?' (also '+more.join(', ')+')':'')+'. The rest are Normal.'; }catch(_){ return null; } };
  (function(f){ setInterval(f,10000); document.addEventListener('agn:dom',f); })(function(){ try{ work(); }catch(_){} try{ nat(); }catch(_){} });
  

  function opsRender(){ try{ var I=G.AGN.implementations.require('operations'); if(I&&I.render) I.render(); }catch(_){} }
  function alertsRender(){ try{ if(typeof G.drawRailAlerts==='function') G.drawRailAlerts(); }catch(_){} }
  var T=0; function soon(){ clearTimeout(T); T=setTimeout(function(){ opsRender(); alertsRender(); },600); }
  ['agn:project','agn:active-asset','agn:location'].forEach(function(ev){ D.addEventListener(ev,soon); });
  D.addEventListener('click',function(e){ var t=e.target&&e.target.closest&&e.target.closest('#machNav [data-goto="operations"],#machNav [data-goto="livedata"]'); if(t) setTimeout(function(){ opsRender(); alertsRender(); },300); });
})(window);
