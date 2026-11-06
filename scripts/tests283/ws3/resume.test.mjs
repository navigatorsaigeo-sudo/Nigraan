// v91.17.283 · WS3 · the supervisor after a resume from sleep. A resume is simulated on Linux by freezing the supervisor (SIGSTOP) for
// longer than NIGRAAN_RESUME_GAP_S and thawing it (SIGCONT): its clock jumps exactly as after a modern-standby resume. Meanwhile:
//   A the server child is frozen too and stays frozen (alive, not answering = hung after the resume) -> stopped and started again;
//   B the server child is killed while the supervisor is frozen (it died during the sleep)        -> started again;
//   C the proxy is killed while the supervisor is frozen                                          -> started again.
// The real supervisor and proxy run in a temporary copy of the tree with the fake backend (_admin/tests/zd_fake_backend.mjs), their own
// data folder and free ports; nothing of the tree under test is written. Plus a unit check of the detector on a fake clock.
// usage: node scripts/tests283/ws3/resume.test.mjs [tree]
import { mkdirSync, copyFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { TREE, ok, tmp, step, done, sleep } from './_lib.mjs';
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const src = readFileSync(join(TREE, 'scripts', 'wd', 'supervisor.mjs'), 'utf8');

await step('R0 the detector on a fake clock', async () => {
  ok(/export function resumeDetector/.test(src), 'R0a supervisor.mjs exports resumeDetector'); if (!/export function resumeDetector/.test(src)) return;
  process.env.NIGRAAN_SUP_NO_MAIN = '1'; process.env.NIGRAAN_DATA_DIR = tmp('r0');
  const { resumeDetector } = await import(new URL('file://' + join(TREE, 'scripts', 'wd', 'supervisor.mjs')).href);
  let t = 1000; const d = resumeDetector(30000, () => t); const seen = [];
  for (const step of [1000, 1000, 45000, 1000, 29000, 31000]) { t += step; seen.push(d()); }
  ok(JSON.stringify(seen) === JSON.stringify([null, null, 45000, null, null, 31000]), 'R0b a gap over 30 s is a resume, ordinary ticks are not', JSON.stringify(seen));
});

await step('R1 resume: hung server restarted, dead server restarted, dead proxy restarted', async () => {
  const M = tmp('mini'), D = join(M, 'data'), RUN = join(D, 'run');
  for (const f of ['scripts/wd/supervisor.mjs', 'server/proxy.mjs', '_admin/tests/zd_fake_backend.mjs']) { mkdirSync(dirname(join(M, f)), { recursive: true }); copyFileSync(join(TREE, f), join(M, f)); }
  writeFileSync(join(M, 'package.json'), '{"type":"module"}'); mkdirSync(RUN, { recursive: true });
  const [pp, b1, b2] = [await freePort(), await freePort(), await freePort()];
  const env = { ...process.env, NIGRAAN_DATA_DIR: D, NIGRAAN_PROXY_PORT: String(pp), NIGRAAN_BACKEND_PORTS: b1 + ',' + b2, NIGRAAN_BACKEND_SCRIPT: join(M, '_admin/tests/zd_fake_backend.mjs'),
    NIGRAAN_CRASH_WAIT_S: '1', NIGRAAN_RESUME_GAP_S: '4', NIGRAAN_RESUME_GRACE_S: '6', NIGRAAN_RESUME_SETTLE_MS: '500', NIGRAAN_LOG_ARCHIVE_DIR: join(M, 'logarch'), FAKE_WARM_MS: '100', NIGRAAN_SUP_STOP_S: '5' };
  delete env.NIGRAAN_SUP_NO_MAIN; delete env.NODE_OPTIONS;
  const sup = spawn(process.execPath, [join(M, 'scripts/wd/supervisor.mjs')], { cwd: M, env, stdio: 'ignore' });
  const health = async () => { try { const r = await fetch('http://127.0.0.1:' + pp + '/health', { signal: AbortSignal.timeout(1500) }); return await r.json(); } catch (_) { return null; } };
  const waitUp = async (ms, notPid) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const h = await health(); if (h && h.pid && h.pid !== notPid) return h; await sleep(300); } return null; };
  const log = () => { try { return readFileSync(join(RUN, 'supervisor.log'), 'utf8'); } catch (_) { return ''; } };
  const proxyPid = () => { try { return JSON.parse(readFileSync(join(RUN, 'proxy-status.json'), 'utf8')).pid; } catch (_) { return null; } };
  try {
    const h0 = await waitUp(30000); ok(!!h0, 'R1 the supervisor, proxy and a server are up', JSON.stringify(h0)); if (!h0) return;
    /* A: freeze the supervisor and the server; thaw only the supervisor (the server stays hung) */
    process.kill(sup.pid, 'SIGSTOP'); process.kill(h0.pid, 'SIGSTOP'); await sleep(6000); process.kill(sup.pid, 'SIGCONT');
    const h1 = await waitUp(30000, h0.pid);
    ok(!!h1 && /resume detected/.test(log()) && !alive(h0.pid), 'R1a hung server after a resume: stopped and a new one answers', 'old pid ' + h0.pid + ' alive ' + alive(h0.pid) + ', new ' + (h1 && h1.pid) + '; log: ' + (log().match(/after the resume:[^\n]*/g) || []).join(' | '));
    if (!h1) return;
    /* B: freeze the supervisor, kill the server, thaw */
    process.kill(sup.pid, 'SIGSTOP'); process.kill(h1.pid, 'SIGKILL'); await sleep(6000); process.kill(sup.pid, 'SIGCONT');
    const h2 = await waitUp(30000, h1.pid);
    ok(!!h2, 'R1b a server that died during the sleep is started again', 'new ' + (h2 && h2.pid));
    /* C: freeze the supervisor, kill the proxy, thaw */
    const px = proxyPid(); process.kill(sup.pid, 'SIGSTOP'); if (px) process.kill(px, 'SIGKILL'); await sleep(6000); process.kill(sup.pid, 'SIGCONT');
    const t0 = Date.now(); let h3 = null; while (Date.now() - t0 < 30000) { h3 = await health(); if (h3 && proxyPid() !== px) break; await sleep(300); }
    ok(!!h3 && proxyPid() !== px, 'R1c a proxy that died during the sleep is started again', 'old proxy ' + px + ', new ' + proxyPid());
    const rj = existsSync(join(RUN, 'supervisor-resume.json')) ? JSON.parse(readFileSync(join(RUN, 'supervisor-resume.json'), 'utf8')) : null;
    ok(rj && rj.count >= 3, 'R1d supervisor-resume.json counts the resumes', JSON.stringify(rj));
    ok(alive(sup.pid), 'R1e the supervisor itself is still running');
  } finally {
    try { process.kill(sup.pid, 'SIGCONT'); } catch (_) {}
    try { process.kill(sup.pid, 'SIGTERM'); } catch (_) {}
    const t0 = Date.now(); while (alive(sup.pid) && Date.now() - t0 < 15000) await sleep(200);
    if (alive(sup.pid)) try { process.kill(sup.pid, 'SIGKILL'); } catch (_) {}
    /* the stop on SIGTERM asks the children to end; anything left of this run is stopped */
    for (const f of ['backends.json']) { try { const o = JSON.parse(readFileSync(join(RUN, f), 'utf8')); for (const b of Object.values(o)) try { process.kill(b.pid, 'SIGKILL'); } catch (_) {} } catch (_) {} }
    try { process.kill(proxyPid(), 'SIGKILL'); } catch (_) {}
    ok(!alive(sup.pid), 'R1f stopped: the supervisor ended on SIGTERM', /stopping the servers/.test(log()) ? 'it asked its servers to stop first' : '');
  }
});
done();
