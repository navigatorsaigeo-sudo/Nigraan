import * as __T from '../lib/testenv.mjs';
// v91.17.283.6 item 1 · the start page drawer, Hazards tab: "All hazards · today and next 3 days" shows all four day columns (Today and the
// next 3 days) INSIDE the drawer at 1366 and 1920 (no sideways scroll, no column cut off), every hazard row has its evidence tag under the
// hazard name, and a long label ("Outside method range") wraps in its cell. Fresh levels are the tests280 fixture laid over the server's
// answer (FIXTURE), with heavy rain assessed on all four days (W1). Browser test. usage: node scripts/tests2836/hz4days.test.mjs <base url> [outdir]
const BASE = process.argv[2] || 'http://127.0.0.1:9041', OUT = process.argv[3] || null;
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 900) : '')); } };
const todayIso = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const plus = (n) => new Date(Date.parse(todayIso() + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const FIX = { heat: [1, 2, 1, 0], cold: [0, 0, 0, 0], rain_hz: [0, 0, 0, 0], flood: [0, 0, 0, 0], wind: [-1, -1, -1, -1], landslide: [-2, -2, -2, -2], glof: [-2, -2, -2, -2], drought: [0, 0, 0, 0] };
for (const [w, h] of [[1366, 768], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
  await page.route('**/api/levels/unit?**', async (route) => { const r = await route.fetch(); const J = await r.json();
    if (Array.isArray(J.days) && J.days.length) { J.stale = false; J.at = new Date(Date.now() - 20 * 60e3).toISOString();
      J.days = [0, 1, 2, 3].map((i) => { const d = J.days[i] || J.days[0]; const L = {}; for (const [k, v] of Object.entries(FIX)) { L[k] = { name: (d.layers[k] || {}).name || k, level: v[i], word: v[i] >= 0 ? ['Normal', 'Low', 'Moderate', 'High', 'Severe'][v[i]] : v[i] === -2 ? 'not applicable' : 'no data' }; } return { day: i, date: plus(i), layers: L }; }); }
    await route.fulfill({ response: r, json: J }); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.AGNSTART && window.map && window.L, null, { timeout: 60000 });
  const s0 = await page.evaluate(() => window.AGNSTART.seq); await page.fill('#q', 'Lahore'); await page.click('#go');
  await page.waitForFunction((s0) => window.AGNSTART.seq > s0 || !document.querySelector('#sr').hidden, s0, { timeout: 60000 }).catch(() => {});
  if (!(await page.evaluate(() => !!window.AGNSTART.place))) await page.locator('#sr button').first().click({ timeout: 10000 }).catch(() => {});
  const ready = await page.waitForFunction(() => { const S = window.AGNSTART; return document.querySelector('#card[data-ready]') && document.querySelector('#hzSec') && S.data && S.data.place === S.place && S.data.lv && S.data.lv.ok; }, null, { timeout: 120000 }).then(() => true, () => false);
  await page.click('.tab[data-t="hz"]').catch(() => {}); await page.waitForSelector('#hzTable', { timeout: 30000 }).catch(() => {});
  /* the drawer is a carousel (a translateX transition): measure once the Hazards pane has slid into the drawer */
  await page.waitForFunction(() => { const p = document.getElementById('pane_hz'), c = document.getElementById('card'); if (!p || !c) return false; const a = p.getBoundingClientRect(), b = c.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1; }, null, { timeout: 30000, polling: 100 }).catch(() => {});
  const m = await page.evaluate(() => { const t = document.getElementById('hzTable'); if (!t) return null; const wrap = t.parentElement, card = document.getElementById('card').getBoundingClientRect(), r = t.getBoundingClientRect();
    const head = [...t.querySelectorAll('thead th')].map((x) => x.textContent);
    const rows = [...t.querySelectorAll('tbody tr')].map((tr) => ({ hz: tr.getAttribute('data-hz'), cells: tr.children.length, ev: (tr.querySelector('.hzev .tag') || {}).textContent || '',
      out: [...tr.children].some((c) => { const b = c.getBoundingClientRect(); return b.right > card.right + 0.5 || b.left < card.left - 0.5; }),
      lab: [...tr.querySelectorAll('td.mini .lvl')].some((l) => l.scrollWidth > l.clientWidth + 1) }));
    return { head, rows, scroll: wrap.scrollWidth - wrap.clientWidth, tableRight: r.right, cardRight: card.right, h2: (t.closest('section') || document).querySelector('h2') && [...(t.closest('section') || document).querySelectorAll('h2')].map((x) => x.textContent).find((x) => /All hazards/.test(x)) }; });
  const V = w + ' ';
  ok(ready && m, V + 'H0 the Hazards tab of a place opens with the All hazards table', JSON.stringify({ ready, m: !!m }));
  if (m) {
    ok(m.head.length === 5 && m.head[0] === 'Hazard' && m.head[1] === 'Today' && m.head.slice(2).every((x) => /^\w{3} \d+$/.test(x)), V + 'H1 header: Hazard + Today + the next 3 days (4 day columns)', JSON.stringify(m.head));
    ok(m.h2 === 'All hazards · today and next 3 days', V + 'H2 heading says today and next 3 days', m.h2);
    ok(m.scroll <= 0 && m.tableRight <= m.cardRight + 0.5 && m.rows.every((r) => !r.out), V + 'H3 the table fits the drawer: no sideways scroll, no cell outside it', JSON.stringify({ scroll: m.scroll, t: m.tableRight, c: m.cardRight }));
    ok(m.rows.length >= 6 && m.rows.every((r) => r.cells === 5), V + 'H4 every hazard row has its 4 day cells', JSON.stringify(m.rows.map((r) => r.hz + ':' + r.cells)));
    ok(m.rows.every((r) => / · Level for the surrounding area \(/.test(r.ev)), V + 'H5 every row keeps its evidence tag (product type · surrounding area) under the hazard name', JSON.stringify(m.rows.map((r) => r.ev)).slice(0, 400));
    ok(m.rows.every((r) => !r.lab), V + 'H6 no level label is cut: long labels wrap inside their cell');
    const rain = await page.evaluate(() => { const tr = document.querySelector('#hzTable tr[data-hz="rain_hz"]'); return tr ? [...tr.querySelectorAll('td.mini')].map((c) => c.textContent) : null; });
    ok(rain && rain.length === 4 && rain.every((x) => x === 'Normal'), V + 'H7 FIXTURE heavy rain shows all four days (W1 fills days 2-3)', JSON.stringify(rain));
  }
  ok(!errs.length, V + 'H8 no page errors', JSON.stringify(errs.slice(0, 3)));
  if (OUT) { await page.evaluate(() => { const tr = document.querySelector('#hzTable tr[data-hz="rain_hz"]'); if (tr) tr.scrollIntoView({ block: 'center' }); }); await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/hz4days_' + w + '.png' }); }
  await ctx.close();
}
await browser.close();
console.log(`\nhz4days ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
