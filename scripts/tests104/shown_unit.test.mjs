/* v91.17.104 · unit test of the shown-level scoring on a synthetic day (no server needed) */
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { createShown } from '../../server/api/shown.mjs';
const d = mkdtempSync(join(tmpdir(),'shown-')); mkdirSync(join(d, 'archive', 'imerg'), { recursive: true }); mkdirSync(join(d, 'archive', 'fleet'), { recursive: true });
const app = { units: { tehsil: [{ unitId: 'A', lat: 30, lon: 70 }, { unitId: 'B', lat: 31, lon: 71 }, { unitId: 'C', lat: 32, lon: 72 }] } };
const S = createShown(app, d);
const r1 = (S.reportShown({ at: '2026-10-05T03:30:00Z', day: 0, basis: 'peak', gate: 'g', build: 'b', layers: { rain_hz: { counts: [1, 1, 1, 0, 0], L: { A: 0, B: 1, C: 2 } }, heat: { counts: [0, 0, 0, 1, 0], L: { A: 3, B: 0, C: 0 } } } }));
const r2 = (S.reportShown({ at: '2026-10-05T03:40:00Z', day: 0, basis: 'peak', layers: {} }));   // same hour: skipped
writeFileSync(join(d, 'archive', 'imerg', 'imerg_2026-10.jsonl.gz'), gzipSync(JSON.stringify({ d: '2026-10-05', u: { A: 0, B: 150, C: 300 } }) + '\n'));
// station near A, 15:00 PKT (900 min), 40 C, RH 30, wind 7 km/h
writeFileSync(join(d, 'archive', 'fleet', 'fleet_2026-10.jsonl.gz'), gzipSync(JSON.stringify({ d: '2026-10-05', k: 'S1', lat: 30.01, lon: 70.01, t: [900], T: [400], RH: [30], W: [7], ok: [1] }) + '\n'));
const sc = S.score(); let f = 0; const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) f++; };
ok(r1.ok && r1.recorded && r2.skipped, 'one shown record per hour');
ok(sc.rain.days === 1 && sc.rain.low10.hits === 2 && sc.rain.mod25.hits === 1 && sc.rain.low10.falseAlarms === 0, 'rain: levels scored against the satellite day total');
ok(sc.heat.n === 1 && sc.heat.exact === 1, 'heat: the measured station UTCI (40 C, 30 %, 7 km/h -> UTCI 40.7, AGN 71, High) matches the shown High');
console.log((f ? 'FAIL' : 'PASS') + ' shown-unit: ' + (3 - f) + ' passed, ' + f + ' failed'); process.exit(f ? 1 : 0);
