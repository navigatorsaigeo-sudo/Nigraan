/* ══ v91.17.216 · THE AGN DATA LAKE, READ SIDE ═══════════════════════════════════════════════════════════════════════════════
   One copy of the data NIGRAAN, LAMHA and the agn-platform share lives in AGN_LAKE (D:\DATA LAKE\AGN_LAKE on AIGEO since 11 Oct 2026, the old
   D:\AGN_LAKE, or the AGN_LAKE environment variable). The lake's rules, applied here:
     - NIGRAAN never writes into the lake; it finds a dataset by id in catalogue\catalogue.json and reads the path given there;
     - freshness is checked, never assumed: a live dataset whose collector last succeeded more than staleMin ago, or whose newest
       observation is older than maxObsLagMin, is treated as missing (the caller keeps its own feed or says "not available");
     - visibility (public / derived / internal) travels with every dataset so a customer route can refuse an internal one.
   Nothing here fetches anything. When no lake is found the product keeps working on its own feeds, exactly as before. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createLake(opts = {}) {
  /* 12 Oct 2026 · NIGRAAN stands alone in D:\NIGRAAN: the lake is read only from NIGRAAN's own folder or NIGRAAN_LAKE.
     v91.17.269 · copy, not fetch: copies.mjs keeps a validated mirror of the datasets NIGRAAN uses (catalogue, status and files, the
     lake's own relative paths) in nig/copies/lake; that mirror is the root when it holds a catalogue (opts.root), else
     nig\agn-lake as before. opts.gate(id) is the copy's own check (copy current, content valid): fresh() also requires it. */
  const cands = [process.env.NIGRAAN_LAKE, opts.root, fileURLToPath(new URL('../../../agn-lake', import.meta.url))].filter(Boolean);
  /* the root is looked for again at most once a minute while it is not the mirror (the first copy run lands seconds after start) */
  let root = null, gated = false, rootAt = 0;
  function where() {
    if (rootAt && (gated || Date.now() - rootAt < 60e3)) return root;
    const r = cands.map((p) => resolve(p)).find((p) => existsSync(join(p, 'catalogue', 'catalogue.json'))) || null;
    if (r !== root) { root = r; CAT = null; }
    gated = !!(opts.gate && opts.root && root === resolve(opts.root) && !process.env.NIGRAAN_LAKE); rootAt = Date.now(); return root;
  }
  let CAT = null, catAt = 0;
  const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return null; } };
  function catalogue() {
    if (!where()) return null;
    if (CAT && Date.now() - catAt < 5 * 60e3) return CAT;
    const c = readJson(join(root, 'catalogue', 'catalogue.json')); if (c) { CAT = c; catAt = Date.now(); }
    return CAT;
  }
  function entry(id) { const c = catalogue(); return c ? (c.datasets || []).find((d) => d.id === id) || null : null; }
  /* a path inside the lake, never outside it (a catalogue path is data, not trusted to stay in the root) */
  function inRoot(rel) { if (!where() || !rel) return null; const p = resolve(root, String(rel).replace(/[\\/]+/g, sep)); return (p === root || p.startsWith(root + sep)) ? p : null; }
  /* the catalogue path of a dataset (its first token: some entries add notes after it); a YYYY/MMDD template stays for the caller */
  function path(id) { const e = entry(id); if (!e || !e.path) return null; return inRoot(String(e.path).trim().split(/\s+/)[0]); }
  function file(rel) { return inRoot(rel); }
  function status(id) { return where() ? readJson(join(root, 'status', id + '.json')) : null; }
  /* the lake's own freshness rule, the same one its health check uses */
  function fresh(id) {
    const e = entry(id); if (!e) return { ok: false, why: root ? 'not in the lake catalogue' : 'no lake on this computer' };
    if (gated) { const g = opts.gate(id); if (!g.ok) return { ok: false, why: 'copy: ' + g.why }; }
    if (e.state !== 'live') { const p = path(id); return p && existsSync(p) ? { ok: true, state: e.state } : { ok: false, why: 'dataset file missing in the lake' }; }
    const s = status(id); if (!s || !s.lastSuccessUtc) return { ok: false, why: 'the lake has not collected it yet' };
    const age = (Date.now() - Date.parse(s.lastSuccessUtc)) / 60e3;
    if (age > (e.staleMin || 120)) return { ok: false, why: 'collector last succeeded ' + Math.round(age) + ' min ago (limit ' + (e.staleMin || 120) + ')' };
    if (e.maxObsLagMin && s.latestObsUtc) { const oa = (Date.now() - Date.parse(s.latestObsUtc)) / 60e3; if (oa > e.maxObsLagMin) return { ok: false, why: 'newest observation ' + Math.round(oa) + ' min old (limit ' + e.maxObsLagMin + ')' }; }
    return { ok: true, state: 'live', lastSuccessUtc: s.lastSuccessUtc, latestObsUtc: s.latestObsUtc || null };
  }
  function summary(ids) {
    const c = catalogue();
    return { root: where() || null, mirror: gated, found: !!c, catalogueVersion: c ? c.version : null, catalogueUpdated: c ? c.updated : null,
      datasets: (ids || []).map((id) => { const e = entry(id), f = fresh(id); return { id, state: e ? e.state : null, visibility: e ? e.visibility : null, credit: e ? e.credit || null : null, ...f }; }) };
  }
  function mtime(p) { try { return statSync(p).mtimeMs; } catch (_) { return null; } }
  where();
  return { get root() { return where(); }, catalogue, entry, path, file, status, fresh, summary, mtime };
}

/* the Python the station-lake scripts use (same search as the archive jobs): NIGRAAN_PYTHON, the per-user install, else py / python3 */
export function pythonExe() {
  if (process.env.NIGRAAN_PYTHON) return process.env.NIGRAAN_PYTHON;
  if (process.env.LOCALAPPDATA) { const p = join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'); if (existsSync(p)) return p; }
  return process.platform === 'win32' ? 'py' : 'python3';
}
