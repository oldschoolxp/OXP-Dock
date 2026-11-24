# fenster-test.ps1 -Titel X -Nr 0 -Runden 10 -Pause 3500 [-Schnell]
# Klappt das Dock auf dem Bildschirm Nr (von links) mit der Maus aus und ein und prüft jedes Mal, ob das (maximierte)
# Testfenster mit der Arbeitsfläche mitwächst. Gibt pro Runde die Zeiten und am Ende eine Zusammenfassung aus.
param([string]$Titel, [int]$Nr = 0, [int]$Runden = 10, [int]$Pause = 3500, [switch]$Schnell, [switch]$Normal)
. "$PSScriptRoot\fenster-lib.ps1"
$alt = New-Object FW+POINT; [void][FW]::GetCursorPos([ref]$alt)
$h = [FW]::Finde($Titel)
if ($h -eq [IntPtr]::Zero) { "Testfenster '$Titel' nicht gefunden"; exit 1 }
$m = [FW]::Alle()[$Nr]
$mitteX = [int](($m.mon.L + $m.mon.R) / 2); $mitteY = [int](($m.mon.T + $m.mon.B) / 2); $kanteY = $m.mon.B - 1
$fehler = 0; $maxAus = 0; $maxEin = 0; $zeilen = @()
function Zustand() {
  $s = [FW]::Sichtbar($h); $i = [FW]::Bildschirm($h)
  return @{ fensterUnten = $s.B; fensterOben = $s.T; arbeitUnten = $i.work.B; schirmUnten = $i.mon.B; max = [FW]::IsZoomed($h) }
}
function Warten($bedingung, $maxMs) {
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalMilliseconds -lt $maxMs) { $z = Zustand; if (& $bedingung $z) { return [int]((Get-Date) - $t0).TotalMilliseconds }; Start-Sleep -Milliseconds 20 }
  return -1
}
Maus $mitteX $mitteY; Start-Sleep -Milliseconds 4500
$vorher = Zustand
"Start: Fenster unten $($vorher.fensterUnten), Arbeitsfläche unten $($vorher.arbeitUnten), Bildschirm unten $($vorher.schirmUnten), maximiert=$($vorher.max)"
for ($r = 1; $r -le $Runden; $r++) {
  # ausklappen
  Maus $mitteX $kanteY
  if ($Normal) { $tAus = Warten { param($z) $z.arbeitUnten -lt $z.schirmUnten } 4000 } else { $tAus = Warten { param($z) $z.arbeitUnten -lt $z.schirmUnten -and [math]::Abs($z.fensterUnten - $z.arbeitUnten) -le 2 } 4000 }
  Start-Sleep -Milliseconds 700
  $zAus = Zustand
  $okAus = if ($Normal) { $zAus.arbeitUnten -lt $zAus.schirmUnten } else { [math]::Abs($zAus.fensterUnten - $zAus.arbeitUnten) -le 2 -and $zAus.arbeitUnten -lt $zAus.schirmUnten }
  # einklappen
  if ($Schnell) { Start-Sleep -Milliseconds 150 }
  Maus $mitteX $mitteY
  if ($Normal) { $tEin = Warten { param($z) $z.arbeitUnten -eq $z.schirmUnten } 6000 } else { $tEin = Warten { param($z) $z.arbeitUnten -eq $z.schirmUnten -and [math]::Abs($z.fensterUnten - $z.schirmUnten) -le 2 } 6000 }
  Start-Sleep -Milliseconds ($Pause - 1500)
  $zEin = Zustand
  $okEin = if ($Normal) { $zEin.arbeitUnten -eq $zEin.schirmUnten } else { [math]::Abs($zEin.fensterUnten - $zEin.schirmUnten) -le 2 -and $zEin.arbeitUnten -eq $zEin.schirmUnten }
  if ($tAus -gt $maxAus) { $maxAus = $tAus }; if ($tEin -gt $maxEin) { $maxEin = $tEin }
  $ok = $okAus -and $okEin -and $tAus -ge 0 -and $tEin -ge 0
  if (-not $ok) { $fehler++ }
  "{0,2}: aus {1,5} ms (Fenster {2}/Arbeit {3}/Schirm {4}) {5} | ein {6,5} ms (Fenster {7}/Arbeit {8}) {9} {10}" -f $r, $tAus, $zAus.fensterUnten, $zAus.arbeitUnten, $zAus.schirmUnten, $(if ($okAus) { "ok" } else { "FEHLER" }), $tEin, $zEin.fensterUnten, $zEin.arbeitUnten, $(if ($okEin) { "ok" } else { "FEHLER" }), $(if ($ok) { "" } else { "<<<" })
}
Maus $alt.X $alt.Y
"ERGEBNIS: $fehler von $Runden Runden fehlerhaft; längstes Ausklappen $maxAus ms, längstes Einklappen $maxEin ms"
