/* v91.17.283.46 (NIGRAAN 1.0.8.1) · the GLOF layer as the owner saw it (Lahore selected), customer and operator view: no
   "experimental / display only" tag, no "daily map shift is disabled", no day chips on a site-context layer, one "Cannot happen here"
   (never doubled), the cannot-happen hatch neutral (never pink), the lakes-upstream tehsils green (#74c476), no blue fill.
   usage: FREEZE_MS=<ms> node scripts/tests283461/glofview461.test.mjs BASE [shotdir] */
const T = await import(new URL('../lib/testenv.mjs', import.meta.url).href); const PW = T.playwrightSync();
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, ''), SHOT = process.argv[3] || null; const F0 = Number(process.env.FREEZE_MS || Date.now());
let fails = 0; const ok = (c, m, i) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (!c && i != null ? ' :: ' + String(i).slice(0, 400) : '')); if (!c) fails++; };
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-gpu', '--renderer-process-limit=2', '--disable-extensions'] });
for (const view of ['customer', 'operator']) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 675 } }); const pg = await ctx.newPage(); await pg.clock.install({ time: new Date(F0) }); await pg.clock.resume();
  await pg.route(/\/tiles\//, (r) => r.abort());
  await pg.goto(BASE + '/analyst' + (view === 'operator' ? '?operator=1' : '') + '#agnplace=31.54970,74.34360,Lahore', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(25000);
  await pg.evaluate(() => { const s = document.getElementById('mapHazardPick'); if (s) { s.value = 'glof'; s.dispatchEvent(new Event('change', { bubbles: true })); } }); await pg.waitForTimeout(12000);
  const r = await pg.evaluate(() => { const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; const txt = document.body.innerText;
    const fills = new Set(); document.querySelectorAll('#map path.leaflet-interactive').forEach((p) => { const f = (p.getAttribute('fill') || '').toLowerCase(); if (f) fills.add(f); });
    const pat = document.querySelector('#agnNAHatch rect'), line = document.querySelector('#agnNAHatch line');
    return { layer: typeof currentMapLayer === 'function' ? currentMapLayer() : null, exp: /experimental|display only, raises no alerts/i.test((document.getElementById('v3legend')||{}).innerText||''), shift: /daily map shift/i.test(txt), dbl: /cannot happen here\W+cannot happen here/i.test(txt),
      days: vis(document.getElementById('v3days')), fills: [...fills], hatch: pat ? [pat.getAttribute('fill'), line && line.getAttribute('stroke')] : null, sc: /Site context · raises no alert/.test(txt), m: (txt.match(/[^\n]{0,80}(experimental|display only|cannot happen here\W+cannot happen here)[^\n]{0,80}/gi) || []).slice(0, 6) }; });
  if (SHOT) await pg.screenshot({ path: SHOT + '/glof_' + view + '.png' });
  ok(r.layer === 'glof', view + ': GLOF layer selected', JSON.stringify(r));
  ok(!r.exp && !r.shift && !r.dbl, view + ': no experimental / display-only tag in the key, no "daily map shift", no doubled cannot-happen', JSON.stringify(r));
  ok(!r.days, view + ': no day chips on the site-context layer', JSON.stringify(r));
  ok(!r.fills.some((f) => /#(2f6f9f|7fb0d6|d3e4f2)/.test(f)) && r.fills.includes('#74c476'), view + ': lakes-upstream tehsils green, no blue fill (' + r.fills.slice(0, 6).join(' ') + ')', JSON.stringify(r.fills));
  ok(!r.hatch || (r.hatch[0] === '#f4f4f1' && r.hatch[1] === '#c9cdc7'), view + ': cannot-happen hatch is neutral grey', JSON.stringify(r.hatch));
  await ctx.close(); }
await br.close(); console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
