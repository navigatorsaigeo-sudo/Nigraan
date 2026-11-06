#!/usr/bin/env node
/* v91.17.283.49 · 1.0.10 report engine · unit tests, no server: (1) the linter catches each defect of the owner's and the external reviews
   (one bad canvas per check); (2) a clean report of a synthetic place passes and is a real PDF (fonts embedded, text extractable);
   (3) the standing-measures template bug is gone: every row carries its own action (report.mjs standing() through suggestions());
   (4) the text cleaner removes paths, table names, versions, server addresses and agency names, keeps NDMA / PDMA. */
import { Canvas, pdf, html } from '../../server/api/repdraw.mjs';
import { lint } from '../../server/api/replint.mjs';
import { buildReport, clean, summaryOf } from '../../server/api/repengine.mjs';
import { createReport } from '../../server/api/report.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const baseMan = () => ({ sections: [], tables: [], tiles: [], summary: { text: '', facts: {} }, customerPages: 1, pages: 1, actions: [] });
function one(text, o = {}) { const c = new Canvas(); c.page(); c.text(40, 100, text, { size: 9, ...o }); return c; }
const codes = (r) => r.failures.map((f) => f.code);
/* (1) one defect per canvas */
const cases = [['L1', 'Printed from http://localhost:8787/analyst on 2 Nov 15:54'], ['L1', 'see 127.0.0.1'], ['L2', 'scale from data/map-layer-scales.json'], ['L2', 'see /api/levels/unit'],
  ['L3', 'evidence PK_TEHSIL_TERRAIN'], ['L4', 'Low heat stress at the work fa…'], ['L4', 'truncated...'], ['L5', 'Not available (the server did not answer)'], ['L5', 'No asset is active'],
  ['L5', 'value undefined'], ['L5', 'NaN °C'], ['L6', 'built by v91.17.283.48'], ['L6', 'gate-91.17.283'], ['L7', 'from ECMWF ENS'], ['L7', 'PMD stations'], ['L18', 'عیسیٰ نگری']];
for (const [code, t] of cases) { const r = lint({ cv: one(t), manifest: baseMan(), answer: {} }); ok(codes(r).includes(code), code + ' not raised for "' + t + '": ' + codes(r).join(',')); }
ok(lint({ cv: one('Guidance: the published guidance of NDMA and the provincial PDMAs.'), manifest: baseMan(), answer: {} }).ok, 'NDMA / PDMA flagged');
{ const c = new Canvas(); c.page(); c.text(40, 100, 'not assessed', { size: 9 }); c.text(70, 100, 'Level', { size: 9 }); ok(codes(lint({ cv: c, manifest: baseMan(), answer: {} })).includes('L13'), 'overlap not raised'); }
{ const c = new Canvas(); c.page(); c.text(580, 100, 'beyond the edge', { size: 9 }); ok(codes(lint({ cv: c, manifest: baseMan(), answer: {} })).includes('L13'), 'outside-page text not raised'); }
{ const c = new Canvas(); c.page(); c.rect(10, 10, 20, 20, { fill: '#0C3851' }); ok(codes(lint({ cv: c, manifest: baseMan(), answer: {} })).includes('L16'), 'navy not raised'); }
{ const m = baseMan(); m.sections = [{ title: '4. Prescriptive', page: 1, items: 1 }, { title: 'Watch list', page: 1, items: 0 }]; const r = codes(lint({ cv: one('ok'), manifest: m, answer: {} })); ok(r.includes('L8'), 'numbering not raised'); ok(r.includes('L14'), 'empty section not raised'); }
{ const m = baseMan(); m.tables = [{ title: 'Hazard levels', sig: '[1]' }, { title: 'Hazard levels', sig: '[1]' }]; ok(codes(lint({ cv: one('ok'), manifest: m, answer: {} })).includes('L9'), 'duplicate table not raised'); }
{ const m = baseMan(); m.tiles = [{ hazard: 'Glacial lake flood', date: '2026-11-02', word: 'Normal', tier: 2 }]; m.sections = [{ title: 'glofPanel', page: 2, items: 1 }];
  const r = codes(lint({ cv: one('ok'), manifest: m, answer: { cannotHappen: [{ key: 'glof', name: 'Glacial lake flood' }], glof: { lakesUpstream: 0 } } })); ok(r.filter((x) => x === 'L10').length >= 2, 'cannot-happen tile / panel not raised'); }
{ const m = baseMan(); m.tiles = [{ hazard: 'Air quality', date: '2026-11-02', word: 'Unhealthy', tier: 2 }]; m.summary = { text: 'x, next 7 days: no hazard above Normal.', facts: { hazards: [] } };
  ok(codes(lint({ cv: one('ok'), manifest: m, answer: {} })).includes('L11'), 'banner without the air quality of the tiles not raised'); }
{ const m = baseMan(); m.tiles = [{ hazard: 'Heat', date: '2026-11-02', word: 'High', tier: 1 }]; m.summary = { text: 'x: no hazard above Normal.', facts: { hazards: [] } };
  ok(codes(lint({ cv: one('ok'), manifest: m, answer: {} })).includes('L11'), 'banner "no hazard" against a High tile not raised'); }
{ const m = baseMan(); m.customerPages = 3; ok(codes(lint({ cv: one('ok'), manifest: m, answer: {} })).includes('L12'), '3-page customer part not raised'); }
{ const m = baseMan(); m.tables = [{ title: 'Standing measures', sig: JSON.stringify([['Steep ground', 'relief of 1180 m inside the tehsil', 'Relief of 1180 m inside the tehsil']]) }];
  ok(codes(lint({ cv: one('ok'), manifest: m, answer: {} })).includes('L15'), 'standing row repeating its trigger not raised'); }
