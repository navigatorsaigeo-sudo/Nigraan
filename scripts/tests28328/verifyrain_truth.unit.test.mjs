/* v91.17.283.28 . THE RAIN TRUTH OF THE VERIFICATION (findings V1-V5 of the rain investigation, 28 Oct 2026), offline, synthetic fixtures:
     R1  midnight carry-over: yesterday's 12 mm still on the counter until a 05:00 PKT reset, 3 mm after it -> 3 mm (the old rule, the
         highest counter reading of the day, said 12); a counter reset at 00 PKT with rain right after it counts that rain
     R2  missing stays missing: a counter that moved across a gap that cannot be bridged leaves the day null (never 0); a dry gap of hours
         (counter unmoved) is exactly 0 and the day is scored; a 75-min gap inside the day across which the counter rose is bridged
     R3  glitches: a dip the counter recovers from within 1 h (E11 28 Sep: 60.20 -> 23.62 -> 60.20) and a spike back to a non-zero value
         (Avenue: 7.11 -> 24.38 -> 7.11) are skipped: the day is 60.2 mm and 7.11 mm, not 120.4 / 24.38
     R4  al_jazari flip: a counter flipping 0 <-> 81.1 mm with the rain rate 0 is held every day (flip / rate-zero / stuck); never scored as rain
     R5  khaplu stuck: the same non-zero daily maximum (9.14 mm) day after day is held from the 3rd day
     R6  gsit isolated: wet days with >= 3 dry gauges within 50 km are isolated; the station is held once isolated days are >= 3 and >= 50 %
         of its wet days; a corroborated wet day is not isolated; with < 3 neighbours the satellite decides (0 -> isolated; no satellite
         Pakistan day -> not judged)
     R7  the issued day is the hour-ending day (stamps 01:00 ... 24:00 PKT); scoreDay scores the gauge truth (R / wet cells) and writes the
         satellite apart (RI / wetI cells, RT i|) labelled 'satellite (IMERG Late)'; the summary says so and never calls it measured
     R8  the parameters live in data/obs-qc-params.json "rain" (no typed fallback), each with its source
     R9  the Python port in station-lake/scripts/verify_issued.py gives the same table on the same fixtures (one rule, two languages)
   usage: node scripts/tests28328/verifyrain_truth.unit.test.mjs */
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), AG = join(ROOT, 'scripts', 'agents');
const V = await import(pathToFileURL(join(AG, 'verify.mjs')).href), L = await import(pathToFileURL(join(AG, 'lib.mjs')).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 600) : '')); } };
const P = V.rainParams(join(ROOT, 'data'));
const H = 3600e3, M5 = 5 * 6e4;
/* a station's readings: fn(ms) -> [PT, RR] | null, every 5 min from day a 00:00 PKT to day b 24:00 PKT */
const series = (a, b, fn, step = M5) => { const out = []; for (let t = L.dayStartMs(a) + step; t <= L.dayStartMs(b) + 864e5; t += step) { const v = fn(t); if (v) out.push({ ms: t, PT: v[0], RR: v[1] }); } return out; };
const hourOf = (t, D) => (t - L.dayStartMs(D)) / H;
const D1 = '2026-10-10', D0 = L.addDays(D1, -1);

/* ---- R1 midnight carry-over ---- */
{ const rows = series(D0, D1, (t) => { const h = hourOf(t, D1);
    if (h <= 0) return [h > -2 ? 12 : Math.max(0, 12 + h * 0), 0];                 /* yesterday ends with 12 mm on the counter */
    if (h <= 5) return [12, 0];                                                      /* carried past midnight */
    if (h <= 10) return [0, 0];                                                      /* reset at 05:00 PKT */
    if (h <= 13) return [Math.round((h - 10) * 10) / 10, 1];                         /* 3 mm 10:00-13:00 */
    return [3, 0]; });
  const g = V.gaugeDay(rows, L.dayStartMs(D1), P); const oldRule = Math.max(...rows.filter((r) => r.ms > L.dayStartMs(D1) && r.ms <= L.dayStartMs(D1) + 864e5).map((r) => r.PT));
  ok(g.mm === 3 && oldRule === 12 && g.resets === 1, 'R1a carry-over: 3 mm (the highest counter reading said ' + oldRule + ')', g);
  const rows2 = series(D0, D1, (t) => { const h = hourOf(t, D1); if (h <= 0) return [7, 0]; if (h <= 2) return [Math.round(h * 2 * 10) / 10, 4]; return [4, 0]; });
  const g2 = V.gaugeDay(rows2, L.dayStartMs(D1), P); ok(Math.abs(g2.mm - 4) < 1e-9, 'R1b a reset at 00 PKT with rain right after it: the 4 mm after midnight are counted, yesterday\'s 7 are not', g2); }

