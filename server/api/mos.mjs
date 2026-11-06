/* Mountain temperature correction (MOS), learned from the PMD mountain AWS station network.

   Phase 2 measured the model against 47 stations for a year: on the plains it is
   already right (Lahore -0.14 C, Multan -0.45 C, MAE ~1.35 C), but in the northern
   mountains it runs about 4.5 C cold, and ERA5 - the reference the existing bias
   correction trusts - is worse still (-5.96 C). Phase 3 learned the correction and
   distilled it into a table this process can apply without a Python runtime:

     - per station, per month, per part of day        MAE 4.8 -> 2.0 C
     - per height band, per month, per part of day    MAE 4.9 -> 2.8 C (no station near)

   Guards, because the correction is the average of a biased network and hurts places
   that were already right:
     - only inside the sampled domain (lat/lon box and height range of the table)
     - never within SKIP_KM of a station where the raw forecast already verified well
     - never where the table has no entry for that month and part of day

   The table is data/mos-table.json, written by station-lake/scripts/train_mos.py.
   Set NIGRAAN_MOS=0 to switch the whole thing off. */
/* ══ v91.17.70 · SPRINT 1 · DATA-SOURCE DECISION (CEO, 25 Sep 2026, option 2) ═══════════════════════════════════════
   Customer outputs use AGN's MACH stations and openly licensed data only. Every table in this module was fitted to PMD
   records (the mountain AWS lake, the PMD synop network via NOAA ISD-Lite, the PMD city AWS): the station / height-band
   MOS, the learned model, the regional offset, the humidity table and the plains city offsets. They are now INTERNAL
   REFERENCE ONLY, served when NIGRAAN_INTERNAL_REF=1 (testing), never by default.

   What serves by default instead is the TEMPERATURE BASIS below: the provider's model output at the point's height
   (the provider's own DEM downscaling), with the model chosen per zone by internal verification
   (nigraan-local/scripts/temp_zone_rank.py -> data/model-zone.json, which stores model NAMES and a score summary only;
   no PMD-fitted number is applied to any output) [measured, see CHANGES_temperature.md]. The MACH running correction
   (fleet.mjs runningBias) is added on top where a trusted MACH station is near. */
/* ══ v91.17.71 · STATION CALIBRATION ON THE ZONE BASIS (CEO decision 25 Sep 2026: the data is used, the suppliers are not named)
   The station data feeds customer values again (refmode.mjs stationData(), default ON). What serves is NOT the v91.17.69
   table above (fitted on best_match, which the mountain zone no longer serves) but a correction fitted ON the served zone
   basis: data/temp-correction.json (station-lake/scripts/train_zone_corr.py). Per site and month, the day-1 daily maximum
   and minimum offset (observed minus the zone basis), shrunk to the height band; served through a diurnal stretch
   (stretchAdj) so the corrected hourly curve passes through max + tx and min + tn and the day card is the curve.
   Held-out (internal, data/forecast-verification.json) [measured]: mountain export Aug-Sep 2026 Tmax 2.47 -> 1.72 C,
   Tmin 3.22 -> 2.34 C; leave-one-station-out Tmax 3.02 -> 2.15 C. Tier B (station-calibrated), credited with
   label(creditLabel); never MACH-verified. NIGRAAN_STATION_DATA=0 (or NIGRAAN_ZONE_CORR=0) serves the pure zone basis.
   The v91.17.69 tables stay for replay only (NIGRAAN_MOS_V69=1, scripts/temp_zone_before.mjs). */
import { capped } from './capcount.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stationData, internalNames, label } from './refmode.mjs';
import { pktDay as pktDayKey } from './pktday.mjs';
export const internalRef = () => process.env.NIGRAAN_INTERNAL_REF === '1';
export const CORRECTION_VERSION = 'tc-91.17.71';
/* v91.17.71 · the v91.17.69 tables (fitted on best_match) are a replay path only: the served mountain basis is the zone blend */
export const v69Replay = () => process.env.NIGRAAN_MOS_V69 === '1';

const NEAR_KM = 25;        // station table applies within this distance
const NEAR_DZ = 500;       // ... and this height difference (m)
const SKIP_KM = 15;        // no correction this close to a station the model already fits
const SKIP_MAE = 2.6;      // "already fits" in C, the break-even point measured in phase 3
const MIN_STATIONS = 3;    // a height-band cell needs this many stations behind it
const MIN_HOURS = 400;     // ... and this many station hours
const CAP_C = 6;           // no single adjustment larger than this

