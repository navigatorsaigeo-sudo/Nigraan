import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.279 · SAFE279 · supervisor rehearsals with a fake backend (ports 9005-9007, temporary data folder):
//   OPS-15 log rotation + crash-file pruning; OPS-02 abort before the switch; OPS-06 essentials failed -> fail fast;
//   OPS-02 "fails after the switch" -> result switched:true; and, when PowerShell (pwsh) is present, deploy_swap.ps1 on that case:
//   exit 3 and the copied files are NOT put back under the serving new release; on a timeout before the switch it aborts and rolls back.
// usage: node scripts/tests279safe/sup279.test.mjs   (SAFE_ROOT=<tree> for another tree; PWSH=<path to pwsh> for the ps1 part)
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, utimesSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(process.env.SAFE_ROOT || fileURLToPath(new URL('../..', import.meta.url)));
const FAKE = fileURLToPath(new URL('./fake_backend279.mjs', import.meta.url));
const PX = await __T.freePort(), B1 = await __T.freePort(), B2 = await __T.freePort();   /* v283 WS7: were 9005 / 9006 / 9007 */
let pass = 0, fail = 0; const ok = (c, n, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (d && !c ? ' · ' + d : '')); c ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = mkdtempSync(join(tmpdir(), 'sup279-')), DATA = join(T, 'nig', 'nigraan-local', 'data'), RUN = join(DATA, 'run'), ARCH = join(T, 'arch'); mkdirSync(RUN, { recursive: true });
const rj = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return null; } };
writeFileSync(join(DATA, 'server-console.log'), 'x'.repeat(1.5e6)); writeFileSync(join(DATA, 'crash-2026-09-01.log'), 'old crash'); const old = Date.now() / 1000 - 20 * 86400; utimesSync(join(DATA, 'crash-2026-09-01.log'), old, old);
writeFileSync(join(DATA, 'crash-new.log'), 'recent crash');
const env = { ...process.env, NIGRAAN_DATA_DIR: DATA, NIGRAAN_PROXY_PORT: String(PX), NIGRAAN_BACKEND_PORTS: B1 + ',' + B2, NIGRAAN_BACKEND_SCRIPT: FAKE, NIGRAAN_SWAP_READY_S: '20', NIGRAAN_SWAP_PROMOTE_S: '5',
  NIGRAAN_DRAIN_S: '0', NIGRAAN_LOG_ROTATE_MB: '1', NIGRAAN_LOG_ARCHIVE_DIR: ARCH, NIGRAAN_CRASH_WAIT_S: '1', NIGRAAN_SUP_TICK_MS: '200' };