/* ---- R2 missing stays missing ---- */
{ const gapRise = series(D0, D1, (t) => { const h = hourOf(t, D1); if (h > -2 && h < 2) return null; return [h < 0 ? 0 : h < 6 ? 5 : 5, 0]; });   /* counter 0 -> 5 across 22:00-02:00 */
  const g = V.gaugeDay(gapRise, L.dayStartMs(D1), P); ok(g.mm === null && /rose from the day before/.test(g.why), 'R2a a rise across the day start over a 4-h gap: the day is missing (null, not 0)', g);
  const dry = series(D0, D1, (t) => { const h = hourOf(t, D1); if (h > 8 && h < 11) return null; return [0, 0]; });
  const gd = V.gaugeDay(dry, L.dayStartMs(D1), P); ok(gd.mm === 0 && gd.why === null && gd.hours >= P.counter.min_hours, 'R2b a 3-h gap with the counter unmoved: exactly 0 mm, scored', gd);
  const inside = series(D0, D1, (t) => { const h = hourOf(t, D1); if (h > 10 && h < 11.25) return null; return [h <= 10 ? 0 : 6.5, 0]; });
  const gi = V.gaugeDay(inside, L.dayStartMs(D1), P); ok(gi.mm === 6.5 && gi.longGaps === 1, 'R2c a 75-min gap inside the day across which the counter rose: bridged (the counter carries it), 6.5 mm', gi);
  const thin = series(D0, D1, (t) => (hourOf(t, D1) > 0 && hourOf(t, D1) < 6 ? null : [0, 0]), 20 * 6e4);
  const gt = V.gaugeDay(thin.filter((r) => hourOf(r.ms, D1) <= 0 || hourOf(r.ms, D1) >= 6), L.dayStartMs(D1), P);
  ok(gt.mm === 0 || /hours of the day/.test(gt.why || ''), 'R2d coverage below min_hours is never scored as a measured value unless the counter shows it', gt);
  const none = V.gaugeDay([], L.dayStartMs(D1), P); ok(none.mm === null, 'R2e no reading: null'); }

/* ---- R3 glitches ---- */
{ const e11 = [[0, 0.25], [0.1, 0], [6.3, 36.83], [7, 43.43], [9.6, 60.2], [20.1, 60.2], [20.2, 23.62], [20.6, 23.62], [20.9, 60.2], [23.8, 60.2]];
  const mk = (pts) => { const out = []; for (let k = 0; k < pts.length; k++) { const [h, v] = pts[k]; const nh = k + 1 < pts.length ? pts[k + 1][0] : 24; for (let x = h; x < nh - 1e-9; x += 5 / 60) out.push({ ms: L.dayStartMs(D1) + Math.round(x * 60) * 6e4 + 1, PT: v, RR: null }); } return out; };
  const g = V.gaugeDay(mk(e11), L.dayStartMs(D1), P); ok(Math.abs(g.mm - 60.2) < 1e-9 && g.dips >= 1, 'R3a a dip recovered within 1 h (E11): 60.2 mm, not 120.4', g);
  const av = [[0, 0], [6.5, 2.29], [8.2, 4.32], [11.5, 7.11], [20.08, 24.38], [21.08, 7.11]];
  const ga = V.gaugeDay(mk(av), L.dayStartMs(D1), P); ok(Math.abs(ga.mm - 7.11) < 1e-9, 'R3b a spike back to a non-zero value within 1 h (Avenue): 7.11 mm, not 24.38', ga); }

