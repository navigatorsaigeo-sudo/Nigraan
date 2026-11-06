/* v91.17.283.14 · replay of the value-level quality control over a window (every network, NIGRAAN's own copies, read only):
   share of hourly values dropped per variable and zone, per test, stations with more than 50 % of a variable's values failing, and the
   per-station table for the stations that were excluded at station level before v91.17.283.14 (holds, the non-representative list, the
   registry exclusions, the siting-screen 'excluded' / 'bad siting' verdicts and the siting offsets' held-out stations).
   usage: node scripts/tests28314/replay_shares.mjs --data <dir> --copies <dir> --lake <dir> --from D --to D --out <json> [--old-data <dir>] */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll } from './lib.mjs';
import * as Q from '../../server/api/obsqc.mjs';
import { args } from '../agents/lib.mjs';

export function formerExclusions(oldData) {
  const rj = (f) => { try { return JSON.parse(readFileSync(join(oldData, f), 'utf8')); } catch (_) { return null; } };
  const ex = new Map(); const add = (pid, where, why) => { const a = ex.get(pid) || []; a.push({ where, why: String(why || '').slice(0, 160) }); ex.set(pid, a); };
  for (const s of ((rj('mach-fleet-stations.json') || {}).stations || [])) if (s.exclude && s.exclude.why) add('mach:' + s.key, 'registry exclude (' + s.exclude.kind + ')', s.exclude.why);
  for (const h of ((rj('station-holds.json') || {}).holds || [])) add('mach:' + h.key, 'station hold' + (h.permanent ? ' (permanent)' : ''), h.why);
  for (const s of ((rj('nonrepresentative-stations.json') || {}).stations || [])) add(s.pid, 'non-representative list (training, verification)', s.reason);
  const sit = (rj('mach-siting.json') || {}).stations || {}; for (const [k, v] of Object.entries(sit)) if (v.verdict === 'excluded' || v.verdict === 'bad siting') add('mach:' + k, 'siting screen verdict ' + v.verdict + ' (running correction)', v.why);
  const off = (rj('mach-offsets.json') || {}).stations || {}; for (const [k, v] of Object.entries(off)) if (v.heldOut) add('mach:' + k, 'siting offsets held out (live layer)', v.why);
  return ex;
}
export async function replay(ctx, from, to, oldData) {
  const A = await loadAll(ctx, from, to); const P = Q.loadParams(ctx.dataDir);
  const res = Q.qcBatch(A.qs, A.OB.byPid, P, { nearestMin: 15, bgAt: A.bgAt, copyOf: A.copyOf });
  const info = new Map(A.qs.map((s) => [s.pid, s])); const sh = Q.stationShares(res.hourly);
  const byZone = {}; for (const [pid, o] of Object.entries(sh)) { const z = (info.get(pid) || {}).zone || 'none'; const n = (info.get(pid) || {}).net;
    for (const [v, x] of Object.entries(o)) { const k = v + '|' + z; const a = byZone[k] || (byZone[k] = { n: 0, fail: 0, tests: {}, nets: {} }); a.n += x.n; a.fail += x.fail; for (const [t, c] of Object.entries(x.tests)) a.tests[t] = (a.tests[t] || 0) + c; a.nets[n] = (a.nets[n] || 0) + x.n; } }
  for (const a of Object.values(byZone)) a.share = a.n ? Math.round(1000 * a.fail / a.n) / 10 : null;
  const over50 = []; for (const [pid, o] of Object.entries(sh)) for (const [v, x] of Object.entries(o)) if (x.n >= 24 && x.fail / x.n > 0.5) over50.push({ pid, name: (info.get(pid) || {}).name, zone: (info.get(pid) || {}).zone, v, n: x.n, failPct: Math.round(1000 * x.fail / x.n) / 10, tests: x.tests });
  const ex = oldData ? formerExclusions(oldData) : new Map(); const former = [];
  for (const [pid, where] of ex) { const o = sh[pid] || {}; const s = info.get(pid) || {};
    former.push({ pid, name: s.name || null, zone: s.zone || null, where, vars: Object.fromEntries(Object.entries(o).filter(([v]) => ['T', 'Td', 'RH', 'W', 'P'].includes(v)).map(([v, x]) => [v, { n: x.n, passPct: x.n ? Math.round(1000 * (x.n - x.fail) / x.n) / 10 : null, failPct: x.n ? Math.round(1000 * x.fail / x.n) / 10 : null, tests: x.tests }])) }); }
  return { window: [from, to], params: P.version, counts: res.counts, byZone, over50: over50.sort((a, b) => b.failPct - a.failPct), former, shares: sh, hourly: res.hourly, A };
}
const here = process.argv[1] && process.argv[1].endsWith('replay_shares.mjs');
if (here) { const o = args(process.argv.slice(2)); const r = await replay({ dataDir: o.data, copiesDir: o.copies, lake: o.lake }, o.from, o.to, o['old-data']);
  const out = { window: r.window, params: r.params, counts: r.counts, byZone: r.byZone, over50: r.over50, former: r.former }; const t = JSON.stringify(out, null, 1); if (o.out) writeFileSync(o.out, t); else process.stdout.write(t + '\n'); }
