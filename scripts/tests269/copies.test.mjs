/* v91.17.269 · A4 · copy, not fetch (server/api/copies.mjs): LAMHA's MACH, METAR and PMD-EWS files and the data lake's datasets copied
   into nig/copies, validated, and fed to the consumers; every fallback case. Fixtures: real rows of the LAMHA copy
   (scripts/tests269/fixtures: MACH database 13 Oct 2026 08-12 UTC, 2,412 readings; METAR 13 Oct; PMD-EWS 13 Oct 08-11 UTC; LAMHA's
   register and status; the lake catalogue), moved in time so the newest record is minutes old. Builds a temporary D:\-like tree
   (LAMHA, DATA LAKE, NIGRAAN\nig\nigraan-local); starts no server and makes no network call (the fleet's own fetch goes to a closed
   local port).
   usage: node scripts/tests269/copies.test.mjs */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, chmodSync, existsSync, copyFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const { createCopies, streamCsv, utcMs, splitCsvLine } = await import(join(ROOT, 'server/api/copies.mjs'));
const { createLake } = await import(join(ROOT, 'server/api/lake.mjs'));
const { createFleet } = await import(join(ROOT, 'server/api/fleet.mjs'));
const { createOpenAq } = await import(join(ROOT, 'server/api/openaq.mjs'));
const { createPyJobs } = await import(join(ROOT, 'server/api/pyjobs.mjs'));
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 300) : '')); };
for (const k of ['NIGRAAN_COPY', 'NIGRAAN_LAMHA', 'NIGRAAN_DATALAKE', 'NIGRAAN_LAKE', 'NIGRAAN_COPIES_DIR', 'NIGRAAN_LAMHA_DIR', 'NIGRAAN_DATALAKE_DIR']) delete process.env[k];
delete process.env.NIGRAAN_PYJOBS;

/* ── the tree ── */
const D = mkdtempSync(join(tmpdir(), 'v269-copies-'));
const LAMHA = join(D, 'LAMHA'), LAKE = join(D, 'DATA LAKE', 'AGN_LAKE'), NL = join(D, 'NIGRAAN', 'nig', 'nigraan-local'), DATA = join(NL, 'data');
mkdirSync(DATA, { recursive: true }); mkdirSync(join(D, 'NIGRAAN', 'nig', 'station-lake', 'scripts'), { recursive: true }); writeFileSync(join(D, 'NIGRAAN', 'nig', 'station-lake', 'scripts', 'append_lamha_ews.py'), '# fixture: never run here\n');
for (const f of ['copy-sources.json', 'mach-fleet-stations.json', 'mach-siting.json']) copyFileSync(join(ROOT, 'data', f), join(DATA, f));
const w = (p, t) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t); };
const csvOf = (head, rows) => [head.join(',')].concat(rows.map((r) => head.map((h) => { const v = r[h] == null ? '' : String(r[h]); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','))).join('\n') + '\n';
async function rowsOf(f) { const out = []; let head = null; await streamCsv(f, (o) => { if (!head) head = Object.keys(o); out.push(o); }); return { head, rows: out }; }
const day = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''), month = (ms) => new Date(ms).toISOString().slice(0, 7).replace('-', '');
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z'), sp = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

