


(function(){
  'use strict';
  var D=document, G=window, until=0, tries=0, T=0;
  function act(){ try{ return (G.AGN&&G.AGN.project&&G.AGN.project.activeAsset)?G.AGN.project.activeAsset():null; }catch(_){ return null; } }
  function loc(){ try{ return (G.AGN&&G.AGN.flow&&G.AGN.flow.location)?G.AGN.flow.location():null; }catch(_){ return null; } }
  function check(){ T=0; if(Date.now()>until) return;
    var a=act(), l=loc(); if(!a) return; var lat=Number(a.latitude), lon=Number(a.longitude); if(!isFinite(lat)||!isFinite(lon)) return;
    var off=!l || l.lat==null || Math.abs(Number(l.lat)-lat)>0.01 || Math.abs(Number(l.lon)-lon)>0.01;
    if(off && tries<3 && typeof G.driveFromPoint==='function'){ tries++; try{ G.driveFromPoint(lat, lon, String(a.name||a.asset_name||a.asset_id||'asset'), false); }catch(_){} }
    T=setTimeout(check, 2000); }
  function arm(){ until=Date.now()+15000; tries=0; if(T) clearTimeout(T); T=setTimeout(check, 2500); }
  ['agn:active-asset','agn:project'].forEach(function(ev){ D.addEventListener(ev, arm); });
})();
