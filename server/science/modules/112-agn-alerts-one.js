


(function(){
  'use strict';
  var G=window, D=document;
  var ON=!(G.AGN&&AGN.engineMode) && !/[?&]engine=1\b/.test(location.search) && !/[?&]alerts=page\b/.test(location.search);
  function blank(why){ return {rows:null, ctx:null, build:null, gate:null, stale:false, at:0, received:null, why:why}; }
  var L={ alerts:{url:'/api/alerts', E:blank('not asked yet'), src:'page', why:null, quake:true},
          board:{url:'/api/verdicts', E:blank('not asked yet'), src:'page', why:null, quake:false} };
  function ctx(){ try{ return { day:(AGN.day&&AGN.day.get)?AGN.day.get():0, basis:(AGN.day&&AGN.day.basis)?AGN.day.basis():null, lead:(G.aiState&&aiState.lead)||24 }; }catch(_){ return null; } }
  function build(){ try{ return (G.AGN_BUILD&&AGN_BUILD.patch)||null; }catch(_){ return null; } }
  function gate(){ try{ return (G.AGN_MODEL_GATE&&AGN_MODEL_GATE.version)||null; }catch(_){ return null; } }
  function scenario(){ try{ return !!(AGN.scenario&&AGN.scenario.active&&AGN.scenario.active()); }catch(_){ return false; } }
  function usable(l){
    var E=l.E;
    if(!ON) return 'the page builds its own list here';
    if(!E.rows) return E.why||'the engine list has not arrived';
    if(E.stale) return 'the engine report is over 3 hours old';
    if(E.build!==build()) return 'the engine ran build '+E.build+', this page is '+build();
    if(E.gate!==gate()) return 'the engine ran a different model gate';
    if(scenario()) return 'a scenario is active on this page';
    if(l.quake){ try{ var qs=(AGN.quake&&AGN.quake.src)?AGN.quake.src():null; if(qs && qs.indexOf('/api/quake/live')<0) return 'an earthquake replay is loaded on this page'; }catch(_){} }
    var c=ctx(), e=E.ctx||{}; if(!c||c.day!==e.day||c.basis!==e.basis||c.lead!==e.lead) return 'this page is looking at another day, basis or lead than the engine list';
    var age=E.received?(Date.now()-Date.parse(E.received))/60e3:Infinity; if(!(age<=75)){ soon(); return 'the engine list is '+(isFinite(age)?Math.round(age)+' min':'of unknown')+' old (it is published at least hourly)'; }
    return null;
  }
  var T=0, lastAsk=0;
   
  function soon(){ if(Date.now()-lastAsk>60e3){ lastAsk=Date.now(); setTimeout(load, 0); } }
  function get(l){
    return fetch(location.origin+l.url,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
      if(j&&j.ready&&Array.isArray(j.rows)) l.E={rows:j.rows, ctx:j.ctx||null, build:j.build||null, gate:j.gate||null, stale:!!j.stale, at:Date.now(), received:j.received||null, why:null,
                                                  orderBasis:j.orderBasis||null, unitLevel:j.unitLevel||null, coverage:j.coverage||null};
      else l.E=blank((j&&j.why)||'the server has no engine list');
    }).catch(function(){ l.E=blank('the server did not answer for the engine list'); });
  }
  function load(){ if(!ON) return; clearTimeout(T); T=0; lastAsk=Date.now();
    Promise.all([get(L.alerts), get(L.board)]).then(function(){ T=setTimeout(load, 5*60e3); }); }
  function clone(rows){ try{ return JSON.parse(JSON.stringify(rows)); }catch(_){ return rows.slice(); } }
   
  function wrap(){
    if(typeof G.activeAlerts!=='function' || G.activeAlerts.__agnOne) return !!(G.activeAlerts&&G.activeAlerts.__agnOne);
    if(!G.activeAlerts.__agnGate || !G.activeAlerts.__agnQ) return false;
    var o=G.activeAlerts;
    var w=function(){ var why=usable(L.alerts); L.alerts.why=why;
      if(!why){ L.alerts.src='engine'; return clone(L.alerts.E.rows); }
      if(ON){ L.alerts.src='none'; var e=[]; e.unavailableWhy=why; return e; }   /* v91.17.283.12: the client view lists the issued alerts only; the page computes none of its own */
      L.alerts.src='page'; return o.apply(this, arguments); };
    w.__agnOne=true; w.__agnGate=true; w.__agnQ=true; w.__orig=o; Object.keys(o).forEach(function(k){ if(w[k]===undefined) w[k]=o[k]; });
    G.activeAlerts=w; return true;
  }
  

  function engineVerdicts(){
    var l=L.board, why=usable(l); l.why=why;
    if(why&&ON){ l.src='none'; var e0=[]; e0.orderBasis=null; e0.unitLevel=null; e0.source='engine-unavailable'; e0.unavailableWhy=why; e0.coverage={unassessedUnits:function(){ return []; }}; return e0; }   /* v91.17.283.12: the district board is the server's levels; none of the page's own */
    if(why){ l.src='page'; return null; }
    l.src='engine';
    var E=l.E, a=E.rows.slice(); a.orderBasis=E.orderBasis; a.unitLevel=E.unitLevel;
    var c={}, cv=E.coverage||{}; Object.keys(cv).forEach(function(k){ if(k!=='units') c[k]=cv[k]; });
    var miss=Array.isArray(cv.units)?cv.units.slice():[]; c.unassessedUnits=function(){ return miss.slice(); }; a.coverage=c;
    a.source='engine';
    return a;
  }
  (function keep(n){ try{ wrap(); }catch(_){} if(n<300) setTimeout(function(){ keep(n+1); }, 1000); })(0);
  load();
  ['agn:data','agn:national','agn:sweep-done'].forEach(function(ev){ D.addEventListener(ev, function(){ if(!L.alerts.E.at||Date.now()-L.alerts.E.at>60e3) load(); }); });
  G.AGN=G.AGN||{}; G.AGN.engineVerdicts=engineVerdicts;
  G.AGN.alerts={ source:function(){ return L.alerts.src; }, why:function(){ return L.alerts.why; }, boardSource:function(){ return L.board.src; }, boardWhy:function(){ return L.board.why; },
    engine:function(){ return { alerts:{rows:L.alerts.E.rows?L.alerts.E.rows.length:null, ctx:L.alerts.E.ctx, build:L.alerts.E.build, received:L.alerts.E.received, why:L.alerts.E.why},
                                board:{rows:L.board.E.rows?L.board.E.rows.length:null, ctx:L.board.E.ctx, build:L.board.E.build, received:L.board.E.received, why:L.board.E.why} }; },
    reload:load };
})();
