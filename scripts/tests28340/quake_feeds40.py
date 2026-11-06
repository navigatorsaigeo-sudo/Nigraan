"""v91.17.283.40 item 31b: the LIVE earthquake feed verified on its own (separately from the building-code reference map).
Re-runnable. Rules fixed before looking at the results:
  sources   USGS ComCat fdsnws (the served primary), EMSC seismicportal fdsnws (the served second source, since 283.31),
            GFZ GEOFON fdsnws (independent check only, not served). IRIS fdsnws-event: retired (HTTP 404 "This service has been retired"),
            GeoNet (New Zealand) and JMA (Japan) catalogues do not cover Pakistan: not usable.
  window    the 12 months to the run time, M >= 4.0, the server's buffered Pakistan box (rule file region: box + 300 km).
  same      |origin time difference| <= 60 s and epicentre distance <= 100 km (the server merge rule, quake.mjs SAME_S / SAME_KM);
            a wider probe (<= 60 s, <= 400 km) lists pairs the merge rule would split into two events (a duplicate on the map).
  agreement per pair: magnitude difference, epicentre distance, depth difference, time difference; medians and 90th percentiles.
  PASS (feed fit to serve beside the reference map): >= 90 % of USGS events M >= 4.5 found in EMSC and in GEOFON by the merge rule;
            median |dM| <= 0.3; median distance <= 25 km; and no event M >= 5 split into two by the merge rule.
  latency   from the laptop's live state (data/cache/quake/state.json): firstSeen - origin time for events first seen by a live poll
            (events back-filled when a source was added are excluded: firstSeen more than 7 days after origin).
usage: python -I quake_feeds40.py <usgs.geojson> <emsc.json> <geofon.txt> [<state.json>] [out.json]"""
import sys, json, math, datetime as dt, statistics as st

SAME_S, SAME_KM, PROBE_KM = 60, 100, 400


def km(a, b):
    p1, p2 = math.radians(a['lat']), math.radians(b['lat']); dp, dl = p2 - p1, math.radians(b['lon'] - a['lon'])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2; return 2 * 6371.0088 * math.asin(min(1, math.sqrt(h)))


def t_of(s):
    s = s.replace('Z', '')
    for f in ('%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S'):
        try: return dt.datetime.strptime(s, f).replace(tzinfo=dt.timezone.utc).timestamp()
        except ValueError: pass
    raise ValueError(s)


def usgs(f):
    out = []
    for x in json.load(open(f))['features']:
        p, g = x['properties'], x['geometry']['coordinates']
        if p.get('type') != 'earthquake' or p.get('mag') is None: continue
        out.append({'id': x['id'], 't': p['time'] / 1000, 'mag': p['mag'], 'mt': p.get('magType'), 'lon': g[0], 'lat': g[1], 'dep': g[2], 'place': p.get('place')})
    return out


def emsc(f):
    out = []
    for x in json.load(open(f))['features']:
        p = x['properties']
        if p.get('mag') is None: continue
        out.append({'id': p.get('unid'), 't': t_of(p['time']), 'mag': p['mag'], 'mt': p.get('magtype'), 'lon': p['lon'], 'lat': p['lat'], 'dep': p.get('depth'), 'auth': p.get('auth'), 'place': p.get('flynn_region')})
    return out


def geofon(f):
    out = []
    for l in open(f):
        if l.startswith('#') or not l.strip(): continue
        c = l.rstrip('\n').split('|')
        if c[13] and c[13] != 'earthquake': continue
        out.append({'id': c[0], 't': t_of(c[1]), 'lat': float(c[2]), 'lon': float(c[3]), 'dep': float(c[4]) if c[4] else None, 'mt': c[9], 'mag': float(c[10]), 'place': c[12]})
    return out


def pair(A, B, maxkm):
    used, P = set(), []
    for a in sorted(A, key=lambda e: -e['mag']):
        best = None
        for j, b in enumerate(B):
            if j in used or abs(a['t'] - b['t']) > SAME_S: continue
            d = km(a, b)
            if d <= maxkm and (best is None or d < best[1]): best = (j, d)
        if best: used.add(best[0]); b = B[best[0]]; P.append((a, b, best[1]))
    return P


def q(v, p):
    v = sorted(v); return None if not v else round(v[min(len(v) - 1, int(round(p * (len(v) - 1))))], 2)


def stats(P):
    dm = [abs(a['mag'] - b['mag']) for a, b, _ in P]; dk = [d for _, _, d in P]; ds = [abs(a['t'] - b['t']) for a, b, _ in P]
    dz = [abs(a['dep'] - b['dep']) for a, b, _ in P if a['dep'] is not None and b['dep'] is not None]
    return {'pairs': len(P), 'absMagDiff': {'median': q(dm, .5), 'p90': q(dm, .9), 'max': q(dm, 1)}, 'distanceKm': {'median': q(dk, .5), 'p90': q(dk, .9), 'max': q(dk, 1)},
            'timeDiffS': {'median': q(ds, .5), 'p90': q(ds, .9)}, 'depthDiffKm': {'median': q(dz, .5), 'p90': q(dz, .9)}}


