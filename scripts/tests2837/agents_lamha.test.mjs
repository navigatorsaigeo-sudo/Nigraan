// v91.17.283.7 · agent 3, the partner-network copy from LAMHA (scripts/agents/lamha_copy.mjs), and its feeds:
//  L1 only the allow-list is copied (ews_live: the two hourly parquets, aegis_elements.csv, README_hydro.txt, sync_log.txt; radar
//     netcdf <site>/<product>/<site>_<product>_YYYY-MM-DD.nc for islamabad / karachi x sri / cappi01 / rain12 but not karachi rain12;
//     radar pull_log.txt): never secrets\, auth_state.json, state / sync / gap json, raw or raw_hydro folders, index json, odd names
//  L2 the LAMHA folder is never written (listing and modification times unchanged), and nothing is written outside the destination
//     and data/agents; a destination outside the guard folder (D:\NIGRAAN) or inside LAMHA copies nothing
//  L3 idempotent: a second run copies nothing; a changed source file is copied again, with the source's modification time
//  L4 feed health on these feeds: EWS runs every 30 min give ok, a 3-hour silence gives late / down from the feed's own gaps; radar pulls
//     are parsed; the copy job's own runs are a feed
//  L5 radar rain at a point (scripts/agents/radar_points.py, when Python has a NetCDF library): the hourly interval from the band frames,
//     out-of-range cells left out, the file's position notes carried
// usage: node scripts/tests2837/agents_lamha.test.mjs      (fails on v91.17.283.6: there is no agent)
import { writeFileSync, mkdirSync, mkdtempSync, readdirSync, statSync, readFileSync, existsSync, utimesSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 400) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 800) : '')); } };
let LC, FH; try { LC = await import(pathToFileURL(join(APP, 'scripts', 'agents', 'lamha_copy.mjs')).href); FH = await import(pathToFileURL(join(APP, 'scripts', 'agents', 'feed_health.mjs')).href); } catch (e) { ok(false, 'L0 the agent scripts load', e.message); console.log(`\nagents_lamha ${pass} passed, ${fail} failed`); process.exit(1); }
const T = mkdtempSync(join(tmpdir(), 'lc-')), LAM = join(T, 'LAMHA'), NIG = join(T, 'NIGRAAN'), APPD = join(NIG, 'nig', 'nigraan-local'), DATA = join(APPD, 'data'), DEST = join(NIG, 'nig', 'data', 'from_lamha'); mkdirSync(DATA, { recursive: true });
const put = (rel, txt = 'x') => { const f = join(LAM, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, txt); return f; };
const allowed = ['data/pmd/ews_live/ews_hydro_hourly.parquet', 'data/pmd/ews_live/ews_live_hourly.parquet', 'data/pmd/ews_live/aegis_elements.csv', 'data/pmd/ews_live/README_hydro.txt', 'data/pmd/ews_live/sync_log.txt', 'data/radar/pull_log.txt',
  'data/radar/netcdf/islamabad/sri/islamabad_sri_2026-10-20.nc', 'data/radar/netcdf/islamabad/cappi01/islamabad_cappi01_2026-10-20.nc', 'data/radar/netcdf/islamabad/rain12/islamabad_rain12_2026-10-20.nc', 'data/radar/netcdf/karachi/sri/karachi_sri_2026-10-21.nc', 'data/radar/netcdf/karachi/cappi01/karachi_cappi01_2026-10-21.nc'];
const denied = ['secrets/mach.key', 'secrets/aegis.json', 'data/pmd/ews_live/auth_state.json', 'data/pmd/ews_live/state.json', 'data/pmd/ews_live/sync_status.json', 'data/pmd/ews_live/gap_state.json', 'data/pmd/ews_live/backfill_hydro_state.json',
  'data/pmd/ews_live/raw/ews_raw_20261020.csv.gz', 'data/pmd/ews_live/raw_hydro/ews_hydro_20261020.csv.gz', 'data/pmd/ews_live/ews_bias_check.csv', 'data/radar/netcdf/karachi/rain12/karachi_rain12_2026-10-21.nc', 'data/radar/netcdf/islamabad/sri/notes.nc',
  'data/radar/netcdf/islamabad/sri/islamabad_cappi01_2026-10-20.nc', 'data/radar/index/islamabad_sri_2026-10-20.json', 'data/radar/convert_log.txt', 'data/radar/netcdf/lahore/sri/lahore_sri_2026-10-20.nc'];
