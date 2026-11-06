import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.153 · landslide level from the calibrated likelihood, GLOF standing class, stale ensemble from today, one exposure trigger,
   AQI absent is not clean air, census row, flood susceptibility with river distance, satellite soil check. Server on :8787. */
import { readFileSync } from 'node:fs';
const B = process.env.NIGRAAN_URL || 'http://localhost:8787'; let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const j = async (p) => { const r = await fetch(B + p); return r.json().catch(() => null); };
const D = (f) => JSON.parse(readFileSync(new URL('../../data/' + f, import.meta.url), 'utf8'));
/* server side */
const od = await j('/api/landslide/odds'); const u0 = od && od.units ? Object.values(od.units)[0] : null;
ok(od && od.ready && u0 && typeof u0.key === 'string', 'odds carry the page unit key (the map level reads it)');
const FS = D('flood-susceptibility.json'); ok(FS.version === 'fsusc-91.17.153' && FS.features.includes('riverDist') && FS.test.auc >= 0.8, 'flood susceptibility: river distance in, labels without river channels, held-out AUC ' + FS.test.auc);
const HS = D('hazard-scale.json'); ok(HS.glofLadder && HS.glofLadder.Monitor === 'Normal' && !('glofStandingLevel' in HS), 'GLOF Monitor counts as Normal (standing, not a forecast): one table, glofLadder');
const CT = D('census-tehsil.json'); ok(CT.stats.tehsil + CT.stats.subdiv >= 400 && Object.values(CT.units).every(c => c.pop2023 == null || c.match === 'tehsil'), 'census: ' + (CT.stats.tehsil + CT.stats.subdiv) + ' tehsils matched; counts only for same-area tehsils');
const sc = (await fetch(B + '/api/point?lat=31.52&lon=74.36').then((r) => r.json()).then((x) => (x && x.parts && x.parts.siteScreening ? x.parts.siteScreening.v : null)).catch(() => null)); /* v283.19: the place bundle */ const cr = (sc && sc.rows || []).find((r) => /census 2023/.test(r.parameter));
ok(cr && cr.verdict === null && /aged 65\+/.test(cr.values), 'site screening: census row, context only (Lahore)');
const SM = D('smap-check.json'); ok(SM.summary.tehsils > 500 && SM.summary.rMedian > 0.4, 'satellite soil check: ' + SM.summary.tehsils + ' tehsils, median r ' + SM.summary.rMedian);
const ws = await j('/api/flood/wetness?unit=' + encodeURIComponent('Punjab|Lahore|Lahore City'));
ok(!ws || !ws.unit || !ws.unit.satelliteCheck || !/NASA|SMAP/.test(JSON.stringify(ws.unit.satelliteCheck)), 'wetness satellite note names no supplier');
const LT = JSON.parse(readFileSync(new URL('../landslide_indep/level_test.json', import.meta.url), 'utf8'));
const obs = LT.bands.map((b) => b.observedVsOrdinaryDay); ok(obs.every((x, i) => i === 0 || x > obs[i - 1]), 'landslide bands: observed likelihood rises band by band (' + obs.join(', ') + ')');
/* page side */
const PW = __T.playwrightUrl() || 'playwright';
const chromium = __T.playwrightSync().chromium;   /* v283 WS7: a missing Playwright SKIPs at launch */
if (chromium) {
  const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
  const p = await br.newPage({ viewport: { width: 1440, height: 900 } }); const perr = []; p.on('pageerror', (e) => perr.push(e.message));
  await p.goto(B + '/analyst?operator=0', { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(4000); if (await p.evaluate(() => !!(window.LS_ODDS && window.LS_ODDS.ready && window.DISTRICT_IN && Object.keys(DISTRICT_IN).length > 500))) break; }
  const r = await p.evaluate(() => { const o = {};
    const L = aiDistrictRisk(hzDayInput('Murree', 'landslide'), 'landslide', 0, 'Murree'); o.ls = L && { score: L.score, label: L.metricLabels && L.metricLabels[0], top: L.top };
    o.dayCap = hzDayCapable('landslide');
    o.sc = [1, 2, 5, 10, 20, 40].map((x) => { const s = lsOddsScore(x), b = agnBandOf(s); return b ? b.label : null; });
    const s = { aqi: null, t: 30, hum: 40, wind: 5, rain: 0 }; let q = null; try { q = aiRiskFor(Object.assign({}, window.stationsData ? stationsData[0] : {}, s), 'ops', 24); } catch (e) { q = { err: e.message }; }
    o.ops = q && { score: q.score, note: q.notes && q.notes[2] };
    return o; });
  ok(r.ls && /calibrated likelihood/.test(r.ls.label) && /ordinary day/.test(r.ls.top), 'landslide level reads the calibrated likelihood (' + (r.ls && r.ls.top) + ')');
  ok(r.dayCap === true, 'landslide follows the selected day');
  ok(JSON.stringify(r.sc) === JSON.stringify(['Normal', 'Low', 'Moderate', 'High', 'Severe', 'Severe']), 'odds 1/2/5/10/20/40x map to Normal/Low/Moderate/High/Severe: ' + r.sc.join(','));
  ok(r.ops && (r.ops.err || /left out of the score/.test(r.ops.note || '')), 'operations score: an absent AQI is left out, not clean air' + (r.ops && r.ops.err ? ' (no station sample: ' + r.ops.err.slice(0, 60) + ')' : ''));
  ok(perr.length === 0, 'no page errors' + (perr.length ? ': ' + perr.slice(0, 2).join(' | ') : ''));
  await br.close();
} else console.log('SKIP page checks: no playwright');
console.log(`v153: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
