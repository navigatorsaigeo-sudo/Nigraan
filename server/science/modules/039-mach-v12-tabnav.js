
(function(){
  function show(view){
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.dataset.view===view));
    document.querySelectorAll('#machNav button').forEach(b=>{
      const on=b.dataset.goto===view; b.classList.toggle('active',on); b.setAttribute('aria-selected', on?'true':'false');
    });
    
    if(view==='overview'){
      try{ if(window.map){ setTimeout(function(){ if(window.agnInvalidateMap) window.agnInvalidateMap(); else window.map.invalidateSize({animate:false}); },40); } }catch(e){}
      
      
      try{ var _p=document.getElementById('mapHazardPick');
        if(_p && typeof setPanelAccentFromHazard==='function'){ setPanelAccentFromHazard(_p.value); } }catch(e){}
    }
    if(view==='__sectors_merged'){
      try{ if(window.MACH_V10 && window.MACH_V10.renderSectorHeatmap) window.MACH_V10.renderSectorHeatmap('sectorHeatMap'); }catch(e){}
    }
    try{ document.dispatchEvent(new CustomEvent('agn:view',{detail:{view:view}})); }catch(e){}
    window.scrollTo(0,0);
    
  }
  function init(){
    var nav=document.getElementById('machNav'); if(!nav) return setTimeout(init,300);
    nav.addEventListener('click',function(e){ var b=e.target.closest('button[data-goto]'); if(b) show(b.dataset.goto); });
    
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded',init);
})();
