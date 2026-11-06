/* The single server-side adapter to the paid weather provider. Browser never sees
   the key. Every outbound call is counted into a quota window and can be forced to
   fail (fault injection) so failover tests exercise the real code path. */
import { nowIso } from './store.mjs';
import { ApiError } from './core.mjs';

export const PROVIDER_ID = 'mach';
export const PROVIDER_LABEL = 'model forecast';   /* v91.17.283.12 (owner 24 Oct 2026): model output is not branded MACH; 'MACH' names AGN's stations and, per value, the live MACH station correction (v91.17.76 had 'MACH forecast') */
const HOSTS = {
  forecast: 'customer-api.open-meteo.com',
  archive: 'customer-archive-api.open-meteo.com',
  previousRuns: 'customer-previous-runs-api.open-meteo.com',
  historicalForecast: 'customer-historical-forecast-api.open-meteo.com',
  /* v91.17.24 · P3-5 · one named model run, frozen into issued reports */
  singleRuns: 'customer-single-runs-api.open-meteo.com',
  ensemble: 'customer-ensemble-api.open-meteo.com',
  satellite: 'customer-satellite-api.open-meteo.com',
  seasonal: 'customer-seasonal-api.open-meteo.com',
  airQuality: 'customer-air-quality-api.open-meteo.com',
  /* ══ v91.17.13 · THE CLAIM IN THIS COMMENT WAS FALSE ═══════════════════
     v91.17.3 and v91.17.4 both asserted that "Open-Meteo publishes no
     commercial geocoding host" and pinned this to the free endpoint on that
     basis. The vendor's geocoding documentation says the opposite: an API key
     is "only required to commercial use to access reserved API resources for
     customers", and "the server URL requires the prefix customer-".
     MEASURED before changing it: customer-geocoding-api.open-meteo.com answers
     HTTP 200 with the paid key and returns the same three rows for "Gulmit" as
     the free host. The host exists, we hold a commercial licence, and every
     other call in this build already honours it.
     A place-name lookup carrying no metered weather data was never the point.
     The licence is the point: a commercial product calling a vendor's free tier
     is using it outside its terms, and the rest of this build refuses to do that
     precisely so that the key can be shown to be in use everywhere. */
  geocoding: 'customer-geocoding-api.open-meteo.com',
  /* v91.17.3 · 2A.1 · GloFAS, for the riverine job on snapped main stems */
  flood: 'customer-flood-api.open-meteo.com',
};
export const ALLOWED_VARIABLES = new Set(['temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature', 'precipitation', 'rain', 'showers', 'snowfall',
  'precipitation_probability', 'weather_code', 'pressure_msl', 'surface_pressure', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
  'shortwave_radiation', 'et0_fao_evapotranspiration', 'vapour_pressure_deficit', 'soil_moisture_0_to_1cm', 'soil_moisture_1_to_3cm', 'soil_moisture_3_to_9cm',
  'soil_moisture_9_to_27cm', 'soil_moisture_27_to_81cm', 'soil_temperature_0cm', 'cape', 'boundary_layer_height', 'visibility', 'uv_index', 'freezing_level_height', 'snow_depth']);

