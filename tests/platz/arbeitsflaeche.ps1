# Gibt je Bildschirm (von links) Arbeitsfläche-unten und reservierte Pixel aus: arbeitsflaeche.ps1 [-Mit Titel1,Titel2]
param([string[]]$Titel = @())
. "$PSScriptRoot\fenster-lib.ps1"
$i = 0; $zeile = @()
foreach ($m in [FW]::Alle()) { $zeile += ("Schirm {0}: reserviert {1} px" -f $i, ($m.mon.B - $m.work.B)); $i++ }
$zeile -join " | "
foreach ($t in $Titel) { $h = [FW]::Finde($t); if ($h -ne [IntPtr]::Zero) { $s = [FW]::Sichtbar($h); $b = [FW]::Bildschirm($h); "  $t : unten $($s.B), Arbeitsfläche $($b.work.B), Bildschirm $($b.mon.B), maximiert=$([FW]::IsZoomed($h))" } }
