/* v91.17.70 · Sprint 1 · engineering & layers. Run after the server restarts:  node scripts/tests70/engineering_layers.test.mjs
   Checks what a customer sees (served routes and the served client page); a few provenance checks read the data headers.
     1  curve number from WorldCover 10 m bounded by Open Buildings footprints (not the ESRI/IO 2025 built class)
     2  HAND for the 92 scored units the 66-75 E / 23.5-35 N domain left out; a riverine factor on every unit that has a major river
     3  no invented engineering constants: physical heat/cold check classed against the client limit or a cited reference, never "Clear";
        no "50 mm/h storm" and no default crane gust in the served client
     4  point → tehsil by polygon: the 11 estates of board/industrial_engineering_checks/estate_resolver.py
   Prints PASS / FAIL / SKIP lines; exits 1 on any FAIL. BASE overrides http://127.0.0.1:8787. */
import { readFileSync } from 'node:fs';
import { viaBundle } from '../lib/retired.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails = 0;
const pass = (m) => console.log('PASS ' + m), fail = (m) => { fails++; console.log('FAIL ' + m); }, skip = (m) => console.log('SKIP ' + m);
const check = (ok, m, why = '') => ok ? pass(m) : fail(m + (why ? ' — ' + why : ''));
const get = async (p, opt = {}) => { const r = await fetch(BASE + p, { signal: AbortSignal.timeout(opt.timeout || 30000), ...opt }); const t = await r.text(); try { return { status: r.status, json: JSON.parse(t), text: t }; } catch { return { status: r.status, json: null, text: t }; } };
const getB = viaBundle(get);   /* v91.17.283.19: the retired place routes read the place bundle's part (scripts/lib/retired.mjs) */
const enc = encodeURIComponent;
const data = (f) => JSON.parse(readFileSync(join(APP, 'data', f), 'utf8'));

/* ── 1 · curve number and impervious share ─────────────────────────────── */
async function cn() {
  const hills = { 'Azad Kashmir|Poonch|Rawalakot': 82.1, 'Azad Kashmir|Sudhnoti|Tarar Khal': 82.1, 'Azad Kashmir|Bagh|Dhir Kot': 83.3 };
  for (const [uid, before] of Object.entries(hills)) {
    const r = await get('/api/flood/runoff?unit=' + enc(uid) + '&p=50');
    const c = r.json && r.json.cn2;
    check(r.status === 200 && c != null && c <= before - 4, 'CN_II ' + uid.split('|').pop() + ' is off the ESRI-inflated value', 'served ' + c + ', v60 ' + before);
    check(r.json && /WorldCover/.test(r.json.soilBasis || '') && !/land cover 2025/.test(r.json.soilBasis || ''), 'CN basis for ' + uid.split('|').pop() + ' names WorldCover 10 m, not the 2025 grid', r.json && r.json.soilBasis);
  }
  const lc = await get('/api/terrain/landcover?unit=' + enc('Azad Kashmir|Poonch|Rawalakot'));
  check(lc.status === 200 && lc.json.cellM === 10 && lc.json.shares.built >= 0.03, 'WorldCover read at 10 m keeps Rawalakot\'s scattered houses (built >= 0.03)', lc.json && ('cellM ' + lc.json.cellM + ', built ' + lc.json.shares.built));
  check(lc.json && lc.json.impervious && lc.json.impervious.share <= 3 * lc.json.impervious.footprintShare + 1e-9, 'impervious share served with its footprint bound', lc.json && JSON.stringify(lc.json.impervious));
  const C = data('cn-tehsil.json'); const U = Object.entries(C.units);
  const over = U.filter(([, u]) => u.footprint_share != null && u.impervious_share > 3 * u.footprint_share + 5e-4).map(([k]) => k);
  const under = U.filter(([, u]) => u.footprint_share != null && u.impervious_share < u.footprint_share - 5e-4).map(([k]) => k);
  check(over.length === 0 && under.length === 0, 'every tehsil: footprint share <= impervious share <= 3x footprint share (board P2)', over.concat(under).slice(0, 5).join(', '));
  const L25 = data('landcover-2025-tehsil.json');
  const esri = Object.values(L25.units).filter(u => u.imperviousProxy != null && u.esriBuiltShare != null && Math.abs(u.imperviousProxy - u.esriBuiltShare) < 1e-9 && u.esriBuiltShare > 0.2).length;
  check(L25.version === 'v91.17.70' && esri === 0, 'imperviousProxy no longer carries the ESRI built share', esri + ' units still equal');
  for (const [f, J] of [['cn-tehsil.json', C], ['landcover-2025-tehsil.json', L25], ['landcover-tehsil.json', data('landcover-tehsil.json')], ['hand-tehsil.json', data('hand-tehsil.json')], ['engineering-references.json', data('engineering-references.json')]])
    check(!!(J.built && (J.licence || J.licences || J.references) && (J.source || J.method || J.references)), f + ' carries built / source / licence in its header');
}

