import { createPointHeight } from '/tmp/claude-0/v277/srv_mtn/server/api/pointheight.mjs';
const ph = createPointHeight('/tmp/claude-0/v277/srv_mtn/data');
const S = { khaplu:[35.171,76.324], gilgit_mach:[35.901151,74.369656], jutial_danyore:[35.908035,74.341667], gilgit_syn:[35.919,74.334], skardu_syn:[35.336,75.536], chilas_syn:[35.417,74.1], bunji:[35.667,74.633], khaplu_tehsil_pt:[34.9996,76.6839] };
for (const [k,[a,b]] of Object.entries(S)) console.log(k, JSON.stringify(ph.heightAt(a,b)));
