#!/usr/bin/env python3
"""v91.17.244 · put data/geo/boundaries-topo.json (scripts/gen/topo_boundaries.py) into the base page's agn-geo block: geometry only;
every feature keeps its own properties and id (tehsils matched by uid, provinces by name)."""
import json, os
APP = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = f'{APP}/build/base/AI_GEO_NIGRAAN_v91_17_BASE80.html'; T = json.load(open(f'{APP}/data/geo/boundaries-topo.json'))
lines = open(B).read().split('\n'); k = next(i for i, l in enumerate(lines) if l.startswith('<script id="agn-geo" type="application/json">'))
l = lines[k]; a = l.index('>') + 1; b = l.rindex('</script>'); G = json.loads(l[a:b])
by = {f['properties']['uid']: f['geometry'] for f in T['PK_DISTRICTS']['features']}
for f in G['PK_DISTRICTS']['features']: f['geometry'] = by[f['properties']['uid']]
bp = {f['properties']['province']: f['geometry'] for f in T['PK_PROVINCES']['features']}
for f in G['PK_PROVINCES']['features']: f['geometry'] = bp[f['properties']['province']]
G['PK_NATIONAL']['features'][0]['geometry'] = T['PK_NATIONAL']['features'][0]['geometry']
js = json.dumps(G, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
lines[k] = l[:a] + js + l[b:]; open(B, 'w').write('\n'.join(lines)); print('agn-geo', len(l[a:b]) // 1024, '->', len(js) // 1024, 'KB')
