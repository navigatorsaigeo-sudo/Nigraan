import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.269 · INFRA A7 · the feeds: secondary forecast on errors and outages, the further secondary forecast only with its key file,
   the learning scripts through the server's call counter.   node scripts/tests269/feeds.test.mjs [--unit]
   Unit (no server):
     U1 the further secondary forecast's hours become the main forecast's shape: % from 0-1 fractions, km/h, hPa, PKT times, whole-day
        daily max/min/sum, variables it lacks are null and listed as missing, the outage wording, no supplier name anywhere
     U2 SUPPLIER_RE names the further secondary forecast (it never reaches a client)
   Server (a copy of this tree and of data/ in a temp folder, scripts/tests269/feeds_mock.mjs as the network; test keys made here):
     S1 main forecast 503 twice -> the first secondary forecast answers (x-agn-fallback 1, "unavailable" wording, uncorrected)
     S2 main forecast unreachable -> the same; the 3rd failure opens the outage window
     S3 inside the window a point request does not call the main forecast at all and is answered by the secondary forecast
     S4 after the window the main forecast is tried again; its answer closes the window (x-agn-provider MACH forecast)
     S5 an internal learner (x-agn-internal: fleet-pairs) never gets the secondary forecast (502 as before)
     S6 429 -> the secondary forecast with the quota wording (the v147 behaviour, unchanged)
     S7 no vc.key, weatherkit.key present -> the further secondary forecast answers (x-agn-fallback 2), signed token accepted,
        no supplier name in the answer or its headers
     S8 neither key file -> 502 as before (nothing new is served)
     S9 POST /api/quota/note: the weight is the proxy's rule, the key parameter is never kept, today's window and the breakdown
        carry it; a pending line written while the server was down is added on the next note; a non-loopback-host caller is refused */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, cpSync, appendFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const HERE = fileURLToPath(new URL('.', import.meta.url)), ROOT = resolve(HERE, '..', '..');
