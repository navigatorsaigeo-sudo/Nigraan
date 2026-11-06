/* RESTORE 2 check: Scenario Lab what-if block for customers; every slider moves something visible; screenshots */
import { launch, page, tally, OUT } from './lib51.mjs';
const { ok, res } = tally(); const br = await launch();
for (const view of (process.env.VIEWS || 'customer,operator').split(',')) {
  const { ctx, pg, errs, cons } = await page(br, view); const V = view === 'operator' ? '_op' : '';
  await pg.click('#agn-tab-hybridlab', { timeout: 15000 }).catch(() => pg.evaluate(() => AGN.journey && AGN.journey.go('hybridlab'))); await pg.waitForTimeout(6000);
  await pg.evaluate(() => { const d = document.getElementById('agnScnMore'); d.open = true; d.dispatchEvent(new Event('toggle')); document.querySelectorAll('#cfeSection details').forEach((x) => { x.open = true; }); });
  await pg.waitForFunction(() => { const h = document.getElementById('agnScn113Served'); return h && /Result from the NIGRAAN server/.test(h.innerText) && !h.getAttribute('aria-busy') && h.querySelector('table,p'); }, null, { timeout: 120000 }).catch(() => {});
  await pg.waitForTimeout(3000);
  const L = await pg.evaluate(() => { const vis = (e) => !!(e && e.offsetParent && e.getBoundingClientRect().height > 0); const lab = document.getElementById('agnWhatIf51'), g = document.getElementById('cfeCompareGrid'), sv = document.getElementById('agnScn113Served'), adv = document.getElementById('cfeAdvancedGrid');
    const pos = (e) => e ? e.getBoundingClientRect().top + scrollY : null;
    return { lab: vis(lab) ? lab.innerText : null, labN: [...document.querySelectorAll('#cfeSection')].map((x) => (x.innerText.match(/What-if score from NIGRAAN/g) || []).length)[0], cards: vis(g) ? g.querySelectorAll('.scenario-score-card').length : 0, gt: g.innerText, drv: vis(document.getElementById('cfeDriverRows')), adv: vis(adv) ? adv.querySelectorAll('.advanced-diagnostic').length : 0,
      order: [pos(lab), pos(g), pos(adv), pos(sv)], servedT: sv.innerText.slice(0, 200) }; });
  ok(L.lab && /What-if score from NIGRAAN’s scenario model – for comparing options, not a tested forecast\./.test(L.lab) && L.labN === 1, view + ': the what-if label, once', JSON.stringify([L.lab, L.labN]));
  ok(L.cards >= 1 && /\d+\s*→\s*\d+/.test(L.gt), view + ': baseline -> scenario cards shown', L.gt);
  ok(L.drv, view + ': core-driver table shown');
  ok(L.adv === 5, view + ': five climate and land cards', L.adv);
  ok(L.order.every((x) => x != null) && L.order[0] < L.order[1] && L.order[1] < L.order[3] && L.order[2] < L.order[3], view + ': served result below the what-if block', JSON.stringify(L.order));
  ok(/Result from the NIGRAAN server/.test(L.servedT), view + ': the served result table kept', L.servedT);
  await pg.evaluate(() => { const c = document.getElementById('cfeHazardTabs'); c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); }); await pg.waitForTimeout(600);
  await pg.screenshot({ path: OUT + '02_scenario_before_v51' + V + '.png' });
  const snap = () => pg.evaluate(() => { const t = (s) => { const e = document.querySelector(s); return e && e.offsetParent ? e.innerText : ''; }; return t('#cfeCompareGrid') + '\n' + t('.agn-wi51-drivers') + '\n' + t('#cfeAdvancedGrid'); });
  const tested = [], dead = [];
  for (const hz of ['flood', 'heat', 'wind', 'drought', 'multi']) {
    await pg.click('#cfeHazardTabs [data-scenario-hazard="' + hz + '"]'); await pg.waitForTimeout(1200);
    await pg.evaluate(() => document.querySelectorAll('#cfeSection details').forEach((x) => { x.open = true; }));
    const ids = await pg.evaluate(() => [...document.querySelectorAll('#cfeSection input[type=range],#cfeSection input[type=checkbox]')].filter((e) => /^(ctl|adv)-/.test(e.id) && !e.disabled && e.offsetParent).map((e) => e.id));
    for (const id of ids) { /* every enabled slider of the tab */
      if (hz === 'multi' && tested.some((x) => x.id === id)) continue;
      const before = await snap();
      const how = await pg.evaluate((id) => { const e = document.getElementById(id); if (e.type === 'checkbox') { e.checked = !e.checked; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 'toggle'; }
        const mn = +e.min, mx = +e.max, v = +e.value, to = (v - mn) < (mx - v) ? mx : mn; e.value = String(to); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return v + '->' + e.value; }, id);
      await pg.waitForTimeout(450); const after = await snap();
      const moved = before !== after; tested.push({ hz, id, how, moved }); if (!moved) dead.push(hz + ':' + id + ' (' + how + ')');
      if (hz === 'flood' && id === 'ctl-rainIntensity') { const g = await pg.evaluate(() => document.getElementById('cfeCompareGrid').innerText); const m = g.match(/(\d+)\s*→\s*(\d+)/);
        ok(m && m[1] !== m[2], view + ': rain rate to ' + how + ' changes the what-if flood score (' + (m ? m[1] + ' -> ' + m[2] : g.replace(/\n/g, ' ')) + ')'); await pg.evaluate(() => { const g = document.getElementById('cfeCompareGrid'); g.scrollIntoView({ block: 'start' }); window.scrollBy(0, -260); }); await pg.waitForTimeout(500); await pg.screenshot({ path: OUT + '02_scenario_after_rain_v51' + V + '.png' }); }
    }
    await pg.click('#cfeScenarioButtons button[data-preset="baseline"]').catch(() => {}); await pg.waitForTimeout(600);
  }
  const offs = await pg.evaluate(() => [...document.querySelectorAll('#cfeSection input[type=range]:disabled')].filter((e) => /^ctl-/.test(e.id)).map((e) => { const c = e.closest('.scenario-control'); const n = c && c.querySelector('.agn-wi51-off'); return e.id + ':' + (n && n.offsetParent ? n.textContent : 'NO VISIBLE REASON'); }));
  ok(!offs.some((x) => /NO VISIBLE REASON/.test(x)), view + ': a slider that is off says why (' + offs.length + ' off at this place)', offs.join(' | '));
  console.log('INFO off sliders:', offs.join(' | ') || 'none');
  ok(tested.length >= 20 && dead.length === 0, view + ': every slider moves something visible (' + tested.length + ' tested: ' + [...new Set(tested.map((x) => x.id))].length + ' distinct)', dead.join(', '));
  /* the not-used line lists only climate and land drivers */
  await pg.click('#cfeHazardTabs [data-scenario-hazard="heat"]'); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const e = document.getElementById('ctl-rhDelta'); if (e) { e.value = e.max; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } const a = document.getElementById('adv-ndviAnom'); if (a) { a.value = a.min; a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); } });
  await pg.waitForFunction(() => { const h = document.getElementById('agnScn113Served'); return h && !h.getAttribute('aria-busy') && h.querySelector('.s113-not'); }, null, { timeout: 180000, polling: 1000 }).catch(() => null);   /* the served run may take a while under load */
  const nu = await pg.evaluate(() => { const p = document.querySelector('#agnScn113Served .s113-not'); return p ? p.innerText : ''; });
  ok(!/Humidity change/.test(nu) && /Vegetation greenness change/.test(nu), view + ': "not used by the server run" names the climate and land drivers only', nu);
  await pg.evaluate(() => { const g = document.getElementById('cfeCompareGrid'); g.scrollIntoView({ block: 'start' }); window.scrollBy(0, -260); }); await pg.waitForTimeout(500);
  await pg.screenshot({ path: OUT + '02_scenario_after_heat_v51' + V + '.png' });
  await pg.evaluate(() => { const g = document.getElementById('cfeAdvancedGrid'); g.scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); }); await pg.waitForTimeout(500);
  await pg.screenshot({ path: OUT + '02_scenario_results_v51' + V + '.png' });
  ok(errs.length === 0, view + ': no page error', errs.join(' | '));
  const c2 = cons.filter((x) => !/^HTTP |Failed to load resource/.test(x)); ok(c2.length === 0, view + ': no console error (resource loads listed apart)', c2.join(' | '));
  console.log('INFO resource errors:', [...new Set(cons.filter((x) => /^HTTP /.test(x)).map((x) => x.replace(/\/tiles\/.*$/, '/tiles/...')))].join(' | '));
  await ctx.close();
}
await br.close(); const r = res(); console.log('s51', r.pass, 'pass', r.fail, 'fail'); process.exit(r.fail ? 1 : 0);
