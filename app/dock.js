// Oberfläche des Docks: baut Symbole und Widgets aus den Daten des Hauptprozesses.
const api = window.dock;
const $ = (id) => document.getElementById(id);

const state = { pins: [], windows: [], foreground: 0, config: { widgets: {} }, widgets: {}, icons: {} };

window.OXPState = state;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const base = (p) => String(p || "").split(/[\\/]/).pop().toLowerCase();
window.OXPesc = esc;

// ---------- feste Knöpfe ----------
// Klick: OXP-Startmenü über dem Würfel (bzw. Windows-Startmenü, wenn in den Einstellungen so gewählt)
$("start").addEventListener("click", () => {
  hideTip();
  const r = $("start").getBoundingClientRect();
  // „mitte“: die ganze Leiste – das Startmenü öffnet sich dann mittig darüber (wie bei Windows 11)
  const b = $("bar").getBoundingClientRect();
  api.invoke("start-menu", { x: r.left, y: r.top, width: r.width, height: r.height, mitte: { x: b.left, y: r.top, width: b.width, height: r.height } });
});
$("start").addEventListener("contextmenu", (e) => { e.preventDefault(); api.invoke("start-menu-context"); });
// Lupe, „^“ und Uhr öffnen eigene Fenster über der Leiste.
const fensterAuf = (id, el) => {
  hideTip();
  const r = el.getBoundingClientRect();
  api.invoke("widget-popup", { id, source: el.id, rect: { x: r.left, y: r.top, width: r.width, height: r.height } });
};
$("search").addEventListener("click", () => fensterAuf("suche", $("search")));
$("tray").addEventListener("click", () => fensterAuf("tray", $("tray")));
const quick = $("quick");
// Klick: eigenes Netzwerk-Menü direkt über dem Symbol (das Windows-Menü sitzt immer am rechten Bildschirmrand).
// Rechtsklick: das Windows-Menü (Win+A).
quick.addEventListener("click", () => {
  hideTip();
  const r = quick.getBoundingClientRect();
  api.invoke("widget-popup", { id: "netz", rect: { x: r.left, y: r.top, width: r.width, height: r.height } });
});
quick.addEventListener("contextmenu", (e) => { e.preventDefault(); hideTip(); api.invoke("keys", "quick"); });
quick.addEventListener("focus", () => showTip(quick));
quick.addEventListener("blur", () => { if (tipFor === quick) hideTip(); });
const clock = $("clock");
clock.addEventListener("click", () => fensterAuf("calendar", clock));
clock.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  hideTip();
  api.invoke("keys", "notifications");
});
$("desktop").addEventListener("click", () => api.invoke("keys", "desktop"));
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  // freie Stelle (nicht auf Symbol, Widget oder Knopf) → Original-Menü der Windows-Taskleiste
  if (!e.target.closest(".app, .widget, button, #tip")) api.invoke("bar-menu");
});

// ---------- Programme & Fenster ----------
function buildGroups() {
  const groups = [];
  const byMatch = new Map();
  for (const p of state.pins) {
    const g = { match: p.match, name: p.name, icon: p.icon, pinPath: p.path, windows: [], pinned: true };
    groups.push(g);
    byMatch.set(p.match, g);
  }
  let firstUnpinned = true;
  for (const w of state.windows) {
    const m = w.group || base(w.exe);
    let g = byMatch.get(m);
    if (!g) {
      g = { match: m, name: w.title, icon: state.icons[w.iconKey], pinPath: null, windows: [], pinned: false, firstUnpinned };
      firstUnpinned = false;
      groups.push(g);
      byMatch.set(m, g);
    }
    if (!g.icon) g.icon = state.icons[w.iconKey];
    g.windows.push(w);
  }
  return groups;
}

let dragMatch = null; // gerade gezogenes Dock-Symbol
let renderPending = false;
let letzterAufbau = "";

