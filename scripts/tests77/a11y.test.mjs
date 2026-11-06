import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.77 · U1 · accessibility (WCAG 2.2 AA), map clarity and plain language on the map and the 01 right panel.
   Findings: B-19 (axe), B-20 (keyboard trap), B-21 (focus ring), A-38 (tab strip contrast), A-35 remnant, A-27 remainder
   (grade flicker), A-29/A-30 (layer names, key notes), A-33 (01 right panel), and M's v76 hand-overs (province fill under
   tehsils on hazard layers, attribution chip swallowing clicks).
   usage: node scripts/tests77/a11y.test.mjs [baseUrl] [--no-axe]
   PASS/FAIL lines; exit 1 on any FAIL. axe-core is read from node_modules if present (NODE_PATH, the tree, or
   AXE_CORE=/path/to/axe.min.js); without it the axe section is reported as SKIP, not PASS. */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';

const BASE = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://127.0.0.1:8787').replace(/\/$/, '');
const NO_AXE = process.argv.includes('--no-axe');
const PW = __agnPW;
const CHROME = __agnChrome(__T.chromiumPath());
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null && detail !== '' ? '  · ' + String(detail).slice(0, 400) : '')); };
const info = (m) => console.log('INFO ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function axeSource() {
  const cands = [process.env.AXE_CORE, __T.repoPath('node_modules', 'axe-core', 'axe.min.js')];
  try { const req = createRequire(import.meta.url); cands.push(req.resolve('axe-core/axe.min.js')); } catch (_) {}
  for (const c of cands) if (c && existsSync(c)) return readFileSync(c, 'utf8');
  return null;
}

const pw = await __T.playwright(); const chromium = pw.chromium || pw.default.chromium;
const browser = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--renderer-process-limit=1'] });
const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const LEVELISH = /^(Normal|Low|Moderate|High|Severe|No data)$/;

async function newPage(q) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.goto(BASE + '/analyst' + (q || ''), { waitUntil: 'domcontentloaded', timeout: 120000 });
  return { ctx, page, errs };
}

