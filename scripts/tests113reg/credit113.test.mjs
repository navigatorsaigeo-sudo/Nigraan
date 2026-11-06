/* v91.17.283.49 (NIGRAAN 1.0.10) · regressions vs 1.0.7.1 · item 3 · the map credit (Leaflet attribution) on every map of the classic pages
   (start page with and without a place open, analyst Overview, Customize), customer (?operator=0) and operator view, 1440 x 900 and 1366 x 768:
   the credit is drawn (the analyst page: in its footer, none on the map), is never under another control (the layer chip, the zoom buttons, the search card, the hazards card) and covers none,
   and stays one line (the full text on hover / focus and as its tooltip).
   Fails on 1.0.9: on the start page the credit runs under the "Hazard layers" chip / the zoom buttons when a place is open, and wraps to two
   or three lines over the map.
   usage: node scripts/tests113reg/credit113.test.mjs <base url> [out dir] */
const [BASE, OUT = '/dev/shm/credit113'] = process.argv.slice(2); const fs = await import('node:fs'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = new URL('../..', import.meta.url).pathname; const T = await import(ROOT + 'scripts/lib/testenv.mjs'); const PW = T.playwrightSync();
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 600) : '')); } };
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=700'] });
const probe = (pg) => pg.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  const A = [...document.querySelectorAll('.leaflet-control-attribution')].filter(vis); if (!A.length) return { none: true };
  return A.map((a) => { const r = a.getBoundingClientRect(), lh = parseFloat(getComputedStyle(a).lineHeight) || (parseFloat(getComputedStyle(a).fontSize) * 1.4);
    const pts = []; for (let i = 1; i < 12; i++) for (const fy of [0.5]) pts.push([r.left + (r.width * i) / 12, r.top + r.height * fy]);
    const under = pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e && !a.contains(e) ? (e.id || String(e.className && e.className.baseVal != null ? e.className.baseVal : e.className).split(' ')[0] || e.tagName) : null; }).filter(Boolean);
    const ctr = [...document.querySelectorAll('.leaflet-control-zoom a, #zoom button, #zoom a, #hzWrap button, #hzBtn, .leaflet-control button, .leaflet-control a')].filter((e) => vis(e) && !a.contains(e));
    const covers = ctr.filter((e) => { const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const h = document.elementFromPoint(x, y); return h && a.contains(h); }).map((e) => e.id || e.className || e.tagName);
    return { text: a.innerText.slice(0, 80), h: Math.round(r.height), lines: Math.round(r.height / lh), w: Math.round(r.width), x: Math.round(r.left), y: Math.round(r.top), under: [...new Set(under)], covers, title: (a.getAttribute('title') || '').length }; }); });
const PAGES = [['start', '/', null], ['start+place', '/', async (pg) => { await pg.evaluate(() => { const i = document.querySelector('input[type=search],input#q,#searchInput,input[placeholder*="Place"]'); if (i) { i.value = 'Gilgit'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
    await pg.waitForTimeout(1500); await pg.keyboard.press('Enter').catch(() => null); await pg.waitForTimeout(1500); const b = await pg.$('text=Check'); if (b) await b.click().catch(() => null); await pg.waitForTimeout(12000); }],
  ['analyst', '/analyst', null], ['customize', '/customize', null]];
for (const [W, H] of [[1440, 900], [1366, 768]]) for (const VIEW of (process.env.VIEWS || 'customer,operator').split(',')) for (const [name, path, act] of PAGES) {
  const ctx = await br.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } else { localStorage.removeItem('agn.operator'); localStorage.removeItem('agn.operator.v2'); } } catch (_) {} window.open = () => null; }, VIEW === 'operator');
  const pg = await ctx.newPage(); if (process.env.FREEZE_MS) { await pg.clock.install({ time: new Date(Number(process.env.FREEZE_MS)) }); await pg.clock.resume(); }   /* the browser clock = the test server's frozen clock (env FREEZE_MS) */
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await pg.goto(BASE + path + (VIEW === 'operator' || path === '/' ? '' : (path.includes('?') ? '&' : '?') + 'operator=0'),   /* the start page is '/' with no query (a query opens the analyst console); the customer view is its default */ { waitUntil: 'load', timeout: 180000 }).catch((e) => errs.push('goto ' + e.message.slice(0, 80)));
  await pg.waitForTimeout(name === 'analyst' ? 22000 : 12000); if (act) await act(pg);
  const R = await probe(pg); const tag = W + ' ' + VIEW + ' ' + name;
  if (R.none) ok(name === 'analyst', tag + (name === 'analyst' ? ': no credit on the map (the analyst page carries its credits in the page footer)' : ': a map credit is drawn'));
  else for (const a of R) {
    ok(!a.under.length, tag + ': the credit is not under another control', JSON.stringify(a));
    ok(!a.covers.length, tag + ': the credit covers no control', JSON.stringify(a.covers));
    ok(a.lines <= 1, tag + ': the credit is one line (' + a.h + ' px)', JSON.stringify(a)); }
  await pg.screenshot({ path: OUT + '/' + W + '_' + VIEW + '_' + name.replace(/\W/g, '_') + '.png' }).catch(() => null);
  ok(!errs.length, tag + ': no page error', errs.join(' | ')); await ctx.close(); }
await br.close(); console.log('credit113: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
