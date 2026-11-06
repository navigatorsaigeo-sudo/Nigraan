/* v91.17.283.52 E · a mocked live station feed for the page / report checks (written into a COPY of the laptop data, never the real one):
   Punjab: "Mock Near" 1 km from Lahore Cantt (valid, the latest hour 20 min old), "Mock Stale" 0.5 km from Lahore (latest reading 3 h old),
   "Mock Stuck" at Faisalabad (the same value 4 hours); embassy: Islamabad (valid). usage: node mockfeed52E.mjs <dataDir> */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const dd = process.argv[2]; mkdirSync(join(dd, 'cache'), { recursive: true });
const now = Date.now(), last = now - 20 * 60e3, iso = (ms) => new Date(ms).toISOString().slice(0, 16) + ':00Z', hb = (ms) => new Date(Math.floor(ms / 3600e3) * 3600e3).toISOString().slice(0, 13) + ':00:00Z';
const series = (endMs, vals) => Object.fromEntries(vals.map((v, i) => [iso(endMs - (vals.length - 1 - i) * 3600e3), { pm25: v, pm10: v * 2.4, flags: null }]));
const epd = { stations: {
  m1: { name: 'Mock Near', district: 'Lahore', city: 'Lahore', lat: 31.5240, lon: 74.3660 },
  m2: { name: 'Mock Stale', district: 'Lahore', city: 'Lahore', lat: 31.5140, lon: 74.3830 },
  m3: { name: 'Mock Stuck', district: 'Faisalabad', city: 'Faisalabad', lat: 31.4190, lon: 73.0800 } },
  obs: { m1: series(last, [118.2, 121.5, 126.0, 130.4, 133.9, 129.7, 131.2, 135.8, 138.1, 140.6, 137.9, 142.37]),
    m2: series(now - 3 * 3600e3, [90, 91, 93, 95]), m3: series(last, [60.1, 62.4, 77.77, 77.77, 77.77, 77.77]) } };
const dosEnd = Math.floor(now / 3600e3) * 3600e3 - 3600e3;   /* the last hour that is over (hour-beginning) */
const dos = { stations: { '586PK1010001': { name: 'Islamabad', city: 'Islamabad', lat: 33.725614, lon: 73.11602 } },
  obs: { '586PK1010001': Object.fromEntries([71, 74, 76, 80, 83, 85].map((v, i) => [hb(dosEnd - (5 - i) * 3600e3), { pm25: v, aqi: null, via: 'mock' }])) } };
writeFileSync(join(dd, 'cache', 'epd-recent.json'), JSON.stringify(epd)); writeFileSync(join(dd, 'cache', 'dos-recent.json'), JSON.stringify(dos));
console.log('mock feed written: Punjab latest ' + iso(last) + ', embassy latest hour ' + hb(dosEnd));
