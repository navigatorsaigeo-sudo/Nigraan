/* v91.17.283 · WS8 · frozen input for the identity test: the server's own calibrated rain chance (server/api/rainchance.mjs, unchanged)
   computed on one archived served national run (data/archive/forecast, the run of the given issue day) with the clock at that issue,
   so the rain layer is exercised in both paths with the same real input. node rainfeed.mjs <issueDay> -> JSON body of GET /api/rain/chance */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = process.argv[2], X = Number(process.argv[3] || 1);
const recs = {};
for (const f of ['fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz']) { let t = ''; try { t = gunzipSync(readFileSync(join(ROOT, 'data/archive/forecast', f))).toString(); } catch (_) { continue; }
  for (const l of t.split('\n')) { if (!l) continue; let r; try { r = JSON.parse(l); } catch (_) { continue; } if (r.d !== D) continue; if (!recs[r.u] || recs[r.u].iss < r.iss) recs[r.u] = r; } }
const R = Object.values(recs); const runId = R[0].run, iss = R.reduce((a, r) => a > r.iss ? a : r.iss, '');
const now = Date.parse(iss) + 30 * 60e3; const RN = Date.now; Date.now = () => now;
const run = { run_id: runId, status: 'complete', unit_level: 'tehsil', completed_at: iss, base_valid_time: R[0].base };
const records = R.map(r => { const t0 = Date.parse(r.t0); return { runId, unitKey: r.u, lat: r.lat, lon: r.lon, resolvedElevationM: r.el,
  hourly: { time: r.P.map((_, i) => new Date(t0 + i * 3600e3).toISOString()), precipitation: r.P.map(v => v == null ? null : v / 10 * X) } }; });
const app = { store: { filter: (k, f) => (k === 'runs' ? [run] : records).filter(f) } };
const { createRainChance } = await import(join(ROOT, 'server/api/rainchance.mjs'));
const rc = createRainChance(app, join(ROOT, 'data'));
const n = rc.national(); Date.now = RN;
process.stdout.write(JSON.stringify(n));
