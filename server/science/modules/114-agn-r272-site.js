
/* v91.17.283.29 · W2 · SITE LEVEL = THE SERVER'S siteLevels PART. The place bundle (GET /api/point) carries part siteLevels: every hazard
   scored by the server at the site's own coordinate and height for days 0-3 (placerecord.mjs: heat by the area-heat rule on the site's UTCI,
   cold and wind by the engine's hzCold / hzWind, heavy rain by method d at the site, flood by the river-status rule; landslide and drought
   carry the tehsil value, labelled). This script only reshapes that part for the rows that list it (siteJoin, the site panel, the drawn site);
   it scores nothing. A hazard with no point method (surface-water flooding, GLOF) is "not scored at the site" with that reason, and the
   tehsil's issued level stays the area level beside it.
   AGN.siteScore.get(lat,lon) -> Promise of {ok, point, uid, tehsil, days, hz:[{key, basis, peak:{i,score,date,day,driver}|null, row, why}]};
   peek(lat,lon) -> the same when the bundle is held, undefined while it is read. */
(function(G){
  'use strict';
  var AGN=G.AGN=G.AGN||{};
  var KEYS=['heat','cold','rain_hz','flood','flood_pluvial','wind','landslide','glof','drought'], SRV={rain_hz:'rain'};
  var NOPT={flood_pluvial:'not scored at the site: surface-water flooding has no point method on the server; the tehsil\u2019s issued level is the area level',
            glof:'not scored at the site: a glacial lake outburst flood has no point method on the server; the tehsil\u2019s issued level is the area level'};
  function fin(x){ return x!=null&&x!==''&&isFinite(Number(x)); }
  function conv(v,B){ if(!v||v.unavailable||v.ok===false||!v.hazards) return {ok:false, why:(v&&v.why)||'the levels at the site are not available'};
    var H0=v.hazards.heat, days=((H0&&H0.days)||[]).map(function(d){ return d.date; }), pl=(B&&B.place)||{};
    var hz=KEYS.map(function(k){ var H=v.hazards[SRV[k]||k]; if(!H) return {key:k, peak:null, row:[], why:NOPT[k]||'not scored at the site'};
      var teh=/tehsil/.test(String(H.scope||'')), row=(H.days||[]).map(function(d){ var sk=d.skill||{}, ls=d.lowSkill?'low-skill warning'+(fin(sk.pod)?' (hit rate '+Math.round(sk.pod*100)+' %, false alarms '+Math.round(sk.far*100)+' %)':'')+(d.fromPreviousRun?', from the previous run':''):null;   /* v91.17.283.31 · a zone-cell rain level carries its tested skill */
        return {i:d.assessed&&fin(d.level)?+d.level:null, date:d.date, day:d.lead, score:fin(d.score)?+d.score:null, why:(d.state==='not_tested'?'model not yet tested here'+(d.why?': '+d.why:''):(d.why||null)), basis:[d.basis||null,ls].filter(Boolean).join(' · ')||null, lowSkill:!!d.lowSkill, skill:d.skill||null}; });
      var pk=null; if(H.peak&&fin(H.peak.level)){ var pd=row.filter(function(r){ return r.date===H.peak.date; })[0]||{}; pk={i:+H.peak.level, score:pd.score, date:H.peak.date, day:fin(H.peak.lead)?+H.peak.lead:pd.day, driver:pd.basis||null}; }
      var nd=row.filter(function(r){ return r.i==null&&r.why; })[0];
      return {key:k, basis:(teh?'tehsil value: ':'')+(H.method||''), peak:pk, row:row, why:pk?null:(nd?nd.why:'not assessed'), notApplicable:false, tehsilValue:teh}; });
    return {ok:true, point:true, server:true, uid:pl.unitId||null, tehsil:pl.tehsil||null, days:days, hz:hz, version:v.version||null, at:v.at||null}; }
  var HELD={};
  function k(lat,lon){ return (+lat).toFixed(5)+','+(+lon).toFixed(5); }
  function peek(lat,lon){ if(!fin(lat)||!fin(lon)) return {ok:false, why:'the site has no coordinates'}; var h=HELD[k(lat,lon)]; if(h) return h;
    var PS=AGN.pointState, B=PS&&PS.peek?PS.peek(+lat,+lon):null, x=B&&B.parts&&B.parts.siteLevels; if(!x||x.pending) return undefined;
    return (HELD[k(lat,lon)]=conv(x.unavailable?{unavailable:true,why:x.why}:x.v,B)); }
  function get(lat,lon){ if(!fin(lat)||!fin(lon)) return Promise.resolve({ok:false, why:'the site has no coordinates'}); var h=peek(lat,lon); if(h) return Promise.resolve(h);
    var PS=AGN.pointState; if(!PS||!PS.part) return Promise.resolve({ok:false, why:'the place record is not loaded'});
    return PS.part('siteLevels',+lat,+lon).then(function(v){ var B=PS.peek?PS.peek(+lat,+lon):null, o=conv(v,B); HELD[k(lat,lon)]=o; try{ document.dispatchEvent(new CustomEvent('agn:site-score',{detail:{lat:+lat,lon:+lon}})); }catch(_){} return o; },
      function(){ return {ok:false, why:'the levels at the site did not arrive'}; }); }
  AGN.siteScore={get:get, peek:peek, keys:KEYS.slice(), server:true};
  document.addEventListener('agn:data',function(){ HELD={}; });   /* a new bundle (hourly stamp) is read again */
  /* v91.17.283.29 · W3 · the place record's rows (part placeRecord: seismic code class, rain return levels, river status, station counts,
     accuracy), printed the same way by Client Risk and the reports; rows(lat,lon) -> [[item, value, basis]] or null while it is read */
  function rec(lat,lon){ var PS=AGN.pointState, B=PS&&PS.peek?PS.peek(+lat,+lon):null, x=B&&B.parts&&B.parts.placeRecord; if(!B||!x||x.pending) return undefined; return x.unavailable?{ok:false,why:x.why}:x.v; }
  function dn(d){ var t=new Date(String(d).slice(0,10)+'T00:00:00Z'); return isNaN(t)?String(d):['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.getUTCDay()]+' '+t.getUTCDate(); }
  /* the basis column is read by people: a source file or code path in the server's basis text (scripts/agents/verify.mjs, data/x.json) is left out */
  function plain(s){ return String(s==null?'':s).replace(/\s*\((?:[\w.-]+\/)*[\w.-]+\.(?:mjs|js|py|json|csv|parquet)\)/g,'').replace(/(?:[\w.-]+\/)+[\w.-]+\.(?:mjs|js|py|json|csv|parquet)\b/g,'').replace(/\b[\w-]+\.(?:mjs|js|py|json|csv|parquet)\b/g,'').replace(/(\d)\((\w*)\)/g,'$1 ($2)').replace(/\s{2,}/g,' ').replace(/\s+([;,.)])/g,'$1').trim(); }
  function rows(pr){ var R0=rows0(pr); return R0.map(function(r){ return [r[0],plain(r[1]),plain(r[2])]; }); }
  function rows0(pr){ if(!pr||pr.ok===false) return [['Place record','not available'+(pr&&pr.why?': '+pr.why:''),'']]; var R=[], S=pr.seismic, RR=pr.rainReturn, RV=pr.river, ST=pr.stations, AC=pr.accuracy;
    /* v91.17.283.31 · 7 · a failed model check withholds the record (complete:false): said first */
    if(pr.modelCheck&&pr.modelCheck.passed===false) R.push(['Model check','failed: '+(pr.modelCheck.why||'the model gate did not pass')+' · the levels of this place are withheld','']);
    if(S) R.push(S.assessed&&S.bcp2021?['Seismic design category (code class, not a forecast)',S.bcp2021.label+': '+S.bcp2021.codeClass+(S.bcp2021.siteClassAssumed?' (site class '+S.bcp2021.siteClass+' assumed)':'')+(S.bcp2007&&S.bcp2007.codeClass?' · '+S.bcp2007.label+': '+S.bcp2007.codeClass:''),S.bcp2021.source||'']:['Seismic design category','not assessed'+(S.why?': '+S.why:''),'']);
    if(RR){ if(RR.ready&&RR.durations&&RR.durations['24h']){ var D=RR.durations['24h'], V=D.pointRl||D.areaRl, T=RR.returnPeriods||[]; R.push(['24-hour rain return levels ('+(D.pointRl?'point':'area')+')',[2,10,100].filter(function(y){ return T.indexOf(y)>=0; }).map(function(y){ return y+'-year '+V[T.indexOf(y)]+' mm'; }).join(' · '),(D.scale||'')+(D.years?' · '+D.years+' years of record':'')]); }
      else R.push(['Rain return levels','not assessed'+(RR.why?': '+RR.why:''),'']); }
    /* v91.17.283.31 · 7 / 11 · the measured river sheet (observed today, carried for days 1-3): status and measured flow, never a modelled flow */
    if(RV&&(RV.measured||[]).length){ var M0=RV.measured[0]; R.push(['River measured (nearest gauge)',(M0.station||'')+(M0.river?' ('+M0.river+')':'')+': '+(M0.status||M0.word||'')+(M0.flowCusec!=null?' · '+Math.round(M0.flowCusec).toLocaleString('en-US')+' cusec measured':'')+(M0.date?' on '+M0.date:''),'river gauge sheet (observed); days 1-3 carry the status forward']); }
    if(RV){ var ad=(RV.days||[]).filter(function(d){ return d.assessed; }), d0=(RV.days||[])[0]; R.push(['River status',RV.assessed&&ad.length?ad.slice(0,4).map(function(d){ return dn(d.date)+': '+(d.word||''); }).join(' · '):(function(w){ w=String(w).replace(/^not assessed:\s*/,''); return /^cannot happen here/.test(w)?w:'not assessed: '+w; })(RV.why||(d0&&d0.why)||(RV.noGaugedReach?'no gauged reach':'no river status')),(RV.reaches||[]).map(function(x){ return x.river+' ('+x.insideKm+' km)'; }).join(', ')+(RV.floodplainShare!=null&&isFinite(RV.floodplainShare)?((RV.reaches||[]).length?'; ':'')+Math.round(RV.floodplainShare*100)+' % of the tehsil on the floodplain (a fact, not part of the level)':'')]); }   /* v283.35 · A1/A2 */
    if(ST){ var N=ST.near||{}, F=ST.fleet||{}; R.push(['AGN stations',ST.ready===false&&!F.reportingNow?'not yet checked: '+(F.notYetChecked||0)+' of '+(F.total||0)+' stations':(N.reportingNow||0)+' reporting now within '+(N.km||'–')+' km · '+(F.reportingNow||0)+' of '+(F.total||0)+' across the network',ST.rule||'']); }
    if(AC) R.push(['Forecast accuracy',AC.text||(AC.headline&&(AC.headline.maeC!=null?AC.headline.maeC+' °C':AC.headline.why))||'not measured',AC.basis||'']);
    /* v91.17.283.31 · 7 · accuracy per lead day: a figure only where the lead has enough scored days; otherwise "not measured" or "not enough days" */
    if(AC&&AC.byLead){ var BL=AC.byLead.TX||AC.byLead.T||[]; if(BL.length) R.push(['Forecast accuracy by lead day (max temperature)',BL.map(function(x){ var l='day '+x.lead+': ';
        if(x.maeC!=null&&!x.notMeasured&&!x.notEnoughDays) return l+x.maeC+' °C'+(x.scoredDays!=null?' ('+x.scoredDays+' days)':'');
        if(x.notEnoughDays) return l+'not enough days yet'+(x.scoredDays!=null?' ('+x.scoredDays+' scored)':'');
        return l+'not measured'; }).join(' · '),'a figure is shown only for a lead day with enough scored days']); }
    return R; }
  AGN.placeRecord={ at:rec, rows:function(lat,lon){ var r=rec(lat,lon); return r===undefined?null:rows(r); }, rowsOf:rows };
})(window);
