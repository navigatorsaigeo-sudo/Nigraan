#!/usr/bin/env python3
"""v91.17.273 · TEMP · the Gilgit/Skardu seam: is the synop running anomaly also right for the hours just BEFORE the latest report?

Live behaviour (server/api/synop.mjs corrAt): correction(t) = bias(hour of t) + a(t - t_last) x anomaly, only for t >= t_last; hours before
the latest report get the hour bias alone. At t_last the correction therefore steps by a(0) x anomaly = 0.6 x anomaly (Gilgit 14 Oct
2026 03 UTC: anomaly +1.9 C -> a 1.14 C step between 07 and 08 PKT; the laptop's tests71 seam 1.17-1.37 C).
Held-out check on the copies (synop_2026-10.jsonl: observed and the value NIGRAAN served, every station, 1-16 Oct 2026): for every report
t_last (as the 'latest'), the running bias and its anomaly are built ONLY from reports up to t_last (as live), then the earlier reports at
t_last - 3 h and t_last - 6 h are predicted with (A) the bias alone (today) and (B) bias + a_back(dt) x anomaly, a_back mirroring the live
lead weights (0.6 to 3 h, falling to 0 at 6 h: continuous, and nothing beyond 6 h). Station-bootstrap 90 % CI of the MAE gain.
Usage: python synop_backfill_test.py [synop jsonl]"""
import sys, json, collections
import numpy as np
F = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/NIGRAAN/nig/station-lake/archive/synop/synop_2026-10.jsonl'
WINDOW_D, MIN_N = 10, 4
R = collections.defaultdict(dict)
for l in open(F):
    r = json.loads(l)
    if r.get('t_c') is None or r.get('served_c') is None: continue
    R[r['sid']][np.datetime64(r['t'][:19])] = r['t_c'] - r['served_c']
def model(rec, now):
    ts = sorted(t for t in rec if t <= now and (now - t) <= np.timedelta64(WINDOW_D, 'D'))
    if not ts: return None
    byh = collections.defaultdict(list)
    for t in ts: byh[int(str(t)[11:13])].append(rec[t])
    qc = {h: (np.median(v), max(8, 4 * 1.4826 * np.median(np.abs(np.array(v) - np.median(v))))) for h, v in byh.items()}
    ok = [t for t in ts if abs(rec[t] - qc[int(str(t)[11:13])][0]) <= qc[int(str(t)[11:13])][1]]
    hod = {}
    for h in (0, 3, 6, 9, 12, 15, 18, 21):
        v = [rec[t] for t in ok if int(str(t)[11:13]) == h]; hod[h] = float(np.mean(v)) if len(v) >= MIN_N else None
    last = ok[-1] if ok else None
    if last is None or last != now: return None
    hl = int(str(last)[11:13]); anom = None if hod.get(hl) is None else rec[last] - hod[hl]
    return hod, anom
import os
FORM = os.environ.get("ABACK", "step3")   # step3: 0.6 to 3 h, linear to 0 at 6 h (served) | lin6: 0.6 x (1 - h / 6)
def aback(dt_h):
    if FORM == "lin6": return 0.6 * max(0.0, 1 - dt_h / 6)
    return 0.6 if dt_h <= 3 else (0.0 if dt_h >= 6 else 0.6 * (6 - dt_h) / 3)
KEYS = [(k, w) for k in (3, 6) for w in ('all', 'w1 1-8 Oct', 'w2 9-16 Oct')]
out = {kw: collections.defaultdict(lambda: [0.0, 0.0, 0]) for kw in KEYS}
for sid, rec in R.items():
    for t in sorted(rec):
        m = model(rec, t)
        if not m or m[1] is None: continue
        hod, anom = m
        for k in (3, 6):
            tp = t - np.timedelta64(k, 'h')
            if tp not in rec: continue
            hp = int(str(tp)[11:13]); b = hod.get(hp)
            if b is None: continue
            r = rec[tp]; e_a = abs(r - b); e_b = abs(r - (b + aback(k) * anom))
            for w in ('all', 'w1 1-8 Oct' if str(tp)[:10] <= '2026-10-08' else 'w2 9-16 Oct'):
                o = out[(k, w)][sid]; o[0] += e_a; o[1] += e_b; o[2] += 1
rng = np.random.default_rng(0)
for k, w in KEYS:
    S = np.array([v for v in out[(k, w)].values() if v[2]]); a, b, n = S[:, 0], S[:, 1], S[:, 2]
    g = (a.sum() - b.sum()) / n.sum(); idx = rng.integers(0, len(S), (2000, len(S))); bs = (a[idx].sum(1) - b[idx].sum(1)) / n[idx].sum(1)
    print(f'{k} h before the latest report [{w}]: n={int(n.sum())} stations={len(S)} MAE bias-only {a.sum()/n.sum():.3f} -> with anomaly {b.sum()/n.sum():.3f} C, gain {g:+.3f} (90 % CI {np.quantile(bs,.05):+.3f} .. {np.quantile(bs,.95):+.3f})')
    if '41516' in out[(k, w)]: x = out[(k, w)]['41516']; print(f'   Gilgit 41516: n={x[2]} MAE {x[0]/x[2]:.3f} -> {x[1]/x[2]:.3f}')
