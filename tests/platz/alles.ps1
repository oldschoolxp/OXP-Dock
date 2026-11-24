# alles.ps1 - prüft den „Platz für Fenster“ des Docks mit echten Fenstern (Reservierung der Arbeitsfläche, Wächter,
# mehrere Bildschirme, schnelle Wechsel, Zufall, verlorene Anmeldung, Vollbild). Läuft mit einer KOPIE der Einstellungen.
# Aufruf (im Ordner tests\platz):  powershell -ExecutionPolicy Bypass -File alles.ps1 [-Kurz]
# Achtung: bewegt die Maus an die untere Bildschirmkante - während des Tests nicht benutzen (ca. 6 Minuten, mit -Kurz ca. 3).
param([switch]$Kurz)
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\fenster-lib.ps1"
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path
$electron = Join-Path $repo "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electron)) { "electron.exe nicht gefunden - erst 'npm install' im Repo ausführen"; exit 2 }
$profil = Join-Path $env:TEMP "oxpdock-platztest-profil"
Remove-Item $profil -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory $profil | Out-Null
$echt = Join-Path $env:APPDATA "oxp-dock"
foreach ($f in "einstellungen.json", "zeit-daten.json") { if (Test-Path "$echt\$f") { Copy-Item "$echt\$f" $profil } }
function Einstellung($autoHide, $platz) {
  $f = Join-Path $profil "einstellungen.json"
  $c = if (Test-Path $f) { Get-Content $f -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
  foreach ($kv in @{ autoHide = $autoHide; autoHidePlatz = $platz; allMonitors = $true; displayAus = [pscustomobject]@{}; displayScale = [pscustomobject]@{} }.GetEnumerator()) { $c | Add-Member -NotePropertyName $kv.Key -NotePropertyValue $kv.Value -Force }
  [IO.File]::WriteAllText($f, ($c | ConvertTo-Json -Depth 30), (New-Object Text.UTF8Encoding $false)) # ohne BOM
}
function Dock-Starten() {
  $env:OXP_DOCK_DATA = $profil; $env:OXP_DOCK_LIZENZ = "test"
  $p = Start-Process $electron -ArgumentList "`"$repo`"" -WorkingDirectory $repo -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 15; return $p
}
function Dock-Beenden($p) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {}; Start-Sleep -Seconds 2 }
$ergebnisse = [ordered]@{}
function Lauf($name, $skript, $argumente) {
  Write-Host ("== " + $name)
  $aus = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $skript) @argumente 2>&1 | Out-String
  $aus.TrimEnd().Split("`n") | Select-Object -Last 4 | ForEach-Object { Write-Host ("   " + $_.TrimEnd()) }
  $fehler = ([regex]::Matches($aus, "FEHLER")).Count + ([regex]::Matches($aus, "ERGEBNIS: [1-9]")).Count
  $ergebnisse[$name] = $fehler
}
$anzahl = [FW]::Alle().Count
"Bildschirme: $anzahl"
$dock = $null; $testfenster = @()
try {
  Einstellung $true $true
  $dock = Dock-Starten
  for ($i = 0; $i -lt $anzahl; $i++) { $testfenster += Start-Process $electron -ArgumentList "`"$PSScriptRoot\testfenster.cjs`"", "OXPTEST-M$i", "$i", "max" -PassThru }
  Start-Sleep -Seconds 8
  $runden = if ($Kurz) { 3 } else { 8 }
  for ($i = 0; $i -lt $anzahl; $i++) { Lauf "Ausklappen/Einklappen Bildschirm $i" "fenster-test.ps1" @("-Titel", "OXPTEST-M$i", "-Nr", "$i", "-Runden", "$runden") }
  Lauf "Schnelle Wechsel" "fenster-test.ps1" @("-Titel", "OXPTEST-M0", "-Nr", "0", "-Runden", "$(if ($Kurz) { 6 } else { 15 })", "-Schnell", "-Pause", "2600")
  Lauf "Zufall" "fenster-fuzz.ps1" @("-Sekunden", "$(if ($Kurz) { 30 } else { 60 })", "-Seed", "7")
  Lauf "Chaos (Anmeldung wird zufällig entfernt)" "chaos.ps1" @("-dockPid", "$($dock.Id)", "-Sekunden", "$(if ($Kurz) { 30 } else { 60 })", "-Seed", "3")
  Lauf "Ruhe nach Chaos: eingeklappt" "pruefe.ps1" @("-Maus", "mitte", "-Erwartet", "0", "-Warten", "6000")
  Lauf "Ruhe nach Chaos: ausgeklappt" "pruefe.ps1" @("-Maus", "kante", "-Erwartet", "80", "-Warten", "3000")
  Lauf "Verlorene Anmeldung heilt von selbst (≤ 4 s)" "heilung.ps1" @("-dockPid", "$($dock.Id)", "-Sekunden", "5")
  $heilzeile = (& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\heilung.ps1" -dockPid $dock.Id -Sekunden 5 | Select-Object -Last 1)
  if ($heilzeile -notmatch "reserviert (4|5|6|7|8|9)\d px" -and $heilzeile -notmatch "reserviert \d{3} px") { $ergebnisse["Heilung dauerte zu lang oder blieb aus"] = 1 }
  Lauf "Vollbild-Fenster" "vollbild-test.ps1" @("-dockPid", "$($dock.Id)")
  # feste Leiste
  foreach ($t in $testfenster) { try { Stop-Process -Id $t.Id -Force } catch {} }; $testfenster = @()
  Dock-Beenden $dock; Einstellung $false $false; $dock = Dock-Starten
  $testfenster += Start-Process $electron -ArgumentList "`"$PSScriptRoot\testfenster.cjs`"", "OXPTEST-M1", "1", "max" -PassThru; Start-Sleep -Seconds 6
  Lauf "Feste Leiste: dauerhaft Platz" "pruefe.ps1" @("-Maus", "mitte", "-Erwartet", "80", "-Warten", "1500")
  Lauf "Feste Leiste: verlorene Anmeldung" "heilung.ps1" @("-dockPid", "$($dock.Id)", "-Sekunden", "4")
} finally {
  foreach ($t in $testfenster) { try { Stop-Process -Id $t.Id -Force } catch {} }
  if ($dock) { Dock-Beenden $dock }
  Remove-Item $profil -Recurse -Force -ErrorAction SilentlyContinue
}
"`n=== Ergebnis ==="
$schlecht = 0
foreach ($k in $ergebnisse.Keys) { $z = if ($ergebnisse[$k] -eq 0) { "ok" } else { "FEHLER ($($ergebnisse[$k]))" }; "{0,-48} {1}" -f $k, $z; $schlecht += $ergebnisse[$k] }
if ($schlecht) { "`n$schlecht Auffälligkeiten"; exit 1 } else { "`nAlles in Ordnung."; exit 0 }
