/* v283.10 SP · served cloud-path curve-number runoff per tehsil (AGN.nss.score on the LCZ tehsil path, AMC II, no antecedent shift)
   for the drysponge S1 rain depths, on the page engine of a given artefact (node VM, offline).
   node nss_q.mjs <artefact.html> <rain_P.json> <out.json>
   Q is recomputed exactly from the score's own pieces (cover fractions, texture-interpolated NRCS CN, slope factor on S, built = P)
   and checked against score().stormRunoffMm (rounded 0.1 mm) on every unit. */
import { readFileSync, writeFileSync } from 'node:fs';
const [ART, RAIN, OUT] = process.argv.slice(2);
process.env.NIGRAAN_ENGINE_ARTEFACT = ART;
process.env.NIGRAAN_ENGINE_PORT = '1';   /* nothing listens: every network call fails fast */
const { ctx, vm } = await import('../../../flood273/pagevm.mjs');
await new Promise(r => setTimeout(r, 4000));
ctx.__RAIN = JSON.parse(readFileSync(RAIN, 'utf8'));
const res = vm.runInContext(`(function(){
  var R=__RAIN, out={}, bad=0, checked=0, worst=0, N=AGN.nss, C=N.config;
  function cnFromTexture(row, clay){ var cols=['A','B','C','D']; var p=Math.max(0,Math.min(1,(clay-10)/(45-10)))*(cols.length-1);
    var i=Math.min(cols.length-2,Math.floor(p)), f=p-i; var lo=row[cols[i]], hi=row[cols[i+1]]; return (lo==null||hi==null)?null:lo+(hi-lo)*f; }
  AGN.selfcheck.units().forEach(function(p){
    var key=p.key, uid=p.uid; if(!uid) return;
    var t=null; try{ t=hzTerrainFor(key,key); }catch(_){}
    var zone=(t&&t.zone)||'irrigated_plains', deg=(t&&t.slope!=null)?t.slope:0, slopePct=Math.tan(deg*Math.PI/180)*100;
    var dist=(typeof PK_KEY_TO_DISTRICT!=='undefined')?PK_KEY_TO_DISTRICT[key]:null;
    var s=N.score(key, dist, zone, slopePct, null, 100); if(!s||!s.ok){ out[uid]={ok:false, reason:s&&s.reason}; return; }
    var cov=N.coverFor(key, dist, zone), soil=AGN.soilWater.texture(dist), clay=soil?soil[0]:null, hsg=soil?soil[4]:(C.hsgProxy[zone]||'C');
    var F=N.fSlopeFor(slopePct);
    function Q(P){ var q=0; Object.keys(cov.fractions).forEach(function(k){ var a=cov.fractions[k]; if(!(a>0)) return; var row=C.cn2[k];
        var cn=(clay!=null?cnFromTexture(row,clay):null); if(cn==null) cn=row[hsg]; q+=a*((k==='built')?P:N.runoff(P,cn,null,F)); }); return q; }
    var chk=Math.abs(Q(100)-s.stormRunoffMm); checked++; if(chk>0.051) bad++; if(chk>worst) worst=chk;
    var o={ok:true, key:key, zone:zone, sealed:+(cov.fractions.built||0).toFixed(4), fractions:cov.fractions, R100:100-Q(100),
           S100:N.equivalentS(100,Q(100)), cnBaseline:s.cnBaseline, landCoverBasis:s.landCoverBasis, coverStatus:cov.status, fallback:!!cov.fallback};
    Object.keys(R).forEach(function(k){ var P=R[k][uid]; if(P==null||!isFinite(P)) return; o[k]=Q(P); });
    out[uid]=o; });
  return JSON.stringify({units:out, check:{checked:checked, offBy005:bad, worstMm:worst}});
})()`, ctx, { timeout: 600000 });
writeFileSync(OUT, res); const j = JSON.parse(res); console.log(OUT, Object.keys(j.units).length, 'units; check', JSON.stringify(j.check)); process.exit(0);
