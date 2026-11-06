/* v91.17.273 · TEMP · the forecast-cloud final correction (server/api/cloudt.mjs, data/cloudt.json).
     0 data file present; servedZones = the zones whose gate passed (none on 17 Oct 2026); the gate table is in the file
     1 default (switch unset): in a zone not served, answers unchanged; NIGRAAN_CLOUDT=0: off everywhere; stage wired last in the chain
     2 JS term and correction = Python (fixtures/cloudt_vectors.json: 300 station-hours, fitted cells of every zone, _ds2/make_cloudt_vectors.py)
     3 apply() (forced, fitted cells) = served + the Python correction; dew point never above the temperature
     4 speed: per answer (192 hours)
     5 answer without cloud_cover: unchanged, reason given; provenance not serialised to customers
   usage: node scripts/tests273/cloudt.test.mjs */
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createCloudT, termOf } from '../../server/api/cloudt.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), APP = join(HERE, '..', '..');
let P = 0, F = 0; const pass = (m, d) => { P++; console.log('PASS ' + m + (d ? ' · ' + d : '')); }, fail = (m, d) => { F++; console.log('FAIL ' + m + (d ? ' · ' + d : '')); };
const M = JSON.parse(readFileSync(join(APP, 'data', 'cloudt.json'), 'utf8'));
M && M.version ? pass('0 · data/cloudt.json present', M.version) : fail('0 · data/cloudt.json');
const passed = Object.entries(M.gate || {}).filter(([, g]) => g.verdict === 'PASS').map(([z]) => z).sort();
JSON.stringify(passed) === JSON.stringify([...(M.servedZones || [])].sort()) ? pass('0 · servedZones = the zones whose gate passed', JSON.stringify(M.servedZones)) : fail('0 · servedZones vs gate', JSON.stringify(M.servedZones) + ' vs ' + JSON.stringify(passed));
Object.keys(M.gate || {}).length === 4 ? pass('0 · gate table for the four zones in the file', Object.entries(M.gate).map(([z, g]) => z + ' ' + g.verdict).join(', ')) : fail('0 · gate table');

const ct = createCloudT({ dataDir: join(APP, 'data') });
const mk = (n = 192, cloud = 80) => { const t0 = Date.parse('2026-07-01T00:00:00Z'); const time = [...Array(n)].map((_, i) => new Date(t0 + 5 * 3600e3 + i * 3600e3).toISOString().slice(0, 16));
  return { utc_offset_seconds: 18000, elevation: 2400, hourly: { time, temperature_2m: time.map((_, i) => 15 + 8 * Math.sin(i / 24 * 2 * Math.PI)), dew_point_2m: time.map(() => 5), cloud_cover: time.map((_, i) => (i * 37) % 101) } }; };
