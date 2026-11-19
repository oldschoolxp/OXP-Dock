# OXP Dock

Version 1.1.7 · Windows 10/11 · [Download (neueste Version)](https://github.com/oldschoolxp/OXP-Dock/releases/latest)

Das Dock aktualisiert sich selbst: Gibt es eine neue Version, fragt es „Jetzt aktualisieren? Ja / Nein“.
Von Hand: Einstellungen → Info → „Nach Updates suchen“.

Eigene Taskleiste für Windows 11 im OldschoolXP-Look: unten ein schwebendes Dock mit dem Neon-**OXP-Würfel** (`app/assets/oxp-wuerfel.png`) als Startknopf,
angehefteten Programmen, offenen Fenstern und Live-Widgets.

## Was es kann

| Teil | Bedienung |
|---|---|
| **OXP-Würfel** | Klick = Windows-Startmenü · Rechtsklick = Menü (Task-Manager, Explorer, Einstellungen, Website, Twitch, Dock-Einstellungen, Dock beenden) |
| Lupe | Windows-Suche (Win+S) |
| **Programme** | angeheftete Programme + offene Fenster. Klick = starten / nach vorn holen / minimieren, bei mehreren Fenstern durchschalten. Mittelklick = neues Fenster. Rechtsklick = Fensterliste, anheften/lösen, schließen. Lila Strich = aktives Fenster |
| Anheften | Windows-„An Taskleiste anheften“ / „Von Taskleiste lösen“ (Startmenü, Explorer) wirkt aufs Dock (Ordner `User PinnedTaskBar` wird beobachtet). Außerdem .exe/Verknüpfung aufs Dock ziehen oder Rechtsklick → „Am Dock anheften“. Symbole per Ziehen sortieren; offenes Programm in den angehefteten Bereich ziehen = anheften |
| Drüberfahren | Namens-Blase über dem Symbol, Symbol hebt sich leicht. Optional Mac-Vergrößerung (Stärke einstellbar) |
| Aussehen | Leistenfarbe, Akzentfarbe, 7 fertige Farbkombis, Deckkraft 20–100 %, Größe 75–150 % |
| **Claude-Limit** | (aus, in Einstellungen einschalten) Sitzung (5 Std.) + Woche in %, Restzeit, Hochrechnung „bei diesem Tempo“. Liest `%USERPROFILE%.claude.credentials.json`, fragt `api.anthropic.com/api/oauth/usage`, erneuert abgelaufene Anmeldungen nicht selbst |
| **Live** | eigener Kanal LIVE/OFFLINE + wie viele Partner live sind (Klick = Liste, öffnet Twitch) – Daten von `oldschoolxp.de/api/live` |
| **Nächster Stream** | aus dem Streamplan (Supabase, nur lesen) mit Spiel-Bild und Countdown, Klick = nächste 5 Streams |
| Musik | Zurück / Pause / Weiter (Medientasten), zeigt Spotify-Titel |
| CPU / RAM | Auslastung, wird orange bei ≥ 90 % |
| Wetter | Open-Meteo (kostenlos, ohne Konto), Ort in den Einstellungen |
| Netzwerksymbol | Zeigt LAN, WLAN oder getrennt. Beim Darüberfahren erscheinen Netzwerkname, Internetstatus und bei authentifizierten Domänennetzwerken die Domäne. Klick = Schnelleinstellungen (Win+A) |
| Pfeil rechts | Kompakte Liste der Hintergrundprogramme. Berücksichtigt gespeicherte Windows-Infobereichseinträge mit laufenden Prozessen und ergänzt Programme ohne sichtbares Fenster. Klick = öffnen, ✕ bzw. Rechtsklick = Beenden mit Bestätigung |
| Uhr | Klick = Kalender über Uhrzeit und Datum · Rechtsklick = Windows-Benachrichtigungen (Win+N) |
| ganz rechts | Desktop anzeigen (Win+D) |

Vollbild-Programme (Spiele, Videos) blenden das Dock automatisch aus.

## Windows-Taskleiste

Das Dock stellt die normale Taskleiste auf „automatisch ausblenden“, versteckt sie und reserviert
unten 60 px für sich (maximierte Fenster bleiben darüber). Beim Beenden kommt alles zurück.
Stürzt das Dock ab, holt der **nächste Start** die Taskleiste zuerst zurück
(Merkzettel `%APPDATA%\oxp-dock\taskleiste-versteckt.json`).

Notfall von Hand: Rechtsklick auf den Desktop → Anpassen → Taskleiste → „Taskleiste automatisch ausblenden“ aus,
dann im Task-Manager „Windows-Explorer“ neu starten.

## Entwickeln

    npm install
    node node_modules/electron/install.js   # npm lässt Install-Skripte aus, Electron dann von Hand laden
    npm start                               # bzw. electron . --remote-debugging-port=9334 zum Prüfen
    npm run installer                       # → dist-installer/OXP-Dock-Setup-<version>.exe
    npm run release -- "Was ist neu"        # neue Version veröffentlichen (vorher Version in package.json erhöhen, gh angemeldet)

Einstellungen liegen in `%APPDATA%\oxp-dock\einstellungen.json`.

## Aufbau

- `app/main.mjs` – Hauptprozess: Dock-Fenster, Platz reservieren, Fensterliste (alle 0,7 s), Widget-Daten, Menüs, Einstellungen
- `app/win32.mjs` – Windows-Aufrufe über **koffi** (EnumWindows, SetForegroundWindow, SHAppBarMessage …)
- `app/dock.html/.css/.js` – Oberfläche des Docks
- `app/einstellungen.*` – Einstellungsfenster
- `app/oeffentlich.mjs` – öffentliche Website-Adresse + öffentlicher Supabase-Schlüssel (nur Lesen)
- Logo aus `Documents\OldschoolXP-Branding`

## Widgets (v0.3.0, rund 60 Stück)

Auswahl und Reihenfolge: Rechtsklick auf den Würfel → Dock-Einstellungen → „Widgets in der Leiste“ / „Weitere Widgets“.
Klick auf ein Widget öffnet meist ein Fenster über der Leiste (Popup), Rechtsklick/Mausrad haben oft Abkürzungen.

- **OldschoolXP:** Live-Status, nächster Stream
- **System & Windows:** Lautstärke (+Ausgabegeräte), Mikrofon, Akku ×4, Helligkeit (Laptop/DDC-Monitor), Schnellschalter (WLAN/BT/…), Nicht stören, Top-CPU, Top-RAM, Temperatur, Tastatursprache, Benachrichtigungen, Papierkorb, Speicher, Netz-Tempo, Screenshots, Hintergrundbilder, Zuletzt geöffnet, Alle Programme, Fenster-Übersicht, Sperren, CPU/RAM
- **Zeit & Produktivität:** Klappuhr, Analoguhr, Weltuhren, 7 Tage, Tagesleiste, Kalender (Outlook wenn offen + iCal-Links + Streamplan), Aufgaben, Notizen, Pomodoro, Timer, Stoppuhr, Rechner, Bildschirmzeit, Sprachnotiz, Ablage
- **Wetter, Musik & Kurse:** Wetter, stündlich, heute, Regen-Hinweis, Sonne, Läuft gerade (Windows-Mediensteuerung), Audio-Ausgabe, Krypto (CoinGecko), Aktien (Yahoo), Währungen (EZB)
- **Konten & KI:** Follower & Abos (Website `/api/social-stats`), Outlook-Mails, Gmail (IMAP + App-Passwort, verschlüsselt), GitHub (über `gh`), WhatsApp, Claude-Limit, KI-Limits (Claude/Codex/Gemini-CLI/DeepSeek)
- Weitere Integrationen: X und Shop-Widgets sind derzeit nicht enthalten.

Fenster-Vorschau: beim Verweilen über einem Programm mit offenen Fenstern (Live-Bilder, Klick = nach vorn, ✕ = schließen).

### Technik
- `app/baukasten.mjs` – Widget-Katalog, Datenquellen laufen nur, wenn ein Widget sie braucht
- `app/haupt/*.mjs` – je Gruppe Daten/Aktionen/Popups; `app/widgets/*.js` – Leiste; `app/popups/*.js` – Fenster
- `app/helfer/systemhelfer.ps1` – dauerhafter PowerShell-Helfer (Audio/COM, DDC, Funk, Prozesse, Netz, Medien, Outlook-COM); wird im Installer entpackt
- Testmodus: `OXP_DOCK_TEST=1` schaltet das automatische Schließen der Vorschau aus (für Tests ohne echte Maus)

## Ideen für später

Eigenes OXP-Startmenü, Fenster-Vorschau beim Drüberfahren,
Lautstärke-Regler, Zuschauerzahl/Follower, Dock auf weiteren Bildschirmen, Selbst-Update wie beim Mod-Dashboard.
