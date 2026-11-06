/* v91.17.283.37 (NIGRAAN 1.0.1) · THE ANALYST VIEW (Overview) FIXES OF THE 30 OCT LIVE CHECK
   B2  the left panel shows the place's temperature ONCE (one card for the place; the 30 Oct live check found two cards with the same value)
   B3  the header brand reads "NIGRAAN 1.0" for clients (was "AI GEO NIGRAAN"); no build number in the header (the build is on Methods only)
   usage: node scripts/tests28337/overview37.test.mjs [base] */
import { T, browser, open, consoleReady, tab } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const br = await browser();
for (const [nm, hash] of [['Multan', '#agnplace=30.19570,71.47530,Multan'], ['G-8 Islamabad', '#agnplace=33.69421,73.05242,G-8']]) {
  const o = await open(br, '/analyst' + hash); await consoleReady(o.pg).catch(() => {}); await o.pg.waitForTimeout(20000); await tab(o.pg, 'overview', 4000);
  const r = await o.pg.evaluate(() => { const vis = (e) => { if (!e) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0; };
    const left = document.getElementById('mpLeftIn') ? document.getElementById('mpLeftIn').closest('aside') : null;
    const now = window.AGN && AGN.nowShown ? AGN.nowShown.t : null; const want = now == null ? null : String(Math.round(now * 10) / 10);
    /* the place's "now" displays in the left panel: the large temperature card, the place card's own now (.mp-now) and a "This spot" row of the
       nearby list (a day maximum that happens to equal the hour's value is another quantity, not counted) */
    const cards = []; if (left) { const hero = document.getElementById('agnNowHero'); if (vis(hero) && /\d/.test(hero.innerText)) cards.push('agnNowHero: ' + hero.innerText.replace(/\s+/g, ' ').slice(0, 60));
      left.querySelectorAll('.mp-now').forEach((e) => { if (vis(e)) cards.push('mp-now: ' + e.innerText.replace(/\s+/g, ' ').slice(0, 60)); });
      left.querySelectorAll('.agn-hl88 [data-hl88]').forEach((e) => { if (vis(e) && /This spot/.test(e.innerText)) cards.push('nearby This spot: ' + e.innerText.replace(/\s+/g, ' ').slice(0, 60)); }); }
    const brand = document.getElementById('agnBrandCode'), hdr = document.querySelector('header.topbar');
    return { want, cards, hero: vis(document.getElementById('agnNowHero')), brand: brand ? brand.textContent : null, hdr: hdr ? hdr.innerText : '', title: document.title }; });
  ok(r.want != null, nm + ': the place\'s temperature now is shown (AGN.nowShown)', JSON.stringify(r).slice(0, 300));
  ok(r.cards.length === 1, 'B2 ' + nm + ': the left panel shows the place temperature in ONE card (' + r.cards.length + ')', r.cards.join(' || '));
  ok(r.brand === 'NIGRAAN 1.0' && !/AI GEO NIGRAAN/.test(r.hdr), 'B3 ' + nm + ': header brand "NIGRAAN 1.0"', r.brand + ' :: ' + r.hdr.slice(0, 160));
  ok(!/91\.17|\bv\d+\.\d+\.\d+/.test(r.hdr), 'B3 ' + nm + ': no build number in the header', r.hdr.slice(0, 300));
  ok(o.errs.length === 0, nm + ': no page errors', o.errs.join(' | ')); await o.ctx.close(); }
await br.close(); done();
