/* v91.17.283.45 (NIGRAAN 1.0.8) · the dew-point anchor (ews-anchor-td@1, RULES_EWSFULL_RETRAIN B: PASS) runs as a SHADOW: computed and archived
   every hour, never served. usage: node scripts/tests28345/tdshadow45.test.mjs */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { gzipSync, gunzipSync } from 'node:zlib'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
const EA = await import(pathToFileURL(join(API, 'ewsshadow.mjs')).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const H = 3600e3; delete process.env.NIGRAAN_EWS_THS; delete process.env.NIGRAAN_EWS_TD_SHADOW;
const T = mkdtempSync(join(tmpdir(), 'v45td-')); const DATA = join(T, 'data'), COP = join(T, 'copies'); mkdirSync(DATA, { recursive: true });
for (const f of ['ews-live-anchor.json', 'ews-live-anchor-td.json', 'obs-qc-params.json']) copyFileSync(join(ROOT, 'data', f), join(DATA, f));
writeFileSync(join(DATA, 'mach-fleet-stations.json'), JSON.stringify({ stations: [] })); writeFileSync(join(DATA, 'synop-stations.json'), JSON.stringify({ stations: {} }));
const NOW = Math.floor(Date.now() / H) * H + 20 * 60e3;
const ST = [{ id: '1', name: 'A_AWS', lat: 35.95, lon: 74.40, el: 2400, T: 'Air Temperature', R: 'Relative Humidity' }, { id: '2', name: 'B_AWS-H', lat: 36.05, lon: 74.30, el: 2900, T: 'Air Temperature THS', R: 'Relative Humidity THS' },
  { id: '3', name: 'C_AWS', lat: 35.85, lon: 74.55, el: 3300, T: 'Air Temperature', R: 'Relative Humidity' }];
const place = (lat, lon) => { const s = ST.find((x) => Math.abs(x.lat - lat) < 1e-6 && Math.abs(x.lon - lon) < 1e-6); return { uid: 'GB|Gilgit|Gilgit', elevM: s ? s.el : 2000 }; };
mkdirSync(join(COP, 'data', 'pmd', 'ews_live', 'raw'), { recursive: true });
writeFileSync(join(COP, 'data', 'pmd', 'aegis_gb_station_catalog.csv'), 'stationId,stationName,n_elements,latitude,longitude,altitude\n' + ST.map((s) => [s.id, s.name, 6, s.lat, s.lon, ''].join(',')).join('\n') + '\n');
writeFileSync(join(COP, 'data', 'pmd', 'ews_live', 'aegis_elements.csv'), 'element_id,station_id,station,element,unit\n' + ST.map((s, i) => [i * 3 + 1, s.id, s.name, s.T, 'C'].join(',') + '\n' + [i * 3 + 2, s.id, s.name, s.R, '%'].join(',')).join('\n') + '\n3,2,B_AWS-H,Air Temperature Hukseflux,C\n');
const sp = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' '); const by = new Map();
for (let ms = NOW - 30 * H; ms <= NOW; ms += 10 * 60e3) for (const s of ST) { const d = new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''); const L = by.get(d) || by.set(d, []).get(d);
  const t = 8 + 0.5 * Math.sin(ms / 4e6) + Number(s.id) * 0.01; L.push([t.toFixed(2), sp(ms), 1, s.id, s.name, s.T, 'C'].join(',')); L.push(['60.0', sp(ms), 2, s.id, s.name, s.R, '%'].join(','));
  if (s.id === '2') L.push([(t + 6).toFixed(2), sp(ms), 3, s.id, s.name, 'Air Temperature Hukseflux', 'C'].join(',')); }
for (const [d, L] of by) writeFileSync(join(COP, 'data', 'pmd', 'ews_live', 'raw', 'ews_raw_' + d + '.csv.gz'), gzipSync('value,time_utc,element_id,station_id,station,element,unit\n' + L.join('\n') + '\n'));
const base = Math.floor(NOW / H) * H - 40 * H; const time = [], TT = [], RH = []; for (let k = 0; k < 112; k++) { time.push(new Date(base + k * H).toISOString().slice(0, 16) + ':00Z'); TT.push(10); RH.push(50); }
const STORE = { runs: [{ run_id: 'R1', unit_level: 'tehsil', status: 'complete', base_valid_time: new Date(base).toISOString(), completed_at: new Date(base + 600e3).toISOString() }],
  records: [{ runId: 'R1', unitKey: 'GB|Gilgit|Gilgit', lat: 35.92, lon: 74.31, resolvedElevationM: 2000, temperatureBasis: { elevM: 2000 }, hourly: { time, temperature_2m: TT.slice(), relative_humidity_2m: RH.slice() } }] };
