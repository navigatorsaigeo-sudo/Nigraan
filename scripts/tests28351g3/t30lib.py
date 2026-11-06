import json,sys,re,time,urllib.request
sys.path.insert(0,'.'); from rtxt import text
import os
B=os.environ.get('NIG_BASE','http://127.0.0.1:8931')
def post(q,view='customer'):
    r=urllib.request.Request(B+'/api/report/generate',data=json.dumps(q).encode(),headers={'content-type':'application/json','x-agn-view':view})
    try: return json.load(urllib.request.urlopen(r,timeout=300))
    except urllib.error.HTTPError as e: return json.load(e)
def get(p,h={}):
    r=urllib.request.Request(B+p,headers=h)
    try: x=urllib.request.urlopen(r,timeout=120); return x.status,x.read().decode('utf8','replace')
    except urllib.error.HTTPError as e: return e.code,e.read().decode()
