#!/usr/bin/env node
/* v91.17.283.50 (1.0.10.1) · scheduler catch-up after a long gap (laptop sleep 3 Nov 06:05-09:29 PKT: every job started in the same second).
   The gap is made by blocking the event loop longer than NIGRAAN_CATCHUP_LATE_S (here 1 s): every job's tick then arrives late.
   Checks: (1) late ticks are queued, not started together: never two catch-up runs at once; (2) the order is light, sync, heavy, bulk, long
   (shorter period first in a class); (3) consecutive catch-up starts are at least the spacing apart; (4) bulk / long wait the defer
   time after the gap; (5) a job is queued once; (6) on time ticks run as before (no gap: started at once); (7) /api/ops/schedule data
   names the catch-up state. */
process.env.NIGRAAN_CATCHUP_LATE_S = '1'; process.env.NIGRAAN_CATCHUP_SPACING_S = '0.3'; process.env.NIGRAAN_CATCHUP_WAIT_S = '5'; process.env.NIGRAAN_CATCHUP_DEFER_MIN = String(1.5 / 60);
const { createScheduler } = await import('../../server/api/scheduler.mjs');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const S = createScheduler(); const log = []; let live = 0, maxLive = 0;
const job = (id, ms, heavy, dur = 150) => S.every(id, ms, async (why) => { live++; maxLive = Math.max(maxLive, live); log.push({ id, why, t: Date.now() }); await new Promise((r) => setTimeout(r, dur)); live--; }, { heavy });
/* (6) on time first */
const t0 = Date.now(); job('light-fast', 1000, null); job('light-slow', 1500, null); job('sync1', 1400, 'sync'); job('heavy1', 1300, true); job('bulk1', 1200, 'bulk'); job('long1', 1100, 'long');
await new Promise((r) => setTimeout(r, 1600));
const onTime = log.filter((x) => x.why === 'interval'); ok(onTime.length >= 3, 'on-time ticks did not run: ' + onTime.length);
ok(maxLive >= 2, 'on-time ticks were serialised (they should run as before): maxLive ' + maxLive);
/* the gap: block the loop 4 s (every timer comes due during it) */
await new Promise((r) => setTimeout(r, 300)); log.length = 0; maxLive = 0; const g0 = Date.now(); while (Date.now() - g0 < 4000) {} const gEnd = Date.now();
await new Promise((r) => setTimeout(r, 6500));
const L = S.list(), cu = L.catchup, runs = log.filter((x) => x.why === 'catchup');
ok(cu && cu.gaps >= 1, 'no gap counted: ' + JSON.stringify(cu));
const ids = runs.map((x) => x.id), firstSix = []; for (const i of ids) if (!firstSix.includes(i)) firstSix.push(i);
ok(firstSix.length === 6, 'not every job caught up once: ' + ids.join(','));
ok(JSON.stringify(firstSix) === JSON.stringify(['light-fast', 'light-slow', 'sync1', 'heavy1', 'bulk1', 'long1']), 'order ' + firstSix.join(','));
const cr = runs.slice(0, 6); let minGap = 1e9; for (let i = 1; i < cr.length; i++) minGap = Math.min(minGap, cr[i].t - cr[i - 1].t);
ok(minGap >= 300 + 150 - 30, 'catch-up starts closer than run + spacing: ' + minGap + ' ms');
const firstBulk = runs.find((x) => x.id === 'bulk1'); ok(firstBulk && firstBulk.t - gEnd >= 1400, 'bulk did not wait the defer time: ' + (firstBulk ? firstBulk.t - gEnd : 'none') + ' ms');
/* never two catch-up runs at once */
let overlap = false; for (let i = 1; i < cr.length; i++) if (cr[i].t < cr[i - 1].t + 150) overlap = true; ok(!overlap, 'two catch-up runs overlapped');
ok(L.jobs.every((j) => j.catchups >= 1), 'catchups per job not counted');
ok(cu.lastOrder.slice(0, 6).join(',') === firstSix.join(','), 'lastOrder not reported: ' + cu.lastOrder);
console.log('order', firstSix.join(' > '), '| min start gap', minGap, 'ms | bulk after gap', firstBulk && firstBulk.t - gEnd, 'ms');
console.log('\ncatchup50: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
