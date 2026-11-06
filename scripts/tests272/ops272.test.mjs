// v91.17.272 · OPS 1-3 · node scripts/tests272/ops272.test.mjs   (temporary folders only; Python needed for R2-R4)
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, cpSync, rmSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createEnsArchive } from '../../server/api/ensarchive.mjs';
import { createCopiesRetention, pktMonth } from '../../server/api/copiesretention.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const W = mkdtempSync(join(tmpdir(), 'ops272-'));
// ── ensemble archive: NIGRAAN's copy first, station-lake's only when it is missing
{ const nig = join(W, 'nig'), app = join(nig, 'nigraan-local'); mkdirSync(join(app, 'scripts'), { recursive: true }); mkdirSync(join(app, 'data'), { recursive: true }); mkdirSync(join(nig, 'station-lake', 'scripts'), { recursive: true });
  writeFileSync(join(nig, 'station-lake', 'scripts', 'ens_archive.py'), '# old'); process.env.NIGRAAN_ENS_ARCHIVE = '0';
  let E = createEnsArchive(null, app, join(app, 'data')); ok(E.status().script === 'station-lake (fallback)', 'E1 only station-lake\'s copy present: it is the fallback', E.status().script);
  writeFileSync(join(app, 'scripts', 'ens_archive.py'), '# own'); E = createEnsArchive(null, app, join(app, 'data'));
  ok(E.status().script === 'nigraan', 'E2 NIGRAAN\'s own copy present: it runs', E.status().script);
  const src = readFileSync(join(APP, 'server', 'api', 'ensarchive.mjs'), 'utf8');
  ok(/cwd: root, which: 'nigraan'/.test(src) && /runJob\('ens_archive\.py', exe, args, \{ capMin: 60, cwd,/.test(src), 'E3 NIGRAAN\'s copy runs with nigraan-local as its working folder (nothing new under station-lake)');
  ok(readFileSync(join(APP, 'scripts', 'ens_archive.py'), 'utf8').includes("os.path.join(NIG, 'archive', 'ens')"), 'E4 the copy writes nig/archive/ens');
  delete process.env.NIGRAAN_ENS_ARCHIVE; }
// ── copies retention: monthly, moves only, through the scheduler shape
{ const root = join(W, 'R'), app = join(root, 'nig', 'nigraan-local'); mkdirSync(join(app, 'scripts'), { recursive: true }); mkdirSync(join(app, 'data'), { recursive: true });
  cpSync(join(APP, 'scripts', 'copies_retention.py'), join(app, 'scripts', 'copies_retention.py')); cpSync(join(APP, 'data', 'copy-sources.json'), join(app, 'data', 'copy-sources.json'));
  const cfg = JSON.parse(readFileSync(join(APP, 'data', 'copy-sources.json'), 'utf8'));
  const copies = join(root, 'nig', 'copies'); process.env.NIGRAAN_COPIES_DIR = copies;
  const f = cfg.datasets.lamha_mach.files[0].path.replace('{Y}', '2026').replace('{M}', '07').replace('{D}', '01');   // a July day file: outside 2 + 45 days on 16 Oct
  const g = cfg.datasets.lamha_mach.files[0].path.replace('{Y}', '2026').replace('{M}', '10').replace('{D}', '15');   // read by the consumer: kept
  for (const p of [f, g]) { const q = join(copies, 'lamha', p); mkdirSync(dirname(q), { recursive: true }); writeFileSync(q, 'stationKey,time,temperatureC\n'); const old = Date.now() / 1000 - 7200; utimesSync(q, old, old); }
  let T = Date.parse('2026-10-16T10:00:00Z');
  const R = createCopiesRetention(null, app, join(app, 'data'), { noSchedule: true, now: () => T });
  ok(R.due() === true, 'R1 never run: due');
  const r = await R.run();
  const moved = join(root, '_admin', 'archive', 'copies', 'lamha', f);
  ok(r.started && r.ok && existsSync(moved) && !existsSync(join(copies, 'lamha', f)), 'R2 the July file moved to _admin/archive/copies (nothing deleted)', JSON.stringify({ moved: r.moved, code: r.code, tail: r.tail }));
  ok(existsSync(join(copies, 'lamha', g)), 'R3 a file the consumer reads stays');
  ok(R.due() === false && R.status().lastOkMonth === pktMonth(T), 'R4 not due again in the same month', R.status().lastOkMonth);
  T = Date.parse('2026-10-31T19:30:00Z'); ok(R.due() === true, 'R5 due again at 00:30 PKT on 1 Nov (PKT month)', pktMonth(T));
  ok(existsSync(join(app, 'data', 'copies-retention.json')) && existsSync(join(root, '_admin', 'archive', 'copies', 'MOVED.txt')), 'R6 logged: data/copies-retention.json and the archive MOVED.txt');
  const src = readFileSync(join(APP, 'server', 'api', 'copiesretention.mjs'), 'utf8'), idx = readFileSync(join(APP, 'server', 'api', 'index.mjs'), 'utf8');
  ok(/heavy: 'bulk'/.test(src) && /firstMs: 30 \* 60e3/.test(src) && /copiesRetention: \(\(\) =>/.test(idx), 'R7 scheduler: bulk slot, first tick 30 min after start; /health shows copiesRetention');
  delete process.env.NIGRAAN_COPIES_DIR; }
// ── registry: AKZSFWS excluded with evidence; the four position questions closed, exclusions kept
{ const reg = JSON.parse(readFileSync(join(APP, 'data', 'mach-fleet-stations.json'), 'utf8')); const S = Object.fromEntries(reg.stations.map((s) => [s.key, s]));
  ok(S.AKZSFWS.exclude && /12 C colder/.test(S.AKZSFWS.exclude.why) && /-12.1 C/.test(S.AKZSFWS.exclude.evidence), 'G1 AKZSFWS excluded with its measured evidence');
  ok(['Faizan', 'Shah', 'dha_avenue', 'i_9_2'].every((k) => S[k].exclude && /kept as registered/.test(S[k].exclude.position) && !/owner to confirm/.test(S[k].exclude.evidence)), 'G2 the four position questions closed, exclusions kept');
  ok(reg.stations.filter((s) => s.exclude).length === 15 && reg.stations.filter((s) => !s.exclude && s.excludeWithdrawn).map((s) => s.key).join(',') === 'khaplu', 'G3 16 excluded keys (14 of v269 F2 + AKZSFWS + khaplu, v277 MTN); v91.17.278: khaplu withdrawn, kept on record'); }
rmSync(W, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
