/* v91.17.273 FLOOD · the served pluvial chain (page engine in a Node VM, offline) on one standard storm for every tehsil: the score
   then differs only by what the served chain adds per place (runoff coefficient from land/soil/slope/zone, local rarity of the day's
   rain). Storms: the page's own rain bands (peak hourly rate 2.3/5.3/7.2/7.7 mm/h); we use two: moderate (5.3 mm/h, 20 mm in 6 h,
   40 mm day) and heavy (7.7 mm/h, 45 mm in 6 h, 90 mm day), API 0.6, July. Output JSON {uid: {mod, heavy, lvMod, lvHeavy, zone}}. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.argv[2], OUT = process.argv[3];
process.env.NIGRAAN_ENGINE_ARTEFACT = process.env.NIGRAAN_ENGINE_ARTEFACT || join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html');
const { ctx, vm } = await import('./pagevm.mjs');
await new Promise(r => setTimeout(r, 4000));
const res = vm.runInContext(`(function(){ var out={}; var S={mod:{rain:5.3,rain6hDay:20,rainTotalDay:40,rainPeakDay:5.3,scenarioDayMm:40}, heavy:{rain:7.7,rain6hDay:45,rainTotalDay:90,rainPeakDay:7.7,scenarioDayMm:90}};
  AGN.selfcheck.units().forEach(function(p){ var b=DISTRICT_IN[p.key]; if(!b) return; var o={key:p.key};
    Object.keys(S).forEach(function(s){ var inp=Object.assign({}, b, S[s], {weatherLive:true, fcSource:'replay', api:0.6, dayIndex:0, dayAvailable:true, scenarioMonth:6, t:30, hum:80});
      var mk=(typeof __agnHzMaskWhy==='function')?__agnHzMaskWhy(p.key,'flood_pluvial'):null; if(mk){ o[s]=null; o['lv_'+s]=-2; return; }
      var r=null; try{ r=aiDistrictRisk(inp,'flood_pluvial',24,p.key); }catch(e){ r=null; }
      var sc=r?(r.score!=null?r.score:r.mapValue):null; var L=r?AGN.hz5.levelOf('flood_pluvial', sc, r):{nd:true};
      o[s]=sc; o['lv_'+s]=L.na?-2:(L.i!=null?L.i:-1); });
    out[p.uid]=o; }); return JSON.stringify(out); })()`, ctx, { timeout: 600000 });
writeFileSync(OUT, res); console.log('units', Object.keys(JSON.parse(res)).length); process.exit(0);
