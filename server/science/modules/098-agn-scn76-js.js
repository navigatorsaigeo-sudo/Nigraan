


/* v91.17.283.29 · W1 · THE SCENARIO PANEL PRINTS THE SERVER'S SCENARIO RUN (GET /api/scenario, server/api/scenario.mjs). The page computes
   no level: the presets, the slider bounds and every level (baseline and scenario, per hazard, days 0-3 at the place's own point) come from
   the server, which scores the place record's hours as perturbed by the delta method (the same scoring as the place record, placerecord.mjs
   siteLevels). The page-side input perturbation, rain-shape split, landslide-odds call and the climate-threshold presets are deleted.
   Exposure only: levels per hazard, no downtime, damage or loss figure. */
(function(){
  'use strict';
  var D=document, W=window;
  var HZ=[['heat','Heat stress'],['cold','Cold stress (UTCI)'],['wind','Wind and gusts'],['rain','Heavy rain'],['flood','Flood'],['landslide','Landslide'],['drought','Drought']];
  var TEHSIL_HZ=[['flood','Flood'],['rain_hz','Heavy rain'],['landslide','Landslide'],['glof','Glacial lake outburst flood (GLOF)'],['heat','Heat stress'],['cold','Cold stress (UTCI)'],['wind','Wind and gusts'],['drought','Drought']];
  var WORDS=['Normal','Low','Moderate','High','Severe'];
  var st={place:null,preset:'baseline',dT:0,rainMm:0,rainDay:null,gustKmh:0,gustDay:null,built:false,res:{},inflight:0,last:null,meta:null};
  function num(v){ return (v==null||v===''||!isFinite(Number(v)))?null:Number(v); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function sites(){ try{ var p=W.AGN&&AGN.project&&AGN.project.state?AGN.project.state():null; return ((p&&p.assets)||[]).filter(function(a){ return a&&a.asset_id&&num(a.latitude)!=null&&num(a.longitude)!=null; })
      .map(function(a){ return {id:'asset:'+a.asset_id, name:String(a.name||a.asset_name||a.asset_id).replace(/\s*\((AJG Supplies)\)\s*$/,''), lat:num(a.latitude), lon:num(a.longitude), site:true}; }); }catch(_){ return []; } }
  /* v91.17.273 · the place chosen at the top of the page (AGN.flow.location) is the Scenario place */
  function flowPlace(){ try{ var L=W.AGN&&AGN.flow&&AGN.flow.location?AGN.flow.location():null, la=num(L&&L.lat), lo=num(L&&L.lon); if(!L||!L.name||la==null||lo==null) return null;
      var nm=null; try{ nm=AGN.place&&AGN.place.name?AGN.place.name():null; }catch(_){}
      return {id:'place:'+la.toFixed(5)+','+lo.toFixed(5), name:String(nm||L.name), lat:la, lon:lo}; }catch(_){ return null; } }
  function stations(){ var a=[]; try{ a=(W.STATIONS||[]).filter(function(s){return s&&s.id;}); }catch(_){ a=[]; } var f=flowPlace(); return sites().concat(f?[f]:[],a); }
  function subjectPlace(){ try{ var p=AGN.project.state(), id=p&&p.company&&p.company.active_asset_id; if(id&&stationById('asset:'+id)) return 'asset:'+id; }catch(_){} return null; }
  function unitOf(s){ try{ if(typeof W.aiStationDistrict==='function'){ var k=W.aiStationDistrict(s); if(k&&W.DISTRICT_IN&&W.DISTRICT_IN[k]) return k; } }catch(_){} return (s&&W.DISTRICT_IN&&W.DISTRICT_IN[s.name])?s.name:null; }
  function stationById(id){ var a=stations(); for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null; }
  function placeFromFlow(){ try{ var L=W.AGN&&AGN.flow&&AGN.flow.location?AGN.flow.location():null, nm=String(L&&L.name||'').trim().toLowerCase(); if(!nm) return null;
      var a=(W.STATIONS||[]).filter(function(s){ return s&&s.id&&s.name; }), i;
      for(i=0;i<a.length;i++) if(String(a[i].name).toLowerCase()===nm) return a[i].id;
      var f=flowPlace(); if(f) return f.id; }catch(_){} return null; }
  function globalPlace(){ var f=placeFromFlow(); if(f) return f; try{ var id=W.activeStationId&&W.activeStationId(); if(id&&stationById(id)) return id; }catch(_){} return null; }
  function defaultPlace(){ var a=stations(); if(!a.length) return null; var sp=subjectPlace(); if(sp) return sp; var gp=globalPlace(); if(gp) return gp;
    try{ var c=W.AGN&&AGN.context&&AGN.context.read?AGN.context.read():null, loc=String(c&&c.location||''); for(var i=0;i<a.length;i++) if(loc && loc.indexOf(a[i].name)===0) return a[i].id; }catch(_){}
    return null; }   /* v283.36 item 14: no first-station default: the Lab waits for a place */
  /* the scenario place row stands for the selected place: its point is the selected place's point */
  function at(s){ try{ var a=AGN.data&&AGN.data.activePoint&&AGN.data.activePoint(); if(a&&a.lat!=null&&s&&globalPlace()===s.id) return {lat:+a.lat,lon:+a.lon}; }catch(_){} return s; }
  function pt(s){ var p=at(s); return p&&num(p.lat)!=null&&num(p.lon)!=null?{lat:(+p.lat).toFixed(5),lon:(+p.lon).toFixed(5)}:null; }
  /* the request: a server preset, or the user's own changes (only those set) */
  function query(s){ var p=pt(s); if(!p) return null; var q='lat='+p.lat+'&lon='+p.lon+(st.wetPct!=null?'&wetPct='+st.wetPct:'');   /* v283.33 · the flood outcome's ground wetness */
    if(st.preset!=='custom') return q+'&preset='+encodeURIComponent(st.preset||'baseline')+(st.rainDay?'&rainDay='+st.rainDay:'');   /* v283.33 · a rain-day preset falls on the selected date */
    if(st.dT) q+='&dT='+st.dT; if(st.rainMm>0) q+='&rainMm='+st.rainMm+(st.rainDay?'&rainDay='+st.rainDay:''); if(st.gustKmh>0) q+='&gustKmh='+st.gustKmh+(st.gustDay?'&gustDay='+st.gustDay:'');
    return q; }
  function load(s){ var q=query(s); if(!q) return null; var c=st.res[q]; if(c!==undefined) return c; st.res[q]=null; st.inflight++;
    fetch('/api/scenario?'+q,{cache:'no-store'}).then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return j||{ok:false,why:'HTTP '+r.status}; }); })
      .catch(function(){ return {ok:false,why:'the server did not answer the scenario run'}; })
      .then(function(j){ st.res[q]=j; if(j&&j.presets) st.meta={presets:j.presets,bounds:j.bounds||{},boundsSource:j.boundsSource||'',presetSource:j.presetSource||''}; st.inflight--; if(st.built) render(); });
    return null; }
  /* v91.17.283.29 · opening the Scenario tab makes no request: the "Now" column is the place bundle's own siteLevels part (the same values the
     server's scenario baseline returns; tests28328/consistency). The server scenario run (GET /api/scenario) is asked only when the user
     loads the stress tests, picks one or moves a slider. */
  function fromBundle(s){ var p=pt(s); if(!p) return null; var B=null; try{ B=AGN.pointState&&AGN.pointState.peek?AGN.pointState.peek(+p.lat,+p.lon):null; }catch(_){ B=null; }
    var x=B&&B.parts&&B.parts.siteLevels;
    if(!x||x.pending||!x.v){ var kk=p.lat+','+p.lon; if(!st.waitPart) st.waitPart={}; if(!st.waitPart[kk]){ st.waitPart[kk]=1;   /* the place's own record read (the store's one bundle or completion read), once */
        try{ AGN.pointState.part('siteLevels',+p.lat,+p.lon).then(function(){ if(active()) render(); },function(){ if(active()) render(); }); }catch(_){} }
      if(B&&x&&x.unavailable) return {ok:true,version:'place bundle siteLevels',fromBundle:true,places:[{ok:false,why:x.why||'the place\u2019s levels are not available',applied:{}}]};
      return null; }
    var SL=x.v;
    return {ok:true,version:'place bundle siteLevels',fromBundle:true,places:[{ok:SL.ok!==false,why:SL.why,baseline:SL,scenario:SL,applied:{}}]}; }
  function peak(H){ if(!H) return {nd:true,why:'not in the server answer'}; var p=H.peak;
    if(p&&num(p.level)!=null) return {i:+p.level,word:p.word||WORDS[+p.level],date:p.date||null,tehsil:/tehsil/.test(String(H.scope||''))};
    var d=(H.days||[]).filter(function(x){ return x&&x.why; })[0]; return {nd:true,why:d?d.why:'not assessed'}; }
  function chip(L){
    if(!L||L.nd) return '<span class="lv nd"'+(L&&L.why?' title="'+esc(L.why)+'"':'')+'>Not assessed</span>';
    var sw=(W.AGN&&AGN.hz5&&AGN.hz5.swatch)?AGN.hz5.swatch[L.i]:null;
    return '<span class="lv l'+L.i+'" style="background:'+esc(sw||'#eef1f4')+'">'+esc(L.word||WORDS[L.i])+'</span>'+(L.date?'<div class="scn-day">'+esc(L.date)+(L.tehsil?' · tehsil value':'')+'</div>':''); }
  function delta(a,b){ if(!a||!b||a.nd||b.nd) return {txt:'—',cls:'same',n:null}; var d=b.i-a.i; if(!d) return {txt:'No change',cls:'same',n:0};
    return {txt:(d>0?'▲ ':'▼ ')+Math.abs(d)+' level'+(Math.abs(d)>1?'s':''),cls:d>0?'up':'down',n:d}; }
  function rowsOf(P){ return HZ.map(function(h){ var B=P&&P.baseline&&P.baseline.hazards?P.baseline.hazards[h[0]]:null, S=P&&P.scenario&&P.scenario.hazards?P.scenario.hazards[h[0]]:null;
      var b=peak(B), s=P&&P.ok?peak(S):{nd:true,why:(P&&P.why)||'the scenario run did not answer'}; return {h:h[0],label:h[1],base:b,scen:s,d:delta(b,s),basis:(S&&S.method)||(B&&B.method)||''}; }); }
  /* ---- the tehsil's issued level (the served levels the map shows): kept for the assistant's place line (agnChainNow85) ---- */
  function levelFrom(h,r){ if(!r) return {nd:true}; if(r.notApplicable) return {na:true}; var draw=(r.categorical===true&&r.mapValue!=null)?r.mapValue:r.score;
    var meta={noData:!!r.noData, notApplicable:!!r.notApplicable, category:(r.screeningBand!=null&&r.categorical===true)?r.screeningBand:null, served:r.served===true, level:(r.served===true?r.level:null)};
    try{ if(W.AGN&&AGN.hz5&&AGN.hz5.levelOf){ var L=AGN.hz5.levelOf(h,draw,meta); L.score=draw; return L; } }catch(_){} return {nd:true}; }
  function issued(unit){ return TEHSIL_HZ.map(function(p){ var inp=null; try{ inp=(typeof W.hzDayInput==='function')?W.hzDayInput(unit,p[0]):null; }catch(_){ inp=null; } var r=null; try{ r=W.aiDistrictRisk(inp,p[0],0,unit); }catch(_){ r=null; }
      var b=levelFrom(p[0],r); return {h:p[0],label:p[1],base:b,scen:{nd:true},d:{txt:'—',cls:'same',n:null}}; }); }
  W.AGN=W.AGN||{};
  AGN.scenario76={ compute:function(unit){ return issued(unit); },
    pending:function(){ return st.inflight; },
    result:function(){ return st.last; },
    state:function(){ return {place:st.place,preset:st.preset,dT:st.dT,rainMm:st.rainMm,rainDay:st.rainDay,gustKmh:st.gustKmh,gustDay:st.gustDay,server:true}; },
    unit:function(){ var s0=stationById(st.place), u=unitOf(s0); return u?{unit:u,name:s0&&s0.name}:null; },
    select:function(id){ st.place=id; reset(); build(); render(); } };
  function reset(){ st.preset='baseline'; st.dT=0; st.rainMm=0; st.rainDay=null; st.gustKmh=0; st.gustDay=null; }
  function host(){ return D.getElementById('agnScn'); }
  ['agn:active-asset','agn:project'].forEach(function(ev){ D.addEventListener(ev,function(){ var sp=subjectPlace(); if(sp&&sp!==st.place){ st.place=sp; reset(); if(st.built) render(); } }); });
  D.addEventListener('agn:location',function(){ if(subjectPlace()) return; var id=globalPlace(); if(id&&id!==st.place){ st.place=id; reset(); if(st.built) render(); } });
  function build(){
    var panel=D.getElementById('agn-panel-hybridlab'); if(!panel) return false;
    var cfe=D.getElementById('cfeSection'), more=D.getElementById('agnScnMore');
    if(!more && cfe && cfe.parentNode){ more=D.createElement('details'); more.id='agnScnMore'; more.className='agn-scn-more agn-op-only'; more.innerHTML='<summary><b>Operator · sensitivity sweep</b><span>the advanced scenario engine on a copy of the inputs</span></summary>'; cfe.parentNode.insertBefore(more,cfe); }
    if(cfe){ cfe.classList.add('agn-op-only'); if(more && cfe.parentNode!==more) more.appendChild(cfe); }
    var h=host();
    if(!h){ h=D.createElement('section'); h.id='agnScn'; h.className='agn-scn'; h.setAttribute('aria-label','Scenario and stress test');
      var hero=panel.querySelector('.hybrid-hero'); if(hero&&hero.parentNode===panel) panel.insertBefore(h,hero.nextSibling); else if(cfe&&cfe.parentNode) cfe.parentNode.insertBefore(h,cfe); else panel.appendChild(h);
      h.addEventListener('change',onInput); h.addEventListener('input',onInput); h.addEventListener('click',onClick); }
    (function(e){ if(e&&h&&h.parentNode){ e.classList.add('agn-op-only');   /* v91.17.283.34 · the old joint heat-and-flood card (fixed design odds): operator only */ if(h.nextSibling!==e) h.parentNode.insertBefore(e,h.nextSibling); } })(D.getElementById('agnV91ScenarioMonteHost'));   /* the joint heat-and-flood card stays under the table (it refuses without a paired ensemble at the place) */
    if(!st.place) st.place=defaultPlace();
    st.built=true; return true; }
  var _deb=null;
  function onInput(e){ var t=e.target; if(t&&t.dataset&&t.dataset.wet!=null){ if(e.type!=='change') return; st.wetPct=t.value===''?null:+t.value; st.asked=true; render(); var w=host()&&host().querySelector('select[data-wet]'); if(w) w.focus(); return; }
    if(!t||!t.dataset||!t.dataset.k) return; var k=t.dataset.k;
    st[k]=(k==='rainDay'||k==='gustDay')?(t.value||null):(Number(t.value)||0); st.preset='custom'; st.asked=true; paintOut(host());
    clearTimeout(_deb); _deb=setTimeout(function(){ render(); },e.type==='change'?0:450); }
  function onClick(e){ var L=e.target&&e.target.closest?e.target.closest('button[data-scn-load]'):null; if(L){ st.asked=true; render(); return; }
    var b=e.target&&e.target.closest?e.target.closest('button[data-preset]'):null; if(!b||b.disabled) return; reset(); st.asked=true; st.preset=b.dataset.preset; render(); }
  /* v91.17.283.33 · Scenario Lab only: the district chance of local-rain flooding on the scenario day (GET /api/scenario floodOutcome),
     now vs scenario with the 90 % range and the usual rate; display only, never an alert, never in the live forecast or the map */
  var WETS=[['','the place\u2019s current wetness'],['10','dry (10th percentile)'],['50','normal (50th percentile)'],['75','wet (75th percentile)'],['90','very wet (90th percentile)']];   /* v91.17.283.34 · ground before the rain: dry / normal / wet / very wet = the place's percentile */
  function floodHtml(P){ var F=P&&P.floodOutcome; if(!F) return '';
    var cap=function(s){ s=String(s||''); return s.charAt(0).toUpperCase()+s.slice(1); }, pc=function(x){ return num(x)==null?'\u2014':(x*100).toFixed(x<0.01?2:1)+' %'; }, mm=function(x){ return num(x)==null?'':' \u00b7 '+(Math.round(x*10)/10)+' mm in the day'; };
    var cell=function(o){ if(!o) return '\u2014'; if(!o.modelled) return '<span class="scn-flood-nm">'+esc(cap(o.why))+'</span>'; return '<b>'+pc(o.p)+'</b> <span class="scn-flood-r">(90 % range '+pc(o.p5)+' to '+pc(o.p95)+') \u00b7 '+esc(o.rate||'')+'</span>'; };
    var sel='<label class="scn-flood-w">Ground wetness <select data-wet="1" aria-label="Ground wetness before the rain day">'+WETS.map(function(w){ return '<option value="'+w[0]+'"'+(String(st.wetPct==null?'':st.wetPct)===w[0]?' selected':'')+'>'+esc(w[1])+'</option>'; }).join('')+'</select></label>';
    var h='<h4>Local-rain flooding in the district'+(F.district?' \u00b7 '+esc(F.district):'')+(F.day?' \u00b7 '+esc(F.day):'')+'</h4><p class="scn-flood-lab">'+esc(cap(F.label))+'.</p>';
    if(!F.modelled) return h+'<p class="scn-flood-nm">'+esc(cap(F.why))+'.</p>'+sel;
    h+='<table class="scn-flood-t"><caption class="agn-scn-sr">Chance of local-rain flooding reported in the district, now and under the scenario</caption><tbody>'
      +'<tr><th scope="row">Now'+esc(mm(F.baseline&&F.baseline.mm))+'</th><td>'+cell(F.baseline)+'</td></tr>'
      +'<tr><th scope="row">Scenario'+esc(mm(F.scenario&&F.scenario.mm))+'</th><td>'+cell(F.scenario)+'</td></tr></tbody></table>';
    return h+sel+'<p class="scn-flood-n">Ground wetness: '+esc(F.wetness&&F.wetness.basis||'')+'. '+esc(cap(F.durationNote))+'. '+esc(cap(F.display))+'.</p>'; }
  function days(P){ var H=P&&P.baseline&&P.baseline.hazards&&P.baseline.hazards.heat; return ((H&&H.days)||[]).map(function(d){ return d.date; }).filter(Boolean); }
  function paintOut(h){ if(!h) return; var o=function(id,v){ var e=h.querySelector('#'+id); if(e) e.textContent=v; };
    o('agnScnOT', st.dT?((st.dT>0?'+':'')+(+st.dT).toFixed(1)+' °C'):'as forecast'); o('agnScnORain', st.rainMm>0?Math.round(st.rainMm)+' mm':'as forecast'); o('agnScnOG', st.gustKmh>0?Math.round(st.gustKmh)+' km/h':'as forecast'); }
  function render(){
    if(!build()) return; var h=host(); if(!h) return;
    var s=stationById(st.place); if(!s){ h.innerHTML='<h3>Scenario &amp; stress test</h3><div class="scn-wait">Pick a place at the top of the page.</div>'; return; }
    var q=query(s), P=q?((st.preset==='baseline'&&!st.asked)?fromBundle(s):load(s)):null; if(!q){ h.innerHTML='<h3>Scenario &amp; stress test</h3><div class="scn-wait">This place has no coordinates.</div>'; return; }
    if(P===null){ st.last=null; if(!h.querySelector('#agnScnRows')||h.dataset.place!==st.place){ h.dataset.place=''; h.innerHTML='<h3>Scenario &amp; stress test · '+esc(s.name)+'</h3><table><tbody id="agnScnRows" aria-busy="true"><tr><td class="scn-run">'+((st.preset==='baseline'&&!st.asked)?'Waiting for this place\u2019s levels\u2026':'Running the scenario on the server\u2026')+'</td></tr></tbody></table>'+((st.preset==='baseline'&&!st.asked)?'<div class="scn-presets" id="agnScnPresets" role="group" aria-label="Stress tests"><button type="button" data-scn-load="1">Show the stress tests (server scenario run)</button></div>':''); } else { var tb0=h.querySelector('#agnScnRows'); if(tb0) tb0.setAttribute('aria-busy','true'); } return; }
    var place=(P.places||[])[0]||{ok:false,why:P.why||'the scenario run did not answer'}; st.last={query:q,answer:P,place:place};
    var rows=rowsOf(place), M=st.meta||{presets:{},bounds:{}}, B=M.bounds||{}, dl=days(place), ap=place&&place.applied||{};
    if(h.dataset.place!==st.place||!h.querySelector('#agnScnRows')||(dl.length&&!h.querySelector('select[data-k]'))){
      var gName=s.site?s.name:((AGN.place&&AGN.place.name&&AGN.place.name())||s.name);
      var dOpt=function(k){ return '<select data-k="'+k+'" aria-label="Day">'+dl.slice(0,4).map(function(d,i){   /* v91.17.283.31 · 9 · days 0-3 only (the server refuses others) */ return '<option value="'+d+'"'+(st[k]===d?' selected':'')+'>'+(i===0?'today':'day '+i)+' · '+d+'</option>'; }).join('')+'</select>'; };
      var rMax=B.rainMmDay?Math.min(B.rainMmDay[1],500):500, gMax=B.gustKmh?Math.min(B.gustKmh[1],200):200;
      h.dataset.place=st.place;
      h.innerHTML='<div class="scn-top"><div><h3>Scenario &amp; stress test · <span id="agnScnName">'+esc(s.name)+'</span></h3>'
        +'<p class="scn-sub">What would the levels at this place be for today and the next 3 days under a warmer climate, a heavy rain day or a strong gust? Pick a stress test or set your own.</p></div>'
        +'<div class="scn-place"><span class="agn-place-ro"'+(s.site?'':' data-agn-place="1"')+'><span class="k">'+(s.site?'Site':'Place')+'</span><span class="'+(s.site?'n':'v')+'">'+esc(gName)+'</span><button type="button" data-agn-change-place="1" aria-label="Change the place (opens the place search at the top of the page)">Change</button></span></div></div>'
        +'<div class="scn-presets" id="agnScnPresets" role="group" aria-label="Stress tests"></div>'
        +'<div class="scn-sliders">'
        +'<label>Temperature +0 to 4 \u00b0C (hypothetical) <output id="agnScnOT"></output><input type="range" min="0" max="4" step="0.5" data-k="dT" value="'+st.dT+'" aria-label="Temperature increase, degrees, hypothetical"></label>'
        +'<label>Rain in one day <output id="agnScnORain"></output><input type="range" min="0" max="'+rMax+'" step="5" data-k="rainMm" value="'+st.rainMm+'" aria-label="Rain in one day, millimetres">'+(dl.length?dOpt('rainDay'):'')+'</label>'
        +'<label>The day\u2019s peak gust <output id="agnScnOG"></output><input type="range" min="0" max="'+gMax+'" step="5" data-k="gustKmh" value="'+st.gustKmh+'" aria-label="Strongest gust, km per hour">'+(dl.length?dOpt('gustDay'):'')+'</label>'
        +'</div><p class="scn-na" id="agnScnNa" role="status"></p>'
        +'<table><caption class="agn-scn-sr">Hazard levels at this place, now and under the scenario</caption><thead><tr><th scope="col">Hazard</th><th scope="col">Now</th><th scope="col">Scenario</th><th scope="col">Change</th><th scope="col" class="agn-op-only">Method</th></tr></thead><tbody id="agnScnRows"></tbody></table>'
        +'<p class="scn-foot" id="agnScnFoot"></p><div class="scn-flood" id="agnScnFlood"></div><div class="scn-mc" id="agnScnMc"></div><div class="scn-op agn-op-only" id="agnScnOp"></div>'; }
    h.querySelector('#agnScnPresets').innerHTML=(st.meta?Object.keys(M.presets||{}).map(function(k){ return '<button type="button" data-preset="'+esc(k)+'" class="'+(st.preset===k?'on':'')+'" aria-pressed="'+(st.preset===k)+'">'+esc(M.presets[k])+'</button>'; }).join(''):'<button type="button" data-scn-load="1">Show the stress tests (server scenario run)</button>');
    var na=h.querySelector('#agnScnNa'), rf=place&&place.refused, rfw=rf?(Array.isArray(rf)?rf.map(function(x){ return (x&&(x.why||x.control&&x.control+': '+x.why))||String(x); }).join('; '):(rf.why||String(rf))):''; na.textContent=place.ok?(rfw?'Not applied: '+rfw:''):(place.why||'the scenario was not run'); na.hidden=!!place.ok&&!rfw;   /* v91.17.283.31 · 9 · the server's refusal reason */
    var tb=h.querySelector('#agnScnRows'); tb.removeAttribute('aria-busy');
    tb.innerHTML=rows.map(function(r){ return '<tr data-hz="'+r.h+'"><th scope="row" style="font-size:.9375rem;text-transform:none;letter-spacing:0;color:#0c2a3a;border:0">'+esc(r.label)+'</th><td>'+chip(r.base)+'</td><td>'+chip(r.scen)+'</td><td class="dl '+r.d.cls+'">'+r.d.txt+'</td><td class="agn-op-only">'+esc(r.basis)+'</td></tr>'; }).join('');
    h.querySelector('#agnScnFoot').textContent=P.fromBundle?'Highest level of today and the next 3 days at this place, as served for the place (the place record). Pick a stress test or move a slider to run the NIGRAAN server\u2019s scenario on these hours. Exposure only: no downtime or loss estimate.':'Highest level of today and the next 3 days at this place, from the NIGRAAN server\u2019s scenario run: the place\u2019s own forecast hours, changed as set above'+(ap.rainBasis?' ('+ap.rainBasis+')':'')+', scored the same way as the place record. Glacial lake outburst floods are not part of the scenario run (their level is the tehsil\u2019s, on the map). Exposure only: no downtime or loss estimate. The live forecast and alerts are not changed.';
    var fl=h.querySelector('#agnScnFlood'); if(fl){ var hadF=fl.contains(D.activeElement); fl.innerHTML=P.fromBundle?'':floodHtml(place); if(hadF){ var ws=fl.querySelector('select[data-wet]'); if(ws) ws.focus(); } }
    h.querySelector('#agnScnOp').innerHTML='<b>Operator · scenario run.</b> GET /api/scenario?'+esc(q)+' · '+esc(P.version||'')+' · presets: '+esc(M.presetSource||'')+' · bounds: '+esc(M.boundsSource||'');
    h.querySelectorAll('input[data-k]').forEach(function(i){ if(D.activeElement!==i) i.value=st[i.dataset.k]||0; });
    paintOut(h); }
  function active(){ var p=D.getElementById('agn-panel-hybridlab'); return !!(p&&p.classList.contains('active')); }
  function kick(){ if(active()) render(); }
  D.addEventListener('click',function(e){ var t=e.target&&e.target.closest?e.target.closest('#agn-tab-hybridlab'):null; if(t) setTimeout(kick,50); },true);
  ['agn:data','agn:day','agn:site-score'].forEach(function(ev){ D.addEventListener(ev,function(){ if(active()&&!st.inflight) render(); }); });
  var tries=0; (function boot(){ if(build()){ if(active()) render(); return; } if(++tries<120) setTimeout(boot,1000); })();
})();
