// v91.17.283 · WS3 item 7 (end to end) · the packaged release runs: pack this tree into a plain folder (scripts/pack-release.mjs), start
// the PACKAGED server on a free port (provider answered by a local mock: no network, no key), fetch /, /customize, /start, /analyst and a
// point forecast, stop it with SIGTERM (it must end and leave its database written), delete the folder.
// usage: node scripts/tests283/ws3/release_serve.test.mjs [tree]     env MOCK_PROVIDER=<mock preload> (default: scripts/tests283/lib/mockprovider.mjs via testenv)
import { existsSync, readFileSync, rmSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { TREE, ok, tmp, step, done, sleep } from './_lib.mjs';
import * as T from '../../lib/testenv.mjs';   /* v283 INTEG (WS7 request): machine paths from testenv */
import { tmpdir } from 'node:os';
const MOCK = process.env.MOCK_PROVIDER || T.MOCK_PROVIDER;
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
await step('7-e2e the packaged folder serves', async () => {
  const f = statfsSync(tmpdir()); const freeGB = Number(f.bavail) * Number(f.bsize) / 1e9;
  if (freeGB < 1.5) return ok(false, 'disk: ' + freeGB.toFixed(1) + ' GB free, 1.5 GB needed');
  const { packRelease } = await import(pathToFileURL(join(TREE, 'scripts', 'pack-release.mjs')).href);
  const out = join(tmp('serve'), 'release');
  const M = packRelease(TREE, out);
  ok(M.files > 100 && existsSync(join(out, 'SHA256SUMS.txt')), '7-e2e-a packed: ' + M.files + ' files, ' + (M.bytes / 1048576).toFixed(1) + ' MB, images ' + (M.imagesTheRuntimeReads.join(', ') || 'none'));
  const NL = join(out, 'new', 'nigraan-local'); const port = await freePort();
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', NIGRAAN_ENGINE: '0', NIGRAAN_PYJOBS: '0', NIGRAAN_WORKER: '0', MACH_API_KEY: 'MOCK-NOT-A-KEY', NODE_OPTIONS: existsSync(MOCK) ? '--import ' + T.fileUrl(MOCK) : '' };
  delete env.OPEN_METEO_API_KEY; delete env.NIGRAAN_DATA_DIR;
  const ch = spawn(process.execPath, [join(NL, 'server', 'server.mjs')], { cwd: NL, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; ch.stdout.on('data', (b) => { log += b; }); ch.stderr.on('data', (b) => { log += b; });
  const base = 'http://127.0.0.1:' + port; let warm = false; const t0 = Date.now();
  while (Date.now() - t0 < 600e3 && ch.exitCode == null) { try { const h = await (await fetch(base + '/health')).json(); if (h.warm === true) { warm = true; break; } } catch (_) {} await sleep(1000); }
  ok(warm, '7-e2e-b the packaged server became warm on port ' + port + ' in ' + Math.round((Date.now() - t0) / 1000) + ' s', warm ? '' : log.slice(-800));
  const get = async (p) => { try { const r = await fetch(base + p); const b = await r.text(); return { s: r.status, n: b.length, b }; } catch (e) { return { s: 0, n: 0, b: String(e) }; } };
  if (warm) {
    const root = await get('/'), cust = await get('/customize'), start = await get('/start'), an = await get('/analyst'), pf = await get('/api/point?lat=31.5204&lon=74.3587');   /* v283.19: the place bundle */
    ok(root.s === 200 && root.b.includes('agn-version'), '7-e2e-c / (start page) 200', root.s + ', ' + root.n + ' B');
    ok(cust.s === 200 && cust.n > 1000, '7-e2e-d /customize 200', cust.s + ', ' + cust.n + ' B');
    ok(an.s === 200 && an.n > 1000, '7-e2e-e /analyst 200', an.s + ', ' + an.n + ' B');
    let pj = null; try { pj = JSON.parse(pf.b); } catch (_) {}
    ok(pf.s === 200 && pj && pj.ok === true, '7-e2e-f place bundle (Lahore, /api/point) ok', pf.s + ' ' + (pj ? 'ok=' + pj.ok + ' ' + (pj.why || '') : pf.b.slice(0, 200)));
    console.log('INFO /start answers ' + start.s + ' (' + start.n + ' B)' + (start.s === 404 ? ': the server has no /start route; the start page is served at / (request to WS1/WS6 if /start is wanted)' : ''));
  }
  ch.kill('SIGTERM');
  const code = await new Promise((res) => { const t = setTimeout(() => { ch.kill('SIGKILL'); res('killed'); }, 30000); ch.on('exit', (c, s) => { clearTimeout(t); res(c == null ? s : c); }); if (ch.exitCode != null) { clearTimeout(t); res(ch.exitCode); } });
  let db = null; try { db = JSON.parse(readFileSync(join(NL, 'data', 'nigraan-db.json'), 'utf8')); } catch (_) {}
  ok(code !== 'killed' && db && Number.isFinite(db.saveSeq), '7-e2e-g SIGTERM: the server ended (' + code + ') and its database is on disk (saveSeq ' + (db && db.saveSeq) + ')');
  rmSync(out, { recursive: true, force: true });
  ok(!existsSync(out), '7-e2e-h the run copy is deleted');
});
done();
