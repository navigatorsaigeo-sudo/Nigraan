
(function(G){
  'use strict';
  var D=G.document;
  function go(){ var w=D.getElementById('mpMapWrap'); if(!w||!w.closest('[data-view="overview"]')) return false; var t=w.querySelector(':scope > .maptools'), a=D.getElementById('alertBtn');
    if(!t) return !!D.getElementById('agnMapBar84');
    var bar=D.getElementById('agnMapBar84'); if(!bar){ bar=D.createElement('div'); bar.id='agnMapBar84'; w.insertBefore(bar,w.firstChild); }
    bar.appendChild(t); var sk=D.getElementById('agnSkipMap'); if(sk) bar.insertBefore(sk,t); var ck=D.getElementById('agnCheckChip'); if(ck&&ck.parentElement===w) bar.appendChild(ck); if(a&&a.parentElement===w) bar.appendChild(a); w.classList.add('agn-mb84');
    setTimeout(function(){ try{ G.map&&G.map.invalidateSize&&G.map.invalidateSize(); }catch(_){} },50); return true; }
  (function tryGo(k){ if(!go()&&k<120) setTimeout(function(){ tryGo(k+1); },1000); })(0);
  

  (function keep(k){ var l=D.getElementById('v3legend'); if(!l){ if(k<120) setTimeout(function(){ keep(k+1); },1000); return; }
    var fix=function(){ var w=D.getElementById('mpMapWrap'); if(w&&w.classList.contains('agn-mb84')&&l.classList.contains('agn-leg-compact')) l.classList.remove('agn-leg-compact'); };
    fix(); new MutationObserver(fix).observe(l,{attributes:true,attributeFilter:['class']}); })(0);
})(window);
