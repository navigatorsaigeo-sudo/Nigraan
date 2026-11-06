/* v91.17.271 · T2 agent · server/api/t2final.mjs (B2 v2 final correction of the served temperature) and its wiring.
   1 OFF by default: without NIGRAAN_T2FINAL=1 apply() changes nothing; the chain stage list carries t2final last, behind app.t2final.on().
   2 Zone gate: switched on, a zone not in data/t2final-b2v2.json servedZones (empty today) is left as it is.
   3 Parity: the JS terms (through tdown.mjs: live lapse, inversion, clear-calm, cold pool, sun on slope, coast) and the correction
     reproduce the Python b2v2_pairs.py / b2v2_export.py values on 300 real pack station-hours (fixtures/t2final_vectors.json).
   4 Speed: one place, 8 days hourly, forced on: < 1 ms per place after warm-up (median of 7 batches of 40, as tests270/tdown).
   5 Inputs missing (a plain answer without the pressure levels): left unchanged, with the reason.
   6 Provenance (agn_t2final) is operator-only: not in the customer JSON, kept when the chain records.
   usage: node scripts/tests271/t2final.test.mjs   (starts no server) */
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { createTdown, REQUEST_VARS } = await import(join(ROOT, 'server/api/tdown.mjs'));
const { createT2final, TERMS } = await import(join(ROOT, 'server/api/t2final.mjs'));
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 300) : '')); };
const COEF = join(ROOT, 'data', 't2final-b2v2.json'); ok(existsSync(COEF), '0 · data/t2final-b2v2.json present');
const M = JSON.parse(readFileSync(COEF, 'utf8'));
ok(Array.isArray(M.servedZones) && M.servedZones.length === 0, '0 · servedZones empty (no zone passed the gate)', JSON.stringify(M.servedZones));
const V = JSON.parse(readFileSync(join(ROOT, 'scripts/tests271/fixtures/t2final_vectors.json'), 'utf8')).vectors;
const stub = (bands) => ({ value: (b) => (b in bands ? bands[b] : null) });
const mk = (v, dataDir = join(ROOT, 'data')) => { const td = createTdown({ dataDir: join(ROOT, 'data'), featGrid: stub(v.bands) }); return { td, tf: createT2final({ dataDir, tdown: td }) }; };
const locOf = (v) => { const l = { elevation: v.elev, utc_offset_seconds: 0, hourly: JSON.parse(JSON.stringify(v.hourly)) }; l.__zGrid = v.zGrid; return l; };

/* 1 · off by default + wiring */
delete process.env.NIGRAAN_T2FINAL;
{ const v = V[0]; const { tf } = mk(v); const loc = locOf(v); const before = JSON.stringify(loc.hourly);
  ok(tf.apply(loc, v.lat, v.lon, { zone: v.zone }) === false && JSON.stringify(loc.hourly) === before && tf.on() === false, '1 · switch off (default): nothing changes'); }
