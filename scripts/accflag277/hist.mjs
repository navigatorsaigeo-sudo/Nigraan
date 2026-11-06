// flag history: replays the monitor's own flag rule over every hourly snapshot and 6-h block in the laptop's accmon record
import { readFileSync } from 'node:fs';
const APP = process.argv[2], ACCDIR = process.argv[3];
const { createAccMon, loadCities } = await import(APP + '/server/api/accmon.mjs');
const { createMos } = await import(APP + '/server/api/mos.mjs');
const DATA = APP + '/data'; const mos = createMos({ dataDir: DATA, log: () => {} });
const H = 3600e3;
const acc = createAccMon({ mos }, APP, DATA, { noSchedule: true, noLoad: true, noWrite: true, now: () => Date.parse('2026-10-17T07:00:00Z') });
const S = acc._snap, B = acc._bsnap; const meta = new Map(); let bfs = [];
for (const f of ['2026-09.jsonl', '2026-10.jsonl']) for (const l of readFileSync(ACCDIR + '/' + f, 'utf8').split('\n')) { if (!l) continue; const j = JSON.parse(l);
  if (j.ty === 's') S.set(Date.parse(j.t), j.c); else if (j.ty === 'b') B.set(Date.parse(j.t), j.c); else if (j.ty === 'm') meta.set(j.id, j); else if (j.ty === 'bf') bfs.push(j); }
const hrs = [...S.keys()].sort((a, b) => a - b);
const out = { hours: hrs.length, first: new Date(hrs[0]).toISOString(), last: new Date(hrs.at(-1)).toISOString(), flags24: [], flagsBlock: [] };
for (const hk of hrs) { const c = S.get(hk); const s24 = { city: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { mae: v[0], bias: v[1], n: v[2] }])) };
  for (const f of acc.flagsAt(hk + H - 1, s24)) out.flags24.push({ t: new Date(hk).toISOString().slice(0, 13), ...f }); }
for (const bs of [...B.keys()].sort((a, b) => a - b)) for (const f of acc.blockFlags(bs)) out.flagsBlock.push({ t: new Date(bs).toISOString().slice(0, 13), ...f });
out.cityZone = {}; for (const c of new Set([...out.flags24, ...out.flagsBlock].map((x) => x.city))) out.cityZone[c] = acc.reference(c, Date.parse('2026-10-17T06:00:00Z')).why;
out.meta = [...meta.values()];
process.stdout.write(JSON.stringify(out));
