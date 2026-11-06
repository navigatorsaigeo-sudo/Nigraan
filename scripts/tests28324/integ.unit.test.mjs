/* v91.17.283.24 . INTEGRATION FOLLOW-UPS (offline: no server, no provider, no network)
     I1  verify.mjs reads the screening band cuts from the register (scalecuts.mjs / data/hazard-scale.json screeningCuts); none typed
     I2  the general alert minimum is the gate's: data/model-gate.slim.json (what GET /api/registry/gate and the engine hosts serve) carries
         alertMinClassRank = model-gate.json alert_min_class_rank; the MACH page and its science module read it; no gate -> no general alert
     I3  the limits view says "served forecast" for 0-72 h (server H13), never "named run"
     I4  heavy rain method d: the served label "Low or heavier" (served.mjs levelLabelOf) in the unit answer, the national answer (labels)
         and the prose; the three pages show the served label (MACH, START, NIGRAAN_3)
     I5  the one-time Open-Meteo archive job (omarchive.mjs) with a mocked provider: files, resume, daily share and pacing, budget refusal,
         lowest tier, sources = the served chain, the key never written, completion and the status in /api/ops/pyjobs
     I6  exp_exclusion.py is out of the tree; the tests28310e compile list does not name it
   usage: node scripts/tests28324/integ.unit.test.mjs */
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
const imp = (f) => import(pathToFileURL(join(API, f)).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const rd = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const MACH = rd('artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), START = rd('artefact', 'NIGRAAN_START.html'), N3 = rd('artefact', 'NIGRAAN_3.html');

/* ---- I1 ---- */
{ const v = rd('scripts', 'agents', 'verify.mjs'); const SC = await imp('scalecuts.mjs');
  ok(/import \{ levelOfScreeningScore \} from '\.\.\/\.\.\/server\/api\/scalecuts\.mjs'/.test(v) && /const bandOf = \(s\) => \(s == null \? null : levelOfScreeningScore\(s\)\);/.test(v) && !/>= 82 \?|>= 65 \?/.test(v),
    'I1 verify.mjs bandOf reads the register cuts (no typed 25/45/65/82)');
  const H = JSON.parse(rd('data', 'hazard-scale.json')), mins = Object.fromEntries(H.screeningCuts.map((c) => [c.level, c.min]));
  ok(SC.levelOfScreeningScore(mins.Low - 0.1) === 0 && SC.levelOfScreeningScore(mins.Low) === 1 && SC.levelOfScreeningScore(mins.Severe) === 4 && SC.levelOfScreeningScore(null) === null,
    'I1 the register band of a score (values unchanged: ' + [mins.Low, mins.Moderate, mins.High, mins.Severe].join('/') + ')'); }

/* ---- I2 ---- */
{ const G = JSON.parse(rd('data', 'model-gate.json')), SL = JSON.parse(rd('data', 'model-gate.slim.json')), B = JSON.parse(rd('build', 'gen', 'gate.slim.json'));
  ok(SL.alertMinClassRank === G.alert_min_class_rank.value && B.alertMinClassRank === G.alert_min_class_rank.value, 'I2 the served slim gate carries alertMinClassRank = the gate register (' + SL.alertMinClassRank + ')');
  const { SERVER_FILES } = await import(pathToFileURL(join(ROOT, 'server', 'engine', 'serverfiles.mjs')).href);
  ok(SERVER_FILES['/api/registry/gate'] === 'model-gate.slim.json', 'I2 the engine hosts answer /api/registry/gate from the same file');
  ok(!/var ALERT_MIN_CLASS_RANK = 3;/.test(MACH) && /var ALERT_MIN_CLASS_RANK = \(function\(\)\{ try\{ var r=window\.AGN_MODEL_GATE&&window\.AGN_MODEL_GATE\.alertMinClassRank;/.test(MACH), 'I2 the MACH page reads the rank from the gate (no typed 3)');
  const a = MACH.indexOf('var ALERT_MIN_CLASS_RANK = ('), b = MACH.indexOf('try{ window.agnAlertLevelOk = agnAlertLevelOk; }catch(_){}', a); const code = MACH.slice(a, b);
  const run = (gate) => { const c = vm.createContext({ window: { AGN_MODEL_GATE: gate } }); vm.runInContext(code + ';this.R=ALERT_MIN_CLASS_RANK;this.ok=agnAlertLevelOk;', c); return c; };
  const c1 = run(SL), c0 = run(null);
  ok(c1.R === 3 && c1.ok('quake', 3) === true && c1.ok('quake', 2) === false && c1.ok('wind', 4) === false, 'I2 with the gate: rank 3 for a hazard the gate lets alert with no per-level policy (High alerts, Moderate does not); wind may not alert');
  ok(c0.R === null && c0.ok('wind', 4) === false, 'I2 without the gate: no rank and no general alert (never a typed rank)');
  const mods = readdirSync(join(ROOT, 'server', 'science', 'modules')).map((f) => readFileSync(join(ROOT, 'server', 'science', 'modules', f), 'utf8')).join('\n');
  ok(!/var ALERT_MIN_CLASS_RANK = 3;/.test(mods) && /window\.AGN_MODEL_GATE\.alertMinClassRank/.test(mods), 'I2 the server science modules (engine host) carry the same reading'); }

/* ---- I3 ---- */
{ const i = MACH.indexOf("pCrossings:{title:'Operating-limit crossings"); const seg = MACH.slice(i, i + 400);
  ok(/against the served forecast at the place \(0-72 h\)/.test(seg), 'I3 the crossings section says the served forecast (0-72 h)');
  ok(!/against the named run and the ensemble|Physical check at each asset<\/b> \(named run|moved onto the named run at each asset|Named run \+ ensemble|': named run '/.test(MACH), 'I3 no "named run" left in the limits view');
  ok(/Served forecast \+ ensemble/.test(MACH) && /'0–72 h, the served forecast at the place/.test(rd('server', 'api', 'limits.mjs')), 'I3 the page words match limits.mjs horizons.near');
  ok(!/for the named run 0-72 h and each ensemble member/.test(rd('server', 'api', 'skill.mjs')), 'I3 the skill record no longer says the IFS calibration is applied to the named run'); }

/* ---- I4 ---- */
{ const S = await imp('served.mjs'), { createEngine } = await imp('engine.mjs');
  const fD = { method: 'd', calibrated: true, tested: true, lowOrHeavier: true, levelLabel: 'Low or heavier', probability: { '15.6': 41 }, status: { '15.6': 'tested' }, text: 'x' };
  ok(S.levelLabelOf('rain_hz', 1, fD) === 'Low or heavier' && S.levelLabelOf('rain_hz', 0, { ...fD, levelLabel: undefined }) === null && S.levelLabelOf('heat', 1, fD) === null
    && S.levelLabelOf('rain_hz', 1, { calibrated: true, levelLabel: 'Low or heavier' }) === null, 'I4 levelLabelOf: only a method-d tested Low');
  const dir = mkdtempSync(join(tmpdir(), 'i4-'));
  try { const E = createEngine({}, dir, { port: 1 });
    const rec = { at: new Date().toISOString(), words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], unitKeys: { a: 'P|A|a', b: 'P|B|b' },
      days: [{ day: 1, date: '2026-10-28', basis: 'peak', layers: { heat: { L: { a: 0, b: 0 }, S: {}, counts: [2, 0, 0, 0, 0], na: 0, nd: 0 },
        rain_hz: { L: { a: 1, b: 1 }, S: { a: 41, b: 20 }, counts: [0, 2, 0, 0, 0], na: 0, nd: 0, facts: { a: fD, b: { calibrated: true, method: 'ens', status: { '15.6': 'untested' }, probability: { '15.6': 20 } } } } } }], alerts: [] };
    const r = E.report(rec); E.latest() && (E.latest().received = new Date().toISOString());
    E.latest().days[0].layers.rain_hz.facts = rec.days[0].layers.rain_hz.facts;   /* the server's rain step (hazsci.mjs applyRain) writes the facts after the page report */
    const N = E.levels('rain_hz', 1, false);
    ok(r && r.ok && N && N.labels && N.labels.a === 'Low or heavier' && !('b' in N.labels), 'I4 the national answer carries labels for the method-d Low cell only', JSON.stringify(N && N.labels));
    const app = { engine: E, gate: { full: () => ({ ready: true, client_rules: {} }), entryOf: () => null } };
    const U = S.servedUnit(app, 'a'), V = U && U.ready && U.days[0].layers.rain_hz;
    ok(V && V.levelLabel === 'Low or heavier' && V.word === 'Low' && /^Low or heavier/.test(S.levelPhrase(V)), 'I4 the unit answer: word Low, levelLabel "Low or heavier"; the prose phrase says the label', V && JSON.stringify({ w: V.word, l: V.levelLabel, p: S.levelPhrase(V) }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  /* START: lw and labWord */
  { const g = (re) => { const m = re.exec(START); return m ? m[0] : ''; };
    const code = 'var WORDS=["Normal","Low","Moderate","High","Severe"]; function fin(x){ return x!=null&&x!==""&&isFinite(+x); }' + g(/function lw\(r\)\{[^\n]*\}/) + '\n' + g(/function labWord\(i,LV,LB\)\{[^\n]*\}/) + '\nthis.lw=lw; this.labWord=labWord;';
    const c = vm.createContext({}); vm.runInContext(code, c);
    ok(c.lw({ i: 1, label: 'Low or heavier' }) === 'Low or heavier' && c.lw({ i: 1 }) === 'Low' && c.labWord(1, { a: 1, b: 1 }, { a: 'Low or heavier', b: 'Low or heavier' }) === 'Low or heavier'
      && c.labWord(1, { a: 1, b: 1 }, { a: 'Low or heavier' }) === 'Low / Low or heavier' && c.labWord(2, { a: 2 }, {}) === 'Moderate', 'I4 START: the served label in the cells, the tiles, the key and the peak line');
    ok(/label:\(i>=0&&x\.levelLabel\)\|\|null/.test(START) && /S\.hzLab=why\?\{\}:\(M\.labels\|\|\{\}\)/.test(START) && /lvl\(h\.peak\.i,null,h\.peak\.label\)/.test(START), 'I4 START reads levelLabel (unit answer) and labels (national answer)'); }
  /* NIGRAAN_3 */
  { const g = (re) => { const m = re.exec(N3); return m ? m[0] : ''; };
    const c = vm.createContext({}); vm.runInContext(g(/function lvw\(y\)\{[^\n]*\}/) + '\n' + g(/function labWord\(i,X,w\)\{[^\n]*\}/) + '\nthis.lvw=lvw; this.labWord=labWord;', c);
    ok(c.lvw({ level: 1, word: 'Low', levelLabel: 'Low or heavier' }) === 'Low or heavier' && c.lvw({ level: -1, word: 'no data', levelLabel: 'x' }) === 'no data' && c.labWord(1, { levels: { a: 1 }, labels: { a: 'Low or heavier' } }, 'Low') === 'Low or heavier',
      'I4 NIGRAAN_3: lvw and the map key read the served label');
    ok(/w\.word=lvw\(x\)/.test(N3) && /rkLv\(y\.level,lvw\(y\)\)/.test(N3) && /pill\(x\.level,lvw\(x\)\)/.test(N3), 'I4 NIGRAAN_3: site rows, hazard table and panel use the served label'); }
  /* MACH */
  ok(/c\.labels=j\.labels\|\|null;/.test(MACH) && /\{i:(?:\+v|q\.i), label:\(s\.labels&&s\.labels\[uid\]\)\|\|null(?:, kind:s\.kind)?\}/.test(MACH) /* v283.31: the served state (stOf) gives i */ && /levelLabel:y\.levelLabel\|\|null/.test(MACH) && /label:\(i!=null&&L\.levelLabel\)\|\|null/.test(MACH)
    && /function cw\(c\)\{ return c&&c\.label\?c\.label:lvWord\(c\?c\.i:null\); \}/.test(MACH) && /esc\(x\.r\.label\|\|W5\[x\.i\]\)/.test(MACH) && /uw=\(IS\.label\|\|W5L\[IS\.i\]\)\+' \(issued run\)'/.test(MACH)
    && /if\(lb&&lb\.n>0\) it\.label=lb\.n>=t\.c\[it\.lv\]\?lb\.txt:it\.label\+' \/ '\+lb\.txt;/.test(MACH) && /lvChip\(x\.word,x\.levelLabel\)/.test(MACH), 'I4 MACH: the map run, popups, key, right panel, report rows, report context and engine result read the served label'); }

/* ---- I5 ---- */
{ const OM = await imp('omarchive.mjs'), { MODEL_IDS } = await imp('blend.mjs');
  const job = JSON.parse(rd('data', 'retrain', 'om_archive.job.json'));
  { const pool = readFileSync(join(ROOT, 'server', 'api', 'pool.mjs'), 'utf8'); ok(job.sources[0] === 'best_match' && job.sources.slice(1).every((m) => pool.includes("'" + m + "'") || pool.includes(m + ':')), 'I5 sources = best_match + served pool models'); ok(OM.runDays('2024-03-01', '2024-03-10', 3).join() === '2024-03-01,2024-03-04,2024-03-07,2024-03-10', 'I5b every 3rd run'); }
  const P = rd('data', 'retrain', 'om_points.csv').trim().split('\n');
  ok(P[0] === 'pid,lat,lon' && P.length === 299 && P.slice(1).every((l) => /^\d+,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(l)), 'I5 the points list: 298 matched stations, pid lat lon only (no names)');
  const PB = JSON.parse(rd('data', 'provider-budget.json'));
  /* a small tree: 3 points, 2 sources, 3 runs */
  const D = mkdtempSync(join(tmpdir(), 'i5-')); mkdirSync(join(D, 'retrain'), { recursive: true });
  writeFileSync(join(D, 'retrain', 'om_points.csv'), 'pid,lat,lon\n0,33.665,73.083\n1,24.86,67.01\n2,31.52,74.35\n');
  writeFileSync(join(D, 'retrain', 'om_archive.job.json'), JSON.stringify({ ...job, runEveryDays: 1, firstRun: '2024-01-01', sources: ['best_match', 'ecmwf_ifs025'], pointsPerCall: 2, lastRunLagHours: 6 }));
  const SECRET = 'SECRET-KEY-123';
  let T = Date.parse('2024-01-03T12:00:00Z'); const now = () => T;
  const calls = []; let failNext = null;
  const provider = { configured: () => true, call: async (kind, path, q, o) => { calls.push({ kind, path, q, o }); if (failNext) { const e = failNext; failNext = null; throw e; }
    if (q.models === 'ecmwf_ifs025' && q.run.startsWith('2024-01-02')) return [{ latitude: 33.665, longitude: 73.083, elevation: 500, hourly: { time: ['2024-01-02T00:00'], temperature_2m: [null] } }];
    const la = String(q.latitude).split(','), lo = String(q.longitude).split(','); const init = Date.parse(q.run + ':00Z');
    const rows = la.map((x, k) => { const time = [], h = {}; for (const v of q.hourly) h[v] = []; for (let L = 0; L <= 96; L++) { time.push(new Date(init + L * 3600e3).toISOString().slice(0, 16)); for (const v of q.hourly) h[v].push(Math.round(10 * (L / 10 + k)) / 10); }
      return { latitude: Number(x), longitude: Number(lo[k]), elevation: 400 + k, hourly: { time, ...h } }; });
    return rows.length === 1 ? rows[0] : rows; } };
  let cap = 1000, used = 0; const tierCalls = [];
  const budget = { limits: () => ({ cap, shedAt: 0.8 * cap }), status: () => ({ usedWeighted: used }), runAs: (cls, fn, tag) => { tierCalls.push({ cls, tag }); return fn(); },
    tierOf: (info) => { const r = PB.tierRules.find((x) => x.tags && x.tags.some((p) => (p.endsWith('*') ? String(info.tag).startsWith(p.slice(0, -1)) : p === info.tag))); return r ? { id: r.tier } : null; } };
  const A = OM.createOmArchive({ dataDir: D, provider, budget, env: {}, now });
  /* pacing: 12:00 UTC + one tick -> about half the day's share (0.2 x 1000 x ~0.51 = 101): the 3 runs x 2 sources x 3 points fit */
  let r = await A.tick('test'); let st = A.status();
  ok(r.ran && st.complete === true && st.done === 5 && st.skipped === 1, 'I5 a tick fetches every source run that fits, skips a run the source does not hold and completes', JSON.stringify({ r, done: st.done, sk: st.skipped }));
  const f = join(D, 'retrain', 'om_archive', 'best_match', '2024-01-01.csv.gz'); const csv = existsSync(f) ? gunzipSync(readFileSync(f)).toString('utf8').trim().split('\n') : [];
  ok(csv[0] === 'pid,src,init_utc,valid_utc,lead_h,temperature_2m,dew_point_2m,wind_speed_10m,wind_gusts_10m,cloud_cover,precipitation,grid_elevation_m' && csv.length === 1 + 3 * 97
    && csv[1] === '0,best_match,2024-01-01T00:00Z,2024-01-01T00:00Z,0,0,0,0,0,0,0,400' && csv[csv.length - 1].startsWith('2,best_match,2024-01-01T00:00Z,2024-01-05T00:00Z,96,'), 'I5 one gzip CSV per source and run: columns, 3 points x leads 0-96, grid elevation', csv[1] + ' | ' + csv[csv.length - 1]);
  const q0 = calls[0].q;
  ok(calls.every((c) => c.kind === 'singleRuns' && c.path === '/v1/forecast') && q0.run === '2024-01-01T00:00' && q0.forecast_hours === '97' && q0.elevation === 'nan' && q0.wind_speed_unit === 'ms' && calls[0].o.locations === 1 && calls[1].o.locations === 2,
    'I5 Single Runs archive, run=YYYY-MM-DDT00:00, 97 hours, grid elevation (nan), wind in m/s; the first point alone, then batches');
  ok(tierCalls.every((x) => x.cls === 'background' && x.tag === job.tag) && budget.tierOf({ tag: job.tag }).id === 'P6' && PB.tiers[PB.tiers.length - 1].id === 'P6', 'I5 every call is background with the job tag: the lowest tier (P6)');
  const all = readdirSync(join(D, 'retrain', 'om_archive'), { recursive: true }).filter((x) => /\.(json|gz)$/.test(x)).map((x) => { const b = readFileSync(join(D, 'retrain', 'om_archive', x)); return x.endsWith('.gz') ? gunzipSync(b).toString() : b.toString(); }).join('\n');
  ok(!all.includes(SECRET) && !/apikey/i.test(all) && !/apikey/i.test(JSON.stringify(st)), 'I5 no key or URL in the files, the state or the status');
  const n0 = calls.length; r = await A.tick('again'); ok(r.complete === true && calls.length === n0, 'I5 complete: a later tick does nothing (runs once)');
  ok(st.estimate && st.estimate.weightedPerSourceRun === 3 && st.estimate.totalWeighted === 18 && st.estimate.jobDailyWeighted === 200, 'I5 the estimate: weight per source run and the total', JSON.stringify(st.estimate));
  rmSync(D, { recursive: true, force: true });
  /* resume, share, refusal: 5 runs, cap so small the share allows one source run a day */
  const D2 = mkdtempSync(join(tmpdir(), 'i5b-')); mkdirSync(join(D2, 'retrain'), { recursive: true });
  writeFileSync(join(D2, 'retrain', 'om_points.csv'), 'pid,lat,lon\n0,33.665,73.083\n1,24.86,67.01\n');
  writeFileSync(join(D2, 'retrain', 'om_archive.job.json'), JSON.stringify({ ...job, runEveryDays: 1, sources: ['best_match'], pointsPerCall: 2, firstRun: '2024-01-01' }));
  T = Date.parse('2024-01-06T23:50:00Z'); cap = 10; calls.length = 0;   /* share 0.2 x 10 = 2 weighted a day = one source run of 2 points */
  let B = OM.createOmArchive({ dataDir: D2, provider, budget, env: {}, now }); r = await B.tick('d1'); st = B.status();
  ok(st.done === 1 && /share is spent|paced/.test(r.stop || '') && st.spentToday === 2, 'I5 the day\'s share (dailyShareOfCap x cap) is never exceeded', JSON.stringify({ r, d: st.done, s: st.spentToday }));
  /* the laptop was off: a new process two days later resumes from the files and the state (the last run stays the one fixed at the first start) */
  T += 2 * 864e5; B = OM.createOmArchive({ dataDir: D2, provider, budget, env: {}, now }); r = await B.tick('d3'); st = B.status();
  ok(st.done === 2 && st.runs.startsWith('2024-01-01 .. 2024-01-06') && st.spentTotal === 4, 'I5 resumes after a restart; the run range is the one fixed at the first start', JSON.stringify({ d: st.done, runs: st.runs, t: st.spentTotal }));
  T += 864e5; used = 9; B = OM.createOmArchive({ dataDir: D2, provider, budget, env: {}, now }); r = await B.tick('busy');
  ok(r.stop && /background allowance/.test(r.stop) && B.status().done === 2, 'I5 a day busy with people\'s requests (use at the background allowance): the job waits', r.stop);
  used = 0; T += 864e5; failNext = Object.assign(new Error('Background refresh paused'), { status: 429, code: 'PROVIDER_QUOTA_EXHAUSTED' });
  B = OM.createOmArchive({ dataDir: D2, provider, budget, env: {}, now }); r = await B.tick('refused');
  ok(/call budget refused/.test(r.stop || '') && B.status().done === 2 && B.status().skipped === 0, 'I5 a budget refusal stops the day without skipping the run', r.stop);
  B = OM.createOmArchive({ dataDir: D2, provider, budget, env: { NIGRAAN_OM_ARCHIVE: '0' }, now }); r = await B.tick('off'); ok(r.ran === false && /off/.test(r.why), 'I5 NIGRAAN_OM_ARCHIVE=0 turns it off');
  const B2 = OM.createOmArchive({ dataDir: D2, provider, budget: { ...budget, limits: () => null }, env: {}, now }); r = await B2.tick('nocap'); ok(/no daily cap/.test(r.stop || ''), 'I5 with no daily cap it does not run');
  rmSync(D2, { recursive: true, force: true });
  /* the status on /api/ops/pyjobs */
  const IX = rd('server', 'api', 'index.mjs'); ok(/omArchive: app\.omArchive \? app\.omArchive\.status\(\) : null/.test(IX) && /createOmArchive\(\{ dataDir, provider, budget: callBudget/.test(IX), 'I5 started by the server with its provider and call budget; status on GET /api/ops/pyjobs');
  /* the full estimate for the shipped job */
  const full = OM.weightPerRun(job, OM.readPoints(join(ROOT, 'data')).length) * OM.runDays(job.firstRun, '2026-10-27', job.runEveryDays).length * job.sources.length; console.log('     full archive estimate: ' + full + ' weighted calls');
  ok(full > 0, 'I5 estimate computed'); }

/* ---- I6 ---- */
{ ok(!existsSync(join(ROOT, 'scripts', 'agents', 'exp', 'exp_exclusion.py')) && existsSync(join(ROOT, '_to_delete', 'v283_24', 'scripts', 'agents', 'exp', 'exp_exclusion.py')), 'I6 exp_exclusion.py moved to _to_delete/v283_24 (relative path kept)');
  const T10 = readdirSync(join(ROOT, 'scripts', 'tests28310e'), { recursive: true }).filter((x) => /\.m?js$/.test(x)).map((x) => readFileSync(join(ROOT, 'scripts', 'tests28310e', x), 'utf8')).join('\n');
  ok(!/exp_exclusion\.py/.test(T10), 'I6 the tests28310e compile list no longer names it'); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
