/* v91.17.273 FLOOD · the served pluvial level replayed on the 2025 monsoon: the page's own engine (offline Node VM, as
   server/engine/vmpage.mjs runs it; page calls answered by a running server of this tree when REPLAY_ORIGIN is set) on the IFS
   as-issued short-lead rain at each tehsil point (ifs2025_series.py). Per PKT day: today's 24 hourly rain values as the forecast
   day 0, the rain-memory index (API) carried day by day with the page's own AGN.wetness.advance from 2 Jun (10-day spin-up before
   scoring starts 12 Jun), the rarity term on the day's total in its own month (the page's scenario inputs scenarioDayMm /
   scenarioMonth). Temperature, wind and humidity are held fixed (the pluvial score does not read them).
   Output data/flood273/replay2025.json {dates, units:{uid:{s:[score], L:[level]}}}  node replay2025.mjs <root> */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.argv[2];
const ORIG = process.env.REPLAY_ORIGIN || null;
if (ORIG) globalThis.__REPLAY_FETCH = (u, o = {}) => { const url = new URL(u, ORIG + '/'); const h = Object.assign({}, o.headers || {}); h['x-agn-internal'] = 'engine'; return fetch(ORIG + url.pathname + url.search, { ...o, headers: h }); };
process.env.NIGRAAN_ENGINE_ARTEFACT = join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html');
const { ctx, vm } = await import('./pagevm.mjs');
await new Promise(r => setTimeout(r, Number(process.env.REPLAY_WAIT_MS || 30000)));
const S = JSON.parse(readFileSync(join(ROOT, 'data/flood273/' + (process.env.REPLAY_IN || 'ifs2025_hourly.json')), 'utf8'));
ctx.__S = S;
const setup = vm.runInContext(`(function(){ var W=AGN.wetness; if(!W||typeof W.advance!=='function') return 'no AGN.wetness';
  var U=AGN.selfcheck.units(); var today=hzPkDate(0), tom=hzPkDate(1), time=[];
  for(var h=0;h<24;h++) time.push(today+'T'+(h<10?'0':'')+h+':00'); for(var h2=0;h2<24;h2++) time.push(tom+'T'+(h2<10?'0':'')+h2+':00');
  window.__R={U:U, time:time, raw:{}, out:{}}; U.forEach(function(p){ __R.raw[p.uid]=0; __R.out[p.uid]={s:[],L:[]}; });
  AGN.day.get=function(){ return 0; }; AGN.day.basis=function(){ return 'peak'; };
  return 'ok '+U.length+' units, today '+today; })()`, ctx, { timeout: 60000 });
console.log(setup);
const n = S.dates.length; const t0 = Date.now();
for (let i = 0; i < n; i++) {
  ctx.__I = i;
  vm.runInContext(`(function(){ var i=__I, mo=+__S.dates[i].slice(5,7)-1, W=AGN.wetness;
    __R.U.forEach(function(p){ var b=DISTRICT_IN[p.key], rows=__S.units[p.uid]; var o=__R.out[p.uid];
      if(!b||!rows){ o.s.push(null); o.L.push(null); return; }
      var hr=rows[i]; if(!hr||hr.some(function(x){ return x==null; })){ o.s.push(null); o.L.push(null); return; }
      var rain=hr.map(function(x){ return x/10; }), tot=rain.reduce(function(a,c){ return a+c; },0);
      var r48=rain.concat(new Array(24).fill(0)), v=function(x){ return new Array(48).fill(x); };
      b.fc72={time:__R.time, rain:r48, temp:v(30), feels:v(30), hum:v(70), wind:v(5), gust:v(10), snow:v(0)};
      b.weatherLive=true; b.fcSource='replay-2025-ifs'; b.apiRaw=__R.raw[p.uid]; b.api=null; b.scenarioDayMm=tot; b.scenarioMonth=mo; b.fcUpdatedAt=Date.now();
      var u=AGN.selfcheck.unitOn('flood_pluvial', p); var sc=(u.r&&u.lv>=0)?(u.r.score!=null?u.r.score:u.r.mapValue):null;
      o.s.push(sc==null?null:Math.round(sc*10)/10); o.L.push(u.lv);
      __R.raw[p.uid]=W.advance(__R.raw[p.uid], tot); }); })()`, ctx, { timeout: 600000 });
  if (i % 20 === 0) console.log('day', S.dates[i], Math.round((Date.now() - t0) / 1000) + ' s');
}
const out = JSON.parse(vm.runInContext('JSON.stringify(__R.out)', ctx, { timeout: 60000 }));
writeFileSync(join(ROOT, 'data/flood273/' + (process.env.REPLAY_OUT || 'replay2025.json')), JSON.stringify({ dates: S.dates, basis: S.basis, units: out }));
console.log('done', Object.keys(out).length, 'units', n, 'days'); process.exit(0);
