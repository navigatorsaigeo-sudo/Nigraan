/* ══ 28 Oct 2026 · THE APPROVED IFS BIAS-REMOVAL SET, SERVED ON THE IFS BASIS (the serving hook of the automatic monthly retrain) ══════
   The ONE place that reads data/ifs-mos-retrain-active.json (written only by the owner's approval: scripts/gen/exp_approve.mjs, target
   ifs-mos-retrain; rollback restores the previous pointer) and turns the approved coefficient files into served numbers.

   Where it applies. Only to hours whose value IS the ECMWF IFS value: the ecmwf010 substitution (ecmwf010.mjs substitute, switched on by
   NIGRAAN_ECMWF010_SERVE=1 for the variables whose switch rule passed) marks the location (agn_ecmwf010); an hour counts as IFS basis for
   a variable when, before the zone merge and the plains multi-model mix, its value equals what the substitution put there (the same run,
   ecmwf010.series / atHour at the location's height, rounded as served) and it is still that value when the static chain starts. An hour
   the zone members or the multi-model mix replaced is not on the IFS basis and is left alone (mark() in servedChainSteps, plan() in
   correctLocationSteps; a direct correctLocation caller without a merge uses the equality alone). The
   coefficients were fitted on 00 UTC runs and Pakistan days D+1..D+3 of the run: hours of a 12 UTC run, of day D or beyond D+3 are left
   alone. Zones: those the approved file marks applied.

   What it replaces (the coefficient source the retrain gated each candidate against - its served-repro reference - and nothing else):
     temperature (TA0, ifs-mos-temp-table)  the station calibration (data/temp-correction.json via mos.mjs calibrationAt / stretchAdj)
                                            in verification.mjs biasAt: on an IFS-basis hour of an approved zone the approved offset is
                                            the term instead of the calibration term. Where that point takes its temperature term from
                                            another source (the MACH running correction, the mountain MOS branch, the AI-only plains
                                            stretch), nothing changes: the retrain was not gated against those.
     dew point (TD0, ifs-mos-dew-table)     the lowland dew table (data/dew-offset-lowland.json) in humwind.mjs applyDew, plains / coast,
                                            where the national dew model does not serve (applyDew only runs there); capped at the served
                                            temperature as the file says. Mountain / plains points served by the national dew model are
                                            left alone (that model was not the gated reference).
     10 m wind (W0 ifs-mos-wind-linear, W1 ifs-mos-wind-ridge)   the served wind on the IFS basis is the raw IFS wind (the national wind
                                            model is applied in no zone and the valley wind model is off by default): the approved wind
                                            becomes the wind there, at the end of the chain. Where either wind model does serve, nothing.
   Not served by this hook (the reason is in status()): TA1 / TD1 ridge files (they need the station height above the 0.25 deg model
   orography and the model-snow index, which do not exist at an arbitrary served point), the gust factor (the served gust is never the
   IFS value: the substitution does not replace wind_gusts_10m) and the rain maps (a day total on the IFS basis needs the whole day on it).
   Every file is checked against the sha256 the pointer records; a missing, changed or unreadable file serves nothing (fail closed).
   PER ZONE (v91.17.283.28): the retrain keeps one winner per variable and zone (rules.json "choice"), and a bundle may hold two files of
   one variable for different zones (e.g. W0 ifs-mos-wind-linear for the plains and W1 ifs-mos-wind-ridge for the hills). The loader holds
   the served term per variable per zone (temp / dew / wind: Map zone -> entry) and serves each zone from the file that marks it applied.
   Two servable files claiming the SAME zone for one variable is a malformed bundle: that zone serves neither (fail closed), the others
   are unaffected. A zone whose winner is a file this hook does not serve (TA1 / TD1 ridge) gets nothing from another file.
   With no approved set (no pointer, the 'none' version, or rolled back to it) plan() returns null and nothing in the chain changes. */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

