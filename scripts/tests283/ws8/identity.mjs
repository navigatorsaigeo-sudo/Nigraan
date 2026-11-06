/* v91.17.283 · WS8 · IDENTITY TEST: the page-extracted engine (path "page": every script of the served artefact, as
   server/engine/vmpage.mjs runs it) against the science modules (path "science": server/science/loader.mjs, the modules the
   server imports), on the same frozen inputs.

   Frozen inputs:
     - every network answer the page asks for comes from one recorded cache (recorded once from a server of this tree, path
       "page"); a request not in the cache is refused the same way in both paths;
     - the page clock is frozen (Date inside the VM is a fixed instant per issue) and Math.random is a fixed-seed generator;
     - the tehsil forecasts are archived served forecasts (data/archive/forecast) at their real issue times, each series carried
       forward by repeating its own hours so that days 0-6 hold values (an identity test, not a forecast).
   Output per issue: for days 0-6, every layer, every tehsil: level, score (as derive() rounds it), and a hash of the whole risk
   object (every field: probabilities, ranges, text keys); for the 60 fixed places the whole risk object itself; and the whole
   served engine record (AGN.engine.derive(): days 0-3, alert rows, district board), minus its wall-clock fields.

   node identity.mjs record <cache.json> <origin>            record the network answers (path page, live server)
   node identity.mjs dump <page|science> <cache.json> <out.json>
   node identity.mjs compare <a.json> <b.json> [table.md]  */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createHost } from '../../../server/science/host.mjs';
import { pageBlocks, scienceBlocks } from '../../../server/science/loader.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const [MODE, A1, A2, A3] = process.argv.slice(2);
const ISSUES = (process.env.IDENT_ISSUES || '2026-09-26,2026-10-03,2026-10-12').split(',');
/* IDENT_RAINX=<f>: a stress input, every archived hourly rain multiplied by f (both paths, and the rain-chance feed), so the wet
   branches (rain, flash flooding, landslide) are exercised; the issue is then keyed <day>x<f> */
const RAINX = Number(process.env.IDENT_RAINX || 1);
const MAXD = 6, WAIT_MS = Number(process.env.IDENT_WAIT_MS || 45000);
const sha = (s) => createHash('sha1').update(s).digest('hex');

if (MODE === 'compare') { compare(A1, A2, A3); process.exit(0); }

/* ---- frozen network ---- */
const keyOf = (u, o = {}) => { const url = new URL(String(u && u.url ? u.url : u), 'http://127.0.0.1/'); return (o.method || 'GET').toUpperCase() + ' ' + url.pathname + url.search + (o.body ? ' ' + sha(String(o.body)) : ''); };
const NEVER = /\/api\/engine\/report/;
let cache = {}; const misses = new Set();
let fetchImpl;
if (MODE === 'record') {
  const ORIG = A2;
  fetchImpl = async (u, o = {}) => { const k = keyOf(u, o); if (NEVER.test(k)) throw new Error('not recorded');
    const url = new URL(String(u && u.url ? u.url : u), ORIG + '/'); const h = Object.assign({}, o.headers || {}); h['x-agn-internal'] = 'engine';
    if (url.host !== '127.0.0.1:8787' && url.origin !== new URL(ORIG).origin) {   /* the page's own origin in the host is 127.0.0.1:8787 */ cache[k] = { err: 'external' }; throw new Error('external refused'); }
    const hh = (o.headers && typeof o.headers.forEach === 'function' && !Array.isArray(o.headers)) ? (() => { const x = {}; o.headers.forEach((v, k) => { x[k] = v; }); return x; })() : Object.assign({}, o.headers || {}); hh['x-agn-internal'] = 'engine';
    try { const r = await fetch(ORIG + url.pathname + url.search, { method: o.method || 'GET', body: o.body, headers: hh }); const body = await r.text();
      if (!cache[k]) cache[k] = { status: r.status, ct: r.headers.get('content-type'), body };
      const c = cache[k]; return new Response(c.body, { status: c.status, headers: c.ct ? { 'content-type': c.ct } : {} }); }
    catch (e) { if (!cache[k]) cache[k] = { err: String(e.message) }; throw e; } };
} else {
  cache = JSON.parse(readFileSync(A2, 'utf8'));
  /* IDENT_RAINFEED=1 (one issue per run): the rain chance the server's own model gives on that issue's archived run (rainfeed.mjs) */
  if (process.env.IDENT_RAINFEED === '1') { const { execFileSync } = await import('node:child_process');
    const o = JSON.parse(execFileSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'rainfeed.mjs'), ISSUES[0], String(RAINX)], { encoding: 'utf8', maxBuffer: 1e9 }));
    const c = Object.assign({}, o); c.target = 'chance that the satellite day rain total (about 10 km, PKT day) reaches the threshold'; c.note = 'Chance of a day rain total at or above the threshold, calibrated against satellite rain and tested on a held-out year.'; delete c.test; c.customerView = true;
    cache['GET /api/rain/chance'] = { status: 200, ct: 'application/json', body: JSON.stringify(c) }; }
  fetchImpl = async (u, o = {}) => { const k = keyOf(u, o); const c = cache[k];
    if (!c) { misses.add(k); throw new Error('offline replay'); } if (c.err) throw new Error(c.err);
    return new Response(c.body, { status: c.status, headers: c.ct ? { 'content-type': c.ct } : {} }); };
}

