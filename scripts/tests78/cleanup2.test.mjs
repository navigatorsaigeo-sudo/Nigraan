import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.78 · K · cleanup 2 (v91.17.266: the 07 Financial worked-example parts retired with the tab): the Outlook layer list, the tab strip on one row, customer popups.
     node scripts/tests78/cleanup2.test.mjs [baseUrl]            default http://127.0.0.1:8787
     --no-browser   static checks only
   A · static: data/financial-worked-example.json and the copy in build/cleanup_ui.html are the same object; no fragment
       carries the invented "internal engineering estimate" rows; the popup's screening-index line is operator-only; the tab
       strip rule applies above 900 px only.
   B · customer view, 1440x900: 07 "Show worked example" (Financial rows) and a scripted press of the hidden uncertainty
       example change nothing in the client project (assets, financial rows, uncertainty rows, active asset) and leave the
       forms empty; the example card shows value x JRC curve at 1.0 m; the two CSV templates are the header only; no
       "internal engineering estimate" on the page; the tab strip is one row with no horizontal page scroll and every page
       heading starts with its tab name; the Outlook list shows the 12 Main layers first and a closed "More" fold with the
       rest, together every id the server publishes; a More layer and a scripted value both paint the map; a hazard popup
       shows the level word, a physical value and the time, and no screening index.
   C · 1920 px: one row. 900 px and 390 px: the strip rule does not apply (v76 phone row at 390 scrolls).
   D · operator view (?operator=1, loopback): the original single Outlook list (every id, no More fold); the popup shows the
       screening index line.
   PASS/FAIL lines; exit 1 on any FAIL. */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BASE = (process.argv.slice(2).find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787').replace(/\/$/, '');
const NO_BROWSER = process.argv.includes('--no-browser');
const PW = process.env.PW_MODULE || __agnPW;
const CHROME = process.env.PW_CHROME || __agnChrome(__T.chromiumPath());
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 300) : '')); };
const rd = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch (_) { return ''; } };
const MAIN = ['ev:heatSpell', 'ev:coldSpell', 'ev:rain3_75', 'ev:rain3Local', 'ev:heavySnow', 'day:gu60', 'air:dust', 'air:pm25', 'week:t', 'week:p', 'month:t', 'month:p'];