const POINTER = 'ifs-mos-retrain-active.json';
const SEAS = ['DJF', 'DJF', 'MAM', 'MAM', 'MAM', 'JJA', 'JJA', 'JJA', 'SON', 'SON', 'SON', 'DJF'];   /* by month index 0..11 */
const H3 = 3 * 3600e3, PKT = 5 * 3600e3, DAY = 864e5;
const NOT_SERVED = {
  'ifs-mos-temp-ridge': 'needs the station height above the 0.25 deg model orography and the model-snow index at the served point; neither exists there (fail closed)',
  'ifs-mos-dew-ridge': 'needs the station height above the 0.25 deg model orography and the model-snow index at the served point; neither exists there (fail closed)',
  'ifs-gust-factor': 'the served gust is the provider\'s wind_gusts_10m: the ecmwf010 substitution never puts the IFS gust in a served answer',
  'ifs-rain-qm-r0': 'the displayed rain is mapped per Pakistan day; an IFS-basis day total needs all 24 hours of the day on the IFS basis',
  'ifs-rain-qm-r1': 'the displayed rain is mapped per Pakistan day; an IFS-basis day total needs all 24 hours of the day on the IFS basis'
};
const TERR_W = ['t_tpi1000', 't_slope', 't_valley_depth', 't_svf'];   /* station-lake/retrain/ifsmos/lib/models.py TERR_W */

