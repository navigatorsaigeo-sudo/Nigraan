
(function(){
  'use strict';
  const input=document.getElementById('machPlaceInput');
  const menu=document.getElementById('machPlaceMenu');
  const note=document.getElementById('machPlaceNote');
  if(!input||!menu) return;

  const $=id=>document.getElementById(id);
  const setNote=(t)=>{ if(!note) return; if(t){ note.textContent=t; note.style.display='block'; } else { note.style.display='none'; } };
  const hideMenu=()=>{ menu.style.display='none'; menu.innerHTML=''; };

  
  
  
  
  

  
  

  
  /* v91.17.283.20 · B5: typing, its delay, the order of answers and the request are the shared place search's (/agn-place-search.js) */
  AGN.places.attach({input:input, limit:10, delay:300, keepDisputed:true, render:function(R,q,j){ renderMenu(R.map(AGN.places.hit), q); if(R.length&&j&&j.ambiguous&&j.ambiguityWhy) setNote(j.ambiguityWhy); },
    fail:function(){ hideMenu(); setNote('Search unavailable right now.'); }, clear:function(){ hideMenu(); setNote(''); }});
  const renderMenu=(hits,q,fromVariants)=>{
    if(!hits.length){
      hideMenu(); setNote('No Pakistan place found for “'+q+'”. Try a nearby town or check spelling.'); return; }
    setNote('');
    menu.innerHTML='';
    if(fromVariants){
      const h=document.createElement('div');
      h.textContent='Did you mean:';
      h.style.cssText='padding:6px 10px 2px;font-size:0.75rem;font-weight:800;color:var(--muted);font-family:Manrope';
      menu.appendChild(h);
    }
    hits.forEach(h=>{
      const row=document.createElement('button');
      row.type='button'; row.setAttribute('role','option');
      row.style.cssText='display:block;width:100%;text-align:left;border:0;background:transparent;padding:8px 10px;border-radius:9px;cursor:pointer;font-family:Manrope';
      row.onmouseenter=()=>row.style.background='rgba(12,56,81,.06)';
      row.onmouseleave=()=>row.style.background='transparent';
      const admin=[h.admin1,h.admin2].filter(Boolean).join(' · ');
      const elev=(h.elevation!=null)?Math.round(h.elevation)+' m':'elev n/a';
      
      const _esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      row.innerHTML='<div style="font-size:0.8125rem;font-weight:700;color:var(--navy)">'+_esc(h.name)+'</div>'
        +'<div style="font-size:0.75rem;color:var(--muted)">'+_esc(admin||'Pakistan')+' · '+_esc(elev)+'</div>';
      row.onclick=()=>pick(h);
      menu.appendChild(row);
    });
    menu.style.display='block';
  };

  
  const pick=async(h)=>{
    hideMenu();
    input.value=h.name;
    
    
    
    
    
    
    
    if(typeof window.driveFromPoint!=='function'){ setNote('Location engine not ready — reload and retry.'); return; }
    const elev=(h.elevation!=null)?Math.round(h.elevation)+' m':'elevation n/a';
    
    
    
    
    
    
    
    const gElev = (h.elevation!=null && isFinite(h.elevation)) ? Number(h.elevation)
                : (h.srtm3!=null   && isFinite(h.srtm3))   ? Number(h.srtm3)
                : (h.astergdem!=null && isFinite(h.astergdem)) ? Number(h.astergdem)
                : null;
    setNote('Loading live conditions for '+h.name+'…');
    try{
      window.__userAction=false;                 
      window.__machSearchDriving=true;            
      const rec=await window.driveFromPoint(h.latitude, h.longitude, h.name, true, gElev);
      window.__machSearchDriving=false;
      if(rec && rec.ok===false) throw new Error(rec.error||'conditions unavailable');
      
      
      var _src = h.__local
        ? ('AGN settlement index' + (h.admin2 ? ' · ' + h.admin2 + ' tehsil' : '')
           + (h.admin1 ? ', ' + h.admin1 : ''))
        : 'geocoder';
      note.innerHTML='Showing <b>'+String(h.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</b> · '+_src+' · '+elev
        +' &nbsp;<button id="machPlaceClear" style="border:0;background:rgba(12,56,81,.08);border-radius:8px;padding:2px 8px;font-size:0.75rem;font-weight:700;color:var(--navy);cursor:pointer;font-family:Manrope">Clear</button>'
        + (window.AGN&&AGN.renderTerrainPanel ? AGN.renderTerrainPanel(h.latitude,h.longitude) : '');
      note.style.display='block';
      const clr=$('machPlaceClear'); if(clr) clr.onclick=()=>{ input.value=''; setNote(''); if(typeof window.selectCity==='function'&&window.activeStationId&&window.activeStationId()) window.selectCity(window.activeStationId(),false); };
      
      
      try{ if(window.map && typeof window.map.flyTo==='function'){
        const z=Math.max((window.map.getZoom&&window.map.getZoom())||6, 10);
        window.map.flyTo([h.latitude,h.longitude], z, {duration:0.9});
      } }catch(_e){}
    }catch(e){
      window.__machSearchDriving=false;
      
      
      input.value='';
      setNote('Could not load live conditions for '+h.name+' (provider may be rate-limited). Location unchanged.');
      setTimeout(()=>setNote(''),4000);
    }
  };

  input.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ hideMenu(); input.blur(); } });
  document.addEventListener('click',(e)=>{ if(!e.target.closest('.mach-place-search')) hideMenu(); });
})();
