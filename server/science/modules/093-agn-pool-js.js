
(function(){
  

  var D=document, BASE=location.origin, LAST=null, busy=false;
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function n1(v){ return v==null||!isFinite(v)?'—':(Math.round(v*10)/10).toFixed(1); }
  function pc(v){ return v==null?'—':Math.round(v*100)+'%'; }
  function cls(c){ return c?'<i class="agn-pool-cls-'+esc(String(c).split(' ')[0])+'">'+esc(c)+'</i>':'—'; }
  function get(p){ return fetch(BASE+p,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }); }
  function host(){
    var e=D.getElementById('agnPool'); if(e) return e;
    var conf=D.querySelector('.mm-conf'); if(!conf) return null;
    e=D.createElement('div'); e.id='agnPool'; e.className='agn-pool';
    e.innerHTML='<h4>NIGRAAN products · <span id="agnPoolCity"></span></h4><p class="sub">Four figures on top of the model list: the forecast and the confidence are kept apart; disagreement never moves the number.</p><div class="agn-pool-grid" id="agnPoolGrid"><div class="agn-pool-cell">loading the pool…</div></div><div class="agn-pool-foot" id="agnPoolFoot"></div>';
    conf.parentNode.insertBefore(e, conf.nextSibling); return e;
  }
  function station(){ try{ if(window.mmState&&mmState.station&&mmState.station.lat!=null) return mmState.station; var st=(window.STATIONS||[]).find(function(x){ return x.id===(window.selectedId||''); })||(window.STATIONS||[])[0]; return st; }catch(_){ return null; } }
  function draw(j){
     
    function plain87(t,t36){ var d=Math.max(+t.dispersion||0,+t36.dispersion||0); if(!(d>0)) return '';
      var lo=t36.p10, hi=t36.p90, rng=(lo!=null&&hi!=null)?' Plan on '+Math.round(lo)+'–'+Math.round(hi)+' °C at +36 h, not the single number.':'';
      return '<p class="agn-plain87">'+(d<1.5?'The models agree within '+n1(d)+' °C; the single number is usable.':'Most models sit within a '+n1(d)+' °C band.'+rng)+'</p>'; }
    var e=host(); if(!e) return; var g=D.getElementById('agnPoolGrid'), f=D.getElementById('agnPoolFoot');
    if(!j||j.error){ g.innerHTML='<div class="agn-pool-cell">pool unavailable <em>'+esc(j&&j.message||'backend not reachable')+'</em></div>'; return; }
    var t=j.now&&j.now.temperature||{}, w=j.now&&j.now.wind||{};
    var h36=(j.hourly||[])[36]||{}; var t36=h36.temperature||{};
    var r1=(j.ensembleRain||[])[1]||null, d1=(j.deterministicRain||[])[1]||null;
    var ex=r1&&r1.exceed||{};
    g.innerHTML=
      '<div class="agn-pool-cell"><span>Raw model median · now (before place correction)</span><b>'+n1(t.p50)+' °C</b><em>P10 '+n1(t.p10)+' · P90 '+n1(t.p90)+' · mean '+n1(t.mean)+' (diagnostic)</em><div class="agn-pool-row"><em>+36 h</em><i>'+n1(t36.p50)+' °C · '+n1(t36.p10)+'–'+n1(t36.p90)+'</i></div><div class="agn-pool-row"><em>wind now</em><i>'+n1(w.p50==null?null:w.p50*3.6)+' km/h</i></div><em>'+esc(t.families||'—')+' families, '+esc(t.n||'—')+' models · family-weighted median</em></div>'+
      '<div class="agn-pool-cell"><span>Rain tomorrow (ensemble median; shares are member counts)</span><b>'+(r1?n1(r1.p50)+' mm':'—')+'</b><em>'+(r1?'P10 '+n1(r1.p10)+' · P90 '+n1(r1.p90)+' mm':'ensembles unavailable')+'</em>'+(r1?'<div class="agn-pool-row"><em>P &gt; 10 mm</em><i>'+pc(ex[10])+'</i></div><div class="agn-pool-row"><em>P &gt; 25 mm</em><i>'+pc(ex[25])+'</i></div><div class="agn-pool-row"><em>P &gt; 50 mm</em><i>'+pc(ex[50])+'</i></div><em>global ensemble median '+n1((function(o,re){ o=o||{}; for(var k in o){ if(re.test(k)&&o[k]) return o[k].p50; } return null; })(r1.systems,/ENS$/))+' · AI ensemble median '+n1((function(o,re){ o=o||{}; for(var k in o){ if(re.test(k)&&o[k]) return o[k].p50; } return null; })(r1.systems,/^WeatherN/))+' mm · equal system weight</em>':'')+(d1?'<em>deterministic family median '+n1(d1.p50)+' mm</em>':'')+'</div>'+
      '<div class="agn-pool-cell"><span>Model agreement</span><b>'+cls(t.agreement)+'</b><em>dispersion '+n1(t.dispersion)+' °C (P90 − P10: 90th minus 10th percentile) now · '+n1(t36.dispersion)+' °C at +36 h</em>'+plain87(t,t36)+'<div class="agn-pool-row"><em>physical NWP (numerical weather prediction)</em>'+cls(t.physicalAgreement)+'</div><div class="agn-pool-row"><em>AI models</em>'+cls(t.aiAgreement)+'</div>'+(r1?'<div class="agn-pool-row"><em>ensemble systems</em>'+cls(r1.systemAgreement)+'</div>':'')+'</div>'+
      '<div class="agn-pool-cell"><span>NIGRAAN confidence</span><b>'+esc(j.now&&j.now.regime&&j.now.regime.name||'—')+'</b><em>'+esc(j.now&&j.now.regime&&j.now.regime.use||'')+'</em><div class="agn-pool-row"><em>corrected</em><i>'+(j.correctedTemperature?'yes':'model layer, raw')+'</i></div><div class="agn-pool-row"><em>weights</em><i>equal per family</i></div><em>day 4–7: ensemble distributions · day 8–15: probabilities and ranges only</em></div>';
     
    f.innerHTML='Pool rule: weighted median, one vote per forecast family; '+Object.keys(j.rule&&j.rule.notPooled||{}).length+' feeds are not pooled (two regional models without a Pakistan domain and one second-opinion feed driven by a model already in the pool). Two ensembles carry equal weight. Status: ensemble shares are member counts (not calibrated); the pooling rule is empirical.';
    D.getElementById('agnPoolCity').textContent=(station()||{}).name||'';
  }
  function tick(){ if(!D.documentElement.classList.contains('agn-operator')){ var _h=D.getElementById('agnPool'); if(_h) _h.remove(); LAST=null; return; }   /* v91.17.283.12: operator view only (the forecast pool, a second calculation) */
    var s=station(); if(!s||s.lat==null||busy) return; var key=s.lat+','+s.lon; if(LAST===key) return; busy=true; host(); var q='lat='+s.lat+'&lon='+s.lon+(s.elev!=null?'&elev='+s.elev:(s.elevation!=null?'&elev='+s.elevation:''))+'&days=5'; get('/api/pool/point?'+q).then(function(j){ busy=false; if(j&&!j.error) LAST=key; draw(j); }); }
  function start(){ if(!D.querySelector('.mm-conf')) return setTimeout(start,1500); tick(); setInterval(tick,5000); }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',start); else start();
})();
