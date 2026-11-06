import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.144 · B5 · no freeze over 1 s while pages load: two Customize pages and NIGRAAN open at once, the GLOF national layer rebuilt,
   and twelve identical forecast requests; /api/health is timed every 100 ms throughout. node scripts/tests144/speed.test.mjs */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { createRequire } from 'node:module';
const PW = __T.playwrightSync();
const B = process.env.BASE || 'http://127.0.0.1:8787', H = { 'Sec-Fetch-Site': 'same-origin' };
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
/* the server's own start-up warm-up (place and street indexes, first 10 s) is not counted: the test waits 15 s after the server answers */
for (let i = 0; i < 60; i++) { try { if ((await fetch(B + '/api/health')).ok) break; } catch (_) {} await new Promise(r => setTimeout(r, 1000)); }
await new Promise(r => setTimeout(r, 15000));
await fetch(B + '/api/loop?reset=1');
const lat = []; let stop = false;
const probe = (async () => { while (!stop) { const t = Date.now(); try { await fetch(B + '/api/health', { signal: AbortSignal.timeout(30000) }); } catch (_) {} lat.push(Date.now() - t); await new Promise(r => setTimeout(r, 100)); } })();
const br = await __T.launch(PW.chromium, { executablePath: __agnChrome(__T.chromiumPath()) });
const pages = await Promise.all([0, 1, 2].map(() => br.newPage({ viewport: { width: 1400, height: 900 } })));
await Promise.all([pages[0].goto(B + '/customize', { waitUntil: 'domcontentloaded', timeout: 120000 }), pages[1].goto(B + '/customize#weather', { waitUntil: 'domcontentloaded', timeout: 120000 }), pages[2].goto(B + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 })]);
const q = '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=31.52&longitude=74.35&hourly=temperature_2m&forecast_days=3&timezone=Asia%2FKarachi';
const same = await Promise.all(Array.from({ length: 12 }, () => fetch(B + q, { headers: H }).then(async r => ({ sh: r.headers.get('x-agn-shared'), t: await r.text() }))));
ok(same.filter(x => x.sh).length >= 6 && new Set(same.map(x => JSON.stringify(JSON.parse(x.t).hourly.temperature_2m))).size === 1, 'identical forecast requests answered once: ' + same.filter(x => x.sh).length + ' of 12 shared, one forecast');
const g = await fetch(B + '/api/glof/national', { headers: H }); ok(g.ok, 'GLOF national answered');
await pages[0].waitForFunction(() => /(\d+) of \1 checked/.test(document.querySelector('#ov-ajg')?.innerText || ''), null, { timeout: 240000, polling: 1000 }).catch(() => {});
await new Promise(r => setTimeout(r, 5000));
stop = true; await probe; await br.close();
const s = lat.slice().sort((a, b) => a - b), max = s[s.length - 1], p95 = s[Math.floor(s.length * 0.95)];
console.log('health samples', s.length, 'p50', s[s.length >> 1], 'p95', p95, 'max', max, 'ms');
const loop = await fetch(B + '/api/loop').then(r => r.json());
console.log('server event loop: longest block', loop.maxMs, 'ms, p99', loop.p99Ms, 'ms (the health round trip above also carries the browser and test load on this machine)');
ok(loop.maxMs < 1000, 'no freeze over 1 s in the server while the pages loaded (longest block ' + loop.maxMs + ' ms)');
process.exit(fails ? 1 : 0);
