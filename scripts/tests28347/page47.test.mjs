/* v91.17.283.47 (NIGRAAN 1.0.8, hazard-layer change set) · the page items in a browser on the running server, customer then operator view:
   1  GLOF is site context: no tehsil filled with a level colour (the hazard ramp), the blue susceptibility palette, the key says
      "site context (lake susceptibility, not a warning level)", no "Priority" / "Watch" words on the key or the strip
   5  the layer list: "Daily hazards" first (heat, cold, heavy rain, flood ...), then "Forecast values (no tested level)", "Site context"
      (earthquake zone, cyclone, GLOF, ground sponge) last
   4  air quality and comfort have a coverage line from the served values (never empty, never "none")
   owner rule (2 Nov 01:15 PKT) the coverage line does not count "cannot happen" tehsils; the place card shows "Not relevant here: ..." in
      one line and no "Cannot happen here" row
   5  operator: a layer whose inputs are not current says "Temporarily unavailable" on its coverage line (with the reason)
   usage: node scripts/tests28347/page47.test.mjs [base]   (PART=customer|operator) */
import { T, BASE } from '../tests28328p/lib.mjs';
import * as __T from '../lib/testenv.mjs';
/* the shared test machine is short of memory: one renderer, no /dev/shm use by the browser */
async function browser() { const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
  return __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--renderer-process-limit=1', '--disable-gpu', '--disable-extensions'] }); }
const { ok, done } = T(); const PART = process.env.PART || 'all'; const SEG = process.env.SEG ? process.env.SEG.split(',') : null; const seg = (x) => !SEG || SEG.includes(x); const on = (p) => PART === 'all' || PART.split(',').includes(p);
const br = await browser();
const RAMP = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026'];
async function page(op) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 675 }, geolocation: { latitude: 31.5204, longitude: 74.3587, accuracy: 25 }, permissions: ['geolocation'] });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE + '/classic' + (op ? '?operator=1' : ''), { waitUntil: 'load', timeout: 240000 });
  await pg.waitForFunction(() => { try { return !!(window.AGN && AGN.v41 && AGN.v283 && AGN.v38 && AGN.v48 && document.getElementById('mapHazardPick')); } catch (_) { return false; } }, null, { timeout: 240000, polling: 1000 });
  await pg.waitForTimeout(15000); return { ctx, pg, errs }; }
