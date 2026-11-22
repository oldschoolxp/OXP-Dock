// Ansichten für das Popup. Jede Ansicht bekommt (karte, daten, werkzeuge) und zeichnet sich in die Karte.

// ---------- Fenster-Vorschau ----------
OXPAnsichten.add("preview", (karte, { items }, { api, esc }) => {
  const x = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  // Windows zeichnet das Fenster live in das Kästchen „.bild“ – darunter nur ein Platzhalter, falls das nicht klappt
  karte.innerHTML = `<div class="vorschau">${items
    .map((it) => {
      const bild = `<div class="leer">${it.icon ? `<img src="${esc(it.icon)}" alt="">` : ""}</div>`;
      return `<button class="vs${it.active ? " aktiv" : ""}" data-hwnd="${it.hwnd}">
        <div class="kopf">${it.icon ? `<img src="${esc(it.icon)}" alt="">` : ""}<span title="${esc(it.title)}">${esc(it.title)}</span></div>
        <div class="bild">${bild}</div>
        <span class="zu" data-zu="${it.hwnd}" title="Schließen">${x}</span>
      </button>`;
    })
    .join("")}</div>`;
  karte.onclick = (e) => {
    const zu = e.target.closest("[data-zu]");
    if (zu) {
      e.stopPropagation();
      api.invoke("preview-close-window", Number(zu.dataset.zu));
      zu.closest(".vs").style.opacity = ".35";
      return;
    }
    const vs = e.target.closest(".vs");
    if (vs) api.invoke("preview-activate", Number(vs.dataset.hwnd));
  };
  // Positionen der Bild-Kästchen melden – nach dem Einblenden noch einmal, weil die Karte dabei leicht wächst
  const melden = () => {
    const boxen = [...karte.querySelectorAll(".vs")].map((vs) => {
      const r = vs.querySelector(".bild").getBoundingClientRect();
      return { hwnd: Number(vs.dataset.hwnd), x: r.left + 2, y: r.top + 2, width: r.width - 4, height: r.height - 4 };
    });
    api.invoke("preview-rects", boxen);
  };
  setTimeout(melden, 40);
  setTimeout(melden, 220);
});

// ---------- Hintergrund-Programme („^“) ----------
// Wie der Überlauf-Bereich der Windows-11-Taskleiste: Symbole im Raster, Name beim Drüberfahren,
// Linksklick = öffnen, Rechtsklick = Menü im OXP-Stil (Öffnen, Speicherort, Am Dock anheften, Beenden).
OXPAnsichten.add("tray", (karte, d, w) => {
  const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const I = {
    neu: svg('<path d="M20 11a8 8 0 1 0-2 6m2-12v6h-6"/>'),
    app: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16"/>'),
    oeffnen: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    ordner: svg('<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    pin: svg('<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v8"/>'),
    stopp: svg('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>'),
  };
  const apps = d.apps || [];
  const kacheln = apps
    .map(
      (a, i) => `<li><button class="tray-knopf" data-app="${i}" title="${w.esc(a.name)}" aria-label="${w.esc(a.name)}">
        ${a.icon ? `<img src="${w.esc(a.icon)}" alt="">` : `<span class="tray-placeholder">${I.app}</span>`}</button></li>`,
    )
    .join("");
  const status = d.loading ? "Programme werden geladen …" : d.error || (kacheln ? "" : "Keine Hintergrundprogramme gefunden.");
  karte.innerHTML = `<section class="tray-panel" aria-labelledby="tray-title">
    <header class="tray-header">
      <h3 id="tray-title">Hintergrundprogramme</h3>
      <button class="tray-icon tray-refresh" aria-label="Liste aktualisieren" title="Liste aktualisieren"${d.loading ? " disabled" : ""}>${I.neu}</button>
    </header>
    <p class="tray-status" role="status"${status ? "" : " hidden"}>${w.esc(status)}</p>
    <ul class="tray-gitter"${kacheln ? "" : " hidden"}>${kacheln}</ul>
    <div class="tray-name-zeile"${kacheln ? "" : " hidden"}>&nbsp;</div>
    <div class="tray-frage" hidden><p></p><div><button class="knopf tray-cancel">Abbrechen</button><button class="knopf tray-stop">Beenden</button></div></div>
  </section>`;

  const panel = karte.querySelector(".tray-panel");
  const refresh = panel.querySelector(".tray-refresh");
  const gitter = panel.querySelector(".tray-gitter");
  const nameZeile = panel.querySelector(".tray-name-zeile");
  const message = panel.querySelector(".tray-status");
  const frage = panel.querySelector(".tray-frage");
  let pending = false;

  function showStatus(text) {
    message.textContent = text;
    message.hidden = !text;
    w.neuZeichnen();
  }
  function reload() {
    refresh.disabled = true;
    showStatus("Programme werden geladen …");
    return w.neuLaden({ laden: true });
  }
  async function act(action, app) {
    if (pending) return;
    pending = true;
    refresh.disabled = true;
    try {
      const result = await w.aktion(action, app.path);
      if (!panel.isConnected) return;
      if (result?.ok) return w.schliessen();
      if (result?.refresh) await reload();
      else if (result?.error) showStatus(result.error);
    } catch {
      if (panel.isConnected) showStatus("Die Aktion konnte nicht ausgeführt werden.");
    } finally {
      pending = false;
      refresh.disabled = false;
    }
  }
  function beendenFragen(app) {
    frage.querySelector("p").textContent = `„${app.name}“ beenden?`;
    frage.hidden = false;
    w.neuZeichnen();
    frage.querySelector(".tray-cancel").onclick = () => ((frage.hidden = true), w.neuZeichnen());
    frage.querySelector(".tray-stop").onclick = () => ((frage.hidden = true), act("quit", app));
    frage.querySelector(".tray-cancel").focus();
  }

  refresh.onclick = reload;
  const appVon = (e) => {
    const b = e.target.closest("[data-app]");
    return b ? { b, app: apps[Number(b.dataset.app)] } : null;
  };
  gitter.onclick = (e) => {
    const t = appVon(e);
    if (t) act("open", t.app);
  };
  gitter.onmouseover = (e) => {
    const t = appVon(e);
    nameZeile.textContent = t ? t.app.name : " ";
  };
  gitter.onmouseleave = () => (nameZeile.textContent = " ");
  gitter.oncontextmenu = (e) => {
    const t = appVon(e);
    if (!t) return;
    gitter.querySelectorAll(".offen").forEach((x) => x.classList.remove("offen"));
    t.b.classList.add("offen");
    OXPMenue.zeigen(e, [
      { titel: t.app.name },
      { text: "Öffnen", icon: I.oeffnen, tun: () => act("open", t.app) },
      { text: "Dateispeicherort öffnen", icon: I.ordner, tun: () => act("folder", t.app) },
      { text: "Am Dock anheften", icon: I.pin, tun: () => act("pin", t.app) },
      { trenner: true },
      { text: "Beenden", icon: I.stopp, gefahr: true, aus: !t.app.canQuit, tun: () => beendenFragen(t.app) },
    ]);
  };
  if (d.loading) reload();
});
