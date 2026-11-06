/* == v91.17.283.9 . RIVER TRUTH ADAPTER (operator only; never served) ===================================================================
   Lets the verification and flood-shadow agents score river flow at a gauge NIGRAAN does not serve, from a gauge sheet the operator
   drops in. First station: Ravi at Shahdara (Lahore). Built 23 Oct 2026 with the Shahdara study (data/evidence/river/shahdara_2839.json):
   neither the GloFAS calibration nor the flood-chance reach passed its pre-registered held-out rule there, so NOTHING here reaches a
   served value, a client page or a customer API. It is not scheduled (server/api/agents.mjs does not name it); flood_shadow.mjs or
   verify.mjs may import scoreStation() once a candidate passes.
   DROP     data/flood-truth/river/drop/<station>_<anything>_<unit>.csv, unit = cusecs | kcusecs (in the name or the header); columns
            Time (dd/mm/yyyy HH, dd-mm-yyyy HH or yyyy-mm-dd HH:MM) and Inflow. A file without a stated unit is registered "not scorable".
   CLEAN    (the rules of the owner's 2020-24 sheet, work/shahdara clean.py): hour 24 = 00 of the next day; an 00 reading listed after the
            18:00 reading of the same date = 00 of the next day; non-numeric or zero inflow = missing; < 0 or above the 1988 record = missing;
            an isolated one-reading excursion (> 3x both neighbours within 36 h, the neighbours within 1.5x of each other) = missing.
            daily: q06 = the 06:00 reading (the bulletin convention), qmax = the highest kept reading of the day.
   SCORED   (shadow, lead 0, per gauge day; the gauge's official limits, thousand cusecs)
            model     GloFAS daily flow at the gauge cell (station-lake/archive/glofas/glofas_irsa_daily.csv.gz, the column the drought job
                      extends; model day d + modelLagDays stands for gauge day d, the glofascal Spearman lag), its class, and its error
                      against q06 (thousand cusecs)
            chance    P(>= Low), P(>= Medium) from the served river-prob coefficients (data/river-prob-model.json) on the cell's own
                      rarity (2-year flow by Gumbel on annual maxima 1997 on, half-month p95), exactly as server/api/riverprob.mjs
            references persistence (yesterday's gauge class) and climatology (the gauge's Jun-Oct base rate, evidence file)
            Brier skill against both with a 7-day-block bootstrap 95 % interval (2,000 draws, fixed seed).
   WRITES   only data/flood-truth/river/registry.json and data/agents/river/<station>/{days.jsonl,summary.json} (operator state: never
            packaged, pack-release STATE). Reads only. No network code.
   usage: node scripts/agents/river_truth.mjs --data <dir> --lake <station-lake> [--station shahdara]                                    */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { args, readJson, writeJsonAtomic, rng, fin, r1, r3, addDays } from './lib.mjs';

