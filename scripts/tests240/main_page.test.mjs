/* v91.17.240 · WHICH PAGE / SERVES, AND THE WAY BACK — updated v91.17.276 (CLEAN) to the current design.
   The v240 design (/ = rebuilt page, /classic = classic console, POST /api/ops/ui/default switching between them) was retired in
   v91.17.256 (owner 10/12 Oct "one main page", "remove the new layout"): / and /classic are the one classic console, /next and
   /NIGRAAN_4.html go to /, and the page-switch endpoint answers 410 to every caller. This suite now checks that the retired switch
   cannot bring the old arrangement back (every value, any origin), beside tests256/one_page.
   usage: node scripts/tests240/main_page.test.mjs http://127.0.0.1:8799 */
const B = process.argv[2] || 'http://127.0.0.1:8799';
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + i : '')); } };
const get = (p) => fetch(B + p, { redirect: 'manual' });
const page = async (p) => { const r = await fetch(B + p); return r.text(); };
const post = (body, h = {}) => fetch(B + '/api/ops/ui/default', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) });
const isClassic = (t) => /Decision Integrity/.test(t), isRebuilt = (t) => /name="nigraan-build"/.test(t) && /id="mapcell"/.test(t);
ok((await post({ page: 'next' })).status === 410, 'the retired switch refuses "next" (410 gone)');
await new Promise((r) => setTimeout(r, 300));
const t0 = await page('/analyst'); ok(isClassic(t0) && !isRebuilt(t0), '/ is the one main page (classic console), never the rebuilt page');
const n = await get('/next'); ok(n.status === 302 && (n.headers.get('location') || '') === '/', '/next goes to /', n.status);
const c = await get('/classic'); ok(c.status === 302 && /\/classic\?backend=/.test(c.headers.get('location') || ''), '/classic gets the first-load backend redirect');
const ct = await page('/classic'); ok(isClassic(ct) && /id="agn-switch"/.test(ct) && /href="\/analyst" class="on"/.test(ct), '/classic is the same page; its switch marks NIGRAAN');
ok((await post({ page: 'classic' })).status === 410, 'the retired switch refuses "classic" too');
const r1 = await get('/analyst'); ok(r1.status === 302 && /^(http[^?]+)?\/analyst\?backend=/.test(r1.headers.get('location') || ''), '/ keeps the first-load backend redirect');
ok((await post({ page: 'bad' })).status === 410, 'a bad value is refused (410)');
ok((await post({ page: 'next' }, { origin: 'https://evil.example' })).status !== 200, 'another origin is refused');
ok(isClassic(await page('/analyst')) && (await get('/api/ops/ui/default')).status === 410, 'and / is still the one main page');
console.log(`\n${fail ? 'FAIL' : 'PASS'} main_page: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