/* MACH: the 4 h of real readings moved so the newest is 5 min old (ageMin = how old the newest should be) */
const MACH = await rowsOf(join(FX, 'mach_obs_4h.csv'));
const machT1 = Math.max(...MACH.rows.map((r) => utcMs(r.time)));
function writeMach(root, sub, ageMin, mutate) {
  const shift = Date.now() - ageMin * 60e3 - machT1; const by = new Map();
  for (const r0 of MACH.rows) { const r = { ...r0, time: iso(utcMs(r0.time) + shift) }; if (mutate) mutate(r); const d = day(utcMs(r.time)); (by.get(d) || by.set(d, []).get(d)).push(r); }
  for (const [d, rs] of by) w(join(root, sub, 'obs_' + d + '.csv'), csvOf(MACH.head, rs));
  /* v269 integration: a day of the copy window with no rows gets a header-only file, so rows an earlier step wrote there (5 min old)
     cannot make a later "45 min old" step look fresh when the test runs between 00:00 and 04:00 UTC */
  for (const d of [day(Date.now() - 86400e3), day(Date.now())]) if (!by.has(d)) w(join(root, sub, 'obs_' + d + '.csv'), csvOf(MACH.head, []));
  return [...by.keys()];
}
function lamhaMach(ageMin = 5, mutate = null, register = null) {
  const days = writeMach(LAMHA, join('data', 'mach', 'db'), ageMin, mutate);
  w(join(LAMHA, 'data', 'mach', 'db', 'last_sync.txt'), iso(Date.now() - ageMin * 60e3));
  w(join(LAMHA, 'data', 'mach', 'db', 'latest_status.json'), readFileSync(join(FX, 'latest_status.json')));
  w(join(LAMHA, 'data', 'mach', 'clean', 'mach_station_status.csv'), register || readFileSync(join(FX, 'mach_station_status.csv')));
  return days;
}
/* METAR: one day of real reports moved so the newest is ageMin old */
const MET = await rowsOf(join(FX, 'metar_1d.csv'));
function lamhaMetar(ageMin = 10) {
  const t1 = Math.max(...MET.rows.map((r) => utcMs(r.time_utc))); const shift = Date.now() - ageMin * 60e3 - t1; const by = new Map();
  for (const r0 of MET.rows) { const ms = utcMs(r0.time_utc) + shift; const r = { ...r0, time_utc: sp(ms), received_utc: r0.received_utc ? sp(utcMs(r0.received_utc) + shift) : '' }; const m = month(ms); (by.get(m) || by.set(m, []).get(m)).push(r); }
  for (const [m, rs] of by) w(join(LAMHA, 'data', 'obs_other', 'metar_live', 'metar_' + m + '.csv'), csvOf(MET.head, rs));
  w(join(LAMHA, 'data', 'obs_other', 'metar_live', 'airports.csv'), readFileSync(join(FX, 'airports.csv')));
}
/* PMD-EWS: 3 h of real readings, gzip, plus the sync status (PKT) */
const EWS = await rowsOf(join(FX, 'ews_3h.csv'));
function lamhaEws(ageMin = 10, syncAgeMin = 10) {
  const t1 = Math.max(...EWS.rows.map((r) => utcMs(r.time_utc))); const shift = Date.now() - ageMin * 60e3 - t1; const by = new Map();
  for (const r0 of EWS.rows) { const ms = utcMs(r0.time_utc) + shift; const r = { ...r0, time_utc: sp(ms) }; const d = day(ms); (by.get(d) || by.set(d, []).get(d)).push(r); }
  for (const [d, rs] of by) w(join(LAMHA, 'data', 'pmd', 'ews_live', 'raw', 'ews_raw_' + d + '.csv.gz'), gzipSync(csvOf(EWS.head, rs)));
  for (const d of [day(Date.now() - 86400e3), day(Date.now())]) if (!by.has(d)) w(join(LAMHA, 'data', 'pmd', 'ews_live', 'raw', 'ews_raw_' + d + '.csv.gz'), gzipSync(csvOf(EWS.head, [])));   /* v269 integration: as writeMach */
  w(join(LAMHA, 'data', 'pmd', 'ews_live', 'sync_status.json'), JSON.stringify({ sync_pkt: sp(Date.now() - syncAgeMin * 60e3 + 5 * 3600e3), requests: 280 }));
}
/* copy-only tables: LAMHA's MACH QC tables and the PMD-origin catalogue, station list and synoptic log (heads of the real files) */
function lamhaMeta(catalogue = null) {
  for (const f of ['duplicate_feeds.csv', 'manual_flags.csv']) w(join(LAMHA, 'data', 'mach', 'clean', f), readFileSync(join(FX, f)));
  w(join(LAMHA, 'data', 'mach', 'clean', 'hourly', 'qc_by_station.csv'), readFileSync(join(FX, 'qc_by_station_head.csv')));
  w(join(LAMHA, 'data', 'pmd', 'aegis_gb_station_catalog.csv'), catalogue || readFileSync(join(FX, 'aegis_gb_station_catalog_head.csv')));
  w(join(LAMHA, 'data', 'pmd', 'synop_stations.csv'), readFileSync(join(FX, 'synop_stations.csv')));
  w(join(LAMHA, 'data', 'pmd', 'pmd_synop_live_' + new Date().toISOString().slice(0, 7) + '.jsonl'), readFileSync(join(FX, 'pmd_synop_live_head.jsonl')));
}
/* the lake: catalogue, status, mach_obs (yesterday gzip), latest.json, OpenAQ, earthquakes, faults, IMERG day files */
function lakeAll(machAge = 5, statusAgeMin = 5) {
  w(join(LAKE, 'catalogue', 'catalogue.json'), readFileSync(join(FX, 'lake_catalogue.json')));
  for (const id of ['mach_obs', 'mach_stations', 'aq_openaq', 'quake_usgs', 'imerg_late_hh']) w(join(LAKE, 'status', id + '.json'), JSON.stringify({ lastSuccessUtc: iso(Date.now() - statusAgeMin * 60e3), latestObsUtc: iso(Date.now() - statusAgeMin * 60e3), ok: true }));
  const days = writeMach(LAKE, join('data', 'mach_obs', 'daily'), machAge);
  const yd = day(Date.now() - 864e5); const yf = join(LAKE, 'data', 'mach_obs', 'daily', 'obs_' + yd + '.csv');   /* yesterday as .csv.gz, as the lake keeps it */
  if (existsSync(yf)) { w(yf + '.gz', gzipSync(readFileSync(yf))); writeFileSync(yf, ''); require_unlink(yf); }
  w(join(LAKE, 'data', 'mach_stations', 'latest.json'), JSON.stringify({ updatedAt: iso(Date.now()), stations: JSON.parse(readFileSync(join(FX, 'latest_status.json'), 'utf8')).stations }));
  const aqHead = ['location_id', 'location', 'provider', 'lat', 'lon', 'sensor_id', 'parameter', 'unit', 'observed_at_utc', 'value', 'fetched_utc']; const aq = [];
  for (let L = 0; L < 40; L++) for (let h = 0; h < 6; h++) { const t = iso(Math.floor((Date.now() - h * 3600e3) / 3600e3) * 3600e3); aq.push({ location_id: 9000 + L, location: 'Loc ' + L, provider: 'AirGradient', lat: 31 + L * 0.01, lon: 74, sensor_id: 50000 + L, parameter: 'pm25', unit: 'µg/m³', observed_at_utc: t, value: 40 + L + h, fetched_utc: iso(Date.now()) });
    aq.push({ location_id: 9000 + L, location: 'Loc ' + L, provider: 'AirGradient', lat: 31 + L * 0.01, lon: 74, sensor_id: 60000 + L, parameter: 'temperature', unit: 'f', observed_at_utc: t, value: 86, fetched_utc: iso(Date.now()) }); }
  const am = new Date().toISOString().slice(0, 7); w(join(LAKE, 'data', 'aq_openaq', 'aq_openaq_' + am + '.csv'), csvOf(aqHead, aq));
  w(join(LAKE, 'data', 'quake_usgs', 'events.csv'), 'id,time,updated,lat,lon,depthKm,mag,magType,place,status,type,felt,cdi,mmi,alert,tsunami,url\nus7000x,' + iso(Date.now() - 3600e3) + ',' + iso(Date.now() - 600e3) + ',34.1,73.2,10,4.4,mb,"20 km N of Muzaffarabad, Pakistan",reviewed,earthquake,,,,,0,https://earthquake.usgs.gov\n');
  w(join(LAKE, 'data', 'gem_faults', 'gem_active_faults_pk.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [] }));
  for (let k = 1; k <= 3; k++) { const d = new Date(Date.now() - k * 864e5); w(join(LAKE, 'data', 'imerg_hh', 'late', String(d.getUTCFullYear()), 'imerg_late_' + day(d) + '.nc'), Buffer.from('CDF\x01 fixture')); }
}
import { unlinkSync, rmSync } from 'node:fs'; function require_unlink(f) { try { unlinkSync(f); } catch (_) {} }
const treeHash = (dir) => { const h = createHash('sha256'); const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n), s = statSync(p); if (s.isDirectory()) walk(p); else h.update(p + ':' + s.size + ':' + Math.floor(s.mtimeMs)); } }; walk(dir); return h.digest('hex'); };
const env = () => { process.env.NIGRAAN_LAMHA_DIR = LAMHA; process.env.NIGRAAN_DATALAKE_DIR = LAKE; };
const make = (o = {}) => { env(); return createCopies({}, NL, DATA, { noSchedule: true, ...o }); };
const COPIES = join(D, 'NIGRAAN', 'nig', 'copies');   /* v269 integration: D:\NIGRAAN\nig\copies, not under station-lake */

