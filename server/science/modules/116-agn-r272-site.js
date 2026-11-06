
/* v91.17.272 · SITE LEVEL (owner, 16 Oct): a site is scored at its own location again, with the tehsil level (the hazard engine, the
   map) beside it as the area level. No new science and no typed threshold: the page's own scoring code (hzDayInput -> hzScore, the
   code the v269 site screening and the map use) is run on the site's own hourly forecast, which is the point forecast at the site's
   coordinate and terrain height (/api/point/forecast, the Forecast tab's series: temperature, feels-like, humidity, wind, gust, rain)
   laid over the tehsil's 72-hour series hour by hour (variables the point forecast does not carry, e.g. soil moisture and snow, stay
   the tehsil's). The 0-100 screening index becomes a level through the one customer scale (AGN.level.index, data/hazard-scale.json).
   Hazards with no day series (drought, GLOF and others hzDayCapable refuses) are scored on the tehsil inputs and say so.
   AGN.siteScore.get(lat,lon) -> Promise of the result; peek(lat,lon) -> result or undefined; 'agn:site-score' fires when one lands. */
(function(G){
  'use strict';
  var D=G.document, AGN=G.AGN=G.AGN||{};
  var KEYS=['heat','cold','rain_hz','flood','flood_pluvial','wind','landslide','glof','drought'];   /* v91.17.283.12: flood = river flood (flood_riverine); flood_pluvial = flooding from local rain, its own row */
  var SCORE_AS={flood:'flood_riverine'};
  var C={}, TTL=10*60e3, NDAYS=4;
  function ck(lat,lon){ return (+lat).toFixed(4)+','+(+lon).toFixed(4); }
  function fin(x){ return x!=null&&x!==''&&isFinite(Number(x)); }
  function fire(k){ try{ D.dispatchEvent(new CustomEvent('agn:site-score',{detail:{key:k}})); }catch(_){} }
  /* the site's hourly series: the tehsil's 72-hour series with the point forecast's hours written over it (same clock hour) */
  function siteSeries(fc,P){
    if(!P||!Array.isArray(P.hours)||!P.hours.length) return null;
    /* no tehsil series held (its forecast did not arrive): the site's own hours alone; soil moisture and snow are then not held */
    if(!fc||!Array.isArray(fc.time)) fc={time:P.hours.map(function(h){ return String(h.time).slice(0,16); }), nowIdx:0};
    var at={}; fc.time.forEach(function(t,i){ at[String(t).slice(0,13)]=i; });
    var o=Object.assign({},fc), n=0;
    ['temp','feels','hum','wind','gust','rain'].forEach(function(v){ o[v]=Array.isArray(fc[v])?fc[v].slice():fc.time.map(function(){ return null; }); });
    P.hours.forEach(function(h){ var i=at[String(h&&h.time||'').slice(0,13)]; if(i==null) return; var w=false;
      if(fin(h.tempC)){ o.temp[i]=+h.tempC; w=true; } if(fin(h.feelsC)) o.feels[i]=+h.feelsC; if(fin(h.rh)) o.hum[i]=+h.rh;
      if(fin(h.windKmh)) o.wind[i]=+h.windKmh; if(fin(h.gustKmh)) o.gust[i]=+h.gustKmh; if(fin(h.rainMm)) o.rain[i]=+h.rainMm; if(w) n++; });
    return n?{fc:o,hours:n}:null; }
  function levelOf(score){ try{ return (fin(score)&&AGN.level&&AGN.level.index)?AGN.level.index(Number(score)):null; }catch(_){ return null; } }
  function one(key,base,hz,day){
    var capable=false; try{ capable=typeof G.hzDayCapable==='function'&&G.hzDayCapable(hz); }catch(_){}
    var inp=base;
    if(capable){ try{ inp=G.hzDayInput(key,hz,base,day); }catch(_){ inp=null; } if(!inp||inp.__unavailable) return {i:null,score:null,why:'no forecast hours for this day',capable:true}; }
    /* v91.17.278 · FIX278 3: the scorer reads the calibrated rain chance for the dashboard's day (AGN.day.get), so every site day took
       today's rain level; the day is set for the call, as the engine does (agn-engine derive) */
    var r=null, D0=G.AGN&&G.AGN.day, rg=D0&&D0.get; try{ if(rg&&day!=null) D0.get=function(){ return day; }; r=typeof G.hzScore==='function'?G.hzScore(key,inp,hz,24,key):null; }catch(e){ r=null; } finally{ if(rg) D0.get=rg; }
    if(!r) return {i:null,score:null,why:'the scoring code did not answer',capable:capable};
    var raw=(r.screeningIndex!=null)?r.screeningIndex:r.score;
    if(r.categorical||!fin(raw)) return {i:null,score:null,why:r.noDataClassLabel||r.top||'not scored',na:r.noDataClass==='ineligible',capable:capable};
    var sc=Math.max(0,Math.min(100,Math.round(+raw)));
    return {i:levelOf(sc),score:sc,driver:r.top||null,phys:(fin(r.physicalValue)&&r.physicalMeasurand)?{m:String(r.physicalMeasurand),v:Math.round(r.physicalValue*10)/10,u:r.physicalUnit||''}:null,capable:capable}; }
  function compute(lat,lon,P){
    var su=null; try{ su=AGN.siteUnit?AGN.siteUnit(+lat,+lon):null; }catch(_){ su=null; }
    if(!su||!su.key) return {ok:false,why:'the site lies in no tehsil NIGRAAN scores'};
    var DI=G.DISTRICT_IN||{}, base0=DI[su.key];
    if(!base0) return {ok:false,why:'the tehsil '+(su.tehsil||su.key)+' holds no inputs in this build',uid:su.uid,key:su.key,tehsil:su.tehsil};
    var S=siteSeries(base0.fc72,P), base=S?Object.assign({},base0,{fc72:S.fc,fcSource:'site_point_forecast',fcLabel:'the forecast at the site (point engine, hourly)'}):base0;
    var dates=[], t0=Date.now()+5*3600e3;
    for(var d=0;d<NDAYS;d++) dates.push(new Date(t0+d*864e5).toISOString().slice(0,10));
    var hz=KEYS.map(function(k){ var sk=SCORE_AS[k]||k, first=one(su.key,base,sk,0), row=[];
      if(first.capable){ row.push(Object.assign({date:dates[0],day:0},first)); for(var d2=1;d2<NDAYS;d2++) row.push(Object.assign({date:dates[d2],day:d2},one(su.key,base,sk,d2))); }
      else row=dates.map(function(dt,d3){ return Object.assign({date:dt,day:d3},first); });
      row=row.filter(function(c,ix){ return ix===0||c.i!=null||c.capable===false; });
      var held=row.filter(function(c){ return c.i!=null; }), pk=held.length?held.reduce(function(a,b){ return b.i>a.i||(b.i===a.i&&b.score>a.score)?b:a; }):null;
      return {key:k,row:row,peak:pk,notApplicable:!held.length&&row.some(function(c){ return c.na; }),why:held.length?null:(row[0]&&row[0].why)||'not scored',
        basis:k==='rain_hz'?'the calibrated rain chance, issued by tehsil':(first.capable?(S?'the forecast at the site':'the tehsil forecast (the forecast at the site did not answer)'):'the tehsil inputs (no day-by-day series for this hazard)')}; });
    return {ok:true,at:Date.now(),lat:+lat,lon:+lon,uid:su.uid,key:su.key,tehsil:su.tehsil,district:su.district,province:su.province,
      pointHours:S?S.hours:0,point:!!S,elevM:P&&P.elevM!=null?P.elevM:null,days:dates,hz:hz}; }
  function get(lat,lon){
    if(!fin(lat)||!fin(lon)) return Promise.resolve({ok:false,why:'the site has no coordinates'});
    var k=ck(lat,lon), c=C[k]; if(c&&c.p&&Date.now()-c.at<TTL) return c.p;
    var p=(AGN.nowAt&&AGN.nowAt.get?Promise.resolve(AGN.nowAt.get(+lat,+lon)).catch(function(){ return null; }):Promise.resolve(null))
      .then(function(){ var v=null; try{ v=AGN.nowAt.peek(+lat,+lon); }catch(_){}
        var r=null; try{ r=compute(lat,lon,v&&v.hours?{hours:v.hours,elevM:(v.point&&v.point.elevM)}:null); }catch(e){ r={ok:false,why:'the site could not be scored ('+String(e&&e.message||e).slice(0,80)+')'}; }
        C[k]={at:Date.now(),p:p,v:r}; fire(k); return r; });
    C[k]={at:Date.now(),p:p,v:c?c.v:undefined}; return p; }
  function peek(lat,lon){ if(!fin(lat)||!fin(lon)) return undefined; var c=C[ck(lat,lon)]; if(c&&Date.now()-c.at>TTL&&c.v!==undefined) get(lat,lon); return c?c.v:undefined; }
  AGN.siteScore={get:get, peek:peek, keys:KEYS.slice()};
})(window);
