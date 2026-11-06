"""v91.17.269 (16 Oct 2026) - INFRA A7 - the learning scripts' forecast-provider calls go through the NIGRAAN server's call counter.

Shipped in v91.17.269 as nigraan-local\scripts\nigraan_calls.py. NOT YET IMPORTED by any LEARN script: the scripts live under station-lake
(a link into the read-only D:\DATA LAKE) and their one-line edits are an open owner decision (OPEN.md).
Importing this module (one line, `import nigraan_calls`, in each LEARN script that calls the provider itself) installs a urllib
handler: every HTTP answer from *.open-meteo.com that the script receives is reported to the running NIGRAAN server
(POST http://127.0.0.1:8787/api/quota/note: the request URL without its key parameter, ok, the script name). The server weighs the call
with the same rule as its own proxy (provider.mjs weightOf) and adds it to today's quota window, so the daily total and
MACH_DAILY_CALL_LIMIT include the weekly learning jobs, and /api/quota/breakdown lists them as "learn <script>".
If the server does not answer, the line is appended to nigraan-local/data/run/learn-calls.pending.jsonl and the server adds it within
a minute of running again. The key never leaves the script: the apikey parameter is removed here before anything is sent or written.
Nothing about the request or the answer is changed; a failure of the counter never stops the script.
Environment: NIGRAAN_BASE (default http://127.0.0.1:8787), NIGRAAN_APP (the nigraan-local folder, found by itself otherwise),
NIGRAAN_COUNT_CALLS=0 to switch it off."""
import json, os, sys, threading, time, urllib.parse, urllib.request
from datetime import datetime, timezone

BASE = os.environ.get('NIGRAAN_BASE', 'http://127.0.0.1:8787').rstrip('/')
HERE = os.path.dirname(os.path.abspath(__file__))
CALLER = os.path.splitext(os.path.basename(sys.argv[0] or 'script'))[0] or 'script'
_lock = threading.Lock()
_state = {'down_until': 0.0, 'warned_over': False, 'warned_nowhere': False, 'sent': 0, 'pending': 0}


def _app():
    # v91.17.269 integration: shipped in nigraan-local\scripts\ (HERE/..); the station-lake places are kept for a later owner decision
    for c in (os.environ.get('NIGRAAN_APP'), os.path.join(HERE, '..'), os.getcwd(), os.path.join(HERE, '..', '..', 'nigraan-local'), os.path.join(HERE, '..', 'nigraan-local')):
        if c and os.path.exists(os.path.join(c, 'server', 'server.mjs')):
            return os.path.abspath(c)
    return None


def clean(url):
    """the URL without its key parameter (never sent, never written)"""
    u = urllib.parse.urlsplit(url)
    q = [(k, v) for k, v in urllib.parse.parse_qsl(u.query, keep_blank_values=True) if k.lower() != 'apikey']
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, urllib.parse.urlencode(q), ''))


def is_provider(url):
    try:
        h = urllib.parse.urlsplit(url).hostname or ''
    except Exception:
        return False
    return h == 'open-meteo.com' or h.endswith('.open-meteo.com')


def note(url, ok=True, caller=None, n=1):
    """report one (or n identical) provider call(s); returns the server's answer or None (kept in the pending file)"""
    line = {'url': clean(url), 'ok': bool(ok), 'n': int(n), 'caller': caller or CALLER, 'at': datetime.now(timezone.utc).isoformat(timespec='seconds')}
    if time.time() >= _state['down_until']:
        try:
            req = urllib.request.Request(BASE + '/api/quota/note', data=json.dumps(line).encode(), method='POST',
                                         headers={'content-type': 'application/json', 'x-agn-internal': 'learn-' + line['caller'][:30]})
            with _RAW.open(req, timeout=5) as r:
                j = json.load(r)
            _state['sent'] += 1
            if j.get('overBudget') and not _state['warned_over']:
                _state['warned_over'] = True
                print('  [nigraan_calls] NOTE: the server says the daily provider budget is spent (%s weighted calls today, limit %s); '
                      'this job keeps running (its calls are counted)' % (j.get('usedToday'), j.get('dailyLimit')), flush=True)
            return j
        except Exception:
            _state['down_until'] = time.time() + 60   # not asked again for a minute: the calls go to the pending file
    app = _app()
    if not app:
        if not _state['warned_nowhere']:
            _state['warned_nowhere'] = True
            print('  [nigraan_calls] no NIGRAAN server and no nigraan-local folder found: provider calls of this run are not counted', flush=True)
        return None
    f = os.path.join(app, 'data', 'run', 'learn-calls.pending.jsonl')
    try:
        with _lock:
            os.makedirs(os.path.dirname(f), exist_ok=True)
            with open(f, 'a', encoding='utf-8') as fh:
                fh.write(json.dumps(line) + '\n')
        _state['pending'] += 1
    except Exception:
        pass
    return None


class _Count(urllib.request.BaseHandler):
    handler_order = 100   # before HTTPErrorProcessor (1000): sees every answer, 2xx and errors alike

    def http_response(self, request, response):
        try:
            u = request.full_url
            if is_provider(u):
                note(u, ok=200 <= int(getattr(response, 'status', None) or response.getcode() or 0) < 400)
        except Exception:
            pass
        return response

    https_response = http_response


_RAW = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # the counter's own POSTs to this computer (no proxy, not counted)
if os.environ.get('NIGRAAN_COUNT_CALLS', '1') != '0':
    urllib.request.install_opener(urllib.request.build_opener(_Count()))


def summary():
    return dict(_state)
