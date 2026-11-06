/* ══ v91.17.283.49 · NIGRAAN 1.0.10 (L11 all-Normal fix 91.17.283.50) · THE REPORT LINTER ═════════════════════════════════════════════════════════════════════════════
   Every report the engine makes is checked before it is stored or sent (and the test suite runs the same checks on every page of 5 places
   in both views). It reads the drawn text of every page (the same operations the PDF and the HTML are written from), the engine's
   manifest, the PDF and the HTML. A failure is named with the page and the text. The checks (from the owner's and two external reviews of
   the I-8 report of 2 Nov 2026):
     L1 no server address (localhost, 127.0.0.1, http links other than the company site)       L2 no file name or path, no endpoint path
     L3 no internal table name (UPPER_SNAKE)                                                      L4 no truncation ("…" or "...")
     L5 no error string ("did not answer", "failed", "undefined", "NaN", "null", "No asset is active", ...)
     L6 no version or debug text                                                                  L7 no agency or supplier name (NDMA / PDMA allowed)
     L8 no leftover numbering in headings ("4. Prescriptive")                                    L9 no duplicate table
     L10 no section, tile or chart for a hazard that cannot happen here (only the "Not relevant here" line and the appendix reason table)
     L11 the summary sentence agrees with the tiles, air quality included                         L12 the customer part is at most 2 pages
     L13 no overlapping text, no text outside the page                                            L14 no empty section
     L15 every standing measure has its own action (Action differs from Why)                     L16 no blue or navy colour
     L17 the PDF is a PDF with the pages the manifest counts; the HTML has no script and no remote reference
     L18 every character is one the embedded font can draw (no empty boxes: a place name in another script is not printed) */
