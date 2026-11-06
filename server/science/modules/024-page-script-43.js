


window.AGNConditions = {
  ACTIVE_PROVIDER:'mach',
  

  getUserLocation:function(){
    return new Promise(function(res,rej){
      if(!navigator.geolocation) return rej(new Error('this browser does not offer location'));
      if(!window.isSecureContext) return rej(new Error('the browser only shares location over https, or on localhost'));
      navigator.geolocation.getCurrentPosition(
        function(p){
          var la=p&&p.coords?Number(p.coords.latitude):NaN, lo=p&&p.coords?Number(p.coords.longitude):NaN;
          if(!Number.isFinite(la)||!Number.isFinite(lo))
            return rej(new Error('the browser returned a position with no usable coordinates'));
          if(la<-90||la>90||lo<-180||lo>180)
            return rej(new Error('the browser returned coordinates outside the range of the Earth ('+la+', '+lo+')'));
          res({lat:la, lon:lo, accuracyM:(p.coords&&Number.isFinite(p.coords.accuracy))?p.coords.accuracy:null});
        },
        function(e){
          var why = (e&&e.code===1) ? 'location permission was declined for this page'
                  : (e&&e.code===2) ? 'the browser could not determine a position'
                  : (e&&e.code===3) ? 'the location request timed out'
                  : (e&&e.message) || 'the location request failed';
          rej(new Error(why));
        },
        {enableHighAccuracy:true, timeout:10000, maximumAge:60000});
      

      setTimeout(function(){ rej(new Error('the browser gave no position within 15 s. On Windows, check Settings › Privacy & security › Location (location services on, and allowed for the browser), or search your place by name')); }, 15000);
    });
  },
  

  _gridElevCache:{},
  nativeGridElev:function(lat,lon){
    var key=(Math.round(lat*20)/20)+','+(Math.round(lon*20)/20);
    var c=this._gridElevCache;
    if(Object.prototype.hasOwnProperty.call(c,key)) return Promise.resolve(c[key]);
    /* v91.17.283.15 · the server's land record of the place (GET /api/pointstate/product name=land): the model's own grid height */
    return AGN.api.product('land',{latitude:lat, longitude:lon, current:'temperature_2m', models:'best_match', timezone:'auto', elevation:'nan'})
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(j){ var e=(j&&j.elevation!=null)?j.elevation:null; c[key]=e; return e; })
      .catch(function(){ c[key]=null; return null; });
  },
  getConditions:function(lat,lon,realElev){
    
    
    
    /* v91.17.283.12 · ONE CALCULATION POINT: the weather of the selected point is its point state (AGN.pointState, the served chain):
       air temperature, feels-like, humidity, wind, gust, rain, UV and the weather word. The provider is read only for the land-surface
       inputs the point state does not hold (soil moisture, ET0, VPD) and the air quality (CAMS), which are not the point's weather. */
    /* v91.17.283.15 · the land-surface inputs are the server's land record of the place (GET /api/pointstate/product name=land) */
    var landQ={latitude:lat, longitude:lon, current:'soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,et0_fao_evapotranspiration,vapour_pressure_deficit', models:'best_match', timezone:'auto'};
    if(realElev!=null && isFinite(realElev)) landQ.elevation=Math.round(realElev);
    var num=function(v){ return (v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))?Number(v):null; };
    function attempt(tries){
      var land=AGN.api.product('land',landQ).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; });
      var air=(typeof window.agnSmogAt==='function')?window.agnSmogAt(lat,lon):Promise.resolve(null);   /* the server AQI */
      var ps=(typeof window.agnPS==='function'?window.agnPS():Promise.resolve(window.AGN&&AGN.pointState||null)).then(function(P){ return P?P.get(lat,lon):null; });
      return Promise.all([ps,land,air]).then(function(a){
          var S=a[0], j=a[1]||{}, d=(j&&j.current)||{}, Q=a[2];
          if(!S||!S.ok||!S.now) throw new Error('the point state for this place is not available');
          var n=S.now, cond='\u2014', em='\uD83C\uDF21\uFE0F';
          if(typeof wmoCond==='function' && n.weatherCode!=null){
            var cc=wmoCond(n.weatherCode); cond=cc[0]; em=cc[1];
            var _code=Number(n.weatherCode), _pp=Number(n.rainProb||0), _amt=Number(n.rainMm||0);
            if(_code>=95 && _pp<30 && _amt<0.2){ var c2=wmoCond(2); cond=c2[0]; em=c2[1]; }
            else if(_code>=80 && _code<95 && _pp<30 && _amt<0.2){ var c3=wmoCond(3); cond=c3[0]; em=c3[1]; }
          }
          var out={ ok:true, lat:lat, lon:lon, pointState:S.key,
            t:n.tempC!=null?Number(Number(n.tempC).toFixed(1)):null, feels:n.feelsC!=null?Number(Number(n.feelsC).toFixed(1)):null,
            hum:n.rh!=null?Math.round(n.rh):null, wind:n.windKmh!=null?Math.round(n.windKmh):null, gust:n.gustKmh!=null?Math.round(n.gustKmh):null,
            rain:n.rainMm!=null?+Number(n.rainMm).toFixed(1):null, uv:n.uv!=null?Math.round(n.uv):null,
            soilMoist:(function(){ var s1=num(d.soil_moisture_0_to_1cm), s3=num(d.soil_moisture_1_to_3cm); if(s1!=null&&s3!=null) return (s1+s3*2)/3; return s1!=null?s1:s3; })(),
            smRoot:(function(){ var r1=num(d.soil_moisture_9_to_27cm), r2=num(d.soil_moisture_27_to_81cm); if(r1!=null&&r2!=null) return (r1*18+r2*54)/72; return r1!=null?r1:r2; })(),
            et0:num(d.et0_fao_evapotranspiration), vpd:num(d.vapour_pressure_deficit),
            gridElev:(j&&j.elevation!=null)?j.elevation:null, echoedElev:S.point&&S.point.elevM!=null?S.point.elevM:null,
            gridLat:(j&&typeof j.latitude==='number')?j.latitude:null, gridLon:(j&&typeof j.longitude==='number')?j.longitude:null,
            realElev:(realElev!=null&&isFinite(realElev))?Math.round(realElev):null, fetchedAt:Date.now(),
            sev:(typeof sevFromTemp==='function'&&n.tempC!=null)?sevFromTemp(n.tempC):2, cond:cond, em:em, aqi:null, pm25:null,
            tier:'live', confidence:0.8, source:'mach', sourceLabel:'\u25CF LIVE \u00B7 '+AGN.pointState.sourceWord(S).toLowerCase() };
          if(Q){ out.aqi=Q.aqi; out.pm25=Q.pm25; out.pm10=Q.pm10; out.dust=Q.dust; out.aqiBasis=Q.basis; out.airSource='NIGRAAN air quality (US EPA 2024, NowCast)'; }
          return out;
        }).catch(function(e){
          if(tries>0){ return new Promise(function(res){ setTimeout(res,600); }).then(function(){ return attempt(tries-1); }); }
          return { ok:false, lat:lat, lon:lon, error:e.message, source:'mach', sourceLabel:'live unavailable' };
        });
    }
    
    
    var self=this;
    return attempt(1).then(function(rec){
      if(!rec || !rec.ok) return rec;
      if(rec.realElev==null) return rec;                 
      return self.nativeGridElev(lat,lon).then(function(ge){
        if(ge!=null) rec.gridElev=ge;
        return rec;
      }).catch(function(){ return rec; });
    });
  }
};
