/* v91.17.283.33 · Part 2 · days 8-14 member shares (server/api/outlook.mjs week2Shares), no server: hand-made members against a known normal */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { week2Shares } = await import(join(ROOT, 'server', 'api', 'outlook.mjs'));
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const dates = Array.from({ length: 15 }, (_, k) => '2026-11-' + String(1 + k).padStart(2, '0'));
const norm = () => ({ tm: 20, pr: 2 });   /* normal mean 20 C, 2 mm a day -> 14 mm a week */
/* 10 members: member j has mean temperature 15 + j (so 6 of 10 above 20: j = 6..9 -> 21..24, j=5 -> 20 not above), rain j mm a day (week 7j: above 14 for j >= 3), a 16 mm day for j >= 8 */
const mk = (fn) => Array.from({ length: 10 }, (_, j) => Array.from({ length: 15 }, (_, k) => fn(j, k)));
const M = { tx: mk((j) => 15 + j + 5), tn: mk((j) => 15 + j - 5), pr: mk((j, k) => (j >= 8 && k === 10 ? 16 : j)), sn: mk(() => 0) };
const w = week2Shares(dates, M, norm);
ok(w.ready && w.from === '2026-11-09' && w.to === '2026-11-15', 'days 8-14 = leads 8..14', JSON.stringify(w));
ok(w.temp.hotterPct === 40 && w.temp.colderPct === 60 && w.temp.n === 10, 'hotter 40 % (members 21-24 C over a 20 C normal; equal is not hotter)', JSON.stringify(w.temp));
ok(w.rain.wetterPct === 70 && w.rain.drierPct === 30, 'wetter 70 % (weekly total above the 14 mm average)', JSON.stringify(w.rain));
ok(w.rain.heavyDayPct === 20, 'a day of 15.6 mm or more: 20 % (2 members)', JSON.stringify(w.rain));
const Msnow = { ...M, sn: mk((j, k) => (j >= 8 && k === 10 ? 14 : 0)) };   /* 14 cm snow = 20 mm water: the 16 mm day is snow, not rain */
ok(week2Shares(dates, Msnow, norm).rain.heavyDayPct === 0, 'snow water is not rain (liquid rain only)');
const Mgap = { ...M, tx: M.tx.map((r, j) => (j < 6 ? r.map((x, k) => (k === 12 ? null : x)) : r)) };
{ const g = week2Shares(dates, Mgap, norm); ok(g.ready && g.temp.to === dates[11] && g.temp.days === 4 && g.temp.n === 10 && g.rain.days === 7, 'v283.51 g1: fewer than half the members carry day 12: temperature over days 8-11 (all members), rain over 8-14', JSON.stringify(g)); }
{ const M14 = { ...M, tx: M.tx.map((r) => r.map((x, k) => (k === 14 ? null : x))), pr: M.pr.map((r) => r.map((x, k) => (k === 14 ? null : x))) }, g = week2Shares(dates, M14, norm);
  ok(g.ready && g.to === dates[13] && g.days === 6 && /stop before day 14/.test(g.shortNote || '') && g.temp.n === 10 && g.rain.n === 10, 'v283.51 g1 (live 3 Nov): no member carries day 14: days 8-13 assessed and named', JSON.stringify(g)); }
{ const M0 = { ...M, tx: M.tx.map((r) => r.map((x, k) => (k >= 8 ? null : x))), pr: M.pr.map((r) => r.map((x, k) => (k >= 8 ? null : x))) }; ok(/do not carry day 8/.test(week2Shares(dates, M0, norm).why || ''), 'no member carries day 8: not ready, plain reason'); }
ok(/1991-2020 normal/.test(week2Shares(dates, M, () => null).why || ''), 'no normal: not ready, says why');
{ const g = week2Shares(dates.slice(0, 13), M, norm); ok(g.ready && g.to === '2026-11-13' && g.days === 5 && /stop before day 14/.test(g.shortNote || ''), 'v283.51 g1: a short run: days 8-12 assessed, the window named', JSON.stringify(g)); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
