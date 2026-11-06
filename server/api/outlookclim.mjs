/* v91.17.77 · SCI · CLIMATOLOGICAL BASE RATES OF THE OUTLOOK EVENTS (data/outlook-event-climate.json)

   The outlook says "in 37 of 51 members a heat spell starts in the next two weeks". That number means nothing
   without the other half: how often does the same event happen in the same fortnight in an ordinary year? A
   "Severe" chance of an event that happens every year at this place and date is not a warning, it is the season.

   This builder applies the SAME event rules the outlook applies to the members (data/outlook-event-definitions.json,
   server/api/outlook.mjs) to the 1991-2020 reanalysis at every tehsil's settlement height, and stores, for 53
   calendar start days (every 7th day of the year), the share of the 30 years in which each event occurred in the
   14-day window starting that day (the outlook's days 1-14). Single-day thresholds get the share of days in a
   15-day calendar window that crossed them. The percentiles are recomputed here from the same series with the
   method of data/climatology.json (15-day window, linear interpolation), so the relative events are tested exactly
   as they are defined, and the difference against data/climatology.json is recorded per unit as a check.

   One-off, heavy (30 years x 6 daily variables x 576 tehsils from the reanalysis archive, 24 batches). Run with
   node scripts/build_outlook_event_climate.mjs (or buildOutlookEventClimate(app) from a server hook). */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const VARS = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'snowfall_sum', 'apparent_temperature_max', 'wind_gusts_10m_max'];
const START_STEP = 7, WINDOW = 14, HALF = 7;
const doyOf = (iso) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10); const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; let n = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5); if (!leap && n >= 59) n++; return n; };
function pct(sorted, p) { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
const r1 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10;

/* the zone rule of server/api/mos.mjs zoneOfPoint, read from the same file (data/model-zone.json) */
export function zoneFrom(dataDir) {
  let Z = null; try { Z = JSON.parse(readFileSync(join(dataDir, 'model-zone.json'), 'utf8')); } catch (_) { Z = null; }
  const R = (Z && Z.zoneRule) || {};
  const inRing = (lat, lon, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; } return ins; };
  const inPoly = (lat, lon, poly) => { const rings = Array.isArray(poly[0][0]) && Array.isArray(poly[0][0][0]) ? poly.flat() : poly; return rings.length ? inRing(lat, lon, rings[0]) : false; };
  const hav = (la1, lo1, la2, lo2) => { const d = Math.PI / 180, a = Math.sin((la2 - la1) * d / 2) ** 2 + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin((lo2 - lo1) * d / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(a))); };
  const coastKm = (lat, lon) => { const C = R.coastline || []; let best = Infinity; for (let i = 0; i < C.length - 1; i++) for (let t = 0; t <= 1.0001; t += 0.1) best = Math.min(best, hav(lat, lon, C[i][1] + (C[i + 1][1] - C[i][1]) * t, C[i][0] + (C[i + 1][0] - C[i][0]) * t)); return best; };
  return (lat, lon, elevM) => {
    if (!Z || lat == null) return null;
    if ((R.mountainOutline || []).some(p => inPoly(lat, lon, p))) return 'mountain';
    if (elevM != null && R.mountainMinElevM != null && elevM >= R.mountainMinElevM) return 'mountain';
    if (R.coastline && R.coastKm != null && coastKm(lat, lon) <= R.coastKm) return 'coast';
    if (elevM != null && R.hillsMinElevM != null && elevM >= R.hillsMinElevM) return 'hills';
    return 'plains';
  };
}

/* the event rules on one daily series. d = { time[], tx[], tn[], pr[], sn[], at[] }; P = percentile arrays by doy;
   floors from the definitions file; returns base rates per start slot */
