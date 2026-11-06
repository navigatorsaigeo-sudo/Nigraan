/* v91.17.273 FLOOD · landslide "not applicable" check. Run as coverage.mjs (same inputs), then list the tehsils the page's landslide
   score itself calls not applicable (12-degree effective-slope gate) although the terrain mask (data/hazard-applicability.json)
   leaves them in, and test both exclusions against the landslide catalogue (station-lake reports/landslide_events.csv).
   Output data/flood273/landslide-mask-check.json.  Was: coverage of the engine levels: the served page's engine (offline, in a Node VM exactly as server/engine/vmpage.mjs
   runs it) on the real served tehsil forecasts of the archive (data/archive/forecast, latest issue per tehsil, hours shifted so the
   issue starts now: a coverage test, not a forecast). For every layer and day 0-3: how many tehsils get a level, "not applicable", or
   "no data", and which. node coverage.mjs <root> <out.json> */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
const ROOT = process.argv[2], OUT = process.argv[3];
process.env.NIGRAAN_ENGINE_ARTEFACT = join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html');
/* REPLAY_ORIGIN: the page's own calls go to a running server of the same tree (the engine runner's path), so server-fed inputs
   (applicability mask, drought table, river and landslide feeds where the copies hold them) are what they are on that server */
const ORIG = process.env.REPLAY_ORIGIN || null;
if (ORIG) globalThis.__REPLAY_FETCH = (u, o = {}) => { const url = new URL(u, ORIG + '/'); const h = Object.assign({}, o.headers || {}); h['x-agn-internal'] = 'engine'; return fetch(ORIG + url.pathname + url.search, { ...o, headers: h }); };
const { ctx, vm } = await import('./pagevm.mjs');
const q = (e) => vm.runInContext(e, ctx, { timeout: 600000 });
await new Promise(r => setTimeout(r, Number(process.env.REPLAY_WAIT_MS || 4000)));
/* latest issue per tehsil */
const fc = {}; for (const f of ['fc_2026-09.jsonl.gz', 'fc_2026-10.jsonl.gz']) { let t = ''; try { t = gunzipSync(readFileSync(join(ROOT, 'data/archive/forecast', f))).toString(); } catch (_) { continue; }
  for (const l of t.split('\n')) { if (!l) continue; let r; try { r = JSON.parse(l); } catch (_) { continue; } if (!fc[r.u] || fc[r.u].iss < r.iss) fc[r.u] = r; } }
const now = Date.now(), h0 = Math.floor((now + 5 * 3600e3) / 3600e3) * 3600e3;   /* PKT wall clock, this hour */
const series = {}; for (const [u, r] of Object.entries(fc)) { const n = r.T.length, time = [], temp = [], hum = [], rain = [], wind = [], gust = [], snow = [];
  for (let i = 0; i < n + 24; i++) { const k = Math.min(i, n - 1) % n; time.push(new Date(h0 + (i - 2) * 3600e3).toISOString().slice(0, 16)); temp.push(r.T[k] / 10); hum.push(r.RH[k]); rain.push((r.P[k] || 0) / 10); wind.push(r.W[k]); gust.push((r.G || r.W)[k]); snow.push(0); }
  series[u] = { time, temp, feels: temp, hum, rain, wind, gust, snow }; }
ctx.__FC = series;
const injected = q(`(function(){ var n=0; AGN.selfcheck.units().forEach(function(p){ var s=__FC[p.uid]; var r=DISTRICT_IN[p.key]; if(!s||!r) return; r.fc72=s; r.fcUpdatedAt=Date.now(); r.weatherLive=true; r.fcSource='archive-replay'; n++; }); return n; })()`);

const gated = JSON.parse(q(`(function(){ var out=[]; AGN.selfcheck.units().forEach(function(p){ if(__agnHzMaskWhy(p.key,'landslide')) return; var u=AGN.selfcheck.unitOn('landslide',p); if(u.lv===-2) out.push(p.uid); }); return JSON.stringify(out); })()`));
const masked = Object.keys(JSON.parse(readFileSync(join(ROOT, 'data/hazard-applicability.json'), 'utf8')).layers.landslide.units);
const ev = readFileSync(process.argv[4] || '/mnt/user-data/uploads/NIGRAAN/nig/station-lake/reports/landslide_events.csv', 'utf8').split('\n').slice(1).filter(Boolean);
/* the uid is the 15th CSV field; titles hold commas inside quotes */
const uidOf = (l) => { const f = []; let cur = '', qq = false; for (const ch of l) { if (ch === '"') qq = !qq; else if (ch === ',' && !qq) { f.push(cur); cur = ''; } else cur += ch; } f.push(cur); return f[14]; };
const U = ev.map(uidOf).filter(u => u && !/Occupied/.test(u)); const G = new Set(gated), M = new Set(masked);
const res = { injected, tehsils: 576, maskedFlat: M.size, slopeGated: G.size, served: 576 - M.size - G.size, events: U.length,
  eventsInMasked: U.filter(u => M.has(u)).length, eventsInGated: U.filter(u => G.has(u)).length, eventsInServed: U.filter(u => !M.has(u) && !G.has(u)).length, gated };
writeFileSync(OUT, JSON.stringify(res, null, 1)); console.log(JSON.stringify({ ...res, gated: res.gated.length })); process.exit(0);
