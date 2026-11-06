/* v91.17.283.25 . THE EWS LIVE ANCHOR IN SHADOW (server/api/ewsanchor.mjs + ewsshadow.mjs, scripts/agents/verify.mjs EWS-ANCHOR SHADOW, exp_pointer ews-anchor-live),
   offline (no server, no provider):
     E1  the shadow never changes a served value: the national run records are byte-identical after an hour's computation, the module is wired
         into no served chain (verification / point / national / pointstate / engine / report never read it), the model file says shadow,
         live false, no serving hook, and the page's slim gate does not carry the operator-only register entry
     E2  coefficients: data/ews-live-anchor.json is the retrain candidate (variogram, radius, fade, held-out result) and names its test files by sha256
     E3  missing EWS (no copied file) and stale EWS (newest reading older than fade_hours, 6 h) give no anchor, with the reason; a reading
         5 h old anchors with the fade weight 1/6; the anchor fades as tested (weight 0.5 three hours after the reading)
     E4  the archive records both: one gzip member per hour with, per EWS station, the reading and the served basis, and, per tehsil and
         per scoring station, the served value and the anchor; a second tick in the same hour writes nothing
     E5  the verification holds each EWS station out of its own anchor (its own residual never reaches it) and scores served against served
         + anchor at the other stations; the ledger cells and the summary carry both
     E6  the pre-registered rule: fewer than 14 scored days -> not met; 14 days with a positive gain -> rule passed but no promotion while
         no serving hook exists; the owner's approve command refuses it; with a hook it flips "live" and revert restores the file byte for byte
   usage: node scripts/tests28325/ewsanchor.unit.test.mjs */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const EA = { ...(await import(pathToFileURL(join(API, 'ewsanchor.mjs')).href)), ...(await import(pathToFileURL(join(API, 'ewsshadow.mjs')).href)) };
const VF = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'verify.mjs')).href);
const PTR = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'exp_pointer.mjs')).href);
const H = 3600e3, sha = (b) => createHash('sha256').update(b).digest('hex');

const T = mkdtempSync(join(tmpdir(), 'v28325-ews-')); const DATA = join(T, 'data'), COP = join(T, 'copies'); mkdirSync(DATA, { recursive: true });
for (const f of ['ews-live-anchor.json', 'obs-qc-params.json']) copyFileSync(join(ROOT, 'data', f), join(DATA, f));
writeFileSync(join(DATA, 'mach-fleet-stations.json'), JSON.stringify({ stations: [{ key: 'gilgit', lat: 35.92, lon: 74.31 }, { key: 'far', lat: 30.0, lon: 70.0 }] }));
writeFileSync(join(DATA, 'synop-stations.json'), JSON.stringify({ stations: {} }));
const M = EA.loadAnchorModel(DATA);

/* ── E2 · the coefficients ── */
{ const C = JSON.parse(readFileSync(join(ROOT, 'data', 'evidence', 'ewsanchor', 'candidate-ews-live-anchor.json'), 'utf8')); const F = JSON.parse(readFileSync(join(ROOT, 'data', 'ews-live-anchor.json'), 'utf8'));
  const same = ['radius_km', 'min_stations', 'exclude_within_km', 'fade_hours'].every((k) => F[k] === C[k]) && JSON.stringify(F.variogram) === JSON.stringify(C.variogram) && F.version === C.version && F.heldOut.gain === C.heldOut.gain && F.heldOut.lo95 === C.heldOut.lo95;
  const refs = ['candidate', 'results', 'gates', 'method'].every((k) => { const r = F.testReference[k]; return r && existsSync(join(ROOT, r.file)) && sha(readFileSync(join(ROOT, r.file))) === r.sha256; });
  const rules = sha(readFileSync(join(ROOT, 'data', 'evidence', 'ewsanchor', 'RULES_IFSMOS_20261027.json'))) === 'a8711aef0abfef4210e5f540abb9d8ced08716a308eb04aedbd98b1faaea44eb';
  const lapse = /LAPSE_K_PER_M = 0\.0065/.test(readFileSync(join(ROOT, 'scripts', 'agents', 'verify.mjs'), 'utf8')) && F.lapse_k_per_m === 0.0065;
  ok(same && refs && rules && lapse, 'E2 the model file carries the retrain candidate (variogram 0.89 / 6.808 / 87 km, radius 40, fade 6 h, held-out gain 1.934 [1.297, ...]) and its test files by sha256; lapse = the verification agent\'s', JSON.stringify({ same, refs, rules, lapse })); }

