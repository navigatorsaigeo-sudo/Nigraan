/* v91.17.283.37 (NIGRAAN 1.0.1) · SERVER LOAD: the hazard grid build must not slow the pages' own requests beyond a stated margin.
   Baseline: GET /api/levels?day=0 and a cached GET /api/point (customer view), one of each every 250 ms for NIGRAAN_L37_S seconds (default
   40) with no build running; then a build is started (POST /api/hazardgrid/build, operator) and the same requests are timed while it runs.
   MARGIN (stated in BUILD_NOTES_37.md from the measurement): the median of each may rise by at most 100 ms and the 95th percentile by at most
   900 ms (the builder runs at a duty cycle of 0.35 of the CPU: a request that arrives while a chunk of 20 grid points is being computed waits
   for that chunk); every request must answer 200.
   usage: node scripts/tests28337/load37.test.mjs [base] */
import { T, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const SEC = +(process.env.NIGRAAN_L37_S || 40), P50 = 100, P95 = 900;
const U = { levels: '/api/levels?day=0', point: '/api/point?lat=33.68440&lon=73.04790' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
async function sample(sec) { const L = { levels: [], point: [] }, bad = []; const until = Date.now() + sec * 1000;
  while (Date.now() < until) { for (const k of Object.keys(U)) { const t = performance.now(); const r = await fetch(BASE + U[k], { headers: { 'x-agn-view': 'customer' } }).catch(() => null); if (r) await r.text(); if (!r || r.status !== 200) bad.push(k + ' ' + (r && r.status)); L[k].push(performance.now() - t); } await sleep(250); }
  return { L, bad, s: Object.fromEntries(Object.entries(L).map(([k, a]) => [k, { n: a.length, p50: q(a, 0.5), p95: q(a, 0.95), max: Math.round(Math.max(...a)) }])) }; }
const st = await (await fetch(BASE + '/api/hazardgrid/status')).json().catch(() => null);
ok(st && st.version, 'the hazard grid runs on this server', JSON.stringify(st).slice(0, 200));
let s0 = st; for (let i = 0; i < 240 && s0 && s0.building; i++) { await sleep(15000); s0 = await (await fetch(BASE + '/api/hazardgrid/status')).json().catch(() => null); }   /* no build during the baseline */
await fetch(BASE + U.point, { headers: { 'x-agn-view': 'customer' } }).then((r) => r.text());
const base = await sample(SEC);
const b = await fetch(BASE + '/api/hazardgrid/build', { method: 'POST' }); ok(b.status === 202, 'a build is started (POST /api/hazardgrid/build)', b.status);
await sleep(3000); const st1 = await (await fetch(BASE + '/api/hazardgrid/status')).json(); ok(st1.building, 'the build runs', JSON.stringify(st1.progress));
const during = await sample(SEC); const st2 = await (await fetch(BASE + '/api/hazardgrid/status')).json();
ok(st2.building || (st2.lastBuild && st2.lastBuild.points > 0), 'the build was running while the requests were timed', JSON.stringify(st2.progress || st2.lastBuild));
console.log('baseline ' + JSON.stringify(base.s)); console.log('during build ' + JSON.stringify(during.s));
for (const k of Object.keys(U)) { const a = base.s[k], c = during.s[k];
  ok(c.p50 - a.p50 <= P50, k + ': median within +' + P50 + ' ms during the build (' + a.p50 + ' -> ' + c.p50 + ' ms)', JSON.stringify({ a, c }));
  ok(c.p95 - a.p95 <= P95, k + ': 95th percentile within +' + P95 + ' ms during the build (' + a.p95 + ' -> ' + c.p95 + ' ms)', JSON.stringify({ a, c })); }
ok(base.bad.length === 0 && during.bad.length === 0, 'every request answered 200', base.bad.concat(during.bad).slice(0, 10).join(', '));
done();
