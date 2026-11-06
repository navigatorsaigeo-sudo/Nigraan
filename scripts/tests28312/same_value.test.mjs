import * as __T from '../lib/testenv.mjs';
/* v91.17.283.12 · THE SAME VALUE EVERYWHERE, 5 PLACES. For E-11 Islamabad, Lahore, Jacobabad, Sukkur and Muzaffarabad (the points the place
   rule gives), the server's place bundle (v283.19: GET /api/point, its point state and its parts) is the truth, and every surface must show it:
     start page   the drawer's "now", today's range (whole degrees), the heat pill = the tehsil's issued heat level (labelled as the area's)
     analyst      the top bar, AGN.nowAt, the hazard panel's point heat line (the point's UTCI level today)
     Customize    the Overview "now", Temp max / min, "Now" in More readings
     report       Customize's site report ("Now at the site") and the server's report run (the bundle's part pointrun, served.now)
   "now" is printed by the one rule (0.1 C, a trailing .0 dropped); max / min to the precision each surface prints.
   usage: node scripts/tests28312/same_value.test.mjs [http://127.0.0.1:8787] [--no-report] */
const BASE = __T.BASE, NOREP = process.argv.includes('--no-report');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 700) : '')); } };
const PLACES = [['E-11 Islamabad', 33.69937, 72.96257], ['Lahore', 31.558, 74.35071], ['Jacobabad', 28.28187, 68.43761], ['Sukkur', 27.70323, 68.85889], ['Muzaffarabad', 34.37002, 73.47082]];
const J = async (u) => { const r = await fetch(BASE + u, { headers: { 'x-agn-view': 'customer' } }); return r.ok ? r.json() : null; };
const fmt = (t) => { const v = Math.round(+t * 10) / 10; return String(v === 0 ? 0 : v); };
const word = (l) => (!l || l === 'None' ? 'Normal' : l);
const num = (x) => { const m = /-?\d+(\.\d+)?/.exec(String(x == null ? '' : x).replace('−', '-')); return m ? +m[0] : null; };
const T = {};
for (const [nm, lat, lon] of PLACES) {
  const ps = await J('/api/point?lat=' + lat + '&lon=' + lon); const d0 = ps && ps.days && ps.days[0];
  const lp = ps && ps.parts && ps.parts.levels; const lv = lp && lp.ok ? lp.v : (ps && ps.place && ps.place.unitId ? await J('/api/levels/unit?unit=' + encodeURIComponent(ps.place.unitId)) : null);
  const hz = lv && lv.days && lv.days[0] && lv.days[0].layers && lv.days[0].layers.heat;
  T[nm] = ps && ps.ok ? { key: ps.key, run: ps.run, now: fmt(ps.now.tempC), tmax: d0.tmaxC, tmin: d0.tminC, heat: word(d0.heat && d0.heat.level), areaHeat: hz ? hz.word : null } : null;
  ok(!!T[nm], 'T ' + nm + ': the point state ' + (T[nm] ? T[nm].key + ' now ' + T[nm].now + ', today ' + T[nm].tmin + '–' + T[nm].tmax + ', heat ' + T[nm].heat + ' (tehsil: ' + T[nm].areaHeat + ')' : 'not available'));
  const pr = ps && ps.parts && ps.parts.pointrun ? ps.parts.pointrun.v : null; const sv = pr && pr.served && pr.served.now;
  if (pr && pr.ok) ok(sv && fmt(sv.tempC) === T[nm].now, 'R1 ' + nm + ': the report run serves now ' + (sv ? fmt(sv.tempC) : null) + ' (the point state: ' + (T[nm] && T[nm].now) + ')');
  else console.log('INFO R1 ' + nm + ': the raw reference run is not available on this server (' + String(pr && (pr.error || pr.why) || 'no answer').slice(0, 80) + '); the served values are checked in the site report below');
}
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
const page = async (path) => { const ctx = await br.newContext({ viewport: { width: 1400, height: 950 } }), pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await pg.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 120000 }); return { ctx, pg, errs }; };
/* ---- start page ---- */
{ const { ctx, pg, errs } = await page('/'); await pg.waitForTimeout(8000);
  for (const [nm, lat, lon] of PLACES) { const t = T[nm]; if (!t) continue;
    await pg.evaluate(([a, b, n]) => AGNSTART.select({ lat: a, lon: b, name: n }), [lat, lon, nm]);
    await pg.waitForFunction(() => { const e = document.getElementById('nowT'); return e && /\d/.test(e.textContent) && document.getElementById('nowPill'); }, null, { timeout: 30000 }).catch(() => {});
    const R = await pg.evaluate(() => ({ now: (document.getElementById('nowT') || {}).textContent || '', d: (document.querySelector('#nowBox .d') || {}).textContent || '', pill: (document.getElementById('nowPill') || {}).textContent || '', supp: (document.querySelector('#nowBox ~ * .supp, .supp') || {}).textContent || '' }));
    const rg = /today\s*(\S+)\s*(?:–|to)\s*(\S+)\s*°C/.exec(R.d.replace(/−/g, '-'));
    ok(num(R.now) === +t.now, 'S1 ' + nm + ': start page now ' + num(R.now) + ' = ' + t.now);
    ok(rg && +rg[1] === Math.round(t.tmin) && +rg[2] === Math.round(t.tmax), 'S2 ' + nm + ': start page today ' + (rg ? rg[1] + '–' + rg[2] : R.d) + ' = ' + Math.round(t.tmin) + '–' + Math.round(t.tmax));
    const issued = t.areaHeat && /^(Normal|Low|Moderate|High|Severe)$/.test(t.areaHeat);
    ok(issued ? new RegExp(t.areaHeat).test(R.pill) : !/(Low|Moderate|High|Severe)/.test(R.pill), 'S3 ' + nm + ': start page heat pill "' + R.pill + '" is the tehsil level (' + t.areaHeat + (issued ? '' : ': no issued level on this server, so no level is shown') + ')'); }
  ok(!errs.length, 'S4 start page: no page error', errs.join(' | ')); await ctx.close(); }
