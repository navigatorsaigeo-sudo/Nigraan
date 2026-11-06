


(function(G){'use strict';
  var D=G.document, AGN=G.AGN=G.AGN||{};
  var W0=['Normal','Low','Moderate','High','Severe'];
  var words=function(){ return (AGN.hz5&&AGN.hz5.words)||W0; };
  var esc=function(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var $=function(id){ return D.getElementById(id); };
  var set=function(id,t){ var e=$(id); if(e) e.textContent=t; return e; };
  var LABEL={flood:'Flood',flood_pluvial:'Flood (rain)',flood_riverine:'River flood',heat:'Heat stress',cold:'Cold stress (UTCI)',wind:'Wind and gusts',drought:'Drought',glof:'Glacial lake outburst flood (GLOF)',rain_hz:'Heavy rain',landslide:'Landslide',seismic:'Earthquake',cyclone:'Cyclone',telco_wind:'Wind',telco_flood:'Flood',telco_heat:'Heat',telco_lightning:'Thunderstorm',ops:'Operations'};
   
  var LEADFUL={flood:1,rain_hz:1,heat:1,wind:1,cold:1,telco_wind:1,telco_flood:1,telco_heat:1,telco_lightning:1,flood_pluvial:1,flood_riverine:1,landslide:1};
  var fmtT=function(t){ var s=String(t||''); var m=s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/); if(!m) return s;
    var mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m[2])-1]; return Number(m[3])+' '+mo+' '+m[4]+':'+m[5]; };

   
  function engineWord(hz,r,cat){
    if(hz==='glof') return 'engine level '+cat;
    var l=String(r.categoryLabel||cat); return l.split(' · ')[0];
  }
  function level(hz,r){
    if(!r) return {nd:true, word:'No reading'};
    if(r.notApplicable===true || r.noDataClass==='ineligible') return {na:true, word:'Cannot occur here', why:r.notApplicableWhy||r.noDataWhy||null};
    if(r.noDataClass==='undefined') return {na:true, word:'Index not defined here', why:r.noDataWhy||null};
    var W=words(), i=null, cat=null;
    if(r.categorical===true){ cat=(r.category!=null?r.category:r.screeningBand); if(cat!=null&&AGN.hz5&&AGN.hz5.catLevel) i=AGN.hz5.catLevel(cat); }
    var sc=(r.screeningIndex!=null?r.screeningIndex:r.score);
    if(i==null && r.categorical!==true && sc!=null && typeof G.agnBandOf==='function'){ var b=G.agnBandOf(sc); i=b?b.index:null; }
    if(i==null) return {nd:true, word:r.notAssessed?'Not assessed':'No reading', why:r.noDataWhy||null};
    return {i:i, word:W[i], engine:(cat!=null&&!r.served?engineWord(hz,r,cat):null), cat:cat, score:(r.categorical===true?null:sc)};
  }

   
  var glofLive=null, glofLiveAsked=false;
  function glofReadsDate(){
    if(glofLive&&glofLive.date) return glofLive.date;
    if(!glofLiveAsked){ glofLiveAsked=true;
      try{ fetch(location.origin+'/api/glof/live',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
        if(j&&j.ok){ var w=j.window||[]; glofLive={date:String(w[1]||j.built||'').slice(0,10)}; try{ if(G.aiState&&G.aiState.hazard==='glof'&&typeof G.aiRender==='function') G.aiRender(); }catch(_){} } }).catch(function(){}); }catch(_){}
    }
    try{ return G.__agnGlofNat&&G.__agnGlofNat.builtAt?String(G.__agnGlofNat.builtAt).slice(0,10):null; }catch(_){ return null; }
  }
  var dateWords=function(d){ var m=String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return d||''; return Number(m[3])+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m[2])-1]+' '+m[1]; };
  function lakeName(n){
    n=String(n||'').trim(); var m=n.match(/^unnamed lake\s+\S+\s+near\s+(.+)$/i); if(m) return 'an unnamed lake near '+m[1];
    if(/^unnamed lake\b/i.test(n)) return 'an unnamed lake';
    return /glacier$/i.test(n)?n+' lake':n;
  }
  function glofPlain(N,place){
    var b=String((N&&N.basis)||''), out={};
    var m1=b.match(/worst:\s*(\d+)\s+lakes?\s+upstream/i); out.n=m1?Number(m1[1]):null;
    var m2=b.match(/·\s*(.+?)\s*\(([A-Za-z]+),\s*([\d.]+)\s*km upstream\)/); if(m2){ out.nearest=lakeName(m2[1]); out.tier=m2[2].toLowerCase(); out.km=Number(m2[3]); }
    var bits=[];
    if(out.n!=null) bits.push(out.n+' glacial lake'+(out.n===1?' drains':'s drain')+' towards '+place);
    if(out.nearest) bits.push('nearest: '+out.nearest+' ('+out.tier+'), '+(out.km<1?'0':Math.round(out.km))+' km upstream');
    out.text=bits.join('; ');
    return out;
  }
  var GLOF_MEANS={Low:'glacial lakes drain here, but together they carry little outburst susceptibility',
    Monitor:'susceptible glacial lakes drain here within reach; no growth or outburst signal has been seen at them',
    Watch:'a warning sign at a lake within reach: growth in our satellite reads or an outburst in recent years',
    Act:'an observed signal at a lake within reach: a measured drainage or a confirmed event report in the last two weeks'};
  var GLOF_DO={Low:'Routine watch on the lakes upstream is enough.',Monitor:'Keep the lakes upstream on routine watch.',
    Watch:'Check the lake reports upstream and brief teams in the valley below.',Act:'Treat the valley below the lake as exposed and follow the national authority’s instructions.'};

  function techDetail(html){
    var box=D.querySelector('#aiPredSection .ai-brief'); if(!box) return;
    var el=$('p75Tech');
    if(!html){ if(el) el.remove(); return; }
    if(!el){ el=D.createElement('details'); el.id='p75Tech'; el.className='p75-tech'; box.appendChild(el); }
    var open=el.open; el.innerHTML='<summary>Technical detail</summary>'+html; el.open=open;
  }
   
  function windowWeather(s,lead){
    try{
      var e=G.LIVE_HOURLY&&G.LIVE_HOURLY[s.id]; if(!e||!Array.isArray(e.time)||e.nowIdx==null) return null;
      var a=e.nowIdx, b=Math.min(e.time.length-1, e.nowIdx+Math.round(lead)); if(b<=a) return null;
      var rain=0, n=0, tmax=null; for(var k=a+1;k<=b;k++){ if(e.rain&&e.rain[k]!=null){ rain+=Number(e.rain[k]); n++; } if(e.temp&&e.temp[k]!=null) tmax=(tmax==null?e.temp[k]:Math.max(tmax,e.temp[k])); }
      return {to:e.time[b], rain:n?Math.round(rain*10)/10:null, tmax:tmax==null?null:Math.round(tmax*10)/10, tEnd:(e.temp&&e.temp[b]!=null)?e.temp[b]:null};
    }catch(_){ return null; }
  }

   
  function post(){
    var st=G.aiState; if(!st||!st.last) return;
    var x=st.last, r=x.r||{}, s=x.s||{}, hz=st.hazard, lead=st.lead, L=level(hz,r);
    st.lastLevel=L; st.lastLevelHazard=hz;
     
    [].forEach.call(D.querySelectorAll('#aiLeadSeg button'),function(b){ b.setAttribute('aria-disabled','false'); if(/Lead-specific backend/.test(b.title||'')) b.removeAttribute('title'); });
    var ww=windowWeather(s,lead);
    set('aiLeadLabel', lead+'h');
    var lab=D.querySelector('#aiLeadLabel'); if(lab){ var sm=D.createElement('small'); sm.className='p75-eng'; sm.textContent=(r.validTime?'to '+fmtT(r.validTime):(ww?'to '+fmtT(ww.to):'')); if(sm.textContent) lab.appendChild(sm); }
    var ringB=$('aiRiskScore'), band=$('aiBand'), note=$('aiBandNote'), prob=$('aiProb');
    var probLab=prob&&prob.parentNode&&prob.parentNode.querySelector('span'); if(probLab&&/Risk index/i.test(probLab.textContent)) probLab.textContent='Risk level';
    var ring=$('aiRing');
    var leadLine='';
    if(ww){
      var wx=[]; if(ww.rain!=null) wx.push((ww.rain===0?'no rain':ww.rain+' mm rain')); if(ww.tmax!=null) wx.push('up to '+ww.tmax+' °C');
      leadLine=(LEADFUL[hz]?'Window: next '+lead+' h, to '+fmtT(ww.to)+(wx.length?' · forecast '+wx.join(', '):'')
                          :'Next '+lead+' h, to '+fmtT(ww.to)+(wx.length?': forecast '+wx.join(', '):'')+'. The '+(LABEL[hz]||hz)+' level is a standing level and holds over this window.');
    }
    if(L.na){
      if(ringB){ ringB.textContent='—'; ringB.classList.remove('p75-word'); }
      if(band) band.textContent=L.word;
      if(note){ note.textContent=(L.why||'This hazard has no mechanism at this place.'); }
      if(prob) prob.innerHTML=esc(L.word);
    } else if(L.nd){
      if(note&&/Not scored/.test(note.textContent)) note.textContent='No reading: '+(L.why||'the engine returned no value for this input');
    } else {
      if(ringB){ if(L.score==null){ ringB.textContent=L.word; ringB.classList.add('p75-word'); } else { ringB.textContent=L.score; ringB.classList.remove('p75-word'); } }
      if(ring&&L.score==null) ring.style.setProperty('--ai-ang',Math.round(((L.i+1)/5)*360)+'deg');
      if(band){ band.textContent=L.word; if(L.engine){ var e=D.createElement('small'); e.className='p75-eng'; e.textContent=L.engine; band.appendChild(e); } }
      if(prob) prob.innerHTML=esc(L.word)+'<small class="p75-eng">'+esc(L.score==null?(L.engine||''):('index '+L.score+'/100'+(r.forecastBasis==='forecast_day_peak'?' \u00b7 '+((G.AGN&&G.AGN.p76&&G.AGN.p76.peakLabel)?G.AGN.p76.peakLabel(r,lead):'the day\u2019s peak'):r.forecastBasis==='forecast_hour'?' \u00b7 the hour at +'+lead+' h':'')))+'</small>';
      if(note&&(L.score==null||/Not scored/.test(note.textContent))) note.textContent=(hz==='glof'&&L.cat&&GLOF_MEANS[L.cat])?(GLOF_MEANS[L.cat].charAt(0).toUpperCase()+GLOF_MEANS[L.cat].slice(1)+'.'):('Level '+L.word+(L.engine?' ('+L.engine+')':'')+'.');
    }
    if(note&&leadLine){ var ll=D.createElement('span'); ll.className='p75-lead'; ll.textContent=leadLine; note.appendChild(ll); }
     
    var sum=$('aiSummary');
    if(sum){
      if(L.score==null&&!L.nd){
        sum.textContent=((typeof AI_HAZARDS!=='undefined'&&AI_HAZARDS[hz])?String(AI_HAZARDS[hz].label).replace(/\s*[(—].*$/,''):(LABEL[hz]||hz))+' for '+s.name+', next '+lead+' h: '
          +(L.na?L.word.toLowerCase()+'.':'level '+L.word+(L.engine?' ('+L.engine+')':'')+'. A standing level, the same at every lead; not a 0–100 score and not a probability.')
          +(ww?' Window to '+fmtT(ww.to)+'.':'');
      } else if(L.nd){ sum.textContent=sum.textContent.replace(/,?\s*risk signal null out of 100 \(uncalibrated screening signal\)\./,': no reading'+(L.why?' ('+L.why+')':'')+'.');
      } else if(L.score!=null){ sum.textContent=sum.textContent.replace(/risk signal (\d+) out of 100/,'risk signal $1 out of 100, level '+L.word); }
    }
    var top=$('aiTopDriver'); if(top&&/^GLOF level:/i.test(top.textContent)&&!L.nd&&!L.na) top.textContent='GLOF '+L.word+' ('+(L.cat||'')+')';
     
    if(hz==='glof'&&r.categorical===true&&!L.na&&!L.nd){
      var N=null; try{ var nm=(typeof G.aiStationDistrict==='function')?G.aiStationDistrict(s):s.name; N=G.__agnGlofNat&&G.__agnGlofNat.units?G.__agnGlofNat.units[nm]:null; }catch(_){ N=null; }
      var P=glofPlain(N,s.name), dr=r.drivers||[];
      var pri=(N&&N.priority!=null)?N.priority:dr[1], wat=(N&&N.watch!=null)?N.watch:dr[2], grow=(N&&N.expanding!=null)?N.expanding:dr[3];
      var named=((N&&N.named)||[]).slice(0,4).map(lakeName);
      var rd=glofReadsDate();
      set('aiM1Label','GLOF level'); set('aiM1',L.word); set('aiM1Note',(L.engine?L.engine+(P.text?' · ':''):'')+(P.text||''));
      set('aiM2Label','Priority lakes upstream'); set('aiM2',pri==null?'—':pri); set('aiM2Note',named.length?('named: '+named.join(', ')):'none named');
      set('aiM3Label','Elevated lakes upstream'); set('aiM3',wat==null?'—':wat); set('aiM3Note',wat?'lakes with raised outburst susceptibility within reach':'none within reach');
      set('aiM4Label','Lakes growing in our Sentinel-2 reads'); set('aiM4',grow==null?'—':grow);
      set('aiM4Note',grow?(grow+' growing in the latest reads'+(rd?' ('+dateWords(rd)+')':'')):('None growing in the latest reads'+(rd?' ('+dateWords(rd)+')':'')));
      set('aiBriefText','For '+s.name+': GLOF level '+L.word+' (engine level '+L.cat+'). '+(GLOF_MEANS[L.cat]?GLOF_MEANS[L.cat].charAt(0).toUpperCase()+GLOF_MEANS[L.cat].slice(1)+'. ':'')+(P.text?P.text.charAt(0).toUpperCase()+P.text.slice(1)+'. ':'')+(GLOF_DO[L.cat]||''));
      techDetail('<p>'+esc(r.note||r.basis||(N&&N.basis)||'')+'</p>'+(r.evidence?'<p>'+esc(r.evidence)+'</p>':'')+(r.kind?'<p>'+esc(r.kind)+'</p>':''));
       
      var drv=$('aiDrivers'); if(drv) drv.innerHTML=[['GLOF level',L.word,(L.i+1)*20],['High-susceptibility lakes upstream',pri,0],['Moderate-susceptibility lakes upstream',wat,0],['Lakes growing (Sentinel-2)',grow,0]].map(function(q){ return '<div class="ai-driver"><span>'+esc(q[0])+'</span><span class="track"><i style="width:'+q[2]+'%"></i></span><b>'+esc(q[1]==null?'—':q[1])+'</b></div>'; }).join('');
    } else techDetail(null);
     
    var sc=$('aiScenarios');
    if(sc&&!L.nd&&(L.score==null)&&/Not scored/.test(sc.textContent)){
      sc.innerHTML='<div class="ai-scenario"><span>Level at the selected lead</span><b>'+esc(L.word)+'</b><em>'+esc(L.na?(L.why||''):((L.engine?L.engine+'; ':'')+'a standing level, the same at every lead'))+'</em></div>';
    }
    var cn=$('aiChartNote'); if(cn&&!LEADFUL[hz]) cn.textContent='A standing level: the same at every lead. Selected window '+lead+' h'+(ww?', to '+fmtT(ww.to):'')+'.';
  }
  /* v91.17.283.20 · B7: the predictions are a step of the one aiRender (no wrapper) */
  function wrapRender(){ if(G.AGN&&G.AGN.aiP75) return true; G.AGN=G.AGN||{}; G.AGN.aiP75={ post:post, sync:sync }; try{ post(); sync(); }catch(_){} return true; }
  

  D.addEventListener('click',function(e){ var b=e.target&&e.target.closest&&e.target.closest('#aiLeadSeg button'); if(b) b.setAttribute('aria-disabled','false'); },true);
  G.addEventListener('click',function(e){ var b=e.target&&e.target.closest&&e.target.closest('#aiLeadSeg button'); if(b) b.setAttribute('aria-disabled','false'); },true);

   
  function ctx(){
    var st=G.aiState, L=st&&st.lastLevel, hz=st&&st.lastLevelHazard; if(!L||!hz) return {text:'—', index:null};
    return {text:(LABEL[hz]||hz)+': '+L.word+((hz==='glof'&&L.cat)?' ('+L.cat+')':(L.engine?' ('+L.engine+')':'')), index:(L.score!=null?L.score:null)};
  }
  function sync(){
    var c=ctx(); var el=$('llmContextRisk'); if(el&&c.text&&c.text!=='—') el.textContent=c.text;
  }

   
  var QH=[['heat','Heat stress'],['flood','Flood'],['rain_hz','Heavy rain'],['drought','Drought'],['wind','Wind and gusts'],['cold','Cold stress (UTCI)'],['glof','Glacial lake outburst flood (GLOF)']];
  function quantLine(key){
    var DI=G.DISTRICT_IN||((typeof DISTRICT_IN!=='undefined')?DISTRICT_IN:{}); var row=DI[key]; if(!row||typeof G.aiDistrictRisk!=='function') return null;
    var got=[], nd=[];
    QH.forEach(function(h){ var r=null; try{ r=G.aiDistrictRisk(row,h[0],24,key); }catch(_){ r=null; }   /* W1: the issued level in a browser */ var L=level(h[0],r); if(L.na) return; if(L.nd){ nd.push(h[1]); return; } got.push({n:h[1],i:L.i,w:L.word}); });
    if(!got.length) return key+', next 24 h: no hazard reading yet';
    var tally={}; got.forEach(function(g){ tally[g.w]=(tally[g.w]||0)+1; });
    var common=Object.keys(tally).sort(function(a,b){ return tally[b]-tally[a]; })[0];
    var odd=got.filter(function(g){ return g.w!==common; }).sort(function(a,b){ return b.i-a.i; });
    var txt=key+', next 24 h: '+(odd.length?odd.map(function(g){ return g.n+' '+g.w; }).join(', ')+', others '+common:'all hazards '+common);
    if(nd.length) txt+=' (no reading: '+nd.join(', ')+')';
    return txt;
  }

   
  function national(need){
    var layers=(need&&need.layers)||[], prov=(need&&need.scope&&need.scope.province)||null, lead=(need&&need.lead)||24, W=words();
    var nDays=(need&&Number.isInteger(need.days)&&need.days>1)?Math.min(need.days,16):0;
    var feats=[]; try{ feats=(G.PK_DISTRICTS&&G.PK_DISTRICTS.features)||(typeof PK_DISTRICTS!=='undefined'&&PK_DISTRICTS.features)||[]; }catch(_){ feats=[]; }
    var IJ=null; try{ IJ=(typeof IIOJK!=='undefined')?IIOJK:null; }catch(_){}
    var dayInp=(typeof G.hzDayInput==='function')?G.hzDayInput:(typeof hzDayInput==='function'?hzDayInput:null);
    var risk=(typeof G.aiDistrictRisk==='function')?G.aiDistrictRisk:(typeof aiDistrictRisk==='function'?aiDistrictRisk:null);
     
    var pk=new Date(Date.now()+5*3600e3), MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var out={lead:lead, day:pk.getUTCDate()+' '+MO[pk.getUTCMonth()]+' '+pk.toISOString().slice(11,16)+' PKT', hazards:{}};
    var eng=!!(G.agnEngineHost&&G.agnEngineHost());   /* W1: a browser reads the issued level (aiDistrictRisk), whatever inputs it holds */
    if((eng&&!dayInp)||!risk||!feats.length) return out;
    function sweep(hz){
      var c={}; W.forEach(function(w){ c[w]=0; }); var na=0, nd=0, rows=[];
      feats.forEach(function(f){ var p=f&&f.properties||{}; if(!p.key) return; if(IJ!=null&&p.province===IJ) return; if(prov&&p.province!==prov) return;
        if(p.dq===true){ nd++; return; }
        var mk=null; if(eng){ try{ mk=(typeof G.__agnHzMaskWhy==='function')?G.__agnHzMaskWhy(p.key,hz):null; }catch(_){ mk=null; } }
        if(mk){ na++; return; }
        var inp=null; if(eng){ try{ inp=dayInp(p.key,hz); }catch(_){ inp=null; }
        if(!inp||inp.__unavailable){ nd++; return; } }
        var r=null; try{ r=risk(inp,hz,lead,p.key); }catch(_){ r=null; }
        var L=level(hz,r); if(L.na){ na++; return; } if(L.nd){ nd++; return; }
        c[L.word]++; rows.push({tehsil:p.tehsil||p.key, key:p.key, district:p.district||null, level:L.word, i:L.i, s:(L.score!=null?L.score:((r&&r.mapValue)||0)), engine:L.engine||null});
      });
      return {counts:c, na:na, nd:nd, rows:rows};
    }
    var top=function(rows){ return rows.filter(function(q){ return q.i>=1; }).sort(function(a,b){ return b.i-a.i||b.s-a.s; }).slice(0,10); };
    layers.forEach(function(hz){
      var S=sweep(hz);
      out.hazards[hz]={counts:S.counts, cannotOccur:S.na, noData:S.nd, worst:top(S.rows).map(function(q){ return {tehsil:q.tehsil,district:q.district,level:q.level,engine:q.engine}; })};
    });
     
    if(nDays){
      var A=AGN.day, g0=A&&A.get, b0=A&&A.basis; var wk={window:{from:null,to:null,days:0,missing:[]}, hazards:{}};
      var dateOf=function(d){ return new Date(Date.now()+5*3600e3+d*864e5).toISOString().slice(0,10); };
      try{
        layers.forEach(function(hz){
          var best={}, na=0, units=0, seenDay=[];
          for(var d=0; d<nDays; d++){
            if(A&&typeof g0==='function'){ A.get=function(){ return d; }; if(typeof b0==='function') A.basis=function(){ return 'peak'; }; }
            var S=sweep(hz); var tot=S.rows.length+S.na+S.nd; units=Math.max(units,tot);
            if(S.rows.length < 0.5*Math.max(1,tot-S.na)){ if(wk.window.missing.indexOf(dateOf(d))<0) wk.window.missing.push(dateOf(d)); continue; }
            seenDay.push(d); if(d===0||!na) na=S.na;
            S.rows.forEach(function(q){ var b=best[q.key]; if(!b||q.i>b.i||(q.i===b.i&&q.s>b.s)) best[q.key]=Object.assign({peakDay:dateOf(d)},q); });
          }
          var rows=Object.keys(best).map(function(k){ return best[k]; }); var c={}; W.forEach(function(w){ c[w]=0; }); rows.forEach(function(q){ c[q.level]++; });
          wk.hazards[hz]={counts:c, cannotOccur:na, noData:Math.max(0,units-na-rows.length), worst:top(rows).map(function(q){ return {tehsil:q.tehsil,district:q.district,level:q.level,peakDay:q.peakDay,engine:q.engine}; })};
          if(seenDay.length){ var f0=dateOf(seenDay[0]), f1=dateOf(seenDay[seenDay.length-1]); if(!wk.window.from||f0<wk.window.from) wk.window.from=f0; if(!wk.window.to||f1>wk.window.to) wk.window.to=f1; wk.window.days=Math.max(wk.window.days, seenDay.length); }
        });
      } finally { if(A&&typeof g0==='function'){ A.get=g0; if(typeof b0==='function') A.basis=b0; } }
      wk.window.missing=wk.window.missing.filter(function(x){ return !(wk.window.from&&x>=wk.window.from&&x<=wk.window.to); });
      out.week=wk;
    }
    return out;
  }

   
  

  var seen=Object.create(null), seenN=0;
  var pkey=function(a,o){ return Number(a).toFixed(3)+','+Number(o).toFixed(3); };
  function record(u,j){
    var q=null; try{ q=new URL(u, location.origin).searchParams; }catch(_){ return; }
    var la=String(q.get('latitude')||'').split(','), lo=String(q.get('longitude')||'').split(',');
    var arr=Array.isArray(j)?j:[j];
    arr.forEach(function(l,i){ if(!l||!l.agn_temperature_basis||!l.hourly||la[i]==null||lo[i]==null) return;
      var k=pkey(la[i],lo[i]); if(!(k in seen)) seenN++; seen[k]={lat:+la[i], lon:+lo[i], basis:l.agn_temperature_basis, at:Date.now()}; });
    if(seenN>3000){ seen=Object.create(null); seenN=0; }
    ccLine();
  }
  function wrapFetch(){
    var A=AGN.api; if(!A||typeof A.fetch!=='function') return false; if(A.fetch.__p75) return true;
    var F=A.fetch;
    var w=function(input){ var p=F.apply(this,arguments);
      try{ var u=String((input&&input.url)||input||''); if(/\/v1\/forecast\?/.test(u)&&/[?&]hourly=/.test(u)&&p&&p.then){ p.then(function(r){ try{ if(r&&r.clone) r.clone().json().then(function(j){ record(u,j); }).catch(function(){}); }catch(_){} }).catch(function(){}); } }catch(_){}
      return p; };
    w.__p75=true; A.fetch=w; return true;
  }
  
  function ccLine(){
     
    try{ var _o=$('ccAiLocal'); if(_o) _o.remove(); if(AGN.p76&&AGN.p76.cardBadge) AGN.p76.cardBadge(); }catch(_){}
  }


  

  function bandKey(){ try{ var C=(typeof AGN_BAND_CUTS!=='undefined')?AGN_BAND_CUTS:null; if(!C) return null; var r=C.slice().reverse();
    return r.map(function(c,i){ return c.min+'\u2013'+(i<r.length-1?r[i+1].min:100)+' '+(c.label||c.key); }).join(' \u00b7 '); }catch(_){ return null; } }
  function fixTips(){
    var k=bandKey(); if(!k) return;
    try{ if(typeof TIP!=='undefined') ['lens','tophaz','nexthaz'].forEach(function(n){ if(TIP[n]&&TIP[n].band) TIP[n].band=k; }); }catch(_){}
    [].forEach.call(D.querySelectorAll('.ip-band'),function(e){ if(/minimal/i.test(e.textContent)) e.textContent=k; });
  }
  AGN.p75={ level:level, ctx:ctx, quantLine:quantLine, national:national, ccLine:ccLine, served:function(){ return Object.keys(seen).slice(-40).map(function(k){ var r=seen[k]; return {lat:r.lat,lon:r.lon,correction:r.basis.correction||null,aiLocal:r.basis.aiLocal||(r.basis.calibration&&r.basis.calibration.aiLocal)||null}; }); }, version:'v91.17.75' };
  function boot(n){
    var ok=wrapRender(); wrapFetch();   fixTips(); if(n===0){ setTimeout(fixTips,3000); setTimeout(fixTips,10000); }
     
    try{ var wx=$('llmContextWeather'); if(wx&&!wx.__p75){ wx.__p75=true; var fixSky=function(){ var t=wx.textContent||''; if(/\bclear\b/i.test(t)) wx.textContent=t.replace(/\bMainly clear\b/gi,'Mostly cloudless').replace(/\bClear sky\b/gi,'Cloudless sky').replace(/\bclear\b/gi,function(m){ return m[0]==='C'?'Cloudless':'cloudless'; }); };
      fixSky(); new MutationObserver(fixSky).observe(wx,{childList:true,characterData:true,subtree:true}); } }catch(_){}
    try{ var cl=$('ccLoc'); if(cl&&!cl.__p75){ cl.__p75=true; new MutationObserver(function(){ setTimeout(ccLine,50); }).observe(cl,{childList:true,characterData:true,subtree:true}); } }catch(_){}
    if(!ok&&n<60) setTimeout(function(){ boot(n+1); },500);
  }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',function(){ boot(0); }); else boot(0);
  D.addEventListener('agn:location',function(){ setTimeout(ccLine,300); });
})(window);
