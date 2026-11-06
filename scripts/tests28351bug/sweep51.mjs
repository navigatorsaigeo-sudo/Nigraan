/* v91.17.283.51 · client-facing sweep, one Chromium: screenshots of the owner's items (customer view) and a text scan of every main tab of the
   start page, the analyst page and Customize in BOTH views for developer / internal words; console errors and page errors counted.
   usage: node sweep51.mjs <base> <outdir> <tag (before|after)> */
import { mkdirSync, writeFileSync } from 'node:fs';
const T = await import(new URL('../lib/testenv.mjs', import.meta.url)); const PW = T.playwrightSync();
const [B, O, TAG] = process.argv.slice(2); mkdirSync(O, { recursive: true });
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1'] });
const P = { lat: 33.7233, lon: 73.0435 }, HASH = '#agnplace=' + P.lat + ',' + P.lon + ',E-7';
const BAN = [/\bv?9[01]\.\d+\.\d+(?:\.\d+)?\b/, /\bV91\.17\b|\bv91\.17\b/i, /\bcanonical\b/i, /\bgoverned\b/i, /\bschema\b/i, /\bcontract\b/i, /not modelled in this release/i, /authori[sz]ed decision/i,
  /\b[\w-]+\.(?:json|mjs|csv|py|parquet)\b/, /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}\b/, /engine build/i, /decision-integrity/i, /\b(?:PMD|FFD|SUPARCO|WAPDA|IRSA)\b/, /Alert list not current/i, /\bundefined\b|\bNaN\b|\[object/];
const res = { tag: TAG, shots: [], hits: [], errors: [], console: [] };
async function ctxFor(view, geo) { const o = { viewport: { width: 1440, height: 900 } }; if (geo) { o.geolocation = geo; o.permissions = ['geolocation']; }
  const ctx = await br.newContext(o); await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } } catch (_) {} }, view === 'operator'); return ctx; }
function watch(pg, where) { pg.on('pageerror', (e) => res.errors.push(where + ': ' + String(e.message).slice(0, 200))); pg.on('console', (m) => { if (m.type() === 'error') res.console.push(where + ': ' + m.text().slice(0, 200)); }); }
async function shot(pg, name, full) { const f = O + '/' + TAG + '_' + name + '.png'; await pg.screenshot({ path: f, fullPage: !!full }); res.shots.push(f); }
async function scan(pg, where) { const txt = await pg.evaluate(() => document.body ? document.body.innerText : ''); for (const re of BAN) { const m = txt.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')); if (m) for (const x of [...new Set(m)].slice(0, 5)) { const i = txt.indexOf(x); res.hits.push({ where, word: x, ctx: txt.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, ' ') }); } } }
const wait = (pg, ms) => pg.waitForTimeout(ms);
for (const view of ['customer', 'operator']) {
  /* start page at E-7 */
  { const ctx = await ctxFor(view); const pg = await ctx.newPage(); watch(pg, view + ' start');
    await pg.goto(B + '/' + HASH, { waitUntil: 'load', timeout: 180000 }); await wait(pg, 12000);
    if (view === 'customer') await shot(pg, 'start_E7_now');
    await scan(pg, view + ' start'); for (const t of ['#tab_hz', '#tab_n3', '#tab_rep', '#tab_place']) { const e = await pg.$(t); if (e) { await e.click().catch(() => {}); await wait(pg, 3500); await scan(pg, view + ' start ' + t); } }
    await ctx.close(); }
  /* analyst page, each main view */
  { const ctx = await ctxFor(view); const pg = await ctx.newPage(); watch(pg, view + ' analyst');
    await pg.goto(B + '/analyst' + HASH, { waitUntil: 'load', timeout: 180000 }); await wait(pg, 15000);
    if (view === 'customer') await shot(pg, 'analyst_top');
    await scan(pg, view + ' analyst overview');
    for (const g of ['operations', 'assessments', 'modelab', 'report', 'sources', 'livedata', 'observations']) { const e = await pg.$('button[data-goto="' + g + '"]:visible'); if (!e) continue; await e.click().catch(() => {}); await wait(pg, 4000); await scan(pg, view + ' analyst ' + g);
      if (g === 'modelab' && view === 'customer') { const s = await pg.$('#lab34Site'); if (s) { await s.scrollIntoViewIfNeeded(); await wait(pg, 600); await shot(pg, 'scenario_site_form'); const b = await pg.$('#lab34Site [data-run-site]'); if (b) { await b.click().catch(() => {}); await wait(pg, 600); await s.screenshot({ path: O + '/' + TAG + '_scenario_site_form_click.png' }); res.shots.push(O + '/' + TAG + '_scenario_site_form_click.png'); } } } }
    await ctx.close(); }
  /* Customize */
  { const ctx = await ctxFor(view); const pg = await ctx.newPage(); watch(pg, view + ' customize');
    await pg.goto(B + '/customize' + HASH, { waitUntil: 'load', timeout: 180000 }); await wait(pg, 12000); await scan(pg, view + ' customize');
    if (view === 'customer') await shot(pg, 'customize_top'); await ctx.close(); }
}
/* the coarse location line (customer): start page and analyst page with a 10 km browser position */
for (const [where, path] of [['start', '/'], ['analyst', '/analyst']]) {
  const ctx = await ctxFor('customer', { latitude: 33.70, longitude: 73.05, accuracy: 10000 }); const pg = await ctx.newPage(); watch(pg, 'coarse ' + where);
  await pg.goto(B + path, { waitUntil: 'load', timeout: 180000 }); await wait(pg, 5000); await shot(pg, 'coarse_' + where + '_5s');
  const v1 = await pg.evaluate(() => { const e = document.getElementById('agnLocNote') || document.getElementById('cLocNote'); return e ? { shown: !e.hidden && e.offsetParent !== null, text: e.innerText, close: !!e.querySelector('button') && !e.querySelector('button').hidden, rect: e.getBoundingClientRect().toJSON() } : null; });
  await wait(pg, 9000); await shot(pg, 'coarse_' + where + '_14s');
  const v2 = await pg.evaluate(() => { const e = document.getElementById('agnLocNote') || document.getElementById('cLocNote'); return e ? { shown: !e.hidden && e.offsetParent !== null } : null; });
  res['coarse_' + where] = { at5s: v1, at14s: v2 }; await ctx.close(); }
await br.close();
writeFileSync(O + '/' + TAG + '_sweep.json', JSON.stringify(res, null, 1));
console.log(TAG, 'shots', res.shots.length, 'banned-word hits', res.hits.length, 'page errors', res.errors.length, 'console errors', res.console.length);
console.log(JSON.stringify({ coarse_start: res.coarse_start, coarse_analyst: res.coarse_analyst }));
