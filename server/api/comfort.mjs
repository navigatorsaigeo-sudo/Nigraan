/* == v91.17.283.31 · owner 2.3 · THE COMFORT (DISCOMFORT) INDEX, ONE HOME ===============================================================
   Thom's discomfort index in its Celsius form (Thom 1959; as used by Giles et al. 1990, Int J Biometeorol 34:1-6):
       DI = T - 0.55 (1 - 0.01 RH) (T - 14.5)        T air temperature in deg C, RH relative humidity in %   (DI in deg C)
   Classes (Giles et al. 1990): below 21 no discomfort; 21-24 under half the population feels discomfort; 24-27 over half; 27-29 most;
   29-32 everyone, severe stress; 32 and above state of medical emergency. NIGRAAN level words: Normal / Low / Moderate / High / Severe,
   with the two top Giles classes both Severe (the emergency class kept as its own name).
   Checked 29 Oct 2026 against the page's discomfortIndex() (server/science/modules/028-page-script-53.js): the same formula and units;
   the page's classes merge 29-32 and >= 32. Because DI <= T whenever T > 14.5 C, DI cannot reach 29 (Severe) at an air temperature of
   17-28 C, at any humidity: a Severe comfort level at those temperatures comes from the input, not the formula or the classes. */
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
export const GILES_CLASSES = Object.freeze([
  { min: null, max: 21, name: 'No discomfort', level: 0 }, { min: 21, max: 24, name: 'Under half the population feels discomfort', level: 1 },
  { min: 24, max: 27, name: 'Over half the population feels discomfort', level: 2 }, { min: 27, max: 29, name: 'Most of the population feels discomfort', level: 3 },
  { min: 29, max: 32, name: 'Everyone feels severe stress', level: 4 }, { min: 32, max: null, name: 'State of medical emergency', level: 4 }]);
export const DI_SOURCE = 'Thom (1959) discomfort index, Celsius form; classes Giles et al. (1990)';
export function thomDI(tC, rh) { if (!isN(tC) || !isN(rh) || rh < 0 || rh > 100) return null; return tC - 0.55 * (1 - 0.01 * rh) * (tC - 14.5); }
export function diClass(di) { if (!isN(di)) return null; const c = GILES_CLASSES.find((k) => (k.min == null || di >= k.min) && (k.max == null || di < k.max)); return c ? { ...c, word: ['Normal', 'Low', 'Moderate', 'High', 'Severe'][c.level] } : null; }
/* == v91.17.283.35 · item 5 / audit L2, L3, L9 · THE ONE COMFORT VALUE OF A PLACE AND DAY =========================================
   The layer is "Heat discomfort (DI)": Thom's index measures HEAT discomfort only (Giles et al. 1990 classes start at 21); a low or negative
   DI means no heat discomfort, never "comfortable" and never a cold measure. The day value is the highest hourly DI(T_h, RH_h) of the day,
   computed only when all 24 hours of the PKT day hold both T and RH (completeness.mjs); otherwise "incomplete day" with the reason. A
   missing T or RH stays missing (thomDI refuses it; no humidity clamp, no 0 for a missing value). The class is placed on the FULL-precision
   value (diClass) and only then rounded for display. The tehsil map value (areaheat.mjs -> the issued layer 'comfort'), the place record,
   the AI and the report read this one function; the page computes no comfort value. */
import { checkHours } from './completeness.mjs';
export const COMFORT_NAME = 'Heat discomfort (DI)';
export const COMFORT_NOTE = 'Thom discomfort index: heat discomfort only (Giles et al. 1990); a low or negative value means no heat discomfort, not "comfortable", and says nothing about cold';
export function comfortDays(ps, maxLead = 3) {
  const H = (ps && ps.hours || []).map((h) => ({ time: h.time, di: thomDI(h.tempC, h.rh) }));
  return (ps && ps.days || []).filter((d) => d.lead >= 0 && d.lead <= maxLead).map((d) => { const C = checkHours(H, 'di', d.date, { label: 'discomfort index (temperature and humidity)' });
    if (!C.complete) return { date: d.date, lead: d.lead, assessed: false, why: 'incomplete day: ' + String(C.why).replace(/^not assessed:\s*/, '') };
    const top = C.values.reduce((m, e) => (m == null || e.v > m.v ? e : m), null), k = diClass(top.v);
    return { date: d.date, lead: d.lead, assessed: true, diMax: Math.round(top.v * 10) / 10, at: String(top.h.time).slice(11, 16), level: k.level, word: k.word, giles: k.name }; });
}
