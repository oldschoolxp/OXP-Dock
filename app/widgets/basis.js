// Widget-Baukasten in der Leiste.
// OXPWidgets.add(id, { klasse, keys, render(el, ctx), click(el, ctx, e), context(el, ctx, e), wheel(el, ctx, e) })
//   keys:    Datenschlüssel, bei deren Eintreffen render() erneut läuft ("windows" = Fensterliste)
//   render:  zeichnet das Widget; ohne click öffnet ein Klick das Widget-Fenster über der Leiste
// ctx: { daten(key), config, api, esc, oeffnen(), aktion(name, wert), widgetEinstellung() }
/** Option eines Widgets aus dem Reiter „Widget-Einstellungen“ (sonst der Standardwert). */
window.OXPopt = (id, key, standard) => {
  const v = window.OXPState?.config?.widgetOptions?.[id]?.[key];
  return v === undefined ? standard : v;
};

window.OXPWidgets = {
  defs: {},
  add(id, def) {
    this.defs[id] = def;
  },

  ctx(id, el) {
    const s = window.OXPState;
    return {
      id,
      daten: (k) => s.widgets[k],
      config: s.config,
      fenster: s.windows,
      api: window.dock,
      esc: window.OXPesc,
      einstellung: () => (s.config.widgetSettings || {})[id],
      option: (key, standard) => window.OXPopt(id, key, standard),
      oeffnen: () => {
        const r = el.getBoundingClientRect();
        return window.dock.invoke("widget-popup", { id, rect: { x: r.left, y: r.top, width: r.width, height: r.height } });
      },
      aktion: (action, value) => window.dock.invoke("widget-action", { id, action, value }),
    };
  },

  /** Legt die Widget-Plätze in der eingestellten Reihenfolge an (bestehende Elemente bleiben erhalten). */
  aufbauen() {
    // erst bauen, wenn alle Widget-Skripte geladen sind (start.js setzt OXPbereit) – sonst fehlen Bauplan und Aussehen
    if (!window.OXPbereit) return;
    const box = document.getElementById("widgets");
    const order = window.OXPState.config.widgetOrder || [];
    const keep = new Set();
    let prev = null;
    for (const id of order) {
      const def = this.defs[id];
      let el = document.getElementById("w-" + id);
      // Element passt nicht (mehr) zum Bauplan? Dann neu anlegen
      if (el && (el.dataset.bauplan !== (def ? "1" : "0") || el.tagName.toLowerCase() !== (def?.tag || "button"))) {
        el.remove();
        el = null;
      }
      if (!el) {
        el = document.createElement(def?.tag || "button");
        el.id = "w-" + id;
        el.className = "widget " + (def?.klasse || "");
        el.dataset.widget = id;
        el.dataset.bauplan = def ? "1" : "0";
        el.hidden = true;
        if (def?.html) el.innerHTML = def.html;
        this.verdrahten(id, el, def);
      }
      keep.add(el);
      if (prev ? prev.nextSibling !== el : box.firstChild !== el) {
        if (prev) prev.after(el);
        else box.prepend(el);
      }
      prev = el;
    }
    for (const el of [...box.children]) if (!keep.has(el)) el.remove();
  },

  verdrahten(id, el, def) {
    // Widgets per Ziehen umsortieren
    el.draggable = true;
    el.addEventListener("dragstart", (e) => {
      window.OXPhideTip?.();
      window.OXPdragWidget = id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/oxp-widget", id);
      requestAnimationFrame(() => el.classList.add("ziehe"));
    });
    el.addEventListener("dragend", () => {
      window.OXPdragWidget = null;
      el.classList.remove("ziehe");
      document.querySelectorAll(".widget.drop-before, .widget.drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after"));
    });
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-eigen]")) return; // Knöpfe im Widget kümmern sich selbst
      window.OXPhideTip?.();
      const d = this.defs[id];
      if (d?.click) d.click(el, this.ctx(id, el), e);
      else this.ctx(id, el).oeffnen();
    });
    el.addEventListener("contextmenu", (e) => {
      const d = this.defs[id];
      if (d?.context) {
        e.preventDefault();
        d.context(el, this.ctx(id, el), e);
      }
    });
    el.addEventListener(
      "wheel",
      (e) => {
        const d = this.defs[id];
        if (d?.wheel) {
          e.preventDefault();
          d.wheel(el, this.ctx(id, el), e);
        }
      },
      { passive: false },
    );
  },

  zeichnen(id) {
    const def = this.defs[id];
    const el = document.getElementById("w-" + id);
    if (!def?.render || !el) return;
    try {
      // erst „zur Probe“ zeichnen – nur wenn sich etwas Sichtbares ändert, wirklich neu zeichnen
      // (spart Grafikarbeit, z. B. bei Uhren und Timern, die jede Sekunde nachsehen)
      const probe = el.cloneNode(false);
      // Zusatzdaten am Element (z. B. Standbild) mitgeben, damit der Vergleich stimmt
      for (const k of Object.keys(el)) if (k.startsWith("_")) probe[k] = el[k];
      let sichtbar = def.render(probe, this.ctx(id, probe));
      const gleich = probe.innerHTML === el.innerHTML && probe.className === el.className && probe.dataset.tip === el.dataset.tip;
      if (!gleich) sichtbar = def.render(el, this.ctx(id, el));
      el.hidden = sichtbar === false;
    } catch (e) {
      console.error("Widget " + id, e);
    }
  },

  alleZeichnen() {
    if (!window.OXPbereit) return;
    for (const id of window.OXPState.config.widgetOrder || []) if (this.defs[id]?.render) this.zeichnen(id);
  },

  datenDa(key) {
    if (!window.OXPbereit) return;
    for (const id of window.OXPState.config.widgetOrder || []) {
      const def = this.defs[id];
      if (def?.render && (def.keys || []).includes(key)) this.zeichnen(id);
    }
  },
};