const store = { all: (c) => STORE[c], filter: (c, fn) => STORE[c].filter(fn) }; const app = { store, dataDir: DATA };
const mk = () => EA.createEwsAnchor(app, DATA, { copiesDir: COP, archiveDir: join(DATA, 'archive', 'ewsanchor'), tdArchiveDir: join(DATA, 'archive', 'ewsanchor-td'), now: () => NOW, timers: false, place });
const magnus = (t, rh) => { const g = Math.log(rh / 100) + 17.67 * t / (t + 243.5); return 243.5 * g / (17.67 - g); };
const before = JSON.stringify(STORE); const X = mk(); const c = X.computeTd(NOW);
const b = c.rows.find((r) => r.id === '2');
ok(c.rows.length === 3 && b && Math.abs(b.served - magnus(10, 50)) < 1e-9, 'Td residuals at all 3 stations; served basis Td from the served run T and RH (Magnus 17.67/243.5)', JSON.stringify({ n: c.rows.length, why: c.why }));
ok(b && b.obs < 8 + 0.6 - 3 && Math.abs(b.obs - magnus(8.02 + 0 , 60)) < 0.6, 'the THS-only mast is read on its THS channels, never on the Hukseflux radiometer channel (switch NIGRAAN_EWS_THS untouched)', JSON.stringify(b));
ok(Object.keys(c.u).length === 1 && Number.isFinite(c.u['GB|Gilgit|Gilgit'][0]), 'the kriged dew-point anchor at the tehsil point (tested variogram, a_km -> range 3 a_km)', JSON.stringify(c.u));
const e1 = X.compute(NOW); ok(!e1.rows.some((r) => r.id === '2'), 'E1 temperature shadow unchanged: still Air Temperature only (THS switch off)', JSON.stringify(e1.rows.map((r) => r.id)));
const t1 = await X.tick(); const dir = join(DATA, 'archive', 'ewsanchor-td'); const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^ewstd_/.test(f)) : [];
const line = files.length ? JSON.parse(gunzipSync(readFileSync(join(dir, files[0]))).toString().trim()) : null;
ok(t1.ok && files.length === 1 && line && line.shadow === true && line.served === false && line.r.length === 3, 'one archived member per hour (data/archive/ewsanchor-td), marked shadow / not served', JSON.stringify({ files, line: line && line.n }));
ok(JSON.stringify(STORE) === before, 'the run records are byte-identical after the hour (nothing served changes)');
const loc = { hourly: { time: time.slice(), temperature_2m: TT.slice(), dew_point_2m: TT.map(() => 0) }, current: { temperature_2m: 10, dew_point_2m: 0 } }; const L0 = JSON.stringify(loc);
ok(X.serve(loc, 35.92, 74.31, NOW) === false && JSON.stringify(loc) === L0, 'serve() leaves a point answer untouched (no dew-point serving path exists)');
const S = X.status(); ok(S.tdShadow && S.tdShadow.on === true && /never served/.test(S.tdShadow.rule), 'operator status names the shadow and its rule');
const F = JSON.parse(readFileSync(join(ROOT, 'data', 'ews-live-anchor-td.json'), 'utf8')); ok(F.live === false && F.shadow === true && F.heldOut.gates.PASS === true, 'the model file: live false, shadow true, gates PASS as tested');
{ const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); const readers = readdirSync(API).filter((f) => /\.mjs$/.test(f) && f !== 'ewsshadow.mjs').filter((f) => /ews-live-anchor-td|ewsanchor-td|computeTd|tickTd/.test(strip(readFileSync(join(API, f), 'utf8'))));
  ok(readers.length === 0, 'no other server module reads the dew-point file or its archive', readers.join(',')); }
process.env.NIGRAAN_EWS_TD_SHADOW = '0'; const D2 = mkdtempSync(join(tmpdir(), 'v45td2-')); const Y = EA.createEwsAnchor(app, DATA, { copiesDir: COP, archiveDir: join(D2, 'a'), tdArchiveDir: join(D2, 'td'), now: () => NOW, timers: false, place });
await Y.tick(); ok(!existsSync(join(D2, 'td')) && existsSync(join(D2, 'a')), 'NIGRAAN_EWS_TD_SHADOW=0: no dew-point archive, the E1 line still written'); delete process.env.NIGRAAN_EWS_TD_SHADOW;
console.log('tdshadow45: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
