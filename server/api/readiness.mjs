/* == v91.17.283.31 · owner 1.5 · READINESS: GET /api/readiness -> { ready, stale: [{ product, inputAge, why }], checked, at } ===============
   One answer for the page's "Backend connected" badge: ready is false (amber) when any OFFERED product's input is older than its own rule
   or missing, with the product, the input's age in hours and the reason. Each rule is the product's own (the age at which its server code
   stops serving the input as current). Customer wording: no supplier or agency names. */
import { RAIN_ENS_STALE_H } from './stale.mjs';   /* v283.35 · B7: the one staleness rule */
import { limitH as dataLimitH, DATA_AGE } from './dataage.mjs';   /* v283.36 item 29 */
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const ageH = (iso) => { const t = typeof iso === 'number' ? iso : Date.parse(iso || ''); return isN(t) ? Math.round((Date.now() - t) / 360e3) / 10 : null; };
export const READINESS_RULES = Object.freeze([
  { product: 'hazard levels', maxH: 30, why: 'the issued hazard run is older than its validity' },
  { product: 'heavy rain (ensemble)', maxH: RAIN_ENS_STALE_H, why: 'the ensemble run held is too old for the rain levels and amounts (input not current)' },
  { product: 'heavy rain (deterministic 00 UTC)', maxH: 36, why: 'the newest 9 km 00 UTC run held is too old: today and days 1-3 fall back to not current' },
  { product: 'earthquakes', maxH: 1, why: 'no successful earthquake feed poll in the last hour' },
  { product: 'river gauges (measured)', maxH: dataLimitH('gauge'), why: 'the measured river gauge sheet has not been read for more than 2 days' },
  { product: 'area heat and cold', maxH: 12, why: 'the populated-area heat and cold levels were not refreshed in the last 12 hours' }]);
/* v91.17.283.33 · right after a restart the first area-heat run is still in progress: say so instead of "missing" */
export const STARTING_AREA_HEAT = 'starting up: rebuilding area heat and cold (about 5 min)';
export function readiness(app) {
  const safe = (f) => { try { return f(); } catch (_) { return null; } };
  const checks = [];
  const add = (product, at, extra = {}) => { const R = READINESS_RULES.find((r) => r.product === product); const a = at == null ? null : ageH(at);
    const stale = a == null || a > R.maxH || extra.down; checks.push({ product, inputAt: at ? new Date(typeof at === 'number' ? at : Date.parse(at)).toISOString() : null, inputAge: a, maxAgeH: R.maxH, stale: !!stale,
      ...(stale ? { why: extra.why || (a == null ? 'missing: ' + R.why.replace(/^the /, '') : R.why) } : {}) }); };
  if (app.engine && app.engine.status) { const h = safe(() => app.engine.status().latest); add('hazard levels', h && h.ready ? h.received || h.at : null, h && h.ready ? (h.stale ? { down: true, why: 'the issued hazard run is stale (' + (h.validUntil ? 'valid until ' + h.validUntil : 'past its validity') + ')' } : {}) : { why: 'missing: ' + ((h && h.why) || 'no hazard run issued') }); }
  if (app.outlook && app.outlook.dayRows) { const E = safe(() => app.outlook.dayRows()); add('heavy rain (ensemble)', E ? (Number(E.issueInit) > 0 ? Number(E.issueInit) * 1000 : (E.at ? Date.parse(E.at) - DATA_AGE.ens.delayH * 3600e3 : null)) : null); }   /* v283.36 item 29: age from the run's base time */
  if (app.ecmwf010 && app.ecmwf010.status) { const s = safe(() => app.ecmwf010.status()); const run = s && (s.latest || s.run || (s.newest && s.newest.run)); const t = run && /^\d{10}$/.test(String(run)) ? Date.parse(String(run).replace(/^(\d{4})(\d\d)(\d\d)(\d\d)$/, '$1-$2-$3T$4:00:00Z')) : (s && s.runTimeUtc ? Date.parse(s.runTimeUtc) : null);
    if (s && s.on !== false) add('heavy rain (deterministic 00 UTC)', isN(t) ? t : null); }
  if (app.quake && app.quake.status && (() => { const q = safe(() => app.quake.status()); if (q && q.verified === false) { add('earthquakes', null, { down: true, why: q.why }); return true; } return false; })()) {} else if (app.quake && app.quake.status) { const q = safe(() => app.quake.status()); add('earthquakes', q && q.lastPollOk, q && !q.timers ? { down: false } : {}); if (q && !q.timers) checks[checks.length - 1] = { ...checks[checks.length - 1], stale: false, why: undefined, note: 'polling off on this server' }; }
  if (app.riverSheet) { const S = safe(() => app.riverSheet.stations()); add('river gauges (measured)', S && S.ready && S.newest ? Date.parse(S.newest + 'T06:00:00+05:00') : null, S && !S.ready ? { why: 'missing: the measured river gauge sheet is not held yet' } : {}); }
  if (app.areaHeat && app.areaHeat.status) { const a = safe(() => app.areaHeat.status()); if (a && a.on) add('area heat and cold', a.at, !a.at && (a.busy || process.uptime() < 900) ? { why: STARTING_AREA_HEAT } : {}); }
  const stale = checks.filter((c) => c.stale).map((c) => ({ product: c.product, inputAge: c.inputAge, why: c.why }));
  return { ready: !stale.length, stale, checked: checks.map(({ why, ...c }) => c), at: new Date().toISOString(),
    rule: 'ready = every offered product’s input is within its own age rule; amber with the reasons otherwise' };
}
