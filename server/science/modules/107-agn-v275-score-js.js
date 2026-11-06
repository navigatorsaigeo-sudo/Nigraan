
/* v91.17.275 · ARCH (V-01) · "Forecast score" card (operator only; GET /api/score/monthly is refused to the customer view): what NIGRAAN
   served (the archived 00:00 PKT tehsil forecast) against MACH, synoptic stations and airports, by lead day and zone, once a month. */
(function(){
  'use strict';
  var G=window, D=document;
  function isOp(){ try{ return !!(G.AGN && typeof G.AGN.operator==='function' && G.AGN.operator()); }catch(_){ return false; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function f2(x){ return x==null?'–':(Math.round(x*100)/100).toFixed(2); }
  function sg(x){ return x==null?'–':(x>0?'+':'')+(Math.round(x*100)/100).toFixed(2); }
  var last=0, LEADS=['0','1','2','3'];
  function cell(v,k){ if(!v) return '<td>–</td>'; if(v.missing) return '<td title="'+esc(v.missing)+'">not held</td>';
    if(k==='rainDay') return '<td>'+(v.hitRate==null?'–':f2(v.hitRate))+' / '+(v.falseAlarmRatio==null?'–':f2(v.falseAlarmRatio))+'<br><span class="agn-enssub">'+v.n+' st-days</span></td>';
    return '<td>'+f2(v.mae)+' <span class="agn-enssub">('+sg(v.bias)+')</span><br><span class="agn-enssub">'+v.stations+' st · '+v.n+' h</span></td>'; }
  function render(j){ var b=D.getElementById('agnScoreBody'); if(!b) return;
    if(!j||!j.ok){ b.innerHTML='<p class="agn-enssub">'+esc((j&&j.why)||'The score has not answered.')+'</p>'; return; }
    var W=j.window||{}, h='<p class="agn-enssub">Issues '+esc((W.issues||[]).join(', '))+' · valid '+esc(W.validFrom)+' to '+esc(W.validTo)+' · built '+esc(j.built)+' · '+(j.stations?j.stations.paired+' stations matched to a tehsil':'')+'</p>';
    h+='<p>'+esc(j.ownerSummary||'')+'</p>';
    var V=[['temperature','Temperature °C, MAE (bias)'],['dewPoint','Dew point °C, MAE (bias)'],['wind','10 m wind km/h, MAE (bias)'],['rainDay','Rain day ≥ 1 mm, hit rate / false-alarm ratio']];
    var Z=['national','plains','hills','mountain','coast'];
    V.forEach(function(v){ h+='<table class="agn-sc-t"><thead><tr><th>'+esc(v[1])+'</th>'+LEADS.map(function(L){ return '<th>lead day '+L+'</th>'; }).join('')+'</tr></thead><tbody>';
      Z.forEach(function(z){ var r=z==='national'?j.national:(j.zones||{})[z]; if(!r||!r[v[0]]) return; h+='<tr><td><b>'+esc(z)+'</b></td>'+LEADS.map(function(L){ return cell(r[v[0]][L],v[0]); }).join('')+'</tr>'; });
      h+='</tbody></table>'; });
    if(j.limits&&j.limits.length) h+='<p class="agn-enssub">Limits: '+j.limits.map(esc).join(' · ')+'</p>';
    b.innerHTML=h; }
  function load(){ if(Date.now()-last<600e3) return; last=Date.now(); fetch('/api/score/monthly',{cache:'no-store'}).then(function(x){ return x.ok?x.json():null; }).then(render).catch(function(){ render(null); }); }
  function mount(){ var c=D.getElementById('agnScoreCard');
    if(!isOp()){ if(c) c.remove(); return; } if(c){ load(); return; }
    var after=D.getElementById('agnAccCard')||D.getElementById('agnScCard')||D.getElementById('agnGateCard')||D.getElementById('crossCard'); if(!after||!after.parentNode) return;
    c=D.createElement('article'); c.className='opsx-card'; c.id='agnScoreCard';
    c.innerHTML='<div class="opsx-head"><div><h3>Forecast score</h3><p>Operator only. Once a month: the forecast NIGRAAN served (archived each day at 00:00 PKT) against what MACH, synoptic stations and airports measured, by lead day and zone. Not shown to customers.</p></div><span class="opsx-badge">Operator</span></div><div id="agnScoreBody"></div>';
    after.parentNode.insertBefore(c, after.nextSibling); last=0; load(); }
  D.addEventListener('agn:operator', mount); setInterval(mount, 5000); setTimeout(mount, 5000);
})();
