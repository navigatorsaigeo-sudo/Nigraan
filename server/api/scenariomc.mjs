/* == v91.17.283.34 · SCENARIO LAB A · THE WEATHER SCENARIO ON THE ENSEMBLE MEMBERS, WITH A MONTE CARLO OVER THE MODEL'S UNCERTAINTY =====
   The deterministic scenario (scenario.mjs) changes the place's forecast hours. This module answers "how sure": the same scenario applied
   to each of the 51 ECMWF IFS ensemble members of the latest run held (data/ens_members, ensmembers.mjs: the raw daily members per tehsil),
   then each outcome as a level or a chance WITH A RANGE:
     heat / cold level   per member: the place's hours of that day shifted by the scenario's +dT plus the member's departure from the
                         ensemble median (day maximum for heat, day minimum for cold), UTCI recomputed by the place record's own day core,
                         levelled by the same UTCI levels; central = the median member's level, range = the 10th-90th percentile member
     wind level          the gust you set is certain by assumption (one level); otherwise per member the day's gusts scaled by the member's
                         departure (ratio to the median), levelled by the hazard engine's wind ladder
     rain class          of the assumed amount (certain by assumption): one class, no range
     local-rain flooding the district chance, Monte Carlo of 2000 draws over the flood model's 200 bootstrap refits x the day total (the
                         assumed amount, or one member's day total), the district model's mc function handed in by scenario.mjs
     landslide, vegetation stress   not modelled yet
   REPRODUCIBLE: the generator is seeded from a sha256 of the inputs (place, scenario, members file): the same inputs give the same answer.
   The members are raw (before NIGRAAN's corrections): only their spread is used, never their level. */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { heatCellOf, coldCellOf, levelWord } from './utcilevel.mjs';
import { levelOfScreeningScore } from './scalecuts.mjs';
import { engineFns } from './enginefns.mjs';

const isN = (x) => typeof x === 'number' && Number.isFinite(x);
export const MC_DRAWS = 2000;
export const NOT_MODELLED = { landslide: 'not modelled yet', vegetationStress: 'not modelled yet' };
/* mulberry32 from the first 4 bytes of a sha256 of the canonical inputs */
export function seededRandom(seedObj) {
  const h = createHash('sha256').update(JSON.stringify(seedObj)).digest(); let a = h.readUInt32LE(0) >>> 0;
  const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { rand, seed: h.toString('hex').slice(0, 16) };
}
const median = (a) => { const s = a.filter(isN).sort((x, y) => x - y); if (!s.length) return null; const k = (s.length - 1) / 2; return (s[Math.floor(k)] + s[Math.ceil(k)]) / 2; };
const quant = (a, q) => { const s = a.filter(isN).sort((x, y) => x - y); if (!s.length) return null; return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))]; };

/* the latest members file that holds this tehsil and covers the wanted dates */
let CACHE = { key: null, v: null };
export function membersFor(dataDir, uid, dates) {
  const root = join(dataDir, 'ens_members'); if (!uid || !existsSync(root)) return { ok: false, why: 'no ensemble members are held on this server yet' };
  let days = []; try { days = readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().slice(0, 4); } catch (_) { days = []; }
  for (const d of days) {
    let files = []; try { files = readdirSync(join(root, d)).filter((f) => f.endsWith('.json') && !f.endsWith('.part')).sort().reverse(); } catch (_) { files = []; }
    for (const f of files) { const base = join(root, d, f.slice(0, -5)); if (!existsSync(base + '.i16')) continue;
      let head = null, buf = null; const key = base + '|' + statSync(base + '.i16').mtimeMs;
      try { if (CACHE.key === key) ({ head, buf } = CACHE.v); else { head = JSON.parse(readFileSync(base + '.json', 'utf8')); const b = readFileSync(base + '.i16'); buf = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); CACHE = { key, v: { head, buf } }; } } catch (_) { continue; }
      const u = (head.units || []).findIndex((x) => x && x.id === uid); if (u < 0) continue;
      if (!(dates || []).every((x) => (head.days || []).includes(x))) continue;
      const V = head.vars.length, M = head.members.length, D = head.days.length, vi = Object.fromEntries(head.vars.map((v, i) => [v.short, i]));
      const get = (v, m, day) => { if (vi[v] == null) return null; const k = head.days.indexOf(day); if (k < 0) return null; const q = buf[((u * V + vi[v]) * M + m) * D + k]; return q === head.missing ? null : q / head.scale; };
      return { ok: true, run: head.run || head.fetchedAt, members: M, file: d + '/' + f.slice(0, -5), get }; }
  }
  return { ok: false, why: 'no ensemble run held for this tehsil covers these days' };
}

/* the levels of one outcome over the members: central (median member), range (10th-90th percentile), shares per level */
function levelSummary(levels, what) {
  const L = levels.filter(isN); if (!L.length) return { assessed: false, why: 'not assessed: no member could be levelled for ' + what };
  const sh = {}; for (const x of L) sh[levelWord(x)] = (sh[levelWord(x)] || 0) + 1;
  const c = quant(L, 0.5), lo = quant(L, 0.1), hi = quant(L, 0.9);
  return { assessed: true, level: c, word: levelWord(c), range: [lo, hi], rangeWords: [levelWord(lo), levelWord(hi)], members: L.length,
    shares: Object.fromEntries(Object.entries(sh).map(([k, n]) => [k, Math.round(n / L.length * 100)])), rangeBasis: '10th to 90th percentile of the ' + L.length + ' members' };
}

