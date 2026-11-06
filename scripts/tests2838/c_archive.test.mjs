// planned C · the append-only gzip archives: the writer appends WHOLE members (a failed write is cut back; a torn tail left by a crash is
// moved aside before the next append), and the readers skip a damaged member and report it, reading every member after it.
//  G1 a torn tail is moved to <file>.damaged-<time>, the next member is appended after the last whole one, and the file decodes whole
//  G2 a damaged member in the middle (the engine_2026-10 case): gunzipMembers skips and reports it; every other member is read
//  G3 the server reader (shown.mjs gzCache, past30) reads past a damaged member instead of losing the month
//  G4 the engine, shown, selfcheck and points archives append through appendGzMember
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { imp, src, ok, done } from './lib.mjs';
const Z = await imp('server/api/gzsafe.mjs').catch(() => ({}));
const D = mkdtempSync(join(tmpdir(), 'gz-')), f = join(D, 'engine_2026-10.jsonl.gz');
const mem = (i) => gzipSync(Buffer.from(JSON.stringify({ i }) + '\n'));
if (Z.appendGzMember) {
  Z.appendGzMember(f, mem(1)); Z.appendGzMember(f, mem(2)); appendFileSync(f, mem(3).subarray(0, 9));   /* a crash in the middle of member 3 */
  delete Z.__x; const Z2 = await import(new URL('../../server/api/gzsafe.mjs?fresh=' + Date.now(), import.meta.url).href).catch(() => Z);
  (Z2.appendGzMember || Z.appendGzMember)(f, mem(4));
  let whole = null; try { whole = gunzipSync(readFileSync(f)).toString(); } catch (_) {}
  const side = readdirSync(D).filter((n) => /\.damaged-/.test(n));
  ok(whole === '{"i":1}\n{"i":2}\n{"i":4}\n' && side.length === 1, 'G1 the torn member 3 is moved aside; member 4 follows member 2; the file decodes whole', JSON.stringify([whole, side]));
  const b = Buffer.concat([mem(1), mem(2).subarray(0, 12), mem(3), mem(4)]); const M = Z.gunzipMembers(b);
  ok(M.texts.join('') === '{"i":1}\n{"i":3}\n{"i":4}\n' && M.damaged.length === 1, 'G2 a damaged member in the middle is skipped and reported; the members after it are read', JSON.stringify(M.damaged));
} else { ok(false, 'G1 server/api/gzsafe.mjs (whole-member append) exists'); ok(false, 'G2 member-by-member reader exists'); }
const { gzCache } = await imp('server/api/shown.mjs');
const g = join(D, 'shown_2026-10.jsonl.gz'); writeFileSync(g, Buffer.concat([mem(1), mem(2).subarray(0, 12), mem(3)]));
const st = await gzCache(() => [], (s, r) => s.push(r.i))(g);
ok(st.join() === '1,3', 'G3 the server reader reads past the damaged member (v283.7 lost the whole file)', JSON.stringify(st));
ok(/appendGzMember\(join\(adir, 'engine_'/.test(src('server/api/engine.mjs')) && /appendGzMember\(join\(dir, 'shown_'/.test(src('server/api/shown.mjs')) && /appendGzMember\(join\(scDir, 'selfcheck_'/.test(src('server/api/shown.mjs')) && /appendGzMember\(join\(dir, 'points_'/.test(src('server/api/pointengine.mjs')),
  'G4 the engine, shown, selfcheck and points archives append whole members');
rmSync(D, { recursive: true, force: true });
done('C-ARCHIVE');
