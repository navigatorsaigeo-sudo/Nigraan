// v91.17.283 · WS2 · ask one server every request of urls60.json, in order, and keep status + body. One server at a time (shared container).
// If <out.json> already holds a capture, only its failed requests (fetch errors) are asked again (a server lost to memory pressure is restarted
// by cmp60.sh and the capture resumed). usage: node capture60.mjs <port> <urls.json> <out.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [PORT, IN, OUT] = process.argv.slice(2); const reqs = JSON.parse(readFileSync(IN, 'utf8'));
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : reqs.map(() => ({ s: 'ERR not asked', b: '' }));
for (let i = 0; i < reqs.length; i++) { if (!String(out[i].s).startsWith('ERR')) continue; const q = reqs[i];
  try { const r = await fetch('http://127.0.0.1:' + PORT + q.path, { method: q.m, headers: q.body ? { 'content-type': 'application/json' } : {}, body: q.body ? JSON.stringify(q.body) : undefined, signal: AbortSignal.timeout(240000) });
    out[i] = { s: r.status, b: await r.text() }; } catch (e) { out[i] = { s: 'ERR ' + e.message, b: '' }; } }
writeFileSync(OUT, JSON.stringify(out)); const n = out.filter(x => String(x.s).startsWith('ERR')).length; console.log('captured', out.length, 'errors', n); process.exit(n ? 2 : 0);