export function createMos({ dataDir, log }) {
  const file = join(dataDir, 'mos-table.json');
  let T = null, loadedAt = null, err = null;
  try {
    if (existsSync(file)) { T = JSON.parse(readFileSync(file, 'utf8')); loadedAt = new Date().toISOString(); }
    else err = 'mos-table.json not present';
  } catch (e) { err = e.message; }

  const enabled = () => v69Replay() && process.env.NIGRAAN_MOS !== '0' && !!T;   /* v91.17.71 · replay only (fitted on best_match, not on the served zone basis) */

  /* ══ v91.17.70 · THE TEMPERATURE BASIS: ONE MODEL PER ZONE, AT THE POINT'S HEIGHT ═════════════════════════════════
     data/model-zone.json (temp_zone_rank.py). Zones: mountain (inside a Gilgit-Baltistan or Chitral tehsil, or ground at
     or above the file's mountainMinElevM anywhere), coast (within coastKm of the coastline), hills (at or above
     hillsMinElevM), plains. Each zone names its temperature model; a model with a short horizon names a full-horizon
     fallback and the hours over which the two are blended. The zone geometry is in the file (a simplified outline of
     the GB + Chitral tehsils and the coastline), so nothing here is a hard-coded place list. */
  let MZ = null, mzErr = null, mzAt = 0;
  const loadZones = () => { try { const f = join(dataDir, 'model-zone.json'); MZ = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; mzErr = MZ ? null : 'model-zone.json not present'; } catch (e) { MZ = null; mzErr = e.message; } mzAt = Date.now(); return MZ; };
  loadZones();
  const zonesFile = () => { if (Date.now() - mzAt > 10 * 60e3) loadZones(); return MZ; };
  const inRing = (lat, lon, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; } return ins; };
  const inPoly = (lat, lon, poly) => poly && poly.length && inRing(lat, lon, poly[0]) && !poly.slice(1).some(h => inRing(lat, lon, h));
  function coastKmOf(lat, lon, line) {
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) { const [x1, y1] = line[i], [x2, y2] = line[i + 1]; for (let t = 0; t <= 1.0001; t += 0.1) { const d = km(lat, lon, y1 + (y2 - y1) * t, x1 + (x2 - x1) * t); if (d < best) best = d; } }
    return best;
  }
  function zoneOfPoint(lat, lon, elevM) {
    const Z = zonesFile(); if (!Z || lat == null || lon == null) return null;
    const R = Z.zoneRule || {};
    const adminMountain = (R.mountainOutline || []).some(p => inPoly(lat, lon, p));
    if (adminMountain) return 'mountain';
    if (elevM != null && R.mountainMinElevM != null && elevM >= R.mountainMinElevM) return 'mountain';
    if (R.coastline && R.coastKm != null && coastKmOf(lat, lon, R.coastline) <= R.coastKm) return 'coast';
    if (elevM != null && R.hillsMinElevM != null && elevM >= R.hillsMinElevM) return 'hills';
    return 'plains';
  }
  /* { zone, temperature, fallback, blendHours } — the model whose temperature family is served in this zone */
  function zoneModel(zone) {
    const Z = zonesFile(); const z = Z && Z.zones && Z.zones[zone];
    const members = z ? (Array.isArray(z.temperatureModels) && z.temperatureModels.length ? z.temperatureModels : [z.temperatureModel || 'best_match']) : ['best_match'];
    return z ? { zone, members, temperature: members.join('+'), fallback: z.horizonFallback || null, blendHours: z.blendHours ?? null } : { zone, members, temperature: 'best_match', fallback: null, blendHours: null };
  }
  /* the one multi-model request that carries every zone model: best_match (all other variables) + the zone models */
  const requestModels = () => { const Z = zonesFile(); return (Z && Z.request && Z.request.models) || null; };
  const temperatureFamily = () => { const Z = zonesFile(); return (Z && Z.temperatureFamily) || null; };
  /* ══ v91.17.37 · B · THE GAPS OF THE TABLE ═══════════════════════════════════════════════
     station-lake/scripts/lapse.py fetched the provider's value at its own grid height at every
     verification station and fitted (obs - T_grid) = gamma * dz + c by month and part of day.
     Measured: the provider's lapse rate (-6.5 C/km as applied) agrees with the fitted one; the
     error is a grid-height cold bias c of +1 to +6.6 C, not a lapse error. Where this table has a
     station or band entry nothing changes. Where it has NO entry (a thin band, a month without
     support) the regional offset c(month, part) is served instead: at a held-out station that
     offset alone takes the raw error from 4.90 to 2.95 C (leave-one-station-out). It is never
     added at a skip-list station or outside the sampled box. data/lapse-table.json; off when
     that file says serve != 'mos-else-offset', or NIGRAAN_MOS_OFFSET=0. */
  let LP = null, lpErr = null;
  try { const lf = join(dataDir, 'lapse-table.json'); if (existsSync(lf)) LP = JSON.parse(readFileSync(lf, 'utf8')); else lpErr = 'lapse-table.json not present'; } catch (e) { lpErr = e.message; }
  const offsetOn = () => process.env.NIGRAAN_MOS_OFFSET !== '0' && !!LP && LP.serve === 'mos-else-offset' && !!LP.offsetFallback;
  function regionalOffset(month, part) {
    if (!offsetOn()) return null;
    const v = LP.offsetFallback[`${month}|${part}`]; if (v == null) return null;
    return { adj: cap(v), applied: true, source: 'regional offset', month, part, partHours: PART_HOURS[part],
             note: 'no station or height-band entry here; the regional grid-height cold bias for this month and part of day is served instead (lapse.py, leave-one-station-out MAE 4.90 -> 2.95 C)',
             support: { stations: (LP.table[`${month}|${part}`] || {}).stations, hours: (LP.table[`${month}|${part}`] || {}).n } };
  }
  const stations = () => Object.entries((T && T.stations) || []).map(([name, s]) => ({ name, ...s }));
  const km = (aLat, aLon, bLat, bLon) => {
    const R = 6371, d = Math.PI / 180;
    const dLat = (bLat - aLat) * d, dLon = (bLon - aLon) * d;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * d) * Math.cos(bLat * d) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  /* v91.17.68 · the table month is the Pakistan month (the tables were fitted on PKT months); 00-05 PKT on the 1st used to read the previous month (B24) */
