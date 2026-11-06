


(function(){
  function ymd(d){return d.toISOString().slice(0,10);}
  function pickPoints(){
    var byId={}; (window.STATIONS||[]).forEach(function(s){byId[s.id]=s;});
    var pts=[]; ['isb','khi'].forEach(function(id){ if(byId[id]) pts.push(byId[id]); });
    var mtn=(window.STATIONS||[]).slice().sort(function(a,b){return (b.elev||0)-(a.elev||0);})[0];
    if(mtn && pts.indexOf(mtn)<0) pts.push(mtn);
    if(pts.length<3) (window.STATIONS||[]).slice(0,3).forEach(function(s){ if(pts.indexOf(s)<0) pts.push(s); });
    return pts.slice(0,3);
  }
  async function machVerify(){
    var pts=pickPoints();
    var models=(window.MM_MODELS||[]).filter(function(m){return m.provider!=='metno';}).map(function(m){return m.key;});
    var end=ymd(new Date(Date.now()-7*864e5)), start=ymd(new Date(Date.now()-37*864e5));
    var acc={}; models.forEach(function(m){acc[m]={se:0,ae:0,bias:0,n:0};});
    for(var i=0;i<pts.length;i++){
      var pt=pts[i];
      var a,f;   /* v91.17.283.15 · the server's records of the place: the reanalysis (archive) and the past forecasts (histfc) */
      try{ var rr=await Promise.all([AGN.api.product('archive',{latitude:pt.lat, longitude:pt.lon, start_date:start, end_date:end, hourly:'temperature_2m', models:'era5', timezone:'auto'}),
        AGN.api.product('histfc',{latitude:pt.lat, longitude:pt.lon, start_date:start, end_date:end, hourly:'temperature_2m', models:models.join(','), timezone:'auto'})]); a=await rr[0].json(); f=await rr[1].json(); }catch(err){ continue; }
      var truth=(a.hourly&&a.hourly.temperature_2m)||[];
      models.forEach(function(m){
        var pred=(f.hourly&&f.hourly['temperature_2m_'+m])||null; if(!pred) return;
        var N=Math.min(truth.length,pred.length);
        for(var k=0;k<N;k++){ var tv=truth[k],pv=pred[k]; if(tv==null||pv==null) continue; var er=pv-tv; acc[m].se+=er*er; acc[m].ae+=Math.abs(er); acc[m].bias+=er; acc[m].n++; }
      });
    }
    var rows=models.map(function(m){var o=acc[m]; if(o.n<24) return null; return {key:m,mae:o.ae/o.n,rmse:Math.sqrt(o.se/o.n),bias:o.bias/o.n,n:o.n};}).filter(Boolean).sort(function(a,b){return a.rmse-b.rmse;});
    return {verification_id:'AGN-VD-'+Date.now(),created_at:new Date().toISOString(),diagnostic_type:'archive_vs_reanalysis_uncontrolled_cycle',variable:'temperature_2m',reference:'global reanalysis',cycle_controlled:false,lead_controlled:false,rows:rows,pts:pts.map(function(p){return p.name;}),start:start,end:end};
  }
  function modelName(k){ var m=(window.MM_MODELS||[]).find(function(x){return x.key===k;}); return m?m.name:k; }
  function buildCard(){
    var host=document.querySelector('#mmSection .mm-card'); if(!host||document.getElementById('mverifyCard')) return;
    var card=document.createElement('div'); card.id='mverifyCard';
    card.style.cssText='margin-top:16px;padding:16px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.6)';
    card.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'
      +'<div><h4 style="margin:0;font-size:0.875rem;font-weight:850;color:var(--navy)">Archive agreement diagnostic</h4>'
      +'<div style="font-size:0.75rem;color:var(--muted);margin-top:3px">2 m temperature · archived forecast fields versus global reanalysis · initialization and lead not controlled</div></div>'
      +'<div style="display:flex;gap:7px;flex-wrap:wrap"><button id="mverifyRun" style="font-size:0.75rem;font-weight:800;border:1px solid var(--sea);color:#fff;background:var(--sea);border-radius:999px;padding:7px 14px;cursor:pointer">Run diagnostic</button><button id="mverifyExport" disabled style="font-size:0.75rem;font-weight:800;border:1px solid var(--line);color:var(--navy);background:#fff;border-radius:999px;padding:7px 14px;cursor:pointer">Export JSON</button><button data-backend-key="modelab" style="font-size:0.75rem;font-weight:800;border:1px solid var(--sand);color:#8a4b08;background:#fff8ed;border-radius:999px;padding:7px 14px;cursor:pointer">Verified skill service</button></div></div>'
      +'<div id="mverifyOut" style="margin-top:12px"></div>'
      +'<div style="font-size:0.75rem;color:var(--muted);margin-top:10px;line-height:1.5">Archive comparison against global reanalysis, not station gauges. Forecast initialization and lead are uncontrolled, so the table is a consistency diagnostic, not verified forecast skill. It never changes live model values or ranking.</div>';
    host.appendChild(card);
    document.getElementById('mverifyRun').addEventListener('click',runVerify);document.getElementById('mverifyExport').addEventListener('click',function(){var x=window.AGN_LAST_VERIFICATION;if(!x)return;var b=new Blob([JSON.stringify(x,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='AI-GEO-NIGRAAN_Archive-Diagnostic_'+x.verification_id+'_v'+((window.AGN_BUILD||{}).version||'unknown')+'.json';a.click();setTimeout(function(){URL.revokeObjectURL(u);},500);});
  }
  async function runVerify(){
    var btn=document.getElementById('mverifyRun'), out=document.getElementById('mverifyOut');
    btn.disabled=true; var old=btn.textContent; btn.textContent='running\u2026';
    out.innerHTML='<div style="font-size:0.75rem;color:var(--muted)">Fetching archived forecasts and global reanalysis\u2026</div>';
    try{
      var res=await machVerify();
      if(!res.rows.length){ out.innerHTML='<div style="font-size:0.75rem;color:var(--sand)">No overlapping data returned.</div>'; return; }
      var h='<table style="width:100%;border-collapse:collapse;font-size:0.78125rem"><thead><tr style="text-align:left;color:var(--muted);font-size:0.75rem;text-transform:uppercase;letter-spacing:.04em">'
        +'<th style="padding:6px 4px">Model</th><th style="padding:6px 4px">MAE \u00b0C</th><th style="padding:6px 4px">RMSE \u00b0C</th><th style="padding:6px 4px">Bias \u00b0C</th></tr></thead><tbody>';
      res.rows.forEach(function(r,i){ h+='<tr style="border-top:1px solid var(--line)">'
        +'<td style="padding:7px 4px;font-weight:'+(i===0?'800':'600')+'">'+(i===0?'\u2605 ':'')+modelName(r.key)+'</td>'
        +'<td style="padding:7px 4px">'+r.mae.toFixed(2)+'</td>'
        +'<td style="padding:7px 4px;font-weight:700">'+r.rmse.toFixed(2)+'</td>'
        +'<td style="padding:7px 4px;color:'+(Math.abs(r.bias)>1.5?'var(--sand)':'var(--muted)')+'">'+(r.bias>=0?'+':'')+r.bias.toFixed(2)+'</td></tr>'; });
      h+='</tbody></table><div style="font-size:0.75rem;color:var(--muted);margin-top:8px">'+res.rows[0].n+' hourly pairs/site \u00b7 sites: '+res.pts.join(', ')+' \u00b7 '+res.start+' to '+res.end+' \u00b7 lowest RMSE in this test: '+modelName(res.rows[0].key)+' · archive diagnostic only · forecast cycle and lead not controlled · never applied to the live comparison</div>';
      out.innerHTML=h; window.AGN_LAST_VERIFICATION=res; var ex=document.getElementById('mverifyExport');if(ex)ex.disabled=false;
      var st=document.getElementById('mmStatus'); if(st) st.textContent='archive diagnostic loaded';
      var dot=document.getElementById('mmDot'); if(dot){ dot.classList.remove('mock'); dot.style.background='var(--sea)'; }
    }catch(e){ out.innerHTML='<div style="font-size:0.75rem;color:var(--sand)">Verification failed: '+e.message+'</div>'; }
    finally{ btn.disabled=false; btn.textContent=old; }
  }
  window.machVerify=machVerify;
  if(document.readyState!=='loading') setTimeout(buildCard,700);
  else document.addEventListener('DOMContentLoaded',function(){ setTimeout(buildCard,700); });
})();
