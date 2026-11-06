@echo off
setlocal EnableExtensions
REM ============================================================================
REM  NIGRAAN watchdog (v91.17.75; v91.17.194: lives in scripts\wd\, no Get-CimInstance before a start). Restarts the local server whenever it stops.
REM  Output: data\supervisor-console.log.  Started hidden by scripts\keepalive.vbs
REM  (scheduled task "NIGRAAN Keepalive") and by the Startup-folder entry.
REM  v91.17.260 (14 Oct 2026): normally started by the scheduled task "NIGRAAN Server" (_admin\install_server_task.ps1):
REM  "run whether the user is logged on or not" (S4U), at start-up and every 5 minutes with "do not start a new instance".
REM  The task runs this file in its own non-interactive logon session, so a sign-out, a closed console window or a
REM  crashed Terminal can no longer end the server; only a shutdown/restart can, and the task starts it again at boot.
REM  v91.17.269 (16 Oct 2026, zero-downtime deploy): this loop runs scripts\wd\supervisor.mjs instead of the server itself. The
REM  supervisor keeps the front proxy (server\proxy.mjs) on port 8787 and the NIGRAAN server on 8791 or 8792, writes each server
REM  stop to data\stops.log, and swaps servers for a deploy without a gap (data\run\request.json). This loop only restarts the
REM  supervisor: the proxy and the server keep running while it restarts and are adopted by the next one.
REM  Exit codes of the supervisor: 0 = reload asked (start it again at once), 97 = another supervisor already runs (this
REM  watchdog stops), 98 = port 8787 is held by a program that is not the NIGRAAN proxy (as before: "another server").
REM  The supervisor writes the proxy's and servers' console output to data\server-console.log itself (opened shared); this
REM  watchdog's own lines and the supervisor's go to data\supervisor-console.log, which no server holds open.
REM  This file is never replaced while it runs (cmd reads a batch file as it goes): _admin\v269\MIGRATE_V269.ps1 stops it first.
REM
REM  v75 - every stop is explained. When the server exits this writes
REM  data\crash-<date>_<time>.log: the exit code and what it means, a
REM  tasklist /v of node.exe, the node/cmd/powershell/wscript/ollama processes
REM  running at that moment with their command lines and parents, every
REM  PowerShell started in the last 10 minutes (a Stop-Process shows up there
REM  with its full command line), Windows error reports for node.exe,
REM  low-memory events, and the last 20 lines of data\server.log.
REM  v260 - ONE LINE PER STOP in data\stops.log, written by cmd at once (before anything that can be killed), and a
REM  second line at every watchdog start that names the Windows event (sign-out 7002, restart/shutdown 1074/6006,
REM  sleep 42/506, unexpected power loss 41/6008) between the previous server's last log line and now. A stop that also
REM  killed the watchdog (code 0x40010004 on 13-14 Oct) is therefore explained by the next start.
REM  Exit code 98 = another server already holds the port: this watchdog then
REM  stops instead of starting a server with no port every 15 s (the keepalive
REM  task starts a new watchdog if that other server goes away).
REM ============================================================================
set "NIG_SELF=%~f0"
cd /d "%~dp0..\.."
REM 11 Oct 2026 (AIGEO laptop): Node 22 per-user copy when node is not on PATH; lake and Python as in RUN_NIGRAAN.bat
REM 12 Oct 2026: NIGRAAN's own Node and Python (..\..\runtime from nigraan-local) come first
if exist "%CD%\..\..\runtime\nodejs22\node.exe" set "PATH=%CD%\..\..\runtime\nodejs22;%PATH%"
where node >nul 2>&1 || if exist "%LOCALAPPDATA%\Programs\nodejs22\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs22;%PATH%"
if exist "%CD%\..\..\runtime\python313\python.exe" set "NIGRAAN_PYTHON=%CD%\..\..\runtime\python313\python.exe"
if not defined NIGRAAN_PYTHON if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set "NIGRAAN_PYTHON=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not exist data mkdir data
set "NIGRAAN_WATCHDOG=1"
set "NPORT=8787"
if defined PORT set "NPORT=%PORT%"
REM v269: the supervisor's front proxy listens on NPORT; the servers get their own ports (8791/8792) from the supervisor
set "NIGRAAN_PROXY_PORT=%NPORT%"
set "PORT="
set "NIG_DATA=%CD%\data"
REM v260: who started this watchdog ("task" from the NIGRAAN Server task, otherwise keepalive / a shortcut) and in which session
set "NIG_BY=%~1"
if not defined NIG_BY set "NIG_BY=keepalive-or-manual"
set "NIG_SESS=%SESSIONNAME%"
if not defined NIG_SESS set "NIG_SESS=non-interactive (no desktop window)"
REM v260: the task's 5-minute start must not start a server while an update is being applied (the same rule keepalive.vbs keeps:
REM deploy\_staging_v73\applying.flag reads "applying" and is less than 30 minutes old). Only for the task; APPLY_VNNN.bat starts
REM the watchdog itself when it has finished.
if /i not "%NIG_BY%"=="task" goto noapplycheck
powershell -NoProfile -Command "$f=Join-Path (Split-Path -Parent (Get-Location).Path) '_staging_v73\applying.flag'; if ((Test-Path $f) -and (((Get-Date)-(Get-Item $f).LastWriteTime).TotalMinutes -lt 30) -and ((Get-Content $f -TotalCount 1) -match '^\s*applying')) { exit 0 }; exit 1"
if errorlevel 1 goto noapplycheck
>> data\watchdog-task.log echo [%date% %time%] watchdog (task) not started: an update is being applied
echo [%date% %time%] watchdog (task) not started: an update is being applied>> data\supervisor-console.log
exit /b 0
:noapplycheck
REM v261d: the task's own lines go to data\watchdog-task.log: while a server runs it holds server-console.log open and a second cmd cannot append to it
>> data\watchdog-task.log echo [%date% %time%] watchdog started by %NIG_BY%, user %USERNAME%, session %NIG_SESS%
echo [%date% %time%] watchdog started by %NIG_BY%, user %USERNAME%, session %NIG_SESS%>> data\supervisor-console.log
REM v260: explain the PREVIOUS stop (background; Get-WinEvent on the System log, no WMI, never delays the start)
set "NIG_MODE=prevstop"
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:NIG_SELF); iex $t.Substring($t.IndexOf('#'+'PS-PART'))" >nul 2>&1

