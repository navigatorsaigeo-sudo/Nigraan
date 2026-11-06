/* v91.17.270 · FIT agent · server/api/tdown.mjs (B2/B5 downscaling module) and its wiring.
   1 OFF by default: without NIGRAAN_TDOWN=1 apply() changes nothing; the chain stage list carries tdown but it runs only when on.
   2 Zone gate: switched on, a zone not in data/tdown-b2.json servedZones is left as it is.
   3 Parity: the JS arithmetic (profile terms, sun on slope, surface terms, cell coefficients, station correction) reproduces the Python
     fitted table on station-hours from the real profile pack (fixtures/tdown_vectors.json, made by nig/ds2/make_tdown_vectors.py).
   4 Speed: one place, 8 days hourly, all terms: < 1 ms per place after the first call (the per-place lookups are cached).
   5 Inputs missing (a plain answer without the pressure levels): left unchanged, with the reason.
   usage: node scripts/tests270/tdown.test.mjs   (starts no server) */
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { createTdown, REQUEST_VARS } = await import(join(ROOT, 'server/api/tdown.mjs'));
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 300) : '')); };
const COEF = join(ROOT, 'data', 'tdown-b2.json'); const VEC = join(ROOT, 'scripts', 'tests270', 'fixtures', 'tdown_vectors.json');
ok(existsSync(COEF), '0 · data/tdown-b2.json present');
const M = JSON.parse(readFileSync(COEF, 'utf8'));
const V = JSON.parse(readFileSync(VEC, 'utf8')).vectors;
const stub = (bands) => ({ value: (b) => (b in bands ? bands[b] : null) });

/* 1 · off by default */
delete process.env.NIGRAAN_TDOWN;
{ const v = V[0]; const td = createTdown({ dataDir: join(ROOT, 'data'), featGrid: stub(v.bands) });
  const loc = { elevation: v.elev, utc_offset_seconds: 0, hourly: JSON.parse(JSON.stringify(v.hourly)) }; loc.__zGrid = v.zGrid;
  const before = JSON.stringify(loc.hourly); const r = td.apply(loc, v.lat, v.lon, { zone: v.zone });
  ok(r === false && JSON.stringify(loc.hourly) === before && td.on() === false, '1 · switch off (default): nothing changes'); }
