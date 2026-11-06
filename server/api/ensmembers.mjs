/* == v91.17.284 . ENS MEMBER ARCHIVE (zero provider calls) ======================================================================
   The 15-day outlook (outlook.mjs runEnsemble) already receives all 51 ECMWF IFS ENS members (control + 50) of six daily variables
   for every tehsil, twice a day (00 and 12 UTC runs). Until now only percentiles, probabilities and a few lead days of the median
   were kept (ensemble-log), so a member-level correction or a CRPS could never be trained on forecasts as they were issued. This
   module writes the RAW members (as the provider answered, before the ERA5 shift, the MACH running bias, the station calibration
   and the AI local term) once per run, from the response the outlook already holds. It makes no request of its own.
   FILES     data/ens_members/<issue PKT day>/ecmwf_ifs025_<run tag>.i16   the values (little-endian int16)
             data/ens_members/<issue PKT day>/ecmwf_ifs025_<run tag>.json  the header (layout, units, members, days, tehsils, sha256)
             run tag = the provider run time YYYYMMDDHH (from the model metadata the outlook already reads), or f<YYYYMMDDHHmm> (fetch
             time, UTC) when the run is not known (a manual or bias-job refresh).
   LAYOUT    unit-major: for unit u (header units[u]), variable v (header vars), member m (header members), day d (header days):
             index = ((u * V + v) * M + m) * D + d;  value = int16 / 10 in the variable's unit;  -32768 = missing
             (0.1 resolution is the precision the outlook already rounds to; int16 holds -3276.7 .. 3276.7)
   SAFETY    never throws into the outlook (every call is wrapped); a replayed batch (NIGRAAN_OUTLOOK_REPLAY_DIR) is not written;
             written to a .part file and renamed; a run already written with at least as many tehsils is not written again.
   RETENTION NIGRAAN_ENS_MEMBERS_KEEP_DAYS (default 0 = keep every day); NIGRAAN_ENS_MEMBERS_CAP_GB (default 12): at the cap
             nothing more is written and status() says so (nothing is deleted at the cap). NIGRAAN_ENS_MEMBERS=0 turns the archive off. */
import { mkdirSync, writeFileSync, renameSync, existsSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const MISSING = -32768;
export const SCALE = 10;
const pktDay = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);
const tagOf = (sec) => new Date(sec * 1000).toISOString().slice(0, 13).replace(/[-T]/g, '');

