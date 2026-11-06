/* ══ v91.17.207 · THE ENGINE WITHOUT A BROWSER (audit B20 / phase B) ═══════════════════════════════════════════════════════════════
   The hazard levels are computed by the page's own engine (mask -> day input -> hazard engine -> five-level ladder), so the API, the
   alerts and the archive give exactly what the map gives. Until v91.17.206 the server ran that engine by starting Microsoft Edge or
   Chrome headless on this computer: a browser installation, a profile folder, browser memory and browser crashes all sat under the
   science. This runner executes the same page scripts (the artefact the server serves, byte for byte) in a Node.js virtual machine
   context, in engine mode, with a document that holds no layout: elements accept and ignore drawing; the inline JSON data blocks are
   real; network calls go to this server exactly as the page's would. Measured against the headless browser on the same inputs
   (9 Oct 2026, 576 tehsils x 12 layers x days 0-3): 19,006 of 19,008 levels identical; the 2 others were heat cells at a level edge
   read a minute apart.
   Each timer callback runs with a time limit (a runaway UI routine is stopped and reported, never left to block the engine); the
   page's own 3-hourly reload ends this process and engine.mjs starts a fresh one. Log: data/engine-vm.log (1 MB, one old copy).
   Started by server/api/engine.mjs (NIGRAAN_ENGINE_RUNNER=browser keeps the old headless-browser runner). */
import vm from 'node:vm';
import { readFileSync, appendFileSync, statSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance as perf } from 'node:perf_hooks';
import { webcrypto } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.NIGRAAN_ENGINE_PORT || process.env.PORT || 8787), ORIGIN = 'http://127.0.0.1:' + PORT;
const DATA = process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data');
const ARTEFACT = process.env.NIGRAAN_ENGINE_ARTEFACT || join(ROOT, 'artefact', process.env.NIGRAAN_ARTEFACT || 'AI_GEO_NIGRAAN_v91_17_MACH.html');
/* a callback may run this long before it is stopped as a runaway: the engine's own derivation of 576 tehsils x 12 layers x 4 days took
   5 s in the cloud and over 30 s on the laptop at below-normal priority during a sweep (9 Oct, the first v208 start), so the limit is
   generous; it exists to end an endless loop, not to time the engine */
const CB_LIMIT_MS = Number(process.env.NIGRAAN_ENGINE_CB_LIMIT_S || 600) * 1000;
const LOG = process.env.REPLAY_LOG || '/dev/null';
const SEEN = new Map();   /* the same message is logged 3 times, then every 500th time */
function log(...a) { const m = a.map(String).join(' '); const key = m.replace(/\d+/g, '#').slice(0, 160); const n = (SEEN.get(key) || 0) + 1; SEEN.set(key, n); if (n > 3 && n % 500) return; if (n > 3) a.push('(seen ' + n + ' times)'); try { try { if (statSync(LOG).size > 1048576) renameSync(LOG, LOG + '.1'); } catch (_) {} appendFileSync(LOG, new Date().toISOString() + ' ' + a.map(String).join(' ') + '\n'); } catch (_) {} }

const html = readFileSync(ARTEFACT, 'utf8');
const jsonEls = new Map();
for (const m of html.matchAll(/<script\b([^>]*application\/json[^>]*)>([\s\S]*?)<\/script>/g)) { const id = (m[1].match(/id="([^"]+)"/) || [])[1]; if (id) jsonEls.set(id, m[2]); }
const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], code: m[2] })).filter((b) => !/application\/json/.test(b.attrs) && !/\bsrc=/.test(b.attrs));

