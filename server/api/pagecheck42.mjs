/* r42 · NIGRAAN 1.0.6 · THE PAGE ESSENTIAL OF THE WARM-UP (server.mjs warmEssentials). The 1.0.5 rule was "GET / answers 200 with more than
   1,000 bytes": right for the classic pages (0.7-7 MB), wrong for the React page, whose index.html is about 900 bytes (the 1 Nov 11:53 PKT
   deploy of 1.0.6 was refused for it: "essentials failed (page: GET / answered 200)"). Now:
     classic  GET / answers 200 with more than 1,000 bytes (the 1.0.5 rule, unchanged)
     React    a body of 1,000 bytes or less is accepted only when it is the React index (#root and a module script under
              /assets/ or /app/assets/): the module script must answer 200 with more than 1,000 bytes, and every other asset the
              index names must answer 200. The /app/ build also requires the map script and the boundary data.
     missing  the switch asks for React but artefact/app is not installed: the server serves the classic pages, so the classic rule judges
              them (the fallback is serving); the answer says so
   selfGet(path, ms) -> { status, body (Buffer), location, why } as server.mjs selfGet. */
export async function pageEssential(selfGet, ms, opts = {}) {
  let pg = await selfGet('/', ms);
  if (pg.status >= 300 && pg.status < 400 && pg.location) { let loc = pg.location; try { const u = new URL(loc, 'http://localhost'); loc = u.pathname + u.search; } catch (_) {} pg = await selfGet(loc, ms); }
  const R = opts.react || null, note = R && R.wanted && !R.built ? ' (React wanted but artefact/app is not installed: the classic pages serve)' : '';
  const len = pg.body ? pg.body.length : 0;
  if (pg.status !== 200 || !len) return { ok: false, why: 'GET / answered ' + (pg.status || pg.why || 'nothing') };
  if (len > 1000) return { ok: true, why: 'GET / answered 200, ' + len + ' bytes' + note, kind: 'classic' };
  const t = pg.body.toString('utf8');
  const tags = [...t.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
  const mod = tags.find((x) => /\btype\s*=\s*["']module["']/i.test(x) && /\bsrc\s*=\s*["']\/(?:app\/)?assets\/[^"']+\.js["']/i.test(x));
  if (!/id\s*=\s*["']root["']/.test(t) || !mod) return { ok: false, why: 'GET / answered 200 with ' + len + ' bytes and is not the React index (no #root or no /assets module script)' };
  const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(mod)[1];
  const js = await selfGet(src, ms);
  if (js.status !== 200 || !js.body || js.body.length <= 1000) return { ok: false, why: 'React page: ' + src + ' answered ' + (js.status || js.why || 'nothing') + (js.body ? ' (' + js.body.length + ' bytes)' : '') };
  const named = [...t.matchAll(/(?:src|href)\s*=\s*["'](\/(?:app\/)?assets\/[^"']+)["']/gi)].map((m) => m[1]).filter((p) => p !== src);
  const others = [...new Set(named)].concat(src.startsWith('/app/') ? ['/app/protomaps-leaflet.js', '/app/data/pk-bound.json'] : []);
  for (const p of others) { const r = await selfGet(p, ms); if (r.status !== 200 || !r.body || !r.body.length) return { ok: false, why: 'React page: ' + p + ' answered ' + (r.status || r.why || 'nothing') }; }
  return { ok: true, why: 'React page: index ' + len + ' bytes, ' + src + ' ' + js.body.length + ' bytes, ' + others.length + ' other files answer', kind: 'react' };
}
