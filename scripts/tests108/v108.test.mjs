import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.108 · one temperature chain for every product, the lead rule, cap counters, replay flag.
   node nigraan-local/scripts/tests108/v108.test.mjs  (server running) */
import { readFileSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const get = async (p, h = {}) => { const r = await fetch(BASE + p, { headers: h, signal: AbortSignal.timeout(180000) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t }; };
const px = (q) => get('/px/v1/forecast?__omhost=api.open-meteo.com&' + new URLSearchParams(q).toString());
const one = (j) => Array.isArray(j) ? j[0] : j;
const ZM = JSON.parse(readFileSync(ROOT + 'data/model-zone.json', 'utf8')).request.models;

/* 1 · a mountain point asked on best_match gets the same chain as the zone request (basis, station calibration, national) */
const P = { latitude: '35.297', longitude: '75.633', hourly: 'temperature_2m', forecast_days: '3', timezone: 'auto' };
const a = one((await px({ ...P, models: 'best_match' })).json), b = one((await px({ ...P, models: ZM })).json), raw = one((await px({ ...P, models: 'best_match', __raw: '1' })).json);
ok(a && b && JSON.stringify(a.hourly.temperature_2m) === JSON.stringify(b.hourly.temperature_2m), 'Skardu: best_match request = zone request, hour for hour');
ok(a.agn_temperature_basis && a.agn_temperature_basis.merged && /icon/.test(a.agn_temperature_basis.model) && a.agn_bias_correction && a.agn_bias_correction.applied, 'Skardu best_match carries the zone basis and the station calibration (' + (a.agn_temperature_basis && a.agn_temperature_basis.correction) + ')');
ok(JSON.stringify(a.hourly.temperature_2m) !== JSON.stringify(raw.hourly.temperature_2m), 'and it differs from the raw forecast');
/* plains point unchanged in kind */
const L = one((await px({ latitude: '31.52', longitude: '74.36', hourly: 'temperature_2m', forecast_days: '2', timezone: 'auto', models: 'best_match' })).json);
ok(L && L.agn_temperature_basis && L.agn_temperature_basis.zone === 'plains' && !/icon/.test(L.agn_temperature_basis.model || ''), 'Lahore (plains) keeps best_match');

/* 2 · a sweep-sized request: every mountain and hills location merged */
const T = JSON.parse(readFileSync(ROOT + 'data/pk-tehsils.json', 'utf8')).features.map(f => { const cs = []; (function w(c) { if (typeof c[0] === 'number') { cs.push(c); return; } c.forEach(w); })(f.geometry.coordinates); return [cs.reduce((s, c) => s + c[1], 0) / cs.length, cs.reduce((s, c) => s + c[0], 0) / cs.length]; });
const pick = T.filter((_, i) => i % 9 === 0).slice(0, 60);
const S = (await px({ latitude: pick.map(p => p[0].toFixed(3)).join(','), longitude: pick.map(p => p[1].toFixed(3)).join(','), hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,cloud_cover', forecast_days: '4', timezone: 'auto', models: 'best_match' })).json || [];
const mh = S.filter(l => l.agn_temperature_basis && /mountain|hills/.test(l.agn_temperature_basis.zone)), mhm = mh.filter(l => l.agn_temperature_basis.merged && /icon/.test(l.agn_temperature_basis.model));
ok(S.length === pick.length && mh.length >= 5 && mhm.length === mh.length, 'sweep (' + S.length + ' places): ' + mhm.length + '/' + mh.length + ' mountain and hills places on the zone chain');

/* 3 · the national residual fades out from 72 h to 96 h for a point too */
const P7 = { latitude: '33.70', longitude: '73.05', hourly: 'temperature_2m', forecast_days: '10', timezone: 'GMT', models: 'best_match' };
const s7 = one((await px(P7)).json), n7 = one((await px({ ...P7, __nonat: '1' })).json);
const now = Date.now(), diff = (lo, hi) => s7.hourly.time.map((t, i) => [(Date.parse(t + 'Z') - now) / 3600e3, Math.abs(s7.hourly.temperature_2m[i] - n7.hourly.temperature_2m[i])]).filter(([h]) => h >= lo && h < hi).map(x => x[1]);
const near = diff(0, 60), mid = diff(100, 130), far = diff(160, 230);
ok(s7.agn_national && s7.agn_national.applied && near.some(x => x > 0.05) && mid.some(x => x > 0.05) && far.length > 20 && far.every(x => x < 0.051), 'national residual applied to day 5, none beyond 156 h (near max ' + Math.max(...near).toFixed(2) + ', day-5 max ' + Math.max(...mid).toFixed(2) + ', far max ' + Math.max(...far).toFixed(2) + ')');

/* 4 · __nolive: no live MACH layers */
const nl = one((await px({ ...P, models: 'best_match', __nolive: '1' })).json);
ok(nl && !(nl.agn_hyperlocal && nl.agn_hyperlocal.applied), '__nolive: no live layer on a replay');

/* 5 · caps are counted, operator-only */
const C = await get('/api/ops/caps'), Cc = await get('/api/ops/caps', { 'x-agn-view': 'customer', 'x-forwarded-for': '10.0.0.9' });
ok(C.status === 200 && C.json && C.json.caps && Object.keys(C.json.caps).length >= 2, 'cap counters report (' + Object.entries((C.json && C.json.caps) || {}).map(([k, v]) => k + ' ' + v.capped + '/' + v.evaluations).join(', ') + ')');

/* 6 · the gate records the served blend; the AI no longer claims an ERA5 correction */
const G = JSON.parse(readFileSync(ROOT + 'data/model-gate.json', 'utf8')).entries.find(e => e.id === 'hyperlocal-temperature');
ok(G && G.skill_metrics.served_blend_gate['pool/mountain'].pass && /fades out/.test(G.temporal_domain), 'gate: mountain blend as served passes; lead rule recorded');
const NM = JSON.parse(readFileSync(ROOT + 'data/national-model.json', 'utf8'));
ok(NM.zones.pool.mountain.servedGate && NM.zones.pool.mountain.servedGate.pass === true && NM.zones.pool.mountain.servedGate.cap === NM.capC && NM.capC >= 12, 'national-model.json carries the served-blend gate, scored at the served cap (' + NM.capC + ' C)');
const src = readFileSync(ROOT + 'server/api/ai.mjs', 'utf8'); ok(!/bias-corrected against ERA5/.test(src), 'AI facts no longer say "bias-corrected against ERA5"');
console.log((fails ? 'FAIL' : 'PASS') + ' v108: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
