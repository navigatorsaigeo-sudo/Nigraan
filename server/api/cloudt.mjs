/* v91.17.273 · CLOUD / DRY-DAY TEMPERATURE DROP · FINAL CORRECTION OF THE SERVED TEMPERATURE BY THE FORECAST CLOUD · ZONE-GATED.
   Owner observation (6 Oct 2026): cloud on a dry day drops the temperature, more at altitude, summer and winter differ. The question was
   whether the SERVED chain misses it. nig/ds2/cloudt_signal.py (_ds2 here) measured the served residual obs - served against the forecast
   cloud: in the mountains the served-arm replay is too warm under cloud by day, -1.04 C per unit of cloud x sun-elevation sine (90 % CI
   -1.18..-0.89; JJA -1.60), plains / coast / hills show no consistent signal on the honest lines.
   The correction (fitted, nothing typed; _ds2/cloudt_fit.py), per cell zone | season | day/night:
        T_served + b_cell x (x - mu_cell),   x = cloud x sin(sun elevation) by day, cloud by night (forecast cloud 0..1)
   mean-preserving in its cell (the chain's bias layers keep the bias). It is served ONLY in a zone listed in data/cloudt.json servedZones,
   listed only when every gate line passed (v270/v271 gate: held-out window 1 lower bound > 0, window 2 >= 0, no month worse beyond doubt,
   hot days and cold nights not worse). 17 Oct 2026: NO zone passed (mountain window 1 +0.003 C, window 2 -0.002 / -0.031 C): servedZones
   is empty and this stage changes nothing. NIGRAAN_CLOUDT=0 switches it off everywhere; on by default for passing zones only.
   Inputs: the answer's own hourly cloud_cover and time; missing -> the answer is left as it is. Light: one sun position and one multiply
   per hour. Operator-only provenance (agn_cloudt). */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const D2R = Math.PI / 180;
const SEASON = ['DJF', 'DJF', 'MAM', 'MAM', 'MAM', 'JJA', 'JJA', 'JJA', 'SON', 'SON', 'SON', 'DJF'];   // by UTC month index 0..11
/* NOAA solar position (the same formula as the fit, _ds2/cloudt_pairs.py solar): cosine of the zenith angle, t in ms UTC */
export function cosZenith(ms, lat, lon) {
  const d = new Date(ms), y0 = Date.UTC(d.getUTCFullYear(), 0, 1), doy = Math.floor((ms - y0) / 864e5) + 1;
  const hr = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600, g = 2 * Math.PI / 365 * (doy - 1 + (hr - 12) / 24);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = ((hr * 60 + eot + 4 * lon) / 4 - 180) * D2R, la = lat * D2R;
  return Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)));
}
/* the term and cell of one hour: x and 'SEASON|day|night' (the hour's stamp is taken at mid-hour, as the fit's hour-ending pairs) */
export function termOf(ms, lat, lon, cloudPct) {
  if (cloudPct == null || !Number.isFinite(cloudPct)) return null;
  const c = Math.min(1, Math.max(0, cloudPct / 100)), cz = cosZenith(ms - 1800e3, lat, lon), day = cz > 0;
  return { x: day ? c * cz : c, cell: SEASON[new Date(ms).getUTCMonth()] + '|' + (day ? 'day' : 'night') };
}
const prov = (loc, k, v, rec) => { try { Object.defineProperty(loc, k, { value: v, enumerable: !!rec, configurable: true, writable: true }); } catch (_) {} };

export function createCloudT({ dataDir } = {}) {
  const file = join(dataDir, 'cloudt.json'); let M = null, mt = 0, at = 0, err = null;
  const on = () => process.env.NIGRAAN_CLOUDT !== '0';
  function model() { if (M && Date.now() - at < 30e3) return M; at = Date.now();
    try { if (!existsSync(file)) { M = null; return null; } const t = statSync(file).mtimeMs; if (!M || t !== mt) { M = JSON.parse(readFileSync(file, 'utf8')); mt = t; err = null; } return M; }
    catch (e) { err = e.message; return null; } }
  const served = (zone) => { const m = model(); return !!(m && zone && Array.isArray(m.servedZones) && m.servedZones.includes(zone)); };
  /* the correction of one hour (tests; apply() runs the same) */
  function deltaOf(zone, ms, lat, lon, cloudPct) {
    const m = model(); const t = termOf(ms, lat, lon, cloudPct); if (!m || !t) return 0;
    const C = m.cells && m.cells[zone + '|' + t.cell]; return C ? C.b * (t.x - C.mu) : 0;
  }
  /* after the served chain; true when it changed the answer. o.force: tests only (ignores the switch and the zone gate) */
  function apply(loc, la, lo, o = {}) {
    if (!loc || !loc.hourly || (!on() && !o.force)) return false;
    const zone = o.zone || null;
    if (!o.force && !served(zone)) { prov(loc, 'agn_cloudt', { applied: false, zone, why: 'not served in this zone (gate)' }, o.record); return false; }
    const m = model(); const H = loc.hourly; if (!m || !Array.isArray(H.time) || !Array.isArray(H.temperature_2m)) return false;
    if (!Array.isArray(H.cloud_cover)) { prov(loc, 'agn_cloudt', { applied: false, zone, why: 'inputs missing: cloud_cover' }, o.record); return false; }
    const off = (loc.utc_offset_seconds || 0) * 1000; let n = 0; const out = H.temperature_2m.slice();
    for (let i = 0; i < out.length; i++) {
      const t = out[i]; if (t == null) continue;
      const ms = Date.parse(String(H.time[i]).slice(0, 16) + 'Z') - off; const d = deltaOf(zone, ms, la, lo, H.cloud_cover[i]);
      if (d && Number.isFinite(d)) { out[i] = Math.round((t + d) * 10) / 10; n++; }
    }
    H.temperature_2m = out;
    if (Array.isArray(H.dew_point_2m)) H.dew_point_2m = H.dew_point_2m.map((v, i) => (v != null && out[i] != null && v > out[i] ? out[i] : v));
    prov(loc, 'agn_cloudt', { applied: n > 0, zone, version: m.version, hours: n }, o.record);
    return n > 0;
  }
  function status() { const m = model(); return { on: on(), file: existsSync(file), version: m && m.version, servedZones: m && m.servedZones, error: err }; }
  return { apply, deltaOf, model, status, on, served };
}
