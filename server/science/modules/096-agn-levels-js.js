
(function(G){
  'use strict';
  

  var D=G.document, AGN=G.AGN=G.AGN||{};
  var W=['Normal','Low','Moderate','High','Severe'];
  var INK=['#3d6b26','#6f6212','#8a6410','#a8501a','#7d1c1c'];    
  var ND_INK='#6b7681';
  function num(v){ if(v==null||v==='') return null; var n=Number(v); return isFinite(n)?n:null; }
  function bandOf(score){
    var s=num(score); if(s==null) return null;
    try{ var b=(AGN.hazards&&AGN.hazards.band)?AGN.hazards.band(s):(typeof G.agnBandOf==='function'?G.agnBandOf(s):null);
         return (b&&b.index!=null)?b:null; }catch(_){ return null; }
  }
  function index(score){ var b=bandOf(score); return b?b.index:null; }
  function word(score){ var i=index(score); return i==null?'No data':W[i]; }
  

   
  function ofClass(c){ try{ var i=(AGN.hz5&&AGN.hz5.catLevel)?AGN.hz5.catLevel(c):null; if(i==null&&/^negligible\b/i.test(String(c||'').trim())) i=0; return i==null?null:W[i]; }catch(_){ return null; } }
  
  function ink(i){ return i==null?ND_INK:INK[i]; }
   
  function top(entries){
    var best=null, holders=[];
    (entries||[]).forEach(function(e){ var i=index(e&&e.score); if(i==null) return;
      if(best==null||i>best){ best=i; holders=[e]; } else if(i===best) holders.push(e); });
    return {i:best, word:best==null?'No data':W[best], holders:holders};
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function list(a){ return a.length<2?(a[0]||''):(a.slice(0,-1).join(', ')+' and '+a[a.length-1]); }

  

  var FIELD={rain:['rainfall','mm'],soilMoist:['soil moisture 7-28 cm','m\u00b3/m\u00b3'],api:['antecedent wetness','(index)'],t:['air temperature','\u00b0C'],
             hum:['relative humidity','%'],gust:['gust','km/h'],wind:['sustained wind','km/h'],smRoot:['root-zone soil moisture','m\u00b3/m\u00b3']};
  function readout(x){
    try{
      if(x.nd) return 'no data: '+(x.provWhy||'the governing input did not arrive for this unit');
      var ins=(x.provIn||[]).filter(function(q){ return q && q.state!=='absent' && q.value!=null; });
      if(ins.length){
        return 'scored from '+ins.map(function(q){ var f=FIELD[q.field]||[q.field,''];
          var v=Number(q.value); v=(Math.abs(v)<1&&v!==0)?v.toFixed(2):(Math.round(v*10)/10);
          return f[0]+' '+v+(f[1]?' '+f[1]:''); }).join(', ')
          +(x.measurand?' \u00b7 '+x.measurand+' is not reported separately':'');
      }
    }catch(_){}
    return x.physWhy||'no physical quantity published for this layer';
  }

  AGN.level={ words:W.slice(), word:word, index:index, band:bandOf, ofClass:ofClass, ink:ink, top:top, readout:readout,
    contract:'the one customer level: word(score) is AGN.hazards.band(score), the band the map fill uses (screeningCuts of '
            +'data/hazard-scale.json). ofClass() is only for a surface holding an engine class and no score (GLOF lakes).' };

   
  function wrap(name, after){
    try{ var f=G[name]; if(typeof f!=='function'||f.__agnL) return false;
      var w=function(){ var r=f.apply(this,arguments); try{ after.apply(this,[r].concat([].slice.call(arguments))); }catch(_){} return r; };
      w.__agnL=true; w.__orig=f; G[name]=w; return true; }catch(_){ return false; }
  }
  var last02={};
  var IMPACT_HZ={Heat:'heat',Rainfall:'rain_hz',Wind:'wind',Flood:'flood'}, lastImpactSt=null;
  function fixImpact(s){
    var box=D.getElementById('impactBars'); if(!box) return;
    if(s) lastImpactSt=s; else s=lastImpactSt||activeSt();
    var ent=[];
    box.querySelectorAll('.ibar').forEach(function(b){
      var k=(b.querySelector('span')||{}).textContent||'', p=b.querySelector('.pct'), c=b.querySelector('.ibar-class');
      var v=p?num(String(p.textContent).replace(/[^0-9.\-]/g,'')):null;
      if(p && !/^\s*[0-9]/.test(p.textContent)) v=null;
       
      var hk=IMPACT_HZ[k.trim()], u=(hk&&s)?stationScore(s,hk):null;
      var f=b.querySelector('.fill');
      if(hk && s && p){
        if(u!=null){ v=Math.round(u); if(p.textContent!==String(v)) p.textContent=String(v); p.title=k+' screening index '+v+'/100 for '+stationUnit(s)+', the same evaluation the map and the unit panel use';
          if(f){ f.classList.remove('nodata'); f.style.width=v+'%'; } }
        else { v=null; if(p.textContent!=='\u2014') p.textContent='\u2014'; p.title='The unit input for '+stationUnit(s)+' has not arrived; the unit panel shows the same gap.'; if(f){ f.classList.add('nodata'); f.style.width='100%'; } } }
      var i=index(v); if(c){ var ct=(v==null?'No data':W[i]); if(c.textContent!==ct) c.textContent=ct; c.style.color=ink(i); }
      ent.push({label:k, score:v}); last02[k.toLowerCase()]=v;
    });
    var t=top(ent), valEl=D.getElementById('impactScore'), lab=D.querySelector('#impactRing .lab'), note=box.querySelector('.ibar-note');
    if(t.i==null){ if(valEl){ valEl.textContent='\u2014'; valEl.style.color=ND_INK; } if(lab){ lab.textContent='No data'; lab.title='No hazard resolved for this place yet.'; }
      if(note) note.textContent='No hazard resolved for this place yet: the unit input has not arrived (the unit panel shows the same gap).'; return; }
    var names=t.holders.map(function(h){ return h.label; });
     
    var nd=ent.filter(function(e){ return index(e&&e.score)==null; }).length, sc=ent.length-nd;
    if(valEl){ AGN_putT(valEl,t.word); valEl.style.color=ink(t.i); }    
    if(lab){ AGN_putT(lab,(t.i===0?(nd?'Scored hazards':'All hazards'):(names.slice(0,2).join(' + ')+(names.length>2?' +'+(names.length-2):''))));
             lab.title=t.i===0?'Every scored hazard is Normal here.':(t.word+' is the highest level, held by '+list(names)+'.'); }
    var ring=D.getElementById('impactRing');
    if(ring){ var col=getComputedStyle(D.body).getPropertyValue('--accent-a').trim()||'#14B8A6', arc=[12,30,50,75,100][t.i];
      ring.style.background='conic-gradient('+col+' 0 '+arc+'%, rgba(12,56,81,.1) '+arc+'% 100%)'; }
    if(note){ var un=(note.textContent.match(/(\d) of 4 hazards unresolved[^.]*\./)||[''])[0];
      AGN_putT(note,(t.i===0?(nd?('Normal on '+sc+' of '+ent.length+' hazards; '+nd+' '+(nd>1?'have':'has')+' no data here yet.'):'All four hazards are Normal here (the level the map shows).')
        :(list(names)+(names.length>1?' are':' is')+' at '+t.word+', the highest level of the four hazards here.'))
        +' Each hazard is placed on the five-level scale from its own index; the indexes are not a common scale.'+(un?' '+un:'')); }
  }
   
  

  var unitCache={};
  function stationUnit(s){
    if(!s) return null; var k=s.id||s.name;
    if(unitCache[k]!==undefined) return unitCache[k];
    var u=null;
    try{ var x=(AGN.siteUnit&&s.lat!=null)?AGN.siteUnit(+s.lat,+s.lon):null; if(x&&x.scored&&x.key) u=x.key; }catch(_){}
    if(!u){ var d=(G.STATION_DISTRICT&&G.STATION_DISTRICT[s.id]&&G.STATION_DISTRICT[s.id].district)||s.name; if(d&&G.DISTRICT_IN&&G.DISTRICT_IN[d]) u=d; }
    if(u) unitCache[k]=u;
    return u||((G.STATION_DISTRICT&&G.STATION_DISTRICT[s.id]&&G.STATION_DISTRICT[s.id].district)||s.name||null);
  }
  

  function stationScore(s,h){
    var dist=stationUnit(s); if(!dist) return null;
    try{ var inp=null; try{ if(typeof G.hzDayInput==='function'){ var di=G.hzDayInput(dist,h); if(di&&!di.__unavailable) inp=di; } }catch(_){}    
      if(!inp) inp=G.DISTRICT_IN&&G.DISTRICT_IN[dist];
      if(inp && AGN.hazards && AGN.hazards.evaluate){ var ev=AGN.hazards.evaluate(dist, inp, h, 24, dist);
        if(ev && ev.available && ev.screening && ev.screening.index!=null && isFinite(ev.screening.index)) return ev.screening.index; } }catch(_){}
    return null;
  }
  AGN.level.stationScore=stationScore;
  function activeSt(){ try{ var id=(typeof G.activeStationId==='function')?G.activeStationId():G.selectedId; return (G.STATIONS||[]).find(function(s){ return s.id===id; })||(G.STATIONS||[])[0]||null; }catch(_){ return null; } }

  

  function uhiText(u){
    if(u===undefined) return {sig:'Loading\u2026', note:'Reading the measured urban field at this point.', line:null, pending:true};
    if(u&&u.withheld){ var _w=String(u.why||'').replace(/^not assessed:\s*/i,''); return {sig:'Not assessed', note:'No tested skill: '+_w, line:'not assessed (no tested skill): '+_w}; }   /* v91.17.283.6 C12: a withheld answer (it read NaN before) */
    if(!u) return {sig:'Not available', note:'The urban heat field did not answer for this point.', line:'not available for this point (the urban field did not answer)'};
    if(u.none) return {sig:'None here', note:'No built-up area at this point, so no urban heat island.', line:'none at this point (no built-up area)'};
    var sg=function(v){ v=Number(v); return (v>=0.05?'+':v<=-0.05?'\u2212':'')+Math.abs(v).toFixed(1); };
    return { sig:sg(u.nowC)+' \u00b0C now \u00b7 up to '+sg(u.maxC)+' \u00b0C tonight',
             note:'Urban heat island at this point from the measured urban field (building density and vegetation'+(u.lcz?', '+u.lcz:'')+'), the same value as the forecast card. An amount on top of the forecast temperature, not a temperature.',
             line:sg(u.nowC)+' \u00b0C now, up to '+sg(u.maxC)+' \u00b0C tonight (measured urban field at this point; on top of the forecast, not added to it)' };
  }
  function uhiFor(s){ try{ if(!s||!AGN.urbanNow) return undefined; var p=AGN.urbanNow.peek(s.lat,s.lon);
      if(p===undefined){ AGN.urbanNow.get(s.lat,s.lon).then(function(){ applyUhi(); }); } return p; }catch(_){ return undefined; } }
  var uhiBusy=false;
  function applyUhi(){
    if(uhiBusy) return; var s=activeSt(); var t=uhiText(uhiFor(s)); if(!t) return;
    var a=D.getElementById('uhiSignal'), n=D.getElementById('uhiSignalNote');
    uhiBusy=true;
    try{ if(a&&a.textContent!==t.sig) a.textContent=t.sig; if(n&&n.textContent!==t.note) n.textContent=t.note; }catch(_){}
    uhiBusy=false;
  }
  

  function watchUhi(){
    ['uhiSignal','uhiSignalNote'].forEach(function(id){ var el=D.getElementById(id); if(!el||el.__agnL) return; el.__agnL=1;
      try{ new MutationObserver(function(){ if(!uhiBusy) applyUhi(); }).observe(el,{childList:true,characterData:true,subtree:true}); }catch(_){} });
  }
  function fixOpsBrief(r,s,c){
    try{ var hs=stationScore(s,'heat'), el=D.getElementById('commuteRisk'), nt=D.getElementById('commuteRiskNote');
      if(el){ el.textContent=(hs==null?'Heat: No data':('Heat: '+word(hs))); el.style.color=ink(index(hs)); }
      

      if(nt&&c&&isFinite(Number(c.heatStress))) nt.textContent='Heat level at this place from the hazard engine (index '+(hs==null?'\u2014':Math.round(hs))+'/100, the level the map shows)'+(c.feels!=null&&isFinite(Number(c.feels))?' \u00b7 feels like '+Math.round(c.feels)+'\u00b0C':'')+(c.heatStress>=65?' \u00b7 peak commute heat stress likely':' \u00b7 hydration advised during peak sun');
    }catch(_){}
    watchUhi(); applyUhi();
  }

  

  function pkt(ts){ try{ return new Date(ts).toLocaleTimeString('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit',hour12:false}); }catch(_){ return '\u2014'; } }
  function readingAt(s){
    try{ var t=s&&s.omFeatures&&s.omFeatures.time; if(t && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(t)){
        var ms=/[zZ]|[+\-]\d\d:?\d\d$/.test(t)?Date.parse(t):Date.parse(t.slice(0,16)+':00+05:00'); if(isFinite(ms)) return ms; } }catch(_){}
    return (s&&typeof s.liveFetchedAt==='number')?s.liveFetchedAt:null;
  }
  function ageText(ms){
    if(ms==null||!isFinite(ms)) return '';
    var m=Math.max(0,Math.round((Date.now()-ms)/60000)), lim=null;
    try{ lim=(typeof G.FR==='function')?G.FR('confidence.dataAgeMin').demoteToMed:null; }catch(_){ lim=null; }
    var a=m<1?'just now':m<60?(m+' min ago'):(Math.floor(m/60)+' h '+(m%60?(m%60)+' min ':'')+'ago');
    return a+((lim!=null&&m>lim)?' \u00b7 stale':'');
  }
  AGN.level.age={ pkt:pkt, readingAt:readingAt, text:ageText };
  /* v91.17.283.12: fmtAsOf, stationConfidence and asOfLineHTML are written at their source (the point state); their wrappers are removed */

   
  /* v91.17.283.12: discomfortLevel and heatRiskLabel are written at their source; their wrappers are removed */
  function hourPkt(s){ var r=readingAt(s); return r!=null?pkt(r)+' PKT':'this hour'; }
  function comfortRow(c,s){
    

    var ab=null; try{ ab=(s&&s.aqiLive&&typeof G.aqiBand==='function')?G.aqiBand(s.aqi):null; }catch(_){}
    var lim=!!(ab && s.aqi>100);
    return {lim:lim, text:(lim?('Limited by air quality (AQI '+s.aqi+', '+ab.label+') \u00b7 thermal '+c.comfortScore+'/100'):(c.comfortScore+'/100 thermal'+(ab?' \u00b7 air '+ab.label:'')))};
  }
  function fixCompare(){
    try{ if(typeof G.cmpCardHtml!=='function'||G.cmpCardHtml.__agnL) return; var o=G.cmpCardHtml;
      var f=function(s){ var h=o(s); try{
          if(!s||!s.weatherLive) return h;
          var c=G.stationComfort(s), cr=comfortRow(c,s), at=hourPkt(s);
          h=h.replace('<span class="k">Thermal stress (UTCI)</span>','<span class="k">Thermal stress (UTCI) \u00b7 now ('+at+')</span>')
             .replace('<span class="k">Humidity</span>','<span class="k">Humidity \u00b7 now</span>')
             .replace('<span class="k">Feels like</span>','<span class="k">Feels like \u00b7 now</span>')
             .replace(/<span class="k">Comfort score<\/span><span class="v">[^<]*<\/span>/,'<span class="k">Comfort</span><span class="v">'+esc(cr.text)+'</span>');
          var hs=stationScore(s,'heat');
          h=h.replace(/(<div class="cmp-row"><span class="k">Dew point)/,'<div class="cmp-row"><span class="k">Heat level</span><span class="v" style="color:'+ink(index(hs))+'">'+word(hs)+(hs!=null?' \u00b7 index '+Math.round(hs)+'/100':'')+'</span></div>$1');
        }catch(_){} return h; };
      f.__agnL=true; G.cmpCardHtml=f; }catch(_){}
  }
  function fixBrief(){
    try{ if(typeof G.buildBrief!=='function'||G.buildBrief.__agnL) return; var o=G.buildBrief;
      var f=function(s){ var t=o(s); try{
          if(!s||!s.weatherLive) return t;
          var c=G.stationComfort(s), hs=stationScore(s,'heat'), cr=comfortRow(c,s), u=uhiText(uhiFor(s)), at=hourPkt(s);
          t=t.replace(/^Discomfort index: /m,'Discomfort index now ('+at+'): ')
             .replace(/Humidity: /,'Humidity now: ')
             .replace(/^(Heat stress at this place .*)$/m,'$1\nHeat level of the area (tehsil, the level on the map and on 02): '+word(hs))
             .replace(/^Comfort score: .*$/m,'Comfort: '+cr.text)
             .replace(/^Urban heat: .*$/m,'Urban heat: '+(u&&u.line?u.line:'loading (the urban field has not answered yet; copy again in a moment)'));
        }catch(_){} return t; };
      f.__agnL=true; G.buildBrief=f; }catch(_){}
  }

  

  

  /* v91.17.283.12: pointTiles (an overwrite of the left panel cells with the point values) is removed: the panel writes them at its source */
  function fixLeftCard(){
    var L=D.getElementById('mpLeftIn'); if(!L) return;
    L.querySelectorAll('.mp-c').forEach(function(c){ var kk=c.querySelector('.k'), u=c.querySelector('.u');
      if(kk&&/^Humidity$/.test(kk.textContent)&&u&&/% mean/.test(u.textContent)) u.textContent='% daily mean'; });
    var s=activeSt(), nm=(L.querySelector('h4')||{}).textContent||'';
    var _ap=null, _ptv=null; try{ _ap=(G.AGN&&G.AGN.data&&G.AGN.data.activePoint)?G.AGN.data.activePoint():null; _ptv=(_ap&&_ap.lat!=null&&G.AGN.nowAt)?G.AGN.nowAt.peek(_ap.lat,_ap.lon):null; }catch(_){ _ptv=null; }
    var here=!!(s && s.weatherLive && nm===s.name), box=L.querySelector('#agnLvNow');
    if(!here||!_ptv||_ptv.tempC==null){ if(box) box.remove(); return; }
    var f1=function(v){ return (Math.round(v*10)/10).toFixed(1); }, sp=_ptv.support||null;
    var _pl=D.querySelector('#agnLive84 .agn-place span'), place=String((_pl&&_pl.textContent)||(_ap&&_ap.name)||'').split('·')[0].trim();    
    var html='<div class="t">'+f1(_ptv.tempC)+'<small>°C</small></div><div class="r"><b>'+esc(place||nm)+'</b> · now, '+esc(hourPkt(s))
      +(_ptv.lo90!=null&&_ptv.hi90!=null?'<br>range '+f1(_ptv.lo90)+'–'+f1(_ptv.hi90)+' °C (90 %)':'')
      +(sp&&sp.station?'<br>MACH '+esc(String(sp.station).replace(/, Islamabad$/,''))+(sp.km!=null?' · '+f1(sp.km)+' km':'')+(sp.ageMin!=null?' · '+Math.round(sp.ageMin)+' min ago':''):'')+'</div>';
    if(!box){ box=D.createElement('div'); box.id='agnLvNow'; box.className='mp-now'; var h=L.querySelector('.mp-h'); if(h&&h.parentNode) h.parentNode.insertBefore(box,h.nextSibling); else L.insertBefore(box,L.firstChild); }
    if(box.innerHTML!==html) box.innerHTML=html;
    /* v91.17.283.12: the heat tile is the point state's day at its source; no override here */
  }

   
   
  function gOk(h){ try{ return !(G.AGN&&G.AGN.gate&&G.AGN.gate.ready) || G.AGN.gate.canAlert(h); }catch(_){ return false; } }
  function evLanes(v){ return ((v&&v.lanes)||[]).filter(function(l){ return l && l.event!==false && !l.standing && !l.condition && l.score!=null && gOk(l.hazard); }); }
  

  function vLevel(v){ var L=evLanes(v); if(!L.length && v && v.top && v.top.score!=null && gOk(v.top.hazard||v.top.key) && !v.leadIsCondition && !/^(glof|drought)$/.test(String(v.top.hazard||'')) && !(v.standing&&v.standing.hazard===v.top.hazard)) L=[{score:v.top.score}]; var t=top(L); return t.i; }
  var STATE_CLS=['low','low','monitor','watch','act'];
  function setText(id,t){ var el=D.getElementById(id); if(el&&el.textContent!==t) el.textContent=t; }
  AGN.level.ops=function(vs,av){
    vs=vs||[]; var n=[0,0,0,0,0];
    vs.forEach(function(v){ var i=vLevel(v); if(i!=null) n[i]++; });
    var dn=function(k){ return k+' district'+(k===1?'':'s'); };
    setText('opsxNationalStatus', n[4]?('Severe in '+dn(n[4])):n[3]?('High in '+dn(n[3])):n[2]?('Moderate in '+dn(n[2])):'Normal to Low');
    setText('opsxNationalNote', (n[4]+n[3])?(dn(n[4]+n[3])+' at High or Severe \u00b7 '+n[2]+' Moderate \u00b7 '+n[1]+' Low \u00b7 '+n[0]+' Normal')
                                 :('No district at High or Severe \u00b7 '+n[2]+' Moderate \u00b7 '+n[1]+' Low \u00b7 '+n[0]+' Normal'));
    try{ var trig=vs.filter(function(v){ return (v.actionable_count||0)>0; }), tl=[0,0,0,0,0];
      trig.forEach(function(v){ var i=vLevel(v); if(i!=null) tl[i]++; });
      setText('opsxPriorityNote', trig.length?('with a response trigger \u00b7 '+tl[4]+' Severe \u00b7 '+tl[3]+' High \u00b7 '+tl[2]+' Moderate'):'no district has a response trigger'); }catch(_){}
    

    var pop=D.getElementById('opsxExposedPop'); if(pop&&/at Watch/.test(pop.textContent)) pop.textContent='None with a response trigger';
    var pn=D.getElementById('opsxExposedNote'); if(pn) pn.textContent=pn.textContent.replace(/No unit currently at Watch or above/,'No district has an event hazard at its response trigger').replace(/ at Watch or above/g,' with an event hazard at its response trigger');
     
    var rows=D.querySelectorAll('#opsxPriorityRows tr');
     
    var byName={}; vs.forEach(function(v){ if(v&&v.name!=null) byName[String(v.name)]=v; });
    rows.forEach(function(tr){ var nm=((tr.querySelector('td b')||{}).textContent||'').trim(), v=byName[nm]; if(!v) return;
      var st=tr.querySelector('.opsx-state'); if(st && !/no data/i.test(st.textContent)){ var i=vLevel(v);
        st.textContent=i==null?'No data':W[i]; st.className='opsx-state '+(i==null?'nodata':STATE_CLS[i]); }
      tr.querySelectorAll('.opsx-cohz-chip').forEach(function(ch){ var b=ch.querySelector('b'), it=ch.querySelector('i'); if(!b||!it) return;
        var sc=num((String(it.textContent).match(/-?\d+(\.\d+)?/)||[])[0]); b.textContent=word(sc); it.textContent=sc==null?'':String(Math.round(sc)); });
      var nt=tr.querySelector('.opsx-cohz-note'); if(nt) nt.textContent='also scoring \u00b7 each hazard at its own level (the map\u2019s scale), then by name \u00b7 the indexes are not a common scale';
      tr.querySelectorAll('div').forEach(function(d){ var m=/^(.*CONDITION) \u00b7 (Act|Watch|Monitor|Low) (\d+)/.exec(d.firstChild&&d.firstChild.nodeType===3?d.firstChild.nodeValue:'');
        if(m) d.firstChild.nodeValue=m[1]+' \u00b7 '+word(Number(m[3]))+' '+m[3]+' '; });
    });
     
    try{ var L=evLanes(av); var t=top(L.map(function(l){ return {label:l.hazard, score:l.score}; }));
      var lab=function(h){ try{ return String(((G.AI_HAZARDS&&G.AI_HAZARDS[h]&&G.AI_HAZARDS[h].label)||h)).replace(/\s*[\u2014(].*$/,''); }catch(_){ return h; } };
      var name=(av&&av.name)||'this place', cur;
       
      var lw=(function(){ try{ var d=(AGN.day&&AGN.day.get)?(Number(AGN.day.get())||0):0, b=(AGN.day&&AGN.day.basis)?AGN.day.basis():'peak'; return d>0?('on day +'+d+' (that day\u2019s peak)'):(b==='current'?'at the present hour':'at today\u2019s peak'); }catch(_){ return 'at today\u2019s peak'; } })();
      if(t.i==null) cur=null;
      else if(t.i===0) cur='No hazard is above Normal for '+name+' '+lw+': '+(L.length===1?'the one scored event hazard is Normal.':'all '+L.length+' scored event hazards are Normal.');
      else if(t.holders.length===1) cur=lab(t.holders[0].label)+' is at '+t.word+' for '+name+' '+lw+' (index '+Math.round(t.holders[0].score)+'/100), the highest level among the '+L.length+' scored event hazards.';
      else cur=list(t.holders.map(function(h){ return lab(h.label); }))+' are at '+t.word+' for '+name+', the highest level here; no index comparison separates them.';
      var dn2=D.getElementById('agnDistrictRollupNote'); if(dn2) dn2.innerHTML=dn2.innerHTML.replace('Partial coverage cannot escalate to Act.','A district with partial coverage is never raised to Severe.');
      D.querySelectorAll('.view[data-view="operations"] span').forEach(function(sp){ if(/^Rows are ordered by how many/.test(sp.textContent)) sp.innerHTML=sp.innerHTML.replace(/Rows are ordered by how many <b>event<\/b> hazards \(hours–days\) each unit holds at Act, then at Watch or above,/,'Rows are ordered by how many <b>event</b> hazards (hours–days) each unit has at its response trigger (act now, then prepare),'); });
      if(cur){ D.querySelectorAll('#opsxDecisionChain .opsx-chain-row').forEach(function(r){ var sp=r.querySelector('span'), b=r.querySelector('b');
          if(sp&&b&&/^Current condition$/i.test(sp.textContent.trim())) b.textContent=cur; }); }
      D.querySelectorAll('#opsxEventStream .opsx-stream-item').forEach(function(it){ var tm=it.querySelector('.opsx-stream-time'); if(!tm||!/^Priority$/.test(tm.textContent.trim())) return;
        var b=it.querySelector('.opsx-stream-copy b'), p=it.querySelector('.opsx-stream-copy p');
        if(b&&t.i!=null) b.textContent=name+' \u00b7 highest level '+t.word+(t.i>0?' ('+list(t.holders.map(function(h){ return lab(h.label); }))+')':'');
         
        if(p&&!p.hidden) p.hidden=true; });
      D.querySelectorAll('#opsxEventStream .opsx-stream-copy p, #opsxEventStream .opsx-stream-copy b').forEach(function(e){
        if(/at Watch or above/.test(e.textContent)) e.textContent=e.textContent.replace(/with an event lane at Watch or above/g,'with an event hazard at its response trigger').replace(/at Watch or above/g,'at its response trigger'); });
      

      if(t.i===0||t.i===1){ var imp=t.i===0?'No hazard-specific action: every scored event hazard is Normal. Keep the routine checks for the season.'
          :('No action is triggered: the highest level here is Low ('+list(t.holders.map(function(h){ return lab(h.label); }))+'). Keep the routine checks; actions start when a hazard reaches its response trigger.');
        D.querySelectorAll('#opsxDecisionChain .opsx-chain-row').forEach(function(r){ var sp=r.querySelector('span'), b=r.querySelector('b');
          if(sp&&b&&/^Decision implication$/i.test(sp.textContent.trim())&&b.textContent!==imp) b.textContent=imp; }); }
    }catch(_){}
  };
   
  D.addEventListener('agn:assessment', function(e){
    try{ var a=e.detail, el=D.getElementById('opsxAsmtContext'); if(!a||!el) return;
      var hz=(a.hazards||[]).filter(function(h){ return h && (h.score!=null||h.engineLevel!=null) && h.key!=='seismic' && h.key!=='cyclone'; });
      /* v91.17.270: the engine's levels (no page score) */
      var t=(function(){ var b=null, H=[]; hz.forEach(function(h){ var i=h.engineLevel!=null?h.engineLevel:index(h.score); if(i==null) return; if(b==null||i>b){ b=i; H=[h]; } else if(i===b) H.push(h); }); return {i:b, word:b==null?'No data':W[b], holders:H}; })();
      var lead=(t.i==null)?'no scored hazard':(t.i===0?'none above Normal':(list(t.holders.map(function(h){ return h.label; }))+' '+t.word));
      var vis=false; try{ vis=!!(G.AGN_ISSUANCE&&G.AGN_ISSUANCE.indexVisible&&G.AGN_ISSUANCE.indexVisible()); }catch(_){}
      

      var _act=null; try{ _act=(G.AGN.project&&G.AGN.project.activeAsset)?G.AGN.project.activeAsset():null; }catch(_){}
      var _who=_act?(_act.name||_act.asset_id):('no asset loaded (sector view: '+(a.assetLabel||a.asset||'general')+')');
      var _av=null; try{ _av=(G.AGN.ops&&G.AGN.ops.activeVerdict)?G.AGN.ops.activeVerdict():null; }catch(_){}
      var _unres=!_av||_av.unitLevel==='unresolved'||_av.verdict==='No Data';
      el.innerHTML='<div style="font-size:0.75rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5d7684;margin-bottom:3px">Operating against assessment</div>'
        +'<div style="font-size:0.75rem;color:#222"><b>'+esc(a.locationName||a.location||'\u2014')+'</b> &middot; '+esc(_who)
        +' &middot; '+(_unres?'point screen ':'highest level ')+'<b>'+esc(lead)+'</b>'+(_unres?' <span style="color:#5d7684">(the district verdict is not resolved; this is the assessment at the point)</span>':'')+(vis&&a.priority!=null?' &middot; priority '+esc(a.priority):'')
        +(a.horizon?' &middot; '+esc(a.horizon):'')+'</div>';
    }catch(_){}
  });

   

  

  function stepEvidence(){
    var R={}, ok={};
    try{ R=(AGN.executiveReadiness&&AGN.executiveReadiness())||{}; }catch(_){ R={}; }
    var c={}; try{ c=(AGN.context&&AGN.context.read)?AGN.context.read():{}; }catch(_){}
    var asset=null; try{ asset=(AGN.project&&AGN.project.activeAsset)?AGN.project.activeAsset():null; }catch(_){}
    var acts=0; try{ acts=(AGN.ops&&AGN.ops.actions)?AGN.ops.actions().length:0; }catch(_){}
    ok.overview=!!(c.location); ok.livedata=!!R.horizon; ok.operations=acts>0; ok.assessments=!!asset;
    ok.hybridlab=!!R.scenario; ok.airisk=!!R.ai; ok.report=!!R.issuable;
    return ok;
  }
  function paintTicks(){
    var ok=stepEvidence();
    D.querySelectorAll('#machNav [data-goto]').forEach(function(b){ var k=b.getAttribute('data-goto'); b.classList.toggle('agn-ev-done', !!ok[k]); });
  }

  


  

  var SL={at:null,rows:null,busy:false,t0:Date.now()};
  var SL_LAYERS=['heat','flood','rain_hz','wind','cold','landslide'];
  var SL_NAME={heat:'Heat stress',flood:'Flood',rain_hz:'Heavy rain',wind:'Wind and gusts',cold:'Cold stress (UTCI)',landslide:'Landslide'};
  function slCoverage(){ try{ var ds=G.machDataState; if(ds&&ds.total) return (ds.liveCount||0)/ds.total; }catch(_){} return 0; }
  function slPkt(iso){ try{ var d=new Date(Date.parse(iso)+5*3600e3); return d.toISOString().slice(0,16).replace('T',' ')+' PKT'; }catch(_){ return String(iso||''); } }
  function slFetch(){ if(SL.busy) return Promise.resolve(SL.rows); SL.busy=true;
    return Promise.all(SL_LAYERS.map(function(l){ return fetch(G.location.origin+'/api/levels?layer='+l+'&day=0',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }); }))
      .then(function(js){ SL.busy=false; var by={}, at=null;
        js.forEach(function(j,ix){ if(!j||!j.ready||j.stale||!j.levels) return; at=at||j.at; var lay=SL_LAYERS[ix];
          Object.keys(j.levels).forEach(function(k){ var lv=j.levels[k]; if(lv==null||lv<0) return; var sc=j.scores?j.scores[k]:null; var p=k.split('|'), dn=p[1]||k, prov=p[0]||'';
            if(prov==='IIOJK') return;
            var cur=by[dn]; if(!cur||lv>cur.lv||(lv===cur.lv&&sc!=null&&(cur.sc==null||sc>cur.sc))) by[dn]={district:dn, prov:prov, tehsil:p[2]||k, lv:lv, sc:(sc==null?null:sc), layer:lay}; }); });
        SL.at=at; SL.rows=Object.keys(by).map(function(k){ return by[k]; }).sort(function(a,b){ return (b.lv-a.lv)||((b.sc||0)-(a.sc||0)); }); return SL.rows; },
        function(){ SL.busy=false; return null; }); }
  function slWords(){ try{ return (G.AGN.level&&G.AGN.level.words)||W; }catch(_){ return W; } }
  function slHydrate(force){
    if(!force && (Date.now()-SL.t0<60000 || slCoverage()>=0.95)) return Promise.resolve(false);
    return slFetch().then(function(rows){ if(!rows||!rows.length) return false; var Wd=slWords(), lab='server levels as of '+slPkt(SL.at);
       
      var tb=D.getElementById('opsxPriorityRows');
      if(tb && (force || !tb.querySelector('tr:not([data-agn-server-levels])') || !tb.textContent.trim())){
        tb.innerHTML=rows.slice(0,8).map(function(r){ return '<tr data-agn-server-levels="1"><td><b>'+esc(r.district)+'</b><div style="font-size:.7rem;color:#5d7684">driving tehsil: '+esc(r.tehsil)+'</div></td><td>'+esc(r.prov)+'</td><td>'+esc(SL_NAME[r.layer]||r.layer)+'</td><td>'+(r.sc==null?'—':esc(r.sc))+'</td><td>—</td><td>'+esc(Wd[r.lv]||'')+'</td><td>'+esc(lab)+'</td><td>—</td></tr>'; }).join('');
        var cv=D.getElementById('opsxBoardCoverage'); if(cv) cv.innerHTML='<b>'+esc(lab)+'.</b> The browser\u2019s own district sweep covered '+Math.round(100*slCoverage())+' % of units, so the board shows the levels the server engine computed for every tehsil, rolled up to districts by their worst tehsil. They are replaced when the browser\u2019s sweep completes.'; }
       
      return true; }); }
  G.AGN=G.AGN||{}; G.AGN.serverLevels={ hydrate:function(){ return slHydrate(true); }, last:function(){ return {at:SL.at, rows:SL.rows}; } };
  setInterval(function(){ try{ slHydrate(false); }catch(_){} }, 60000);
  setTimeout(function(){ try{ slHydrate(false); }catch(_){} }, 61000);

   
  function install(){
    wrap('drawImpact', function(r,s){ fixImpact(s); });
    wrap('updateOpsBrief', function(r,s,c){ fixOpsBrief(r,s,c); });
    fixCompare(); fixBrief(); watchUhi();
    var L=D.getElementById('mpLeftIn'); if(L && !L.__agnL){ L.__agnL=1; try{ new MutationObserver(function(){ fixLeftCard(); }).observe(L,{childList:true}); }catch(_){} }
    try{ var s=activeSt(); if(s) uhiFor(s); }catch(_){}
  }
  function ages(){ D.querySelectorAll('.agn-age[data-ts]').forEach(function(e){ var t=ageText(Number(e.getAttribute('data-ts'))); if(e.textContent!==t) e.textContent=t; }); }
  function tick(){ try{ install(); ages(); fixImpact(); applyUhi(); paintTicks(); fixLeftCard(); }catch(_){} }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded', install); else install();
  D.addEventListener('click', function(e){ try{ if(e.target&&e.target.closest&&e.target.closest('#machNav [data-goto]')) setTimeout(tick,300); }catch(_){} }, true);
  setInterval(tick, 5000);
  setTimeout(tick, 1500);
})(window);
