/* v91.17.283.41 (NIGRAAN 1.0.5) · the page items of the 31 Oct fix list, in a browser on the running server (customer view, then operator):
   1  legend idle: after a layer settles, 0 changes to the key (#v3legend) and the bottom key (#agn242Leg) in 5 s, on every layer
   2  one palette: the served display palette = the page's ramp; level fills use it; the start-page bars too; no purple fill for a customer
   3  heavy rain: no blue Normal rows / fills
   4  wind: the map is filled from the gust value (every tehsil on the ramp), the key is "Forecast gust, km/h" with no level rows
   5-7 a tehsil without a tested level shows its forecast value (heavy rain: rain day total) and the place line says "level not tested here"
   8  the coverage line is present on every layer (no "loading" after it settles)
   10-13 customer words: no "(experimental)", "(reference)", agency names, version or developer text on any tab or layer; the operator view
      keeps the gate words
   22 no position: never an endless "Loading the selected place" (the last place, else "Choose a place")
   26 start page: bars on the ramp, the key box one line per row and clear of the search panel, the forecast-run time label
   usage: node scripts/tests28341/page41.test.mjs [base]   (env SHOTS=<dir> writes a screenshot per layer and tab) */
import { T, browser, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T(); const SHOTS = process.env.SHOTS || null; const PART = process.env.PART || 'all'; const on = (p) => PART === 'all' || PART.split(',').includes(p);
const br = await browser();
const RAMP = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026'];
const hex = (c) => { const m = String(c || '').match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('') : String(c || '').toLowerCase(); };
async function page(op, geo = true) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 675 }, ...(geo ? { geolocation: { latitude: 31.5204, longitude: 74.3587, accuracy: 25 }, permissions: ['geolocation'] } : {}) });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE + '/analyst' + (op ? '?operator=1' : ''), { waitUntil: 'load', timeout: 240000 }); return { ctx, pg, errs }; }
const pick = (pg, v) => pg.evaluate((v) => { const s = document.getElementById('mapHazardPick'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
async function idle(pg, secs) { return pg.evaluate(async (secs) => { const L = document.getElementById('v3legend'), K = document.getElementById('agn242Leg'); let n = 0, nk = 0;
  const mo = new MutationObserver((ms) => { for (const m of ms) { if (L && L.contains(m.target)) n++; else nk++; } });
  if (L) mo.observe(L, { childList: true, subtree: true, characterData: true, attributes: true }); if (K) mo.observe(K, { childList: true, subtree: true, characterData: true, attributes: true });
  await new Promise((r) => setTimeout(r, secs * 1000)); mo.disconnect(); return { n, nk }; }, secs); }
async function fills(pg) { return pg.evaluate(() => { const o = {}; try { districtLayer.eachLayer((l) => { const c = (l.options && l.options.fillColor) || ''; const k = String(c).toLowerCase(); o[k] = (o[k] || 0) + 1; }); } catch (_) {} return o; }); }
const FORBID = [/\((?:experimental|reference)\)/, /, experimental\)/, /\bEWS\b/, /\bPMD\b/, /\bFFD\b/, /\bIRSA\b/, /\bEPD\b/, /v78\.8/, /V91\.16/i, /Backend: connected/, /Backend requirements/, /Interpretation: these are live modelled/, /not a tested runoff forecast/, /levels not yet tested/, /Model not yet tested here/];
const bad = (t) => FORBID.filter((r) => r.test(t)).map(String);

/* ---------------- customer view ---------------- */
if (on('customer')) { const { ctx, pg, errs } = await page(false);
  await pg.waitForFunction(() => { try { return !!(window.AGN && AGN.v41 && AGN.v283 && document.getElementById('mapHazardPick')); } catch (_) { return false; } }, null, { timeout: 240000, polling: 1000 }); await pg.waitForTimeout(20000);
  ok(await pg.evaluate(() => !!(AGN.v41 && AGN.v41.legSkip)), '1.0 the 1.0.5 block is loaded (AGN.v41)');
  const layers0 = await pg.evaluate(() => [...document.querySelectorAll('#mapHazardPick option')].filter((o) => !o.disabled).map((o) => ({ v: o.value, t: o.textContent.trim() }))); const LW = process.env.LAYERS ? process.env.LAYERS.split(',') : null; const layers = LW ? layers0.filter((l) => LW.includes(l.v || 'comfort')) : layers0;
  ok((LW ? layers.length === LW.length : layers.length >= 14) && layers.every((l) => !bad(l.t).length), '10.1 layer names without (experimental) / (reference) / developer words: ' + layers.map((l) => l.t).join(' | '), JSON.stringify(layers.filter((l) => bad(l.t).length)));
  const pal = await pg.evaluate(() => ({ disp: AGN.hz5 && AGN.hz5.scales && AGN.hz5.scales.display ? AGN.hz5.scales.display.five : null, hz5: AGN.hz5 && AGN.hz5.fill, blues: AGN.v283 && AGN.v283.BLUES, glof: AGN.v38 && AGN.v38.glofColours, v41: AGN.v41.palette().five }));
  ok(pal.disp && pal.disp.join() === RAMP.join() && pal.hz5.join() === RAMP.join() && pal.blues.slice(0, 5).join() === RAMP.join() && pal.v41.join() === RAMP.join(), '2.1 one palette: served display = level fills = amount ramp = page module', pal);
  /* v91.17.283.47 (1.0.8 item 1): GLOF is site context (lake susceptibility): a neutral palette, never the warning ramp */
  ok(pal.glof && ![pal.glof.none, pal.glof.watch, pal.glof.priority].some((c) => RAMP.includes(c)), '2.2 GLOF susceptibility in a neutral palette (not the warning ramp)', pal.glof);
  const allFills = {}; const covMissing = [], idleBad = [], wordBad = [];
  let P = { ctx, pg, errs }; const reopen = async () => { try { await P.ctx.close(); } catch (_) {} P = await page(false); await P.pg.waitForFunction(() => { try { return !!(window.AGN && AGN.v41 && document.getElementById('mapHazardPick')); } catch (_) { return false; } }, null, { timeout: 240000, polling: 1000 }); await P.pg.waitForTimeout(15000); };
  for (const l of layers) { let tries = 0; while (true) { try { await layerCheck(P.pg, l); break; } catch (e) { if (++tries > 2 || !/crash|closed|Target/i.test(String(e.message))) { ok(false, 'layer ' + l.v + ': page error', e.message); break; } await reopen(); } } }
  async function layerCheck(pg, l) { await pick(pg, l.v); await pg.waitForTimeout(14000);
    const id = await idle(pg, 5); if (id.n || id.nk) idleBad.push(l.v + ' ' + id.n + '/' + id.nk);
    const f = await fills(pg); for (const [k, v] of Object.entries(f)) allFills[k] = (allFills[k] || 0) + v;
    const cov = await pg.evaluate(() => { const ks = [...document.querySelectorAll('#mpRight .k')].find((k) => /^Coverage of this layer/.test(k.textContent || '')); return ks && ks.nextElementSibling ? ks.nextElementSibling.textContent : null; });
    if (!cov || /loading/i.test(cov)) covMissing.push(l.v + ': ' + cov);
    const txt = await pg.evaluate(() => [document.getElementById('v3legend'), document.getElementById('agn242Leg'), document.getElementById('mpRight'), document.getElementById('v283RunChip')].map((e) => (e ? e.innerText : '')).join(' \n '));
    const b = bad(txt); if (b.length) wordBad.push(l.v + ': ' + b.join(','));
    if (l.v === 'wind') { const wf = Object.entries(f).filter(([k]) => k && k !== 'undefined'); const onRamp = wf.filter(([k]) => RAMP.includes(hex(k))).reduce((a, [, v]) => a + v, 0), tot = wf.reduce((a, [, v]) => a + v, 0);
      const key = await pg.evaluate(() => { const L = document.getElementById('v3legend'); if (!L) return ''; const c = L.cloneNode(true); c.querySelectorAll('.agn-leg-basis,.agn-leg-note,.agn-leg-eng,.agn-gate-tag,.agn-rain-why,[hidden]').forEach((e) => e.remove()); return c.textContent; });
      ok(onRamp >= 500, `4.1 wind: ${onRamp} of ${tot} tehsils filled from the gust value on the ramp`, f);
      ok(/km\/h/.test(key) && !/\bSevere\b|\bModerate\b/.test(key), '4.2 wind key: gust bins in km/h, no level rows', key.slice(0, 400));
      const line = await pg.evaluate(() => (document.getElementById('mpRight') || {}).innerText || ''); ok(/gust \d+ km\/h/.test(line) && /level not tested here/.test(line), '4.3 wind place line: the gust value, level not tested here', line.slice(0, 400)); }
    if (l.v === 'rain_hz') { const line = await pg.evaluate(() => (document.getElementById('mpRight') || {}).innerText || '');
      ok(!Object.keys(f).some((k) => ['#6baed6', '#c6dbef'].includes(hex(k))), '3.1 heavy rain: no blue Normal fills', f);
      const nt = await pg.evaluate(() => { const R = AGN.v283.runInfo('rain_hz', 0), A = AGN.v283.runInfo('rain_amount', 0); let n = 0, fb = 0; if (R && R.levels) for (const u in R.levels) { if (R.levels[u] === -5) { n++; if (AGN.v41.fallback('rain_hz', u, 'not_tested')) fb++; } } return { n, fb, a: A && A.st }; });
      ok(nt.n === 0 || nt.fb === nt.n, `5.1 heavy rain: ${nt.fb} of ${nt.n} not-tested tehsils show the forecast rain value (rain amount run ${nt.a})`, nt); }
    if (SHOTS) { try { await pg.screenshot({ timeout: 60000, path: SHOTS + '/layer_' + (l.v || 'comfort') + '.png' }); } catch (_) {} } }
  const pg2 = P.pg;
  ok(!idleBad.length, '1.1 legend idle: 0 changes in 5 s on every layer (after it settles)', idleBad.join('; '));
  ok(!Object.keys(allFills).some((k) => hex(k) === '#9467c9'), '7.1 no purple "data missing" fill in the customer view on any layer', JSON.stringify(allFills));
  ok(!covMissing.length, '8.1 a coverage line on every layer, none "loading"', covMissing.join('; '));
  ok(!wordBad.length, '11.1 the key, the bottom key, the layer panel and the run chip in the customer\'s words on every layer', wordBad.join(' || '));
  /* every tab */
  const tabBad = []; if (process.env.NOTABS !== '1')
  for (const v of ['overview', 'livedata', 'assessments', 'operations', 'hybridlab', 'airisk']) { const el = await pg2.$('#agn-tab-' + v); if (!el) { tabBad.push(v + ': no tab'); continue; }
    try { await el.click({ timeout: 5000 }); } catch (_) { tabBad.push(v + ': click'); continue; } await pg2.waitForTimeout(6000);
    const t = await pg2.evaluate(() => document.body.innerText); const b = bad(t); if (b.length) tabBad.push(v + ': ' + b.join(','));
    if (SHOTS) { try { await pg2.screenshot({ timeout: 60000, path: SHOTS + '/tab_' + v + '.png' }); } catch (_) {} } }
  ok(!tabBad.length, '12.1 every tab in the customer view without forbidden words (agency names, version / developer text, gate suffixes)', tabBad.join(' || '));
  ok(!P.errs.length, '0.1 no page error (customer view)', P.errs.join(' | '));
  await P.ctx.close(); }

/* ---------------- operator view: the gate words and the purple state stay for the operator ---------------- */
if (on('operator')) { const { ctx, pg, errs } = await page(true);
  await pg.waitForFunction(() => { try { return !!(window.AGN && AGN.v41 && document.getElementById('mapHazardPick')); } catch (_) { return false; } }, null, { timeout: 240000, polling: 1000 }); await pg.waitForTimeout(20000);
  await pick(pg, 'flood_riverine'); await pg.waitForTimeout(8000);
  const o = await pg.evaluate(() => ({ op: document.documentElement.classList.contains('agn-operator'), opts: [...document.querySelectorAll('#mapHazardPick option')].map((o) => o.textContent).join(' | ') }));
  ok(o.op && /\((?:[^)]*, )?(?:experimental|reference)\)/.test(o.opts), '10.2 operator view keeps the gate words on the picker', o.opts.slice(0, 300));
  await pick(pg, 'wind'); await pg.waitForTimeout(12000); const f = await fills(pg); const onRamp = Object.entries(f).filter(([k]) => RAMP.includes(hex(k))).reduce((a, [, v]) => a + v, 0);
  ok(onRamp >= 500, '4.4 operator view: the wind map is the gust value too (' + onRamp + ' tehsils on the ramp)', f);
  if (SHOTS) { try { await pg.screenshot({ timeout: 60000, path: SHOTS + '/op_wind.png' }); } catch (_) {} }
  ok(!errs.length, '0.2 no page error (operator view)', errs.join(' | ')); await ctx.close(); }

/* ---------------- 22 · no position from the browser ---------------- */
if (on('nopos')) { const ctx = await br.newContext({ viewport: { width: 1440, height: 675 } }); const pg = await ctx.newPage();
  await pg.addInitScript(() => { try { Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (ok, er) => setTimeout(() => er && er({ code: 3, message: 'timeout' }), 15000), watchPosition: () => 0, clearWatch: () => {} } }); } catch (_) {} });
  await pg.goto(BASE + '/analyst', { waitUntil: 'load', timeout: 240000 });
  let waitAt = null, t0 = Date.now(), state = null;
  for (let i = 0; i < 45; i++) { await pg.waitForTimeout(2000); state = await pg.evaluate(() => ({ wait: !!document.querySelector('#mpLeftIn .agn195-wait,#mpRightIn .agn195-wait'), choose: !!document.querySelector('.agn41-choose'), place: !!(AGN.data && AGN.data.activePoint && AGN.data.activePoint()), label: (document.getElementById('cityLabel') || {}).textContent }));
    if (!state.wait) { waitAt = Date.now() - t0; break; } }
  ok(waitAt != null && waitAt < 60000 && (state.choose || state.place || /Choose a place/.test(state.label || '')), `22.1 no position: no endless loading (${waitAt == null ? 'still loading at 90 s' : Math.round(waitAt / 1000) + ' s'}; ${JSON.stringify(state)})`);
  if (SHOTS) { try { await pg.screenshot({ timeout: 60000, path: SHOTS + '/nopos.png' }); } catch (_) {} } await ctx.close(); }

