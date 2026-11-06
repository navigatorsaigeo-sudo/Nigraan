/* test only preload: frozen clock (MOCK_FREEZE) + every provider fetch answered by mocksrv.mjs (MOCK_REMOTE port), with a provider-like
   latency (MOCK_LAT_MS + MOCK_LAT_PER_LOC per location); every other non-loopback fetch fails at once (offline) */
const FREEZE = Number(process.env.MOCK_FREEZE || 0);
if (FREEZE) { const RD = Date; class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(FREEZE); } static now() { return FREEZE; } } globalThis.Date = FD; }
const real = globalThis.fetch, MP = process.env.MOCK_REMOTE || '8969', base = Number(process.env.MOCK_LAT_MS || 0), per = Number(process.env.MOCK_LAT_PER_LOC || 0), me = process.env.PORT || '?';
globalThis.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  let u; try { u = new URL(url); } catch { return real(input, init); }
  if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) return real(input, init);
  if (/open-meteo\.com$/.test(u.hostname)) {
    const n = (u.searchParams.get('latitude') || '').split(',').length;
    if (base > 0) await new Promise((r) => setTimeout(r, base + per * n));
    return real('http://127.0.0.1:' + MP + '/m?u=' + encodeURIComponent(url), { headers: { 'x-port': me }, signal: init && init.signal });
  }
  throw new TypeError('fetch failed (offline test: ' + u.hostname + ')');
};
