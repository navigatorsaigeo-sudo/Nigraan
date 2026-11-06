"""v91.17.283.10 . AGENT 5 (diagnostic) . the replay step reader.
Reads the outputs of the chain replay tooling (scripts/replay/chain_replay_s2.mjs and its bias-trace copies: one JSON line per point,
target day and lead, with the hourly temperature of the target day (UTC hours 0-23) after each stage of the served chain) and a daily
truth table, and writes one line per station-day with the night minimum and day maximum after every step, beside the observed ones.

The steps (the replay's own modes; chain_replay_s2.mjs correctResponse flags):
  raw       best_match, from the run started from best_match ('raw' of the best_match run)
  start     the served start ('raw' of the run started from the multi-model mix: the blend where the gate mixes it, else best_match)
  calibration + the static calibration (mode 'nonatwx': no national model, no weather MOS)
  national  + the national residual model (mode 'nowx': national model, no weather MOS)
  final     + the weather MOS (mode 'full': the served chain without the live layers)
Night minimum and day maximum use the bias trace's windows (t4.py): the minimum over UTC hours 0-4 (05-09 PKT, where the PMD minimum
is read) and the maximum over UTC hours 3-14 (08-19 PKT); a day is kept only when every step has the window (at most one hour missing
in the night window, two in the day window), as in t4.py. The windows are read from the source file when it names them.

Truth 'daily_tntx': a table (parquet or csv) of station, var (tmin / tmax), date, value; station names are normalised (letters only,
upper case) and mapped to replay pids by the source's map (prefix entries allowed with a trailing '*'); several rows of one station and
day are averaged (t4.py).

Reads only. No network. usage: python diagnose_replay.py --source <source.json> --out <rows.jsonl>"""
import argparse, json, math, os, re, sys


def norm(s):
    return re.sub(r'[^A-Z]', '', str(s).upper())


def load_rows(path):
    out = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue
            out[(r.get('pid'), r.get('day'), r.get('L'))] = r
    return out


def win(a, lo, hi, maxmiss, fn):
    if not isinstance(a, list) or len(a) < hi:
        return None
    w = [x for x in a[lo:hi] if x is not None and not (isinstance(x, float) and math.isnan(x))]
    if (hi - lo) - len(w) > maxmiss or not w:
        return None
    return fn(w)


def truth_table(T, base):
    f = T['file'] if os.path.isabs(T['file']) else os.path.join(base, T['file'])
    if f.endswith('.parquet'):
        import pandas as pd
        D = pd.read_parquet(f)
        recs = D.to_dict('records')
    else:
        import csv
        with open(f, encoding='utf-8') as fh:
            recs = list(csv.DictReader(fh))
    sc, vc, dc, xc = T.get('station_col', 'station'), T.get('var_col', 'var'), T.get('date_col', 'date'), T.get('value_col', 'value')
    exact = {norm(k): v for k, v in T['map'].items() if not k.endswith('*')}
    pref = [(norm(k[:-1]), v) for k, v in T['map'].items() if k.endswith('*')]
    acc = {}
    for r in recs:
        var = str(r.get(vc, '')).lower()
        if var not in ('tmin', 'tmax'):
            continue
        k = norm(r.get(sc))
        pid = exact.get(k)
        if pid is None:
            for p, v in pref:
                if k.startswith(p):
                    pid = v
                    break
        if pid is None:
            continue
        try:
            val = float(r.get(xc))
        except Exception:
            continue
        if math.isnan(val):
            continue
        d = str(r.get(dc))[:10]
        a = acc.setdefault((pid, d, var), [0.0, 0])
        a[0] += val
        a[1] += 1
    return {k: v[0] / v[1] for k, v in acc.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    S = json.load(open(a.source, encoding='utf-8'))
    base = os.path.dirname(os.path.abspath(a.source))
    p = lambda x: x if os.path.isabs(x) else os.path.join(base, x)
    RB = load_rows(p(S['runs']['served']))
    RR = load_rows(p(S['runs']['best_match']))
    pts = {}
    if S.get('points'):
        import csv
        with open(p(S['points']), encoding='utf-8') as fh:
            for r in csv.DictReader(fh):
                try:
                    pts[r['pid']] = {'lat': float(r['lat']), 'lon': float(r['lon']), 'elev': float(r['elev']) if r.get('elev') not in (None, '') else None, 'net': r.get('net')}
                except Exception:
                    pass
    TR = truth_table(S['truth'], base)
    W = S.get('windows') or {}
    tn = W.get('tn_utc', [0, 5])
    tx = W.get('tx_utc', [3, 15])
    STEP = [('raw', RR, 'raw'), ('start', RB, 'raw'), ('calibration', RB, 'nonatwx'), ('national', RB, 'nowx'), ('final', RB, 'full')]
    n_out = 0
    with open(a.out, 'w', encoding='utf-8') as fo:
        for key, rb in sorted(RB.items(), key=lambda kv: (str(kv[0][0]), str(kv[0][1]))):
            pid, day, L = key
            if key not in RR:
                continue
            rec = {'pid': pid, 'net': rb.get('net'), 'zone': rb.get('zone'), 'day': day, 'L': L, 'source': S.get('name')}
            if pid in pts:
                rec.update({'lat': pts[pid]['lat'], 'lon': pts[pid]['lon'], 'elev': pts[pid]['elev']})
            okd = True
            for var, (lo, hi), miss, fn, tv in (('TN', tn, 1, min, 'tmin'), ('TX', tx, 2, max, 'tmax')):
                o = TR.get((pid, day, tv))
                vals = {}
                for name, src, field in STEP:
                    v = win(src[key].get(field), lo, hi, miss, fn)
                    if v is None:
                        okd = False
                        break
                    vals[name] = round(v, 2)
                if not okd:
                    break
                if o is not None:
                    rec[var] = vals
                    rec.setdefault('obs', {})[var] = round(o, 2)
            if not okd or 'obs' not in rec:
                continue
            fo.write(json.dumps(rec) + '\n')
            n_out += 1
    print(json.dumps({'rows': n_out, 'servedRows': len(RB), 'bestMatchRows': len(RR), 'truthKeys': len(TR)}))


if __name__ == '__main__':
    main()
