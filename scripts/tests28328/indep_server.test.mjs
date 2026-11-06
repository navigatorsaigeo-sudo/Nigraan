// v91.17.283.28 · INDEPENDENCE FROM LAMHA (owner, 28 Oct 2026 11:10 PKT) · the server side, offline, temporary folders only:
//  S1 ownpaths.mjs: the own folder is <nigraan-local>/../own (D:\NIGRAAN\nig\own), NIGRAAN_OWN_DIR overrides
//  S2 ewssource.mjs: always own (the retired modes lamha / failover say so), the store in the own folder, the last sync's request count
//  S3 copies.mjs: an inert shim - copies nothing, mach() / metar() / gate() say retired, ews() names the own store, status() lists the own
//     feeds; the CSV helpers other modules import still work; data/copy-sources.json has no source and no dataset
//  S4 pyjobs.mjs: the own-feed jobs (ewsSync, metarSync, radarPull, isdLite) are scheduled; ewsAppend reads the own EWS store (skipped
//     until it holds a raw file)
//  S5 machdb.mjs: the 10-minute live window (machDbLive, slot sync) beside the 6-hourly record run
//  S6 fleet.mjs / synop.mjs: no copy path left (the poll asks the database with obs.key; the airports come from the own METAR record)
//  S7 scripts/agents/lamha_copy.mjs: copies nothing, opens nothing under LAMHA, keeps pyRun for verify.mjs
//  S8 no code path of the server, the agents or the jobs reads a LAMHA folder (comments left out) - this holds once the patch for the
//     files other builders own is applied (indep_others.patch); before that it lists them
// usage: node scripts/tests28328/indep_server.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + String(d).slice(0, 600) : '')); } };
const imp = (f) => import(pathToFileURL(join(API, f)).href);
for (const k of ['NIGRAAN_OWN_DIR', 'NIGRAAN_EWS_OWN_DIR', 'NIGRAAN_COPIES_DIR', 'NIGRAAN_PYJOBS', 'NIGRAAN_MACH_DB_SYNC']) delete process.env[k];
const T = mkdtempSync(join(tmpdir(), 'indep-srv-')); const NIG = join(T, 'NIGRAAN', 'nig'); const APP = join(NIG, 'nigraan-local'), DATA = join(APP, 'data'); mkdirSync(DATA, { recursive: true });
for (const f of ['ews-source.json', 'copy-sources.json']) writeFileSync(join(DATA, f), readFileSync(join(ROOT, 'data', f)));
const fakeApp = () => { const jobs = []; return { jobs, scheduler: { every: (id, ms, fn, o) => { jobs.push({ id, ms, o }); return null; } } }; };

/* S1 */
const { ownDir, OWN } = await imp('ownpaths.mjs');
ok(ownDir(APP) === resolve(NIG, 'own'), 'S1 the own folder is nig/own beside nigraan-local', ownDir(APP));
process.env.NIGRAAN_OWN_DIR = join(T, 'elsewhere'); ok(ownDir(APP) === resolve(T, 'elsewhere'), 'S1 NIGRAAN_OWN_DIR overrides'); delete process.env.NIGRAAN_OWN_DIR;
ok(OWN.machDb.join('/') === 'data/mach/db' && OWN.metar.join('/') === 'data/obs_other/metar_live' && OWN.ews.join('/') === 'data/pmd/ews_live' && OWN.radar.join('/') === 'data/radar', 'S1 LAMHA\'s relative layout inside the own folder');

/* S2 */
const { ewsSource } = await imp('ewssource.mjs');
let E = ewsSource(APP, DATA); ok(E.mode === 'own' && E.active === 'own' && E.root === resolve(NIG, 'own') && E.live === join(resolve(NIG, 'own'), 'data', 'pmd', 'ews_live'), 'S2 the shipped switch: own, the store in the own folder', JSON.stringify(E));
for (const m of ['failover', 'lamha']) { const cfg = JSON.parse(readFileSync(join(DATA, 'ews-source.json'), 'utf8')); writeFileSync(join(DATA, 'ews-source.json'), JSON.stringify({ ...cfg, mode: m }));
  E = ewsSource(APP, DATA); ok(E.active === 'own' && /retired/.test(E.why), 'S2 mode ' + m + ' in the file: retired, still own', E.why); }
