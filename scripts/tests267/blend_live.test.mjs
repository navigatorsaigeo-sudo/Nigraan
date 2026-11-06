/* v91.17.267 · THE PLAINS START FROM THE MULTI-MODEL MIX: parity with the tested arm (Bk3) and no change anywhere else. No network:
   the provider is scripts/tests267/om_mock.mjs.
   A  start parity    for plains points (the locked test set when NIGRAAN_LOCKED_POINTS names a JSON list [{pid, lat, lon, elev}], else
                      four plains synop sites) x 11 days of hours x two issue times (October; June for the heat regime), the live code's
                      start temperature and dew point (blend.mjs) equal what step2_blend.py's own blend_rows()/pick() give with the same
                      weights and the same regime decision (scripts/tests267/blend_ref.py, python with numpy/pandas/scipy) to 0.01 C;
                      without python the stored reference (blend_ref_fixture.json, made by the same script) is used and said so.
                      The same through applyToLocation on a page-shaped answer in PKT (time-zone alignment, 2-decimal start).
   B  chain parity    the full served chain (verification.correctResponse, national pool members passed as the server does) with the
                      members row equals the chain run on the same answer with best_match's temperature, dew point and humidity replaced
                      by that start (byte-identical once the operator-only basis.start is removed); the basis says 'multi-model mix'.
   C  v266 identity   (NIGRAAN_V266_ROOT = a v266 install; skipped without it) the /px proxy of v266 and of this install, same mocked
                      provider, same frozen clock: coast, hills and mountain requests byte-identical and no members call for them; a
                      plains request with __noblend=1, and every plains request with NIGRAAN_BLEND=0, byte-identical to v266; a plains
                      request without it carries the mix (basis.start) and one members call.
   usage: node scripts/tests267/blend_live.test.mjs   [env NIGRAAN_V266_ROOT=<v266 nigraan-local>, NIGRAAN_LOCKED_POINTS=<json>, PYTHON=python3] */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { omAnswer } from './om_mock.mjs';
import { parseWeights, blendHour, applyToLocation, MODEL_IDS, rhReplay } from '../../server/api/blend.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), APP = join(HERE, '..', '..'), DATA = join(APP, 'data');
let pass = 0, fail = 0, skip = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info ? ' :: ' + String(info).slice(0, 400) : '')); } };
const sk = (name, why) => { skip++; console.log('SKIP ' + name + ' :: ' + why); };
const WFILE = join(DATA, 'blend-weights-v3.json'); const W = parseWeights(JSON.parse(readFileSync(WFILE, 'utf8')));
const GATE = JSON.parse(readFileSync(join(DATA, 'blend-gate.json'), 'utf8'));
const NOWS = [Date.parse('2026-10-15T07:20:00Z'), Date.parse('2026-06-03T04:40:00Z')];
const POINTS = process.env.NIGRAAN_LOCKED_POINTS ? JSON.parse(readFileSync(process.env.NIGRAAN_LOCKED_POINTS, 'utf8')).map((p) => ({ pid: p.pid, lat: +p.lat, lon: +p.lon, elev: p.elev == null ? null : +p.elev }))
  : [{ pid: 'syn:41640 Lahore', lat: 31.55, lon: 74.333, elev: 214 }, { pid: 'syn:41675 Multan', lat: 30.203, lon: 71.419, elev: 122 },
     { pid: 'syn:41700 Bahawalpur', lat: 29.4, lon: 71.783, elev: 112 }, { pid: 'syn:41630 Faisalabad', lat: 31.433, lon: 73.1, elev: 184 }];
const IDS = Object.values(MODEL_IDS).join(',');
const SHORT = Object.fromEntries(Object.entries(MODEL_IDS).map(([s, id]) => [id, s]));
const membersQ = (p) => ({ latitude: String(p.lat), longitude: String(p.lon), elevation: String(Math.round(p.elev)), hourly: 'temperature_2m,dew_point_2m', models: IDS, forecast_days: '8', past_days: '4', timezone: 'GMT' });
/* the lead days of the replay geometry, written here independently of blend.mjs: hours 24L-12 .. 24L+11 ahead are lead L */
const leadsOf = (tMs, now) => { const N = Math.floor(((tMs - now) / 3600e3 + 12) / 24); return N <= 1 ? [1] : N === 4 ? [3, 5] : N >= 5 ? [5] : [N]; };

