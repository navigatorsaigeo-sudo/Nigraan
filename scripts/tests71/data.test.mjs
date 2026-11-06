#!/usr/bin/env node
/* v91.17.71 · DATA USE vs NAMING (agent D). What the customer sees on the DEFAULT path now that the station, lake-inventory
   and river-limit data is used again (refmode.stationData()) and its suppliers are credited generically:
     1  gates split: IDF served on stationData(), the calibration texts true and generic, the casebook/report credits generic
     2  engineering readiness at a unit: rows unblocked where the data is held, the rest with their reason
     3  Sources: MACH first, ONE generic partner entry, no named entry, the open datasets
     4  AI: body.model is ignored unless loopback + x-agn-qa (the A/B bench hook); Gemma gets no Qwen kwargs; 12B is not small
     5  partner stations' raw readings and station-measured figures stay out of customer routes
   The test reads the server's mode from /api/sources (stationData) and checks the open-only path
   (NIGRAAN_STATION_DATA=0) when the server runs that way.

   node scripts/tests71/data.test.mjs [baseUrl] [--no-paid]      (default http://127.0.0.1:8787)
   --no-paid skips the two checks that spend provider calls (limits evaluate, case document). */
import { readFileSync, existsSync } from 'node:fs';
import { viaBundle } from '../lib/retired.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8787').replace(/\/$/, '');
const PAID = !args.includes('--no-paid');
const SL = JSON.parse(readFileSync(join(ROOT, 'data', 'source-labels.json'), 'utf8'));
const LBL = SL.labels || {};
const NAMES = new RegExp('(?<![\\p{L}\\p{N}_])(' + (SL.forbiddenInCustomerOutput || []).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\p{N}_])', 'iu');

let fails = 0, passes = 0;
const check = (name, ok, detail) => { if (ok) { passes++; console.log('PASS ' + name); } else { fails++; console.log('FAIL ' + name + (detail ? ' · ' + String(detail).slice(0, 400) : '')); } };
const INFO = (m) => console.log('INFO ' + m);
async function req(method, p, body, headers = {}, timeoutMs = 120000) {
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), timeoutMs);
  try { const r = await fetch(BASE + p, { method, signal: ac.signal, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, text: t, json: j }; }
  catch (e) { return { status: 0, text: '', json: null, error: e.message }; } finally { clearTimeout(tm); }
}
const get = (p, h) => req('GET', p, null, h);
const getB = viaBundle(get);   /* v91.17.283.19: the retired place routes read the place bundle's part (scripts/lib/retired.mjs) */
const GB = { lat: 35.92, lon: 74.31 }, PLAINS = { lat: 31.55, lon: 74.34 };

