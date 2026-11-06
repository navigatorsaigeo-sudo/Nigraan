/* test only: analyst page loads -> /api + /px requests per load (first paint = until load+3 s; whole = 25 s), JS heap after a forced GC, 3 reloads
   usage: node page.mjs <base> <out.json> [path=/analyst] [waitS=25] */
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const [B, OUT, PATH = '/analyst', WS = '25'] = process.argv.slice(2);
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--js-flags=--expose-gc', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await br.newContext({ viewport: { width: 1400, height: 900 } }); const pg = await ctx.newPage(); const cdp = await ctx.newCDPSession(pg);
await cdp.send('HeapProfiler.enable'); await cdp.send('Performance.enable');
let reqs = [], loadAt = null; const t0 = { v: 0 };
pg.on('request', (r) => { const u = new URL(r.url()); if (/^\/(api|px)\//.test(u.pathname)) reqs.push({ t: Date.now() - t0.v, p: u.pathname, q: u.search.slice(0, 120) }); });
pg.on('load', () => { loadAt = Date.now() - t0.v; });
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
const runs = [];
for (let k = 0; k < 4; k++) {
  reqs = []; loadAt = null; t0.v = Date.now();
  if (k === 0) await pg.goto(B + PATH, { waitUntil: 'load', timeout: 120000 }); else await pg.reload({ waitUntil: 'load', timeout: 120000 });
  await pg.waitForTimeout(Number(WS) * 1000);
  await cdp.send('HeapProfiler.collectGarbage'); await pg.waitForTimeout(500);
  const m = await cdp.send('Performance.getMetrics'); const g = (n) => (m.metrics.find((x) => x.name === n) || {}).value;
  const first = reqs.filter((r) => r.t <= (loadAt || 0) + 3000).length;
  const byPath = {}; for (const r of reqs) byPath[r.p] = (byPath[r.p] || 0) + 1;
  runs.push({ list: k === 0 ? reqs.map((r) => r.t + ' ' + r.p + r.q) : undefined, load: k, loadMs: loadAt, requests: reqs.length, firstPaintRequests: first, heapMB: Math.round(g('JSHeapUsedSize') / 1048576 * 10) / 10, nodes: g('Nodes'), listeners: g('JSEventListeners'), byPath });
  console.log('load', k, 'loadMs', loadAt, 'requests', reqs.length, 'first', first, 'heapMB', runs[k].heapMB, 'nodes', runs[k].nodes, 'listeners', runs[k].listeners);
}
writeFileSync(OUT, JSON.stringify({ runs, errs: errs.slice(0, 20) }, null, 1)); await br.close();
