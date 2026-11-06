/* v91.17.236 · THE SHOWN-LEVELS SCORE IS THE SAME, READ INCREMENTALLY AND OFF THE MAIN THREAD. On a copy of data/archive (shown,
   imerg, fleet): the score from the earlier whole-file read (a copy of the v235 code, passed as --old) equals the new score; after a
   new hourly record is appended, the new code (reading only the new end) still equals a fresh whole read; a second call with nothing
   new returns the same; a damaged file end is read again whole. usage: node scripts/tests236/shown_score.test.mjs --old <shown.v235.mjs> */
import { mkdtempSync, cpSync, rmSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const a = process.argv.slice(2); const OLD = a.includes('--old') ? resolve(a[a.indexOf('--old') + 1]) : null;
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info ? ' :: ' + String(info).slice(0, 400) : '')); } };
const DIR = mkdtempSync(join(tmpdir(), 'agn-shown-'));
for (const d of ['shown', 'imerg', 'fleet']) { const s = join(APP, 'data', 'archive', d); if (existsSync(s)) cpSync(s, join(DIR, 'archive', d), { recursive: true }); }
const { buildUnitIndex } = await import('../../server/api/national.mjs');
const tehsil = buildUnitIndex(JSON.parse(readFileSync(join(APP, 'server', 'contract', 'units.json'), 'utf8'))).tehsil;
const app = { units: { tehsil } };
const NEW = await import('../../server/api/shown.mjs');
const fresh = async () => { const m = await import(pathToFileURL(join(APP, 'server/api/shown.mjs')).href + '?f=' + Math.random()); return m.createShown(app, DIR).score(); };
const N = NEW.createShown(app, DIR);
try {
  const s1 = await N.score();
  if (OLD) { const O = await import(pathToFileURL(OLD).href); const so = O.createShown(app, DIR).score(); ok(JSON.stringify(so) === JSON.stringify(s1), 'the new score equals the whole-file read of v235 (' + s1.archive + ')', JSON.stringify(so).slice(0, 200) + ' vs ' + JSON.stringify(s1).slice(0, 200)); }
  else console.log('SKIP no --old copy given');
  const s2 = await N.score(); ok(JSON.stringify(s2) === JSON.stringify(s1), 'a second call with nothing new gives the same score');
  const [p1, p2] = await Promise.all([N.score(), N.score()]); ok(p1 === p2, 'two calls at the same time share one run');
  /* a new morning record for a new day (day 0, 07:00 PKT) through the normal post */
  const at = Date.parse('2026-10-09T02:00:00Z'); const L = {}; for (const u of tehsil.slice(0, 50)) L[u.unitId] = 1;
  const r = N.reportShown({ at: new Date(at).toISOString(), day: 0, basis: 'test', layers: { rain_hz: { counts: {}, L }, heat: { counts: {}, L } } });
  ok(r.ok, 'a record is appended');
  const s3 = await N.score(), s3f = await fresh(); ok(JSON.stringify(s3) === JSON.stringify(s3f), 'after the append, the incremental read equals a fresh whole read', JSON.stringify(s3).slice(0, 200) + ' vs ' + JSON.stringify(s3f).slice(0, 200));
  if (OLD) { const O = await import(pathToFileURL(OLD).href + '?b'); ok(JSON.stringify(O.createShown(app, DIR).score()) === JSON.stringify(s3), 'and equals the v235 whole-file read'); }
  /* a damaged end: half a gzip member appended -> the file is read again whole, which (as before) gives no records for that file */
  const f = join(DIR, 'archive', 'shown', 'shown_2026-10.jsonl.gz'); appendFileSync(f, Buffer.from([0x1f, 0x8b, 0x08, 0x00, 1, 2, 3]));
  const s4 = await N.score(), s4f = await fresh(); ok(JSON.stringify(s4) === JSON.stringify(s4f), 'a damaged end is read again whole: same as a fresh read');
  if (OLD) { const O = await import(pathToFileURL(OLD).href + '?c'); ok(JSON.stringify(O.createShown(app, DIR).score()) === JSON.stringify(s4), 'and the same as the v235 read of the damaged file'); }
} catch (e) { ok(false, 'run', e && e.stack); }
finally { try { rmSync(DIR, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${fail ? 'FAIL' : 'PASS'} shown_score: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
