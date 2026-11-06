/* v91.17.283.49 · 1.0.10 data item 6 · SAME VALUE ON EVERY PAGE. For 5 places (Islamabad I-8, Lahore Cantt, Karachi coast, Gilgit, Quetta)
   the start page (Now tab and bottom panel), the classic analyst page (left "now" panel) and Customize (place panel and overview) are opened
   at the same point; every element carrying data-shown="<key>" is read and compared with the served place answer (GET /api/point, its
   `shown` block: server/api/shownplace.mjs) and with the other pages, string for string (rounding included): now, nowLabel, measured,
   today high / low, feels, humidity, wind; the start page's hazard bars (word and state per hazard, applicability included) with the served
   hazard count of the same point, and the place summary line where air quality raises it. Any difference fails.
   The report: the report builders belong to the report change set; when a report HTML is given (REPORTS="<lat,lon>=<file>;...") its
   data-shown elements are compared the same way.
   One browser at a time (closed after each page). usage: node scripts/tests28349dat/samevalue113.test.mjs <base> [out dir]
   env FREEZE_MS: the browser clock (the server's frozen clock). Fails on 1.0.9: no shown block, no data-shown elements, start page day
   high / low in whole degrees against 1 decimal on the other pages. */
const [BASE, OUT = '/dev/shm/samevalue113'] = process.argv.slice(2); const fs = await import('node:fs'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = new URL('../..', import.meta.url).pathname; const T = await import(ROOT + 'scripts/lib/testenv.mjs'); const PW = T.playwrightSync();
const PLACES = (process.env.PLACES || '33.66443,73.08339,Islamabad I-8;31.51000,74.38000,Lahore Cantt;24.81380,67.03000,Karachi coast;35.92080,74.30890,Gilgit;30.17980,66.97500,Quetta').split(';').map((x) => { const a = x.split(','); return { lat: +a[0], lon: +a[1], name: a.slice(2).join(',') }; });
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const LAUNCH = () => T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1'] });
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
async function page(url, prep, waitSel, name) {
  const br = await LAUNCH(); const out = { errs: [], shown: {}, bars: null, ok: false };
  try { const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { window.open = () => null; });
    const pg = await ctx.newPage(); pg.on('pageerror', (e) => out.errs.push(e.message.slice(0, 160)));
    if (process.env.FREEZE_MS) { await pg.clock.install({ time: new Date(Number(process.env.FREEZE_MS)) }); await pg.clock.resume(); }
    await pg.goto(BASE + url, { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(8000);
    if (prep) await pg.evaluate(prep.fn, prep.arg).catch((e) => out.errs.push('prep: ' + e.message.slice(0, 120)));
    out.ok = await pg.waitForFunction((s) => { const e = document.querySelector(s); return e && e.textContent.trim() && !/…|Loading/.test(e.textContent) ? true : null; }, waitSel, { timeout: 150000 }).then(() => true, () => false);
    await pg.waitForTimeout(4000);
    const r = await pg.evaluate(() => { const o = {}; document.querySelectorAll('[data-shown]').forEach((e) => { if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') { if (!(e.closest('#nvPanel,#nowBox,#agnNowHero'))) return; }
        const k = e.getAttribute('data-shown'); (o[k] = o[k] || []).push(e.textContent.replace(/\s+/g, ' ').trim()); });
      const bars = [...document.querySelectorAll('#nvPanel [data-hz]')].map((b) => ({ k: b.getAttribute('data-hz'), st: b.getAttribute('data-state'), lv: b.getAttribute('data-level'), w: (b.querySelector('.bw') || b).textContent.replace(/\s+/g, ' ').trim() }));
      return { o, bars }; });
    out.shown = r.o; out.bars = r.bars; try { await pg.screenshot({ path: OUT + '/' + name.replace(/\W+/g, '_') + '.png' }); } catch (_) { /* a screenshot is evidence only */ } }
  catch (e) { out.errs.push('harness: ' + e.message.slice(0, 160)); } finally { await br.close().catch(() => null); }
  return out;
}
const first = (S, k) => (S[k] && S[k].length ? S[k][0] : null);
for (const P of PLACES) {
  const B = await (await fetch(BASE + '/api/point?lat=' + P.lat.toFixed(5) + '&lon=' + P.lon.toFixed(5) + '&parts=hazardCount&complete=1', { headers: { 'x-agn-view': 'customer' } })).json();
  const SH = B && B.shown; ok(!!(SH && SH.now && SH.today), P.name + ': the served place answer carries the shown block', SH ? '' : JSON.stringify(Object.keys(B || {})));
  if (!SH) continue;
  const EXP = { now: SH.now.value, nowLabel: SH.now.label, measured: norm((SH.measured.value != null ? SH.measured.value + ' °C · ' : '') + SH.measured.label), today: SH.today.low + '–' + SH.today.high, todayHigh: SH.today.high, todayLow: SH.today.low, feels: SH.now.feels + ' °C', rh: SH.now.rh + ' %', wind: SH.now.wind + ' km/h' };
  const pages = {
    start: await page('/', { fn: (p) => window.AGNSTART.select({ lat: p.lat, lon: p.lon, name: p.name }), arg: P }, '#nowBox [data-shown="now"]', 'start_' + P.name),
    startPanel: await page('/', { fn: (p) => window.AGNNAT.read(p.lat, p.lon), arg: P }, '#nvPanel [data-hz]', 'startpanel_' + P.name),
    analyst: await page('/analyst#agnplace=' + P.lat.toFixed(5) + ',' + P.lon.toFixed(5) + ',&agnview=overview', null, '#agnNowHero [data-shown="now"]', 'analyst_' + P.name),
    customize: await page('/customize', { fn: (p) => window.NIGRAAN3.setPoint(p.lat, p.lon, p.name), arg: P }, '[data-shown="todayHigh"]', 'customize_' + P.name) };
  /* v91.17.283.49 merge: the place answer is re-assembled when a station poll lands (its 'now' and label move with the live layer); a page
     is compared with the served answer read before the pages AND the one read after them, and passes when it equals either (a race in the
     test, not two answers at one moment) */
  const B2 = await (await fetch(BASE + '/api/point?lat=' + P.lat.toFixed(5) + '&lon=' + P.lon.toFixed(5) + '&parts=hazardCount&complete=1', { headers: { 'x-agn-view': 'customer' } })).json(); const SH2 = B2 && B2.shown;
  const EXP2 = SH2 && SH2.now ? { now: SH2.now.value, nowLabel: SH2.now.label, measured: norm((SH2.measured.value != null ? SH2.measured.value + ' °C · ' : '') + SH2.measured.label), today: SH2.today.low + '–' + SH2.today.high, todayHigh: SH2.today.high, todayLow: SH2.today.low, feels: SH2.now.feels + ' °C', rh: SH2.now.rh + ' %', wind: SH2.now.wind + ' km/h' } : {};
  for (const [pn, R] of Object.entries(pages)) {
    ok(R.ok && !R.errs.length, P.name + ' · ' + pn + ': opened at the place, no page error', R.errs.join(' | '));
    for (const [k, vals] of Object.entries(R.shown)) { if (!(k in EXP)) continue; const want = norm(EXP[k]), want2 = k in EXP2 ? norm(EXP2[k]) : want;
      const got = vals.map(norm).map((v) => (k === 'now' || k === 'todayHigh' || k === 'todayLow') ? v.replace(/\s*°C$/, '') : v);
      ok(got.every((v) => v === want) || got.every((v) => v === want2), P.name + ' · ' + pn + ' · ' + k + ' = served "' + want + '"' + (want2 !== want ? ' (or "' + want2 + '" read after the pages)' : ''), got.join(' | ')); }
  }
  /* every page shows the now value, its kind and today's range */
  ok(first(pages.start.shown, 'now') && first(pages.analyst.shown, 'now') && first(pages.customize.shown, 'now'), P.name + ': the now value is on every page');
  ok(first(pages.start.shown, 'nowLabel') && first(pages.analyst.shown, 'nowLabel') && first(pages.customize.shown, 'nowLabel'), P.name + ': the now value is labelled on every page (' + SH.now.label + ')');
  ok(first(pages.start.shown, 'measured') && first(pages.analyst.shown, 'measured') && first(pages.customize.shown, 'measured'), P.name + ': the measured line is on every page (' + SH.measured.label + ')');
  /* the start page's hazard bars = the served hazard count of the point (words, states, applicability) */
  const HC = B.parts && B.parts.hazardCount && B.parts.hazardCount.v; const d0 = HC && HC.days && HC.days[0];
  if (d0 && pages.startPanel.bars) { const sv = d0.bars.filter((b) => String(b.code) !== '-4').map((b) => b.key + '=' + (b.state === 'level' ? (b.label || ['Normal', 'Low', 'Moderate', 'High', 'Severe'][b.level]) : b.word) + '/' + b.state).sort();
    const pg = pages.startPanel.bars.map((b) => b.k + '=' + b.w.replace(/ · area$/, '') + '/' + b.st).sort();
    ok(sv.join() === [...new Set(pg)].join(), P.name + ': start page bars = served hazard count, day 0 (' + sv.length + ' hazards)', 'served ' + sv.join(',') + ' || page ' + [...new Set(pg)].join(','));
    if (d0.summary && d0.summary.air) ok((pages.startPanel.shown.summaryAir || []).some((x) => norm(x) === norm(d0.summary.air.line)), P.name + ': the start panel says the air-quality summary (' + d0.summary.air.line + ')'); }
  if (SH.summary && SH.summary.raised) { const a = first(pages.analyst.shown, 'summary'), c = first(pages.customize.shown, 'summary');
    ok(norm(a) === norm(SH.summary.headline) && norm(c) === norm(SH.summary.headline), P.name + ': the raised place summary is the same on the analyst page and Customize', a + ' | ' + c); }
}
/* reports given on the command line (the report change set's documents): the same strings */
for (const kv of (process.env.REPORTS || '').split(';').filter(Boolean)) { const [pt, file] = kv.split('='); const [la, lo] = pt.split(',').map(Number);
  const B = await (await fetch(BASE + '/api/point?lat=' + la.toFixed(5) + '&lon=' + lo.toFixed(5), { headers: { 'x-agn-view': 'customer' } })).json(); const html = fs.readFileSync(file, 'utf8');
  for (const [k, want] of [['now', B.shown.now.value], ['nowLabel', B.shown.now.label], ['todayHigh', B.shown.today.high], ['todayLow', B.shown.today.low]]) { const m = new RegExp('data-shown="' + k + '"[^>]*>([^<]*)<').exec(html);
    ok(m && norm(m[1]).replace(/\s*°C$/, '') === norm(want), 'report ' + file.split('/').pop() + ' · ' + k + ' = served "' + want + '"', m ? m[1] : 'no data-shown="' + k + '" in the report'); } }
console.log('samevalue113: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
