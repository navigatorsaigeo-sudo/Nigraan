/* v91.17.283.48 (NIGRAAN 1.0.9) item 4 · operator view clean-up on the classic analyst page.
   (a) the tehsil's area-input block (operator only) shows only inputs that are held: no "Not available" or "…" cell after the panel settles;
       none held -> one line "Area inputs not available for this tehsil"; (b) site-context keys (GLOF, earthquake zone, cyclone, ground sponge)
       carry one "Site context · raises no alert" line in the operator view and none in the customer view.
   usage: node scripts/tests28349/opview49.test.mjs <base url> [out dir]   (env PLACES as n3dash49) */
const [BASE, OUT = '/dev/shm/opview49'] = process.argv.slice(2); const fs = await import('node:fs'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = new URL('../..', import.meta.url).pathname; const T = await import(ROOT + 'scripts/lib/testenv.mjs'); const PW = T.playwrightSync();
const PLACES = (process.env.PLACES || '33.66860,73.07520,Islamabad I-8/3;24.81380,67.03000,Karachi coast;31.54970,74.34360,Lahore;36.31670,74.65000,Hunza;30.17980,66.97500,Quetta').split(';').map((x) => { const a = x.split(','); return { lat: +a[0], lon: +a[1], name: a.slice(2).join(',') }; });
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
for (const VIEW of ['operator', 'customer']) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } } catch (_) {} window.open = () => null; }, VIEW === 'operator');
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await pg.goto(BASE + '/analyst', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(22000);
  for (const L of ['glof', 'seismic', 'cyclone', 'nss_baseline', 'heat']) {
    await pg.evaluate((L) => { const s = document.getElementById('mapHazardPick'); s.value = L; s.dispatchEvent(new Event('change', { bubbles: true })); }, L); await pg.waitForTimeout(6000);
    const t = await pg.evaluate(() => { const l = document.getElementById('v3legend'); return l ? l.innerText : ''; }); const n = (t.match(/Site context · raises no alert/g) || []).length;
    if (L === 'heat') ok(n === 0, VIEW + ' ' + L + ': not a site-context layer, no site-context line');
    else ok(VIEW === 'operator' ? n === 1 : n === 0, VIEW + ' ' + L + ': "Site context · raises no alert" ' + (VIEW === 'operator' ? 'once' : 'absent') + ' (' + n + ')', t.slice(-200)); }
  if (VIEW === 'operator') for (const P of PLACES) {
    await pg.evaluate((p) => { if (window.driveFromPoint) window.driveFromPoint(p.lat, p.lon, p.name, true); }, P);
    await pg.click('#agn-tab-livedata', { timeout: 8000 }).catch(() => null); await pg.waitForTimeout(25000);
    const r = await pg.evaluate(() => { const b = [...document.querySelectorAll('.mp-cap')].find((e) => /area inputs of the tehsil/.test(e.textContent)); if (!b) return null; const box = b.parentElement;
      return { cells: [...box.querySelectorAll('.mp-c')].map((c) => c.innerText.replace(/\s+/g, ' ')), line: (box.querySelector('.agn-v49-noarea') || {}).textContent || null, vis: !!box.offsetParent }; });
    ok(r && (r.cells.length || r.line) && !r.cells.some((c) => /Not available|…|—/.test(c)) && (r.cells.length ? !r.line : /Area inputs not available for this tehsil/.test(r.line)), 'operator ' + P.name + ': area inputs only where held (' + (r ? r.cells.length + ' cells' + (r.line ? ', line' : '') : 'no block') + ')', JSON.stringify(r));
    await pg.screenshot({ path: OUT + '/area_' + P.name.replace(/\W+/g, '_') + '.png' }).catch(() => null); }
  ok(errs.length === 0, VIEW + ': no page error', errs.join(' | ')); await ctx.close();
}
await br.close(); console.log('opview49: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
