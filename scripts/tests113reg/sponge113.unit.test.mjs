/* v91.17.283.49 (NIGRAAN 1.0.10) · regressions vs 1.0.7.1 · item 1 · offline checks of the ground-sponge VALUE layers (no server, no browser).
   (a) data/map-layer-scales.json: every sponge layer (nss_baseline, nss_dynamic, nss_runoff, nss_retention) has a valuePalette of 5 colours
       taken from display.sponge.ramp (sand .. sea green), indexed by the served class index (baseline / dynamic: 0 sealed .. 4 woodland, so
       the ramp in order; run-off / retention: level 0 holds the most, so the ramp reversed); no blue / navy hue, none of the hazard colours
       (yellow .. dark red), not all one colour; every class has a word and a cut, so the key can name the class and its range (unit).
   (b) server/api/spongetiles.mjs: the 250 m class tiles are drawn in the same ramp (PNG palette = display.sponge.ramp), read from the
       data folder; the BrBG brown .. teal set only without a ramp.
   (c) the classic page carries the sponge class patch (map fill, key, popup, 250 m overlay on), no "Normal · no tested threshold" row.
   Fails on 1.0.9: no valuePalette / ramp (sponge drawn all Normal green), tiles in BrBG, the page draws one Normal row.
   usage: node scripts/tests113reg/sponge113.unit.test.mjs [data dir with sponge-250m.bin]   (exit 1 on any FAIL) */
import { readFileSync, existsSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path'; import { tmpdir } from 'node:os';
const ROOT = (process.env.TREE ? process.env.TREE.replace(/\/?$/, '/') : new URL('../..', import.meta.url).pathname); let pass = 0, fail = 0;
const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 300) : '')); } };
const hue = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return { h: 0, s: 0 }; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return { h, s: d / mx }; };
const BLUE = (hex) => { const { h, s } = hue(hex); return s >= 0.12 && h >= 185 && h <= 245; };
const HAZ = ['#ffe680', '#fdae61', '#e8552d', '#a50026', '#67001f', '#74c476'];
const S = JSON.parse(readFileSync(join(ROOT, 'data', 'map-layer-scales.json'), 'utf8'));
const R = S.display && S.display.sponge && S.display.sponge.ramp;
ok(Array.isArray(R) && R.length === 5 && R.every((c) => /^#[0-9a-f]{6}$/i.test(c)), 'display.sponge.ramp: 5 colours', JSON.stringify(R));
if (Array.isArray(R)) { ok(!R.some(BLUE), 'the ramp has no blue / navy hue', R.map((c) => c + ' ' + Math.round(hue(c).h)).join(', ')); ok(!R.some((c) => HAZ.includes(c.toLowerCase())), 'the ramp uses none of the hazard level colours'); ok(new Set(R).size === 5, 'five distinct colours'); }
for (const [k, rev] of [['nss_baseline', false], ['nss_dynamic', false], ['nss_runoff', true], ['nss_retention', true]]) {
  const L = S.layers[k]; const V = L && L.valuePalette;
  ok(Array.isArray(V) && R && JSON.stringify(V) === JSON.stringify(rev ? R.slice().reverse() : R), k + ': valuePalette = the ramp ' + (rev ? 'reversed (level 0 holds the most)' : 'in class order (0 sealed .. 4 woodland)'), JSON.stringify(V));
  ok(L && Array.isArray(L.words) && L.words.length === 5 && Array.isArray(L.cuts) && L.cuts.length === 5, k + ': 5 class words and 5 served cuts (the key names each class and its range)');
  ok(L && typeof L.unit === 'string' && L.unit.length > 0, k + ': a unit for the key (' + (L && L.unit) + ')'); }
/* (b) the tiles */
const DD = process.argv[2] || process.env.NIGRAAN_DATA_DIR || null; const bin = DD && existsSync(join(DD, 'sponge-250m.bin')) ? join(DD, 'sponge-250m.bin') : null;
if (!bin) console.log('NOTE (b) skipped: no sponge-250m.bin given (the laptop data); pass a data folder that holds it');
else { const T = mkdtempSync(join(tmpdir(), 'sp113-')); copyFileSync(bin, join(T, 'sponge-250m.bin')); copyFileSync(join(ROOT, 'data', 'map-layer-scales.json'), join(T, 'map-layer-scales.json'));
  const { createSpongeTiles } = await import(join(ROOT, 'server', 'api', 'spongetiles.mjs')); const t = createSpongeTiles(T); const b = t.tile(7, 90, 52);
  const i = b ? b.indexOf('PLTE') : -1; const pal = i > 0 ? b.subarray(i + 4, i + 4 + 15).toString('hex') : '';
  ok(pal === (R || []).map((c) => c.slice(1).toLowerCase()).join(''), '250 m tile palette = the sponge ramp', pal);
  const T2 = mkdtempSync(join(tmpdir(), 'sp113b-')); copyFileSync(bin, join(T2, 'sponge-250m.bin')); writeFileSync(join(T2, 'map-layer-scales.json'), '{}');
  const t2 = createSpongeTiles(T2); const b2 = t2.tile(7, 90, 52); const i2 = b2.indexOf('PLTE');
  ok(b2.subarray(i2 + 4, i2 + 4 + 15).toString('hex') === '8c510ad8b365f6e8c35ab4ac01665e', 'without a ramp the tiles keep the BrBG fallback'); }
/* (c) the page */
const P = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
ok(/fillColor:\(scaleOf\(scaledKey\(\)\)\|\|\{\}\)\.valuePalette\[q\.i\]/.test(P), 'page: a sponge tehsil is filled with its served class colour (valuePalette[class])');
ok(!/Normal \\u00b7 no tested threshold \(the value is in the place panel\)/.test(P), 'page: no single "Normal · no tested threshold" key row');
ok(/currentMapLayer\(\)==='nss_baseline'; \}catch\(_\)\{ return false; \} \}   \/\* v91\.17\.283\.49/.test(P), 'page: the 250 m class overlay is drawn on nss_baseline');
ok(/swatch:\(sc\.valuePalette\|\|\[\]\)\[r\.i\]/.test(P), 'page: the map popup swatch is the class colour');
console.log('sponge113.unit: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