:loop
REM v91.17.269: "is a supervisor already running" = data\run\supervisor.lock was refreshed in the last 20 s (it beats every 5 s) and its
REM pid is alive. The old check (does something answer on 8787) no longer fits: the proxy answers while a supervisor restarts.
REM Plain file and process checks: no WMI, no web request (the v75b Norton rule).
powershell -NoProfile -Command "$f='data\run\supervisor.lock'; try { if ((Test-Path $f) -and (((Get-Date)-(Get-Item $f).LastWriteTime).TotalSeconds -lt 20)) { $o = Get-Content -Raw $f | ConvertFrom-Json; if (Get-Process -Id ([int]$o.pid) -ErrorAction SilentlyContinue) { exit 0 } } } catch {}; exit 1"
if not errorlevel 1 goto othersup
echo [%date% %time%] starting the NIGRAAN supervisor (front proxy on %NPORT%, server on 8791/8792)>> data\supervisor-console.log
REM v260: the script path is absolute, so the process command line names THIS install
node "%CD%\scripts\wd\supervisor.mjs" >> data\supervisor-console.log 2>&1
set "RC=%errorlevel%"
if "%RC%"=="97" goto othersup
REM v269: 0 = a reload the admin scripts asked for (a new supervisor.mjs): start it again at once; the proxy and server keep running
if "%RC%"=="0" (
  echo [%date% %time%] supervisor reload: starting it again now>> data\supervisor-console.log
  goto loop
)
REM v260: the stop is written to data\stops.log first, in one line, before anything that a session end could interrupt
call :why %RC%
>> data\stops.log echo [%date% %time%] supervisor stopped, exit code %RC%: %WHY% (the proxy and the server keep running; the next supervisor adopts them)
if "%RC%"=="98" goto portbusy
echo [%date% %time%] supervisor exited with code %RC%, starting it again in 15 s>> data\supervisor-console.log
call :snapshot
REM v260: ping instead of timeout - timeout exits at once ("Input redirection is not supported") in a task with no console input
ping -n 16 127.0.0.1 >nul
goto loop

