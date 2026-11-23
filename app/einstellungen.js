// Einstellungsfenster: Navigation links, Inhalte in Reitern.
const api = window.dock;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- Reiter ----------
function zeigeReiter(name) {
  document.querySelectorAll(".reiter").forEach((b) => b.classList.toggle("an", b.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + name));
  $("inhalt").scrollTop = 0;
  try {
    localStorage.setItem("reiter", name);
  } catch {}
}
document.querySelectorAll(".reiter").forEach((b) => (b.onclick = () => zeigeReiter(b.dataset.tab)));
let start = "widgets";
try {
  start = localStorage.getItem("reiter") || start;
} catch {}
zeigeReiter(start);

// ---------- Zustand vom Hauptprozess ----------
let katalog = [];
let gruppen = [];
let reihenfolge = [];
let ziehen = false; // Regler wird gerade bewegt
let cfg = null;
api.on("settings-state", ({ config, displays, pins, catalog, groups, version }) => {
  if (!ziehen) bildschirmeZeichnen(displays || [], config);
  katalog = catalog || [];
  gruppen = groups || [];
  reihenfolge = config.widgetOrder || [];
  cfg = config;
  if (version) $("version").textContent = "Version " + version;
  widgetsZeichnen();
  woptZeichnen();
  pinsZeichnen(pins || []);
  if (document.activeElement !== $("channel")) $("channel").value = config.channel;
  if (document.activeElement !== $("weatherCity")) $("weatherCity").value = config.weatherCity;
  $("streamScope").value = config.streamScope;
  $("hideWindowsTaskbar").checked = config.hideWindowsTaskbar;
  $("autostart").checked = config.autostart;
  $("allMonitors").checked = config.allMonitors !== false;
  $("ownStartMenu").checked = config.ownStartMenu !== false;
  $("autoUpdate").checked = config.autoUpdate !== false;
  const l = config.look;
  if (!ziehen) {
    $("barColor").value = l.barColor;
    $("accent").value = l.accent;
    $("opacity").value = Math.round(l.opacity * 100);
    $("scale").value = Math.round(l.scale * 100);
    $("magnifyLevel").value = Math.round(l.magnifyLevel * 100);
  }
  $("magnify").checked = l.magnify;
  $("previews").checked = l.previews !== false;
  $("magnifyRow").hidden = !l.magnify;
  document.querySelectorAll("#breite button").forEach((b) => b.classList.toggle("an", (b.dataset.full === "1") === !!l.fullWidth));
  // Aussehen gilt für alle Fenster des Docks – auch für dieses Einstellungsfenster
  document.documentElement.style.setProperty("--lila", l.accent);
  document.documentElement.style.setProperty("--bar-farbe", l.barColor);
  werteZeigen();
  startmenueZeigen(config.startMenu || {});
});

// ---------- Startmenü ----------
const SM_ORDNER = [
  ["dokumente", "Dokumente"], ["downloads", "Downloads"], ["bilder", "Bilder"], ["musik", "Musik"], ["videos", "Videos"],
  ["persoenlich", "Persönlicher Ordner"], ["netzwerk", "Netzwerk"], ["explorer", "Explorer"], ["einstellungen", "Einstellungen"],
];
const sm = (patch) => api.invoke("settings-save", { startMenu: patch });
function startmenueZeigen(s) {
  document.querySelectorAll("#smPosition button").forEach((b) => b.classList.toggle("an", b.dataset.pos === (s.position || "mitte")));
  if (!ziehen) {
    $("smGroesse").value = Math.round((s.groesse || 1) * 100);
    $("smSpalten").value = s.spalten || 6;
  }
  $("smGroesseVal").textContent = $("smGroesse").value + " %";
  $("smSpaltenVal").textContent = $("smSpalten").value + " Spalten";
  $("smLayout").value = s.layout || "standard";
  $("smStartReiter").value = s.startReiter || "pins";
  $("smZuletzt").checked = s.zuletzt !== false;
  $("smDateien").checked = s.dateien !== false;
  $("smKonto").checked = s.konto !== false;
  const an = new Set(s.ordner || []);
  $("smOrdner").innerHTML = SM_ORDNER.map(([k, n]) => `<label><input type="checkbox" data-ordner="${k}"${an.has(k) ? " checked" : ""}>${esc(n)}</label>`).join("");
  $("smOrdner").querySelectorAll("[data-ordner]").forEach(
    (c) => (c.onchange = () => sm({ ordner: [...$("smOrdner").querySelectorAll("[data-ordner]:checked")].map((x) => x.dataset.ordner) })),
  );
}
document.querySelectorAll("#smPosition button").forEach((b) => (b.onclick = () => sm({ position: b.dataset.pos })));
$("smGroesse").addEventListener("input", () => ((ziehen = true), ($("smGroesseVal").textContent = $("smGroesse").value + " %")));
$("smGroesse").addEventListener("change", () => ((ziehen = false), sm({ groesse: $("smGroesse").value / 100 })));
$("smSpalten").addEventListener("input", () => ((ziehen = true), ($("smSpaltenVal").textContent = $("smSpalten").value + " Spalten")));
$("smSpalten").addEventListener("change", () => ((ziehen = false), sm({ spalten: Number($("smSpalten").value) })));
$("smLayout").onchange = () => sm({ layout: $("smLayout").value });
$("smStartReiter").onchange = () => sm({ startReiter: $("smStartReiter").value });
for (const [id, key] of [["smZuletzt", "zuletzt"], ["smDateien", "dateien"], ["smKonto", "konto"]]) $(id).onchange = () => sm({ [key]: $(id).checked });
$("smReset").onclick = () => sm({ pinsZuruecksetzen: true });

