/* test only: the in-tree mock provider in its OWN process (its synthetic generator then costs the server under test no event-loop time).
   GET /m?u=<provider url> -> the mock answer; GET /stats -> calls per caller port; POST /reset */
import http from 'node:http';
await import(process.env.MOCK_PROVIDER_FILE);
const S = {};
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/stats') { res.end(JSON.stringify(S)); return; }
  if (u.pathname === '/reset') { for (const k of Object.keys(S)) delete S[k]; res.end('{}'); return; }
  const target = u.searchParams.get('u'), port = req.headers['x-port'] || '?';
  let n = 1; try { n = (new URL(target).searchParams.get('latitude') || '').split(',').filter(Boolean).length || 1; } catch (_) {}
  const e = S[port] || (S[port] = { calls: 0, locs: 0, byPath: {} }); e.calls++; e.locs += n; const pth = new URL(target).pathname; e.byPath[pth] = (e.byPath[pth] || 0) + 1;
  try { const r = await fetch(target); const b = Buffer.from(await r.arrayBuffer()); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(b); }
  catch (er) { res.writeHead(599); res.end(String(er.message)); }
}).listen(Number(process.env.MOCK_PORT || 8969), '127.0.0.1');
console.log('mock on', process.env.MOCK_PORT || 8969);