async function main() {
  const H = await get('/api/health'); if (H.status !== 200) { check('server reachable at ' + BASE, false, H.error || H.status); return done(); }
  const S = await get('/api/sources'); const SD = !!(S.json && S.json.stationData === true);
  const FS = await get('/api/flood/status');
  if (FS.json && FS.json.internalRef === true) { check('server runs the customer path (no NIGRAAN_INTERNAL_REF)', false, 'restart without NIGRAAN_INTERNAL_REF=1'); return done(); }
  INFO('base ' + BASE + ' · mode: ' + (SD ? 'station data ON (default)' : 'station data OFF (NIGRAAN_STATION_DATA=0)'));

  /* ── 3 · Sources ─────────────────────────────────────────────────────────── */
  { const j = S.json || {}; const E = j.entries || []; const ids = E.map((e) => e.id);
    check('sources · MACH first, then the weather feed', ids[0] === 'mach' && ids[1] === 'weather_feed', ids.slice(0, 4).join(','));
    check('sources · no named internal entry on the customer page', !E.some((e) => e.internalOnly) && !NAMES.test(S.text), E.filter((e) => e.internalOnly).map((e) => e.id).join(','));
    check('sources · the open datasets are listed (>= 10, each with a licence)', E.filter((e) => !['mach', 'partner_networks'].includes(e.id) && e.licence).length >= 10, String(E.length));
    const pe = E.find((e) => e.id === 'partner_networks');
    if (SD) {
      check('sources · ONE generic partner entry built from label(network) and label(sourcesLine)', E.filter((e) => e.id === 'partner_networks').length === 1 && pe.dataset === LBL.network && pe.attribution === LBL.sourcesLine, JSON.stringify(pe));
      check('sources · the statement and the methods line credit the partner networks generically', (j.statement || '').includes(LBL.network) && (j.methodsLine || '').includes(LBL.network));
    } else check('sources · open-only path: no partner entry', !pe);
  }

  /* ── 1 · IDF on stationData() ────────────────────────────────────────────── */
  { const r = await get('/api/idf'); const j = r.json || {};
    if (SD) {
      check('idf · served on the default path (published, with its generic source)', r.status === 200 && j.published === true && j.source === LBL.mountainNetwork, JSON.stringify(j).slice(0, 200));
      check('idf · no supplier name and no per-gauge verification figure in the customer answer', !NAMES.test(r.text) && !/model\/obs|Arandu_|trust screen passes/.test(r.text), r.text.slice(0, 300));
      check('idf · a withheld table says why (rule) or carries fitted stations', (j.withheld === true && /complete annual maxima/.test(j.why || '')) || Object.keys(j.stations || {}).length > 0, j.why);
    } else check('idf · open-only path: not published', j.published === false && !j.stations?.length);
  }

  /* ── 2 · engineering readiness ───────────────────────────────────────────── */
  for (const P of [GB, PLAINS]) {
    const r = await getB(`/api/climatology/baseline?lat=${P.lat}&lon=${P.lon}`); const j = r.json || {}; const E = j.engineering || {}; const R = E.rows || {};
    const at = P === GB ? 'Gilgit' : 'Lahore';
    check(`engineering (${at}) · the readiness block covers all six rows`, ['Extreme rainfall / IDF', 'Extreme temperature', 'Basic wind speed', 'Flood design level', 'Heat stress design', 'Future climate factor'].every((k) => R[k] && /^(Blocked|Partial|Available)$/.test(R[k].status)), Object.keys(R).join(','));
    check(`engineering (${at}) · extreme temperature is unblocked with the unit's design percentiles`, R['Extreme temperature'] && R['Extreme temperature'].status === 'Partial' && /90th-percentile daily maximum -?\d/.test(R['Extreme temperature'].context || '') && /10th-percentile minimum -?\d/.test(R['Extreme temperature'].context || ''), JSON.stringify(R['Extreme temperature']));
    check(`engineering (${at}) · rows without data stay blocked with a reason (wind, flood design level)`, ['Basic wind speed', 'Flood design level'].every((k) => R[k] && R[k].status === 'Blocked' && (R[k].gate || '').length > 30));
    check(`engineering (${at}) · IDF row agrees with /api/idf and names no supplier`, R['Extreme rainfall / IDF'] && !NAMES.test(JSON.stringify(E)) && (R['Extreme rainfall / IDF'].status === 'Blocked' ? /WITHHELD|off|not bundled/.test(R['Extreme rainfall / IDF'].gate || '') : true), JSON.stringify(R['Extreme rainfall / IDF']));
    check(`engineering (${at}) · "indicative, not engineering design values" is stated`, /indicative, not engineering design values/.test(E.note || ''));
    const src = (j.t95Basis && j.t95Basis.source) || '';
    check(`engineering (${at}) · the baseline says "calibration" only when the station shift was applied`, j.stationCalibrated === true ? /station calibration/.test(src) && j.t95Basis.tier === 'B' : !/station|calibration/i.test(src), src + ' · ' + j.stationCalibrated);
  }

  /* ── 5 · partner raw readings and station-measured figures stay out ──────── */
  { const t = await get('/api/obs/bias/table'); check('raw · the per-station bias table is not served to customers', !(t.json && Array.isArray(t.json.stations)), t.text.slice(0, 120));
    const s = await get('/api/obs/bias'); check('raw · bias status carries no station error figures and no named source', s.json && !('nationalTmaxMaeC' in s.json) && !NAMES.test(s.text) && !/GSOD|NOAA/.test(s.text), s.text.slice(0, 200));
    const p = await get(`/api/obs/bias/point?lat=${GB.lat}&lon=${GB.lon}`); const pj = p.json || {};
    check('raw · a point bias is served as a correction (tier B) without the per-station breakdown', SD ? (pj.ok === true && pj.tier === 'B' && !pj.usedStations && !pj.nearestStation) : (pj.ok === false), p.text.slice(0, 200));
    const w = await get('/api/verification/wet-hours'); check('raw · the rain-gauge verification record is internal', w.json && w.json.internal === true && !w.json.gauges, w.text.slice(0, 120));
    const sk = await get('/api/skill'); const sj = sk.json || {};
    check('raw · /api/skill is the customer methods sheet (no station figures)', Array.isArray(sj.parameters) && sj.parameters.every((e) => Object.keys(e).every((k) => ['id', 'label', 'measurand', 'domain'].includes(k))) && !NAMES.test(sk.text), Object.keys((sj.parameters || [])[0] || {}).join(','));
    const fn = await get('/api/flood/national'); const rows = (fn.json && fn.json.rows) || [];
    check('flood · customer rows carry the rarity class (or the reason none is given), no model m³/s or return levels (v70 kept)', rows.length > 0 && rows.every((r) => !('q' in r) && !('levels' in r) && (r.class || r.classWhy)), JSON.stringify(rows[0] || {}).slice(0, 200));
    check('flood · status says station data is used and the names are not', FS.json && FS.json.internalRef === false && FS.json.stationData === SD, JSON.stringify({ i: FS.json && FS.json.internalRef, s: FS.json && FS.json.stationData }));
    const rc = await get('/api/report/context?unit=Gilgit'); const rj = rc.json || {};
    check('report · no mountain-network notes, no skill sheet, a tier on the forecast basis, generic sources line', rc.status === 200 && !rj.metNotes && !rj.skillSheet && rj.skill && /^[ABC]$/.test(rj.skill.tier) && (SD ? (rj.sources && rj.sources.line.includes(LBL.network)) : true) && !NAMES.test(rc.text), JSON.stringify(rj.skill || {}).slice(0, 200));
    check('report · a tier B/C basis never says MACH-verified', !(rj.skill && rj.skill.tier !== 'A' && /MACH[\s-]*verified/i.test(JSON.stringify(rj.skill))));
  }

  /* ── 4 · AI: the A/B hook (server) ───────────────────────────────────────── */
  { const a = await req('POST', '/api/ai/chat', { prompt: 'temperature in Gilgit tomorrow', model: 'agn-test-model:99b' });
    check('ai · body.model is ignored without the QA header', a.status === 200 && a.json && a.json.model !== 'agn-test-model:99b' && !a.json.abModel, JSON.stringify(a.json || {}).slice(0, 160));
    const b = await req('POST', '/api/ai/chat', { prompt: 'temperature in Gilgit tomorrow', model: 'agn-test-model:99b' }, { 'x-agn-qa': 'not-the-secret' });
    check('ai · body.model is ignored with a wrong QA token', b.status === 200 && b.json && b.json.model !== 'agn-test-model:99b' && !b.json.abModel, JSON.stringify(b.json || {}).slice(0, 160));
    const ev = await get('/api/ai/evidence?prompt=' + encodeURIComponent('glacial lake outburst risk in Hunza') + '&compact=0');
    check('ai · the facts pack names no supplier and carries no mountain-network notes', ev.status === 200 && !NAMES.test(ev.text) && !/stationLakeNotes/.test(ev.text), (ev.text.match(NAMES) || [''])[0]);
  }
  /* ── 4 · AI: the A/B hook and the model flags (in-process, stub OpenAI-compatible model) ── */
  { const r = spawnSync(process.execPath, ['--input-type=module', '-e', STUB], { env: { ...process.env, AI_MJS: pathToFileURL(join(ROOT, 'server', 'api', 'ai.mjs')).href, DATA_DIR: join(ROOT, 'data') }, encoding: 'utf8', timeout: 60000 });
    let o = null; try { o = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (_) {}
    if (!o) check('ai (stub) · ran', false, (r.stderr || r.stdout || '').slice(0, 300));
    else {
      check('ai (stub) · without ctx.qa the configured model answers', o.a === 'stub-a:1.7b' && !o.aAB, JSON.stringify(o));
      check('ai (stub) · with ctx.qa body.model is honoured and flagged abModel', o.b === 'gemma3:12b' && o.bAB === true, JSON.stringify(o));
      check('ai (stub) · Gemma gets no Qwen/gpt-oss kwargs; qwen3 gets its thinking switch', o.seen[1] && o.seen[1].kw == null && o.seen[1].re == null && o.seen[2] && o.seen[2].kw && 'enable_thinking' in o.seen[2].kw, JSON.stringify(o.seen));
      check('ai (stub) · a 12B model is not treated as small; a 1.7B model is', o.seen[0].small === true && o.seen[1].small === false, JSON.stringify(o.seen.map((x) => x.small)));
    }
  }

  /* ── 1 · limits and casebook texts (in-process: no provider call) ────────── */
  { const r = spawnSync(process.execPath, ['--input-type=module', '-e', LIMITS], { env: { ...process.env, LIM_MJS: pathToFileURL(join(ROOT, 'server', 'api', 'limits.mjs')).href, DATA_DIR: join(ROOT, 'data'), NIGRAAN_STATION_DATA: SD ? '' : '0' }, encoding: 'utf8', timeout: 60000 });
    let o = null; try { o = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (_) {}
    if (!o) check('limits (in-process) · ran', false, (r.stderr || r.stdout || '').slice(0, 300));
    else {
      const t = o.tmaxPlains.text || '';
      check('limits · daily-maximum confidence names no supplier and no station-measured error', !NAMES.test(JSON.stringify(o)) && !/station-corrected daily maximum: error/.test(t), t);
      /* v91.17.283.24 · self-audit H13 · 0-72 h read the SERVED forecast (its own station calibration and national model); the second daily-extreme
         calibration of the named IFS run (tier B) is gone, so no tier is claimed on either path */
      check('limits · the daily maximum is the served forecast at the place, no second tier B calibration; station calibration named only on the default path', /from the served forecast at the place/.test(t) && !/tier B/.test(t) && o.tmaxPlains.tier == null && (SD ? /station calibration/.test(t) : !/station calibration/.test(t)), t);
    }
  }
  if (PAID) {
    const ev = await req('POST', '/api/limits/evaluate', { assets: [{ id: 'd71-chitral', name: 'D71 test asset', lat: 35.85, lon: 71.79, limits: [{ variable: 'temperature_2m_max', limit: 45, dir: 'above' }] }] }, {}, 240000);
    const A = ev.json && ev.json.assets && ev.json.assets[0];
    if (!A || !A.ok) INFO('limits evaluate not answered (' + (ev.status || ev.error) + '): skipped'); else {
      check('limits evaluate · no supplier name, no "suparco" key on the physical GLOF lakes', !NAMES.test(ev.text), (ev.text.match(NAMES) || [''])[0]);
      const dh = A.physical && A.physical.dryHeat; check('limits evaluate · the dry-heat measure is the served day maximum (v283.24 H13: no second calibration, no raw run)', !dh || /served forecast/.test(dh.measure), JSON.stringify(dh || {}).slice(0, 200));
    }
    const proj = { manifest: { project_id: '_test-d71-names',   /* v283.44: the operator test namespace (never on the customer list), set aside below */ project_schema_version: 3, client_name: 'D71 test' }, assets: [{ asset_id: 'gb1', name: 'Gilgit test', latitude: GB.lat, longitude: GB.lon }] };
    const pu = await req('PUT', '/api/case/project', proj);
    if (pu.status !== 200) INFO('case project not stored (' + pu.status + '): case checks skipped'); else {
      const d = await get('/api/case/document?project=_test-d71-names&asset=gb1'); const C = (d.json && d.json.riskCards) || [];
      const hs = C.find((c) => c.id === 'hotSeason'), gl = C.find((c) => c.id === 'glof'), sv = C.find((c) => c.id === 'served24');
      check('case · risk cards name no supplier, carry no verdict, link the sources', C.length >= 5 && !NAMES.test(d.text) && C.every((c) => !('validated' in c) && (c.drill || []).includes('sources: /api/sources')), (d.text.match(NAMES) || [''])[0]);
      check('case · the hot-season card says station calibration only when the shift was applied', hs && ((d.json.chain.hazard.climatology || {}).stationCalibrated ? /station calibration/.test(hs.source) : !/station|PMD/.test(hs.source)), hs && hs.source);
      check('case · the GLOF card credits the register it reads generically', gl && (/Hi-MAG/.test(gl.source) || gl.source.startsWith(LBL.lakeInventory)), gl && gl.source);
      check('case · the served-weather card states the calibration truthfully', sv && (SD ? /station calibration/.test(sv.method) : /no station-fitted correction/.test(sv.method)), sv && sv.method);
    }
    await req('POST', '/api/ops/case/set-aside', { ids: ['_test-d71-names'], why: 'tests71' }).catch(() => {});   /* v283.44: moved off the server's project store */
  } else INFO('--no-paid: limits evaluate and case document skipped');
  return done();
}
function done() { console.log(`\n${passes} PASS, ${fails} FAIL`); process.exit(fails ? 1 : 0); }

/* a stub OpenAI-compatible model server; ai.mjs pointed at it through the env, called in-process */
const STUB = `
import http from 'node:http';
const seen = [];
const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
  if (req.url.endsWith('/models')) { res.end(JSON.stringify({ data: [{ id: 'stub-a:1.7b' }, { id: 'gemma3:12b' }, { id: 'qwen3:8b' }] })); return; }
  const j = JSON.parse(b || '{}'); const sys = ((j.messages || [])[0] || {}).content || '';
  seen.push({ model: j.model, kw: j.chat_template_kwargs || null, re: j.reasoning_effort || null, small: /You are a small model/.test(sys) });
  res.end(JSON.stringify({ choices: [{ message: { content: 'It is warm. Based on: forecast' }, finish_reason: 'stop' }], usage: {} })); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
Object.assign(process.env, { NIGRAAN_AI_KEY: 'ollama', NIGRAAN_AI_PROVIDER: 'ollama', NIGRAAN_AI_BASE: 'http://127.0.0.1:' + srv.address().port + '/v1', NIGRAAN_AI_MODEL: 'stub-a:1.7b', NIGRAAN_DATA_DIR: process.env.DATA_DIR });
const { createAI } = await import(process.env.AI_MJS);
const rows = { runs: [], records: [], unitSkill: [], aiCalls: [] };
const app = { dataDir: process.env.DATA_DIR, units: { tehsil: [], district: [] }, store: { all: (c) => rows[c] || [], filter: (c, f) => (rows[c] || []).filter(f), find: (c, f) => (rows[c] || []).find(f), insert: async (c, x) => { (rows[c] = rows[c] || []).push(x); } }, verification: { grades: () => ({ summary: null }) } };
const ai = createAI(app, '/nonexistent-root');
const a = await ai.chat({ prompt: 'why is it warm', model: 'gemma3:12b' }, { qa: false });
const b = await ai.chat({ prompt: 'why is it warm', model: 'gemma3:12b' }, { qa: true });
const c = await ai.chat({ prompt: 'why is it warm', model: 'qwen3:8b' }, { qa: true });
console.log(JSON.stringify({ a: a.json.model, aAB: !!a.json.abModel, b: b.json.model, bAB: !!b.json.abModel, c: c.json.model, seen }));
srv.close(); process.exit(0);`;
/* limits.confidenceFor in-process, with the data directory's skill entry for the MACH fleet check */
const LIMITS = `
Object.assign(process.env, { NIGRAAN_DATA_DIR: process.env.DATA_DIR });
const { createLimits } = await import(process.env.LIM_MJS);
const fs = await import('node:fs'); const path = await import('node:path');
let F = null; try { const f = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'fleet-history-skill.json'), 'utf8')); F = f; } catch (_) {}
const app = { dataDir: process.env.DATA_DIR, provider: {}, skill: { parameter: (id) => id === 'fleet_history_verification' ? { result: { maeC: 1.8, trusted: 40, stations: 41, hours: 100000, nightBiasC: -0.5 } } : null } };
const L = createLimits(app);
const out = { tmaxPlains: L.confidenceFor('temperature_2m_max', 200), tmaxMountain: L.confidenceFor('temperature_2m_max', 2500), tminPlains: L.confidenceFor('temperature_2m_min', 200), wb: L.confidenceFor('wet_bulb_temperature_2m', 200) };
console.log(JSON.stringify(out));`;

main().catch((e) => { console.log('FAIL test crashed: ' + e.stack); process.exit(1); });
