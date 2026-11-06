/* v91.17.283.38 item 1 · the sunrise / sunset search of dayext.mjs dayNight() (the largest self time of a busy server) gives the same answer
   as the v283.37 full minute scan (its copy in dayext38/dayext37.mjs) on 30,000 points and dates over Pakistan-administered territory
   (23.5-37.2 N, 60.8-77.9 E, every day of a year and 12 random ones), and is faster. usage: node scripts/tests28338/dayext38.test.mjs */
import { dayNight as NEW } from '../../server/api/dayext.mjs';
import { dayNight as OLD } from './dayext38/dayext37.mjs';
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + JSON.stringify(i).slice(0, 300) : '')); } };
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const dates = []; for (let d = 0; d < 366; d++) dates.push(new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10));
const cases = []; for (let i = 0; i < 30000; i++) cases.push([23.5 + rnd() * 13.7, 60.8 + rnd() * 17.1, dates[Math.floor(rnd() * dates.length)]]);
let tO = 0, tN = 0, diff = 0, first = null;
for (const [la, lo, d] of cases) { let t = performance.now(); const a = OLD(la, lo, d); tO += performance.now() - t; t = performance.now(); const b = NEW(la, lo, d); tN += performance.now() - t;
  if (JSON.stringify(a) !== JSON.stringify(b)) { diff++; if (!first) first = { la, lo, d, a, b }; } }
ok(diff === 0, '30,000 points and dates: identical day / night hours, sunrise and sunset (' + diff + ' differ)', first);
console.log('time: v283.37 ' + Math.round(tO) + ' ms, this build ' + Math.round(tN) + ' ms');
ok(tN < tO / 3, 'at least 3 times faster (' + (tO / tN).toFixed(1) + 'x)');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
