import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.275 HAZ2 · 60-place served comparison: the same requests to the base tree (v91.17.273 integ_fix code, same data) and this
   tree, both offline; answers compared after removing clock fields. Only the stated changes may differ: GLOF (SUPARCO register, words,
   tier words, credit), the fault layer (503 -> 200), the Sources page (GEM entry, SUPARCO credit) and the GLOF row / credit lines of
   site screening. node compare60.mjs <baseOrigin> <newOrigin> <out.json> */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const [A, B, OUT] = process.argv.slice(2);
const ROOT = (__T.ROOT + '/');
const T = JSON.parse(readFileSync(ROOT + 'data/pk-tehsils.json', 'utf8')).features.map(f => f.properties).filter(p => !/Occupied/.test(p.province || ''));
const LL = {};
for (const f of ['fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz']) { try { for (const l of gunzipSync(readFileSync(ROOT + 'data/archive/forecast/' + f)).toString().split('\n')) { if (!l) continue; try { const r = JSON.parse(l); LL[r.u] = [r.lat, r.lon]; } catch (_) {} } } catch (_) {} }
for (const p of T) if (LL[p.uid]) { p.lat = LL[p.uid][0]; p.lon = LL[p.uid][1]; }
const step = Math.floor(T.length / 60), places = []; for (let i = 0; i < 60; i++) places.push(T[i * step]);
const CLOCK = /^(at|received|stale|ms|time|generatedAt|now|served|asOf|ageH|ageMin|fetchedAt|computedAt|t|iss|lastRunAt|issuedAt|uptimeS|cachedAt|builtAt|ageDays)$/;
const clean = (x) => Array.isArray(x) ? x.map(clean) : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).filter(([k]) => !CLOCK.test(k)).map(([k, v]) => [k, clean(v)])) : x;
const get = async (o, p, h) => { try { const r = await fetch(o + p, { headers: h || {}, signal: AbortSignal.timeout(120000) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = t.slice(0, 200); } return { s: r.status, j: clean(j) }; } catch (e) { return { s: 0, j: String(e.message) }; } };
const reqs = [];
for (const p of places) {
  reqs.push(['/api/levels/unit?unit=' + encodeURIComponent(p.uid), { 'x-agn-view': 'customer' }]);
  reqs.push(['/api/flood/point?lat=' + p.lat + '&lon=' + p.lon, {}]);
  reqs.push(['/api/landslide/odds?unit=' + encodeURIComponent(p.uid), {}]);
  reqs.push(['/api/site/screening?lat=' + p.lat + '&lon=' + p.lon, { 'x-agn-view': 'customer' }]);
  reqs.push(['/api/glof/upstream?lat=' + p.lat + '&lon=' + p.lon, { 'x-agn-view': 'customer' }]);
  reqs.push(['/api/faults/nearest?lat=' + p.lat + '&lon=' + p.lon, {}]);
}
for (const L of ['rain_hz', 'heat', 'cold', 'wind', 'flood', 'landslide', 'glof', 'drought']) for (const d of [0, 1]) reqs.push(['/api/levels?layer=' + L + '&day=' + d, { 'x-agn-view': 'customer' }]);
reqs.push(['/api/glof/national?force=1', {}], ['/api/glof/map', {}], ['/api/sources', {}], ['/api/alerts', {}], ['/api/verdicts', {}], ['/api/flood/status', {}]);
/* the stated change, removed: GLOF words / tier words / SUPARCO fields / sentences; the site-screening GLOF row and credit text */
const GLOFKEYS = /^(word|words|countsWord|registerVersion|tierLabel|areaSource|areaRegisterKm2|basis|text|ladder|levels|credit|rules|statement|physics|counts|class|level|index|E|lakes|contribution|lakesInTehsil|signal|named|anchorClass|priority|watch|elevated|expanding|growing|physical|more|inventory|sources|attribution|license)$/;
const strip = (x, re) => Array.isArray(x) ? x.map(y => strip(y, re)) : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).filter(([k]) => !re.test(k)).map(([k, v]) => [k, strip(v, re)])) : x;
const unstate = (p, j) => {
  if (!j || typeof j !== 'object') return j;
  if (/\/api\/site\/screening/.test(p)) { const c = JSON.parse(JSON.stringify(j)); const walk = (o) => { if (Array.isArray(o)) return o.filter(r => !(r && (r.parameter === 'Glacial lake outburst flood (GLOF)' || r.parameter === 'Nearest active fault'))).map(walk); if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = walk(o[k]); } return o; }; return walk(c); }
  return j; };
const STATED = (p) => /\/api\/(glof|faults|sources)/.test(p);
const rows = []; let same = 0, diff = 0, residual = 0; const residualPaths = [], byKind = {};
for (const [p, h] of reqs) {
  const a = await get(A, p, h), b = await get(B, p, h); const eq = a.s === b.s && JSON.stringify(a.j) === JSON.stringify(b.j);
  if (eq) { same++; continue; } diff++;
  const k = p.replace(/\?.*$/, ''); byKind[k] = (byKind[k] || 0) + 1;
  const stated = STATED(p) || (a.s === b.s && JSON.stringify(unstate(p, a.j)) === JSON.stringify(unstate(p, b.j)));
  if (!stated) { residual++; residualPaths.push(p); }
  rows.push({ path: p, stated, base: { s: a.s, j: JSON.stringify(a.j).slice(0, 500) }, new: { s: b.s, j: JSON.stringify(b.j).slice(0, 500) } });
}
/* GLOF national: which tehsils changed ladder code, and did any five-word level change */
const gA = await get(A, '/api/glof/national?force=1'), gB = await get(B, '/api/glof/national?force=1');
const WORD = { Low: 'Normal', Monitor: 'Normal', Watch: 'High', Act: 'Severe' };
const codeChanged = [], wordChanged = [];
for (const [u, x] of Object.entries((gA.j && gA.j.units) || {})) { const y = ((gB.j && gB.j.units) || {})[u] || {}; if (x.class !== y.class) codeChanged.push(u + ': ' + x.class + ' -> ' + y.class); if ((WORD[x.class] || null) !== (y.word || null) && x.applicable) wordChanged.push(u + ': ' + WORD[x.class] + ' -> ' + y.word); }
const out = { places: places.length, requests: reqs.length, identical: same, differ: diff, differOutsideStatedChange: residual, residualPaths, byKind,
  glof: { countsBase: gA.j && gA.j.counts, countsNew: gB.j && gB.j.counts, ladderCodeChanged: codeChanged, fiveWordLevelChanged: wordChanged }, diffs: rows };
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`places ${places.length}, requests ${reqs.length}: identical ${same}, differ ${diff}; differ outside the stated change: ${residual}`, residualPaths.slice(0, 5));
console.log(byKind); console.log('GLOF ladder code changed:', codeChanged); console.log('GLOF five-word level changed:', wordChanged);
