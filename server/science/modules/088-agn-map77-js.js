


(function(){
  var D=document; window.AGN=window.AGN||{}; var M=AGN.map77=AGN.map77||{};
  function op(){ try{ return !!(AGN.operator&&AGN.operator()); }catch(_){ return false; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

   
  var NAMES={ flood:'Flood', flood_pluvial:'Flood from local rain', flood_riverine:'River flood', landslide:'Landslide',
    glof:'Glacial lake outburst flood (GLOF)', heat:'Heat stress', cold:'Cold stress (UTCI)', wind:'Wind and gusts', drought:'Drought',
    nss_baseline:'Ground sponge: screening index (soil and land cover), not a tested runoff forecast', nss_dynamic:'Runoff Retention Potential (today)', nss_retention:'Storm water the ground can hold', nss_runoff:'Rain run-off today',
    seismic:'Earthquake zone', cyclone:'Cyclone wind exposure', rain_hz:'Heavy rain', aqi:'Air quality', '':'Comfort' };
  var GROUPS=[[/^Event hazards/,'Hazards'],[/^GLOF level/,'Glacial lakes'],[/^Stress conditions/,'Weather stress'],
    [/^Land & hydrological/,'How much rain the ground takes'],[/^Static layers/,'Fixed maps (not today\u2019s weather)'],[/^Parameters/,'Weather readings (not hazards)']];
  M.names=NAMES;
  function pickerWords(){ var s=D.getElementById('mapHazardPick'); if(!s) return false;
     
    function gsuf(v){ try{ var st=(AGN.gate&&AGN.gate.ready)?AGN.gate.status(v):null; return st==='experimental'?' (experimental)':st==='reference'?' (reference)':''; }catch(_){ return ''; } }
    [].forEach.call(s.options,function(o){ var w=NAMES[o.value]; if(w!=null){ var _g=gsuf(o.value); w=(_g&&/\)$/.test(w))?w.replace(/\)$/,', '+_g.replace(/^ \(|\)$/g,'')+')'):w+_g; }     if(w!=null&&o.text!==w){ if(!o.hasAttribute('data-agn-eng')) o.setAttribute('data-agn-eng',o.text); o.text=w; } });
    [].forEach.call(s.querySelectorAll('optgroup'),function(g){ var l=g.getAttribute('data-agn-eng')||g.label; GROUPS.forEach(function(r){ if(r[0].test(l)&&g.label!==r[1]){ g.setAttribute('data-agn-eng',l); g.label=r[1]; } }); });
    return true; }
  M.pickerWords=pickerWords;

  

  var VALID=[[/routed 100 km along HydroBASINS/i,'Glacial lakes upstream \u00b7 changes with our monthly satellite lake checks and outburst reports, not with today\u2019s weather'],
    [/^90-day SPEI/i,'The last 90 days of rain and soil moisture \u00b7 not a forecast'],
    [/^Upstream discharge/i,'River flow upstream \u00b7 days ahead, not one day'],
    [/^Worst intensity-duration window in the next (\d+) forecast hours/i,function(m){ return 'The worst rain spell in the next '+m[1]+' hours \u00b7 the place card says when it starts'; }],
    [/design-basis zone/i,'Fixed map \u00b7 building-code earthquake zones, not a forecast'],
    [/^Static exposure/i,'Fixed map \u00b7 strongest cyclone wind of 1980-2025; no live cyclone track'],
    [/^No daily forecast basis/i,'No forecast time for this layer'],
    [/^Static layer/i,'Fixed map \u00b7 no forecast time']];
  function plainValid(v){ if(!v) return v; for(var i=0;i<VALID.length;i++){ var m=String(v).match(VALID[i][0]); if(m) return typeof VALID[i][1]==='function'?VALID[i][1](m):VALID[i][1]; } return v; }
  M.plain=function(s,hz){ if(!s) return s; var o={}; for(var k in s) o[k]=s[k];
    if(NAMES[hz]) o.title=NAMES[hz];
    if(s.__loading) return o;
    var v=plainValid(s.validFrom); if(v!==s.validFrom){ o.validFrom=v; o.__opValid=s.validFrom; }
    var sc=null; try{ sc=AGN.hz5&&AGN.hz5.scaleOf?AGN.hz5.scaleOf(hz):null; }catch(_){}
    var dir=sc&&sc.direction==='higher-better'?'On this layer a high value is good, so the most soaking ground reads Normal. ':'';
    var t=(s.__hz5&&s.__hz5.na)?'Pink hatched = cannot occur here. ':'';    
    var nd=(s.__hz5&&s.__hz5.nd)?'Purple = no reading yet. ':'';
    if(s.note){ o.__opNote=s.note; o.note=(dir+t+nd).trim()||'Each area is coloured by its level.'; }
    return o; };
  M.legPost=function(node,uni){ if(!node||!uni) return;
    [['__opValid','.agn-leg-valid','agn-leg-valid'],['__opNote','.agn-leg-note','agn-leg-note']].forEach(function(x){ if(!uni[x[0]]) return;
      var at=node.querySelector(x[1]+':not(.agn-op-only)'); var r=D.createElement('div'); r.className='agn-leg-row '+x[2]+' agn-op-only agn-leg-eng'; r.textContent='Engineering: '+uni[x[0]];
      if(at&&at.parentNode) at.parentNode.insertBefore(r,at.nextSibling); else node.appendChild(r); }); };

  

  var G={real:null,final:false,t0:Date.now(),cov:-1,covAt:Date.now(),covFinalAt:0,PEND:'grade \u00b7 checking'};
  function coverage(){ try{ var X=window.DISTRICT_IN||{}, k=Object.keys(X), n=0; for(var i=0;i<k.length;i++){ var r=X[k[i]]; if(r&&(r.nationalLive||r.weatherLive||r.forecastLive)) n++; } return k.length?n/k.length:0; }catch(_){ return 0; } }
  function gradeFinal(){ if(G.final) return true; var c=coverage(), now=Date.now();
    if(Math.abs(c-G.cov)>1e-9){ G.cov=c; G.covAt=now; }
    var swept=c>=0.9||(c>0.5&&now-G.covAt>60000); if(swept&&!G.covFinalAt) G.covFinalAt=now;
    var verif=!!window.__agnVerif||(G.covFinalAt&&now-G.covFinalAt>45000);
    if((swept&&verif)||now-G.t0>300000) G.final=true; return G.final; }
  function ctxData(){ return D.querySelector('.agn-ctx-v[data-ctx="data"]'); }
  var gBusy=false;
  

  function freshGrade(){ try{ var p=AGN.health&&AGN.health().provenance; return p&&p.grade?('grade '+p.grade):null; }catch(_){ return null; } }
  function gradeApply(){ var g=D.getElementById('agnProvGrade'); if(!g) return false; var t=g.textContent;
    if(t!==G.PEND&&t!==G.mine) G.real=t;    
    var fin=gradeFinal(), want=G.PEND;
    if(fin) want=freshGrade()||G.real;    
    if(want==null) return true;
    var lm=String(want).match(/^grade ([A-D])$/); if(lm&&g.getAttribute('data-grade')!==lm[1]&&t!==want) g.setAttribute('data-grade',lm[1]);
    if(t!==want){ gBusy=true; G.mine=want; g.textContent=want; gBusy=false; }
    var c=ctxData(); if(c&&/^grade\b/.test(c.textContent||'')&&c.textContent!==want){ c.textContent=want; }
    D.documentElement.classList.toggle('agn-grade-final',G.final);
    if(!g.__agn77){ g.__agn77=1; if(window.MutationObserver) new MutationObserver(function(){ if(!gBusy) gradeApply(); }).observe(g,{childList:true,characterData:true,subtree:true}); }
    if(!M.__ctxObs&&c&&window.MutationObserver){ M.__ctxObs=new MutationObserver(function(){ var cc=ctxData(); if(cc&&!G.final&&/^grade\b/.test(cc.textContent||'')&&cc.textContent!==G.PEND) cc.textContent=G.PEND; });
      M.__ctxObs.observe(c.parentNode&&c.parentNode.parentNode||c,{childList:true,characterData:true,subtree:true}); }
    return true; }
  M.grade=function(){ return {final:G.final, real:G.real, coverage:coverage()}; };

  

  var PLAINHZ={ 'Seismic (static)':'Earthquake', 'Cyclone (static)':'Cyclone' };
  function W(){ try{ return AGN.level.words; }catch(_){ return ['Normal','Low','Moderate','High','Severe']; } }
  function lvIndex(w){ return W().indexOf(w); }
  function ink(i){ try{ return AGN.level.ink(i); }catch(_){ return '#0C3851'; } }
  function fill(i){ try{ var f=AGN.hz5&&AGN.hz5.fill; return f&&f[i]?f[i]:null; }catch(_){ return null; } }
  function plainEv(t){ t=String(t||'').split(' \u00b7 ')[0].replace(/^scored from /,'based on ').replace(/\s*\((index|estimated)\)/g,'').trim();
    if(/^90-day SPEI/i.test(t)) t='based on rain and soil moisture over the last 90 days';
    if(/^standing susceptibility/i.test(t)) t='a lasting condition of the ground here';
    return t; }
  function parse(R){ var out=[];
    [].forEach.call(R.children,function(ch){
      if(ch.classList.contains('mp-r')&&ch.querySelector('.sn')){ var sn=+ch.querySelector('.sn').textContent; var ev=ch.nextElementSibling&&ch.nextElementSibling.classList.contains('mp-ev')?ch.nextElementSibling:null;
        var w=null; try{ w=AGN.level.word(sn); }catch(_){ w=(ch.querySelector('.bw')||{}).textContent; }
        out.push({kind:'event',n:ch.querySelector('.n').textContent.trim(),w:w,v:sn,ev:ev?plainEv((ev.firstElementChild||ev).textContent):''}); return; }
      if(!ch.classList.contains('mp-sec')) return;
      var hd=(ch.querySelector('.mp-mut')||{}).textContent||'';
      var kind=/^Conditions/.test(hd)?'cond':/^Screened on a class/.test(hd)?'cls':/^Screened, not scored/.test(hd)?'un':null; if(!kind) return;
      [].forEach.call(ch.querySelectorAll('.mp-r'),function(r){ var n=(r.querySelector('.n')||{}).textContent; if(!n) return; n=n.trim();
        if(kind==='cond'){ var sn=r.querySelector('.sn'), v=sn?+sn.textContent:null, w=null; try{ w=AGN.level.word(v); }catch(_){ w=(r.querySelector('.bw')||{}).textContent; }
          var ev=r.nextElementSibling&&r.nextElementSibling.classList.contains('mp-ev')?r.nextElementSibling.textContent:''; out.push({kind:'cond',n:n,w:w,v:v,ev:plainEv(ev)}); }
        else if(kind==='cls'){ var tx=(r.children[1]||{}).textContent||'', seg=tx.split(' \u00b7 '), last=seg[seg.length-1].trim(), w2=lvIndex(last)>=0?last:null;
          if(!w2){ try{ w2=AGN.level.ofClass(tx)||AGN.level.ofClass(seg[0]); }catch(_){} }
          out.push({kind:'cls',n:n,w:w2,cls:tx}); }
        else { var b=(r.querySelector('b')||{}).textContent||'', why=((r.children[1]||{}).textContent||'').replace(b,'').replace(/^\s*\u00b7\s*/,'').trim();
          out.push({kind:'un',n:n,w:/not applicable/i.test(b)?'Cannot occur here':'No data',why:why,feed:/input missing|did not arrive|not loaded/i.test(b)}); } }); });
    return out; }
  function build(R){
    var h=R.querySelector(':scope > .mp-h'); if(!h) return false;
    var name=((h.querySelector('h4')||{}).textContent||'').trim(), sb=h.querySelector('.sb'), sbT=sb?sb.textContent:'';
    var rows=parse(R);
    var pm=sbT.match(/resident population ([\d.,]+)\s*([MK]?)/i), pop=pm?('About '+pm[1]+(/^m$/i.test(pm[2])?' million':/^k$/i.test(pm[2])?' thousand':'')+' people live here'):'';    
    var lv=rows.filter(function(r){ return r.kind!=='un'&&lvIndex(r.w)>=0; });
    lv.sort(function(a,b){ return (lvIndex(b.w)-lvIndex(a.w))||String(a.n).localeCompare(String(b.n)); });
    var live=lv.filter(function(r){ return r.kind!=='cls'; }), topI=live.length?lvIndex(live[0].w):-1;
    var top='', why='';
    var lv0=live.length?live[0]:null, staleTop=function(E){ return '<span class="agn-mps-lv" style="color:#56656e">No issued level</span> <span class="mp-mut">\u00b7 '+esc(E.why||'the hazard engine run on the server is not available')+(lv0&&lvIndex(lv0.w)>0?'; this page alone reads '+esc(lv0.w)+' ('+esc((PLAINHZ[lv0.n]||lv0.n).toLowerCase())+'), not the issued run':'')+'</span>'; };
    var engE=null; try{ var ap=AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null, eu=ap&&AGN.engineLevels?AGN.engineLevels.unitAt(ap.lat,ap.lon):null; engE=eu?AGN.engineLevels.peek(eu):null;
      if(eu&&!engE) AGN.engineLevels.get(eu).then(function(E){ if(E&&!E.days&&lv0){ var tp=R.querySelector('.agn-mps-top'), wy=R.querySelector('.agn-mps-why'); if(tp) tp.innerHTML=staleTop(E); if(wy) wy.remove(); } }).catch(function(){}); }catch(_){ engE=null; }
    if(engE&&!engE.days&&live.length){ top=staleTop(engE); live=[]; }
    else if(!live.length){ var fed=rows.some(function(r){ return r.kind==='un'&&r.feed; });
      top='<span class="agn-mps-lv" style="color:#56656e">'+(fed?'Levels loading':'No level yet')+'</span> <span class="mp-mut">\u00b7 '+(fed?'the forecast for this place is still arriving':'no hazard is scored for this place')+'</span>'; }
    else if(live.length){ var at=live.filter(function(r){ return lvIndex(r.w)===topI; }), nm=at.map(function(r){ return (PLAINHZ[r.n]||r.n).toLowerCase(); });
      top='<span class="agn-mps-lv" style="color:'+ink(topI)+'">'+esc(live[0].w)+'</span> <span class="mp-mut">\u00b7 '+(topI<=0?'no hazard is above Normal':esc(nm.length===1?'set by '+nm[0]:'set equally by '+nm.slice(0,-1).join(', ')+' and '+nm[nm.length-1]))+'</span>';
      if(topI>0&&at[0].ev){ var _dd=0; try{ _dd=(window.AGN&&AGN.day&&AGN.day.get)?(+AGN.day.get()||0):0; }catch(_){}   why='Why: '+esc(PLAINHZ[at[0].n]||at[0].n)+' is '+esc(at[0].w)+' for '+esc(name||'this tehsil')+(_dd>0?' on day +'+_dd:' today')+' ('+esc(at[0].ev)+'; tehsil level, as on the map).'; }
      }
    var un=rows.filter(function(r){ return r.kind==='un'; }), list=lv.concat(un);
     
    var grp={}; un.forEach(function(r){ (grp[r.w]=grp[r.w]||[]).push(PLAINHZ[r.n]||r.n); });
    

    var fixedRows=lv.filter(function(r){ return r.kind==='cls'; });
    var rowOf=function(r){ var i=lvIndex(r.w), f=i>=0?fill(i):null;
        var sw='<i class="agn-mps-sw" aria-hidden="true" style="background:'+(f||'transparent')+'"></i>';
        var nm=esc(PLAINHZ[r.n]||r.n)+(r.kind==='cls'?'<span class="agn-mps-fix">fixed map</span>':'');
        return i>=0?'<div class="mp-r agn-mps-r" role="listitem">'+sw+'<span class="n">'+nm+'</span><span class="bw" style="color:'+ink(i)+'">'+esc(r.w)+'</span></div>':''; };
    var L='<div class="agn-mps-list" role="list" aria-label="Level per hazard">'+live.map(rowOf).join('')
      +(fixedRows.length?'<div class="agn-mps-sub" role="presentation" style="margin:8px 0 2px;font:700 11px/1.3 Manrope,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#56656e">Fixed maps \u00b7 not today\u2019s forecast</div>'+fixedRows.map(rowOf).join(''):'')
      +Object.keys(grp).map(function(w){ return '<div class="agn-mps-na" role="listitem"><b>'+esc(w)+':</b> '+esc(grp[w].join(', ').toLowerCase().replace(/\bglof\b/g,'GLOF').replace(/^./,function(c){ return c.toUpperCase(); }))+'</div>'; }).join('')+'</div>';
    var how='<div class="agn-mps-how"><h5>How this is worked out</h5>'
      +'<p>Each hazard gets one of five levels \u2014 Normal, Low, Moderate, High, Severe \u2014 from the forecast for this area, checked against fixed limits for that hazard. They are the same levels the map shows. Levels of different hazards are not ranked against each other.</p>'
      +'<p>Earthquake and cyclone are fixed maps of where they can strike, not forecasts. \u201cCannot occur here\u201d means the hazard has no way to happen at this place (for example, no glacial lake upstream).</p>'
      +'<ul>'+list.map(function(r){ var t=r.kind==='un'?(r.w==='Cannot occur here'?(r.why||'cannot occur here'):'no data for this place yet'):r.kind==='cls'?'a fixed map, not a forecast':(r.ev||'');
          return t?'<li><b>'+esc(PLAINHZ[r.n]||r.n)+'</b> \u2014 '+esc(t)+'</li>':''; }).join('')+'</ul></div>';
    try{ AGN.ovHow=how; var hw=D.getElementById('agnOvHow'); if(hw&&hw.__h!==how){ hw.__h=how; hw.innerHTML=how; } }catch(_){}
     
    var ctl=[].slice.call(R.querySelectorAll(':scope > .mp-btn'));
    var eng=D.createElement('div'); eng.className='agn-mps-eng agn-op-only'; eng.innerHTML='<div class="agn-mps-engh">Engineering detail (operator)</div>';
    if(sbT){ var s2=D.createElement('div'); s2.className='sb'; s2.textContent=sbT; eng.appendChild(s2); }
    [].slice.call(R.childNodes).forEach(function(n){ if(n===h||ctl.indexOf(n)>=0) return; eng.appendChild(n); });
    if(sb){ sb.textContent=pop||''; sb.classList.add('agn-mps-pop'); }
    var box=D.createElement('div'); box.className='agn-mps'; box.setAttribute('data-agn-mps','1');
    box.innerHTML='<div class="mp-sec agn-mps-top">'+top+'</div>'+(why?'<div class="agn-mps-why">'+why+'</div>':'')+L;
    R.insertBefore(box,h.nextSibling);
    ctl.forEach(function(c){ if(c.classList&&c.classList.contains('mp-btn')&&/CMIP6/.test(c.textContent)){ c.setAttribute('data-agn-eng',c.textContent); c.textContent='Long-term climate (Forecast › 2050s)'; } R.appendChild(c); });
    R.__agnEng=eng; placeEng(R); return true; }
  function placeEng(R){ var eng=R&&R.__agnEng; if(!eng) return; var on=op();
    if(on&&!eng.isConnected) R.insertBefore(eng,R.querySelector(':scope > .mp-btn')||null);
    else if(!on&&eng.isConnected) eng.remove(); }
  var pBusy=false;
  function panel(){ var R=D.getElementById('mpRightIn'); if(!R) return false;
    if(!R.__agn77&&window.MutationObserver){ R.__agn77=1; new MutationObserver(function(){ if(pBusy) return; if(R.querySelector(':scope > .mp-h')&&!R.querySelector(':scope > .agn-mps')){ pBusy=true; try{ build(R); }catch(e){ try{ console.warn('map77 panel',e); }catch(_){} } pBusy=false; } }).observe(R,{childList:true}); }
    if(R.querySelector(':scope > .mp-h')&&!R.querySelector(':scope > .agn-mps')){ pBusy=true; try{ build(R); }catch(_){} pBusy=false; }
    return true; }
  M.panel=panel;
  D.addEventListener('agn:operator',function(){ var R=D.getElementById('mpRightIn'); pBusy=true; try{ placeEng(R); }catch(_){} pBusy=false; setTimeout(pickerWords,0); });

  

  function viewHook(){ if(!window.map||!map.on||typeof districtLayer==='undefined') return false; if(map.__agn77v) return true; map.__agn77v=1;
    map.on('layeradd layerremove',function(e){ if(e&&e.layer===districtLayer) setTimeout(function(){ try{ if(typeof refreshProvinceFill==='function') refreshProvinceFill(); }catch(_){} },0); });
    return true; }
  function tick(){ var ok=true; try{ ok=pickerWords()&&ok; }catch(_){} try{ ok=gradeApply()&&ok; }catch(_){} try{ ok=panel()&&ok; }catch(_){} try{ ok=viewHook()&&ok; }catch(_){} return ok; }
  (function start(n){ var ok=tick(); if(n<600) setTimeout(function(){ start(n+1); }, (ok&&n>30)?2000:500); })(0);
  ['agn:data','agn:national','agn:layer'].forEach(function(ev){ D.addEventListener(ev,function(){ setTimeout(tick,30); }); });
})();