function renderApps() {
  if (dragMatch) {
    renderPending = true; // während des Ziehens nicht neu aufbauen
    return;
  }
  const groups = buildGroups();
  const aufbau = groups.map((g) => [g.match, g.pinned, g.windows.length, g.windows.some((w) => w.hwnd === state.foreground), !!g.icon, g.firstUnpinned && !g.pinned].join("|")).join("~");
  if (aufbau === letzterAufbau && $("appsTrack").children.length) {
    for (const g of groups) {
      const el = $("appsTrack").querySelector(`.app[data-match="${CSS.escape(g.match)}"]`);
      if (!el) continue;
      const name = g.pinned ? g.name : g.windows[0]?.title || g.name;
      el.dataset.tip = g.windows.length > 1 ? `${name} · ${g.windows.length} Fenster` : g.windows.length ? g.windows[0].title : name;
    }
    return;
  }
  letzterAufbau = aufbau;
  const html = [];
  for (const g of groups) {
    if (!g.pinned && g.firstUnpinned && state.pins.length) html.push('<div class="app-sep"></div>');
    const active = g.windows.some((w) => w.hwnd === state.foreground);
    const name = g.pinned ? g.name : g.windows[0]?.title || g.name;
    const tip = g.windows.length > 1 ? `${name} · ${g.windows.length} Fenster` : g.windows.length ? g.windows[0].title : name;
    const dots = g.windows.slice(0, 3).map(() => "<i></i>").join("");
    const img = g.icon ? `<img src="${esc(g.icon)}" alt="" draggable="false">` : `<span class="fallback">${esc((g.name || "?").slice(0, 1).toUpperCase())}</span>`;
    html.push(
      `<button class="app${active ? " active" : ""}" draggable="true" data-pinned="${g.pinned ? 1 : 0}" data-match="${esc(g.match)}" data-pin="${esc(g.pinPath || "")}" data-name="${esc(g.name)}" data-tip="${esc(tip)}">${img}<span class="dots">${dots}</span></button>`,
    );
  }
  $("appsTrack").innerHTML = html.join("");
  appsScrollTo(appScroll);
  applyMagnify();
}

$("apps").addEventListener("click", (e) => {
  const b = e.target.closest(".app");
  if (!b) return;
  hideTip();
  api.invoke("click-group", { match: b.dataset.match, pinPath: b.dataset.pin || null });
});
$("apps").addEventListener("auxclick", (e) => {
  const b = e.target.closest(".app");
  if (b && e.button === 1) api.invoke("launch-new", b.dataset.pin || null); // Mittelklick = neues Fenster
});
$("apps").addEventListener("contextmenu", (e) => {
  const b = e.target.closest(".app");
  if (!b) return;
  hideTip();
  api.invoke("group-menu", { match: b.dataset.match, pinPath: b.dataset.pin || null, name: b.dataset.name });
});

// ---------- Ziehen: Symbole sortieren, offene Programme anheften, Dateien anheften ----------
function clearDropMarks() {
  document.querySelectorAll(".drop-before").forEach((x) => x.classList.remove("drop-before"));
}
/** Vor welchem angehefteten Symbol soll abgelegt werden? null = ans Ende der angehefteten. */
function dropTarget(e) {
  const pinned = [...document.querySelectorAll('.app[data-pinned="1"]')].filter((b) => b.dataset.match !== dragMatch);
  for (const b of pinned) {
    const r = b.getBoundingClientRect();
    if (e.clientX < r.left + r.width / 2) return b;
  }
  return null;
}
$("apps").addEventListener("dragstart", (e) => {
  const b = e.target.closest(".app");
  if (!b) return;
  hideTip();
  dragMatch = b.dataset.match;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/oxp-match", dragMatch);
  requestAnimationFrame(() => b.classList.add("dragging"));
});
document.addEventListener("dragend", () => {
  dragMatch = null;
  clearDropMarks();
  document.body.classList.remove("drop");
  document.querySelectorAll(".dragging").forEach((x) => x.classList.remove("dragging"));
  if (renderPending) {
    renderPending = false;
    renderApps();
  }
});
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (window.OXPdragWidget) return;
  if (!dragMatch) document.body.classList.add("drop");
  clearDropMarks();
  dropTarget(e)?.classList.add("drop-before");
});
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) {
    document.body.classList.remove("drop");
    clearDropMarks();
  }
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("drop");
  const before = dropTarget(e)?.dataset.match || null;
  clearDropMarks();
  if (dragMatch) {
    const m = dragMatch;
    dragMatch = null;
    api.invoke("reorder-pin", { match: m, beforeMatch: before });
    return;
  }
  const files = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  if (files.length) api.invoke("dropped-files", { files, beforeMatch: before });
});

