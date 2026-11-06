/* v91.17.259 · D2/D3 · runs ds_live_check.mjs once per hour, N times (default 3), each at minute 12 of the hour (the fleet poll
   and the hourly grid are both in by then). Writes DONE to D:\NIGRAAN\_admin\ds\live_loop_done.txt.
   node scripts\ds\ds_live_loop.mjs [N] */
import { spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), OUTD = join(HERE, '..', '..', '..', '..', '_admin', 'ds'); mkdirSync(OUTD, { recursive: true });
const N = Number(process.argv[2] || 3), LOG = join(OUTD, 'live_loop_log.txt');
const pkt = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' PKT';
for (let i = 0; i < N; i++) {
  const d = new Date(); let t = new Date(d); t.setUTCMinutes(12, 0, 0); if (t <= d) t = new Date(t.getTime() + 3600e3);
  if (i === 0 && d.getUTCMinutes() >= 12 && d.getUTCMinutes() < 35) t = d;   /* the first sample can be taken now */
  await new Promise((o) => setTimeout(o, Math.max(0, t - Date.now())));
  const r = spawnSync(process.execPath, [join(HERE, 'ds_live_check.mjs')], { encoding: 'utf8', timeout: 40 * 60e3 });
  appendFileSync(LOG, `${pkt()} sample ${i + 1}/${N}: exit ${r.status} ${String(r.stdout || '').trim()} ${String(r.stderr || '').trim().slice(0, 400)}\n`);
}
writeFileSync(join(OUTD, 'live_loop_done.txt'), pkt());
