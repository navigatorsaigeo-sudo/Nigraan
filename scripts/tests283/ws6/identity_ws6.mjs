/* v91.17.283 · WS6 · 60-PLACE IDENTITY CHECK of the hazard engine after the console page edits.
   The analyst page is also the server's hazard engine (server/engine/vmpage.mjs runs it, byte for byte, in a Node VM). This check runs the
   page engine exactly that way (scripts/flood273/pagevm.mjs) for a page file, with FROZEN inputs:
     - network: run "record" answers every request from a live server of the base tree and stores the answers; run "replay" answers
       every request from that store (a request not in the store fails the same way in every replay run);
     - clock: the page clock inside the VM is fixed at each archived issue time (+30 min); Math.random is a fixed-seed generator;
     - forecasts: the archived served tehsil forecasts (data/archive/forecast) of three issues, injected into every tehsil.
   Output per issue: every layer the engine serves x every tehsil x days 0-2 -> [level, score]; for 60 fixed places (every n-th tehsil,
   the same choice as scripts/tests275haz/compare60.mjs) a hash of the whole risk object per layer and day; the engine record
   (AGN.engine.derive) minus its clock fields.
   node identity_ws6.mjs record <page.html> <cache.json> <out.json> <origin>
   node identity_ws6.mjs replay <page.html> <cache.json> <out.json>
   node identity_ws6.mjs compare <a.json> <b.json>          (exit 0 only when identical) */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const [MODE, PAGE, CACHE, OUT, ORIGIN] = process.argv.slice(2);
const sha = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
if (MODE === 'compare') {
  const a = JSON.parse(readFileSync(PAGE, 'utf8')), b = JSON.parse(readFileSync(CACHE, 'utf8')); let n = 0, d = 0; const ex = [];
  const walk = (x, y, p) => { if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) { n++; if (JSON.stringify(x) !== JSON.stringify(y)) { d++; if (ex.length < 12) ex.push(p + ': ' + JSON.stringify(x) + ' vs ' + JSON.stringify(y)); } return; }
    const k = new Set([...Object.keys(x), ...Object.keys(y)]); for (const q of k) walk(x[q], y[q], p + '.' + q); };
  walk(a.issues, b.issues, 'issues');
  const cnt = (o) => Object.values(o.issues || {}).reduce((s, I) => s + Object.values(I.lv || {}).reduce((t, u) => t + Object.keys(u).length, 0), 0);
  console.log(JSON.stringify({ values: n, differ: d, unitLayerDays: cnt(a), places60: a.places60 && a.places60.length, misses: [a.misses, b.misses], examples: ex }, null, 1));
  process.exit(d ? 1 : 0);
}
/* frozen network */
const real = globalThis.fetch;
const keyOf = (u, o = {}) => { const url = new URL(String(u && u.url ? u.url : u)); return (o.method || 'GET').toUpperCase() + ' ' + url.pathname + url.search + (o.body ? ' ' + sha(o.body) : ''); };
let cache = {}; let misses = 0;
if (MODE === 'replay') cache = JSON.parse(readFileSync(CACHE, 'utf8'));
globalThis.fetch = async (u, o = {}) => { if (/\/health$/.test(new URL(String(u && u.url ? u.url : u)).pathname)) return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  const k = keyOf(u, o);
  if (MODE === 'record') { if (!cache[k]) { try { const url = new URL(String(u && u.url ? u.url : u)); const r = await real(ORIGIN + url.pathname + url.search, o); cache[k] = { s: r.status, ct: r.headers.get('content-type'), b: await r.text() }; } catch (e) { cache[k] = { err: String(e.message || e) }; } } }
  const c = cache[k]; if (!c) { misses++; throw new Error('offline replay: not recorded'); } if (c.err) throw new Error(c.err);
  return new Response(c.b, { status: c.s, headers: c.ct ? { 'content-type': c.ct } : {} }); };
globalThis.__REPLAY_FETCH = (u, o) => globalThis.fetch(new URL(String(u), 'http://127.0.0.1:8787/').href, o || {});   /* scripts/flood273/pagevm.mjs asks this hook */
process.env.NIGRAAN_ENGINE_ARTEFACT = PAGE;
process.env.NIGRAAN_ENGINE_PORT = process.env.NIGRAAN_ENGINE_PORT || '8787';
const { ctx, vm } = await import('../../flood273/pagevm.mjs');
const q = (e) => vm.runInContext(e, ctx, { timeout: 900000 });
q(`(function(){ var RD=Date; globalThis.__NOW=RD.now(); function FD(){ var a=[].slice.call(arguments); if(!(this instanceof FD)) return new RD(globalThis.__NOW).toString(); return a.length?new (Function.prototype.bind.apply(RD,[null].concat(a)))():new RD(globalThis.__NOW); }
  FD.prototype=RD.prototype; FD.now=function(){ return globalThis.__NOW; }; FD.UTC=RD.UTC; FD.parse=RD.parse; globalThis.Date=FD;
  var s=0x2545F491; Math.random=function(){ s^=s<<13; s^=s>>>17; s^=s<<5; return ((s>>>0)%1e9)/1e9; }; })()`);
