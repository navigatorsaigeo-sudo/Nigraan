import * as __T from '../lib/testenv.mjs';
/* v91.17.283.20 · THE PAGES READ ONE STORE AND NEVER SHOW A WRONG FIRST STATE (owner, 25 Oct 2026: the live check of 283.19). Chromium,
   against a running server (argv[2]), at 1366x768 and 1920x1080:
     S1  start page: one place request (GET /api/point) and at most one completion read of the same place (&complete=1) when the first
         answer listed parts still being computed; no other place request; first paint time measured
     S2  start page: the hazard levels of day 0 are ONE request (/api/levels?layers=...), asked once per page load
     S3  start page: the shared place search (window.AGNPlaceSearch) gives the suggestions
     A1  analyst after the hand-off: 0 place requests (the handed-over bundle) and at most 1 completion read
     A2  the provenance banner never says "Synthetic": every animation frame of the first 12 s
     A3  the left card shows the place and its temperature from the first painted frame (the bundle in the store), never "Loading"
     A4  switching every main tab a second time makes 0 data requests (v283.36 item 9: a tab loads when first opened); no /px/v1/forecast from either page
     A5  one place label and one "now" on the start card, the header, the Overview bar and the left card
     A6  CLS < 0.1 from the hand-off
     A7  the Overview top bar search is the shared control: typing gives suggestions; "My location" uses the one implementation
     A8  the heat legend is the register's (/api/registry/levels), read once
   usage: node scripts/tests28320/pages.test.mjs [http://127.0.0.1:8787] [place query, default F-10] */
