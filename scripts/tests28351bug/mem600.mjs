/* v91.17.283.51 · memory: 600 DISTINCT places answered in a row (GET /api/place/answer, customer view: the place bundle, the point record,
   the corrected forecast, the report context, guidance) keep the heap flat. The server runs with --expose-gc and the deterministic mock
   provider (scripts/tests283/lib/mockprovider.mjs: no paid calls); the heap is read after a collection (GET /api/loop?gc=1) after a
   warm-up of 40 places and then every 50 places. Pass: heap after 600 places < heap after warm-up + 300 MB.
   usage: node mem600.mjs <base> <points626.json> [n=600] [reports=0]   (reports=1 also makes a site report for every 5th place) */
import { readFileSync } from 'node:fs';
const [B, PF] = process.argv.slice(2), N = Number(process.argv[4] || 600), REP = process.argv[5] === '1';
const all = JSON.parse(readFileSync(PF, 'utf8')).filter((p) => p.set !== 'standard' && p.set !== 'quiet');
/* 40 warm-up places + N distinct places: the tehsil points, then the same points moved 3 km north (a distinct place, still inside) */
const pts = []; for (let k = 0; pts.length < 40 + N; k++) for (const p of all) { if (pts.length >= 40 + N) break; pts.push({ id: p.id + (k ? '+' + k : ''), lat: +(p.lat + k * 0.027).toFixed(5), lon: p.lon }); }
const heap = async () => { const j = await (await fetch(B + '/api/loop?gc=1')).json(); return j.heapMB; };
const ask = async (p) => { const r = await fetch(B + '/api/place/answer?lat=' + p.lat + '&lon=' + p.lon, { headers: { 'x-agn-view': 'customer' }, signal: AbortSignal.timeout(300000) }).catch(() => null); if (r) await r.arrayBuffer();
  if (REP) { const i = pts.indexOf(p); if (i % 5 === 0) { const g = await fetch(B + '/api/report/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agn-view': 'customer' }, body: JSON.stringify({ lat: p.lat, lon: p.lon, kind: 'site_assessment' }) }).catch(() => null); if (g) await g.arrayBuffer(); } }
  return r ? r.status : 0; };
let next = 0; const run = async (to) => { await Promise.all([0, 1].map(async () => { while (next < to) { const p = pts[next++]; await ask(p); } })); };
await run(40); const h0 = await heap(); const series = [[40, h0]]; console.log('after warm-up (40 places): heap ' + h0 + ' MB');
for (let n = 90; n <= 40 + N; n += 50) { await run(Math.min(n, 40 + N)); const h = await heap(); series.push([Math.min(n, 40 + N), h]); console.log((Math.min(n, 40 + N) - 40) + ' new places: heap ' + h + ' MB'); }
const last = series[series.length - 1][1], grow = last - h0;
console.log(JSON.stringify({ series, growMB: grow, perPlaceMB: Math.round(grow / N * 100) / 100 }));
console.log('mem600: ' + (grow < 300 ? 'PASS' : 'FAIL') + ' (heap +' + grow + ' MB after ' + N + ' new places)'); process.exit(grow < 300 ? 0 : 1);