mkdirSync(E.live, { recursive: true }); writeFileSync(join(E.live, 'sync_status.json'), JSON.stringify({ sync_pkt: '2026-10-28 12:00', requests: 512, portal_requests: 530, new_readings: 900 }));
E = ewsSource(APP, DATA); ok(E.lastSync && E.lastSync.portalRequests === 530, 'S2 the last sync\'s portal request count is shown', JSON.stringify(E.lastSync));
writeFileSync(join(DATA, 'ews-source.json'), readFileSync(join(ROOT, 'data', 'ews-source.json')));
ok(JSON.parse(readFileSync(join(ROOT, 'data', 'ews-source.json'), 'utf8')).ownHoldWhileLamhaFresh === false, 'S2 the shipped switch never holds for LAMHA');

/* S3 */
const CP = await imp('copies.mjs');
const C = CP.createCopies(fakeApp(), APP, DATA, { noSchedule: true });
const r = await C.run(); const m = await C.mach(); const mt = await C.metar(); const st = C.status();
ok(!r.ok && !m.ok && !mt.ok && /retired/.test(m.why) && !C.gate('lamha_mach').ok, 'S3 run / mach / metar / gate: retired, nothing copied', JSON.stringify({ r, m }));
ok(st.on === false && /retired/.test(st.retired) && !Object.keys(st.datasets).length && st.ownFeeds && st.ownFeeds.ownDir === resolve(NIG, 'own'), 'S3 status: retired, no dataset, the own feeds listed', JSON.stringify(st).slice(0, 300));
ok(!C.ews().ok, 'S3 ews(): no own store yet -> not ok'); mkdirSync(join(E.live, 'raw'), { recursive: true });
ok(C.ews().ok && C.ews().root === resolve(NIG, 'own'), 'S3 ews(): the own store once it holds raw files', JSON.stringify(C.ews()));
ok(!existsSync(join(NIG, 'copies', 'lamha')), 'S3 nothing written under nig/copies/lamha');
ok(typeof CP.splitCsvLine === 'function' && CP.splitCsvLine('a,"b,c",d').length === 3 && Number.isFinite(CP.utcMs('2026-10-28 05:00')) && typeof CP.streamCsv === 'function' && typeof CP.pick === 'function', 'S3 the CSV helpers other modules import still work');
const CS = JSON.parse(readFileSync(join(ROOT, 'data', 'copy-sources.json'), 'utf8'));
ok(!Object.keys(CS.sources).length && !Object.keys(CS.datasets).length && !/"lamha_/.test(JSON.stringify(CS.datasets)), 'S3 copy-sources.json: no source, no dataset (the LAMHA copies deleted)');

/* S4 */
const PJ = await imp('pyjobs.mjs'); const A4 = fakeApp(); const J = PJ.createPyJobs(A4, APP, DATA);
const ids = A4.jobs.map((j) => j.id);
ok(['ewsSync', 'metarSync', 'radarPull', 'isdLite', 'ewsAppend'].every((x) => ids.includes(x)), 'S4 the own-feed jobs are scheduled', ids.join(','));
const jb = (id) => J._jobs.find((j) => j.id === id);
ok(jb('metarSync').everyH === 0.25 && jb('radarPull').everyH === 6 && jb('isdLite').everyH === 24 && jb('metarSync').heavy === 'sync', 'S4 cadences: METAR each 30-min tick, radar 6 h, ISD-Lite daily');
ok(/NIGRAAN fetches itself/.test(jb('ewsSync').label) && !/failover/i.test(jb('ewsSync').label), 'S4 ewsSync is the own fetch, no longer a LAMHA failover');
const pre = jb('ewsAppend').pre(); ok(pre.ok && pre.args[0] === '--lamha' && pre.args[1] === resolve(NIG, 'own'), 'S4 ewsAppend appends from the own EWS store', JSON.stringify(pre));

/* S5 */
const MD = await imp('machdb.mjs'); const A5 = fakeApp(); const MS = MD.createMachDbSync(A5, APP, DATA);
const live = A5.jobs.find((j) => j.id === 'machDbLive'), rec = A5.jobs.find((j) => j.id === 'machDb');
ok(live && live.ms === 600e3 && live.o.heavy === 'sync' && rec && rec.ms === 6 * 3600e3, 'S5 the MACH live window every 10 min (slot sync) and the record every 6 h', JSON.stringify(A5.jobs));
ok(typeof MS.runLive === 'function' && MS.status().live && 'on' in MS.status().live, 'S5 the live run has its own status');

/* S6 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const fleet = strip(readFileSync(join(API, 'fleet.mjs'), 'utf8')), synop = strip(readFileSync(join(API, 'synop.mjs'), 'utf8'));
ok(!/fromCopy|app\.copies|C\.mach\(/.test(fleet) && /fetchDb\(\)/.test(fleet) && !/NIGRAAN_LAMHA/.test(fleet), 'S6 fleet.mjs: no copy path, no LAMHA gate; the poll asks the database (fetchDb)');
ok(/solarWm2: v\(iSo\)/.test(fleet), 'S6 fleet.mjs: the local record carries solar, wind and gust');
ok(!/app\.copies|\.metar\(/.test(synop) && /ownMetar\(/.test(synop) && /OWN_METAR_STALE_MIN = 60/.test(synop), 'S6 synop.mjs: the airports from NIGRAAN\'s own METAR record (fresh within 60 min), else IEM');

/* S7 */
const LC = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'lamha_copy.mjs')).href);
const LAM = join(T, 'LAMHA'); mkdirSync(join(LAM, 'data', 'pmd', 'ews_live'), { recursive: true }); writeFileSync(join(LAM, 'data', 'pmd', 'ews_live', 'ews_live_hourly.parquet'), 'x');
const before = statSync(join(LAM, 'data', 'pmd', 'ews_live', 'ews_live_hourly.parquet')).atimeMs;
const lr = await LC.run({ app: APP, dataDir: DATA, lamha: LAM, dest: join(NIG, 'data', 'from_lamha'), noQc: true });
ok(lr.copied.length === 0 && lr.state.copied === 0 && /retired/.test(lr.state.retired) && !existsSync(join(NIG, 'data', 'from_lamha')), 'S7 lamha_copy.mjs copies nothing and creates no from_lamha folder', JSON.stringify(lr.state).slice(0, 300));
ok(typeof LC.pyRun === 'function' && typeof LC.pythonExe === 'function', 'S7 pyRun / pythonExe still exported (verify.mjs uses them)');