def pkt(t): return (dt.datetime.fromtimestamp(t, dt.timezone.utc) + dt.timedelta(hours=5)).strftime('%Y-%m-%d %H:%M PKT')


def main(fu, fe, fg, fs=None, out=None):
    U, E, G = usgs(fu), emsc(fe), geofon(fg)
    J = {'built': 'v91.17.283.40', 'run': pkt(dt.datetime.now(dt.timezone.utc).timestamp()), 'counts': {'USGS': len(U), 'EMSC': len(E), 'GEOFON': len(G)},
         'rule': {'seconds': SAME_S, 'km': SAME_KM, 'probeKm': PROBE_KM}, 'pairs': {}, 'missing': {}, 'split': {}}
    ok = True
    for name, B in (('EMSC', E), ('GEOFON', G)):
        P = pair(U, B, SAME_KM); Pw = pair(U, B, PROBE_KM)
        J['pairs'][name] = stats(P)
        for th in (4.0, 4.5, 5.0):
            n = [a for a in U if a['mag'] >= th]; hit = {a['id'] for a, _, _ in P}
            J['pairs'][name]['foundShare_M' + str(th)] = round(sum(1 for a in n if a['id'] in hit) / len(n), 3) if n else None
        hit = {a['id'] for a, _, _ in P}
        J['missing'][name] = [{'usgs': a['id'], 'time': pkt(a['t']), 'mag': a['mag'], 'place': a['place']} for a in U if a['mag'] >= 4.5 and a['id'] not in hit]
        J['split'][name] = [{'usgs': a['id'], 'time': pkt(a['t']), 'magUSGS': a['mag'], 'mag2': b['mag'], 'km': round(d, 1), 'place': a['place'], 'authority2': b.get('auth')}
                            for a, b, d in Pw if d > SAME_KM]
        s = J['pairs'][name]
        ok &= (s['foundShare_M4.5'] or 0) >= 0.9 and s['absMagDiff']['median'] <= 0.3 and s['distanceKm']['median'] <= 25 and not any(x['magUSGS'] >= 5 for x in J['split'][name])
    # EMSC-only events (no USGS event within the merge rule), M >= 4.5: checked against GEOFON
    PE = pair(E, U, SAME_KM); eh = {b['id'] for b, _, _ in [(x[1], x[0], x[2]) for x in PE]}
    eo = [e for e in E if e['id'] not in {b['id'] for _, b, _ in pair(U, E, SAME_KM)} and e['mag'] >= 4.5]
    J['emscOnly'] = [{'emsc': e['id'], 'time': pkt(e['t']), 'mag': e['mag'], 'authority': e.get('auth'), 'place': e['place'], 'inGEOFON': bool(pair([e], G, SAME_KM))} for e in eo]
    if fs:
        S = json.load(open(fs)); lat = []
        for k in ('events', 'emsc'):
            for e in S.get(k, []):
                if e.get('firstSeen') and 0 <= e['firstSeen'] - e['time'] <= 7 * 864e5: lat.append({'source': 'USGS' if k == 'events' else 'EMSC', 'id': e.get('emscId') or e['id'], 'mag': e['mag'], 'minutes': round((e['firstSeen'] - e['time']) / 6e4, 1)})
        J['latency'] = {'events': lat, 'note': 'firstSeen is recorded from 283.31 on; older events and back-filled ones carry none', 'lastPollOk': pkt(S['lastPollOk'] / 1000) if S.get('lastPollOk') else None,
                        'emscOk': pkt(S['emscOk'] / 1000) if S.get('emscOk') else None, 'saved': S.get('saved')}
    J['pass'] = bool(ok)
    if out: json.dump(J, open(out, 'w'), indent=1)
    return J


if __name__ == '__main__':
    a = sys.argv[1:]; J = main(*a[:3], a[3] if len(a) > 3 else None, a[4] if len(a) > 4 else None)
    print(json.dumps({k: J[k] for k in ('counts', 'pairs')}, indent=1))
    for n in J['split']: print('split by merge rule', n, J['split'][n])
    for n in J['missing']: print('USGS M>=4.5 not found in', n, len(J['missing'][n]), J['missing'][n][:8])
    print('EMSC-only M>=4.5', J['emscOnly'])
    if 'latency' in J: print('latency', J['latency'])
    print('PASS' if J['pass'] else 'FAIL'); sys.exit(0 if J['pass'] else 1)
