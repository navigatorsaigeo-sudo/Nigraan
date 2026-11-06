/* v91.17.283.25 . THE AGN DATA LAKE IS RETIRED (owner, 27 Oct 2026: "NIGRAAN leaves D:\DATA LAKE completely"), offline (no server, no provider):
     L1  code: no server module, agent or library script names a path under 'DATA LAKE' / AGN_LAKE / agn-lake or the lake's environment
         variables (comments left out: they keep the history); nothing builds app.lake or imports lake.mjs, and lake.mjs is gone
     L2  config: data/copy-sources.json has one source (LAMHA); no dataset reads from 'lake'; no source folder resolves under DATA LAKE
     L3  run: with a fresh, complete data lake on disk beside LAMHA and every former lake variable pointing at it (NIGRAAN_DATALAKE_DIR,
         NIGRAAN_LAKE, AGN_LAKE), the copy run, the MACH copy reader, the faults layer and the OpenAQ poll touch no path under it
         (every fs call is watched); the faults layer serves NIGRAAN's own file
     L4  the retention rule (scripts/copies_retention.py templates) matches no file in nig/copies/lake: the files copied before stay untouched
   usage: node scripts/tests28325/datalake.unit.test.mjs */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const LAKE_RX = /DATA[ _]LAKE|AGN_LAKE|agn-lake|NIGRAAN_DATALAKE|NIGRAAN_LAKE\b/i;

/* ── L1 · code, comments left out ── */
/* a JavaScript comment stripper that keeps strings, template literals and regular-expression literals (a '/' starts a regex after an
   operator, an opening bracket, a comma, a keyword such as return, or at the start) */
