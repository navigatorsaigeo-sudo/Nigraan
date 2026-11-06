"""v91.17.269 - INFRA A7 - offline test of nigraan_calls.py (no network, no key):  python test_nigraan_calls.py
A local HTTP server stands in for the provider (is_provider is pointed at it) and another for the NIGRAAN server.
  C1 a provider answer (200 and an error status) is reported once each, with ok, the script name and n=1
  C2 the key parameter never leaves the script (not in the report, not in the pending file)
  C3 the request and the answer are unchanged for the script (same body, HTTPError still raised for 503)
  C4 NIGRAAN server down: the report goes to <app>/data/run/learn-calls.pending.jsonl, and the script is not slowed (one try a minute)
  C5 a call to a host that is not the provider is not reported"""
import json, os, sys, tempfile, threading, time, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))   # v269: nigraan-local/scripts/nigraan_calls.py
os.environ['NIGRAAN_COUNT_CALLS'] = '1'

GOT = []
class Nig(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('content-length') or 0); GOT.append(json.loads(self.rfile.read(n)))
        b = json.dumps({'ok': True, 'overBudget': False}).encode(); self.send_response(200); self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
class Prov(BaseHTTPRequestHandler):
    def do_GET(self):
        code = 503 if 'fail' in self.path else 200; b = b'{"hourly":{"time":[]}}'
        self.send_response(code); self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
def serve(h):
    s = HTTPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s

nig, prov = serve(Nig), serve(Prov)
os.environ['NIGRAAN_BASE'] = 'http://127.0.0.1:%d' % nig.server_port
app = tempfile.mkdtemp(prefix='nigcalls-'); os.makedirs(os.path.join(app, 'server')); open(os.path.join(app, 'server', 'server.mjs'), 'w').close()
os.environ['NIGRAAN_APP'] = app
import nigraan_calls as NC
PROV = 'http://127.0.0.1:%d' % prov.server_port
NC.is_provider = lambda u: u.startswith(PROV)
P = F = 0
def ok(c, n, d=''):
    global P, F
    if c: P += 1; print('PASS ' + n)
    else: F += 1; print('FAIL %s :: %s' % (n, d))

body = urllib.request.urlopen(PROV + '/v1/forecast?latitude=31.5&longitude=74.3&hourly=temperature_2m&apikey=SECRET-TEST-VALUE', timeout=5).read()
ok(body == b'{"hourly":{"time":[]}}', 'C3 the script gets the answer unchanged')
raised = False
try: urllib.request.urlopen(PROV + '/v1/fail?latitude=1&longitude=2&apikey=SECRET-TEST-VALUE', timeout=5)
except urllib.error.HTTPError as e: raised = e.code == 503
ok(raised, 'C3 an error status still raises HTTPError for the script')
time.sleep(0.2)
ok(len(GOT) == 2 and GOT[0]['ok'] is True and GOT[1]['ok'] is False and GOT[0]['n'] == 1 and GOT[0]['caller'] == 'test_nigraan_calls', 'C1 each provider answer reported once, with ok and the script name', GOT)
ok(all('SECRET' not in json.dumps(g) and 'apikey' not in g['url'] for g in GOT), 'C2 the key parameter never leaves the script', GOT)
n0 = len(GOT)
try: urllib.request.urlopen(os.environ['NIGRAAN_BASE'] + '/not-provider', timeout=5)
except Exception: pass
ok(len(GOT) == n0, 'C5 a call to another host is not reported')
nig.shutdown(); nig.server_close()
t0 = time.time()
for i in range(5): urllib.request.urlopen(PROV + '/v1/forecast?latitude=%d&longitude=1&apikey=SECRET-TEST-VALUE' % i, timeout=5).read()
dt = time.time() - t0
pf = os.path.join(app, 'data', 'run', 'learn-calls.pending.jsonl')
lines = open(pf).read().strip().split('\n') if os.path.exists(pf) else []
ok(len(lines) == 5 and all(json.loads(l)['caller'] == 'test_nigraan_calls' for l in lines), 'C4 server down: 5 calls kept in the pending file', lines)
ok('SECRET' not in open(pf).read() if os.path.exists(pf) else False, 'C2 no key in the pending file')
ok(dt < 3, 'C4 the script is not slowed while the server is down (5 calls in %.2f s)' % dt)
print('\n%s nigraan_calls: %d passed, %d failed' % ('FAIL' if F else 'PASS', P, F))
import shutil; shutil.rmtree(app, ignore_errors=True)
sys.exit(1 if F else 0)
