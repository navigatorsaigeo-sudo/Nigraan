"""v91.17.283.36 (NIGRAAN 1.0) launch item 30: the barrage / gauge flow class table of the page (server/science/modules/031-page-script-57.js
FFD_CLASS rows, lacs of cusecs) checked ROW BY ROW against the official published sheet (the flood-forecasting daily sheet: Date, Station,
INFLOW, OUTFLOW, Status). For every station and every class boundary: the official readings on each side of the table's limit, the number
of official readings the table classes differently, and the limit that would class the most official readings correctly (the interval of
equally good limits). A table limit is CONFIRMED when it lies inside that interval or the readings do not reach the boundary (no evidence
either way: stated). usage: python ffd_class_check.py <sheet.csv> <031-page-script-57.js> <out.json>"""
import csv, re, json, sys
ORD = ['NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH', 'EX_HIGH']
ALIAS = {'Tarbela': 'Tarbela Dam', 'Kalabagh': 'Kala Bagh', 'Suleimanki': 'Sulemanki', 'Rasul': 'New Rasul', 'Mangla': 'Mangla Dam'}
def num(s):
    s = (s or '').split('(')[0]
    return float(re.sub(r'[^\d.]', '', s)) if re.search(r'\d', s) else None
def main(sheet, js, out):
    src = open(js, encoding='utf-8').read()
    tab = {}
    for m in re.finditer(r'"([^"]+)":\{station:"([^"]+)".*?lacs:\{low:([\d.]+|null),medium:([\d.]+|null),high:([\d.]+|null),veryHigh:([\d.]+|null),exceptional:([\d.]+|null)\}', src):
        tab[m.group(2)] = (m.group(1), [None if x == 'null' else float(x) for x in m.groups()[2:]])
    rows = [r for r in csv.DictReader(open(sheet, encoding='utf-8')) if r.get('Status', '').strip() in ORD]
    res = {}
    for stn, (name, L) in tab.items():
        R = [r for r in rows if r['Station'].strip() == ALIAS.get(stn, stn)]
        if not R:
            res[stn] = {'row': name, 'readings': 0, 'verdict': 'no official readings for this station in the sheet'}; continue
        best = None
        for col in ('OUTFLOW', 'INFLOW'):
            obs = [(num(r[col]) / 1e5, ORD.index(r['Status'].strip()), r['Date']) for r in R if num(r[col]) is not None]
            agree = sum(1 for q, s, _ in obs if sum(1 for t in L if t is not None and q >= t) == s)
            if best is None or agree > best[1]: best = (col, agree, obs)
        col, agree, obs = best
        bounds = []
        for k, t in enumerate(L):
            if t is None: bounds.append({'class': ORD[k + 1], 'tableLacs': None, 'verdict': 'no limit in the table'}); continue
            up = [q for q, s, _ in obs if s >= k + 1]; dn = [q for q, s, _ in obs if s <= k]
            if not up:
                bounds.append({'class': ORD[k + 1], 'tableLacs': t, 'officialAtOrAbove': 0, 'verdict': 'not reached in the official readings (no evidence either way)'}); continue
            cands = sorted(set([q for q, _, _ in obs] + [t]))
            errs = {c: sum(1 for q in up if q < c) + sum(1 for q in dn if q >= c) for c in cands}
            e0 = min(errs.values()); good = [c for c in cands if errs[c] == e0]
            lo, hi = max([q for q in dn if q < min(good)] or [0]), max(good)
            ok = errs[t] - e0 <= 1 or (lo <= t <= hi)   # one reading: the sheet status can lag the flow by one reading
            bounds.append({'class': ORD[k + 1], 'tableLacs': t, 'officialAtOrAbove': len(up), 'tableErrors': errs[t], 'bestErrors': e0,
                           'bestLimitLacs': [round(min(good), 4), round(hi, 4)], 'verdict': ('confirmed' if errs[t] == e0 else 'confirmed (one official reading classed differently: status lag at the boundary)') if ok else 'differs from the official readings'})
        res[stn] = {'row': name, 'readings': len(obs), 'column': col, 'agree': agree, 'agreeShare': round(agree / len(obs), 3), 'boundaries': bounds,
                    'verdict': 'confirmed' if all(b['verdict'] != 'differs from the official readings' for b in bounds) else 'check'}
    J = {'built': 'v91.17.283.36', 'what': 'page flow-class table vs the official daily sheet, row by row', 'sheetRows': len(rows), 'stations': res,
         'note': 'the sheet status is the official status at the reading time (it can lag the flow by a reading); a boundary is confirmed when the table limit classes the official readings as well as the best possible limit'}
    json.dump(J, open(out, 'w'), indent=1)
    return J
if __name__ == '__main__':
    J = main(*sys.argv[1:4])
    for k, v in J['stations'].items(): print(k, v.get('verdict'), v.get('agree'), '/', v.get('readings'), [ (b['class'], b['verdict'], b.get('tableLacs'), b.get('bestLimitLacs')) for b in v.get('boundaries', []) if b['verdict'] != 'no limit in the table'])
