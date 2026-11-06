/* temp_zone_before.mjs (v91.17.70) · INTERNAL · replays the v91.17.69 served temperature correction (station MOS table,
   learned model, synop entries, plains city offsets) on a best_match series, so temp_zone_rank.py can score the
   served forecast BEFORE the change on the same station-hours as the new default path.
   The old path is kept behind NIGRAAN_MOS_V69=1 (v91.17.71; NIGRAAN_INTERNAL_REF=1 in v91.17.70); this script sets it for its own process only.
   usage: node temp_zone_before.mjs <in.json> <out.json>
     in:  [{ key, lat, lon, elev, time: [iso UTC hour], tm: [C], rh: [%], wind: [km/h], days: [YYYY-MM-DD] }]
     out: { key: { adj: [C to add, per hour], daily: { day: { tmax, tmin } } } } */
process.env.NIGRAAN_INTERNAL_REF = '1'; process.env.NIGRAAN_MOS_V69 = '1';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const { createMos } = await import(join(here, '..', 'server', 'api', 'mos.mjs'));
const { createMlMos } = await import(join(here, '..', 'server', 'api', 'mlmos.mjs'));
const dataDir = join(here, '..', 'data');
const mos = createMos({ dataDir, log: () => {} }); const ml = createMlMos({ dataDir, log: () => {} }); mos.setMl(ml);
const IN = JSON.parse(readFileSync(process.argv[2], 'utf8')); const out = {};
for (const s of IN) {
  const adj = s.time.map((t, i) => {
    const tm = s.tm[i]; if (tm == null) return null;
    const a = mos.adjust(s.lat, s.lon, s.elev, Date.parse(t), tm, { rh: s.rh ? s.rh[i] : null, windKmh: s.wind ? s.wind[i] : null, modelElevM: s.elev });
    return a.applied ? a.adj : 0;
  });
  const daily = {};
  for (const d of s.days || []) { const p = mos.adjustDaily(s.lat, s.lon, s.elev, d); if (p.applied) daily[d] = { tmax: p.tmax, tmin: p.tmin }; }
  out[s.key] = { adj, daily };
}
writeFileSync(process.argv[3], JSON.stringify(out));
console.log('replayed', Object.keys(out).length, 'stations; MOS enabled', mos.enabled());
