import * as __T from '../lib/testenv.mjs';
/* v91.17.283.22 · THE OWNER'S CHECK OF 283.21 (26 Oct 2026). Chromium, against a running server (argv[2]); the operator view at 1037x730,
   1366x768 and 1920x1080, the customer view at 1037x730:
     H1  hand-off: the analyst page opened from the start page makes NO place request on the same run (the start page's bundle is kept)
         and at most one completion read; nothing else per place
     H2  the left card's title is never the tehsil's name while the place loads (only the place record's name)
     H3  the left card is filled (a number) within 4 s of the analyst page's start
     R1  rain in 3-hour windows in all three tables: the start drawer's strip, its Next 12 hours and the Overview's Next 24 hours: every
         window starts at hh % 3 = 0, its rain is the sum of the record's three hours, its chance is the bundle's windows3h value of that
         window (the strip's method); Next 12 hours lists every hour once (row spans add up to 12)
     S1  the strip is in the analyst page's Forecast tab, the same component (AGNHourStrip) with the same windows as the start drawer
     M1  the hazard map opens on Current; the line under the time buttons is today's peak from the issued levels of the hazard on the map
         ("Today's peak: <level> in <n> tehsils"), empty when every tehsil is Normal
     G1  every hazard's legend holds only the classes the register defines for it (GET /api/registry/levels layers) and its alert line:
         the analyst map legend and the start page's map chip
     P1  a place popup opened at the top edge of the map lies wholly inside the visible map
     C1  the chance of rain carries the register's label ("screening") in every table, never "Calibrated chance (area)"
   usage: node scripts/tests28322/pages.test.mjs [http://127.0.0.1:8787] [place query, default F-10] */
