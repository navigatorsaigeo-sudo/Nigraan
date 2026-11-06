"""v91.17.283 WS2 item 8 · derivation of the shielded / stuck outdoor-sensor rule (server/api/shieldscreen.mjs, data/station-shield-rule.json)
from the LAMHA copy of the MACH database (read only).
usage: python3 -I derive_shield.py [folder with obs_YYYYMMDD.csv] [data/mach-fleet-stations.json] [out.json]
A station is judged over a daylight window (sun elevation >= ARRAY_RULE.ELEV_DEG for every reading, WINDOW_MIN long):
  flat     its temperature range in the window
  dark     its mean solar / the median of the mean solar of its K nearest solar-reporting stations in the same window
  calm     every wind and gust reading exactly 0 (or absent)
The reference population: registered, not excluded stations with a solar sensor, minus the station under judgement (Khaplu) and minus
the stations whose share of windows with less than half their neighbours' sun is above the 95th percentile of station shares (as ARRAY_RULE).
Fences: the 1st percentile (Q) of the reference windows for flat range and for the dark ratio (a station must sit below both, and be calm,
to be marked). WINDOW_MIN 120 and K 3 are the analysis choices (stated, not fitted)."""
import csv, glob, json, math, sys, collections
from datetime import datetime
DB = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/LAMHA/data/mach/db'
REG = sys.argv[2] if len(sys.argv) > 2 else 'data/mach-fleet-stations.json'
OUT = sys.argv[3] if len(sys.argv) > 3 else None
ELEV_DEG, WINDOW_MIN, K = 10, 120, 3
reg = {x['key']: x for x in json.load(open(REG))['stations'] if x.get('lat') is not None}
excl = {k for k, x in reg.items() if x.get('exclude')} | {'khaplu'}
def elev(lat, lon, ms):
    d = datetime.fromtimestamp(tz=__import__('datetime').timezone.utc, timestamp=ms / 1000); n = d.timetuple().tm_yday; h = d.hour + d.minute / 60 + d.second / 3600
    g = 2 * math.pi / 365 * (n - 1 + (h - 12) / 24)
    dec = 0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g)
    eq = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    ha = math.radians((h * 60 + eq + 4 * lon) / 4 - 180); la = math.radians(lat)
    return math.degrees(math.asin(max(-1, min(1, math.sin(la) * math.sin(dec) + math.cos(la) * math.cos(dec) * math.cos(ha)))))
def f(v):
    try: return float(v)
    except Exception: return None
def km(a, b, c, d):
    p = math.pi / 180; x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2; return 12742 * math.asin(math.sqrt(x))
def pct(a, q):
    a = sorted(a); i = (len(a) - 1) * q; lo = math.floor(i); hi = math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo)
data = collections.defaultdict(dict); files = sorted(glob.glob(DB + '/obs_202610*.csv'))
for fn in files:
    for r in csv.DictReader(open(fn)):
        k = r['stationKey']
        if k not in reg or r['source'] == 'qm': continue
        ms = datetime.fromisoformat(r['time'].replace('Z', '+00:00')).timestamp() * 1000
        data[k][ms] = (f(r['temperatureC']), f(r['solarWm2']), f(r['windSpeedKmh']), f(r['windGustKmh']))
