' NIGRAAN keepalive (v91.17.75b, stuck-watchdog recovery v91.17.194). Run every 5 minutes by the scheduled task "NIGRAAN Keepalive".
' If no watchdog.cmd loop is running, start one hidden. The watchdog restarts the server whenever it stops, and (v75b)
' stops by itself if a NIGRAAN server process is already running, so a second watchdog never starts a second server.
' v75b: the v75 HTTP health check from this script was removed. Norton 360 Behavioral Protection flagged a script host
' making a web request and then starting a hidden process as IDP.Generic on 26 Sep and froze the server it started.
Option Explicit
Dim sh, fso, here, root, wmi, procs, p, found
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(here)
' v91.17.132 - while an update is being applied (deploy\_staging_v73\applying.flag reads "applying ...", written by APPLY_VNNN.bat,
' at most 30 minutes old) the watchdog is not started: the update stops the server on purpose and starts it again when it has
' finished (it then writes "done" into the flag).
Dim applying, af, afl, aft
applying = False
af = fso.GetParentFolderName(root) & "\_staging_v73\applying.flag"
If fso.FileExists(af) Then
  If DateDiff("n", fso.GetFile(af).DateLastModified, Now) < 30 Then
    On Error Resume Next
    Set aft = fso.OpenTextFile(af, 1)
    afl = aft.ReadLine
    aft.Close
    On Error GoTo 0
    If LCase(Left(Trim(afl), 8)) = "applying" Then applying = True
  End If
End If
' v91.17.194 - FAST START WITHOUT WMI. On 7 Oct 03:53-04:30 every WMI query on the laptop took 10 minutes or more (the update's
' stop step, this script's own process list and the watchdog's Get-CimInstance), so NIGRAAN stayed down. When data\server.log (a
' server heartbeat every minute) and data\server-console.log (every watchdog start, exit and wait) have both been silent for 15
' minutes and no update is being applied, nothing is serving: scripts\wd\watchdog.cmd is started at once, before any WMI query.
' It checks the port itself and stops if a server already answers, so a second server is never started.
' v91.17.260 (14 Oct 2026) - THE SERVER TASK OWNS THE WATCHDOG. When the scheduled task "NIGRAAN Server" exists
' (_admin\install_server_task.ps1: S4U = its own non-interactive logon session, no run-time limit, "do not start a new instance"),
' this script no longer starts a watchdog of its own and kills nothing itself: it only asks Task Scheduler to run that task. While
' the task's watchdog is running the request does nothing (IgnoreNew); when it is not running, the task starts it in its own session,
' which a sign-out, a closed console or this task's 4-minute limit cannot end.
' A STUCK task watchdog (IgnoreNew would then never start a new one): server.log and server-console.log both silent for 15+ minutes
' on 3 keepalive runs in a row (a counter in data\keepalive-silent.txt, so the first runs after a long sleep - when the logs are old
' only because the laptop slept - never count as stuck). Then Task Scheduler ends THAT task (only the task's own watchdog and its
' server, which has written nothing for 15 minutes) and starts it again. No other process is touched.
Dim srvTask, silentN, sf
srvTask = (sh.Run("schtasks /Query /TN ""NIGRAAN Server""", 0, True) = 0)
If srvTask And Not applying Then
  sf = root & "\data\keepalive-silent.txt"
  silentN = 0
  If AgeMin(root & "\data\server.log") >= 15 And AgeMin(root & "\data\server-console.log") >= 15 Then
    On Error Resume Next
    If fso.FileExists(sf) Then silentN = CLng("0" & Trim(fso.OpenTextFile(sf, 1).ReadLine))
    Err.Clear
    silentN = silentN + 1
    fso.CreateTextFile(sf, True).WriteLine CStr(silentN)
    On Error GoTo 0
  ElseIf fso.FileExists(sf) Then
    On Error Resume Next
    fso.DeleteFile sf, True
    On Error GoTo 0
  End If
  If silentN >= 3 Then
    Note "keepalive: task 'NIGRAAN Server' wrote nothing for 15+ minutes on 3 runs in a row - ending that task and starting it again"
    sh.Run "schtasks /End /TN ""NIGRAAN Server""", 0, True
    On Error Resume Next
    fso.DeleteFile sf, True
    On Error GoTo 0
  End If
  sh.Run "schtasks /Run /TN ""NIGRAAN Server""", 0, True
