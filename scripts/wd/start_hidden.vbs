' v91.17.194 - starts scripts\wd\watchdog.cmd hidden, with no WMI query (on this laptop WMI queries took 4-15 minutes on 7 Oct).
' The watchdog checks port 8787 itself and stops if a server already answers.
Option Explicit
Dim fso, here
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run Chr(34) & here & "\watchdog.cmd" & Chr(34), 0, False