/* ── 0 · reader ── */
{ const line = 'a,"b,c",' + '"""q"""' + ',"",d\r'; ok(JSON.stringify(splitCsvLine(line)) === JSON.stringify(['a', 'b,c', '"q"', '', 'd']), 'R · quoted fields, doubled quotes, CR', splitCsvLine(line)); }
ok(utcMs('2026-10-14') === Date.parse('2026-10-14T00:00:00Z') && utcMs('2026-10-14 05:10') === Date.parse('2026-10-14T05:10:00Z') && utcMs('2026-10-14T05:10:00+05:00') === Date.parse('2026-10-14T00:10:00Z'), 'R · bare-date midnight, space-separated UTC, offsets');
{ const f = join(D, 'r.csv'); writeFileSync(f, '# a comment line before the header\r\n\uFEFFtemperatureC,time,stationKey\r\n21.5,2026-10-14,mach1\r\n"22,5",2026-10-14T01:00:00Z,"mach2"\r\n23.0,2026-10-14T02:00:00Z,mac'); const R = []; const i = await streamCsv(f, (o) => R.push(o));
  ok(i.header[0] === 'temperatureC' && R.length === 2 && i.torn === 1 && R[1].temperatureC === '22,5', 'R · comment line, BOM, CRLF, columns in any order, a torn last line (no newline at the end) left out', JSON.stringify(i)); }
{ const f = join(D, 'r.csv.gz'); writeFileSync(f, gzipSync('stationKey,time,temperatureC\nA,2026-10-14T00:00:00Z,20\n')); const R = []; await streamCsv(f, (o) => R.push(o)); ok(R.length === 1 && R[0].stationKey === 'A', 'R · gzip'); }

