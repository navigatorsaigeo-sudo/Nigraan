
(function(){
  

  var D=document, BASE=location.origin, timer=null, sortKey='place', sortDir=1, LAST=null, showAll=false;
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function n1(v){ return v==null||!isFinite(v)?'—':(Math.round(v*10)/10).toFixed(1); }
  function n0(v){ return v==null||!isFinite(v)?'—':String(Math.round(v)); }
  function get(p){ return fetch(BASE+p,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }); }
  function view(){
    if(D.getElementById('agnObsSection')) return;
    var ml=D.querySelector('.view[data-view="livedata"]'); if(!ml) return;
    var v=D.createElement('section'); v.id='agnObsSection'; v.className='agn-obs-sec';
    v.innerHTML='<div class="agn-obs-head"><div><h2>Observations · the MACH fleet</h2><p>AGN’s own weather stations across Pakistan, read every 10 minutes. Only readings that pass our quality checks are used; they are a live check on the forecast, not a replacement for it.</p><p class="agn-op-only">Operator · five-rule screen (dead, mirrored record, imperial units, physics, forecast-not-station). Consumer-grade and roof-sited: shown beside the forecast as the fresh check on the correction, never as the reference. The screened readings and their forecast pairs go to the station lake.</p></div><div class="agn-obs-note" id="agnObsStamp">—</div></div>'
      +'<div class="agn-obs-kpis" id="agnObsKpis"></div>'
      +'<div class="agn-obs-grid"><div>'
            +'<div class="agn-obs-card agn-obs-card-2 agn-op-only"><h3>Fleet against the forecast, now</h3><p class="sub">Forecast minus fleet reading at the reading hour, usable stations only. Raw is the provider’s number; served is what this dashboard shows. A negative bias on a sunny afternoon is partly the unshielded sensor, not the model.</p><div class="agn-obs-strip" id="agnObsStrip"></div><div class="agn-obs-city" id="agnObsCity"></div><div class="agn-obs-note" id="agnObsPairs"></div></div>'
      +'</div><div>'
      +'<div class="agn-obs-card"><h3>Stations</h3><p class="sub">Latest readings. Click a heading to sort. <button type="button" class="agn-obs-all" id="agnObsAll" aria-pressed="false">Show all stations</button></p><div class="agn-obs-wrap"><table class="agn-obs-table" id="agnObsTable"><thead><tr><th data-k="no">MACH</th><th data-k="place" title="Sort by city (Islamabad first), then MACH number">Station</th><th data-k="ageMin">Last reading</th><th data-k="tempC">T °C</th><th data-k="rhPct">RH %</th><th data-k="dewC">Dew point °C</th><th data-k="windKmh">Wind km/h</th><th data-k="precipRateMm">Rain mm/h</th><th data-k="usable">Status</th></tr></thead><tbody></tbody></table></div></div>'
      +'<div class="agn-obs-card agn-obs-card-2 agn-op-only"><h3>What the served temperature stands on</h3><p class="sub">The height it is served at, and the live check against AGN\u2019s own stations.</p><div class="agn-obs-corr" id="agnObsCorr"></div></div>'
      +'</div></div>';
    ml.appendChild(v);
    v.querySelector('#agnObsAll').addEventListener('click',function(){ showAll=!showAll; this.setAttribute('aria-pressed',showAll?'true':'false'); if(LAST) table(LAST.latest); });
    v.querySelector('#agnObsTable thead').addEventListener('click',function(e){ var th=e.target.closest('th'); if(!th) return; var k=th.dataset.k; if(sortKey===k) sortDir=-sortDir; else { sortKey=k; sortDir=1; } if(LAST) table(LAST.latest); });
  }
  function colour(r){ if(r.usable) return '#0f766e'; var q=r.qc||[]; if(q.indexOf('dead')>=0) return '#ffffff'; if(q.indexOf('mirrored')>=0) return '#5b6670'; if(q.indexOf('imperial')>=0) return '#a78bfa'; return '#c4c9ce'; }    
   
  function ageTxt(m){ if(m==null||!isFinite(m)) return '\u2014'; if(m<60) return Math.round(m)+' min'; if(m<48*60) return Math.round(m/60)+' h'; return Math.round(m/1440)+' days'; }
  function plain(r){  
    /* v91.17.266 · the station check from the server: Checked / Not yet checked / Site problem, not used / Silent since <time PKT> */
    var L=(window.AGN&&AGN.stationStatus)?AGN.stationStatus.label(r):null;
    if(L) return {t:L.text,c:L.status==='checked'?'ok':L.status==='not-yet-checked'?'warn':L.status==='silent'?'dead':'',note:L.note};
    if(r.pending) return {t:'\u2014',c:'',note:'Not read yet: the server has just started'};   /* v91.17.278.1 · FIX2781 */
    if(r.usable && (r.trusted===false || (r.qc&&r.qc.length))) return {t:'Not yet checked',c:'warn'};
    if(r.usable) return (r.ageMin!=null&&r.ageMin>20)?{t:'Recent ('+ageTxt(r.ageMin)+' ago)',c:'ok'}:{t:'Reporting',c:'ok'};     var q=r.qc||[], has=function(re){ return q.some(function(x){ return re.test(x); }); };
    if(has(/^dead$/)) return {t:'Offline '+ageTxt(r.ageMin),c:'dead'};
    if(has(/^mirrored$/)) return {t:'Duplicate of another station',c:'mirror'};
    if(has(/^no-reading$/)) return {t:'No reading',c:''};
    if(has(/^forecast-not-station$/)) return {t:'Not a station reading',c:''};
    if(has(/physics|inconsistent/)) return {t:'Failed quality check',c:''};
    if(has(/imperial|units/)) return {t:'Units not verified',c:''};
    return {t:q.length?'Failed quality check':'No reading',c:''}; }
  function rawFlags(r){ return (r.qc||[]).map(function(q){ return esc(q)+(q==='mirrored'&&r.mirrorOf?' of '+esc(r.mirrorOf):''); }).join(', '); }
  function flags(r){ var p=plain(r); return '<span class="agn-obs-flag '+p.c+'"'+(p.note?' title="'+esc(p.note)+'"':'')+'>'+esc(p.t)+'</span>'+(r.usable?'':'<span class="agn-op-only agn-obs-raw"> '+rawFlags(r)+'</span>'); }
  function table(latest){
    var tb=D.querySelector('#agnObsTable tbody'); if(!tb) return; var rows=(latest&&latest.rows||[]).slice();
    /* v91.17.266 · registered stations that sent nothing in the latest poll are listed under Show all with their status */
    try{ var CK=(window.AGN&&AGN.stationStatus&&AGN.stationStatus.list())||[], have={}; rows.forEach(function(r){ if(r.key) have['k'+r.key]=1; if(r.no!=null) have['n'+r.no]=1; });
      CK.forEach(function(s){ if(have['k'+s.key]||(s.no!=null&&have['n'+s.no])) return; rows.push({key:s.key,no:s.no,name:s.name,usable:false,ageMin:null,qc:[],status:s.status,statusNote:s.statusNote,silentSince:s.silentSince||null,pending:!!s.pending,__check:1}); }); }catch(_){}
    

    var CITY0=['Islamabad','Rawalpindi','Karachi','Lahore'];
    rows.forEach(function(r){ var p=String(r.name||'').replace(/[\s,;]+$/,'').split(','), c=(p.length>1?p[p.length-1]:p[0]).trim(), i=CITY0.indexOf(c);
      r.place=(i<0?'9 '+c:i+' '+c)+' '+('000'+(r.no!=null?r.no:999)).slice(-3); });
    rows.sort(function(a,b){ var x=a[sortKey],y=b[sortKey]; if(x==null&&y==null) return 0; if(x==null) return 1; if(y==null) return -1; if(typeof x==='boolean') return (x===y?0:x?-1:1)*sortDir; if(typeof x==='number') return (x-y)*sortDir; return String(x).localeCompare(String(y))*sortDir; });
    var nAll=rows.length, nOk=rows.filter(function(r){ return r.usable; }).length; if(!showAll) rows=rows.filter(function(r){ return r.usable; });
    var bt=D.getElementById('agnObsAll'), nUnloc=(LAST&&LAST.status&&LAST.status.unlocated)||0;
    if(bt){ bt.hidden=(nAll===0||nAll===nOk); bt.textContent=showAll?('Show usable stations only ('+nOk+')'):('Show all '+nAll+' stations'+(nUnloc?' with a recorded position (of '+(nAll+nUnloc)+' in the network)':'')); }
     
    var rd=function(r,v){ return r.usable?v:'<span class="agn-cust-dash">\u2014</span><span class="agn-op-only">'+v+'</span>'; };
    tb.innerHTML=rows.map(function(r){ return '<tr class="'+(r.usable?'':'bad')+'"><td>'+esc(r.no||'')+'</td><td>'+esc(String(r.name||'').replace(/[\s,;]+$/,''))+'</td><td>'+(r.__check?'\u2014':ageTxt(r.ageMin)+' ago<span class="agn-op-only"> ('+n0(r.ageMin)+' min)</span>')+'</td><td>'+rd(r,n1(r.tempC))+'</td><td>'+rd(r,n0(r.rhPct))+'</td><td>'+rd(r,n1(r.dewC))+'</td><td>'+rd(r,n0(r.windKmh))+'</td><td>'+rd(r,n1(r.precipRateMm))+'</td><td>'+flags(r)+'</td></tr>'; }).join('')||'<tr><td colspan="9">'+(nAll?'No station passed the quality checks in the latest poll.':'Station readings are not available right now.')+'</td></tr>';
  }
   
  function pkt(t){ try{ var d=new Date(t); if(isNaN(d)) return ''; var p={}; new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).forEach(function(x){ p[x.type]=x.value; }); return p.day+' '+p.month+' '+p.hour+':'+p.minute+' PKT'; }catch(_){ return ''; } }
  function render(st, latest, pairs, mos){
    LAST={status:st,latest:latest,pairs:pairs,mos:mos};
    var k=D.getElementById('agnObsKpis'); if(!k) return; var sc=(st&&st.screened)||{};
    var rows=(latest&&latest.rows)||[];
    var dead=rows.filter(function(r){ return (r.qc||[]).indexOf('dead')>=0; }).length;
     
    

    var nowN=rows.filter(function(r){ return r.usable && r.ageMin!=null && r.ageMin<=20; }).length, recentN=rows.filter(function(r){ return r.usable && r.ageMin!=null && r.ageMin>20; }).length;
    k.innerHTML=[['Reporting now',rows.length?nowN:(st?st.usable:'—'),'reading within 20 min, checks passed',''],['Recent',recentN,'last reading 20-60 min ago',''],['Stations',st?(st.registered||st.stations):'—',(st&&st.unlocated?'in the MACH network ('+st.unlocated+' without a recorded position)':'in the MACH network'),''],['Offline',dead,'no reading for over 60 min','agn-op-only'],['Mirrored',sc.mirrored||0,'serving another station’s record','agn-op-only'],['Imperial',sc.imperial||0,'°F / inHg / mph unconverted','agn-op-only'],['Polls',st?st.polls:'—','every '+(st&&st.pollMinutes||10)+' min since start','agn-op-only'],['Pairs in the lake',pairs?pairs.pairs:'—','station-hours this session','agn-op-only']]
      .map(function(x){ return '<div class="agn-obs-kpi '+x[3]+'"><b>'+esc(x[1])+'</b> <span>'+esc(x[0])+' · '+esc(x[2])+'</span></div>'; }).join(' ');
    D.getElementById('agnObsStamp').innerHTML=st&&st.lastAt?('Updated '+esc(pkt(st.lastAt))+(st.lastError?'<span class="agn-op-only"> · last error: '+esc(st.lastError)+'</span>':'')):(st&&st.configured===false?'Station readings are not available on this server<span class="agn-op-only"> (fleet.key not present: the poll is off)</span>':'Waiting for the first reading');
    table(latest);
    var now=pairs&&pairs.now, s=D.getElementById('agnObsStrip'), c=D.getElementById('agnObsCity');
    if(now){ s.innerHTML='<div><b>'+esc(now.n)+'</b>stations paired</div><div><b>'+(now.biasRaw>0?'+':'')+n1(now.biasRaw)+'</b>raw bias °C</div><div><b>'+(now.biasServed>0?'+':'')+n1(now.biasServed)+'</b>served bias °C</div><div><b>'+n1(now.maeRaw)+'</b>raw MAE °C</div><div><b>'+n1(now.maeServed)+'</b>served MAE °C</div>';
      c.innerHTML=Object.keys(now.byCity||{}).sort().map(function(city){ var v=now.byCity[city]; return '<span>'+esc(city)+' · '+(v.biasServed>0?'+':'')+n1(v.biasServed)+' ('+v.n+')</span>'; }).join(''); }
    else { s.innerHTML='<div><b>—</b>no pairs yet</div>'; c.innerHTML=''; }
    D.getElementById('agnObsPairs').classList.add('agn-op-only'); D.getElementById('agnObsPairs').textContent=pairs?('One provider call per usable station every '+pairs.refreshHours+' h; '+pairs.calls+' calls this session'+(pairs.file?' · '+pairs.file.replace(/^.*[\\\/]/,''):'')+(pairs.lastError?' · '+pairs.lastError:'')):'';
    

    var cr=D.getElementById('agnObsCorr'), t=mos&&mos.table, ml=mos&&mos.table&&mos.table.learned, IR=!!window.AGN_INTERNAL_REF;
    cr.innerHTML=[
      '<div><b>Height</b> · each tehsil\u2019s temperature is served at its population-weighted settlement height (Copernicus DEM GLO-90, population grid), not at the model grid height.</div>',
      '<div><b>This fleet</b> · the live check: '+(now?esc(now.n)+' MACH stations paired with the forecast at the reading hour; served error '+n1(now.maeServed)+' °C (raw '+n1(now.maeRaw)+' °C)':'MACH pairs appear after the next poll')+'. MACH is AGN\u2019s own network.</div>',
      IR?('<div><b>Station calibration (internal)</b> · '+(t?t.stations:'—')+' mountain and '+(t?t.synop_stations:'—')+' plains reference stations; learned model '+(ml&&ml.trees?ml.trees+' trees on '+ml.rows.toLocaleString()+' pairs':'not loaded')+'. Figures in the internal skill sheet.</div>'):''
    ].join('');
  }
  function tick(){ Promise.all([get('/api/fleet/status'),get('/api/fleet/latest'),get('/api/fleet/pairs'),get('/api/mos/status')]).then(function(a){ render(a[0],a[1],a[2],a[3]); }); }
  function active(){ var v=D.querySelector('.view[data-view="livedata"]'); return !!(v&&v.classList.contains('active')); }
  D.addEventListener('agn:station-status',function(){ if(LAST) table(LAST.latest); });
  function boot(){ view(); D.addEventListener('agn:view',function(e){ if(e.detail&&e.detail.view==='livedata'){ var s=D.getElementById('agnObsSection'); if(s&&s.parentNode&&s.parentNode.lastElementChild!==s) s.parentNode.appendChild(s); tick(); if(!timer) timer=setInterval(function(){ if(active()) tick(); },60000); } }); }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',function(){ setTimeout(boot,400); }); else setTimeout(boot,400);
  setTimeout(boot,3000);

  

  (function corr(){ var el=null;
    function pt(){ try{ var a=window.AGN&&AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null; return a&&a.lat!=null?{lat:+a.lat,lon:+a.lon}:null; }catch(_){ return null; } }   /* the selected place */
    function host(){ el=el||D.getElementById('agnMosLine'); if(el) return el; var f=D.getElementById('agnFleetNearby'); if(!f) return null; el=D.createElement('div'); el.id='agnMosLine'; el.className='agn-mos-line'; el.hidden=true; f.insertAdjacentElement('afterend',el); return el; }
    function draw(j){ var e=host(); if(!e) return; if(!j||!j.applied){ e.hidden=false; e.innerHTML='<b>Correction here</b> · none for this hour <i>'+esc(j&&j.why?j.why:'no station table covers this point')+'; the provider’s own number is shown</i>'; return; }
      

      var IR=!!window.AGN_INTERNAL_REF;
      var src=esc(j.source||'served chain');
      e.hidden=false; e.innerHTML='<b>Correction here</b> · '+(j.adj>0?'+':'')+n1(j.adj)+' °C this hour · '+src+(IR&&j.station?' · '+esc(j.station)+' · '+esc(j.km)+' km':'')+(IR&&j.holdout?' <i>hold-out '+j.holdout.raw_mae+' → '+j.holdout.mae+' °C</i>':''); }
    function tick(){ if(!D.documentElement.classList.contains('agn-operator')){ var _e=host(); if(_e) _e.hidden=true; return; }   /* v91.17.283.12: operator view only (the station-correction table of the point) */
      /* v91.17.283.19 · the correction at the place is its record's: the chain's steps and the raw-to-served difference of this hour */
      var p=pt(); if(!p) return; AGN.pointState.bundle(p.lat,p.lon).then(function(B){ var b=B&&B.build, ch=(B&&B.source&&B.source.chain||[]).slice(1);
        draw(b&&b.totalDeltaC!=null?{applied:Math.abs(b.totalDeltaC)>=0.05, adj:b.totalDeltaC, source:ch.join(', ')||'served chain', why:b.totalDeltaC==null?'no raw value':null}:{applied:false, why:'the raw value of this hour is not held'}); }); }
    setTimeout(tick,6500); setInterval(tick,10*60000); D.addEventListener('agn:data',function(){ setTimeout(tick,1800); }); })();
})();
