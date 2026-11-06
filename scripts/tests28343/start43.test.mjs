/* r43 (NIGRAAN 1.0.7) · the React start page key (#nvLegend) at desktop sizes 1024x600 .. 1920x1080, before and after a place opens the
   bottom panel: never over the search panel (#hero), one-line texts, "Counted: ... · N not counted", ramp 0..max, "forecast run HH:MM PKT"
   (never "updated"), no caveat text, 0 changes to the key in 5 s while idle, the bars on the ramp.
   usage: node scripts/tests28343/start43.test.mjs <base> */
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8851';
const T = await import('/tmp/claude-0/v28340/scripts/lib/testenv.mjs'); const PW = T.playwrightSync(); const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + JSON.stringify(d).slice(0, 400))); };
const RAMP = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026'];
const hex = (c) => { const m = String(c || '').match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('') : String(c || ''); };
const CAVEAT = [/not a point level/i, /not assessed at a point/i, /not tested/i, /an area value/i, /Not counted:/, /updated \d\d:\d\d/, /experimental/i, /\(reference\)/i];
const SIZES = [[1024, 600], [1037, 649], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]];
const geom = (pg) => pg.evaluate(() => { const h = document.getElementById('hero'), l = document.getElementById('nvLegend'); if (!h || !l) return null; const a = h.getBoundingClientRect(), b = l.getBoundingClientRect();
  const vis = getComputedStyle(l).display !== 'none' && getComputedStyle(l).visibility !== 'hidden' && b.height > 0, hv = getComputedStyle(h).display !== 'none' && a.height > 0;
  return { hero: [Math.round(a.top), Math.round(a.bottom), Math.round(a.left), Math.round(a.right)], leg: [Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right)], vis, hv,
    over: vis && hv && !(b.top >= a.bottom || b.bottom <= a.top || b.left >= a.right || b.right <= a.left), cls: document.body.className.split(' ').filter((c) => /nvleg|nv-open/.test(c)).join(' ') }; });
const settle = (pg) => pg.waitForTimeout(1500);
for (const [w, h] of SIZES) {
  const ctx = await br.newContext({ viewport: { width: w, height: h } }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await pg.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => document.getElementById('nvMax') || document.getElementById('nvLegNo'), null, { timeout: 120000 }).catch(() => null); await pg.waitForTimeout(4000);
  const g0 = await geom(pg); ok(g0 && !g0.over, w + 'x' + h + ' key clear of the search panel (no place)', g0);
  const tx = await pg.evaluate(() => { const l = document.getElementById('nvLegend'); return { txt: l ? l.innerText : '', lines: l ? [...l.querySelectorAll('.ct')].map((c) => [c.textContent, Math.round(c.getBoundingClientRect().height)]) : [], max: (document.getElementById('nvMax') || {}).textContent || null }; });
  if (w === 1440) {
    ok(/^Counted: [A-Za-z ,]+( · \d+ not counted)?$/.test((tx.lines[0] || [])[0] || ''), 'counted line "Counted: ... · N not counted"', tx.lines);
    ok(tx.lines.every((l) => l[1] <= 20), 'the key texts are one line each', tx.lines);
    ok(tx.max === '3', 'ramp 0..3', tx.max);
    ok(/forecast run \d\d:\d\d PKT/.test(tx.txt) && !/updated \d\d:\d\d/.test(tx.txt), 'the time is "forecast run HH:MM PKT" (never "updated")', tx.txt);
    ok(!CAVEAT.some((r) => r.test(tx.txt)), 'no caveat text on the key', tx.txt);
    const n = await pg.evaluate(() => new Promise((res) => { let n = 0; const mo = new MutationObserver((l) => { n += l.length; }); mo.observe(document.getElementById('nvLegend'), { subtree: true, childList: true, attributes: true, characterData: true }); setTimeout(() => { mo.disconnect(); res(n); }, 5000); }));
    ok(n === 0, 'key idle: 0 changes in 5 s', n);
  }
  await pg.evaluate(() => window.__r41 && __r41.read(31.5497, 74.3436, {})); await pg.waitForFunction(() => document.body.classList.contains('nv-open'), null, { timeout: 60000 }).catch(() => null); await settle(pg);
  const g1 = await geom(pg); ok(g1 && !g1.over, w + 'x' + h + ' key clear of the search panel (place open: ' + (g1 && g1.cls) + ')', g1);
  if (w === 1440) { const bars = await pg.evaluate(() => [...document.querySelectorAll('#nvBars .bf')].map((b) => getComputedStyle(b).backgroundColor)); const lv = bars.map(hex);
    ok(lv.length > 0 && lv.every((c) => RAMP.includes(c)), 'bars on the ramp: ' + [...new Set(lv)].join(','), bars);
    const n2 = await pg.evaluate(() => new Promise((res) => { let n = 0; const mo = new MutationObserver((l) => { n += l.length; }); mo.observe(document.getElementById('nvLegend'), { subtree: true, childList: true, attributes: true, characterData: true }); setTimeout(() => { mo.disconnect(); res(n); }, 5000); }));
    ok(n2 === 0, 'key idle with the panel open: 0 changes in 5 s', n2); }
  await pg.setViewportSize({ width: w, height: Math.max(600, h - 120) }); await settle(pg); const g2 = await geom(pg); ok(g2 && !g2.over, w + 'x' + Math.max(600, h - 120) + ' after a resize (place open)', g2);
  ok(!errs.length, w + 'x' + h + ' no page error', errs); await ctx.close(); }
await br.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
