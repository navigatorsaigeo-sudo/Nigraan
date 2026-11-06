
(function(G){
  'use strict';
  var D=document, TAB='temp', LAST=null, FW={key:null,n:0,busy:false,failed:false};
  D.addEventListener('click',function(e){ var b=e.target&&e.target.closest?e.target.closest('[data-fc251-retry]'):null; if(!b) return; FW={key:null,n:0,busy:false,failed:false}; var pf=D.getElementById('agnFc251P'); if(pf) pf.innerHTML='<div class="wait">Loading the forecast for this place…</div>'; render(); });
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function f1(x){ return (Math.round(x*10)/10).toFixed(1); }
  function hh(t){ return String(t).slice(11,16); }
  var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function dayName(t){ var d=new Date(String(t).slice(0,10)+'T00:00:00Z'); return DAYS[d.getUTCDay()]+' '+d.getUTCDate(); }
  function when(t){ return dayName(t)+' '+hh(t); }
  function point(){ try{ var p=G.AGN&&G.AGN.data&&G.AGN.data.activePoint?G.AGN.data.activePoint():null; return (p&&p.lat!=null)?p:null; }catch(_){ return null; } }
  function placeName(p){ var e=D.querySelector('#agnLive84 .agn-place span'); return String((e&&e.textContent)||(p&&p.name)||'this place').trim(); }
  function sw(i){ try{ return G.AGN.hz5.swatch[i]; }catch(_){ return ['#cfe8c9','#fff3b0','#fdd49e','#f4a582','#d6604d'][i]; } }
  /* v91.17.283.24 · W1/W11: the heat level bands of the UTCI chart are the thresholds register's (AGN.levelLegends: GET /api/registry/levels,
     utci.levels.heat), never typed; until the register is held no band is drawn */
  function heatBands(){ var L=G.AGN&&G.AGN.levelLegends, H=L&&L.levels&&L.levels.heat, Wd=(L&&L.words)||[], o=[]; if(!H) return o;
    Object.keys(H).forEach(function(w){ var r=H[w]&&H[w].range, i=Wd.indexOf(w); if(Array.isArray(r)&&r[0]!=null&&i>0) o.push([r[0], r[1]==null?99:r[1], i]); }); return o; }
   
  function utciAdvice(u){
    if(u==null) return null;
    /* v91.17.283.4 S10: the class of the UTCI assessment scale only; work limits are the site's own occupational-health rules */
    var T='The class is from the UTCI assessment scale; it is not a work instruction. Set work limits with your occupational-health adviser.';
    /* v91.17.283.24 · W1: the one UTCI class table (agnUtciClass: the register's utci.classes); no level of the page's own for an hour */
    var c=(typeof G.agnUtciClass==='function')?G.agnUtciClass(u):null; if(!c) return null;
    return {c:c, t:c==='No thermal stress'?'The class is from the UTCI assessment scale.':T}; }

  function card(){
    var sec=D.getElementById('agnHz87-h72'); if(!sec) return null;
    var c=D.getElementById('agnFc251');
    if(!c){ c=D.createElement('section'); c.id='agnFc251'; c.className='agn-fc251'; c.setAttribute('aria-label','Next 72 hours');
      c.innerHTML='<div class="main"><h3 id="agnFc251T">Next 72 hours</h3><div class="sub" id="agnFc251S"></div>'
        +'<div class="tabs" role="tablist">'+[['temp','Temperature'],['utci','Heat stress (UTCI)'],['rain','Rain'],['wind','Wind'],['rh','Humidity']].map(function(x){ return '<button type="button" role="tab" data-t="'+x[0]+'" aria-selected="'+(x[0]===TAB)+'">'+x[1]+'</button>'; }).join('')+'</div>'
        +'<svg id="agnFc251C" role="img" aria-label="72-hour chart"></svg><div class="kpis" id="agnFc251K"></div>'
        +'<details class="tbl"><summary>Show the hourly table</summary><div class="tblwrap" id="agnFc251Tb"></div></details></div>'
        +'<div class="plan"><h4>What to plan for</h4><div id="agnFc251P"><div class="wait">Loading the forecast for this place…</div></div>'
        +'<button type="button" class="how agn-op-only" id="agnFc251How" aria-expanded="false">How sure is this forecast? Compare the models ▾</button></div>';
      var hdr=sec.querySelector(':scope > .agn-hz87-h'); sec.insertBefore(c, hdr?hdr.nextSibling:sec.firstChild);
      c.querySelector('.tabs').addEventListener('click',function(e){ var b=e.target.closest('button[data-t]'); if(!b) return; TAB=b.dataset.t;
        c.querySelectorAll('.tabs button').forEach(function(x){ x.setAttribute('aria-selected',String(x===b)); }); if(LAST) chart(LAST); });
      c.querySelector('#agnFc251How').addEventListener('click',function(){ var on=D.documentElement.classList.toggle('agn-mm251'); this.setAttribute('aria-expanded',String(on));
        this.textContent=on?'Hide the model comparison ▴':'How sure is this forecast? Compare the models ▾';
        if(on){ var m=D.getElementById('mmSection'); if(m&&c.nextSibling!==m) c.parentNode.insertBefore(m,c.nextSibling); setTimeout(function(){ try{ if(typeof G.mmRender==='function') G.mmRender(); }catch(_){} if(m) m.scrollIntoView({behavior:'smooth',block:'start'}); },60); } });
      D.addEventListener('agn:operator',function(e){ if(!(e&&e.detail&&e.detail.operator)){ D.documentElement.classList.remove('agn-mm251'); var hb=D.getElementById('agnFc251How'); if(hb){ hb.setAttribute('aria-expanded','false'); hb.textContent='How sure is this forecast? Compare the models ▾'; } } });
    }
    return c; }

   
  function windowOf(v){ var H=v.hours||[]; var nowT=String(v.time||''); var i0=H.findIndex(function(h){ return String(h.time)>=nowT; }); if(i0<0) i0=0;
    var a=Math.max(0,i0-6), b=Math.min(H.length, i0+67); return {H:H.slice(a,b), now:i0-a}; }

  function chart(v){
    var c=card(); if(!c) return; var svg=c.querySelector('#agnFc251C'); var w=windowOf(v), H=w.H; if(H.length<12){ svg.innerHTML=''; return; }
    var Wd=Math.max(420,Math.round(svg.getBoundingClientRect().width||900)), Ht=230, L=38, R=TAB==='rain'?40:12, T=14, B=34;
    svg.setAttribute('viewBox','0 0 '+Wd+' '+Ht);
    var p=point(), off=5*3600;
    var S={ temp:{k:'tempC',u:'°C',lo:'lo90',hi:'hi90',col:'#0f766e'}, utci:{k:'utciShadeC',u:'°C',col:'#b45309'}, rain:{k:'rainMm',u:' mm',bar:true,col:'#2563eb'},
            wind:{k:'windKmh',u:' km/h',k2:'gustKmh',col:'#0c3851'}, rh:{k:'rh',u:' %',col:'#0e7490',fixed:[0,100]} }[TAB];
    var vals=H.map(function(h){ return h[S.k]; }), lo=S.lo?H.map(function(h){ return h[S.lo]; }):null, hi=S.hi?H.map(function(h){ return h[S.hi]; }):null, v2=S.k2?H.map(function(h){ return h[S.k2]; }):null;
    var chance=null; if(TAB==='rain'&&p&&G.AGN&&G.AGN.prob){ try{ G.AGN.prob.prime(p.lat,p.lon); chance=H.map(function(h){ return G.AGN.prob.pWet(p.lat,p.lon,h.time,off); }); if(!chance.some(function(x){ return x!=null; })) chance=null; }catch(_){ chance=null; } }
    var all=[].concat(vals,lo||[],hi||[],v2||[]).filter(function(x){ return x!=null&&isFinite(x); }); if(!all.length){ svg.innerHTML=''; return; }
    var mn=S.fixed?S.fixed[0]:Math.min.apply(null,all), mx=S.fixed?S.fixed[1]:Math.max.apply(null,all);
    if(S.bar){ mn=0; mx=Math.max(1,mx); } if(TAB==='utci'){ mn=Math.min(mn,20); mx=Math.max(mx,30); }
     
    var stp=1; if(!S.fixed){ var raw=(mx-mn)/4||1, mag=Math.pow(10,Math.floor(Math.log10(raw))); stp=[1,2,2.5,5,10].map(function(m){ return m*mag; }).filter(function(x){ return x>=raw; })[0];
      mn=(TAB==='wind'||S.bar)?0:Math.floor(mn/stp)*stp; mx=Math.ceil(mx/stp)*stp; if(mx<=mn) mx=mn+stp; } else stp=25;
    var n=H.length, X=function(i){ return L+i*(Wd-L-R)/(n-1); }, Y=function(v){ return T+(1-(v-mn)/(mx-mn))*(Ht-T-B); };
    var o=[];
     
    H.forEach(function(h,i){ var hr=+String(h.time).slice(11,13); if(hr>=19||hr<6) o.push('<rect x="'+(X(i)-((Wd-L-R)/(n-1))/2).toFixed(1)+'" y="'+T+'" width="'+((Wd-L-R)/(n-1)).toFixed(1)+'" height="'+(Ht-T-B)+'" fill="#f1f5f8"/>');
      if(hr===0||i===0){ var dn=dayName(h.time), dx=X(i)+4, da='start'; if(dx+dn.length*6.6>Wd-1){ dx=X(i)-4; da='end'; }
        o.push('<line x1="'+X(i).toFixed(1)+'" x2="'+X(i).toFixed(1)+'" y1="'+T+'" y2="'+(Ht-B)+'" stroke="#d6e0e7"/><text x="'+dx.toFixed(1)+'" y="'+(Ht-B+14)+'" font-size="11" font-weight="700" fill="#4a6270" text-anchor="'+da+'">'+esc(dn)+'</text>'); }
      else if(hr%6===0){ var hl=hh(h.time), hw=hl.length*3.1, tx=X(i), ta='middle'; if(tx+hw>Wd-1){ tx=Wd-1; ta='end'; } else if(tx-hw<1){ tx=1; ta='start'; }
        o.push('<text x="'+tx.toFixed(1)+'" y="'+(Ht-B+26)+'" font-size="10" fill="#7a8d99" text-anchor="'+ta+'">'+hl+'</text>'); } });
     
    if(TAB==='utci'){ heatBands().forEach(function(b){ var y1=Y(Math.min(mx,b[1])), y0=Y(Math.max(mn,b[0])); if(b[0]<mx&&y0>y1) o.push('<rect x="'+L+'" y="'+y1.toFixed(1)+'" width="'+(Wd-L-R)+'" height="'+(y0-y1).toFixed(1)+'" fill="'+sw(b[2])+'" opacity=".35"/>'); }); }
     
    var dec=stp<1?(stp<0.5?2:1):(stp%1?1:0);
    for(var gv=mn;gv<=mx+stp*1e-6;gv+=stp){ o.push('<line x1="'+L+'" x2="'+(Wd-R)+'" y1="'+Y(gv).toFixed(1)+'" y2="'+Y(gv).toFixed(1)+'" stroke="#e6edf1"/><text x="'+(L-6)+'" y="'+(Y(gv)+4).toFixed(1)+'" font-size="10" fill="#7a8d99" text-anchor="end">'+gv.toFixed(dec)+'</text>'); }
    o.push('<text x="4" y="'+(T-3)+'" font-size="10" fill="#7a8d99">'+S.u.trim()+'</text>');
    if(lo&&hi){ var up=[], dn=[]; for(var i=0;i<n;i++){ if(lo[i]!=null&&hi[i]!=null){ up.push(X(i).toFixed(1)+','+Y(hi[i]).toFixed(1)); dn.unshift(X(i).toFixed(1)+','+Y(lo[i]).toFixed(1)); } }
      if(up.length>2) o.push('<polygon points="'+up.concat(dn).join(' ')+'" fill="'+S.col+'" opacity=".16"/>'); }
    if(S.bar){ var bw=Math.max(2,(Wd-L-R)/n*0.7); vals.forEach(function(v,i){ if(v!=null&&v>0) o.push('<rect x="'+(X(i)-bw/2).toFixed(1)+'" y="'+Y(v).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+(Y(0)-Y(v)).toFixed(1)+'" fill="'+S.col+'" opacity=".75"/>'); });
      if(chance){ var cd=''; chance.forEach(function(v,i){ if(v==null) return; var yy=T+(1-v/100)*(Ht-T-B); cd+=(cd?' L':'M')+X(i).toFixed(1)+' '+yy.toFixed(1); }); o.push('<path d="'+cd+'" fill="none" stroke="#7c3aed" stroke-width="1.6" stroke-dasharray="4 3"/>');
        [0,50,100].forEach(function(q){ o.push('<text x="'+(Wd-R+5)+'" y="'+(T+(1-q/100)*(Ht-T-B)+4).toFixed(1)+'" font-size="10" fill="#7c3aed">'+q+' %</text>'); }); } }
    else { var d1='', d2=''; vals.forEach(function(v,i){ if(v==null) return; var seg=X(i).toFixed(1)+' '+Y(v).toFixed(1); if(i<=w.now) d1+=(d1?' L':'M')+seg; if(i>=w.now) d2+=(d2?' L':'M')+seg; });
      o.push('<path d="'+d1+'" fill="none" stroke="#5b6b75" stroke-width="2.2"/><path d="'+d2+'" fill="none" stroke="'+S.col+'" stroke-width="2.6"/>');
      if(v2){ var d3=''; v2.forEach(function(v,i){ if(v==null) return; d3+=(d3?' L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1); }); o.push('<path d="'+d3+'" fill="none" stroke="'+S.col+'" stroke-width="1.4" stroke-dasharray="4 3" opacity=".7"/>'); }
      var mi=-1; vals.forEach(function(v,i){ if(i>=w.now&&v!=null&&(mi<0||v>vals[mi])) mi=i; });
      if(mi>=0) o.push('<circle cx="'+X(mi).toFixed(1)+'" cy="'+Y(vals[mi]).toFixed(1)+'" r="4" fill="#d97706" stroke="#fff" stroke-width="1.5"/><text x="'+Math.min(Wd-R-60,X(mi)+6).toFixed(1)+'" y="'+Math.max(T+10,Y(vals[mi])-7).toFixed(1)+'" font-size="11" font-weight="800" fill="#b45309">highest '+(TAB==='rh'?Math.round(vals[mi]):f1(vals[mi]))+S.u+'</text>'); }
    /* v91.17.283.28 · P19 · the "now" label carries the value of the current hour (the served hour at the now line), never the day's highest */
    var nowV=vals[w.now], nowT=(nowV!=null&&isFinite(nowV))?' '+(TAB==='rh'?Math.round(nowV):f1(nowV))+S.u:'';
    o.push('<line x1="'+X(w.now).toFixed(1)+'" x2="'+X(w.now).toFixed(1)+'" y1="'+T+'" y2="'+(Ht-B)+'" stroke="#c0392b" stroke-width="1.6"/><text x="'+(X(w.now)+3).toFixed(1)+'" y="'+(T+10)+'" font-size="10" font-weight="800" fill="#c0392b">now'+nowT+'</text>');
    svg.innerHTML=o.join('');
    var sub={temp:'The corrected hourly forecast at this place, the same curve as the Overview. Shaded: its tested 90 % range. Grey: the hours already past, from the stations.',
      utci:'UTCI in shade, hour by hour. Bands: the heat levels the map uses (UTCI 26 / 32 / 38 / 46 °C).',
      rain:'Forecast rain each hour at this place (bars, left axis, mm)'+(chance?' and the chance of rain in the hour in the area, matched to rain gauges (dashed, right axis, %).':'.'),
      wind:'Wind at 10 m (solid) and gusts (dashed).', rh:'Relative humidity at 2 m.'}[TAB];
    var s=D.getElementById('agnFc251S'); if(s&&s.textContent!==sub) s.textContent=sub;
  }

  /* v91.17.270 G5 · the next 72 hours at a point, computed once: these cards and every NIGRAAN report (agn-r268-js) read it, so the
     high, low, rain and gust of the next 72 hours have one value wherever they are printed */
  /* v91.17.283.29 · W3 · the next 72 hours are the place record's first three days (GET /api/point parts placeRecord.days and the point
     state's days): the day maximum and minimum need every daytime / night hour (dayext.mjs), the rain is the served day total (hour-ending
     PKT day), the gust the served day maximum. A day the server could not complete gives its reason, never a page value. */
  function next72(v,pt){
    var p=pt||point(); if(!p) return null; var B=G.AGN&&G.AGN.pointState&&G.AGN.pointState.peek?G.AGN.pointState.peek(+p.lat,+p.lon):null; if(!B) return null;
    var X=B.parts&&B.parts.placeRecord, R=X&&!X.unavailable&&X.v?X.v:null, PD=(B.days||[]).filter(function(d){ return d.lead>=0&&d.lead<=2; }); if(!R||!R.days) return null;
    var D3=R.days.filter(function(d){ return d.lead>=0&&d.lead<=2; }), mx=null, mn=null, gu=null, why=[], rain=0, rn=0;
    D3.forEach(function(d){ if(d.tmaxC!=null){ if(!mx||d.tmaxC>mx.c) mx={c:d.tmaxC,date:d.date}; } else if(d.tmaxWhy) why.push(d.date+' high: '+d.tmaxWhy);
      if(d.tminC!=null){ if(!mn||d.tminC<mn.c) mn={c:d.tminC,date:d.date}; } else if(d.tminWhy) why.push(d.date+' low: '+d.tminWhy);
      if(d.rainMm!=null){ rain+=d.rainMm; rn++; } else if(d.rainWhy) why.push(d.date+' rain: '+d.rainWhy); });
    PD.forEach(function(d){ if(d.gustMaxKmh!=null&&(!gu||d.gustMaxKmh>gu.kmh)) gu={kmh:d.gustMaxKmh,date:d.date}; });
    return { high:mx?{c:mx.c, time:mx.date+'T00:00', date:mx.date}:null, low:mn?{c:mn.c, time:mn.date+'T00:00', date:mn.date}:null,
             rain:{mm:rn===D3.length&&rn?Math.round(rain*10)/10:null, hours:rn===D3.length?rn*24:0, days:D3.map(function(d){ return {date:d.date,mm:d.rainMm,why:d.rainWhy||null}; })},
             gust:gu?{kmh:gu.kmh, time:gu.date+'T00:00', date:gu.date}:null, days:D3.length, why:why, source:'place record' }; }
  /* v91.17.283.33 · Part 2 · FURTHER AHEAD: the place record's forecast tiers (placeRecord.outlookTiers): days 4-7 as ranges (10th-90th
     percentile of the ensemble members), days 8-14 as chances against normal and of a day of 15.6 mm or more; days 0-3 above are unchanged.
     Accuracy of both tiers: not measured until scored. */
  function tiersHtml(p){ p=p||point(); if(!p) return ''; var B=G.AGN&&G.AGN.pointState&&G.AGN.pointState.peek?G.AGN.pointState.peek(+p.lat,+p.lon):null;
    var X=B&&B.parts&&B.parts.placeRecord, R=X&&!X.unavailable&&X.v?X.v:null, T=R&&R.outlookTiers; if(!T) return '';
    var h='<h4 class="agn-tiers-h">Further ahead</h4>';
    if(!T.ready) return h+'<p class="agn-tiers-n">Not available: '+esc(T.why||'no ensemble outlook for this place')+'.</p>';
    var t2=(T.tiers||[]).filter(function(x){ return x.id==='days4to7'; })[0]||{}, t3=(T.tiers||[]).filter(function(x){ return x.id==='days8to14'; })[0]||{};
    var rg=function(r,u){ return r?f1(r.p10)+'\u2013'+f1(r.p90)+' '+u:'\u2014'; };
    h+='<p class="agn-tiers-n"><b>Days 4\u20137 \u00b7 ranges</b> (10\u201390 % of the ensemble members) \u00b7 accuracy: '+esc(t2.accuracy||'not measured')+'</p>'
      +'<table class="agn-tiers-t"><thead><tr><th>Day</th><th>High</th><th>Low</th><th>Rain</th></tr></thead><tbody>'
      +(t2.days4to7||[]).map(function(d){ return '<tr><td>'+esc(dayName(d.date))+'</td><td>'+rg(d.tmaxC,'°C')+'</td><td>'+rg(d.tminC,'°C')+'</td><td>'+rg(d.rainMm,'mm')+'</td></tr>'; }).join('')+'</tbody></table>';
    var w=t3.days8to14||{};
    h+='<p class="agn-tiers-n"><b>Days 8\u201314 \u00b7 chances</b>'+(w.from?' ('+esc(dayName(w.from))+' to '+esc(dayName(w.to))+')':'')+' \u00b7 accuracy: '+esc(t3.accuracy||'not measured')+'</p>';
    if(!w.ready) h+='<p class="agn-tiers-n">Not available: '+esc(w.why||'')+'.</p>';
    else h+='<ul class="agn-tiers-l"><li>'+(w.temp&&w.temp.hotterPct!=null?'Hotter than normal '+w.temp.hotterPct+' % \u00b7 colder '+w.temp.colderPct+' %':'Temperature: '+esc((w.temp&&w.temp.why)||'not assessed'))+'</li>'
      +'<li>'+(w.rain&&w.rain.wetterPct!=null?'Wetter than the average week '+w.rain.wetterPct+' % \u00b7 drier '+w.rain.drierPct+' %':'Rain: '+esc((w.rain&&w.rain.why)||'not assessed'))+'</li>'
      +'<li>'+(w.rain&&w.rain.heavyDayPct!=null?'At least one day of 15.6 mm or more: '+w.rain.heavyDayPct+' %':'')+'</li></ul>';
    return h+'<p class="agn-tiers-n">'+esc(T.note||'')+'.</p>'; }
  function kpis(v){
    var N=next72(v); if(!N) return '';
    var k=function(a,b,c){ return '<div class="kpi"><span>'+a+'</span><b>'+b+'</b><em>'+c+'</em></div>'; };
    return k('High, next 3 days', N.high?f1(N.high.c)+' °C':'—', N.high?dayName(N.high.date)+' · day maximum':esc(N.why.filter(function(x){ return / high: /.test(x); })[0]||'not complete'))
      +k('Low, next 3 days', N.low?f1(N.low.c)+' °C':'—', N.low?dayName(N.low.date)+' · night minimum':esc(N.why.filter(function(x){ return / low: /.test(x); })[0]||'not complete'))
      +k('Rain, next 3 days', N.rain.mm!=null?f1(N.rain.mm)+' mm':'—', N.rain.mm!=null?N.rain.days.map(function(d){ return dayName(d.date)+' '+f1(d.mm); }).join(' · '):esc(N.why.filter(function(x){ return / rain: /.test(x); })[0]||'a day total is not complete'))
      +k('Peak gust', N.gust?Math.round(N.gust.kmh)+' km/h':'—', N.gust?dayName(N.gust.date):''); }

  function plan(v,p){
    var w=windowOf(v), F=w.H.slice(w.now), o=[];
    var row=function(col,t,txt){ o.push('<div class="row"><i style="background:'+col+'"></i><div><b>'+t+'</b><p>'+txt+'</p></div></div>'); };
     
    var n24=F.slice(0,24), pk=null; n24.forEach(function(h){ if(h.utciShadeC!=null&&(!pk||h.utciShadeC>pk.utciShadeC)) pk=h; });
    var a=pk?utciAdvice(pk.utciShadeC):null; if(a) row('#9fb3bf','Outdoor work · next 24 h', 'Hottest hour '+when(pk.time)+': UTCI '+f1(pk.utciShadeC)+' °C in shade, '+a.c.toLowerCase()+'. '+a.t);
     
    var n36=F.slice(0,36), best=null, cur=null; n36.forEach(function(h){ var hr=+String(h.time).slice(11,13), ok=h.utciShadeC!=null&&typeof G.agnUtciClass==='function'&&G.agnUtciClass(h.utciShadeC)==='No thermal stress'&&hr>=6&&hr<19;
      if(ok){ if(!cur) cur={a:h,b:h,n:0}; cur.b=h; cur.n++; if(!best||cur.n>best.n) best={a:cur.a,b:cur.b,n:cur.n}; } else cur=null; });
    if(best) row('#2e9e5b','Best daytime window', when(best.a.time)+' to '+hh(best.b.time)+' (+1 h): '+best.n+' daylight hour'+(best.n>1?'s':'')+' with no thermal stress (UTCI scale).');
    else { var lw=null; n36.forEach(function(h){ var hr=+String(h.time).slice(11,13); if(hr>=6&&hr<19&&h.utciShadeC!=null&&(!lw||h.utciShadeC<lw.utciShadeC)) lw=h; });
      if(lw) row('#d97706','Best daytime window', 'No daylight hour in the next 36 h is free of heat stress; the least stressful is '+when(lw.time)+' (UTCI '+f1(lw.utciShadeC)+' °C).'); }
     
    var rc=[]; if(p&&G.AGN&&G.AGN.prob){ [0,1].forEach(function(d){ try{ var x=G.AGN.prob.dayChance(p.lat,p.lon,d); if(x&&x.pct!=null) rc.push((d?'tomorrow ':'today ')+x.pct+' %'); }catch(_){} }); }
    var N3=next72(v,p), r72=N3&&N3.rain?N3.rain.mm:null;   /* v91.17.283.29 · W3: the place record's three day totals (was a sum of hours with gaps as 0) */
    row(r72==null?'#c7d6e0':r72>=10?'#2563eb':r72>=1?'#7fb2e5':'#c7d6e0','Rain', (rc.length?'Chance of 1 mm or more in the area: '+rc.join(', ')+'. ':'')+(r72==null?'The rain of the next 3 days is not complete'+(N3&&N3.why&&N3.why.length?' ('+esc(N3.why.filter(function(x){ return / rain: /.test(x); })[0]||N3.why[0])+')':'')+'.':r72>=0.1?f1(r72)+' mm forecast in the next 3 days at this place ('+N3.rain.days.map(function(d){ return dayName(d.date)+' '+f1(d.mm); }).join(', ')+').':'No rain forecast in the next 3 days at this place.'));
     
    var aq=D.getElementById('aqAqi'), ab=D.getElementById('aqBand'), uv=D.getElementById('aqUv'), ub=D.getElementById('aqUvBand'), adv=D.getElementById('aqAdvice');
    var aqv=aq?String(aq.textContent||'').trim():'', uvv=uv?String(uv.textContent||'').trim():'';
    if(aqv||uvv){ var n=+aqv; row(n>=150?'#d6604d':n>=100?'#f4a582':n>=51?'#fff3b0':'#cfe8c9','Air and sun now', (aqv?'Air quality '+esc(aqv)+(ab?' · '+esc(String(ab.textContent||'').split('·')[0].trim()):'')+'. ':'')+(uvv?'UV '+esc(uvv)+(ub?' · '+esc(String(ub.textContent||'').split('·')[0].trim()):'')+'. ':'')+(adv&&n>=100?esc(String(adv.textContent||'').split('.')[0])+'.':'')); }
    return o.join(''); }

  function table(v){ var w=windowOf(v), F=w.H.slice(w.now);
    return '<table><thead><tr><th>Hour (PKT)</th><th>°C</th><th>90 % range</th><th>UTCI</th><th>RH %</th><th>Wind</th><th>Gust</th><th>Rain mm</th></tr></thead><tbody>'
      +F.map(function(h){ return '<tr><td>'+esc(when(h.time))+'</td><td>'+(h.tempC!=null?f1(h.tempC):'—')+'</td><td>'+(h.lo90!=null?f1(h.lo90)+'–'+f1(h.hi90):'—')+'</td><td>'+(h.utciShadeC!=null?f1(h.utciShadeC):'—')+'</td><td>'+(h.rh!=null?Math.round(h.rh):'—')+'</td><td>'+(h.windKmh!=null?Math.round(h.windKmh):'—')+'</td><td>'+(h.gustKmh!=null?h.gustKmh:'—')+'</td><td>'+(h.rainMm!=null?f1(h.rainMm):'—')+'</td></tr>'; }).join('')+'</tbody></table>'; }

  function render(){
    var v=D.querySelector('.view[data-view="livedata"]'); if(!v||!v.classList.contains('active')) return;
    var c=card(); if(!c) return; var p=point(); if(!p||!G.AGN.nowAt) return;
    var pv=G.AGN.nowAt.peek(p.lat,p.lon), pk=(+p.lat).toFixed(4)+','+(+p.lon).toFixed(4);
    if(!pv||!pv.hours){ if(FW.key!==pk){ FW={key:pk,n:0,busy:false,failed:false}; }
      if(FW.failed||FW.busy) return;
      if(FW.n>=3){ FW.failed=true; var pf=D.getElementById('agnFc251P'); if(pf) pf.innerHTML='<div class="wait">The forecast for '+esc(placeName(p))+' is not available right now. <button type="button" class="agn-retry" data-fc251-retry="1">Try again</button></div>'; return; }
      FW.busy=true; FW.n++; var k0=pk;
      G.AGN.nowAt.get(p.lat,p.lon).then(function(){ return true; },function(){ return false; }).then(function(){ setTimeout(function(){ if(FW.key!==k0) return; FW.busy=false; var v2=G.AGN.nowAt.peek(p.lat,p.lon); if(v2&&v2.hours){ render(); return; } setTimeout(render,FW.n*4000); },50); });
      return; }
    FW={key:pk,n:0,busy:false,failed:false};
    LAST=pv; var nm=placeName(p), t=D.getElementById('agnFc251T'), tt='Next 72 hours · '+nm; if(t&&t.textContent!==tt) t.textContent=tt;
    chart(pv);
    var k=D.getElementById('agnFc251K'), kh=kpis(pv); if(k&&k.innerHTML!==kh) k.innerHTML=kh;
    var pl=D.getElementById('agnFc251P'), ph=plan(pv,p); if(pl&&pl.innerHTML!==ph) pl.innerHTML=ph;
    var tb=D.getElementById('agnFc251Tb'); if(tb){ var th=table(pv); if(tb.innerHTML!==th) tb.innerHTML=th; }
    var ti=D.getElementById('agnFc251Ti'); if(!ti&&k&&k.parentNode){ ti=D.createElement('div'); ti.id='agnFc251Ti'; ti.className='agn-tiers'; k.parentNode.insertBefore(ti,k.nextSibling); }
    if(ti){ var tih=tiersHtml(p); if(ti.innerHTML!==tih) ti.innerHTML=tih; }
  }
   
  function replay(){ var v=D.querySelector('.view[data-view="livedata"]'), m=D.querySelector('.view[data-view="modelab"]'); if(!v||!m) return;
    var r=v.querySelector(':scope > .timewrap'); if(!r) return; if(r.parentNode!==m) m.appendChild(r); }
  ['agn:now','agn:location','agn:view','agn:prob','agn:data'].forEach(function(e){ D.addEventListener(e,function(){ setTimeout(render,120); }); });
  var rt=null; G.addEventListener('resize',function(){ clearTimeout(rt); rt=setTimeout(function(){ if(LAST) chart(LAST); },200); });
  setInterval(function(){ render(); replay(); },5000); setTimeout(function(){ render(); replay(); },1500);
  G.AGN=G.AGN||{}; G.AGN.fc251={ render:render, next72:next72, tiersHtml:tiersHtml };
})(window);
