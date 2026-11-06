import { cachePeek, cachePut, getJson, isQuiet, peekJson, whenHydrated, withQuiet } from '../start/api.js';

/** Shared place-derived cache: one /api/point (and kin) per place until TTL, shared across Overview / Forecast / tabs. */

const TTL_MS = 10 * 60e3;
const MAX_ENTRIES = 80;

const bundles = new Map(); // coord → { parts: string[], body, at }
const pending = new Map(); // `${coord}|${parts}` → Promise

function trimMap(map) {
  if (map.size <= MAX_ENTRIES) return;
  const oldest = [...map.entries()].sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  while (map.size > MAX_ENTRIES && oldest.length) {
    map.delete(oldest.shift()[0]);
  }
}

export function coordKey(lat, lon) {
  return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
}

export function partsList(parts) {
  return [...new Set(String(parts || 'default').split(',').map((p) => p.trim()).filter(Boolean))].sort();
}

function hasAll(have, want) {
  const set = new Set(have || []);
  return want.every((p) => set.has(p));
}

function fresh(entry) {
  return entry && entry.body && !entry.body.error && (Date.now() - (entry.at || 0) < TTL_MS);
}

function flightKey(coord, partNames) {
  return `${coord}|${partNames.join(',')}`;
}

function bundleEntry(key) {
  let entry = bundles.get(key);
  if (!fresh(entry)) {
    const saved = cachePeek(`bundle:${key}`);
    if (saved && fresh(saved)) {
      entry = saved;
      bundles.set(key, saved);
    }
  }
  return entry;
}

/** Sync peek — returns cached bundle if it covers `parts`, else null. */
export function peekPointBundle(lat, lon, parts = 'default') {
  const entry = bundleEntry(coordKey(lat, lon));
  if (!fresh(entry)) return null;
  if (!hasAll(entry.parts, partsList(parts))) return null;
  return entry.body;
}

function rememberBundle(key, partNames, body) {
  const prev = bundles.get(key);
  const prevOk = fresh(prev);
  const failed = body?.ok === false || body?.error || body?.__status;
  if (failed && prevOk) return prev.body;
  const entry = failed
    ? { parts: partNames, body: body.error ? body : { error: true, why: body?.why, __status: body?.__status }, at: Date.now() }
    : {
      parts: partsList([...(prevOk ? prev.parts : []), ...partNames].join(',')),
      body: {
        ...(prevOk ? prev.body : {}),
        ...body,
        parts: { ...(prevOk ? prev.body?.parts || {} : {}), ...(body?.parts || {}) },
      },
      at: Date.now(),
    };
  bundles.set(key, entry);
  trimMap(bundles);
  if (!failed) cachePut(`bundle:${key}`, entry, Math.max(0, TTL_MS - (Date.now() - entry.at)));
  return entry.body;
}

function flightsFor(coord, want) {
  const waits = [];
  const flying = new Set();
  for (const [fk, promise] of pending) {
    if (!fk.startsWith(`${coord}|`)) continue;
    const parts = fk.slice(coord.length + 1).split(',').filter(Boolean);
    if (!parts.some((p) => want.includes(p))) continue;
    parts.forEach((p) => flying.add(p));
    waits.push(promise);
  }
  return { waits, flying };
}

function startFetch(key, lat, lon, name, fetchParts) {
  const fk = flightKey(key, fetchParts);
  if (pending.has(fk)) return pending.get(fk);

  const q = new URLSearchParams({
    lat: Number(lat).toFixed(5),
    lon: Number(lon).toFixed(5),
    parts: fetchParts.join(','),
  });
  if (name) q.set('name', name);

  const promise = getJson(`/api/point?${q}`).then((body) => (
    rememberBundle(key, fetchParts, body && !body.__status ? body : { error: true, why: body?.why, __status: body?.__status })
  )).catch((err) => {
    const fail = { error: true, why: err?.message || 'request failed' };
    if (!fresh(bundles.get(key))) rememberBundle(key, fetchParts, fail);
    return fail;
  }).finally(() => {
    pending.delete(fk);
  });

  pending.set(fk, promise);
  return promise;
}

/**
 * Fetch /api/point for a place. Reuses cache and in-flight requests.
 * Only hits the network when this place/parts is missing or stale.
 */
let hydrated = false;
whenHydrated().then(() => { hydrated = true; });

export function getPointBundle(args) {
  if (hydrated) return loadPointBundle(args);
  const quiet = isQuiet();
  return whenHydrated().then(() => (quiet ? withQuiet(() => loadPointBundle(args)) : loadPointBundle(args)));
}

function loadPointBundle({ lat, lon, name, parts = 'default' }) {
  const key = coordKey(lat, lon);
  const want = partsList(parts);
  const entry = bundleEntry(key);

  if (fresh(entry) && hasAll(entry.parts, want)) {
    return Promise.resolve(entry.body);
  }

  const have = fresh(entry) ? entry.parts : [];
  const { waits, flying } = flightsFor(key, want);
  const missing = want.filter((p) => !have.includes(p) && !flying.has(p));
  if (missing.length) waits.push(startFetch(key, lat, lon, name, missing));
  if (!waits.length) return startFetch(key, lat, lon, name, want);

  return Promise.all(waits).then((bodies) => {
    const done = bundles.get(key);
    if (done?.body && !done.body.error) return done.body;
    return bodies.find((b) => b && !b.error) || bodies[bodies.length - 1];
  });
}

/** Generic GET cache for other place-derived URLs (sweep-near, guidance, unit, …). */
export function cachedGet(url, ttlMs = TTL_MS) {
  return getJson(url, { ttl: ttlMs });
}

export function peekCached(url) {
  return peekJson(url);
}

export function clearPlaceCache() {
  bundles.clear();
  pending.clear();
}
