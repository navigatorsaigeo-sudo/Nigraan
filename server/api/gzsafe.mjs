/* ══ v91.17.283.8 · planned C · APPEND-ONLY GZIP ARCHIVES: WHOLE MEMBERS ONLY, DAMAGED MEMBERS SKIPPED AND REPORTED ══════════════════
   The archives data/archive/<kind>/<kind>_YYYY-MM.jsonl.gz are concatenated gzip members (one per record). engine_2026-10.jsonl.gz held
   one damaged member at byte 11,400,290 (10 Oct 15:07 UTC): a torn append, after which further members were appended, and Node's gunzip
   stops at the first bad byte, so a reader lost the rest of the month.
   Writer (appendGzMember): the member is written with one positioned write to the end of the file and fsync'd; if the write fails or is
   short, the file is cut back to its size before the write (ftruncate), so a failed append leaves no partial member. A crash in the
   middle of the write can still leave a torn tail; repairGzTail (run before the first append of a process, and by the server at start)
   finds the last whole member and moves any torn tail to <file>.damaged-<time> (never deleted), so later members never follow a torn
   one again.
   Readers (gzMembers / gunzipMembers): member by member; a damaged member is skipped and reported ({ at, bytes }); the members after it
   are still read. */
import { openSync, closeSync, fstatSync, writeSync, fsyncSync, ftruncateSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/* the gzip member starts (magic 1f 8b, method 08) */
function starts(b) { const s = []; for (let i = b.indexOf(0x1f); i >= 0 && i < b.length - 2; i = b.indexOf(0x1f, i + 1)) if (b[i + 1] === 0x8b && b[i + 2] === 0x08) s.push(i); return s; }

/* a buffer of concatenated members -> { texts:[...], damaged:[{at, bytes}], goodEnd } (goodEnd: the byte after the last whole member) */
export function gunzipMembers(b) {
  const S = starts(b); S.push(b.length); const texts = [], damaged = []; let s = 0, k = 1, goodEnd = 0;
  if (S[0] !== 0) { damaged.push({ at: 0, bytes: S[0] }); s = S[0]; }
  while (s < b.length) { let done = false;
    for (let j = k; j < S.length; j++) { const e = S[j]; if (e <= s) continue; try { texts.push(gunzipSync(b.subarray(s, e)).toString('utf8')); s = e; goodEnd = e; k = j + 1; done = true; break; } catch (_) {} }
    if (!done) { const nx = S.find((x) => x > s); damaged.push({ at: s, bytes: (nx ?? b.length) - s }); if (nx == null || nx >= b.length) break; s = nx; k = S.indexOf(nx) + 1; } }
  return { texts, damaged, goodEnd };
}
export function gzMembers(file) { let b; try { b = readFileSync(file); } catch (_) { return null; } return gunzipMembers(b); }

/* a torn tail (bytes after the last whole member that do not decode) is moved aside; returns { repaired, bytes, to } */
export function repairGzTail(file) {
  if (!existsSync(file)) return { repaired: false };
  let b; try { b = readFileSync(file); } catch (e) { return { repaired: false, why: e.message }; }
  if (!b.length) return { repaired: false };
  try { gunzipSync(b); return { repaired: false }; } catch (_) {}   /* the whole file decodes: nothing to do */
  const M = gunzipMembers(b); if (M.goodEnd >= b.length) return { repaired: false, damagedInside: M.damaged.length };
  const tail = b.subarray(M.goodEnd); const to = file + '.damaged-' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  writeFileSync(to, tail); const fd = openSync(file, 'r+'); try { ftruncateSync(fd, M.goodEnd); fsyncSync(fd); } finally { closeSync(fd); }
  return { repaired: true, bytes: tail.length, to, damagedInside: M.damaged.filter((d) => d.at < M.goodEnd).length };
}

const checked = new Set();
/* append one whole member; the file is never left with a partial member by a failed write */
export function appendGzMember(file, member) {
  if (!checked.has(file)) { checked.add(file); try { repairGzTail(file); } catch (_) {} }
  const fd = openSync(file, 'a+'); let size = 0;
  try { size = fstatSync(fd).size; let off = 0;
    while (off < member.length) { const n = writeSync(fd, member, off, member.length - off, size + off); if (!(n > 0)) throw new Error('short write'); off += n; }
    fsyncSync(fd);
  } catch (e) { try { ftruncateSync(fd, size); fsyncSync(fd); } catch (_) {} throw e; }
  finally { closeSync(fd); }
  return { ok: true, at: size, bytes: member.length };
}
