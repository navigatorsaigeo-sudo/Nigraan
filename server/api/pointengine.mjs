/* v91.17.118 · THE POINT ENGINE: the full temperature chain at an exact point, with its uncertainty and what was applied.
   One call answers "what will the temperature be here", for any latitude / longitude in Pakistan, through the SAME chain the map and
   the page use (the server's /px forecast correction: national model on the zone basis, station calibration, urban term, live MACH
   kriging), at the point's own terrain height (places.pointRow: tehsil by polygon, 250 m terrain cell mean), and returns:
     hours[]      time (PKT), temperature, 90 % range (the national model's own range; within the live-station window the kriging
                  interval where it is wider), the steps applied that hour
     days[]       PKT day max / min from the corrected curve, with the range at the hour of each
     chain        which corrections ran here and on what basis (customer words; supplier names removed)
     support      nearest MACH station and its distance; "engine only" when no live station is within 25 km
   No new science: this exposes the served chain at a point. Its skill is the national model's (station-lake/reports/replay_benchmark.md),
   reported separately for points without a live station (engine only), as the temperature plan asks. */
import { appendGzMember } from './gzsafe.mjs';   /* v91.17.283.8 · planned C */
import { utci as agnUtci, utciClass } from './utci.mjs';
/* v91.17.125 · stage 3 (one weather state per point; external audit A12/A13) · each hour carries ONE consistent state: temperature,
   humidity, dew point, wind and the apparent temperature after every correction (the live layer now keeps vapour constant), and the
   comfort values derived from that same state here, not on the page: UTCI in shade (Tmrt = air temperature; calm reference 0.5 m/s
   where no wind; "not assessed" outside -50..50 C / below 17 m/s, see A1 below) and its published class. */
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
/* v91.17.283.3 · audit A1 · no clipping: outside the polynomial's validity (air -50..50 C, wind below 17 m/s at 10 m) the value is
   "not assessed" with the reason, never the value at the edge of the range. The 0.5 m/s calm floor is the model's own reference. */
/* v91.17.283.23 · audit 8 · ONE validity rule: utci.mjs agnUtci decides (it refuses outside its range); this only names the reason */
export function utciWhy(T, rh, v) {
  if (!isN(T)) return 'not assessed: temperature missing for this hour';
  if (!isN(rh)) return 'not assessed: humidity missing for this hour';
  if (T >= 50) return 'not assessed: air temperature ' + Math.round(T * 10) / 10 + ' C is at or above 50 C, beyond the UTCI method (extreme heat)';
  if (T <= -50) return 'not assessed: air temperature at or below -50 C, beyond the UTCI method';
  if (v >= 17) return 'not assessed: wind ' + Math.round(v * 3.6) + ' km/h is beyond the UTCI method (17 m/s at 10 m)';
  if (!(rh >= 0 && rh <= 100)) return 'not assessed: humidity outside 0-100 %';
  return 'not assessed: water vapour pressure above 5 kPa, beyond the UTCI method';
}
export function comfortOf(T, rh, windKmh) {
  const v = isN(windKmh) ? Math.max(0.5, windKmh / 3.6) : 0.5;
  const u = isN(T) && isN(rh) ? agnUtci(T, T, v, rh) : null;
  return isN(u) ? { utciShadeC: Math.round(u * 10) / 10, utciClass: utciClass(u), utciCalmWind: !isN(windKmh) } : { utciShadeC: null, utciClass: null, utciNotAssessed: utciWhy(T, rh, v) }; }

/* v91.17.283.3 · SCI item 1 · audit A14 · DAILY-EXTREME 90 % RANGE. h: the hour holding the day's max (min) with its served hourly
   range lo90 / hi90; cell: data/range90-daily.json zones[zone].Tmax|Tmin. lo = T - kLo (T - lo90), hi = T + kHi (hi90 - T). Null when the
   cell did not pass its test (serve !== true), outside the tested lead days / months, or when the hour's range is missing or does not
   hold T. Pure. */
export function dailyRange90(h, cell, lead, month) {
  if (!h || !cell || cell.serve !== true || !isN(h.tempC) || !isN(h.lo90) || !isN(h.hi90) || !(h.lo90 <= h.tempC && h.tempC <= h.hi90)) return null;
  const kl = Number(cell.kLo), kh = Number(cell.kHi); if (!(kl > 0) || !(kh > 0)) return null;
  if (!(cell.leads || []).includes(lead) || !(cell.months || []).includes(month)) return null;
  const r = (x) => Math.round(x * 10) / 10, T = h.tempC; return [r(T - kl * (T - h.lo90)), r(T + kh * (h.hi90 - T))];
}
/* v91.17.283.24 · self-audit P13 · the point engine's own forecast (a second request and correction chain at the point, plus three variant
   requests for its step decomposition) was read only by the daily point archive. The archive now records the SERVED point record
   (pointstate.mjs: the one value per place every page shows) and its 90 % band; the second chain is removed. */
