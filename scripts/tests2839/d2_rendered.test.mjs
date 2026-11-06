// v91.17.283.9 · RENDERED display checks (Playwright, own server with the 12 Oct issue, deviceScaleFactor 1) at the laptop sizes
// 1536 x 864 (1920 at 125 %, the primary), 1366 x 768 and 1920 x 1080, operator and client views, and the start page.
//  R1 the map block (info bar + map + side panels) is one screen: scrolled to its snap point the info bar's top is the screen's top and the
//     map panel ends at the screen's bottom (within 4 px); no horizontal scroll; the info bar is one row (at most 46 px)
//  R2 the header and the tab row keep their size and nothing in them overlaps (flag, title, switch, freshness, place, avatar; the tabs)
//  R3 zoom 6: the hazard fill as issued; zoom 10: fading; zoom 13 and 15: no hazard fill, the street-zoom class, the selected tehsil outlined
//  R4 the pin: at the searched place, above every marker, with its name; moves to the next place; at street zoom it carries the level
//  R5 the side panels fold away and back with their buttons; the map takes the width; the choice is remembered after a reload
//  R6 the terrain shading: the Terrain layer is on and drawn at zoom 15 (tiles requested past the native zoom 12, opacity 0.45)
//  R7 the start page: the fill fades the same way (zoom 9 full, zoom 14 none), its pin is on top, the 30 m shading is drawn at zoom 14
// usage: node scripts/tests2839/d2_rendered.test.mjs [outdir]   (D2_SIZES=1536x864,... to narrow; D2_BASE=http://... a running server)
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import * as __T from '../lib/testenv.mjs';
import { TREE, ok, done } from './lib.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : null; if (OUT) mkdirSync(OUT, { recursive: true });
const free = () => new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
async function ownServer() {
  const F = JSON.parse(readFileSync(join(TREE, 'scripts', 'tests2838', 'fixtures', 'engine_ws8_2026-10-12.json'), 'utf8')); const t = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  F.received = new Date(Date.now() - 300e3).toISOString(); F.at = F.received; F.days.forEach((d) => { d.date = new Date(Date.parse(t) + d.day * 864e5).toISOString().slice(0, 10); });
  const { startServer } = await import(new URL('../tests283/ws4/serve.mjs', import.meta.url).href);
  return startServer(TREE, await free(), {}, { 'engine-latest.json': F });
}
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const S = process.env.D2_BASE ? { base: process.env.D2_BASE, stop() {} } : await ownServer(); const BASE = S.base;
const browser = await __T.launch(chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const SIZES = (process.env.D2_SIZES || '1536x864,1366x768,1920x1080').split(',').map((s) => s.split('x').map(Number));
const P1 = { name: 'Rawalpindi (near M2 motorway)', lat: 33.585, lon: 73.0 }, P2 = { name: 'Badin', lat: 24.655, lon: 68.837 };
const HEAD = '.view[data-view="overview"] > .agn-v91-story-head';
const wait = (pg, ms) => pg.waitForTimeout(ms);
const hit = (a, b) => a && b && a.w > 0 && b.w > 0 && a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1;
const shot = async (pg, name) => { if (OUT) await pg.screenshot({ path: join(OUT, name + '.png'), timeout: 90000 }).catch(() => {}); };
try {
  for (const [w, h] of SIZES) {
    const sz = w + 'x' + h;
    for (const view of ['operator', 'client']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
      await pg.addInitScript(() => { try { if (!sessionStorage.getItem('d2once')) { sessionStorage.setItem('d2once', '1'); localStorage.removeItem('agn.p2839.fold'); } } catch (_) {} });
      await pg.goto(BASE + '/analyst?operator=' + (view === 'operator' ? '1' : '0'), { waitUntil: 'domcontentloaded', timeout: 180000 });
      await pg.waitForFunction(() => window.AGN && AGN.flow && AGN.p2839 && window.map && document.getElementById('agnP2839Fit'), null, { timeout: 180000 }); await wait(pg, 6000);
      const tag = sz + ' ' + view;
      /* R2 · the header and the tabs */
      const H = await pg.evaluate(() => { const r = (e) => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
        const q = (s) => r(document.querySelector(s)); const hd = document.querySelector('header.topbar');
        const items = ['.brand .product .code', '#agnPkFlag', '#agn-switch', '#freshTxt', '#citysel', '#agnAccountBtn', '#agnConsoleMenu'].map((s) => [s, q(s)]).filter((x) => x[1]);
        const tabs = [...document.querySelectorAll('#machNav > button')].filter((b) => b.getClientRects().length).map((b) => [b.id || b.textContent.trim().slice(0, 20), r(b)]);
        const clipped = [...document.querySelectorAll('#machNav > button, header.topbar #agn-switch a')].filter((b) => b.getClientRects().length && b.scrollWidth > b.clientWidth + 2).map((b) => b.textContent.trim().slice(0, 30));
        return { header: r(hd), nav: q('#machNav'), items, tabs, clipped, vw: innerWidth }; });
      let ov = []; for (let i = 0; i < H.items.length; i++) for (let j = i + 1; j < H.items.length; j++) if (hit(H.items[i][1], H.items[j][1])) ov.push(H.items[i][0] + ' x ' + H.items[j][0]);
      for (let i = 0; i < H.tabs.length; i++) for (let j = i + 1; j < H.tabs.length; j++) if (hit(H.tabs[i][1], H.tabs[j][1])) ov.push(H.tabs[i][0] + ' x ' + H.tabs[j][0]);
      ok(!ov.length && H.items.every((x) => x[1].r <= H.vw + 0.5) && H.tabs.every((x) => x[1].r <= H.vw + 0.5), tag + ' · R2 nothing in the header or the tab row overlaps or leaves the screen', ov.join('; ') || 'ok');
      ok(H.header && H.header.h <= 56 && H.nav && H.nav.h <= 44, tag + ' · R2 the header and the tab row keep their size (header ' + Math.round(H.header && H.header.h) + ' px, tabs ' + Math.round(H.nav && H.nav.h) + ' px)');
      /* R1 · the map block */
      await pg.evaluate((s) => { document.querySelector(s).scrollIntoView({ block: 'start' }); }, HEAD); await wait(pg, 1500);
      const B = await pg.evaluate((s) => { const hd = document.querySelector(s).getBoundingClientRect(), mp = document.querySelector('.view[data-view="overview"] .mappanel').getBoundingClientRect();
        return { top: hd.top, hh: hd.height, bot: mp.bottom, vh: innerHeight, hs: document.documentElement.scrollWidth - document.documentElement.clientWidth, fit: document.getElementById('agnP2839Fit').getAttribute('aria-pressed') }; }, HEAD);
      ok(Math.abs(B.top) <= 1 && B.bot <= B.vh + 0.5 && B.bot >= B.vh - 4, tag + ' · R1 snapped: the map block fills the screen (top ' + Math.round(B.top) + ', bottom ' + Math.round(B.bot) + ' of ' + B.vh + ')');
      ok(B.hs <= 0 && B.hh <= 46, tag + ' · R1 no horizontal scroll; the info bar is one row (' + Math.round(B.hh) + ' px)', JSON.stringify(B));
      ok(B.fit === 'true', tag + ' · R1 the fit button shows the snapped state');
      await shot(pg, 'd2_' + sz + '_' + view + '_snapped');
      if (view === 'client') { ok(!errs.length, tag + ' · no page errors', errs.join(' | ')); await ctx.close(); continue; }
      /* the fit button scrolls back to the header and down again */
      await pg.click('#agnP2839Fit'); await wait(pg, 1500); const y1 = await pg.evaluate(() => scrollY); await pg.click('#agnP2839Fit'); await wait(pg, 1500);
      const y2 = await pg.evaluate((s) => Math.round(document.querySelector(s).getBoundingClientRect().top), HEAD);
      ok(y1 === 0 && Math.abs(y2) <= 1, tag + ' · R1 the fit button: header, then the map block again', y1 + ' / ' + y2);
      /* R3 R4 · a person's search and zoom */
      { const c = await pg.evaluate(() => { const r = map.getContainer().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await pg.mouse.move(c.x, c.y); await pg.mouse.wheel(0, -30); await wait(pg, 600); }
      const Z = async (z, P) => { await pg.evaluate(([P, z]) => { try { map.closePopup(); } catch (_) {} map.setView([P.lat, P.lon], z, { animate: false }); }, [P, z]); await wait(pg, 3500);
        return pg.evaluate(() => { const L0 = typeof districtLayer !== 'undefined' ? districtLayer : null; let mx = 0, n = 0, sel = 0; const uid = AGN.p2839.state().uid;   /* eslint-disable-line no-undef */
          if (L0) L0.eachLayer((l) => { const o = l.options || {}; n++; if (o.fillOpacity > mx) mx = o.fillOpacity; if (l.feature && l.feature.properties && l.feature.properties.uid === uid && (o.weight || 0) >= 1.3) sel++; });
          const pin = document.querySelector('.agn-p2839-pin'), pr = pin && pin.getBoundingClientRect(), mr = map.getContainer().getBoundingClientRect();
          const rank = (e) => { const pn = e.closest('.leaflet-pane'); return [+getComputedStyle(pn).zIndex || 0, +getComputedStyle(e).zIndex || 0]; };   /* pane first (a stacking context), then the marker */
          const me = pin ? rank(pin.closest('.leaflet-marker-icon')) : [0, 0], z = me[0] * 1e6 + me[1];
          const others = [...document.querySelectorAll('.leaflet-marker-icon')].filter((e) => !e.querySelector('.agn-p2839-pin')).map((e) => { const r = rank(e); return r[0] * 1e6 + r[1]; });
          const hill = [...document.querySelectorAll('.leaflet-agnhill-pane img')].map((i) => i.getAttribute('src') || '');
          let hop = null; map.eachLayer((l) => { if (l.options && l.options.pane === 'agnhill') hop = l.options.opacity; });
          return { zoom: map.getZoom(), fillMax: mx, n, sel, uid, street: document.documentElement.classList.contains('agn-p2839-street'),
            pin: pr ? { in: pr.left >= mr.left - 40 && pr.right <= mr.right + 40 && pr.top >= mr.top - 50 && pr.bottom <= mr.bottom + 50, name: ((pin.querySelector('.agn-p2839-lab') || {}).textContent || '').trim(), lv: ((pin.querySelector('.agn-p2839-lv') || {}).textContent || '').trim(), z: +z || 0, top: others.every((o) => o < (+z || 0)) } : null,
            hill: hill.length, hillZ12: hill.filter((s) => /\/tiles\/hillshade\/12\//.test(s)).length, hop, terrain: !!(AGN.terrain && AGN.terrain.on()) }; }); };
      await pg.evaluate((P) => AGN.flow.setActiveLocation({ name: P.name, lat: P.lat, lon: P.lon }, P.name, { src: 'search' }), P1); await wait(pg, 9000);
      const z6 = await Z(6, P1), z10 = await Z(10, P1), z13 = await Z(13, P1); await shot(pg, 'd2_' + sz + '_z13'); const z15 = await Z(15, P1); await shot(pg, 'd2_' + sz + '_z15');
      ok(z6.fillMax >= 0.85 && z6.n >= 500, tag + ' · R3 zoom 6: the hazard fill as issued (max ' + z6.fillMax + ')');
      ok(z10.fillMax > 0.2 && z10.fillMax < z6.fillMax * 0.7, tag + ' · R3 zoom 10: fading (max ' + z10.fillMax + ')');
      ok(z13.fillMax === 0 && z15.fillMax === 0 && z13.street && z15.street, tag + ' · R3 zoom 13 and 15: no hazard fill, the street map in its own colours', z13.fillMax + ' / ' + z15.fillMax);
      ok(z13.uid === 'Punjab|Rawalpindi|Rawalpindi' && z13.sel >= 1, tag + ' · R3 the selected tehsil is outlined at street zoom', z13.uid + ' ' + z13.sel);
      ok(z13.pin && z13.pin.in && z13.pin.name === P1.name && z13.pin.top, tag + ' · R4 the pin is at the place, above every marker, with the name', JSON.stringify(z13.pin));
      ok(z13.pin && /^Heat stress: (Normal|Low|Moderate|High|Severe) · Rawalpindi tehsil$/.test(z13.pin.lv) && z6.pin && !z6.pin.lv, tag + ' · R4 at street zoom the pin carries the tehsil level (not at zoom 6)', z13.pin && z13.pin.lv);
      ok(z15.terrain && z15.hill > 0 && z15.hillZ12 > 0 && z15.hop === 0.45 && z6.hop === 0.32, tag + ' · R6 terrain shading at zoom 15 (zoom-12 tiles enlarged, opacity 0.45; 0.32 at zoom 6)', JSON.stringify({ h: z15.hill, h12: z15.hillZ12, op: z15.hop, op6: z6.hop }));
      await pg.evaluate((P) => AGN.flow.setActiveLocation({ name: P.name, lat: P.lat, lon: P.lon }, P.name, { src: 'search' }), P2); await wait(pg, 6000);
      let zb = await Z(13, P2); if (!(zb.pin && zb.pin.in)) { await wait(pg, 4000); zb = await Z(13, P2); } ok(zb.pin && zb.pin.name === P2.name && zb.pin.in && zb.uid && zb.uid !== z13.uid, tag + ' · R4 a new place moves the pin and the outlined tehsil', JSON.stringify({ pin: zb.pin, uid: zb.uid }));
      /* R5 · fold the side panels */
      const W0 = await pg.evaluate(() => map.getContainer().getBoundingClientRect().width);
      await pg.click('#agnP2839FoldL'); await pg.click('#agnP2839FoldR'); await wait(pg, 1200);
      const F1 = await pg.evaluate(() => ({ w: map.getContainer().getBoundingClientRect().width, l: !!document.getElementById('mpLeft').getClientRects().length, r: !!document.getElementById('mpRight').getClientRects().length, st: localStorage.getItem('agn.p2839.fold') }));
      ok(F1.w > W0 + 300 && !F1.l && !F1.r && /"l":1/.test(F1.st) && /"r":1/.test(F1.st), tag + ' · R5 both panels folded: the map takes the width (' + Math.round(W0) + ' -> ' + Math.round(F1.w) + ' px), remembered', JSON.stringify(F1));
      await shot(pg, 'd2_' + sz + '_folded');
      await pg.reload({ waitUntil: 'domcontentloaded' }); await pg.waitForFunction(() => window.AGN && AGN.p2839 && document.getElementById('agnP2839FoldL'), null, { timeout: 180000 }); await wait(pg, 5000);
      const F2 = await pg.evaluate(() => ({ f: AGN.p2839.state().fold, l: !!document.getElementById('mpLeft').getClientRects().length }));
      ok(F2.f.l && F2.f.r && !F2.l, tag + ' · R5 after a reload the panels stay folded', JSON.stringify(F2));
      await pg.click('#agnP2839FoldL').catch(() => {}); await pg.click('#agnP2839FoldR').catch(() => {}); await wait(pg, 1200);
      const F3 = await pg.evaluate(() => ({ l: !!document.getElementById('mpLeft').getClientRects().length, r: !!document.getElementById('mpRight').getClientRects().length }));
      ok(F3.l && F3.r, tag + ' · R5 the buttons bring the panels back', JSON.stringify(F3));
      ok(!errs.length, tag + ' · no page errors', errs.join(' | ')); await ctx.close();
    }
    /* R7 · the start page */
    const sc = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }); const sp = await sc.newPage(); const serr = []; sp.on('pageerror', (e) => serr.push(String(e.message || e).slice(0, 200)));
    await sp.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 }); await sp.waitForFunction(() => window.AGNSTART && window.AGNSTART.select && window.map, null, { timeout: 120000 }); await wait(sp, 3000);
    await sp.evaluate((P) => window.AGNSTART.select({ lat: P.lat, lon: P.lon, name: P.name }), P1); await wait(sp, 5000);
    await sp.evaluate(() => { const t = document.getElementById('hzBtnTxt'); const b = t && t.closest('button'); if (b) b.click(); }); await wait(sp, 800);
    await sp.evaluate(() => { const b = document.querySelector('#hzOpts button[data-k="heat"]'); if (b) b.click(); }); await wait(sp, 7000);
    const SZ = async (z) => { await sp.evaluate(([P, z]) => map.setView([P.lat, P.lon], z, { animate: false }), [P1, z]); await wait(sp, 3000);
      return sp.evaluate(() => { const c = AGNSTART.hzRend && AGNSTART.hzRend._container; const pin = document.querySelector('.leaflet-marker-icon.pin');
        const rank = (e) => (+getComputedStyle(e.closest('.leaflet-pane')).zIndex || 0) * 1e6 + (+getComputedStyle(e).zIndex || 0); const me = pin ? rank(pin) : 0;
        const others = [...document.querySelectorAll('.leaflet-marker-icon')].filter((e) => e !== pin).map(rank);
        return { op: c ? c.style.opacity : null, disp: c ? c.style.display : null, layer: !!AGNSTART.hzLayer, pin: pin ? { z: me, top: others.every((o) => o < me), lab: (pin.innerText || '').trim() } : null,
          hill: !!(AGNSTART.hill30 && map.hasLayer(AGNSTART.hill30)), hillOp: map.getPane('agnHill30') ? map.getPane('agnHill30').style.opacity : null, hillImgs: document.querySelectorAll('.leaflet-agnHill30-pane img').length }; }); };
    const s9 = await SZ(9), s14 = await SZ(14); if (OUT) await sp.screenshot({ path: join(OUT, 'd2_' + sz + '_start_z14.png') }).catch(() => {});
    ok(s9.layer && s9.op === '1' && s14.op === '0' && s14.disp === 'none', sz + ' start · R7 the hazard fill: full at zoom 9, none at zoom 14', JSON.stringify([s9.op, s14.op, s14.disp]));
    ok(s14.pin && s14.pin.top && /Rawalpindi \(near M2 motorway\)/.test(s14.pin.lab) && /Heat stress: (Normal|Low|Moderate|High|Severe)/.test(s14.pin.lab), sz + ' start · R7 the pin is on top with the name and, at street zoom, the level', JSON.stringify(s14.pin));
    ok(s14.hill && s14.hillOp === '0.5' && s14.hillImgs > 0 && s9.hillOp === '0', sz + ' start · R7 the 30 m shading is drawn above the street map at zoom 14 (not at zoom 9)', JSON.stringify({ h: s14.hill, op: s14.hillOp, n: s14.hillImgs, op9: s9.hillOp }));
    ok(!serr.length, sz + ' start · no page errors', serr.join(' | ')); await sc.close();
  }
} finally { await browser.close(); S.stop(); }
done('D2-RENDERED-2839');
