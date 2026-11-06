/* v91.17.283.36 (NIGRAAN 1.0) · OVERVIEW TIMING (items 8-11, 13): the console opened from the start page with a place (#agnplace=Multan)
     8   the place is kept for 60 s after the hand-over (no refresh, AQI refresh or boot step changes it)
     9   the first place painted in the toolbar is the handed-over place (never another place first); other tabs load nothing until opened
     10  re-renders without an input change = 0: after the page has settled, the place panel, the toolbar and the hourly strip are not
         rewritten while no input changes (the test server's inputs are fixed)
     11  one "now" temperature: the toolbar, the panel and the hourly strip's NOW show the same number
     13  one temperature label per place on the map, no two labels overlapping
   usage: node scripts/tests28336/overview36.test.mjs [base] */
import { T, browser, open } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const br = await browser();
const init = `(() => { window.__ov = { t0: performance.now(), first: null, muts: 0, armed: false, sig: null, inputChanges: 0 };
  const mo = new MutationObserver((recs) => { const L = document.getElementById('agnLive84'); const t = L ? L.innerText : '';
    if (window.__ov.first == null && /\\S/.test(t) && /(Multan|Islamabad|Lahore|Karachi|I-8|G-9|Near )/.test(t)) window.__ov.first = { ms: Math.round(performance.now() - window.__ov.t0), text: t.replace(/\\s+/g, ' ').slice(0, 80) };
    if (!window.__ov.armed) return;
    /* an input change (a new now value or hour, a new run, a data-age state) is allowed to redraw: the signature of the inputs */
    const sig = (() => { try { const n = window.AGN && AGN.nowShown; const src = ((document.querySelector('#agnLive84 .src') || {}).textContent || ''); return JSON.stringify([n && n.t, n && n.at, src, (document.getElementById('v283RunChip') || {}).textContent || '']); } catch (_) { return ''; } })();
    let hit = 0; for (const r of recs) { const tg = r.target && r.target.nodeType === 1 ? r.target : r.target && r.target.parentElement; if (tg && tg.closest && tg.closest('#agnLive84, #mpLeftIn, #hscroll, #agnNowHero')) hit++; }
    if (!hit) return; if (sig !== window.__ov.sig) { window.__ov.sig = sig; window.__ov.inputChanges++; return; } window.__ov.muts += hit; });
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true, characterData: true })); })();`;
const o = await open(br, '/analyst#agnplace=30.19570,71.47530,Multan', { init });
const samples = []; const t0 = Date.now();
await o.pg.waitForTimeout(15000);
await o.pg.evaluate(() => { try { const n = window.AGN && AGN.nowShown; window.__ov.sig = JSON.stringify([n && n.t, n && n.at, ((document.querySelector('#agnLive84 .src') || {}).textContent || ''), (document.getElementById('v283RunChip') || {}).textContent || '']); } catch (_) {} window.__ov.armed = true; });
const reqBefore = o.log.length;
while (Date.now() - t0 < 62000) { await o.pg.waitForTimeout(2000);
  samples.push(await o.pg.evaluate(() => ({ sel: typeof selectedId !== 'undefined' ? selectedId : null, city: (document.getElementById('cityLabel') || {}).textContent || '', live: ((document.getElementById('agnLive84') || {}).innerText || '').replace(/\s+/g, ' ') }))); }
const R = await o.pg.evaluate(() => window.__ov);
const bad = samples.filter((s) => s.sel !== '__live' || !/Multan/.test(s.city) || !/Multan/.test(s.live));
ok(samples.length >= 20 && bad.length === 0, 'item 8 the handed-over place (Multan) is kept for 60 s: no switch to Islamabad / I-8/3', JSON.stringify(bad.slice(0, 3)));
ok(R.first && /Multan/.test(R.first.text), 'item 9 the first place painted is the handed-over place (' + (R.first ? R.first.ms + ' ms' : 'never') + ')', JSON.stringify(R.first));
ok(R.muts === 0, 'item 10 no re-render of the toolbar, the place panel or the hourly strip without an input change (15-62 s; ' + R.inputChanges + ' input change(s) redrew, as they should)', R.muts);
const tabsReq = o.log.slice(0, reqBefore).filter((r) => /\/api\/(reports|scenario|assessments|ops\/|limits|portfolio|accuracy|casebook)/.test(r.u)).map((r) => r.u);
ok(tabsReq.length === 0, 'item 9 tabs not opened load nothing (no reports / scenario / assessment / operations request before they are opened)', tabsReq.slice(0, 5).join(' '));
const temps = await o.pg.evaluate(() => { const num = (s) => { const m = /(-?\d+(?:\.\d+)?)\s*°/.exec(s || ''); return m ? +m[1] : null; };
  const live = num((document.getElementById('agnLive84') || {}).innerText), hero = (() => { const h = document.getElementById('agnNowHero'), c = document.querySelector('#mpLeftIn .mp-now'); const vis = (e) => e && e.getClientRects().length && getComputedStyle(e).display !== 'none'; return num(vis(h) ? h.innerText : c ? c.innerText : (h || {}).innerText); })(),   /* v283.37 B2: the one place card's now (the large value, or the card's own when it shows one) */
    hs = document.querySelector('#hscroll .hr, #hscroll > div'), now = num(hs ? hs.innerText : '');
  return { live, hero, now }; });
const vals = [temps.live, temps.hero, temps.now].filter((x) => x != null);
ok(vals.length >= 2 && vals.every((x) => Math.abs(x - vals[0]) < 0.051) && temps.hero != null, 'item 11 one "now" temperature: the large panel value, the toolbar and the hourly NOW agree', JSON.stringify(temps));
const lab = await o.pg.evaluate(() => { const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  const L = [...document.querySelectorAll('.leaflet-marker-pane .wx-pin .body, .leaflet-marker-pane .wx-pin .temp')].filter(vis);
  const perPin = [...document.querySelectorAll('.leaflet-marker-pane .wx-pin')].filter(vis).map((p) => (p.textContent.match(/°C/g) || []).length).filter((k) => k > 1).length;
  const r = L.map((e) => e.getBoundingClientRect()); let over = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right && r[j].left < r[i].right && r[i].top < r[j].bottom && r[j].top < r[i].bottom) over++;
  const places = L.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); }); const dup = places.length - new Set(places).size; return { n: L.length, over, dup, pinsWithTwoTemps: perPin }; });
ok(lab.n > 0 && lab.over === 0 && lab.dup === 0 && lab.pinsWithTwoTemps === 0, 'item 13 one temperature label per place on the map, none overlapping', JSON.stringify(lab));
ok(o.errs.length === 0, 'no page errors', o.errs.join(' | '));
await o.ctx.close(); await br.close(); done();