/* ── 1 · all fresh: copied, validated, used; sources untouched ── */
lamhaMach(5); lamhaMetar(10); lamhaEws(10, 10); lamhaMeta(); lakeAll(5, 5);
for (const p of [LAMHA, join(D, 'DATA LAKE')]) { const ro = (d) => { for (const n of readdirSync(d)) { const q = join(d, n); if (statSync(q).isDirectory()) { ro(q); chmodSync(q, 0o555); } else chmodSync(q, 0o444); } }; ro(p); chmodSync(p, 0o555); }
const h0L = treeHash(LAMHA), h0K = treeHash(join(D, 'DATA LAKE'));
let C = make(); let res = await C.run();
ok(Object.values(res).every((g) => g.ok), '1 · every dataset copied and passed (fixtures fresh)', JSON.stringify(Object.fromEntries(Object.entries(res).filter(([, g]) => !g.ok))));
ok(treeHash(LAMHA) === h0L && treeHash(join(D, 'DATA LAKE')) === h0K, '1 · LAMHA and the lake untouched (read-only folders, same files, sizes and times)');
ok(existsSync(join(COPIES, 'lamha', 'data', 'mach', 'db', 'obs_' + day(Date.now()) + '.csv')) && existsSync(join(COPIES, 'lake', 'catalogue', 'catalogue.json')), '1 · copies under nig/copies/<source>/<the source\'s own path> (nothing under station-lake/copies)');
{ const src = join(LAMHA, 'data', 'mach', 'db', 'obs_' + day(Date.now()) + '.csv'), dst = join(COPIES, 'lamha', 'data', 'mach', 'db', 'obs_' + day(Date.now()) + '.csv');
  ok(Math.abs(statSync(src).mtimeMs - statSync(dst).mtimeMs) < 1 && readFileSync(src).equals(readFileSync(dst)), '1 · a copy keeps the bytes and the source\'s file time', statSync(src).mtimeMs + ' ' + statSync(dst).mtimeMs);
  const left = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.copying$/.test(n)) left.push(p); } }; walk(COPIES); ok(!left.length, '1 · no half-copied file left', left.join(' ')); }
{ await C.run(); const st = C.status().datasets; ok(Object.values(st).every((d) => d.copied === 0), '1 · a second run copies nothing unchanged (size and file time)', JSON.stringify(Object.fromEntries(Object.entries(st).map(([k, d]) => [k, d.copied])))); }
let M = await C.mach();
ok(M.ok && M.via === 'lamha' && M.stations.size >= 90 && M.ageMin <= 6, '1 · MACH from LAMHA\'s copy', JSON.stringify({ ok: M.ok, via: M.via, n: M.stations && M.stations.size, age: M.ageMin }));
{ const s = M.stations.get('mach1'); ok(s && Number.isFinite(s.temperatureC) && s.provider && /Z$/.test(s.time), '1 · a station\'s newest reading keeps its values and provider', JSON.stringify(s)); }
const v1 = C.status().datasets.lamha_mach.valid.checks; ok(v1.stations.n >= 71 && v1.stations.min === 39 && v1.register.dropped < v1.register.of / 2, '1 · station count against the seed (78 -> at least 39) and LAMHA\'s register', JSON.stringify({ st: v1.stations, reg: v1.register }));
let T = await C.metar(Date.now() - 30 * 3600e3);
ok(T.ok && T.rows.length > 100 && T.airports.size === 8 && T.rows.some((r) => r.wspd != null), '1 · METAR from the copy, wind from the report text', JSON.stringify({ ok: T.ok, n: T.rows && T.rows.length, ap: T.airports && T.airports.size }));
{ const st = C.status().datasets; const pm = st.lamha_pmd, mm = st.lamha_mach_meta;
  ok(pm.gate.ok && pm.internal && pm.origin === 'PMD' && st.lamha_ews.internal && mm.gate.ok && !mm.internal && existsSync(join(COPIES, 'lamha', 'data', 'pmd', 'aegis_gb_station_catalog.csv')) && existsSync(join(COPIES, 'lamha', 'data', 'mach', 'clean', 'hourly', 'qc_by_station.csv')),
    '1 · copy-only tables copied and checked: LAMHA MACH QC tables; PMD-origin catalogue, station list and synoptic log marked internal', JSON.stringify({ pm: pm.valid, mm: mm.valid && mm.valid.ok }));
  ok(!Object.keys(C).some((k) => /pmd|^meta$|aegis|synop/i.test(k)), '1 · no accessor hands a copy-only table to a consumer (only the internal PMD-EWS append job has one: ews)', Object.keys(C).join(','));
  const users = readdirSync(join(ROOT, 'server', 'api')).filter((f) => f !== 'copies.mjs' && /\.mjs$/.test(f) && /lamha_pmd|lamha_mach_meta|aegis_gb_station_catalog|pmd_synop_live|duplicate_feeds|manual_flags|qc_by_station/.test(readFileSync(join(ROOT, 'server', 'api', f), 'utf8')));
  ok(!users.length, '1 · no server module reads a copy-only table (no served path to a client)', users.join(',')); }
const E = C.ews(); ok(E.ok && E.root === join(COPIES, 'lamha') && existsSync(join(E.root, 'data', 'pmd', 'ews_live', 'raw')), '1 · PMD-EWS copy stands in for D:\\LAMHA (same relative paths)', JSON.stringify(E));

/* ── 2 · the consumers ── */
{ const app = { copies: C }; const P = createPyJobs(app, NL, DATA); const st = P.status().jobs.find((j) => j.id === 'ewsAppend');
  ok(st && typeof st === 'object', '2 · ewsAppend registered'); }
{ const app = { copies: C }; const L = createLake({ root: C.lakeRoot(), gate: (id) => C.lakeGate(id) });
  ok(L.root === join(COPIES, 'lake') && L.fresh('imerg_late_hh').ok && L.fresh('quake_usgs').ok && L.path('gem_active_faults') && existsSync(L.path('gem_active_faults')), '2 · lake.mjs reads the mirror (IMERG, earthquakes, faults)', JSON.stringify({ root: L.root, i: L.fresh('imerg_late_hh'), q: L.fresh('quake_usgs') }));
  ok(L.summary(['imerg_late_hh']).mirror === true, '2 · the lake status names the mirror'); }
{ /* the fleet poll: rows from the copy, no MACH call (fleet.key points at a closed local port: any call would fail) */
  writeFileSync(join(NL, 'fleet.key'), 'base=http://127.0.0.1:9\n');
  const app = { copies: C }; const F = createFleet(app, NL, DATA); await F.poll();
  const s = F.status(); ok(s.copy && s.copy.ok && s.copy.via === 'lamha' && s.copyPolls === 1 && s.errors === 0 && s.usable > 50, '2 · fleet poll from the copy, no own call', JSON.stringify({ copy: s.copy, polls: s.copyPolls, errors: s.errors, usable: s.usable, screened: s.screened }));
  const L = F.latest(); const pw = L.rows.find((r) => r.key === 'PW'), m2 = L.rows.find((r) => r.key === 'mach2');
  ok(pw && pw.status === 'site-problem' && /repeats another station/.test(pw.statusNote) && m2 && m2.status === 'site-problem', 'F2 · registry-excluded keys are site problems, not used', JSON.stringify({ pw: pw && pw.statusNote, m2: m2 && m2.statusNote }));
  const near = F.nearest(24.9185, 67.1902, 3); ok(!near || near.key !== 'PW', 'F2 · an excluded key is never the "observed nearby" station', near && near.key); }
{ const app = { copies: C }; const A = createOpenAq(app, DATA); await A.poll(); const s = A.status();
  ok(s.source === 'lake copy' && s.calls === 0 && s.active === 40 && s.newReadings === 480, '2 · OpenAQ from the lake copy, no API call (no key needed)', JSON.stringify({ src: s.source, calls: s.calls, act: s.active, n: s.newReadings, why: s.copyWhy }));
  const rec = A.recent(); const loc = rec.obs['9000']; const t = loc && Object.values(loc)[0]; ok(t && Math.abs(t.temperature - 30) < 1e-9, '2 · degF from the lake converted as the API path does (86 F -> 30 C)', JSON.stringify(t));
  const arch = readdirSync(join(D, 'NIGRAAN', 'nig', 'station-lake', 'archive', 'aq')); ok(arch.some((f) => /^openaq_\d{4}-\d{2}\.jsonl$/.test(f)), '2 · archived as before', arch.join(','));
  await A.poll(); ok(A.status().newReadings === 0, '2 · a second poll adds nothing already held'); }

