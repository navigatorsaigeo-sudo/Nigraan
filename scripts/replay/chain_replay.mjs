/* v91.17.109 · END-TO-END REPLAY OF THE SERVED TEMPERATURE CHAIN BY LEAD.
   For each evaluation point (station-lake/archive/national/points.csv) and lead L (1, 2, 3, 5 days) the as-issued forecast of that
   lead (station-lake/archive/model/cache_leads, fetch_leads.py) is passed through the server's own correctResponse, one target day at
   a time, with the clock set to when that forecast was issued (so the national model's 72-96 h fade and the monthly calibration act as
   they would have). Live MACH layers are off (__nolive): they cannot be replayed. Modes:
     raw    the lead-L forecast at the point height
     chain  the served chain without the national model
     full   the served chain (v108)
     old    v106 behaviour: no zone members for a best_match request (mountain/hills used the raw basis)
   NIGRAAN_NATIONAL_HORIZON_H=100000 run separately gives 'full' without the fade.
   Output: JSONL, one row per point x lead x target day with the 24 hourly values per mode (scored in Python against observations).
   node scripts/replay/chain_replay.mjs [--points N] [--every K] [--out file] */
import { readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const ROOT = new URL('../../', import.meta.url).pathname, LAKE = join(ROOT, '..', 'station-lake');
process.env.NIGRAAN_WORKER = '0'; process.env.NIGRAAN_ENGINE = '0';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, A) => (x.startsWith('--') ? a.concat([[x.slice(2), A[i + 1]]]) : a), []));
const OUT = args.out || join(LAKE, 'archive', 'replay', 'replay_' + (process.env.NIGRAAN_NATIONAL_HORIZON_H ? 'nofade' : 'v108') + '.jsonl');
const EVERY = Number(args.every || 1), NPTS = Number(args.points || 0), LEADS = (args.leads || '1,2,3,5').split(',').map(Number);
const MODES = (args.modes || (process.env.NIGRAAN_NATIONAL_HORIZON_H ? 'full' : 'chain,full,old')).split(',');
const VARS = ['temperature_2m', 'dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'shortwave_radiation', 'precipitation'];
const MEMBERS = ['icon_seamless', 'gfs_seamless', 'meteofrance_seamless'];
const realNow = Date.now.bind(Date); let fake = null; Date.now = () => (fake != null ? fake : realNow());
const { createBackend } = await import(join(ROOT, 'server', 'api', 'index.mjs'));
const quiet = console.log; console.log = () => {};
const backend = createBackend({ root: ROOT, dataDir: join(ROOT, 'data') }); const app = backend.app;
console.log = quiet;
const V = app.verification, MOS = app.mos, ZREQ = MOS.requestModels();
const rh = (t, td) => (t == null || td == null) ? null : Math.max(1, Math.min(100, Math.round(100 * Math.exp(17.625 * td / (243.04 + td)) / Math.exp(17.625 * t / (243.04 + t)))));
/* cache: points -> {time -> values} per lead/model */
const files = readdirSync(join(LAKE, 'archive', 'model', 'cache_leads')).filter(f => f.endsWith('.json'));
/* the cache files of a point are found exactly as fetch_leads.py names them (sha1 of the request), not by the coordinates the
   provider returns (it snaps to its grid, and two stations can share a cell) */
const LEADS_F = [1, 2, 3, 5], FVARS = ['temperature_2m', 'dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'shortwave_radiation', 'precipitation'];
const HOURLY_Q = FVARS.flatMap(v => LEADS_F.map(L => v + '_previous_day' + L)).join(',');
const pyF = (x) => { const s = x.toFixed(5); return s; };
const pyElev = (e) => e == null ? 'nan' : (Number.isInteger(e) ? e.toFixed(1) : String(e));
function chunksOf(start, end, days = 28) { const out = []; let s = Date.parse(start + 'T00:00Z'); const e = Date.parse(end + 'T00:00Z');
  while (s <= e) { const c = Math.min(s + (days - 1) * 864e5, e); out.push([new Date(s).toISOString().slice(0, 10), new Date(c).toISOString().slice(0, 10)]); s = c + 864e5; } return out; }
const CH = chunksOf(args.start || '2025-10-01', args.end || '2026-09-24');
const filesOf = (p) => { const hill = (p.elev != null && p.elev >= 900) || p.lat >= 34.3; const models = 'best_match' + (hill ? ',' + MEMBERS.join(',') : '');
  return CH.map(([a, b]) => createHash('sha1').update(`leads|${pyF(p.lat)}|${pyF(p.lon)}|${pyElev(p.elev)}|${a}|${b}|${HOURLY_Q}|${models}`).digest('hex').slice(0, 20) + '.json')
    .filter(f => existsSync(join(LAKE, 'archive', 'model', 'cache_leads', f))); };
const rowsOf = (fs) => fs.map(f => { try { return JSON.parse(readFileSync(join(LAKE, 'archive', 'model', 'cache_leads', f), 'utf8')); } catch (_) { return null; } }).filter(Boolean);
const pts = readFileSync(join(LAKE, 'archive', 'national', 'points.csv'), 'utf8').trim().split('\n').slice(1).map(l => { const [pid, net, lat, lon, elev] = l.split(','); return { pid, net, lat: +lat, lon: +lon, elev: elev === '' ? null : +elev }; });
let done = 0; const t0 = realNow(); if (!existsSync(OUT)) writeFileSync(OUT, '');
const SKIP = new Set(); if (args.resume) for (const l of readFileSync(OUT, 'utf8').split('\n')) { if (!l) continue; try { SKIP.add(JSON.parse(l).pid); } catch (_) {} }   /* --resume 1: points already in the output are skipped */
/* v91.17.199 · --pids <json with a points list> limits the replay to those points (the locked test set) */
const PIDS = args.pids ? new Set(JSON.parse(readFileSync(args.pids, 'utf8')).points) : null;
for (const p of (NPTS ? pts.slice(0, NPTS) : pts).filter(q => !PIDS || PIDS.has(q.pid))) {
  if (SKIP.has(p.pid)) continue;
  if (args.zones) { const z0 = MOS.zoneOfPoint(p.lat, p.lon, p.elev); if (!args.zones.split(',').includes(z0)) continue; }
  const fs = filesOf(p); if (!fs.length) { quiet('no cache for', p.pid); continue; }
  const docs = rowsOf(fs); const best = { elev: docs[0].elevation };
  const T = new Map(); for (const d of docs) { const h = d.hourly; h.time.forEach((t, i) => { const o = T.get(t) || T.set(t, {}).get(t); for (const k of Object.keys(h)) if (k !== 'time') o[k] = h[k][i]; }); }
  const times = [...T.keys()].sort(); if (times.length < 24 * 10) continue;
  const zone = MOS.zoneOfPoint(p.lat, p.lon, p.elev); const zm = MOS.zoneModel(zone); const zoneish = zm.members && !zm.members.includes('best_match');
  const days = [...new Set(times.map(t => t.slice(0, 10)))].sort().slice(3);
  for (const L of LEADS) for (let di = 0; di < days.length; di += EVERY) {
    const day = days[di];
    /* --issued 1: the series a forecast issued L days before the target day would carry: past 72 h at the shortest lead, then each
       hour at its own lead (day N of the run -> previous_dayN; day 4 = mean of days 3 and 5, the leads fetched). Default: every hour
       at lead L (stitched). A single-model answer carries no model suffix. */
    const ISS = !!args.issued; const issueMs = Date.parse(day + 'T00:00Z') - (ISS ? L : 0) * 864e5;
    const startMs = (ISS ? issueMs : Date.parse(day + 'T00:00Z')) - 3 * 864e5; const NH = ISS ? 72 + L * 24 + 24 : 96;
    const tt = []; for (let h = 0; h < NH; h++) tt.push(new Date(startMs + h * 3600e3).toISOString().slice(0, 16));
    const val = (o, v, N, m) => { if (!o) return null; const x = o[v + '_previous_day' + N + '_' + m] ?? (m === 'best_match' ? o[v + '_previous_day' + N] : undefined); return x == null ? null : x; };
    const get = (v, m) => tt.map((t, i) => { const o = T.get(t);
      if (!ISS) return val(o, v, L, m);
      const lh = (startMs + i * 3600e3 - issueMs) / 3600e3; const N = lh < 0 ? 1 : Math.min(5, Math.floor(lh / 24) + 1);
      if (N === 4) { const a = val(o, v, 3, m), b = val(o, v, 5, m); return (a != null && b != null) ? (a + b) / 2 : (a ?? b); }
      return val(o, v, N, m); });
    const H = { time: tt }; for (const v of VARS) H[v] = get(v, 'best_match'); H.relative_humidity_2m = H.temperature_2m.map((x, i) => rh(x, H.dew_point_2m[i]));
    const T0i = NH - 24; const rawT = H.temperature_2m.slice(T0i, NH); if (rawT.filter(x => x != null).length < 20 || H.temperature_2m.slice(0, 72).filter(x => x != null).length < 60) continue;
    let zrow = null; if (zoneish) { const R = { time: tt }; let ok = true; for (const v of [...VARS, 'relative_humidity_2m']) for (const m of MEMBERS) { if (v === 'relative_humidity_2m') { const a = get('temperature_2m', m), b = get('dew_point_2m', m); R[v + '_' + m] = a.map((x, i) => rh(x, b[i])); } else R[v + '_' + m] = get(v, m); }
      if (R['temperature_2m_icon_seamless'].slice(T0i, NH).every(x => x == null)) ok = false; if (ok) zrow = { models: ZREQ, row: { hourly: R } }; }
    const base = { latitude: p.lat, longitude: p.lon, elevation: p.elev ?? best.elev, utc_offset_seconds: 0, timezone: 'GMT', hourly_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' }, hourly: H };
    const qs = new URLSearchParams({ latitude: String(p.lat), longitude: String(p.lon), models: 'best_match', hourly: Object.keys(H).filter(k => k !== 'time').join(','), wind_speed_unit: 'kmh' });
    fake = ISS ? issueMs : Date.parse(day + 'T12:00Z') - L * 864e5;   /* issued L days before the target day's midday */
    const row = { pid: p.pid, net: p.net, zone, L, day, raw: rawT.map(x => x == null ? null : Math.round(x * 10) / 10) };
    for (const m of MODES) {
      const loc = JSON.parse(JSON.stringify(base)); const buf = Buffer.from(JSON.stringify([loc]));
      let r = null; try { r = V.correctResponse(buf, qs, [], null, 0, m === 'chain', m === 'old' ? null : (zrow ? [zrow] : null), true); } catch (e) { row[m + 'Err'] = e.message; continue; }
      let j = null; try { j = JSON.parse(r.buf.toString('utf8')); } catch (_) {}
      const o = Array.isArray(j) ? j[0] : j; row[m] = o && o.hourly ? o.hourly.temperature_2m.slice(T0i, NH) : null;
      if (m === 'full' && o) row.fullMeta = { basis: o.agn_temperature_basis && o.agn_temperature_basis.correction, nat: o.agn_national ? { a: o.agn_national.applied, w: o.agn_national.weight, v: o.agn_national.variant } : null };
    }
    fake = null; appendFileSync(OUT, JSON.stringify(row) + '\n'); done++;
    if (done % 500 === 0) quiet('rows', done, 'points', p.pid, Math.round((realNow() - t0) / 1000) + ' s');
  }
}
quiet('finished', done, 'rows ->', OUT); process.exit(0);