const sup = spawn(process.execPath, [join(ROOT, 'scripts', 'wd', 'supervisor.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let slog = ''; sup.stdout.on('data', (d) => { slog += d; }); sup.stderr.on('data', (d) => { slog += d; });
async function ask(id, abortAfterMs) { writeFileSync(join(RUN, 'request.json'), JSON.stringify({ id, kind: 'swap', reason: 'test' })); const t0 = Date.now(); let aborted = false;
  while (Date.now() - t0 < 60e3) { const r = rj(join(RUN, 'result-' + id + '.json')); if (r) return { r, ms: Date.now() - t0 };
    if (abortAfterMs != null && !aborted && Date.now() - t0 > abortAfterMs) { writeFileSync(join(RUN, 'abort-' + id + '.req'), 'test'); aborted = true; } await sleep(200); }
  return { r: null, ms: Date.now() - t0 }; }
const mode = (m, on) => { const f = join(RUN, 'fake-' + m); if (on) writeFileSync(f, '1'); else rmSync(f, { force: true }); };
const waitActiveUp = async () => { for (let i = 0; i < 100; i++) { const a = rj(join(RUN, 'active.json')); if (a) { try { const h = await (await fetch('http://127.0.0.1:' + PX + '/health')).json(); if (h.port === a.port) return a.port; } catch (_) {} } await sleep(200); } return null; };
try {
  const p0 = await waitActiveUp(); ok(p0 === B1, 'Z0 supervisor + proxy + fake server up on 9006', String(p0));
  ok(existsSync(join(DATA, 'server-console.log.1')) && existsSync(join(DATA, 'crash-new.log')) && !existsSync(join(DATA, 'crash-2026-09-01.log')) && existsSync(ARCH) && readdirSync(ARCH).some((n) => n.startsWith('crash-2026-09-01.log')),
    'R1 OPS-15 server-console.log over the limit rotated to .1; a crash file older than 14 days moved to the archive (a recent one kept)');
  mode('cold', true); const a = await ask('a1', 2000); mode('cold', false);
  ok(a.r && a.r.ok === false && /aborted/.test(a.r.message) && a.r.switched === false && a.ms < 12000 && rj(join(RUN, 'active.json')).port === B1, 'A1 OPS-02 an abort request stops a swap before the switch; the old server keeps serving', JSON.stringify({ ms: a.ms, r: a.r && a.r.message }));
  await sleep(1500);
  mode('warmfailed', true); const f = await ask('f1'); mode('warmfailed', false);
  ok(f.r && f.r.ok === false && /essentials failed/.test(f.r.message) && f.ms < 12000, 'F1 OPS-06 a new server reporting failed essentials fails the swap at once (not after the 20 s ready limit)', JSON.stringify({ ms: f.ms, r: f.r && f.r.message }));
  await sleep(1500);
  mode('noprom', true); const p = await ask('p1'); mode('noprom', false);
  ok(p.r && p.r.ok === false && p.r.switched === true && p.r.servingPort === B2, 'P1 OPS-02 a failure after the switch says switched:true and which server serves', JSON.stringify(p.r));
  await sleep(1500); const n = await ask('n1'); ok(n.r && n.r.ok === true && n.r.switched === true, 'N1 a normal swap afterwards succeeds (a writer serves again)', JSON.stringify(n.r && n.r.message));
  /* deploy_swap.ps1 rehearsal (PowerShell 7 on Linux) */
  const PW = process.env.PWSH && existsSync(process.env.PWSH) ? process.env.PWSH : null;
  if (!PW) console.log('SKIP deploy_swap.ps1 rehearsal: set PWSH=<path to pwsh>');
  else {
    await sleep(1500); const NL = join(T, 'nig', 'nigraan-local'), ST = join(T, 'stage'); mkdirSync(join(ST, 'nigraan-local', 'server'), { recursive: true });
    writeFileSync(join(NL, 'package.json'), JSON.stringify({ version: '91.17.278.1' })); writeFileSync(join(ST, 'nigraan-local', 'package.json'), JSON.stringify({ version: '91.17.279' }));
    writeFileSync(join(ST, 'nigraan-local', 'server', 'marker.txt'), 'v279'); mkdirSync(join(T, '_admin'), { recursive: true });
    const ps = (args) => spawnSync(PW, ['-NoProfile', '-File', join(ROOT, '_admin', 'deploy_swap.ps1'), '-Version', '279', '-Root', T, '-NigraanLocal', NL, '-Stage', ST, '-Force', '-ProxyPort', String(PX), ...args], { encoding: 'utf8', timeout: 240e3 });
    mode('noprom', true); const d1 = ps([]); mode('noprom', false);
    ok(d1.status === 3 && readFileSync(join(NL, 'package.json'), 'utf8').includes('91.17.279') && existsSync(join(NL, 'server', 'marker.txt')), 'D1 OPS-02 deploy_swap.ps1: swap fails after the switch -> exit 3, files NOT rolled back under the serving new release', 'exit ' + d1.status + ' ' + (d1.stdout || '').split('\n').filter((l) => /SWAP|exit|restored|FAILED/.test(l)).join(' | ').slice(0, 600));
    /* reset the install to the old files, then a timeout before the switch (-WaitMinutes 0): the script asks, aborts, rolls back (exit 1) */
    writeFileSync(join(NL, 'package.json'), JSON.stringify({ version: '91.17.278.1' })); rmSync(join(NL, 'server', 'marker.txt'), { force: true });
    for (const n of readdirSync(join(NL)).concat(readdirSync(join(NL, 'server')).map((x) => 'server/' + x))) if (/\.b279\.bak$|rolled-back$/.test(n)) rmSync(join(NL, n), { force: true });
    await waitActiveUp(); await sleep(1500);
    mode('cold', true); const d2 = ps(['-WaitMinutes', '0']); mode('cold', false);
    ok(d2.status === 1 && readFileSync(join(NL, 'package.json'), 'utf8').includes('91.17.278.1') && /abort/i.test(d2.stdout || ''), 'D2 OPS-02 deploy_swap.ps1: no answer in time, swap not switched -> abort asked, files rolled back (exit 1)', 'exit ' + d2.status + ' ' + (d2.stdout || '').split('\n').filter((l) => /SWAP|abort|restored|FAILED/i.test(l)).join(' | ').slice(0, 600));
  }
} catch (e) { ok(false, 'unexpected error', e && e.stack); }
try { sup.kill('SIGTERM'); } catch (_) {}
await sleep(500);
for (const f of ['backends.json', 'proxy-status.json']) { const o = rj(join(RUN, f)); if (o) for (const v of Object.values(o).concat([o])) { const pid = v && v.pid; if (pid) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} } } }
if (!__T.IS_WIN) spawnSync('bash', ['-c', `pkill -f ${FAKE} ; pkill -f "${join(ROOT, 'server', 'proxy.mjs')}.*" ; true`]);   /* v283 WS7: Linux clean-up only */
if (fail) console.log(slog.split('\n').slice(-25).join('\n'));
try { rmSync(T, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${fail ? 'FAIL' : 'PASS'} sup279: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
