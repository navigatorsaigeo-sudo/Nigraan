// C2 · the 15-day site heat is a temperature-only estimate: no UTCI class, level marked approximate, texts say so (also S9).
// C8 · the rain row no longer instructs drainage sizing; it is a screening floor, design uses the local IDF curve and standard.
import { imp, src, lift, ok, done } from './lib.mjs';
const S = src('server/api/siterisk.mjs');
const U = await imp('server/api/utci.mjs');
const fnTxt = lift(S, 'heatAhead'); ok(!!fnTxt, 'heatAhead found');
const app = { climatology: { thresholds: () => ({ u90: 44, tx90: 42 }) } };
const hi = (x) => x, R1 = (x) => Math.round(x * 10) / 10, levelOfScore = (s) => (s == null ? null : s >= 82 ? 'Severe' : s >= 65 ? 'High' : s >= 45 ? 'Moderate' : s >= 25 ? 'Low' : 'Normal');
const heatAhead = new Function('app', 'hi', 'R1', 'levelOfScore', 'utciAgnScore', 'utciClass', fnTxt + '\nreturn heatAhead;')(app, hi, R1, levelOfScore, U.utciAgnScore, U.utciClass);
const h = heatAhead({ unitId: 'x' }, [{ date: '2026-10-25', tx: 45 }], 100, 100, -0.0065);
ok(h && h.utciClass === null, 'C2: no UTCI class on the temperature-only estimate', JSON.stringify(h));
ok(h && h.approximate === true && /temperature-only estimate/.test(h.basisNote || ''), 'C2: marked approximate, temperature-only');
ok(h && typeof h.level === 'string', 'C2: the level is kept (approximate)');
ok(/temperature-only UTCI estimate about/.test(S) && !/UTCI about ' \+ R0\(h\.utciC\) \+ ' °C in shade \(' \+ h\.utciClass/.test(S), 'C2: the forecast text says temperature-only estimate, no class');
ok(/Approximate level: a temperature-only estimate of shade UTCI/.test(S) && !/Level on the UTCI heat-stress scale, as on the map/.test(S), 'S9: the meaning no longer claims the map UTCI');
ok(!/Size site drainage for at least the 10-year day/.test(S), 'C8: drainage-sizing instruction removed');
ok(/drainage design uses the local rainfall intensity-duration-frequency \(IDF\) curve and the design standard/.test(S), 'C8: screening wording');   /* v283.28 S6: the levels are the tehsil's satellite-rain return levels (the 30 km reanalysis 'floor' wording went with the reanalysis fit) */
done('C2C8-SITERISK');
