import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.199 · M07 national PM2.5 model away from the monitored cities. (M04 measured surface albedo retired in v91.17.277 with its test:
   no shipped feature grid holds the albedo band; Tmrt uses the fixed 0.20 — tests277/fix277.test.mjs checks the retirement.) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const P = (p) => new URL('../../' + p, import.meta.url);
const J = (p) => JSON.parse(readFileSync(P(p), 'utf8'));

test('national PM2.5 model: node trees reproduce the Python fit, held-out evidence carried', async () => {
  const { lgbEval } = await import(P('server/api/natmodel.mjs'));
  const N = J('data/pm25-national.json');
  assert.equal(N.version, 'pm25n-91.17.199'); assert.equal(N.features.length, 30); assert.ok(N.smear > 0.9 && N.smear < 1.2);
  for (const c of N.model.selfcheck) assert.ok(Math.abs(lgbEval(N.model, c.x) - c.y) < 1e-3, 'selfcheck row');
  const h = N.heldOut.all; assert.ok(h.mae_model < h.mae_cams, 'beats the composition forecast at held-out monitors');
});

test('smog dailies: monitored city keeps its ground check, a town beyond 30 km gets the national model, missing input falls back', async () => {
  const { createSmog } = await import(P('server/api/smog.mjs'));
  const I = J('fixtures/pm25n-lahore-2025-11.json');
  const S = createSmog({ provider: { configured: () => false }, units: { tehsil: [] } }, __T.repoPath('data'));
  const a = S._dailies({ lat: 31.56, lon: 74.34, elevM: 215 }, I.aq, I.met)[0];
  assert.equal(a.pm25Basis, 'ground-checked'); assert.equal(a.nationalModel, false);
  const b = S._dailies({ lat: 31.12, lon: 74.45, elevM: 200 }, I.aq, I.met)[0];
  assert.equal(b.pm25Basis, 'national model'); assert.ok(b.pm25 > b.pm25Cams && b.pm25 < 600); assert.equal(b.nationalModel.version, 'pm25n-91.17.199');
  const r = S._dailies({ lat: 26.5, lon: 70.5, elevM: 100 }, I.aq, I.met)[0];   /* open desert: no sensors in that domain */
  assert.equal(r.pm25Basis, 'composition forecast'); assert.equal(r.pm25, r.pm25Cams);
  const aq2 = { ...I.aq, dust: I.aq.dust.map(() => null) };
  const c = S._dailies({ lat: 31.12, lon: 74.45, elevM: 200 }, aq2, I.met)[0];
  assert.equal(c.pm25Basis, 'composition forecast'); assert.equal(c.pm25, c.pm25Cams);
});