/* an element that holds no layout: reads give more of the same, writes are kept, calls do nothing, arithmetic gives 0 */
function stub(label) {
  const store = new Map();
  return new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return (hint) => (hint === 'string' ? '' : 0);
      if (k === Symbol.iterator) return function* () {};
      if (typeof k === 'symbol' || k === 'then' || k === '_leaflet_id' || k === '_leaflet' || k === '_leaflet_pos') return undefined;
      if (k === 'toJSON') return () => null;
      if (k === 'toString') return () => '';
      if (k === 'valueOf') return () => 0;
      if (k === 'length') return 0;
      if (store.has(k)) return store.get(k);
      if (k === 'style') { const s = stub(label + '.style'); store.set(k, s); return s; }
      if (k === 'classList') { const c = { add() {}, remove() {}, toggle() { return false; }, contains() { return false; }, replace() {} }; store.set(k, c); return c; }
      if (k === 'dataset') { const d = {}; store.set(k, d); return d; }
      if (k === 'children' || k === 'childNodes') return [];
      if (/^(querySelectorAll|getElementsByTagName|getElementsByClassName)$/.test(k)) return () => [];
      if (k === 'querySelector') return (q) => stub('q:' + q);
      if (k === 'closest') return () => null;
      if (/^(parentNode|parentElement|firstChild|lastChild|nextSibling|previousSibling|offsetParent|firstElementChild)$/.test(k)) return null;
      if (/^(addEventListener|removeEventListener|setAttribute|removeAttribute|appendChild|removeChild|insertBefore|replaceChild|append|prepend|remove|focus|blur|scrollTo|scrollIntoView|click|dispatchEvent|after|before|insertAdjacentHTML|insertAdjacentElement)$/.test(k)) return (x) => x;
      if (k === 'getAttribute') return () => null;
      if (k === 'hasAttribute') return () => false;
      if (k === 'getBoundingClientRect') return () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 });
      if (/^(clientWidth|clientHeight|offsetWidth|offsetHeight|scrollWidth|scrollHeight|scrollTop|scrollLeft|offsetTop|offsetLeft)$/.test(k)) return 0;
      if (/^(innerHTML|outerHTML|textContent|innerText|value|id|className|tagName|nodeName)$/.test(k)) return '';
      const c = stub(label + '.' + String(k)); store.set(k, c); return c;
    },
    set(t, k, v) { if (k === '_leaflet_id' || k === '_leaflet') return true; store.set(k, v); return true; },
    has() { return true; },
    apply() { return stub(label + '()'); },
    construct() { return stub('new ' + label); },
  });
}
const listeners = {}, els = new Map();
const docOver = {
  readyState: 'loading', cookie: '', title: 'NIGRAAN', hidden: true, visibilityState: 'hidden', referrer: '', currentScript: null,
  getElementById: (id) => { if (jsonEls.has(id)) { const t = jsonEls.get(id); return { id, type: 'application/json', textContent: t, innerHTML: t, innerText: t, getAttribute: (k) => (k === 'type' ? 'application/json' : null) }; } if (!els.has(id)) els.set(id, stub('#' + id)); return els.get(id); },
  querySelector: (q) => stub('q:' + q), querySelectorAll: () => [], getElementsByTagName: () => [], getElementsByClassName: () => [],
  createTreeWalker: () => ({ nextNode: () => null, currentNode: null, firstChild: () => null, nextSibling: () => null }), createNodeIterator: () => ({ nextNode: () => null, detach() {} }), createRange: () => stub('range'),
  createElement: (t) => stub('<' + t + '>'), createElementNS: (n, t) => stub('<' + t + '>'), createTextNode: () => stub('text'), createDocumentFragment: () => stub('fragment'),
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); }, removeEventListener() {}, dispatchEvent: () => true,
  body: stub('body'), head: stub('head'), documentElement: stub('html'), fonts: { ready: Promise.resolve(), load: () => Promise.resolve() },
};
const document = new Proxy(stub('document'), { get(t, k) { return k in docOver ? docOver[k] : t[k]; }, set(t, k, v) { docOver[k] = v; return true; } });
const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] || null, get length() { return mem.size; } };
/* the address the server's own redirect gives a first visit (server.mjs: ?backend=<origin>/px&integration=auto), in engine mode */
const SEARCH = '?backend=' + encodeURIComponent(ORIGIN + '/px') + '&integration=auto&engine=1', HREF = ORIGIN + '/' + SEARCH;
const ctx = {
  console: { log() {}, info() {}, debug() {}, warn() {}, table() {}, group() {}, groupEnd() {}, time() {}, timeEnd() {}, dir() {}, error: (...a) => { log('page error:', a.map((x) => String(x && x.message || x)).join(' ').slice(0, 300)); } },
  queueMicrotask, structuredClone, Headers, Request, Response, AbortController, AbortSignal, URL, URLSearchParams, TextEncoder, TextDecoder, Blob, Event, EventTarget, CustomEvent: globalThis.CustomEvent || class CustomEvent extends Event { constructor(t, o) { super(t, o); this.detail = o && o.detail !== undefined ? o.detail : null; } }, atob, btoa,
  fetch: (u, o = {}) => (globalThis.__REPLAY_FETCH ? globalThis.__REPLAY_FETCH(String(u && u.url ? u.url : u), o) : Promise.reject(new Error('offline replay'))),
  crypto: webcrypto,
  performance: { now: () => perf.now(), timeOrigin: perf.timeOrigin, mark() {}, measure() {}, getEntriesByType: (t) => (t === 'navigation' ? [{ name: HREF, type: 'navigate' }] : []), getEntriesByName: () => [] },
  location: { href: HREF, origin: ORIGIN, protocol: 'http:', host: '127.0.0.1:' + PORT, hostname: '127.0.0.1', port: String(PORT), pathname: '/', search: SEARCH, hash: '',
    reload() { log('page reload requested: this runner ends and the server starts a fresh one'); setTimeout(() => process.exit(0), 200); }, replace() {}, assign() {} },
  history: { replaceState() {}, pushState() {}, back() {}, state: null },
  navigator: { userAgent: 'Mozilla/5.0 (NIGRAAN engine)', language: 'en-GB', languages: ['en-GB'], onLine: true, hardwareConcurrency: 2, platform: 'engine', clipboard: stub('clipboard'), sendBeacon: () => true },
  screen: { width: 1500, height: 1000, availWidth: 1500, availHeight: 1000 }, devicePixelRatio: 1, innerWidth: 1500, innerHeight: 1000, outerWidth: 1500, outerHeight: 1000, scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0,
  localStorage: storage, sessionStorage: storage, indexedDB: undefined,
  matchMedia: () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }), getComputedStyle: () => stub('computedStyle'),
  MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } }, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  NodeFilter: { SHOW_ALL: 0xFFFFFFFF, SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
  Image: class { constructor() { return stub('img'); } }, HTMLElement: class {}, HTMLCanvasElement: class {}, Element: class {}, Node: class {}, SVGElement: class {},
  DOMParser: class { parseFromString() { return document; } }, XMLSerializer: class { serializeToString() { return ''; } },
  alert() {}, confirm() { return false; }, prompt() { return null; }, open() { return null; }, print() {}, scrollTo() {}, focus() {}, blur() {}, postMessage() {},
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); }, removeEventListener() {}, dispatchEvent: () => true,
};
/* timers: each callback runs inside the context with a time limit; one that overruns is stopped, logged, and (an interval) cancelled */
const T = {}; let tid = 0;
function run(id, args, handle) { const f = T[id]; if (!f) return; ctx.__A = args || []; ctx.__F = f;
  try { if (typeof f === 'function') vm.runInContext('__F.apply(null, __A)', ctx, { timeout: CB_LIMIT_MS }); else vm.runInContext(String(f), ctx, { timeout: CB_LIMIT_MS }); }
  catch (e) { const m = String(e && e.message || e); if (/timed out/.test(m)) { log('timer stopped after ' + CB_LIMIT_MS + ' ms:', String(f).slice(0, 160)); if (handle) { clearInterval(handle); delete T[id]; } } else log('timer error:', m.slice(0, 200)); }
  if (!handle) { delete T[id]; delete T['h' + id]; } }
