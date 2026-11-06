import { gateOpen } from '../gate.js';

export function viewName() {
  try { return gateOpen() && localStorage.getItem('agn.operator.v2') === '1' ? 'operator' : 'customer'; } catch { return 'customer'; }
}

/* Shared GET layer: every page reads through here, so one URL is fetched once,
   concurrent callers share the in-flight promise, and answers are reused until
   their TTL runs out (in memory, and in sessionStorage across reloads). */

const MIN = 60e3;
const TTL_RULES = [
  [/^\/api\/(reports|case|ai\/chat|report\/generate|dashboard)(\/|\?|$)/, 0],
  [/^\/customize\//, 0],
  [/^\/n3\//, 12 * 60 * MIN],
  [/^\/api\/geo\/search/, 30 * MIN],
  [/^\/(api\/)?health(\?|$)|^\/api\/(ai\/status|operator\/status|ops\/selfcheck)/, MIN],
  [/^\/api\/(fleet|ops)\//, 50e3],
  [/^\/api\/(point|pointstate|scenario|guidance|ecmwf010\/point|report\/past30|levels\/unit|outlook\/unit|smog\/unit|site|hyperlocal|pool\/point)/, 10 * MIN],
];
const DEFAULT_TTL = 5 * MIN;
const MAX_MEM = 400;
const MAX_PERSIST = 300;
const HYDRATE_WAIT_MS = 400;
const DB_NAME = 'agn-cache';
const DB_STORE = 'json';

const memory = new Map(); // key → { body, at, ttl }
const inflight = new Map(); // key → { promise, loud }

export function ttlFor(url) {
  const path = String(url).replace(/^https?:\/\/[^/]+/, '');
  for (const [re, ttl] of TTL_RULES) if (re.test(path)) return ttl;
  return DEFAULT_TTL;
}

function keyFor(url, view) {
  return `${view}|${url}`;
}

function cacheTtl(body, ttl) {
  if (!body || typeof body !== 'object') return 0;
  if (body.__status === 403 || body.__status === 404) return Math.min(ttl, 2 * MIN);
  if (body.__status >= 500) return Math.min(ttl, 45e3);
  if (body.__status || body.error === true || body.ok === false || body.ready === false || body.preparing) return 0;
  return ttl;
}

/* IndexedDB keeps answers across reloads (sessionStorage is too small for
   multi-MB layers). Memory is filled from it once at boot. */
let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function idle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 30);
}

function persist(key, entry) {
  if (entry.ttl < MIN) return;
  idle(() => {
    openDb().then((db) => {
      if (!db) return;
      try { db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(entry, key); } catch { /* quota or clone */ }
    });
  });
}

function hydrate() {
  return openDb().then((db) => new Promise((resolve) => {
    if (!db) { resolve(); return; }
    const now = Date.now();
    const rows = [];
    try {
      const store = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          rows.sort((a, b) => b[1].at - a[1].at);
          rows.slice(MAX_PERSIST).forEach(([k]) => { try { store.delete(k); } catch { /* ignore */ } });
          resolve();
          return;
        }
        const entry = cursor.value;
        if (!entry || now - entry.at >= entry.ttl) cursor.delete();
        else {
          rows.push([cursor.key, entry]);
          if (!memory.has(cursor.key)) memory.set(cursor.key, entry);
        }
        cursor.continue();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  }));
}

let hydrated = false;
const hydrating = typeof indexedDB === 'undefined'
  ? Promise.resolve()
  : Promise.race([hydrate(), new Promise((r) => setTimeout(r, HYDRATE_WAIT_MS))]).finally(() => { hydrated = true; });
if (typeof indexedDB === 'undefined') hydrated = true;

try {
  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith('agn.c1:')) sessionStorage.removeItem(k);
  }
} catch { /* ignore */ }

function remember(key, body, ttl) {
  const entry = { body, at: Date.now(), ttl };
  memory.delete(key);
  memory.set(key, entry);
  if (memory.size > MAX_MEM) memory.delete(memory.keys().next().value);
  persist(key, entry);
}

function lookup(key) {
  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at >= entry.ttl) return null;
  return entry;
}

