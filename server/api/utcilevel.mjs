/* == v91.17.283.28 · S5 / S6 · ONE HEAT AND COLD LEVEL OF A UTCI VALUE ===============================================================
   The level words are the one customer scale (data/hazard-scale.json screeningCuts: Normal / Low / Moderate / High / Severe). A UTCI in
   shade is placed on it by the AGN UTCI maps (utci.mjs utciAgnScore for heat, utciColdScore for cold: the engine's agnUtciAgnScore /
   agnUtciColdScore, one point per published UTCI stress class). The tehsil heat (areaheat.mjs), the place record's hours and days
   (pointstate.mjs) and the site levels (sitelevels.mjs) all read these two functions. The UTCI category name (Blazejczyk et al. 2013) is
   served beside the level, labelled as the UTCI category, never as a level word. */
import { utciAgnScore, utciColdScore, utciClass } from './utci.mjs';
import { levelOfScreeningScore } from './scalecuts.mjs';
import { readFileSync } from 'node:fs';
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
export const UTCI_CATEGORY_LABEL = 'UTCI category (Blazejczyk et al. 2013)';
function cell(u, f) { if (!isN(u)) return { score: null, level: null, word: null, utciCategory: null };
  const s = f(u), sc = isN(s) ? Math.round(s) : null, L = levelOfScreeningScore(sc); return { score: sc, level: isN(L) ? L : null, word: isN(L) ? WORDS[L] : null, utciCategory: utciClass(u) || null }; }
/* v91.17.283.31 · owner (29 Oct) · THE HEAT LEVEL OF A UTCI MIRRORS THE COLD ONE, FROM THE THRESHOLDS REGISTER (row utci.heatLevels: Low 26 to
   32 "moderate heat stress", Moderate 32 to 38, High 38 to 46, Severe 46 and above). Until now UTCI 26-32 (moderate heat stress) sat at Normal.
   Low is a condition ("moderate heat stress"), never a hazard and never an alert; the AGN heat-map score stays beside it (diagnostic). */
let HL = null;
function regRow(id) { try { const R = JSON.parse(readFileSync(new URL('../../data/thresholds-register.json', import.meta.url), 'utf8')); const rows = Array.isArray(R) ? R : R.rows || []; return rows.find((r) => r.id === id) || null; } catch (_) { return null; } }
export function heatLevels() {
  if (HL) return HL; const row = regRow('utci.heatLevels');
  if (row && row.value && Array.isArray(row.value.bandsC)) HL = { bands: row.value.bandsC, lowWords: row.value.lowWords || 'moderate heat stress', source: 'thresholds register utci.heatLevels' };
  if (!HL) HL = { bands: [[26, 32, 'Low'], [32, 38, 'Moderate'], [38, 46, 'High'], [46, null, 'Severe']], lowWords: 'moderate heat stress', source: 'built-in copy of utci.heatLevels (register not readable)' };
  return HL;
}
export function heatLevelOf(u) { if (!isN(u)) return null; const B = heatLevels().bands; let L = 0;
  B.forEach(([lo], i) => { if (u >= lo) L = i + 1; }); return L; }
export const heatCellOf = (u) => { const c = cell(u, utciAgnScore); if (!isN(u)) return c; const L = heatLevelOf(u);
  return { ...c, level: L, word: WORDS[L], condition: L === 1 ? heatLevels().lowWords : null, levelSource: heatLevels().source }; };
/* v91.17.283.31 · owner 2.1 · THE COLD LEVEL OF A UTCI, NO GAP, FROM THE THRESHOLDS REGISTER (data/thresholds-register.json row
   utci.coldLevels: Low 0 to -13, Moderate -13 to -27, High -27 to -40, Severe below -40 C). Until v283.30 the AGN cold map placed 0 to
   -13 C (moderate cold stress) at Normal and started at Moderate below -13. The score kept beside it is the AGN cold map's (diagnostic). */
let CL = null;
export function coldLevels() {
  if (CL) return CL;
  try { const R = JSON.parse(readFileSync(new URL('../../data/thresholds-register.json', import.meta.url), 'utf8')); const rows = Array.isArray(R) ? R : R.rows || [];
    const row = rows.find((r) => r.id === 'utci.coldLevels'); if (row && row.value && Array.isArray(row.value.bandsC)) CL = { bands: row.value.bandsC, lowWords: row.value.lowWords || 'moderate cold stress', source: 'thresholds register utci.coldLevels' }; } catch (_) {}
  if (!CL) CL = { bands: [[0, -13, 'Low'], [-13, -27, 'Moderate'], [-27, -40, 'High'], [-40, null, 'Severe']], lowWords: 'moderate cold stress', source: 'built-in copy of utci.coldLevels (register not readable)' };
  return CL;
}
export function coldLevelOf(u) { if (!isN(u)) return null; const B = coldLevels().bands; let L = 0;
  B.forEach(([hi], i) => { if (u < hi) L = i + 1; }); return L; }
/* v283.36 · launch item 33 · mild cold is not lost on the five-level scale: UTCI 9 to 0 C is the UTCI "slight cold stress" category (Blazejczyk
   et al. 2013); the level stays Normal (it is below the register's Low band) and the condition line carries it, with the value */
export const SLIGHT_COLD = 'slight cold stress';
export const coldCellOf = (u) => { const c = cell(u, utciColdScore); if (!isN(u)) return c; const L = coldLevelOf(u);
  return { ...c, level: L, word: WORDS[L], condition: L === 1 ? coldLevels().lowWords : (L === 0 && u < 9 && u >= 0 ? SLIGHT_COLD + ' (UTCI ' + (Math.round(u * 10) / 10) + ' \u00b0C)' : null), levelSource: coldLevels().source }; };
/* the condition line of a Low level ("moderate heat stress" / "moderate cold stress"); null for any other level */
export const lowCondition = (hz, L) => (L === 1 ? (hz === 'cold' ? coldLevels().lowWords : hz === 'heat' ? heatLevels().lowWords : null) : null);
export const levelWord = (L) => (isN(L) && L >= 0 && L <= 4 ? WORDS[L] : null);
