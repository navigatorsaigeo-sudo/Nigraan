/* v91.17.283 · WS7 · the test environment, one place for every machine-specific path the suites need.
   Before v283, 65 suites carried /home/claude/... (Playwright) and /opt/pw-browsers/... (Chromium): on the laptop (Windows,
   D:\NIGRAAN\nig\nigraan-local) they could not load the browser and failed, or launched nothing and looked like a pass.

   Resolution order (first hit wins):
     repo root   from this file's own location (scripts/lib/ -> ../../), never from the working directory
     Playwright  normal module resolution from the repo (node_modules) -> env NIGRAAN_PLAYWRIGHT (a file or folder) ->
                 legacy env PLAYWRIGHT_MODULE / PW_MODULE -> the global npm folder (npm root -g)
     Chromium    env NIGRAAN_CHROMIUM -> legacy env PW_CHROME / PLAYWRIGHT_CHROMIUM -> Playwright's own default
                 (honours PLAYWRIGHT_BROWSERS_PATH) -> a scan of PLAYWRIGHT_BROWSERS_PATH and the default ms-playwright caches
     uploads     env NIGRAAN_UPLOADS (outside input data: LAMHA db, station-lake copies) -> D:\ on Windows -> /mnt/user-data/uploads
   A browser suite that finds no Playwright or no Chromium SKIPs: it prints "SKIP (whole file) <reason>" and exits with
   SKIP_EXIT (77). The runner (scripts/run-tests.mjs) reports it as SKIP, never as PASS; a FAIL printed before the skip still counts. */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir, homedir } from 'node:os';
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';

