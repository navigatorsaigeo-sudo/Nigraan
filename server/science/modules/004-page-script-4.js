

(function(){var G=(typeof window!=='undefined')?window:this;G.AGN=G.AGN||{};
  var cache=null;
  G.AGN.geo=function(key){
    if(cache===null){
      var el=document.getElementById('agn-geo');
      if(!el){throw new Error('AGN.geo: #agn-geo island missing');}
      cache=JSON.parse(el.textContent);
    }
    if(!(key in cache)){throw new Error('AGN.geo: unknown key '+key);}
    return cache[key];
  };
})();
