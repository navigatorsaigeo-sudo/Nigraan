/* v91.17.188 · HINDCAST OF THE STUCK / FLAT SENSOR SCREENS (sitingoffsets.mjs persistenceScreen + flatScreen) IN THE LIVE LAYER
   As tests186/hindcast_live.tool.mjs, but offsets are re-fitted every PKT day on the 16 days before it (as the daily backfill does),
   and two variants are compared on the same hours: 'v186' = offsets and held-out rules without the new screens, 'v188' = with them.
   Extra input: a CSV key,iso,fail (WMO persistence test per station-hour from the 5-minute database readings).
   usage: node scripts/tests188/hindcast_v188.tool.mjs <pairs.csv> <persist.csv> [out.json]
   --- original header follows ---
   v91.17.186 · HINDCAST OF THE LIVE LAYER WITH THE SERVER'S OWN CODE (hyperlocal.mjs + sitingoffsets.mjs)
   Input: a CSV of station-hours (key,name,iso,lat,lon,elev,obs,raw,srv,verdict,region,sky_obs,part): the MACH database reading,
   the provider forecast at the station (raw) and the served chain without live terms (srv, /px __mos=1&__nolive=1).
   For every hour, each station is hidden in turn and the live layer, built from the others, is read at its position.
   Offsets are fitted on the 16 days BEFORE each 16-day block (as the daily backfill does), never on the hours being scored.
   Variants: 'v185' = the old input rule (trusted stations, by day only with a sun table, 2 needed, 3 C cap, 2.5 C clamp);
             'v186' = the rule in hyperlocal-model.json (all QC-passed stations, siting offsets, held-out stations out).
   usage: node scripts/tests186/hindcast_live.tool.mjs <pairs.csv> [out.json] */
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHyperlocal } from '../../server/api/hyperlocal.mjs';
import { computeOffsets } from '../../server/api/sitingoffsets.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), DATA = join(HERE, '..', '..', 'data');
const [, , csv, pcsv, outFile] = process.argv;
const PERS = {}; for (const l of readFileSync(pcsv, 'utf8').trim().split('\n').slice(1)) { const [k, iso, f] = l.split(','); (PERS[k] || (PERS[k] = {}))[iso] = f === '1'; }
const lines = readFileSync(csv, 'utf8').trim().split('\n'); const head = lines.shift().split(',');
const ix = Object.fromEntries(head.map((h, i) => [h, i]));
const rows = lines.map(l => { const c = l.split(','); return { key: c[ix.key], name: c[ix.name], iso: c[ix.iso], lat: +c[ix.lat], lon: +c[ix.lon], elev: +c[ix.elev], obs: +c[ix.obs], raw: +c[ix.raw], srv: +c[ix.srv], verdict: c[ix.verdict], region: c[ix.region], sky: c[ix.sky_obs], part: c[ix.part] }; })
  .filter(r => Number.isFinite(r.obs) && Number.isFinite(r.srv) && Number.isFinite(r.raw));
const msOf = (iso) => Date.parse(iso + ':00:00Z');
const base = JSON.parse(readFileSync(join(DATA, 'hyperlocal-model.json'), 'utf8'));
const screen = { radius_km: 15, dz_m: 150, min_neighbours: 2, min_days: 10, abs_c: 2.5, iqr_c: 3.0 };

