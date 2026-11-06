/* v91.17.283.36 · launch item 29 · the ensemble staleness rule now comes from the one data-age table (dataage.mjs): ENS 12 h cycle + 13 h
   delivery, counted from the run's base time. Kept as a module so the readers of v283.35 (hazsci, rainamount, readiness) import the same name. */
export { RAIN_ENS_STALE_H, ensAge } from './dataage.mjs';