/* ---- frozen clock and random (inside the VM only) ---- */
const PRELUDE = `(function(){ var RD=Date; globalThis.__NOW=${Date.parse(ISSUES[0] + 'T00:00:00Z')};
  function FD(){ var a=[].slice.call(arguments); if(!(this instanceof FD)) return new RD(globalThis.__NOW).toString(); return a.length?new (Function.prototype.bind.apply(RD,[null].concat(a)))():new RD(globalThis.__NOW); }
  FD.prototype=RD.prototype; FD.now=function(){ return globalThis.__NOW; }; FD.UTC=RD.UTC; FD.parse=RD.parse; globalThis.Date=FD;
  var s=0x2545F491; Math.random=function(){ s^=s<<13; s^=s>>>17; s^=s<<5; return ((s>>>0)%1e9)/1e9; }; })();`;

/* forecasts of an issue, at their own times, carried forward to cover day 6 */
function issueSeries(D) {
  const recs = {};
  for (const f of ['fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz']) { let t = ''; try { t = gunzipSync(readFileSync(join(ROOT, 'data/archive/forecast', f))).toString(); } catch (_) { continue; }
    for (const l of t.split('\n')) { if (!l) continue; let r; try { r = JSON.parse(l); } catch (_) { continue; } if (r.d !== D) continue; if (!recs[r.u] || recs[r.u].iss < r.iss) recs[r.u] = r; } }
  const series = {}; let iss = null;
  for (const [u, r] of Object.entries(recs)) { iss = iss && iss > r.iss ? iss : r.iss; const t0 = Date.parse(r.t0), n = r.T.length, N = Math.max(n, 24 * (MAXD + 2)), s = { time: [], temp: [], feels: [], hum: [], rain: [], wind: [], gust: [], snow: [], elev: r.sel != null ? r.sel : r.el };
    for (let i = 0; i < N; i++) { const k = i < n ? i : n - 24 + ((i - n) % 24); s.time.push(new Date(t0 + 5 * 3600e3 + i * 3600e3).toISOString().slice(0, 16)); s.temp.push(r.T[k] / 10); s.feels.push(r.T[k] / 10); s.hum.push(r.RH[k]); s.rain.push((r.P[k] || 0) / 10 * RAINX); s.wind.push(r.W[k]); s.gust.push((r.G || r.W)[k]); s.snow.push(0); }
    series[u] = s; }
  return { series, now: Date.parse(iss) + 30 * 60e3 };
}

