import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.272.1 · report polish (owner review of the 10-site sample portfolio, 17 Oct 2026).
     node scripts/tests2721/reports2721.test.mjs [baseUrl]        default http://127.0.0.1:8787
   K · kit (build/rk/rk.js in node): areaMap site labels stay inside the frame and clear of the north arrow and scale bar boxes; a label
       near the right edge flips to the left of its dot; two dots closer than a label get leader lines
   Browser (Chromium, CSP enforced), provider-dependent answers replaced by routes (as reports270): the AJG sample (Assets > Load sample),
   1 · portfolio "Hazards by site": number + short name, no index, tables of at most 4 hazards; printed (A4, print media) every element
       of the report inside the text width; the printed PDF has no word outside the text box (when pdftotext is installed)
   2 · landslide / GLOF where the engine says "not applicable": "Does not occur here", never "Input missing" or "n/a"
   3 · every site label of every report map inside its frame, clear of the north arrow and the scale bar, no two labels overlapping
   4 · the overview map: dots closer than a label carry leader lines
   5 · levels answering late (12 s): the Reports tab preview waits (no document frozen), an executive brief opened before the levels
       waits for them; no report made after load says "itself a defect" or carries "still being read"
   zero page errors, zero CSP violations. PASS/FAIL lines; exit 1 on any FAIL. */
import { createRequire } from 'node:module'; import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import { tmpdir } from 'node:os'; import { spawnSync } from 'node:child_process';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = (process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && d != null ? ' · ' + String(d).slice(0, 400) : '')); };
const hit = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