/* ── 3 · fallbacks ── */
const reset = () => { chmodSync(LAMHA, 0o755); const rw = (d) => { for (const n of readdirSync(d)) { const q = join(d, n); if (statSync(q).isDirectory()) { chmodSync(q, 0o755); rw(q); } else chmodSync(q, 0o644); } }; rw(LAMHA); chmodSync(join(D, 'DATA LAKE'), 0o755); rw(join(D, 'DATA LAKE')); };
reset();
lamhaMach(45); C = make(); await C.run(); M = await C.mach();
ok(M.ok && M.via === 'lake' && /lamha_mach: .*newest reading 45 min old/.test(M.tried.join(' ')), '3a · LAMHA copy 45 min old -> the lake\'s copy of the same database', JSON.stringify({ via: M.via, tried: M.tried }));
lakeAll(50, 5); C = make(); await C.run(); M = await C.mach();
ok(!M.ok && /lamha_mach/.test(M.why) && /lake_mach_obs/.test(M.why), '3b · both stale -> no copy: the fleet uses its own database call', M.why);
{ const app = { copies: C }; const F = createFleet(app, NL, DATA); await F.poll(); const s = F.status(); ok(s.copy && !s.copy.ok && s.copyPolls === 0 && s.errors > 0, '3b · fleet poll fell back to its own fetch (closed port here)', JSON.stringify({ copy: s.copy && s.copy.ok, errors: s.errors })); }
/* 15 Oct 2026: LAMHA's register dropped all 108 stations while readings were fresh */
const reg = readFileSync(join(FX, 'mach_station_status.csv'), 'utf8').split('\n').map((l, i) => (i < 2 || !l.trim()) ? l : l.replace(/,(active|partial),/, ',dropped,')).join('\n');
lamhaMach(5, null, reg); lakeAll(5, 5); C = make(); await C.run(); M = await C.mach();
ok(M.ok && M.via === 'lake' && /register drops 10\d of 10\d/.test(C.status().datasets.lamha_mach.valid.why.join(' ')), '3c · LAMHA register collapse (15 Oct case) -> LAMHA copy refused', C.status().datasets.lamha_mach.valid.why.join(' '));
lamhaMach(5, (r) => { if (r.temperatureC !== '') r.temperatureC = String(Number(r.temperatureC) * 9 / 5 + 32 + 30); }); C = make(); await C.run();
ok(!C.gate('lamha_mach').ok && /outside physical ranges/.test(C.gate('lamha_mach').why), '3d · a whole feed in the wrong unit -> refused', C.gate('lamha_mach').why);
{ lamhaMach(5); const f = join(LAMHA, 'data', 'mach', 'db', 'obs_' + day(Date.now()) + '.csv'); const t = readFileSync(f, 'utf8').trim().split('\n'); const last = t[t.length - 1].split(','); last[3] = String(Number(last[3]) + 5); writeFileSync(f, t.join('\n') + '\n' + last.join(',') + '\n');
  C = make(); await C.run(); ok(!C.gate('lamha_mach').ok && /two different records/.test(C.gate('lamha_mach').why), '3e · one station and time with two different readings -> refused (damaged file)', C.gate('lamha_mach').why); }
{ const keep = new Set(['mach1', 'mach8', 'E11', 'PW', 'nutech', 'gilgit', 'khaplu', 'danyore', 'Talg', 'G15']); const shift = Date.now() - 5 * 60e3 - machT1; const by = new Map();
  for (const r0 of MACH.rows) { const ms = utcMs(r0.time) + shift; const r = { ...r0, time: iso(ms) }; if (!keep.has(r.stationKey)) continue; const d = day(ms); (by.get(d) || by.set(d, []).get(d)).push(r); }
  for (const [d, rs] of by) writeFileSync(join(LAMHA, 'data', 'mach', 'db', 'obs_' + d + '.csv'), csvOf(MACH.head, rs));
  C = make(); await C.run(); ok(!C.gate('lamha_mach').ok && /below 39/.test(C.gate('lamha_mach').why), '3f · 10 stations reporting (reference 78) -> refused', C.gate('lamha_mach').why); }
lamhaMach(5); lamhaMetar(70); C = make(); await C.run(); T = await C.metar(Date.now() - 30 * 3600e3);
ok(!T.ok && /newest report 7\d min old/.test(T.why), '3g · METAR copy 70 min old -> the IEM request (own fetch)', T.why);
lamhaMetar(10); lamhaEws(10, 75); C = make(); await C.run(); ok(C.ews().ok, '3h · EWS sync stamp late but the readings are fresh: used (the readings decide)');
lamhaEws(90, 90); C = make(); await C.run(); { const g = C.ews(); const app = { copies: C }; const P = createPyJobs(app, NL, DATA); const r = await P.run('ewsAppend');
  ok(!g.ok && /newest reading 9\d min old/.test(g.why) && r && r.started === false && /9\d min/.test(r.skipped || ''), '3h · EWS copy 90 min old -> the append run is skipped (no own fetch for this network)', JSON.stringify({ g, r })); }
