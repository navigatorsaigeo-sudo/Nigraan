/* v91.17.283.48 (NIGRAAN 1.0.9) item 2 · the owner's ONE COLOUR RULE on the ground-sponge layers, and the rule re-checked on every layer.
   For each map layer of the classic analyst page (customer and operator view): the fills drawn on the tehsils and the key's swatches/words.
   Checks (1.0.10: sponge = value layer, its classes on the value ramp, the 250 m class overlay drawn again): nss_baseline / nss_dynamic /
   nss_runoff in their class colours (no yellow..dark red), the key names the classes; no layer draws or keys a blue/navy
   data colour; the key says "Light grey hatch" (never "Pink hatch"); the heavy-rain key has no blue rows.
   usage: node scripts/tests28349/colour49.test.mjs <base url> [out dir] */
const [BASE, OUT = '/dev/shm/colour49'] = process.argv.slice(2); const fs = await import('node:fs'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = new URL('../..', import.meta.url).pathname; const T = await import(ROOT + 'scripts/lib/testenv.mjs'); const PW = T.playwrightSync();
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const RAMP = ['#ffe680', '#fdae61', '#e8552d', '#a50026', '#67001f'];
const BLUE = (hex) => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || ''); if (!m) return false; const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d || d / mx < 0.12) return false;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return h >= 185 && h <= 245; };   /* a blue / navy hue (hue 185-245 deg, saturation >= 0.12); the purple of 'data missing' (operator) and the light greys are not blue */
const SPONGE = ['nss_baseline', 'nss_dynamic', 'nss_runoff'];
const __SC = await (await fetch(BASE + '/api/map/layer?id=scales:map')).json(); globalThis.window = globalThis.window || {}; window.__SC113 = Object.fromEntries(SPONGE.map((k) => [k, ((__SC.layers[k] || {}).valuePalette || []).map((c) => c.toLowerCase())]));
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1'] });
for (const VIEW of ['customer', 'operator']) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } } catch (_) {} window.open = () => null; }, VIEW === 'operator');
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 160))); const tiles = []; pg.on('request', (r) => { if (/\/tiles\/sponge\//.test(r.url())) tiles.push(r.url()); });
  await pg.goto(BASE + '/analyst', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(25000);
  const layers = await pg.evaluate(() => [...document.querySelectorAll('#mapHazardPick option')].filter((o) => !o.hidden && !o.disabled && o.value).map((o) => o.value));
  for (const L of layers) {
    await pg.evaluate((L) => { const s = document.getElementById('mapHazardPick'); s.value = L; s.dispatchEvent(new Event('change', { bubbles: true })); }, L); await pg.waitForTimeout(6000);
    const settled = () => pg.waitForFunction(() => { const l = document.getElementById('v3legend'); return l && !/Loading levels|Loading…/.test(l.innerText); }, null, { timeout: 40000 }).then(() => true, () => false);
    if (!(await settled())) { console.log('NOTE ' + VIEW + ' ' + L + ': the key still said "Loading levels" after 46 s (pre-existing in 1.0.8.2 too); the layer is chosen once more');
      await pg.evaluate((L) => { const s = document.getElementById('mapHazardPick'); s.value = 'heat'; s.dispatchEvent(new Event('change', { bubbles: true })); setTimeout(() => { s.value = L; s.dispatchEvent(new Event('change', { bubbles: true })); }, 3000); }, L); await pg.waitForTimeout(9000); await settled(); }
    const r = await pg.evaluate(() => { const norm = (c) => { if (!c || c === 'none') return c; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c.toLowerCase(); const p = m[1].split(',').map((x) => +x.trim()); if (p.length > 3 && p[3] === 0) return 'transparent'; return '#' + p.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join(''); };
      const fills = {}; document.querySelectorAll('.leaflet-overlay-pane path').forEach((p) => { const f = p.getAttribute('fill') || getComputedStyle(p).fill; const k = f && f.startsWith('url') ? 'pattern' : norm(f); fills[k] = (fills[k] || 0) + 1; });
      const leg = document.getElementById('v3legend'); const sw = leg ? [...leg.querySelectorAll('i')].map((i) => norm(getComputedStyle(i).backgroundColor)).filter((x) => x && x !== 'transparent') : [];
      return { fills, sw, txt: leg ? leg.innerText : '' }; });
    const big = Object.entries(r.fills).filter(([c, n]) => n > 3 && c !== '#e5ebf0' && c !== 'none' && c !== 'transparent');   /* #e5ebf0: the neighbouring countries' land */
    if (SPONGE.includes(L)) {
      /* v91.17.283.49 (1.0.10, regressions vs 1.0.7.1): a sponge layer is a VALUE layer: its served classes on the sand..sea-green value ramp
         (data/map-layer-scales.json valuePalette), never the hazard colours; the key names the classes (scripts/tests113reg/sponge113.test.mjs) */
      const VP = ((window.__SC113 || {})[L] || []);
      ok(big.length > 0 && big.every(([c]) => VP.includes(c) || c === 'pattern' || c === '#9467c9' || c === '#c3ccd3' || c === '#d9c9a3'), VIEW + ' ' + L + ': every tehsil with a value in its class colour on the value ramp (no level colour)', JSON.stringify(r.fills));
      ok(!r.sw.some((c) => RAMP.includes(c)), VIEW + ' ' + L + ': no yellow..dark red swatch in the key', r.sw.join(','));
      ok(!/Normal · no tested threshold/.test(r.txt) && /Sealed: runs off like pavement|25 mm or more|Under 1 mm/.test(r.txt), VIEW + ' ' + L + ': the key names the classes (no single Normal row)', r.txt.slice(0, 300));
    }
    ok(!big.some(([c]) => BLUE(c)) && !r.sw.some(BLUE), VIEW + ' ' + L + ': no blue or navy data colour on the map or the key', JSON.stringify(big) + ' ' + r.sw.join(','));
    ok(!/Pink hatch|pink hatch|Blue: normal|Pale blue/.test(r.txt), VIEW + ' ' + L + ': key words: light grey hatch, no blue rows', (r.txt.match(/.{0,40}(Pink hatch|pink hatch|Blue: normal|Pale blue).{0,20}/) || [''])[0]);
    await pg.screenshot({ path: OUT + '/' + VIEW + '_' + L + '.png' }).catch(() => null);
  }
  ok(tiles.length > 0, VIEW + ': the 250 m sponge class tiles are drawn on the ground sponge layer (' + tiles.length + '; 1.0.10: value ramp)');
  ok(errs.length === 0, VIEW + ': no page error', errs.join(' | ')); await ctx.close();
}
await br.close(); console.log('colour49: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
