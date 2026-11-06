/* v91.17.236 · the shared Pakistan-day helper returns exactly what the six inline copies returned. usage: node scripts/tests236/pktday.test.mjs */
import { pktDay } from '../../server/api/pktday.mjs';
const orig = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);
let bad = 0, n = 0; const t0 = Date.UTC(1990, 0, 1), t1 = Date.UTC(2040, 0, 1);
const probe = (ms) => { n++; let a, b, ea = null, eb = null; try { a = orig(ms); } catch (e) { ea = e.constructor.name; } try { b = pktDay(ms); } catch (e) { eb = e.constructor.name; } if (a !== b || ea !== eb) { bad++; if (bad < 5) console.log('DIFF', ms, a, b, ea, eb); } };
for (let ms = t0; ms < t1; ms += 3600e3 * 7 + 1234.5) probe(ms);
for (let d = t0; d < t1; d += 864e5) for (const o of [-18e6 - 1, -18e6, -18e6 + 1, 0, 1]) probe(d + o);
for (const v of [NaN, Infinity, -Infinity, -1, 0, -864e5 * 400, '2026-10-10', null, undefined, 8.64e15, 8.64e15 + 1]) probe(v);
for (let i = 0; i < 200000; i++) probe(t0 + Math.random() * (t1 - t0));
console.log(`${bad ? 'FAIL' : 'PASS'} pktday: ${n} times, ${bad} differ`); process.exit(bad ? 1 : 0);
