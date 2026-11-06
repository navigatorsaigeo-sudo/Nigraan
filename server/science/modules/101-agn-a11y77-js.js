


(function(){
  var D=document; window.AGN=window.AGN||{}; var A=AGN.a11y=AGN.a11y||{};
  function vis(e){ if(!e||!e.isConnected) return false; var r=e.getBoundingClientRect(); if(!(r.width>0||r.height>0)) return false; var cs=getComputedStyle(e); return cs.visibility!=='hidden'&&cs.display!=='none'; }
  var FOC='a[href],button:not([disabled]),select:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  function focusables(root){ return [].slice.call(root.querySelectorAll(FOC)).filter(function(e){ return e.tabIndex>=0&&vis(e); }); }


  

  function tabsFix(){ var nav=D.getElementById('machNav'); if(!nav) return false;
    [].forEach.call(nav.children,function(b){ if(b.tagName==='BUTTON'&&b.getAttribute('role')!=='tab'){ b.setAttribute('role','tab'); if(!b.hasAttribute('aria-selected')) b.setAttribute('aria-selected',b.classList.contains('active')?'true':'false'); } });
    var tabs=[].slice.call(nav.querySelectorAll('[role="tab"]')).filter(vis), cur=tabs.filter(function(t){ return t.getAttribute('aria-selected')==='true'||t.classList.contains('active'); })[0]||tabs[0];
    tabs.forEach(function(t){ var want=(t===cur)?0:-1; if(t.tabIndex!==want) t.tabIndex=want; });
    if(!nav.__agnA11y){ nav.__agnA11y=1;
      D.addEventListener('keydown',function(e){ var t=e.target; if(!t||!t.closest||!t.closest('#machNav')||t.getAttribute('role')!=='tab') return;
        var L=[].slice.call(nav.querySelectorAll('[role="tab"]')).filter(vis), i=L.indexOf(t), j=null; if(i<0) return;
        if(e.key==='ArrowRight') j=(i+1)%L.length; else if(e.key==='ArrowLeft') j=(i-1+L.length)%L.length; else if(e.key==='Home') j=0; else if(e.key==='End') j=L.length-1;
        if(j==null) return; e.preventDefault(); e.stopImmediatePropagation(); L.forEach(function(x,k){ x.tabIndex=k===j?0:-1; }); L[j].focus(); L[j].click(); },true);
      nav.addEventListener('click',function(){ setTimeout(tabsFix,0); setTimeout(all,400); setTimeout(all,1500); }); }
    return true; }

  

  var SCROLL=[['#hscroll','Hourly forecast, scrolls sideways'],['.agn-obs-wrap','Station readings table, scrolls'],['.ol-tbl-wrap','Outlook table, scrolls']];
  function scrollFix(){ SCROLL.forEach(function(s){ [].forEach.call(D.querySelectorAll(s[0]),function(e){ if(!e.hasAttribute('tabindex')){ e.tabIndex=0; e.setAttribute('role','region'); if(!e.getAttribute('aria-label')) e.setAttribute('aria-label',s[1]); } }); }); }

  

  var mapObs=null;
  function untab(root){ var n=0; [].forEach.call(root.querySelectorAll('path,.leaflet-interactive:not(.leaflet-marker-icon)'),function(p){ if(p.getAttribute('tabindex')!=='-1'){ p.setAttribute('tabindex','-1'); n++; } if(p.tagName==='path'&&!p.hasAttribute('aria-hidden')) p.setAttribute('aria-hidden','true'); }); return n; }
  function centreClick(m){ try{ var c=m.getContainer(), r=c.getBoundingClientRect(), lg=D.getElementById('v3legend'), w=D.getElementById('mpMapWrap'), off=(w&&w.classList.contains('agn-mb84')&&lg&&lg.offsetParent)?Math.round(lg.getBoundingClientRect().width+28):0, x=r.left+(r.width-off)/2, y=r.top+r.height/2;    
      var hit=(D.elementsFromPoint?D.elementsFromPoint(x,y):[D.elementFromPoint(x,y)]).filter(function(e){ return e&&e.tagName==='path'&&e.classList.contains('leaflet-interactive'); })[0];
      if(!hit) return false; ['mousedown','mouseup','click'].forEach(function(t){ hit.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:y,view:window,button:0})); }); return true; }catch(_){ return false; } }
  function mapFix(){ var el=D.getElementById('map'); if(!el||!window.map||!map.getContainer) return false;
    untab(el);
    if(!el.getAttribute('role')) el.setAttribute('role','region');
    if(!el.getAttribute('aria-roledescription')) el.setAttribute('aria-roledescription','map');
    el.setAttribute('aria-label','Map of Pakistan. Arrow keys move the map, plus and minus zoom, Enter opens the place under the centre mark.');
    if(!mapObs&&window.MutationObserver){ mapObs=new MutationObserver(function(ms){ for(var i=0;i<ms.length;i++){ if(ms[i].addedNodes&&ms[i].addedNodes.length){ untab(el); break; } } });
      mapObs.observe(el,{childList:true,subtree:true}); }
    if(!el.__agnKey){ el.__agnKey=1; el.addEventListener('keydown',function(e){ if(e.target!==el) return; if(e.key==='Enter'||e.key===' '){ if(centreClick(map)) e.preventDefault(); } }); }
    var wrap=D.getElementById('mpMapWrap')||el.parentElement, panel=wrap&&wrap.closest('.mappanel');
    if(wrap&&!D.getElementById('agnSkipMap')){ var a=D.createElement('a'); a.id='agnSkipMap'; a.className='agn-skip-map'; a.href='#'; a.textContent='Skip map';
      a.addEventListener('click',function(e){ e.preventDefault(); skipMap(); }); wrap.insertBefore(a,wrap.firstChild); }
    return true; }
  function skipMap(){ var R=D.getElementById('mpRight'), wrap=D.getElementById('mpMapWrap');
    if(R&&vis(R)){ var f=focusables(R)[0]; if(!R.hasAttribute('tabindex')) R.setAttribute('tabindex','-1'); (R).focus({preventScroll:false}); return; }
    var all=focusables(D.body), last=-1; all.forEach(function(e,i){ if(wrap&&wrap.contains(e)) last=i; }); var nx=all[last+1]; if(nx) nx.focus(); }
  A.skipMap=skipMap; A.centreClick=function(){ return window.map?centreClick(map):false; };

  

  var lastFocus=null, lastPress=null, lastPressAt=0, open=[];
  D.addEventListener('focusin',function(e){ var t=e.target; if(t&&t!==D.body&&!(t.closest&&t.closest('[role="dialog"],[role="alertdialog"],dialog'))) lastFocus=t; },true);
  D.addEventListener('pointerdown',function(e){ var t=e.target&&e.target.closest&&e.target.closest('button,a[href],[role="button"]'); if(t&&!t.closest('[role="dialog"],[role="alertdialog"],dialog')){ lastPress=t; lastPressAt=Date.now(); } },true);
  function dialogs(){ return [].slice.call(D.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open]')).filter(function(d){ return vis(d)&&!d.closest('.leaflet-popup')&&!d.hasAttribute('data-agn-nofocus'); }); }
  function closer(d){ return [].slice.call(d.querySelectorAll('button,[role="button"]')).filter(function(b){ var s=((b.getAttribute('aria-label')||'')+' '+(b.title||'')+' '+b.textContent).trim(); return vis(b)&&(/\bclose\b/i.test(s)||/^[×✕✖x]$/i.test(b.textContent.trim())); })[0]||null; }
  function track(){ var now=dialogs();
    now.forEach(function(d){ if(open.some(function(o){ return o.d===d; })) return;
      var opener=(Date.now()-lastPressAt<2000&&lastPress&&lastPress.isConnected)?lastPress:lastFocus; open.push({d:d,opener:opener});
      [300,1500,4000].forEach(function(t){ setTimeout(function(){ try{ scrollFix(); }catch(_){} },t); });
      if(!d.contains(D.activeElement)){ var F=focusables(d), c=closer(d), first=F.filter(function(e){ return e!==c; })[0]||c;
        if(first) first.focus(); else { if(!d.hasAttribute('tabindex')) d.setAttribute('tabindex','-1'); d.focus(); } } });
    open=open.filter(function(o){ if(now.indexOf(o.d)>=0) return true;
      restore(o,0); return false; }); }
   
   
  function restore(o,k){ var a=D.activeElement; if(!o.t0) o.t0=Date.now();
    if(a&&a!==D.body&&a.isConnected&&!o.d.contains(a)&&a!==o.opener) return;    
    if(a!==o.opener&&o.opener&&o.opener.isConnected&&vis(o.opener)){ try{ o.opener.focus({preventScroll:true}); }catch(_){} }
    if(Date.now()-o.t0<4000) setTimeout(function(){ restore(o,k+1); },80); }
  A.dialogsOpen=function(){ return open.map(function(o){ return o.d; }); }; A._dlg=function(){ return {open:open.map(function(o){ return {d:o.d.className,op:o.opener&&(o.opener.id||o.opener.tagName),vis:vis(o.opener)}; }),lastFocus:lastFocus&&(lastFocus.id||lastFocus.tagName)}; };
  D.addEventListener('keydown',function(e){ if(!open.length) return; var top=open[open.length-1].d; if(!top.isConnected) return;
    if(e.key==='Escape'){ var d=top; setTimeout(function(){ if(vis(d)){ var c=closer(d); if(c) c.click(); } setTimeout(track,30); },120); return; }
    if(e.key==='Tab'&&(top.getAttribute('aria-modal')==='true'||top.tagName==='DIALOG')){ var F=focusables(top); if(!F.length) return; var i=F.indexOf(D.activeElement);
      if(e.shiftKey&&(i<=0)){ e.preventDefault(); F[F.length-1].focus(); } else if(!e.shiftKey&&(i<0||i===F.length-1)){ e.preventDefault(); F[0].focus(); } } },true);
  ['click','keyup'].forEach(function(t){ D.addEventListener(t,function(){ setTimeout(track,60); setTimeout(track,400); },true); });
  setInterval(track,10000); document.addEventListener('agn:dom',track);    

  

  function lumOf(c){ var m=String(c||'').match(/[\d.]+/g); if(!m||m.length<3) return null; if(m.length>3&&+m[3]<0.99) return null;
    var f=function(v){ v=v/255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); }; return 0.2126*f(+m[0])+0.7152*f(+m[1])+0.0722*f(+m[2]); }
  function cr(a,b){ return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05); }
  function inkFix(){ var n=0; [].forEach.call(D.querySelectorAll('.view.active table td, .view.active table td > div'),function(e){ if(e.__agnInk) return;
      var cs=getComputedStyle(e), bl=lumOf(cs.backgroundColor), fl=lumOf(cs.color); if(bl==null||fl==null) return;
      if(cr(bl,fl)<4.5&&fl>0.9&&cr(bl,lumOf('rgb(11,31,41)'))>=4.5){ e.style.setProperty('color','#0b1f29','important'); e.__agnInk=1; n++; } }); return n; }
  A.inkFix=inkFix;
   
  var WIDE=window.matchMedia?window.matchMedia('(min-width:901px)'):{matches:true};
  function tabsFit(){ var nav=D.getElementById('machNav'); if(!nav) return false;
    var ev=[].filter.call(nav.children,function(b){ return b.tagName==='BUTTON'&&/^Evidence\b/.test((b.getAttribute('data-agn-full')||b.textContent||'').trim()); })[0];
    if(ev&&!ev.getAttribute('data-agn-full')){ ev.setAttribute('data-agn-full',ev.textContent.trim()); if(!ev.title) ev.title=ev.textContent.trim(); ev.setAttribute('aria-label',ev.textContent.trim()); }
    function full(){ if(ev&&ev.textContent!==ev.getAttribute('data-agn-full')) ev.textContent=ev.getAttribute('data-agn-full'); }
    function over(){ return nav.scrollWidth>nav.clientWidth+1; }
    nav.classList.remove('agn-tabs-wrap');
    if(!WIDE.matches){ full(); return true; }
    full(); if(over()&&ev&&ev.textContent!=='Evidence') ev.textContent='Evidence';
    if(over()) nav.classList.add('agn-tabs-wrap');
    A.tabsFitState={short:!!(ev&&ev.textContent==='Evidence'),wrap:nav.classList.contains('agn-tabs-wrap'),sw:nav.scrollWidth,cw:nav.clientWidth};
    return true; }
  A.tabsFit=tabsFit;
  window.addEventListener('resize',function(){ setTimeout(tabsFit,60); });    
  function all(){ var ok=true; try{ inkFix(); }catch(_){} try{ ok=tabsFix()&&ok; }catch(_){} try{ scrollFix(); }catch(_){} try{ tabsFit(); }catch(_){} try{ ok=mapFix()&&ok; }catch(_){} return ok; }
  (function start(n){ var ok=all(); if(n<240) setTimeout(function(){ start(n+1); }, ok&&n>20?5000:500); })(0);
  ['agn:operator','agn:layer','agn:data','agn:national'].forEach(function(ev){ D.addEventListener(ev,function(){ setTimeout(all,50); }); });
  A.version='91.17.77-u1';
})();
