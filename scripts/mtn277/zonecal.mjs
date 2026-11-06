const APP='/tmp/claude-0/v277/srv_mtn';
const { createMos } = await import(APP+'/server/api/mos.mjs');
const mos=createMos({dataDir:APP+'/data',log:()=>{}});
const S={khaplu:[35.171,76.324,2471],gilgit_mach:[35.901151,74.369656,1496],danyore_new:[35.908035,74.341667,1537],danyore_old:[35.986521,74.351465,2270],gilgit_syn:[35.919,74.334,1457],skardu_syn:[35.336,75.536,2316],chilas_syn:[35.417,74.1,1251],bunji_syn:[35.667,74.633,1470]};
for (const [k,[la,lo,el]] of Object.entries(S)) { const z=mos.zoneOfPoint(la,lo,el); const c=mos.calibrationAt(la,lo,el,z,10); console.log(k,z,JSON.stringify(c)); }
