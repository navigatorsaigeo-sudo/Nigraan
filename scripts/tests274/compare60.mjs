import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.274 DROUGHT · 60-place served comparison: the same requests to the v273 integ tree and this tree, both offline on the same
   data copy; answers compared after removing clock fields. Stated changes only: drought units gain `dtype` (and lose the per-unit `outlook` while the outlook is hidden), the drought answer gains
   views.types, and views.outlook gains monthGate/stale and is hidden once its valid-to has passed (shown/why change with it).
   node compare60.mjs <baseOrigin> <newOrigin> <out.json> */
import { readFileSync, writeFileSync } from 'node:fs';
const [A, B, OUT] = process.argv.slice(2);
const ROOT = (__T.ROOT + '/');
const T = JSON.parse(readFileSync(ROOT + 'data/pk-tehsils.json', 'utf8')).features.map(f => f.properties).filter(p => !/Occupied/.test(p.province || ''));
const { gunzipSync } = await import('node:zlib'); const LL = {};
for (const f of ['fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz']) { try { for (const l of gunzipSync(readFileSync(ROOT + 'data/archive/forecast/' + f)).toString().split('\n')) { if (!l) continue; try { const r = JSON.parse(l); LL[r.u] = [r.lat, r.lon]; } catch (_) {} } } catch (_) {} }
for (const p of T) if (LL[p.uid]) { p.lat = LL[p.uid][0]; p.lon = LL[p.uid][1]; }
const step = Math.floor(T.length / 60), places = []; for (let i = 0; i < 60; i++) places.push(T[i * step]);
const CLOCK = /^(at|received|stale|ms|time|generatedAt|now|served|ageH|ageMin|fetchedAt|computedAt|t|iss|lastRunAt|issuedAt|uptimeS|cachedAt)$/;
const clean = (x) => Array.isArray(x) ? x.map(clean) : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).filter(([k]) => !CLOCK.test(k)).map(([k, v]) => [k, clean(v)])) : x;
const get = async (o, p, h) => { try { const r = await fetch(o + p, { headers: h || {}, signal: AbortSignal.timeout(60000) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = t.slice(0, 200); } return { s: r.status, j: clean(j) }; } catch (e) { return { s: 0, j: String(e.message) }; } };
const reqs = [];
for (const p of places) {
  reqs.push(['/api/levels/unit?unit=' + encodeURIComponent(p.uid), { 'x-agn-view': 'customer' }]);
  reqs.push(['/api/levels/unit?unit=' + encodeURIComponent(p.uid), {}]);
  reqs.push(['/api/flood/point?lat=' + p.lat + '&lon=' + p.lon, {}]);
  reqs.push(['/api/site/screening?lat=' + p.lat + '&lon=' + p.lon, { 'x-agn-view': 'customer' }]);
}
for (const d of [0, 1, 2, 3]) reqs.push(['/api/levels?layer=drought&day=' + d, { 'x-agn-view': 'customer' }]);
reqs.push(['/api/alerts', {}], ['/api/verdicts', {}]);
let same = 0, diff = 0; const rows = [];
for (const [p, h] of reqs) { const a = await get(A, p, h), b = await get(B, p, h); const eq = a.s === b.s && JSON.stringify(a.j) === JSON.stringify(b.j);
  if (eq) same++; else { diff++; rows.push({ path: p, view: h['x-agn-view'] || 'operator', base: JSON.stringify(a.j).slice(0, 400), new: JSON.stringify(b.j).slice(0, 400) }); } }
/* the drought answer, per place: everything except the stated additions must be equal */
const DA = (await get(A, '/api/climatology/drought')).j, DB = (await get(B, '/api/climatology/drought')).j;
const per = []; let dSame = 0;
for (const p of places) { const a = DA.spi && DA.spi[p.uid], b = DB.spi && DB.spi[p.uid]; const b0 = b ? { ...b } : b; if (b0) delete b0.dtype; const a0 = a ? { ...a } : a; if (a0 && !(DB.views && DB.views.outlook && DB.views.outlook.shown)) delete a0.outlook;
  const eq = JSON.stringify(a0) === JSON.stringify(b0); if (eq) dSame++;
  per.push({ uid: p.uid, sameExceptType: eq, level: a && a.drought && a.drought.class, levelNew: b && b.drought && b.drought.class, type: b && b.dtype && b.dtype.main, active: b && b.dtype && b.dtype.active }); }
const vA = { ...(DA.views || {}) }, vB = { ...(DB.views || {}) }; delete vB.types;
const oA = vA.outlook || {}, oB = vB.outlook || {}; const strip = (o) => { const c = { ...o }; for (const k of ['shown', 'why', 'monthGate', 'stale']) delete c[k]; return c; };
const viewsSame = JSON.stringify({ ...vA, outlook: strip(oA) }) === JSON.stringify({ ...vB, outlook: strip(oB) });
const out = { places: places.length, requests: reqs.length, identical: same, differ: diff, diffs: rows,
  drought: { placesSameExceptType: dSame, of: places.length, otherViewsSame: viewsSame, outlook: { base: { shown: oA.shown, validTo: oA.validTo }, new: { shown: oB.shown, validTo: oB.validTo, why: oB.why, monthGate: oB.monthGate && oB.monthGate.basis } }, per } };
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`places ${places.length}, requests ${reqs.length}: identical ${same}, differ ${diff}`, rows.slice(0, 3).map(r => r.path));
console.log(`drought per place identical except the added type: ${dSame}/${places.length}; other views identical: ${viewsSame}; outlook base shown ${oA.shown} -> new shown ${oB.shown} (${oB.why || ''})`);
const tc = {}; per.forEach(r => { const k = (r.levelNew || 'none') + ' / ' + (r.type || 'no type'); tc[k] = (tc[k] || 0) + 1; }); console.log(tc);
