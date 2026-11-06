import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.76 · O · operator mode, customer-screen hygiene, header, transfer compression.
     node scripts/tests76/operator.test.mjs [baseUrl]            default http://127.0.0.1:8787
     --no-browser   skip section C (Playwright)
   A · server: GET /api/operator/status says yes only to a loopback request with a loopback Host and no proxy header
       (X-Forwarded-For / Forwarded / X-Real-IP / CF-Connecting-IP / Via / X-Forwarded-Host each turn it to NO); the decision
       function itself, read out of server/server.mjs, refuses a non-loopback socket whatever Host and headers say; the
       first-load redirect keeps ?operator=; /api/source-labels serves the generic words; the artefact and API JSON are
       sent gzip/brotli when the client accepts them, identity otherwise, and the DECODED bytes are the file's bytes
       (sha256 = MANIFEST.json).
   B · artefact (static): no PMD / FFD / Flood Forecasting Division / Pakistan Meteorological / USGS / Akin Gump in the
       served source (whole words, never inside base64 or a colour), no "MAch", no HTML comment, the map library's licence
       comment kept, every inline script parses, every inline block is sealed in the CSP.
   C · page (Playwright, CSP enforced, 1440x900): customer view by default (no html.agn-operator, AGN.operator() false,
       backend pill / Full detail / Consoles / source strip hidden, no version in the tab title); on every tab no supplier
       name outside Sources, no version tag, no AGN.* identifier, no "MAch"; Evidence & Methods without the QA panels;
       header "Updated…" not truncated; AJ is a button with a menu (operator switch on loopback); Comfort brief shows
       "Brief copied"; ?operator=1 turns operator mode on (event fired, consoles and pill visible, Esc closes the backend
       console), ?operator=0 turns it off; zero CSP violations, zero page errors; bytes transferred for the page load.
   PASS/FAIL lines; exit 1 on any FAIL. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import zlib from 'node:zlib';
import http from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BASE = (process.argv.slice(2).find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787').replace(/\/$/, '');
const NO_BROWSER = process.argv.includes('--no-browser');
const PW = __T.playwrightUrl() || 'playwright';
const CHROME = process.env.PW_CHROME || __T.chromiumPath();
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 300) : '')); };
const U = new URL(BASE);

/* raw HTTP (no automatic decoding, full control of Host and headers) */
function raw(path, headers = {}, method = 'GET') {
  return new Promise((res, rej) => {
    const r = http.request({ host: U.hostname, port: U.port || 80, path, method, headers: { host: U.host, ...headers } }, (x) => {
      const b = []; x.on('data', d => b.push(d)); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: Buffer.concat(b) }));
    });
    r.on('error', rej); r.setTimeout(240000, () => r.destroy(new Error('timeout'))); r.end();
  });
}
const jsonOf = (r) => { try { return JSON.parse(r.body.toString('utf8')); } catch { return null; } };
const decode = (r) => { const e = r.headers['content-encoding']; return e === 'gzip' ? zlib.gunzipSync(r.body) : e === 'br' ? zlib.brotliDecompressSync(r.body) : r.body; };

