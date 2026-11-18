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
  const apps = d.apps || [];
  const zeichnen = (liste) => {
    karte.innerHTML = `<div style="width:380px"><h3>Läuft im Hintergrund</h3>
      ${
        liste.length
          ? `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px">${liste
              .map(
                (a) => `<button class="eintrag" data-pfad="${w.esc(a.path)}" title="${w.esc(a.name)} · Klick = öffnen · Rechtsklick = beenden" style="flex-direction:column;gap:3px;padding:8px 2px;min-width:0;overflow:hidden">
                ${a.icon ? `<img src="${a.icon}" style="width:28px;height:28px">` : '<span style="width:28px;height:28px;border-radius:7px;background:#3a3348"></span>'}
                <span style="font-size:10px;line-height:1.15;text-align:center;max-height:2.3em;overflow:hidden;width:100%;word-break:break-word">${w.esc(a.name)}</span></button>`,
              )
              .join("")}</div>`
          : '<p class="leise">Keine Programme im Hintergrund.</p>'
      }
      <p class="leise" style="font-size:10.5px;margin:8px 0 0">Klick = Fenster zurückholen · Rechtsklick = beenden</p></div>`;
    karte.querySelectorAll("[data-pfad]").forEach((b) => {
      b.onclick = () => (w.aktion("open", b.dataset.pfad), w.schliessen());
      b.oncontextmenu = async (e) => {
        e.preventDefault();
        const r = await w.aktion("quit", b.dataset.pfad);
        if (r?.apps) (zeichnen(r.apps), w.neuZeichnen());
      };
    });
  };
  zeichnen(apps);
});
