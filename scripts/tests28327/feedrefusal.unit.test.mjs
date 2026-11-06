/* v91.17.283.27 . ITEM 8 · A SOURCE THAT REFUSES FOR MORE THAN 2 HOURS RAISES A FEED ALERT, offline (temp data folder):
     A1  refusalOf: HTTP 401 / 403 / 451 in any module wording ("http 403", "ogimet 403", "key rejected (401)", "HTTP 451 ...") and geo / bot
         block pages are refusals; a timeout, a parse error or a number that merely contains 403 is not
     A2  the server writes the feeds that had no health entry (Punjab EPD page, OpenAQ, synop, the Drive river sheet) from each module's
         own status() with its own schedule period (agents.mjs serverFeeds); an unconfigured feed says so
     A3  the 27 Oct case replayed: the EPD page answers "http 403" from 25 Oct; checks every 10 min: ok/not assessed before 2 h, DOWN after
         2 h (two checks agreeing), one alert naming the source and the status ("Punjab EPD air quality page: DOWN ... refuses: HTTP 403");
         a good poll recovers it ("recovered")
     A4  the 2 hours is extended by the feed's own poll period when that is longer (a 6-hourly feed: DOWN only after 6 h, i.e. a second
         refused poll); no number is typed per feed
     A5  synop's lastError is the last poll's error (it was never cleared, so an old refusal would read as current)
   usage: node scripts/tests28327/feedrefusal.unit.test.mjs */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 600) : '')); } };
const FH = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'feed_health.mjs')).href);
/* ── A1 ── */
{ const yes = ['http 403', 'ogimet 403', 'key rejected (401)', 'HTTP 451 for the Drive link', 'Attention Required! | Cloudflare', 'Access Denied'], no = ['fetch failed', 'The operation was aborted due to timeout', 'took 1403 ms', 'v4.03.1', 'http 500', null];
  ok(yes.every((t) => FH.refusalOf(t)) && no.every((t) => !FH.refusalOf(t)), 'A1 refusals are recognised by status or block page, nothing else', { yes: yes.map((t) => !!FH.refusalOf(t)), no: no.map((t) => !!FH.refusalOf(t)) });
  ok(FH.REFUSAL_PERSIST_MS === 2 * 3600e3, 'A1b the owner\'s 2 hours is the one number of the rule'); }
