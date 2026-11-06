/* v91.17.283.12 · THE SERVER FILES THE PAGE READS AS IT LOADS (v283.13 hand-off 5): the formula register and the model gate are not
   embedded in the page; it reads them once, synchronously, from GET /api/registry/formula and /api/registry/gate. This module is the one
   map from those addresses to their files, used by the server route (server/api/index.mjs) and by the two engine hosts that run the page
   code without a network (server/engine/vmpage.mjs, server/science/host.mjs), which answer the page's synchronous request from the same
   files. */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const SERVER_FILES = { '/api/registry/formula': 'formula-registry.json', '/api/registry/gate': 'model-gate.slim.json' };
const memo = new Map();
export function serverFile(dataDir, path) {
  const f = SERVER_FILES[path]; if (!f) return null;
  const p = join(dataDir, f); let m = 0; try { m = statSync(p).mtimeMs; } catch (_) { return null; }
  const c = memo.get(p); if (c && c.m === m) return c.text;
  let text = null; try { text = readFileSync(p, 'utf8'); JSON.parse(text); } catch (_) { text = null; }
  memo.set(p, { m, text }); return text;
}
/* a synchronous XMLHttpRequest for an engine host: GET of a server file only (anything else answers 404) */
export function syncXhrClass(dataDir) {
  return class XMLHttpRequest {
    constructor() { this.readyState = 0; this.status = 0; this.responseText = ''; this._u = null; }
    open(method, url) { this._m = String(method || 'GET').toUpperCase(); try { this._u = new URL(String(url), 'http://127.0.0.1').pathname; } catch (_) { this._u = null; } this.readyState = 1; }
    setRequestHeader() {}
    send() { const t = this._m === 'GET' && this._u ? serverFile(dataDir, this._u) : null; this.status = t == null ? 404 : 200; this.responseText = t == null ? '' : t; this.readyState = 4; if (typeof this.onload === 'function') try { this.onload(); } catch (_) {} }
    abort() {} getResponseHeader() { return null; } getAllResponseHeaders() { return ''; }
  };
}
