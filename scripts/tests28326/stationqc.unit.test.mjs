/* v91.17.283.26 . START PAGE STRIP AND CHECKED STATION READINGS (owner 27-28 Oct 2026), offline:
     W0  the Warmest / Coolest chips are gone from the start page (owner 28 Oct): no chip, no page code, no server field; the page no longer
         reads /api/fleet/latest
     Q1  a station reading reaches a customer only when it passed the checks (fleet.mjs customerRow): usable, station status 'checked', and
         compared with the served forecast at its hour; a not-yet-checked reading (Kot Radha Kishan 11.0 C), a site problem, a silent
         station or a reading never compared with the forecast is never sent; the operator's view keeps every row
     Q2  the same rule for the place's nearest station (place panel, reports), the fleet chip's count (status().usableChecked) and
         /api/fleet/latest for every request that is not the operator's view
     P1  the hazard pulse chip fits the 38 px bar (its extra lines on one small second line, the full sentences in its tooltip) and the
         note keeps room for its Details button (it was cut to "D")
   usage: node scripts/tests28326/stationqc.unit.test.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const FL = await import(pathToFileURL(join(API, 'fleet.mjs')).href);
const rd = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

/* ── W0 ── */
{ const S = rd('artefact', 'NIGRAAN_START.html'), IX = rd('server', 'api', 'index.mjs');
  ok(!/nsHot|nsCold|>Warmest|>Coolest|'Warmest|'Coolest|S\.nowT|nowTemp/.test(S) && !/\/api\/fleet\/latest/.test(S) && !/button\.ns/.test(S), 'W0 the start page has no Warmest / Coolest chip, no code or style for it, and no /api/fleet/latest read');
  ok(!/nowTemp|nowtemp/.test(IX) && !existsSync(join(API, 'nowtemp.mjs')) && /layers: L \}\); \}/.test(IX), 'W0 no server field or module for it (the levels answer is as before)'); }

/* ── Q1 / Q2 ── */
{ const base = { usable: true, usableTemperature: true, status: 'checked', bgChecked: true, tempC: 20.5 };
  ok(FL.customerRow(base), 'Q1 a checked reading, compared with the served forecast, is shown');
  ok(!FL.customerRow({ ...base, status: 'not-yet-checked', tempC: 11.0 }), 'Q1 a not-yet-checked reading (Kot Radha Kishan 11.0 C) is never shown to a customer');
  ok(!FL.customerRow({ ...base, status: 'site-problem' }) && !FL.customerRow({ ...base, status: 'silent' }) && !FL.customerRow({ ...base, usable: false }) && !FL.customerRow({ ...base, usableTemperature: false }), 'Q1 a site problem, a silent station, an unusable reading are never shown');
  ok(!FL.customerRow({ ...base, bgChecked: false }) && !FL.customerRow({ ...base, tempC: null }), 'Q1 a reading never compared with the served forecast at its hour (or with no temperature) is never shown');
  const F = rd('server', 'api', 'fleet.mjs'), IX = rd('server', 'api', 'index.mjs');
  ok((/latest: \(\{ customer = false \} = \{\}\) => \{ const rows = latestRows\(\); const out = customer \? rows\.filter\(customerRow\) : rows;/.test(F) || /const rows = latestRows\(\); const out = customer \? \(down \? \[\] : rows\.filter\(customerRow\)\) : rows;/.test(F))   /* v91.17.283.49: a failed feed shows customers no row */ && /app\.fleet\.latest\(\{ customer: !viewOp\(req\) \}\)/.test(IX), 'Q2 GET /api/fleet/latest sends only checked readings to every request that is not the operator\'s view; the operator keeps every row');
  ok(/const shown = \(r\) => \{[^\n]*return customerRow\(/.test(F) && /usableChecked: \(\(\) => \{ try \{ return latestRows\(\)\.filter\(customerRow\)\.length;/.test(F), 'Q2 the place\'s nearest station and the fleet chip\'s count use the same rule');
  ok(/r\.bgChecked = !!\(h && Number\.isFinite\(h\.served \?\? h\.raw\)\)/.test(F) && /r\.qc = \[\]; r\.bgChecked = false;/.test(F), 'Q2 bgChecked is set by the value checks of each poll (reset every poll)');
  ok(/F\.usableChecked\+'\/'\+F\.stations/.test(rd('artefact', 'NIGRAAN_START.html')), 'Q2 the start page\'s fleet chip counts checked readings'); }

/* ── P1 ── */
{ const S = rd('artefact', 'NIGRAAN_START.html');
  ok(!/<br>\+'\+hc\.glof/.test(S) && /\.ns\.ns2\{flex-direction:column/.test(S) && /\+hc\.glof\+' with GLOF susceptibility High or Severe\.'/.test(S), 'P1 the pulse chip: two lines that fit the bar (no third line), the full sentences in its tooltip');
  ok(/var dw=dt&&dt\.offsetWidth\?dt\.offsetWidth\+8:0;/.test(S), 'P1 the note keeps room for its Details button'); }

console.log(`\nv283.26 station QC unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
