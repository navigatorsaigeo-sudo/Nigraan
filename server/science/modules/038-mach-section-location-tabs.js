
(function(){
  'use strict';
  const SPANS=['ccLoc','aqLoc','aiCity','cfePlace'];   
  function stations(){ return (window.STATIONS||[]); }
  function activeId(){
    
    if(typeof window.activeStationId==='function'){ try{ const a=window.activeStationId(); if(a) return a; }catch(e){} }
    const first=document.getElementById('ccLoc'); const nm=first?first.textContent.trim():'';
    const s=stations().find(x=>x.name===nm); return s?s.id:(stations()[0]&&stations()[0].id);
  }
  function buildSelect(){
    const sel=document.createElement('select');
    sel.className='mach-loc-pick';
    sel.setAttribute('aria-label','Change location for all sections');
    sel.style.cssText='margin-left:8px;font-family:Manrope;font-size:0.75rem;font-weight:700;color:var(--navy);'
      +'border:1px solid var(--line);border-radius:9px;padding:3px 8px;background:rgba(255,255,255,.75);cursor:pointer;vertical-align:middle';
    stations().forEach(s=>{ const o=document.createElement('option'); o.value=s.id; o.textContent=s.name; sel.appendChild(o); });
    sel.addEventListener('change',()=>{
      if(typeof window.selectCity==='function'){ window.__userAction=true; window.selectCity(sel.value,true); }
      syncAll(); 
    });
    return sel;
  }
  function syncAll(){
    const id=activeId();
    document.querySelectorAll('select.mach-loc-pick').forEach(s=>{ if(s.value!==id) s.value=id; });
  }
  window.__machSyncLocTabs=syncAll;   
  function inject(){
    if(!stations().length) return false;
    SPANS.forEach(spanId=>{
      const span=document.getElementById(spanId); if(!span) return;
      
      if(span.nextElementSibling && span.nextElementSibling.classList && span.nextElementSibling.classList.contains('mach-loc-pick')) return;
      const sel=buildSelect();
      span.insertAdjacentElement('afterend', sel);
    });
    syncAll();
    return true;
  }
  
  function watch(){
    const base=window.selectCity;
    if(typeof base==='function' && !base.__locTabsWrapped){
      const wrapped=function(){
        
        
        
        
        
        
        const pin=document.getElementById('machPlaceInput'); if(pin && !window.__machSearchDriving) pin.value='';
        const r=base.apply(this,arguments); setTimeout(syncAll,0); return r;
      };
      wrapped.__locTabsWrapped=true; window.selectCity=wrapped;
    }
  }
  function start(){ if(inject()) watch(); else setTimeout(start,400); }  
  if(document.readyState!=='loading') setTimeout(start,600);
  else document.addEventListener('DOMContentLoaded',()=>setTimeout(start,600));
})();