/* ---------------- 26 · the start page ---------------- */
if (on('start')) { const ctx = await br.newContext({ viewport: { width: 1440, height: 675 }, geolocation: { latitude: 33.6844, longitude: 73.0479, accuracy: 25 }, permissions: ['geolocation'] }); const pg = await ctx.newPage();
  await pg.goto(BASE + '/', { waitUntil: 'load', timeout: 240000 }); await pg.waitForTimeout(15000);
  const s = await pg.evaluate(() => { const bars = [...document.querySelectorAll('#nvBars .bf')].map((b) => getComputedStyle(b).backgroundColor); const lg = document.getElementById('nvLegend'), sp = document.querySelector('#nvSearch,.nv-search,#nvFind') || [...document.querySelectorAll('div')].find((d) => /Weather risk for any place/.test(d.textContent || '') && d.children.length < 8);
    const a = lg && lg.getBoundingClientRect(), b = sp && sp.getBoundingClientRect(); const cts = lg ? [...lg.querySelectorAll('.ct')].map((c) => ({ t: c.textContent, h: c.getBoundingClientRect().height })) : [];
    return { bars, lg: a ? [a.top, a.bottom, a.left, a.right, a.height] : null, sp: b ? [b.top, b.bottom, b.left, b.right] : null, cts, txt: lg ? lg.innerText : '' }; });
  const lv = s.bars.map(hex); ok(lv.length > 0 && lv.every((c) => RAMP.includes(c)), '26.1 start-page bars on the ramp (Normal green): ' + [...new Set(lv)].join(','), s.bars);
  ok(s.cts.every((c) => c.h <= 20), '26.2 the key box texts are one line each', s.cts);
  ok(!s.lg || !s.sp || s.lg[0] >= s.sp[1] || s.lg[1] <= s.sp[0] || s.lg[2] >= s.sp[3] || s.lg[3] <= s.sp[2], '26.3 the key box does not overlap the search panel', s);
  ok(!/updated \d\d:\d\d/.test(s.txt) && (/forecast run \d\d:\d\d PKT/.test(s.txt) || /not available|computed|loading/i.test(s.txt)), '26.4 the time label is the forecast run (not a build stamp)', s.txt);
  if (SHOTS) { try { await pg.screenshot({ timeout: 60000, path: SHOTS + '/start.png' }); } catch (_) {} } await ctx.close(); }
await br.close(); done();