delete process.env.NIGRAAN_CLOUDT;
let same = 0; for (let k = 0; k < 40; k++) { const z = ['mountain', 'plains', 'coast', 'hills'][k % 4]; const L = mk(); const T = L.hourly.temperature_2m.slice(); ct.apply(L, 35.9, 74.3, { zone: z }); if (JSON.stringify(T) === JSON.stringify(L.hourly.temperature_2m)) same++; }
ct.on() && same === 40 ? pass('1 · switch unset = on for passing zones only; zones not served: 40 answers unchanged', String(same)) : fail('1 · default', same + ' unchanged, on=' + ct.on());
process.env.NIGRAAN_CLOUDT = '0'; !ct.on() ? pass('1 · NIGRAAN_CLOUDT=0 switches it off') : fail('1 · switch off'); delete process.env.NIGRAAN_CLOUDT;
const V = readFileSync(join(APP, 'server', 'api', 'verification.mjs'), 'utf8');
/CHAIN_STAGES = \[[^\]]*'t2final', 'cloudt'(, 'dewfix')?\]/.test(V) && /cloudt: \(\) => !!\(app\.cloudt && app\.cloudt\.on\(\)/.test(V) ? pass('1 · chain stage wired after t2final (v275: only the dew-point offset follows), behind app.cloudt.on() and the zone gate') : fail('1 · chain wiring');

/* 2 · parity with Python on the fitted cells (a test model with every zone's fitted cells; the served file lists none) */
const FXv = JSON.parse(readFileSync(join(HERE, 'fixtures', 'cloudt_vectors.json'), 'utf8'));
const tdir = mkdtempSync(join(tmpdir(), 'cloudt-')); writeFileSync(join(tdir, 'cloudt.json'), JSON.stringify({ version: 'test', servedZones: ['coast', 'hills', 'mountain', 'plains'], cells: FXv.cells }));
const ctT = createCloudT({ dataDir: tdir });
let mx = 0, md = 0, cellOk = 0, worst = null;
for (const r of FXv.rows) { const t = termOf(r.ms, r.lat, r.lon, r.cloudPct); if (t.cell === r.cell) cellOk++; const dx = Math.abs(t.x - r.x); if (dx > mx) { mx = dx; worst = new Date(r.ms).toISOString(); }
  md = Math.max(md, Math.abs(ctT.deltaOf(r.zone, r.ms, r.lat, r.lon, r.cloudPct) - r.delta)); }
cellOk === FXv.rows.length && mx < 1e-3 ? pass('2 · JS term = Python term', `${FXv.rows.length} of ${FXv.rows.length} cells, max |dx| ${mx.toExponential(1)} (at ${worst})`) : fail('2 · term parity', `${cellOk} cells, max |dx| ${mx} at ${worst}`);
md < 0.005 ? pass('2 · JS correction = Python correction', 'max |diff| ' + md.toFixed(4) + ' C') : fail('2 · correction parity', md.toFixed(4));

/* 3 · apply() forced on the fitted cells */
const L3 = mk(); const T3 = L3.hourly.temperature_2m.slice(); ctT.apply(L3, 35.9, 74.3, { zone: 'mountain', force: true });
let e3 = 0, dpOk = true; const off = 5 * 3600e3;
for (let i = 0; i < T3.length; i++) { const ms = Date.parse(L3.hourly.time[i] + 'Z') - off; const want = Math.round((T3[i] + ctT.deltaOf('mountain', ms, 35.9, 74.3, L3.hourly.cloud_cover[i])) * 10) / 10; e3 = Math.max(e3, Math.abs(want - L3.hourly.temperature_2m[i])); if (L3.hourly.dew_point_2m[i] > L3.hourly.temperature_2m[i]) dpOk = false; }
const moved = T3.filter((v, i) => Math.abs(v - L3.hourly.temperature_2m[i]) >= 0.05).length;
e3 < 1e-9 && moved > 0 && dpOk ? pass('3 · apply() = served + the correction (forced, fitted mountain cells)', `${moved} of ${T3.length} hours moved; dew point <= temperature`) : fail('3 · apply', `err ${e3}, moved ${moved}, dp ${dpOk}`);

/* 4 · speed */
const N = 300; const Ls = [...Array(N)].map(() => mk()); const t0 = process.hrtime.bigint(); for (const L of Ls) ctT.apply(L, 35.9, 74.3, { zone: 'mountain', force: true }); const ms4 = Number(process.hrtime.bigint() - t0) / 1e6 / N;
const t1 = process.hrtime.bigint(); for (const L of Ls) ct.apply(L, 35.9, 74.3, { zone: 'mountain' }); const ms5 = Number(process.hrtime.bigint() - t1) / 1e6 / N;
ms4 < 1 ? pass('4 · speed', `${ms4.toFixed(3)} ms per answer when applied (192 hours); ${ms5.toFixed(4)} ms in a zone not served`) : fail('4 · speed', ms4.toFixed(3) + ' ms');

/* 5 · no cloud: unchanged with a reason; provenance hidden */
const L5 = mk(); delete L5.hourly.cloud_cover; const T5 = L5.hourly.temperature_2m.slice(); ctT.apply(L5, 35.9, 74.3, { zone: 'mountain' });
JSON.stringify(T5) === JSON.stringify(L5.hourly.temperature_2m) && L5.agn_cloudt && /cloud_cover/.test(L5.agn_cloudt.why) ? pass('5 · answer without cloud: unchanged, reason given', L5.agn_cloudt.why) : fail('5 · no cloud', JSON.stringify(L5.agn_cloudt));
const L6 = mk(); ctT.apply(L6, 35.9, 74.3, { zone: 'mountain' }); const L7 = mk(); ctT.apply(L7, 35.9, 74.3, { zone: 'mountain', record: true });
!('agn_cloudt' in JSON.parse(JSON.stringify(L6))) && ('agn_cloudt' in JSON.parse(JSON.stringify(L7))) ? pass('5 · agn_cloudt not serialised to customers; kept in a recorded answer') : fail('5 · provenance');
console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