:othersup
>> data\watchdog-task.log echo [%date% %time%] a NIGRAAN supervisor already runs; this watchdog stops without starting another
echo [%date% %time%] a NIGRAAN supervisor already runs; this watchdog stops without starting another>> data\supervisor-console.log
exit /b 0

:portbusy
echo [%date% %time%] supervisor exited with code 98: port %NPORT% is held by another program>> data\supervisor-console.log
call :snapshot
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%NPORT%); $c.Close(); exit 0 } catch {}; exit 1"
if errorlevel 1 goto portgone
echo [%date% %time%] another server already answers on port %NPORT%; this watchdog stops. The keepalive task starts a new one if that server goes away.>> data\supervisor-console.log
exit /b 0

:portgone
echo [%date% %time%] nothing answers on port %NPORT% now; retrying in 60 s>> data\supervisor-console.log
ping -n 61 127.0.0.1 >nul
goto loop

REM v260: plain-words meaning of an exit code (one line; the crash file and the next start add the detail)
:why
set "WHY=code not in the known list - see the crash file"
if "%~1"=="1073807364" set "WHY=0x40010004 - ended from outside without a signal, the code Windows uses at sign-out, shutdown or restart; the next watchdog start names the Windows event"
if "%~1"=="-1" set "WHY=killed by Stop-Process / .NET Kill - restart_nigraan.ps1 or another script"
if "%~1"=="1" set "WHY=taskkill /F, or a Node fatal error printed to server-console.log"
if "%~1"=="0" set "WHY=clean exit after a signal - Ctrl+C, console window closed or SIGTERM; see the signal line in server.log"
if "%~1"=="98" set "WHY=port %NPORT% already in use by another server"
if "%~1"=="97" set "WHY=another supervisor already runs"
if "%~1"=="-1073741510" set "WHY=0xC000013A - Ctrl+C or console closed"
if "%~1"=="-1073740791" set "WHY=0xC0000409 - fail-fast, V8 fatal error or out of memory"
if "%~1"=="-1073741819" set "WHY=0xC0000005 - access violation"
if "%~1"=="-1073741571" set "WHY=0xC00000FD - stack overflow"
if "%~1"=="-1073741801" set "WHY=0xC0000017 - out of memory"
exit /b 0

:snapshot
set "TS=%date%_%time%"
set "TS=%TS:/=-%"
set "TS=%TS::=-%"
set "TS=%TS:.=-%"
set "TS=%TS:,=-%"
set "TS=%TS: =_%"
set "CRASH=data\crash-%TS%.log"
> "%CRASH%" echo NIGRAAN server stopped at %date% %time% - exit code %RC%
set "NIG_CODE=%RC%"
set "NIG_MODE=snapshot"
REM v91.17.194: the PowerShell part runs in the background (start /b) so a slow Get-CimInstance never delays the restart.
REM v260: tasklist moved into the background part as well (on 13 Oct 18:47 and 19:10 the crash files stopped right after the
REM "---- tasklist" header: nothing slow or killable runs in cmd any more before the restart).
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:NIG_SELF); iex $t.Substring($t.IndexOf('#'+'PS-PART'))" >> "%CRASH%" 2>&1
echo [%date% %time%] crash snapshot written to %CRASH%>> data\supervisor-console.log
exit /b 0