/* ═══ A · server ═══ */
{
  const s0 = jsonOf(await raw('/api/operator/status'));
  ok(s0 && s0.operator === true, 'status · a loopback request from this machine may turn operator mode on', JSON.stringify(s0));
  for (const [h, v] of [['X-Forwarded-For', '127.0.0.1'], ['Forwarded', 'for=127.0.0.1'], ['X-Real-IP', '127.0.0.1'], ['CF-Connecting-IP', '127.0.0.1'], ['Via', '1.1 proxy'], ['X-Forwarded-Host', 'localhost']]) {
    const s = jsonOf(await raw('/api/operator/status', { [h]: v }));
    ok(s && s.operator === false, 'status · a relayed request (' + h + ') is refused even when it names loopback', JSON.stringify(s));
  }
  const cs = await raw('/api/operator/status', { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' });
  ok(cs.status === 403 && !(jsonOf(cs) || {}).operator, 'status · a cross-site request is refused', 'HTTP ' + cs.status);
  const bh = await raw('/api/operator/status', { host: 'nigraan.example.com' });
  ok(bh.status === 421 || (jsonOf(bh) || {}).operator === false, 'status · a non-loopback Host is refused', 'HTTP ' + bh.status);

  /* the decision function out of server/server.mjs, on fake sockets: a remote socket never passes, whatever it claims */
  const src = readFileSync(join(ROOT, 'server', 'server.mjs'), 'utf8');
  const a = src.indexOf('const LOOPBACK_ADDR'), b = src.indexOf('function operatorStatus');
  ok(a > 0 && b > a, 'status · the loopback decision is present in server/server.mjs');
  if (a > 0 && b > a) {
    const decide = new Function('process', src.slice(a, b) + '\nreturn operatorDecision;')({ env: {} });
    const decideOff = new Function('process', src.slice(a, b) + '\nreturn operatorDecision;')({ env: { NIGRAAN_OPERATOR: 'off' } });
    const R = (addr, host, extra = {}) => ({ socket: { remoteAddress: addr }, headers: { host, ...extra } });
    const cases = [
      ['192.0.2.10 socket, Host 127.0.0.1', R('192.0.2.10', '127.0.0.1:8787'), false],
      ['10.0.0.5 (IPv4-mapped) socket, Host localhost, X-Forwarded-For 127.0.0.1', R('::ffff:10.0.0.5', 'localhost:8787', { 'x-forwarded-for': '127.0.0.1' }), false],
      ['public IPv6 socket, Host [::1]', R('2001:db8::5', '[::1]:8787'), false],
      ['loopback socket, public Host (a tunnel)', R('127.0.0.1', 'nigraan.example.com'), false],
      ['loopback socket, CF-Connecting-IP (a tunnel)', R('127.0.0.1', 'localhost:8787', { 'cf-connecting-ip': '203.0.113.9' }), false],
      ['loopback socket, foreign Origin', R('127.0.0.1', '127.0.0.1:8787', { origin: 'https://evil.example' }), false],
      ['127.0.0.1 socket, Host 127.0.0.1', R('127.0.0.1', '127.0.0.1:8787'), true],
      ['::ffff:127.0.0.1 socket, Host localhost', R('::ffff:127.0.0.1', 'localhost:8787'), true],
      ['::1 socket, Host [::1]:8787', R('::1', '[::1]:8787'), true],
    ];
    for (const [n, req, want] of cases) { const d = decide(req); ok(d.operator === want, 'decision · ' + n + ' -> ' + want, d.basis); }
    ok(decideOff(R('127.0.0.1', '127.0.0.1:8787')).operator === false, 'decision · NIGRAAN_OPERATOR=off refuses even loopback');
  }
  const rd = await raw('/?operator=1');
  ok(rd.status === 302 && /[?&]operator=1(&|$)/.test(rd.headers.location || ''), 'redirect · the first-load redirect keeps ?operator=1', rd.headers.location);

  const sl = jsonOf(await raw('/api/source-labels'));
  ok(sl && sl.labels && sl.labels.globalEnsemble && sl.labels.forecastFeed === 'model forecast' && sl.screenRules && sl.screenRules.rules.length >= 20 && sl.provenance && sl.provenance.source,
    'labels · /api/source-labels serves the generic words, the screen rules and their provenance', sl && (sl.version + ' · ' + (sl.screenRules ? sl.screenRules.rules.length : 0) + ' rules'));

  /* compression: the transfer is encoded, the file is not */
  const man = JSON.parse(readFileSync(join(ROOT, 'artefact', 'MANIFEST.json'), 'utf8'));
  const key = Object.keys(man).find(k => /MACH\.html$/.test(k));
  const file = readFileSync(join(ROOT, 'artefact', key)), fsha = createHash('sha256').update(file).digest('hex');
  ok(fsha === man[key].sha256, 'manifest · artefact on disk matches MANIFEST.json', fsha.slice(0, 16));
  const id = await raw('/' + key, { 'accept-encoding': 'identity' });
  ok(id.status === 200 && !id.headers['content-encoding'] && id.body.length === file.length, 'transfer · identity when the client accepts no encoding', id.body.length + ' bytes');
  for (const enc of ['gzip', 'br']) {
    const r = await raw('/' + key, { 'accept-encoding': enc });
    const dec = r.headers['content-encoding'] === enc ? decode(r) : null;
    const dsha = dec ? createHash('sha256').update(dec).digest('hex') : '';
    ok(r.status === 200 && r.headers['content-encoding'] === enc && /Accept-Encoding/i.test(r.headers.vary || '') && dsha === man[key].sha256 && r.body.length < file.length * 0.4,
      'transfer · the artefact goes out ' + enc + ' and decodes to the manifest bytes', r.body.length + ' of ' + file.length + ' bytes (' + Math.round(100 * r.body.length / file.length) + '%) · decoded sha ' + dsha.slice(0, 16));
  }
  const et = (await raw('/' + key, { 'accept-encoding': 'gzip' })).headers.etag;
  const nm = await raw('/' + key, { 'accept-encoding': 'gzip', 'if-none-match': et });
  ok(nm.status === 304, 'transfer · revalidation of the encoded copy answers 304', 'etag ' + et);
  const ap = await raw('/api/sources', { 'accept-encoding': 'gzip', 'sec-fetch-site': 'same-origin' });
  const apI = await raw('/api/sources', { 'accept-encoding': 'identity', 'sec-fetch-site': 'same-origin' });
  const apJ = ap.headers['content-encoding'] === 'gzip' ? JSON.parse(zlib.gunzipSync(ap.body)) : null;
  const strip = (o) => { if (o) delete o.generatedAt; return JSON.stringify(o); };
  ok(ap.status === 200 && ap.headers['content-encoding'] === 'gzip' && apJ && strip(apJ) === strip(JSON.parse(apI.body)),
    'transfer · API JSON is gzip-encoded and decodes to the same document', ap.body.length + ' vs ' + apI.body.length + ' bytes');
  const hd = await raw('/' + key, { 'accept-encoding': 'gzip' }, 'HEAD');
  ok(hd.status === 200 && Number(hd.headers['content-length']) === file.length, 'transfer · HEAD reports the file length', hd.headers['content-length']);
}

/* ═══ B · the served source ═══ */
{
  const man = JSON.parse(readFileSync(join(ROOT, 'artefact', 'MANIFEST.json'), 'utf8'));
  const key = Object.keys(man).find(k => /MACH\.html$/.test(k));
  const art = readFileSync(join(ROOT, 'artefact', key), 'utf8');
  const G1 = '(?<![A-Za-z0-9+/=_#])', G2 = '(?![A-Za-z0-9+/=_])';
  const FORBID = new RegExp(G1 + '(?:PMD|USGS|FFD)' + G2 + '|Flood Forecasting Division|Pakistan Meteorological|Akin Gump', 'g');
  const hits = art.match(FORBID) || [];
  ok(hits.length === 0, 'source · no PMD / FFD / USGS / Flood Forecasting Division / Pakistan Meteorological / Akin Gump in the served page', hits.length ? [...new Set(hits)].join(', ') + ' · ' + hits.length : '0');
  const mach = art.match(/\bMAch\b/g) || [];
  ok(mach.length === 0, 'source · the brand is MACH, never "MAch"', mach.length);
  const cm = (art.match(/<!--[\s\S]*?-->/g) || []).length;
  ok(cm === 0, 'source · no HTML comments in the customer artefact', cm);
  ok(/@license|Copyright|\(c\)/i.test(art) && /Leaflet/.test(art), 'source · the map library licence comment is kept');
  const blocks = [...art.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  let n = 0; const bad = [];
  for (const m of blocks) {
    if (/\ssrc=/.test(m[1])) continue;
    const type = (m[1].match(/type=["']([^"']+)/) || [])[1] || 'text/javascript';
    if (!/javascript|module/.test(type)) continue;
    n++; try { new Script(m[2]); } catch (e) { bad.push(((m[1].match(/id="([^"]+)/) || [])[1] || 'block ' + n) + ': ' + e.message.slice(0, 60)); }
  }
  ok(bad.length === 0 && n > 150, 'source · every inline script parses', bad.length ? bad.slice(0, 3).join(' | ') : n + ' blocks');
  const csp = (art.match(/<meta content="([^"]*)" http-equiv="Content-Security-Policy"\/>/) || [])[1] || '';
  const hash = (t) => "'sha256-" + createHash('sha256').update(t, 'utf8').digest('base64') + "'";
  const all = [...art.matchAll(/(<(script|style)((?:(?!>)[^\n])*?)>)([\s\S]*?)(<\/\2>)/g)].filter(m => !(m[2] === 'script' && /\bsrc\s*=/.test(m[3])));
  const unsealed = all.filter(m => !csp.includes(hash(m[4])));
  ok(csp.length > 200 && unsealed.length === 0, 'source · every inline block is sealed in the CSP', all.length + ' blocks, ' + unsealed.length + ' unsealed');
  ok(/id="agn-operator-js"/.test(art) && /html:not\(\.agn-operator\) \.agn-op-only\{display:none!important\}/.test(art), 'source · the operator-mode fragment is in the build');
}

/* ═══ C · the page ═══ */
if (!NO_BROWSER) {
  const pw = await __T.playwright(); const chromium = pw.chromium || pw.default.chromium;
  const browser = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const SUPPLIER = /\b(?:ECMWF|GloFAS|WeatherNext|DeepMind|NOAA|DWD|KNMI|UK Met Office|Met Office|MET Norway|Météo-France|Meteo-France|ERA5|IMERG|NASA|USGS|GHS-POP|Akin Gump|Pakistan Meteorological|Flood Forecasting Division|ISD-Lite|GLOF-II|AEGIS|Open-Meteo)\b|met\.no\b|(?<![#\w])(?:PMD|FFD)(?!\w)/g;
  const VERSION = /\b[vV](?:8\d|9\d)(?:\.\d+){1,2}\b|decision-integrity/g;
  const CODEID = /\bAGN\.[A-Za-z_$][\w$.]*/g;
  const newPage = async (url, ctxOpts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...ctxOpts });
    try { await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }); } catch {}
    await ctx.addInitScript(() => {
      window.__agnCsp = []; window.__agnOpEvents = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__agnCsp.push(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sourceFile || '') + ':' + e.lineNumber));
      document.addEventListener('agn:operator', (e) => window.__agnOpEvents.push(e.detail && e.detail.operator));
    });
    const page = await ctx.newPage(); page.setDefaultTimeout(240000);
    const log = { err: [], csp: [], bytes: 0, reqs: 0, doc: null };
    page.on('pageerror', (e) => log.err.push(String(e).slice(0, 200)));
    page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) log.csp.push(m.text().slice(0, 200)); });
    page.on('requestfinished', async (r) => { try { const s = await r.sizes(); log.bytes += s.responseBodySize + s.responseHeadersSize; log.reqs++; if (r.resourceType() === 'document' && r.frame() === page.mainFrame()) { const rs = await r.response(); if (rs && rs.status() === 200) { log.doc = s.responseBodySize; log.docEnc = (await rs.allHeaders())['content-encoding'] || 'identity'; } } } catch {} });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
    return { ctx, page, log };
  };
  const visibleText = (page, exceptSources) => page.evaluate((ex) => {
    const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const p = n.parentElement; if (!p || !n.nodeValue.trim()) continue;
      if (p.closest('script,style,noscript,.leaflet-control-attribution')) continue;
      if (ex && p.closest('#agnSourcesView,[data-view="sources"],[data-sources]')) continue;
      if (p.checkVisibility && !p.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = p.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) continue;
      out.push(n.nodeValue);
    }
    document.querySelectorAll('[title]').forEach((e) => { if (!e.closest('#agnSourcesView,[data-view="sources"],[data-sources],.leaflet-control-attribution') && e.checkVisibility && e.checkVisibility()) out.push(e.getAttribute('title')); });
    return out.join('\n');
  }, exceptSources);
  const ctxOf = (t, re) => [...new Set((t.match(new RegExp('.{0,40}(?:' + re.source + ').{0,30}', 'g')) || []).map(s => s.replace(/\s+/g, ' ')))].slice(0, 4).join(' | ');

  /* C1 · customer view */
  {
    const { ctx, page, log } = await newPage(BASE + '/analyst');
    await page.waitForTimeout(35000);
    const st = await page.evaluate(() => {
      const vis = (id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
      const ft = document.getElementById('freshTxt'), av = document.getElementById('agnAccountBtn') || document.querySelector('header .avatar');
      return { cls: document.documentElement.classList.contains('agn-operator'), op: window.AGN && AGN.operator ? AGN.operator() : 'missing', eligible: window.AGN && AGN.operator && AGN.operator.eligible ? AGN.operator.eligible() : null,
        pill: vis('agnBackendPill'), toggle: vis('agnViewToggle'), consoles: vis('agnConsoleMenu'), strip: vis('agnProvStrip'), title: document.title,
        fresh: ft ? { sw: ft.scrollWidth, cw: ft.clientWidth, t: ft.textContent } : null,
        av: av ? { tag: av.tagName, pop: av.getAttribute('aria-haspopup'), exp: av.getAttribute('aria-expanded') } : null };
    });
    ok(st.cls === false && st.op === false, 'customer · operator mode is OFF by default on localhost', JSON.stringify({ cls: st.cls, op: st.op, eligible: st.eligible }));
    ok(st.pill === false && st.toggle === false && st.consoles === false && st.strip === false, 'customer · backend pill, Full detail, Consoles and the source strip are hidden (A-14, B-07, B-15, A-35, B-18)', JSON.stringify({ pill: st.pill, toggle: st.toggle, consoles: st.consoles, strip: st.strip }));
    ok(!VERSION.test(st.title) && /NIGRAAN/.test(st.title), 'customer · the tab title carries no version (A-36)', st.title); VERSION.lastIndex = 0;
    ok(st.fresh && st.fresh.sw <= st.fresh.cw + 1, 'header · "Updated…" is not truncated at 1440 px (A-37)', st.fresh && (st.fresh.sw + ' / ' + st.fresh.cw + ' px · ' + st.fresh.t));
    ok(st.av && st.av.tag === 'BUTTON' && st.av.pop === 'menu', 'header · the AJ avatar is a button with a menu (B-22)', JSON.stringify(st.av));
    /* account menu */
    await page.click('#agnAccountBtn'); await page.waitForTimeout(600);
    const menu = await page.evaluate(() => { const m = document.getElementById('agnAccountMenu'); return m && !m.hidden ? { text: m.innerText.replace(/\s+/g, ' '), focus: m.contains(document.activeElement), exp: document.getElementById('agnAccountBtn').getAttribute('aria-expanded') } : null; });
    ok(menu && /Operator mode/.test(menu.text) && menu.exp === 'true', 'header · the account menu opens and offers the operator switch on this machine', menu && menu.text);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const closed = await page.evaluate(() => ({ hidden: document.getElementById('agnAccountMenu').hidden, focus: document.activeElement && document.activeElement.id }));
    ok(closed.hidden && closed.focus === 'agnAccountBtn', 'header · Esc closes the account menu and focus returns to AJ', JSON.stringify(closed));
    /* comfort brief */
    /* v91.17.90 · since v80 (desktop UX-01) the Comfort brief button lives in 02 Forecast's toolbar, not the header: open that tab first */
    if (!(await page.isVisible('#exportBtn'))) { await page.evaluate(() => { const t = document.querySelector('#machNav [data-goto="livedata"]'); if (t) t.click(); }); await page.waitForTimeout(2500); }
    await page.click('#exportBtn', { timeout: 15000 }); await page.waitForTimeout(700);
    const t = await page.evaluate(() => { const e = document.getElementById('agnToast'); return e ? { text: e.textContent, show: e.classList.contains('agn-show') } : null; });
    ok(t && t.show && t.text === 'Brief copied', 'Forecast toolbar · Comfort brief confirms with a "Brief copied" toast (B-23)', JSON.stringify(t));
    /* every tab */
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#machNav button')].map((b, i) => ({ i, goto: b.dataset.goto || '', label: b.textContent.replace(/\s+/g, ' ').trim() })));
    const per = [];
    for (const tb of tabs) {
      await page.evaluate((i) => document.querySelectorAll('#machNav button')[i].click(), tb.i);
      await page.waitForTimeout(7000);
      if (tb.goto === 'airisk') {   /* the 09 sub-tabs (Predictions carried the river model's name on every card) */
        const subs = await page.evaluate(() => [...document.querySelectorAll('.view.active [role=tab]')].length);
        for (let k = 0; k < subs; k++) { await page.evaluate((k) => { const s = [...document.querySelectorAll('.view.active [role=tab]')][k]; if (s) s.click(); }, k); await page.waitForTimeout(3000);
          const tx = await visibleText(page, true); per.push({ tab: tb.label + ' / sub ' + (k + 1), sup: tx.match(SUPPLIER) || [], ver: tx.match(VERSION) || [], code: tx.match(CODEID) || [], mach: tx.match(/\bMAch\b/g) || [], tx }); }
        continue;
      }
      const tx = await visibleText(page, true);
      per.push({ tab: tb.label, sup: tx.match(SUPPLIER) || [], ver: tx.match(VERSION) || [], code: tx.match(CODEID) || [], mach: tx.match(/\bMAch\b/g) || [], tx });
      if (/Evidence|Methods & Verification/.test(tb.label)) {   /* v283.28: the tab is "Methods & Verification" */
        const ev = await page.evaluate(() => { const v = (id) => { const e = document.getElementById(id); return !!(e && e.getBoundingClientRect().height > 0); }; return { g50: v('agnG50Panel'), ready: v('agnProductReadiness'), j10: v('agnV91JourneyGate'), self: v('mlSelfTest'), unset: /UNSET|0\/89|PASS · 12\/12|External suite/.test(document.querySelector('.view.active').innerText) }; });
        ok(!ev.g50 && !ev.ready && !ev.j10 && !ev.self && !ev.unset, 'customer · Evidence & Methods shows no QA gates, readiness, contract counters or self-test (A-15, B-14)', JSON.stringify(ev));
      }
    }
    /* the Outlook dialog */
    const hasOutlook = await page.evaluate(() => { const b = document.getElementById('agnOutlookBtn'); if (b) { b.click(); return true; } return false; });
    if (hasOutlook) { await page.waitForTimeout(5000); const tx = await visibleText(page, true); per.push({ tab: 'Outlook dialog', sup: tx.match(SUPPLIER) || [], ver: tx.match(VERSION) || [], code: tx.match(CODEID) || [], mach: tx.match(/\bMAch\b/g) || [], tx }); await page.keyboard.press('Escape'); }
    for (const p of per) {
      ok(!p.sup.length, 'customer · ' + p.tab + ': no supplier name on screen (A-16, B-16)', p.sup.length ? p.sup.length + ' · ' + ctxOf(p.tx, SUPPLIER) : '0');
      ok(!p.ver.length && !p.code.length && !p.mach.length, 'customer · ' + p.tab + ': no version tag, code identifier or "MAch" (A-36, A-13, A-43, B-17)', (p.ver.length + p.code.length + p.mach.length) ? ctxOf(p.tx, new RegExp(VERSION.source + '|' + CODEID.source + '|\\bMAch\\b')) : '0');
    }
    const all = per.map(p => p.tx).join('\n');
    ok(!/MACH forecast|via MACH\b|MACH model/.test(all), 'brand · model output is never branded MACH (owner 24 Oct 2026: MACH names AGN\'s stations; "MACH forecast" only where the live station layer corrected a value, which the mock never does)', ctxOf(all, /MACH forecast|via MACH\b|MACH model/));
    ok(!log.err.length, 'customer · no page errors', log.err.slice(0, 3).join(' | '));
    const v = await page.evaluate(() => window.__agnCsp);
    ok(!v.length && !log.csp.length, 'customer · zero CSP violations with the CSP enforced', (v.concat(log.csp)).slice(0, 3).join(' | ') || '0');
    console.log('INFO transfer · page load (customer, ' + log.reqs + ' requests): ' + (log.bytes / 1048576).toFixed(2) + ' MB transferred; document ' + (log.doc != null ? (log.doc / 1048576).toFixed(2) + ' MB ' + log.docEnc : '?'));
    ok(log.doc != null && log.doc < 2.5 * 1048576, 'transfer · the page document is under 2.5 MB on the wire (B-25: was 7.09 MB)', log.doc);
    await ctx.close();
  }

  /* C2 · operator view on this machine, then off */
  {
    const { ctx, page, log } = await newPage(BASE + '/analyst?operator=1');
    await page.waitForTimeout(30000);
    const st = await page.evaluate(() => {
      const vis = (id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
      const cb = document.getElementById('agnConsoleMenuBtn'), ft = document.getElementById('freshTxt');
      return { cls: document.documentElement.classList.contains('agn-operator'), op: AGN.operator(), ev: window.__agnOpEvents, pill: vis('agnBackendPill'), consoles: vis('agnConsoleMenu'),
        cons: cb ? { sw: cb.scrollWidth, cw: cb.clientWidth } : null, fresh: ft ? { sw: ft.scrollWidth, cw: ft.clientWidth } : null, title: document.title, url: location.search };
    });
    ok(st.cls && st.op === true && st.ev.includes(true), 'operator · ?operator=1 on this machine turns operator mode on and fires agn:operator', JSON.stringify({ cls: st.cls, op: st.op, ev: st.ev, url: st.url }));
    ok(st.pill && st.consoles, 'operator · the backend pill and the Consoles menu are shown to the operator', JSON.stringify({ pill: st.pill, consoles: st.consoles }));
    ok(st.cons && st.cons.sw <= st.cons.cw + 1 && st.fresh && st.fresh.sw <= st.fresh.cw + 1, 'header · "Consoles" and "Updated…" are not truncated at 1440 px in operator view (A-37, B-15)', JSON.stringify({ cons: st.cons, fresh: st.fresh }));
    await page.click('#agnBackendPill'); await page.waitForTimeout(2500);
    const open = await page.evaluate(() => { const b = document.getElementById('agnIntegrationBack'); return !!(b && b.getBoundingClientRect().height > 0 && getComputedStyle(b).display !== 'none'); });
    await page.keyboard.press('Escape'); await page.waitForTimeout(800);
    const shut = await page.evaluate(() => { const b = document.getElementById('agnIntegrationBack'); return !(b && b.getBoundingClientRect().height > 0 && getComputedStyle(b).display !== 'none'); });
    ok(open && shut, 'operator · Esc closes the backend integration console (A-14, B-07)', JSON.stringify({ open, closedAfterEsc: shut }));
    const tx = await visibleText(page, false);
    ok(!/MACH forecast|via MACH\b/.test(tx) && !/\bMAch\b/.test(tx), 'operator · brand wording is the same for operators (model output by source, never "MAch")');
    ok(!log.err.length, 'operator · no page errors', log.err.slice(0, 3).join(' | '));
    await page.goto(BASE + '/analyst?operator=0', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(20000);
    const off = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('agn-operator'), op: AGN.operator(), ls: (() => { try { return localStorage.getItem('agn.operator.v1'); } catch { return 'x'; } })() }));
    ok(off.cls === false && off.op === false && off.ls == null, 'operator · ?operator=0 turns it off and forgets it', JSON.stringify(off));
    await ctx.close();
  }
  await browser.close();
}
console.log('\n' + passes + ' PASS, ' + fails + ' FAIL');
process.exit(fails ? 1 : 0);
