/* v91.17.274 GRID · speed: what a customer waits for while a street-map tile is being worked out.
   usage: node grid_speed.mjs <port> [rounds]
   Each round: a new 0.25 degree tile (100 x 100, q=moist) is asked, and while it is worked out 6 ordinary customer requests
   (/api/point/forecast at 6 places, cached on the second ask) are timed; then the tile itself and a repeated ask of it (hour cache).
   Prints medians; JSON on the last line. */
const [port, R = '6', OFF = '0'] = process.argv.slice(2); const B = 'http://127.0.0.1:' + port;
const t = async (u) => { const a = performance.now(); const r = await fetch(B + u); await r.arrayBuffer(); return performance.now() - a; };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const PL = [[31.558, 74.351], [24.861, 67.01], [33.684, 73.048], [34.015, 71.524], [30.196, 71.475], [25.396, 68.377]];
for (const p of PL) await t(`/api/point/forecast?lat=${p[0]}&lon=${p[1]}`);   /* warm the per-place caches */
const during = [], alone = [], tile = [], again = [];
for (let i = 0; i < +R; i++) {
  for (const p of PL) alone.push(await t(`/api/point/forecast?lat=${p[0]}&lon=${p[1]}`));
  const s = 29.0 + 0.25 * (i + +OFF), w = 73.25 + 0.25 * (i % 3);
  const u = `/api/hyperlocal/grid?s=${s.toFixed(4)}&w=${w.toFixed(4)}&n=${(s + 0.25).toFixed(4)}&e=${(w + 0.25).toFixed(4)}&nx=100&ny=100&q=moist`;
  const tp = t(u); await new Promise(ok => setTimeout(ok, 150));
  const dp = Promise.all(PL.map(p => t(`/api/point/forecast?lat=${p[0]}&lon=${p[1]}`)));
  const [tt, dd] = await Promise.all([tp, dp]); tile.push(tt); during.push(...dd); again.push(await t(u));
}
const o = { port, rounds: +R, pointAloneMs: +med(alone).toFixed(1), pointWhileTileMs: +med(during).toFixed(1), pointWhileTileMaxMs: +Math.max(...during).toFixed(1), tileMs: +med(tile).toFixed(0), tileRepeatMs: +med(again).toFixed(1) };
console.log(JSON.stringify(o));
