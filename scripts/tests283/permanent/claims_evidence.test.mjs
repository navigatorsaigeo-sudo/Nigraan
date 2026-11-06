/* v91.17.283 · WS7 · PERMANENT CHECK (b) · EVERY SKILL / ACCURACY FIGURE A CLIENT READS HAS A MEASURED SOURCE.
   Claims: the skill / accuracy statements in the served pages (artefact/*.html: text, attributes, data blocks and string literals) and in
   the server's own text (string literals of server/*.mjs and server/api/*.mjs; the served text files data/model-gate.json,
   data/map-layer-scales.json, data/hazard-applicability.json). A statement is a claim when an accuracy word (off by, error, MAE, RMSE,
   AUC, Brier, skill, POD, hit / detection / false-alarm rate, held / coverage, too warm / too cool, Spearman / correlation, verified,
   validated, out of sample) stands within 90 characters of a figure in °C or % or a metric value (AUC 0.74, MAE 0.78).
   Evidence: the measured tables in this install, read as numbers, never typed here:
     validation*.json files under build (SCI2821 out-of-sample summary; its "source" summary.json when that path exists),
     data/*.json whose name says it holds a measurement (skill, score, verif, valid, calib, reliab, backtest, accuracy, ranking, test,
     retrain, eval) except the gate files themselves (model-gate*.json: they are claims, not measurements),
     and every .json / .csv under the folders in NIGRAAN_EVIDENCE_DIRS (OS path delimiter; e.g. the SCI2821 science folder, the laptop's
     station-lake/reports).
   A figure matches when an evidence number equals it at the precision the claim prints (1.5 matches 1.45..1.55; 94 % matches 94 or 0.94
   at that precision). A % next to range / interval / CI / confidence / band is the interval's nominal level, not a measured figure.
   C1 every figure of every claim matches an evidence number; the unmatched claims are listed (file, figure, the sentence).
   Expected to FAIL on base v91.17.282.1 (WS4 rewrites the claims from the evidence files in round 2).
   usage: node scripts/tests283/permanent/claims_evidence.test.mjs [--list]   (offline; no server) */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, delimiter } from 'node:path';
import * as T from '../../lib/testenv.mjs';

let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 6000) : '')); } };
const LIST = process.argv.includes('--list');
const deU = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&deg;/g, '°').replace(/&ndash;/g, '–').replace(/&nbsp;|\u00a0|\u202f/g, ' ');

/* ── evidence ── */
const EV = []; const EVF = []; const evFiles = []; let curF = -1;
/* only numbers that are measurements: values under a metric-like key (mae, rmse, auc, brier, bias, coverage, pod, far, skill, hit,
   spearman, rho, corr, error, accuracy, exact, crps, reliability, score, ci, lo/hi, p90, ...) or inside a measured statement text
   (the "lines" / "summary" / "text" strings of an evidence file); coefficients, coordinates, counts, dates and raw series (numeric arrays longer than 12) are not evidence */
const MKEY = /(^|[_\-. ]|[a-z](?=[A-Z]))(mae|rmse|auc|brier|bias|cover(age)?|pod|far|csi|ets|hss|skill|hit|spearman|rho|corr\w*|r2|err(or)?s?|acc(uracy)?|exact|crps|reliab\w*|score|ci(95|90)?|lo|hi|lower|upper|p90|p10|mean_?abs\w*|mean|median|rate|share|frac\w*|pct|percent|gain|diff|delta|obs\w*|forecast\w*|brierss|bss|logloss|roc|precision|recall|f1)([_\-. ]|$|[A-Z0-9])/i;
const TEXTKEY = /^(lines?|summary|text|statement|claim|note|result|results|finding|findings|verdict)$/i;
const numsIn = (s) => { for (const m of deU(s).matchAll(/-?\d+(?:\.\d+)?/g)) EV.push(Number(m[0])); };
const addNums = (o, keyOk = false, key = '') => {
  if (typeof o === 'number' && isFinite(o)) { if (keyOk) EV.push(o); return; }
  if (typeof o === 'string') { if (keyOk || TEXTKEY.test(key)) numsIn(o); return; }
  if (Array.isArray(o)) { if (o.length > 12 && o.every((x) => typeof x === 'number' || x == null)) return;   /* a raw series (per hour, per day), not a summary figure */
    o.forEach((x) => addNums(x, keyOk, key)); return; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) addNums(v, keyOk || MKEY.test(k), TEXTKEY.test(k) ? k : key);
};
const addCsv = (t) => { const rows = t.split(/\r?\n/).filter(Boolean); if (!rows.length) return; const H = rows[0].split(','); const keep = H.map((h) => MKEY.test(h.trim()));
  for (const r of rows.slice(1)) r.split(',').forEach((c, i) => { if (keep[i] && c !== '' && isFinite(Number(c))) EV.push(Number(c)); }); };
