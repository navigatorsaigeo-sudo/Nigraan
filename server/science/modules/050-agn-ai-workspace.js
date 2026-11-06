(function(){
  'use strict';
  window.AGN=window.AGN||{};
  var aiAdapter=AGN.adapters&&AGN.adapters.require('aiLegacy');
  var contracts=AGN.dataServices&&AGN.dataServices.require('contracts');
  var aiLocal=(AGN.sectionState)?AGN.sectionState.state('airisk',{workspace:'analyst',selectedHazard:'flood',leadHours:24,cascade:{}}):{workspace:'analyst'};
  function activate(name){
    if(name!=='analyst'&&!(AGN.operator&&AGN.operator())) name='analyst';
    aiLocal.workspace=name;
    var tabs=document.getElementById('aiWorkspaceTabs');if(!tabs)return;
    [].forEach.call(tabs.querySelectorAll('[data-ai-workspace]'),function(btn){var on=btn.getAttribute('data-ai-workspace')===name;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',on?'true':'false');});
    [].forEach.call(document.querySelectorAll('[data-ai-workspace-pane]'),function(pane){pane.classList.toggle('active',pane.getAttribute('data-ai-workspace-pane')===name);});
    

    try{ var _q=document.getElementById('aiQuantSection'); if(_q) _q.style.display=(name==='analyst')?'':'none'; }catch(_){}
    try{if(name==='predictions')setTimeout(function(){aiAdapter.render();},40);}catch(_){}
  }
  function boot(){
    var tabs=document.getElementById('aiWorkspaceTabs');if(!tabs)return setTimeout(boot,300);
    tabs.addEventListener('click',function(e){var btn=e.target.closest('[data-ai-workspace]');if(btn)activate(btn.getAttribute('data-ai-workspace'));});
    activate(aiLocal.workspace||'analyst');
    document.addEventListener('agn:operator',function(e){ if(!(e&&e.detail&&e.detail.operator)) activate('analyst'); });
  }
  if(AGN.implementations)AGN.implementations.define('airisk',{
    refresh:function(){try{aiAdapter.render();}catch(_){}},
    activateWorkspace:activate,
    getState:function(){contracts.apiPayload({schema:'airisk-state',data:{workspace:aiLocal.workspace,lead:aiLocal.lead}},{section:'airisk',boundary:'getState'});return {workspace:aiLocal.workspace,selectedHazard:aiLocal.selectedHazard,leadHours:aiLocal.leadHours,cascade:aiLocal.cascade||{}};}
  },{source:'modules/ai/53-agn-ai-workspace.js',owner:'airisk',moduleType:'isolated-section-implementation',dependencies:['data:contracts','adapter:aiLegacy'],globalDependencies:[],compatibilityGlobals:[]});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
