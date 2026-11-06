/* v91.17.283.28 . S7 · FEED HEALTH: A FEED PAST ITS OWN DECLARED CADENCE IS LATE / DOWN, THE CALL BUDGET IS A PROBLEM, offline:
     F1  a server feed with 3 good polls (no 95th percentile yet), declared period 1 h: 1.5 h old ok, 2.5 h old LATE, 3.5 h old DOWN,
         with the basis naming the declared cadence and its source (it was 'not assessed')
     F2  no good poll since the server started, declared 6 h: DOWN once start + 6 h + 6 h has passed; before 12 h LATE
     F3  a long measured history keeps its measured limits (the declared cadence is only the fall-back)
     F4  the provider feed: the budget is information only (owner 29 Oct 2026, overage allowed); no separate budget alert block
     F5  the server writes entries for quake, smapfeed, floodobs, glof, imerg and the ecmwf010 fetcher (agents.mjs serverFeeds)
   usage: node scripts/tests28328/feedhealth.unit.test.mjs */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const FH = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'feed_health.mjs')).href);
const H = 3600e3, now = Date.parse('2026-10-28T12:00:00Z');
const f = (lastAgoH, extra = {}) => ({ label: 'x', lastPoll: new Date(now - lastAgoH * H).toISOString(), lastError: null, everyMs: H, everyWhat: 'its schedule (test)', ...extra });
const ev = (lastAgoH) => [now - (lastAgoH + 2) * H, now - (lastAgoH + 1) * H, now - lastAgoH * H];
const st = (a) => FH.serverFeedStatus(f(a), null, ev(a), now, { awake: null });
const a = st(1.5), b = st(2.5), c = st(3.5);
ok(a.status === 'ok' && b.status === 'late' && c.status === 'down' && /declared cadence of the module \(60 min, its schedule \(test\)\)/.test(c.basis), 'F1 short history: the declared cadence gives ok / LATE / DOWN with its basis', [a.status, b.status, c.status, c.basis]);
{ const g = { label: 'y', lastPoll: null, lastError: null, everyMs: H, startedAt: new Date(now - 3.5 * H).toISOString() }, g2 = { ...g, startedAt: new Date(now - 2.5 * H).toISOString() };
  const x = FH.serverFeedStatus(g, null, [], now, { awake: null }), y = FH.serverFeedStatus(g2, null, [], now, { awake: null });
  ok(x.status === 'down' && y.status === 'late' && /no good poll since the server started/.test(x.basis), 'F2 never a good poll since the start: LATE, then DOWN on the declared cadence', [x.status, y.status]); }
{ const evs = Array.from({ length: 40 }, (_, i) => now - (40 - i) * 600e3); const s = FH.cadenceStatus(evs, now + 15 * 60e3, { awake: null, declaredMs: H });
  ok(s.limits !== 'declared cadence' && /95th percentile of 39 update gaps/.test(s.basis) && s.status === 'down', 'F3 a measured history keeps its measured limits', s); }
{ const src = readFileSync(join(ROOT, 'scripts', 'agents', 'feed_health.mjs'), 'utf8');
  ok(/const bs = \{ status: 'ok' \}/.test(src) && !/feed: 'provider_budget'/.test(src), 'F4 overage allowed (owner 29 Oct): the budget never sets the provider feed status; no separate budget alert');
  /* behaviour: a provider record over budget */
  const T = mkdtempSync(join(tmpdir(), 'fh28-')); try { mkdirSync(join(T, 'quota-callers'), { recursive: true }); const day = new Date(now).toISOString().slice(0, 10);
    const lines = []; for (let k = 0; k < 40; k++) lines.push(JSON.stringify({ at: new Date(now - k * 15 * 60e3).toISOString(), by: { a: [10, 100, 0, 0] } }));
    writeFileSync(join(T, 'quota-callers', 'qbr-' + day + '.jsonl'), lines.join('\n') + '\n'); writeFileSync(join(T, 'provider-budget.json'), JSON.stringify({ dailyWeightedCap: 1000 }));
    const r = FH.check({ app: T, dataDir: T, copiesDir: join(T, 'c'), now }); const p = r.feeds.provider;
    ok(p && p.budget && (p.budget.status === 'at cap' || p.budget.status === 'over budget') && p.status === 'ok' && p.budget.problem === false && p.budget.info === true, 'F4b a provider over its daily share is information only (feed ok, overage allowed)', p && { status: p.status, budget: p.budget });
  } finally { rmSync(T, { recursive: true, force: true }); } }
{ const A = readFileSync(join(ROOT, 'server', 'api', 'agents.mjs'), 'utf8');
  ok(['F.quake', 'F.smapfeed', 'F.floodobs', 'F.glof', 'F.imerg', 'F.ecmwf010'].every((k) => A.includes(k + ' = {')) && /everyWhat/.test(A) && /startedAt/.test(A), 'F5 the six server feeds are written with their declared cadence'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
