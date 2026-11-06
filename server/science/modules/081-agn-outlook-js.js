
(function(){
   
  var O=location.origin, root, state={tab:'unit',unit:null,day:1,nat:null,names:null,chk:null};
  var TH={tx40:'Max ≥40 °C',tx45:'Max ≥45 °C',tn30:'Night ≥30 °C',tn0:'Frost ≤0 °C (below 2,000 m)',sn10:'Snow ≥10 cm',pr10:'Rain ≥10 mm',pr25:'Rain ≥25 mm',pr50:'Rain ≥50 mm',pr100:'Rain ≥100 mm',gu60:'Gusts ≥60 km/h'};
  var THS={tx40:'Max<small>≥40 °C</small>',tx45:'Max<small>≥45 °C</small>',tn30:'Night<small>≥30 °C</small>',tn0:'Frost<small>≤0 °C, &lt;2,000 m</small>',sn10:'Snow<small>≥10 cm</small>',pr25:'Rain<small>≥25 mm</small>',pr50:'Rain<small>≥50 mm</small>',gu60:'Gusts<small>≥60 km/h</small>'};
  function tbl(label){ return '<table aria-label="'+label+'" data-agn-named="1"><caption class="ol-sr">'+label+'</caption>'; }
  var EV_ORDER=['heatSpell','unusualWarmth','coastalHeat','rain3_75','rain3Local','rainOnSnow','heavySnow','frostSpell','coldSpell'];
  var EVS={heatSpell:'Heat spell: hotter than usual for this place and time of year, and hot enough to matter',unusualWarmth:'Unusually warm for this place and time of year, at any temperature (the melt reading applies only where the unit reaches the glacier floor — see the melt layer)',coastalHeat:'Coastal humid heat (within 60 km of the sea): apparent temperature ≥40 °C for 2+ days — screening class, not verified',rain3_75:'Heavy rain: 3-day total ≥75 mm',rain3Local:'Extreme rain for this place: 3-day total ≥ local 1-in-100-days',coldSpell:'Cold spell: colder than usual for this place and time of year, and cold enough to matter',heavySnow:'Heavy snow: 3-day total ≥30 cm',frostSpell:'Frost spell below 2,000 m: 3+ nights ≤0 °C',rainOnSnow:'Rain on snow above 1,500 m: ≥5 mm rain on snow from the past 5 days, max above 2 °C (screening class, not a probability)'};
   
  var HEAT_SUB={localDay:'hot days: 3+ days hotter than usual for the date and past the heat floor (this is the event)',warmNight:'warm nights: 3+ nights warmer than usual for the date and above 20 °C (information)',dayAndNight:'hot days AND warm nights together — no overnight relief',absolute40:'≥ 40 °C for 3+ days inland, usual for the date or not (information)'};
  var TH_ORDER=['tx40','tx45','tn30','pr10','pr25','pr50','pr100','gu60','sn10','tn0'];    
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function get(p){ return fetch(O+p,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }); }
  function dlab(d){ var t=new Date(d+'T12:00:00Z'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.getUTCDay()]+' '+t.getUTCDate(); }
  function ago(iso){ if(!iso) return 'never'; var m=Math.round((Date.now()-Date.parse(iso))/60000); return m<60?(m+' min ago'):(Math.round(m/60)+' h ago'); }
  

  var ENS_FRESH_H=18;
  function todayPk(){ return new Date(Date.now()+5*3600e3).toISOString().slice(0,10); }
  function fromToday(days){ var t=todayPk(); return (days||[]).filter(function(d){ return d&&d.date>=t; }); }
  function pktRun(iso){ var t=Date.parse(iso||''); if(!isFinite(t)) return 'an unrecorded time'; var d=new Date(t+5*3600e3); return d.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]+' '+('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2)+' PKT'; }
  function staleRun(E){ var h=E&&E.at?(Date.now()-Date.parse(E.at))/3600e3:NaN; return (isFinite(h)&&h>ENS_FRESH_H)?(' <b>Run of '+pktRun(E.at)+', '+Math.round(h)+' h old: past the '+ENS_FRESH_H+' h freshness limit, so it is shown with its run date and from today on only.</b>'):''; }
  function dOn(d){ return d<todayPk()?'before today':dlab(d); }
  function cell(p){ if(p==null) return '<td>–</td>'; if(!p) return '<td style="color:#b8c4cc">0</td>'; var a=Math.min(.85,.12+p/115); return '<td style="background:rgba(192,57,43,'+a.toFixed(2)+');color:'+(p>=55?'#fff':'#12303f')+';font-weight:600">'+p+'%</td>'; }
  function mount(){
    if(document.getElementById('agnOutlookBtn')) return;
    var b=document.createElement('button'); b.id='agnOutlookBtn'; b.type='button'; b.textContent='Outlook: 15 days · weeks · season · air'; b.title='Ensemble outlook (51 members) and satellite sunshine check for every tehsil';
    b.onclick=open; document.body.appendChild(b);
    root=document.createElement('div'); root.id='agnOutlook'; root.innerHTML='<div class="ol-card" role="dialog" aria-label="15-day outlook"><div class="ol-head"><h2>Forecast outlook</h2><div class="ol-tabs"><button data-t="unit">Tehsil</button> <button data-t="nat">National</button> <button data-t="sea">Weeks &amp; season</button> <button data-t="air">Air &amp; smog</button> <button data-t="chk">Checks</button> <button data-t="river">Rivers</button> <button data-t="skill">Skill sheet</button></div><button class="ol-x" aria-label="Close">×</button></div><div class="ol-body"></div></div>';
    root.addEventListener('click',function(e){ if(e.target===root||e.target.classList.contains('ol-x')) root.classList.remove('open'); var t=e.target.getAttribute&&e.target.getAttribute('data-t'); if(t){ state.tab=t; if(t==='chk') loadChk(); if(t==='sea') loadSea(); if(t==='air') loadAir(); if(t==='skill') loadSkill(); if(t==='river'){ loadRiver(); loadGauges(); } render(); }
      var d=e.target.getAttribute&&e.target.getAttribute('data-day'); if(d!=null){ state.day=+d; loadNat(); }
      var u=e.target.getAttribute&&e.target.getAttribute('data-unit'); if(u&&state.tab==='air'){ loadAir(u); return; } if(u){ if(state.tab==='sea'){ state.seaUnit=null; loadSea(u); } else { state.tab='unit'; loadUnit(u); } }
      var ad=e.target.getAttribute&&e.target.getAttribute('data-airday'); if(ad!=null){ state.airDay=+ad; loadAirNat(); }
      var rd=e.target.getAttribute&&e.target.getAttribute('data-riverday'); if(rd!=null){ state.riverDay=+rd; loadRiver(); }
      var wk=e.target.getAttribute&&e.target.getAttribute('data-week'); if(wk!=null){ state.week=+wk; loadSeaNat(); }
      var mo=e.target.getAttribute&&e.target.getAttribute('data-month'); if(mo!=null){ state.month=+mo; loadSeaNat(); } });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') root.classList.remove('open'); });
    document.body.appendChild(root);
  }
  function selectedName(){ try{ var c=AGN.context.read(); return String(c.location||'').split(/[\/·,]/)[0].trim(); }catch(_){ return ''; } }
  

  function here(){ try{ var d=AGN.dataServices&&AGN.dataServices.require('domain'); var ap=d&&d.activePoint(); if(ap&&ap.lat!=null&&ap.lon!=null&&Number.isFinite(+ap.lat)&&Number.isFinite(+ap.lon)) return '&lat='+(+ap.lat)+'&lon='+(+ap.lon); }catch(_){} return ''; }
  function open(){ root.classList.add('open'); if(!state.unit) loadUnit(null, true); else render(); if(!state.nat) loadNat(true); }
  /* v91.17.283.19 · the selected place's own parts (its bundle, GET /api/point, read once by the page store) */
  function herePart(name){ try{ var d=AGN.dataServices&&AGN.dataServices.require('domain'); var ap=d&&d.activePoint(); if(ap&&ap.lat!=null&&isFinite(+ap.lat)&&isFinite(+ap.lon)) return AGN.pointState.part(name,+ap.lat,+ap.lon).then(function(v){ return v&&!v.unavailable&&v.ready!==false&&!v.error?v:null; }); }catch(_){} return Promise.resolve(null); }
  function loadUnit(q,atPoint){ body('<p class="ol-meta">Loading '+esc(q||selectedName()||'the selected place')+'…</p>'); (q?get('/api/outlook/unit?unit='+encodeURIComponent(q)):herePart('outlook')).then(function(j){ if(!j&&!state.unit){ body('<p class="ol-meta">No tehsil contains '+esc(q)+' and none has that name, so no outlook is shown; another place\'s outlook is not put in its stead.</p>'); return; } if(j) state.unit=j; render(); }); }
  function loadNat(quiet){ get('/api/outlook/national?day='+state.day).then(function(j){ state.nat=j; if(!quiet||state.tab==='nat') render(); }); }
  function loadSea(q){ var name=q||(state.unit&&state.unit.unit&&state.unit.unit.unitId)||null;
    (name&&name!==((state.unit&&state.unit.resolvedBy==='point'&&state.unit.unit&&state.unit.unit.unitId)||'')?get('/api/outlook/seasonal?unit='+encodeURIComponent(name)):herePart('seasonal')).then(function(j){ state.seaUnit=j||{error:true}; if(state.tab==='sea') render(); });
    if(!state.seaNat) loadSeaNat(); }
  function loadSeaNat(){ get('/api/outlook/seasonal/national?week='+(state.week==null?2:state.week)+'&month='+(state.month==null?1:state.month)).then(function(j){ state.seaNat=j; if(state.tab==='sea') render(); }); }
  function mname(ym){ return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(String(ym).slice(5,7))-1]+' '+String(ym).slice(0,4); }
  function sgn(x,u,d){ return x==null?'–':((x>0?'+':'')+Number(x).toFixed(d==null?1:d)+(u||'')); }
  function sigTxt(sg){ var a=[]; if(sg.warm)a.push('warm'); if(sg.cool)a.push('cool'); if(sg.wet)a.push('wet'); if(sg.dry)a.push('dry'); return a.length?a.join(', '):'near normal'; }
  function renderSea(){
    var h='<div class="ol-row"><input type="text" id="olSeaSearch" list="olNames" placeholder="Tehsil name"><datalist id="olNames">'+names()+'</datalist></div>'+seaHtml(state.seaUnit, state.seaNat, true);
    body(h);
    var inp=document.getElementById('olSeaSearch'); if(inp) inp.addEventListener('change',function(){ var v=inp.value.split(' — ')[0].trim(); if(v){ state.seaUnit=null; render(); loadSea(v); } });
  }
  function seaHtml(U,N,withNat){ var h='';
    if(!U) h+='<p class="ol-meta">Loading…</p>';
    else if(U.error) h+='<div class="ol-note ol-warn">Weeks-ahead and seasonal data are not ready yet. They run a few minutes after the server starts and refresh every 12 hours.</div>';
    else {
      h+='<div class="ol-row"><b style="font-size:15px;color:#0C3851">'+esc(U.unit.name)+'</b><span class="ol-meta">'+esc(U.unit.district)+', '+esc(U.unit.province)+' · updated '+ago(U.at)+'</span></div>';
      var W=U.subseasonal.weeks;
      h+='<div class="ol-box"><h3>Weeks ahead · weeks-ahead ensemble</h3><div class="ol-tbl-wrap">'+tbl('Weeks ahead')+'<thead><tr><th>Week</th><th>Temp vs normal</th><th>Chance warmer<small>above / &gt;+1 / &gt;+2 °C</small></th><th>Rain vs normal</th><th>Chance wetter<small>above / &gt;+10 / &gt;+20 mm</small></th><th>Reading</th></tr></thead><tbody>';
      W.forEach(function(w){ var sg=w.signal; h+='<tr><td>'+dlab(w.start)+' – '+dlab(w.end)+'</td><td><b style="color:'+(w.tAnom>=1?'#c0392b':w.tAnom<=-1?'#2166ac':'#12303f')+'">'+sgn(w.tAnom,' °C')+'</b></td><td>'+w.pT0+'% / '+cellTxt(w.pT1)+' / '+w.pT2+'%</td><td><b style="color:'+(w.pAnom>=5?'#2166ac':w.pAnom<=-3?'#b7791f':'#12303f')+'">'+sgn(w.pAnom,' mm')+'</b></td><td>'+w.pP0+'% / '+w.pP10+'% / '+w.pP20+'%</td><td>'+esc(sigTxt(sg))+'</td></tr>'; });
      h+='</tbody></table></div><div class="ol-meta">Anomalies against the model’s own re-forecast climate for the same week, so its bias cancels. Skill drops after week 3: read weeks 4–6 as a tilt in the odds.</div></div>';
      var M=U.seasonal.months;
      h+='<div class="ol-box" style="margin-top:10px"><h3>Season ahead · seasonal ensemble</h3><div class="ol-tbl-wrap">'+tbl('Season ahead')+'<thead><tr><th>Month</th><th>Mean temp</th><th>vs normal</th><th>Rain</th><th>vs normal</th><th>Reading</th></tr></thead><tbody>';
      M.forEach(function(m,i){ h+='<tr><td>'+mname(m.month)+(i===0?' <span class="ol-meta">in progress</span>':'')+'</td><td>'+(m.tMean==null?esc(m.tText||'–'):m.tMean+' °C')+'</td><td><b style="color:'+(m.tAnom>=1?'#c0392b':m.tAnom<=-1?'#2166ac':'#12303f')+'">'+sgn(m.tAnom,' °C')+'</b></td><td>'+(m.pMean==null?esc(m.pText||'–'):Math.round(m.pMean)+' mm')+'</td><td>'+(m.display==='anomaly'?'<b>'+sgn(m.pPct,'%',0)+'</b>':'<b>'+sgn(m.pAnom,' mm',0)+'</b>'+(m.pPct!=null?' <span class="ol-meta">('+sgn(m.pPct,'%',0)+')</span>':''))+'</td><td>'+esc(sigTxt(m.signal))+'</td></tr>'; });
      h+='</tbody></table></div><div class="ol-meta">Anomalies against the SEAS5 hindcast climate. Temperature signals are more reliable than rain; in the dry months a large percentage can be a few millimetres. Grid cells of about 36 km, not verified locally yet.</div></div>';
    }
    if(withNat&&N&&N.ready){
      h+='<h3 style="margin:14px 0 6px;font-size:14px;color:#0C3851">National · weeks ahead</h3><div class="ol-row ol-days">'+N.weeks.map(function(d,i){ return '<button data-week="'+i+'" class="'+(i===N.weekIndex?'on':'')+'">'+dlab(d)+'</button>'; }).join('')+'</div>';
      h+='<div class="ol-grid">'+[['warm','Warmer than normal',N.rules.weekWarm],['wet','Wetter than normal',N.rules.weekWet],['dry','Drier than normal',N.rules.weekDry]].map(function(x){ var top=N.weekTop[x[0]]||[];
        return '<div class="ol-box"><h3>'+x[1]+'</h3><div><span class="ol-big">'+N.weekCounts[x[0]]+'</span> of '+N.tehsils+' tehsils</div><div class="ol-meta">'+esc(x[2])+'</div>'+(top.length?tbl(x[1])+'<tbody>'+top.slice(0,6).map(function(r){ return '<tr><td><span class="ol-link" data-unit="'+esc(r.unitId)+'">'+esc(r.name)+'</span> <span class="ol-meta">'+esc(r.district)+'</span></td><td>'+sgn(x[0]==='warm'?r.w.tAnom:r.w.pAnom,x[0]==='warm'?' °C':' mm')+'</td></tr>'; }).join('')+'</tbody></table>':'')+'</div>'; }).join('')+'</div>';
      h+='<h3 style="margin:14px 0 6px;font-size:14px;color:#0C3851">National · season ahead</h3><div class="ol-row ol-days">'+N.months.map(function(d,i){ return '<button data-month="'+i+'" class="'+(i===N.monthIndex?'on':'')+'">'+mname(d)+'</button>'; }).join('')+'</div>';
      h+='<div class="ol-grid">'+[['warm','Warm month',N.rules.monthWarm],['wet','Wet month',N.rules.monthWet],['dry','Dry month',N.rules.monthDry]].map(function(x){ var top=N.monthTop[x[0]]||[];
        return '<div class="ol-box"><h3>'+x[1]+'</h3><div><span class="ol-big">'+N.monthCounts[x[0]]+'</span> of '+N.tehsils+' tehsils</div><div class="ol-meta">'+esc(x[2])+'</div>'+(top.length?tbl(x[1])+'<tbody>'+top.slice(0,6).map(function(r){ return '<tr><td><span class="ol-link" data-unit="'+esc(r.unitId)+'">'+esc(r.name)+'</span> <span class="ol-meta">'+esc(r.district)+'</span></td><td>'+(x[0]==='warm'?sgn(r.m.tAnom,' °C'):sgn(r.m.pAnom,' mm',0)+' ('+sgn(r.m.pPct,'%',0)+')')+'</td></tr>'; }).join('')+'</tbody></table>':'')+'</div>'; }).join('')+'</div>';
      h+='<div class="ol-tbl-wrap" style="margin-top:10px">'+tbl('Provinces')+'<thead><tr><th>Province</th><th>Tehsils</th><th>Week '+dlab(N.week)+'<small>temp / rain vs normal</small></th><th>'+mname(N.month)+'<small>temp / rain vs normal (median %)</small></th></tr></thead><tbody>'+N.provinces.map(function(p){ return '<tr><td>'+esc(p.name)+'</td><td>'+p.tehsils+'</td><td>'+sgn(p.weekTAnom,' °C')+' / '+sgn(p.weekPAnom,' mm')+'</td><td>'+sgn(p.monthTAnom,' °C')+' / '+sgn(p.monthPAnom,' mm')+' ('+sgn(p.monthPPctMedian,'%',0)+')</td></tr>'; }).join('')+'</tbody></table></div>';
    }
    return h;
  }
  var PMC=['#35682B','#8a7a12','#c26a0a','#b3261e','#7b1e5a','#5a1010'], DSC=['#35682B','#8a7a12','#c26a0a','#b3261e'];
  function pmCell(d,C){ if(d.pmClass==null) return '<td>–</td>'; return '<td><b style="color:'+PMC[d.pmClass]+'">'+d.pm25+'</b> <span class="ol-meta">'+esc(C[d.pmClass])+'</span></td>'; }
  function airHtml(A, withNat, N){
    var h='';
    if(!A) h+='<p class="ol-meta">Loading…</p>';
    else if(A.error) h+='<div class="ol-note ol-warn">The air and smog outlook is still running (about 2 minutes after the server starts; refreshed every 3 hours). This view reloads itself every 30 seconds until it arrives.</div>';
    else {
      h+='<div class="ol-row"><b style="font-size:15px;color:#0C3851">'+esc(A.unit.name)+'</b><span class="ol-meta">'+esc(A.unit.district)+', '+esc(A.unit.province)+' · updated '+ago(A.at)+'</span></div>';
      h+='<div class="ol-tbl-wrap">'+tbl('Air and smog, next 5 days')+'<thead><tr><th>Day</th><th>PM2.5 daily mean<small>µg/m³ · class</small></th><th>Air quality index<small>US EPA AQI (2024 breakpoints), daily, from the PM2.5 shown and the forecast PM10</small></th><th>Dispersion<small>afternoon ventilation m²/s</small></th><th>Morning inversion<small>hours</small></th><th>Fog risk<small>hours</small></th><th>Smog day</th></tr></thead><tbody>';
      A.days.forEach(function(d){ h+='<tr><td>'+dlab(d.date)+'</td>'+pmCell(d,A.classes)+'<td>'+(d.aqi!=null?'<b>'+d.aqi+'</b> '+esc(d.aqiCategory||'')+(d.aqiPollutant?' <small>('+esc(d.aqiPollutant)+')</small>':''):'–')+'</td><td><b style="color:'+(d.dispersion!=null?DSC[d.dispersion]:'#12303f')+'">'+(d.dispersion!=null?esc(A.dispersion[d.dispersion]):'–')+'</b> <span class="ol-meta">'+(d.afternoonVentilation!=null?d.afternoonVentilation:'')+'</span></td><td>'+(d.inversionHours==null?'<span class="ol-meta">n/a above 500 m</span>':d.inversionHours)+'</td><td>'+(d.fogHours==null?'<span class="ol-meta">n/a above 500 m</span>':d.fogHours)+'</td><td>'+(d.smogDay?'<b style="color:#b3261e">Yes</b>':'no')+'</td></tr>'; });
      h+='</tbody></table></div><div class="ol-note">'+A.notes.map(esc).join(' ')+' Pakistan NEQS 24-hour PM2.5 limit: 35 µg/m³. A smog day needs Unhealthy PM2.5 (≥55.5) and poor dispersion. <b>Modelled, not measured.</b> Every PM2.5 figure on this panel comes from the CAMS global atmospheric composition model. No ground station in the records used to build this system operated a particulate sensor, so these values are unverified against any ground measurement in Pakistan: there is no measured bias, no error and no detection rate for them. Treat the classes as a dispersion and composition screen, not as an air quality reading.</div>';
    }
    if(withNat&&N&&N.ready){
      h+='<h3 style="margin:14px 0 6px;font-size:14px;color:#0C3851">National</h3><div class="ol-row ol-days">'+N.days.map(function(d,i){ return '<button data-airday="'+i+'" class="'+(i===N.dayIndex?'on':'')+'">'+dlab(d)+'</button>'; }).join('')+'</div>';
      h+='<div class="ol-grid"><div class="ol-box"><h3>Smog days</h3><div><span class="ol-big">'+N.smogDays+'</span> of '+N.tehsils+' tehsils</div><div class="ol-meta">Unhealthy PM2.5 and poor dispersion</div>'+topT(N.top.smog,function(r){return r.pm25+' µg/m³';})+'</div>'
        +'<div class="ol-box"><h3>Highest PM2.5</h3><div class="ol-meta">CAMS daily mean</div>'+topT(N.top.pm25,function(r){return r.pm25+' µg/m³';})+'</div>'
        +'<div class="ol-box"><h3>Fog risk</h3><div><span class="ol-big">'+N.fogRisk+'</span> tehsils with 3+ hours</div>'+topT(N.top.fog,function(r){return r.fogHours+' h';})+'</div>'
        +'<div class="ol-box"><h3>PM2.5 classes</h3>'+tbl('PM2.5 classes')+'<tbody>'+N.byClass.map(function(c,i){ return '<tr><td style="color:'+PMC[i]+'">'+esc(c.label)+'</td><td>'+c.tehsils+'</td></tr>'; }).join('')+'</tbody></table><h3 style="margin-top:8px">Dispersion</h3>'+tbl('Dispersion')+'<tbody>'+N.byDispersion.map(function(c,i){ return '<tr><td style="color:'+DSC[i]+'">'+esc(c.label)+'</td><td>'+c.tehsils+'</td></tr>'; }).join('')+'</tbody></table></div></div>';
      h+='<div class="ol-tbl-wrap" style="margin-top:10px">'+tbl('Provinces air')+'<thead><tr><th>Province</th><th>Tehsils</th><th>Median PM2.5</th><th>Smog days</th><th>Poor dispersion</th><th>Fog risk</th></tr></thead><tbody>'+N.provinces.map(function(p){ return '<tr><td>'+esc(p.name)+'</td><td>'+p.tehsils+'</td><td>'+p.pm25Median+' µg/m³</td><td>'+p.smogDays+'</td><td>'+p.poorDispersion+'</td><td>'+p.fogRisk+'</td></tr>'; }).join('')+'</tbody></table></div>';
    }
    return h;
  }
  function topT(list,val){ if(!list||!list.length) return '<div class="ol-meta">None.</div>'; return tbl('top')+'<tbody>'+list.slice(0,6).map(function(r){ return '<tr><td><span class="ol-link" data-unit="'+esc(r.unitId)+'">'+esc(r.name)+'</span> <span class="ol-meta">'+esc(r.district)+'</span></td><td>'+val(r)+'</td></tr>'; }).join('')+'</tbody></table>'; }
  function loadAir(q){ var name=q||(state.unit&&state.unit.unit&&state.unit.unit.unitId)||null; (name&&name!==((state.unit&&state.unit.resolvedBy==='point'&&state.unit.unit&&state.unit.unit.unitId)||'')?get('/api/smog/unit?unit='+encodeURIComponent(name)):herePart('smog')).then(function(j){ state.air=j||{error:true}; if(state.tab==='air') render(); if(!j) setTimeout(function(){ if(state.tab==='air'&&state.air&&state.air.error) loadAir(q); },30000); }); if(!state.airNat) loadAirNat(); }
  function loadAirNat(){ get('/api/smog/national?day='+(state.airDay==null?1:state.airDay)).then(function(j){ state.airNat=j; if(state.tab==='air') render(); }); }
  function renderAir(){ body('<div class="ol-row"><input type="text" id="olAirSearch" list="olNames" placeholder="Tehsil name"><datalist id="olNames">'+names()+'</datalist></div>'+airHtml(state.air,true,state.airNat));
    var inp=document.getElementById('olAirSearch'); if(inp) inp.addEventListener('change',function(){ var v=inp.value.split(' — ')[0].trim(); if(v){ state.air=null; render(); loadAir(v); } }); }
  function cellTxt(p){ return '<b>'+p+'%</b>'; }
  function loadChk(){ get('/api/checks').then(function(j){ state.chk=j; if(state.tab==='chk') render(); }); }
   
  function loadSkill(){ get('/api/skill').then(function(j){ state.skill=j; if(state.tab==='skill') render(); }); }
   
  function loadRiver(){ get('/api/flood/national?day='+(state.riverDay==null?0:state.riverDay)).then(function(j){ state.river=j; if(state.tab==='river') render(); }); }
   
  function loadGauges(){ get('/api/flood/gauges').then(function(j){ state.gauges=j; if(state.tab==='river') render(); }); get('/api/flood/snow').then(function(j){ state.snow=j; if(state.tab==='river') render(); }); }
  function body(h){ root.querySelector('.ol-body').innerHTML=h; }
  function render(){
    root.querySelectorAll('.ol-tabs button').forEach(function(x){ x.classList.toggle('on',x.getAttribute('data-t')===state.tab); });
    if(state.tab==='nat') return renderNat();
    if(state.tab==='chk') return renderChk();
    if(state.tab==='sea') return renderSea();
    if(state.tab==='air') return renderAir();
    if(state.tab==='skill') return renderSkill();
    if(state.tab==='river') return renderRiver();
    var U=state.unit; if(!U) return body('<p class="ol-meta">Loading…</p>');
    var h='<div class="ol-row"><input type="text" id="olSearch" list="olNames" placeholder="Tehsil name, for example Jacobabad"><datalist id="olNames">'+names()+'</datalist> <button type="button" id="olSel" class="ol-tabs-btn" style="font:600 12px system-ui;border:1px solid #c9d5de;background:#f5f8fa;color:#0C3851;padding:6px 10px;border-radius:6px;cursor:pointer">Use map selection</button></div>';
    h+='<div class="ol-row"><b style="font-size:15px;color:#0C3851">'+esc(U.unit.name)+'</b><span class="ol-meta">'+esc(U.unit.district)+', '+esc(U.unit.province)+(U.unit.elevM!=null?' · '+U.unit.elevM+' m'+(U.unit.elevSource&&U.unit.elevSource!=='anchor point'?' (settlement height; anchor '+U.unit.anchorElevM+' m)':''):'')+'</span></div>';
    if(U.heightBasis&&U.heightBasis.label) h+='<div class="ol-note" id="olHeightBasis">'+esc(U.heightBasis.label)+'</div>';   /* v91.17.283.5 W3: the height of the outlook temperatures */
    var E=U.ensemble;
    if(!E){ h+='<div class="ol-note ol-warn">'+(U.unit.disputed?'Disputed territory: no meteorological product is published.':'The ensemble run has not completed yet. It starts about 90 seconds after the server starts and refreshes every 6 hours.')+'</div>'; }
    else {
      h+='<div class="ol-meta">global forecast model ensemble, '+E.members+' members, updated '+ago(E.at)+'.'+staleRun(E)+' Band = 10th to 90th percentile, line = median.</div>';
      h+=chart(E.days,root.querySelector('.ol-body'));
      h+=events(U);
      h+='<div class="ol-tbl-wrap">'+tbl('Daily ensemble values and chances')+'<thead><tr><th>Day</th><th>Max °C<small>median, 10–90%</small></th><th>Min °C<small>median, 10–90%</small></th><th>Rain mm<small>median, wet case</small></th><th>Gust<small>km/h</small></th>'+TH_ORDER.map(function(k){return '<th>'+THS[k]+'</th>';}).join('')+'</tr></thead><tbody>';
      fromToday(E.days).forEach(function(d){ function rng(a){ return a?('<b>'+a[1]+'</b> <span class="ol-meta">'+a[0]+'–'+a[2]+'</span>'):'–'; }
        h+='<tr><td>'+dlab(d.date)+'</td><td>'+rng(d.tx)+'</td><td>'+rng(d.tn)+'</td><td>'+(d.pr?('<b>'+d.pr[1]+'</b> <span class="ol-meta">wet '+d.pr[2]+'</span>'):'–')+'</td><td>'+(d.gu?d.gu[1]:'–')+'</td>'+TH_ORDER.map(function(k){ return cell(d.p&&d.p[k]); }).join('')+'</tr>'; });
      h+='</tbody></table></div>';
      h+='<div class="ol-note">Chances are the share of the '+E.members+' members crossing each threshold. They are raw, not yet calibrated against observations, and short-range spread is usually too narrow, so 90% is less certain than it reads. For days 1–3 the bias-corrected forecast on the dashboard (grade A) is the verified reference.'+' '+adjNote(U.adjustment)+'</div>';
    }
    h+='<div class="ol-note">Weeks 1–6 and the next 6 months for this tehsil: <span class="ol-link" data-t="sea">Weeks &amp; season tab</span>.</div>';
    h+=sun(U.sunshine);
    body(h);
    var inp=document.getElementById('olSearch'); if(inp) inp.addEventListener('change',function(){ var v=inp.value.split(' — ')[0].trim(); if(v) loadUnit(v); });
    var sb=document.getElementById('olSel'); if(sb) sb.onclick=function(){ var s=selectedName(); if(s) loadUnit(s,true); else sb.textContent='No place selected on the map'; };
  }
  function adjNote(A){ if(!A) return ''; if(A.stationGuard) return ' Temperatures here are not shifted: the '+A.stationGuard.station+' airport thermometer shows global reanalysis, the reference for the shift, is itself biased at this location.'; var p=[]; ['tx','tn'].forEach(function(v){ var x=A[v]; if(!x) return; var nm=v==='tx'?'daily max':'daily min';
      var sh=(x.appliedShift!=null?x.appliedShift:(x.trainBias!=null?x.trainBias:x.bias)); p.push(x.applied?(nm+' shifted '+(sh>0?'−':'+')+Math.abs(sh).toFixed(1)+' °C (test-month error '+x.maeRaw+' → '+x.maeAdjusted+' °C)'):(nm+' not shifted (a shift did not help on the test month)')); });
    return p.length?(' Temperatures here: '+p.join('; ')+'.'):''; }
  function events(U){
    var V=U.events; if(!V) return '';
    var h='<div class="ol-box" style="margin:10px 0"><h3>Multi-day events, counted member by member ('+esc(dlab(V.window[0]))+' to '+esc(dlab(V.window[1]))+')</h3><div class="ol-meta">'+(U.ensemble&&staleRun(U.ensemble)?'Counted over the run of '+esc(pktRun(U.ensemble.at))+', whose window starts '+esc(dlab(V.window[0]))+'; a start before today reads \u201cbefore today\u201d. ':'')+'Each of the '+V.members+' members is one possible future. A chance of 40% means 20 of them contain the event. This keeps day-to-day dependence that the daily table cannot show.'+(V.coastal?' This unit is '+V.coastKm+' km from the sea, so the dry-bulb 40 °C test is not run here — on the coast it misses most hot days. Coastal humid heat is screened on apparent temperature instead.':'')+(V.climatology?' "Local" limits come from 1991–2020 global reanalysis for this tehsil and time of year.':' Local limits are pending (climatology still building).')+'</div>';
    h+=tbl('Multi-day event chances')+'<thead><tr><th>Event</th><th>Chance</th><th>Usual chance<small>same fortnight, 1991–2020</small></th><th>Typical start</th><th>Earliest</th></tr></thead><tbody>';
    EV_ORDER.forEach(function(k){ var x=V[k]; if(!x) return;
      

      var df=(V.definitions||[]).filter(function(d){ return d.id===k; })[0]; var lb=(df&&df.label)||EVS[k];
      h+='<tr'+((x.p==null||Number(x.p)===0)?' class="ol-z85"':'')+'><td style="white-space:normal">'+esc(lb)+(df&&df.rule?'<br><span class="ol-meta">'+esc(df.rule)+'</span>':'')+(x.p==null&&x.why?'<br><span class="ol-meta">'+esc(x.why)+'</span>':'')+'</td>'+(x.p==null?'<td class="ol-meta">'+(x.ordinary?'ordinary':'not screened')+'</td>':cell(x.p))+'<td class="ol-meta">'+(x.climP==null?'–':x.climP+'%')+'</td><td>'+(x.onset?dOn(x.onset):'–')+'</td><td>'+(x.earliest?dOn(x.earliest):'–')+'</td></tr>';
      

      if(k==='heatSpell' && V.heatSpellClasses){
        Object.keys(HEAT_SUB).forEach(function(c){
          var sc=V.heatSpellClasses[c]; if(!sc) return;
          h+='<tr'+((sc.p==null||Number(sc.p)===0)?' class="ol-z85"':'')+'><td style="white-space:normal;padding-left:22px;color:#5d6b76">└ '+HEAT_SUB[c]
            +(sc.p==null&&sc.why?(' <span class="ol-meta">— '+esc(sc.why)+'</span>'):'')+'</td>'
            +(sc.p==null?'<td class="ol-meta">not screened</td>':cell(sc.p))+'<td></td>'
            +'<td>'+(sc.onset?dOn(sc.onset):'–')+'</td><td>'+(sc.earliest?dOn(sc.earliest):'–')+'</td></tr>';
        });
      }
    });
    h+='</tbody></table><div class="ol-meta ol-z85-note" style="margin-top:4px"><button type="button" class="ol-z85-btn" onclick="var t=this.closest(\'.ol-box\');t.classList.toggle(\'ol-z85-all\');this.textContent=t.classList.contains(\'ol-z85-all\')?\'Show only the events with a chance\':\'Show all events, including the ones not expected\';">Show all events, including the ones not expected</button></div><div class="ol-meta" style="margin-top:4px">Hottest 3 days (mean max): <b>'+(V.peak3dTx?V.peak3dTx[1]+' °C':'–')+'</b>'+(V.peak3dTx?' ('+V.peak3dTx[0]+'–'+V.peak3dTx[2]+')':'')+' · wettest 3 days: <b>'+(V.max3dRain?V.max3dRain[1]+' mm':'–')+'</b>'+(V.max3dRain?' (wet case '+V.max3dRain[2]+' mm)':'')+'</div></div>';
    return h;
  }
  

  

  

  function gaugeOutlook(){
    var G=state.gauges; if(!G) return '';
    if(!G.ready) return '<div class="ol-note ol-warn"><b>Big-river outlook from the gauges.</b> '+esc(G.why||'Not issued yet.')+'</div>';
    var CC=['','background:rgba(74,140,147,.25)','background:rgba(218,117,15,.45);font-weight:700','background:rgba(192,57,43,.7);color:#fff;font-weight:700','background:rgba(142,30,20,.85);color:#fff;font-weight:700','background:#4a0d07;color:#fff;font-weight:700'];
    var cell=function(q,c,n,past){ return '<td style="'+(past?'color:#8a9299;background:#f1efea':(CC[c]||''))+'">'+(q==null?'–':Math.round(q).toLocaleString())+'<br><span class="ol-meta"'+(c>=3&&!past?' style="color:#fff"':'')+'>'+esc(n||'')+'</span></td>'; };
     
    if(G.customerView){ var hc='<div class="ol-note"><b>Big-river outlook, next 3 days.</b> AGN\u2019s level for each barrage and dam reach today and for the next three days, from the latest river readings (checked '+esc(G.basedOn)+'). It never goes below today\u2019s level, so it is a warning floor.'+(G.stale?' <b style="color:#b03a2e">Out of date: no new readings for '+G.ageDays+' days.</b>':'')+'</div>';
      hc+='<div class="ol-tbl-wrap">'+tbl('Big-river outlook by reach')+'<thead><tr><th>Reach</th><th>Today</th>'+(G.gauges[0]?G.gauges[0].days.map(function(d){ return '<th>'+dlab(d.date)+'</th>'; }).join(''):'')+'</tr></thead><tbody>';
      G.gauges.forEach(function(r){ var lc=function(c,n,past){ return '<td style="'+(past?'color:#8a9299;background:#f1efea':(CC[c]||''))+'">'+esc(n||'\u2013')+'</td>'; };
        hc+='<tr><td style="white-space:normal;text-align:left"><b>'+esc(r.name)+'</b></td>'+lc(r.cls,r.clsName)+(r.days.length?r.days.map(function(d){ return lc(d.cls,d.clsName,G.stale); }).join(''):'<td colspan="3" class="ol-meta">No outlook: no recent reading</td>')+'</tr>'; });
      return hc+'</tbody></table></div>'; }
    var h='<div class="ol-note"><b>Big-river outlook from the gauges, next 3 days.</b> Flow in thousand cusecs at the barrage and dam gauges, measured on '
      +esc(G.basedOn)+', and AGN\u2019s gauge model for the next three days (it reads each gauge\u2019s own rise or fall and the gauges upstream; it never goes below the last measured flow, so it is a warning floor rather than a flow forecast). '
      +'Class = the national flood limits for that gauge.'+(G.stale?' <b style="color:#b03a2e">No new daily river sheet for '+G.ageDays+' days: the outlook is out of date.</b>':'')+'</div>';
    h+='<div class="ol-tbl-wrap">'+tbl('Big-river outlook by gauge')+'<thead><tr><th>Gauge</th><th>Measured<small>'+esc(G.basedOn)+'</small></th>'
      +(G.gauges[0]?G.gauges[0].days.map(function(d){ return '<th>'+dlab(d.date)+'</th>'; }).join(''):'')+'</tr></thead><tbody>';
    G.gauges.forEach(function(r){
      h+='<tr><td style="white-space:normal;text-align:left"><b>'+esc(r.name)+'</b>'+(r.method!=='model'?'<br><span class="ol-meta">'+esc(r.method)+'</span>':'')+'</td>'
        +cell(r.kcusecs,r.cls,r.clsName)+(r.days.length?r.days.map(function(d){ return cell(d.kcusecs,d.cls,d.clsName,G.stale); }).join(''):'<td colspan="3" class="ol-meta">No outlook: no reading since '+esc(r.lastReading)+'</td>')+'</tr>'; });
    h+='</tbody></table></div>';
    if(G.heldOut) h+='<div class="ol-meta" style="margin:4px 0 12px">Internal: held out over three monsoons, Medium or above caught '+Math.round(G.heldOut['1'].pod*100)+'% / '+Math.round(G.heldOut['2'].pod*100)+'% / '+Math.round(G.heldOut['3'].pod*100)+'% at 1 / 2 / 3 days (false alarms '+Math.round(G.heldOut['1'].far*100)+'% / '+Math.round(G.heldOut['2'].far*100)+'% / '+Math.round(G.heldOut['3'].far*100)+'%); "tomorrow = today" catches '+Math.round(G.heldOut['1'].pers_pod*100)+'% / '+Math.round(G.heldOut['2'].pers_pod*100)+'% / '+Math.round(G.heldOut['3'].pers_pod*100)+'%.</div>';
    return h;
  }
  

  function snowPanel(){
    var N=state.snow; if(!N) return '';
    if(!N.ready) return '<div class="ol-note ol-warn"><b>Snow in the northern valleys.</b> '+esc(N.why||'Not issued yet.')+'</div>';
    var h='<div class="ol-note"><b>Snow on the ground in the northern valleys.</b> From the valley weather stations\u2019 snow-depth sensors, as of '+esc(N.asOf||'–')
      +'. Seasonal snow only (each sensor\u2019s late-summer ground level is taken off). Screening words, not verified against melt-flow records.'
      +(N.stale?' <b style="color:#b03a2e">No new snow reading for '+N.ageDays+' days.</b>':'')+'</div>';
    h+='<div class="ol-tbl-wrap">'+tbl('Snow by mountain area')+'<thead><tr><th>Area</th><th>Snowpack</th><th>Last 7 days</th><th>Against last year</th><th>Feeds</th></tr></thead><tbody>';
    (N.areas||[]).forEach(function(a){ var melt=a.meltToRivers;
      h+='<tr><td style="white-space:normal;text-align:left"><b>'+esc(a.name)+'</b><br><span class="ol-meta">'+(a.stations?a.stations+' station'+(a.stations>1?'s':'')+' reporting':'no station reporting')+'</span></td>'
        +'<td>'+esc(a.snowpack||'No data')+'</td><td style="'+(melt?'background:rgba(74,140,147,.25);font-weight:700':'')+'">'+esc(a.trend||'–')+'</td><td>'+esc(a.vsLastYear||'–')+'</td>'
        +'<td style="white-space:normal;text-align:left" class="ol-meta">'+esc(a.feeds||'')+(melt?'<br><b>melt water is reaching this river</b>':'')+'</td></tr>'; });
    h+='</tbody></table></div>';
    if(N.stations&&N.stations.length){ var R=N.stations.filter(function(s){ return s.reporting; });
      h+='<details class="ol-meta" style="margin:4px 0 12px"><summary>Internal: '+R.length+' of '+N.stations.length+' snow sensors reporting (station figures, cm)</summary><div class="ol-tbl-wrap">'+tbl('Snow sensors')
        +'<thead><tr><th>Station</th><th>Area</th><th>Height m</th><th>Depth</th><th>7-day change</th><th>Last year</th><th>Ground level taken off</th><th>Last day</th></tr></thead><tbody>'
        +N.stations.map(function(s){ return '<tr><td style="text-align:left">'+esc(s.station)+'</td><td>'+esc(s.area||'–')+'</td><td>'+(s.elevM==null?'–':s.elevM)+'</td><td>'+(s.depthCm==null?'–':s.depthCm)+'</td><td>'+(s.change7dCm==null?'–':s.change7dCm)+'</td><td>'+(s.lastYearCm==null?'–':s.lastYearCm)+'</td><td>'+(s.groundLevelCm==null?'–':s.groundLevelCm)+'</td><td>'+esc(s.lastDay||'')+(s.reporting?'':' (silent)')+'</td></tr>'; }).join('')
        +'</tbody></table></div></details>'; }
    return h;
  }
  function renderRiver(){
    var R=state.river; if(!R) return body('<p class="ol-meta">Loading…</p>');
    if(!R.ready) return body(gaugeOutlook()+snowPanel()+'<div class="ol-note ol-warn">'+esc(R.why||'The riverine job has not run.')
      +' It runs from the server: POST /api/flood/run?what=all the first time (snap, then return periods, then the forecast).</div>');
    var h=gaugeOutlook()+snowPanel()+'<div class="ol-note"><b>Riverine flood, '+R.points+' main-stem points.</b> '+esc(R.disclaimer)+'</div>';
    h+='<div class="ol-note ol-warn"><b>Not published for mountain tributaries.</b> '+esc(R.tributaries)+'</div>';
    h+='<div class="ol-row ol-days">'+R.days.map(function(d,i){
      return '<button data-riverday="'+i+'" class="'+(i===R.dayIndex?'on':'')+'">'+dlab(d)+'</button>'; }).join('')+'</div>';
    

    

    var BL={}; (R.rows||[]).forEach(function(r){ if(r.level) BL[r.level]=(BL[r.level]||0)+1; });
    h+='<div class="ol-meta" style="margin-bottom:6px">'+R.members+' ensemble members · '
      +['Severe','High','Moderate','Low','Normal'].filter(function(k){ return BL[k]; }).map(function(k){ return BL[k]+' '+k; }).join(' · ')
      +(R.at?' · issued '+esc(String(R.at).replace('T',' ').slice(0,16))+' UTC':'')+(R.stale?' · <b>'+esc(R.staleWhy||'stale')+'</b>':'')+'</div>';
    var CC={Severe:'background:rgba(165,0,38,.8);color:#fff;font-weight:700',High:'background:rgba(232,85,45,.6);font-weight:700',Moderate:'background:rgba(253,174,97,.6);font-weight:700',Low:'background:rgba(255,230,128,.5);font-weight:600',Normal:''};
    var pc=function(v){ return v==null?'–':v+'%'; };
    h+='<div class="ol-tbl-wrap">'+tbl('River level by reach')
      +'<thead><tr><th>Point</th><th>River</th><th>Level<small>how rare the forecast flow is for this reach</small></th>'
      +'<th>Members above the 2-year flow</th><th>Members above the 5-year flow</th>'
      +(R.internalRef?'<th>internal: m³/s<small>10th / median / 90th</small></th>':'')+'</tr></thead><tbody>';
    R.rows.forEach(function(r){
      var q=r.q||[null,null,null];
      h+='<tr><td style="white-space:normal"><b>'+esc(r.name)+'</b><br><span class="ol-meta">'+esc(r.kind)+' · '+esc(r.province)+'</span></td>'
        +'<td>'+esc(r.river)+'</td>'
        +'<td style="white-space:normal;'+(CC[r.level]||'')+'"><b>'+esc(r.level||'No data')+'</b><br><span class="ol-meta"'+(r.level==='Severe'?' style="color:#fff"':'')+'>'+esc(r.level?(r.band||r.word||'normal for the time of year'):(r.classWhy||'no level for this reach'))+'</span></td>'
        +'<td>'+pc(r.shareAbove2yr)+'</td><td>'+pc(r.shareAbove5yr)+'</td>'
        +(R.internalRef?'<td class="ol-meta">'+(q[1]==null?'–':Math.round(q[1]).toLocaleString())+'<br>'+(q[0]==null?'–':Math.round(q[0]).toLocaleString())+' – '+(q[2]==null?'–':Math.round(q[2]).toLocaleString())+'</td>':'')+'</tr>';
    });
    h+='</tbody></table></div>';
    h+='<div class="ol-note" style="margin-top:8px"><b>How to read the level.</b> Each reach is compared only with the same '
      +'model\u2019s own daily record at that reach since 1997: <b>Normal</b> below the reach\u2019s 5-year flow, including flows that are '
      +'high for the time of year (in the 2024-25 flood bulletins the river was most often under any flood class below that flow); '
      +'<b>Moderate</b> a 5-year flow or rarer, when the river most often reached a Medium flood; <b>High</b> a 20-year flow; <b>Severe</b> 1.5 times the 20-year flow, a chosen step. High and Severe are untested: the record holds no 20-year flow days, so neither step has been checked against an observed flood. The level is the ensemble median on the chosen day; the two percentages are the share of members at or above '
      +'the reach\u2019s 2- and 5-year flows. A model that runs high or low at a reach is compared only with itself, so the class '
      +'is a statement about how unusual the flow is, not a discharge.</div>';
    return body(h);
  }
  function renderSkill(){
    var K=state.skill; if(!K) return body('<p class="ol-meta">Loading…</p>');
    if(K.error) return body('<div class="ol-note ol-warn">The skill sheet is not available.</div>');
    

    if(!K.reference){
      var hm='<div class="ol-note"><b>'+esc(K.title||'Methods')+'.</b> '+esc(K.statement||'')+'</div>';
      hm+='<div class="ol-tbl-wrap">'+tbl('Methods')+'<thead><tr><th>Value</th><th>What it measures</th></tr></thead><tbody>';
      (K.parameters||[]).forEach(function(p){ hm+='<tr><td style="white-space:normal;text-align:left"><b>'+esc(p.label||p.id)+'</b></td><td style="white-space:normal;text-align:left">'+esc(p.measurand||'')+(p.method?'<br><span class="ol-meta">'+esc(p.method)+'</span>':'')+'</td></tr>'; });
      hm+='</tbody></table></div>';
      if(K.thresholds&&K.thresholds.length){ hm+='<h3 style="margin:14px 0 4px;font-size:14px;color:#0C3851">Thresholds used</h3><ul class="ol-meta">'+K.thresholds.map(function(t){ return '<li>'+esc(t.label||t.id)+'</li>'; }).join('')+'</ul>'; }
      return body(hm);
    }
    var chip=function(v){ return v===true
      ? '<b style="color:#35682B">verified</b>'
      : '<b style="color:#b3261e">NOT VERIFIED</b>'; };
    var h='<div class="ol-note"><b>What every number here is worth.</b> Measured '+esc(K.measuredOn)
      +' · sheet version '+esc(K.version)+'. '+esc(K.reference.caveat)+' Refit: '+esc(K.refit)+'</div>';
    h+='<div class="ol-note"><b>Reference.</b> '+esc(K.reference.network)+' · '
      +(K.reference.rows.screened/1e6).toFixed(1)+'M rows screened, '
      +(K.reference.rows.usable/1e6).toFixed(1)+'M usable · trusted for temperature: '
      +esc(K.reference.trustCohorts.temperature)+', for rainfall: '+esc(K.reference.trustCohorts.rainfall)
      +'. Model: '+esc(K.reference.model)+'</div>';

    h+='<h3 style="margin:14px 0 4px;font-size:14px;color:#0C3851">Parameters</h3>';
    h+='<div class="ol-tbl-wrap">'+tbl('Parameter skill')
      +'<thead><tr><th>Parameter</th><th>Measurand and domain</th><th>Measured</th><th>What the platform does</th></tr></thead><tbody>';
    K.parameters.forEach(function(p){
      if(p.id==='model_ranking') return;    
      var meas=[];
      if(p.raw) meas.push('raw '+esc(JSON.stringify(p.raw).replace(/[{}"]/g,'').replace(/,/g,', ')));
      if(p.corrected && typeof p.corrected==='object' && p.corrected.mae_C!=null) meas.push('corrected MAE '+esc(String(p.corrected.mae_C))+' °C');
      else if(p.corrected && p.corrected.bias_C!=null) meas.push('corrected bias '+esc(String(p.corrected.bias_C))+' °C');
      h+='<tr>'
        +'<td style="white-space:normal;text-align:left"><b>'+esc(p.label)+'</b><br>'+chip(p.verified)+'</td>'
        +'<td style="white-space:normal;text-align:left">'+esc(p.measurand||'—')+'<br><span class="ol-meta">'+esc(p.domain||'')+'</span>'
          +(p.sample?'<br><span class="ol-meta">'+esc(p.sample)+'</span>':'')+'</td>'
        +'<td style="white-space:normal;text-align:left">'+(meas.length?esc(meas.join(' · ')):'<span class="ol-meta">no paired measurement</span>')
          +(p.note?'<br><span class="ol-meta">'+esc(p.note)+'</span>':'')+'</td>'
        +'<td style="white-space:normal;text-align:left">'+esc(p.action)+'</td></tr>';
    });
    h+='</tbody></table></div>';

     
    var MR=K.parameters.filter(function(p){ return p.id==='model_ranking'; })[0];
    if(MR){
      h+='<h3 style="margin:14px 0 4px;font-size:14px;color:#0C3851">Which model, measured against the reference stations</h3>';
      if(!MR.result){ h+='<div class="ol-note">'+esc(MR.sample||'not run')+'. '+esc(MR.action||'')+'</div>'; }
      else {
        h+='<div class="ol-note">'+esc(MR.sample)+'. <b>Serving:</b> '+esc(MR.deployed)+'</div>';
        h+='<div class="ol-tbl-wrap">'+tbl('Model ranking')+'<thead><tr><th>Region</th><th>Field</th><th>Lead</th><th>Closest (MAE)</th><th>global forecast model</th><th>Spread best–worst</th><th>Catches rain days</th></tr></thead><tbody>';
        var UNIT={temperature_2m:' °C',precipitation:' mm/d',wind_gusts_10m:' km/h'};
        Object.keys(MR.result).forEach(function(reg){ var rows=MR.result[reg]; Object.keys(rows).forEach(function(k){ var r=rows[k], kk=k.split('|'); var u=UNIT[kk[0]]||'';
          h+='<tr><td>'+esc(reg)+'</td><td style="white-space:normal;text-align:left">'+esc(kk[0].replace('_2m','').replace('_10m','').replace('_',' ')+' · '+kk[1].replace('_',' '))+'</td><td>'+esc(kk[2])+'</td>'
            +'<td style="white-space:normal;text-align:left"><b>'+esc(r.best)+'</b> '+r.mae+u+' (bias '+(r.bias>0?'+':'')+r.bias+u+', '+r.stations+' st.)</td>'
            +'<td>'+(r.ecmwf_ifs025_mae!=null?r.ecmwf_ifs025_mae+u:'—')+'</td><td>'+r.spread_mae[0]+'–'+r.spread_mae[1]+u+'</td>'
            +'<td style="white-space:normal;text-align:left">'+(r.bestOccurrence?esc(r.bestOccurrence.model)+' (POD '+r.bestOccurrence.pod_1mm+', FAR '+r.bestOccurrence.far_1mm+'; the MAE winner catches '+Math.round(r.pod_1mm*100)+'%)':'—')+'</td></tr>'; }); });
        h+='</tbody></table></div><div class="ol-meta">'+esc(MR.reading)+' '+esc(MR.caveat||'')+'</div>';
        if(MR.blend && MR.blend.heldOut && MR.blend.heldOut.length){
          h+='<div class="ol-note" style="margin-top:8px"><b>Learned multi-model blend (hourly temperature, station unseen):</b> '+esc(MR.blend.status)+'. '
            +MR.blend.heldOut.filter(function(x){ return x.lead===1; }).map(function(x){ return esc(x.region+' '+x.candidate+' '+x.mae_c+' °C'); }).join(' · ')+'.</div>';
        }
      }
    }

    h+='<h3 style="margin:14px 0 4px;font-size:14px;color:#0C3851">Thresholds</h3>';
    h+='<div class="ol-tbl-wrap">'+tbl('Threshold skill')
      +'<thead><tr><th>Threshold</th><th>Site</th><th>Observed days</th><th>Model days</th><th>Detection</th><th>False alarms</th><th>What the platform does</th></tr></thead><tbody>';
    K.thresholds.forEach(function(t){
      var rs=t.results||[];
      if(!rs.length){ h+='<tr><td style="white-space:normal;text-align:left"><b>'+esc(t.label)+'</b><br>'+chip(t.verified)+'</td>'
        +'<td colspan="5" class="ol-meta" style="white-space:normal;text-align:left">'+esc(t.sample||'no paired verification')+'</td>'
        +'<td style="white-space:normal;text-align:left">'+esc(t.action)+'</td></tr>'; return; }
      rs.forEach(function(r,i){
        var det=r.detection!=null?r.detection:(r.corrected&&r.corrected.detection);
        var far=r.falseAlarms!=null?r.falseAlarms:(r.corrected&&r.corrected.falseAlarms);
        if(far==null && r.falseAlarms_at40kmh!=null) far=r.falseAlarms_at40kmh;
        h+='<tr>'
          +(i===0?'<td rowspan="'+rs.length+'" style="white-space:normal;text-align:left"><b>'+esc(t.label)+'</b><br>'+chip(t.verified)+'</td>':'')
          +'<td>'+esc(r.site)+'</td>'
          +'<td>'+(r.observedDays!=null?r.observedDays:'–')+'</td>'
          +'<td>'+(r.modelDays!=null?r.modelDays:'–')+'</td>'
          +'<td>'+(det!=null?det:'–')+'</td>'
          +'<td'+(far!=null&&far>=0.4?' style="color:#b3261e;font-weight:700"':'')+'>'+(far!=null?far:'–')+'</td>'
          +(i===0?'<td rowspan="'+rs.length+'" style="white-space:normal;text-align:left">'+esc(t.action)+'</td>':'')
          +'</tr>';
      });
    });
    h+='</tbody></table></div>';

    h+='<h3 style="margin:14px 0 4px;font-size:14px;color:#0C3851">Fitted and deliberately not deployed</h3>';
    h+='<div class="ol-tbl-wrap">'+tbl('Withheld')+'<thead><tr><th>What</th><th>Why it is withheld</th></tr></thead><tbody>';
    (K.withheld||[]).forEach(function(w){ h+='<tr><td style="white-space:normal;text-align:left"><b>'+esc(w.what)+'</b></td><td style="white-space:normal;text-align:left">'+esc(w.why)+'</td></tr>'; });
    h+='</tbody></table></div>';
    return body(h);
  }
  function renderChk(){
    var C=state.chk; if(!C) return body('<p class="ol-meta">Loading…</p>');
    var h='', S=C.stations||{};
    h+='<div class="ol-box"><h3>Forecast vs airport thermometers</h3><div class="ol-meta">Checks the forecast, the correction and global reanalysis itself against real observations. Window '+(S.window?esc(S.window.start_date+' to '+S.window.end_date):'–')+' (the test month of the national check), updated '+ago(S.at)+'.</div>';
    if(S.stations&&S.stations.length){
      h+='<div class="ol-tbl-wrap">'+tbl('Station verification')+'<thead><tr><th>Station</th><th>Nearest tehsil</th><th>Hours</th><th>24 h error raw<small>RMSE °C</small></th><th>With correction<small>RMSE °C</small></th><th>Served<small>RMSE °C</small></th><th>global reanalysis at station<small>RMSE / bias °C</small></th></tr></thead><tbody>';
      S.stations.forEach(function(r){ var L=r.leads&&r.leads['24']||{}; var guard=(L.guarded===true)||(L.guarded==null&&L.correction_applied&&L.rmse_served>L.rmse_raw+0.1); var served=guard?L.rmse_raw:(L.correction_applied?L.rmse_served:L.rmse_raw);
        h+='<tr><td style="white-space:normal">'+esc(r.name)+'</td><td>'+esc(r.nearestTehsil||'–')+' <span class="ol-meta">'+(r.nearestKm!=null?r.nearestKm+' km':'')+'</span></td><td>'+(L.n||0)+'</td><td>'+(L.rmse_raw!=null?L.rmse_raw:'–')+'</td><td>'+(L.correction_applied?L.rmse_served:'<span class="ol-meta">none</span>')+'</td><td><b style="color:'+(served!=null&&served<=2?'#35682B':'#9b2c2c')+'">'+(served!=null?served:'–')+'</b>'+(guard?' <span class="ol-meta">correction off</span>':'')+'</td><td>'+(r.era5?r.era5.rmse+' / '+(r.era5.bias>0?'+':'')+r.era5.bias:'–')+'</td></tr>'; });
      h+='</tbody></table></div>';
      var V=window.__agnVerif&&__agnVerif.summary, sc=V&&V.stationCheck;
      h+='<div class="ol-note">'+(sc?('Grade A station rule: at least 75% of stations within 2.0 °C served, and the correction must not raise the median error. Now: '+sc.passServed+' of '+sc.stations+' pass; median '+sc.medianServed+' °C served vs '+sc.medianRaw+' °C raw. '+(sc.guardedStations.length?('Correction switched off within 40 km of '+sc.guardedStations.join(', ')+' ('+sc.guardedTehsils24+' tehsils) because the thermometer says it made things worse; global reanalysis runs '+S.stations.filter(function(r){return sc.guardedStations.indexOf(r.id)>=0&&r.era5;}).map(function(r){return r.id+' '+(r.era5.bias>0?'+':'')+r.era5.bias+' °C';}).join(', ')+' there.'):'')):'Station rule applies after the next national check.')+' Airports are single points and METAR reports whole degrees, so part of each error is representativeness and rounding.</div>';
    } else h+='<div class="ol-note ol-warn">'+(S.running?'Running…':('No station results yet'+(S.lastError?(': '+esc(S.lastError)):'')+'. It runs once a day after the national check.'))+'</div>';
    h+='<div class="ol-meta">More stations: drop a CSV in '+esc(S.importFolder||'data/stations/import')+'.</div></div>';
    var HL=C.health; if(HL){ h='<div class="ol-box" style="margin-bottom:10px"><h3>System health</h3><div>'+(HL.ok?'<b style="color:#35682B">All scheduled jobs are on time.</b>':'<b style="color:#b3261e">'+(HL.stale.length?HL.stale.length+' job(s) late':'')+(HL.never.length?' · '+HL.never.length+' not run yet':'')+'</b>')+'</div><div class="ol-tbl-wrap">'+tbl('Jobs')+'<thead><tr><th>Job</th><th>Last completed</th><th>Limit</th><th>State</th></tr></thead><tbody>'+HL.jobs.map(function(j){ return '<tr><td>'+esc(j.label)+'</td><td>'+(j.ageH==null?'never':j.ageH+' h ago')+'</td><td>'+(j.maxH>24*300?'once':j.maxH>=48?Math.round(j.maxH/24)+' d':j.maxH+' h')+'</td><td><b style="color:'+(j.state==='ok'||j.state==='running'?'#35682B':j.state==='not configured'?'#8a6d00':'#b3261e')+'">'+esc(j.state)+'</b></td></tr>'; }).join('')+'</tbody></table></div><div class="ol-meta">Nightly backups in data/nightly (last 14 kept): '+esc((HL.backups||[]).slice(0,3).join(', ')||'none yet')+'. A late job raises an alert once a day.</div></div>'+h; }
    var SR=C.seasonalRecord; if(SR){ var rows=[]; Object.keys(SR.ec46||{}).forEach(function(k){ rows.push([k.replace('week','weeks-ahead ensemble, week '),SR.ec46[k]]); }); Object.keys(SR.seas5||{}).forEach(function(k){ rows.push([k.replace('month','SEAS5 month +'),SR.seas5[k]]); });
      h+='<div class="ol-box" style="margin-top:10px"><h3>Weeks-ahead and seasonal record</h3><div>Logged: <b>'+SR.logs.ec46+'</b> weeks-ahead ensemble issues, <b>'+SR.logs.seas5+'</b> seasonal ensemble issues. Anomaly climate (global reanalysis 1993–2016): '+(SR.anomalyClimate?'ready':'building')+'.</div>'
        +(rows.length?'<div class="ol-tbl-wrap">'+tbl('Seasonal scores')+'<thead><tr><th>Lead</th><th>Pairs</th><th>Temp sign hit</th><th>Rain sign hit</th><th>Brier warmer / wetter</th><th>Temp anomaly correlation</th></tr></thead><tbody>'+rows.map(function(r){ var x=r[1]; return '<tr><td>'+esc(r[0])+'</td><td>'+x.pairs+'</td><td>'+(x.tempSignHit!=null?x.tempSignHit:'–')+'</td><td>'+(x.rainSignHit!=null?x.rainSignHit:'–')+'</td><td>'+(x.brierWarmer!=null?x.brierWarmer+' / '+x.brierWetter:'–')+'</td><td>'+(x.tempAnomalyCorrelation!=null?x.tempAnomalyCorrelation:'–')+'</td></tr>'; }).join('')+'</tbody></table></div>':'<div class="ol-meta">First weekly scores arrive 6 days after the first logged week ends; monthly scores after the first full month.</div>')
        +'<div class="ol-meta">'+esc(SR.reading)+'</div></div>'; }
    var O=state.unit&&state.unit.adjustment, st=null;
    h+='<div class="ol-box" style="margin-top:10px"><h3>Ensemble record and calibration</h3>';
    var E=C.ensemble||{};
    h+='<div>Runs logged: <b>'+(E.logs||0)+'</b>'+(E.firstIssue?' since '+esc(E.firstIssue):'')+' · verified forecast-observation pairs: <b>'+(E.verifiedPairs||0)+'</b>'+(E.firstScoreExpected&&!E.verifiedPairs?' · first scores expected '+esc(E.firstScoreExpected):'')+'</div>';
    var leads=E.leads||{}, ks=Object.keys(leads);
    if(ks.length){ h+='<div class="ol-tbl-wrap">'+tbl('Ensemble scores')+'<thead><tr><th>Lead</th><th>Pairs</th><th>Max inside 10–90%<small>target 80%</small></th><th>Median max error<small>MAE °C</small></th>'+TH_ORDER.map(function(k){return '<th>'+THS[k]+'<small>Brier skill</small></th>';}).join('')+'</tr></thead><tbody>';
      ks.forEach(function(L){ var x=leads[L]; h+='<tr><td>day '+L+'</td><td>'+x.pairs+'</td><td>'+(x.coverage10to90.tx!=null?x.coverage10to90.tx+'%':'–')+'</td><td>'+(x.maeMedian.tx!=null?x.maeMedian.tx:'–')+'</td>'+TH_ORDER.map(function(k){ var t=x.thresholds[k]; return '<td>'+(t&&t.events?(t.brierSkill!=null?t.brierSkill:'–')+' <span class="ol-meta">'+t.events+' ev</span>':'<span class="ol-meta">no events</span>')+'</td>'; }).join('')+'</tr>'; });
      h+='</tbody></table></div>'; }
    h+='<div class="ol-meta" style="margin-top:4px">'+esc(E.rule||'')+' No archive of past ensemble members exists, so the record starts with the first logged run.</div></div>';
    body(h);
  }
  function names(){ var N=state.nat&&state.nat.rows; if(!N) return ''; if(state.names) return state.names; state.names=N.map(function(r){ return '<option value="'+esc(r.name+' — '+r.district)+'">'; }).join(''); return state.names; }
  function chart(days,box){
    days=fromToday(days);    
    

    var bw0=box?Math.round(box.getBoundingClientRect().width):0;
    var W=Math.max(560,Math.min(1600,bw0>0?bw0:1000)),H=210,L=40,R=26,T=12,B=26,n=days.length, lo=1e9, hi=-1e9;
    days.forEach(function(d){ if(d.tx){ hi=Math.max(hi,d.tx[2]); lo=Math.min(lo,d.tx[0]); } if(d.tn){ hi=Math.max(hi,d.tn[2]); lo=Math.min(lo,d.tn[0]); } });
    if(lo>hi) return ''; lo=Math.floor(lo/5)*5-1; hi=Math.ceil(hi/5)*5+1;
    var x=function(i){ return L+(W-L-R)*(n<2?0.5:i/(n-1)); }, y=function(v){ return T+(H-T-B)*(1-(v-lo)/(hi-lo)); };
    function band(k,fill,line){ var up=[],dn=[],md=[]; days.forEach(function(d,i){ if(!d[k]) return; up.push(x(i).toFixed(1)+','+y(d[k][2]).toFixed(1)); dn.unshift(x(i).toFixed(1)+','+y(d[k][0]).toFixed(1)); md.push(x(i).toFixed(1)+','+y(d[k][1]).toFixed(1)); });
      return '<polygon points="'+up.concat(dn).join(' ')+'" fill="'+fill+'"/><polyline points="'+md.join(' ')+'" fill="none" stroke="'+line+'" stroke-width="2.2"/>'; }
    var g='';
    for(var v=Math.ceil(lo/5)*5; v<=hi; v+=5){ g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#edf1f4"/><text x="'+(L-6)+'" y="'+(y(v)+4)+'" font-size="11" text-anchor="end" fill="#5a6f7c">'+v+'°</text>'; }
    [40,45].forEach(function(t){ if(t>lo&&t<hi) g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(t)+'" y2="'+y(t)+'" stroke="#c0392b" stroke-dasharray="4 4" stroke-width="1"/>'; });
    days.forEach(function(d,i){ g+='<text x="'+x(i)+'" y="'+(H-8)+'" font-size="11" text-anchor="middle" fill="#5a6f7c">'+dlab(d.date)+'</text>'; if(i===4) g+='<line x1="'+((x(3)+x(4))/2)+'" x2="'+((x(3)+x(4))/2)+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#9fb1bd" stroke-dasharray="2 3"/><text x="'+((x(3)+x(4))/2+4)+'" y="'+(H-B-6)+'" font-size="10" fill="#5a6f7c">beyond the verified 72 h forecast</text>'; });
    g+=band('tx','rgba(214,96,77,.22)','#c0392b')+band('tn','rgba(67,147,195,.22)','#2166ac');
    var pmax=0; days.forEach(function(d){ if(d.pr) pmax=Math.max(pmax,d.pr[2]); }); var rain='';
    if(pmax>0.2){ var RH=70, top=Math.max(5,Math.ceil(pmax/5)*5), bw=(W-L-R)/n*0.5;
      days.forEach(function(d,i){ if(!d.pr) return; var h50=RH*d.pr[1]/top, h90=RH*d.pr[2]/top;
        rain+='<rect x="'+(x(i)-bw/2)+'" y="'+(RH-h50+4)+'" width="'+bw+'" height="'+Math.max(0,h50)+'" fill="#4a90b8"/><line x1="'+x(i)+'" x2="'+x(i)+'" y1="'+(RH-h90+4)+'" y2="'+(RH-h50+4)+'" stroke="#4a90b8" stroke-width="1.5"/><line x1="'+(x(i)-5)+'" x2="'+(x(i)+5)+'" y1="'+(RH-h90+4)+'" y2="'+(RH-h90+4)+'" stroke="#4a90b8" stroke-width="1.5"/>'; });
      rain='<svg viewBox="0 0 '+W+' '+(RH+8)+'" aria-label="Daily rain"><text x="'+(L+4)+'" y="12" font-size="11" fill="#5a6f7c">'+top+' mm</text><line x1="'+L+'" x2="'+(W-R)+'" y1="'+(RH+4)+'" y2="'+(RH+4)+'" stroke="#c9d5de"/>'+rain+'</svg><div class="ol-meta">Rain: bar = median, whisker = 90th percentile (wet case).</div>'; }
    else rain='<div class="ol-meta">Rain: all members dry or under 0.2 mm on every day.</div>';
    return '<svg viewBox="0 0 '+W+' '+H+'" aria-label="Daily max and min temperature">'+g+'</svg><div class="ol-meta"><span style="color:#c0392b">■</span> daily max &nbsp; <span style="color:#2166ac">■</span> daily min &nbsp; dashed red = 40 and 45 °C</div>'+rain;
  }
  function sun(S){
    if(!S) return '<div class="ol-box" style="margin-top:10px"><h3>Sunshine check (satellite vs model)</h3><div class="ol-meta">Not run yet. It refreshes every hour.</div></div>';
    var t=S.today, h='<div class="ol-box" style="margin-top:10px"><h3>Sunshine check: satellite vs forecast model</h3>';
    if(t){ h+='<div class="ol-row"><span class="ol-big">'+(t.anomaly!=null?Math.round(t.anomaly*100)+'%':'–')+'</span><span>of the usual satellite/model ratio today, to '+esc((S.lastHour||'').slice(11))+' local ('+t.sat_mj+' vs '+t.model_mj+' MJ/m², '+t.hours+' h matched)</span></div><div><b>'+esc(t.verdict||'')+'</b></div>'; }
    if(S.past&&S.past.length){ h+='<div class="ol-meta" style="margin-top:4px">Previous days: '+S.past.map(function(d){ return dlab(d.date)+' '+(d.anomaly!=null?Math.round(d.anomaly*100)+'%':'–'); }).join(' · ')+'</div>'; }
    h+='<div class="ol-meta" style="margin-top:4px">Satellite shortwave (about 1 h behind real time) divided by the model’s shortwave for the same hours, compared with this tehsil’s median over the last 15 days ('+(S.typicalRatio!=null?S.typicalRatio:'n/a')+'). Below 85% means cloud the model missed.</div></div>';
    return h;
  }
  function natEvents(N){
    var V=N.events; if(!V||!V.counts) return '';
    var h='<h3 style="margin:0 0 6px;font-size:14px;color:#0C3851">Multi-day events, '+esc(dlab(V.window[0]))+' to '+esc(dlab(V.window[1]))+' (member by member)</h3><div class="ol-grid">';
    EV_ORDER.forEach(function(k){ var c=V.counts[k]; if(!c) return; var top=V.top[k]||[];
      h+='<div class="ol-box"><h3>'+EVS[k]+'</h3><div><span class="ol-big">'+c.likely+'</span> likely · '+c.any+' possible</div>'+(top.length?(tbl(EVS[k]+' top tehsils')+'<tbody>'+top.slice(0,6).map(function(r){ return '<tr><td><span class="ol-link" data-unit="'+esc(r.unitId)+'">'+esc(r.name)+'</span> <span class="ol-meta">'+esc(r.district)+'</span></td><td class="ol-meta">'+(r.onset?dlab(r.onset):'')+'</td>'+cell(r.prob)+'</tr>'; }).join('')+'</tbody></table>'):'<div class="ol-meta">No tehsil above 0%.</div>')+'</div>'; });
    return h+'</div>';
  }
  function renderNat(){
    var N=state.nat; if(!N) return body('<p class="ol-meta">Loading…</p>'); if(!N.ready) return body('<div class="ol-note ol-warn">The ensemble run has not completed yet.</div>');
    var h=natEvents(N)+'<h3 style="margin:14px 0 6px;font-size:14px;color:#0C3851">Single-day thresholds</h3><div class="ol-row ol-days">'+N.days.map(function(d,i){ return '<button data-day="'+i+'" class="'+(i===N.dayIndex?'on':'')+'">'+dlab(d)+'</button>'; }).join('')+'</div>';
    h+='<div class="ol-meta">'+N.tehsils+' tehsils · global ensemble updated '+ago(N.at)+' · '+esc(N.date)+'. "Likely" = at least half of the members; "possible" = at least 10%. Click a tehsil for its detail.</div><div class="ol-grid" style="margin-top:8px">';
    TH_ORDER.forEach(function(k){ var c=N.counts[k], top=N.top[k]||[];
      h+='<div class="ol-box"><h3>'+TH[k]+'</h3><div><span class="ol-big">'+c.likely+'</span> likely · '+c.any+' possible</div>'+(top.length?(tbl(TH[k]+' top tehsils')+'<tbody>'+top.slice(0,8).map(function(r){ return '<tr><td><span class="ol-link" data-unit="'+esc(r.unitId)+'">'+esc(r.name)+'</span> <span class="ol-meta">'+esc(r.district)+'</span></td><td>'+r.median+'</td>'+cell(r.prob)+'</tr>'; }).join('')+'</tbody></table>'):'<div class="ol-meta">No tehsil above 0%.</div>')+'</div>'; });
    h+='</div><div class="ol-note">Raw ensemble shares, not calibrated probabilities and not warnings. Operational action needs an authorised decision.</div>';
    body(h);
  }
  

  var IN={tab:'d15',last:'d15',unit:null,sea:null,loc:null};
  function inlineShow(k){ if(['d15','weeks','season','air'].indexOf(k)<0) return; if(k!=='air') IN.last=k; IN.tab=k; var c=document.getElementById('agnOutlookInline'); if(!c) return;
    c.querySelectorAll('[data-in]').forEach(function(b){ var on=b.getAttribute('data-in')===k; b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false'); }); drawInline(); }
  window.AGN=window.AGN||{}; window.AGN.outlookInline={show:inlineShow};
  (function healthBadge(){ function upd(){ get('/api/ops/health').then(function(hh){ try{ window.__agnOpsHealth=hh; }catch(_){} var b=document.getElementById('agnOutlookBtn'); if(!b||!hh) return; var n=(hh.stale||[]).length;
      b.textContent='Outlook: 15 days · weeks · season · air'+(n?' · '+n+' job'+(n>1?'s':'')+' late':''); b.style.background=n?'#9b2c2c':''; b.title=n?('Late: '+hh.stale.join(', ')+'. Open Checks for details.'):'Ensemble outlook, weeks ahead, season ahead, air and smog'; }); }
    setTimeout(upd,4000); setInterval(upd,5*60000); })();
  function mountInline(n){
    var anchor=document.getElementById('agnEnsSection');
    if(!anchor) return n<60&&setTimeout(function(){mountInline(n+1);},1000);
    if(document.getElementById('agnOutlookInline')) return;
    var c=document.createElement('section'); c.className='card'; c.id='agnOutlookInline'; c.setAttribute('aria-label','Outlook: 15 days, weeks ahead, season ahead');
    c.innerHTML='<div class="ol-row" style="justify-content:space-between"><div><div style="font-size:0.75rem;letter-spacing:.09em;font-weight:900;color:#0C3851;opacity:.66">15-day ensemble · weeks-ahead ensemble · seasonal ensemble</div><h3 style="margin:2px 0 0;color:#0C3851">Outlook: next 15 days, weeks 1–6, season ahead <span class="ol-meta" id="olInPlace"></span></h3></div><div class="ol-tabs"><button data-in="air" aria-pressed="false">Air &amp; smog</button> <button data-in-open="1">National view</button></div></div><div class="ol-inbody"><p class="ol-meta">Loading…</p></div>';
    

    var deck=anchor.closest&&anchor.closest('.view')?anchor.closest('.view').querySelector(':scope > section.premium-deck'):null;
    if(deck) deck.parentNode.insertBefore(c, deck.nextSibling); else anchor.parentNode.insertBefore(c, anchor.nextSibling);
    c.addEventListener('click',function(e){ var t=e.target.closest&&e.target.closest('[data-in]'); if(t){ var k=t.getAttribute('data-in'); inlineShow(k==='air'&&IN.tab==='air'?(IN.last||'d15'):k); }
      if(e.target.closest&&e.target.closest('[data-in-open]')){ open(); state.tab=IN.tab==='d15'?'nat':IN.tab==='air'?'air':'sea'; if(state.tab==='sea') loadSea(IN.unit&&IN.unit.unit&&IN.unit.unit.unitId); if(state.tab==='air') loadAir(IN.unit&&IN.unit.unit&&IN.unit.unit.unitId); render(); } });
    refreshInline();
    document.addEventListener('agn:location',function(){ setTimeout(refreshInline,1200); });
     
    function fit(){ if(IN.tab!=='d15') return; var sv=c.querySelector('.ol-inbody svg'), bx=c.querySelector('.ol-inbody'); if(!sv||!bx) return; var bw=bx.getBoundingClientRect().width, vb=+(String(sv.getAttribute('viewBox')||'').split(' ')[2]||0);
      if(bw>0&&vb>0&&Math.abs(Math.max(560,Math.min(1600,Math.round(bw)))-vb)>24) drawInline(); }
    document.addEventListener('agn:view',function(){ setTimeout(fit,300); }); window.addEventListener('resize',function(){ clearTimeout(fit.t); fit.t=setTimeout(fit,250); });
    setInterval(function(){ var s=selectedName(); if(s&&(s!==IN.loc||here()!==IN.hp)) refreshInline(); }, 5000);
  }
  /* v91.17.266 · asked by the point (lat/lon) first; the status is kept so a failed or slow answer is not read as "no tehsil" */
  /* v91.17.283.19 · the selected place's outlook, seasonal and air parts from the page store (GET /api/point, once per place) */
  function herePos(){ try{ var a=AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null; if(a&&a.lat!=null&&a.lon!=null&&isFinite(+a.lat)&&isFinite(+a.lon)) return {lat:+a.lat,lon:+a.lon}; }catch(_){} try{ var L=AGN.flow&&AGN.flow.location?AGN.flow.location():null; if(L&&L.lat!=null&&L.lon!=null&&isFinite(+L.lat)&&isFinite(+L.lon)) return {lat:+L.lat,lon:+L.lon}; }catch(_){} return null; }
  function refreshInline(){
    var s=selectedName()||'', pt=herePos(); if(!pt) return; var key=s+'|'+pt.lat.toFixed(4)+','+pt.lon.toFixed(4);
    if(IN.key!==key){ IN.key=key; IN.unit=null; IN.unitState='loading'; }
    IN.loc=s; IN.hp=here();
    var PS=AGN.pointState, ok=function(v){ return v&&!v.unavailable&&v.ready!==false&&!v.error; };
    PS.part('outlook',pt.lat,pt.lon).then(function(v){ if(IN.key!==key) return;
      if(ok(v)){ IN.unit=v; IN.unitState='ok'; } else { IN.unit=null; IN.unitState=v&&/no tehsil/.test(String(v.why||''))?'nomatch':'failed'; }
      drawInline(); });
    PS.part('seasonal',pt.lat,pt.lon).then(function(v){ if(IN.key!==key) return; IN.sea=ok(v)?v:{error:true}; drawInline(); });
    PS.part('smog',pt.lat,pt.lon).then(function(v){ if(IN.key!==key) return; IN.air=ok(v)?v:{error:true}; drawInline(); });
  }
  function drawInline(){
    var c=document.getElementById('agnOutlookInline'); if(!c) return; var b=c.querySelector('.ol-inbody'), h='';
    var pl=document.getElementById('olInPlace'), uu=IN.unit&&IN.unit.unit;
    if(pl) pl.textContent=uu?('· '+(IN.loc&&IN.loc!==uu.name?IN.loc+' · ':'')+uu.name+' tehsil, '+uu.district+' district'):(IN.loc?'· '+IN.loc:'');
    if(IN.tab==='air'){ b.innerHTML=airHtml(IN.air,false,null); return; }
    if(IN.tab==='d15'){
      var U=IN.unit; if(!U||!U.ensemble){ b.innerHTML='<p class="ol-meta">'+(U?'The 15-day forecast runs for '+esc(uu.name)+' tehsil are not available right now.'
        :IN.unitState==='nomatch'?'This place is outside the tehsils NIGRAAN covers, so there is no 15-day outlook for it.'
        :IN.unitState==='failed'?'The 15-day outlook is not available right now (the server did not answer).'
        :'Loading the 15-day outlook…')+'</p>'; return; }
      h+=chart(U.ensemble.days,b)+events(U);
      h+='<div class="ol-meta">global forecast model ensemble, '+U.ensemble.members+' members, updated '+ago(U.ensemble.at)+'.'+staleRun(U.ensemble)+adjNote(U.adjustment)+' Chances are shares of members, not yet calibrated.</div>';
    } else {
      var S=IN.sea; if(!S||S.error){ b.innerHTML='<p class="ol-meta">'+(S?'Weeks 1–6 and the season ahead are not available right now (they refresh every 12 hours).':'Loading weeks 1–6 and the season ahead…')+'</p>'; return; }
      var html=seaHtml(S,null,false), parts=html.split('<div class="ol-box" style="margin-top:10px">');
      h+= IN.tab==='weeks' ? parts[0].replace(/^[\s\S]*?(<div class="ol-box">)/,'$1') : ('<div class="ol-box">'+(parts[1]||''));
    }
    b.innerHTML=h;
  }
   
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ mount(); mountInline(0); }); else { mount(); mountInline(0); }
})();
