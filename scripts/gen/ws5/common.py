"""WS5 v283 shared helpers: Wilson and block-bootstrap intervals, contingency scores."""
import numpy as np
from math import sqrt
def wilson(k, n, z=1.96):
    if n == 0: return (float('nan'), float('nan'))
    p = k / n; d = 1 + z*z/n; c = (p + z*z/(2*n)) / d; h = z*sqrt(p*(1-p)/n + z*z/(4*n*n)) / d
    return (round(c-h, 3), round(c+h, 3))
def table(fc, ob):
    fc = np.asarray(fc, bool); ob = np.asarray(ob, bool)
    a = int((fc & ob).sum()); b = int((fc & ~ob).sum()); c = int((~fc & ob).sum()); d = int((~fc & ~ob).sum())
    return a, b, c, d
def scores(fc, ob):
    a, b, c, d = table(fc, ob); n = a+b+c+d
    pod = a/(a+c) if a+c else float('nan'); far = b/(a+b) if a+b else float('nan'); pofd = b/(b+d) if b+d else float('nan')
    pss = pod - pofd if (a+c and b+d) else float('nan')
    ar = (a+b)*(a+c)/n if n else 0
    ets = (a-ar)/(a+b+c-ar) if (a+b+c-ar) else float('nan')
    return dict(hits=a, false_alarms=b, misses=c, correct_neg=d, pod=pod, far=far, pofd=pofd, pss=pss, ets=ets)
def block_boot(groups, fn, nb=2000, seed=7):
    """resample whole blocks (e.g. weeks) with replacement; fn(idx)->float"""
    rng = np.random.default_rng(seed); keys = np.unique(groups); idx = {k: np.where(groups == k)[0] for k in keys}
    out = []
    for _ in range(nb):
        pick = rng.choice(keys, len(keys), replace=True); ii = np.concatenate([idx[k] for k in pick])
        v = fn(ii)
        if v == v: out.append(v)
    if not out: return (float('nan'), float('nan'))
    return (round(float(np.percentile(out, 2.5)), 3), round(float(np.percentile(out, 97.5)), 3))
