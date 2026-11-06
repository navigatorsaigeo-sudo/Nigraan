/* ══ v91.17.283.49 · NIGRAAN 1.0.10 · REPORT ENGINE · THE CANVAS ═════════════════════════════════════════════════════════════════════
   A report is laid out once, as pages of drawing operations in points (A4, 595.28 x 841.89, origin top-left), and written twice from
   the same operations: a PDF (pdf()) and an HTML page of inline SVG pages (html()). No browser, no print dialog, no dependency.
   Operations: rect (rounded corners), path (M L C Z), circle, text (Carlito / Carlito Bold, anchored start / middle / end), hatch (the
   light grey "cannot happen here" hatch). Colours are #rrggbb; fill opacity per operation. */
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { font, subset } from './repfont.mjs';

export const A4 = { w: 595.28, h: 841.89 };
const r2 = (x) => Math.round(x * 100) / 100;
const KAPPA = 0.5522847498;

export class Canvas {
  constructor(w = A4.w, h = A4.h) { this.w = w; this.h = h; this.pages = []; this.cur = null; }
  page(meta) { this.cur = { ops: [], meta: meta || {} }; this.pages.push(this.cur); return this.cur; }
  op(o) { if (!this.cur) this.page(); this.cur.ops.push(o); return o; }
  rect(x, y, w, h, o = {}) { return this.op({ k: 'rect', x, y, w, h, ...o }); }
  path(d, o = {}) { return this.op({ k: 'path', d, ...o }); }
  line(x1, y1, x2, y2, o = {}) { return this.op({ k: 'path', d: [['M', x1, y1], ['L', x2, y2]], stroke: o.stroke || '#000000', lw: o.lw || 0.5, ...o }); }
  circle(cx, cy, rad, o = {}) { return this.op({ k: 'circle', cx, cy, rad, ...o }); }
  /* v91.17.283.51 fix · backstop: a line that would run past the page edge (20 pt margin) is drawn smaller to fit (down to 5 pt), never off
     the page; the layout wraps long text before it gets here (the deploy of 3 Nov 18:31 was rolled back on such a line, L13) */
  text(x, y, s, o = {}) { const str = String(s == null ? '' : s), anchor = o.anchor || 'start'; let size = o.size || 9;
    if (str && anchor === 'start' && Number.isFinite(x)) { const room = this.w - 20 - x, w = this.measure(str, size, !!o.b); if (room > 0 && w > room) size = Math.max(5, size * room / w); }
    return this.op({ k: 'text', x, y, s: str, size, b: !!o.b, fill: o.fill || '#1F2A24', anchor, data: o.data || null }); }
  hatch(x, y, w, h, o = {}) { return this.op({ k: 'hatch', x, y, w, h, r: o.r || 0 }); }
  measure(s, size, b) { return font(b ? 'B' : 'R').measure(s, size); }
}

/* ── geometry shared by both writers ── */
function rrect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r || 0, w / 2, h / 2)); if (!r) return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  const k = r * KAPPA;
  return [['M', x + r, y], ['L', x + w - r, y], ['C', x + w - r + k, y, x + w, y + r - k, x + w, y + r], ['L', x + w, y + h - r], ['C', x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h],
    ['L', x + r, y + h], ['C', x + r - k, y + h, x, y + h - r + k, x, y + h - r], ['L', x, y + r], ['C', x, y + r - k, x + r - k, y, x + r, y], ['Z']];
}
function circ(cx, cy, r) { const k = r * KAPPA;
  return [['M', cx + r, cy], ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r], ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy], ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r], ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy], ['Z']]; }
const HATCH_BG = '#F1F2F0', HATCH_LN = '#C9CEC9';
function rgb(hex) { const h = String(hex || '#000000').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => r2(v / 255)); }

