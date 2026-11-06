

(function(){var G=(typeof window!=='undefined')?window:this;G.AGN=G.AGN||{};
  var cache=null;
  G.AGN.geoData=function(key){   /* v91.17.283.20 · B7: the data accessor has its own name (AGN.geo is the geography module) */
    if(cache===null){
      var el=document.getElementById('agn-geo');
      if(!el){throw new Error('AGN.geoData: #agn-geo island missing');}
      cache=JSON.parse(el.textContent);
    }
    if(!(key in cache)){throw new Error('AGN.geoData: unknown key '+key);}
    return cache[key];
  };
})();
