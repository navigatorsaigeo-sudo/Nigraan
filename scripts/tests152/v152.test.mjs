/* v91.17.152 · observed flood water (satellite 3-day composite) · run with the server up on :8787 */
import { readFileSync } from 'node:fs';
const B = process.env.NIGRAAN_URL || 'http://localhost:8787'; let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const j = async (p, o) => { const r = await fetch(B + p, o); return { s: r.status, b: await r.json().catch(() => null) }; };
const st = (await j('/api/floodobs/status')).b;
ok(st && st.runs === true && st.token && 'present' in st.token, 'status: run table loaded, token presence reported without the token');
ok(!JSON.stringify(st).match(/eyJ[\w-]{20,}/), 'status never carries the token');
const H = JSON.parse(readFileSync(new URL('../../data/floodobs-runs.json', import.meta.url), 'utf8'));
if (st.latest) {
  const n = (await j('/api/floodobs')).b; ok(n.ok && Object.keys(n.units).length === H.units.length, 'national: every tehsil carries a value (' + H.units.length + ')');
  const uid = H.units[H.pixels.indexOf(Math.max(...H.pixels.slice(0, 600)))]; const u = (await j('/api/floodobs/unit?u=' + encodeURIComponent(uid))).b;
  ok(u.ok && u.counts.reduce((s, x) => s + x, 0) === H.pixels[H.units.indexOf(uid)], 'unit: class counts add up to the tehsil\'s pixels');
  ok(u.seenShare != null && u.caveats && u.caveats.length >= 3, 'unit: the not-seen share and the caveats travel with the value');
  const sc = (await fetch(B + '/api/point?lat=28.69&lon=69.95').then((r) => r.json()).then((x) => (x && x.parts && x.parts.siteScreening ? x.parts.siteScreening.v : null)).catch(() => null)) || {}; /* v283.19: the place bundle */ const row = (sc.rows || []).find((r) => /seen by satellite/.test(r.parameter));
  ok(row && row.verdict === null && /of the tehsil seen|not seen/.test(row.values), 'site screening: satellite flood row, observation only (no verdict), seen share shown');
  ok(row && !/NASA|MODIS|LANCE|MCDWD/.test(JSON.stringify(row)), 'site screening row names no supplier');
} else console.log('SKIP no map fetched yet: ' + (st.lastError || 'pending'));
const cv = await j('/api/floodobs/refresh', { method: 'POST', headers: { 'x-agn-view': 'customer' } }); ok(cv.s === 401, 'refresh is operator-only (customer view refused)');
console.log(`v152: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