/* weatherMC: ps the place's point state; perturb(ps, sp) the deterministic perturbation of scenario.mjs; sp the scenario */
export function weatherMC({ app, dataDir, districtMc, uid, lat, lon, ps, sp, perturb, rainDay, rainMm, gustDay, floodDay, baseDayMm, seedObj }) {
  const days = (ps.days || []).filter((d) => d.lead >= 0 && d.lead <= 3), dates = days.map((d) => d.date);
  const E = membersFor(dataDir, uid, dates);
  const { rand, seed } = seededRandom({ ...seedObj, members: E.ok ? E.file : null });
  const out = { method: 'the scenario applied to each ensemble member; Monte Carlo over the flood model’s bootstrap refits', seed, reproducible: 'the same inputs give the same answer (fixed seed from the inputs)', notModelled: NOT_MODELLED };
  if (!E.ok) out.members = { ok: false, why: E.why };
  else out.members = { ok: true, count: E.members, run: E.run, basis: 'raw ensemble members: only their spread around the ensemble median is used' };
  const dT = isN(sp.dT) ? sp.dT : 0, elevM = ps.point ? ps.point.elevM : null, ENG = engineFns(dataDir);
  /* per member: the day departures; heat uses the day maximum, cold the day minimum, wind the gust ratio */
  const perDay = {};
  for (const d of days) perDay[d.date] = { heat: [], cold: [], wind: [] };
  if (E.ok) {
    const med = {}; for (const day of dates) med[day] = { tx: median([...Array(E.members).keys()].map((m) => E.get('tx', m, day))), tn: median([...Array(E.members).keys()].map((m) => E.get('tn', m, day))), gu: median([...Array(E.members).keys()].map((m) => E.get('gu', m, day))) };
    for (let m = 0; m < E.members; m++) {
      const dx = {}, dn = {}, gs = {};
      for (const day of dates) { const tx = E.get('tx', m, day), tn = E.get('tn', m, day), gu = E.get('gu', m, day);
        dx[day] = isN(tx) && isN(med[day].tx) ? dT + (tx - med[day].tx) : null; dn[day] = isN(tn) && isN(med[day].tn) ? dT + (tn - med[day].tn) : null;
        gs[day] = isN(gu) && isN(med[day].gu) && med[day].gu > 0 ? gu / med[day].gu : null; }
      let PH = null, PC = null;
      try { PH = perturb(ps, lat, lon, { ...sp, gustDay, dT: null, dTByDay: dx, gustScaleByDay: gs }); } catch (_) { PH = null; }   /* the gust you set still fixes its own day */
      try { PC = perturb(ps, lat, lon, { ...sp, dT: null, dTByDay: dn, gustKmh: null }); } catch (_) { PC = null; }
      for (const day of dates) {
        const h = PH && PH.days.find((x) => x.date === day), c = PC && PC.days.find((x) => x.date === day);
        if (isN(dx[day]) && h && h.heat && h.heat.assessed) { const k = heatCellOf(h.heat.utciMaxC); if (isN(k.level)) perDay[day].heat.push(k.level); }
        if (isN(dn[day]) && c && c.cold && c.cold.assessed) { const k = coldCellOf(c.cold.utciMinC); if (isN(k.level)) perDay[day].cold.push(k.level); }
        if (!(isN(sp.gustKmh) && day === gustDay) && ENG.ok && h && (isN(h.gustMaxKmh) || isN(h.windMaxKmh)) && isN(gs[day])) { const r = ENG.wind({ gust: h.gustMaxKmh, wind: h.gustMaxKmh == null ? h.windMaxKmh : null, elev: elevM }, {}); const L = r && isN(r.score) ? levelOfScreeningScore(r.score) : null; if (isN(L)) perDay[day].wind.push(L); }
      }
    }
  }
  out.days = days.map((d) => { const P = perDay[d.date] || { heat: [], cold: [], wind: [] };
    const o = { date: d.date, lead: d.lead,
      heat: E.ok ? levelSummary(P.heat, 'heat') : { assessed: false, why: 'not assessed: ' + E.why },
      cold: E.ok ? levelSummary(P.cold, 'cold') : { assessed: false, why: 'not assessed: ' + E.why } };
    /* v283.36 item 17: no wind level (the gust ladder is untested); the gust you set is a value, not a level */
    if (isN(sp.gustKmh) && d.date === gustDay) o.wind = { assumed: true, assessed: false, state: 'not_tested', valueKmh: sp.gustKmh, why: 'the gust you set: ' + sp.gustKmh + ' km/h (no wind level in this release)' };
    else o.wind = { assessed: false, state: 'not_tested', why: 'not tested: no wind level in this release (the gust ladder is untested)' };
    if (isN(rainMm) && d.date === rainDay) o.rainClass = { assumed: true, mm: rainMm, why: 'the rain class of the assumed amount: certain by assumption, no range' };
    return o; });
  /* the district chance of local-rain flooding on the scenario day */
  if (typeof districtMc === 'function') {
    let mm = null, basis = null;
    if (isN(rainMm) && floodDay === rainDay) { mm = [rainMm]; basis = 'the assumed day total'; }
    else if (E.ok) { mm = [...Array(E.members).keys()].map((m) => E.get('pr', m, floodDay)).filter(isN); basis = 'the ' + mm.length + ' members’ day totals'; }
    else if (isN(baseDayMm)) { mm = [baseDayMm]; basis = 'the forecast day total (no members held)'; }
    let F = null; try { F = mm && mm.length ? districtMc({ uid, day: floodDay, mmList: mm, wetPct: sp.wetPct, rand, n: MC_DRAWS }) : { modelled: false, why: 'not modelled: no day total for this day' }; } catch (e) { F = { modelled: false, why: 'not modelled: the flood chance could not be computed' }; }
    out.flood = { ...F, day: floodDay, dayTotalBasis: basis };
  }
  return out;
}
