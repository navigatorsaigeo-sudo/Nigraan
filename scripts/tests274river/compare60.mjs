import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.274 RIVER · 60-place served comparison (from tests273flood/compare60.mjs): the same requests to the base tree (v91.17.273
   integ) and this tree, both offline on equal data copies; clock fields removed. Stated change: /api/flood/status carries riverCal;
   the gauge panel (/api/flood/gauges) may differ only by the operator modelEq/modelSwitch fields and, past a gauge's switch age,
   the switched gauges.  node compare60.mjs <baseOrigin> <newOrigin> <out.json> */
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
reqs.push(['/api/levels?day=2', { 'x-agn-view': 'customer' }], ['/api/alerts', {}], ['/api/verdicts', {}], ['/api/landslide/calibration', {}], ['/api/flood/status', {}],
  ['/api/flood/gauges', {}], ['/api/flood/gauges', { 'x-agn-view': 'customer' }], ['/api/flood/national?day=0', {}], ['/api/flood/national?day=0', { 'x-agn-view': 'customer' }]);
/* the stated change, removed: riverCal in the status; modelEq / modelSwitch / switched gauges in the panel */
const unstate = (j, p) => { if (!j || typeof j !== 'object') return j; const c = JSON.parse(JSON.stringify(j));
  if (p === '/api/flood/status') delete c.riverCal;
  if (p === '/api/flood/gauges') { delete c.modelSwitch; (c.gauges || []).forEach(g => { delete g.modelEq; }); }
  return c; };
const rows = []; let same = 0, diff = 0, residual = 0; const residualPaths = [];
for (const [p, h] of reqs) { const a = await get(A, p, h), b = await get(B, p, h); const eq = a.s === b.s && JSON.stringify(a.j) === JSON.stringify(b.j);
  if (eq) same++; else { diff++; rows.push({ path: p, view: h['x-agn-view'] || 'operator', base: { s: a.s, j: JSON.stringify(a.j).slice(0, 600) }, new: { s: b.s, j: JSON.stringify(b.j).slice(0, 600) } });
    if (!(a.s === b.s && JSON.stringify(a.j) === JSON.stringify(unstate(b.j, p)))) { residual++; residualPaths.push(p); } } }
const out = { places: places.length, requests: reqs.length, identical: same, differ: diff, differAfterRemovingStatedChange: residual, residualPaths, diffs: rows };
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`places ${places.length}, requests ${reqs.length}: identical ${same}, differ ${diff}; differ after removing the stated change: ${residual}`, residualPaths.slice(0, 8));
const byKind = {}; for (const r of rows) { const k = r.path.replace(/\?.*$/, '') + ' ' + r.view; byKind[k] = (byKind[k] || 0) + 1; } console.log(byKind);