const vsrc = readFileSync(join(ROOT, 'server/api/verification.mjs'), 'utf8'), isrc = readFileSync(join(ROOT, 'server/api/index.mjs'), 'utf8');
/* v91.17.273 · cloudt (forecast-cloud correction) follows t2final as the final stage (tests273/cloudt.test.mjs checks it) */
ok(/CHAIN_STAGES = \['wxmos', (?:'skillchoice', )?'tdown', 'synop', 'live', 't2final'(, 'cloudt')?(, 'dewfix')?\]/.test(vsrc) && /t2final: \(\) => !!\(app\.t2final && app\.t2final\.on\(\) &&/.test(vsrc)
   && /app\.t2final = createT2final\(\{ dataDir, tdown: app\.tdown \}\)/.test(isrc), '1 · chain stage wired after the live layer (before cloudt), behind app.t2final.on()');

/* 2 · zone gate when switched on */
process.env.NIGRAAN_T2FINAL = '1';
{ let changed = 0; for (const v of V.slice(0, 40)) { const { tf } = mk(v); const loc = locOf(v); const before = JSON.stringify(loc.hourly);
    const r = tf.apply(loc, v.lat, v.lon, { zone: v.zone }); if (r !== false || JSON.stringify(loc.hourly) !== before || !/gate/.test(loc.agn_t2final.why)) changed++; }
  ok(changed === 0, '2 · on, zone not passed (servedZones empty): 40 answers unchanged', changed); }
delete process.env.NIGRAAN_T2FINAL;

/* 3 · parity with Python (terms and correction) */
{ let worstX = 0, worstD = 0, n = 0, wk = '';
  for (const v of V) { const { td, tf } = mk(v); const m = td.model(); const P = td.place(m, v.lat, v.lon, v.elev); const ts = Date.parse(v.hourly.time[0] + 'Z');
    const r = tf.terms(v.hourly, 0, P, v.elev, v.zGrid, v.lat, v.lon, ts, M.hyper); if (!r) continue; n++;
    for (const k of TERMS) { const e = Math.abs(r.x[k] - v.x[k]); if (e > worstX) { worstX = e; wk = k + ' @ ' + v.station + ' ' + v.hourly.time[0]; } }
    const d = r.cell === v.cell ? tf.deltaOf(M, v.zone, r.cell, r.x) : NaN; worstD = Math.max(worstD, Number.isFinite(d) ? Math.abs(d - v.expect) : 9); }
  ok(n === V.length && worstX < 0.02, `3 · JS terms = Python terms on ${n} of ${V.length} pack station-hours (max |diff| ${worstX.toFixed(4)}, ${wk})`);
  ok(n === V.length && worstD < 0.005, `3 · JS correction = Python correction (max |diff| ${worstD.toFixed(5)} C)`);
  let bad = 0; for (const v of V.slice(0, 100)) { const { tf } = mk(v); const loc = locOf(v); const t0 = loc.hourly.temperature_2m[0];
    tf.apply(loc, v.lat, v.lon, { zone: v.zone, force: true }); if (Math.abs(loc.hourly.temperature_2m[0] - Math.round((t0 + v.expect) * 10) / 10) > 0.051) bad++; }
  ok(bad === 0, '3 · apply() (the served path, forced) = served + the Python correction on 100 station-hours', bad); }

/* 4 · speed: 8 days hourly at one place, forced on */
{ const v = V[0]; const { tf } = mk(v); const { solarPosition } = await import(join(ROOT, 'server/api/sunterrain.mjs'));
  const H = { time: [] }; for (const k of REQUEST_VARS) H[k] = []; const t0 = Date.parse(v.hourly.time[0] + 'Z');
  for (let i = 0; i < 192; i++) { const ts = t0 + i * 3600e3; H.time.push(new Date(ts).toISOString().slice(0, 16)); const up = solarPosition(ts / 1000 - 1800, v.lat, v.lon).elevation > 0;
    for (const k of REQUEST_VARS) H[k].push(/radiation/.test(k) && !up ? 0 : v.hourly[k][i % 2]); }
  const L = () => { const l = { elevation: v.elev, utc_offset_seconds: 0, hourly: JSON.parse(JSON.stringify(H)) }; l.__zGrid = v.zGrid; return l; };
  for (let w = 0; w < 20; w++) tf.apply(L(), v.lat, v.lon, { zone: v.zone, force: true });
  const N = 40, runs = []; let locs = null;   /* batches of 40 answers, median of 7 batches (the machine is shared), as tests270/tdown */
  for (let r = 0; r < 7; r++) { locs = Array.from({ length: N }, L); const a = process.hrtime.bigint();
    for (const l of locs) tf.apply(l, v.lat, v.lon, { zone: v.zone, force: true }); runs.push(Number(process.hrtime.bigint() - a) / 1e6 / N); }
  const med = runs.sort((a, b) => a - b)[3];
  /* cold: a place seen for the first time (new module instances: no cached place, no cached sun factors) */
  const cold = []; for (let r = 0; r < 30; r++) { const { tf: t2 } = mk(v); const l = L(); const a = process.hrtime.bigint(); t2.apply(l, v.lat, v.lon, { zone: v.zone, force: true }); cold.push(Number(process.hrtime.bigint() - a) / 1e6); }
  cold.sort((a, b) => a - b);
  ok(med < 1.0 && locs[0].agn_t2final.applied, `4 · speed: ${med.toFixed(3)} ms per place, repeat answer (192 hours, all terms incl. sun on slope by day); first answer at a new place ${cold[15].toFixed(2)} ms (place lookups + sun factors)`); }

/* 5 · inputs missing */
{ const v = V[0]; const { tf } = mk(v); const loc = { elevation: v.elev, utc_offset_seconds: 0, hourly: { time: v.hourly.time, temperature_2m: v.hourly.temperature_2m.slice() } };
  const r = tf.apply(loc, v.lat, v.lon, { zone: v.zone, force: true }); ok(r === false && /inputs missing/.test(loc.agn_t2final.why), '5 · plain answer: unchanged, reason given', loc.agn_t2final.why); }

/* 6 · provenance is operator-only: switched on, the reason is on the answer object but not in the customer JSON (unless recording) */
process.env.NIGRAAN_T2FINAL = '1';
{ const v = V[0]; const { tf } = mk(v); const a = locOf(v), b = locOf(v);
  tf.apply(a, v.lat, v.lon, { zone: v.zone }); tf.apply(b, v.lat, v.lon, { zone: v.zone, record: true });
  ok(a.agn_t2final && !/agn_t2final/.test(JSON.stringify(a)) && /agn_t2final/.test(JSON.stringify(b)), '6 · agn_t2final not serialised to customers; kept in a recorded answer'); }
delete process.env.NIGRAAN_T2FINAL;

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