const addFile = (f) => { try { const t = readFileSync(f, 'utf8'); curF = evFiles.length; const n0 = EV.length; if (/\.json$/i.test(f)) addNums(JSON.parse(t)); else addCsv(t); evFiles.push(f); for (let i = n0; i < EV.length; i++) EVF[i] = curF; } catch (_) {} };
const walk = (d, fn) => { if (!existsSync(d)) return; for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p); if (st.isDirectory()) { if (n !== 'node_modules' && n !== '.git') walk(p, fn); } else fn(p); } };
walk(T.repoPath('build'), (p) => { if (/validation[^\\/]*\.json$/i.test(p)) { addFile(p); try { const s = JSON.parse(readFileSync(p, 'utf8')).source; if (s && existsSync(s)) addFile(s); } catch (_) {} } });
for (const n of readdirSync(T.repoPath('data'))) if (/\.json$/.test(n) && /(^|[-_])(skill|score|verif\w*|verify|valid\w*|calib\w*|reliab\w*|backtest|accura\w*|ranking|test\w*|retrain|eval\w*)([-_.]|$)/i.test(n) && !/^model-gate/.test(n)) addFile(T.repoPath('data', n));
/* v91.17.283.10 integration: the floodscore measured tables (data/evidence/floodscore, the flash-flood-rain-observed gate entry's evidence) */
walk(T.repoPath('data', 'evidence', 'floodscore'), (p) => { if (/\.json$/i.test(p)) addFile(p); });
for (const d of String(process.env.NIGRAAN_EVIDENCE_DIRS || '').split(delimiter).filter(Boolean)) walk(d, (p) => { if (/\.(json|csv)$/i.test(p)) addFile(p); });
const ORD = EV.map((v, i) => i).sort((a, b) => EV[a] - EV[b]); const EVS = Float64Array.from(ORD.map((i) => EV[i])); const EVSF = ORD.map((i) => EVF[i]);
const has = (v, dec, pct) => { const tol = 0.5 * Math.pow(10, -dec) + 1e-9;
  const cands = [v]; if (pct) cands.push(v / 100); for (const c of cands) { const t = c === v ? tol : tol / 100;
    let lo = 0, hi = EVS.length; while (lo < hi) { const m = (lo + hi) >> 1; if (EVS[m] < c - t) lo = m + 1; else hi = m; } if (lo < EVS.length && EVS[lo] <= c + t) return relative(T.ROOT, evFiles[EVSF[lo]]) || evFiles[EVSF[lo]]; } return false; };