REM Everything below the marker is PowerShell, run by the start lines above (NIG_MODE = prevstop or snapshot). cmd never reaches it.
#PS-PART
$ErrorActionPreference = 'SilentlyContinue'
$data = $env:NIG_DATA; $now = Get-Date
function Section($t) { ''; '---- ' + $t }
# Windows events that end or freeze a user's programs. System log, readable by interactive and batch (task) logons; no WMI.
$EvIds = 41,42,107,109,506,507,1074,6005,6006,6008,7001,7002
function EvName($e) {
  switch ($e.Id) {
    41   { 'UNEXPECTED POWER LOSS / hard reset (Kernel-Power 41)' }
    42   { 'sleep / hibernate started (Kernel-Power 42)' }
    107  { 'resumed from sleep (Kernel-Power 107)' }
    109  { 'kernel shutdown started (Kernel-Power 109)' }
    506  { 'modern standby entered (Kernel-Power 506)' }
    507  { 'modern standby left (Kernel-Power 507)' }
    1074 { 'RESTART or SHUTDOWN requested (User32 1074): ' + ((($e.Message -replace '\s+', ' ')) -replace '^(.{0,260}).*$', '$1') }
    6005 { 'Windows started (EventLog 6005)' }
    6006 { 'clean shutdown (EventLog 6006)' }
    6008 { 'previous shutdown was unexpected (EventLog 6008)' }
    7001 { 'user signed in (Winlogon 7001)' }
    7002 { 'USER SIGNED OUT (Winlogon 7002)' }
    default { 'event ' + $e.Id + ' ' + $e.ProviderName }
  }
}
function Events($from) {
  try { @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $from; Id = $EvIds } -ErrorAction Stop | Sort-Object TimeCreated) }
  catch { if ($_.Exception.Message -notmatch 'No events were found') { $script:EvErr = ($_.Exception.Message -replace '\s+', ' ') }; @() }
}
function Verdict($ev) {
  if ($script:EvErr) { return 'unknown - the System log could not be read: ' + $script:EvErr }
  if ($ev | Where-Object { $_.Id -eq 1074 }) { return 'restart/shutdown (1074 names the program and reason)' }
  if ($ev | Where-Object { $_.Id -in 41,6008 }) { return 'power loss or hard reset' }
  if ($ev | Where-Object { $_.Id -in 6006,109,6005 }) { return 'shutdown/restart' }
  if ($ev | Where-Object { $_.Id -eq 7002 }) { return 'user sign-out' }
  if ($ev | Where-Object { $_.Id -in 42,506 }) { return 'sleep (the server is frozen, not ended, by sleep alone)' }
  return 'no Windows sign-out/shutdown/sleep event - ended by a program (see the crash file of that time)'
}

if ($env:NIG_MODE -eq 'prevstop') {
  # The previous server's last line in server.log (UTC) -> local time; every Windows event since then -> one line in stops.log
  $stops = Join-Path $data 'stops.log'
  # this PowerShell was created before the watchdog started node, so the new server's lines are all later than $born
  $born = (Get-Process -Id $PID).StartTime
  $lastT = $null
  foreach ($l in (Get-Content -LiteralPath (Join-Path $data 'server.log') -Tail 60)) {
    $m = [regex]::Match([string]$l, '^(\d{4}-\d\d-\d\dT[\d:.]+Z)')
    if ($m.Success) {
      $t = ([datetime]::Parse($m.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)).ToLocalTime()
      if ($t -lt $born) { $lastT = $t }
    }
  }
  if (-not $lastT) { return }
  $gap = [math]::Round(($now - $lastT).TotalMinutes, 1)
  if ($gap -lt 2) { return }   # the previous server was alive a moment ago: a normal watchdog restart, already in stops.log
  $ev = Events $lastT.AddMinutes(-1)
  $list = ($ev | ForEach-Object { '{0:HH:mm:ss} {1}' -f $_.TimeCreated, (EvName $_) }) -join ' | '
  if (-not $list) { $list = 'none' }
  $line = '[{0:yyyy-MM-dd HH:mm:ss}] watchdog start: previous server last wrote at {1:yyyy-MM-dd HH:mm:ss} ({2} min ago). Windows events since: {3}. Most likely cause: {4}' -f $now, $lastT, $gap, $list, (Verdict $ev)
  Add-Content -LiteralPath $stops -Value $line -Encoding UTF8
  return
}