// ---------- Programme blättern, wenn es zu viele sind ----------
// Maus an den linken/rechten Rand des Programmbereichs = langsam weiterblättern, Mausrad geht auch.
let appScroll = 0;
let randX = null;
let randLauf = false;
function appsMax() {
  return Math.max(0, $("appsTrack").scrollWidth - $("apps").clientWidth);
}
function appsScrollTo(v) {
  const max = appsMax();
  appScroll = Math.max(0, Math.min(max, v));
  $("appsTrack").style.transform = `translateX(${-appScroll}px)`;
  $("apps").classList.toggle("mehr-links", appScroll > 1);
  $("apps").classList.toggle("mehr-rechts", appScroll < max - 1);
}
function randSchritt() {
  if (randX === null) return (randLauf = false);
  const r = $("apps").getBoundingClientRect();
  const zone = 56;
  let tempo = 0;
  if (randX < r.left + zone) tempo = -((r.left + zone - randX) / zone) * 14;
  else if (randX > r.right - zone) tempo = ((randX - (r.right - zone)) / zone) * 14;
  if (tempo && appsMax() > 0) {
    appsScrollTo(appScroll + tempo);
    if (pointerX !== null) applyMagnify();
  }
  requestAnimationFrame(randSchritt);
}
$("apps").addEventListener("mousemove", (e) => {
  randX = e.clientX;
  if (!randLauf && appsMax() > 0) {
    randLauf = true;
    requestAnimationFrame(randSchritt);
  }
});
$("apps").addEventListener("mouseleave", () => (randX = null));
$("apps").addEventListener(
  "wheel",
  (e) => {
    if (appsMax() <= 0) return;
    e.preventDefault();
    appsScrollTo(appScroll + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
  },
  { passive: false },
);
window.addEventListener("resize", () => appsScrollTo(appScroll));

// ---------- Sichtbare Breite der Leiste melden ----------
let letzteBreite = "";
function barMelden() {
  const r = $("bar").getBoundingClientRect();
  const k = Math.round(r.left) + "|" + Math.round(r.width);
  if (k === letzteBreite) return;
  letzteBreite = k;
  api.invoke("bar-rect", { left: r.left, width: r.width });
}
new ResizeObserver(barMelden).observe($("bar"));
window.addEventListener("resize", () => ((letzteBreite = ""), barMelden()));

// ---------- Namens-Blase beim Drüberfahren ----------
const tipEl = $("tip");
let tipTimer = null;
let tipFor = null;
function showTip(el) {
  const text = el.dataset.tip;
  if (!text || dragMatch || (previewFor && el.classList.contains("app"))) return hideTip();
  tipFor = el;
  const wasShown = tipEl.classList.contains("show");
  const place = () => {
    const target = el.querySelector("img, .fallback") || el;
    const r = target.getBoundingClientRect();
    const bar = $("bar").getBoundingClientRect();
    tipEl.classList.toggle("netzwerk", el === quick);
    if (el === quick) {
      tipEl.replaceChildren(...text.split("\n").map((line) => {
        const span = document.createElement("span");
        span.textContent = line;
        return span;
      }));
    } else tipEl.textContent = text;
    const half = Math.min(tipEl.offsetWidth / 2 || 60, 180);
    const x = Math.min(Math.max(r.left + r.width / 2, half + 6), innerWidth - half - 6);
    tipEl.style.left = x + "px";
    tipEl.style.bottom = innerHeight - Math.min(r.top, bar.top) + 8 + "px";
    tipEl.classList.toggle("instant", !wasShown);
    tipEl.classList.add("show");
  };
  clearTimeout(tipTimer);
  if (wasShown) place();
  else tipTimer = setTimeout(place, 220);
}
window.OXPhideTip = () => hideTip();
function hideTip() {
  clearTimeout(tipTimer);
  tipFor = null;
  tipEl.classList.remove("show");
}
$("bar").addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (el && el !== tipFor) showTip(el);
  else if (!el) hideTip();
});
$("bar").addEventListener("mouseleave", () => {
  hideTip();
  resetMagnify();
});
api.on("mouse-left-bar", () => {
  hideTip();
  resetMagnify();
});