const byIssue = {};
for (const f of ['fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz']) { let t = ''; try { t = gunzipSync(readFileSync(join(ROOT, 'data/archive/forecast', f))).toString(); } catch (_) { continue; }
  for (const l of t.split('\n')) { if (!l) continue; let r; try { r = JSON.parse(l); } catch (_) { continue; } const D = byIssue[r.d] || (byIssue[r.d] = {}); if (!D[r.u] || D[r.u].iss < r.iss) D[r.u] = r; } }
const ISS = (process.env.IDENT_ISSUES || '').split(',').filter(Boolean);
const issues = ISS.length ? ISS : (() => { const k = Object.keys(byIssue).sort(); return [k[0], k[Math.floor(k.length / 2)], k[k.length - 1]]; })();
const first = Object.values(byIssue[issues[0]])[0]; ctx.__NOW = Date.parse(first.iss) + 30 * 60e3;
await new Promise(r => setTimeout(r, Number(process.env.IDENT_WAIT_MS || 45000)));
const out = { page: PAGE.split('/').pop(), pageSha: createHash('sha256').update(readFileSync(PAGE)).digest('hex'), issues: {}, method: 'page engine (AGN.selfcheck.unitOn) on archived served forecasts, frozen network / clock / random' };
for (const D of issues) {
  const recs = byIssue[D]; if (!recs) continue; const any = Object.values(recs)[0]; ctx.__NOW = Date.parse(any.iss) + 30 * 60e3;
  const series = {};
  for (const [u, r] of Object.entries(recs)) { const t0 = Date.parse(r.t0), n = r.T.length, time = [], temp = [], hum = [], rain = [], wind = [], gust = [], snow = [];
    for (let i = 0; i < n; i++) { time.push(new Date(t0 + 5 * 3600e3 + i * 3600e3).toISOString().slice(0, 16)); temp.push(r.T[i] / 10); hum.push(r.RH[i]); rain.push((r.P[i] || 0) / 10); wind.push(r.W[i]); gust.push((r.G || r.W)[i]); snow.push(0); }
    series[u] = { time, temp, feels: temp, hum, rain, wind, gust, snow, elev: r.sel != null ? r.sel : r.el }; }
  ctx.__FC = series;
  const inj = q(`(function(){ var n=0; AGN.selfcheck.units().forEach(function(p){ var s=__FC[p.uid]; var r=DISTRICT_IN[p.key]; if(!s||!r) return; r.fc72=s; r.fcUpdatedAt=Date.now(); r.weatherLive=true; r.fcSource='archive-replay'; n++; }); return n; })()`);
  const res = JSON.parse(q(`(function(){ var U=AGN.selfcheck.units(), D0=AGN.day, g=D0.get, b=D0.basis, lv={}, P60=[], step=Math.floor(U.length/60), H=['rain_hz','heat','cold','wind','flood','flood_pluvial','flood_riverine','landslide','glof','drought'];
    for(var i=0;i<60;i++) P60.push(U[i*step]);
    var hash=function(o){ var s=JSON.stringify(o,function(k,v){ return typeof v==='function'?undefined:v; })||''; var h=2166136261>>>0; for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return h.toString(16)+':'+s.length; };
    var full={};
    try{ for(var d=0; d<=2; d++){ D0.get=function(){ return d; }; D0.basis=function(){ return 'peak'; };
      H.forEach(function(hz){ var cap=(d===0)||(typeof hzDayCapable==='function'&&hzDayCapable(hz)); if(!cap) return;
        U.forEach(function(p){ var u=AGN.selfcheck.unitOn(hz,p); var sc=(u&&u.r&&u.lv>=0)?(u.r.score!=null?u.r.score:u.r.mapValue):null;
          (lv[p.uid]=lv[p.uid]||{})[hz+'@'+d]=[u?u.lv:null, sc==null?null:Math.round(sc*10)/10]; });
        P60.forEach(function(p){ var u=AGN.selfcheck.unitOn(hz,p); (full[p.uid]=full[p.uid]||{})[hz+'@'+d]=hash(u&&u.r); }); }); } } finally { D0.get=g; D0.basis=b; }
    var eng=null; try{ if(AGN.engine&&AGN.engine.derive){ var e=AGN.engine.derive(); var ec=JSON.parse(JSON.stringify(e,function(k,v){ return /^(at|generatedAt|computedAt|now|t|ms|builtAt|time|issuedAt)$/.test(k)?undefined:v; })); eng=hash(ec); globalThis.__ENGFULL=globalThis.__ENGFULL||{}; globalThis.__ENGFULL[String(Date.now())]=ec; } }catch(x){ eng='derive failed: '+String(x&&x.message||x).slice(0,80); }
    return JSON.stringify({lv:lv, p60:full, places:P60.map(function(p){ return p.uid; }), engine:eng}); })()`));
  out.issues[D] = { now: new Date(ctx.__NOW).toISOString(), injected: inj, lv: res.lv, p60: res.p60, engine: res.engine }; out.places60 = res.places;
  console.log(D, 'injected', inj, 'units', Object.keys(res.lv).length, 'engine', String(res.engine).slice(0, 40));
}
out.misses = misses;
if (process.env.IDENT_ENGINE_FULL) writeFileSync(process.env.IDENT_ENGINE_FULL, q('JSON.stringify(globalThis.__ENGFULL||{})'));
writeFileSync(OUT, JSON.stringify(out));
if (MODE === 'record') writeFileSync(CACHE, JSON.stringify(cache));
console.log('network answers', Object.keys(cache).length, 'misses', misses);
process.exit(0);
