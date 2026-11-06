import * as __T from '../lib/testenv.mjs';
/* v91.17.283.26 · START PAGE STRIP, against a running server (argv[2]), at 1440 x 731 (the owner's screen):
     S1  no page error; no Warmest / Coolest chip (owner 28 Oct: removed); the page makes no /api/fleet/latest request
     S4  the numbers strip fits the 38 px bar (no chip above or below it), also with a two-line hazard chip (GLOF and drought additions),
         and does not cover the pulse note's Details button (it was cut to "D")
   usage: node scripts/tests28326/strip.test.mjs [http://127.0.0.1:8787] */
const BASE = __T.BASE;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const PW = __T.playwrightSync(); if (PW.__missing) __T.skip(PW.__missing);
const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] });
async function open(inject) {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 731 } }); const pg = await ctx.newPage(); const errs = []; const log = [];
  pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200))); ctx.on('request', (r) => { const u = r.url(); if (u.startsWith(BASE)) log.push(u.replace(BASE, '')); });
  if (inject) await pg.route('**/api/levels?layers=*', async (route) => { const r = await route.fetch(); const j = await r.json(); /* a current run with GLOF and drought additions: the hazard chip on two lines */
    for (const k of Object.keys(j.layers || {})) { const L = j.layers[k]; if (L) { L.stale = false; L.ready = true; L.levels = L.levels || {}; const ids = Object.keys(L.levels); if (k === 'glof' || k === 'drought') ids.slice(0, 3).forEach((id) => { L.levels[id] = 3; }); else ids.forEach((id) => { if (!(L.levels[id] >= 0)) L.levels[id] = 0; }); } }
    await route.fulfill({ response: r, json: j }); });
  await pg.goto(BASE + '/', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => { const B = document.getElementById('natStats'); return B && B.children.length >= 2; }, null, { timeout: 120000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  return { ctx, pg, errs, log };
}
const geo = (pg) => pg.evaluate(() => { const B = document.getElementById('natStats'), bar = document.getElementById('pulse'), dt = document.getElementById('pulseDet');
  const r = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { top: q.top, bottom: q.bottom, left: q.left, right: q.right }; };
  return { strip: r(B), bar: r(bar), det: r(dt), kids: B ? [...B.children].map((c) => ({ id: c.id, ...r(c), text: c.innerText.replace(/\s+/g, ' ').trim() })) : [] }; });

for (const inject of [true, false]) { const o = await open(inject); const g = await geo(o.pg); const tag = inject ? ' (two-line hazard chip)' : ' (this server\'s answer)';
  ok(o.errs.length === 0, 'S1 no page error' + tag, o.errs.join(' | '));
  ok(!g.kids.some((k) => /^ns(Hot|Cold)$/.test(k.id) || /Warmest|Coolest/.test(k.text)), 'S1 no Warmest / Coolest chip' + tag, JSON.stringify(g.kids.map((k) => k.id)));
  ok(!o.log.some((u) => /^\/api\/fleet\/latest/.test(u)), 'S1 the start page makes no /api/fleet/latest request' + tag, o.log.filter((u) => /fleet/.test(u)).join(','));
  const hi = g.kids.find((k) => k.id === 'nsHigh'); if (inject) ok(hi && /\+\d+ (GLOF susceptibility|observed drought)/.test(hi.text), 'S4 the hazard chip carries its additions on its second line' + tag, hi && hi.text);
  ok(g.kids.length && g.kids.every((k) => k.top >= g.bar.top - 0.5 && k.bottom <= g.bar.bottom + 0.5), 'S4 every chip of the numbers strip fits the 38 px bar' + tag, JSON.stringify(g.kids.map((k) => [k.id, k.top, k.bottom])) + ' bar ' + JSON.stringify(g.bar));
  ok(!g.det || !g.strip || g.det.right <= g.strip.left, 'S4 the pulse note\'s Details button is not covered by the strip' + tag, JSON.stringify({ det: g.det, strip: g.strip }));
  await o.ctx.close(); }
await br.close();
console.log(`\nv283.26 start page: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