function stripJs(src) {
  let out = '', i = 0, prev = '';   /* prev: the last significant character or word outside comments */
  const n = src.length; const kw = /(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } out += src.slice(i, j + 1); i = j + 1; prev = 'a'; continue; }
    if (c === '/') { const p = prev; if (!p || /[(,=:[!&|?{};+\-*%<>~^]$/.test(p) || kw.test(p)) { let j = i + 1, cls = false; while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
      out += src.slice(i, j + 1); i = j + 1; prev = 'a'; continue; } }
    out += c; if (!/\s/.test(c)) { if (/[A-Za-z0-9_$]/.test(c)) { prev = /[A-Za-z0-9_$]$/.test(prev) ? prev + c : c; } else prev = c; }
    i++;
  }
  return out;
}
/* Python: '#' comments and docstrings (a triple-quoted string standing alone) left out */
function stripPy(src) { return src.replace(/^\s*[rRbBuU]?("""|''')[\s\S]*?\1/gm, '').split('\n').map((l) => { const h = l.indexOf('#'); return h >= 0 && !/['"][^'"]*#/.test(l.slice(0, h + 1)) ? l.slice(0, h) : l; }).join('\n'); }
{ const self = stripJs("const a = 'x // y'; /* DATA LAKE */ const r = /\\/\\*[^/]*/g; // AGN_LAKE\nconst b = `D:\\\\${'AGN_LAKE'}`;");
  ok(!/DATA LAKE/.test(self) && /AGN_LAKE/.test(self) && /x \/\/ y/.test(self), 'L1 the comment stripper keeps strings and regexes, drops comments (self-check)', self); }
const files = []; const walk = (d, rx) => { let L = []; try { L = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of L) { const p = join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, rx); } else if (rx.test(e.name)) files.push(p); } };
walk(join(ROOT, 'server'), /\.(mjs|js)$/); walk(join(ROOT, 'scripts', 'agents'), /\.(mjs|js|py)$/); walk(join(ROOT, 'scripts', 'lib'), /\.(mjs|js|py)$/);
for (const f of ['copies_retention.py', 'ens_archive.py', 'mach_db_screen.py', 'era5land.py', 'build_applicability.py']) if (fs.existsSync(join(ROOT, 'scripts', f))) files.push(join(ROOT, 'scripts', f));   /* tree scripts the server or LEARN_ALL runs */
const hits = []; for (const f of files) { const src = fs.readFileSync(f, 'utf8'); const code = /\.py$/.test(f) ? stripPy(src) : stripJs(src);
  code.split('\n').forEach((l, k) => { if (LAKE_RX.test(l)) hits.push(relative(ROOT, f) + ': ' + l.trim().slice(0, 140)); }); }
ok(files.length > 100 && !hits.length, 'L1 no code path in ' + files.length + ' server / agent / library / job files names DATA LAKE, AGN_LAKE, agn-lake or the lake variables', hits.slice(0, 5).join(' | '));
{ const bats = fs.readdirSync(ROOT).filter((f) => /\.(bat|ps1|vbs)$/i.test(f)); const bh = bats.filter((f) => fs.readFileSync(join(ROOT, f), 'latin1').split(/\r?\n/).some((l) => !/^\s*(rem|REM|::|#)/.test(l) && LAKE_RX.test(l)));
  ok(bats.length && !bh.length, 'L1 no launcher (' + bats.join(', ') + ') names the data lake', bh.join(',')); }
{ const uses = files.filter((f) => /\.(mjs|js)$/.test(f)).filter((f) => { const c = stripJs(fs.readFileSync(f, 'utf8')); return /\bapp\.lake\b|createLake|lake\.mjs['"]|copies\.(aq|lakeRoot|lakeGate)\b|\/api\/lake\//.test(c); }).map((f) => relative(ROOT, f));
  ok(!uses.length && !fs.existsSync(join(API, 'lake.mjs')), 'L1 no app.lake, no lake.mjs import, no lake accessor of the copies, no /api/lake route; server/api/lake.mjs removed', uses.join(',')); }

/* ── L2 · config ── */
const CFG = JSON.parse(fs.readFileSync(join(ROOT, 'data', 'copy-sources.json'), 'utf8'));
{ const fakeRoot = resolve('/D', 'NIGRAAN', 'nig', 'nigraan-local'); const dirs = Object.values(CFG.sources).map((S) => resolve(fakeRoot, ...S.default)).concat([resolve(fakeRoot, ...(CFG.copies.default || []))]);
  const lakeDs = Object.entries(CFG.datasets).filter(([k, v]) => v.source === 'lake' || v.lakeId || /^lake_/.test(k) || (v.files || []).some((f) => f.lakeId)).map(([k]) => k);
  /* v91.17.283.28 · independence from LAMHA: no copy source at all (LAMHA's copies retired too) */
  ok(Object.keys(CFG.sources).length === 0 && Object.keys(CFG.datasets).length === 0 && !lakeDs.length && dirs.every((d) => !LAKE_RX.test(d)) && Object.values(CFG.sources).every((S) => !LAKE_RX.test(S.env + ' ' + S.off)),
    'L2 copy-sources.json: no source and no dataset (v283.28: LAMHA retired too), no lake dataset, no folder or variable under the data lake', JSON.stringify({ src: Object.keys(CFG.sources), lakeDs, dirs })); }

/* ── L3 · run with every fs call watched ── */
const T = fs.mkdtempSync(join(tmpdir(), 'v28325-lake-'));
const LAKE = join(T, 'DATA LAKE', 'AGN_LAKE'), LAMHA = join(T, 'LAMHA'), NL = join(T, 'NIGRAAN', 'nig', 'nigraan-local'), DATA = join(NL, 'data');
const w = (p, t) => { fs.mkdirSync(dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
fs.mkdirSync(DATA, { recursive: true }); for (const f of ['copy-sources.json', 'mach-fleet-stations.json', 'gem-active-faults-pk.json']) fs.copyFileSync(join(ROOT, 'data', f), join(DATA, f));
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z'), now = Date.now(), dk = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
/* a complete, fresh lake: catalogue, status of every former dataset, MACH day file, OpenAQ month, earthquakes, faults, IMERG days */
w(join(LAKE, 'catalogue', 'catalogue.json'), JSON.stringify({ version: 'fixture', datasets: ['mach_obs', 'mach_stations', 'aq_openaq', 'quake_usgs', 'imerg_late_hh', 'gem_active_faults'].map((id) => ({ id, state: 'live', staleMin: 120, path: 'data/' + id + '/x', visibility: 'internal' })) }));
for (const id of ['mach_obs', 'mach_stations', 'aq_openaq', 'quake_usgs', 'imerg_late_hh']) w(join(LAKE, 'status', id + '.json'), JSON.stringify({ lastSuccessUtc: iso(now - 60e3), latestObsUtc: iso(now - 60e3) }));
const keys = JSON.parse(fs.readFileSync(join(DATA, 'mach-fleet-stations.json'), 'utf8')).stations.map((s) => s.key).slice(0, 90);
w(join(LAKE, 'data', 'mach_obs', 'daily', 'obs_' + dk + '.csv'), 'stationKey,time,source,temperatureC\n' + keys.map((k) => k + ',' + iso(now - 120e3) + ',wu,25.0').join('\n') + '\n');
w(join(LAKE, 'data', 'aq_openaq', 'aq_openaq_' + new Date(now).toISOString().slice(0, 7) + '.csv'), 'location_id,sensor_id,parameter,unit,observed_at_utc,value\n1,2,pm25,ugm3,' + iso(now - 600e3) + ',40\n');
w(join(LAKE, 'data', 'quake_usgs', 'events.csv'), 'id,time,updated,lat,lon,depthKm,mag\nus1,' + iso(now - 3600e3) + ',' + iso(now - 600e3) + ',34,73,10,4.4\n');
w(join(LAKE, 'data', 'gem_faults', 'gem_active_faults_pk.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [] }));
w(join(LAKE, 'data', 'imerg_hh', 'late', '2026', 'imerg_late_' + dk + '.nc'), 'CDF fixture');
fs.mkdirSync(LAMHA, { recursive: true });   /* LAMHA present but empty: the MACH copy fails and the lake (fresh) must still not be used */
w(join(NL, 'openaq.key'), 'A'.repeat(32));   /* a key so the OpenAQ poll runs: it must not take rows from the lake (fetch is stubbed) */
process.env.NIGRAAN_LAMHA_DIR = LAMHA; process.env.NIGRAAN_COPIES_DIR = join(T, 'NIGRAAN', 'nig', 'copies');
process.env.NIGRAAN_DATALAKE_DIR = LAKE; process.env.NIGRAAN_LAKE = LAKE; process.env.AGN_LAKE = LAKE; delete process.env.NIGRAAN_COPY; delete process.env.NIGRAAN_LAMHA; delete process.env.NIGRAAN_OPENAQ;
/* every fs entry point that takes a path, sync, callback and promise forms */
const touched = []; const seen = (a) => { for (const x of a.slice(0, 2)) { const s = x == null ? '' : x instanceof URL ? fileURLToPath(x) : Buffer.isBuffer(x) ? x.toString() : typeof x === 'string' ? x : ''; if (s && LAKE_RX.test(s)) touched.push(s); } };
const NAMES = ['readFileSync', 'existsSync', 'statSync', 'lstatSync', 'readdirSync', 'openSync', 'createReadStream', 'copyFileSync', 'accessSync', 'realpathSync', 'readFile', 'stat', 'readdir', 'open', 'copyFile', 'access', 'opendir', 'opendirSync', 'cpSync', 'cp', 'watch', 'watchFile'];
for (const k of NAMES) { if (typeof fs[k] === 'function') { const o = fs[k]; fs[k] = function (...a) { seen(a); return o.apply(this, a); }; }
  if (typeof fsp[k] === 'function') { const o = fsp[k]; fsp[k] = function (...a) { seen(a); return o.apply(this, a); }; } }
syncBuiltinESMExports();
const realFetch = globalThis.fetch; let fetched = 0; globalThis.fetch = async () => { fetched++; throw new Error('no network in this test'); };
const imp = (f) => import(pathToFileURL(join(API, f)).href);
const { createCopies } = await imp('copies.mjs'); const { createFaults } = await imp('faults.mjs'); const { createOpenAq } = await imp('openaq.mjs');
const app = { dataDir: DATA, scheduler: null };
const C = createCopies(app, NL, DATA, { noSchedule: true }); app.copies = C; await C.run(); const M = await C.mach(); const st = C.status();
const F = createFaults(app); const fs1 = F.status();
const A = createOpenAq(app, DATA); await A.poll(); const as = A.status();
globalThis.fetch = realFetch;
ok(!M.ok && /retired/.test(M.why) && !/lake/i.test(M.why), 'L3 the lake fresh: the MACH copy says "retired" (v283.28: the fleet uses its own database call), it never falls to the lake', M.why);
ok(!fs.existsSync(join(T, 'NIGRAAN', 'nig', 'copies', 'lake')) && Object.keys(st.sources).length === 0, 'L3 nothing copied from the lake (no nig/copies/lake) and no source configured (v283.28)', JSON.stringify(st.sources));
ok(fs1.ok && fs1.file === 'nigraan' && fs1.features > 0, 'L3 the fault layer serves NIGRAAN\'s own file (data/gem-active-faults-pk.json)', JSON.stringify(fs1));
ok(as.on && fetched > 0 && !Object.keys(A.recent().obs).length && as.source === 'OpenAQ API', 'L3 OpenAQ polls its own API only (stubbed: no network) and takes nothing from the lake\'s OpenAQ file', JSON.stringify({ on: as.on, fetched, src: as.source, err: as.lastError }));
ok(!touched.length, 'L3 no fs call reached a path under DATA LAKE / AGN_LAKE (copy run, MACH reader, faults, OpenAQ)', [...new Set(touched)].slice(0, 4).join(' | '));

/* ── L4 · the retention rule leaves the old lake copies alone ── */
{ const cp = join(T, 'copies4'); w(join(cp, 'lake', 'data', 'mach_obs', 'daily', 'obs_20261001.csv'), 'x\n'); w(join(cp, 'lake', 'data', 'imerg_hh', 'late', '2026', 'imerg_late_20261001.nc'), 'x');
  w(join(cp, 'lamha', 'data', 'mach', 'db', 'obs_20261001.csv'), 'x\n'); const old = new Date('2026-10-01T00:00:00Z'); for (const f of [join(cp, 'lake', 'data', 'mach_obs', 'daily', 'obs_20261001.csv'), join(cp, 'lake', 'data', 'imerg_hh', 'late', '2026', 'imerg_late_20261001.nc'), join(cp, 'lamha', 'data', 'mach', 'db', 'obs_20261001.csv')]) fs.utimesSync(f, old, old);
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const r = spawnSync(py, [join(ROOT, 'scripts', 'copies_retention.py'), '--copies', cp, '--archive', join(T, 'arch4'), '--config', join(ROOT, 'data', 'copy-sources.json'), '--keep-days', '7', '--today', '2026-10-27'], { encoding: 'utf8' });
  if (r.error) ok(true, 'L4 (skipped: no Python on this computer)');
  else ok(r.status === 0 && !/lake\//.test(r.stdout.replace(/\\/g, '/').split('rule keepDays')[1] || '') && fs.existsSync(join(cp, 'lamha', 'data', 'mach', 'db', 'obs_20261001.csv')), 'L4 the retention plan moves no file under nig/copies/lake (v283.28: no dataset left, so the old copies all stay where they are)', r.stdout.slice(-600) + r.stderr); }

try { fs.rmSync(T, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
