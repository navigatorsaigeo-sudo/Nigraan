/* ════════════════════════════════════════════════════════════════════════════
   MEASURED MODEL BIAS AT PAKISTANI STATIONS.

   v91.17.10.

   WHAT THIS IS. 41 NOAA GSOD stations, 2024-01-01 to 2025-08-24, compared day
   for day against the same forecast model this build reads, requested at each
   station's own coordinate and elevation. Both sides are put on UTC days,
   because GSOD extrema are UTC-day summaries and asking the model for local
   days would fold a five-hour offset into the answer and call it model error.

   WHY IT EXISTS. The conditions path reads a model whose cells are 11 to 15 km
   across. Measured on this build, F-6 and F-8 in Islamabad - 6 km apart, same
   city, same elevation - differ by 3.5 C purely because they fall either side of
   a cell boundary. No urban-heat term fixes that; it is the base field that is
   wrong, and the only thing that corrects a base field is observations.

   WHAT IT FOUND. Nationally the model runs 1.24 C COLD on daily maximum. Daily
   minimum averages to near zero nationally (-0.04 C) and that average hides the
   real structure: the northern mountain stations are 4 to 6 C cold on maximum
   (Skardu -6.25, Chitral -5.28, Gilgit -4.26) while the Makran coast is 2 to 4 C
   WARM on minimum (Jiwani +3.98, Gwadar +2.49). A single national number applied
   everywhere would make the coast worse.

   WHAT IT IS NOT. These are DAILY minimum and maximum biases. They do not apply
   to an instantaneous reading, and this module never returns a correction for
   one: a daily-maximum bias added to a 03:00 temperature is not a correction,
   it is a second error. Surfaces that consume daily extrema - the outlook, the
   per-day hazard inputs - are what this is for.

   COORDINATE QUALITY GOVERNS MEMBERSHIP. Only stations whose stated elevation is
   reproduced by the terrain at their stated coordinate are used. Ten failed that
   test, and Sakrand passed it while being a full degree of latitude out of
   position, which is the test's blind spot in flat country. All eleven are
   excluded and named in the payload rather than quietly dropped.
   ════════════════════════════════════════════════════════════════════════════ */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stationData, internalNames, label } from './refmode.mjs';

/* v91.17.71 · DATA USE vs NAMING (refmode.mjs). The bias at a point is a derived correction and is served by default
   (stationData(); NIGRAAN_STATION_DATA=0 refuses it). What stays internal (internalNames(), NIGRAAN_INTERNAL_REF=1):
   the per-station verification figures (each station's bias, error and day count: station-measured skill), the national
   error figures and the table itself; the source is credited generically (label('synopNetwork')), never by name. */

const R_EARTH_KM = 111.19;