/* ── A · start parity ── */
ok(GATE.zones && GATE.zones.plains === true && !GATE.zones.coast && !GATE.zones.hills && !GATE.zones.mountain, 'gate file: plains only (coast KEEP A, hills and mountain unchanged)', JSON.stringify(GATE.zones));
const cases = [], pyRows = [];
for (const now of NOWS) for (const p of POINTS) {
  const M = omAnswer(membersQ(p), now); const H = M.hourly;
  H.time.forEach((t, i) => { const tMs = Date.parse(t + 'Z'); const T = {}, Td = {};
    for (const [id, s] of Object.entries(SHORT)) { T[s] = H['temperature_2m_' + id][i]; Td[s] = H['dew_point_2m_' + id][i]; }
    const js = blendHour(W, 'plains', tMs, now, T, Td);
    const refs = leadsOf(tMs, now).map((L) => { pyRows.push({ zone: 'plains', ts: tMs, L, t: T, td: Td }); return pyRows.length - 1; });
    cases.push({ now, p, tMs, js, refs }); });
}
let REF = null, refFrom = null; const FIX = join(HERE, 'blend_ref_fixture.json');
{ const dir = mkdtempSync(join(tmpdir(), 'blend267-')); const fin = join(dir, 'in.json'), fout = join(dir, 'out.json');
  writeFileSync(fin, JSON.stringify({ weights: WFILE, rows: pyRows }));
  const r = spawnSync(process.env.PYTHON || 'python3', ['-I', join(HERE, 'blend_ref.py'), fin, fout], { encoding: 'utf8', timeout: 600e3 });
  if (r.status === 0 && existsSync(fout)) { REF = JSON.parse(readFileSync(fout, 'utf8')).rows; refFrom = 'step2_blend.py run now (' + String(r.stdout).trim() + ')';
    if (process.env.NIGRAAN_WRITE_FIXTURE === '1') writeFileSync(FIX, JSON.stringify({ made: new Date().toISOString(), weightsSha256: GATE.weightsSha256, rows: REF })); }
  else if (existsSync(FIX)) { const F = JSON.parse(readFileSync(FIX, 'utf8')); REF = F.rows; refFrom = 'the stored reference ' + F.made + ' (python unavailable: ' + String(r.stderr || r.error || '').trim().slice(0, 120) + ')'; }
  rmSync(dir, { recursive: true, force: true }); }