/* ── A · static ── */
/* v91.17.266 · the financial worked example (data/financial-worked-example.json) left NIGRAAN with the Financial tab: its checks are retired */
{
  const frags = ['cleanup_ui', 'a11y_ui', 'outlook_ui', 'map_ui'].map(n => rd('build/' + n + '.html')).join('\n');
  ok(!/internal engineering estimate/.test(frags.replace(/\/\*[\s\S]*?\*\//g, '')), 'A · no fragment code carries the "internal engineering estimate" rows');
  ok(/<div class="m agn-op-only" data-agn-idx="1">/.test(rd('build/map_ui.html')), 'A · the popup screening-index line is marked operator-only');
  ok(/@media \(min-width:901px\)\{\s*#machNav\.machnav-sequenced\{flex-wrap:nowrap/.test(rd('build/a11y_ui.html')), 'A · the one-row tab rule applies above 900 px only');
}

if (!NO_BROWSER) {
  const pw = await __T.playwright(); const chromium = pw.chromium || pw.default.chromium;
  const browser = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--renderer-process-limit=1'] });
  let cat = null; try { cat = await (await fetch(BASE + '/api/map/layers', { cache: 'no-store' })).json(); } catch (_) { cat = null; }
  const catIds = cat ? cat.flatMap(g => g.items.map(i => i[0])) : [];
  const open = async (w, op) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }); const page = await ctx.newPage(); const perr = [];
    page.on('pageerror', e => perr.push(String(e).slice(0, 200)));
    await page.goto(BASE + '/analyst?operator=' + (op ? 1 : 0), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(20000);
    return { ctx, page, perr };
  };
  const tabRow = (page) => page.evaluate(() => { const nav = document.getElementById('machNav'); const bs = [...nav.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0);
    return { rows: [...new Set(bs.map(b => Math.round(b.getBoundingClientRect().top)))].length, n: bs.length, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      navOver: nav.scrollWidth - nav.clientWidth, ox: getComputedStyle(nav).overflowX, labels: bs.map(b => b.textContent.replace(/\s+/g, ' ').trim()) }; });
  const olOpen = async (page) => { /* v91.17.80 · the button sits in the More layers menu */ await page.evaluate(() => { const m = document.getElementById('agnLayersMenu80'); if (m) m.classList.add('open'); }); 
    await page.evaluate(() => { const t = document.getElementById('agn-tab-overview'); if (t) t.click(); }); await page.waitForTimeout(2500);
    await page.evaluate(() => { document.querySelector('#map').scrollIntoView({ block: 'start' }); const p = document.getElementById('agnOlMap'); if (!p || !p.classList.contains('open')) document.getElementById('agnOlMapBtn').click(); });
    for (let i = 0; i < 25; i++) { await page.waitForTimeout(1000); if (await page.evaluate(() => document.querySelectorAll('#agnOlSel option').length > 1)) break; }
  };
  const popup = async (page, hz) => {
    await page.evaluate(h => { const s = document.getElementById('mapHazardPick'); s.value = h; s.dispatchEvent(new Event('change', { bubbles: true })); }, hz); await page.waitForTimeout(6000);
    await page.evaluate(() => { map.closePopup(); map.fitBounds([[23.6, 60.8], [37.1, 77.9]]); }); await page.waitForTimeout(700);
    const pt = await page.evaluate(() => { const q = map.latLngToContainerPoint([31.55, 74.35]); const r = document.querySelector('#map').getBoundingClientRect(); return [r.x + q.x, r.y + q.y]; });
    await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(1800);
    return page.evaluate(() => { const e = document.querySelector('.leaflet-popup .agn-place-pop'); return e ? { text: e.innerText.replace(/\n+/g, ' | '), idx: [...e.querySelectorAll('[data-agn-idx]')].filter(x => x.getClientRects().length > 0).length } : null; });
  };
  try {
    /* ── B · customer, 1440 ── */
    {
      const { ctx, page, perr } = await open(1440, false);
      ok(!(await page.evaluate(() => document.documentElement.classList.contains('agn-operator'))), 'B · customer view by default');
      /* v91.17.266 · the 07 Financial worked-example checks are retired with the Financial tab */
      ok(!(await page.evaluate(() => /internal engineering estimate/i.test(document.body.innerText))), 'B · no "internal engineering estimate" on the page');

      const t = await tabRow(page);
      ok(t.rows === 1 && t.navOver <= 0 && t.doc <= 0, 'B · 1440: the tab strip is one row, no horizontal page scroll (A-38)', JSON.stringify({ rows: t.rows, navOver: t.navOver, doc: t.doc }));
      const heads = await page.evaluate(() => { const tabs = {}; document.querySelectorAll('#machNav button[id^="agn-tab-"]').forEach(b => { tabs[b.id.slice(8)] = (b.querySelector('.nav-label') || b).textContent.trim().replace(/^\d+\s*/, ''); });
        const bad = []; document.querySelectorAll('.view .agn-v91-story-head .agn-v91-head-line > b').forEach(h => { const v = h.closest('.view'), k = v.getAttribute('data-view') || v.id.replace(/^agn-panel-/, ''); if (tabs[k] && h.textContent.trim().toLowerCase().indexOf(tabs[k].toLowerCase()) !== 0) bad.push(k + ': ' + tabs[k] + ' / ' + h.textContent.trim()); });
        return { n: Object.keys(tabs).length, bad }; });
      ok(heads.n >= 10 && heads.bad.length === 0, 'B · every page heading starts with its tab name (v77 rule)', heads.bad.join(' | '));

      await olOpen(page);
      const o = await page.evaluate(() => { const s = document.getElementById('agnOlSel'), m = document.getElementById('agnOlSelMore'), d = document.getElementById('agnOlMore');
        const vis = [...s.options].filter(x => !x.hidden && !(x.parentElement.tagName === 'OPTGROUP' && x.parentElement.hidden) && x.value).map(x => x.value);
        const more = m ? [...m.options].map(x => x.value).filter(Boolean) : [];
        return { vis, more, all: [...s.options].map(x => x.value).filter(Boolean), open: d ? d.open : null, first: s.querySelector('optgroup') && s.querySelector('optgroup').label }; });
      ok(o.first === 'Main' && JSON.stringify(o.vis) === JSON.stringify(MAIN.filter(id => catIds.includes(id))), 'B · Outlook list: the Main group comes first and holds the 12 main layers', o.vis.join(','));
      ok(o.open === false && o.more.length === catIds.length - o.vis.length && o.more.every(id => !MAIN.includes(id)), 'B · the other layers sit in a closed "More outlook layers" fold', 'more ' + o.more.length + ' of ' + catIds.length);
      ok(catIds.length > 0 && catIds.every(id => o.vis.includes(id) || o.more.includes(id)) && catIds.every(id => o.all.includes(id)), 'B · every published layer id is reachable (Main + More, and as a value of the list)', catIds.length + ' ids');
      await page.evaluate(() => { const d = document.getElementById('agnOlMore'); if (d) d.open = true; }); await page.waitForTimeout(300);
      const pick = o.more.includes('air:fires') ? 'air:fires' : o.more[0];
      await page.selectOption('#agnOlSelMore', pick);
      let st1 = null; for (let i = 0; i < 20; i++) { await page.waitForTimeout(1000); st1 = await page.evaluate(() => { const s = AGN.olState(); return { id: s.id, ready: !!(s.data && s.data.ready), main: document.getElementById('agnOlSel').value }; }); if (st1.ready && st1.id === pick) break; }
      ok(st1 && st1.id === pick && st1.ready && st1.main === pick, 'B · a layer chosen under More paints the map and shows as the chosen layer', JSON.stringify(st1));
      await page.evaluate(() => { const s = document.getElementById('agnOlSel'); s.value = 'day:tx40'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(4000);
      ok((await page.evaluate(() => AGN.olState().id)) === 'day:tx40', 'B · setting the list to a More id by script still works (saved choices, older tests)');
      await page.selectOption('#agnOlSel', ''); await page.waitForTimeout(1500);
      await page.evaluate(() => document.getElementById('agnOlMap').classList.remove('open'));

      for (const hz of ['heat', 'wind']) {
        const pp = await popup(page, hz);
        ok(!!pp && !/screening index|\/ 100/.test(pp.text) && pp.idx === 0, 'B · ' + hz + ' popup: no screening index for customers', pp && pp.text);
        ok(!!pp && /\b(Normal|Low|Moderate|High|Severe|No data|Loading)\b/.test(pp.text) && /Time:/.test(pp.text) && (hz === 'heat' ? /°C/.test(pp.text) : /km\/h/.test(pp.text)), 'B · ' + hz + ' popup: level word, the physical value and the time', pp && pp.text);
      }
      ok(perr.length === 0, 'B · no page errors (customer)', perr.join(' | '));
      await ctx.close();
    }
    /* ── C · other widths ── */
    for (const w of [1920, 900, 390]) {
      const { ctx, page } = await open(w, false);
      const t = await tabRow(page); const fit = await page.evaluate(() => (window.AGN && AGN.a11y && AGN.a11y.tabsFitState) || null);
      if (w === 1920) ok(t.rows === 1 && t.navOver <= 0 && t.doc <= 0, 'C · 1920: the tab strip is one row, no horizontal page scroll (A-38)', JSON.stringify({ rows: t.rows, navOver: t.navOver, doc: t.doc }));
      else if (w === 900) ok(t.doc <= 0 && (t.labels.includes('Evidence & Methods') || t.labels.includes('Methods & Verification')) && (!fit || fit.short === false), 'C · 900: the desktop strip rule does not apply (labels untouched, no page scroll)', JSON.stringify({ rows: t.rows, doc: t.doc }));
      else ok(t.rows === 1 && t.ox === 'auto' && t.doc <= 0, 'C · 390: the v76 phone row (one scrolling row) is unchanged', JSON.stringify({ rows: t.rows, ox: t.ox, doc: t.doc }));
      await ctx.close();
    }
    /* ── D · operator ── */
    {
      const { ctx, page, perr } = await open(1440, true);
      const isOp = await page.evaluate(() => document.documentElement.classList.contains('agn-operator'));
      ok(isOp, 'D · ?operator=1 from loopback turns operator mode on');
      if (isOp) {
        await olOpen(page);
        const o = await page.evaluate(() => { const s = document.getElementById('agnOlSel'); return { n: [...s.options].filter(x => x.value && !x.hidden).length, more: !!document.getElementById('agnOlMore'), groups: [...s.querySelectorAll('optgroup')].map(g => g.label) }; });
        ok(o.n === catIds.length && !o.more && !o.groups.includes('Main'), 'D · operator: the original single Outlook list (every id, server groups, no fold)', JSON.stringify(o));
        await page.evaluate(() => document.getElementById('agnOlMap').classList.remove('open'));
        const pp = await popup(page, 'heat');
        ok(!!pp && pp.idx === 1 && /screening index \d+ \/ 100/.test(pp.text), 'D · operator: the popup still shows the screening index', pp && pp.text);
      }
      ok(perr.length === 0, 'D · no page errors (operator)', perr.join(' | '));
      await ctx.close();
    }
  } finally { await browser.close(); }
}
console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
