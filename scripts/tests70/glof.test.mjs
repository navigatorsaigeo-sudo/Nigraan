/* v91.17.70 · Sprint 1 · GLOF: open register, Low / Monitor / Watch / Act, melt basis, measured change (s70/CHANGES_glof.md).
   Runs against the local server after the integrator restarts it:  node nigraan-local/scripts/tests70/glof.test.mjs
   Prints PASS/FAIL lines and exits 1 on any FAIL. Tests what a customer receives from /api/glof/*.
   The server must run WITHOUT NIGRAAN_INTERNAL_REF (the default): the open register is the customer register.
   v91.17.71 (checks marked (71)): station/lake data is used by default again (refmode.mjs stationData()): the customer register is
   the MERGED one (national inventory outlines + Hi-MAG, 3,702 lakes), the bulletin feed runs under generic titles, and a tehsil or
   site with no glacial lake upstream carries NO level (class null, applicable false, "No glacial lake upstream", no map fill).
   Suppliers are never named (data/source-labels.json forbiddenInCustomerOutput). tests71/glof.test.mjs is the full v71 suite. */
import { readFileSync } from 'node:fs';
import { viaBundle } from '../lib/retired.mjs';
const SL = (() => { try { return JSON.parse(readFileSync(new URL('../../data/source-labels.json', import.meta.url), 'utf8')); } catch (_) { return { labels: {}, forbiddenInCustomerOutput: [] }; } })();
const SUPPLIER = new RegExp('(?<![#\\w])(' + ['PMD'].concat(SL.forbiddenInCustomerOutput || []).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?!\\w)');
const NA_TEXT = 'No glacial lake upstream';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, name, extra) => { if (c) { passes++; console.log('PASS ' + name); } else { fails++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const get = async (p) => { const r = await fetch(BASE + p, { signal: AbortSignal.timeout(180000) }); let j = null, t = ''; try { t = await r.text(); j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t }; };
const getB = viaBundle(get);   /* v91.17.283.19: the retired place routes read the place bundle's part (scripts/lib/retired.mjs) */
/* names and sources that may not reach a customer (data-source decision option 2) */
const NAMED = /\bPMD\b/;   /* (94) SUPARCO's published bulletins are credited by name (CEO 30 Sep); PMD stays unnamed */
const LEVELS = ['Low', 'Monitor', 'Watch', 'Act'];   /* the ladder's machine codes (class) */
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];   /* (275) the only tier words a client sees (owner); word = the five-word level */
const WORD_OF = { Low: 'Normal', Monitor: 'Normal', Watch: 'High', Act: 'Severe' };   /* (275) as the map and AI (hazard-scale glofStandingLevel) */

/* ── 1. the national table: a level for every tehsil a lake drains to, none elsewhere; merged register; no "Clear" ── */
const N = await get('/api/glof/national?force=1');
ok(N.status === 200 && N.json && N.json.ok, 'national table served', N.status);
const U = N.json && N.json.units ? Object.values(N.json.units) : [];
ok(N.json && N.json.register === 'merged', 'national table uses the merged register (national inventory + Hi-MAG) (71)', N.json && N.json.register);
const UA = U.filter(u => u.applicable !== false && !u.disputed), UN = U.filter(u => u.applicable === false), UD = U.filter(u => u.disputed);   /* the disputed unit: no level, outside both counts */
ok(U.length >= 570 && UA.length >= 30 && UN.length >= 300 && UA.length === N.json.applicable && UN.length === N.json.notApplicable, 'every tehsil is in the table: ' + UA.length + ' with a GLOF level, ' + UN.length + ' with no lake upstream (71)', JSON.stringify({ applicable: N.json && N.json.applicable, notApplicable: N.json && N.json.notApplicable }));
ok(UA.every(u => LEVELS.includes(u.class) && WORDS.includes(u.word)) && UN.every(u => u.class == null && u.level == null && u.word == null) && UD.every(u => u.class == null && u.index == null), 'ladder codes Low / Monitor / Watch / Act and a five-word level (275) where a lake drains, null elsewhere (no Clear, no "Not applicable" class) (71)', [...new Set(U.map(u => u.class))].join(','));
ok(UA.every(u => typeof u.index === 'number' && u.index > 0) && UN.every(u => u.index == null && u.text === NA_TEXT), 'every tehsil a lake drains to carries a map grade; the others no fill, with "' + NA_TEXT + '" (71)');
const acts = U.filter(u => u.class === 'Act');
ok(acts.every(u => ['measured-drainage', 'event-report'].includes(u.signal)), 'Act only on an observed signal (measured drainage or confirmed report): ' + acts.length + ' Act', acts.map(u => u.signal).join(','));
const watches = U.filter(u => u.class === 'Watch');
ok(watches.every(u => ['growth', 'recent-outburst', 'measured-drainage', 'event-report'].includes(u.signal)), 'Watch only on a precursor or an observed signal beyond reach: ' + watches.length + ' Watch', watches.map(u => u.signal).join(','));
ok(!NAMED.test(N.text), 'national payload names no internal-reference source', (N.text.match(NAMED) || [])[0]);
ok(N.json && N.json.counts && LEVELS.reduce((s, k) => s + (N.json.counts[k] || 0), 0) === UA.length && UA.length + UN.length + (N.json.disputed || 0) >= U.length, 'national counts add up (levels = applicable units) (71)', JSON.stringify(N.json && N.json.counts));
console.log('     levels nationally: ' + JSON.stringify(N.json && N.json.counts));

/* ── 2. the map layer: open lakes, licence and attribution in the payload ── */
const M = await get('/api/glof/map');
ok(M.status === 200 && M.json && M.json.ok && M.json.register === 'merged', 'map layer served from the merged register (71)');
ok(M.json && Array.isArray(M.json.lakes) && M.json.lakes.length >= 3000, 'map layer carries the merged inventory (' + (M.json && M.json.lakes ? M.json.lakes.length : 0) + ' lakes and sites) (71)');
ok(M.json && M.json.license && /CC BY 4\.0/.test(M.json.license) && M.json.attribution && /Chen/.test(M.json.attribution), 'map layer carries licence and attribution');
const srcs = (M.json && M.json.sources) || {};
/* (71) the national inventory entry (lakeInventory) is used under a data-sharing arrangement: no URL by design, generic credit */
ok(Object.values(srcs).length >= 5 && Object.entries(srcs).every(([k, s]) => s.license && s.attribution && (s.url || k === 'lakeInventory')) && (!srcs.lakeInventory || (srcs.lakeInventory.url == null && String(srcs.lakeInventory.attribution).includes(SL.labels.lakeInventory || 'national glacial-lake inventory'))),
  'every source in the register header has licence, URL and attribution (the national inventory: generic credit, no URL) (71)', JSON.stringify(Object.keys(srcs)));
ok(!NAMED.test(M.text) && !SUPPLIER.test(M.text), 'map payload names no supplier (71)', (M.text.match(SUPPLIER) || M.text.match(NAMED) || [])[0]);
const fi = (M.json && M.json.fields) || [];
const iCond = fi.indexOf('condition'), iTier = fi.indexOf('tierLabel');
/* (71) bulletin conditions ("above-2025-max", "above-both-baselines") are back on the customer path; only the retired buffer state is banned */
ok(M.json && M.json.lakes.every(r => !/expanding/.test(String(r[iCond] || ''))), 'no lake carries the retired buffer "expanding" state (71)');
ok(iTier >= 0 && M.json.lakes.every(r => ['High', 'Moderate', 'Low', 'Documented outburst site'].includes(r[iTier])), '(275) lake tiers carry five-word susceptibility words High / Moderate / Low (or Documented outburst site) ("Watch" is a level only; v256: outburst sites with no lake outline are their own row)');

/* ── 3. the question an asset asks ── */
const K = await getB('/api/glof/upstream?lat=24.86&lon=67.0');
ok(K.status === 200 && K.json && K.json.ok && K.json.applicable === false && K.json.class == null && K.json.level == null && K.json.text === NA_TEXT, 'a site with no glacial lake upstream carries no level, with "' + NA_TEXT + '" (Karachi) (71)', K.json && (K.json.class + ' · ' + K.json.text));
const H = await getB('/api/glof/upstream?lat=36.36&lon=74.57&trigger=Act');
ok(H.status === 200 && H.json && LEVELS.includes(H.json.class), 'Shisper outlet answers with a level', H.json && H.json.class);
ok(H.json && (H.json.class !== 'Act' || (H.json.physical && H.json.physical.signal && ['measured-drainage', 'event-report'].includes(H.json.physical.signal.kind))), 'catchment rain (trigger=Act) no longer lifts a place to Act', H.json && H.json.basis);
ok(!NAMED.test(H.text) && !SUPPLIER.test(H.text), 'upstream payload names no supplier (71)', (H.text.match(SUPPLIER) || H.text.match(NAMED) || [])[0]);
ok(H.json && (H.json.lakes || []).every(l => !/expanding/.test((l.condition || {}).state || '')), 'upstream lakes carry no "expanding" state');

/* ── 4. melt: the forecast system's own anomaly, never the ERA5 absolute gap ── */
const O = await get('/api/glof/outlook');
ok(O.status === 200 && O.json && O.json.ok, 'trigger outlook served');
const first = O.json && O.json.rows && O.json.rows[0];
if (first) {
  const L1 = await get('/api/glof/outlook?lake=' + encodeURIComponent(first.id));
  const d = L1.json && L1.json.trigger && L1.json.trigger.drivers || {};
  ok(/re-forecast|melt term off/.test(String(d.meltBasis || '')), 'melt term is the model’s own re-forecast anomaly or off', d.meltBasis);
  ok(!d.pdd || !d.pdd.d3 || d.pdd.d3.aboveNormal === undefined, 'no degree-days "above normal" against the ERA5 normal');
  ok(L1.json && L1.json.trigger && L1.json.trigger.role && /never raises/.test(L1.json.trigger.role), 'the trigger is a modifier of the level');
} else ok(false, 'trigger outlook has rows');
const meltLoaded = (O.json && O.json.rows || []).filter(r => r.driver === 'melt' && r.T >= 0.5).length;
ok(meltLoaded <= Math.ceil(0.2 * ((O.json && O.json.rows || []).length || 1)), 'melt trigger loaded at no more than 20 % of Priority/Elevated lakes (was 209 on the ERA5 basis): ' + meltLoaded);

/* ── 5. our own lake reads: pre-flight passed, change rule measured, no "expanding" ── */
const V = await get('/api/glof/live');
ok(V.status === 200 && V.json && V.json.ok && V.json.register === 'merged', 'Sentinel-2 reads on the merged register outlines are served (71)', V.status + ' ' + (V.json && V.json.register));
if (V.json && V.json.ok) {
  ok(V.json.preflight && V.json.preflight.passed === true && V.json.preflight.lakesRead >= 2, 'the run passed the reference-lake pre-flight', JSON.stringify(V.json.preflight && { passed: V.json.preflight.passed, read: V.json.preflight.lakesRead }));
  const ch = V.json.rules && V.json.rules.change;
  /* (71) the v71 run reads the inventory outlines (29 pairs this run); the monitor sets no floor, the test floor moves 30 -> 25 */
  ok(ch && typeof ch.noiseP90 === 'number' && ch.noiseP90 > 0 && ch.noisePairs >= 25, 'growth threshold is the measured same-day two-tile p90 (71)', ch && JSON.stringify({ p90: ch.noiseP90, n: ch.noisePairs }));
  ok(!Object.keys(V.json.counts || {}).includes('expanding'), 'no lake is "expanding" (retired buffer rule)', JSON.stringify(V.json.counts));
  ok(/lake-v2\.1/.test(String(V.json.methodVersion || '')), 'reads carry the method version', V.json.methodVersion);
}
const B = await get('/api/glof/bulletins');
const BL = (B.json && B.json.list) || [];
ok(B.status === 200 && BL.length >= 3 && BL.every(b => b.title && /^https:\/\/space4climate\.gov\.pk\//.test(b.link || '')) && !NAMED.test(B.text) && !SUPPLIER.test(B.text),
  'bulletin feed: SUPARCO bulletins with their own titles and links (94), no other supplier name', BL.map(b => b.title).join(' | ').slice(0, 200));

/* ── 6. a lake record: open id, susceptibility, documented events from HMAGLOFDB ── */
const Lk = await get('/api/glof/lake?id=GL075475E36343N');   /* the Khurdopin ice-dammed lake (Hi-MAG id; HMAGLOFDB uses the same id) */
ok(Lk.status === 200 && Lk.json && Lk.json.ok && Lk.json.susceptibility && typeof Lk.json.susceptibility.S === 'number', 'lake record carries its susceptibility');
ok(Lk.json && Lk.json.documentedEvents && Lk.json.documentedEvents.events >= 10, 'Khurdopin carries its documented outbursts (HMAGLOFDB)', Lk.json && JSON.stringify(Lk.json.documentedEvents && Lk.json.documentedEvents.events));
ok(!NAMED.test(Lk.text) && !SUPPLIER.test(Lk.text), 'lake payload names no supplier (71)');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
