import * as __T from '../lib/testenv.mjs';
// audit 6 · RENDERED-PAGE CONSISTENCY at 10 places. The hazard levels are the ones the page engine derived from the frozen inputs of the
// 12 Oct 2026 issue (fixtures/engine_ws8_2026-10-12.json, from the WS8 identity dump; not assigned by a hash), served by this tree's server.
// For each place the values ACTUALLY DISPLAYED are read from:
//   start page drawer (Hazards tab, today) · console analyst bar (heat colour title) · console left panel (heat tile, when drawn) ·
//   console right panel (level per hazard) · map popup (tehsil level of the map layer, and the tehsil's hazard list) · Forecast tab
//   (the hottest-hour heat class) · the site report (its "Levels served" table, today)
// and compared with the served answer (/api/levels/unit, client view) and with each other. They must agree, or differ only by a documented
// distinction, which must then be named on the surface:
//   POINT vs TEHSIL / HOUR vs DAY: the Forecast tab's hottest-hour class is the point's next-24-hour UTCI ("Hottest hour ... at this place"),
//   not the tehsil's day level; the map popup's page estimate (from the latest forecast) is named as such when it differs from the issued run.
// usage: node scripts/tests2838/a06_rendered.test.mjs [outdir]   (own server: ownServer(); A06_BASE=http://... uses a running fixture server)
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), TREE = process.env.T2838_TREE || join(HERE, '..', '..');
const OUT = process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : null;
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 900) : '')); } };
const free = () => new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
async function ownServer() {
  const F = JSON.parse(readFileSync(join(HERE, 'fixtures', 'engine_ws8_2026-10-12.json'), 'utf8')); const t = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  F.received = new Date(Date.now() - 300e3).toISOString(); F.at = F.received; F.days.forEach((d) => { d.date = new Date(Date.parse(t) + d.day * 864e5).toISOString().slice(0, 10); });
  const { startServer } = await import(new URL('../tests283/ws4/serve.mjs', import.meta.url).href);
  return startServer(TREE, Number(process.env.A06_PORT) || await free(), {}, { 'engine-latest.json': F });
}
const S = process.env.A06_BASE ? { base: process.env.A06_BASE, stop() {} } : await ownServer();
const BASE = S.base;
const A = JSON.parse(readFileSync(join(TREE, 'data', 'tehsil-anchor.json'), 'utf8')).units;
const UIDS = ['Sindh|Badin|Badin', 'Punjab|Bahawalpur|Ahmadpur East', 'Punjab|Khanewal|Kabirwala', 'Federal Capital|Islamabad|Islamabad', 'Khyber Pakhtunkhwa|Bajaur|Khar', 'Balochistan|Barkhan|Barkhan', 'Balochistan|Awaran|Jhal Jhao', 'Gilgit Baltistan|Diamir|Chilas', 'Azad Kashmir|Bhimber|Barnala', 'Azad Kashmir|Haveli|Haveli'];
const PLACES = UIDS.filter((u) => !process.env.A06_ONLY || process.env.A06_ONLY.split(',').some((x) => u.endsWith('|' + x))).map((u) => ({ uid: u, name: u.split('|')[2], lat: A[u].anchor.lat, lon: A[u].anchor.lon }));
const W5 = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
/* v91.17.283.9 · the laptop layout: the primary test size is 1536 x 864 (1920 at 125 %), deviceScaleFactor 1 (A06_VIEW=WxH overrides) */
const VIEWPORT = (() => { const m = /^(\d+)x(\d+)$/.exec(process.env.A06_VIEW || ''); return m ? { width: +m[1], height: +m[2] } : { width: 1536, height: 864 }; })();
const KEYS = { heat: /^heat stress/i, cold: /^cold stress/i, wind: /^wind/i, rain_hz: /^heavy rain/i, flood: /^(river )?flood/i, landslide: /^landslide/i, glof: /glacial lake|glof/i, drought: /^drought/i };
const keyOf = (label) => Object.keys(KEYS).find((k) => KEYS[k].test(String(label || '').trim())) || null;
const lvIn = (t) => { const m = /\b(Normal|Low|Moderate|High|Severe)\b/.exec(String(t || '')); return m ? m[1] : /not assessed|no data|outside|cannot occur|does not occur|not issued|no reading/i.test(String(t || '')) ? 'Not assessed' : null; };
const truthOf = async (uid) => { const r = await fetch(BASE + '/api/levels/unit?unit=' + encodeURIComponent(uid), { headers: { 'x-agn-view': 'customer' } }); const j = await r.json(); const d0 = (j.days || []).find((d) => d.day === 0);
  return d0 ? Object.fromEntries(Object.entries(d0.layers).map(([k, v]) => [k, { word: v.word, pt: v.productType, ood: !!v.outsideTestedDomain }])) : null; };

