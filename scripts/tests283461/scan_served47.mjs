/* v91.17.283.47 · scan of the SERVED hourly temperature curves (GET /api/point/batch, the point records every page and the area heat read)
   at every tehsil point of the newest national run (data/records) and every MACH and synop station, with the served-curve check of
   server/api/servedqc.mjs (limits: <climate dir>/served-qc-climate.json). On 1.0.8.1 it lists the artefacts as served; on 1.0.8.2 the
   point records already carry them in qc.withheld and the curves served are clean. Read only.
   usage: node scripts/tests283461/scan_served47.mjs <base url, e.g. http://127.0.0.1:8787> [climate data dir] */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), DATA = join(ROOT, 'data'); const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, ''); const CD = process.argv[3] || DATA;
const Q = await import(pathToFileURL(join(ROOT, 'server', 'api', 'servedqc.mjs')).href);
const pts = []; const rd = join(DATA, 'records'); const runs = existsSync(rd) ? readdirSync(rd).filter((f) => /^run_.*\.json$/.test(f)).map((f) => [f, statSync(join(rd, f)).mtimeMs]).sort((a, b) => b[1] - a[1]) : [];
if (runs.length) for (const x of JSON.parse(readFileSync(join(rd, runs[0][0]), 'utf8'))) if (Number.isFinite(x.lat) && Number.isFinite(x.lon) && !/Occupied/.test(x.unitKey)) pts.push({ name: x.unitKey, lat: x.lat, lon: x.lon });
try { for (const s of JSON.parse(readFileSync(join(DATA, 'mach-fleet-stations.json'), 'utf8')).stations || []) if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) pts.push({ name: 'MACH ' + (s.name || s.key), lat: s.lat, lon: s.lon }); } catch (_) {}
try { const S = JSON.parse(readFileSync(join(DATA, 'synop-stations.json'), 'utf8')).stations || {}; for (const [id, s] of Object.entries(S)) if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) pts.push({ name: 'synop ' + id + ' ' + (s.name || ''), lat: s.lat, lon: s.lon }); } catch (_) {}
let nH = 0, nW = 0, nQ = 0, nP = 0; const list = [];
for (let i = 0; i < pts.length; i += 40) { const B = pts.slice(i, i + 40);
  const r = await fetch(BASE + '/api/point/batch?pts=' + B.map((p) => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(';'), { headers: { 'x-agn-view': 'operator' } }).then((x) => x.json()).catch(() => null);
  const S = (r && r.states) || []; S.forEach((s, k) => { if (!s || !s.ok || !Array.isArray(s.hours)) return; nP++; const p = B[k];
    const hh = s.hours.map((h) => ({ time: h.time, T: h.tempC })); nH += hh.length; const out = Q.curveCheck(CD, hh, s.point && s.point.zone, s.point && s.point.elevM);
    const held = (s.qc && s.qc.withheld) || []; nQ += held.length; nW += out.size;
    if (out.size || held.length) list.push(p.name + ' [' + (s.point && s.point.zone) + ' ' + (s.point && s.point.elevM) + ' m]' + (out.size ? ' served: ' + [...out.values()].slice(0, 2).map((v) => v.why.replace(/^withheld: /, '')).join(' | ').slice(0, 220) : '') + (held.length ? ' withheld by the server: ' + held.map((q) => q.time.slice(11)).join(', ') : '')); }); }
console.log(BASE + ': ' + nP + ' points of ' + pts.length + ' answered, ' + nH + ' served hours; artefacts in the served curves: ' + nW + '; hours the server withheld (qc.withheld): ' + nQ);
for (const l of list) console.log('  ' + l);