/* ── K · the kit in node ── */
{ const tmp = mkdtempSync(join(tmpdir(), 'rk2721-')), f = join(tmp, 'rk.cjs'); writeFileSync(f, readFileSync(join(ROOT, 'build', 'rk', 'rk.js'), 'utf8'));
  const RK = createRequire(import.meta.url)(f);
  const lab = (svg) => [...svg.matchAll(/<text class="pl" x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]*)<\/text>/g)].map(m => ({ x: +m[1], y: +m[2], t: m[3], b: [+m[1], +m[2] - 15, +m[1] + m[3].length * 9 + 4, +m[2] + 5] }));
  const vb = (svg) => { const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg); return [+m[1], +m[2]]; };
  const m1 = RK.areaMap({ title: 'm', bbox: [74, 31, 75, 31.45], points: [{ lon: 74.99, lat: 31.2, label: '8. A long site name at the edge', r: 7 }, { lon: 74.98, lat: 31.44, label: '2. Near the scale bar', r: 7 }, { lon: 74.01, lat: 31.44, label: '1. Under the north arrow', r: 7 }] });
  const L1 = lab(m1), [W1, H1] = vb(m1);
  ok(L1.length === 3 && L1.every(l => l.b[0] >= 0 && l.b[2] <= W1 && l.b[1] >= 0 && l.b[3] <= H1), 'K · 3 · site labels inside the frame (right edge, top corners)', JSON.stringify(L1.map(l => l.b.map(Math.round))));
  ok(L1[0].b[2] < 0.99 * W1 - 7,'K · 3 · a label near the right edge flips to the left of its dot', JSON.stringify(L1[0]));
  const sc = /class="scale" style="width:([\d.]+)%"/.exec(m1), scBox = [W1 - (+sc[1]) / 100 * W1 - 8, 0, W1, 40];
  ok(L1.every(l => !hit(l.b, [0, 0, 44, 58]) && !hit(l.b, scBox)), 'K · 3 · labels clear of the north arrow and the scale bar boxes', JSON.stringify(L1.map(l => l.b.map(Math.round))));
  const m2 = RK.areaMap({ title: 'm', bbox: [60, 23, 78, 37], points: [{ lon: 72.86, lat: 33.86, label: '5', r: 7 }, { lon: 73.05, lat: 33.66, label: '9', r: 7 }, { lon: 67, lat: 30.2, label: '6', r: 7 }] });
  const L2 = lab(m2);
  ok((m2.match(/<line /g) || []).length === 2 && L2.length === 3 && !hit(L2[0].b, L2[1].b), 'K · 4 · two dots closer than a label: both labels set off on leader lines, apart; a lone dot has none', (m2.match(/<line /g) || []).length);
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
const lvl = (u, h, d) => { if (/glof|landslide/.test(h) && !/Gilgit|Hunza|Skardu|Muzaffarabad/.test(u)) return -2; const r = crc(u + '|' + h + '|' + d); return r < .5 ? 0 : r < .7 ? 1 : r < .85 ? 2 : r < .95 ? 3 : 4; };
const fresh = () => new Date(Date.now() - 2 * 3600e3).toISOString();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const outlookFix = () => ({ unit: {}, ensemble: { at: fresh(), members: 51, days: Array.from({ length: 16 }, (_, i) => ({ date: pkDay(i), tx: [28 + i % 3, 31 + i % 4, 34 + i % 3], tn: [14, 16, 18], pr: i === 5 ? [0, 6, 18] : [0, 0, 1], gu: [18, 26, 40], p: { pr10: i === 5 ? 30 : 0 } })) }, events: { window: [pkDay(0), pkDay(14)], members: 51 } });   /* v283.19: the same 15-day outlook for /api/outlook/unit and for the bundle part outlook */
const unitLevels = (u) => ({ ready: true, at: fresh(), stale: false, words: WORDS, unit: u, days: [0, 1, 2, 3].map(d => ({ day: d, date: pkDay(d), layers: Object.fromEntries(HZ.filter(h => d === 0 || !/glof|drought/.test(h)).map(h => { const v = lvl(u, h, d); return [h, { name: h, level: v, word: v >= 0 ? WORDS[v] : 'not applicable' }]; })) })) });   /* v283.19: the same tehsil levels for /api/levels/unit and for the bundle part levels */
function routes(lateMs) { const t0 = Date.now(); return [
  ['**/px/v1/forecast*', r => json(r, 503, { error: 'test' })],
  ['**/api/levels/unit*', async r => { const u = new URL(r.request().url()).searchParams.get('unit') || ''; const w = t0 + lateMs - Date.now(); if (w > 0) await sleep(w);
    return json(r, 200, unitLevels(u)); }],
  ['**/api/levels?*', r => { const q = new URL(r.request().url()).searchParams, h = q.get('layer'), d = +q.get('day') || 0; const L = {};
    for (const f of (globalThis.__UIDS || [])) L[f] = lvl(f, h, d); return json(r, 200, { ready: true, at: fresh(), layer: h, day: d, date: pkDay(d), levels: L }); }],
  ['**/api/outlook/unit*', r => json(r, 200, outlookFix())],
  ['**/api/point?*', async r => { /* v283.19: the real place bundle with the test's hours (its shape and parts kept) */ const t0 = Date.now() + 5 * 3600e3; const hrs = Array.from({ length: 96 }, (_, i) => { const t = new Date(t0 + (i - 6) * 3600e3).toISOString().slice(0, 13) + ':00'; return { time: t, tempC: 22 + 6 * Math.sin((i - 8) / 24 * 2 * Math.PI), lo90: 18, hi90: 30, rainMm: i === 30 ? 1.4 : 0, gustKmh: 30, windKmh: 12, rh: 50, feelsC: 23, dewC: 10 }; });
    let rr; try { rr = await r.fetch(); } catch (_) { return r.abort().catch(() => {}); } const B = await rr.json(); const T = { ok: true, time: new Date(t0).toISOString().slice(0, 13) + ':00', now: { tempC: 24 }, hours: hrs, days: [] }; if (B && B.ok && B.parts) B.parts.outlook = { ...(B.parts.outlook || {}), ok: true, unavailable: false, v: outlookFix() }; if (B && B.ok && B.parts && B.place && B.place.unitId) B.parts.levels = { ...(B.parts.levels || {}), ok: true, unavailable: false, v: unitLevels(B.place.unitId) }; return json(r, 200, B && B.ok ? { ...B, time: T.time, now: { ...(B.now || {}), tempC: 24 }, hours: T.hours.map((h) => ({ ...(B.hours && B.hours[0] || {}), ...h })) } : B); }],
  ['**/api/ai/status*', r => json(r, 503, { error: 'test' })]]; }
async function open({ operator = false, lateMs = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 240)));
  await page.addInitScript(op => { document.addEventListener('securitypolicyviolation', e => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); });
    try { if (op) localStorage.setItem('agn.operator.v1', '1'); else localStorage.removeItem('agn.operator.v1'); } catch (_) {} }, operator);
  globalThis.__UIDS = JSON.parse(readFileSync(join(ROOT, 'data', 'pk-tehsils.json'), 'utf8')).features.map(f => f.properties.uid);
  for (const [pat, fn] of routes(lateMs)) await page.route(pat, fn);
  await page.goto(BASE + '/analyst' + (operator ? '?operator=1' : ''), { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.AGN && AGN.reports268 && window.AGNRK, null, { timeout: 180000 });
  return { ctx, page, errs };
}
const go = (page, v) => page.evaluate(v => { const b = document.querySelector('#machNav button[data-goto="' + v + '"]'); if (b) b.click(); }, v);
const csp = (page) => page.evaluate(() => window.__csp || []);

