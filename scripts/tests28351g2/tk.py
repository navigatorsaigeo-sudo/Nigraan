import json,re,urllib.request
from rtxt import text
from t30lib import post,get
p={'lat':33.66443,'lon':73.08339}; W={}
for k in ['situation_report','readiness_72h','executive_brief']:
    j=post({**p,'kind':k,'section':'test'}); st,h=get(j['html'],{'x-agn-view':'customer'}); T=text(h); open('kind_%s.txt'%k,'w').write(T)
    W[k]=set(re.findall(r'[A-Za-z]{4,}',T)); print(k,j['ok'],j['lint']['ok'],j['pages'],'pages')
ks=list(W)
for a in ks:
    for b in ks:
        if a<b: print(a,'vs',b,'words only in',a,len(W[a]-W[b]),'only in',b,len(W[b]-W[a]))
# report link navigation
st,_=get(j['html'],{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document','referer':'https://mail.example.com/x'}); print('nav cross-site html',st)
st,_=get(j['pdf'],{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'}); print('nav cross-site pdf',st)
st,b=get(j['html'],{'sec-fetch-site':'cross-site','sec-fetch-mode':'cors','sec-fetch-dest':'empty','origin':'https://evil.example'}); print('fetch cross-site (must stay 403)',st,b[:60])
st,b=get('/api/place/answer?lat=33.66&lon=73.08',{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'}); print('nav cross-site other api (must stay 403)',st)
r=urllib.request.Request('http://127.0.0.1:8921/api/report/generate',data=b'{}',headers={'content-type':'application/json','origin':'https://evil.example','sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'})
try: urllib.request.urlopen(r); print('POST cross-site ??? 200')
except urllib.error.HTTPError as e: print('POST cross-site (must stay 403)',e.code)
