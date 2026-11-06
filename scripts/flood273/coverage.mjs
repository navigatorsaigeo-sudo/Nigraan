/* v91.17.273 FLOOD · coverage of the engine levels: the served page's engine (offline, in a Node VM exactly as server/engine/vmpage.mjs
   runs it) on the real served tehsil forecasts of the archive (data/archive/forecast, latest issue per tehsil, hours shifted so the
   issue starts now: a coverage test, not a forecast). For every layer and day 0-3: how many tehsils get a level, "not applicable", or
   "no data", and which. node coverage.mjs <root> <out.json> */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
const ROOT = process.argv[2], OUT = process.argv[3];
process.env.NIGRAAN_ENGINE_ARTEFACT = join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html');
/* REPLAY_ORIGIN: the page's own calls go to a running server of the same tree (the engine runner's path), so server-fed inputs
   (applicability mask, drought table, river and landslide feeds where the copies hold them) are what they are on that server */
const ORIG = process.env.REPLAY_ORIGIN || null;
if (ORIG) globalThis.__REPLAY_FETCH = (u, o = {}) => { const url = new URL(u, ORIG + '/'); const h = Object.assign({}, o.headers || {}); h['x-agn-internal'] = 'engine'; return fetch(ORIG + url.pathname + url.search, { ...o, headers: h }); };
const { ctx, vm } = await import('./pagevm.mjs');
const q = (e) => vm.runInContext(e, ctx, { timeout: 600000 });
await new Promise(r => setTimeout(r, Number(process.env.REPLAY_WAIT_MS || 4000)));
/* latest issue per tehsil */
const fc = {}; for (const f of ['fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz']) { let t = ''; try { t = gunzipSync(readFileSync(join(ROOT, 'data/archive/forecast', f))).toString(); } catch (_) { continue; }
  for (const l of t.split('\n')) { if (!l) continue; let r; try { r = JSON.parse(l); } catch (_) { continue; } if (!fc[r.u] || fc[r.u].iss < r.iss) fc[r.u] = r; } }
const now = Date.now(), h0 = Math.floor((now + 5 * 3600e3) / 3600e3) * 3600e3;   /* PKT wall clock, this hour */
const series = {}; for (const [u, r] of Object.entries(fc)) { const n = r.T.length, time = [], temp = [], hum = [], rain = [], wind = [], gust = [], snow = [];
  for (let i = 0; i < n + 24; i++) { const k = Math.min(i, n - 1) % n; time.push(new Date(h0 + (i - 2) * 3600e3).toISOString().slice(0, 16)); temp.push(r.T[k] / 10); hum.push(r.RH[k]); rain.push((r.P[k] || 0) / 10); wind.push(r.W[k]); gust.push((r.G || r.W)[k]); snow.push(0); }
  series[u] = { time, temp, feels: temp, hum, rain, wind, gust, snow }; }
ctx.__FC = series;
const injected = q(`(function(){ var n=0; AGN.selfcheck.units().forEach(function(p){ var s=__FC[p.uid]; var r=DISTRICT_IN[p.key]; if(!s||!r) return; r.fc72=s; r.fcUpdatedAt=Date.now(); r.weatherLive=true; r.fcSource='archive-replay'; n++; }); return n; })()`);
const res = JSON.parse(q(`(function(){ var U=AGN.selfcheck.units(), LY=AGN.selfcheck.layers(), D0=AGN.day, g=D0.get, b=D0.basis, out={units:U.length, layers:LY, days:[]};
  try{ for(var d=0; d<=3; d++){ D0.get=function(){ return d; }; D0.basis=function(){ return 'peak'; }; var day={day:d, layers:{}};
    LY.forEach(function(hz){ var cap=(d===0)||hzDayCapable(hz); var o={derived:cap, counts:[0,0,0,0,0], na:0, nd:0, ndUnits:[]};
      if(cap) U.forEach(function(p){ var u=AGN.selfcheck.unitOn(hz,p); if(u.lv===-2) o.na++; else if(u.lv===-1){ o.nd++; if(o.ndUnits.length<600) o.ndUnits.push(p.key+(u.noInput?' (no input)':'')); } else o.counts[u.lv]++; });
      day.layers[hz]=o; }); out.days.push(day); } } finally { D0.get=g; D0.basis=b; }
  return JSON.stringify(out); })()`));
res.injected = injected; res.forecastUnits = Object.keys(fc).length;
writeFileSync(OUT, JSON.stringify(res, null, 1));
for (const d of res.days) console.log('day', d.day, Object.entries(d.layers).map(([k, v]) => k + ':' + (v.derived ? v.counts.join('/') + ' na' + v.na + ' nd' + v.nd : 'not derived')).join(' | '));
process.exit(0);