// ---------- Größe je Bildschirm (nur bei mehreren Bildschirmen) ----------
function bildschirmeZeichnen(displays, config) {
  // Immer sichtbar, damit man die Funktion findet – bei nur einem Bildschirm bzw. abgeschaltetem
  // „Auf allen Bildschirmen“ mit Hinweis statt Reglern.
  $("bildschirme").hidden = false;
  const liste = $("bildschirmListe");
  liste.innerHTML = "";
  const hinweis = (text) => {
    const p = document.createElement("div");
    p.className = "row";
    p.innerHTML = `<span><small>${esc(text)}</small></span>`;
    liste.append(p);
  };
  if (displays.length < 2) return hinweis("Gerade ist nur ein Bildschirm angeschlossen – dafür gilt die Größe oben. Sobald ein zweiter dran ist, stellst du hier für jeden Bildschirm eine eigene Größe ein.");
  if (config.allMonitors === false) return hinweis("Das Dock läuft gerade nur auf dem Hauptbildschirm. Schalte unter Allgemein „Auf allen Bildschirmen“ ein, dann kannst du hier jedem Bildschirm eine eigene Größe geben.");
  for (const d of displays) {
    const eigen = typeof d.scale === "number";
    const wert = Math.round((eigen ? d.scale : config.look.scale) * 100);
    const zeile = document.createElement("div");
    zeile.className = "row";
    zeile.innerHTML = `<span>${esc(d.name)}<small>${esc(d.size)} · <span class="wert">${eigen ? wert + " %" : "wie oben (" + wert + " %)"}</span></small></span>
      <span style="display:flex;align-items:center;gap:10px"><label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" class="eigen"${eigen ? " checked" : ""}>eigene</label>
      <input type="range" class="groesse" min="75" max="150" step="5" value="${wert}"${eigen && !d.aus ? "" : " disabled"}>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px" title="Leiste auf diesem Bildschirm – aus: dort weder Dock noch Windows-Taskleiste"><input type="checkbox" class="schalter leiste"${d.aus ? "" : " checked"}${!d.aus && displays.filter((x) => !x.aus).length <= 1 ? " disabled" : ""}>Leiste</label></span>`;
    const regler = zeile.querySelector(".groesse");
    const haken = zeile.querySelector(".eigen");
    const anzeige = zeile.querySelector(".wert");
    const speichern = () => api.invoke("settings-save", { displayScale: { id: d.id, scale: haken.checked ? regler.value / 100 : null } });
    haken.addEventListener("change", () => {
      regler.disabled = !haken.checked;
      anzeige.textContent = haken.checked ? regler.value + " %" : "wie oben (" + Math.round(config.look.scale * 100) + " %)";
      speichern();
    });
    regler.addEventListener("input", () => ((ziehen = true), (anzeige.textContent = regler.value + " %")));
    regler.addEventListener("change", () => ((ziehen = false), speichern()));
    zeile.querySelector(".leiste").addEventListener("change", (e) => api.invoke("settings-save", { displayAus: { id: d.id, aus: !e.target.checked } }));
    liste.append(zeile);
  }
}

