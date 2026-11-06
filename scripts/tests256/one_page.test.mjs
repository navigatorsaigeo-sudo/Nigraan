/* v91.17.256 · ONE MAIN PAGE (CEO 10 Oct "old is better", 12 Oct "remove the new layout"): / and /classic are the classic console with
   the first-load backend redirect and the page switch NIGRAAN | Customize NIGRAAN; /next goes to /; the page-switch endpoint is gone.
   usage: node scripts/tests256/one_page.test.mjs http://127.0.0.1:8787 */
const B = process.argv[2] || 'http://127.0.0.1:8787';
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + i : '')); } };
const get = (p) => fetch(B + p, { redirect: 'manual' });
const page = async (p) => (await fetch(B + p)).text();
const isClassic = (t) => /Decision Integrity/.test(t);
const r = await get('/analyst'); ok(r.status === 302 && /^(http[^?]+)?\/analyst\?backend=/.test(r.headers.get('location') || ''), '/ gets the first-load backend redirect', r.status);
const t = await page('/analyst'); ok(isClassic(t), '/ is the classic console');
ok(/id="agn-switch"/.test(t) && /href="\/customize"/.test(t) && !/href="\/next"/.test(t) && !/New layout/.test(t) && !/>Classic</.test(t), 'the page switch is NIGRAAN | Customize NIGRAAN only');
const n = await get('/next'); ok(n.status === 302 && (n.headers.get('location') || '') === '/', '/next goes to /', n.status + ' ' + n.headers.get('location'));
const n4 = await get('/NIGRAAN_4.html'); ok(n4.status === 302, '/NIGRAAN_4.html goes to /', n4.status);
ok(isClassic(await page('/classic')), '/classic is the same classic console');
const u = await get('/api/ops/ui/default'); ok(u.status === 410, 'the page-switch endpoint is gone (410)', u.status);
ok(isClassic(await page('/customize')) === false && (await get('/customize')).status === 200, '/customize (Customize NIGRAAN) is still served');
console.log(`\n${fail ? 'FAIL' : 'PASS'} one_page: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
