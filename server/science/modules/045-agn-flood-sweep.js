


(function(){
  'use strict';

  const GAUGES = (typeof PK_RIVER_GAUGES!=='undefined') ? PK_RIVER_GAUGES : [];
  const STATE={loaded:false, running:false, at:null, rows:[], byDistrict:{}, coveredDistricts:{}};
  window.AGN_FLOOD=STATE;

   
  function ratio(q, gauge){
    if(typeof riverRatio!=='function' || typeof riverClimFor!=='function')
      return {r:0, level:'no-reference', basis:'reference climatology unavailable', covered:false};
    const rr=riverRatio(q, riverClimFor(gauge));
    return {r:rr.ratio, level:rr.level, basis:rr.basis, covered:rr.covered,
            pctOfBankfull:rr.pctOfBankfull};
  }

  

  let __gaugeBatch=null;
  async function gaugeAll(list){
    if(__gaugeBatch) return __gaugeBatch;
    

    /* v91.17.283.15 · the server's river-flow record of the gauge reaches (GET /api/pointstate/product name=riverflow) */
    __gaugeBatch=(async()=>{
      const r=await AGN.api.product('riverflow',{latitude:list.map(g=>g.lat).join(','), longitude:list.map(g=>g.lon).join(','), daily:'river_discharge', forecast_days:AGN_FLOOD_POLICY.operationalDays, timezone:'Asia/Karachi'}); if(!r.ok) throw new Error('HTTP '+r.status);
      let j=await r.json(); if(!Array.isArray(j)) j=[j];
      const m={}; list.forEach((g,i)=>{ m[g.name]=(j[i]&&j[i].daily)||{}; });
      return m;
    })();
    return __gaugeBatch;
  }
  async function one(g, all){
    const d=(all&&all[g.name])||{};
    const q=(d.river_discharge||[])[0];
    
    let peak=q, peakDay=0;
    (d.river_discharge||[]).forEach(function(v,i){ if(v!=null&&(peak==null||v>peak)){ peak=v; peakDay=i; } });
    const now=ratio(q,g), fut=ratio(peak,g);
    return {gauge:g.name, districts:g.districts, q:q,
            peak:peak, peakDay:peakDay, ratio:now.r, peakRatio:fut.r,
            level:now.level, peakLevel:fut.level, covered:fut.covered,
            pctOfBankfull:fut.pctOfBankfull,
            rp2:g.rp2, rp5:g.rp5, rp20:g.rp20, obsMax:g.obsMax, refYears:g.yrs,
            basis:fut.basis};
  }

  async function sweep(onProgress){
    if(STATE.running) return STATE;
    STATE.running=true; STATE.rows=[]; STATE.byDistrict={}; STATE.coveredDistricts={};
    let __all=null;
    try{ __all=await gaugeAll(GAUGES); }
    catch(e){ STATE.running=false; STATE.error=String(e.message||e); return STATE; }
    for(let i=0;i<GAUGES.length;i++){
      if(onProgress) onProgress(i+1, GAUGES.length, GAUGES[i].name);
      try{
        const row=await one(GAUGES[i], __all);
        STATE.rows.push(row);
        
        row.districts.forEach(function(dn){
          STATE.coveredDistricts[dn]=true;
          const prev=STATE.byDistrict[dn];
          if(!prev || row.peakRatio>prev.peakRatio) STATE.byDistrict[dn]=row;
        });
      }catch(e){
        STATE.rows.push({gauge:GAUGES[i].name, districts:GAUGES[i].districts, error:String(e.message||e)});
      }
    }
    STATE.loaded=true; STATE.running=false; STATE.at=Date.now();
    try{ document.dispatchEvent(new CustomEvent('agn:flood',{detail:{rows:STATE.rows.length}})); }catch(_){}
    return STATE;
  }

  

  function forDistrict(name){
    if(!name) return null;
    if(!STATE.loaded) return null;
    const r=STATE.byDistrict[name];
    if(!r) return {covered:false, ratio:0, peakRatio:0, gauge:null, level:'not-covered',
                   basis:'no global river-flow model gauge upstream — river state unknown, not normal'};
    return {ratio:r.ratio, peakRatio:r.peakRatio, gauge:r.gauge, covered:true,
            q:r.q, peak:r.peak, peakDay:r.peakDay, basis:r.basis,
            pctOfBankfull:r.pctOfBankfull, rp2:r.rp2, rp5:r.rp5, rp20:r.rp20,
            refYears:r.refYears, level:r.peakLevel};
  }

  STATE.sweep=sweep; STATE.forDistrict=forDistrict; STATE.gauges=GAUGES;
})();
