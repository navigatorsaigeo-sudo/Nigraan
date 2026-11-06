


(function(G){'use strict';
  var D=G.document, AGN=G.AGN=G.AGN||{};
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function n(v,d){ return (v==null||!isFinite(v))?'—':Number(v).toFixed(d==null?1:d); }
  function pct(v){ return (v==null||!isFinite(v))?'—':Math.round(100*v)+' %'; }
  function dt(iso){ return iso?String(iso).slice(0,16).replace('T',' ')+(String(iso).length>10?' UTC':''):'—'; }
  var EVC={ 'OBSERVED':'o','MODELLED':'m','CALCULATED':'c','CLIENT SUPPLIED':'s' };
  function ev(cls){ return '<span class="rpt-ev '+(EVC[cls]||'')+'">'+esc(cls)+'</span>'; }
  function prov(p){ return '<span class="rpt-prov '+esc(p)+'">'+esc(String(p||'').replace('_','-'))+'</span>'; }
  function none(what,how){ return '<p class="rpt-na">Not available in this document — '+esc(what)+'. '+esc(how||'')+'</p>'; }
  var HOW='Load the client project, make the asset active, press Sync on the Casebook panel (Assets & Exposure), then generate again.';
  function tbl(head,rows){ return '<table class="rpt-plus-t"><thead><tr>'+head.map(function(x){ return '<th>'+esc(x)+'</th>'; }).join('')+'</tr></thead><tbody>'+rows.map(function(r){ return '<tr>'+r.map(function(x){ return '<td>'+x+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table>'; }
  function tag(r){ return (r.demo?' <span class="rpt-prov estimated">demonstration</span>':'')+(r.projectLevel?' <span class="rpt-prov">project-level</span>':''); }
   
  function lvl(r){ return esc(r.name)+' <b>'+esc(r.word)+'</b> ('+(r.day?'day +'+r.day:'today')+')'; }

   
  var PF={at:0,v:null,pid:null}, FAM={at:0,v:null};
  function local(){ try{ return /^https?:$/.test(location.protocol); }catch(_){ return false; } }
  function warm(){
    if(!local()) return; var pid=null; try{ pid=AGN.casebook&&AGN.casebook.projectId?AGN.casebook.projectId():null; }catch(_){}
    if(pid&&(PF.pid!==pid||Date.now()-PF.at>10*60e3)){ if(PF.pid!==pid){ PF.v=null; } PF.pid=pid;    
      var _on=(AGN.casebook&&AGN.casebook.onServer)?AGN.casebook.onServer(pid):Promise.resolve(true); _on.then(function(on){ if(!on||PF.pid!==pid) return null; return fetch('/api/case/portfolio?project='+encodeURIComponent(pid),{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ if(j&&j.ok&&j.project&&j.project.id===PF.pid){ PF.v=j; PF.at=Date.now(); } }); }).catch(function(){}); }    
    if(!FAM.v||Date.now()-FAM.at>60*60e3){ fetch('/api/case/families',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ if(j&&j.families){ FAM.v=j.families; FAM.at=Date.now(); } }).catch(function(){}); }
  }
   
  function frozen(){
    var d=null; try{ d=AGN.casebook&&AGN.casebook.document?AGN.casebook.document():null; }catch(_){}
    var doc=null;
    if(d&&d.ok){ doc=JSON.parse(JSON.stringify(d)); try{ if(doc.chain.hazard.rainProbability) delete doc.chain.hazard.rainProbability.days; if(doc.history&&doc.history.snapshots) doc.history.snapshots=doc.history.snapshots.slice(-12); }catch(_){} }
    var pf=PF.v?JSON.parse(JSON.stringify(PF.v)):null; if(pf&&pf.assets) pf.assets=pf.assets.slice(0,60);
    return { document:doc, portfolio:pf, families:FAM.v };
  }
  AGN.casebook=AGN.casebook||{}; AGN.casebook.frozen=frozen; AGN.casebook.warmPortfolio=warm;
  ['agn:casebook','agn:project','agn:active-asset'].forEach(function(e){ D.addEventListener(e,function(){ setTimeout(warm,800); }); });
  setTimeout(warm,6000);

   
  function CD(doc){ var c=doc&&doc.evidence&&doc.evidence.caseDocument; return (c&&c.ok)?c:null; }
  function mismatch(doc,c){ try{ if(doc.asset_id&&c.asset&&c.asset.id&&String(doc.asset_id)!==String(c.asset.id)) return '<p class="rpt-refusal"><b>Subject check.</b> This document is issued for asset '+esc(doc.asset_id)+'; the case document frozen with it is for '+esc(c.asset.id)+'. The case pages are printed for the case document’s asset and say so here.</p>'; }catch(_){} return ''; }

  var DRAW={
    pRiskCards:function(doc){
      var c=CD(doc); if(!c) return {drawn:true,html:none('no case document was frozen with it',HOW)};
      var cards=c.riskCards||[];
      var h=mismatch(doc,c)+'<p class="rpt-note">Values on this page: one card per hazard source in one shape — the value the engine returned, its evidence class, the forecast-quality tier where one applies, its provenance, and the evidence to drill into. A source that did not answer is printed as not available with the reason; no card is filled in by the platform.</p>'
        +'<p class="rpt-note">Asset '+esc(c.asset.name)+' ('+esc(c.asset.id)+')'+(c.chain.hazard.unit?', tehsil '+esc(c.chain.hazard.unit.name)+', '+esc(c.chain.hazard.unit.district):'')+' · case document built '+dt(c.builtAt)+'.</p><div class="rpt-cards">';
      cards.forEach(function(k){
        h+='<div class="rpt-card"><div class="h">'+esc(k.hazard)+'</div><div class="v'+(k.value==null?' na':'')+'">'+(k.value==null?'Not available — ':'')+esc(k.headline)+'</div>'
          +'<div class="m">'+ev(k.evidenceClass)+(k.quality?'<b>'+esc([k.quality.mark,k.quality.tier?'tier '+k.quality.tier:'',k.quality.label].filter(Boolean).join(' · '))+'</b> · ':(k.validated?'<b>'+esc(k.validated)+'</b> · ':''))+'provenance '+esc(k.provenance)+(k.asOf?' · as of '+esc(String(k.asOf).slice(0,16).replace('T',' ')):'')+'</div>'
          +'<div class="drill rpt-drill"><b>Source</b> '+esc(k.source)+'<br><b>Method</b> '+esc(k.method)+'<br><b>Limit</b> '+esc(k.limitation)+(k.drill&&k.drill.length?'<br><b>Drill</b> '+esc(k.drill.join(' · ')):'')+'</div></div>';
      });
      h+='</div><p class="rpt-note">Evidence classes: OBSERVED — a measurement or a documented record; MODELLED — a model value; CALCULATED — derived by a stated rule from stated inputs; CLIENT SUPPLIED — the client’s record. Tier A: a MACH station within reach measures the forecast; B: forecast at the settlement height from open terrain and population layers; C: forecast with terrain proxies.</p>';
      return {drawn:true,html:h};
    },
    pCaseChain:function(doc){
      var c=CD(doc); if(!c) return {drawn:true,html:none('no case document was frozen with it',HOW)};
      var ch=c.chain, cnt=c.confidence.assetDataQuality;
      function layer(name,L){ var keys=Object.keys(L||{}); if(!keys.length) return ''; var miss=keys.filter(function(k){ return L[k].provenance==='missing'; }).length;
        return '<h4 style="margin:10px 0 4px;font-size:12.5px;color:#0C3851">'+esc(name)+' <span class="rpt-note" style="font-weight:400">'+(keys.length-miss)+' of '+keys.length+' fields present</span></h4><table class="rpt-plus-t"><thead><tr><th>Field</th><th>Value</th><th>Provenance</th><th>Source</th></tr></thead><tbody>'
          +keys.map(function(k){ var r=L[k]; return '<tr><td>'+esc(k.replace(/_/g,' '))+'</td><td>'+(r.value==null?'<i>missing</i>':esc(typeof r.value==='object'?JSON.stringify(r.value):r.value))+'</td><td>'+prov(r.provenance)+'</td><td>'+esc(r.source||'')+'</td></tr>'; }).join('')+'</tbody></table>'; }
      var steps=[['HAZARD',ch.hazard.sources.length?'g':'w',ch.hazard.sources.length+' source'+(ch.hazard.sources.length===1?'':'s')],['EXPOSURE',null,''],['VULNERABILITY',null,''],['CONDITION',ch.condition.condition_class.provenance==='missing'?'w':'g',ch.condition.condition_class.provenance],['CONSEQUENCE',null,''],['RESPONSE',(ch.response.interventions||[]).length?'g':'w',(ch.response.interventions||[]).length+' recorded'],['RESIDUAL',ch.residual.declared.length?'g':'w',ch.residual.declared.length+' declared'],['MONITORING',ch.monitoring.snapshots?'g':'w',ch.monitoring.snapshots+' snapshot'+(ch.monitoring.snapshots===1?'':'s')]];
      var h=mismatch(doc,c)+'<p class="rpt-note">Values on this page: CLIENT SUPPLIED record with a provenance class on every field (verified / client-supplied / estimated / missing) · the hazard step is the risk-card page · nothing is estimated by the platform.</p>'
        +'<div class="rpt-chain">'+steps.map(function(s){ return '<span class="'+(s[1]||'')+'">'+s[0]+(s[2]?' · '+esc(s[2]):'')+'</span>'; }).join('<span style="background:none;padding:3px 0">→</span>')+'</div>'
        +'<p class="rpt-note">Hazard: '+(ch.hazard.sources.length?esc(ch.hazard.sources.join('; ')):'no engine answered for this point')+'. The values are on the risk-card page.</p>'
        +layer('Exposure',ch.exposure)+layer('Vulnerability',ch.vulnerability)+layer('Condition',ch.condition)+layer('Consequence',ch.consequence)
        +(ch.limits&&ch.limits.length?'<h4 style="margin:10px 0 4px;font-size:12.5px;color:#0C3851">Operating limits</h4><table class="rpt-plus-t"><thead><tr><th>Limit</th><th>Value</th><th>Authority</th><th>Provenance</th></tr></thead><tbody>'+ch.limits.map(function(l){ return '<tr><td>'+esc(l.name||l.variable||l.id||'')+'</td><td>'+esc(l.value!=null?l.value:(l.threshold!=null?l.threshold:''))+' '+esc(l.unit||'')+'</td><td>'+esc(l.authority||'')+'</td><td>'+prov(l.provenance)+'</td></tr>'; }).join('')+'</tbody></table>':'')
        +'<p class="rpt-note">Residual: '+esc(ch.residual.note)+(ch.residual.declared.length?' — '+esc(ch.residual.declared.map(function(r){ return (r.hazard||'')+' '+r.before+' → '+r.after+' ('+r.provenance+')'; }).join('; ')):'')+'. Record: '+cnt.verified+' verified · '+cnt.client_supplied+' client-supplied · '+cnt.estimated+' estimated · '+cnt.missing+' missing ('+c.confidence.assetCompleteness+' % present).</p>';
      return {drawn:true,html:h};
    },
    pTracker:function(doc){
      var c=CD(doc); if(!c) return {drawn:true,html:none('no case document was frozen with it',HOW)};
      var iv=c.chain.response.interventions||[], bs=c.chain.response.byStatus||{};
      var h=mismatch(doc,c)+'<p class="rpt-note">Values on this page: CLIENT SUPPLIED intervention records with the status the client set; the risk classes before and after carry their own provenance; the platform computes no residual risk.</p>'
        +'<p class="rpt-lead">'+iv.length+' intervention'+(iv.length===1?'':'s')+' on record: '+Object.keys(bs).filter(function(k){ return bs[k]; }).map(function(k){ return bs[k]+' '+k.replace('_',' '); }).join(', ')+'.</p>';
      if(!iv.length) h+='<p class="rpt-na">No intervention is recorded for this asset. The tracker is written by the client on the Casebook panel; an empty tracker is printed as empty, not as “no action needed”.</p>';
      else h+='<table class="rpt-plus-t"><thead><tr><th>Intervention</th><th>Hazard</th><th>Status</th><th>Owner · due</th><th>Risk before → after</th><th>Evidence</th><th>Last change</th></tr></thead><tbody>'+iv.map(function(x){ var hs=(x.history||[]).slice(-1)[0]; return '<tr><td>'+esc(x.title)+(x.description?'<br><span class="rpt-note">'+esc(x.description)+'</span>':'')+'</td><td>'+esc(x.hazard||'')+'</td><td><b>'+esc(String(x.status).replace('_',' '))+'</b></td><td>'+esc(x.owner||'')+(x.due?' · '+esc(x.due):'')+'</td><td>'+esc(x.riskBefore.class)+' → '+esc(x.riskAfter.class)+' '+prov(x.riskAfter.provenance)+(x.riskAfter.basis?'<br><span class="rpt-note">'+esc(x.riskAfter.basis)+'</span>':'')+'</td><td>'+((x.evidence||[]).length?esc(x.evidence.join('; ')):'none')+'</td><td>'+(hs?esc(dt(hs.at))+(hs.by?' · '+esc(hs.by):''):'')+'</td></tr>'; }).join('')+'</tbody></table>';
      return {drawn:true,html:h};
    },
    pCaseConfidence:function(doc){
      var c=CD(doc); if(!c) return {drawn:true,html:none('no case document was frozen with it',HOW)};
      var f=c.confidence;
      var h=mismatch(doc,c)+'<p class="rpt-note">Values on this page: CALCULATED from what the document holds — counts of fields by provenance class, the coverage class of the point, and the ensembles’ agreement for the first day; the overall class follows the stated rule.</p>'
        +'<div class="rpt-plus-kpis"><div><div class="k">Overall</div><div class="v">'+esc(f.overall)+'</div><div class="s">by the rule below</div></div><div><div class="k">Observational coverage</div><div class="v" style="font-size:12.5px">'+esc(f.observationalCoverage)+'</div></div><div><div class="k">Model agreement, rain day 1</div><div class="v" style="font-size:12.5px">'+esc(f.modelAgreement)+'</div></div><div><div class="k">Asset record</div><div class="v">'+esc(f.assetCompleteness)+' %</div><div class="s">'+esc(f.assetDataQuality.verified)+' verified · '+esc(f.assetDataQuality.missing)+' missing</div></div></div>'
        +'<p>Engineering information: '+esc(f.engineeringInformation)+'.</p><p class="rpt-note"><b>Rule.</b> '+esc(f.rule)+'</p>'
        +'<p class="rpt-note">Confidence is a statement about the evidence behind this document, not about the hazard. A low class means the record is thin or unverified; it does not mean the risk is low.</p>';
      return {drawn:true,html:h};
    },
    pCaseHistory:function(doc){
      var c=CD(doc); if(!c) return {drawn:true,html:none('no case document was frozen with it',HOW)};
      var H=c.history||{snapshots:[],changes:[]};
      var h=mismatch(doc,c)+'<p class="rpt-note">Values on this page: CALCULATED summaries frozen at each snapshot; a change is named by the field that moved.</p>';
      if(!H.snapshots.length) h+='<p class="rpt-na">No snapshot has been taken for this asset. Take one on the Casebook panel at each review; the year-on-year line is the difference between two dated snapshots, never a trend the platform infers.</p>';
      else h+='<table class="rpt-plus-t"><thead><tr><th>Snapshot</th><th>Label</th><th>Record present</th><th>Interventions</th><th>Residual declared</th><th>Map levels raised</th><th>Hot-season UTCI</th><th>Rain P25 day 1</th><th>Urban term</th><th>Overall</th></tr></thead><tbody>'+H.snapshots.map(function(s){ var m=s.summary||{}; return '<tr><td>'+esc(dt(s.at))+'</td><td>'+esc(s.label||'')+'</td><td class="n">'+esc(m.completeness)+' %</td><td>'+esc(Object.keys(m.interventions||{}).filter(function(k){ return m.interventions[k]; }).map(function(k){ return m.interventions[k]+' '+k.replace('_',' '); }).join(', ')||'none')+'</td><td class="n">'+esc(m.residualDeclared)+'</td><td>'+(m.mapLevels==null?'—':(Object.keys(m.mapLevels).length?esc(Object.keys(m.mapLevels).map(function(k){ return k+' '+m.mapLevels[k]; }).join(' · ')):'none'))+'</td><td class="n">'+(m.hotSeasonUtci90!=null?n(m.hotSeasonUtci90)+' °C':'—')+'</td><td class="n">'+pct(m.rainP25Day1)+'</td><td class="n">'+(m.urbanTermC!=null?n(m.urbanTermC,2)+' °C':'—')+'</td><td>'+esc(m.overall)+'</td></tr>'; }).join('')+'</tbody></table>'
        +(H.changes.length?'<p><b>Changes.</b> '+H.changes.map(function(x){ return esc(x.from.slice(0,10))+' → '+esc(x.to.slice(0,10))+': '+(Object.keys(x.changed).length?esc(Object.keys(x.changed).map(function(k){ var v=x.changed[k]; return k+(v&&v.from!==undefined&&typeof v.from!=='object'?' '+v.from+' → '+v.to:''); }).join(', ')):'no field moved'); }).join('; ')+'.</p>':'')
        +'<p class="rpt-note">'+esc(H.note||'')+'</p>';
      return {drawn:true,html:h};
    },
    pCaseStandards:function(doc){
      var c=CD(doc), fams=doc.evidence&&doc.evidence.caseFamilies;
      var has=function(p){ return (doc.pages||[]).indexOf(p)>=0; };
       
      var rows=[
        ['ISO 14091:2021 — adaptation: vulnerability, impacts and risk assessment','screening of hazards and impact chains; data and uncertainty stated',(has('pRiskCards')?'risk cards; ':'')+(has('pCaseChain')?'decision chain (hazard → consequence) with provenance; ':'')+(has('pCaseConfidence')?'confidence panel':''),'a scope and stakeholder statement the client owns; future-hazard scenarios beyond the climatology baseline (CMIP6 deltas are on the site report only where the dataset covers the unit)'],
        ['ISO 31000:2018 — risk management','6.4 assessment · 6.5 treatment · 6.6 monitoring and review · 6.7 recording and reporting',(has('pRiskCards')||has('pCasePortfolio')?'assessment inputs (cards / portfolio rows); ':'')+(has('pTracker')?'treatment record (tracker); ':'')+(has('pCaseHistory')?'monitoring (snapshots); ':'')+(has('pRepro')?'recording (reproducibility record)':''),'risk criteria and appetite (the client’s), and an evaluation against them; the platform ranks nothing across assets'],
        ['ISO 55001:2014 — asset management','asset information, condition, and the planning of interventions',(has('pCaseChain')?'condition and vulnerability fields with their provenance and the inspection authority; ':'')+(has('pTracker')?'intervention record with owner, due date and status':''),'life-cycle cost, performance evaluation, and any statement that the asset management system conforms'],
        ['TNFD — LEAP approach','Locate (assets and their setting) · Assess (physical risk)','asset location and unit; the physical-hazard cards','Evaluate (nature dependencies and impacts) and Prepare: not in NIGRAAN’s scope'],
        ['GRI 102 (climate change) — physical risk and adaptation','description of physical risks and of adaptation actions',(has('pRiskCards')?'the physical-hazard cards; ':'')+(has('pTracker')?'the adaptation tracker as the record of actions':''),'transition risk and the disclosure narrative itself']
      ];
      var h='<p class="rpt-note">This crosswalk says where the pages of this document sit against each standard. It is not a statement of conformity with any of them, and it names what the document does not provide beside what it does.</p>'
        +'<table class="rpt-plus-t"><thead><tr><th>Standard</th><th>Theme</th><th>This document provides</th><th>It does not provide</th></tr></thead><tbody>'+rows.map(function(r){ return '<tr><td><b>'+esc(r[0])+'</b></td><td>'+esc(r[1])+'</td><td>'+(r[2]?esc(r[2]):'<i>nothing on this route</i>')+'</td><td>'+esc(r[3])+'</td></tr>'; }).join('')+'</tbody></table>';
      if(fams){ h+='<p class="rpt-note"><b>Families.</b> '+esc(Object.keys(fams).map(function(k){ var f=fams[k]; return f.title+(f.sections?' ('+f.sections.length+' sections, each held or input required)':''); }).join(' · '))+'.</p>'; }
      return {drawn:true,html:h};
    },
    pCasePortfolio:function(doc){
      var pf=doc.evidence&&doc.evidence.casePortfolio; if(!pf||!pf.ok) return {drawn:true,html:none('no portfolio was frozen with it','Sync the client project to the server on the Casebook panel; the portfolio is read for every asset of that project.')};
      var S=pf.summary, SC=pf.scale||{}, A=(pf.assets||[]).filter(function(r){ return r.ok; }).sort(function(a,b){ return ((b.flags||[]).length-(a.flags||[]).length)||(b.missing-a.missing)||String(a.name).localeCompare(String(b.name)); }), bad=(pf.assets||[]).filter(function(r){ return !r.ok; });
       
      var h='<p class="rpt-note">Values on this page: the hazard levels the map draws for each asset\'s tehsil (the server engine; the highest over the days it derives), CLIENT SUPPLIED record counts, and flags: a hazard at '+esc(SC.reachedFrom||'the response-trigger level')+' or above. Standing items are records (the river flood map at the floor, a documented outburst), not forecasts. The table is ordered by the number of flags, then by missing fields; it is not a ranking of risk across assets.</p>'
        +'<p class="rpt-note">Project '+esc(pf.project.client||pf.project.id)+' · built '+dt(pf.builtAt)+'.</p>'
        +'<div class="rpt-plus-kpis"><div><div class="k">Assets</div><div class="v">'+S.documented+' / '+S.assets+'</div><div class="s">documented · '+S.withCoordinates+' with coordinates</div></div><div><div class="k">Flagged today</div><div class="v">'+S.flagged+'</div><div class="s">a hazard at '+esc(SC.reachedFrom||'the trigger level')+' or above on the map</div></div><div><div class="k">Record present</div><div class="v">'+(S.meanCompleteness==null?'—':S.meanCompleteness+' %')+'</div><div class="s">mean over the chain fields · confidence '+S.overall.moderate+' moderate, '+S.overall.low+' low</div></div><div><div class="k">Adaptation</div><div class="v">'+S.interventionsOpen+' open · '+S.interventionsDone+' done</div><div class="s">'+S.snapshots+' asset'+(S.snapshots===1?'':'s')+' with a snapshot</div></div></div>'
        +'<table class="rpt-plus-t"><thead><tr><th>Asset</th><th>Unit</th><th>Map levels above '+esc((SC.levels||[])[0]||'the first level')+'</th><th>Flags</th><th>Standing</th><th>Record</th><th>Confidence</th><th>Interventions</th><th>Snapshot</th></tr></thead><tbody>'
        +A.map(function(r){ var fl=r.flags||[], st=r.standing||[]; return '<tr'+(fl.length?' class="rpt-plus-m"':'')+'><td><b>'+esc(r.name)+'</b>'+(r.type?'<br><span class="rpt-note">'+esc(r.type)+'</span>':'')+'</td><td>'+esc(r.unit||'—')+(r.district?'<br><span class="rpt-note">'+esc(r.district)+'</span>':'')+'</td><td>'+(r.levels==null?'<i>not available</i>':(r.levels.length?r.levels.map(lvl).join('<br>'):'none'))+'</td><td>'+(fl.length?esc(fl.join('; ')):(r.flagsWhy?'<span class="rpt-note">'+esc(r.flagsWhy)+'</span>':'none'))+'</td><td>'+(st.length?esc(st.join('; ')):'none')+'</td><td class="n">'+esc(r.completeness)+' %<br><span class="rpt-note">'+r.verified+' verified · '+r.missing+' missing</span></td><td>'+esc(r.overall)+'</td><td>'+r.interventions.open+' open · '+r.interventions.done+' done</td><td>'+(r.lastSnapshot?esc(String(r.lastSnapshot).slice(0,10)):'none')+'</td></tr>'; }).join('')+'</tbody></table>'
        +(bad.length?'<p class="rpt-na">'+bad.length+' asset'+(bad.length===1?'':'s')+' without a case document: '+esc(bad.map(function(b){ return b.name+' ('+b.why+')'; }).join('; '))+'.</p>':'')
        +'<p class="rpt-note"><b>Flags.</b> '+esc(pf.rule)+'</p>';
      return {drawn:true,html:h};
    },
    pCaseBoard:function(doc){
      var pf=doc.evidence&&doc.evidence.casePortfolio; if(!pf||!pf.ok) return {drawn:true,html:none('no portfolio was frozen with it','Sync the client project to the server on the Casebook panel and generate again.')};
      var S=pf.summary, SC=pf.scale||{}, A=(pf.assets||[]).filter(function(r){ return r.ok; }), fl=A.filter(function(r){ return (r.flags||[]).length; }), sd=A.filter(function(r){ return (r.standing||[]).length; }), nov=A.filter(function(r){ return r.verified===0; }), noc=A.filter(function(r){ return !r.coordinates; });
      var h='<p class="rpt-note">Values on this page: counts over the case documents of this project; every figure is traceable to the portfolio page and to each asset’s case document.</p><div class="rpt-board">'
        +'<p><b>'+esc(pf.project.client||pf.project.id)+'</b> — '+S.documented+' of '+S.assets+' assets hold a case document on the NIGRAAN server as of '+dt(pf.builtAt)+'.</p><ul>'
        +'<li><b>What the map flags today.</b> '+(fl.length?fl.length+' asset'+(fl.length===1?'':'s')+': '+esc(fl.map(function(r){ return r.name+' ('+r.flags.join(', ')+')'; }).join('; '))+'.':'No asset has a hazard at '+esc(SC.reachedFrom||'the response-trigger level')+' or above on the map, today or in the days the engine derives.')+(sd.length?' Standing records: '+esc(sd.map(function(r){ return r.name+' ('+r.standing.join(', ')+')'; }).join('; '))+'.':'')+'</li>'
        +'<li><b>What the record lacks.</b> Mean '+(S.meanCompleteness==null?'—':S.meanCompleteness+' %')+' of the chain fields present; '+nov.length+' asset'+(nov.length===1?'':'s')+' with no verified field'+(nov.length?' ('+esc(nov.map(function(r){ return r.name; }).join(', '))+')':'')+(noc.length?'; '+noc.length+' without coordinates':'')+'. Confidence: '+S.overall.moderate+' moderate, '+S.overall.low+' low, '+S.overall.high+' high.</li>'
        +'<li><b>The adaptation programme.</b> '+S.interventionsOpen+' intervention'+(S.interventionsOpen===1?'':'s')+' open, '+S.interventionsDone+' done; residual risk is declared on '+A.reduce(function(s,r){ return s+r.residualDeclared; },0)+' completed intervention'+(A.reduce(function(s,r){ return s+r.residualDeclared; },0)===1?'':'s')+'.</li>'
        +'<li><b>Year on year.</b> '+S.snapshots+' asset'+(S.snapshots===1?'':'s')+' carr'+(S.snapshots===1?'ies':'y')+' a dated snapshot; the change line is on each asset case report.</li>'
        +'</ul><p><b>What this brief does not say.</b> It ranks no asset against another, states no probability of loss and no monetary figure, and does not replace the official warnings of the national meteorological and disaster-management authorities. A flag is the map\'s level at or above '+esc(SC.reachedFrom||'the response-trigger level')+', the response-trigger level of the map\'s scale; the decision belongs to the owner named on the tracker.</p></div>';
      return {drawn:true,html:h};
    }
  };
  var PAGES={
    pRiskCards:{title:'Risk cards · the standard card per hazard source',needs:['caseDocument'],gives:'one card per hazard source in one shape: value, evidence class, validation, provenance, source, method, limitation, drill'},
    pCaseChain:{title:'Decision chain · hazard to monitoring, with provenance',needs:['caseDocument'],gives:'the client record by layer with a provenance class on every field, the limits, the declared residual'},
    pTracker:{title:'Adaptation tracker',needs:['caseDocument'],gives:'every intervention on record with status, owner, due date and the declared risk classes'},
    pCaseConfidence:{title:'Confidence in this document',needs:['caseDocument'],gives:'the confidence panel and its rule'},
    pCaseHistory:{title:'Year on year · snapshots and what moved',needs:['caseDocument'],gives:'the dated snapshots and the named changes between them'},
    pCaseStandards:{title:'Standards crosswalk',needs:[],gives:'where this document sits against ISO 14091, ISO 31000, ISO 55001, TNFD and GRI; not a conformity statement'},
    pCasePortfolio:{title:'Portfolio · every asset from its own case document',needs:['casePortfolio'],gives:'one row per asset: engine values, flags, record quality, confidence, interventions, snapshot'},
    pCaseBoard:{title:'Board brief',needs:['casePortfolio'],gives:'the project in five lines: flags today, what the record lacks, the adaptation programme, year on year, what the brief does not say'},
  };
  var TYPES={
    caseAsset:{ docTitle:'AI GEO NIGRAAN Asset Case Report', docPurpose:'Record the decision chain for one asset, with the provenance of every input', label:'Asset case report', desc:'The situation, the decision summary, the risk cards, the decision chain with provenance, the adaptation tracker, the confidence panel, the year-on-year snapshots, the standards crosswalk, the measured forecast error, the reproducibility record and what the document does not claim.' },
    casePortfolio:{ docTitle:'AI GEO NIGRAAN Portfolio Case Report', docPurpose:'See every asset of the project from its own case document, without ranking them', label:'Portfolio case report', desc:'One row per asset from its case document, the standards crosswalk, the reproducibility record and what the document does not claim.' },
    caseBoard:{ docTitle:'AI GEO NIGRAAN Board Brief', docPurpose:'Tell a board what the engines flag, what the record lacks, and where the adaptation programme stands', label:'Board brief', desc:'The board brief, the standards crosswalk and what the document does not claim.' },
  };
  var ROUTES={
    caseAsset:['pCover','pSituation','pSummary','pRiskCards','pCaseChain','pTracker','pCaseConfidence','pCaseHistory','pCaseStandards','pVerified','pRepro','pLimits'],
    casePortfolio:['pCover','pCasePortfolio','pCaseStandards','pRepro','pLimits'],
    caseBoard:['pCover','pCaseBoard','pCaseStandards','pLimits']
  };
  

  function drawable(R,id){ return !!(R.PAGES[id]||(AGN.reportExtraPages||{})[id]); }
  function ins(arr,id,after){ if(arr.indexOf(id)>=0) return; var i=arr.indexOf(after); if(i>=0) arr.splice(i+1,0,id); }
  function insBefore(arr,id,before){ if(arr.indexOf(id)>=0) return; var i=arr.indexOf(before); if(i>=0) arr.splice(i,0,id); }
  (function install(k){
    var R=AGN.report; if(!R||!R.PAGES||!R.ROUTES||!R.TYPES||!AGN.reportExtraDraw) return k<120&&setTimeout(function(){ install(k+1); },250);
    Object.keys(PAGES).forEach(function(id){ if(!R.PAGES[id]) R.PAGES[id]=PAGES[id]; });
    Object.keys(DRAW).forEach(function(id){ AGN.reportExtraDraw[id]=DRAW[id]; });
    Object.keys(TYPES).forEach(function(t){ if(!R.TYPES[t]) R.TYPES[t]=TYPES[t]; if(!R.ROUTES[t]) R.ROUTES[t]=ROUTES[t].filter(function(id){ return drawable(R,id); }); });
     
    

    ['brief','operations','technical','readiness72','weatherImpact','engineering'].forEach(function(t){ if(R.ROUTES[t]) ins(R.ROUTES[t],'pRiskCards','pSummary'); });
    ['technical','engineering'].forEach(function(t){ if(R.ROUTES[t]){ insBefore(R.ROUTES[t],'pCaseChain','pRepro'); insBefore(R.ROUTES[t],'pTracker','pRepro'); } });
    if(R.ROUTES.portfolio) ins(R.ROUTES.portfolio,'pCasePortfolio','pPortfolio');
    AGN.caseReport={PAGES:PAGES,ROUTES:ROUTES,TYPES:TYPES,installed:true};
  })(0);
})(window);
