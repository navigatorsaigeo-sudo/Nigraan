#!/usr/bin/env python3
"""v91.17.283.48 (NIGRAAN 1.0.9) item 3: the DGX Linux EWS password path in ews_sync.py.
The laptop (Windows) must behave exactly as before. Usage:
  python3 -I ewsdgx49.test.py <base ews_sync.py (laptop 1.0.8.2)> <new ews_sync.py>
Checks: (1) the change is insert-only against the laptop file; (2) with os.name == 'nt' _unseal, setup and the command line dispatch
give the same results, messages and saved files in both files (DPAPI mocked: no Windows here); (3) Linux: a DPAPI login file stops
clearly, a missing or empty credential stops, a present credential returns the password; the password is never printed."""
import sys, os, io, json, difflib, importlib.util, tempfile, contextlib, types
P = F = 0
def ok(c, m):
    global P, F
    print(('PASS ' if c else 'FAIL ') + m); P += bool(c); F += (not c)
def load(path, name):
    for k in ('pandas', 'numpy'):
        if k not in sys.modules:
            try: __import__(k)
            except Exception: sys.modules[k] = types.ModuleType(k)
    spec = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
base_p, new_p = sys.argv[1], sys.argv[2]
a = open(base_p, encoding='utf-8').read().splitlines(); b = open(new_p, encoding='utf-8').read().splitlines()
ops = [o for o in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes() if o[0] != 'equal']
ok(ops and all(o[0] == 'insert' for o in ops), f'1 insert-only change against the laptop file ({len(ops)} inserted blocks, {sum(o[4]-o[3] for o in ops)} lines)')
B = load(base_p, 'ews_base'); N = load(new_p, 'ews_new')
def fake_dpapi(data, protect): return bytes(reversed(data)) if protect else bytes(reversed(data))
real_name = os.name
@contextlib.contextmanager
def windows():
    os.name = 'nt'
    try: yield
    finally: os.name = real_name
def run(fn, *a):
    out = io.StringIO(); res = None; exc = None
    with contextlib.redirect_stdout(out):
        try: res = fn(*a)
        except SystemExit as e: exc = ('SystemExit', str(e.code))
        except Exception as e: exc = (type(e).__name__, str(e))
    return res, exc, out.getvalue()
import base64
sealed = {'username': 'u', 'password_dpapi': base64.b64encode(fake_dpapi(b'S3cret!', True)).decode()}
for M in (B, N): M._dpapi = fake_dpapi
with windows():
    rb = run(B._unseal, dict(sealed)); rn = run(N._unseal, dict(sealed))
    ok(rb == rn and rb[0] == 'S3cret!', '2a Windows _unseal of a DPAPI login: same password, same output')
    rb = run(B._unseal, {'username': 'u'}); rn = run(N._unseal, {'username': 'u'})
    ok(rb == rn and rb[1][0] == 'SystemExit', '2b Windows _unseal without an encrypted password: same stop and message (' + str(rb[1][1])[:50] + ')')
    rb = run(B._unseal, {'username': 'u', 'password_store': 'credential'}); rn = run(N._unseal, {'username': 'u', 'password_store': 'credential'})
    ok(rb == rn, '2c Windows _unseal of a Linux-style login file: same as before (no credential read on Windows)')
    # setup(): everything external mocked the same way for both files
    def setup_with(M):
        saved = {}; tmp = SETUP_DIR
        M.G = dict(getattr(M, 'G', {}) or {}); M.G.update(SEC=tmp, LOGIN=os.path.join(tmp, 'aegis_login.json'))
        M.choose_base = lambda x: None; M._token_req = lambda d: {'access_token': 'x'}
        M._save = lambda p, d: saved.update({os.path.basename(p): d}); M.load_cfg = lambda: {'mode': 'own'}
        import builtins, getpass
        oi, og = builtins.input, getpass.getpass
        builtins.input = lambda *_: 'user1'; getpass.getpass = lambda *_: 'S3cret!'
        try: r = run(M.setup)
        finally: builtins.input, getpass.getpass = oi, og
        return r, saved
    SETUP_DIR = tempfile.mkdtemp()
    (rb, sb), (rn, sn) = setup_with(B), setup_with(N)
    ok(rb[0] == rn[0] == 0 and rb[2] == rn[2] and sb == sn and 'password_dpapi' in sb.get('aegis_login.json', {}), '2d Windows setup(): same exit, same printed lines, same saved login (DPAPI)')
    ok('S3cret!' not in rn[2] and 'S3cret!' not in json.dumps(sn), '2e Windows setup(): the password is in no printed line or saved file')
# 2f: command line dispatch on Windows unchanged for every existing flag (new flag is extra)
src = open(new_p, encoding='utf-8').read(); tail = src[src.index("if __name__ == '__main__':"):]
srcb = open(base_p, encoding='utf-8').read(); tailb = srcb[srcb.index("if __name__ == '__main__':"):]
ok([l for l in tail.splitlines() if '--check-login' not in l] == tailb.splitlines(), '2f command line: only the --check-login line added; --setup / --repin / --status / run unchanged')
# 3: Linux
with tempfile.TemporaryDirectory() as d:
    os.environ.pop('CREDENTIALS_DIRECTORY', None); os.environ['NIGRAAN_CREDENTIALS_DIR'] = d
    r = run(N._unseal, dict(sealed)); ok(r[1] and 'not a Linux one' in r[1][1], '3a Linux: a DPAPI login file copied from the laptop stops with a clear message')
    L = {'username': 'u', 'password_store': 'credential'}
    r = run(N._unseal, L); ok(r[1] and 'not available' in r[1][1], '3b Linux: credential missing -> stop')
    open(os.path.join(d, 'nigraan.aegis_password'), 'w').write('\n'); r = run(N._unseal, L); ok(r[1] and 'empty' in r[1][1], '3c Linux: empty credential -> stop')
    open(os.path.join(d, 'nigraan.aegis_password'), 'w').write('S3cret!\n'); r = run(N._unseal, L); ok(r[0] == 'S3cret!' and 'S3cret!' not in r[2], '3d Linux: credential present -> the password, nothing printed')
    os.environ['CREDENTIALS_DIRECTORY'] = d; os.environ.pop('NIGRAAN_CREDENTIALS_DIR'); r = run(N._unseal, L); ok(r[0] == 'S3cret!', '3e Linux: systemd $CREDENTIALS_DIRECTORY is read')
    r = run(N.setup); ok(r[0] == 1 and 'set_secret.sh ews' in r[2], '3f Linux: --setup asks nothing and points to set_secret.sh')
print(f'---- {P} passed, {F} failed'); sys.exit(1 if F else 0)