export function createPointEngine(app) {
  /* v91.17.120 · once a Pakistan day (after 02:00 PKT), the exact-point forecast at each forward-test point (data/forward-test-points.json)
     is appended to data/archive/points/points_<month>.jsonl.gz, so the monthly forward test scores the point chain, not only the tehsil
     point. Eight calls a day. */
  /* v91.17.213 · audit A17 · POINT ARCHIVAL RECOVERS A MISSED POINT. The day was marked done whatever was saved (2 Oct: 7 of 8 points,
     the eighth never retried), and a run that saved nothing blocked the rest of the day in memory. The marker now lists the ids saved;
     later ticks the same day retry only the missing points, at most 6 times, 60 min apart. An old marker (a bare count) counts as done. */
  let lastArchiveDay = null, archBusy = false; const archTry = { day: null, n: 0, next: 0 };
  async function archiveDaily(dataDir) {
    const nowP = new Date(Date.now() + 5 * 3600e3); const day = nowP.toISOString().slice(0, 10);
    if (nowP.getUTCHours() < 2 || lastArchiveDay === day || archBusy) return { skipped: true };
    if (archTry.day !== day) { archTry.day = day; archTry.n = 0; archTry.next = 0; }
    if (Date.now() < archTry.next) return { skipped: true, retryAt: new Date(archTry.next).toISOString() };
    archBusy = true;
    try { return await archiveDay(dataDir, day); } finally { archBusy = false; }
  }
  async function archiveDay(dataDir, day) {
    const { readFileSync, existsSync, mkdirSync, appendFileSync } = await import('node:fs'); const { join } = await import('node:path'); const { gzipSync } = await import('node:zlib');
    const dir = join(dataDir, 'archive', 'points'); mkdirSync(dir, { recursive: true });
    const marker = join(dir, '.done_' + day);
    let P = []; try { P = JSON.parse(readFileSync(join(dataDir, 'forward-test-points.json'), 'utf8')).points || []; } catch (_) {}
    let saved = new Set();
    if (existsSync(marker)) { const t = readFileSync(marker, 'utf8').trim(); let j = null; try { j = JSON.parse(t); } catch (_) {}
      if (!j || !Array.isArray(j.ids)) { lastArchiveDay = day; return { skipped: true, marker: 'complete (count only)' }; }
      saved = new Set(j.ids);
      /* the attempt count and the next try live in the marker, so a restart neither resets the cap nor retries at once */
      if (archTry.n < (j.attempts || 0)) archTry.n = j.attempts; if (j.next && Date.parse(j.next) > Date.now()) { archTry.next = Date.parse(j.next); return { skipped: true, retryAt: j.next }; } }
    if (P.length && P.every(p => saved.has(p.id))) { lastArchiveDay = day; return { skipped: true, marker: 'complete' }; }
    /* v91.17.125 · external audit A16 · every archived issue carries the identity of what made it: the version and SHA-256 of each
       model file, the gate and rule-ledger versions and the package version, so the forward test scores a frozen, named chain */
    const { createHash } = await import('node:crypto');
    const ident = (f) => { try { const b = readFileSync(join(dataDir, f)); let v = null; try { const j = JSON.parse(b.toString('utf8')); v = j.version || j.modelVersion || null; } catch (_) {} return { v, sha: createHash('sha256').update(b).digest('hex').slice(0, 16) }; } catch (_) { return null; } };
    let pkgV = null; try { pkgV = JSON.parse(readFileSync(join(dataDir, '..', 'package.json'), 'utf8')).version; } catch (_) {}
    const mv = { app: pkgV, national: ident('national-model.json'), downscale: ident('downscale-model.json'), hyperlocal: ident('hyperlocal-model.json'), tempCorrection: ident('temp-correction.json'),
      humwind: ident('humwind-model.json'), dew: ident('dew-offset-lowland.json'), dewFinal: ident('dew-final.json'), gate: ident('model-gate.json'), rules: ident('rule-ledger.json') };
    const lines = [], done = new Set(saved);
    for (const pass of [0, 1]) for (const p of P) { if (done.has(p.id)) continue; if (pass) await new Promise(r => setTimeout(r, 5000));
      try { const f = await app.pointState.state(p.lat, p.lon, { noBuild: true }); const R = f && f.ok ? app.pointState.rangeOf(f) : null;
        if (f && f.ok) { lines.push(JSON.stringify({ d: day, iss: f.issuedAt || new Date().toISOString(), mv, id: p.id, lat: p.lat, lon: p.lon, elevM: f.point.elevM, engineOnly: !(f.source && f.source.mach && f.source.mach.anyHour), chain: (f.source && f.source.chain) || [],
          hours: f.hours.map(h => { const b = R ? R.get(h.time) : null; return [h.time, h.tempC, b ? b[0] : null, b ? b[1] : null]; }) })); done.add(p.id); } } catch (_) {} }   /* a second pass retries a point that failed (a cold start missed Peshawar once) */
    if (lines.length) appendGzMember(join(dir, 'points_' + day.slice(0, 7) + '.jsonl.gz'), gzipSync(lines.join('\n') + '\n'));
    const missing = P.filter(p => !done.has(p.id)).map(p => p.id);
    archTry.n++; if (!missing.length || archTry.n >= 6) lastArchiveDay = day; else archTry.next = Date.now() + 60 * 60e3;
    const { writeFileSync, renameSync } = await import('node:fs');
    writeFileSync(marker + '.tmp', JSON.stringify({ ids: [...done], of: P.length, attempts: archTry.n, next: missing.length && archTry.n < 6 ? new Date(archTry.next).toISOString() : null, at: new Date().toISOString() })); renameSync(marker + '.tmp', marker);
    return { archived: lines.length, missing, attempt: archTry.n };
  }
  return { archiveDaily };
}
