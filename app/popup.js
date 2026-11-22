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
  /** Welche Ansicht gerade offen ist (null = Popup zu) – damit Sekunden-Takte nicht in eine andere Ansicht zeichnen. */
  get aktuell() {
    return aktuell;
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
  api.invoke("popup-size", { width: karte.offsetWidth + 2, height: karte.offsetHeight + 2 });
  // Bilder (Vorschau, Cover) können die Größe danach noch ändern
  karte.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", groesseMelden, { once: true });
  });
}

function farben(look) {
  if (!look) return;
  // dasselbe Aussehen wie die Leiste (Einstellungen → Aussehen): Leistenfarbe, Akzent, Deckkraft
  const s = document.documentElement.style;
  s.setProperty("--lila", look.accent);
  s.setProperty("--bar-farbe", look.barColor);
  if (typeof look.opacity === "number") s.setProperty("--deckkraft", Math.round(look.opacity * 100) + "%");
}

api.on("popup-view", ({ view, payload, look, limits }) => {
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
  karte.style.setProperty("--kalender-max-breite", limits ? `${limits.width}px` : "560px");
  karte.style.setProperty("--kalender-max-hoehe", limits ? `${limits.height}px` : "none");
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

/**
 * Rechtsklick-Menü im OXP-Stil, innerhalb der Karte (das Popup ist ein eigenes kleines Fenster – ein Menü daneben
 * wäre abgeschnitten). Wird die Karte dafür zu klein, wächst sie kurz mit und schrumpft beim Schließen wieder.
 * eintraege: [{ text, icon?, gefahr?, aus?, tun }] | { trenner: true } | { titel: "…" }
 */
window.OXPMenue = {
  zu() {
    const m = karte.querySelector(".oxp-menue");
    if (!m) return false;
    m.remove();
    karte.querySelectorAll(".offen").forEach((x) => x.classList.remove("offen"));
    karte.style.minHeight = "";
    karte.style.minWidth = "";
    groesseMelden();
    return true;
  },
  zeigen(e, eintraege) {
    e.preventDefault();
    e.stopPropagation();
    this.zu();
    const m = document.createElement("div");
    m.className = "oxp-menue";
    m.setAttribute("role", "menu");
    for (const x of eintraege.filter(Boolean)) {
      if (x.trenner) {
        m.insertAdjacentHTML("beforeend", '<div class="menue-trenner"></div>');
        continue;
      }
      if (x.titel) {
        m.insertAdjacentHTML("beforeend", `<div class="menue-titel">${esc(x.titel)}</div>`);
        continue;
      }
      const b = document.createElement("button");
      b.className = "menue-eintrag" + (x.gefahr ? " gefahr" : "");
      b.setAttribute("role", "menuitem");
      b.disabled = !!x.aus;
      b.innerHTML = `<span class="menue-icon">${x.icon || ""}</span><span>${esc(x.text)}</span>`;
      b.onclick = (ev) => {
        ev.stopPropagation();
        this.zu();
        x.tun?.();
      };
      m.append(b);
    }
    karte.append(m);
    // an der Maus ausrichten, aber in der Karte halten
    const kr = karte.getBoundingClientRect();
    let x = e.clientX - kr.left;
    let y = e.clientY - kr.top;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    if (x + w > karte.clientWidth - 4) x = Math.max(4, karte.clientWidth - w - 4);
    if (y + h > karte.clientHeight - 4) y = Math.max(4, y - h);
    // passt es trotzdem nicht (kleine Karte), Karte für die Dauer des Menüs vergrößern
    if (y + h > karte.clientHeight - 4) karte.style.minHeight = y + h + 14 + "px";
    if (x + w > karte.clientWidth - 4) karte.style.minWidth = x + w + 14 + "px";
    m.style.left = x + "px";
    m.style.top = y + "px";
    groesseMelden();
    m.querySelector(".menue-eintrag:not(:disabled)")?.focus();
  },
};
document.addEventListener("mousedown", (e) => {
  if (!e.target.closest?.(".oxp-menue")) OXPMenue.zu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && OXPMenue.zu()) return;
  if (e.key === "Escape") api.invoke("popup-close");
});
document.addEventListener("contextmenu", (e) => {
  if (!e.target.closest("input, textarea")) e.preventDefault();
});
