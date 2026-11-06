/* ══ v91.17.221 · SERVED TABLE AGES (system audit S-21) ═══════════════════════════════════════════════════════════════════════════
   Fourteen served tables carried no date, so their age could only be read from the file time, which a copy or a restore changes.
   Every table in data/ now carries its own date in one of the fields below; this module reads them once every 30 minutes (each file
   only when it changed) and reports:
     undated   tables with no date field (a writer that forgot one)
     stale     tables older than the age declared for them in data/table-register.json (maxAgeDays; a reference table that does
               not age, such as boundaries or a published scale, declares null)
   /api/ops/health carries the result as `tables`. Nothing here changes a table. */
import { readdirSync, statSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';

const DATE_FIELDS = ['built', 'builtAt', 'built_utc', 'updated', 'updatedAt', 'generated', 'generatedAt', 'at', 'asOf', 'date', 'fetchedAt', 'checkedAt', 'finishedAt', 'issued', 'created'];
/* the server's own working files (store, caches, engine output) are not served tables */
const SKIP = /^(nigraan-db|engine-latest|selfcheck-latest|drop-import|ffd-drive-state|table-register)\b|\.tmp$|\.bak/;
const MAX_PARSE = 1e6;   /* larger tables are not parsed (a 6 MB parse holds the server for a second): their date field is found by a text search */
const HEAD_RE = new RegExp('"(' + ['built', 'builtAt', 'built_utc', 'updated', 'updatedAt', 'generated', 'generatedAt', 'at', 'asOf', 'date', 'fetchedAt', 'checkedAt', 'finishedAt', 'issued', 'created'].join('|') + ')"\\s*:\\s*"(\\d{4}-\\d{2}-\\d{2}[^"]*)"');
/* text search, no parse. v91.17.236 · read 1 MB at a time (with 4 KB carried over between pieces), stopping at the first date field,
   instead of reading the whole file into one string (the cloud heap profile: 70 MB held for one scan). The bytes are searched as
   latin1 and the matched date decoded as UTF-8, so the first match is the one the whole-file search found. */
function headDate(file) {
  let fd = null;
  try {
    fd = openSync(file, 'r'); const CH = 1 << 20, KEEP = 4096; const buf = Buffer.alloc(CH); let pos = 0, carry = '';
    for (;;) { const n = readSync(fd, buf, 0, CH, pos); if (n <= 0) return null; pos += n;
      const t = carry + buf.toString('latin1', 0, n); const m = t.match(HEAD_RE); if (m) return Buffer.from(m[2], 'latin1').toString('utf8');
      carry = t.slice(-KEEP); }
  } catch (_) { return null; } finally { if (fd != null) try { closeSync(fd); } catch (_) {} }
}

export function createTables(app, dataDir) {
  const seen = new Map();   // file -> { mtimeMs, size, date }
  let last = null;
  function dateOf(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    for (const f of DATE_FIELDS) { const v = obj[f]; if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v; if (typeof v === 'number' && v > 1e12) return new Date(v).toISOString(); }
    if (obj.meta && typeof obj.meta === 'object') return dateOf(obj.meta);
    if (obj.metadata && typeof obj.metadata === 'object') return dateOf(obj.metadata);
    return null;
  }
  function register() { try { return JSON.parse(readFileSync(join(dataDir, 'table-register.json'), 'utf8')).tables || {}; } catch (_) { return {}; } }
  const pause = () => new Promise((r) => setImmediate(r));
  async function scan() {
    const reg = register(), now = Date.now(), undated = [], stale = [], tooBig = []; let n = 0;
    let i = 0;
    for (const f of readdirSync(dataDir)) {
      if (!f.endsWith('.json') || SKIP.test(f)) continue;
      if (++i % 8 === 0) await pause();   /* hand the event loop back between files */
      let st; try { st = statSync(join(dataDir, f)); } catch (_) { continue; }
      if (!st.isFile()) continue; n++;
      let rec = seen.get(f);
      if (!rec || rec.mtimeMs !== st.mtimeMs || rec.size !== st.size) {
        rec = { mtimeMs: st.mtimeMs, size: st.size, date: null, big: st.size > MAX_PARSE };
        if (!((reg[f] || {}).live || (reg[f] || {}).fileTime)) {
          if (rec.big) rec.date = headDate(join(dataDir, f));
          else { try { rec.date = dateOf(JSON.parse(readFileSync(join(dataDir, f), 'utf8'))); } catch (_) { rec.date = null; } }
        }
        seen.set(f, rec);
      }
      const r = reg[f];
      /* a live table (written in place on this computer) or a JSON list may be dated by its file time, as declared in the register */
      const date = (r && (r.live || r.fileTime)) ? new Date(st.mtimeMs).toISOString() : rec.date;
      if (rec.big && !date) { tooBig.push(f); continue; }
      if (!date) { undated.push(f); continue; }
      const maxD = r && r.maxAgeDays != null ? Number(r.maxAgeDays) : null;
      const ageD = (now - Date.parse(date)) / 864e5;
      if (maxD != null && isFinite(ageD) && ageD > maxD) stale.push({ table: f, date: date.slice(0, 16), ageDays: Math.round(ageD * 10) / 10, maxAgeDays: maxD, writer: (r && r.writer) || null });
    }
    last = { at: new Date().toISOString(), tables: n, dated: n - undated.length - tooBig.length, undated, stale, notRead: tooBig };
    return last;
  }
  schedule(app, 'tables', 30 * 60e3, () => scan(), { firstMs: 90e3, label: 'served table ages (audit S-21)' });
  return { scan, status: () => last, __headDate: headDate };   /* v236 · __headDate for scripts/tests236/headdate.test.mjs */
}
