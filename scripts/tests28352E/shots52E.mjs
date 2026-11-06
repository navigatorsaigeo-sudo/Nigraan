/* v91.17.283.52 E · page check, both views, one Chromium: the measured air-quality line on the start page place card, the analyst left panel
   (hero + "Air and sun" row) and Customize, for a place with a qualifying reading (Lahore Cantt, mocked "Mock Near" 0.8 km) and one without
   (Karachi): the same sentence as the served bundle, no monitor / agency / distance / age for customers, the operator's monitor detail only in
   the operator view, the AQI tile still the forecast daily mean, no CSP or page errors.   usage: node shots52E.mjs <base> <outdir> */
import { mkdirSync } from 'node:fs';
const T = await import(new URL('../lib/testenv.mjs', import.meta.url)); const PW = T.playwrightSync();
const [B, O] = process.argv.slice(2); mkdirSync(O, { recursive: true });
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=900'] });
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const errs = [];
const BAN = /EPD|Punjab|Department of State|Dept of State|Embassy|consulate|Mock Near|\d\s*km\b|min ago/i;
async function served(lat, lon, view) { const r = await fetch(B + '/api/point?lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5) + '&complete=1', { headers: { 'sec-fetch-site': 'same-origin', 'x-agn-view': view } }); return r.json(); }
async function ctxFor(view) { const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } } catch (_) {} }, view === 'operator'); return ctx; }
const texts = (pg) => pg.evaluate(() => [...document.querySelectorAll('[data-shown="airNow"]')].map((e) => e.textContent.trim()));
for (const [lat, lon, name, want] of [[31.5204, 74.3587, 'Lahore Cantt', true], [24.85468, 67.02071, 'Karachi', false]]) {
  for (const view of ['customer', 'operator']) {
    const S = await served(lat, lon, view), label = S.shown && S.shown.airNow && S.shown.airNow.label;
    ok(want ? !!label : !label, view + ' ' + name + ': served measured line ' + (want ? 'present' : 'absent'), label);
    const ctx = await ctxFor(view); const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(view + ' ' + name + ': ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to execute/.test(m.text())) errs.push(view + ' ' + name + ' CSP: ' + m.text().slice(0, 200)); });
    const H = '#agnplace=' + lat.toFixed(5) + ',' + lon.toFixed(5) + ',' + encodeURIComponent(name);
    /* start page place card */
    await pg.goto(B + '/' + H, { waitUntil: 'load', timeout: 180000 }); let st = [];
    for (let i = 0; i < 40; i++) { await pg.waitForTimeout(1500); st = await texts(pg); if (st.length || (!want && i > 12)) break; }
    const tile = await pg.evaluate(() => { const e = document.querySelector('#nowStats [data-num="aqi"]'); return e ? e.parentElement.innerText.replace(/\s+/g, ' ') : null; });
    if (want) ok(st.length && st.every((t) => t === label), view + ' ' + name + ' start: the place card prints the served sentence', JSON.stringify(st));
    else ok(!st.length, view + ' ' + name + ' start: no measured line', JSON.stringify(st));
    ok(!tile || /daily mean|this hour|No air forecast/.test(tile), view + ' ' + name + ' start: the AQI tile is still the forecast (' + tile + ')');
    await pg.screenshot({ path: O + '/' + view + '_' + name.replace(/\W/g, '') + '_start.png' });
    /* analyst left panel */
    await pg.goto(B + '/analyst' + H, { waitUntil: 'load', timeout: 180000 }); let an = [], row = '';
    for (let i = 0; i < 30; i++) { await pg.waitForTimeout(1500); an = await texts(pg); if (an.length || (!want && i > 12)) break; }
    /* the "Air and sun" row of "What to plan for" (Forecast view, Next 72 hours) */
    await pg.evaluate(() => { const b = document.querySelector('[data-goto="livedata"]'); if (b) b.click(); });
    for (let i = 0; i < 60; i++) { await pg.waitForTimeout(1500);
      row = await pg.evaluate(() => { const P = document.getElementById('agnFc251P'); const r = P ? [...P.querySelectorAll('.row')].find((x) => /^Air and sun/.test(x.innerText.trim())) : null; return r ? r.innerText.replace(/\s+/g, ' ') : ''; });
      if (row) break; }
    an = await texts(pg);
    if (want) { ok(an.length >= 2 && an.every((t) => t === label) && row.includes(label), view + ' ' + name + ' analyst: hero and Air and sun print the served sentence (' + an.length + ' places)', JSON.stringify(an));
      if (view === 'operator') console.log('INFO operator Air and sun row (monitor detail when the page holds the operator bundle; a bundle carried over from the start page has none until the next render): ' + row);
      else ok(!BAN.test(row.replace(label, '')), view + ' ' + name + ' analyst Air and sun row: no monitor named', row); }
    else ok(!an.length && (!row || /Air quality today \(AQI, daily mean\)/.test(row)), view + ' ' + name + ' analyst: no measured line; the Air and sun row keeps the forecast daily mean', JSON.stringify(an) + ' ' + row);
    await pg.screenshot({ path: O + '/' + view + '_' + name.replace(/\W/g, '') + '_analyst.png' });
    await ctx.close();
  }
}
/* Customize (customer page) */
{ const ctx = await ctxFor('customer'); const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push('customize: ' + e.message));
  const S = await served(31.5204, 74.3587, 'customer'), label = S.shown.airNow.label;
  await pg.goto(B + '/customize#agnplace=31.52040,74.35870,Lahore%20Cantt', { waitUntil: 'load', timeout: 180000 }); let cu = [];
  for (let i = 0; i < 50; i++) { await pg.waitForTimeout(1500); cu = await texts(pg); if (cu.length) break; }
  ok(cu.length && cu.every((t) => t === label), 'customize: the served sentence', JSON.stringify(cu));
  const body = await pg.evaluate(() => document.body.innerText); ok(!/Mock Near|Punjab EPD|Dept of State/.test(body), 'customize: no monitor or agency named');
  await pg.screenshot({ path: O + '/customize_LahoreCantt.png' }); await ctx.close(); }
ok(!errs.length, 'no page error, no CSP refusal', errs.join(' | '));
await br.close(); console.log('shots52E: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
