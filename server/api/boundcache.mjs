/* ══ v91.17.283.51g3 · ONE BOUNDED ANSWER CACHE (past30.mjs, placeanswer.mjs) ═══════════════════════════════════════════════════════
   A Map of answers bounded three ways, so a run of new places can never grow the server's heap without limit (live 1.0.10.1: the
   shared 7 GB machine OOM-killed the server at 1.2-1.5 GB heap):
     ttlMs     an entry older than this is never served and is dropped on the next set() or sweep()
     maxBytes  the sum of the entries' sizes (UTF-8 length of their JSON, measured once at set()) stays at or below this; the oldest
               entries are dropped first; an entry larger than maxBytes on its own is not kept at all
     maxItems  a hard count limit beside the bytes
   Insertion order is age order (a re-set entry moves to the end). size() / bytes() for the tests and the status line. */
export function boundedCache({ ttlMs, maxBytes, maxItems = 1000 } = {}) {
  const M = new Map(); let total = 0;
  const drop = (k) => { const e = M.get(k); if (!e) return; total -= e.b; M.delete(k); };
  const sweep = (now = Date.now()) => { for (const [k, e] of M) { if (now - e.at >= ttlMs) drop(k); else break; } };
  return {
    get(k, now = Date.now()) { const e = M.get(k); if (!e) return undefined; if (now - e.at >= ttlMs) { drop(k); return undefined; } return e.v; },
    set(k, v, bytes = null) {
      let b = bytes; if (b == null) { try { b = Buffer.byteLength(JSON.stringify(v) || ''); } catch (_) { b = maxBytes + 1; } }
      drop(k); if (b > maxBytes) return false;
      const now = Date.now(); sweep(now);
      while (M.size && (total + b > maxBytes || M.size >= maxItems)) drop(M.keys().next().value);
      M.set(k, { at: now, v, b }); total += b; return true;
    },
    delete: drop, sweep, size: () => M.size, bytes: () => total, clear: () => { M.clear(); total = 0; },
  };
}