/* ══ v91.17.3 · 1.11 · WHICH REANALYSIS THIS SYSTEM TRUSTS AS TRUTH ═════════
   MEASURED, 18 September 2026, 14 mountain stations, 97,301 paired hours
   (2025-09-01 to 2026-08-21), against the AGN station lake:

     reference          bias      MAE
     ERA5 25 km        -5.93     6.77
     ERA5-Land 9 km    -7.29     7.78     <- WORSE, rejected
     ECMWF IFS 9 km    -4.35     5.05     <- best available reanalysis
     raw forecast      -4.55     5.07

   Two results, one of which contradicts the plan this change came from.

   ERA5-Land was expected to help: 9 km, land-only surface scheme, better
   orography. It is worse than ERA5 at 12 of 14 stations and 1.4 °C worse on
   average. It is not adopted, and that is a measurement, not a preference.

   ECMWF IFS at 9 km beats ERA5 at 14 of 14 stations, median improvement
   1.77 °C MAE. It is adopted as the reference for every RECENT window: bias
   estimation, station verification, ensemble verification and the ensemble
   bias adjustment.

   ERA5 REMAINS the reference for the 1991-2020 and 1993-2016 climatologies,
   because the IFS archive begins in 2017 and a climatology cannot be built
   from a record shorter than itself. The cut is made by start date, here, in
   one place, so no call site can drift from it.

   THE FAMILY CAVEAT. ECMWF IFS and the ECMWF ensemble this system runs share a
   model family, so an adjustment measured against IFS is less independent than
   one measured against ERA5, and the MAE against it is smaller partly because
   the two agree with each other. Measured on the live bias job the median
   daily-maximum MAE against the reference fell from 1.4 °C to 0.4 °C and the
   tehsils needing an adjustment fell from 352 to 261. That is NOT a 1 °C
   accuracy gain. The accuracy claim rests on the STATION test alone, where IFS
   is 1.77 °C closer to independent ground observation than ERA5.

   Note what this does NOT change: the raw forecast is still better than ERA5
   and statistically level with IFS in these valleys, which is why the station
   MOS overrides the reanalysis inside its own domain. A better reference
   improves the correction OUTSIDE that domain; it does not replace it. */
