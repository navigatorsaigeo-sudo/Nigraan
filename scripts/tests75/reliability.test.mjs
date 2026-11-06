import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.75 · RELIABILITY (B2) · the server is stopped from outside while the AI benchmark runs.
     node scripts/tests75/reliability.test.mjs [--root <nigraan-local copy>] [--data <data dir>] [--port 8803] [--llm-port 8813]
   Defaults: --root is this tree, --data is <root>/data. Use a scratch copy: the test writes server.log, server-console.log,
   crash-*.log and ai-bench-r75.json into the data dir.
   What it does (no Windows here, so the watchdog loop of scripts/watchdog.cmd is mirrored in this file; SIGKILL stands
   in for TerminateProcess - neither runs a handler):
     1. a stub OpenAI-compatible model on --llm-port (scripts/tests75/stub-llm.mjs), NOT started yet: the server's first
        /api/ai/status finds nothing, starts `ollama serve` (absent here -> ENOENT) - the child-process log must show it
     2. the watchdog mirror starts the server (NIGRAAN_WORKER=0, heartbeat 3 s) and restarts it 3 s after every exit,
        writing crash-<stamp>.log (exit code, process list, last 20 lines of server.log) as watchdog.cmd does
     3. ai-bench --answer 10 --model stub-b:1b --qa auto: the server is SIGKILLed once in the grounding phase and once in
        the answering phase; the bench must wait for /api/health, record two gaps and finish with 10 answers
     4. a second server on the same port exits with code 98 (EADDRINUSE) instead of living on without a port        */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, appendFileSync, writeFileSync, openSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = arg('--root', join(HERE, '..', '..')); const DATA = arg('--data', join(ROOT, 'data'));
const PORT = Number(arg('--port', String(await __T.freePort()))), LLM = Number(arg('--llm-port', String(await __T.freePort())));
const BASE = 'http://127.0.0.1:' + PORT;
const OUT = join(DATA, 'ai-bench-r75.json'), CONSOLE = join(DATA, 'server-console.log'), SLOG = join(DATA, 'server.log');
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 300) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async () => { try { const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(2000) }); await r.arrayBuffer(); return r.ok; } catch { return false; } };
const logSince = (f, from) => { try { return readFileSync(f, 'utf8').slice(from); } catch { return ''; } };
const sizeOf = (f) => { try { return readFileSync(f).length; } catch { return 0; } };
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const env = { ...process.env, PORT: String(PORT), NIGRAAN_WORKER: '0', NIGRAAN_DATA_DIR: DATA, NIGRAAN_HEARTBEAT_S: '3', NIGRAAN_WATCHDOG: '1',
  NIGRAAN_AI_PROVIDER: 'ollama', NIGRAAN_AI_MODEL: 'stub:1b', NIGRAAN_AI_BASE: 'http://127.0.0.1:' + LLM + '/v1', PATH: __T.IS_WIN ? process.env.PATH : '/usr/bin:/bin:' + dirname(process.execPath) };
const slog0 = sizeOf(SLOG), clog0 = sizeOf(CONSOLE);
const crashBefore = new Set(readdirSync(DATA).filter((f) => /^crash-/.test(f)));
rmSync(OUT, { force: true });

/* ── the watchdog mirror (scripts/watchdog.cmd) ── */
const wd = { server: null, stop: false, exits: [], stopped98: false };
function startServer() {
  appendFileSync(CONSOLE, `[${new Date().toISOString()}] starting NIGRAAN server\n`);
  const fd = openSync(CONSOLE, 'a');
  const ch = spawn(process.execPath, ['server/server.mjs'], { cwd: ROOT, env, stdio: ['ignore', fd, fd] });
  wd.server = ch;
  ch.on('exit', async (code, sig) => {
    const rc = code == null ? -1 : code;   /* SIGKILL here ~ TerminateProcess(-1) on Windows */
    wd.exits.push({ rc, sig, at: Date.now() });
    if (rc === 98) { appendFileSync(CONSOLE, `[${new Date().toISOString()}] server exited with code 98: port ${PORT} is already in use\n`); }
    else appendFileSync(CONSOLE, `[${new Date().toISOString()}] server exited with code ${rc}, restarting in 3 s\n`);
    const crash = join(DATA, 'crash-' + stamp() + '.log');
    let ps = ''; try { ps = execSync('ps -eo pid,ppid,lstart,args | grep -E "node|ollama" | grep -v grep', { encoding: 'utf8' }); } catch {}
    const tail = (() => { try { return readFileSync(SLOG, 'utf8').trim().split('\n').slice(-20).join('\n'); } catch { return ''; } })();
    writeFileSync(crash, `NIGRAAN server stopped at ${new Date().toISOString()} - exit code ${rc}${sig ? ' (' + sig + ')' : ''}\n\n---- processes\n${ps}\n---- last 20 lines of data/server.log\n${tail}\n`);
    if (rc === 98) { if (await up()) { wd.stopped98 = true; appendFileSync(CONSOLE, `[${new Date().toISOString()}] another server already answers on port ${PORT}; this watchdog stops\n`); return; } }
    if (wd.stop) return;
    setTimeout(() => { if (!wd.stop) startServer(); }, 3000);
  });
}

