import * as __T from '../lib/testenv.mjs';
/* v91.17.283.17 · the analyst view opens stable, and opens at the start page's place with the start page's values.
   Owner, 24 Oct 2026 23:20 PKT: "When I switch from the start page to Overview, the Overview page doesn't open stable, too much vibration,
   like jumping, then stable"; and the values "correct themselves" after the switch. Measured on v283.16 in the owner's Chrome: CLS 1.42
   over the first 12 s; the page booted at Islamabad and then searched its way to Lahore (reverse look-up, search, three names).
     A  /analyst opened fresh, 1366x768 and 1920x1080, three runs each: cumulative layout shift over the first 12 s (buffered layout-shift
        observer) < 0.1 and no single shift > 0.05; the count of shifts > 0.01 is printed
     B  arriving from the start page's "Analyst view" link with a place (5 places over the two sizes): the same CLS rule; the place and the
        "now" value first shown are the start page's; the value never changes in the 12 s; the place's point state and its tehsil levels are
        not asked again (the handed-over record of the same run is used), no search and no reverse look-up of the place; with a handed-over
        record of another run, the place's point state and its tehsil levels are asked exactly once
        (v91.17.283.19: the handed-over record is the place bundle, agn.handoff v2; "asked" = GET /api/point of the place, which carries the
        tehsil levels as a part, so no /api/levels/unit of the place in either case; a stale hand-over = a bundle stamp of another run)
     C  the start page (/) and Customize (/customize): CLS < 0.1
     D  a tab switch Overview -> Forecast -> Overview after load: CLS of the switch < 0.05
   usage: node scripts/tests28317/stable.test.mjs [http://127.0.0.1:8787] */
const BASE = __T.BASE;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const WIN = 12000, SIZES = [[1366, 768], [1920, 1080]];
/* the layout-shift record of the page, from its first paint (buffered), with the sources of each shift; the bar's place and value at the
   moment the Overview is shown (agn:shown) and every value it shows afterwards */
const INIT = () => { window.__ls = []; window.__bar = { shown: null, vals: [], names: [] };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; window.__ls.push({ t: Math.round(e.startTime), v: e.value, src: (e.sources || []).slice(0, 3).map((s) => { const n = s.node; return n && n.nodeType === 1 ? n.tagName + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/)[0] : '') : '#text'; }).join(',') }); } }).observe({ type: 'layout-shift', buffered: true }); } catch (_) {}
  const read = () => { const v = document.querySelector('#agnLive84 .t .v'), p = document.querySelector('#agnLive84 .agn-place span'), c = document.getElementById('cityLabel'); return { v: v ? v.textContent.trim() : '', p: p ? p.textContent.trim() : '', c: c ? c.textContent.trim() : '' }; };
  document.addEventListener('agn:shown', () => { window.__bar.shown = Object.assign(read(), { at: Math.round(performance.now()) }); });
  const tick = () => { const r = read(); if (r.v && window.__bar.vals[window.__bar.vals.length - 1] !== r.v) window.__bar.vals.push(r.v); if (r.c && window.__bar.names[window.__bar.names.length - 1] !== r.c) window.__bar.names.push(r.c); setTimeout(tick, 100); };
  document.addEventListener('DOMContentLoaded', tick); };
const clsOf = (ls) => { const s = ls.reduce((a, e) => a + e.v, 0); return { cls: Math.round(s * 10000) / 10000, max: Math.round(Math.max(0, ...ls.map((e) => e.v)) * 10000) / 10000, n01: ls.filter((e) => e.v > 0.01).length, n: ls.length, worst: ls.slice().sort((a, b) => b.v - a.v).slice(0, 2).map((e) => e.t + 'ms ' + e.v.toFixed(4) + ' ' + e.src) }; };
const out = { fresh: [], start: [], pages: [], tab: [] };
async function ctxOf(W, H) { const ctx = await br.newContext({ viewport: { width: W, height: H } }); await ctx.addInitScript(INIT); return ctx; }

/* A · /analyst opened fresh */
for (const [W, H] of SIZES) for (let run = 1; run <= 3; run++) {
  const ctx = await ctxOf(W, H), pg = await ctx.newPage(); await pg.goto(BASE + '/analyst', { waitUntil: 'commit', timeout: 180000 }); await pg.waitForTimeout(WIN);
  const r = clsOf(await pg.evaluate(() => window.__ls)); out.fresh.push({ W, H, run, ...r });
  ok(r.cls < 0.1 && r.max <= 0.05, 'A /analyst ' + W + 'x' + H + ' run ' + run + ': CLS ' + r.cls + ' (< 0.1), largest shift ' + r.max + ' (<= 0.05), ' + r.n01 + ' shifts > 0.01', JSON.stringify(r.worst));
  await ctx.close(); }

