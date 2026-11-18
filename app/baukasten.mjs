// Widget-Baukasten (Hauptprozess).
// Jedes Widget-Modul in app/haupt/*.mjs meldet hier an:
//   ctx.widget({ id, name, group, desc, data: ["schluessel"] })   – Eintrag im Katalog (Einstellungen)
//   ctx.provide("schluessel", alleMs, async () => wert)            – Datenquelle, läuft nur solange ein Widget sie braucht
//   ctx.popup(id, async (anfrage) => daten)                        – Inhalt für das Widget-Fenster über der Leiste
//   ctx.action(id, async (aktion, wert) => antwort)               – Knöpfe/Regler in Leiste oder Fenster
// Die Daten gehen als „widget“-Nachricht { key, value } an die Leiste und an ein offenes Widget-Fenster.

export const GROUPS = [
  { id: "oxp", name: "OldschoolXP" },
  { id: "system", name: "System & Windows" },
  { id: "zeit", name: "Zeit & Produktivität" },
  { id: "wetter", name: "Wetter, Musik & Kurse" },
  { id: "konten", name: "Konten & KI" },
];

export function createBaukasten({ send, getConfig, log = console }) {
  const catalog = [];
  const providers = new Map();
  const popups = new Map();
  const actions = new Map();
  const data = {};

  async function run(key) {
    const p = providers.get(key);
    if (!p || p.busy) return;
    p.busy = true;
    try {
      const value = await p.fn();
      if (value !== undefined) {
        // nur verschicken, wenn sich wirklich etwas geändert hat – spart Neuzeichnen in allen Leisten
        const sig = JSON.stringify(value);
        if (sig === p.lastSig) return;
        p.lastSig = sig;
        data[key] = value;
        send("widget", { key, value });
      }
    } catch (e) {
      log.error(`Widget-Daten ${key}:`, e.message);
    } finally {
      p.busy = false;
    }
  }

  const ctx = {
    widget(def) {
      if (!catalog.some((w) => w.id === def.id)) catalog.push({ data: [], ...def });
    },
    provide(key, every, fn) {
      providers.set(key, { every, fn, timer: null, busy: false });
    },
    popup(id, fn) {
      popups.set(id, fn);
    },
    action(id, fn) {
      actions.set(id, fn);
    },
    /** Datenquelle sofort neu abfragen (z. B. nach einer Aktion). */
    refresh: (key) => run(key),
    /** Wert direkt setzen und verteilen. */
    set(key, value) {
      const p = providers.get(key);
      if (p) p.lastSig = JSON.stringify(value);
      data[key] = value;
      send("widget", { key, value });
    },
    get: (key) => data[key],
    config: getConfig,
  };

  /** Startet die Datenquellen, die gerade gebraucht werden, und stoppt den Rest. */
  function sync() {
    const order = getConfig().widgetOrder || [];
    const needed = new Set();
    for (const id of order) for (const k of catalog.find((w) => w.id === id)?.data || []) needed.add(k);
    for (const [key, p] of providers) {
      if (needed.has(key) && !p.timer) {
        run(key);
        p.timer = setInterval(() => run(key), p.every);
      } else if (!needed.has(key) && p.timer) {
        clearInterval(p.timer);
        p.timer = null;
      }
    }
  }

  return {
    ctx,
    catalog,
    data,
    sync,
    hasPopup: (id) => popups.has(id),
    async popupData(id, req) {
      const fn = popups.get(id);
      return fn ? fn(req || {}) : null;
    },
    async act(id, action, value) {
      const fn = actions.get(id);
      return fn ? fn(action, value) : null;
    },
    pushAll() {
      for (const [k, v] of Object.entries(data)) send("widget", { key: k, value: v });
    },
  };
}
