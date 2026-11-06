/* v91.17.283.52 D · report wording helpers: plain place names and one spelling (N20, #104), inventory / week ids (N21), the drought month
   lag (#107).  usage: node words52D.unit.mjs */
const R = await import(new URL('../../server/api/repengine.mjs', import.meta.url)); const S = await import(new URL('../../server/api/siterisk.mjs', import.meta.url));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const P = (o) => ({ tehsil: 'Sheikhupura', district: 'Sheikhupura', lat: 31.7, lon: 74, ...o });
ok(R.placeName(P({ kind: 'near', near: { name: 'I-8/4', km: 0.2 } })) === 'I-8/4', 'near place: plain name, no "Near" (' + R.placeName(P({ kind: 'near', near: { name: 'I-8/4', km: 0.2 } })) + ')');
ok(R.placeName(P({ name: '1.2 km WNW of Mian Mir Lines' })) === 'Mian Mir Lines', 'bearing and distance dropped: ' + R.placeName(P({ name: '1.2 km WNW of Mian Mir Lines' })));
ok(R.placeName(P({ name: 'Near Shekhupura (0.7 km)' })) === 'Sheikhupura', 'one spelling (Shekhupura -> Sheikhupura): ' + R.placeName(P({ name: 'Near Shekhupura (0.7 km)' })));
ok(R.placeName(P({ asked: 'I-8', near: { name: 'I-8/4', km: 0.2 } })) === 'I-8', 'the asked name titles the report (#104)');
ok(R.placeName(P({ name: 'Selected point', tehsil: 'Lahore Cantt' })) === 'Lahore Cantt', 'a coordinate-only point is named by its tehsil');
ok(R.clean('Unnamed lake SLI-0805, Gilgit') !== '' && !/SLI-/.test(R.clean('lakes: unnamed lake NLI-2265 near Pakora-Shigar')), 'inventory ids removed: ' + R.clean('lakes: unnamed lake NLI-2265 near Pakora-Shigar'));
ok(/the week of 19 Oct/.test(R.clean('VHI 50 · week 2026-W43')) && !/W43/.test(R.clean('VHI 50 · week 2026-W43')), 'ISO week in words: ' + R.clean('VHI 50 · week 2026-W43'));
ok(/SHA-256/.test(R.clean('Data digest (SHA-256)')), 'SHA-256 kept');
ok(S.weekText('2026-W43') === 'week of 19 Oct 2026', 'weekText: ' + S.weekText('2026-W43'));
ok(/latest month of the satellite rain record \(Oct is added/.test(S.lagWhy('2026-09', Date.parse('2026-11-03T12:00:00Z'))) && S.lagWhy('2026-10', Date.parse('2026-11-03T12:00:00Z')) === '', 'drought month lag said (Sep on 3 Nov), none when current');
console.log('words52D.unit: ' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
