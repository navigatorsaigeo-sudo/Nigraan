import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.73 · AI local correction on the served path (agent A): verification.mjs zoneCalibration / aiOnly, mos.stretchAdj,
   outlook.mjs members, pool.mjs dissent band, national sweep inputs.
   node scripts/tests73/ai_serving.test.mjs [baseUrl] [--killed]
     default   the server runs normally: the AI code appears where applied (mountain away from a station site, plains without a
               running correction) and nowhere else (station sites, hills, coast, a response without the model inputs); the
               hourly strip and the day card agree (T4 = 0.00 C); the pool's dissent against the served curve is not worse than
               the kill-switch baseline (if recorded); the ensemble P50 vs the day card likewise.
     --killed  the server runs with NIGRAAN_AI_DOWNSCALE=0: no AI code anywhere; records the baseline dissent figures.
   PASS/FAIL/SKIP lines; exit 1 on any FAIL. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDownscale } from '../../server/api/downscale.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const BASE = args.find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787';
const KILLED = args.includes('--killed');
const DATA = process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data');
const STATE = process.env.NIGRAAN_TEST_STATE || join(__T.TMP, 'nigraan_ai_serving_baseline.json');
const LABELS = JSON.parse(readFileSync(join(DATA, 'source-labels.json'), 'utf8'));
const FORBID = LABELS.forbiddenInCustomerOutput || [];
const AI_LABEL = 'AI local correction (terrain and land surface)';
let fails = 0; let BASELINE = null; const RECORD = {};
const pass = (n, d = '') => console.log('PASS ' + n + (d ? ' · ' + d : ''));
const fail = (n, d = '') => { fails++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); };
const skip = (n, d = '') => console.log('SKIP ' + n + (d ? ' · ' + d : ''));
const ok = (c, n, d) => c ? pass(n, d) : fail(n, d);
const HD = { 'Sec-Fetch-Site': 'same-origin' };
async function get(p) { const r = await fetch(BASE + p, { headers: HD }); const ct = r.headers.get('content-type') || ''; return { status: r.status, body: /json/.test(ct) ? await r.json() : await r.text() }; }
const px = (q) => get('/px/v1/forecast?' + new URLSearchParams({ __omhost: 'api.open-meteo.com', ...q }).toString());
function forbiddenIn(obj) {
  const hits = new Set(); const words = FORBID.map(w => new RegExp('(^|[^A-Za-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9]|$)'));
  const walk = (x) => { if (x == null) return; if (typeof x === 'string') { words.forEach((re, i) => { if (re.test(x)) hits.add(FORBID[i]); }); return; } if (Array.isArray(x)) return x.forEach(walk); if (typeof x === 'object') for (const [k, v] of Object.entries(x)) { walk(k); walk(v); } };
  walk(obj); return [...hits];
}
function dayCurve(j) {
  const Hh = j.hourly, D = j.daily; let n = 0, worst = 0;
  D.time.forEach((d, i) => { const v = Hh.time.map((t, k) => String(t).startsWith(d) ? Hh.temperature_2m[k] : undefined).filter(x => x !== undefined);
    if (v.length !== 24 || v.some(x => x == null)) return; n++; worst = Math.max(worst, Math.abs(Math.max(...v) - D.temperature_2m_max[i]), Math.abs(Math.min(...v) - D.temperature_2m_min[i])); });
  return { n, worst };
}
const HOURLY = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,cloud_cover,wind_speed_10m,precipitation';
const DAILY = 'temperature_2m_max,temperature_2m_min';
async function dissent(nm, la, lo, j) {
  const pool = await get(`/api/pool/point?lat=${la}&lon=${lo}&days=3`);
  if (pool.status !== 200 || !Array.isArray(pool.body.hourly)) return skip(nm + ': dissent vs pool P50', 'pool HTTP ' + pool.status);
  const ser = new Map(j.hourly.time.map((t, k) => [t, j.hourly.temperature_2m[k]]));
  let s = 0, n = 0; for (const x of pool.body.hourly) { if (!x.temperature || x.temperature.p50 == null) continue; const tl = new Date(Date.parse(x.t + 'Z') + 5 * 3600e3).toISOString().slice(0, 16); const v = ser.get(tl); if (v == null) continue; s += Math.abs(v - x.temperature.p50); n++; }
  const dis = n ? s / n : null; RECORD['pool_' + nm] = dis;
  if (dis == null) return skip(nm + ': dissent vs pool P50', 'no overlap');
  const b = BASELINE && BASELINE['pool_' + nm];
  if (KILLED || b == null) return pass(nm + ': dissent vs pool P50 measured', dis.toFixed(2) + ' C over ' + n + ' h' + (KILLED ? ' (baseline)' : ' (no kill-switch baseline recorded)'));
  ok(dis <= b + 0.05, nm + ': dissent vs pool P50 not worse than without the AI', dis.toFixed(2) + ' vs ' + b.toFixed(2) + ' C over ' + n + ' h');
}
const hasAi = (j) => { const b = j.agn_temperature_basis || {}; return /\+AI$/.test(b.correction || '') || !!b.aiLocal; };

