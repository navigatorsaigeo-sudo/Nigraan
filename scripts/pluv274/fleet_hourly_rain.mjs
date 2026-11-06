/* v91.17.274 PLUVIAL · MACH database rain, stuck-screened, to hourly totals per station (PKT hours), for the served-archive check.
   Rows rejected by server/api/stuckscreen.mjs (whole-record replays, jumps, frozen sensors) are dropped. Hourly rain = the rise of
   the console's daily total within the hour (a fall is the daily reset: the new value counts). Registry exclusions dropped.
   node fleet_hourly_rain.mjs <root> <from YYYY-MM-DD> <to YYYY-MM-DD> <out.csv> <db.csv> [db.csv ...] */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [ROOT, FROM, TO, OUT, ...FILES] = process.argv.slice(2);
const { screenRows } = await import(join(ROOT, 'server/api/stuckscreen.mjs'));
const reg = JSON.parse(readFileSync(join(ROOT, 'data/mach-fleet-stations.json'), 'utf8')).stations;
const excl = new Set(reg.filter(s => s.exclude).map(s => s.key));
const rows = [];
const t0 = Date.parse(FROM + 'T00:00:00+05:00') - 86400e3, t1 = Date.parse(TO + 'T00:00:00+05:00') + 86400e3;
for (const f of FILES) {
  const L = readFileSync(f, 'utf8').split('\n'); const H = L[0].split(','); const ix = (k) => H.indexOf(k);
  const iT = ix('time'), iK = ix('station_key'), iTe = ix('temperature_c'), iTd = ix('dew_point_c'), iRH = ix('humidity_pct'), iP = ix('pressure_hpa'), iR = ix('precip_total_mm'), iPr = ix('provider');
  for (let i = 1; i < L.length; i++) { if (!L[i]) continue; const c = L[i].split(','); const ms = Date.parse(c[iT]); if (!(ms >= t0 && ms < t1)) continue;
    if (excl.has(c[iK])) continue;
    const num = (x) => (x === '' || x == null) ? null : Number(x);
    rows.push({ k: c[iK], ms, T: num(c[iTe]), Td: num(c[iTd]), RH: num(c[iRH]), P: num(c[iP]), R: num(c[iR]), prov: c[iPr] }); }
}
const bad = screenRows(rows, r => r.k, r => ({ ms: r.ms, T: r.T, Td: r.Td, RH: r.RH, P: r.P }));
const keep = rows.filter(r => !bad.has(r));
const by = new Map(); for (const r of keep) (by.get(r.k) || by.set(r.k, []).get(r.k)).push(r);
const out = ['station,hour_pkt,rain_mm,n'];
for (const [k, list] of by) { list.sort((a, b) => a.ms - b.ms); const hr = new Map(); let prev = null;
  for (const r of list) { if (r.R == null || !Number.isFinite(r.R)) continue;
    if (prev && r.ms - prev.ms <= 90 * 6e4) { const inc = r.R >= prev.R ? r.R - prev.R : r.R;
      const h = new Date(r.ms + 5 * 3600e3).toISOString().slice(0, 13); const o = hr.get(h) || { s: 0, n: 0 }; o.s += inc; o.n++; hr.set(h, o); }
    prev = r; }
  for (const [h, o] of hr) if (h >= FROM && h < TO + 'T24') out.push(`${k},${h},${o.s.toFixed(2)},${o.n}`); }
writeFileSync(OUT, out.join('\n'));
console.log('rows', rows.length, 'rejected by the stuck screen', bad.size, 'stations', by.size, 'station-hours', out.length - 1);