/* ── a world: four EWS stations around Gilgit, 24 h of readings, one national run ── */
const NOW = Math.floor(Date.now() / H) * H + 20 * 60e3;   /* 20 min past an hour */
const ST = [{ id: '1', name: 'A_AWS', lat: 35.95, lon: 74.40, el: 2400 }, { id: '2', name: 'B_AWS', lat: 36.05, lon: 74.30, el: 2900 }, { id: '3', name: 'C_AWS', lat: 35.85, lon: 74.55, el: 3300 }, { id: '4', name: 'D_AWS', lat: 36.10, lon: 74.60, el: 4100 }];
const place = (lat, lon) => { const s = ST.find((x) => Math.abs(x.lat - lat) < 1e-6 && Math.abs(x.lon - lon) < 1e-6); return { uid: lat > 33 ? 'GB|Gilgit|Gilgit' : 'PB|X|Y', elevM: s ? s.el : 1500 }; };
mkdirSync(join(COP, 'data', 'pmd', 'ews_live', 'raw'), { recursive: true });
writeFileSync(join(COP, 'data', 'pmd', 'aegis_gb_station_catalog.csv'), 'stationId,stationName,n_elements,latitude,longitude,altitude\n' + ST.map((s) => [s.id, s.name, 6, s.lat, s.lon, ''].join(',')).join('\n') + '\n');
const sp = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
/* every station reads 4 C above the served basis at its height (a cold-biased forecast), with a small daily wave */
const basis = (ms) => 10 + 3 * Math.sin(2 * Math.PI * (ms / H % 24) / 24);
function writeEws(lastAgeH) {
  for (const f of readdirSync(join(COP, 'data', 'pmd', 'ews_live', 'raw'))) rmSync(join(COP, 'data', 'pmd', 'ews_live', 'raw', f));
  if (lastAgeH == null) return; const by = new Map();
  for (let ms = NOW - lastAgeH * H - 30 * H; ms <= NOW - lastAgeH * H; ms += 10 * 60e3) for (const s of ST) { const v = basis(Math.round(ms / H) * H) - 0.0065 * (s.el - 2000) + 4 + 0.05 * Math.sin(ms / 7e5 + Number(s.id));
    const d = new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''); (by.get(d) || by.set(d, []).get(d)).push([v.toFixed(2), sp(ms), 9000 + Number(s.id), s.id, s.name, 'Air Temperature', '°C'].join(','));
    (by.get(d)).push(['55.0', sp(ms), 8000 + Number(s.id), s.id, s.name, 'Relative Humidity', '%'].join(',')); }
  for (const [d, L] of by) writeFileSync(join(COP, 'data', 'pmd', 'ews_live', 'raw', 'ews_raw_' + d + '.csv.gz'), gzipSync('value,time_utc,element_id,station_id,station,element,unit\n' + L.join('\n') + '\n'));
}
/* the national run: hourly from 40 h ago to 72 h ahead, served height 2000 m (Gilgit tehsil) and 200 m (a plains tehsil) */
const base = Math.floor(NOW / H) * H - 40 * H; const time = [], TT = []; for (let k = 0; k < 112; k++) { time.push(new Date(base + k * H).toISOString().slice(0, 16) + ':00Z'); TT.push(Math.round(basis(base + k * H) * 10) / 10); }
const STORE = { runs: [{ run_id: 'R1', unit_level: 'tehsil', status: 'complete', base_valid_time: new Date(base).toISOString(), completed_at: new Date(base + 600e3).toISOString() }],
  records: [{ runId: 'R1', unitKey: 'GB|Gilgit|Gilgit', lat: 35.92, lon: 74.31, resolvedElevationM: 2000, temperatureBasis: { elevM: 2000 }, hourly: { time, temperature_2m: TT.slice() } },
    { runId: 'R1', unitKey: 'PB|X|Y', lat: 31.5, lon: 74.3, resolvedElevationM: 200, temperatureBasis: { elevM: 200 }, hourly: { time, temperature_2m: TT.map((x) => x + 15) } }] };
