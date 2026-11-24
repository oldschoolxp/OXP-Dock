# Tests: Platz für Fenster

Prüft mit **echten Fenstern**, dass die Leiste ihren Platz bei Windows zuverlässig reserviert und wieder freigibt
(Arbeitsfläche), ob maximierte Fenster mitwachsen und ob das Dock Verluste selbst heilt.

```powershell
cd tests\platz
powershell -ExecutionPolicy Bypass -File alles.ps1        # ca. 6 Minuten
powershell -ExecutionPolicy Bypass -File alles.ps1 -Kurz  # ca. 3 Minuten
```

* Läuft mit einer **Kopie** der Einstellungen (`OXP_DOCK_DATA`) und ohne Lizenzprüfung (`OXP_DOCK_LIZENZ=test`, nur im Entwicklungsmodus).
* Bewegt die Maus an die untere Bildschirmkante – währenddessen nichts bedienen.
* Das Dock muss vorher beendet sein (sonst gibt es zwei Leisten).

Einzelne Bausteine: `fenster-test.ps1` (Aus-/Einklappen mit Testfenster), `fenster-fuzz.ps1` (Zufallsbewegungen),
`chaos.ps1` + `appbar-fremd.ps1` (Anmeldung bei Windows von außen entfernen, wie nach Explorer-Neustart/Entsperren),
`heilung.ps1`, `pruefe.ps1`, `vollbild-test.ps1`, `taskbarcreated.ps1` (Explorer-Neustart-Nachricht).

Hintergrund: Windows verwirft AppBar-Anmeldungen still (Explorer-Neustart, Entsperren, Ruhezustand, Bildschirmwechsel, andere
Programme). Früher merkte sich das Dock „angemeldet“ nur selbst und reservierte dann nie wieder Platz. Jetzt wird die Anmeldung
bei jedem Setzen neu geprüft und ein Wächter (`platzWaechter` in `app/main.mjs`) gleicht Soll und Ist jede Sekunde ab.


## Hinweis
Läuft auf dem Prüf-PC ein echtes Dock mit fester Leiste, reserviert es auf seinem Bildschirm selbst Platz (z. B. 70 px). Die Prüfungen für diesen Bildschirm melden dann "reserviert 70 px, erwartet 0" – das ist Störung durch das echte Dock, kein Fehler. Für saubere Ergebnisse das echte Dock vorher beenden.