// ---------- Aussehen ----------
function werteZeigen() {
  $("opacityVal").textContent = $("opacity").value + " %";
  $("scaleVal").textContent = $("scale").value + " %";
  $("magnifyVal").textContent = "+" + ($("magnifyLevel").value - 100) + " %";
}
const look = (patch) => api.invoke("settings-save", { look: patch });
let farbTimer = null;
for (const id of ["barColor", "accent"]) {
  $(id).addEventListener("input", () => {
    clearTimeout(farbTimer);
    farbTimer = setTimeout(() => look({ [id]: $(id).value }), 60); // Vorschau live in der Leiste
  });
}
$("opacity").addEventListener("input", () => ((ziehen = true), werteZeigen(), look({ opacity: $("opacity").value / 100 })));
$("magnifyLevel").addEventListener("input", () => ((ziehen = true), werteZeigen()));
$("scale").addEventListener("input", () => ((ziehen = true), werteZeigen()));
// Größe erst beim Loslassen übernehmen – sonst springt der reservierte Platz ständig
$("scale").addEventListener("change", () => ((ziehen = false), look({ scale: $("scale").value / 100 })));
$("magnifyLevel").addEventListener("change", () => ((ziehen = false), look({ magnifyLevel: $("magnifyLevel").value / 100 })));
$("opacity").addEventListener("change", () => (ziehen = false));
$("magnify").addEventListener("change", () => look({ magnify: $("magnify").checked }));
$("previews").addEventListener("change", () => look({ previews: $("previews").checked }));
document.querySelectorAll("#breite button").forEach((b) => (b.onclick = () => look({ fullWidth: b.dataset.full === "1" })));

const farbkombis = [
  ["OXP Lila", "#18151f", "#8f3cff"],
  ["Neon Pink", "#16121a", "#ff3cc8"],
  ["Neon Cyan", "#10171c", "#28dcff"],
  ["Anthrazit", "#1d1d21", "#a49db3"],
  ["Mitternacht", "#0d1020", "#5b7cff"],
  ["Twitch", "#18181b", "#9146ff"],
  ["Glut", "#1a1412", "#ff7a3d"],
];
$("presets").innerHTML = farbkombis.map(([n, bar, acc]) => `<button title="${n}" data-bar="${bar}" data-acc="${acc}" style="background: linear-gradient(135deg, ${bar} 50%, ${acc} 50%)"></button>`).join("");
$("presets").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) look({ barColor: b.dataset.bar, accent: b.dataset.acc });
});

// ---------- Allgemein, Daten ----------
for (const id of ["channel", "weatherCity"]) $(id).addEventListener("change", () => api.invoke("settings-save", { [id]: $(id).value }));
$("streamScope").addEventListener("change", () => api.invoke("settings-save", { streamScope: $("streamScope").value }));
for (const id of ["hideWindowsTaskbar", "autostart", "allMonitors", "ownStartMenu", "autoUpdate"]) $(id).addEventListener("change", () => api.invoke("settings-save", { [id]: $(id).checked }));
$("quit").addEventListener("click", () => api.invoke("quit"));

// ---------- Programme (per Ziehen sortieren) ----------
let pinZiehen = null;
function pinsZeichnen(pins) {
  $("pins").innerHTML =
    pins
      .map(
        (p, i) => `<div class="pin" draggable="true" data-i="${i}">
        <svg class="griff" viewBox="0 0 24 24"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>
        ${p.icon ? `<img src="${esc(p.icon)}" alt="">` : '<span class="ph"></span>'}
        <span class="name" title="${esc(p.path)}">${esc(p.name)}${p.appId ? "<small>App</small>" : ""}</span>
        <button data-remove="${i}" title="Lösen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`,
      )
      .join("") || '<p class="leer">Noch nichts angeheftet.</p>';
}
$("pins").addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]");
  if (b) api.invoke("settings-remove-pin", +b.dataset.remove);
});
$("pins").addEventListener("dragstart", (e) => {
  const el = e.target.closest(".pin");
  if (!el) return;
  pinZiehen = +el.dataset.i;
  e.dataTransfer.effectAllowed = "move";
  requestAnimationFrame(() => el.classList.add("ziehe"));
});
$("pins").addEventListener("dragover", (e) => {
  if (pinZiehen === null) return;
  e.preventDefault();
  document.querySelectorAll(".pin.drop-vor").forEach((x) => x.classList.remove("drop-vor"));
  e.target.closest(".pin")?.classList.add("drop-vor");
});
$("pins").addEventListener("drop", async (e) => {
  e.preventDefault();
  const ziel = e.target.closest(".pin");
  const von = pinZiehen;
  pinZiehen = null;
  if (von === null || !ziel) return;
  let nach = +ziel.dataset.i;
  // Schritt für Schritt verschieben (vorhandene Funktion im Hauptprozess)
  const dir = nach > von ? 1 : -1;
  for (let i = von; i !== nach; i += dir) await api.invoke("settings-move-pin", { index: i, dir });
});
$("pins").addEventListener("dragend", () => {
  pinZiehen = null;
  document.querySelectorAll(".pin.ziehe, .pin.drop-vor").forEach((x) => x.classList.remove("ziehe", "drop-vor"));
});
$("add").addEventListener("click", () => api.invoke("settings-add-pin"));
$("import").addEventListener("click", () => api.invoke("settings-import-windows-pins"));

