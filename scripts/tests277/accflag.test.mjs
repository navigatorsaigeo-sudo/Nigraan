import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.277 · ACCFLAG · the accuracy monitor's flag rule: a window thinner than the reference windows is flagged only beyond its extra
// sampling noise (noiseZ x sd x sqrt(1/n - 1/nRef)).
// Module tests (no server). The record tests read the laptop's accuracy record when it is staged (argument 1, else the upload path) and
// the LAMHA copy of the MACH database (argument 2) for the stuck-reading screen on every MACH series; they are skipped when absent.
// usage: node scripts/tests277/accflag.test.mjs [accmon folder] [MACH db folder]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAccMon, ACC_RULE, loadCities, pct, probit, siteOffsetC } from '../../server/api/accmon.mjs';
import { createHyperlocal } from '../../server/api/hyperlocal.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createMos } from '../../server/api/mos.mjs';
import { screenSeries } from '../../server/api/stuckscreen.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), DATA = join(APP, 'data');
const ARGS = process.argv.slice(2).filter((a) => !/^https?:\/\//.test(a));   /* a server address (the suite runner passes one) is not a folder */
const ACCDIR = ARGS[0] || __T.uploads('NIGRAAN/nig/nigraan-local/data/accmon');
const DB = ARGS[1] || __T.uploads('LAMHA/data/mach/db');
let pass = 0, fail = 0, skip = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const H = 3600e3, D = 864e5;
const CITIES = loadCities(DATA);
const stub = () => ({ mos: { zoneOfPoint: (la) => (la > 34.5 ? 'mountain' : 'plains') } });
const mk = (t, o = {}) => createAccMon(o.app || stub(), APP, DATA, { noSchedule: true, noLoad: true, noWrite: true, now: () => t, cities: CITIES, ...o });

/* ── N1 · the margin's level is the reference's own level ── */
ok(Math.abs(probit(0.95) - 1.6448536) < 1e-6 && Math.abs(probit(0.975) - 1.959964) < 1e-6 && Math.abs(probit(0.01) + 2.3263479) < 1e-6 && ACC_RULE.noiseZ === Math.round(probit(ACC_RULE.refPct) * 1e4) / 1e4,
  'N1 noiseZ is the one-sided normal quantile at refPct (no typed number)', 'noiseZ ' + ACC_RULE.noiseZ);

/* ── N2-N6 · the rule on synthetic records ── */
{
  const t = Date.parse('2026-11-20T12:00:00Z'), acc = mk(t), S = acc._snap;
  /* 20 days of own record: windows of 30 pairs, MAE ~0.8, sd |e| 0.55, sd e 0.9 */
  for (let k = 1; k <= 20 * 24; k++) { const w = Math.sin(k / 7); S.set(Math.floor(t / H) * H - k * H, { Bahawalpur: [0.8 + 0.1 * w, 0.1 * w, 30, 0.55, 0.9] }); }
  const rf = acc.reference('Bahawalpur', t); const p95 = rf.maeP95;
  ok(rf.sdAbsRef === 0.55 && rf.sdERef === 0.9 && rf.nRef === 30, 'N2 the reference carries its normal pair spread and its windows\' usual n', JSON.stringify({ sdAbsRef: rf.sdAbsRef, sdERef: rf.sdERef, nRef: rf.nRef }));
  const x = r2(p95 + 0.1);
  const usual = acc.flagsAt(t, { city: { Bahawalpur: { mae: x, bias: 0, n: 30, sdAbs: 0.6, sdE: 1 } } }), thin = acc.flagsAt(t, { city: { Bahawalpur: { mae: x, bias: 0, n: 8, sdAbs: 0.6, sdE: 1 } } });
  const m8 = r2(ACC_RULE.noiseZ * 0.55 * Math.sqrt(1 / 8 - 1 / 30));
  ok(usual.length === 1 && usual[0].noise.mae === 0 && thin.length === 0, 'N3 0.1 °C above the 95th percentile: flagged with the usual 30 pairs (the percentile already holds that chance spread); not with 8 (one station out: extra noise ±' + m8 + ')', JSON.stringify({ usual: usual.length, thin: thin.length }));
  const big = acc.flagsAt(t, { city: { Bahawalpur: { mae: r2(p95 + 0.5), bias: 0, n: 8, sdAbs: 0.6, sdE: 1 } } });
  ok(big.length === 1 && big[0].noise.mae === m8 && /sampling noise/.test(big[0].why), 'N4 a thin window is still flagged beyond its extra noise (0.5 °C above)', big[0] && big[0].why);
  const fault = acc.flagsAt(t, { city: { Bahawalpur: { mae: r2(p95 + 0.25), bias: 0, n: 12, sdAbs: 4.0, sdE: 4.0 } } });
  ok(fault.length === 1 && 0.25 < ACC_RULE.noiseZ * 4.0 * Math.sqrt(1 / 12 - 1 / 30), 'N5 a fault that widens the window\'s own spread (sd 4.0) is judged with the normal spread (0.55): still flagged, though its own sd would hide it', fault[0] && fault[0].why);
  const S2 = new Map(); for (let k = 1; k <= 20 * 24; k++) S2.set(Math.floor(t / H) * H - k * H, { Bahawalpur: [0.8, 0.1, 30] });
  const r0 = acc.reference('Bahawalpur', t, S2);
  const a0 = acc.flagsAt(t, { city: { Bahawalpur: { mae: 0.9, bias: 0, n: 8 } } }, S2), a1 = acc.flagsAt(t, { city: { Bahawalpur: { mae: 0.9, bias: 0, n: 8, sdAbs: 0.5, sdE: 0.5 } } }, S2);
  ok(r0.sdAbsRef === null && r0.nRef === 30 && a0.length === 1 && a1.length === 0, 'N6 records written before v277 (no sd): no sd at all keeps the old rule; the window\'s own sd is used when the reference has none', JSON.stringify({ old: a0.length, windowSd: a1.length }));
}

/* ── N7 · windowStats sd = direct computation; snapshots and blocks carry it ── */
{
  const t = Date.parse('2026-11-20T12:30:00Z'), acc = mk(t), P = acc._pairs, M = acc._meta;
  M.set('m:a', { name: 'a', lat: 31.55, lon: 74.34, kind: 'mach', zone: 'plains', cities: ['Lahore'] }); M.set('m:b', { name: 'b', lat: 31.5, lon: 74.3, kind: 'mach', zone: 'plains', cities: ['Lahore'] });
  const E = []; for (let k = 0; k < 24; k++) { const hk = Math.floor(t / H) * H - k * H; const ea = Math.sin(k) * 1.5 + 0.3, eb = Math.cos(k * 1.3) - 0.2; P.set(hk, new Map([['m:a', [20, 20 + ea]], ['m:b', [21, 21 + eb]]])); E.push(ea, eb); }
  const w = acc.windowStats(t, 24).city.Lahore; const n = E.length, m = E.reduce((a, b) => a + b, 0) / n, ma = E.reduce((a, b) => a + Math.abs(b), 0) / n;
  const sdE = Math.sqrt(E.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)), sdA = Math.sqrt(E.reduce((a, b) => a + (Math.abs(b) - ma) ** 2, 0) / (n - 1));
  ok(w.n === 48 && Math.abs(w.sdE - sdE) < 0.006 && Math.abs(w.sdAbs - sdA) < 0.006, 'N7 the window\'s sd of e and of |e| equal the direct sample sd', JSON.stringify({ sdE: w.sdE, direct: +sdE.toFixed(3), sdAbs: w.sdAbs, directAbs: +sdA.toFixed(3) }));
  const bs = acc.blockOf(t) - 6 * H; const b = acc.bsnapshot(bs);
  ok(b.c.Lahore && b.c.Lahore.length === 5, 'N8 6-h block records carry [mae, bias, n, sd |e|, sd e]', JSON.stringify(b.c.Lahore));
}