/* (2) a synthetic place through the engine: clean, a real PDF */
const days = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ date: '2026-11-0' + (2 + i), lead: i, tmaxC: 26 + i * 0.3, tminC: 9 + i * 0.1, rainMm: i === 2 ? 23.2 : 0, gustMaxKmh: 34, rainProbMax: 14, utciMaxC: 23 + i * 0.2, heat: { word: 'Normal', level: 0 }, cold: { word: 'Low', level: 1 } }));
const hz = (key, name, tier, lv) => ({ key, layer: key, name, tier, days: days.slice(0, 4).map((d) => ({ date: d.date, level: lv, word: ['Normal', 'Low', 'Moderate'][lv], state: 'value' })) });
const A = { ok: true, view: 'customer', issuedAt: '2026-11-02T06:45:00Z', run: '2026-11-02T00:00~x', levelsAt: '2026-11-02T06:43:00Z',
  place: { name: 'Near I-8 Markaz Ground (0.2 km)', near: { name: 'I-8 Markaz Ground', km: 0.2 }, tehsil: 'Islamabad', district: 'Islamabad', province: 'Federal Capital', unitId: 'Federal Capital|Islamabad|Islamabad', lat: 33.6686, lon: 73.0752, elevM: 521 },
  hours: Array.from({ length: 72 }, (_, i) => ({ time: '2026-11-0' + (2 + Math.floor((11 + i) / 24)) + 'T' + String((11 + i) % 24).padStart(2, '0') + ':00', tempC: 15 + 8 * Math.sin(i / 3.8), feelsC: 14 + 8 * Math.sin(i / 3.8), rainMm: i > 40 && i < 50 ? 1.2 : 0, gustKmh: 20 + (i % 7) })),
  days, levels: { days: days.slice(0, 4).map((d) => d.date), hazards: [hz('heat', 'Heat', 1, 0), hz('cold', 'Cold', 2, 1), { key: 'glof', name: 'Glacial lake flood', cannot: true, tier: 2, days: [] }, { key: 'wind', name: 'Wind', tier: 2, days: days.slice(0, 4).map((d) => ({ date: d.date, level: null, state: 'not_tested', why: 'not tested: the wind level ladder has no tested basis' })) }] },
  cannotHappen: [{ key: 'glof', name: 'Glacial lake flood', why: 'no mapped glacial lake upstream' }],
  air: { days: days.slice(0, 5).map((d) => ({ date: d.date, aqi: 162, category: 'Unhealthy', pm25: 70 })) },
  outlook: { ensemble: null, weeks: { weeks: [{ start: '2026-11-02', tAnom: 2 }, { start: '2026-11-09', tAnom: -0.4 }] }, months: null },
  actions: [{ source: 'event', hazard: 'Air quality', trigger: 'Unhealthy PM2.5 on Mon 2 Nov', action: 'Prepare N95/FFP2 masks for outdoor staff.', tier: 2 }],
  standing: [{ id: 'slope', measure: 'Inspect the slopes and drains above the site after heavy rain.', why: 'relief of 1180 m inside the tehsil' }], watch: [], unavailable: [], provenance: {}, answerId: 'Atest' };
