

const PROV_FILL = {
  "Punjab":"#7FB069","Sindh":"#E6B655","Khyber Pakhtunkhwa":"#14B8A6",
  "Balochistan":"#C97B63","Gilgit Baltistan":"#8B7AA8","Azad Kashmir":"#9FB89A",
  "Federal Capital":"#3A4B5F","Indian Illegally Occupied Jammu Kashmir":"#CCCCCC"
};
const IIOJK = "Indian Illegally Occupied Jammu Kashmir";
window.IIOJK = IIOJK;  

function isScoreableDistrict(name){ return name !== IIOJK; }
window.isScoreableDistrict = isScoreableDistrict;

/* v91.17.283.35 · audit A4 / L1 · NO DEMO VALUES: the rows are keys only. Until the live sweep fills a row, every consumer reads "no value" (loading), never a seeded temperature, humidity, AQI or UV. */
const DISTRICT_IN = {"Bagh":{},"Dhir Kot":{},"Harighel":{},"Barnala":{},"Samahni":{},"Chikar":{},"Hattian":{},"Haveli":{},"Khurshid Abad":{},"Mumtazabad":{},"Charhoi":{},"Dulliya Jattan":{},"Fatehpur Thakiala":{},"Khui Ratta":{},"Dadyal":{},"Mirpur":{},"Muzaffarabad":{},"Naseerabad":{},"Sharda":{},"Abbaspur":{},"Hajira":{},"Rawalakot":{},"Thorar":{},"Baluch":{},"Mong":{},"Pallandari":{},"Tarar Khal":{},"Awaran":{},"Jhal Jhao":{},"Mashkai":{},"Gishekore":{},"Barkhan":{},"Rakhni":{},"Taftan":{},"Dera Bugti":{},"Phelawagh":{},"Sui":{},"Gwadar":{},"Jiwani":{},"Ormara":{},"Pasni":{},"Harnai":{},"Shahrigh":{},"Gandakha":{},"Usta Mohammad":{},"Gandawa":{},"Jhal Magsi":{},"Dhadar":{},"Mach":{},"Sanni":{},"Balanari":{},"Khattan":{},"Kalat":{},"Khaliqabad":{},"Buleda":{},"Dasht":{},"Kech (Turbat)":{},"Mand":{},"Tump":{},"Kharan":{},"Sar Kharan":{},"Tomulk":{},"Khuzdar":{},"Mola":{},"Naal":{},"Wadh":{},"Zehri":{},"Dobandi":{},"Killa Abdullah":{},"Killa Saifullah":{},"Muslim Bagh":{},"Kohlu":{},"Mawand":{},"Bela":{},"Hub":{},"Kanraj":{},"Sonmiani":{},"Uthal":{},"Lakhra":{},"Lairi":{},"Bhag":{},"Lehri":{},"Loralai":{},"Mekhtar":{},"Dasht Spenzend":{},"Kirdgap":{},"Mastung":{},"Drug":{},"Musakhel":{},"Chattar":{},"Dera Murad Jamali":{},"Tamboo":{},"Gowargo":{},"Jaheen Parome":{},"Panjgur":{},"Gichk":{},"Huramzai":{},"Karezat":{},"Pishin":{},"Saranan":{},"Panjpai":{},"Quetta City":{},"Quetta Saddar":{},"Sherani":{},"Sibi":{},"Sohbatpur":{},"Mashkhel":{},"Basima":{},"Washuk":{},"Nag":{},"Shaogari":{},"Zhob":{},"Sinjawi":{},"Ziarat":{},"Surab":{},"Duki":{},"Chaman":{},"Astore":{},"Shounter":{},"Chilas":{},"Ishkoman":{},"Punial":{},"Gilgit":{},"Ali Abad":{},"Gamba":{},"Skardu":{},"Nagar":{},"Sikandar Abad":{},"Gultari":{},"Kharmang":{},"Daghoni":{},"Khaplu":{},"Shigar":{},"Tangir":{},"Gupis":{},"Yasin":{},"Rondu":{},"Islamabad":{},"Bar Chamarkand":{},"Barang":{},"Khar":{},"Mamund":{},"Nawagai":{},"Salarzai":{},"Utman Khel":{},"Bannu":{},"Baka Khel":{},"Domel":{},"Kakki":{},"Miryan":{},"Wazir":{},"Allai":{},"Batagram":{},"Daggar":{},"Gagra":{},"Khado Khel":{},"Mandanr":{},"Charsadda":{},"Shabqadar":{},"Tangi":{},"Chitral":{},"Drosh":{},"Mastuj":{},"Dera Ismail Khan":{},"Daraban":{},"Kulachi":{},"Paroa":{},"Darazinda":{},"Hangu":{},"Tall":{},"Banda Daud Shah":{},"Karak":{},"Takht-E-Nasrati":{},"Bara":{},"Jamrud":{},"Landi Kotal":{},"Mulagori":{},"Kohat":{},"Lachi":{},"Gumbat":{},"Darra Adam Khel":{},"Pattan":{},"Bankad":{},"Dassu":{},"Kandia":{},"Harban Basha":{},"Seo":{},"Palas":{},"Battera Kolai":{},"Central Kurram":{},"Upper Kurram":{},"Lakki Marwat":{},"Sarai Naurang":{},"Bettani":{},"Adenzai":{},"Balambat":{},"Lalqila":{},"Munda":{},"Samarbagh":{},"Timergara":{},"Bat Khela":{},"Dargai":{},"Bala Kot":{},"Mansehra":{},"Oghi":{},"Baffa Pakhal":{},"Darband":{},"Katlang":{},"Mardan":{},"Takht Bhai":{},"Rustam":{},"Garhi Kapura":{},"Ambar":{},"Baizai":{},"Halimzai":{},"Khwazai":{},"Pandiali":{},"Prang Ghar":{},"Safi":{},"Yaka Ghund":{},"Data Khel":{},"Dossali":{},"Garyum":{},"Mir Ali":{},"Miran Shah":{},"Razmak":{},"Shewa":{},"Spinwam":{},"Shawal":{},"Nowshera":{},"Pabbi":{},"Central Orakzai":{},"Ismailzai":{},"Lower Orakzai":{},"Upper Orakzai":{},"Town-I":{},"Town-Ii":{},"Town-Iii":{},"Town-Iv":{},"Hassan Khel":{},"Alpuri":{},"Bisham":{},"Chakisar":{},"Makhuzai":{},"Martoong":{},"Puran":{},"Birmal":{},"Ladha":{},"Makin":{},"Sararogha":{},"Serwakai":{},"Tiarza":{},"Toi Khulla":{},"Wana":{},"Swabi":{},"Topi":{},"Razar":{},"Babuzai":{},"Bahrain":{},"Barikot":{},"Charbagh":{},"Kabal":{},"Khwaza Khela":{},"Matta Kharirai":{},"Matta Sebujni":{},"Tank":{},"Jandola":{},"Judba":{},"Khander":{},"Barawal":{},"Dir":{},"Kalkot":{},"Khall":{},"Shrengal":{},"Wari":{},"Larjam":{},"Attock":{},"Fateh Jang":{},"Jand":{},"Pindi Gheb":{},"Bahawalnagar":{},"Chishtian":{},"Fort Abbas":{},"Minchinabad":{},"Ahmadpur East":{},"Bahawalpur":{},"Hasilpur":{},"Khairpur Tamewali":{},"Bhakkar":{},"Darya Khan":{},"Mankera":{},"Chakwal":{},"Choa Saidan Shah":{},"Kallar Kahar":{},"Tala Gang":{},"Bhawana":{},"Chiniot":{},"Lalian":{},"Dera Ghazi Khan":{},"Kot Chatta":{},"Taunsa":{},"Chak Jhumra":{},"Faisalabad City":{},"Faisalabad Sadar":{},"Jaranwala":{},"Summundri":{},"Tandlian Wala":{},"Gujranwala":{},"Kamoke":{},"Nowshera Virkan":{},"Wazirabad":{},"Gujrat":{},"Kharian":{},"Sarai Alamgir":{},"Hafizabad":{},"Pindi Bhattian":{},"Ahmadpur Sial":{},"Jhang":{},"Shorkot":{},"Athara Hazari":{},"Dina":{},"Jhelum":{},"Pind Dadan Khan":{},"Sohawa":{},"Kasur":{},"Kot Radha Kishen":{},"Pattoki":{},"Jahanian":{},"Kabirwala":{},"Khanewal":{},"Mian Channu":{},"Khushab":{},"Naushera":{},"Noorpur":{},"Quaidabad":{},"Lahore Cantt":{},"Lahore City":{},"Choubara":{},"Karor Lal Esan":{},"Leiah":{},"Dunyapur":{},"Kahror Pacca":{},"Lodhran":{},"Malakwal":{},"Mandi Bahauddin":{},"Phalia":{},"Mianwali":{},"Jalalpur Pirwala":{},"Multan City":{},"Multan Saddar":{},"Shujabad":{},"Alipur":{},"Jatoi":{},"Kot Addu":{},"Muzaffargarh":{},"Nankana Sahib":{},"Sangla Hill":{},"Shah Kot":{},"Narowal":{},"Okara":{},"Renala Khurd":{},"Arif Wala":{},"Pakpattan":{},"Khanpur":{},"Liaqatpur":{},"Rahim Yar Khan":{},"Jampur":{},"Rajanpur":{},"Rajanpur (Tribal Area)":{},"Rojhan":{},"Gujar Khan":{},"Kahuta":{},"Kallar Sayaddan":{},"Kotli Sattian":{},"Murree":{},"Rawalpindi":{},"Taxila":{},"Chichawatni":{},"Sahiwal":{},"Bhalwal":{},"Kot Momin":{},"Sahiwal (Sargodha)":{},"Sargodha":{},"Shahpur":{},"Sillanwali":{},"Bhera":{},"Ferozewala":{},"Muridke":{},"Safdarabad":{},"Sharak Pur":{},"Sheikhupura":{},"Daska":{},"Pasrur":{},"Sambrial":{},"Sialkot":{},"Gojra":{},"Kamalia":{},"Toba Tek Singh":{},"Pir Mahal":{},"Burewala":{},"Mailsi":{},"Vehari":{},"Badin":{},"Matli":{},"Shaheed Fazil Rahu":{},"Talhar":{},"Tando Bago":{},"Gulberg Town":{},"Liaqatabad Town":{},"New Karachi Town":{},"North Nazimabad Town":{},"Dadu":{},"Johi":{},"Khairpur Nathan Shah":{},"Mehar":{},"Gulshan Iqbal Town":{},"Jamshaid Town":{},"Daharki":{},"Ghotki":{},"Khangarh":{},"Mirpur Mathelo":{},"Ubauro":{},"Hyderabad":{},"Hyderabad City":{},"Latifabad":{},"Qasimabad":{},"Garhi Khairo":{},"Jacobabad":{},"Kotri":{},"Manjhand":{},"Sehwan Sharif":{},"Thano Bula Khan":{},"Meero Khan":{},"Nasir Abad":{},"Qambar Ali Khan":{},"Qubo Saeed Khan":{},"Shahdad Kot":{},"Sijawal Junejo":{},"Warah":{},"Kandh Kot":{},"Kashmore":{},"Tangwani":{},"Faiz Ganj":{},"Gambat":{},"Khairpur":{},"Kingri":{},"Kot Diji":{},"Sobho Dero":{},"Thari Meer Wah":{},"Korangi Town":{},"Landhi Town":{},"Shah Faisal Town":{},"Baqrani":{},"Dokri":{},"Larkana":{},"Rato Dero":{},"Bin Qasim Town":{},"Gadap Town":{},"Malir Town":{},"Hala":{},"Matiari":{},"Saeedabad":{},"Digri":{},"Hussain Bux Muree":{},"Jhudo":{},"Kot Ghulam Muhammad":{},"Mirpur Khas":{},"Shuja Abad":{},"Sindhri":{},"Bhiria":{},"Kandiaro":{},"Mehrab Pur":{},"Moro":{},"Naushahro Feroze":{},"Jam Nawaz Ali":{},"Khipro":{},"Sanghar":{},"Shahdadpur":{},"Sinjhoro":{},"Tando Adam":{},"Daulat Pur":{},"Daur":{},"Nawabshah":{},"Sakrand":{},"Garhi Yasin":{},"Khanpur (Shikarpur)":{},"Lakhi":{},"Shikarpur":{},"Kemari Town":{},"Liyari Town":{},"Saddar Town":{},"Jati":{},"Kharo Chan":{},"Mirpur Bathoro":{},"Shah Bunder":{},"Sujawal":{},"New Sukkur":{},"Pano Aqil":{},"Rohri":{},"Sukkur":{},"Chamber":{},"Jhando Mari":{},"Tando Allahyar":{},"Bulri Shah Karim":{},"Tando Ghulam Hyder":{},"Tando Muhammad Khan":{},"Chachro":{},"Islam Kot":{},"Mithi":{},"Kaloi":{},"Ghorabari":{},"Thatta":{},"Kunri":{},"Pithoro":{},"Samaro":{},"Umer Kot":{},"Baldia Town":{},"Orangi Town":{},"Site Town":{},"Haripur":{},"Abbottabad":{},"Havelian":{},"Lora":{},"Lower Tanawal":{},"Bhimber":{},"Leepa":{},"Kotli":{},"Sehnsa":{},"Athmuqam":{},"Dalbandin":{},"Nokkundi":{},"Chagai":{},"Sunster":{},"Jhat Pat":{},"Gulistan":{},"Kahan":{},"Dureji":{},"Gaddani":{},"Kingri (Musakhel)":{},"Nushki":{},"Barshore":{},"Kakar Khurasan":{},"Mashabbrum":{},"Gojal":{},"Darel":{},"Phandar":{},"Lotkoh":{},"Mulkhow":{},"Paharpur":{},"Ghazi":{},"Khanpur (Haripur)":{},"Lower Kurram":{},"Ghulam Khan":{},"Jehangira":{},"Lahor":{},"Kalam":{},"Hasan Abdal":{},"Hazro":{},"Haroonabad":{},"Yazman":{},"Kalur Kot":{},"Chunian":{},"Isakhel":{},"Piplan":{},"Shakargarh":{},"Zafarwal":{},"Depalpur":{},"Sadiqabad":{},"Thul":{},"Nara":{},"Salehpat":{},"Dahli":{},"Diplo":{},"Nagar Parkar":{},"Keti Bunder":{},"Mirpur Sakro":{}};
try{ window.DISTRICT_IN = DISTRICT_IN; }catch(e){}

window.AGN = window.AGN || {};

 
window.AGN = window.AGN || {};


try{ console.info('[AGN] AGN.units.audit(true) then AGN.units.auditReport() lists every '
  +'reader still addressing the tehsil store by district name.'); }catch(_){}
AGN.hillTorrent = (function(){
  

  var SYSTEMS = [
    { id:'dg-khan',  label:'Suleiman front · Dera Ghazi Khan',
      catchment:['Sherani','Musakhel','Barkhan','Zhob'],
      receiving:['Dera Ghazi Khan'],
      note:'Sanghar, Kaha, Vidor and Sori Lund torrent group.' },
    { id:'rajanpur', label:'Suleiman front · Rajanpur',
      catchment:['Barkhan','Kohlu','Dera Bugti'],
      receiving:['Rajanpur'],
      note:'Kaha and Chachar torrents; the 2022 breaches were here.' },
    { id:'dikhan',   label:'Suleiman front · D.I. Khan and Tank',
      catchment:['South Waziristan','Sherani','Zhob'],
      receiving:['Dera Ismail Khan','Tank'],
      note:'Gomal and Tank Zam.' },
    { id:'kirthar',  label:'Kirthar front · right-bank Sindh',
      catchment:['Khuzdar','Kachhi','Jhal Magsi'],
      receiving:['Dadu','Jamshoro','Qambar Shahdadkot'],
      note:'Gaj, Nai and Baran nai; right-bank Indus back-up worsens it.' },
    { id:'kachhi',   label:'Nari and Bolan · Kachhi plain',
      catchment:['Ziarat','Harnai','Sibi'],
      receiving:['Kachhi','Nasirabad','Jhal Magsi','Sohbatpur'],
      note:'Nari and Bolan discharge onto the Kachhi plain.' }
  ];

  var LIMITS = 'Screening only. No channel routing, no torrent-bed capacity, '
             + 'no breach or bund state, no gauge. It says a catchment is loading, '
             + 'not that a specific torrent will overtop.';

  function _terr(d){ return (AGN.units && AGN.units.terrain) ? AGN.units.terrain(d) : null; }

  

  function _catchmentRain(list, table){
    var mx=null, mx6=null, hits=0, tot=0;
    for(var i=0;i<list.length;i++){
      var rows = (AGN.units && AGN.units.rowsFor) ? AGN.units.rowsFor(list[i], table) : [];
      for(var k=0;k<rows.length;k++){
        tot++;
        var r=rows[k].row;
        if(r && !(r.weatherLive||r.nationalLive||r.forecastLive)) continue;   /* v283.35 · A4b: a live row only, never a seed */
        if(r && r.rain!=null && isFinite(r.rain)){ hits++; if(mx==null||r.rain>mx) mx=r.rain; }
        if(r && r.rain6h!=null && isFinite(r.rain6h)){ if(mx6==null||r.rain6h>mx6) mx6=r.rain6h; }
      }
    }
    return { peak:mx, peak6h:mx6, coverage: tot? hits/tot : 0, units:tot };
  }

  

  function _reliefFactor(sys){
    var c=0,n=0;
    for(var i=0;i<sys.catchment.length;i++){ var t=_terr(sys.catchment[i]); if(t){ c+=t.e; n++; } }
    var p=0,m=0;
    for(var j=0;j<sys.receiving.length;j++){ var q=_terr(sys.receiving[j]); if(q){ p+=q.e; m++; } }
    if(!n||!m) return { factor:1, drop:null };
    var drop=(c/n)-(p/m);
    return { factor: 1 + Math.max(0, Math.min(0.25, (drop-500)/4000)), drop: Math.round(drop) };
  }

  function systemFor(district){
    for(var i=0;i<SYSTEMS.length;i++)
      if(SYSTEMS[i].receiving.indexOf(district)>=0) return SYSTEMS[i];
    return null;
  }

  function score(district, table){
    table = table || (typeof DISTRICT_IN!=='undefined' ? DISTRICT_IN : {});
    var sys=systemFor(district);
    if(!sys) return { score:null, status:'not-exposed',
      reason:'This district is not on a mapped hill-torrent front.' };

    var cr=_catchmentRain(sys.catchment, table);
    if(cr.coverage < 0.4) return { score:null, status:'unavailable', system:sys,
      coverage:cr.coverage,
      reason:'Only '+Math.round(cr.coverage*100)+'% of catchment units carry rainfall; 40% required.' };

     
    var iScore = cr.peak==null ? null
      : cr.peak<=1 ? 0 : cr.peak>=45 ? 100 : Math.round((cr.peak-1)/44*100);
    var aScore = cr.peak6h==null ? null
      : cr.peak6h<=5 ? 0 : cr.peak6h>=70 ? 100 : Math.round((cr.peak6h-5)/65*100);

    var acc=0, w=0;
    if(iScore!=null){ acc+=iScore*0.65; w+=0.65; }
    if(aScore!=null){ acc+=aScore*0.35; w+=0.35; }
    if(!w) return { score:null, status:'unavailable', system:sys,
      reason:'No catchment rainfall available.' };

    var rf=_reliefFactor(sys);
    var s=Math.round(Math.max(0, Math.min(100, (acc/w)*rf.factor)));
    return {
      score:s, status:'ok', system:sys, coverage:cr.coverage,
      catchmentPeak:cr.peak, catchmentPeak6h:cr.peak6h,
      reliefDrop:rf.drop, reliefFactor:+rf.factor.toFixed(3),
      drivers:[
        {label:'Catchment peak rainfall', value:cr.peak, unit:'mm/h', weight:0.65, index:iScore},
        {label:'Catchment 6 h peak',      value:cr.peak6h, unit:'mm',   weight:0.35, index:aScore},
        {label:'Catchment-to-plain drop', value:rf.drop, unit:'m', weight:null,
         note:'static amplifier, capped at +25%'}
      ],
      limits: LIMITS
    };
  }

  function describe(){
    return 'Hill torrent = 0.65 x catchment peak rainfall [mm/h, worst cell in the '
         + 'catchment, not the mean] + 0.35 x catchment 6 h peak [mm], then scaled by '
         + 'the catchment-to-plain elevation drop (+0 to +25%). Rainfall is read over '
         + 'the UPSTREAM catchment, never over the district at risk. ' + LIMITS;
  }

  return { SYSTEMS:SYSTEMS, systemFor:systemFor, score:score, describe:describe,
           exposedDistricts:function(){ var o=[]; SYSTEMS.forEach(function(s){
             s.receiving.forEach(function(d){ if(o.indexOf(d)<0) o.push(d); }); }); return o; },
           LIMITS:LIMITS };
})();



AGN.pdma = (function(){
  var MAP = {
    'Punjab':             { short:'PDMA Punjab',      authority:'Provincial Disaster Management Authority, Punjab',              seat:'Lahore' },
    'Sindh':              { short:'PDMA Sindh',       authority:'Provincial Disaster Management Authority, Sindh',               seat:'Karachi' },
    'Khyber Pakhtunkhwa': { short:'PDMA KP',          authority:'Provincial Disaster Management Authority, Khyber Pakhtunkhwa',  seat:'Peshawar' },
    'Balochistan':        { short:'PDMA Balochistan', authority:'Provincial Disaster Management Authority, Balochistan',         seat:'Quetta' },
    'Gilgit Baltistan':   { short:'GB-DMA',           authority:'Gilgit-Baltistan Disaster Management Authority',                seat:'Gilgit' },
    'Azad Kashmir':       { short:'SDMA AJK',         authority:'State Disaster Management Authority, Azad Jammu and Kashmir',   seat:'Muzaffarabad' },
    'Federal Capital':    { short:'ICT / NDMA',       authority:'ICT Administration, coordinated by NDMA',                       seat:'Islamabad' }
  };
  function forProvince(p){ return MAP[p] || null; }
  function forUnit(key, level){
    if(!AGN.units) return null;
    var d = (level==='district') ? key : AGN.units.districtOf(key);
    if(!d) return null;
    
    var C = (typeof PK_DISTRICT_CENTROIDS!=='undefined') ? PK_DISTRICT_CENTROIDS : [];
    for(var i=0;i<C.length;i++) if(C[i].district===d && C[i].province) return forProvince(C[i].province);
    return null;
  }
  function districtsByAuthority(){
    var out={};
    if(!AGN.units) return out;
    var C = (typeof PK_DISTRICT_CENTROIDS!=='undefined') ? PK_DISTRICT_CENTROIDS : [];
    var seen={};
    for(var i=0;i<C.length;i++){
      var c=C[i];
      if(!c.district || !c.province || seen[c.district]) continue;
      seen[c.district]=1;
      var a=forProvince(c.province); if(!a) continue;
      (out[a.short] = out[a.short] || []).push(c.district);
    }
    return out;
  }
  return { MAP:MAP, forProvince:forProvince, forUnit:forUnit, districtsByAuthority:districtsByAuthority };
})();

AGN.units = (function(){
  var IIOJK_P = 'Indian Illegally Occupied Jammu Kashmir';
  var _t2d = null, _d2t = null;
  function build(){
    if(_d2t) return;
    _d2t = {}; _t2d = {};
    var C = (typeof PK_DISTRICT_CENTROIDS!=='undefined') ? PK_DISTRICT_CENTROIDS : [];
    for(var i=0;i<C.length;i++){
      var c=C[i];
      if(!c || c.province===IIOJK_P || !c.district) continue;
      (_d2t[c.district] = _d2t[c.district] || []).push(c.key);
      _t2d[c.key] = c.district;
    }
  }
  function tehsilsOf(d){ build(); return (_d2t[d]||[]).slice(); }
  function districtOf(t){ build(); return _t2d[t]||null; }
  function districtKeys(){ build(); return Object.keys(_d2t); }
  function tehsilKeys(){ build(); return Object.keys(_t2d); }

   
  function rowsFor(district, table){
    var out=[], ks=tehsilsOf(district);
    for(var i=0;i<ks.length;i++){ var r=table&&table[ks[i]]; if(r!=null) out.push({key:ks[i],row:r}); }
    return out;
  }
  

  function inputFor(district, table){
    table = table || (typeof DISTRICT_IN!=='undefined' ? DISTRICT_IN : {});
    if(table[district]) return table[district];
    var rows = rowsFor(district, table);
    return rows.length ? rows[0].row : null;
  }

  

  function input(key, opts){
    opts = opts || {};
    var T = (typeof DISTRICT_IN!=='undefined') ? DISTRICT_IN : null;
    if(!T || key==null) return null;
    _note(key, 'unknown');

    var row = T[key];
    if(row){ _note(key,'tehsil'); return row; }

    

    var members = tehsilsOf(key);
    if(!members.length) { _note(key,'miss'); return null; }
    _note(key, 'district');

    var rows = [];
    for(var i=0;i<members.length;i++){ var r=T[members[i]]; if(r) rows.push({k:members[i], r:r}); }
    if(!rows.length) return null;

    

    for(var j=0;j<rows.length;j++) if(rows[j].k===key) return _mark(rows[j].r, key, rows[j].k, rows.length);
    var best=rows[0], bestN=-1;
    for(var m=0;m<rows.length;m++){
      var n=0, rr=rows[m].r;
      if(rr.nationalLive) n+=4;
      if(rr.days) n+=3;
      if(rr.soilMoist!=null) n+=1;
      if(rr.api!=null) n+=1;
      if(n>bestN){ bestN=n; best=rows[m]; }
    }
    return _mark(best.r, key, best.k, rows.length);
  }

  function _mark(row, asked, got, n){
    try{
      row.__resolvedFrom='district';
      row.__resolvedVia=got;
      row.__districtTehsils=n;
    }catch(_){}
    return row;
  }

   
  function inputStrict(key){
    var T=(typeof DISTRICT_IN!=='undefined')?DISTRICT_IN:null;
    return (T && key!=null && T[key]) ? T[key] : null;
  }

  

  function rollup(district, scoreFn, pick){
    var T=(typeof DISTRICT_IN!=='undefined')?DISTRICT_IN:{};
    var ks=tehsilsOf(district), out=[], k, r, s;
    for(var i=0;i<ks.length;i++){
      k=ks[i]; r=T[k]; if(!r) continue;
      try{ s=scoreFn(r,k); }catch(_){ s=null; }
      if(s!=null && isFinite(s)) out.push({key:k, score:s});
    }
    if(!out.length) return {score:null, n:0, of:ks.length, driver:null};
    if(pick==='mean'){
      var sum=0; for(var m=0;m<out.length;m++) sum+=out[m].score;
      return {score:Math.round(sum/out.length), n:out.length, of:ks.length, driver:null, pick:'mean'};
    }
    var w=out[0];
    for(var j=1;j<out.length;j++) if(out[j].score>w.score) w=out[j];
    return {score:w.score, n:out.length, of:ks.length, driver:w.key, pick:'worst'};
  }

  

  var _log=null;
  function _note(key, kind){
    if(!_log) return;
    var e=_log.keys[key] || (_log.keys[key]={tehsil:0,district:0,miss:0,unknown:0});
    e[kind]=(e[kind]||0)+1;
    if(kind!=='unknown') _log[kind]=(_log[kind]||0)+1;
  }
  function audit(on){
    if(!on){ _log=null; return 'audit off'; }
    _log={tehsil:0,district:0,miss:0,keys:{}};
    if(typeof DISTRICT_IN==='undefined' || typeof Proxy==='undefined') return 'audit on (accessor only)';
    try{
      var raw = window.__DISTRICT_IN_RAW || DISTRICT_IN;
      window.__DISTRICT_IN_RAW = raw;
      window.DISTRICT_IN = new Proxy(raw, {
        get:function(t,p){
          if(typeof p==='string' && !(p in Object.prototype)){
            if(Object.prototype.hasOwnProperty.call(t,p)) _note(p,'tehsil');
            else if(tehsilsOf(p).length) _note(p,'district');
            else if(!/^(?:constructor|hasOwnProperty|toString|valueOf|then|length|inspect)$/.test(p)) _note(p,'miss');
          }
          return t[p];
        }
      });
      return 'audit on (proxy installed) — drive the app, then AGN.units.auditReport()';
    }catch(e){ return 'audit on (accessor only): '+e.message; }
  }
  function auditReport(){
    if(!_log) return 'audit is off — call AGN.units.audit(true) first';
    var byDistrict=[];
    for(var k in _log.keys) if(_log.keys[k].district) byDistrict.push({key:k, n:_log.keys[k].district});
    byDistrict.sort(function(a,b){ return b.n-a.n; });
    var miss=[];
    for(var m in _log.keys) if(_log.keys[m].miss) miss.push({key:m, n:_log.keys[m].miss});
    return { tehsilReads:_log.tehsil, districtNameReads:_log.district, missedReads:_log.miss,
             readByDistrictName:byDistrict.slice(0,40), resolvedNothing:miss.slice(0,40),
             note:'anything under readByDistrictName or resolvedNothing is a call site '
                 +'still using the wrong vocabulary — route it through AGN.units.input()' };
  }

  function coverage(district, table){
    var tot=tehsilsOf(district).length, have=rowsFor(district,table).length;
    return { have:have, total:tot, fraction: tot? have/tot : 0 };
  }
  function denominator(level){
    build();
    if(level==='tehsil') return Object.keys(_t2d).length;
    if(level==='district') return Object.keys(_d2t).length;
    throw new TypeError("AGN.units.denominator needs 'tehsil' or 'district', got "+level);
  }
  function noun(level,n){
    var s = level==='tehsil' ? 'tehsil' : 'district';
    return n===1 ? s : s+'s';
  }
  

  var T_ALIAS = { 'Gupis-Yasin':'Gupis Yasin' };
  var T_MERGE = { 'Chitral':['Chitral Lower','Chitral Upper'] };
  function terrain(district){
    if(typeof PK_DISTRICT_TERRAIN==='undefined') return null;
    var T=PK_DISTRICT_TERRAIN;
    if(T[district]) return T[district];
    if(T_ALIAS[district] && T[T_ALIAS[district]]) return T[T_ALIAS[district]];
    var parts=T_MERGE[district];
    if(parts){
      var rows=parts.map(function(p){return T[p];}).filter(Boolean);
      if(rows.length) return {
        e: rows.reduce(function(a,r){return a+r.e;},0)/rows.length,
        emin: Math.min.apply(null,rows.map(function(r){return r.emin;})),
        emax: Math.max.apply(null,rows.map(function(r){return r.emax;})),
        s: rows.reduce(function(a,r){return a+r.s;},0)/rows.length,
        sp: Math.max.apply(null,rows.map(function(r){return r.sp;})),
        t: rows.reduce(function(a,r){return a+r.t;},0)/rows.length,
        r: Math.max.apply(null,rows.map(function(r){return r.emax;})) -
           Math.min.apply(null,rows.map(function(r){return r.emin;})),
        z: rows[0].z, _merged:parts
      };
    }
    return null;
  }
  return { tehsilsOf:tehsilsOf, districtOf:districtOf, districtKeys:districtKeys,
           tehsilKeys:tehsilKeys, rowsFor:rowsFor, inputFor:inputFor,
           coverage:coverage, denominator:denominator, noun:noun, terrain:terrain,
           input:input, inputStrict:inputStrict, rollup:rollup,
           audit:audit, auditReport:auditReport,
           IIOJK:IIOJK_P };
})();
   
function diFill(di){ if(di<21)return"#ffffb2"; if(di<24)return"#fecc5c"; if(di<27)return"#fd8d3c"; if(di<29)return"#f03b20"; return"#bd0026"; }
/* == v91.17.283.35 · item 2 / audit A4, L1, L2, L9 · THE COMFORT MAP VALUE IS THE SERVER'S ===============================================
   "Heat discomfort (DI)" of a tehsil and day is the issued layer 'comfort' (GET /api/levels?layer=comfort: the day's highest hourly Thom DI
   at the tehsil's main settlement, all 24 hours, Giles class on the full-precision value; server/api/comfort.mjs). The page computes no
   comfort value: districtComfortByName, agnComfortDay, the map fill, the key and the data table read this. Not loaded yet = no value. */
(function(){ var G=window, C={}, EV=0;
  function engine(){ try{ return typeof agnEngineHost==='function'&&agnEngineHost(); }catch(_){ return false; } }
  function uidOf(key){ try{ var F=(G.PK_DISTRICTS&&G.PK_DISTRICTS.features)||[]; for(var i=0;i<F.length;i++){ var p=F[i].properties; if(p&&p.key===key) return p.uid; } }catch(_){} return null; }
  function load(day){ var k=String(day||0), c=C[k]; if(c&&(c.st==='load'||(c.st==='fail'&&Date.now()-c.t<60e3)||c.st==='ok')) return c;
    c=C[k]={st:'load',t:Date.now()};
    if(engine()||typeof fetch!=='function'){ c.st='fail'; c.why='not available on the engine host'; return c; }
    fetch('/api/levels?layer=comfort&day='+k,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
      if(!j||j.ready===false||!j.levels){ c.st='fail'; c.t=Date.now(); c.why=(j&&j.why)||'the server answered no comfort values'; return; }
      c.st='ok'; c.j=j; c.t=Date.now(); EV++;
      try{ if(typeof G.refreshDistrictHazard==='function') G.refreshDistrictHazard(); }catch(_){}
      try{ document.dispatchEvent(new CustomEvent('agn:comfort',{detail:{day:+k}})); }catch(_){} }).catch(function(e){ c.st='fail'; c.t=Date.now(); c.why='the comfort values did not load'; });
    return c; }
  try{ document.addEventListener('agn:levels-run',function(){ C={}; }); }catch(_){}
  /* {di (rounded for display), level (class of the full value), word, giles, at, served:true} | {nd:true, why} | null (loading) */
  function of(key,day){ var c=load(day||0); if(c.st==='load') return null; if(c.st!=='ok') return {nd:true, why:c.why||'not loaded'};
    var u=uidOf(key), j=c.j, v=u!=null&&j.levels?j.levels[u]:null; if(v==null||!(+v>=0)) return {nd:true, why:(j.whys&&u!=null&&j.whys[u])||'no value for this tehsil and day'};
    var f=(j.facts&&j.facts[u])||{}, di=j.values&&j.values[u]!=null?+j.values[u]:(f.diMax!=null?+f.diMax:null);
    return {di:di, level:+v, word:['Normal','Low','Moderate','High','Severe'][+v], giles:f.giles||null, at:f.at||null, served:true}; }
  G.AGN=G.AGN||{}; G.AGN.comfort35={ of:of, load:load, epoch:function(){ return EV; }, name:'Heat discomfort (DI)',
    note:'Thom discomfort index: heat discomfort only; a low or negative value means no heat discomfort, not “comfortable”',
    classFill:['#ffffb2','#fecc5c','#fd8d3c','#f03b20','#bd0026'] };   /* v283.36 item 23: no DI example values; the class colour directly (item 32: the value is the day’s highest hour) */
})();
function districtComfortByName(name){ var r=(window.AGN&&AGN.comfort35)?AGN.comfort35.of(name,0):null; return r&&!r.nd?r:null; }


/* v283.36 · launch item 15 · the 12-city seed list keeps id, name, position and height only: its demo values (t, feels, hum, wind, gust, rain, uv, sev, aqi, pm25) are deleted from source */
const STATIONS = [
  {id:"isb", name:"Islamabad", lat:33.6844, lon:73.0479, elev:540},
  {id:"lhr", name:"Lahore", lat:31.5204, lon:74.3587, elev:217},
  {id:"khi", name:"Karachi", lat:24.8607, lon:67.0011, elev:10},
  {id:"pew", name:"Peshawar", lat:34.0151, lon:71.5249, elev:331},
  {id:"que", name:"Quetta", lat:30.1798, lon:66.9750, elev:1680},
  {id:"skz", name:"Sukkur", lat:27.7058, lon:68.8574, elev:67},
  {id:"gil", name:"Gilgit", lat:35.9208, lon:74.3083, elev:1500},
  {id:"muz", name:"Muzaffarabad", lat:34.3700, lon:73.4711, elev:737},
  {id:"mul", name:"Multan", lat:30.1575, lon:71.5249, elev:122},
  {id:"fsd", name:"Faisalabad", lat:31.4504, lon:73.1350, elev:184},
  {id:"hyd", name:"Hyderabad", lat:25.3960, lon:68.3578, elev:13},
  {id:"skt", name:"Skardu", lat:35.2971, lon:75.6333, elev:2228}
];


window.STATIONS = STATIONS;


STATIONS.forEach(function(s){ ['t','feels','hum','wind','gust','rain','uv','aqi','pm25','sev','alert'].forEach(function(k){ s[k]=null; });   /* v283.35 · A4b: sev and alert too */ s.cond='No reading yet'; s.em='—'; s.__seedless=true; });

const CITY_ZONE = {};   /* v283.36 item 15: no hand-typed city zone; the menu names the place as the register does */
const SEV = {1:"var(--sev-1)",2:"var(--sev-2)",3:"var(--sev-3)",4:"var(--sev-4)",5:"var(--sev-5)"};

function hourly24(s){
  const hist=DAY_OFFSET<0 && window.MACH_HISTORY && window.MACH_HISTORY.getHourly
    ? window.MACH_HISTORY.getHourly(s,DAY_OFFSET) : null;
  if(hist && hist.length){
    return hist.map((d,i)=>({h:d.h,t:Math.round(d.t),em:d.em||s.em,pp:d.pp||0,historical:true,i}));
  }
  if(DAY_OFFSET<0) return [];   
  const live=window.LIVE_HOURLY && window.LIVE_HOURLY[s.id];
  if(live && Array.isArray(live.rows) && live.rows.length){ return live.rows.slice(0,24); }
  return [];
}


function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function cToF(c){ return c*9/5+32; }
function fToC(f){ return (f-32)*5/9; }
function dewPointC(t,rh){
  if(t==null||rh==null||t===''||rh===''||!isFinite(+t)||!isFinite(+rh)) return NaN;   /* v283.35: a missing input stays missing (clamp(null) read as 1 %) */
  const a=17.67, b=243.5;    
  const alpha=((a*t)/(b+t))+Math.log(clamp(rh,1,100)/100);
  return (b*alpha)/(a-alpha);
}


function agnSatVapPressHpa(T){ return 6.112*Math.exp(17.67*T/(T+243.5)); }
function agnPressureAtM(z){
  if(!Number.isFinite(z)) return null;
  return 1013.25*Math.pow(1-2.25577e-5*z, 5.25588);           
}


function agnWetBulbPsychroC(T,RH,pHpa){
  if(!Number.isFinite(T)||!Number.isFinite(RH)||!Number.isFinite(pHpa)) return null;
  if(!(pHpa>0)||RH<0||RH>100) return null;
  var e = (RH/100)*agnSatVapPressHpa(T);
  var lo=Math.min(-40,T-30), hi=T;    
  

  for(var i=0;i<80 && hi-lo>1e-4;i++){
    var Tw=(lo+hi)/2;
    var A=6.6e-4*(1+0.00115*Tw);
    if(agnSatVapPressHpa(Tw) - A*pHpa*(T-Tw) - e > 0) hi=Tw; else lo=Tw;
  }
  return (lo+hi)/2;
}


function wetBulbStullC(t,rh,opts){
  if(!Number.isFinite(t)||!Number.isFinite(rh)) return null;
  if(rh<0||rh>100||t<-90||t>60) return null;           
  var p=null;
  if(opts){
    if(Number.isFinite(opts.pressureHpa)) p=opts.pressureHpa;
    else if(Number.isFinite(opts.elevationM)) p=agnPressureAtM(opts.elevationM);
  }
  

  if(rh>=99.5) return t;
  

  if(p!=null&&!(p>0)) return null;
  if(p!=null){
    var w=agnWetBulbPsychroC(t,rh,p);
    if(w!=null) return w;
  }
  

  return agnWetBulbPsychroC(t, Math.max(rh,0.1), 1013.25);
}
function wetBulbBasis(opts){
  var p=null;
  if(opts){
    if(Number.isFinite(opts.pressureHpa)) p=opts.pressureHpa;
    else if(Number.isFinite(opts.elevationM)) p=agnPressureAtM(opts.elevationM);
  }
  if(p!=null)
    return 'psychrometric wet-bulb solved at '+Math.round(p)+' hPa';
  return 'psychrometric wet-bulb at standard sea-level pressure (1013.25 hPa; no height known)';
}
function wetBulbRefusalWhy(t,rh){
  if(!Number.isFinite(t)||!Number.isFinite(rh)) return 'no temperature or humidity value for this unit';
  if(rh<0||rh>100) return 'relative humidity '+Math.round(rh)+' % is not a physical reading';
  if(t<-90||t>60) return 'air temperature '+Math.round(t)+' C is not a physical reading';
  if(rh<5) return 'relative humidity '+Math.round(rh)+' % is below the 5 % floor of the '
                 +'wet-bulb formula this build holds, and no station pressure is known for '
                 +'this unit to solve it psychrometrically instead, so no wet-bulb is issued';
  return 'air temperature '+Math.round(t)+' C is outside the -20 to +50 C range the '
        +'wet-bulb formula was fitted for, and no station pressure is known for this unit '
        +'to solve it psychrometrically instead';
}


var _agnElevMemo = Object.create(null), _agnDistIndex = null;


function _agnTehsilElev(key){
  try{
    var T = window.PK_TEHSIL_TERRAIN; if(!T) return null;
    var a = T[key]; if(!a) return null;
    if(a[7] === 1) return null;                        
    return (a[0] != null && Number.isFinite(+a[0])) ? +a[0] : null;
  }catch(_){ return null; }
}
function _agnDistrictElev(name){
  try{
    var M = window.PK_KEY_TO_DISTRICT; if(!M) return null;
    if(!_agnDistIndex){
      _agnDistIndex = Object.create(null);
      for(var k in M){ if(!Object.prototype.hasOwnProperty.call(M,k)) continue;
        var d = String(M[k]).toLowerCase();
        (_agnDistIndex[d] || (_agnDistIndex[d] = [])).push(k); }
    }
    var keys = _agnDistIndex[String(name).toLowerCase()]; if(!keys || !keys.length) return null;
    var es = [];
    for(var i=0;i<keys.length;i++){ var e = _agnTehsilElev(keys[i]); if(e != null) es.push(e); }
    if(!es.length) return null;
    

    es.sort(function(a,b){ return a-b; });
    var m = es.length >> 1;
    return (es.length % 2) ? es[m] : (es[m-1] + es[m]) / 2;
  }catch(_){ return null; }
}
function agnElevationForUnit(nameOrLat, lon){
  try{
    if(lon != null && isFinite(+nameOrLat) && isFinite(+lon)){
      var T = window.AGN && AGN.terrain;
      var pnt = (T && T.atPoint) ? T.atPoint(+nameOrLat, +lon) : null;
      return (pnt != null && pnt.elev_m != null && Number.isFinite(+pnt.elev_m)) ? +pnt.elev_m : null;
    }
    var n = String(nameOrLat == null ? '' : nameOrLat).trim();
    if(!n) return null;
    if(n in _agnElevMemo) return _agnElevMemo[n];
    var e = _agnTehsilElev(n);
    if(e == null) e = _agnDistrictElev(n);
    return (_agnElevMemo[n] = e);
  }catch(_){ return null; }
}
function agnWetBulbFor(t, rh, nameOrLat, lon){
  if(typeof wetBulbStullC !== 'function') return null;
  var e = agnElevationForUnit(nameOrLat, lon);
  return wetBulbStullC(t, rh, e != null ? {elevationM:e} : null);
}


function agnWetBulbBasisFor(nameOrLat, lon){
  var e = agnElevationForUnit(nameOrLat, lon);
  if(e == null) return wetBulbBasis(null);
  var src = (lon != null && isFinite(+nameOrLat) && isFinite(+lon))
          ? 'nearest gazetteer settlement'
          : 'mean terrain elevation of this unit';
  return wetBulbBasis({elevationM:e}) + ' (' + Math.round(e) + ' m, ' + src + ')';
}


function agnWetBulbSpreadC(t, rh, key){
  try{
    var a = window.PK_TEHSIL_TERRAIN && window.PK_TEHSIL_TERRAIN[key];
    if(!a || a[7] === 1 || a[1] == null || a[2] == null) return null;
    var lo = wetBulbStullC(t, rh, {elevationM:+a[2]});    
    var hi = wetBulbStullC(t, rh, {elevationM:+a[1]});
    if(lo == null || hi == null) return null;
    return {lowC:lo, highC:hi, spreadC:Math.abs(hi-lo), minM:+a[1], maxM:+a[2]};
  }catch(_){ return null; }
}
try{
  window.agnElevationForUnit = agnElevationForUnit;
  window.agnWetBulbFor       = agnWetBulbFor;
  window.agnWetBulbBasisFor  = agnWetBulbBasisFor;
  window.agnWetBulbSpreadC   = agnWetBulbSpreadC;
}catch(_){}

function heatIndexC(t,rh){
  

  try{
    if(window.AGN && AGN.physics && typeof AGN.physics.heatIndexC==='function')
      return AGN.physics.heatIndexC(t, rh);
  }catch(_){}
  return null;
}
function windChillC(t,windKmh){
  const T=cToF(t), V=windKmh/1.609344;
  if(T>50 || V<=3) return t;
  const wc=35.74 + 0.6215*T - 35.75*Math.pow(V,.16) + 0.4275*T*Math.pow(V,.16);
  return fToC(wc);
}
 
function agnUtciEs(ta) { const g = [-2836.5744, -6028.076559, 19.54263612, -0.02737830188, 0.000016261698, 7.0229056e-10, -1.8680009e-13]; const tk = ta + 273.15; let es = 2.7150305 * Math.log(tk); for (let i = 0; i < g.length; i++) es += g[i] * Math.pow(tk, i - 2); return Math.exp(es) * 0.01; }
function agnUtci(tdb, tr, v, rh) {
  if (![tdb, tr, v, rh].every((x) => x != null && isFinite(+x))) return null;
  tdb = +tdb; tr = +tr; v = Math.max(0.5, +v); rh = +rh;    
  if (tdb <= -50 || tdb >= 50 || tr - tdb <= -30 || tr - tdb >= 70 || v >= 17) return null;
  if (!(rh >= 0 && rh <= 100)) return null;
  const pa = agnUtciEs(tdb) * (rh / 100) / 10, delta_t_tr = tr - tdb;
  if (pa > 5) return null;
  const u = (tdb + 0.607562052 + (-0.0227712343) * tdb + (8.06470249e-4) * tdb * tdb + (-1.54271372e-4) * tdb * tdb * tdb + (-3.24651735e-6) * tdb * tdb * tdb * tdb + (7.32602852e-8) * tdb * tdb * tdb * tdb * tdb + (1.35959073e-9) * tdb * tdb * tdb * tdb * tdb * tdb + (-2.25836520) * v + 0.0880326035 * tdb * v + 0.00216844454 * tdb * tdb * v + (-1.53347087e-5) * tdb * tdb * tdb * v + (-5.72983704e-7) * tdb * tdb * tdb * tdb * v + (-2.55090145e-9) * tdb * tdb * tdb * tdb * tdb * v + (-0.751269505) * v * v + (-0.00408350271) * tdb * v * v + (-5.21670675e-5) * tdb * tdb * v * v + (1.94544667e-6) * tdb * tdb * tdb * v * v + (1.14099531e-8) * tdb * tdb * tdb * tdb * v * v + 0.158137256 * v * v * v + (-6.57263143e-5) * tdb * v * v * v + (2.22697524e-7) * tdb * tdb * v * v * v + (-4.16117031e-8) * tdb * tdb * tdb * v * v * v + (-0.0127762753) * v * v * v * v + (9.66891875e-6) * tdb * v * v * v * v + (2.52785852e-9) * tdb * tdb * v * v * v * v + (4.56306672e-4) * v * v * v * v * v + (-1.74202546e-7) * tdb * v * v * v * v * v + (-5.91491269e-6) * v * v * v * v * v * v + 0.398374029 * delta_t_tr + (1.83945314e-4) * tdb * delta_t_tr + (-1.73754510e-4) * tdb * tdb * delta_t_tr + (-7.60781159e-7) * tdb * tdb * tdb * delta_t_tr + (3.77830287e-8) * tdb * tdb * tdb * tdb * delta_t_tr + (5.43079673e-10) * tdb * tdb * tdb * tdb * tdb * delta_t_tr + (-0.0200518269) * v * delta_t_tr + (8.92859837e-4) * tdb * v * delta_t_tr + (3.45433048e-6) * tdb * tdb * v * delta_t_tr + (-3.77925774e-7) * tdb * tdb * tdb * v * delta_t_tr + (-1.69699377e-9) * tdb * tdb * tdb * tdb * v * delta_t_tr + (1.69992415e-4) * v * v * delta_t_tr + (-4.99204314e-5) * tdb * v * v * delta_t_tr + (2.47417178e-7) * tdb * tdb * v * v * delta_t_tr + (1.07596466e-8) * tdb * tdb * tdb * v * v * delta_t_tr + (8.49242932e-5) * v * v * v * delta_t_tr + (1.35191328e-6) * tdb * v * v * v * delta_t_tr + (-6.21531254e-9) * tdb * tdb * v * v * v * delta_t_tr + (-4.99410301e-6) * v * v * v * v * delta_t_tr + (-1.89489258e-8) * tdb * v * v * v * v * delta_t_tr + (8.15300114e-8) * v * v * v * v * v * delta_t_tr + (7.55043090e-4) * delta_t_tr * delta_t_tr + (-5.65095215e-5) * tdb * delta_t_tr * delta_t_tr + (-4.52166564e-7) * tdb * tdb * delta_t_tr * delta_t_tr + (2.46688878e-8) * tdb * tdb * tdb * delta_t_tr * delta_t_tr + (2.42674348e-10) * tdb * tdb * tdb * tdb * delta_t_tr * delta_t_tr + (1.54547250e-4) * v * delta_t_tr * delta_t_tr + (5.24110970e-6) * tdb * v * delta_t_tr * delta_t_tr + (-8.75874982e-8) * tdb * tdb * v * delta_t_tr * delta_t_tr + (-1.50743064e-9) * tdb * tdb * tdb * v * delta_t_tr * delta_t_tr + (-1.56236307e-5) * v * v * delta_t_tr * delta_t_tr + (-1.33895614e-7) * tdb * v * v * delta_t_tr * delta_t_tr + (2.49709824e-9) * tdb * tdb * v * v * delta_t_tr * delta_t_tr + (6.51711721e-7) * v * v * v * delta_t_tr * delta_t_tr + (1.94960053e-9) * tdb * v * v * v * delta_t_tr * delta_t_tr + (-1.00361113e-8) * v * v * v * v * delta_t_tr * delta_t_tr + (-1.21206673e-5) * delta_t_tr * delta_t_tr * delta_t_tr + (-2.18203660e-7) * tdb * delta_t_tr * delta_t_tr * delta_t_tr + (7.51269482e-9) * tdb * tdb * delta_t_tr * delta_t_tr * delta_t_tr + (9.79063848e-11) * tdb * tdb * tdb * delta_t_tr * delta_t_tr * delta_t_tr + (1.25006734e-6) * v * delta_t_tr * delta_t_tr * delta_t_tr + (-1.81584736e-9) * tdb * v * delta_t_tr * delta_t_tr * delta_t_tr + (-3.52197671e-10) * tdb * tdb * v * delta_t_tr * delta_t_tr * delta_t_tr + (-3.36514630e-8) * v * v * delta_t_tr * delta_t_tr * delta_t_tr + (1.35908359e-10) * tdb * v * v * delta_t_tr * delta_t_tr * delta_t_tr + (4.17032620e-10) * v * v * v * delta_t_tr * delta_t_tr * delta_t_tr + (-1.30369025e-9) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + (4.13908461e-10) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + (9.22652254e-12) * tdb * tdb * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + (-5.08220384e-9) * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + (-2.24730961e-11) * tdb * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + (1.17139133e-10) * v * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + (6.62154879e-10) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + (4.03863260e-13) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + (1.95087203e-12) * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + (-4.73602469e-12) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr + 5.12733497 * pa + (-0.312788561) * tdb * pa + (-0.0196701861) * tdb * tdb * pa + (9.99690870e-4) * tdb * tdb * tdb * pa + (9.51738512e-6) * tdb * tdb * tdb * tdb * pa + (-4.66426341e-7) * tdb * tdb * tdb * tdb * tdb * pa + 0.548050612 * v * pa + (-0.00330552823) * tdb * v * pa + (-0.00164119440) * tdb * tdb * v * pa + (-5.16670694e-6) * tdb * tdb * tdb * v * pa + (9.52692432e-7) * tdb * tdb * tdb * tdb * v * pa + (-0.0429223622) * v * v * pa + 0.00500845667 * tdb * v * v * pa + (1.00601257e-6) * tdb * tdb * v * v * pa + (-1.81748644e-6) * tdb * tdb * tdb * v * v * pa + (-1.25813502e-3) * v * v * v * pa + (-1.79330391e-4) * tdb * v * v * v * pa + (2.34994441e-6) * tdb * tdb * v * v * v * pa + (1.29735808e-4) * v * v * v * v * pa + (1.29064870e-6) * tdb * v * v * v * v * pa + (-2.28558686e-6) * v * v * v * v * v * pa + (-0.0369476348) * delta_t_tr * pa + 0.00162325322 * tdb * delta_t_tr * pa + (-3.14279680e-5) * tdb * tdb * delta_t_tr * pa + (2.59835559e-6) * tdb * tdb * tdb * delta_t_tr * pa + (-4.77136523e-8) * tdb * tdb * tdb * tdb * delta_t_tr * pa + (8.64203390e-3) * v * delta_t_tr * pa + (-6.87405181e-4) * tdb * v * delta_t_tr * pa + (-9.13863872e-6) * tdb * tdb * v * delta_t_tr * pa + (5.15916806e-7) * tdb * tdb * tdb * v * delta_t_tr * pa + (-3.59217476e-5) * v * v * delta_t_tr * pa + (3.28696511e-5) * tdb * v * v * delta_t_tr * pa + (-7.10542454e-7) * tdb * tdb * v * v * delta_t_tr * pa + (-1.24382300e-5) * v * v * v * delta_t_tr * pa + (-7.38584400e-9) * tdb * v * v * v * delta_t_tr * pa + (2.20609296e-7) * v * v * v * v * delta_t_tr * pa + (-7.32469180e-4) * delta_t_tr * delta_t_tr * pa + (-1.87381964e-5) * tdb * delta_t_tr * delta_t_tr * pa + (4.80925239e-6) * tdb * tdb * delta_t_tr * delta_t_tr * pa + (-8.75492040e-8) * tdb * tdb * tdb * delta_t_tr * delta_t_tr * pa + (2.77862930e-5) * v * delta_t_tr * delta_t_tr * pa + (-5.06004592e-6) * tdb * v * delta_t_tr * delta_t_tr * pa + (1.14325367e-7) * tdb * tdb * v * delta_t_tr * delta_t_tr * pa + (2.53016723e-6) * v * v * delta_t_tr * delta_t_tr * pa + (-1.72857035e-8) * tdb * v * v * delta_t_tr * delta_t_tr * pa + (-3.95079398e-8) * v * v * v * delta_t_tr * delta_t_tr * pa + (-3.59413173e-7) * delta_t_tr * delta_t_tr * delta_t_tr * pa + (7.04388046e-7) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * pa + (-1.89309167e-8) * tdb * tdb * delta_t_tr * delta_t_tr * delta_t_tr * pa + (-4.79768731e-7) * v * delta_t_tr * delta_t_tr * delta_t_tr * pa + (7.96079978e-9) * tdb * v * delta_t_tr * delta_t_tr * delta_t_tr * pa + (1.62897058e-9) * v * v * delta_t_tr * delta_t_tr * delta_t_tr * pa + (3.94367674e-8) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa + (-1.18566247e-9) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa + (3.34678041e-10) * v * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa + (-1.15606447e-10) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa + (-2.80626406) * pa * pa + 0.548712484 * tdb * pa * pa + (-0.00399428410) * tdb * tdb * pa * pa + (-9.54009191e-4) * tdb * tdb * tdb * pa * pa + (1.93090978e-5) * tdb * tdb * tdb * tdb * pa * pa + (-0.308806365) * v * pa * pa + 0.0116952364 * tdb * v * pa * pa + (4.95271903e-4) * tdb * tdb * v * pa * pa + (-1.90710882e-5) * tdb * tdb * tdb * v * pa * pa + 0.00210787756 * v * v * pa * pa + (-6.98445738e-4) * tdb * v * v * pa * pa + (2.30109073e-5) * tdb * tdb * v * v * pa * pa + (4.17856590e-4) * v * v * v * pa * pa + (-1.27043871e-5) * tdb * v * v * v * pa * pa + (-3.04620472e-6) * v * v * v * v * pa * pa + 0.0514507424 * delta_t_tr * pa * pa + (-0.00432510997) * tdb * delta_t_tr * pa * pa + (8.99281156e-5) * tdb * tdb * delta_t_tr * pa * pa + (-7.14663943e-7) * tdb * tdb * tdb * delta_t_tr * pa * pa + (-2.66016305e-4) * v * delta_t_tr * pa * pa + (2.63789586e-4) * tdb * v * delta_t_tr * pa * pa + (-7.01199003e-6) * tdb * tdb * v * delta_t_tr * pa * pa + (-1.06823306e-4) * v * v * delta_t_tr * pa * pa + (3.61341136e-6) * tdb * v * v * delta_t_tr * pa * pa + (2.29748967e-7) * v * v * v * delta_t_tr * pa * pa + (3.04788893e-4) * delta_t_tr * delta_t_tr * pa * pa + (-6.42070836e-5) * tdb * delta_t_tr * delta_t_tr * pa * pa + (1.16257971e-6) * tdb * tdb * delta_t_tr * delta_t_tr * pa * pa + (7.68023384e-6) * v * delta_t_tr * delta_t_tr * pa * pa + (-5.47446896e-7) * tdb * v * delta_t_tr * delta_t_tr * pa * pa + (-3.59937910e-8) * v * v * delta_t_tr * delta_t_tr * pa * pa + (-4.36497725e-6) * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa + (1.68737969e-7) * tdb * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa + (2.67489271e-8) * v * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa + (3.23926897e-9) * delta_t_tr * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa + (-0.0353874123) * pa * pa * pa + (-0.221201190) * tdb * pa * pa * pa + 0.0155126038 * tdb * tdb * pa * pa * pa + (-2.63917279e-4) * tdb * tdb * tdb * pa * pa * pa + 0.0453433455 * v * pa * pa * pa + (-0.00432943862) * tdb * v * pa * pa * pa + (1.45389826e-4) * tdb * tdb * v * pa * pa * pa + (2.17508610e-4) * v * v * pa * pa * pa + (-6.66724702e-5) * tdb * v * v * pa * pa * pa + (3.33217140e-5) * v * v * v * pa * pa * pa + (-0.00226921615) * delta_t_tr * pa * pa * pa + (3.80261982e-4) * tdb * delta_t_tr * pa * pa * pa + (-5.45314314e-9) * tdb * tdb * delta_t_tr * pa * pa * pa + (-7.96355448e-4) * v * delta_t_tr * pa * pa * pa + (2.53458034e-5) * tdb * v * delta_t_tr * pa * pa * pa + (-6.31223658e-6) * v * v * delta_t_tr * pa * pa * pa + (3.02122035e-4) * delta_t_tr * delta_t_tr * pa * pa * pa + (-4.77403547e-6) * tdb * delta_t_tr * delta_t_tr * pa * pa * pa + (1.73825715e-6) * v * delta_t_tr * delta_t_tr * pa * pa * pa + (-4.09087898e-7) * delta_t_tr * delta_t_tr * delta_t_tr * pa * pa * pa + 0.614155345 * pa * pa * pa * pa + (-0.0616755931) * tdb * pa * pa * pa * pa + 0.00133374846 * tdb * tdb * pa * pa * pa * pa + 0.00355375387 * v * pa * pa * pa * pa + (-5.13027851e-4) * tdb * v * pa * pa * pa * pa + (1.02449757e-4) * v * v * pa * pa * pa * pa + (-0.00148526421) * delta_t_tr * pa * pa * pa * pa + (-4.11469183e-5) * tdb * delta_t_tr * pa * pa * pa * pa + (-6.80434415e-6) * v * delta_t_tr * pa * pa * pa * pa + (-9.77675906e-6) * delta_t_tr * delta_t_tr * pa * pa * pa * pa + 0.0882773108 * pa * pa * pa * pa * pa + (-0.00301859306) * tdb * pa * pa * pa * pa * pa + 0.00104452989 * v * pa * pa * pa * pa * pa + (2.47090539e-4) * delta_t_tr * pa * pa * pa * pa * pa + 0.00148348065 * pa * pa * pa * pa * pa * pa);
  return Math.round(u * 10) / 10;
}


function agnTmrt(ta, ghi, dhi, sunElevDeg, albedo) {
  if (ta == null || !isFinite(+ta)) return null; ta = +ta;
  if (ghi == null || !isFinite(+ghi) || sunElevDeg == null || !isFinite(+sunElevDeg) || sunElevDeg <= 0 || ghi <= 0) return ta;
  const b = +sunElevDeg, sinb = Math.sin(b * Math.PI / 180), D = (dhi != null && isFinite(+dhi)) ? Math.min(+dhi, +ghi) : 0.3 * ghi;
  const In = sinb > 0.05 ? Math.max(0, (ghi - D) / sinb) : 0, fp = 0.308 * Math.cos(b * (1 - b * b / 48402) * Math.PI / 180), al = (albedo == null || !isFinite(+albedo)) ? 0.20 : +albedo;
  const sw = fp * In + 0.5 * D + 0.5 * al * ghi, s = 5.67e-8;
  return Math.round((Math.pow(Math.pow(ta + 273.15, 4) + 0.7 * sw / (0.97 * s), 0.25) - 273.15) * 10) / 10;
}
 
function agnSunElev(lat, lon, tMs) {
  const d = new Date(tMs), doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60, g = 2 * Math.PI / 365 * (doy - 1 + (h - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = ((h * 60 + eq + 4 * lon) / 4 - 180) * Math.PI / 180, la = lat * Math.PI / 180;
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
}
 
const AGN_UTCI_CLASSES = [[-40, "Extreme cold stress"], [-27, "Very strong cold stress"], [-13, "Strong cold stress"], [0, "Moderate cold stress"], [9, "Slight cold stress"], [26, "No thermal stress"], [32, "Moderate heat stress"], [38, "Strong heat stress"], [46, "Very strong heat stress"], [null, "Extreme heat stress"]].map((c) => [c[0] == null ? Infinity : c[0], c[1]]);    
const AGN_UTCI_AGN_MAP = {"version": "utci-agn-91.17.283.35", "points": [[9, 0], [25.999999999, 24], [26, 25], [31.999999999, 44], [32, 45], [38, 65], [46, 82], [54, 100]]};   /* v91.17.283.35 · audit A5: the page level step follows the thresholds register utci.heatLevels (Low 26-32 moderate heat stress, Moderate 32-38, High 38-46, Severe 46+), the server rule (utcilevel.mjs heatLevelOf): one scale */    


function agnUtciAgnScore(u) { if (u == null || !isFinite(u)) return null; const P = AGN_UTCI_AGN_MAP.points; if (u <= P[0][0]) return 0; for (let i = 1; i < P.length; i++) { if (u === P[i][0]) return P[i][1]; if (u < P[i][0]) return Math.min(P[i][1] - 1, Math.round(P[i - 1][1] + (u - P[i - 1][0]) / (P[i][0] - P[i - 1][0]) * (P[i][1] - P[i - 1][1]))); } return 100; }
const AGN_UTCI_COLD_MAP = {"version": "utci-agn-cold-91.17.283.35", "points": [[9, 0], [0, 24], [-1e-9, 25], [-13, 44], [-13.000000001, 45], [-27, 65], [-40, 82], [-50, 100]]};   /* v91.17.283.35 · audit A5: the register utci.coldLevels (Low 0 to -13 moderate cold stress, Moderate -13 to -27, High -27 to -40, Severe below -40), the server rule (utcilevel.mjs coldLevelOf) */    


function agnUtciColdScore(u) { if (u == null || !isFinite(u)) return null; const P = AGN_UTCI_COLD_MAP.points; if (u >= P[0][0]) return 0; for (let i = 1; i < P.length; i++) { if (u === P[i][0]) return P[i][1] - 1; if (u > P[i][0]) return Math.min(P[i][1] - 1, Math.round(P[i - 1][1] + (P[i - 1][0] - u) / (P[i - 1][0] - P[i][0]) * (P[i][1] - P[i - 1][1]))); } return 100; }
function agnUtciClass(u) { if (u == null || !isFinite(u)) return null; for (const [t, n] of AGN_UTCI_CLASSES) if (u < t) return n; return 'Extreme heat stress'; }

try{ window.agnUtci=agnUtci; window.agnTmrt=agnTmrt; window.agnSunElev=agnSunElev; window.agnUtciClass=agnUtciClass; window.agnUtciAgnScore=agnUtciAgnScore; window.AGN_UTCI_AGN_MAP=AGN_UTCI_AGN_MAP; }catch(_){}
/* v91.17.283.31 · 10 · the discomfort index of a day: the highest hourly value, each hour's temperature with that hour's humidity (the server's
   comfort days[].diMax uses the same rule). The day's maximum temperature with the day's mean humidity overstated it (late-October plains
   read Severe at 20-28 °C). */
window.agnComfortDay=function(key,day){ var r=(window.AGN&&AGN.comfort35)?AGN.comfort35.of(key,day||0):null; return r&&!r.nd?r:null; };   /* v283.35: the server's value (AGN.comfort35) */
function discomfortIndex(t,rh){   if(t==null||rh==null||t===''||rh===''||!isFinite(+t)||!isFinite(+rh)||+rh<0||+rh>100) return null; return t - 0.55*(1 - 0.01*rh)*(t - 14.5); }   /* v283.35 · item 5: no humidity clamp; an out-of-range humidity is refused (server comfort.mjs thomDI) */
function feelsLikeC(t,rh,windKmh){  
  
  
  const hi=heatIndexC(t,rh), wc=windChillC(t,windKmh);
  

  if(t>=27) return hi;
  if(t<=10) return wc;
  if(hi==null||wc==null) return null;
  const f=(t-10)/17;            
  return wc*(1-f)+hi*f;
}
try{ window.feelsLikeC=feelsLikeC; }catch(_){}
  function stationComfort(s){

  let uh=null; try{ if(window.AGN&&AGN.urbanHeat&&typeof AGN.urbanHeat.localizeStation==='function') uh=AGN.urbanHeat.localizeStation(s); }catch(_e){}
  

  const regionalTemp=(s.t==null||s.t==='')?NaN:Number(s.t), urbanLocalTemp=(uh&&uh.microclimate&&Number.isFinite(+uh.microclimate.localAirTemperatureC))?+uh.microclimate.localAirTemperatureC:null;
  const localTemp=regionalTemp;
  const hi=heatIndexC(localTemp,s.hum), wc=windChillC(localTemp,s.wind);
  

  const _fl = feelsLikeC(localTemp,s.hum,s.wind);
  const feels = (_fl==null) ? null : Math.round(_fl*10)/10;
  

  const feelsWhy = (_fl==null)
    ? (((window.AGN&&AGN.physics&&AGN.physics.heatIndexDetail)
          ? (AGN.physics.heatIndexDetail(localTemp,s.hum)||{}).why : null)
       || 'the apparent temperature has no value for these inputs')
    : null;
  

  const _wbOpts={elevationM:Number.isFinite(+s.elev)?+s.elev:null};
  const dp=dewPointC(localTemp,s.hum), wb=wetBulbStullC(localTemp,s.hum,_wbOpts), di=discomfortIndex(localTemp,s.hum);
  const wbBasis=wetBulbBasis(_wbOpts), wbWhy=(wb==null)?wetBulbRefusalWhy(localTemp,s.hum):null;

  

  const _stressBasis = (feels==null)
    ? 'air temperature only - the apparent temperature is outside the validity of the '
      +'heat-index method for these inputs'
    : 'the greater of apparent and air temperature';
  const heatStress=clamp(Math.round(((feels==null?localTemp:Math.max(feels,localTemp))-24)*4.6),0,100);
  

  const humLoad=(s.hum==null||!isFinite(s.hum))?null:clamp(Math.round(s.hum),0,100);
  const windRelief=clamp(Math.round(s.wind*3),0,100);
  

  var _v10=(s.wind!=null&&isFinite(+s.wind))?(+s.wind/3.6):null, _sw=(s.shortwave!=null?s.shortwave:(s.omFeatures&&s.omFeatures.shortwave!=null?s.omFeatures.shortwave:null));
  var utci=null, utciSun=null, tmrtSun=null, sunElev=null;
  /* v91.17.283.19 · the place's UTCI in shade is its record's (the one UTCI calculation, on the server); a row without a record uses the
     same Broede polynomial on its own values (a district row of the map, a what-if).
     v91.17.283.20 · A2: UTCI in the sun is the record's too (the v283.16 formula, now computed on the server: Tmrt from the hour's forecast
     short-wave at the sun's elevation, utci.mjs); null at night or without radiation */
  try{ var _rec=(s&&s.lat!=null&&s.lon!=null&&window.AGN&&AGN.pointState)?AGN.pointState.peek(+s.lat,+s.lon):null;
       utci=(_rec&&_rec.now&&_rec.now.utciShadeC!=null)?+_rec.now.utciShadeC:null;   /* W1: the record's UTCI or none (no page UTCI) */
       if(_rec&&_rec.now){ utciSun=_rec.now.utciSunC!=null?+_rec.now.utciSunC:null; tmrtSun=_rec.now.tmrtSunC!=null?+_rec.now.tmrtSunC:null; sunElev=_rec.now.sunElevDeg!=null?+_rec.now.sunElevDeg:null; } }catch(_){ utci=null; }
  

  const utciClass=agnUtciClass(utci);
  const utciSunClass=(utciSun!=null)?agnUtciClass(utciSun):null;
   
  const _uS=utci;
  const comfortScore=(_uS==null)?null:clamp(Math.round(_uS>26?100*(46-_uS)/20:_uS<9?100*(_uS+13)/22:100),0,100);
  return {temp:localTemp,regionalTemp:regionalTemp,localTemp:localTemp,urbanEstimateC:urbanLocalTemp,urbanEstimateApplied:false,
          comfortBasis:'computed from the unadjusted model temperature; the urban estimate is reported beside it and not added',
          urbanHeat:uh,feels,feelsWhy,hi,wc,dp,wb,wbBasis,wbWhy,di,utci,utciSun,tmrtSun,sunElev,utciClass,utciSunClass,utciSunEstimated:(utciSun!=null),
          utciBasis:'UTCI (Broede 2012 polynomial): shade uses Tmrt = air temperature; sun uses Tmrt estimated from forecast short-wave radiation (not measured); both the place record\u2019s values',heatStress,heatStressBasis:_stressBasis,humLoad,windRelief,comfortScore};
}
function discomfortLevel(di,c){
  if(c&&c.utciClass){ var _u=c.utci, _k=c.utciClass;    
    var _b=/No thermal/.test(_k)?'Comfortable':/Slight cold/.test(_k)?'Cool':/cold/i.test(_k)?'Cold stress':/Moderate heat/.test(_k)?'Warm':/Strong heat/.test(_k)&&!/Very/.test(_k)?'Heat stress':/Very strong heat/.test(_k)?'Strong heat stress':'Extreme heat';
    return {level:_k, note:'UTCI '+Math.round(_u)+' °C in shade'+(c.utciSun!=null?' · in the sun about '+Math.round(c.utciSun)+' °C (estimated)':''), badge:_k, utci:_u}; }
  if(di==null||!isFinite(di)) return {level:'No humidity reading',note:'comfort needs humidity; not computed',badge:'No humidity reading'};    
  if(di<21) return {level:'Comfortable',note:'Low discomfort',badge:'Comfortable'};
  if(di<24) return {level:'Slight discomfort',note:'Sensitive groups may feel warmth',badge:'Slight discomfort'};
  if(di<27) return {level:'Discomfort',note:'Many people feel discomfort',badge:'Discomfort'};
  if(di<29) return {level:'High discomfort',note:'Most people feel discomfort',badge:'High discomfort'};
  if(di<32) return {level:'Severe discomfort',note:'Outdoor exposure should be managed',badge:'Severe discomfort'};
  return {level:'Heat danger',note:'High heat illness potential',badge:'Heat danger'};
}
function heatRiskLabel(feels,airT,s){
  /* v91.17.283.12 · heat stress of the place from its point state (AGN.pointState: UTCI in shade, Blazejczyk et al. 2013; a heat level
     only from strong heat stress, UTCI 32 C). The Heat Index ladder (Caution / Danger, and the 'Below caution' rename) is retired. */
  var P=window.AGN&&AGN.pointState, ps=null;
  try{ var q=s||null; if(!q){ var ap=(AGN.data&&AGN.data.activePoint)?AGN.data.activePoint():null; q=(ap&&ap.lat!=null)?ap:((typeof selectedId!=='undefined'&&window.STATIONS)?STATIONS.find(function(x){ return x.id===selectedId; }):null); }
       ps=(P&&q&&q.lat!=null)?P.peek(q.lat,q.lon):null; if(!ps&&P&&q&&q.lat!=null) P.get(q.lat,q.lon); }catch(_){ ps=null; }
  var n=ps&&ps.now; if(!n) return {risk:'Not assessed',note:'heat stress (UTCI) for this place has not arrived yet',pct:null,basis:'utci'};
  var w=P.heatWord(n.heatLevel), I={Normal:0,Low:1,Moderate:2,High:3,Severe:4};
  return {risk:w, note:'UTCI in shade '+(n.utciShadeC!=null?n.utciShadeC+' \u00b0C':'not assessed')+(n.utciClass?', '+n.utciClass:'')+'; a heat level starts at strong heat stress (UTCI 32 \u00b0C)', pct:[15,30,55,78,95][I[w]||0], basis:'utci'};
}

function __hourlyHeatSeries(s){
  

  try{
    let fc=null;
    if(s && s.fc72 && Array.isArray(s.fc72.time)) fc=s.fc72;
    if(!fc && typeof aiStationDistrict==='function' && window.DISTRICT_IN){
      const d=aiStationDistrict(s); const rec=d && DISTRICT_IN[d];
      if(rec && rec.fc72 && Array.isArray(rec.fc72.time)) fc=rec.fc72;
    }
    if(!fc || typeof stationComfort!=='function') return null;
    const out=[], n0=Math.max(0, fc.nowIdx||0);
    for(let i=n0;i<Math.min(fc.time.length, n0+36);i++){
      const t=fc.temp&&fc.temp[i], hum=fc.hum&&fc.hum[i], wind=fc.wind&&fc.wind[i];
      if(t==null) continue;
      const c=stationComfort({t:t, hum:(hum!=null?hum:50), wind:(wind!=null?wind:5)});
      out.push({ hour:Number(String(fc.time[i]).slice(11,13)), iso:fc.time[i],
                 heatStress:c.heatStress, feels:c.feels });
    }
    return out.length?out:null;
  }catch(_){ return null; }
}
function __hhmm(h){ return String(h).padStart(2,'0')+':00'; }
function __longestRunBelow(series, limit){
  let best=null, cur=null;
  for(let i=0;i<series.length;i++){
    if(series[i].heatStress<=limit){
      if(!cur) cur={from:i,to:i}; else cur.to=i;
      if(!best || (cur.to-cur.from)>(best.to-best.from)) best={from:cur.from,to:cur.to};
    } else cur=null;
  }
  return best;
}
function recoveryWindow(s,c){
   
   
   
  if(c&&c.utciClass){ if(!/heat/i.test(c.utciClass)) return ['Not needed','No heat stress in shade now ('+c.utciClass+')']; }
  else if(c&&c.heatStress!=null&&isFinite(c.heatStress)&&c.heatStress<20) return ['Not needed','No heat stress now'];
  const ser=__hourlyHeatSeries(s);
  if(ser){
    const limit=Math.min(40, Math.max(20, c.heatStress-25));
    const hit=ser.find(function(x){ return x.heatStress<=limit; });
    if(hit) return [__hhmm(hit.hour),
      'First forecast hour below '+limit+'/100 heat stress · derived from the hourly series'];
    return ['None in 36 h','Heat stress does not drop below '+limit+'/100 in the forecast window'];
  }
   
  if(c.heatStress>=82) return ['20:00','Late evening relief (band default, not forecast-derived)'];
  if(c.heatStress>=62) return ['19:00','Safer evening period (band default, not forecast-derived)'];
  if(c.heatStress>=40) return ['18:00','Conditions ease after sunset (band default, not forecast-derived)'];
  return ['Now','No major heat recovery constraint'];
}
function bestOutdoorWindow(c,s){
   
  const ser=__hourlyHeatSeries(s);
  if(ser){
    const limit = c.heatStress>=80?45 : c.heatStress>=60?40 : 35;
    const run=__longestRunBelow(ser,limit);
    if(run && (run.to-run.from)>=1){
      const a=ser[run.from].hour, b=ser[run.to].hour, hrs=(run.to-run.from)+1;
      return [__hhmm(a)+' to '+__hhmm(b),
        hrs+' h below '+limit+'/100 heat stress · longest run in the hourly forecast'];
    }
    if(run) return [__hhmm(ser[run.from].hour),
      'Single hour below '+limit+'/100 · no usable continuous window in the forecast'];
    return ['No window','No forecast hour falls below '+limit+'/100 heat stress in the next 36 h'];
  }
   
  if(c.heatStress>=80) return ['05:30 to 09:00','Avoid midday and afternoon (band default, not forecast-derived)'];
  if(c.heatStress>=60) return ['06:00 to 10:00','Lower heat load before noon (band default, not forecast-derived)'];
  if(c.heatStress>=40) return ['Morning or after 17:00','Short exposure manageable (band default, not forecast-derived)'];
  return ['Most of the day','No major heat constraint'];
}


var AGN_BAND_CUTS=[
  {min:82, key:'severe',   label:'Severe'},
  {min:65, key:'high',     label:'High'},
  {min:45, key:'moderate', label:'Moderate'},
  {min:25, key:'low',      label:'Low'},
  {min:0,  key:'minimal',  label:'Normal'}    
];
function agnBandOf(score){
  if(score==null || !isFinite(Number(score))) return null;
  var v=Number(score);
  for(var i=0;i<AGN_BAND_CUTS.length;i++){
    if(v>=AGN_BAND_CUTS[i].min){
      var b=AGN_BAND_CUTS[i];
      return {key:b.key, label:b.label, index:(AGN_BAND_CUTS.length-1-i),
              lo:b.min, hi:(i===0?100:AGN_BAND_CUTS[i-1].min)};
    }
  }
  return null;
}


function agnBandLadder(){
  var asc=AGN_BAND_CUTS.slice().reverse();
  return asc.map(function(b,i){
    var hi=(i===asc.length-1)?100:asc[i+1].min;
    return {key:b.key, label:b.label, index:i, lo:b.min, hi:hi,
            range:b.min+'\u2013'+hi, text:b.label+' ('+b.min+'\u2013'+hi+')'};
  });
}
try{ window.AGN_BAND_CUTS=AGN_BAND_CUTS; window.agnBandOf=agnBandOf;
     window.agnBandLadder=agnBandLadder; }catch(_){}



function riskWord(score){ var b=agnBandOf(score); return b?b.label:null; }
try{ window.riskWord=riskWord; }catch(_){}




const map = L.map('map',{zoomControl:false,attributionControl:false,minZoom:4,maxZoom:13})
  .setView([30.4,69.4],5);
window.map = map;


(function(){
  function _sized(m){ try{ var c=m.getContainer(), s=m.getSize(); return !!(c&&c.clientWidth>0&&c.clientHeight>0&&s&&s.x>0&&s.y>0); }catch(_){ return false; } }
  var _fly=map.flyTo, _fit=map.fitBounds;
  map.flyTo=function(latlng, zoom, options){
    try{ this.__agnRecentred=Date.now(); }catch(_){}
    if(_sized(this)) return _fly.call(this, latlng, zoom, options);
    try{ this.invalidateSize(false); }catch(_){}
    if(_sized(this)) return _fly.call(this, latlng, zoom, options);
    return this.setView(latlng, (zoom==null?this.getZoom():zoom), {animate:false});
  };
  map.fitBounds=function(bounds, options){
    if(_sized(this)) return _fit.call(this, bounds, options);
    try{ this.invalidateSize(false); }catch(_){}
    if(_sized(this)) return _fit.call(this, bounds, options);
    try{ var b=L.latLngBounds(bounds); if(b&&b.isValid()) return this.setView(b.getCenter(), this.getZoom(), {animate:false}); }catch(_){}
    return this;
  };
})();



const CAPITAL_ANCHORS = [
  {name:'Islamabad',  lat:33.6844, lon:73.0479},
  {name:'Lahore',     lat:31.5497, lon:74.3436},
  {name:'Karachi',    lat:24.8607, lon:67.0011},
  {name:'Peshawar',   lat:34.0151, lon:71.5249},
  {name:'Quetta',     lat:30.1798, lon:66.9750},
  {name:'Gilgit',     lat:35.9200, lon:74.3100},
  {name:'Muzaffarabad',lat:34.3700, lon:73.4711}
];
const capitalLayer = L.layerGroup();
CAPITAL_ANCHORS.forEach(function(c){
  L.marker([c.lat,c.lon],{
    interactive:false,
    keyboard:false,
    icon:L.divIcon({
      className:'capital-anchor',
      html:'<span class="cap-dot"></span><span class="cap-name">'+c.name+'</span>',
      iconSize:[0,0], iconAnchor:[0,0]
    })
  }).addTo(capitalLayer);
});
capitalLayer.addTo(map);
try{ capitalLayer.eachLayer(function(l){ if(l.setZIndexOffset) l.setZIndexOffset(-200); }); }catch(_){}
   
L.control.zoom({position:'topright'}).addTo(map);



function dwt(){ const z=map.getZoom(); return z<=5 ? 0.15 : z===6 ? 0.4 : z<=7 ? 0.7 : 1.1; }
window.__districtWeight=dwt;



const BASEMAP_KEYS=['radar','satellite','temperature','rainfall','wind','comfort'];
AGN.basemap=(function(){
  var cfg={ template:null, attribution:null, licence:null, configured:false };
  var layers={};
  function blank(why){
    return L.tileLayer('',{maxZoom:19, attribution:why});
  }
  function build(){
    var why = cfg.configured
      ? (cfg.attribution || 'Basemap tiles supplied by the configured provider')
      : 'No basemap configured \u2014 boundaries are AGN geometry, not tiles. '
        + 'A licensed tile service is configured through the backend.';
    BASEMAP_KEYS.forEach(function(k){
      layers[k] = cfg.configured ? L.tileLayer((cfg.templates&&cfg.templates[k])||cfg.template, {maxZoom:19, subdomains:'abcd',
                                                              attribution:cfg.attribution||''})
                                 : blank(why);
    });
    return layers;
  }
  build();
  return {
    layers:function(){ return layers; },
    state:function(){ return {configured:cfg.configured, licence:cfg.licence,
                              attribution:cfg.attribution,
                              why:(cfg.configured?null:'no tile service is configured for this build')}; },
    configure:function(o){
      if(!o || !o.template || typeof o.template!=='string'){
        cfg.configured=false; cfg.template=null; cfg.licence=null; cfg.attribution=null;
        

        cfg.filter=null; cfg.source=null;
      } else {
        

        if(!o.licence) return {configured:false, why:'a basemap template was supplied with no '
                                                    +'declared licence, so it was refused'};
        cfg.template=o.template; cfg.templates=o.templates||null; cfg.attribution=o.attribution||null;
        

        cfg.filter = (typeof o.filter === 'string' && o.filter) ? o.filter : null;
        cfg.source = o.source || null; cfg.keyRequired = o.keyRequired === true;
        

        try{
          var _applyFilter = function(){
            try{
              var panes = document.querySelectorAll('.leaflet-tile-pane');
              for (var i=0;i<panes.length;i++){
                panes[i].style.filter = cfg.filter || '';
                panes[i].style.webkitFilter = cfg.filter || '';
              }
              return panes.length;
            }catch(_){ return -1; }
          };
          cfg.filterApplied = _applyFilter();
          if(!window.__agnBasemapFilterObserver){
            window.__agnBasemapFilterObserver = new MutationObserver(function(){ _applyFilter(); });
            window.__agnBasemapFilterObserver.observe(document.body, { childList:true, subtree:true });
          }
          window.__agnApplyBasemapFilter = _applyFilter;
        }catch(_){}
        cfg.licence=o.licence; cfg.configured=true;
      }
      var fresh=build();
      try{ Object.keys(bases).forEach(function(k){ bases[k]=fresh[k]; }); }catch(_){}
      try{ var el=document.getElementById('agnBasemapAttr');
           if(el) el.textContent = cfg.configured
             ? (cfg.attribution || 'Basemap tiles: configured provider')
             : 'Boundaries: AGN geometry \u00b7 no basemap configured'; }catch(_){}
        
      return {configured:cfg.configured, licence:cfg.licence};
    }
  };
})();
const bases = Object.assign({}, AGN.basemap.layers());
bases.radar.addTo(map);
let activeLayer='radar';
window.activeLayer = activeLayer;
document.body.dataset.layer='radar';




function fillMetaKey(v){
  if(v==='' || v==null) return 'comfort';
  if(v==='aqi') return 'aqi';
  if(v==='wind') return 'windhz';
  if(v==='telco_flood') return 'flood'; 
  return v; 
}



function fillThemeKey(v){
  if(v==='' || v==null) return 'comfort';
  if(v==='aqi') return 'aqi';
  if(v==='heat') return 'temperature';
  if(v==='flood') return 'rainfall';
  if(v==='rain_hz') return 'rainfall';
  if(v==='wind') return 'wind';
  
  
  if(v==='telco_wind'||v==='telco_lightning') return 'wind';
  if(v==='telco_heat') return 'temperature';
  if(v==='telco_flood') return 'rainfall';
  if(v==='ops') return 'radar';
  return v; 
}








function _mix(hex, targetHex, t){ 
  try{ const p=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
    const a=p(hex),b=p(targetHex),m=a.map((v,i)=>Math.round(v+(b[i]-v)*t));
    return '#'+m.map(v=>v.toString(16).padStart(2,'0')).join(''); }catch(e){ return hex; }
}
function setPanelAccentFromHazard(v){
  try{
    const root=document.body.style;
    
    
    
    if(v==='' || v==null || v==='aqi'){
      root.removeProperty('--accent-a'); root.removeProperty('--accent-b'); root.removeProperty('--accent-c');
      root.removeProperty('--map-glow'); return;
    }
    const ramp=(typeof hazardRamp==='function')?hazardRamp(v):null;
    if(!ramp) return;
    const a=ramp[1], b=ramp[3], c=_mix(ramp[4], '#0a0f1a', 0.35); 
    root.setProperty('--accent-a', a);
    root.setProperty('--accent-b', b);
    root.setProperty('--accent-c', c);
    
    try{ const h=b.replace('#',''); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),bl=parseInt(h.slice(4,6),16);
      root.setProperty('--map-glow', `rgba(${r},${g},${bl},.24)`); }catch(e){}
  }catch(e){}
}
function updateLayerMeta(layer){
  
  
  
  
  const _themeKey=({telco_wind:'wind',telco_heat:'heat',telco_flood:'flood',telco_lightning:'wind',ops:'radar'})[layer]||layer;
  if(layer) document.body.dataset.layer=_themeKey;
  

}


const provLayer = L.geoJSON(PK_PROVINCES,{
  style: f=>{
    const p=f.properties.province, disp=p===IIOJK;
    return {
      fillColor: PROV_FILL[p]||"#bbb",
      fillOpacity: disp?0.45:0.30,
      color: disp?"#808080":"#ffffff",
      weight: disp?1.2:1,
      dashArray: disp?"4,3":null
    };
  },
  onEachFeature:(f,l)=>{
    const p=f.properties.province;
    const label = p===IIOJK ? "IIOJK (disputed)" : p;
    
    l.bindTooltip(label,{sticky:false,direction:"top",className:"prov-tip"});
    l.on('mouseover',()=>{ if(!districtsOn) l.setStyle({weight:2,color:"var(--accent-c)"}); });
    l.on('mouseout',()=>{ if(!districtsOn) provLayer.resetStyle(l); });
    
    l.on('click',(e)=>{
      if(p===IIOJK) return;            
      if(districtsOn) return;          
      const c = (e && e.latlng) ? e.latlng : l.getBounds().getCenter();
      const st = nearestStation(c.lat, c.lng);
      if(st){ applyActiveStation(effStation(st), `${st.name} · ${p}`, false); }
    });
  }
}).addTo(map);

const natLayer = L.geoJSON(PK_NATIONAL,{style:{fill:false,color:"#0C3851",weight:1.6,opacity:.9}}).addTo(map);


let districtsOn=false, selectedDistrict=null;


let districtHazardMode=false;
let districtAqiMode=false;
const HAZARD_RAMP=["#fef0d9","#fdcc8a","#fc8d59","#e34a33","#b30000"]; 



 

function hazardFill(score){
  if(score<20)return HAZARD_RAMP[0]; if(score<40)return HAZARD_RAMP[1];
  if(score<60)return HAZARD_RAMP[2]; if(score<80)return HAZARD_RAMP[3]; return HAZARD_RAMP[4];
}






const NODATA_FILL="#e5ebf0";      
const NODATA_GLYPH="—";           
function isNoData(v){ return v==null || (typeof v==='number' && !isFinite(v)) || v===''; }
function numOrNull(v){ return isNoData(v) ? null : (typeof v==='number' ? v : (isFinite(+v)?+v:null)); }


function rainOrNull(o){ return o ? numOrNull(o.rain) : null; }




const HAZARD_RAMPS={
  
  
  
  
  
  
  
  rain_hz:  ["#CBD5DD","#7CC4F5","#2E9BE8","#0F6BC4","#083D8C"], 
  flood:    ["#e5f5e0","#a1d99b","#41ab5d","#238b45","#00441b"], 
  

  flood_pluvial: ["#e5f5e0","#a1d99b","#41ab5d","#238b45","#00441b"],
  flood_riverine:["#e0f3f5","#9bd3d9","#3f9fae","#1f7386","#083d4d"],
  

  nss:      ["#8C6239","#C9A227","#D9D97A","#7FB069","#1B5E3A"], 
  nss_baseline:["#8C6239","#C9A227","#D9D97A","#7FB069","#1B5E3A"],
  nss_dynamic: ["#8C6239","#C9A227","#D9D97A","#7FB069","#1B5E3A"],
  nss_retention:["#8C6239","#C9A227","#D9D97A","#7FB069","#1B5E3A"],
  

  nss_runoff: ["#EAF2E4","#D9D97A","#E6B655","#D2691E","#982122"],
  heat:     ["#fef0d9","#fdcc8a","#fc8d59","#e34a33","#b30000"], 
  wind:     ["#f7f4f9","#d4b9da","#c994c7","#df65b0","#980043"], 
  drought:  ["#fff7bc","#fee391","#fec44f","#d95f0e","#993404"], 
  cold:     ["#a8ebe0","#6fd4c4","#3bb3a0","#1f8a78","#0a5548"], 
  glof:     ["#c4c2f0","#9b96e2","#6f66d0","#4a3fb2","#2a1a8c"], 
  seismic:  ["#f6e8c3","#dfc27d","#bf812d","#8c510a","#543005"], 
  

  landslide:["#cfdae2","#a3b8c6","#7391a6","#476581","#243c52"], 
  cyclone:  ["#efedf5","#bcbddc","#9e9ac8","#756bb1","#54278f"], 
  telco_flood:["#e5f5e0","#a1d99b","#41ab5d","#238b45","#00441b"], 
  
  
  
  telco_wind:  ["#f7f4f9","#d4b9da","#c994c7","#df65b0","#980043"], 
  telco_heat:  ["#fef0d9","#fdcc8a","#fc8d59","#e34a33","#b30000"], 
  telco_lightning:["#f3e8ff","#d8b4fe","#a855f7","#7e22ce","#4c1d95"], 
  ops:         ["#e6f2f3","#b8dadd","#7fb9bf","#4a8f97","#1f5f66"]  
};
const RAIN_DRY = "#CBD5DD"; 


const HAZARD_BANDS=agnBandLadder().map(function(b){
  return {lo:b.lo, hi:b.hi, key:b.key, label:b.text};
});




 

const NSS_LAYERS={nss:1,nss_baseline:1,nss_dynamic:1,nss_retention:1,nss_runoff:1};


try{ window.NSS_LAYERS = NSS_LAYERS; }catch(_){}




try{
  window.HAZARD_RAMPS = window.HAZARD_RAMPS || {};
  Object.keys(HAZARD_RAMPS).forEach(function(k){
    if(!window.HAZARD_RAMPS[k]) window.HAZARD_RAMPS[k]=HAZARD_RAMPS[k].slice();
  });
}catch(_){}



const LAYER_OWN_KEY = { aqi:'US EPA Air Quality Index — not a 0-100 screening scale' };
try{ window.LAYER_OWN_KEY = LAYER_OWN_KEY; }catch(_){}
function hazardRamp(hz){
  return (HAZARD_RAMPS[hz]) || (window.HAZARD_RAMPS && window.HAZARD_RAMPS[hz]) || HAZARD_RAMP;
}



const NSS_NODATA='#B9BEC4';


const NA_FILL='rgba(0,0,0,0)';    
try{ window.NA_FILL=NA_FILL; }catch(_){}
function hazardFillFor(hz, score, meta){
  

  

  if(meta && meta.notApplicable) return (typeof NA_FILL!=='undefined')?NA_FILL:'#F0EDE6';
  if(score==null || (meta && meta.noData)) return (typeof NSS_NODATA!=='undefined')?NSS_NODATA:'#B9BEC4';
  if(typeof NSS_LAYERS!=='undefined' && NSS_LAYERS[hz]){
    if(score==null || (meta && meta.noData)) return NSS_NODATA;
  }
  
  
  
  if(hz==='rain_hz'){
    if(score<5) return RAIN_DRY;
    const rr=hazardRamp(hz);
    

    if(score<20 && meta && meta.rainDayP!=null && isFinite(+meta.rainDayP)) return (+meta.rainDayP>=50) ? rr[1] : RAIN_DRY;
    return score<20?rr[1] : score<40?rr[2] : score<60?rr[3] : rr[4];
  }
  

  

  var _reg=(typeof HAZARD_RAMPS!=='undefined' && HAZARD_RAMPS[hz])
        || (typeof window!=='undefined' && window.HAZARD_RAMPS && window.HAZARD_RAMPS[hz]);
  if(!_reg) return NSS_NODATA;
  const r=hazardRamp(hz);
  const b=agnBandOf(score);
  return r[b ? b.index : 0];
}






try{ (function(){
  function _wire(){
    var el=document.getElementById('mapHazardPick'); if(!el||el.__agnPub) return;
    el.__agnPub=1;
    el.addEventListener('change', function(){
      try{ document.dispatchEvent(new CustomEvent('agn:layer',{detail:{layer:el.value}})); }catch(_){}
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',_wire);
  else _wire();
})(); }catch(_){}
function currentMapLayer(){
  try{ if(window.mapLayer!=null) return window.mapLayer; }catch(_){}
  try{ var el=document.getElementById('mapHazardPick'); if(el&&el.value!=null) return el.value; }catch(_){}
  return sectorPrimaryHazard();
}
try{ window.currentMapLayer=currentMapLayer; }catch(_){}

function sectorPrimaryHazard(){
  if(typeof aiState!=='undefined' && aiState.hazard) return aiState.hazard;
  const sec=(typeof aiState!=='undefined'&&aiState.sector)||'agri';
  return sec==='telco' ? 'telco_flood' : 'flood';
}







const HZ_DAY_CAPABLE=new Set(['heat','telco_heat','rain_hz','flood','telco_flood',
                              'flood_pluvial','landslide',    
                              'wind','telco_wind','cold']);    
function hzDayCapable(hz){ return HZ_DAY_CAPABLE.has(hz); }




const HZ_DAY_MIN_HOURS=22;        
const HZ_FUTURE_DAY_HOURS=24;     
function hzPkDate(offset){
  try{ if(window.MACH_TIME&&MACH_TIME.day) return MACH_TIME.day(offset); }catch(_){}
  const d=new Date(Date.now()+offset*864e5);
  return d.toISOString().slice(0,10);
}
 


try{ ['agn:rainchance','agn:gaugeoutlook'].forEach(function(ev){ document.addEventListener(ev,function(){ setTimeout(function(){ try{ if(window.AGN&&AGN.hz5&&AGN.hz5.repaint) AGN.hz5.repaint(); }catch(_){} },50); }); }); }catch(_){}
window.agnRainChance=(function(){ var S={j:null,k2u:null};
  

  function stale(j){ try{ var d=hzPkDate(0); return !(j&&j.days&&j.days.indexOf(d)>=0); }catch(_){ return true; } }
  function load(){ try{ fetch(location.origin+'/api/rain/chance',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
      if(!j){ S.why='the rain-chance service did not answer'; return; }
      if(!j.ready){ S.why=j.why||'the rain chance is not ready'; return; }
      S.why=stale(j)?('the newest complete national forecast run'+(j.completed?' ('+String(j.completed).slice(0,16).replace('T',' ')+' UTC)':'')+' does not cover today yet; the next run will'):null;
      var k2u={}; try{ ((window.PK_DISTRICTS&&PK_DISTRICTS.features)||[]).forEach(function(f){ var q=f.properties||{}; if(q.key&&q.uid) k2u[q.key]=q.uid; }); }catch(_){}
      S.j=j; S.k2u=k2u; try{ document.dispatchEvent(new CustomEvent('agn:rainchance')); }catch(_){} }).catch(function(){}); }catch(_){} }
  setTimeout(load, 4000); setInterval(function(){ if(!S.j||S.why) load(); }, 60e3); setInterval(load, 30*60e3);
  return { ready:function(){ return !!S.j; }, raw:function(){ return S.j; }, why:function(){ return S.why||null; },
    forKey:function(k,day){ if(!S.j) return null; var u=S.j.units[(S.k2u&&S.k2u[k])||k]; if(!u) return null; var date=hzPkDate(day||0); for(var i=0;i<u.days.length;i++) if(u.days[i].date===date) return u.days[i]; return null; },
     
    keyAt:function(lat,lon){ lat=+lat; lon=+lon; if(!isFinite(lat)||!isFinite(lon)) return null; var ck=lat.toFixed(3)+','+lon.toFixed(3); S.pk=S.pk||{}; if(ck in S.pk) return S.pk[ck];
      function inR(r){ var c=false; for(var i=0,j=r.length-1;i<r.length;j=i++){ var xi=r[i][0], yi=r[i][1], xj=r[j][0], yj=r[j][1]; if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi)) c=!c; } return c; }
      function inP(P){ if(!P.length||!inR(P[0])) return false; for(var h=1;h<P.length;h++) if(inR(P[h])) return false; return true; }
      var hit=null; try{ ((window.PK_DISTRICTS&&PK_DISTRICTS.features)||[]).some(function(f){ var g=f.geometry, q=f.properties||{}; if(!g||!q.key) return false;
        var polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]; if(polys.some(inP)){ hit=q.key; return true; } return false; }); }catch(_){ hit=null; }
      S.pk[ck]=hit; return hit; } };
})();


window.agnGaugeOutlook=(function(){ var S={j:null,by:{}};
  function load(){ try{ fetch(location.origin+'/api/flood/gauges',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ if(!j||!j.ready||j.stale) { S.j=null; S.by={}; return; }
      var by={}; (j.gauges||[]).forEach(function(g){ if(g&&g.id) by[g.id]=g; }); S.j=j; S.by=by; try{ document.dispatchEvent(new CustomEvent('agn:gaugeoutlook')); }catch(_){} }).catch(function(){}); }catch(_){} }
  setTimeout(load, 4500); setInterval(load, 30*60e3);
  return { ready:function(){ return !!S.j; },
    forReach:function(id, day){ var g=id&&S.by[id]; if(!g||g.cls==null&&!(g.days&&g.days.length)) return null; var date=hzPkDate(day||0);
      if(g.lastReading===date && g.cls!=null) return {cls:g.cls, clsName:g.clsName, measured:true, name:g.name, date:date};
      for(var i=0;i<(g.days||[]).length;i++) if(g.days[i].date===date && g.days[i].cls!=null) return {cls:g.days[i].cls, clsName:g.days[i].clsName, measured:false, k:g.days[i].k, name:g.name, date:date};
      return null; } };
})();
function hzDayIndices(fc, day){
  if(!fc || !Array.isArray(fc.time)) return null;
  const target=hzPkDate(day), out=[];
  for(let i=0;i<fc.time.length;i++){
    if(String(fc.time[i]||'').slice(0,10)===target) out.push(i);
  }
  const need = (day===0) ? HZ_DAY_MIN_HOURS : HZ_FUTURE_DAY_HOURS;
  return out.length>=need ? out : null;
}

function hzDayVarsOk(fc, idx, hazard){
  if(!fc||!idx) return false;
  const n=(arr)=>Array.isArray(arr)?idx.reduce(function(a,i){
    var v=arr[i]; return a + ((v!=null && isFinite(Number(v)))?1:0); },0):0;

  const need=22;
  switch(hazard){
    case 'rain_hz': case 'flood': case 'telco_flood':
      return n(fc.rain)>=need;
    case 'heat': case 'telco_heat':
      return n(fc.temp)>=need && n(fc.hum)>=need;
    case 'cold':
      return n(fc.temp)>=need;
    case 'wind': case 'telco_wind':
      return n(fc.gust)>=need;
    default:
      return n(fc.temp)>=20;
  }
}
window.hzDayVarsOk=hzDayVarsOk;



function hzUtciInRange(t,v,h){ var u=agnUtci(t,t,v,h); return (u!=null&&isFinite(u))?u:null; }   /* v91.17.283.12: no clipping to 49.9 C / 16.9 m/s; outside the validity of the UTCI polynomial the heat is not assessed (server/api/utci.mjs, the same rule) */


function hzLiquidMm(p, snowCm){
  if(p==null||p==='') return null; var v=Number(p); if(!isFinite(v)) return null;
  if(snowCm==null||snowCm==='') return v; var s=Number(snowCm); if(!isFinite(s)||!(s>0)) return v;
  var k=null; try{ k=FR('flood_ext.swePerCm'); }catch(_){ k=null; } if(k==null||!isFinite(k)) return v;
  return Math.max(0, v-s*k);
}
window.hzLiquidMm=hzLiquidMm;


var _hzDwCache = (typeof WeakMap==='function') ? new WeakMap() : null;
function hzDayWindow(fc, day, hazard){
  if(!_hzDwCache || !fc || typeof fc!=='object') return hzDayWindowRaw(fc, day, hazard);
  var k=day+'|'+(hazard||'')+'|'+hzPkDate(day)+'|'+(Array.isArray(fc.time)?fc.time.length:0), m=_hzDwCache.get(fc);
  if(!m){ m=new Map(); _hzDwCache.set(fc, m); }
  if(!m.has(k)) m.set(k, hzDayWindowRaw(fc, day, hazard));
  var w=m.get(k); return w&&typeof w==='object' ? Object.assign({}, w) : w;
}
function hzDayWindowRaw(fc, day, hazard){
  const idx=hzDayIndices(fc, day);
  if(!idx) return null;
  if(hazard && !hzDayVarsOk(fc, idx, hazard)) return null;
  const pick=(arr)=>Array.isArray(arr)?idx.map(i=>arr[i]).filter(v=>v!=null&&isFinite(v)):[];
  const T=pick(fc.temp), F=pick(fc.feels), H=pick(fc.hum), G=pick(fc.gust),
        W=pick(fc.wind), R=pick(fc.rain), S=pick(fc.soil), SN=pick(fc.snow);
  

  const rawRain=Array.isArray(fc.rain)?fc.rain:[], rawSnow=Array.isArray(fc.snow)?fc.snow:[];
  

  let roll6=null;
  for(let a=0;a+6<=idx.length;a++){
    let ok=true, sum=0;
    for(let b=0;b<6;b++){
      const pos=idx[a+b];
      if(pos!==idx[a]+b){ ok=false; break; }          
      const v=hzLiquidMm(rawRain[pos], rawSnow[pos]);
      if(v==null){ ok=false; break; }                 
      sum+=v;
    }
    if(ok && (roll6==null || sum>roll6)) roll6=sum;
  }
  const mean=(a)=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  return {
    date:hzPkDate(day), hours:idx.length, first:fc.time[idx[0]], last:fc.time[idx[idx.length-1]],
    tmax:T.length?Math.max(...T):null, tmin:T.length?Math.min(...T):null, tmean:mean(T),
    appMax:F.length?Math.max(...F):null,
    humMean:H.length?Math.round(mean(H)):null,
    gustMax:G.length?Math.max(...G):null, windMean:mean(W),
    rainPeak:R.length?Math.max(...R):null, rain6h:roll6,
    

    wbPair:(function(){ var best=null; idx.forEach(function(i){ var t=+((fc.temp||[])[i]), h=+((fc.hum||[])[i]);
      if(!isFinite(t)||!isFinite(h)) return; var w=(typeof hzWetBulb==='function')?hzWetBulb(t,h):NaN;
      if(isFinite(w) && (!best || w>best.wb)) best={t:t,rh:h,wb:w,time:fc.time[i]}; }); return best; })(),
    

    utciPair:(function(){ if(typeof agnUtci!=='function') return null; var best=null; idx.forEach(function(i){ var t=+((fc.temp||[])[i]), h=+((fc.hum||[])[i]), wk=(fc.wind||[])[i];
      if(!isFinite(t)||!isFinite(h)) return; var calm=!(wk!=null&&isFinite(+wk)); var v=calm?0.5:(+wk)/3.6; var u=hzUtciInRange(t,v,h);
      if(u!=null && isFinite(u) && (!best || u>best.u)) best={u:u,t:t,rh:h,windKmh:calm?null:+wk,calm:calm,time:fc.time[i]}; }); return best; })(),
    

    utciMinPair:(function(){ if(typeof agnUtci!=='function') return null; var best=null; idx.forEach(function(i){ var t=+((fc.temp||[])[i]), h=+((fc.hum||[])[i]), wk=(fc.wind||[])[i];
      if(!isFinite(t)||!isFinite(h)) return; var calm=!(wk!=null&&isFinite(+wk)); var v=calm?0.5:(+wk)/3.6; var u=hzUtciInRange(t,v,h);
      if(u!=null && isFinite(u) && (!best || u<best.u)) best={u:u,t:t,rh:h,windKmh:calm?null:+wk,calm:calm,time:fc.time[i]}; }); return best; })(),
    hoursUsed:{rain:R.length, temp:T.length, hum:H.length, gust:G.length},
    partialDay:(R.length<24||T.length<24),
    rainTotal:R.length?R.reduce((x,y)=>x+y,0):null,    
    soilEnd:S.length?S[S.length-1]:null, snowTotal:SN.length?SN.reduce((x,y)=>x+y,0):null
  };
}



function hzHourIndex(fc){
  if(!fc || !Array.isArray(fc.time)) return null;
  var day, hr;
  try{ day=hzPkDate(0); hr=(window.MACH_TIME&&MACH_TIME.hour)?MACH_TIME.hour():null; }catch(_){ return null; }
  if(day==null || hr==null || !isFinite(hr)) return null;
  var want=day+'T'+String(hr).padStart(2,'0');
  for(var i=0;i<fc.time.length;i++){
    if(String(fc.time[i]||'').slice(0,13)===want) return i;
  }
  return null;   
}

function hzHourWindow(fc, hazard){
  var i=hzHourIndex(fc);
  if(i==null) return null;
  var at=function(arr){ if(!Array.isArray(arr)||arr[i]==null||arr[i]==='') return null;    
                        var v=Number(arr[i]); return isFinite(v)?v:null; };
  var T=at(fc.temp), F=at(fc.feels), H=at(fc.hum), G=at(fc.gust),
      W=at(fc.wind), R=at(fc.rain), S=at(fc.soil), SN=at(fc.snow);
  

  var need={ 'heat':[T,H], 'telco_heat':[T,H], 'cold':[T],
             'wind':[G], 'telco_wind':[G],
             'rain_hz':[R], 'flood':[R], 'telco_flood':[R] }[hazard] || [T];
  for(var k=0;k<need.length;k++){ if(need[k]==null) return null; }
  

  var roll6=null;
  if(Array.isArray(fc.rain) && i>=5){
    var sum=0, ok=true;
    for(var b=0;b<6;b++){
      var v=hzLiquidMm(fc.rain[i-b], Array.isArray(fc.snow)?fc.snow[i-b]:null);    
      if(v==null){ ok=false; break; }
      sum+=v;
    }
    if(ok) roll6=sum;
  }
  var stamp=String(fc.time[i]||'');
  return {
    basis:'current-hour', hourIndex:i, validFrom:stamp, validTo:stamp,
    date:stamp.slice(0,10), hours:1, first:stamp, last:stamp,
    tmax:T, tmin:T, tmean:T,
    appMax:(F!=null?F:T),
    humMean:(H!=null?Math.round(H):null),
    gustMax:G, windMean:W,
    rainPeak:R, rain6h:roll6,
    hoursUsed:{rain:(R==null?0:1), temp:(T==null?0:1), hum:(H==null?0:1), gust:(G==null?0:1)},
    partialDay:false,
    

    rainTotal:R,    
    soilEnd:S, snowTotal:SN
  };
}
window.hzHourIndex=hzHourIndex; window.hzHourWindow=hzHourWindow;





function hzApiForDay(base, day){
  const W=(window.AGN&&AGN.wetness)?AGN.wetness:null;
  if(!W) return undefined;
  let raw=(base && base.apiRaw!=null) ? base.apiRaw
        : (base && base.api!=null) ? W.denormalize(base.api) : null;
  if(raw==null) return undefined;
  for(let d=0; d<day; d++){
    const w=hzDayWindow(base.fc72, d, 'flood');
    if(!w || w.rainTotal==null) return undefined;
    raw=W.advance(raw, w.rainTotal);
  }
  return W.normalize(raw);
}




const _hzCovCache={};
function hzDayCoverage(day){

  const _covHz = (function(){
    try{ if(window.AGN && AGN.hazard && AGN.hazard.isHazard && AGN.hazard.isHazard())
           return AGN.hazard.get(); }catch(_){}
    try{ if(typeof sectorPrimaryHazard==='function') return sectorPrimaryHazard(); }catch(_){}
    return null;
  })();
  const _covKey = (_covHz||'-')+':'+day;
  if(_hzCovCache[_covKey]) return _hzCovCache[_covKey];
  let available=0, expected=0;
  try{

    const hz=_covHz;   

    (window.PK_DISTRICT_CENTROIDS||[]).forEach(function(c){
      if(window.IIOJK && c.province===window.IIOJK) return;
      const rec=DISTRICT_IN[c.key];
      if(!rec) return;                     
      expected++;
      const idx=hzDayIndices(rec.fc72, day);
      if(idx && (!hz || hzDayVarsOk(rec.fc72, idx, hz))) available++;
    });
  }catch(_){}
  const coverage=expected?available/expected:0;

  const res={day:day, available:available, expected:expected,
             coverage:+coverage.toFixed(4),
             enabled:coverage>=0.95, complete:coverage>=0.95};
  if(available>0) _hzCovCache[_covKey]=res;   
      
  return res;
}

try{ ['agn:data','agn:national','agn:location','agn:hazard','agn:sector'].forEach(function(ev){
  document.addEventListener(ev, function(){ hzClearDayCoverage(); });
}); }catch(_){}
function hzClearDayCoverage(){ Object.keys(_hzCovCache).forEach(k=>delete _hzCovCache[k]); }
function hzMaxForecastDay(){
  

  let best=0;
  for(let d=1; d<=3; d++){ if(hzDayCoverage(d).enabled) best=d; else break; }
  return best;
}
window.hzDayCoverage=hzDayCoverage; window.hzClearDayCoverage=hzClearDayCoverage;
window.hzDayWindow=hzDayWindow; window.hzDayWindowRaw=hzDayWindowRaw; window.hzMaxForecastDay=hzMaxForecastDay;

function hzDayInput(name, hazard, _site, _day){
  /* v91.17.272: AGN.siteScore passes a site's own inputs (its point forecast laid over the tehsil series) and the day; the map's and every
     other caller's inputs and day are unchanged */
  const base=_site||DISTRICT_IN[name];
  if(!base) return null;
  const day=(_day!=null)?_day:((window.AGN&&AGN.day&&typeof AGN.day.get==='function')?AGN.day.get():0);

  if(!hzDayCapable(hazard)) return base;
  

  let _basis='peak';
  try{ if(window.AGN&&AGN.day&&typeof AGN.day.basis==='function') _basis=AGN.day.basis(); }catch(_){}
  if(day>0||_day!=null) _basis='peak';
  const w = (_basis==='current' && day===0)
              ? hzHourWindow(base.fc72, hazard)
              : hzDayWindow(base.fc72, day, hazard);
  

  if(!w || w.tmax==null) return {__unavailable:true, dayIndex:day,
                                 dayAvailable:false,
                                 timeBasis:_basis,
                                 dayBasis:(_basis==='current'
                                   ? 'current hour not covered by the forecast series'
                                   : 'unavailable')};
  

  const cold=(hazard==='cold');
  

  const rainRate = w.rainPeak!=null ? w.rainPeak : null;
  return Object.assign({}, base, {
    t: cold ? w.tmin : w.tmax,
    feels: cold ? w.tmin : (w.appMax!=null?w.appMax:w.tmax),
    hum: w.humMean!=null?w.humMean:null,
    wind: w.windMean!=null?w.windMean:null,
    gust: w.gustMax!=null?w.gustMax:null,
    rain: rainRate,
    snow: w.snowTotal,
    soilMoist: w.soilEnd!=null?w.soilEnd:undefined,
     
    heatDryTemp: w.tmax, heatApparentMax: w.appMax, 
    heatWetBulbTemp: (w.wbPair ? w.wbPair.t : w.tmean), heatMeanRh: (w.wbPair ? w.wbPair.rh : w.humMean),
    heatUtciShade: (w.utciPair ? w.utciPair.u : null), heatUtciT: (w.utciPair ? w.utciPair.t : null), heatUtciRh: (w.utciPair ? w.utciPair.rh : null),
    heatUtciWind: (w.utciPair ? w.utciPair.windKmh : null), heatUtciCalm: (w.utciPair ? w.utciPair.calm : null),
    coldUtciShade: (w.utciMinPair ? w.utciMinPair.u : null), coldUtciT: (w.utciMinPair ? w.utciMinPair.t : null), coldUtciRh: (w.utciMinPair ? w.utciMinPair.rh : null),
    coldUtciWind: (w.utciMinPair ? w.utciMinPair.windKmh : null), coldUtciCalm: (w.utciMinPair ? w.utciMinPair.calm : null),
    coldUtciBasis: (w.utciMinPair ? ('UTCI in shade at the hour of the day\'s lowest UTCI ('+String(w.utciMinPair.time||'').slice(11,16)+' PKT)'+(w.utciMinPair.calm?'; no wind at that hour, calm reference wind used (a lower bound on the chill)':'')) : null),
    heatUtciBasis: (w.utciPair ? ('UTCI in shade at the hour of the day\'s highest UTCI ('+String(w.utciPair.time||'').slice(11,16)+' PKT)'+(w.utciPair.calm?'; no wind at that hour, calm reference wind (0.5 m/s) used: wind changes UTCI either way (lower in moderate heat, higher above about 40 °C)':'')) : null),
    heatWetBulbBasis: (w.wbPair ? 'hourly temperature and humidity at the hour of the day\'s wet-bulb maximum ('+String(w.wbPair.time||'').slice(11,16)+')' : 'daily mean temperature and humidity (no hourly pair held)'),
    tmean: w.tmean, tmaxDay: w.tmax, tminDay: w.tmin,
     
    rainPeakDay: w.rainPeak, rain6hDay: w.rain6h, rainTotalDay: w.rainTotal,
    api: hzApiForDay(base, day),
    

    tm3: undefined, t95: undefined, tm30: undefined,
    dayIndex: day, dayAvailable: true,
    

    timeBasis: (_basis==='current' && day===0) ? 'current' : 'peak',
    validFrom: (w.validFrom!=null ? w.validFrom : w.first),
    validTo:   (w.validTo  !=null ? w.validTo   : w.last),
    dayBasis: (_basis==='current' && day===0)
                ? 'current hour'
                : (w.partialDay ? 'forecast-day (partial)' : 'forecast-day'),
    partialDay: !!w.partialDay, hoursUsed: w.hoursUsed,
    dayDate: w.date, dayHours: w.hours
  });
}
window.hzDayInput=hzDayInput; window.hzDayCapable=hzDayCapable;

function __dayInp(name, hazard){
  

  try{
    const hz = hazard || (typeof sectorPrimaryHazard==='function' ? sectorPrimaryHazard() : null);
    const r  = (typeof hzDayInput==='function') ? hzDayInput(name, hz) : null;
    if(!r || r.__unavailable) return null;
    let fh = null;
    try{ fh = (typeof aiState!=='undefined' && aiState.lead!=null) ? aiState.lead : null; }catch(_){}
    if(fh == null) return r;
    

    const out = (window.DISTRICT_IN && r===DISTRICT_IN[name]) ? Object.assign({}, r) : r;    
    out.forecastHorizonHours = fh;
    return out;
  }catch(_){ return null; }
}
window.__dayInp=__dayInp;







var HZ_TALLY = { key:null, counts:null, noData:0, scored:0, total:0 };
function _hzTallyKey(){
  var d=0, b='peak';
  try{ if(window.AGN&&AGN.day){ if(AGN.day.get) d=AGN.day.get()||0; if(AGN.day.basis) b=AGN.day.basis(); } }catch(_){}
  var l=null; try{ l=currentMapLayer(); }catch(_){}
  return String(l)+'|'+d+'|'+b;
}
function hzTallyReset(){
  HZ_TALLY={ key:_hzTallyKey(), counts:{minimal:0,low:0,moderate:0,high:0,severe:0},
             noData:0, notApplicable:0, scored:0, total:0, seen:Object.create(null) };
}


function hzTallyNote(name, sc, noData, notApplicable){
  var k=_hzTallyKey();
  if(HZ_TALLY.key!==k) hzTallyReset();
  if(name==null) return;
  

  

  var b=(sc==null || noData || notApplicable)?null:((typeof agnBandOf==='function')?agnBandOf(sc):null);
  var nk=notApplicable?'__na':(b?b.key:'__nd'), prev=HZ_TALLY.seen[name];
  if(prev===nk) return;
  if(prev){ if(prev==='__nd') HZ_TALLY.noData--;
            else if(prev==='__na') HZ_TALLY.notApplicable=(HZ_TALLY.notApplicable||1)-1;
            else { HZ_TALLY.scored--; HZ_TALLY.counts[prev]--; } }
  else HZ_TALLY.total++;
  HZ_TALLY.seen[name]=nk;
  if(nk==='__na'){ HZ_TALLY.notApplicable=(HZ_TALLY.notApplicable||0)+1; return; }
  if(!b){ HZ_TALLY.noData++; return; }
  HZ_TALLY.scored++;
  HZ_TALLY.counts[b.key]=(HZ_TALLY.counts[b.key]||0)+1;
}


function hzDistributionLine(){
  var k=_hzTallyKey();
  if(HZ_TALLY.key!==k || !HZ_TALLY.total) return null;
  var c=HZ_TALLY.counts||{}, tot=HZ_TALLY.total, sc=HZ_TALLY.scored, nd=HZ_TALLY.noData;
  var na=HZ_TALLY.notApplicable||0;
  

  var _naTxt = na ? (' \u00b7 ' + na + ' not applicable') : '';
  if(!sc) return na
    ? ('No unit scored on this layer \u2014 ' + na + ' of ' + tot + ' have no mechanism here'
       + (nd ? (' and ' + nd + ' are unresolved') : '') + '.')
    : ('No unit scored on this layer \u2014 all ' + tot + ' show as no data.');
  var used=Object.keys(c).filter(function(x){ return c[x]>0; });
  var LAB={minimal:'Normal',low:'Low',moderate:'Moderate',high:'High',severe:'Severe'};    
  if(used.length===1){
    return sc + ' of ' + tot + ' units ' + LAB[used[0]]
         + ' \u2014 every scored unit is in one band, so the map is uniform by result, '
         + 'not by omission'
         + _naTxt
         + (nd ? ('. ' + nd + ' unresolved.') : '.');
  }
  var ORDER=['severe','high','moderate','low','minimal'];
  var parts=ORDER.filter(function(x){ return c[x]>0; })
                 .map(function(x){ return c[x]+' '+LAB[x]; });
  return sc + ' of ' + tot + ' scored \u00b7 ' + parts.join(', ')
       + _naTxt
       + (nd ? (' \u00b7 ' + nd + ' unresolved') : '');
}
try{ window.hzTallyReset=hzTallyReset; window.hzDistributionLine=hzDistributionLine;
     window.HZ_TALLY=HZ_TALLY; }catch(_){}



/* v91.17.283.21 · the 3-hour PKT window (00-03 ... 21-24) of an hour "hh": rain timing is said as its window, never as an hour */
function agnRainWindow(hh){ var h=parseInt(hh,10); if(!isFinite(h)) return ''; var b=(h+23)%24, a=b-(b%3), p=function(x){ return (x<10?'0':'')+x+':00'; }; return p(a)+'\u2013'+p(a+3); }   /* v283.23 audit 12: rain stamped hh fell in the preceding hour */
function agnRainSplit(name){
  try{ var d=(window.AGN&&AGN.day&&AGN.day.get)?(AGN.day.get()||0):0; if(d!==0) return null;
    var rec=(window.DISTRICT_IN||{})[name], f=rec&&rec.fc72; if(!f||!Array.isArray(f.rain)||!Array.isArray(f.time)||f.nowIdx==null) return null;
    var day=String(f.time[0]||'').slice(0,10), past=0, rest=0, lastWet=null, nPast=0, nRest=0;
    for(var i=0;i<f.time.length;i++){ if(String(f.time[i]).slice(0,10)!==day) break; var v=f.rain[i]; if(v==null||!isFinite(v)) continue;
      if(i<f.nowIdx){ past+=+v; nPast++; if(+v>=0.1) lastWet=String(f.time[i]).slice(11,13); } else { rest+=+v; nRest++; } }
    if(!nRest) return null;
    return {pastMm:Math.round(past*10)/10, restMm:Math.round(rest*10)/10, lastWetHour:lastWet, lastWetWindow:lastWet!=null?agnRainWindow(lastWet):null, nowHour:String(f.time[f.nowIdx]||'').slice(11,16), day:day};
  }catch(_){ return null; } }
try{ window.agnRainSplit=agnRainSplit; }catch(_){}



var __dhi={m:new Map(), epoch:0, hits:0, miss:0}, __dhiIds=(typeof WeakMap==='function')?new WeakMap():null, __dhiNext=1;
try{ ['agn:data','agn:national','agn:day','agn:layer','agn:enriched','agn:clim-anchors','agn:drought-national','agn:location','agn:sweep-done',
      'agn:scenario-active','agn:scenario-sweep','agn:project','agn:gate','agn:hazard'].forEach(function(ev){
       document.addEventListener(ev, function(){ __dhi.epoch++; __dhi.m.clear(); }); }); }catch(_){}
function __dhiRec(r){
  if(!r || typeof r!=='object' || !__dhiIds) return null;
  var h=0;
  for(var f in r){ var v=r[f], x;
    if(v==null) x=1;
    else if(typeof v==='number') x=isFinite(v)?(Math.round(v*1000)|0):7;
    else if(typeof v==='boolean') x=v?3:5;
    else if(typeof v==='string'){ x=v.length; for(var i=0;i<v.length;i++) x=(Math.imul(x,31)+v.charCodeAt(i))|0; }
    else { x=__dhiIds.get(v); if(!x){ x=__dhiNext++; __dhiIds.set(v,x); } }
    h=(Math.imul(h,31)+x+f.length)|0; }
  return h;
}
function districtHazardInfo(name){
  var key=null;
  try{
    var rec=(typeof DISTRICT_IN!=='undefined'&&DISTRICT_IN)?DISTRICT_IN[name]:null, rs=__dhiRec(rec);
    if(rs!=null){
      var day=0, basis='', lead=24;
      try{ day=AGN.day.get(); }catch(_){} try{ basis=AGN.day.basis(); }catch(_){}
      try{ lead=(typeof aiState!=='undefined'&&aiState.lead)||24; }catch(_){}
      key=name+'|'+currentMapLayer()+'|'+day+'|'+basis+'|'+lead+'|'+rs;
    }
  }catch(_){ key=null; }
  var now=Date.now(), e=key?__dhi.m.get(name):null;
  if(e && e.key===key && now-e.at<2000){
    __dhi.hits++;
    var v=e.val;
    if(v==null || v.dayAvailable===false) hzTallyNote(name,null,true);
    else hzTallyNote(name, v.score, !!v.noData, !!v.notApplicable);
    return v==null ? v : Object.assign({}, v);
  }
  __dhi.miss++;
  var out=districtHazardInfoRaw(name);
  if(key){ if(__dhi.m.size>4000) __dhi.m.clear(); __dhi.m.set(name, {key:key, at:now, val:(out==null?out:Object.assign({}, out))}); }
  return out;
}
window.__agnDhiStats=function(){ return {hits:__dhi.hits, miss:__dhi.miss, epoch:__dhi.epoch, held:__dhi.m.size}; };
function districtHazardInfoRaw(name){
  /* v91.17.283.24 · W1: in a browser a tehsil's level on the map layer is the issued run's (AGN.v283.issuedFor: GET /api/levels per
     layer and day, the map's one read), never a page score; the engine host (the server) derives it below */
  if(!agnEngineHost()){ var q=null; try{ q=(window.AGN&&AGN.v283&&AGN.v283.issuedFor)?AGN.v283.issuedFor(name):null; }catch(_){ q=null; }
    if(!q) q={nd:true, pending:true, why:'the issued levels are loading'};
    hzTallyNote(name, q.i!=null?q.i:null, q.i==null&&!q.na, !!q.na);
    return {score:null, publishedScore:null, served:true, level:(q.i!=null?q.i:null), levelLabel:(q.i!=null&&q.label)||null, categorical:false, provisional:!!q.pending, noData:q.i==null&&!q.na,
            notApplicable:!!q.na, notApplicableWhy:q.na?(q.why||'the hazard cannot happen here (the issued run)'):null, why:q.why||null, nt:!!q.nt, inc:!!q.inc, outr:!!q.outr, nr:!!q.nr}; }   /* v283.35 · B2: outside the method's range and no gauged reach travel to the key */   /* v91.17.283.32 · hotfix: the served state (not tested / input not current) travels to the legend */
  try{ var _mkw=(typeof window.__agnHzMaskWhy==='function')?window.__agnHzMaskWhy(name, currentMapLayer()):null;
       if(_mkw){ hzTallyNote(name,null,false,true); return {score:null, publishedScore:null, categorical:false, provisional:false, noData:false, notApplicable:true, notApplicableWhy:_mkw}; } }catch(_){}
  const inp=hzDayInput(name, currentMapLayer());
  if(!inp){ hzTallyNote(name,null,true); return null; }
  if(inp.__unavailable){ hzTallyNote(name,null,true);
    return {score:null, provisional:true, dayAvailable:false, dayBasis:'unavailable'}; }
  const lead=(typeof aiState!=='undefined'&&aiState.lead)||24;
  const r=aiDistrictRisk(inp, currentMapLayer(), lead, name);
  if(!r){ hzTallyNote(name,null,true); return null; }
  

  

  var _draw = (r.categorical===true && r.mapValue!=null) ? r.mapValue : r.score;
  hzTallyNote(name, _draw, !!r.noData, !!r.notApplicable);
   
  var _rdp=null; try{ if(currentMapLayer()==='rain_hz' && Array.isArray(r.drivers) && Array.isArray(r.metricLabels) && r.metricLabels[1]==='Chance of a rain day (%)' && r.drivers[1]!=null && isFinite(+r.drivers[1])) _rdp=+r.drivers[1]; }catch(_){ _rdp=null; }
  var _rsp=null; try{ if(currentMapLayer()==='rain_hz') _rsp=agnRainSplit(name); }catch(_){ _rsp=null; }
  return {score:_draw, publishedScore:r.score, rainDayP:_rdp, rainSplit:_rsp,
          physicalValue:(r.physicalValue!=null?r.physicalValue:null), physicalMeasurand:(r.physicalMeasurand||null), physicalUnit:(r.physicalUnit||null),    
          categorical:(r.categorical===true),
          mapValueWhy:(r.categorical===true ? (r.mapValueWhy||null) : null),
          category:(r.screeningBand!=null && r.categorical===true ? r.screeningBand : null),
          provisional:!!r.provisional, noData:!!r.noData,
          

          notApplicable:!!r.notApplicable, notApplicableWhy:(r.notApplicableWhy||null)};
}











const CONF_TIERS = {
  high:      {label:'High confidence',      color:'var(--sev-2)'},   
  med:       {label:'Medium confidence',    color:'var(--sev-3)'},   
  low:       {label:'Low confidence',       color:'var(--sev-4)'},   
  synthetic: {label:'Synthetic (no live data)', color:'var(--muted)'}
};

const CONF_RANK = {high:0, med:1, low:2, synthetic:3};

 
function _confWorse(a,b){ return (CONF_RANK[b]>CONF_RANK[a])?b:a; }

function machInversionRisk(s){
  if(!s) return {risk:false};
  
  
  
  let zone = s.zone || (s.terr && s.terr.zone) || null;
  if(!zone && typeof hzTerrainFor==='function'){
    const nm = s.district || s.name || s.key || s.id || null;
    if(nm){ try{ const _t=hzTerrainFor(nm, s.key||null); zone=_t&&_t.zone; }catch(e){} }
  }
  const confining = (zone==='highland' || zone==='high_mountain');
  const elev = (typeof s.elev==='number') ? s.elev : null;
  
  if(!confining && !(elev!=null && elev>=800)) return {risk:false};

  const now  = new Date();
  

  const mon  = (function(){ try{ if(window.MACH_TIME&&MACH_TIME.day) return +MACH_TIME.day(0).slice(5,7); }catch(_){}
                            return now.getMonth()+1; })();   
  

  const hour = (function(){ try{ if(window.MACH_TIME&&MACH_TIME.hour) return MACH_TIME.hour(); }catch(_){}
                            return now.getHours(); })();
  const coldSeason = (mon>=11 || mon<=2);
  const nightWindow = (hour>=20 || hour<=8);
  if(!coldSeason || !nightWindow) return {risk:false};

  const wind  = (typeof s.wind==='number') ? s.wind : null;          
  const cloud = (typeof s.cloud==='number') ? s.cloud
              : (typeof s.cloudCover==='number' ? s.cloudCover : null); 
  const blh   = (typeof s.blh==='number') ? s.blh
              : (typeof s.boundaryLayerHeight==='number' ? s.boundaryLayerHeight : null); 

  const calm  = (wind==null)  ? null : (wind < 6);
  const clear = (cloud==null) ? null : (cloud < 35);
  if(calm===false || clear===false) return {risk:false};   

  const why=[];
  if(blh!=null && blh<200){
    why.push(`boundary layer ${Math.round(blh)} m`);
    if(calm)  why.push(`wind ${Math.round(wind)} km/h`);
    if(clear) why.push(`cloud ${Math.round(cloud)}%`);
    return {risk:true, strength:'strong', why:why.join(', ')};
  }
  if(calm && clear){
    why.push(`wind ${Math.round(wind)} km/h`, `cloud ${Math.round(cloud)}%`);
    if(blh!=null) why.push(`BLH ${Math.round(blh)} m`);
    return {risk:true, strength:(blh!=null&&blh<400)?'strong':'possible', why:why.join(', ')};
  }
  return {risk:false};
}
window.machInversionRisk = machInversionRisk;

function stationConfidence(s){
  /* v91.17.283.12 · the confidence of a place is the point state's measured confidence (the held-out error of the chain that made the
     value, server/api/pointstate.mjs), in words, with its source word; no page-side tiering. */
  var P=window.AGN&&AGN.pointState, ps=(P&&s&&s.lat!=null)?P.peek(s.lat,s.lon):null, c=ps&&ps.confidence&&ps.confidence.now;
  if(!c) return {tier:'pending', label:'Reading\u2026', color:'#94a3b8', reasons:['The forecast for this place has not arrived yet.'], asOf:null, ageMin:null, source:'pending'};
  var COL={Good:'#14B8A6',Fair:'#f59e0b',Low:'#94a3b8'}, asOf=ps.now?Date.parse(ps.now.time+':00+05:00'):null;
  return {tier:'model', label:c.words+' confidence', color:COL[c.words]||'#94a3b8', reasons:[c.text+(c.status?' (measured: '+c.status+')':''), 'Source: '+((ps.source&&ps.source.label)||'')+'.'],
    asOf:asOf, ageMin:asOf!=null?Math.max(0,Math.round((Date.now()-asOf)/60000)):null, source:'pointstate', srcWord:P.sourceWord(ps)};
}
window.stationConfidence=stationConfidence;




function providerDisagreement(s){
  try{
    if(!window.mmState || window.mmState.source!=='live' || !window.mmState.series) return null;
    if(!s || typeof s.t!=='number') return null;
    const metnoModel=(window.MM_MODELS||[]).find(m=>m.provider==='metno');
    if(!metnoModel) return null;
    const ser=window.mmState.series[metnoModel.key];
    if(!ser || !ser.length || ser[0]==null) return null;
    
    if(window.mmState.station && window.mmState.station.id && s.id && window.mmState.station.id!==s.id) return null;
    if(window.mmState.variable && window.mmState.variable!=='temp') return null;
    return Math.abs(s.t - ser[0]);
  }catch(e){ return null; }
}
window.providerDisagreement=providerDisagreement;


function confChipHTML(conf, compact){
  if(!conf) return '';
  const title = conf.reasons && conf.reasons.length ? conf.reasons.join(' ') : conf.label;
  if(compact){
    return `<span class="conf-dot" style="background:${conf.color}" title="${conf.label}${conf.asOf?' · as of '+fmtAsOf(conf.asOf):''} — ${title.replace(/"/g,'&quot;')}"></span>`;
  }
  return `<span class="conf-chip" data-tier="${conf.tier}" style="--conf:${conf.color}" title="${title.replace(/"/g,'&quot;')}">
    <span class="conf-swatch" style="background:${conf.color}"></span>${conf.label}</span>`;
}
window.confChipHTML=confChipHTML;


function fmtAsOf(ts){
  if(typeof ts!=='number'||isNaN(ts)) return '\u2014';   /* v91.17.283.12: PKT at the source */
  try{ return new Date(ts).toLocaleTimeString('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit',hour12:false}); }catch(e){ return '\u2014'; }
}
window.fmtAsOf=fmtAsOf;
function asOfLineHTML(conf){
  if(!conf) return '';
  if(conf.tier==='pending'||!conf.asOf) return `<div class="asof">Reading the forecast for this place\u2026</div>`;
  var age=(window.AGN&&AGN.level&&AGN.level.age)?AGN.level.age.text(conf.asOf):'';
  return `<div class="asof">As of <b>${fmtAsOf(conf.asOf)}</b> PKT${age?` \u00b7 <span class="agn-age" data-ts="${conf.asOf}">${age}</span>`:''} \u00b7 ${conf.srcWord||'Model forecast'}</div>`;
}
window.asOfLineHTML=asOfLineHTML;




function agnGridGap(s){
  if(!s || s.lat==null || s.lon==null || s.gridLat==null || s.gridLon==null) return null;
  const R=6371, rad=x=>x*Math.PI/180;
  const dLat=rad(s.gridLat-s.lat), dLon=rad(s.gridLon-s.lon);
  const a=Math.sin(dLat/2)**2 + Math.cos(rad(s.lat))*Math.cos(rad(s.gridLat))*Math.sin(dLon/2)**2;
  const km=2*R*Math.asin(Math.min(1,Math.sqrt(a)));
  const pe=(typeof s.elev==='number')?s.elev:null;
  const ge=(typeof s.echoedElev==='number')?s.echoedElev:((typeof s.gridElev==='number')?s.gridElev:null);
  const dz=(pe!=null && ge!=null) ? Math.round(ge-pe) : null;
  return { km:Math.round(km*10)/10, pointElevM:pe, gridElevM:ge, elevDeltaM:dz };
}
try{ window.agnGridGap=agnGridGap; }catch(_){}
function agnGridGapLine(s){
  const g=agnGridGap(s); if(!g) return '';
  

  if(g.km < 1.5 && (g.elevDeltaM==null || Math.abs(g.elevDeltaM) < 60)) return '';
  const dz = (g.elevDeltaM==null) ? ''
    : (g.elevDeltaM===0 ? ', at the same height'
       : (', ' + Math.abs(g.elevDeltaM) + ' m ' + (g.elevDeltaM>0?'above':'below') + ' this point'));
  const heed = (g.km>=8 || (g.elevDeltaM!=null && Math.abs(g.elevDeltaM)>=250));
  return '<div class="asof" style="flex-basis:100%;margin:0'
    + (heed?';color:#8a5a00' :'') + '" title="The model grid cell the provider answered from, '
    + 'measured against the place this card names. Terrain between the two is not represented '
    + 'in this reading.">Model cell <b>' + g.km.toFixed(1) + ' km</b> from this place' + dz
    + (heed ? ' \u2014 read this as area weather, not a point reading.' : '.') + '</div>';
}
function renderCCConfidence(s){
  const host=document.getElementById('ccConf'); if(!host) return;
  const conf=(typeof stationConfidence==='function')?stationConfidence(s):null;
  if(!conf){ host.innerHTML=''; return; }
  const chip=confChipHTML(conf,false);
  const asof=asOfLineHTML(conf);
  const gap=agnGridGapLine(s);
  host.innerHTML=`${chip}${asof?`<div style="flex-basis:100%;margin:0">${asof.replace('margin:5px 12px 0','margin:0')}</div>`:''}${gap}`;
}
window.renderCCConfidence=renderCCConfidence;



function districtConfidence(inp, terr){
  const reasons=[];
  const live=!!(inp && (inp.weatherLive || inp.featureLive));
  if(!live){
    return {tier:'synthetic', ...CONF_TIERS.synthetic,
      reasons:['District not yet live-loaded — showing the deterministic seed. Click Refresh or load district context.'],
      asOf:null, source:'synthetic'};
  }
  let tier='high';
  

  const _eMin = (typeof terr?.emin==='number') ? terr.emin : (typeof terr?.eMin==='number' ? terr.eMin : null);
  const _eMax = (typeof terr?.emax==='number') ? terr.emax : (typeof terr?.eMax==='number' ? terr.eMax : null);
  if(_eMin!=null && _eMax!=null){
    const spread=_eMax-_eMin;
    

    const _ts=FR('confidence.terrainSpreadM');
    if(spread>_ts.demoteToLow){ tier=_confWorse(tier,'low'); reasons.push(`Terrain spans ${Math.round(_eMin)}–${Math.round(_eMax)} m — one centroid forecast can't represent the whole unit.`); }
    else if(spread>_ts.demoteToMed){ tier=_confWorse(tier,'med'); reasons.push(`Terrain range ${Math.round(_eMin)}–${Math.round(_eMax)} m — centroid is a rough average.`); }
  }
  
  const ts=(typeof inp.districtFetchedAt==='number')?inp.districtFetchedAt
          :(inp.liveMeta && inp.liveMeta.time ? Date.parse(inp.liveMeta.time):null);
  let ageMin=null;
  if(typeof ts==='number' && !isNaN(ts)){
    ageMin=Math.max(0,Math.round((Date.now()-ts)/60000));
      const _da=FR('confidence.dataAgeMin');
      if(ageMin>_da.demoteToLow){ tier=_confWorse(tier,'low'); reasons.push(`District data ${ageMin} min old — past the 3-hour window.`); } else if(ageMin>_da.demoteToMed){ tier=_confWorse(tier,'med'); reasons.push(`District data ${ageMin} min old.`); }
  }
  if(tier==='high' && !reasons.length) reasons.push('Live district inputs; terrain well-represented by the centroid.');
  return {tier, ...CONF_TIERS[tier], reasons,
    asOf:(typeof ts==='number'&&!isNaN(ts))?ts:null, ageMin,
    source:(inp.liveMeta&&inp.liveMeta.source)?inp.liveMeta.source:'mach'};
}
window.districtConfidence=districtConfidence;

const districtLayer = L.geoJSON(PK_DISTRICTS,{
  style: f=>{
    const p=f.properties, disp=p.province===IIOJK;
    if(disp) return { fill:true, fillColor:"#c8d2da", fillOpacity:1, weight:Math.max(0.6,dwt()), color:"rgba(128,128,128,.9)", dashArray:"3,2" };
    if(p.dq===true) return { fill:true, fillColor:NODATA_FILL, fillOpacity:.7, weight:dwt(), color:"#ffffff", dashArray:"2,3" }; 
    if(districtHazardMode){
      const hi=districtHazardInfo(p.key);
      

      if(hi && hi.notApplicable) return { fill:true, fillColor:(typeof NA_FILL!=='undefined'?NA_FILL:'rgba(0,0,0,0)'), fillOpacity:0, weight:dwt(), color:"#ffffff" };    
      if(hi==null || hi.score==null) return { fill:true, fillColor:NODATA_FILL, fillOpacity:.7, weight:dwt(), color:"#ffffff" };
      if(hi.provisional) return { fill:true, fillColor:NODATA_FILL, fillOpacity:.55, weight:dwt(), color:"#ffffff", dashArray:"2,3" }; 
      

      return { fill:true, fillColor:hazardFillFor(currentMapLayer(), hi.score, hi), fillOpacity:0.92, weight:dwt(), color:"#ffffff" };
    }
    if(districtAqiMode){
      

      const _aqiDay=(function(){try{return (window.AGN&&AGN.day&&AGN.day.get)?AGN.day.get():0;}catch(_){return 0;}})();
      if(_aqiDay>0) return { fill:true, fillColor:NODATA_FILL, fillOpacity:.55, weight:dwt(), color:"#ffffff", dashArray:"2,3" };
      const inp=DISTRICT_IN[p.key];
      if(!inp || inp.aqi==null) return { fill:true, fillColor:"#e5ebf0", fillOpacity:.7, weight:dwt(), color:"#ffffff" };
      return { fill:true, fillColor:aqiBand(inp.aqi).color, fillOpacity:0.92, weight:dwt(), color:"#ffffff" };
    }
    

    const c=(function(){
      try{
        const day=(window.AGN&&AGN.day&&AGN.day.get)?AGN.day.get():0;
        if(day>0) return (typeof window.agnComfortDay==='function')?window.agnComfortDay(p.key,day):null;   /* v283.35: the server's day value */
      }catch(_){ return null; }
      return districtComfortByName(p.key);
    })();
    if(!c) return { fill:true, fillColor:"#e5ebf0", fillOpacity:.7, weight:dwt(), color:"#ffffff" };
    return { fill:true, fillColor:(c.level!=null&&window.AGN&&AGN.comfort35?AGN.comfort35.classFill[c.level]:diFill(c.di)), fillOpacity:0.92, weight:dwt(), color:"#ffffff" };   /* v283.35 · L2: the colour of the server's class (full precision), never of a rounded value */
  },
  onEachFeature:(f,l)=>{
    const d=f.properties;
    l.bindTooltip(`${d.tehsil||d.district}<span class="dt-sub">${d.dq===true?'No data (unresolved admin)':d.province===IIOJK?'IIOJK (disputed)':d.district+' · '+d.province}</span>`,
      {sticky:true,direction:"top",className:"dist-tip"});
    l.on('mouseover',()=>{ if(districtsOn) l.setStyle({weight:2,color:"#0C3851"}); });
    l.on('mouseout',()=>{ if(districtsOn && d.key!==selectedDistrict) districtLayer.resetStyle(l); });
    l.on('click',()=>{ if(districtsOn){
      selectDistrict(d, l);
    } });
  }
});


var __rdh={last:0,t:0,n:0,merged:0};
function __rdhRun(){
  __rdh.t=0; __rdh.last=Date.now(); __rdh.n++;
  if(typeof districtLayer!=='undefined' && districtLayer.eachLayer){
    districtLayer.eachLayer(l=>districtLayer.resetStyle(l));
    if(typeof drawLegend==='function') setTimeout(drawLegend,0);
  }
}
function refreshDistrictHazard(){
  var gap=Date.now()-__rdh.last;
  if(!__rdh.t && gap>=300){ __rdhRun(); return; }
  __rdh.merged++;
  if(!__rdh.t) __rdh.t=setTimeout(__rdhRun, Math.max(0,300-gap));
}
window.__agnMapRefreshStats=function(){ return {repaints:__rdh.n, merged:__rdh.merged}; };
function setDistrictHazardMode(on){
  districtHazardMode=!!on;
  refreshDistrictHazard();
}




function setDistrictLayer(on){
  districtsOn=on;
  if(typeof drawLegend==='function') setTimeout(drawLegend,0);
  if(on){ districtLayer.addTo(map); districtLayer.bringToFront();
    Object.values(markers).forEach(m=>m._icon && m.setZIndexOffset(1200)); }
  else { map.removeLayer(districtLayer); selectedDistrict=null; hideDistrictPanel(); }
}



map.on('zoomend', ()=>{
  try{
    if(districtsOn && districtLayer){ districtLayer.eachLayer(l=>districtLayer.resetStyle(l)); districtLayer.bringToFront(); }
    if(window.indusLayer){ const z=map.getZoom(); window.indusLayer.setStyle&&window.indusLayer.setStyle({opacity: z>=6?0.85:0.45}); }
  }catch(e){ console.warn('[mach] zoom restyle failed:', e.message); }
});



/* v91.17.283.20 · B7: the Indus toggle is agn-ffd-indus-calibration's (the river course); the earlier hand-typed barrage list and its toggle are deleted */

function nearestStation(lat,lon){
  let best=null,bd=1e9;
  STATIONS.forEach(s=>{ const dd=(s.lat-lat)**2+(s.lon-lon)**2; if(dd<bd){bd=dd;best=s;} });
  return best;
}
function districtOf(s){
  
  let found=null;
  districtLayer.eachLayer(l=>{
    if(found) return;
    const ll=L.latLng(s.lat,s.lon);
    if(l.getBounds().contains(ll)){
      
      if(leafletContains(l,ll)) found=l.feature.properties;
    }
  });
  return found;
}
function leafletContains(layer,latlng){
  const poly=layer.feature.geometry;
  const pt=[latlng.lng,latlng.lat];
  const rings = poly.type==='Polygon'?poly.coordinates:[].concat(...poly.coordinates);
  
  const ring = poly.type==='Polygon'?poly.coordinates[0]:poly.coordinates[0][0];
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    const hit=((yi>pt[1])!==(yj>pt[1])) && (pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi);
    if(hit) inside=!inside;
  }
  return inside;
}
function selectDistrict(d, layer){
  selectedDistrict=d.key;
  districtLayer.eachLayer(l=>districtLayer.resetStyle(l));
  layer.setStyle({weight:2.6,color:"#0C3851"});
  layer.bringToFront();
  showDistrictPanel(d, layer);
}

function showDistrictPanel(d, layer){
  

}
function hideDistrictPanel(){
   
  if(selectedDistrict){ districtLayer.eachLayer(l=>districtLayer.resetStyle(l)); selectedDistrict=null; }
}


function applyLayerStyle(layer){
  const palettes={
    temperature:{"Sindh":"#e31a1c","Punjab":"#fd8d3c","Khyber Pakhtunkhwa":"#fdae61",
      "Balochistan":"#fecc5c","Federal Capital":"#fecc5c","Gilgit Baltistan":"#74add1","Azad Kashmir":"#abd9e9"},
    rainfall:{"Sindh":"#2f7df6","Punjab":"#58e3ff","Khyber Pakhtunkhwa":"#20d3f5",
      "Balochistan":"#8bd3dd","Federal Capital":"#58e3ff","Gilgit Baltistan":"#74add1","Azad Kashmir":"#118ab2"},
    wind:{"Sindh":"#14B8A6","Punjab":"#42e49b","Khyber Pakhtunkhwa":"#059669",
      "Balochistan":"#5B9AA0","Federal Capital":"#42e49b","Gilgit Baltistan":"#2dd4bf","Azad Kashmir":"#7FB069"},
    comfort:{"Sindh":"#7e22ce","Punjab":"#c084fc","Khyber Pakhtunkhwa":"#a855f7",
      "Balochistan":"#d8b4fe","Federal Capital":"#c084fc","Gilgit Baltistan":"#93c5fd","Azad Kashmir":"#8b5cf6"},
      
    radar:{"Sindh":"#E6B655","Punjab":"#7FB069","Khyber Pakhtunkhwa":"#14B8A6","Balochistan":"#C97B63","Federal Capital":"#3A4B5F","Gilgit Baltistan":"#8B7AA8","Azad Kashmir":"#9FB89A"},
    satellite:PROV_FILL
  };
  provLayer.eachLayer(l=>{
    const p=l.feature.properties.province, disp=p===IIOJK;
    if(disp){ l.setStyle({fillColor:"#CCCCCC",fillOpacity:layer==='satellite'?0.22:0.44,color:"#808080",weight:1.2,dashArray:"4,3"}); return; }
    
    
    
    
    let fill, fillOpacity;
    const fk = (typeof activeFillKind==='function') ? activeFillKind() : 'comfort';
    if(fk.startsWith('hazard:') && window.MACH_V10 && window.MACH_V10.provinceShade && typeof hazardFillFor==='function'){
      const hz=fk.slice(7);
      

      const sc=window.MACH_V10.provinceShade(p, hz);
      
      
      fill = (sc!=null)?hazardFillFor(hz, sc):NODATA_FILL; fillOpacity=0.82;
       
      try{ if(sc!=null && window.AGN && AGN.hz5 && AGN.hz5.isHazardLayer(hz)){ var _hzo=AGN.hz5.opacityOf(fill); if(_hzo!=null) fillOpacity=_hzo; } }catch(_){}
    } else if(fk==='aqi' && typeof aqiBand==='function'){
      

      var _worst=null;
      try{ var _D=window.DISTRICT_IN||{}; var _prov={}; try{ ((typeof PK_DISTRICT_CENTROIDS!=='undefined')?PK_DISTRICT_CENTROIDS:[]).forEach(function(c){ if(c&&c.key) _prov[c.key]=c.province; if(c&&c.district&&!_prov[c.district]) _prov[c.district]=c.province; }); }catch(_){}
           Object.keys(_D).forEach(function(k){ var r=_D[k]; if(!r) return; var pv=r.province||_prov[k]||null; if(pv!==p||r.aqi==null||!isFinite(r.aqi)) return; if(_worst==null||r.aqi>_worst) _worst=r.aqi; }); }catch(_){}
      fill=(_worst!=null)?aqiBand(_worst).color:((typeof NODATA_FILL!=='undefined')?NODATA_FILL:'#B9BEC4'); fillOpacity=0.82;
    } else {
      fill=(palettes[layer]||PROV_FILL)[p]||PROV_FILL[p]||"#bbb";
      fillOpacity = layer==='satellite' ? 0.12 : layer==='radar' ? 0.34 : 0.58;
    }
    const stroke = layer==='satellite' ? "rgba(255,255,255,.55)" : "#ffffff";
    l.setStyle({fillColor:fill,fillOpacity,color:stroke,weight:1.05,dashArray:null});
  });
}

function refreshProvinceFill(){
  if(typeof applyLayerStyle==='function' && typeof activeLayer!=='undefined'){
    try{ applyLayerStyle(activeLayer); }catch(e){}
  }
}
window.refreshProvinceFill=refreshProvinceFill;


/* v91.17.283.17 · the place the page opens at. With a place handed over by the start page (AGN_BOOT.place, read in the head) the page
   opens there under the start page's own label: a live point is made for it before the station pins are drawn and before any section
   reads the selected station (its weather from the handed-over point-state record of the current run, else empty until the page store
   reads it once). Without a handed-over place the page opens at the person's last place, else on "choose a place" (v283.36 item 14: no default Islamabad). */
(function agnBootStation(){ var B=window.AGN_BOOT, P=B&&B.place; if(!P) return;
  var h=B.handoff, n=(h&&h.ps&&h.ps.now)||{}, f=function(v,d){ return v!=null&&isFinite(v)?Number(Number(v).toFixed(d)):null; };
  STATIONS.push({id:'__live', name:P.name||'Selected point', lat:P.lat, lon:P.lon, t:f(n.tempC,1), feels:f(n.feelsC,1), hum:n.rh!=null?Math.round(n.rh):null, wind:n.windKmh!=null?Math.round(n.windKmh):null,
    gust:n.gustKmh!=null?Math.round(n.gustKmh):null, rain:f(n.rainMm,1), uv:n.uv!=null?Math.round(n.uv):null, cond:'No reading yet', em:'—', sev:2, aqi:null, pm25:null, alert:null,
    __live:true, __boot:true, weatherLive:!!h, liveSource:'pointstate', liveFetchedAt:Date.now(), elev:h&&h.ps.point&&h.ps.point.elevM!=null?h.ps.point.elevM:null, gridElev:null});
  B.booted=true; })();
let markers={}, selectedId=(window.AGN_BOOT&&window.AGN_BOOT.booted)?"__live":null;   /* v283.36 item 14: no implicit Islamabad */

let DAY_OFFSET=0; 

function effStation(s){
  if(DAY_OFFSET===0){
    

    try{
      if(window.AGN && AGN.data){
        var ap=AGN.data.activePoint();
        if(ap && s && s.lat!=null && s.lon!=null
           && Math.abs(ap.lat-s.lat)<0.05 && Math.abs(ap.lon-s.lon)<0.05
           && (Date.now()-ap.fetchedAt)<20*60*1000){
          return Object.assign({}, s, {
            t: ap.t!=null?ap.t:s.t,
            hum: ap.hum!=null?ap.hum:s.hum,
            rain: ap.rain!=null?ap.rain:s.rain,
            wind: ap.wind!=null?ap.wind:s.wind,
            gust: ap.gust!=null?ap.gust:s.gust,
            weatherLive:true, dataSource:'live', storeOverlay:true
          });
        }
      }
    }catch(_){}
    return s;
  }
  
  const hist=window.MACH_HISTORY && window.MACH_HISTORY.getSnapshot
    ? window.MACH_HISTORY.getSnapshot(s,DAY_OFFSET) : null;
  if(!hist) return {...s, historyPending:true, historyUnavailable:true};
  return {...s,...hist, historical:true, historySource:'gridded global reanalysis'};
}

const STATION_DISTRICT={};
STATIONS.forEach(s=>{
  let best=null,bd=1e9;
  PK_DISTRICT_CENTROIDS.forEach(d=>{ if(d.province===IIOJK) return; const dd=(d.lat-s.lat)**2+(d.lon-s.lon)**2; if(dd<bd){bd=dd;best=d;} });
  STATION_DISTRICT[s.id]=best;
});

function activeFillKind(){
  if(typeof districtAqiMode!=='undefined' && districtAqiMode) return 'aqi';
  if(typeof districtHazardMode!=='undefined' && districtHazardMode){
    

    var _lay=null; try{ _lay=(typeof currentMapLayer==='function')?currentMapLayer():null; }catch(_){ _lay=null; }
    if(_lay && /^nss_/.test(_lay)) return 'hazard:'+_lay;
    const hz=_lay || ((typeof aiState!=='undefined' && aiState.hazard)?aiState.hazard:'flood');
    return 'hazard:'+hz;
  }
  return 'comfort';
}

/* v91.17.283.24 · W1: a station pin on a hazard layer shows the issued level of its tehsil in the map's issued run (AGN.v283.issuedFor: the
   one national read per layer and day), never a page score */
function pinServed(s,hz){ var V=window.AGN&&AGN.v283; if(!V||!V.issuedFor||!s||s.lat==null||s.lon==null) return null;
  var su=null; try{ su=AGN.siteUnit?AGN.siteUnit(+s.lat,+s.lon):null; }catch(_){ su=null; }
  if(!su||su.province===IIOJK) return {level:null, noDataWhy:'the station lies in no tehsil NIGRAAN issues levels for'};
  var q=V.issuedFor(su.key,hz)||{nd:true}, W=(AGN.level&&AGN.level.words)||['Normal','Low','Moderate','High','Severe'];
  return q.i!=null?{level:q.i, category:W[q.i], levelLabel:q.label||null, categoryLabel:(q.label||W[q.i])+' \u00b7 the issued level of '+(su.tehsil||su.key)+' tehsil'}
    :{level:null, noDataWhy:q.na?'the hazard cannot occur here':q.pending?'the issued levels are loading':(q.why||'no level issued')}; }
function pinFillState(s){
  const c=stationComfort(s);
  const kind=activeFillKind();
  if(kind==='aqi'){
    const a=(s.aqi!=null)?s.aqi:(c&&c.aqi);
    return {label:(a!=null?Math.round(a):'—'), score:(a!=null?Math.min(100,a/3):null), color:(a!=null&&typeof aqiBand==='function')?aqiBand(a).color:null};
  }
  if(kind.startsWith('hazard:')){
    const hz=kind.slice(7);
    try{
      

      if(AGN.hazardValue && AGN.hazardValue.isCategorical(hz)){
        const _u=STATION_DISTRICT[s.id]?.district||'';
        const _cls=AGN.hazardValue.classAt(_u, hz);
        const _shade=AGN.hazardValue.shadeAt(_u, hz);
        return { label:(_cls||'—'), score:null, categorical:true, category:_cls,
                 shade:_shade,
                 color:(_shade!=null&&typeof hazardFill==='function')?hazardFill(_shade):null };
      }
      /* v91.17.283.24 · W1: the pin colour is the issued level of the station's tehsil on the dashboard's day (pinServed) */
      const _r=pinServed(s,hz);
      if(_r&&_r.level!=null) return {label:_r.category, score:null, level:_r.level, color:(AGN.hz5&&AGN.hz5.fill)?AGN.hz5.fill[_r.level]:null};
      return {label:'\u2014', score:null, color:null, why:_r?_r.noDataWhy:null};
    }catch(e){}
    return {label:'\u2014', score:null, color:null};
  }
  
  return {label:Math.round(c.di), score:c.heatStress, color:(typeof diFill==='function')?diFill(c.di):null};
}




function pinMeasure(s, kind, c, st){
  /* v91.17.283.12: the chip's temperature is the place's point state (AGN.pointState), printed with the one rule (0.1 C) */
  var _ps=null; try{ _ps=(window.AGN&&AGN.pointState&&s&&s.lat!=null)?AGN.pointState.peek(s.lat,s.lon):null; }catch(_){ _ps=null; }
  var T = (_ps&&_ps.now&&_ps.now.tempC!=null) ? AGN.pointState.fmt(_ps.now.tempC) : null;
  /* v283.36 · launch item 11 · the selected place's pin prints the one "now" value of the toolbar and the panel (AGN.nowShown) */
  try{ var _ns=window.AGN&&AGN.nowShown; if(_ns&&_ns.t!=null&&s&&s.lat!=null&&Math.abs(+s.lat-_ns.lat)<1e-3&&Math.abs(+s.lon-_ns.lon)<1e-3) T=AGN.pointState.fmt(_ns.t); }catch(_){}
  var tempSub = (T!=null) ? (T + '\u00b0C air now') : null;   /* v91.17.283.2 S10g · the pins carry the air temperature now, whatever day or hour the map colours show */
  if(kind==='aqi'){
    var a=(s.aqi!=null)?s.aqi:(c&&c.aqi);
    return { value:(a!=null?Math.round(a):'\u2014'), unit:' AQI', sub:tempSub,
             title:(a!=null ? 'Air quality index '+Math.round(a)+' (EPA scale, modelled)'
                            : 'Air quality index not held for this station')
                   +(T!=null?' \u00b7 air temperature '+T+' \u00b0C':'') };
  }
  if(kind && kind.indexOf('hazard:')===0){
    var hz=kind.slice(7);
    

    var label=hz, _sv=pinServed(s,hz);   /* W1: the issued level of the station's tehsil */
    if(_sv&&_sv.level!=null) return { value:_sv.category, unit:'', sub:tempSub, title:label+' \u00b7 '+(_sv.categoryLabel||_sv.category)+(T!=null?' \u00b7 air temperature '+T+' \u00b0C':'') };
    if(_sv) return { value:'\u2014', unit:'', sub:tempSub, title:label+' \u00b7 not assessed: '+_sv.noDataWhy+(T!=null?' \u00b7 air temperature '+T+' \u00b0C':'') };
    return { value:'\u2014', unit:'', sub:tempSub, title:label+' \u00b7 reading the issued levels'+(T!=null?' \u00b7 air temperature '+T+' \u00b0C':'') };
  }
  if(kind==='temp'){
    return { value:(T!=null?T:'\u2014'), unit:'\u00b0C', sub:null,
             title:(T!=null?'Air temperature now '+T+' \u00b0C ('+AGN.pointState.sourceWord(_ps).toLowerCase()+')':'Reading the forecast for this place') };
  }
   
  var di=(c&&Number.isFinite(+c.di))?Math.round(+c.di):null;
  return { value:(di!=null?di:'\u2014'), unit:' DI', sub:tempSub,
           title:(di!=null?'Discomfort index '+di+' (Thom, \u00b0C-equivalent)'
                          :'Discomfort index not held for this station')
                 +(T!=null?' \u00b7 air temperature '+T+' \u00b0C':'') };
}
try{ window.pinMeasure=pinMeasure; }catch(_){}

function pinHtml(s,sel){
  const c=stationComfort(s);
  const st=pinFillState(s);
  const kind=activeFillKind();
  
  const badgeStyle = st.color ? `style="background:${st.color};color:${_pinTextOn(st.color)}"` : '';
  
  
  const bodyT = (s.t!=null&&Number.isFinite(+s.t)) ? `${Math.round(+s.t)}°` : '—';
  

  

  const kindNow=activeFillKind();
  
  const meas=pinMeasure(s, kindNow, c, st);
  const badgeInner = `<span class="pv">${meas.value}</span><span class="pu">${meas.unit}</span>`;
  const bodyInner  = meas.sub ? `<span class="body"><span class="pt">${meas.sub}</span></span>` : '';
  const title = meas.title;
   
  return `<div class="wx-pin ${sel?'sel':''}${meas.value==='\u2014'?' nv':''}" title="${title}"><span class="temp" ${badgeStyle}>${badgeInner}</span>${bodyInner}</div>`;
}

function _pinTextOn(hex){
  try{ const h=hex.replace('#',''); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    return (0.299*r+0.587*g+0.114*b)>150 ? '#173a2b' : '#fff'; }catch(e){ return '#fff'; }
}
function popBadge(s, c, dl, hr){
  
  
  switch(activeLayer){
    case 'temperature': return hr.risk;                              
    case 'comfort':     return dl.badge;                             
    case 'rainfall': {                                               
      const r=rainOrNull(s); if(r==null) return 'No data';           
      return r>=5?'Wet':r>0?'Showers':'Dry';
    }
    case 'wind': {                                                   
       
      if(s.wind==null||!isFinite(+s.wind)) return 'Wind not retrieved';
      const w=+s.wind; return w>=40?'Strong wind':w>=25?'Breezy':'Light wind';
    }
    case 'aqi': {                                                    
      const a=(s.aqi!=null)?s.aqi:(c&&c.aqi); return (a!=null&&typeof aqiBand==='function')?aqiBand(a).label:(s.cond||'Air');
    }
    default:            return s.cond||dl.badge;                     
  }
}
function popHtml(s){
  /* v91.17.283.12 · the city popup is the city's point state (AGN.pointState: one record per place and model run, the value every
     section shows): now, today's range, humidity, wind, dew point and the UTCI heat-stress level; the confidence in words with the
     measured typical error; 'MACH forecast' only when the live MACH layer corrected the value, otherwise 'Model forecast'. */
  var P=window.AGN&&AGN.pointState, ps=(P&&s&&s.lat!=null)?P.peek(s.lat,s.lon):null, E=function(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  if(!ps||!ps.ok||!ps.now||ps.now.tempC==null){ if(P&&s&&s.lat!=null) P.get(s.lat,s.lon).then(function(v){ if(v) try{ refreshPins(); }catch(_){} });
    return '<div class="pop"><div class="top"><h4>'+E((s&&s.name)||'Station')+'</h4></div><div class="pop-dist">Reading the forecast for this place\u2026</div></div>'; }
  const n=ps.now, d0=(ps.days||[])[0]||null, c=stationComfort(s), dl=discomfortLevel(c.di,c), hr=heatRiskLabel(c.feels,(s&&s.temp!=null?+s.temp:null),s);
  const badge=popBadge(s,c,dl,hr), dist=STATION_DISTRICT[s.id];
  const distLine=dist?'<div class="pop-dist">'+E(dist.district)+' \u00b7 '+E(dist.province===IIOJK?'IIOJK (disputed)':dist.province)+'</div>':'';
  const conf=stationConfidence(s), chip=confChipHTML(conf,false), asOf=asOfLineHTML(conf);
  const I={Normal:0,Low:1,Moderate:2,High:3,Severe:4}, hcol=SEV[Math.max(1,(I[hr.risk]||0)+1)];
  const a=s.alert?'<div class="pop-alert" style="background:'+hexA(s.sev)+';color:'+SEV[s.sev]+'">'+E(s.alert)+'</div>':'';
  const r0=function(x){ return (x==null||!isFinite(x))?'\u2014':Math.round(x); };
  return '<div class="pop" data-agn-ps="'+E(ps.key)+'"><div class="top"><h4>'+E(s.name)+'</h4><span class="pt">'+badge+'</span></div>'+distLine
    +(chip?'<div style="margin:6px 0 2px">'+chip+'</div>':'')
    +'<div class="big"><div class="tt">'+P.fmt(n.tempC)+'\u00b0</div><div><div class="cond">'+E(s.cond||'')+'</div>'
    +'<div style="font-size:0.75rem;color:var(--muted);font-weight:600">Feels '+(n.feelsC!=null?r0(n.feelsC)+'\u00b0':'\u2014')+(d0?' \u00b7 today '+r0(d0.tminC)+'\u2013'+r0(d0.tmaxC)+'\u00b0':'')+'</div></div></div>'
    +'<div class="met"><div><div class="k">Humidity</div><div class="v">'+(n.rh!=null?r0(n.rh)+'%':'\u2014')+'</div></div>'
    +'<div><div class="k">Wind</div><div class="v">'+(n.windKmh!=null?r0(n.windKmh)+' km/h':'\u2014')+'</div></div>'
    +'<div><div class="k">Dew point</div><div class="v">'+(n.dewC!=null?r0(n.dewC)+'\u00b0':'\u2014')+'</div></div>'
    +'<div><div class="k">Heat stress</div><div class="v" style="color:'+hcol+'" title="'+E(hr.note)+' (Blazejczyk et al. 2013).">'+E(hr.risk)+'</div></div></div>'
    +asOf+a+'</div>';
}
function hexA(sev){ 
  return {1:"rgba(44,127,184,.12)",2:"rgba(65,171,93,.14)",3:"rgba(254,204,92,.22)",
          4:"rgba(253,141,60,.18)",5:"rgba(227,26,28,.15)"}[sev];
}
STATIONS.forEach(s=>{
  const m=L.marker([s.lat,s.lon],{
    icon:L.divIcon({className:"",html:pinHtml(s,s.id===selectedId),iconSize:[34,34],iconAnchor:[6,34],popupAnchor:[10,-34]}),
    riseOnHover:true, riseOffset:400, zIndexOffset:(s.id===selectedId?1000:0)
  }).addTo(map);
  m.bindPopup(popHtml(s),{closeButton:true,offset:[0,0]});
  m.on('click',()=>{ selectCity(s.id,false); try{ if(window.AGN&&AGN.selFocus) AGN.selFocus.mark(s.lat,s.lon); }catch(_){} });    
  markers[s.id]=m;
});

function refreshPins(){
  STATIONS.forEach(s0=>{
    const s=effStation(s0);
    markers[s0.id].setIcon(L.divIcon({className:"",html:pinHtml(s,s0.id===selectedId),
      iconSize:[34,34],iconAnchor:[6,34],popupAnchor:[10,-34]}));
    markers[s0.id].setZIndexOffset(s0.id===selectedId?1000:0);
    markers[s0.id].setPopupContent(popHtml(s));
  });
  
  document.querySelectorAll('#cityMenu button').forEach(b=>{
    const s=STATIONS.find(x=>x.id===b.dataset.id), tEl=s&&b.querySelector('.t');
    if(tEl) tEl.textContent=`${s.t}° ${s.em}`;
  });
}


function agnBootPlace(){ var B=window.AGN_BOOT, P=B&&B.booted&&B.place;
  /* v283.36 · launch item 14 · no default Islamabad. v91.17.283.37 · R4: without a handed-over place the page opens at the person's own
     location (agn-v37-autoloc); the last place, else "choose a place", only when there is no position */
  if(!P){ var fb=function(){ var LP=null; try{ LP=JSON.parse(localStorage.getItem('agn.lastPlace')||'null'); }catch(_){ LP=null; }
      if(LP&&LP.id&&STATIONS.some(function(x){ return x.id===LP.id; })){ selectCity(LP.id,false); return 'last'; }
      try{ document.getElementById('cityLabel').textContent='Choose a place'; document.getElementById('ccLoc').textContent='Choose a place'; }catch(_){}
      try{ document.documentElement.classList.add('agn-noplace'); }catch(_){}
      return 'choose'; };
    var go=function(){ if(window.AGNAutoLoc&&window.AGNAutoLoc.start(fb)) return; fb(); };   /* the R4 script is at the end of the body */
    if(window.AGNAutoLoc||document.readyState!=='loading') go(); else document.addEventListener('DOMContentLoaded',go); return; }
  selectCity('__live',false);
  try{ map.setView([P.lat,P.lon],Math.max(11,map.getZoom()),{animate:false}); map.__agnUserView=Date.now(); }catch(_){} }
/* v91.17.283.20 · B7 · THE ONE selectCity: the four save-and-wrap layers of v283.19 are deleted and their steps are here, in the order
   they ran: the map's selection gate (a programmatic select while the user's own pick is in flight is skipped, AGN.cityGate in
   agn-map76-js), the place search box is cleared unless a search is driving, the city itself (selectCityBody), then the feature panel
   (AGN.omFeature), the section location tabs (AGN.locTabs) and the place-name sync (AGN.placeSync, twice: at once and after 60 ms) */
function selectCity(id, recenter){
  if(window.AGN&&typeof AGN.cityGate==='function'&&AGN.cityGate(id)===false) return;
  { const _pin=document.getElementById('machPlaceInput'); if(_pin && !window.__machSearchDriving) _pin.value=''; }
  const r=selectCityBody(id, recenter);
  setTimeout(function(){ try{ if(window.AGN&&AGN.omFeature) AGN.omFeature.afterSelect(); }catch(_){} try{ if(window.AGN&&AGN.locTabs) AGN.locTabs.sync(); }catch(_){} try{ if(window.AGN&&AGN.placeSync) AGN.placeSync(); }catch(_){} },0);
  setTimeout(function(){ try{ if(window.AGN&&AGN.placeSync) AGN.placeSync(); }catch(_){} },60);
  return r;
}
function selectCityBody(id, recenter){
  const base=STATIONS.find(x=>x.id===id);
  if(!base){ console.warn('[selectCity] unknown station id:', id); return; }  
  selectedId=id;
  try{ if(window.__userAction&&id!=='__live'&&window.AGNAutoLoc) window.AGNAutoLoc.picked(null,null); }catch(_){}   /* v91.17.283.37 · R4 */
  try{ document.documentElement.classList.remove('agn-noplace'); if(window.__userAction&&id!=='__live'){ window.__agnUserCity=true; localStorage.setItem('agn.lastPlace',JSON.stringify({id:id})); } }catch(_){}
  const s=effStation(base);
  

  try{ if(window.aiState){ aiState.station=s; } }catch(_){}
  

  

  try{ if(window.AGN&&AGN.data&&s&&s.lat!=null){ AGN.data.setActive(s); } }catch(_){}
  
  document.getElementById('cityLabel').textContent = s.name;   /* v91.17.283.17: the header names the place as the bar does (syncHeader); it wrote the city-menu zone name ("Islamabad / Rawalpindi") first */
  document.getElementById('ccLoc').textContent = s.name;
  document.getElementById('hourSub').textContent = `${s.name} · ${DAY_OFFSET===0?'next 24 hours':'historical reanalysis'} · PKT`;
  
  
  
  setTimeout(function(){ try{ if(typeof attachInfoDots==='function') attachInfoDots(); }catch(e){} }, 0);
  
  

  (function(_s){
    var _el=document.getElementById('ccTemp'); if(!_el) return;
    if(!(window.AGN&&AGN.ccOwned&&AGN.ccOwned())) _el.textContent=_s.t;    
    try{
      var _off=(typeof DAY_OFFSET!=='undefined')?DAY_OFFSET:0;
      if(_off!==0 || !(window.AGN&&AGN.urbanNow)
         || !Number.isFinite(Number(_s.lat))||!Number.isFinite(Number(_s.lon))){
        if(window.AGN&&AGN.urbanNow) AGN.urbanNow.note(null,_s);
        return;
      }
      AGN.urbanNow.get(_s.lat,_s.lon).then(function(u){
         
        if(typeof selectedId!=='undefined' && selectedId!==_s.id) return;
        if(!u || !isFinite(u.nowC) || !isFinite(Number(_s.t))){ AGN.urbanNow.note(null,_s); return; }
        

        _el.textContent = _s.t;
        AGN.urbanNow.note(u,_s);
      });
    }catch(_){}
  })(s);
  document.getElementById('ccCond').textContent=s.cond;
  document.getElementById('ccIcon').textContent='';
  if(!(window.AGN&&AGN.ccOwned&&AGN.ccOwned())) document.getElementById('ccFeels').textContent=(s.feels==null?"—":s.feels+"°");
  if(!(window.AGN&&AGN.ccOwned&&AGN.ccOwned())) document.getElementById('ccHum').innerHTML=s.hum+'<small>%</small>';
  if(!(window.AGN&&AGN.ccOwned&&AGN.ccOwned())) document.getElementById('ccWind').innerHTML=s.wind+' <small>km/h</small>';
  { const _r=document.getElementById('ccRain'); if(_r) _r.innerHTML=(function(){var _rv=rainOrNull(s);return (_rv!=null?_rv.toFixed(1):NODATA_GLYPH);})()+' <small>mm</small>'; }
  document.getElementById('ccUV').textContent=(s.uv!=null?s.uv:NODATA_GLYPH);    
  if(typeof window.renderCCConfidence==='function') window.renderCCConfidence(s);
  updatePremiumComfort(s);
  
  [...document.querySelectorAll('#cityMenu button')].forEach(b=>
    b.setAttribute('aria-current', b.dataset.id===id ? 'true':'false'));
  drawSpark(s); drawHourly(s); drawRailAlerts();
  drawImpact(s);
  mmOnCity(s);
  loadHourlyAndRedraw(base);
  if(typeof aiOnCity==='function') aiOnCity(s);
  refreshPins();
  

  if(recenter){
    if(Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon))){
      

      if(window.AGN&&AGN.selFocus) AGN.selFocus.recenter(s, id==='__live');
      else map.setView([Number(s.lat),Number(s.lon)], Math.max(11, map.getZoom()), {animate:false});
    } else {
      try{ console.warn('[AGN] selectCity: no usable coordinate for '
                        +(s&&s.name||id)+'; the map was not moved'); }catch(_){}
    }
  }
  if(window.__userAction){ markers[id].openPopup(); }
}




function applyActiveStation(s, label, recenter){
  
  if(STATIONS.find(x=>x.id===s.id)) selectedId = s.id;
  document.getElementById('cityLabel').textContent = label || s.name;
  document.getElementById('ccLoc').textContent = s.name;
  document.getElementById('hourSub').textContent = `${s.name} · ${DAY_OFFSET===0?'next 24 hours':'historical reanalysis'} · PKT`;
  if(!(window.AGN&&AGN.ccOwned&&AGN.ccOwned())) document.getElementById('ccTemp').textContent=s.t;    
  if(s.cond)document.getElementById('ccCond').textContent=s.cond;
  document.getElementById('ccIcon').textContent='';
  if(!(window.AGN&&AGN.ccOwned&&AGN.ccOwned())) document.getElementById('ccFeels').textContent=(s.feels==null?"—":s.feels+"°");
  if(!(window.AGN&&AGN.ccOwned&&AGN.ccOwned())) document.getElementById('ccHum').innerHTML=s.hum+'<small>%</small>';
  if(!(window.AGN&&AGN.ccOwned&&AGN.ccOwned())) document.getElementById('ccWind').innerHTML=s.wind+' <small>km/h</small>';
  { const _r=document.getElementById('ccRain'); if(_r) _r.innerHTML=(function(){var _rv=rainOrNull(s);return (_rv!=null?_rv.toFixed(1):NODATA_GLYPH);})()+' <small>mm</small>'; }
  document.getElementById('ccUV').textContent=(s.uv!=null?s.uv:NODATA_GLYPH);    
  if(typeof window.renderCCConfidence==='function') window.renderCCConfidence(s);
  updatePremiumComfort(s);
  drawSpark(s); drawHourly(s); drawRailAlerts(); drawImpact(s);
  mmOnCity(s);
  if(STATIONS.find(x=>x.id===s.id)) loadHourlyAndRedraw(s);
  if(typeof aiOnCity==='function') aiOnCity(s);
  refreshPins();
  if(recenter && s.lat && s.lon){ if(window.AGN&&AGN.selFocus) AGN.selFocus.recenter(s, false); else map.setView([s.lat,s.lon], Math.max(11, map.getZoom()), {animate:false}); }    
}





function setBar(id,pct){ const el=document.getElementById(id); if(!el) return;
  const known=(pct!=null&&isFinite(pct));
  el.style.width=(known?clamp(Math.round(pct),0,100):0)+'%';
  if(known) el.removeAttribute('data-absent'); else el.setAttribute('data-absent','1'); }
function updatePremiumComfort(s){
  const c=stationComfort(s), dl=discomfortLevel(c.di,c), hr=heatRiskLabel(c.feels,(s&&s.temp!=null?+s.temp:null),s), rec=recoveryWindow(s,c), bw=bestOutdoorWindow(c,s);   

  const scoreAngle=Math.round(c.comfortScore/100*360);
  const ring=document.getElementById('comfortRing'); if(ring) ring.style.setProperty('--score-angle', scoreAngle+'deg');
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
  
    
  
  set('comfortScore', c.comfortScore);
  

  set('comfortBadge', 'Comfort: '+dl.badge);
  set('comfortHeadline', dl.level);
  

  (function(){ try{
    var tRef=(c.feels!=null&&isFinite(c.feels))?c.feels:c.temp;
    var host=document.getElementById('comfortNarrative'); if(!host) return;
    var el=document.getElementById('comfortColdNote');
    if(!el){ el=document.createElement('p'); el.id='comfortColdNote';
      el.setAttribute('style','margin:.35rem 0 0;font-size:.72rem;font-weight:700;color:#7a5a12');
      host.parentNode.appendChild(el); }
    if(isFinite(tRef)&&tRef<10){ el.textContent='This score measures heat discomfort only. At '+Math.round(tRef)+' °C the stress here is cold, which it does not score.'; el.removeAttribute('hidden'); }
    else { el.textContent=''; el.setAttribute('hidden',''); }
  }catch(_){} })();
  

  set('comfortNarrative', (function(){
    var parts=[];
    

    if(c.feels!=null) parts.push((c.temp>=27?'a heat index of ':c.temp<=10?'a wind chill of ':'a heat-and-wind comfort temperature of ')+c.feels+'\u00B0C');
    else parts.push('an air temperature of '+Math.round(c.temp)+'\u00B0C and no published '
                    +'feels-like value \u2014 '+(c.feelsWhy||'outside the validity of the '
                    +'heat-index method'));
    if(c.di!=null && isFinite(c.di)) parts.push('discomfort index '+c.di.toFixed(1));
    if(c.wb!=null && isFinite(c.wb)) parts.push('wet-bulb proxy near '+Math.round(c.wb)+'\u00B0C');
    return s.name+' has '+parts.join(', ')+'. '+hr.note+'.';
  })());
  

  set('wetBulbVal', (c.wb==null||!isFinite(c.wb))?'—':(Math.round(c.wb)+'°'));
  set('wetBulbNote', (c.wb==null||!isFinite(c.wb)) ? (c.wbUnavailable||'wet bulb not available for these inputs') : (c.wb>=28?'High body cooling stress':c.wb>=25?'Ventilation and rest help':c.wb>=18?'Ventilation helps':'No heat-stress cooling demand'));    
  

  if(c.hi!=null&&isFinite(c.hi)&&c.hi<27){ set('heatIndexVal','—'); set('heatIndexNote','Applies from 27 °C; feels-like above is the one to read'); }
  else { set('heatIndexVal', (c.hi==null||!isFinite(c.hi))?'—':Math.round(c.hi)+'°'); set('heatIndexNote', hr.risk); }
  

  set('humLoadVal', (s.hum==null||!isFinite(s.hum))?'—':(s.hum+'%'));
  set('humLoadNote', (function(){
    var T=(c.temp==null||c.temp==='')?NaN:Number(c.temp), RH=(s.hum==null||s.hum==='')?NaN:Number(s.hum);   /* v283.35: missing stays missing */
    if(s.hum==null||!isFinite(RH)||RH<=0) return 'no humidity reading for this unit';
    if(!isFinite(T)) return 'no temperature for this unit, so the moisture load cannot be judged';
    var Td=dewPointC(T,RH);    
    if(!isFinite(Td)) return 'moisture load unavailable';
    var band=Td<10?'Dry air':Td<16?'Comfortable moisture':Td<20?'Noticeable moisture':Td<24?'Heavy moisture load':'Oppressive moisture';
    return band+' · dew point '+Td.toFixed(1)+'°C';
  })());
  set('recoveryVal', rec[0]); set('recoveryNote', rec[1]);
  setBar('riskHeat', c.heatStress); set('riskHeatTxt', (c.feels!=null&&isFinite(Number(c.feels)))?Math.round(c.feels)+'\u00b0':'\u2014');    
  setBar('riskHum', c.humLoad==null?0:c.humLoad); set('riskHumTxt', c.humLoad==null?'—':c.humLoad);
  setBar('riskWind', c.windRelief); set('riskWindTxt', c.windRelief);
  set('decisionLoc', s.name);
  drawDecisionList(s,c,hr,bw);
  drawComfortMeteogram(s,c);
  updateOpsBrief(s,c,hr,bw);
  drawAirQuality(s);
}
function drawDecisionList(s,c,hr,bw){
  const exposure = c.heatStress>=80 ? ['high','Outdoor labour','Pause heavy work from 11:00 to 17:00. Use shaded recovery only.'] : c.heatStress>=60 ? ['med','Outdoor labour','Use 30 to 40 minute work cycles with water and shade.'] : ['low','Outdoor labour','Routine activity is manageable with hydration.'];
  const health = c.di>=29 ? ['high','Sensitive groups','Elderly, children and outdoor workers need extra monitoring.'] : ['low','Sensitive groups','No severe comfort signal, monitor during peak sun.'];
  const rain = s.hum>=58 ? ['med','Rain readiness','Humidity supports shower development, keep nowcast layer active.'] : ['low','Rain readiness','No strong humidity signal in the station reading.'];
  const rows=[['info','Best window',`${bw[0]}. ${bw[1]}.`],exposure,health,rain];
  const box=document.getElementById('decisionList'); if(!box) return;
  const _diColor={high:'var(--sev-5)',med:'var(--sev-3)',low:'var(--sev-2)',info:'var(--sea)'};
  box.innerHTML=rows.map(r=>`<div class="decision-item"><div class="di-icon"><span class="di-dot" style="background:${_diColor[r[0]]||'var(--sea)'}"></span></div><div><h4>${r[1]}</h4><p>${r[2]}</p></div></div>`).join('');
}


let meteoParam = 'comfort';






const LIVE_HOURLY = {};
window.LIVE_HOURLY = LIVE_HOURLY;



const __machFetchOnce={};


/* v91.17.283.12 · THE SERVER AQI (v283.13 hand-off): the air quality of a place is the server's (GET /api/smog/unit?lat&lon, today's row:
   aqiNow = US EPA 2024 AQI with NowCast over complete hours; PM2.5 as served). A place without it is not assessed (null), never a
   composition-forecast number read by the page. Cached 20 min per 0.01 degree. */
var __AGN_SMOG={};
function agnSmogParse(j){ var t=new Date(Date.now()+5*3600e3).toISOString().slice(0,10), x=j&&Array.isArray(j.days)?(j.days.filter(function(y){ return y&&y.date===t; })[0]||null):null, n=x&&x.aqiNow;
  return x?{aqi:n&&n.aqi!=null?Math.round(n.aqi):null, category:n?n.category:null, pollutant:n?n.pollutant:null, hourPkt:n?n.hourPkt:null, pm25:x.pm25!=null?Math.round(x.pm25):null, pm10:x.pm10!=null?Math.round(x.pm10):null, dust:x.dust!=null?Number(x.dust):null,
    basis:n?n.basis:(x.aqNotAssessed||'no AQI for this hour (not assessed)'), unit:j.unit||null}:null; }
function agnSmogKey(lat,lon){ return (+lat).toFixed(2)+','+(+lon).toFixed(2); }
/* v91.17.283.19 · the air quality of a place is its bundle's smog part (GET /api/point, read once per place by the page store) */
function agnSmogAt(lat,lon){ if(lat==null||lon==null||!isFinite(+lat)||!isFinite(+lon)) return Promise.resolve(null);
  return agnPS().then(function(P){ return P?P.part('smog',+lat,+lon):null; }).then(function(j){ return j&&!j.unavailable&&!j.error?agnSmogParse(j):null; }).catch(function(){ return null; }); }
/* many points in one request each 200 (GET /api/smog/units): the map's district sweep and the 12 cities */
function agnSmogMany(pts){ var want=[], seen={}; (pts||[]).forEach(function(q){ if(!q||!isFinite(+q.lat)||!isFinite(+q.lon)) return; var k=agnSmogKey(q.lat,q.lon), c=__AGN_SMOG[k]; if(seen[k]||(c&&(c.p||Date.now()-c.at<20*60e3))) return; seen[k]=1; want.push(q); });
  var jobs=[]; for(var i=0;i<want.length;i+=200){ (function(part){ var p=fetch('/api/smog/units?pts='+part.map(function(q){ return (+q.lat).toFixed(4)+','+(+q.lon).toFixed(4); }).join(';'),{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
        part.forEach(function(q,n){ var u=j&&j.units&&j.units[n]; __AGN_SMOG[agnSmogKey(q.lat,q.lon)]={at:u?Date.now():Date.now()-19*60e3, v:(u&&!u.error)?agnSmogParse(u):null, p:null}; }); }).catch(function(){ part.forEach(function(q){ __AGN_SMOG[agnSmogKey(q.lat,q.lon)]={at:Date.now()-19*60e3,v:null,p:null}; }); });
      part.forEach(function(q){ var k=agnSmogKey(q.lat,q.lon); __AGN_SMOG[k]={at:Date.now(),v:null,p:p.then(function(){ return __AGN_SMOG[k]&&!__AGN_SMOG[k].p?__AGN_SMOG[k].v:null; })}; }); jobs.push(p); })(want.slice(i,i+200)); }
  return Promise.all(jobs).then(function(){ return (pts||[]).map(function(q){ var c=q&&__AGN_SMOG[agnSmogKey(q.lat,q.lon)]; return c&&!c.p?c.v:null; }); }); }
try{ window.agnSmogMany=agnSmogMany; }catch(_){}
try{ window.agnSmogAt=agnSmogAt; }catch(_){}
/* v91.17.283.12 · the point-state library (agn-v122-now) loads after this script; a caller at boot waits for it (20 s at most) */
function agnPS(){ return new Promise(function(res){ var n=0; (function w(){ var P=window.AGN&&window.AGN.pointState; if(P) return res(P); if(++n>200) return res(null); setTimeout(w,100); })(); }); }
try{ window.agnPS=agnPS; }catch(_){}
async function fetchHourlyForecast(s){
  try{
    /* v91.17.283.12 · ONE CALCULATION POINT: the strip, the meteogram and the hourly series are the point state's hours (AGN.pointState, the
       served chain, one record per place and run). The provider is read only for what the point state does not hold and no section
       shows as a point value: the 7 past days (antecedent rain, the heat-wave window) and the soil, boundary-layer, ET0 and VPD inputs. */
    /* v91.17.283.19 · the hours are the place's record and the land inputs and 7 past days its bundle's land part (GET /api/point, once) */
    const P=await agnPS(); const ps=P?await P.bundle(s.lat,s.lon):null;
    if(!ps || !ps.ok || !Array.isArray(ps.hours) || !ps.hours.length) throw new Error('the point state for this place is not available');
    const LP=P.partOf(ps,'land'), j0=LP&&LP.ok?{hourly:LP.hourly||{}, daily:LP.daily||{}}:{}, h0=(j0&&j0.hourly)||{};
    const j=AGN.pointState.shape(ps,{hourly:'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,precipitation,snowfall,surface_pressure,weather_code',current:'temperature_2m,weather_code,precipitation,relative_humidity_2m,wind_speed_10m'}), h=j.hourly;
    j.daily=(j0&&j0.daily)||{};
    ['soil_moisture_9_to_27cm','boundary_layer_height','et0_fao_evapotranspiration','vapour_pressure_deficit'].forEach(function(k){ var at={}; (h0.time||[]).forEach(function(t,i){ at[String(t).slice(0,13)]=(h0[k]||[])[i]; }); h[k]=h.time.map(function(t){ var v=at[String(t).slice(0,13)]; return v==null?null:v; }); });
    

    try{ if(window.AGN&&AGN.prob){ window.__AGN_PROB_STRIP={lat:s.lat,lon:s.lon,elev:s.elev,off:j.utc_offset_seconds,time:h.time,temp:h.temperature_2m}; if(!AGN.prob.rec(s.lat,s.lon)){ AGN.prob.prime(s.lat,s.lon,s.elev); var _pk=(+s.lat).toFixed(3)+','+(+s.lon).toFixed(3);   if(s.__probRedraw!==_pk){ s.__probRedraw=_pk; document.addEventListener('agn:prob', function once(ev){ if(ev&&ev.detail&&ev.detail.key&&ev.detail.key!==_pk) return; document.removeEventListener('agn:prob', once); try{ Promise.resolve(fetchHourlyForecast(s)).then(function(){ try{ if(typeof selectedId!=='undefined' && selectedId===s.id && typeof drawHourly==='function') drawHourly(typeof effStation==='function'?effStation(s):s); }catch(_){} }); }catch(_){} }); } } } }catch(_){}
    const round=v=>v==null?null:Math.round(Number(v)*10)/10;
    const nowKey=String((j.current||{}).time||'').slice(0,13);
    let idx=h.time.findIndex(t=>String(t).slice(0,13)===nowKey);
    if(idx<0 && nowKey){
      for(let i=0;i<h.time.length;i++){ if(String(h.time[i]).slice(0,13)<=nowKey) idx=i; }
    }
    if(idx<0) idx=Math.min(12,h.time.length-1);
    
    
    
    try{ if(Array.isArray(h.precipitation)){ window.__RAIN_HOURLY=window.__RAIN_HOURLY||{}; const _nm=(s&&(s.name||s.id))||'active'; window.__RAIN_HOURLY[_nm]={arr:h.precipitation.map(function(v){ return (v==null||v==='')?NaN:Number(v); }), sn:(Array.isArray(h.snowfall)?h.snowfall:null), idx:idx}; window.__RAIN_HOURLY.__active=_nm; } }catch(e){}
    const icon=code=>(typeof wmoCond==='function'?wmoCond(code==null?0:Number(code))[1]:'🌡️');
    const hourAt=i=>{ const m=String(h.time[i]||'').match(/T(\d{2}):/); return m?Number(m[1]):new Date().getHours(); };
    const current=j.current||{};
    const rows=[];
    const _nowCode=(current.weather_code!=null?current.weather_code:h.weather_code?.[idx]);
    const _ensPP=function(i){ try{ return (window.AGN&&AGN.prob)?AGN.prob.pWet(s.lat,s.lon,h.time[i],j.utc_offset_seconds):null; }catch(_){ return null; } };    
     
    
    const _nowPP=(function(){ var e=_ensPP(idx); return e; })();    
    
    
    let _nowIc=icon(_nowCode);
    const _ncn=(_nowCode==null?0:Number(_nowCode));
    

    const _hintNow=(function(){ try{ return (window.AGN&&AGN.prob&&AGN.prob.iconHint)?AGN.prob.iconHint(s.lat,s.lon,h.time[idx],j.utc_offset_seconds):null; }catch(_){ return null; } })();
    if(_hintNow==='dry' && _ncn>=51) _nowIc=icon(_ncn>=95?2:3);
    else if(_hintNow==='rain' && _ncn<=3) _nowIc=icon(61);
    else if(_ncn>=95 && _nowPP!=null && _nowPP<30) _nowIc=icon(2);
    else if(_ncn>=80 && _ncn<95 && _nowPP!=null && _nowPP<30) _nowIc=icon(3);
    else if(_ncn>=61 && _ncn<=67 && _nowPP!=null && _nowPP<15) _nowIc=icon(3);
    rows.push({
      h:hourAt(idx), t:+AGN.pointState.fmt(current.temperature_2m!=null?current.temperature_2m:h.temperature_2m[idx]),   /* the one print rule for now */
      em:_nowIc,
      pp:_nowPP, now:true,
      time:current.time||h.time[idx]
    });
    for(let step=1;step<24;step++){
      const i=idx+step; if(i>=h.time.length) break;
      const _code=h.weather_code?.[i];
      const _pp=(function(){ var e=_ensPP(i); return e; })();
      
      
      
      let _ic=icon(_code);
      const _cn=(_code==null?0:Number(_code));
      const _hint=(function(){ try{ return (window.AGN&&AGN.prob&&AGN.prob.iconHint)?AGN.prob.iconHint(s.lat,s.lon,h.time[i],j.utc_offset_seconds):null; }catch(_){ return null; } })();
      if(_hint==='dry' && _cn>=51) _ic=icon(_cn>=95?2:3);          
      else if(_hint==='rain' && _cn<=3) _ic=icon(61);              
      else if(_cn>=95 && _pp!=null && _pp<30) _ic=icon(2);          
      else if(_cn>=80 && _cn<95 && _pp!=null && _pp<30) _ic=icon(3); 
      else if(_cn>=61 && _cn<=67 && _pp!=null && _pp<15) _ic=icon(3); 
      rows.push({h:hourAt(i),t:Math.round(h.temperature_2m[i]),em:_ic,pp:_pp,time:h.time[i]});
    }
    const take=a=>(a||[]).slice(0,96).map(round);
    var _rainArr=h.precipitation, rain7=null;
    if(Array.isArray(_rainArr)){ var acc=0, seen=0; for(var ri=idx; ri<Math.min(idx+168,_rainArr.length); ri++){ var rv=Number(_rainArr[ri]); if(Number.isFinite(rv)){ acc+=rv; seen++; } } rain7 = seen>0 ? Math.round(acc*10)/10 : null; }
    var _at=function(arr){ var v=arr&&arr[idx]; return Number.isFinite(Number(v))?Number(v):null; };
    var _blh=_at(h.boundary_layer_height), _et0=_at(h.et0_fao_evapotranspiration), _vpd=_at(h.vapour_pressure_deficit);
    var _expected=[h.temperature_2m,h.apparent_temperature,h.relative_humidity_2m,h.wind_speed_10m,h.wind_gusts_10m,h.precipitation,h.surface_pressure,h.soil_moisture_9_to_27cm,h.boundary_layer_height,h.et0_fao_evapotranspiration,h.vapour_pressure_deficit];
    var _got=0; _expected.forEach(function(a){ if(Array.isArray(a)&&Number.isFinite(Number(a[idx]))) _got++; });
    var completeness=Math.round((_got/_expected.length)*100);
    window.LIVE_HOURLY[s.id]={
      time:(h.time||[]).slice(0,96), off:(j&&j.utc_offset_seconds!=null?j.utc_offset_seconds:null), temp:take(h.temperature_2m), feels:take(h.apparent_temperature),
      hum:take(h.relative_humidity_2m), wind:take(h.wind_speed_10m), gust:take(h.wind_gusts_10m),
      rainProb:take(h.precipitation_probability), rain:take(h.precipitation), snow:take(h.snowfall),
      pressure:take(h.surface_pressure), soilMoist:take(h.soil_moisture_9_to_27cm),
      blh:take(h.boundary_layer_height), et0:take(h.et0_fao_evapotranspiration), vpd:take(h.vapour_pressure_deficit),
      blhNow:_blh, et0Now:_et0, vpdNow:_vpd, rain7:rain7, completeness:completeness,
      nowIdx:idx, rows, updatedAt:Date.now()
    };
    s.blhLive=_blh; s.et0Live=_et0; s.vpdLive=_vpd; s.rain7Live=rain7; s.inputCompleteness=completeness;
    
    try{
      const dly=j.daily||{};

      const dTimes=Array.isArray(dly.time)?dly.time.map(String):[];
      const _today=(function(){ try{ if(window.MACH_TIME&&MACH_TIME.day) return MACH_TIME.day(0); }catch(_){}
                                return new Date().toISOString().slice(0,10); })();
      const dpsAll=Array.isArray(dly.precipitation_sum)?dly.precipitation_sum.map(Number):[];
      const past=[];
      for(let i=0;i<Math.min(dTimes.length,dpsAll.length);i++){
        if(dTimes[i] < _today && Number.isFinite(dpsAll[i])) past.push(dpsAll[i]);
      }
      const dps = past.length ? past.slice(-7)
                              : (Array.isArray(dly.precipitation_sum)?dly.precipitation_sum.map(Number).filter(Number.isFinite).slice(0,7):[]);
      if(dps.length){ let api=0; const k=0.9, cap=120; dps.forEach(function(rn){ api=k*api+(rn||0); }); s.apiIndex=Math.max(0,Math.min(1,api/cap));
        s.apiBasis=past.length?('observed '+dps.length+'d to '+_today):'fallback (no dated series)'; }

      
      
      const tmax=Array.isArray(dly.temperature_2m_max)?dly.temperature_2m_max.map(Number):[];
      const tmin=Array.isArray(dly.temperature_2m_min)?dly.temperature_2m_min.map(Number):[];
      

      const tm=[]; for(let di=0;di<Math.min(tmax.length,tmin.length);di++){ if(Number.isFinite(tmax[di])&&Number.isFinite(tmin[di])&&(!dTimes[di]||dTimes[di]<=_today)) tm.push((tmax[di]+tmin[di])/2); }
      if(tm.length>=3){ const _avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
        s.tm3=_avg(tm.slice(-3));
        s.tm30=_avg(tm);                                   
        const _s=[...tm].sort((a,b)=>a-b); s.t95=_s[Math.min(_s.length-1,Math.floor(0.95*(_s.length-1)))];
        

        var _days=Array.isArray(dly.time)?dly.time.filter(Boolean):[];
        s.t95Basis={
          statistic:'95th percentile of daily mean temperature ((tmax+tmin)/2)',
          measurand:'daily mean air temperature', unit:'\u00b0C',
          n:tm.length, nUnit:'days',
          windowFrom:(_days.length?String(_days[0]).slice(0,10):null),
          windowTo:(_days.length?String(_days[_days.length-1]).slice(0,10):null),
          source:'Model forecast API, past_days window (days up to today only, v91.17.68)',
          

          isClimatology:false,
          why:'a '+tm.length+'-day sample of daily mean temperature, not a multi-decadal '
             +'climatology \u2014 a percentile over this window is dominated by the current '
             +'spell of weather'
        };
        s.tm30Basis=Object.assign({}, s.t95Basis, {
          statistic:'mean of daily mean temperature over the available window',
          why:'the mean of the same '+tm.length+'-day window, used as a 30-day proxy'
        });
      }
    }catch(e){ if(window.__MACH_DEBUG) console.debug('[api/ehf]',e&&e.message); }
    

    var _applied=0;
    try{ ['t','hum','wind','gust','rain','feels'].forEach(function(k){ if(s&&s[k]!=null) _applied++; }); }catch(_){ _applied=0; }
    if(typeof window.setMACHFreshness==='function') window.setMACHFreshness(Date.now(), _applied);
    return _applied>0;
  }catch(e){
    console.warn('hourly forecast fetch failed for',s.id,e.message);
    return false;
  }
}

function liveSeries(s,field){
  const e=LIVE_HOURLY[s.id]; if(!e||!e[field]) return null;
  const a=e[field]; if(a.length<72||a.some(x=>x==null)) return null;
  return a.slice(0,72);   
}

async function loadHourlyAndRedraw(s){
  if(!s||!s.id) return;
  if(!LIVE_HOURLY[s.id]){ await fetchHourlyForecast(s); }
  if(selectedId===s.id){
    const cur=effStation(s);
    if(typeof drawSpark==='function') drawSpark(cur);    
    if(typeof drawHourly==='function') drawHourly(cur);
    if(typeof drawComfortMeteogram==='function') drawComfortMeteogram(cur, stationComfort(cur));
  }
}

const METEO_PARAMS = {
  comfort: {
    title:'Heat discomfort (DI) · obs + forecast', unit:'', decimals:1,
    sub:s=>`${s.name} · hourly Thom discomfort index (heat discomfort only; a low value means no heat discomfort, not comfort)`,
    peakLabel:'Peak', peakWord:v=>v>=29?'Everyone feels severe heat stress (Giles et al. 1990)':v>=21?'Some heat discomfort':'No heat discomfort',
    /* v91.17.283.35 · item 5: no invented envelope, no humidity clamp; an hour without temperature or humidity leaves the series incomplete (never 0) */
    series:s=>{ const lt=liveSeries(s,'temp'), lh=liveSeries(s,'hum');
      if(!lt||!lh) return null; const v=lt.map((t,i)=>{ const d=discomfortIndex(t,lh[i]); return d==null?null:Math.round(d*10)/10; });
      return v.some(x=>x==null)?null:v; }
  },
  temp: {
    title:'Air temperature · obs + forecast', unit:'°C', decimals:0,
    sub:s=>`${s.name} · temperature with an indicative envelope (lead-time formula, not ensemble spread)`,
    peakLabel:'High', peakWord:v=>v>=40?'Extreme heat peak':v>=35?'Hot peak window':'Moderate peak',
    band:(v,lead)=>Math.min(6,1+lead*0.10),
    series:s=>liveSeries(s,'temp')
  },
  feels: {
    title:'Feels-like temperature · obs + forecast', unit:'°C', decimals:0,
    sub:s=>`${s.name} · apparent temperature with an indicative envelope (lead-time formula, not ensemble spread)`,
    peakLabel:'High', peakWord:v=>v>=44?'Dangerous feels-like peak':v>=38?'High feels-like peak':'Moderate peak',
    band:(v,lead)=>Math.min(7,1.2+lead*0.11),
    series:s=>liveSeries(s,'feels')
  },
  hum: {
    title:'Relative humidity · obs + forecast', unit:'/100', decimals:0,
    sub:s=>`${s.name} · humidity with an indicative envelope (lead-time formula, not ensemble spread)`,
    peakLabel:'Peak', peakWord:v=>v>=75?'Very humid peak':v>=55?'Humid peak':'Dry spell',
    band:(v,lead)=>Math.min(12,2+lead*0.18),
    
    series:s=>liveSeries(s,'hum')
  },
  wind: {
    title:'Wind speed · obs + forecast', unit:' km/h', decimals:0,
    sub:s=>`${s.name} · wind speed with an indicative envelope (lead-time formula, not ensemble spread)`,
    peakLabel:'Gust', peakWord:v=>v>=40?'Strong wind peak':v>=25?'Breezy peak':'Light winds',
    band:(v,lead)=>Math.min(14,2.5+lead*0.20),
    series:s=>liveSeries(s,'wind')
  },
  

  rain: {
    title:'Rain chance · matched to gauges', unit:'%', decimals:0,
    sub:s=>{ const c=(window.AGN&&AGN.prob)?AGN.prob.calibration(s.lat,s.lon):null; return (c&&c.ok)?`${s.name} · share of ensemble members above ${c.tauMm} mm/h, the grid amount matched to the gauge wet-hour frequency (${c.group}); the provider's trace share is not plotted`:`${s.name} · no gauge-matched rain chance for this point yet; the provider's trace share is not plotted`; },
    peakLabel:'Peak', peakWord:v=>v>=60?'High rain likelihood':v>=30?'Convective chance':'Weak rain signal',
    band:(v,lead)=>Math.min(18,3+lead*0.26),
    
    series:s=>{ const e=(window.LIVE_HOURLY||{})[s.id]; if(!e||!Array.isArray(e.time)||e.off==null||!window.AGN||!AGN.prob) return null;
      const v=e.time.slice(0,72).map(t=>AGN.prob.pWet(s.lat,s.lon,t,e.off)); return (v.length<72||v.some(x=>x==null))?null:v; }
  },
  aqi: {
    title:'Air quality index · modelled (CAMS)', unit:'', decimals:0,
    sub:s=>`${s.name} · AQI (no hourly series is fetched)`,
    peakLabel:'Peak', peakWord:v=>v>=150?'Unhealthy peak':v>=100?'Sensitive-group peak':'Acceptable air',
    band:(v,lead)=>Math.min(28,6+lead*0.40),
    
     
    series:s=>null
  }
};

function setMeteoParam(p){
  if(!METEO_PARAMS[p]) return;
  meteoParam=p;
  [...document.querySelectorAll('#meteoParams .mp-btn')].forEach(b=>
    b.setAttribute('aria-selected', b.dataset.param===p ? 'true':'false'));
  const base=STATIONS.find(x=>x.id===selectedId)||null; if(!base) return;   /* v283.36 item 14: no default place */
  drawComfortMeteogram(effStation(base), stationComfort(effStation(base)));
}

function drawComfortMeteogram(s,c){
  const svg=document.getElementById('comfortSpark'); if(!svg) return;
   
  const __agn87W=Math.max(480,Math.round((svg.getBoundingClientRect().width)||680)), __agn87H=240; svg.setAttribute('viewBox','0 0 '+__agn87W+' '+__agn87H); svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  const cfg=METEO_PARAMS[meteoParam]||METEO_PARAMS.comfort;
  const vals=cfg.series(s);
  

  if(!vals || !vals.length){
    svg.innerHTML='<rect x="0" y="0" width="'+__agn87W+'" height="'+__agn87H+'" rx="19" fill="rgba(255,255,255,.20)"/>'
      +'<text x="24" y="26" font-size="12" font-weight="800" fill="var(--navy)" font-family="Manrope">'+cfg.title+'</text>'
      +'<text x="24" y="78" font-size="12" fill="#687782" font-family="Manrope">'+(meteoParam==='aqi'?'No hourly air-quality series is fetched for this station; see the daily air panel.':'Live 72-hour series not loaded for this station yet.')+'</text>';
    const setN=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
    setN('meteoSub', s.name+' \u00b7 no live series'); setN('meteoQuality','no series'); setN('predVal','\u2014'); setN('peakDiVal','\u2014'); setN('peakDiNote','no series');
    return;
  }
  const fmt=v=>cfg.decimals>0?v.toFixed(cfg.decimals):Math.round(v);
  
  const OBS=12;
  /* v91.17.283.29 · W6: the page-drawn uncertainty envelope (cfg.band, typed spreads) is deleted: the line is the served series only */
  const band=vals.map((v,i)=>({v, lo:v, hi:v, fc:i>OBS}));
  const W=__agn87W,H=__agn87H,P=18; const min=Math.min(...band.map(b=>b.lo))-1, max=Math.max(...band.map(b=>b.hi))+1;
  const x=i=>P+i*(W-2*P)/(vals.length-1); const y=v=>H-P-(v-min)/(max-min)*(H-2*P-12);
  const lineOf=(a,b)=>{let d=`M ${x(a)} ${y(vals[a])}`;for(let i=a+1;i<=b;i++)d+=` L ${x(i)} ${y(vals[i])}`;return d;};
  const fc=band.map((b,i)=>({...b,i})).filter(b=>b.i>=OBS);
  const bandPts=fc.map(b=>`${x(b.i)},${y(b.hi)}`).join(' ')+' '+fc.slice().reverse().map(b=>`${x(b.i)},${y(b.lo)}`).join(' ');
  const peak=Math.max(...vals), pi=vals.indexOf(peak);
  const precip=s.hum>60?55:s.hum>45?30:15;
  svg.innerHTML=`
    <rect x="0" y="0" width="${__agn87W}" height="${__agn87H}" rx="19" fill="rgba(255,255,255,.20)"/>
    <g stroke="rgba(12,56,81,.10)" stroke-width="1">${[1,2,3,4].map(j=>`<line x1="18" y1="${Math.round(j*(H-30)/5)+6}" x2="${W-18}" y2="${Math.round(j*(H-30)/5)+6}"/>`).join('')}</g>
    <rect x="${x(OBS)}" y="6" width="${x(vals.length-1)-x(OBS)}" height="${H-30}" fill="rgba(20,184,166,.05)"/>
    <polygon points="${bandPts}" fill="rgba(20,184,166,.20)" stroke="rgba(20,184,166,.38)" stroke-width="1"/>
    <path d="${lineOf(0,OBS)}" fill="none" stroke="var(--navy)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${lineOf(OBS,vals.length-1)}" fill="none" stroke="var(--sea-600)" stroke-width="2.6" stroke-dasharray="6 5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="${x(OBS)}" y1="6" x2="${x(OBS)}" y2="${H-18}" stroke="var(--red)" stroke-width="1.8"/>
    <circle cx="${x(pi)}" cy="${y(peak)}" r="4.5" fill="var(--sand)" stroke="#fff" stroke-width="2"/>
    <text x="24" y="26" font-size="12" font-weight="800" fill="var(--navy)" font-family="Manrope">${cfg.title}</text>
    <text x="${Math.min(W-90,x(pi)+8)}" y="${Math.max(20,y(peak)-9)}" font-size="11" font-weight="800" fill="var(--sand)" font-family="Manrope">${cfg.peakLabel} ${fmt(peak)}${cfg.unit}</text>
    <text x="22" y="${H-12}" font-size="11" font-weight="700" fill="#687782" font-family="Manrope">-12h</text>
    <text x="${x(OBS)-8}" y="${H-12}" font-size="11" font-weight="800" fill="var(--red)" font-family="Manrope">now${(vals[OBS]!=null&&isFinite(vals[OBS]))?' '+fmt(vals[OBS])+cfg.unit:''}</text>
    <text x="${W-50}" y="${H-12}" font-size="11" font-weight="700" fill="#687782" font-family="Manrope">+60h</text>`;
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
  set('meteoSub', cfg.sub(s)); set('meteoQuality', `Indicative envelope`);
   
  set('predVal', '\u2014');
  try{ const _pn=document.querySelector('#predVal + em'); if(_pn) _pn.textContent='not measured'; }catch(_){}
  
  const peakChip=document.querySelector('.model-chip b#peakDiVal');
  set('peakDiVal', `${fmt(peak)}${cfg.unit}`); set('peakDiNote', 'highest of the 72 hours shown');   /* v91.17.283.29 · W6: the typed peak words (cfg.peakWord thresholds) are no longer printed; levels come from the server */
  const peakChipLabel=document.querySelector('#peakDiVal'); 
  if(peakChipLabel && peakChipLabel.parentNode){ const sp=peakChipLabel.parentNode.querySelector('span'); if(sp) sp.textContent=`${cfg.peakLabel==='Peak'?'Peak':cfg.peakLabel} ${meteoParam==='comfort'?'discomfort':meteoParam}`; }
  if(window.__fillMeteoTable) window.__fillMeteoTable(vals);
   
  set('rainSignalVal', (s.hum!=null&&isFinite(+s.hum))?Math.round(+s.hum)+'%':'—'); set('rainSignalNote', 'relative humidity now (not a rain chance)');
}
function updateOpsBrief(s,c,hr,bw){
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
  set('opsSub', `${s.name} safety and planning guidance`);
  set('bestWindow', bw[0]); set('bestWindowNote', bw[1]);
  

  {
    const _hs=Number(c.heatStress);
    const _hsBand = !isFinite(_hs) ? null
                  : _hs>=75 ? 'Severe' : _hs>=55 ? 'High'
                  : _hs>=35 ? 'Moderate' : _hs>=18 ? 'Low' : 'Minimal';
    set('commuteRisk', _hsBand ? (_hsBand+' heat stress') : 'Not scored');
    set('commuteRiskNote', !isFinite(_hs)
      ? 'No temperature for this location, so commute heat stress is not scored'
      : ('Heat-stress index '+Math.round(_hs)+'/100 \u00b7 '
         + (_hs>=65 ? 'peak commute heat stress likely' : 'hydration advised during peak sun')
         + ' \u00b7 comfort index, not the heat hazard band'));
  }
  set('eventOps', c.heatStress>=75?'Cooling plan required':c.heatStress>=55?'Shade required':'Standard controls');
  set('eventOpsNote', c.heatStress>=75?'Mist fans, shade and water points recommended':c.heatStress>=55?'Tents and water points recommended':'Normal event planning controls');
  

  {
    

    

    let _m=null, _mSrc=null, _mSpread=null;
    try{ const _rec=(window.DISTRICT_IN||{})[s && s.name];   

         if(_rec && _rec.uhi && Number.isFinite(Number(_rec.uhi.popWeightedC))){
           _m=Number(_rec.uhi.popWeightedC); _mSrc='field'; _mSpread=_rec.uhi.spreadC;
         }
    }catch(_){}
    if(_m==null){
      try{ const _u=(window.AGN&&AGN.urbanHeat&&AGN.urbanHeat.localizeStation)
                      ? AGN.urbanHeat.localizeStation(s) : null;
           const _mc=_u&&_u.microclimate;
           if(_mc && Number.isFinite(Number(_mc.morphologyDeltaC))){ _m=Number(_mc.morphologyDeltaC); _mSrc='profile'; }
      }catch(_){}
    }
    if(_m==null){
      if((window.AGN&&AGN.urbanHeat&&typeof AGN.urbanHeat.c12==='function'&&AGN.urbanHeat.c12().withheld)){ set('uhiSignal','Not assessed'); set('uhiSignalNote','No tested skill: '+String(AGN.urbanHeat.c12().why||'').replace(/^not assessed:\s*/i,'')); }   /* v91.17.283.6 C12 */
      else { set('uhiSignal','Not held');
      set('uhiSignalNote','No urban-form profile for this unit, so no urban heat delta is computed'); }
    } else {
      const _a=Math.abs(_m);
      const _mag = _a>=3 ? 'Strong' : _a>=1.5 ? 'Moderate' : _a>=0.5 ? 'Slight' : 'Negligible';
      const _dir = _a<0.5 ? '' : (_m>0 ? ' urban heat island' : ' urban cool island');
      set('uhiSignal', _mag+_dir+' \u00b7 '+(_m>=0?'+':'\u2212')+_a.toFixed(1)+' \u00b0C');
      set('uhiSignalNote', _mSrc==='field'
        ? ('Maximum nocturnal urban heat island for the average resident of this unit, from '
           + 'measured built surface, building height and vegetation at about 270 m. '
           + (_mSpread!=null ? ('It ranges over ' + _mSpread + ' \u00b0C inside this unit alone \u2014 turn on the '
                               + 'Urban heat overlay to see where. ') : '')
           + 'An amount on top of the forecast temperature, not a temperature, and calibrated '
           + 'against one urban/rural station pair in Rawalpindi.')
        : ('Urban-form contribution to local air temperature, from LCZ morphology. '
           + 'Slight from \u00b10.5 \u00b0C, moderate from \u00b11.5, strong from \u00b13. '
           + 'Terrain and calibration terms are excluded \u2014 they are not urban heat.'));
    }
  }
  

  try{
    var _un=document.getElementById('uhiSignalNote');
    if(_un && !String(_un.textContent||'').trim())
      set('uhiSignalNote', 'No urban-form reading for this unit. Urban surfaces can raise local feels-like values, '
                         + 'but nothing has been measured here to say by how much.');
  }catch(_){}
}


function aqiBand(aqi){
  if(aqi==null||aqi===''||!isFinite(aqi)) return {label:'not retrieved', color:'transparent', advice:'No air-quality reading for this place.'};    
  if(aqi<=50)  return {label:'Good',        color:'#059669', advice:'Air quality is satisfactory for outdoor activity.'};
  if(aqi<=100) return {label:'Moderate',    color:'#E6B655', advice:'Acceptable, but unusually sensitive people should limit prolonged exertion.'};
  if(aqi<=150) return {label:'Unhealthy for sensitive', color:'#F08A24', advice:'Sensitive groups (asthma, elderly, children) should limit prolonged outdoor exertion.'};
  if(aqi<=200) return {label:'Unhealthy',   color:'#982122', advice:'Everyone may begin to feel effects; limit extended outdoor exertion.'};
  if(aqi<=300) return {label:'Very unhealthy', color:'#7c3aed', advice:'Health alert. Avoid prolonged outdoor exertion; use a mask outdoors.'};
  

  return {label:'Hazardous', color:'#7e0023', advice:'Emergency conditions: everyone should avoid outdoor exertion; stay indoors with windows shut where possible.'};
}
function uvBand(uv){
  if(uv==null||uv===''||!isFinite(uv)) return {label:'not retrieved', burn:'no UV reading', fill:0};    
  if(uv<=2) return {label:'Low',      burn:'low burn risk', fill:2};
  if(uv<=5) return {label:'Moderate', burn:'burn risk ~30 min', fill:5};
  if(uv<=7) return {label:'High',     burn:'burn risk ~20 min', fill:7};
  if(uv<=10)return {label:'Very high',burn:'burn risk ~12 min', fill:10};
  return {label:'Extreme', burn:'burn risk <10 min', fill:11};
}
function drawAirQuality(s){
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
  const ab=aqiBand(s.aqi), ub=uvBand(s.uv);
  set('aqLoc', s.name);
  const aqEl=document.getElementById('aqAqi');
  if(aqEl) aqEl.innerHTML=`<span class="aq-dot" style="background:${ab.color}"></span>${s.aqi!=null?s.aqi:NODATA_GLYPH}`;    
  set('aqBand', `${ab.label} · PM2.5 ${s.pm25!=null?s.pm25+' µg/m³':NODATA_GLYPH} · current hour`);    
  set('aqUv', s.uv!=null?s.uv:NODATA_GLYPH);
  set('aqUvBand', `${ub.label} · ${ub.burn}`);
  { const _rv=rainOrNull(s);
    const _r=document.getElementById('aqRain'); if(_r) _r.innerHTML=(_rv!=null?_rv.toFixed(1):NODATA_GLYPH)+'<span style="font-size:0.75rem"> mm</span>';
    const _rb=document.getElementById('aqRainBand'); if(_rb) _rb.textContent=(_rv==null?'No rain data':_rv>=5?'Notable — flood/GLOF driver':_rv>0?'Light precipitation':'No current rain'); }
  const scale=document.getElementById('uvScale');
  if(scale){
    const cols=['#059669','#059669','#E6B655','#E6B655','#E6B655','#F08A24','#F08A24','#982122','#982122','#982122','#7c3aed'];
    scale.innerHTML=cols.map((c,i)=>`<i class="${i<ub.fill?'on':''}" style="background:${c}"></i>`).join('');
  }
  const advice = s.aqi>100
    ? `${ab.advice} Combined with a feels-like load, outdoor workers need rest and hydration cycles.`
    : `${ab.advice} UV is ${ub.label.toLowerCase()} — ${ub.burn}.`;
  set('aqAdvice', advice);
}


 


function cmpCardHtml(s){
  

  if(!s || !s.weatherLive){
    return `<div class="cmp-col"><h4>${s?s.name:'—'}</h4><div class="cmp-row"><span class="k">No live reading</span><span class="v">the station has not returned a forecast-model value in this session; nothing to compare</span></div></div>`;
  }
  const c=stationComfort(s), dl=discomfortLevel(c.di,c), bw=bestOutdoorWindow(c,s), ab=aqiBand(s.aqi), ub=uvBand(s.uv);   
  const _aqTxt=(s.aqiLive?(s.aqi+' '+ab.label):'not retrieved');
  const _fetched=(s.liveFetchedAt?new Date(s.liveFetchedAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit'})+' PKT':'');

  return `<div class="cmp-col">
    <h4>${s.name}</h4>
    <div class="cmp-row"><span class="k">Feels like</span><span class="v">${c.feels==null?'—':c.feels+'°C'}</span></div>
    <div class="cmp-row"><span class="k">Thermal stress (UTCI)</span><span class="v">${c.utci==null?'—':Math.round(c.utci)+'°C shade'} · ${dl.badge}</span></div>
    <div class="cmp-row"><span class="k">Dew point</span><span class="v">${Math.round(c.dp)}°C</span></div>
    <div class="cmp-row"><span class="k">Est. wet-bulb (proxy)</span><span class="v">${(c.wb==null||!isFinite(c.wb))?'—':Math.round(c.wb)+'°C'}</span></div>
    <div class="cmp-row"><span class="k">Humidity</span><span class="v">${s.hum}%</span></div>
    <div class="cmp-row"><span class="k">Air quality (modelled)</span><span class="v"><span class="aq-dot" style="background:${s.aqiLive?ab.color:'#B9BEC4'}"></span>${_aqTxt}</span></div>
    <div class="cmp-row"><span class="k">Retrieved</span><span class="v">${_fetched||'this session'} · forecast model, not a station observation</span></div>
    <div class="cmp-row"><span class="k">UV index</span><span class="v">${s.uv} ${ub.label}</span></div>
    <div class="cmp-row"><span class="k">Comfort score</span><span class="v">${c.comfortScore}/100</span></div>
    <div class="cmp-row"><span class="k">Best window</span><span class="cmp-win">${bw[0]}</span></div>
  </div>`;
}
function renderCompare(){
  const a=document.getElementById('cmpA').value, b=document.getElementById('cmpB').value;
  const sa=STATIONS.find(x=>x.id===a), sb=STATIONS.find(x=>x.id===b);
  const grid=document.getElementById('cmpGrid');
  if(grid && sa && sb) grid.innerHTML=cmpCardHtml(sa)+cmpCardHtml(sb);
}
function initCompare(){
  const selA=document.getElementById('cmpA'), selB=document.getElementById('cmpB');
  const opts=STATIONS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  selA.innerHTML=opts; selB.innerHTML=opts;
  selA.value=selectedId||'';
  selB.value=(STATIONS.find(s=>s.id!==selA.value)||STATIONS[1]).id;
  selA.onchange=renderCompare; selB.onchange=renderCompare;
  renderCompare();
}
function openCompare(){
  initCompare();
  document.getElementById('cmpModal').classList.add('open');
}
function closeCompare(){ document.getElementById('cmpModal').classList.remove('open'); }


function buildBrief(s){
   
  if(!s || !s.weatherLive) return 'AI GEO NIGRAAN \u2014 CITY COMFORT BRIEF\nNo live reading for '+(s?s.name:'this station')+' in this session; nothing to brief. This brief covers comfort, air quality and UV for one city station only \u2014 hazard classes are on the Operations board.';
  const c=stationComfort(s), dl=discomfortLevel(c.di,c), hr=heatRiskLabel(c.feels,(s&&s.temp!=null?+s.temp:null),s), bw=bestOutdoorWindow(c,s), ab=aqiBand(s.aqi), ub=uvBand(s.uv);   

  return [
    `AI GEO NIGRAAN — CITY COMFORT BRIEF (one city station: comfort, air quality and UV; hazard classes are on the Operations board)`,
    `City: ${s.name}  ·  ${new Date().toLocaleString('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit',hour12:false})} PKT (model context)`,
    ``,
    `Temperature: ${s.t}°C  ·  Feels like: ${c.feels}°C`,
    `Thermal stress (UTCI): ${c.utci==null?'—':Math.round(c.utci)+'°C in shade'} (${dl.level})${c.utciSun!=null?'; in the sun about '+Math.round(c.utciSun)+'°C (estimated)':''}`,
    `Wet-bulb proxy: ${(c.wb==null||!isFinite(c.wb))?'—':Math.round(c.wb)+'°C'}  ·  Dew point: ${(c.dp==null||!isFinite(c.dp))?'—':Math.round(c.dp)+'°C'}  ·  Humidity: ${s.hum==null?'—':s.hum+'%'}`,
    `Heat stress at this place (UTCI): ${hr.risk} — ${hr.note}`,
    `Air quality: AQI ${s.aqi} (${ab.label}), PM2.5 ${s.pm25} µg/m³`,
    `UV index: ${s.uv} (${ub.label}, ${ub.burn})`,
    `Comfort score: ${c.comfortScore}/100`,
    ``,
    `Best outdoor window: ${bw[0]} — ${bw[1]}`,
    `Outdoor labour: ${c.heatStress>=80?'Pause heavy work 11:00–17:00':c.heatStress>=60?'30–40 min work cycles with water and shade':'Routine activity manageable with hydration'}`,
    `Event ops: ${c.heatStress>=75?'Cooling plan required (mist fans, shade, water)':c.heatStress>=55?'Shade and water points recommended':'Standard controls'}`,
    

    `Urban heat: ${(function(){
        try{ const _u=(window.AGN&&AGN.urbanHeat&&AGN.urbanHeat.localizeStation)
                        ? AGN.urbanHeat.localizeStation(s) : null;
             const _d=_u&&_u.microclimate&&_u.microclimate.morphologyDeltaC;
             if(Number.isFinite(Number(_d)))
               return (Number(_d)>=0?'+':'\u2212')+Math.abs(Number(_d)).toFixed(1)
                      +' \u00b0C from urban form';
        }catch(_){}
        if((window.AGN&&AGN.urbanHeat&&typeof AGN.urbanHeat.c12==='function'&&AGN.urbanHeat.c12().withheld)) return 'not assessed (no tested skill)';   /* v91.17.283.6 C12 */
        return 'not held for this unit — no urban-form profile'; })()}`,
    ``,
    `Data: model forecast series through the local server; station checks as printed on the skill sheet.`,
    `AI Geo Navigators · aigeo360.com`
  ].join('\n');
}
function copyBrief(){
  const s=STATIONS.find(x=>x.id===selectedId)||null; if(!s) return;
  const text=buildBrief(s);
  const label=document.getElementById('exportLabel');
  const done=()=>{ if(label){ const o=label.textContent; label.textContent='Copied'; setTimeout(()=>label.textContent=o,1600); } };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text,done));
  } else { fallbackCopy(text,done); }
}
function fallbackCopy(text,done){
  try{
    const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done();
  }catch(e){   }
}


const SPK_W=312, SPK_H=96, PAD=8;
function drawSpark(s){
  if(!document.getElementById('spark')) return;    
  const historic=DAY_OFFSET<0 && window.MACH_HISTORY && window.MACH_HISTORY.getHourly
    ? window.MACH_HISTORY.getHourly(s,DAY_OFFSET) : null;
  

  let _liveT=null, _liveTime=null;
  try{ const _e=window.LIVE_HOURLY && window.LIVE_HOURLY[s.id];
       if(_e && Array.isArray(_e.temp) && _e.temp.length>=24){ _liveT=_e.temp.slice(0,48); _liveTime=(_e.time||[]).slice(0,48); } }catch(_){}
  const data=(historic&&historic.length?historic.map(d=>d.t):(_liveT||[])).filter(v=>v!=null);
  try{ window.__agnSparkTime=(historic&&historic.length)?null:_liveTime; }catch(_){}
  if(!data.length){
    try{ const tr=document.getElementById('trendRange'); if(tr) tr.textContent='no hourly series yet';
         const sv=document.getElementById('spark'); if(sv) sv.innerHTML='<text x="8" y="50" font-size="11" fill="#6B7A84" font-family="Manrope">Live hourly series not loaded for this station yet</text>'; }catch(_){}
    return;
  }
  const min=Math.min(...data), max=Math.max(...data);
  document.getElementById('trendRange').textContent=`${Math.round(min)}° – ${Math.round(max)}°`;
  const xs=i=> PAD + i*(SPK_W-2*PAD)/(Math.max(1,data.length-1));
  const ys=v=> SPK_H-PAD - (v-min)/(max-min||1)*(SPK_H-2*PAD-6);
  let d=`M ${xs(0)} ${ys(data[0])}`;
  for(let i=1;i<data.length;i++){
    const x0=xs(i-1),x1=xs(i),y0=ys(data[i-1]),y1=ys(data[i]),xm=(x0+x1)/2;
    d+=` C ${xm} ${y0} ${xm} ${y1} ${x1} ${y1}`;
  }
  const area=d+` L ${xs(data.length-1)} ${SPK_H} L ${xs(0)} ${SPK_H} Z`;
  const startX=xs(0), isHist=!!(historic&&historic.length);
  const svg=document.getElementById('spark');
  svg.innerHTML=`
    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14B8A6" stop-opacity=".28"/>
      <stop offset="1" stop-color="#14B8A6" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#sg)"/>
    <path d="${d}" fill="none" stroke="#0C3851" stroke-width="2.2" stroke-linecap="round"/>
    <line x1="${startX}" y1="4" x2="${startX}" y2="${SPK_H}" stroke="#982122" stroke-width="1.4" stroke-dasharray="3,3"/>
    <text x="${startX+4}" y="13" font-size="9" font-weight="700" fill="#982122" font-family="Manrope">${isHist?'00:00':'NOW'}</text>
    <circle id="spkDot" cx="${startX}" cy="${ys(data[0])}" r="3.5" fill="#0C3851" stroke="#fff" stroke-width="1.5"/>`;
  const tip=document.getElementById('sparkTip');
  svg.onmousemove=e=>{
    const r=svg.getBoundingClientRect(); const px=(e.clientX-r.left)/r.width*SPK_W;
    let i=Math.round((px-PAD)/((SPK_W-2*PAD)/(Math.max(1,data.length-1))));
    i=Math.max(0,Math.min(data.length-1,i));
     
    let hr=null;
    if(isHist) hr=historic[i].h;
    else { try{ const tt=window.__agnSparkTime && window.__agnSparkTime[i]; hr=tt?Number(String(tt).slice(11,13)):null; }catch(_){ hr=null; } if(hr==null||!isFinite(hr)) hr=(new Date().getHours()+i)%24; }
    tip.style.opacity=1; tip.style.left=(xs(i)/SPK_W*100)+"%"; tip.style.top=(ys(data[i])/SPK_H*100)+"%";
    tip.textContent=`${String(hr).padStart(2,'0')}:00 · ${Math.round(data[i])}°`;
    document.getElementById('spkDot').setAttribute('cx',xs(i)); document.getElementById('spkDot').setAttribute('cy',ys(data[i]));
  };
  svg.onmouseleave=()=>{tip.style.opacity=0;document.getElementById('spkDot').setAttribute('cx',startX);document.getElementById('spkDot').setAttribute('cy',ys(data[0]));};
}


function agnNightAt(lat,lon,iso){ try{ var d=iso?new Date(iso):new Date(); if(!isFinite(d)) return false;
    var doy=Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(d.getUTCFullYear(),0,0))/864e5);
    var decl=23.44*Math.sin(2*Math.PI*(284+doy)/365)*Math.PI/180, la=lat*Math.PI/180;
    var utcH=d.getUTCHours()+d.getUTCMinutes()/60, solarH=utcH+lon/15, ha=(solarH-12)*15*Math.PI/180;
    var el=Math.asin(Math.sin(la)*Math.sin(decl)+Math.cos(la)*Math.cos(decl)*Math.cos(ha));
    return el < -0.833*Math.PI/180; }catch(_){ return false; } }
function agnNightEm(em,s,d){ try{ var lat=Number(s&&(s.lat!=null?s.lat:s.latitude)), lon=Number(s&&(s.lon!=null?s.lon:(s.lng!=null?s.lng:s.longitude)));
    if(!isFinite(lat)||!isFinite(lon)) return em; var iso=d&&d.time?(/[zZ]|[+-]\d\d:?\d\d$/.test(d.time)?d.time:d.time+'+05:00'):null;
    if(!iso&&d&&d.h!=null){ var t=new Date(); t.setUTCHours(((d.h-5)%24+24)%24,30,0,0); iso=t.toISOString(); }
    if(!agnNightAt(lat,lon,iso)) return em; var e=String(em).replace(/\uFE0F/g,'');
    if(e==='\u2600') return '\u{1F319}'; if(e==='\u{1F324}'||e==='\u26C5'||e==='\u{1F325}') return '\u2601\uFE0F'; return em; }catch(_){ return em; } }
function drawHourly(s){
  const box=document.getElementById('hscroll'); if(!box) return;
  const data=hourly24(s);
  const isHist=DAY_OFFSET<0 && data.some(d=>d.historical);
  if(!data.length && !isHist){
    box.innerHTML=Array.from({length:8},(_,i)=>`<div class="hcell hcell-loading" aria-label="Loading live hourly forecast"><div class="hr">${i===0?'NOW':'—'}</div><div class="em">…</div><div class="t">—</div><div class="pp">Loading</div></div>`).join('');
    return;
  }
  

  let early='';
  try{ const la=Number(s&&(s.lat!=null?s.lat:s.latitude)), lo=Number(s&&(s.lon!=null?s.lon:(s.lng!=null?s.lng:s.longitude)));
    if(!isHist && (typeof DAY_OFFSET==='undefined'||!DAY_OFFSET) && isFinite(la) && isFinite(lo) && window.AGN && AGN.siteUnit && window.agnRainSplit){
      const su=AGN.siteUnit(la,lo), sp=(su&&su.key)?agnRainSplit(su.key):null;
      if(sp && sp.pastMm>=0.2) early=`<div class="hcell agn-early198" title="Rain in the forecast for today's hours already past (00:00 to ${sp.nowHour} PKT) in this tehsil; the cells to the right start at the present hour"><div class="hr">Earlier</div><div class="em">\u{1F327}\uFE0F</div><div class="t" style="font-size:15px">${sp.pastMm} mm</div><div class="pp">${sp.lastWetWindow?'last rain '+sp.lastWetWindow:'today'}</div></div>`; } }catch(_){ early=''; }
  /* v91.17.283.22 · item 3: rain is never given at an hour. The hour cells are grouped in their 3-hour PKT windows (00-03 ... 21-24) and
     each window has one footer: its rain (the sum of the record's three hours) and its chance of rain, the strip's method (the share of the
     ensemble members whose window total reaches tau; screening fallback marked), from the place bundle (AGNHourStrip.cells). A past day
     (history) keeps its measured hourly amounts. */
  const _esc=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const cell=(d,i)=>{
    const lbl = (!isHist && i===0) ? `<span class="nowtag">NOW</span>` : `<div class="hr">${String(d.h).padStart(2,'0')}:00</div>`;
    const cls=(!isHist&&i===0)?'now':'';
    const condTxt = d.em ? agnNightEm(String(d.em), s, d) : (d.cond ? String(d.cond).split('·')[0].trim() : '');
    const pp = isHist ? `<div class="pp">${(d.pp!=null&&isFinite(Number(d.pp))&&d.pp>0)?Number(d.pp).toFixed(1)+' mm':''}</div>` : '';
    return `<div class="hcell ${cls}" data-time="${d.time||''}">${lbl}<div class="em">${condTxt||'—'}</div><div class="t">${Number.isFinite(d.t)?d.t+'°':'—'}</div>${pp}</div>`; };
  const _off=(window.LIVE_HOURLY&&LIVE_HOURLY[s.id]&&LIVE_HOURLY[s.id].off!=null)?Number(LIVE_HOURLY[s.id].off):18000;
  const _pkt=t=>{ const ms=Date.parse(String(t||'').slice(0,16)+':00Z'); return isFinite(ms)?new Date(ms+(18000-_off)*1000).toISOString().slice(0,16):''; };
  const _B=(()=>{ try{ const PS=AGN.pointState, a=AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null, la=Number(s.lat!=null?s.lat:s.latitude), lo=Number(s.lon!=null?s.lon:(s.lng!=null?s.lng:s.longitude));
      if(a&&a.lat!=null&&isFinite(la)&&PS.key(a.lat,a.lon)===PS.key(la,lo)) return PS.peek(+a.lat,+a.lon); return isFinite(la)&&isFinite(lo)?PS.peek(la,lo):null; }catch(_){ return null; } })();
  const _W=(!isHist&&window.AGNHourStrip&&_B&&_B.ok)?AGNHourStrip.cells(_B,data.map(d=>_pkt(d.time)),{registry:window.AGN&&AGN.levelLegends}):null;
  if(!_W){ agnSetHTML(box,early+data.map(cell).join('')); return; }
  let html=early, i=0;
  while(i<data.length){ const c=_W[i], n=(c&&c.first)?c.span:1;
    html+=`<div class="agnw3" data-win="${_esc(c&&c.key)}"><div class="agnw3h">${data.slice(i,i+n).map((d,j)=>cell(d,i+j)).join('')}</div><div class="agnw3f" data-mm="${c&&c.mm!=null?c.mm:''}" data-p="${c&&c.p!=null?c.p:''}"${c&&c.limited?' data-limited="1"':''} title="${_esc(c&&c.title)}">${c?c.rainHtml+' · '+c.chanceHtml:'–'}</div></div>`; i+=n; }
  agnSetHTML(box,html);   /* v283.36 item 10: redraw only when the content changes */
}








/* v91.17.283.24 · the general alert minimum (class rank 3 = High) is the gate register's (data/model-gate.json alert_min_class_rank), read from
   the slim gate this page and the engine hosts load (GET /api/registry/gate, alertMinClassRank); no gate gives no general alert, never a typed rank */
var ALERT_MIN_CLASS_RANK = (function(){ try{ var r=window.AGN_MODEL_GATE&&window.AGN_MODEL_GATE.alertMinClassRank; return (typeof r==='number'&&r>=1&&r<=4&&Math.round(r)===r)?r:null; }catch(_){ return null; } })();
try{ window.ALERT_MIN_CLASS_RANK = ALERT_MIN_CLASS_RANK; }catch(_){}
/* v91.17.283.12 · THE ONE ALERT RULE (the same as the server's alertGate, server/api/engine.mjs): a hazard whose model-gate entry lists
   its alert levels raises an alert at exactly those levels (heat: Low and Moderate; with the UTCI rule a heat level starts at Moderate,
   strong heat stress); any other hazard that the gate lets alert, at High or above */
function agnAlertLevelOk(h, rank){ if(rank==null||!(rank>=1)) return false;
  try{ var G0=window.AGN_MODEL_GATE, id=G0&&G0.layers&&G0.layers[h==='rainfall'?'rain_hz':h], e=id&&G0.entries&&G0.entries[id], A=e&&(e.alertLevels||(e.resolved&&e.resolved.alertLevels));
    if(e&&e.canAlert===false) return false; if(Array.isArray(A)) return A.indexOf(['Normal','Low','Moderate','High','Severe'][rank])>=0; }catch(_){}
  if(ALERT_MIN_CLASS_RANK==null) return false;
  return rank>=ALERT_MIN_CLASS_RANK; }
try{ window.agnAlertLevelOk = agnAlertLevelOk; }catch(_){}


function alertFromEvidence(s){
  try{
    if(!s || !window.AGN || !AGN.hazards || !AGN.hazards.evaluate) return null;
    var scored=[];
    ['heat','flood','wind','rain_hz','cold'].forEach(function(h){
      var r=AGN.hazards.evaluate(s.name, s, h, 24);
      if(!r || !r.available || r.categorical) return;
      var idx=r.screening && r.screening.index;
      if(idx==null || !isFinite(idx)) return;
      var b=null; try{ b=AGN.hazards.band(idx); }catch(_){}
      if(!b || b.index==null) return;
      scored.push({hazard:h, index:idx, band:b.label, rank:b.index,
                   physical:r.physical, evidenceClass:r.evidenceClass});
    });
    scored=scored.filter(function(x){ return agnAlertLevelOk(x.hazard, x.rank); });   /* v91.17.283.12: the one alert rule */
    if(!scored.length) return null;
    var top=scored.reduce(function(a,b){ return (b.rank>a.rank)?b:a; }, scored[0]);
     
    var holders=scored.filter(function(x){ return x.rank===top.rank; })
                      .sort(function(a,b){ return String(a.hazard).localeCompare(String(b.hazard)); });
    

    var LABEL={heat:'Heat stress',flood:'Flood',wind:'Wind and gusts',rain_hz:'Heavy rain',cold:'Cold stress (UTCI)'};
    var names=holders.map(function(x){ return LABEL[x.hazard]||x.hazard; });
    var lead=holders[0];
    return { name:s.name,
             alert:names.join(' + ')+' · '+top.band,
             sev:top.rank+1,
             classRank:top.rank, band:top.band,
             index:lead.index, hazard:lead.hazard,
             holders:holders.map(function(x){ return {hazard:x.hazard, index:x.index}; }),
             coEqual:holders.length>1,
             physical:(lead.physical && lead.physical.value!=null)
                        ? (lead.physical.value+' '+(lead.physical.unit||'')) : null,
             derivedFrom:'canonical hazard evidence · raised on the worst band class '
                        +'this unit holds ('+top.band+')'
                        +(holders.length>1
                            ? ', held co-equally by '+names.join(' and ')
                              +' — no index comparison separates them'
                            : '') };
  }catch(_){ return null; }
}


function _alertSevWord(a){ if(a&&a.agnQuake) return a.level;   /* v91.17.283.20 · B7: an earthquake row names its own level */
  try{
    if(a && a.index!=null && window.AGN && AGN.hazards && AGN.hazards.band){
      var b=AGN.hazards.band(a.index);
      if(b) return b.label;
    }
  }catch(_){}
  return 'unbanded';
}
try{ window._alertSevWord=_alertSevWord; }catch(_){}

/* v91.17.283.20 · B7 · THE ONE activeAlerts: the page's own list (pageAlerts) and the four stages that were save-and-wrap layers, called
   in the order they ran: AGN.alertStages.quake (earthquake rows, agn-quake-js), .gate (the one alert rule, the heat / cold re-gate),
   .one (the issued engine list when it is usable, agn-alerts-one: then the page list is not computed), .ruleA (a row whose every hazard
   is at an Indicative level is not an alert, agn-v283-js) */
window.AGN=window.AGN||{}; AGN.alertStages={};
function activeAlerts(){ var S=(window.AGN&&AGN.alertStages)||{}, rows;
  var page=function(){ var r=[]; try{ r=pageAlerts()||[]; }catch(_){ r=[]; } if(S.quake) r=S.quake(r); if(S.gate) r=S.gate(r); return r; };
  rows=S.one?S.one(page):page();
  if(S.ruleA) rows=S.ruleA(rows);
  return rows; }
function pageAlerts(){
  try{
    

    

    var rows=STATIONS.map(alertFromEvidence).filter(Boolean);
    try{
      var vs=(typeof window.allDistrictVerdicts==='function')?window.allDistrictVerdicts():[];
      var seen={}; rows.forEach(function(r){ seen[String(r.name).toLowerCase()]=1; });
      (vs||[]).forEach(function(v){
        var bandI=function(l){ try{ var b=AGN.hazards.band(l.score); return b&&b.index!=null?b.index:null; }catch(_){ return null; } };
        var ev=(v.lanes||[]).filter(function(l){ return l && !l.standing && !l.condition && agnAlertLevelOk(l.hazard, bandI(l)); });   /* v91.17.283.12: the one alert rule */
        if(!ev.length) return;
        var worst=ev.reduce(function(a,b){ return (b.score>a.score)?b:a; }, ev[0]);
        var rank=bandI(worst);
        var nm=String(v.name||''); if(seen[nm.toLowerCase()]) return; seen[nm.toLowerCase()]=1;
        rows.push({ name:nm, district:true, drivingTehsil:(v.drivingTehsil||null),
                    alert:ev.map(function(l){ return (l.hazard||'').replace('rain_hz','rainfall').replace(/^\w/,function(c){ return c.toUpperCase(); }); }).join(' + ')+' \u00b7 '+worst.verdict,
                    sev:rank+1, classRank:rank, band:worst.band||worst.verdict, index:worst.score, hazard:worst.hazard,
                    holders:ev.map(function(l){ return {hazard:l.hazard, index:l.score}; }), coEqual:ev.length>1,
                    basis:'district row from the national priority board (event lanes only; driving tehsil '+(v.drivingTehsil||'\u2014')+')' });
      });
    }catch(_){}
    return rows
      .sort(function(a,b){
        var ra=(a&&a.classRank)||0, rb=(b&&b.classRank)||0;
        if(rb!==ra) return rb-ra;
        return String((a&&a.name)||'').localeCompare(String((b&&b.name)||''));
      });
  }catch(_){ return []; }
}
function drawRailAlerts(){
  const al=activeAlerts();
  const sel=STATIONS.find(s=>s.id===selectedId);
  const box=document.getElementById('railAlerts');
  
  let here = (sel && sel.alert) ? [{name:sel.name,alert:sel.alert,sev:sel.sev}] : [];
  let rows = al.filter(a=>!(sel && a.name===sel.name)).slice(0, here.length?2:3);
  const _row = r=>`
    <div class="arow" style="background:${hexA(r.sev)}">
      <span class="ai" style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${r.sev>=5?'var(--sev-5)':r.sev>=4?'var(--sev-4)':'var(--sev-3)'}"></span>
      <div><h4 style="color:${SEV[r.sev]}">${r.alert}</h4><p>${r.name} · ${_alertSevWord(r)} severity</p></div>
    </div>`;
  let _subj=''; try{ const _a=(window.AGN&&AGN.project&&AGN.project.activeAsset)?AGN.project.activeAsset():null; _subj=_a?String(_a.name||_a.asset_id).replace(/\s*\(AJG Supplies\)$/,''):(sel?sel.name:''); }catch(_){ _subj=sel?sel.name:''; }
  const _lab=t=>`<div style="font:800 0.6875rem/1.2 Manrope,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:2px 2px 0">${t}</div>`;
  box.innerHTML = _lab('At '+(_subj||'this place'))
    + (here.length ? here.map(_row).join('') : `<div style="font-size:0.8125rem;color:#2e6b34;font-weight:700;padding:2px 2px 4px">No alert here now.</div>`)
    + (rows.length ? _lab('Elsewhere in Pakistan') + rows.map(_row).join('') : '');
}


function _alertTopBandHeld(){
  var best=null;
  try{
    (window.STATIONS||[]).forEach(function(s){
      ['heat','flood','wind','rain_hz','cold'].forEach(function(h){
        try{
          var r=AGN.hazards.evaluate(s.name,s,h,24);
          if(!r||!r.available||r.categorical) return;
          var idx=r.screening&&r.screening.index;
          if(idx==null||!isFinite(idx)) return;
          var b=AGN.hazards.band(idx);
          if(b&&b.index!=null&&(best===null||b.index>best.rank)) best={rank:b.index,label:b.label};
        }catch(_){}
      });
    });
  }catch(_){}
  return best;
}
function _alertPaintDot(n){
  try{
    var d=document.querySelector('#alertBtn .dot'); if(!d) return;
    if(n>0){ d.style.background='var(--red)'; d.style.boxShadow='0 0 16px rgba(152,33,34,.55)';
             d.style.opacity='1'; }
    else   { d.style.background='var(--muted)'; d.style.boxShadow='none'; d.style.opacity='.55'; }
    var b=document.querySelector('#alertBtn > button');
    if(b) b.title = n>0
      ? (n+' unit'+(n===1?'':'s')+' hold a class at or above the alert threshold.')
      : 'No unit holds a class at or above the alert threshold right now.';
  }catch(_){}
}
function drawAlertList(){
  const al=activeAlerts();
  _alertPaintDot(al.length);
  if(!al.length){
    var top=_alertTopBandHeld();
    document.getElementById('alertList').innerHTML =
      '<div style="padding:10px 11px;font-size:0.78125rem;line-height:1.45;color:var(--muted);font-weight:600">'
      +'No active alerts.'
      +'<div style="font-weight:500;margin-top:5px">An alert is raised only where a unit holds a class '
      +'at or above the threshold this build publishes on <code>AGN.hazards.alertThreshold</code>. '
      +(top ? ('The highest class held by any city station or district (event hazards) right now is <b>'+top.label+'</b>, which is below it.')
            : 'No unit returned a scored class in this cycle.')
      +'</div></div>';
    return;
  }
  document.getElementById('alertList').innerHTML = al.map(a=>`
    <div class="alertrow" data-name="${a.name}">
      <span class="sw" style="background:${SEV[a.sev]}"></span>
      <div><h5>${a.alert}</h5><p>${a.name} · ${_alertSevWord(a)} severity</p></div>
    </div>`).join('');
  [...document.querySelectorAll('#alertList .alertrow')].forEach(r=>{
    r.onclick=()=>{ const s=STATIONS.find(x=>x.name===r.dataset.name);
      if(s) selectCity(s.id,true);
      else { try{ var c=(typeof PK_DISTRICT_CENTROIDS!=='undefined')?PK_DISTRICT_CENTROIDS.find(function(x){ return x.district===r.dataset.name; }):null;
                  if(c && window.driveFromPoint){ var _nm=r.dataset.name; AGN.places.unitPoint(_nm).catch(function(){ return null; }).then(function(sp){ var _p=(sp&&isFinite(sp.lat))?sp:c; try{ if(window.AGN&&AGN.selFocus) AGN.selFocus.focus(_p.lat,_p.lon,{mode:'place',drive:true}); }catch(_){}    
                    if(sp&&isFinite(sp.lat)) window.driveFromPoint(sp.lat,sp.lon,_nm,true,(sp.elevM!=null?sp.elevM:undefined)); else window.driveFromPoint(c.lat,c.lon,_nm,true); }); } }catch(_){} }    
      document.getElementById('alertBtn').classList.remove('open'); };
  });
}




function legendValidLine(hzKey){
  try{
    if(hzKey==='nss'||hzKey==='nss_baseline') return 'Static layer \u00b7 no valid period';
    

    if(typeof hzDayCapable==='function' && !hzDayCapable(hzKey))
      return ({
        drought:(function(){ var _dn=window.__agnDroughtNat||null; return 'Last 30 and 90 days of rain (satellite rainfall record) and water balance to '+((_dn&&_dn.asOf)?_dn.asOf:'the latest data day')+' \u00b7 not a forecast';     })(),
        nss_dynamic:'The selected day\u2019s ground wetness (last 7 days of rain and soil moisture)',
        nss_runoff:'The selected day\u2019s forecast rain',
        nss_retention:'The selected day\u2019s ground wetness',
        aqi:'Latest air-quality forecast hour \u00b7 the unit card shows its time',
        seismic:'Static layer \u00b7 design-basis zone, no valid period',
        cyclone:'Static exposure \u00b7 no active track connected, no valid period',
        glof:'GLOF level \u00b7 mapped glacial lakes routed 100 km along HydroBASINS; changes with our monthly Sentinel-2 lake reads and outburst reports, not with today\'s weather',
        landslide:'Worst intensity-duration window in the forecast hours still ahead (up to 72) \u00b7 the card says at which hour it starts; not a present-hour value',
        flood_riverine:'Upstream discharge \u00b7 lead in days from the gauge, not a daily window',
        air:'Latest retrieved observation \u00b7 see the unit card for its timestamp'
      })[hzKey] || 'No daily forecast basis \u00b7 valid period not established for this layer';
    var d=0, b='peak';
    if(window.AGN&&AGN.day){ if(AGN.day.get) d=AGN.day.get()||0; if(AGN.day.basis) b=AGN.day.basis(); }
    var day=(typeof hzPkDate==='function')?hzPkDate(d):null;
    if(d===0 && b==='current'){
      var hr=null; try{ hr=(window.MACH_TIME&&MACH_TIME.hour)?MACH_TIME.hour():null; }catch(_){}
      if(hr==null) return 'Valid for the present hour \u00b7 one hourly value';
      var h2=String((hr+1)%24).padStart(2,'0');
      return 'Valid '+String(hr).padStart(2,'0')+':00\u2013'+h2+':00 PKT'+(day?' on '+day:'')
             +' \u00b7 one hourly value, not the day\u2019s worst case';
    }
    return 'Valid 00:00\u201324:00 PKT'+(day?' on '+day:'')+' \u00b7 that day\u2019s worst case'
           +(d>0?' (day +'+d+')':'');
  }catch(_){ return 'Valid period unavailable'; }
}
window.legendValidLine=legendValidLine;

function drawLegend(){
  

  try{ if(typeof renderCompactLegend==='function') return renderCompactLegend(); }
  catch(e){ try{ agnDiag('map','drawLegend:delegate', e); }catch(_){ } }
}



[...document.querySelectorAll('.seg button[data-layer]')].forEach(b=>{
  b.onclick=()=>{
    const layer=b.dataset.layer;
    if(!layer || !bases[layer]) return;   
    if(layer==='aqi'){
      
      [...document.querySelectorAll('.seg button[data-layer]')].forEach(x=>x.setAttribute('aria-pressed', x===b?'true':'false'));
      districtAqiMode=true; districtHazardMode=false;
      setDistrictLayer(true);
      document.querySelectorAll('#geoLevelTab button').forEach(x=>{const _on=x.dataset.geo==='district';x.classList.toggle('on',_on);x.setAttribute('aria-pressed',_on?'true':'false');});
      if(typeof refreshDistrictHazard==='function') refreshDistrictHazard();
      activeLayer='aqi'; updateLayerMeta('aqi'); drawLegend();
      return;
    }
    if(layer===activeLayer) return;
    districtAqiMode=false;
    [...document.querySelectorAll('.seg button[data-layer]')].forEach(x=>x.setAttribute('aria-pressed', x===b?'true':'false'));
    const fade=document.getElementById('mapFade');
    document.body.dataset.layer=layer;
    if(fade) fade.classList.add('show');
    setTimeout(()=>{
      Object.values(bases).forEach(t=>map.removeLayer(t));
      bases[layer].addTo(map);
      provLayer.bringToFront(); natLayer.bringToFront();
      if(districtsOn) districtLayer.bringToFront();
      Object.values(markers).forEach(m=>m._icon && m._icon.parentNode && m.setZIndexOffset(1000));
      activeLayer=layer;
      updateLayerMeta(layer);
      applyLayerStyle(layer); drawLegend(); refreshPins();
      
      
      
      
       
    },180);
    if(fade) setTimeout(()=>fade.classList.remove('show'),460);
  };
});


const cityMenu=document.getElementById('cityMenu');


function _hdrCityRows(){ return STATIONS.map(s=>`<button role="option" data-id="${s.id}">
  <span>${CITY_ZONE[s.id]||s.name}</span><span class="t">${s.t}° ${s.em}</span></button>`).join(''); }
cityMenu.innerHTML=`<div class="hdr-locsearch" style="padding:8px 8px 4px 8px;border-bottom:1px solid var(--line)">
    <input id="hdrPlaceInput" type="search" autocomplete="off" placeholder="Search any place in Pakistan (tehsil, district, town)…" aria-label="Search a place in Pakistan" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);border-radius:9px;font:inherit;font-size:0.85rem">
    <div id="hdrPlaceResults" role="listbox" style="max-height:220px;overflow:auto"></div>
    <button type="button" id="hdrUseLoc" role="option" style="margin-top:6px;width:100%;text-align:left"><span>Use my location</span><span class="t">GPS</span></button>
  </div><div id="hdrCityRows">${_hdrCityRows()}</div>`;
[...cityMenu.querySelectorAll('#hdrCityRows button')].forEach(b=>{
  b.onclick=()=>{ selectCity(b.dataset.id,true); closeCity(); };
});
(function(){
  var inp=document.getElementById('hdrPlaceInput'), box=document.getElementById('hdrPlaceResults'), useLoc=document.getElementById('hdrUseLoc');
  if(!inp||!box) return;
  var pending=null;    
  function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function render(rows, q){
    box.dataset.q=q||'';
    if(!rows.length){ pending=null; box.innerHTML='<div style="padding:6px 4px;font-size:0.78rem;color:var(--muted)">No place found in Pakistan for that spelling.</div>'; return; }
    box.innerHTML=rows.slice(0,8).map(function(r,i){
      var sub=[r.level, r.tehsil?('tehsil '+r.tehsil):null, r.district, r.province, r.note].filter(Boolean).join(' \u00b7 ');
      return '<button type="button" role="option" data-i="'+i+'" style="width:100%;text-align:left;display:block;padding:6px 8px;border:0;background:transparent;font:inherit;cursor:pointer">'
        +'<b style="font-size:0.85rem">'+esc(r.name)+'</b><div style="font-size:0.72rem;color:var(--muted)">'+esc(sub)+(r.disputed?' \u00b7 disputed territory (not scored)':'')+'</div></button>';
    }).join('');
    [...box.querySelectorAll('button')].forEach(function(b){ b.onclick=function(){ var r=rows[+b.dataset.i]; if(!r) return;
      

      var lab=document.getElementById('cityLabel'), prev=lab?lab.textContent:'', nm=r.name+(r.district&&r.district!==r.name?' \u00b7 '+r.district.replace(/ District$/,''):'');
      try{ if(lab){ lab.textContent='Loading '+r.name+'\u2026'; lab.dataset.agnPending=nm; setTimeout(function(){ if(lab.dataset.agnPending===nm){ lab.textContent=prev; delete lab.dataset.agnPending; } }, 90000); } }catch(_){}
      

      /* v91.17.278.1 · FIX2781 4 · a named place: a pin at the exact point with its popup (AGN.point.search); the place is driven as before.
         The older way (the tehsil outline and its popup) only when the point cannot be read. */
      var viaPin=(window.AGN&&AGN.point&&AGN.point.search&&r.level!=='coordinates'&&!r.disputed)?AGN.point.search(r):null;
      if(!viaPin){ try{ if(window.AGN&&AGN.selFocus) AGN.selFocus.focus(r.lat, r.lon, {mode:(r.level==='coordinates'?'point':'place'), drive:true}); }catch(_){} }
      try{ var pr=viaPin ? viaPin.then(function(x){ if(x) return x; try{ if(window.AGN&&AGN.selFocus) AGN.selFocus.focus(r.lat, r.lon, {mode:'place', drive:true}); }catch(_){} return window.driveFromPoint ? window.driveFromPoint(r.lat, r.lon, r.name, true, r.elevM) : null; })
          : (window.driveFromPoint ? window.driveFromPoint(r.lat, r.lon, r.name, true, r.elevM) : null);
        Promise.resolve(pr).then(function(res){ if(!lab||lab.dataset.agnPending!==nm) return;
            if(res && res.superseded) return;
            if(res && (res.ok===false || res.refused)){ lab.textContent=prev; delete lab.dataset.agnPending; return; }
            lab.textContent=nm; delete lab.dataset.agnPending; },
          function(){ if(lab&&lab.dataset.agnPending===nm){ lab.textContent=prev; delete lab.dataset.agnPending; } }); }catch(_){ if(lab){ lab.textContent=prev; delete lab.dataset.agnPending; } }
      closeCity(); }; });
    if(pending!=null && pending===q){ pending=null; var f0=box.querySelector('button[data-i]'); if(f0) f0.click(); }
  }
  /* v91.17.283.20 · B5: typing, its delay, the order of answers and the request are the shared place search's */
  var att=AGN.places.attach({input:inp, limit:8, coords:true, keepDisputed:true, render:function(rows,q){ render(rows,q); },
    fail:function(){ pending=null; box.innerHTML='<div style="padding:6px 4px;font-size:0.78rem;color:var(--muted)">Search unavailable (server not reachable).</div>'; },
    clear:function(){ pending=null; box.innerHTML=''; box.dataset.q=''; }});
  function search(q){ att.run(q); }
  inp.addEventListener('click', function(e){ e.stopPropagation(); });
  

  inp.addEventListener('keydown', function(e){ if(e.key!=='Enter') return; var q=inp.value.trim(); if(q.length<2) return;
    var f=box.querySelector('button[data-i]');
    if(f && box.dataset.q===q){ f.click(); return; }
    pending=q; att.cancel(); box.innerHTML='<div style="padding:6px 4px;font-size:0.78rem;color:var(--muted)">Searching\u2026</div>'; search(q); });
   
  function myPlace(){ try{ var s=localStorage.getItem('agn.myPlace'); var v=s?JSON.parse(s):null; return (v&&isFinite(v.lat)&&isFinite(v.lon))?v:null; }catch(_){ return null; } }
  function saveMyPlace(v){ try{ localStorage.setItem('agn.myPlace', JSON.stringify(v)); }catch(_){} }
  function kmTo(a,b){ var R=6371,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r,h=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)*Math.sin(dn/2); return 2*R*Math.asin(Math.sqrt(h)); }
  function goPlace(v, label){ if(window.driveFromPoint) window.driveFromPoint(v.lat, v.lon, v.name, true, v.elevM!=null?v.elevM:undefined); try{ var lab=document.getElementById('cityLabel'); if(lab) lab.textContent=label||v.name; }catch(_){} }
  function coarseFix(pt, acc){
    var km=acc/1000, saved=myPlace();
    if(saved && kmTo(pt,saved) <= km){ goPlace(saved, saved.name+' (my place)');
      box.innerHTML='<div style="padding:6px 4px;font-size:0.78rem;color:var(--muted)">Using your saved place <b>'+esc(saved.name)+'</b>: the browser only knew your position to \u00b1'+esc(km.toFixed(0))+' km and that circle contains it. <button type="button" data-agn-pick-other="1" style="margin-left:4px">Pick another</button></div>';
      var ob=box.querySelector('[data-agn-pick-other]'); if(ob) ob.onclick=function(e){ e.stopPropagation(); listNear(pt, km); };
      return; }
    listNear(pt, km);
  }
   
  function listNear(pt, km){
    box.innerHTML='<div style="padding:6px 4px;font-size:0.78rem;color:var(--muted)">The browser only knows your position to \u00b1'+esc(km.toFixed(0))+' km (a network position, not GPS). Looking up the places inside that circle\u2026</div>';
    AGN.places.near(pt.lat, pt.lon, Math.min(150,Math.max(1,km)), 500).then(function(j){
      var P=((j&&j.places)||[]).filter(function(r){ return r.tehsil; }), G={};
      P.forEach(function(r){ var g=G[r.tehsil]||(G[r.tehsil]={tehsil:r.tehsil, district:r.district, near:1e9, rows:[]}); g.rows.push(r); if(r.distanceKm<g.near) g.near=r.distanceKm; });
      var T=Object.keys(G).map(function(k){ return G[k]; }).sort(function(a,b){ return a.near-b.near; });
      var head='<div style="padding:6px 4px;font-size:0.78rem;color:var(--muted)">The browser only knows your position to \u00b1'+esc(km.toFixed(0))+' km (a network position, not GPS), so it is not used as your location. Pick your tehsil, then your place, or type it above:</div>'
        +'<label style="display:block;padding:2px 4px 6px;font-size:0.76rem"><input type="checkbox" id="agnKeepPlace" checked> remember my choice as my place</label>';
      var h=head;
      T.forEach(function(g,i){ h+='<button type="button" data-agn-teh="'+i+'" style="display:block;width:100%;text-align:left;padding:5px 6px;border:0;background:none;cursor:pointer;font-size:0.82rem"><b>'+esc(g.tehsil)+'</b> <span style="color:var(--muted)">'+esc(g.district||'')+' \u00b7 '+g.rows.length+' places</span></button>'; });
      if(!T.length) h+='<div style="padding:4px;font-size:0.78rem">No settlement is listed inside that circle; type your place above.</div>';
      box.innerHTML=h;
      [].forEach.call(box.querySelectorAll('[data-agn-teh]'), function(b){ b.onclick=function(e){ e.stopPropagation(); var g=T[+b.getAttribute('data-agn-teh')]; if(!g) return;
        var keepWas=(document.getElementById('agnKeepPlace')||{}).checked!==false;
        var R=g.rows.slice().sort(function(a,c){ return ((c.population||0)-(a.population||0)) || a.name.localeCompare(c.name); });
        var hh=head.replace(' checked>', keepWas?' checked>':'>')+'<div style="padding:2px 4px;font-size:0.8rem"><b>'+esc(g.tehsil)+'</b> \u00b7 <button type="button" data-agn-back="1" style="font-size:0.76rem">other tehsils</button></div>';
        R.forEach(function(r,i){ hh+='<button type="button" data-agn-near="'+i+'" style="display:block;width:100%;text-align:left;padding:4px 6px;border:0;background:none;cursor:pointer;font-size:0.82rem">'+esc(r.name)+(r.population?' <span style="color:var(--muted)">'+esc(String(r.population))+'</span>':'')+'</button>'; });
        box.innerHTML=hh;
        var bb=box.querySelector('[data-agn-back]'); if(bb) bb.onclick=function(ev){ ev.stopPropagation(); listNear(pt, km); };
        [].forEach.call(box.querySelectorAll('[data-agn-near]'), function(x){ x.onclick=function(ev){ ev.stopPropagation(); var r=R[+x.getAttribute('data-agn-near')]; if(!r) return;
          var keep=document.getElementById('agnKeepPlace'); if(!keep||keep.checked) saveMyPlace({name:r.name, lat:r.lat, lon:r.lon, elevM:r.elevM, tehsil:r.tehsil||null, savedAt:new Date().toISOString()});
          goPlace(r); closeCity(); }; });
      }; });
    }).catch(function(){ box.innerHTML='<div style="padding:6px 4px;font-size:0.78rem;color:var(--red)">The browser only knows your position to \u00b1'+esc(km.toFixed(0))+' km and the place list is unavailable; type your place above.</div>'; });
  }
  window.__agnCoarseFix=function(pt, acc){ try{ citysel.classList.add('open'); cityBtn.setAttribute('aria-expanded','true'); }catch(_){} coarseFix(pt, acc); };
  if(useLoc) useLoc.onclick=function(e){ e.stopPropagation();
    useLoc.disabled=true; useLoc.firstChild.textContent='Locating\u2026';
    AGN.places.locate().then(function(pt){ if(pt.coarse) return;
        if(window.driveFromPoint) window.driveFromPoint(pt.lat, pt.lon, pt.label, true);
        try{ var lab=document.getElementById('cityLabel'); if(lab) lab.textContent=pt.label; }catch(_){}
        closeCity(); })
     .catch(function(err){ box.innerHTML='<div style="padding:6px 4px;font-size:0.78rem;color:var(--red)">Location: '+esc(err&&err.message||'refused')+' (needs permission; localhost counts as secure)</div>'; })
     .finally(function(){ useLoc.disabled=false; useLoc.firstChild.textContent='Use my location'; });
  };
})();
const citysel=document.getElementById('citysel'), cityBtn=document.getElementById('cityBtn');
function closeCity(){ citysel.classList.remove('open'); cityBtn.setAttribute('aria-expanded','false'); }
cityBtn.onclick=e=>{ e.stopPropagation();
  const open=citysel.classList.toggle('open'); cityBtn.setAttribute('aria-expanded',open); };


const alertBtn=document.getElementById('alertBtn');
alertBtn.querySelector('button').onclick=e=>{ e.stopPropagation();
  const open=alertBtn.classList.toggle('open');
  alertBtn.querySelector('button').setAttribute('aria-expanded',open); };



document.addEventListener('click',e=>{ if(!e.isTrusted) return;
  const t=e.target; if(!(t&&t.closest&&t.closest('#citysel'))) closeCity();
  if(!(t&&t.closest&&t.closest('#alertBtn'))) alertBtn.classList.remove('open'); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeCity(); alertBtn.classList.remove('open'); closeCompare(); }});


document.getElementById('compareBtn').onclick=openCompare;
document.getElementById('cmpClose').onclick=closeCompare;
document.getElementById('cmpModal').addEventListener('click',e=>{ if(e.target.id==='cmpModal') closeCompare(); });
document.getElementById('exportBtn').onclick=copyBrief;






document.querySelectorAll('#geoLevelTab button').forEach(b=>b.onclick=()=>{
  

  document.querySelectorAll('#geoLevelTab button').forEach(x=>{
    const _on=(x===b); x.classList.toggle('on',_on); x.setAttribute('aria-pressed',_on?'true':'false');});
  setDistrictLayer(b.dataset.geo==='district');
});

(function(){ const ib=document.getElementById('indusToggle'); if(ib){ ib.onclick=()=>{
  const on=ib.getAttribute('aria-checked')!=='true';
  ib.setAttribute('aria-checked', on?'true':'false'); ib.classList.toggle('on', on);
  if(typeof window.toggleIndus==='function') window.toggleIndus(on);
}; } })();





function ensurePickOption(pick, key){
  if(!pick || !key) return;
  if(![...pick.options].some(o=>o.value===key)){
    var lab=(typeof AI_HAZARDS!=='undefined'&&AI_HAZARDS[key])?AI_HAZARDS[key].label:key;
    var o=document.createElement('option'); o.value=key; o.textContent='Hazard: '+lab+' (sector)';
    pick.appendChild(o);
  }
}

const mapHazardPick=document.getElementById('mapHazardPick');
if(mapHazardPick){ 


function applyDistrictFill(v, drawDistrictsFirst){
   
  window.mapLayer = v;
  if(drawDistrictsFirst!==false && !districtsOn){ setDistrictLayer(true);
    document.querySelectorAll('#geoLevelTab button').forEach(x=>{const _on=x.dataset.geo==='district';x.classList.toggle('on',_on);x.setAttribute('aria-pressed',_on?'true':'false');}); }
  if(v===''){                       
    districtAqiMode=false; setDistrictHazardMode(false);
  } else if(v==='aqi'){             
    setDistrictHazardMode(false); districtAqiMode=true;
    refreshDistrictHazard(); drawLegend();
  } else {                          
    districtAqiMode=false;
    

    var _isHaz = true;
    try{ if(window.AGN&&AGN.hazard&&AGN.hazard.isHazard) _isHaz = AGN.hazard.isHazard(v); }catch(_){}
    if(_isHaz){
      if(window.aiState) window.aiState.hazard=v;   
      try{ if(window.AGN&&AGN.hazard&&AGN.hazard.set) AGN.hazard.set(v,'fill-picker'); }catch(_){}
    } else {
       
      try{ if(window.AGN&&AGN.hazard&&AGN.hazard.setDisplay) AGN.hazard.setDisplay(v); }catch(_){}
    }
    setDistrictHazardMode(true);
    
    

    if(_isHaz){
      const seg=document.getElementById('aiHazardSeg');
      if(seg){ const sel=seg.querySelector('select'); if(sel){ sel.value=v; } else { seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on', x.dataset.hazard===v)); } }
      if(typeof aiRender==='function') aiRender();
    }
  }
  
  if(typeof mapHazardPick!=='undefined' && mapHazardPick && mapHazardPick.value!==v){ try{ mapHazardPick.value=v; }catch(e){} }
  
  if(typeof updateLayerMeta==='function'){ try{ updateLayerMeta(fillMetaKey(v)); }catch(e){} }
  
  
  try{
    var _tk=(typeof fillThemeKey==='function')?fillThemeKey(v):null;
    if(_tk){ document.body.dataset.layer=_tk;
      
      
      if(typeof setPanelAccentFromHazard==='function'){ setPanelAccentFromHazard(v); }
       
      if(typeof drawLegend==='function'){ drawLegend(); }
    }
  }catch(e){}
  
  if(typeof refreshProvinceFill==='function') refreshProvinceFill();
  
  if(typeof refreshPins==='function') refreshPins();
}
window.applyDistrictFill=applyDistrictFill;
mapHazardPick.onchange=()=>{ applyDistrictFill(mapHazardPick.value, true); }; }


const timeSlider=document.getElementById('timeSlider');
function fmtDay(offset){
  const d=new Date(); d.setDate(d.getDate()+offset);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}
timeSlider.oninput=()=>{
  DAY_OFFSET=parseInt(timeSlider.value,10);
  const lbl=document.getElementById('timeDateLabel'), tag=document.getElementById('timeDayTag');
  if(DAY_OFFSET===0){ lbl.textContent='Today · live'; tag.textContent='latest run'; }
  else { lbl.textContent=`${fmtDay(DAY_OFFSET)} · ${Math.abs(DAY_OFFSET)}d ago`; tag.textContent='archived run'; }
  selectCity(selectedId,false);
  refreshPins();
};


 
 




let __machLastUpdated=Date.now();
function setMACHFreshness(at, applied){
  

  try{
    if(window.AGN && AGN.status){
      var _st=AGN.status.stamp(at, applied);
      if(!_st.advanced){
        if(window.__MACH_DEBUG) console.debug('[freshness] '+_st.reason);
        return false;
      }
    }
  }catch(_){}
  

  if(applied===undefined || applied===null){
    if(window.__MACH_DEBUG) console.debug('[freshness] stamp without a count refused');
    return false;
  }
  window.__machStamped=true;
  __machLastUpdated=Number(at)||Date.now();
  const el=document.getElementById('freshTxt'); if(!el) return;
  const mins=Math.max(0,Math.floor((Date.now()-__machLastUpdated)/60000));
  const status=mins===0?'just now':`${mins} min ago`;
  const pkt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(__machLastUpdated));
  el.textContent=`Updated ${status} · ${pkt} PKT`;
}
window.setMACHFreshness=setMACHFreshness;


setInterval(()=>{ if(window.__machStamped) setMACHFreshness(__machLastUpdated, 1); },60000);






  ['agn:data','agn:hazard','agn:location','agn:sector'].forEach(function(ev){
    document.addEventListener(ev,function(){ setTimeout(function(){ try{ if(typeof attachInfoDots==='function') attachInfoDots(); }catch(e){} },60); });
  });
  

  ['agn:data','agn:hazard','agn:location','agn:sector','agn:day','agn:national']
    .forEach(function(ev){ document.addEventListener(ev, function(){
      setTimeout(function(){ try{ if(typeof attachInfoDots==='function') attachInfoDots(); }catch(e){} }, 60); }); });








function drawImpact(s){
  const locEl=document.getElementById('impactLoc'); if(!locEl) return;
  locEl.textContent=s.name;

  
  
  const inp={ t:s.t, hum:s.hum, feels:s.feels, wind:s.wind, gust:s.gust,
              weatherLive:s.weatherLive, featureLive:s.featureLive, nationalLive:s.nationalLive, fcSource:s.fcSource,
              

              rain:(typeof rainOrNull==='function'?rainOrNull(s):(s.rain!=null?s.rain:null)),
              soilMoist:(s.soilMoist!=null?s.soilMoist:null),
              api:s.apiIndex, tm3:s.tm3, t95:s.t95, tm95Clim:s.tm95Clim, tm30:s.tm30 };
  const dist=(window.STATION_DISTRICT&&STATION_DISTRICT[s.id]&&STATION_DISTRICT[s.id].district)||s.name;
  

  function eng(h){
    try{
      if(typeof hzScore!=='function') return null;
      var r=hzScore(dist,inp,h,24);
      return (r && r.score!=null && isFinite(r.score)) ? r.score : null;
    }catch(e){ return null; }
  }
  const heat=eng('heat'), rainR=eng('rain_hz'), windR=eng('wind'), flood=eng('flood'); 
  

  const _entries=[{hazard:'Heat',score:heat},{hazard:'Rainfall',score:rainR},
                  {hazard:'Wind',score:windR},{hazard:'Flood',score:flood}];
  const _worst=(AGN.hazardValue&&AGN.hazardValue.worstClass)
    ? AGN.hazardValue.worstClass(_entries)
    : {verdict:null,holders:[],scored:0,unresolved:4};
  const _class=_worst.verdict;                     
  const _holders=_worst.holders||[];
  const _unresolved=_worst.unresolved;
  

  const CLASS_ARC={Act:100, Watch:70, Monitor:40, Low:12, Clear:12};
  const score=(_class!=null)?CLASS_ARC[_class]:null;
  const cs=getComputedStyle(document.body); const col=cs.getPropertyValue('--accent-a').trim()||'#14B8A6';
  const ring=document.getElementById('impactRing');
  

  if(ring) ring.style.background = (score==null)
      ? 'repeating-linear-gradient(45deg,rgba(12,56,81,.10) 0 6px,rgba(12,56,81,.04) 6px 12px)'
      : `conic-gradient(${col} 0 ${score}%, rgba(12,56,81,.1) ${score}% 100%)`;
  const valEl=document.getElementById('impactScore');
  

  if(valEl){
    valEl.textContent = (_class==null)
      ? (typeof NODATA_GLYPH!=='undefined'?NODATA_GLYPH:'\u2014')
      : _class;
    valEl.style.fontSize = (_class==null) ? '' : '1.0625rem';
    valEl.style.letterSpacing = '.01em';
  }
  

  try{
    var _lab=document.querySelector('#impactRing .lab');
    if(_lab){
      _lab.textContent = (_class==null) ? 'No data'
        : (_holders.length ? _holders.slice(0,2).join(' + ') + (_holders.length>2?' +'+(_holders.length-2):'')
                           : 'Class');
      _lab.title = (_class==null)
        ? 'No governing hazard resolved for this site.'
        : (_class+' is held by '+_holders.join(', ')
           +'. This is the worst operational class across the four governing hazards, '
           +'not the maximum of their indexes: those are not on a common scale.');
    }
  }catch(_){}
  const rows=[["Heat",heat],["Rainfall",rainR],["Wind",windR],["Flood",flood]];
  const box=document.getElementById('impactBars'); if(!box) return;
  box.innerHTML=rows.map(([k,v])=>{
    if(v==null) return `<div class="ibar"><span>${k}</span><span class="track"><i class="fill nodata" style="width:100%"></i></span><span class="pct">${typeof NODATA_GLYPH!=='undefined'?NODATA_GLYPH:'\u2014'}</span><span class="ibar-class">No data</span></div>`;    
    const w=Math.round(v); const c=w>=65?"#fd8d3c":w>=40?"#E6B655":"#7FB069";
    

    const cls=(AGN.hazardValue&&AGN.hazardValue.verdictOf)?AGN.hazardValue.verdictOf(v):null;
    return `<div class="ibar"><span>${k}</span><span class="track"><i class="fill" style="width:${w}%;background:${c}"></i></span>`
      +`<span class="pct" title="${k} screening index ${w}/100 — an index within this hazard only">${w}</span>`
      +`<span class="ibar-class">${cls||''}</span></div>`;
  }).join('');
  box.insertAdjacentHTML('beforeend',
    `<div class="ibar-note">${_class==null
       ? 'No governing hazard resolved for this site.'
       : _class+' is held by '+_holders.join(', ')+'. The class above is the worst operational '
         +'class across these four hazards, not the maximum of their indexes: an index ranks '
         +'severity within one hazard and carries no common scale.'}`
      +`${_unresolved?' '+_unresolved+' of 4 hazards unresolved — only what was retrieved is shown.':''}</div>`);
}



function buildA11yTables(){
  
  /* v91.17.283.35 · audit A4: the table is built from the server's served values (AGN.comfort35); before they land it says so (no seed number) */
  const rows=Object.keys(DISTRICT_IN).filter(isScoreableDistrict).map(n=>{const c=districtComfortByName(n);const f=PK_DISTRICTS.features.find(x=>x.properties.key===n);return c?{n,prov:f?f.properties.province:'',di:c.di,word:c.word,giles:c.giles||''}:null;}).filter(Boolean).sort((a,b)=>b.di-a.di).slice(0,30);
  const mapHtml='<div class="a11y-cap">Top 30 tehsils by heat discomfort (DI), the served day value \u2014 text alternative to the choropleth.'+(rows.length?'':' The served values have not arrived yet.')+'</div><table><thead><tr><th>Tehsil</th><th>Province</th><th>DI</th><th>Level</th><th>Class</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${r.n}</td><td>${r.prov}</td><td>${(+r.di).toFixed(1)}</td><td>${r.word}</td><td>${r.giles}</td></tr>`).join('')+'</tbody></table>';
  { const ex=document.getElementById('mapTable'); if(ex){ ex.innerHTML=mapHtml; } }
  mountTable('.mappanel .attribution','mapTable','Show map data table',mapHtml,true);
  
  mountTable('.meteogram-card','meteoTable','Show meteogram data table','<div class="a11y-cap">Render the chart to populate.</div>',false);
  window.__fillMeteoTable=function(vals){
    const OBS=12, html='<div class="a11y-cap">Comfort stress index per 6h — solid=observed, dashed=forecast.</div><table><thead><tr><th>Lead (h)</th><th>DI</th><th>Type</th></tr></thead><tbody>'+
      vals.map((v,i)=>({v,i})).filter(o=>o.i%6===0).map(o=>`<tr><td>${o.i-OBS}</td><td>${o.v.toFixed(1)}</td><td>${o.i>OBS?'forecast':'observed'}</td></tr>`).join('')+'</tbody></table>';
    const t=document.getElementById('meteoTable'); if(t) t.innerHTML=html;
  };
}
function mountTable(parentSel,id,label,html,after){
  const host=document.querySelector(parentSel); if(!host||document.getElementById(id))return;
  const btn=document.createElement('button'); btn.className='a11y-toggle'; btn.textContent=label; btn.setAttribute('aria-expanded','false');
  const box=document.createElement('div'); box.className='a11y-table'; box.id=id; box.innerHTML=html;
  

  btn.onclick=()=>{const on=box.classList.toggle('on'); btn.setAttribute('aria-expanded',on); btn.textContent=on?label.replace('Show','Hide'):label;};
  if(after){ host.insertAdjacentElement('afterend',box); host.insertAdjacentElement('afterend',btn);}
  else { host.appendChild(btn); host.appendChild(box);}
}




activeLayer='radar';                 

updateLayerMeta('heat');    
applyLayerStyle('comfort');          
document.querySelectorAll('.seg [data-layer]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.layer==='radar'?'true':'false'));
setDistrictLayer(true);
document.querySelectorAll('#geoLevelTab button').forEach(x=>{const _on=x.dataset.geo==='district';x.classList.toggle('on',_on);x.setAttribute('aria-pressed',_on?'true':'false');});
(function(){ var p=document.getElementById('mapHazardPick'); if(p){ p.value='heat'; }
  

  setTimeout(function(){
    if(typeof applyDistrictFill==='function'){ try{ applyDistrictFill('heat', true); }catch(e){ console.warn('[mach boot fill]', e&&e.message); } }
  }, 0); })();



const TIP={
  feels:{t:"Feels-like temperature",f:"Heat index (T≥27°C) or wind chill (T<27°C)",
    p:"What the air feels like once humidity or wind is folded in. Uses the Rothfusz (1990) heat-index regression in heat and the 2001 wind-chill formula in cool conditions.",src:"Rothfusz (1990); JAG/TI wind chill (2001)"},
  discomfort:{t:"Thom Discomfort Index",f:"DI = T − (0.55 − 0.0055·RH)(T − 14.5)",
    p:"A standard temperature-humidity comfort index. T in °C, RH in %.",
    band:"<21 comfortable · 21–24 mild · 24–27 moderate · 27–29 high · 29–32 very high · >32 emergency",src:"Thom 1959"},
  dew:{t:"Dew point",f:"Magnus form with Bolton (1980) constants (a=17.67, b=243.5), the same curve as the server",
    p:"The temperature at which air becomes saturated. Higher dew point = stickier, harder for sweat to cool you. Above ~20°C feels humid; above ~24°C feels oppressive.",src:"Magnus / Tetens"},
  work:{t:"Outdoor work risk",f:"Threshold table on feels-like temperature",
    p:"Heat-illness risk band for outdoor labour, mapped from the feels-like value: Low → Caution → Extreme caution → Danger.",src:"NWS heat-risk bands",tag:"rule-based"},
  wetbulb:{t:"Wet-bulb proxy",f:"Psychrometric solution at the unit's pressure; Stull (2011) from T and RH where no elevation is known",
    p:"Approximate wet-bulb temperature — the lowest temperature reachable by evaporative cooling. A key human heat-tolerance limit; sustained ~35°C is dangerous. Refused outside RH 5–99 % and T −20 to +50 °C when no pressure is known, because that is the range Stull's regression was fitted for.",src:"Stull 2011; psychrometric (Bolton/Tetens saturation curve)",tag:"proxy"},
  heatindex:{t:"Heat index",f:"Rothfusz (1990) regression (T, RH)",
    p:"The NWS heat index from air temperature and humidity (shade, light wind); the feels-like tile uses it in heat.",src:"Rothfusz (1990)"},
  humload:{t:"Humidity load",f:"Relative humidity (%)",
    p:"Current relative humidity, shown as a 0–100 load. Higher values reduce the body's ability to cool by sweating.",src:"Direct reading"},
  recovery:{t:"Recovery window",f:"Threshold table on the heat-stress score",
    p:"The hour when evening conditions are expected to ease enough for safer outdoor exposure.",src:"Derived rule",tag:"rule-based"},
  comfort:{t:"Comfort score",f:"Composite of heat-stress, discomfort index and wind relief",
    p:"A single 0–100 readability score blending the comfort signals. A presentation index, not a standardised meteorological metric.",src:"AGN composite",tag:"derived · preview"},
  impact:{t:"Impact risk",f:"max(heat, rainfall, wind, flood) from the real hazard engine",
    p:"The worst current hazard-engine screening score for this station's district — the same hzScore engine that drives the map and AI panel, so this panel can never contradict them. 0–100 screening signal.",src:"AGN hazard engine",tag:"screening · uncalibrated"},
  lens:{t:"Selected hazard lens",f:"score for the hazard you picked (24 h lead)",
    p:"The 0-100 screening score for the hazard currently selected in the map fill control, at this station's district. The cards to the right rank ALL hazards and show whichever is highest; this one follows your selection, so a low number here is informative (that hazard is quiet at this location) rather than an error.",
    band:"0-20 minimal \u00b7 20-40 low \u00b7 40-60 moderate \u00b7 60-80 high \u00b7 80-100 severe",src:"AGN hazard engine",tag:"screening \u00b7 not a warning"},
  tophaz:{t:"Leading operational class",f:"the highest response trigger any hazard holds (24 h lead)",
    p:"The single highest 0–100 screening score across the six live decision hazards — flood, heat, drought, wind, cold and landslide — for this station's district, computed live. GLOF and cyclone are standing susceptibilities and seismic is a building-code class: they are shown separately and never compete for this position, because a standing score built to sit at 72–90 would occupy it permanently and tell you nothing. The label names which live hazard is on top right now.",
    band:"0–20 minimal · 20–40 low · 40–60 moderate · 60–80 high · 80–100 severe",src:"AGN hazard engine",tag:"screening · not a warning"},
  nexthaz:{t:"Second hazard lane",f:"the hazard at the next operational class down (24 h lead)",
    p:"The next lane after the leading class — useful for compound-risk awareness (e.g. heat plus wind, or rain plus flood building together).",
    band:"0–20 minimal · 20–40 low · 40–60 moderate · 60–80 high · 80–100 severe",src:"AGN hazard engine",tag:"screening · not a warning"},
  aqi:{t:"Air quality index (AQI)",f:"US EPA AQI scale (PM2.5-driven here)",
    p:"0–50 good · 51–100 moderate · 101–150 unhealthy for sensitive groups · 151–200 unhealthy · 201+ very unhealthy.",src:"US EPA"},
  uv:{t:"UV index",f:"WHO/WMO global solar UV index",
    p:"0–2 low · 3–5 moderate · 6–7 high · 8–10 very high · 11+ extreme. Burn-risk time shortens as the index rises.",src:"WHO / WMO"}
,
  
  abscore:{t:"Agri-risk composite",f:"0.5·drought + 0.3·heat + 0.2·moisture (sub-scores 0–100)",
    p:"AGN composite index. The weights and sub-score coefficients are tunable house values calibrated with agronomists, not a published standard.",src:"AGN composite · tunable",tag:"composite · tunable"},
  telcorisk:{t:"Telco operational risk",f:"Weighted hazard drivers (wind/flood/heat/lightning/dust), 0–100",
    p:"AGN composite for network-ops. Driver weights and site thresholds are house values for the network engineer to tune. Dust needs a PM10/visibility feed (gated to zero until wired) and lightning is a convective proxy — no strike-density feed yet.",src:"AGN composite · tunable",tag:"composite · proxy · tunable"},
  airisk:{t:"AI hazard prediction",f:"Σ(driver·weight)·lead-factor, discounted by model spread",
    p:"Physical drivers from the calculation layer. The station panel scores real forecast-hour conditions; district future views use valid-time forecast inputs when available and refuse when those inputs are absent and penalised when deterministic multi-model forecasts diverge. Model agreement = 100 − spread. This is not calibrated forecast skill.",src:"AGN preview engine",tag:"demo · agreement ≠ skill"},
  ensemble:{t:"Multi-model agreement",f:"agree = 100 − (mean(hi−lo)/scale)·100",
    p:"Spread across active models per hour (international forecast centre, GFS, ICON, GEM, JMA, UKMO and ML variants). High agreement = low spread. This measures consensus, NOT accuracy — skill (MAE/RMSE) needs an observation-vs-forecast loop that is not wired in this preview.",src:"multi-model comparison",tag:"agreement ≠ skill"},
  comfortidx:{t:"Comfort score",f:"100 − 0.70·heatStress − 2.2·max(0,DI−24) + 0.10·windRelief",
    p:"AGN composite comfort index. Built on the standard discomfort index but the blending coefficients are tunable house values, not a published index.",src:"AGN composite · tunable",tag:"composite · tunable"},
  
  
  airtemp2m:{t:"Air temperature (2 m)",f:"Direct model field: temperature_2m",p:"Standard 2-metre air temperature from the best-match model for this location.",src:"model · live"},
  hum2m:{t:"Relative humidity (2 m)",f:"Direct model field: relative_humidity_2m",p:"2-metre relative humidity. Drives wet-bulb, dew point and the discomfort index.",src:"model · live"},
  wind10:{t:"Wind speed (10 m)",f:"Direct model field: wind_speed_10m",p:"Standard 10-metre wind. Used for wind chill, wind relief and the wind hazard gust fallback.",src:"model · live"},
  gustproxy:{t:"Wind gust",f:"gusts_10m when served; else wind × 1.8",p:"Live model gust where available; otherwise a 1.8× proxy on the mean wind (marked proxy).",src:"model · live/proxy",tag:"proxy when derived"},
  soilmodel:{t:"Surface moisture",f:"soil_moisture_9_to_27cm (volumetric)",p:"Modelled root-zone-upper soil moisture. Feeds the flood antecedent term and FAO-56 drought stress. Model output, not a ground probe.",src:"model land surface"},
  rainpulse:{t:"Rain pulse",f:"Current precipitation rate (mm/h)",p:"Instantaneous precipitation rate driving the rainfall-intensity bands (<2 light · 2–7 moderate · 7–20 high · >20 extreme).",src:"model · live"},
  livesrc:{t:"Live source state",f:"Feed health flag",p:"Whether this station's inputs are currently live (model forecast / independent forecast provider) or running on the seed baseline after a failed fetch.",src:"AGN loader"},
  blh:{t:"Boundary-layer height",f:"Direct model field: boundary_layer_height",p:"Depth of the turbulent mixing layer. Shallow layers trap pollution (links to AQI); deep layers dilute it.",src:"model · live"},
  et0fao:{t:"Reference evapotranspiration ET₀",f:"FAO-56 Penman-Monteith (model-served)",p:"Water demand of a reference crop surface. The drought engine's FAO-56 Ks pathway consumes this.",src:"model · FAO-56"},
  rain7:{t:"7-day rainfall",f:"Σ precipitation over the forecast window",p:"Accumulated rain context. The Antecedent Precipitation Index (flood memory) is built from the PAST 7 days separately.",src:"model · live"},
  completeness:{t:"Input completeness",f:"live fields ÷ expected fields",p:"Share of this station's input fields that arrived live in the last fetch. In DEMO mode, below 100% the missing fields are marked as having no live value and dependent scores are marked provisional and carry DESIGN provenance. In PRODUCTION nothing is substituted: the missing field is absent and the dependent score is withheld.",src:"AGN loader"}};
function tipHTML(k){
  const d=TIP[k]; if(!d) return "";
  return `<span class="info-wrap"><button type="button" class="info-i" aria-label="About ${d.t}">i</button>`
    +`<span class="info-pop" role="tooltip"><b>${d.t}</b>`
    +(d.f?`<span class="ip-form">${d.f}</span>`:"")
    +(d.p?`<p>${d.p}</p>`:"")
    +(d.band?`<span class="ip-band">${d.band}</span>`:"")
    +(d.src?`<span class="ip-src">Source: ${d.src}</span>`:"")
    +(d.tag?`<span class="ip-tag">${d.tag}</span>`:"")
    +`</span></span>`;
}

 

function attachTip(sel,k,anchorRight,down){ const el=document.querySelector(sel); if(el && !el.querySelector('.info-wrap')){ el.insertAdjacentHTML('beforeend', tipHTML(k)); const _w=el.querySelector('.info-wrap'); if(down && _w) _w.classList.add('tip-down'); if(anchorRight){ const w=el.querySelector('.info-wrap'); if(w) w.classList.add('tip-right'); } } }

function initTips(){
  
  
  
  
  
  
  

  
  
  attachTip('.comfort-mini:nth-child(1) span','wetbulb');
  attachTip('.comfort-mini:nth-child(2) span','heatindex',true);
  attachTip('.comfort-mini:nth-child(3) span','humload');
  attachTip('.comfort-mini:nth-child(4) span','recovery',true);
  
  attachTip('.aqcard .aq-tile:nth-child(1) .lab','aqi');
  attachTip('.aqcard .aq-tile:nth-child(2) .lab','uv',true);
  
  
  [['cfeBmTemp','airtemp2m'],['cfeBmFeels','feels'],['cfeBmHum','hum2m'],['cfeBmWb','wetbulb'],
   ['cfeBmDp','dew'],['cfeBmWind','wind10'],['cfeBmGust','gustproxy'],['cfeBmSoil','soilmodel'],
   ['cfeBmRain','rainpulse'],['cfeBmSrc','livesrc'],['cfeBmBlh','blh'],['cfeBmEt0','et0fao'],
   ['cfeBmRain7','rain7'],['cfeBmComplete','completeness']].forEach(function(pair){
    var b=document.getElementById(pair[0]); if(!b) return;
    var lab=b.parentElement && b.parentElement.querySelector('span');
    if(lab && !lab.querySelector('.info-wrap')) lab.insertAdjacentHTML('beforeend', tipHTML(pair[1]));
  });
}



const AI_HAZARDS={
  

  

  nss_baseline:{label:'Ground sponge — usual wetness', unit:'mm',
       drivers:['Retention potential S (mm)','Retained mm of a 100 mm storm','Runoff potential % of a 100 mm storm','Curve number (usual wetness)'],
       icon:'🌿', eventHazard:false,
       note:'How the ground handles a 100 mm storm, at 250 m: built ground is sealed and runs off; bare ground, fields, grass and woodland '
           +'absorb progressively more (land cover 10 m, HYSOGs soil group, slope, NRCS curve numbers). Does not change with today\'s rain.'},
  nss_dynamic:{label:'Ground sponge — today\'s wetness', unit:'mm',
       drivers:['Retention potential S (mm)','Soil wetness %','Runoff potential % of a 100 mm storm','Curve number now'],
       icon:'💧', eventHazard:false,
       note:'Natural absorption capacity adjusted for current antecedent wetness. Recent rain '
           +'and wet soil reduce the capacity still available. Higher is better.'},
  nss_retention:{label:'Storm retention capacity', unit:'% of storm',
       drivers:['Retained % of storm','Retained mm','Runoff mm','Curve number'],
       icon:'🪣', eventHazard:false,
       note:'Rainfall depth retained from the selected storm under current land and wetness '
           +'conditions, using the NRCS Curve Number method. Higher is better.'},
  nss_runoff:{label:'Rain run-off, last 5 days', unit:'mm',
       drivers:['Run-off mm','Forecast rain mm','Curve number (today)','Terrain factor %'],
       icon:'🌊', eventHazard:false,
       note:'Run-off depth from the selected day\u2019s forecast rain at that day\u2019s ground wetness (NRCS curve number). '
           +'HIGHER IS WORSE. Run-off depth is not flood depth.'},
  nss:{label:'Natural sponginess (NSS) — higher is better', unit:'/100',
       drivers:['Sponginess 0–100','Retention mm @100 mm','Runoff coeff %','Terrain factor %'],
       icon:'🌿', eventHazard:false,
       note:'Rainfall the ground can absorb: land cover + slope + NRCS curve number. '
           +'Confidence C — hydrologic soil group proxied from agro-climatic zone.'},
  flood:{label:'Flood', unit:'/100', drivers:['Flood index','Antecedent wetness','Terrain slope','Runoff coeff'], icon:'🌊'},
  

  flood_pluvial:{label:'Flood — pluvial pathway only (screening)', unit:'/100',
       drivers:['Pluvial index','Antecedent wetness','Terrain slope','Runoff coeff'], icon:'🌊',
       note:'Rain-based screening, not a flood observation: the heaviest forecast rain hour and 6 hours, scaled by how much of that rain '
           +'this ground sheds. Lead time is hours. Scored wherever a rainfall value exists. It does not see drains or nullahs; '
           +'read it together with the Heavy rain layer.'},
  flood_riverine:{label:'Flood — riverine pathway only (screening)', unit:'/100',
       drivers:['Riverine index','Upstream discharge','Return-period rank','Lead days'], icon:'🏞️',
       note:'Rain already fallen upstream, arriving down the channel over days. Scored ONLY '
           +'where an upstream gauge covers the unit. Everywhere else this layer is no-data, '
           +'which is river state UNKNOWN \u2014 not river state normal.'},
  rain_hz:{label:'Heavy rain', unit:'/100', drivers:['Intensity score','Current mm','Probability','6h peak (card)'], icon:'🌧️'},
  heat:{label:'Heat stress', unit:'/100', drivers:['AGN level from UTCI (shade)','Wet bulb °C (diagnostic)','Air vs local 90th pct °C (diagnostic)','UTCI 90th pct here for the date °C (context)'], icon:'🥵'},
  wind:{label:'Wind and gusts', unit:'/100', drivers:['Wind load','Gust km/h','Ruggedness','Exposure +%'], icon:'💨'},
  drought:{label:'Drought', unit:'/100', drivers:['Drought composite','Root-zone stress (FAO-56 on global reanalysis 7-100 cm, or soil-moisture percentile)','SPEI-90 (SPI-90 fallback)','—'], icon:'🌵'},
  cold:{label:'Cold stress (UTCI)', unit:'/100', drivers:['Cold stress','Cold depth below 10°C','Local night baseline (10th pct, °C)','—'], icon:'❄️'},
  glof:{label:'Glacial lake outburst flood (GLOF)', unit:'/100', drivers:['GLOF risk','Inventory baseline','Melt trigger %','Elevation'], icon:'🏔️'},
  

  landslide:{label:'Landslide', unit:'/100',    
             drivers:['Threshold exceedance','Governing duration','Effective slope','Antecedent wetness'], icon:'⛰️'},
  ops:{label:'Operations', unit:'/100', drivers:['Human comfort','Rain disruption','Air quality','Model spread'], icon:'🧭'},
  seismic:{label:'Seismic (tectonic screening)', unit:'', drivers:['Seismic susceptibility','—','—','—'], icon:'🌐'},
  cyclone:{label:'Cyclone (coastal screening)', unit:'', drivers:['Cyclone exposure','—','—','—'], icon:'🌀'}
,
  

  telco_wind:{label:'Tower wind load', unit:'/100', drivers:['Gust load','Storm support','Site exposure','Model spread'], icon:'📡'},
  telco_flood:{label:'Site flooding', unit:'/100', drivers:['Rain pulse','Antecedent wetness','Drainage exposure','Model spread'], icon:'🌊'},
  telco_heat:{label:'Shelter/genset heat', unit:'/100', drivers:['Thermal load','Wet-bulb proxy','Site exposure','Model spread'], icon:'🔥'},

  telco_lightning:{label:'Convective rain proxy', unit:'/100', drivers:['Convective proxy','Rain pulse','Site exposure','Model spread'], icon:'⚡'}
};



try{ window.AI_HAZARDS = AI_HAZARDS; }catch(_){}
const aiState={hazard:'flood',lead:24,station:null,last:null};    
window.aiState = aiState;
function aiSet(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }
function aiBand(score, hazardOverride){
  
  
  
  
  const hz = hazardOverride || (typeof aiState!=='undefined' && aiState.hazard) || 'flood';
  
  
  
  
  const ramp = (typeof hazardRamp==='function') ? hazardRamp(hz) : null;
  let color = 'var(--navy)', textColor = 'var(--navy)';
  

  if(ramp){ const _b=agnBandOf(score); const idx = Math.max(1, _b?_b.index:1); color = ramp[idx];
    
    const tIdx = Math.max(3, idx); textColor = (typeof _mix==='function') ? _mix(ramp[tIdx], '#0a0f1a', 0.15) : ramp[tIdx];
  }
  

  const NOTE={
    severe:'Immediate escalation and field verification recommended.',
    high:'High operational risk, prepare resources and monitor nowcast closely.',
    moderate:'Watch conditions, brief field teams and keep thresholds under review.',
    low:'Low risk, routine monitoring remains adequate.',
    minimal:'No major signal in the current preview inputs.'};
  const _band=agnBandOf(score);
  

  if(!_band){
    const _nd=(typeof NSS_NODATA!=='undefined')?NSS_NODATA:'#B9BEC4';
    return {band:null, color:_nd, textColor:'#5d6b76',
            note:'Not scored — no band, because there is no score to band.'};
  }
   
  return {band:(_band.key==='minimal'?'normal':_band.key), label:_band.label, color, textColor, note:NOTE[_band.key]};
}
/* v283.36 · item 15 · aiUrbanExposure (a hand-typed city highlight list lhr/khi/isb/fsd/hyd/mul with exposure 78/58/34) is deleted with aiRiskFor, its only reader */




const HZ_ZONES={
  

  arid_plains:     {heatThr:38, runoff:0.75, coldGate:true,  label:'Arid plains'},
  irrigated_plains:{heatThr:37, runoff:0.45, coldGate:true,  label:'Irrigated plains'},
  rainfed:         {heatThr:37, runoff:0.55, coldGate:true,  label:'Rain-fed'},
  highland:        {heatThr:33, runoff:0.65, coldGate:true,  label:'Highland'},
  high_mountain:   {heatThr:28, runoff:0.80, coldGate:true,  label:'High mountain'},
};
function hzClamp(v,a,b){return Math.max(a,Math.min(b,v));}


function agnRainRate(v, cur){ if(v==null||!isFinite(+v)) return v; var iv=cur&&+cur.interval; return (iv>0&&iv<3600)?(+v)*3600/iv:+v; }

function resolveDistrict(name){
  try{ if(typeof PK_KEY_TO_DISTRICT!=='undefined' && PK_KEY_TO_DISTRICT[name])
         return PK_KEY_TO_DISTRICT[name]; }catch(_){}
  return name;
}
try{ window.resolveDistrict=resolveDistrict; }catch(_){}


(function agnUrbanOverlay(){
  var ON=false, layer=null, legend=null, busy=false, btn=null, lastKey='';
  

  var MODE='max';
  

  

  

  var RAMP=[[-0.7,'#1d4f7a'],[-0.4,'#4a86b4'],[-0.22,'#8fbcd8'],
            [0.12,'#fbdcec'],[0.6,'#f7b3d5'],[1.2,'#ef7fb8'],[2,'#e04a9a'],
            [3,'#c0207a'],[4,'#a3106a'],[5,'#8e0057'],[6,'#5c0038']];
  function colour(v){
    if(v==null||!isFinite(v)) return '#e5ebf0';
    for(var i=RAMP.length-1;i>=0;i--) if(v>=RAMP[i][0]) return RAMP[i][1];
    return RAMP[0][1];
  }
  function hoursFromSunset(){
    try{
      var d=new Date(), n=Math.floor((d-Date.UTC(d.getUTCFullYear(),0,0))/86400000);
      var dec=23.44*Math.PI/180*Math.sin(2*Math.PI*(284+n)/365);
      var lat=33.6*Math.PI/180;
      var x=Math.max(-1,Math.min(1,-Math.tan(lat)*Math.tan(dec)));
      var H=Math.acos(x)*180/Math.PI/15;
      var noon=12+(75-73.1)/15, sunset=noon+H;
      var local=d.getUTCHours()+d.getUTCMinutes()/60+5;
      var t=(local%24)-sunset; while(t<-12)t+=24; while(t>12)t-=24;
      return t;
    }catch(_){ return null; }
  }
  function draw(cells, step){
    if(layer) { try{ window.map.removeLayer(layer); }catch(_){} layer=null; }
    

    try{ if(!window.map.getPane('agnUhi')){ var pn=window.map.createPane('agnUhi');
         pn.style.zIndex=460; pn.style.pointerEvents='none'; } }catch(_){}
    

    var g=L.layerGroup(), half=step/2, renderer=L.canvas({pane:'agnUhi', padding:0.3});
    for(var i=0;i<cells.length;i+=3){
      var la=cells[i], lo=cells[i+1], v=cells[i+2];
      if(v==null||!isFinite(v)||Math.abs(v)<0.12) continue;    
      var _e=cells.__ext, _k=(i/3)*2, _hy=(_e&&_e[_k]>0)?_e[_k]:half, _hx=(_e&&_e[_k+1]>0)?_e[_k+1]:half;
      g.addLayer(L.rectangle([[la-_hy,lo-_hx],[la+_hy,lo+_hx]],
        {renderer:renderer, pane:'agnUhi', stroke:false, fill:true, fillColor:colour(v), fillOpacity:0.85, interactive:false}));
    }
    layer=g; g.addTo(window.map);
  }
  function refresh(){
    if(!ON||busy||!window.map) return;
    var b=window.map.getBounds();
    var key=[b.getWest().toFixed(2),b.getSouth().toFixed(2),b.getEast().toFixed(2),b.getNorth().toFixed(2)].join(',');
    if(key===lastKey) return;
    busy=true;
    var hs=(MODE==='now')?hoursFromSunset():null;
    fetch(location.origin+'/api/urban/cells?w='+b.getWest()+'&s='+b.getSouth()+'&e='+b.getEast()+'&n='+b.getNorth()
      +'&max=18000&zoom='+window.map.getZoom()+(hs==null?'':'&hoursFromSunset='+hs.toFixed(2)),{cache:'no-store'})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        busy=false;
        if(!ON||!j||!j.ready){ return; }
        lastKey=key;
        var _uc=j.cells||[]; _uc.__ext=j.extents||null; draw(_uc, j.stepDeg||0.0025);    
        paintLegend(j, hoursFromSunset());
      }).catch(function(){ busy=false; });
  }
  function paintLegend(j, hs){
    if(!legend){
      legend=L.control({position:'bottomleft'});    
      legend.onAdd=function(){ var d=L.DomUtil.create('div','agn-uhi-legend'); d.id='agnUhiLegend';
        d.style.cssText='background:rgba(255,255,255,.95);padding:8px 10px;border-radius:10px;font:11px/1.25 system-ui,sans-serif;width:186px;box-shadow:0 2px 10px rgba(0,0,0,.15)';
        return d; };
      legend.addTo(window.map);
    }
    var el=document.getElementById('agnUhiLegend'); if(!el) return;
    if(j&&j.withheld){ el.innerHTML='<div style="font-weight:700;margin-bottom:3px">Urban heat island</div><div style="color:#12202a"><b>Not assessed.</b> '+String(j.why||'withheld').replace(/^not assessed:\s*/i,'').replace(/^./,function(c){ return c.toUpperCase(); }).replace(/[&<>]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; })+'</div>'; return; }   /* v91.17.283.5 C12: withheld, no ramp and no cell count */
    var sw='';
    for(var i=0;i<RAMP.length;i++){
      var lo=RAMP[i][0], hi=(i+1<RAMP.length)?RAMP[i+1][0]:null;
      sw+='<div style="display:flex;align-items:center;gap:5px;margin:1px 0">'
        +'<i style="width:14px;height:8px;flex:0 0 14px;display:inline-block;background:'+RAMP[i][1]+'"></i>'
        +'<span>'+(hi==null?('≥ '+lo):((lo<0&&hi<=0)?(lo+' to '+hi):(lo+' – '+hi)))+' °C</span></div>';
    }
    var phase = (hs==null) ? '' :
      (hs>=0 ? (hs.toFixed(1)+' h after sunset') : ((-hs).toFixed(1)+' h before sunset'));
    el.innerHTML='<div style="font-weight:700;margin-bottom:3px">Urban heat island <span style=\'font-weight:400;color:#69777f\'>&deg;C added</span></div>'
      + sw
      + '<div style="margin-top:5px;color:#44525c">'+(j.n||0).toLocaleString('en')+' cells, '+(j.cellSizeM||278)+' m'
      + '</div>'
      + '<div style="margin-top:3px"><button type="button" id="agnUhiMode" style="border:0;background:#eef2f4;'
      + 'border-radius:6px;padding:3px 7px;font:600 11px system-ui;cursor:pointer;color:#0C3851">'
      + (MODE==='max'?'showing tonight\u2019s maximum \u00b7 switch to now':'showing now ('+phase+') \u00b7 switch to tonight\u2019s maximum')
      + '</button></div>'
      + '<details style="margin-top:5px"><summary style="cursor:pointer;color:#0C3851">method and limits</summary>'
      + '<div style="margin-top:4px;color:#44525c">An amount ADDED to the forecast temperature, not a temperature. Blue is where built-up ground runs cooler than its surroundings, which is what the measured curve does through the morning. '
      + (j.aggregated?(j.aggregated+' '):'')
      + 'GHSL 2025 built surface and volume, MODIS NDVI, WUDAPT climate zones; Oke (1981) canyon geometry, '
      + 'calibrated against two urban/rural station pairs (Rawalpindi and Lahore, 49,555 hours; see /api/urban/status), so the ranking between places is better supported than the value at any one of them.</div></details>';
    var mb=document.getElementById('agnUhiMode');
    if(mb) mb.addEventListener('click', function(ev){ ev.stopPropagation();
      MODE=(MODE==='max')?'now':'max'; lastKey=''; refresh(); });
  }
  function setOn(v){
    ON=v; lastKey='';
    if(btn){ btn.setAttribute('aria-pressed', v?'true':'false');
             btn.style.background = v?'#0C3851':'#fff'; btn.style.color = v?'#fff':'#0C3851'; }
    if(!v){
      if(layer){ try{ window.map.removeLayer(layer); }catch(_){} layer=null; }
      if(legend){ try{ window.map.removeControl(legend); }catch(_){} legend=null; }
    } else refresh();
  }
  function install(n){
    if(!window.map || !window.L){ if(n<80) setTimeout(function(){ install(n+1); },500); return; }
    var c=L.control({position:'bottomleft'});
    c.onAdd=function(){
      var d=L.DomUtil.create('div','');
      d.innerHTML='<button type="button" id="agnUhiBtn" aria-pressed="false" '
        +'style="background:#fff;color:#0C3851;border:0;border-radius:999px;padding:8px 14px;'
        +'font:600 13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.18);cursor:pointer">Urban heat</button>';
      L.DomEvent.disableClickPropagation(d);
      return d;
    };
    c.addTo(window.map);
    btn=document.getElementById('agnUhiBtn');
    if(btn) btn.addEventListener('click', function(){ setOn(!ON); });
    window.map.on('moveend zoomend', function(){ if(ON) refresh(); });
    try{ window.AGN=window.AGN||{}; AGN.urbanOverlay={ on:function(){setOn(true);}, off:function(){setOn(false);},
      state:function(){ return {on:ON, cells: layer?layer.getLayers().length:0}; } }; }catch(_){}
  }
  install(0);
})();





function rainAccum6h(name){
  try{
    const C=window.__RAIN_HOURLY; if(!C) return null;
    const rec=C[name]; if(!rec||!Array.isArray(rec.arr)) return null;
    const s=Math.max(0,rec.idx|0), e=Math.min(rec.arr.length, s+6);
    if(e-s<6) return null;                     
    let sum=0, n=0;
    for(let i=s;i<e;i++){ const v=hzLiquidMm(rec.arr[i], rec.sn?rec.sn[i]:null); if(v==null) return null; sum+=v; n++; }    
    return n===6 ? sum : null;
  }catch(_){ return null; }
}
window.rainAccum6h=rainAccum6h;

function rainPeak6h(name){
  try{
    const C=window.__RAIN_HOURLY; if(!C) return null;
    
    
    
    
    const rec=C[name]; if(!rec||!Array.isArray(rec.arr)) return null;
    const s=Math.max(0,rec.idx|0), e=Math.min(rec.arr.length, s+6);
    let mx=null; for(let i=s;i<e;i++){ const v=+rec.arr[i]; if(isFinite(v)&&(mx==null||v>mx)) mx=v; }    
    return mx;
  }catch(e){ return null; }
}


const PK_KEY_TO_DISTRICT = {"Bagh":"Bagh","Dhir Kot":"Bagh","Harighel":"Bagh","Barnala":"Bhimber","Samahni":"Bhimber","Chikar":"Hattian","Hattian":"Hattian","Haveli":"Haveli","Khurshid Abad":"Haveli","Mumtazabad":"Haveli","Charhoi":"Kotli","Dulliya Jattan":"Kotli","Fatehpur Thakiala":"Kotli","Khui Ratta":"Kotli","Dadyal":"Mirpur","Mirpur":"Mirpur","Muzaffarabad":"Muzaffarabad","Naseerabad":"Muzaffarabad","Sharda":"Neelam Valley","Abbaspur":"Poonch","Hajira":"Poonch","Rawalakot":"Poonch","Thorar":"Poonch","Baluch":"Sudhnoti","Mong":"Sudhnoti","Pallandari":"Sudhnoti","Tarar Khal":"Sudhnoti","Awaran":"Awaran","Jhal Jhao":"Awaran","Mashkai":"Awaran","Gishekore":"Awaran","Barkhan":"Barkhan","Rakhni":"Barkhan","Taftan":"Chagai","Dera Bugti":"Dera Bugti","Phelawagh":"Dera Bugti","Sui":"Dera Bugti","Gwadar":"Gwadar","Jiwani":"Gwadar","Ormara":"Gwadar","Pasni":"Gwadar","Harnai":"Harnai","Shahrigh":"Harnai","Gandakha":"Usta Muhammad","Usta Mohammad":"Usta Muhammad","Gandawa":"Jhal Magsi","Jhal Magsi":"Jhal Magsi","Dhadar":"Kachhi","Mach":"Kachhi","Sanni":"Kachhi","Balanari":"Kachhi","Khattan":"Kachhi","Kalat":"Kalat","Khaliqabad":"Kalat","Buleda":"Kech","Dasht":"Kech","Kech (Turbat)":"Kech","Mand":"Kech","Tump":"Kech","Kharan":"Kharan","Sar Kharan":"Kharan","Tomulk":"Kharan","Khuzdar":"Khuzdar","Mola":"Khuzdar","Naal":"Khuzdar","Wadh":"Khuzdar","Zehri":"Khuzdar","Dobandi":"Killa Abdullah","Killa Abdullah":"Killa Abdullah","Killa Saifullah":"Killa Saifullah","Muslim Bagh":"Killa Saifullah","Kohlu":"Kohlu","Mawand":"Kohlu","Bela":"Lasbela","Hub":"Hub","Kanraj":"Lasbela","Sonmiani":"Hub","Uthal":"Lasbela","Lakhra":"Lasbela","Lairi":"Lasbela","Bhag":"Lehri","Lehri":"Lehri","Loralai":"Loralai","Mekhtar":"Loralai","Dasht Spenzend":"Mastung","Kirdgap":"Mastung","Mastung":"Mastung","Drug":"Musakhel","Musakhel":"Musakhel","Chattar":"Nasirabad","Dera Murad Jamali":"Nasirabad","Tamboo":"Nasirabad","Gowargo":"Panjgur","Jaheen Parome":"Panjgur","Panjgur":"Panjgur","Gichk":"Panjgur","Huramzai":"Pishin","Karezat":"Pishin","Pishin":"Pishin","Saranan":"Pishin","Panjpai":"Quetta","Quetta City":"Quetta","Quetta Saddar":"Quetta","Sherani":"Sherani","Sibi":"Sibi","Sohbatpur":"Sohbatpur","Mashkhel":"Washuk","Basima":"Washuk","Washuk":"Washuk","Nag":"Washuk","Shaogari":"Washuk","Zhob":"Zhob","Sinjawi":"Ziarat","Ziarat":"Ziarat","Surab":"Surab","Duki":"Duki","Chaman":"Chaman","Astore":"Astore","Shounter":"Astore","Chilas":"Diamir","Ishkoman":"Ghizer","Punial":"Ghizer","Gilgit":"Gilgit","Ali Abad":"Hunza","Gamba":"Skardu","Skardu":"Skardu","Nagar":"Nagar","Sikandar Abad":"Nagar","Gultari":"Kharmang","Kharmang":"Kharmang","Daghoni":"Ghanche","Khaplu":"Ghanche","Shigar":"Shigar","Tangir":"Tangir","Gupis":"Gupis-Yasin","Yasin":"Gupis-Yasin","Rondu":"Roundu","Islamabad":"Islamabad","Bar Chamarkand":"Bajaur","Barang":"Bajaur","Khar":"Bajaur","Mamund":"Bajaur","Nawagai":"Bajaur","Salarzai":"Bajaur","Utman Khel":"Bajaur","Bannu":"Bannu","Baka Khel":"Bannu","Domel":"Bannu","Kakki":"Bannu","Miryan":"Bannu","Wazir":"Bannu","Allai":"Batagram","Batagram":"Batagram","Daggar":"Buner","Gagra":"Buner","Khado Khel":"Buner","Mandanr":"Buner","Charsadda":"Charsadda","Shabqadar":"Charsadda","Tangi":"Charsadda","Chitral":"Chitral","Drosh":"Chitral","Mastuj":"Chitral","Dera Ismail Khan":"Dera Ismail Khan","Daraban":"Dera Ismail Khan","Kulachi":"Dera Ismail Khan","Paroa":"Dera Ismail Khan","Darazinda":"Dera Ismail Khan","Hangu":"Hangu","Tall":"Hangu","Banda Daud Shah":"Karak","Karak":"Karak","Takht-E-Nasrati":"Karak","Bara":"Khyber","Jamrud":"Khyber","Landi Kotal":"Khyber","Mulagori":"Khyber","Kohat":"Kohat","Lachi":"Kohat","Gumbat":"Kohat","Darra Adam Khel":"Kohat","Pattan":"Lower Kohistan","Bankad":"Lower Kohistan","Dassu":"Upper Kohistan","Kandia":"Upper Kohistan","Harban Basha":"Upper Kohistan","Seo":"Upper Kohistan","Palas":"Kolai Palas","Battera Kolai":"Kolai Palas","Central Kurram":"Kurram","Upper Kurram":"Kurram","Lakki Marwat":"Lakki Marwat","Sarai Naurang":"Lakki Marwat","Bettani":"Lakki Marwat","Adenzai":"Lower Dir","Balambat":"Lower Dir","Lalqila":"Lower Dir","Munda":"Lower Dir","Samarbagh":"Lower Dir","Timergara":"Lower Dir","Bat Khela":"Malakand","Dargai":"Malakand","Bala Kot":"Mansehra","Mansehra":"Mansehra","Oghi":"Mansehra","Baffa Pakhal":"Mansehra","Darband":"Mansehra","Katlang":"Mardan","Mardan":"Mardan","Takht Bhai":"Mardan","Rustam":"Mardan","Garhi Kapura":"Mardan","Ambar":"Mohmand","Baizai":"Mohmand","Halimzai":"Mohmand","Khwazai":"Mohmand","Pandiali":"Mohmand","Prang Ghar":"Mohmand","Safi":"Mohmand","Yaka Ghund":"Mohmand","Data Khel":"North Waziristan","Dossali":"North Waziristan","Garyum":"North Waziristan","Mir Ali":"North Waziristan","Miran Shah":"North Waziristan","Razmak":"North Waziristan","Shewa":"North Waziristan","Spinwam":"North Waziristan","Shawal":"North Waziristan","Nowshera":"Nowshera","Pabbi":"Nowshera","Central Orakzai":"Orakzai","Ismailzai":"Orakzai","Lower Orakzai":"Orakzai","Upper Orakzai":"Orakzai","Town-I":"Peshawar","Town-Ii":"Peshawar","Town-Iii":"Peshawar","Town-Iv":"Peshawar","Hassan Khel":"Peshawar","Alpuri":"Shangla","Bisham":"Shangla","Chakisar":"Shangla","Makhuzai":"Shangla","Martoong":"Shangla","Puran":"Shangla","Birmal":"South Waziristan","Ladha":"South Waziristan","Makin":"South Waziristan","Sararogha":"South Waziristan","Serwakai":"South Waziristan","Tiarza":"South Waziristan","Toi Khulla":"South Waziristan","Wana":"South Waziristan","Swabi":"Swabi","Topi":"Swabi","Razar":"Swabi","Babuzai":"Swat","Bahrain":"Swat","Barikot":"Swat","Charbagh":"Swat","Kabal":"Swat","Khwaza Khela":"Swat","Matta Kharirai":"Swat","Matta Sebujni":"Swat","Tank":"Tank","Jandola":"Tank","Judba":"Tor Ghar","Khander":"Tor Ghar","Barawal":"Upper Dir","Dir":"Upper Dir","Kalkot":"Upper Dir","Khall":"Upper Dir","Shrengal":"Upper Dir","Wari":"Upper Dir","Larjam":"Upper Dir","Attock":"Attock","Fateh Jang":"Attock","Jand":"Attock","Pindi Gheb":"Attock","Bahawalnagar":"Bahawalnagar","Chishtian":"Bahawalnagar","Fort Abbas":"Bahawalnagar","Minchinabad":"Bahawalnagar","Ahmadpur East":"Bahawalpur","Bahawalpur":"Bahawalpur","Hasilpur":"Bahawalpur","Khairpur Tamewali":"Bahawalpur","Bhakkar":"Bhakkar","Darya Khan":"Bhakkar","Mankera":"Bhakkar","Chakwal":"Chakwal","Choa Saidan Shah":"Chakwal","Kallar Kahar":"Chakwal","Tala Gang":"Chakwal","Bhawana":"Chiniot","Chiniot":"Chiniot","Lalian":"Chiniot","Dera Ghazi Khan":"Dera Ghazi Khan","Dera Ghazi Khan (Dera Ghazi Khan)":"Dera Ghazi Khan","Kot Chatta":"Dera Ghazi Khan","Taunsa":"Dera Ghazi Khan","Chak Jhumra":"Faisalabad","Faisalabad City":"Faisalabad","Faisalabad Sadar":"Faisalabad","Jaranwala":"Faisalabad","Summundri":"Faisalabad","Tandlian Wala":"Faisalabad","Gujranwala":"Gujranwala","Kamoke":"Gujranwala","Nowshera Virkan":"Gujranwala","Wazirabad":"Gujranwala","Gujrat":"Gujrat","Kharian":"Gujrat","Sarai Alamgir":"Gujrat","Hafizabad":"Hafizabad","Pindi Bhattian":"Hafizabad","Ahmadpur Sial":"Jhang","Jhang":"Jhang","Shorkot":"Jhang","Athara Hazari":"Jhang","Dina":"Jhelum","Jhelum":"Jhelum","Pind Dadan Khan":"Jhelum","Sohawa":"Jhelum","Kasur":"Kasur","Kot Radha Kishen":"Kasur","Pattoki":"Kasur","Jahanian":"Khanewal","Kabirwala":"Khanewal","Khanewal":"Khanewal","Mian Channu":"Khanewal","Khushab":"Khushab","Naushera":"Khushab","Noorpur":"Khushab","Quaidabad":"Khushab","Lahore Cantt":"Lahore","Lahore City":"Lahore","Choubara":"Layyah","Karor Lal Esan":"Layyah","Leiah":"Layyah","Dunyapur":"Lodhran","Kahror Pacca":"Lodhran","Lodhran":"Lodhran","Malakwal":"Mandi Bahauddin","Mandi Bahauddin":"Mandi Bahauddin","Phalia":"Mandi Bahauddin","Mianwali":"Mianwali","Jalalpur Pirwala":"Multan","Multan City":"Multan","Multan Saddar":"Multan","Shujabad":"Multan","Alipur":"Muzaffargarh","Jatoi":"Muzaffargarh","Kot Addu":"Muzaffargarh","Muzaffargarh":"Muzaffargarh","Nankana Sahib":"Nankana Sahib","Sangla Hill":"Nankana Sahib","Shah Kot":"Nankana Sahib","Narowal":"Narowal","Okara":"Okara","Renala Khurd":"Okara","Arif Wala":"Pakpattan","Pakpattan":"Pakpattan","Khanpur":"Rahim Yar Khan","Liaqatpur":"Rahim Yar Khan","Rahim Yar Khan":"Rahim Yar Khan","Jampur":"Rajanpur","Rajanpur":"Rajanpur","Rajanpur (Tribal Area)":"Rajanpur","Rojhan":"Rajanpur","Gujar Khan":"Rawalpindi","Kahuta":"Rawalpindi","Kallar Sayaddan":"Rawalpindi","Kotli Sattian":"Rawalpindi","Murree":"Rawalpindi","Rawalpindi":"Rawalpindi","Taxila":"Rawalpindi","Chichawatni":"Sahiwal","Sahiwal":"Sahiwal","Bhalwal":"Sargodha","Kot Momin":"Sargodha","Sahiwal (Sargodha)":"Sargodha","Sargodha":"Sargodha","Shahpur":"Sargodha","Sillanwali":"Sargodha","Bhera":"Sargodha","Ferozewala":"Sheikhupura","Muridke":"Sheikhupura","Safdarabad":"Sheikhupura","Sharak Pur":"Sheikhupura","Sheikhupura":"Sheikhupura","Daska":"Sialkot","Pasrur":"Sialkot","Sambrial":"Sialkot","Sialkot":"Sialkot","Gojra":"Toba Tek Singh","Kamalia":"Toba Tek Singh","Toba Tek Singh":"Toba Tek Singh","Pir Mahal":"Toba Tek Singh","Burewala":"Vehari","Mailsi":"Vehari","Vehari":"Vehari","Badin":"Badin","Matli":"Badin","Shaheed Fazil Rahu":"Badin","Talhar":"Badin","Tando Bago":"Badin","Gulberg Town":"Central Karachi","Liaqatabad Town":"Central Karachi","New Karachi Town":"Central Karachi","North Nazimabad Town":"Central Karachi","Dadu":"Dadu","Johi":"Dadu","Khairpur Nathan Shah":"Dadu","Mehar":"Dadu","Gulshan Iqbal Town":"East Karachi","Jamshaid Town":"East Karachi","Daharki":"Ghotki","Ghotki":"Ghotki","Khangarh":"Ghotki","Mirpur Mathelo":"Ghotki","Ubauro":"Ghotki","Hyderabad":"Hyderabad","Hyderabad City":"Hyderabad","Latifabad":"Hyderabad","Qasimabad":"Hyderabad","Garhi Khairo":"Jacobabad","Jacobabad":"Jacobabad","Kotri":"Jamshoro","Manjhand":"Jamshoro","Sehwan Sharif":"Jamshoro","Thano Bula Khan":"Jamshoro","Meero Khan":"Qambar Shahdadkot","Nasir Abad":"Qambar Shahdadkot","Qambar Ali Khan":"Qambar Shahdadkot","Qubo Saeed Khan":"Qambar Shahdadkot","Shahdad Kot":"Qambar Shahdadkot","Sijawal Junejo":"Qambar Shahdadkot","Warah":"Qambar Shahdadkot","Kandh Kot":"Kashmore","Kashmore":"Kashmore","Tangwani":"Kashmore","Faiz Ganj":"Khairpur","Gambat":"Khairpur","Khairpur":"Khairpur","Kingri":"Khairpur","Kot Diji":"Khairpur","Sobho Dero":"Khairpur","Thari Meer Wah":"Khairpur","Korangi Town":"Korangi","Landhi Town":"Korangi","Shah Faisal Town":"Korangi","Baqrani":"Larkana","Dokri":"Larkana","Larkana":"Larkana","Rato Dero":"Larkana","Bin Qasim Town":"Malir","Gadap Town":"Malir","Malir Town":"Malir","Hala":"Matiari","Matiari":"Matiari","Saeedabad":"Matiari","Digri":"Mirpur Khas","Hussain Bux Muree":"Mirpur Khas","Jhudo":"Mirpur Khas","Kot Ghulam Muhammad":"Mirpur Khas","Mirpur Khas":"Mirpur Khas","Shuja Abad":"Mirpur Khas","Sindhri":"Mirpur Khas","Bhiria":"Naushahro Feroze","Kandiaro":"Naushahro Feroze","Mehrab Pur":"Naushahro Feroze","Moro":"Naushahro Feroze","Naushahro Feroze":"Naushahro Feroze","Jam Nawaz Ali":"Sanghar","Khipro":"Sanghar","Sanghar":"Sanghar","Shahdadpur":"Sanghar","Sinjhoro":"Sanghar","Tando Adam":"Sanghar","Daulat Pur":"Shaheed Benazir Abad","Daur":"Shaheed Benazir Abad","Nawabshah":"Shaheed Benazir Abad","Sakrand":"Shaheed Benazir Abad","Garhi Yasin":"Shikarpur","Khanpur (Shikarpur)":"Shikarpur","Lakhi":"Shikarpur","Shikarpur":"Shikarpur","Kemari Town":"Keamari","Liyari Town":"South Karachi","Saddar Town":"South Karachi","Jati":"Sujawal","Kharo Chan":"Sujawal","Mirpur Bathoro":"Sujawal","Shah Bunder":"Sujawal","Sujawal":"Sujawal","New Sukkur":"Sukkur","Pano Aqil":"Sukkur","Rohri":"Sukkur","Sukkur":"Sukkur","Chamber":"Tando Allahyar","Jhando Mari":"Tando Allahyar","Tando Allahyar":"Tando Allahyar","Bulri Shah Karim":"Tando Muhammad Khan","Tando Ghulam Hyder":"Tando Muhammad Khan","Tando Muhammad Khan":"Tando Muhammad Khan","Chachro":"Tharparkar","Islam Kot":"Tharparkar","Mithi":"Tharparkar","Kaloi":"Tharparkar","Ghorabari":"Thatta","Thatta":"Thatta","Kunri":"Umer Kot","Pithoro":"Umer Kot","Samaro":"Umer Kot","Umer Kot":"Umer Kot","Baldia Town":"Keamari","Orangi Town":"West Karachi","Site Town":"Keamari","Haripur":"Haripur","Abbottabad":"Abbottabad","Havelian":"Abbottabad","Lora":"Abbottabad","Lower Tanawal":"Abbottabad","Bhimber":"Bhimber","Leepa":"Hattian","Kotli":"Kotli","Sehnsa":"Kotli","Athmuqam":"Neelam Valley","Dalbandin":"Chagai","Nokkundi":"Chagai","Chagai":"Chagai","Sunster":"Gwadar","Jhat Pat":"Jaffarabad","Gulistan":"Killa Abdullah","Kahan":"Kohlu","Dureji":"Hub","Gaddani":"Hub","Kingri (Musakhel)":"Musakhel","Nushki":"Nushki","Barshore":"Pishin","Kakar Khurasan":"Zhob","Mashabbrum":"Ghanche","Gojal":"Hunza","Darel":"Darel","Phandar":"Gupis-Yasin","Lotkoh":"Chitral","Mulkhow":"Chitral","Paharpur":"Dera Ismail Khan","Ghazi":"Haripur","Khanpur (Haripur)":"Haripur","Lower Kurram":"Kurram","Ghulam Khan":"North Waziristan","Jehangira":"Nowshera","Lahor":"Swabi","Kalam":"Swat","Hasan Abdal":"Attock","Hazro":"Attock","Haroonabad":"Bahawalnagar","Yazman":"Bahawalpur","Kalur Kot":"Bhakkar","Chunian":"Kasur","Isakhel":"Mianwali","Piplan":"Mianwali","Shakargarh":"Narowal","Zafarwal":"Narowal","Depalpur":"Okara","Sadiqabad":"Rahim Yar Khan","Thul":"Jacobabad","Nara":"Khairpur","Salehpat":"Sukkur","Dahli":"Tharparkar","Diplo":"Tharparkar","Nagar Parkar":"Tharparkar","Keti Bunder":"Thatta","Mirpur Sakro":"Thatta","Indian Illegally Occupied Jammu Kashmir":"Indian Illegally Occupied Jammu Kashmir"};
window.PK_KEY_TO_DISTRICT = PK_KEY_TO_DISTRICT;

const PK_TEHSIL_TERRAIN = AGN.geoData('PK_TEHSIL_TERRAIN');
window.PK_TEHSIL_TERRAIN = PK_TEHSIL_TERRAIN;






const AGN_TUNING={
  FLOOD_RC_LEGACY: false,
  _role: 'behaviour switches only — every scientific constant lives in FORMULA_REGISTRY',
  _provenance: 'experimental - chosen by output inspection, not fitted to observed impact'
};
window.AGN_TUNING=AGN_TUNING;
const HZ_DISTRICT_ALIAS={ 'Gupis-Yasin':'Gupis Yasin' };
const HZ_TEHSIL_TO_SPLIT={
  'Chitral':'Chitral Lower','Drosh':'Chitral Lower','Lotkoh':'Chitral Lower',
  'Mastuj':'Chitral Upper','Mulkhow':'Chitral Upper'
};
function hzResolveDistrict(distName, tehsilKey){
  if(tehsilKey && HZ_TEHSIL_TO_SPLIT[tehsilKey]) return HZ_TEHSIL_TO_SPLIT[tehsilKey];
  return HZ_DISTRICT_ALIAS[distName] || distName;
}
window.hzResolveDistrict=hzResolveDistrict;
var AGN_TEHSIL_ZONE = {"version":"tz-91.17.184","units":{"Bagh":0.997,"Dhir Kot":1.0,"Harighel":0.996,"Barnala":0.06,"Samahni":0.484,"Chikar":0.99,"Hattian":0.999,"Haveli":1.0,"Khurshid Abad":1.0,"Mumtazabad":1.0,"Charhoi":0.623,"Dulliya Jattan":0.289,"Fatehpur Thakiala":0.814,"Khui Ratta":0.485,"Dadyal":0.044,"Mirpur":0.036,"Muzaffarabad":0.984,"Naseerabad":1.0,"Sharda":0.997,"Abbaspur":0.986,"Hajira":0.859,"Rawalakot":0.879,"Thorar":1.0,"Baluch":0.902,"Mong":1.0,"Pallandari":0.859,"Tarar Khal":0.89,"Awaran":0.088,"Jhal Jhao":0.223,"Mashkai":0.358,"Gishekore":0.11,"Barkhan":0.222,"Rakhni":0.187,"Taftan":0.051,"Dera Bugti":0.137,"Phelawagh":0.109,"Sui":0.021,"Gwadar":0.015,"Jiwani":0.0,"Ormara":0.082,"Pasni":0.043,"Harnai":0.612,"Shahrigh":0.752,"Gandakha":0.0,"Usta Mohammad":0.0,"Gandawa":0.088,"Jhal Magsi":0.108,"Dhadar":0.12,"Mach":0.51,"Sanni":0.194,"Balanari":0.0,"Khattan":0.0,"Kalat":0.389,"Khaliqabad":0.291,"Buleda":0.012,"Dasht":0.091,"Kech (Turbat)":0.101,"Mand":0.025,"Tump":0.146,"Kharan":0.11,"Sar Kharan":0.068,"Tomulk":0.204,"Khuzdar":0.415,"Mola":0.715,"Naal":0.215,"Wadh":0.358,"Zehri":0.57,"Dobandi":0.09,"Killa Abdullah":0.165,"Killa Saifullah":0.123,"Muslim Bagh":0.285,"Kohlu":0.351,"Mawand":0.405,"Bela":0.054,"Hub":0.086,"Kanraj":0.418,"Sonmiani":0.004,"Uthal":0.044,"Lakhra":0.001,"Lairi":0.12,"Bhag":0.0,"Lehri":0.008,"Loralai":0.144,"Mekhtar":0.128,"Dasht Spenzend":0.543,"Kirdgap":0.07,"Mastung":0.31,"Drug":0.459,"Musakhel":0.533,"Chattar":0.0,"Dera Murad Jamali":0.0,"Tamboo":0.0,"Gowargo":0.01,"Jaheen Parome":0.021,"Panjgur":0.013,"Gichk":0.07,"Huramzai":0.316,"Karezat":0.215,"Pishin":0.07,"Saranan":0.009,"Panjpai":0.004,"Quetta City":0.663,"Quetta Saddar":0.427,"Sherani":0.477,"Sibi":0.315,"Sohbatpur":0.0,"Mashkhel":0.036,"Basima":0.094,"Washuk":0.04,"Nag":0.054,"Shaogari":0.108,"Zhob":0.227,"Sinjawi":0.478,"Ziarat":0.706,"Surab":0.138,"Duki":0.222,"Chaman":0.242,"Astore":0.986,"Shounter":0.993,"Chilas":0.994,"Ishkoman":0.996,"Punial":0.987,"Gilgit":0.985,"Ali Abad":0.998,"Gamba":0.935,"Skardu":0.9,"Nagar":0.995,"Sikandar Abad":1.0,"Gultari":0.87,"Kharmang":0.996,"Daghoni":0.997,"Khaplu":1.0,"Shigar":0.962,"Tangir":0.999,"Gupis":0.994,"Yasin":0.998,"Rondu":1.0,"Islamabad":0.128,"Bar Chamarkand":1.0,"Barang":0.948,"Khar":0.354,"Mamund":0.676,"Nawagai":0.858,"Salarzai":0.713,"Utman Khel":0.861,"Bannu":0.0,"Baka Khel":0.0,"Domel":0.0,"Kakki":0.0,"Miryan":0.0,"Wazir":0.173,"Allai":1.0,"Batagram":0.949,"Daggar":0.777,"Gagra":0.773,"Khado Khel":0.457,"Mandanr":0.83,"Charsadda":0.0,"Shabqadar":0.0,"Tangi":0.016,"Chitral":0.998,"Drosh":1.0,"Mastuj":0.988,"Dera Ismail Khan":0.0,"Daraban":0.001,"Kulachi":0.0,"Paroa":0.0,"Darazinda":0.444,"Hangu":0.447,"Tall":0.206,"Banda Daud Shah":0.258,"Karak":0.041,"Takht-E-Nasrati":0.359,"Bara":0.716,"Jamrud":0.457,"Landi Kotal":0.754,"Mulagori":0.767,"Kohat":0.239,"Lachi":0.184,"Gumbat":0.224,"Darra Adam Khel":0.61,"Pattan":1.0,"Bankad":1.0,"Dassu":0.998,"Kandia":1.0,"Harban Basha":0.999,"Seo":1.0,"Palas":1.0,"Battera Kolai":1.0,"Central Kurram":0.758,"Upper Kurram":0.539,"Lakki Marwat":0.043,"Sarai Naurang":0.0,"Bettani":0.296,"Adenzai":0.694,"Balambat":0.871,"Lalqila":0.865,"Munda":0.636,"Samarbagh":0.831,"Timergara":0.824,"Bat Khela":0.777,"Dargai":0.132,"Bala Kot":0.992,"Mansehra":0.522,"Oghi":0.889,"Baffa Pakhal":0.809,"Darband":0.857,"Katlang":0.305,"Mardan":0.0,"Takht Bhai":0.0,"Rustam":0.468,"Garhi Kapura":0.0,"Ambar":0.75,"Baizai":0.616,"Halimzai":0.463,"Khwazai":0.311,"Pandiali":0.57,"Prang Ghar":0.776,"Safi":0.564,"Yaka Ghund":0.458,"Data Khel":0.482,"Dossali":0.288,"Garyum":0.181,"Mir Ali":0.229,"Miran Shah":0.309,"Razmak":0.604,"Shewa":0.245,"Spinwam":0.315,"Shawal":0.628,"Nowshera":0.054,"Pabbi":0.143,"Central Orakzai":0.776,"Ismailzai":0.892,"Lower Orakzai":0.832,"Upper Orakzai":0.761,"Town-I":0.0,"Town-Ii":0.0,"Town-Iii":0.004,"Town-Iv":0.0,"Hassan Khel":0.646,"Alpuri":0.998,"Bisham":0.994,"Chakisar":0.991,"Makhuzai":0.992,"Martoong":0.982,"Puran":0.982,"Birmal":0.615,"Ladha":0.755,"Makin":0.631,"Sararogha":0.567,"Serwakai":0.373,"Tiarza":0.554,"Toi Khulla":0.197,"Wana":0.413,"Swabi":0.043,"Topi":0.355,"Razar":0.198,"Babuzai":0.862,"Bahrain":0.999,"Barikot":0.793,"Charbagh":0.91,"Kabal":0.693,"Khwaza Khela":0.894,"Matta Kharirai":0.841,"Matta Sebujni":0.932,"Tank":0.008,"Jandola":0.245,"Judba":1.0,"Khander":0.986,"Barawal":0.992,"Dir":0.985,"Kalkot":0.999,"Khall":0.956,"Shrengal":1.0,"Wari":0.958,"Larjam":0.993,"Attock":0.14,"Fateh Jang":0.027,"Jand":0.0,"Pindi Gheb":0.0,"Bahawalnagar":0.0,"Chishtian":0.0,"Fort Abbas":0.0,"Minchinabad":0.0,"Ahmadpur East":0.0,"Bahawalpur":0.0,"Hasilpur":0.0,"Khairpur Tamewali":0.0,"Bhakkar":0.0,"Darya Khan":0.0,"Mankera":0.0,"Chakwal":0.021,"Choa Saidan Shah":0.26,"Kallar Kahar":0.127,"Tala Gang":0.018,"Bhawana":0.0,"Chiniot":0.0,"Lalian":0.0,"Kot Chatta":0.0,"Taunsa":0.0,"Chak Jhumra":0.0,"Faisalabad City":0.0,"Faisalabad Sadar":0.0,"Jaranwala":0.0,"Summundri":0.0,"Tandlian Wala":0.0,"Gujranwala":0.0,"Kamoke":0.0,"Nowshera Virkan":0.0,"Wazirabad":0.0,"Gujrat":0.0,"Kharian":0.0,"Sarai Alamgir":0.0,"Hafizabad":0.0,"Pindi Bhattian":0.0,"Ahmadpur Sial":0.0,"Jhang":0.0,"Shorkot":0.0,"Athara Hazari":0.0,"Dina":0.0,"Jhelum":0.084,"Pind Dadan Khan":0.127,"Sohawa":0.055,"Kasur":0.0,"Kot Radha Kishen":0.0,"Pattoki":0.0,"Jahanian":0.0,"Kabirwala":0.0,"Khanewal":0.0,"Mian Channu":0.0,"Khushab":0.088,"Naushera":0.145,"Noorpur":0.0,"Quaidabad":0.157,"Lahore Cantt":0.0,"Lahore City":0.0,"Choubara":0.0,"Karor Lal Esan":0.0,"Leiah":0.0,"Dunyapur":0.0,"Kahror Pacca":0.0,"Lodhran":0.0,"Malakwal":0.0,"Mandi Bahauddin":0.0,"Phalia":0.0,"Mianwali":0.086,"Jalalpur Pirwala":0.0,"Multan City":0.0,"Multan Saddar":0.0,"Shujabad":0.0,"Alipur":0.0,"Jatoi":0.0,"Kot Addu":0.0,"Muzaffargarh":0.0,"Nankana Sahib":0.0,"Sangla Hill":0.0,"Shah Kot":0.0,"Narowal":0.0,"Okara":0.0,"Renala Khurd":0.0,"Arif Wala":0.0,"Pakpattan":0.0,"Khanpur":0.0,"Liaqatpur":0.0,"Rahim Yar Khan":0.0,"Jampur":0.001,"Rajanpur":0.0,"Rajanpur (Tribal Area)":0.213,"Rojhan":0.0,"Gujar Khan":0.0,"Kahuta":0.377,"Kallar Sayaddan":0.036,"Kotli Sattian":0.935,"Murree":0.864,"Rawalpindi":0.0,"Taxila":0.05,"Chichawatni":0.0,"Sahiwal":0.0,"Bhalwal":0.0,"Kot Momin":0.0,"Sahiwal (Sargodha)":0.0,"Sargodha":0.0,"Shahpur":0.0,"Sillanwali":0.0,"Bhera":0.0,"Ferozewala":0.0,"Muridke":0.0,"Safdarabad":0.0,"Sharak Pur":0.0,"Sheikhupura":0.0,"Daska":0.0,"Pasrur":0.0,"Sambrial":0.0,"Sialkot":0.0,"Gojra":0.0,"Kamalia":0.0,"Toba Tek Singh":0.0,"Pir Mahal":0.0,"Burewala":0.0,"Mailsi":0.0,"Vehari":0.0,"Badin":0.0,"Matli":0.0,"Shaheed Fazil Rahu":0.0,"Talhar":0.0,"Tando Bago":0.0,"Gulberg Town":0.0,"Liaqatabad Town":0.0,"New Karachi Town":0.0,"North Nazimabad Town":0.0,"Dadu":0.0,"Johi":0.167,"Khairpur Nathan Shah":0.233,"Mehar":0.0,"Gulshan Iqbal Town":0.0,"Jamshaid Town":0.0,"Daharki":0.0,"Ghotki":0.0,"Khangarh":0.0,"Mirpur Mathelo":0.0,"Ubauro":0.0,"Hyderabad":0.0,"Hyderabad City":0.0,"Latifabad":0.0,"Qasimabad":0.0,"Garhi Khairo":0.0,"Jacobabad":0.0,"Kotri":0.013,"Manjhand":0.054,"Sehwan Sharif":0.151,"Thano Bula Khan":0.067,"Meero Khan":0.0,"Nasir Abad":0.0,"Qambar Ali Khan":0.161,"Qubo Saeed Khan":0.208,"Shahdad Kot":0.0,"Sijawal Junejo":0.0,"Warah":0.0,"Kandh Kot":0.0,"Kashmore":0.0,"Tangwani":0.0,"Faiz Ganj":0.0,"Gambat":0.0,"Khairpur":0.0,"Kingri":0.0,"Kot Diji":0.0,"Sobho Dero":0.0,"Thari Meer Wah":0.0,"Korangi Town":0.0,"Landhi Town":0.0,"Shah Faisal Town":0.0,"Baqrani":0.0,"Dokri":0.0,"Larkana":0.0,"Rato Dero":0.0,"Bin Qasim Town":0.0,"Gadap Town":0.027,"Malir Town":0.0,"Hala":0.0,"Matiari":0.0,"Saeedabad":0.0,"Digri":0.0,"Hussain Bux Muree":0.0,"Jhudo":0.0,"Kot Ghulam Muhammad":0.0,"Mirpur Khas":0.0,"Shuja Abad":0.0,"Sindhri":0.0,"Bhiria":0.0,"Kandiaro":0.0,"Mehrab Pur":0.0,"Moro":0.0,"Naushahro Feroze":0.0,"Jam Nawaz Ali":0.0,"Khipro":0.0,"Sanghar":0.0,"Shahdadpur":0.0,"Sinjhoro":0.0,"Tando Adam":0.0,"Daulat Pur":0.007,"Daur":0.0,"Nawabshah":0.0,"Sakrand":0.0,"Garhi Yasin":0.0,"Khanpur (Shikarpur)":0.0,"Lakhi":0.0,"Shikarpur":0.0,"Kemari Town":0.0,"Liyari Town":0.0,"Saddar Town":0.0,"Jati":0.0,"Kharo Chan":0.0,"Mirpur Bathoro":0.0,"Shah Bunder":0.0,"Sujawal":0.0,"New Sukkur":0.0,"Pano Aqil":0.0,"Rohri":0.0,"Sukkur":0.0,"Chamber":0.0,"Jhando Mari":0.0,"Tando Allahyar":0.0,"Bulri Shah Karim":0.0,"Tando Ghulam Hyder":0.0,"Tando Muhammad Khan":0.0,"Chachro":0.0,"Islam Kot":0.0,"Mithi":0.0,"Kaloi":0.0,"Ghorabari":0.0,"Thatta":0.001,"Kunri":0.0,"Pithoro":0.0,"Samaro":0.0,"Umer Kot":0.0,"Baldia Town":0.0,"Orangi Town":0.0,"Site Town":0.0,"Haripur":0.357,"Abbottabad":0.876,"Havelian":0.656,"Lora":0.865,"Lower Tanawal":0.784,"Bhimber":0.114,"Leepa":1.0,"Kotli":0.67,"Sehnsa":0.58,"Athmuqam":1.0,"Dalbandin":0.095,"Nokkundi":0.011,"Chagai":0.09,"Sunster":0.004,"Jhat Pat":0.0,"Gulistan":0.13,"Kahan":0.195,"Dureji":0.345,"Gaddani":0.002,"Kingri (Musakhel)":0.214,"Nushki":0.057,"Barshore":0.093,"Kakar Khurasan":0.087,"Mashabbrum":0.94,"Gojal":0.994,"Darel":0.994,"Phandar":0.995,"Lotkoh":1.0,"Mulkhow":0.996,"Paharpur":0.216,"Ghazi":0.425,"Khanpur (Haripur)":0.656,"Lower Kurram":0.157,"Ghulam Khan":0.214,"Jehangira":0.249,"Lahor":0.0,"Kalam":0.998,"Hasan Abdal":0.045,"Hazro":0.014,"Haroonabad":0.0,"Yazman":0.0,"Kalur Kot":0.0,"Chunian":0.0,"Isakhel":0.144,"Piplan":0.0,"Shakargarh":0.0,"Zafarwal":0.0,"Depalpur":0.0,"Sadiqabad":0.0,"Thul":0.0,"Nara":0.0,"Salehpat":0.0,"Dahli":0.0,"Diplo":0.0,"Nagar Parkar":0.0,"Keti Bunder":0.0,"Mirpur Sakro":0.0,"Indian Illegally Occupied Jammu Kashmir":0.856,"Dera Ghazi Khan":0.236}};    
function hzTerrainFor(name, tehsilKey){
  
  
  
  
  
  const tk = tehsilKey || ((typeof PK_TEHSIL_TERRAIN!=='undefined' && PK_TEHSIL_TERRAIN[name]) ? name : null);
  const distName = (tk && typeof PK_KEY_TO_DISTRICT!=='undefined' && PK_KEY_TO_DISTRICT[tk]) ? PK_KEY_TO_DISTRICT[tk] : name;
  const _dn=hzResolveDistrict(distName, tk);
  const dt=AGN.units.terrain(_dn);    
  const base = dt
    ? {elev:dt.e, emin:(dt.emin!=null?dt.emin:null), emax:(dt.emax!=null?dt.emax:null),
       slope:dt.s, slopeP95:(dt.sp!=null?dt.sp:null), tri:dt.t, relief:dt.r, zone:dt.z,
       elevMissing:false, dq:false, res:'district'}
    

    

    : {elev:null, emin:null, emax:null, slope:null, slopeP95:null, tri:null, relief:null,
       zone:null, zoneUnknown:true, elevMissing:true, dq:false, res:'none'};
  if(tk && typeof PK_TEHSIL_TERRAIN!=='undefined' && PK_TEHSIL_TERRAIN[tk]){
    tehsilKey=tk;
    const a=PK_TEHSIL_TERRAIN[tehsilKey];           
    const dq = a[7]===1;
    if(dq){
      
      
      
      
      
      
      
      return Object.assign({}, base, {
        dq:true, elevMissing:(base.elev==null), res:'district-substitute',
        emed:null, substituted:true, substitutedFrom:distName
      });
    }
    

    var _zone=base.zone, _zoneWhy=null;
    try{ var _ms=(AGN_TEHSIL_ZONE&&AGN_TEHSIL_ZONE.units)?AGN_TEHSIL_ZONE.units[tehsilKey]:null;
         if(_ms!=null && _ms>=0.5 && (_zone==='irrigated_plains'||_zone==='arid_plains')){ _zone='highland'; _zoneWhy='tehsil '+Math.round(_ms*100)+'% mountainous (GMBA definition), district zone '+base.zone; } }catch(_){}
    return {
      elev: a[0]!=null?a[0]:base.elev,
      emin: a[1]!=null?a[1]:base.emin,
      emax: a[2]!=null?a[2]:base.emax,
      emed: a[3],
      slope: a[4]!=null?a[4]:base.slope,
      slopeP95: a[5], slopeMax: a[6],
      tri: base.tri, relief: base.relief, zone: _zone, zoneWhy: _zoneWhy,
      zoneUnknown: !!base.zoneUnknown,   
      elevMissing:false, dq:false, res:'tehsil', substituted:false
    };
  }
  return base;
}

function elevHazardFor(name, tehsilKey){
  const t = hzTerrainFor(name, tehsilKey);
  return (t && t.elev!=null) ? t.elev : null;
}
function elevWeatherFor(name, tehsilKey){
  
  const a = (typeof forecastAnchorFor==='function') ? forecastAnchorFor(name) : null;
  if(a && a.elev!=null && isFinite(a.elev)) return {elev:Math.round(a.elev), src:'anchor', label:a.label||name};
  const t = hzTerrainFor(name, tehsilKey);
  if(t && t.elev!=null) return {elev:Math.round(t.elev), src:(t.res==='tehsil'?'tehsil-mean':'district-mean'), label:name};
  return {elev:null, src:'none', label:name};
}
window.elevHazardFor  = elevHazardFor;
window.elevWeatherFor = elevWeatherFor;
window.hzTerrainFor = hzTerrainFor;



const DISTRICT_FORECAST_ANCHORS = {
  Skardu:       { lat:35.2971, lon:75.6333, elev:2228, label:"Skardu town / station",       type:"town_station" },
  Gilgit:       { lat:35.9208, lon:74.3083, elev:1500, label:"Gilgit town / station",       type:"town_station" },
  Muzaffarabad: { lat:34.3700, lon:73.4711, elev:737,  label:"Muzaffarabad town / station", type:"town_station" },
  Quetta:       { lat:30.1798, lon:66.9750, elev:1680, label:"Quetta town / station",        type:"town_station" }
};
window.DISTRICT_FORECAST_ANCHORS = DISTRICT_FORECAST_ANCHORS;


function forecastAnchorFor(name){
  return (DISTRICT_FORECAST_ANCHORS && DISTRICT_FORECAST_ANCHORS[name]) || null;
}
window.forecastAnchorFor = forecastAnchorFor;

