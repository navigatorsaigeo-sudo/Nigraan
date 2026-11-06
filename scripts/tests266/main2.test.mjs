import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.266 · MAIN-2 · the main page after the clean-up build (CHANGES_MAIN2.md); v91.17.270 REPORTS adds two R checks (G2/G3).
     node scripts/tests266/main2.test.mjs [baseUrl]        default http://127.0.0.1:8787
   Drives the served page in Chromium (CSP enforced, 1600x1000). Provider-dependent answers are replaced by Playwright routes,
   so every check runs offline:
   M · Monte Carlo (hazard): one card "How likely are heat and flooding together" in Scenario directly under the stress test,
       open, the plain explanation, method detail and assumptions operator-only; with no paired heat and flood ensemble at the
       Scenario place it refuses plainly (names heat and flood, never "national sweep"), runs at no other unit;
       AGN.mc.run reports its class distribution in level words (ported from tests252/w2 C1-14)
   S · station status labels (interface 2): Checked / Not yet checked / Site problem, not used / Silent since <time PKT>, the note as
       tooltip; the Stations table never says "Reading not verified against neighbours"
   R · Report: "NIGRAAN situation report" is the first and default type; its pages in the agreed order; the client edition
       holds no operator appendix page (reproducibility, coverage, completeness, evidence annex, method), the operator
       edition holds them after the "Appendix" banner; past 30 days ok:false prints one plain "not available" line;
       no ESG / loss / PMD / FFD / skill-figure words in the client edition
   O · Forecast outlook (I-8 bug): asked by the point; a failing server never reads "no tehsil match"
   B · bounded waits: the 72-hour card after three failed point forecasts says "not available right now" (no 50 ms loop),
       /api/urban/point at most a few calls per point, "Loading what runs…" ends in a plain line, Scenario presets whose
       sources fail are named once as not available and hidden
   A · AI Analyst: the request carries context.place {name, lat, lon}; operator-only sources hidden for clients
   zero page errors, zero CSP violations
   PASS/FAIL lines; exit 1 on any FAIL. */
