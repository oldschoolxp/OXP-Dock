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
OXPAnsichten.add("tray", (karte, d, w) => {
  const refreshIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2 6m2-12v6h-6"/></svg>';
  const stopIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10m0-10L7 17"/></svg>';
  const appIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16"/></svg>';
  const apps = d.apps || [];
  const rows = apps.map((a, index) => `<li class="tray-row" data-app="${index}">
    <button class="tray-open" title="${w.esc(a.name + "\n" + a.path)}">
      ${a.icon ? `<img src="${w.esc(a.icon)}" alt="">` : `<span class="tray-placeholder">${appIcon}</span>`}
      <span class="tray-name">${w.esc(a.name)}</span>
    </button>
    ${a.canQuit ? `<button class="tray-icon tray-quit" title="Programm beenden" aria-label="${w.esc(a.name)} beenden">${stopIcon}</button>` : ""}
  </li>`).join("");
  const status = d.loading ? "Programme werden geladen …" : d.error || (rows ? "" : "Keine Hintergrundprogramme gefunden.");
  karte.innerHTML = `<section class="tray-panel" aria-labelledby="tray-title">
    <header class="tray-header">
      <h3 id="tray-title">Hintergrundprogramme</h3>
      <button class="tray-icon tray-refresh" aria-label="Liste aktualisieren" title="Liste aktualisieren"${d.loading ? " disabled" : ""}>${refreshIcon}</button>
    </header>
    <p class="tray-status" role="status"${status ? "" : " hidden"}>${w.esc(status)}</p>
    <ul class="tray-list"${rows ? "" : " hidden"}>${rows}</ul>
    <div class="tray-confirm" hidden>
      <p></p>
      <div><button class="knopf tray-cancel">Abbrechen</button><button class="knopf tray-stop">Beenden</button></div>
    </div>
  </section>`;

  const panel = karte.querySelector(".tray-panel");
  const refresh = panel.querySelector(".tray-refresh");
  const list = panel.querySelector(".tray-list");
  const message = panel.querySelector(".tray-status");
  const confirm = panel.querySelector(".tray-confirm");
  const cancel = panel.querySelector(".tray-cancel");
  const stop = panel.querySelector(".tray-stop");
  let pending = false;
  let selection;
  let trigger;

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

  function closeConfirm() {
    confirm.hidden = true;
    list.hidden = false;
    refresh.disabled = false;
    trigger?.focus();
    w.neuZeichnen();
  }

  function ask(row, button) {
    const app = apps[Number(row.dataset.app)];
    if (pending || !app.canQuit) return;
    selection = app;
    trigger = button;
    message.hidden = true;
    confirm.querySelector("p").textContent = `„${selection.name}“ beenden?`;
    list.hidden = true;
    refresh.disabled = true;
    confirm.hidden = false;
    cancel.focus();
    w.neuZeichnen();
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
      else showStatus(result?.error || "Die Aktion konnte nicht ausgeführt werden.");
    } catch {
      if (panel.isConnected) showStatus("Die Aktion konnte nicht ausgeführt werden.");
    } finally {
      pending = false;
      refresh.disabled = false;
    }
  }

  refresh.onclick = reload;
  list.onclick = (e) => {
    const row = e.target.closest("[data-app]");
    if (!row) return;
    if (e.target.closest(".tray-quit")) ask(row, row.querySelector(".tray-quit"));
    if (e.target.closest(".tray-open")) act("open", apps[Number(row.dataset.app)]);
  };
  list.oncontextmenu = (e) => {
    const row = e.target.closest("[data-app]");
    if (row) ask(row, row.querySelector(".tray-open"));
  };
  cancel.onclick = closeConfirm;
  stop.onclick = () => {
    closeConfirm();
    act("quit", selection);
  };
  if (d.loading) reload();
});
