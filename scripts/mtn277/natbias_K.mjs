import { readFileSync } from 'node:fs';
const APP='/tmp/claude-0/v277/srv_mtn';
const { createNational } = await import(APP+'/server/api/natmodel.mjs');
const { createFeatGrid } = await import(APP+'/server/api/featgrid.mjs');
const fg=createFeatGrid(APP+'/data'); const N=createNational({dataDir:APP+'/data',featGrid:fg});
const M=JSON.parse(readFileSync(APP+'/data/national-model.json','utf8')); const B=M.bias;
const S={khaplu:[35.171,76.324,2471],gilgit_mach:[35.901151,74.369656,1496],danyore_new:[35.908035,74.341667,1537],danyore_old:[35.986521,74.351465,2270],gilgit_syn:[35.919,74.334,1457],skardu_syn:[35.336,75.536,2316],chilas_syn:[35.417,74.1,1251],bunji_syn:[35.667,74.633,1470]};
for (const [k,[la,lo,el]] of Object.entries(S)) {
  let acc={},ws={},near=[];
  for (const s of B.stations){ const d=6371*2*Math.asin(Math.sqrt(Math.sin((s.lat-la)*Math.PI/360)**2+Math.cos(la*Math.PI/180)*Math.cos(s.lat*Math.PI/180)*Math.sin((s.lon-lo)*Math.PI/360)**2)); if(d>B.maxkm||d<0.5)continue; const w=Math.exp(-d/B.L)*Math.exp(-Math.abs((s.elev||0)-el)/B.Lz); if(w>0.02) near.push(s.pid+'@'+d.toFixed(1)+'km w'+w.toFixed(2)); for(const [q,v] of Object.entries(s.b)){acc[q]=(acc[q]||0)+w*v;ws[q]=(ws[q]||0)+w;} }
  const K={}; for (const q of ['son_d','son_n','son_t']) K[q]=acc[q]!=null?+(acc[q]/(ws[q]+B.lam)).toFixed(2):null;
  const pt=N.point? N.point(la,lo):null; const built=pt&&pt.statics?pt.statics.s_wc_built:null;
  console.log(k, 'zone', pt&&pt.zone, 'built', built, 'builtOk', built==null||built<B.builtMax, 'K', JSON.stringify(K), near.join('; '));
}