/* ── O · the siting offset the live layer applies (ACCFLAG 2) ── */
{
  const tmp = mkdtempSync(join(tmpdir(), 'acc277o-')), HL = join(tmp, 'hl'); mkdirSync(HL); for (const f of ['hyperlocal-model.json', 'mach-sun-correction.json', 'nowcast-model.json']) if (existsSync(join(DATA, f))) writeFileSync(join(HL, f), readFileSync(join(DATA, f)));
  const off = { gilgit: { ref: 'synop', refName: 'Gilgit', off: { day: 1.01, night: 2.65, between: 2.42 }, heldOut: false }, plain: null };
  const app = { mos: { zoneOfPoint: () => 'mountain' } };
  app.fleet = { stations: () => [], offsetFor: (k) => off[k] || null, excluded: () => false, elevOf: () => null, servedAt: () => null };
  const HLm = createHyperlocal(app, HL); let worst = 0, n = 0;
  for (let h = 0; h < 24; h++) { const ms = Date.parse('2026-10-16T00:10:00Z') + h * H; const rows = [{ key: 'gilgit', name: 'Gilgit', lat: 35.901151, lon: 74.369656, obsMs: ms, tempC: 15, served: 14, offset: off.gilgit }];
    const L = HLm.replay(rows, ms + 20 * 60e3); const r = (L.rows || []).find((x) => x.key === 'gilgit'); if (!r) continue; n++; worst = Math.max(worst, Math.abs(r.offsetC - siteOffsetC(off.gilgit, ms))); }
  ok(n >= 20 && worst < 0.006, 'O1 the monitor\'s offset equals the live layer\'s own (hyperlocal replay rows, every PKT hour of a day)', n + ' hours, largest difference ' + worst);
  const t = Date.parse('2026-10-16T16:30:00Z');
  app.hyperlocal = { looAt: () => ({ dT: 0 }), maxAgeMin: () => 60, radiusKm: () => 40 };
  app.fleet.liveReadings = () => [{ key: 'gilgit', name: 'Gilgit', lat: 35.9, lon: 74.37, obsMs: t - 5 * 60e3, tempC: 15.0, served: 12.0, offset: off.gilgit }, { key: 'plain', name: 'P', lat: 35.8, lon: 74.3, obsMs: t - 5 * 60e3, tempC: 13.0, served: 12.0 }];
  const acc = createAccMon(app, APP, DATA, { noSchedule: true, noLoad: true, noWrite: true, now: () => t, cities: CITIES }); await acc.run();
  const M = acc._pairs.get(Math.round((t - 5 * 60e3) / H) * H);
  ok(M && Math.abs(M.get('m:gilgit')[0] - (15 - 2.65)) < 0.06 && M.get('m:plain')[0] === 13, 'O2 live pairs: a station with an offset is scored as the layer uses it (15.0 - night 2.65), one without as read', M && JSON.stringify([...M]));
  const reg = JSON.parse(readFileSync(join(DATA, 'mach-fleet-stations.json'), 'utf8')).stations; const kh = reg.find((x) => x.key === 'khaplu');
  ok(kh && ((kh.exclude && kh.exclude.kind === 'indoor') || (kh.excludeWithdrawn && kh.excludeWithdrawn.kind === 'indoor' && /outdoor-array screen/.test(kh.excludeWithdrawn.withdrawn))), 'O3 the registry records the Khaplu decision (v91.17.277 indoor exclusion; v91.17.278 withdrawn for the outdoor-array screen)', kh && JSON.stringify(kh.exclude || kh.excludeWithdrawn).slice(0, 160));
}

