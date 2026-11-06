/* r42 (NIGRAAN 1.0.6) · the warm-up page essential (server/api/pagecheck42.mjs): classic rule unchanged; the React index is accepted only
   when its module script answers 200 with more than 1,000 bytes and its other files answer; a small page that is not the React index fails.
   usage: node scripts/tests28342/pagecheck42.test.mjs */
import { pageEssential } from '../../server/api/pagecheck42.mjs';
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + JSON.stringify(d))); };
const B = (s) => Buffer.from(s);
const IDX = '<!doctype html><html><head><script src="/agn-place-search.js" defer></script><script type="module" crossorigin src="/app/assets/index-C5gMW0xF.js"></script><link rel="modulepreload" crossorigin href="/app/assets/react-CUoTtJiY.js"></head><body><div id="root"></div></body></html>';
const site = (over = {}) => async (p) => { const m = { '/': { status: 200, body: B(IDX) }, '/app/assets/index-C5gMW0xF.js': { status: 200, body: B('x'.repeat(3358)) }, '/app/assets/react-CUoTtJiY.js': { status: 200, body: B('r'.repeat(140000)) },
  '/app/protomaps-leaflet.js': { status: 200, body: B('p'.repeat(128000)) }, '/app/data/pk-bound.json': { status: 200, body: B('{}') }, ...over }; return m[p] || { status: 404, body: B('{"error":"not_found"}') }; };
let r = await pageEssential(async () => ({ status: 200, body: B('x'.repeat(760287)) }), 1000); ok(r.ok && r.kind === 'classic', 'classic page (760 kB) passes as before', r);
r = await pageEssential(async () => ({ status: 200, body: B('x'.repeat(900)) }), 1000); ok(!r.ok, 'a small page that is not the React index fails', r);
r = await pageEssential(async () => ({ status: 503, body: B('{}') }), 1000); ok(!r.ok && /503/.test(r.why), 'GET / not 200 fails', r);
r = await pageEssential(site(), 1000); ok(r.ok && r.kind === 'react', 'React index + module script 3,358 bytes + its files: passes', r);
r = await pageEssential(site({ '/app/assets/index-C5gMW0xF.js': { status: 404, body: B('{"error":"not_found"}') } }), 1000); ok(!r.ok && /index-C5gMW0xF\.js answered 404/.test(r.why), 'module script missing: fails', r);
r = await pageEssential(site({ '/app/assets/index-C5gMW0xF.js': { status: 200, body: B('x'.repeat(500)) } }), 1000); ok(!r.ok, 'module script of 500 bytes: fails', r);
r = await pageEssential(site({ '/app/assets/react-CUoTtJiY.js': { status: 404, body: B('') } }), 1000); ok(!r.ok && /react-CUoTtJiY/.test(r.why), 'a preloaded asset missing: fails', r);
r = await pageEssential(site({ '/app/data/pk-bound.json': { status: 404, body: B('') } }), 1000); ok(!r.ok && /pk-bound/.test(r.why), 'the boundary data missing: fails', r);
r = await pageEssential(site({ '/': { status: 302, location: '/app/', body: B('') }, '/app/': { status: 200, body: B(IDX) } }), 1000); ok(r.ok, 'a redirect is followed', r);
r = await pageEssential(async () => ({ status: 200, body: B('x'.repeat(760287)) }), 1000, { react: { wanted: true, built: false } }); ok(r.ok && /not installed/.test(r.why), 'React wanted, build missing, classic fallback serving: passes and says so', r);
r = await pageEssential(async () => ({ status: 200, body: B('<div id="root"></div><script type="module" src="/elsewhere/x.js"></script>') }), 1000); ok(!r.ok, 'a module script outside /app/assets is not the React index', r);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