/* In-flight counter drives the global loading bar. */
let active = 0;
function bump(delta) {
  active = Math.max(0, active + delta);
  try { window.dispatchEvent(new CustomEvent('agn:net', { detail: active })); } catch { /* ignore */ }
}
export function activeRequests() {
  return active;
}

let quiet = 0;
/** Run `fn` with its GETs hidden from the loading bar (background prefetch). */
export function withQuiet(fn) {
  quiet += 1;
  try { return fn(); } finally { quiet -= 1; }
}

/**
 * Cached JSON GET.
 * opts.force — skip the cache (manual refresh buttons, polling).
 * opts.ttl   — override the per-endpoint TTL (ms).
 * opts.view  — send a specific x-agn-view header.
 */
export function getJson(url, opts = {}) {
  const loud = quiet === 0;
  if (!hydrated && !opts.force) return hydrating.then(() => fetchJson(url, opts, loud));
  return fetchJson(url, opts, loud);
}

function fetchJson(url, opts, loud) {
  const view = opts.view || viewName();
  const ttl = opts.ttl ?? ttlFor(url);
  const key = keyFor(url, view);

  if (!opts.force && ttl > 0) {
    const hit = lookup(key);
    if (hit) return Promise.resolve(hit.body);
  }
  const flying = !opts.force && inflight.get(key);
  if (flying) {
    if (loud && !flying.loud) {
      flying.loud = true;
      bump(1);
      flying.promise.finally(() => bump(-1));
    }
    return flying.promise;
  }

  if (loud) bump(1);
  const isStatic = /^\/n3\//.test(url);
  const promise = fetch(url, {
    cache: isStatic ? 'default' : 'no-store',
    headers: { 'x-agn-view': view },
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) body.__status = res.status;
    const keep = ttl > 0 ? cacheTtl(body, ttl) : 0;
    if (keep > 0) remember(key, body, keep);
    return body;
  }).finally(() => {
    if (loud) bump(-1);
    if (inflight.get(key)?.promise === promise) inflight.delete(key);
  });
  inflight.set(key, { promise, loud });
  return promise;
}

/** Resolves once the persisted cache has been loaded into memory. */
export function whenHydrated() {
  return hydrating;
}

export function isQuiet() {
  return quiet > 0;
}

/** Store a derived value (e.g. a merged place bundle) under a non-URL key. */
export function cachePut(key, body, ttl) {
  remember(`*|${key}`, body, ttl);
}

export function cachePeek(key) {
  return lookup(`*|${key}`)?.body ?? null;
}

/** Sync read of a fresh cached GET (null when missing or stale). */
export function peekJson(url, opts = {}) {
  const view = opts.view || viewName();
  const hit = lookup(keyFor(url, view));
  return hit ? hit.body : null;
}

/** Drop cached answers whose URL starts with `prefix` (after a write). */
export function invalidateJson(prefix = '') {
  const match = (key) => String(key).slice(String(key).indexOf('|') + 1).startsWith(prefix);
  for (const key of [...memory.keys()]) if (match(key)) memory.delete(key);
  openDb().then((db) => {
    if (!db) return;
    try {
      const req = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (match(cursor.key)) cursor.delete();
        cursor.continue();
      };
    } catch { /* ignore */ }
  });
}

/** Track a non-GET request on the loading bar. */
export function trackRequest(promise) {
  bump(1);
  return Promise.resolve(promise).finally(() => bump(-1));
}

export function pktClock(date = new Date()) {
  const pkt = new Date(date.getTime() + 5 * 3600e3);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hm = pkt.toISOString().slice(11, 16);
  return `${days[pkt.getUTCDay()]} ${pkt.getUTCDate()} ${months[pkt.getUTCMonth()]} · ${hm} PKT`;
}

export function dayName(offset) {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  const pkt = new Date(Date.now() + 5 * 3600e3);
  const day = new Date(Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) + offset * 864e5);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[day.getUTCDay()]} ${day.getUTCDate()} ${months[day.getUTCMonth()]}`;
}

export function whenWords(offset) {
  if (offset === 0) return 'today';
  if (offset === 1) return 'tomorrow';
  return `on ${dayName(offset)}`;
}
