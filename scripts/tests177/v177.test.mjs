/* v91.17.177 · national dew point / wind model: train-serve parity and serving rules.
   1  the server's feature rows (natmodel rows() + rh_fc as moist.mjs computes it) equal the Python training features
      (moist_build.fc_feats) hour by hour, for full-history hours (>= 72 h into the window)
   2  the exported trees reproduce the Python predictions (self-check < 1e-3)
   3  served only where the gate passed: a point in a zone that failed is left untouched; NIGRAAN_MOIST=0 switches it off
   4  in a passing zone the served dew point never exceeds the air temperature, RH stays 1-100, and only hours within the
      zone's tested horizon change
   usage: node scripts/tests177/v177.test.mjs   (from nigraan-local) */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeatGrid } from '../../server/api/featgrid.mjs';
import { createNational } from '../../server/api/natmodel.mjs';
import { createMoist } from '../../server/api/moist.mjs';
import { esatHpa } from '../../server/api/psychro.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const APP = join(HERE, '..', '..'); const DATA = join(APP, 'data');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const FX = JSON.parse(readFileSync(join(HERE, 'moist_parity_fixture.json'), 'utf8'));
const fg = createFeatGrid(DATA); const nat = createNational({ dataDir: DATA, featGrid: fg });
const zoneOfFx = new Map(FX.map((f) => [f.lat.toFixed(4) + ',' + f.lon.toFixed(4), f.zone]));
const zoneOf = (la, lo) => zoneOfFx.get(la.toFixed(4) + ',' + lo.toFixed(4)) || null;
nat.setZoneOf(zoneOf);
const M = JSON.parse(readFileSync(join(DATA, 'moist-model.json'), 'utf8'));
const moist = createMoist({ dataDir: DATA, national: nat, zoneOf });

console.log('1 · feature parity');
for (const f of FX) {
  const loc = JSON.parse(JSON.stringify(f.loc)); const T0 = loc.hourly.temperature_2m.slice();
  const { out } = nat.internals.rows(loc, f.lat, f.lon, T0, { __dew: loc.hourly.dew_point_2m.slice() }, 1);
  let worst = 0, wk = '', n = 0;
  for (let i = 72; i < out.length; i++) {
    const s = out[i]; const e = f.expected[i]; if (!s || !e) continue;
    s.rh_fc = Math.max(1, Math.min(100, 100 * esatHpa(s.dew_point_2m) / esatHpa(s.temperature_2m)));
    for (const c of M.features) { const a = s[c], b = e[c]; if (a == null && b == null) continue;
      const d = (a == null || b == null) ? Infinity : Math.abs(a - b) / Math.max(1, Math.abs(b)); if (d > worst) { worst = d; wk = c + ' ' + a + ' vs ' + b; } }
    n++;
  }
  ok(n > 100 && worst < 2e-3, `${f.pid} (${f.zone}): ${n} hours, worst relative difference ${worst.toExponential(1)} ${worst >= 2e-3 ? '(' + wk + ')' : ''}`);
}

console.log('2 · trees');
const sc = moist.selfcheck(); ok(sc != null && sc < 1e-3, 'self-check max |node - python| ' + (sc == null ? 'n/a' : sc.toExponential(1)));

console.log('3 · gate');
const applied = Object.entries(M.dew.zones).filter(([, v]) => v.applied).map(([z]) => z);
console.log('     dew applied in', applied.join(', ') || 'none', '| wind shipped', !!M.wind.model);
for (const f of FX) {
  const loc = JSON.parse(JSON.stringify(f.loc)); const now = Date.parse(loc.hourly.time[0] + 'Z');
  const realNow = Date.now; Date.now = () => now;   /* the window starts "now" */
  loc.hourly.relative_humidity_2m = loc.hourly.temperature_2m.map((t, i) => Math.round(100 * esatHpa(loc.hourly.dew_point_2m[i]) / esatHpa(t) * 10) / 10);
  const before = JSON.stringify(loc.hourly); const T0 = loc.hourly.temperature_2m.slice();
  const r = moist.apply(loc, f.lat, f.lon, T0, loc.hourly.dew_point_2m.slice(), loc.hourly.wind_speed_10m.slice(), 1);
  const should = !!(M.dew.zones[f.zone] && M.dew.zones[f.zone].applied);
  ok(r.dew === should, `${f.pid} (${f.zone}) dew ${should ? 'corrected' : 'left as served'}`);
  ok(r.wind === false && JSON.stringify(loc.hourly.wind_speed_10m) === JSON.stringify(JSON.parse(before).wind_speed_10m), `${f.pid} wind untouched`);
  if (should) {
    const H = loc.hourly; const hz = M.dew.zones[f.zone].horizonH; let bad = 0, beyond = 0, changed = 0;
    for (let i = 0; i < H.time.length; i++) { const td = H.dew_point_2m[i], t = H.temperature_2m[i], rh = H.relative_humidity_2m[i];
      if (td > t + 1e-9 || rh < 1 || rh > 100) bad++;
      const hA = (Date.parse(H.time[i] + 'Z') - now) / 3600e3; const ch = td !== JSON.parse(before).dew_point_2m[i];
      if (ch) changed++; if (ch && hA > hz) beyond++; }
    ok(bad === 0, `${f.pid} dew <= T and RH in 1-100 at every hour`); ok(beyond === 0 && changed > 0, `${f.pid} ${changed} hours changed, none beyond ${hz} h`);
    ok(loc.agn_moist && loc.agn_moist.dew === true, `${f.pid} agn_moist recorded (mean change ${loc.agn_moist && loc.agn_moist.meanDewChangeC} C)`);
  }
  process.env.NIGRAAN_MOIST = '0'; const loc2 = JSON.parse(JSON.stringify(f.loc)); const r2 = moist.apply(loc2, f.lat, f.lon, T0, loc2.hourly.dew_point_2m.slice(), null, 1); delete process.env.NIGRAAN_MOIST;
  ok(!r2.dew && JSON.stringify(loc2.hourly) === JSON.stringify(f.loc.hourly), `${f.pid} NIGRAAN_MOIST=0 leaves it untouched`);
  Date.now = realNow;
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
