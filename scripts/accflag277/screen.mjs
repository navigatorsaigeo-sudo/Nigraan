// stuck / replay screen on every MACH series in the LAMHA copy of the MACH database (+ fleet_obs csv for 1-5 Oct): per-station reject rates
import { readFileSync, readdirSync } from 'node:fs';
const { screenSeries } = await import(process.argv[2] + '/server/api/stuckscreen.mjs');
const DB = '/mnt/user-data/uploads/LAMHA/data/mach/db';
const rows = new Map();
for (const f of readdirSync(DB).filter((x) => /^obs_\d{8}\.csv$/.test(x)).sort()) { const L = readFileSync(DB + '/' + f, 'utf8').split('\n'); const h = L[0].split(',');
  const ix = (n) => h.indexOf(n); const K = ix('stationKey'), T = ix('time'), S = ix('source'), t = ix('temperatureC'), td = ix('dewPointC'), rh = ix('humidityPct'), p = ix('pressureHpa');
  for (let i = 1; i < L.length; i++) { const c = L[i].split(','); if (c.length < 5) continue; if (/^(qm|apple)$/i.test(c[S])) continue; const num = (j) => (c[j] === '' || c[j] == null ? null : Number(c[j]));
    const r = { ms: Date.parse(c[T]), T: num(t), Td: num(td), RH: num(rh), P: num(p), src: c[S] }; if (!rows.has(c[K])) rows.set(c[K], []); rows.get(c[K]).push(r); } }
const want = (process.argv[3] || '').split(',');
const out = {};
for (const [k, l] of rows) { l.sort((a, b) => a.ms - b.ms); const v = screenSeries(l); const c = {}; v.forEach((x) => (c[x] = (c[x] || 0) + 1));
  out[k] = { n: l.length, src: [...new Set(l.map((r) => r.src))].join('+'), ...c };
  if (want.includes(k)) { out[k].bad = l.map((r, i) => [new Date(r.ms + 5 * 3600e3).toISOString().slice(5, 16), r.T, r.RH, v[i]]).filter((x) => x[3] !== 'ok').slice(0, 40);
    /* night (00-05 PKT) mean of accepted readings by day */
    const nd = {}; l.forEach((r, i) => { if (v[i] !== 'ok' || r.T == null) return; const pk = new Date(r.ms + 5 * 3600e3); const hh = pk.getUTCHours(); const d = pk.toISOString().slice(5, 10); const b = hh <= 5 ? 'n' : hh >= 11 && hh <= 16 ? 'd' : null; if (!b) return; nd[d + b] = nd[d + b] || [0, 0]; nd[d + b][0] += r.T; nd[d + b][1]++; });
    out[k].dn = Object.fromEntries(Object.entries(nd).map(([a, b]) => [a, Math.round(b[0] / b[1] * 10) / 10])); } }
console.log(JSON.stringify(out));
