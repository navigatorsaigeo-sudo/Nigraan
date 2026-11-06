# NIGRAAN v@FULL@ (@DATE@) - full UNDO of DEPLOY_V@VU@ (back to the version that was there: v@BASE@, as the deploy recorded), with no gap and no administrator rights. Run from ROLLBACK_V@VU@.bat, or
# by DEPLOY_V@VU@ itself when a step fails. Reads the record the deploy wrote: D:\NIGRAAN\_admin\step2\v@VU@\bak\DEPLOY_V@VU@_FILES.txt
#   1 puts back every REPLACED file from its .b@VD@.bak copy (the v@VD@ file is kept as <name>.v@VD@.bak)
#   2 moves every NEW file of v@VD@ under nigraan-local and _admin to D:\NIGRAAN\_admin\archive\v@VU@_rollback\ (never deleted)
#   3 moves the REMOVED items back from D:\NIGRAAN\_admin\archive\v@VU@\
#   3b puts back build\build80.sh if the deploy made its path ROOT-derived
#   3c moves back the class-a and class-i items MOVE_UNUSED_V@VU@ moved (from _to_delete\v@VU@ and inputs\places_src; the base build reads them)
#   4 puts back NIGRAAN_STATUS_REPORT.md from .bak_v@VU@ if the deploy appended the v@VD@ entry
#   5 if a swap loaded the v@VD@ code: one more swap through the supervisor (the deploy_swap.ps1 it has just put back; no gap), then waits
#     until http://127.0.0.1:8787/health is warm and says it is no longer @FULL@
#   6 the record is renamed (*.rolledback-<time>.txt) so a later deploy can run. ds2 offline files are left (the server does not use them).
# Exit: 0 rolled back, 1 a step failed (see the log). Log: D:\NIGRAAN\_admin\deploy_v@VU@.log (times PKT).
param([string]$Root = 'D:\NIGRAAN', [string]$Pkg = '', [string]$Base = 'http://127.0.0.1:8787', [string]$Why = 'ROLLBACK_V@VU@.bat')
$ErrorActionPreference = 'Continue'
function J($a, $b) { [IO.Path]::Combine($a, ($b -replace '[\\/]', [string][IO.Path]::DirectorySeparatorChar)) }
if (-not $Pkg) { $Pkg = J $Root '_admin\step2\v@VU@' }
$LIST = J $Pkg 'bak\DEPLOY_V@VU@_FILES.txt'
$LOG = J $Root '_admin\deploy_v@VU@.log'
$RBARCH = J $Root '_admin\archive\v@VU@_rollback'
function Pkt { [DateTime]::UtcNow.AddHours(5) }
function Say($m) { $l = '[{0:yyyy-MM-dd HH:mm:ss} PKT] {1}' -f (Pkt), ('ROLLBACK ' + $m); Write-Host $l; try { Add-Content -LiteralPath $LOG -Value $l -Encoding ASCII } catch {} }
function Get-Url($path, [int]$timeoutMs = 15000) {
  try { $q = [Net.HttpWebRequest]::Create($Base + $path); $q.Proxy = $null; $q.Timeout = $timeoutMs; $r = $q.GetResponse()
    $sr = New-Object IO.StreamReader($r.GetResponseStream()); $t = $sr.ReadToEnd(); $code = [int]$r.StatusCode; $r.Close(); $j = $null; try { $j = $t | ConvertFrom-Json } catch {}; return @{ status = $code; json = $j } }
  catch { return @{ status = 0; json = $null } }
}
Say ("==== start ({0}); install {1}" -f $Why, $Root)
if (-not (Test-Path -LiteralPath $LIST)) { Say "nothing recorded ($LIST is missing): DEPLOY_V@VU@ copied nothing."; exit 0 }
$PREV = '@BASE@'; try { $bl = @(Get-Content -LiteralPath $LIST | Where-Object { $_ -match '^BASE\t' } | Select-Object -First 1); if ($bl.Count) { $PREV = ($bl[0] -split "`t")[1] } } catch {}   # v@VD@: the base the deploy found
$E = @(Get-Content -LiteralPath $LIST | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { $p = $_.Split("`t"); [pscustomobject]@{ kind = $p[0]; a = $(if ($p.Count -gt 1) { $p[1] } else { '' }); b = $(if ($p.Count -gt 2) { $p[2] } else { '' }) } })
if (-not $E.Count) { Say 'the record is empty: nothing to undo.'; exit 0 }
$bad = 0
# 1 replaced files (deploy_swap.ps1 may already have put them back after a failed swap: then the file equals its .bak and nothing changes)
foreach ($x in @($E | Where-Object { $_.kind -eq 'REPLACED' })) {
  $dst = J $Root $x.a; $bak = $dst + '.b@VD@.bak'
  try { if (-not (Test-Path -LiteralPath $bak)) { throw 'the .b@VD@.bak copy is missing' }
    if ((Test-Path -LiteralPath $dst) -and ((Get-FileHash -LiteralPath $dst).Hash -eq (Get-FileHash -LiteralPath $bak).Hash)) { Say ("already the v{0} file: {1}" -f $PREV, $x.a); continue }
    if (Test-Path -LiteralPath $dst) { Copy-Item -LiteralPath $dst -Destination ($dst + '.v@VD@.bak') -Force -ErrorAction Stop }
    Copy-Item -LiteralPath $bak -Destination $dst -Force -ErrorAction Stop; Say ("put back {0}" -f $x.a) }
  catch { $bad++; Say ("could NOT put back {0}: {1}" -f $x.a, $_.Exception.Message) }
}
# 2 new files moved aside (deploy_swap.ps1 renames them *.v@VD@-rolled-back after a failed swap; both forms are moved)
foreach ($x in @($E | Where-Object { $_.kind -eq 'NEW' })) {
  foreach ($src in @((J $Root $x.a), ((J $Root $x.a) + '.v@VD@-rolled-back'))) {
    if (-not (Test-Path -LiteralPath $src)) { continue }
    $dst = J $RBARCH ($src.Substring($Root.TrimEnd('\', '/').Length).TrimStart('\', '/')); if (Test-Path -LiteralPath $dst) { $dst = $dst + '.' + (Get-Date -Format 'yyyyMMddHHmmss') }
    try { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null; Move-Item -LiteralPath $src -Destination $dst -ErrorAction Stop; Say ("new file moved aside: {0}" -f $x.a) }
    catch { $bad++; Say ("could NOT move aside {0}: {1}" -f $x.a, $_.Exception.Message) }
  }
}
# 3 removed items back
foreach ($x in @($E | Where-Object { $_.kind -eq 'MOVED' })) {
  $src = J $Root $x.a
  try { if (Test-Path -LiteralPath $src) { Say ("{0} is already there" -f $x.a); continue }; Move-Item -LiteralPath $x.b -Destination $src -ErrorAction Stop; Say ("moved back {0}" -f $x.a) }
  catch { $bad++; Say ("could NOT move back {0}: {1}" -f $x.a, $_.Exception.Message) }
}
# 3b v@VD@: build\build80.sh back from its .b@VD@.bak copy if the deploy edited it
foreach ($x in @($E | Where-Object { $_.kind -eq 'EDITED' })) {
  try { Copy-Item -LiteralPath (J $Root $x.b) -Destination (J $Root $x.a) -Force -ErrorAction Stop; Say ("put back {0}" -f $x.a) } catch { $bad++; Say ("could NOT put back {0}: {1}" -f $x.a, $_.Exception.Message) }
}
# 3c v91.17.283.18: items MOVE_UNUSED_V@VU@ moved that the base build reads (classes a and i of its manifest) are moved back from where it put them
#    (D:\NIGRAAN\_to_delete\v@VU@ or D:\NIGRAAN\inputs\places_src; column moved_to)
$MU = J $Root ('_to_delete\v@VU@\MANIFEST_UNUSED_V@VU@.tsv'); if (-not (Test-Path -LiteralPath $MU)) { $MU = J $Root ('inputs\places_src\MANIFEST_UNUSED_V@VU@.tsv') }
if (Test-Path -LiteralPath $MU) {
  foreach ($l in @(Get-Content -LiteralPath $MU | Select-Object -Skip 1)) { $c = $l.Split("`t"); if ($c.Count -lt 3 -or ($c[2] -ne 'a' -and $c[2] -ne 'i')) { continue }
    $src = J $Root $c[0]; $from = $(if ($c.Count -ge 7 -and $c[6]) { J $Root $c[6] } else { J $Root ('_to_delete\v@VU@\' + $c[0]) })
    try { if (Test-Path -LiteralPath $src) { continue }; if (-not (Test-Path -LiteralPath $from)) { $bad++; Say ("not in _to_delete: {0}" -f $c[0]); continue }
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $src) | Out-Null; Move-Item -LiteralPath $from -Destination $src -ErrorAction Stop; Say ("moved back from _to_delete: {0}" -f $c[0]) }
    catch { $bad++; Say ("could NOT move back {0}: {1}" -f $c[0], $_.Exception.Message) } }
}
# 4 status report
if (@($E | Where-Object { $_.kind -eq 'STATUS' }).Count) {
  $sr = J $Root 'NIGRAAN_STATUS_REPORT.md'
  try { Copy-Item -LiteralPath ($sr + '.bak_v@VU@') -Destination $sr -Force -ErrorAction Stop; Say 'NIGRAAN_STATUS_REPORT.md put back from .bak_v@VU@' } catch { $bad++; Say ('status report not put back: ' + $_.Exception.Message) }
}
# 5 one more swap if the v@VD@ code was loaded
$h = Get-Url '/health'
$loaded = @($E | Where-Object { $_.kind -eq 'SWAP' -and $_.a -eq '0' }).Count -gt 0 -or ($h.json -and [string]$h.json.serviceVersion -like '@FULL@*')
if ($loaded) {
  $sw = J $Root '_admin\deploy_swap.ps1'
  $psx = (Get-Process -Id $PID).Path; if (-not $psx) { $psx = 'powershell' }
  Say ('v@VD@ code was loaded: asking the supervisor for one more swap with the v{0} files (no gap)' -f $PREV)
  $o = & $psx -NoProfile -ExecutionPolicy Bypass -File $sw -Root $Root -Version $PREV -ProxyPort (([uri]$Base).Port) -Force 2>&1 | Out-String
  $rc = $LASTEXITCODE; ($o -split "`r?`n") | Where-Object { $_ } | ForEach-Object { Say ('  ' + $_) }
  if ($rc -ne 0) { $bad++; Say "the swap ended with exit $rc" }
  $t0 = Get-Date; $ok = $false
  while (((Get-Date) - $t0).TotalMinutes -lt 15) { $r = Get-Url '/health'; if ($r.status -eq 200 -and $r.json.warm -eq $true -and [string]$r.json.serviceVersion -notlike '@FULL@*') { $ok = $true; $h = $r; break }; Start-Sleep 3 }
  if ($ok) { Say ("health: warm, version {0}, server port {1}" -f $h.json.serviceVersion, $h.json.port) } else { $bad++; Say ('health did not show a warm v{0} server within 15 minutes' -f $PREV) }
} else {
  if ($h.status -eq 200) { Say ("no v@VD@ code was loaded; the running server (version {0}) never stopped" -f $h.json.serviceVersion) } else { $bad++; Say 'health does not answer' }
}
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
try { Rename-Item -LiteralPath $LIST -NewName ('DEPLOY_V@VU@_FILES.rolledback-' + $stamp + '.txt') -ErrorAction Stop } catch { Say ('record not renamed: ' + $_.Exception.Message) }
# v91.17.283 (WS3): the deploy journal says the install is back on the base (the supervisor then never restores on top of it)
try { $JOUR = J $Root 'nig\nigraan-local\data\run\deploy-journal.json'; $j = Get-Content -Raw -LiteralPath $JOUR -ErrorAction Stop | ConvertFrom-Json
  if ($j -and [string]$j.version -eq '@VD@' -and -not $bad) { $j.state = 'rolledback'; $j.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $tmp = $JOUR + '.' + $PID + '.tmp'; $b = (New-Object Text.UTF8Encoding($false)).GetBytes(($j | ConvertTo-Json -Depth 6))
    $fs = [IO.File]::Open($tmp, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None); try { $fs.Write($b, 0, $b.Length); $fs.Flush($true) } finally { $fs.Close() }
    Move-Item -LiteralPath $tmp -Destination $JOUR -Force; Say 'deploy journal: rolledback' } } catch {}
if ($bad) { Say "==== done with $bad problem(s): see above"; exit 1 }
Say ('==== done: v{0} is back' -f $PREV)
exit 0