/* ── claims ── */
const KW = /off by|\berrors?\b|mean absolute|\bMAE\b|RMSE|\bAUC\b|Brier|\bskill\b|\bPOD\b|hit rate|detection rate|detected|false[- ]alarm|\bheld\b|coverage|too (?:warm|cool|cold|dry|wet)|Spearman|correlation|\brho\b|verified|validated|out of sample|held[- ]out|accura/i;
const FIG = /(?<![\w.])(-?\d+(?:\.\d+)?)(?:\s*(?:–|-|to)\s*(-?\d+(?:\.\d+)?))?\s*(%|°C|° C|percent)/g;
const MET = /\b(AUC|Brier(?: score)?|MAE|RMSE|CRPS|skill(?: score)?(?: of)?|POD(?: [A-Za-z+]+)?|Spearman|rho|ρ|correlation(?: of)?|r²|R²|hit rate(?: of)?|false[- ]alarm (?:rate|ratio)(?: of)?)\s*(?:=|:|≈|~|of)?\s*(-?\d*\.\d+|\d+(?:\.\d+)?)(?!\s*(?:%|°))/gi;
const NOMINAL = /(range|interval|\bCI\b|confidence|credible|band|quantile|percentile)\s*$/i;
const claims = [];
function scan(text, where) {
  const s = deU(text);
  const seen = new Set();
  const take = (i, j, figs) => { const a = Math.max(0, i - 90), b = Math.min(s.length, j + 90); const ctx = s.slice(a, b); if (!KW.test(ctx.replace(/\b(?:not|never|un)\s*(?:been\s+|yet\s+)?(?:verified|validated|tested|scored)\b/gi, ' '))) return;   /* "not verified" marks a screening rule, not a skill claim */
    if (!/[A-Za-z]{3,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(ctx)) return;   /* words, not code */
    const line = s.slice(0, i).split('\n').length;
    for (const f of figs) { const key = line + '|' + f.v + f.u; if (seen.has(key)) continue; seen.add(key);
      claims.push({ where, line, fig: f.raw, v: f.v, dec: (String(f.v).split('.')[1] || '').length, pct: f.u === '%', u: f.u, ctx: ctx.replace(/\s+/g, ' ').trim() }); } };
  for (const m of s.matchAll(FIG)) {
    const before = s.slice(Math.max(0, m.index - 40), m.index), after = s.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (m[3] === '%' && (NOMINAL.test(before.trim()) || /^\s*(range|interval|CI|confidence|credible|band|of the members|of members)/i.test(after))) continue;
    if (/^\s*(range|interval|CI\b|confidence|credible)/i.test(after)) continue;
    const u = m[3].replace(/\s/g, '').replace('percent', '%');
    const figs = [m[1], m[2]].filter((x) => x != null).map((x) => ({ raw: x + ' ' + u, v: Math.abs(Number(x)), u }));
    take(m.index, m.index + m[0].length, figs);
  }
  for (const m of s.matchAll(MET)) take(m.index, m.index + m[0].length, [{ raw: m[1] + ' ' + m[2], v: Math.abs(Number(m[2])), u: '' }]);
}
/* pages */
const pages = readdirSync(T.repoPath('artefact')).filter((f) => /\.html?$/i.test(f));
for (const f of pages) {
  const html = readFileSync(T.repoPath('artefact', f), 'utf8');
  /* visible text and attributes (tags out), data blocks, and the quoted strings inside the page code */
  const noScript = html.replace(/<script\b(?![^>]*application\/(?:ld\+)?json)[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  scan(noScript.replace(/<[^>]+?>/g, (t) => ' ' + (t.match(/(?:title|aria-label|alt|placeholder|content)="[^"]*"/gi) || []).join(' ') + ' '), 'artefact/' + f + ' (text)');
  for (const m of html.matchAll(/<script\b(?![^>]*application\/(?:ld\+)?json)[^>]*>([\s\S]*?)<\/script>/gi)) for (const q of m[1].matchAll(/'((?:[^'\\\n]|\\.){12,})'|"((?:[^"\\\n]|\\.){12,})"|`([^`]{12,})`/g)) scan(q[1] || q[2] || q[3], 'artefact/' + f + ' (page code string)');
}
/* server text: string literals only (comments out) */
const srvFiles = []; walk(T.repoPath('server'), (p) => { if (/\.mjs$/.test(p)) srvFiles.push(p); });
for (const f of srvFiles) {
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');
  for (const q of src.matchAll(/'((?:[^'\\\n]|\\.){12,})'|"((?:[^"\\\n]|\\.){12,})"|`([^`]{12,})`/g)) {
    const line = src.slice(0, q.index).split('\n').length; const before = claims.length;
    scan(q[1] || q[2] || q[3], relative(T.ROOT, f).split('\\').join('/'));
    for (let i = before; i < claims.length; i++) claims[i].line = line;
  }
}
for (const n of ['model-gate.json', 'map-layer-scales.json', 'hazard-applicability.json']) if (existsSync(T.repoPath('data', n))) {
  const strs = []; const grab = (o) => { if (typeof o === 'string') strs.push(o); else if (Array.isArray(o)) o.forEach(grab); else if (o && typeof o === 'object') Object.values(o).forEach(grab); };
  grab(JSON.parse(readFileSync(T.repoPath('data', n), 'utf8'))); for (const s of strs) scan(s, 'data/' + n);
}

ok(EVS.length > 0, 'evidence read: ' + evFiles.length + ' files, ' + EVS.length + ' measured numbers (' + evFiles.map((f, i) => (relative(T.ROOT, f) || f) + ' ' + EVF.filter((x) => x === i).length).join(', ') + ')');
const bad = claims.filter((c) => !has(c.v, c.dec, c.pct));
const byFile = {}; for (const c of bad) (byFile[c.where] = byFile[c.where] || []).push(c);
if (LIST) for (const c of claims) { const src = has(c.v, c.dec, c.pct); console.log((src ? 'match   ' : 'NO SRC  ') + c.where + ':' + c.line + '  ' + c.fig + (src ? '  [' + src + ']' : '') + '  · ' + c.ctx.slice(0, 200)); }
ok(!bad.length, 'C1 every skill / accuracy figure a client reads matches a measured number (' + claims.length + ' figures in ' + new Set(claims.map((c) => c.where)).size + ' files; ' + bad.length + ' without a source)',
  Object.entries(byFile).map(([f, l]) => f + ': ' + l.slice(0, 6).map((c) => 'L' + c.line + ' ' + c.fig + ' "' + c.ctx.slice(0, 140) + '"').join(' ; ') + (l.length > 6 ? ' ; +' + (l.length - 6) + ' more' : '')).join(' || '));
console.log('\nclaims vs evidence: ' + pass + ' pass, ' + fail + ' fail');
process.exitCode = fail ? 1 : 0;
