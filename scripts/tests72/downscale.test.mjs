/* v91.17.73 · AI local correction (agent A): server/api/downscale.mjs + data/downscale-model.json
   node scripts/tests72/downscale.test.mjs            (reads the install's data/ directly: NIGRAAN_DATA_DIR or ../../data)
   Checks: the module loads; residual finite at 5 points; the shadow flag matches the gate; the JS evaluator reproduces the
   Python model (self-check vectors) and the JS feature recipe reproduces the training features at station cells; no
   supplier name in any output. PASS/FAIL lines; exit 1 on any FAIL. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDownscale } from '../../server/api/downscale.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

let ds = null;
try { ds = createDownscale({ dataDir: DATA }); } catch (e) { ok(false, 'module loads: ' + e.message); }
ok(!!ds && typeof ds.residual === 'function' && typeof ds.residualDay === 'function', 'module loads (residual, residualDay, dayInputs, status)');
const M = ds.model();
ok(!!M && !!M.built && !!M.method && !!M.source && !!M.n && !!M.gate, `model file carries built / method / source / n / gate (${M && M.version})`);

/* ── 1. residual finite at 5 points ── */
const P = [
  ['Gilgit valley floor, Jan night', 35.9195, 74.3080, { month: 1, hour: 5, cloud: 5, wind: 3, sw: 90, precip: 0, servedElevM: 1480, zone: 'mountain', tmax: 8, tmin: -4 }],
  ['Skardu basin floor, Jul afternoon', 35.2970, 75.6330, { month: 7, hour: 15, cloud: 10, wind: 8, sw: 330, precip: 0, servedElevM: 2230, zone: 'mountain', tmax: 30, tmin: 15 }],
  ['Murree ridge, Oct', 33.9070, 73.3943, { month: 10, hour: 14, cloud: 20, wind: 12, sw: 200, precip: 0, servedElevM: 2150, zone: 'mountain', tmax: 18, tmin: 9 }],
  ['Lahore walled city, Jun afternoon', 31.5820, 74.3160, { month: 6, hour: 15, cloud: 5, wind: 10, sw: 330, precip: 0, servedElevM: 215, zone: 'plains', tmax: 42, tmin: 29 }],
  ['Karachi Saddar, May', 24.8560, 67.0290, { month: 5, hour: 13, cloud: 10, wind: 18, sw: 310, precip: 0, servedElevM: 10, zone: 'coast', tmax: 35, tmin: 28 }],
];
const outs = [];
for (const [nm, la, lo, o] of P) {
  const r = ds.residual(la, lo, o); outs.push(r);
  ok(fin(r.dT) && fin(r.dTx) && fin(r.dTn) && Math.abs(r.dT) <= (M.capC ?? 4), `${nm}: dT ${r.dT} (dTx ${r.dTx}, dTn ${r.dTn}) finite, |dT| <= cap; shadow ${r.shadow}, applied ${r.applied}`);
}

/* ── 2. the shadow flag matches the gate ── */
ok(M.shadow === !M.gate.passed, `model shadow ${M.shadow} = !gate.passed (${M.gate.passed})`);
ok(outs.every((r) => r.shadow === !M.gate.passed), 'every residual() carries shadow = !gate.passed');
ok(outs.every((r) => !(r.shadow && r.applied)), 'a shadow residual is never marked applied');
if (!M.gate.passed) ok(M.applyZones.length === 0, 'gate failed -> no zone applied');
else ok(outs.filter((r, i) => !M.applyZones.includes(P[i][3].zone)).every((r) => r.dT === 0 && !r.applied), 'a zone outside applyZones returns dT 0, not applied');
ok(ds.status().shadow === !!M.shadow && ds.status().label === 'AI local correction (terrain and land surface)', `status(): shadow ${ds.status().shadow}, generic label`);

/* ── 3. the JS evaluator reproduces the Python model ── */
const grp = { Z: 'zone', P: 'best_match' };
let worst = 0, n = 0;
for (const c of M.selfcheck.model) {
  const part = M.models[grp[c.group]][c.part === 'x' ? 'day' : 'night'];
  const y = ds._eval.evalPart(part, c.x); worst = Math.max(worst, Math.abs(y - c.y)); n++;
}
ok(n >= 40 && worst < 2e-3, `JS model evaluation = Python on ${n} self-check vectors (max |diff| ${worst.toExponential(2)} C)`);

/* ── 4. the JS feature recipe reproduces the training features at station cells ── */
for (const s of M.selfcheck.static) {
  const f = ds.features(s.lat, s.lon, { date: s.day, servedElevM: s.srvElevM });
  const bad = Object.entries(s.x).filter(([k, v]) => v != null && (f[k] == null || Math.abs(f[k] - v) > 1e-3 * Math.max(1, Math.abs(v))));
  ok(bad.length === 0, `features at training cell ${s.pid.replace(/^[a-z]+:/, 'site ')}: ${Object.keys(s.x).length} recipe values match${bad.length ? ' — differ: ' + bad.map(([k, v]) => `${k} js ${f[k]} py ${v}`).join('; ') : ''}`);
}

/* ── 5. dayInputs from an hourly block ── */
const t0 = Date.UTC(2026, 0, 14, 19); const ts = [], H = { temperature_2m: [], cloud_cover: [], wind_speed_10m: [], shortwave_radiation: [], precipitation: [] };
for (let h = 0; h < 48; h++) { ts.push(t0 + h * 3600e3); H.temperature_2m.push(2 + 6 * Math.sin((h - 3) / 24 * 2 * Math.PI)); H.cloud_cover.push(10); H.wind_speed_10m.push(4); H.shortwave_radiation.push(h % 24 > 1 && h % 24 < 12 ? 300 : 0); H.precipitation.push(0); }
const di = ds.dayInputs(ts, H); const d1 = di.get('2026-01-15');
ok(!!d1 && fin(d1.tmax) && fin(d1.cloudNight) && d1.cloudDay === 10 && d1.precip === 0, `dayInputs: 2 Pakistan days, 2026-01-15 tmax ${d1 && d1.tmax.toFixed(1)} cloudNight ${d1 && d1.cloudNight}`);
const rd = ds.residualDay(35.9195, 74.3080, { ...d1, servedElevM: 1480, zone: 'mountain' });
ok(fin(rd.dTx) && fin(rd.dTn), `residualDay from dayInputs finite (dTx ${rd.dTx}, dTn ${rd.dTn})`);

/* ── 6. no supplier names in any output ── */
const forb = JSON.parse(readFileSync(join(DATA, 'source-labels.json'), 'utf8')).forbiddenInCustomerOutput || [];
const text = JSON.stringify([outs, rd, ds.status()]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hits = forb.filter((w) => new RegExp('(^|[^A-Za-z0-9])' + esc(w) + '([^A-Za-z0-9]|$)').test(text));
ok(hits.length === 0, `no supplier name in residual / status output (${forb.length} names checked)${hits.length ? ': ' + hits.join(', ') : ''}`);
const mt = readFileSync(join(DATA, 'downscale-model.json'), 'utf8');
const hitsM = forb.filter((w) => new RegExp('(^|[^A-Za-z0-9])' + esc(w) + '([^A-Za-z0-9]|$)').test(mt));
ok(hitsM.length === 0, `no supplier name anywhere in data/downscale-model.json${hitsM.length ? ': ' + hitsM.join(', ') : ''}`);
ok(!/MACH-verified|tier A/i.test(text), 'never labelled MACH-verified or tier A (tier B: station-trained)');

console.log(fails ? `\n${fails} FAIL` : '\nall PASS');
process.exit(fails ? 1 : 0);
