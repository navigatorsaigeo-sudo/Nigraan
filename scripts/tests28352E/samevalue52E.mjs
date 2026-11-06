/* v91.17.283.52 E · the same measured air-quality sentence on every surface (extends tests28352D/samevalue52D.mjs, check 1, with airNow) and the
   report linter on 5 Punjab places + 2 outside Punjab:
   1. GET /api/point customer vs operator: shown.airNow identical (one shared decision); the customer bundle has no airStation;
   2. POST /api/report/generate (site assessment, situation report; customer; and the site assessment in the operator view): 200 = the server's
      report linter passed; "Now at the site" printed; the measured sentence printed exactly as served where there is one (data-shown airNow),
      and NOT printed where there is none (Faisalabad: stuck station, Sheikhupura / Multan: none within 25 km, Karachi / Gilgit: outside Punjab,
      no qualifying monitor); no monitor, agency, distance or age in the customer text.
   usage: node samevalue52E.mjs <base> */
const [B] = process.argv.slice(2);
const P = [[31.51, 74.38, 'Lahore', 1], [31.5204, 74.3587, 'Lahore Cantt', 1], [31.418, 73.079, 'Faisalabad', 0], [31.71, 73.98, 'Sheikhupura', 0], [30.1575, 71.5249, 'Multan', 0], [24.85468, 67.02071, 'Karachi', 0], [35.9208, 74.3089, 'Gilgit', 0]];
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const H = (v) => ({ 'sec-fetch-site': 'same-origin', ...(v ? { 'x-agn-view': v } : {}) });
const j = async (u, v) => (await fetch(B + u, { headers: H(v), signal: AbortSignal.timeout(600000) })).json();
const post = async (u, body, v) => { const r = await fetch(B + u, { method: 'POST', headers: { ...H(v), 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(900000) }); return { st: r.status, j: await r.json().catch(() => ({})) }; };
const BAN = /\bEPD\b|Punjab EPD|Department of State|Dept of State|Embassy|consulate|Mock Near|Mock Stale|Mock Stuck/i;
const f5 = (x) => (+x).toFixed(5);
for (const [lat, lon, name, want] of P) {
  const c = await j('/api/point?lat=' + f5(lat) + '&lon=' + f5(lon) + '&complete=1', 'customer'), o = await j('/api/point?lat=' + f5(lat) + '&lon=' + f5(lon) + '&complete=1', 'operator');
  const ca = c.shown && c.shown.airNow, oa = o.shown && o.shown.airNow, label = ca && ca.label;
  ok(JSON.stringify(ca) === JSON.stringify(oa), name + ': customer and operator bundles carry the same airNow', JSON.stringify(ca) + ' vs ' + JSON.stringify(oa));
  ok(want ? !!label : !label, name + ': measured line ' + (want ? 'present' : 'absent') + ' (' + (label || (o.airStation && (o.airStation.none + ' ' + JSON.stringify(o.airStation.held || [])))) + ')');
  ok(!('airStation' in c) && !BAN.test(JSON.stringify(c.shown || {})), name + ': no monitor detail in the customer bundle');
  for (const [kind, view] of [['site_assessment', 'customer'], ['situation_report', 'customer'], ['site_assessment', 'operator']]) {
    const g = await post('/api/report/generate', { lat, lon, kind, section: 'test' }, view);
    ok(g.st === 200 && g.j.ok, name + ' ' + kind + ' ' + view + ': made and passed the server report linter', JSON.stringify(g.j).slice(0, 300)); if (!g.j.ok) continue;
    const html = await (await fetch(B + g.j.html + (view === 'operator' ? '?view=operator' : ''), { headers: H(view) })).text();
    const flat = html.replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
    const shownNodes = [...html.matchAll(/data-shown="airNow"[^>]*>([^<]*)</g)].map((m) => m[1].replace(/&#(\d+);/g, (x, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&')).join(' ').replace(/\s+/g, ' ').trim();
    ok(/Now at the site/.test(flat), name + ' ' + kind + ' ' + view + ': "Now at the site" printed');
    if (want) ok(shownNodes === label || flat.includes(label), name + ' ' + kind + ' ' + view + ': the measured sentence exactly as served', shownNodes + ' || ' + label);
    else ok(!/Air quality measured now/.test(flat), name + ' ' + kind + ' ' + view + ': no measured line', (/Air quality measured now[^.]*/.exec(flat) || [''])[0]);
    if (view === 'customer') ok(!BAN.test(flat), name + ' ' + kind + ': no monitor or agency named in the customer report', (BAN.exec(flat) || [''])[0]);
  }
}
console.log('samevalue52E: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
