
(function(){
  'use strict';
  var D=document;
  

  function reserve(n){ var L=D.getElementById('mpLeft'), R=D.getElementById('mpRight'), Li=D.getElementById('mpLeftIn'), Ri=D.getElementById('mpRightIn');
    if(!L||!R||!Li||!Ri){ if(n<80) setTimeout(function(){ reserve(n+1); },100); return; }
    if(window.innerWidth<1100||L.classList.contains('open')) return;
    var w='<div class="agn195-wait"><b>Loading the selected place</b>The forecast for this place is arriving.<i></i><i style="width:70%"></i><i style="width:85%"></i></div>';
    if(!Li.firstChild) Li.innerHTML=w; if(!Ri.firstChild) Ri.innerHTML=w;
    L.classList.add('open'); R.classList.add('open'); }
  reserve(0);
   
})();
