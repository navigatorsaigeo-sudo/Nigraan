/* v91.17.60 · thermal.mjs against ECMWF thermofeel 2.3.0 on random cases: python3 writes the reference, this compares.
   Usage: node scripts/thermal-verify.mjs  (needs python3 with thermofeel for the reference file; otherwise compares to the stored one) */
import { wbgtLiljegren, utci, meanRadiantTemperature, windSpeed2m } from '../server/api/thermal.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
const ref = '/tmp/claude-0/thermal_ref.json';
if (!existsSync(ref)) execSync(`python3 - <<'PY'
import json, numpy as np, thermofeel as tf
from thermofeel.liljegren import wbgt as lwbgt, wind_speed_2m, solve_globe, solve_wetbulb
rng=np.random.default_rng(1); n=2000
t=rng.uniform(-5,48,n); rh=rng.uniform(5,100,n); p=rng.uniform(700,1030,n); v=rng.uniform(0.2,15,n); ssrd=rng.uniform(0,1050,n); fdir=rng.uniform(0,1,n); cz=rng.uniform(-0.2,1,n)
sp=wind_speed_2m(np.maximum(v,0.62),cz,ssrd)
w=lwbgt(t+273.15,rh,p,sp,ssrd,fdir,cz)-273.15
mrt=rng.uniform(-20,70,n)+t
u=tf.calculate_utci(t+273.15, np.clip(v,0.5,17), mrt+273.15, ehPa=rh/100*tf.calculate_saturation_vapour_pressure(t+273.15))-273.15
json.dump(dict(t=t.tolist(),rh=rh.tolist(),p=p.tolist(),v=v.tolist(),ssrd=ssrd.tolist(),fdir=fdir.tolist(),cz=cz.tolist(),sp=sp.tolist(),wbgt=[None if np.isnan(x) else x for x in w],mrt=mrt.tolist(),utci=u.tolist()),open('${ref}','w'))
PY`);
const R = JSON.parse(readFileSync(ref, 'utf8')); let maxW = 0, maxU = 0, maxS = 0, nW = 0, nanBoth = 0, nanMismatch = 0;
for (let i = 0; i < R.t.length; i++) {
  const s = windSpeed2m(Math.max(R.v[i], 0.62), R.cz[i], R.ssrd[i]); maxS = Math.max(maxS, Math.abs(s - R.sp[i]));
  const w = wbgtLiljegren(R.t[i], R.rh[i], R.p[i], R.v[i], R.ssrd[i], R.fdir[i], R.cz[i]).wbgt;
  if (R.wbgt[i] == null && w == null) nanBoth++; else if (R.wbgt[i] == null || w == null) nanMismatch++; else { maxW = Math.max(maxW, Math.abs(w - R.wbgt[i])); nW++; }
  const uu = utci(R.t[i], R.mrt[i], R.v[i], R.rh[i]); if (!uu.outsideValidity) maxU = Math.max(maxU, Math.abs(uu.utci - R.utci[i]));
}
console.log(JSON.stringify({ cases: R.t.length, wbgt: { compared: nW, maxAbsDiffC: +maxW.toFixed(3), nanBoth, nanMismatch }, utci: { maxAbsDiffC: +maxU.toFixed(3) }, wind2m: { maxAbsDiffMs: +maxS.toFixed(4) } }));
if (maxW > 0.06 || maxU > 0.06 || nanMismatch > 2) { console.error('THERMAL VERIFY FAILED'); process.exit(1); }
