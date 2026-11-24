param([int]$dockPid, [int]$Sekunden = 60, [int]$Seed = 5)
. "$PSScriptRoot\fenster-lib.ps1"
$ms = [FW]::Alle(); $zufall = New-Object System.Random($Seed)
$t0 = Get-Date; $naechster = 2; $n = 0; $entfernt = 0
while (((Get-Date) - $t0).TotalSeconds -lt $Sekunden) {
  $i = $zufall.Next(0, $ms.Count); $m = $ms[$i]; $x = $m.mon.L + $zufall.Next(300, ($m.mon.R - $m.mon.L - 300))
  if ($zufall.Next(0, 2) -eq 0) { Maus $x ($m.mon.B - 1) } else { Maus $x ([int](($m.mon.T + $m.mon.B) / 2)) }
  $n++
  if (((Get-Date) - $t0).TotalSeconds -gt $naechster) { & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\appbar-fremd.ps1" -Was remove -DockPid $dockPid | Out-Null; $entfernt++; $naechster += $zufall.Next(3, 9) }
  Start-Sleep -Milliseconds $zufall.Next(100, 1500)
}
"Bewegungen: $n, Anmeldung $entfernt× entfernt"
