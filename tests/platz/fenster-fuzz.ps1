# fenster-fuzz.ps1 -Sekunden 60 -Titel M0,M1,M2: bewegt die Maus zufällig zwischen Kanten und Mitten der Bildschirme
# (mit zufälligen Pausen 40–1800 ms) und prüft danach, ob alles wieder im Sollzustand ist.
param([int]$Sekunden = 60, [int]$Seed = 1)
. "$PSScriptRoot\fenster-lib.ps1"
$alt = New-Object FW+POINT; [void][FW]::GetCursorPos([ref]$alt)
$ms = [FW]::Alle(); $zufall = New-Object System.Random($Seed)
$titel = "OXPTEST-M0", "OXPTEST-M1", "OXPTEST-M2"
$fenster = @(); foreach ($t in $titel) { $fenster += [FW]::Finde($t) }
function Pruefen($erwartetReserviert, $name) {
  $fehler = @()
  for ($i = 0; $i -lt $ms.Count; $i++) {
    $m = [FW]::Alle()[$i]; $res = $m.mon.B - $m.work.B
    if ($erwartetReserviert[$i] -eq 0 -and $res -ne 0) { $fehler += "Schirm $i reserviert $res px, erwartet 0" }
    if ($erwartetReserviert[$i] -gt 0 -and ($res -lt 40)) { $fehler += "Schirm $i reserviert $res px, erwartet >0" }
    if ($fenster[$i] -ne [IntPtr]::Zero) {
      $s = [FW]::Sichtbar($fenster[$i]); if ([math]::Abs($s.B - $m.work.B) -gt 2) { $fehler += "Fenster $i unten $($s.B) statt Arbeitsfläche $($m.work.B)" }
    }
  }
  if ($fehler.Count) { Write-Host ("  $name FEHLER: " + ($fehler -join "; ")) } else { Write-Host "  $name ok" }
  return [int]$fehler.Count
}
$schlimm = 0; $t0 = Get-Date; $n = 0
while (((Get-Date) - $t0).TotalSeconds -lt $Sekunden) {
  $i = $zufall.Next(0, $ms.Count); $m = $ms[$i]; $x = $m.mon.L + $zufall.Next(300, ($m.mon.R - $m.mon.L - 300))
  $art = $zufall.Next(0, 3)
  if ($art -eq 0) { Maus $x ($m.mon.B - 1) } elseif ($art -eq 1) { Maus $x ($m.mon.T + $zufall.Next(300, 1500)) } else { Maus $x ($m.mon.B - $zufall.Next(2, 120)) }
  $n++; Start-Sleep -Milliseconds $zufall.Next(40, 1800)
}
"Zufallsbewegungen: $n"
# Ruhe: Maus in die Mitte von Schirm 1 → alles muss eingeklappt sein
Maus ([int](($ms[1].mon.L + $ms[1].mon.R) / 2)) ([int](($ms[1].mon.T + $ms[1].mon.B) / 2)); Start-Sleep -Seconds 6
$schlimm += Pruefen @(0, 0, 0) "nach Zufall, alles eingeklappt"
# Kante Schirm 1 → dort ausgeklappt
Maus ([int](($ms[1].mon.L + $ms[1].mon.R) / 2)) ($ms[1].mon.B - 1); Start-Sleep -Seconds 3
$schlimm += Pruefen @(0, 1, 0) "Schirm 1 ausgeklappt"
Maus ([int](($ms[1].mon.L + $ms[1].mon.R) / 2)) ([int](($ms[1].mon.T + $ms[1].mon.B) / 2)); Start-Sleep -Seconds 6
$schlimm += Pruefen @(0, 0, 0) "wieder eingeklappt"
Maus $alt.X $alt.Y
"ERGEBNIS: $schlimm Abweichungen"
