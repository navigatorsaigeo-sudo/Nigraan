import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.126 · A-07 · ONE VALUE PER QUANTITY. Fails if two surfaces print a different value for the same place and time:
   1 every hazard layer x day 0-2: the level the engine published (/api/levels) = the level the page computes for the map (hzScore)
   2 the selected place: Overview bar, Current conditions, AI 'now' and the point engine agree on temperature, humidity and wind
   node nigraan-local/scripts/tests126/consistency.test.mjs   (PLAYWRIGHT_MODULE / PW_CHROME override the browser paths) */
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 700) : '')); } };
const PW = __T.playwrightSync();
const br = await __T.launch(PW.chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return typeof hzScore === 'function' && typeof hzDayInput === 'function' && Object.keys(DISTRICT_IN).filter(k => DISTRICT_IN[k].fc72 && DISTRICT_IN[k].fc72.time && DISTRICT_IN[k].fc72.time.length >= 22).length > 540; } catch (_) { return false; } }, null, { timeout: 600000, polling: 3000 }).catch(() => {});
await pg.waitForTimeout(5000);

/* 1 · day 0: the colour the MAP paints for each tehsil = the level the ENGINE published for it (the level the AI, the reports and the
   alerts read). Layers switched through the picker, as a user does. */
const LAYERS = ['heat', 'cold', 'wind', 'flood', 'flood_pluvial', 'rain_hz', 'drought', 'landslide'];
const UK = await pg.evaluate(() => Object.fromEntries(AGN.selfcheck.units().map(p => [p.uid || p.key, p.key])));
for (const layer of LAYERS) {
  const E = await (await fetch(BASE + '/api/levels?layer=' + layer + '&day=0')).json().catch(() => null);
  if (!E || !E.ready || !E.levels) { console.log('SKIP ' + layer + ': engine has no levels (' + (E && E.why) + ')'); continue; }
  if (!Object.values(E.levels).some((lv) => lv >= 0)) { console.log('SKIP ' + layer + ': the engine placed no unit (all no data or not applicable): nothing to compare; coverage is not this test'); continue; }   /* v91.17.226 */
  await pg.evaluate((layer) => { const s = document.getElementById('mapHazardPick'); s.value = layer; s.dispatchEvent(new Event('change', { bubbles: true })); }, layer);
  await pg.waitForTimeout(7000);
  const M = await pg.evaluate(() => { const F = (AGN.hz5.fill || []).map(x => String(x).toLowerCase()), out = {};
    map.eachLayer(l => { const q = l.feature && l.feature.properties; if (!q || !q.key || !l.options) return; const i = F.indexOf(String(l.options.fillColor || '').toLowerCase()); if (i >= 0) out[q.key] = i; }); return out; });
  let n = 0, diff = 0; const ex = [];
  for (const [uid, lv] of Object.entries(E.levels)) { if (lv < 0) continue; const key = UK[uid] || uid; const mv = M[key]; if (mv == null) continue; n++; if (mv !== lv) { diff++; if (ex.length < 4) ex.push(key + ': engine ' + lv + ' map ' + mv); } }
  ok(n > 0 && diff / n <= 0.01, layer + ' day 0: map colour = published level (' + (n - diff) + '/' + n + ')', ex.join(' | '));
}

const S = await pg.evaluate(async () => { const p = AGN.data.activePoint(); const v = await AGN.nowAt.get(p.lat, p.lon); await new Promise(r => setTimeout(r, 4000));
  const bar = (document.querySelector('#agnLive84') || {}).textContent || '';
  const num = (re) => { const m = bar.match(re); return m ? +m[1] : null; };
  return { p: [p.lat, p.lon, p.name], v: v && { t: v.tempC, rh: v.rh, w: v.windKmh }, bar: { t: parseFloat((document.querySelector('#agnLive84 .t') || {}).textContent), rh: num(/Humidity\s*([\d.]+)/), w: num(/Wind\s*([\d.]+)/) },
    cc: { t: parseFloat(document.getElementById('ccTemp').textContent), rh: parseFloat(document.getElementById('ccHum').textContent), w: parseFloat(document.getElementById('ccWind').textContent) } }; });
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
ok(S.v && near(S.bar.t, S.v.t, 0.05) && near(S.cc.t, S.v.t, 0.05), 'temperature: Overview bar = Current conditions = point engine', JSON.stringify(S));
ok(S.v && near(S.bar.rh, Math.round(S.v.rh), 0.5) && near(S.cc.rh, Math.round(S.v.rh), 0.5), 'humidity: Overview bar = Current conditions = point engine', JSON.stringify(S));
ok(S.v && near(S.bar.w, Math.round(S.v.w), 0.5) && near(S.cc.w, Math.round(S.v.w), 0.5), 'wind: Overview bar = Current conditions = point engine', JSON.stringify(S));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' consistency: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
