

(function(){
  if(typeof window.AGN==='undefined') window.AGN={};
  if(AGN.day) return;
  var mapAdapter=AGN.adapters&&AGN.adapters.require('mapLegacy');
  var aiAdapter=AGN.adapters&&AGN.adapters.require('aiLegacy');
  var overviewLocal=(window.AGN&&AGN.sectionState)?AGN.sectionState.state('overview',{forecastDay:0,selectedHazard:'flood',selectedUnit:null,mapReady:false}):{forecastDay:0};
  var DAY=Number(overviewLocal.forecastDay)||0;

  function capable(hz){ try{ return window.hzDayCapable? hzDayCapable(hz) : false; }catch(_){ return false; } }
  function currentHazard(){ try{ return (AGN.hazard&&AGN.hazard.get)?AGN.hazard.get():null; }catch(_){ return null; } }
  function currentLayer(){ try{ return window.currentMapLayer?window.currentMapLayer():currentHazard(); }catch(_){ return currentHazard(); } }
  function isDynamicNss(layer){ return layer==='nss_dynamic'||layer==='nss_retention'||layer==='nss_runoff'; }
  function layerCoverage(layer,day){
    try{ if(isDynamicNss(layer)&&window.nssDayCoverage) return nssDayCoverage(day); }catch(_){}
    try{ return hzDayCoverage(day); }catch(_){ return {available:0,expected:0,coverage:0,enabled:false,complete:false}; }
  }
  function layerMaxDay(layer){
    try{ if(isDynamicNss(layer)&&window.nssMaxForecastDay) return nssMaxForecastDay(); }catch(_){}
    if(layer==='nss'||layer==='nss_baseline') return 0;
    try{ return window.hzMaxForecastDay?hzMaxForecastDay():0; }catch(_){ return 0; }
  }
  function layerCapable(layer,hz){ return isDynamicNss(layer) ? true : (layer==='nss'||layer==='nss_baseline' ? false : capable(hz)); }

  function repaint(){
    

    var _hzBefore=null; try{ _hzBefore=aiAdapter.selectedHazard(); }catch(_){}
    try{ _repaintInner(); }catch(_){}
    try{ if(_hzBefore && aiAdapter.selectedHazard()!==_hzBefore) aiAdapter.setSelectedHazard(_hzBefore); }catch(_){}
  }
  function _repaintInner(){
    

    

    try{ mapAdapter.refreshHazard(); }catch(_){}
    try{ mapAdapter.drawLegend(); }catch(_){}
    try{ var live=AGN.services&&AGN.services.get('livedata'); var st=live&&live.getState?live.getState():null; if(st&&st.comparisonUnit) live.render(st.comparisonUnit); }catch(_){}
    banner();
  }

  

  function banner(){
    var hz=currentHazard(), layer=currentLayer();
    var note=document.querySelector('#v3days .note');
    if(note){
      

      

      var skill=(function(){
        if(DAY===0) return 'observed and analysed conditions';
        var parts=[];
        try{
          var _c=layerCoverage(layer,DAY);
          if(_c && _c.expected) parts.push('coverage '+Math.round((_c.coverage||0)*100)+'%');
        }catch(_){}
        parts.push('lead +'+DAY+' d');
        var _agree=null;
        try{
          var _ml=(window.AGN&&AGN.sectionState)?AGN.sectionState.state('modelab',{}):null;
          if(_ml && _ml.lastSpread!=null && isFinite(_ml.lastSpread))
            _agree='model spread '+Math.round(_ml.lastSpread)+'/100';
        }catch(_){}
        parts.push(_agree || 'model agreement not measured in this session');
        parts.push('forecast skill not validated for this hazard and location');
        return parts.join(' \u00b7 ');
      })();
      

      var maxD=0; try{ maxD=layerMaxDay(layer); }catch(_){}
      var cov=null; try{ if(DAY>0) cov=layerCoverage(layer,DAY); }catch(_){}
      if(DAY===0 && !layerCapable(layer,hz)){
        var why={drought:'Drought is an accumulated condition and does not use the daily map forecast control.',seismic:'Seismic susceptibility is a static map layer and is not forecast by day.',glof:'GLOF needs melt, lake and downstream routing inputs, so the daily map shift is disabled.',cyclone:'Cyclone exposure is static unless an active forecast track is connected.'}[hz] || 'This layer has no daily forecast basis.';
        note.textContent='Current layer · '+why;
      } else if(DAY===0){

        var st=window.__districtForecastStatus||{};
        var c1=null; try{ c1=layerCoverage(layer,1); }catch(_){}
        var capped=false; try{ capped=!!(window.AGN&&AGN.net&&AGN.net.stats().capped); }catch(_){}
        

        if(basis()==='current'){
          

          var _cov=0, _tot=0;
          try{
            var _cs=window.PK_DISTRICT_CENTROIDS||[];
            for(var _q=0;_q<_cs.length;_q++){
              var _r=DISTRICT_IN[_cs[_q].key]; if(!_r||!_r.fc72) continue;
              _tot++;
              if(hzHourIndex(_r.fc72)!=null) _cov++;
            }
          }catch(_){}
          var _per='for the present hour';
          try{ if(typeof legendValidLine==='function'){
                 _per=legendValidLine(hz||'flood').replace(/^Valid\s+/,''); } }catch(_){}
          

          var _legHas = false;
          try{
            var _lg = document.getElementById('v3legend');
            _legHas = !!(_lg && /valid\s+\d{1,2}:\d{2}[^\u00b7]*\u00b7\s*one hourly value/i
                                  .test(_lg.textContent || ''));
          }catch(_){ _legHas = false; }
          var _cover = (_tot===0 ? ' No district forecast series has loaded yet, so every unit shows as no data.'
                        : (_cov<_tot ? ' '+_cov+' of '+_tot+' districts cover this hour; the rest show as no data.' : ''));
          if(_legHas){
            note.textContent = 'Current' + _cover + ' Press Today\u2019s peak for the full calendar day.';
            note.setAttribute('title', 'Current \u00b7 valid ' + _per + '.');
          } else {
            note.textContent = 'Current \u00b7 valid ' + _per + '.' + _cover
              + ' Press Today\u2019s peak for the full calendar day.';
            note.removeAttribute('title');
          }
          try{ var _mp0=document.getElementById('map'); if(_mp0) _mp0.style.opacity='1'; }catch(_){}
          return;
        }
        var _pkD=(function(){try{return hzPkDate(0);}catch(_){return 'today';}})();
        note.textContent = maxD>0
          ? 'Today\u2019s peak \u00b7 valid 00:00\u201324:00 PKT on '+_pkD
            +', worst case across the day. +1 to +'+maxD+' d show that day\u2019s worst case for heat, cold, wind, rain and flood.'
          : st.running
            ? 'Today\u2019s peak \u00b7 valid 00:00\u201324:00 PKT on '+_pkD+', worst case across the day. Forecast days load when the district sweep completes\u2026'
            : capped
              ? 'Today\u2019s peak \u00b7 valid 00:00\u201324:00 PKT on '+_pkD+', worst case across the day. Forecast days unavailable: the session API budget is exhausted.'
              : (c1 && c1.available===0)
                ? 'Today\u2019s peak \u00b7 valid 00:00\u201324:00 PKT on '+_pkD+', worst case across the day. Forecast days unavailable: no district returned hourly data \u2014 the sweep failed. Check the console and AGN.api.stats() for the plan and budget in force.'
                

                : 'Today\u2019s peak \u00b7 valid 00:00\u201324:00 PKT on '+_pkD+', worst case across the day. Forecast days loading \u2014 '
                  +(c1?c1.available:0)+' of '+(c1?c1.expected:0)+' districts ('
                  +(c1?Math.round(c1.coverage*100):0)+'%), 95% required. Backfilling\u2026';
      } else if(layerCapable(layer,hz)){
        note.textContent='Day +'+DAY+' \u00b7 full PKT calendar day, worst case \u00b7 '+skill
          + (cov && !cov.complete ? ' \u00b7 '+cov.available+'/'+cov.expected+' districts covered, the rest shown as no data' : '')+'.';
      } else {
        note.textContent='Day +'+DAY+' \u00b7 '+(hz||'this layer')+' has no forward basis \u2014 held at current conditions.';
      }
      try{ var mp=document.getElementById('map');
        if(mp) mp.style.opacity=(DAY===0?'1':(DAY===1?'0.97':DAY===2?'0.93':'0.88')); }catch(_){}
    }
    

  }

  

  

  function dayNoteEl(){
    try{ return document.querySelector('#v3days .note'); }catch(_){ return null; }
  }
  function sayDayNote(msg){
    var el=dayNoteEl(); if(el) el.textContent=msg;
  }
  function dayRefusalReason(hz){
    return ({
      drought:'Drought is an accumulated condition and does not use the daily map forecast control.',
      seismic:'Seismic susceptibility is a static map layer and is not forecast by day.',
      glof:'GLOF needs melt, lake and downstream routing inputs, so the daily map shift is disabled.',
      cyclone:'Cyclone exposure is static unless an active forecast track is connected.',
      landslide:'Landslide uses antecedent wetness and slope, which the daily window does not carry.',
      flood_riverine:'The riverine pathway is upstream discharge with its own lead in days, not a '
                    +'daily rainfall window, so the day control does not move it.',
      

      aqi:'Air quality is the latest retrieved index for each unit, not a forecast series, so '
         +'there is no day to move it to.',
      air:'Air quality is the latest retrieved index for each unit, not a forecast series, so '
         +'there is no day to move it to.'
    })[hz] || 'This layer has no daily forecast basis.';
  }

  function set(d){
    

    var maxDay=layerMaxDay(currentLayer());
    var want=Math.max(0,+d||0);
    var layer=currentLayer(), hz=currentHazard();
    if(want>0 && !layerCapable(layer,hz)){
      sayDayNote('Current layer · '+dayRefusalReason(hz)
        +' Forecast days apply to rainfall, flood, heat, cold and wind layers.');
      return false;
    }
    if(want>maxDay){
      try{
        var cov=layerCoverage(layer,want)||{};
        var pct=Math.round((cov.coverage||0)*100);
        sayDayNote('Day +'+want+' not available yet · forecast coverage '+pct
          +'% of '+(cov.expected||576)+' districts, 95% required. Still loading — the district '
          +'sweep backfills every minute.');
      }catch(_){}
      return false;
    }
    d=Math.max(0,Math.min(maxDay,want));
    if(d===DAY) return true;
    DAY=d; overviewLocal.forecastDay=DAY;
    publishHorizon();
    try{ document.dispatchEvent(new CustomEvent('agn:day',{detail:{day:DAY, basis:basis()}})); }catch(_){}
    repaint();
    try{ if(_refreshButtons) _refreshButtons(); }catch(_){}
  }

  

  function publishHorizon(){
    try{
      if(!AGN.timeSelection || !AGN.timeSelection.set) return;
      var horizon = (DAY===0) ? 'now' : 'short';
      var lead    = (DAY===0) ? (basis()==='peak' ? 24 : 0) : DAY*24;
      var cur=null; try{ cur=AGN.timeSelection.state(); }catch(_){ }
      

      var sameLead = (cur && cur.leadHours==null) ? (lead==null) : (Number(cur&&cur.leadHours)===Number(lead));
      if(cur && cur.horizon===horizon && sameLead) return;
      AGN.timeSelection.set(horizon, lead, 'map-day-strip');
    }catch(e){ try{ console.warn('[AGN] publishHorizon', e&&e.message); }catch(_){ } }
  }
  

  

  var BASIS='peak';
  

  var _refreshButtons=null;
  function basis(){ return DAY===0 ? BASIS : 'peak'; }
  function setBasis(b){
    b=(b==='current')?'current':'peak';
    if(DAY!==0){ DAY=0; overviewLocal.forecastDay=0; }
    if(b===BASIS && DAY===0) return true;
    BASIS=b;
    publishHorizon();
    try{ document.dispatchEvent(new CustomEvent('agn:day',{detail:{day:DAY, basis:BASIS}})); }catch(_){}
    repaint();
    try{ if(_refreshButtons) _refreshButtons(); }catch(_){}
    return true;
  }
  AGN.day={ get:function(){ return Number(overviewLocal.forecastDay)||DAY; }, set:set, capable:capable,
            basis:basis, setBasis:setBasis, publishHorizon:publishHorizon };
  

  try{ setTimeout(publishHorizon, 900); }catch(_){}

  

  function wire(){
    var host=document.getElementById('v3days');
    if(!host) return setTimeout(wire,400);
    if(host.dataset.v72==='1') return;
    host.dataset.v72='1';
    

    [].forEach.call(host.querySelectorAll('button[data-d]'),function(b){
      b.addEventListener('click',function(){ if(!b.disabled) set(b.getAttribute('data-d')); });
    });
    

    [].forEach.call(host.querySelectorAll('button[data-basis]'),function(b){
      b.addEventListener('click',function(){
        if(b.disabled) return;
        setBasis(b.getAttribute('data-basis'));
      });
    });
    _refreshButtons=refreshDayButtons;
    function refreshDayButtons(){
      try{ if(window.hzClearDayCoverage) hzClearDayCoverage(); }catch(_){}
      var sweep={}; try{ sweep=window.__districtForecastStatus||{}; }catch(_){}
      var hz=currentHazard(), layer=currentLayer();
      var canShift=layerCapable(layer,hz);
      var maxDay=canShift ? layerMaxDay(layer) : 0;
      var reason=(layer==='nss'||layer==='nss_baseline')
        ? 'Baseline natural sponginess is static and does not change with forecast day.'
        : ({
        drought:'Drought is an accumulated condition and does not use the daily map forecast control.',
        seismic:'Seismic susceptibility is a static map layer and is not forecast by day.',
        glof:'GLOF needs melt, lake and downstream routing inputs, so the daily map shift is disabled.',
        cyclone:'Cyclone exposure is static unless an active forecast track is connected.'
      }[hz] || 'This layer has no daily forecast basis.');
      

      var _hourOk=null;
      try{
        _hourOk=(function(){
          var n=0, seen=0;
          var cs=window.PK_DISTRICT_CENTROIDS||[];
          for(var q=0;q<cs.length && seen<40;q++){
            var rec=DISTRICT_IN[cs[q].key]; if(!rec||!rec.fc72) continue;
            seen++; if(hzHourIndex(rec.fc72)!=null) n++;
          }
          return seen ? (n>0) : null;
        })();
      }catch(_){ _hourOk=null; }
      [].forEach.call(host.querySelectorAll('button[data-basis]'),function(b){
        var bk=b.getAttribute('data-basis');
        var active=(DAY===0 && basis()===bk);
        b.classList.toggle('on', active);
        b.setAttribute('aria-pressed', active?'true':'false');
        if(bk==='current'){
          var off=(_hourOk===false);
          b.disabled=off;
          if(off){ b.setAttribute('aria-disabled','true');
                   b.title='No district forecast series covers the present hour yet, so a '
                          +'current-hour map cannot be drawn. Today\u2019s peak is available.'; }
          else   { b.removeAttribute('aria-disabled');
                   b.title='Current \u00b7 the single hour containing the present time in Pakistan'; }
        } else {
          b.disabled=false; b.removeAttribute('aria-disabled');
          b.title='Today\u2019s peak \u00b7 the worst case across the full calendar day in Pakistan';
        }
      });
      [].forEach.call(host.querySelectorAll('button[data-d]'),function(b){
        var d=+b.getAttribute('data-d')||0;
        if(b.hasAttribute('data-basis')) return;   
        b.classList.toggle('on', d===DAY);
        b.setAttribute('aria-pressed', d===DAY ? 'true' : 'false');
        if(d===0){
          b.disabled=false;
          b.removeAttribute('aria-disabled');
          b.title='Today · full PKT calendar day, worst case';
          return;
        }
        if(!canShift){
          b.disabled=true;
          b.setAttribute('aria-disabled','true');
          b.title=reason;
          return;
        }
        var cov={available:0,expected:0,coverage:0};
        try{ cov=layerCoverage(layer,d); }catch(_){}
        var pct=Math.round((cov.coverage||0)*100);
        if(d<=maxDay){
          b.disabled=false;
          b.removeAttribute('aria-disabled');
          b.title='Day +'+d+' · '+cov.available+' of '+cov.expected+' districts have hourly cover ('+pct+'%).'
            +(cov.complete?'':' Districts without cover render as no data, not as low risk.');
        } else {
          b.disabled=true;
          b.setAttribute('aria-disabled','true');
          b.title = sweep.running
            ? 'Day +'+d+' · forecast sweep in progress ('+(sweep.updated||0)+' districts loaded).'
            : (cov.expected===0
                ? 'Day +'+d+' · waiting for the district forecast sweep.'
                : 'Day +'+d+' · '+cov.available+' of '+cov.expected+' districts have hourly cover ('+pct+'%), below the 95% coverage gate.');
        }
      });
      var note=host.querySelector('.note');
      if(note && !canShift){ note.textContent=reason; }
      if(DAY>maxDay) set(0);
      banner();
    }
    window.__agnRefreshDayButtons=refreshDayButtons;
    refreshDayButtons();
    ['agn:national','agn:data'].forEach(function(ev){
      document.addEventListener(ev,function(){ setTimeout(refreshDayButtons,200); });
    });

    
    

    document.addEventListener('agn:district-forecast-status', function(){
      try{ if(window.hzClearDayCoverage) hzClearDayCoverage(); }catch(_){}
      setTimeout(refreshDayButtons, 120);
    });
    document.addEventListener('agn:hazard', function(){ setTimeout(function(){ if(!capable(currentHazard()) && DAY!==0) set(0); refreshDayButtons(); },120); });
    banner();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire);
  else wire();
})();