End If
Dim fastStarted
fastStarted = srvTask
If Not srvTask And Not applying And fso.FileExists(here & "\wd\watchdog.cmd") Then
  If AgeMin(root & "\data\server.log") >= 15 And AgeMin(root & "\data\server-console.log") >= 15 Then
    Note "keepalive: no server heartbeat and no watchdog line for 15+ minutes - starting scripts\wd\watchdog.cmd (no WMI query first)"
    sh.Run Chr(34) & here & "\wd\watchdog.cmd" & Chr(34), 0, False
    fastStarted = True
  End If
End If
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set procs = wmi.ExecQuery("SELECT ProcessId, CommandLine, CreationDate FROM Win32_Process WHERE Name='cmd.exe'")
found = False
For Each p In procs
  If Not IsNull(p.CommandLine) Then
    If InStr(1, p.CommandLine, "watchdog.cmd", vbTextCompare) > 0 Then found = True
  End If
Next
' v91.17.194 - a STUCK watchdog. On 7 Oct 04:03 the v193 update restarted NIGRAAN but the watchdog hung in its first PowerShell
' Get-CimInstance call (the same calls had taken 10 minutes in the update's stop step) and never started the server, while this script
' saw "a watchdog is running" and did nothing. Now: when a watchdog has run for at least 15 minutes and neither data\server.log (the
' server writes a heartbeat every minute) nor data\server-console.log (the watchdog writes every start, exit and wait) changed for
' 15 minutes, that watchdog is stuck: its non-node children and the watchdog itself are stopped and a new one is started. A running
' server is never stopped here. No web request is made (the v75b Norton rule).
If found And Not applying And Not fastStarted Then
  If AgeMin(root & "\data\server.log") >= 15 And AgeMin(root & "\data\server-console.log") >= 15 Then
    Dim w, kids, k, stuck
    stuck = 0
    For Each w In procs
      If Not IsNull(w.CommandLine) Then
        If InStr(1, w.CommandLine, "watchdog.cmd", vbTextCompare) > 0 And WmiAgeMin(w.CreationDate) >= 15 Then
          Set kids = wmi.ExecQuery("SELECT ProcessId, Name FROM Win32_Process WHERE ParentProcessId=" & w.ProcessId)
          For Each k In kids
            ' v260: only the watchdog's own helpers - never node.exe and never conhost.exe (ending the console host ends every
            ' program attached to that console, the server included)
            If InStr(1, "|powershell.exe|tasklist.exe|timeout.exe|ping.exe|", "|" & LCase(k.Name) & "|", vbBinaryCompare) > 0 Then
              On Error Resume Next
              k.Terminate
              On Error GoTo 0
            End If
          Next
          On Error Resume Next
          w.Terminate
          On Error GoTo 0
          Note "keepalive: watchdog pid " & w.ProcessId & " was stuck (no server heartbeat and no watchdog line for 15+ minutes) - stopped it"
          stuck = stuck + 1
        End If
      End If
    Next
    If stuck > 0 Then found = False
  End If
End If
' v91.17.194 - the watchdog started is scripts\wd\watchdog.cmd: it checks for a running server by its port, not by Get-CimInstance.
Dim wdcmd
wdcmd = here & "\wd\watchdog.cmd"
If Not fso.FileExists(wdcmd) Then wdcmd = here & "\watchdog.cmd"
If Not found And Not applying And Not fastStarted And Not srvTask Then
  Note "keepalive: no watchdog is running - starting one"
  StartDetached wdcmd
End If

' v91.17.165 - a new LEARN_ALL.bat arrives as LEARN_ALL.next.bat (a batch file must not be replaced while cmd is running it).
' It is copied over LEARN_ALL.bat only when no LEARN_ALL is running and the two differ; the old one is kept as LEARN_ALL.prev.bat.
Dim lnext, lrun, lp
lnext = root & "\LEARN_ALL.next.bat"
If fso.FileExists(lnext) Then
  lrun = False
  For Each lp In procs
    If Not IsNull(lp.CommandLine) Then
      If InStr(1, lp.CommandLine, "LEARN_ALL", vbTextCompare) > 0 Then lrun = True
    End If
  Next
  If Not lrun Then
    On Error Resume Next
    Dim lt1, lt2
    lt1 = fso.OpenTextFile(lnext, 1).ReadAll
    lt2 = fso.OpenTextFile(root & "\LEARN_ALL.bat", 1).ReadAll
    If Err.Number = 0 And lt1 <> lt2 Then
      fso.CopyFile root & "\LEARN_ALL.bat", root & "\LEARN_ALL.prev.bat", True
      fso.CopyFile lnext, root & "\LEARN_ALL.bat", True
      If Err.Number = 0 Then Note "keepalive: LEARN_ALL.bat updated from LEARN_ALL.next.bat (old one kept as LEARN_ALL.prev.bat)"
    End If
    Err.Clear
    On Error GoTo 0
  End If
End If

' v91.17.101 - hands-free deploy. The cloud build writes an update into deploy\_staging_v73\vNNN\ and, LAST, the one-line file
' deploy\_staging_v73\READY_APPLY.txt holding "NNN". Every 5 minutes this script checks it once: if vNNN\APPLY_VNNN.bat exists and
' applied_vNNN.txt does not, it writes applied_vNNN.txt first (so it never runs twice) and starts the APPLY script, which stops the
' watchdog and server, copies the files, checks the build and starts NIGRAAN again. Only a 2-4 digit version and a bat inside the
' staging folder are accepted; nothing is downloaded here and no web request is made (the v75b Norton rule).
Dim staging, ready, ver, bat, done, tf
staging = fso.GetParentFolderName(root) & "\_staging_v73"
ready = staging & "\READY_APPLY.txt"
' v91.17.132 - ONE FILE PER UPDATE. An update can also arrive as a single file deploy\_staging_v73\NIGRAAN_vNNN.zip (the cloud build
' sends one file instead of twenty). If its applied_vNNN.txt does not exist, the zip is unpacked with Windows' own tar into the staging
' folder (it holds vNNN\APPLY_VNNN.bat and the files) and the update runs exactly as below. Nothing is downloaded; no web request.
Dim f2, nm, zver, zbest, inst
zbest = ""
' v91.17.154 - never apply an update older than (or equal to) the installed build. On 4 Oct 14:09 the old packages v134-v151
' re-ran together and v134 was copied last, which put the 3 Oct code back. The installed build is the last part of
' "version" in nigraan-local\package.json (91.17.NNN).
inst = InstalledBuild()
If fso.FolderExists(staging) Then
  For Each f2 In fso.GetFolder(staging).Files
    nm = f2.Name
    If LCase(Left(nm, 9)) = "nigraan_v" And LCase(Right(nm, 4)) = ".zip" Then
      zver = Mid(nm, 10, Len(nm) - 13)
      If Len(zver) >= 2 And Len(zver) <= 4 And IsNumeric(zver) Then
        If Not fso.FileExists(staging & "\applied_v" & zver & ".txt") And CLng(zver) > inst Then
          If zbest = "" Then
            zbest = zver
          ElseIf CLng(zver) > CLng(zbest) Then
            zbest = zver
          End If
        End If
      End If
    End If
  Next
End If
If zbest <> "" Then
  If Not fso.FileExists(staging & "\v" & zbest & "\APPLY_V" & zbest & ".bat") Then
    Note "keepalive: unpacking NIGRAAN_v" & zbest & ".zip"
    sh.Run "cmd /c tar -xf " & Chr(34) & staging & "\NIGRAAN_v" & zbest & ".zip" & Chr(34) & " -C " & Chr(34) & staging & Chr(34), 0, True
  End If
  Set tf = fso.CreateTextFile(ready, True)
  tf.WriteLine zbest
  tf.Close
End If
If fso.FileExists(ready) Then
  On Error Resume Next
  Set tf = fso.OpenTextFile(ready, 1)
  ver = Trim(tf.ReadLine)
  tf.Close
  On Error GoTo 0
  If Len(ver) >= 2 And Len(ver) <= 4 And IsNumeric(ver) Then
    bat = staging & "\v" & ver & "\APPLY_V" & ver & ".bat"
    done = staging & "\applied_v" & ver & ".txt"
    If fso.FileExists(bat) And Not fso.FileExists(done) And CLng(ver) > inst Then
      Set tf = fso.CreateTextFile(done, True)
      tf.WriteLine "started " & Now & " by keepalive.vbs"
      tf.Close
      Note "keepalive: READY_APPLY v" & ver & " - running " & bat
      sh.Run "cmd /c " & Chr(34) & Chr(34) & bat & Chr(34) & Chr(34), 0, False
    End If
  End If
End If

Function InstalledBuild()
  Dim t, m, rx
  InstalledBuild = 0
  On Error Resume Next
  Set t = fso.OpenTextFile(root & "\package.json", 1)
  m = t.ReadAll
  t.Close
  Set rx = New RegExp
  rx.Pattern = """version""\s*:\s*""\d+\.\d+\.(\d+)"
  If rx.Test(m) Then InstalledBuild = CLng(rx.Execute(m)(0).SubMatches(0))
  On Error GoTo 0
End Function

Function AgeMin(path)
  AgeMin = 99999
  On Error Resume Next
  If fso.FileExists(path) Then AgeMin = DateDiff("n", fso.GetFile(path).DateLastModified, Now)
  On Error GoTo 0
End Function

' WMI CreationDate "yyyymmddHHMMSS.mmmmmm+UUU" (local time) -> minutes ago; 0 when it cannot be read (never treated as stuck)
Function WmiAgeMin(cd)
  WmiAgeMin = 0
  On Error Resume Next
  If Not IsNull(cd) Then
    Dim d
    d = DateSerial(CInt(Mid(cd, 1, 4)), CInt(Mid(cd, 5, 2)), CInt(Mid(cd, 7, 2))) + TimeSerial(CInt(Mid(cd, 9, 2)), CInt(Mid(cd, 11, 2)), CInt(Mid(cd, 13, 2)))
    If Err.Number = 0 Then WmiAgeMin = DateDiff("n", d, Now)
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub Note(msg)
  Dim f
  On Error Resume Next
  Set f = fso.OpenTextFile(root & "\data\server-console.log", 8, True)
  f.WriteLine "[" & Now & "] " & msg
  f.Close
End Sub
' v91.17.255 (12 Oct 2026, B-8) - THE WATCHDOG IS STARTED OUTSIDE THIS TASK. The server stopped at 03:47, 03:57 and 10:33 PKT on 12 Oct
' with exit code 1073807364 (0x40010004, the process was ended from outside), each time within a minute of the 4-minute run limit
' (PT4M) of a keepalive run started on the 5-minute cycle. When a run is slow (WMI queries under heavy disk load) Task Scheduler
' ends it, and the processes that run started - a watchdog and the server under it - end with it (the timing fits; Windows keeps
' no task history here to prove it). The watchdog
' is now created through WMI (Win32_Process.Create), which makes it a process of its own outside the task, so ending a slow
' keepalive run no longer takes NIGRAAN down. If WMI refuses, the old way is used and the log says so.
Sub StartDetached(cmdPath)
  Dim svc, cfg, wp, newPid, rc
  rc = -1
  On Error Resume Next
  Set svc = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")
  Set cfg = svc.Get("Win32_ProcessStartup").SpawnInstance_
  cfg.ShowWindow = 0
  Set wp = svc.Get("Win32_Process")
  rc = wp.Create("cmd.exe /c " & Chr(34) & cmdPath & Chr(34), fso.GetParentFolderName(cmdPath), cfg, newPid)
  If Err.Number <> 0 Or rc <> 0 Then
    Err.Clear
    On Error GoTo 0
    sh.Run Chr(34) & cmdPath & Chr(34), 0, False
    Note "keepalive: WMI could not start the watchdog (code " & rc & "); started it from this task instead"
  Else
    On Error GoTo 0
    Note "keepalive: watchdog started outside the task (pid " & newPid & ")"
  End If
End Sub
