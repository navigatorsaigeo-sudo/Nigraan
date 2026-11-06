import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.276 · CLEAN · launch readiness checks.
     node scripts/tests276/clean276.test.mjs [baseUrl]     default http://127.0.0.1:8787
   K1 the page's build stamp (AGN_BUILD.patch: footer, report build_version, engine and AI build stamp) is the package version
      (it said 91.17.259 from v259 to v274)
   K2 the report correction record states the served chain read from the point forecast, not the retired text
      "mountain MOS daytime only; global reanalysis hour-of-day correction off; Lahore plains offsets off" (the MOS station table is
      replay only and absent; no Lahore plains offset exists to be "off")
   K3 the dead CSS rule .agn-nd84 (no markup or script makes the class) is gone
   K4 in a real browser with /api/point/forecast failing (502): the main thread stays free after the AI tab opens. The v84 AI card
      re-rendered on every resolution of AGN.nowAt.get, which hands back the same resolved null promise for 3 minutes after a failed
      call: render -> get -> then(render) span forever in microtasks (main2's five FAILs since v272: the AI answer and the situation
      report never drew; page.evaluate waited 166-360 s)
   K5 the AI answer then draws within seconds (the request is answered by a route) */
import { readFileSync, existsSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const BASE = (process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 300) : '')); };
const html = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8'), pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const patch = (html.match(/G\.AGN_BUILD\.patch='([^']+)'/) || [])[1];
ok(patch === pkg.version, 'K1 page build stamp = package version', patch + ' / ' + pkg.version);
ok(!/Lahore plains offsets off|mountain MOS daytime only/.test(html) && /temperature chain served at/.test(html), 'K2 correction record: the served chain, not the retired text');
ok(!/agn-nd84/.test(html), 'K3 dead rule .agn-nd84 removed');
const PWP = __T.playwrightUrl() || 'playwright';
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium; const exe = process.env.PW_CHROME || __T.chromiumPath();
const browser = await __T.launch(chromium, existsSync(exe) ? { executablePath: exe, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
const json = (r, status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
await page.route('**/api/point?*', (r) => json(r, 502, { ok: false, why: 'test: provider down' }));
await page.route('**/api/ai/chat', (r) => json(r, 200, { answer: 'Clean answer for the test.', sources: ['x'], operatorOnly: ['sources'], provider: 'retrieval', kind: 'explanation' }));
await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => window.AGN && AGN.nowAt && AGN.data, null, { timeout: 180000 }); await page.waitForTimeout(6000);
await page.evaluate(() => { const b = document.querySelector('#machNav button[data-goto="airisk"]'); if (b) b.click(); }); await page.waitForTimeout(4000);
const lat = []; for (let i = 0; i < 3; i++) { const t = Date.now(); await page.evaluate(() => 1); lat.push(Date.now() - t); await page.waitForTimeout(1000); }
ok(Math.max(...lat) < 2000, 'K4 the main thread answers within 2 s after the AI tab opens with the point forecast failing', lat.join(', ') + ' ms');
await page.evaluate(() => { const i = document.getElementById('nigraanLlmInput'); i.value = 'forecast for the next 7 days'; document.getElementById('nigraanLlmForm').dispatchEvent(new Event('submit', { cancelable: true })); });
await page.waitForTimeout(5000);
const ans = await page.evaluate(() => { const a = [...document.querySelectorAll('#nigraanLlmThread article.assistant')].pop(); return a ? a.innerText : ''; });
ok(/Clean answer for the test\./.test(ans), 'K5 the AI answer draws', ans.slice(0, 120));
ok(!errs.length, 'zero page errors', errs.slice(0, 3).join(' | '));
await ctx.close(); await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