export const REANALYSIS_IFS_FROM = '2017-01-01';
export function reanalysisModel(startDate) {
  const s = String(startDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'ecmwf_ifs';   /* undated calls are recent */
  return s >= REANALYSIS_IFS_FROM ? 'ecmwf_ifs' : 'era5';
}
export const REANALYSIS_BASIS = {
  measuredOn: '2026-09-18',
  sample: '14 mountain stations, 97,301 paired hours, 2025-09-01 to 2026-08-21',
  results: { era5: { bias: -5.93, mae: 6.77 }, era5_land: { bias: -7.29, mae: 7.78 },
             ecmwf_ifs: { bias: -4.35, mae: 5.05 }, rawForecast: { bias: -4.55, mae: 5.07 } },
  adopted: 'ecmwf_ifs for windows starting on or after ' + REANALYSIS_IFS_FROM,
  rejected: 'era5_land — worse than era5 at 12 of 14 stations',
  climatology: 'era5 remains the only reference for 1991-2020 and 1993-2016, because the IFS archive begins in 2017',
};

/* v91.17.228 · audit S-36 · ONE WEIGHT for a provider call, used by the browser proxy (server.mjs) and the backend (call() below). The
   provider counts a call as several when it asks for more than 10 variables or more than 2 weeks per location; a multi-model call
   (models=a,b,c) returns each variable once per model, so the variables are counted per model. Neither path counted models before,
   so the daily budget read low on the multi-model sweeps. get(name) returns the parameter (string, array or null); locations, when
   given, replaces the count of latitudes. */
/* v91.17.261 · ENSEMBLE MEMBERS ARE WEIGHED. The provider counts every ensemble member as a variable (Open-Meteo
   ForecastapiController: nVariables = parameters x the members of the models asked; calculateQueryWeight: per location
   max(1, nVariables/10 x max(1, days/14))). This counted one /v1/ensemble precipitation request for 51 ECMWF members as 1 per
   location, not 5.1: on 14 Oct the ledger booked the ensemble archive at 3,676 where the provider's rule gives ~11,100 (the script's
   own count). Members per ensemble model, from the provider's model tables (countEnsembleMember); an *_ensemble_mean model is 1. */
export const ENS_MEMBERS = { ecmwf_ifs025: 51, ecmwf_ifs025_ensemble: 51, ecmwf_aifs025: 51, ecmwf_aifs025_ensemble: 51, ecmwf_wam025_ensemble: 51,
  ncep_gefs025: 31, gfs025: 31, ncep_gefs05: 31, gfs05: 31, ncep_gefs_seamless: 31, gfs_seamless: 31, ncep_aigefs025: 31, ncep_gefswave025: 31,
  icon_seamless: 40, icon_seamless_eps: 40, icon_global: 40, icon_global_eps: 40, icon_eu: 40, icon_eu_eps: 40, icon_d2: 20, icon_d2_eps: 20,
  gem_global: 21, gem_global_ensemble: 21, bom_access_global_ensemble: 18, ukmo_global_ensemble_20km: 18, ukmo_uk_ensemble_2km: 3,
  google_weathernext2_ensemble: 64, meteoswiss_icon_ch1: 11, meteoswiss_icon_ch1_ensemble: 11, meteoswiss_icon_ch2: 21, meteoswiss_icon_ch2_ensemble: 21 };
export function weightOf(get, locations = null, { ensemble = false } = {}) {
  const s = (k) => { const v = get(k); return v == null ? '' : Array.isArray(v) ? v.join(',') : String(v); };
  const list = (k) => s(k).split(',').map((x) => x.trim()).filter(Boolean);
  const n = (k) => list(k).length;
  const locs = Number.isFinite(locations) && locations > 0 ? locations : (n('latitude') || 1);
  const vars = ['hourly', 'daily', 'minutely_15', 'current', 'weekly', 'monthly'].reduce((a, k) => a + n(k), 0) || 1;
  const models = ensemble ? (list('models').reduce((a, m) => a + (/_ensemble_mean$/.test(m) ? 1 : (ENS_MEMBERS[m] || 1)), 0) || 1) : (n('models') || 1);
  const s0 = s('start_date'), e0 = s('end_date'), h0 = s('start_hour'), h1 = s('end_hour');
  const days = (s0 && e0) ? Math.max(1, (Date.parse(e0) - Date.parse(s0)) / 864e5 + 1)
    : (h0 && h1) ? Math.max(1 / 24, (Date.parse(h1 + 'Z') - Date.parse(h0 + 'Z')) / 864e5 + 1 / 24)   /* v91.17.261 · an hour window counts its own length */
    : Number(s('forecast_days') || 7) + Number(s('past_days') || 0);
  const w = locs * Math.max(1, (vars * models) / 10 * Math.max(1, days / 14));   /* v91.17.261 · the provider's form (was max(1,v/10) x max(1,d/14)) */
  return Number.isFinite(w) && w > 0 ? w : 1;   /* v91.17.34 · AUDIT A5 · a non-numeric forecast_days made the weight NaN and zeroed the day's counter */
}

export function createProvider(store) {
  const key = () => process.env.MACH_API_KEY || process.env.OPEN_METEO_API_KEY || '';
  const fault = { enabled: false, mode: null, until: 0 };
  const dailyLimit = Number(process.env.MACH_DAILY_CALL_LIMIT || 0) || null;

  function windowFor(d = new Date()) {
    const day = d.toISOString().slice(0, 10);
    let w = store.find('quotaWindows', x => x.providerId === PROVIDER_ID && x.day === day);
    if (!w) { w = { providerId: PROVIDER_ID, day, calls: 0, locations: 0, failures: 0, quotaErrors: 0, lastCallAt: null, lastStatus: null, reset: false }; store.all('quotaWindows').push(w); }
    return w;
  }

  async function call(kind, path, params, { locations = 1, timeoutMs = 60000 } = {}) {
    if (!key()) throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'The paid provider key is not configured on this server.', { retryable: false });
    if (fault.enabled && Date.now() < fault.until) {
      const w = windowFor(); w.failures++; w.lastStatus = 'fault-injected'; store.saveSoon();
      throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'Provider unavailable (fault injection: ' + fault.mode + ').', { retryable: true, details: { faultInjected: true } });
    }
    const w = windowFor();
    /* v91.17.16 · SEC-09 · this compared the RAW call count while overBudget()
       below compares WEIGHTED calls, so one MACH_DAILY_CALL_LIMIT meant two
       different budgets depending on which path spent it. Weighted is what the
       vendor bills, so weighted is what both use, and the two now agree. */
    /* v91.17.126 · system audit S-01 · with no MACH_DAILY_CALL_LIMIT set nothing ever refused or warned. A warning level (default
       2,000,000 weighted calls a day, above the 1.79 M peak measured over 16 days; NIGRAAN_CALL_WARN overrides) now logs once a day and
       is flagged on the window, so a runaway loop is seen the same day. The hard limit stays the owner's setting (the plan's quota). */
    { const used = (w.backendWeighted || 0) + (w.browserWeighted || 0), warnAt = Number(process.env.NIGRAAN_CALL_WARN || 2e6);
      if (warnAt > 0 && used >= warnAt && !w.warned) { w.warned = new Date().toISOString(); console.error('  provider: WARNING ' + Math.round(used) + ' weighted calls today (warning level ' + warnAt + '; set MACH_DAILY_CALL_LIMIT to the plan quota to cap)'); store.saveSoon(); } }
    /* v91.17.283.31 · owner 29 Oct 2026: overage is billed and allowed, so MACH_DAILY_CALL_LIMIT no longer refuses a call; it is reported
       (overDailyLimit()). The provider's own rate limits stay: its 429 answer below. */
    if (dailyLimit && ((w.backendWeighted || 0) + (w.browserWeighted || 0)) >= dailyLimit && !w.overLimitNoted) { w.overLimitNoted = nowIso(); store.saveSoon(); }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
    /* v91.17.13 · geocoding is a commercial call like every other. The earlier
       exemption rested on a host that was said not to exist and does. */
    qs.set('apikey', key());
    const url = 'https://' + HOSTS[kind] + path + '?' + qs.toString();
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    w.calls++; w.locations += locations; w.lastCallAt = nowIso();
    /* the provider's own weighting (weightOf: >10 variables per model or >2 weeks per location costs more) */
    const w1 = weightOf((k) => params[k], locations, { ensemble: kind === 'ensemble' });
    w.backendWeighted = Math.round((w.backendWeighted || 0) + w1);
    /* v91.17.270 · OPS A8 · who spends the backend's share: the calling module (from the stack, taken before the first await) goes with
       the call to the per-caller daily record (server.mjs QBR, data/quota-callers/), as the proxy's calls already do */
    const stk = callHooks.onCall ? new Error().stack : null; let okCall = false;
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'nigraan-local-backend/91.17' } });
      const text = await r.text();
      let body = null; try { body = JSON.parse(text); } catch { body = { reason: text.slice(0, 300) }; }
      w.lastStatus = r.status; store.saveSoon();
      if (!r.ok) {
        const reason = (body && (body.reason || body.error)) || ('HTTP ' + r.status);
        if (r.status === 429 || /(minutely|hourly|daily|monthly)\s+(api\s+)?(request\s+)?limit|quota/i.test(String(reason))) { w.quotaErrors++;   /* v91.17.68 · only a real quota message is a quota error; a parameter-range message with the word "limit" was dead-lettering the sweep (B21) */ throw new ApiError(429, 'PROVIDER_QUOTA_EXHAUSTED', 'Provider quota or rate limit: ' + reason, { retryable: r.status === 429 && !/daily/i.test(String(reason)) }); }
        w.failures++;
        throw new ApiError(r.status >= 500 ? 503 : 422, r.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'CONTRACT_INVALID', 'Provider rejected the request: ' + reason, { retryable: r.status >= 500 });
      }
      okCall = true; return body;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      w.failures++; w.lastStatus = 'transport-error'; store.saveSoon();
      throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'Provider transport failure: ' + (e.name === 'AbortError' ? 'timeout' : e.message), { retryable: true });
    } finally { clearTimeout(t); if (stk) { try { callHooks.onCall({ kind, path, weighted: w1, locations, ok: okCall, caller: callerOf(stk) }); } catch (_) {} } }
  }
  const callHooks = { onCall: null };
  /* the first frame outside this file: 'national.mjs', 'outlook.mjs', ... (a module name only; no path, no line) */
  function callerOf(stack) { for (const ln of String(stack).split('\n').slice(1)) { const m = /([\w.-]+\.m?js):\d+:\d+\)?\s*$/.exec(ln); if (m && m[1] !== 'provider.mjs' && m[1] !== 'callbudget.mjs') return m[1]; } return '?'; }   /* v283.53 C: the pacing wrapper is not the caller */

  return {
    hooks: callHooks,   /* v91.17.270 · OPS A8 · server.mjs sets hooks.onCall */
    /* the proxy counts browser traffic here, so the daily limit sees all paid spend */
    noteProxyCall(weighted = 1, ok = true) {
      const w = windowFor();
      w.browserCalls = (w.browserCalls || 0) + 1;
      w.browserWeighted = Math.round((w.browserWeighted || 0) + weighted);
      w.lastCallAt = nowIso(); if (!ok) w.failures++;
      store.saveSoon();
      return w;
    },
    /* v91.17.283.31 · overage allowed: nothing is held back for the budget any more (callers that skipped work when over budget run) */
    overBudget() { return false; },
    overDailyLimit() {
      if (!dailyLimit) return false;
      const w = windowFor();
      return ((w.backendWeighted || 0) + (w.browserWeighted || 0)) >= dailyLimit;
    },
    id: PROVIDER_ID, label: PROVIDER_LABEL, call, windowFor, fault, dailyLimit,
    configured: () => !!key(), keySource: () => process.env.MACH_KEY_SOURCE || (key() ? 'environment' : null),
    hosts: HOSTS,
  };
}

