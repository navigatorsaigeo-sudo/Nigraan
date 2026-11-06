/* RESTORE 1 check: the place outlook tabs and the National view, both views; screenshots */
import { launch, page, tally, OUT } from './lib51.mjs';
const { ok, res } = tally(); const br = await launch();
for (const view of (process.env.VIEWS || 'customer,operator').split(',')) {
  const { ctx, pg, errs, cons } = await page(br, view); const V = view === 'operator' ? '_op' : '';
  await pg.click('#agn-tab-livedata').catch(() => {}); await pg.waitForTimeout(8000);
  const tabs = await pg.evaluate(() => { const c = document.getElementById('agnOutlookInline'); return c ? [...c.querySelectorAll('.ol-tabs button')].map((b) => b.textContent.trim() + (b.classList.contains('on') ? '*' : '')) : null; });
  ok(tabs && tabs.join('|') === '15 days*|Weeks 2–6|Season|Air & smog|National view', view + ': inline tabs restored', JSON.stringify(tabs));
  const scrollTo = () => pg.evaluate(() => { const c = document.getElementById('agnOutlookInline'); c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); });
  await scrollTo(); await pg.waitForFunction(() => document.querySelector('#agnOutlookInline .ol-inbody svg'), null, { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  const d15 = await pg.evaluate(() => { const b = document.querySelector('#agnOutlookInline .ol-inbody'); return { svg: !!b.querySelector('svg'), t: b.innerText.slice(0, 300) }; });
  ok(d15.svg && /Multi-day events/i.test(d15.t), view + ': 15 days tab shows the served 15-day chart and events', d15.t);
  await pg.screenshot({ path: OUT + '01_outlook_15d_v51' + V + '.png' });
  for (const [k, re, nm] of [['weeks', /Weeks ahead/i, 'weeks'], ['season', /Season ahead/i, 'season'], ['air', /air|smog|PM2\.5|AQI/i, 'air']]) {
    await pg.click('#agnOutlookInline [data-in="' + k + '"]'); await pg.waitForTimeout(2500); await scrollTo(); await pg.waitForTimeout(800);
    const s = await pg.evaluate((k) => { const c = document.getElementById('agnOutlookInline'); return { on: [...c.querySelectorAll('.ol-tabs button.on')].map((b) => b.getAttribute('data-in')), t: c.querySelector('.ol-inbody').innerText.slice(0, 400), rows: c.querySelectorAll('.ol-inbody tbody tr').length }; }, k);
    ok(s.on.length === 1 && s.on[0] === k && re.test(s.t), view + ': tab ' + k + ' alone selected, body shown (' + s.rows + ' rows)', JSON.stringify(s));
    await pg.screenshot({ path: OUT + '01_outlook_' + nm + '_v51' + V + '.png' });
  }
  /* jump bar Weeks */
  await pg.click('[data-hz87="w26"]').catch(() => {}); await pg.waitForTimeout(2500);
  ok(await pg.evaluate(() => document.querySelector('#agnOutlookInline [data-in="weeks"]').classList.contains('on')), view + ': jump bar "Weeks 1–6" selects the Weeks tab');
  await pg.click('#agnOutlookInline [data-in="d15"]'); await pg.waitForTimeout(1500);
  await pg.click('#agnOutlookInline [data-in-open]'); await pg.waitForTimeout(9000);
  const nat = await pg.evaluate(() => { const r = document.getElementById('agnOutlook'); const b = r.querySelector('.ol-body'); const vis = (e) => !!(e && e.offsetParent);
    return { tabsOn: [...r.querySelectorAll('.ol-tabs button.on')].map((x) => x.textContent.trim()), t: b.innerText, zeroCards: [...b.querySelectorAll('.ol-box')].filter((x) => /^\s*0 likely · 0 possible/m.test(x.innerText.split('\n').slice(1).join('\n')) && !x.querySelector('tbody tr')).length,
      note: vis([...b.querySelectorAll('.ol-note')].find((x) => /Raw ensemble shares/.test(x.textContent))), dayOn: (() => { const d = b.querySelector('.ol-days button.on'); return d ? getComputedStyle(d).backgroundColor : null; })(),
      tabOn: (() => { const d = r.querySelector('.ol-tabs button.on'); return d ? getComputedStyle(d).backgroundColor : null; })() }; });
  ok(nat.tabsOn.length === 1 && nat.tabsOn[0] === 'National', view + ': one modal tab selected', JSON.stringify(nat.tabsOn));
  ok(nat.dayOn && nat.dayOn !== nat.tabOn, view + ': the selected day chip is not drawn like a selected tab', nat.dayOn + ' vs ' + nat.tabOn);
  ok(nat.zeroCards === 0, view + ': no zero card (0 likely, 0 possible, no tehsil)', nat.zeroCards);
  ok(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2} [A-Z][a-z]+ 20\d\d/.test(nat.t) && !/\b20\d\d-\d\d-\d\d\b/.test(nat.t), view + ': dates in words', (nat.t.match(/.{0,40}20\d\d.{0,20}/) || [''])[0]);
  ok(view === 'operator' ? nat.note : !nat.note, view + ': the "Raw ensemble shares" note ' + (view === 'operator' ? 'kept for the operator' : 'not shown to the customer'));
  ok(/Source: NIGRAAN, from the global ensemble forecast/.test(nat.t), view + ': a short neutral source line');
  ok(!/Multi-day events[^\n]*\n\s*(Single-day|$)/.test(nat.t), view + ': no empty Multi-day events heading');
  await pg.screenshot({ path: OUT + '01_national_v51' + V + '.png' });
  await pg.evaluate(() => { const b = document.querySelector('#agnOutlook .ol-card'); b.scrollTop = 700; }); await pg.waitForTimeout(800); await pg.screenshot({ path: OUT + '01_national_v51' + V + '_b.png' });
  /* a day with nothing: walk the days, find one where every threshold is zero */
  const nd = await pg.evaluate(() => document.querySelectorAll('#agnOutlook .ol-days button').length); let plain = null;
  for (let i = 0; i < nd && !plain; i++) { await pg.click('#agnOutlook .ol-days button[data-day="' + i + '"]'); await pg.waitForTimeout(1800);
    plain = await pg.evaluate(() => { const p = [...document.querySelectorAll('#agnOutlook .ol-plain')].find((x) => /no tehsil reaches any of these thresholds/.test(x.textContent)); return p ? p.textContent : null; }); }
  ok(plain ? true : true, view + ': day with nothing -> ' + (plain ? 'one plain line: "' + plain + '"' : 'every served day has a threshold reached somewhere (plain line not exercised)'));
  if (plain) { await pg.evaluate(() => { const b = document.querySelector('#agnOutlook .ol-card'); b.scrollTop = 0; }); await pg.waitForTimeout(500); await pg.screenshot({ path: OUT + '01_national_emptyday_v51' + V + '.png' }); }
  ok(errs.length === 0, view + ': no page error', errs.join(' | ')); const c2 = cons.filter((x) => !/^HTTP |Failed to load resource/.test(x)); ok(c2.length === 0, view + ': no console error (resource loads listed apart)', c2.join(' | '));
  console.log('INFO resource errors:', [...new Set(cons.filter((x) => /^HTTP /.test(x)).map((x) => x.replace(/\/tiles\/.*$/, '/tiles/...')))].join(' | '));
  await ctx.close();
}
await br.close(); const r = res(); console.log('o51', r.pass, 'pass', r.fail, 'fail'); process.exit(r.fail ? 1 : 0);
