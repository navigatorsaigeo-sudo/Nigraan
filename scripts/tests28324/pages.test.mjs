import * as __T from '../lib/testenv.mjs';
/* v91.17.283.24 · PAGES LANE against a running server (argv[2]): the three pages load and take a place with no JavaScript error, and a
   place is ONE request (owner rule: one server, one call per place; every section reads the page's one store).
     M1-M4  analyst console: no page error on load or after selecting a place; selecting a place makes exactly one GET /api/point (and at
            most one completion read of the same bundle); in the browser the hazard engine refuses (hzScore "Not assessed"), the map's
            tehsil level and the AI context are served values (served:true), a site's own level is "Not assessed" with the reason, the run
            chip never says "page estimate"; the point intake (W7) no longer stops on an undefined name
     M5     with a current issued run (the stale test run made current in the browser): the map, the tehsil level and the AI context
            show the issued level and the run chip names the issued run
     S1     start page: no page error; selecting a place makes exactly one GET /api/point (at most one completion read)
     N1-N3  Customize NIGRAAN: no page error; a place is one GET /api/point; the city labels come from the server's place table; a saved
            start point outside Pakistan (26.98783, 49.65707) is not restored as the start view and the page says why; a point outside
            picked by link says plainly it is outside the NIGRAAN area (never "Not available right now ... no answer")
   usage: node scripts/tests28324/pages.test.mjs [http://127.0.0.1:8787] */
const BASE = __T.BASE;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const path = (u) => u.replace(BASE, '');
const placeReq = (a) => a.filter((u) => /^\/api\/point\?/.test(u) && !/[?&]complete=1/.test(u));
const doneReq = (a) => a.filter((u) => /^\/api\/point\?.*[?&]complete=1/.test(u));
async function open(url, init) {
  const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } }); if (init) await ctx.addInitScript(init);
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  const log = []; ctx.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE)) log.push({ u: path(u), t: Date.now() }); });
  await pg.goto(BASE + url, { waitUntil: 'load', timeout: 180000 });
  return { ctx, pg, errs, log };
}
/* wait until the page has made no request for 6 s (at most ms) */
async function idle(o, ms) { const t0 = Date.now(); for (;;) { const last = o.log.length ? o.log[o.log.length - 1].t : 0; if (Date.now() - last >= 6000 && Date.now() - t0 >= 8000) return; if (Date.now() - t0 > ms) return; await o.pg.waitForTimeout(500); } }

