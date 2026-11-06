/* v91.17.283 · WS8 · THE ENGINE HOST, shared. The Node.js host that server/engine/vmpage.mjs builds around the page scripts (a document
   that holds no layout, real JSON data blocks, timers with a time limit, fetch to this server), lifted unchanged into a factory so the
   science modules (server/science/loader.mjs) and the identity test run in exactly the host the page-extracted engine runs in.
   Generated from server/engine/vmpage.mjs lines 37-128; only these are parameters: the code blocks, the JSON data blocks, fetch,
   the reload action and the log. Nothing here decides a level. */
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncXhrClass } from '../engine/serverfiles.mjs';
import { performance as perf } from 'node:perf_hooks';
import { webcrypto } from 'node:crypto';

export function createHost(opts) {
const PORT = Number(opts.port || 8787), ORIGIN = 'http://127.0.0.1:' + PORT;
const CB_LIMIT_MS = Number(opts.cbLimitMs || 600000);
const log = opts.log || (() => {});
const blocks = opts.blocks;               /* [{ attrs, code, file? }] in run order */
const jsonEls = opts.json;                /* Map id -> text */
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
  fetch: opts.fetch || ((u, o = {}) => { const url = new URL(String(u && u.url ? u.url : u), HREF); const h = Object.assign({}, o.headers || {}); h['x-agn-internal'] = 'engine'; if (process.env.NIGRAAN_INTERNAL_TOKEN && url.origin === new URL(HREF).origin) h['x-agn-internal-token'] = process.env.NIGRAAN_INTERNAL_TOKEN; /* v91.17.283 · INTEG (WS1 request): the runtime token, to this server only */ return fetch(url, { ...o, headers: h }); }),
  crypto: webcrypto, XMLHttpRequest: syncXhrClass(opts.dataDir || process.env.NIGRAAN_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data')),   /* v91.17.283.12 */
  performance: { now: () => perf.now(), timeOrigin: perf.timeOrigin, mark() {}, measure() {}, getEntriesByType: (t) => (t === 'navigation' ? [{ name: HREF, type: 'navigate' }] : []), getEntriesByName: () => [] },
  location: { href: HREF, origin: ORIGIN, protocol: 'http:', host: '127.0.0.1:' + PORT, hostname: '127.0.0.1', port: String(PORT), pathname: '/', search: SEARCH, hash: '',
    reload() { (opts.onReload || (() => { log('page reload requested: this runner ends and the server starts a fresh one'); setTimeout(() => process.exit(0), 200); }))(); }, replace() {}, assign() {} },
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
if (opts.prelude) opts.prelude(ctx);
vm.createContext(ctx);
if (opts.preludeCode) vm.runInContext(opts.preludeCode, ctx, { filename: 'prelude.js' });

function boot() {
const t0 = Date.now(); let ran = 0; const failed = [];
for (let i = 0; i < blocks.length; i++) {
  try { vm.runInContext(blocks[i].code, ctx, { filename: blocks[i].file || ('page-block-' + i + '.js'), timeout: CB_LIMIT_MS }); ran++; }
  catch (e) { failed.push(i + ' (' + ((blocks[i].attrs.match(/id="([^"]+)"/) || [])[1] || 'no id') + '): ' + String(e && e.message || e).slice(0, 140)); }
}
const fire = (ev) => { ctx.__L = listeners[ev] || []; for (let i = 0; i < ctx.__L.length; i++) { try { vm.runInContext('__L[' + i + ']({ type: "' + ev + '" })', ctx, { timeout: CB_LIMIT_MS }); } catch (e) { log(ev + ' handler:', String(e && e.message || e).slice(0, 160)); } } };
docOver.readyState = 'interactive'; fire('DOMContentLoaded'); docOver.readyState = 'complete'; fire('load');
return { ran, of: blocks.length, ms: Date.now() - t0, failed };
}
return { ctx, vm, boot, listeners, docOver };
}
