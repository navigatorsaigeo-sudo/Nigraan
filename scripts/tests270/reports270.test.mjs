import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.270 · REPORTS (G1-G6) · the main page's reports on the v270 kit.
     node scripts/tests270/reports270.test.mjs [baseUrl]        default http://127.0.0.1:8787
   K · kit (build/rk/rk.js in node): stackChart (stacked counts, legend only for classes present), areaMap place names (light, an
       overlapping name left out), cover and brief head with the logo, the finding's label kept with its part (.pr), no named page
   Browser (Chromium, CSP enforced, 1600x1000), provider-dependent answers replaced by routes so every check runs offline: fresh engine
   levels (/api/levels/unit, /api/levels), the 15-day outlook (/api/outlook/unit, run time now), the hourly point forecast:
   G1 · portfolio: no site → the reader says "Add sites first" with one action and no print/download (no SAMPLE page, no "Not
        available" wall); the action closes the reader on the Assets tab. With sites → summary, sites, hazards by site, charts, ranked
        actions, limits; one row per site with tehsil, level, when, confidence
   G2 · situation report: AGN logo, town names on the maps, evidence-based confidence (Data, Model gate, Agreement) in every finding,
        "How to use these figures", triggers, event history, long-term climate (CMIP6) sections; operator appendix only for operators
   G3 · the reader's "Short edition (2 pages)": a brief with its own id (…B-…); one hazard name per hazard (AGN.hazardName)
   G5 · the next-72-hours high and low on the Forecast tab equal the report's; the report's levels by day equal the engine's
   G6 · every finding's action names an owner and a ready-by; the first-actions table has no empty cell
   zero page errors, zero CSP violations. PASS/FAIL lines; exit 1 on any FAIL. */
import { createRequire } from 'node:module'; import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import { tmpdir } from 'node:os';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = (process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && d != null ? ' · ' + String(d).slice(0, 400) : '')); };