/* Build per-lead values from an hourly block that starts at local midnight (UTC here). */
/* v91.17.68 · a multi-location reply aligned to the batch that asked for it (audit B10). The provider can answer a
   batch with a single object, a shorter array, or an array in a different order; `body[i]` then pairs one unit's data
   with another unit. The reply row is the unit's when it is the nearest row to that unit's coordinate: the grid the
   provider snapped to is whatever the model's grid is (0.05° satellite, 0.125° ICON, 0.25° IFS, 0.4° ENS), so no fixed
   cell size is assumed — a fixed 0.06° here rejected 35 mountain tehsils on the 0.125° grid and the sunshine check
   reported them failed. Order is kept when every row is nearest to the unit at its own index; otherwise rows are
   matched greedily by distance, a row more than 1° from every unit pairs with none, and an unmatched unit is null,
   which every caller already treats as a failed unit. */
export function alignBatch(body, batch, coordOf = (u) => [u.lat, u.lon]) {
  const arr = Array.isArray(body) ? body : (body ? [body] : []);
  if (!Array.isArray(batch)) return arr;
  const dist = (r, u) => { const [la, lo] = coordOf(u) || []; if (!r || la == null || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return Infinity; return Math.abs(r.latitude - la) + Math.abs(r.longitude - lo); };
  /* v91.17.77 · SCI: units sharing a grid cell tie on distance; when the call sent a height and the provider echoes it,
     the row is the unit's only if the echoed height is the unit's (Palas 1,816 m read the 767 m row before this). */
  const elevOf = (u) => { const e = u && (u.elevM != null ? u.elevM : (u.elevation != null ? u.elevation : u.elev)); return Number.isFinite(Number(e)) && e !== '' && e != null ? Number(e) : null; };
  /* v91.17.155 · the height test applies only when the call sent the heights (the reply then echoes them). A call without heights
     (weeks/season, satellite radiation, air quality) gets the model's own grid height back, which never equals the unit's: every
     row failed the test and 435 of 576 tehsils were dropped from the weeks/season outlook and 436 from the sunshine ratio. */
  const echoed = arr.filter((r, i) => { const u = batch && batch[i], e = elevOf(u); return r && e != null && r.elevation != null && Math.abs(r.elevation - e) <= 1; }).length;
  const useH = Array.isArray(batch) && echoed >= Math.ceil(0.5 * Math.min(arr.length, batch.length));
  const hOk = (r, u) => { if (!useH) return true; const e = elevOf(u); return !r || e == null || r.elevation == null || Math.abs(r.elevation - e) <= 1; };
  if (arr.length === batch.length) {
    const ok = batch.every((u, i) => { if (!hOk(arr[i], u)) return false; const d = dist(arr[i], u); if (!(d < 1)) return false; for (let j = 0; j < arr.length; j++) if (j !== i && hOk(arr[j], u) && dist(arr[j], u) + 1e-9 < d) return false; return true; });
    if (ok) return arr;
  }
  const used = new Set();
  return batch.map((u) => { let best = null, bd = Infinity; arr.forEach((r, j) => { if (used.has(j) || !hOk(r, u)) return; const d = dist(r, u); if (d < bd) { bd = d; best = j; } }); if (best == null || !(bd < 1)) return null; used.add(best); return arr[best]; });
}

/* v91.17.125 · external audit A03 · a lead is ELAPSED TIME from the base hour, not a row position. The old version took the row nearest
   the base and stepped by row index, so with rows at 00:00 and 02:00 lead +1 returned 02:00 at 100 % coverage, duplicate and
   out-of-order timestamps were accepted, and a base three days outside the series snapped to the nearest row. Now: every row is
   indexed by its parsed UTC time; a series with duplicate or decreasing times is refused (coverage 0, timeError set); the base hour
   must be in the series; each lead looks up base + L hours exactly and is missing (null, counted) when that hour is absent. */
export function leadsFromHourly(hourly, variables, leadHours, baseMs) {
  const times = (hourly && hourly.time) || [];
  const H = 3600e3, base = Math.floor(Number(baseMs) / H) * H;
  const at = new Map(); let timeError = null, prev = -Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = String(times[i]), ms = Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(t) ? t : t + 'Z');
    if (!Number.isFinite(ms)) { timeError = timeError || 'unparseable time at row ' + i; continue; }
    if (at.has(ms)) { timeError = timeError || 'duplicate time ' + times[i]; continue; }
    if (ms < prev) timeError = timeError || 'times out of order at row ' + i;
    prev = ms; at.set(ms, i);
  }
  const usable = !timeError && at.has(base);
  const leads = {}; let present = 0, expected = 0;
  for (const L of leadHours) {
    const ms = base + Number(L) * H, i = usable ? at.get(ms) : undefined;
    const row = { validTime: i != null ? new Date(ms).toISOString().slice(0, 16) + ':00Z' : null };
    for (const v of variables) { expected++; const val = (i != null && hourly && hourly[v]) ? hourly[v][i] : undefined; const ok = typeof val === 'number' && Number.isFinite(val); row[v] = ok ? val : null; if (ok) present++; }
    leads[String(L)] = row;
  }
  const maxLead = Math.max(0, ...leadHours.map(Number));
  const trimmed = { time: [] }; for (const v of variables) trimmed[v] = [];
  for (let h = 0; h <= maxLead; h++) { const ms = base + h * H, i = usable ? at.get(ms) : undefined; trimmed.time.push(new Date(ms).toISOString().slice(0, 16) + ':00Z');
    for (const v of variables) { const val = (i != null && hourly && hourly[v]) ? hourly[v][i] : undefined; trimmed[v].push(typeof val === 'number' && Number.isFinite(val) ? val : null); } }
  return { leads, hourly: trimmed, coverage: expected ? Math.round(1000 * present / expected) / 10 : 0, validTime: usable ? new Date(base).toISOString().slice(0, 16) + ':00Z' : null, timeError };
}
