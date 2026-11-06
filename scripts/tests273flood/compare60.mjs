import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.273 FLOOD · 60-place served comparison: the same requests to the base tree (v91.17.272 integ) and this tree, both offline
   on the same data copy; answers compared after removing clock fields. Only the stated change may differ (once-per-issue hazards
   present on days 1-3, marked held).  node compare60.mjs <baseOrigin> <newOrigin> <out.json> */
import { readFileSync, writeFileSync } from 'node:fs';
const [A, B, OUT] = process.argv.slice(2);
const ROOT = (__T.ROOT + '/');
const T = JSON.parse(readFileSync(ROOT + 'data/pk-tehsils.json', 'utf8')).features.map(f => f.properties).filter(p => !/Occupied/.test(p.province || ''));
/* each tehsil's served forecast point (data/archive/forecast) for the point requests */
const { gunzipSync } = await import('node:zlib'); const LL = {};
for (const f of ['fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz']) { try { for (const l of gunzipSync(readFileSync(ROOT + 'data/archive/forecast/' + f)).toString().split('\n')) { if (!l) continue; try { const r = JSON.parse(l); LL[r.u] = [r.lat, r.lon]; } catch (_) {} } } catch (_) {} }
for (const p of T) if (LL[p.uid]) { p.lat = LL[p.uid][0]; p.lon = LL[p.uid][1]; }
const step = Math.floor(T.length / 60), places = []; for (let i = 0; i < 60; i++) places.push(T[i * step]);
const CLOCK = /^(at|received|stale|ms|time|generatedAt|now|served|asOf|ageH|ageMin|fetchedAt|computedAt|t|iss|lastRunAt|issuedAt|uptimeS|cachedAt)$/;
const clean = (x) => Array.isArray(x) ? x.map(clean) : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).filter(([k]) => !CLOCK.test(k)).map(([k, v]) => [k, clean(v)])) : x;
const get = async (o, p, h) => { try { const r = await fetch(o + p, { headers: h || {}, signal: AbortSignal.timeout(60000) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = t.slice(0, 200); } return { s: r.status, j: clean(j) }; } catch (e) { return { s: 0, j: String(e.message) }; } };
const reqs = [];
for (const p of places) {
  reqs.push(['/api/levels/unit?unit=' + encodeURIComponent(p.uid), { 'x-agn-view': 'customer' }]);
  reqs.push(['/api/levels/unit?unit=' + encodeURIComponent(p.uid), {}]);
  reqs.push(['/api/flood/point?lat=' + p.lat + '&lon=' + p.lon, {}]);
  reqs.push(['/api/landslide/odds?unit=' + encodeURIComponent(p.uid), {}]);
  reqs.push(['/api/site/screening?lat=' + p.lat + '&lon=' + p.lon, { 'x-agn-view': 'customer' }]);
}
for (const L of ['rain_hz', 'heat', 'flood', 'flood_pluvial', 'flood_riverine', 'landslide', 'glof', 'drought', 'nss_baseline', 'nss_dynamic']) for (const d of [0, 1, 2, 3]) reqs.push(['/api/levels?layer=' + L + '&day=' + d, { 'x-agn-view': 'customer' }]);
reqs.push(['/api/levels?day=2', { 'x-agn-view': 'customer' }], ['/api/alerts', {}], ['/api/verdicts', {}], ['/api/landslide/calibration', {}], ['/api/flood/status', {}]);
/* the stated change, removed: held layers (and their names in the day list) out of the new answer; a held-layer level request on
   days 1-3 (base: "not derived") is listed apart */
const HELD = new Set(['flood_riverine', 'glof', 'drought', 'nss_baseline', 'nss_dynamic']);
const unstate = (j, p) => { if (!j || typeof j !== 'object') return j; const c = JSON.parse(JSON.stringify(j));
  if (Array.isArray(c.days)) c.days.forEach(d => { if (d.day > 0 && Array.isArray(d.layers)) d.layers = d.layers.filter(k => !HELD.has(k));
    if (d.day > 0 && d.layers && !Array.isArray(d.layers)) for (const k of Object.keys(d.layers)) if (d.layers[k] && d.layers[k].held) delete d.layers[k]; });
  if (/\/api\/levels\?day=[1-3]$/.test(p) && c.layers) for (const k of HELD) delete c.layers[k];
  return c; };
const heldReq = (p) => { const m = p.match(/\/api\/levels\?layer=(\w+)&day=([1-3])/); return !!(m && HELD.has(m[1])); };
let residual = 0, heldNew = 0; const residualPaths = [];
const rows = []; let same = 0, diff = 0;
for (const [p, h] of reqs) { const a = await get(A, p, h), b = await get(B, p, h); const eq = a.s === b.s && JSON.stringify(a.j) === JSON.stringify(b.j);
  if (!eq) { if (heldReq(p)) heldNew++; else if (!(a.s === b.s && JSON.stringify(a.j) === JSON.stringify(unstate(b.j, p)))) { residual++; residualPaths.push(p); } }
  if (eq) same++; else { diff++; rows.push({ path: p, view: h['x-agn-view'] || 'operator', base: { s: a.s, j: JSON.stringify(a.j).slice(0, 600) }, new: { s: b.s, j: JSON.stringify(b.j).slice(0, 600) } }); } }
/* classify each difference: is it only the stated change? */
const stated = (r) => /\/api\/levels(\/unit)?\?/.test(r.path);
const out = { places: places.length, requests: reqs.length, identical: same, differ: diff, heldLayerRequestsNowAnswered: heldNew, differAfterRemovingStatedChange: residual, residualPaths, differOutsideStatedChange: rows.filter(r => !stated(r)).map(r => r.path), diffs: rows };
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`places ${places.length}, requests ${reqs.length}: identical ${same}, differ ${diff}; held-layer day 1-3 requests now answered ${heldNew}; differ after removing the stated change: ${residual}`, residualPaths.slice(0, 5));
const byKind = {}; for (const r of rows) { const k = r.path.replace(/\?.*$/, '') + ' ' + r.view; byKind[k] = (byKind[k] || 0) + 1; } console.log(byKind);
