/* v91.17.273 FLOOD · speed gate: the level answers on base and new (median of 30 each, interleaved). node speed.mjs <base> <new> */
const [A, B] = process.argv.slice(2);
const P = ['/api/levels/unit?unit=' + encodeURIComponent('Punjab|Lahore|Lahore City'), '/api/levels?layer=drought&day=0', '/api/levels?layer=heat&day=1', '/api/levels?day=2', '/'];
const t = async (o, p) => { const s = performance.now(); const r = await fetch(o + p, { headers: { 'x-agn-view': 'customer' } }); await r.arrayBuffer(); return performance.now() - s; };
const med = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
for (const p of P) { const a = [], b = []; for (let i = 0; i < 30; i++) { a.push(await t(A, p)); b.push(await t(B, p)); }
  const ma = med(a), mb = med(b); console.log((mb > ma * 1.1 && mb - ma > 2 ? 'SLOWER ' : 'ok     ') + p.slice(0, 60).padEnd(62) + ' base ' + ma.toFixed(1) + ' ms  new ' + mb.toFixed(1) + ' ms'); }
