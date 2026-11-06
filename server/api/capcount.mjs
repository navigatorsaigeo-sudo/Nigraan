/* v91.17.108 · audit v107 F8: how often each correction cap binds. Every capped term counts its evaluations and the ones the cap
   changed, since the server started (and the last 24 h in hourly buckets). GET /api/ops/caps (operator). */
const C = new Map();
function slot(name) { let c = C.get(name); if (!c) { c = { n: 0, hit: 0, maxAbsRaw: 0, hours: new Map() }; C.set(name, c); } return c; }
export function capped(name, raw, cap) {
  if (raw == null || !Number.isFinite(raw)) return raw;
  const c = slot(name); c.n++; const a = Math.abs(raw); if (a > c.maxAbsRaw) c.maxAbsRaw = a;
  const h = Math.floor(Date.now() / 3600e3); const b = c.hours.get(h) || [0, 0]; b[0]++;
  let v = raw; if (a > cap) { c.hit++; b[1]++; v = Math.sign(raw) * cap; }
  c.hours.set(h, b); if (c.hours.size > 30) { for (const k of c.hours.keys()) { if (k < h - 24) c.hours.delete(k); } }
  return v;
}
export function capReport() {
  const h = Math.floor(Date.now() / 3600e3), out = {};
  for (const [k, c] of C) { let n24 = 0, hit24 = 0; for (const [hh, b] of c.hours) if (hh > h - 24) { n24 += b[0]; hit24 += b[1]; }
    out[k] = { evaluations: c.n, capped: c.hit, share: c.n ? Math.round(1e4 * c.hit / c.n) / 1e4 : null, last24h: { evaluations: n24, capped: hit24 }, largestUncappedC: Math.round(c.maxAbsRaw * 100) / 100 }; }
  return { since: STARTED, caps: out, note: 'a cap that binds often hides a systematic error; investigate any share above 1 %' };
}
const STARTED = new Date().toISOString();
