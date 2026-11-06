/* ══ v91.17.283.49 · NIGRAAN 1.0.10 · REPORT ENGINE · THE FONT ═══════════════════════════════════════════════════════════════════════
   Carlito (metric-compatible with Calibri, SIL Open Font License 1.1, server/fonts/OFL.txt), read from server/fonts/ with no dependency.
   - measure(text, size): the advance width in points (hmtx advances through the Unicode cmap; no kerning, so the PDF and the HTML view
     break every line at the same place: the HTML view is told font-kerning:none and gets the same subset font, which has no GPOS);
   - subset(chars): a TrueType file holding only the glyphs the document uses (unused glyphs become empty outlines, glyph ids and the
     cmap stay, so the same file serves the PDF (Identity-H, glyph id = CID) and the HTML @font-face).
   Pure JS on Node (laptop and DGX alike). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(HERE, '..', 'fonts');
const u16 = (b, o) => b.readUInt16BE(o), i16 = (b, o) => b.readInt16BE(o), u32 = (b, o) => b.readUInt32BE(o);

function parse(buf) {
  const n = u16(buf, 4), T = {};
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; T[buf.toString('latin1', o, o + 4)] = { off: u32(buf, o + 8), len: u32(buf, o + 12) }; }
  const head = T.head.off, upm = u16(buf, head + 18), locFmt = i16(buf, head + 50);
  const bbox = [i16(buf, head + 36), i16(buf, head + 38), i16(buf, head + 40), i16(buf, head + 42)];
  const numGlyphs = u16(buf, T.maxp.off + 4), nHM = u16(buf, T.hhea.off + 34);
  const ascent = i16(buf, T.hhea.off + 4), descent = i16(buf, T.hhea.off + 6);
  let capH = 0; try { if (T['OS/2'] && u16(buf, T['OS/2'].off) >= 2) capH = i16(buf, T['OS/2'].off + 88); } catch (_) {}
  const adv = new Uint16Array(numGlyphs); let last = 0;
  for (let g = 0; g < numGlyphs; g++) { if (g < nHM) last = u16(buf, T.hmtx.off + g * 4); adv[g] = last; }
  /* cmap: format 12 (full Unicode) when present, else format 4 */
  const cmap = new Map(), co = T.cmap.off, nt = u16(buf, co + 2); let f4 = null, f12 = null;
  for (let i = 0; i < nt; i++) { const pid = u16(buf, co + 4 + i * 8), eid = u16(buf, co + 6 + i * 8), so = co + u32(buf, co + 8 + i * 8), fmt = u16(buf, so);
    if (pid === 3 && eid === 10 && fmt === 12) f12 = so; else if (pid === 3 && eid === 1 && fmt === 4) f4 = so; else if (pid === 0 && fmt === 4 && f4 == null) f4 = so; }
  if (f12 != null) { const ng = u32(buf, f12 + 12); for (let i = 0; i < ng; i++) { const o = f12 + 16 + i * 12, s = u32(buf, o), e = u32(buf, o + 4), g0 = u32(buf, o + 8); for (let c = s; c <= e; c++) cmap.set(c, g0 + c - s); } }
  else if (f4 != null) { const sc = u16(buf, f4 + 6) / 2, eo = f4 + 14, so2 = eo + sc * 2 + 2, dO = so2 + sc * 2, rO = dO + sc * 2;
    for (let i = 0; i < sc; i++) { const e = u16(buf, eo + i * 2), s = u16(buf, so2 + i * 2), d = i16(buf, dO + i * 2), ro = u16(buf, rO + i * 2);
      for (let c = s; c <= e && c !== 0xffff; c++) { let g; if (ro === 0) g = (c + d) & 0xffff; else { const gi = rO + i * 2 + ro + (c - s) * 2; g = u16(buf, gi); if (g) g = (g + d) & 0xffff; } if (g) cmap.set(c, g); } } }
  const loca = (g) => locFmt ? u32(buf, T.loca.off + g * 4) : u16(buf, T.loca.off + g * 2) * 2;
  return { buf, T, upm, bbox, numGlyphs, adv, cmap, loca, ascent, descent, capH, locFmt };
}

