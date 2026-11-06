#!/usr/bin/env python3
"""v283.10 part 3 · R8: the stale-sheet switch gate re-run exactly as rivercal_stale.py + rivercal_build.py define it, on the SERVED
level (served flow, GMT frame as served from v283.10), and applied to data/river-cal.json where a current switch age FAILS the gate.

the original rule (rivercal_build.py): ok(age) = gain 95 % lower bound > 0 AND 2026 mean gain >= 0; switch age = the first age from
which every later age is ok; no such age -> null ("keep the last reading at any age", rivercal.mjs). A current age fails when
it is not ok or some later age is not ok. Then the reach takes the age the same rule gives on the served level (null if none).
A current age that still passes is left as it is (the gate is not used here to switch earlier); the rule's age is reported.
precondition: --legacy (the same pipeline on the station file, the original input) must reproduce the shipped staleSheet exactly.
usage: python stale_apply.py --current data/river-cal.json --legacy <rc_leg candidate> --served <rc_served candidate>
                             --served-stale <rc_served rivercal_stale.json> --out-evidence <json> [--write]"""
import sys, json
a = sys.argv[1:]; opt = lambda n, d=None: a[a.index(n) + 1] if n in a else d
C = json.load(open(opt('--current'))); cur = C['reaches']
leg = json.load(open(opt('--legacy')))['reaches']; srv = json.load(open(opt('--served')))['reaches']; st = json.load(open(opt('--served-stale')))
repro = all(cur[k].get('staleSheet') == leg[k].get('staleSheet') for k in cur)
ev = dict(rule='rivercal_build.py: ok(age) = gain lower 95 % > 0 and 2026 mean gain >= 0; switch = first age with every later age ok; none -> null',
          reproducesShipped=repro, reaches={}, changes=[])
for k, v in cur.items():
    if not v.get('staleSheet') or k not in st: continue
    T = st[k]['table']; ok = {x['age']: bool(x['gain'][1] > 0 and (x['gain2026'][0] or 0) >= 0) for x in T}
    ages = sorted(ok); a0 = v['staleSheet']['switchAgeDays']
    passes = a0 is None or all(ok[x] for x in ages if x >= a0)
    rule = srv[k]['staleSheet']['switchAgeDays'] if srv[k].get('staleSheet') else None
    new = a0 if passes else rule
    ev['reaches'][k] = dict(current=a0, currentPassesOnServedLevel=passes, ruleAgeOnServedLevel=rule, applied=new,
                            failingAges=[x for x in ages if a0 is not None and x >= a0 and not ok[x]],
                            gainAtAges=[[x['age'], [round(y, 3) for y in x['gain']], None if x['gain2026'][0] is None else round(x['gain2026'][0], 3)] for x in T])
    if new != a0:
        lo, hi = (a0, new) if new is not None else (a0, 15)
        ev['changes'].append(dict(reach=k, switchAgeDays=[a0, new], clientEffect='gauge panel at sheet ages %s d: the last sheet reading is shown instead of the reach model level' % list(range(lo, hi))))
if '--write' in a:
    if not repro: raise SystemExit('the legacy run does not reproduce the shipped staleSheet: nothing changed')
    for k, r in ev['reaches'].items():
        s = cur[k]['staleSheet']; s['switchAgeDays'] = r['applied']
        s['gainByAge'] = srv[k]['staleSheet']['gainByAge']
        s['basis'] = 'v283.10: gate re-run on the served level (served flow, GMT frame); rule unchanged (scripts/tests28310/glofas/stale_apply.py)'
    C['staleSheetBasis'] = 'v283.10 part 3: switch ages re-gated on the served level; a failing age takes the age the original rule gives'
    json.dump(C, open(opt('--current'), 'w'), separators=(',', ':'))
json.dump(ev, open(opt('--out-evidence'), 'w'), indent=1)
print('reproduces shipped:', repro); print(json.dumps({k: {x: r[x] for x in ('current', 'currentPassesOnServedLevel', 'ruleAgeOnServedLevel', 'applied', 'failingAges')} for k, r in ev['reaches'].items()}, indent=0)); print(ev['changes'])
