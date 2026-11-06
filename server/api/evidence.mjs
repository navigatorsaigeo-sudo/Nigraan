/* ══ v91.17.283 · WS4 · THE MEASURED-SKILL EVIDENCE, ONE READER ═══════════════════════════════════════════════════════════════════
   Every client-facing accuracy or skill statement (methods sheet, AI answers, report forecast-basis page) is read from
   data/skill-evidence.json, which scripts/gen/gen_evidence.py generates from the SCI2821 evidence files kept under data/evidence/sci2821/
   (science summary + heat / cold contingency tables, each with its sha256). No surface types a skill number of its own (V-02).
   The hashes are re-checked here: a file that changed after the sentences were generated makes the evidence "stale" and the sentences
   are withheld with that reason (never shown as if current). Missing file -> { ready:false, why }. */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
let C = null, Cm = 0, Cfile = null, Cpaths = null, Ckey = null;

export function evidenceFile(dataDir) { return join(dataDir || process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'skill-evidence.json'); }

/* v91.17.283.7 · the live heat line (scripts/agents/verify.mjs -> data/agents/verify/client-lines.json) replaces the first heat sentence only
   when it rests on at least LIVE_MIN_DAYS days of live verification AND states its 95 % interval for both the hit rate and the false-alarm
   share; otherwise the generated SCI2821 text stays, unchanged */
export const LIVE_MIN_DAYS = 30;
export function liveHeatLine(dataDir) {
  const f = join(dirname(evidenceFile(dataDir)), 'agents', 'verify', 'client-lines.json'); let L = null; try { L = JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return null; }
  const ok = L && L.eligible === true && Number(L.days) >= LIVE_MIN_DAYS && typeof L.line === 'string' && L.line && L.pod && Array.isArray(L.pod.ci) && L.far && Array.isArray(L.far.ci) && /interval/.test(L.line);
  return ok ? { line: L.line, days: L.days, window: L.window || null } : null;
}
export function skillEvidence(dataDir) {
  const f = evidenceFile(dataDir);
  let m = 0; try { m = statSync(f).mtimeMs; } catch (_) { return { ready: false, why: 'the measured-skill evidence file is not installed (scripts/gen/gen_evidence.py)' }; }
  let lm = 0; try { lm = statSync(join(dirname(f), 'agents', 'verify', 'client-lines.json')).mtimeMs; } catch (_) {}
  m = m + '|' + lm;
  /* v91.17.283.8 · audit 8 · the cache is keyed on the underlying evidence files too (their size and modification time, as resolved at the last
     read): a changed CSV or summary under an unchanged skill-evidence.json is re-hashed, and a hash mismatch withholds the sentences */
  const fkey = () => (Cpaths || []).map((x) => { try { const st = statSync(x); return x + ':' + st.size + ':' + st.mtimeMs; } catch (_) { return x + ':missing'; } }).join('|');
  if (C && Cm === m && Cfile === f && Ckey === fkey()) return C;
  let E = null; try { E = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return { ready: false, why: 'the measured-skill evidence file is unreadable' }; }
  /* the evidence files the sentences were generated from must be the ones in the tree (path relative to the install root or the data dir) */
  const base = dirname(f), stale = [], paths = [];
  for (const [p, h] of Object.entries(E.evidence || {})) {
    const cand = [join(ROOT, p), join(base, p.replace(/^data\//, ''))].find((x) => existsSync(x));
    paths.push(cand || join(base, p.replace(/^data\//, '')));
    if (!cand) { stale.push(p + ' missing'); continue; }
    try { const got = createHash('sha256').update(readFileSync(cand)).digest('hex'); if (got !== h) stale.push(p + ' changed'); } catch (_) { stale.push(p + ' unreadable'); }
  }
  C = stale.length ? { ready: false, why: 'the measured-skill evidence is stale (' + stale.join('; ') + '): regenerate with scripts/gen/gen_evidence.py', stale }
    : { ready: true, ...E };
  if (C.ready) { const live = liveHeatLine(dataDir); if (live && C.lines && Array.isArray(C.lines.heat)) C = { ...C, lines: { ...C.lines, heat: [live.line, ...C.lines.heat.slice(1)] }, liveHeat: live }; }
  Cm = m; Cfile = f; Cpaths = paths; Ckey = fkey();
  return C;
}

/* the client sentences, in the order a reader needs them; [] when the evidence is not ready */
export function evidenceLines(dataDir, which = ['temperature', 'heat', 'cold']) {
  const E = skillEvidence(dataDir); if (!E.ready) return [];
  return which.flatMap((k) => (E.lines && E.lines[k]) || []);
}

/* what a client reads about the evidence: the sentences, the test windows and the file hashes; no source names */
export function evidenceForClient(dataDir) {
  const E = skillEvidence(dataDir);
  if (!E.ready) return { ready: false, why: E.why };
  return { ready: true, built: E.built, lines: E.lines, windows: { dailyTemperature: E.temperature.daily.window, hourlyTemperature: E.temperature.hourlyWindow, heat: E.heat.window },
    evidence: E.evidence, note: 'measured out of sample: stations never used in training, or a period after the fitting window; generated from the evidence files named here' };
}