/* ---- the analyst console ---- */
{ const o = await open('/analyst');
  await o.pg.waitForFunction(() => { try { return !!(AGN.point && AGN.engineLevels && AGN.v283 && document.getElementById('agnPtInput')); } catch (_) { return false; } }, null, { timeout: 300000, polling: 1000 });
  await idle(o, 90000); const e0 = o.errs.length;
  ok(e0 === 0, 'M1 analyst: no page error on load', o.errs.join(' | '));
  const t0 = Date.now(); await o.pg.evaluate(() => AGN.point.goText('31.52040, 74.35870', { quiet: true, label: 'Test place' }));
  await o.pg.waitForTimeout(4000); await idle(o, 60000);
  const sel = o.log.filter((x) => x.t >= t0).map((x) => x.u);
  ok(placeReq(sel).length === 1 && doneReq(sel).length <= 1, 'M2 analyst: selecting a place makes exactly ONE GET /api/point (' + placeReq(sel).concat(doneReq(sel)).join(', ') + ')', sel.filter((u) => /^\/api\//.test(u)).join(', '));
  const I = await o.pg.evaluate(async () => { const S0 = await AGN.siteScore.get(31.52, 74.36); const k = (window.PK_DISTRICTS.features.find((f) => f.properties && f.properties.key && f.properties.province !== IIOJK) || {}).properties.key;
    const h = hzScore(k, { t: 45, hum: 20, wind: 5, weatherLive: true, fcSource: 'x' }, 'heat', 24, k), d = districtHazardInfo(k), a = aiDistrictRisk(null, 'heat', 24, k), s = S0;
    const chip = (document.getElementById('v283RunChip') || {}).textContent || '';
    let w7 = null; try { AGN.intake.get('spatial').add({ name: 'Test point', latitude: '24.8570', longitude: '67.0060' }); w7 = 'ok'; } catch (e) { w7 = String(e && e.message || e); }
    return { k, h: { ref: !!h.pageRefusal, score: h.score, why: h.noDataWhy }, d: { served: d && d.served, score: d && d.score }, a: { served: a && a.served, score: a.score, lv: a.level, why: a.noDataWhy }, s, chip, w7 }; });
  ok(I.h.ref && I.h.score === null && /not assessed/i.test(I.h.why || ''), 'M3 analyst: the browser computes no hazard level (hzScore refuses: "' + I.h.why + '")');
  ok(I.d.served === true && I.d.score === null && I.a.served === true && I.a.score === null && (I.a.lv != null || /\S/.test(I.a.why || '')), 'M3 analyst: the map\'s tehsil level and the AI context are served (' + (I.a.lv != null ? 'level ' + I.a.lv : 'not assessed: ' + I.a.why) + ')', JSON.stringify(I));
  ok(I.s && ((I.s.ok === true && I.s.server === true && Array.isArray(I.s.hz)) || (I.s.ok === false && /\S/.test(I.s.why || ''))) && !/page estimate/i.test(I.chip), 'M3 (v283.29 W2) analyst: a site\'s own level is the server\'s siteLevels (or its reason); the run chip names no page estimate ("' + I.chip + '")', JSON.stringify(I.s).slice(0, 300));
  ok(!/PK_BOX/.test(String(I.w7)), 'M4 analyst: the point intake no longer stops on an undefined name (' + String(I.w7).slice(0, 80) + ')');
  for (const g of ['overview', 'livedata', 'airisk', 'assessments', 'operations']) { await o.pg.click('#machNav [data-goto="' + g + '"]').catch(() => {}); await o.pg.waitForTimeout(2500); }
  ok(o.errs.length === 0, 'M1 analyst: no page error after selecting a place and opening the main tabs', o.errs.join(' | '));
  await o.ctx.close(); }

/* ---- M5 · a CURRENT issued run (the test server's run is stale, so its answer is made current here): the map, a tehsil's level, a pin
   and the AI context all show the issued level (heat High everywhere), never a page score ---- */
{ const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await pg.route(/\/api\/levels\?layer=heat&day=0$/, async (route) => { const r = await route.fetch(); const j = await r.json(); const L = {}; Object.keys(j.levels || {}).forEach((u) => { L[u] = 3; });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({}, j, { stale: false, at: new Date().toISOString(), validUntil: new Date(Date.now() + 2 * 3600e3).toISOString(), levels: L })) }); });
  await pg.goto(BASE + '/analyst', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => { try { return !!(AGN.v283 && AGN.v283.issuedFor && AGN.hz5 && typeof districtLayer !== 'undefined'); } catch (_) { return false; } }, null, { timeout: 300000, polling: 1000 });
  await pg.evaluate(() => { const el = document.getElementById('mapHazardPick'); if (el) { el.value = 'heat'; el.dispatchEvent(new Event('change', { bubbles: true })); } });
  await pg.waitForFunction(() => { try { const k = PK_DISTRICTS.features.find((f) => f.properties && f.properties.key && f.properties.province !== IIOJK).properties.key; return districtHazardInfo(k).level === 3; } catch (_) { return false; } }, null, { timeout: 120000, polling: 1000 }).catch(() => {});
  await pg.waitForTimeout(3000);
  const R = await pg.evaluate(() => { const F = PK_DISTRICTS.features.filter((f) => f.properties && f.properties.key && f.properties.province !== IIOJK); const k = F[F.length - 1].properties.key;
    const H = (AGN.hz5.fill || []).map((c) => String(c).toLowerCase()); let high = 0; districtLayer.eachLayer((l) => { if (String((l.options || {}).fillColor || '').toLowerCase() === H[3]) high++; });
    const a = aiDistrictRisk(null, 'heat', 24, k), d = districtHazardInfo(k), chip = (document.getElementById('v283RunChip') || {}).textContent || '';
    return { k, high, n: F.length, d: { served: d.served, level: d.level, score: d.score }, a: { level: a.level, cat: a.category, score: a.score }, chip }; });
  ok(R.d.served && R.d.level === 3 && R.d.score === null && R.high > 500, 'M5 analyst, current run: the map and the tehsil level are the issued run (' + R.high + ' of ' + R.n + ' tehsils High, as issued; ' + R.k + ' level 3, no score)', JSON.stringify(R));
  ok(R.a.level === 3 && R.a.cat === 'High' && R.a.score === null && /issued run/.test(R.chip), 'M5 analyst, current run: the AI context reads the same issued level (' + R.a.cat + '); the run chip names the issued run ("' + R.chip + '")', JSON.stringify(R));
  ok(errs.length === 0, 'M5 analyst: no page error', errs.join(' | '));
  await ctx.close(); }

