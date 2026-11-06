import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.120 · the forward test: the server archives the exact-point forecast at each forward-test airport once a day, and the
   monthly forward test scores it against the airport reports. node nigraan-local/scripts/tests120/v120.test.mjs */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const P = JSON.parse(readFileSync(ROOT + 'data/forward-test-points.json', 'utf8')).points;
ok(P.length >= 8 && P.every(p => /^OP[A-Z]{2}$/.test(p.id) && p.lat > 23 && p.lat < 37.5 && p.lon > 60 && p.lon < 78), 'forward-test points: ' + P.length + ' airports');
const nowP = new Date(Date.now() + 5 * 3600e3);
if (nowP.getUTCHours() >= 2) {
  const f = ROOT + 'data/archive/points/points_' + nowP.toISOString().slice(0, 7) + '.jsonl.gz';
  try { await fetch(BASE + '/api/checks/run?what=points', { method: 'POST' }); } catch (_) {}
  let ready = false; for (let i = 0; i < 40 && !ready; i++) { ready = existsSync(ROOT + 'data/archive/points/.done_' + nowP.toISOString().slice(0, 10)); if (!ready) await new Promise(r => setTimeout(r, 15000)); }
  ok(ready && existsSync(f), 'the server archived today\'s exact-point forecasts');
  if (existsSync(f)) {
    const rows = gunzipSync(readFileSync(f)).toString().trim().split('\n').map(l => JSON.parse(l)).filter(r => r.d === nowP.toISOString().slice(0, 10));
    ok(rows.length >= 6, rows.length + ' airports archived today');
    const r = rows[0] || {};
    ok(Array.isArray(r.hours) && r.hours.length >= 48 && r.hours.every(h => h.length === 4 && typeof h[1] === 'number'), 'each row holds hourly temperature with its 90 % range');
    ok(Array.isArray(r.chain) && r.chain.includes('forecast at this point') && !/ECMWF|Open-Meteo|NOAA|DWD|ERA5/.test(JSON.stringify(r)), 'chain recorded, no supplier names');
  }
} else console.log('SKIP archive check before 02:00 PKT');
const pf = await (await fetch(BASE + '/api/point?lat=31.52&lon=74.40')).json();
ok(pf.ok && pf.days && pf.days.length >= 2, 'point forecast still answers', JSON.stringify(pf).slice(0, 200));
try { execFileSync(__T.PYTHON, ['-c', 'import ast,sys;ast.parse(open(sys.argv[1]).read())', ROOT + '../station-lake/scripts/forward_test.py']); ok(true, 'forward_test.py parses'); } catch (e) { ok(false, 'forward_test.py parses', e.message); }
const src = readFileSync(ROOT + '../station-lake/scripts/forward_test.py', 'utf8');
ok(/def score_points/.test(src) && /archive', 'points'/.test(src), 'forward test scores the exact-point archive');
console.log((fails ? 'FAIL' : 'PASS') + ' v120: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
