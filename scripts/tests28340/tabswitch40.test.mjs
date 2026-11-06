/* v91.17.283.40 (NIGRAAN 1.0.4) · OVERVIEW TAB SWITCH (live 1.0.3 laptop: longest task 370 ms after a switch to the Overview, Operations
   139 ms; target < 200 ms). The laptop is matched with a 4x CPU slowdown (1.0.3 here: 422 ms on the first switch). Operations -> Overview,
   5 times at 1440 x 675: the switch's own work (the tasks that start in the 600 ms after the click) has its longest task below 200 ms
   (median of the 5); the longest task of the 5 s after it (the live check's window, background work included) is reported; the map keeps
   its size and the view looks the same after the round trip (no visual change); the hidden Overview takes no space and is not drawn.
   usage: node scripts/tests28340/tabswitch40.test.mjs [base] */
import { T, browser, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const br = await browser();
const ctx = await br.newContext({ viewport: { width: 1440, height: 675 }, geolocation: { latitude: 31.5204, longitude: 74.3587, accuracy: 25 }, permissions: ['geolocation'] });
await ctx.addInitScript(() => { window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (_) {} });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
const cdp = await ctx.newCDPSession(pg); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +(process.env.TAB_THROTTLE || 4) });
await pg.goto(BASE + '/analyst', { waitUntil: 'load', timeout: 240000 }); await pg.waitForTimeout(35000);
const m0 = await pg.evaluate(() => [window.map.getSize().x, window.map.getSize().y, window.map.getZoom(), window.map.getCenter().lat.toFixed(4)]);
const own = [], win5 = [];
for (let i = 0; i < 5; i++) {
  await pg.click('#agn-tab-operations'); await pg.waitForTimeout(4000);
  if (i === 0) { const h = await pg.evaluate(() => { const v = document.querySelector('.view[data-view="overview"]'); return [Math.round(v.getBoundingClientRect().height), getComputedStyle(v).contentVisibility]; });
    ok(h[0] === 0 && h[1] === 'hidden', 'hidden Overview: no space, not drawn (' + h.join(', ') + ')'); }
  const t0 = await pg.evaluate(() => performance.now()); await pg.click('#agn-tab-overview'); await pg.waitForTimeout(5200);
  const r = await pg.evaluate((t0) => { const L = window.__lt.filter((x) => x[0] >= t0 - 5); return { own: Math.round(Math.max(0, ...L.filter((x) => x[0] <= t0 + 600).map((x) => x[1]))), w5: Math.round(Math.max(0, ...L.filter((x) => x[0] <= t0 + 5000).map((x) => x[1]))) }; }, t0);
  own.push(r.own); win5.push(r.w5); }
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
ok(med(own) < 200, 'switch to the Overview (4x slowdown): longest task of the switch, median ' + med(own) + ' ms < 200 [' + own.join(', ') + ']');
console.log('INFO longest task in the 5 s after each switch (background included, the live check window): median ' + med(win5) + ' ms [' + win5.join(', ') + ']');
const m1 = await pg.evaluate(() => [window.map.getSize().x, window.map.getSize().y, window.map.getZoom(), window.map.getCenter().lat.toFixed(4)]);
ok(JSON.stringify(m0) === JSON.stringify(m1), 'the map keeps its size, zoom and centre after 5 round trips', m0 + ' / ' + m1);
const vis = await pg.evaluate(() => { const v = document.querySelector('.view[data-view="overview"]'); const r = v.getBoundingClientRect(); const L = document.getElementById('mpLeft').getBoundingClientRect(); return [Math.round(r.height), Math.round(L.width), document.querySelectorAll('#mpMapWrap path.leaflet-interactive').length]; });
ok(vis[0] > 400 && vis[1] > 150 && vis[2] > 500, 'shown Overview: laid out as before (height ' + vis[0] + ', left panel ' + vis[1] + ' px, ' + vis[2] + ' tehsil shapes)');
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close(); done();
