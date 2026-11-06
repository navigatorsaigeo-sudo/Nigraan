// v91.17.283.31 · owner 29 Oct 2026: overage is allowed; the budget is information only (was S7: over budget LATE, at cap DOWN):
//  F1 calls arriving on time with no failures: the provider feed is ok (not LATE) even when the day is projected over the cap
//  F2 the budget status is "over budget" with the projection in words ("projected N of the C weighted calls"); "at cap" at the cap
//  F3 the alert names the budget ("call budget: OVER BUDGET ..."), never "LATE"; the admin line too
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, ok, done } from './lib.mjs';
const FH = await imp('scripts/agents/feed_health.mjs');
const D = mkdtempSync(join(tmpdir(), 'fb-')), Q = join(D, 'quota-callers'), A = join(D, 'admin'); mkdirSync(Q, { recursive: true }); mkdirSync(A, { recursive: true });
const now = Date.parse('2026-10-22T14:30:00Z');
for (let d = 25; d >= 0; d--) { const day = new Date(now - d * 864e5).toISOString().slice(0, 10), lines = [];
  for (let m = 0; m < 24 * 60; m += 15) { const at = Date.parse(day + 'T00:00:00Z') + m * 6e4; if (at > now) break; lines.push(JSON.stringify({ at: new Date(at).toISOString(), by: { page: [10, d === 0 ? 1400 : 900, 0, 0] } })); }
  writeFileSync(join(Q, 'qbr-' + day + '.jsonl'), lines.join('\n') + '\n'); }
writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ dailyWeightedCap: 100000 }));
const r = FH.run({ app: D, dataDir: D, copiesDir: join(D, 'copies'), adminDir: A, now, fromLamha: join(D, 'nl') });
const P = r.state.feeds.provider || {}; if (!P.budget) console.log('     (no budget status on this tree)');
/* v91.17.283.31 · owner 29 Oct 2026: the provider bills overage, so the budget is INFORMATION only: it never makes the provider feed LATE or
   DOWN and is never in an alert; the day and the month to date against the plan are shown in its words. (Was S7: over budget LATE, at cap DOWN.) */
ok(P.status === 'ok' && P.budget && P.budget.problem === false && P.budget.info === true && !/call budget/.test(P.why || ''), 'F1 calls fresh and failure-free, projected over the day\'s share: the provider feed stays ok (overage allowed)', P.status + ' · ' + (P.why || ''));
ok(P.budget && P.budget.status === 'over budget' && /OVER BUDGET: projected [\d,]+ of the 100,000 weighted calls of the day/.test(P.budget.text) && /information only, overage allowed/.test(P.budget.text), 'F2 the budget words keep the projection and say it is information only', JSON.stringify(P.budget));
writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ dailyWeightedCap: 100000, monthlyPlanWeighted: 500000 }));
const rM = FH.run({ app: D, dataDir: D, copiesDir: join(D, 'copies'), adminDir: A, now, fromLamha: join(D, 'nl') }); const M = ((rM.state.feeds.provider || {}).quota || {}).month || {};
ok(M.month === '2026-10' && M.planWeighted === 500000 && M.usedWeighted > 500000 && M.overByWeighted === M.usedWeighted - 500000 && /over: billed as overage/.test(rM.state.feeds.provider.budget.text), 'F2b the month to date against the monthly plan and how far over it is', JSON.stringify(M));
const rA = FH.run({ app: D, dataDir: D, copiesDir: join(D, 'copies'), adminDir: A, now: now + 20 * 6e4, fromLamha: join(D, 'nl') });
const rB = FH.run({ app: D, dataDir: D, copiesDir: join(D, 'copies'), adminDir: A, now: now + 30 * 6e4, fromLamha: join(D, 'nl') });
const all = [...r.alerts, ...rM.alerts, ...rA.alerts, ...rB.alerts];
ok(!all.some((a) => /BUDGET|budget/.test(a.text || '')), 'F3 no alert names the budget (overage allowed)', JSON.stringify(all.map((a) => a.text)).slice(0, 300));
const adm = existsSync(join(A, 'alerts.log')) ? readFileSync(join(A, 'alerts.log'), 'utf8') : ''; ok(!/OVER BUDGET|AT CAP/.test(adm), 'F3 no admin line names the budget', adm.trim().slice(0, 200));
writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ dailyWeightedCap: 1000 }));
const r2 = FH.run({ app: D, dataDir: D, copiesDir: join(D, 'copies'), adminDir: A, now, fromLamha: join(D, 'nl') });
ok((r2.state.feeds.provider.budget || {}).status === 'at cap' && r2.state.feeds.provider.status === 'ok' && r2.state.feeds.provider.budget.problem === false, 'F2c at the day\'s share: "at cap" in words, the provider feed still ok', JSON.stringify(r2.state.feeds.provider.budget).slice(0, 300));
rmSync(D, { recursive: true, force: true });
done('B-FEED-BUDGET');
