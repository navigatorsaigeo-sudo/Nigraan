/* v91.17.193 · rain map refit, cyclone track climatology, ruggedness boost off, outside GIS page on click, ENS archive timing, ::1 listener */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const R = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const ART = R('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html');

test('northern rain map refit on day spans in minutes (30-min exports count)', () => {
  const m = JSON.parse(R('data/rain-qm-north.json'));
  assert.match(m.version, /^rqm-91\.17\.193-/); assert.ok(m.heldOut.gauges >= 80, 'gauges ' + m.heldOut.gauges);
  assert.ok(m.heldOut.totalRatioCorrected > 0.8 && m.heldOut.totalRatioCorrected < 1.2);
  for (const k of Object.keys(m.months)) { const q = m.months[k]; assert.equal(q.mq.length, 199); for (let i = 1; i < 199; i++) assert.ok(q.oq[i] >= q.oq[i - 1]); }
});

test('cyclone climatology: every tehsil, delta above Makran, nothing inland north', () => {
  const C = JSON.parse(R('data/cyclone-climatology.json')); const U = C.units;
  assert.equal(Object.keys(U).length, 577); assert.ok(C.landFactor > 0.3 && C.landFactor < 0.9); assert.equal(C.licence.id, 'ibtracs');
  assert.ok(U['Keti Bunder'].peakKt >= 34 && U['Shah Bunder'].peakKt >= 48); assert.equal(U['Lahore City'].galeStorms, 0); assert.equal(U['Quetta City'].galeStorms, 0);
  assert.ok(U['Keti Bunder'].peakKt > U['Gwadar'].peakKt);
  assert.ok(ART.includes('"v":"cyc-91.17.193"'), 'climatology inlined in the page'); assert.ok(!ART.includes('/*__CYCLONE_UNITS__*/'));
  assert.ok(ART.includes("var _cc=_cycFromClim(name); if(_cc) return _cc;"));
});

test('wind: the untested ruggedness boost is off and the page says so', () => {
  assert.match(ART, /exposureMax:\s*\{ value:0,/); assert.ok(ART.includes('no terrain amplification (not supported by the station test)'));
});

test('the outside GIS page is not contacted when the tab opens', () => {
  assert.ok(!ART.includes("if(frame&&(!frame.src||frame.src==='about:blank'))start()")); assert.ok(ART.includes('nothing is sent to it until you press this button'));
});

test('ensemble archive: 15-minute checks, early stop on a run in flux, charge only what was requested', () => {
  const E = R('server/api/ensarchive.mjs'); assert.ok(E.includes('NIGRAAN_ENS_EVERY_MIN')); assert.ok(!/60 \* 60 \* 1000\)\.unref\?\.\(\);\n  return/.test(E));
  const P = readFileSync(new URL('../../../station-lake/scripts/ens_archive.py', import.meta.url), 'utf8');
  assert.ok(P.includes('e.nreq = nreq; raise e')); assert.ok(P.includes('cost = w if done is None else w * min(1.0, (done + 1) / nch)'));
});

test('server also answers on ::1 with the default host', () => {
  const S = R('server/server.mjs'); assert.ok(S.includes("s6.listen(PORT, '::1')")); assert.ok(S.includes("server.listeners('request')[0]"));
});
