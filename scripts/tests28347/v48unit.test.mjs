/* v91.17.283.47 · build/mach48/v48.js on a small fixed page in a browser (no server): the place card's "Cannot occur here: ..." group of the
   card module (087 map77: <div class="agn-mps-na"><b>Cannot occur here:</b> River flood, landslide, glof</div>) becomes ONE line
   "Not relevant here: river flood, landslide, GLOF", the group and any "Cannot happen here" row are hidden, a level row stays; the coverage
   line of the value layers is read from GET /api/levels (routed here) and never says "none".
   usage: node scripts/tests28347/v48unit.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as __T from '../lib/testenv.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const pg = await (await br.newContext()).newPage();
await pg.route('**/api/levels?layer=aqi**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ready: true, kind: 'value', levels: { a: 1, b: 0, c: -1 }, coverage: { line: '2 of 3 tehsils have an air-quality value · 1 not available' } }) }));
await pg.route('**/api/levels?layer=comfort**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ready: true, levels: { a: 1, b: 2, c: -1, d: -4 } }) }));
await pg.route('http://t.local/', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="mpRightIn"><div class="agn-mps-list" role="list">'
  + '<div class="mp-r agn-mps-r"><i></i><span class="n">Heat stress</span><span class="bw">Low</span></div>'
  + '<div class="mp-r agn-mps-r"><i></i><span class="n">Cyclone wind exposure</span><span class="bw">Cannot happen here</span></div>'
  + '<div class="agn-mps-na" role="listitem"><b>Not tested here:</b> Wind and gusts</div>'
  + '<div class="agn-mps-na" role="listitem"><b>Cannot occur here:</b> River flood, landslide, glof</div></div></div></body></html>' }));
await pg.goto('http://t.local/');
await pg.addScriptTag({ content: readFileSync(join(ROOT, 'build/mach48/v48.js'), 'utf8') });
await pg.waitForTimeout(2500);
const r = await pg.evaluate(() => ({ nr: (document.getElementById('agnNr48') || {}).textContent || null,
  vis: [...document.querySelectorAll('#mpRightIn .agn-mps-r, #mpRightIn .agn-mps-na')].filter((e) => !e.hidden).map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  aqi: AGN.v48.coverage('aqi'), comfort: AGN.v48.coverage('comfort') }));
ok(r.nr === 'Not relevant here: cyclone, river flood, landslide, GLOF', 'U1 one line "Not relevant here: ..." from the row and the card group', r.nr);
ok(!r.vis.some((t) => /Cannot (happen|occur) here/.test(t)), 'U2 no "Cannot happen / occur here" row or group left visible', r.vis);
ok(r.vis.some((t) => /Heat stress/.test(t)) && r.vis.some((t) => /Not tested here/.test(t)), 'U3 level rows and the not-tested group stay', r.vis);
const r2 = await pg.evaluate(async () => { await new Promise((x) => setTimeout(x, 1500)); return { aqi: AGN.v48.coverage('aqi'), comfort: AGN.v48.coverage('comfort') }; });
ok(r2.aqi === '2 of 3 tehsils have an air-quality value · 1 not available.', 'U4 air-quality coverage line from the served answer', r2.aqi);
ok(r2.comfort && /^2 of 3 tehsils have a value/.test(r2.comfort), 'U5 comfort coverage line from the served levels (cannot-happen cells not counted)', r2.comfort);
await br.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
