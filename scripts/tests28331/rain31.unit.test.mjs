/* v91.17.283.31 · server lane unit tests: the rain fixes (items 1.4, 2.4 and the science lane's zone cells / mountain mapping) and the
   reference layers (1.2, 1.3).  node scripts/tests28331/rain31.unit.test.mjs */
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { tmpdir } from 'node:os'; import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const APP = join(HERE, '..', '..'); const DATA = join(APP, 'data');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 400))); if (!c) f++; };
const imp = (x) => import(pathToFileURL(join(APP, 'server', 'api', x)).href);
const J = (x) => JSON.parse(readFileSync(join(DATA, x), 'utf8'));
try {
  const H = await imp('hazsci.mjs'); const RA = await imp('rainamount.mjs'); const RF = await imp('reflayers.mjs');
  const coefs = J('rain-prob-coefs.json'), Cd = J('rain-prob-coefs-ifsdet.json'), Cz = J('rain-prob-coefs-ifsdet-zones.json');
  /* -- 1.4 re-lead -- */
  const row = { prc: { calibrated: true, lead: 2, zone: 'plains', p: { '15.6': 10 }, n: 51 }, prs: { n: 51, mean: 3.2, sd: 4.1, m: [6, 1, 0, 0] }, pr: [0, 1.5, 9] };
  const r1 = H.releadRow(row, 1, '2026-10-30', 51, coefs);
  ok(r1 && r1.prc && r1.prc.lead === 1 && r1.prc.relead && r1.prc.relead.from === 2, 'a calibrated row computed at lead 2 is re-read at lead 1 from its member statistics', r1 && r1.prc);
  const r0 = H.releadRow(row, 0, '2026-10-29', 51, coefs);
  ok(r0 && r0.prc && r0.prc.calibrated === false && Math.abs(r0.prc.p['15.6'] - 100 * 6 / 51) < 0.2, 'at lead 0 the row is the plain member share (screening)', r0 && r0.prc);
  ok(H.releadRow({ prc: { calibrated: true, lead: 2 } }, 1, '2026-10-30', 51, coefs) === null, 'no member statistics held: not re-read (null)');
  /* applyRain: the clock moved past the rows' lead -> re-read, not withheld; a stale run -> input not current (-6) */
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10), tmr = new Date(Date.now() + 5 * 3600e3 + 864e5).toISOString().slice(0, 10);
  const mkRec = () => ({ days: [{ day: 0, date: today, layers: { rain_hz: { L: { U1: -1 } }, flood_pluvial: { L: { U1: 0 } } } }, { day: 1, date: tmr, layers: { rain_hz: { L: { U1: -1 } }, flood_pluvial: { L: { U1: 0 } } } }] });
  const ens = { at: new Date().toISOString(), members: 51, days: [today, tmr], units: { U1: [{ ...row, prc: { ...row.prc, lead: 1 } }, { ...row, prc: { ...row.prc, lead: 2 } }] } };
  let rec = mkRec(); H.applyRain(rec, ens, { coefs });
  ok(rec.days.every((d) => { const L = d.layers.rain_hz.L.U1, w = (d.layers.rain_hz.why || {}).U1 || ''; return (L >= 0 || L === -5) && !/computed at lead/.test(w); }), 'after the PKT day rolled, both days are re-read from the held rows (a level, or not tested: never "computed at lead 2 for a day now lead 1")', rec.days.map((d) => [d.layers.rain_hz.L.U1, d.layers.rain_hz.why]));
  ok(rec.days[0].layers.flood_pluvial.L.U1 === 0, 'applyRain alone leaves the pluvial cell (the dependency is the apply step)');
  rec = mkRec(); H.applyRain(rec, { ...ens, at: new Date(Date.now() - 40 * 3600e3).toISOString() }, { coefs });
  ok(rec.days[0].layers.rain_hz.L.U1 === -6 && /input not current/.test(rec.days[0].layers.rain_hz.why.U1), 'a 40-h-old ensemble run: state input not current (-6) with its age', rec.days[0].layers.rain_hz);
  rec = mkRec(); H.applyRain(rec, { ...ens, days: ['2020-01-01'] }, { coefs });
  ok(rec.days[1].layers.rain_hz.L.U1 === -6 && /does not cover/.test(rec.days[1].layers.rain_hz.why.U1), 'a run that does not cover the day: input not current', rec.days[1].layers.rain_hz.why);
  /* -- zone cells -- */
  ok(Cz.cells['15.6|1|mountain'] && Cz.cells['64.5|1|plains'] && !Cz.cells['15.6|1|coast'], 'the zone cells load (mountain 15.6, plains 64.5; no coast cell)');
  const mt = H.detCell(Cd, { mm: 40, lead: 1, zone: 'mountain', month: 7, run: '2026102900' }, null, Cz);
  ok(mt && mt.L === 1 && mt.facts.method === 'd-z' && mt.facts.lowSkill && mt.facts.skill && mt.facts.skill.events === 135 && /low-skill warning/.test(mt.facts.text), 'a mountain point at lead 1 gets a level (Low or heavier), with its skill and a low-skill wording', mt && mt.facts);
  for (const L of [2, 3]) { const c = H.detCell(Cd, { mm: 0.5, lead: L, zone: 'mountain', month: 10 }, null, Cz); ok(c && c.L === 0, 'mountain lead ' + L + ': a level (Normal on a dry day)', c); }
  const co = H.detCell(Cd, { mm: 80, lead: 1, zone: 'coast', month: 8 }, null, Cz);
  ok(co && co.L === -5 && /failed held-out test/.test(co.why), 'a coast point stays not tested (-5) with "failed held-out test"', co);
  const hi = H.detCell(Cd, { mm: 80, lead: 1, zone: 'hills', month: 8 }, null, Cz);
  ok(hi && hi.L === -5 && /too few events/.test(hi.why), 'a hills point stays not tested with "too few events"', hi);
  const p64 = H.detCell(Cd, { mm: 150, lead: 1, zone: 'plains', month: 8 }, null, Cz);
  ok(p64 && p64.L === 2 && p64.facts.levelLabel === 'Moderate or heavier' && p64.facts.skill64, 'plains lead 1, 150 mm: Moderate or heavier from the tested 64.5 mm cell, with its skill', p64 && p64.facts);
  const p64l3 = H.detCell(Cd, { mm: 150, lead: 3, zone: 'plains', month: 8 }, null, Cz);
  ok(p64l3 && p64l3.L === 1, 'plains lead 3: the 64.5 mm cell is not tested, so no Moderate (Low or heavier at most)', p64l3 && p64l3.L);
  const tdy = H.detCell(Cd, { mm: 40, lead: 1, zone: 'mountain', month: 7, fromPreviousRun: true }, null, Cz);
  ok(tdy && tdy.facts.fromPreviousRun && /previous 00 UTC run at lead 1/.test(tdy.facts.text), 'today read from the previous run at lead 1 says so', tdy && tdy.facts.text);
  /* -- mountain amount mapping -- */
  const T = RA.qmTable(DATA);
  const m = RA.shownRainMm(DATA, 10, { zone: 'mountain', lead: 1, month: 10 }), p = RA.shownRainMm(DATA, 10, { zone: 'plains', lead: 1, month: 10 }), c0 = RA.shownRainMm(DATA, 10, { zone: 'mountain', lead: 0, month: 10 });
  ok(T && m.mapping === 'mountain station mapping' && m.rawMm === 10 && m.mm < 10, 'the mapping is applied in the mountains (10 mm forecast -> ' + m.mm + ' mm)', m);
  ok(p.mapping === 'raw' && p.mm === 10, 'plains keep the raw amount', p); ok(c0.mapping === 'raw', 'lead 0 keeps the raw amount (never tested)', c0);
  ok(RA.shownRainMm(DATA, 0, { zone: 'mountain', lead: 2, month: 7 }).mm === 0, '0 maps to 0');
  /* -- the amount layer -- */
  const units = [{ unitId: 'M|a|b', key: 'b', lat: 35.9, lon: 74.3, elevM: 2500 }, { unitId: 'P|c|d', key: 'd', lat: 31.5, lon: 74.3, elevM: 210 }];
  const app = { units: { tehsil: units }, outlook: { dayRows: () => ({ at: new Date().toISOString(), members: 51, days: [today, tmr], units: { 'M|a|b': [{ pr: [0, 2, 10] }, { pr: [1, 20, 50] }], 'P|c|d': [{ pr: [0, 70, 120] }, { pr: null }] } }) } };
  const AL = RA.createRainAmountLayer(app, DATA, { dayRarity: H.dayRarity, rainClasses: () => ({ value: [15.6, 64.5, 115.6, 204.5], words: ['a', 'b', 'c', 'd', 'e'] }), zoneOf: (u) => (u.elevM > 1500 ? 'mountain' : 'plains') });
  const A1 = AL.layer(1), A0 = AL.layer(0);
  ok(A1.ready && A1.kind === 'amount' && A1.values['M|a|b'].mapping === 'mountain station mapping' && A1.values['M|a|b'].rawMm === 20, 'amount layer day 1: the mountain tehsil is mapped', A1.values);
  ok(A1.levels['P|c|d'] === -1 && /missing/.test(A1.whys['P|c|d']), 'a tehsil without ensemble rain: missing, with the reason');
  ok(A0.levels['P|c|d'] === 2 && A0.values['P|c|d'].mapping === 'raw' && A0.levelsNote && /not yet tested/.test(A0.levelsNote), 'amount class (64.5-115.6 mm) in its own words, labelled "levels not yet tested"', A0);
  ok(A0.canAlert === false && A0.productType === 'Forecast amount', 'the amount layer never alerts');
  /* -- reference layers -- */
  const S = J('seismic-units.json'); const ts = Object.keys(S.tehsils).map((u) => ({ unitId: u, key: u.split('|')[2] }));
  const R = RF.createRefLayers({ units: { tehsil: ts } }, DATA);
  const se = R.layer('seismic'), cy = R.layer('cyclone');
  ok(se.ready && se.kind === 'reference' && se.states.value === ts.length && se.words[4].startsWith('Zone 4'), 'earthquake zone: every tehsil classed (' + ts.length + '), code-zone words', se.states);
  /* v91.17.283.47 (owner rule 2 Nov 2026 01:15 PKT, replaces v283.35 B1): beyond the farthest inland reach of gale-force cyclone wind on the
     record the tehsil is "cannot happen" (-4); inside it, a tehsil without a gale on record keeps the class "No gale on record" */
  ok(cy.ready && cy.inlandReach && cy.states.value + cy.states.not_applicable === ts.length && cy.states.not_applicable === cy.inlandReach.cannotHappen && cy.counts[0] > 0 && cy.counts[2] > 0 && /^No gale on record/.test(cy.words[0]), 'cyclone exposure: classes on the coast, "No gale on record" inside the record\'s inland reach, "cannot happen" beyond it (owner rule 2 Nov 2026)', { st: cy.states, c: cy.counts, reach: cy.inlandReach });
  const inl = Object.entries(cy.levels).find(([, v]) => v === 0); ok(inl && /no tropical cyclone of/.test(cy.facts[inl[0]].note), 'an inland tehsil says why (no gale in 46 seasons, a record)', inl && cy.facts[inl[0]]);
  const one = R.unit(ts[0].unitId); ok(one.seismic && one.seismic.kind === 'reference' && one.cyclone, 'one tehsil: both reference classes');
} catch (e) { ok(false, 'crashed: ' + (e && e.stack || e)); }
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