import { createRequire } from 'node:module'; import { existsSync } from 'node:fs';
const BASE = (process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const PWP = __T.playwrightUrl() || 'playwright';
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const exe = process.env.PW_CHROME || __T.chromiumPath();
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 400) : '')); };
const browser = await __T.launch(chromium, existsSync(exe) ? { executablePath: exe, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
const json = (r, status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
/* the provider proxy (/px/v1/forecast) answers with a plain synthetic forecast so the national layer is live offline */
function omFake(u) {
  const q = new URL(u).searchParams, la = (q.get('latitude') || '33.7').split(','), lo = (q.get('longitude') || '73').split(',');
  const nd = Math.min(16, Number(q.get('forecast_days')) || 3), t0 = Date.UTC(2026, 9, 14);
  const hours = Array.from({ length: 24 * nd }, (_, i) => new Date(t0 + i * 3600e3).toISOString().slice(0, 16)), days = Array.from({ length: nd }, (_, i) => new Date(t0 + i * 864e5).toISOString().slice(0, 10));
  const val = (v, i) => /temperature|apparent/.test(v) ? 22 + 6 * Math.sin(((i % 24) - 9) / 24 * 2 * Math.PI) : /dew/.test(v) ? 12 : /humidity/.test(v) ? 50 : /gust/.test(v) ? 15 : /wind_speed/.test(v) ? 6 : /direction/.test(v) ? 180
    : /precipitation_probability/.test(v) ? 5 : /precip|rain|shower|snow/.test(v) ? 0 : /weather_code/.test(v) ? 1 : /soil_moisture/.test(v) ? 0.2 : /cloud/.test(v) ? 10 : /radiation|shortwave/.test(v) ? 200 : /pressure/.test(v) ? 950 : 1;
  const one = (a, b) => { const o = { latitude: +a, longitude: +b, elevation: 540, timezone: 'Asia/Karachi', utc_offset_seconds: 18000 };
    const c = q.get('current'); if (c) { o.current = { time: hours[15], interval: 900 }; c.split(',').filter(Boolean).forEach(v => { o.current[v] = val(v, 15); }); }
    const h = q.get('hourly'); if (h) { o.hourly = { time: hours }; h.split(',').filter(Boolean).forEach(v => { o.hourly[v] = hours.map((_, i) => val(v, i)); }); }
    const d = q.get('daily'); if (d) { o.daily = { time: days }; d.split(',').filter(Boolean).forEach(v => { o.daily[v] = days.map(() => /_max$/.test(v) ? 28 : /_min$/.test(v) ? 16 : val(v, 12)); }); }
    return o; };
  const out = la.map((a, i) => one(a, lo[i] || lo[0])); return out.length === 1 ? out[0] : out;
}
const PX = ['**/px/v1/forecast*', r => json(r, 200, omFake(r.request().url()))];
async function open({ operator = false, routes = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage(); const errs = [], calls = {};
  page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 240)));
  page.on('request', r => { const u = new URL(r.url()); calls[u.pathname] = (calls[u.pathname] || 0) + 1; });
  await page.addInitScript(op => { document.addEventListener('securitypolicyviolation', e => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); });
    try { if (op) localStorage.setItem('agn.operator.v1', '1'); else localStorage.removeItem('agn.operator.v1'); } catch (_) {} }, operator);
  for (const [pat, fn] of routes) await page.route(pat, fn);
  await page.goto(BASE + '/analyst' + (operator ? '?operator=1' : ''), { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.AGN && AGN.report && AGN.reports268 && window.AGNRK && AGN.stationStatus && AGN.past30, null, { timeout: 180000 });
  await page.waitForTimeout(9000);
  return { ctx, page, errs, calls };
}
const go = (page, v) => page.evaluate(v => { const b = document.querySelector('#machNav button[data-goto="' + v + '"]'); if (b) b.click(); }, v);
const BANNED = /IFRS|CBAM|\bGHG\b|\bGWP\b|\bPKR\b|[Cc]urrency|Financial|Sustainability|\bESG\b|\bSBP\b|[Bb]anking|HISAAB|09 Result|\bPMD\b|\bFFD\b|ECMWF|\bJRC\b|GloFAS|\bHAND\b|\bNDMA\b|\bMAE\b|RMSE|skill score/;

/* v91.17.268 · the situation report opens from its button on the Forecast tab in the kit reader (r268) */
const openSit = async (page) => { await go(page, 'livedata'); await page.waitForTimeout(3000);
  await page.evaluate(() => { window.print = function () {}; const b = document.querySelector('[data-r268-report="situation"]'); if (b) b.click(); });
  await page.waitForFunction(() => { const o = document.querySelector('.rk-overlay'); return o && !o.querySelector('#r268Prep') && o.querySelectorAll('.rk h2').length > 3; }, null, { timeout: 90000 }).catch(() => {});
  const r = await page.evaluate(() => { const o = document.querySelector('.rk-overlay'); if (!o) return null; const t = o.innerText, hs = [...o.querySelectorAll('.rk h2')], k = hs.findIndex(h => /The past 30 days/.test(h.textContent));
    let p30 = ''; if (k >= 0) { const rg = document.createRange(); rg.setStartBefore(hs[k]); if (hs[k + 1]) rg.setEndBefore(hs[k + 1]); else rg.setEndAfter(o.querySelector('.rk').lastChild); p30 = rg.toString(); }
    return { h2: [...o.querySelectorAll('.rk h2')].map(h => h.textContent.replace(/^\d+\s*/, '').trim()), txt: t, p30, svg: o.querySelectorAll('.rk-fig svg').length,
      bar: [...o.querySelectorAll('.rk-bar button')].map(b => b.textContent), logo: !!o.querySelector('.rk-cover img.rk-logo'),
      bg: getComputedStyle(o.querySelector('.rk')).backgroundColor }; });
  await page.evaluate(() => document.querySelectorAll('.rk-overlay .rk-bar button').forEach(b => { if (b.textContent === 'Close') b.click(); }));
  return r; };
