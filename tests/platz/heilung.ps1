param([int]$dockPid, [int]$Sekunden = 8)
. "$PSScriptRoot\fenster-lib.ps1"
$m = [FW]::Alle()[1]; $kx = [int](($m.mon.L + $m.mon.R) / 2)
$h = [FW]::Finde("OXPTEST-M1")
Maus $kx ($m.mon.B - 1); Start-Sleep -Milliseconds 2500
function Z() { $b = [FW]::Alle()[1]; $s = [FW]::Sichtbar($h); "reserviert $($b.mon.B - $b.work.B) px, Testfenster unten $($s.B)" }
"vorher: " + (Z)
& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\appbar-fremd.ps1" -Was remove -DockPid $dockPid | Out-Null
$t0 = Get-Date; $letzt = ""
while (((Get-Date) - $t0).TotalSeconds -lt $Sekunden) { $z = Z; if ($z -ne $letzt) { "{0,5} ms  {1}" -f [int]((Get-Date) - $t0).TotalMilliseconds, $z; $letzt = $z }; Start-Sleep -Milliseconds 50 }
Maus ($kx) ([int](($m.mon.T + $m.mon.B) / 2))
