
(function(){
  

  var G=window;
  function recWord(r){ return r.level || (r.cls==='Act'?'act now':r.cls==='Watch'?'prepare':(r.cls||'')); }    
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function nowPKT(){ return new Date(Date.now()+5*3600e3); }
  function todayISO(){ return nowPKT().toISOString().slice(0,10); }
  var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtMs(ms){ var d=new Date(ms+5*3600e3); return DAYS[d.getUTCDay()]+' '+d.getUTCDate()+' '+MON[d.getUTCMonth()]+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' PKT'; }
  function fmtDay(iso){ var d=new Date(String(iso).slice(0,10)+'T12:00:00Z'); return DAYS[d.getUTCDay()]+' '+d.getUTCDate()+' '+MON[d.getUTCMonth()]; }
  function hash(s){ var h=2166136261; s=String(s); for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return ('00000000'+(h>>>0).toString(16)).slice(-8); }

  function hazardKey(name){ var n=String(name||'').toLowerCase();
    if(/glof|glacial/.test(n)) return 'glof'; if(/heat/.test(n)) return 'heat'; if(/flood/.test(n)) return 'flood'; if(/rain/.test(n)) return 'rain_hz';
    if(/wind|gust/.test(n)) return 'wind'; if(/cold|frost/.test(n)) return 'cold'; if(/drought/.test(n)) return 'drought';
    if(/landslide/.test(n)) return 'landslide'; if(/glof/.test(n)) return 'glof'; if(/snow/.test(n)) return 'snow';
    if(/air|smog/.test(n)) return 'air'; return null; }
  var LABEL={heat:'Heat stress',flood:'Flood',rain_hz:'Heavy rain',wind:'Wind and gusts',cold:'Cold stress (UTCI)',drought:'Drought',landslide:'Landslide',glof:'Glacial lake outburst flood (GLOF)',snow:'Snow',air:'Air quality'};   /* v91.17.270: the names are set with every other table (fu2) */
  /* v91.17.270 G6: the lead before a forecast onset, by class (hours); prepareBy() and the reports' ready-by both read it */
  var LEAD_H={Act:6, Watch:12}; function leadH(cls){ return LEAD_H[cls]||LEAD_H.Watch; }

   
  var SECT={industrial:'industrial',manufacturing:'industrial',factory:'industrial',plant:'industrial',cement:'industrial',textiles:'industrial',oil_gas:'oil_gas','oil & gas':'oil_gas',mining:'mining',
    energy:'energy',power:'energy',substation:'energy',telecom:'telecom',telecommunications:'telecom',transport:'transport',logistics:'transport','transport / logistics':'transport',
    construction:'construction',hospital:'hospital',healthcare:'hospital',bank:'bank',banking:'bank','banking / finance':'bank',insurance:'bank',agriculture:'agriculture',farm:'agriculture',
    water:'water','water / wastewater':'water',commercial:'commercial','data centre':'commercial',data_centre:'commercial',infrastructure:'infrastructure'};
  function sectorOf(a){ var c=[a&&a.asset_type,a&&a.industry,a&&a.asset_subtype,a&&a.subtype].filter(Boolean).map(function(x){return String(x).trim().toLowerCase();});
    for(var i=0;i<c.length;i++){ if(SECT[c[i]]) return SECT[c[i]]; } return 'general'; }

   
  var PB={
    heat:{Watch:'Brief supervisors on heat stop rules; set shaded rest and water at each work face; check cooling plant and spare capacity.',
          Act:'Move heavy outdoor work to before 11:00 and after 16:00; measure WBGT at the work face and apply stop limits; put cooling plant and its power supply on watch.'},
    flood:{Watch:'Clear drains, culverts and the site discharge point; check pumps and their power; confirm the access-road closure trigger.',
           Act:'Lift stock and equipment off ground level; stage pumps and sandbags at the known entry points; prepare a controlled shutdown of equipment at ground level; confirm evacuation route and muster point.'},
    rain_hz:{Watch:'Clear drains and roof outlets; secure open excavations; check pump readiness.',
             Act:'Stop work in open excavations and on unprotected slopes; man the pumps; keep critical stock off the floor; restrict site traffic on unpaved routes.'},
    wind:{Watch:'Secure loose materials and temporary structures; review crane and work-at-height plans for the window.',
          Act:'Apply the crane and work-at-height gust stand-down; lower booms and secure cladding, signage and roof items; keep people out of the fall zone of tall structures.'},
    cold:{Watch:'Lag exposed pipes and water tanks; check heaters and antifreeze; issue cold-weather PPE.',
          Act:'Drain or heat-trace exposed water lines; delay concrete pours or use frost protection; protect frost-sensitive stock; plan for icy access.'},
    drought:{Watch:'Check water storage and supply contracts; review water-intensive processes.',
             Act:'Activate the water-saving plan; secure alternative supply; prioritise process water; monitor groundwater levels.'},
    landslide:{Watch:'Inspect slopes and drainage above the site and access roads; check the route status before dispatch.',
               Act:'Close routes under unstable slopes; move people and equipment out of the runout zone; confirm alternative access.'},
    glof:{Watch:'Confirm the downstream warning chain and the evacuation route to high ground.',
          Act:'Move people and mobile equipment above the flood line; stop work in the channel and on low terraces; keep the warning chain open.'},
    snow:{Watch:'Stock fuel, food and medicines; pre-position snow clearance.', Act:'Keep roofs clear of heavy loads; confirm road status before travel; stage clearance equipment.'},
    air:{Watch:'Limit strenuous outdoor work for sensitive staff; check filters.', Act:'Move strenuous work indoors; issue respirators where outdoor work continues; keep HVAC on recirculation with clean filters.'}
  };
  var SECTOR_STEP={
    industrial:{heat:'Check derating of motors, compressors and transformers in hot bays.',flood:'Isolate ground-level electrical panels before water arrives.'},
    oil_gas:{heat:'Check vapour pressure and tank cooling on storage.',flood:'Close bund drains and check tank anchorage.'},
    mining:{rain_hz:'Inspect haul-road drainage and pit-wall pumping.',landslide:'Stand off from benches and spoil heaps showing movement.'},
    energy:{heat:'Apply transformer and line ambient ratings; check cooling of switchgear.',wind:'Patrol exposed lines after the window.',flood:'Protect substations at ground level.'},
    telecom:{heat:'Check shelter cooling and battery temperature.',wind:'Check antenna mounts and guy wires after the window.',flood:'Confirm generator fuel for the days access may be cut.'},
    transport:{rain_hz:'Identify low crossings and set closure triggers.',flood:'Re-route away from low crossings; hold dispatch where roads are under water.',heat:'Protect temperature-sensitive cargo.'},
    construction:{wind:'Apply the crane gust limit on the manufacturer chart.',heat:'Schedule pours and heavy work in the cool hours.'},
    hospital:{heat:'Check critical-area cooling and backup power to it.',flood:'Protect ground-floor critical services and access for ambulances.'},
    water:{flood:'Protect intakes and pump stations; plan for turbidity.',drought:'Apply supply rationing rules.'},
    agriculture:{heat:'Irrigate early; shade livestock.',cold:'Cover or irrigate frost-sensitive crops the evening before.'},
    bank:{flood:'Check the branches in the flooded area; plan branch continuity.'},
    infrastructure:{flood:'Inspect culverts and embankments; check design level against the forecast.'}
  };
  var OWNER={heat:'Operations / HSE',flood:'Facilities / plant engineering',rain_hz:'Facilities',wind:'Operations / HSE',cold:'Facilities / maintenance',drought:'Utilities / water manager',landslide:'Logistics / site security',glof:'Site management / emergency coordinator',snow:'Facilities / logistics',air:'HSE'};
  var OWNER_SECTOR={energy:{heat:'Grid operations',wind:'Line maintenance'},telecom:{heat:'Network operations',wind:'Field maintenance',flood:'Field maintenance'},transport:{flood:'Fleet control',rain_hz:'Fleet control'},hospital:{heat:'Facilities / clinical operations',flood:'Facilities / emergency planning'},bank:{flood:'Credit risk / branch operations'},agriculture:{heat:'Farm manager',cold:'Farm manager',drought:'Farm manager'}};
  var VAR_HAZ={temperature_2m:'heat',wind_gusts_10m:'wind',wind_speed_10m:'wind',precipitation:'rain_hz',cape:'rain_hz'};

  function assetNote(hz, a){
    if(!a) return null; var n=[];
    var bp=a.backup_power, bh=(a.backup_duration_hr!=null&&isFinite(a.backup_duration_hr))?Number(a.backup_duration_hr):null;
    var fp=(a.flood_protection!=null&&isFinite(a.flood_protection))?Number(a.flood_protection):null;
    var mtd=(a.maximum_tolerable_downtime_hr!=null&&isFinite(a.maximum_tolerable_downtime_hr))?Number(a.maximum_tolerable_downtime_hr):null;
    if(hz==='flood'||hz==='rain_hz'||hz==='glof'){
      if(fp!=null) n.push('Recorded flood protection: '+fp+' m. NIGRAAN does not yet forecast water depth at the site, so compare it with the river level the provincial flood cell issues for this reach.');
      else n.push('No flood protection level is recorded for this asset; supply it so the action can be checked against a level.');
    }
    if(hz==='heat'||hz==='flood'||hz==='wind'||hz==='cold'){
      if(bp===true||bp==='yes'||bp==='Yes') n.push('Backup power recorded'+(bh!=null?' ('+bh+' h)':'')+(bh!=null&&bh<24?'; a multi-day event may outlast it — confirm fuel resupply.':'.'));
      else if(bp===false||bp==='no'||bp==='No') n.push('No backup power recorded: cooling and pumps stop with the grid.');
    }
    if(hz==='heat' && a.cooling_type) n.push('Cooling: '+a.cooling_type+'.');
    if(mtd!=null) n.push('Tolerable downtime '+mtd+' h: any step longer than that must start now.');
    return n.length?n.join(' '):null;
  }
  function actionText(hz, cls, sector){ var b=(PB[hz]&&PB[hz][cls])||null; if(!b) return null; var st=(SECTOR_STEP[sector]||{})[hz]; return b+(st?' '+st:''); }
  function ownerFor(hz, sector){ return ((OWNER_SECTOR[sector]||{})[hz])||OWNER[hz]||'Operations'; }
   
   
  function clsWord(cls){ try{ return G.AGN.level.ofClass(cls)||'its trigger level'; }catch(_){ return 'its trigger level'; } }
  

  /* v91.17.270 (owner): the onset is the first day the engine has issued at this class for the unit (AGN.engineLevels, the map's source);
     the page no longer scores the next days itself for it */
  function prepareBy(unit, hz, cls, opts){
    opts=opts||{}; var now=Date.now();
    if(hz==='drought'||opts.condition){ var at=now+(cls==='Act'?7:14)*864e5; return {at:new Date(at).toISOString(), onset:null, text:fmtMs(at)+' (review window for a 90-day condition; no response clock)', basis:'review window for a 90-day condition'}; }
    var EL=G.AGN&&G.AGN.engineLevels, E=null, x=null; try{ E=unit&&EL?EL.peek(unit):null; if(unit&&EL&&!E) EL.get(unit); x=E&&E.hz?E.hz.filter(function(h){ return h.key===hz; })[0]:null; }catch(_){}
    var rb=x&&EL?EL.readyBy(hz,cls,x.row):null;
    if(!rb||!rb.at){ var h=cls==='Act'?6:cls==='Watch'?18:36, at2=now+h*3600e3;
      return {at:new Date(at2).toISOString(), onset:null, text:fmtMs(at2)+' (AGN default window: no issued engine day reaches this level)', basis:'default window; no issued engine day reaches '+clsWord(cls)}; }
    return {at:rb.at, onset:rb.onset, day:rb.day, text:rb.text, basis:'before the first issued engine day at '+clsWord(cls)}; }
  try{ G.AGN=G.AGN||{}; G.AGN.actionPlan={ lead:function(cls){ return leadH(cls); }, owner:function(hz,sector){ return ownerFor(hz,sector); }, text:function(hz,cls,sector){ return actionText(hz,cls,sector); }, prepareBy:prepareBy }; }catch(_){}

  var LAST=null;
  function build(opts){
    opts=opts||{};
    var out=[], withheld=[], now=Date.now();
    var S=null; try{ S=G.AGN.subject&&G.AGN.subject.get?G.AGN.subject.get():null; }catch(_){}
    var A=null; try{ A=G.AGN.project&&G.AGN.project.activeAsset?G.AGN.project.activeAsset():null; }catch(_){}
    var sector=sectorOf(A), caseId=(S&&S.case_id)||'no-case', assetName=(A&&(A.name||A.asset_name))||null;
    function push(r){ r.action_id='ACT-'+hash(caseId+'|'+r.source+'|'+r.key).toUpperCase(); r.case_id=caseId; r.asset_id=A?A.asset_id:null; r.status='open'; out.push(r); }

     
    var ev=null; try{ ev=G.AGN.assetsBoard&&G.AGN.assetsBoard.last?G.AGN.assetsBoard.last():null; }catch(_){}
    var regN=0; try{ regN=(G.AGN.assets&&G.AGN.assets.summary)?(G.AGN.assets.summary().limits||0):0; }catch(_){}
    if(ev && ev.ok && Array.isArray(ev.rows)){
      ev.rows.forEach(function(r){
        if(A && r.assetId!=null && String(r.assetId)!==String(A.asset_id) && String(r.asset||'')!==String(A.name||'')) return;
        if(r.state==='not-evaluated'){ if(r.elsewhere) return; withheld.push(r.asset+' · '+r.variable+' limit not evaluated: '+(r.why||'no reason recorded')); return; }
        if(r.state!=='over' && r.state!=='approaching' && r.state!=='window-closed') return;
        var hz=VAR_HAZ[r.variable]||'heat', cross=(r.leadMin!=null)?now+r.leadMin*60e3:now;
        var ready=(r.leadToAction!=null)?Math.max(now, now+r.leadToAction*60e3):now;
        push({ source:'limit', key:r.assetId+'|'+r.variable+'|'+r.limit+'|'+r.dir, hazard:hz, hazard_label:LABEL[hz], cls:null,
          urgent:(r.state!=='approaching'),
          trigger:r.variable+' '+r.dir+' '+r.limit+(r.state==='over'?' — over the limit now':' — crossing '+fmtMs(cross))+(r.value!=null?' (forecast '+r.value+')':''),
          chance:null, confidence:(r.confidence&&(r.confidence.label||r.confidence.level))||'no measured error for this variable here',
          prepare_by:new Date(ready).toISOString(), prepare_by_text:(r.state==='window-closed'||r.state==='over')?'now (response window closed)':fmtMs(ready),
          action:r.action||actionText(hz, 'Act', sector)||'Apply the site response for this limit.',
          owner_role:r.owner||ownerFor(hz, sector), owner_source:r.action?'client limit register':'AGN default for sector '+sector,
          evidence:['limit register: '+(r.authority||'')+(r.reference?' · '+r.reference:''),'nowcast crossing'],
          asset_note:assetNote(hz,A),
          verification:'After the window: was '+r.variable+' '+r.dir+' '+r.limit+' at the site (site sensor or nearest station)? Was the action done in time?' });
      });
    } else if(regN){ withheld.push('client limits are loaded but have not been evaluated against the forecast yet (Operations → Evaluate register)'); }

    

    var XC=null; try{ XC=G.AGN.crossings&&G.AGN.crossings.last?G.AGN.crossings.last():null; }catch(_){}
    var VAR_HAZ2={temperature_2m:'heat',wet_bulb_temperature_2m:'heat',apparent_temperature:'heat',temperature_2m_max:'heat',temperature_2m_min:'cold',
      precipitation:'rain_hz',precipitation_24h:'rain_hz',wind_gusts_10m:'wind',wind_speed_10m:'wind',river_discharge:'flood'};
    if(XC && XC.ok && Array.isArray(XC.rows)){
      var nowKeys={}; out.forEach(function(r){ if(r.source==='limit') nowKeys[r.key]=1; });
      XC.rows.forEach(function(r){
        if(A && r.assetId!=null && String(r.assetId)!==String(A.asset_id) && String(r.asset||'')!==String(A.name||'')) return;
        var base=r.assetId+'|'+r.variable+'|'+r.limit+'|'+r.dir;
        if(r.horizon==='0–72 h' && nowKeys[base]) return;
        var hz=VAR_HAZ2[r.variable]||r.hazard||'heat', multi=(r.state==='possible');
        push({ source:'limit', key:'x|'+base+'|'+(multi?String(r.when):'near'), hazard:hz, hazard_label:LABEL[hz], cls:null,
          urgent:(r.state==='over-now'||!!r.windowClosed), horizon:r.horizon,
          trigger:r.label+' '+r.dir+' '+r.limit+' '+(r.unit||'')+(r.requiredHours>1?' for '+r.requiredHours+' h':'')+' — '+(r.state==='over-now'?'held now':(multi?'possible '+r.when:'crossing '+r.when))
            +(r.value!=null?' (forecast '+r.value+' '+(r.unit||'')+(multi?', median member':'')+')':''),
          chance:(r.chance!=null?r.chance:null), confidence:r.confidence||'no measured error for this variable here',
          prepare_by:r.prepareBy||null, prepare_by_text:r.prepareByText||(multi?(r.when+' (no response time registered)'):'now'),
          action:r.action||actionText(hz, multi?'Watch':'Act', sector)||'Apply the site response for this limit.',
          owner_role:r.owner||ownerFor(hz, sector), owner_source:r.owner?'client limit register':'AGN default for sector '+sector,
          evidence:['limit register: '+(r.authority||'')+(r.reference?' · '+r.reference:''), r.source],
          asset_note:assetNote(hz,A),
          verification:'After the window: did '+r.label.toLowerCase()+' go '+r.dir+' '+r.limit+' '+(r.unit||'')+' at the site (site sensor or nearest station)? Was the action done in time?' });
      });
      (XC.notEvaluated||[]).forEach(function(r){ if(A && String(r.assetId)!==String(A.asset_id) && String(r.asset||'')!==String(A.name||'')) return; withheld.push(r.asset+' · '+(r.label||r.variable)+' limit not evaluated: '+r.why); });
    }

     
    /* v91.17.270 (owner): the class of each hazard is the engine's level for the subject's tehsil (the map's source), the highest of the
       issued days; the ready-by is the plan's lead before the first issued day at that class */
    var EL=G.AGN&&G.AGN.engineLevels, uE=null, EE=null;
    try{ uE=(A&&A.latitude!=null&&A.longitude!=null&&EL)?EL.unitAt(+A.latitude,+A.longitude):null;
      if(!uE){ var ap=G.AGN.data&&G.AGN.data.activePoint?G.AGN.data.activePoint():null; uE=(ap&&ap.lat!=null&&EL)?EL.unitAt(+ap.lat,+ap.lon):null; }
      if(!uE) uE=(S&&(S.unit||S.unitUnresolvedName))||null; EE=uE&&EL?EL.peek(uE):null; if(uE&&EL&&!EE) EL.get(uE); }catch(_){}
    if(EE&&EE.days){ EE.hz.forEach(function(x){ if(!x.peak) return; var k=x.key, cls=EL.classOf(x.peak.i); if(cls!=='Act'&&cls!=='Watch') return;
        if(k==='glof') return;
        var isCondition=(k==='drought'), rb=isCondition?prepareBy(uE,k,cls,{condition:true}):EL.readyBy(k,cls,x.row), lvw=EL.word(x.peak.i);
        push({ source:'class', key:k+'|'+cls, hazard:k, hazard_label:LABEL[k], cls:cls, level:lvw,
          trigger:LABEL[k]+' at '+lvw+' on '+fmtDay(x.peak.date)+': the hazard engine\u2019s level for this tehsil (the map), '+EL.asOf(EE),
          chance:null, confidence:'hazard engine level (the map)', timescale:isCondition?'weeks-months':'hours-days',
          prepare_by:rb.at, onset:rb.onset||null, prepare_basis:isCondition?rb.basis:'before the first issued engine day at '+clsWord(cls), prepare_by_text:rb.text,
          action:actionText(k, cls, sector)||'Review the site response for this hazard.',
          owner_role:ownerFor(k, sector), owner_source:'AGN default for sector '+sector,
          evidence:['hazard engine levels, '+EL.asOf(EE)], asset_note:assetNote(k,A),
          verification:'After 72 h: did an impact occur at the asset? Record it in the impact log so the class can be scored.' }); }); }
    else withheld.push('hazard classes: '+(EE&&EE.why?EE.why:'the hazard engine levels for this place were still being read'));


    var C=opts.context||null;
    if(!C){ try{ C=G.AGN.reportCtx&&G.AGN.reportCtx.peek?G.AGN.reportCtx.peek(S&&(S.unit||S.unitUnresolvedName)):null; }catch(_){} }
    if(C){
      var E2=C.outlook&&C.outlook.ensemble, stale=!!(E2&&E2.at&&(now-Date.parse(E2.at))/3600e3>18);
      (C.actions||[]).forEach(function(a){
        var k=hazardKey(a.hazard)||'heat';
        if(a.horizon==='season'||/season|week/i.test(String(a.horizon||''))){
          push({ source:'planning', key:'plan|'+a.hazard, hazard:k, hazard_label:a.hazard, cls:null, trigger:a.trigger, chance:null,
            prepare_by:null, prepare_by_text:'planning', action:a.action||((a.actions||[]).join(' ')), owner_role:a.owner||'Planning', owner_source:'AGN default',
            evidence:['seasonal / extended-range outlook'], verification:'Compare with the observed season.' });
          return;
        }
        if(stale){ withheld.push(a.hazard+' ensemble event withheld: the ensemble is older than 18 h'); return; }
        if(a.prepareBy && a.prepareBy<todayISO()){ withheld.push(a.hazard+' event dated '+a.prepareBy+' is past and is not printed'); return; }
        push({ source:'event', key:'ev|'+a.hazard+'|'+(a.when||''), hazard:k, hazard_label:a.hazard, cls:null,
          trigger:a.trigger||a.hazard, chance:(a.chance!=null?a.chance:null), confidence:(a.productType==='Indicative'?'indicative: '+(a.evidence||'not checked against measurements'):'share of 51 ensemble members, not yet calibrated'),
          prepare_by:a.prepareBy?a.prepareBy+'T12:00:00+05:00':null, prepare_by_text:a.prepareBy?fmtDay(a.prepareBy):'–',
          action:(a.action||((a.actions||[]).join(' ')))+(SECTOR_STEP[sector]&&SECTOR_STEP[sector][k]?' '+SECTOR_STEP[sector][k]:''),
          owner_role:ownerFor(k, sector), owner_source:'AGN default for sector '+sector,
          evidence:[a.evidence?String(a.evidence):('global ensemble for the tehsil'+(E2&&E2.at?', issued '+String(E2.at).slice(0,16).replace('T',' ')+' UTC':''))],
          asset_note:assetNote(k,A),
          verification:'After the event window: did the event occur at the nearest station? Was the action done?' });
      });
      

      (C.standing||[]).forEach(function(st){
        var k=hazardKey(st.hazard)||({monsoon:'rain_hz',ponding:'flood',riverine:'flood',slope:'landslide',smog:'air',dust:'air',seismic:null,coastal:'wind'}[st.hazard]||null);
        var stp=(k&&SECTOR_STEP[sector]&&SECTOR_STEP[sector][k])?' '+SECTOR_STEP[sector][k]:'';
        push({ source:'standing', key:'st|'+st.id, hazard:k||st.hazard, hazard_label:({monsoon:'Wet season',ponding:'Ponding ground',riverine:'River floodplain',slope:'Steep ground',smog:'Smog season',dust:'Dust season',seismic:'Seismic zone',coastal:'Coastal exposure',heat:'Heat season',cold:'Cold season',glof:'GLOF corridor',drought:'Dry season'}[st.id]||st.id),
          cls:null, trigger:st.why, chance:null, confidence:st.evidence, prepare_by:null, prepare_by_text:'standing (this season / this ground)',
          action:st.measure+stp, owner_role:(k&&ownerFor(k, sector))||st.owner, owner_source:'AGN standing measure for sector '+sector, evidence:[st.evidence],
          asset_note:k?assetNote(k,A):null, verification:'Review at the season change or after the first event of the season.' });
      });
      (C.watch||[]).forEach(function(w){
         
        var k=hazardKey(w.hazard)||({'catchment wetness':'flood','air quality':'air'}[String(w.hazard).toLowerCase()]||(/drought/i.test(w.hazard)?'drought':(/glof|glacial/i.test(w.hazard)?'glof':null)));
        push({ source:'watch', key:'w|'+w.hazard, hazard:k, hazard_label:w.hazard, cls:null, trigger:w.what, chance:(typeof w.value==='number'&&w.value<=100&&w.value>=0&&/members/.test(w.what))?w.value:null,
          confidence:w.source, prepare_by:null, prepare_by_text:'watch (below the action line)', action:'No action is triggered; keep it on the daily check and re-read the outlook tomorrow. '+((k&&PB[k]&&PB[k].Watch)?'If it crosses the line: '+PB[k].Watch:(k==='flood'&&/wetness/i.test(w.hazard)?'If it crosses the line: the next storm runs off rather than soaking in; check the site drainage and the pumping plan before the rain.':'')),
          owner_role:(k&&ownerFor(k, sector))||'Operations', owner_source:'AGN default for sector '+sector, evidence:[w.source], verification:'Did it cross the action line in the following days?' });
      });
    } else withheld.push('ensemble events: the tehsil forecast context was not available when these actions were built');

    var order={limit:0,class:1,event:2,planning:3,watch:4,standing:5};
    out.sort(function(x,y){ var d=order[x.source]-order[y.source]; if(d) return d; return String(x.prepare_by||'9').localeCompare(String(y.prepare_by||'9')); });
    LAST={ records:out, withheld:withheld, built_at:new Date().toISOString(), built_at_text:fmtMs(Date.now()),
           case_id:caseId, asset_id:A?A.asset_id:null, asset_name:assetName, sector:sector, unit:(S&&S.unit)||null,
           engine:'agn-actions v91.17.23' };
    try{ document.dispatchEvent(new CustomEvent('agn:actions',{detail:{n:out.length}})); }catch(_){}
    return LAST;
  }

  function panelHtml(R){
    if(!R) return '<p class="asmt-mut">No actions built yet.</p>';
    var SRC={limit:'Client limit',class:'Hazard class',event:'Ensemble event',planning:'Planning'};
    var rows=R.records.filter(function(r){return r.source!=='planning'&&r.source!=='watch'&&r.source!=='standing';});
    var EL0=G.AGN&&G.AGN.engineLevels, cr=R.records.filter(function(r){ return r.source==='class'; })[0];
    var h='<div style="font:600 12px/1.45 system-ui,sans-serif;color:#3d5566;margin:0 0 6px">'+esc(rows.length)+' action'+(rows.length===1?'':'s')+' for '+esc(R.asset_name||R.unit||'the current subject')+' · built '+esc(R.built_at_text)+(cr&&cr.evidence?' · hazard '+esc(String(cr.evidence[0]).replace(/^hazard engine /,'engine ')):'')+' · same records as the report and the AI</div>';
    if(!rows.length) h+='<p style="margin:4px 0">No action is triggered: no client limit is forecast to be crossed, no hazard at the asset has reached its response trigger, and no ensemble event reaches its threshold.</p>';
    else { h+='<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="text-align:left;border-bottom:1px solid #dde"><th>Source</th><th>Hazard</th><th>Trigger</th><th>Ready by</th><th>Action</th><th>Owner</th></tr></thead><tbody>';
      rows.forEach(function(r){ h+='<tr style="border-bottom:1px solid #eef;vertical-align:top'+(r.cls==='Act'||r.urgent?';background:#fdecea':(r.cls==='Watch'?';background:#fff6e0':''))+'"><td>'+esc(SRC[r.source])+'<div style="color:#789;font-size:11px">'+esc(r.action_id)+'</div></td><td><b>'+esc(r.hazard_label)+'</b>'+(recWord(r)?' · '+esc(recWord(r)):'')+'</td><td>'+esc(r.trigger)+(r.chance!=null?' · '+esc(r.chance)+'%':'')+'</td><td>'+esc(r.prepare_by_text)+'</td><td>'+esc(r.action)+(r.asset_note?'<div style="color:#6a5">'+esc(r.asset_note)+'</div>':'')+'</td><td>'+esc(r.owner_role)+'</td></tr>'; });
      h+='</tbody></table>'; }
    var wl=R.records.filter(function(r){return r.source==='watch';}), stl=R.records.filter(function(r){return r.source==='standing';});
    if(wl.length||stl.length){ h+='<details style="margin-top:6px;font-size:12px"><summary style="cursor:pointer;color:#0C3851">'+esc(wl.length)+' on the watch list · '+esc(stl.length)+' standing measure'+(stl.length===1?'':'s')+' for this season and ground</summary><ul style="margin:4px 0 0 16px;padding:0">'
      +wl.map(function(r){ return '<li><b>Below the line · '+esc(r.hazard_label)+'</b>: '+esc(r.trigger)+'</li>'; }).join('')+stl.map(function(r){ return '<li><b>'+esc(r.hazard_label)+'</b>: '+esc(r.action)+' <span style="color:#789">('+esc(r.owner_role)+'; '+esc(r.trigger)+')</span></li>'; }).join('')+'</ul></details>'; }
    if(R.withheld.length) h+='<div style="color:#789;font-size:11px;margin-top:6px">Not turned into actions: '+R.withheld.map(esc).join(' · ')+'</div>';
    return h;
  }
  function paint(){
    var R=null; try{ R=build({}); }catch(e){ R=null; }
     
    [['agnActionsOps','assetBody']].forEach(function(p){
      var anchor=document.getElementById(p[1]); if(!anchor) return;
      var box=document.getElementById(p[0]);
      if(!box){
        var host=anchor.closest('table')||anchor; host=host.parentElement||host;
        box=document.createElement('div'); box.id=p[0];
        box.style.cssText='margin:12px 0;padding:10px 12px;border:1px solid rgba(12,56,81,.18);border-radius:10px;background:#fff';
        box.innerHTML='<div style="font:800 13px system-ui,sans-serif;color:#0C3851;margin-bottom:4px">Actions</div><div data-body></div>';
        host.parentNode.insertBefore(box, host.nextSibling);
      }
      var body=box.querySelector('[data-body]'); if(body) body.innerHTML=panelHtml(R);
      var tr=document.getElementById('opsxTracked'); if(tr&&tr.parentNode!==box) box.appendChild(tr);
    });
  }
  var t=null; function soon(ms){ clearTimeout(t); t=setTimeout(paint, ms||600); }
  ['agn:view','agn:project','agn:active-asset','agn:assets','agn:location','agn:crossings','agn:engine-levels'].forEach(function(ev){ document.addEventListener(ev, function(){ soon(900); }); });
  document.addEventListener('click', function(e){ var b=e.target&&e.target.closest&&e.target.closest('#asmtRun,#assetEvaluate'); if(b) soon(b.id==='assetEvaluate'?6000:8000); }, true);
  G.AGN=G.AGN||{}; G.AGN.actions={ build:build, list:function(){ return (LAST&&LAST.records)||[]; }, last:function(){ return LAST; }, paint:paint };
  setTimeout(paint, 6000);
})();
