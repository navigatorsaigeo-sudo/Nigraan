import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.279 · CLAIMS279 · evidence vs claims (audit_science S-01/03/09/10/11, audit_product P1-P9, P13, P14). Each check failed on the
   live v91.17.278.1 tree and passes on this one. Module checks run on the tree beside this script; page and API checks on a running server.
   usage: node scripts/tests279/claims279.test.mjs http://127.0.0.1:PORT   (the server must run from this tree; mock provider is fine) */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = process.env.CLAIMS_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:9011';
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + String(i).slice(0, 500) : '')); } };
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const TYPES = ['Forecast', 'Calibrated chance (area)', 'Ensemble share', 'Susceptibility', 'Relative likelihood', 'Indicative', 'Screening index', 'Reference', 'Observation'];
const JARGON = /\b(?:MAE|RMSE|FAR|POD|CSI|Brier|BSS|AUC|bias|hit rate)\b|\baudit|\.(?:py|md|json)\b|\b[a-z]{2,}:[a-z0-9_]+\b|Tmrt|CHIRPS|GHCN|\bGTS\b|NDVI|gate-\d/;

/* ── gate (model registry): one product type per entry; alerts only with a recorded baseline win ── */
const G = J('data/model-gate.resolved.json'), E = (id) => G.entries.find((e) => e.id === id);
ok(G.entries.every((e) => TYPES.includes(e.product_type)), 'P2 every gate entry has one product type from the list', G.entries.filter((e) => !TYPES.includes(e.product_type)).map((e) => e.id).join(', '));
ok(E('river-chance').product_type === 'Indicative' && E('river-chance').resolved.canAlert === false && E('river-ladder').product_type === 'Indicative' && !E('river-ladder').resolved.canAlert, 'S-01/P4 river chance and river ladder are Indicative and cannot alert', JSON.stringify([E('river-chance').resolved, E('river-ladder').resolved]));
ok(E('drought').resolved.canAlert === false && E('drought').product_type === 'Screening index', 'S-16 drought is a screening index and cannot alert (no baseline win recorded)', JSON.stringify(E('drought').resolved));
ok(E('rain-chance').resolved.canAlert === true && E('rain-chance').baseline_test && E('rain-chance').baseline_test.beats === true && /climatology/.test(E('rain-chance').baseline_test.baseline), 'rain chance keeps alerts on its recorded held-out win over climatology', JSON.stringify(E('rain-chance').baseline_test));
const badAlert = G.entries.filter((e) => e.resolved.canAlert && ['calibrated_model', 'published_standard'].includes(e.class) && !((e.baseline_test || {}).beats === true || ((e.baseline_test || {}).inherits && (E(e.baseline_test.inherits).baseline_test || {}).beats === true)));
ok(!badAlert.length, 'alert rule: every forecast product that can alert has a forward/held-out baseline win (own or of its tested input)', badAlert.map((e) => e.id).join(', '));
ok(E('gauge-outlook').skill_metrics.pod_1d === 0.79 && E('gauge-outlook').skill_metrics.persistence_pod_1d === 0.76 && !('class_exact_1d' in E('gauge-outlook').skill_metrics), 'S-09 the gauge outlook quotes its own held-out row (rule M), not the persistence row', JSON.stringify(E('gauge-outlook').skill_metrics).slice(0, 200));

/* ── S-03/P1 client limitations: none dropped, plain words ── */
const { clientLimitations } = await imp('server/api/gate.mjs');
const lost = [], jar = [];
for (const e of G.entries) { const L = e.known_limitations || [], o = clientLimitations(L, e.client_limitations); if (o.length !== L.length) lost.push(e.id + ' ' + o.length + '/' + L.length); o.forEach((s) => { if (JARGON.test(s)) jar.push(e.id + ': ' + s); }); }
ok(!lost.length, 'S-03/P1 the client keeps every known limitation (count in = count out)', lost.join(', '));
ok(!jar.length, 'S-03/P1/P7 client limitations carry no score words, file names or code keys (e.g. day:tn0)', jar.slice(0, 3).join(' | '));
const dr = clientLimitations(E('drought').known_limitations, E('drought').client_limitations).join(' ');
ok(/4 in 10 dry months/.test(dr), 'S-03 the drought detection weakness reaches the client in plain words', dr);

/* ── S-10/P11 the public screening-index wording comes from hazard-scale.json ── */
{ const { createWork } = await imp('server/api/work.mjs'); const W = createWork({ dataDir: join(ROOT, 'data'), store: { insert: async () => {}, find: () => null, list: () => [] } });
  const say = async (sc) => (await W.handlers['airisk.explain'](null, { body: { audience: 'public', hazard_result: { score: sc, hazard: 'heat', unit: 'X' } } }, {})).data.summary;
  const a = await say(70), b = await say(85);
  ok(!/severe/i.test(a) && /high/i.test(a) && /severe/i.test(b), 'S-10/P11 a score of 70 reads "high", 85 reads "severe" (hazard-scale cuts 65 / 82)', a + ' || ' + b); }