if (!REF) sk('A start parity', 'no python reference and no stored fixture');
else {
  console.log('  reference: ' + refFrom);
  let n = 0, nb = 0, nHot = 0, nL4 = 0, worstT = 0, worstD = 0; const bad = [], sets = {}, Ls = {}, hotByNow = {};
  for (const c of cases) {
    const R = c.refs.map((k) => REF[k]); const got = R.filter((r) => r.bt != null);
    const exp = got.length ? { t: got.reduce((a, r) => a + r.bt, 0) / got.length, td: got.reduce((a, r) => a + r.bd, 0) / got.length } : null;
    n++; if (c.refs.length === 2) nL4++;
    if (!exp || !c.js) { if (!!exp !== !!c.js) bad.push([c.p.pid, new Date(c.tMs).toISOString(), 'blended in one only', exp, c.js]); continue; }
    nb++; const dT = Math.abs(exp.t - c.js.t), dD = Math.abs(exp.td - c.js.td); worstT = Math.max(worstT, dT); worstD = Math.max(worstD, dD);
    if (dT > 0.01 || dD > 0.01) bad.push([c.p.pid, new Date(c.tMs).toISOString(), exp, c.js.t, c.js.td]);
    if (R[0].hot !== c.js.hot) bad.push([c.p.pid, new Date(c.tMs).toISOString(), 'regime', R[0].hot, c.js.hot]);
    const pySets = got.map((r) => r.used).join(','), jsSets = c.js.mix.map((x) => x.set).join(','); if (pySets !== jsSets) bad.push([c.p.pid, new Date(c.tMs).toISOString(), 'set', pySets, jsSets]);
    if (c.js.hot) { nHot++; hotByNow[c.now] = (hotByNow[c.now] || 0) + 1; }
    for (const x of c.js.mix) { sets[W.sets[x.set].length] = (sets[W.sets[x.set].length] || 0) + 1; Ls[x.L] = (Ls[x.L] || 0) + 1; }
  }
  ok(!bad.length && nb > 0, `A start parity: ${POINTS.length} plains points x ${NOWS.length} issue times, ${n} hours (${nb} mixed), temperature and dew point = step2_blend.py to 0.01 C (worst ${worstT.toFixed(4)} / ${worstD.toFixed(4)} C), same regime and model set at every hour`, JSON.stringify(bad.slice(0, 4)));
  ok(nHot > 0 && Object.keys(hotByNow).length === 2 && nb < n, `A the comparison covers the heat regime (${nHot} hot hours, both issue times), hours with no complete set (${n - nb}, best_match kept) and lead day 4 (${nL4} hours = mean of the L3 and L5 mixes)`, JSON.stringify({ nHot, hotByNow, nL4 }));
  ok(Object.keys(sets).length >= 4 && [1, 2, 3, 5].every((L) => Ls[L] > 0), 'A nested sets used ' + JSON.stringify(sets) + ' (models: hours), leads ' + JSON.stringify(Ls), JSON.stringify({ sets, Ls }));
  /* the same through the code that writes the start into a page-shaped answer (PKT hours, 2 decimals) */
  const now = NOWS[0]; let m = 0, worst = 0, badA = 0, rhBad = 0;
  for (const p of POINTS) {
    const page = omAnswer({ latitude: String(p.lat), longitude: String(p.lon), elevation: String(p.elev), hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m', past_days: '3', forecast_days: '7', timezone: 'Asia/Karachi' }, now);
    const r = applyToLocation(page, omAnswer(membersQ(p), now), { zone: 'plains', nowMs: now, W });
    page.hourly.time.forEach((t, i) => { const tMs = Date.parse(t + 'Z') - 18000e3; const c = cases.find((x) => x.now === now && x.p === p && x.tMs === tMs); if (!c || !c.js) return;
      const R = c.refs.map((k) => REF[k]).filter((x) => x.bt != null); const e = R.reduce((a, x) => a + x.bt, 0) / R.length;
      const d = Math.abs(page.hourly.temperature_2m[i] - e); worst = Math.max(worst, d); m++; if (d > 0.01) badA++;
      if (page.hourly.relative_humidity_2m[i] !== rhReplay(page.hourly.temperature_2m[i], page.hourly.dew_point_2m[i])) rhBad++; });
    if (!r.applied) badA++;
  }
  ok(m > 0 && !badA && !rhBad, `A applyToLocation on a PKT page answer: ${m} start hours = step2_blend.py to 0.01 C (worst ${worst.toFixed(4)}), humidity from the start pair by the replay's formula`, JSON.stringify({ badA, rhBad }));
}

/* ── B · chain parity ── */
{
  const NOW = NOWS[0]; const realNow = Date.now; Date.now = () => NOW;
  Object.assign(process.env, { NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0', NIGRAAN_PYJOBS: '0' });
  const quiet = console.log; console.log = () => {};
  const { createBackend } = await import('../../server/api/index.mjs');
  const B = createBackend({ root: APP, dataDir: DATA }); await new Promise((r) => setTimeout(r, 3000));
  console.log = quiet;
  const V = B.app.verification; const need = (() => { try { return B.app.national.needVars(); } catch (_) { return []; } })();
  const HV = [...new Set(['temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'shortwave_radiation', 'precipitation', ...need])].join(',');
  let same = 0, nn = 0, prov = 0, moved = 0; const diffs = [];
  for (const p of POINTS) {
    const z = B.app.mos.zoneOfPoint(p.lat, p.lon, p.elev); if (z !== 'plains') { diffs.push(p.pid + ' is ' + z); continue; }
    const qs = new URLSearchParams({ latitude: String(p.lat), longitude: String(p.lon), elevation: String(p.elev), hourly: HV, past_days: '3', forecast_days: '7', timezone: 'Asia/Karachi', models: 'best_match' });
    const body = omAnswer(qs, NOW); const buf = Buffer.from(JSON.stringify(body));
    const nmA = omAnswer({ latitude: String(p.lat), longitude: String(p.lon), elevation: String(p.elev), hourly: 'temperature_2m', models: 'icon_seamless,gfs_seamless,meteofrance_seamless', past_days: '3', forecast_days: '7', timezone: 'Asia/Karachi' }, NOW);
    const natMem = [{ time: nmA.hourly.time, icon_seamless: nmA.hourly.temperature_2m_icon_seamless, gfs_seamless: nmA.hourly.temperature_2m_gfs_seamless, meteofrance_seamless: nmA.hourly.temperature_2m_meteofrance_seamless }];
    const row = omAnswer(B.app.blend.requestFor([{ lat: p.lat, lon: p.lon, elev: p.elev }], 3), NOW);
    const out1 = V.correctResponse(buf, qs, [], natMem, 0, false, null, false, false, [row]);
    /* the same answer with best_match's temperature, dew point and humidity replaced by the start, then the v266 path (no members) */
    const rep = JSON.parse(buf.toString()); const st = applyToLocation(JSON.parse(buf.toString()), row, { zone: 'plains', nowMs: NOW, W });
    rep.hourly.time.forEach((t, i) => { const s = st.starts[i]; if (!s) return; rep.hourly.temperature_2m[i] = s.t; rep.hourly.dew_point_2m[i] = s.td; rep.hourly.relative_humidity_2m[i] = rhReplay(s.t, s.td); });
    const out2 = V.correctResponse(Buffer.from(JSON.stringify(rep)), qs, [], natMem, 0, false, null, false, false, null);
    const j1 = JSON.parse(out1.buf.toString()); const bs = j1.agn_temperature_basis || {};
    if (bs.start && bs.start.source === 'multi-model mix' && bs.start.operatorOnly === true && bs.model === 'best_match') prov++;
    if (bs.start) delete bs.start; nn++;
    if (JSON.stringify(j1) === out2.buf.toString()) same++; else { const a = JSON.stringify(j1), b2 = out2.buf.toString(); let k = 0; while (k < a.length && a[k] === b2[k]) k++; diffs.push(p.pid + ' @' + k + ': ' + a.slice(k - 60, k + 60) + ' | ' + b2.slice(k - 60, k + 60)); }
    const j0 = JSON.parse(V.correctResponse(buf, qs, [], natMem, 0, false, null, false, false, null).buf.toString());
    if (j0.hourly.temperature_2m.some((x, i) => x !== j1.hourly.temperature_2m[i])) moved++;
  }
  ok(nn >= 3 && same === nn, `B chain parity: ${same} of ${nn} plains points, the served chain with the members row = the chain on best_match replaced by the start (byte-identical without basis.start)`, diffs.slice(0, 2).join(' || '));
  ok(prov === nn && nn > 0, `B the basis keeps model best_match and records start 'multi-model mix' (operatorOnly) at ${prov} of ${nn} points`);
  ok(moved === nn && nn > 0, `B the served curve moves with the start at ${moved} of ${nn} points (the step is live, not a no-op)`);
  /* an answer for a coast / hills / mountain place with a members row passed anyway: nothing changes (the zone is re-checked on the answer) */
  let untouched = 0, tried = 0;
  for (const p of [{ pid: 'coast', lat: 24.907, lon: 67.161, elev: 30 }, { pid: 'hills', lat: 34.183, lon: 73.25, elev: 1309 }, { pid: 'mountain', lat: 35.919, lon: 74.334, elev: 1457 }]) {
    const qs = new URLSearchParams({ latitude: String(p.lat), longitude: String(p.lon), elevation: String(p.elev), hourly: HV, past_days: '3', forecast_days: '7', timezone: 'Asia/Karachi', models: 'best_match' });
    const buf = Buffer.from(JSON.stringify(omAnswer(qs, NOW))); const row = omAnswer(B.app.blend.requestFor([p], 3), NOW);
    const a = V.correctResponse(buf, qs, [], null, 0, false, null, false, false, [row]).buf.toString(), b = V.correctResponse(buf, qs, [], null, 0, false, null, false, false, null).buf.toString();
    tried++; if (a === b) untouched++; }
  ok(untouched === tried, `B coast, hills and mountain answers are unchanged even when a members row reaches the chain (${untouched}/${tried})`);
  Date.now = realNow;
}

/* ── C · v266 identity through the proxy ── */
const V266 = process.env.NIGRAAN_V266_ROOT;
if (!V266 || !existsSync(join(V266, 'server', 'server.mjs'))) sk('C v266 identity', 'set NIGRAAN_V266_ROOT to a v266 install (a copy: the servers write their data folder)');
else {
  const NOW = NOWS[0]; const port0 = 20000 + Math.floor(Math.random() * 20000);
  const H = { 'Sec-Fetch-Site': 'same-origin' };
  const HV = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,cloud_cover,wind_speed_10m,precipitation';
  const req = (pts, extra = {}) => '/px/v1/forecast?' + new URLSearchParams({ __omhost: 'api.open-meteo.com', latitude: pts.map((p) => p.lat).join(','), longitude: pts.map((p) => p.lon).join(','), elevation: pts.map((p) => p.elev).join(','),
    hourly: HV, current: 'temperature_2m,relative_humidity_2m', forecast_days: '7', timezone: 'Asia/Karachi', ...extra }).toString();
  const COAST = { lat: 24.907, lon: 67.161, elev: 30 }, HILLS = { lat: 34.183, lon: 73.25, elev: 1309 }, MOUNT = { lat: 35.919, lon: 74.334, elev: 1457 };
  const PL = POINTS.slice(0, 2), MIX = [POINTS[0], COAST, HILLS, POINTS[1]];
  const REQS = { coast: req([COAST]), hills: req([HILLS]), mountain: req([MOUNT]), plains: req([PL[0]]), plainsNb: req([PL[0]], { __noblend: '1' }), mix: req(MIX), mixNb: req(MIX, { __noblend: '1' }) };
  async function serve(root, port, env, names) {
    const dir = mkdtempSync(join(tmpdir(), 'blend267c-')); const log = join(dir, 'calls.jsonl'); writeFileSync(log, '');
    const ch = spawn(process.execPath, [join(HERE, 'proxy_child.mjs'), root, String(port), String(NOW), log], { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; ch.stderr.on('data', (d) => { err += d; });
    const out = { bodies: {}, calls: {}, err: null };
    try {
      let up = false; for (let i = 0; i < 120 && !up; i++) { await new Promise((r) => setTimeout(r, 1000)); try { const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) }); up = r.ok; } catch (_) {} }
      if (!up) throw new Error('server did not start: ' + err.slice(-300));
      for (const k of names) { const before = readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
        const r = await fetch(`http://127.0.0.1:${port}` + REQS[k], { headers: H, signal: AbortSignal.timeout(240e3) }); out.bodies[k] = r.status + ' ' + await r.text();
        out.calls[k] = readFileSync(log, 'utf8').split('\n').filter(Boolean).slice(before).map((l) => JSON.parse(l)); }
      try { const s = await fetch(`http://127.0.0.1:${port}/api/mos/blend`); out.status = await s.json(); } catch (_) {}
    } catch (e) { out.err = String(e.message || e); }
    ch.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 1500)); try { ch.kill('SIGKILL'); } catch (_) {}
    rmSync(dir, { recursive: true, force: true }); return out;
  }
  const memberCalls = (calls) => (calls || []).filter((c) => /ecmwf_ifs025/.test(c.models)).length;
  const locs = (b) => { const j = JSON.parse(b.slice(4)); return Array.isArray(j) ? j : [j]; };
  const A = await serve(V266, port0, {}, ['coast', 'hills', 'mountain', 'plains', 'mix']);
  const Bv = await serve(APP, port0 + 1, {}, ['coast', 'hills', 'mountain', 'plains', 'plainsNb', 'mix', 'mixNb']);
  const Cv = await serve(APP, port0 + 2, { NIGRAAN_BLEND: '0' }, ['plains', 'mix']);
  if (A.err || Bv.err || Cv.err) ok(false, 'C servers ran', [A.err, Bv.err, Cv.err].filter(Boolean).join(' | '));
  else {
    for (const k of ['coast', 'hills', 'mountain']) ok(A.bodies[k] === Bv.bodies[k] && memberCalls(Bv.calls[k]) === 0 && A.bodies[k].startsWith('200'), `C ${k}: v267 answer byte-identical to v266 (${A.bodies[k].length} bytes), no members call`, A.bodies[k].slice(0, 200) + ' || ' + Bv.bodies[k].slice(0, 200));
    ok(A.bodies.plains === Bv.bodies.plainsNb && memberCalls(Bv.calls.plainsNb) === 0, 'C plains with __noblend=1: byte-identical to v266, no members call');
    ok(A.bodies.mix === Bv.bodies.mixNb, 'C a 4-place request (2 plains, coast, hills) with __noblend=1: byte-identical to v266');
    ok(A.bodies.plains === Cv.bodies.plains && A.bodies.mix === Cv.bodies.mix && memberCalls(Cv.calls.plains) + memberCalls(Cv.calls.mix) === 0, 'C NIGRAAN_BLEND=0: plains and the 4-place request byte-identical to v266, no members call');
    const pl = locs(Bv.bodies.plains)[0], pl0 = locs(A.bodies.plains)[0];
    ok(pl.agn_temperature_basis && pl.agn_temperature_basis.start && pl.agn_temperature_basis.start.source === 'multi-model mix' && memberCalls(Bv.calls.plains) === 1 && JSON.stringify(pl.hourly.temperature_2m) !== JSON.stringify(pl0.hourly.temperature_2m),
      'C plains (default): one members call (9 models, temperature and dew point), basis.start = multi-model mix, the curve differs from v266', JSON.stringify({ calls: Bv.calls.plains, start: pl.agn_temperature_basis && pl.agn_temperature_basis.start }));
    const mB = locs(Bv.bodies.mix), mA = locs(A.bodies.mix);
    ok(JSON.stringify(mB[1]) === JSON.stringify(mA[1]) && JSON.stringify(mB[2]) === JSON.stringify(mA[2]) && !!(mB[0].agn_temperature_basis.start && mB[3].agn_temperature_basis.start)
      && (() => { const asked = (Bv.calls.mix || []).filter((c) => /ecmwf_ifs025/.test(c.models)).flatMap((c) => c.lats.split(',').map(Number));
        return asked.length === 1 && Math.abs(asked[0] - POINTS[1].lat) < 1e-3; })(),
      'C 4-place request: the coast and hills places byte-identical to v266, both plains places mixed; members asked for the one plains place not yet cached (the other came from the per-place cache), never for coast or hills', JSON.stringify(Bv.calls.mix));
    const mc = (Bv.calls.plains || []).find((c) => /ecmwf_ifs025/.test(c.models)) || {};
    ok(mc.models === Object.values(MODEL_IDS).join(',') && mc.hourly === 'temperature_2m,dew_point_2m', 'C the members call asks fetch_multimodel.py\'s model ids and variables: ' + mc.models, JSON.stringify(mc));
    ok(Bv.status && Bv.status.on && Bv.status.budget && Bv.status.budget.spentToday > 0 && Bv.status.budget.cap === 500000, 'C /api/mos/blend: on, budget spent ' + (Bv.status && Bv.status.budget && Bv.status.budget.spentToday) + ' of cap ' + (Bv.status && Bv.status.budget && Bv.status.budget.cap), JSON.stringify(Bv.status));
  }
}
console.log(`\n${fail ? 'FAIL' : 'PASS'} blend_live: ${pass} passed, ${fail} failed, ${skip} skipped`); process.exit(fail ? 1 : 0);
