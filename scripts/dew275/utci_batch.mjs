// DEW v275 · UTCI in shade (Tmrt = Ta) for a batch, with the server's own utci.mjs and the hazard-scale cuts: stdin JSON
// {rows: [[Ta, wind m/s at 10 m, RH %], ...]} -> stdout JSON {utci: [...], level: [...]}
import { readFileSync } from 'node:fs';
import { utci, utciAgnScore } from '../../server/api/utci.mjs';
const H = JSON.parse(readFileSync(new URL('../../data/hazard-scale.json', import.meta.url), 'utf8'));
const lvl = (s) => { if (s == null) return null; const c = H.screeningCuts.find((k) => s >= k.min); return c ? c.level : null; };
const inp = JSON.parse(readFileSync(0, 'utf8'));
const u = inp.rows.map(([t, v, rh]) => utci(t, t, v, rh));
process.stdout.write(JSON.stringify({ utci: u, level: u.map((x) => lvl(utciAgnScore(x))) }));