/* ══ PDF ══ */
export function pdf(cv, info = {}) {
  /* the code points each font draws */
  const used = { R: new Set([32]), B: new Set([32]) };
  for (const p of cv.pages) for (const o of p.ops) if (o.k === 'text') for (const ch of o.s) used[o.b ? 'B' : 'R'].add(ch.codePointAt(0));
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  const gs = new Map(); const gsName = (a) => { const k = r2(a); if (!gs.has(k)) gs.set(k, 'G' + gs.size); return gs.get(k); };
  const enc = (o, f) => { let h = ''; for (const ch of o.s) h += f.gid(ch.codePointAt(0)).toString(16).padStart(4, '0'); return h; };
  const seg = (d, H) => d.map((c) => c[0] === 'M' ? r2(c[1]) + ' ' + r2(H - c[2]) + ' m' : c[0] === 'L' ? r2(c[1]) + ' ' + r2(H - c[2]) + ' l'
    : c[0] === 'C' ? [c[1], H - c[2], c[3], H - c[4], c[5], H - c[6]].map(r2).join(' ') + ' c' : 'h').join('\n');
  const paint = (o) => { const f = o.fill && o.fill !== 'none', s = o.stroke && o.stroke !== 'none'; return f && s ? 'B' : f ? 'f' : s ? 'S' : 'n'; };
  const style = (o) => { let t = ''; if (o.fill && o.fill !== 'none') t += rgb(o.fill).join(' ') + ' rg\n'; if (o.stroke && o.stroke !== 'none') t += rgb(o.stroke).join(' ') + ' RG\n' + r2(o.lw || 0.5) + ' w\n' + (o.dash ? '[' + o.dash.join(' ') + '] 0 d\n' : '[] 0 d\n') + (o.cap ? (o.cap === 'round' ? 1 : 0) + ' J\n' : '');
    if (o.op != null && o.op < 1) t += '/' + gsName(o.op) + ' gs\n'; return t; };
  const content = (p) => { const H = cv.h, out = [];
    for (const o of p.ops) {
      if (o.k === 'text') { if (!o.s) continue; const f = font(o.b ? 'B' : 'R'), w = f.measure(o.s, o.size), x = o.anchor === 'middle' ? o.x - w / 2 : o.anchor === 'end' ? o.x - w : o.x;
        out.push('BT\n' + rgb(o.fill).join(' ') + ' rg\n/' + (o.b ? 'F2' : 'F1') + ' ' + r2(o.size) + ' Tf\n1 0 0 1 ' + r2(x) + ' ' + r2(H - o.y) + ' Tm\n<' + enc(o, f) + '> Tj\nET'); continue; }
      if (o.k === 'hatch') { const d = rrect(o.x, o.y, o.w, o.h, o.r); let t = 'q\n' + seg(d, H) + '\nW n\n' + rgb(HATCH_BG).join(' ') + ' rg\n' + seg(d, H) + '\nf\n' + rgb(HATCH_LN).join(' ') + ' RG\n0.8 w\n[] 0 d\n';
        for (let s = -o.h; s < o.w; s += 4.5) t += r2(o.x + s) + ' ' + r2(H - (o.y + o.h)) + ' m ' + r2(o.x + s + o.h) + ' ' + r2(H - o.y) + ' l\n'; out.push(t + 'S\nQ'); continue; }
      const d = o.k === 'rect' ? rrect(o.x, o.y, o.w, o.h, o.r) : o.k === 'circle' ? circ(o.cx, o.cy, o.rad) : o.d;
      out.push('q\n' + style(o) + seg(d, H) + '\n' + paint(o) + '\nQ'); }
    return out.join('\n'); };
  /* fonts: one Type0 / CIDFontType2 each, subset, Identity-H, ToUnicode */
  const catalog = add(null), pagesObj = add(null), fontRef = {};
  for (const [tag, st] of [['F1', 'R'], ['F2', 'B']]) {
    const f = font(st), cps = used[st], data = subset(st, cps), z = deflateSync(data);
    const tagName = createHash('sha1').update(data).digest('hex').slice(0, 6).toUpperCase().replace(/[0-9]/g, (d) => 'GHIJKLMNOP'[d]) + '+' + f.name;
    const file = add({ stream: z, dict: '/Filter /FlateDecode /Length1 ' + data.length });
    const k = 1000 / f.upm, bb = f.bbox.map((v) => Math.round(v * k));
    const desc = add('<< /Type /FontDescriptor /FontName /' + tagName + ' /Flags 32 /FontBBox [' + bb.join(' ') + '] /ItalicAngle 0 /Ascent ' + Math.round(f.ascent * k) + ' /Descent ' + Math.round(f.descent * k) + ' /CapHeight ' + Math.round((f.capH || f.ascent * 0.7) * k) + ' /StemV ' + (st === 'B' ? 120 : 80) + ' /FontFile2 ' + file + ' 0 R >>');
    const gl = [...new Set([...cps].map((c) => f.gid(c)))].filter(Boolean).sort((a, b) => a - b);
    const W = gl.map((g) => g + ' [' + Math.round(f.adv[g] * k) + ']').join(' ');
    const cid = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /' + tagName + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + desc + ' 0 R /W [' + W + '] /DW 0 /CIDToGIDMap /Identity >>');
    const map = new Map(); for (const c of cps) { const g = f.gid(c); if (g && !map.has(g)) map.set(g, c); }
    const hex4 = (n) => n.toString(16).padStart(4, '0'); const u16hex = (c) => c > 0xffff ? hex4(0xd800 + ((c - 0x10000) >> 10)) + hex4(0xdc00 + ((c - 0x10000) & 0x3ff)) : hex4(c);
    const ent = [...map.entries()]; let cm = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < ent.length; i += 100) { const ch = ent.slice(i, i + 100); cm += ch.length + ' beginbfchar\n' + ch.map(([g, c]) => '<' + hex4(g) + '> <' + u16hex(c) + '>').join('\n') + '\nendbfchar\n'; }
    cm += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    const tu = add({ stream: deflateSync(Buffer.from(cm)), dict: '/Filter /FlateDecode' });
    fontRef[tag] = add('<< /Type /Font /Subtype /Type0 /BaseFont /' + tagName + ' /Encoding /Identity-H /DescendantFonts [' + cid + ' 0 R] /ToUnicode ' + tu + ' 0 R >>');
  }
  const pageIds = [];
  const contents = cv.pages.map((p) => content(p));   /* gs names are collected while writing the contents */
  const gsDict = gs.size ? '/ExtGState << ' + [...gs.entries()].map(([a, n]) => '/' + n + ' << /ca ' + a + ' /CA ' + a + ' >>').join(' ') + ' >>' : '';
  for (const c of contents) {
    const cs = add({ stream: deflateSync(Buffer.from(c, 'latin1')), dict: '/Filter /FlateDecode' });
    pageIds.push(add('<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 ' + r2(cv.w) + ' ' + r2(cv.h) + '] /Resources << /Font << /F1 ' + fontRef.F1 + ' 0 R /F2 ' + fontRef.F2 + ' 0 R >> ' + gsDict + ' >> /Contents ' + cs + ' 0 R >>'));
  }
  objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesObj + ' 0 R /ViewerPreferences << /DisplayDocTitle true >> >>';
  objs[pagesObj - 1] = '<< /Type /Pages /Kids [' + pageIds.map((i) => i + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>';
  const pstr = (s) => '<feff' + Buffer.from(String(s || ''), 'utf16le').swap16().toString('hex') + '>';
  const d = info.date ? new Date(info.date) : new Date(); const pd = 'D:' + d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
  const infoId = add('<< /Title ' + pstr(info.title) + ' /Author ' + pstr(info.author || 'AI Geo Navigators') + ' /Subject ' + pstr(info.subject || '') + ' /Creator ' + pstr('AI GEO NIGRAAN') + ' /Producer ' + pstr('AI GEO NIGRAAN report engine') + ' /CreationDate (' + pd + ') >>');
  /* serialise */
  const chunks = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')]; let pos = chunks[0].length; const xref = [];
  objs.forEach((o, i) => { xref.push(pos); let b;
    if (o && typeof o === 'object' && o.stream) b = Buffer.concat([Buffer.from((i + 1) + ' 0 obj\n<< ' + o.dict + ' /Length ' + o.stream.length + ' >>\nstream\n', 'latin1'), o.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    else b = Buffer.from((i + 1) + ' 0 obj\n' + o + '\nendobj\n', 'latin1');
    chunks.push(b); pos += b.length; });
  const idh = createHash('md5').update(Buffer.concat(chunks)).digest('hex');
  const tail = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + xref.map((x) => String(x).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + infoId + ' 0 R /ID [<' + idh + '> <' + idh + '>] >>\nstartxref\n' + pos + '\n%%EOF\n';
  chunks.push(Buffer.from(tail, 'latin1'));
  return Buffer.concat(chunks);
}

/* ══ HTML: the same pages as inline SVG, the same subset fonts ══ */
const escX = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function svgPage(cv, p, idx) {
  const out = []; let pat = false;
  const dstr = (d) => d.map((c) => c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map(r2).join(' ')).join('');
  const attrs = (o) => 'fill="' + (o.fill && o.fill !== 'none' ? o.fill : 'none') + '"' + (o.op != null && o.op < 1 ? ' fill-opacity="' + r2(o.op) + '" stroke-opacity="' + r2(o.op) + '"' : '')
    + (o.stroke && o.stroke !== 'none' ? ' stroke="' + o.stroke + '" stroke-width="' + r2(o.lw || 0.5) + '"' + (o.dash ? ' stroke-dasharray="' + o.dash.join(' ') + '"' : '') + (o.cap ? ' stroke-linecap="' + o.cap + '"' : '') : '');
  for (const o of p.ops) {
    if (o.k === 'text') { if (!o.s) continue; out.push('<text x="' + r2(o.x) + '" y="' + r2(o.y) + '" font-size="' + r2(o.size) + '" class="' + (o.b ? 'b' : 'r') + '" fill="' + o.fill + '"' + (o.anchor !== 'start' ? ' text-anchor="' + o.anchor + '"' : '') + (o.data ? ' data-shown="' + escX(o.data) + '"' : '') + '>' + escX(o.s) + '</text>'); continue; }
    if (o.k === 'hatch') { pat = true; out.push('<path d="' + dstr(rrect(o.x, o.y, o.w, o.h, o.r)) + '" fill="url(#hx' + idx + ')"/>'); continue; }
    if (o.k === 'rect') { out.push('<rect x="' + r2(o.x) + '" y="' + r2(o.y) + '" width="' + r2(o.w) + '" height="' + r2(o.h) + '"' + (o.r ? ' rx="' + r2(o.r) + '"' : '') + ' ' + attrs(o) + '/>'); continue; }
    if (o.k === 'circle') { out.push('<circle cx="' + r2(o.cx) + '" cy="' + r2(o.cy) + '" r="' + r2(o.rad) + '" ' + attrs(o) + '/>'); continue; }
    out.push('<path d="' + dstr(o.d) + '" ' + attrs(o) + '/>');
  }
  const defs = pat ? '<defs><pattern id="hx' + idx + '" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="4.5" height="4.5" fill="' + HATCH_BG + '"/><line x1="0" y1="0" x2="0" y2="4.5" stroke="' + HATCH_LN + '" stroke-width="1.6"/></pattern></defs>' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r2(cv.w) + ' ' + r2(cv.h) + '" role="img" aria-label="' + escX(p.meta.label || ('Page ' + (idx + 1))) + '">' + defs + out.join('') + '</svg>';
}
export function html(cv, info = {}) {
  const used = { R: new Set([32]), B: new Set([32]) };
  for (const p of cv.pages) for (const o of p.ops) if (o.k === 'text') for (const ch of o.s) used[o.b ? 'B' : 'R'].add(ch.codePointAt(0));
  const ff = (st) => 'data:font/ttf;base64,' + subset(st, used[st]).toString('base64');
  const css = '@font-face{font-family:"AGN Carlito";font-weight:400;src:url(' + ff('R') + ') format("truetype")}@font-face{font-family:"AGN Carlito";font-weight:700;src:url(' + ff('B') + ') format("truetype")}'
    + ':root{--paper:#ffffff;--bg:#EEF1EC;--ink:#1F2A24}@media (prefers-color-scheme:dark){:root{--bg:#1d2320}}'
    + 'html,body{margin:0;background:var(--bg)}body{font-family:"AGN Carlito",Carlito,Calibri,sans-serif;font-kerning:none;padding:16px 0}'
    + '.pg{background:var(--paper);max-width:900px;margin:0 auto 16px;box-shadow:0 1px 4px rgba(0,0,0,.18)}.pg svg{display:block;width:100%;height:auto}'
    + 'svg text{font-family:"AGN Carlito",Carlito,Calibri,sans-serif;font-kerning:none;white-space:pre}svg text.b{font-weight:700}svg text.r{font-weight:400}'
    + '@media print{body{background:#fff;padding:0}.pg{box-shadow:none;margin:0;max-width:none;page-break-after:always;break-after:page}}@page{size:A4;margin:0}';
  const pages = cv.pages.map((p, i) => '<section class="pg" data-page="' + (i + 1) + '" data-part="' + escX(p.meta.part || '') + '">' + svgPage(cv, p, i) + '</section>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escX(info.title || 'Report') + '</title>'
    + '<meta name="agn-report-id" content="' + escX(info.id || '') + '"><style>' + css + '</style></head><body>' + pages + '</body></html>';
}
