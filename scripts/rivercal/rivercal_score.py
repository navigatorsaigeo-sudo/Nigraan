#!/usr/bin/env python3
"""score + gate the held-out pairs written by rivercal.py (see that file's header for the gate)"""
import os, sys, json
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rivercal import blocks_boot, served_shown, RR

OUT = os.environ.get('RIVERCAL_WORK') or os.path.dirname(os.path.abspath(__file__))
D = pd.read_csv(os.path.join(OUT, 'rivercal_heldout_days.csv.gz'), parse_dates=['date'])
V = sys.argv[1] if len(sys.argv) > 1 else ''
if V: D['cal'] = D['cal' + V]; D['lv_cal'] = D['lv_cal' + V]
D['lv_srv_f'] = D.lv_srv.fillna(0)            # a reach with no served level reads as no signal (Normal)
D['e_srv'] = (D.lv_srv_f - D.lv_obs).abs(); D['e_cal'] = (D.lv_cal - D.lv_obs).abs()
D['imp'] = D.e_srv - D.e_cal                   # > 0 = the calibrated level is closer to the gauge class
D['ae_raw'] = (D.raw - D.obs).abs(); D['ae_cal'] = (D.cal - D.obs).abs(); D['dmae'] = D.ae_raw - D.ae_cal
D['win'] = np.where(D.season < 2026, 1, 2)


def hit(pred, obs, k):
    ev = obs >= k; pr = pred >= k
    pod = (ev & pr).sum() / ev.sum() if ev.sum() else None
    far = (pr & ~ev).sum() / pr.sum() if pr.sum() else None
    return pod, far, int(ev.sum()), int(pr.sum())


def peak_err(R, col):
    out = []
    for s, g in R.groupby('season'):
        if len(g) < 60: continue
        out.append(abs((g.date[g[col].idxmax()] - g.date[g.obs.idxmax()]).days))
    return out


rows = []
for rid, R in D.groupby('reach'):
    R = R.reset_index(drop=True)
    w1 = R[R.win == 1]; w2 = R[R.win == 2]
    i1 = blocks_boot(w1.imp, w1.date); i2 = blocks_boot(w2.imp, w2.date)
    m1 = blocks_boot(w1.dmae, w1.date); m2 = blocks_boot(w2.dmae, w2.date)
    fl = R[R.cls_obs >= 2]; fd = blocks_boot(fl.imp, fl.date) if len(fl) else (None, None, None)
    # months worse beyond doubt
    worse = []
    for mo, g in R.groupby(R.date.dt.to_period('M')):
        if len(g) < 10: continue
        b = blocks_boot(g.imp, g.date, 1000)
        if b[2] is not None and b[2] < 0: worse.append(str(mo))
    pe_raw = peak_err(R, 'raw'); pe_cal = peak_err(R, 'cal')
    pod_s, far_s, nev, _ = hit(R.lv_srv_f.values, R.lv_obs.values, 2)
    pod_c, far_c, _, _ = hit(R.lv_cal.values, R.lv_obs.values, 2)
    pod_s1, far_s1, nev1, _ = hit(R.lv_srv_f.values, R.lv_obs.values, 1)
    pod_c1, far_c1, _, _ = hit(R.lv_cal.values, R.lv_obs.values, 1)
    ex_s = float((R.lv_srv_f == R.lv_obs).mean()); ex_c = float((R.lv_cal == R.lv_obs).mean())
    reasons = []
    if not (i1[1] is not None and i1[1] > 0): reasons.append('W1 lower bound <= 0')
    if not (i2[0] is not None and i2[0] >= 0): reasons.append('W2 mean < 0')
    if m1[2] is not None and m1[2] < 0: reasons.append('flow MAE worse W1')
    if m2[2] is not None and m2[2] < 0: reasons.append('flow MAE worse W2')
    if fd[2] is not None and fd[2] < 0: reasons.append('flood days worse')
    if worse: reasons.append('month worse: ' + ','.join(worse))
    if pe_cal and pe_raw and np.mean(pe_cal) > np.mean(pe_raw) + 1: reasons.append('peak timing worse')
    rows.append(dict(reach=rid, n=len(R), n_w2=len(w2), served_shown=served_shown(rid), lag=int(R.lag.median()),
                     exact_srv=round(ex_s, 3), exact_cal=round(ex_c, 3),
                     imp_w1=i1, imp_w2=i2, dmae_w1=m1, dmae_w2=m2, mae_raw=round(R.ae_raw.mean(), 1), mae_cal=round(R.ae_cal.mean(), 1),
                     flood_days=nev, imp_flood=fd, pod_srv=pod_s, far_srv=far_s, pod_cal=pod_c, far_cal=far_c,
                     low_days=nev1, pod1_srv=pod_s1, far1_srv=far_s1, pod1_cal=pod_c1, far1_cal=far_c1,
                     peak_raw=pe_raw, peak_cal=pe_cal, months_worse=worse, passes=not reasons, why=reasons))
json.dump(rows, open(os.path.join(OUT, 'rivercal_gate%s.json' % V), 'w'), indent=1, default=lambda x: None if x is None else float(x))
f = lambda t: '-' if t is None or t[0] is None else '%+.3f [%+.3f,%+.3f]' % t
g = lambda v: '-' if v is None else '%.2f' % v
print('| reach | days (2026) | lag | exact served -> cal | level-error gain W1 | W2 | flow MAE raw -> cal (kcs) | Medium+ days | POD/FAR served | POD/FAR cal | peak days raw/cal | gate |')
for r in rows:
    print('| %s | %d (%d) | %d | %.2f -> %.2f | %s | %s | %s -> %s | %d | %s/%s | %s/%s | %s / %s | %s |' % (
        r['reach'] + ('' if r['served_shown'] else '*'), r['n'], r['n_w2'], r['lag'], r['exact_srv'], r['exact_cal'], f(r['imp_w1']), f(r['imp_w2']),
        r['mae_raw'], r['mae_cal'], r['flood_days'], g(r['pod_srv']), g(r['far_srv']), g(r['pod_cal']), g(r['far_cal']),
        r['peak_raw'], r['peak_cal'], 'PASS' if r['passes'] else 'fail: ' + '; '.join(r['why'])))