// ---------- Netzwerkstatus und Schnelleinstellungen ----------
const netzNamen = { ethernet: "LAN (Kabel)", wifi: "WLAN", network: "Netzwerk" };
const netzGlobus = '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>';
const netzSymbole = {
  ethernet: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4m-5 0h10"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1" class="fill"/>',
  network: netzGlobus,
  offline: '<path d="M9.8 3.3A9 9 0 0 1 20.7 14.2M3.4 9.4a9 9 0 0 0 11.2 11.2M3 12h9m3 0h6M4 4l16 16"/>',
  unknown: netzGlobus,
};

function renderNetwork() {
  const status = state.widgets.network;
  const [connection, ...otherConnections] = status?.connections || [];
  const kind = connection?.kind || (status?.unavailable ? "unknown" : "offline");
  const clean = (name) => (name || "").replace(/\s+/g, " ").trim();
  let lines = [status?.unavailable ? "Netzwerkstatus nicht verfügbar" : "Keine Netzwerkverbindung"];
  if (connection) {
    const name = clean(connection.name);
    const domain = clean(connection.domain);
    const category = { DomainAuthenticated: "Domänennetzwerk", Private: "Privates Netzwerk", Public: "Öffentliches Netzwerk" }[connection.category];
    const access = connection.internet === true ? "Internet" : connection.internet === false ? "Kein Internetzugang" : "Verbunden";
    lines = [`${netzNamen[kind]} · ${access}`];
    const detail = domain ? `Domäne: ${domain}` : category;
    const label = name && name.toLowerCase() !== domain.toLowerCase() ? name : "";
    lines.push([label, detail].filter(Boolean).join(" · ") || clean(connection.adapter));
    const second = otherConnections.find((item) => item.kind !== kind) || otherConnections[0];
    if (second) lines.push(`Auch verbunden: ${netzNamen[second.kind]} · ${clean(second.name) || clean(second.adapter)}`);
  }
  quick.dataset.network = kind;
  quick.querySelector("svg").innerHTML = netzSymbole[kind];
  quick.dataset.tip = lines.filter(Boolean).join("\n");
  quick.setAttribute("aria-label", lines.concat("Klick: Netzwerk-Menü, Rechtsklick: Windows-Schnelleinstellungen").join(". "));
  if (tipFor === quick) showTip(quick);
}

// ---------- Fenster-Vorschau ----------
// Nach kurzem Verweilen über einem Symbol mit offenen Fenstern: Vorschau-Bilder im Popup.
let previewTimer = null;
let previewFor = null;
let previewPending = null; // Symbol, für das die Wartezeit gerade läuft
$("apps").addEventListener("mouseover", (e) => {
  const b = e.target.closest(".app");
  if (!b || b.dataset.match === previewFor || b.dataset.match === previewPending) return;
  clearTimeout(previewTimer);
  previewPending = null;
  const hasWindows = state.windows.some((w) => (w.group || base(w.exe)) === b.dataset.match);
  if (!hasWindows || dragMatch) return;
  const wait = previewFor ? 60 : 450; // von Vorschau zu Vorschau ohne Wartezeit
  const match = b.dataset.match;
  previewPending = match;
  previewTimer = setTimeout(() => {
    previewPending = null;
    // das Element kann inzwischen neu gezeichnet worden sein – frisch suchen
    const el = document.querySelector(`.app[data-match="${CSS.escape(match)}"]`);
    if (!el || !el.matches(":hover")) return;
    previewFor = match;
    hideTip();
    const r = el.getBoundingClientRect();
    api.invoke("preview-show", { match, rect: { x: r.left, y: r.top, width: r.width, height: r.height } });
  }, wait);
});
$("apps").addEventListener("mouseout", (e) => {
  const von = e.target.closest(".app");
  const nach = e.relatedTarget?.closest?.(".app");
  if (!nach || nach.dataset.match !== von?.dataset.match) {
    clearTimeout(previewTimer);
    previewPending = null;
  }
});
function previewReset() {
  clearTimeout(previewTimer);
  previewFor = null;
  previewPending = null;
}
$("apps").addEventListener("mousedown", () => {
  previewReset();
  api.invoke("preview-hide");
});
api.on("mouse-left-bar", previewReset);
api.on("preview-closed", previewReset);

