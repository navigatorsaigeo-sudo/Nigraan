/* v91.17.283.47 (NIGRAAN 1.0.9) · WeatherNext 3 as a SHADOW member of the blend (RULES_WN3_LIVE_SHADOW_20261102), offline:
     W1  the locks: the rules file and data/wn3-shadow.json match the hashes in verify.mjs; the cells are exactly the first scoring's wins
         (plains T / TX / TN / Td / calibrated W / heavy rain, coast Td), no hills or mountain; the calibration is the 2024 C1 fit (384 cells)
     W2  the import (station-lake/scripts/wn3_live_import.py): a live folder -> data/archive/wn3; a file whose sha256 differs from
         LIVE_MANIFEST.csv is not imported; a second run imports nothing
     W3  the daily score: served vs blend+WN3 vs station with the operational run (00 UTC of the day before the issue, published before
         00 PKT of the issue); a run published late is not used; WN3-cal adds the 2024 bias; leads beyond 72 h are not used
     W4  the summary: collecting before the first look; at look 1 a better blend passes, a worse one does not; the feed gate; a changed
         configuration fails the lock
     W5  switch off and nothing served: NIGRAAN_WN3_SHADOW=0 gives a verification ledger and summary byte-identical to the 1.0.8 agent on the
         same world (and to this agent's own served cells with the shadow on); no server module but the operator route reads the WN3 files;
         the Sources page is unchanged
   usage: node scripts/tests28347wn/wn3shadow47.test.mjs   (env NIGRAAN_BASE_TREE = the 1.0.8 tree for the W5 base comparison; NIGRAAN_PYTHON) */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { gzipSync, gunzipSync } from 'node:zlib'; import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url'; import { spawnSync } from 'node:child_process';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const sha = (b) => createHash('sha256').update(b).digest('hex'); const H = 3600e3;
delete process.env.NIGRAAN_WN3_SHADOW;
const VF = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'verify.mjs')).href);
const L = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'lib.mjs')).href);
const C = JSON.parse(readFileSync(join(ROOT, 'data', 'wn3-shadow.json'), 'utf8'));

/* ── W1 · locks and cells ── */
{ const rs = sha(readFileSync(join(ROOT, 'data', 'evidence', 'wn3', 'RULES_WN3_LIVE_SHADOW_20261102.md'))); const cs = sha(readFileSync(join(ROOT, 'data', 'wn3-shadow.json')));
  const rec = readFileSync(join(ROOT, 'data', 'evidence', 'wn3', 'RULES_WN3_LIVE_SHADOW_20261102.sha256'), 'utf8').split(/\s+/)[0];
  ok(rs === VF.WN3_RULES_SHA256 && rs === rec && cs === VF.WN3_CONFIG_SHA256 && readFileSync(join(ROOT, 'data', 'evidence', 'wn3', 'RULES_WN3_LIVE_SHADOW_20261102.md'), 'utf8').includes(cs),
    'W1 rules and configuration hashes as locked (verify.mjs, .sha256 file, the configuration hash named in the rules)', JSON.stringify({ rs, cs }));
  const cells = C.cells.map((c) => c.v + '|' + c.zone).sort().join(',');
  ok(cells === 'R10|plains,TN|plains,TX|plains,Td|coast,Td|plains,T|plains,W|plains' && !C.cells.some((c) => /hills|mountain/.test(c.zone)) && C.cells.every((c) => c.leads.join() === '0,1'),
    'W1 cells = the first scoring\'s wins only (plains T/TX/TN/Td/W/heavy rain, coast Td); hills and mountain out; served leads 0 and 1', cells);
  const b = C.calibration.bias; ok(Object.keys(b.T).length === 384 && Object.keys(b.Td).length === 384 && Object.keys(b.W).length === 384 && C.calibration.rules_sha256 === '35cfbb9057c6813a06d78d8e0c8fb89c95dbde6d07013fa3e1b6c73972cdb37f',
    'W1 calibration = RULES_WN3_SCORE_20261102 C1 (2024 fit, 384 cells per variable, parent rules hash)');
  ok(C.shadow === true && C.live === false && C.servingHook === false && C.maxLeadH === 72 && !('licence' in C) && C.credit[0].attribution.startsWith('WeatherNext 3, Google DeepMind'),
    'W1 shadow, not live, no serving hook, leads to 72 h; credit "WeatherNext 3, Google DeepMind" kept out of the Sources headers'); }

