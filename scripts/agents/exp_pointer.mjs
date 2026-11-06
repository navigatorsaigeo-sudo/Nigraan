/* == v91.17.283.10 . AGENT 6: PROMOTION BY THE OWNER ONLY (APPROVE / REVERT A DATA POINTER) =========================================
   The experimentation agent never promotes and never changes a served value. It writes a promotion record. Only the owner promotes:
     node scripts/gen/exp_approve.mjs approve <promotion record> --confirm <experiment id>      (on the laptop)
     the operator page's "Approve" button (POST /api/ops/experiments/approve: loopback operator only, explicit typed confirmation)
   Both call approve() below. It flips ONE data pointer, keeps the previous pointer inside the new one ("previous"), and is revertible:
     node scripts/gen/exp_approve.mjs revert <target> --confirm <target>    /  POST /api/ops/experiments/revert
   Every approve, revert and refusal is appended to data/agents/experiments/approvals.jsonl (and one ASCII line to _admin\alerts.log).
   Targets (the only things an approval can change):
     blend-weights    data/blend-weights-active.json (version, file, sha256, sourceRun, previous): the format of scripts/gen/blend_promote.mjs;
                      the candidate weights file is copied into the data folder under its own name (never over another file)
     (nonrep-stations: removed v91.17.283.14 - no station list exists any more; values are judged by server/api/obsqc.mjs)
     fx-model-served  data/flood-extent/fx-model.json "served": false -> true; the file before the change is kept beside it
                      (fx-model.prev-<stamp>.json) and named in the log, so revert restores it byte for byte
     ews-anchor-live  v91.17.283.25 · data/ews-live-anchor.json "live": false -> true (the EWS live anchor, shadow until then); the record is
                      the verification agent's data/agents/verify/ews-anchor-promotion.json (id ews-anchor@1). Refused while the file names
                      no servingHook (this build has none: nothing would serve the anchor); the file before the change is kept beside it
     ifs-mos-retrain  (28 Oct 2026, the automatic monthly retrain, station-lake/retrain/auto) data/ifs-mos-retrain-active.json (version, dir,
                      files with sha256, bundleSha256, previous). The record (data/agents/experiments/runs/<day>/ifs-mos-retrain_<month>/) holds
                      bundle.json (the artefact) and the coefficient files it lists; approval checks every sha256, copies the files into
                      data/ifs-mos-retrain/<version>/ (a new folder, never over other content), then swaps the pointer in one rename, keeping
                      the previous pointer inside the new one. Revert swaps back (the previous files are checked first; the first approval
                      reverts to "no retrained set"). Older version folders are kept. The server reads the pointer in ONE place,
                      server/api/ifsretrain.mjs (servingHook): the approved files serve on IFS-basis hours only (the ecmwf010 substitution,
                      NIGRAAN_ECMWF010_SERVE=1) and replace the coefficient source each was gated against; its status() says per file
                      whether it is served and why not (ridge, gust and rain files are approved but not served by this build).
   A record is refused unless: promote is true; the pointer target is one of these; the artefact's sha256 matches the record; the target
   is still what it was when the record was written (fromSha256: nothing changed since the evaluation); the record is not approved yet.
   No network code. */
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const rj = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return d; } };
const wAtomic = (f, s) => { mkdirSync(dirname(f), { recursive: true }); const t = f + '.tmp' + process.pid; writeFileSync(t, s); renameSync(t, f); };
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').slice(0, 15);
export const TARGETS = ['blend-weights', 'fx-model-served', 'ews-anchor-live', 'ifs-mos-retrain'];
const IFS_PTR = 'ifs-mos-retrain-active.json', IFS_DIR = 'ifs-mos-retrain';
const NONE_SET = { version: 'none (no retrained set)', dir: null, files: [] };

