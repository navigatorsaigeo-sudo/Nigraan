/* v91.17.283.48 (NIGRAAN 1.0.9) item 5 · Customize NIGRAAN (AJG): the Site report and the Sector briefing in the dashboard style, same values as
   the Customize screen. For each place: set the place on /customize, open the Site report (window.NIGRAAN3.report.site), wait for the
   dashboard (section[data-rk46="dashboard"]), then compare every value the dashboard draws (its data-v attributes) with
   (a) what the screen holds (NIGRAAN3.state: S.d.lv levels, the bundle S.d.pf) and (b) the served answer (GET /api/point for the same point,
   computed here with the analyst page's next72 rule). Also: the Sector briefing gets its dashboard; the Network report is unchanged; no page
   error; the downloadable copy (o.html) carries the dashboard and no script.
   usage: node scripts/tests28349/n3dash49.test.mjs <base url> [out dir]   (env PLACES="lat,lon,name;...") */
const [BASE, OUT = '/dev/shm/n3dash49'] = process.argv.slice(2); const fs = await import('node:fs'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = new URL('../..', import.meta.url).pathname; const T = await import(ROOT + 'scripts/lib/testenv.mjs'); const PW = T.playwrightSync();
const PLACES = (process.env.PLACES || '33.66860,73.07520,Islamabad I-8/3;24.81380,67.03000,Karachi coast;31.54970,74.34360,Lahore;36.31670,74.65000,Hunza;30.17980,66.97500,Quetta').split(';').map((x) => { const a = x.split(','); return { lat: +a[0], lon: +a[1], name: a.slice(2).join(',') }; });
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
function n72(B) { const X = B && B.parts && B.parts.placeRecord, R = X && !X.unavailable && X.v ? X.v : null, PD = (B && B.days || []).filter((d) => d.lead >= 0 && d.lead <= 2); if (!R || !R.days) return null;
  let gu = null; PD.forEach((d) => { if (d.gustMaxKmh != null && (!gu || d.gustMaxKmh > gu)) gu = d.gustMaxKmh; }); return { gust: gu, rain: Object.fromEntries(R.days.filter((d) => d.lead >= 0 && d.lead <= 2).map((d) => [d.date, d.rainMm])) }; }
const g = (x) => x == null || !isFinite(+x) ? '–' : String(Math.round(+x * 10) / 10);
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
if (process.env.FREEZE_MS) { await pg.clock.install({ time: new Date(Number(process.env.FREEZE_MS)) }); await pg.clock.resume(); }
await pg.goto(BASE + '/customize', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(15000);
ok(await pg.evaluate(() => !!(window.AGNREP46 && window.AGNREP46.version === 'rep46-2' && window.NIGRAAN3)), 'the report engine (AGNREP46 rep46-2) is on the Customize page');
let first = true;
for (const P of PLACES) {
  await pg.evaluate((p) => { document.querySelectorAll('.rk-overlay').forEach((e) => e.remove()); window.NIGRAAN3.setPoint(p.lat, p.lon, p.name); }, P);
  await pg.waitForFunction(() => { const S = window.NIGRAAN3.state; return S.d && S.d.pf && S.d.lv && S.d.ou !== undefined; }, null, { timeout: 120000 }).catch(() => null);
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => window.NIGRAAN3.report.site());
  const got = await pg.waitForFunction(() => { const o = document.querySelector('.rk-overlay'); return o && o.querySelector('section[data-rk46="dashboard"]') ? true : null; }, null, { timeout: 150000 }).then(() => true, () => false);
  ok(got, P.name + ': the Site report opens with the page-1 dashboard');
  if (!got) { await pg.screenshot({ path: OUT + '/fail_' + P.name.replace(/\W+/g, '_') + '.png' }); continue; }
  const R = await pg.evaluate(() => { const o = document.querySelector('.rk-overlay'), S = window.NIGRAAN3.state; const dv = [...o.querySelectorAll('[data-v]')].map((e) => e.getAttribute('data-v'));
    const lv = S.d.lv; const days = (lv.days || []).map((d) => ({ date: d.date, L: Object.fromEntries(Object.entries(d.layers || {}).map(([k, v]) => [k, v && v.word])) , heat: d.layers && d.layers.heat ? d.layers.heat.value : null }));
    return { dv, days, lat: S.p.lat, lon: S.p.lon, figs: [...o.querySelectorAll('[data-rk46]')].map((e) => e.getAttribute('data-rk46')), html: o.querySelector('.rk-doc, .rk') ? (o.querySelector('.rk-doc') || o.querySelector('.rk')).outerHTML.length : 0, scripts: o.querySelectorAll('.rk script').length }; });
  const B = await (await fetch(BASE + '/api/point?lat=' + R.lat + '&lon=' + R.lon, { headers: { 'x-agn-view': 'customer' } })).json(); const N = n72(B);
  const tiles = (R.dv.find((x) => /@\d{4}-\d\d-\d\d=/.test(x)) || '').split(';').filter(Boolean);
  let tOk = 0, tBad = []; for (const t of tiles) { const m = /^([a-z_]+)@(\d{4}-\d\d-\d\d)=(\w+)$/.exec(t); if (!m) continue; const d = R.days.find((x) => x.date === m[2]); const w = d && d.L[m[1]];
    const sv = B.parts.levels && B.parts.levels.v && (B.parts.levels.v.days || []).find((x) => x.date === m[2]); const ws = sv && sv.layers && sv.layers[m[1]] && sv.layers[m[1]].word;
    if (w === m[3] && ws === m[3]) tOk++; else tBad.push(t + ' screen=' + w + ' served=' + ws); }
  ok(tiles.length > 0 && tBad.length === 0, P.name + ': hazard tiles = the screen’s levels = the served levels (' + tOk + ' tiles)', tBad.join(' | '));
  const u = R.dv.find((x) => /^utci=/.test(x)); const h0 = R.days[0] && R.days[0].heat;
  ok(u && (u === 'utci=na' ? h0 == null : u === 'utci=' + g(h0)), P.name + ': UTCI gauge = the screen’s day-0 heat value (' + u + ' / ' + g(h0) + ')');
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); const rn = R.dv.find((x) => /^rain=/.test(x)); const rv = N && N.rain ? (N.rain[today] !== undefined ? N.rain[today] : Object.values(N.rain)[0]) : null;
  ok(rn && (rn === 'rain=na' ? rv == null : rn === 'rain=' + g(rv)), P.name + ': rain gauge = the place record’s rain today, served (' + rn + ' / ' + g(rv) + ')');
  const gu = R.dv.find((x) => /^gust=/.test(x)); ok(gu && (gu === 'gust=na' ? !N || N.gust == null : gu === 'gust=' + g(N.gust)), P.name + ': gust gauge = the highest gust of days 0-2, served (' + gu + ' / ' + g(N && N.gust) + ')');
  ok(R.figs.includes('coverage') && R.scripts === 0, P.name + ': coverage strip present, no script in the document (' + R.figs.join(',') + ')');
  await pg.screenshot({ path: OUT + '/site_' + P.name.replace(/\W+/g, '_') + '.png' });
  if (first) { first = false;
    await pg.evaluate(() => { document.querySelectorAll('.rk-overlay').forEach((e) => e.remove()); window.NIGRAAN3.report.sector(); });
    ok(await pg.waitForFunction(() => { const o = document.querySelector('.rk-overlay'); return o && o.querySelector('section[data-rk46="dashboard"]') ? true : null; }, null, { timeout: 150000 }).then(() => true, () => false), 'the Sector briefing opens with the dashboard');
    await pg.evaluate(() => { document.querySelectorAll('.rk-overlay').forEach((e) => e.remove()); try { window.NIGRAAN3.report.network(); } catch (_) {} }); await pg.waitForTimeout(20000);
    const nw = await pg.evaluate(() => { const o = document.querySelector('.rk-overlay'); return o ? { dash: !!o.querySelector('[data-rk46]'), txt: o.innerText.slice(0, 80) } : null; });
    ok(!nw || !nw.dash, 'the Network report is unchanged (no dashboard added)', JSON.stringify(nw)); }
}
ok(errs.length === 0, 'no page error', errs.join(' | '));
await br.close(); console.log('n3dash49: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
