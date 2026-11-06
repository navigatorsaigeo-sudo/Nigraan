/* v91.17.275 · DEW · the final dew-point offset of the served chain (server/api/dewfix.mjs, data/dew-final.json).
     0 data file: a zone is applied only when every gate line in the file passed; offsets only for applied zones; months and horizon set
     1 switch: NIGRAAN_DEWFIX=0 off; zones not served (plains, hills, coast): answers unchanged byte for byte
     2 mountain, October: dew point + offset to 72 h ahead, capped at the temperature, temperature unchanged, RH = from T and the new dew
       point, apparent temperature up (Steadman), wet bulb / daily families / current block via humwind.consistency; beyond 72 h and in
       November: unchanged
     3 JS = Python (fixtures: 300 mountain tehsil hours from the gate's own pairs, fixed = min(dew + offset, T))
     4 chain: wired as the last stage behind app.dewfix.on() and the zone gate; the fleet pairs (upTo synop) never see it
     5 provenance agn_dewfix not serialised to customers; speed per answer (192 hours)
   usage: node scripts/tests275/dew275.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDewFix } from '../../server/api/dewfix.mjs';
import { createHumWind } from '../../server/api/humwind.mjs';
import { rhFromDew } from '../../server/api/psychro.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), APP = join(HERE, '..', '..'), DATA = join(APP, 'data');
let P = 0, F = 0; const pass = (m, d) => { P++; console.log('PASS ' + m + (d ? ' · ' + d : '')); }, fail = (m, d) => { F++; console.log('FAIL ' + m + (d ? ' · ' + d : '')); };
const M = JSON.parse(readFileSync(join(DATA, 'dew-final.json'), 'utf8'));
M.version ? pass('0 · data/dew-final.json present', M.version) : fail('0 · data file');
const okGate = Object.entries(M.zones).every(([z, v]) => v.applied === Object.values(v.gate).every(Boolean));
okGate ? pass('0 · applied = every gate line passed, per zone', Object.entries(M.zones).map(([z, v]) => z + ' ' + (v.applied ? 'PASS' : 'FAIL')).join(', ')) : fail('0 · applied vs gate lines');
Object.entries(M.zones).every(([z, v]) => v.applied ? Array.isArray(v.offsetsC) && v.offsetsC.length : v.offsetsC == null) ? pass('0 · offsets only for applied zones') : fail('0 · offsets for a zone not applied');
JSON.stringify(M.months) === '[9,10]' && M.horizonH === 72 ? pass('0 · months fitted (Sep, Oct) and horizon 72 h (lead days 0-2 scored)') : fail('0 · months / horizon', JSON.stringify(M.months) + ' ' + M.horizonH);

let hw = null; try { hw = createHumWind({ dataDir: DATA, zoneOf: () => 'mountain' }); } catch (_) { hw = null; }
const df = createDewFix({ dataDir: DATA, consistency: (loc) => hw && hw.consistency(loc) });
const NOW = Date.parse('2026-10-17T00:30:00Z');
const mk = (startIso, n = 192) => { const t0 = Date.parse(startIso); const time = [...Array(n)].map((_, i) => new Date(t0 + 5 * 3600e3 + i * 3600e3).toISOString().slice(0, 16));
  const T = time.map((_, i) => Math.round((12 + 8 * Math.sin(i / 24 * 2 * Math.PI)) * 10) / 10), Td = time.map((_, i) => (i % 17 === 0 ? T[i] - 0.5 : 2));
  return { utc_offset_seconds: 18000, elevation: 2400, hourly: { time, temperature_2m: T.slice(), dew_point_2m: Td.slice(), relative_humidity_2m: T.map((t, i) => Math.round(rhFromDew(t, Td[i]) * 10) / 10),
    apparent_temperature: T.map((t) => t - 1), wet_bulb_temperature_2m: T.map((t) => t - 4) },
    daily: { time: [...new Set(time.map((t) => t.slice(0, 10)))], dew_point_2m_max: [...new Set(time.map((t) => t.slice(0, 10)))].map(() => 0) },
    current: { time: time[0], temperature_2m: T[0], relative_humidity_2m: 50, dew_point_2m: 2 } }; };
delete process.env.NIGRAAN_DEWFIX;
{ let same = 0; for (const z of ['plains', 'hills', 'coast']) for (let k = 0; k < 10; k++) { const L = mk('2026-10-16T19:00:00Z'); const s0 = JSON.stringify(L); df.apply(L, 31.5, 74.3, { zone: z, nowMs: NOW }); if (JSON.stringify(L) === s0) same++; }
  same === 30 ? pass('1 · zones not served: 30 answers unchanged byte for byte') : fail('1 · not-served zones changed', same + '/30'); }
process.env.NIGRAAN_DEWFIX = '0'; { const L = mk('2026-10-16T19:00:00Z'); const s0 = JSON.stringify(L); df.apply(L, 35.9, 74.3, { zone: 'mountain', nowMs: NOW }); JSON.stringify(L) === s0 && !df.on() ? pass('1 · NIGRAAN_DEWFIX=0: off (mountain unchanged)') : fail('1 · switch off'); }
delete process.env.NIGRAAN_DEWFIX;
{ const L = mk('2026-10-16T19:00:00Z'); const B = JSON.parse(JSON.stringify(L)); const ok = df.apply(L, 35.9, 74.3, { zone: 'mountain', nowMs: NOW }); const H = L.hourly, H0 = B.hourly; const off = M.zones.mountain.offsetsC[0];
  let inH = 0, beyond = 0, bad = [], capped = 0;
  H.time.forEach((t, i) => { const ms = Date.parse(t + 'Z') - 18000e3; const ahead = (ms - NOW) / 3600e3;
    if (H.temperature_2m[i] !== H0.temperature_2m[i]) bad.push('T moved ' + t);
    if (H.dew_point_2m[i] > H.temperature_2m[i] + 1e-9) bad.push('dew above T ' + t);
    if (ahead <= 72) { inH++; const want = Math.min(H0.dew_point_2m[i] + off, H0.temperature_2m[i]); if (Math.abs(H.dew_point_2m[i] - Math.round(want * 10) / 10) > 0.11) bad.push('dew ' + t + ' ' + H.dew_point_2m[i] + ' vs ' + want);
      if (want === H0.temperature_2m[i]) capped++;
      if (Math.abs(H.relative_humidity_2m[i] - rhFromDew(H.temperature_2m[i], H.dew_point_2m[i])) > 0.6) bad.push('rh ' + t);
      if (!(H.apparent_temperature[i] > H0.apparent_temperature[i] - 1e-9)) bad.push('AT ' + t); }
    else { beyond++; if (H.dew_point_2m[i] !== H0.dew_point_2m[i] || H.relative_humidity_2m[i] !== H0.relative_humidity_2m[i]) bad.push('beyond 72 h changed ' + t); } });
  ok && !bad.length ? pass('2 · mountain October: dew + ' + off + ' C to 72 h, capped at T, T unchanged, RH from T and dew, apparent T up; beyond 72 h unchanged', inH + ' hours moved (' + capped + ' capped), ' + beyond + ' kept') : fail('2 · mountain apply', bad.slice(0, 5).join('; '));
  hw ? ((H.wet_bulb_temperature_2m[0] !== H0.wet_bulb_temperature_2m[0] && L.current.relative_humidity_2m === H.relative_humidity_2m[0]) ? pass('2 · wet bulb and the current block follow (humwind.consistency)') : fail('2 · consistency')) : fail('2 · humwind not loadable');
  const nd = L.daily.time.findIndex((d) => d === H.time[30].slice(0, 10)); nd >= 0 && L.daily.dew_point_2m_max[nd] !== 0 ? pass('2 · daily dew point family of a full day recomputed') : fail('2 · daily family'); }
{ const L = mk('2026-11-02T19:00:00Z'); const s0 = JSON.stringify(L); df.apply(L, 35.9, 74.3, { zone: 'mountain', nowMs: Date.parse('2026-11-03T00:30:00Z') }); JSON.stringify(L) === s0 ? pass('2 · November (not fitted): unchanged') : fail('2 · November changed'); }
{ const V = JSON.parse(readFileSync(join(HERE, 'dew275_vectors.json'), 'utf8')); let worst = 0;
  for (const [vms, T, td, fx] of V.rows) { const t = new Date(vms + 5 * 3600e3).toISOString().slice(0, 16); const L = { utc_offset_seconds: 18000, hourly: { time: [t], temperature_2m: [T], dew_point_2m: [td], relative_humidity_2m: [rhFromDew(T, td)] } };
    df.apply(L, 35.9, 74.3, { zone: 'mountain', nowMs: vms - 3600e3 }); worst = Math.max(worst, Math.abs(L.hourly.dew_point_2m[0] - fx)); }
  worst <= 0.051 ? pass('3 · JS = Python on 300 mountain tehsil hours (max |diff| ' + worst.toFixed(3) + ' C, rounding)') : fail('3 · parity', worst); }
{ const V = readFileSync(join(APP, 'server', 'api', 'verification.mjs'), 'utf8');
  /CHAIN_STAGES = \[[^\]]*'cloudt', 'dewfix'\]/.test(V) && /dewfix: \(\) => !!\(app\.dewfix && app\.dewfix\.on\(\) && app\.dewfix\.anyServed\(\)/.test(V) ? pass('4 · chain: last stage, behind app.dewfix.on() and the zone gate') : fail('4 · chain wiring');
  const Fl = readFileSync(join(APP, 'server', 'api', 'fleet.mjs'), 'utf8'); /upTo: 'synop'/.test(Fl) ? pass('4 · the fleet pairs stop at synop (before the offset)') : fail('4 · fleet upTo');
  const I = readFileSync(join(APP, 'server', 'api', 'index.mjs'), 'utf8'); /app\.dewfix = createDewFix\(/.test(I) ? pass('4 · app.dewfix created in index.mjs') : fail('4 · index wiring'); }
{ const L = mk('2026-10-16T19:00:00Z'); df.apply(L, 35.9, 74.3, { zone: 'mountain', nowMs: NOW }); !JSON.stringify(L).includes('agn_dewfix') && L.agn_dewfix && L.agn_dewfix.applied ? pass('5 · provenance kept off the customer body (non-enumerable)', JSON.stringify(L.agn_dewfix)) : fail('5 · provenance');
  const n = 300, t0 = process.hrtime.bigint(); for (let k = 0; k < n; k++) df.apply(mk('2026-10-16T19:00:00Z'), 35.9, 74.3, { zone: 'mountain', nowMs: NOW }); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  ms < 2 ? pass('5 · speed: ' + ms.toFixed(3) + ' ms per 192-hour answer (incl. building the answer)') : fail('5 · speed', ms.toFixed(3) + ' ms'); }
console.log(`\n${P} PASS / ${F} FAIL`); process.exit(F ? 1 : 0);
