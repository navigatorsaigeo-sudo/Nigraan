#!/usr/bin/env node
/* v91.17.275 HAZ2 · server tests: GEM fault layer offline (NIGRAAN's own copy), Sources page credits (GEM CC BY-SA, SUPARCO by name),
   GLOF on SUPARCO's current inventory, one GLOF word across surfaces (glof, site screening, AI facts), no ladder words to a client.
   node scripts/tests275haz/haz.test.mjs [baseUrl]   (default http://127.0.0.1:8979) */
import { readFileSync } from 'node:fs';
import { viaBundle } from '../lib/retired.mjs';
const BASE = (process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8979').replace(/\/$/, '');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n + (x != null && x !== '' ? ' · ' + String(x).slice(0, 220) : '')); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); } };
const get = async (p, h) => { const r = await fetch(BASE + p, { headers: h || {}, signal: AbortSignal.timeout(180000) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t }; };
const getB = viaBundle(get);   /* v91.17.283.19: the retired place routes read the place bundle's part (scripts/lib/retired.mjs) */
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'], LADDER = /\b(Monitor|Watch|Act|Priority|Elevated)\b/;

/* ── faults ── */
const F = await get('/api/faults');
ok(F.status === 200 && F.json && F.json.ok && F.json.features.length === 403, '/api/faults answers 200 offline with the 403 GEM traces (was 503: no lake on this computer / lake mirror without the file)', F.status + ' ' + (F.json && F.json.why));
ok(F.json && /GEM Global Active Faults/.test(F.json.credit) && /CC BY-SA/.test(F.json.credit) && /Styron/.test(F.json.citation || ''), 'fault layer credited to GEM (CC BY-SA), Styron & Pagani 2020', F.json && F.json.credit);
const cats = {}; (F.json && F.json.features || []).forEach(f => { cats[f.properties.catalog] = (cats[f.properties.catalog] || 0) + 1; });
ok(cats.EMME === 141 && cats.HimaTibetMap === 244 && cats['Bird 2003'] === 18, 'catalogues as the lake catalogue lists them (EMME 141, HimaTibetMap 244, Bird 2003 18)', JSON.stringify(cats));
ok((F.json && F.json.features || []).every(f => !/damage|loss|PKR|USD/i.test(JSON.stringify(f.properties))), 'reference only: no damage or loss field on any trace');
const N = await get('/api/faults/nearest?lat=33.7&lon=73.05');
ok(N.json && N.json.ok && N.json.nearest && Math.abs(N.json.nearest.distanceKm - 4.2) < 0.05 && N.json.nearest.slipType === 'Reverse', 'Islamabad: nearest mapped trace 4.2 km, reverse (the laptop answer of 12 Oct, same data)', N.json && JSON.stringify(N.json.nearest));
const K = await get('/api/faults/nearest?lat=24.86&lon=67.01');
ok(K.json && K.json.ok && (K.json.nearest == null || K.json.nearest.distanceKm > 0), 'Karachi: a nearest-fault answer', K.json && JSON.stringify(K.json.nearest || K.json.note));
const H = await get('/health'); ok(H.status === 200, '/health answers', H.status);

/* ── sources page ── */
const S = await get('/api/sources');
const gem = S.json && (S.json.entries || []).find(e => e.id === 'gem_active_faults');
ok(gem && gem.licence === 'CC BY-SA 4.0' && /Styron/.test(gem.attribution || '') && /github\.com\/GEMScienceTools/.test(gem.url || '') && gem.customer !== false, 'Sources page lists GEM Global Active Faults, CC BY-SA 4.0, with the citation and repository', gem && gem.licence);
const pn = S.json && (S.json.entries || []).find(e => e.id === 'partner_networks');
ok(S.json && /SUPARCO/.test(S.json.statement || '') && /Glacier Geospatial Portal/.test(S.json.statement || '') && pn && /SUPARCO/.test(pn.use || ''), 'Sources page credits SUPARCO by name for the lake inventory and bulletins');
ok(S.json && !/\bPMD\b|\bFFD\b/.test(S.text), 'Sources page names no PMD / FFD');

/* ── GLOF: SUPARCO register, words ── */
const G = await get('/api/glof/national?force=1');
ok(G.json && /suparco/.test(G.json.registerVersion || ''), 'GLOF levels read the register on SUPARCO\'s current inventory', G.json && G.json.registerVersion);
const U = Object.values((G.json && G.json.units) || {}).filter(u => u.applicable);
ok(U.length > 0 && U.every(u => WORDS.includes(u.word) && !LADDER.test((u.basis || '') + ' ' + (u.text || ''))), 'every applicable tehsil: a five-word GLOF word and no ladder word in its sentence', U.length);
const reg = JSON.parse(readFileSync(new URL('../../data/glof-register-current.json', import.meta.url), 'utf8'));
const m = reg.suparco || {};
ok(m.matchedLakes > 2000 && m.areasUpdated > 2000 && m.added > 0 && reg.lakes.filter(l => l.areaSource === 'SUPARCO Glacier Geospatial Portal').length >= m.areasUpdated, 'register: SUPARCO areas on the matched lakes and the SUPARCO-only lakes added (' + m.matchedLakes + ' matched, ' + m.areasUpdated + ' areas, ' + m.added + ' added)');
ok(reg.lakes.every(l => !('suparco' in l) || l.suparco == null), 'no SUPARCO inventory record sits in the dangerous-list field (listOf) of any lake');
ok(reg.lakes.filter(l => l.listed).length === 130, 'the potentially-dangerous list is unchanged (130 listed lakes)');
const Up = await getB('/api/glof/upstream?lat=36.32&lon=74.65');
ok(Up.json && Up.json.applicable && WORDS.includes(Up.json.word) && (Up.json.lakes || []).every(l => ['High', 'Moderate', 'Low'].includes(l.tierLabel)) && (Up.json.lakes || []).some(l => l.areaSource === 'SUPARCO Glacier Geospatial Portal'), 'Hunza point: word ' + (Up.json && Up.json.word) + ', lake tiers in words, SUPARCO areas named per lake');
const Sc = await getB('/api/site/screening?lat=36.32&lon=74.65', { 'x-agn-view': 'customer' });
const gr = Sc.json && JSON.stringify(Sc.json).match(/"parameter":"Glacial lake outburst flood \(GLOF\)","values":"([A-Za-z]+)/);
ok(gr && gr[1] === Up.json.word, 'site screening GLOF row = the GLOF word (one rule; it printed Moderate for the standing class)', gr && gr[1] + ' vs ' + Up.json.word);
console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
