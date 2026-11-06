#!/usr/bin/env python3
"""v283.10 · glofascal before (v283.9: station-file series, its frame and cells, lags -2..+2, raw at lag 0) vs after (served frame),
per gauge: served form, held-out MAE raw / calibrated / persistence, MAE gain vs persistence with its 7-day block bootstrap 95 % CI.
usage: GLOFAS_SERVED=<served csv.gz> WS9_UP=<nig folder> python glofascal_before_after.py --file <glofas_irsa_daily.csv.gz> --out <json>"""
import os, sys, json
import pandas as pd
a = sys.argv[1:]; opt = lambda n, d=None: a[a.index(n) + 1] if n in a else d
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'gen', 'flood_glofascal'))
import glofascal as GC


def table(out):
    t = {}
    for k, v in out.items():
        h, p = v['heldOut'], v['vsPersistence']; f = v['served']
        t[k] = dict(served=f, lag=v['fit']['lagDays'], n=h['n'], maeRaw=h['raw']['mae'], maeCal=h[f]['mae'] if f else None,
                    nPers=p['n'], maePers=p['maePersistence'], maeCalOnPersDays=p[f]['mae'] if f else None,
                    gainVsPersistence=p[f]['maeGainVsPersistence'] if f else None,
                    bestFormGainVsPersistence=max((p[x]['maeGainVsPersistence'] for x in ('QM', 'LLS')), key=lambda z: z[0] if z[0] is not None else -1e9),
                    gate={x: v['gate'][x]['passes'] for x in ('QM', 'LLS')})
    return t


F0 = pd.read_csv(opt('--file'), index_col=0, parse_dates=True)
legacy = pd.DataFrame({rid: F0[c[0]] for rid, c in GC.REACH.items() if c[0] in F0.columns})
before, _ = GC.run(legacy, lags=range(-2, 3), raw_lagged=False)
after, _ = GC.run(GC.load_served())
R = dict(before=table(before), after=table(after))
json.dump(R, open(opt('--out'), 'w'), indent=1)
for k in R['after']:
    b, x = R['before'].get(k, {}), R['after'][k]
    print(f"{k:10s} before {str(b.get('served')):5s} lag {b.get('lag'):+d} rawMAE {b.get('maeRaw'):6.1f} cal {str(b.get('maeCal')):6s} pers {b.get('maePers')} gainVsPers {b.get('gainVsPersistence')} | "
          f"after {str(x['served']):5s} lag {x['lag']:+d} rawMAE {x['maeRaw']:6.1f} cal {str(x['maeCal']):6s} pers {x['maePers']} gainVsPers {x['gainVsPersistence']} best {x['bestFormGainVsPersistence']}")
