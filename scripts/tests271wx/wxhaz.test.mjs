/* v91.17.271 · WX agent · server/api/wxhaz.mjs (B9 fog / E2 thunderstorm / B7 snow chance on the served fields) and its wiring.
   1 OFF by default: without NIGRAAN_WX=1 every call returns null; switched on, a hazard not in servedHazards (v271: none) stays null.
   2 Parity: on real served hours (Multan, Gilgit; Jan and Jul 2026) the JS daily features and chances reproduce wx_export2.py
     (data/wx-hazards.json served.parity), thunderstorm days and fog mornings.
   3 Snow chance: monotone in height above the freezing level and falls with temperature.
   4 Speed: one place, 5 days hourly: < 1 ms per place after warm-up.
   5 Wiring: index.mjs creates app.wxhaz; no customer route reads it.
   usage: node scripts/tests271wx/wxhaz.test.mjs   (starts no server) */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = await import(join(ROOT, 'server/api/wxhaz.mjs'));
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 300) : '')); };
const M = JSON.parse(readFileSync(join(ROOT, 'data', 'wx-hazards.json'), 'utf8'));
const dataDir = join(ROOT, 'data'), S = M.served, PAR = S.parity;
const H0 = PAR[0].hourly;

/* 1 · off */
delete process.env.NIGRAAN_WX;
{ const x = W.createWxHaz({ dataDir });
  ok(x.tsChance(H0, 30.2, 71.4, 122) === null && x.fogChance(H0, 30.2, 71.4, 122) === null && x.snowChance(3000, 2900, 0) === null && x.state().switchOn === false, '1 · switch off (default): ts, fog, snow all null'); }
process.env.NIGRAAN_WX = '1';
{ const x = W.createWxHaz({ dataDir });
  ok(Array.isArray(M.servedHazards) && M.servedHazards.length === 0, '1 · v271 servedHazards is empty (owner decides)', JSON.stringify(M.servedHazards));
  ok(x.tsChance(H0, 30.2, 71.4, 122) === null && x.fogChance(H0, 30.2, 71.4, 122) === null && x.snowChance(3000, 2900, 0) === null, '1 · switch on, hazards not listed: still null'); }
delete process.env.NIGRAAN_WX;

/* 2 · parity */
for (const [kind, fn, key] of [['thunderstorm', W.tsDays, 'ts'], ['fog', W.fogMornings, 'fog']]) {
  let n = 0, worstF = 0, worstP = 0, missing = 0;
  for (const p of PAR) { const got = new Map(fn(p.hourly).map((d) => [d.date, d.feat]));
    for (const e of p[key]) { const f = got.get(e.date); if (!f) { missing++; continue; } n++;
      for (const [k, v] of Object.entries(e.feat)) worstF = Math.max(worstF, Math.abs((f[k] ?? NaN) - v) || 0);
      worstP = Math.max(worstP, Math.abs(W.chanceFrom(key === 'ts' ? S.tsServed : S.fogServed, f, p.zone, e.season, p.climo) - e.p)); } }
  ok(n > 0 && missing === 0 && worstF < 1e-3 && worstP < 1e-4, `2 · ${kind}: ${n} days, features |diff| ${worstF.toExponential(1)}, chance |diff| ${worstP.toExponential(1)}`, missing ? missing + ' days missing' : null);
}
{ const x = W.createWxHaz({ dataDir }); const r = x.tsChance(H0, 30.2, 71.4, 122, { force: true }), f = x.fogChance(H0, 30.2, 71.4, 122, { force: true });
  ok(Array.isArray(r) && r.length >= 2 && r.every((d) => d.chance >= 0 && d.chance <= 1) && Array.isArray(f) && f.length >= 2, '2 · forced chances per PKT day / morning in 0..1', JSON.stringify({ ts: r, fog: f })); }

/* 3 · snow */
{ const x = W.createWxHaz({ dataDir }); const s = (dz, t) => x.snowChance(3000 + dz, 3000, t, { force: true });
  ok(s(-1500, 0) < s(0, 0) && s(0, 0) < s(1500, 0) && s(0, 5) < s(0, -2), `3 · snow chance: ${s(-1500, 0).toFixed(3)} < ${s(0, 0).toFixed(3)} < ${s(1500, 0).toFixed(3)} with height; ${s(0, 5).toFixed(3)} at +5 °C < ${s(0, -2).toFixed(3)} at -2 °C`); }

/* 4 · speed */
{ const H = { time: [] }; const keys = Object.keys(H0).filter((k) => k !== 'time'); for (const k of keys) H[k] = [];
  for (let i = 0; i < 120; i++) { H.time.push(new Date(Date.UTC(2026, 6, 1) + i * 3600e3).toISOString().slice(0, 16)); for (const k of keys) H[k].push(H0[k][i % H0[k].length]); }
  const x = W.createWxHaz({ dataDir }); for (let i = 0; i < 200; i++) { x.tsChance(H, 30.2, 71.4, 122, { force: true }); x.fogChance(H, 30.2, 71.4, 122, { force: true }); }
  const t0 = process.hrtime.bigint(); const N = 200; for (let i = 0; i < N; i++) { x.tsChance(H, 30.2 + i * 0.01, 71.4, 122, { force: true }); x.fogChance(H, 30.2 + i * 0.01, 71.4, 122, { force: true }); }
  const t = Number(process.hrtime.bigint() - t0) / 1e6 / N; ok(t < 1, `4 · ${t.toFixed(3)} ms per place (5 days hourly, thunderstorm + fog)`); }

/* 5 · wiring */
{ const idx = readFileSync(join(ROOT, 'server/api/index.mjs'), 'utf8');
  ok(/app\.wxhaz = createWxHaz\(\{ dataDir \}\)/.test(idx), '5 · index.mjs creates app.wxhaz');
  const users = readdirSync(join(ROOT, 'server/api')).filter((f) => f.endsWith('.mjs') && f !== 'wxhaz.mjs' && f !== 'index.mjs')
    .filter((f) => /app\.wxhaz|wxhaz\.mjs/.test(readFileSync(join(ROOT, 'server/api', f), 'utf8')));
  ok(users.length === 0, '5 · no customer route reads app.wxhaz in v271', users.join(',')); }

console.log(`\n${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
