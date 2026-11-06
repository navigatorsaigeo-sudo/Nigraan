


(function (G) {
  'use strict';
  var D = G.document, AGN = G.AGN = G.AGN || {};
  var layer = null, SHOWN = false;

  function assets() {
    try {
      var p = AGN.project && AGN.project.state ? AGN.project.state() : null;
      return (p && Array.isArray(p.assets)) ? p.assets.filter(function (a) {
        return isFinite(Number(a.latitude)) && isFinite(Number(a.longitude));
      }) : [];
    } catch (_) { return []; }
  }
  function btn() { return D.getElementById('agnMyAssets'); }

  function clear() {
    try { if (layer && G.map) G.map.removeLayer(layer); } catch (_) {}
    layer = null; SHOWN = false;
  }

  function draw() {
    clear();
    var list = assets();
    if (!list.length || typeof G.L === 'undefined' || !G.map) return 0;
    layer = G.L.layerGroup();
    list.forEach(function (a) {
      var m = G.L.circleMarker([Number(a.latitude), Number(a.longitude)], {
        radius:7, weight:2, color:'#0C3851', fillColor:'#E6B655', fillOpacity:0.95,
        className:'agn-client-asset'
      });
      

      m.bindTooltip('Client asset · ' + (a.name || 'unnamed')
        + ' · ' + (a.asset_type || 'unclassified'),
        { direction:'top', opacity:0.95 });
      

      var _esc=function(x){ return String(x==null?'':x)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      var _isSample=(a.demo===true||a.origin==='demo'||a.origin==='sample');
      var _lim=(Array.isArray(a.limits)&&a.limits.length)?a.limits.length:0;
      var _popup=function(){
        var act=null;
        try{ act=(AGN.project&&AGN.project.activeAsset)?AGN.project.activeAsset():null; }catch(_){}
        var isActive=!!(act&&String(act.asset_id||'')===String(a.asset_id||''));
        return '<div style="font:400 12px/1.45 Manrope;max-width:270px;color:#0C3851">'
          +'<div style="font-weight:700;font-size:13px;margin-bottom:2px">'+_esc(a.name||'unnamed asset')+'</div>'
          +'<div style="color:#6b7a82;margin-bottom:6px">Client asset in the open project · not a NIGRAAN station</div>'
          +(_isSample?'<div style="background:#FBEFD2;border:1px solid #E6B655;border-radius:6px;padding:3px 6px;margin-bottom:6px;font-weight:700">Sample data — not client data</div>':'')
          +'<table style="border-collapse:collapse;width:100%">'
          +'<tr><td style="color:#6b7a82;padding:1px 8px 1px 0">Type</td><td>'+_esc(a.asset_type||'unclassified')+'</td></tr>'
          +'<tr><td style="color:#6b7a82;padding:1px 8px 1px 0">Industry</td><td>'+_esc(a.industry||'not recorded')
            +(a.subtype?(' · '+_esc(a.subtype)):'')+'</td></tr>'
          +'<tr><td style="color:#6b7a82;padding:1px 8px 1px 0">Recorded unit</td><td>'+_esc(a.unit||a.location||'not recorded')+'</td></tr>'
          +'<tr><td style="color:#6b7a82;padding:1px 8px 1px 0">Position</td><td>'
            +Number(a.latitude).toFixed(4)+', '+Number(a.longitude).toFixed(4)+'</td></tr>'

          +'<tr><td style="color:#6b7a82;padding:1px 8px 1px 0">Operating limits</td><td>'
            +(_lim?(_lim+' declared'):'none declared')+'</td></tr>'
          +'</table>'
          +'<div style="margin-top:7px;padding-top:6px;border-top:1px solid #dfe6ea;color:#6b7a82">'
          +(isActive
              ? 'This is the <b>active asset</b> — the AI panel and the assessment surfaces follow it.'
              : 'Click again to make this the active asset.')
          +'</div>'
          +'<div style="margin-top:5px;color:#6b7a82;font-size:11px">The district colouring under this '
          +'marker is a tehsil-centroid screening. It is not recomputed at these coordinates, so it '
          +'describes the unit, not the site.</div>'
          +'</div>';
      };
      m.bindPopup(_popup, { maxWidth:300, autoPan:true,
         
        autoPanPaddingTopLeft:[40,130], autoPanPaddingBottomRight:[40,50] });
      m.on('click', function(){
        try{ if(AGN.project&&AGN.project.setActiveAsset) AGN.project.setActiveAsset(a.asset_id||null); }catch(_){}
        try{ m.setPopupContent(_popup()); }catch(_){}
      });
      layer.addLayer(m);
    });
    layer.addTo(G.map);
    SHOWN = true;
    return list.length;
  }

  function label() {
    var b = btn(); if (!b) return;
    var n = assets().length;
    var span = b.querySelector('span');
    if (span) span.textContent = n ? ('My assets (' + n + ')') : 'My assets';
    b.disabled = !n;
    b.setAttribute('aria-pressed', SHOWN ? 'true' : 'false');
    b.classList.toggle('on', SHOWN);
    b.title = n
      ? ('Show the ' + n + ' asset' + (n === 1 ? '' : 's') + ' in the open client project on '
         + 'the map. They are drawn over the national screening fill; the fill is not '
         + 'recomputed for them.')
      : ('Show the assets in the open client project on the map. No client project is open, '
         + 'so there are no assets to show — load one in the Assets tab.');
  }

  function toggle() {
    if (!assets().length) return;
    if (SHOWN) clear(); else draw();
    label();
  }

  function onProject(e) {
    

    

    var _d = (e && e.detail) || {};
    var _reason = String(_d.reason || '');
    if (_reason === 'active-asset') { label(); return; }
    if (SHOWN && assets().length) { draw(); label(); return; }
    clear();
    label();
  }

  function wire() {
    var b = btn(); if (b) b.addEventListener('click', toggle);
    D.addEventListener('agn:project', onProject);
    label();
  }

  AGN.overviewAssets = { show:draw, hide:clear, toggle:toggle,
                         shown:function () { return SHOWN; },
                         count:function () { return (SHOWN && layer) ? layer.getLayers().length : 0; },
                         available:function () { return assets().length; } };

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', wire);
  else wire();
})(window);
