/* v91.17.283.39 (NIGRAAN 1.0.3) · LAYOUT SHIFT (owner item 8; live 1.0.2: analyst CLS 0.15). The start page (1440 x 731 and 390 x 844)
   and the analyst page (1440 x 731), opened with the visitor's location granted (a place auto-located), watched 40 s: the cumulative
   layout shift (the browser's own measure: the largest session window of shifts without recent input, 1 s gap, 5 s max) is below 0.05.
   The start page's bottom panel opens by a transform (the map is not resized): no shift beyond it. The largest shifts are listed.
   v91.17.283.40 (1.0.4): + the analyst at 1440 x 675, and its FIRST OPEN ON A COLD SERVER as on the laptop after a deploy (live 1.0.3:
   CLS 0.735, one shift of 0.727 of the map and the right panel at 12.9 s): this computer's operator choice remembered, every server answer
   11 s late (CLS_SLOW_MS), watched 45 s. Before 1.0.4 the operator header came back when the late answer arrived and moved the Overview
   (0.174 here); 1.0.4 keeps it from the first paint.
   usage: node scripts/tests28339/cls39.test.mjs [base] */
import { T, browser, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const SECS = +(process.env.CLS_SECS || 40);
const br = await browser();
const INIT = () => { window.__cls = []; const desc = (n) => { if (!n || !n.tagName) return String(n && n.nodeName); let s = n.tagName.toLowerCase(); if (n.id) s += '#' + n.id; else if (typeof n.className === 'string' && n.className.trim()) s += '.' + n.className.trim().split(/\s+/)[0]; return s; };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cls.push({ t: Math.round(e.startTime), v: e.value, input: e.hadRecentInput, src: (e.sources || []).map((s) => desc(s.node)).join(' | ') }); }).observe({ type: 'layout-shift', buffered: true }); };
const CLS = (all) => { let best = 0, cur = 0, st = -1, last = -1; for (const e of all.filter((x) => !x.input)) { if (st < 0 || e.t - last > 1000 || e.t - st > 5000) { cur = 0; st = e.t; } cur += e.v; last = e.t; best = Math.max(best, cur); } return best; };
const SLOW = +(process.env.CLS_SLOW_MS || 11000);
for (const [tag, path, w, h, mob, cold] of [['start', '/', 1440, 731], ['start phone', '/', 390, 844, true], ['analyst', '/analyst', 1440, 731], ['analyst 1440x675', '/analyst', 1440, 675], ['analyst cold first open (operator, every answer ' + SLOW / 1000 + ' s late, 1440x675)', '/analyst', 1440, 675, false, true]]) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, ...(mob ? { isMobile: true, hasTouch: true } : {}), geolocation: { latitude: 31.5204, longitude: 74.3587, accuracy: 25 }, permissions: ['geolocation'] });
  await ctx.addInitScript(INIT); if (cold) await ctx.addInitScript(() => { try { localStorage.setItem('agn.operator.v2', '1'); } catch (_) {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  if (cold) await pg.route((u) => /\/api\//.test(u.toString()), async (r) => { await new Promise((z) => setTimeout(z, SLOW)); try { await r.continue(); } catch (_) {} });
  await pg.goto(BASE + path, { waitUntil: 'load', timeout: 240000 }); await pg.waitForTimeout((cold ? SECS + 5 + SLOW / 1000 : SECS) * 1000);
  const all = await pg.evaluate(() => window.__cls); const v = CLS(all);
  const located = await pg.evaluate((p) => p === '/' ? !!(window.AGNSTART.nat && window.AGNSTART.nat.sel) : !!(window.AGNAutoLoc && window.AGNAutoLoc.state === 'located'), path);
  ok(located, tag + ': a place was auto-located', located);
  ok(v < 0.05, tag + ': CLS ' + v.toFixed(4) + ' < 0.05', all.filter((x) => x.v >= 0.002).sort((a, b) => b.v - a.v).slice(0, 8).map((x) => x.t + 'ms ' + x.v.toFixed(4) + (x.input ? ' (input)' : '') + ' ' + x.src).join(' || '));
  ok(errs.length === 0, tag + ': no page errors', errs.join(' | '));
  await ctx.close(); }
await br.close(); done();