function reduceUnit(d, u, zone, coastal, DEF, TH) {
  const T = d.time, n = T.length;
  const tx = d.temperature_2m_max, tn = d.temperature_2m_min, pr = d.precipitation_sum, sn = d.snowfall_sum, at = d.apparent_temperature_max, gu = d.wind_gusts_10m_max;
  const doy = T.map(doyOf);
  /* calendar-day percentiles, the data/climatology.json method */
  const byDoy = (a) => { const b = Array.from({ length: 366 }, () => []); for (let i = 0; i < n; i++) if (a[i] != null) b[doy[i]].push(a[i]); return b; };
  const p3 = new Array(n).fill(null); for (let i = 2; i < n; i++) if (pr[i] != null && pr[i - 1] != null && pr[i - 2] != null) p3[i] = pr[i] + pr[i - 1] + pr[i - 2];
  const Bx = byDoy(tx), Bn = byDoy(tn), Bp = byDoy(p3);
  const P = { tx90: [], tn90: [], tn10: [], pr3_99: [] };
  for (let q = 0; q < 366; q++) {
    const w = (B) => { const s = []; for (let k = -HALF; k <= HALF; k++) { for (const v of B[(q + k + 366) % 366]) s.push(v); } return s.sort((a, b) => a - b); };
    const a = w(Bx), b = w(Bn), c = w(Bp);
    P.tx90.push(r1(pct(a, 0.9))); P.tn90.push(r1(pct(b, 0.9))); P.tn10.push(r1(pct(b, 0.1))); P.pr3_99.push(r1(pct(c, 0.99)));
  }
  const E = DEF.events, hf = E.heatSpell.floor.byZone[zone], cf = E.coldSpell.floor.byZone[zone];
  const hot = (i) => tx[i] != null && P.tx90[doy[i]] != null && tx[i] > P.tx90[doy[i]];
  const tests = {
    heatSpell: (i) => hot(i) && hf != null && tx[i] >= hf,
    unusualWarmth: hot,
    coldSpell: (i) => tn[i] != null && P.tn10[doy[i]] != null && tn[i] < P.tn10[doy[i]] && cf != null && tn[i] <= cf,
    frostSpell: (u.elevM != null && u.elevM < 2000) ? (i) => tn[i] != null && tn[i] <= 0 : null,
  };
  /* index of each year's first day */
  const yStart = new Map(); T.forEach((t, i) => { const y = t.slice(0, 4); if (!yStart.has(y)) yStart.set(y, i); });
  const years = [...yStart.keys()];
  const slots = []; for (let s = 0; s < 366; s += START_STEP) slots.push(s);
  const ev = {}; for (const k of ['heatSpell', 'unusualWarmth', 'coldSpell', 'frostSpell', 'rain3_75', 'rain3Local', 'heavySnow', 'coastalHeat']) ev[k] = [];
  const idxOfDoy = (y, q) => { const i0 = yStart.get(y); if (i0 == null) return -1; for (let i = i0; i < Math.min(n, i0 + 367); i++) if (doy[i] === q && T[i].slice(0, 4) === y) return i; return -1; };
  for (const s of slots) {
    const cnt = Object.fromEntries(Object.keys(ev).map(k => [k, [0, 0]]));
    for (const y of years) {
      const i0 = idxOfDoy(y, s); if (i0 < 0 || i0 + WINDOW > n) continue;
      const run = (f, need) => { if (!f) return null; let c = 0; for (let i = i0; i < i0 + WINDOW; i++) { c = f(i) ? c + 1 : 0; if (c >= need) return true; } return false; };
      const sum3 = (a, x) => { for (let i = i0 + 2; i < i0 + WINDOW; i++) if (a[i] != null && a[i - 1] != null && a[i - 2] != null && a[i] + a[i - 1] + a[i - 2] >= x(i)) return true; return false; };
      const r = {
        heatSpell: run(tests.heatSpell, E.heatSpell.minRunDays), unusualWarmth: run(tests.unusualWarmth, E.unusualWarmth.minRunDays),
        coldSpell: run(tests.coldSpell, E.coldSpell.minRunDays), frostSpell: run(tests.frostSpell, 3),
        rain3_75: sum3(pr, () => 75), rain3Local: sum3(pr, (i) => Math.max(25, P.pr3_99[doy[i]] ?? Infinity)),
        heavySnow: sn ? sum3(sn, () => 30) : null,
        coastalHeat: (coastal && at) ? run((i) => at[i] != null && at[i] >= 40, 2) : null,
      };
      for (const k of Object.keys(ev)) if (r[k] != null) { cnt[k][1]++; if (r[k]) cnt[k][0]++; }
    }
    for (const k of Object.keys(ev)) ev[k].push(cnt[k][1] ? Math.round(100 * cnt[k][0] / cnt[k][1]) : null);
  }
  /* single-day thresholds (the THRESHOLDS list of outlook.mjs): share of days in the 15-day calendar window */
  const series = { tx, tn, pr, sn, gu };
  const day = {};
  for (const th of TH) {
    const a = series[th.v]; if (!a) continue; const hit = Array(366).fill(0), all = Array(366).fill(0);
    for (let i = 0; i < n; i++) if (a[i] != null) { all[doy[i]]++; if (th.op === '>=' ? a[i] >= th.x : a[i] <= th.x) hit[doy[i]]++; }
    day[th.id] = slots.map(s => { let h = 0, t = 0; for (let k = -HALF; k <= HALF; k++) { const q = (s + k + 366) % 366; h += hit[q]; t += all[q]; } return t ? Math.round(100 * h / t) : null; });
  }
  return { ev, day, P };
}