# ---- NIG_MODE = snapshot (the server just stopped; this watchdog is alive)
$code = [string]$env:NIG_CODE
$meaning = @{
  '-1'          = 'KILLED BY ANOTHER PROGRAM. TerminateProcess with exit code -1 is what PowerShell Stop-Process and .NET Process.Kill() use - RESTART_NIGRAAN.bat, INSTALL_AUTOSTART.bat and REMOVE_AUTOSTART.bat stop the server this way. See the PowerShell commands below.'
  '1'           = 'exit code 1: taskkill /F, a kill() from Go or Node, or a Node fatal error printed to server-console.log'
  '0'           = 'clean exit after a signal (console closed, Ctrl+C, SIGTERM): see the signal line in server.log'
  '98'          = 'the port was already in use by another server (EADDRINUSE)'
  '3'           = 'abort(): a Node/V8 fatal error; its text is in server-console.log'
  '134'         = 'abort(): a Node/V8 fatal error; its text is in server-console.log'
  '1073807364'  = 'ENDED BY WINDOWS (0x40010004, DBG_TERMINATE_PROCESS): the code Windows gives console programs it ends at sign-out, shutdown or restart (no SIGHUP line in server.log = not a closed console window). See the Windows events below.'
  '-1073741819' = 'native crash: access violation (0xC0000005)'
  '-1073740791' = 'native crash: fail-fast (0xC0000409), usually a V8 fatal error or out of memory; see server-console.log'
  '-1073741571' = 'native crash: stack overflow (0xC00000FD)'
  '-1073741801' = 'out of memory (0xC0000017)'
  '-1073741510' = 'console closed / Ctrl+C (0xC000013A)'
}
Section 'meaning'
if ($meaning.ContainsKey($code)) { $meaning[$code] } else { 'exit code ' + $code + ' (not a known pattern)' }
Section 'Windows sign-out / shutdown / sleep events, last 10 minutes (System log)'
$ev = Events $now.AddMinutes(-10)
foreach ($e in $ev) { '{0:HH:mm:ss} {1}' -f $e.TimeCreated, (EvName $e) }
if (-not $ev.Count) { '(none)' }
'most likely cause: ' + (Verdict $ev)
Section 'node.exe processes (Get-Process, no WMI)'
Get-Process -Name node | ForEach-Object { '{0,6} {1,6} MB started {2:HH:mm:ss}  session {3}' -f $_.Id, [math]::Round($_.WorkingSet64 / 1MB), $_.StartTime, $_.SessionId }
Section ('processes now (' + $now.ToString('yyyy-MM-dd HH:mm:ss') + ')')
$names = 'node.exe','cmd.exe','powershell.exe','pwsh.exe','wscript.exe','cscript.exe','ollama.exe','ollama app.exe','schtasks.exe','taskkill.exe'
$procs = @(Get-CimInstance Win32_Process)
$byPid = @{}; foreach ($p in $procs) { $byPid[[int]$p.ProcessId] = $p }
foreach ($p in ($procs | Where-Object { $names -contains $_.Name } | Sort-Object CreationDate)) {
  $par = $byPid[[int]$p.ParentProcessId]; $pn = if ($par) { $par.Name } else { '(gone)' }
  '{0,6} parent {1,6} {2,-14} {3,-15} started {4:HH:mm:ss} {5,6} MB  {6}' -f $p.ProcessId, $p.ParentProcessId, $p.Name, $pn, $p.CreationDate, [math]::Round($p.WorkingSetSize / 1MB), $p.CommandLine
}
Section 'any process started in the last 3 minutes'
foreach ($p in ($procs | Where-Object { $_.CreationDate -gt $now.AddMinutes(-3) } | Sort-Object CreationDate)) {
  '{0,6} parent {1,6} {2,-18} started {3:HH:mm:ss}  {4}' -f $p.ProcessId, $p.ParentProcessId, $p.Name, $p.CreationDate, $p.CommandLine
}
Section 'PowerShell started in the last 10 minutes (Windows PowerShell log, event 400)'
try {
  $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Windows PowerShell'; Id = 400; StartTime = $now.AddMinutes(-10) } -ErrorAction Stop)
  foreach ($e in ($ev | Sort-Object TimeCreated)) {
    $m = [regex]::Match($e.Message, 'HostApplication=(.*)'); $cmd = if ($m.Success) { $m.Groups[1].Value.Trim() } else { '' }
    $flag = if ($cmd -match 'Stop-Process|\.Kill\(|taskkill|Terminate') { '  <== KILLS PROCESSES' } else { '' }
    '{0:HH:mm:ss}  {1}{2}' -f $e.TimeCreated, $cmd, $flag
  }
  if (-not $ev.Count) { '(none)' }
} catch { if ($_.Exception.Message -match 'No events') { '(none)' } else { '(could not read: ' + $_.Exception.Message + ')' } }
Section 'Windows error reports and application errors, last 15 minutes (node / ollama)'
try {
  $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $now.AddMinutes(-15) } -ErrorAction Stop | Where-Object { $_.Level -le 3 -or $_.Id -in 1000,1001,1002,1026 } | Where-Object { $_.Message -match 'node|ollama' })
  foreach ($e in $ev) { '{0:HH:mm:ss} id {1} {2}: {3}' -f $e.TimeCreated, $e.Id, $e.ProviderName, (($e.Message -replace '\s+', ' ').Substring(0, [math]::Min(400, ($e.Message -replace '\s+', ' ').Length))) }
  if (-not $ev.Count) { '(none)' }
} catch { if ($_.Exception.Message -match 'No events') { '(none)' } else { '(not readable: ' + $_.Exception.Message + ')' } }
Section 'low memory (Resource-Exhaustion-Detector 2004) and Defender events, last 30 minutes'
try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 2004; StartTime = $now.AddMinutes(-30) } -ErrorAction Stop); foreach ($e in $ev) { '{0:HH:mm:ss} LOW MEMORY: {1}' -f $e.TimeCreated, (($e.Message -replace '\s+', ' ').Substring(0, [math]::Min(500, ($e.Message -replace '\s+', ' ').Length))) } } catch { '(no low-memory event)' }
try { $ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Windows Defender/Operational'; StartTime = $now.AddMinutes(-30) } -ErrorAction Stop | Where-Object { $_.Id -in 1006,1007,1008,1015,1116,1117,1118,1119,1121,1122,1123,1124,1125,1126,1127,1128 }); foreach ($e in $ev) { '{0:HH:mm:ss} DEFENDER id {1}: {2}' -f $e.TimeCreated, $e.Id, (($e.Message -replace '\s+', ' ').Substring(0, [math]::Min(500, ($e.Message -replace '\s+', ' ').Length))) }; if (-not $ev.Count) { '(no Defender detection or block)' } } catch { if ($_.Exception.Message -match 'No events') { '(no Defender detection or block)' } else { '(Defender log not readable: ' + $_.Exception.Message + ')' } }
Section 'memory'
$os = Get-CimInstance Win32_OperatingSystem
'physical free {0:N1} of {1:N1} GB; commit free {2:N1} of {3:N1} GB' -f ($os.FreePhysicalMemory / 1MB), ($os.TotalVisibleMemorySize / 1MB), ($os.FreeVirtualMemory / 1MB), ($os.TotalVirtualMemorySize / 1MB)
Section 'last 20 lines of data\server.log'
Get-Content -LiteralPath (Join-Path $data 'server.log') -Tail 20
# keep the newest 30 crash files
Get-ChildItem -LiteralPath $data -Filter 'crash-*.log' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force