const BASE = __T.BASE, Q = process.argv[3] || 'F-10';
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const REG = await (await fetch(BASE + '/api/registry/levels')).json();
const PLACE = /^\/api\/(point\?|pointstate(\?|\/(batch|near|product)\?)|levels\/unit\?|pool\/(point|rank|hazard)\?)/;
const isComplete = (p) => /^\/api\/point\?.*[?&]complete=1/.test(p);
const path = (u) => u.replace(BASE, '');
const INIT = (op) => {
  try { if (op) localStorage.setItem('agn.operator.v2', '1'); else localStorage.removeItem('agn.operator.v2'); } catch (_) {}
  /* the left card's title and first number, every 100 ms from the page's start (analyst page only) */
  if (/analyst/.test(location.pathname)) { window.__tl = []; const t0 = performance.now(); const tick = () => { try { const h = document.querySelector('#mpLeftIn .mp-h h4'), v = document.querySelector('#mpLeftIn .mp-c .v, #mpLeftIn .mp-now .v, #mpLeftIn .mp-big');
      window.__tl.push([Math.round(performance.now() - t0), h ? h.textContent.trim() : null, !!(v && /\d/.test(v.textContent)), !!document.querySelector('#mpLeftIn .mp-sec.mp-mut')]); } catch (_) {} if (performance.now() - t0 < 15000) setTimeout(tick, 100); }; setTimeout(tick, 20); }
};
/* the windows3h of a bundle, by start */
const W3 = (B) => { const w = B && B.parts && B.parts.poolHazard && B.parts.poolHazard.v && B.parts.poolHazard.v.windows3h; const m = {}; (w && w.windows || []).forEach((r) => { m[r.start] = r; }); return m; };
const RUNS = [[1037, 730, true], [1366, 768, true], [1920, 1080, true], [1037, 730, false]].filter((r) => !process.env.T28322_RUNS || process.env.T28322_RUNS.split(',').includes(r[0] + (r[2] ? 'o' : 'c')));
for (const [W, H, OP] of RUNS) {
  const tag = W + 'x' + H + (OP ? ' operator' : ' customer');
  const ctx = await br.newContext({ viewport: { width: W, height: H } }); await ctx.addInitScript(INIT, OP); const pg = await ctx.newPage();
  const log = []; ctx.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE) && /^\/(api|px)\//.test(path(u))) log.push({ u: path(u), t: Date.now() }); });
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await pg.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(8000);
  await pg.click('#q'); await pg.keyboard.type(Q, { delay: 30 }); await pg.waitForSelector('#sr button[data-ac="0"]', { timeout: 30000 }); await pg.waitForTimeout(500);
  await pg.click('#sr button[data-ac="0"]');
  await pg.waitForFunction(() => { const e = document.getElementById('nowT'); return e && /\d/.test(e.textContent); }, null, { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(10000);
  await pg.click('#dTabs [data-t="fc"]').catch(() => {}); await pg.waitForTimeout(1500);
  /* R1 start: the strip and Next 12 hours */
  const S = await pg.evaluate(() => { const d = window.AGNSTART && AGNSTART.data, B = d && d.B, H = (B && B.hours) || [], byT = {}; H.forEach((h) => { byT[h.time] = h; });
    const wm = {}; const w3 = B && B.parts && B.parts.poolHazard && B.parts.poolHazard.v && B.parts.poolHazard.v.windows3h; (w3 && w3.windows || []).forEach((r) => { wm[r.start] = r; });
    const sumOf = (k) => { const hs = [1, 2, 3].map((i) => { const t = new Date(Date.parse(k + ':00Z') + i * 3600e3).toISOString().slice(0, 16); return byT[t]; }); return hs.every((h) => h && h.rainMm != null) ? Math.round(10 * hs.reduce((a, h) => a + (+h.rainMm), 0)) / 10 : null; };
    const pOf = (k) => { const r = wm[k]; return r && r.pRain != null ? String(Math.round(100 * r.pRain)) : ''; };
    const strip = [...document.querySelectorAll('#hsRain [data-win]')].map((c) => ({ k: c.getAttribute('data-win'), mm: c.getAttribute('data-mm') })), chance = [...document.querySelectorAll('#hsChance [data-win]')].map((c) => ({ k: c.getAttribute('data-win'), p: c.getAttribute('data-p') }));
    const rows = [...document.querySelectorAll('#h12Table tbody tr')].length, cells = [...document.querySelectorAll('#h12Table td.agnw3c')].map((c) => ({ k: c.getAttribute('data-win'), span: +c.getAttribute('rowspan'), mm: c.getAttribute('data-mm'), p: c.getAttribute('data-p') }));
    const bad = []; strip.forEach((c) => { if (+c.k.slice(11, 13) % 3) bad.push('strip start ' + c.k); const s = sumOf(c.k); if (String(s == null ? '' : s) !== c.mm) bad.push('strip mm ' + c.k + ' ' + c.mm + ' vs ' + s); });
    chance.forEach((c) => { if (c.p !== pOf(c.k)) bad.push('strip p ' + c.k + ' ' + c.p + ' vs ' + pOf(c.k)); });
    const h12 = cells.filter((c) => c.mm != null), h12p = cells.filter((c) => c.p != null);
    h12.forEach((c) => { if (+c.k.slice(11, 13) % 3) bad.push('12h start ' + c.k); const s = sumOf(c.k); if (String(s == null ? '' : s) !== c.mm) bad.push('12h mm ' + c.k + ' ' + c.mm + ' vs ' + s); });
    h12p.forEach((c) => { if (c.p !== pOf(c.k)) bad.push('12h p ' + c.k + ' ' + c.p + ' vs ' + pOf(c.k)); });
    return { n: strip.length, nc: chance.length, rows, spans: h12.reduce((a, c) => a + c.span, 0), nh12: h12.length, bad, head: (document.querySelector('#h12Table thead') || {}).textContent || '', note: (document.getElementById('hsChanceNote') || {}).textContent || '',
      key: B ? B.place && B.place.tehsil : null, name: B ? B.place && B.place.name : null, starts: strip.map((c) => c.k) }; });
  ok(S.n > 8 && S.nc > 8 && S.nh12 >= 4 && S.spans === S.rows && S.rows === 12 && !S.bad.length, 'R1 ' + tag + ': start strip and Next 12 hours give rain and its chance per 3-hour window, sums and chances as the bundle (' + S.n + ' strip windows, ' + S.nh12 + ' windows over ' + S.rows + ' rows)', JSON.stringify(S.bad.slice(0, 6)));
  const lab = (REG.rainChance && REG.rainChance.label) || 'screening';
  ok(S.head.includes('(' + lab + ')') && S.note.includes('(' + lab + ')') && !/Calibrated chance/i.test(S.head + S.note), 'C1 ' + tag + ': the start tables name the chance of rain "' + lab + '" (the register label)', S.head + ' | ' + S.note);
  /* G1 start: the map chip of each hazard */
  if (W === 1366) { const G = await pg.evaluate(async (L) => { const out = {}; for (const k of Object.keys(L)) { try { AGNSTART.setHz(k, 0); } catch (_) { continue; } await new Promise((r) => setTimeout(r, 2500)); const c = document.getElementById('hzChip');
        const wordsIn = (t) => ['Low', 'Moderate', 'High', 'Severe'].filter((w) => new RegExp('(^|[^a-z])' + w + '\\b').test(t));
        const lg = document.getElementById('hzLegend'), chip = c && !c.hidden ? c.textContent : '', up = !!(c && c.querySelector('i[style*="background"]'));
        out[k] = { menu: wordsIn(lg ? [...lg.querySelectorAll('span[style*="background:#"]')].map((x) => x.textContent).join(' ') : ''), chip: up ? wordsIn(chip.replace(/Not assessed[^·]*/g, '')) : null, txt: chip }; } AGNSTART.setHz(null, 0); return out; }, REG.layers);
    const bad = Object.entries(G).filter(([k, g]) => !g.menu.length || g.menu.some((w) => !REG.layers[k].classes.includes(w)) || g.menu.length !== REG.layers[k].classes.length
      || (g.chip && (g.chip.some((w) => !REG.layers[k].classes.includes(w)) || !g.txt.includes(REG.layers[k].alertLine)))).map(([k, g]) => k + ': menu ' + g.menu.join('/') + ' chip ' + (g.chip || []).join('/') + ' | ' + g.txt.slice(0, 160));
    const drawn = Object.values(G).filter((g) => g.chip).length;
    ok(Object.keys(G).length >= 6 && !bad.length, 'G1 ' + tag + ': the start map legend of each hazard holds only its register classes, the map chip also its alert line (' + Object.keys(G).length + ' hazards; ' + drawn + ' with levels drawn on this server)', bad.join(' || ')); }
  /* the hand-off */
  const tHand = Date.now();
  await Promise.all([pg.waitForURL(/analyst/, { timeout: 60000 }), pg.evaluate(() => document.getElementById('btnAnalyst').click())]);
  await pg.waitForTimeout(16000);
  const ap = log.filter((x) => x.t >= tHand).map((x) => x.u).filter((u) => PLACE.test(u)), apF = ap.filter((u) => !isComplete(u)), apC = ap.filter(isComplete);
  ok(apF.length === 0 && apC.length <= 1, 'H1 ' + tag + ': the analyst page keeps the start page\u2019s bundle: ' + apF.length + ' place request(s), ' + apC.length + ' completion read(s) (' + (ap.join(', ') || 'none') + ')');
  const TL = await pg.evaluate(() => window.__tl || []);
  const titles = [...new Set(TL.map((x) => x[1]).filter(Boolean))], first = TL.find((x) => x[2]);
  ok(titles.length && !titles.some((t) => S.key && t === S.key && t !== S.name) && titles.includes(S.name), 'H2 ' + tag + ': the left card is titled "' + S.name + '" while it loads, never the tehsil "' + S.key + '" (' + titles.join(' > ') + ')');
  ok(!!first && first[0] < 4000, 'H3 ' + tag + ': the left card holds a number ' + (first ? first[0] + ' ms' : 'never') + ' after the analyst page starts (< 4 s)');
  /* M1 · the time buttons and the peak line */
  await pg.waitForTimeout(3000);
  const M = await pg.evaluate(async () => { const b = document.querySelector('#v3days [data-basis="current"]'); const hz = AGN.hz5 && AGN.hz5.currentKey ? AGN.hz5.currentKey() : null;
    let exp = ''; if (hz && AGN.hz5.isHazardLayer(hz)) { const j = await (await fetch('/api/levels?layer=' + hz + '&day=0')).json(); const LV = j && j.ready !== false && !j.stale && j.levels; let top = 0, n = 0; if (LV) Object.values(LV).forEach((v) => { v = Number(v); if (!isFinite(v)) return; if (v > top) { top = v; n = 1; } else if (v === top && v > 0) n++; });
      exp = top > 0 ? 'Today\u2019s peak: ' + AGN.hz5.words[top] + ' in ' + n + ' tehsil' + (n === 1 ? '' : 's') : ''; }
    const e = document.getElementById('agnPeakLine'); return { cur: b && b.getAttribute('aria-pressed'), basis: AGN.day && AGN.day.basis(), hz, line: e ? e.textContent : null, exp }; });
  ok(M.cur === 'true' && M.basis === 'current' && M.line === M.exp, 'M1 ' + tag + ': the hazard map opens on Current and the line under the time buttons is "' + M.exp + '" from the issued levels (' + M.hz + ')', JSON.stringify(M));
  /* R1 · Next 24 hours */
  const N24 = await pg.evaluate(() => { const a = AGN.data && AGN.data.activePoint ? AGN.data.activePoint() : null, B = a ? AGN.pointState.peek(+a.lat, +a.lon) : null, H = (B && B.hours) || [], byT = {}; H.forEach((h) => { byT[h.time] = h; });
    const wm = {}; const w3 = B && B.parts && B.parts.poolHazard && B.parts.poolHazard.v && B.parts.poolHazard.v.windows3h; (w3 && w3.windows || []).forEach((r) => { wm[r.start] = r; });
    const sumOf = (k) => { const hs = [1, 2, 3].map((i) => byT[new Date(Date.parse(k + ':00Z') + i * 3600e3).toISOString().slice(0, 16)]); return hs.every((h) => h && h.rainMm != null) ? Math.round(10 * hs.reduce((x, h) => x + (+h.rainMm), 0)) / 10 : null; };
    const F = [...document.querySelectorAll('#hscroll .agnw3')].map((w) => { const f = w.querySelector('.agnw3f'); return { k: w.getAttribute('data-win'), n: w.querySelectorAll('.hcell').length, mm: f.getAttribute('data-mm'), p: f.getAttribute('data-p') }; });
    const bad = []; F.forEach((c) => { if (+c.k.slice(11, 13) % 3) bad.push('start ' + c.k); const s = sumOf(c.k); if (String(s == null ? '' : s) !== c.mm) bad.push('mm ' + c.k + ' ' + c.mm + ' vs ' + s); const r = wm[c.k]; const p = r && r.pRain != null ? String(Math.round(100 * r.pRain)) : ''; if (p !== c.p) bad.push('p ' + c.k + ' ' + c.p + ' vs ' + p); });
    return { n: F.length, hours: F.reduce((a, c) => a + c.n, 0), bad, pp: [...document.querySelectorAll('#hscroll .hcell .pp')].filter((x) => /%/.test(x.textContent)).length, note: (document.getElementById('agnProbNote') || {}).textContent || '' }; });
  ok(N24.n >= 3 && N24.hours >= 12 && !N24.bad.length && N24.pp === 0, 'R1 ' + tag + ': the Overview\u2019s Next 24 hours groups its hours in 3-hour windows with the window rain and chance (' + N24.n + ' windows, ' + N24.hours + ' hours; no hourly chance)', JSON.stringify(N24.bad.slice(0, 6)));
  ok(N24.note.includes('(' + lab + ')') && !/whose grid rain in the hour/.test(N24.note), 'C1 ' + tag + ': the Next 24 hours note names the window chance and the register label', N24.note.slice(0, 200));
  /* G1 · the analyst legends of every hazard the register lists */
  if (W !== 1037 || OP) {
    const G = await pg.evaluate(async (L) => { const s = document.getElementById('mapHazardPick'), out = {}; if (!s) return { none: 'no picker' };
      for (const k of Object.keys(L)) { if (![...s.options].some((o) => o.value === k)) continue; s.value = k; s.dispatchEvent(new Event('change', { bubbles: true }));
        let lg = null; for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 500)); lg = document.getElementById('v3legend'); if (lg && lg.getAttribute('data-hz5') === '1' && lg.getAttribute('data-hz5-layer') === k) break; }
        out[k] = { lv: [...lg.querySelectorAll('.agn-hz5-row')].map((r) => r.getAttribute('data-hz5-level')), txt: lg.textContent, loaded: lg.getAttribute('data-hz5') === '1' }; }
      return out; }, REG.layers);
    const bad = [], seen = [], wait = [];
    for (const [k, g] of Object.entries(G)) { if (!g || !g.loaded) { wait.push(k); continue; } seen.push(k); const want = ['Normal'].concat(REG.layers[k].classes);
      if (g.lv.length !== want.length || g.lv.some((w) => !want.includes(w))) bad.push(k + ': rows ' + g.lv.join('/') + ' want ' + want.join('/'));
      if (!g.txt.includes(REG.layers[k].alertLine)) bad.push(k + ': no alert line'); if (/not used on the UTCI/.test(g.txt)) bad.push(k + ': "not used" row'); }
    ok(seen.length >= 5 && !bad.length, 'G1 ' + tag + ': every hazard legend drawn holds only its register classes and its alert line (' + seen.join(', ') + (wait.length ? '; still loading on this server: ' + wait.join(', ') : '') + ')', bad.join(' || '));
  }
  /* P1 · a place popup at the top edge of the map */
  const P = await pg.evaluate(async () => { try { const mc = map.getContainer(), r = mc.getBoundingClientRect(); let props = null; const L0 = (typeof districtLayer !== 'undefined') ? districtLayer : null;
      if (L0) L0.eachLayer((l) => { if (!props && l.feature && l.feature.properties && l.feature.properties.key) props = l.feature.properties; });
      if (!props || !AGN.placePopup) return { skip: 'no place popup' };
      const ll = map.containerPointToLatLng([Math.round(r.width / 2), 6]); const pp = AGN.placePopup.open(props, ll, { allow: true });
      await new Promise((res) => setTimeout(res, 2500)); const el = pp && pp.getElement && pp.getElement(); if (!el) return { skip: 'no popup element' };
      const b = (el.querySelector('.leaflet-popup-content-wrapper') || el).getBoundingClientRect(), m = mc.getBoundingClientRect(); map.closePopup(pp);
      return { b: [b.left, b.top, b.right, b.bottom].map(Math.round), m: [m.left, m.top, m.right, m.bottom].map(Math.round) }; } catch (e) { return { err: String(e.message) }; } });
  ok(P.b && P.b[1] >= P.m[1] && P.b[3] <= P.m[3] && P.b[0] >= P.m[0] && P.b[2] <= P.m[2], 'P1 ' + tag + ': a place popup opened at the top edge of the map lies wholly inside it', JSON.stringify(P));
  /* S1 · the Forecast tab */
  await pg.evaluate(() => { const b = document.querySelector('#machNav [data-goto="livedata"], [data-goto="livedata"]'); if (b) b.click(); }); await pg.waitForTimeout(3000);
  const F = await pg.evaluate((starts) => { const h = document.getElementById('agnHsHost'); const ks = h ? [...h.querySelectorAll('#hsRain [data-win]')].map((c) => c.getAttribute('data-win')) : [];
    return { strip: !!(h && h.querySelector('.agnhs #hsBox #hStrip')), same: ks.filter((k) => starts.includes(k)).length, n: ks.length, comp: !!window.AGNHourStrip, h: h ? Math.round(h.getBoundingClientRect().height) : 0 }; }, S.starts);
  ok(F.strip && F.comp && F.n > 8 && F.same >= Math.min(8, F.n - 1) && F.h > 200, 'S1 ' + tag + ': the analyst Forecast tab holds the same hour-by-hour strip component (' + F.n + ' windows, ' + F.same + ' shared with the start drawer)', JSON.stringify(F));
  ok(!errs.length, 'P0 ' + tag + ': no page error', errs.slice(0, 4).join(' | '));
  await ctx.close();
}
await br.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
