import * as __T from '../lib/testenv.mjs';
/* v91.17.283.12 · ONE RECORD PER PLACE, FETCHED ONCE (owner's design, 24 Oct). v91.17.283.19: the record is the place bundle
   (GET /api/point: the point state, its ONE station, the tehsil levels, the nearby places and every other part), so a selection makes
   exactly one /api/point request, no /near (the nearby list is a part) and no /api/levels/unit of the place (the levels are a part). On each page the one in-page store is the only thing that
   asks for the point state; a place selection makes exactly one /api/pointstate request (plus at most one /near for the nearby list and
   one /api/levels/unit for the issued levels), and a tab switch makes none of these. Counted from the browser's own network log.
     analyst    AGN.point.goText (the analyst's coordinate route), then the Forecast, Hazards (AI Decision), Reports and Overview tabs
     start      AGNSTART.select, then every drawer tab
     Customize  NIGRAAN3.setPoint, then every step tab
   Also: the store's run stamp (/api/pointstate/run) is the only timer read of the record (the store drops everything when it changes).
   usage: node scripts/tests28312/requests.test.mjs [http://127.0.0.1:8787] */
const BASE = __T.BASE;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 700) : '')); } };
const PLACES = [['Lahore', 31.558, 74.35071], ['Jacobabad', 28.28187, 68.43761]];
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const cls = (u) => { const p = new URL(u).pathname; return p === '/api/point' ? 'ps' : p === '/api/point/batch' ? 'batch' : (p === '/api/pointstate/near' || p === '/api/geo/near') ? 'near' : p === '/api/pointstate/run' ? 'run' : p === '/api/levels/unit' ? 'lv' : p === '/api/levels/units' ? 'lvs' : null; };   /* v283.15: 'lvs' the batched levels of Customize's site portfolio (one request for every site) */
const COUNTS = [];
async function open(path) { const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } }), pg = await ctx.newPage(); const log = []; const errs = [];
  const fly = new Set(); log.fly = fly;   /* v283.15: requests still in flight (a slow answer lands later and its consequences with it) */
  pg.on('request', (r) => { const c = cls(r.url()); if (c) { log.push({ c, u: r.url(), t: Date.now() }); fly.add(r); } }); pg.on('requestfinished', (r) => fly.delete(r)); pg.on('requestfailed', (r) => fly.delete(r)); pg.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  /* v283.15: the store's run event (agn:now with detail.run) counted from the first script on, so a run change whose re-reads land in a
     window is seen even when the stamp itself changed before the window opened */
  await pg.addInitScript(() => { window.__agnRunEv = 0; document.addEventListener('agn:now', (e) => { if (e.detail && e.detail.run) window.__agnRunEv++; }); });
  await pg.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 180000 }); return { ctx, pg, log, errs }; }
const tally = (log, from) => { const o = { ps: 0, batch: 0, near: 0, lv: 0, lvs: 0, run: 0, other: [] }; log.filter((x) => x.t >= from).forEach((x) => { o[x.c]++; }); return o; };
const show = (o) => 'place bundle ' + o.ps + ', batch ' + o.batch + ', near ' + o.near + ', levels/unit ' + o.lv + ', site levels ' + o.lvs + ', run ' + o.run;
/* v91.17.283.15 · the nearby list is read exactly once per selection where the page shows it (nearWant 1, else 0). A second /near was
   either the store's immediate retry of a failed read (now held 30 s) or the re-read after the run stamp changed inside the window (the
   mock server's run key turns every hour): a stamp change is counted as its own run, not as a second request of the selection */
/* v283.15: a record that expires inside a window is read again once, by design: the forecast is valid to the clock hour and the start page
   drops its levels when their validUntil passes (AGNSTART.fresh.invalidations). Run 3 of the first stability series crossed 20:00 PKT on the
   start page and read Lahore's record and levels twice; such a window is allowed one renewal, named in the check */
