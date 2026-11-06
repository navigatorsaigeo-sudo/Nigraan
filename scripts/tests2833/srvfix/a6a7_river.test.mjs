// A6 · river 2- to 5-year band: level kept (Normal), labelled a watch with the share of days that reached Low, read from the scale file.
// A7 · High/Severe rungs (20-year, 1.5 x 20-year) carry "untested" in the API row and the AI text.
import { imp, src, ok, done } from './lib.mjs';
const F = await imp('server/api/flood.mjs');
const R = { levels: { rp2: 100, rp5: 200, rp10: 250, rp20: 300 }, seasonal: Array(24).fill([0, 10, 20, 30]) };
const b = F.rarityClass(R, 150, '2026-08-01');
ok(b.level === 'Normal' && b.levelIndex === 0, 'A6: the 2-5-year band keeps the Normal level (most likely class below Low)');
ok(b.watch === true && /Normal \(watch\): about 4 in 10 such days reached the official Low flood limit \(40 %/.test(b.levelNote || ''), 'A6: levelNote says watch, about 4 in 10, from the scale evidence', b.levelNote);
ok(/watch/.test(b.band) && !/no flood signal/.test(b.band), 'A6: the band no longer says "no flood signal"', b.band);
const lo = F.rarityClass(R, 50, '2026-08-01');
ok(!lo.watch && !lo.levelNote, 'A6: below the 2-year flow nothing is added');
const h = F.rarityClass(R, 320, '2026-08-01'), s = F.rarityClass(R, 500, '2026-08-01');
ok(h.level === 'High' && h.untested === true && /untested rung/.test(h.levelNote || ''), 'A7: High at the 20-year flow is labelled untested', h.levelNote);
ok(s.level === 'Severe' && s.untested === true && /Severe: beyond 1.5 times the 20-year flow \(untested rung/.test(s.levelNote || ''), 'A7: Severe is labelled untested', s.levelNote);
const m = F.rarityClass(R, 250, '2026-08-01');
ok(m.level === 'Moderate' && !m.untested && !m.levelNote, 'A7: the tested 5-year rung carries no untested label');
const ai = src('server/api/ai.mjs');
ok(/note: r\.levelNote/.test(ai) && /untested: always say "untested"/.test(ai), 'A7: AI reach rows carry the note and the meaning tells the model to say untested');
done('A6A7-RIVER');