/* 1-4 · the sample portfolio report */
{ const { ctx, page, errs } = await open();
  await page.waitForTimeout(6000);
  await page.evaluate(() => { window.print = function () {}; AGN.flow.setActiveLocation({ name: 'Lahore', lat: 31.558, lon: 74.35071 }, 'Lahore', { src: 'search' }); });
  await page.waitForTimeout(5000); await go(page, 'assessments'); await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector('#asmtTabs button[data-asmt="portfolio"]'); if (b) b.click(); const s = document.getElementById('asmtLoadSample'); if (s) s.click(); });
  await page.waitForTimeout(15000);
  await page.evaluate(() => AGN.reports268.open('portfolio', null));
  await page.waitForFunction(() => { const c = AGN.reports268.current(); return c && c.kind === 'portfolio' && c.record && document.querySelector('.rk-overlay .rk-cover,.rk-overlay .rk-bhead'); }, null, { timeout: 240000 });
  await page.setViewportSize({ width: 695, height: 1000 }); await page.evaluate(() => document.body.classList.add('rk-printing')); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(700);
  const g = await page.evaluate(() => { const o = document.querySelector('.rk-overlay .rk'), W = o.getBoundingClientRect(), out = { over: [], grids: [], labels: 0, labBad: [], leaders: 0 };
    for (const e of o.querySelectorAll('*')) { if (e.closest('svg')) continue; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue; if (r.right > W.right + 1 || r.left < W.left - 1) out.over.push(e.tagName + ' ' + (e.textContent || '').trim().slice(0, 30)); }
    out.grids = [...o.querySelectorAll('table.rk-hzgrid')].map(t => ({ cols: t.querySelectorAll('thead th').length, fit: t.scrollWidth <= t.clientWidth + 1 && t.getBoundingClientRect().right <= W.right + 1, first: t.querySelector('tbody td').textContent,
      cells: [...t.querySelectorAll('tbody td')].map(td => td.innerText.replace(/\s+/g, ' ').trim()), h: [...t.querySelectorAll('thead th')].map(x => x.textContent) }));
    for (const m of o.querySelectorAll('.rk-map')) { const sv = m.querySelector('svg.base').getBoundingClientRect(), ko = [...m.querySelectorAll('.north,.scale')].map(x => x.getBoundingClientRect()), T = [...m.querySelectorAll('svg.base text.pl')];
      out.leaders += m.querySelectorAll('svg.base line').length;
      T.forEach((t, i) => { const r = t.getBoundingClientRect(); out.labels++; const bad = r.left < sv.left - .5 || r.right > sv.right + .5 || r.top < sv.top - .5 || r.bottom > sv.bottom + .5 || ko.some(k => !(r.right < k.left || r.left > k.right || r.bottom < k.top || r.top > k.bottom))
        || T.some((u, j) => { if (j <= i) return false; const q = u.getBoundingClientRect(); return !(r.right < q.left || r.left > q.right || r.bottom < q.top || r.top > q.bottom); }); if (bad) out.labBad.push(t.textContent); }); }
    out.txt = o.innerText; return out; });
  ok(g.grids.length >= 2 && g.grids.every(t => t.cols <= 5 && t.fit), '1 · Hazards by site: tables of at most 4 hazards, each inside the A4 text width (print media)', JSON.stringify(g.grids.map(t => [t.cols, t.fit])));
  ok(!g.over.length, '1 · printed report: every element inside the text width', g.over.slice(0, 5).join('; '));
  ok(g.grids.every(t => !t.cells.some((c, k) => k % t.cols > 0 && /\/100|\b\d{1,3}\b/.test(c))) && /^\d+\. \S/.test(g.grids[0].first) && !g.grids.some(t => t.cells.some(c => /\(AJG Supplies\)/.test(c))), '1 · grid: number + short name, no index, no client suffix', JSON.stringify(g.grids[0].cells.slice(0, 6)));
  const LG = g.grids.map(t => { const i = t.h.indexOf('Landslide'), j = t.h.indexOf('GLOF'); return t.cells.filter((c, k) => { const col = k % t.cols; return col === i || col === j; }); }).flat();
  ok(LG.length >= 10 && LG.filter(c => /Does not occur here/.test(c)).length >= 8 && !LG.some(c => /Input missing|\bn\/a\b/.test(c)), '2 · landslide / GLOF on the plains: "Does not occur here" (the engine\'s applicability), never "Input missing" or "n/a"', JSON.stringify(LG.slice(0, 6)));
  ok(g.labels >= 10 && !g.labBad.length, '3 · ' + g.labels + ' site labels: inside their frames, clear of the north arrow and the scale bar, no overlap', g.labBad.join('; '));
  ok(g.leaders >= 2, '4 · overview map: dots closer than a label carry leader lines', g.leaders);
  ok(!/itself a defect|still being read|Reading the hazard engine/.test(g.txt), '5 · the portfolio report carries no "defect" or loading text');
  /* the rotated SAMPLE watermark (a fixed full-page mark, not page content) is left out of the word check */
  await page.evaluate(() => document.querySelectorAll('.rk-overlay .rk div[aria-hidden="true"]').forEach(x => { if (/rotate/.test(x.getAttribute('style') || '')) x.style.display = 'none'; }));
  const pdfF = join(mkdtempSync(join(tmpdir(), 'p2721-')), 'p.pdf'); await page.pdf({ path: pdfF, preferCSSPageSize: true, printBackground: true });
  const pt = spawnSync('pdftotext', ['-bbox', pdfF, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (pt.status === 0) { let pw = 0; const out = []; for (const m of pt.stdout.matchAll(/<page width="([\d.]+)"|<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g)) { if (m[1]) { pw = +m[1]; continue; } if (+m[2] < 0 || +m[3] > pw) out.push(m[4]); }
    ok(!out.length, '1 · printed PDF: no word outside the page box', out.slice(0, 5).join(' ')); }
  else console.log('SKIP 1 · printed PDF word check (pdftotext not installed)');
  ok(!errs.length && !(await csp(page)).length, 'portfolio: zero page errors, zero CSP violations', errs.join(' | '));
  await ctx.close(); }

/* 5 · the levels answer 12 s late */
{ const { ctx, page, errs } = await open({ operator: true, lateMs: 12000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.print = function () {}; AGN.flow.setActiveLocation({ name: 'Lahore', lat: 31.558, lon: 74.35071 }, 'Lahore', { src: 'search' }); });
  await page.waitForTimeout(1500);
  const pv0 = await page.evaluate(() => { const h = document.getElementById('asmtReportPreview'); return h ? { wait: !!h.querySelector('[data-agn-level-wait]'), frozen: /^Document NIG-/.test(h.innerText.trim()), defect: /itself a defect/.test(h.innerText) } : null; });
  ok(pv0 && !pv0.frozen && !pv0.defect, '5 · Reports tab preview before the levels: no document frozen, no "defect" text', JSON.stringify(pv0));
  await go(page, 'assessments'); await page.waitForTimeout(500);
  const t0 = Date.now(); await page.evaluate(() => AGN.reports268.open('executive', null));
  const spin = await page.evaluate(() => !!document.querySelector('.rk-overlay .r268-spin'));
  await page.waitForFunction(() => { const c = AGN.reports268.current(); return (c && c.kind === 'executive' && c.record && document.querySelector('.rk-overlay .rk-cover')) || /could not be built/.test((document.getElementById('r268Prep') || {}).textContent || ''); }, null, { timeout: 120000 });
  const ex = await page.evaluate(() => { const o = document.querySelector('.rk-overlay .rk'); const T = o ? o.innerText : ''; return { built: !!document.querySelector('.rk-overlay .rk-cover'), defect: /itself a defect/.test(T), pend: /Reading the hazard engine|still being read/.test(T) }; });
  ok(spin && ex.built && !ex.defect && !ex.pend && Date.now() - t0 > 3000, '5 · executive brief opened before the levels: spinner, waits for them (' + Math.round((Date.now() - t0) / 1000) + ' s), built without "defect" or loading text', JSON.stringify(ex));
  await page.evaluate(() => AGNRK.close()); await page.waitForTimeout(4000);
  const pv1 = await page.evaluate(() => { const h = document.getElementById('asmtReportPreview'); return h ? { frozen: /^Document NIG-/.test(h.innerText.trim()), defect: /itself a defect/.test(h.innerText), wait: !!h.querySelector('[data-agn-level-wait]') } : null; });
  ok(pv1 && !pv1.wait && !pv1.defect, '5 · Reports tab preview after the levels land: rebuilt by itself, no "defect" text', JSON.stringify(pv1));
  ok(!errs.length && !(await csp(page)).length, 'late levels: zero page errors, zero CSP violations', errs.join(' | '));
  await ctx.close(); }
await browser.close();
console.log(`\n${pass} PASS · ${fail} FAIL`); process.exit(fail ? 1 : 0);
