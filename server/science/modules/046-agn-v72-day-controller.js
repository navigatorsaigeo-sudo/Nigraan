

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
  /* v91.17.283.28 · P14 · the day buttons read the SERVER's issued days: GET /api/levels?layer=..&day=0 lists, per issued day, the layers the
     server issued (days[].layers). A day is offered when the server issued that layer for it; the page-side forecast-coverage sweep and its
     95 % gate are deleted. One read per layer and levels run, shared with the "Today's peak" line. */
  var SRV={};
  function levelsRunKey(){ try{ return (window.AGN&&AGN.pointState&&AGN.pointState.levelsRun)?(AGN.pointState.levelsRun()||''):''; }catch(_){ return ''; } }
  function served(layer){ var k=layer+'|'+levelsRunKey(), c=SRV[k]; if(c&&c.v!==undefined) return c.v; if(c) return undefined;
    SRV[k]=c={}; c.p=fetch('/api/levels?layer='+encodeURIComponent(layer)+'&day=0',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; })
      .then(function(j){ c.v=j; try{ if(_refreshButtons) _refreshButtons(); }catch(_){} try{ repaint(); }catch(_){} },function(){ delete SRV[k]; });
    return undefined; }
  function servedDays(layer){ var j=served(layer); if(j===undefined) return null; var D0=(j&&Array.isArray(j.days))?j.days:[];
    return D0.filter(function(x){ return x&&Array.isArray(x.layers)&&x.layers.indexOf(layer)>=0; }).map(function(x){ return +x.day; }); }
  function layerMaxDay(layer){ if(layer==='nss'||layer==='nss_baseline') return 0; var d=servedDays(layer); if(!d) return 0; var m=0; while(d.indexOf(m+1)>=0) m++; return m; }
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
      if(DAY===0 && !layerCapable(layer,hz)){
        var why={drought:'Drought is an accumulated condition and does not use the daily map forecast control.',seismic:'Seismic susceptibility is a static map layer and is not forecast by day.',glof:'GLOF needs melt, lake and downstream routing inputs, so the daily map shift is disabled.',cyclone:'Cyclone exposure is static unless an active forecast track is connected.'}[hz] || 'This layer has no daily forecast basis.';
        note.textContent='Current layer · '+why;
      } else if(DAY===0){

        

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
          var _cover = (_tot===0 ? ' No tehsil forecast series has loaded yet, so every unit shows as no data.'
                        : (_cov<_tot ? ' '+_cov+' of '+_tot+' tehsils cover this hour; the rest show as no data.' : ''));
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
        var _sd=servedDays(layer);
        note.textContent = maxD>0
          ? 'Today\u2019s peak \u00b7 valid 00:00\u201324:00 PKT on '+_pkD
            +', worst case across the day. +1 to +'+maxD+' d show that day\u2019s worst case, as the server issued it.'
          : (_sd===null
            ? 'Today\u2019s peak \u00b7 valid 00:00\u201324:00 PKT on '+_pkD+', worst case across the day. Reading which forecast days the server has issued\u2026'
            : 'Today\u2019s peak \u00b7 valid 00:00\u201324:00 PKT on '+_pkD+', worst case across the day. The server has issued no forecast day of this layer.');
      } else if(layerCapable(layer,hz)){
        note.textContent='Day +'+DAY+' \u00b7 full PKT calendar day, worst case \u00b7 '+skill+'.';
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
      sayDayNote(servedDays(layer)===null?'Day +'+want+' · reading which forecast days the server has issued\u2026'
        :'Day +'+want+' · the server has issued no level of this layer for that day.');
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
  

  

  /* v91.17.283.22 · item 5: the map opens on the present hour (owner, 26 Oct 2026); Today's peak is one press away. The server's hazard
     engine (this page in engine mode, ?engine=1) keeps today's peak: the issued level of a day is the day's worst case */
  var BASIS=(function(){ var s=''; try{ s=(typeof location!=='undefined'&&location.search)||''; var nv=(typeof performance!=='undefined'&&performance.getEntriesByType&&performance.getEntriesByType('navigation')[0])||null; if(nv&&nv.name) s+=' '+nv.name; }catch(_){} return /[?&]engine=1\b/.test(s)?'peak':'current'; })();
  

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
        if(d<=maxDay){
          b.disabled=false;
          b.removeAttribute('aria-disabled');
          b.title='Day +'+d+' · issued by the server for this layer.';
        } else {
          b.disabled=true;
          b.setAttribute('aria-disabled','true');
          b.title = servedDays(layer)===null
            ? 'Day +'+d+' · reading which forecast days the server has issued\u2026'
            : 'Day +'+d+' · the server has issued no level of this layer for this day.';
        }
      });
      var note=host.querySelector('.note');
      if(note && !canShift){ note.textContent=reason; }
      if(DAY>maxDay) set(0);
      banner(); peakLine();
    }
    /* v91.17.283.22 · item 5: one line under the time buttons from the server's issued levels of today for the hazard on the map: the
       highest level any tehsil holds and how many hold it ("Today's peak: Moderate in 153 tehsils"); nothing when every tehsil is Normal,
       or for a layer that is not a hazard. One read of /api/levels per hazard and levels run. */
    function peakLine(){ try{ if(window.AGN&&AGN.engineMode) return; var el=document.getElementById('agnPeakLine'); if(!el){ el=document.createElement('div'); el.id='agnPeakLine'; el.setAttribute('role','note');
          el.style.cssText='font:600 12px/1.35 Manrope,system-ui,sans-serif;color:#0C3851;background:rgba(255,255,255,.92);border-radius:8px;padding:3px 8px;margin-top:4px;display:inline-block';
          host.parentNode.insertBefore(el,host.nextSibling); }
        var hz=null; try{ hz=(window.AGN&&AGN.hz5&&AGN.hz5.currentKey)?AGN.hz5.currentKey():null; }catch(_){ hz=null; }
        var isHz=!!(hz&&window.AGN&&AGN.hz5&&AGN.hz5.isHazardLayer&&AGN.hz5.isHazardLayer(hz));
        if(!isHz){ el.textContent=''; el.hidden=true; return; }

        var paint=function(j){ var e2=document.getElementById('agnPeakLine'); if(!e2) return; var cur=(AGN.hz5&&AGN.hz5.currentKey)?AGN.hz5.currentKey():null; if(cur!==hz) return;
          var LV=j&&j.ready!==false&&!j.stale&&j.levels?j.levels:null, top=0, n=0, Wd=(AGN.hz5&&AGN.hz5.words)||['Normal','Low','Moderate','High','Severe'];
          if(LV) Object.keys(LV).forEach(function(u){ var v=Number(LV[u]); if(!isFinite(v)) return; if(v>top){ top=v; n=1; } else if(v===top&&v>0) n++; });
          var t=top>0?'Today\u2019s peak: '+Wd[top]+' in '+n+' tehsil'+(n===1?'':'s'):''; e2.textContent=t; e2.hidden=!t; };
        var j0=served(hz); if(j0!==undefined) paint(j0); }catch(_){} }
    document.addEventListener('agn:hazard',function(){ setTimeout(peakLine,150); });
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