const store = { all: (c) => STORE[c], filter: (c, fn) => STORE[c].filter(fn) };
const app = { store, copies: { copiesDir: COP }, dataDir: DATA };
let clock = NOW; const mk = () => EA.createEwsAnchor(app, DATA, { copiesDir: COP, archiveDir: join(DATA, 'archive', 'ewsanchor'), now: () => clock, timers: false, place });

/* ── E1 · nothing served changes ── */
writeEws(0); const before = JSON.stringify(STORE); const X = mk(); const c0 = X.compute(NOW); await X.tick(); X.at(35.92, 74.31);
ok(JSON.stringify(STORE) === before && c0.rows.length === 4 && Object.keys(c0.u).length === 1, 'E1 an hour of the shadow (compute, archive, anchor at a point) leaves the run records byte-identical', JSON.stringify({ rows: c0.rows.length, u: c0.u, why: c0.why }));
{ const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const readers = readdirSync(API).filter((f) => /\.mjs$/.test(f) && f !== 'ewsanchor.mjs' && f !== 'ewsshadow.mjs').filter((f) => /ewsanchor|ewsshadow|ewsAnchor|ews-live-anchor/.test(strip(readFileSync(join(API, f), 'utf8'))));
  const F = JSON.parse(readFileSync(join(ROOT, 'data', 'ews-live-anchor.json'), 'utf8'));
  const slim = JSON.parse(readFileSync(join(ROOT, 'data', 'model-gate.slim.json'), 'utf8')), full = JSON.parse(readFileSync(join(ROOT, 'data', 'model-gate.resolved.json'), 'utf8'));
  const gate = (JSON.parse(readFileSync(join(ROOT, 'data', 'model-gate.json'), 'utf8')).entries || []).find((e) => e.id === 'ews-live-anchor');
  ok(JSON.stringify(readers.sort()) === JSON.stringify(['agents.mjs', 'index.mjs']) && F.mode === 'shadow' && F.live === false && F.servingHook === null,
    'E1 only index.mjs (builds it) and agents.mjs (operator report) name the shadow; no served module reads it; the file says shadow, live false, no serving hook', readers.join(','));
  ok(gate && gate.operator_only === true && gate.class === 'experimental' && !slim.entries['ews-live-anchor'] && full.entries.some((e) => e.id === 'ews-live-anchor' && e.resolved && e.resolved.canAlert === false) && !/\bPMD\b/.test(gate.name),
    'E1 the pre-registered rule is in the gate register (operator-only entry: resolved table yes, the page\'s slim gate no, no alert, no supplier in the name)'); }

/* ── E3 · missing and stale ── */
writeEws(null); { const c = mk().compute(NOW); ok(!c.rows.length && !Object.keys(c.u).length && /no EWS reading/.test(c.why || ''), 'E3 no copied EWS file: no anchor anywhere, with the reason', c.why); }
writeEws(7); { const c = mk().compute(NOW); const a = mk().at(35.92, 74.31); ok(!c.rows.length && !Object.keys(c.u).length && !a.applied && /6 h/.test(a.why || ''), 'E3 the newest EWS reading 7 h old (> 6 h): no anchor, with the reason', JSON.stringify({ why: c.why, a: a.why })); }
writeEws(5); { const c = mk().compute(NOW); const u = c.u['GB|Gilgit|Gilgit']; const hk = Math.floor(NOW / H) * H; const a = EA.anchorAt(M, c.rows.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, res: r.res, obsMs: r.obsMs })), 35.92, 74.31, hk);
  ok(c.rows.length === 4 && u && Math.abs(a.weight - (1 - (hk - a.newestMs) / (6 * H))) < 1e-9 && Math.abs(a.weight - (1 - 280 / 360)) < 1e-9 && Math.abs(u[1] - Math.round(a.dT * 100) / 100) < 0.011, 'E3 the newest reading 4 h 40 min before the archived hour: anchored with the fade weight 1 - 280/360', JSON.stringify({ u, w: a.weight })); }
{ const rows = [{ id: 'x', lat: 35.95, lon: 74.40, res: 4, obsMs: NOW - 3 * H }]; const a = EA.anchorAt(M, rows, 35.92, 74.31, NOW); ok(a.applied && Math.abs(a.weight - 0.5) < 1e-9, 'E3 three hours after the reading the anchor carries half its weight (the tested +3 h fade)', a.weight);
  const b = EA.anchorAt(M, rows, 35.9501, 74.4001, NOW); ok(!b.applied, 'E3 a station within exclude_within_km (1 km) of the place is left out, as tested', b.why); }