const FONTS = {};
export function font(style) {
  const k = style === 'B' ? 'B' : 'R'; if (FONTS[k]) return FONTS[k];
  const f = parse(readFileSync(join(FONT_DIR, k === 'B' ? 'Carlito-Bold.ttf' : 'Carlito-Regular.ttf')));
  f.name = k === 'B' ? 'Carlito-Bold' : 'Carlito';
  f.gid = (cp) => f.cmap.get(cp) || f.cmap.get(SUBST[cp]) || 0;
  f.measure = (s, size) => { let w = 0; for (const ch of String(s)) w += f.adv[f.gid(ch.codePointAt(0))]; return w * size / f.upm; };
  return (FONTS[k] = f);
}
/* a character the font lacks is drawn as its nearest plain form (never as an empty box) */
const SUBST = { 0x2011: 0x2d, 0x2212: 0x2d, 0x2009: 0x20, 0x202f: 0x20, 0x00a0: 0x20, 0x2264: 0x3c, 0x2265: 0x3e };
export function normText(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

/* the glyphs a set of code points needs, with the components of composite glyphs */
function closure(f, gids) {
  const out = new Set([0, ...gids]), todo = [...out], b = f.buf, go = f.T.glyf.off;
  while (todo.length) { const g = todo.pop(), a = f.loca(g), z = f.loca(g + 1); if (z <= a) continue; const o = go + a;
    if (i16(b, o) >= 0) continue; let p = o + 10;
    for (;;) { const flags = u16(b, p), c = u16(b, p + 2); if (!out.has(c)) { out.add(c); todo.push(c); }
      p += 4 + ((flags & 1) ? 4 : 2); if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8; if (!(flags & 0x20)) break; } }
  return out;
}
function checksum(b) { let s = 0; const n = Math.ceil(b.length / 4) * 4, c = Buffer.alloc(n); b.copy(c); for (let i = 0; i < n; i += 4) s = (s + c.readUInt32BE(i)) >>> 0; return s; }
/* a TrueType file with only the used outlines; tables kept: head hhea maxp OS/2 hmtx cmap cvt fpgm prep loca glyf name post(3) */
export function subset(style, codepoints) {
  const f = font(style), b = f.buf, keep = closure(f, [...codepoints].map((c) => f.gid(c)).filter(Boolean));
  const parts = [], loca = Buffer.alloc((f.numGlyphs + 1) * 4); let off = 0;
  for (let g = 0; g < f.numGlyphs; g++) { loca.writeUInt32BE(off, g * 4);
    if (!keep.has(g)) continue; const a = f.loca(g), z = f.loca(g + 1); if (z <= a) continue;
    const d = b.subarray(f.T.glyf.off + a, f.T.glyf.off + z), pad = (4 - (d.length % 4)) % 4; parts.push(d); if (pad) parts.push(Buffer.alloc(pad)); off += d.length + pad; }
  loca.writeUInt32BE(off, f.numGlyphs * 4);
  const tab = (k) => Buffer.from(b.subarray(f.T[k].off, f.T[k].off + f.T[k].len));
  const head = tab('head'); head.writeUInt32BE(0, 8); head.writeInt16BE(1, 50);
  const post = Buffer.alloc(32); post.writeUInt32BE(0x00030000, 0); tab('post').copy(post, 4, 4, 16);
  const T = { head, hhea: tab('hhea'), maxp: tab('maxp'), 'OS/2': tab('OS/2'), hmtx: tab('hmtx'), cmap: tab('cmap'), loca, glyf: Buffer.concat(parts), name: tab('name'), post };
  for (const k of ['cvt ', 'fpgm', 'prep']) if (f.T[k]) T[k] = tab(k);
  const names = Object.keys(T).sort(), n = names.length, es = Math.floor(Math.log2(n)), sr = 16 * 2 ** es;
  const dir = Buffer.alloc(12 + 16 * n); dir.writeUInt32BE(0x00010000, 0); dir.writeUInt16BE(n, 4); dir.writeUInt16BE(sr, 6); dir.writeUInt16BE(es, 8); dir.writeUInt16BE(n * 16 - sr, 10);
  let at = dir.length; const body = [];
  names.forEach((k, i) => { const d = T[k], o = 12 + i * 16; dir.write(k, o, 4, 'latin1'); dir.writeUInt32BE(checksum(d), o + 4); dir.writeUInt32BE(at, o + 8); dir.writeUInt32BE(d.length, o + 12);
    const pad = (4 - (d.length % 4)) % 4; body.push(d); if (pad) body.push(Buffer.alloc(pad)); at += d.length + pad; });
  const out = Buffer.concat([dir, ...body]);
  const hi = names.indexOf('head'), ho = dir.readUInt32BE(12 + hi * 16 + 8); out.writeUInt32BE((0xB1B0AFBA - checksum(out)) >>> 0, ho + 8);
  return out;
}
