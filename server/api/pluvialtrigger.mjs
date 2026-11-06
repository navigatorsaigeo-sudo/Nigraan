/* ══ v283 WS5 · LOCAL-RAIN (PLUVIAL) FLOOD TRIGGER, EVENT-TESTED, GATED OFF ══════════════════════════════════════════════════════
   Owner decision B (20 Oct 2026): the pluvial flood level is removed from client screens until it is event-tested. This module is
   that test's candidate, kept behind its gate (data/pluvial-trigger.json `served`, false in v283; NIGRAAN_PLUVIAL_TRIGGER=1 lets an
   operator read it, it never makes a client level).
     trigger   the calibrated chance that the satellite (IMERG) day total reaches 25 mm (server/api/rainchance.mjs, the served rain-chance
               model, fitted 2024-05..2025-12) at or above the operating chance in data/pluvial-trigger.json, which was fixed on the
               training years (Jun-Sep 2024-2025, best Peirce score against IMERG day totals of 25 mm) before any test.
     test      MACH heavy-rain catalogue, Jun-Sep 2026, Islamabad-Rawalpindi and Lahore (scripts/gen/ws5/pluvial_trigger_test.py):
               the numbers are carried in the data file and repeated in /api answers only for operators.
     runoff    imperviousness (ESA WorldCover built share of the 250 m feature grid) is reported beside the trigger as context. It is
               NOT in the trigger: it is constant for a place, so a two-city gauge catalogue cannot test it.
   No typed threshold: the operating chance is read from the data file; a missing chance is "not assessed", never "no trigger". */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* pure: cfg = data/pluvial-trigger.json, p25 = calibrated chance (0-1) of an IMERG day >= 25 mm */
export function triggerOf(cfg, p25) {
  if (!cfg || cfg.operatingChance25 == null || !isFinite(cfg.operatingChance25)) return { assessed: false, why: 'data/pluvial-trigger.json missing or without an operating chance' };
  if (p25 == null || !isFinite(p25)) return { assessed: false, why: 'no calibrated 25 mm chance for this place and day (withheld by the rain-chance model)' };
  return { assessed: true, trigger: p25 >= cfg.operatingChance25, chance25: Math.round(p25 * 1000) / 1000, operatingChance25: cfg.operatingChance25 };
}

export function createPluvialTrigger(app, dataDir) {
  const file = join(dataDir, 'pluvial-trigger.json'); let C = null, Ct = 0;
  const cfg = () => { try { const t = statSync(file).mtimeMs; if (!C || t !== Ct) { C = JSON.parse(readFileSync(file, 'utf8')); Ct = t; } } catch (_) { C = null; } return C; };
  const served = () => { const c = cfg(); return !!(c && c.served === true); };
  const operatorOn = () => process.env.NIGRAAN_PLUVIAL_TRIGGER === '1';
  function builtShare(lat, lon) { try { const G = app && app.featGrid; if (!G || lat == null || lon == null) return null; const v = G.value('s_wc_built', lat, lon); return v == null ? null : Math.round(v * 100) / 100; } catch (_) { return null; } }
  /* uid + date -> trigger for that tehsil day; client calls get { served:false } and nothing else while the gate is off */
  function unit(uid, date, { operator = false } = {}) {
    const c = cfg();
    if (!served() && !(operator && operatorOn())) return { served: false, why: (c && c.servedWhy) || 'pluvial trigger not served' };
    let rc = null; try { rc = app && app.rainChance && app.rainChance.national ? app.rainChance.national() : null; } catch (_) { rc = null; }
    const u = rc && rc.ready && rc.units ? rc.units[uid] : null; const d = u && Array.isArray(u.days) ? u.days.find((x) => x.date === date) : null;
    const p = d && d.p ? d.p['25'] ?? d.p[25] : null;
    const t = triggerOf(c, p == null ? null : p / 100);   /* rainchance.national() carries percent */
    const tu = app && app.units && app.units.tehsil ? app.units.tehsil.find((x) => x.unitId === uid) : null;
    return { served: served(), operatorOnly: !served(), unit: uid, date, ...t, runoffContext: { builtShare: tu ? builtShare(tu.lat, tu.lon) : null, inTrigger: false },
      test: c ? c.test : null, version: c ? c.version : null };
  }
  function status() { const c = cfg(); return { served: served(), version: c ? c.version : null, operatingChance25: c ? c.operatingChance25 : null, why: c ? c.servedWhy : 'data/pluvial-trigger.json missing' }; }
  return { unit, status, served };
}
