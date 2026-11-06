


(function(){
  'use strict';
  var D=document, W=window;
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function num(v){ if(v==null||v===''||typeof v==='boolean') return null; v=Number(v); return isFinite(v)?v:null; }
  var C={risk:{},scr:{},busy:{},nr:{}};
  function sector(){ var el=D.getElementById('asmtAsset'); return (el&&el.value)||'general'; }
  function sectorLabel(){ var el=D.getElementById('asmtAsset'); return (el&&el.value&&el.selectedIndex>=0)?el.options[el.selectedIndex].text:null; }   /* 283.28 · P17: no asset type picked = no sector named */
   
  function point(){
     
    try{ var s=AGN.subject&&AGN.subject.get&&AGN.subject.get(); if(s&&num(s.asset_lat)!=null&&num(s.asset_lon)!=null) return {lat:+s.asset_lat,lon:+s.asset_lon,name:s.asset_name||s.unit||'the active asset',basis:'asset'}; }catch(_){}
    try{ var p=AGN.subjectPoint&&AGN.subjectPoint(); if(p&&num(p.lat)!=null&&num(p.lon)!=null) return {lat:+p.lat,lon:+p.lon,name:p.name||null,basis:p.basis||'place'}; }catch(_){}
    try{ var L=AGN.flow&&AGN.flow.location&&AGN.flow.location(); if(L&&num(L.lat)!=null&&num(L.lon)!=null) return {lat:+L.lat,lon:+L.lon,name:L.name,basis:'place'}; }catch(_){}
    try{ var el=D.getElementById('asmtLocation'), a=W.STATIONS||[]; for(var i=0;i<a.length;i++) if(el&&a[i].id===el.value) return {lat:+a[i].lat,lon:+a[i].lon,name:a[i].name,basis:'assessment location'}; }catch(_){}
    return null; }
  function key(p){ return p.lat.toFixed(3)+','+p.lon.toFixed(3); }
  function risk(p,sec){ var k=key(p)+'|'+sec; if(C.risk[k]) return Promise.resolve(C.risk[k]);
    if(C.busy[k]) return C.busy[k];
    return C.busy[k]=AGN.pointState.part('siteRisk',p.lat,p.lon).then(function(v){ var j=v&&v.bySector?(v.bySector[sec]||v.bySector.general||null):(v&&v.unavailable?{ready:false,why:v.why}:null); delete C.busy[k]; if(j&&j.ready) C.risk[k]=j; else C.nr[k]={j:j,at:Date.now()}; return j; }); }   /* v91.17.283.19: the bundle's siteRisk part (every sector) */
  function screening(p){ var k='s'+key(p); if(C.scr[k]) return Promise.resolve(C.scr[k]);
    if(C.busy[k]) return C.busy[k];
     
    return C.busy[k]=AGN.pointState.part('siteScreening',p.lat,p.lon).then(function(j){ delete C.busy[k]; if(j&&j.ready) C.scr[k]=j; else C.nr[k]={j:j,at:Date.now()}; return j; }); }   /* v91.17.283.19: the bundle's siteScreening part */
  AGN.siteRisk={ point:point, sector:sector, risk:risk, screening:screening,
    peek:function(p,sec){ p=p||point(); if(!p) return null; return { risk:C.risk[key(p)+'|'+(sec||sector())]||null, screening:C.scr['s'+key(p)]||null, point:p, sector:sec||sector(), sectorLabel:sectorLabel() }; },
    warm:function(){ var p=point(); if(!p) return Promise.resolve(null); return Promise.all([risk(p,sector()),screening(p)]); } };

  function riskHtml(j, p){
    if(!j) return '<div class="sr-wait">The 15-day outlook for this site is not available yet. It is built on the server after the morning forecast run.</div>';
     
    if(j.ready===false) return '<div class="sr-wait">The 15-day outlook for this site is not available: '+esc(j.why||'the server has not built it yet')+'.</div>';
    var h='';
    if(!j.active.length) h+='<div class="sr-none">'+esc(j.none)+'</div>';
    else h+='<div class="sr-list">'+j.active.map(function(a){
      return '<article class="sr-card"><h4>'+esc(a.title)+(a.when?' <span class="sr-when">'+esc(a.when)+'</span>':'')+(a.chance!=null?' <span class="sr-chance">chance '+esc(a.chance)+' %</span>':'')+'</h4>'
        +'<ul class="sr-facts">'+a.facts.map(function(f){ return '<li>'+esc(f)+'</li>'; }).join('')+'</ul>'
        +'<div class="sr-chain" aria-label="How it unfolds">'+a.chain.map(function(c){ return '<span>'+esc(c)+'</span>'; }).join('<i aria-hidden="true">→</i>')+'</div>'
        +'<div class="sr-io"><div><b>What it means '+(sectorLabel()?'for a '+esc(sectorLabel().toLowerCase()):'here')+'</b>'+esc(a.impact)+'</div><div><b>First action</b>'+esc(a.action)+'</div></div></article>'; }).join('')+'</div>';
    var G=j.ground||{}, g=[];
     
    if(G.handRiverM!=null) g.push(G.handRiverM+' m above the nearest river'+(G.handRiverClass?' ('+G.handRiverClass.text+')':''));
    if(G.handLocalM!=null) g.push(G.handLocalM+' m above the nearest drain or stream'+(G.handLocalClass?' ('+G.handLocalClass.text+')':''));
    var fl=Object.keys(G.flooded||{}).filter(function(y){ return G.flooded[y]>0; }); if(fl.length) g.push('Tehsil flooded in '+fl.join(', ')); else if(G.flooded) g.push('No mapped flooding in this tehsil in 2010, 2022 or 2025');
    if(G.wetness&&G.wetness.state) g.push('Ground '+G.wetness.state);
    if(g.length) h+='<div class="sr-ground" aria-label="Site ground">'+g.map(function(x){ return '<span>'+esc(x)+'</span>'; }).join('')+'</div>';
    var _at=(function(){ try{ if(!j.at) return null; var d=new Date(Date.parse(j.at)+5*3600e3); return isFinite(d)?d.toISOString().slice(0,16).replace('T',' ')+' PKT':null; }catch(_){ return null; } })();
    h+='<p class="sr-foot">'+esc(j.place.name)+', '+esc(j.place.district)+' · forecast '+esc(fmtD(j.window[0]))+' to '+esc(fmtD(j.window[1]))+(_at?' · ensemble issued '+esc(_at):' · ensemble issue time not stated')+'. '+esc(j.note)+'</p>';
    return h; }
  function fmtD(iso){ try{ return new Date(iso+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}); }catch(_){ return iso; } }
  

  function badge(r,j){ var L=j.scale&&j.scale.levels; if(r.verdict&&L&&L.indexOf(r.verdict)>=0) return '<span class="vd lv-'+r.verdict+'">'+esc(r.verdict)+'</span>';
    var s=r.state||'Input required: a level for this row'; return '<span class="vd st'+(/^Input required/.test(s)?' need':'')+'">'+esc(s)+'</span>'; }
  function scrHtml(j){
    if(!j) return '<div class="sr-wait">Preparing the screening values for this site. The first time a location is screened, the long record is fetched and fitted on the server; this takes up to a minute.</div>';
    if(j.ready===false||!j.rows) return '<div class="sr-wait">The screening values for this site are not available: '+esc(j.why||'the server has not built them yet')+'.</div>';
    return '<table><thead><tr><th scope="col">Parameter</th><th scope="col">Screening values</th><th scope="col">Next 15 days</th><th scope="col">Level</th><th scope="col">What it means</th></tr></thead><tbody>'
      +j.rows.map(function(r){ return '<tr><td><b>'+esc(r.parameter)+'</b></td><td>'+(r.values?esc(r.values):'—')+(r.valuesWhy?'<small>'+esc(r.valuesWhy)+'</small>':'')+(r.history?'<small>'+esc(r.history)+'</small>':'')+'</td><td>'+(r.forecast?esc(r.forecast):'—')+'</td>'
        +'<td>'+badge(r,j)+(r.standing?'<br><span class="rpt-note">'+esc(r.standing)+'</span>':'')+'</td><td>'+esc(r.meaning)+'</td></tr>'; }).join('')+'</tbody></table>'
      +'<p class="sr-foot">'+esc(j.note)+(j.returnLevels?' Return levels: '+esc(j.returnLevels.method)+', '+esc(j.returnLevels.years)+'. '+esc(j.returnLevels.caveat):'')+'</p>'; }

  function mount(paneSel, id, title, sub){
    var pane=D.querySelector('[data-asmt-pane="'+paneSel+'"]'); if(!pane) return null;
    var box=D.getElementById(id);
    if(!box){ box=D.createElement('section'); box.id=id; box.className='agn-sr agn-cust-sr'; box.setAttribute('aria-live','polite');
      var first=pane.firstElementChild; pane.insertBefore(box, first);
       
      [].slice.call(pane.children).forEach(function(c){ if(c!==box) c.classList.add('agn-op-only'); }); }
    return box; }
  function mountOps(id){
    var pane=D.querySelector('[data-opsx-pane="situation"]'); if(!pane) return null;
    var box=D.getElementById(id);
    if(!box){ box=D.createElement('section'); box.id=id; box.className='agn-sr agn-cust-sr opsx-card'; box.setAttribute('aria-live','polite');
      var anchor=D.getElementById('skillCard'); pane.insertBefore(box, anchor&&anchor.parentNode===pane?anchor:null); }
    return box; }
  var last={};
  function paint(){
    var p=point(); if(!p) return;
    var sec=sector();
    var b1=mountOps('agnSiteRisk'), b2=mount('engineering','agnEngScreen');
    var head=function(t,s){ return '<div class="sr-top"><div><h3>'+t+'</h3><p class="sr-sub">'+s+'</p></div></div>'; };
    var nm=esc(p.name||'this site');
    if(b1){ var k1=key(p)+'|'+sec; var r=C.risk[k1], nr=C.nr[k1];
       
      var shown=r||(nr&&nr.j)||null, st=r?'1':(nr?'n':'0');
      if(last.b1!==k1+st){ last.b1=k1+st;
        b1.innerHTML=head('What could affect '+nm+' in the next 15 days','Only what the forecast switches on at this site ('+(sectorLabel()?esc(sectorLabel().toLowerCase())+', the asset type set in Client Risk':'no asset type picked in Client Risk, so no sector is assumed')+'): combinations of weather and ground that cause damage together, with the dates, the numbers and the first action.')
          +(shown?riskHtml(shown,p):'<div class="sr-wait">Reading the 15-day forecast for this site…</div>'); }
      if(!r && (!nr || Date.now()-nr.at>60000)){ if(nr) delete C.nr[k1]; risk(p,sec).then(function(){ paint(); }); } }
    if(b2){ var k2='s'+key(p); var s=C.scr[k2], n2=C.nr[k2], st2=s?'1':(n2?'n':'0');
      if(last.b2!==k2+st2){ last.b2=k2+st2;
        b2.innerHTML=head('Screening values for '+nm,'How extreme rain, wind and heat get at this site over a long record, where the site sits against flooding, and whether the next 15 days come near those values. Screening, not design values.')+scrHtml(s||(n2&&n2.j)||null); }
      if(!s && (!n2 || Date.now()-n2.at>60000)){ if(n2) delete C.nr[k2]; screening(p).then(function(){ paint(); }); } }
  }
  D.addEventListener('change',function(e){ var t=e.target; if(!t) return;
    if(t.id==='asmtAsset'||t.id==='asmtLocation'){ last={}; setTimeout(paint,50); } },true);
  ['agn:location','agn:subject','agn:asset','agn:report-context'].forEach(function(ev){ D.addEventListener(ev,function(){ last={}; setTimeout(paint,300); }); });
  D.addEventListener('click',function(e){ var t=e.target&&e.target.closest?e.target.closest('#asmtTabs button, [data-asmt-tab], #opsxTabs button, #machNav [data-goto="operations"]'):null; if(t) setTimeout(paint,80); },true);
  D.addEventListener('agn:operator',function(){ last={}; paint(); });
  function boot(k){ if(!D.querySelector('[data-opsx-pane="situation"]')) return k<60&&setTimeout(function(){ boot(k+1); },500); paint(); (function(f){ setInterval(f,10000); document.addEventListener('agn:dom',f); })(function(){ var p=point(); if(p && (!last.b1 || last.b1.indexOf(key(p))!==0)) paint(); }); }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',function(){ boot(0); }); else boot(0);
   
})();
