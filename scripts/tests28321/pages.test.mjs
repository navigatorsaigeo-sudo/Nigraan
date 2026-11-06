import * as __T from '../lib/testenv.mjs';
/* v91.17.283.21 · THE LIVE CHECK OF 283.20 (owner, 26 Oct 2026: F-10 via the start page to the analyst view, window 1037x730). Chromium,
   against a running server (argv[2]); the operator view at 1037x730, 1366x768 and 1920x1080, the customer view at 1037x730:
     R1  start page: selecting a place makes 1 place request (GET /api/point) and at most 1 completion read of it; nothing else per place
     R2  analyst after the hand-off: at most 1 place request (the operator view reads the place once in its view) and at most 1 completion
         read; no GET /api/pool/point (the products card reads the bundle's operator part pool) and no other per-place request
     R3  Customize opened without a place: 1 place request and at most 1 completion read
     T1  no "not recorded as evidence" notice from page load (every animation frame of the first 25 s after the hand-off); T2 (operator
         view): pressing the screening's Run button with no asset does raise it (the notice belongs to a user's run)
     H1  analyst header: title, flag and page switch do not overlap (bounding boxes), the title is not cut, the flag slot is not narrower
         than the flag; no two header items overlap; the same for the start page and Customize headers; CLS < 0.1 on both pages
     L1  once the map is coloured, the map legend holds no "Loading levels" row within 6 s, and no element on the page shows that text
         (v91.17.283.24 W1: coloured only from a current issued run; with no current run the map is not coloured with a level)
     S1  start drawer, Forecast tab: "Next 4 days, hour by hour" between the Next 3 days cards and Next 12 hours; every 3-hour rain window
         equals the sum of its hourly rain; a full day's windows add up to the day's rain; the chance cells are the bundle's windows3h;
         the 1 h and now (15 min) steps make no request; the now step lists only 15-minute values
   usage: node scripts/tests28321/pages.test.mjs [http://127.0.0.1:8787] [place query, default F-10] */