/* ── P3 air-quality actions: a stale run raises none; a past day is never acted on; typed Indicative ── */
{ const { createReport } = await imp('server/api/report.mjs');
  const day = (d) => new Date(Date.now() + 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10), today = day(0);
  const U = { unitId: 'u1', name: 'Lahore City', lat: 31.5, lon: 74.3, elevM: 210 };
  const mk = (stale) => ({ provider: { call: async () => { throw new Error('offline'); } }, units: { tehsil: [U], all: [U] },
    outlook: { findUnit: () => U, unit: () => ({ unit: { name: 'Lahore City', elevM: 210 } }), seasonalUnit: () => null },
    smog: { unit: () => ({ at: new Date(Date.now() - (stale ? 89 : 2) * 3600e3).toISOString(), ageH: stale ? 89 : 2, stale, days: [-4, -3, -2, -1, 0, 1].map((d) => ({ date: day(d), smogDay: true, pmClass: 4, pm25: 180, fogHours: 0 })) }) } });
  const air = async (st) => { const c = await createReport(mk(st)).context({ unit: 'u1' }); return (c.actions || []).filter((x) => x.hazard === 'Air quality'); };
  const s1 = await air(true), s0 = await air(false);
  ok(s1.length === 0, 'P3 a stale air-quality run (89 h) raises no air-quality action', JSON.stringify(s1).slice(0, 200));
  ok(s0.length === 1 && s0[0].when >= today && !/(Wed 14 Oct|Thu 15 Oct)/.test(s0[0].trigger) && s0[0].productType === 'Indicative', 'P3 a current run acts from today on only, typed Indicative', JSON.stringify(s0).slice(0, 300)); }

/* ── P5 "every hazard Normal" only over hazards that hold a level; the rest are named (the forecastAnswer block run as written) ── */
{ const src = readFileSync(join(ROOT, 'server/api/ai.mjs'), 'utf8'); const i = src.indexOf('const ML = X.mapLevels'), j = src.indexOf("L.push", src.indexOf('if (ML.length)', i)); const k = src.indexOf('\n', j);
  const f = new Function('X', 'days', 'dayLabel', 'SCALE_WORDS', 'L', src.slice(i, k));
  const L = []; const D = ['2026-10-19', '2026-10-20'];
  f({ mapLevels: { days: D.map((d) => ({ date: d, hazards: [{ hazard: 'Heat stress', level: 'Normal' }, { hazard: 'Heavy rain', level: null }, { hazard: 'Drought', level: 'no data' }] })) } }, D.map((d) => ({ date: d })), (d) => d, () => ['Normal', 'Low', 'Moderate', 'High', 'Severe'], L);
  const t = L.join(' ');
  ok(!/Every hazard level is Normal/.test(t) && /Heavy rain/.test(t) && /Drought/.test(t), 'P5 the AI does not call every hazard Normal when heavy rain and drought hold no level', t); }