/* ---- stations for R4-R6: a Lahore cluster (al_jazari + 3 dry neighbours), khaplu (alone), gsit (Karachi + 3 neighbours), a lone gauge ---- */
const st = [
  { pid: 'mach:al_jazari', net: 'mach', key: 'al_jazari', lat: 31.52, lon: 74.33, uid: 'Punjab|Lahore|Lahore City' },
  { pid: 'mach:lhr1', net: 'mach', key: 'lhr1', lat: 31.55, lon: 74.35, uid: 'Punjab|Lahore|Lahore City' }, { pid: 'mach:lhr2', net: 'mach', key: 'lhr2', lat: 31.47, lon: 74.30, uid: 'Punjab|Lahore|Lahore Cantt' }, { pid: 'mach:lhr3', net: 'mach', key: 'lhr3', lat: 31.60, lon: 74.40, uid: 'Punjab|Lahore|Shalimar' },
  { pid: 'mach:khaplu', net: 'mach', key: 'khaplu', lat: 35.15, lon: 76.33, uid: 'Gilgit-Baltistan|Ghanche|Khaplu' },
  { pid: 'mach:gsit', net: 'mach', key: 'gsit', lat: 24.946, lon: 67.058, uid: 'Sindh|Central Karachi|North Nazimabad Town' },
  { pid: 'mach:k1', net: 'mach', key: 'k1', lat: 24.90, lon: 67.08, uid: 'Sindh|Karachi East|Gulshan' }, { pid: 'mach:k2', net: 'mach', key: 'k2', lat: 24.86, lon: 67.01, uid: 'Sindh|Karachi South|Saddar' }, { pid: 'mach:k3', net: 'mach', key: 'k3', lat: 25.00, lon: 67.10, uid: 'Sindh|Karachi Central|Gulberg' },
  { pid: 'mach:lone', net: 'mach', key: 'lone', lat: 29.55, lon: 66.02, uid: 'Balochistan|Nushki|Nushki' },
  { pid: 'mach:lone2', net: 'mach', key: 'lone2', lat: 27.70, lon: 64.20, uid: 'Balochistan|Kharan|Kharan' }];
const days = []; for (let d = '2026-10-01'; d <= '2026-10-12'; d = L.addDays(d, 1)) days.push(d);
const by = new Map(); const A = days[0], B = days[days.length - 1];
by.set('mach:al_jazari', series(L.addDays(A, -1), B, (t) => { const h = ((t - L.dayStartMs(A)) / H) % 24; return [h < 3 || (h >= 9 && h < 10) || h >= 20 ? 0 : 81.1, 0]; }));   /* 0 <-> 81.1, rate 0 */
for (const k of ['lhr1', 'lhr2', 'lhr3', 'k3']) by.set('mach:' + k, series(L.addDays(A, -1), B, () => [0, 0]));
by.set('mach:khaplu', series(L.addDays(A, -1), B, () => [9.14, 0]));
const wetDays = new Set(['2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']);
const dayOf = (t) => L.pktDay(t - 1);
by.set('mach:gsit', series(L.addDays(A, -1), B, (t) => { const d = dayOf(t), h = (t - L.dayStartMs(d)) / H; if (!wetDays.has(d)) return [0, 0]; return [h < 12 ? 0 : h < 14 ? Math.round((h - 12) * 3 * 100) / 100 : 6, h >= 12 && h < 14 ? 3 : 0]; }));
/* k1 corroborates gsit on 11 Oct only (0.4 mm), k2 dry */
by.set('mach:k1', series(L.addDays(A, -1), B, (t) => { const d = dayOf(t), h = (t - L.dayStartMs(d)) / H; return [d === '2026-10-11' && h >= 13 ? 0.4 : 0, 0]; }));
by.set('mach:k2', series(L.addDays(A, -1), B, () => [0, 0]));
/* the lone gauges (no neighbours): wet on 5 Oct; the satellite reads 0 at lone, nothing at lone2 */
for (const k of ['lone', 'lone2']) by.set('mach:' + k, series(L.addDays(A, -1), B, (t) => { const d = dayOf(t), h = (t - L.dayStartMs(d)) / H; return [d === '2026-10-05' && h >= 12 ? 4 : 0, d === '2026-10-05' && h >= 12 && h < 13 ? 4 : 0]; }));
const imerg = (uid, d) => (uid === 'Balochistan|Nushki|Nushki' ? 0 : uid === 'Balochistan|Kharan|Kharan' ? null : 0);
const RT = V.rainTruthTable(st, by, days, { ...P, rainHolds: {} }, imerg);   /* v283.31: the fixtures reuse held gauge names; the owner hold is tested in R10 */ const T = RT.table; const t = (p, d) => T.get('mach:' + p + '|' + d);

/* ---- R4 al_jazari ---- */
{ const held = days.map((d) => t('al_jazari', d)).filter(Boolean); const scored = held.filter((x) => x.mm != null);
  ok(held.length === days.length && !scored.length && held.every((x) => /flip|rate stayed 0|stuck/.test(x.held)), 'R4 al_jazari (0 <-> 81.1 mm, rain rate 0): held on every day, never scored as rain', held.slice(0, 3)); }
