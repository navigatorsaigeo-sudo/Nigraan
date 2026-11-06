


(function(){
  function boot(){
    if(!window.AGN||!AGN.sector||typeof AI_SECTOR_HAZARDS==='undefined') return setTimeout(boot,300);
    var sel=document.getElementById('aiSectorSel');
    var start=(sel&&sel.value)||'agriculture';
    AGN.sector.set(start,'init');
    document.querySelectorAll('[data-agn-sector-badge]').forEach(function(el){
      el.textContent=AGN.sector.label();
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
