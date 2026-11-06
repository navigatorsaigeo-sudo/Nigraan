/* ══ v91.17.91 · THE DAILY TEMPERATURE CHECK (INTERNAL, operator-only) ═════════════════════════════════════════════════════
   Every day, yesterday's forecast against what AGN's own MACH stations measured, from the fleet pairs the server already
   writes (station-lake/archive/fleet/fleet_pairs_YYYY-MM.csv: the reading, the provider's raw number and the served number
   for the reading's hour, lead 0-2 h).
     readings   trusted stations only (the fleet's siting screen), each first corrected for its siting against PMD
                (hyperlocal.siteCorrect: the daytime sun error), one reading per station and hour, gross errors (> 12 C from the
                raw forecast) dropped
     scores     MAE and bias of raw and served, all day / night (20-05 PKT) / day (09-16 PKT), by city
   The MACH stations are also training stations of the national model, so this is a drift monitor (is the served number
   still better than raw, and by the usual margin?), not an independent skill figure. Kept in data/national-score.json
   (400 days). Filled at start-up and every 6 h.
   v91.17.283.24 · self-audit J18 · a day is a PAKISTAN day (00:00-24:00 PKT = 19:00 UTC the day before to 19:00 UTC), like every other
   score of NIGRAAN; it was the UTC day. Each record says its basis (dayBasis 'PKT'); a UTC-day record still inside the 40-day refill window
   is scored again as a Pakistan day, an older one keeps its UTC basis and says so (history: dayBasis 'UTC'). */
import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';

const CITIES = [['Islamabad-Rawalpindi', 33.45, 33.85, 72.8, 73.45], ['Karachi', 24.7, 25.2, 66.8, 67.5], ['Lahore', 31.3, 31.75, 74.1, 74.6],
  ['Multan', 30.0, 30.4, 71.3, 71.7], ['Peshawar', 33.85, 34.15, 71.35, 71.75], ['Faisalabad', 31.3, 31.55, 72.95, 73.25]];
const cityOf = (la, lo) => { for (const [n, a, b, c, d] of CITIES) if (la >= a && la <= b && lo >= c && lo <= d) return n; return 'other'; };
const r2 = (v) => Math.round(v * 100) / 100;

