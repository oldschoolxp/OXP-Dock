// Einstellbare Optionen der Widgets (Reiter „Widget-Einstellungen“).
// Je Widget eine Liste von Optionen:
//   { key, label, desc?, type: "toggle" | "select" | "range" | "color", default, choices?: [[wert, text]], min?, max?, step?, unit?, when?: { key, value } }
// „when“: Option nur zeigen, wenn eine andere Option einen bestimmten Wert hat.
// Neue Optionen hier eintragen und im Widget mit c.option("key", standard) auslesen.

export const WIDGET_OPTIONEN = {
  nowPlaying: [
    {
      key: "hintergrund",
      label: "Hintergrund",
      desc: "Cover = Bild des Songs bzw. Vorschaubild des Videos · Live-Video = das laufende Fenster live",
      type: "select",
      default: "aus",
      choices: [["aus", "Kein Hintergrund"], ["cover", "Cover / Videobild"], ["video", "Live-Video"]],
    },
    { key: "staerke", label: "Stärke des Hintergrunds", type: "range", default: 55, min: 15, max: 100, step: 5, unit: "%", when: { key: "hintergrund", not: "aus" } },
    { key: "unschaerfe", label: "Unschärfe", desc: "Macht den Text besser lesbar", type: "range", default: 6, min: 0, max: 20, step: 1, unit: "px", when: { key: "hintergrund", value: "cover" } },
    { key: "breite", label: "Breite des Titels", type: "range", default: 200, min: 120, max: 420, step: 10, unit: "px" },
    { key: "cover", label: "Kleines Cover links zeigen", type: "toggle", default: true },
    { key: "knoepfe", label: "Steuerknöpfe zeigen", type: "toggle", default: true },
  ],
  analogClock: [{ key: "sekunden", label: "Sekundenzeiger", type: "toggle", default: true }],
  flipClock: [{ key: "sekunden", label: "Sekunden anzeigen", type: "toggle", default: false }],
  worldClocks: [{ key: "anzahl", label: "Städte in der Leiste", type: "range", default: 3, min: 1, max: 5, step: 1 }],
  weatherHourly: [{ key: "stunden", label: "Stunden in der Leiste", type: "range", default: 6, min: 3, max: 12, step: 1 }],
  dayTimeline: [
    { key: "von", label: "Zeitstrahl ab", type: "range", default: 7, min: 0, max: 12, step: 1, unit: " Uhr" },
    { key: "bis", label: "Zeitstrahl bis", type: "range", default: 23, min: 13, max: 24, step: 1, unit: " Uhr" },
  ],
  crypto: [{ key: "anzahl", label: "Kurse in der Leiste", type: "range", default: 3, min: 1, max: 6, step: 1 }],
  stocks: [
    { key: "anzahl", label: "Aktien in der Leiste", type: "range", default: 3, min: 1, max: 6, step: 1 },
    { key: "kurve", label: "Mini-Kurve zeigen", type: "toggle", default: true },
  ],
  currency: [{ key: "anzahl", label: "Kurse in der Leiste", type: "range", default: 3, min: 1, max: 4, step: 1 }],
  system: [
    { key: "cpu", label: "Prozessor (CPU) zeigen", type: "toggle", default: true },
    { key: "ram", label: "Arbeitsspeicher (RAM) zeigen", type: "toggle", default: true },
    { key: "gpu", label: "Grafikkarte (GPU) zeigen", type: "toggle", default: true },
  ],
  audio: [{ key: "prozent", label: "Prozentzahl zeigen", type: "toggle", default: true }],
  claude: [{ key: "woche", label: "Wochenlimit zeigen", type: "toggle", default: true }],
  live: [{ key: "partner", label: "Anzahl live Partner zeigen", type: "toggle", default: true }],
  stream: [{ key: "bild", label: "Spielbild zeigen", type: "toggle", default: true }],
};