/* ── W2 · the import ── */
const T = mkdtempSync(join(tmpdir(), 'v47wn3-')); const DATA = join(T, 'data'); mkdirSync(DATA, { recursive: true });
const PY = process.env.NIGRAAN_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
const PTS = [[1, 'station', 'MACH', 'lhr1', 31.50, 74.30, 215], [2, 'station', 'PMD_SYNOP', '41640', 31.55, 74.33, 214], [3, 'station', 'MACH', 'khi1', 24.90, 67.10, 20], [4, 'tehsil', 'TEHSIL', 'Punjab|Lahore|Lahore City', 31.52, 74.35, 210]];
const LEADS3 = Array.from({ length: 56 }, (_, k) => 3 * (k + 1)), LEADS1 = Array.from({ length: 168 }, (_, k) => k + 1);
const truthT = (ms) => 15 + 6 * Math.sin(2 * Math.PI * ((ms / H + 5) % 24 - 9) / 24);   /* plains-like diurnal wave, PKT peak ~15 */
const truthTd = (ms) => 5 + 0.5 * Math.sin(ms / 9e6);
const truthW = (ms) => 3 + Math.sin(ms / 5e6);
let havePy = spawnSync(PY, ['-c', 'import pyarrow, sys; print(sys.version)'], { encoding: 'utf8' }).status === 0;
function writeLive(live, initDay, publishedIso, corrupt = false) {
  const initMs = Date.parse(initDay + 'T00:00:00Z'); const ym = initDay.slice(0, 7), id = initDay.replace(/-/g, '') + '_00';
  const script = `
import pyarrow as pa, pyarrow.parquet as pq, json, sys, os
P = json.loads(sys.argv[1]); L3 = json.loads(sys.argv[2]); L1 = json.loads(sys.argv[3]); V = json.loads(sys.argv[4]); out = sys.argv[5]
os.makedirs(os.path.dirname(out % '0p05'), exist_ok=True); os.makedirs(os.path.dirname(out % '0p1'), exist_ok=True)
def tbl(leads, cols):
    d = {'point_id': [], 'init_utc': [], 'lead_h': []}
    for c in cols: d[c] = []
    for h in leads:
        for p in P:
            d['point_id'].append(p); d['init_utc'].append(${initMs} // 1000); d['lead_h'].append(h)
            for c in cols: d[c].append(V[c][str(p)][str(h)])
    t = {k: (pa.array(v, pa.timestamp('s')) if k == 'init_utc' else pa.array(v, pa.int32() if k == 'point_id' else pa.int16() if k == 'lead_h' else pa.float32())) for k, v in d.items()}
    return pa.table(t)
c05 = ['station_head_temperature_2m_mean_bl', 'station_head_dewpoint_temperature_2m_mean_bl']
pq.write_table(tbl(L3, c05), out % '0p05')
pq.write_table(tbl(L1, ['wind_speed_10m_mean_bl', 'total_precipitation_1hr_mean_bl']), out % '0p1')
`;
  const V = { station_head_temperature_2m_mean_bl: {}, station_head_dewpoint_temperature_2m_mean_bl: {}, wind_speed_10m_mean_bl: {}, total_precipitation_1hr_mean_bl: {} };
  /* WN3 raw = truth - the 2024 bias, so WN3-cal = truth exactly (plains); rain 0.5 mm every hour (12 mm a day) */
  const season = ['DJF', 'DJF', 'MAM', 'MAM', 'MAM', 'JJA', 'JJA', 'JJA', 'SON', 'SON', 'SON', 'DJF'][new Date(initMs).getUTCMonth()];
  for (const p of PTS) { const z = p[0] === 3 ? 'coast' : 'plains'; for (const k of Object.keys(V)) V[k][p[0]] = {};
    for (const h of LEADS3) { const ms = initMs + h * H; const bT = C.calibration.bias.T[z + '|' + h + '|' + season] || 0, bD = C.calibration.bias.Td[z + '|' + h + '|' + season] || 0, bW = C.calibration.bias.W[z + '|' + h + '|' + season] || 0;
      V.station_head_temperature_2m_mean_bl[p[0]][h] = truthT(ms) - bT + 273.15; V.station_head_dewpoint_temperature_2m_mean_bl[p[0]][h] = truthTd(ms) - bD + 273.15; }
    for (const h of LEADS1) { const ms = initMs + h * H; const bW = C.calibration.bias.W[z + '|' + h + '|' + season] || 0; V.wind_speed_10m_mean_bl[p[0]][h] = h % 3 === 0 ? truthW(ms) - bW : NaN; V.total_precipitation_1hr_mean_bl[p[0]][h] = 0.0005; } }
  const out = join(live, '%s', ym, id + '.parquet');
  const r = spawnSync(PY, ['-c', script, JSON.stringify(PTS.map((p) => p[0])), JSON.stringify(LEADS3), JSON.stringify(LEADS1), JSON.stringify(V).replace(/NaN/g, 'NaN'), out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  const man = join(live, 'LIVE_MANIFEST.csv'); const head = existsSync(man) ? '' : 'init_utc,published_utc,pulled_utc,res,path,rows,sha256,download_bytes,seconds\n'; let rows = head;
  for (const res of ['0p05', '0p1']) { const rel = res + '/' + ym + '/' + id + '.parquet'; const s = sha(readFileSync(join(live, rel))); rows += [initDay + 'T00:00:00', publishedIso, publishedIso, res, rel, 0, corrupt ? s.replace(/^./, 'x') : s, 0, 1].join(',') + '\n'; }
  writeFileSync(man, (existsSync(man) ? readFileSync(man, 'utf8') : '') + rows);
}
const LIVE = join(T, 'inputs', 'weathernext3', 'live'); mkdirSync(LIVE, { recursive: true });
writeFileSync(join(T, 'inputs', 'weathernext3', 'points.csv'), 'point_id,kind,network,key,name,lat,lon,elev_m\n' + PTS.map((p) => [p[0], p[1], p[2], '"' + p[3] + '"', 'x', p[4], p[5], p[6]].join(',')).join('\n') + '\n');
const D = '2026-11-10';   /* target day; L=0 issue 11-10 -> run 11-09 00Z; L=1 issue 11-09 -> run 11-08 00Z */
if (havePy) {
  writeLive(LIVE, '2026-11-08', '2026-11-08T07:51:00'); writeLive(LIVE, '2026-11-09', '2026-11-09T07:49:00'); writeLive(LIVE, '2026-11-07', '2026-11-07T07:50:00', true);
  const imp = () => spawnSync(PY, [join(ROOT, 'station-lake', 'scripts', 'wn3_live_import.py'), '--app', T, '--data', DATA, '--live', LIVE], { encoding: 'utf8' });
  const r1 = imp(); const files = readdirSync(join(DATA, 'archive', 'wn3')).sort();
  ok(r1.status === 3 && files.join() === 'points.json,wn3_20261108_00.json.gz,wn3_20261109_00.json.gz' && /20261107_00: .*sha256 differs/.test(r1.stdout), 'W2 two runs imported; the run whose file does not match LIVE_MANIFEST.csv is NOT imported (exit 3)', r1.stdout + r1.stderr);
  const rec = JSON.parse(gunzipSync(readFileSync(join(DATA, 'archive', 'wn3', 'wn3_20261109_00.json.gz'))).toString());
  ok(rec.leads3.length === 56 && rec.leads1.length === 168 && Math.abs(rec.pts['1'].R[0] - 0.5) < 1e-9 && rec.served === false && rec.published_utc === '2026-11-09T07:49:00' && rec.pts['1'].W.length === 56,
    'W2 the archive record: 3-hourly T/Td/W, hourly rain in mm, published time from the manifest, marked not served');
  const r2 = imp(); ok(/0 new run/.test(r2.stdout), 'W2 a second import adds nothing (idempotent)', r2.stdout);
} else ok(true, 'W2 skipped: no Python with pyarrow here (' + PY + ')');

/* ── W3 · the daily score on a small world (direct call) ── */
const dayMs = L.dayStartMs(D); const pkts = (d) => L.dayStartMs(d);
const st = [{ pid: 'mach:lhr1', net: 'mach', key: 'lhr1', lat: 31.5001, lon: 74.3001, uid: 'Punjab|Lahore|Lahore City', elevM: 215 }, { pid: 'synop:41640', net: 'synop', key: '41640', lat: 31.5502, lon: 74.3301, uid: 'Punjab|Lahore|Lahore City', elevM: 214 },
  { pid: 'mach:far', net: 'mach', key: 'far', lat: 30.0, lon: 70.0, uid: 'Punjab|Lahore|Lahore City', elevM: 200 }];
/* the served record of issue I: 73 hourly values from 00 PKT I, served T = truth + 2 C, RH from the truth dew point, wind truth km/h + 3.6, rain 0 */
function served(I) { const t0 = pkts(I); const n = 73, Tv = [], RH = [], Wv = [], P = []; for (let i = 0; i < n; i++) { const ms = t0 + i * H; const t = truthT(ms) + 2;
    const tr = Math.round(t * 10) / 10; const rh = 100 * Math.exp(17.625 * truthTd(ms) / (243.04 + truthTd(ms))) / Math.exp(17.625 * tr / (243.04 + tr)); Tv.push(Math.round(t * 10)); RH.push(rh); Wv.push(truthW(ms) * 3.6 + 3.6); P.push(0); }
  return { lat: 31.52, lon: 74.35, t0, n, T: Tv, RH, W: Wv, P, z: 'plains', sel: 215 }; }
const FC = new Map(); for (const I of [L.addDays(D, -1), D]) FC.set(I, new Map([['Punjab|Lahore|Lahore City', served(I)]]));
const OB = { byPid: new Map() }; for (const s of st) { const a = []; for (let ms = dayMs - 3 * H; ms <= dayMs + 27 * H; ms += H) a.push({ ms, T: truthT(ms), Td: truthTd(ms), RH: null, W: truthW(ms) * 3.6 }); OB.byPid.set(s.pid, a); }
const RAIN = new Map([['mach:lhr1|' + D, { mm: 15 }]]);
const zoneOf = new Map([['Punjab|Lahore|Lahore City', 'plains']]);
if (havePy) {
  const runs = VF.loadWn3Runs(DATA, [L.addDays(D, -1), L.addDays(D, -2)]); const pts = VF.loadWn3Points(DATA); const M = VF.wn3Match(st, pts, 1.5);
  ok(M.size === 2 && M.get('mach:lhr1').id === '1' && M.get('synop:41640').id === '2' && !M.has('mach:far'), 'W3 stations joined to their WN3 station point within 1.5 km (a station without one is not scored)', JSON.stringify([...M]));
  const sc = VF.scoreWn3Shadow(D, st, FC, OB, RAIN, runs, M, C, zoneOf);
  const c0 = sc.cells['T|plains|0|mach'], c1 = sc.cells['T|plains|1|mach'];
  ok(sc.runs[0].inTime && sc.runs[1].inTime && sc.runs[0].wn3Init === '2026-11-09T00Z' && sc.runs[1].wn3Init === '2026-11-08T00Z', 'W3 the operational run: 00 UTC of the day before the issue, published before 00 PKT of the issue', JSON.stringify(sc.runs));
  ok(c0 && c0[0] === 8 && Math.abs(c0[1] / 8 - 2) < 0.06 && Math.abs(c0[3] / 8) < 0.06 && Math.abs(c0[2] / 8 - 1) < 0.06, 'W3 T: served MAE 2, WN3-cal 0 (raw WN3 = truth - 2024 bias), blend+WN3 1 on the 8 three-hourly steps', JSON.stringify(c0));
  const w = sc.cells['W|plains|0|synop']; ok(w && Math.abs(w[1] / w[0] - 1) < 1e-6 && Math.abs(w[3] / w[0]) < 0.02 && !sc.cells['W|plains|0|mach'], 'W3 wind scored at the synoptic station only (MACH rooftop wind is not), in m/s', JSON.stringify(Object.keys(sc.cells)));
  const tx = sc.cells['TX|plains|1|mach']; ok(tx && tx[0] === 1 && Math.abs(tx[1] - 2) < 0.06, 'W3 daily maximum from the same 8 steps on every side', JSON.stringify(tx));
  const rk = sc.cont['R10|plains|0|mach|s'], rb = sc.cont['R10|plains|0|mach|b'], rw = sc.cont['R10|plains|0|mach|w'];
  ok(rk && rk[2] === 1 && rw && rw[0] === 1 && rb && rb[0] === 0 && rb[2] === 1, 'W3 heavy rain (>= 10 mm): served 0 mm = miss, WN3 12 mm = hit, blend 6 mm = miss, gauge 15 mm', JSON.stringify([rk, rb, rw]));
  ok(sc.cells['Td|plains|0|mach'] && Math.abs(sc.cells['Td|plains|0|mach'][3] / 8) < 0.06 && Math.abs(sc.cells['Td|plains|0|mach'][1] / 8) < 0.2, 'W3 dew point: served Td from served T and RH (Magnus), WN3-cal = truth');
  ok(sc.pairs.length > 0 && sc.pairs.every((p) => p[8] == null || (p[8] >= 21 && p[8] <= 66)), 'W3 every WN3 lead used lies in 21-66 h (tested range <= 72 h)');
  /* late publication: the 11-09 run published after 00 PKT 11-10 is not used for issue 11-10 */
  const late = new Map(runs); late.set(L.addDays(D, -1), { ...runs.get(L.addDays(D, -1)), published_utc: '2026-11-09T19:30:00' });
  const sl = VF.scoreWn3Shadow(D, st, FC, OB, RAIN, late, M, C, zoneOf); ok(!sl.runs[0].inTime && !sl.cells['T|plains|0|mach'] && sl.cells['T|plains|1|mach'], 'W3 a run published after 00 PKT of the issue is not used (that lead is not scored)', JSON.stringify(sl.runs));
}

/* ── W4 · the summary and the looks ── */
{ const mk = (i, s, b, feedOk = true) => ({ day: L.addDays('2026-11-04', i), wn3Shadow: { runs: { 0: { inTime: feedOk }, 1: { inTime: true } }, cells: { 'T|plains|0|mach': [40, 40 * s, 40 * b, 30, 0, 0, 0], 'T|plains|1|synop': [40, 40 * s, 40 * b, 30, 0, 0, 0] }, cont: {} } });
  const chk = VF.wn3RulesCheck(join(ROOT, 'data'), VF.loadWn3Config(join(ROOT, 'data')));
  ok(chk.ok, 'W4 the lock check passes on the shipped files', JSON.stringify(chk.why));
  const good = Array.from({ length: 40 }, (_, i) => mk(i, 1.6 + 0.05 * (i % 3), 1.3 + 0.04 * (i % 4)));
  const s0 = VF.wn3ShadowSummary(good, C, chk, Date.parse('2026-12-10T10:00:00Z'));
  ok(!s0.look && s0.passes.length === 0 && /collecting/.test(s0.why), 'W4 before 20 Dec 2026: collecting, no decision', s0.why);
  const s1 = VF.wn3ShadowSummary(good, C, chk, Date.parse('2026-12-21T10:00:00Z')); const t0 = s1.cells.find((x) => x.v === 'T' && x.lead === 0);
  ok(s1.look && s1.look.no === 1 && t0.decision === 'blend+WN3 better' && s1.passes.some((p) => p.v === 'T' && p.zone === 'plains'), 'W4 look 1: a better blend passes (T plains), interval above 0', JSON.stringify(t0));
  const worse = Array.from({ length: 40 }, (_, i) => mk(i, 1.3 + 0.04 * (i % 4), 1.6 + 0.05 * (i % 3)));
  const s2 = VF.wn3ShadowSummary(worse, C, chk, Date.parse('2026-12-21T10:00:00Z')); ok(!s2.passes.length && s2.cells.find((x) => x.v === 'T' && x.lead === 0).decision === 'served better', 'W4 a worse blend: served better, no pass');
  const gap = good.map((r, i) => (i % 5 === 0 ? mk(i, 1.6, 1.3, false) : r)); const s3 = VF.wn3ShadowSummary(gap, C, chk, Date.parse('2026-12-21T10:00:00Z'));
  ok(!s3.passes.some((p) => p.v === 'T') && s3.feed[0].share < 0.9, 'W4 feed gate: the run in time on fewer than 90 % of the days -> no pass', JSON.stringify(s3.feed));
  const bad = { ...C, _sha256: 'x' }; const s4 = VF.wn3ShadowSummary(good, bad, VF.wn3RulesCheck(join(ROOT, 'data'), bad), Date.parse('2026-12-21T10:00:00Z'));
  ok(!s4.passes.length && /differs from the lock/.test(s4.reasons.join()), 'W4 a changed configuration fails the lock: nothing can pass', s4.reasons.join());
  const few = VF.wn3ShadowSummary(good.slice(0, 20), C, chk, Date.parse('2026-12-21T10:00:00Z')); ok(few.cells.every((x) => x.decision === 'not judged (too few)'), 'W4 fewer than 30 days: not judged');
  process.env.NIGRAAN_WN3_SHADOW = '0'; ok(VF.loadWn3Config(join(ROOT, 'data')) === null && VF.wn3ShadowSummary(good, null, chk).assessed === false, 'W4 NIGRAAN_WN3_SHADOW=0: no configuration is read'); delete process.env.NIGRAAN_WN3_SHADOW; }

/* ── W5 · switch off = byte-identical; nothing served reads WN3 ── */
{ const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const readers = readdirSync(API).filter((f) => /\.mjs$/.test(f)).filter((f) => /wn3-shadow|archive['"], ['"]wn3|wn3shadow|wn3_live/.test(strip(readFileSync(join(API, f), 'utf8'))));
  /* v283.51g3 · jobrun.mjs names wn3_live_import.py only in its time-limit table (the job's normal run), it reads no WN3 file */
  ok(readers.sort().join() === 'index.mjs,jobrun.mjs,pyjobs.mjs', 'W5 only the operator route / Methods line (index.mjs), the import job (pyjobs.mjs) and its time-limit table (jobrun.mjs) name the WN3 files; no forecast chain module does', readers.join());
  const ix = strip(readFileSync(join(API, 'index.mjs'), 'utf8')); const ri = ix.indexOf("'/api/ops/wn3shadow'"); const route = ix.slice(ri, ri + 900);
  ok(/localOrSigned\(req\)/.test(route) && /served: false/.test(route), 'W5 /api/ops/wn3shadow is operator-scoped and says served: false');
  const pj = strip(readFileSync(join(API, 'pyjobs.mjs'), 'utf8')); ok(/NIGRAAN_WN3_SHADOW !== '0' \? \[\{ id: 'wn3Import'/.test(pj), 'W5 the import job exists only while NIGRAAN_WN3_SHADOW is not 0');
  const S = await import(pathToFileURL(join(API, 'sources.mjs')).href); let src = null; try { src = JSON.stringify(S.createSources(join(ROOT, 'data')).list ? S.createSources(join(ROOT, 'data')).list() : ''); } catch (_) { src = ''; }
  ok(!/weathernext ?3|WeatherNext 3/i.test(src || ''), 'W5 the Sources page lists no WeatherNext 3 entry (credit kept out of the licence headers)');
  /* the whole verification run on a small world: 1.0.8 agent, this agent with the switch off, this agent with the shadow on */
  const W = mkdtempSync(join(tmpdir(), 'v47wn3run-')); const WD = join(W, 'data'), CP = join(W, 'own'), LK = join(W, 'lake'); mkdirSync(join(WD, 'archive', 'forecast'), { recursive: true }); mkdirSync(CP, { recursive: true }); mkdirSync(join(LK, 'archive', 'fleet', 'db'), { recursive: true });
  for (const f of ['obs-qc-params.json', 'fleet-range-screen.json']) if (existsSync(join(ROOT, 'data', f))) copyFileSync(join(ROOT, 'data', f), join(WD, f));
  writeFileSync(join(WD, 'mach-fleet-stations.json'), JSON.stringify({ stations: [{ key: 'lhr1', name: 'Lahore 1', lat: 31.5001, lon: 74.3001 }] })); writeFileSync(join(WD, 'synop-stations.json'), JSON.stringify({ stations: {} }));
  writeFileSync(join(WD, 'pk-tehsils.json'), JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { uid: 'Punjab|Lahore|Lahore City' }, geometry: { type: 'Polygon', coordinates: [[[74.0, 31.2], [74.7, 31.2], [74.7, 31.8], [74.0, 31.8], [74.0, 31.2]]] } }] }));
  const lines = []; for (const I of ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']) { const f = served(I); lines.push(JSON.stringify({ d: I, u: 'Punjab|Lahore|Lahore City', lat: f.lat, lon: f.lon, t0: new Date(f.t0).toISOString(), n: f.n, T: f.T, RH: f.RH.map((x) => Math.round(x)), P: f.P, W: f.W.map((x) => Math.round(x * 10) / 10), z: 'plains', sel: 215 })); }
  writeFileSync(join(WD, 'archive', 'forecast', 'fc_2026-11.jsonl.gz'), gzipSync(lines.join('\n') + '\n'));
  const csv = ['station_key,time,source,provider,temperature_c,dew_point_c,humidity_pct,wind_speed_kmh,precip_total_mm,precip_rate_mmhr']; let pt = 0;
  for (let ms = L.dayStartMs('2026-11-05'); ms <= L.dayStartMs('2026-11-11') + 6 * H; ms += 10 * 60e3) { const ph = (ms / H + 5) % 24; if (ph > 3 && ph < 4) pt += 0.0; csv.push(['lhr1', new Date(ms).toISOString().replace('.000', ''), 'mach', 'mach', (truthT(ms) + 0.05 * Math.sin(ms / 7e5)).toFixed(2), truthTd(ms).toFixed(2), '', (truthW(ms) * 3.6).toFixed(1), pt.toFixed(1), '0'].join(',')); }
  writeFileSync(join(LK, 'archive', 'fleet', 'db', 'mach_db_2026-11.csv'), csv.join('\n') + '\n');
  copyFileSync(join(ROOT, 'data', 'wn3-shadow.json'), join(WD, 'wn3-shadow.json')); mkdirSync(join(WD, 'evidence', 'wn3'), { recursive: true }); copyFileSync(join(ROOT, 'data', 'evidence', 'wn3', 'RULES_WN3_LIVE_SHADOW_20261102.md'), join(WD, 'evidence', 'wn3', 'RULES_WN3_LIVE_SHADOW_20261102.md'));
  if (havePy) { mkdirSync(join(WD, 'archive', 'wn3'), { recursive: true }); for (const f of readdirSync(join(DATA, 'archive', 'wn3'))) copyFileSync(join(DATA, 'archive', 'wn3', f), join(WD, 'archive', 'wn3', f)); }
  const NOWr = Date.parse('2026-11-11T06:00:00Z');
  async function runAgent(modPath, dataDir, env) { const keep = process.env.NIGRAAN_WN3_SHADOW; if (env == null) delete process.env.NIGRAAN_WN3_SHADOW; else process.env.NIGRAAN_WN3_SHADOW = env;
    const M = await import(pathToFileURL(modPath).href + '?r=' + Math.random()); await M.run({ dataDir, copiesDir: CP, lake: LK, day: '2026-11-10', now: NOWr });
    if (keep == null) delete process.env.NIGRAAN_WN3_SHADOW; else process.env.NIGRAAN_WN3_SHADOW = keep;
    const rd = (f) => { try { return readFileSync(join(dataDir, 'agents', 'verify', f), 'utf8'); } catch (_) { return null; } }; return { ledger: rd('ledger.jsonl'), summary: rd('summary.json'), promo: rd('wn3-shadow-promotion.json'), pairs: existsSync(join(dataDir, 'archive', 'wn3shadow', '2026-11-10.json.gz')) }; }
  const cp = (to) => { const d = join(W, to); rmSync(d, { recursive: true, force: true }); spawnSync(process.platform === 'win32' ? 'xcopy' : 'cp', process.platform === 'win32' ? [WD, d, '/E', '/I', '/Q'] : ['-r', WD, d]); return d; };
  const dOff = cp('d_off'), dOn = cp('d_on'); const off = await runAgent(join(ROOT, 'scripts', 'agents', 'verify.mjs'), dOff, '0'); const on = await runAgent(join(ROOT, 'scripts', 'agents', 'verify.mjs'), dOn, null);
  const lOn = on.ledger ? on.ledger.trim().split('\n').map((l) => { const r = JSON.parse(l); delete r.wn3Shadow; return JSON.stringify(r); }).join('\n') + '\n' : null;
  const sOn = on.summary ? (() => { const s = JSON.parse(on.summary); delete s.wn3Shadow; return JSON.stringify(s, null, 1); })() : null;
  ok(off.ledger && JSON.parse(off.ledger.trim().split('\n').pop()).S && Object.keys(JSON.parse(off.ledger.trim().split('\n').pop()).S).length > 0, 'W5 the small world is scored by the agent (served cells present)', String(off.ledger).slice(0, 300));
  ok(off.ledger && !/wn3Shadow/.test(off.ledger) && !/wn3Shadow/.test(off.summary) && !off.promo && !off.pairs, 'W5 switch off: no wn3Shadow field, no promotion file, no pairs archive');
  ok(lOn === off.ledger && sOn === JSON.stringify(JSON.parse(off.summary), null, 1), 'W5 shadow on: every served cell of the ledger and the summary byte-identical to the switch-off run (only the wn3Shadow field is added)');
  if (havePy) { const r = JSON.parse(on.ledger.trim().split('\n').pop()); ok(r.wn3Shadow && r.wn3Shadow.cells && r.wn3Shadow.cells['T|plains|0|mach'] && on.promo && on.pairs, 'W5 shadow on: the day carries wn3Shadow cells, the pairs archive and the promotion file are written', String(JSON.stringify(r.wn3Shadow)).slice(0, 300)); }
  const BASE = process.env.NIGRAAN_BASE_TREE || join(ROOT, '..', 'v28345');
  if (existsSync(join(BASE, 'scripts', 'agents', 'verify.mjs'))) { const dB = cp('d_base'); const b = await runAgent(join(BASE, 'scripts', 'agents', 'verify.mjs'), dB, null);
    ok(b.ledger === off.ledger && b.summary === off.summary, 'W5 switch off = the 1.0.8 agent byte for byte (ledger and summary) on the same world', (b.ledger || '').slice(0, 200) + ' | ' + (off.ledger || '').slice(0, 200)); }
  else ok(true, 'W5 base comparison skipped (no 1.0.8 tree at ' + BASE + ')'); }
console.log('wn3shadow47: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
