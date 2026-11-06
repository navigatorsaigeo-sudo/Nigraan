/* v91.17.283.49 (NIGRAAN 1.0.10) · regressions vs 1.0.7.1 · item 1 · the ground-sponge VALUE layers on the classic analyst page, customer
   (?operator=0) and operator view. For nss_baseline and nss_runoff (and nss_dynamic / nss_retention where the layer list offers them):
   - the tehsils are filled in their served class on the value ramp (data/map-layer-scales.json valuePalette): at least two classes drawn,
     every class fill one of the layer's valuePalette colours, none of the hazard colours (yellow .. dark red), no blue / navy;
   - the key has one row per class: the class word (the served words), its range with the unit, the tehsil count, the class swatch; and
     the counts in the key equal the tehsils drawn in that colour;
   - the map popup (place card) of a tehsil names its class with the class colour;
   - nss_baseline draws the 250 m class tiles (/tiles/sponge/...), in the ramp colours.
   Fails on 1.0.9 (every tehsil Normal green, one "Normal" key row, no 250 m tiles).
   usage: node scripts/tests113reg/sponge113.test.mjs <base url> [out dir] */
const [BASE, OUT = '/dev/shm/sponge113'] = process.argv.slice(2); const fs = await import('node:fs'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = new URL('../..', import.meta.url).pathname; const T = await import(ROOT + 'scripts/lib/testenv.mjs'); const PW = T.playwrightSync();
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const HAZ = ['#ffe680', '#fdae61', '#e8552d', '#a50026', '#67001f'];
const BLUE = (hex) => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || ''); if (!m) return false; const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d || d / mx < 0.12) return false;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return h >= 185 && h <= 245; };
const SC = await (await fetch(BASE + '/api/map/layer?id=scales:map')).json();
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=700'] });
for (const VIEW of (process.env.VIEWS || 'customer,operator').split(',')) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } else { localStorage.removeItem('agn.operator'); localStorage.removeItem('agn.operator.v2'); } } catch (_) {} window.open = () => null; }, VIEW === 'operator');
  const pg = await ctx.newPage(); pg.setDefaultTimeout(60000); if (process.env.FREEZE_MS) { await pg.clock.install({ time: new Date(Number(process.env.FREEZE_MS)) }); await pg.clock.resume(); }   /* the browser clock = the test server's frozen clock (env FREEZE_MS) */
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 160))); const tiles = []; pg.on('response', (r) => { if (/\/tiles\/sponge\//.test(r.url())) tiles.push({ url: r.url(), st: r.status() }); });
  await pg.goto(BASE + '/analyst' + (VIEW === 'operator' ? '' : '?operator=0'), { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(25000);
  const offered = await pg.evaluate(() => [...document.querySelectorAll('#mapHazardPick option')].filter((o) => !o.hidden && !o.disabled && o.value).map((o) => o.value));
  const LAYERS = ['nss_baseline', 'nss_runoff', 'nss_dynamic', 'nss_retention'].filter((L) => L === 'nss_baseline' || offered.includes(L));   /* the sponge layers this view offers (customer: Ground sponge) */
  console.log('NOTE ' + VIEW + ' sponge layers offered: ' + LAYERS.join(', '));
  for (const L of LAYERS) {
    const S = SC.layers[L], VP = (S.valuePalette || []).map((c) => c.toLowerCase());
    await pg.evaluate((L) => { const s = document.getElementById('mapHazardPick'); s.value = L; s.dispatchEvent(new Event('change', { bubbles: true })); }, L); await pg.waitForTimeout(6000);
    const settled = () => pg.waitForFunction(() => { const l = document.getElementById('v3legend'); return l && !/Loading levels|Loading…/.test(l.innerText); }, null, { timeout: 150000 }).then(() => true, () => false);
    if (!(await settled())) { await pg.evaluate((L) => { const s = document.getElementById('mapHazardPick'); s.value = 'heat'; s.dispatchEvent(new Event('change', { bubbles: true })); setTimeout(() => { s.value = L; s.dispatchEvent(new Event('change', { bubbles: true })); }, 3000); }, L); await pg.waitForTimeout(9000); await settled(); }
    await pg.waitForTimeout(2500);
    const r = await pg.evaluate(() => { const norm = (c) => { if (!c || c === 'none') return c; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c.toLowerCase(); const p = m[1].split(',').map((x) => +x.trim()); if (p.length > 3 && p[3] === 0) return 'transparent'; return '#' + p.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join(''); };
      const fills = {}; document.querySelectorAll('.leaflet-overlay-pane path').forEach((p) => { const f = p.getAttribute('fill') || getComputedStyle(p).fill; const k = f && f.startsWith('url') ? 'pattern' : norm(f); fills[k] = (fills[k] || 0) + 1; });
      const leg = document.getElementById('v3legend'); const rows = leg ? [...leg.querySelectorAll('.agn-leg-row')].map((x) => { const i = x.querySelector('i'); return { c: i ? norm(getComputedStyle(i).backgroundColor) : '', t: x.innerText.replace(/\s+/g, ' ').trim() }; }) : [];
      return { fills, rows, txt: leg ? leg.innerText : '' }; });
    const classFills = Object.entries(r.fills).filter(([c]) => VP.includes(c));
    const SV = await (await fetch(BASE + '/api/levels?layer=' + L + '&day=0', { headers: VIEW === 'operator' ? { 'x-agn-view': 'operator' } : {} })).json(); const SCN = SV.counts || [];   /* the served class counts (class index 0..4) */
    ok(classFills.length >= 1 && VP.every((c, i) => Math.abs((r.fills[c] || 0) - (SCN[i] || 0)) <= 2) && (SCN.filter((n) => n > 0).length < 2 || classFills.length >= 2),
      VIEW + ' ' + L + ': every tehsil drawn in its served class colour (served ' + JSON.stringify(SCN) + '; drawn ' + classFills.map(([c, n]) => c + ':' + n).join(' ') + ')', JSON.stringify(r.fills));
    ok(!Object.entries(r.fills).some(([c, n]) => n > 3 && (HAZ.includes(c) || c === '#74c476')), VIEW + ' ' + L + ': no hazard level colour (green Normal .. dark red) on a value layer', JSON.stringify(r.fills));
    ok(!Object.entries(r.fills).some(([c, n]) => n > 3 && BLUE(c)) && !r.rows.some((x) => BLUE(x.c)), VIEW + ' ' + L + ': no blue / navy on the map or the key');
    const crow = r.rows.filter((x) => VP.includes(x.c) && !/Holds less/.test(x.t));   /* the class rows (not the ramp line under them) */
    const named = crow.filter((x) => S.words.some((w) => x.t.includes(w)) && (S.unit ? x.t.includes(S.unit) : true));
    ok(crow.length === 5 && named.length === 5, VIEW + ' ' + L + ': the key names the 5 classes with range and unit (' + S.unit + ')', JSON.stringify(r.rows.slice(0, 8)));
    const counts = crow.map((x) => { const m = x.t.match(/(\d+)\s*$/); return { c: x.c, n: m ? +m[1] : null }; });
    ok(counts.every((x) => x.n != null && Math.abs(x.n - (r.fills[x.c] || 0)) <= 2), VIEW + ' ' + L + ': key counts = tehsils drawn in each class colour', JSON.stringify(counts) + ' fills ' + JSON.stringify(r.fills));
    ok(!/Normal · no tested threshold/.test(r.txt), VIEW + ' ' + L + ': no single "Normal" row');
    /* the map popup of one tehsil in a class */
    const pop = await pg.evaluate(async (VP) => { const norm = (c) => { const m = String(c || '').match(/rgba?\(([^)]+)\)/); if (!m) return String(c || '').toLowerCase(); const p = m[1].split(',').map((x) => +x.trim()); return '#' + p.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join(''); };
      const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')].filter((p) => VP.includes(norm(p.getAttribute('fill') || ''))).map((p) => ({ p, r: p.getBoundingClientRect() })).filter((x) => x.r.width > 8 && x.r.height > 8 && x.r.top > 100 && x.r.left > 40);
      if (!paths.length) return null; const m = document.getElementById('map').getBoundingClientRect(); paths.sort((a, b) => Math.hypot(a.r.left + a.r.width / 2 - (m.left + m.width / 2), a.r.top + a.r.height / 2 - (m.top + m.height / 2)) - Math.hypot(b.r.left + b.r.width / 2 - (m.left + m.width / 2), b.r.top + b.r.height / 2 - (m.top + m.height / 2)));
      return paths.slice(0, 4).map((x) => ({ fill: norm(x.p.getAttribute('fill')), x: x.r.left + x.r.width / 2, y: x.r.top + x.r.height / 2 })); }, VP);   /* the class tehsils nearest the map centre */
    if (pop && pop.length) { for (const c of pop) { await pg.evaluate(() => { try { map.closePopup(); } catch (_) {} }); await pg.mouse.click(c.x, c.y); await pg.waitForTimeout(2500); if (await pg.$('.leaflet-popup-content')) break; }
      const pr = await pg.evaluate(() => { const c = document.querySelector('.leaflet-popup-content'); if (!c) return null; const sw = [...c.querySelectorAll('i,span,b,div')].map((e) => getComputedStyle(e).backgroundColor).filter((b) => b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b));
        return { t: c.innerText.replace(/\s+/g, ' ').slice(0, 300), sw: sw.map((b) => { const p = b.match(/\d+/g).map(Number); return '#' + p.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join(''); }) }; });
      ok(pr && S.words.some((w) => pr.t.includes(w)) && pr.sw.some((c) => VP.includes(c)), VIEW + ' ' + L + ': the tehsil card names its class with the class colour', JSON.stringify(pr));
      await pg.keyboard.press('Escape').catch(() => null); await pg.evaluate(() => { try { map.closePopup(); } catch (_) {} }); }
    else ok(false, VIEW + ' ' + L + ': a class tehsil to click');
    await pg.screenshot({ path: OUT + '/' + VIEW + '_' + L + '.png' }).catch(() => null);
    if (L === 'nss_baseline') { await pg.waitForTimeout(3000); const ok200 = tiles.filter((t) => t.st === 200);
      ok(ok200.length > 0, VIEW + ' nss_baseline: the 250 m class tiles are drawn (' + ok200.length + ' tiles)', JSON.stringify(tiles.slice(0, 3)));
      if (ok200.length) { const buf = Buffer.from(await (await pg.request.get(ok200[0].url)).body()); const i = buf.indexOf('PLTE'); const pal = i > 0 ? buf.subarray(i + 4, i + 4 + 15).toString('hex') : '';
        ok(pal === (SC.display.sponge.ramp || []).map((c) => c.slice(1).toLowerCase()).join(''), VIEW + ' nss_baseline: the 250 m tiles are in the value ramp', pal); } }
  }
  ok(errs.length === 0, VIEW + ': no page error', errs.join(' | ')); await ctx.close();
}
await br.close(); console.log('sponge113: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