/* ---- analyst ---- */
{ const { ctx, pg, errs } = await page('/analyst'); await pg.waitForTimeout(30000);
  for (const [nm, lat, lon] of PLACES) { const t = T[nm]; if (!t) continue;
    await pg.evaluate(([a, o]) => AGN.point.goText(a + ', ' + o, {}), [lat, lon]).catch(() => {});   /* the analyst's own coordinate route (AGN.point.goText -> go) */
    await pg.waitForFunction(([a, o]) => { const v = window.AGN && AGN.nowAt && AGN.nowAt.peek(a, o); const p = AGN.data && AGN.data.activePoint && AGN.data.activePoint(); return v && p && Math.abs(p.lat - a) < 1e-3; }, [lat, lon], { timeout: 40000 }).catch(() => {});
    await pg.waitForTimeout(6000);
    const R = await pg.evaluate(([a, o]) => { const v = AGN.nowAt.peek(a, o), q = (s) => document.querySelector(s);
      return { top: q('#agnLive84 .t') ? q('#agnLive84 .t').textContent : '', nowAt: v ? AGN.pointState.fmt(v.tempC) : null, pt: q('.agn-mps-pt b') ? q('.agn-mps-pt b').textContent : null,
        tiles: [...document.querySelectorAll('#mpLeftIn .mp-c')].map((c) => [(c.querySelector('.k') || {}).textContent, (c.querySelector('.v') || {}).textContent]) }; }, [lat, lon]);
    ok(num(R.top) === +t.now, 'A1 ' + nm + ': analyst top bar ' + num(R.top) + ' = ' + t.now);
    ok(R.nowAt === t.now, 'A2 ' + nm + ': AGN.nowAt ' + R.nowAt + ' = ' + t.now);
    ok(R.pt != null && R.pt === t.heat, 'A3 ' + nm + ': hazard panel point heat ' + R.pt + ' = ' + t.heat + (R.pt == null ? ' (panel missing: a fail since v283.23)' : ''));
    const tm = R.tiles.find((x) => /^Temp max/.test(x[0] || '')), tn = R.tiles.find((x) => /^Temp min/.test(x[0] || ''));
    ok(!!tm && !!tn && (Math.abs(num(tm[1]) - t.tmax) < 0.06 && Math.abs(num(tn[1]) - t.tmin) < 0.06), 'A4 ' + nm + ': left panel Temp max / min ' + (tm ? num(tm[1]) + ' / ' + num(tn[1]) : '(panel shows another place)') + ' = ' + t.tmax + ' / ' + t.tmin); }
  ok(!errs.length, 'A5 analyst: no page error', errs.join(' | ')); await ctx.close(); }