/* ── A2 ── */
{ process.env.NIGRAAN_AGENTS = '0'; const AG = await import(pathToFileURL(join(ROOT, 'server', 'api', 'agents.mjs')).href); const T = mkdtempSync(join(tmpdir(), 'fa27-'));
  const app = { scheduler: { list: () => ({ jobs: [{ id: 'epdaq', everyMin: 30 }, { id: 'synop', everyMin: 60 }, { id: 'driveFetch', everyMin: 60 }] }) },
    epd: { status: () => ({ on: true, lastPoll: null, lastError: 'http 403' }) }, openaq: { status: () => ({ on: true, keyPresent: false, lastPoll: null, lastError: null }) },
    synop: { status: () => ({ on: true, lastPoll: '2026-10-28T00:00:00Z', lastError: 'ogimet 403' }) }, driveFetch: { status: () => ({ configured: true, last: { at: '2026-10-28T01:00:00Z', error: null } }) } };
  const A = AG.createAgents(app, ROOT, T); const S = A.serverFeeds(); A.writeServerFeeds();
  ok(S.feeds.epd && S.feeds.epd.lastError === 'http 403' && S.feeds.epd.everyMs === 1800e3 && S.feeds.synop.everyMs === 3600e3 && S.feeds.drive.lastPoll === '2026-10-28T01:00:00Z', 'A2a each module\'s own status and schedule period are written', S.feeds);
  ok(S.feeds.openaq.configured === false && /no OpenAQ key/.test(S.feeds.openaq.why), 'A2b an unconfigured feed says so (not assessed, never a refusal)', S.feeds.openaq);
  ok(existsSync(join(T, 'agents', 'feed', 'server-feeds.json')), 'A2c the file the agent reads is written before the check');
  const src = readFileSync(join(ROOT, 'server', 'api', 'agents.mjs'), 'utf8'); ok(/async function runFeed\(\) \{\n[^\n]*\n    writeServerFeeds\(\);/.test(src), 'A2d runFeed writes it before every check');
  rmSync(T, { recursive: true, force: true }); }
/* ── A3 ── */
{ const T = mkdtempSync(join(tmpdir(), 'fb27-')); const D = join(T, 'data'); mkdirSync(join(D, 'agents', 'feed'), { recursive: true });
  const t0 = Date.parse('2026-10-25T06:00:00Z'); let lastPoll = new Date(t0 - 30 * 60e3).toISOString(), err = 'http 403';
  const write = (now) => writeFileSync(join(D, 'agents', 'feed', 'server-feeds.json'), JSON.stringify({ at: new Date(now).toISOString(), feeds: { epd: { label: 'Punjab EPD air quality page', configured: true, lastPoll, lastError: err, everyMs: 1800e3 } } }));
  const seq = []; let all = [];
  for (let k = 0; k <= 15; k++) { const now = t0 + k * 10 * 60e3; write(now); const r = FH.run({ app: T, dataDir: D, copiesDir: join(T, 'copies'), adminDir: null, now }); seq.push([k * 10, r.state.feeds.srv_epd.status]); all = all.concat(r.alerts.filter((a) => a.feed === 'srv_epd')); }
  ok(seq.filter(([m]) => m <= 120).every(([, s]) => s !== 'down') && seq.filter(([m]) => m > 120).every(([, s]) => s === 'down'), 'A3a DOWN only after 2 h of refusals', seq);
  ok(all.length === 1 && all[0].to === 'down' && /^Punjab EPD air quality page: DOWN/.test(all[0].text) && /refuses: HTTP 403/.test(all[0].text), 'A3b one alert, naming the source and the status', all.map((a) => a.text));
  const st = JSON.parse(readFileSync(join(D, 'agents', 'feed', 'state.json'), 'utf8')).feeds.srv_epd;
  ok(st.refusal && st.refusal.since === new Date(t0).toISOString() && st.refusal.status === 'HTTP 403', 'A3c the refusal keeps its first sighting across checks', st.refusal);
  err = null; lastPoll = new Date(t0 + 170 * 60e3).toISOString(); const rec = [];
  for (let k = 16; k <= 18; k++) { const now = t0 + k * 10 * 60e3; write(now); rec.push(...FH.run({ app: T, dataDir: D, copiesDir: join(T, 'copies'), adminDir: null, now }).alerts.filter((a) => a.feed === 'srv_epd')); }
  ok(rec.length === 1 && /recovered/.test(rec[0].text), 'A3d a good poll recovers it, with one "recovered" line', rec.map((a) => a.text));
  rmSync(T, { recursive: true, force: true }); }
/* ── A4 ── */
{ const now = Date.parse('2026-10-28T12:00:00Z'), f = { label: 'X', lastPoll: null, lastError: 'http 451', everyMs: 6 * 3600e3 };
  const at = (h) => FH.serverFeedStatus(f, { refusal: { status: 'HTTP 451', since: new Date(now - h * 3600e3).toISOString() } }, [], now);
  ok(at(3).status !== 'down' && at(6.1).status === 'down' && at(6.1).refusalLimitMin === 360, 'A4a a 6-hourly feed is DOWN only after its own period (a second refused poll), not after 2 h', [at(3).status, at(6.1).status]);
  const g = FH.serverFeedStatus({ ...f, everyMs: 1800e3 }, { refusal: { status: 'HTTP 451', since: new Date(now - 2.1 * 3600e3).toISOString() } }, [], now);
  ok(g.status === 'down' && g.refusalLimitMin === 120, 'A4b a 30-minute feed: DOWN after 2 h', g.refusalLimitMin);
  const h = FH.serverFeedStatus({ label: 'X', lastPoll: null, lastError: null }, { refusal: { status: 'HTTP 403', since: new Date(now - 3 * 3600e3).toISOString() } }, [], now);
  ok(h.status === 'down' && h.refusal, 'A4c after a restart (no poll yet, no error) the open refusal is kept, not cleared', h.refusal);
  const src = readFileSync(join(ROOT, 'scripts', 'agents', 'feed_health.mjs'), 'utf8'); ok(!/srv_epd[^\n]*\d+ \* 6e4|epd[^\n]*3600e3/.test(src), 'A4d no per-feed number is typed'); }
/* ── A5 ── */
{ const s = readFileSync(join(ROOT, 'server', 'api', 'synop.mjs'), 'utf8'); ok(/async function poll\(\) \{\n    if \(!on\(\)\) return;\n    state\.lastError = null;/.test(s), 'A5 synop clears lastError at the start of each poll'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
