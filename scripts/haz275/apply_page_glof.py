import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    n=s.count(old); assert n==count,(old[:90],n); s=s.replace(old,new)
rep("unit:'GLOF level: Low / Monitor / Watch / Act'","unit:'GLOF level: Normal / High / Severe'")
rep("Low where the lakes upstream add up to little, Monitor where their susceptibility within reach passes the Monitor line (every lake counts), Watch on a precursor within reach (growth in our own Sentinel-2 reads, or an outburst within the recurrence window), Act only on an observed signal (a measured drainage or a confirmed outburst report).",
    "Normal where the lakes upstream add up to little or are only susceptible (a standing condition, not a forecast; every lake counts), High on a precursor within reach (growth in our own Sentinel-2 reads), Severe only on an observed signal (a measured drainage or a confirmed outburst report). Lake areas from the SUPARCO Glacier Geospatial Portal inventory where it holds the lake.")
rep("A level from the mapped glacial lakes, not a 0\\u2013100 score. Low: the lakes upstream add up to little. Monitor: susceptible lakes drain through the tehsil within reach. Watch: a lake within reach is growing in our Sentinel-2 reads or burst within the recurrence window. Act: an observed drainage or a confirmed outburst report.",
    "A level from the mapped glacial lakes, not a 0\\u2013100 score. Normal: the lakes upstream add up to little, or susceptible lakes drain through the tehsil within reach (a standing condition, not a forecast). High: a lake within reach is growing in our Sentinel-2 reads. Severe: an observed drainage or a confirmed outburst report.")
# hzGLOF category label: the five-word word, never the ladder code
rep("categoryLabel:(_gStand?'GLOF: Susceptible (standing, not a forecast)':('GLOF level: '+_N.class+(_N.class==='Low'?' (lakes upstream, nothing found)':'')))",
    "categoryLabel:(_gStand?'GLOF level: Normal (susceptible lakes upstream, a standing condition, not a forecast)':('GLOF level: '+({Low:'Normal',Watch:'High',Act:'Severe'}[_N.class]||_N.class)+(_N.class==='Low'?' (lakes upstream, nothing found)':'')))")
rep("reason:'the lake-routed class for this unit ('+(_N.class==null?'none':_N.class)+') is not one of Low / Monitor / Watch / Act, so no level is issued'",
    "reason:'the lake-routed class for this unit ('+(_N.class==null?'none':_N.class)+') is not one the GLOF ladder issues, so no level is issued'")
rep("+esc(X.counts.priority)+' Priority · '+esc(X.counts.elevated!=null?X.counts.elevated:X.counts.watch)+' Elevated · '",
    "+esc(X.counts.priority)+' High · '+esc(X.counts.elevated!=null?X.counts.elevated:X.counts.watch)+' Moderate susceptibility · '")
rep("gl=cc(gq.class,true)+'<br><span class=\"agn-enssub\">'+(gq.counts&&(gq.counts.priority||gq.counts.watch)?'lakes upstream: '+esc(gq.counts.priority)+' Priority, '+esc(gq.counts.watch)+' Elevated':'no Priority or Elevated lake within '+esc(gq.routeKm)+' km')+'</span>'",
    "gl=cc(gq.word||({Low:'Normal',Monitor:'Normal',Watch:'High',Act:'Severe'}[gq.class]||null))+'<br><span class=\"agn-enssub\">'+(gq.counts&&(gq.counts.priority||gq.counts.watch)?'lakes upstream: '+esc(gq.counts.priority)+' High, '+esc(gq.counts.watch)+' Moderate susceptibility':'no High or Moderate susceptibility lake within '+esc(gq.routeKm)+' km')+'</span>'")
rep("var COL={1:'#c0392b',2:'#e08e0b',3:'#6fa8dc'}, TL={1:'Priority',2:'Elevated',3:'Inventory'};",
    "var COL={1:'#c0392b',2:'#e08e0b',3:'#6fa8dc'}, TL={1:'High',2:'Moderate',3:'Low'};")
rep("+esc(r[16]||TL[tier])+' tier · '", "+esc(r[16]||TL[tier])+(r[16]==='Documented outburst site'?'':' susceptibility')+' · '")
rep("legend.innerHTML='<b>Glacial lakes</b><div><i style=\"background:'+COL[1]+'\"></i>Priority'+(_sup?' \\u00b7 SUPARCO dangerous-lake list':'')+'</div><div><i style=\"background:'+COL[2]+'\"></i>Elevated'+(_sup?' \\u00b7 our screening':'')",
    "legend.innerHTML='<b>Glacial lakes (susceptibility)</b><div><i style=\"background:'+COL[1]+'\"></i>High'+(_sup?' \\u00b7 SUPARCO dangerous-lake list':'')+'</div><div><i style=\"background:'+COL[2]+'\"></i>Moderate'+(_sup?' \\u00b7 our screening':'')")
rep("+'</div><div><i style=\"background:'+COL[3]+'\"></i>'+(_sup?'SUPARCO inventory ('+esc(_sup.count)+' lakes)':'Inventory')",
    "+'</div><div><i style=\"background:'+COL[3]+'\"></i>'+(_sup?'Low \\u00b7 SUPARCO inventory ('+esc(_sup.count)+' lakes)':'Low')")
rep("'Priority lakes and their status: SUPARCO GLOF bulletins. Lake inventory: SUPARCO Glacier Geospatial Portal (read '+esc(String(_sup.built||'').slice(0,10))+'). Elevated: AGN susceptibility screening of lakes not on the SUPARCO list. Lake areas from our own satellite reads.'",
    "'High: lakes on SUPARCO\\u2019s dangerous-lake list and their status (SUPARCO GLOF bulletins). Lake inventory and areas: SUPARCO Glacier Geospatial Portal (read '+esc(String(_sup.built||'').slice(0,10))+'); the levels use the same SUPARCO areas. Moderate: AGN susceptibility screening of lakes not on the SUPARCO list. Change in area: our own satellite reads.'")
rep("[['GLOF level',L.word,(L.i+1)*20],['Priority lakes upstream',pri,0],['Elevated lakes upstream',wat,0]",
    "[['GLOF level',L.word,(L.i+1)*20],['High-susceptibility lakes upstream',pri,0],['Moderate-susceptibility lakes upstream',wat,0]")
open(p,'w',encoding='utf-8').write(s); print('patched')
