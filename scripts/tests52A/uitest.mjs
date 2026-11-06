#!/usr/bin/env node
/* v91.17.283.52 set A · page interaction checks (one Chromium, closed at the end): analyst (customer + operator), start page, Customize.
   usage: node uitest.mjs <base> <shotsdir> [only=a,b] */
import { mkdirSync, writeFileSync } from 'node:fs';
const T = await import('../lib/testenv.mjs'); const PW = T.playwrightSync();
const B = process.argv[2] || 'http://127.0.0.1:8941', O = process.argv[3] || '/dev/shm/s52A/ui'; mkdirSync(O, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean); const want = (k) => !only.length || only.includes(k);
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=700'] });
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else fail++; out.push((c ? 'ok   ' : 'FAIL ') + m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
async function ctxFor(op) { const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((o) => { try { localStorage.setItem('agn.operator', o ? '1' : '0'); localStorage.setItem('agn.operator.v2', o ? '1' : '0'); } catch (_) {}
    window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.sample || '').slice(0, 80))); }, op); return ctx; }
async function pick(pg, v) { try { await pg.selectOption('#mapHazardPick', v, { timeout: 5000 }); } catch (_) { await pg.evaluate((x) => { const e = document.getElementById('mapHazardPick'); e.value = x; e.dispatchEvent(new Event('change', { bubbles: true })); }, v); } }
const HASH = '#agnplace=33.6736,73.0768,I-8/3';
async function analyst(op) { const ctx = await ctxFor(op); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(B + '/analyst' + HASH, { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.AGN && AGN.v52A && AGN.v52Aui && typeof districtLayer !== 'undefined', null, { timeout: 120000 }); await pg.waitForTimeout(9000);
  const V = op ? 'operator' : 'customer';
  const place0 = await pg.evaluate(() => { try { const p = AGN.data.activePoint(); return p ? [+p.lat.toFixed(4), +p.lon.toFixed(4), p.name || p.label || ''] : null; } catch (_) { return null; } });
  if (want('n12')) {
    await pick(pg, 'seismic'); await pg.waitForTimeout(4000);
    const s1 = await pg.evaluate(() => (document.getElementById('agn242Leg') || {}).textContent || '');
    await pick(pg, 'flood'); await pg.waitForTimeout(4000);
    const s2 = await pg.evaluate(() => (document.getElementById('agn242Leg') || {}).textContent || '');
    ok(/Zone/.test(s1) && !/Zone/.test(s2) && /Normal/.test(s2), V + ' N12 strip under the map follows the layer: seismic "' + s1.slice(0, 40) + '" -> flood "' + s2.slice(0, 40) + '"');
    await pick(pg, 'nss_baseline'); await pg.waitForTimeout(3500);
    const r1 = await pg.evaluate(() => document.getElementById('mpMapWrap').classList.contains('agn-sponge250') && !!map.getPane('agnsponge') && map.getPane('agnsponge').children.length > 0);
    await pick(pg, 'heat'); await pg.waitForTimeout(400);
    const r2 = await pg.evaluate(() => ({ cls: document.getElementById('mpMapWrap').classList.contains('agn-sponge250'), tiles: [...document.querySelectorAll('.leaflet-agnsponge-pane img')].filter((i) => i.offsetParent).length, note: (document.getElementById('agnSpongeNote') || {}).style ? document.getElementById('agnSpongeNote').style.display : '' }));
    ok(r1 && !r2.cls && r2.tiles === 0 && r2.note !== 'block', V + ' N12 sponge raster and its note leave with the layer within 0.4 s (on: ' + r1 + ', after: ' + JSON.stringify(r2) + ')');
    await pg.screenshot({ path: O + '/' + V + '_n12_heat_after_sponge.png' });
  }
  if (want('p1')) {   /* the chooser is the layer: a silent write to the chooser re-applies the layer; AQI -> heat via other code paths */
    await pick(pg, 'aqi'); await pg.waitForTimeout(3000);
    await pg.evaluate(() => { document.getElementById('mapHazardPick').value = 'heat'; }); await pg.waitForTimeout(3500);
    const st = await pg.evaluate(() => ({ ml: window.mapLayer, aq: districtAqiMode, hm: districtHazardMode, k: AGN.v52A.layerKey(), c: AGN.v52A.paintedCounts().c }));
    const h = await pg.evaluate(async () => (await (await fetch('/api/levels?layer=heat&day=0', { headers: { 'x-agn-view': document.documentElement.classList.contains('agn-operator') ? 'operator' : 'customer' } })).json()).counts);
    const map = { '116,196,118': 0, '255,230,128': 1, '253,174,97': 2, '232,85,45': 3, '165,0,38': 4 }; const pc = [0, 0, 0, 0, 0]; for (const [k, n] of Object.entries(st.c)) if (map[k] != null) pc[map[k]] += n;
    ok(st.ml === 'heat' && !st.aq && st.hm && JSON.stringify(pc) === JSON.stringify(h), V + ' P1 a silent chooser write (AQI -> heat, no change event) repaints heat: painted ' + JSON.stringify(pc) + ' served ' + JSON.stringify(h));
    await pg.screenshot({ path: O + '/' + V + '_p1_heat_after_aqi.png' });
  }
  if (want('n24')) {
    await pick(pg, 'heat'); await pg.evaluate(() => window.scrollTo(0, 0));
    const box = await pg.evaluate(() => { const r = map.getContainer().getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await pg.mouse.click(box[0], box[1]); await pg.waitForTimeout(2500);
    const has = await pg.evaluate(() => !!document.querySelector('.leaflet-popup-content'));
    if (has) { const pr = await pg.evaluate(() => { const r = document.querySelector('.leaflet-popup-content').getBoundingClientRect(); return [r.left + r.width / 2, r.top + Math.min(40, r.height / 2)]; });
      const y0 = await pg.evaluate(() => window.scrollY); await pg.mouse.move(pr[0], pr[1]); for (let i = 0; i < 8; i++) { await pg.mouse.wheel(0, 300); await pg.waitForTimeout(80); }
      const y1 = await pg.evaluate(() => window.scrollY); ok(y1 === y0, V + ' N24 wheel inside the map popup does not scroll the page (scrollY ' + y0 + ' -> ' + y1 + ')'); }
    else ok(false, V + ' N24 no popup opened at the map centre');
    await pg.keyboard.press('Escape');
  }
  if (want('n13') || want('n23') || want('sh')) {
    await pg.evaluate(() => { const t = document.getElementById('agn-tab-livedata'); if (t) t.click(); }); await pg.waitForTimeout(6000);
    const wk = await pg.evaluate(() => { const b = document.querySelector('.ol-tabs [data-in="weeks"]'); return b ? b.textContent : null; });
    if (want('n23')) ok(wk === 'Weeks 1–6', V + ' N23 weeks tab label: ' + wk);
    if (want('n23') && wk) { await pg.click('.agn-hzbar87 [data-hz87="season"]'); await pg.waitForTimeout(1500); await pg.click('.ol-tabs [data-in="weeks"]'); await pg.waitForTimeout(1200);
      const on = await pg.evaluate(() => { const b = document.querySelector('.agn-hzbar87 .on'); return b ? b.getAttribute('data-hz87') : null; });
      ok(on === 'w26', V + ' N23 jump bar follows the weeks tab after Season was pressed (on: ' + on + ')'); await pg.screenshot({ path: O + '/' + V + '_n23_weeks.png' }); }
    if (want('sh')) { await pg.waitForTimeout(4000);
      const r = await pg.evaluate(() => { const b = document.getElementById('v2833Ec'), t = document.getElementById('v52aShTabs'); const vis = (e) => !!(e && e.offsetParent && getComputedStyle(e).display !== 'none');
        let wn = null; if (t && vis(t)) { t.querySelector('[data-sh="wn"]').click(); const w = document.getElementById('v52aShWn'); wn = w ? w.textContent.slice(0, 400) : null; }
        const ec = (document.getElementById('v52aShEcScore') || {}).textContent || ''; const best = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /Best daytime window/.test(e.textContent)).length;
        const bw = (document.body.innerText.match(/Best daytime window[^\n]*\n?[^\n]*/) || [''])[0];
        return { panel: vis(b), tabs: vis(t), wn, ec: ec.slice(0, 200), bw: bw.slice(0, 160) }; });
      if (!op) ok(!r.panel && !r.tabs, V + ' shadow panel (ECMWF 9 km / WeatherNext 3) is not shown in the customer view (' + JSON.stringify(r).slice(0, 120) + ')');
      else { ok(r.panel && r.tabs && /no point values for this place/.test(r.wn || '') && /Score/.test(r.wn || ''), V + ' shadow panel: ECMWF 9 km and WeatherNext 3 tabs, WN3 score line and "no point values" (' + (r.wn || '').slice(0, 160) + ')');
        ok(/ECMWF 9 km better than WeatherNext 3 in \d+ of \d+/.test(r.ec), V + ' shadow panel: ECMWF score line (' + r.ec.slice(0, 120) + ')'); await pg.screenshot({ path: O + '/' + V + '_shadow_wn3.png' }); }
      if (r.bw) ok(!/\(\+1 h\)/.test(r.bw) && /no heat stress|No daylight hour/.test(r.bw), V + ' best daytime window wording: ' + r.bw.replace(/\s+/g, ' ')); }
    if (want('n13')) { const z = await pg.$('button[data-v52a-z85]');
      if (z) { const t0 = await z.textContent(); await z.click(); await pg.waitForTimeout(300); const t1 = await z.textContent(); ok(t0 !== t1 && /only the events/.test(t1), V + ' N13 "Show all events" works (' + t1 + ')'); }
      else ok(await pg.evaluate(() => !document.querySelector('.ol-z85-btn[onclick]')), V + ' N13 no inline onclick left (the outlook box is not drawn for this place)'); }
  }
  if (want('n11') || want('n25')) {
    await pg.evaluate(() => { const t = document.getElementById('agn-tab-assessments'); if (t) t.click(); }); await pg.waitForTimeout(3000);
    if (want('n11')) { const hasS = await pg.evaluate(() => { const b = document.getElementById('agnV9116Sample'); if (b) b.click(); return !!b; }); await pg.waitForTimeout(3000); out.push('sample loaded: ' + hasS);
      const n = await pg.evaluate(() => (AGN.portfolio && AGN.portfolio.rows ? AGN.portfolio.rows() : []).filter((r) => isFinite(+r.latitude) && isFinite(+r.longitude) && +r.latitude !== 0).length);
      const before = await pg.evaluate(() => { try { const p = AGN.data.activePoint(); return p ? [+p.lat.toFixed(4), +p.lon.toFixed(4)] : null; } catch (_) { return null; } });
      await pg.evaluate(() => document.getElementById('asmtPortMap51').click()); await pg.waitForTimeout(3000);
      const r = await pg.evaluate(() => ({ m: document.querySelectorAll('.v52a-site').length, p: (() => { try { const p = AGN.data.activePoint(); return p ? [+p.lat.toFixed(4), +p.lon.toFixed(4)] : null; } catch (_) { return null; } })(), note: (document.getElementById('asmtPortNote51') || {}).textContent || '' }));
      ok(n > 1 && r.m === n, V + ' N11 every site with a coordinate is on the map: ' + r.m + ' markers for ' + n + ' sites (' + r.note.slice(0, 80) + ')');
      ok(JSON.stringify(before) === JSON.stringify(r.p), V + ' N11 "show on map" does not change the selected place (' + JSON.stringify(before) + ' -> ' + JSON.stringify(r.p) + ')');
      ok(JSON.stringify(place0) === JSON.stringify(r.p ? [r.p[0], r.p[1], place0 && place0[2]] : null) || (place0 && r.p && place0[0] === r.p[0] && place0[1] === r.p[1]), V + ' N11 the selected place after loading the sample and showing the sites is still the page place (' + JSON.stringify(place0) + ' -> ' + JSON.stringify(r.p) + ')');
      await pg.screenshot({ path: O + '/' + V + '_n11_sites.png' }); }
    if (want('n25')) { await pg.evaluate(() => { const a = document.getElementById('asmtAsset'); a.value = 'hospital'; a.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('asmtRun').click(); }); await pg.waitForTimeout(6000);
      const a = await pg.evaluate(() => ({ v: document.getElementById('asmtAsset').value, note: (document.getElementById('asmtSummaryNote') || {}).textContent || '' }));
      ok(a.v === 'hospital', V + ' N25 the picked asset type stays Hospital after Run (' + a.v + '; ' + a.note.slice(0, 90) + ')'); }
  }
  const csp = await pg.evaluate(() => window.__csp || []); ok(csp.length === 0, V + ' analyst: no CSP violation in the session (' + csp.length + ': ' + csp.slice(0, 3).join(' | ') + ')');
  ok(errs.length === 0, V + ' analyst: no page error (' + errs.slice(0, 3).join(' | ') + ')');
  await ctx.close(); }
async function start(hash) { const ctx = await ctxFor(false); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(B + '/' + (hash || ''), { waitUntil: 'load', timeout: 120000 }); await pg.waitForTimeout(hash ? 12000 : 6000);
  if (want('s6')) { const r = await pg.evaluate(() => { const s = document.querySelector('#nvDays [data-d="1"]'); if (!s) return null; const b = s.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const e = document.elementFromPoint(x, y); return { x, y, hit: e ? (e.id || e.className || e.tagName) + '' : null, inside: !!(e && s.contains(e)) }; });
    if (r) { await pg.mouse.click(r.x, r.y); await pg.waitForTimeout(1500); const on = await pg.evaluate(() => { const s = document.querySelector('#nvDays .on'); return s ? s.getAttribute('data-d') : null; });
      ok(on === '1', 'start' + (hash ? ' (place card open)' : '') + ' #6 clicking the "Tomorrow" label selects day 1 (top element there: ' + r.hit + ', on=' + on + ')'); } else ok(false, 'start #6 no day labels'); }
  if (!hash && want('s92')) { const inp = await pg.$('#q, input[type=search], #sq'); if (inp) { await inp.click(); await inp.type('Laho', { delay: 80 }); await pg.waitForTimeout(16000);
      const r = await pg.evaluate(() => { const L = [...document.querySelectorAll('#sr li, #sr [role=option], #sr button, #sr a')].filter((e) => e.offsetParent); return L.slice(0, 6).map((e) => { const b = e.getBoundingClientRect(); const t = document.elementFromPoint(b.left + 20, b.top + b.height / 2); return !!(t && (e === t || e.contains(t))); }); });
      ok(r.length > 0 && r.every(Boolean), 'start #92 every visible suggestion is on top (clickable): ' + JSON.stringify(r)); await pg.screenshot({ path: O + '/start_92_suggestions.png' }); await pg.keyboard.press('Escape'); } else ok(false, 'start #92 no search box'); }
  ok(errs.length === 0, 'start: no page error (' + errs.slice(0, 3).join(' | ') + ')');
  const csp = await pg.evaluate(() => window.__csp || []); ok(csp.length === 0, 'start: no CSP violation (' + csp.length + ')');
  await ctx.close(); }
async function startReport() { const ctx = await ctxFor(false); const pg = await ctx.newPage();
  await pg.goto(B + '/#agnplace=33.7233,73.0435,E-7', { waitUntil: 'load', timeout: 120000 }); await pg.waitForTimeout(8000);
  await pg.waitForFunction(() => !!document.getElementById('tab_report'), null, { timeout: 60000 }).catch(() => {}); await pg.evaluate(() => { const t = document.getElementById('tab_report'); if (t) t.click(); }); await pg.waitForTimeout(1500);
  const b = await pg.$('#rep50Make'); if (!b) { ok(false, 'start N19 no Make report button'); await ctx.close(); return; }
  const st = await pg.evaluate(() => { const e = document.getElementById('rep50Make'), c = getComputedStyle(e); return c.backgroundColor + ' ' + c.color; });
  ok(/44, 132, 83/.test(st), 'start N19 Make report is styled (' + st + ')');
  await pg.evaluate(() => document.getElementById('rep50Make').click()); const t0 = Date.now(); let ready = false; while (Date.now() - t0 < 90000) { await pg.waitForTimeout(1000); ready = await pg.evaluate(() => { const f = document.getElementById('rep50Frame'); return !!(f && !f.hidden && f.getAttribute('src')); }); if (ready) break; }
  const stx = await pg.evaluate(() => ((document.getElementById('rep50St') || {}).textContent || '') + ' | button: ' + ((document.getElementById('rep50Make') || {}).textContent || '') + (document.getElementById('rep50Make') && document.getElementById('rep50Make').disabled ? ' (disabled)' : ''));
  ok(ready, 'start N19 one press of Make report shows the report (' + Math.round((Date.now() - t0) / 1000) + ' s; ' + stx.slice(0, 160) + ')'); await pg.screenshot({ path: O + '/start_n19_report.png' }); await ctx.close(); }
async function cust() { const ctx = await ctxFor(false); const pg = await ctx.newPage();
  await pg.goto(B + '/customize', { waitUntil: 'load', timeout: 120000 }); await pg.waitForTimeout(8000);
  const r = await pg.evaluate(() => { try { const SS = (window.NIGRAAN3 && NIGRAAN3.state) || S; const cnt = {}; (SS.sites || []).forEach((x) => { cnt[x.sector] = (cnt[x.sector] || 0) + 1; }); return { sector: SS.sector, cnt }; } catch (e) { return { err: String(e) }; } });
  const top = r.cnt ? Object.entries(r.cnt).sort((a, b) => b[1] - a[1])[0] : null;
  ok(top && (r.sector === top[0] || r.cnt[r.sector] === top[1]), 'customize N26 the sector opens on the client\'s main sector (' + JSON.stringify(r) + ')'); await ctx.close(); }
if (['n12', 'p1', 'n24', 'n13', 'n23', 'n11', 'n25', 'sh'].some(want)) { await analyst(false); if (!only.length || only.includes('op')) await analyst(true); }
if (['s6', 's92'].some(want)) { await start(); if (want('s6')) await start('#agnplace=33.7233,73.0435,E-7'); }
if (want('n19')) await startReport();
if (want('n26')) await cust();
await br.close();
writeFileSync(O + '/uitest.txt', out.join('\n') + '\n' + pass + ' pass, ' + fail + ' fail\n'); console.log('uitest: ' + pass + ' pass, ' + fail + ' fail');