lamhaEws(10, 10); lakeAll(5, 200); C = make(); await C.run();
{ const L = createLake({ root: C.lakeRoot(), gate: (id) => C.lakeGate(id) }); const f = L.fresh('aq_openaq');
  ok(!f.ok && /collector last succeeded 200 min ago/.test(f.why) && !(await C.aq(0)).ok, '3i · lake collector stopped (200 min, limit 180) -> OpenAQ back to its own poll', f.why); }
/* the source gone: the copy is kept but stops being used once it is staleMin old */
lakeAll(5, 5); C = make(); await C.run(); ok(C.gate('lamha_mach').ok, '3j · fresh again: used');
{ const t0 = Date.now(); process.env.NIGRAAN_LAMHA_DIR = join(D, 'nowhere'); const C2 = createCopies({}, NL, DATA, { noSchedule: true, now: () => t0 + 31 * 60e3 }); await C2.run();
  const g = C2.gate('lamha_mach'); ok(!g.ok && /source folder not found|last good copy 31 min ago/.test(g.why + ' ' + JSON.stringify(C2.status().datasets.lamha_mach)), '3j · LAMHA folder missing: the old copy stops being used after 30 min', g.why); env(); }
process.env.NIGRAAN_COPY = '0'; { const C3 = make(); const r = await C3.run(); ok(!r.ok && !(await C3.mach()).ok && !C3.ews().ok, '3k · NIGRAAN_COPY=0: own fetches only'); } delete process.env.NIGRAAN_COPY;
process.env.NIGRAAN_LAMHA = '0'; { const C4 = make(); await C4.run(); const m = await C4.mach(); ok(m.ok && m.via === 'lake', '3l · NIGRAAN_LAMHA=0: the lake copy still serves MACH', m.via); } delete process.env.NIGRAAN_LAMHA;

/* ── 3m · forecast rows never make a copy fresh: station readings 45 min old, the provider's forecast rows (source qm) 5 min old ── */
{ lamhaMach(45); const f = join(LAMHA, 'data', 'mach', 'db', 'obs_' + day(Date.now()) + '.csv'); const t = iso(Date.now() - 5 * 60e3);
  writeFileSync(f, readFileSync(f, 'utf8') + ['mach1', 'E11', 'nutech', 'G15', 'PW', 'h12', 'adyala'].map((k) => k + ',' + t + ',qm,24.0,18.0,70.0,90.0,5.0,8.0,1008.0,0.0,0.0,0.0,0.0').join('\n') + '\n');
  C = make(); await C.run(); const g = C.gate('lamha_mach'); ok(!g.ok && /newest reading 4\d min old/.test(g.why), '3m · forecast rows (qm) fresh, station readings 45 min old -> refused', g.why); }
/* ── 3n · a copy-only table with a missing column fails alone; the served datasets are not affected ── */
{ lamhaMach(5); lamhaMeta('stationId,stationName,altitude\n955200,Gulkin_ARG_1,\n'); C = make(); await C.run(); const st = C.status().datasets;
  ok(!st.lamha_pmd.gate.ok && /lacks column\(s\) latitude, longitude/.test(st.lamha_pmd.gate.why) && st.lamha_mach.gate.ok, '3n · catalogue without coordinates -> that table refused, MACH copy still used', st.lamha_pmd.gate.why); lamhaMeta(); }

/* ── 4 · the rolling reference replaces the seed after minHistory passing checks ── */
{ const t0 = Date.now(); let k = 0; const C5 = createCopies({}, NL, DATA, { noSchedule: true, now: () => t0 + k * 1000 }); const f = join(LAMHA, 'data', 'mach', 'db', 'obs_' + day(Date.now()) + '.csv');
  for (k = 0; k < 37; k++) { utimesSync(f, new Date(), new Date(t0 - 60e3 + k * 1000)); await C5.run(); }   /* a new LAMHA write each time: the checks run again only on a change */
  const r = C5.status().datasets.lamha_mach.reference; ok(/rolling median of \d+ passing checks/.test(r.from) && r.ref >= 71, '4 · reference = rolling median once 36 checks passed', JSON.stringify(r)); }

/* ── 5 · the lake root is found again once the mirror lands (first copy run after start) ── */
{ const C6dir = join(D, 'copies6'); process.env.NIGRAAN_COPIES_DIR = C6dir; const C6 = make(); const L = createLake({ root: C6.lakeRoot(), gate: (id) => C6.lakeGate(id) });
  const before = L.root; await C6.run(); const after = L.root; delete process.env.NIGRAAN_COPIES_DIR;
  ok(before !== join(C6dir, 'lake'), '5 · before the first copy the mirror is not the root', before); ok(after === before || after === join(C6dir, 'lake'), '5 · root re-checked at most once a minute (no stale cache error)', after); }