// Ablegen eines gezogenen Widgets: Platz anhand der Mausposition bestimmen und neue Reihenfolge speichern
(() => {
  const box = document.getElementById("widgets");
  const ziel = (e) => {
    const els = [...box.querySelectorAll(".widget:not([hidden])")].filter((x) => x.dataset.widget !== window.OXPdragWidget);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) return { el, vor: true };
    }
    return els.length ? { el: els[els.length - 1], vor: false } : null;
  };
  box.addEventListener("dragover", (e) => {
    if (!window.OXPdragWidget) return;
    e.preventDefault();
    e.stopPropagation();
    box.querySelectorAll(".drop-before, .drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after"));
    const z = ziel(e);
    if (z) z.el.classList.add(z.vor ? "drop-before" : "drop-after");
  });
  box.addEventListener("drop", (e) => {
    const id = window.OXPdragWidget;
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    const z = ziel(e);
    window.OXPdragWidget = null;
    const order = (window.OXPState.config.widgetOrder || []).filter((x) => x !== id);
    let i = z ? order.indexOf(z.el.dataset.widget) : order.length;
    if (z && !z.vor) i++;
    if (i < 0) i = order.length;
    order.splice(i, 0, id);
    window.dock.invoke("settings-save", { widgetOrder: order });
  });
})();

// Eingebaute Widgets, deren Zeichnen in dock.js steckt – hier nur Aussehen und Klick
OXPWidgets.add("live", { click: (el, c) => c.api.invoke("live-menu") });
OXPWidgets.add("stream", { click: (el, c) => c.api.invoke("stream-menu") });
OXPWidgets.add("claude", { klasse: "claude" }); // Klick öffnet das Detail-Fenster
OXPWidgets.add("system", { tag: "div", klasse: "system" });
OXPWidgets.add("weather", {
  click: (el, c) => {
    const w = c.daten("weather");
    if (w?.place) c.api.invoke("open-url", `https://www.google.com/search?q=${encodeURIComponent("Wetter " + w.place)}`);
  },
});
OXPWidgets.add("media", {
  tag: "div",
  klasse: "media",
  html: `<span class="media-title"></span>
    <button data-eigen data-media="prev" data-tip="Zurück"><svg viewBox="0 0 24 24"><path d="M6 5v14M19 5 9 12l10 7z" class="fill"/></svg></button>
    <button data-eigen data-media="play" data-tip="Wiedergabe / Pause"><svg viewBox="0 0 24 24"><path d="M7 5v14l11-7z" class="fill"/></svg></button>
    <button data-eigen data-media="next" data-tip="Weiter"><svg viewBox="0 0 24 24"><path d="M18 5v14M5 5l10 7-10 7z" class="fill"/></svg></button>`,
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-media]");
  if (b) window.dock.invoke("media", b.dataset.media);
});