/* ── K · the kit in node (UMD; copied to a .cjs because this package is an ES module) ── */
{ const tmp = mkdtempSync(join(tmpdir(), 'rk270-')), f = join(tmp, 'rk.cjs'); writeFileSync(f, readFileSync(join(ROOT, 'build', 'rk', 'rk.js'), 'utf8'));
  const RK = createRequire(import.meta.url)(f), css = readFileSync(join(ROOT, 'build', 'rk', 'rk.css'), 'utf8');
  const st = RK.stackChart({ title: 'T', units: 'sites', dates: 'd', unit: 'sites', colors: ['#a', '#b', '#c'], names: ['N', 'L', 'M'], rows: [{ label: 'Heat', parts: [2, 0, 1] }, { label: 'Wind', parts: [0, 0, 0] }], source: 's', reading: 'r' });
  ok((st.match(/<rect /g) || []).length === 2 && /none<\/text>/.test(st) && /<i style="background:#a"><\/i>N/.test(st) && !/>L<\/span>/.test(st) && /rk-read/.test(st), 'K · stackChart: stacked counts, "none" for an empty row, legend only for classes present, framed');
  const m = RK.areaMap({ title: 'm', bbox: [74, 31, 75, 32], points: [{ lon: 74.5, lat: 31.5, label: 'Place', shape: 'star' }], labels: [{ lon: 74.2, lat: 31.2, text: 'Kasur' }, { lon: 74.205, lat: 31.205, text: 'Overlap' }, { lon: 74.5, lat: 31.5, text: 'UnderPoint' }] });
  ok((m.match(/class="lb"/g) || []).length === 1 && /Kasur/.test(m) && !/Overlap/.test(m), 'K · areaMap place names: light, an overlapping name left out');
  ok(/<img class="rk-logo" src="data:image\/png;base64,AA"/.test(RK.cover({ kind: 'k', title: 't', logo: 'data:image/png;base64,AA' })) && /short edition/.test(RK.briefHead({ kind: 'Situation report', title: 't', when: 'w', id: 'X' })), 'K · logo on the cover and the brief head');
  const fd = RK.finding({ title: 'Heat', lv: 3, finding: 'f', action: 'a' });
  ok((fd.match(/<div class="pr/g) || []).length === 7 && /<div class="pr wide"><dt class="wide">Map/.test(fd), 'K · finding: each label wrapped with its part (.pr), Map and Chart wide');
  ok(!/rkbrief/.test(css) && /\.rk-fig figcaption\{[^}]*break-after:avoid/.test(css), 'K · no named page (Chromium moved charts of a named page); a caption stays with its figure');
}

/* ── browser ── */
const PWP = __T.playwrightUrl() || 'playwright';
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const exe = process.env.PW_CHROME || __T.chromiumPath();
const browser = await __T.launch(chromium, existsSync(exe) ? { executablePath: exe, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
const json = (r, status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'], HZ = ['rain_hz', 'heat', 'cold', 'wind', 'flood', 'landslide', 'glof', 'drought'];
const pkDay = (n) => new Date(Date.now() + 5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const crc = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h / 4294967296; };
const lvl = (u, h, d) => { if (/glof|landslide/.test(h) && !/Gilgit|Hunza|Skardu/.test(u)) return -2; const r = crc(u + '|' + h + '|' + d); return r < .5 ? 0 : r < .7 ? 1 : r < .85 ? 2 : r < .95 ? 3 : 4; };
const fresh = () => new Date(Date.now() - 2 * 3600e3).toISOString();
const outlookFix = () => ({ unit: {}, ensemble: { at: fresh(), members: 51, days: Array.from({ length: 16 }, (_, i) => ({ date: pkDay(i), tx: [28 + i % 3, 31 + i % 4, 34 + i % 3], tn: [14, 16, 18], pr: i === 5 ? [0, 6, 18] : [0, 0, 1], gu: [18, 26, 40], p: { pr10: i === 5 ? 30 : 0 } })) }, events: { window: [pkDay(0), pkDay(14)], heatSpell: { p: 18, climP: 9 } } });   /* v283.19: the same 15-day outlook for /api/outlook/unit and for the bundle part outlook */
const unitLevels = (u) => ({ ready: true, at: fresh(), stale: false, words: WORDS, unit: u, days: [0, 1, 2, 3].map(d => ({ day: d, date: pkDay(d), layers: Object.fromEntries(HZ.filter(h => d === 0 || !/glof|drought/.test(h)).map(h => { const v = lvl(u, h, d); return [h, { name: h, level: v, word: v >= 0 ? WORDS[v] : 'not applicable' }]; })) })) });   /* v283.19: the same tehsil levels for /api/levels/unit and for the bundle part levels */
const ROUTES = [
  ['**/px/v1/forecast*', r => json(r, 503, { error: 'test' })],
  ['**/api/levels/unit*', r => { const u = new URL(r.request().url()).searchParams.get('unit') || '';
    return json(r, 200, unitLevels(u)); }],
  ['**/api/levels?*', r => { const q = new URL(r.request().url()).searchParams, h = q.get('layer'), d = +q.get('day') || 0; const L = {};
    for (const f of (globalThis.__UIDS || [])) L[f] = lvl(f, h, d); return json(r, 200, { ready: true, at: fresh(), layer: h, day: d, date: pkDay(d), levels: L }); }],
  ['**/api/outlook/unit*', r => json(r, 200, outlookFix())],
  ['**/api/point?*', async r => { /* v283.19: the real place bundle with the test's hours (its shape and parts kept) */ const t0 = Date.now() + 5 * 3600e3; const hrs = Array.from({ length: 96 }, (_, i) => { const t = new Date(t0 + (i - 6) * 3600e3).toISOString().slice(0, 13) + ':00'; return { time: t, tempC: 22 + 6 * Math.sin((i - 8) / 24 * 2 * Math.PI), lo90: 18, hi90: 30, rainMm: i === 30 ? 1.4 : 0, gustKmh: 20 + (i % 7), utciShadeC: 24, rh: 50, windKmh: 8 }; });
    let rr; try { rr = await r.fetch(); } catch (_) { return r.abort().catch(() => {}); } const B = await rr.json(); const T = { ok: true, time: new Date(t0).toISOString().slice(0, 13) + ':00', now: { tempC: 24 }, hours: hrs, days: [] }; if (B && B.ok && B.parts) B.parts.outlook = { ...(B.parts.outlook || {}), ok: true, unavailable: false, v: outlookFix() }; if (B && B.ok && B.parts && B.place && B.place.unitId) B.parts.levels = { ...(B.parts.levels || {}), ok: true, unavailable: false, v: unitLevels(B.place.unitId) }; return json(r, 200, B && B.ok ? { ...B, time: T.time, now: { ...(B.now || {}), tempC: 24 }, hours: T.hours.map((h) => ({ ...(B.hours && B.hours[0] || {}), ...h })) } : B); }],
  ['**/api/ai/status*', r => json(r, 503, { error: 'test' })]
];
async function open({ operator = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 240)));
  await page.addInitScript(op => { document.addEventListener('securitypolicyviolation', e => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); });
    try { if (op) localStorage.setItem('agn.operator.v1', '1'); else localStorage.removeItem('agn.operator.v1'); } catch (_) {} }, operator);
  const uids = JSON.parse(readFileSync(join(ROOT, 'data', 'pk-tehsils.json'), 'utf8')).features.map(f => f.properties.uid); globalThis.__UIDS = uids;
  for (const [pat, fn] of ROUTES) await page.route(pat, fn);
  await page.goto(BASE + '/analyst' + (operator ? '?operator=1' : ''), { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.AGN && AGN.reports268 && window.AGNRK && AGN.fc251 && AGN.actionPlan && AGN.hazardName, null, { timeout: 180000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => { window.print = function () {}; AGN.flow.setActiveLocation({ name: 'Lahore', lat: 31.558, lon: 74.35071 }, 'Lahore', { src: 'search' }); });
  await page.waitForTimeout(9000);
  return { ctx, page, errs };
}
const go = (page, v) => page.evaluate(v => { const b = document.querySelector('#machNav button[data-goto="' + v + '"]'); if (b) b.click(); }, v);
const report = async (page, kind) => { await page.evaluate(k => AGN.reports268.open(k, null), kind);
  await page.waitForFunction(k => { const c = AGN.reports268.current(); return c && c.kind === k && c.record && document.querySelector('.rk-overlay .rk-cover,.rk-overlay .rk-brief,.rk-overlay .rk-bhead'); }, kind, { timeout: 150000 });
  return page.evaluate(() => { const o = document.querySelector('.rk-overlay'), c = AGN.reports268.current();
    return { rec: c.record, h2: [...o.querySelectorAll('.rk h2')].map(h => h.textContent.replace(/^(\d+|A(?=A))\s*/, '').trim()), txt: o.innerText, logo: !!o.querySelector('img.rk-logo'), labels: o.querySelectorAll('svg text.lb').length,
      bar: [...o.querySelectorAll('.rk-bar button')].map(b => b.textContent), finds: [...o.querySelectorAll('.rk-find')].map(f => { const dt = [...f.querySelectorAll('dt')], a = dt.find(d => d.textContent === 'Action'), cf = dt.find(d => d.textContent === 'Confidence');
        return { t: f.querySelector('h3').textContent, act: a ? a.nextElementSibling.textContent : '', conf: cf ? cf.nextElementSibling.textContent : '' }; }),
      first: (() => { const h = [...o.querySelectorAll('h3')].find(x => x.textContent === 'First actions'); const t = h && h.nextElementSibling; return t && t.tagName === 'TABLE' ? [...t.querySelectorAll('tbody td')].map(td => td.textContent.trim()) : null; })() }; }); };
const close = page => page.evaluate(() => AGNRK.close());
{ const { ctx, page, errs } = await open();
  /* G5 · the Forecast tab's next 72 hours */
  await go(page, 'livedata'); await page.waitForFunction(() => /°C/.test((document.getElementById('agnFc251K') || {}).innerText || ''), null, { timeout: 60000 }).catch(() => {});
  const card = await page.evaluate(() => { const o = {}; document.querySelectorAll('#agnFc251K .kpi').forEach(k => { o[k.querySelector('span').textContent] = k.querySelector('b').textContent; }); return o; });
  const r = await report(page, 'situation');
  const n72 = r.rec.results.next72 || {}, f1 = x => x == null ? null : (Math.round(x * 10) / 10).toFixed(1);
  ok(card['High, next 3 days'] === f1(n72.high_c) + ' °C' && card['Low, next 3 days'] === f1(n72.low_c) + ' °C', 'G5 (v283.29) · high and low of the next 3 days (the place record): the Forecast tab cards = the situation report', JSON.stringify({ card, n72 }));
  ok(n72.rain_mm == null ? card['Rain, next 3 days'] === '—' : card['Rain, next 3 days'] === f1(n72.rain_mm) + ' mm', 'G5 (v283.29) · rain of the next 3 days (the place record day totals): the Forecast tab = the report', card['Rain, next 3 days'] + ' / ' + n72.rain_mm);
  const eng = await page.evaluate(u => fetch('/api/levels/unit?unit=' + encodeURIComponent(u), { headers: { 'x-agn-view': 'customer' } }).then(x => x.json()), r.rec.subject.unit_id);
  const LB = r.rec.results.levels_by_day || { dates: [], levels: {} }; let n = 0, bad = [];
  for (const d of eng.days || []) { const i = LB.dates.indexOf(d.date); if (i < 0) continue; for (const [k, v] of Object.entries(d.layers)) { if (!LB.levels[k]) continue; n++; const w = WORDS.includes(v.word) ? v.word : null; if (LB.levels[k][i] !== w) bad.push(d.date + ' ' + k + ' ' + w + '/' + LB.levels[k][i]); } }
  ok(n >= 20 && !bad.length, 'G5 · ' + n + ' levels (hazard × day): the engine (the map) = the situation report', bad.join('; '));
  ok(['Summary', 'The past 30 days', 'The next 15 days', 'Hazards', 'What to do', 'Monitoring and review', 'Event history', 'Long-term climate', 'Limits and sources'].every((h, k, A) => r.h2.indexOf(h) >= 0 && (k === 0 || r.h2.indexOf(h) > r.h2.indexOf(A[k - 1]))), 'G2 · situation report sections in order, with event history and long-term climate', r.h2.join(' | '));
  ok(r.logo, 'G2 · AGN logo on the cover');
  ok(r.labels > 0, 'G2 · town and city names on the report maps', r.labels);
  ok(/How to use these figures/.test(r.txt) && /Triggers: from level to action/.test(r.txt), 'G2 · "How to use these figures" and the trigger ladder');
  ok(r.finds.length > 0 && r.finds.every(f => /Data:/.test(f.conf) && /Model gate:/.test(f.conf) && /Agreement:/.test(f.conf)), 'G2 · evidence-based confidence in every finding (data, model gate, agreement)', JSON.stringify(r.finds.map(f => f.conf.slice(0, 60))));
  ok(r.finds.every(f => /Owner: \S/.test(f.act) && /ready by \S/.test(f.act)), 'G6 · every finding\'s action has an owner and a ready-by', JSON.stringify(r.finds.map(f => f.act.slice(0, 80))));
  ok(r.first && r.first.length && r.first.every(c => c.length > 0), 'G6 · first actions: no empty cell', JSON.stringify(r.first));
  ok(!/Appendix/.test(r.h2.join(' ')), 'G2 · client edition: no operator appendix');
  const CANON = ['Heat stress', 'Cold stress and frost', 'Heavy rain', 'Flood', 'Wind and gusts', 'Landslide', 'GLOF', 'Glacial lake outburst flood (GLOF)', 'Drought'];
  const HN = await page.evaluate(() => ({ a: AGN.hazardName.of('Heat (UTCI in shade)'), b: AGN.hazardName.of('Glacial lake flood'), c: AGN.hazardName.long('glof'), d: AGN.hazardName.of('Rainfall intensity'), e: AGN.hazardName.of('Cold / frost'), f: AGN.hazardName.of('Wind and gust load') }));
  ok(r.finds.every(f => CANON.some(n => f.t.indexOf(n) === 0)) && HN.a === 'Heat stress' && HN.b === 'GLOF' && HN.c === 'Glacial lake outburst flood (GLOF)' && HN.d === 'Heavy rain' && HN.e === 'Cold stress and frost' && HN.f === 'Wind and gusts', 'G3 · one name per hazard (finding titles and AGN.hazardName)', r.finds.map(f => f.t).join(',') + ' · ' + JSON.stringify(HN));
  /* method names from the formula registry (e.g. "Wind and gust load", the wind method) name a formula, not a hazard */
  ok(!/\b(Cold and frost|Glacial lake flood|Rainfall intensity|Heat \(UTCI)/.test(r.txt) && (r.txt.match(/Glacial lake outburst flood \(GLOF\)/g) || []).length <= 1 && (!/\bGLOF\b/.test(r.txt) || r.txt.search(/\bGLOF\b/) === r.txt.indexOf('Glacial lake outburst flood (GLOF)') + 29), 'G3 · no old hazard name in the report; GLOF in full once, then GLOF', (r.txt.match(/.{0,40}GLOF.{0,20}/g) || []).slice(0, 3).join(' | '));
  ok(!/\b(undefined|NaN|PMD|FFD|MAE|RMSE|Brier)\b/.test(r.txt), 'no undefined / NaN / supplier / skill words in the client report');
  /* G3 · the short edition */
  ok(r.bar.includes('Short edition (2 pages)'), 'G3 · the reader offers the short edition', r.bar.join(','));
  await page.evaluate(() => [...document.querySelectorAll('.rk-overlay .rk-bar button')].find(b => /Short edition/.test(b.textContent)).click());
  await page.waitForFunction(() => document.querySelector('.rk-overlay .rk-brief') && AGN.reports268.current().edition === 'short', null, { timeout: 30000 });
  const b = await page.evaluate(() => { const c = AGN.reports268.current(), o = document.querySelector('.rk-overlay'); return { id: c.record.report_id, ed: c.record.edition, head: !!o.querySelector('.rk-bhead img.rk-logo'), cover: !!o.querySelector('.rk-cover'), pb: o.querySelectorAll('.rk-brief > section.rk-pb').length, bar: [...o.querySelectorAll('.rk-bar button')].map(x => x.textContent) }; });
  ok(/^NIGRAAN-SITB-/.test(b.id) && b.ed === 'short' && b.head && !b.cover && b.pb === 1 && b.bar.includes('Full report'), 'G3 · short edition: its own id, brief head with logo, no cover, page 2 as one section, switch back', JSON.stringify(b));
  await close(page);
  /* G1 · portfolio */
  await go(page, 'assessments'); await page.waitForTimeout(2500);
  await page.evaluate(() => { const b = document.querySelector('#asmtTabs button[data-asmt="portfolio"]'); if (b) b.click(); });
  /* v91.17.283.28 (owner, P6): Client Risk hands the portfolio to the Customize page, so its pane has no Portfolio report button; the
     report itself is still made by the reports module (AGN.reports268) */
  await page.evaluate(() => AGN.reports268.open('portfolio', null));
  await page.waitForSelector('.rk-overlay [data-r270-addsites]', { timeout: 20000 }).catch(() => {});
  const e0 = await page.evaluate(() => { const o = document.querySelector('.rk-overlay'); return o ? { t: o.innerText, bar: [...o.querySelectorAll('.rk-bar button')].map(b => b.textContent), act: o.querySelectorAll('.rk button').length } : null; });
  ok(e0 && /Add sites first/.test(e0.t) && e0.act === 1 && e0.bar.join() === 'Close' && !/SAMPLE|Not available/.test(e0.t), 'G1 · no sites: "Add sites first" with one action, no print or download, no SAMPLE page, no "Not available" wall', JSON.stringify(e0));
  await page.evaluate(() => document.querySelector('.rk-overlay [data-r270-addsites]').click()); await page.waitForTimeout(600);
  ok(await page.evaluate(() => !document.querySelector('.rk-overlay') && document.querySelector('.view.active').getAttribute('data-view') === 'assessments'), 'G1 · the action closes the reader on the Assets tab (the sites upload)');
  await page.evaluate(() => { const S = samplePortfolio()[0]; const P = [['Lahore', 31.55, 74.34], ['Multan', 30.16, 71.52], ['Gilgit', 35.92, 74.31]];
    AGN.portfolio.intake.fromObjects(P.map((q, i) => { const x = Object.assign({}, S); ['demo', 'origin', 'origin_company', 'source'].forEach(k => delete x[k]); x.asset_id = 'T270-' + i; x.name = q[0] + ' depot'; x.location = q[0]; x.unit = null; x.latitude = q[1]; x.longitude = q[2]; return x; })); });
  await page.waitForTimeout(6000);
  const pf = await report(page, 'portfolio');
  /* v91.17.272 (owner): the portfolio report on the site level (each site scored at its own location) with the engine's tehsil level beside it */
  /* v91.17.273 (owner: reports too long): the portfolio prints each value once: summary (first actions), maps, hazards by site, the sites in rank order, limits */
  ok(['Summary', 'Map of the sites', 'Hazards by site', 'The sites', 'Limits and sources'].every((h, k, A) => pf.h2.indexOf(h) >= 0 && (k === 0 || pf.h2.indexOf(h) > pf.h2.indexOf(A[k - 1]))) && pf.h2.length === 5, 'G1 · portfolio report (v273): summary, maps, hazards by site, the sites in rank order, limits (nothing repeated)', pf.h2.join(' | '));
  const sites = pf.rec.results.sites || []; let pbad = [];
  for (const s of sites) { if (!s.top || !s.top.area_level) continue; const e = await page.evaluate(u => fetch('/api/levels/unit?unit=' + encodeURIComponent(u), { headers: { 'x-agn-view': 'customer' } }).then(x => x.json()), s.unit);
    const t0 = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); let best = -1; for (const d of (e.days || [])) { if (d.date < t0) continue; const L = d.layers && d.layers[s.top.hazard]; const i = L ? WORDS.indexOf(L.word) : -1; if (i > best) best = i; }
    if (WORDS[best] !== s.top.area_level) pbad.push(s.name + ' ' + s.top.hazard + ' ' + s.top.area_level + '≠' + WORDS[best]); }
  ok(sites.length === 3 && sites.every(s => s.top && (s.top.index != null || s.top.basis === 'tehsil level')) && !pbad.length, 'G1/G5 · every site scored at its own location; its area level = the engine level of its tehsil (3 sites)', pbad.join(',') || JSON.stringify(sites.map(s => s.top)));
  const pt = await page.evaluate(() => { const o = document.querySelector('.rk-overlay .rk'); return { heads: [...o.querySelectorAll('h3')].map(x => x.textContent).filter(t => /^4\.\d+ · /.test(t)), grid: [...o.querySelectorAll('table.rk-hzgrid tbody tr')].map(r => r.cells[0].textContent.trim()).slice(0, 3) }; });
  const rnk = (pf.rec.results.sites || []).map(s => s.name), app = (pf.rec.appendix || []).map(a => a.id);
  ok(pt.heads.length === 3 && pt.heads.every(t => /^4\.\d+ · \d+\. \S/.test(t)) && pt.grid.length === 3 && Array.isArray(pf.rec.results.actions_ranked) && app.includes('limits') && app.includes('howto'), 'G1 · the sites in rank order (4.1-4.3, the grid in the same order); the whole action list and the reference sections kept in the record (appendix: ' + app.join(',') + ')', JSON.stringify(pt));
  ok(!(pf.txt.match(/Screening index of each site|Sites by their level at the site, per hazard|Each site against its area|Temperature range at each site|Rain at each site|Screening index at /g) || []).length && (pf.txt.match(/Around the site/g) || []).length === 3 && (pf.txt.match(/The next 15 days at the site/g) || []).length === 3, 'G1 · v273: no cross-site chart repeating the tables; each site with its map snapshot and its 15-day chart (3)');
  await close(page);
  ok(errs.length === 0, 'client: zero page errors', errs.slice(0, 3).join(' | '));
  ok(!(await page.evaluate(() => (window.__csp || []).length)), 'client: zero CSP violations');
  await ctx.close(); }
{ const { ctx, page, errs } = await open({ operator: true });
  const r = await report(page, 'situation');
  ok(/Appendix/.test(r.h2.join(' ')), 'G2 · operator edition: the appendix', r.h2.join(' | '));
  ok(errs.length === 0, 'operator: zero page errors', errs.slice(0, 3).join(' | '));
  await ctx.close(); }
await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