const invOf = (pg) => pg.evaluate(() => (window.AGNSTART && AGNSTART.fresh && AGNSTART.fresh.invalidations) || 0).catch(() => 0);
const hourCross = (t0) => Math.floor(t0 / 3600e3) !== Math.floor(Date.now() / 3600e3);
const runEv = (pg) => pg.evaluate(() => window.__agnRunEv || 0).catch(() => 0);
const stampOf = (pg) => pg.evaluate(() => { try { return window.AGN && AGN.pointState && AGN.pointState.run ? AGN.pointState.run().stamp : null; } catch (_) { return null; } }).catch(() => null);
/* v91.17.283.15 · item 8: every window is measured once the page is idle (no point-state, nearby, levels or run request sent for 8 s and none in flight, at most
   3 min): a single fixed wait let the start-up sweep of the 12 cities land inside the first selection's window */
async function idle(log, quietMs = 8000, maxMs = 180000) { const t0 = Date.now(); for (;;) { const last = log.length ? log[log.length - 1].t : 0; if (Date.now() - last >= quietMs && !(log.fly && log.fly.size)) return Date.now() - t0; if (Date.now() - t0 > maxMs) return -1; await new Promise((r) => setTimeout(r, 500)); } }
async function measure(page, name, select, tabs, settleMs, nearWant = 1) { const { pg, log } = page;
  for (const [nm, lat, lon] of PLACES) {
    await idle(log); const st0 = await stampOf(pg), ev0 = await runEv(pg), iv0 = await invOf(pg); const t0 = Date.now(); await select(pg, lat, lon, nm); await pg.waitForTimeout(settleMs); const st1 = await stampOf(pg), newRun = !!(st0 && st1 && st0 !== st1) || (await runEv(pg)) > ev0, renew = hourCross(t0) || (await invOf(pg)) > iv0, again = newRun || renew;
    const s = tally(log, t0), mine = log.filter((x) => x.t >= t0 && x.c === 'ps' && (() => { const u = new URL(x.u); return u.searchParams.has('id') || (Math.abs(+u.searchParams.get('lat') - lat) < 0.006 && Math.abs(+u.searchParams.get('lon') - lon) < 0.006); })()).length;
    COUNTS.push([name, nm, 'selection', show(s)]);
    ok((s.ps === 1 && mine === 1) || (again && s.ps === 2 && mine >= 1), name + ' · ' + nm + ': a place selection makes exactly 1 /api/point request' + (newRun ? ' (+1: the store re-reads the active place once when the run changes)' : renew ? ' (+1: the record expired inside the window)' : '') + ' (' + show(s) + ')', JSON.stringify(log.filter((x) => x.t >= t0 && x.c === 'ps').map((x) => x.u.replace(BASE, ''))));
    ok(s.near === nearWant + (newRun && nearWant ? 1 : 0) && s.lv <= 1 + (again ? 1 : 0), name + ' · ' + nm + ': exactly ' + nearWant + ' nearby request' + (newRun ? ' (+1: the run stamp changed inside the window)' : '') + ' and at most ' + (again ? '2 issued-levels requests (one renewal)' : '1 issued-levels request') + ' (' + s.near + ', ' + s.lv + ')', JSON.stringify(log.filter((x) => x.t >= t0 && (x.c === 'near' || x.c === 'lv')).map((x) => [x.t - t0, x.u.replace(BASE, '')])));
    await idle(log); const iv1 = await invOf(pg), ev1 = await runEv(pg); const t1 = Date.now(); for (const tb of tabs) { await tb(pg); await pg.waitForTimeout(1500); } await pg.waitForTimeout(2000);
    const w = tally(log, t1), re = hourCross(t1) || (await invOf(pg)) > iv1 || (await runEv(pg)) > ev1 ? 1 : 0; COUNTS.push([name, nm, 'tab switches (' + tabs.length + ')', show(w)]);
    ok(w.ps <= re && w.batch === 0 && w.near <= re && w.lv <= re && w.lvs <= 1, name + ' · ' + nm + ': ' + tabs.length + ' tab switches make 0 point-state / levels requests of the place' + (re ? ' (a record renewed inside the window: 1 allowed)' : '') + ', and at most 1 batched request for the site portfolio (' + show(w) + ')'); } }
