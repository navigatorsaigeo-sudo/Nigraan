/* v91.17.283.46 (NIGRAAN 1.0.8.1) · defect 8: a report is a draft only when a served input of the issued place is missing or out of date.
   Three cases on the classic analyst page (customer view, I-8/3), each in a fresh browser context, then the Full report as the reader opens it:
     normal  - served forecast and levels present and current             -> issuable ok, the report carries no DRAFT / NOT FOR ISSUE mark
     nolv    - the place bundle arrives without its levels part (unavailable) -> DRAFT · DATA INCOMPLETE, reason names the hazard levels
     stale   - the browser clock is past the levels run's validUntil        -> DRAFT · DATA INCOMPLETE, reason names the out-of-date run
     nofc    - (in the normal page) the place bundle not held                -> issuable not ok, reason names the missing served forecast
   usage: FREEZE_MS=<server MOCK_FREEZE ms> node scripts/tests283461/issuable461.test.mjs BASE   (one Chromium, one context at a time) */
const T = await import(new URL('../lib/testenv.mjs', import.meta.url).href); const PW = T.playwrightSync();
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, ''); const F0 = Number(process.env.FREEZE_MS || Date.now());
const PL = { lat: 33.66860, lon: 73.07520, name: 'I-8/3' };
let fails = 0; const ok = (c, m, i) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (!c && i != null ? ' :: ' + String(i).slice(0, 400) : '')); if (!c) fails++; };
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-gpu', '--renderer-process-limit=2', '--disable-extensions'] });
async function run(mode) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  let lvAt = null;
  if (mode === 'stale') { const j = await (await fetch(BASE + '/api/point?lat=' + PL.lat + '&lon=' + PL.lon, { headers: { 'x-agn-view': 'customer' } })).json().catch(() => null);
    const L = j && j.parts && j.parts.levels; const v = L && (L.v || L); lvAt = v && v.validUntil; }
  const t0 = mode === 'stale' && lvAt ? Date.parse(lvAt) + 10 * 60e3 : F0;
  await pg.clock.install({ time: new Date(t0) }); await pg.clock.resume();
  await pg.route(/\/tiles\/|\/api\/hazardgrid|\/api\/map\/layer\b/, (r) => r.abort());
  if (mode === 'nolv') await pg.route(/\/api\/point(\?|\/complete)/, async (r) => { const res = await r.fetch(); let b = await res.text();
    try { const j = JSON.parse(b); const strip = (o) => { if (o && o.parts && o.parts.levels) o.parts.levels = { unavailable: true, why: 'test: the levels part was not served' }; };
      strip(j); if (Array.isArray(j.points)) j.points.forEach(strip); b = JSON.stringify(j); } catch (_) {}
    await r.fulfill({ response: res, body: b, headers: { ...res.headers(), 'content-length': String(Buffer.byteLength(b)) } }); });
  await pg.goto(BASE + '/analyst#agnplace=' + PL.lat.toFixed(5) + ',' + PL.lon.toFixed(5) + ',' + encodeURIComponent(PL.name), { waitUntil: 'load', timeout: 180000 });
  await pg.waitForTimeout(30000);
  const iv = await pg.evaluate(() => { const v = AGN.exports.issuable(); return { ok: v.ok, why: v.why, live: v.live, served: v.served, cls: v.cls && v.cls.key }; });
  const nofc = mode !== 'normal' ? null : await pg.evaluate(() => { const PS = AGN.pointState, pk = PS.peek; PS.peek = () => null; let v; try { v = AGN.exports.issuable(); } finally { PS.peek = pk; } return { ok: v.ok, why: v.why, served: v.served }; });
  await pg.click('#agn-tab-overview').catch(() => {}); await pg.waitForTimeout(4000);
  await pg.locator('#agnFullReport').first().click({ timeout: 8000 }).catch(() => errs.push('no Full report button'));
  const t1 = Date.now(); let txt = '';
  while (Date.now() - t1 < 150000) { txt = await pg.evaluate(() => { const r = document.querySelector('.rk-overlay .rk[data-rk46]'); return r ? r.innerText : ''; }).catch(() => ''); if (txt) break; await pg.waitForTimeout(3000); }
  const ov = txt || await pg.evaluate(() => (document.querySelector('.rk-overlay') || {}).innerText || '').catch(() => '');
  await ctx.close(); return { iv, nofc, txt, ov, errs };
}
{ const r = await run('normal');
  ok(r.iv.ok === true && r.iv.served && r.iv.served.ok === true && r.iv.served.judged === 'place', 'normal: issuable() ok on the served forecast and levels of I-8/3', JSON.stringify(r.iv));
  ok(r.iv.cls !== 'demo' && r.iv.live === true, 'normal: output class is not the design surface, live yes', JSON.stringify(r.iv));
  ok(r.nofc && r.nofc.ok === false && r.nofc.served.missing === 'forecast' && /served forecast for I-8\/3 has not arrived yet/.test(r.nofc.why || ''), 'nofc: with the place bundle not held, issuable() is not ok and names the missing served forecast', JSON.stringify(r.nofc));
  ok(!!r.txt, 'normal: the Full report was built', r.ov.slice(0, 300) + ' ' + r.errs.join(' | '));
  ok(r.txt && !/DRAFT|NOT FOR ISSUE|DATA INCOMPLETE/.test(r.txt), 'normal: the report carries no DRAFT / NOT FOR ISSUE mark', [...r.txt.matchAll(/(DRAFT|NOT FOR ISSUE)[^\n]{0,400}/g)].map((m) => m[0]).join(' || ')); }
if (process.env.ONLY !== 'normal') { const r = await run('nolv');
  ok(r.iv.ok === false && r.iv.served && r.iv.served.missing === 'levels' && /hazard levels for I-8\/3 have not been served/.test(r.iv.why || ''), 'nolv: issuable() not ok, reason names the missing hazard levels', JSON.stringify(r.iv));
  const t = r.txt || r.ov;
  ok(/DRAFT · DATA INCOMPLETE/.test(t) && /hazard levels for I-8\/3 have not been served/.test(t), 'nolv: the report is watermarked DRAFT · DATA INCOMPLETE with the reason', (t.match(/.{0,60}DRAFT.{0,300}/) || [t.slice(0, 300)])[0]); }
if (process.env.ONLY !== 'normal') { const r = await run('stale');
  ok(r.iv.ok === false && r.iv.served && !!r.iv.served.stale && /(hazard-level run|served forecast) for I-8\/3 .*out of date/.test(r.iv.why || ''), 'stale: issuable() not ok past the levels validUntil, reason names the out-of-date input (levels run, or the forecast when it is older than 3 h at that clock)', JSON.stringify(r.iv));
  const t = r.txt || r.ov;
  ok(/DRAFT · DATA INCOMPLETE/.test(t) && /is out of date/.test(t), 'stale: the report is watermarked DRAFT · DATA INCOMPLETE with the reason', (t.match(/.{0,60}DRAFT.{0,300}/) || [t.slice(0, 300)])[0]); }
await br.close(); console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