ctx.setTimeout = (f, ms, ...a) => { const id = ++tid; T[id] = f; T['h' + id] = setTimeout(() => run(id, a, null), Math.max(0, Number(ms) || 0)); return id; };
ctx.clearTimeout = (id) => { if (T['h' + id]) clearTimeout(T['h' + id]); delete T[id]; delete T['h' + id]; };
ctx.setInterval = (f, ms, ...a) => { const id = ++tid; T[id] = f; const h = setInterval(() => run(id, a, h), Math.max(50, Number(ms) || 0)); T['h' + id] = h; return id; };
ctx.clearInterval = (id) => { if (T['h' + id]) clearInterval(T['h' + id]); delete T[id]; delete T['h' + id]; };
ctx.requestAnimationFrame = (f) => ctx.setTimeout(() => f(perf.now()), 16); ctx.cancelAnimationFrame = ctx.clearTimeout;
ctx.requestIdleCallback = (f) => ctx.setTimeout(() => f({ timeRemaining: () => 10, didTimeout: false }), 5); ctx.cancelIdleCallback = ctx.clearTimeout;
ctx.document = document; ctx.window = ctx; ctx.self = ctx; ctx.top = ctx; ctx.parent = ctx; ctx.globalThis = ctx; ctx.frames = ctx;
vm.createContext(ctx);

const t0 = Date.now(); let ran = 0; const failed = [];
for (let i = 0; i < blocks.length; i++) {
  try { vm.runInContext(blocks[i].code, ctx, { filename: 'page-block-' + i + '.js', timeout: CB_LIMIT_MS }); ran++; }
  catch (e) { failed.push(i + ' (' + ((blocks[i].attrs.match(/id="([^"]+)"/) || [])[1] || 'no id') + '): ' + String(e && e.message || e).slice(0, 140)); }
}
const fire = (ev) => { ctx.__L = listeners[ev] || []; for (let i = 0; i < ctx.__L.length; i++) { try { vm.runInContext('__L[' + i + ']({ type: "' + ev + '" })', ctx, { timeout: CB_LIMIT_MS }); } catch (e) { log(ev + ' handler:', String(e && e.message || e).slice(0, 160)); } } };
docOver.readyState = 'interactive'; fire('DOMContentLoaded'); docOver.readyState = 'complete'; fire('load');
log('engine page started: ' + ran + ' of ' + blocks.length + ' scripts in ' + (Date.now() - t0) + ' ms' + (failed.length ? '; scripts that stopped (display only): ' + failed.join(' | ') : ''));
process.on('uncaughtException', (e) => { log('uncaught:', String(e && e.stack || e).slice(0, 300)); });
process.on('unhandledRejection', (e) => { log('unhandled rejection:', String(e && e.message || e).slice(0, 200)); });
export { ctx, vm };