/* ---- analyst ---- */
{ const P = await open('/analyst');
  await P.pg.waitForFunction(() => window.AGN && AGN.point && AGN.point.goText && AGN.pointState && AGN.engineLevels && window.map, null, { timeout: 180000 }); await P.pg.waitForTimeout(30000);
  ok(await P.pg.evaluate(() => !!(AGN.pointState.run && AGN.pointState.run().stamp)), 'analyst · the store holds the run stamp of its records', JSON.stringify(await P.pg.evaluate(() => AGN.pointState.run && AGN.pointState.run())));
  const tab = (g) => async (pg) => { await pg.click('[data-goto="' + g + '"]').catch(() => {}); };
  await measure(P, 'analyst', (pg, a, o) => pg.evaluate(([a, o]) => AGN.point.goText(a + ', ' + o, {}), [a, o]), [tab('livedata'), tab('airisk'), tab('report'), tab('overview')], 15000, 0);
  /* a new run: the store drops everything and reads the selected place once; the sections are told once */
  const R = await P.pg.evaluate(async () => { let ev = 0; document.addEventListener('agn:now', (e) => { if (e.detail && e.detail.run) ev++; });
    const S = AGN.pointState, before = S.run().stamp; const real = window.fetch; window.fetch = function (u, o) { if (String(u).indexOf('/api/pointstate/run') >= 0) return Promise.resolve(new Response(JSON.stringify({ ok: true, run: 'TEST-RUN', stamp: 'TEST-RUN|x', bundleStamp: 'TEST-RUN|x' }), { headers: { 'content-type': 'application/json' } })); return real.apply(this, arguments); };
    try { await S.checkRun(); for (let i = 0; i < 80 && !ev; i++) await new Promise((r) => setTimeout(r, 250)); await new Promise((r) => setTimeout(r, 1500)); } finally { window.fetch = real; }   /* v283.15: the event is awaited (20 s at most), then 1.5 s for a second one */
    const a = AGN.data.activePoint(); return { before, after: S.run().stamp, ev, held: !!S.peek(a.lat, a.lon) }; });
  ok(R.after === 'TEST-RUN|x' && R.ev === 1 && R.held, 'analyst · a new run stamp: the store refreshes once and every section is told once (' + JSON.stringify(R) + ')');
  ok(!P.errs.length, 'analyst · no page error', P.errs.join(' | ')); await P.ctx.close(); }
/* ---- start page ---- */
{ const P = await open('/'); await P.pg.waitForFunction(() => window.AGNSTART && AGNSTART.select && AGNSTART.goTab, null, { timeout: 120000 }); await P.pg.waitForTimeout(6000);
  const tab = (t) => async (pg) => { await pg.evaluate((t) => AGNSTART.goTab(t), t).catch(() => {}); };
  await measure(P, 'start page', (pg, a, o, n) => pg.evaluate(([a, o, n]) => AGNSTART.select({ lat: a, lon: o, name: n }), [a, o, n]), ['fc', 'hz', 'place', 'p30', 'rep', 'now'].map(tab), 10000, 0);
  ok(!P.errs.length, 'start page · no page error', P.errs.join(' | ')); await P.ctx.close(); }
/* ---- Customize ---- */
{ const P = await open('/customize'); await P.pg.waitForFunction(() => window.NIGRAAN3 && NIGRAAN3.setPoint && NIGRAAN3.go, null, { timeout: 120000 }); await P.pg.waitForTimeout(6000);
  const tab = (s) => async (pg) => { await pg.evaluate((s) => NIGRAAN3.go(s), s).catch(() => {}); };
  await measure(P, 'Customize', (pg, a, o, n) => pg.evaluate(([a, o, n]) => NIGRAAN3.setPoint(a, o, n), [a, o, n]), ['outlook', 'sites', 'lab', 'proof', 'overview'].map(tab), 10000, 0);
  ok(!P.errs.length, 'Customize · no page error', P.errs.join(' | ')); await P.ctx.close(); }
await br.close();
console.log('\nCOUNTS'); COUNTS.forEach((r) => console.log('  ' + r.join(' · ')));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
