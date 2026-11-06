/* v91.17.275 HAZ2 · speed gate: median of 30 interleaved requests, base vs this tree. node speed.mjs <base> <new> */
const [A, B] = process.argv.slice(2);
const P = ['/api/glof/upstream?lat=36.32&lon=74.65', '/api/glof/national', '/api/glof/map', '/api/levels/unit?unit=' + encodeURIComponent('Punjab|Lahore|Lahore City'), '/api/site/screening?lat=33.7&lon=73.05', '/api/faults/nearest?lat=33.7&lon=73.05', '/api/sources', '/'];
const t = async (o, p) => { const s = performance.now(); const r = await fetch(o + p, { headers: { 'x-agn-view': 'customer' } }); await r.arrayBuffer(); return performance.now() - s; };
const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q[q.length >> 1]; };
for (const p of P) { await t(A, p); await t(B, p); const a = [], b = []; for (let i = 0; i < 30; i++) { a.push(await t(A, p)); b.push(await t(B, p)); }
  console.log(p.slice(0, 60).padEnd(62), 'base', med(a).toFixed(1), 'ms · new', med(b).toFixed(1), 'ms'); }