/* what the target holds now: { version, file, sha256 } of the pointer's subject */
export function targetState(dataDir, target) {
  if (target === 'blend-weights') { const P = rj(join(dataDir, 'blend-weights-active.json')); return P ? { pointer: 'blend-weights-active.json', version: P.version, file: P.file, sha256: P.sha256, previous: P.previous ? { version: P.previous.version, file: P.previous.file } : null } : { pointer: 'blend-weights-active.json', version: null, file: null, sha256: null, previous: null }; }
  if (target === 'fx-model-served') { const f = join(dataDir, 'flood-extent', 'fx-model.json'); const b = existsSync(f) ? readFileSync(f) : null; let j = null; try { j = b ? JSON.parse(b.toString('utf8')) : null; } catch (_) {}
    return { pointer: 'flood-extent/fx-model.json "served"', version: j ? 'served=' + (j.served === true) : null, file: 'flood-extent/fx-model.json', sha256: b ? sha(b) : null, served: j ? j.served === true : null }; }
  if (target === 'ews-anchor-live') { const f = join(dataDir, 'ews-live-anchor.json'); const b = existsSync(f) ? readFileSync(f) : null; let j = null; try { j = b ? JSON.parse(b.toString('utf8')) : null; } catch (_) {}
    return { pointer: 'ews-live-anchor.json "live"', version: j ? 'live=' + (j.live === true) : null, file: 'ews-live-anchor.json', sha256: b ? sha(b) : null, live: j ? j.live === true : null, servingHook: j ? j.servingHook || null : null }; }
  if (target === 'ifs-mos-retrain') { const f = join(dataDir, IFS_PTR); const b = existsSync(f) ? readFileSync(f) : null; let j = null; try { j = b ? JSON.parse(b.toString('utf8')) : null; } catch (_) {}
    return { pointer: IFS_PTR, version: j ? j.version : null, file: j ? j.dir : null, sha256: b ? sha(b) : null, files: j && Array.isArray(j.files) ? j.files.map((x) => x.name) : [],
      previous: j && j.previous ? { version: j.previous.version, file: j.previous.dir } : null, servingHook: j ? j.servingHook || null : null }; }
  return null;
}
function log(dataDir, adminDir, rec) {
  const f = join(dataDir, 'agents', 'experiments', 'approvals.jsonl'); mkdirSync(dirname(f), { recursive: true });
  appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), ...rec }) + '\n');
  if (adminDir && existsSync(adminDir)) { try { appendFileSync(join(adminDir, 'alerts.log'), (new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' PKT  EXPERIMENT ' + rec.action.toUpperCase() + ' ' + (rec.id || rec.target || '') + ': ' + (rec.result || '') + (rec.why ? ' (' + rec.why + ')' : '') + ' by ' + (rec.by || '?') + ' via ' + (rec.via || '?')).replace(/[^\x20-\x7e]/g, '?') + '\r\n'); } catch (_) {} }
}
export function logRefusal(dataDir, adminDir, rec) { log(dataDir, adminDir, { ...rec, action: rec.action || 'approve', result: 'refused' }); }
export const recKey = (f) => String(f || '').split(/[\\/]/).filter(Boolean).slice(-3).join('/');   /* <week>/<id>/promotion.json */
export const readApprovals = (dataDir) => { try { return readFileSync(join(dataDir, 'agents', 'experiments', 'approvals.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); } catch (_) { return []; } };
/* v91.17.283.24 · self-audit J21 · ONE rule for "this promotion record is approved" (approve() below, the operator page agents_exp.mjs and the
   weekly report proposals.mjs): a done approval of THAT record (its <week>/<id>/promotion.json key) made at or after the record was
   written. Before, the page tested the experiment id with at >= the record time and the report with at > (an approval in the same
   millisecond counted on one and not the other), and approve() tested the key with no time (a record re-written later the same week
   counted as approved) */
export function approvedFor(approvals, recFileOrKey, recAt) { const k = recKey(recFileOrKey), t = Date.parse(recAt || '');
  return (approvals || []).some((x) => x && x.action === 'approve' && x.result === 'done' && x.record === k && (!Number.isFinite(t) || Date.parse(x.at) >= t)); }

/* approve: returns { ok, result, why?, from, to } ; nothing changes unless ok */
export function approve(recFile, o) {
  const { dataDir, adminDir = null, by = 'owner', via = 'command', confirm = null, validate = {} } = o;
  const refuse = (why, extra = {}) => { logRefusal(dataDir, adminDir, { action: 'approve', record: recKey(recFile), id: extra.id || null, by, via, why }); return { ok: false, result: 'refused', why }; };
  const R = rj(recFile); if (!R) return refuse('promotion record not found or unreadable');
  if (confirm !== R.id) return refuse('explicit confirmation missing: type the experiment id ' + R.id + ' to approve', { id: R.id });
  if (R.promote !== true) return refuse('the promotion record says promote = ' + R.promote + (R.reasons && R.reasons.length ? ' (' + R.reasons[0] + ')' : ''), { id: R.id });
  const P = R.pointer; if (!P || !TARGETS.includes(P.target)) return refuse('no data pointer this approval may change', { id: R.id });
  if (approvedFor(readApprovals(dataDir), recFile, R.at)) return refuse('this record was already approved', { id: R.id });
  const now = targetState(dataDir, P.target); if (!now || now.sha256 !== P.fromSha256) return refuse('the target changed since the evaluation (' + (now && now.sha256 || 'none').slice(0, 12) + ' vs ' + String(P.fromSha256).slice(0, 12) + '): re-run the experiment', { id: R.id });
  const runDir = dirname(recFile); let to;
  if (P.target === 'blend-weights') {
    const A = R.artefact; if (!A || !A.file || !/^[\w.-]+\.json$/.test(basename(A.file))) return refuse('the record names no candidate artefact', { id: R.id });
    const src = join(runDir, basename(A.file)); if (!existsSync(src)) return refuse('candidate artefact ' + basename(A.file) + ' not found next to the record', { id: R.id });
    const buf = readFileSync(src); if (sha(buf) !== A.sha256) return refuse('candidate checksum ' + sha(buf).slice(0, 12) + ' does not match the record ' + String(A.sha256).slice(0, 12), { id: R.id });
    const v = validate[P.target]; if (v) { try { v(JSON.parse(buf.toString('utf8'))); } catch (e) { return refuse('candidate does not parse as served data: ' + e.message, { id: R.id }); } }
    const name = basename(A.file), dst = join(dataDir, name);
    if (existsSync(dst) && sha(readFileSync(dst)) !== A.sha256) return refuse(name + ' already exists in the data folder with other content', { id: R.id });
    copyFileSync(src, dst);
    const pf = join(dataDir, 'blend-weights-active.json'); const cur = rj(pf);
    const prev = cur ? { ...cur, previous: undefined } : null;
    const about = (cur && cur.about) || undefined;
    const next = { about, version: R.version, file: name, sha256: A.sha256, sourceRun: R.sourceRun, promotedAt: new Date().toISOString(), rule: R.rule, approvedBy: by, approvedVia: via, experiment: R.id, previous: prev };
    wAtomic(pf, JSON.stringify(next, null, 1)); to = { version: next.version, file: name, sha256: A.sha256 };
  } else if (P.target === 'fx-model-served') {
    const f = join(dataDir, 'flood-extent', 'fx-model.json'); const buf = readFileSync(f); const j = JSON.parse(buf.toString('utf8'));
    if (j.served === true) return refuse('the flood extent model is already served', { id: R.id });
    const keep = 'fx-model.prev-' + stamp() + '.json'; writeFileSync(join(dataDir, 'flood-extent', keep), buf);
    j.served = true; j.servedBy = { experiment: R.id, approvedAt: new Date().toISOString(), by, previousFile: keep, previousSha256: sha(buf) };
    const s = JSON.stringify(j, null, 1); wAtomic(f, s); to = { version: 'served=true', file: 'flood-extent/fx-model.json', sha256: sha(Buffer.from(s)), previousFile: keep };
  } else if (P.target === 'ews-anchor-live') {
    const f = join(dataDir, 'ews-live-anchor.json'); const buf = readFileSync(f); const j = JSON.parse(buf.toString('utf8'));
    if (j.live === true) return refuse('the EWS anchor is already live', { id: R.id });
    if (!j.servingHook) return refuse('no serving hook in this build: nothing would serve the EWS anchor (' + (j.servingHookWhy || 'a later package adds it') + ')', { id: R.id });
    const keep = 'ews-live-anchor.prev-' + stamp() + '.json'; writeFileSync(join(dataDir, keep), buf);
    j.live = true; j.mode = 'live'; j.liveBy = { experiment: R.id, approvedAt: new Date().toISOString(), by, previousFile: keep, previousSha256: sha(buf) };
    const s = JSON.stringify(j, null, 1); wAtomic(f, s); to = { version: 'live=true', file: 'ews-live-anchor.json', sha256: sha(Buffer.from(s)), previousFile: keep };
  }
  else if (P.target === 'ifs-mos-retrain') {
    const A = R.artefact; if (!A || A.file !== 'bundle.json') return refuse('the record names no bundle.json', { id: R.id });
    const bf = join(runDir, 'bundle.json'); if (!existsSync(bf)) return refuse('bundle.json not found next to the record', { id: R.id });
    const bb = readFileSync(bf); if (sha(bb) !== A.sha256) return refuse('bundle checksum ' + sha(bb).slice(0, 12) + ' does not match the record ' + String(A.sha256).slice(0, 12), { id: R.id });
    let B; try { B = JSON.parse(bb.toString('utf8')); } catch (e) { return refuse('bundle.json does not parse: ' + e.message, { id: R.id }); }
    const ver = String(B.version || R.version || ''); if (!/^[\w.-]+$/.test(ver) || ver !== R.version) return refuse('the bundle version ' + ver + ' is not the record\'s ' + R.version, { id: R.id });
    if (!Array.isArray(B.files) || !B.files.length) return refuse('the bundle lists no coefficient file', { id: R.id });
    const bufs = [];
    for (const x of B.files) { const n = basename(String(x.name || '')); if (!/^[\w.-]+\.json$/.test(n) || n !== x.name) return refuse('bad file name in the bundle: ' + x.name, { id: R.id });
      const p = join(runDir, n); if (!existsSync(p)) return refuse(n + ' not found next to the record', { id: R.id });
      const b = readFileSync(p); if (sha(b) !== x.sha256) return refuse(n + ' checksum does not match the bundle', { id: R.id });
      try { const j = JSON.parse(b.toString('utf8')); if (!j || typeof j !== 'object' || !j.zones) throw new Error('no zones'); if (B.rules_sha256 && !String(j.rules || '').includes(B.rules_sha256)) throw new Error('other rules'); } catch (e) { return refuse(n + ' is not a coefficient file of the registered rules: ' + e.message, { id: R.id }); }
      bufs.push([n, b]); }
    const vdir = join(dataDir, IFS_DIR, ver);
    for (const [n, b] of bufs) { const d = join(vdir, n); if (existsSync(d) && sha(readFileSync(d)) !== sha(b)) return refuse(IFS_DIR + '/' + ver + '/' + n + ' already exists with other content', { id: R.id }); }
    mkdirSync(vdir, { recursive: true });
    for (const [n, b] of bufs) { const d = join(vdir, n); if (!existsSync(d)) wAtomic(d, b); }
    writeFileSync(join(vdir, 'bundle.json'), bb);
    const pf = join(dataDir, IFS_PTR); const cur = rj(pf);
    const prev = cur && cur.version ? { ...cur, previous: undefined } : { ...NONE_SET };
    const next = { about: 'the active set of IFS bias-removal coefficient files (automatic monthly retrain). Swapped only by scripts/gen/exp_approve.mjs approve / revert (target ifs-mos-retrain). Read by server/api/ifsretrain.mjs (IFS-basis hours only; GET /api/ecmwf010/retrain, operator view)',
      version: ver, dir: IFS_DIR + '/' + ver, files: B.files.map((x) => ({ name: x.name, sha256: x.sha256, candidate: x.candidate, family: x.family, zones: x.zones })),
      bundleSha256: A.sha256, period: B.period, rulesSha256: B.rules_sha256, registrationSha256: B.registration_sha256, sourceRun: R.sourceRun, promotedAt: new Date().toISOString(),
      approvedBy: by, approvedVia: via, experiment: R.id, servingHook: 'server/api/ifsretrain.mjs', previous: prev };
    const s = JSON.stringify(next, null, 1); wAtomic(pf, s); to = { version: ver, file: next.dir, sha256: sha(Buffer.from(s)) };
  }
  const from = { version: now.version, file: now.file, sha256: now.sha256 };
  log(dataDir, adminDir, { action: 'approve', result: 'done', record: recKey(recFile), id: R.id, target: P.target, from, to, by, via });
  return { ok: true, result: 'done', target: P.target, from, to };
}

export function revert(target, o) {
  const { dataDir, adminDir = null, by = 'owner', via = 'command', confirm = null } = o;
  const refuse = (why) => { logRefusal(dataDir, adminDir, { action: 'revert', target, by, via, why }); return { ok: false, result: 'refused', why }; };
  if (!TARGETS.includes(target)) return refuse('unknown target');
  if (confirm !== target) return refuse('explicit confirmation missing: type the target name ' + target + ' to revert');
  const now = targetState(dataDir, target); let to;
  if (target === 'blend-weights') {
    const pf = join(dataDir, 'blend-weights-active.json'); const cur = rj(pf);
    if (!cur || !cur.previous) return refuse('the pointer has no previous entry');
    const p = cur.previous; if (!p.file || !existsSync(join(dataDir, p.file)) || sha(readFileSync(join(dataDir, p.file))) !== p.sha256) return refuse('the previous file ' + p.file + ' is missing or changed');
    wAtomic(pf, JSON.stringify({ ...p, about: cur.about, revertedAt: new Date().toISOString(), revertedBy: by, previous: { ...cur, previous: undefined } }, null, 1)); to = { version: p.version, file: p.file, sha256: p.sha256 };
  } else if (target === 'ews-anchor-live') {
    const f = join(dataDir, 'ews-live-anchor.json'); const j = rj(f); const keep = j && j.liveBy && j.liveBy.previousFile;
    if (!keep || !existsSync(join(dataDir, keep))) return refuse('no kept previous file for the EWS anchor');
    const b = readFileSync(join(dataDir, keep)); if (sha(b) !== j.liveBy.previousSha256) return refuse('the kept previous file changed');
    wAtomic(f, b); to = { version: 'live=false', file: 'ews-live-anchor.json', sha256: sha(b) };
  } else if (target === 'ifs-mos-retrain') {
    const pf = join(dataDir, IFS_PTR); const cur = rj(pf);
    if (!cur || !cur.previous) return refuse('the pointer has no previous entry');
    const p = cur.previous;
    for (const x of (p.files || [])) { const fp = join(dataDir, String(p.dir || ''), basename(String(x.name || ''))); if (!p.dir || !existsSync(fp) || sha(readFileSync(fp)) !== x.sha256) return refuse('the previous file ' + (p.dir || '?') + '/' + x.name + ' is missing or changed'); }
    const back = { ...p, revertedAt: new Date().toISOString(), revertedBy: by, previous: { ...cur, previous: undefined } };
    const s = JSON.stringify(back, null, 1); wAtomic(pf, s); to = { version: p.version, file: p.dir, sha256: sha(Buffer.from(s)) };
  } else {
    const f = join(dataDir, 'flood-extent', 'fx-model.json'); const j = rj(f); const keep = j && j.servedBy && j.servedBy.previousFile;
    if (!keep || !existsSync(join(dataDir, 'flood-extent', keep))) return refuse('no kept previous file for the flood extent model');
    const b = readFileSync(join(dataDir, 'flood-extent', keep)); if (sha(b) !== j.servedBy.previousSha256) return refuse('the kept previous file changed');
    wAtomic(f, b); to = { version: 'served=false', file: 'flood-extent/fx-model.json', sha256: sha(b) };
  }
  log(dataDir, adminDir, { action: 'revert', result: 'done', target, from: { version: now.version, file: now.file, sha256: now.sha256 }, to, by, via });
  return { ok: true, result: 'done', target, from: { version: now.version, file: now.file, sha256: now.sha256 }, to };
}
