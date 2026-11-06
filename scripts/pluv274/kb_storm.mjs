/* v91.17.274 PLUVIAL · Keti Bunder and its neighbours through the served pluvial chain (page engine in a Node VM, offline), on the two
   standard storms of scripts/flood273/land_storm.mjs (the page's own rain bands: moderate 5.3 mm/h, 20 mm in 6 h, 40 mm day; heavy
   7.7 mm/h, 45 mm in 6 h, 90 mm day; API 0.6, July). Prints score, level, runoff coefficient and its basis per unit.
   node kb_storm.mjs <artefact.html> [uid,uid,...]   (UNITS default: Keti Bunder + the Sujawal / Thatta delta tehsils) */
process.env.NIGRAAN_ENGINE_ARTEFACT = process.argv[2];
const UNITS = (process.argv[3] || 'Sindh|Sujawal|Keti Bunder,Sindh|Sujawal|Kharo Chan,Sindh|Sujawal|Jati,Sindh|Thatta|Ghorabari,Sindh|Sujawal|Shah Bunder').split(',');
const { ctx, vm } = await import('../flood273/pagevm.mjs');
await new Promise(r => setTimeout(r, 4000));
ctx.__UNITS = UNITS;
const res = vm.runInContext(`(function(){ var out={}; var S={mod:{rain:5.3,rain6hDay:20,rainTotalDay:40,rainPeakDay:5.3,scenarioDayMm:40}, heavy:{rain:7.7,rain6hDay:45,rainTotalDay:90,rainPeakDay:7.7,scenarioDayMm:90}};
  AGN.selfcheck.units().forEach(function(p){ if(__UNITS.indexOf(p.uid)<0) return; var b=DISTRICT_IN[p.key]; if(!b) return; var o={key:p.key};
    Object.keys(S).forEach(function(s){ var inp=Object.assign({}, b, S[s], {weatherLive:true, fcSource:'replay', api:0.6, dayIndex:0, dayAvailable:true, scenarioMonth:6, t:30, hum:80});
      var r=null; try{ r=aiDistrictRisk(inp,'flood_pluvial',24,p.key); }catch(e){ r=null; }
      var sc=r?(r.score!=null?r.score:r.mapValue):null; var L=r?AGN.hz5.levelOf('flood_pluvial', sc, r):{nd:true};
      var bs=(typeof hzRunoffCoeff!=='undefined'&&hzRunoffCoeff._lastBasis)?hzRunoffCoeff._lastBasis:{};
      o[s]={score:sc==null?null:Math.round(sc*10)/10, level:L.na?-2:(L.i!=null?L.i:-1), rcBasis:bs.basis||null, hsg:bs.hsg||null, conf:bs.confidence||null}; });
    try{ var t=hzTerrainFor(p.key,p.key); o.terrain={res:t.res, slope:t.slope, zone:t.zone}; }catch(_){ }
    try{ var cv=AGN.nss.score(p.key, PK_KEY_TO_DISTRICT[p.key], (hzTerrainFor(p.key,p.key)||{}).zone, 1, null, 45); o.nss=cv?{ok:cv.ok, rc:cv.runoffCoefficient, storm:cv.stormDynamicRunoffMm, reason:cv.reason||null, landCover:cv.landCoverBasis||null}:null; }catch(e){ o.nss={err:String(e&&e.message)}; }
    out[p.uid]=o; }); return JSON.stringify(out); })()`, ctx, { timeout: 600000 });
console.log(JSON.stringify(JSON.parse(res), null, 1)); process.exit(0);
