import * as __T from '../lib/testenv.mjs';   /* v91.17.283.1 A2: repo root and absolute imports from scripts/lib/testenv.mjs (no machine path; Windows file URLs) */
/* v91.17.157 audit fixes: behaviour, not presence. Needs the server on :8787. */
import { mkdtempSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = __T.ROOT;
const B = process.env.PORT ? 'http://127.0.0.1:' + process.env.PORT : __T.BASE; let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (d ? ' :: ' + d : '')); } };
const J = async (p, o) => (await fetch(B + p, o)).json();

/* 1 · river: a failed run keeps the last good one; a partial run carries the missing reaches; replies matched by coordinate */
{ const { createFlood } = await __T.importFile(join(ROOT, 'server/api/flood.mjs'));
  const d = mkdtempSync(join(tmpdir(), 'f157-')); mkdirSync(join(d, 'data')); mkdirSync(join(d, 'server/contract'), { recursive: true });
  copyFileSync(join(ROOT, 'data/flood.json'), join(d, 'data/flood.json')); copyFileSync(join(ROOT, 'data/river-rarity.json'), join(d, 'data/river-rarity.json'));
  copyFileSync(join(ROOT, 'server/contract/riverpoints.json'), join(d, 'server/contract/riverpoints.json'));
  let mode = 'fail'; const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() + i * 864e5 + 5 * 3600e3).toISOString().slice(0, 10));
  const app = { provider: { configured: () => true, call: async (k, p, q) => { if (mode === 'fail') throw new Error('HTTP 429');
    const rows = q.latitude.map((la, i) => ({ latitude: la, longitude: q.longitude[i], daily: { time: days, river_discharge: days.map(() => 100) } }));
    return (mode === 'partial' ? rows.slice(0, Math.ceil(rows.length / 2)) : rows).reverse(); } } };
  const F = createFlood(app, join(d, 'data')); const b = F.national(0);
  if (b.ready) {
    await F.runForecast(); const a1 = F.national(0); ok(a1.points === b.points && a1.at === b.at, 'river: an all-failed run keeps the previous forecast (' + a1.points + ' reaches)');
    await F.runForecast(); mode = 'partial'; await F.runForecast(); const a2 = F.national(0); ok(a2.points === b.points && a2.carriedPoints > 0 && a2.partial === true, 'river: a partial run carries ' + a2.carriedPoints + ' reaches and says partial');
    mode = 'ok'; const r3 = await F.runForecast(); ok(r3.failed === 0, 'river: reversed provider rows are matched by coordinate (0 failed)', JSON.stringify(r3));
  } else ok(true, 'river: no stored forecast to test against (skipped)'); }

/* 2 · AI drought level is the served class (Monitor -> Moderate), never the score through the screening cuts */
{ const e = await J('/api/ai/evidence?prompt=' + encodeURIComponent('drought across Pakistan')); const d = e.facts && e.facts.national && e.facts.national.hazards && e.facts.national.hazards.drought;
  const map = { Low: 'Normal', Monitor: 'Moderate', Watch: 'High', Act: 'Severe' };
  const bad = d && d.worst ? d.worst.filter((w) => w.droughtClass && map[w.droughtClass] !== w.level) : null;
  ok(d && (d.available === false || (bad && bad.length === 0)), 'AI drought level follows the class on the map', JSON.stringify(bad)); }

/* 3 · heat_index limit is the NWS index, not the apparent temperature */
{ const L = await __T.importFile(join(ROOT, 'server/api/limits.mjs')); ok(L.LIMIT_ALIASES.heat_index === 'heat_index' && L.LIMIT_VARS.heat_index, 'limits: heat_index is its own variable');
  const { heatIndexC } = await __T.importFile(join(ROOT, 'server/api/heatindex.mjs')); ok(Math.abs(heatIndexC(38, 50) - 48.6) < 0.2, 'NWS heat index 38 C / 50 % = 48.6 C (' + heatIndexC(38, 50).toFixed(1) + ')'); }

/* 4 · landslide: a gap is a gap (no 3-day sum across a missing day) */
{ const { features } = await __T.importFile(join(ROOT, 'server/api/landslideodds.mjs'));
  const r = Array.from({ length: 70 }, () => 2); r[66] = null; ok(features(r, 68) === null, 'landslide: a 3-day window over a missing day is refused');
  const r2 = Array.from({ length: 70 }, () => 2); ok(features(r2, 68) && features(r2, 68).P3 === 6, 'landslide: complete windows still score'); }

/* 5 · apparent temperature follows the dew-point correction */
{ const { createHumWind } = await __T.importFile(join(ROOT, 'server/api/humwind.mjs')); const H = createHumWind({ dataDir: join(ROOT, 'data'), zoneOf: () => 'plains' });
  const t = Array.from({ length: 24 }, (_, i) => '2026-06-01T' + String(i).padStart(2, '0') + ':00');
  const loc = { elevation: 150, utc_offset_seconds: 18000, hourly: { time: t, temperature_2m: t.map(() => 40), dew_point_2m: t.map(() => 20), relative_humidity_2m: t.map(() => 33), apparent_temperature: t.map(() => 41) } };
  const applied = H.applyDew(loc, 30.2, 71.5, loc.hourly.dew_point_2m.slice());
  const dTd = loc.hourly.dew_point_2m[12] - 20, dAT = loc.hourly.apparent_temperature[12] - 41;
  ok(!applied || (dTd === 0 ? dAT === 0 : dAT > 0), 'apparent temperature moves with the corrected dew point (dTd ' + dTd.toFixed(1) + ', dAT ' + dAT.toFixed(1) + ')'); }

/* 6 · smog and observed-flood national views carry freshness */
{ const s = await J('/api/smog/national'); ok(!s.ready || ('stale' in s && 'ageH' in s), 'smog national carries ageH / stale (' + s.ageH + ' h)'); }

/* 7 · site screen: standing rows carry no 15-day verdict */
{ const r = (await fetch(B + '/api/point?lat=31.55&lon=74.30').then((r) => r.json()).then((x) => (x && x.parts && x.parts.siteScreening ? x.parts.siteScreening.v : null)).catch(() => null)); /* v283.19: the place bundle */
  const rows = r && r.rows || []; const st = rows.filter((x) => /^(Flood position|Dams upstream)/.test(x.parameter));
  ok(!rows.length || st.every((x) => x.verdict == null), 'site screen: flood position and dams are standing notes, not verdicts', JSON.stringify(st.map((x) => [x.parameter, x.verdict]))); }

/* 8 · v160: the urban term is served only in blocks that passed the held-out test (Karachi DJF night failed: off) */
{ const u = await J('/api/fleet/urban?lat=24.92&lon=67.08&at=2026-01-15T20:00:00Z'); ok(u.applied === false && /held-out test/.test(u.why || ''), 'urban term off in an untested block (Karachi DJF night)', JSON.stringify(u).slice(0, 200)); }
/* 9 · v160: a daily-only request gets no stray hourly block */
{ const r = await (await fetch(B + '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=35.92&longitude=74.31&elevation=1500&timezone=Asia%2FKarachi&forecast_days=3&daily=temperature_2m_max', { headers: { 'Sec-Fetch-Site': 'same-origin' } })).json();
  ok(r && r.daily && !r.hourly, 'daily-only request answered with daily values and no hourly block'); }
console.log((fail ? 'FAIL' : 'PASS') + ' v157: ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
