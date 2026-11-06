/* v91.17.186 · HINDCAST OF THE LIVE LAYER WITH THE SERVER'S OWN CODE (hyperlocal.mjs + sitingoffsets.mjs)
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
const [, , csv, outFile] = process.argv;
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
  v185: makeLayer({ ...base, min_stations: 2, cap_c: 3, clamp_c: 2.5 }),
  v186: makeLayer({ ...base, ...(process.env.H186_MODEL ? JSON.parse(process.env.H186_MODEL) : {}) }),
};
const sc = V.v186.hl.siteCorrect;
const byHour = new Map(); for (const r of rows) (byHour.get(r.iso) || byHour.set(r.iso, []).get(r.iso)).push(r);
const hours = [...byHour.keys()].sort();
const t0 = msOf(hours[0]), BLOCK = 16 * 864e5;
const offCache = new Map();
function offsetsFor(ms) {
  const b = Math.floor((ms - t0) / BLOCK); if (offCache.has(b)) return offCache.get(b);
  const lo = t0 + (b - 1) * BLOCK, hi = t0 + b * BLOCK; const st = {};
  for (const r of rows) { const m = msOf(r.iso); if (m < lo || m >= hi) continue;
    const s = st[r.key] || (st[r.key] = { lat: r.lat, lon: r.lon, elevM: r.elev, hours: {} });
    const c = sc(r.lat, r.lon, r.obs, m); s.hours[r.iso] = [c.t, c.t - r.raw]; }
  const o = b >= 1 ? computeOffsets(st, [], screen, base.radius_km) : { stations: {} };
  offCache.set(b, o); return o;
}
const out = [];
for (const iso of hours) {
  const H = byHour.get(iso); if (H.length < 2) continue; const ms = msOf(iso); const O = offsetsFor(ms).stations;
  const lh = (new Date(ms).getUTCHours() + 5) % 24, night = lh >= 19 || lh <= 6;
  V.v185.feed.rows = H.filter(r => r.verdict === 'trusted' && (sc(r.lat, r.lon, r.obs, ms).table || night)).map(r => ({ key: r.key, name: r.key, lat: r.lat, lon: r.lon, obsMs: ms, tempC: r.obs, served: r.srv, trusted: true, offset: null }));
  V.v186.feed.rows = H.map(r => ({ key: r.key, name: r.key, lat: r.lat, lon: r.lon, obsMs: ms, tempC: r.obs, served: r.srv, offset: O[r.key] || null }));
  V.v185.hl.refresh(true); V.v186.hl.refresh(true);
  for (const r of H) {
    const a = V.v185.hl.at(r.lat, r.lon, { exclude: r.key }), b = V.v186.hl.at(r.lat, r.lon, { exclude: r.key });
    out.push([r.key, r.region, r.verdict, r.sky, r.part, r.obs, r.srv, a.applied ? a.dT : 0, b.applied ? b.dT : 0, O[r.key] && O[r.key].heldOut ? 1 : 0]);
  }
}
const agg = (f) => { const g = {}; for (const x of out) { const k = f(x); if (k == null) continue; const e = g[k] || (g[k] = { n: 0, served: 0, v185: 0, v186: 0 });
  e.n++; e.served += Math.abs(x[6] - x[5]); e.v185 += Math.abs(x[6] + x[7] - x[5]); e.v186 += Math.abs(x[6] + x[8] - x[5]); }
  for (const e of Object.values(g)) { e.served = +(e.served / e.n).toFixed(3); e.v185 = +(e.v185 / e.n).toFixed(3); e.v186 = +(e.v186 / e.n).toFixed(3); } return g; };
const ok = (x) => x[0] !== 'AKZSFWS';
const res = {
  stationHours: out.length,
  trusted: agg(x => x[2] === 'trusted' ? 'all' : null),
  trustedByRegion: agg(x => x[2] === 'trusted' ? x[1] : null),
  trustedBySkyDay: agg(x => x[2] === 'trusted' && x[4] === 'day' && x[3] ? x[3] : null),
  unscreenedByRegion: agg(x => x[2] === 'unscreened' && ok(x) ? x[1] : null),
  unscreened: agg(x => x[2] === 'unscreened' && ok(x) ? 'all' : null),
  heldOutStations: [...new Set(out.filter(x => x[9]).map(x => x[0]))],
};
const s = JSON.stringify(res, null, 1); if (outFile) writeFileSync(outFile, s); console.log(s);
