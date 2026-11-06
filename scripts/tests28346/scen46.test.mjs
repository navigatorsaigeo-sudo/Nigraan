/* v91.17.283.46 · the scenario report's dashboard head (AGN.rep46.scen) on the server's own saved scenario results.
   usage: node scen46.test.mjs BASE  (reads build/rep46/rep46.js of this tree; a blank browser page, no analyst page needed) */
import { readFileSync } from 'node:fs';
const T = await import(new URL('../lib/testenv.mjs', import.meta.url).href); const PW = T.playwrightSync();
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const js = readFileSync(new URL('../../build/rep46/rep46.js', import.meta.url), 'utf8');
const get = async (u) => (await fetch(BASE + u, { headers: { 'x-agn-view': 'customer' } })).json();
const R = []; for (const p of ['', '&preset=gwl2', '&preset=rain10']) R.push(await get('/api/scenario?lat=33.6736&lon=73.0768' + p));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
ok(R.every((r) => r && r.ok && r.values), 'the server answered 3 scenario runs with values');
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox'] }); const pg = await (await br.newContext()).newPage();
await pg.setContent('<html><body></body></html>'); await pg.evaluate(() => { window.AGN = { rptCtx: (X, o) => Promise.resolve(o) }; });
await pg.addScriptTag({ content: js }); await pg.waitForTimeout(800);
const out = await pg.evaluate((R) => window.AGN.rep46.scen('<html><body><h1>Scenario report</h1></body></html>', R), R);
ok(/data-rk46="scenario-dashboard"/.test(out) && /<svg/.test(out), 'the downloaded scenario report starts with the dashboard (inline SVG)');
const dv = (/data-v="([^"]*)"/.exec(out) || [])[1] || '';
let same = 0, bad = 0;
R.forEach((r, j) => { const mx = {}; Object.entries(r.values).forEach(([k, v]) => { const m = /^p\d+\.([a-z_]+)\.\d+\.level$/.exec(k); if (m && Number.isFinite(v) && v >= 0) mx[m[1]] = Math.max(mx[m[1]] ?? -1, v); });
  for (const [h, v] of Object.entries(mx)) { if (dv.includes(h + '#' + j + '=' + v)) same++; else bad++; } });
ok(same > 0 && bad === 0, 'dashboard levels = the saved results (' + same + ' hazard-scenarios, ' + bad + ' differ)');
ok(out.includes('<h1>Scenario report</h1>'), 'the server-written report follows unchanged');
await br.close(); console.log('RESULT', fails ? 'FAIL' : 'PASS'); process.exit(fails ? 1 : 0);