const R = buildReport(A, { kind: 'site_assessment', view: 'customer', id: 'NGR-UNIT-1', dataDir: join(ROOT, 'data') });
const P = pdf(R.cv, { title: R.title }), Hh = html(R.cv, { title: R.title, id: 'NGR-UNIT-1' });
const L = lint({ cv: R.cv, manifest: R.manifest, pdf: P, html: Hh, answer: A });
ok(L.ok, 'synthetic report fails the linter: ' + JSON.stringify(L.failures.slice(0, 5)));
ok(P.subarray(0, 8).toString('latin1').startsWith('%PDF-1.7') && /FontFile2/.test(P.toString('latin1')) && /ToUnicode/.test(P.toString('latin1')), 'PDF without embedded font / ToUnicode');
ok(R.manifest.customerPages === 2 && R.manifest.pages >= 3, 'page layout: customer ' + R.manifest.customerPages + ' of ' + R.manifest.pages);
ok(/air quality unhealthy/i.test(R.manifest.summary.text) && /cold Low \(indicative\)/.test(R.manifest.summary.text), 'summary: ' + R.manifest.summary.text);
ok(!R.manifest.tiles.some((t) => t.hazard === 'Glacial lake flood'), 'a cannot-happen hazard has a tile');
ok(!/<script/i.test(Hh) && /@font-face/.test(Hh) && (Hh.match(/<svg/g) || []).length === R.manifest.pages, 'HTML view: pages as SVG with the font');
/* (3) standing measures: the template bug */
const app = { provider: {}, units: { tehsil: [] }, outlook: { unit: () => ({}) }, smog: { unit: () => null }, dataDir: join(ROOT, 'data'),
  climatology: { ready: () => true, thresholds: () => ({ tx90: 38.2, pr3_99: 61, tn10: -1.5 }) }, hand: { of: () => ({ bands: { lt2: 0.05, b2_5: 0.1 }, local: { lt2: 0.2 } }) }, glof: null };
const S = createReport(app).suggestions({ unitId: 'Punjab|Lahore|Lahore Cantt', lat: 31.5, lon: 74.4, elevM: 218, emaxM: 1398, eminM: 218, province: 'Punjab' }).standing;
ok(S.length >= 6, 'standing rows: ' + S.length);
for (const r of S) { ok(r.measure && r.measure !== r.why, 'standing row ' + r.id + ' repeats its why as the action'); ok(!/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/.test(r.evidence || ''), 'standing row ' + r.id + ' names an internal table: ' + r.evidence); }
ok(/38\.2 °C day/.test((S.find((r) => r.id === 'heat') || {}).measure || ''), 'heat row acts on the measured 90th percentile');
ok(/water freezes/.test((S.find((r) => r.id === 'cold') || {}).measure || ''), 'cold row below 0 °C names freezing');
/* (4) the cleaner */
ok(clean('scales from data/map-layer-scales.json and PK_TEHSIL_TERRAIN (v91.17.283.48) via http://localhost:8787/x by ECMWF') === 'scales from and via by', 'clean: ' + clean('scales from data/map-layer-scales.json and PK_TEHSIL_TERRAIN (v91.17.283.48) via http://localhost:8787/x by ECMWF'));
ok(clean('NDMA and PDMA guidance') === 'NDMA and PDMA guidance', 'clean removed NDMA / PDMA');
void summaryOf;
console.log('replint.unit: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
