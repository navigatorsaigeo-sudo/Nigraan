// v91.17.283.49 · NIGRAAN 1.0.10 · the WHOLE-RECORD FROZEN check (server/api/obsqc.mjs recordFrozen, data/obs-qc-params.json record_frozen)
// 1 unit: the run rule (identical T / Td / RH / P, distinct timestamps, gap split, complete records only, only readings past the limit)
// 2 the limit in force is the measured one (record_frozen.max_min = the largest 99.9th percentile of its windows)
// 3 the REAL live poll (fleet.mjs createFleet -> stuckLive -> obsqc seriesCheck) replayed over the whole of 2 Nov 2026 14:57-23:57 PKT on
//   the real MACH database day (data/obs_20261102.csv = NIGRAAN's own nig\own\data\mach\db\obs_20261102.csv, every station), with and
//   without the check: no clean console (wu_api, qm, clean ecowitt) is ever flagged 'record-frozen'; the frozen 'wu' feeds are withheld
//   earlier; usable temperature counts per poll before / after are printed (BUILD_NOTES_113.md).
// usage: node scripts/tests28349rec/record113.test.mjs      exit 0 all pass, 1 a failure
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), APP = join(HERE, '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const QC = await import(pathToFileURL(join(APP, 'server/api/obsqc.mjs')).href);
const PAR = JSON.parse(readFileSync(join(APP, 'data', 'obs-qc-params.json'), 'utf8')); const RF = PAR.record_frozen;

/* 1 unit */
{ const Q = { max_min: 50, maxgap_min: 90 }; const t0 = Date.parse('2026-11-02T12:00:00Z');
  const mk = (n, f = () => ({})) => Array.from({ length: n }, (_, i) => ({ ms: t0 + i * 600e3, T: 25, Td: 15, RH: 54, P: 1012.3, ...f(i) }));
  let r = mk(8); QC.recordFrozen(r, Q); const fl = r.map((x) => !!(x.f && x.f.T && x.f.T.test === 'record-frozen'));
  ok(fl.join() === [false, false, false, false, false, false, true, true].join() && r[7].f.P && r[7].f.RH && r[7].f.Td, '1a an identical record: readings past 50 min (60, 70 min) fail all four values, earlier ones stay', fl.join());
  r = mk(8, (i) => (i === 4 ? { T: 25.1 } : {})); QC.recordFrozen(r, Q); ok(!r.some((x) => x.f), '1b one value changes at 40 min: the run restarts, nothing fails');
  r = mk(8, (i) => ({ P: null })); QC.recordFrozen(r, Q); ok(!r.some((x) => x.f), '1c pressure not reported: the record is not complete, not judged (the measured population had all four)');
  r = mk(8, (i) => ({ ms: t0 + i * 600e3 + (i >= 4 ? 100 * 6e4 : 0) })); QC.recordFrozen(r, Q); ok(!r.some((x) => x.f), '1d a gap over 90 min splits the run');
  r = mk(8); QC.recordFrozen(r, null); ok(!r.some((x) => x.f), '1e no record_frozen block: no check (1.0.9 behaviour)');
  r = mk(12, (i) => (i % 2 ? { T: 25.1 } : {})); QC.recordFrozen(r, Q); ok(!r.some((x) => x.f), '1f alternating values never form a run'); }

/* 2 the limit is the measured one */
{ const q = RF && RF.windows ? Object.values(RF.windows).flatMap((w) => [w.all_q999_min, w.evening_night_q999_min]).filter(Number.isFinite) : [];
  ok(!!RF && q.length >= 6 && RF.max_min === Math.max(...q) && RF.max_min >= 30 && RF.max_min <= 60, '2 record_frozen.max_min ' + (RF && RF.max_min) + ' min = the largest measured 99.9th percentile of ' + q.length + ' window figures', q.join(', '));
  ok(!!RF && /derive_record_frozen\.py/.test(RF.source || '') && Array.isArray(RF.leftOut), '2b the source and the left-out stations are recorded'); }

/* 3 replay of the real poll over 2 Nov evening, all stations */
const TXT = readFileSync(join(HERE, 'data', 'obs_20261102.csv'), 'utf8');
const L = TXT.split(/\r?\n/).filter(Boolean), H = L[0].split(','); const ix = (c) => H.indexOf(c);
const num = (x) => (x === '' || x == null || !Number.isFinite(+x) ? null : +x);
const BY = new Map(), SRC = new Map();
for (const l of L.slice(1)) { const c = l.split(','); const r = { key: c[ix('stationKey')], ms: Date.parse(c[ix('time')]), time: c[ix('time')], src: c[ix('source')], T: num(c[ix('temperatureC')]), Td: num(c[ix('dewPointC')]), RH: num(c[ix('humidityPct')]), P: num(c[ix('pressureHpa')]), S: num(c[ix('solarWm2')]), W: num(c[ix('windSpeedKmh')]), G: num(c[ix('windGustKmh')]) };
  (BY.get(r.key) || BY.set(r.key, []).get(r.key)).push(r); SRC.set(r.key, r.src); }
for (const a of BY.values()) a.sort((x, y) => x.ms - y.ms);
const LEFT = new Set((RF && RF.leftOut) || []);
const clean = (k) => SRC.get(k) === 'wu_api' || SRC.get(k) === 'qm' || (SRC.get(k) === 'ecowitt' && !LEFT.has(k));
let NOW = Date.parse('2026-11-02T09:57:00Z'); const realNow = Date.now; Date.now = () => NOW;
const srv = createServer((req, res) => {
  if (!req.url.startsWith('/v1/latest')) { res.writeHead(404); res.end('{}'); return; }
  const st = []; for (const [k, a] of BY) { let r = null; for (let i = a.length - 1; i >= 0; i--) if (a[i].ms <= NOW) { r = a[i]; break; } if (!r) continue;
    st.push({ key: k, time: r.time, provider: r.src, metrics: { temperatureC: r.T, dewPointC: r.Td, humidityPct: r.RH, pressureHpa: r.P, solarWm2: r.S, windSpeedKmh: r.W, windGustKmh: r.G } }); }
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ updatedAt: new Date(NOW).toISOString(), stations: st })); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
async function replay(withCheck, untilIso) {
  const T = mkdtempSync(join(tmpdir(), 'rec113-')), RT = join(T, 'nigraan-local'), D = join(RT, 'data'), OWN = join(T, 'own', 'data', 'mach', 'db');
  mkdirSync(D, { recursive: true }); mkdirSync(OWN, { recursive: true });
  for (const f of ['mach-fleet-stations.json', 'mach-siting.json', 'obs-qc-marks.json', 'fleet-range-screen.json', 'station-shield-rule.json', 'mach-rain-holds.json']) { try { copyFileSync(join(APP, 'data', f), join(D, f)); } catch (_) {} }
  const P2 = JSON.parse(JSON.stringify(PAR)); if (!withCheck) delete P2.record_frozen; writeFileSync(join(D, 'obs-qc-params.json'), JSON.stringify(P2));
  writeFileSync(join(OWN, 'obs_20261102.csv'), TXT);
  writeFileSync(join(RT, 'obs.key'), 'base=http://127.0.0.1:' + port + '\nkey=TEST-NOT-A-KEY\n');
  process.env.NIGRAAN_FLEET = '0'; delete process.env.NIGRAAN_FLEET_SEED; delete process.env.NIGRAAN_OWN_DIR;
  const { createFleet } = await import(pathToFileURL(join(APP, 'server/api/fleet.mjs')).href + '?w=' + withCheck);
  NOW = Date.parse('2026-11-02T09:57:00Z'); const FL = createFleet({}, RT, D); delete process.env.NIGRAAN_FLEET;
  const out = new Map(); const end = Date.parse(untilIso);
  for (NOW = Date.parse('2026-11-02T09:57:00Z') + 6e5; NOW <= end; NOW += 6e5) {
    await FL.poll(); const pkt = new Date(NOW + 5 * 3600e3).toISOString().slice(11, 16);
    const rows = (FL.latest({}).rows || []).filter((r) => BY.has(r.key)); out.set(pkt, { rows, screened: FL.status().screened, usable: FL.status().usable }); }
  try { rmSync(T, { recursive: true, force: true }); } catch (_) {}
  return out;
}
const before = await replay(false, '2026-11-02T18:57:00Z');
const after = await replay(true, '2026-11-02T18:57:00Z');
const rec = (p) => (p.screened && p.screened.values && p.screened.values['T:record-frozen']) || 0;
const fresh = (p) => p.rows.filter((r) => r.lastUpdated && NOWOF(p) - Date.parse(r.lastUpdated) <= 3 * 3600e3);
let NOWP = null; const NOWOF = () => NOWP;
const tOk = (p) => p.rows.filter((r) => r.tempC != null).length;
/* which stations lose their temperature to the new check at any poll */
const lost = new Map();
for (const [pkt, a] of after) { const b = before.get(pkt); const A = new Set(a.rows.filter((r) => r.tempC == null).map((r) => r.key)); const B = new Set(b.rows.filter((r) => r.tempC == null).map((r) => r.key));
  for (const k of A) if (!B.has(k)) { if (!lost.has(k)) lost.set(k, []); lost.get(k).push(pkt); } }
