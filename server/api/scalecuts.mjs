/* == v91.17.283.24 . self-audit H17 . ONE HOME FOR THE LEVEL CUTS ======================================================================
   The level cuts were typed again in code: BAND_CUTS (hazsci.mjs), CUTS (areaheat.mjs), RIVER_MAP_CUTS (flood.mjs), bandOf (shown.mjs),
   ODDS_EDGES and USDM_SPI (hazsci.mjs). They are read here from the register, data/hazard-scale.json:
     screeningCuts         the AGN house band cuts of every 0-100 screening index (Low / Moderate / High / Severe minimum); the river map
                           ladder (0-1) is the same cuts / 100
     landslideOddsEdges    the odds bands of the landslide model's held-out validation (landslide-odds-model.json)
     droughtSpiBounds      the US Drought Monitor SPI categories D0..D3 upper bounds (Svoboda et al. 2002)
   The values did not change (25/45/65/82; 2/5/10/20; -0.5/-0.8/-1.3/-1.6). A register that is missing or malformed gives no cuts, and a
   level read on no cuts is null (not assessed), never a guess. The file is re-read when it changes. */
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const _DEF = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');   /* v91.17.283.51 · B1: the module's own folder resolved once (it was resolved per cell) */
const FILE = () => join(process.env.NIGRAAN_DATA_DIR || _DEF, 'hazard-scale.json');
let HS = null, HSm = -1, HSf = null, HSt = 0;
export function hazardScaleRegister() {
  try { const f = FILE(); if (HS && f === HSf && Date.now() - HSt < 1000) return HS; HSt = Date.now(); const m = statSync(f).mtimeMs;   /* the file is looked at once a second at most (a level is read per cell) */
    if (HS && m === HSm && f === HSf) return HS; HS = JSON.parse(readFileSync(f, 'utf8')); HSm = m; HSf = f; } catch (_) { HS = null; HSm = -1; }
  return HS;
}
const four = (a) => (Array.isArray(a) && a.length === 4 && a.every(isN) ? a.slice() : null);
/* [Low, Moderate, High, Severe] minimum of a 0-100 index */
export function screeningCuts() {
  const H = hazardScaleRegister(), C = H && Array.isArray(H.screeningCuts) ? H.screeningCuts : null; if (!C) return null;
  const at = (lv) => { const c = C.find((x) => x && x.level === lv); return c && isN(c.min) ? c.min : null; };
  return four(['Low', 'Moderate', 'High', 'Severe'].map(at));
}
export const landslideOddsEdges = () => { const H = hazardScaleRegister(); return four(H && H.landslideOddsEdges && H.landslideOddsEdges.value); };
export const droughtSpiBounds = () => { const H = hazardScaleRegister(); return four(H && H.droughtSpiBounds && H.droughtSpiBounds.value); };
/* level index 0..4 of a value on ascending cuts (value >= cut) */
export const levelUp = (v, cuts) => (!isN(v) || !cuts ? null : v >= cuts[3] ? 4 : v >= cuts[2] ? 3 : v >= cuts[1] ? 2 : v >= cuts[0] ? 1 : 0);
/* level index 0..4 of a value on descending bounds (value <= bound) */
export const levelDown = (v, b) => (!isN(v) || !b ? null : v <= b[3] ? 4 : v <= b[2] ? 3 : v <= b[1] ? 2 : v <= b[0] ? 1 : 0);
export const levelOfScreeningScore = (s) => levelUp(s, screeningCuts());
/* v91.17.283.27 · item 3 · THE 24-HOUR RAIN CLASSES, ONE HOME: data/hazard-scale.json rainClasses24h (India Meteorological Department daily
   rainfall categories: moderate 15.6, heavy 64.5, very heavy 115.6, extremely heavy 204.5 mm). hazsci.mjs, rainprob.mjs, outlook.mjs,
   served.mjs and the rain_fell map layer read them here; none types them. No register: no classes (the caller says not assessed). */
export const rainClasses24h = () => { const H = hazardScaleRegister(); return four(H && H.rainClasses24h && H.rainClasses24h.value); };
/* the whole entry (words, source, customerSource) for the surfaces that print the scale */
export const rainClassesEntry = () => { const H = hazardScaleRegister(); const e = H && H.rainClasses24h; return e && four(e.value) ? e : null; };