const BASE = __T.BASE, Q = process.argv[3] || 'F-10';
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const PLACE = /^\/(api\/(point\?|pointstate(\?|\/(batch|near|product)\?)|levels\/unit\?|geo\/(reverse|near|resolve|place)\?|report\/(context|past30)\?|outlook\/(unit|seasonal)\?|smog\/unit\?|flood\/point\?|pool\/(point|rank|hazard)\?|fleet\/nearest\?|mos\/point\?|state\/point\?|site\/(risk|screening)\?|place\/facts\?|glof\/upstream\?|flood\/riverlink\?|climatology\/baseline\?|ai\/local\?|hyperlocal\/(point|area)\?)|px\/v1\/forecast)/;
const isPlace = (p) => PLACE.test(p) || /^\/api\/rain\/chance\?.*lat=/.test(p);
const isComplete = (p) => /^\/api\/point\?.*[?&]complete=1/.test(p);
const TELE = /^\/api\/(shown|selfcheck)\/report/;
const path = (u) => u.replace(BASE, '');
const num = (s) => { const m = /-?\d+(\.\d+)?/.exec(String(s == null ? '' : s).replace('−', '-')); return m ? +m[0] : null; };
const INIT = () => {
  window.__ls = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls.push(e.value); }).observe({ type: 'layout-shift', buffered: true }); } catch (_) {}
  if (!/analyst/i.test(location.pathname)) return;
  window.__fr = []; const t0 = performance.now();
  const tick = () => { const L = document.getElementById('mpLeftIn'), B = document.getElementById('agnProvSrc'), S = document.querySelector('.agn-prov,#agnProv');
    window.__fr.push({ t: performance.now(), left: L ? (L.innerText || '').slice(0, 200) : null, banner: B ? B.textContent : null, bannerAll: S ? S.textContent : null });
    if (performance.now() - t0 < 12000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
const tally = (a) => { const m = {}; a.forEach((x) => { const k = x.split('?')[0] + (isComplete(x) ? '&complete=1' : ''); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + ' ' + k).join(', '); };
const COUNTS = [];
for (const [W, H] of [[1366, 768], [1920, 1080]]) {
  const tag = W + 'x' + H;
  const ctx = await br.newContext({ viewport: { width: W, height: H } }); await ctx.addInitScript(INIT); const pg = await ctx.newPage();
  const log = []; ctx.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE) && /^\/(api|px)\//.test(path(u))) log.push({ u: path(u), t: Date.now() }); });
  const failed = new Set(); ctx.on('response', async (r) => { const u = r.url(); if (!u.startsWith(BASE)) return; const p = path(u); if (!/^\/(api|px)\//.test(p)) return;
    if (r.status() >= 400) { failed.add(p); return; } try { const j = await r.json(); if (j && (j.ok === false || j.ready === false)) failed.add(p); } catch (_) {} });
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await pg.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(12000);
  const load = log.map((x) => x.u);
  const lv = load.filter((u) => /^\/api\/levels\?/.test(u));
  ok(lv.length === 1 && /layers=/.test(lv[0]), 'S2 ' + tag + ': the start page asks the day-0 hazard levels in ONE request (' + lv.join(', ') + ')', JSON.stringify(lv));
  const shared = await pg.evaluate(() => !!(window.AGNPlaceSearch && AGNPlaceSearch.attach));
  await pg.click('#q'); await pg.keyboard.type(Q, { delay: 30 }); const sug = await pg.waitForSelector('#sr button[data-ac="0"]', { timeout: 30000 }).then(() => true).catch(() => false); await pg.waitForTimeout(500);
  ok(shared && sug, 'S3 ' + tag + ': the start page search is the shared control (window.AGNPlaceSearch) and gives suggestions');
  const tSel = Date.now(); await pg.click('#sr button[data-ac="0"]');
  await pg.waitForFunction(() => { const e = document.getElementById('nowT'); return e && /\d/.test(e.textContent); }, null, { timeout: 60000 }).catch(() => {});
  const fp = Date.now() - tSel; await pg.waitForTimeout(10000);
  const sel = log.filter((x) => x.t >= tSel && !/^\/api\/geo\/search/.test(x.u)).map((x) => x.u);
  const sp = sel.filter(isPlace), spFirst = sp.filter((u) => !isComplete(u)), spDone = sp.filter(isComplete);
  ok(spFirst.length === 1 && /^\/api\/point\?/.test(spFirst[0]) && spDone.length <= 1 && (!spDone.length || spDone[0].split('&complete')[0] === spFirst[0]), 'S1 ' + tag + ': the selection makes 1 place request and ' + spDone.length + ' completion read of the same place; first paint ' + fp + ' ms (' + sp.join(', ') + ')', JSON.stringify(sp));
  const st = await pg.evaluate(() => ({ name: (document.getElementById('cName') || {}).textContent, now: (document.getElementById('nowT') || {}).textContent }));
  const tHand = Date.now();
  await Promise.all([pg.waitForURL(/analyst/, { timeout: 60000 }), pg.evaluate(() => document.getElementById('btnAnalyst').click())]);
  await pg.evaluate(() => { window.__runEv = 0; document.addEventListener('agn:levels-run', (e) => { if (e && e.detail && !e.detail.first) window.__runEv++; }); document.addEventListener('agn:now', (e) => { if (e && e.detail && e.detail.run) window.__runEv++; }); });
  await pg.waitForTimeout(18000);
  const an = log.filter((x) => x.t >= tHand).map((x) => x.u);
  const ap = an.filter(isPlace), apFirst = ap.filter((u) => !isComplete(u)), apDone = ap.filter(isComplete);
  ok(apFirst.length === 0 && apDone.length <= 1, 'A1 ' + tag + ': the analyst makes 0 place requests and ' + apDone.length + ' completion read (' + (ap.join(', ') || 'none') + ')', JSON.stringify(ap));
  const F = await pg.evaluate(() => ({ fr: window.__fr || [], fcp: ((performance.getEntriesByName('first-contentful-paint')[0]) || {}).startTime || null }));
  const syn = F.fr.filter((f) => /synthetic/i.test((f.banner || '') + ' ' + (f.bannerAll || '')));
  ok(F.fr.length > 20 && !syn.length, 'A2 ' + tag + ': the banner never says "Synthetic" (' + F.fr.length + ' frames checked; first banner "' + ((F.fr.find((f) => f.banner) || {}).banner || '') + '")', JSON.stringify(syn.slice(0, 2)));
  const nm = (st.name || '').trim();
  const firstLeft = F.fr.find((f) => f.left != null && f.left.trim() && (F.fcp == null || f.t >= F.fcp - 1));
  const loading = F.fr.filter((f) => f.left && /loading/i.test(f.left));
  ok(!!(firstLeft && nm && firstLeft.left.indexOf(nm) === 0 && /°C/.test(firstLeft.left)) && !loading.length, 'A3 ' + tag + ': the left card shows "' + nm + '" and its temperature from the first painted frame (FCP ' + Math.round(F.fcp || 0) + ' ms, frame ' + Math.round(firstLeft ? firstLeft.t : -1) + ' ms)', JSON.stringify({ firstLeft, loading: loading.slice(0, 1) }));
  const A = await pg.evaluate(() => { const t = (s) => { const e = [...document.querySelectorAll(s)].find((x) => x.offsetParent !== null); return e ? e.textContent.trim().replace(/\s+/g, ' ') : null; };
    const left = document.getElementById('mpLeftIn'); const lt = left ? left.innerText : ''; const m = /(-?\d+(?:\.\d)?)\s*°C/.exec(lt);
    return { city: t('#cityLabel'), bar: t('#agnLive84 .agn-place span'), barV: t('#agnLive84 .t .v'), left: left ? (lt.split('\n')[0] || '').trim() : null, leftV: m ? m[1] : null, cls: (window.__ls || []).reduce((a, v) => a + v, 0),
      legend: !!(window.AGN && AGN.levelLegends && AGN.levelLegends.legends && /UTCI under \d+/.test(AGN.levelLegends.legends.heat[0])) }; });
  ok(nm && A.city === nm && A.bar === nm && A.left === nm, 'A5 ' + tag + ': one place label: start card, header, bar and left card "' + nm + '" (' + JSON.stringify([A.city, A.bar, A.left]) + ')');
  ok(num(st.now) != null && num(st.now) === num(A.barV) && num(A.barV) === num(A.leftV), 'A5 ' + tag + ': one now: start card ' + num(st.now) + ', bar ' + num(A.barV) + ', left card ' + num(A.leftV));
  ok(A.cls < 0.1, 'A6 ' + tag + ': analyst CLS ' + (Math.round(A.cls * 10000) / 10000) + ' (< 0.1) from the hand-off');
  const reg = log.filter((x) => /^\/api\/registry\/levels/.test(x.u)).length;
  ok(A.legend && reg >= 1 && reg <= 2, 'A8 ' + tag + ': the heat legend is the register\'s (/api/registry/levels read ' + reg + ' time(s) over both pages)');
  /* v91.17.283.33 · wait for the start-up data to land (a fresh server rebuilds area heat for ~5 min and re-issues the levels; the national sweep follows) */
  /* the server's first area-heat run is done (readiness: the area heat and cold input has a time), so the levels re-issue it causes has
     reached the page; then 15 s with no request. Both are server state, not the clock: a request in the tab window is the tab's. */
  const heatDone = async () => { try { const r = await fetch(BASE + '/api/readiness'); const j = await r.json(); const c = (j.checked || []).find((x) => x.product === 'area heat and cold'); return !c || !!c.inputAt; } catch (_) { return false; } };
  for (const t1 = Date.now(); Date.now() - t1 < 600000;) { if (await heatDone()) break; await pg.waitForTimeout(2000); }
  for (const t1 = Date.now(); Date.now() - t1 < 300000;) { const last = log.length ? log[log.length - 1].t : 0; if (Date.now() - last >= 15000 && Date.now() - tHand >= 45000) break; await pg.waitForTimeout(500); }
  const tabs = await pg.evaluate(() => [...document.querySelectorAll('#machNav [data-goto]')].map((b) => b.getAttribute('data-goto')));
  /* a new run since the hand-off (the re-issue after the first area-heat run) drops the page's national-item cache by design (each national
     item is read once again after a run change, on its first use): one pass over the tabs takes those reads, then the measured pass */
  const runEv = await pg.evaluate(() => window.__runEv || 0);
  /* v91.17.283.36 (launch item 9): a tab loads its data when it is first opened, never before; so one first pass always opens every tab,
     then the measured second pass must make 0 data requests */
  if (true) { for (const g of tabs.concat(['overview'])) { await pg.click('#machNav [data-goto="' + g + '"]').catch(() => {}); await pg.waitForTimeout(4000); }
    for (const t1 = Date.now(); Date.now() - t1 < 120000;) { const last = log.length ? log[log.length - 1].t : 0; if (Date.now() - last >= 15000) break; await pg.waitForTimeout(500); } }
  const runEv0 = await pg.evaluate(() => window.__runEv || 0);
  const tTabs = Date.now();
  for (const g of tabs.concat(['overview'])) { await pg.click('#machNav [data-goto="' + g + '"]').catch(() => {}); await pg.waitForTimeout(4000); }
  const runEv1 = await pg.evaluate(() => window.__runEv || 0);
  const tabReqs = log.filter((x) => x.t >= tTabs && !TELE.test(x.u) && !failed.has(x.u)).map((x) => x.u);
  ok(tabReqs.length === 0 && runEv1 === runEv0, 'A4 ' + tag + ': switching all ' + tabs.length + ' main tabs a second time makes 0 data requests (the first opening of a tab loads it' + (runEv ? '; a new run since the hand-off' : '') + ')', tally(tabReqs) + (runEv1 !== runEv0 ? ' · a new run arrived during the measured pass' : ''));
  const px = log.map((x) => x.u).filter((u) => /^\/px\/v1\/forecast/.test(u));
  ok(!px.length, 'A4 ' + tag + ': no /px/v1/forecast from either page', px.slice(0, 3).join(', '));
  /* A7: the Overview top bar search */
  await pg.click('#machNav [data-goto="overview"]').catch(() => {}); await pg.waitForTimeout(1500);
  const has = await pg.$('#agnTopSearch');
  let topSug = false; if (has) { await has.click(); await pg.keyboard.type('Lahore', { delay: 30 }); topSug = await pg.waitForSelector('#agnTopSearchRes button[data-ac="0"]', { timeout: 20000 }).then(() => true).catch(() => false); }
  const loc = await pg.evaluate(() => !!document.querySelector('#agnLive84 .loc') && typeof (window.AGNPlaceSearch && AGNPlaceSearch.locate) === 'function' && !(window.AGNConditions && AGNConditions.getUserLocation));
  ok(!!has && topSug && loc, 'A7 ' + tag + ': the Overview top bar has the shared place search (suggestions for "Lahore") and My location (one implementation)');
  ok(!errs.length, 'P0 ' + tag + ': no page error', errs.slice(0, 4).join(' | '));
  COUNTS.push(['start load', tag, load.length, tally(load)], ['start selection', tag, sel.length, tally(sel)], ['analyst first 18 s', tag, an.length, tally(an)]);
  await ctx.close();
}
await br.close();
console.log('\nCOUNTS'); COUNTS.forEach((r) => console.log('  ' + r[0] + ' · ' + r[1] + ' · ' + r[2] + ' requests: ' + r[3]));
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
