/* RESTORE 3 check: the ranked client portfolio on the analyst page, both views; screenshots */
import { launch, page, tally, OUT, BASE } from './lib51.mjs';
const { ok, res } = tally(); const br = await launch();
const W5 = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
for (const view of (process.env.VIEWS || 'customer,operator').split(',')) {
  const { ctx, pg, errs, cons } = await page(br, view, { place: null }); const V = view === 'operator' ? '_op' : '';
  const reqs = []; pg.on('request', (r) => { if (/\/api\/point\/batch\?/.test(r.url()) && /siteLevels/.test(r.url())) reqs.push({ t: Date.now(), u: r.url() }); });
  let inflight = 0, maxIn = 0; pg.on('request', (r) => { if (/\/api\/point\/batch\?.*siteLevels/.test(r.url())) { inflight++; maxIn = Math.max(maxIn, inflight); } });
  pg.on('requestfinished', (r) => { if (/\/api\/point\/batch\?.*siteLevels/.test(r.url())) inflight--; }); pg.on('requestfailed', (r) => { if (/\/api\/point\/batch\?.*siteLevels/.test(r.url())) inflight--; });
  await pg.click('#agn-tab-assessments').catch(() => pg.evaluate(() => AGN.journey && AGN.journey.go('assessments'))); await pg.waitForTimeout(4000);
  await pg.evaluate(() => document.querySelector('#asmtTabs button[data-asmt="portfolio"]').click()); await pg.waitForTimeout(1500);
  const e0 = await pg.evaluate(() => ({ t: document.getElementById('asmtPortfolio51') ? document.getElementById('asmtPortfolio51').innerText : null, hand: !!document.getElementById('asmtHandSend') }));
  ok(e0.t && !e0.hand && /No sites yet/.test(e0.t), view + ': the ranked portfolio card (no hand-over card), empty at start', JSON.stringify(e0).slice(0, 300));
  await pg.evaluate(() => { const s = document.getElementById('asmtLoadSample'); if (s) s.click(); });
  await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelector('#asmtTabs button[data-asmt="portfolio"]').click());
  const settle = async (n) => { await pg.waitForFunction((n) => { const t = document.getElementById('asmtPortfolioRows'); return t && t.querySelectorAll('tr').length >= 2 && (!n || t.querySelectorAll('tr').length === n) && !/checking…/.test(t.innerText); }, n || 0, { timeout: 300000, polling: 1000 }).catch((e) => console.log('INFO settle: ' + String(e && e.message || e).slice(0, 200))); await pg.waitForTimeout(1500); };   /* the server may still be making the report just asked */
  const grab = () => pg.evaluate(() => { const rows = [...document.querySelectorAll('#asmtPortfolioRows tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim()));
    return { rows, err: window.__p51 || null, kpi: [document.getElementById('asmtPortCount51').textContent, document.getElementById('asmtPortUp51').textContent, document.getElementById('asmtPortChecked51').textContent], banner: document.getElementById('asmtPortBanner51').hidden ? '' : document.getElementById('asmtPortBanner51').textContent,
      hatch: document.querySelectorAll('#asmtPortfolioRows .p51-hatch').length, reps: document.querySelectorAll('#asmtPortfolioRows [data-p51-report]').length, markers: (window.AGN && AGN.port51) ? AGN.port51.sites().length : -1 }; });
  await settle(); let T = await grab();
  console.log('INFO rows:\n' + T.rows.map((r) => '  ' + r.slice(0, 7).join(' | ').replace(/\n/g, ' ')).join('\n')); console.log('INFO kpi', T.kpi.join(' / '));
  const lv = (r) => { const w = (r[5] || '').split('\n')[0]; return W5.indexOf(w); };
  let ranked = T.rows.filter((r) => lv(r) >= 0);
  ok(T.rows.length === 10 && ranked.length === 10, view + ': the 10 sample sites ranked with a served level', T.rows.length + '/' + ranked.length);
  ok(ranked.every((r, i) => i === 0 || lv(ranked[i - 1]) >= lv(r)), view + ': ranked by level (highest first)');
  ok(ranked.every((r) => r[2] && r[2] !== '—'), view + ': every site has its tehsil');
  ok(T.rows.some((r) => /\d+\/100/.test(r[4])), view + ': a served hazard index /100 is shown where the server issues one');
  ok(T.hatch > 0, view + ': cannot-happen hazards drawn with the grey hatch (' + T.hatch + ')');
  ok(T.reps === 10, view + ': a Report button per site', T.reps);
  ok(T.markers === 10, view + ': the 10 sites on the analyst map', T.markers);
  ok(/^Sample sites \(example\)/.test(T.banner) && T.rows.every((r) => /Sample/.test(r[1])), view + ': sample banner and row tags in plain words', T.banner);
  ok(maxIn <= 2 && reqs.length >= 1 && reqs.length <= 4, view + ': served levels read in ' + reqs.length + ' batch request(s), at most ' + maxIn + ' at a time');
  await pg.evaluate(() => { const c = document.getElementById('asmtPortfolio51'); c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); }); await pg.waitForTimeout(600);
  await pg.screenshot({ path: OUT + '03_portfolio_v51' + V + '.png' });
  await pg.evaluate(() => { window.scrollBy(0, 520); }); await pg.waitForTimeout(400); await pg.screenshot({ path: OUT + '03_portfolio_v51' + V + '_b.png' });
  /* compare with the served answer directly (no page arithmetic): the first ranked site */
  const vt = await pg.evaluate(() => document.getElementById('agn-tab-assessments') && document.querySelector('.view[data-view="assessments"]').innerText);
  const bad = (vt.match(/.{0,40}(AJG|DEMONSTRATION|\bDEMO\b|Customize page|Nothing is ranked|Professional data contracts|Canonical Asset|seven-column|Quick Screening subset|governed upload templates).{0,40}/g) || []);
  ok(bad.length === 0, view + ': no client name, DEMO wording, hand-over or developer text in Client Risk', bad.join(' | '));
  ok(!/\bPMD\b|\bNDMA\b|\bPDMA\b|\bFFD\b/.test(T.rows.map((r) => r.join(' ')).join(' ')), view + ': no agency names in the table');
  await pg.evaluate(() => { const c = document.getElementById('asmtPortfolio51'); c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); }); await pg.waitForTimeout(600);
  await pg.screenshot({ path: OUT + '03_portfolio_v51' + V + '.png' });
  await pg.evaluate(() => { window.scrollBy(0, 520); }); await pg.waitForTimeout(400); await pg.screenshot({ path: OUT + '03_portfolio_v51' + V + '_b.png' });
  /* the map */
  await pg.click('#asmtPortMap51'); await pg.waitForTimeout(3000);
  const mv = await pg.evaluate(() => { const c = window.map.getContainer(); const r = c.getBoundingClientRect(); const b = window.map.getBounds(); const s = AGN.port51.sites(); return { vis: !!c.offsetParent && r.height > 100, inView: s.filter((x) => b.contains([x.lat, x.lon])).length, n: s.length }; });
  ok(mv.vis && mv.inView === mv.n, view + ': "Show the sites on the map" opens the map with every site in view', JSON.stringify(mv));
  await pg.screenshot({ path: OUT + '03_portfolio_map_v51' + V + '.png' });
  /* Report on screen */
  await pg.click('#agn-tab-assessments'); await pg.waitForTimeout(1500); await pg.evaluate(() => document.querySelector('#asmtTabs button[data-asmt="portfolio"]').click());
  await pg.evaluate(() => { const c = document.getElementById('asmtPortfolio51'); c.scrollIntoView({ block: 'start' }); });
  const nm = await pg.evaluate(() => document.querySelector('#asmtPortfolioRows [data-p51-report]').getAttribute('data-p51-name'));
  await pg.click('#asmtPortfolioRows [data-p51-report]');
  const got = await pg.waitForFunction(() => { const f = document.getElementById('agnRepViewFrame'); if (f && !f.hidden && f.getAttribute('src')) return 'viewer:' + f.getAttribute('src'); const n = document.getElementById('asmtPortNote51'); const a = n && n.querySelector('a'); return a ? 'link:' + a.getAttribute('href') : null; }, null, { timeout: 240000 }).then((h) => h.jsonValue(), () => null);
  ok(!!got, view + ': Report for "' + nm + '" opens the site report (' + got + ')');
  if (got && /^link:/.test(got)) { const u = BASE + got.slice(5); const r = await pg.request.get(u); const body = await r.text(); ok(r.status() === 200 && /<html/i.test(body), view + ': the report HTML view answers 200', r.status());
    const rp = await ctx.newPage(); await rp.goto(u, { waitUntil: 'load' }); await rp.waitForTimeout(2000); await rp.screenshot({ path: OUT + '03_portfolio_report_v51' + V + '.png' }); await rp.close(); }
  else if (got) { await pg.waitForTimeout(4000); await pg.screenshot({ path: OUT + '03_portfolio_report_v51' + V + '.png' }); }
  await pg.evaluate(() => { const c = document.getElementById('agnRepViewClose'); if (c) c.click(); }); await pg.waitForTimeout(800);   /* the person closes the report viewer */
  /* the client's own rows through the intake (replaces the register): two placed, one without a coordinate */
  await pg.evaluate(() => { try { AGN.portfolio.intake.fromObjects([{ asset_id: 'T51-1', name: 'Test depot Lahore', asset_type: 'commercial', latitude: 31.52, longitude: 74.36 }, { asset_id: 'T51-2', name: 'Test yard Karachi', asset_type: 'industrial', latitude: 24.86, longitude: 67.01 }, { asset_id: 'T51-3', name: 'No coordinate site', asset_type: 'commercial' }], { source: 'test' }); } catch (e) { window.__p51 = String(e && e.message || e); } });
  await pg.evaluate(() => document.querySelector('#asmtTabs button[data-asmt="portfolio"]').click()); await settle(3); T = await grab();   /* wait for the new register (3 rows), not the sample still on screen */
  console.log('INFO rows:\n' + T.rows.map((r) => '  ' + r.slice(0, 7).join(' | ').replace(/\n/g, ' ')).join('\n'));
  ranked = T.rows.filter((r) => lv(r) >= 0);
  ok(T.rows.length === 3 && ranked.length === 2 && !T.err && !T.banner, view + ': added sites ranked, no sample banner', T.rows.length + ' ' + ranked.length + ' ' + T.err);
  ok(T.rows.some((r) => /No coordinate site/.test(r[1]) && /no usable coordinate/.test(r[5])), view + ': a site without a coordinate says so');
  ok(T.markers === 2, view + ': the map follows the register (2 markers)', T.markers);
  await pg.evaluate(() => { const c = document.getElementById('asmtPortfolio51'); c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); }); await pg.waitForTimeout(500);
  await pg.screenshot({ path: OUT + '03_portfolio_own_v51' + V + '.png' });
  ok(errs.length === 0, view + ': no page error', errs.join(' | '));
  const c2 = cons.filter((x) => !/^HTTP |Failed to load resource/.test(x)); ok(c2.length === 0, view + ': no console error (resource loads listed apart)', c2.join(' | '));
  console.log('INFO resource errors:', [...new Set(cons.filter((x) => /^HTTP /.test(x)).map((x) => x.replace(/\/tiles\/.*$/, '/tiles/...')))].join(' | '));
  await ctx.close();
}
await br.close(); const r = res(); console.log('p51', r.pass, 'pass', r.fail, 'fail'); process.exit(r.fail ? 1 : 0);