/* ── 2 · HAND north of 35 N, east of 75 E and in western Balochistan ─────── */
async function hand() {
  const N = await get('/api/flood/hand', { timeout: 60000 });
  if (!N.json || !N.json.ready) return fail('/api/flood/hand not ready: ' + (N.json && N.json.why));
  const H = data('hand-tehsil.json'); const ext = Object.values(H.extensions || {}).flatMap(e => e.units || []);
  check(ext.length >= 90, 'HAND extension covers the units outside the main domain', ext.length + ' units');
  check(N.json.counts.notInDomain === 0, 'no scored tehsil is outside every HAND domain', 'notInDomain ' + N.json.counts.notInDomain);
  const noMajorOk = new Set(['Balochistan|Kharan|Tomulk', 'Balochistan|Washuk|Shaogari']);   /* closed Kharan / Mashkel basin: no river over 970 km2 */
  let withF = 0, bad = [];
  for (const uid of ext) { const r = await get('/api/flood/hand?unit=' + enc(uid)); if (r.status === 200 && r.json.factor != null && !r.json.why) withF++; else if (!noMajorOk.has(uid)) bad.push(uid + ': ' + (r.json && (r.json.why || r.json.error))); }
  check(bad.length === 0, 'every extended unit with a major river gets a riverine factor (' + withF + ' of ' + ext.length + ')', bad.slice(0, 4).join('; '));
  for (const uid of ['Gilgit Baltistan|Skardu|Skardu', 'Gilgit Baltistan|Gilgit|Gilgit', 'Balochistan|Gwadar|Gwadar', 'Balochistan|Kech|Kech (Turbat)', 'Punjab|Narowal|Shakargarh']) {
    const r = await get('/api/flood/hand?unit=' + enc(uid));
    check(r.status === 200 && r.json.factor > 0 && r.json.factor <= 1 && /HAND/.test(r.json.basis || ''), 'riverine "where" served for ' + uid.split('|').pop(), r.json && (r.json.why || r.json.error));
  }
}