/* ---- R5 khaplu ---- */
{ const x = days.map((d) => t('khaplu', d)); ok(x[0].mm === 0 && x[1].mm === 0 && x.slice(2).every((y) => y.mm === null && /stuck/.test(y.held)), 'R5 khaplu (9.14 mm every day): held as a stuck counter from the 3rd day (min_days ' + P.stuck.min_days + ')', x.map((y) => [y.mm, y.held && y.held.slice(0, 20)])); }
/* ---- R6 gsit and the lone gauges ---- */
{ const g = (d) => t('gsit', d);
  ok(g('2026-10-03').isolated === true && g('2026-10-03').mm === 6 && g('2026-10-05').mm === 6, 'R6a gsit: its first isolated wet days are kept (a local shower is real) while isolated days < ' + P.isolation.hold_min_days, [g('2026-10-03'), g('2026-10-05')]);
  ok(g('2026-10-07').mm === null && /isolated gauge/.test(g('2026-10-07').held) && g('2026-10-12').mm === null, 'R6b gsit: held once 3 of its wet days had no corroborating gauge within 50 km', g('2026-10-07'));
  ok(g('2026-10-11').isolated === false, 'R6c a wet day with a neighbour at >= 0.2 mm is corroborated, not isolated', g('2026-10-11'));
  ok(t('lone', '2026-10-05').isolated === true && t('lone2', '2026-10-05').isolated === null && t('lone2', '2026-10-05').mm === 4, 'R6d fewer than 3 neighbours: the satellite decides (0 mm -> isolated; no satellite Pakistan day -> not judged, kept)', [t('lone', '2026-10-05'), t('lone2', '2026-10-05')]);
  ok(t('k1', '2026-10-11').mm === 0.4 && t('lhr1', '2026-10-05').mm === 0, 'R6e ordinary gauges are scored as measured (0.4 mm, 0 mm)'); }

/* ---- R7 hour-ending forecast day, scoreDay cells and labels ---- */
{ const D = '2026-10-03', d0 = L.dayStartMs(D); const uid = 'Sindh|Central Karachi|North Nazimabad Town';
  const fc = (issue) => { const t0 = L.dayStartMs(issue), n = 96; const P2 = []; for (let i = 0; i < n; i++) { const ms = t0 + i * H; P2.push(ms === d0 ? 50 : ms > d0 && ms <= d0 + 864e5 ? 2 : 0); } return { z: 'coast', t0, n, P: P2, T: new Array(n).fill(300), RH: new Array(n).fill(50), W: new Array(n).fill(10), sel: null }; };
  ok(Math.abs(V.dayRain(fc(D), d0) - 4.8) < 1e-9, 'R7a the issued day holds the stamps 01:00-24:00 PKT (the 5 mm stamped 00:00 is the day before)', V.dayRain(fc(D), d0));
  const FC = new Map(); for (let k = 0; k <= 4; k++) FC.set(L.addDays(D, -k), new Map([[uid, fc(L.addDays(D, -k))]]));
  const r = await V.scoreDay({ now: d0 + 2 * 864e5, dataDir: join(ROOT, 'data') }, D, { stations: st.map((s) => ({ ...s, urban: true })), FC, PTS: new Map(), HEAT: new Map(), OB: { byPid: by }, U: { utci: () => null, utciAgnScore: () => null }, RADAR: {}, RAIN: RT, RP: P, IMERG: (u, d) => (u === uid && d === D ? 12.5 : null) });
  const k = '|mach|coast|0|urban';
  ok(r.S['R' + k] && Math.abs(r.S['R' + k][1] - (4.8 - 6)) < 1e-9 && r.C['wet' + k] && r.C['wet' + k][0] === 1, 'R7b scoreDay: gsit 3 Oct scored against its gauge truth (4.8 forecast vs 6 mm)', { R: r.S['R' + k], wet: r.C['wet' + k] });
  ok(r.S['RI|imerg|coast|0|all'] && Math.abs(r.S['RI|imerg|coast|0|all'][1] - (4.8 - 12.5)) < 1e-9 && r.RT['i|coast|0'] && r.RT['g|coast|0'], 'R7c the satellite is scored apart (RI / wetI / RT i|), never in the gauge cells', { RI: r.S['RI|imerg|coast|0|all'], RT: r.RT });
  ok(r.rainTruth && r.rainTruth.v === V.RAIN_TRUTH_V && /satellite \(IMERG Late\)/.test(r.rainTruth.satellite), 'R7d the ledger record names its rain truth and the satellite label', r.rainTruth);
  const sum = V.summarize([r], d0 + 2 * 864e5); const txt = JSON.stringify(sum.rain);
  ok(sum.rain.truth === V.RAIN_TRUTH_LABEL && sum.rain.satellite.label === 'satellite (IMERG Late)' && sum.rain.byZoneLead.some((x) => x.zone === 'coast' && x.lead === 0 && x.observedMm === 6) && !/measured/i.test(txt.replace(/not a measurement/g, '')),
    'R7e the summary: gauges first (truth label), the satellite labelled \'satellite (IMERG Late)\', never \'measured\'', { truth: sum.rain.truth, sat: sum.rain.satellite.label });
  const src = readFileSync(join(AG, 'verify.mjs'), 'utf8'); ok(!/Math\.max\(\.\.\.pt\.map\(\(r\) => r\.PT\)\)/.test(src), 'R7f the highest-counter-reading rule is gone from verify.mjs'); }