/* B · from the start page's "Analyst view" link, with a place */
const PLACES = [['Lahore', 31.558, 74.35071], ['Karachi', 24.8607, 67.0011], ['Peshawar', 34.0151, 71.5249], ['Multan', 30.1575, 71.4753], ['Gilgit', 35.9208, 74.3089], ['Lahore', 31.558, 74.35071]];
const key = (a, b) => (Math.round(a * 100) / 100).toFixed(2) + ',' + (Math.round(b * 100) / 100).toFixed(2);
for (let i = 0; i < PLACES.length; i++) {
  const [nm, la, lo] = PLACES[i], [W, H] = SIZES[i % 2], stale = i === PLACES.length - 1;
  const ctx = await ctxOf(W, H), pg = await ctx.newPage(); const req = []; let t0 = 0;
  pg.on('request', (q) => { if (t0) req.push(q.url().replace(BASE, '')); });
  await pg.goto(BASE + '/#agnplace=' + la.toFixed(5) + ',' + lo.toFixed(5) + ',' + encodeURIComponent(nm), { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => { const a = document.getElementById('btnAnalyst'); return a && /#agnplace=/.test(a.getAttribute('href') || '') && document.getElementById('card') && document.getElementById('card').hasAttribute('data-ready'); }, null, { timeout: 60000 }).catch(() => null);
  await pg.waitForTimeout(500);
  t0 = Date.now();
  const H0 = await pg.evaluate((stale) => { const a = document.getElementById('btnAnalyst'); const href = a.getAttribute('href'); a.click(); let h = null; try { h = JSON.parse(sessionStorage.getItem('agn.handoff') || 'null'); } catch (_) {}
    if (h && stale) { h.stamp = 'stale-run-for-the-test#-'; h.ps.stamp = h.stamp; sessionStorage.setItem('agn.handoff', JSON.stringify(h)); }
    return h ? { href, v: h.v, name: h.name, run: h.run, stamp: h.stamp, key: h.ps && h.ps.key, uid: h.uid, now: h.ps && h.ps.now && h.ps.now.tempC, lv: !!(h.ps && h.ps.parts && h.ps.parts.levels && h.ps.parts.levels.ok) } : { href }; }, stale);
  await pg.waitForURL(/\/analyst/, { timeout: 60000 }); await pg.waitForTimeout(WIN);
  const R = await pg.evaluate(() => ({ ls: window.__ls, bar: window.__bar }));
  const r = clsOf(R.ls); out.start.push({ place: nm, W, H, stale, ...r, shown: R.bar.shown, vals: R.bar.vals, names: R.bar.names });
  const fmt = (t) => { if (t == null || !isFinite(t)) return null; const v = Math.round(+t * 10) / 10; return String(v === 0 ? 0 : v); };
  const K = H0.key || key(la, lo), lat2 = K.split(',')[0], lon2 = K.split(',')[1];
  /* v91.17.283.20 (B8): a handed-over bundle whose parts were still being computed is completed by ONE read of the same bundle
     (its own query + &complete=1); that read is not another place's bundle */
  const done = req.filter((u) => u.startsWith('/api/point?') && /[?&]complete=1/.test(u)).length;
  const single = req.filter((u) => u.startsWith('/api/point?') && !/[?&]complete=1/.test(u)).length;   /* the analyst asks no other place's bundle on opening */
  const batch = req.filter((u) => u.startsWith('/api/point/batch') && decodeURIComponent(u).split(/[=;&]/).includes(K)).length;
  const lvu = H0.uid ? req.filter((u) => u.startsWith('/api/levels/unit?') && decodeURIComponent(u.split('unit=')[1] || '') === H0.uid).length : -1;
  const geo = req.filter((u) => /^\/api\/geo\/(search|reverse)\?/.test(u) && (u.includes(String(la.toFixed(5))) || u.includes(encodeURIComponent(la.toFixed(5))) || /q=Lahore|q=Karachi|q=Peshawar|q=Multan|q=Gilgit/i.test(u))).length;
  const tag = 'B ' + nm + (stale ? ' (handed-over record of another run)' : '') + ' ' + W + 'x' + H;
  ok(r.cls < 0.1 && r.max <= 0.05, tag + ': CLS ' + r.cls + ' (< 0.1), largest shift ' + r.max + ', ' + r.n01 + ' shifts > 0.01', JSON.stringify(r.worst));
  ok(H0.v === 2 && !!H0.name && !!H0.run && !!H0.stamp, tag + ': the start page handed over the place and its bundle (' + JSON.stringify({ v: H0.v, name: H0.name, run: H0.run, stamp: H0.stamp, uid: H0.uid, levels: H0.lv }) + ')', JSON.stringify(H0));
  ok(R.bar.shown && R.bar.shown.c === H0.name && R.bar.names.every((x) => x === H0.name), tag + ': the header names the start page\'s place from the first paint ("' + H0.name + '"; names shown ' + JSON.stringify(R.bar.names) + ')', JSON.stringify(R.bar));
  ok(R.bar.shown && R.bar.shown.p === H0.name, tag + ': the Overview is first shown with the start page\'s place in the bar', JSON.stringify(R.bar.shown));
  if (!stale) ok(R.bar.shown && R.bar.shown.v === fmt(H0.now) && R.bar.vals.length === 1, tag + ': the "now" value first shown is the start page\'s (' + fmt(H0.now) + ' C) and never changes (' + JSON.stringify(R.bar.vals) + ')', JSON.stringify(R.bar));
  else ok(R.bar.vals.length >= 1 && R.bar.vals.every((v) => v === R.bar.vals[0]), tag + ': the "now" value does not change once shown (' + JSON.stringify(R.bar.vals) + ')', JSON.stringify(R.bar));
  if (!stale) ok(single + batch === 0 && done <= 1 && lvu === 0, tag + ': the handed-over bundle of the current run is used: 0 place-bundle requests (' + done + ' completion read of it) and 0 tehsil-levels requests for the place', JSON.stringify({ single, done, batch, lvu, K, req: req.filter((u) => /\/api\/point|levels\/unit/.test(u)).slice(0, 12) }));
  else ok(single + batch === 1 && done <= 1 && lvu === 0, tag + ': a record of another run is read again exactly once: 1 place-bundle request for the place (its tehsil levels are a part: 0 /api/levels/unit)', JSON.stringify({ single, batch, lvu, K, req: req.filter((u) => /\/api\/point|levels\/unit/.test(u)).slice(0, 12) }));
  ok(geo === 0, tag + ': no search and no reverse look-up of the place', JSON.stringify(req.filter((u) => /geo\//.test(u))));
  await ctx.close(); }

/* C · the start page and Customize */
for (const [path, W, H] of [['/', 1366, 768], ['/', 1920, 1080], ['/customize', 1366, 768], ['/customize', 1920, 1080]]) {
  const ctx = await ctxOf(W, H), pg = await ctx.newPage(); await pg.goto(BASE + path, { waitUntil: 'commit', timeout: 180000 }); await pg.waitForTimeout(WIN);
  const r = clsOf(await pg.evaluate(() => window.__ls)); out.pages.push({ path, W, H, ...r });
  ok(r.cls < 0.1, 'C ' + path + ' ' + W + 'x' + H + ': CLS ' + r.cls + ' (< 0.1)', JSON.stringify(r.worst)); await ctx.close(); }

/* D · a tab switch after load */
for (const [W, H] of SIZES) {
  const ctx = await ctxOf(W, H), pg = await ctx.newPage(); await pg.goto(BASE + '/analyst', { waitUntil: 'commit', timeout: 180000 }); await pg.waitForTimeout(WIN);
  const r = await pg.evaluate(async () => { const ls = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) ls.push(e.value); }); po.observe({ type: 'layout-shift' });
    const go = (v) => { const b = document.querySelector('#machNav [data-goto="' + v + '"]'); if (b) b.click(); return !!b; };
    const a = go('livedata'); await new Promise((x) => setTimeout(x, 3000)); const b = go('overview'); await new Promise((x) => setTimeout(x, 3000)); po.disconnect();
    return { ok: a && b, cls: Math.round(ls.reduce((s, v) => s + v, 0) * 10000) / 10000, n: ls.length, active: (document.querySelector('.view.active') || {}).getAttribute && document.querySelector('.view.active').getAttribute('data-view') }; });
  out.tab.push({ W, H, ...r });
  ok(r.ok && r.active === 'overview' && r.cls < 0.05, 'D tab switch Overview -> Forecast -> Overview ' + W + 'x' + H + ': CLS ' + r.cls + ' (< 0.05)', JSON.stringify(r)); await ctx.close(); }

await br.close();
console.log('RESULT ' + JSON.stringify(out));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
