/* v91.17.194 · start path without WMI (keepalive fast start, port-based watchdog, hidden starter) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const R = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('keepalive starts the port-checking watchdog before any WMI query when nothing has logged for 15 min', () => {
  const k = R('scripts/keepalive.vbs');
  const fast = k.indexOf('fastStarted = True'), wmi = k.indexOf('GetObject("winmgmts:');
  assert.ok(fast > 0 && wmi > 0 && fast < wmi, 'fast start comes before the WMI query');
  assert.ok(k.indexOf('applying = True') < fast, 'the update flag is read before the fast start');
  assert.match(k, /AgeMin\(root & "\\data\\server\.log"\) >= 15 And AgeMin\(root & "\\data\\server-console\.log"\) >= 15/);
  assert.ok(!/MSXML2|XMLHTTP|WinHttp/i.test(k), 'no web request from the script host (Norton rule)');
});

test('the watchdog checks the port, not Get-CimInstance, before starting a server; snapshot never blocks', () => {
  const w = R('scripts/wd/watchdog.cmd');
  const loop = w.slice(w.indexOf(':loop'), w.indexOf('node server\\server.mjs'));
  assert.ok(!loop.split('\n').filter(l => !/^\s*REM/i.test(l)).join('\n').includes('Get-CimInstance'), 'no CIM before the start'); assert.ok(loop.includes('Net.Sockets.TcpClient'));
  assert.ok(w.includes('cd /d "%~dp0..\\.."'));
  assert.ok(w.includes('start "" /b powershell'), 'crash snapshot in the background');
  assert.match(R('scripts/watchdog.cmd'), /call "%~dp0wd\\watchdog\.cmd"/);
  assert.ok(existsSync(new URL('../../scripts/wd/start_hidden.vbs', import.meta.url)));
  assert.ok(!R('scripts/wd/start_hidden.vbs').includes('winmgmts'));
});