// ---------- Mac-artige Vergrößerung ----------
let pointerX = null;
function magnifyOn() {
  return !!state.config.look?.magnify;
}
function applyMagnify() {
  const on = magnifyOn() && pointerX !== null && !dragMatch;
  const level = state.config.look?.magnifyLevel || 1.6;
  for (const b of document.querySelectorAll(".app")) {
    const icon = b.querySelector("img, .fallback");
    if (!on) {
      b.style.width = "";
      if (icon) icon.style.transform = "";
      continue;
    }
    const r = b.getBoundingClientRect();
    const center = r.left + r.width / 2;
    const reach = 120; // Pixel, über die der Effekt ausläuft
    const d = Math.abs(pointerX - center);
    const f = d >= reach ? 0 : Math.cos((d / reach) * (Math.PI / 2));
    const s = 1 + (level - 1) * f;
    b.style.width = 44 + (s - 1) * 28 + "px";
    if (icon) icon.style.transform = `translateY(${-(s - 1) * 16}px) scale(${s})`;
  }
  if (tipFor && on) showTip(tipFor);
}
function resetMagnify() {
  pointerX = null;
  applyMagnify();
}
$("apps").addEventListener("mousemove", (e) => {
  if (!magnifyOn()) return;
  pointerX = e.clientX;
  applyMagnify();
});
$("apps").addEventListener("mouseleave", resetMagnify);

// ---------- Aussehen ----------
function applyLook() {
  const l = state.config.look || {};
  const root = document.documentElement.style;
  if (l.accent) root.setProperty("--lila", l.accent);
  if (l.barColor) root.setProperty("--bar-farbe", l.barColor);
  if (typeof l.opacity === "number") root.setProperty("--deckkraft", Math.round(l.opacity * 100) + "%");
  document.body.classList.toggle("magnify", !!l.magnify);
  document.body.classList.toggle("vollbreit", !!l.fullWidth);
  document.body.classList.toggle("autohide", !!state.config.autoHide);
  letzteBreite = "";
  requestAnimationFrame(barMelden);
}

// ---------- Widgets ----------
const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