// ---------- Widgets ----------
let filterGruppe = "alle";
const bild = (id) => `assets/widgets/${esc(id)}.png`;
const nameVon = (id) => katalog.find((w) => w.id === id)?.name || id;

function widgetsZeichnen() {
  $("aktivZahl").textContent = reihenfolge.length;
  $("aktiveWidgets").innerHTML =
    reihenfolge
      .map(
        (id, i) => `<div class="chip" draggable="true" data-i="${i}" title="${esc(nameVon(id))} – ziehen zum Sortieren">
        <img src="${bild(id)}" alt=""><span>${esc(nameVon(id))}</span>
        <button class="weg" data-wremove="${i}" title="Aus der Leiste nehmen"><svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`,
      )
      .join("") || '<p class="leer">Noch keine Widgets in der Leiste – unten welche hinzufügen.</p>';

  $("filter").innerHTML = [{ id: "alle", name: "Alle" }, ...gruppen]
    .map((g) => `<button data-g="${g.id}" class="${g.id === filterGruppe ? "an" : ""}">${esc(g.name)}</button>`)
    .join("");
  const q = $("wsuche").value.trim().toLowerCase();
  const liste = katalog.filter(
    (w) => (filterGruppe === "alle" || w.group === filterGruppe) && (!q || w.name.toLowerCase().includes(q) || (w.desc || "").toLowerCase().includes(q)),
  );
  const gName = (id) => gruppen.find((g) => g.id === id)?.name || "";
  $("katalog").innerHTML =
    liste
      .map((w) => {
        const drin = reihenfolge.includes(w.id);
        return `<div class="wkarte ${drin ? "drin" : ""}">
          <div class="bildflaeche"><img src="${bild(w.id)}" alt=""></div>
          <div class="text"><b>${esc(w.name)}</b><small>${esc(w.desc || "")}</small></div>
          <div class="fuss"><span class="gruppe">${esc(gName(w.group))}</span>${w.options?.length ? `<button class="knopf" data-wopt="${esc(w.id)}" title="Einstellungen dieses Widgets" style="margin-left:auto">⚙</button>` : ""}
            ${drin ? `<button class="knopf drin" data-wweg="${esc(w.id)}">✓ In der Leiste</button>` : `<button class="knopf haupt" data-wadd="${esc(w.id)}">+ Hinzufügen</button>`}</div></div>`;
      })
      .join("") || '<p class="leer">Kein Widget gefunden.</p>';
}
function reihenfolgeSpeichern(neu) {
  reihenfolge = neu;
  widgetsZeichnen();
  api.invoke("settings-save", { widgetOrder: neu });
}
$("wsuche").addEventListener("input", widgetsZeichnen);
$("filter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-g]");
  if (b) ((filterGruppe = b.dataset.g), widgetsZeichnen());
});
$("katalog").addEventListener("click", (e) => {
  const opt = e.target.closest("[data-wopt]");
  if (opt) {
    woptAuswahl = opt.dataset.wopt;
    zeigeReiter("wopt");
    woptZeichnen();
    return;
  }
  const plus = e.target.closest("[data-wadd]");
  if (plus) reihenfolgeSpeichern([...reihenfolge, plus.dataset.wadd]);
  const weg = e.target.closest("[data-wweg]");
  if (weg) reihenfolgeSpeichern(reihenfolge.filter((x) => x !== weg.dataset.wweg));
});
// Widgets in der Leiste: entfernen und per Ziehen sortieren
let chipZiehen = null;
const box = $("aktiveWidgets");
box.addEventListener("click", (e) => {
  const b = e.target.closest("[data-wremove]");
  if (!b) return;
  const neu = [...reihenfolge];
  neu.splice(+b.dataset.wremove, 1);
  reihenfolgeSpeichern(neu);
});
box.addEventListener("dragstart", (e) => {
  const el = e.target.closest(".chip");
  if (!el) return;
  chipZiehen = +el.dataset.i;
  e.dataTransfer.effectAllowed = "move";
  requestAnimationFrame(() => el.classList.add("ziehe"));
});
box.addEventListener("dragover", (e) => {
  if (chipZiehen === null) return;
  e.preventDefault();
  box.querySelectorAll(".drop-vor").forEach((x) => x.classList.remove("drop-vor"));
  e.target.closest(".chip")?.classList.add("drop-vor");
});
box.addEventListener("drop", (e) => {
  e.preventDefault();
  const ziel = e.target.closest(".chip");
  const von = chipZiehen;
  chipZiehen = null;
  if (von === null) return;
  const neu = [...reihenfolge];
  const [id] = neu.splice(von, 1);
  let nach = ziel ? +ziel.dataset.i : neu.length;
  if (ziel && nach > von) nach--;
  neu.splice(nach, 0, id);
  reihenfolgeSpeichern(neu);
});
box.addEventListener("dragend", () => {
  chipZiehen = null;
  box.querySelectorAll(".ziehe, .drop-vor").forEach((x) => x.classList.remove("ziehe", "drop-vor"));
});


