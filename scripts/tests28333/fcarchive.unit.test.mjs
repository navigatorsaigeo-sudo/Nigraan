/* v91.17.283.33 · the forecast archive wiring (no network, no server): the daily pyjob fcArchive runs station-lake/scripts/fc_archive_harvest.py
   --app <root> --daily; the feed-health entry and GET /api/ops/fcarchive read only the harvester's status.json (a mocked one here); a 429 stop
   is the feed's last error; nothing served reads the archive (only fcarchive.mjs, agents.mjs and index.mjs name it). The harvester itself is
   tested with a mocked API by scripts/tests28333/fc_archive_test.py. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const tmp = mkdtempSync(join(tmpdir(), 'fca-')); process.env.NIGRAAN_STATION_LAKE_DIR = tmp;
const { fcArchiveStatus, fcArchiveFeed } = await import(join(ROOT, 'server', 'api', 'fcarchive.mjs'));
let s = fcArchiveStatus(ROOT); ok(s.ok && !s.ready && /no harvest has run yet/.test(s.why), 'no status file: not ready, says why', JSON.stringify(s));
mkdirSync(join(tmp, 'archive', 'fc_archive'), { recursive: true });
const st = { updated: '2026-10-29T03:00:00Z', calls: 1234, points: { n: 516 }, stoppedOn429: null, rejected: { kma_gdps: { why: '400 unknown model' } },
  models: { ecmwf_ifs025: { kind: 'previous-runs', rows: 5000 }, google_weathernext2_ensemble: { kind: 'ensemble', runs: 3, archiveStart: '2026-10-27' } } };
writeFileSync(join(tmp, 'archive', 'fc_archive', 'status.json'), JSON.stringify(st));
s = fcArchiveStatus(ROOT); ok(s.ready && s.nModels === 2 && s.calls === 1234 && s.rejected.kma_gdps && /information only/.test(s.callsNote), 'status read: models, calls (information only), rejected', JSON.stringify(s).slice(0, 400));
let F = fcArchiveFeed(ROOT); ok(F.lastPoll === '2026-10-29T03:00:00Z' && F.lastError === null && F.everyMs === 864e5 && /fcArchive/.test(F.everyWhat), 'feed-health entry: last good run, daily', JSON.stringify(F));
writeFileSync(join(tmp, 'archive', 'fc_archive', 'status.json'), JSON.stringify({ ...st, stoppedOn429: { at: '2026-10-29T04:00:00Z', why: 'Too many requests' } }));
F = fcArchiveFeed(ROOT); ok(F.lastPoll === null && /stopped on HTTP 429/.test(F.lastError), 'a 429 stop is the feed’s last error', JSON.stringify(F));
ok(!/key|token/i.test(JSON.stringify(fcArchiveStatus(ROOT))), 'the status answer carries no key');
const PJ = readFileSync(join(ROOT, 'server', 'api', 'pyjobs.mjs'), 'utf8');
ok(/id: 'fcArchive', script: 'fc_archive_harvest\.py', args: \['--app', root, '--daily'\], everyH: 24/.test(PJ), 'pyjob fcArchive: fc_archive_harvest.py --app <root> --daily, every 24 h');
const IX = readFileSync(join(ROOT, 'server', 'api', 'index.mjs'), 'utf8');
ok(/p === '\/api\/ops\/fcarchive' && req\.method === 'GET'\) \{ if \(customerView\(req\)\) return send\(res, 404/.test(IX), 'GET /api/ops/fcarchive: operator only');
const users = readdirSync(join(ROOT, 'server', 'api')).filter((f) => f.endsWith('.mjs') && /fcarchive|fc_archive/.test(readFileSync(join(ROOT, 'server', 'api', f), 'utf8'))).sort();
/* v283.51g3 · jobrun.mjs names the harvester only in its time-limit table (its normal run from server.log), it reads nothing */
ok(JSON.stringify(users) === JSON.stringify(['agents.mjs', 'fcarchive.mjs', 'index.mjs', 'jobrun.mjs', 'pyjobs.mjs']), 'nothing served reads the archive', users.join(', '));
rmSync(tmp, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
