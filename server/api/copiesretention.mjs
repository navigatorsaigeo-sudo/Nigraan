/* ══ v91.17.272 · OPS 2 · RETENTION OF NIGRAAN'S COPIES (D:\NIGRAAN\nig\copies), MONTHLY, THROUGH THE SCHEDULER ══════════════════════
   Owner (16 Oct 2026, "choose best"): keep everything the consumers read plus 45 days; move older dated files once a month to
   D:\NIGRAAN\_admin\archive\copies\<same path> (move, never delete). The rule and the move are scripts/copies_retention.py (v270, unchanged
   rule): a dated file stays while its date is within its consumer's window (data/copy-sources.json: MACH 2 days, PMD-EWS 14, IMERG 17,
   month files 2 months) + keepDays; a file copied in the last 30 minutes and fixed files never move; MOVED.txt in the archive logs each run.
   Measured (v270 OPS 6): about 85-100 MB a month in, about 130 MB kept at steady state.
   Here: a daily tick (bulk slot: never beside the MACH record copy, the ensemble archive or a drop import) runs the move once per Pakistan
   calendar month, the first tick of the month (the tick waits 30 min after start-up, so a deploy swap never starts it). The last run is kept
   in data/copies-retention.json and shown on /health (copiesRetention) and /api/ops/schedule. NIGRAAN_COPIES_RETENTION=0 stops it;
   NIGRAAN_COPIES_KEEP_DAYS (45) sets keepDays. */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';
import { runJob } from './jobrun.mjs';

export const pktMonth = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 7);

export function createCopiesRetention(app, root, dataDir, opts = {}) {
  const script = join(root, 'scripts', 'copies_retention.py');
  const stateFile = join(dataDir, 'copies-retention.json');
  const now = () => (opts.now ? opts.now() : Date.now());
  const keepDays = () => Math.max(0, Number(process.env.NIGRAAN_COPIES_KEEP_DAYS) || 45);
  const on = () => process.env.NIGRAAN_COPIES_RETENTION !== '0';
  let ST = null; try { ST = JSON.parse(readFileSync(stateFile, 'utf8')); } catch (_) { ST = null; }
  let busy = false;
  function save() { try { const t = stateFile + '.tmp'; writeFileSync(t, JSON.stringify(ST, null, 1)); renameSync(t, stateFile); } catch (_) {} }
  function python() {
    const c = []; if (process.env.NIGRAAN_PYTHON) c.push(process.env.NIGRAAN_PYTHON);
    if (process.env.LOCALAPPDATA) c.push(join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'));
    for (const p of c) if (existsSync(p)) return p;
    return process.platform === 'win32' ? 'py' : 'python3';
  }
  const due = () => !ST || !ST.lastOkMonth || ST.lastOkMonth < pktMonth(now());
  async function run(force = false) {
    if (!on() || busy) return { started: false, busy, on: on() };
    if (!force && !due()) return { started: false, why: 'already run this month (' + ST.lastOkMonth + ')' };
    if (!existsSync(script)) { ST = { ...(ST || {}), lastRun: new Date(now()).toISOString(), ok: false, error: 'scripts/copies_retention.py missing' }; save(); return { started: false, error: ST.error }; }
    busy = true; const t0 = now();
    try {
      const exe = python(); const args = (exe === 'py' ? ['-3'] : []).concat([script, '--keep-days', String(keepDays()), '--apply']);
      /* v283.51g3 · item 2 · runJob (jobrun.mjs): one successful run in the log, so the 30-minute cap is kept; process tree ended on overrun, logged */
      const r0 = await runJob('copies_retention.py', exe, args, { capMin: 30, cwd: root, env: { ...process.env } });
      const r = r0.code === -1 ? { code: -1, out: 'Python not found (' + r0.out.trim().split('\n').pop() + ')' } : { code: r0.code, out: r0.out };
      const mv = r.out.match(/moved (\d+) files to (.+?) \(nothing deleted\)/); const plan = r.out.match(/rule keepDays=(\d+): (\d+) dated files outside .*?, ([\d.]+) MB/);
      const none = /no copies folder at/.test(r.out);
      ST = { lastRun: new Date(t0).toISOString(), ms: now() - t0, code: r.code, ok: r.code === 0, keepDays: keepDays(), moved: mv ? Number(mv[1]) : 0, movedMB: plan ? Number(plan[3]) : 0,
        candidates: plan ? Number(plan[2]) : 0, archive: mv ? mv[2] : null, note: none ? 'no copies folder yet' : null,
        lastOkMonth: r.code === 0 || none ? pktMonth(t0) : (ST && ST.lastOkMonth) || null, error: r.code === 0 || none ? null : r.out.trim().split('\n').slice(-1)[0].slice(0, 200), tail: r.out.trim().split('\n').slice(-4) };
      if (none) ST.ok = true;
      save();
      try { console.log('  copies     retention (keepDays ' + ST.keepDays + '): ' + (ST.ok ? ST.moved + ' file(s) moved, ' + ST.movedMB + ' MB, to the archive (nothing deleted)' + (ST.note ? '; ' + ST.note : '') : 'failed: ' + ST.error)); } catch {}
      return { started: true, ...ST };
    } finally { busy = false; }
  }
  function status() {
    return { on: on(), busy, keepDays: keepDays(), due: due(), lastRun: ST ? ST.lastRun : null, ok: ST ? ST.ok : null, moved: ST ? ST.moved : null, movedMB: ST ? ST.movedMB : null, lastOkMonth: ST ? ST.lastOkMonth : null, error: ST ? ST.error : null };
  }
  if (!opts.noSchedule) schedule(app, 'copiesRetention', 24 * 3600e3, () => run().then((x) => { if (x && x.started && !x.ok) throw new Error(x.error || 'retention failed'); }), { heavy: 'bulk', label: 'copies retention (monthly move to _admin\\archive\\copies)', firstMs: 30 * 60e3 });
  return { run, status, due };
}