// ---------- Widget-Einstellungen ----------
let woptAuswahl = null;
const optWert = (id, o) => {
  const v = cfg?.widgetOptions?.[id]?.[o.key];
  return v === undefined ? o.default : v;
};
const optSichtbar = (id, o, alle) => {
  if (!o.when) return true;
  const ref = alle.find((x) => x.key === o.when.key);
  const v = ref ? optWert(id, ref) : undefined;
  if ("not" in o.when) return v !== o.when.not;
  return v === o.when.value;
};
function woptZeichnen() {
  if (!cfg) return;
  const mitOpt = katalog.filter((w) => w.options?.length);
  const inLeiste = reihenfolge.map((id) => mitOpt.find((w) => w.id === id)).filter(Boolean);
  const andere = mitOpt.filter((w) => !reihenfolge.includes(w.id));
  if (!woptAuswahl || !mitOpt.some((w) => w.id === woptAuswahl)) woptAuswahl = (inLeiste[0] || andere[0])?.id;
  const eintrag = (w) => `<button class="wopt-eintrag ${w.id === woptAuswahl ? "an" : ""}" data-wid="${esc(w.id)}"><span>${esc(w.name)}</span><small>${w.options.length} ${w.options.length === 1 ? "Option" : "Optionen"}</small></button>`;
  $("woptListe").innerHTML =
    (inLeiste.length ? "<h3>In der Leiste</h3>" + inLeiste.map(eintrag).join("") : "") + (andere.length ? "<h3>Weitere Widgets</h3>" + andere.map(eintrag).join("") : "");
  // Details nicht unter den Fingern neu aufbauen, während ein Regler bewegt wird
  if ($("woptDetail").contains(document.activeElement) && document.activeElement.matches("input[type=range]")) return;
  const w = mitOpt.find((x) => x.id === woptAuswahl);
  if (!w) return ($("woptDetail").innerHTML = '<p class="leer">Kein Widget mit Einstellungen.</p>');
  const drin = reihenfolge.includes(w.id);
  const zeilen = w.options
    .filter((o) => optSichtbar(w.id, o, w.options))
    .map((o) => {
      const v = optWert(w.id, o);
      const text = `<span>${esc(o.label)}${o.desc ? `<small>${esc(o.desc)}</small>` : ""}</span>`;
      if (o.type === "toggle") return `<label class="row">${text}<input type="checkbox" class="schalter" data-opt="${o.key}" ${v ? "checked" : ""}></label>`;
      if (o.type === "select")
        return `<label class="row">${text}<select class="eingabe" data-opt="${o.key}">${o.choices.map(([c, t]) => `<option value="${esc(c)}" ${c === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
      if (o.type === "range")
        return `<label class="row"><span>${esc(o.label)}<span class="wert" data-wert="${o.key}">${v}${o.unit || ""}</span>${o.desc ? `<small>${esc(o.desc)}</small>` : ""}</span><input type="range" data-opt="${o.key}" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${v}"></label>`;
      if (o.type === "color") return `<label class="row">${text}<input type="color" data-opt="${o.key}" value="${esc(v)}"></label>`;
      return "";
    })
    .join("");
  $("woptDetail").innerHTML = `<div class="vorschau-gross"><img src="assets/widgets/${esc(w.id)}.png" alt=""></div>
    <div class="karte"><h2 class="titel">${esc(w.name)}</h2><p class="hint" style="margin:0 0 8px">${esc(w.desc || "")}</p>
      ${drin ? "" : `<p class="hint" style="color:var(--lila-hell)">Dieses Widget ist gerade nicht in der Leiste. <button class="knopf" id="woptRein">Zur Leiste hinzufügen</button></p>`}
      ${zeilen}
      <div class="wopt-fuss"><span class="hint">Wird sofort übernommen.</span><button class="knopf" id="woptReset">Standard wiederherstellen</button></div></div>`;
  const speichern = (key, value) => api.invoke("settings-save", { widgetOption: { id: w.id, key, value } });
  let t = null;
  $("woptDetail").querySelectorAll("[data-opt]").forEach((el) => {
    const o = w.options.find((x) => x.key === el.dataset.opt);
    if (o.type === "toggle") el.onchange = () => speichern(o.key, el.checked);
    else if (o.type === "select") el.onchange = () => speichern(o.key, el.value);
    else if (o.type === "color") el.oninput = () => (clearTimeout(t), (t = setTimeout(() => speichern(o.key, el.value), 80)));
    else if (o.type === "range") {
      el.oninput = () => {
        $("woptDetail").querySelector(`[data-wert="${o.key}"]`).textContent = el.value + (o.unit || "");
        clearTimeout(t);
        t = setTimeout(() => speichern(o.key, Number(el.value)), 120); // Vorschau live in der Leiste
      };
      el.onchange = () => el.blur();
    }
  });
  $("woptReset").onclick = () => api.invoke("settings-save", { widgetOptionsReset: w.id });
  const rein = $("woptRein");
  if (rein) rein.onclick = () => reihenfolgeSpeichern([...reihenfolge, w.id]);
}
$("woptListe").addEventListener("click", (e) => {
  const b = e.target.closest("[data-wid]");
  if (!b) return;
  woptAuswahl = b.dataset.wid;
  document.activeElement?.blur?.();
  woptZeichnen();
});

// ---------- Lizenz ----------
function lizenzZeigen(s) {
  if (!s) return;
  $("lizenzText").textContent = s.text || "–";
  if (s.key && !$("lizenzKey").value) $("lizenzKey").placeholder = s.key;
}
$("lizenzKey").addEventListener("input", () => {
  // Schlüssel säubern: alles außer Buchstaben/Ziffern weg, ein vorangestelltes „DOCK“ nur einmal – egal ob
  // getippt, mit Bindestrichen, Leerzeichen oder Zeilenumbruch eingefügt
  const roh = $("lizenzKey").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if ("DOCK".startsWith(roh)) return; // „D“, „DO“, „DOC“ – noch am Tippen, nichts umbauen
  const ohne = (roh.startsWith("DOCK") ? roh.slice(4) : roh).slice(0, 12);
  $("lizenzKey").value = ["DOCK", ohne.slice(0, 4), ohne.slice(4, 8), ohne.slice(8, 12)].filter((t, i) => i === 0 || t).join("-");
});
$("lizenzLos").addEventListener("click", async () => {
  $("lizenzMeldung").textContent = "Prüfe …";
  const s = await api.invoke("lizenz-eingeben", $("lizenzKey").value.trim());
  $("lizenzMeldung").textContent = s.valid ? "✓ Freigeschaltet." : s.text || "Ungültig.";
  if (s.valid) (($("lizenzKey").value = ""), lizenzZeigen(s));
});
$("lizenzNeu").addEventListener("click", async () => lizenzZeigen(await api.invoke("lizenz-pruefen")));
api.on("lizenz-status", lizenzZeigen);
api.invoke("lizenz-status").then(lizenzZeigen);

// ---------- Updates ----------
$("updateCheck").addEventListener("click", () => api.invoke("update-check"));
api.on("update-status", (z) => {
  $("updateText").textContent = z?.text || "Noch nicht geprüft";
  const b = $("updateBalken");
  b.hidden = z?.fortschritt == null;
  if (!b.hidden) b.querySelector("i").style.width = z.fortschritt + "%";
});

api.invoke("settings-load");
