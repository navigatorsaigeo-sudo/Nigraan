import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.278 · FIX278 1-3 · every report type as drawn (situation, site, portfolio, executive, assurance, readiness72), client and operator,
   10-site sample, Lahore. The outlook answer carries every event key the server can return (incl. the combined rainUnion / windAny) and the
   engine levels hold four days with heavy rain missing on the last (both answers are routed in the browser: the mock server's own are stale).
   Checks: no camelCase or snake_case code token anywhere in a report (the walk-through printed "rainUnion", "windAny"); the multi-day
   events table names every row in words; the AGN station table has no Rain column and no unnamed row; the heavy-rain gap says why.
   usage: node scripts/tests278/reports278.test.mjs http://127.0.0.1:PORT */
import { createRequire } from 'node:module';
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8986';
const req = createRequire(import.meta.url);
let PW = __T.playwrightSync();
const exe = process.env.PW_CHROME || __T.chromiumPath();
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + String(i).slice(0, 600) : '')); } };
const br = await __T.launch(PW.chromium, { executablePath: exe, args: ['--no-sandbox'] });
const pkt = (d) => new Date(Date.now() + 5 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const EVK = ['heatSpell', 'unusualWarmth', 'meltWarmth', 'coastalHeat', 'rain3_75', 'rain3Local', 'rainOnSnow', 'heavySnow', 'frostSpell', 'coldSpell', 'rainUnion', 'windAny'];
const HZ = ['rain_hz', 'heat', 'cold', 'wind', 'flood', 'flood_pluvial', 'landslide'];
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
async function route(pg) {
  await pg.route('**/api/outlook/unit?*', async (r) => { let res = null; try { res = await r.fetch(); } catch (_) { return r.continue().catch(() => {}); } let j = null; try { j = await res.json(); } catch (_) {}
    if (j) { const days = Array.from({ length: 15 }, (_, d) => ({ date: pkt(d), tx: [30, 33, 36], tn: [16, 18, 20], pr: [0, 0.5, 6], gu: [20, 30, 45], p: {} }));
      if (!j.ensemble || !Array.isArray(j.ensemble.days) || !j.ensemble.days.length) j.ensemble = { at: new Date().toISOString(), members: 51, days }; }   /* the mock server holds no ensemble run */
    if (j && j.ensemble) { const ev = { window: [pkt(0), pkt(14)] }; EVK.forEach((k, i) => { ev[k] = { p: (i * 7) % 60, climP: 10, onset: pkt(2 + (i % 5)), earliest: pkt(1) }; }); ev.memberIndex = [1, 2]; ev.heatSpellClasses = { why: 'x' }; j.events = ev; j.ensemble.events = ev; }
    await r.fulfill({ response: res, json: j }).catch(() => {}); });
  await pg.route('**/api/levels/unit?*', async (r) => { const days = [0, 1, 2, 3].map((d) => { const layers = {}; HZ.forEach((k, i) => { if (k === 'rain_hz' && d === 3) layers[k] = { name: 'Heavy rain', level: -1, word: 'no data' }; else layers[k] = { name: k, level: (i + d) % 3, word: WORDS[(i + d) % 3] }; }); return { day: d, date: pkt(d), layers }; });
    await r.fulfill({ json: { ready: true, at: new Date().toISOString(), stale: false, words: WORDS, days } }); });
}
const open = async (op) => { const ctx = await br.newContext({ viewport: { width: 1600, height: 1000 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await pg.addInitScript((o) => { try { if (o) localStorage.setItem('agn.operator.v1', '1'); else localStorage.removeItem('agn.operator.v1'); } catch (_) {} }, op);
  await route(pg);
  await pg.goto(BASE + '/analyst' + (op ? '?operator=1' : ''), { waitUntil: 'domcontentloaded', timeout: 180000 });
  await pg.waitForFunction(() => window.AGN && AGN.reports268 && AGN.flow && AGN.flow.setActiveLocation, null, { timeout: 180000 }); await pg.waitForTimeout(5000);
  return { ctx, pg, errs }; };
/* code tokens: camelCase identifiers (rainUnion, windAny, heatSpell ...), snake_case keys (rain_hz, flood_pluvial ...), plus the v277 junk set.
   Allowed: brand and unit words that are mixed case by spelling (MACH, NIGRAAN, km/h, °C, µg/m³, PM2.5, mm) do not match these patterns. */
/* v91.17.279 · CLAIMS279 P7 · also layer keys (day:tn0, rc:25) and internal gate ids (gate-91.17.125) */
const CODE = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[a-z][a-z0-9]*_[a-z0-9_]+\b|\b(null|undefined|NaN)\b|\[object|FORMULA_REGISTRY|AGN_TUNING|\.(?:js|py|mjs)\b|\b[a-z]{2,}:[a-z0-9_.]+\b|\bgate-\d/;
const ALLOW = /\b(iPhone|eBay)\b/;
for (const op of [false, true]) {
  const V = op ? 'operator' : 'client'; const o = await open(op);
  await o.pg.evaluate(() => { const S = samplePortfolio(); AGN.portfolio.intake.fromObjects(S.map((x) => { const y = Object.assign({}, x); ['demo', 'origin', 'origin_company', 'source'].forEach((k) => delete y[k]); return y; })); });
  await o.pg.waitForTimeout(3000); await o.pg.evaluate(() => AGN.flow.setActiveLocation({ name: 'Lahore', lat: 31.5204, lon: 74.3587 }, 'Lahore', { src: 'search' })); await o.pg.waitForTimeout(4000);
  for (const k of ['situation', 'site', 'portfolio', 'executive', 'assurance', 'readiness72']) {
    await o.pg.evaluate((k) => { window.print = function () {}; AGN.reports268.open(k, null); }, k);
    const ready = await o.pg.waitForFunction((k) => { const c = AGN.reports268.current(); const ov = document.querySelector('.rk-overlay'); return c && c.kind === k && ov && !ov.querySelector('#r268Prep') && ov.querySelector('.rk-cover,.rk-brief,.rk-bhead,.rk h2'); }, k, { timeout: 150000 }).then(() => true).catch(() => false);
    await o.pg.waitForTimeout(1200);
    const R = await o.pg.evaluate(() => { const ov = document.querySelector('.rk-overlay'); if (!ov) return { t: '' };
      const tabs = [...ov.querySelectorAll('h3')].map((h) => { let n = h.nextElementSibling; while (n && n.tagName !== 'TABLE' && !n.querySelector('table') && n.tagName !== 'H3') n = n.nextElementSibling; const t = n && (n.tagName === 'TABLE' ? n : n.querySelector('table')); return { h: h.textContent, head: t ? [...t.querySelectorAll('thead th, tr:first-child th')].map((x) => x.textContent.trim()) : [], rows: t ? [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim())) : [], after: h.parentElement ? h.parentElement.innerText : '' }; });
      return { t: ov.innerText, tabs }; });
    const hits = [...new Set(R.t.split('\n').filter((l) => CODE.test(l) && !ALLOW.test(l)).map((l) => l.trim().slice(0, 140)))];
    ok(ready && !hits.length, '1 ' + V + ' ' + k + ' report: no code key or code word (camelCase, snake_case, null, file names)', hits.slice(0, 4).join(' | '));
    if (k === 'situation') {
      const ev = R.tabs.find((x) => /Multi-day events in the next 15 days/.test(x.h));
      ok(ev && ev.rows.length >= 10 && ev.rows.every((r) => /[A-Z][a-z]+ /.test(r[0]) && !/[a-z][A-Z]/.test(r[0])) && ev.rows.some((r) => /Heavy or extreme rain/.test(r[0])) && ev.rows.some((r) => /Strong gusts/.test(r[0])), '1 ' + V + ' situation: every multi-day event row is named in words, the combined rain and gust counts included', ev && ev.rows.map((r) => r[0]).join(' | '));
      const st = R.tabs.find((x) => /AGN weather stations within 25 km/.test(x.h));
      ok(st && st.head.length && !st.head.includes('Rain') && st.rows.length && st.rows.every((r) => r[0] && !/^MACH station$/.test(r[0])), '2 ' + V + ' situation: the station table has no Rain column and no unnamed row', st && JSON.stringify({ head: st.head, rows: st.rows.slice(0, 5) }));
      const oc = st && st.rows.find((r) => /Old City/.test(r[0]));
      ok(!oc || (oc[3] === '—' && oc[4] === '—'), '2 ' + V + ' situation: a station whose readings stop before the window ends shows a dash for highest and lowest', oc && oc.join(' | '));
      ok(/Station rain is not shown/.test(R.t), '2 ' + V + ' situation: the note under the table says why station rain is not shown');
      const hz = R.tabs.find((x) => /Hazard levels by day/.test(x.h)); const rr = hz && hz.rows.find((r) => /Heavy rain/.test(r[0]));
      ok(rr && /Not yet issued/.test(rr[4]) && /Heavy rain has no level on .* calibrated rain chance/.test(R.t), '3 ' + V + ' situation: heavy rain without a level on day 4 says "Not yet issued" and the note says why', rr && rr.join(' | '));
    }
    if (k === 'site') { ok(/Heavy rain has no level on|Not yet issued/.test(R.t) || !/Heavy rain/.test(R.t), '3 ' + V + ' site report: the heavy-rain gap is explained where the area table shows it'); }
    await o.pg.evaluate(() => { try { AGNRK.close(); } catch (_) {} document.querySelectorAll('.rk-overlay .rk-bar button').forEach((b) => { if (b.textContent === 'Close') b.click(); }); }); await o.pg.waitForTimeout(600);
  }
  ok(!o.errs.length, V + ' reports: no page errors', o.errs.slice(0, 3).join(' | '));
  await o.ctx.close();
}
await br.close();
console.log(`\n${fail ? 'FAIL' : 'PASS'} reports278: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