/* ── 3 · engineering constants ─────────────────────────────────────────── */
async function constants() {
  const page = await get('/', { timeout: 60000 });
  if (page.status !== 200) return fail('client page not served (' + page.status + ')');
  check(!/50 mm\/h storm/.test(page.text), 'served client has no "50 mm/h storm"');
  check(!/typical mobile-crane in-service gust limit/.test(page.text), 'served client has no written-in crane gust default');
  check(!/Screening cuts, printed; not the client/.test(page.text), 'physical-check card no longer advertises written-in cuts');
  /* the physical check at one asset: a client limit on the daily maximum, none on wet bulb / minimum */
  const body = { assets: [{ id: 'eng70-hattar', name: 'Hattar test', lat: 33.86, lon: 72.84, limits: [{ variable: 'temperature_2m_max', limit: 20, dir: 'above', authority: 'test' }] }] };
  const r = await get('/api/limits/evaluate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), timeout: 180000 }).catch(e => ({ status: 0, json: null, text: e.message }));
  const a = r.json && r.json.assets && r.json.assets[0]; const P = a && a.physical;
  if (!P || !P.dryHeat) return skip('physical check not returned (provider or run unavailable): ' + (r.status + ' ' + (a && JSON.stringify(a.run || a.why || '')).slice(0, 160)));
  const cls = ['heat', 'dryHeat', 'cold'].map(k => P[k] && P[k].class);
  check(!cls.includes('Clear'), 'physical heat / dry heat / cold never print "Clear"', cls.join(','));
  check(P.dryHeat.against === 'client limit' && /registered limit/.test(P.dryHeat.cuts || ''), 'daily maximum is classed against the client\'s own limit', JSON.stringify(P.dryHeat).slice(0, 200));
  check(P.heat.against === 'reference' && /Vecellio/.test(P.heat.basis || '') && P.heat.class !== 'Act', 'wet bulb without a client limit uses the cited reference and never Act', JSON.stringify(P.heat).slice(0, 200));
  check(P.cold.against === 'reference' && /Khanpur/.test(P.cold.basis || ''), 'cold reference is the climate of the tehsil the asset lies in (Khanpur, not Taxila)', (P.cold.basis || '').slice(-80));
}

/* ── 4 · point → tehsil by polygon (estate_resolver.py) ─────────────────── */
async function resolver() {
  const sites = { 'SITE Karachi': [24.90, 66.99, 'Sindh|Keamari|Site Town'], 'Korangi IA': [24.83, 67.12, 'Sindh|Korangi|Korangi Town'], 'Port Qasim': [24.79, 67.35, 'Sindh|Malir|Bin Qasim Town'],
    'Sundar IE Lahore': [31.30, 74.21, 'Punjab|Lahore|Lahore City'], 'QeA IE Kot Lakhpat': [31.46, 74.33, 'Punjab|Lahore|Lahore Cantt'], 'M-3 Faisalabad': [31.60, 72.95, 'Punjab|Chiniot|Chiniot'],
    'Sialkot SIE': [32.50, 74.52, 'Punjab|Sialkot|Sialkot'], 'Hattar SEZ': [33.86, 72.84, 'Khyber Pakhtunkhwa|Haripur|Khanpur'], 'Gadoon Amazai': [34.10, 72.65, 'Khyber Pakhtunkhwa|Swabi|Topi'],
    'Rashakai SEZ': [34.08, 72.00, 'Khyber Pakhtunkhwa|Nowshera|Nowshera'], 'Gwadar FZ': [25.13, 62.33, 'Balochistan|Gwadar|Gwadar'] };
  let wrong = [];
  for (const [n, [la, lo, want]] of Object.entries(sites)) {
    const r = await getB('/api/climatology/baseline?lat=' + la + '&lon=' + lo);
    if (!r.json || !r.json.ready) { fail('baseline for ' + n + ' not served: ' + (r.json && r.json.why)); continue; }
    if (r.json.unit !== want) wrong.push(n + ' → ' + r.json.unit);
    else if (r.json.resolvedBy !== 'polygon') wrong.push(n + ' resolved by ' + r.json.resolvedBy);
  }
  check(wrong.length === 0, 'all 11 estates resolve to the tehsil polygon they lie in (was 3 of 11 wrong by nearest centroid)', wrong.join('; '));
  const off = await getB('/api/climatology/baseline?lat=25.05&lon=62.30');   /* offshore of Gwadar, inside no polygon */
  check(off.json && off.json.unit === 'Balochistan|Gwadar|Gwadar' && off.json.resolvedBy === 'nearest boundary', 'a point offshore resolves to the nearest boundary and says so', off.json && (off.json.unit + ' / ' + off.json.resolvedBy));
}

for (const [name, fn] of [['curve number', cn], ['HAND', hand], ['engineering constants', constants], ['resolver', resolver]]) {
  try { await fn(); } catch (e) { fail(name + ' threw: ' + e.message); }
}
console.log(fails ? `\n${fails} FAIL` : '\nall PASS'); process.exit(fails ? 1 : 0);