function relative(date) {
  const diff = date - Date.now();
  const min = Math.round(diff / 60000);
  if (min < 60) return `in ${Math.max(min, 1)} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? "morgen" : `in ${d} Tagen`;
}

function renderLive() {
  const el = $("w-live");
  const v = state.widgets.live;
  el.hidden = !state.config.widgets.live || !v;
  if (el.hidden) return;
  const own = v.own;
  const others = OXPopt("live", "partner", true) ? v.liveOthers?.length || 0 : -1;
  const logo = own?.logoUrl ? `<img class="avatar" src="${esc(own.logoUrl)}" alt="">` : "";
  el.innerHTML = `${logo}<div class="stack"><span class="livepill${own?.isLive ? " on" : ""}">${own?.isLive ? "LIVE" : "OFFLINE"}</span>${others < 0 ? "" : `<span class="klein">${others ? `${others} Partner live` : "kein Partner live"}</span>`}</div>`;
  el.dataset.tip = own ? `${own.name} ist ${own.isLive ? "gerade live" : "offline"}` : "";
}

function renderStream() {
  const el = $("w-stream");
  const v = state.widgets.stream;
  el.hidden = !state.config.widgets.stream || !v;
  if (el.hidden) return;
  const s = v.next;
  if (!s) {
    el.innerHTML = `<div class="stack"><span class="klein">Streamplan</span><span class="gross">nichts geplant</span></div>`;
    return;
  }
  const start = new Date(s.starts_at);
  const end = new Date(s.ends_at);
  const running = start <= Date.now() && end > Date.now();
  const art = s.category_box_art_url && OXPopt("stream", "bild", true) ? `<img class="boxart" src="${esc(s.category_box_art_url)}" alt="">` : "";
  const when = running ? `<span class="stream-now">läuft jetzt</span>` : `${dayFmt.format(start)} ${timeFmt.format(start)} · ${relative(start)}`;
  const who = state.config.streamScope === "all" && s.ownerName ? `${esc(s.ownerName)}: ` : "";
  el.innerHTML = `${art}<div class="stack"><span class="klein">${when}</span><span class="gross">${who}${esc((s.game || s.title || "").slice(0, 28))}</span></div>`;
  el.dataset.tip = s.title || "";
}

function renderMedia() {
  const el = $("w-media");
  if (!el) return;
  el.hidden = !state.config.widgets.media;
  // Spotify schreibt „Künstler – Titel“ in den Fenstertitel
  const sp = state.windows.find((w) => base(w.exe) === "spotify.exe" && !/^spotify/i.test(w.title));
  const t = el.querySelector(".media-title");
  t.textContent = sp ? sp.title : "";
  t.dataset.tip = sp ? sp.title : "";
}

function meter(label, pct, extra) {
  return `<div class="meter${pct >= 90 ? " warn" : ""}"><div class="row"><span>${label}</span><b>${pct}%</b></div><div class="track"><i style="width:${pct}%"></i></div></div>`;
}
function renderSystem() {
  const el = $("w-system");
  const v = state.widgets.system;
  el.hidden = !state.config.widgets.system || !v;
  if (el.hidden) return;
  const gpu = OXPopt("system", "gpu", true) ? v.gpu : null;
  el.innerHTML =
    (OXPopt("system", "cpu", true) ? meter("CPU", v.cpu) : "") + (OXPopt("system", "ram", true) ? meter("RAM", v.ram) : "") + (gpu ? meter("GPU", gpu.pct) : "");
  const zeilen = [`Arbeitsspeicher: ${v.ramGb.toFixed(1)} von ${v.ramTotalGb.toFixed(1)} GB belegt`];
  if (gpu) {
    const extra = [gpu.vramGb != null ? `Grafikspeicher ${gpu.vramGb.toFixed(1)} von ${gpu.vramTotalGb.toFixed(1)} GB` : "", gpu.temp != null ? `${gpu.temp} °C` : ""].filter(Boolean);
    zeilen.push(`${gpu.name || "Grafikkarte"}: ${gpu.pct} %${extra.length ? " · " + extra.join(" · ") : ""}`);
  }
  el.dataset.tip = zeilen.join(" · ");
}

function weatherIcon(code, day) {
  if (code === 0) return day ? "☀️" : "🌙";
  if (code <= 2) return day ? "🌤️" : "☁️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67 || (code >= 80 && code <= 82)) return "🌧️";
  if (code <= 77 || code === 85 || code === 86) return "🌨️";
  return "⛈️";
}
function renderWeather() {
  const el = $("w-weather");
  const v = state.widgets.weather;
  el.hidden = !state.config.widgets.weather || !v;
  if (el.hidden) return;
  if (v.missing || v.error) {
    el.innerHTML = `<div class="stack"><span class="klein">Wetter</span><span class="gross">${v.error ? esc(v.error) : "Ort einstellen"}</span></div>`;
    el.dataset.tip = "Ort in den Dock-Einstellungen eintragen (Rechtsklick auf OX)";
    return;
  }
  el.innerHTML = `<span class="wetter-icon">${weatherIcon(v.code, v.isDay)}</span><div class="stack"><span class="gross">${v.temp}°</span><span class="klein">${v.min}° / ${v.max}°</span></div>`;
  el.dataset.tip = v.place;
}

// Claude: 5-Stunden-Fenster und Woche, dazu Hochrechnung „bei diesem Tempo“
const resetFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" });
function untilText(iso) {
  if (!iso) return "";
  const min = Math.max(0, Math.round((new Date(iso) - Date.now()) / 60000));
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} Std. ${min % 60} Min.`;
  return resetFmt.format(new Date(iso));
}
function projected(part, windowHours) {
  if (!part?.resetsAt || !part.pct) return null;
  const left = new Date(part.resetsAt) - Date.now();
  const total = windowHours * 3600_000;
  const elapsed = total - left;
  if (elapsed < total * 0.08) return null; // zu früh für eine sinnvolle Schätzung
  return Math.round(part.pct / (elapsed / total));
}
function renderClaude() {
  const el = $("w-claude");
  if (!el) return;
  const v = state.widgets.claude;
  el.hidden = !state.config.widgets.claude || !v;
  if (el.hidden) return;
  const logo = `<svg class="logo" viewBox="0 0 24 24"><path class="fill" d="M12 2.5l1.4 6.2 5.3-3.6-3.6 5.3 6.2 1.4-6.2 1.4 3.6 5.3-5.3-3.6L12 21.5l-1.4-6.2-5.3 3.6 3.6-5.3L2.7 12.2l6.2-1.4-3.6-5.3 5.3 3.6z"/></svg>`;
  if (v.error) {
    el.innerHTML = `${logo}<div class="stack"><span class="klein">Claude</span><span class="gross">${esc(v.error)}</span></div>`;
    el.dataset.tip = "Claude-Nutzung";
    return;
  }
  const row = (label, part) => {
    const pct = Math.min(100, part?.pct ?? 0);
    return `<div class="meter${pct >= 90 ? " warn" : ""}"><div class="row"><span>${label}</span><span>${part?.resetsAt ? untilText(part.resetsAt) : ""}</span><b>${pct}%</b></div><div class="track"><i style="width:${pct}%"></i></div></div>`;
  };
  el.innerHTML = `${logo}<div class="stack">${row("Sitzung", v.session)}${OXPopt("claude", "woche", true) ? row("Woche", v.week) : ""}</div>`;
  const ps = projected(v.session, 5);
  const pw = projected(v.week, 24 * 7);
  const lines = ["Claude-Nutzung" + (v.plan ? ` (${v.plan})` : "")];
  if (ps !== null) lines.push(`Sitzung bei diesem Tempo: ~${ps}% beim Reset`);
  if (pw !== null) lines.push(`Woche bei diesem Tempo: ~${pw}% beim Reset`);
  el.dataset.tip = lines.join(" · ");
}

