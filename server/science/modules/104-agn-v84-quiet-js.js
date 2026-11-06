
(function(G){
  'use strict';
  

  var D=G.document;
  function isOp(){ try{ return !!(G.AGN&&G.AGN.operator&&G.AGN.operator()); }catch(_){ return false; } }
  function quiet(n){ if(!n) return; var t=n.textContent||''; if(!isOp()&&/^\s*Saved, but not fully attributable/.test(t)){ n.style.setProperty('display','none','important'); }
    else n.style.removeProperty('display'); }
  (function watch(k){ var n=D.getElementById('agnWriteRefusal'); if(!n){ if(k<600) setTimeout(function(){ watch(k+1); },1000); return; }
    quiet(n); new MutationObserver(function(){ quiet(n); }).observe(n,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']}); })(0);
  (function(f){ setInterval(f,10000); document.addEventListener('agn:dom',f); })(function(){ quiet(D.getElementById('agnWriteRefusal')); });    
})(window);