export const SKIP_EXIT = 77;
export const IS_WIN = process.platform === 'win32';
/** repo root (nigraan-local), absolute, no trailing separator */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** a path inside the repo: repoPath('data', 'x.json') */
export const repoPath = (...p) => join(ROOT, ...p);
/** the server under test: env NIGRAAN_BASE / BASE / NIGRAAN_URL, then the first http(s) argument, then the default port */
export const BASE = (process.env.NIGRAAN_BASE || process.env.BASE || process.env.NIGRAAN_URL || process.argv.slice(2).find((a) => /^https?:\/\//.test(a)) || 'http://127.0.0.1:8787').replace(/\/$/, '');
/** the in-tree mock provider preload (node --import), test use only */
export const MOCK_PROVIDER = repoPath('scripts', 'tests283', 'lib', 'mockprovider.mjs');
export const MOCK_PROVIDER_URL = pathToFileURL(MOCK_PROVIDER).href;

/** whole-file skip: clear reason, exit 77 (the runner reports SKIP) */
export function skip(reason) {
  console.log('SKIP (whole file) ' + reason);
  process.exit(SKIP_EXIT);
}

/** import an absolute path on any OS (Windows needs a file URL) */
export const importFile = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? pathToFileURL(String(p)).href : p);

/* ── outside input data ── */
export const UPLOADS = process.env.NIGRAAN_UPLOADS || (IS_WIN ? 'D:\\' : '/mnt/user-data/uploads');
/** uploads('LAMHA/data/mach/db') -> <UPLOADS>/LAMHA/data/mach/db with this OS's separators */
export const uploads = (rel) => join(UPLOADS, ...String(rel).split(/[\\/]+/).filter(Boolean));

/* ── temp dirs and ports ── */
/** a fresh temporary folder under os.tmpdir() */
export const tmpDir = (prefix = 'nigraan-test-') => mkdtempSync(join(tmpdir(), prefix));
/** a free TCP port on 127.0.0.1 (ask the OS for one, release it, hand it back) */
export function freePort() {
  return new Promise((res, rej) => {
    const s = createServer(); s.unref(); s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

/* ── Playwright ── */
const tryResolve = (from, id) => { try { return createRequire(from)['resolve'](id); } catch (_) { return null; } };
const asEntry = (p) => {
  if (!p) return null;
  try {
    if (existsSync(p) && statSync(p).isDirectory()) { const r = tryResolve(join(p, 'noop.js'), p) || (existsSync(join(p, 'index.js')) ? join(p, 'index.js') : null); return r; }
    return existsSync(p) ? p : null;
  } catch (_) { return null; }
};
function globalNodeModules() {
  const c = [];
  if (process.env.npm_config_prefix) c.push(IS_WIN ? join(process.env.npm_config_prefix, 'node_modules') : join(process.env.npm_config_prefix, 'lib', 'node_modules'));
  if (IS_WIN && process.env.APPDATA) c.push(join(process.env.APPDATA, 'npm', 'node_modules'));
  c.push(IS_WIN ? join(dirname(process.execPath), 'node_modules') : join(dirname(process.execPath), '..', 'lib', 'node_modules'));
  c.push(join(homedir(), '.npm-global', 'lib', 'node_modules'));
  try { const r = execFileSync(IS_WIN ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'], shell: IS_WIN }).trim(); if (r) c.push(r); } catch (_) {}
  return c;
}
let _pwEntry;
/** absolute path of Playwright's entry file, or null */
export function playwrightEntry() {
  if (_pwEntry !== undefined) return _pwEntry;
  let e = tryResolve(pathToFileURL(join(ROOT, 'package.json')).href, 'playwright');
  for (const v of [process.env.NIGRAAN_PLAYWRIGHT, process.env.PLAYWRIGHT_MODULE, process.env.PW_MODULE]) if (!e && v) e = asEntry(v);
  if (!e) for (const d of globalNodeModules()) { e = asEntry(join(d, 'playwright')); if (e) break; }
  return (_pwEntry = e || null);
}
/** file URL of the entry (for import()), or null */
export const playwrightUrl = () => { const e = playwrightEntry(); return e ? pathToFileURL(e).href : null; };

const MISSING = (why) => {
  const chromium = { __missing: why, launch: async () => skip(why), executablePath: () => '' };
  return { chromium, default: { chromium }, __missing: why };
};
const NO_PW = 'Playwright is not installed (looked in the repo node_modules, NIGRAAN_PLAYWRIGHT, the global npm folder); install it with "npm i playwright" in nigraan-local or set NIGRAAN_PLAYWRIGHT';
let _pwMod;
/** the Playwright module, loaded with require (it is CommonJS); a stub whose launch() SKIPs when absent */
export function playwrightSync() {
  if (_pwMod) return _pwMod;
  const e = playwrightEntry();
  if (!e) return (_pwMod = MISSING(NO_PW));
  try { const m = createRequire(import.meta.url)(e); return (_pwMod = (m && m.chromium) ? m : (m && m.default) || m); }
  catch (err) { return (_pwMod = MISSING('Playwright could not be loaded from ' + e + ' (' + String(err && err.message).slice(0, 160) + ')')); }
}
/** same, for code written as await import(...) */
export async function playwright() { return playwrightSync(); }

/* ── Chromium ── */
const CHROME_IN = [['chrome-linux', 'chrome'], ['chrome-linux64', 'chrome'], ['chrome-win', 'chrome.exe'], ['chrome-win64', 'chrome.exe'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'], ['chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']];
function scanBrowsers(dir) {
  try {
    if (!dir || !existsSync(dir)) return null;
    const vs = readdirSync(dir).filter((n) => /^chromium-\d+$/.test(n)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const v of vs) for (const parts of CHROME_IN) { const p = join(dir, v, ...parts); if (existsSync(p)) return p; }
  } catch (_) {}
  return null;
}
let _chrome;
/** absolute path of a Chromium executable, or undefined (then nothing is passed and Playwright uses its own) */
export function chromiumPath() {
  if (_chrome !== undefined) return _chrome || undefined;
  const tried = [];
  const ok = (p) => { if (p) tried.push(p); return p && existsSync(p) ? p : null; };
  let p = ok(process.env.NIGRAAN_CHROMIUM) || ok(process.env.PW_CHROME) || ok(process.env.PLAYWRIGHT_CHROMIUM);
  if (!p) { const pw = playwrightSync(); if (!pw.__missing) { try { p = ok(pw.chromium.executablePath()); } catch (_) {} } }
  if (!p) p = scanBrowsers(process.env.PLAYWRIGHT_BROWSERS_PATH);
  if (!p) for (const d of [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'), join(homedir(), '.cache', 'ms-playwright'), join(homedir(), 'Library', 'Caches', 'ms-playwright')]) { p = scanBrowsers(d); if (p) break; }
  chromiumPath.tried = tried;
  _chrome = p || null;
  return p || undefined;
}
const NO_CHROME = () => 'no Chromium browser found (NIGRAAN_CHROMIUM, PW_CHROME, Playwright default, PLAYWRIGHT_BROWSERS_PATH=' + (process.env.PLAYWRIGHT_BROWSERS_PATH || 'unset') + ', ms-playwright caches); run "npx playwright install chromium" or set NIGRAAN_CHROMIUM';

/** chromium.launch with the resolved browser; SKIPs (exit 77) when Playwright or Chromium is absent, never fakes a pass.
    Usage: const browser = await launch(chromium, { args: [...] }) */
export async function launch(chromium, opts = {}) {
  if (!chromium || chromium.__missing) skip(chromium && chromium.__missing ? chromium.__missing : NO_PW);
  const o = { ...(opts || {}) };
  if (o.executablePath && !existsSync(o.executablePath)) delete o.executablePath;
  if (!o.executablePath) { const p = chromiumPath(); if (p) o.executablePath = p; else skip(NO_CHROME()); }
  if (IS_WIN && Array.isArray(o.args)) o.args = o.args.filter((a) => a !== '--no-zygote' && a !== '--single-process');   /* Linux-only flags */
  try { return await chromium.launch(o); }
  catch (e) {
    const m = String(e && e.message);
    if (/Executable doesn't exist|executable doesn't exist|ENOENT|Looks like Playwright Test or Playwright was just installed/i.test(m)) skip('Chromium could not be started: ' + m.split('\n')[0].slice(0, 200));
    throw e;
  }
}
/** true when a browser suite can run here (for tests that want to decide without exiting) */
export const browserAvailable = () => !playwrightSync().__missing && !!chromiumPath();
/** file URL of a path (node --import on Windows needs one) */
export const fileUrl = (p) => pathToFileURL(String(p)).href;
/** an outside input (a previous build tree, a cloud-only file): the env override, else the default; SKIP the file when absent */
export function needPath(envName, dflt, what) {
  const p = (envName && process.env[envName]) || dflt;
  if (!p || !existsSync(p)) skip((what || 'an outside input') + ' is not on this machine (' + (p || 'no path') + ')' + (envName ? '; set ' + envName + ' to run this suite' : ''));
  return p;
}
/** the Python interpreter for the .py suites and helpers */
export const PYTHON = process.env.NIGRAAN_PYTHON || (IS_WIN ? 'python' : 'python3');
/** os.tmpdir() (was $TMPDIR || /tmp) */
export const TMP = tmpdir();