export function createEnsMembers(dataDir, env = process.env) {
  const root = join(dataDir, 'ens_members');
  const on = () => env.NIGRAAN_ENS_MEMBERS !== '0';
  const capBytes = () => (Number(env.NIGRAAN_ENS_MEMBERS_CAP_GB) > 0 ? Number(env.NIGRAAN_ENS_MEMBERS_CAP_GB) : 12) * 1024 ** 3;
  const keepDays = () => Math.max(0, Math.floor(Number(env.NIGRAAN_ENS_MEMBERS_KEEP_DAYS) || 0));
  const st = { last: null, lastError: null, written: 0, skipped: null, bytes: null };

  function usedBytes() {
    let n = 0; try { for (const d of readdirSync(root)) { const p = join(root, d); try { if (!statSync(p).isDirectory()) continue; for (const f of readdirSync(p)) n += statSync(join(p, f)).size; } catch (_) {} } } catch (_) {}
    return n;
  }
  function prune(nowMs = Date.now()) {
    const k = keepDays(); if (!k) return 0; const cut = pktDay(nowMs - k * 864e5); let n = 0;
    try { for (const d of readdirSync(root)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < cut) { rmSync(join(root, d), { recursive: true, force: true }); n++; } } catch (_) {}
    return n;
  }

  /* one run: begin() -> add() per tehsil -> end(). vars: { short: provider daily name } in the outlook's order */
  function begin({ model, vars, runInit = null, latestInit = null, fetchedMs = Date.now() } = {}) {
    if (!on()) { st.skipped = 'off (NIGRAAN_ENS_MEMBERS=0)'; return null; }
    const V = Object.entries(vars || {}); if (!V.length) return null;
    return { model: model || 'ecmwf_ifs025', vars: V, runInit, latestInit, fetchedMs, days: null, members: null, rows: [], units: [] };
  }
  function add(run, u, d, M) {
    if (!run) return;
    try {
      if (!d || !Array.isArray(d.time) || !d.time.length) return;
      if (!run.days) run.days = d.time.slice();
      else if (run.days.length !== d.time.length || run.days[0] !== d.time[0]) return;   /* another day axis: not this run's layout */
      const first = run.vars[0][1];
      const labels = Object.keys(d).filter((k) => k === first || k.startsWith(first + '_member')).sort().map((k) => k === first ? 'control' : k.slice(first.length + 1));
      if (!run.members) run.members = labels;
      const Mn = run.members.length, Dn = run.days.length, Vn = run.vars.length;
      const a = new Int16Array(Vn * Mn * Dn).fill(MISSING);
      run.vars.forEach(([short], v) => { const rows = M[short] || [];
        for (let m = 0; m < Mn && m < rows.length; m++) { const r = rows[m] || [];
          for (let k = 0; k < Dn; k++) { const x = r[k]; if (x == null || !Number.isFinite(x)) continue; const q = Math.round(x * SCALE); if (q > 32767 || q <= MISSING) continue; a[(v * Mn + m) * Dn + k] = q; } } });
      run.rows.push(a); run.units.push({ id: u.unitId, lat: u.lat, lon: u.lon, elevM: u.elevM ?? null });
    } catch (e) { st.lastError = 'add: ' + e.message; }
  }
  function end(run, extra = {}) {
    if (!run) return { written: false, why: st.skipped || 'not started' };
    try {
      if (!run.units.length) return { written: false, why: 'no tehsil carried members' };
      prune();
      const tag = run.runInit ? tagOf(run.runInit) : 'f' + new Date(run.fetchedMs).toISOString().slice(0, 16).replace(/[-T:]/g, '');
      const issueDay = run.runInit ? pktDay(run.runInit * 1000) : pktDay(run.fetchedMs);
      const dir = join(root, issueDay), base = join(dir, run.model + '_' + tag);
      if (existsSync(base + '.json')) { let prev = null; try { prev = JSON.parse(readFileSync(base + '.json', 'utf8')); } catch (_) {}
        if (prev && prev.units && prev.units.length >= run.units.length) { st.skipped = 'run ' + tag + ' already written (' + prev.units.length + ' tehsils)'; return { written: false, why: st.skipped }; } }
      const buf = Buffer.concat(run.rows.map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)));   /* little-endian on x86 / x64 */
      const used = usedBytes(); st.bytes = used;
      if (used + buf.length > capBytes()) { st.skipped = 'storage cap reached (' + Math.round(used / 1048576) + ' MB of ' + Math.round(capBytes() / 1048576) + ' MB): run ' + tag + ' not written'; return { written: false, why: st.skipped }; }
      mkdirSync(dir, { recursive: true });
      const head = { what: 'raw ECMWF IFS ENS daily members of the 15-day outlook, as the provider answered (before any NIGRAAN correction), per tehsil at its settlement height (elevM sent to the provider)',
        model: run.model, run: run.runInit ? new Date(run.runInit * 1000).toISOString().slice(0, 16) + 'Z' : null,
        runBasis: run.runInit ? 'the 00/12 UTC run the outlook was due for (provider model metadata, outlook.mjs ensembleDue)' : 'not known: fetch time used in the file name',
        latestRunAtFetch: run.latestInit ? new Date(run.latestInit * 1000).toISOString().slice(0, 16) + 'Z' : null,
        fetchedAt: new Date(run.fetchedMs).toISOString(), issueDayPkt: issueDay, days: run.days, dayBasis: 'Pakistan days (timezone Asia/Karachi)',
        vars: run.vars.map(([s, n]) => ({ short: s, provider: n })), units: run.units, members: run.members,
        layout: 'int16 little-endian, index = ((unit * nVars + var) * nMembers + member) * nDays + day; value / ' + SCALE + '; ' + MISSING + ' = missing',
        scale: SCALE, missing: MISSING, dtype: 'int16le', bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'),
        unitsOfVars: { temperature_2m_max: 'C', temperature_2m_min: 'C', precipitation_sum: 'mm', wind_gusts_10m_max: 'km/h', snowfall_sum: 'cm', apparent_temperature_max: 'C' }, ...extra };
      writeFileSync(base + '.i16.part', buf); renameSync(base + '.i16.part', base + '.i16');
      writeFileSync(base + '.json.part', JSON.stringify(head)); renameSync(base + '.json.part', base + '.json');
      st.last = { file: issueDay + '/' + run.model + '_' + tag, units: run.units.length, members: run.members.length, days: run.days.length, bytes: buf.length, at: new Date().toISOString() };
      st.written++; st.skipped = null; st.bytes = used + buf.length;
      return { written: true, ...st.last };
    } catch (e) { st.lastError = 'end: ' + e.message; return { written: false, why: st.lastError }; }
  }
  const status = () => ({ on: on(), dir: 'data/ens_members', capGb: capBytes() / 1024 ** 3, keepDays: keepDays() || 'all', ...st });
  return { begin, add, end, status, prune };
}

/* reader (training scripts, tests): the header and a get(unit, var, member, day) accessor */
export function readEnsMembers(base) {
  const head = JSON.parse(readFileSync(base + '.json', 'utf8')); const b = readFileSync(base + '.i16');
  const a = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const V = head.vars.length, M = head.members.length, D = head.days.length;
  const get = (u, v, m, d) => { const q = a[((u * V + v) * M + m) * D + d]; return q === MISSING ? null : q / SCALE; };
  return { head, get };
}
