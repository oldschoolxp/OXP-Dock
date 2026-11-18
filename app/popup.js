// Popup über der Leiste: zeigt je nach Auftrag eine „Ansicht“ (Fenster-Vorschau, Lautstärke, Kalender …).
// Ansichten melden sich über OXPAnsichten.add(name, renderFn) an (siehe popup-ansichten.js).
const api = window.dock;
const karte = document.getElementById("karte");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

window.OXPAnsichten = {
  liste: {},
  keys: {},
  /** keys: Datenschlüssel, bei deren Änderung die Ansicht neu gezeichnet wird */
  add(name, fn, { keys = [] } = {}) {
    this.liste[name] = fn;
    this.keys[name] = keys;
  },
};

let aktuell = null;
let letzte = {};
const store = {};

function werkzeuge(view) {
  return {
    api,
    esc,
    neuZeichnen: groesseMelden,
    daten: (k) => store[k],
    aktion: (action, value) => api.invoke("widget-action", { id: view, action, value }),
    neuLaden: (req) => api.invoke("widget-popup-refresh", { id: view, req }),
    schliessen: () => api.invoke("popup-close"),
  };
}

function zeichnen() {
  const fn = OXPAnsichten.liste[aktuell];
  if (!fn) return;
  // Eingabefelder mit Fokus nicht unter den Fingern wegzeichnen
  const fokus = document.activeElement;
  if (fokus && (fokus.tagName === "INPUT" || fokus.tagName === "TEXTAREA") && karte.contains(fokus) && fokus.type !== "range") return;
  fn(karte, letzte, werkzeuge(aktuell));
  groesseMelden();
}

api.on("widget", ({ key, value }) => {
  store[key] = value;
  if (aktuell && (OXPAnsichten.keys[aktuell] || []).includes(key)) zeichnen();
});

function groesseMelden() {
  // nach dem Zeichnen messen und dem Hauptprozess die Größe schicken (inkl. Rand für den Schatten)
  // sofort messen: ein verstecktes Fenster bekommt keine Animations-Frames, sonst würde es nie erscheinen
  const r = karte.getBoundingClientRect();
  api.invoke("popup-size", { width: Math.ceil(r.width) + 2, height: Math.ceil(r.height) + 2 });
  // Bilder (Vorschau, Cover) können die Größe danach noch ändern
  karte.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", groesseMelden, { once: true });
  });
}

function farben(look) {
  if (!look) return;
  const s = document.documentElement.style;
  s.setProperty("--lila", look.accent);
  s.setProperty("--bar-farbe", look.barColor);
}

api.on("popup-view", ({ view, payload, look }) => {
  farben(look);
  if (!view) {
    aktuell = null;
    karte.hidden = true;
    karte.innerHTML = "";
    return;
  }
  const fn = OXPAnsichten.liste[view];
  if (!fn) return;
  const neu = aktuell !== view;
  aktuell = view;
  karte.hidden = false;
  if (neu) {
    // Einblend-Animation neu starten
    karte.style.animation = "none";
    void karte.offsetWidth;
    karte.style.animation = "";
  }
  letzte = payload || {};
  fn(karte, letzte, werkzeuge(view));
  groesseMelden();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") api.invoke("popup-close");
});
document.addEventListener("contextmenu", (e) => {
  if (!e.target.closest("input, textarea")) e.preventDefault();
});