/* ── E4 · the archive records both ── */
writeEws(0); clock = NOW; { const Y = mk(); const t2 = await Y.tick(); const f = join(DATA, 'archive', 'ewsanchor', 'ewsa_' + new Date(NOW).toISOString().slice(0, 7) + '.jsonl.gz'); const t3 = await Y.tick();
  const lines = gunzipSync(readFileSync(f)).toString('utf8').trim().split('\n').map((l) => JSON.parse(l)); const L = lines[lines.length - 1];
  const r0 = L.r[0], u0 = L.u['GB|Gilgit|Gilgit'], o0 = L.o.find((x) => x[0] === 'mach:gilgit');
  ok(lines.length === 1 && t2.skipped && t3.skipped && r0 && Number.isFinite(r0[6]) && Number.isFinite(r0[8]) && u0 && Number.isFinite(u0[0]) && Number.isFinite(u0[1]) && o0 && Number.isFinite(o0[4]) && Number.isFinite(o0[5]) && !L.o.some((x) => x[0] === 'mach:far'),
    'E4 one member per hour (the earlier tick wrote it; later ticks skip): EWS reading + served basis; tehsil and station served value + anchor; a station out of reach is not listed', JSON.stringify({ n: lines.length, r0, u0, o0 }));
  ok(u0[1] > 2.5 && u0[1] < 4, 'E4 the anchor takes most of the stations\' common departure (+4 C) at the tehsil point (simple kriging, zero mean: the weights sum below 1 between stations)', u0[1]);
  ok(JSON.stringify(STORE) === before, 'E4 the served run records are still untouched'); }

/* ── E5 · the verification holds each EWS station out of its own anchor ── */
{ const h = Math.floor(NOW / H) * H; const D = new Date(h + 5 * H).toISOString().slice(0, 10); const d0 = Date.parse(D + 'T00:00:00Z') - 5 * H;
  const hh = d0 + 10 * H;   /* an hour of that Pakistan day */
  const row = { h: new Date(hh).toISOString().slice(0, 13), at: new Date(hh + 20 * 60e3).toISOString(),
    r: [['A_AWS', '1', 35.95, 74.40, 2400, 'u', 14, 20, 10, 10], ['B_AWS', '2', 36.05, 74.30, 2900, 'u', 14, 20, 10, 10], ['C_AWS', '3', 35.85, 74.55, 3300, 'u', 40, 20, 10, 10]],
    o: [['mach:gilgit', 35.92, 74.31, 1500, 10, 3.5, 3]] };
  const OB = { byPid: new Map([['aws:A_AWS', [{ ms: hh, T: 14 }]], ['aws:B_AWS', [{ ms: hh, T: 14 }]], ['aws:C_AWS', [{ ms: hh, T: 14 }]], ['mach:gilgit', [{ ms: hh, T: 14 }]]]) };
  const sc = VF.scoreEwsShadow(D, new Map([[hh, row]]), OB, M);
  /* C's own residual (+30) would pull its anchor far above 4: held out, its anchor rests on A and B (+4 each) */
  const setAB = [{ id: '1', lat: 35.95, lon: 74.40, res: 4, obsMs: hh }, { id: '2', lat: 36.05, lon: 74.30, res: 4, obsMs: hh }];
  const aC = EA.anchorAt(M, setAB, 35.85, 74.55, hh), withSelf = EA.anchorAt(M, setAB.concat([{ id: '3', lat: 35.85, lon: 74.55, res: 30, obsMs: hh }]), 35.85, 74.55, hh, { exclude: 'none' });   /* no id left out: the 1 km rule alone drops it */
  const cBand = sc.cells['ews|3000-4000 m'];
  ok(cBand && cBand[0] === 1 && Math.abs(cBand[2] - Math.abs(10 + aC.dT - 14)) < 1e-9 && Math.abs(cBand[1] - 4) < 1e-9 && Math.abs(withSelf.dT - aC.dT) < 1e-12 && aC.dT < 4,
    'E5 a held-out EWS station: its anchor is kriged from the others only (its own +30 C residual never reaches it; it is also within 1 km of itself)', JSON.stringify({ cBand, aC: aC.dT }));
  ok(sc.cells['ews|all'][0] === 3 && sc.cells['other|all'] && sc.cells['other|all'][0] === 1 && Math.abs(sc.cells['other|all'][2] - 0.5) < 1e-9 && sc.cells['other|mach'], 'E5 other stations: served (10) against served + anchor (13.5) vs the reading 14', JSON.stringify(sc.cells)); }

