import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.272 · hotfix · stuck / replayed MACH readings: tests on the real copied MACH database days (15-16 Oct 2026) and synthetic series.
// usage: node scripts/tests272/stuck.test.mjs [folder holding obs_20261015.csv, obs_20261016.csv, last_sync.txt, latest_status.json]
// (default: /mnt/user-data/uploads/LAMHA/data/mach/db). Writes only in a temporary folder.
import { mkdtempSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { screenSeries, STUCK_RULE } from '../../server/api/stuckscreen.mjs';
import { createCopies } from '../../server/api/copies.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = process.argv[2] || __T.uploads('LAMHA/data/mach/db');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const T0 = Date.parse('2026-10-16T12:00:00Z'); const at = (min) => T0 + min * 60e3;
const ser = (vals, step = 10, extra = (i) => ({ Td: 12 + (i % 3) * 0.1, RH: 60 + (i % 5), P: 1000 + i * 0.01 })) => vals.map((T, i) => ({ ms: at(i * step), T, ...extra(i) }));

/* ── synthetic series ── */
{ // a one-off spike is rejected, the series around it kept
  const v = screenSeries(ser([20, 20.1, 20.0, 27.5, 19.9, 19.8]));
  ok(v[3] === 'jump' && v.filter((x) => x !== 'ok').length === 1, 'Y1 one-off +7.5 C spike rejected, the rest kept', v.join(','));
}
{ // a real drop (gust front) is accepted from its second reading on
  const v = screenSeries(ser([30, 30.1, 30.0, 22.0, 21.8, 21.5]));
  ok(v[3] === 'jump' && v[4] === 'ok' && v[5] === 'ok', 'Y2 a real -8 C front: held one reading, then accepted', v.join(','));
}
{ // the live fault: a frozen afternoon record alternating with the real evening readings
  const S = [26.0, 25.5, 25.0].map((T, i) => ({ ms: at(i * 10), T, Td: 15 + i * 0.1, RH: 55 + i, P: 955 + i * 0.1 }));
  const stuck = { T: 27.3, Td: 19.2, RH: 61, P: 957.94 };
  S.splice(1, 0, { ms: at(5), ...stuck });
  let T = 24.5, m = 30; for (let i = 0; i < 18; i++) { if (i % 2) S.push({ ms: at(m), ...stuck }); else { S.push({ ms: at(m), T, Td: 14, RH: 60 + i, P: 955.5 }); T -= 0.4; } m += 10; }
  const v = screenSeries(S); const kept = S.filter((_, i) => v[i] === 'ok');
  const stuckKept = S.filter((r, i) => v[i] === 'ok' && r.T === 27.3 && r.ms > at(30));
  ok(stuckKept.length === 0 && kept[kept.length - 1].T < 22, 'Y3 alternating frozen record (27.3 C) rejected in the evening, the real cooling kept', 'last kept ' + kept[kept.length - 1].T);
}
{ // a natural return to an earlier record close to the current value is kept
  const S = [18.8, 18.7, 18.8, 18.7, 18.8].map((T, i) => ({ ms: at(i * 10), T, Td: 14, RH: 74, P: 1000 }));
  const v = screenSeries(S); ok(v.every((x) => x === 'ok'), 'Y4 natural 0.1 C oscillation (exact repeats) kept', v.join(','));
}
{ // a frozen sensor: unchanged temperature for more than FROZEN_MIN
  const S = Array.from({ length: 20 }, (_, i) => ({ ms: at(i * 10), T: 25.7, Td: 17.6, RH: 61, P: 958 + (i % 2) * 0.6 }));
  const v = screenSeries(S); const firstBad = v.findIndex((x) => x === 'frozen');
  ok(firstBad === Math.floor(STUCK_RULE.FROZEN_MIN / 10) + 1, 'Y5 temperature frozen > ' + STUCK_RULE.FROZEN_MIN + ' min rejected from then on', 'first rejected at ' + firstBad * 10 + ' min');
}
{ // no history: a first reading is accepted
  ok(screenSeries([{ ms: at(0), T: 31, Td: 20, RH: 50, P: 990 }])[0] === 'ok', 'Y6 a first reading with no history is accepted');
}

/* ── the real copied MACH database days through copies.mjs mach() (the live poll's reader) ── */
const need = ['obs_20261015.csv', 'obs_20261016.csv', 'last_sync.txt', 'latest_status.json'];
if (true) { console.log('SKIP R0-R4: retired v91.17.283.28 - copies.mjs mach() (the LAMHA copy reader) is gone; the live poll asks the MACH database itself and screens it in fleet.mjs (stuckLive, obsqc)'); }
else if (!need.every((f) => existsSync(join(SRC, f)))) { console.log('SKIP real-data tests: ' + SRC + ' lacks ' + need.join(', ')); }
else {
  const W = mkdtempSync(join(tmpdir(), 'stuck272-')); const L = join(W, 'LAMHA'); const db = join(L, 'data', 'mach', 'db'); mkdirSync(db, { recursive: true });
  for (const f of need) copyFileSync(join(SRC, f), join(db, f));
  process.env.NIGRAAN_LAMHA_DIR = L; process.env.NIGRAAN_COPIES_DIR = join(W, 'copies'); process.env.NIGRAAN_DATALAKE = '0';
  const read = async (iso) => { const C = createCopies(null, APP, join(APP, 'data'), { noSchedule: true, now: () => Date.parse(iso) }); await C.run(); const m = await C.mach(); return { m, st: C.status().stuckScreen }; };
  // evening, 16 Oct 21:25 PKT (16:25Z): the fault
  const E = await read('2026-10-16T16:26:00Z');
  ok(E.m.ok, 'R0 the copied MACH database passes its checks at 16 Oct 21:26 PKT', E.m.why || E.m.dataset);
  if (E.m.ok) {
    const T = (k) => { const s = E.m.stations.get(k); return s ? s.temperatureC : null; };
    const clean = (T('mach1') + T('mach8')) / 2;
    ok(T('mach1') === 18.3 && T('mach8') === 21.3, 'R1 the clean stations (MACH 1, MACH 8, wu_api) keep their newest reading', `mach1 ${T('mach1')} mach8 ${T('mach8')}`);
    const city = ['nutech', 'Rawal', 'Garden', 'G15', 'E11', 'Davis', 'Zaraj', 'phase8', 'Quaid', 'MianaThub'];
    const vals = city.map((k) => [k, T(k)]); const far = vals.filter(([, v]) => v != null && Math.abs(v - clean) > 4);
    ok(far.length === 0, 'R2 evening: every listed Islamabad-Rawalpindi wu station within 4 C of the clean MACH 1 / 8 mean (' + clean.toFixed(1) + ')', JSON.stringify(Object.fromEntries(vals)));
    ok(E.st && E.st.rejected > 0, 'R3 the copy status reports the screen', E.st ? `${E.st.rejected} of ${E.st.of} readings rejected; newest held: ${Object.keys(E.st.newestHeld).length}` : 'none');
  }
  // daytime, 16 Oct 12:00 PKT (07:00Z): readings unchanged except where the screen's evidence is in the record
  const D = await read('2026-10-16T07:00:00Z');
  if (D.m.ok) {
    const raw = new Map(); // the newest reading per station without the screen
    const { parseMonthText } = await import('../../server/api/past30parse.mjs');   // (import check only)
    let changed = 0, n = 0; const lst = [];
    for (const [k, s] of D.m.stations) { n++; if (s.stuck) { changed++; lst.push(k + ':' + s.stuck); } }
    const heldNewest = Object.keys(D.st.newestHeld).length;
    ok(heldNewest <= Math.ceil(0.15 * n), 'R4 daytime (12:00 PKT): newest reading held for at most 15 % of stations', `${heldNewest} of ${n}: ${JSON.stringify(D.st.newestHeld)}`);
  }
  rmSync(W, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
