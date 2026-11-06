"""v91.17.275 HAZ2 · UTCI in shade, the page's own function (agnUtci, agnUtciEs, hzUtciInRange clamp) read from the served artefact."""
import os, re, math
import numpy as np
PAGE = os.environ.get('ARTEFACT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html')
_html = open(PAGE, encoding='utf-8').read()
_body = re.search(r'function agnUtci\(tdb, tr, v, rh\) \{.*?const u = (\(.*?\));\n', _html, re.S).group(1)
_g = [float(x) for x in re.search(r'function agnUtciEs\(ta\) \{ const g = \[([^\]]+)\]', _html).group(1).split(',')]
_EXPR = compile(_body, 'agnUtci', 'eval')
def _es(ta):
    tk = ta + 273.15; es = 2.7150305 * np.log(tk)
    for i, g in enumerate(_g): es = es + g * np.power(tk, i - 2)
    return np.exp(es) * 0.01
def utci(t, v, rh):
    t = np.asarray(t, float); v = np.maximum(0.5, np.nan_to_num(np.asarray(v, float), nan=0.5)); rh = np.asarray(rh, float)
    tc = np.clip(t, -49.9, 49.9); vc = np.clip(v, 0.5, 16.9)
    u = eval(_EXPR, {'tdb': tc, 'v': vc, 'pa': _es(tc) * (rh / 100) / 10, 'delta_t_tr': 0.0 * tc, 'Math': math})
    return np.round(u * 10) / 10