export function createNatScore(app, root, dataDir) {
  const file = join(dataDir, 'national-score.json');
  const lake = join(root, '..', 'station-lake', 'archive', 'fleet');
  const load = () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return { days: [] }; } };
  let busy = false, lastErr = null;

  const PKT_MS = 5 * 3600e3;
  const pktToday = () => new Date(Date.now() + PKT_MS).toISOString().slice(0, 10);
  let monthCache = null;   /* one read of each month file per run (it was read again for every day) */
  const monthLines = (m) => { if (monthCache && monthCache.has(m)) return monthCache.get(m); const f = join(lake, 'fleet_pairs_' + m + '.csv'); const L = existsSync(f) ? readFileSync(f, 'utf8').split('\n') : null; if (monthCache) monthCache.set(m, L); return L; };
  function rowsFor(day) {
    /* the Pakistan day: hours from 19:00 UTC the day before to 19:00 UTC */
    const t0 = Date.parse(day + 'T00:00:00Z') - PKT_MS, t1 = t0 + 864e5; const prevUtc = new Date(t0).toISOString().slice(0, 10);
    const months = [...new Set([prevUtc.slice(0, 7), day.slice(0, 7)])];
    const out = [];
    for (const m of months) {
      const L = monthLines(m); if (!L) continue; const H = L[0].split(','); const ix = Object.fromEntries(H.map((h, i) => [h, i]));
      for (let i = 1; i < L.length; i++) {
        const c = L[i].split(','); if (c.length < H.length) continue;
        const hs = String(c[ix.hour_utc]); if (!(hs.startsWith(prevUtc) || hs.startsWith(day))) continue;
        const hm = Date.parse(hs.length === 17 ? hs.replace('Z', ':00Z') : hs.replace(/Z?$/, 'Z')); if (!(hm >= t0 && hm < t1)) continue;
        out.push({ key: c[ix.key], lat: +c[ix.lat], lon: +c[ix.lon], obsUtc: c[ix.obs_utc], hour: c[ix.hour_utc], t: +c[ix.temp_c], raw: +c[ix.fc_raw_c], served: +c[ix.fc_served_c],
          rh: ix.rh_pct != null && c[ix.rh_pct] !== '' ? +c[ix.rh_pct] : NaN, rhServed: ix.fc_served_rh_pct != null && c[ix.fc_served_rh_pct] !== '' ? +c[ix.fc_served_rh_pct] : NaN, rhRaw: ix.fc_rh_pct != null && c[ix.fc_rh_pct] !== '' ? +c[ix.fc_rh_pct] : NaN });
      }
    }
    return out;
  }

  function scoreDay(day) {
    const seen = new Set(); const acc = {};
    const add = (k, e0, e1) => { const a = acc[k] || (acc[k] = { n: 0, ar: 0, as: 0, br: 0, bs: 0, st: new Set() }); a.n++; a.ar += Math.abs(e0); a.as += Math.abs(e1); a.br += e0; a.bs += e1; };
    for (const r of rowsFor(day)) {
      if (![r.t, r.raw, r.served, r.lat, r.lon].every(Number.isFinite)) continue;
      /* v91.17.283.14 · no station is excluded: the fleet pairs are written only for readings whose temperature passed obsqc.mjs */
      const id = r.key + '|' + r.hour; if (seen.has(id)) continue; seen.add(id);
      let t = r.t; try { const c = app.hyperlocal && app.hyperlocal.siteCorrect(r.lat, r.lon, r.t, Date.parse(r.obsUtc)); if (c && Number.isFinite(c.t)) t = c.t; } catch (_) {}
      if (Math.abs(t - r.raw) > 12) continue;
      const pkH = (new Date(r.hour.length === 17 ? r.hour.replace('Z', ':00Z') : r.hour).getUTCHours() + 5) % 24;
      const part = (pkH >= 20 || pkH <= 5) ? 'night' : (pkH >= 9 && pkH <= 16) ? 'day' : 'transition';
      const e0 = r.raw - t, e1 = r.served - t;
      for (const k of ['all', part, 'city:' + cityOf(r.lat, r.lon)]) { add(k, e0, e1); acc[k].st.add(r.key); }
      /* v91.17.97 · audit C14: relative humidity scored the same way (the CEO saw the Islamabad model ~40 % against 61 % at MACH G-10) */
      if (Number.isFinite(r.rh) && Number.isFinite(r.rhServed) && r.rh >= 1 && r.rh <= 100) { const h0 = (Number.isFinite(r.rhRaw) ? r.rhRaw : r.rhServed) - r.rh, h1 = r.rhServed - r.rh;
        for (const k of ['rh:all', 'rh:' + part, 'rh:city:' + cityOf(r.lat, r.lon)]) { add(k, h0, h1); acc[k].st.add(r.key); } }
    }
    const res = {};
    for (const [k, a] of Object.entries(acc)) res[k] = { n: a.n, stations: a.st.size, maeRaw: r2(a.ar / a.n), maeServed: r2(a.as / a.n), biasRaw: r2(a.br / a.n), biasServed: r2(a.bs / a.n) };
    return res;
  }

  function run() {
    if (busy) return; busy = true;
    try {
      const S = load(); const have = new Set(S.days.filter((d) => d.dayBasis === 'PKT').map(d => d.date));
      const today = pktToday(); monthCache = new Map();
      const files = existsSync(lake) ? readdirSync(lake).filter(f => /^fleet_pairs_\d{4}-\d{2}\.csv$/.test(f)).sort() : [];
      if (!files.length) { lastErr = 'no fleet pairs yet'; return; }
      const first = files[0].slice(12, 19) + '-01';
      let added = 0;
      for (let d = new Date(Math.max(Date.parse(first), Date.parse(today + 'T00:00:00Z') - 40 * 864e5)); d.toISOString().slice(0, 10) < today; d = new Date(d.getTime() + 864e5)) {
        const day = d.toISOString().slice(0, 10); if (have.has(day)) continue;
        const sc = scoreDay(day); if (!sc.all || sc.all.n < 20) continue;
        S.days = S.days.filter((x) => x.date !== day);   /* a UTC-day record of the same date is replaced */
        S.days.push({ date: day, dayBasis: 'PKT', ...sc }); added++;
      }
      if (added) { S.days.sort((a, b) => a.date.localeCompare(b.date)); S.days = S.days.slice(-400); S.updated = new Date().toISOString();
        S.note = 'INTERNAL. Forecast minus MACH reading (siting-corrected; values that passed the quality control), lead 0-2 h. MACH stations are also training stations: a drift monitor, not independent skill.';
        writeFileSync(file + '.tmp', JSON.stringify(S)); renameSync(file + '.tmp', file); }
      lastErr = null;
    } catch (e) { lastErr = String(e.message || e); } finally { busy = false; monthCache = null; }
  }
  function status() {
    const S = load(); const d = S.days || []; const last = d[d.length - 1] || null;
    const recent = d.slice(-7); const w = (k) => { let n = 0, s = 0; for (const x of recent) if (x.all) { n += x.all.n; s += x.all[k] * x.all.n; } return n ? r2(s / n) : null; };
    return { ok: !!last, last, week: recent.length ? { days: recent.length, maeRaw: w('maeRaw'), maeServed: w('maeServed') } : null, days: d.length, error: lastErr,
      alert: last && last.all && last.all.maeServed > last.all.maeRaw + 0.1 ? 'served worse than raw yesterday' : null, note: S.note || null };
  }
  function history(n = 60) { const S = load(); return { days: (S.days || []).slice(-n).map((d) => d.dayBasis ? d : { ...d, dayBasis: 'UTC' }), note: S.note || null }; }
  schedule(app, 'nationalScore', 6 * 3600e3, () => run(), { firstMs: 5 * 60e3, heavy: true, label: 'daily national temperature score' });
  return { run, status, history, scoreDay };
}