const VC = await import(new URL('../../server/api/vcfallback.mjs', import.meta.url).href);
const { SUPPLIER_RE } = await import(new URL('../../server/api/customerscrub.mjs', import.meta.url).href);
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + String(d).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- U1 / U2 ---- */
{
  const H = 3600e3, now = Date.now(), t0 = Date.parse(new Date(now + 5 * H).toISOString().slice(0, 10) + 'T00:00:00Z') - 5 * H;   /* PKT midnight today */
  const hours = []; for (let k = -24; k < 96; k++) hours.push({ forecastStart: new Date(t0 + k * H).toISOString(), temperature: 20 + (k % 24), temperatureDewPoint: 10, humidity: 0.5, precipitationAmount: k % 24 === 5 ? 2.5 : 0,
    precipitationChance: 0.3, windSpeed: 36, windGust: 50, windDirection: 180, pressure: 1003.5, cloudCover: 0.25, temperatureApparent: 99 });
  const qs = new URLSearchParams({ latitude: '31.52', longitude: '74.36', hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,wind_speed_10m,pressure_msl,cloud_cover,apparent_temperature,uv_index',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max', current: 'temperature_2m,wind_speed_10m', timezone: 'Asia/Karachi', forecast_days: '3', wind_speed_unit: 'ms' });
  const out = VC.wkShape(qs, [{ forecastHourly: { hours }, currentWeather: { asOf: new Date(now).toISOString(), temperature: 21, humidity: 0.5, windSpeed: 36, windGust: 50, windDirection: 180, pressure: 1003, cloudCover: 0.25, temperatureDewPoint: 10 } }], 'outage');
  const h = out.hourly, d = out.daily;
  ok(out && h.time.length === 72 && h.time[0] === new Date(t0 + 5 * H).toISOString().slice(0, 16), 'U1 72 hours from PKT midnight, local times', h && h.time.slice(0, 2));
  ok(h.relative_humidity_2m[0] === 50 && h.precipitation_probability[0] === 30 && h.cloud_cover[0] === 25, 'U1 fractions 0-1 become % (humidity 50, chance 30, cloud 25)');
  ok(h.wind_speed_10m[0] === 10 && h.pressure_msl[0] === 1003.5 && h.dew_point_2m[0] === 10, 'U1 km/h -> the asked unit (36 km/h = 10 m/s), hPa and C kept');
  ok(h.apparent_temperature.every((x) => x === null) && h.uv_index.every((x) => x === null) && out.agn_fallback.missing.includes('apparent_temperature') && out.agn_fallback.missing.includes('uv_index_max'),
    'U1 variables it does not carry are null and listed as missing (its feels-like is not the Steadman apparent temperature)');
  ok(d.time.length === 3 && d.temperature_2m_max[0] === 43 && d.temperature_2m_min[0] === 20 && d.precipitation_sum[0] === 2.5, 'U1 daily max / min / sum from the whole local day', JSON.stringify(d));
  ok(out.current && out.current.temperature_2m === 21 && out.current.wind_speed_10m === 10, 'U1 current conditions');
  ok(/unavailable/.test(out.agn_fallback.source) && out.agn_fallback.corrected === false, 'U1 outage wording, not corrected', out.agn_fallback.source);
  const s = JSON.stringify(out);
  ok(!SUPPLIER_RE.test(s) && !/apple|weatherkit/i.test(s), 'U1 no supplier name in the answer');
  ok(SUPPLIER_RE.test('from WeatherKit') && SUPPLIER_RE.test('Apple Weather'), 'U2 SUPPLIER_RE names the further secondary forecast');
  const q2 = VC.wkShape(new URLSearchParams({ latitude: '31.5', longitude: '74.3', daily: 'temperature_2m_max', timezone: 'GMT', forecast_days: '7' }), [{ forecastHourly: { hours } }], 'quota');
  { const m = q2.daily.temperature_2m_max; ok(q2.daily.time.length < 7 && m[m.length - 1] === null && m.slice(0, -1).every((x) => Number.isFinite(x)) && /quota/.test(q2.agn_fallback.source), 'U1 a part day is empty (no data, not zero), days past its hours are not listed (as the first secondary forecast); quota wording', JSON.stringify(q2.daily)); }
}
if (process.argv.includes('--unit')) { console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' feeds (unit): ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }

/* ---- server ---- */
const T = mkdtempSync(join(tmpdir(), 'nig269-feeds-')), APP = join(T, 'nigraan-local');
mkdirSync(APP, { recursive: true });
for (const d of ['server', 'artefact']) cpSync(join(ROOT, d), join(APP, d), { recursive: true });
cpSync(join(ROOT, 'package.json'), join(APP, 'package.json'));
console.log('copying data/ ...'); cpSync(join(ROOT, 'data'), join(APP, 'data'), { recursive: true });
for (const f of ['.store.lock', 'run']) rmSync(join(APP, 'data', f), { recursive: true, force: true });
const CTL = join(T, 'ctl.json'), LOG = join(T, 'calls.log');
const setMode = (m) => writeFileSync(CTL, JSON.stringify({ om: m }));
const calls = () => { try { return readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { return []; } };
/* test keys made here, for this temp copy only (never a real key) */
writeFileSync(join(APP, 'vc.key'), 'TESTONLY0000000000000000NOTAKEY');
const kp = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const WK = 'team=TESTTEAM00\nkeyid=TESTKEY000\nservice=test.agn.nigraan\n' + kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
const PORT = await __T.freePort(); setMode('ok');
const env = { ...process.env, PORT: String(PORT), MACH_API_KEY: 'MOCK-NOT-A-KEY', NIGRAAN_ENGINE: '0', NIGRAAN_PYJOBS: '0', NIGRAAN_WORKER: '0', NIGRAAN_OUTAGE_WINDOW_S: '4',
  FEEDS_CTL: CTL, FEEDS_LOG: LOG, FEEDS_WK_PUB: kp.publicKey.export({ type: 'spki', format: 'pem' }) };
delete env.OPEN_METEO_API_KEY; delete env.NIGRAAN_DATA_DIR;
const srv = spawn(process.execPath, ['--import', join(HERE, 'feeds_mock.mjs'), join(APP, 'server', 'server.mjs')], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; srv.stdout.on('data', (c) => { out += c; }); srv.stderr.on('data', (c) => { out += c; });
function get(path, headers = {}, method = 'GET', body = null) {
  return new Promise((res) => { const r = http.request({ host: '127.0.0.1', port: PORT, path, method, headers: { 'sec-fetch-site': 'same-origin', ...headers }, agent: false, timeout: 200000 }, (x) => {
    const b = []; x.on('data', (c) => b.push(c)); x.on('end', () => { const t = Buffer.concat(b).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (_) {} res({ status: x.statusCode, headers: x.headers, json: j, text: t }); }); });
    r.on('error', (e) => res({ status: 0, error: e.message })); r.on('timeout', () => r.destroy()); if (body) r.end(body); else r.end(); });
}
const PT = (lat) => '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=' + lat + '&longitude=74.36&hourly=temperature_2m,relative_humidity_2m&daily=temperature_2m_max&timezone=Asia%2FKarachi&forecast_days=3';
const omCalls = () => calls().filter((c) => /open-meteo/.test(c.host)).length;
try {
  let up = false; for (let i = 0; i < 300 && !up; i++) { await sleep(1000); const h = await get('/health'); up = h.status === 200; }
  ok(up, 'server started (temp copy, mock network)', out.slice(-800));
  /* S1 */
  setMode('503'); let n0 = omCalls(); let r = await get(PT('31.5201'));
  ok(r.status === 200 && r.headers['x-agn-fallback'] === '1' && r.headers['x-agn-provider'] === 'secondary forecast' && r.json && r.json.agn_fallback && /unavailable/.test(r.json.agn_fallback.source) && r.json.agn_fallback.corrected === false,
    'S1 main forecast 503 after the retry -> the secondary forecast answers, marked and uncorrected', r.status + ' ' + JSON.stringify(r.headers) + ' ' + r.text.slice(0, 300));
  ok(omCalls() - n0 >= 2, 'S1 the main forecast was asked twice first (retry kept)', omCalls() - n0);
  /* S2 */
  setMode('throw'); r = await get(PT('31.5202'));
  ok(r.status === 200 && r.headers['x-agn-fallback'] === '1', 'S2 main forecast unreachable -> the secondary forecast answers', r.status + ' ' + r.text.slice(0, 200));
  /* S3 */
  n0 = omCalls(); const t0 = Date.now(); r = await get(PT('31.5203'));
  ok(r.status === 200 && r.headers['x-agn-fallback'] === '1' && /outage/.test(r.headers['x-agn-upstream'] || '') && omCalls() === n0,
    'S3 inside the outage window: no call to the main forecast, the secondary forecast answers at once (' + (Date.now() - t0) + ' ms)', JSON.stringify(r.headers) + ' calls ' + (omCalls() - n0));
  /* S4 */
  setMode('ok'); await sleep(4500); n0 = omCalls(); r = await get(PT('31.5204'));
  ok(omCalls() > n0 && r.headers['x-agn-provider'] === 'MACH forecast' && !r.headers['x-agn-fallback'], 'S4 after the window the main forecast is tried again and answers', r.status + ' ' + JSON.stringify(r.headers).slice(0, 300));
  /* S5 */
  setMode('throw'); r = await get(PT('31.5205'), { 'x-agn-internal': 'fleet-pairs' });
  ok(r.status === 502 && !r.headers['x-agn-fallback'], 'S5 an internal learner never gets the secondary forecast (502 as before)', r.status + ' ' + r.text.slice(0, 200));
  /* S6 */
  setMode('429'); await sleep(4500); r = await get(PT('31.5206'));
  ok(r.status === 200 && r.headers['x-agn-fallback'] === '1' && r.json && /quota/.test(r.json.agn_fallback.source), 'S6 quota (429) -> the secondary forecast with the quota wording (as before)', r.status + ' ' + r.text.slice(0, 200));
  /* S7 */
  renameSync(join(APP, 'vc.key'), join(APP, 'vc.key.off')); writeFileSync(join(APP, 'weatherkit.key'), WK);
  setMode('throw'); r = await get(PT('31.5207'));
  const wkc = calls().filter((c) => c.host === 'weatherkit.apple.com');
  ok(r.status === 200 && r.headers['x-agn-fallback'] === '2' && r.json && r.json.hourly && r.json.hourly.relative_humidity_2m && r.json.hourly.relative_humidity_2m[0] === 42 && wkc.length && wkc.every((c) => c.auth === true),
    'S7 only weatherkit.key: the further secondary forecast answers (signed token accepted, 0.42 -> 42 %)', r.status + ' ' + JSON.stringify(wkc) + ' ' + r.text.slice(0, 300));
  ok(!SUPPLIER_RE.test(r.text) && !/apple|weatherkit/i.test(r.text + JSON.stringify(r.headers)), 'S7 no supplier name in the answer or its headers');
  ok(!out.includes('BEGIN PRIVATE KEY') && !out.includes('TESTKEY000') && !out.includes('TESTONLY'), 'S7 no key material in the server output');
  /* S8 */
  rmSync(join(APP, 'weatherkit.key')); await sleep(4500); r = await get(PT('31.5208'));
  ok(r.status === 502 && !r.headers['x-agn-fallback'], 'S8 no secondary key file: 502 as before', r.status + ' ' + r.text.slice(0, 200));
  /* S9 */
  const url = 'https://customer-previous-runs-api.open-meteo.com/v1/forecast?latitude=31.5&longitude=74.3&hourly=temperature_2m_previous_day1,temperature_2m_previous_day2&start_date=2025-01-01&end_date=2025-12-31&models=ecmwf_ifs025,gfs_seamless&apikey=SHOULD-NOT-BE-KEPT';
  const before = await get('/api/quota/breakdown');
  r = await get('/api/quota/note', { 'content-type': 'application/json' }, 'POST', JSON.stringify({ url, ok: true, caller: 'rank_models', n: 2 }));
  /* the proxy's own rule: 1 location x max(1, 2 vars x 2 models / 10 x 365/14) = 52.14 per call */
  ok(r.status === 200 && r.json && Math.abs(r.json.weighted - 2 * (4 / 10) * (365 / 14)) < 0.05, 'S9 a learning call is weighed with the proxy rule (2 calls = ' + (r.json && r.json.weighted) + ' weighted)', r.status + ' ' + r.text);
  mkdirSync(join(APP, 'data', 'run'), { recursive: true }); appendFileSync(join(APP, 'data', 'run', 'learn-calls.pending.jsonl'), JSON.stringify({ url: url.replace(/&apikey=[^&]*/, ''), ok: false, caller: 'lapse', n: 1 }) + '\n');
  r = await get('/api/quota/note', { 'content-type': 'application/json' }, 'POST', JSON.stringify({ url, ok: true, caller: 'soil_model_range' }));
  const after = await get('/api/quota/breakdown'); const rows = (after.json && after.json.rows) || [];
  const tag = (c) => rows.find((x) => x.caller.startsWith('learn ' + c + ' '));
  ok(tag('rank_models') && tag('rank_models').calls === 2 && tag('lapse') && tag('lapse').failed === 1 && tag('soil_model_range') && !existsSync(join(APP, 'data', 'run', 'learn-calls.pending.jsonl')),
    'S9 the breakdown lists the learning calls by script; the pending line (server was down) was added and its file removed', JSON.stringify(rows.filter((x) => /^learn/.test(x.caller))));
  const db = readFileSync(join(APP, 'data', 'nigraan-db.json'), 'utf8') + JSON.stringify(after.json) + out;
  ok(!db.includes('SHOULD-NOT-BE-KEPT'), 'S9 the key parameter is never kept (database, breakdown, server output)');
  r = await get('/api/quota/note', { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, 'POST', JSON.stringify({ url, ok: true }));
  ok(r.status === 403, 'S9 a relayed (non-local) caller is refused', r.status);
} finally {
  try { srv.kill('SIGKILL'); } catch (_) {}
  await sleep(500); rmSync(T, { recursive: true, force: true });
}
console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' feeds: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