export function createObsBias(app) {
  const dir = (app && app.dataDir) || join(process.cwd(), 'data');
  const path = join(dir, 'obs', 'station_bias.json');

  let TABLE = null, why = null;
  try {
    if (!existsSync(path)) throw new Error('station_bias.json has not been built');
    TABLE = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) { why = e.message; }

  const stations = () => (TABLE && Array.isArray(TABLE.stations)) ? TABLE.stations : [];

  const km = (a, b, c, d) =>
    R_EARTH_KM * Math.hypot(a - c, (b - d) * Math.cos(((a + c) / 2) * Math.PI / 180));

  /* A bias field from 41 points over 880,000 km2 is sparse, and pretending
     otherwise is the failure mode here. The correction is inverse-distance
     weighted over the nearest few stations, it is REFUSED beyond 250 km, and it
     carries the distance to its nearest station so a caller can see how much of
     an extrapolation it is holding. Elevation enters as a penalty: a station
     1,500 m below a point says little about that point, however close it is. */
  function pointBias(lat, lon, elevM, opts) {
    const o = opts || {};
    const maxKm = Number(o.maxKm || 250);
    const k = Math.max(1, Math.min(8, Number(o.k || 4)));
    if (!TABLE) return { ok: false, why: why || 'no bias table', ready: false };
    if (!stationData()) return { ok: false, ready: false, why: 'station data is off on this install (NIGRAAN_STATION_DATA=0)' };
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)))
      return { ok: false, why: 'a bias needs a point on the Earth' };

    const near = stations()
      .map((s) => {
        const d = km(Number(lat), Number(lon), s.lat, s.lon);
        const dz = (Number.isFinite(Number(elevM)) && Number.isFinite(s.elev_m))
          ? Math.abs(Number(elevM) - s.elev_m) : null;
        return { s, d, dz };
      })
      .filter((x) => x.d <= maxKm)
      .sort((a, b) => a.d - b.d)
      .slice(0, k);

    if (!near.length) {
      return { ok: false, ready: true,
        why: 'no station within ' + maxKm + ' km carries a measured bias for this point, so none is applied',
        nearestKm: stations().length
          ? Math.round(Math.min(...stations().map((s) => km(Number(lat), Number(lon), s.lat, s.lon))))
          : null };
    }

    let wsum = 0, tmin = 0, tminW = 0, tmax = 0, tmaxW = 0;
    for (const x of near) {
      /* distance in km, plus 1 km of penalty for every 10 m of elevation
         difference - the lapse rate is the dominant error term in this terrain */
      const eff = x.d + (x.dz == null ? 0 : x.dz / 10);
      const w = 1 / Math.max(1, eff * eff);
      wsum += w;
      if (x.s.tmin_bias_c != null) { tmin += w * x.s.tmin_bias_c; tminW += w; }   /* v91.17.68 · a null bias is not 0 with its weight kept (audit B8) */
      if (x.s.tmax_bias_c != null) { tmax += w * x.s.tmax_bias_c; tmaxW += w; }
    }
    const nearest = near[0];
    const named = internalNames();
    return {
      ok: true, ready: true,
      tminBiasC: tminW > 0 ? Math.round((tmin / tminW) * 100) / 100 : null,
      tmaxBiasC: tmaxW ? Math.round((tmax / tmaxW) * 100) / 100 : null,
      appliesTo: 'daily minimum and daily maximum temperature only; never an instantaneous reading',
      sign: 'positive means the MODEL reads high against the stations, so subtract it from a model value',
      nearestKm: Math.round(nearest.d),
      nearestElevDiffM: nearest.dz == null ? null : Math.round(nearest.dz),
      stationsUsed: near.length,
      ...(named ? { nearestStation: nearest.s.name, usedStations: near.map((x) => ({ name: x.s.name, km: Math.round(x.d),
        elevDiffM: x.dz == null ? null : Math.round(x.dz),
        tminBiasC: x.s.tmin_bias_c, tmaxBiasC: x.s.tmax_bias_c, days: x.s.n_days })) } : {}),
      /* said plainly rather than implied by a number: 41 stations is thin */
      confidence: nearest.d <= 60 && (nearest.dz == null || nearest.dz <= 300) ? 'station-supported'
        : (nearest.d <= 150 ? 'interpolated between distant stations'
          : 'extrapolated; the nearest station is over 150 km away'),
      basis: named ? TABLE.source : 'daily extremes of ' + label('synopNetwork') + ' against the forecast model at each station\u2019s coordinate and height; ' + label('calibration') + ' (tier B)',
      tier: 'B',
    };
  }

  function status() {
    const s = stations();
    const mean = (f) => {
      const v = s.map(f).filter((x) => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
    };
    if (!internalNames()) return { ready: !!TABLE && stationData(), why: !TABLE ? why : (stationData() ? null : 'station data is off on this install (NIGRAAN_STATION_DATA=0)'), built: TABLE && TABLE.built,
      source: label('synopNetwork'), stations: s.length, use: 'a daily minimum and maximum bias at a point (GET /api/obs/bias/point), ' + label('calibration') + ' (tier B)',
      internalOnly: ['per-station figures', 'national error figures', 'the table'] };
    return {
      ready: !!TABLE, why: TABLE ? null : why,
      built: TABLE && TABLE.built, source: TABLE && TABLE.source,
      stations: s.length,
      excludedForCoordinateQuality: TABLE ? TABLE.stations_excluded_for_coordinate_quality : [],
      coordinateNote: TABLE && TABLE.note,
      nationalTminBiasC: mean((x) => x.tmin_bias_c),
      nationalTmaxBiasC: mean((x) => x.tmax_bias_c),
      nationalTminMaeC: mean((x) => x.tmin_mae_c),
      nationalTmaxMaeC: mean((x) => x.tmax_mae_c),
      headline: 'the model runs cold on daily maximum nationally; the per-station spread is larger than '
              + 'the national mean and is what a correction must use',
    };
  }

  return { status, pointBias, table: () => (internalNames() ? TABLE : null) };
}