/* ── W · as measured vs siting-adjusted (ACCFLAG 3) ── */
{
  const t = Date.parse('2026-11-20T00:30:00Z'), acc = mk(t), P = acc._pairs, M = acc._meta;
  M.set('m:roof', { name: 'roof', lat: 29.1, lon: 71.7, kind: 'mach', zone: 'plains', cities: ['Bahawalpur'] }); M.set('s:syn', { name: 'syn', lat: 29.4, lon: 71.7, kind: 'synop', zone: 'plains', cities: ['Bahawalpur'] });
  for (let k = 0; k < 24; k++) { const hk = Math.floor(t / H) * H - k * H; P.set(hk, new Map([['m:roof', [20, 20.2, 18]], ['s:syn', [21, 21.1]]])); }
  const w = acc.windowStats(t, 24).city.Bahawalpur;
  ok(w.offsetStations === 1 && w.mae === 0.15 && w.rawBias === 1.15 && w.rawMae === 1.15, 'W1 windows carry the as-measured MAE / bias beside the adjusted ones and the number of stations with an offset', JSON.stringify({ mae: w.mae, bias: w.bias, rawMae: w.rawMae, rawBias: w.rawBias, offsetStations: w.offsetStations }));
  const am = acc.asMeasured({ city: { Bahawalpur: w, Lahore: { n: 40, mae: 1, bias: 0 } } }, []);
  ok(am.length === 1 && am[0].city === 'Bahawalpur' && am[0].asMeasured.bias === 1.15 && am[0].adjusted.bias === 0.15, 'W2 the as-measured list holds the cities with an offset station (or flagged), both views', JSON.stringify(am));
  /* round trip through the record file: the 4th value (tenths) is the reading as measured */
  const dir = mkdtempSync(join(tmpdir(), 'acc277w-')); writeFileSync(join(dir, '2026-11.jsonl'), JSON.stringify({ ty: 'h', t: '2026-11-19T23:00Z', src: 'live', p: [['m:roof', 200, 202, 180], ['s:syn', 210, 211]] }) + '\n');
  const acc2 = createAccMon(stub(), APP, DATA, { dir, noSchedule: true, now: () => t, cities: CITIES, noWrite: true }); const Mh = acc2._pairs.get(Date.parse('2026-11-19T23:00:00Z'));
  ok(Mh && Mh.get('m:roof').length === 3 && Mh.get('m:roof')[2] === 18 && Mh.get('s:syn').length === 2, 'W3 the record line keeps the as-measured reading (4th value) and reads it back', JSON.stringify(Mh && [...Mh]));
  /* the night line: as measured beyond its own record, adjusted inside */
  const S = acc._bsnap, nb0 = acc.blockOf(Date.parse('2026-11-19T20:00:00Z')); for (let d = 1; d <= 20; d++) S.set(nb0 - d * D, { Bahawalpur: [0.8 + 0.3 * Math.cos(d), 0.3 * Math.sin(d), 6, 0.5, 0.7, 2.2, 2.0 + 0.3 * Math.sin(d)] });   /* a station 2 C off every night: chronic, still shown */
  S.set(nb0, { Bahawalpur: [0.9, 0.1, 6, 0.5, 0.7, 2.4, 2.3] }); const sf = acc.siteNightFlags(nb0), bf = acc.blockFlags(nb0);
  ok(sf.length === 1 && sf[0].label === acc.SITE_LABEL && !bf.some((x) => x.city === 'Bahawalpur'), 'W4 night: as measured +2.3 beyond the city\'s own night record (adjusted), adjusted +0.1 inside; a difference there every night still shows: the separate siting / microclimate line, not the main flag', sf[0] && sf[0].why);
  S.set(nb0, { Bahawalpur: [2.4, 2.3, 6, 0.5, 0.7, 2.4, 2.3] }); ok(acc.siteNightFlags(nb0).length === 0 && acc.blockFlags(nb0).length === 1, 'W5 adjusted bias also beyond: the main flag only, no siting line');
}