/* ── client session: Monte Carlo, stations, report, outlook, bounded waits, AI ── */
{
  const aiBodies = [];
  const routes = [PX,
    ['**/api/point?*', r => json(r, 502, { ok: false, why: 'test: provider down' })],   /* v91.17.283.19: the place bundle (point state, site screening, baseline, past 30 days are parts) */
    ['**/api/point/batch?*', r => json(r, 502, { ok: false, why: 'test: provider down' })],   /* and the corrected records of the city labels */
    ['**/api/pointstate**', r => json(r, 502, { ok: false, why: 'test: provider down' })],   /* v91.17.283.11: the Overview's point record is the point state */
    ['**/api/urban/point*', r => json(r, 503, { error: 'test' })],
    ['**/api/outlook/unit*', r => json(r, 503, { error: 'test: busy' })],
    ['**/api/ai/chat', r => { aiBodies.push(r.request().postData()); return json(r, 200, { answer: 'Clean answer for the test.', sources: ['Forecast for the place'], sourceChips: [{ text: 'Method note', operatorOnly: true, kind: 'method' }], operatorOnly: ['sources', 'notes', 'sourceChips', 'provenance'], provider: 'retrieval', kind: 'explanation' }); }]
  ];
  const { ctx, page, errs, calls } = await open({ routes });
  ok(!(await page.evaluate(() => document.documentElement.classList.contains('agn-operator'))), 'client view by default');

  /* M */
  await go(page, 'hybridlab'); await page.waitForTimeout(5000);
  const m = await page.evaluate(() => { const host = document.getElementById('agnV91ScenarioMonteHost'), card = document.getElementById('susMcCard'), scn = document.getElementById('agnScn');
    const closed = card && card.closest('details:not([open])'); const view = card && card.closest('.view');
    return { inScenario: !!(view && view.getAttribute('data-view') === 'hybridlab'), underTable: !!(scn && host && scn.nextElementSibling === host), open: !closed, visible: !!(card && card.getClientRects().length),
      title: (document.getElementById('susMcTitle') || {}).textContent, lead: (document.getElementById('susMcLead') || {}).textContent,
      assumeOp: !!(document.getElementById('susMcAssume') || { classList: { contains: () => false } }).classList.contains('agn-op-only'), jargon: /ceilingMassMax|sigmaFloor/.test(card ? card.innerText : '') }; });
  ok(m.inScenario && m.underTable && m.open && m.visible, 'M · the Monte Carlo card is in Scenario, directly under the stress-test section, open', JSON.stringify(m));
  ok(m.title === 'How likely are heat and flooding together', 'M · card title', m.title);
  ok(/how often heat and flooding reach Watch level on the same day here\. Shown as a chance out of 100 for the next days, not a yearly probability\. If the runs disagree, the range is wide\./.test(m.lead || ''), 'M · the plain explanation', m.lead);
  ok(m.assumeOp && !m.jargon, 'M · design assumptions and parameter names are operator view only');
  const mc = await page.evaluate(() => { const real = AGN.sustain.mcCandidates; document.getElementById('susMcRun').click();
    const t = document.getElementById('susMcBody').innerText; const last = AGN.sustain.lastMC(); return { t, unit: last && last.unit, ran: !!(last && last.res), noHere: !!(last && last.noEnsembleHere), place: last && last.place }; });
  ok(/heat/i.test(mc.t) && /flood/i.test(mc.t) && !/national sweep/i.test(mc.t), 'M · the refusal names heat and flood and never "national sweep"', mc.t.slice(0, 220));
  ok(!mc.ran && (mc.noHere || /not available/.test(mc.t)), 'M · no ensemble at the Scenario place: refused, not run at another unit', JSON.stringify({ ran: mc.ran, noHere: mc.noHere, place: mc.place }));
  const sub = await page.evaluate(() => { const E = AGN.evidence; if (!E || !E.record) return null;
    const here = (AGN.scenario76.unit() || {}).unit, other = Object.keys(window.DISTRICT_IN || {}).filter(k => k !== here && (typeof window.isScoreableDistrict !== 'function' || window.isScoreableDistrict(k)))[0];
    const mem = n => Array.from({ length: n }, (_, i) => 20 + i * 0.7);
    E.record('t:' + other, { label: 't', kind: E.KIND.FORECAST, value: 25, unit: '°C', members: mem(9), memberModels: mem(9).map((_, i) => 'm' + i), unitKey: other, hazard: 'heat' });
    E.record('rain:' + other, { label: 'p', kind: E.KIND.FORECAST, value: 2, unit: 'mm', members: mem(9), memberModels: mem(9).map((_, i) => 'm' + i), unitKey: other, hazard: 'flood' });
    const r = AGN.sustain.computeMC(null); return { here, other, cands: AGN.sustain.mcCandidates().map(c => c.unit), unit: r.unit || null, ran: !!r.res }; });
  ok(sub && sub.cands.indexOf(sub.other) >= 0 && sub.unit !== sub.other && !sub.ran, 'M · another unit holding an ensemble is never used for the Scenario place', JSON.stringify(sub));
  const cl = await page.evaluate(() => { const s = AGN.mc.run({ seed: 'main2', hazardA: 'heat', hazardB: 'flood', scoreA: 55, scoreB: 50, sigmaA: 8, sigmaB: 8, pathType: 'compound' });
    return { labels: (s.classDistribution || []).map(r => r.label), words: AGN.level.words }; });
  ok(cl.labels.length > 0 && cl.labels.every(l => cl.words.includes(l)) && !cl.labels.some(l => /^(Act|Watch|Monitor|Clear)$/.test(l)), 'M · compound Monte Carlo classes in level words (from tests252/w2 C1-14)', cl.labels.join(','));

  /* B · Scenario presets whose sources failed (retry once, then named and hidden); the day's climate thresholds wait 20 s */
  await page.evaluate(() => { const L = document.querySelector('#agnScn button[data-scn-load]'); if (L) L.click(); });   /* v283.29: the stress tests load on request */
  await page.waitForTimeout(30000);
  const pr = await page.evaluate(() => { const b = document.getElementById('agnScnPresets'); return b ? { btns: [...b.querySelectorAll('button')].map(x => x.innerText.replace(/\s+/g, ' ')), na: (b.querySelector('.scn-na') || {}).textContent || '' } : null; });
  ok(pr && pr.btns.some(t => /\+2 °C on the hourly temperature/.test(t)) && pr.btns.some(t => /10-year 24-hour level/.test(t)) && !pr.btns.some(t => /loading…|not available yet/.test(t)),
     'B (v283.29) · Scenario presets are the server\'s (GET /api/scenario: IPCC AR6 warming levels and the place\'s own rain return levels)', JSON.stringify(pr));

  /* S */
  const st = await page.evaluate(() => { const L = AGN.stationStatus.label;
    return [L({ status: 'checked', statusNote: 'n1' }), L({ status: 'not-yet-checked' }), L({ status: 'site-problem' }), L({ status: 'silent', silentSince: '2026-10-14T16:40:00Z' }), L({ status: 'silent', silentSince: null })].map(x => x && x.text);
  });
  ok(st[0] === 'Checked' && st[1] === 'Not yet checked' && st[2] === 'Site problem, not used' && st[3] === 'Silent since 14 Oct 2026, 21:40 PKT' && /^Silent/.test(st[4]), 'S · status labels (time in PKT)', st.join(' | '));
  await go(page, 'livedata'); await page.waitForTimeout(6000);
  const tb = await page.evaluate(() => { const b = document.getElementById('agnObsAll'); if (b && !b.hidden) b.click(); const t = document.getElementById('agnObsTable'); return t ? { txt: t.innerText, titled: !!t.querySelector('.agn-obs-flag[title]'), allPending: (() => { const l = AGN.stationStatus.list() || []; return l.length > 0 && l.every((s) => s.pending); })() } : null; });
  ok(tb && !/not verified against neighbours/i.test(tb.txt), 'S · the Stations table never says "Reading not verified against neighbours"', tb && tb.txt.slice(0, 200));
  /* v91.17.278.1 · FIX2781: on a server whose fleet has not been polled (every station pending, e.g. no fleet key) the table shows a dash
     with "Not read yet" as tooltip, never "no reading received" */
  ok(tb && (/Checked|Not yet checked|Site problem, not used|Silent/.test(tb.txt) || (tb.allPending && !/no reading received/i.test(tb.txt))) && tb.titled, 'S · the Stations table shows the status labels with the note as tooltip (a dash while the fleet is pending)', tb && (tb.allPending ? '[all pending] ' : '') + tb.txt.slice(0, 200));

  /* B · forecast card and AI models card bounded waits; O · outlook */
  await page.waitForTimeout(30000);
  const fc = await page.evaluate(() => (document.getElementById('agnFc251P') || {}).innerText || '');
  ok(/not available right now/.test(fc) && !/Loading the forecast/.test(fc), 'B · 72-hour card: three failed tries, then a plain line (no endless "Loading the forecast…")', fc.slice(0, 160));
  ok((calls['/api/point'] || 0) <= 12, 'B · no 50 ms refetch loop on the place bundle /api/point', calls['/api/point']);
  ok((calls['/api/urban/point'] || 0) <= 4, 'B · /api/urban/point is asked once per point while it fails (was 41 in 30 s)', calls['/api/urban/point']);
  const ol = await page.evaluate(() => { const c = document.getElementById('agnOutlookInline'); return c ? c.innerText : ''; });
  ok(!/no tehsil match/i.test(ol) && (/not available right now|Loading the 15-day outlook/.test(ol)), 'O · a failing outlook server is not read as "no tehsil match"', ol.slice(0, 200));
  await go(page, 'airisk'); await page.waitForTimeout(3000);

  /* A */
  await page.evaluate(() => { const i = document.getElementById('nigraanLlmInput'); i.value = 'forecast for the next 7 days'; document.getElementById('nigraanLlmForm').dispatchEvent(new Event('submit', { cancelable: true })); });
  await page.waitForTimeout(4000);
  const place = aiBodies.length ? (JSON.parse(aiBodies[0]).context || {}).place : null;
  ok(place && typeof place.name === 'string' && isFinite(place.lat) && isFinite(place.lon), 'A · the request carries context.place {name, lat, lon}', JSON.stringify(place));
  const ans = await page.evaluate(() => { const a = [...document.querySelectorAll('#nigraanLlmThread article.assistant')].pop(); return a ? a.innerText : ''; });
  ok(/Clean answer for the test\./.test(ans) && !/Method note|Forecast for the place/.test(ans), 'A · clients see the clean answer; operator-only sources are hidden', ans.slice(0, 200));

  /* R · client edition (v91.17.268) */
  const rc = await openSit(page);
  ok(rc && ['Summary', 'The past 30 days', 'The next 15 days', 'Hazards', 'What to do', 'Monitoring and review', 'Limits and sources'].every((h, k, A) => rc.h2.indexOf(h) >= 0 && (k === 0 || rc.h2.indexOf(h) > rc.h2.indexOf(A[k - 1]))), 'R · situation report from the Forecast button: summary, past 30 days, next 15 days, hazards, what to do, monitoring, limits, in that order', rc && rc.h2.join(' | '));
  ok(rc && !/Appendix/i.test(rc.h2.join(' ')), 'R · client edition: no operator appendix', rc && rc.h2.join(' | '));
  /* v91.17.270 · G2/G3: the situation report adds the event history and the long-term climate before its limits, carries the AGN logo, and the
     reader offers the 2-page short edition */
  ok(rc && ['Monitoring and review', 'Event history', 'Long-term climate', 'Limits and sources'].every((h, k, A) => rc.h2.indexOf(h) >= 0 && (k === 0 || rc.h2.indexOf(h) > rc.h2.indexOf(A[k - 1]))), 'R · v270: event history and long-term climate before the limits', rc && rc.h2.join(' | '));
  ok(rc && rc.logo && rc.bar.includes('Short edition (2 pages)'), 'R · v270: AGN logo on the cover; the reader offers the short edition', rc && JSON.stringify({ logo: rc.logo, bar: rc.bar }));
  ok(rc && /not available/i.test(rc.p30) && /\((the server did not answer|test: provider down)[^)]*\)|not available: |not available right now/.test(rc.p30), 'R · past 30 days not available (v283.19: the place bundle failed): a plain "not available" with the reason', rc && rc.p30.slice(0, 240));
  const bad = rc && (rc.txt.match(BANNED) || [])[0];
  ok(rc && !bad, 'R · no ESG / loss / PMD / FFD / provider / skill words in the client edition', bad);
  ok(rc && rc.bg === 'rgb(255, 255, 255)', 'R · white page', rc && rc.bg);
  await go(page, 'report'); await page.waitForTimeout(2500);
  const lb = await page.evaluate(() => { const s = document.getElementById('asmtReportType'); return { builderShown: !!(s && s.getClientRects().length) }; });
  ok(!lb.builderShown, 'R · the report builder is not shown to clients on the Reports tab (library only)', JSON.stringify(lb));
  ok(errs.length === 0, 'client: zero page errors', errs.slice(0, 3).join(' | '));
  ok(!(await page.evaluate(() => (window.__csp || []).length)), 'client: zero CSP violations');
  await ctx.close();
}
/* ── operator session: the appendix ── */
{
  const routes = [PX, ['**/api/ai/status*', r => json(r, 503, { error: 'test' })], ['**/api/point?*', async r => { let rr; try { rr = await r.fetch(); } catch (_) { return r.abort().catch(() => {}); } const B = await rr.json(); if (B && B.parts) B.parts.past30 = { ok: true, at: new Date().toISOString(), v: { ok: true, from: '2026-09-15', to: '2026-10-14', days: 30, place: { tehsil: 'Islamabad', district: 'Islamabad', elevM: 527 },
    daily: [{ date: '2026-10-13', tmaxC: 29.1, tminC: 15.2, rainMm: 0, src: 'station' }, { date: '2026-10-14', tmaxC: 28.4, tminC: 14.9, rainMm: 3.2, src: 'station' }],
    summary: { tmaxC: 29.1, tmaxDate: '2026-10-13', tminC: 14.9, tminDate: '2026-10-14', tmeanAnomC: 0.8, rainMm: 3.2, rainNormalMm: 12.4, wetDays: 1, wettestDate: '2026-10-14', wettestMm: 3.2 },
    levels: [{ date: '2026-10-14', hazard: 'Heat', level: 'Low' }], stations: [{ name: 'I-8, Islamabad', km: 3.9, tmaxC: 29.6, tminC: 15.0, rainMm: null, days: 2 }], sources: ['MACH stations', 'satellite rainfall'], notes: [] } }; return json(r, 200, B); }]];   /* v283.19: the bundle part past30 */
  const { ctx, page, errs } = await open({ operator: true, routes });
  ok(await page.evaluate(() => document.documentElement.classList.contains('agn-operator')), 'operator view on');
  /* R · operator edition (v91.17.268) */
  const r = await openSit(page);
  ok(r && /Appendix/i.test(r.txt), 'R · operator edition carries the appendix', r && r.h2.join(' | '));
  ok(r && /29\.1 °C/.test(r.p30) && /3\.2 mm/.test(r.p30) && /normal for these days 12\.4 mm/.test(r.p30) && /I-8, Islamabad/.test(r.p30) && r.svg > 0, 'R · past 30 days: hottest day, rain against normal, nearby station, framed chart', r && r.p30.slice(0, 300));
  await go(page, 'airisk'); await page.waitForTimeout(24000);
  const mcard = await page.evaluate(() => (document.querySelector('#agnAiModelsTop .p76-sub') || {}).textContent || '');
  ok(/not available right now/.test(mcard), 'B · "Loading what runs in this dashboard…" ends in a plain line when the server does not answer', mcard);
  ok(errs.length === 0, 'operator: zero page errors', errs.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
