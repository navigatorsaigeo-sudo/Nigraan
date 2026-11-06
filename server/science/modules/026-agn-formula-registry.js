

/* v91.17.283.12 (v283.13 hand-off) · the formula register and the model gate are the server's files (data/formula-registry.json,
   data/model-gate.slim.json via GET /api/registry/formula and /api/registry/gate), read once as the page loads; no copy is embedded.
   The engine hosts (server/engine/vmpage.mjs, server/science/host.mjs) answer the same two addresses from the same files. */
function agnServerFile(u){ try{ var x=new XMLHttpRequest(); x.open('GET',u,false); x.send(null); if(x.status===200) return JSON.parse(x.responseText); }catch(_){} return null; }
const FORMULA_REGISTRY = agnServerFile('/api/registry/formula') || {};




function FR(path){
  var node=FORMULA_REGISTRY, parts=String(path).split('.');
  for(var i=0;i<parts.length;i++){
    node = node && node[parts[i]];
    if(node===undefined) throw new Error('FORMULA_REGISTRY: unknown path "'+path+'"');
  }
  try{ FR.__read[path]=(FR.__read[path]||0)+1; }catch(_){}
  if(node && Object.prototype.hasOwnProperty.call(node,'value')) return node.value;
  return node;
}
FR.__read=Object.create(null);
FR.__resetReads=function(){ FR.__read=Object.create(null); };
try{ window.FORMULA_REGISTRY=FORMULA_REGISTRY; window.FR=FR; }catch(_){}


const AGN_MODEL_GATE = agnServerFile('/api/registry/gate');
try{ window.AGN_MODEL_GATE=AGN_MODEL_GATE; }catch(_){}
(function(){ try{ if(!AGN_MODEL_GATE) return; Object.keys(AGN_MODEL_GATE.entries).forEach(function(id){ (AGN_MODEL_GATE.entries[id].components||[]).forEach(function(c){
    if(c.role!=='diagnostic'||!c.fr) return; var k=c.fr.split('.'), e=FORMULA_REGISTRY[k[0]]&&FORMULA_REGISTRY[k[0]][k[1]]; if(!e) return;
    e.calibrationStatus='superseded'; e.role='diagnostic'; e.supersededBy=id+' (model gate '+AGN_MODEL_GATE.version+')'; }); }); }catch(_){} })();