function renderWidgets() {
  OXPWidgets.aufbauen();
  for (const fn of [renderLive, renderStream, renderClaude, renderMedia, renderSystem, renderWeather]) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
  OXPWidgets.alleZeichnen();
}

// ---------- Uhr ----------
const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
function tick() {
  const now = new Date();
  const zeit = timeFmt.format(now), datum = dateFmt.format(now);
  if ($("time").textContent !== zeit) $("time").textContent = zeit;
  if ($("date").textContent !== datum) $("date").textContent = datum;
  window.OXPWidgets?.datenDa("tick");
}
tick();
setInterval(tick, 1000);
setInterval(renderStream, 60_000); // „in X Min.“ aktuell halten

// ---------- Daten vom Hauptprozess ----------
api.on("pins", (pins) => { state.pins = pins; letzterAufbau = ""; renderApps(); });
api.on("icons", (m) => { Object.assign(state.icons, m); letzterAufbau = ""; renderApps(); });
api.on("windows", ({ list, foreground }) => { state.windows = list; state.foreground = foreground; renderApps(); renderMedia(); OXPWidgets.datenDa("windows"); });
api.on("config", (c) => { state.config = c; applyLook(); renderWidgets(); applyMagnify(); });
api.on("widget", ({ key, value }) => {
  state.widgets[key] = value;
  ({ live: renderLive, stream: renderStream, claude: renderClaude, system: renderSystem, weather: renderWeather, network: renderNetwork })[key]?.();
  OXPWidgets.datenDa(key);
});
setInterval(() => renderClaude(), 60_000); // Restzeit aktuell halten

