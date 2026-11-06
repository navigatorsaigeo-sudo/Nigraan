/* v91.17.283.31 · owner 1.7 · LAYER COVERAGE: for every map layer and day 0-3 of /api/levels, the count of tehsils in each of the four
   states (value, not applicable, not tested, missing / input not current), and the rule that no tehsil is left without a state or without
   its reason (owner 4.3: unknown is never Normal). Two modes:
     test   NIGRAAN_TEST_BASE=http://127.0.0.1:<port> node scripts/tests28331/layer_coverage.test.mjs          (fails on a broken rule)
     live   node scripts/tests28331/layer_coverage.test.mjs --live http://localhost:8787 [--out coverage.json]  (READ-ONLY: GETs only;
            prints the table and never fails on counts; run it on the laptop against the running server)  */
const A = process.argv.slice(2); const live = A.includes('--live'); const B = (live ? A[A.indexOf('--live') + 1] : (process.env.NIGRAAN_TEST_BASE || process.env.NIGRAAN_BASE || A[0] || '')).replace(/\/$/, '');
if (!B) { console.log('SKIP no base (NIGRAAN_TEST_BASE or --live <url>)'); process.exit(0); }
let n = 0, f = 0; const ok = (c, m, i) => { n++; if (live) return; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 400))); if (!c) f++; };
const get = async (p) => { const r = await fetch(B + p, { headers: { 'x-agn-view': 'customer' } }); return r.ok ? r.json() : { httpStatus: r.status }; };
const STATE = (v) => (v >= 0 ? 'value' : v === -2 ? 'outside_range' : v === -3 ? 'no_reach' : v === -4 ? 'not_applicable' : v === -5 ? 'not_tested' : v === -6 ? 'input_not_current' : 'missing');   /* v283.35 · audit B2: -2 and -3 are their own states */
const S = await get('/api/levels'); const layers = S && S.layers ? Object.keys(S.layers) : [];
ok(layers.length >= 10, 'the levels summary lists the layers (' + layers.length + ')', S && S.httpStatus);
const table = [];
for (const L of layers) for (const day of [0, 1, 2, 3]) {
  const r = await get('/api/levels?layer=' + encodeURIComponent(L) + '&day=' + day);
  if (!r || r.httpStatus || r.ready === false) { table.push({ layer: L, day, ready: false, why: (r && (r.why || r.httpStatus)) || 'no answer' }); continue; }
  const lv = r.levels || {}; const uids = Object.keys(lv); const c = { value: 0, outside_range: 0, no_reach: 0, not_applicable: 0, not_tested: 0, missing: 0, input_not_current: 0 }; let noWhy = 0;
  for (const u of uids) { const v = lv[u]; const st = typeof v === 'number' ? STATE(v) : 'missing'; c[st]++; if (st !== 'value' && !(r.whys && r.whys[u]) && !(r.facts && r.facts[u] && r.facts[u].why) && !(r.code && r.code[String(v)])) noWhy++; }
  table.push({ layer: L, day, kind: r.kind || 'hazard', units: uids.length, ...c, noReason: noWhy });
  ok(uids.length >= 570, L + ' day ' + day + ': every tehsil has a state (' + uids.length + ')', uids.length);
  ok(noWhy === 0, L + ' day ' + day + ': every non-value state carries its reason', noWhy);
  if (r.states) ok(['value', 'outside_range', 'no_reach', 'not_applicable', 'not_tested', 'missing'].every((k) => (r.states[k] || 0) === c[k]) && (r.states.input_not_current || 0) === c.input_not_current, L + ' day ' + day + ': the served state counts equal the map', { served: r.states, map: c });
  if (r.kind === 'reference') ok(r.sameEveryDay === true, L + ': a reference layer is the same every day');
}
const pad = (s, k) => String(s).padEnd(k);
console.log('\n' + pad('layer', 16) + pad('day', 4) + pad('value', 7) + pad('n/a', 6) + pad('untest', 7) + pad('missing', 8) + pad('notcur', 7) + 'noReason');
for (const t of table) console.log(t.ready === false ? pad(t.layer, 16) + pad(t.day, 4) + 'not ready: ' + t.why : pad(t.layer, 16) + pad(t.day, 4) + pad(t.value, 7) + pad(t.not_applicable, 6) + pad(t.not_tested, 7) + pad(t.missing, 8) + pad(t.input_not_current, 7) + t.noReason);
if (A.includes('--out')) (await import('node:fs')).writeFileSync(A[A.indexOf('--out') + 1], JSON.stringify({ base: B, at: new Date().toISOString(), table }, null, 1));
if (live) { console.log('\nread-only check of ' + B + ' done (' + table.length + ' layer-days)'); process.exit(0); }
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