const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const rows = [];
try {
  /* ---- the start page drawer ---- */
  const sctx = await browser.newContext({ viewport: VIEWPORT }); const sp = await sctx.newPage(); const serr = []; sp.on('pageerror', (e) => serr.push(String(e.message || e).slice(0, 200)));
  await sp.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 }); await sp.waitForFunction(() => window.AGNSTART && window.AGNSTART.select && window.map, null, { timeout: 120000 });
  const START = {};
  for (const P of PLACES) {
    await sp.evaluate((P) => window.AGNSTART.select({ lat: P.lat, lon: P.lon, name: P.name }), P);
    await sp.waitForFunction(() => { const S = window.AGNSTART; return document.querySelector('#card[data-ready]') && S.data && S.data.lv && (S.data.lv.ok || S.data.st && S.data.st.lv !== 'load'); }, null, { timeout: 120000 }).catch(() => {});
    await sp.click('.tab[data-t="hz"]').catch(() => {}); await sp.waitForSelector('#hzTable', { timeout: 30000 }).catch(() => {});
    START[P.uid] = await sp.evaluate(() => Object.fromEntries([...document.querySelectorAll('#hzTable tbody tr[data-hz]')].map((tr) => [tr.getAttribute('data-hz'), ((tr.querySelector('td.mini') || {}).textContent || '').trim()])));
  }
  await sctx.close();
  /* ---- the console ---- */
  const ctx = await browser.newContext({ viewport: VIEWPORT }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
  await pg.addInitScript(() => { try { localStorage.removeItem('agn.operator.v1'); } catch (_) {} });
  await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await pg.waitForFunction(() => window.AGN && AGN.flow && AGN.flow.setActiveLocation && AGN.engineLevels && AGN.reports268 && window.map, null, { timeout: 180000 });
  for (const P of PLACES) {
    const T = await truthOf(P.uid);
    await pg.evaluate(async (P) => { try { window.map.closePopup(); } catch (_) {} for (let i = 0; i < 25; i++) { const E = await AGN.engineLevels.get(P.uid); if (E && E.days) break; await new Promise((r) => setTimeout(r, 2000)); }
      AGN.flow.setActiveLocation({ name: P.name, lat: P.lat, lon: P.lon }, P.name, { src: 'search' }); }, P).catch(() => {});
    await pg.waitForFunction((n) => { const R = document.getElementById('mpRightIn'); return R && R.querySelector('.agn-mps-r') && (R.innerText || '').indexOf(n) >= 0; }, P.name, { timeout: 60000 }).catch(() => {});
    await pg.waitForTimeout(2500);
    /* the panel is drawn first and redrawn when the served run for the place arrives: wait (up to 30 s) until it settles (the same text
       over 3 s) and its heat row shows the served word; if it never does, the comparison below fails */
    for (let k = 0, prev = null; k < 20; k++) { const cur = await pg.evaluate(() => (document.getElementById('mpRightIn') || {}).innerText || '');
      const heatOk = !T || !T.heat || ['Normal', 'Not assessed'].includes(T.heat.word) || new RegExp('Heat stress[^\\n]*\\n?[^\\n]*' + T.heat.word).test(cur) || cur.indexOf(T.heat.word) >= 0;
      if (cur === prev && heatOk) break; prev = cur; await pg.waitForTimeout(1500); }
    const C = await pg.evaluate(() => ({ right: [...document.querySelectorAll('#mpRightIn .agn-mps-r')].map((r) => ({ n: ((r.querySelector('.n') || {}).textContent || '').trim(), w: ((r.querySelector('.bw') || {}).textContent || '').trim(), tag: ((r.querySelector('.v283-ind') || {}).textContent || '').trim() })),
      na: [...document.querySelectorAll('#mpRightIn .v283-na, #mpRightIn .agn-mps-na')].map((x) => x.textContent), bar: (document.querySelector('#agnLive84 .t') || {}).title || '',
      tile: [...document.querySelectorAll('#mpLeftIn .v283-tilesrc')].map((x) => x.textContent) }));
    /* v91.17.283.9 · the selected-place pin: at the place, with its name; at street zoom (no hazard fill) it carries the level of the map layer
       for the place's tehsil, which must be the served level (the eighth surface) */
    { const pin = await pg.evaluate(() => ((document.querySelector('.agn-p2839-pin .agn-p2839-lab') || {}).textContent || '').trim());
      ok(pin.indexOf(P.name) >= 0, P.name + ' · the place pin carries the place name', pin);
      await pg.evaluate((P) => { window.map.setView([P.lat, P.lon], 13, { animate: false }); }, P); await pg.waitForTimeout(2500);
      const lv = await pg.evaluate(() => { try { AGN.p2839.pin(); } catch (_) {} return ((document.querySelector('.agn-p2839-pin .agn-p2839-lv') || {}).textContent || '').trim(); });
      const want = T && T.heat ? T.heat.word : null;
      if (want && W5.includes(want)) ok(new RegExp('^Heat stress: ' + want + '\\b').test(lv), P.name + ' · street-zoom pin level = served heat level (' + want + ')', lv);
      else ok(!lv || /^Heat stress: /.test(lv), P.name + ' · street-zoom pin level (served ' + want + ')', lv); }
    /* the map popup at the place (the map layer is heat stress by default) */
    const pt = await pg.evaluate((P) => { const m = window.map; m.setView([P.lat, P.lon], Math.max(m.getZoom(), 8), { animate: false }); const p = m.latLngToContainerPoint([P.lat, P.lon]); const r = m.getContainer().getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, P);
    await pg.mouse.click(pt.x, pt.y); await pg.waitForFunction(() => { const p = document.querySelector('.leaflet-popup-content'); return p && /Tehsil level: <b[^>]*>(?!loading)/i.test(p.innerHTML) && /Hazard levels of/.test(p.innerText); }, null, { timeout: 30000 }).catch(() => {});
    const POP = await pg.evaluate(() => { const p = document.querySelector('.leaflet-popup-content'); return p ? { html: p.innerHTML, text: p.innerText } : null; });
    /* the Forecast tab */
    await pg.click('[data-goto="livedata"]').catch(() => {}); await pg.waitForFunction(() => /Hottest hour/.test((document.querySelector('.view[data-view="livedata"]') || {}).innerText || ''), null, { timeout: 30000 }).catch(() => {});
    const FC = await pg.evaluate(() => { const t = (document.querySelector('.view[data-view="livedata"]') || {}).innerText || ''; const m = /Hottest hour[^\n]*?\(level (Normal|Low|Moderate|High|Severe)\)/.exec(t); return { line: m ? m[0] : null, level: m ? m[1] : null }; });
    await pg.click('[data-goto="overview"]').catch(() => {});
    /* the site report: its "Levels served" table */
    await pg.evaluate(() => { window.print = function () {}; AGN.reports268.open('site', null); });
    await pg.waitForFunction(() => /Levels served for/.test((document.querySelector('.rk-overlay') || document.body).innerText || ''), null, { timeout: 90000 }).catch(() => {});
    const REP = await pg.evaluate(() => { const o = document.querySelector('.rk-overlay') || document.body; const h3 = [...o.querySelectorAll('h3')].find((x) => /Levels served for/.test(x.textContent)); const tb = h3 && h3.nextElementSibling && h3.nextElementSibling.querySelector ? (h3.nextElementSibling.matches('table') ? h3.nextElementSibling : h3.nextElementSibling.querySelector('table')) : null;
      const out = {}; if (tb) [...tb.querySelectorAll('tbody tr')].forEach((tr) => { const c = [...tr.children]; if (c.length > 1) out[c[0].innerText.split('\n')[0].trim()] = c[1].innerText.trim(); }); return { title: h3 ? h3.textContent : null, rows: out }; });
    await pg.evaluate(() => { const b = [...document.querySelectorAll('.rk-overlay button, .rk-reader button')].find((x) => /close|back|×/i.test(x.textContent || x.getAttribute('aria-label') || '')); if (b) b.click(); const o = document.querySelector('.rk-overlay'); if (o) o.remove(); });
    rows.push({ P, T, START: START[P.uid], C, POP, FC, REP });
  }
  const V = (P) => P.name + ': ';
  for (const R of rows) { const { P, T } = R; if (!T) { ok(false, V(P) + 'served levels read', 'no answer'); continue; }
    const heat = T.heat ? T.heat.word : null;
    /* start drawer */
    const sd = R.START || {}; const sdiff = Object.keys(KEYS).filter((k) => T[k] && sd[k] != null && lvIn(sd[k]) !== (T[k].word === 'Not assessed' ? 'Not assessed' : T[k].word));
    ok(Object.keys(sd).length >= 6 && !sdiff.length, V(P) + 'start drawer (Hazards, today) = served, per hazard', JSON.stringify(sdiff.map((k) => [k, sd[k], T[k].word])) + ' ' + JSON.stringify(sd).slice(0, 200));
    /* right panel: every row's word = served; an Indicative level carries its tag (and "outside the tested domain" when the server says so) */
    const rdiff = R.C.right.map((r) => ({ k: keyOf(r.n), r })).filter((x) => x.k && T[x.k] && lvIn(x.r.w) !== T[x.k].word);
    const rtag = R.C.right.map((r) => ({ k: keyOf(r.n), r })).filter((x) => x.k && T[x.k] && W5.indexOf(T[x.k].word) > 0 && ((T[x.k].pt === 'Indicative') !== /Indicative/.test(x.r.tag) || (T[x.k].ood && !/outside the tested domain/.test(x.r.tag))));
    ok(R.C.right.length > 0 && !rdiff.length && !rtag.length, V(P) + 'console right panel = served (words and product-type tags)', JSON.stringify({ rdiff: rdiff.map((x) => [x.k, x.r.w, T[x.k].word]), rtag: rtag.map((x) => [x.k, x.r.tag, T[x.k].pt, T[x.k].ood]) }));
    /* analyst bar */
    const bar = /issued run \((Normal|Low|Moderate|High|Severe)/.exec(R.C.bar); ok(heat === 'Not assessed' ? !bar : bar && bar[1] === heat, V(P) + 'analyst bar heat colour = served heat', R.C.bar);
    /* left panel heat tile (drawn when the day's parameters are loaded) */
    const tile = R.C.tile.map((t) => /Issued run: (Normal|Low|Moderate|High|Severe)/.exec(t)).filter(Boolean)[0];
    ok(!tile || tile[1] === heat, V(P) + 'left panel heat tile = served heat' + (tile ? '' : ' (tile not drawn: daily parameters not loaded)'), JSON.stringify(R.C.tile));
    /* map popup */
    const pl = R.POP && /Tehsil level: <b[^>]*>([^<]*)<\/b>/.exec(R.POP.html); const plv = pl ? lvIn(pl[1]) : null;
    const plist = R.POP ? (R.POP.text.split('Hazard levels of')[1] || '') : '';
    const pdiff = Object.keys(KEYS).filter((k) => T[k] && W5.indexOf(T[k].word) > 0 && !(new RegExp(KEYS[k].source.replace(/^\^/, ''), 'i').test(plist) && plist.includes(T[k].word)));
    const est = R.POP && /This page’s estimate from the latest forecast reads/.test(R.POP.text);
    ok(R.POP && plv === heat && !pdiff.length, V(P) + 'map popup: tehsil level of the map layer = served heat; the hazard list = served', JSON.stringify({ popup: pl && pl[1], heat, pdiff }));
    ok(!R.POP || !/Tehsil level: <b[^>]*>(Normal|Low|Moderate|High|Severe)(?! \(issued run\))/.test(R.POP.html) || false, V(P) + 'map popup: the tehsil level is labelled as the issued run', (pl && pl[1]) || '');
    if (R.POP && /estimate/.test(R.POP.text)) ok(est, V(P) + 'map popup: a page estimate that differs is named as such (documented distinction)');
    /* Forecast tab: the point's hottest hour (a documented distinction: point, next 24 h, hour) */
    ok(!R.FC.level || (R.FC.level === heat) || /Hottest hour .* in shade/.test(R.FC.line), V(P) + 'Forecast tab: the hottest-hour class ' + (R.FC.level === heat ? '= served heat' : 'differs and is named as the point\'s hottest hour (point vs tehsil, hour vs day)'), R.FC.line || 'no hottest-hour line');
    /* the site report's table */
    const rep = R.REP.rows || {}; const rkeys = Object.keys(rep).map((n) => ({ k: keyOf(n), n })).filter((x) => x.k && T[x.k]);
    const repDiff = rkeys.filter((x) => lvIn(rep[x.n]) !== T[x.k].word);
    ok(rkeys.length >= 4 && !repDiff.length, V(P) + 'site report "Levels served" (today) = served', JSON.stringify(repDiff.map((x) => [x.k, rep[x.n], T[x.k].word])) + ' ' + JSON.stringify(rep).slice(0, 200));
  }
  /* across surfaces: every pair agrees on heat today (the start drawer, right panel, bar, popup, report) */
  const cross = rows.filter((R) => R.T && R.T.heat).map((R) => { const h = R.T.heat.word; const vals = { start: lvIn((R.START || {}).heat), right: lvIn((R.C.right.find((r) => keyOf(r.n) === 'heat') || {}).w) || (h === 'Normal' || h === 'Not assessed' ? h : null), popup: R.POP ? lvIn((/Tehsil level: <b[^>]*>([^<]*)<\/b>/.exec(R.POP.html) || [])[1]) : null, report: lvIn(Object.entries(R.REP.rows || {}).find(([n]) => keyOf(n) === 'heat')?.[1]) };
    return { place: R.P.name, served: h, ...vals, agree: Object.values(vals).every((v) => v == null || v === h) }; });
  ok(cross.length === 10 && cross.every((x) => x.agree), 'all 10 places: heat today agrees on every surface that shows it', JSON.stringify(cross.filter((x) => !x.agree)));
  ok(!errs.length, 'no page errors in the console', JSON.stringify(errs.slice(0, 3)));
  if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, 'a06_rendered.json'), JSON.stringify(rows.map((R) => ({ place: R.P.name, served: R.T, start: R.START, right: R.C.right, bar: R.C.bar, tile: R.C.tile, popup: R.POP && R.POP.text, popupHtml: R.POP && R.POP.html, forecast: R.FC, report: R.REP })), null, 1)); }
} finally { await browser.close(); S.stop(); }
console.log(`\nA06-RENDERED ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
