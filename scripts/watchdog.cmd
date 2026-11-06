@echo off
REM v91.17.194: the watchdog moved to scripts\wd\watchdog.cmd (no Get-CimInstance before a start). This file stays for the
REM Startup-folder entry and older shortcuts and hands over to it.
call "%~dp0wd\watchdog.cmd"