const vsrc = readFileSync(join(ROOT, 'server/api/verification.mjs'), 'utf8');
ok(/CHAIN_STAGES = \['wxmos', (?:'skillchoice', )?'tdown', 'synop', 'live'(, 't2final')?(, 'cloudt')?(, 'dewfix')?\]/.test(vsrc) && /tdown: \(\) => !!\(app\.tdown && app\.tdown\.on\(\) &&/.test(vsrc), '1 · chain stage wired behind app.tdown.on()');

/* 2 · zone gate when switched on */
process.env.NIGRAAN_TDOWN = '1';
{ const tmp = mkdtempSync(join(tmpdir(), 'tdown-')); writeFileSync(join(tmp, 'tdown-b2.json'), JSON.stringify({ ...M, servedZones: { t: [], td: [] } }));
  const v = V[0]; const td = createTdown({ dataDir: tmp, featGrid: stub(v.bands) });
  const loc = { elevation: v.elev, utc_offset_seconds: 0, hourly: JSON.parse(JSON.stringify(v.hourly)) }; loc.__zGrid = v.zGrid;
  const r = td.apply(loc, v.lat, v.lon, { zone: v.zone }); ok(r === false && /gate/.test(loc.agn_tdown.why), '2 · on, zone not passed: unchanged', loc.agn_tdown.why); }

/* 3 · parity with the Python table */
{ let worst = 0, n = 0;
  for (const v of V) { const td = createTdown({ dataDir: join(ROOT, 'data'), featGrid: stub(v.bands) }); const m = td.model();
    const P = td.place(m, v.lat, v.lon, v.elev); const ts = Date.parse(v.hourly.time[0] + 'Z');
    const d = td.delta(m, 't', v.zone, v.hourly, 0, P, v.elev, v.zGrid, v.lat, v.lon, ts);
    if (d == null) continue; n++; worst = Math.max(worst, Math.abs(d - v.expect)); }
  ok(n === V.length && worst < 0.02, `3 · JS delta = Python fitted table on ${n} of ${V.length} station-hours from the pack (max |diff| ${worst.toFixed(4)} C)`);
  /* the served path (apply, forced on) gives the same hour-0 value: start + delta, rounded to 0.1 */
  let bad = 0, m2 = 0; for (const v of V.slice(0, 100)) { const td = createTdown({ dataDir: join(ROOT, 'data'), featGrid: stub(v.bands) });
    const loc = { elevation: v.elev, utc_offset_seconds: 0, hourly: JSON.parse(JSON.stringify(v.hourly)) }; loc.__zGrid = v.zGrid;
    const t0 = loc.hourly.temperature_2m[0]; td.apply(loc, v.lat, v.lon, { zone: v.zone, force: true }); m2++;
    if (Math.abs(loc.hourly.temperature_2m[0] - Math.round((t0 + v.expect) * 10) / 10) > 0.051) bad++; }
  ok(bad === 0, `3 · apply() (the served path) = start + the Python delta on ${m2} station-hours`, bad); }

/* 4 · speed: 8 days hourly at one place, all terms, forced on */
{ const v = V[0]; const td = createTdown({ dataDir: join(ROOT, 'data'), featGrid: stub(v.bands) });
  const H = { time: [] }; for (const k of REQUEST_VARS) H[k] = []; const t0 = Date.parse(v.hourly.time[0] + 'Z');
  /* the vector's two real hours repeated; direct and diffuse radiation set to 0 while the sun is below the horizon (as a forecast has it) */
  const { solarPosition } = await import(join(ROOT, 'server/api/sunterrain.mjs'));
  for (let i = 0; i < 192; i++) { const ts = t0 + i * 3600e3; H.time.push(new Date(ts).toISOString().slice(0, 16)); const up = solarPosition(ts / 1000 - 1800, v.lat, v.lon).elevation > 0;
    for (const k of REQUEST_VARS) H[k].push(/radiation/.test(k) && !up ? 0 : v.hourly[k][i % 2]); }
  const mk = () => { const l = { elevation: v.elev, utc_offset_seconds: 0, hourly: JSON.parse(JSON.stringify(H)) }; l.__zGrid = v.zGrid; return l; };
  for (let w = 0; w < 20; w++) td.apply(mk(), v.lat, v.lon, { zone: v.zone, force: true });   // warm (JIT, the place's cached lookups)
  const N = 40, runs = []; let locs = null;
  for (let r = 0; r < 7; r++) { locs = Array.from({ length: N }, mk); const s = process.hrtime.bigint();
    for (const l of locs) td.apply(l, v.lat, v.lon, { zone: v.zone, force: true }); runs.push(Number(process.hrtime.bigint() - s) / 1e6 / N); }
  const ms = runs.sort((a, b) => a - b)[3];   // median of 7 batches (the machine is shared)
  ok(ms < 1.0 && locs[0].agn_tdown.applied, `4 · ${ms.toFixed(3)} ms per place (192 hours, T and Td, all terms incl. sun on slope by day)`); }

/* 5 · inputs missing */
{ const v = V[0]; const td = createTdown({ dataDir: join(ROOT, 'data'), featGrid: stub(v.bands) });
  const loc = { elevation: v.elev, utc_offset_seconds: 0, hourly: { time: v.hourly.time, temperature_2m: v.hourly.temperature_2m.slice(), dew_point_2m: v.hourly.dew_point_2m.slice() } };
  const r = td.apply(loc, v.lat, v.lon, { zone: v.zone, force: true }); ok(r === false && /inputs missing/.test(loc.agn_tdown.why), '5 · a plain answer without the profile: unchanged, reason given', loc.agn_tdown.why); }
delete process.env.NIGRAAN_TDOWN;
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