const pick = (pg, v) => pg.evaluate((v) => { const s = document.getElementById('mapHazardPick'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const hexOf = (c) => { const m = String(c || '').match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('') : String(c || '').toLowerCase(); };
async function fills(pg) { return pg.evaluate(() => { const o = {}; try { districtLayer.eachLayer((l) => { const k = String((l.options && l.options.fillColor) || '').toLowerCase(); o[k] = (o[k] || 0) + 1; }); } catch (_) {} return o; }); }
async function cov(pg, k) { for (let i = 0; i < 20; i++) { const t = await pg.evaluate((k) => { try { return AGN.v41.coverageText(k); } catch (_) { return null; } }, k); if (t) return t; await pg.waitForTimeout(1500); } return null; }

async function common(pg, view) {
  /* 5 · the layer list */
  if (seg('list')) { const groups = await pg.evaluate(() => [...document.querySelectorAll('#mapHazardPick optgroup')].map((g) => ({ label: g.label, opts: [...g.querySelectorAll('option')].filter((o) => !o.hidden).map((o) => o.value) })));
  ok(groups.length >= 3 && groups[0].label === 'Daily hazards' && groups[0].opts.slice(0, 3).join() === 'heat,cold,rain_hz', view + ' 5.1 the list opens with the daily hazards with tested levels', JSON.stringify(groups));
  const sc = groups.find((g) => g.label === 'Site context');
  ok(sc && ['seismic', 'cyclone', 'glof', 'nss_baseline'].every((v) => sc.opts.includes(v)) && groups[groups.length - 1].label === 'Site context' || (groups[groups.length - 1].label === 'More layers' && groups[groups.length - 2].label === 'Site context'), view + ' 5.2 earthquake zone, cyclone exposure, GLOF lakes and ground sponge under "Site context" (last group)', JSON.stringify(sc));
  }
  /* 1 · GLOF */
  if (seg('glof')) { await pick(pg, 'glof'); await pg.waitForTimeout(9000);
  const F = await fills(pg); const rampHit = Object.entries(F).filter(([c]) => RAMP.includes(hexOf(c)));
  ok(!rampHit.length, view + ' 1.1 GLOF: no tehsil filled with a hazard-level colour', JSON.stringify(F));
  const gc = await pg.evaluate(() => AGN.v38.glofColours);
  ok(gc && !RAMP.includes(gc.priority) && !RAMP.includes(gc.watch) && !RAMP.includes(gc.none), view + ' 1.2 GLOF palette is neutral (not the warning ramp)', JSON.stringify(gc));
  ok(Object.keys(F).some((c) => [gc.priority, gc.watch, gc.none].includes(hexOf(c))), view + ' 1.3 GLOF lakes shaded in the susceptibility palette', JSON.stringify(F));
  const key = await pg.evaluate(() => ((document.getElementById('v3legend') || {}).textContent || '') + ' || ' + ((document.getElementById('agn242Leg') || {}).textContent || ''));
  ok(/site context/i.test(key) && /susceptibility/i.test(key) && !/\bPriority\b|\bWatch\b/.test(key), view + ' 1.4 GLOF key: site context, susceptibility, no Priority / Watch', key.slice(0, 400));
  }
  /* owner rule · coverage does not count cannot-happen tehsils */
  if (seg('cov')) { await pick(pg, 'flood_riverine'); await pg.waitForTimeout(6000); const cr = await cov(pg, 'flood_riverine');
  ok(cr && /where it can happen/.test(cr) && !/cannot happen/.test(cr), view + ' R.1 river flood coverage counts only where it can happen', cr);
  await pick(pg, 'cyclone'); await pg.waitForTimeout(6000); const cc = await cov(pg, 'cyclone');
  ok(cc && /where it can happen/.test(cc), view + ' R.2 cyclone coverage counts only where it can happen', cc);
  /* 4 · air quality and comfort coverage */
  await pick(pg, 'aqi'); await pg.waitForTimeout(6000); const ca = await cov(pg, 'aqi');
  ok(ca && /tehsils have an air-quality value/.test(ca) && !/none/i.test(ca), view + ' 4.1 air quality coverage line from the served values', ca);
  await pick(pg, ''); await pg.waitForTimeout(6000); const cm = await cov(pg, '');
  ok(cm && /tehsils have a value/.test(cm), view + ' 4.2 comfort coverage line from the served values', cm);
  }
  /* owner rule · the place card */
  if (seg('card')) { await pick(pg, 'heat'); await pg.waitForTimeout(4000);
  const card = await pg.evaluate(async () => { for (let i = 0; i < 40; i++) { const R = document.getElementById('mpRightIn'); const rows = R ? [...R.querySelectorAll('.agn-mps-r')] : [];
      if (rows.length) { const vis = rows.concat([...R.querySelectorAll('.agn-mps-na')]).filter((r) => !r.hidden && r.offsetParent !== null).map((r) => (r.textContent || '').replace(/\s+/g, ' ').trim()); const nr = document.getElementById('agnNr48');
        if (nr || i > 20) return { vis, nr: nr ? nr.textContent : null }; }
      await new Promise((r) => setTimeout(r, 1000)); } return null; });
  ok(card && !card.vis.some((t) => /Cannot (happen|occur) here/i.test(t)), view + ' R.3 the place card shows no "Cannot happen / occur here" row or group', JSON.stringify(card));
  ok(card && card.nr && /^Not relevant here: /.test(card.nr), view + ' R.4 the place card says "Not relevant here: ..." in one line', JSON.stringify(card && card.nr)); }
}

if (on('customer')) { const { ctx, pg, errs } = await page(false);
  await common(pg, 'customer');
  const opts = await pg.evaluate(() => [...document.querySelectorAll('#mapHazardPick option')].filter((o) => !o.hidden).map((o) => o.value));
  ok(!opts.includes('nss_dynamic') && !opts.includes('nss_runoff') && !opts.includes('flood_pluvial'), 'customer 5.3 the layers the gate hides from clients stay hidden', opts.join());
  ok(!errs.length, 'customer 0 no page errors', errs.join(' | '));
  await ctx.close(); }
if (on('operator')) { const { ctx, pg, errs } = await page(true);
  await common(pg, 'operator');
  if (seg('avail')) { await pick(pg, 'nss_runoff'); await pg.waitForTimeout(8000); const cn = await cov(pg, 'nss_runoff');
  const st = await pg.evaluate(() => { try { const R = AGN.v283.runInfo('nss_runoff'); return R && R.avail; } catch (_) { return null; } });
  ok(st && st.state === 'temporarily_unavailable' ? (cn && /^Temporarily unavailable/.test(cn) && /input not current/.test(cn)) : (cn && !/^Temporarily unavailable/.test(cn)), 'operator 5.4 run-off coverage: "Temporarily unavailable" with the reason when no tehsil is current (state ' + (st && st.state) + ')', cn); }
  ok(!errs.length, 'operator 0 no page errors', errs.join(' | '));
  await ctx.close(); }
await br.close(); done();