/* S8 */
const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) { if (!/node_modules|tests?\d|tests_|__pycache__/.test(f)) walk(p); } else if (/\.(mjs|js|py)$/.test(f)) files.push(p); } };
walk(API); walk(join(ROOT, 'scripts', 'agents')); for (const f of ['scripts/ecmwf/ingest_ecmwf010.py', 'scripts/ecmwf/score_shadow.py']) files.push(join(ROOT, f));
const pyStrip = (s) => s.replace(/^\s*#.*$/gm, '').replace(/"""[\s\S]*?"""/g, '').replace(/r"""[\s\S]*?"""/g, '');
const RX = /NIGRAAN_LAMHA_DIR|NIGRAAN_FROM_LAMHA_DIR|from_lamha|'copies', 'lamha'|copiesDir, 'lamha'|copiesDir\(\), 'lamha'|C, 'lamha'|'\.\.', '\.\.', '\.\.', 'LAMHA'|D:\\\\LAMHA/;
const hits = []; for (const f of files) { const t = readFileSync(f, 'utf8'); const c = f.endsWith('.py') ? pyStrip(t) : strip(t); const L = c.split('\n'); L.forEach((l, i) => { if (RX.test(l)) hits.push(f.replace(ROOT + '/', '') + ':' + (i + 1) + ' ' + l.trim().slice(0, 140)); }); }
/* the one exception: server/api/agents.mjs names D:\LAMHA and nig/data/from_lamha in its path scrub (scrubPaths masks those folder names
   in the agents' text; nothing is read there) */
const SCRUB = /const fromLamha = |const lamhaDir = |const pairs = \[\[resolve\(fromLamha/;
for (let i = hits.length - 1; i >= 0; i--) if (/server\/api\/agents\.mjs/.test(hits[i]) && SCRUB.test(hits[i])) hits.splice(i, 1);
ok(!hits.length, 'S8 no code path reads a LAMHA folder or a LAMHA copy (' + files.length + ' files; holds after indep_others.patch)', hits.slice(0, 12).join(' | '));

console.log(`\nindep_server ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