/* ---- the start page ---- */
{ const o = await open('/'); await idle(o, 60000);
  await o.pg.click('#q'); await o.pg.keyboard.type('Lahore', { delay: 30 }); await o.pg.waitForSelector('#sr button[data-ac="0"]', { timeout: 30000 }); await o.pg.waitForTimeout(600);
  const t0 = Date.now(); await o.pg.click('#sr button[data-ac="0"]'); await o.pg.waitForTimeout(4000); await idle(o, 60000);
  const sel = o.log.filter((x) => x.t >= t0).map((x) => x.u);
  ok(placeReq(sel).length === 1 && doneReq(sel).length <= 1, 'S1 start: selecting a place makes exactly ONE GET /api/point (' + placeReq(sel).concat(doneReq(sel)).join(', ') + ')', sel.join(', '));
  ok(o.errs.length === 0, 'S1 start: no page error on load or after selecting a place', o.errs.join(' | '));
  await o.ctx.close(); }

/* ---- Customize NIGRAAN ---- */
{ const o = await open('/customize'); await idle(o, 60000);
  const t0 = Date.now(); await o.pg.evaluate(() => { location.hash = 'agnplace=31.52040,74.35870,Lahore'; }); await o.pg.waitForTimeout(4000); await idle(o, 60000);
  const sel = o.log.filter((x) => x.t >= t0).map((x) => x.u);
  const st = await o.pg.evaluate(() => ({ place: (document.getElementById('place') || {}).textContent, cities: [...document.querySelectorAll('.city span')].map((x) => x.textContent) }));
  ok(placeReq(sel).length === 1 && doneReq(sel).length <= 1, 'N1 customize: a place is exactly ONE GET /api/point (' + placeReq(sel).concat(doneReq(sel)).join(', ') + ')', sel.join(', '));
  ok(st.cities.length > 0 && st.cities.every((c) => /^[\x20-\x7e]+$/.test(c)), 'N1 customize: the city labels come from the server\'s place table (' + st.cities.slice(0, 6).join(', ') + ')');
  await o.pg.evaluate(() => { location.hash = 'agnplace=26.98783,49.65707'; }); await o.pg.waitForTimeout(4000); await idle(o, 60000);
  const out = await o.pg.evaluate(() => ({ bar: (document.getElementById('failbar') || {}).textContent || '', body: document.body.innerText }));
  ok(/Outside the NIGRAAN area/.test(out.bar) && /outside Pakistan/i.test(out.bar) && !/Not available right now/.test(out.bar), 'N3 customize: a point outside picked by link says it is outside the NIGRAAN area ("' + out.bar.slice(0, 140) + '")', out.bar);
  ok(o.errs.length === 0, 'N1 customize: no page error', o.errs.join(' | '));
  await o.ctx.close(); }
{ const o = await open('/customize', () => { try { localStorage.setItem('agn.switchPlace', JSON.stringify({ lat: 26.98783, lon: 49.65707, name: null, t: Date.now() })); } catch (_) {} });
  await idle(o, 90000); await o.pg.waitForTimeout(3000);
  const st = await o.pg.evaluate(() => ({ place: (document.getElementById('place') || {}).textContent || '', bar: (document.getElementById('failbar') || {}).textContent || '' }));
  ok(!/26\.98|49\.65/.test(st.place) && /outside the NIGRAAN area/.test(st.bar) && /opened on/.test(st.bar) && !/Not available right now/.test(st.bar), 'N2 customize: a saved start point outside Pakistan is not restored as the start view ("' + st.place + '"; "' + st.bar.slice(0, 160) + '")', JSON.stringify(st));
  ok(o.errs.length === 0, 'N2 customize: no page error', o.errs.join(' | '));
  await o.ctx.close(); }
await br.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