/* ---- R8 parameters ---- */
{ const J = JSON.parse(readFileSync(join(ROOT, 'data', 'obs-qc-params.json'), 'utf8')).rain;
  ok(J && J.counter.bridge_gap_min === 60 && J.flip.rise_mm === 1 && J.isolation.radius_km === 50 && J.isolation.num_min === 3 && J.isolation.hold_min_days === 3 && J.isolation.hold_min_share === 0.5
    && ['bridge_source', 'drop_source', 'resets_source', 'dip_source', 'min_hours_source'].every((k) => typeof J.counter[k] === 'string' && J.counter[k].length > 40) && J.stuck.source && J.isolation.source && J.flip.rule,
  'R8 the rain truth numbers live in data/obs-qc-params.json "rain", each with its source'); }

/* ---- R9 the Python port gives the same table ---- */
{ const py = ['python3', 'python'].find((p) => spawnSync(p, ['-c', 'import pandas, numpy'], { encoding: 'utf8' }).status === 0); const VI = join(ROOT, 'station-lake', 'scripts', 'verify_issued.py');
  if (!py || !existsSync(VI)) ok(true, 'R9 skipped: ' + (!py ? 'no python with pandas' : 'no station-lake/scripts/verify_issued.py in this tree'));
  else { const TMP = mkdtempSync(join(tmpdir(), 'vrain-')); mkdirSync(join(TMP, 'stub'), { recursive: true }); writeFileSync(join(TMP, 'stub', 'archive_read.py'), '# stub for the test\n');
    const fx = { stations: st.map((s) => ({ pid: s.pid, lat: s.lat, lon: s.lon, uid: s.uid })), rows: Object.fromEntries([...by].map(([p, a]) => [p, a.map((r) => [r.ms, r.PT, r.RR])])), days };
    writeFileSync(join(TMP, 'fx.json'), JSON.stringify(fx));
    const code = ['import sys, json', 'sys.path.insert(0, ' + JSON.stringify(join(TMP, 'stub')) + '); sys.path.insert(0, ' + JSON.stringify(dirname(VI)) + ')', 'import verify_issued as V',
      'fx = json.load(open(' + JSON.stringify(join(TMP, 'fx.json')) + '))', 'P = V.rain_params(' + JSON.stringify(ROOT) + '); P["rain_holds"] = {}',
      "im = lambda uid, d: 0 if uid == 'Balochistan|Nushki|Nushki' else (None if uid == 'Balochistan|Kharan|Kharan' else 0)",
      "T, c = V.rain_truth_table(fx['stations'], {p: [tuple(r) for r in v] for p, v in fx['rows'].items()}, fx['days'], P, im)",
      "print(json.dumps({k: [t['mm'], bool(t['held']), t['isolated']] for k, t in T.items()}))"].join('\n');
    const r = spawnSync(py, ['-B', '-c', code], { encoding: 'utf8', maxBuffer: 64e6 }); let pyT = null; try { pyT = JSON.parse(r.stdout); } catch (_) {}
    const diff = []; if (pyT) for (const [k, x] of T) { const y = pyT[k]; if (!y || y[0] !== x.mm || y[1] !== !!x.held || y[2] !== (x.isolated ?? null)) diff.push([k, [x.mm, !!x.held, x.isolated ?? null], y]); }
    ok(pyT && Object.keys(pyT).length === T.size && !diff.length, 'R9 verify_issued.py rain_truth_table == verify.mjs rainTruthTable on every fixture station-day (' + T.size + ')', pyT ? diff.slice(0, 5) : r.stderr.slice(-800)); } }

/* v283.31 owner 9.5 · the owner's rain-channel holds (data/mach-rain-holds.json) are in the rain parameters and hold every day of the gauge */
{ ok(P.rainHolds && P.rainHolds.al_jazari && P.rainHolds.gsit && Object.keys(P.rainHolds).length === 7, 'R10 the rain parameters carry the 7 owner rain-channel holds');
  const RH = V.rainTruthTable(st, by, days, P, imerg).table; const a = [...RH.entries()].filter(([k]) => k.startsWith('mach:al_jazari|'));
  ok(a.length && a.every(([, v]) => v.mm === null && /held by the owner/.test(v.held)), 'R10 al_jazari: every day held by the owner hold, never rain truth'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