solarSt = [k for k in data if any(v[1] and v[1] > 0 for v in data[k].values())]
near = {k: sorted([o for o in solarSt if o != k and o not in excl], key=lambda o: km(reg[k]['lat'], reg[k]['lon'], reg[o]['lat'], reg[o]['lon']))[:K] for k in solarSt}
W = WINDOW_MIN * 60e3
def windows(k):
    """non-overlapping daylight windows of WINDOW_MIN aligned to the clock: (start, readings)"""
    b = collections.defaultdict(list)
    for ms, v in data[k].items():
        if v[0] is None or v[1] is None: continue
        if elev(reg[k]['lat'], reg[k]['lon'], ms) < ELEV_DEG: continue
        b[int(ms // W)].append(v)
    return {s: v for s, v in b.items() if len(v) >= 6}
WIN = {k: windows(k) for k in solarSt}
def judge(k):
    out = []
    for s, v in WIN[k].items():
        T = [x[0] for x in v]; S = sum(x[1] for x in v) / len(v); calm = all(not (x[2] or 0) > 0 and not (x[3] or 0) > 0 for x in v)
        nb = [sum(x[1] for x in WIN[o][s]) / len(WIN[o][s]) for o in near[k] if s in WIN[o]]
        if len(nb) < 2: continue
        nm = sorted(nb)[len(nb) // 2] if len(nb) % 2 else (sorted(nb)[len(nb) // 2 - 1] + sorted(nb)[len(nb) // 2]) / 2
        if nm <= 0: continue
        out.append({'range': max(T) - min(T), 'ratio': S / nm, 'calm': calm, 'nbSolar': nm, 's': S, 'start': s})
    return out
J = {k: judge(k) for k in solarSt if k not in excl}
# as ARRAY_RULE: the stations whose share of low-sun windows (ratio below half the neighbours') is above the 95th percentile of the station
# shares are the population under test, not the reference
share = {k: (sum(1 for w in ws if w['ratio'] < 0.5) / len(ws)) for k, ws in J.items() if ws}
cut = pct(list(share.values()), 0.95)
under = sorted(k for k, v in share.items() if v > cut)
ref = [w for k, ws in J.items() if k not in under for w in ws]
Q = 0.01
FLAT = pct([w['range'] for w in ref], Q); DARK = pct([w['ratio'] for w in ref], Q)
marked_ref = sum(1 for w in ref if w['range'] <= FLAT and w['ratio'] <= DARK and w['calm'])
kh = judge('khaplu') if 'khaplu' in WIN else []
marked_kh = [w for w in kh if w['range'] <= FLAT and w['ratio'] <= DARK and w['calm']]
res = {'version': 'shield-91.17.283', 'built': datetime.now(__import__('datetime').timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
  'rule': {'ELEV_DEG': ELEV_DEG, 'WINDOW_MIN': WINDOW_MIN, 'K': K, 'MIN_READINGS': 6, 'MIN_NEIGHBOURS': 2, 'FLAT_RANGE_C': round(FLAT, 3), 'DARK_RATIO': round(DARK, 4), 'Q': Q},
  'underTest': under, 'source': 'LAMHA copy of the MACH database ' + (files[0][-12:-4] + '-' + files[-1][-12:-4] if files else '') + ': ' + str(len([k for k in solarSt if k not in excl]) - len(under)) + ' registered, not excluded stations with a solar sensor (Khaplu never in the reference), ' + str(len(ref)) + ' daylight windows of ' + str(WINDOW_MIN) + ' min',
  'derivation': 'FLAT_RANGE_C and DARK_RATIO are the 1st percentiles (Q) of the reference windows (temperature range; station mean solar / median mean solar of its K nearest solar stations). A station is marked when one window is flat AND dark AND calm (wind and gust exactly 0).',
  'check': {'referenceWindowsMarked': marked_ref, 'referenceWindows': len(ref), 'khapluWindows': len(kh), 'khapluMarked': len(marked_kh),
            'khapluMarkedStartsUtc': [datetime.fromtimestamp(tz=__import__('datetime').timezone.utc, timestamp=w['start'] * W / 1000).strftime('%Y-%m-%dT%H:%MZ') for w in marked_kh][:40]}}
print(json.dumps(res, indent=1))
if OUT: json.dump(res, open(OUT, 'w'), indent=1)
if '--explore' in sys.argv:
    for q in (0.001, 0.005, 0.01, 0.02, 0.05, 0.1): print(q, round(pct([w['range'] for w in ref], q), 3), round(pct([w['ratio'] for w in ref], q), 4))
    per = collections.defaultdict(list)
    for k in solarSt:
        if k in excl: continue
        for w in judge(k): per[k].append(w)
    for k, ws in per.items():
        lowr = sum(1 for w in ws if w['ratio'] < 0.05); flat = sum(1 for w in ws if w['range'] < 0.5)
        if lowr or flat: print(k, len(ws), 'dark', lowr, 'flat', flat, 'calm', sum(w['calm'] for w in ws))
    for w in kh: print('kh', datetime.fromtimestamp(tz=__import__('datetime').timezone.utc, timestamp=w['start'] * W / 1000).strftime('%m-%dT%H'), round(w['range'], 2), round(w['ratio'], 4), w['calm'], round(w['nbSolar']), round(w['s'], 1))