let llm = null, bench = null;
try {
  startServer();
  let t0 = Date.now(); while (!(await up()) && Date.now() - t0 < 60000) await sleep(500);
  ok(await up(), 'server up on ' + PORT, ((Date.now() - t0) / 1000).toFixed(1) + ' s');

  /* 1 · no model yet: the server tries `ollama serve`; the child process is in the log */
  const st0 = await (await fetch(BASE + '/api/ai/status', { signal: AbortSignal.timeout(60000) })).json().catch(() => ({}));
  const l1 = logSince(SLOG, slog0);
  ok(/ proc pid \d+ ppid \d+ node v/.test(l1), 'server.log: proc line with pid, parent pid, node version', (l1.match(/.* proc pid .*/) || [''])[0]);
  ok(/ child spawn pid \S+ ppid \d+ \S*ollama serve detached hidden stdio="ignore"/.test(l1), 'server.log: `ollama serve` spawn logged (detached, hidden, stdio ignore)', (l1.match(/.* child spawn .*/) || ['none'])[0]);
  ok(/ child-error spawn pid \S+ \S*ollama serve spawn \S*ollama ENOENT/.test(l1), 'server.log: its failure logged (ENOENT here)', (l1.match(/.* child-error .*/) || ['none'])[0]);
  ok(st0 && st0.mode === 'llm', 'status still answers with no model', JSON.stringify({ mode: st0.mode, model: st0.model }).slice(0, 120));

  llm = spawn(process.execPath, [join(HERE, 'stub-llm.mjs'), String(LLM), '600'], { stdio: 'ignore' });
  await sleep(800);
  await sleep(1000);   /* the bench asks with --model (the A/B hook), so the 60 s model-list cache does not matter */

  /* 3 · the bench, with two kills */
  const benchLog = [];
  bench = spawn(process.execPath, [join(ROOT, 'scripts', 'ai-bench.mjs'), '--base', BASE, '--answer', '10', '--seed', '7', '--qa', 'auto', '--model', 'stub-b:1b', '--out', OUT], { cwd: ROOT, env: { ...process.env, NIGRAAN_DATA_DIR: DATA } });
  bench.stdout.on('data', (d) => benchLog.push(String(d))); bench.stderr.on('data', (d) => benchLog.push(String(d)));
  const benchDone = new Promise((r) => bench.on('exit', (code) => r(code)));
  const text = () => benchLog.join('');
  const until = async (re, ms) => { const t = Date.now(); while (!re.test(text()) && Date.now() - t < ms) await sleep(200); return re.test(text()); };
  const inGround = await until(/ai-bench · \d+ questions/, 60000); await sleep(1500);
  const k1 = wd.server.pid; wd.server.kill('SIGKILL');
  ok(inGround, 'kill 1 during the grounding phase', 'pid ' + k1);
  const inAnswer = await until(/ {2}answer (ok|FAIL|LOST) q\d+/, 900000); await sleep(300);
  const k2 = wd.server.pid; wd.server.kill('SIGKILL');
  ok(inAnswer, 'kill 2 during the answering phase', 'pid ' + k2);
  const partialSeen = existsSync(OUT) && JSON.parse(readFileSync(OUT, 'utf8')).partial === true;
  ok(partialSeen, 'the --out file exists mid-run and is marked partial');
  const code = await Promise.race([benchDone, sleep(900000).then(() => 'timeout')]);
  console.log(text().split('\n').filter((l) => /lost|back|gaps|grounding:|answering:|LOST|wrote|stopped/i.test(l)).map((l) => '    | ' + l).join('\n'));
  ok(code === 0, 'ai-bench finished (exit 0) instead of dying on ECONNRESET/ECONNREFUSED', 'exit ' + code);
  const res = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  ok(res.partial === false && res.stage === 'done', 'final --out file complete', 'partial ' + res.partial + ' stage ' + res.stage);
  ok(Array.isArray(res.gaps) && res.gaps.length >= 2 && res.gaps.every((g) => g.back && g.backAfterS > 0), 'two or more server gaps recorded, each with the time the server took to come back', JSON.stringify(res.gaps));
  ok(res.gaps && res.gaps.some((g) => g.phase === 'grounding') && res.gaps.some((g) => g.phase === 'answering'), 'one gap in grounding, one in answering');
  ok(res.grounding && res.grounding.results.length === res.questions, 'grounding went on to the last question', (res.grounding && res.grounding.results.length) + '/' + res.questions);
  ok(res.answering && res.answering.results.length === 10, 'answering went on to the tenth answer', res.answering && res.answering.results.length);
  const ans = (res.answering && res.answering.results) || [];
  ok(ans.filter((a) => a.status === 200).length >= 8 && ans.some((a) => a.abModel), 'at least 8 answers from the model, A/B model honoured', ans.map((a) => a.lost ? 'LOST' : a.status).join(','));
  ok(res.summary && res.summary.serverGaps === res.gaps.length && res.summary.lost + res.summary.groundingLost >= 1, 'summary counts gaps and lost questions', JSON.stringify({ gaps: res.summary && res.summary.serverGaps, lost: res.summary && res.summary.lost, groundingLost: res.summary && res.summary.groundingLost }));

  /* 2 · watchdog mirror outputs */
  const crashes = readdirSync(DATA).filter((f) => /^crash-/.test(f) && !crashBefore.has(f));
  ok(crashes.length >= 2, 'a crash file per stop', crashes.join(', '));
  const c1 = crashes.length ? readFileSync(join(DATA, crashes.sort()[0]), 'utf8') : '';
  ok(/exit code -1/.test(c1) && /last 20 lines of data\/server\.log/.test(c1) && / beat up /.test(c1), 'crash file: exit code, processes, last 20 lines of server.log (with heartbeats)', c1.split('\n').slice(0, 2).join(' / '));
  const cl = logSince(CONSOLE, clog0);
  ok((cl.match(/server exited with code -1/g) || []).length >= 2, 'server-console.log: "exited with code -1" for each kill');
  const l2 = logSince(SLOG, slog0);
  const beat = (l2.match(/.* beat up .*/) || [''])[0];
  ok(/ beat up \d+s rss \d+MB heap \d+\/\d+MB ext \d+MB sysfree [\d.]+\/[\d.]+GB lag p50\/p99\/max \d+\/\d+\/\d+ms req\/min \d+ inflight \d+/.test(beat), 'server.log: heartbeat with memory, system memory, event-loop lag, requests', beat);
  ok(/ inflight [1-9]\d* \(oldest (GET|POST) \/api\/ai\//.test(l2), 'a heartbeat caught an AI request in flight', (l2.match(/.* inflight [1-9].*/) || ['none'])[0]);
  const starts = (l2.match(/ proc pid /g) || []).length;
  const exits = (l2.match(/ exit code /g) || []).length;
  ok(starts >= 3 && exits === 0, 'SIGKILLed servers leave no exit line (the signature of a kill from outside); every start has a proc line', 'starts ' + starts + ' exits ' + exits);

  /* 4 · a second server on the same port exits 98 */
  const t98 = Date.now();
  const second = spawn(process.execPath, ['server/server.mjs'], { cwd: ROOT, env, stdio: 'ignore' });
  const rc98 = await Promise.race([new Promise((r) => second.on('exit', (c) => r(c))), sleep(90000).then(() => 'still running')]);
  if (rc98 === 'still running') second.kill('SIGKILL');
  ok(rc98 === 98, 'a second server on a busy port exits with code 98 (no port-less zombie)', rc98 + ' after ' + ((Date.now() - t98) / 1000).toFixed(1) + ' s');
  ok(/server error Error: listen EADDRINUSE[\s\S]* exit code 98 /.test(logSince(SLOG, slog0)), 'server.log: EADDRINUSE then "exit code 98"');
} catch (e) {
  ok(false, 'test run', e && e.stack);
} finally {
  wd.stop = true;
  try { if (bench && bench.exitCode == null) bench.kill('SIGKILL'); } catch {}
  try { if (wd.server && wd.server.exitCode == null) { wd.server.kill('SIGTERM'); await sleep(3000); } } catch {}
  try { if (llm) llm.kill('SIGKILL'); } catch {}
  const lx = logSince(SLOG, slog0);
  ok(/ signal SIGTERM up \d+s pid \d+/.test(lx) && / exit code 0 up \d+s pid \d+/.test(lx), 'a clean stop logs signal and exit with uptime and pid');
}
console.log(`\nreliability (75): ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
