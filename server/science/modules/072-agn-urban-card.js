


(function(G){'use strict';
  var D=G.document, AGN=G.AGN=G.AGN||{};
  var cache=Object.create(null), inflight=Object.create(null), failAt=Object.create(null);
  function key(la,lo){ return (+la).toFixed(3)+','+(+lo).toFixed(3); }
  function local(){ try{ return /^https?:$/.test(location.protocol); }catch(_){ return false; } }
  function get(la,lo){
    if(!Number.isFinite(Number(la)) || !Number.isFinite(Number(lo))) return Promise.resolve(null);
    var k=key(la,lo);
    

    if(!local()){ cache[k]=null; return Promise.resolve(null); }
    if(Object.prototype.hasOwnProperty.call(cache,k)){ if(cache[k]!==null||Date.now()-(failAt[k]||0)<120000) return Promise.resolve(cache[k]); delete cache[k]; }    /* v91.17.266 · a failure is retried after 2 min */
    if(inflight[k]) return inflight[k];
    /* v91.17.283.15 · the urban field of the place's point-state record (the page store) */
    inflight[k]=(window.AGN&&AGN.pointState?AGN.pointState.get(+la,+lo):Promise.resolve(null))
      .then(function(ps){ return ps&&ps.ok&&ps.urban?ps.urban:null; })
      .then(function(j){
        var v=null, h=j&&j.heatIsland, c=(j&&j.cell)||{};
         
        if(j&&j.withheld){ v={ withheld:true, why:j.why||null }; } else   /* v91.17.283.5 C12 */
        if(j&&j.ready&&j.urban===false&&j.inPakistan){
          var nb=j.nearestBuilt||null;
          v={ none:true, lowDensity:!!j.lowDensity, tehsil:(j.unit&&j.unit.tehsil)||null,
              nearKm:nb?nb.km:null, nearMaxC:nb?nb.deltaTmaxC:null };    
        }
        if(j&&j.urban&&h&&Number.isFinite(Number(h.nowC))){
          v={ nowC:Number(h.nowC), maxC:h.maxC,
              built:c.builtFraction, ndvi:c.ndvi, pop:c.populationPerKm2,
              lcz:(j.lcz&&j.lcz.name)||null };
        }
        cache[k]=v; delete inflight[k]; return v;
      })
      .catch(function(){ cache[k]=null; failAt[k]=Date.now(); delete inflight[k]; return null; });
    return inflight[k];
  }
  

  function note(u,s){
    var host=D.getElementById('ccConf'); if(!host||!host.parentNode) return;
    var el=D.getElementById('ccUrbanNote');
    if(!el){
      el=D.createElement('div'); el.id='ccUrbanNote';
      el.style.cssText='font-size:0.72rem;line-height:1.4;color:var(--muted);margin-top:5px';
      host.parentNode.insertBefore(el, host.nextSibling);
    }
    if(u && u.withheld){ el.style.display=''; el.textContent='Urban heat island: not assessed. '+String(u.why||'').replace(/^not assessed:\s*/i,'').replace(/^./,function(c){ return c.toUpperCase(); }); return; }   /* v91.17.283.5 C12 */
    if(u && u.none){
      

      el.style.display='';
      el.textContent=(u.lowDensity ? 'No urban heat island here: a village or low-density area.'
        : 'No urban heat island here: no built-up area at this point.')
        +(u.nearKm!=null ? ' The nearest built area in '+(u.tehsil||'this tehsil')+' is '
          +u.nearKm+' km away and reaches '+u.nearMaxC+' \u00B0C at its nocturnal maximum, '
          +'which describes that town and not this point.' : '');
      return;
    }
    if(!u){ el.textContent=''; el.style.display='none'; return; }
    
    el.style.display='';
     
    var _sg=function(v){ v=Number(v); return (v>=0.05?'+':v<=-0.05?'\u2212':'')+Math.abs(v).toFixed(1); };
    el.textContent=(Math.abs(Number(u.nowC))<0.05
        ? 'Urban heat island: none at this hour; it builds after sunset, up to '+_sg(u.maxC)+' \u00B0C tonight here on a typical calm, clear night.'
        : 'Urban heat island here: '+_sg(u.nowC)+' \u00B0C now, up to '+_sg(u.maxC)+' \u00B0C tonight on a typical calm, clear night.')
      +' Modelled from building density and vegetation'+(u.lcz?' ('+u.lcz+')':'')+'; not added to the temperature above.';
  }
  

  var apCache=Object.create(null), apFlight=Object.create(null);
  function assetPoint(la,lo,elev){
    if(!Number.isFinite(Number(la))||!Number.isFinite(Number(lo))) return Promise.resolve(null);
    var k=(+la).toFixed(3)+','+(+lo).toFixed(3)+','+(elev==null?'':Math.round(elev));
    if(Object.prototype.hasOwnProperty.call(apCache,k)) return Promise.resolve(apCache[k]);
    if(apFlight[k]) return apFlight[k];
    if(!(G.AGNConditions&&G.AGNConditions.getConditions)) return Promise.resolve(null);
    apFlight[k]=G.AGNConditions.getConditions(Number(la),Number(lo),
                  (elev!=null&&isFinite(elev))?Number(elev):undefined)
      .then(function(rec){ var v=(rec&&rec.ok)?rec:null; apCache[k]=v; delete apFlight[k]; return v; })
      .catch(function(){ apCache[k]=null; delete apFlight[k]; return null; });
    return apFlight[k];
  }
  AGN.assetPoint={ get:assetPoint,
    peek:function(la,lo,elev){ var k=(+la).toFixed(3)+','+(+lo).toFixed(3)+','+(elev==null?'':Math.round(elev));
      return Object.prototype.hasOwnProperty.call(apCache,k)?apCache[k]:undefined; } };
  AGN.urbanNow={ get:get, note:note,
    peek:function(la,lo){ var k=key(la,lo);
      return Object.prototype.hasOwnProperty.call(cache,k)?cache[k]:undefined; } };
})(window);