for (const r of [...allowed, ...denied]) put(r, 'content of ' + r);
const snap = () => { const out = {}; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else out[relative(LAM, p)] = [s.size, s.mtimeMs]; } }; walk(LAM); return JSON.stringify(out); };
const before = snap();
const run = () => spawnSync(process.execPath, [join(APP, 'scripts', 'agents', 'lamha_copy.mjs'), '--app', APPD, '--data', DATA, '--lamha', LAM, '--dest', DEST, '--no-qc'], { encoding: 'utf8' });
const r1 = run(); const got = (() => { const out = []; const walk = (d) => { if (!existsSync(d)) return; for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : out.push(relative(DEST, p).split('\\').join('/')); } }; walk(DEST); return out.sort(); })();
const want = allowed.map((r) => r.replace(/^data\/pmd\/ews_live\//, 'ews_live/').replace(/^data\/radar\//, 'radar/')).sort();
ok(r1.status === 0 && JSON.stringify(got) === JSON.stringify(want), 'L1 exactly the allow-list is copied (' + got.length + ' files; secrets, auth_state, state/sync/gap json, raw folders, karachi rain12, odd names left)', JSON.stringify({ got, out: r1.stdout + r1.stderr }));
ok(snap() === before, 'L2a the LAMHA folder is unchanged (listing, sizes, modification times)');
const walkAll = (d) => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walkAll(join(d, n)) : [relative(NIG, join(d, n)).split('\\').join('/')]);
ok(walkAll(NIG).every((f) => f.startsWith('nig/data/from_lamha/') || f.startsWith('nig/nigraan-local/data/agents/')), 'L2b nothing written outside nig/data/from_lamha and data/agents', walkAll(NIG).filter((f) => !f.startsWith('nig/data/from_lamha/')).join(', '));
const bad1 = spawnSync(process.execPath, [join(APP, 'scripts', 'agents', 'lamha_copy.mjs'), '--app', APPD, '--data', DATA, '--lamha', LAM, '--dest', join(T, 'elsewhere'), '--no-qc'], { encoding: 'utf8' });
const bad2 = spawnSync(process.execPath, [join(APP, 'scripts', 'agents', 'lamha_copy.mjs'), '--app', APPD, '--data', DATA, '--lamha', LAM, '--dest', join(LAM, 'data', 'copy'), '--guard', T, '--no-qc'], { encoding: 'utf8' });
ok(!existsSync(join(T, 'elsewhere')) && /not inside/.test(bad1.stdout) && !existsSync(join(LAM, 'data', 'copy')) && /inside the LAMHA folder/.test(bad2.stdout) && snap() === before, 'L2c a destination outside D:\\NIGRAAN, or inside LAMHA, copies nothing', (bad1.stdout + ' | ' + bad2.stdout).trim());
const r2 = run(); ok(r2.status === 0 && /0 copied, 11 unchanged/.test(r2.stdout), 'L3a idempotent: a second run copies nothing', r2.stdout.trim());
const f = put('data/pmd/ews_live/ews_live_hourly.parquet', 'new content, longer than before'); const t0 = new Date('2026-10-22T10:00:00Z'); utimesSync(f, t0, t0);
const r3 = run(); const d3 = statSync(join(DEST, 'ews_live', 'ews_live_hourly.parquet'));
ok(/1 copied, 10 unchanged/.test(r3.stdout) && readFileSync(join(DEST, 'ews_live', 'ews_live_hourly.parquet'), 'utf8') === 'new content, longer than before' && Math.abs(d3.mtimeMs - t0.getTime()) < 2000, 'L3b a changed source file is copied again, with the source time', r3.stdout.trim());
const st = JSON.parse(readFileSync(join(DATA, 'agents', 'lamha', 'state.json'), 'utf8')); ok(st.runs === 5 && st.copied === 1 && !JSON.stringify(st).includes('pmd'), 'L3c the job state (5 runs, the 2 refused ones included) is written under data/agents/lamha, with neutral folder names', JSON.stringify({ runs: st.runs, copied: st.copied, missing: st.missing }));
/* L4 feed cadence on the partner-network feeds */
const P = (s) => Date.parse(s.replace(' ', 'T') + ':00Z') - 5 * 3600e3; const pk = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const L = []; for (let t = P('2026-10-18 00:10'); t <= P('2026-10-22 12:10'); t += 30 * 6e4) L.push(pk(t) + ' PKT  [https] 500 element requests, ' + (300 + (t / 6e4) % 7) + ' new readings, 400 new hydro readings; 66 stations with temperature in the last 2 h (60 s)');
L.push(pk(P('2026-10-22 12:20')) + ' PKT  gap re-check: 9787 holes at 618 elements in the last 25 days; 24 requests, 0 readings recovered');
writeFileSync(join(DEST, 'ews_live', 'sync_log.txt'), L.join('\n') + '\n'); writeFileSync(join(DEST, 'radar', 'pull_log.txt'), '2026-10-22 01:06:29 archive_from 2026-09-21: 8919 new frames listed, 8919 downloaded, 0 to retry\n2026-10-22 07:00:37 archive_from 2026-09-22: 0 new frames listed, 0 downloaded, 0 to retry\n2026-10-22 14:54:32 archive_from 2026-09-22: 57 new frames listed, 57 downloaded, 0 to retry\n');
const fh = (now) => FH.check({ app: APPD, dataDir: DATA, copiesDir: join(T, 'copies'), fromLamha: DEST, now }).feeds;
const a = fh(P('2026-10-22 12:25')), b = fh(P('2026-10-22 15:30'));
ok(a.ews_weather.status === 'ok' && a.ews_weather.cadenceMin === 30 && a.ews_hydro.status === 'ok' && (b.ews_weather.status === 'down' || b.ews_weather.status === 'late') && b.ews_hydro.status === b.ews_weather.status, 'L4a EWS weather / hydrology: ok at the measured 30-min cadence; ' + b.ews_weather.status + ' after 3 h 20 min of silence', JSON.stringify([a.ews_weather.status, a.ews_weather.lateAfterMin, b.ews_weather.status, b.ews_weather.ageMin]));
ok(FH.parsePullLog(readFileSync(join(DEST, 'radar', 'pull_log.txt'), 'utf8')).length === 2 && a.radar_islamabad_sri && a.lamha_copy && a.mach_db_sync && !('radar_karachi_rain12' in a), 'L4b radar pulls parsed (a pull with no frame is not an update); radar per site and product, the copy job and the MACH database sync are feeds', Object.keys(a).filter((k) => /radar|lamha|mach_db/.test(k)).join(','));
/* L5 radar at a point */
const py = spawnSync(process.platform === 'win32' ? 'py' : 'python3', [...(process.platform === 'win32' ? ['-3'] : []), '-c', 'import netCDF4, numpy'], { encoding: 'utf8' });
if (py.status !== 0) console.log('     (L5 not run here: no Python netCDF4 to write the test file)');
else { const nc = join(T, 'rad', 'islamabad', 'sri'); mkdirSync(nc, { recursive: true });
  const mk = spawnSync(process.platform === 'win32' ? 'py' : 'python3', [...(process.platform === 'win32' ? ['-3'] : []), '-c', `
import netCDF4, numpy as np
d=netCDF4.Dataset(r'${join(nc, 'islamabad_sri_2026-10-20.nc')}','w'); d.createDimension('time',12); d.createDimension('y',3); d.createDimension('x',3); d.createDimension('band_class',4)
d.geometry='assumed radar-centred azimuthal equidistant, +-R km, no resampling'; d.time='UTC (file names are PKT)'; d.radar_lat=33.68; d.radar_lon=73.06
t=d.createVariable('time','i8',('time',)); t.units='minutes since 2026-10-20 06:01:00'; t[:]=np.arange(12)*10
lo=d.createVariable('band_lower','f4',('band_class',)); lo[:]=[0,1,2,4]; hi=d.createVariable('band_upper','f4',('band_class',)); hi[:]=[np.nan,2,4,np.nan]
la=d.createVariable('lat','f4',('y','x')); lo2=d.createVariable('lon','f4',('y','x')); la[:]=np.array([[33.70]*3,[33.68]*3,[33.66]*3]); lo2[:]=np.array([[73.04,73.06,73.08]]*3)
b=d.createVariable('band','u1',('time','y','x')); a=np.zeros((12,3,3),dtype='u1'); a[:6,1,1]=2; a[6:,1,1]=0; a[:,0,0]=255; b[:]=a; d.close()`], { encoding: 'utf8' });
  writeFileSync(join(T, 'pts.json'), JSON.stringify([{ id: 'centre', lat: 33.68, lon: 73.06 }, { id: 'corner', lat: 33.70, lon: 73.04 }, { id: 'far', lat: 30, lon: 70 }]));
  const rp = spawnSync(process.platform === 'win32' ? 'py' : 'python3', [...(process.platform === 'win32' ? ['-3'] : []), '-I', join(APP, 'scripts', 'agents', 'radar_points.py'), '--radar', join(T, 'rad'), '--site', 'islamabad', '--days', '2026-10-20', '--points', join(T, 'pts.json'), '--out', join(T, 'rp.json')], { encoding: 'utf8' });
  const O = existsSync(join(T, 'rp.json')) ? JSON.parse(readFileSync(join(T, 'rp.json'), 'utf8')) : {}; const H = (O.hours || {}).centre || {}; const h1 = String(Date.parse('2026-10-20T07:01:00Z')), h2 = String(Date.parse('2026-10-20T08:01:00Z'));
  const first = Object.entries(H).find(([, v]) => v[0] > 0), second = Object.entries(H).find(([, v]) => v[0] === 0);
  ok(mk.status === 0 && rp.status === 0 && first && first[1][0] === 2 && first[1][1] === 4 && second && second[1][1] === 1 && !('far' in (O.points || {})) && !Object.keys((O.hours || {}).corner || {}).length && /azimuthal equidistant/.test(O.notes.geometry),
    'L5 radar hour: band 2 [2,4) mm/h for six frames = [2, 4) mm; band 0 = [0, 1) mm; out-of-range cell and far point left out; position notes carried', JSON.stringify({ H, pts: O.points, out: (rp.stdout + rp.stderr + mk.stderr).slice(0, 300) })); }
console.log(`\nagents_lamha ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