function makeLayer(model) {
  const dir = mkdtempSync(join(tmpdir(), 'hl186-'));
  writeFileSync(join(dir, 'hyperlocal-model.json'), JSON.stringify({ ...model, max_age_min: 1e9 }));
  copyFileSync(join(DATA, 'mach-sun-correction.json'), join(dir, 'mach-sun-correction.json'));
  const feed = { rows: [] };
  const app = { fleet: { liveReadings: () => feed.rows, latest: () => ({ at: 1, rows: [] }) } };
  return { hl: createHyperlocal(app, dir), feed };
}
const V = {
  v185: makeLayer(base),
  v186: makeLayer(base),
};
const sc = V.v186.hl.siteCorrect;
const byHour = new Map(); for (const r of rows) (byHour.get(r.iso) || byHour.set(r.iso, []).get(r.iso)).push(r);
const hours = [...byHour.keys()].sort();
const t0 = msOf(hours[0]), WIN = 16 * 864e5;
const SCR = process.env.H188_SCREENS || 'both'; /* both | persist | flat */
const offCache = new Map(); const pre = rows.map(r => ({ r, m: msOf(r.iso) }));
/* the daily backfill: at the start of each PKT day (19 UTC), the 16 days before it; [without screens, with screens] */
function offsetsFor(ms) {
  const d0 = Math.floor((ms + 5 * 3600e3) / 864e5) * 864e5 - 5 * 3600e3; if (offCache.has(d0)) return offCache.get(d0);
  const lo = d0 - WIN; const st = {}, pe = {};
  for (const { r, m } of pre) { if (m < lo || m >= d0) continue;
    const s = st[r.key] || (st[r.key] = { lat: r.lat, lon: r.lon, elevM: r.elev, hours: {} });
    const c = sc(r.lat, r.lon, r.obs, m); s.hours[r.iso] = [c.t, c.t - r.raw]; }
  for (const [k, h] of Object.entries(PERS)) for (const [iso, f] of Object.entries(h)) { const m = msOf(iso); if (m >= lo && m < d0) (pe[k] || (pe[k] = {}))[iso] = f; }
  const ok = d0 - t0 >= 10 * 864e5;
  const o = ok ? [computeOffsets(st, [], screen, base.radius_km, null, { flat: false, mixup: false }), computeOffsets(st, [], screen, base.radius_km, SCR === 'flat' ? null : pe, { flat: SCR !== 'persist' })] : [{ stations: {} }, { stations: {} }];
  offCache.set(d0, o); return o;
}
const out = []; const DUMP = process.env.H188_DUMP ? [] : null;   /* v190: the live layer's kriged residual at each station, the station itself left out */
for (const iso of hours) {
  const H = byHour.get(iso); if (H.length < 2) continue; const ms = msOf(iso); const [OA, OB] = offsetsFor(ms).map(x => x.stations); const O = OB;
  const lh = (new Date(ms).getUTCHours() + 5) % 24, night = lh >= 19 || lh <= 6;
  V.v185.feed.rows = H.map(r => ({ key: r.key, name: r.key, lat: r.lat, lon: r.lon, obsMs: ms, tempC: r.obs, served: r.srv, offset: OA[r.key] || null }));
  V.v186.feed.rows = H.map(r => ({ key: r.key, name: r.key, lat: r.lat, lon: r.lon, obsMs: ms, tempC: r.obs, served: r.srv, offset: O[r.key] || null }));
  V.v185.hl.refresh(true); V.v186.hl.refresh(true);
  for (const r of H) {
    const a = V.v185.hl.at(r.lat, r.lon, { exclude: r.key }), b = V.v186.hl.at(r.lat, r.lon, { exclude: r.key });
    if (DUMP) DUMP.push(r.key + ',' + iso + ',' + (b.applied ? b.dT : '') + ',' + r.obs + ',' + r.srv + ',' + r.verdict);
    out.push([r.key, r.region, r.verdict, r.sky, r.part, r.obs, r.srv, a.applied ? a.dT : 0, b.applied ? b.dT : 0, O[r.key] && O[r.key].stuck ? 1 : 0]);
  }
}
const agg = (f) => { const g = {}; for (const x of out) { const k = f(x); if (k == null) continue; const e = g[k] || (g[k] = { n: 0, served: 0, v186old: 0, v188: 0 });
  e.n++; e.served += Math.abs(x[6] - x[5]); e.v186old += Math.abs(x[6] + x[7] - x[5]); e.v188 += Math.abs(x[6] + x[8] - x[5]); }
  for (const e of Object.values(g)) { e.served = +(e.served / e.n).toFixed(3); e.v186old = +(e.v186old / e.n).toFixed(3); e.v188 = +(e.v188 / e.n).toFixed(3); } return g; };
const ok = (x) => x[0] !== 'AKZSFWS';
const res = {
  stationHours: out.length,
  trusted: agg(x => x[2] === 'trusted' ? 'all' : null),
  trustedByRegion: agg(x => x[2] === 'trusted' ? x[1] : null),
  trustedBySkyDay: agg(x => x[2] === 'trusted' && x[4] === 'day' && x[3] ? x[3] : null),
  unscreenedByRegion: agg(x => x[2] === 'unscreened' && ok(x) ? x[1] : null),
  unscreened: agg(x => x[2] === 'unscreened' && ok(x) ? 'all' : null),
  all: agg(x => ok(x) ? 'all' : null),
  allByRegion: agg(x => ok(x) ? x[1] : null),
  overcastDay: agg(x => x[4] === 'day' && /overcast/.test(x[3] || '') && ok(x) ? 'all' : null),
  stuckOrFlatStations: Object.fromEntries([...new Set(out.filter(x => x[9]).map(x => x[0]))].map(k => [k, out.filter(x => x[9] && x[0] === k).length])),
  notStuckScored: agg(x => !x[9] && ok(x) ? 'all' : null),
};
if (DUMP) writeFileSync(process.env.H188_DUMP, 'key,iso,ek,obs,srv,verdict\n' + DUMP.join('\n') + '\n');
const s = JSON.stringify(res, null, 1); if (outFile) writeFileSync(outFile, s); console.log(s);
