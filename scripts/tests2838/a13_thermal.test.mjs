// audit 13 · the UTCI and wet-bulb functions enforce their input contracts (server modules and the page copies alike): RH 0-100 %,
// vapour pressure <= 5 kPa (the UTCI polynomial's domain, Broede et al. 2012), pressure > 0 hPa; outside them: null (not assessed).
import vm from 'node:vm';
import { imp, src, lift, ok, done } from './lib.mjs';
const U = await imp('server/api/utci.mjs'), P = await imp('server/api/psychro.mjs');
ok(U.utci(35, 35, 1, -1) === null && U.utci(35, 35, 1, 150) === null, 'server UTCI: RH -1 % and 150 % -> null (v283.7: 31.6 and 220.8)', [U.utci(35, 35, 1, -1), U.utci(35, 35, 1, 150)].join());
ok(U.utci(45, 45, 1, 70) === null && U.utci(35, 35, 1, 50) != null, 'server UTCI: vapour pressure above 5 kPa (45 C, 70 %) -> null; a normal hour still computes', [U.utci(45, 45, 1, 70), U.utci(35, 35, 1, 50)].join());
ok(P.wetBulbC(30, 50, { pressureHpa: -100 }) === null && P.wetBulbC(30, 99.8, { pressureHpa: 0 }) === null && P.wetBulbPsychroC(30, 50, -5) === null && P.wetBulbC(30, 50, { pressureHpa: 900 }) != null, 'server wet bulb: pressure <= 0 hPa -> null (also at saturation); 900 hPa computes');
const page = src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'); const ctx = { Math, Number, isFinite };
vm.createContext(ctx); let err = null; try { vm.runInContext(['agnUtciEs', 'agnUtci', 'agnSatVapPressHpa', 'agnPressureAtM', 'agnWetBulbPsychroC', 'wetBulbStullC'].map((n) => lift(page, n)).join('\n'), ctx); } catch (e) { err = e.message; }
ok(!err && ctx.agnUtci(35, 35, 1, -1) === null && ctx.agnUtci(35, 35, 1, 150) === null && ctx.agnUtci(45, 45, 1, 70) === null, 'page UTCI: the same contract', err || [ctx.agnUtci(35, 35, 1, -1), ctx.agnUtci(35, 35, 1, 150)].join());
ok(!err && ctx.wetBulbStullC(30, 50, { pressureHpa: -100 }) === null && ctx.agnWetBulbPsychroC(30, 50, -5) === null, 'page wet bulb: the same contract');
ok(!err && Math.abs(ctx.agnUtci(35, 35, 1, 50) - U.utci(35, 35, 1, 50)) < 1e-9, 'page and server give the same UTCI inside the domain');
done('A13-THERMAL');
