
(function(){
  

  var G=window, D=document;
  var LAST=null, BUSY=null, timer=null;
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function served(){ try{ return /^https?:$/.test(location.protocol); }catch(_){ return false; } }
  var DIRW={above:'above',below:'below'};

  

  function projectAssets(){ try{ return (G.AGN.project&&G.AGN.project.state)?(G.AGN.project.state().assets||[]):[]; }catch(_){ return []; } }
  function matchProject(a, pa){ return pa.filter(function(x){ return x && (String(x.asset_id)===String(a.id) || String(x.name||x.asset_name||'')===String(a.name)); })[0]||null; }
  var syncing=false;
  function syncRegister(){
    if(syncing) return 0;
    var reg=[]; try{ reg=(G.AGN.assets&&G.AGN.assets.register)?G.AGN.assets.register():[]; }catch(_){ return 0; }
    if(!reg.length) return 0;
    var pa=projectAssets(), moved=0;
    var rows=reg.map(function(a){
      var p=matchProject(a, pa); var lat=a.lat, lon=a.lon;
      if(p && p.latitude!=null && p.longitude!=null && isFinite(p.latitude) && isFinite(p.longitude)
         && (Math.abs(Number(p.latitude)-Number(a.lat))>1e-5 || Math.abs(Number(p.longitude)-Number(a.lon))>1e-5)){ lat=Number(p.latitude); lon=Number(p.longitude); moved++; }
      return { id:a.id, name:a.name, type:a.type, lat:lat, lon:lon, limits:a.limits };
    });
    if(!moved) return 0;
    syncing=true;
    try{ G.AGN.assets.load(rows, 'project asset register (coordinates followed the project)'); }catch(_){}
    syncing=false;
    return moved;
  }
  function check(){
    var reg=[], pa=projectAssets(), pf=[];
    try{ reg=G.AGN.assets.register(); }catch(_){}
    try{ pf=(G.AGN.sectionState.for('assessments').getState().portfolio)||[]; }catch(_){}
    var orphans=reg.filter(function(a){ return !matchProject(a, pa); }).map(function(a){ return a.id; });
    var moved=reg.filter(function(a){ var p=matchProject(a, pa); return p && p.latitude!=null && (Math.abs(Number(p.latitude)-Number(a.lat))>1e-5 || Math.abs(Number(p.longitude)-Number(a.lon))>1e-5); }).map(function(a){ return a.id; });
    var pfMissing=pf.filter(function(r){ return r && r.asset_id && !pa.some(function(x){ return String(x.asset_id)===String(r.asset_id); }); }).map(function(r){ return r.asset_id; });
    return { projectAssets:pa.length, registerAssets:reg.length, portfolioRows:pf.length,
             registerWithoutProjectAsset:orphans, registerCoordinatesDifferFromProject:moved, portfolioRowsNotInProject:pfMissing,
             consistent:(!moved.length && !pfMissing.length) };
  }
  function assets(){
    var reg=[], pa=[];
    try{ reg=(G.AGN.assets&&G.AGN.assets.register)?G.AGN.assets.register():[]; }catch(_){}
    try{ pa=(G.AGN.project&&G.AGN.project.state)?(G.AGN.project.state().assets||[]):[]; }catch(_){}
    return reg.filter(function(a){ return a && a.lat!=null && a.lon!=null && a.limits && a.limits.length; }).map(function(a){
      var p=pa.filter(function(x){ return x && (String(x.asset_id)===String(a.id) || String(x.name||x.asset_name||'')===String(a.name)); })[0]||{};
      var _lat=(p.latitude!=null&&isFinite(p.latitude))?Number(p.latitude):a.lat, _lon=(p.longitude!=null&&isFinite(p.longitude))?Number(p.longitude):a.lon;
      return { id:a.id, name:a.name, lat:_lat, lon:_lon, type:a.type||p.asset_type||p.industry||null,
        criticality:p.criticality||null, maximum_tolerable_downtime_hr:p.maximum_tolerable_downtime_hr!=null?p.maximum_tolerable_downtime_hr:null,
        backup_power:(p.backup_power==null?null:p.backup_power), backup_duration_hr:p.backup_duration_hr!=null?p.backup_duration_hr:null,
        flood_protection:p.flood_protection!=null?p.flood_protection:null,
        limits:a.limits.map(function(L){ return { variable:L.variable, limit:L.limit, dir:L.dir, durationMin:L.durationMin, actionMin:L.actionMin,
          authority:L.authority, reference:L.reference, action:L.action, owner:L.owner, consequence:L.consequence||null, reach:L.reach||null }; }) };
    });
  }

  function evaluate(){
    if(BUSY) return BUSY;
    var list=assets();
    if(!list.length){ LAST={ ok:false, empty:true, why:'no client limits are loaded. Import a limit register in the card above, or load the worked example.' }; render(); return Promise.resolve(LAST); }
    if(!served()){ LAST={ ok:false, why:'the crossings board needs the local server (it holds the forecast key); this page was opened as a file' }; render(); return Promise.resolve(LAST); }
    setState('Evaluating '+list.length+' asset'+(list.length===1?'':'s')+' against the named run and the ensemble…');
    BUSY=fetch('/api/limits/evaluate',{ method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ assets:list, origin:(G.__AGN_HARNESS?'harness':'client') }), cache:'no-store' })
      .then(function(r){ return r.json().catch(function(){ return { ok:false, why:'HTTP '+r.status }; }); })
      .then(function(j){ LAST=j; LAST.evaluatedAt=Date.now(); render(); try{ D.dispatchEvent(new CustomEvent('agn:crossings',{ detail:j })); }catch(_){} return j; })
      .catch(function(e){ LAST={ ok:false, why:'the server did not answer: '+String((e&&e.message)||e) }; render(); return LAST; })
      .then(function(v){ BUSY=null; return v; });
    return BUSY;
  }

  function setState(t){ var s=D.getElementById('crossState'); if(s) s.textContent=t; }
  function num(v,u){ return v==null?'–':esc(v)+(u?' '+esc(u):''); }
  function marginTxt(r){ if(r.margin==null) return '–'; var m=Number(r.margin); return (m>=0?'+':'')+esc(m)+' '+esc(r.unit||'')+(m>=0?' past':' short'); }
  function chanceTxt(r){
    if(r.chance==null) return (r.horizon==='0–72 h'||r.horizon==='today')?'deterministic run':'–';
    return '<b>'+esc(r.chance)+' %</b>'+(r.horizon==='0–72 h'?' of members that day':' of members'+(r.chanceDay&&r.horizon!=='0–72 h'?' (peak day)':''));
  }
  function whenTxt(r){
    var t='<b>'+esc(r.when)+'</b>';
    if(r.until) t+=' → '+esc(r.until);
    if(r.window) t+='<br>'+esc(r.window);
    if(r.hours!=null) t+='<br>'+esc(r.hours)+' h held'+(r.requiredHours>1?' (limit asks '+esc(r.requiredHours)+' h)':'');
    if(r.leadMin!=null && r.state==='crosses') t+='<br>in '+(r.leadMin>=120?Math.round(r.leadMin/60)+' h':r.leadMin+' min');
    return t;
  }

  function render(){
    mount();
    var body=D.getElementById('crossBody'); if(!body) return;
    var L=LAST;
    if(!L){ body.innerHTML=''; setState('Not evaluated yet.'); return; }
    if(!L.ok){ body.innerHTML='<div class="agn-enssub">'+esc(L.why||'not evaluated')+'</div>'; setState(L.empty?'No register loaded.':'Not evaluated.'); return; }
    var rows=L.rows||[], clear=L.clear||[], ne=L.notEvaluated||[];
    setState(rows.length+' crossing'+(rows.length===1?'':'s')+' · '+clear.length+' limit'+(clear.length===1?'':'s')+' clear to day 15 · '+ne.length+' not evaluated · issued '+String(L.issued||'').slice(0,16).replace('T',' ')+' UTC');
    var h=[];
     
    (function(){ var seen={}, no={owner:0,action:0,time:0};
      rows.forEach(function(r){ var k=r.assetId+'|'+r.variable+'|'+r.limit+'|'+r.dir; if(seen[k]) return; seen[k]=1;
        if(!r.owner) no.owner++; if(!r.action) no.action++; if(r.actionMin==null&&!r.prepareByText) no.time++; });
      var bits=[]; if(no.owner) bits.push(no.owner+' limit'+(no.owner===1?' has':'s have')+' no owner');
      if(no.action) bits.push(no.action+' no written action'); if(no.time) bits.push(no.time+' no response time, so no prepare-by time');
      if(bits.length) h.push('<div class="agn-gap87" id="crossGaps"><span>'+esc(bits.join(' · '))+'.</span> <button type="button" class="agn-gap87-b" data-agn-addowners="1">Add owners and actions →</button></div>'); })();
    h.push('<div class="opsx-tablewrap"><table class="opsx-table" id="crossTable"><thead><tr>'
      +'<th>Asset</th><th>Limit</th><th>Forecast value</th><th>Margin</th><th>When</th><th>Chance / confidence</th><th>Consequence</th><th>Owner</th><th>Action · prepare by</th></tr></thead><tbody>');
    if(!rows.length) h.push('<tr><td colspan="9">No registered limit is forecast to be crossed to day 15. Each limit\'s closest approach is listed below.</td></tr>');
    rows.forEach(function(r){
      h.push('<tr data-cross="'+esc(r.assetId+'|'+r.variable+'|'+r.limit+'|'+r.dir+'|'+r.horizon)+'">'
        +'<td><b>'+esc(r.asset)+'</b></td>'
        +'<td>'+esc(r.label)+' '+esc(DIRW[r.dir]||r.dir)+' <b>'+esc(r.limit)+' '+esc(r.unit||'')+'</b>'+(r.requiredHours>1?' for '+esc(r.requiredHours)+' h':'')
          +'<br><span class="agn-enssub">'+esc(r.authority||'no authority')+(r.reference?' · '+esc(r.reference):'')+'</span></td>'
        +'<td>'+num(r.value,r.unit)+(r.valueHigh!=null?'<br><span class="agn-enssub">1 in 10 members: '+esc(r.valueHigh)+'</span>':'')
          +'<br><span class="agn-enssub">'+esc(r.horizon)+' · '+esc(r.source)+'</span></td>'
        +'<td>'+marginTxt(r)+'</td>'
        +'<td>'+whenTxt(r)+(r.interpolated?'<br><span class="agn-enssub">hours after day 6 are interpolated</span>':'')+'</td>'
        +'<td>'+chanceTxt(r)+'<br><span class="agn-enssub">'+esc(r.confidence||'')+'</span></td>'
        +'<td>'+esc(r.consequence||'–')+(r.consequenceSource?'<br><span class="agn-enssub">'+esc(r.consequenceSource)+'</span>':'')+'</td>'
         
        +'<td>'+(r.owner?esc(r.owner)+(r.ownerSource?'<br><span class="agn-enssub">'+esc(r.ownerSource)+'</span>':''):'<span class="agn-miss87" title="no owner in the limit register">–</span>')+'</td>'
        +'<td>'+(r.action?esc(r.action):'<span class="agn-miss87" title="no action written for this limit">–</span>')+(r.prepareByText?'<br><b>prepare by '+esc(r.prepareByText)+'</b>':'')+'</td>'
        +'</tr>');
    });
    h.push('</tbody></table></div>');
    if(clear.length){
      h.push('<div class="agn-enssub" style="margin-top:10px"><b>Not crossed to day 15</b> (closest approach):</div><ul class="agn-enssub" id="crossClear" style="margin:4px 0 0 18px">');
      clear.forEach(function(c){ h.push('<li>'+esc(c.asset)+' · '+esc(c.label)+' '+esc(DIRW[c.dir]||c.dir)+' '+esc(c.limit)+' '+esc(c.unit||'')+': '+esc(c.why)+'</li>'); });
      h.push('</ul>');
    }
    if(ne.length){
      h.push('<div class="agn-enssub" style="margin-top:10px"><b>Not evaluated</b>:</div><ul class="agn-enssub" id="crossNotEvaluated" style="margin:4px 0 0 18px">');
      ne.forEach(function(c){ h.push('<li>'+esc(c.asset)+' · '+esc(c.label||c.variable)+' '+esc(c.limit)+': '+esc(c.why)+'</li>'); });
      h.push('</ul>');
    }
     
    var phys=(L.assets||[]).filter(function(a){ return a && a.physical && !a.physical.error; });
    if(phys.length){
      

      var lvw=function(c){ if(c==null) return c; if(/^(low|clear)$/i.test(String(c))) return 'Normal'; try{ var w=(window.AGN&&AGN.level&&AGN.level.ofClass)?AGN.level.ofClass(c):null; return w||c; }catch(_){ return c; } };
      var STC={Normal:'low',Low:'low',Moderate:'monitor',High:'watch',Severe:'act'};
      var cc=function(c,glof){ if(!c) return '–'; var w=glof?c:lvw(c); return '<span class="opsx-state '+String(glof?c:(STC[w]||c)).toLowerCase()+'">'+esc(w)+'</span>'; };
      h.push('<div class="agn-enssub" style="margin-top:12px"><b>Physical check at each asset</b> (named run, next 72 h; river to day 14). Heat and cold: Severe only against the limit you registered for the asset; without one, a cited reference (published wet-bulb limit, this place\'s 1991–2020 climate, freezing point) raises Moderate or High, otherwise Normal.</div>');
      h.push('<div class="opsx-tablewrap"><table class="opsx-table" id="crossPhysical"><thead><tr><th>Asset</th><th>Humid heat · wet bulb</th><th>Dry heat · daily max</th><th>Cold · daily min</th><th>Heavy rain · own catchment</th><th>River flow</th><th>Glacial lakes upstream</th></tr></thead><tbody>');
      phys.forEach(function(a){ var P=a.physical;
        var cell=function(x){ return x ? (cc(x.class)+' '+(x.value!=null?esc(x.value)+' '+esc(x.unit||''):'')+'<br><span class="agn-enssub"'+(x.basis?' title="'+esc(x.basis)+'"':'')+'>'+(x.against==='client limit'||x.against==='reference'?'':'cuts ')+esc(x.cuts||'')+(x.raw!=null&&x.raw!==x.value?' · raw run '+esc(x.raw):'')+'</span>') : '–'; };    
        var rv=(P.river && P.river.class==null && P.river.why) ? ('<span class="agn-enssub">'+esc(P.river.reach||'')+', '+esc(P.river.distanceKm)+' km: '+esc(P.river.why)+'</span>') : P.river ? (cc(P.river.class)+' '+esc(P.river.chanceAbove2yr)+' % above 2-yr, '+esc(P.river.chanceAbove5yr)+' % above 5-yr<br><span class="agn-enssub">'+esc(P.river.reach)+', '+esc(P.river.distanceKm)+' km'+(P.river.cuts?' · cuts '+esc(P.river.cuts):'')+'</span>') : '<span class="agn-enssub">no mapped river reach within 20 km</span>';
        var cr=P.catchmentRain ? (cc(P.catchmentRain.class)+' '+esc(P.catchmentRain.chance)+' % of members'+(P.catchmentRain.peakDay?' ('+esc(P.catchmentRain.peakDay)+')':'')+'<br><span class="agn-enssub">above its own 99th-percentile day, '+esc(P.catchmentRain.p99Mm)+' mm, over '+esc(P.catchmentRain.catchmentKm2)+' km²'+(P.catchmentRain.cuts?' · cuts '+esc(P.catchmentRain.cuts):'')+' · '+esc(P.catchmentRain.caution)+'</span>') : '–';
         
        var gq=P.glof, gl='–';
        if(gq && gq.applicable===false){ gl='<span class="agn-enssub">No glacial lake upstream</span>'; }    
        else if(gq){ var top=(gq.lakes||[]).slice(0,3).map(function(l){ return esc(l.name)+' ('+esc(l.tier)+', '+esc(l.kmAlong)+' km'+(window.AGN_INTERNAL_REF&&l.sensor?', sensor':'')+(l.condition==='growing'?', <b>growing</b>':l.condition==='draining'?', <b>draining</b>':'')+')'; });
           
          gl=cc(gq.word||({Low:'Normal',Monitor:'Normal',Watch:'High',Act:'Severe'}[gq.class]||null))+'<br><span class="agn-enssub">'+(gq.counts&&(gq.counts.priority||gq.counts.watch)?'lakes upstream: '+esc(gq.counts.priority)+' High, '+esc(gq.counts.watch)+' Moderate susceptibility':'no High or Moderate susceptibility lake within '+esc(gq.routeKm)+' km')+'</span>'
            +'<br><span class="agn-enssub" data-glof="1">'+(top.length?top.join('; ')+' · ':'')+esc(gq.basis||'')+(window.AGN_INTERNAL_REF&&gq.bulletin?' · reference bulletin '+esc(String(gq.bulletin).slice(0,10)):'')+(gq.feedStale?' · feed not refreshed in 3 days':'')+(window.AGN_INTERNAL_REF&&gq.bulletinAgeDays!=null&&gq.bulletinAgeDays>45?' · latest bulletin is '+esc(gq.bulletinAgeDays)+' days old':'')+'</span>'; }
        h.push('<tr><td><b>'+esc(a.name)+'</b></td><td>'+cell(P.heat)+'</td><td>'+cell(P.dryHeat)+'</td><td>'+cell(P.cold)+'</td><td>'+cr+'</td><td>'+rv+'</td><td>'+gl+'</td></tr>'); });
      h.push('</tbody></table></div>');
    }
    var sh=(L.assets||[]).map(function(a){ return a.ensemble&&a.ensemble.shift&&a.ensemble.shift.hours?esc(a.name)+' '+(a.ensemble.shift.tempC>=0?'+':'')+esc(a.ensemble.shift.tempC)+' °C':null; }).filter(Boolean);
    h.push('<div class="agn-enssub" style="margin-top:10px">'+esc(L.scope||'')+(sh.length?' Ensemble temperature moved onto the named run at each asset: '+sh.join(', ')+'.':'')+'</div>');
    body.innerHTML=h.join('');
    ledger();
  }
   
  function ledger(){
    if(!served()) return;
    fetch('/api/limits/ledger',{cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){
      var body=D.getElementById('crossBody'); if(!body||!j||!j.ok) return;
      var el=D.getElementById('crossLedger'); if(!el){ el=D.createElement('div'); el.id='crossLedger'; el.className='agn-enssub'; el.style.marginTop='10px'; body.appendChild(el); }
      var S=j.scores||{}, ks=Object.keys(S);
      el.innerHTML='<b>Crossing ledger</b>: '+esc(j.entries)+' forecast record'+(j.entries===1?'':'s')+', '+esc(j.verifiedDays)+' day'+(j.verifiedDays===1?'':'s')+' checked so far. '
        +(ks.length?ks.map(function(k){ var v=S[k]; return esc(k)+': named run '+(v.run.pod!=null?'detected '+esc(v.run.pod)+' %, false alarms '+esc(v.run.far)+' %':'–')
          +(v.brier!=null?' · ensemble Brier '+esc(v.brier)+' over '+esc(v.brierN)+' days':''); }).join(' · ')+'. '
          :'A day is checked two days after it ends. ')+esc(j.reference);
    }).catch(function(){});
  }

  function mount(){
    if(D.getElementById('crossCard')) return true;
    var after=D.getElementById('assetCard'); if(!after||!after.parentNode) return false;
    var c=D.createElement('article'); c.className='opsx-card'; c.id='crossCard'; c.style.marginBottom='14px';
    c.innerHTML='<div class="opsx-head"><div><h3>Limit crossings · now to 15 days</h3><p>Every registered limit on every asset: wet bulb, apparent and daily temperatures, '
      +'hourly and 24-hour rain, gusts and river flow. 0–72 h from one named global forecast model run; days 3–14 from the 51-member ensemble on that run\'s basis. '
      +'One row per crossing, ordered by time. Exposure only: no downtime or loss is estimated.</p></div><span class="opsx-badge" id="crossBadge">Named run + ensemble</span></div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px"><button class="opsx-btn primary" id="crossEvaluate" type="button">Evaluate crossings</button>'
      +'<span class="agn-enssub" id="crossState">Not evaluated yet.</span></div><div id="crossBody"></div>';
    after.parentNode.insertBefore(c, after.nextSibling);
    var b=D.getElementById('crossEvaluate'); if(b) b.addEventListener('click', function(){ evaluate(); });
    return true;
  }

  function rowsFor(assetId, assetName){
    if(!LAST||!LAST.ok) return [];
    return (LAST.rows||[]).filter(function(r){ return (assetId!=null && String(r.assetId)===String(assetId)) || (assetName && String(r.asset)===String(assetName)); });
  }

   
  function forAsset(assetId, assetName){
    if(!LAST||!LAST.ok) return null;
    var m=function(r){ return (assetId!=null && String(r.assetId)===String(assetId)) || (assetName && String(r.asset)===String(assetName)); };
    var A=(LAST.assets||[]).filter(function(a){ return (assetId!=null && String(a.id)===String(assetId)) || (assetName && String(a.name)===String(assetName)); })[0];
    if(!A) return null;
    return JSON.parse(JSON.stringify({ issued:LAST.issued, run:A.run&&A.run.run||null, runHash:A.run&&A.run.inputHash||null,
      shift:(A.ensemble&&A.ensemble.shift&&A.ensemble.shift.hours)?A.ensemble.shift.tempC:null,
      rows:(LAST.rows||[]).filter(m), clear:(LAST.clear||[]).filter(m), notEvaluated:(LAST.notEvaluated||[]).filter(m), scope:LAST.scope }));
  }
  function schedule(){ if(timer) clearTimeout(timer); timer=setTimeout(function(){ timer=null; if(assets().length) evaluate(); else { LAST=null; render(); } }, 1500); }
  function init(){ mount(); D.addEventListener('agn:assets', schedule); D.addEventListener('agn:sweep-done', schedule);     ['agn:project','agn:active-asset'].forEach(function(ev){ D.addEventListener(ev, function(){ setTimeout(syncRegister, 300); }); }); if(assets().length) schedule(); }
  if(D.readyState!=='loading') init(); else D.addEventListener('DOMContentLoaded', init);

  G.AGN=G.AGN||{};
  G.AGN.assetStore={ check:check, sync:syncRegister, source:'project asset (location and physical facts); the limit register holds limits only' };
  G.AGN.crossings={ ledger:ledger, evaluate:evaluate, last:function(){ return LAST; }, rowsFor:rowsFor, forAsset:forAsset, assets:assets, render:render, version:'v91.17.26' };
})();