export const M3_PER_KCS = 28.316846592;
export const STATIONS = {
  shahdara: { name: 'Ravi at Shahdara', match: /sha+h?d(a)?ra|shadra/i, glofasColumn: 'Shahdara', cell: [31.625, 74.275], upAreaKm2: 13647, modelLagDays: -1,
    limitsKcs: [40, 65, 90, 135, 180], recordKcs: 576, climBase: { low: 0.014, medium: 0.012, from: 'Jun-Oct 2020-2026 gauge days (1002): 14 at Low or higher, 12 at Medium or higher' },
    served: false, evidence: 'data/evidence/river/shahdara_2839.json' },
};
export const CLASSES = ['Below Low', 'Low', 'Medium', 'High', 'Very High', 'Exceptional'];
export const classOf = (q, lim) => !fin(q) ? null : lim.reduce((c, L, i) => (L != null && q >= L ? i + 1 : c), 0);
export function stationOf(name) { for (const [id, S] of Object.entries(STATIONS)) if (S.match.test(name)) return id; return null; }
export function unitOf(name, header) {
  const s = (name + ' ' + header).toLowerCase();
  if (/k-?cusecs|thousand|000 ?cusecs|kcs/.test(s)) return 'kcusecs';
  if (/cusecs/.test(s)) return 'cusecs';
  return null;
}
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
/* a time token -> ms (the clock is Pakistan local, kept as a naive UTC clock so a day is a calendar day) */
export function parseTime(s) {
  s = String(s).trim(); let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2})(?::(\d{2}))?(?::\d{2})?$/.exec(s))) return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0) + (+m[4]) * 3600e3 + (+(m[5] || 0)) * 60e3, h24: +m[4] === 24 };
  if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2})(?::(\d{2}))?$/.exec(s))) return { ms: Date.UTC(+m[3], +m[2] - 1, +m[1], 0, 0) + (+m[4]) * 3600e3 + (+(m[5] || 0)) * 60e3, h24: +m[4] === 24 };
  return null;
}
function splitLine(l) { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o.map((x) => x.trim()); }
/* the drop sheet -> readings in thousand cusecs, each with its flags */
export function parseSheet(text, unit, recordKcs = 576) {
  const L = text.replace(/^﻿/, '').split(/\r?\n/).filter((x) => x.trim()); if (!L.length) return [];
  const H = splitLine(L[0]).map((x) => x.toLowerCase()); const it = H.findIndex((x) => /time|date/.test(x)), iq = H.findIndex((x) => /inflow|flow|discharge/.test(x));
  if (it < 0 || iq < 0) throw new Error('the sheet needs a Time and an Inflow column');
  const k = unit === 'kcusecs' ? 1 : 1 / 1000; const out = []; let prev = null;
  for (let i = 1; i < L.length; i++) { const c = splitLine(L[i]); const f = []; const T = parseTime(c[it]); let ms = T ? T.ms : null;
    if (!T) f.push('BADTIME'); else { if (T.h24) f.push('H24');
      if (prev != null && ms < prev && new Date(ms).getUTCHours() === 0 && ms + 864e5 >= prev) { ms += 864e5; f.push('H00_NEXTDAY'); } if (ms != null) prev = ms; }
    const raw = c[iq]; let q = /^-?\d+(\.\d+)?$/.test(raw.replace(/,/g, '')) ? Number(raw.replace(/,/g, '')) * k : null;
    if (q == null) f.push('NONNUM'); else if (q === 0) { f.push('ZERO'); q = null; } else if (q < 0 || q > recordKcs) { f.push('RANGE'); q = null; }
    out.push({ row: i + 1, ms, q, flags: f }); }
  out.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0) || a.row - b.row);
  const V = out.filter((r) => r.ms != null && r.q != null); const seen = new Map();
  for (const r of V) { const o = seen.get(r.ms); if (o) { if (o.q === r.q) { r.flags.push('DUP'); r.q = null; } else { o.flags.push('DUPCONFLICT'); r.flags.push('DUPCONFLICT'); } } else seen.set(r.ms, r); }
  const W = out.filter((r) => r.ms != null && r.q != null && !r.flags.includes('DUP'));
  for (let i = 1; i < W.length - 1; i++) { const a = W[i - 1], b = W[i], c = W[i + 1]; if ((b.ms - a.ms) > 36 * 3600e3 || (c.ms - b.ms) > 36 * 3600e3) continue;
    const x = Math.log(b.q / a.q), y = Math.log(b.q / c.q), z = Math.log(c.q / a.q);
    if (Math.abs(x) > Math.log(3) && Math.abs(y) > Math.log(3) && Math.sign(x) === Math.sign(y) && Math.abs(z) < Math.log(1.5)) b.flags.push('JUMP'); }
  for (const r of W) if (r.flags.includes('JUMP')) r.q = null;
  return out;
}
export function daily(readings) {
  const D = new Map();
  for (const r of readings) { if (r.ms == null) continue; const d = isoDay(r.ms); const e = D.get(d) || { date: d, q06: null, qmax: null, n: 0, flagged: 0 }; D.set(d, e);
    if (r.q == null) { e.flagged++; continue; } e.n++; e.qmax = e.qmax == null ? r.q : Math.max(e.qmax, r.q);
    if (new Date(r.ms).getUTCHours() === 6 && !r.flags.includes('DUPCONFLICT')) e.q06 = r.q; }
  return [...D.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
/* the model series (m3/s) of one gauge cell from the GloFAS station file */
export function modelSeries(lake, column) {
  const f = join(lake, 'archive', 'glofas', 'glofas_irsa_daily.csv.gz'); if (!existsSync(f)) return null;
  const L = gunzipSync(readFileSync(f)).toString('utf8').split(/\r?\n/); const H = splitLine(L[0]); const j = H.indexOf(column); if (j < 0) return null;
  const S = new Map(); for (let i = 1; i < L.length; i++) { if (!L[i]) continue; const c = L[i].split(','); const v = Number(c[j]); if (c[j] !== '' && Number.isFinite(v)) S.set(c[0].slice(0, 10), v); }
  return S;
}
const halfMonth = (iso) => (Number(iso.slice(5, 7)) - 1) * 2 + (Number(iso.slice(8, 10)) > 15 ? 1 : 0);
/* rarity of the cell in the model's own record (river_rarity.py): Gumbel by moments on annual maxima of years with >= 350 days, 1997 on */
export function rarity(S, fromYear = 1997, toDay = '2026-09-22') {
  const Y = new Map(), B = Array.from({ length: 24 }, () => []);
  for (const [d, v] of S) { if (+d.slice(0, 4) < fromYear || d > toDay) continue; const y = d.slice(0, 4); const e = Y.get(y) || { n: 0, mx: -Infinity }; e.n++; e.mx = Math.max(e.mx, v); Y.set(y, e); B[halfMonth(d)].push(v); }
  const x = [...Y.values()].filter((e) => e.n >= 350).map((e) => e.mx); if (x.length < 20) return null;
  const m = x.reduce((s, v) => s + v, 0) / x.length, sd = Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
  const a = sd * Math.sqrt(6) / Math.PI, u = m - 0.5772156649 * a, q = (T) => u - a * Math.log(-Math.log(1 - 1 / T));
  const qt = (arr, p) => { const s = [...arr].sort((a, b) => a - b); if (!s.length) return null; const h = (s.length - 1) * p, lo = Math.floor(h); return s[lo] + (h - lo) * ((s[Math.min(lo + 1, s.length - 1)]) - s[lo]); };
  return { rp2: q(2), rp5: q(5), rp20: q(20), n: x.length, p95: B.map((b) => qt(b, 0.95)) };
}
/* = server/api/riverprob.mjs pOf + the cumulative order */
export function chances(M, qM3s, R, iso) {
  const p95 = R && R.p95[halfMonth(iso)]; if (!(qM3s > 0) || !R || !(R.rp2 > 0) || !(p95 > 0)) return null;
  const x = { r2: Math.log(qM3s / R.rp2), r95: Math.log(qM3s / p95) }; const xv = M.features.map((f) => x[f]); const out = {}; let prev = 1;
  for (const k of ['1', '2', '3']) { const T = M.thresholds[k]; if (!T) continue; let s = T.intercept; T.coef.forEach((c, i) => { s += c * xv[i]; });
    const p = 1 / (1 + Math.exp(-s)), X = T.isotonic.x, Yv = T.isotonic.y; let v;
    if (!X.length) v = p; else if (p <= X[0]) v = Yv[0]; else if (p >= X[X.length - 1]) v = Yv[Yv.length - 1]; else { let j = 1; while (j < X.length && X[j] < p) j++; v = Yv[j - 1] + (p - X[j - 1]) / ((X[j] - X[j - 1]) || 1) * (Yv[j] - Yv[j - 1]); }
    v = Math.min(prev, v); prev = v; out[k] = v; }
  return out;
}
/* Brier skill of p against a reference, with a 7-day-block bootstrap interval */
export function brierSkill(rows, pKey, refKey, yKey, B = 2000, seed = 20261023) {
  const R = rows.filter((r) => fin(r[pKey]) && fin(r[refKey]) && fin(r[yKey])); if (R.length < 20) return { n: R.length, bss: null, why: 'fewer than 20 scored days' };
  const blocks = new Map(); for (const r of R) { const w = Math.floor(Date.parse(r.date) / (7 * 864e5)); if (!blocks.has(w)) blocks.set(w, []); blocks.get(w).push(r); }
  const bs = (S) => { let a = 0, b = 0; for (const r of S) { a += (r[pKey] - r[yKey]) ** 2; b += (r[refKey] - r[yKey]) ** 2; } return b > 0 ? 1 - a / b : null; };
  const pt = bs(R); const K = [...blocks.values()]; const g = rng(seed); const draws = [];
  for (let i = 0; i < B; i++) { const S = []; for (let j = 0; j < K.length; j++) S.push(...K[Math.floor(g() * K.length)]); const v = bs(S); if (v != null) draws.push(v); }
  draws.sort((a, b) => a - b); const q = (p) => draws.length ? draws[Math.min(draws.length - 1, Math.floor(p * draws.length))] : null;
  return { n: R.length, events: R.filter((r) => r[yKey] === 1).length, bss: pt == null ? null : r3(pt), lo: r3(q(0.025)), hi: r3(q(0.975)), why: pt == null ? 'the reference made no error (no event and no false alarm): skill undefined' : null };
}

export function registerRiverTruth(dataDir, now = Date.now()) {
  const root = join(dataDir, 'flood-truth', 'river'), drop = join(root, 'drop'); mkdirSync(drop, { recursive: true });
  const regF = join(root, 'registry.json'); const reg = readJson(regF, null) || { schema: 'agn.river-truth.v1', about: 'river gauge sheets dropped by the operator (data/flood-truth/river/drop/): one entry per file', entries: [] };
  const have = new Set(reg.entries.map((e) => e.sha256)); let added = 0;
  for (const n of readdirSync(drop).sort()) { if (!/\.(csv|txt)$/i.test(n)) continue; const b = readFileSync(join(drop, n)); const h = createHash('sha256').update(b).digest('hex'); if (have.has(h)) continue;
    const st = stationOf(n); const head = b.toString('utf8').split(/\r?\n/)[0] || ''; const u = unitOf(n, head);
    reg.entries.push({ id: 'R' + h.slice(0, 10), file: 'drop/' + n, sha256: h, bytes: b.length, registeredAt: new Date(now).toISOString(), station: st, unit: u,
      status: !st ? 'not scorable: no known gauge in the file name (' + Object.keys(STATIONS).join(', ') + ')' : !u ? 'not scorable: state the unit (cusecs or kcusecs) in the file name or the header' : 'registered' });
    have.add(h); added++; }
  if (added) writeJsonAtomic(regF, reg);
  return { registry: reg, added };
}

export function scoreStation({ dataDir, lake, station = 'shahdara' }) {
  const S = STATIONS[station]; if (!S) return { status: 'not assessed', why: 'unknown gauge ' + station };
  const reg = registerRiverTruth(dataDir).registry; const files = reg.entries.filter((e) => e.station === station && e.status === 'registered');
  if (!files.length) return { status: 'not assessed', why: 'no registered gauge sheet for ' + S.name + ' in data/flood-truth/river/drop' };
  const byDay = new Map(); let readings = 0, flagged = 0;
  for (const e of files) { const R = parseSheet(readFileSync(join(dataDir, 'flood-truth', 'river', e.file), 'utf8'), e.unit, S.recordKcs); readings += R.length; flagged += R.filter((r) => r.q == null).length;
    for (const d of daily(R)) byDay.set(d.date, d); }   /* a later sheet replaces a day */
  const M = readJson(join(dataDir, 'river-prob-model.json')); const MS = lake ? modelSeries(lake, S.glofasColumn) : null; const RA = MS ? rarity(MS) : null;
  const days = [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1)); const out = []; let prevCls = null, prevDay = null;
  for (const d of days) { const obs = fin(d.q06) ? d.q06 : d.qmax; const cls = classOf(obs, S.limitsKcs); const q = MS ? MS.get(addDays(d.date, S.modelLagDays || 0)) : undefined;
    const qk = fin(q) ? q / M3_PER_KCS : null; const P = M && fin(q) ? chances(M, q, RA, d.date) : null;
    const yday = prevDay && (Date.parse(d.date) - Date.parse(prevDay)) === 864e5 ? prevCls : null;
    out.push({ date: d.date, q06Kcs: r1(d.q06), qmaxKcs: r1(d.qmax), cls, clsName: cls == null ? null : CLASSES[cls], modelKcs: r1(qk), modelCls: classOf(qk, S.limitsKcs), errKcs: fin(qk) && fin(obs) ? r1(qk - obs) : null,
      p1: P ? r3(P['1']) : null, p2: P ? r3(P['2']) : null, persCls: yday, y1: cls == null ? null : +(cls >= 1), y2: cls == null ? null : +(cls >= 2),
      pers1: yday == null ? null : +(yday >= 1), pers2: yday == null ? null : +(yday >= 2), clim1: S.climBase.low, clim2: S.climBase.medium });
    prevCls = cls; prevDay = d.date; }
  const season = out.filter((r) => { const m = +r.date.slice(5, 7); return m >= 6 && m <= 10; });
  const mae = (R) => { const e = R.filter((r) => fin(r.errKcs)).map((r) => Math.abs(r.errKcs)); return e.length ? r1(e.reduce((s, x) => s + x, 0) / e.length) : null; };
  const summary = { station, name: S.name, served: false, at: new Date().toISOString(), lead: 0, files: files.length, readings, flaggedReadings: flagged, days: out.length, seasonDays: season.length,
    first: out[0] && out[0].date, last: out.length ? out[out.length - 1].date : null,
    model: MS ? { cell: S.cell, upAreaKm2: S.upAreaKm2, maeKcs: mae(out), seasonMaeKcs: mae(season), rarity: RA && { rp2M3s: r1(RA.rp2), rp5M3s: r1(RA.rp5), years: RA.n } } : { why: 'the GloFAS station file is not on this computer (station-lake/archive/glofas)' },
    chanceLow: { vsPersistence: brierSkill(season, 'p1', 'pers1', 'y1'), vsClimatology: brierSkill(season, 'p1', 'clim1', 'y1') },
    chanceMedium: { vsPersistence: brierSkill(season, 'p2', 'pers2', 'y2'), vsClimatology: brierSkill(season, 'p2', 'clim2', 'y2') },
    observedDaysByClass: CLASSES.map((c, i) => [c, out.filter((r) => r.cls === i).length]), evidence: S.evidence };
  const dir = join(dataDir, 'agents', 'river', station); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'days.jsonl'), out.map((r) => JSON.stringify(r)).join('\n') + '\n'); writeJsonAtomic(join(dir, 'summary.json'), summary);
  return { status: 'ok', summary };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const A = args(); const dataDir = A.data; if (!dataDir) { console.log('usage: node scripts/agents/river_truth.mjs --data <dir> --lake <station-lake> [--station shahdara]'); process.exit(2); }
  const r = scoreStation({ dataDir, lake: A.lake, station: A.station || 'shahdara' });
  console.log(r.status === 'ok' ? 'river truth ' + r.summary.name + ': ' + r.summary.days + ' days (' + r.summary.first + '..' + r.summary.last + '), model MAE ' + (r.summary.model.maeKcs ?? 'n/a') + ' thousand cusecs' : r.why);
}
