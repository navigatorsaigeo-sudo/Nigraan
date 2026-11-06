/* v91.17.187 · TRAINING ROWS FOR THE WEATHER MOS (wxmos.mjs), built with the server's own feature code
   For every station: the provider's historical forecast at the station (raw, /px __raw=1) and the served chain without live terms
   (/px __mos=1&__nolive=1&__nowx=1) for the same hours; the national model's feature rows (natmodel internals.rows, nopool set) are
   made from the raw body exactly as at serve time, plus the served value. Output: one gzipped NDJSON line per station-hour.
   usage: node scripts/tests187/build_wxmos_data.tool.mjs <stations.json> <out.ndjson.gz> [base=http://127.0.0.1:8787] [start] [end] */
import { readFileSync, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeatGrid } from '../../server/api/featgrid.mjs';
import { createNational } from '../../server/api/natmodel.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const [, , stFile, outFile, base = 'http://127.0.0.1:8787', start = '2026-03-25', end = '2026-10-05'] = process.argv;
const ST = JSON.parse(readFileSync(stFile, 'utf8'));
const nat = createNational({ dataDir: DATA, featGrid: createFeatGrid(DATA) });
const FEAT = nat.internals.model().variants.nopool.features;
const VARS = 'temperature_2m,relative_humidity_2m,dew_point_2m,cloud_cover,wind_speed_10m,wind_direction_10m,shortwave_radiation,precipitation';
/* the served replay asks exactly as the page does: inside the zone file's client boxes the request carries the zone models
   (mountain and hills serve the icon / gfs / meteofrance blend, folded by mergeZone), elsewhere best_match */
const ZF = JSON.parse(readFileSync(join(DATA, 'model-zone.json'), 'utf8')); const ZREQ = ZF.request && ZF.request.models; const BOXES = ZF.clientBoxes || [];
const inBox = (s) => BOXES.some(z => s.lat >= z[0] && s.lat <= z[2] && s.lon >= z[1] && s.lon <= z[3]);
async function get(s, extra) {
  const q = new URLSearchParams({ latitude: s.lat.toFixed(5), longitude: s.lon.toFixed(5), elevation: String(Math.round(s.elev)), hourly: VARS, timezone: 'GMT', start_date: start, end_date: end, __omhost: 'historical-forecast-api.open-meteo.com', ...extra });
  const r = await fetch(base + '/px/v1/forecast?' + q, { headers: { Origin: base }, signal: AbortSignal.timeout(600000) }); if (!r.ok) throw new Error('px ' + r.status); return r.json();
}
const gz = createGzip(); gz.pipe(createWriteStream(outFile));
let done = 0, rows = 0;
async function one(s) {
  try {
    const raw = await get(s, { __raw: '1' }); const srv = await get(s, { __mos: '1', __nolive: '1', __nowx: '1', ...(ZREQ && inBox(s) ? { models: ZREQ } : {}) });
    const T0 = raw.hourly.temperature_2m; const { out, ts } = nat.internals.rows(raw, s.lat, s.lon, T0, null);
    const S = srv.hourly.temperature_2m;
    for (let i = 0; i < out.length; i++) { const f = out[i]; if (!f || S[i] == null) continue;
      gz.write(JSON.stringify({ pid: s.pid, net: s.net, zoneReq: !!(ZREQ && inBox(s)), t: new Date(ts[i]).toISOString().slice(0, 13), T0: T0[i], srv: S[i], x: FEAT.map(c => f[c] ?? null) }) + '\n'); rows++; }
  } catch (e) { console.log('ERR', s.pid, e.message); }
  done++; if (done % 10 === 0) console.log(done, '/', ST.length, rows);
}
for (let i = 0; i < ST.length; i += 3) await Promise.all(ST.slice(i, i + 3).map(one));
gz.end(); await new Promise(r => gz.on('end', r)); console.log('features', JSON.stringify(FEAT)); console.log('DONE', rows);
