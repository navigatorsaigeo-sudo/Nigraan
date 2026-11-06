/* v91.17.275 · DEW · FINAL DEW-POINT CORRECTION OF THE SERVED CHAIN · ZONE-GATED (data/dew-final.json, scripts/dew275/fit_gate.py)
   Why     the ARCH v275 monthly score found the served tehsil dew point 2-3 C too dry (26 Sep - 14 Oct 2026). Trace (scripts/dew275): every
           provider model's 2 m dew point is dry over Pakistan in this season (synop: ECMWF IFS -2.3..-3.1 C, GFS -5.8..-6.8, JMA / CMA / GEM
           -5..-8); the chain removes part of it in the plains (moist model), nothing in the hills, and in the mountains the moist model
           makes it drier (5 synop stations: raw -2.82 -> served -3.23 C).
   What    served dew point + offset(zone, PKT block), capped at the served temperature; relative humidity from the temperature and the new
           dew point, apparent temperature by Steadman (dAT/de = 0.33 C/hPa, as moist.mjs), then humwind.consistency (wet bulb, the daily
           humidity families of full days, the current block). Temperature is never changed.
   Where   only zones whose every gate line passed (zones[z].applied), only in the calendar months the fit covered (months), only to
           horizonH hours ahead (the archive scored lead days 0-2). 17 Oct 2026: mountain only (+3.21 C, Sep-Oct); plains, hills and coast
           failed (data/dew-final.json says which line).
   Order   the LAST chain stage (after cloudt): every earlier stage keeps the water vapour, so the offset is fitted on, and applied to, the
           final served dew point. The MACH fleet pairs stop at 'synop' and never see it (the live layer moves temperature only).
   Off     NIGRAAN_DEWFIX=0. Light: one lookup and a few multiplies per hour. Operator-only provenance (agn_dewfix). */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rhFromDew, esatHpa, dewPointC } from './psychro.mjs';

const r1 = (v) => Math.round(v * 10) / 10;
const prov = (loc, k, v, rec) => { try { Object.defineProperty(loc, k, { value: v, enumerable: !!rec, configurable: true, writable: true }); } catch (_) {} };

export function createDewFix({ dataDir, consistency = null } = {}) {
  const file = join(dataDir, 'dew-final.json'); let M = null, mt = 0, at = 0, err = null;
  const on = () => process.env.NIGRAAN_DEWFIX !== '0';
  function model() { if (M && Date.now() - at < 30e3) return M; at = Date.now();
    try { if (!existsSync(file)) { M = null; return null; } const t = statSync(file).mtimeMs; if (!M || t !== mt) { M = JSON.parse(readFileSync(file, 'utf8')); mt = t; err = null; } return M; }
    catch (e) { err = e.message; M = null; return null; } }
  const served = (zone) => { const m = model(); const z = m && zone && m.zones && m.zones[zone]; return !!(z && z.applied && Array.isArray(z.offsetsC) && z.offsetsC.length); };
  const anyServed = () => { const m = model(); return !!(m && m.zones && Object.keys(m.zones).some(served)); };
  /* the offset of one valid hour (ms UTC) in a zone; 0 outside the months, past the horizon (nowMs + horizonH) or in a zone not served */
  function offsetOf(zone, ms, nowMs = Date.now()) {
    const m = model(); if (!m || !served(zone)) return 0;
    if (Number.isFinite(m.horizonH) && ms - nowMs > m.horizonH * 3600e3) return 0;
    const pk = new Date(ms + 5 * 3600e3);   /* the Pakistan hour and month (PKT = UTC + 5, no daylight saving) */
    if (Array.isArray(m.months) && !m.months.includes(pk.getUTCMonth() + 1)) return 0;
    const z = m.zones[zone], w = Number(z.blockH) || 24, b = Math.floor(pk.getUTCHours() / w);
    const o = z.offsetsC[Math.min(b, z.offsetsC.length - 1)]; return Number.isFinite(o) ? o : 0;
  }
  /* after the served chain; true when it changed the answer. o.force: tests only (ignores the switch, never the zone gate) */
  function apply(loc, la, lo, o = {}) {
    if (!loc || !loc.hourly || (!on() && !o.force)) return false;
    const zone = o.zone || null;
    if (!served(zone)) { prov(loc, 'agn_dewfix', { applied: false, zone, why: 'not served in this zone (gate)' }, o.record); return false; }
    const m = model(); const H = loc.hourly;
    if (!Array.isArray(H.time) || !Array.isArray(H.temperature_2m) || !(Array.isArray(H.dew_point_2m) || Array.isArray(H.relative_humidity_2m))) return false;
    const off = (loc.utc_offset_seconds || 0) * 1000, now = o.nowMs || Date.now(); let n = 0, sd = 0;
    for (let i = 0; i < H.time.length; i++) {
      const T = H.temperature_2m[i]; if (T == null) continue;
      const before = Array.isArray(H.dew_point_2m) && H.dew_point_2m[i] != null ? Math.min(H.dew_point_2m[i], T)
        : (Array.isArray(H.relative_humidity_2m) && H.relative_humidity_2m[i] != null ? Math.min(dewPointC(T, Math.max(1, H.relative_humidity_2m[i])), T) : null);
      if (before == null || !Number.isFinite(before)) continue;
      const ms = Date.parse(String(H.time[i]).slice(0, 16) + 'Z') - off; const d = offsetOf(zone, ms, now); if (!d) continue;
      const td = Math.min(before + d, T);
      if (Array.isArray(H.apparent_temperature) && H.apparent_temperature[i] != null) H.apparent_temperature[i] = r1(H.apparent_temperature[i] + 0.33 * (esatHpa(td) - esatHpa(before)));   /* Steadman 1994 */
      if (Array.isArray(H.dew_point_2m)) H.dew_point_2m[i] = r1(td);
      if (Array.isArray(H.relative_humidity_2m)) H.relative_humidity_2m[i] = Math.round(rhFromDew(T, td) * 10) / 10;
      if (Array.isArray(H.vapour_pressure_deficit) && H.vapour_pressure_deficit[i] != null) H.vapour_pressure_deficit[i] = Math.round(Math.max(0, esatHpa(T) - esatHpa(td)) / 10 * 100) / 100;
      sd += td - before; n++;
    }
    if (n && consistency) { try { consistency(loc); } catch (_) {} }   /* wet bulb, daily humidity families, current block */
    prov(loc, 'agn_dewfix', { applied: n > 0, zone, version: m.version, hours: n, meanDewChangeC: n ? r1(sd / n) : 0 }, o.record);
    return n > 0;
  }
  function status() { const m = model(); return { on: on(), file: existsSync(file), version: m && m.version, months: m && m.months, horizonH: m && m.horizonH,
    servedZones: m && m.zones ? Object.keys(m.zones).filter(served) : [], error: err }; }
  return { apply, offsetOf, model, status, on, served, anyServed };
}