const pktMonth = (whenMs) => new Date(whenMs + 5 * 3600e3).getUTCMonth() + 1;
const partOf = (utcMs) => {
    const u = new Date(utcMs).getUTCHours();
    return u <= 2 ? 'night' : u <= 8 ? 'dawn' : u <= 14 ? 'day' : u <= 20 ? 'dusk' : 'night';
  };
  /* v91.17.36 · AUDIT MOS-03 · the part names are table keys; the API also says which hours they cover */
  const PART_HOURS = { night: '21-02 UTC (02-07 PKT)', dawn: '03-08 UTC (08-13 PKT)', day: '09-14 UTC (14-19 PKT)', dusk: '15-20 UTC (20-01 PKT)' };
  const cap = (v) => Math.max(-CAP_C, Math.min(CAP_C, Math.round(v * 100) / 100));
  const bandOf = (z) => z < 2000 ? '<2000' : z < 2750 ? '2000-2750' : z < 3250 ? '2750-3250'
    : z < 3750 ? '3250-3750' : z < 4250 ? '3750-4250' : '>4250';

  /* skip list: stations where the raw forecast already verified within SKIP_MAE */
  const skipList = () => ((T && T.already_good) || []);

  /* v91.17.59 · THE PMD SYNOP NETWORK, OUTSIDE THE GB BOX. Entries fitted on NOAA ISD-Lite pairs (station-lake
     train_plains.py): per station, month|part and month|part|tbin, kept only where an alternate-14-day-block hold-out
     beat the raw forecast. MEASURED on that hold-out, 49 stations: 2.15 -> 1.57 C; and the gain holds at every part of
     day (mountain synop sites dusk 4.04 -> 2.04, night 3.49 -> 2.26), so a synop entry is applied at all hours - the
     daytime-only rule belongs to the valley AWS table, not to these open screened sites. */
  const synop = () => (T && T.isd_stations) || null;
  const synopStations = () => Object.entries((synop() && synop().stations) || {}).map(([name, s]) => ({ name, ...s }));
  function nearestSynop(lat, lon, elevM) {
    const S = synop(); if (!S || elevM == null) return null;
    const nearKm = S.near_km || 30, nearDz = S.near_dz_m || 300;
    let best = null, bd = Infinity;
    for (const s of synopStations()) {
      const d = km(lat, lon, s.lat, s.lon);
      if (d < bd && d <= nearKm && Math.abs(s.elevation_m - elevM) <= nearDz) { bd = d; best = s; }
    }
    return best ? { station: best, km: bd } : null;
  }
  const hasSynop = (lat, lon, elevM) => !!nearestSynop(lat, lon, elevM);

  function inDomain(lat, lon, elevM) {
    if (!T) return false;
    const b = T.bounds || { lat: [34.5, 37.1], lon: [71.0, 77.0] };
    if (lat < b.lat[0] || lat > b.lat[1] || lon < b.lon[0] || lon > b.lon[1]) return false;
    const r = (T.valid_range && T.valid_range.elevation_m) || [1300, 4700];
    if (elevM == null) return false;
    return elevM >= r[0] - 200 && elevM <= r[1] + 300;
  }

  /* Daily extremes in the plains. The hourly field there is already close (bias about
     -0.5 C), but the daily maximum runs 1.4 to 1.7 C cool at Lahore and Karachi, which is
     what decides whether a 40 C class fires. Monthly offsets per city, measured against
     the PMD-reported extremes: daily maximum MAE 1.52 -> 0.97 at Karachi, 1.79 -> 1.16 at
     Lahore; 40 C detection 0.31 -> 0.54 and 0.73 -> 0.95. The fitted tail mapping is NOT
     applied - see tail_note in the table. */
  function adjustDaily(lat, lon, elevM, dayISO) {
    const P = T && T.plains;
    if (!enabled() || !P) return { applied: false, why: 'no plains table' };
    if (elevM != null && elevM > (P.max_elevation_m || 1000)) return { applied: false, why: 'not a plains site' };
    let best = null, bd = Infinity;
    /* v91.17.23 · P4-1 · Lahore's daily offsets are excluded by default. Scored against the
       co-located PMD synop station (NOAA GSOD, Feb 2024 - Aug 2025) they overcorrect: Tmax
       bias -0.75 -> +0.97 C and MAE 1.54 -> 1.61 at Lahore City, +0.18 -> +2.29 C at the
       airport. Karachi (MAE 1.16 -> 1.04) and Multan (1.59 -> 1.40) improve and stay on.
       NIGRAAN_PLAINS_EXCLUDE is a comma list of city keys; set it empty to use all three. */
    const _excl = String(process.env.NIGRAAN_PLAINS_EXCLUDE ?? 'PMD_Lahore_AWS').split(',').map(x => x.trim()).filter(Boolean);
    for (const [name, c] of Object.entries(P.cities || {})) {
      if (_excl.includes(name)) continue;
      const d = km(lat, lon, c.lat, c.lon);
      if (d < bd && d <= (P.near_km || 40)) { bd = d; best = [name, c]; }
    }
    if (!best) return { applied: false, why: 'no calibrated city within ' + (P.near_km || 40) + ' km' };
    const month = String(new Date(dayISO + 'T12:00:00Z').getUTCMonth() + 1);
    const c = best[1];
    const tmax = c.tmax_offset[month], tmin = c.tmin_offset[month];
    if (tmax == null && tmin == null) return { applied: false, why: 'no entry for month ' + month };
    return { applied: true, source: 'city', city: best[0], km: Math.round(bd), month: Number(month),
             confidence: c.confidence || 'normal', confidence_why: c.confidence_why || null,
             tmax: tmax == null ? 0 : Math.max(-5, Math.min(5, tmax)),
             tmin: tmin == null ? 0 : Math.max(-5, Math.min(5, tmin)),
             tail_applied: false };
  }

  /* Percentage points to ADD to the model relative humidity, plus why.
     Measured +11.3% too humid at 46 mountain stations; corrected to +1.5% (MAE 17.3 ->
     14.8) on a leave-one-station-out test (v91.17.23: figures now match data/mos-table.json rh.measured;
     this comment said +1.0% / 14.1, which no file supports). This matters most through wet bulb: with the
     temperature correction alone wet bulb runs +0.99 C warm, with both it is +0.24 C. */
  function adjustRh(lat, lon, elevM, whenMs = Date.now()) {
    const R = T && T.rh;
    if (!enabled() || !R) return { adj: 0, applied: false, why: 'no humidity table' };
    if (!inDomain(lat, lon, elevM)) return { adj: 0, applied: false, why: 'outside the sampled domain' };
    const month = pktMonth(whenMs), part = partOf(whenMs);
    let best = null, bd = Infinity;
    for (const [name, s] of Object.entries((T.stations) || {})) {
      const d = km(lat, lon, s.lat, s.lon);
      if (d < bd && d <= NEAR_KM && Math.abs((s.elevation_m ?? elevM) - elevM) <= NEAR_DZ) { bd = d; best = [name, s]; }
    }
    if (best) {
      const v = (R.stations[best[0]] || {})[`${month}|${part}`];
      if (v != null) return { adj: Math.max(-40, Math.min(40, v)), applied: true, source: 'station', station: best[0], km: Math.round(bd) };
    }
    const band = bandOf(elevM);
    const row = (R.band_table || []).find(r => r.band === band && r.month === month && r.part === part);
    if (row && (row.n_stations ?? 0) >= MIN_STATIONS && (row.n ?? 0) >= MIN_HOURS) {
      return { adj: Math.max(-40, Math.min(40, row.adj)), applied: true, source: 'height band', band,
               support: { stations: row.n_stations, hours: row.n } };
    }
    return { adj: 0, applied: false, why: 'no humidity table entry for this month and part of day' };
  }

  /* Celsius to ADD to the model temperature, plus why. */
  /* v91.17.58 · the model's own temperature picks the bin (floor(t/5)*5): the cold bias is large on cold inverted days and
     near zero on warm afternoons. MEASURED on the lake (day-block split, station seen): month|part table MAE 1.99 C,
     with the bin 1.82 C; unseen station 2.78 -> 2.54 C. A bin needs 30 station hours (150 hours and 2 stations for a
     height band); the month|part cell is the fallback. Without a model temperature the old lookup is used unchanged. */
  const tbinOf = (t) => (t == null || !Number.isFinite(t)) ? null : Math.floor(t / 5) * 5;
  /* v91.17.59 · the learned model (mlmos.mjs) replaces a station or synop entry where its zone verdict says it wins;
     feat = { rh, windKmh, modelElevM } for the hour. Without a model temperature or a table entry it is never asked. */
  let ML = null; const setMl = (m) => { ML = m; };
  function adjust(lat, lon, elevM, whenMs = Date.now(), tModelC = null, feat = null) {
    const a = adjustTable(lat, lon, elevM, whenMs, tModelC);
    /* v91.17.60 · a site-validated ML station: the export names airports where the model beat the raw forecast on its own
       unseen year (ml_sites); there the model serves even where the table kept no entry (Lahore, Peshawar: table gain
       under 0.10 C, model gain 0.09 and 0.25 C). Within 30 km and 300 m of the site. */
    if (ML && tModelC != null && !a.applied && elevM != null) {
      const site = ML.siteNear ? ML.siteNear(lat, lon, elevM) : null;
      if (site) {
        const f = ML.features({ tModel: tModelC, rh: feat && feat.rh, windKmh: feat && feat.windKmh, whenMs, elevM, modelElevM: feat && feat.modelElevM, lat, lon, net: 1 });
        const v = ML.predict(f); if (v != null) return { adj: v, applied: true, source: 'learned model', station: site.name + ' (' + site.id + ')', km: Math.round(site.km), ml: true, zone: 'synop_site', allHours: true, holdout: { raw_mae: site.raw_2026, mae: site.model_2026, scheme: 'fit 2025, scored Jan-Aug 2026' } };
      }
    }
    if (!ML || !a.applied || tModelC == null || !(a.source === 'station' || a.source === 'synop station')) return a;
    const zone = a.source === 'station' ? 'seen_station' : 'synop_airports';
    if (!ML.serve(zone)) return a;
    const f = ML.features({ tModel: tModelC, rh: feat && feat.rh, windKmh: feat && feat.windKmh, whenMs, elevM, modelElevM: feat && feat.modelElevM, lat, lon, net: a.source === 'station' ? 0 : 1 });
    const v = ML.predict(f); if (v == null) return a;
    return { ...a, adj: v, source: 'learned model', tableAdj: a.adj, tableSource: a.source, ml: true, zone };
  }
  function adjustTable(lat, lon, elevM, whenMs = Date.now(), tModelC = null) {
    if (!enabled()) return { adj: 0, applied: false, why: 'mos off or table missing' };
    const ns = nearestSynop(lat, lon, elevM), inBox = inDomain(lat, lon, elevM);
    if (!inBox && !ns) return { adj: 0, applied: false, why: 'no station table within 30 km of this point; served raw (the plains forecast verifies within about 1.5 C at the synop stations, so only stations with a persistent bias carry an entry)' };
    if (ns) {
      /* the nearer observation wins: a valley AWS closer than the synop station keeps the mountain table */
      let lakeD = Infinity;
      if (inBox) for (const s of stations()) { const d = km(lat, lon, s.lat, s.lon); if (d < lakeD && d <= NEAR_KM && Math.abs((s.elevation_m ?? elevM) - elevM) <= NEAR_DZ) lakeD = d; }
      if (ns.km <= lakeD) {
        const month = pktMonth(whenMs), part = partOf(whenMs), st = ns.station;
        const tb = tbinOf(tModelC); const vt = (tb != null && st.adj_tbin) ? st.adj_tbin[`${month}|${part}|${tb}`] : null;
        if (vt != null) return { adj: cap(vt), applied: true, source: 'synop station', station: st.name, km: Math.round(ns.km), month, part, tbin: tb, bin: true, allHours: true, holdout: st.holdout || null };
        const v = st.adj && st.adj[`${month}|${part}`];
        if (v != null) return { adj: cap(v), applied: true, source: 'synop station', station: st.name, km: Math.round(ns.km), month, part, allHours: true, holdout: st.holdout || null };
        if (!inBox) return { adj: 0, applied: false, why: `no entry for month ${month} ${part} at ${st.name}` };
      }
    }
    for (const s of skipList()) {
      if (km(lat, lon, s.lat, s.lon) <= SKIP_KM) {
        return { adj: 0, applied: false, why: `model already verifies at ${s.name} (MAE ${s.mae_raw_c} C)` };
      }
    }
    const month = pktMonth(whenMs), part = partOf(whenMs);
    let best = null, bd = Infinity, sensorPeriod = null;
    for (const s of stations()) {
      const d = km(lat, lon, s.lat, s.lon);
      if (d < bd && d <= NEAR_KM && Math.abs((s.elevation_m ?? elevM) - elevM) <= NEAR_DZ) { bd = d; best = s; }
    }
    if (best) {
      const v = best.adj[`${month}|${part}`];
      /* ══ v91.17.57 · A STATION ENTRY THAT FLIPS SIGN AGAINST ITS OWN YEAR IS A SENSOR PERIOD, NOT A CORRECTION ══
         MEASURED: Darkut_AWS_2's table said -9.3 C for September daytime against +2 to +10 in every other month
         (annual median +5.6): the September-October 2025 readings were a sensor fault the training swallowed, and on
         23 Sep 2026 the route returned -6 for a point where the raw forecast was already 8 C cold. An entry more than
         8 C from the station's median month, on the other side of zero, is skipped and the height band answers. */
      const tb = tbinOf(tModelC); const vt = (tb != null && best.adj_tbin) ? best.adj_tbin[`${month}|${part}|${tb}`] : null;
      if (vt != null) return { adj: cap(vt), applied: true, source: 'station', station: best.name, km: Math.round(bd), month, part, tbin: tb, bin: true };
      if (v != null) {
        const vals = Object.values(best.adj).filter(x => typeof x === 'number').sort((a, b) => a - b);
        const med = vals.length ? vals[Math.floor(vals.length / 2)] : v;
        const flipped = vals.length >= 6 && Math.abs(v - med) > 8 && (v < 0) !== (med < 0);
        if (!flipped) return { adj: cap(v), applied: true, source: 'station', station: best.name, km: Math.round(bd), month, part };
        sensorPeriod = { station: best.name, entry: v, stationMedian: med };
      }
    }
    const band = bandOf(elevM);
    { const tb = tbinOf(tModelC);
      const rt = tb == null ? null : (T.distilled_tbin || []).find(r => r.band === band && r.month === month && r.part === part && r.tbin === tb);
      if (rt && (rt.n_stations ?? 0) >= 2 && (rt.n ?? 0) >= 150) return { adj: cap(rt.adj), applied: true, source: 'height band', band, month, part, tbin: tb, bin: true, partHours: PART_HOURS[part], support: { stations: rt.n_stations, hours: rt.n } }; }
    const row = (T.distilled_table || []).find(r => r.band === band && r.month === month && r.part === part);
    if (row && (row.n_stations ?? 0) >= MIN_STATIONS && (row.n ?? 0) >= MIN_HOURS) {
      return { adj: cap(row.adj), applied: true, source: 'height band', band, month, part, partHours: PART_HOURS[part],
               support: { stations: row.n_stations, hours: row.n }, ...(sensorPeriod ? { skippedStationEntry: sensorPeriod } : {}) };
    }
    const ro = regionalOffset(month, part);
    if (ro) return { ...ro, why: row ? `height band ${band} has only ${row.n_stations} station(s) for month ${month}` : 'no station or band entry for this month and part of day' };
    if (row) return { adj: 0, applied: false, why: `height band ${band} has only ${row.n_stations} station(s) for month ${month}` };
    return { adj: 0, applied: false, why: 'no table entry for this month and part of day' };
  }

  /* ══ v91.17.71 · THE STATION CALIBRATION SERVICE (data/temp-correction.json) ════════════════════════════════════════
     calibrationAt(lat, lon, elevM, zone, month) -> { tx, tn, via } | null   the day-1 daily max / min offset at a point
       mountain: own site (rule.ownKm / ownDz) -> own site without this month (band + the site's mean departure, n/(n+2))
                 -> nearest site (rule.nbKm / nbDz) -> band + distance-weighted departures (rule.idw) -> band
       hills:    nearest site (rule.hillsNbKm / hillsNbDz; a month it lacks: its mean offset, n/(n+2)) -> zone month -> none
     stretchAdj(tMs[], T[], cal) -> per-hour offsets: anchors at each Pakistan day's forecast minimum (tn) and maximum
       (tx); between two anchors the offset moves with the forecast value, so the corrected curve has no step and its own
       max / min are T_max + tx / T_min + tn (the same construction as train_zone_corr.py stretch_curve).
     dewOffset(zone, elevM, tMs): the mountain dew-point offset (band x month x part), null elsewhere. */
  let TC = null, tcErr = null, tcAt = 0;
  const loadTc = () => { try { const f = join(dataDir, 'temp-correction.json'); TC = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; tcErr = TC ? null : 'temp-correction.json not present'; } catch (e) { TC = null; tcErr = e.message; } tcAt = Date.now(); return TC; };
  loadTc();
  const tcFile = () => { if (Date.now() - tcAt > 10 * 60e3) loadTc(); return TC; };
  const calibrationOn = () => stationData() && process.env.NIGRAAN_ZONE_CORR !== '0' && !!tcFile();
  const bandOfTc = (z, edges, names) => { for (let i = 0; i < edges.length; i++) if (z < edges[i]) return names[i]; return names[names.length - 1]; };
  function calibrationAt(lat, lon, elevM, zone, month) {
    const C = calibrationOn() ? tcFile() : null; if (!C || lat == null || lon == null || elevM == null || !zone) return null;
    const Z = C.zones && C.zones[zone]; if (!Z) return null;
    const R = C.rule || {}; const cap = R.capC ?? 6; const k = month - 1;
    const out = (tx, tn, via, site) => (tx == null || tn == null) ? null : { tx: Math.round(capped('calibration.tx', tx, cap) * 100) / 100, tn: Math.round(capped('calibration.tn', tn, cap) * 100) / 100, via, zone, siteId: site ? site.id : null, siteKm: site ? site._km : null, natOff: !!(site && site.natOff) };   /* v91.17.139 · natOff: an adopted synop site serves alone (the national model keeps its range only) */
    const sites = Z.sites || [];
    /* v91.17.139 · plains and coast hold synop sites only (scripts/gen/balo_synop_calib.py): the hills rule, no area fallback */
    if (zone === 'hills' || zone === 'plains' || zone === 'coast') {
      let best = null;
      for (const s of sites) { const d = km(lat, lon, s.lat, s.lon); if (d <= (R.hillsNbKm ?? 25) && Math.abs(s.elevM - elevM) <= (R.hillsNbDz ?? 300) && (!best || d < best._km)) best = { ...s, _km: Math.round(d * 10) / 10 }; }
      if (best) {
        if (best.tx[k] != null && best.tn[k] != null) return out(best.tx[k], best.tn[k], best._km <= (R.ownKm ?? 2) ? 'site' : 'nearby', best);
        const xs = best.tx.filter(v => v != null), ns = best.tn.filter(v => v != null);
        if (xs.length && ns.length) { const w = xs.length / (xs.length + 2); return out(w * xs.reduce((a, v) => a + v, 0) / xs.length, w * ns.reduce((a, v) => a + v, 0) / ns.length, 'site-annual', best); }
      }
      const zm = Z.zoneMonth || {}; return (zm.tx && zm.tx[k] != null) ? out(zm.tx[k], zm.tn[k], 'area', null) : null;
    }
    const B = Z.bands || {}; const band = (b) => (B.table && B.table[b]) || null;
    const bOf = (z) => bandOfTc(z, B.edgesM || [2000, 2750, 3250, 3750, 4250], B.names || ['<2000', '2000-2750', '2750-3250', '3250-3750', '3750-4250', '>4250']);
    const bp = band(bOf(elevM)); const bx = bp ? bp.tx[k] : null, bn = bp ? bp.tn[k] : null;
    if (bx == null || bn == null) return null;
    let own = null, nb = null, sw = 0, sx = 0, sn = 0; const I = R.idw || { L_km: 15, H_m: 300, c: 0.3, max_km: 60 };
    for (const s of sites) {
      const d = km(lat, lon, s.lat, s.lon), dz = Math.abs(s.elevM - elevM);
      const oK = s.kind === 'synop' ? (R.ownKmSynop ?? R.ownKm ?? 2) : (R.ownKm ?? 2), oZ = s.kind === 'synop' ? (R.ownDzSynop ?? R.ownDz ?? 100) : (R.ownDz ?? 100);   /* a town's synop site answers for the town */
      if (d <= oK && dz <= oZ && (!own || d < own._km)) own = { ...s, _km: Math.round(d * 10) / 10 };
      if (s.tx[k] == null || s.tn[k] == null) continue;
      if (d <= (R.nbKm ?? 5) && dz <= (R.nbDz ?? 150) && (!nb || d < nb._km)) nb = { ...s, _km: Math.round(d * 10) / 10 };
      if (d <= I.max_km) { const sb = band(bOf(s.elevM)); if (!sb || sb.tx[k] == null) continue; const w = Math.exp(-d / I.L_km - dz / I.H_m); sw += w; sx += w * (s.tx[k] - sb.tx[k]); sn += w * (s.tn[k] - sb.tn[k]); }
    }
    if (own) {
      if (own.tx[k] != null && own.tn[k] != null) return out(own.tx[k], own.tn[k], 'site', own);
      const sb = band(bOf(own.elevM)); const dep = [];
      if (sb) for (let j = 0; j < 12; j++) if (own.tx[j] != null && own.tn[j] != null && sb.tx[j] != null && sb.tn[j] != null) dep.push([own.tx[j] - sb.tx[j], own.tn[j] - sb.tn[j]]);
      if (dep.length) { const w = dep.length / (dep.length + 2); return out(bx + w * dep.reduce((a, v) => a + v[0], 0) / dep.length, bn + w * dep.reduce((a, v) => a + v[1], 0) / dep.length, 'site-annual', own); }
    }
    if (nb) return out(nb.tx[k], nb.tn[k], 'nearby', nb);
    if (sw > 0) return out(bx + sx / (sw + I.c), bn + sn / (sw + I.c), 'area', null);
    return out(bx, bn, 'band', null);
  }
  const pktMonthOfKey = (key) => Number(key.slice(5, 7));
  /* cal(month, dayKey) -> {tx, tn} | null. Returns { adj: [per hour], days: Map(dayKey -> {tx, tn}) } */
  function stretchAdj(tMs, T, cal) {
    const n = tMs.length, adj = new Array(n).fill(0), days = new Map(); const anc = [];
    let i0 = 0;
    for (let i = 1; i <= n; i++) {
      if (i < n && pktDayKey(tMs[i]) === pktDayKey(tMs[i0])) continue;
      const key = pktDayKey(tMs[i0]); const c = cal(pktMonthOfKey(key), key); days.set(key, c);   /* v91.17.73 · the Pakistan day key goes to the callback (the AI local correction is per day) */
      /* an extreme at the first or last hour of the day's span is the edge of a partial day (or a front), not the diurnal
         maximum / minimum: it is not an anchor (it would pin the whole evening to the day's Tmax offset) */
      let imx = -1, imn = -1;
      for (let j = i0; j < i; j++) { if (T[j] == null) continue; if (imx < 0 || T[j] > T[imx]) imx = j; if (imn < 0 || T[j] < T[imn]) imn = j; }
      /* in its place stands the canonical hour of that extreme (minimum 00 UTC = 05 PKT, maximum 09 UTC = 14 PKT, the hours
         the day-card fallback samples) when the day's span holds it; otherwise the day has no such anchor */
      const edge = (j) => j === i0 || j === i - 1;
      const canon = (utcH) => { for (let j = i0; j < i; j++) if (T[j] != null && new Date(tMs[j]).getUTCHours() === utcH) return j; return -1; };
      if (c && imx >= 0) { const pair = []; const jn = edge(imn) ? canon(0) : imn, jx = edge(imx) ? canon(9) : imx;
        if (jn >= 0) pair.push([jn, c.tn]); if (jx >= 0 && jx !== jn) pair.push([jx, c.tx]); pair.sort((a, b) => a[0] - b[0]); anc.push(...pair); }
      i0 = i;
    }
    if (!anc.length) return { adj, days };
    let p = 0;
    for (let h = 0; h < n; h++) {
      while (p < anc.length && anc[p][0] <= h) p++;   /* anc[p-1] is the last anchor at or before h */
      if (p === 0) { adj[h] = anc[0][1]; continue; }
      if (p >= anc.length) { adj[h] = anc[anc.length - 1][1]; continue; }
      const [A, a] = anc[p - 1], [Bi, b] = anc[p];
      if (A === h) { adj[h] = a; continue; }
      const fa = T[A], fb = T[Bi], f = T[h];
      let w; if (fa == null || fb == null || f == null || Math.abs(fb - fa) < 0.05) w = (h - A) / Math.max(1, Bi - A); else w = Math.min(1, Math.max(0, (f - fa) / (fb - fa)));
      adj[h] = a + (b - a) * w;
    }
    return { adj, days };
  }
  const TD_PART = (utcH) => utcH <= 2 ? 'night' : utcH <= 8 ? 'dawn' : utcH <= 14 ? 'day' : utcH <= 20 ? 'dusk' : 'night';
  function dewOffset(zone, elevM, tMs) {
    const C = calibrationOn() ? tcFile() : null; const Z = C && C.zones && C.zones[zone]; const D = Z && Z.dewPoint;
    if (!D || D.design !== 'tdTable' || elevM == null) return null;
    const B = Z.bands || {}; const b = bandOfTc(elevM, B.edgesM || [2000, 2750, 3250, 3750, 4250], B.names || ['<2000', '2000-2750', '2750-3250', '3250-3750', '3750-4250', '>4250']);
    const v = D.bands && D.bands[b] && D.bands[b][pktMonth(tMs) + '|' + TD_PART(new Date(tMs).getUTCHours())];
    return v == null ? null : Math.max(-8, Math.min(8, v));
  }
  /* v91.17.139 · the zones this table calibrates (mountain, hills; plains and coast where synop sites were adopted) */
  const calibratedZone = (zone) => { const C = calibrationOn() ? tcFile() : null; return !!(C && C.zones && C.zones[zone]); };
  const calibrationBasis = (zone) => { const C = tcFile(); const Z = C && C.zones && C.zones[zone]; return Z ? Z.basis : null; };
  const calibrationCredit = (zone) => { const C = tcFile(); const Z = C && C.zones && C.zones[zone]; return label((Z && Z.creditLabel) || (C && C.creditLabel) || 'network'); };
  function calibrationStatus() {
    const C = tcFile();
    if (!C) return { serving: false, error: tcErr };
    return { serving: calibrationOn(), version: C.version, built: C.built, tier: C.tier || 'B', label: label(C.calibrationLabel || 'calibration'),
             credit: Object.fromEntries(Object.keys(C.zones || {}).map(z => [z, calibrationCredit(z)])), zones: Object.fromEntries(Object.entries(C.zones || {}).map(([z, v]) => [z, { basis: v.basis, sites: (v.sites || []).length, dewPoint: v.dewPoint ? v.dewPoint.design : null }])),
             method: C.method, rule: C.rule, off: calibrationOn() ? null : (stationData() ? 'NIGRAAN_ZONE_CORR=0' : 'NIGRAAN_STATION_DATA=0: open-data-only path (the pure zone basis)'),
             ...(internalNames() ? { internal: { source: C.source, n: C.n } } : {}) };
  }

  /* v91.17.70 · the temperature basis for the status route and the provenance blocks: model names per zone, no scores
     (the verification numbers stay in the internal report, station-lake/reports/temp_zone_rank.json) */
  function basisStatus() {
    const Z = zonesFile();
    if (!Z) return { ready: false, error: mzErr, served: 'best_match at the point height everywhere (no zone file)' };
    return { ready: true, version: CORRECTION_VERSION, built: Z.built, method: Z.method, zones: Object.fromEntries(Object.entries(Z.zones || {}).map(([k, z]) => [k, { temperatureModel: z.temperatureModel, horizonFallback: z.horizonFallback || null, blendHours: z.blendHours ?? null, rule: z.rule }])),
             request: Z.request || null, clientBoxes: Z.clientBoxes || null, height: 'the point\'s own height (the provider\'s DEM downscaling); tehsil aggregates at the settlement height', runningCorrection: 'MACH running bias where a trusted MACH station lies within the reach in data/model-zone.json (fleet.mjs)' };
  }
  function status() {
    if (!v69Replay()) return { enabled: false, calibration: calibrationStatus(), temperatureBasis: basisStatus(), loadedAt, error: err };
    return {
      enabled: enabled(), replay: 'ON (NIGRAAN_MOS_V69=1): the v91.17.69 tables, replay only, never a customer path', calibration: calibrationStatus(), temperatureBasis: basisStatus(), table: err ? null : {
        built: T && T.built, window: T && T.window,
        stations: T ? Object.keys(T.stations || {}).length : 0,
        synop_stations: synopStations().length, synop_holdout: synop() ? synop().holdout : null,
        learned: ML ? ML.status() : null,
        band_rows: T ? (T.distilled_table || []).length : 0,
        valid_range: T && T.valid_range, skip_stations: skipList().length,
        uncertainty: T && T.uncertainty,
      },
      loadedAt, error: err,
      method: 'station or height-band mean error by month and part of day (station lake 2025-09 to 2026-08); figures from the table files, not from this code',
      measured: { humidity: T && T.rh ? T.rh.measured : null, plains: T && T.plains ? T.plains.measured : null, frost: T && T.frost ? T.frost.measured : null },
      guards: { near_km: NEAR_KM, near_dz_m: NEAR_DZ, skip_km: SKIP_KM, skip_mae_c: SKIP_MAE,
                band_min_stations: MIN_STATIONS, band_min_hours: MIN_HOURS, cap_c: CAP_C },
      gapOffset: LP ? { serving: enabled() && offsetOn(), decision: LP.serve, built: LP.built, providerLapseAsApplied_c_per_km: LP.providerLapseAsApplied_c_per_km,
                        heldOut: (LP.metrics || []).filter(m => m.split === 'leave one station out').map(m => ({ option: m.option, mae_c: m.mae_c, bias_c: m.bias_c })),
                        rule: LP.offsetFallbackRule, cells: Object.keys(LP.offsetFallback || {}).length } : { serving: false, error: lpErr },
    };
  }

  return { adjust, adjustTable, adjustRh, adjustDaily, status, inDomain, hasSynop, nearestSynop, enabled, setMl, ml: () => ML,
           zoneOfPoint, zoneModel, requestModels, temperatureFamily, basisStatus, zones: zonesFile, reloadZones: loadZones, internalRef, version: CORRECTION_VERSION,
           calibrationOn, calibratedZone, calibrationAt, stretchAdj, dewOffset, calibrationBasis, calibrationCredit, calibrationStatus, pktDayKey, reloadCalibration: loadTc };
}
