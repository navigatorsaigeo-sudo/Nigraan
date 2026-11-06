/* v91.17.283 · WS4 · test helper: runs <root>/server/server.mjs with the forecast provider answered by scripts/tests267/om_mock.mjs
   (no network). Every other non-loopback request fails at once. usage: node child.mjs <root> */
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { omAnswer } from '../../tests267/om_mock.mjs';
const root = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url && url.url ? url.url : url));
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]') return realFetch(url, opts);
  if (/open-meteo\.com$/.test(u.hostname) && u.pathname === '/v1/forecast') return new Response(JSON.stringify(omAnswer(u.searchParams, Date.now())), { status: 200, headers: { 'content-type': 'application/json' } });
  throw new Error('offline test: no network for ' + u.hostname);
};
await import(pathToFileURL(join(root, 'server', 'server.mjs')).href);
