
(function(G){
  'use strict';
  var D=document;
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function isOp(){ try{ return !!(G.AGN&&G.AGN.operator&&G.AGN.operator()); }catch(_){ return false; } }
  function fmtDate(ms){ try{ return new Date(ms).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Karachi'}); }catch(_){ return ''; } }
  

  function snapPoll(){ try{ fetch('/api/snapshot',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ if(j&&j.id&&!j.pending){ G.AGN=G.AGN||{}; G.AGN.snapshot={id:j.id,parts:j.parts,at:j.at}; } }).catch(function(){}); }catch(_){} }
  snapPoll(); setInterval(snapPoll,5*60e3);
  /* v91.17.270: a hazard row's level, 0-4: the engine's (the rows carry no page index any more); an old record's index through the ladder */
  function hzLv(h){ if(!h||h.categorical===true) return null; if(h.level!=null&&isFinite(Number(h.level))) return Number(h.level); var v=hzIdx(h), b=(v!=null&&window.agnBandOf)?agnBandOf(v):null; return b?b.index:null; }
  function hzIdx(h){ if(!h||h.categorical===true) return null; var v=h.screeningIndex!==undefined?h.screeningIndex:h.score; if(v==null||v==='') return null; v=Number(v); return isFinite(v)?v:null; }    

   
  var PAGES={
    pSiteRisk:{title:'What could affect this site in the next 15 days',needs:[],gives:'the compound and cascading pathways the 15-day forecast switches on at the site, with dates, numbers, consequence and first action for the asset type'},
    pEngScreen:{title:'Screening values for this site',needs:[],gives:'long-record screening values for extreme rain, wind and heat at the site, its flood position, and a level (Normal / Low / Moderate / High / Severe) verdict for the next 15 days'},
    pAnalytics:{title:'Analysis: what is happening, why, and what comes next',needs:[],gives:'1 descriptive: every hazard\'s level at the site now; 2 diagnostic: what drives the leading hazards; 3 predictive: the next 72 hours and the 15-day verdicts'},
    pNextSteps:{title:'What to do, and suggestions',needs:[],gives:'what to do now, what to study, what to monitor and when to review, drawn from the findings of this document'}
  };
  function SR(doc){ return (doc&&doc.evidence&&doc.evidence.siteRisk)||null; }
  function SS(doc){ return (doc&&doc.evidence&&doc.evidence.siteScreening)||null; }
  

  function lvOf(r,j){ var L=j&&j.scale&&j.scale.levels; return r&&r.verdict&&L&&L.indexOf(r.verdict)>=0?r.verdict:null; }
  function reachedOf(r,j){ if(!r) return false; if(typeof r.reached==='boolean') return r.reached; var S=j&&j.scale, v=lvOf(r,j); return !!(v&&S.reachedFrom&&S.levels.indexOf(v)>=S.levels.indexOf(S.reachedFrom)); }
  function vdPill(r,j){ var v=lvOf(r,j); if(v) return '<span class="rp-vd lv-'+v+'">'+esc(v)+'</span>';
    var st=r.state||'Input required: a level for this row (regenerate the document)'; return '<span class="rp-vd st'+(/^Input required/.test(st)?' need':'')+'">'+esc(st)+'</span>'; }
  var DRAW={
    pSiteRisk:function(doc){
      var j=SR(doc);
      if(!j) return {drawn:true,html:'<p>The 15-day site outlook was not ready when this document was frozen. Regenerate the document to include it.</p>'};
      var _hasAsset=!!(doc&&doc.subject&&doc.subject.asset_id);    
      var h='<p class="rpt-sub">Asset type: <b>'+esc(_hasAsset?(j.sectorLabel||j.sector):'Not specified (site screening)')+'</b> · '+esc(j.place&&j.place.name)+', '+esc(j.place&&j.place.district)+' · forecast '+esc(j.window&&j.window[0])+' to '+esc(j.window&&j.window[1])+'</p><div class="rp-sr">';
      if(!j.active.length) h+='<div class="rp-none">'+esc(j.none)+'</div>';
      j.active.forEach(function(a){ h+='<article><h4>'+esc(a.title)+'</h4><div class="w">'+esc(a.when||'')+(a.chance!=null?' · chance '+esc(a.chance)+' %':'')+'</div><ul>'
        +a.facts.map(function(f){ return '<li>'+esc(f)+'</li>'; }).join('')+'</ul><p class="c">'+esc(a.chain.join(' → '))+'</p>'
        +'<p><b>Consequence.</b> '+esc(a.impact)+'</p><p><b>First action.</b> '+esc(a.action)+'</p></article>'; });
      h+='</div><p class="rpt-note">'+esc(j.note)+'</p>';
      return {drawn:true,html:h}; },
    pEngScreen:function(doc){
      var j=SS(doc);
      if(!j) return {drawn:true,html:'<p>The screening values for this site were still being prepared when this document was frozen. Regenerate the document to include them.</p>'};
      var h='<table><thead><tr><th>Parameter</th><th>Screening values</th><th>Next 15 days</th><th>Level</th><th>What it means</th></tr></thead><tbody>'
        +j.rows.map(function(r){ return '<tr><td><b>'+esc(r.parameter)+'</b></td><td>'+(r.values?esc(r.values):'—')+(r.history?'<br><span class="rpt-note">'+esc(r.history)+'</span>':'')+'</td><td>'+(r.forecast?esc(r.forecast):'—')+'</td><td>'+vdPill(r,j)+'</td><td>'+esc(r.meaning)+'</td></tr>'; }).join('')
        +'</tbody></table><p class="rpt-note">'+esc(j.note)+(j.returnLevels?' '+esc(j.returnLevels.method)+', '+esc(j.returnLevels.years)+'. '+esc(j.returnLevels.caveat):'')+'</p>';
      return {drawn:true,html:h}; },
    pAnalytics:function(doc){
      var A=(doc.evidence||{}).analytics;
      if(!A||!A.hazards||!A.hazards.length) return {drawn:true,html:'<p>The hazard levels for this place were still loading when this document was frozen. Regenerate the document to include the analysis.</p>'};
      var COL={Normal:'#74c476',Low:'#f5d04a',Moderate:'#fdae61',High:'#e8552d',Severe:'#a50026'};    
      var H=A.hazards.slice().sort(function(a,b){ return (b.score||0)-(a.score||0); });
       
      var W=640, rh=26, top=18, left=150, w=W-left-60, hh=top+H.length*rh+22;
      var svg='<svg class="rp-an" viewBox="0 0 '+W+' '+hh+'" width="100%" role="img" aria-label="Hazard levels now">';
      [25,45,65,82].forEach(function(c){ var x=left+w*c/100; svg+='<line x1="'+x+'" y1="'+(top-6)+'" x2="'+x+'" y2="'+(top+H.length*rh)+'" stroke="#d5dde3" stroke-dasharray="3 3"/><text x="'+x+'" y="'+(top-8)+'" font-size="9" fill="#6b7c88" text-anchor="middle">'+c+'</text>'; });
      H.forEach(function(h,i){ var y=top+i*rh, bw=Math.max(2,w*(h.score||0)/100);
        svg+='<text x="'+(left-8)+'" y="'+(y+16)+'" font-size="11" fill="#0c3851" text-anchor="end">'+esc(h.label)+'</text>'
          +'<rect x="'+left+'" y="'+(y+5)+'" width="'+w+'" height="14" rx="3" fill="#f1f4f6"/>'
          +'<rect x="'+left+'" y="'+(y+5)+'" width="'+bw+'" height="14" rx="3" fill="'+(COL[h.band]||'#c9d1d7')+'"/>'
          +'<text x="'+(left+w+8)+'" y="'+(y+16)+'" font-size="11" fill="#0c3851">'+(h.score==null?'—':Math.round(h.score))+' · '+esc(h.band||'')+'</text>'; });
      svg+='<text x="'+left+'" y="'+(hh-4)+'" font-size="9" fill="#6b7c88">Screening index 0-100 · bands Normal &lt;25, Low 25-44, Moderate 45-64, High 65-81, Severe 82+ · each hazard on its own scale</text></svg>';
      var lead=H[0], worst=H.filter(function(h){ return h.band&&h.band!=='Normal'; });
      var h1='<h3 class="rp-an-h">1 · Descriptive · what is happening</h3><p>'+(worst.length?('At '+esc(A.unit)+(doc&&doc.at?' (levels as frozen when the report was made)':'')+' '+worst.length+' of '+H.length+' hazards sit above Normal; the highest is <b>'+esc(lead.label)+'</b> at '+Math.round(lead.score)+' ('+esc(lead.band)+').'):('At '+esc(A.unit)+' every scored hazard is Normal.'))+'</p>'+svg;
       
      var h2='<h3 class="rp-an-h">2 · Diagnostic · why</h3><table class="rp-an-t"><thead><tr><th>Hazard</th><th>Leading driver</th><th>Inputs behind the level</th></tr></thead><tbody>'
        +H.slice(0,3).map(function(h){ return '<tr><td><b>'+esc(h.label)+'</b><br>'+(h.score==null?'—':Math.round(h.score))+' · '+esc(h.band||'')+'</td><td>'+esc(h.top||'—')+'</td><td>'+(h.inputs||[]).map(function(x){ return esc(x[0])+': <b>'+esc(x[1])+'</b>'; }).join('<br>')+'</td></tr>'; }).join('')+'</tbody></table>';
       
      var h3='<h3 class="rp-an-h">3 · Predictive · what comes next</h3>', F=A.fc72;
      if(F&&F.t&&F.t.length>6){ var n=F.t.length, CW=640, CH=170, L=34, R=34, T=12, B=26, iw=CW-L-R, ih=CH-T-B;
        var tv=F.t.filter(function(v){ return v!=null; }), tmin=Math.floor(Math.min.apply(null,tv))-1, tmax=Math.ceil(Math.max.apply(null,tv))+1, rmax=Math.max(2,Math.max.apply(null,(F.p||[]).map(function(v){ return v||0; })));
        var X=function(i){ return L+iw*i/(n-1); }, Y=function(v){ return T+ih*(1-(v-tmin)/(tmax-tmin)); };
        var c='<svg class="rp-an" viewBox="0 0 '+CW+' '+CH+'" width="100%" role="img" aria-label="Next 72 hours">';
        (F.p||[]).forEach(function(v,i){ if(v>0){ var bh=ih*Math.min(1,v/rmax); c+='<rect x="'+(X(i)-2)+'" y="'+(T+ih-bh)+'" width="4" height="'+bh+'" fill="#6fa8dc"/>'; } });
        var d=''; F.t.forEach(function(v,i){ if(v!=null) d+=(d?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1); }); c+='<path d="'+d+'" fill="none" stroke="#b2182b" stroke-width="1.8"/>';
        c+='<text x="4" y="'+(T+8)+'" font-size="9" fill="#b2182b">'+tmax+' °C</text><text x="4" y="'+(T+ih)+'" font-size="9" fill="#b2182b">'+tmin+' °C</text><text x="'+(CW-R+4)+'" y="'+(T+8)+'" font-size="9" fill="#3d85c6">'+rmax.toFixed(1)+' mm</text>';
        for(var i=0;i<n;i+=24){ c+='<line x1="'+X(i)+'" y1="'+T+'" x2="'+X(i)+'" y2="'+(T+ih)+'" stroke="#e3e8ec"/><text x="'+X(i)+'" y="'+(CH-8)+'" font-size="9" fill="#6b7c88">'+esc(String(F.time[i]||'').slice(5,10))+'</text>'; }
        c+='</svg>'; h3+='<p>Hourly temperature (red) and rain (blue bars) for the next 72 hours at '+esc(A.unit)+'.</p>'+c; }
      var ss=SS(doc); if(ss&&ss.rows) h3+='<p class="rp-vds">'+ss.rows.filter(function(r){ return lvOf(r,ss); }).map(function(r){ return esc(r.parameter)+' '+vdPill(r,ss); }).join(' · ')+'</p>';
      var sr=SR(doc); h3+='<p>'+(sr&&sr.active&&sr.active.length?(sr.active.length+' site pathway'+(sr.active.length>1?'s':'')+' switch on in the next 15 days: '+sr.active.map(function(a){ return esc(a.title)+(a.when?' ('+esc(a.when)+')':''); }).join('; ')+'.'):'No site pathway switches on in the next 15 days.')+' Parts 4 and 5 follow in the next section.</p>';
      return {drawn:true,html:'<div class="rp-analytics">'+h1+h2+h3+'</div>'}; },
    pNextSteps:function(doc){
      var S=steps(doc), n=0;
      var block=function(t,rows){ if(!rows.length) return ''; return '<table><caption class="rp-cap">'+esc(t)+'</caption><tbody>'+rows.map(function(r){ n++; return '<tr><td>'+n+'</td><td><b>'+esc(r[0])+'</b><br>'+esc(r[1])+'</td></tr>'; }).join('')+'</tbody></table>'; };
      var h='<div class="rp-steps">'+'<h3 class="rp-an-h">4 · Prescriptive · what to do</h3>'+block('Now · next 15 days',S.now)+block('Studies to commission',S.study)+'<h3 class="rp-an-h">5 · Suggestions · data, monitoring and review</h3>'+block('Monitoring and data',S.monitor)+block('Review',S.review)
        +'<div class="rp-sign">Prepared by AI GEO NIGRAAN, AGN (AI GEO Navigators). This is a screening document: it ranks and dates what needs attention at the site. It does not replace a site survey, a design calculation or an official warning; the national meteorological and disaster-management authorities are the authority for warnings.</div></div>';
      return {drawn:true,html:h}; }
  };
   
  function analytics(doc){
    var DI=G.DISTRICT_IN, unit=(doc.subject&&doc.subject.unit)||null; if(!DI||!unit) return null;
    var key=DI[unit]?unit:Object.keys(DI).filter(function(k){ return k===unit||k.split('|').pop()===unit; })[0]; if(!key) return null;
    var inp=DI[key], f=G.aiDistrictRisk; if(typeof f!=='function') return null;
    var L={flood:'Flood',rain_hz:'Heavy rain',heat:'Heat stress',cold:'Cold stress (UTCI)',wind:'Wind and gusts',drought:'Drought',landslide:'Landslide'};
    

    var keyOf=function(h){ var n=String((h&&(h.key||h.name))||'').toLowerCase();
      return /heat/.test(n)?'heat':/flood/.test(n)?'flood':/rain/.test(n)?'rain_hz':/wind|gust/.test(n)?'wind':/cold|frost/.test(n)?'cold':/drought/.test(n)?'drought':/landslide/.test(n)?'landslide':null; };
    var FZ={}; (((doc.evidence||{}).hazards)||[]).forEach(function(h){ var k=keyOf(h), s=hzIdx(h); if(k&&s!=null&&FZ[k]==null) FZ[k]={s:Number(s),h:h}; });
    var hz=Object.keys(L).map(function(k){ try{ var z=FZ[k]; if(!z) return null; var s=z.s;
        var band=(G.AGN&&G.AGN.hazards&&G.AGN.hazards.band?((G.AGN.hazards.band(s)||{}).label):null)||z.h.band||null;
        var r=null; try{ r=f(inp,k,0,key); }catch(_){ r=null; } var rs=r&&(r.screeningIndex!=null?r.screeningIndex:r.score);
        var agree=(rs!=null&&Math.round(Number(rs))===Math.round(s));
        var ins=agree?(r.metricLabels||[]).map(function(m,i){ var v=(r.notes||[])[i]; return (m&&m!=='—'&&v&&!/see the strip|\(see /i.test(m+' '+v))?[m,v]:null; }).filter(Boolean).slice(0,3):[];
        return {key:k,label:L[k],score:s,band:band||'Normal',top:agree?(r.top||null):(z.h.driver||z.h.top||null),inputs:ins,frozen:true}; }catch(_){ return null; } }).filter(Boolean);
    var fc=inp.fc72, F=null;
    try{ if(fc&&fc.time){ var T=fc.temperature_2m||fc.temp||fc.t, P=fc.precipitation||fc.rain||fc.p; if(T&&T.length){ var now=Date.now(), i0=Math.max(0,fc.time.findIndex(function(t){ return new Date(t+'+05:00').getTime()>=now-36e5; }));
      F={time:fc.time.slice(i0,i0+72),t:T.slice(i0,i0+72).map(function(v){ return v==null?null:Math.round(v*10)/10; }),p:(P||[]).slice(i0,i0+72).map(function(v){ return v==null?0:Math.round(v*10)/10; })}; } } }catch(_){}
    return {unit:String(key).split('|').pop(),hazards:hz,fc72:F,basis:'NIGRAAN hazard engine at freeze time; the same values as the map and the Operations board'};
  }
   
  function steps(doc){
    var now=[], study=[], monitor=[], review=[];
    var j=SR(doc), s=SS(doc), sj=doc.subject||{}, hz=((doc.evidence||{}).hazards||[]).filter(function(h){ return hzLv(h)!=null; }).sort(function(a,b){ return hzLv(b)-hzLv(a); });
    if(j&&j.active) j.active.forEach(function(a){ now.push([a.title+(a.when?' ('+a.when+')':''), a.action]); });
    if(!now.length) now.push(['No forecast-driven action needed', 'Nothing in the next 15 days switches on a compound pathway at this site. Keep the daily outlook on watch; this section will list dated actions when one does.']);
    var rowOf=function(p){ return s&&s.rows?s.rows.filter(function(r){ return r.parameter===p; })[0]:null; };
    var fl=rowOf('Flood position'), rn=rowOf('Extreme daily rain'), gu=rowOf('Wind gust'), hx=rowOf('Extreme heat');
    if(fl&&reachedOf(fl,s)) study.push(['Flood risk assessment of the site', 'The site sits low against the nearest river or drain'+(fl.history&&!/^no mapped/.test(fl.history)?', and its tehsil '+fl.history.replace(/^mapped flooding in/,'flooded in'):'')+'. Commission a floor-level and access-route survey and a hydraulic check of the design flood level before new investment on the site.']);
    if(rn&&rn.values) study.push(['The 10-year rain day here', 'Screening value: '+rn.values+'. For reference by the site\'s own engineer; it is not a drainage design or sizing figure'+(reachedOf(rn,s)&&rn.mark?'. The coming 15 days already reach the '+esc(rn.mark)+' in the wettest forecast runs':'')+'.']);   /* v91.17.283.4 C8 */
    if(hx&&hx.values) study.push(['Heat rating of equipment and cooling', 'Screening value: '+hx.values+'. Check that cooling plant, transformers, cables and critical equipment are rated for the 50-year hottest day.']);
    if(gu&&gu.values&&reachedOf(gu,s)) study.push(['Wind check of exposed structures', 'Screening value: '+gu.values+'. Check roof sheeting, signage, masts and temporary structures against the building-code design wind for the site exposure.']);
     
    var topLv=(function(){ try{ return hz.length&&window.AGN&&AGN.level?AGN.level.words[hzLv(hz[0])]:null; }catch(_){ return null; } })();
    if(topLv&&s&&s.scale&&s.scale.reachedFrom&&s.scale.levels.indexOf(topLv)>=s.scale.levels.indexOf(s.scale.reachedFrom)) study.push(['Detailed assessment of '+String(hz[0].name||hz[0].key||'the leading hazard').toLowerCase(), 'It is the highest hazard at this site ('+(function(){ try{ var b=window.agnBandOf&&agnBandOf(hzIdx(hz[0])), W=(window.AGN&&AGN.hz5&&AGN.hz5.words)||['Normal','Low','Moderate','High','Severe']; return b?W[b.index]:'screened'; }catch(_){ return 'screened'; } })()+'). A detailed, site-specific assessment is the next step before it is priced or insured.']);
    if(!sj.asset_id) monitor.push(['Register the asset', 'Add the asset with its exact coordinate and type. The next issue of this document is then built on the asset\'s own point, with its operating limits checked every day.']);
    monitor.push(['Register operating limits', 'Record the conditions at which operations change (for example rain per hour for drainage, gust for cranes, temperature for outdoor work). The platform then checks every forecast against them and dates each crossing.']);
    if(j&&j.active&&j.active.some(function(a){ return a.id==='humidHeat'||a.id==='hotNights'; })) monitor.push(['Measure heat stress on site', 'Install a wet-bulb globe temperature (WBGT) reading at the work area; it is the measure work-rest rules are written against.']);
    if(j&&j.active&&j.active.some(function(a){ return a.id==='rainFlood'||a.id==='riverHigh'||a.id==='rainOnSnow'; })) monitor.push(['Measure rain at the site', 'A site rain gauge (tipping bucket, hourly) turns the drainage limit into an operating trigger and verifies the forecast locally.']);
    var nx=new Date((doc.at||Date.now())+30*864e5), m=new Date(doc.at||Date.now()).getUTCMonth();
    review.push(['Re-issue this screening by '+fmtDate(nx.getTime()), 'Or immediately when any pathway above switches on, '+(s&&s.scale&&s.scale.reachedFrom?'a screening level reaches '+s.scale.reachedFrom+' or above':'a screening value is reached')+', or the asset changes.']);
    if(m>=1&&m<=5) review.push(['Before the monsoon', 'Re-run the screening in early June and complete the drainage and flood checks above before July.']);
    else if(m>=9||m===0) review.push(['Before the next hot season', 'Re-run the screening in March and complete the heat and cooling checks above before May.']);
    return {now:now,study:study,monitor:monitor,review:review}; }

   
  function ins(arr,id,after){ if(arr.indexOf(id)>=0) return; var i=-1; for(var k=0;k<after.length&&i<0;k++) i=arr.indexOf(after[k]); if(i>=0) arr.splice(i+1,0,id); else arr.push(id); }
  function insBefore(arr,id,before){ if(arr.indexOf(id)>=0) return; var i=-1; for(var k=0;k<before.length&&i<0;k++) i=arr.indexOf(before[k]); if(i>=0) arr.splice(i,0,id); else arr.push(id); }
  var EVID=['pCoverage','pScope','pCompleteness','pVerified','pMethod','pEvidence','pDeviation','pRepro','pLimits'];
  (function install(k){
    var R=G.AGN&&G.AGN.report; if(!R||!R.PAGES||!R.ROUTES||!G.AGN.reportExtraDraw||!R.freeze||!R.render) return k<160&&setTimeout(function(){ install(k+1); },250);
    Object.keys(PAGES).forEach(function(id){ R.PAGES[id]=PAGES[id]; G.AGN.reportExtraDraw[id]=DRAW[id]; });
    ['brief','operations','technical','readiness72','weatherImpact','engineering','caseAsset'].forEach(function(t){ var r=R.ROUTES[t]; if(!r) return;
      ins(r,'pSiteRisk',['pRiskCards','pSummary','pSituation','pCover']);
      ins(r,'pEngScreen',['pHazard','pSiteRisk']);
      ins(r,'pAnalytics',['pEngScreen','pSiteRisk']);
      insBefore(r,'pNextSteps',EVID); });
     
    var f0=R.freeze;
    R.freeze=function(ctx){ var doc=f0.apply(this,arguments);
      try{ if(doc&&!(ctx&&ctx.national)&&G.AGN.siteRisk){ var pk=G.AGN.siteRisk.peek();
        if(pk){ if(pk.risk) doc.evidence.siteRisk=Object.assign({sectorLabel:pk.sectorLabel},pk.risk); if(pk.screening) doc.evidence.siteScreening=pk.screening;
          doc.sitePoint={lat:pk.point.lat,lon:pk.point.lon,name:pk.point.name||null,basis:pk.point.basis};
          if(R.seal) R.seal(doc); } } }catch(e){ try{ console.warn('[rp79] site data not attached', e&&e.message); }catch(_){} }
      try{ if(doc&&!(ctx&&ctx.national)){ var an=analytics(doc); if(an){ doc.evidence.analytics=an; if(R.seal) R.seal(doc); } } }catch(e){ try{ console.warn('[rp80] analytics not attached', e&&e.message); }catch(_){} }
      return doc; };
    var r0=R.render;
    R.render=function(doc){ var out=r0.apply(this,arguments); if(isOp()||!out||!out.html) return out;
      try{ out=Object.assign({},out,{html:client(out.html,doc)}); }catch(e){ try{ console.warn('[rp79] client edition failed', e&&e.message); }catch(_){} }
      return out; };
    R.clientEdition=client;
    G.AGN.reportSteps=steps;
  })(0);

   
  var CHIP=/^(OBSERVED|MODELLED|MODEL\s*LED|CALCULATED|CLIENT SUPPLIED)$/;
  var DROP_PAGES={pCompleteness:1,pMethod:1,pEvidence:1,pDeviation:1,pCoverage:1};    
  function client(html,doc){
    var box=D.createElement('div'); box.innerHTML=html;
    var dropped=[];
    var srcP=null; [].slice.call(box.querySelectorAll('p')).some(function(p){ if(/^Sources and licences\./.test((p.textContent||'').trim())){ srcP=p.cloneNode(true); return true; } return false; });
    [].slice.call(box.querySelectorAll('section.rpt-page')).forEach(function(sec){
      var id=sec.getAttribute('data-page')||'', t=(sec.querySelector('h3')||{}).textContent||id;
      var body=sec.cloneNode(true); var hd=body.querySelector('.rpt-head'); if(hd) hd.remove();
      [].slice.call(body.querySelectorAll('[data-evkey]')).forEach(function(e){ e.remove(); });
      var txt=(body.textContent||'').replace(/\s+/g,' ').trim();
      var empty=sec.classList.contains('rpt-page-empty') || txt.length<40 || (/^(Withheld|Not available)/.test(txt) && txt.length<420) || /could not be produced/.test(txt);
      if(DROP_PAGES[id] || empty){ if(!DROP_PAGES[id]) dropped.push(t); sec.remove(); } });
     
    [].slice.call(box.querySelectorAll('.rpt-refusal, .asmt-warning, div, p, li')).forEach(function(e){
      if(!e.parentNode) return; var t=(e.textContent||'').trim();
      if(/^How to complete this document/.test(t) || /^\d+ routes? failed/.test(t) || /declared constants were read/.test(t) || /^Fetch this run again/.test(t)) { e.remove(); return; }
      if(e.tagName==='LI'||e.tagName==='P'){ if(/\b(POD|FAR) \d|correlation \d\.\d|\bskill 0\.\d|hold-?out/i.test(t)) e.remove(); } });
     
    var ver=box.querySelector('section[data-page="pVerified"]'); if(ver) [].slice.call(ver.querySelectorAll('table')).forEach(function(tb){ var p=tb.closest('.rpt-tablewrap, .asmt-tablewrap')||tb; p.remove(); });
     
    if(ver) [].slice.call(ver.querySelectorAll('p.rpt-note')).forEach(function(p){ if(/^Mean absolute error of the hourly/.test((p.textContent||'').trim())) p.remove(); });
    

    ['pMethod'].forEach(function(id){ var sec=box.querySelector('section[data-page="'+id+'"]'); if(sec) sec.remove(); });
     
    [].slice.call(box.querySelectorAll('th span, td span')).forEach(function(s){ if(CHIP.test((s.textContent||'').replace(/\s+/g,' ').trim())) s.remove(); });
     
    var sum=box.querySelector('section[data-page="pSummary"] svg'), hzp=box.querySelector('section[data-page="pHazard"]');
    if(sum&&hzp){ var sv=hzp.querySelector('svg'); if(sv){ var fig=sv.closest('figure')||sv.parentNode; if(fig&&fig!==hzp) fig.remove(); else sv.remove(); } }
     
    var NAMES=[[/\s*\((?:Copernicus )?(?:EMS|CEMS)\)/g,''],[/,?\s*Copernicus EMS/g,''],[/Copernicus Sentinel-2/g,'Sentinel-2'],[/\b(?:the )?HydroBASINS(?: network| level \d+)?/g,'the river-basin network'],
      [/\bHMAGLOFDB\b/g,'the documented-outburst inventory'],[/\b(?:an? )?Hi-MAG\b(?: \([^)]*\))?/g,'an open lake inventory'],[/\bRGI 7\.0\b/g,'the glacier inventory'],[/\bGLO-(?:30|90)\b/g,'the terrain model']];
     
    var tw=D.createTreeWalker(box,NodeFilter.SHOW_TEXT,null), n, rep=[];
    while((n=tw.nextNode())) rep.push(n);
    rep.forEach(function(t){ var v=t.nodeValue, o=v;
      if(!(t.parentNode&&t.parentNode.closest&&t.parentNode.closest('[data-rp-sources]'))) NAMES.forEach(function(r){ v=v.replace(r[0],r[1]); });
      v=v.replace(/\s*\(?\/api\/[A-Za-z0-9_\/?=&.%-]+\)?/g,'').replace(/\bPK_TEHSIL_TERRAIN\b/g,'the tehsil terrain layer').replace(/\bNIGRAAN_[A-Z_]+=\d\b/g,'').replace(/\bagn-[a-z-]+\b/g,'');
      if(v!==o) t.nodeValue=v; });
     
    var oc=box.querySelector('section[data-page="pCover"]'); if(oc){ [].slice.call(oc.querySelectorAll(':scope > .rpt-head, :scope > h2, :scope > .rpt-sub, :scope > [data-evkey]')).forEach(function(e){ e.remove(); });
      var cap=oc.querySelector('table caption'); if(cap) cap.textContent='Document details'; }
    if(srcP){ var ss=D.createElement('section'); ss.className='rpt-page'; ss.setAttribute('data-page','pSources'); ss.setAttribute('data-rp-sources','1');
      ss.innerHTML='<div class="rpt-head"><div class="rpt-num"></div><h3>Data sources and licences</h3></div>'; var pp=srcP.cloneNode(true); ss.appendChild(pp); box.appendChild(ss); }
     
    var k=0; [].slice.call(box.querySelectorAll('section.rpt-page:not([data-page="pCover"]) .rpt-num')).forEach(function(e){ k++; e.textContent=String(k); });
     
    if(dropped.length){ var sc=box.querySelector('section[data-page="pScope"]')||box.querySelector('section[data-page="pLimits"]');
      if(sc){ var p=D.createElement('p'); p.innerHTML='<b>Not covered in this edition.</b> '+esc(dropped.join(', '))+'. These need an active client asset, a client project or data this site does not yet have; they are added when that input exists.'; sc.appendChild(p); } }
     
    var cov=box.querySelector('section[data-page="pCover"]'); if(cov) cov.insertBefore(cover(doc,box), cov.firstChild);
    return box.innerHTML; }

  function cover(doc,box){
    var c=D.createElement('div'); c.className='rp-cover';
    var sj=doc.subject||{}, sp=doc.sitePoint||null, j=SR(doc), s=SS(doc);
    var name=sj.asset_name || (sp&&sp.name) || doc.unit || 'Site';
    var place=j&&j.place?(j.place.name+', '+j.place.district+', '+j.place.province):(doc.unit||'');
    var hz=((doc.evidence||{}).hazards||[]).filter(function(h){ return hzLv(h)!=null; }).sort(function(a,b){ return hzLv(b)-hzLv(a); });
    var sectorTxt=(sj&&sj.asset_id&&j&&j.sectorLabel)?j.sectorLabel:'Not specified (site screening)';    
    var find=[];
     
    var lvw=function(h){ try{ var i=hzLv(h), W=(window.AGN&&AGN.hz5&&AGN.hz5.words)||['Normal','Low','Moderate','High','Severe']; return i!=null?W[i]:null; }catch(_){ return null; } };
     
    var capT=(function(){ try{ return doc.at?new Date(Date.parse(doc.at)+5*3600e3).toISOString().slice(0,16).replace('T',' ')+' PKT':null; }catch(_){ return null; } })();
    if(hz.length) find.push('Highest hazard level here'+(capT?' when this report was made ('+esc(capT)+')':'')+': <b>'+esc(hz[0].name||hz[0].key)+'</b>'+(lvw(hz[0])?' ('+esc(lvw(hz[0]))+')':'')+(hz[1]?', then '+esc(hz[1].name||hz[1].key)+(lvw(hz[1])?' ('+esc(lvw(hz[1]))+')':''):'')+'.');
    if(j) find.push(j.active.length?('<b>'+j.active.length+' compound pathway'+(j.active.length>1?'s':'')+'</b> switched on in the next 15 days: '+esc(j.active.map(function(a){ return a.title+(a.when?' ('+a.when+')':''); }).join('; '))+'.'):esc(j.none));
    if(s&&s.rows){ var w=s.rows.filter(function(r){ return reachedOf(r,s); });
      find.push(w.length?('Screening values reached or near: '+esc(w.map(function(r){ return r.parameter+' ('+r.verdict+')'; }).join(', '))+'.'):'The next 15 days stay below the long-record screening values for rain, wind and heat.'); }
    var S=steps(doc); if(S.study.length) find.push('Recommended first study: <b>'+esc(S.study[0][0])+'</b>.');
    var toc=[].slice.call(box.querySelectorAll('section.rpt-page h3')).map(function(h){ return '<li>'+esc(h.textContent)+'</li>'; }).join('');
    c.innerHTML='<div class="rp-brand">AI GEO NIGRAAN</div>'
      +'<div class="rp-title">'+esc(doc.title||'NIGRAAN situation report')+'</div>'
      +'<div class="rp-subject">'+esc(name)+(place&&place!==name?' · '+esc(place):'')+'</div>'
      +'<div class="rp-meta"><div>Coordinates<b>'+(sp?esc(sp.lat.toFixed(4))+', '+esc(sp.lon.toFixed(4)):'—')+'</b></div><div>Asset type<b>'+esc(sectorTxt||'Not stated')+'</b></div>'
      +'<div>Issued<b>'+esc(fmtDate(doc.at))+'</b></div><div>Document<b class="rp-docid">'+esc(doc.id)+'</b></div>'+(doc.reproducibility&&doc.reproducibility.analysis_snapshot?'<div>Analysis snapshot<b class="rp-docid">'+esc(doc.reproducibility.analysis_snapshot)+'</b></div>':'')+'</div>'
      +(find.length?'<div class="rp-key"><h4>Key findings</h4><ul>'+find.map(function(f){ return '<li>'+f+'</li>'; }).join('')+'</ul></div>':'')
      +(toc?'<div class="rp-brand" style="margin-bottom:8px">Contents</div><ol class="rp-toc">'+toc+'</ol>':'');
    return c; }

   
  function km(a,b,c,d){ var r=Math.PI/180, x=(d-b)*r*Math.cos((a+c)/2*r), y=(c-a)*r; return 6371*Math.hypot(x,y); }
  var pass=false;
  function status(t){ var el=D.getElementById('asmtFreezeState'); if(el) el.textContent=t; }
  D.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('#asmtGenerateReport'):null; if(!b||pass) return;
    var AG=G.AGN||{}; if(!AG.siteRisk) return;
    e.preventDefault(); e.stopImmediatePropagation();
    

    try{ var L=AG.flow&&AG.flow.location&&AG.flow.location(), sj=AG.subject&&AG.subject.get&&AG.subject.get(), sp=AG.subjectPoint&&AG.subjectPoint();
      if(L&&L.lat!=null&&!(sj&&sj.asset_id)&&sp&&sp.lat!=null&&km(+L.lat,+L.lon,+sp.lat,+sp.lon)>1){    
        AG.flow.setActiveLocation({name:L.name,lat:+L.lat,lon:+L.lon}, L.name, {src:'report-subject'});
        var sel=D.getElementById('asmtLocation'), st=G.STATIONS||[], best=null, bd=1e9;
        st.forEach(function(s){ if(s&&s.lat!=null){ var d=km(+L.lat,+L.lon,+s.lat,+s.lon); if(d<bd){ bd=d; best=s; } } });
        if(sel&&best&&[].some.call(sel.options,function(o){ return o.value===best.id; })){ sel.value=best.id; sel.dispatchEvent(new Event('change',{bubbles:true})); } } }catch(_){}
    status('Preparing the site outlook and screening values…');
    var t0=Date.now();
    var go=function(){ pass=true; try{ b.click(); } finally { pass=false; } };
    (function wait(){ var pk=AG.siteRisk.peek();
      if(pk&&pk.risk&&pk.screening) return setTimeout(go,300);
      if(Date.now()-t0>(pk&&pk.risk?75000:20000)){ status('Site screening values are still being prepared; the document is built without them and says so. Generate again in a minute to include them.'); return go(); }
      AG.siteRisk.warm(); setTimeout(wait,800); })();
  },true);
   
})(window);
