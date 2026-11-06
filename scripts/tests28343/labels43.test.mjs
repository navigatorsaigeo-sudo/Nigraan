/* r43 (NIGRAAN 1.0.7) · the React Overview map's classic elements and the page's layout at desktop sizes:
   - "°C air now" labels: one per place (no place twice), none overlapping another label, a capital name or the selected pin's labels,
     at Pakistan zoom and at zoom 8 and 10; each label's value equals the server's held sweep value of that place (sweep-labels);
     the selected place's label equals the toolbar's "now" (one value per place); none at the street zoom (12);
   - capitals, rivers (canvas) and AGN station pins present below the street zoom, none at the street zoom;
   - the info bar, tab row and map footer: no two controls overlap, nothing spills out of its bar, at 1024x600 .. 1920x1080
     (the analyst page keeps its 1280 px minimum width with page scroll, as the classic page);
   - the key strip: 0 DOM changes in 3 s idle; Details shows each class with a range or count and the coverage line.
   usage: node scripts/tests28343/labels43.test.mjs <base>   (base serves /app/analyst) */
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
const T = await import(new URL('../lib/testenv.mjs', import.meta.url).href); const PW = T.playwrightSync(); if (!PW) T.skip('no Playwright');
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + JSON.stringify(d).slice(0, 500))); };
const SW = await (await fetch(BASE + '/api/pointstate/sweep-labels')).json(); const byName = {}; (SW.places || []).forEach((p) => { byName[p.lat.toFixed(4) + ',' + p.lon.toFixed(4)] = p; });
ok(SW.ok === true && SW.places.length > 100, 'sweep-labels answers the held pass', { ok: SW.ok, n: (SW.places || []).length, why: SW.why });
const overlap = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
const geomLabels = (pg) => pg.evaluate(() => { const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const labs = [...document.querySelectorAll('.agn-tlab span')].map((e) => ({ ...R(e), txt: e.textContent, sel: e.parentElement.classList.contains('sel'), ll: (() => { const m = e.closest('.leaflet-marker-icon'); return m ? m.title || '' : ''; })() }));
  const caps = [...document.querySelectorAll('.capital-anchor span')].filter((e) => e.offsetParent && getComputedStyle(e.closest('.leaflet-pane')).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').map(R);
  const map = window.__r41ov; const pts = []; map.eachLayer((l) => { if (l.options && l.options.pane === 'agnTemp' && l.getLatLng) { const ll = l.getLatLng(); pts.push([ll.lat.toFixed(4) + ',' + ll.lng.toFixed(4), l.getElement() ? l.getElement().textContent : '']); } });
  return { labs, caps, pts, zoom: map.getZoom(), rivers: document.querySelectorAll('canvas.agn-rivers').length, riverShown: (() => { const p = map.getPane('agnRiver'); return p ? getComputedStyle(p).display !== 'none' : false; })(), stn: document.querySelectorAll('.agn-stn').length,
    now: (document.querySelector('.ov-hero [data-num="tempNow"]') || {}).textContent || null }; });
{ const ctx = await br.newContext({ viewport: { width: 1440, height: 675 }, geolocation: { latitude: 33.6844, longitude: 73.0479 }, permissions: ['geolocation'] }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await pg.goto(BASE + '/app/analyst', { waitUntil: 'load', timeout: 180000 }); await pg.waitForFunction(() => document.querySelector('.ov-hero [data-num="tempNow"]'), null, { timeout: 120000 }).catch(() => null); await pg.waitForTimeout(4000);
  for (const [z, lat, lon] of [[5.25, 30.4, 69.3], [8, 33.6844, 73.0479], [10, 33.6844, 73.0479], [12.5, 33.6844, 73.0479]]) {
    await pg.evaluate(([z, lat, lon]) => window.__r41ov.setView([lat, lon], z, { animate: false }), [z, lat, lon]); await pg.waitForTimeout(1500);
    const g = await geomLabels(pg);
    if (z >= 12) { ok(g.labs.length === 0 && g.stn === 0 && !g.riverShown, 'street zoom ' + z + ': no temperature label, no station pin, no rivers', { labs: g.labs.length, stn: g.stn, rivers: g.riverShown }); continue; }
    ok(g.labs.length > 0, 'zoom ' + z + ': temperature labels drawn', g.labs.length);
    const keys = g.pts.map((p) => p[0]); ok(new Set(keys).size === keys.length, 'zoom ' + z + ': one label per place', keys.length);
    let ov = []; for (let i = 0; i < g.labs.length; i++) { for (let j = i + 1; j < g.labs.length; j++) if (overlap(g.labs[i], g.labs[j])) ov.push([g.labs[i].txt, g.labs[j].txt]); for (const c of g.caps) if (overlap(g.labs[i], c)) ov.push([g.labs[i].txt, 'capital']); }
    ok(!ov.length, 'zoom ' + z + ': no label overlaps another label or a capital name', ov.slice(0, 5));
    const bad = g.pts.filter(([k, txt]) => { const p = byName[k]; if (!p) return false; return txt !== String(Math.round(p.tempC * 10) / 10) + '°C air now'; });
    ok(!bad.length, 'zoom ' + z + ': every label = the held sweep value of its place', bad.slice(0, 5));
    const sel = g.labs.find((l) => l.sel); ok(sel && g.now && sel.txt === g.now + '°C air now', 'zoom ' + z + ': the selected place label = the toolbar now', { sel: sel && sel.txt, now: g.now });
    ok(g.rivers === 1 && g.riverShown && g.caps.length > 0 && g.stn > 0, 'zoom ' + z + ': rivers, capitals and AGN station pins', { rivers: g.rivers, caps: g.caps.length, stn: g.stn });
  }
  await pg.evaluate(() => window.__r41ov.fitBounds([[23.6, 60.8], [37.1, 77.9]])); await pg.waitForTimeout(1500);
  const mut = await pg.evaluate(() => new Promise((res) => { let n = 0; const el = document.querySelector('.r41-legend'); if (!el) return res(-1); const mo = new MutationObserver((l) => { n += l.length; }); mo.observe(el, { subtree: true, childList: true, attributes: true, characterData: true }); setTimeout(() => { mo.disconnect(); res(n); }, 3000); }));
  ok(mut === 0, 'key strip: 0 changes in 3 s idle', mut);
  await pg.click('.ov-det'); await pg.waitForTimeout(600); const det = await pg.evaluate(() => { const d = document.querySelector('.r43-legdet'); return d ? { rows: [...d.querySelectorAll('tr')].map((r) => r.innerText.replace(/\s+/g, ' ')), txt: d.innerText } : null; });
  ok(det && det.rows.length >= 5 && det.rows.slice(0, 5).every((r) => /tehsil|UTCI/.test(r)) && /Coverage of this layer: \d+ of \d+ tehsils/.test(det.txt), 'key Details: classes with UTCI ranges and tehsil counts, coverage line', det);
  ok(!errs.length, 'no page error', errs); await ctx.close(); }
/* layout: the info bar, the tab row and the map footer at desktop sizes */
for (const [w, h] of [[1024, 600], [1037, 649], [1280, 720], [1366, 648], [1440, 675], [1920, 1080]]) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, geolocation: { latitude: 33.6844, longitude: 73.0479 }, permissions: ['geolocation'] }); const pg = await ctx.newPage();
  await pg.goto(BASE + '/app/analyst', { waitUntil: 'load', timeout: 180000 }); await pg.waitForFunction(() => document.querySelector('.ov-hero [data-num="tempNow"]'), null, { timeout: 120000 }).catch(() => null); await pg.waitForTimeout(2500);
  const r = await pg.evaluate(() => { const out = []; for (const sel of ['.ah', '.tabs', '.ov-bar', '.ov-foot']) { const bar = document.querySelector(sel); if (!bar) { out.push([sel, 'missing']); continue; } const B = bar.getBoundingClientRect();
      const kids = [...bar.querySelectorAll(':scope > *')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => [e.className || e.tagName, e.getBoundingClientRect()]);
      for (let i = 0; i < kids.length; i++) { const a = kids[i][1]; if (a.left < B.left - 1 || a.right > B.right + 1) out.push([sel, 'spills', String(kids[i][0])]); for (let j = i + 1; j < kids.length; j++) { const b = kids[j][1]; if (!(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5)) out.push([sel, 'overlap', String(kids[i][0]), String(kids[j][0])]); } } }
    return out; });
  ok(!r.length, w + 'x' + h + ' analyst bars: no overlap, nothing spills', r.slice(0, 6)); await ctx.close(); }
await br.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
