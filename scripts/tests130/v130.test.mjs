import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.130 · CEO 3 Oct: the Overview bar shows how its temperature is made: the raw global forecast at the point, each NIGRAAN step's
   change this hour and the corrected value shown. node scripts/tests130/v130.test.mjs */
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
for (const [nm, la, lo] of [['Islamabad', 33.6844, 73.0479], ['Gilgit', 35.92, 74.31], ['Karachi', 24.86, 67.01]]) {
  const j = await fetch(`${BASE}/api/point?lat=${la}&lon=${lo}`).then(r => r.json()).catch(() => null);
  const B = j && j.build;
  ok(B && Number.isFinite(B.rawC) && Number.isFinite(B.servedC), nm + ': the point engine returns the raw and the served value of this hour', JSON.stringify(B));
  if (!B) continue;
  /* v91.17.283.19: the bundle's build is the point state's: raw, the chain steps that ran (names) and their total correction */
  const sum = B.rawC + (Number.isFinite(B.totalDeltaC) ? B.totalDeltaC : (B.steps || []).reduce((a, x) => a + (x.deltaC || 0), 0));
  ok(Math.abs(sum - B.servedC) <= 0.15, nm + ': raw + the corrections = the value shown (' + B.rawC + ' ' + (B.totalDeltaC >= 0 ? '+' : '') + B.totalDeltaC + ' [' + (B.steps || []).map(x => typeof x === 'string' ? x : x.step).join(', ') + '] = ' + B.servedC + ')');
  ok(Math.abs(B.servedC - j.now.tempC) <= 0.05 && B.time === j.now.time, nm + ': the served value is the hour every screen shows', B.servedC + ' vs ' + j.now.tempC);
}
const PW = __T.playwrightSync();
const br = await __T.launch(PW.chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { const b = document.querySelector('#agnLive84 .agn-build130'); return !!b && /Raw forecast/.test(b.textContent); }, null, { timeout: 300000, polling: 2000 }).catch(() => {});   /* v283.19: the breakdown is written when the place bundle lands */
const V = await pg.evaluate(() => { const b = document.querySelector('#agnLive84 .agn-build130'); const t = (document.querySelector('#agnLive84 .t') || {}).textContent || '';
  return { t: parseFloat(t), txt: b ? b.textContent.replace(/\s+/g, ' ') : '', right: b ? b.getBoundingClientRect().right : 0, boxR: (document.getElementById('agnLive84') || { getBoundingClientRect: () => ({ right: 0 }) }).getBoundingClientRect().right }; });
ok(/Raw forecast -?\d+\.\d °C/.test(V.txt) && /Shown -?\d+\.\d °C \(corrected\)/.test(V.txt), 'the bar shows the raw forecast and the corrected value shown', V.txt);
const shown = parseFloat((V.txt.match(/Shown (-?\d+\.\d)/) || [])[1]);
ok(Math.abs(shown - V.t) <= 0.05, 'the "shown" value is the headline number', shown + ' vs ' + V.t);
ok(V.right > 0 && V.boxR - V.right < 40, 'the breakdown sits on the right of the bar (the empty space)', JSON.stringify(V));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v130: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
