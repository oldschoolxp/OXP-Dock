// Stufe 2: System & Windows – Darstellung in der Leiste.
(() => {
  const W = OXPWidgets;
  const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" ${extra}>${d}</svg>`;
  const I = {
    speaker: (v, m) =>
      svg(
        `<path d="M4 9v6h4l5 4V5L8 9z" class="fill"/>` +
          (m ? `<path d="M16 9l5 6M21 9l-5 6"/>` : (v > 0 ? `<path d="M16 9.5a3.5 3.5 0 0 1 0 5"/>` : "") + (v > 50 ? `<path d="M18.5 7a7 7 0 0 1 0 10"/>` : "")),
      ),
    mic: (m) => svg(`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>` + (m ? `<path d="M3 3l18 18"/>` : "")),
    sun: svg(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`),
    bell: (off) => svg(`<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>` + (off ? `<path d="M3 3l18 18"/>` : "")),
    moon: svg(`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" class="fill"/>`),
    chip: svg(`<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>`),
    mem: svg(`<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 11v2M11 11v2M15 11v2"/>`),
    thermo: svg(`<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>`),
    kbd: svg(`<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>`),
    trash: svg(`<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>`),
    disk: svg(`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h.01M11 15h6"/>`),
    net: svg(`<path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4"/>`),
    camera: svg(`<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>`),
    image: svg(`<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>`),
    clock: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
    grid: svg(`<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`),
    windows: svg(`<rect x="3" y="5" width="13" height="10" rx="1.5"/><rect x="8" y="9" width="13" height="10" rx="1.5"/>`),
    lock: svg(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`),
    toggles: svg(`<rect x="2" y="5" width="20" height="6" rx="3"/><circle cx="17" cy="8" r="1.8" class="fill"/><rect x="2" y="13" width="20" height="6" rx="3"/><circle cx="7" cy="16" r="1.8" class="fill"/>`),
    plug: svg(`<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>`),
  };
  window.OXPIcons = I;

  const stack = (klein, gross) => `<div class="stack"><span class="klein">${klein}</span><span class="gross">${gross}</span></div>`;
  const bytes = (b) => {
    if (b == null) return "–";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) {
      b /= 1024;
      i++;
    }
    return (b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)) + " " + u[i];
  };
  window.OXPbytes = bytes;
  const rate = (b) => (b == null ? "–" : bytes(b) + "/s");

  // ---------- Lautstärke & Mikrofon ----------
  W.add("audio", {
    keys: ["audio"],
    render(el, c) {
      const a = c.daten("audio");
      if (!a) return false;
      el.innerHTML = `${I.speaker(a.volume, a.muted)}${c.option("prozent", true) || a.muted ? `<span class="gross">${a.muted ? "stumm" : a.volume + "%"}</span>` : ""}`;
      el.dataset.tip = "Lautstärke · Mausrad = lauter/leiser · Rechtsklick = stumm";
      el.classList.toggle("aus", !!a.muted);
    },
    wheel: (el, c, e) => c.aktion("step", e.deltaY < 0 ? 2 : -2),
    context: (el, c) => c.aktion("mute", !c.daten("audio")?.muted),
  });
  W.add("mic", {
    keys: ["audio"],
    render(el, c) {
      const a = c.daten("audio");
      if (!a || a.mic == null) return false;
      el.innerHTML = `${I.mic(a.micMuted)}<span class="gross">${a.micMuted ? "aus" : "an"}</span>`;
      el.classList.toggle("warnung", !!a.micMuted);
      el.dataset.tip = a.micMuted ? "Mikrofon ist stumm – klicken zum Einschalten" : "Mikrofon an – klicken zum Stummschalten";
    },
    click: (el, c) => c.aktion("toggle"),
  });

  // ---------- Akku in vier Darstellungen ----------
  const akkuText = (b) => (b.plugged ? (b.charging ? "lädt" : "am Netz") : b.secondsLeft ? `${Math.floor(b.secondsLeft / 3600)} h ${Math.round((b.secondsLeft % 3600) / 60)} min` : "Akku");
  const akkuTip = (b) => `Akku ${b.percent}% · ${akkuText(b)}${b.saver ? " · Energiesparen an" : ""}`;
  const akkuFarbe = (p) => (p <= 15 ? "var(--live)" : p <= 30 ? "#ffb02e" : "var(--lila)");
  const akku = (render) => ({
    keys: ["battery"],
    render(el, c) {
      const b = c.daten("battery");
      if (!b) return false;
      if (!b.hasBattery) {
        el.innerHTML = `${I.plug}<span class="klein">kein Akku</span>`;
        el.dataset.tip = "Dieser PC hat keinen Akku";
        return;
      }
      el.innerHTML = render(b);
      el.dataset.tip = akkuTip(b);
    },
  });
  W.add(
    "battery",
    akku((b) => `<span class="akku-symbol"><i style="width:${b.percent}%;background:${akkuFarbe(b.percent)}"></i></span><span class="gross">${b.percent}%</span>${b.charging ? '<span class="blitz">⚡</span>' : ""}`),
  );
  W.add(
    "batteryRing",
    akku((b) => {
      const r = 13, u = 2 * Math.PI * r;
      return `<svg class="ring" viewBox="0 0 32 32"><circle cx="16" cy="16" r="${r}" class="ring-bg"/><circle cx="16" cy="16" r="${r}" class="ring-fg" style="stroke:${akkuFarbe(b.percent)};stroke-dasharray:${(u * b.percent) / 100} ${u}"/><text x="16" y="20" text-anchor="middle">${b.percent}</text></svg>${b.charging ? '<span class="blitz">⚡</span>' : ""}`;
    }),
  );
  W.add(
    "batteryDots",
    akku((b) => {
      const n = Math.round(b.percent / 20);
      return `<span class="punkte">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? "an" : ""}" style="${i < n ? `background:${akkuFarbe(b.percent)}` : ""}"></i>`).join("")}</span><span class="klein">${b.percent}%</span>`;
    }),
  );
  W.add(
    "batteryGauge",
    akku((b) => `<div class="meter breit"><div class="row"><span>Akku</span><span>${akkuText(b)}</span><b>${b.percent}%</b></div><div class="track"><i style="width:${b.percent}%;background:${akkuFarbe(b.percent)}"></i></div></div>`),
  );

  // ---------- Helligkeit ----------
  W.add("brightness", {
    keys: ["brightness"],
    render(el, c) {
      const b = c.daten("brightness");
      if (!b) return false;
      el.innerHTML = `${I.sun}<span class="gross">${b.value == null ? "–" : b.value + "%"}</span>`;
      el.dataset.tip = b.value == null ? "Helligkeit lässt sich bei diesem Bildschirm nicht steuern" : "Helligkeit · Mausrad = heller/dunkler";
    },
    wheel: (el, c, e) => c.aktion("step", e.deltaY < 0 ? 5 : -5),
  });

  // ---------- Schalter ----------
  W.add("toggles", {
    keys: ["radios"],
    render(el, c) {
      const r = c.daten("radios") || [];
      const on = (k) => r.find((x) => x.kind === k)?.on;
      el.innerHTML = `${I.toggles}<span class="klein">${on("WiFi") ? "WLAN" : "WLAN aus"} · ${on("Bluetooth") ? "BT" : "BT aus"}</span>`;
      el.dataset.tip = "Schnellschalter";
    },
  });
  W.add("dnd", {
    keys: ["dnd"],
    render(el, c) {
      const d = c.daten("dnd");
      el.innerHTML = `${I.bell(d?.on)}<span class="klein">${d?.on ? "Nicht stören" : "Mitteilungen an"}</span>`;
      el.classList.toggle("an", !!d?.on);
      el.dataset.tip = "Benachrichtigungen öffnen (dort „Nicht stören“ umschalten)";
    },
    click: (el, c) => c.aktion("open"),
  });

  // ---------- Prozesse, Temperatur ----------
  const topProc = (art) => ({
    keys: ["procs"],
    render(el, c) {
      const p = c.daten("procs");
      if (!p) return false;
      const t = art === "cpu" ? p.cpu?.[0] : p.ram?.[0];
      if (!t) return false;
      el.innerHTML = `${art === "cpu" ? I.chip : I.mem}${stack(c.esc(t.name.slice(0, 18)), art === "cpu" ? Math.round(t.cpu) + "% CPU" : bytes(t.ramMb * 1048576))}`;
      el.dataset.tip = art === "cpu" ? "Braucht gerade am meisten Prozessor" : "Braucht am meisten Arbeitsspeicher";
    },
  });
  W.add("topCpu", topProc("cpu"));
  W.add("topRam", topProc("ram"));
  W.add("temperature", {
    keys: ["temp"],
    render(el, c) {
      const t = c.daten("temp");
      if (!t) return false;
      el.innerHTML = `${I.thermo}<span class="gross">${t.celsius == null ? "–" : t.celsius + "°C"}</span>`;
      el.classList.toggle("warnung", (t.celsius || 0) >= 85);
      el.dataset.tip = t.celsius == null ? "Windows liefert auf diesem PC keine Temperatur" : "Temperatur (Windows-Thermalzone)";
    },
    click: () => {},
  });
  W.add("keyboard", {
    keys: ["kbd"],
    render(el, c) {
      const k = c.daten("kbd");
      if (!k) return false;
      el.innerHTML = `${I.kbd}<span class="gross">${k.short}</span>`;
      el.dataset.tip = `${k.name || "Tastatur"}${k.count > 1 ? " · Klick = nächste Sprache" : " · Rechtsklick = Spracheinstellungen"}`;
    },
    click: (el, c) => c.aktion("next"),
    context: (el, c) => c.aktion("settings"),
  });

  // ---------- Knöpfe ----------
  const knopf = (icon, tip, aktion) => ({
    render(el) {
      el.innerHTML = icon;
      el.dataset.tip = tip;
    },
    click: (el, c) => c.aktion(aktion),
  });
  W.add("notifications", knopf(I.bell(false), "Benachrichtigungen & Kalender", "open"));
  W.add("switcher", knopf(I.windows, "Fenster-Übersicht (Win+Tab)", "open"));
  W.add("lock", knopf(I.lock, "Bildschirm sperren", "lock"));
  const symbol = (icon, tip) => ({ render: (el) => ((el.innerHTML = icon), (el.dataset.tip = tip)) });
  W.add("screenshots", { ...symbol(I.camera, "Screenshots · Rechtsklick = neuer Screenshot"), context: (el, c) => c.aktion("new") });
  W.add("wallpaper", symbol(I.image, "Hintergrundbild wählen"));
  W.add("recent", symbol(I.clock, "Zuletzt geöffnete Dateien"));
  W.add("apps", symbol(I.grid, "Alle Programme"));

  // ---------- Papierkorb, Speicher, Netz ----------
  W.add("trash", {
    keys: ["trash"],
    render(el, c) {
      const t = c.daten("trash");
      if (!t) return false;
      el.innerHTML = `${I.trash}${t.items ? stack(`${t.items} Elemente`, bytes(t.bytes)) : '<span class="klein">leer</span>'}`;
      el.dataset.tip = "Papierkorb · Klick = öffnen · Rechtsklick = leeren";
    },
    click: (el, c) => c.aktion("open"),
    context: (el, c) => c.aktion("empty"),
  });
  W.add("storage", {
    keys: ["storage"],
    render(el, c) {
      const d = (c.daten("storage") || [])[0];
      if (!d) return false;
      const used = Math.round((100 * (d.total - d.free)) / d.total);
      el.innerHTML = `${I.disk}<div class="meter speicher"><div class="row"><span>${d.root.slice(0, 2)}</span><b>${bytes(d.free)} frei</b></div><div class="track"><i style="width:${used}%"></i></div></div>`;
      el.dataset.tip = "Speicherplatz aller Laufwerke";
    },
  });
  W.add("netspeed", {
    keys: ["net"],
    render(el, c) {
      const n = c.daten("net");
      if (!n) return false;
      el.innerHTML = `${I.net}<div class="stack"><span class="klein">↓ ${rate(n.down)}</span><span class="klein">↑ ${rate(n.up)}</span></div>`;
      el.dataset.tip = "Netzwerk: Download / Upload";
    },
    click: () => {},
  });
})();