try {
  const { ctx, page, errs } = await newPage('?operator=0')   /* (93) the customer view explicitly: on this machine the default is the operator view */;
  /* ═══ G · the data grade: sampled from load; never walks through grades, the strip and the context bar agree ═══ */
  const seen = []; let disagree = 0;
  for (let i = 0; i < 40; i++) {
    const g = await page.evaluate(() => { const a = document.getElementById('agnProvGrade'), c = document.querySelector('.agn-ctx-v[data-ctx="data"]');
      return { a: a ? a.textContent.trim() : null, c: c ? c.textContent.trim() : null }; });
    const la = (g.a || '').match(/^grade ([A-D])\b/), lc = (g.c || '').match(/^grade ([A-D])\b/);
    if (la && lc && la[1] !== lc[1]) disagree++;
    const L = la ? la[1] : null; if (L && seen[seen.length - 1] !== L) seen.push(L);
    await sleep(1000);
  }
  await page.waitForFunction(() => window.AGN && AGN.a11y && AGN.map77, null, { timeout: 60000 });
  ok(seen.length <= 1, 'A-27 the data grade shows once, when final (no D → C → A walk in the first 40 s)', 'letters shown in order: ' + (seen.join(' → ') || 'none yet (still checking)'));
  ok(disagree === 0, 'A-27 the source strip and the context-bar DATA field never show different grades', disagree + ' disagreeing samples');

  /* ═══ B · tab strip ═══ */
  const T = await page.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const nav = document.getElementById('machNav'); const bs = [...nav.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0);
    const out = bs.filter((b) => !b.classList.contains('active') && b.getAttribute('aria-selected') !== 'true').map((b) => {
      const l = b.querySelector('.nav-label') || b, n = b.querySelector('b'); let ncr = null;
      if (n) { const cs = getComputedStyle(n), m = cs.color.match(/[\d.]+/g).map(Number), op = +cs.opacity; ncr = cr('rgb(' + m.slice(0, 3).map((v) => Math.round(v * op + 255 * (1 - op))).join(',') + ')', 'rgb(255,255,255)'); }
      return { t: b.textContent.trim().slice(0, 20), lcr: cr(getComputedStyle(l).color, 'rgb(255,255,255)'), ncr }; });
    return { out, roles: bs.map((b) => b.getAttribute('role')), selNoRole: bs.filter((b) => b.hasAttribute('aria-selected') && b.getAttribute('role') !== 'tab').length,
      stops: bs.filter((b) => b.tabIndex === 0).length };
  });
  const minL = Math.min(...T.out.map((x) => x.lcr)), minN = Math.min(...T.out.filter((x) => x.ncr != null).map((x) => x.ncr));
  ok(minL >= 4.5, 'A-38 inactive tab labels ≥ 4.5:1 on white', 'min ' + minL.toFixed(2) + ':1');
  ok(minN >= 4.5, 'A-38 inactive tab step numbers ≥ 4.5:1 on white (opacity included)', 'min ' + minN.toFixed(2) + ':1');
  ok(T.roles.every((r) => r === 'tab') && T.selNoRole === 0, 'B-19 every button in the tablist is role=tab (Evidence & Methods included), no aria-selected without a tab role', T.roles.join(','));
  ok(T.stops === 1, 'B-19 roving tabindex: the tab strip is one Tab stop', T.stops + ' stops');

  /* ═══ C · a visible focus ring on the named controls (keyboard focus) ═══ */
  await page.keyboard.press('Tab');
  const RING = await page.evaluate(async () => {
    /* v91.17.80 · Compare and Comfort brief moved into 02 Forecast (hidden while 01 is open); their dialog is checked in F */
    const pick = {
      '01 tab': () => document.querySelector('#machNav [data-goto="overview"]'), 'Evidence & Methods': () => [...document.querySelectorAll('#machNav button')].find((b) => /Evidence|Methods & Verification/.test(b.textContent)),   /* v283.28: renamed Methods & Verification */
      'Sources': () => [...document.querySelectorAll('#machNav button')].find((b) => /^Sources$/.test(b.textContent.trim())),
      'Satellite': () => [...document.querySelectorAll('.mappanel button')].find((b) => /^Satellite$/.test(b.textContent.trim())),
      'Province': () => [...document.querySelectorAll('.mappanel button')].find((b) => /^Province$/.test(b.textContent.trim())),
      'Map layer picker': () => document.getElementById('mapHazardPick'), 'Map': () => document.getElementById('map') };
    const o = {}; for (const [k, f] of Object.entries(pick)) { const e = f(); if (!e) { o[k] = 'missing'; continue; } if (!e.getClientRects().length) { o[k] = 'hidden'; continue; } e.focus(); await new Promise((r) => setTimeout(r, 250)); const cs = getComputedStyle(e);
      o[k] = (document.activeElement === e ? '' : 'lost focus ') + (e.matches(':focus-visible') ? '' : 'not focus-visible ') + cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor; e.blur(); }
    return o; });
  const bad = Object.entries(RING).filter(([, v]) => v !== 'hidden' && !/^solid (2|3)px rgb\((12, 56, 81|255, 255, 255)\)$/.test(v));   /* (93) a control not shown in this view (customer) has no ring to draw */
  ok(!bad.length, 'B-21 keyboard focus draws a 2–3 px solid ring on the tabs, Evidence & Methods, Sources, Satellite, Province, the layer picker and the map', bad.length ? JSON.stringify(Object.fromEntries(bad)) : Object.keys(RING).length + ' controls');

  /* ═══ D · the keyboard gets past the map ═══ */
  await page.evaluate(() => { const b = [...document.querySelectorAll('.mappanel button')].find((x) => /^\s*Map\s*$/.test(x.textContent)); b.focus(); });
  let n = 0, pathStops = 0, zoomAt = null, left = null;
  for (n = 1; n <= 120; n++) { await page.keyboard.press('Tab');
    const a = await page.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, zoom: a.classList && a.classList.contains('leaflet-control-zoom-in'), inPanel: !!(a.closest && a.closest('.mappanel')) }; });
    if (a.tag === 'path') pathStops++; if (a.zoom && zoomAt == null) zoomAt = n; if (!a.inPanel) { left = n; break; } }
  ok(pathStops === 0, 'B-20 no tehsil polygon is a Tab stop', pathStops + ' polygon stops (v76: 585)');
  ok(zoomAt != null && zoomAt <= 40, 'B-20 the zoom buttons are reached within 40 Tab presses from the map toolbar', 'at press ' + zoomAt + ' (v76: 607)');
  ok(left != null && left <= 60, 'B-20 Tab leaves the map panel within 60 presses', 'after ' + left + ' presses (v76: 617)');
  await page.evaluate(() => { const b = [...document.querySelectorAll('.mappanel button')].find((x) => /^\s*Map\s*$/.test(x.textContent)); b.focus(); });
  await page.keyboard.press('Shift+Tab');
  const sk = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { id: a.id, t: a.textContent, vis: r.width > 20 && r.height > 10 && getComputedStyle(a).clipPath === 'none' }; });
  const skHidden = await page.evaluate(() => { const a = document.getElementById('agnSkipMap'); a.blur(); const r = a.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; });
  ok(skHidden, 'B-20 the "Skip map" link takes no space until it is focused');
  await page.evaluate(() => document.getElementById('agnSkipMap').focus());
  ok(sk.id === 'agnSkipMap' && sk.vis, 'B-20 a "Skip map" link sits before the map toolbar and shows when focused', JSON.stringify(sk));
  await page.keyboard.press('Enter'); await sleep(300);
  const after = await page.evaluate(() => { const a = document.activeElement; return { id: a.id, inRight: !!(a.closest && a.closest('#mpRight')), inMap: !!(a.closest && a.closest('#mpMapWrap')) }; });
  ok(!after.inMap, 'B-20 "Skip map" moves focus past the map', JSON.stringify(after));
  /* the map itself is one stop: arrows pan (Leaflet), Enter opens the unit under the centre mark */
  await page.evaluate(() => { document.getElementById('map').scrollIntoView({ block: 'center' }); document.getElementById('map').focus(); });
  const c0 = await page.evaluate(() => map.getCenter());
  await page.keyboard.press('ArrowRight'); await sleep(700);
  const c1 = await page.evaluate(() => map.getCenter());
  ok(Math.abs(c1.lng - c0.lng) > 0.01, 'B-20 arrow keys pan the focused map', c0.lng.toFixed(2) + ' → ' + c1.lng.toFixed(2));
  await page.keyboard.press('Enter'); await sleep(2500);
  const pop = await page.evaluate(() => { const p = document.querySelector('.leaflet-popup'); return p ? p.innerText.replace(/\n/g, ' ').slice(0, 120) : null; });
  ok(!!pop, 'B-20 Enter on the focused map opens the unit under the centre mark', pop);
  const lab = await page.evaluate(() => { const m = document.getElementById('map'); return { role: m.getAttribute('role'), label: m.getAttribute('aria-label') }; });
  ok(lab.role === 'region' && /Arrow keys/.test(lab.label || ''), 'B-20 the map region is named and says how to use it from the keyboard', lab.label);

  /* ═══ F · dialogs: focus in, Tab stays in, Esc closes, focus returns ═══ */
  /* v91.17.80 · Compare lives in 02 Forecast; the floating Outlook chip is gone (the outlook is in 02 Forecast) */
  await page.evaluate(() => { const t = document.querySelector('#machNav [data-goto="livedata"]'); if (t) t.click(); }); await page.waitForTimeout(1500);
  for (const [name, id] of [['Compare', 'compareBtn']]) {
    await page.evaluate((id) => { const b = document.getElementById(id); b.scrollIntoView({ block: 'center' }); b.focus(); }, id);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).display !== 'none' && x.contains(document.activeElement)), null, { timeout: 8000 }).catch(() => {});
    const d = await page.evaluate(() => { const ds = [...document.querySelectorAll('[role="dialog"]')].filter((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).display !== 'none');
      const a = document.activeElement; return { n: ds.length, inside: ds.some((x) => x.contains(a)), label: ds[0] && ds[0].getAttribute('aria-label') }; });
    ok(d.n >= 1 && d.inside, 'B-20 ' + name + ': focus moves into the dialog when it opens', JSON.stringify(d));
    let stayed = true; for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); const ins = await page.evaluate(() => { const a = document.activeElement; return !!(a.closest && a.closest('[role="dialog"]')); }); if (!ins) { stayed = false; break; } }
    ok(stayed, 'B-20 ' + name + ': Tab stays inside the open dialog (25 presses)');
    await page.keyboard.press('Escape');
    await page.waitForFunction((id) => document.activeElement && document.activeElement.id === id, id, { timeout: 6000 }).catch(() => {});
    const e = await page.evaluate((id) => { const ds = [...document.querySelectorAll('[role="dialog"]')].filter((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).display !== 'none'); return { open: ds.length, back: document.activeElement && document.activeElement.id === id, active: document.activeElement.id || document.activeElement.tagName, t: (AGN.a11y && AGN.a11y._dlg) ? AGN.a11y._dlg() : null }; }, id);
    ok(e.open === 0 && e.back, 'B-20 ' + name + ': Esc closes it and focus returns to the button that opened it', JSON.stringify(e));
  }

  /* ═══ H · plain words on the map ═══ */
  await page.evaluate(() => { try { map.closePopup(); } catch (_) {} });
  const P = await page.evaluate(() => { const s = document.getElementById('mapHazardPick'); return { opts: [...s.options].map((o) => [o.value, o.text]), groups: [...s.querySelectorAll('optgroup')].map((g) => g.label) }; });
  const ids = P.opts.map((o) => o[0]).join(',');
  ok(ids.split(',').sort().join(',') === 'flood,flood_pluvial,flood_riverine,landslide,glof,heat,cold,wind,drought,nss_baseline,nss_dynamic,nss_runoff,seismic,cyclone,rain_hz,aqi,'.split(',').sort().join(','), 'A-29 the picker keeps every internal layer id (v84 order: weather now, hazards, ground, earthquake)', ids);
  const txt = Object.fromEntries(P.opts.map(o => [o[0], String(o[1]).replace(/ \((experimental|reference)\)$/, '')]));   /* v91.17.103 · the gate's status suffix */
  ok(txt.flood === 'Flood (river and rain)' && txt.flood_pluvial === 'Flood from local rain' && txt.flood_riverine === 'River flood', 'A-29 flood layers in customer words', [txt.flood, txt.flood_pluvial, txt.flood_riverine].join(' | '));
  const eng = /pathway|pluvial|riverine|GloFAS|river-flow model|lake-routed|Monitor|Watch|susceptibility \(screening\)|sponginess —|0–100|never ranked/;
  ok(!P.opts.some((o) => eng.test(o[1])) && !P.groups.some((g) => eng.test(g)), 'A-29 no engineering phrase in the picker (names or groups)', P.opts.map((o) => o[1]).concat(P.groups).filter((t) => eng.test(t)).join(' | '));
  /* (93) the dialogs above run on 02; the key and the map are read on 01, where they are on screen (a hidden legend's innerText is its whole text) */
  await page.evaluate(() => { const t = document.querySelector('#machNav [data-goto="overview"]'); if (t) t.click(); }); await sleep(3000);
  const ENGKEY = /HydroBASINS|BCP|engine class|Sentinel|expert-entered|SPEI|light green tint|design-basis/i;
  const K = {};
  for (const v of ['glof', 'seismic', 'cyclone', 'flood']) {
    K[v] = await page.evaluate(async (v) => { const s = document.getElementById('mapHazardPick'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 3000));
      const L = document.getElementById('v3legend'); const i = L.querySelector('.agn-leg-i'); if (i && i.getAttribute('aria-expanded') !== 'true') i.click(); await new Promise((r) => setTimeout(r, 300));
      const r = { op: !!(window.AGN && AGN.operator && AGN.operator()), htmlOp: document.documentElement.className.slice(0, 120) + ' / ' + [...L.querySelectorAll('.agn-leg-eng')].map((e) => getComputedStyle(e).display + ':' + e.className).join(';'), line: ((L.innerText.match(/.{0,80}(HydroBASINS|BCP|engine class|design-basis).{0,40}/i) || [''])[0]), title: (L.querySelector('.t') || {}).textContent, vis: L.innerText, ctx: (document.querySelector('.agn-ctx-v[data-ctx="hazard"]') || {}).textContent,
        tehsil: map.hasLayer(districtLayer), provFill: [...new Set(provLayer.getLayers().filter((l) => !/Indian/.test((l.feature && l.feature.properties.province) || '')).map((l) => l.options.fillOpacity))] };
      if (i) i.click(); return r; }, v);
  }
  ok(Object.values(K).every((k) => !ENGKEY.test(k.vis)), 'A-30 the key and its ⓘ show no engineering notes to a customer (HydroBASINS, BCP, engine-class mapping, Sentinel, SPEI …)',
    Object.entries(K).filter(([, k]) => ENGKEY.test(k.vis)).map(([v, k]) => v + ': ' + (k.vis.match(ENGKEY) || [])[0] + ' [op ' + k.op + ' · ' + k.line + ' · ' + k.htmlOp + ']').join(' | '));
  ok(/^Glacial lake outburst flood \(GLOF\)/.test(K.glof.title) && String(K.glof.ctx).replace(/ \((experimental|reference)\)$/, '') === 'Glacial lake outburst flood (GLOF)', 'A-29 the key title and the context bar use the customer name', K.glof.title + ' | ' + K.glof.ctx);
  /* M's hand-over: the province fill does not show through the translucent tehsils on a hazard layer */
  ok(['glof', 'seismic', 'cyclone', 'flood'].every((v) => !K[v].tehsil || (K[v].provFill.length === 1 && K[v].provFill[0] === 0)), 'M-76 tehsil view of a hazard layer: the province layer under the tehsils is unfilled',
    Object.entries(K).map(([v, k]) => v + ' ' + JSON.stringify(k.provFill)).join(' · '));
  const PV = await page.evaluate(async () => { const s = document.getElementById('mapHazardPick'); s.value = 'glof'; s.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 2500));
    const btn = (t) => [...document.querySelectorAll('.mappanel button')].find((b) => b.textContent.trim() === t);
    btn('Province').click(); await new Promise((r) => setTimeout(r, 3000));
    const pv = provLayer.getLayers().filter((l) => !/Indian/.test((l.feature && l.feature.properties.province) || '')).map((l) => l.options.fillOpacity);
    btn('Tehsil').click(); await new Promise((r) => setTimeout(r, 3000));
    const tv = provLayer.getLayers().filter((l) => !/Indian/.test((l.feature && l.feature.properties.province) || '')).map((l) => l.options.fillOpacity);
    s.value = 'flood'; s.dispatchEvent(new Event('change', { bubbles: true })); return { pv, tv }; });
  ok(PV.pv.some((x) => x > 0) && PV.tv.every((x) => x === 0), 'M-76 the Province view keeps its fill and the Tehsil view unfills it again (GLOF)', JSON.stringify(PV));
  /* the attribution chip lets clicks through along the bottom edge */
  await page.evaluate(() => { const e = document.getElementById('map'); e.scrollIntoView({ block: 'end' }); }); await sleep(500);
  const AT = await page.evaluate(() => { const m = document.getElementById('map').getBoundingClientRect(); let a = 0, t = 0; for (let x = m.x + 200; x < m.right - 40; x += 40) for (const y of [Math.min(m.bottom, innerHeight) - 16, Math.min(m.bottom, innerHeight) - 9, Math.min(m.bottom, innerHeight) - 3]) { const e = document.elementFromPoint(x, y); if (!e) continue; t++; if (e.closest && e.closest('.attribution')) a++; } return { a, t }; });
  ok(AT.t > 0 && AT.a === 0, 'M-76 the attribution chip does not take clicks along the map bottom edge', AT.a + ' of ' + AT.t + ' points hit the chip (v76: every point under it)');

  /* ═══ I · 01 right panel ═══ */
  await page.evaluate(() => { try { if (typeof agnOpenLiveData === 'function') agnOpenLiveData('Islamabad'); } catch (_) {} });
  await page.waitForFunction(() => { const R = document.getElementById('mpRightIn'); return R && R.querySelectorAll('.agn-mps .agn-mps-r .bw').length >= 4; }, null, { timeout: 180000 }).catch(() => {});   /* v91.17.101 · wait for the scored hazards, not the first */
  const R1 = await page.evaluate(() => { const R = document.getElementById('mpRightIn'), A = document.getElementById('mpRight');
    return { sh: R.scrollHeight, box: A.clientHeight, text: R.innerText, head: R.innerText.split('\n')[0], how: !!R.querySelector('details.agn-mps-how > summary'), howOpen: !!R.querySelector('details.agn-mps-how[open]'),
      rows: [...R.querySelectorAll('.mp-r')].map((r) => ({ n: (r.querySelector('.n') || {}).innerText, w: (r.querySelector('.bw') || {}).innerText })).filter((r) => r.w != null),
      eng: !!R.querySelector('.agn-mps-eng') }; });
  info('01 right panel: ' + R1.sh + ' px content in a ' + R1.box + ' px box (' + (R1.sh / R1.box).toFixed(2) + ' screens; v76: 2030 px loading, 1295 px loaded)');
  ok(R1.sh <= R1.box * 1.15, 'A-33 the 01 right panel fits its box (≤ 1.15 screens)', R1.sh + ' / ' + R1.box + ' px');
  ok(R1.head && !/population/.test(R1.head) && /people live here/.test(R1.text), 'A-33 panel names the place and its population in plain words', R1.text.split('\n').slice(0, 2).join(' | '));
  if (R1.rows.length < 5) info('01 right panel text: ' + String(R1.text).replace(/\n/g, ' | ').slice(0, 900));
  /* v91.17.101 · a plains unit (Hasilpur) has four hazards that occur there; the rest are listed under 'Does not occur here' */
  ok(R1.rows.length >= 4 && R1.rows.every((r) => LEVELISH.test(String(r.w).trim())) && (R1.rows.length >= 5 || /Does not occur here/.test(R1.text)), 'A-33 one level word per hazard (AGN.level.word)', R1.rows.map((r) => r.n.split('\n')[0] + ' ' + r.w).join(', '));
  ok(R1.how && !R1.howOpen, 'A-33 the method sits behind a closed "How this is worked out" fold', '');
  ok(!/GHS-POP|population grid|hazard-gated|index \d+\/100|not comparable between hazards|screening band|BCP|PGA|SPEI/i.test(R1.text) && !R1.eng, 'A-33 no engineering text or operator block on the customer card',
    (R1.text.match(/GHS-POP|population grid|hazard-gated|index \d+\/100|not comparable between hazards|screening band|BCP|PGA|SPEI/i) || [''])[0]);

  /* ═══ A · axe-core, every tab, customer view ═══ */
  const AXE = NO_AXE ? null : axeSource();
  if (!AXE) info('SKIP axe section (' + (NO_AXE ? '--no-axe' : 'axe-core not found; set AXE_CORE=/path/axe.min.js') + ')');
  else {
    await page.evaluate(() => window.scrollTo(0, 0));
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#machNav button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)));
    const per = [];
    for (let i = 0; i < tabs.length; i++) {
      await page.evaluate((i) => { [...document.querySelectorAll('#machNav button')].filter((b) => b.getBoundingClientRect().width > 0)[i].click(); }, i);
      await sleep(3500);
      await page.evaluate(AXE);
      const v = await page.evaluate(async () => { const r = await axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => ({ id: x.id, n: x.nodes.length, t: x.nodes[0] && x.nodes[0].target.join(' ') })); });
      per.push(tabs[i] + ': ' + (v.length ? v.map((x) => x.id + '×' + x.n).join(' ') : '0'));
      ok(v.length === 0, 'B-19 axe serious/critical = 0 on ' + tabs[i], v.map((x) => x.id + '×' + x.n + ' (' + x.t + ')').join(' | '));
    }
    info('axe per tab: ' + per.join(' · '));
  }
  ok(errs.length === 0, 'no page errors (customer)', errs.join(' | '));
  await ctx.close();

  /* ═══ operator view: the engineering text is still there, behind the mode ═══ */
  const opP = await newPage('?operator=1');
  const eligible = await opP.page.evaluate(async () => { try { const r = await fetch('/api/operator/status', { cache: 'no-store' }); return (await r.json()).operator === true; } catch (_) { return false; } });
  if (!eligible) info('SKIP operator checks: /api/operator/status is not true for this client');
  else {
    await opP.page.waitForFunction(() => window.AGN && AGN.operator && AGN.operator(), null, { timeout: 60000 }).catch(() => {});
    const O = await opP.page.evaluate(async () => { const s = document.getElementById('mapHazardPick'); await new Promise((r) => setTimeout(r, 8000)); s.value = 'glof'; s.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 3000));
      const L = document.getElementById('v3legend'); const i = L.querySelector('.agn-leg-i'); if (i && i.getAttribute('aria-expanded') !== 'true') i.click(); await new Promise((r) => setTimeout(r, 300));
      try { if (typeof agnOpenLiveData === 'function') agnOpenLiveData('Islamabad'); } catch (_) {}
      for (let k = 0; k < 10 && !document.querySelector('#mpRightIn .agn-mps'); k++) await new Promise((r) => setTimeout(r, 1000));
      const R = document.getElementById('mpRightIn');
      return { op: AGN.operator(), key: L.innerText, eng: R ? R.querySelector('.agn-mps-eng') && R.querySelector('.agn-mps-eng').innerText.slice(0, 200) : null }; });
    ok(O.op && /HydroBASINS|engine class/.test(O.key), 'A-30 operator view: the engineering note is behind the ⓘ', (O.key.match(/Engineering:[^\n]{0,80}/) || [''])[0]);
    ok(!O.eng, 'A-33 operator view (v91.17.283.28, P18): no legacy engineering card under the summary (it contradicted the served levels)', O.eng);
    ok(opP.errs.length === 0, 'no page errors (operator)', opP.errs.join(' | '));
  }
  await opP.ctx.close();
} catch (e) { ok(false, 'test ran to the end', String(e && e.stack || e).slice(0, 400)); }
await browser.close();
console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