export function createIfsRetrain({ dataDir, ecmwf010, zoneOf, featGrid, moist, humWind, recheckMs = 60e3 }) {
  let A = null, key = null, checked = 0, why = null;
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  /* the active set, re-read when the pointer changes (checked at most once a minute) */
  function active() {
    const now = Date.now(); if (now - checked < recheckMs && key !== null) return A; checked = now;
    const pf = join(dataDir, POINTER); let st; try { st = statSync(pf); } catch (_) { key = 'none'; A = null; why = 'no approved set'; return null; }
    const k = st.mtimeMs + ':' + st.size; if (k === key) return A; key = k; A = null;
    try {
      const P = JSON.parse(readFileSync(pf, 'utf8'));
      if (!P || !P.dir || !Array.isArray(P.files) || !P.files.length) { why = 'no approved set (' + (P && P.version || 'none') + ')'; return null; }
      const set = { version: P.version, rulesSha256: P.rulesSha256 || null, temp: new Map(), dew: new Map(), wind: new Map(), files: {}, conflicts: {} };
      const claim = (v, zones, entry) => { for (const z of zones) { const k = v + '|' + z;
        if (set.conflicts[k]) { set.conflicts[k].push(entry.name); continue; }
        if (set[v].has(z)) { set.conflicts[k] = [set[v].get(z).name, entry.name]; set[v].delete(z); continue; }
        set[v].set(z, entry); } };
      for (const x of P.files) {
        const n = basename(String(x.name || '')), f = join(dataDir, String(P.dir), n); const nm = n.replace(/\.json$/, '');
        if (!existsSync(f)) { set.files[nm] = 'missing: not served'; continue; }
        const b = readFileSync(f); if (sha(b) !== x.sha256) { set.files[nm] = 'sha256 differs from the pointer: not served'; continue; }
        let J; try { J = JSON.parse(b.toString('utf8')); } catch (e) { set.files[nm] = 'unreadable: not served'; continue; }
        const zones = Object.entries(J.zones || {}).filter(([, v]) => v && v.applied).map(([z]) => z);
        if (NOT_SERVED[nm]) { set.files[nm] = 'approved, not served: ' + NOT_SERVED[nm]; continue; }
        if (nm === 'ifs-mos-temp-table' || nm === 'ifs-mos-dew-table') {
          const M = J.models && J.models[nm === 'ifs-mos-temp-table' ? 'T 3-hourly' : 'Td 3-hourly'];
          if (!M || !Array.isArray(M.cells)) { set.files[nm] = 'no 3-hourly table: not served'; continue; }
          const cells = new Map(); for (const c of M.cells) cells.set(c.zone + '|' + c.season + '|' + c.slot + '|' + c.lead, Number(c.offsetC));
          claim(nm === 'ifs-mos-temp-table' ? 'temp' : 'dew', zones, { name: nm, version: J.version, cells });
          set.files[nm] = 'served in ' + (zones.join(', ') || 'no zone');
        } else if (nm === 'ifs-mos-wind-linear' || nm === 'ifs-mos-wind-ridge') {
          const M = J.models && J.models['wind 3-hourly']; if (!M) { set.files[nm] = 'no wind model: not served'; continue; }
          claim('wind', zones, { name: nm, version: J.version, kind: nm === 'ifs-mos-wind-linear' ? 'W0' : 'W1', models: M });
          set.files[nm] = 'served in ' + (zones.join(', ') || 'no zone');
        } else set.files[nm] = 'unknown coefficient file: not served';
      }
      for (const k of Object.keys(set.conflicts)) { const [v, z] = k.split('|'); for (const n of set.conflicts[k]) set.files[n] += '; NOT in ' + z + ' (' + v + ' claimed by ' + set.conflicts[k].join(' and ') + ': fail closed)'; }
      for (const n of Object.keys(set.files)) { if (!/^served in /.test(set.files[n])) continue;
        const zs = ['temp', 'dew', 'wind'].flatMap((v) => [...set[v]].filter(([, e]) => e.name === n).map(([z]) => z));
        set.files[n] = set.files[n].replace(/^served in [^;]*/, 'served in ' + (zs.join(', ') || 'no zone')); }
      why = null; A = (set.temp.size || set.dew.size || set.wind.size) ? set : null; if (!A) why = 'approved files not servable: ' + JSON.stringify(set.files); else A.fileState = set.files;
      return A;
    } catch (e) { why = 'pointer unreadable: ' + e.message; A = null; return null; }
  }

  const seasonOf = (ms) => SEAS[new Date(ms + PKT).getUTCMonth()];
  const pktDay = (ms) => Math.floor((ms + PKT) / DAY);
  /* the 3-hourly samples of the fit: 02, 05, ..., 23 PKT = 21, 00, ..., 18 UTC -> every 3 UTC hours; slot = (PKT hour - 2) / 3 */
  const slotOf = (ms) => Math.floor(((new Date(ms + PKT).getUTCHours() - 2 + 24) % 24) / 3);
  const leadOf = (ms, t0) => pktDay(ms) - pktDay(t0);                  /* the 00 UTC run of day D: Pakistan day D+k -> lead k */
  function tableAt(T, zone, ms, t0) {                                    /* the offset at any hour: linear between its two samples */
    const s0 = Math.floor(ms / H3) * H3, s1 = s0 + H3;
    const cell = (s) => { const L = leadOf(s, t0); if (L < 1 || L > 3) return null; const v = T.cells.get(zone + '|' + seasonOf(s) + '|' + slotOf(s) + '|' + L); return Number.isFinite(v) ? v : null; };
    const a = cell(s0); if (ms === s0) return a; const b = cell(s1); if (a == null || b == null) return null;
    return a + (b - a) * (ms - s0) / H3;
  }
  function ridgeW(m, f, season, slot, lead, terr) {                      /* models.py design('W') + RidgeMOS export: the offset on raw f */
    const I = m.intercepts || {}; let o = (I['int_' + season + '_slot' + slot] || 0) + (lead === 2 ? I.lead2 || 0 : 0) + (lead === 3 ? I.lead3 || 0 : 0);
    const X = {}; for (let k = 0; k < 8; k++) X['f_x_slot' + k] = k === slot ? f : 0; for (const S of ['DJF', 'MAM', 'JJA', 'SON']) X['f_x_' + S] = S === season ? f : 0;
    for (const t of TERR_W) { X[t + '_x_f'] = terr[t] * f; X[t] = terr[t]; }
    for (const c of m.continuous || []) { const x = X[c.name]; if (x == null || !Number.isFinite(x)) return null; o += c.coef * (x - c.mean) / (c.sd || 1); }
    return o;
  }
  function windAt(W, zone, f, ms, t0, terr) {                            /* corrected 10 m wind (m/s) at one hour, linear between samples */
    const M = W.models[zone]; if (!M) return null;
    const one = (s) => { const L = leadOf(s, t0); if (L < 1 || L > 3) return null; const k = slotOf(s);
      if (W.kind === 'W0') { const ab = M['slot' + k]; return ab ? Math.max(0, ab.a + ab.b * f) : f; }
      const o = ridgeW(M, f, seasonOf(s), k, L, terr); return o == null ? null : Math.max(0, f + o); };
    const s0 = Math.floor(ms / H3) * H3; const a = one(s0); if (ms === s0) return a; const b = one(s0 + H3); if (a == null || b == null) return null;
    return a + (b - a) * (ms - s0) / H3;
  }

  /* the IFS values one location carries, hour by hour: value === the substituted value (ecmwf010 substituteLoc rounding) */
  function ifsHours(loc, windUnit) {
    const S0 = active(); if (!S0) return null;
    const em = loc && loc.agn_ecmwf010, H = loc && loc.hourly; if (!em || !H || !Array.isArray(H.time)) return null;
    const E = ecmwf010 && ecmwf010(); const L = E && E.latest && E.latest(); if (!L || L.run !== em.run) return null;
    if (!/00$/.test(String(L.run))) return null;                         /* fitted on 00 UTC runs only */
    const elev = Number.isFinite(loc.elevation) ? loc.elevation : null;
    const S = E.series(loc.latitude, loc.longitude, { elev }); if (!S) return null;
    const off = (Number(loc.utc_offset_seconds) || 0) * 1000, t0 = L.t0;
    const wf = { kmh: 3.6, ms: 1, mph: 2.236936, kn: 1.943844 }[String(windUnit || 'kmh')];
    const same = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;
    const T = new Map(), D = new Map(), W = new Map(), X = new Map();
    H.time.forEach((t, i) => {
      const ms = Date.parse(String(t).replace(/Z?$/, 'Z')) - off; const L1 = leadOf(ms, t0); if (L1 < 1 || L1 > 3) return;
      const x = E.atHour(S, ms); if (!x) return; X.set(i, { ms, x });
      if (Array.isArray(H.temperature_2m) && x.t2m != null && same(H.temperature_2m[i], Math.round(x.t2m * 10) / 10)) T.set(i, H.temperature_2m[i]);
      if (Array.isArray(H.dew_point_2m) && x.d2m != null && same(H.dew_point_2m[i], Math.round(x.d2m * 10) / 10)) D.set(i, H.dew_point_2m[i]);
      if (wf && Array.isArray(H.wind_speed_10m) && x.wind10 != null && same(H.wind_speed_10m[i], Math.round(x.wind10 * wf * 10) / 10)) W.set(i, H.wind_speed_10m[i]);
    });
    return { S0, L, t0, elev, wf, T, D, W, X };
  }
  /* before the zone merge and the plains mix (verification.mjs servedChainSteps): which hours hold the substituted IFS values. A later
     step that replaces a value (the zone members, the multi-model mix) makes that hour non-IFS; plan() keeps only unchanged hours */
  function mark(loc, windUnit = 'kmh') {
    const M = ifsHours(loc, windUnit); if (!M) return null;
    try { Object.defineProperty(loc, '__ifsrMark', { value: { T: M.T, D: M.D, W: M.W }, enumerable: false, configurable: true }); } catch (_) {}
    return M;
  }
  /* the per-hour terms of one location, computed once at the start of the static chain (no side effect when nothing applies); stored on
     the location as a non-serialised property for the three consumers */
  function plan(loc, lat, lon, windUnit = 'kmh') {
    const M = ifsHours(loc, windUnit); if (!M) return null;
    const { S0, L, t0, elev, wf } = M; const zone = zoneOf(lat, lon, elev); if (!zone) return null;
    const pre = loc.__ifsrMark || null; const keep = (A, k) => (pre ? new Map([...A].filter(([i, v]) => pre[k].has(i) && pre[k].get(i) === v)) : A);
    const iT = keep(M.T, 'T'), iD = keep(M.D, 'D'), iW = keep(M.W, 'W');
    const tE = S0.temp.get(zone) || null, dE = S0.dew.get(zone) || null, wE = S0.wind.get(zone) || null;   /* this zone's own winners */
    const useT = !!tE, useD = !!dE;
    let useW = !!(wE && wf);
    if (useW) { try { const mp = moist && moist().plan ? moist().plan(lat, lon, elev) : null; if (mp && mp.wind) useW = false; } catch (_) {}
      try { const hw = humWind && humWind(); if (process.env.NIGRAAN_HUMWIND_WIND === '1' && hw && hw.inDomain(lat, lon, elev)) useW = false; } catch (_) {} }
    let terr = null;
    if (useW && wE.kind === 'W1') { const fg = featGrid && featGrid(); terr = {}; for (const t of TERR_W) { const v = fg ? fg.value(t, lat, lon) : null; if (!Number.isFinite(v)) { useW = false; break; } terr[t] = v; } }
    if (!useT && !useD && !useW) return null;
    const T = new Map(), D = new Map(), Wd = new Map();
    for (const [i, { ms, x }] of M.X) {
      if (useT && iT.has(i)) { const o = tableAt(tE, zone, ms, t0); if (o != null) T.set(ms, o); }
      if (useD && iD.has(i)) { const o = tableAt(dE, zone, ms, t0); if (o != null) D.set(i, o); }
      if (useW && iW.has(i)) { const w = windAt(wE, zone, x.wind10, ms, t0, terr); if (w != null) Wd.set(i, Math.round(w * wf * 10) / 10); }
    }
    if (!T.size && !D.size && !Wd.size) return null;
    const P = { version: S0.version, zone, run: L.run, tAt: (ms) => (T.has(ms) ? T.get(ms) : null), tdAt: (i) => (D.has(i) ? D.get(i) : null), wind: Wd,
      used: { t: 0, td: 0, wind: 0 }, files: { temp: useT ? tE.version : null, dew: useD ? dE.version : null, wind: useW ? wE.version : null },
      fileNames: { temp: useT ? tE.name : null, dew: useD ? dE.name : null, wind: useW ? wE.name : null } };
    try { Object.defineProperty(loc, '__ifsr', { value: P, enumerable: false, configurable: true }); } catch (_) {}
    return P;
  }
  /* the wind consumer, at the end of the chain (the served wind on the IFS basis is otherwise the raw IFS wind) */
  function applyWind(loc) {
    const P = loc && loc.__ifsr; const H = loc && loc.hourly; if (!P || !P.wind.size || !H || !Array.isArray(H.wind_speed_10m)) return false;
    for (const [i, v] of P.wind) { H.wind_speed_10m[i] = v; P.used.wind++; }
    return true;
  }
  /* the provenance block, only on a location the approved set changed (none otherwise: answers stay byte-identical) */
  function note(loc) {
    const P = loc && loc.__ifsr; if (!P || !(P.used.t || P.used.td || P.used.wind)) return;
    loc.agn_ifs_retrain = { applied: true, version: P.version, zone: P.zone, run: P.run, hours: { ...P.used },
      files: Object.fromEntries(Object.entries(P.fileNames).filter(([k]) => P.used[k === 'temp' ? 't' : k === 'dew' ? 'td' : 'wind']).map(([k, v]) => [k, v])),
      supersedes: { temperature: P.used.t ? 'the station calibration (temp-correction.json) on these hours' : null, dewPoint: P.used.td ? 'the lowland dew table on these hours' : null,
        wind: P.used.wind ? 'the raw IFS wind on these hours' : null },
      rule: 'approved by the owner (data/ifs-mos-retrain-active.json); IFS-basis hours of the 00 UTC run, Pakistan days D+1..D+3 only' };
  }
  function status() { const S0 = active();
    const byZone = S0 ? Object.fromEntries(['temp', 'dew', 'wind'].map((v) => [v, Object.fromEntries([...S0[v]].map(([z, e]) => [z, e.name]))])) : null;
    return { active: !!S0, version: S0 ? S0.version : null, why, files: S0 ? S0.fileState : null, servedByZone: byZone,
      conflicts: S0 && Object.keys(S0.conflicts).length ? S0.conflicts : null, pointer: 'data/' + POINTER }; }
  return { mark, plan, applyWind, note, status, active };
}
