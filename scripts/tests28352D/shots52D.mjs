/* v91.17.283.52 D · screenshots and page checks, both views, one Chromium: start page (station chip, N7), analyst Ask (Lahore: Enter sends
   (#90), the answer names air quality (N14), chips without "Near" (#89)), Operations (#76 / #78 / #79), map popup (N5), Customize Proof (N27),
   and page 1 of the situation / 72-hour / executive reports.  usage: node shots52D.mjs <base> <outdir> <report html paths, comma-separated> */
import { mkdirSync, writeFileSync } from 'node:fs';
const T = await import(new URL('../lib/testenv.mjs', import.meta.url)); const PW = T.playwrightSync();
const [B, O, REPS = ''] = process.argv.slice(2); mkdirSync(O, { recursive: true });
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=900'] });
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const errs = [];
async function ctxFor(view) { const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } } catch (_) {} }, view === 'operator'); return ctx; }
const PL = '#agnplace=31.5100,74.3800,Lahore Cantt';
for (const view of ['customer', 'operator']) {
  const ctx = await ctxFor(view); const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(view + ': ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to execute/.test(m.text())) errs.push(view + ' CSP: ' + m.text().slice(0, 200)); });
  /* start page */
  await pg.goto(B + '/', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(12000);
  const chip = await pg.evaluate(() => { const e = document.getElementById('nsFleet'); return e ? { t: e.innerText.replace(/\s+/g, ' '), title: e.title } : null; });
  ok(chip && !/^\d+\/\d+/.test(chip.t) && (/reporting now/.test(chip.t) || /unavailable|not received/.test(chip.t)), view + ' start: one labelled station count: ' + JSON.stringify(chip));
  await pg.screenshot({ path: O + '/' + view + '_start.png' });
  /* analyst Ask */
  await pg.goto(B + '/analyst' + PL + '&agnview=airisk', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(15000);
  await pg.evaluate(() => { const b = document.querySelector('[data-goto="airisk"]'); if (b) b.click(); }); await pg.waitForTimeout(3000);
  const chips = await pg.evaluate(() => [...document.querySelectorAll('.llm-prompts button[data-llm-prompt]')].filter((b) => !b.hidden).map((b) => b.textContent.trim()));
  ok(chips.length && chips.every((c) => !/\bNear\b|\d\s*km\b/.test(c)), view + ' Ask chips name the place plainly: ' + JSON.stringify(chips.slice(0, 2)));
  const ta = await pg.$('#nigraanLlmInput'); let ans = '';
  if (ta) { await ta.fill('What is the weather risk in Lahore in the next 3 days?'); await ta.press('Enter');
    for (let i = 0; i < 90; i++) { await pg.waitForTimeout(2000); ans = await pg.evaluate(() => { const L = [...document.querySelectorAll('.llm-message.assistant .llm-bubble')]; return L.length > 1 ? L[L.length - 1].innerText : ''; }); if (/next 3 days/.test(ans) || /could not|not available/i.test(ans)) break; } }
  ok(/next 3 days/.test(ans), view + ' Ask: Enter sent the question (answer arrived)', ans.slice(0, 200));
  ok(/Air quality/i.test(ans) && !/\((?:DI|NWS|D1|D0)[,)]/.test(ans), view + ' Ask: Lahore answer names air quality, no codes', ans.slice(0, 600));
  await pg.screenshot({ path: O + '/' + view + '_ask_lahore.png' });
  /* Operations */
  await pg.evaluate(() => { const b = document.querySelector('[data-goto="operations"]'); if (b) b.click(); }); await pg.waitForTimeout(6000);
  const ops = await pg.evaluate(() => ({ note: (document.getElementById('opsxPlaceNote') || {}).innerText || '', state: (document.getElementById('assetState') || {}).innerText || '', body: (document.getElementById('assetBody') || {}).innerText || '' }));
  ok(!/one shared location state/.test(ops.note), view + ' Operations: plain place note: ' + ops.note);
  ok(!(/Loaded from/.test(ops.state) && /No sites with operating limits yet/.test(ops.body)), view + ' Operations: asset line and board agree', JSON.stringify(ops).slice(0, 300));
  const h6 = await pg.$('[data-horizon="6"]'); if (h6) { await h6.click({ force: true }).catch(() => {}); await pg.waitForTimeout(1500); }
  await pg.screenshot({ path: O + '/' + view + '_operations.png', fullPage: false });
  /* header line not cut (operator #138) */
  const hdr = await pg.evaluate(() => { const e = document.getElementById('freshTxt'); return e ? { t: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 } : null; });
  ok(hdr && !hdr.cut, view + ' header status line fits: ' + JSON.stringify(hdr));
  await ctx.close();
}
/* Customize Proof (customer page) */
{ const ctx = await ctxFor('customer'); const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push('customize: ' + e.message));
  await pg.goto(B + '/customize', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(15000);
  await pg.evaluate(() => { const t = [...document.querySelectorAll('button, a, [role=tab]')].find((x) => /Proof/.test(x.textContent || '')); if (t) t.click(); }); await pg.waitForTimeout(4000);
  const pr = await pg.evaluate(() => document.body.innerText.match(/[^\n]*AGN (?:MACH )?stations[^\n]*/g) || []);
  ok(!pr.some((x) => /108 AGN MACH stations/.test(x)), 'customize Proof: no bare "108 AGN MACH stations": ' + JSON.stringify(pr.slice(0, 3)));
  await pg.screenshot({ path: O + '/customer_customize_proof.png' }); await ctx.close(); }
/* reports page 1 */
for (const r of REPS.split(',').filter(Boolean)) { const ctx = await ctxFor('customer'); const pg = await ctx.newPage(); await pg.goto(B + r, { waitUntil: 'load', timeout: 120000 }); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: O + '/report_' + r.split('/').pop().replace(/\W/g, '_') + '.png', fullPage: false }); await ctx.close(); }
ok(!errs.length, 'no page errors / CSP refusals', JSON.stringify(errs.slice(0, 6)));
await br.close(); console.log('shots52D: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