/* ── E6 · the pre-registered rule, the promotion record and the owner's approval ── */
{ const day = (i, es, ea, n = 50) => ({ day: new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10), ewsShadow: { cells: { 'ews|all': [n, es * n, ea * n], 'ews|2000-3000 m': [n, es * n, ea * n], 'other|all': [n, 1.2 * n, 1.1 * n] } } });
  const few = VF.ewsShadowSummary([0, 1, 2].map((i) => day(i, 3, 1.5 + 0.1 * i)), M);
  ok(!few.rulePassed && !few.promote && /3 scored days \(14 needed\)/.test(few.reasons.join(' ')) && /shadow, not served/.test(few.line), 'E6 3 scored days: the rule is not met (14 needed); the operator line says shadow', few.line);
  const many = VF.ewsShadowSummary(Array.from({ length: 14 }, (_, i) => day(i, 3 + 0.05 * (i % 3), 1.6 + 0.07 * (i % 4))), M);
  ok(many.rulePassed && !many.promote && /no serving hook/.test(many.why) && many.heldOut.ci[0] > 0, 'E6 14 days, gain interval above 0, no band worse: rule passed, NOT promoted (no serving hook in this build)', many.why);
  const worse = VF.ewsShadowSummary(Array.from({ length: 14 }, (_, i) => ({ ...day(i, 3, 1.5), ewsShadow: { cells: { 'ews|all': [50, 150, 75], 'ews|2000-3000 m': [50, 60, 90 + i] } } })), M);
  ok(!worse.rulePassed && /2000-3000 m: lower bound/.test(worse.reasons.join(' ')), 'E6 a height band made worse fails the rule even when the overall gain is positive', worse.reasons.join(' | '));
  const rec = VF.writeEwsPromotion(DATA, many); const rf = join(DATA, 'agents', 'verify', 'ews-anchor-promotion.json');
  const r1 = PTR.approve(rf, { dataDir: DATA, confirm: 'ews-anchor@1' }); ok(!r1.ok && /promote = false/.test(r1.why) && rec.pointer.target === 'ews-anchor-live', 'E6 the approve command refuses the record (promote false)', r1.why);
  /* a later build with a serving hook: the same record, promote true, flips live and revert restores the file */
  const F = JSON.parse(readFileSync(join(DATA, 'ews-live-anchor.json'), 'utf8')); F.servingHook = 'test hook'; writeFileSync(join(DATA, 'ews-live-anchor.json'), JSON.stringify(F, null, 1)); const b0 = readFileSync(join(DATA, 'ews-live-anchor.json'));
  const R = { ...JSON.parse(readFileSync(rf, 'utf8')), promote: true, pointer: { target: 'ews-anchor-live', fromSha256: sha(b0) } }; writeFileSync(rf, JSON.stringify(R));
  const r2 = PTR.approve(rf, { dataDir: DATA, confirm: 'ews-anchor@1' }); const live = JSON.parse(readFileSync(join(DATA, 'ews-live-anchor.json'), 'utf8')).live;
  const r3 = PTR.revert('ews-anchor-live', { dataDir: DATA, confirm: 'ews-anchor-live' }); const back = readFileSync(join(DATA, 'ews-live-anchor.json'));
  ok(r2.ok && live === true && r3.ok && back.equals(b0), 'E6 with a serving hook the owner\'s approval flips "live" and revert restores the file byte for byte', JSON.stringify({ r2: r2.why || r2.result, r3: r3.why || r3.result }));
  F.servingHook = null; writeFileSync(join(DATA, 'ews-live-anchor.json'), JSON.stringify(F, null, 1)); const b1 = readFileSync(join(DATA, 'ews-live-anchor.json'));
  writeFileSync(rf, JSON.stringify({ ...R, at: new Date().toISOString(), pointer: { target: 'ews-anchor-live', fromSha256: sha(b1) } })); const r4 = PTR.approve(rf, { dataDir: DATA, confirm: 'ews-anchor@1' });
  ok(!r4.ok && /no serving hook/.test(r4.why), 'E6 a record marked promote without a serving hook is still refused (nothing would serve the anchor)', r4.why); }

try { rmSync(T, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