const BASE = __T.BASE, Q = process.argv[3] || 'F-10';
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
/* a request about one place: a point, a place id, a point list of fewer than 3 points is NOT counted here (national lists are batches) */
const PLACE = /^\/(api\/(point\?|pointstate(\?|\/(batch|near|product)\?)|levels\/unit\?|geo\/(reverse|near|resolve|place)\?|report\/(context|past30)\?|outlook\/(unit|seasonal)\?|smog\/unit\?|flood\/point\?|pool\/(point|rank|hazard)\?|fleet\/nearest\?|mos\/point\?|state\/point\?|site\/(risk|screening)\?|place\/facts\?|climatology\/baseline\?|glof\/upstream\?|rain\/chance\?.*lat=)|px\/v1\/forecast\?)/;
const isPlace = (p) => PLACE.test(p);
const isComplete = (p) => /^\/api\/point\?.*[?&]complete=1/.test(p);
const path = (u) => u.replace(BASE, '');
const INIT = (op) => {
  try { if (op) localStorage.setItem('agn.operator.v2', '1'); else localStorage.removeItem('agn.operator.v2'); } catch (_) {}
  window.__ls = []; window.__lsx = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__ls.push(e.value); window.__lsx.push(e.value.toFixed(4) + '@' + Math.round(e.startTime) + ' ' + (e.sources || []).map((x) => x.node ? (x.node.id || String(x.node.className || x.node.nodeName)).slice(0, 30) : '').join('|')); } }).observe({ type: 'layout-shift', buffered: true }); } catch (_) {}
  window.__toasts = []; const t0 = performance.now();
  const tick = () => { const n = document.getElementById('agnWriteRefusal'); const t = n && n.textContent && getComputedStyle(n).display !== 'none' && getComputedStyle(n).opacity !== '0' ? n.textContent : '';
    if (t && window.__toasts[window.__toasts.length - 1] !== t) window.__toasts.push(t); if (performance.now() - t0 < 60000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
const overlap = (a, b) => a && b && a.w > 0 && b.w > 0 && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const boxes = (pg, sel) => pg.evaluate((s) => { const hb = document.querySelector(s); if (!hb) return null; const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
  const kids = [...hb.children].filter((e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.position !== 'absolute' && cs.position !== 'fixed' && e.getBoundingClientRect().width > 0; }).map((e) => ({ id: (e.id || String(e.className || e.tagName)).slice(0, 30), ...r(e) }));
  const one = (q) => { const e = document.querySelector(q); return e ? { ...r(e), sw: e.scrollWidth, cw: e.clientWidth } : null; };
  return { kids, code: one('header.topbar .product .code'), flag: one('#agnPkFlag'), slot: one('header.topbar .spacer.agn-has-flag'), sw: one('#agn-switch') }; }, sel);
const pairs = (K) => { const o = []; for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) if (overlap(K[i], K[j])) o.push(K[i].id + ' x ' + K[j].id); return o; };
const RUNS = [[1037, 730, true], [1366, 768, true], [1920, 1080, true], [1037, 730, false]].filter((r) => !process.env.T28321_RUNS || process.env.T28321_RUNS.split(',').includes(r[0] + (r[2] ? 'o' : 'c')));
for (const [W, H, OP] of RUNS) {
  const tag = W + 'x' + H + (OP ? ' operator' : ' customer');
  const ctx = await br.newContext({ viewport: { width: W, height: H } }); await ctx.addInitScript(INIT, OP); const pg = await ctx.newPage();
  const log = []; ctx.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE) && /^\/(api|px)\//.test(path(u))) log.push({ u: path(u), t: Date.now() }); });
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await pg.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(8000);
  const sh = await boxes(pg, 'header#bar');
  ok(sh && !pairs(sh.kids).length, 'H1 ' + tag + ': start page header items do not overlap', sh && pairs(sh.kids).join(', '));
  await pg.click('#q'); await pg.keyboard.type(Q, { delay: 30 }); await pg.waitForSelector('#sr button[data-ac="0"]', { timeout: 30000 }); await pg.waitForTimeout(500);
  const tSel = Date.now(); await pg.click('#sr button[data-ac="0"]');
  await pg.waitForFunction(() => { const e = document.getElementById('nowT'); return e && /\d/.test(e.textContent); }, null, { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(10000);
  const sp = log.filter((x) => x.t >= tSel).map((x) => x.u).filter(isPlace), spF = sp.filter((u) => !isComplete(u)), spC = sp.filter(isComplete);
  ok(spF.length === 1 && /^\/api\/point\?/.test(spF[0]) && spC.length <= 1, 'R1 ' + tag + ': the selection makes 1 place request and ' + spC.length + ' completion read (' + sp.join(', ') + ')');
  /* S1: the strip in the Forecast tab */
  if (W === 1366 || (W === 1037 && !OP)) {
    await pg.click('#dTabs [data-t="fc"]').catch(() => {}); await pg.waitForTimeout(1500);
    const S = await pg.evaluate(() => { const box = document.getElementById('rb_n3'), h = box ? box.innerHTML : ''; const d = window.AGNSTART && AGNSTART.data;
      const iN3 = h.indexOf('id="n3Sec"'), iS = h.indexOf('Next 4 days, hour by hour'), i12 = h.indexOf('Next 12 hours');
      const W = AGNSTART.hourStrip.windows(), H = (d && d.f && d.f.hours) || [];
      const bad = []; W.forEach((w) => { const hs = H.filter((x) => w.hours.indexOf(x.time) >= 0); if (hs.length === 3 && hs.every((x) => x.rainMm != null)) { const s = Math.round(10 * hs.reduce((a, x) => a + (+x.rainMm), 0)) / 10; if (Math.abs(s - w.mm) > 0.051) bad.push(w.start + ' ' + s + ' vs ' + w.mm); } else if (w.mm != null) bad.push(w.start + ' incomplete but ' + w.mm); });
      const cells = [...document.querySelectorAll('#hsRain [data-win]')].map((c) => ({ k: c.getAttribute('data-win'), mm: c.getAttribute('data-mm') }));
      const cellBad = cells.filter((c) => { const w = W.find((x) => x.start === c.k); return !w || String(w.mm == null ? '' : w.mm) !== c.mm; }).map((c) => c.k);
      const days = (d.f.days || []).map((x) => { const ws = W.filter((w) => w.start.slice(0, 10) === x.date); return ws.length === 8 && ws.every((w) => w.mm != null) && x.rainMm != null ? { date: x.date, day: +x.rainMm, sum: Math.round(10 * ws.reduce((a, w) => a + w.mm, 0)) / 10 } : null; }).filter(Boolean);
      const ch = AGNSTART.hourStrip.chance(), PH = d.B && d.B.parts && d.B.parts.poolHazard, W3 = PH && PH.v && PH.v.windows3h;
      const chBad = [...document.querySelectorAll('#hsChance [data-win]')].filter((c) => { const r = W3 && W3.windows.find((x) => x.start === c.getAttribute('data-win')); const p = r && r.pRain != null ? String(Math.round(100 * r.pRain)) : ''; return ch.st === 'ok' && p !== c.getAttribute('data-p'); }).map((c) => c.getAttribute('data-win'));
      return { order: iN3 >= 0 && iS > iN3 && i12 > iS, nW: W.length, bad, cells: cells.length, cellBad, days, chSt: ch.st, chCells: document.querySelectorAll('#hsChance [data-win]').length, chBad, hourly: /title="Rain [0-2]\d:00–/.test(h) }; });
    ok(S.order, 'S1 ' + tag + ': the strip sits below the Next 3 days cards and above Next 12 hours');
    ok(S.nW > 20 && !S.bad.length && S.cells > 8 && !S.cellBad.length, 'S1 ' + tag + ': every 3-hour rain window equals the sum of its hourly rain (' + S.nW + ' windows, ' + S.cells + ' cells)', JSON.stringify([S.bad.slice(0, 3), S.cellBad.slice(0, 3)]));
    ok(S.days.length >= 2 && S.days.every((x) => Math.abs(x.day - x.sum) <= 0.11), 'S1 ' + tag + ': a full day\'s windows add up to the day\'s rain (' + S.days.map((x) => x.date + ' ' + x.day + '/' + x.sum).join(', ') + ')');
    ok(S.chSt === 'ok' && S.chCells > 8 && !S.chBad.length, 'S1 ' + tag + ': the chance cells are the bundle\'s 3-hour windows (' + S.chSt + ', ' + S.chCells + ' cells)', JSON.stringify(S.chBad.slice(0, 4)));
    const tStep = Date.now();
    await pg.click('#hsBox [data-hs="1"]'); await pg.waitForTimeout(800);
    const one = await pg.evaluate(() => ({ cols: (document.querySelector('#hStrip .hsIn > .hsRow') || { children: [] }).children.length, rain: [...document.querySelectorAll('#hsRain [data-win]')].map((c) => c.getBoundingClientRect().width) }));
    await pg.click('#hsBox [data-hs="15"]'); await pg.waitForTimeout(800);
    const nw = await pg.evaluate(() => { const n = document.getElementById('hsNow'); return n ? { li: [...n.querySelectorAll('li')].map((x) => x.getAttribute('data-hs15')), txt: n.textContent.slice(0, 200) } : null; });
    await pg.click('#hsBox [data-hs="3"]'); await pg.waitForTimeout(500);
    const stepReq = log.filter((x) => x.t >= tStep).map((x) => x.u);
    ok(one.rain.length > 4 && one.rain.slice(1, -1).every((w) => Math.abs(w - 3 * 46) < 1.5), 'S1 ' + tag + ': in the 1 h step the rain cells span 3 hours (' + one.cols + ' hour columns)', JSON.stringify(one.rain.slice(0, 5)));
    ok(!!nw && nw.li.every((k) => k === 'rain' || k === 'station'), 'S1 ' + tag + ': the now (15 min) step lists only 15-minute values (' + (nw ? nw.li.join(', ') || nw.txt : 'none') + ')');
    ok(!stepReq.length, 'S1 ' + tag + ': the 1 h / now / 3 h steps make no request', stepReq.join(', '));
  }
  const clsStart = await pg.evaluate(() => (window.__ls || []).reduce((a, v) => a + v, 0)), lsx = await pg.evaluate(() => (window.__lsx || []).filter((x) => +x.split('@')[0] > 0.005));
  ok(clsStart < 0.1, 'H1 ' + tag + ': start page CLS ' + Math.round(clsStart * 10000) / 10000 + ' (< 0.1)', lsx.join(' ; '));
  /* the hand-off */
  const tHand = Date.now();
  await Promise.all([pg.waitForURL(/analyst/, { timeout: 60000 }), pg.evaluate(() => document.getElementById('btnAnalyst').click())]);
  await pg.waitForTimeout(25000);
  const ap = log.filter((x) => x.t >= tHand).map((x) => x.u).filter(isPlace), apF = ap.filter((u) => !isComplete(u)), apC = ap.filter(isComplete);
  ok(apF.length <= 1 && apF.every((u) => /^\/api\/point\?/.test(u)) && apC.length <= 1, 'R2 ' + tag + ': the analyst makes ' + apF.length + ' place request(s) and ' + apC.length + ' completion read(s), nothing else per place (' + (ap.join(', ') || 'none') + ')');
  const all = log.filter((x) => x.t >= tHand).map((x) => x.u);
  ok(!all.some((u) => /^\/api\/pool\/point/.test(u)), 'R2 ' + tag + ': no GET /api/pool/point');
  if (OP) { const pc = await pg.evaluate(() => { const g = document.getElementById('agnPoolGrid'); return g ? g.textContent.slice(0, 160) : null; });
    ok(pc != null && !/pool unavailable/.test(pc) && /°C/.test(pc), 'R2 ' + tag + ': the operator products card is drawn from the bundle part pool', pc); }
  const toasts = await pg.evaluate(() => window.__toasts || []);
  ok(!toasts.some((t) => /not recorded as evidence/.test(t)), 'T1 ' + tag + ': no "not recorded as evidence" notice from page load (25 s)', toasts.join(' | '));
  const hb = await boxes(pg, 'header.topbar');
  const hp = hb ? [['title', hb.code], ['flag', hb.flag], ['switch', hb.sw]] : [];
  const tri = []; for (let i = 0; i < hp.length; i++) for (let j = i + 1; j < hp.length; j++) if (overlap(hp[i][1], hp[j][1])) tri.push(hp[i][0] + ' x ' + hp[j][0]);
  ok(hb && hb.code && hb.flag && hb.sw && !tri.length && hb.code.sw <= hb.code.cw + 1 && hb.slot.w >= hb.flag.w && hb.flag.l >= hb.slot.l - 0.5 && hb.flag.r <= hb.slot.r + 0.5,
    'H1 ' + tag + ': title, flag and page switch do not overlap, the title is whole, the flag sits in its slot (title ' + (hb && hb.code ? Math.round(hb.code.l) + '-' + Math.round(hb.code.r) : '?') + ', flag ' + (hb && hb.flag ? Math.round(hb.flag.l) + '-' + Math.round(hb.flag.r) : '?') + ', switch ' + (hb && hb.sw ? Math.round(hb.sw.l) + '-' + Math.round(hb.sw.r) : '?') + ')', tri.join(', '));
  ok(hb && !pairs(hb.kids).length, 'H1 ' + tag + ': no two analyst header items overlap', hb && pairs(hb.kids).join(', '));
  const clsA = await pg.evaluate(() => (window.__ls || []).reduce((a, v) => a + v, 0));
  ok(clsA < 0.1, 'H1 ' + tag + ': analyst CLS ' + Math.round(clsA * 10000) / 10000 + ' (< 0.1) from the hand-off');
  /* L1: the legend once the map is coloured */
  /* v91.17.283.24 · W1: the map is coloured only from a current issued run (the page makes no estimate): with no current run (the stale
     test server) it is left uncoloured, and the legend still holds no "Loading levels" row once the server's answer is in */
  const runCur = await pg.evaluate(async () => { const k = (typeof currentMapLayer === 'function' ? currentMapLayer() : 'heat') || 'heat';
    const j = await fetch('/api/levels?layer=' + k + '&day=0', { cache: 'no-store' }).then((r) => r.json()).catch(() => null); return !!(j && j.levels && !j.stale && !(j.validUntil && Date.now() >= Date.parse(j.validUntil))); });
  let coloured = false; for (let i = 0; i < 60 && !coloured && runCur; i++) { coloured = await pg.evaluate(() => [...document.querySelectorAll('.leaflet-overlay-pane path')].filter((p) => /^#(74c476|ffe680|fdae61|e8552d|a50026)$/i.test(p.getAttribute('fill') || '')).length > 20); if (!coloured) await pg.waitForTimeout(1000); }
  if (!runCur) coloured = await pg.evaluate(() => [...document.querySelectorAll('.leaflet-overlay-pane path')].filter((p) => /^#(74c476|ffe680|fdae61|e8552d|a50026)$/i.test(p.getAttribute('fill') || '') && +(p.getAttribute('fill-opacity') || 0) > 0.05).length === 0);
  await pg.waitForTimeout(6000);
  const lg = await pg.evaluate(() => ({ row: [...document.querySelectorAll('#v3legend b')].some((b) => /Loading levels/i.test(b.textContent || '')),
    any: [...document.querySelectorAll('body *')].filter((e) => !/^(SCRIPT|STYLE|TEMPLATE)$/.test(e.tagName) && [...e.childNodes].some((n) => n.nodeType === 3 && /Loading levels/i.test(n.nodeValue || ''))).length,
    rows: document.querySelectorAll('#v3legend .agn-leg-row').length }));
  ok(coloured && !lg.row && lg.any === 0 && lg.rows > 3, 'L1 ' + tag + ': ' + (runCur ? 'the map is coloured' : 'no current issued run: the map is not coloured with a level') + ' and the legend holds no "Loading levels" row (' + lg.rows + ' rows; ' + lg.any + ' element(s) with that text)');
  if (OP && W === 1037) { /* T2: the notice belongs to a user's run */
    await pg.click('#machNav [data-goto="assessments"]').catch(() => {}); await pg.waitForTimeout(2500);
    /* the notice goes through AGN.writeRefusal (which the clean view keeps silent on the screen): the call itself is counted */
    await pg.evaluate(() => { window.__wr = []; const f = window.AGN && AGN.writeRefusal; if (f) AGN.writeRefusal = function (st, why) { window.__wr.push(st + ': ' + String(why).slice(0, 80)); return f.apply(this, arguments); }; });
    await pg.waitForTimeout(3000); const auto = await pg.evaluate(() => window.__wr.slice());
    /* v91.17.283.28 (owner, P5): no default asset type, so the user picks one before pressing Run (a run with none screens nothing) */
    await pg.evaluate(() => { const a = document.getElementById('asmtAsset'); if (a && !a.value) a.value = 'industrial'; });
    await pg.click('#asmtRun').catch(() => {}); await pg.waitForTimeout(2500);
    const t2 = await pg.evaluate(() => window.__wr.slice());
    ok(!auto.some((t) => /not recorded as evidence/.test(t)) && t2.some((t) => /^hazard_evidence: this screening result was not recorded as evidence/.test(t)), 'T2 ' + tag + ': the notice is raised by pressing Run with no asset, not by the automatic runs', JSON.stringify([auto, t2]));
  }
  /* R3: Customize opened without a place */
  await pg.evaluate(() => { try { localStorage.removeItem('agn.switchPlace'); } catch (_) {} });
  const tC = Date.now(); await pg.goto(BASE + '/customize', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(15000);
  const cp = log.filter((x) => x.t >= tC).map((x) => x.u).filter(isPlace), cpF = cp.filter((u) => !isComplete(u)), cpC = cp.filter(isComplete);
  ok(cpF.length === 1 && cpC.length <= 1, 'R3 ' + tag + ': Customize makes 1 place request and ' + cpC.length + ' completion read on opening (' + cp.join(', ') + ')');
  const ch2 = await boxes(pg, 'header');
  ok(ch2 && !pairs(ch2.kids).length, 'H1 ' + tag + ': Customize header items do not overlap', ch2 && pairs(ch2.kids).join(', '));
  ok(!errs.length, 'P0 ' + tag + ': no page error', errs.slice(0, 4).join(' | '));
  await ctx.close();
}
await br.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