/* ── R · the laptop's accuracy record (17 Oct 2026 11:20 PKT flags: Bahawalpur, Umarkot, Chakwal) ── */
if (existsSync(join(ACCDIR, '2026-10.jsonl'))) {
  const mos = createMos({ dataDir: DATA, log: () => {} });
  const km = (a, b, c, d) => { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const acc = mk(Date.parse('2026-10-17T08:00:00Z'), { app: { mos } }); const P = acc._pairs, M = acc._meta, S = acc._snap;
  /* the record as the v277 monitor scores it: each MACH reading minus the live layer's siting offset (the laptop's data/mach-offsets.json
     of 17 Oct 01:42 UTC, when staged), registry-excluded stations out */
  const OFF_F = join(ACCDIR, '..', 'mach-offsets.json'); const OFFS = existsSync(OFF_F) ? JSON.parse(readFileSync(OFF_F, 'utf8')).stations || {} : {};
  const EXCL = new Set(JSON.parse(readFileSync(join(DATA, 'mach-fleet-stations.json'), 'utf8')).stations.filter((x) => x.exclude && x.exclude.why).map((x) => 'm:' + x.key));
  for (const f of ['2026-09.jsonl', '2026-10.jsonl']) { if (!existsSync(join(ACCDIR, f))) continue; for (const l of readFileSync(join(ACCDIR, f), 'utf8').split('\n')) { if (!l) continue; const j = JSON.parse(l);
    if (j.ty === 'm') M.set(j.id, { name: j.name, lat: j.lat, lon: j.lon, kind: j.kind, zone: j.zone, cities: CITIES.filter((c) => km(j.lat, j.lon, c.lat, c.lon) <= ACC_RULE.cityKm).map((c) => c.name) });
    else if (j.ty === 'h') { const ms = Date.parse(j.t); const X = P.get(ms) || P.set(ms, new Map()).get(ms); for (const [id, o, s] of j.p) { if (X.has(id) || EXCL.has(id)) continue; const oc = o / 10 - (id.startsWith('m:') ? siteOffsetC(OFFS[id.slice(2)], ms) : 0); X.set(id, Math.round(oc * 10) !== o ? [oc, s / 10, o / 10] : [oc, s / 10]); } } } }
  /* the hourly record recomputed from the pairs, with and without the sd (old rule) */
  const SO = new Map(), hs = [...P.keys()].sort((a, b) => a - b);
  for (let hk = hs[0]; hk <= hs.at(-1); hk += H) { const w = acc.windowStats(hk + H - 1, 24); const c = {}, c3 = {}; for (const [k, v] of Object.entries(w.city)) if (v.n >= ACC_RULE.minN) { c[k] = [v.mae, v.bias, v.n, v.sdAbs, v.sdE]; c3[k] = c[k].slice(0, 3); } S.set(hk, c); SO.set(hk, c3); }
  const strip = (w) => ({ city: Object.fromEntries(Object.entries(w.city).map(([k, v]) => [k, { ...v, sdAbs: null, sdE: null }])) });
  const t = Date.parse('2026-10-17T06:00:00Z') + H - 1, w = acc.windowStats(t, 24), tu = Date.parse('2026-10-17T03:00:00Z') + H - 1, wu = acc.windowStats(tu, 24);
  const fb = acc.flagsAt(t, w).find((x) => x.city === 'Bahawalpur'), fu = acc.flagsAt(tu, wu).find((x) => x.city === 'Umarkot'), yo = OFFS.jadeed_agricultu;
  ok(fu && fu.mae - acc.reference('Umarkot', tu).maeP95 < 0.15 && (!yo || !yo.off || !fb), 'R1 17 Oct: Umarkot (08:00 PKT, n ' + (wu.city.Umarkot || {}).n + ') reproduces just inside its own 5 % tail; Bahawalpur (11:00 PKT) is not flagged once Yazman is scored minus the layer\'s own night offset (' + (yo && yo.off ? yo.off.night : 'none') + ' °C vs Bahawalpur City synop)',
    (fu && fu.why) + ' | Bahawalpur ' + (fb ? fb.why : 'not flagged, 24-h ' + JSON.stringify(w.city.Bahawalpur && [w.city.Bahawalpur.mae, w.city.Bahawalpur.bias, w.city.Bahawalpur.n])));
  const t2 = Date.parse('2026-10-17T07:00:00Z') + H - 1, w2 = acc.windowStats(t2, 24), r2u = acc.reference('Umarkot', t2);
  ok(w2.city.Umarkot && w2.city.Umarkot.n < r2u.nRef, 'R2 Umarkot at 12:00 PKT holds ' + (w2.city.Umarkot || {}).n + ' reports (usual ' + r2u.nRef + '): the extra-noise margin applies', JSON.stringify(acc.flagsAt(t2, w2).find((x) => x.city === 'Umarkot') || 'not flagged'));
  /* blocks: the Chakwal night block 17 Oct 00-06 PKT (+3.2 C, one station, calm clear night) stays flagged */
  const BN = new Map(); const bks = []; for (let bs = acc.blockOf(hs[0]); bs <= acc.blockOf(hs.at(-1)) - 6 * H; bs += 6 * H) { acc.bsnapshot(bs, P, BN); bks.push(bs); }
  const bC = Date.parse('2026-10-16T19:00:00Z'); const fc = acc.blockFlags(bC, BN);
  ok(fc.some((x) => x.city === 'Chakwal' && /bias \+3\.\d+/.test(x.why)), 'R3 Chakwal 17 Oct 00-06 PKT block (served +3.2 °C too warm all night at Kallar Kahar) is still flagged', (fc.find((x) => x.city === 'Chakwal') || {}).why);
  /* the whole record: the 24-h flag rate falls to near the reference's own 5 % tail or below; the block rate to about 5 % */
  let j24 = 0, o24 = 0, n24 = 0; for (const hk of S.keys()) { const tt = hk + H - 1, ww = acc.windowStats(tt, 24); j24 += Object.values(ww.city).filter((v) => v.n >= ACC_RULE.minN).length; o24 += acc.flagsAt(tt, strip(ww), SO).length; n24 += acc.flagsAt(tt, ww).length; }
  const BO = new Map([...BN].map(([k, c]) => [k, Object.fromEntries(Object.entries(c).map(([a, v]) => [a, v.slice(0, 3)]))])); let jb = 0, ob = 0, nb = 0; for (const bs of bks) { jb += Object.keys(BN.get(bs)).length; ob += acc.blockFlags(bs, BO).length; nb += acc.blockFlags(bs, BN).length; }
  ok(n24 <= o24 && nb < ob && Math.abs(n24 / j24 - (1 - ACC_RULE.refPct)) < 0.02, 'R4 full record (23 Sep - 17 Oct): flagged city-hours ' + o24 + ' -> ' + n24 + ' of ' + j24 + ' (' + (100 * o24 / j24).toFixed(1) + ' % -> ' + (100 * n24 / j24).toFixed(1) + ' %, the 5 % tail the rule is built on), city-blocks ' + ob + ' -> ' + nb + ' of ' + jb + ' (' + (100 * ob / jb).toFixed(1) + ' % -> ' + (100 * nb / jb).toFixed(1) + ' %)');
  const k14 = Date.parse('2026-10-14T13:00:00Z'), k15 = Date.parse('2026-10-15T13:00:00Z');
  ok(acc.blockFlags(k14, BN).some((x) => x.city === 'Islamabad') && acc.blockFlags(k15, BN).some((x) => x.city === 'Islamabad'), 'R5 the as-served Islamabad evening faults of 14 and 15 Oct (stuck readings before the hotfix) stay flagged');
  /* ACCFLAG 3: the as-measured record beside the adjusted one; the night siting line */
  const sb = Date.parse('2026-10-16T19:00:00Z'), siteB = acc.siteNightFlags(sb, BN), bw = BN.get(sb) || {};
  const refB = acc.blockRef('Bahawalpur', sb, BN), r24 = acc.reference('Bahawalpur', Date.parse('2026-10-17T06:00:00Z') + H - 1);
  ok(!acc.blockFlags(sb, BN).some((x) => x.city === 'Bahawalpur') && bw.Bahawalpur && bw.Bahawalpur.length === 7, 'R6 Bahawalpur 17 Oct 00-06 PKT: off the main line; as measured +' + (bw.Bahawalpur || [])[6] + ' vs adjusted +' + (bw.Bahawalpur || [])[1] + ' °C. Night line: ' + (siteB.some((x) => x.city === 'Bahawalpur') ? 'shown' : 'not shown: its night reference is the ' + refB.why + ', |bias| 95th percentile ±' + refB.absBiasP95 + ' (24-h own record ±' + r24.absBiasP95 + ')'));
  let nSite = 0; const sc = {}; for (const bs of bks) if (new Date(bs + 5 * H).getUTCHours() === 0) for (const f of acc.siteNightFlags(bs, BN)) { nSite++; sc[f.city] = (sc[f.city] || 0) + 1; }
  const w17 = acc.windowStats(Date.parse('2026-10-17T06:00:00Z') + H - 1, 24).city.Bahawalpur, am = acc.asMeasured({ city: { Bahawalpur: w17 } }, []);
  ok(w17.offsetStations === 1 && w17.rawBias > w17.bias + 0.5 && am.length === 1 && am[0].asMeasured.bias === w17.rawBias, 'R7 Bahawalpur 24 h to 11:00 PKT: as measured MAE ' + w17.rawMae + ' / bias ' + w17.rawBias + ', siting-adjusted ' + w17.mae + ' / ' + w17.bias + ' (1 station with an offset); whole record: ' + nSite + ' night siting-line flags ' + JSON.stringify(sc));
} else { skip++; console.log('SKIP R1-R5 (no laptop accuracy record at ' + ACCDIR + ')'); }

/* ── Q · the stuck / replayed reading screen on every MACH series of the database copy: the flagged clusters' stations are clean ── */
if (existsSync(DB) && readdirSync(DB).some((f) => /^obs_\d{8}\.csv$/.test(f))) {
  const rows = new Map();
  for (const f of readdirSync(DB).filter((x) => /^obs_\d{8}\.csv$/.test(x)).sort()) { const L = readFileSync(join(DB, f), 'utf8').split('\n'); const h = L[0].split(','); const ix = (n) => h.indexOf(n);
    const K = ix('stationKey'), T = ix('time'), SR = ix('source'), tt = ix('temperatureC'), td = ix('dewPointC'), rh = ix('humidityPct'), p = ix('pressureHpa');
    for (let i = 1; i < L.length; i++) { const c = L[i].split(','); if (c.length < 5 || /^(qm|apple)$/i.test(c[SR])) continue; const num = (j) => (c[j] === '' || c[j] == null ? null : Number(c[j]));
      (rows.get(c[K]) || rows.set(c[K], []).get(c[K])).push({ ms: Date.parse(c[T]), T: num(tt), Td: num(td), RH: num(rh), P: num(p) }); } }
  const rate = {}; let all = 0, bad = 0; for (const [k, l] of rows) { l.sort((a, b) => a.ms - b.ms); const v = screenSeries(l); const b = v.filter((x) => x !== 'ok').length; rate[k] = [l.length, b]; all += l.length; bad += b; }
  const y = rate.jadeed_agricultu, c = rate.easyweather_wifi;
  ok(y && c && y[1] / y[0] < 0.005 && c[1] / c[0] < 0.005, 'Q1 every MACH series screened (' + rows.size + ' stations, ' + all + ' readings, ' + (100 * bad / all).toFixed(1) + ' % rejected): Yazman (Bahawalpur) ' + (y ? y[1] + ' of ' + y[0] : '-') + ', Kallar Kahar (Chakwal) ' + (c ? c[1] + ' of ' + c[0] : '-') + ' rejected: the flags are not stuck readings');
} else { skip++; console.log('SKIP Q1 (no MACH database copy at ' + DB + ')'); }

function r2(x) { return Math.round(x * 100) / 100; }
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL, ' + skip + ' skipped');
process.exit(fail ? 1 : 0);