(async () => {
  BASELINE = !KILLED && existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null; const baseline = BASELINE;
  const record = RECORD;
  const st = await get('/api/mos/status');
  const reqModels = st.body && st.body.temperatureBasis && st.body.temperatureBasis.request && st.body.temperatureBasis.request.models;
  if (!reqModels) { fail('zone request models known', 'HTTP ' + st.status); return done(); }

  /* ── 1 · mountain: station sites keep L0+SC; a point away from a site takes L0+SC+AI ── */
  const mountain = [['Gilgit', '35.92', '74.31'], ['Skardu', '35.30', '75.63'], ['Karimabad', '36.32', '74.66'], ['Shigar', '35.42', '75.73'], ['Astore', '35.37', '74.86'], ['Khaplu', '35.15', '76.33'], ['Minimarg', '34.78', '75.03']];
  let aiMountain = 0;
  for (const [nm, la, lo] of mountain) {
    const r = await px({ latitude: la, longitude: lo, hourly: HOURLY, daily: DAILY, forecast_days: '7', timezone: 'Asia/Karachi', models: reqModels });
    const j = r.body; if (r.status !== 200 || !j || !j.hourly) { fail(nm + ' zone request', 'HTTP ' + r.status); continue; }
    const b = j.agn_temperature_basis || {}; const cal = b.calibration || {};
    const dc = dayCurve(j);
    ok(dc.n >= 5 && dc.worst <= 0.05, nm + ': hourly strip = day card (T4)', dc.n + ' days, worst ' + dc.worst.toFixed(2) + ' C');
    if (b.zone !== 'mountain') { skip(nm + ': AI rule', 'zone ' + b.zone); continue; }
    const atSite = cal.via === 'site' || cal.via === 'site-annual';
    if (KILLED) { ok(!hasAi(j), nm + ': kill switch: no AI code', b.correction); await dissent(nm, la, lo, j); continue; }
    if (atSite) ok(b.correction === 'L0+SC' && !b.aiLocal && !cal.aiLocal, nm + ': station site keeps L0+SC, no AI', 'via ' + cal.via + ', ' + b.correction);
    else {
      const ai = b.aiLocal || {};
      ok(b.correction === 'L0+SC+AI' && ai.label === AI_LABEL && ai.tier === 'B' && cal.aiLocal, nm + ': away from a site the AI joins the calibration', 'via ' + cal.via + ', ' + b.correction + ', ' + ai.days + ' days');
      ok(!ai.internal && !('meanTxC' in ai), nm + ': AI provenance carries no figures on the default path');
      if (b.correction === 'L0+SC+AI') aiMountain++;
    }
    const h = forbiddenIn(j); ok(!h.length, nm + ': no supplier name', h.join(', '));
    ok(!/MACH(?! forecast)/i.test(JSON.stringify(b)), nm + ': not labelled MACH');
    await dissent(nm, la, lo, j);
  }
  if (!KILLED) ok(aiMountain >= 1, 'at least one mountain point away from a station site carries the AI', aiMountain + ' of ' + mountain.length);

  /* ── 2 · plains, hills, coast, missing inputs ── */
  const cases = [
    ['Lahore', '31.55', '74.34', 'best_match', 'plains'], ['Multan', '30.20', '71.47', 'best_match', 'plains'],
    ['Quetta', '30.18', '67.00', reqModels, 'hills'], ['Karachi', '24.86', '67.03', 'best_match', 'coast']];
  for (const [nm, la, lo, models, zone] of cases) {
    const r = await px({ latitude: la, longitude: lo, hourly: HOURLY, daily: DAILY, forecast_days: '7', timezone: 'Asia/Karachi', models });
    const j = r.body; if (r.status !== 200 || !j || !j.hourly) { fail(nm + ' request', 'HTTP ' + r.status); continue; }
    const b = j.agn_temperature_basis || {}; const dc = dayCurve(j);
    ok(dc.n >= 5 && dc.worst <= 0.05, nm + ': hourly strip = day card (T4)', dc.n + ' days, worst ' + dc.worst.toFixed(2) + ' C');
    if (KILLED || zone !== 'plains') { ok(!hasAi(j), nm + ': no AI code (' + (KILLED ? 'kill switch' : zone + ' not applied') + ')', b.zone + ' ' + b.correction); if (KILLED && zone === 'plains') await dissent(nm, la, lo, j); continue; }
    const bc = j.agn_bias_correction || {};
    if (b.correction === 'L0+L2' || (bc.urban && bc.urban.applied)) { ok(!hasAi(j), nm + ': a station-measured term applies, so no AI', b.correction); continue; }
    ok(b.correction === 'L0+AI' && b.aiLocal && b.aiLocal.label === AI_LABEL && bc.label === AI_LABEL && bc.tier === 'B', nm + ': plains AI-only stretch', b.correction + ', ' + (b.aiLocal && b.aiLocal.days) + ' days');
    ok(!forbiddenIn(j).length && !/MACH-verified|tier A/i.test(JSON.stringify(bc)), nm + ': provenance generic, no supplier name, not MACH-verified');
    await dissent(nm, la, lo, j);
    /* the same point without the model inputs: no AI (never a guessed input) */
    const r2 = await px({ latitude: la, longitude: lo, hourly: 'temperature_2m', daily: DAILY, forecast_days: '3', timezone: 'Asia/Karachi', models });
    if (r2.status === 200 && r2.body && r2.body.hourly) ok(!hasAi(r2.body), nm + ': a response without cloud / wind / rain gets no AI', (r2.body.agn_temperature_basis || {}).correction);
  }

  /* ── 3 · the ensemble P50 day 1 against the day card at the unit's settlement point (both carry the same AI term) ── */
  const UNITS = JSON.parse(readFileSync(join(HERE, '..', '..', 'server', 'contract', 'units.json'), 'utf8'));
  for (const nm of ['Gilgit', 'Skardu', 'Lahore', 'Multan']) {
    const ou = await get('/api/outlook/unit?unit=' + nm);
    const E = ou.body && ou.body.ensemble; const U = (ou.body && ou.body.unit) || {};
    if (ou.status !== 200 || !E || !E.basis || !E.days || !E.days[1] || !E.days[1].tx) { skip(nm + ': ensemble P50 vs day card', 'no ensemble on this server'); continue; }
    const cu = UNITS.find(x => x.unitId === U.unitId); if (!cu || U.elevM == null) { skip(nm + ': ensemble P50 vs day card', 'unit coordinates unknown'); continue; }
    const d1 = E.days[1]; const B = E.basis;
    const q = { latitude: String(cu.lat), longitude: String(cu.lon), elevation: String(U.elevM), hourly: HOURLY, daily: DAILY, forecast_days: '3', timezone: 'Asia/Karachi', models: B.reference === 'best_match' ? 'best_match' : reqModels };
    const full = await px(q), bare = await px({ ...q, hourly: 'temperature_2m' });   /* bare: no model inputs, so no AI (the card before) */
    const D = full.body && full.body.daily, D0 = bare.body && bare.body.daily; const k = D ? D.time.indexOf(d1.date) : -1;
    if (k < 0 || !D0) { skip(nm + ': ensemble P50 vs day card', 'dates do not overlap'); continue; }
    const cardAi = hasAi(full.body); const ai = B.aiLocal || null;
    if (KILLED) { ok(!cardAi, nm + ': kill switch: the unit\'s day card carries no AI'); ok(!ai, nm + ': kill switch: the members carry no AI (a stored run\'s term is taken back at serve time)'); continue; }
    ok(!!ai === cardAi, nm + ': the members carry the AI term exactly where the unit\'s day card does', 'card ' + (full.body.agn_temperature_basis || {}).correction + ', members ' + (ai ? 'AI' : 'none'));
    const tAx = D.temperature_2m_max[k] - D0.temperature_2m_max[k], tAn = D.temperature_2m_min[k] - D0.temperature_2m_min[k];
    if (ai) ok(Math.abs(tAx - ai.tx) <= 0.2 && Math.abs(tAn - ai.tn) <= 0.2, nm + ': members\' AI term = the day card\'s AI term (day 1)', 'members ' + ai.tx + ' / ' + ai.tn + ', card ' + tAx.toFixed(2) + ' / ' + tAn.toFixed(2));
    const after = Math.abs(d1.tx[1] - D.temperature_2m_max[k]) + Math.abs(d1.tn[1] - D.temperature_2m_min[k]);
    const before = Math.abs(d1.tx[1] - (ai ? ai.tx : 0) - D0.temperature_2m_max[k]) + Math.abs(d1.tn[1] - (ai ? ai.tn : 0) - D0.temperature_2m_min[k]);
    ok(after <= before + 0.1, nm + ': ensemble P50 vs day card not worse than without the AI', after.toFixed(2) + ' vs ' + before.toFixed(2) + ' C (|dTmax| + |dTmin|, day 1)');
  }

  /* ── 3b · the served terms survive a restart: data/ai-served-terms.json (header, model version, atomic write) ── */
  if (!KILLED) {
    const f = join(DATA, 'ai-served-terms.json');
    if (!existsSync(f)) fail('served AI terms persisted', f + ' missing (run the national sweep)');
    else { const J = JSON.parse(readFileSync(f, 'utf8')); const mv = JSON.parse(readFileSync(join(DATA, 'downscale-model.json'), 'utf8')).version;
      ok(!!J.built && !!J.method && !!J.source && J.n > 0 && J.version === mv, 'served AI terms persisted with built / method / source / n / model version', J.n + ' point-days, version ' + J.version + ', built ' + J.built);
      ok(!forbiddenIn(J).length, 'the served-terms file names no supplier'); }
  }

  /* ── 4 · the kill switch at module level ── */
  const prev = process.env.NIGRAAN_AI_DOWNSCALE; process.env.NIGRAAN_AI_DOWNSCALE = '0';
  const ds = createDownscale({ dataDir: DATA }); const r0 = ds.residualDay(31.55, 74.34, { date: '2026-06-10', tmax: 43, tmin: 30, cloudDay: 5, cloudNight: 5, windDay: 10, windNight: 6, precip: 0, servedElevM: 215, zone: 'plains' });
  ok(r0.applied === false && r0.dTx === 0 && r0.dTn === 0 && ds.status().on === false, 'NIGRAAN_AI_DOWNSCALE=0: residualDay not applied, status off');
  if (prev === undefined) delete process.env.NIGRAAN_AI_DOWNSCALE; else process.env.NIGRAAN_AI_DOWNSCALE = prev;
  const ds2 = createDownscale({ dataDir: DATA });
  const r1 = ds2.residualDay(31.55, 74.34, { date: '2026-06-10', tmax: 43, tmin: 30, cloudDay: 5, cloudNight: 5, windDay: 10, windNight: 6, precip: 0, servedElevM: 215, zone: 'plains' });
  ok(r1.applied === !ds2.model().shadow, 'switch on: residualDay applied as the gate says', 'applied ' + r1.applied + ', dTx ' + r1.dTx);
  const r2 = ds2.residualDay(31.55, 74.34, { date: '2026-06-10', tmax: 43, tmin: 30, servedElevM: 215, zone: 'plains' });
  ok(r2.applied === false, 'missing weather inputs: no residual', r2.basis && r2.basis.why);

  if (KILLED) { writeFileSync(STATE, JSON.stringify(record)); console.log('baseline written to ' + STATE); }
  done();
})().catch(e => { fail('test run', e.stack || e.message); done(); });
function done() { console.log(fails ? `\n${fails} FAIL` : '\nall PASS'); process.exit(fails ? 1 : 0); }