/* ── static page checks (P6, P13, P2, P9) ── */
const PG = readFileSync(join(ROOT, 'artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8'), N3 = readFileSync(join(ROOT, 'artefact/NIGRAAN_3.html'), 'utf8');
ok(!/Subscribe the site to the daily outlook/.test(PG + N3), 'P6 no "subscribe" promise in the page or /customize');
ok(!/published in Evidence &amp; Methods for operators/.test(PG), 'P13 the client footnote no longer says accuracy is withheld');
ok(!/Tested on held-out data and in service/.test(PG), 'P2 the blanket "Tested on held-out data and in service" label is gone');

/* ── server ── */
const getJ = async (p) => { try { const r = await fetch(BASE + p, { headers: { 'x-agn-view': 'customer' } }); return r.ok ? await r.json() : { status: r.status }; } catch (e) { return { err: e.message }; } };
const gs = await getJ('/api/report/gate-status');
const GATE_BUILT = J('data/model-gate.json').built;   /* v91.17.283: the date the gate file states, not a typed date */
/* v91.17.283.12 (v283.13 hand-off 5): the page reads the gate from the server file (/api/registry/gate = data/model-gate.slim.json), no embedded copy */
const GSLIM = JSON.stringify(JSON.parse(readFileSync(join(ROOT, 'data', 'model-gate.slim.json'), 'utf8')));
ok(gs.ok && gs.asOf === GATE_BUILT && /agnServerFile\('\/api\/registry\/gate'\)/.test(PG) && /"productType":"Indicative"/.test(GSLIM) && /"productTypes":\{/.test(GSLIM), 'P2/P7 the page reads the gate with the product type per entry from the server file, and the route the model status date (the gate file\'s built date ' + GATE_BUILT + ')', JSON.stringify(gs).slice(0, 200));
ok(gs.ok && gs.entries.every((e) => { const g = E(e.id); return e.limitations.length === (g.known_limitations || []).length; }), 'S-03 the served client status drops no limitation');
/* S-11 · the river-high block of siterisk.mjs run as written, with a reach in the Watch class 5 km away and the site 3 m above it (the mock
   server holds no 15-day outlook, so the card itself cannot reach this block offline) */
{ const src = readFileSync(join(ROOT, 'server/api/siterisk.mjs'), 'utf8'); const i = src.indexOf('/* river running high */'), j = src.indexOf('/* rain on snow */', i);
  const { createGate } = await imp('server/api/gate.mjs'); const R = J('data/site-risk-pathways.json').rules; const act = [];
  const f = new Function('lat', 'lon', 'R', 'app', 'nearestRiver', 'G', 'add', 'span', 'fmtDay', src.slice(i, j) + '\n;return notAssessed;');
  const notAssessed = f(31.5, 74.3, R, { gate: createGate(join(ROOT, 'data')) }, () => ({ river: 'Ravi', name: 'Balloki', km: 5, days: [{ date: '2026-10-20', class: 'Watch', word: 'High' }] }), { handRiverM: 3 },
    (id, facts) => act.push({ id, facts }), (a, b) => a + '..' + b, (d) => d);
  ok(!act.some((x) => x.id === 'riverHigh') && notAssessed.some((x) => x.id === 'riverHigh' && /not tested well enough/.test(x.why)), 'S-11 the river-high pathway is not switched on from the experimental river ladder (named as not assessed)', JSON.stringify({ act, notAssessed })); }

/* ── page (client view): legend tag, situation report without a sample, map panel when the engine run is not held ── */
const req = createRequire(import.meta.url);
let PW = __T.playwrightSync();
const br = await __T.launch(PW.chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath(), args: ['--no-sandbox'] });
const ctx = await br.newContext({ viewport: { width: 1600, height: 1000 } }); const pg = await ctx.newPage(); const errs = [];
pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await pg.addInitScript(() => { try { localStorage.removeItem('agn.operator.v1'); } catch (_) {} });
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 180000 });
await pg.waitForFunction(() => window.AGN && AGN.gate && AGN.gate.tag && AGN.reports268 && AGN.flow && AGN.flow.setActiveLocation, null, { timeout: 180000 });
const tg = await pg.evaluate(() => [AGN.gate.tag('rv:2').text, AGN.gate.tag('drought').text, AGN.gate.tag('rc:10').text, AGN.gate.canAlert('rv:2'), AGN.gate.canAlert('drought')]);
ok(/^Indicative/.test(tg[0]) && /^Screening index/.test(tg[1]) && /^Calibrated chance \(area\)/.test(tg[2]) && tg[3] === false && tg[4] === false, 'P2/P4 the map legend names the product type; river chance and drought cannot alert in the page', JSON.stringify(tg));
await pg.waitForTimeout(4000);
await pg.evaluate(() => AGN.flow.setActiveLocation({ name: 'Lahore', lat: 31.5204, lon: 74.3587 }, 'Lahore', { src: 'search' }));
await pg.waitForTimeout(8000);
const mp = await pg.evaluate(() => { const r = document.getElementById('mpRightIn'); const t = r && r.querySelector('.agn-mps-top'); return t ? t.innerText : (r ? 'NO-TOP ' + r.innerText.slice(0, 200) : 'NO-PANEL'); });
const eng = await pg.evaluate(async () => { try { const u = AGN.engineLevels.unitAt(31.5204, 74.3587); const E = await AGN.engineLevels.get(u); return { days: !!(E && E.days), why: E && E.why }; } catch (e) { return { err: e.message }; } });
ok(eng.days || /No issued level/.test(mp) || /No level yet|Levels loading/.test(mp), 'P8 with no issued engine run, the map panel shows no issued level (as Assets and the reports), not a page-only level', JSON.stringify({ mp, eng }));
await pg.evaluate(() => { window.print = function () {}; AGN.reports268.open('situation', null); });
const ready = await pg.waitForFunction(() => { const c = AGN.reports268.current(); const ov = document.querySelector('.rk-overlay'); return c && c.kind === 'situation' && ov && !ov.querySelector('#r268Prep') && ov.querySelector('.rk-cover,.rk-brief,.rk-bhead,.rk h2'); }, null, { timeout: 150000 }).then(() => true).catch(() => false);
await pg.waitForTimeout(1500);
const rt = await pg.evaluate(() => { const ov = document.querySelector('.rk-overlay'); return ov ? ov.innerText : ''; });
ok(ready && !/SAMPLE · DEMONSTRATION DATA|SAMPLE · DEMONSTRATION/.test(rt), 'P9 a real place reported without the sample is not stamped "SAMPLE · DEMONSTRATION DATA"', (rt.match(/.*(SAMPLE|DRAFT)[^\n]*/) || [''])[0]);
ok(ready && /Product type/.test(rt) && !/Tested on held-out data and in service/i.test(rt), 'P2 the situation report prints product types, not the blanket confidence label');
ok(ready && !/gate-\d|\bday:tn0\b|-0\.0\b/.test(rt), 'P7/P14 no gate id, no layer key and no "-0.0" in the client report', (rt.match(/.*(gate-\d|day:tn0|-0\.0)[^\n]*/) || [''])[0]);
ok(!errs.length, 'no page errors', errs.slice(0, 3).join(' | '));
await br.close();
console.log(`\n${fail ? 'FAIL' : 'PASS'} claims279: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
