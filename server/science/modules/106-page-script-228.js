


(function(){
  'use strict';
  var G=window, D=document, GT=G.AGN_MODEL_GATE; G.AGN=G.AGN||{};
  if(!GT||!GT.entries){ G.AGN.gate={ready:false, status:function(){ return 'experimental'; }, canAlert:function(){ return false; }, laneOk:function(){ return false; }}; return; }
  var ALIAS={rainfall:'rain_hz', telco_heat:'heat', telco_flood:'flood', telco_wind:'wind', earthquake:'quake', seismic_event:'quake'};
  function idOf(layer){ layer=String(layer==null?'':layer); var k=ALIAS[layer]||layer; return GT.layers[k]||null; }
  function entry(layer){ var id=idOf(layer); return id?Object.assign({id:id},GT.entries[id]):null; }
  function status(layer){ var e=entry(layer); return e?e.status:'experimental'; }
  function canAlert(h){ var e=entry(h); return !!(e&&e.canAlert); }
  
  var CLS={calibrated_model:'calibrated model', published_standard:'published standard', observation:'observation', reference:'reference layer', convention:'convention', experimental:'experimental'};
  function tag(layer){ var e=entry(layer); if(!e) return {status:'experimental', text:'Experimental · not in the model gate: display only, raises no alerts', cls:'ex'};
    var s=e.status; return {status:s, cls:({operational:'op',provisional:'pv',reference:'rf',experimental:'ex'})[s]||'ex', productType:e.productType||null,
      /* v91.17.279 · CLAIMS279 P2 · the legend names the product type (model gate product_type), not a blanket "operational" */
      text: e.productType ? (e.productType+(s==='experimental'?' · experimental':'')+(e.canAlert?' · can raise alerts':' · display only, raises no alerts'))
          : s==='operational' ? ('Operational · '+CLS[e['class']]+(e.canAlert?'':' · display only'))
          : s==='reference' ? 'Reference · display only, cannot raise an alert'
          : s==='provisional' ? 'Provisional · shown with care, raises no alerts'
          : 'Experimental · display only, raises no alerts' }; }
  function laneOk(l){ return !!(l && canAlert(l.hazard)); }
  G.AGN.gate={ready:true, version:GT.version, entry:entry, status:status, canAlert:canAlert, tag:tag, laneOk:laneOk, raw:function(){ return GT; }};

   
  

  function heatHolds(name){ try{ var k=name; if(typeof G.resolveDistrict==='function'){ var rk=G.resolveDistrict(name); if(rk&&G.DISTRICT_IN&&G.DISTRICT_IN[rk]) k=rk; }
      var rec=G.DISTRICT_IN&&G.DISTRICT_IN[k]; if(!rec) return {ok:true, why:'unit not found: kept'};
      var di=(typeof G.hzDayInput==='function')?G.hzDayInput(k,'heat'):null, u=(di&&!di.__unavailable&&di.heatUtciShade!=null)?+di.heatUtciShade:null, p95=rec.utci95!=null?+rec.utci95:null;
      if(u==null) return {ok:true, why:'no day UTCI: kept on the level'};
      if(p95==null) return {ok:u>=46, why:'no local percentile: Severe only', u:u};
      return {ok:u>=p95, why:'shade UTCI '+u.toFixed(1)+' C against this place\u2019s 95th percentile '+p95.toFixed(1)+' C', u:u, p95:p95}; }catch(_){ return {ok:true, why:'check failed: kept'}; } }
  G.AGN=G.AGN||{}; G.AGN.heatAlertRule={rule:'C', test:heatHolds};
  

  function coldHolds(name){ try{ var k=name; if(typeof G.resolveDistrict==='function'){ var rk=G.resolveDistrict(name); if(rk&&G.DISTRICT_IN&&G.DISTRICT_IN[rk]) k=rk; }
      var rec=G.DISTRICT_IN&&G.DISTRICT_IN[k]; if(!rec) return {ok:true, why:'unit not found: kept'};
      var di=(typeof G.hzDayInput==='function')?G.hzDayInput(k,'cold'):null, u=(di&&!di.__unavailable&&di.coldUtciShade!=null)?+di.coldUtciShade:null, p05=rec.utciC05!=null?+rec.utciC05:null;
      if(u==null) return {ok:true, why:'no day UTCI: kept on the level'};
      if(p05==null) return {ok:u<=-40, why:'no local percentile: Severe only', u:u};
      return {ok:u<=p05, why:'shade UTCI '+u.toFixed(1)+' C against this place\u2019s 5th percentile '+p05.toFixed(1)+' C', u:u, p05:p05}; }catch(_){ return {ok:true, why:'check failed: kept'}; } }
  G.AGN.coldAlertRule={rule:'C', test:coldHolds};
  function gateRows(rows){ var out=[];
    (rows||[]).forEach(function(r){ if(!r) return;
      if(r.agnQuake){ if(canAlert('quake')) out.push(r); return; }
      var H=(r.holders&&r.holders.length)?r.holders:[{hazard:r.hazard,index:r.index}];
      var H0=H, hc=null; H=H.filter(function(h){ var nm=r.district&&r.name?r.name:(r.name||''); if(h.hazard==='heat'){ hc=heatHolds(nm); return hc.ok; } if(h.hazard==='cold'){ hc=coldHolds(nm); return hc.ok; } return true; });
      var lvOf=function(h){ try{ var b=(typeof G.agnBandOf==='function')?G.agnBandOf(+h.index):null; return b&&typeof b.index==='number'?b.index:null; }catch(_){ return null; } };
      var ok=H.filter(function(h){ var i=lvOf(h); return canAlert(h.hazard)&&(i==null||(typeof G.agnAlertLevelOk!=='function')||G.agnAlertLevelOk(h.hazard,i)); }); if(!ok.length) return;   /* v91.17.283.12: the one alert rule */
      if(ok.length!==H0.length){ var top=ok.reduce(function(a,b){ return (+b.index>+a.index)?b:a; },ok[0]), bb=null; try{ bb=(typeof G.agnBandOf==='function')?G.agnBandOf(+top.index):null; }catch(_){ bb=null; }   /* v91.17.283 WS2 R3 */
        var rk=bb&&typeof bb.index==='number'?bb.index:0; if(!(rk>=2)) return;
        r=Object.assign({},r,{holders:ok, hazard:top.hazard, index:top.index, coEqual:ok.length>1, classRank:rk, sev:rk+1, band:(bb&&bb.key)||(rk>=4?'Act':rk>=3?'Watch':'Monitor'),
        gateDropped:H0.filter(function(h){ return ok.indexOf(h)<0; }).map(function(h){ return h.hazard; }), heatRule:hc, regatedBy:'page'});
        r.alert=ok.map(function(h){ var a=(G.AI_HAZARDS&&G.AI_HAZARDS[h.hazard]&&G.AI_HAZARDS[h.hazard].label)||h.hazard; return String(a).replace(/\s*[—(].*$/,''); }).join(' + ')+' · '+(r.band||''); }
      out.push(r); });
    return out; }
  function wrapAlerts(){ if(typeof G.activeAlerts!=='function') return false; if(G.activeAlerts.__agnGate) return true;
    var o=G.activeAlerts, w=function(){ var rows=[]; try{ rows=o.apply(this,arguments)||[]; }catch(_){ rows=[]; } return gateRows(rows); };
    w.__agnGate=true; w.__orig=o; Object.keys(o).forEach(function(k){ if(w[k]===undefined) w[k]=o[k]; }); G.activeAlerts=w; return true; }
   
  (function keep(n){ try{ if(!G.activeAlerts||!G.activeAlerts.__agnGate) wrapAlerts(); }catch(_){} if(n<240) setTimeout(function(){ keep(n+1); }, 1000); })(0);

   
  function layerNow(){ try{ var o=G.AGN.olState&&G.AGN.olState(); if(o&&o.id) return o.id; }catch(_){} try{ return (typeof G.currentMapLayer==='function')?G.currentMapLayer():null; }catch(_){ return null; } }
  function legendTag(){ var n=D.getElementById('v3legend'); if(!n) return; var k=layerNow(); if(k==null) return;
    var t=tag(k), el=n.querySelector('.agn-gate-tag');
    if(!el){ el=D.createElement('div'); el.className='agn-gate-tag'; n.appendChild(el); }
     
    if(el.textContent!==t.text) el.textContent=t.text; var cn='agn-gate-tag '+t.cls; if(el.className!==cn) el.className=cn;
    if(el.getAttribute('data-gate-status')!==t.status) el.setAttribute('data-gate-status',t.status); if(el.getAttribute('data-gate-layer')!==String(k)) el.setAttribute('data-gate-layer',k); }
  function pickerTags(){ var s=D.getElementById('mapHazardPick'); if(!s) return;
     
    [].forEach.call(s.querySelectorAll('option'),function(o){ var st=status(o.value); if(o.getAttribute('data-gate-status')!==st) o.setAttribute('data-gate-status',st);
      var suf=st==='experimental'?'experimental':st==='reference'?'reference':''; if(suf&&!/(experimental|reference)\)?$/.test(o.textContent)){ var tx=o.textContent; o.textContent=/\)$/.test(tx)?tx.replace(/\)$/,', '+suf+')'):tx+' ('+suf+')'; }     }); }
  function wrapLegend(){ try{ var Lg=G.AGN.ui&&G.AGN.ui.legend; if(!Lg||!Lg.render||Lg.render.__agnGate) return;
    var r=Lg.render, w=function(){ var out=r.apply(this,arguments); try{ legendTag(); }catch(_){} return out; }; w.__agnGate=true; Object.keys(r).forEach(function(k){ if(w[k]===undefined) w[k]=r[k]; }); Lg.render=w; }catch(_){} }
  function tick(){ try{ pickerTags(); }catch(_){} try{ wrapLegend(); }catch(_){} try{ legendTag(); }catch(_){} }
  ['agn:layer','agn:day','agn:data','agn:hazard','agn:outlook'].forEach(function(ev){ D.addEventListener(ev,function(){ setTimeout(tick,60); }); });
  setInterval(tick,10000); document.addEventListener('agn:dom',tick); setTimeout(tick,800);

   
  function isOp(){ try{ return !!(G.AGN && typeof G.AGN.operator==='function' && G.AGN.operator()); }catch(_){ return false; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function txt(v){ return v==null?'–':(typeof v==='string'?v:JSON.stringify(v)); }
  function render(j){ var b=D.getElementById('agnGateBody'); if(!b) return;
    if(!j||!j.entries){ b.innerHTML='<p class="agn-enssub">Could not read the model gate.</p>'; return; }
    var h='<p class="agn-enssub">'+esc(j.version)+' · '+j.entries.length+' entries · rule ledger '+esc((j.ledger&&j.ledger.version)||'')+' ('+((j.ledger&&j.ledger.rules)||[]).length+' rules).</p>';
    h+='<table class="agn-gate-t"><thead><tr><th>model</th><th>class</th><th>status</th><th>alerts</th><th>layers</th><th>method · source · version</th><th>known limitations</th></tr></thead><tbody>';
    j.entries.forEach(function(e){ var r=e.resolved||{};
      h+='<tr data-gate-id="'+esc(e.id)+'"><td><b>'+esc(e.name)+'</b><br><code>'+esc(e.id)+'</code></td><td>'+esc(e['class'])+'</td><td>'+esc(r.status)+(r.why?'<br><small>'+esc(r.why.join('; '))+'</small>':'')+'</td><td>'+(r.canAlert?'yes':'no')+'</td><td>'+esc((e.layers||[]).join(', ')||'–')+'</td>'
        +'<td>'+esc(txt(e.method))+'<br><small>'+esc(txt(e.source))+' · '+esc(e.version||'')+'</small>'+(e.independent_test?'<br><small>test: '+esc(txt(e.independent_test))+'</small>':'')+'</td><td>'+esc((e.known_limitations||[]).join('; '))+'</td></tr>'; });
    b.innerHTML=h+'</tbody></table>'; }
  function load(){ fetch('/api/ops/gate',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(render).catch(function(){ render(null); }); }
  function mount(){ var c=D.getElementById('agnGateCard');
    if(!isOp()){ if(c) c.remove(); return; } if(c) return;
    var after=D.getElementById('agnTrkCard')||D.getElementById('crossCard')||D.getElementById('assetCard'); if(!after||!after.parentNode) return;
    c=D.createElement('article'); c.className='opsx-card'; c.id='agnGateCard';
    c.innerHTML='<div class="opsx-head"><div><h3>Model gate</h3><p>Operator only. Every map layer, the model behind it, its class and status, what it may do, and its known limitations.</p></div><span class="opsx-badge">Operator</span></div><div id="agnGateBody"><p class="agn-enssub">Loading…</p></div>';
    after.parentNode.insertBefore(c, after.nextSibling); load(); }
  D.addEventListener('agn:operator', mount); setInterval(mount, 5000); setTimeout(mount, 3500);
})();