import { font } from './repfont.mjs';
const AGENCY = /\b(PMD|FFD|IRSA|EPD|SUPARCO|WAPDA|ECMWF|NOAA|NASA|USGS|Copernicus|CAMS|CHIRPS|IMERG|GloFAS|HydroBASINS|HMAGLOFDB|Hi-MAG|Open-Meteo|ERA5|SEAS5|EC46|SoilGrids|WorldCover|MODIS|VIIRS|FIRMS|SMAP|Sentinel|Landsat|Space4Climate|Visual Crossing|Ogimet)\b/;
const ERR = /did not answer|server error|\berror:|(?:request|fetch|load|read|call|connection)\s+failed|\bfailed to\b|\bundefined\b|\bNaN\b|\bnull\b|\[object|timed out|\bnot found\b|could not be read|No asset is active|\bInfinity\b|ECONN|stack trace|\bexception\b/i;
const VERS = /\bv\d+\.\d+\.\d+|\b9[01]\.\d+\.\d+|\bgate-\d|\bdebug\b|\bDRAFT\b|\bTODO\b|\bFIXME\b|\bplace-record-\d|\bschema\b/i;
function hue(hex) { const h = String(hex || '').replace('#', ''); if (h.length !== 6) return null; const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return { h: 0, s: 0 }; let H; if (mx === r) H = ((g - b) / d) % 6; else if (mx === g) H = (b - r) / d + 2; else H = (r - g) / d + 4;
  return { h: (H * 60 + 360) % 360, s: d / (1 - Math.abs(mx + mn - 1) || 1) }; }
export function lint({ cv, manifest: M, pdf, html, answer: A }) {
  const fail = [], add = (code, page, what) => { if (fail.length < 200) fail.push({ code, page, what: String(what).slice(0, 200) }); };
  const cannotNames = new Set(((A && A.cannotHappen) || []).map((c) => String(c.name).toLowerCase()));
  cv.pages.forEach((p, pi) => {
    const pg = pi + 1, boxes = [];
    for (const o of p.ops) {
      if ((o.k === 'rect' || o.k === 'path' || o.k === 'circle') && (o.fill || o.stroke)) for (const c of [o.fill, o.stroke]) { const x = hue(c); if (x && x.s > 0.3 && x.h >= 195 && x.h <= 260) add('L16', pg, 'blue colour ' + c); }
      if (o.k !== 'text' || !o.s) continue;
      const t = o.s;
      if (/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(t) || /https?:\/\/(?!www\.aigeo360\.com)/i.test(t)) add('L1', pg, t);
      if (/\b[\w.-]+\/[\w./-]+\.(?:json|jsonl|mjs|js|csv|py|html|parquet|gz)\b/.test(t) || /\b[\w-]+\.(?:json|jsonl|mjs|csv|py|parquet|npz)\b/.test(t) || /(?:^|\s)\/(?:api|n3|px)\//.test(t) || /[A-Z]:\\/.test(t)) add('L2', pg, t);
      if (/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/.test(t)) add('L3', pg, t);
      if (/…|\.\.\./.test(t)) add('L4', pg, t);
      if (ERR.test(t)) add('L5', pg, t);
      if (VERS.test(t)) add('L6', pg, t);
      if (AGENCY.test(t)) add('L7', pg, t);
      { const f0 = font(o.b ? 'B' : 'R'); for (const ch of t) { const cp = ch.codePointAt(0); if (cp > 32 && !f0.gid(cp)) { add('L18', pg, 'character the font cannot draw (U+' + cp.toString(16).toUpperCase() + '): ' + t); break; } } }
      const f = font(o.b ? 'B' : 'R'), w = f.measure(t, o.size), x0 = o.anchor === 'middle' ? o.x - w / 2 : o.anchor === 'end' ? o.x - w : o.x;
      const bx = [x0, o.y - o.size * 0.74, x0 + w, o.y + o.size * 0.2];
      if (bx[0] < -0.5 || bx[2] > cv.w + 0.5 || bx[1] < -0.5 || bx[3] > cv.h + 0.5) add('L13', pg, 'outside the page: ' + t);
      for (const q of boxes) { const ix = Math.min(bx[2], q.b[2]) - Math.max(bx[0], q.b[0]), iy = Math.min(bx[3], q.b[3]) - Math.max(bx[1], q.b[1]);
        if (ix > 0.6 && iy > 0.8) { add('L13', pg, 'overlap: "' + q.t + '" / "' + t + '"'); break; } }
      boxes.push({ b: bx, t });
    }
  });
  for (const s of M.sections || []) { if (/^\s*(?:\d+|[A-Z])\.\s*\d*\s/.test(s.title) || /^\s*[IVX]+\.\s/.test(s.title)) add('L8', s.page, s.title); if (!s.items) add('L14', s.page, 'empty section: ' + s.title); }
  { const seen = new Map(); for (const t of M.tables || []) { const k = t.sig; if (seen.has(k)) add('L9', null, 'table printed twice: ' + t.title); seen.set(k, 1); }
    const tt = new Map(); for (const t of M.tables || []) { tt.set(t.title, (tt.get(t.title) || 0) + 1); } for (const [k, n] of tt) if (n > 1 && !/Evidence/.test(k)) add('L9', null, 'table title twice: ' + k); }
  /* L10 */
  for (const t of M.tiles || []) if (cannotNames.has(String(t.hazard).toLowerCase())) add('L10', 1, 'tile for a hazard that cannot happen here: ' + t.hazard);
  for (const s of M.sections || []) { const tl = String(s.title).toLowerCase(); for (const c of cannotNames) if (tl.includes(c)) add('L10', s.page, 'section for a hazard that cannot happen here: ' + s.title);
    if (s.title === 'glofPanel' && ((A && A.cannotHappen) || []).some((c) => c.key === 'glof')) add('L10', s.page, 'glacial lake panel where glacial lake floods cannot happen'); }
  if ((M.sections || []).some((s) => s.title === 'glofPanel') && A && A.glof && !(A.glof.lakesUpstream > 0)) add('L10', null, 'glacial lake panel with no lake upstream');
  /* L11 · the banner against the tiles */
  const S = M.summary && M.summary.facts || {}, tiles = M.tiles || [];
  for (const h of S.hazards || []) for (const d of h.dates || []) { const t = tiles.find((x) => x.hazard === h.name && x.date === d); if (!t || t.word !== h.word) add('L11', 1, 'summary says ' + h.name + ' ' + h.word + ' on ' + d + ', the tile says ' + (t ? t.word : 'nothing')); }
  { const named = new Set((S.hazards || []).map((h) => h.name)), ord = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
    const worstTile = tiles.filter((t) => t.hazard !== 'Air quality').reduce((m, t) => Math.max(m, ord.indexOf(t.word)), -1);
    if (!(S.hazards || []).length && worstTile > 0) add('L11', 1, 'summary says no hazard above Normal, a tile says ' + ord[worstTile]);
    const top = Math.max(-1, ...(S.hazards || []).map((h) => ord.indexOf(h.word)));
    /* v91.17.283.50 · a Normal tile (or a tile with no level word) is never "worse" than the summary: only a tile at Low or above that the
       summary does not name, above the worst level it names, is a contradiction (1.0.10 refused every report of a quiet place: E-7, 3 Nov) */
    for (const t of tiles) { const lv = ord.indexOf(t.word); if (t.hazard !== 'Air quality' && lv >= 1 && lv > top && !named.has(t.hazard) && (S.hazards || []).length < 3) add('L11', 1, 'tile ' + t.hazard + ' ' + t.word + ' is worse than anything the summary names'); } }
  { const aq = tiles.filter((t) => t.hazard === 'Air quality');
    /* the served air level (Normal…Severe) and the AQI category (Good…Hazardous) are two scales; "Moderate" is in both, so each
       report is ranked on the scale its words come from (one mixed list ranked Low above Moderate and refused quiet places) */
    const LV = ['normal', 'low', 'moderate', 'high', 'severe'], CAT = ['good', 'moderate', 'unhealthy for sensitive groups', 'unhealthy', 'very unhealthy', 'hazardous'];
    if (aq.length && !S.air) add('L11', 1, 'air quality tiles but no air quality in the summary');
    if (S.air) { for (const d of S.air.dates || []) { const t = aq.find((x) => x.date === d); if (!t || String(t.word).toLowerCase() !== String(S.air.word).toLowerCase()) add('L11', 1, 'summary air quality ' + S.air.word + ' on ' + d + ', tile ' + (t ? t.word : 'none')); }
      const words = [S.air.word, ...aq.map((t) => t.word)].map((w) => String(w).toLowerCase());
      const ord = words.every((w) => LV.includes(w)) ? LV : CAT;
      const sv = ord.indexOf(String(S.air.word).toLowerCase()); for (const t of aq) if (sv >= 0 && ord.indexOf(String(t.word).toLowerCase()) > sv) add('L11', 1, 'air quality tile ' + t.word + ' on ' + t.date + ' is worse than the summary'); }
    if (/air quality/i.test(M.summary && M.summary.text || '') && !aq.length) add('L11', 1, 'summary names air quality, no tile shows it'); }
  /* L12 */
  if ((M.customerPages || 0) > 2) add('L12', null, 'customer part is ' + M.customerPages + ' pages');
  /* L15 */
  for (const t of M.tables || []) if (t.title === 'Standing measures') { let rows = []; try { rows = JSON.parse(t.sig); } catch (_) {} for (const r of rows) if (!r[1] || r[1] === r[2] || String(r[1]).toLowerCase() === String(r[2]).toLowerCase()) add('L15', null, 'standing measure without its own action: ' + r[0]); }
  for (const a of M.actions || []) if (!a.action || (a.trigger && a.action.toLowerCase() === a.trigger.toLowerCase())) add('L15', 1, 'action repeats its trigger: ' + a.title);
  /* L17 */
  if (pdf) { const head = pdf.subarray(0, 8).toString('latin1'); if (!head.startsWith('%PDF-')) add('L17', null, 'not a PDF');
    const m = /\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(pdf.toString('latin1')); if (!m || +m[1] !== M.pages) add('L17', null, 'PDF page count ' + (m ? m[1] : '?') + ' against ' + M.pages); }
  if (html) { if (/<script\b/i.test(html)) add('L17', null, 'script in the HTML'); if (/(?:src|href)\s*=\s*["'](?!data:|#)/i.test(html) || /url\((?!data:|#)/i.test(html)) add('L17', null, 'remote reference in the HTML'); }
  return { ok: !fail.length, failures: fail, checks: 18 };
}
