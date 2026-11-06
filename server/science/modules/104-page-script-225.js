


(function(){
  'use strict';
  var G=window, D=document; G.AGN=G.AGN||{};
  var LAYERS=['rain_hz','heat','cold','wind','flood','flood_pluvial','flood_riverine','landslide','glof','drought','nss_baseline','nss_dynamic'];
  var IJ=null; try{ IJ=IIOJK; }catch(_){}
  function feats(){ return ((G.PK_DISTRICTS&&PK_DISTRICTS.features)||[]).map(function(f){ return f.properties||{}; }).filter(function(p){ return p.key!=null && p.province!==IJ; }); }
  var CEN=null;
  function centroids(){ if(CEN) return CEN; CEN={};
    ((G.PK_DISTRICTS&&PK_DISTRICTS.features)||[]).forEach(function(f){ var p=f.properties||{}, g=f.geometry; if(!g||p.key==null) return; var x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
      (function walk(c){ if(typeof c[0]==='number'){ if(c[0]<x0)x0=c[0]; if(c[0]>x1)x1=c[0]; if(c[1]<y0)y0=c[1]; if(c[1]>y1)y1=c[1]; return; } c.forEach(walk); })(g.coordinates);
      CEN[p.key]=[(y0+y1)/2,(x0+x1)/2]; }); return CEN; }
  function km(a,b){ var R=6371, d1=(b[0]-a[0])*Math.PI/180, d2=(b[1]-a[1])*Math.PI/180, s=Math.sin(d1/2)*Math.sin(d1/2)+Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(d2/2)*Math.sin(d2/2); return 2*R*Math.asin(Math.sqrt(s)); }
  

  function mapIndep(u){ var M=G.AGN_UTCI_AGN_MAP&&AGN_UTCI_AGN_MAP.points; if(!M||u==null) return null; if(u<=M[0][0]) return 0; for(var i=1;i<M.length;i++){ if(u===M[i][0]) return M[i][1]; if(u<M[i][0]) return Math.min(M[i][1]-1, Math.round(M[i-1][1]+(u-M[i-1][0])/(M[i][0]-M[i-1][0])*(M[i][1]-M[i-1][1]))); } return 100; }    
  var UCL=[[-40,'Extreme cold stress'],[-27,'Very strong cold stress'],[-13,'Strong cold stress'],[0,'Moderate cold stress'],[9,'Slight cold stress'],[26,'No thermal stress'],[32,'Moderate heat stress'],[38,'Strong heat stress'],[46,'Very strong heat stress']];
   
  var CCUT=[[-13,2],[-27,3],[-40,4]];   /* v91.17.283.12: the self-check's own cut list follows the one UTCI rule (a cold level only from strong cold stress) */
  function coldBandIndep(u){ if(u==null) return null; var b=0; for(var i=0;i<CCUT.length;i++) if(u<CCUT[i][0]) b=CCUT[i][1]; return b; }    
  function classIndep(u){ for(var i=0;i<UCL.length;i++) if(u<UCL[i][0]) return UCL[i][1]; return 'Extreme heat stress'; }
  function num(v){ return (v==null||v===''||!isFinite(+v))?null:+v; }

   
  function unitOn(hz,p){
    var o={key:p.key,uid:p.uid||p.key};
    try{ var mk=(typeof G.__agnHzMaskWhy==='function')?G.__agnHzMaskWhy(p.key,hz):null; if(mk){ o.lv=-2; return o; } }catch(_){}
    var inp=null; try{ inp=G.hzDayInput(p.key,hz); }catch(_){ inp=null; }
    o.inp=inp; if(!inp||inp.__unavailable){ o.lv=-1; o.noInput=true; return o; }
    var r=null; try{ r=G.aiDistrictRisk(inp,hz,(G.aiState&&aiState.lead)||24,p.key); }catch(_){ r=null; }
    o.r=r; if(!r){ o.lv=-1; return o; }
    var L=G.AGN.hz5&&AGN.hz5.levelOf?AGN.hz5.levelOf(hz,(r.score!=null?r.score:r.mapValue),r):{nd:true};
    o.lv=L.na?-2:(L.i!=null?L.i:((hz==='flood_riverine'&&r&&r.noDataClass==='method')?-3:-1)); return o; }   /* v91.17.283.5 W6: -3 = no modelled river reach (the river check found no covered reach), not missing data */

  var last={at:0,sig:''}, RES=null;
  function run(){
    var t0=Date.now(), P=feats(), out={at:new Date().toISOString(), build:((G.AGN_BUILD&&AGN_BUILD.patch)||null), gate:(G.AGN_MODEL_GATE&&AGN_MODEL_GATE.version)||null,
      day:(G.AGN.day&&AGN.day.get)?(AGN.day.get()||0):0, basis:(G.AGN.day&&AGN.day.basis)?AGN.day.basis():null, units:P.length, checks:[], layers:{}};
    function chk(id,name,sev,bad,detail){ out.checks.push({id:id,name:name,status:bad.length?sev:'PASS',n:bad.length,examples:bad.slice(0,8),detail:detail||null}); }
    var S1=[],S2=[],S3=[],S4=[],S5=[],S8=[],S9=[],S10=[], heatTx={}, floodDry=[];
    LAYERS.forEach(function(hz){
      var lv={}, c=[0,0,0,0,0], na=0, nd=0;
      P.forEach(function(p){ var u=unitOn(hz,p); lv[u.uid]=u.lv; if(u.lv===-2) na++; else if(u.lv===-1||u.lv===-3) nd++; else c[u.lv]++;
        if(u.lv>=0 && u.noInput) S1.push(hz+': '+p.key);
        if(u.lv===-1 && u.r && u.r.score!=null && !u.r.noData && !u.r.provisional) S2.push(hz+': '+p.key+' (score '+Math.round(u.r.score)+')');
        if(hz==='heat' && u.inp && !u.inp.__unavailable){ var tx=num(u.inp.tmaxDay!=null?u.inp.tmaxDay:u.inp.t); if(tx!=null) heatTx[p.key]=[tx,num(G.DISTRICT_IN&&DISTRICT_IN[p.key]&&DISTRICT_IN[p.key].resolvedElevM)];
          try{ var h=G.hzHeat(u.inp,{zone:(u.r&&u.r.zone)||'irrigated_plains',elev:num(u.inp.elev)}); if(h&&!h.unavailable&&h.utciShade!=null){ var want=mapIndep(h.utciShade), cls=classIndep(h.utciShade);
              if(want==null||Math.round(h.score)!==want||h.utciClass!==cls) S3.push(p.key+' (score '+h.score+' / '+h.utciClass+' vs mapping '+want+' / '+cls+')'); } }catch(e){ S3.push(p.key+' (error '+e.message+')'); } }
        if(hz==='flood' && u.lv>=2 && u.inp){ var rt=num(u.inp.rainTotalDay), r6=num(u.inp.rain6hDay); if((rt==null||rt<1)&&(r6==null||r6<1)) floodDry.push([p.uid,p.key,u.lv,rt]); }
        if(hz==='cold' && u.lv>=0 && u.r){ var cu=num(u.r.utciShade!=null?u.r.utciShade:(u.r.drivers?u.r.drivers[1]:null)); var want=coldBandIndep(cu);   var near=(cu!=null)&&CCUT.some(function(c){ return Math.abs(cu-c[0])<=0.05; }); var alt=near?coldBandIndep(cu-0.06):want; if(cu==null) S5.push(p.key+' (no UTCI behind a level)'); else if(want!==u.lv&&alt!==u.lv) S5.push(p.key+' (level '+u.lv+' vs class band '+want+' at UTCI '+cu+')'); }
        if((hz==='nss_baseline'||hz==='nss_dynamic') && u.lv>=0 && u.r && u.r.physicalValue!=null){ var cn=(String(u.r.notes&&u.r.notes[0]).match(/at CN ([\d.]+)/)||[])[1];
          if(cn!=null && Math.abs((25400/+cn-254)-u.r.physicalValue)>0.15) S8.push(hz+': '+p.key); }
        if(hz==='rain_hz' && u.lv===-1 && G.agnRainChance && agnRainChance.ready() && agnRainChance.forKey(p.key,out.day)) S9.push(p.key);
      });
      if(c[0]+c[1]+c[2]+c[3]+c[4]+na+nd!==P.length) S10.push(hz);
      out.layers[hz]={counts:c, na:na, nd:nd, levels:lv, status:(G.AGN.gate&&AGN.gate.status)?AGN.gate.status(hz):null};
    });
     
    floodDry.forEach(function(f){ var rv=out.layers.flood_riverine&&out.layers.flood_riverine.levels[f[0]]; if(!(rv!=null&&rv>=2)) S4.push(f[1]+' (level '+f[2]+', rain '+(f[3]==null?'?':f[3])+' mm, river level '+(rv==null?'?':rv)+')'); });
     
    var S6=[]; try{ var C=centroids(), ks=Object.keys(heatTx);
      for(var i=0;i<ks.length;i++) for(var j=i+1;j<ks.length;j++){ var a=heatTx[ks[i]], b=heatTx[ks[j]]; if(a[1]==null||b[1]==null) continue; if(Math.abs(a[1]-b[1])<600) continue;
        var ca=C[ks[i]], cb=C[ks[j]]; if(!ca||!cb||km(ca,cb)>40) continue; var hi=a[1]>b[1]?[ks[i],a]:[ks[j],b], lo=a[1]>b[1]?[ks[j],b]:[ks[i],a];
        if(hi[1][0]-lo[1][0]>3) S6.push(hi[0]+' ('+Math.round(hi[1][1])+' m, '+hi[1][0].toFixed(1)+' C) vs '+lo[0]+' ('+Math.round(lo[1][1])+' m, '+lo[1][0].toFixed(1)+' C)'); } }catch(_){}
    var S7=[]; try{ ((typeof G.activeAlerts==='function')?activeAlerts():[]).forEach(function(a){ if(a.agnQuake) return; (a.holders||[{hazard:a.hazard}]).forEach(function(h){ if(!(G.AGN.gate&&AGN.gate.canAlert(h.hazard))) S7.push(a.name+': '+h.hazard); }); }); }catch(_){}
    chk('S1','no level without an input','FAIL',S1); chk('S2','no "no reading" when the engine has a reading','FAIL',S2);
    chk('S3','heat level is the AGN mapping of shade UTCI','FAIL',S3); chk('S4','flood Moderate+ needs rain or a river signal','WARN',S4);
    chk('S5','cold level is the UTCI cold class','FAIL',S5); chk('S6','higher place not >3 C warmer within 40 km','WARN',S6,'inversions are real; each case needs a look, not an automatic fix');
    chk('S7','alerts only from hazards the gate allows','FAIL',S7); chk('S8','retention S = 25400/CN - 254','FAIL',S8);
    chk('S9','rain layer shows every unit that has today\'s chance','FAIL',S9); chk('S10','every unit accounted for on every layer','FAIL',S10);
    out.ms=Date.now()-t0; out.summary={fail:out.checks.filter(function(c){ return c.status==='FAIL'; }).length, warn:out.checks.filter(function(c){ return c.status==='WARN'; }).length};
    RES=out; return out; }

  function post(path,body){ try{ return fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){ return r.ok; }).catch(function(){ return false; }); }catch(_){ return Promise.resolve(false); } }
  function report(force){
    if(!G.agnEngineHost||!G.agnEngineHost()) return;   /* v91.17.283.24 W1: the self-check re-derives levels: the server's engine host runs it, never a browser */
    var sw=null; try{ sw=AGN.hz5&&AGN.hz5.sweep&&AGN.hz5.sweep(); }catch(_){}
    if(!sw||!sw.done||!G.DISTRICT_IN||!G.hzDayInput) return;
    var hourKey=new Date().toISOString().slice(0,13)+'|'+((G.AGN.day&&AGN.day.get)?AGN.day.get():0)+'|'+((G.AGN.day&&AGN.day.basis)?AGN.day.basis():'');
    if(!force && last.sig===hourKey) return; last.sig=hourKey;
    var r=run();
    var shown={at:r.at, build:r.build, gate:r.gate, day:r.day, basis:r.basis, layers:{}};
    Object.keys(r.layers).forEach(function(k){ shown.layers[k]={counts:r.layers[k].counts, na:r.layers[k].na, nd:r.layers[k].nd, status:r.layers[k].status, L:r.layers[k].levels}; });
    post('/api/shown/report',shown);
    post('/api/selfcheck/report',{at:r.at, build:r.build, gate:r.gate, day:r.day, basis:r.basis, units:r.units, ms:r.ms, summary:r.summary, checks:r.checks,
      layers:Object.fromEntries(Object.keys(r.layers).map(function(k){ return [k,{counts:r.layers[k].counts,na:r.layers[k].na,nd:r.layers[k].nd,status:r.layers[k].status}]; }))});
    render(); }
  G.AGN.selfcheck={run:run, report:function(){ report(true); return RES; }, last:function(){ return RES; }, unitOn:unitOn, layers:function(){ return LAYERS.slice(); }, units:feats};    
  setInterval(function(){ report(false); },60e3); setTimeout(function(){ report(false); },20e3);

   
  function isOp(){ try{ return !!(G.AGN && typeof G.AGN.operator==='function' && G.AGN.operator()); }catch(_){ return false; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function render(){ var b=D.getElementById('agnScBody'); if(!b) return; var r=RES;
    if(!r){ b.innerHTML='<p class="agn-enssub">The self-check runs in the server\u2019s hazard engine every hour (operator read: GET /api/ops/selfcheck); this page derives no level of its own.</p>'; return; }
    var h='<p class="agn-enssub">'+esc(r.at)+' · '+r.units+' units · '+r.summary.fail+' FAIL · '+r.summary.warn+' WARN · '+r.ms+' ms · day '+r.day+' ('+esc(r.basis)+') · '+esc(r.gate)+'</p>';
    h+='<table class="agn-sc-t"><thead><tr><th>check</th><th>result</th><th>units</th><th>examples</th></tr></thead><tbody>';
    r.checks.forEach(function(c){ h+='<tr><td><b>'+esc(c.id)+'</b> '+esc(c.name)+'</td><td class="'+(c.status==='PASS'?'ok':c.status==='WARN'?'warn':'fail')+'">'+esc(c.status)+'</td><td>'+c.n+'</td><td>'+esc(c.examples.join('; '))+'</td></tr>'; });
    b.innerHTML=h+'</tbody></table><div id="agnScScore"></div>';
    fetch('/api/ops/shown/score',{cache:'no-store'}).then(function(x){ return x.ok?x.json():null; }).then(function(j){ var s=D.getElementById('agnScScore'); if(!s||!j) return;
      var t='<h4>What the map showed vs what happened</h4><p class="agn-enssub">'+esc(j.archive||'')+'</p>';
      if(j.rain&&j.rain.days) t+='<p class="agn-enssub">Rain layer, '+j.rain.days+' days, '+j.rain.n+' tehsil-days: '+esc(j.rain.text)+'</p>'; else t+='<p class="agn-enssub">Rain: '+esc((j.rain&&j.rain.why)||'not scored yet')+'</p>';
      if(j.heat&&j.heat.n) t+='<p class="agn-enssub">Heat layer at MACH stations, '+j.heat.n+' station-days: '+esc(j.heat.text)+'</p>'; else t+='<p class="agn-enssub">Heat: '+esc((j.heat&&j.heat.why)||'not scored yet')+'</p>';
      s.innerHTML=t; }).catch(function(){}); }
  function mount(){ var c=D.getElementById('agnScCard');
    if(!isOp()){ if(c) c.remove(); return; } if(c) return;
    var after=D.getElementById('agnGateCard')||D.getElementById('agnTrkCard')||D.getElementById('crossCard'); if(!after||!after.parentNode) return;
    c=D.createElement('article'); c.className='opsx-card'; c.id='agnScCard';
    c.innerHTML='<div class="opsx-head"><div><h3>Self-check</h3><p>Operator only. Every layer re-derived for every tehsil each hour, checked against the method’s own rules, and the levels shown are archived for scoring.</p></div><span class="opsx-badge">Operator</span></div><div id="agnScBody"></div>';
    after.parentNode.insertBefore(c, after.nextSibling); render(); }
  D.addEventListener('agn:operator', mount); setInterval(mount, 5000); setTimeout(mount, 4000);
})();
