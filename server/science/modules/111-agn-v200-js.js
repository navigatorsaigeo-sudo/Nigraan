
(function(){
  'use strict';
  var W=window, D=document;
  var OFFICES=[
    { id:'isb', name:'AGN office · Islamabad (I-8)', lat:33.66467, lon:73.08307, station:'MACH 1, on the office roof' },
    { id:'gil', name:'AGN office · Gilgit', lat:35.901151, lon:74.369656, station:'MACH 105, on the office roof' }
  ];
  function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function pkt(t){ return t ? String(t).slice(11,16)+' PKT' : ''; }
  function body(o, j){
    var n=j&&j.now, v=(n&&n.tempC!=null)? W.AGN.pointState.fmt(n.tempC)+' °C' : (j===undefined ? 'Reading…' : 'Data not available');
    var rng=(n&&n.lo90!=null&&n.hi90!=null)? 'likely range '+n.lo90.toFixed(1)+' to '+n.hi90.toFixed(1)+' °C' : '';
    return '<div class="agn200-pop"><h5>'+esc(o.name)+'</h5>'
      +'<div class="s">Air temperature now, 2 m above ground'+(n&&n.time?' · '+esc(pkt(n.time)):'')+'</div>'
      +'<div class="v">'+esc(v)+'</div>'+(rng?'<div class="s">'+esc(rng)+'</div>':'')
      +'<div class="s" style="margin-top:6px">Station: '+esc(o.station)+'</div></div>';
  }
  function add(){
    var map=W.map, L=W.L; if(!map||!L||typeof map.addLayer!=='function') return false;
    try{ if(!map.getPane('agn200')){ var p=map.createPane('agn200'); p.style.zIndex=640; } }catch(_){}
    OFFICES.forEach(function(o){
      var m=L.marker([o.lat,o.lon],{pane:'agn200',keyboard:true,title:o.name,zIndexOffset:1500,
        icon:L.divIcon({className:'',html:'<div class="agn200-pin"><b>AGN</b></div>',iconSize:[32,32],iconAnchor:[16,32],popupAnchor:[0,-30]})});
      m.bindTooltip(o.name,{direction:'top',offset:[0,-22]});
      var C={ at:0, p:null };    
      function read(){ if(C.p && Date.now()-C.at<600e3) return C.p; C.at=Date.now();
        C.p=W.AGN.pointState.pf(o.lat,o.lon).then(function(j){ return j&&j.ok?j:null; }).catch(function(){ return null; })   /* v91.17.283.12: the point state */
          .then(function(j){ if(!j) C.at=0; return j; });
        return C.p; }
      m.bindPopup(body(o,undefined));
      m.on('popupopen',function(){ read().then(function(j){ try{ m.setPopupContent(body(o,j)); }catch(_){} }); });
      setTimeout(read, 8000);
      m.addTo(map);
    });
    W.AGN=W.AGN||{}; W.AGN.offices=OFFICES;
    return true;
  }
  var tries=0; (function wait(){ if(add()) return; if(++tries<120) setTimeout(wait,500); })();
})();
