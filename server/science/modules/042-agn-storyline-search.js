
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const help = {

  overview:{title:'Overview',phase:'Observe',purpose:'A clean national first look: the interactive Pakistan map and the next 24-hour forecast for the selected location.',input:'Map layers, selected-location weather and hourly forecast data.',process:'Keeps the landing screen focused on spatial awareness and immediate timing. Detailed risk, evidence and operational workflows remain in their dedicated sections.',read:'Use the map to inspect place and hazard context, then scan the 24-hour strip for timing.',limits:'The Overview is intentionally concise. Open AI & Risk Intelligence, Client Risk or Operations for detailed interpretation and action.'},
  livedata:{title:'Live & Forecast',phase:'Observe → Anticipate',purpose:'Current atmospheric and land-surface inputs, model agreement, then the 72-hour outlook and the windows for acting.',input:'The model forecast and current conditions; a comparison across 11 model streams, plus an independent second-opinion feed.',process:'Shows input health, inter-model spread and a 72-hour meteogram. Operational windows are derived from the forecast, not a separate model.',read:'Wide model spread means the models disagree. It is a measure of agreement, not of skill: a narrow spread on a biased ensemble is confident and wrong, and the multi-model mean is not automatically the best forecast. Read agreement, historical skill and data completeness as three separate things. The operational-window cards translate the outlook into go/no-go timing.',limits:'Point forecast for the selected location. Not bias-corrected against local observation.'},
  airisk:{title:'AI & Risk Intelligence',phase:'Interpret',purpose:'Combines the NIGRAAN LLM Climate Analyst with explainable sector-specific hazard screening, geospatial intelligence, confidence and drivers.',input:'Verified backend context, hazard-engine outputs, the selected sector and lead time.',process:'Scientific and AI models calculate the evidence. The LLM retrieves, compares, explains and drafts decision products while preserving sources, timestamps and human authority.',read:'Use the Climate Analyst for grounded questions, then inspect the risk score, drivers, evidence status and sector pathway before acting.',limits:'The present LLM panel is a backend-ready design interface. Screening is not a calibrated probability or an official warning.'},
  assessments:{title:'Client Risk',phase:'Apply',purpose:'Screen one site at the place chosen at the top of the page, prepare the client\u2019s site register (templates, upload, intake) and read the engineering conditions. The client portfolio is ranked on the Customize page (AJG Supplies is the first client).',input:'Asset type, the place chosen at the top of the page, the selected hazards; the client\u2019s site register (CSV or XLSX from the templates).',process:'Reads the hazard engine\u2019s served levels for the site and its tehsil; nothing is scored on this page. Site Assessment, Client portfolio (the hand-over to the Customize page) and Engineering Conditions are panes within this tab.',read:'The level at the site and for its tehsil, with the leading driver. A level is not a probability.',limits:'Preliminary screening. A loss assessment needs asset geometry, fragility, replacement value and downtime cost.'},

  operations:{title:'Operations',phase:'Act',purpose:'Turns screening into an operating picture: national status, priority board with exposed population, decision chain and action tracking.',input:'District verdicts, the river-flood sweep, population grid population, the action register.',process:'Orders districts by the worst operational class held, resolves the population under each, and records a connected decision chain from condition to owner.',read:'The People column is resident population of a signalling unit (population grid 2020), not people inside a modelled footprint. Exposed-population KPI totals units at Watch or above.',limits:'Population is a 2020 modelled floor. Economic exposure is not yet connected.'},
  modelab:{title:'Methods & Verification',phase:'Evidence',purpose:'The methods behind every engine and how the issued forecasts verified: provider comparison, raw spread diagnostics, calibration status, conflicts, provenance and the server\u2019s verification ledger.',input:'Raw provider outputs for the active location, the NIGRAAN processing chain and the server\u2019s verification records.',process:'Keeps provider output, processing, model spread and provenance separate. It does not convert agreement into verified skill.',read:'Verified skill comes only from forecasts matched with what was then measured, by region, season, variable and lead.',limits:'Diagnostic and verification surface. Agreement is not accuracy.'},
  hybridlab:{title:'Scenario Lab',phase:'Scenario',purpose:'Controlled what-if sensitivity analysis against the active NIGRAAN baseline.',input:'Live baseline plus bounded user-selected scenario offsets.',process:'Recomputes controlled sensitivity outputs without modifying operational forecasts, alerts or core hazard state.',read:'Read baseline, scenario and change together. The result is sensitivity, not event probability.',limits:'Core what-if equations plus uniform sensitivity envelopes. Advanced EO, atmospheric and exposure variables remain separate diagnostics until validated couplings and calibrated probability distributions are available.'}
,
  

  'ops-situation':{
    title:'Situation room', phase:'Act — national picture',
    purpose:'The national operating picture now: district status, priority ranking and the population under each signalling unit.',
    input:'District verdicts from the national sweep, the 35-gauge river sweep (91 districts covered, return-period anchored), population grid 2020 population, the action register.',
    process:'Orders signalling units by the worst operational class they hold, resolves resident population for each, and pairs every row with its recommended action and current status.',
    read:'The People column is RESIDENT population of a signalling unit (population grid 2020 modelled), not people inside a modelled hazard footprint. The exposed-population KPI totals units at Watch or above. Ranking is by screening score, not expected loss.',
    limits:'Population is a 2020 modelled floor and will understate current numbers. Economic exposure is not connected. Units with no forecast cover for the selected day show no-data rather than today\u2019s value.'},
  'ops-verification':{
    title:'Post-event verification', phase:'Act — the calibration surface',
    purpose:'Where a screening score gets compared against what actually happened. This is the surface that would make the rest of the product calibrated rather than screening-grade.',
    input:'Closed actions and their scores at creation. An observed-impact ledger is NOT yet connected.',
    process:'Records what was signalled and what was actioned. It does not yet score the signal against observed impact.',
    read:'Treat every number elsewhere in AI GEO NIGRAAN as uncalibrated until this pane has an impact ledger behind it. That is the honest position and the one to state to clients.',
    limits:'No impact ledger is wired. Without one there is no hit rate, no false-alarm ratio and no basis for claiming skill. The highest-value gap in the build \u2014 not a missing feature, a missing evidence base.'},

   
  'asmt-site':{
    title:'Site Assessment', phase:'Apply — single site',
    purpose:'Screens the place chosen at the top of the page against the selected hazards for the asset type you pick.',
    input:'The global place, asset type, selected hazards.',
    process:'Reads the hazard engine\u2019s served level for the site and for its tehsil on each hazard; nothing is scored on this page.',
    read:'A level is not a probability. The asset type picks which hazards are shown and the advice; it does not change a level.',
    limits:'The screening reads hazard levels only; it is not a survey of your asset. A loss assessment needs geometry, fragility, replacement value and downtime cost. Say so in writing when this leaves the building.'},
  'asmt-portfolio':{
    title:'Client portfolio', phase:'Apply \u2014 hand-over',
    purpose:'Hands the client\u2019s sites to the Customize page, where the portfolio is ranked (AJG Supplies is the first client).',
    input:'The site register added on this tab (template, CSV or XLSX upload, or rows pasted from a spreadsheet).',
    process:'Sends the sites with a name and a coordinate inside Pakistan to the Customize page\u2019s site list on this server; that page ranks them on the served levels.',
    read:'The count of sites in the register and how many have a usable coordinate. The ranking itself is on the Customize page.',
    limits:'Sending replaces the Customize page\u2019s site list (the previous list is kept as a backup on the server). Only this computer may send.'},
  'asmt-engineering':{
    title:'Engineering Conditions', phase:'Apply — design inputs',
    purpose:'Assembles the atmospheric and terrain conditions an engineer asks for at concept stage.',
    input:'Active location, terrain (Copernicus GLO-30), live and climatological atmospheric values.',
    process:'Presents model-served values alongside the design assumptions this build makes explicit.',
    read:'Distinguish the two carefully: model-served values come from a reanalysis or forecast; design assumptions are AGN screening choices. Both are labelled.',
    limits:'CONCEPT-STAGE inputs. Not design values, not code-compliant, not return-period derived. Wind design speed, seismic PGA and flood design depth each require the relevant standard and a site study.'},
  'asmt-report':{
    title:'Report Builder', phase:'Apply — the deliverable',
    purpose:'Assembles the screening result, drivers, confidence and stated assumptions into a client-ready evidence report.',
    input:'The completed site or portfolio assessment on this tab.',
    process:'Composes what was screened, what the engine returned, which assumptions were applied and what the limits are.',
    read:'Check the assumptions block before sending. Asset type, design life and horizon all came from this tab\u2019s selectors and appear in the report as stated inputs.',
    limits:'This report CERTIFIES NOTHING. Preliminary screening for prioritisation only. Not a loss estimate, not a design basis, not an insurance or lending decision document. Every hazard number in it is uncalibrated against an observed-impact ledger \u2014 see Operations \u203a Post Event Verification.'}
};;
  function openHelp(key){const h=help[key];if(!h)return;const back=$('workflowHelpBack');if(!back)return;$('workflowHelpTitle').textContent=h.title;$('workflowHelpPhase').textContent=h.phase;$('workflowHelpPurpose').textContent=h.purpose;$('workflowHelpInput').textContent=h.input;$('workflowHelpProcess').textContent=h.process;$('workflowHelpOutput').textContent=h.read||h.output||'';$('workflowHelpNext').textContent=h.limits||h.next||'';back.classList.add('open');back.setAttribute('aria-hidden','false');setTimeout(()=>$('workflowHelpClose').focus(),20);}
  

  window.openHelp=openHelp;
  function __agnCloseHelp(){
    const back=$('workflowHelpBack'); if(!back) return;
    back.classList.remove('open'); back.setAttribute('aria-hidden','true');
    try{ document.dispatchEvent(new CustomEvent('agn:help-closed')); }catch(_){}
  }
  window.__agnCloseHelp=__agnCloseHelp;
  try{
    const cb=$('workflowHelpClose'); if(cb) cb.addEventListener('click', __agnCloseHelp);
    const bk=$('workflowHelpBack');
    if(bk) bk.addEventListener('click', function(e){ if(e.target===bk) __agnCloseHelp(); });
    document.addEventListener('keydown', function(e){
      if(e.key==='Escape'){ const b=$('workflowHelpBack');
        if(b && b.classList.contains('open')) __agnCloseHelp(); }
    });
  }catch(_){}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();}

  function renderPlaces(rows){const menu=$('opsxPlaceMenu');if(!menu)return;menu.innerHTML='';if(!rows.length){menu.classList.remove('show');return;}rows.forEach(r=>{const b=document.createElement('button');b.type='button';b.className='opsx-place-result';b.setAttribute('role','option');const admin=[r.admin2,r.admin1].filter(Boolean).join(' · ');const elev=Number.isFinite(Number(r.elevation))?Math.round(Number(r.elevation))+' m':'Elevation pending';b.innerHTML='<b>'+esc(r.name)+'</b><span>'+esc(admin||'Pakistan')+' · '+esc(elev)+'</span>';b.addEventListener('click',()=>pickPlace(r));menu.appendChild(b);});menu.classList.add('show');}
    


  async function pickPlace(r){const menu=$('opsxPlaceMenu'),input=$('opsxPlaceInput'),note=$('opsxPlaceNote');if(menu)menu.classList.remove('show');if(input)input.value=r.name;if(note)note.textContent='Loading '+r.name+' through the shared system location engine…';if(typeof window.driveFromPoint!=='function'){if(note)note.textContent='Location engine is not ready. Reload and try again.';return;}const elev=Number.isFinite(Number(r.elevation))?Number(r.elevation):null;try{await window.driveFromPoint(Number(r.latitude),Number(r.longitude),r.name,true,elev);if(note)note.textContent='Active system location: '+r.name+'. All connected sections now use this shared location state.';setTimeout(()=>{try{const b=document.querySelector('#machNav button[data-goto="operations"]');if(b&&!b.classList.contains('active'))b.click();}catch(_){}},50);}catch(_){if(note)note.textContent='Could not load '+r.name+'. The previous active location remains unchanged.';}}
  function bind(){
    const inp=$('opsxPlaceInput');   /* v91.17.283.20 · B5: attached to the shared place search */
    if(inp) AGN.places.attach({input:inp, limit:12, delay:260, keepDisputed:true, render:function(R){ const rows=R.map(AGN.places.hit); renderPlaces(rows); if(!rows.length){ const n=$('opsxPlaceNote'); if(n) n.textContent='No Pakistani place matched that name. Try a district or tehsil name.'; } },
      clear:function(){ $('opsxPlaceMenu').classList.remove('show'); }});
    if($('opsxUseActivePlace'))$('opsxUseActivePlace').addEventListener('click',()=>{const n=$('opsxPlaceNote'),p=$('opsxPlace');if(n)n.textContent='Using '+((p&&p.textContent.replace(/^·\s*/,''))||'the current active location')+' from the shared system state.';if(inp)inp.value='';$('opsxPlaceMenu').classList.remove('show');});
    document.addEventListener('click',e=>{if(!e.target.closest('.opsx-location-search')&&$('opsxPlaceMenu'))$('opsxPlaceMenu').classList.remove('show');});
  }
  function init(){ bind(); }    
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
