import json
S = json.load(open('/tmp/claude-0/v28310sp/srv/data/smog.json')); R = json.load(open('inv14oct_raw.json')); POOR = 2350
def inv(h, date, which):
    n = k = 0
    for i, t in enumerate(h['time']):
        if t[:10] != date or not (4 <= int(t[11:13]) <= 10): continue
        t2, t9 = h['temperature_2m'][i], h['temperature_925hPa'][i]
        if t2 is None or t9 is None: continue
        if which == 'icon' and h.get('surface_pressure') and h['surface_pressure'][i] is not None and h['surface_pressure'][i] <= 925: continue
        n += 1; k += (t9 - t2 >= 0)
    return k if n else None
def disp(vi, ih):
    if vi is None: return None
    d = 0 if vi >= 6000 else 1 if vi >= POOR else 2 if vi >= 1000 else 3
    return d + 1 if (ih is not None and ih >= 3 and d < 3) else d
def smog(cls, d): return (cls is not None and cls >= 3 and d is not None and d >= 2) if cls is not None else None
c = dict(n=0, served_vs_icon_disp=0, served_vs_icon_smog=0, histold_vs_icon_disp=0, histold_vs_icon_smog=0, served_vs_histold_disp=0, inv3_served=0, inv3_histold=0, inv3_icon=0, masked_hours_note='plains <500 m: ICON sp<=925 never expected')
for u, days in S['units'].items():
    if u not in R: continue
    for d in days:
        vi = d.get('afternoonVentilation')
        if vi is None: continue
        c['n'] += 1
        a = d.get('inversionHours'); o = inv(R[u]['bm'], d['date'], 'bm'); n = inv(R[u]['icon'], d['date'], 'icon')
        c['inv3_served'] += (a or 0) >= 3; c['inv3_histold'] += (o or 0) >= 3; c['inv3_icon'] += (n or 0) >= 3
        ds, do, dn = d['dispersion'], disp(vi, o), disp(vi, n)
        c['served_vs_icon_disp'] += ds != dn; c['histold_vs_icon_disp'] += do != dn; c['served_vs_histold_disp'] += ds != do
        cl = d.get('pmClass')
        c['served_vs_icon_smog'] += (d.get('smogDay') is not None) and d['smogDay'] != smog(cl, dn)
        c['histold_vs_icon_smog'] += smog(cl, do) != smog(cl, dn)
json.dump(c, open('inv14oct_eval.json', 'w'), indent=1); print(json.dumps(c, indent=1))
