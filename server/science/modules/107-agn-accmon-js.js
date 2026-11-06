
/* v91.17.273 · ACC · accuracy monitor card (operator only; GET /api/accuracy is refused to the customer view). Served vs observed
   temperature at the MACH clean stations, synoptic stations and airports: 24 h and 7 d by city cluster and zone, flags, job freshness. */
(function(){
  'use strict';
  var G=window, D=document;
  function isOp(){ try{ return !!(G.AGN && typeof G.AGN.operator==='function' && G.AGN.operator()); }catch(_){ return false; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function f1(x){ return x==null?'–':(Math.round(x*100)/100).toFixed(2); }
  function sg(x){ return x==null?'–':(x>0?'+':'')+(Math.round(x*100)/100).toFixed(2); }
  var last=0;
  function render(j){ var b=D.getElementById('agnAccBody'); if(!b) return;
    if(!j||!j.ok){ b.innerHTML='<p class="agn-enssub">'+esc((j&&j.why)||'The monitor has not answered.')+'</p>'; return; }
    var n=j.h24&&j.h24.national, h='<p class="agn-enssub">Last run '+esc(j.lastRun||'not yet')+' · '+(n?n.n:0)+' pairs in 24 h · national MAE '+f1(n&&n.mae)+' °C, bias '+sg(n&&n.bias)+' °C (served minus observed) · '+(j.cpuMs!=null?j.cpuMs+' ms CPU':'')+(j.backfill&&j.backfill.done?' · backfill '+esc(j.backfill.days[0])+'–'+esc(j.backfill.days[j.backfill.days.length-1])+', '+j.backfill.pairs+' pairs':'')+'</p>';
    var fl=j.flags||[];
    h+=fl.length?'<p class="agn-enssub"><b>Flagged</b> ('+fl.length+'): '+fl.slice(0,8).map(function(f){ return esc(f.city)+' — '+esc(f.why)+' ['+esc(f.reference)+']'; }).join('; ')+'</p>':'<p class="agn-enssub">No city outside its own normal range.</p>';
    /* v91.17.277 · ACCFLAG 3 · as measured vs siting-adjusted (flagged cities and cities with a station siting offset), and the separate night line */
    var sf=j.siteFlags||[]; if(sf.length) h+='<p class="agn-enssub"><b>Station differs from reference at night</b> ('+sf.length+'): '+sf.slice(0,8).map(function(f){ return esc(f.city)+' — '+esc(f.label)+'; '+esc(f.why); }).join('; ')+'</p>';
    var am=j.asMeasured||[]; if(am.length) h+='<p class="agn-enssub"><b>As measured vs siting-adjusted</b> (24 h, °C): '+am.slice(0,12).map(function(x){ return esc(x.city)+' MAE '+esc(x.asMeasured.mae)+' / bias '+esc(x.asMeasured.bias)+' as measured, '+esc(x.adjusted.mae)+' / '+esc(x.adjusted.bias)+' adjusted'; }).join('; ')+'</p>';
    var fr=j.freshness&&j.freshness.jobs||[]; if(fr.length) h+='<p class="agn-enssub">Jobs: '+fr.map(function(x){ return esc(x.job)+' '+(x.ok?'ok':'<b>check</b>')+' ('+esc(x.note)+')'; }).join(' · ')+'</p>';
    var C=(j.h24&&j.h24.city)||{}, W=(j.d7&&j.d7.city)||{}, ks=Object.keys(C).filter(function(k){ return C[k].n>=6; }).sort(function(a,b){ return C[b].mae-C[a].mae; }).slice(0,20);
    if(ks.length){ h+='<table class="agn-sc-t"><thead><tr><th>city (stations within 40 km)</th><th>24 h MAE</th><th>24 h bias</th><th>n</th><th>7 d MAE</th><th>7 d bias</th><th>worst station (24 h)</th></tr></thead><tbody>';
      ks.forEach(function(k){ var c=C[k], w=W[k]||{}; h+='<tr><td><b>'+esc(k)+'</b></td><td>'+f1(c.mae)+'</td><td>'+sg(c.bias)+'</td><td>'+c.n+'</td><td>'+f1(w.mae)+'</td><td>'+sg(w.bias)+'</td><td>'+esc(c.worst?c.worst.name+' ('+f1(c.worst.mae)+')':'–')+'</td></tr>'; });
      h+='</tbody></table>'; }
    var Z=(j.h24&&j.h24.zone)||{}, zk=Object.keys(Z); if(zk.length) h+='<p class="agn-enssub">Zones (24 h): '+zk.map(function(k){ return esc(k)+' MAE '+f1(Z[k].mae)+', bias '+sg(Z[k].bias)+', n '+Z[k].n; }).join(' · ')+'</p>';
    b.innerHTML=h; }
  function load(){ if(Date.now()-last<120e3) return; last=Date.now(); fetch('/api/accuracy',{cache:'no-store'}).then(function(x){ return x.ok?x.json():null; }).then(render).catch(function(){ render(null); }); }
  function mount(){ var c=D.getElementById('agnAccCard');
    if(!isOp()){ if(c) c.remove(); return; } if(c){ load(); return; }
    var after=D.getElementById('agnScCard')||D.getElementById('agnGateCard')||D.getElementById('agnTrkCard')||D.getElementById('crossCard'); if(!after||!after.parentNode) return;
    c=D.createElement('article'); c.className='opsx-card'; c.id='agnAccCard';
    c.innerHTML='<div class="opsx-head"><div><h3>Accuracy monitor</h3><p>Operator only. Every hour, the temperature served at each clean MACH station (the station itself left out of the live layer), synoptic station and airport against what it measured. A city is flagged when its 24-hour error leaves the 95th percentile of its own past 30 days.</p></div><span class="opsx-badge">Operator</span></div><div id="agnAccBody"></div>';
    after.parentNode.insertBefore(c, after.nextSibling); last=0; load(); }
  D.addEventListener('agn:operator', mount); setInterval(mount, 5000); setTimeout(mount, 4500);
})();
