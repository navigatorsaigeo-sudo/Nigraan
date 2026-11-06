/* v91.17.283.51 · B: served values before / after the speed work, byte for byte. Run once against a 1.0.10 server and once against this tree,
   both on the same data copy with the deterministic mock provider and a FROZEN clock (MOCK_FREEZE), so any difference is the code's:
     node ident50.mjs save <base> <places.json> <dir>      saves /px/v1/forecast (the corrected forecast, 8 days, the page's variables),
                                                           /api/point (customer and operator) and /api/place/answer of every place
     node ident50.mjs compare <dirA> <dirB>                byte comparison; the place bundle's `shown` block (the now-value rule of C2/C3,
                                                           changed on purpose) is compared separately and listed */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const [mode, a1, a2, a3] = process.argv.slice(2);
const HOURLY = 'temperature_2m,relative_humidity_2m,wind_speed_10m,dew_point_2m,apparent_temperature,precipitation,wind_gusts_10m,cloud_cover,weather_code,precipitation_probability,snowfall,surface_pressure,shortwave_radiation,uv_index';
if (mode === 'save') { const B = a1, P = JSON.parse(readFileSync(a2, 'utf8')), D = a3; mkdirSync(D, { recursive: true });
  for (const p of P) { const ll = 'lat=' + p.lat + '&lon=' + p.lon;
    const get = async (path, h = {}) => { const r = await fetch(B + path, { headers: { 'sec-fetch-site': 'same-origin', ...h }, signal: AbortSignal.timeout(300000) }); return Buffer.from(await r.arrayBuffer()); };
    writeFileSync(join(D, p.id + '.px.json'), await get('/px/v1/forecast?' + new URLSearchParams({ __omhost: 'api.open-meteo.com', latitude: String(p.lat), longitude: String(p.lon), hourly: HOURLY, forecast_days: '8', timezone: 'Asia/Karachi' })));
    for (const v of ['customer', 'operator']) { writeFileSync(join(D, p.id + '.point.' + v + '.json'), await get('/api/point?' + ll + '&complete=1', { 'x-agn-view': v })); }
    writeFileSync(join(D, p.id + '.answer.json'), await get('/api/place/answer?' + ll, { 'x-agn-view': 'customer' }));
    console.log('saved', p.id); } process.exit(0); }
if (mode === 'compare') { const A = a1, B = a2; let same = 0, diff = 0, shownDiff = 0; const out = [];
  const VOL = new Set(['assembledAt', 'completedAt', 'madeAt', 'made', 'shown', 'version', 'answerId', 'stamp', 'chainId', 'digest', 'snapshot', 'ms', 'at', 'self']);
  const strip = (x) => { if (Array.isArray(x)) return x.map(strip); if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) { if (VOL.has(k)) continue; o[k] = strip(x[k]); } return o; } return x; };
  for (const f of readdirSync(A).filter((f) => existsSync(join(B, f))).sort()) {
    const x = readFileSync(join(A, f)), y = readFileSync(join(B, f));
    if (f.endsWith('.px.json')) { if (x.equals(y)) same++; else { diff++; out.push(f + ': corrected forecast bytes differ'); } continue; }
    let jx, jy; try { jx = JSON.parse(x); jy = JSON.parse(y); } catch (_) { diff++; out.push(f + ': not JSON'); continue; }
    const sx = JSON.stringify(strip(jx)), sy = JSON.stringify(strip(jy)); if (sx === sy) same++; else { diff++; let i = 0; while (i < sx.length && sx[i] === sy[i]) i++; out.push(f + ': differ at ...' + sx.slice(Math.max(0, i - 80), i + 60)); }
    if (jx.shown && jy.shown && JSON.stringify(jx.shown.now && jx.shown.now.value) !== JSON.stringify(jy.shown.now && jy.shown.now.value)) shownDiff++; }
  console.log(out.slice(0, 20).join('\n')); console.log('ident50: ' + same + ' identical, ' + diff + ' different (values; volatile stamps and the shown block left out); shown now-value changed on ' + shownDiff + ' (C2/C3 rule)'); process.exit(diff ? 1 : 0); }