const lostClean = [...lost.keys()].filter(clean);
ok(after.size >= 50 && !lostClean.length, '3a over 54 polls 15:07-23:57 PKT no clean console (wu_api, qm, clean ecowitt) loses its temperature to the new check', lostClean.map((k) => k + ' ' + SRC.get(k) + ' ' + lost.get(k).slice(0, 3).join(' ')).join('; ') || ([...SRC.keys()].filter(clean).length + ' clean consoles in the file'));
const bySrc = {}; for (const k of lost.keys()) bySrc[SRC.get(k)] = (bySrc[SRC.get(k)] || 0) + 1;
ok(Object.keys(bySrc).every((s) => s === 'wu' || s === 'ecowitt') && (bySrc.wu || 0) >= 10, '3b the stations withheld earlier are the frozen wu feeds (and ecowitt feeds outside the clean population)', JSON.stringify(bySrc) + ' · ' + [...lost.keys()].filter((k) => SRC.get(k) === 'ecowitt').join(', '));
/* every station withheld by the new check carried an identical complete record over the limit at that poll */
let badWhy = []; for (const [k, pk] of lost) { const p = pk[0]; const cut = Date.parse('2026-11-02T' + p + ':00Z') - 5 * 3600e3; const a = BY.get(k).filter((r) => r.ms <= cut); const s = (r) => [r.T, r.Td, r.RH, r.P].join('|'); let j = a.length - 1; while (j > 0 && s(a[j - 1]) === s(a[a.length - 1]) && a[j].ms - a[j - 1].ms <= 90 * 6e4) j--; const run = (a[a.length - 1].ms - a[j].ms) / 6e4; if (!(run > RF.max_min)) badWhy.push(k + ' ' + run); }
ok(!badWhy.length, '3c each station the new check withholds carried one identical T / Td / RH / P record for longer than ' + RF.max_min + ' min at that poll', badWhy.join(', '));
const firstOut = (R, k) => { for (const [p, v] of R) if (v.rows.some((r) => r.key === k && r.tempC == null)) return p; return null; };
const gain = [...lost.keys()].filter((k) => SRC.get(k) === 'wu').map((k) => { const a = firstOut(after, k), b = firstOut(before, k); const m = (x) => x ? +x.slice(0, 2) * 60 + +x.slice(3) : null; return b && a ? m(b) - m(a) : null; }).filter((x) => x != null);
ok(gain.length >= 5 && Math.min(...gain) >= 0, '3d frozen wu feeds withheld earlier: median ' + (gain.length ? gain.sort((x, y) => x - y)[gain.length >> 1] : '-') + ' min sooner (range ' + Math.min(...gain) + '..' + Math.max(...gain) + ')');
console.log('usable temperatures (rows with a temperature, of ' + after.get('18:37').rows.length + ' stations in the file and the registry), before -> after the check:');
console.log('  ' + [...after.keys()].filter((p) => /:[0-5]7$/.test(p) && (+p.slice(3, 5) === 7 || +p.slice(3, 5) === 37)).map((p) => p + ' ' + tOk(before.get(p)) + '->' + tOk(after.get(p)) + ' (rec ' + rec(after.get(p)) + ')').join(' | '));
Date.now = realNow; srv.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
