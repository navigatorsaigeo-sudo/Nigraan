/* ══ v91.17.93 · THE DAILY RIVER SHEET FROM GOOGLE DRIVE ═════════════════════════════════════════════════════════════
   CEO 30 Sep: "google drive link — every day the FFD record will come to this; automatic fetch from here".
   The AGN team copies the public FFD river figures by hand into a file on AGN's own Google Drive (allowed: a person copies
   the public page; no agent reads the FFD site). This module reads THAT file, never the FFD site:
     link     data/ffd-drive.json { "url": "<the share link>" }, set from the operations page or by editing the file.
              A Google Sheet   docs.google.com/spreadsheets/d/<id>/...  -> downloaded as .csv (export of the linked tab, gid)
              A Drive file     drive.google.com/file/d/<id>/...           -> downloaded as it is (uc?export=download)
              A Drive folder   drive.google.com/drive/folders/<id>        -> every file in it not taken before
              The link must be shared "Anyone with the link can view". No Google login and no key are used or stored.
     when     2 minutes after start-up, then every hour (v91.17.260; was 10 min; the sheet is checked by content hash, so an unchanged
              sheet is not loaded again; FFD itself publishes one value per station per day)
     where    a new or changed file is saved into DROP_DATA_HERE as ffd_drive_<date>_<n>.<ext>; the drop import then loads it
              as the daily river sheet (same layout as before: Date, Station, INFLOW, OUTFLOW ...) and re-issues the outlook
     memory   data/ffd-drive-state.json: the content hash of every file taken, so the same sheet is never loaded twice
   INTERNAL: FFD figures are "All rights reserved" and stay internal (calibration and AGN's own outlook). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { schedule } from './scheduler.mjs';

export function createDriveFetch(app, root, dataDir, dropFolder) {
  const cfgFile = join(dataDir, 'ffd-drive.json'), stFile = join(dataDir, 'ffd-drive-state.json');
  let busy = false, last = null;
  const read = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
  const state = () => read(stFile, { seen: {}, runs: [] });
  function parse(u) {
    const s = String(u || '').trim(); let m;
    if ((m = s.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})/))) return { kind: 'sheet', id: m[1], gid: (s.match(/[#&?]gid=(\d+)/) || [])[1] || '0' };
    if ((m = s.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?)?folders\/([\w-]{20,})/))) return { kind: 'folder', id: m[1] };
    if ((m = s.match(/drive\.google\.com\/file\/d\/([\w-]{20,})/)) || (m = s.match(/[?&]id=([\w-]{20,})/))) return { kind: 'file', id: m[1] };
    return null;
  }
  async function get(url) {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'NIGRAAN/91.17.93 (AGN; own Drive file)' }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for the Drive link (is it shared "Anyone with the link"?)');
    const buf = Buffer.from(await r.arrayBuffer()); const ct = r.headers.get('content-type') || '';
    const cd = r.headers.get('content-disposition') || ''; const fn = (cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i) || [])[1] || '';
    return { buf, ct, fn: decodeURIComponent(fn) };
  }
  const extOf = (g, kind) => kind === 'sheet' ? 'csv' : /\.(csv|xlsx|xls)$/i.test(g.fn) ? g.fn.split('.').pop().toLowerCase() : /csv/.test(g.ct) ? 'csv' : /sheet|excel|zip|octet/.test(g.ct) ? 'xlsx' : null;
  async function files(p) {
    if (p.kind === 'sheet') return [{ id: p.id, url: `https://docs.google.com/spreadsheets/d/${p.id}/export?format=csv&gid=${p.gid || '0'}`, kind: 'sheet' }];   /* csv: no Excel reader needed on the laptop */
    if (p.kind === 'file') return [{ id: p.id, url: `https://drive.google.com/uc?export=download&id=${p.id}`, kind: 'file' }];
    /* a shared folder: its public embedded view lists the files (id + name) */
    const g = await get(`https://drive.google.com/embeddedfolderview?id=${p.id}#list`); const html = g.buf.toString('utf8'); const out = []; const seen = new Set();
    for (const m of html.matchAll(/https:\/\/(?:drive|docs)\.google\.com\/(file\/d|spreadsheets\/d)\/([\w-]{20,})[^"]*"[^>]*>(?:[\s\S]{0,400}?class="flip-entry-title">([^<]+))?/g)) {
      if (seen.has(m[2])) continue; seen.add(m[2]);
      out.push(m[1] === 'spreadsheets/d' ? { id: m[2], name: m[3], url: `https://docs.google.com/spreadsheets/d/${m[2]}/export?format=csv`, kind: 'sheet' }
        : { id: m[2], name: m[3], url: `https://drive.google.com/uc?export=download&id=${m[2]}`, kind: 'file' });
    }
    if (!out.length) throw new Error('the folder view listed no files (is the folder shared "Anyone with the link"?)');
    return out;
  }
  async function run() {
    if (busy) return { busy: true }; busy = true;
    const cfg = read(cfgFile, {}); const S = state(); const rec = { at: new Date().toISOString(), taken: [], skipped: 0, error: null };
    try {
      if (!cfg.url) { rec.error = 'no Google Drive link set (data/ffd-drive.json)'; return rec; }
      const p = parse(cfg.url); if (!p) { rec.error = 'the link is not a Google Sheet, Drive file or Drive folder link'; return rec; }
      for (const f of await files(p)) {
        const g = await get(f.url); const h = createHash('sha256').update(g.buf).digest('hex').slice(0, 20);
        if (S.seen[h]) { rec.skipped++; continue; }
        if (/text\/html/.test(g.ct)) { rec.error = 'Google answered with a web page, not the file (share setting, or a large-file warning)'; continue; }
        const ext = extOf(g, f.kind); if (!ext) { rec.skipped++; continue; }
        const name = `ffd_drive_${rec.at.slice(0, 10)}_${Object.keys(S.seen).length + 1}.${ext}`;
        writeFileSync(join(dropFolder, name), g.buf); S.seen[h] = { at: rec.at, name, src: f.name || f.id }; rec.taken.push(name);
      }
      if (rec.taken.length && app.dropImport) { try { await app.dropImport.run(); } catch (_) {} }
    } catch (e) { rec.error = String(e.message || e).slice(0, 200); }
    finally { busy = false; last = rec; S.runs = [rec].concat(S.runs || []).slice(0, 30); try { writeFileSync(stFile, JSON.stringify(S, null, 1)); } catch (_) {} }
    return rec;
  }
  function setUrl(u) { const p = parse(u); if (!p) return { ok: false, why: 'not a Google Sheet, Drive file or Drive folder link' }; writeFileSync(cfgFile, JSON.stringify({ url: String(u).trim(), set: new Date().toISOString() }, null, 1)); return { ok: true, kind: p.kind }; }
  function status() { const cfg = read(cfgFile, {}); const S = state(); const p = parse(cfg.url);
    return { configured: !!p, kind: p ? p.kind : null, set: cfg.set || null, every: Math.max(10, Number(process.env.NIGRAAN_FFD_EVERY_MIN) || 60) + ' min', last: last || (S.runs || [])[0] || null, filesTaken: Object.keys(S.seen || {}).length, dropFolder }; }
  /* v91.17.260 · hourly, not every 10 min (CEO 13 Oct: "why so many times"). The sheet carries one reading per station per day
     (152 days checked, 5 May - 13 Oct 2026: 31 stations, mostly the 06 PKT figure), so 144 checks a day found one change; hourly
     finds it within the hour. NIGRAAN_FFD_EVERY_MIN overrides (minimum 10). */
  const everyMin = Math.max(10, Number(process.env.NIGRAAN_FFD_EVERY_MIN) || 60);
  schedule(app, 'driveFetch', everyMin * 60 * 1000, () => run(), { firstMs: 2 * 60 * 1000, label: 'river sheet (Google Drive), hourly' });
  return { run, status, setUrl, parse };
}
