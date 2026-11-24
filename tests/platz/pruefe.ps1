# pruefe.ps1 -Maus mitte|kante -Erwartet 0|80 [-Warten 3500]: Maus auf Schirm 1 setzen, warten, Reservierung + Testfenster prüfen
param([string]$Maus, [int]$Erwartet, [int]$Warten = 3500)
. "$PSScriptRoot\fenster-lib.ps1"
$m = [FW]::Alle()[1]; $x = [int](($m.mon.L + $m.mon.R) / 2); $h = [FW]::Finde("OXPTEST-M1")
if ($Maus -eq "kante") { Maus $x ($m.mon.B - 1) } else { Maus $x ([int](($m.mon.T + $m.mon.B) / 2)) }
Start-Sleep -Milliseconds $Warten
$b = [FW]::Alle()[1]; $res = $b.mon.B - $b.work.B; $s = [FW]::Sichtbar($h)
$okRes = if ($Erwartet -eq 0) { $res -eq 0 } else { $res -ge 40 }
$okFenster = [math]::Abs($s.B - $b.work.B) -le 2
"{0}: reserviert {1} px (erwartet {2}) {3}, Fenster unten {4}/Arbeitsfläche {5} {6}" -f $Maus, $res, $Erwartet, $(if ($okRes) { "ok" } else { "FEHLER" }), $s.B, $b.work.B, $(if ($okFenster) { "ok" } else { "FEHLER" })