export async function buildOutlookEventClimate({ provider, units, dataDir, zoneOf, coastalOf, thresholds, log = console.log, period = null }) {
  const DEF = JSON.parse(readFileSync(join(dataDir, 'outlook-event-definitions.json'), 'utf8'));
  let C = null; try { C = JSON.parse(readFileSync(join(dataDir, 'climatology.json'), 'utf8')); } catch (_) { C = null; }
  /* v91.17.78 · the base rates follow the period of the percentiles the outlook tests members against (data/climatology.json) */
  const PER = period || (C && ((C.periods && C.periods.tx90) || C.period)) || '1991-2020'; const [Y0, Y1] = PER.split('-');
  const pool = units.filter(u => !u.disputed && u.lat != null && u.lon != null);
  const out = { name: 'outlook-event-climate', built: null, period: PER, dataset: 'reanalysis daily (ERA5) at the tehsil settlement height',
    definitions: 'data/outlook-event-definitions.json (version ' + DEF.version + ')', startStepDays: START_STEP, windowDays: WINDOW, calendarWindowDays: 2 * HALF + 1,
    what: 'ev[event][slot]: % of years ' + PER + ' in which the event occurred in the 14-day window starting on calendar day slot*' + START_STEP + ' (0 = 1 Jan; leap-year day numbering, 29 Feb = day 59). day[threshold][slot]: % of days within +-7 calendar days of the slot that crossed the single-day threshold.',
    units: {}, failed: [] };
  const t0 = Date.now();
  for (let i = 0; i < pool.length; i += 25) {
    const b = pool.slice(i, i + 25);
    const ask = (bb) => provider.call('archive', '/v1/archive', { latitude: bb.map(u => u.lat), longitude: bb.map(u => u.lon), elevation: bb.map(u => u.elevM ?? 'nan'),
      daily: VARS, start_date: Y0 + '-01-01', end_date: Y1 + '-12-31', timezone: 'Asia/Karachi', models: 'era5' }, { locations: bb.length, timeoutMs: 300000 });
    let arr = null;
    for (let a = 0; a < 2 && !arr; a++) { try { const body = await ask(b); const x = Array.isArray(body) ? body : [body]; if (x.length === b.length) arr = x; } catch (e) { log('  event climate: batch ' + i + ' ' + e.message); } }
    if (!arr) { arr = []; for (const u of b) { try { const one = await ask([u]); arr.push(Array.isArray(one) ? one[0] : one); } catch (_) { arr.push(null); } } }
    arr.forEach((loc, k) => {
      const u = b[k];
      /* the reply is positional; the requested height is echoed back, so a row from another unit is refused */
      if (!loc || !loc.daily || (u.elevM != null && loc.elevation != null && Math.abs(loc.elevation - u.elevM) > 1)) { out.failed.push(u.unitId); return; }
      try {
        const zone = zoneOf(u.lat, u.lon, u.elevM ?? null), coastal = coastalOf(u);
        const r = reduceUnit(loc.daily, u, zone, coastal, DEF, thresholds);
        const cu = C && C.units && C.units[u.unitId];
        let dmax = null; if (cu && cu.zM === (u.elevM ?? null)) { dmax = 0; for (const k of ['tx90', 'tn90', 'tn10']) for (let q = 0; q < 366; q++) if (cu[k][q] != null && r.P[k][q] != null) dmax = Math.max(dmax, Math.abs(cu[k][q] - r.P[k][q])); }
        out.units[u.unitId] = { zone, coastal, elevM: u.elevM ?? null, ev: r.ev, day: r.day, checkVsClimatology: { maxAbsDiffC: dmax == null ? null : r1(dmax), note: dmax == null ? 'data/climatology.json was built at another height; not compared' : 'max |percentile here - data/climatology.json| over tx90/tn90/tn10 and 366 days' } };
      } catch (e) { out.failed.push(u.unitId); log('  event climate: ' + u.unitId + ' ' + e.message); }
    });
    log('  event climate: ' + Math.min(pool.length, i + 25) + '/' + pool.length + ' in ' + Math.round((Date.now() - t0) / 1000) + 's');
  }
  out.built = new Date().toISOString(); out.seconds = Math.round((Date.now() - t0) / 1000);
  const f = join(dataDir, 'outlook-event-climate.json'); writeFileSync(f + '.tmp', JSON.stringify(out)); renameSync(f + '.tmp', f);
  return { units: Object.keys(out.units).length, failed: out.failed.length, seconds: out.seconds };
}

/* reader used by outlook.mjs: the base rate (%) of an event, or of a single-day threshold, for a window starting on iso */
export function createEventClimate(dataDir) {
  let X = null, at = 0;
  const load = () => { if (X === null || Date.now() - at > 10 * 60e3) { try { const f = join(dataDir, 'outlook-event-climate.json'); X = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : false; } catch (_) { X = false; } at = Date.now(); } return X; };
  const slotOf = (iso, step) => Math.min(Math.floor(365 / step), Math.round(doyOf(iso) / step));
  return {
    ready: () => !!load(),
    info: () => { const x = load(); return x ? { built: x.built, period: x.period, windowDays: x.windowDays, file: 'data/outlook-event-climate.json' } : null; },
    event(unitId, id, startIso) { const x = load(); const u = x && x.units[unitId]; const a = u && u.ev[id]; if (!a) return null; const v = a[slotOf(startIso, x.startStepDays)]; return v == null ? null : v; },
    day(unitId, id, iso) { const x = load(); const u = x && x.units[unitId]; const a = u && u.day[id]; if (!a) return null; const v = a[slotOf(iso, x.startStepDays)]; return v == null ? null : v; },
  };
}
