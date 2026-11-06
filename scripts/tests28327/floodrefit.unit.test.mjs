/* v91.17.283.27 . ITEM 2 · A REACH FIT REFUSED FOR TOO FEW YEARS IS ASKED AGAIN, offline (temp data folder, a fake provider):
     F1  the minimum is the estimator's own (gumbel(): fewer than FIT_MIN_N annual maxima is "a guess"), one constant: 19 maxima refused,
         20 fitted
     F2  data/flood.json as held (27 Oct 2026): every reach fitted on one year (the 1997-2026 request came back truncated) -> all listed as
         short fits; a fit refused for its SHAPE (CV, dry channel) is never retried
     F3  a retry that again answers a truncated history keeps the reach refused and records why: the days and years the request answered,
         the attempts (1, then 2); only the short reaches are asked (one call each), the others keep their fit
     F4  a retry that answers the full record fits the reach (ok, 29 years), and the retry record is gone; the file is written
     F5  the retry runs on a later run: at start (refitIfStale, when the estimator version is current) and with each forecast refresh
         (refreshIfOld), never on every 10-minute tick; no data is invented (no fit without the answered record)
   usage: node scripts/tests28327/floodrefit.unit.test.mjs */
import { mkdtempSync, readFileSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
process.env.MACH_OFFLINE = '1';   /* no background job in a test */
const FL = await import(pathToFileURL(join(API, 'flood.mjs')).href);
/* ── F1 ── */
{ const v = (n) => Array.from({ length: n }, (_, i) => 1000 + 37 * ((i * 7) % 11) + i);
  const a = FL.gumbel(v(FL.FIT_MIN_N - 1)), b = FL.gumbel(v(FL.FIT_MIN_N));
  ok(FL.FIT_MIN_N === 20 && a.ok === false && a.short === true && b.ok === true, 'F1 one minimum, the estimator\'s own: 19 annual maxima refused (short), 20 fitted', [a.why, b.ok]); }
const T = mkdtempSync(join(tmpdir(), 'fl27-'));
for (const f of ['flood.json', 'river-level-scale.json']) copyFileSync(join(ROOT, 'data', f), join(T, f));
/* the file as delivered: a server that already ran (a test server copy) may have added retry records; strip them */
{ const fj = JSON.parse(readFileSync(join(T, 'flood.json'), 'utf8')); for (const c of Object.values(fj.climate.points)) { delete c.retry; delete c.got; } delete fj.climate.retriedAt; writeFileSync(join(T, 'flood.json'), JSON.stringify(fj)); }
let mode = 'truncated'; const calls = [];
const series = (start, end) => { const t = [], q = []; for (let d = Date.parse(start + 'T00:00:00Z'); d <= Date.parse(end + 'T00:00:00Z'); d += 864e5) { const s = new Date(d).toISOString().slice(0, 10); t.push(s); const y = +s.slice(0, 4), doy = (d - Date.UTC(y, 0, 1)) / 864e5; q.push(800 + 600 * Math.exp(-((doy - 200) ** 2) / 800) * (1 + 0.35 * Math.sin(y * 1.7))); } return { time: t, river_discharge: q }; };
const provider = { configured: () => true, call: async (kind, path, p) => { calls.push(p.latitude); if (!p.start_date) throw new Error('not in this test');
  return [{ daily: mode === 'truncated' ? series('1997-01-01', '1998-06-30') : series(p.start_date, p.end_date) }]; } };
const F = FL.createFlood({ provider, contractDir: join(ROOT, 'server', 'contract'), units: { tehsil: [] } }, T);
/* ── F2 ── */
const C0 = F.climate(); const all = Object.keys(C0.points);
ok(all.length === 25 && F.shortFits().length === 25, 'F2a the held file: all 25 reach fits are short (n = 1)', { reaches: all.length, short: F.shortFits().length });
{ C0.points[all[0]] = { ...C0.points[all[0]], ok: false, refused: true, n: 30, why: 'a Gumbel fit is REFUSED for this reach: CV' };
  ok(!F.shortFits().includes(all[0]) && F.shortFits().length === 24, 'F2b a fit refused for its shape is not retried', F.shortFits().length); }
/* ── F3 ── */
{ const ids = F.shortFits().slice(0, 3); const r = await F.runClimate(true, ids);
  const P = F.climate().points; const x = P[ids[0]];
  ok(r.started && calls.length === 3 && x.ok === false && x.retry && x.retry.attempts === 1 && /answered 546 days \(1997-01-01 to 1998-06-30\), 1 complete year/.test(x.retry.why) && x.got && x.got.days === 546, 'F3a a truncated answer again: still refused, why records the days and years answered; one call per short reach only', { calls: calls.length, retry: x.retry });
  ok(JSON.stringify(P[all[0]]) === JSON.stringify(C0.points[all[0]]) && P[all[10]].n === 1 && !P[all[10]].retry, 'F3b the other reaches keep their record untouched');
  await F.runClimate(true, ids); ok(F.climate().points[ids[0]].retry.attempts === 2 && F.climate().points[ids[0]].retry.firstAt, 'F3c the attempts are counted', F.climate().points[ids[0]].retry); }
/* ── F4 ── */
{ mode = 'full'; const sh = F.shortFits(); const r = await F.runClimate(true, sh); const P = F.climate().points; const x = P[sh[0]];
  ok(r.started && x.ok === true && x.n >= 28 && !x.retry && F.shortFits().length === 0, 'F4a the full record answered: the reach is fitted and leaves the retry list', { n: x.n, short: F.shortFits().length });
  const disk = JSON.parse(readFileSync(join(T, 'flood.json'), 'utf8')); ok(disk.climate.points[sh[0]].ok === true && disk.climate.retriedAt, 'F4b the file is written with the new fit'); }
/* ── F5 ── */
{ const src = readFileSync(join(API, 'flood.mjs'), 'utf8');
  ok(/if \(!stale\) \{ const sh = shortFits\(\)\.filter\(retryDue\);/.test(src) && /else \{ const sh = shortFits\(\)\.filter\(retryDue\); if \(sh\.length\) \{ const r = await runClimate\(true, sh\)/.test(src), 'F5a the retry runs at start and with each forecast refresh (after the once-a-day early return), not every tick');
  const fat = Date.parse((JSON.parse(readFileSync(join(ROOT, 'data', 'flood.json'), 'utf8')).forecast || {}).at || '');
  const P = F.climate().points, id0 = all[1];
  P[id0] = { ...P[id0], ok: false, n: 1, retry: { attempts: 1, lastAt: new Date(fat - 3600e3).toISOString() } }; const due1 = F.retryDue(id0);
  P[id0].retry.lastAt = new Date(fat + 3600e3).toISOString(); const due2 = F.retryDue(id0);
  ok(Number.isFinite(fat) && due1 === true && due2 === false && F.retryDue(all[2]) === true, 'F5c one retry per forecast run: a reach last asked before the newest forecast is due, one asked after it waits for the next run', { fat: new Date(fat).toISOString(), due1, due2 });
  ok(/if \(n < FIT_MIN_N\)/.test(src) && !/n < 20\b/.test(src), 'F5b the fit and the retry rule read the one constant'); }
rmSync(T, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
