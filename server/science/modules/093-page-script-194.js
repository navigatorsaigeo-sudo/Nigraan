


(function(G){'use strict';
  var D=G.document, AGN=G.AGN=G.AGN||{};
  var cache=Object.create(null), inflight=Object.create(null), TTL=20*60e3;
  function local(){ try{ return /^https?:$/.test(location.protocol); }catch(_){ return false; } }
  function key(la,lo){ return (+la).toFixed(3)+','+(+lo).toFixed(3); }
  function rec(la,lo){ var k=key(la,lo), r=cache[k]; return (r&&Date.now()-r.at<TTL)?r.data:null; }
  function prime(la,lo,elev){
    if(!local()||!Number.isFinite(Number(la))||!Number.isFinite(Number(lo))) return null;
    var k=key(la,lo); var r=cache[k]; if(r&&Date.now()-r.at<TTL) return r.data; if(inflight[k]) return null;
    var u='/api/pool/hazard?lat='+encodeURIComponent(la)+'&lon='+encodeURIComponent(lo)+(Number.isFinite(Number(elev))?'&elev='+encodeURIComponent(elev):'');
    inflight[k]=fetch(u,{cache:'no-store'}).then(function(x){ return x.ok?x.json():null; }).then(function(j){
      delete inflight[k]; if(j&&Array.isArray(j.hourly)){ cache[k]={at:Date.now(),data:j}; try{ D.dispatchEvent(new CustomEvent('agn:prob',{detail:{key:k,lat:la,lon:lo}})); }catch(_){} } return j; })
      .catch(function(){ delete inflight[k]; return null; });
    return null;
  }
   
  function utcKey(localIso, offsetSec){
    var m=String(localIso||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/); if(!m) return null;
    var t=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4])-(Number(offsetSec)||0)*1000; return new Date(t).toISOString().slice(0,13);
  }
  

  function hourRec(la,lo,localIso,offsetSec){
    var r=rec(la,lo); if(!r) return null; var k=utcKey(localIso,offsetSec); if(!k) return null;
    for(var i=0;i<r.hourly.length;i++){ if(String(r.hourly[i].t).slice(0,13)===k) return r.hourly[i]; }
    return null;
  }
  function pWet(la,lo,localIso,offsetSec){
    var h=hourRec(la,lo,localIso,offsetSec); if(!h||h.pRain==null) return null;
    return Math.round(100*Number(h.pRain));
  }
  function pTrace(la,lo,localIso,offsetSec){ var h=hourRec(la,lo,localIso,offsetSec); return (h&&h.pWet!=null)?Math.round(100*Number(h.pWet)):null; }
  

  function iconHint(la,lo,localIso,offsetSec){
    var r=rec(la,lo), h=hourRec(la,lo,localIso,offsetSec); if(!r||!h||h.pRain==null||!r.rainCalibration||!r.rainCalibration.ok) return null;
    var tau=Number(r.rainCalibration.tauMm); if(!(tau>0)) return null;
    if(h.p50>=tau||h.pRain>=0.5) return 'rain'; if(h.pRain<0.15&&h.p50<tau) return 'dry'; return null;
  }
  function calibration(la,lo){ var r=rec(la,lo); return r?(r.rainCalibration||null):null; }
  

  function pExceed(la,lo,leadDays,mm){
    var r=rec(la,lo); if(!r||!r.days) return null; var d=r.days.find(function(x){ return x.leadDays===leadDays; }); if(!d||!d.ex) return null;
    var th=[1,5,10,25,50,100].filter(function(t){ return d.ex[t]!=null; }); if(!th.length) return null;
    if(mm<=th[0]) return d.ex[th[0]]; if(mm>=th[th.length-1]) return d.ex[th[th.length-1]];
    for(var i=0;i<th.length-1;i++){ var a=th[i], b=th[i+1]; if(mm>=a&&mm<=b){ var f=(Math.log(mm)-Math.log(a))/(Math.log(b)-Math.log(a)); return Math.round(1000*(d.ex[a]+f*(d.ex[b]-d.ex[a])))/1000; } }
    return null;
  }
   
  function verdict(la,lo,leadDays,mm){
    var r=rec(la,lo); if(!r||!r.days||!(mm>0)) return null; var d=r.days.find(function(x){ return x.leadDays===leadDays; }); if(!d) return null;
    var p=pExceed(la,lo,leadDays,mm); if(p==null) return null; var det=d.detServed;
    var text=(det!=null&&det>=mm&&p<0.15)?'single run, ensembles disagree':(det!=null&&det<mm&&p>=0.4)?'ensemble watch':(det!=null&&det>=mm)?'ensembles support the trigger':'below the trigger on both';
    return { probability:p, pct:Math.round(100*p), detServedMm:det, triggerMm:mm, date:d.date, agreement:text, systems:d.systems||null };
  }
   
  function dissent(s, r){
    try{
      if(!r||!Array.isArray(r.temperature)||!s||!Array.isArray(s.time)||!Array.isArray(s.temp)) return null;
      var band={}; r.temperature.forEach(function(x){ if(x&&x.t&&x.p10!=null&&x.p90!=null) band[String(x.t).slice(0,13)]={lo:x.p10,hi:x.p90,p50:x.p50}; });
      var nowK=new Date().toISOString().slice(0,13); var n=0, out=0, maxd=0; var _nm=(r.poolModelCount>0)?(r.poolModelCount+'-model'):'nine-model';
      for(var i=0;i<s.time.length&&n<24;i++){ var k=utcKey(s.time[i], s.off); if(!k||k<nowK) continue; var b=band[k]; var t=Number(s.temp[i]); if(!b||!Number.isFinite(t)) continue; n++; var _d=t<b.lo?b.lo-t:(t>b.hi?t-b.hi:0); if(_d>1.0){ out++; maxd=Math.max(maxd,_d); } }    
      if(!n) return null;
      return { hours:n, outside:out, maxOutsideC:Math.round(maxd*10)/10, dissent: out>=6, text: out>=6 ? 'DISSENT: the served forecast sits more than 1 \u00b0C outside the '+_nm+' P10\u2013P90 band for '+out+' of the next '+n+' h (up to '+(Math.round(maxd*10)/10)+' \u00b0C beyond it) \u2014 read the consensus row on Outlook before acting' : 'served forecast within 1 \u00b0C of the '+_nm+' band for '+(n-out)+' of '+n+' h' };
    }catch(_){ return null; }
  }
  

  

  function dayChance(la,lo,leadDays){
    try{ var RC=G.agnRainChance; if(RC&&RC.ready&&RC.ready()){ var k=RC.keyAt(la,lo), row=k?RC.forKey(k,leadDays||0):null;
        if(row&&row.p&&row.p['1']!=null&&isFinite(+row.p['1'])) return { pct:Math.round(+row.p['1']), tauMm:1, group:null, label:'chance of rain', source:'calibrated',
          reference:'calibrated chance of at least 1 mm in the day (satellite day total over ~10 km), held-out tested', thresholdMm:1, partial:!!row.partial }; } }catch(_){}
    var e=dayChanceEns(la,lo,leadDays); if(e) e.source='ensemble'; return e;
  }
  function dayChanceEns(la,lo,leadDays){
    var r=rec(la,lo); if(!r||!r.days) return null; var d=r.days.find(function(x){ return x.leadDays===leadDays; });
    var cal=r.rainCalibration; if(!d||d.pRainDay==null||!cal||!cal.ok||!cal.day||!(cal.day.tauMm>0)) return null;
    return { pct:Math.round(100*Number(d.pRainDay)), tauMm:cal.day.tauMm, group:cal.group, label:'chance of rain', reference:cal.reference||null, wetDayShare:(cal.day.imergWetDayShare!=null?cal.day.imergWetDayShare:cal.day.gaugeWetDayShare), podAtTau:cal.day.podAtTau, farAtTau:cal.day.farAtTau, date:d.date };
  }
  function status(la,lo){ var r=rec(la,lo); return r?{ready:true,at:r.at,hours:r.hourly.length,days:r.days.length,errors:r.ensembleErrors||[]}:{ready:false}; }
  AGN.prob={ prime:prime, rec:rec, dayChance:dayChance, pWet:pWet, pTrace:pTrace, iconHint:iconHint, calibration:calibration, hourRec:hourRec, pExceed:pExceed, verdict:verdict, status:status, utcKey:utcKey, dissent:function(){ var s=G.__AGN_PROB_STRIP||{}; return (s.lat!=null)?dissent(s, rec(s.lat,s.lon)):null; } };

   
  function note(){
    try{
      var hs=D.getElementById('hscroll'); if(!hs) return; var n=D.getElementById('agnProbNote');
      if(!n){ n=D.createElement('div'); n.id='agnProbNote'; n.style.cssText='font-size:11px;color:#5b6b7a;margin:6px 4px 0;'; hs.parentNode.appendChild(n); }
      var s=G.__AGN_PROB_STRIP||{}; var r=(s.lat!=null)?rec(s.lat,s.lon):null;
      var c=r&&r.rainCalibration;
      

      var _ai=!!(r&&r.aiModels&&r.aiModels.inPool); var txt = (r&&c&&c.ok) ? 'Chance of rain: share of '+(_ai?'global ensemble and AI weather model members (equal system weight)':'global ensemble members')+' whose grid rain in the hour is above '+c.tauMm+' mm, the amount matched to how often the satellite rainfall record shows rain around places like this one ('+String(c.group||'').split(' (')[0]+'). It is the chance of rain in the area around the point, not a rain-gauge reading.'
                : (r ? 'Chance of rain: share of '+(_ai?'global ensemble and AI weather model members':'global ensemble members')+' with rain in the hour'
                : 'Chance of rain: the forecast provider\u2019s probability field');
       
      var dz=dissent(s, r); if(dz){ txt+=' \u00b7 '+dz.text; }
      n.textContent = txt;
    }catch(_){}
  }
  D.addEventListener('agn:prob', note);
  D.addEventListener('DOMContentLoaded', function(){ setTimeout(note, 4000); });
})(window);