const which = MODE === 'record' ? 'page' : A1;
const { blocks, json } = which === 'page' ? pageBlocks() : scienceBlocks();
const host = createHost({ blocks, json, port: 8787, fetch: fetchImpl, onReload: () => {}, preludeCode: PRELUDE, log: () => {} });
const { ctx, vm } = host;
const q = (e) => vm.runInContext(e, ctx, { timeout: 900000 });
const first = issueSeries(ISSUES[0]); ctx.__NOW = first.now;
/* IDENT_COVERAGE=<file>: which scripts run after the synchronous start (the waiting phase and the derivation), per script file */
const COV = process.env.IDENT_COVERAGE ? await (async () => { const { Session } = await import('node:inspector/promises'); const s = new Session(); s.connect();
  await s.post('Profiler.enable'); await s.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
  const phase = async (name, acc) => { const { result } = await s.post('Profiler.takePreciseCoverage'); for (const sc of result) { if (!/block|science\//.test(sc.url)) continue;
    const n = sc.functions.reduce((a, f) => a + f.ranges.reduce((b, r) => b + r.count, 0), 0); const k = sc.url.split('/').pop(); (acc[k] = acc[k] || {})[name] = ((acc[k] || {})[name] || 0) + n; } };
  return { phase, acc: {} }; })() : null;
const booted = host.boot();
if (COV) await COV.phase('boot', COV.acc);
await new Promise(r => setTimeout(r, WAIT_MS));
if (COV) await COV.phase('wait', COV.acc);
if (MODE === 'record') writeFileSync(A1, JSON.stringify(cache));

/* the serializer: every field, exact numbers (shortest round-trip text), NaN / Infinity / -0 / undefined kept distinct */
q(`globalThis.__SER=function(x){ var seen=[]; function s(v,d){ if(v===undefined) return 'u'; if(v===null) return 'n'; var t=typeof v;
    if(t==='number') return Object.is(v,-0)?'-0':String(v); if(t==='string') return JSON.stringify(v); if(t==='boolean') return v?'T':'F'; if(t==='function') return 'fn'; if(t==='bigint') return v+'n';
    if(d>8) return '…'; if(seen.indexOf(v)>=0) return 'cyc'; seen.push(v); var o;
    if(Array.isArray(v)) o='['+v.map(function(e){ return s(e,d+1); }).join(',')+']';
    else { var k=Object.keys(v).sort(); o='{'+k.map(function(kk){ var e; try{ e=v[kk]; }catch(_){ e='<throws>'; } return JSON.stringify(kk)+':'+s(e,d+1); }).join(',')+'}'; }
    seen.pop(); return o; } return s(x,0); };
  globalThis.__HASH=function(str){ var h1=0xdeadbeef, h2=0x41c6ce57; for(var i=0;i<str.length;i++){ var ch=str.charCodeAt(i); h1=Math.imul(h1^ch,2654435761); h2=Math.imul(h2^ch,1597334677); }
    h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909); h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909); return (h2>>>0).toString(36)+(h1>>>0).toString(36); };`);
const out = { path: which, booted: { ran: booted.ran, of: booted.of, failed: booted.failed }, issues: {} };
const PF = join(dirname(fileURLToPath(import.meta.url)), 'places60.json');
if (!existsSync(PF)) { /* the 60 fixed places: every unit sorted by province then key, one taken at even steps (written once, then fixed) */
  const U = JSON.parse(q(`JSON.stringify(AGN.selfcheck.units().map(function(p){ return [p.province||'', p.key]; }))`)).sort((x, y) => (x[0] + '|' + x[1]).localeCompare(y[0] + '|' + y[1]));
  const pick = []; for (let i = 0; i < 60; i++) pick.push(U[Math.floor((i + 0.5) * U.length / 60)][1]);
  writeFileSync(PF, JSON.stringify(pick, null, 0)); }
const PLACES = JSON.parse(readFileSync(PF, 'utf8'));
ctx.__NOENG = process.env.IDENT_ENGINE === '0'; ctx.__PLACES = PLACES; ctx.__ONLY = process.env.IDENT_UNITS === 'places';   /* the 60 places only (quick runs while searching) */
for (const D of ISSUES) {
  const { series, now } = issueSeries(D); ctx.__NOW = now; ctx.__FC = series;
  const inj = q(`(function(){ var n=0; AGN.selfcheck.units().forEach(function(p){ var s=__FC[p.uid]; var r=DISTRICT_IN[p.key]; if(!s||!r) return; r.fc72=s; r.fcUpdatedAt=Date.now(); r.weatherLive=true; r.fcSource='archive-replay'; n++; }); return n; })()`);
  const res = JSON.parse(q(`(function(){ var U=AGN.selfcheck.units(), LY=AGN.selfcheck.layers(), D0=AGN.day, g=D0.get, b=D0.basis, all={}, full={}, P={};
    __PLACES.forEach(function(k){ P[k]=1; }); if(__ONLY) U=U.filter(function(p){ return P[p.key]||P[p.uid]; });
    try{ for(var d=0; d<=${MAXD}; d++){ D0.get=function(){ return d; }; D0.basis=function(){ return 'peak'; };
      LY.forEach(function(hz){ var cap=(d===0)||hzDayCapable(hz);
        U.forEach(function(p){ var u=cap?AGN.selfcheck.unitOn(hz,p):{lv:'not-day-capable'}; var sc=(u.r&&u.lv>=0)?(u.r.score!=null?u.r.score:u.r.mapValue):null;
          var rs=__SER(u.r), is=__SER(u.inp), id=p.uid||p.key, cell=hz+'@'+d;
          (all[id]=all[id]||{})[cell]=[u.lv, sc==null?null:Math.round(sc*10)/10, rs.length+':'+__HASH(rs), is.length+':'+__HASH(is)];
          if(P[p.key]||P[id]) (full[id]=full[id]||{})[cell]={lv:u.lv, r:(rs.length<=6000?rs:'#'+rs.length+':'+__HASH(rs)), inp:is.length+':'+__HASH(is)}; }); }); } } finally { D0.get=g; D0.basis=b; }
    var eng=null; if(__NOENG) eng='skipped'; else try{ eng=AGN.engine.derive(); delete eng.at; delete eng.ms; eng=__SER(eng); }catch(e){ eng='derive threw: '+(e&&e.message); }
    var alerts=null; try{ alerts=__SER(activeAlerts()); }catch(e){ alerts='threw '+e.message; }
    return JSON.stringify({units:U.length, layers:LY, all:all, full:full, engine:eng, alerts:alerts, at:new Date().toISOString()}); })()`
    .replace('__HASH(rs)', '__HASH(rs)').replace('__HASH(is)', '__HASH(is)')));
  res.injected = inj; out.issues[RAINX !== 1 ? D + 'x' + RAINX : D] = res;
  if (MODE === 'record') writeFileSync(A1, JSON.stringify(cache));
  console.log(which, D, 'injected', inj, 'units', res.units);
}
if (COV) { await COV.phase('derive', COV.acc); writeFileSync(process.env.IDENT_COVERAGE, JSON.stringify(COV.acc)); }
out.misses = [...misses].sort();
if (MODE === 'record') { writeFileSync(A1, JSON.stringify(cache)); console.log('recorded', Object.keys(cache).length, 'answers'); }
else writeFileSync(A3, JSON.stringify(out));
process.exit(0);

function compare(fa, fb, md) {
  const load = (f) => { const parts = f.split(',').map(x => JSON.parse(readFileSync(x, 'utf8'))); const o = { issues: {}, misses: [] };
    for (const p of parts) { Object.assign(o.issues, p.issues); o.misses.push(...p.misses); } return o; };
  const a = load(fa), b = load(fb);
  const PLACES = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'places60.json'), 'utf8'));
  let cells = 0, diff = 0, fullCells = 0, fullDiff = 0; const ex = [], perPlace = {}, perLayer = {};
  for (const D of Object.keys(a.issues)) {
    const A = a.issues[D], B = b.issues[D]; if (!B) { diff++; ex.push(D + ': missing in b'); continue; }
    for (const u of new Set([...Object.keys(A.all), ...Object.keys(B.all)])) for (const c of new Set([...Object.keys(A.all[u] || {}), ...Object.keys(B.all[u] || {})])) {
      cells++; const x = JSON.stringify((A.all[u] || {})[c]), y = JSON.stringify((B.all[u] || {})[c]);
      const L = c.split('@')[0]; perLayer[L] = perLayer[L] || { cells: 0, diff: 0 }; perLayer[L].cells++;
      if (x !== y) { diff++; perLayer[L].diff++; if (ex.length < 40) ex.push(D + ' ' + u + ' ' + c + ': ' + x + ' vs ' + y); } }
    for (const u of Object.keys(A.full)) { const p = perPlace[u] = perPlace[u] || { cells: 0, diff: 0, levels: {} };
      for (const c of Object.keys(A.full[u])) { fullCells++; p.cells++; const x = A.full[u][c], y = (B.full[u] || {})[c];
        const lv = x.lv; p.levels[lv] = (p.levels[lv] || 0) + 1;
        if (!y || x.lv !== y.lv || x.r !== y.r || x.inp !== y.inp) { fullDiff++; p.diff++; if (ex.length < 40) ex.push(D + ' FULL ' + u + ' ' + c); } } }
    if (A.engine !== B.engine) { diff++; ex.push(D + ' served engine record differs (' + A.engine.length + ' vs ' + (B.engine || '').length + ' chars)'); }
    if (A.alerts !== B.alerts) { diff++; ex.push(D + ' alert list differs'); }
  }
  const res = { cells, diff, fullCells, fullDiff, places: Object.keys(perPlace).length, examples: ex, perLayer, misses: [a.misses.length, b.misses.length] };
  console.log(JSON.stringify(res));
  if (md) {
    const rows = Object.entries(perPlace).map(([u, p]) => '| ' + u + ' | ' + p.cells + ' | ' + p.diff + ' | ' + Object.entries(p.levels).sort().map(([k, v]) => k + ':' + v).join(' ') + ' |');
    writeFileSync(md, JSON.stringify(res) + '\n' + rows.join('\n') + '\n');
  }
}
