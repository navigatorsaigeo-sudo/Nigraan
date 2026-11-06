/* v91.17.283.30 · the EPD district-history gap fill (server/api/epdaq.mjs pollHistory), against a mock of the public page on 127.0.0.1:
   the district list is read from the page's dropdown (not hard-coded), each district is asked with the page's CSRF token, the session
   cookie and X-Requested-With, rows are stored once (a second run adds none), kept apart from the station file, labelled district_mean,
   the 20-h gate holds, a refused district is listed and the others still stored; the daily record reader skips partial rows.
   node scripts/tests28330/epdhist.unit.test.mjs */
import http from 'node:http'; import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { tmpdir } from 'node:os'; import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const APP = join(HERE, '..', '..');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 300))); if (!c) f++; };
const seen = [];
const page = '<html><head><meta name="csrf-token" content="TOK123"></head><body><label for="historical-district-dropdown">x</label><select id="historical-district-dropdown"><option value="Lahore">Lahore</option><option value="Multan">Multan</option><option value="Kot Addu">Kot Addu</option></select><select id="other"><option value="Nope">n</option></select></body></html>';
const hrs = (base) => [[0, 1].map((h) => ({ aqi: base + h, pm25: 100 + h, pm10: 200, no2: 1, so2: 2, co: 3, o3: 4, temperature: 20, humidity: 50, wind_speed: 1, wind_direction: 90, datetime: `2026-10-26T0${h}:00:00.000000Z`, station_count: 3, station_names: ['A', 'B', 'C'], aqi_range: { range: 'x' } })), [{ aqi: base + 5, datetime: '2026-10-27T05:00:00.000000Z', station_count: 2, station_names: ['A', 'B'] }]];
const srv = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': ['XSRF-TOKEN=abc; path=/', 'aqi_session=sess1; path=/; httponly'] }); return res.end(page); }
  if (req.method === 'POST' && req.url === '/api/historical-aqi-data') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const d = JSON.parse(b).district_name; seen.push({ d, tok: req.headers['x-csrf-token'], xr: req.headers['x-requested-with'], cookie: req.headers.cookie || '' });
    if (d === 'Kot Addu') { res.writeHead(500); return res.end('err'); }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, data: { station_name: d + ' District', organized_data: hrs(d === 'Lahore' ? 300 : 150) } })); }); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const T = mkdtempSync(join(tmpdir(), 'epdh30_')); const dataDir = join(T, 'nig', 'nigraan-local', 'data'); mkdirSync(dataDir, { recursive: true });
const lake = join(T, 'nig', 'station-lake', 'archive', 'epd');
process.env.NIGRAAN_EPD_BASE = 'http://127.0.0.1:' + port; process.env.NIGRAAN_EPD_HIST_PAUSE_MS = '0'; delete process.env.NIGRAAN_EPD;
try {
  const { createEpdAq } = await import(pathToFileURL(join(APP, 'server', 'api', 'epdaq.mjs')).href);
  const E = createEpdAq({}, dataDir);
  const H = await E.pollHistory({ force: true });
  ok(H.districts === 3, 'the district list is read from the page dropdown (3), not another select', H.districts);
  ok(seen.length === 3 && seen.every((s) => s.tok === 'TOK123' && s.xr === 'XMLHttpRequest' && /aqi_session=sess1/.test(s.cookie)), 'each district asked with the page token, X-Requested-With and the session cookie', seen);
  const file = join(lake, 'epd_district_2026-10.jsonl'); const L = existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((x) => JSON.parse(x)) : [];
  ok(L.length === 6, 'six hourly district rows stored (2 districts x 3 hours)', L.length);
  ok(L.every((r) => r.kind === 'district_mean' && r.source === 'history' && Array.isArray(r.station_names) && !('aqi_range' in r)), 'rows labelled district_mean / history, station names kept', L[0]);
  ok(L.some((r) => r.district === 'Lahore' && r.t === '2026-10-26T01:00:00Z' && r.aqi === 301 && r.pm25 === 101), 'values and hour stamp as served', L.find((r) => r.district === 'Lahore'));
  ok(!existsSync(join(lake, 'epd_2026-10.jsonl')), 'nothing written to the station file');
  ok(H.failed.length === 1 && /Kot Addu/.test(H.failed[0]) && H.lastOk, 'a refused district is listed; the run still counts as done', H);
  seen.length = 0; await E.pollHistory();
  ok(seen.length === 0, 'within 20 h of a good run nothing is asked');
  await E.pollHistory({ force: true }); const L2 = readFileSync(file, 'utf8').trim().split('\n');
  ok(L2.length === 6, 'a second run stores no row twice', L2.length);
  ok(E.status().history && E.status().history.window && E.status().history.window.from === '2026-10-26T00:00:00Z', 'status carries the history line', E.status().history);
  writeFileSync(join(lake, 'epd_district_daily.csv'), 'district,date,aqi,station_count,source,partial,hours,origin,imported_at\nKasur,2026-10-28,278,1,daily,0,,"owner export of the EPD dashboard: a.csv",x\nKasur,2026-10-29,301,1,live 06:00 PKT,1,,"owner export of the EPD dashboard: a.csv",x\n');
  const d1 = E.daily({ district: 'Kasur' }), d2 = E.daily({ district: 'Kasur', full: false });
  ok(d1.rows.length === 1 && d1.rows[0].aqi === 278 && d2.rows.length === 2 && d2.rows[1].partial === true, 'the daily reader skips partial rows unless asked', [d1.rows, d2.rows]);
  process.env.NIGRAAN_EPD = '0'; seen.length = 0; await E.pollHistory({ force: true }); ok(seen.length === 0, 'NIGRAAN_EPD=0 switches it off');
} finally { srv.close(); rmSync(T, { recursive: true, force: true }); }
console.log(`${n - f}/${n} pass`); process.exit(f ? 1 : 0);
