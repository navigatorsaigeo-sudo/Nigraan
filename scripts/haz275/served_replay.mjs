/* v91.17.275 HAZ2 · V-09 · the SERVED heat, cold and wind levels, replayed. The served page's own engine (scripts/flood273/pagevm.mjs:
   the artefact, byte for byte, in a Node VM exactly as server/engine/vmpage.mjs runs it) is fed each archived served tehsil forecast
   (data/archive/forecast, every issue held: 10 issue days, 26 Sep - 12 Oct 2026, 73 h each) at its REAL times, with the page clock
   frozen at the issue time, so "day 0" is the issue's own PKT day. Output: level and score per issue x tehsil x hazard x day 0-2.
   node scripts/haz275/served_replay.mjs <root> <out.json> */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
const ROOT = process.argv[2], OUT = process.argv[3];
process.env.NIGRAAN_ENGINE_ARTEFACT = process.env.ARTEFACT || join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html');
const { ctx, vm } = await import('../flood273/pagevm.mjs');
const q = (e) => vm.runInContext(e, ctx, { timeout: 600000 });
await new Promise(r => setTimeout(r, Number(process.env.REPLAY_WAIT_MS || 4000)));
const byIssue = {};
for (const f of ['fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz']) { let t = ''; try { t = gunzipSync(readFileSync(join(ROOT, 'data/archive/forecast', f))).toString(); } catch (_) { continue; }
  for (const l of t.split('\n')) { if (!l) continue; let r; try { r = JSON.parse(l); } catch (_) { continue; } const D = byIssue[r.d] || (byIssue[r.d] = {}); if (!D[r.u] || D[r.u].iss < r.iss) D[r.u] = r; } }
/* the page clock: a Date whose "now" is the issue time (the page reads Date.now() / new Date() for its PKT day) */
q(`(function(){ var RD=Date; function FD(){ var a=[].slice.call(arguments); if(!(this instanceof FD)) return RD(); return a.length?new (Function.prototype.bind.apply(RD,[null].concat(a)))():new RD(globalThis.__NOW); }
  FD.prototype=RD.prototype; FD.now=function(){ return globalThis.__NOW; }; FD.UTC=RD.UTC; FD.parse=RD.parse; globalThis.__RD=RD; globalThis.Date=FD; })()`);
const HZ = ['heat', 'cold', 'wind'], out = { issues: {}, hazards: HZ, method: 'page engine (AGN.selfcheck.unitOn) on each archived served forecast at its own times, page clock at issue + 30 min' };
for (const D of Object.keys(byIssue).sort()) {
  const recs = byIssue[D]; const any = Object.values(recs)[0];
  const now = Date.parse(any.iss) + 30 * 60e3; ctx.__NOW = now;
  const series = {};
  for (const [u, r] of Object.entries(recs)) { const t0 = Date.parse(r.t0), n = r.T.length, time = [], temp = [], hum = [], rain = [], wind = [], gust = [], snow = [];
    for (let i = 0; i < n; i++) { time.push(new Date(t0 + 5 * 3600e3 + i * 3600e3).toISOString().slice(0, 16)); temp.push(r.T[i] / 10); hum.push(r.RH[i]); rain.push((r.P[i] || 0) / 10); wind.push(r.W[i]); gust.push((r.G || r.W)[i]); snow.push(0); }
    series[u] = { time, temp, feels: temp, hum, rain, wind, gust, snow, elev: r.sel != null ? r.sel : r.el }; }
  ctx.__FC = series;
  const inj = q(`(function(){ var n=0; AGN.selfcheck.units().forEach(function(p){ var s=__FC[p.uid]; var r=DISTRICT_IN[p.key]; if(!s||!r) return; r.fc72=s; r.fcUpdatedAt=Date.now(); r.weatherLive=true; r.fcSource='archive-replay'; n++; }); return n; })()`);
  const res = JSON.parse(q(`(function(){ var U=AGN.selfcheck.units(), D0=AGN.day, g=D0.get, b=D0.basis, lv={};
    try{ for(var d=0; d<=2; d++){ D0.get=function(){ return d; }; D0.basis=function(){ return 'peak'; };
      ${JSON.stringify(HZ)}.forEach(function(hz){ var cap=(d===0)||hzDayCapable(hz); if(!cap) return;
        U.forEach(function(p){ var u=AGN.selfcheck.unitOn(hz,p); var sc=(u.r&&u.lv>=0)?(u.r.score!=null?u.r.score:u.r.mapValue):null;
          var q=u.r||{}; (lv[p.uid]=lv[p.uid]||{})[hz+'@'+d]=[u.lv, sc==null?null:Math.round(sc*10)/10, q.utciShade!=null?q.utciShade:null]; }); }); } } finally { D0.get=g; D0.basis=b; }
    return JSON.stringify(lv); })()`));
  out.issues[D] = { now: new Date(now).toISOString(), injected: inj, lv: res };
  console.log(D, 'injected', inj, 'units', Object.keys(res).length);
}
writeFileSync(OUT, JSON.stringify(out));
process.exit(0);
