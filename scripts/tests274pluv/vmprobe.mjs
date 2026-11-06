/* v91.17.274 PLUVIAL · test helper: the page engine (Node VM, offline) on the standard heavy storm for the named units; prints
   pluvial score/level/runoff basis and the retention layers (nss_baseline, nss_dynamic) per unit as JSON.
   node vmprobe.mjs <artefact.html> <uid,uid,...> */
process.env.NIGRAAN_ENGINE_ARTEFACT = process.argv[2];
const UNITS = process.argv[3].split(',');
const { ctx, vm } = await import('../flood273/pagevm.mjs');
await new Promise(r => setTimeout(r, 4000));
ctx.__UNITS = UNITS;
const res = vm.runInContext(`(function(){ var out={};
  AGN.selfcheck.units().forEach(function(p){ if(__UNITS.indexOf(p.uid)<0) return; var b=DISTRICT_IN[p.key]; if(!b) return;
    var inp=Object.assign({}, b, {rain:7.7,rain6hDay:45,rainTotalDay:90,rainPeakDay:7.7,scenarioDayMm:90}, {weatherLive:true, fcSource:'replay', api:0.6, dayIndex:0, dayAvailable:true, scenarioMonth:6, t:30, hum:80});
    var o={};
    ['flood_pluvial','nss_baseline','nss_dynamic'].forEach(function(h){ var r=null; try{ r=aiDistrictRisk(inp,h,24,p.key); }catch(e){ r=null; }
      var sc=r?(r.score!=null?r.score:r.mapValue):null; var L=r?AGN.hz5.levelOf(h, sc, r):{nd:true};
      o[h]={score:sc==null?null:Math.round(sc*10)/10, level:L.na?-2:(L.i!=null?L.i:-1), nd:!!(L.nd||sc==null)};
      if(h==='flood_pluvial'){ var bs=hzRunoffCoeff._lastBasis||{}; o[h].rcBasis=bs.basis||null; } });
    try{ var lz=AGN.lcz.byUid(p.uid); o.lczStatus=lz?lz.status:null; }catch(_){ }
    out[p.uid]=o; }); return JSON.stringify(out); })()`, ctx, { timeout: 600000 });
console.log(res); process.exit(0);
