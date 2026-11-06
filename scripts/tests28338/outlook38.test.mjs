/* v91.17.283.38 item 6 · THE OUTLOOK DIALOG: every tab opens without a script error; the National tab shows the thresholds the server
   counts (1.0 removed six untested ones: the tab threw "c.likely of undefined" and stayed on Loading)
   usage: node scripts/tests28338/outlook38.test.mjs [base] */
import { T, browser, open, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const N = await fetch(BASE + '/api/outlook/national').then((r) => r.json()); const keys = Object.keys(N.counts || {});
const RUN = !!(N.ready && keys.length);   /* a server whose ensemble run has not completed (the harness copy without the live outlook) shows its note */
ok(true, RUN ? 'the server counts ' + keys.join(', ') : 'the server has no national ensemble run yet: the tab must show that note, without a script error');
const br = await browser(); const o = await open(br, '/analyst#agnplace=33.68440,73.04790,Islamabad'); await o.pg.waitForTimeout(20000);
await o.pg.click('#machNav [data-goto="livedata"]').catch(() => {}); await o.pg.waitForTimeout(6000);
const opened = await o.pg.evaluate(() => { const b = document.querySelector('[data-in-open]'); if (b) { b.click(); return true; } return false; }); await o.pg.waitForTimeout(5000);
ok(opened, 'the Outlook dialog opens (National view)');
const tabs = await o.pg.evaluate(() => [...document.querySelectorAll('.ol-tabs button, [data-tab]')].map((b) => b.getAttribute('data-tab') || b.textContent.trim()).filter(Boolean));
const nat = await o.pg.evaluate(() => (document.querySelector('.ol-body') || {}).innerText || '');
if (RUN) { ok(/likely/.test(nat) && !/^\s*Loading…\s*$/.test(nat), 'the National tab shows the threshold boxes', nat.slice(0, 200));
  const boxes = await o.pg.evaluate(() => document.querySelectorAll('.ol-body .ol-box').length);
  ok(boxes >= keys.length, 'one box per counted threshold at least (' + boxes + ' boxes, ' + keys.length + ' thresholds)'); }
else ok(/has not completed/.test(nat), 'the National tab says the ensemble run has not completed (no stuck Loading)', nat.slice(0, 200));
for (const t of tabs.slice(0, 8)) { await o.pg.evaluate((t) => { const b = [...document.querySelectorAll('.ol-tabs button, [data-tab]')].find((x) => (x.getAttribute('data-tab') || x.textContent.trim()) === t); if (b) b.click(); }, t); await o.pg.waitForTimeout(3000); }
ok(o.errs.length === 0, 'every tab opened without a script error (' + tabs.length + ' tabs)', o.errs.join(' | '));
await br.close(); done();