/* ---- Customize and its site report ---- */
{ const { ctx, pg, errs } = await page('/customize'); await pg.waitForTimeout(9000);
  for (const [nm, lat, lon] of PLACES) { const t = T[nm]; if (!t) continue;
    await pg.evaluate(([a, b, n]) => NIGRAAN3.setPoint(a, b, n), [lat, lon, nm]);
    await pg.waitForFunction(() => { const e = document.querySelector('#ov-now .t'); return e && /\d/.test(e.textContent) && document.querySelector('.ps-tiles .tx .v') && /\d/.test(document.querySelector('.ps-tiles .tx .v').textContent); }, null, { timeout: 40000 }).catch(() => {});
    const R = await pg.evaluate(() => ({ now: (document.querySelector('#ov-now .t') || {}).textContent || '', tx: (document.querySelector('.ps-tiles .tx .v') || {}).textContent || '', tn: (document.querySelector('.ps-tiles .tn .v') || {}).textContent || '',
      more: [...document.querySelectorAll('.more-r li')].map((l) => l.textContent).find((x) => /^Now/.test(x)) || '' }));
    ok(num(R.now) === +t.now, 'C1 ' + nm + ': Customize now ' + num(R.now) + ' = ' + t.now);
    ok(Math.abs(num(R.tx) - t.tmax) < 0.06 && Math.abs(num(R.tn) - t.tmin) < 0.06, 'C2 ' + nm + ': Customize Temp max / min ' + num(R.tx) + ' / ' + num(R.tn) + ' = ' + t.tmax + ' / ' + t.tmin);
    ok(num(R.more) === +t.now, 'C3 ' + nm + ': Customize More readings "' + R.more + '" = ' + t.now);
    if (NOREP) continue;
    await pg.evaluate(() => NIGRAAN3.report.site());
    await pg.waitForFunction(() => { const o = document.querySelector('.rk-overlay'); return o && /Now at the site/.test(o.innerText); }, null, { timeout: 150000 }).catch(() => {});
    const rep = await pg.evaluate(() => { const o = document.querySelector('.rk-overlay'); const s = o ? o.innerText : ''; const m = /Now at the site\s*(-?[\d.]+)\s*°C/.exec(s); return { v: m ? m[1] : null, has: !!o }; });
    ok(rep.v != null && +rep.v === +t.now, 'C4 ' + nm + ': the site report prints now ' + rep.v + ' = ' + t.now, JSON.stringify(rep));
    await pg.evaluate(() => { const b = [...document.querySelectorAll('.rk-overlay .rk-bar button')].find((x) => x.textContent === 'Close'); if (b) b.click(); }); await pg.waitForTimeout(800); }
  ok(!errs.length, 'C5 Customize: no page error', errs.join(' | ')); await ctx.close(); }
/* the record did not change under the test (one model run) */
for (const [nm, lat, lon] of PLACES) { const ps = await J('/api/point?lat=' + lat + '&lon=' + lon); ok(ps && T[nm] && ps.run === T[nm].run, 'Z ' + nm + ': the same model run throughout (' + (ps && ps.run) + ')'); }
await br.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
