/* v91.17.283.37 (NIGRAAN 1.0.1, coordinator 30 Oct) · THE START PAGE HEADER: no two visible header items overlap (brand, title, flag and
   "Pakistan", clock, My sites, Analyst view, the search panel) at 1366, 1280 and 1024 px and on a phone (390 px); the title is not cut to nothing.
   usage: node scripts/tests28337/header37.test.mjs [base] */
import { T, browser, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const br = await browser();
for (const [w, h, mob] of [[1366, 768], [1280, 800], [1024, 768], [390, 844, true]]) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, ...(mob ? { isMobile: true, hasTouch: true } : {}) }); const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load' }); await pg.waitForTimeout(5000);
  const R = await pg.evaluate(() => { const items = { brand: '#brand', title: '#nvTitle', pk: '.pkid', clock: '#clock', saved: '#btnSaved', analyst: '#btnAnalyst', hero: '#hero', legend: '#nvLegend' };
    const vis = (e) => { if (!e) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; };
    const box = {}; for (const [k, s] of Object.entries(items)) { const e = document.querySelector(s); if (!vis(e)) continue; let r = e.getBoundingClientRect();
      if (k === 'title') { const rg = document.createRange(); rg.selectNodeContents(e); const rr = rg.getBoundingClientRect(); r = { left: Math.max(r.left, rr.left), right: Math.min(r.right, rr.right), top: r.top, bottom: r.bottom }; }
      box[k] = { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; }
    const t = document.getElementById('nvTitle'); return { box, dark: document.body.classList.contains('agn-dark'), titleCut: t ? t.scrollWidth > t.clientWidth + 1 : null, titleText: t ? t.textContent : '', sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  const K = Object.keys(R.box), hits = [];
  for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) { const a = R.box[K[i]], b = R.box[K[j]]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) hits.push(K[i] + ' x ' + K[j]); }
  ok(R.dark && R.box.title, w + ' px: the dark Pakistan view shows its title', JSON.stringify(R.box.title));
  ok(hits.length === 0, w + ' px: no header items overlap (' + K.join(', ') + ')', hits.join(', ') + ' :: ' + JSON.stringify(R.box));
  ok(R.sw <= R.iw + 1, w + ' px: no horizontal scroll', R.sw + ' > ' + R.iw);
  await ctx.close(); }
await br.close(); done();
