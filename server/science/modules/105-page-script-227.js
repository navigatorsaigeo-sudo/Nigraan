


(function(){
  'use strict';
  var D=document, G=window;
  function isOp(){ try{ return !!(G.AGN && typeof G.AGN.operator==='function' && G.AGN.operator()); }catch(_){ return false; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function f(x,d){ return (x==null||!isFinite(x))?'–':(+x).toFixed(d==null?2:d); }
  function table(head, rows){ return '<table class="agn-trk-t"><thead><tr>'+head.map(function(h){ return '<th>'+esc(h)+'</th>'; }).join('')+'</tr></thead><tbody>'
      +rows.map(function(r){ return '<tr>'+r.map(function(c){ return '<td>'+esc(c)+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table>'; }
  function render(j){
    var b=D.getElementById('agnTrkBody'); if(!b) return;
    if(!j){ b.innerHTML='<p class="agn-enssub">Could not read the verification report.</p>'; return; }
    var h='', V=j.verify;
    if(!V){ h+='<p class="agn-enssub">'+esc(j.why||'no report yet')+'</p>'; }
    else {
      h+='<p class="agn-enssub">Built '+esc(V.built)+'. Scored on days after they were issued: nothing here was fitted on these days.</p>';
      var T=V.temperature||{}; h+='<h4>Temperature: issued vs AGN stations</h4>';
      h+=T.byLead?table(['lead day','station-days','Tmax MAE °C','Tmax bias','Tmin MAE °C','Tmin bias'],Object.keys(T.byLead).sort().map(function(k){ var v=T.byLead[k]; return [k,v.n,f(v.tmaxMAE),f(v.tmaxBias),f(v.tminMAE),f(v.tminBias)]; })):'<p class="agn-enssub">'+esc(T.why||'–')+'</p>';
      var R=V.rain||{}; h+='<h4>Rain: issued vs satellite rain</h4>';
      h+=R.byLead?table(['lead day','n','forecast mm','measured mm','ratio','found 10 mm+','false 10 mm+'],Object.keys(R.byLead).sort().map(function(k){ var v=R.byLead[k], c=(v.categories||[]).filter(function(x){ return x.thr_mm===10; })[0]||{}; return [k,v.n,v.fcTotalMm,v.obsTotalMm,v.ratio,f(c.pod),f(c.far)]; })):'<p class="agn-enssub">'+esc(R.why||'–')+'</p>';
      var C=V.chances||{}, ck=Object.keys(C).filter(function(k){ return C[k]&&C[k].n; });
      h+='<h4>Issued chances: Brier skill against climatology</h4>';
      h+=ck.length?table(['product','n','base rate','Brier','skill'],ck.map(function(k){ var v=C[k]; return [k,v.n,f(v.baseRate,3),f(v.brier,4),v.brierSkill]; })):'<p class="agn-enssub">'+esc(C.why||'no issued chance has a scored valid day yet')+'</p>';
    }
    var G2=j.registry;
    if(G2){ h+='<h4>Model register: leakage checks</h4><p class="agn-enssub">'+esc(G2.summary.served)+' served, '+esc(G2.summary.servedClean)+' clean. Built '+esc(G2.built)+'.</p>';
      h+=table(['model','served','test window','findings','status'],G2.models.map(function(m){ return [m.id,m.served?'yes':'no',m.test?m.test.join(' to '):'–',(m.findings||[]).join(', ')||'clean',m.clean?'clean':(m.mitigated?'mitigated: '+m.mitigated:(m.fix||'open'))]; })); }
    b.innerHTML=h;
  }
  function load(){ fetch('/api/ops/verify',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(render).catch(function(){ render(null); }); }
  function mount(){
    var c=D.getElementById('agnTrkCard');
    if(!isOp()){ if(c) c.remove(); return; }
    if(c) return;
    var after=D.getElementById('crossCard')||D.getElementById('assetCard'); if(!after||!after.parentNode) return;
    c=D.createElement('article'); c.className='opsx-card'; c.id='agnTrkCard'; 
    c.innerHTML='<div class="opsx-head"><div><h3>What we said vs what happened</h3><p>Operator only. The forecasts NIGRAAN issued, scored against what was then measured, and the register of every served model with its leakage checks.</p></div><span class="opsx-badge">Operator</span></div><div id="agnTrkBody"><p class="agn-enssub">Loading…</p></div>';
    after.parentNode.insertBefore(c, after.nextSibling); load();
  }
  D.addEventListener('agn:operator', mount);
  setInterval(mount, 5000); setTimeout(mount, 3000);
})();
