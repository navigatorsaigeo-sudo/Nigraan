// planned C · the as-issued forecast archive holds 96 hours (Pakistan days 0-3 of the issue), so day 3 can be verified:
//  H1 the national record keeps lead hours 0-72 (no reader changes) and carries archExt: the served hours after the last lead to 96 h,
//     from the same corrected answer (no extra provider call)
//  H2 the archive row merges them: 97 hourly values and a day-3 daily maximum / minimum
//  H3 disk: one archived day grows by about a third (measured on the laptop in CHANGES.md)
import vm from 'node:vm';
import { src, lift, ok, done } from './lib.mjs';
const N = src('server/api/national.mjs'), A = src('server/api/archive.mjs');
ok(/archExt = \{ \.\.\.ext, note: 'served hours after the last lead to 96 h/.test(N) && /to = baseMs \+ 96 \* 3600e3/.test(N) && /\.\.\.\(archExt \? \{ archExt \} : \{\}\)/.test(N) && !/forecast_days: fetchDays \+ 1/.test(N), 'H1 the record carries archExt to 96 h from the same answer; the request is unchanged');
const W = lift(A, 'withExt'); let withExt = null; try { const c = { Date, Array, Object }; vm.createContext(c); vm.runInContext(W + '; this.withExt = withExt;', c); withExt = c.withExt; } catch (_) {}
if (withExt) {
  const t0 = Date.parse('2026-10-21T19:00:00Z'), hrs = (a, b) => { const o = []; for (let h = a; h <= b; h++) o.push(new Date(t0 + h * 3600e3).toISOString().slice(0, 16)); return o; };
  const H = { time: hrs(0, 72), temperature_2m: hrs(0, 72).map((_, i) => 20 + (i % 24) / 2) };
  const X = { time: hrs(73, 96).map((t) => t + ':00Z'), temperature_2m: hrs(73, 96).map((_, i) => 30 + i / 10) };
  const m = withExt({ hourly: H, archExt: X });
  ok(m.time.length === 97 && m.temperature_2m.length === 97 && m.temperature_2m[96] === X.temperature_2m[23], 'H2 the archive row has 97 hourly values: hours 0-72 of the record and 73-96 of archExt', m.time.length);
  const plain = withExt({ hourly: H }); ok(plain.time.length === 73, 'a record without archExt archives its 73 hours as before');
} else { ok(false, 'H2 archive.mjs withExt (merge to 96 h) exists'); }
ok(/97 hourly values/.test(A), 'the archive header says 97 hourly values');
done('C-ARCH96');