/* ── 6 · the real 15 Oct 2026 case (fixtures: LAMHA's database rows 14:30-15:32 UTC and its sync log): the laptop's network failed
   at 15:23 UTC, the sync resumed at 15:32 and then stopped until 22:03. The copy is used while its newest reading is within 30 min
   and refused later in the gap, so the fleet makes its own database call. */
{ process.env.NIGRAAN_DATALAKE = '0'; const db = join(LAMHA, 'data', 'mach', 'db');
  copyFileSync(join(FX, 'mach_obs_15oct_gap.csv'), join(db, 'obs_20261015.csv')); w(join(db, 'last_sync.txt'), '2026-10-15T15:32:18Z\n'); copyFileSync(join(FX, 'sync_log_15oct.txt'), join(db, 'sync_log.txt'));
  w(join(LAMHA, 'data', 'mach', 'clean', 'mach_station_status.csv'), readFileSync(join(FX, 'mach_station_status.csv')));
  const at = (isoT) => { const t = Date.parse(isoT); return createCopies({}, NL, DATA, { noSchedule: true, now: () => t }); };
  const C1 = at('2026-10-15T15:45:00Z'); await C1.run(); const m1 = await C1.mach(); const v1c = C1.status().datasets.lamha_mach.valid.checks;
  ok(m1.ok && m1.via === 'lamha' && m1.stations.size >= 80 && v1c.stations.n >= 60, '6 · 15 Oct 15:45 UTC (13 min after the last sync): the copy serves', JSON.stringify({ ok: m1.ok, n: m1.stations && m1.stations.size, st: v1c.stations, age: m1.ageMin }));
  ok(v1c.syncLog && /15:32:18Z fetched 2320/.test(v1c.syncLog.last) && v1c.syncLog.error === false, '6 · LAMHA\'s sync log: last line reported', JSON.stringify(v1c.syncLog));
  const C2 = at('2026-10-15T21:00:00Z'); await C2.run(); const m2 = await C2.mach();
  ok(!m2.ok && /lamha_mach: (newest (reading|record now) 3\d\d min old|last good copy)/.test(m2.why), '6 · 15 Oct 21:00 UTC (5.5 h into the gap): refused -> the fleet\'s own database call', m2.why);
  writeFileSync(join(db, 'sync_log.txt'), readFileSync(join(FX, 'sync_log_15oct.txt'), 'utf8').split('\n').slice(0, -2).join('\n') + '\n');
  const C3 = at('2026-10-15T15:30:00Z'); await C3.run(); const s3 = C3.status().datasets.lamha_mach.valid.checks.syncLog;
  ok(s3 && s3.error === true && /URLError/.test(s3.last), '6 · a network error as LAMHA\'s last log line is flagged (it explains a stale copy; it fails nothing by itself)', JSON.stringify(s3));
  delete process.env.NIGRAAN_DATALAKE; }

