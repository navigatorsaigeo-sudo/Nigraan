


(function(){
  var lastTrigger=null;
  function openFor(btn){
    if(!btn) return;

    var _k=btn.getAttribute('data-help-key'), _opened=false;
    try{
      if(typeof window.openHelp==='function'){
        window.openHelp(_k);
        var _b=document.getElementById('workflowHelpBack');
        _opened=!!(_b && _b.classList.contains('open'));
      }
    }catch(_){}
    if(_opened){ lastTrigger=btn; btn.setAttribute('aria-expanded','true'); }
    else{
      btn.setAttribute('aria-expanded','false');
      try{ AGN.diagnostics.capture({module:'help-registry',
            error:new Error('no registry entry'),context:{helpKey:_k}}); }catch(_){}
    }
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('.nav-info-btn,.tab-info-btn');
    if(!b) return;
    e.preventDefault(); e.stopPropagation();   
    openFor(b);
  }, true);
  document.addEventListener('keydown',function(e){
    var b=e.target&&e.target.closest&&e.target.closest('.nav-info-btn,.tab-info-btn');
    if(b && (e.key==='Enter'||e.key===' '||e.key==='Spacebar')){
      e.preventDefault(); e.stopPropagation(); openFor(b); return;
    }
    if(e.key==='Escape'){
      

      try{ if(window.__agnCloseHelp) window.__agnCloseHelp(); }catch(_){}
      document.querySelectorAll('.nav-info-btn[aria-expanded="true"],.tab-info-btn[aria-expanded="true"]')
        .forEach(function(x){ x.setAttribute('aria-expanded','false'); });
      if(lastTrigger){ try{ lastTrigger.focus(); }catch(_){} lastTrigger=null; }
    }
  });
   
  document.addEventListener('agn:help-closed',function(){
    document.querySelectorAll('[aria-expanded="true"].nav-info-btn,[aria-expanded="true"].tab-info-btn')
      .forEach(function(x){ x.setAttribute('aria-expanded','false'); });
    if(lastTrigger){ try{ lastTrigger.focus(); }catch(_){} lastTrigger=null; }
  });
})();