// ---------- Automatisch ausblenden ----------
// Mittig: der OXP-Würfel kommt in der Bildschirmmitte hoch und gleitet an seinen Platz, dann erscheinen die übrigen
// Teile von der Mitte nach außen, zuletzt der Rahmen um alles (~2,3 s).
// Ganze Breite: die Leiste gleitet wie bei Windows von unten herein.
// Nur transform und opacity werden animiert (Web Animations) – kein Neuzeichnen pro Bild, daher flüssig.
let laufend = [];
function animationenStoppen() {
  for (const a of laufend) a.cancel();
  laufend = [];
}
function teile() {
  const bar = $("bar");
  const liste = [];
  for (const k of bar.children) {
    if (k.id === "apps") liste.push(...$("appsTrack").children);
    else if (k.id === "widgets") liste.push(...k.children);
    else if (!k.classList.contains("spacer")) liste.push(k);
  }
  return liste.filter((el) => el.offsetParent !== null && !el.hidden);
}
function ausfahren() {
  animationenStoppen();
  document.body.classList.remove("eingefahren");
  const bar = $("bar");
  if (document.body.classList.contains("vollbreit")) {
    laufend.push(bar.animate([{ transform: "translateY(110%)" }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.15,.85,.25,1)" }));
    return;
  }
  const mitte = innerWidth / 2;
  const wuerfel = $("start");
  const wr = wuerfel.getBoundingClientRect();
  const dx = mitte - (wr.left + wr.width / 2);
  // 1. Würfel: in der Mitte hochkommen (0–0,55 s), kurz halten, an seinen Platz gleiten (bis 1,1 s)
  laufend.push(
    wuerfel.animate(
      [
        // Tempo je Abschnitt (die Kurve gilt bis zum nächsten Schlüsselbild): hochfedern, halten, an den Platz gleiten
        { transform: `translate(${dx}px, 70px) rotate(-120deg) scale(.6)`, opacity: 0, offset: 0, easing: "cubic-bezier(.2,.9,.35,1.25)" },
        { transform: `translate(${dx}px, 0) rotate(0) scale(1)`, opacity: 1, offset: 0.45, easing: "linear" },
        { transform: `translate(${dx}px, 0) rotate(0) scale(1)`, opacity: 1, offset: 0.55, easing: "cubic-bezier(.45,0,.2,1)" },
        { transform: "none", opacity: 1, offset: 1 },
      ],
      { duration: 1200, easing: "linear", fill: "backwards" },
    ),
  );
  // 2. übrige Teile: von der Mitte nach außen nacheinander (1,0–1,8 s)
  const andere = teile().filter((el) => el !== wuerfel);
  const abstand = (el) => {
    const r = el.getBoundingClientRect();
    return Math.abs(r.left + r.width / 2 - mitte);
  };
  const weitester = Math.max(1, ...andere.map(abstand));
  for (const el of andere) {
    laufend.push(
      el.animate([{ opacity: 0, transform: "translateY(16px) scale(.55)" }, { opacity: 1, transform: "none" }], {
        duration: 380,
        delay: 1150 + (abstand(el) / weitester) * 450,
        easing: "cubic-bezier(.2,1.3,.4,1)",
        fill: "backwards",
      }),
    );
  }
  // 3. zuletzt der Rahmen um alles (1,85–2,35 s)
  laufend.push(
    bar.animate([{ opacity: 0, transform: "scale(.985, .8)" }, { opacity: 1, transform: "none" }], {
      pseudoElement: "::before",
      duration: 500,
      delay: 1950,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "backwards",
    }),
  );
}
function einfahren() {
  animationenStoppen();
  hideTip();
  resetMagnify();
  const a = $("bar").animate([{ transform: "none", opacity: 1 }, { transform: "translateY(110%)", opacity: 0 }], { duration: 240, easing: "cubic-bezier(.5,0,.75,0)" });
  laufend.push(a);
  a.onfinish = () => document.body.classList.add("eingefahren");
}
let eingefahrenJetzt = null;
api.on("einfahren", (ein) => {
  if (ein === eingefahrenJetzt) return;
  const vorher = eingefahrenJetzt;
  eingefahrenJetzt = !!ein;
  // beim ersten Mal (Start) ohne Animation
  if (vorher === null) return void document.body.classList.toggle("eingefahren", !!ein);
  ein ? einfahren() : ausfahren();
});