/* ── 7 · SAME SERVED VALUES: the fleet poll fed by the copy and the fleet poll fed by its own database call give the same served rows
   when both hold the same readings. The own call goes to a local stand-in of the database's /v1/latest that answers, per station, the
   newest reading of the copied day files (the database's metric values, its compass wind text and the station's provider). ── */
{ const { createServer } = await import('node:http');
  lamhaMach(5); lakeAll(5, 5); C = make(); await C.run(); const M7 = await C.mach(); ok(M7.ok, '7 · copy valid', M7.why);
  const PTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const body = JSON.stringify({ updatedAt: iso(Date.now()), stations: [...M7.stations].map(([key, s]) => ({ key, time: s.time, provider: s.provider,
    metrics: { temperatureC: s.temperatureC, humidityPct: s.humidityPct, dewPointC: s.dewPointC, windSpeedKmh: s.windSpeedKmh, windGustKmh: s.windGustKmh, pressureHpa: s.pressureHpa, precipRateMmHr: s.precipRateMmHr,
      precipTotalMm: s.precipTotalMm, uvIndex: s.uvIndex, solarWm2: s.solarWm2, windDirectionText: s.windDirectionDeg == null ? null : PTS[Math.floor(s.windDirectionDeg / 22.5 + 0.5) % 16] } }))
    /* a station with no reading in the copied day files: the database's last time for it, and no values (the copy holds none) */
    .concat([...M7.lastSeen].filter(([k]) => !M7.stations.has(k)).map(([key, x]) => ({ key, time: x.time, provider: x.provider, metrics: {} }))) });
  let calls = 0; const srv = createServer((req, res) => { calls++; if (req.url.startsWith('/v1/latest')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(body); } else { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const A = join(D, 'eqA'), B = join(D, 'eqB');   /* two nigraan-local folders with the same data, so neither poll's archive write touches the other */
  for (const r of [A, B]) { mkdirSync(join(r, 'nigraan-local', 'data'), { recursive: true }); for (const f of ['mach-fleet-stations.json', 'mach-siting.json', 'mach-running-bias.json']) if (existsSync(join(ROOT, 'data', f))) copyFileSync(join(ROOT, 'data', f), join(r, 'nigraan-local', 'data', f));
    writeFileSync(join(r, 'nigraan-local', 'obs.key'), 'base=http://127.0.0.1:' + port + '\nkey=fixture-not-a-secret\n'); }
  const Fc = createFleet({ copies: C }, join(A, 'nigraan-local'), join(A, 'nigraan-local', 'data')), Fd = createFleet({ copies: null }, join(B, 'nigraan-local'), join(B, 'nigraan-local', 'data'));
  await Fc.poll(); const c0 = calls; await Fd.poll(); const sc = Fc.status(), sd = Fd.status();
  ok(sc.copyPolls === 1 && c0 === 0 && sd.copyPolls === 0 && calls === 1 && sd.db.ok, '7 · one poll from the copy (no call), one from the database stand-in (one call)', JSON.stringify({ c0, calls, copy: sc.copyPolls, db: sd.db.ok }));
  /* ageMin is the minute the poll ran; 'why' (an operator note, not a served value) names the copy on the copy path */
  const strip = (rows) => rows.map((r) => { const o = { ...r }; delete o.ageMin; delete o.why; return o; });
  const la = strip(Fc.latest().rows), lb = strip(Fd.latest().rows); const diff0 = la.filter((r, i) => JSON.stringify(r) !== JSON.stringify(lb[i]));
  /* v91.17.278 · FIX278 5 · the outdoor-array screen judges a station's run of readings. The copy holds 4 h of them, the database stand-in
     answers the newest reading only, so a station whose copied hours hold a daylight array-silent run is held out on the copy path alone
     (in service the database path builds the same state over its polls). Those stations are named from the copied rows themselves. */
  const { arraySilent } = await import('../../server/api/stuckscreen.mjs'); const REGP = new Map(JSON.parse(readFileSync(join(ROOT, 'data', 'mach-fleet-stations.json'), 'utf8')).stations.map((x) => [x.key, x]));
  const dbd = join(LAMHA, 'data', 'mach', 'db'), byK = new Map();
  for (const f of readdirSync(dbd).filter((x) => /^obs_\d{8}\.csv$/.test(x))) { const L = readFileSync(join(dbd, f), 'utf8').split(/\r?\n/); const h = L[0].split(','); const ix = (n) => h.indexOf(n);
    for (let i = 1; i < L.length; i++) { const c = L[i].split(','); if (c.length !== h.length || c[ix('source')] === 'qm') continue; const k = c[ix('stationKey')], st = REGP.get(k); if (!st) continue; const n = (j) => (c[j] === '' ? null : Number(c[j]));
      (byK.get(k) || byK.set(k, []).get(k)).push({ ms: Date.parse(c[ix('time')]), S: n(ix('solarWm2')), W: n(ix('windSpeedKmh')), G: n(ix('windGustKmh')), lat: st.lat, lon: st.lon }); } }
  const arrK = new Set([...byK].filter(([, l]) => { l.sort((x, y) => x.ms - y.ms); const v = arraySilent(l); return v.length && v[v.length - 1]; }).map(([k]) => k));
  const arrD = diff0.filter((r) => arrK.has(r.key) && (r.qc || []).includes('stuck-value') && !(lb[la.indexOf(r)].qc || []).includes('stuck-value')), diff = diff0.filter((r) => !arrD.includes(r));
  if (arrD.length) console.log('   held out on the copy path only (array silent in the copied hours): ' + arrD.map((r) => r.key).join(', '));
  const whyOnly = Fc.latest().rows.filter((r, i) => r.why !== Fd.latest().rows[i].why); ok(whyOnly.every((r) => r.status === 'silent' && r.tempC == null), '7 · the operator note differs only on silent stations (' + whyOnly.length + '), which serve nothing', JSON.stringify(whyOnly.slice(0, 1)));
  if (diff.length) console.log('  diff', JSON.stringify(diff[0]), JSON.stringify(lb[la.indexOf(diff[0])]));
  const scr = (x, d) => { const o = { ...x }; if (d) { o.stuckValue = (o.stuckValue || 0) - d; if (!o.stuckValue) delete o.stuckValue; } return JSON.stringify(o); };
  ok(la.length === 108 && !diff.length && sc.usable + arrD.length === sd.usable && scr(sc.screened, arrD.length) === scr(sd.screened, 0), '7 · every served fleet row identical (values, provider, QC, screen verdict, status) and the same screen counts' + (arrD.length ? ' (apart from ' + arrD.length + ' station(s) the copy holds out as array-silent from its copied hours)' : ''), JSON.stringify({ n: la.length, diff: diff.slice(0, 2), usable: [sc.usable, sd.usable] }));
  const ages = Fc.latest().rows.map((r, i) => Math.abs((r.ageMin ?? 0) - (Fd.latest().rows[i].ageMin ?? 0))); ok(Math.max(...ages) <= 1, '7 · ages agree (to the minute the two polls straddle)', Math.max(...ages));
  const pts = Fc.latest().rows.filter((r) => r.lat != null).map((r) => [r.lat + 0.01, r.lon - 0.01]); const pick7 = (x) => x && JSON.stringify([x.key, x.tempC, x.rhPct, x.dewC, x.lastUpdated, x.km, x.trusted]);
  const nd = pts.filter(([la2, lo2]) => pick7(Fc.nearest(la2, lo2, 25)) !== pick7(Fd.nearest(la2, lo2, 25)));
  ok(!nd.length, '7 · the "observed nearby" station is the same at ' + pts.length + ' places', JSON.stringify(nd.slice(0, 2)));
  const sa = JSON.stringify(Fc.statusAll().map((r) => ({ ...r, silentSince: r.silentSince }))), sb = JSON.stringify(Fd.statusAll()); ok(sa === sb, '7 · the stations table (every registered station with its status) identical');
  const arch = (r) => { const f = readdirSync(join(r, 'station-lake', 'archive', 'fleet')).filter((x) => /^fleet_obs_\d/.test(x))[0]; return readFileSync(join(r, 'station-lake', 'archive', 'fleet', f), 'utf8').split('\n').slice(1).map((l) => l.split(',').slice(1).join(',')).sort().join('\n'); };
  const archX = (r) => arch(r).split('\n').filter((l) => !arrD.some((x) => l.startsWith(x.key + ','))).join('\n');
  ok(archX(A) === archX(B) && arch(A).length > 1000 && arch(A).split('\n').every((l) => !arrD.some((x) => l.startsWith(x.key + ','))), '7 · the observation archive lines are identical (poll time aside; a station held out as array-silent is not archived as usable)');
  srv.close(); }

/* clean up the temporary tree */
reset(); try { rmSync(D, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
