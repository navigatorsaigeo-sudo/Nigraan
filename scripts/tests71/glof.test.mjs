#!/usr/bin/env node
/* v91.17.71 · GLOF (agent G): the national lake inventory back on the default path, and GLOF only where a lake drains.
   node scripts/tests71/glof.test.mjs [baseUrl]      (default http://127.0.0.1:8787; the server runs WITHOUT
   NIGRAAN_INTERNAL_REF and with station data on, the default). PASS / FAIL / INFO / SKIP lines; exit 1 on any FAIL.
   Tests what a customer receives from /api/glof/* (s71/CHANGES_glof_map.md). */
import { readFileSync, existsSync } from 'node:fs';
import { viaBundle } from '../lib/retired.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const BASE = (process.argv.slice(2).find(a => /^https?:/.test(a)) || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
let fails = 0, passes = 0;
const ok = (c, name, extra) => { if (c) { passes++; console.log('PASS ' + name + (extra != null && extra !== '' ? ' · ' + String(extra).slice(0, 300) : '')); } else { fails++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const info = (t) => console.log('INFO ' + t), skip = (t) => console.log('SKIP ' + t);
const get = async (p) => { const r = await fetch(BASE + p, { signal: AbortSignal.timeout(300000) }); let j = null, t = ''; try { t = await r.text(); j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t }; };
const getB = viaBundle(get);   /* v91.17.283.19: the retired place routes read the place bundle's part (scripts/lib/retired.mjs) */
const LEVELS = ['Low', 'Monitor', 'Watch', 'Act'];   /* the ladder's machine codes (class) */
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];   /* (275) the only tier words a client sees (owner); word = the five-word level */
const WORD_OF = { Low: 'Normal', Monitor: 'Normal', Watch: 'High', Act: 'Severe' };   /* (275) as the map and AI (hazard-scale glofStandingLevel) */
/* supplier names, whole words, case-insensitive (base64, data URIs and hex colours removed first), as names.test.mjs */
const SL = JSON.parse(readFileSync(join(ROOT, 'data', 'source-labels.json'), 'utf8'));
const escR = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TERMS = (SL.forbiddenInCustomerOutput || []).map(t => ({ t, re: new RegExp('(?<![\\p{L}\\p{N}_])' + escR(t) + '(?![\\p{L}\\p{N}_])', 'iu') }));
const clean = (s) => String(s).replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g, ' ').replace(/[A-Za-z0-9+/]{120,}={0,2}/g, ' ').replace(/#[0-9a-fA-F]{3,8}\b/g, ' ');
const named = (s) => { const c = clean(s); const h = TERMS.find(x => x.re.test(c)); return h ? h.t + ' … ' + (c.match(h.re) ? c.slice(Math.max(0, c.search(h.re) - 60), c.search(h.re) + 40) : '') : null; };
const CITIES = { 'Sindh|South Karachi|Saddar Town': 'Karachi (Saddar)', 'Punjab|Lahore|Lahore City': 'Lahore City', 'Punjab|Multan|Multan City': 'Multan City', 'Sindh|Hyderabad|Hyderabad City': 'Hyderabad City' };

/* ── 1. the national table: a level only where a glacial lake drains ── */
const N = await get('/api/glof/national?force=1');
ok(N.status === 200 && N.json && N.json.ok, 'national table served', N.status);
const NU = (N.json && N.json.units) || {};
const all = Object.entries(NU), app = all.filter(([, u]) => u.applicable === true), na = all.filter(([, u]) => u.applicable === false);
ok(N.json && N.json.register === 'merged', 'default path serves the merged register (national inventory + open register)', N.json && N.json.register);
ok(app.length >= 20 && app.length <= 150, 'GLOF-coloured tehsils are tens, not 577: ' + app.length + ' applicable, ' + na.length + ' not applicable');
ok(app.every(([, u]) => LEVELS.includes(u.class) && u.level === u.class && typeof u.index === 'number'), 'applicable tehsils carry a level in Low / Monitor / Watch / Act and a map grade', [...new Set(app.map(([, u]) => u.class))].join(','));
ok(na.every(([, u]) => u.class == null && u.level == null && u.index == null && u.text === 'No glacial lake upstream'), 'every other tehsil: applicable:false, no class, no level, no grade, "No glacial lake upstream"', na.filter(([, u]) => u.class != null || u.text !== 'No glacial lake upstream').slice(0, 2).map(x => x[0] + ':' + x[1].class + ':' + x[1].text).join(' | '));
for (const [uid, nm] of Object.entries(CITIES)) ok(NU[uid] && NU[uid].applicable === false, nm + ' carries no GLOF level', NU[uid] && NU[uid].class);
for (const uid of ['Gilgit Baltistan|Hunza|Gojal', 'Khyber Pakhtunkhwa|Chitral Upper|Mastuj', 'Gilgit Baltistan|Hunza|Ali Abad']) ok(NU[uid] && NU[uid].applicable === true && LEVELS.includes(NU[uid].class), uid.split('|')[2] + ' (glacial lakes upstream) carries a level', NU[uid] && NU[uid].class);
ok(all.every(([, u]) => u.class !== 'Clear' && u.class !== 'Not applicable'), 'no "Clear" and no "Not applicable" class');
const C = (N.json && N.json.counts) || {};
ok(LEVELS.reduce((s, k) => s + (C[k] || 0), 0) === app.length && N.json.notApplicable === na.length, 'national counts add up to the applicable tehsils', JSON.stringify(C) + ' notApplicable ' + (N.json && N.json.notApplicable));
const acts = app.filter(([, u]) => u.class === 'Act'), watches = app.filter(([, u]) => u.class === 'Watch');
ok(acts.every(([, u]) => ['measured-drainage', 'event-report'].includes(u.signal)), 'Act only on an observed signal: ' + acts.length + ' Act');
ok(watches.every(([, u]) => ['growth', 'recent-outburst', 'measured-drainage', 'event-report'].includes(u.signal)), 'Watch only on a precursor: ' + watches.length + ' Watch', watches.map(([k, u]) => k.split('|')[2] + ':' + u.signal).join(', '));
ok(!named(N.text), 'national payload names no supplier', named(N.text));
info('GLOF levels: ' + JSON.stringify(C) + ' · applicable ' + app.length + ' · not applicable ' + na.length + ' · disputed ' + (N.json && N.json.disputed));

/* ── 2. the default path uses the fuller inventory ── */
const M = await get('/api/glof/map');
ok(M.status === 200 && M.json && M.json.ok && M.json.register === 'merged', 'map layer served from the merged register');
let himag = 1948; try { const f = join(ROOT, 'data', 'glof-register-open.json'); if (existsSync(f)) himag = JSON.parse(readFileSync(f, 'utf8')).lakes.length; } catch (_) {}
const lakes = (M.json && M.json.lakes) || [], fi = (M.json && M.json.fields) || [];
ok(lakes.length > himag, 'the merged register holds more lakes than the Hi-MAG-only register: ' + lakes.length + ' > ' + himag);
const iId = fi.indexOf('id'), iArea = fi.indexOf('areaKm2'), iList = fi.indexOf('listStatus'), iTier = fi.indexOf('tierLabel'), iCond = fi.indexOf('condition');
ok(lakes.some(r => /^NLI-/.test(r[iId])) && lakes.some(r => /^GL\d/.test(r[iId])), 'inventory lakes (NLI-) and Hi-MAG lakes (GL…) are both served');
ok(lakes.filter(r => r[iList]).length >= 100, 'the national potentially-dangerous list reaches the map (' + lakes.filter(r => r[iList]).length + ' listed lakes)');
const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const att = lakes.find(r => km(r[0], r[1], 36.32, 74.87) < 2 && (r[iArea] || 0) > 3);
if (att) ok(!/PMD/i.test(att[iId]), 'Attabad (landslide-dammed, 4.5 km², national inventory only) is present: ' + att[iId] + ' · ' + att[iArea] + ' km² · ' + att[iTier]);
else skip('Attabad is not in the merged register served here');
ok(iTier >= 0 && lakes.every(r => ['High', 'Moderate', 'Low', 'Documented outburst site'].includes(r[iTier])), '(275) lake tiers carry five-word susceptibility words High / Moderate / Low (or Documented outburst site)');
ok(lakes.every(r => !/expanding/.test(String(r[iCond] || ''))), 'no lake carries the retired "expanding" state');
ok(M.json && M.json.credit && /data-sharing/.test(M.json.credit), 'the inventory is credited generically', M.json && M.json.credit);
ok(!named(M.text), 'map payload names no supplier', named(M.text));
info('lakes served: ' + lakes.length + ' (Hi-MAG-only register ' + himag + ')');

/* ── 3. point answers ── */
const K = await getB('/api/glof/upstream?lat=24.86&lon=67.01');
ok(K.json && K.json.ok && K.json.applicable === false && K.json.class == null && K.json.level == null && /No glacial lake upstream/.test(K.json.basis || ''), 'Karachi point: no glacial lake upstream, no level', K.json && (K.json.class + ' · ' + K.json.basis));
const G = await getB('/api/glof/upstream?lat=36.45&lon=74.87');
ok(G.json && G.json.ok && G.json.applicable === true && LEVELS.includes(G.json.class) && (G.json.lakes || []).length > 0, 'Hunza point: lakes upstream and a level', G.json && (G.json.class + ' · ' + (G.json.lakes || []).length + ' lakes'));
ok(G.json && !named(G.text), 'upstream payload names no supplier', G.json && named(G.text));
ok(G.json && (G.json.lakes || []).every(l => !('suparco' in l)), 'no supplier-named key in lake briefs on the default path');
const lid = att ? att[iId] : (lakes.find(r => /^NLI-/.test(r[iId])) || [])[iId];
if (lid) { const Lk = await get('/api/glof/lake?id=' + encodeURIComponent(lid)); ok(Lk.json && Lk.json.ok && !named(Lk.text), 'lake detail for ' + lid + ' names no supplier', named(Lk.text)); }

/* ── 4. live reads, bulletins, events, outlook: data on, names off ── */
const Lv = await get('/api/glof/live');
if (Lv.status === 200 && Lv.json && Lv.json.ok) { ok(!named(Lv.text), 'live summary names no supplier', named(Lv.text)); ok(Lv.json.preflight && Lv.json.preflight.passed === true, 'live reads come from a run whose radiometry pre-flight passed'); info('live: files ' + JSON.stringify(Lv.json.files) + ' · measured ' + Lv.json.measured + '/' + Lv.json.total + ' · change ' + JSON.stringify(Lv.json.changeCounts)); }
else skip('no live lake read installed (' + Lv.status + ')');
const B = await get('/api/glof/bulletins');
ok(B.json && Array.isArray(B.json.list) && B.json.list.length > 0, 'bulletins feed customer values again (' + (B.json && B.json.list ? B.json.list.length : 0) + ' bulletins held)');
ok(B.json && (B.json.list || []).every(b => /^https:\/\/space4climate\.gov\.pk\//.test(b.link || '')), 'bulletin links go to the published SUPARCO bulletin (v94: credited by name, CEO 30 Sep)');
ok(!named(B.text), 'bulletins payload names no supplier', named(B.text));
const E = await get('/api/glof/events'); ok(E.status === 200 && !named(E.text), 'events payload names no supplier', named(E.text));
const O = await get('/api/glof/outlook'); ok(O.status === 200 && !named(O.text), 'trigger-outlook payload names no supplier', named(O.text));

/* ── 5. drought in hyper-arid tehsils (climatology.mjs droughtClassOf) ── */
const D = await get('/api/climatology/drought');
if (D.json && D.json.ready && D.json.spi) {
  const du = Object.values(D.json.spi), dna = du.filter(u => u.drought && u.drought.applicable === false);
  ok(dna.every(u => u.drought.class == null && u.drought.text === 'Arid climate: drought index not defined'), 'arid tehsils with no defined index carry no drought class: ' + dna.length);
  ok(du.every(u => !u.drought || u.drought.applicable === false || u.drought.noData || LEVELS.includes(u.drought.class)), 'every other tehsil carries a drought class');
  ok(dna.every(u => ['spi90', 'spei90', 'spi30', 'spei30'].every(k => !u[k] || u[k].value == null)), 'not-applicable only where no index is defined');
  const cc = {}; du.forEach(u => { const k = u.drought ? (u.drought.class || 'not applicable') : 'none'; cc[k] = (cc[k] || 0) + 1; }); info('drought classes: ' + JSON.stringify(cc));
} else skip('drought table not built on this server');

/* ── (275) client words and SUPARCO's current inventory (owner 17 Oct) ── */
ok(app.every(([, u]) => WORDS.includes(u.word) && u.word === WORD_OF[u.class]) && na.every(([, u]) => u.word == null), '(275) every applicable tehsil carries a five-word level (word); the ladder code maps as on the map', [...new Set(app.map(([, u]) => u.word))].join(','));
ok(N.json && N.json.countsWord && Object.keys(N.json.countsWord).every(w => WORDS.includes(w)) && Object.values(N.json.countsWord).reduce((a, b) => a + b, 0) === app.length, '(275) national counts by word add up', JSON.stringify(N.json && N.json.countsWord));
const LADDER_WORD = /\b(Monitor|Watch|Act|Priority|Elevated)\b/;
const custText = (u) => [u.basis, u.text].filter(Boolean).join(' ');
ok(app.every(([, u]) => !LADDER_WORD.test(custText(u))), '(275) no ladder or tier word (Monitor / Watch / Act / Priority / Elevated) in any tehsil sentence', (app.find(([, u]) => LADDER_WORD.test(custText(u))) || [])[0]);
ok(G.json && WORDS.includes(G.json.word) && !LADDER_WORD.test(String(G.json.basis || '')) && (G.json.lakes || []).every(l => ['High', 'Moderate', 'Low'].includes(l.tierLabel)), '(275) Hunza point: word ' + (G.json && G.json.word) + ', lake tiers in words, basis without ladder words', G.json && String(G.json.basis).slice(0, 200));
ok(N.json && /suparco/.test(String(N.json.registerVersion || '')), '(275) the level reads the register on SUPARCO\'s current inventory', N.json && N.json.registerVersion);
ok(/SUPARCO Glacier Geospatial Portal/.test(String(N.json && N.json.credit)), '(275) the inventory is credited to SUPARCO by name', N.json && N.json.credit);
const SLI = lakes.filter(r => /^SLI-/.test(r[iId])).length;
info('(275) SUPARCO-only lakes in the served register drawn as their own dots: ' + SLI + ' (drawn through the SUPARCO inventory rows at zoom 9+ otherwise)');
skip('open-only path (NIGRAAN_STATION_DATA=0) is a server start option: run this server with it and expect register "open"');
console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
