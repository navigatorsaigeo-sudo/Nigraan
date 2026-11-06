import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.109 · an early-ending zone member is carried, not dropped.  node scripts/tests109/v109.test.mjs (server running) */
import { readFileSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); } };
const ROOT = (__T.ROOT + '/');
const { carryMembers } = await import(ROOT + 'server/api/verification.mjs');
/* synthetic: three members, the third 2 C warmer with its own diurnal departure, ending at 108 h */
const n = 200, a = [], b = [], c = [];
for (let i = 0; i < n; i++) { const d = 10 + 5 * Math.sin(2 * Math.PI * i / 24); a.push(d); b.push(d + 1); c.push(i <= 108 ? d + 2 + 0.5 * Math.sin(2 * Math.PI * i / 24) : null); }
const P = carryMembers([a, b, c]);
const want = (i) => (a[i] + b[i]) / 2 + (2 - 0.5) + 0.5 * Math.sin(2 * Math.PI * i / 24);
ok(P[2].every(x => x != null) && [120, 150, 199].every(i => Math.abs(P[2][i] - want(i)) < 0.11), 'the ending member continues as the others plus its own hour-of-day departure');
ok(JSON.stringify(P[0]) === JSON.stringify(a) && P[2].slice(0, 109).every((x, i) => x === c[i]), 'members and hours that exist are untouched');
const short = carryMembers([a, b, c.map((x, i) => i <= 30 ? x : null)]);
ok(short[2][100] == null, 'a member with under 48 h of overlap is not carried');
/* served: a mountain point 8 days out keeps the zone basis without a step when the third member ends */
const r = await fetch(BASE + '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=35.297&longitude=75.633&hourly=temperature_2m&forecast_days=8&timezone=GMT&models=best_match&__nonat=1&__nolive=1');
const j = await r.json(); const L = Array.isArray(j) ? j[0] : j; const T = L.hourly.temperature_2m;
ok(L.agn_temperature_basis && /meteofrance/.test(L.agn_temperature_basis.model) && T.slice(100, 190).every(x => x != null), 'Skardu 8-day series on the zone basis, complete past the member\'s end');
const R6 = JSON.parse(readFileSync(ROOT + '../station-lake/audit108/t6_carry.json', 'utf8'));
const g = (z, L, m) => (R6.find(x => x.zone === z && x.L === L && x.mode === m) || {}).mae;
ok(g('hills', 5, 'full_carry') < g('hills', 5, 'full_nocarry') && g('mountain', 5, 'full_carry') < g('mountain', 5, 'full_nocarry') && g('mountain', 1, 'full_carry') === g('mountain', 1, 'full_nocarry'),
   'replay: carrying improves day 5 (hills ' + g('hills', 5, 'full_nocarry') + ' -> ' + g('hills', 5, 'full_carry') + ', mountain ' + g('mountain', 5, 'full_nocarry') + ' -> ' + g('mountain', 5, 'full_carry') + ') and leaves day 1 unchanged');
console.log((fails ? 'FAIL' : 'PASS') + ' v109: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
