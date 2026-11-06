"""Copied 13 Oct 2026 from D:\\DATA LAKE\\synop\\decode.py (read only source); unchanged below.
Decode FM-12 SYNOP (AAXX) reports from Ogimet CSV lines into hourly records.
Section 1: iRixhVV Nddff (00fff) 1sTTT 2sTdTdTd 3PPPP 4PPPP 5appp 6RRRt 7wwWW 8NhCLCMCH; section 333: 1sTxTxTx 2sTnTnTn ...
Wind unit from YYGGiw: iw 0/1 = m/s, 3/4 = knots. Temperatures in 0.1 C with sign digit (0 +, 1 -). RRR code 990 = trace, 991-999 = 0.1-0.9 mm.
tR (6RRRt): 1 = 6 h, 2 = 12 h, 3 = 18 h, 4 = 24 h, 5 = 1 h, 6 = 2 h, 7 = 3 h, 8 = 9 h, 9 = 15 h."""
import re, json, sys, glob
TR = {'1': 6, '2': 12, '3': 18, '4': 24, '5': 1, '6': 2, '7': 3, '8': 9, '9': 15}
def t10(g):
    if not re.fullmatch(r'[01]\d{3}', g): return None
    v = int(g[1:]) / 10; return -v if g[0] == '1' else v
def decode(line):
    p = line.strip().split(',', 6)
    if len(p) < 7 or 'AAXX' not in p[6]: return None
    sid = p[0]; ts = '%s-%s-%sT%s:%s' % tuple(p[1:6]); body = p[6].replace('=', '').split()
    try: i = body.index('AAXX')
    except ValueError: return None
    g = body[i + 1:]
    if len(g) < 4: return None
    yyggi = g[0]; iw = yyggi[4] if len(yyggi) == 5 else '/'
    kt = iw in '34'
    rec = {'sid': sid, 't': ts}
    s1, s3 = [], []
    rest = g[2:]
    if '333' in rest: k = rest.index('333'); s1, s3 = rest[:k], rest[k + 1:]
    else: s1 = rest
    for stop in ('555', '444', '222'):
        if stop in s1: s1 = s1[:s1.index(stop)]
        if stop in s3: s3 = s3[:s3.index(stop)]
    if not s1: return rec
    ir = s1[0][0] if len(s1[0]) == 5 else '/'
    rec['ir'] = ir
    if len(s1) > 1 and re.fullmatch(r'\d{5}|\d/{4}|/\d{4}', s1[1] or ''):
        nddff = s1[1]
        try:
            dd = int(nddff[1:3]); ff = int(nddff[3:5])
            if dd <= 36 or dd == 99:
                rec['wdir'] = dd * 10 if dd not in (0, 99) else (0 if dd == 0 else None); spd = ff * (0.514444 if kt else 1.0)
                rec['wspd'] = round(spd, 1)
        except ValueError: pass
    j = 2
    if len(s1) > 2 and s1[2].startswith('00'): j = 3   # fff > 99
    seen = set()
    for grp in s1[j:]:
        if len(grp) != 5: continue
        c = grp[0]
        if c in seen: continue
        seen.add(c)
        if c == '1': rec['t_c'] = t10(grp[1:])
        elif c == '2' and grp[1] in '01': rec['td_c'] = t10(grp[1:])
        elif c == '3' and grp[1:].isdigit(): v = int(grp[1:]) / 10; rec['p_stn'] = v + 1000 if v < 100 else v
        elif c == '4' and grp[1:].isdigit(): v = int(grp[1:]) / 10; rec['p_msl'] = v + 1000 if v < 100 else v
        elif c == '6' and ir in '01' and grp[1:4].isdigit():
            r = int(grp[1:4]); mm = 0.0 if r == 990 else (r - 990) / 10 if r > 990 else float(r)
            rec['rain_mm'] = mm; rec['rain_h'] = TR.get(grp[4])
        elif c == '6' and ir == '3': rec['rain_mm'] = 0.0; rec['rain_h'] = None   # 3 = no precipitation (group omitted normally)
    for grp in s3:
        if len(grp) != 5: continue
        if grp[0] == '1' and grp[1] in '01': rec['tmax_c'] = t10(grp[1:])
        elif grp[0] == '2' and grp[1] in '01': rec['tmin_c'] = t10(grp[1:])
    return rec
if __name__ == '__main__':
    out = {}
    for f in sorted(glob.glob(sys.argv[1])):
        for line in open(f, errors='ignore'):
            r = decode(line)
            if r: out[(r['sid'], r['t'])] = r
    json.dump(list(out.values()), open(sys.argv[2], 'w'))
    print(len(out), 'reports')
