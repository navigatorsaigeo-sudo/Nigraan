


(function(){
  'use strict';
  var $=function(id){return document.getElementById(id);};
  

  var MODELS=FR('cmip6.models');
  var BASE=FR('cmip6.baseline');
  var WINDOWS=FR('cmip6.windows');
  var COVERAGE_END=FR('cmip6.coverageEnd');
  var TRANSIENT=FR('cmip6.transient');
  var MIN_MODELS=FR('cmip6.minModels');

  

  function station(){
    try{
      

      try{ var _s=AGN.subject&&AGN.subject.get(); if(_s&&_s.asset_lat!=null&&_s.asset_lon!=null&&Number.isFinite(+_s.asset_lat)&&Number.isFinite(+_s.asset_lon)) return {id:'asset:'+(_s.asset_id||''), name:_s.asset_name||'active asset', lat:+_s.asset_lat, lon:+_s.asset_lon}; }catch(_){}
      try{ var _ap=AGN.dataServices&&AGN.dataServices.require('domain').activePoint(); if(_ap&&_ap.lat!=null&&_ap.lon!=null&&Number.isFinite(+_ap.lat)&&Number.isFinite(+_ap.lon)) return {id:_ap.id||'__live', name:_ap.name||'selected place', lat:+_ap.lat, lon:+_ap.lon}; }catch(_){}
      var el=$('asmtLocation'), list=window.STATIONS||[];
      if(el && el.value){ var hit=list.filter(function(s){return s.id===el.value;})[0]; if(hit) return hit; }
      return null;
    }catch(_){ return null; }
  }
  function horizon(){ var el=$('asmtEngHorizon'); return el?el.value:'2050'; }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }

  

  function fetchModel(lat,lon,model,s,e,depth){
    depth=depth||0;
    /* v91.17.283.15 · the server's CMIP6 record of the place (GET /api/pointstate/product name=cmip6) */
    return AGN.api.product('cmip6',{latitude:lat, longitude:lon, start_date:s, end_date:e, models:model, daily:'temperature_2m_max,precipitation_sum', timezone:'Asia/Karachi'}).then(function(r){
      

      if(TRANSIENT.codes.indexOf(r.status)>=0){
        if(depth>=TRANSIENT.delaysMs.length) throw new Error('HTTP '+r.status+' after '+depth+' retries');
        return sleep(TRANSIENT.delaysMs[depth]).then(function(){
          return fetchModel(lat,lon,model,s,e,depth+1);
        });
      }
      if(r.status===400){
        var _err=new Error('HTTP 400'); _err.outOfCoverage=true; throw _err;
      }
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json().then(function(j){
        var d=j.daily||{};
        var t=d['temperature_2m_max_'+model]||d.temperature_2m_max||[];
        var p=d['precipitation_sum_'+model]||d.precipitation_sum||[];
        return { t:t.filter(function(x){return x!=null;}), p:p.filter(function(x){return x!=null;}) };
      });
    });
  }

  var CMIP6_RUN_SEQ=0;
  function reduce(r){
    var tempYears=Math.max(1,r.t.length/365.25);
    var precipYears=Math.max(1,r.p.length/365.25);
    var sum=function(a){ return a.reduce(function(x,y){return x+y;},0); };
    return { tmax: r.t.length? sum(r.t)/r.t.length : null,
             pyr:  r.p.length? sum(r.p)/precipYears : null,
             tempYears:tempYears, precipYears:precipYears };
  }

  function run(o){
    o=o||{}; var runId=++CMIP6_RUN_SEQ, st=station(), status=o.status, rows=o.rows;
    var h=o.horizon||horizon();
    if(!status||!rows) return Promise.resolve(false);
    if(!st){ status.textContent='No assessment location selected.'; return Promise.resolve(false); }
    if(!WINDOWS[h]){
      

      var _have=Object.keys(WINDOWS).map(function(k){ return k+'s'; }).join(' or ');
      status.textContent = (h==='present')
        ? 'Present has no delta to report — choose ' + _have + ' in Engineering Conditions.'
        : ('This dataset does not reach the ' + h + 's. HighResMIP future runs end on '
           + COVERAGE_END + ', so ' + _have + ' are the horizons it can answer for. The bounded '
           + 'planning stress test above still covers the ' + h + 's; CMIP6 model output does not.');
      return Promise.resolve(false);
    }
    var w=WINDOWS[h], base=[], fut=[], used=[], failed=[];
    var chain=Promise.resolve();
    MODELS.forEach(function(m,k){
      chain=chain.then(function(){
        if(runId!==CMIP6_RUN_SEQ) return;
        status.textContent='Querying '+m.replace(/_/g,'-')+' ('+(k+1)+' of '+MODELS.length+') at '+st.name+'…';
        return fetchModel(st.lat,st.lon,m,BASE[0],BASE[1]).then(function(b){
          if(runId!==CMIP6_RUN_SEQ) return null;
          return sleep(220).then(function(){
            if(runId!==CMIP6_RUN_SEQ) return null;
            return fetchModel(st.lat,st.lon,m,w[0],w[1]).then(function(f){
              if(runId!==CMIP6_RUN_SEQ) return null;
              

              base.push(reduce(b)); fut.push(reduce(f)); used.push(m);
              return sleep(220);
            });
          });
        }).catch(function(_e){ if(runId===CMIP6_RUN_SEQ) failed.push({model:m, outOfCoverage:!!(_e&&_e.outOfCoverage), why:(_e&&_e.message)||'failed'}); });
      });
    });

    return chain.then(function(){
      if(runId!==CMIP6_RUN_SEQ) return false;
      

      if(base.length<MIN_MODELS){
        var _cov=failed.filter(function(x){ return x && x.outOfCoverage; }).length;
        if(_cov){
          status.textContent='The '+w[0].slice(0,4)+'-'+w[1].slice(0,4)+' window is outside this '
            +'dataset — HighResMIP future runs end on '+COVERAGE_END+'. Nothing was loaded, and '
            +'this is a property of the data rather than an outage.';
        } else if(!base.length){
          status.textContent='The climate endpoint did not answer for any of the '+MODELS.length
            +' models after retries. This is usually transient — the same request often succeeds a '
            +'few seconds later. Try again shortly.';
        } else {
          status.textContent='Only '+base.length+' model'+(base.length===1?'':'s')+' answered, below '
            +'the '+MIN_MODELS+' needed for a spread. A mean of one model is not a multi-model '
            +'delta, so nothing is published. Try again shortly.';
        }
        return;
      }
      var mean=function(a){ return a.reduce(function(x,y){return x+y;},0)/a.length; };
      var bT=[],fT=[],bP=[],fP=[],nT=[],nP=[];
      for(var i=0;i<base.length;i++){
        

        if(Number.isFinite(base[i].tmax)&&Number.isFinite(fut[i].tmax)){ bT.push(base[i].tmax); fT.push(fut[i].tmax); nT.push(used[i]); }
        if(isFinite(base[i].pyr)&&isFinite(fut[i].pyr)&&base[i].pyr>0){ bP.push(base[i].pyr); fP.push(fut[i].pyr); nP.push(used[i]); }
      }
      var dT=fT.map(function(v,i){ return v-bT[i]; });
      var dP=fP.map(function(v,i){ return 100*(v-bP[i])/bP[i]; });
      var f1=function(v){ return (v>=0?'+':'')+v.toFixed(1); };
      var f0=function(v){ return (v>=0?'+':'')+Math.round(v); };
      var out='';
      if(dT.length){
        out+='<tr><td><b>Daily max temperature</b></td><td>'+mean(bT).toFixed(1)+' &deg;C</td><td>'
            +mean(fT).toFixed(1)+' &deg;C</td><td><b>'+f1(mean(dT))+' &deg;C</b></td><td>'
            +f1(Math.min.apply(null,dT))+' to '+f1(Math.max.apply(null,dT))+' &deg;C</td></tr>';
      }
      if(dP.length){
        out+='<tr><td><b>Annual precipitation</b></td><td>'+Math.round(mean(bP))+' mm</td><td>'
            +Math.round(mean(fP))+' mm</td><td><b>'+f0(mean(dP))+' %</b></td><td>'
            +f0(Math.min.apply(null,dP))+' to '+f0(Math.max.apply(null,dP))+' %</td></tr>';
      }
      var record={calculation_id:'AGN-CMIP6-'+Date.now(),created_at:new Date().toISOString(),location:{id:st.id||null,name:st.name,latitude:st.lat,longitude:st.lon},horizon:h,baseline:'1991-2010',future_window:{start:w[0],end:w[1]},scenario:'high-emission trajectory',models_requested:MODELS.slice(),models_temperature:dT.length,models_precipitation:dP.length,temperature_delta_c:dT.length?{mean:mean(dT),min:Math.min.apply(null,dT),max:Math.max.apply(null,dT)}:null,precipitation_delta_percent:dP.length?{mean:mean(dP),min:Math.min.apply(null,dP),max:Math.max.apply(null,dP)}:null,

        bias_corrected:true,
        bias_correction_reference:'land reanalysis',
        bias_correction_method:'linear_monthly',
        bias_correction_provider_default:true,applied_to_hazard_scores:false,applied_to_engineering_scores:false,
        

        per_model:{ temperature_delta_c: nT.map(function(m,i){ return {model:m, delta:dT[i]}; }),
                    precipitation_delta_percent: nP.map(function(m,i){ return {model:m, delta:dP[i]}; }) },
        models_unavailable: failed.map(function(x){ return {model:(x&&x.model)||String(x), outOfCoverage:!!(x&&x.outOfCoverage), why:(x&&x.why)||null}; }),
        coverage_end: COVERAGE_END };
      window.AGN_CMIP6_LAST=record;try{document.dispatchEvent(new CustomEvent('agn:cmip6',{detail:record}));}catch(_){}
      rows.innerHTML=out||'<tr><td colspan="5">No usable model output returned.</td></tr>';
      status.textContent=st.name+' · '+h+'s versus 1991-2010 · '+bT.length+' of '+MODELS.length+' models'
        +(failed.length?' · unavailable: '+failed.map(function(x){
             

             var _n=(x&&x.model?x.model:String(x)).split('_')[0];
             return _n+(x&&x.outOfCoverage?' (outside coverage)':'');
           }).join(', '):'')
        +' \u00b7 high-emission trajectory \u00b7 downscaled and linearly bias-corrected to land reanalysis (provider default; the long-term change signal is not altered by the linear correction) \u00b7 context only, not applied to hazard or engineering scores';
      return true;
    });
  }

  function init(){
    var h=$('asmtEngHorizon'); if(h) h.addEventListener('change',function(){CMIP6_RUN_SEQ++;});
    document.addEventListener('agn:location',function(){CMIP6_RUN_SEQ++;});
  }
  window.AGN=window.AGN||{}; AGN.cmip6={ run:run, cancel:function(){ CMIP6_RUN_SEQ++; } };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
