


(function(){
  'use strict';
  var D=document;
  var SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-75 -40 120 80" width="48" height="32" role="img" aria-label="Flag of Pakistan"><title>Pakistan</title>'
    +'<rect x="-75" y="-40" width="120" height="80" fill="#fff"/><rect x="-45" y="-40" width="90" height="80" fill="#01411C"/>'
    +'<circle r="24" fill="#fff"/><circle cx="6.13" cy="-5.45" r="22" fill="#01411C"/>'
    +'<polygon fill="#fff" points="17.94,-15.94 15.00,-10.93 18.86,-6.59 13.18,-7.83 10.25,-2.82 9.67,-8.60 4.00,-9.84 9.32,-12.17 8.75,-17.96 12.61,-13.61"/></svg>';
  function put(k){ var sp=D.querySelector('header.topbar > .spacer');
    if(!sp){ if((k||0)<40) setTimeout(function(){ put((k||0)+1); },250); return; }
    if(D.getElementById('agnPkFlag')) return;
    var f=D.createElement('span'); f.id='agnPkFlag'; f.innerHTML=SVG; sp.classList.add('agn-has-flag'); sp.appendChild(f); }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',function(){ put(0); }); else put(0);
})();
