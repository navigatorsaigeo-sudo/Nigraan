/* v91.17.196 · MACH station names approved 7 Oct (area, city; no buildings or roads); stations listed city by city, Islamabad first */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const R = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
test('approved names: MACH numbers unchanged, no pinpoint names, no wrong cities', () => {
  const d = JSON.parse(R('data/mach-fleet-stations.json')), S = d.stations;
  assert.equal(S.length, 108);   /* MACH 108 Danyore added 9 Oct 2026 */ assert.equal(S[0].no, 1); assert.equal(S[0].name, 'I-8, Islamabad');
  const bad = /Hospital|Masjid|Mosque|Mall|Banquet|University|Road|Park,|Complex|Farm|Distributary|mor\b|Isb$/i;
  assert.deepEqual(S.filter(s => bad.test(s.name)).map(s => s.no), []);
  const by = Object.fromEntries(S.map(s => [s.no, s.name]));
  assert.equal(by[21], 'Larkana'); assert.equal(by[34], 'Vehari'); assert.equal(by[55], 'Kharian, Gujrat'); assert.equal(by[61], 'Nushki');
  assert.equal(new Set(S.map(s => s.name)).size, 108); assert.ok(d.names && d.names.previous && Object.keys(d.names.previous).length >= 80);
});
test('the station table opens city by city with the MACH number; the fleet rows carry it', () => {
  const o = R('build/obs_ui.html'); assert.match(o, /sortKey='place'/); assert.match(o, /CITY0=\['Islamabad','Rawalpindi','Karachi','Lahore'\]/); assert.match(o, /<th data-k="no">MACH<\/th>/);
  const f = R('server/api/fleet.mjs'); assert.match(f, /no: r\.no != null \? r\.no : null/); assert.match(f, /_np\[_np\.length - 1\]/);
});
