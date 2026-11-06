// v91.17.279 · SAFE279 · module tests (no server): OPS-03 scheduler gate, OPS-04 writer lock, OPS-12 failed save + disk, OPS-01 backup
// records + recovery from the nightly copy. Temporary folders only. usage: node scripts/tests279safe/store279.test.mjs
// SAFE_ROOT=<tree> runs the same tests against another tree (the base, to show they fail there).
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, utimesSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, uptime } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = resolve(process.env.SAFE_ROOT || fileURLToPath(new URL('../..', import.meta.url)));
const M = (p) => import(pathToFileURL(join(ROOT, p)).href);
let pass = 0, fail = 0; const ok = (c, n, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (d && !c ? ' · ' + d : '')); c ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = mkdtempSync(join(tmpdir(), 'safe279-')); const dir = (n) => { const d = join(T, n); mkdirSync(d, { recursive: true }); return d; };
const sleeper = () => spawn(process.execPath, ['-e', 'setTimeout(()=>{},600000)'], { stdio: 'ignore' });
const KIDS = []; const kid = () => { const k = sleeper(); KIDS.push(k); return k; };
const timeout = (p, ms) => Promise.race([p.then((v) => ({ v }), (e) => ({ e })), sleep(ms).then(() => ({ hung: true }))]);
try {
  /* OPS-03 */
  { const { createScheduler } = await M('server/api/scheduler.mjs'); const s = createScheduler(); let open = true; s.setGate(() => open); const started = [];
    const mk = (id) => s.every(id, 1e9, async () => { started.push({ id, open }); await sleep(300); }, { heavy: true, firstMs: 10 });
    mk('a'); mk('b'); mk('c'); setTimeout(() => { open = false; }, 100); await sleep(700);
    ok(started.length === 2 && started.every((x) => x.open), 'S1 OPS-03 a heavy job queued for a slot does not start after the gate closed', JSON.stringify(started));
    const c = s.list().jobs.find((j) => j.id === 'c'); ok(c && !c.running && c.runs === 0, 'S2 OPS-03 the gated job gave its slot back and is not running', JSON.stringify(c)); }
  const { createStore } = await M('server/api/store.mjs');
  /* OPS-04 */
  { const d = dir('l1'); writeFileSync(join(d, '.store.lock'), '{"pid":12'); const s = createStore(d);
    ok(!!s.readOnly(), 'L1 OPS-04 an unreadable lock is held: the store does not become the writer', 'readOnly=' + s.readOnly()); }
  { const d = dir('l2'), k = kid(); writeFileSync(join(d, '.store.lock'), JSON.stringify({ pid: k.pid, port: 1, at: new Date(Date.now() - 600e3).toISOString() }));
    const s = createStore(d); ok(!!s.readOnly() && !!s.standby(), 'L2 OPS-04 a live holder with an old heartbeat is not taken over (standby)', 'readOnly=' + s.readOnly()); }
  { const d = dir('l3'), k = kid(); writeFileSync(join(d, '.store.lock'), JSON.stringify({ pid: k.pid, port: Number(process.env.PORT || 8787), at: new Date().toISOString() }));
    const s = createStore(d); ok(!!s.standby(), 'L3 OPS-04 a live holder on the same port is not taken over', 'readOnly=' + s.readOnly()); }
  { const d = dir('l4'); const k = sleeper(); const pid = k.pid; k.kill('SIGKILL'); await sleep(200); writeFileSync(join(d, '.store.lock'), JSON.stringify({ pid, port: 1, at: new Date().toISOString() }));
    const s = createStore(d); ok(!s.readOnly() && JSON.parse(readFileSync(join(d, '.store.lock'), 'utf8')).pid === process.pid, 'L4 OPS-04 a dead holder is taken over (stale takeover)'); }
  { const d = dir('l5'), k = kid(); writeFileSync(join(d, '.store.lock'), JSON.stringify({ pid: k.pid, port: 1, at: new Date(Date.now() - (uptime() + 3600) * 1000).toISOString() }));
    const b = (Date.now() - (uptime() + 3600) * 1000) / 1000; utimesSync(join(d, '.store.lock'), b, b);
    const s = createStore(d); ok(!s.readOnly(), 'L5 OPS-04 a lock written before this computer started (reboot, pid reused) is taken over'); }
  { const d = dir('l6'); const s = createStore(d); await s.insert('alerts', { id: 'a1' }); const k = kid(); const before = readFileSync(join(d, 'nigraan-db.json'), 'utf8');
    writeFileSync(join(d, '.store.lock'), JSON.stringify({ pid: k.pid, port: 1, at: new Date().toISOString() }));
    const r = await timeout(s.insert('alerts', { id: 'a2' }), 3000); const after = readFileSync(join(d, 'nigraan-db.json'), 'utf8');
    ok(!!r.e && before === after && !after.includes('"a2"'), 'L6 OPS-04 the writer re-checks the lock before saving: another live holder -> no write, the save errors', JSON.stringify({ e: r.e && r.e.code, hung: r.hung, changed: before !== after })); }
  { const d = dir('l7'), k = kid(); writeFileSync(join(d, 'nigraan-db.json'), JSON.stringify({ collections: {} })); writeFileSync(join(d, '.store.lock'), JSON.stringify({ pid: k.pid, port: 1, at: new Date().toISOString() }));
    process.env.NIGRAAN_STANDBY_POLL_MS = '50'; const s = createStore(d); writeFileSync(join(d, '.store.lock'), 'garbage{'); await sleep(500);
    ok(!!s.standby(), 'L7 OPS-04 a standby does not promote on an unreadable lock'); rmSync(join(d, '.store.lock')); await sleep(400);
    ok(!s.standby() && !s.readOnly(), 'L8 OPS-04 ... and promotes once the lock is released (removed)', 'standby=' + JSON.stringify(s.standby())); delete process.env.NIGRAAN_STANDBY_POLL_MS; }
  { // two processes start together on one folder: exactly one writer, 8 rounds
    let bad = 0; const code = `const { createStore } = await import(${JSON.stringify(pathToFileURL(join(ROOT, 'server/api/store.mjs')).href)}); const s = createStore(process.argv[1]); console.log(s.readOnly() ? 'RO' : 'W'); setTimeout(() => process.exit(0), 300);`;
    for (let i = 0; i < 8; i++) { const d = dir('race' + i); const run = () => new Promise((res) => { const c = spawn(process.execPath, ['--input-type=module', '-e', code, d]); let o = ''; c.stdout.on('data', (x) => { o += x; }); c.on('close', () => res(o.trim())); });
      const r = await Promise.all([run(), run(), run()]); if (r.filter((x) => x === 'W').length !== 1) bad++; }
    ok(bad === 0, 'L9 OPS-04 three processes starting together on one folder: exactly one writer (8 rounds)', bad + ' bad rounds'); }
  /* OPS-12 */
  { process.env.NIGRAAN_STORE_SAVE_TIMEOUT_MS = '600'; const d = dir('w1'); const s = createStore(d); await s.insert('alerts', { id: 'x0' });
    mkdirSync(join(d, 'nigraan-db.json.tmpa')); mkdirSync(join(d, 'nigraan-db.json.tmp'));   /* the temp write fails (EISDIR), like a full disk */
    const t0 = Date.now(); const r = await timeout(s.insert('alerts', { id: 'x1' }), 4000);
    ok(!!r.e && r.e.code === 'STORE_WRITE_FAILED' && Date.now() - t0 < 3000, 'W1 OPS-12 a save that cannot reach the disk errors (STORE_WRITE_FAILED), not hangs', JSON.stringify({ hung: !!r.hung, code: r.e && r.e.code }));
    await sleep(10500); const wh = s.writeHealth ? s.writeHealth() : null; ok(!!wh && wh.failing === true && !!wh.lastError, 'W2 OPS-12 the store reports failing writes (for /health)', JSON.stringify(wh));
    rmSync(join(d, 'nigraan-db.json.tmpa'), { recursive: true }); rmSync(join(d, 'nigraan-db.json.tmp'), { recursive: true });
    const r2 = await timeout(s.insert('alerts', { id: 'x2' }), 8000); const disk = readFileSync(join(d, 'nigraan-db.json'), 'utf8');
    ok(!r2.e && !r2.hung && disk.includes('"x1"') && disk.includes('"x2"') && !(s.writeHealth && s.writeHealth().failing) && !!s.writeHealth, 'W3 OPS-12 once the disk recovers the kept change and the new one are written; failing clears', JSON.stringify({ e: r2.e && r2.e.code, hung: r2.hung }));
    delete process.env.NIGRAAN_STORE_SAVE_TIMEOUT_MS; }
  const { createOps } = await M('server/api/ops.mjs');
  { const d = dir('k1'); const o = createOps({}, d); const k = o.disk ? o.disk() : null;
    ok(!!k && typeof k.freeGB === 'number' && ['ok', 'warn', 'critical'].includes(k.level), 'K1 OPS-12 free disk space of the data folder is measured', JSON.stringify(k));
    process.env.NIGRAAN_DISK_CRIT_GB = '1e9'; const k2 = o.disk ? createOps({}, d).disk() : {}; ok(k2.level === 'critical', 'K2 OPS-12 under the critical free space the level is critical'); delete process.env.NIGRAAN_DISK_CRIT_GB; }
  /* OPS-01 */
  { const d = dir('b1'); writeFileSync(join(d, 'nigraan-db.json'), JSON.stringify({ collections: { runs: [] } })); mkdirSync(join(d, 'records'));
    writeFileSync(join(d, 'records', 'run_abc.json'), JSON.stringify([{ runId: 'run_abc', v: 1 }]));
    const r = createOps({}, d).backup(); const day = r.dir.split('/').pop();
    ok(existsSync(join(d, 'nightly', day, 'records', 'run_abc.json')), 'B1 OPS-01 the nightly copy includes the forecast records (data/records/run_*.json)'); }
  { const d = dir('b2'); writeFileSync(join(d, 'nigraan-db.json'), '{"broken'); mkdirSync(join(d, 'nightly', '2026-10-16'), { recursive: true }); mkdirSync(join(d, 'nightly', '2026-10-17'), { recursive: true });
    writeFileSync(join(d, 'nightly', '2026-10-16', 'nigraan-db.json'), JSON.stringify({ collections: { alerts: [{ id: 'old' }] } }));
    writeFileSync(join(d, 'nightly', '2026-10-17', 'nigraan-db.json'), JSON.stringify({ collections: { alerts: [{ id: 'new' }] } }));
    const s = createStore(d); ok(!s.readOnly() && String(s.recoveredFrom()).includes('2026-10-17') && s.all('alerts')[0].id === 'new', 'B2 OPS-01 an unreadable database is recovered from the newest nightly copy', 'readOnly=' + s.readOnly() + ' from=' + s.recoveredFrom()); }
} catch (e) { ok(false, 'unexpected error', e && e.stack); }
for (const k of KIDS) { try { k.kill('SIGKILL'); } catch (_) {} }
try { rmSync(T, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${fail ? 'FAIL' : 'PASS'} store279: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
